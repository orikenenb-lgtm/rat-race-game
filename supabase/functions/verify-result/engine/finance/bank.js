// js/finance/bank.js — simulated Israeli bank for "מירוץ העכברים" (owner: banking & credit engineer).
// Pure, deterministic ES module: no DOM, no Date, no Math.random, no I/O. Same input ⇒ same output, bit for bit.
//
// MONEY: every amount is held internally in INTEGER AGOROT (1 ₪ = 100 agorot). Inputs are ₪ (any finite number,
// converted once with toAg). Every public ₪ field in a result is an INTEGER ₪ (for display); the exact value is in the
// sibling `…Ag` field (integer agorot). Columns of a schedule are rounded to ₪ cumulatively, so displayed rows always
// add up to the displayed total (no shekel appears or disappears on screen either).
// RATES: always DECIMALS (0.04 = 4%), annual and NOMINAL (÷12 per month) unless a field says otherwise.
//   real.js stores the BoI rate in percent (3.25) → use ratesFromReal(), which converts.
// ROUNDING: half away from zero, to the agora, at each monthly step (interest, indexation, fee). Balances never hold
// fractions of an agora, so there is no float drift: balance_after = balance_before + indexation − principal_part, exactly.
// See docs/FINANCIAL_ENGINE.md (sections "Banking & credit") for formulas and simplifications vs real Israeli rules.

/* ============================================================ money primitives */
/** Round half away from zero to an integer. */
export function rnd(x) {
  if (!Number.isFinite(x)) throw new RangeError(`not a finite number: ${x}`);
  const a = Math.floor(Math.abs(x) + 0.5 + 1e-9);   // 1e-9: 0.5 produced as 0.49999999999 by float math still rounds up
  return x < 0 ? -a : a;
}
/** ₪ (number) → integer agorot. */
export function toAg(ils) {
  if (!Number.isFinite(ils)) throw new RangeError(`amount must be a finite number of ₪, got ${ils}`);
  return rnd(ils * 100);
}
/** integer agorot → integer ₪ (half away from zero), integer arithmetic only. */
export function toIls(ag) {
  const a = Math.abs(ag);
  const v = Math.floor((a + 50) / 100);
  return ag < 0 ? -v : v;
}
/** Exact ₪ with 2 decimals (for text like "₪605.98"); a Number, safe because agorot are integers. */
export function agToIls2(ag) { return ag / 100; }
/** Split agorot amounts into integer ₪ whose sum equals toIls(sum) — cumulative rounding (no shekel lost on screen). */
export function splitIls(agList) {
  const out = []; let cum = 0, prev = 0;
  for (const a of agList) { cum += a; const c = toIls(cum); out.push(c - prev); prev = c; }
  return out;
}
/** Split an integer agorot total into n integer parts that differ by at most 1 agora (earliest parts get the extra). */
export function splitEven(totalAg, n) {
  if (!(n >= 1)) throw new RangeError('n must be ≥ 1');
  const sign = totalAg < 0 ? -1 : 1, t = Math.abs(totalAg);
  const base = Math.floor(t / n), extra = t - base * n;
  return Array.from({ length: n }, (_, i) => sign * (base + (i < extra ? 1 : 0)));
}
/** Split an integer agorot total by weights (sum ≈ 1); largest remainder ⇒ parts sum exactly to the total. */
export function splitByWeights(totalAg, weights) {
  const W = weights.reduce((s, w) => s + w, 0);
  if (!(W > 0)) throw new RangeError('weights must sum to > 0');
  const raw = weights.map((w) => (totalAg * w) / W);
  const parts = raw.map((x) => Math.floor(x));
  let left = totalAg - parts.reduce((s, p) => s + p, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k][1]]++;
  return parts;
}

/* ============================================================ deterministic math (cross-engine) */
// Math.pow/exp/log are NOT required by the JS spec to be correctly rounded, so V8 (Node server) and another browser engine may
// differ in the last bit — enough to flip a rounding to the agora once in a blue moon and break a ranked replay. Everything in
// js/finance/bank.js + invest.js therefore uses only + − × ÷, Math.sqrt/floor/round (exact by IEEE-754) and these helpers.
const LN2 = 0.6931471805599453;
/** x^n for an integer n (square-and-multiply: a fixed sequence of IEEE multiplications). */
export function ipow(x, n) {
  if (!Number.isInteger(n)) throw new RangeError('ipow: integer exponent required');
  if (n < 0) return 1 / ipow(x, -n);
  let r = 1, b = x, e = n;
  while (e > 0) { if (e & 1) r *= b; e = Math.floor(e / 2); if (e) b *= b; }
  return r;
}
/** e^x: range reduction by ln 2 + 27-term Taylor series. Relative error ~1e-15. */
export function dexp(x) {
  if (!Number.isFinite(x)) throw new RangeError('dexp: finite x required');
  if (x === 0) return 1;
  const k = Math.round(x / LN2), r = x - k * LN2;
  let term = 1, s = 1;
  for (let i = 1; i <= 27; i++) { term = (term * r) / i; s += term; }
  return s * ipow(2, k);
}
/** ln x (x > 0): scale by 2 into [0.75, 1.5), then 2·atanh((m−1)/(m+1)) series. */
export function dlog(x) {
  if (!(x > 0) || !Number.isFinite(x)) throw new RangeError('dlog: x > 0 required');
  let m = x, e = 0;
  while (m >= 1.5) { m /= 2; e++; }
  while (m < 0.75) { m *= 2; e--; }
  const t = (m - 1) / (m + 1), t2 = t * t;
  let term = t, s = 0;
  for (let i = 1; i <= 63; i += 2) { s += term / i; term *= t2; }
  return 2 * s + e * LN2;
}
/** x^y: integer y ⇒ ipow, else e^(y·ln x). */
export function dpow(x, y) {
  if (Number.isInteger(y) && Math.abs(y) <= 1e6) return ipow(x, y);
  if (x === 0) return 0;
  return dexp(y * dlog(x));
}

function checkRate(r, name = 'annualRate') {
  if (!Number.isFinite(r)) throw new RangeError(`${name} must be a number (decimal, 0.04 = 4%)`);
  if (r > 1 || r < -0.1) throw new RangeError(`${name}=${r} looks like percent — pass decimals (0.04 = 4%)`);
  return r;
}
function checkMonths(n) {
  if (!Number.isInteger(n) || n < 1 || n > 600) throw new RangeError(`months must be an integer 1..600, got ${n}`);
  return n;
}
const at = (v, i) => (Array.isArray(v) ? v[Math.min(i, v.length - 1)] : v); // per-month value: number or array (last repeats)
const round6 = (x) => Math.round(x * 1e6) / 1e6;

/* ============================================================ configuration (simplified Israel, 2026) */
export const BANK = {
  primeSpread: 0.015,         // פריים = ריבית בנק ישראל + 1.5%
  overdraftSpread: 0.06,      // מסגרת אשראי בעו"ש ≈ פריים + 6% (banks quote P+3…P+10; game uses one number)
  overLimitExtra: 0.03,       // ריבית חריגה: +3% annual on the part above the מסגרת
  savingsRate: 0.02,          // חשבון חיסכון נזיל (on-call) ≈ 2% when BoI ≈ 3.25%
  depositTaxUnlinked: 0.15,   // מס על ריבית בפיקדון שקלי לא צמוד: 15% of nominal interest
  depositTaxLinked: 0.25,     // פיקדון צמוד: 25% of the REAL interest (indexation not taxed)
  accountFee: 12,             // ₪/month עמלת ניהול חשבון (basic track ~₪10–15)
  personalLoanSpread: 0.025,  // הלוואה אישית בפריים: P + 2.5%
  personalLoanFixedSpread: 0.035, // הלוואה בריבית קבועה: BoI + 3.5% (≈ prime + 2%)
  loanOpeningFeePct: 0.005,   // עמלת פתיחת תיק להלוואה: 0.5% (min ₪100, max ₪1,000)
  loanOpeningFeeMin: 100, loanOpeningFeeMax: 1000,
  mortgageFileFee: 360,       // עמלת פתיחת תיק משכנתא — capped at ₪360 by regulation
  cardInstallmentRate: 0.12,  // תשלומי קרדיט בכרטיס: ~12% annual nominal
  freeInstallments: 3,        // merchants commonly allow up to 3 interest-free installments ("ללא ריבית")
  // mortgage defaults (2026-ish market, approximations): fixed unlinked ~4.9%, CPI-linked fixed ~3.2% real, prime −0.5%
  mortgage: { primeTrackSpread: -0.005, fixedRate: 0.049, cpiRate: 0.032, cpiYearly: 0.025, months: 300 },
  // early repayment (צו הבנקאות (עמלת פירעון מוקדם) — simplified)
  prepay: { operationalFee: 60, noNoticePct: 0.001, noticeDays: 10, discount3y: 0.2, discount5y: 0.3, variableEvery: 60 },
  // limits (הפיקוח על הבנקים): LTV by buyer, PTI ≤ 50%, ≥ 1/3 fixed rate, prime ≤ 2/3, ≤ 30 years
  limits: { ltv: { first: 0.75, upgrade: 0.70, investor: 0.50 }, pti: 0.50, ptiWarn: 0.40, minFixed: 1 / 3, maxPrime: 2 / 3, maxMonths: 360 },
};

/* ============================================================ credit score hooks (score lives in st.life.creditScore) */
// Deltas mirror ENGINE.md "Credit score" where they overlap; the engine (life.js) owns and clamps the score.
export const CREDIT_DELTAS = {
  cleanMonth: +2, loanRepaid: +6, prepay: +6, forcedLoan: -25, cardUnpaid: -4,
  overLimit: -10, missedPayment: -30, depositOpened: +1, bailout: -80,
};
/** Annual rate spread for a credit score (ENGINE.md bands). null ⇒ the bank refuses new voluntary credit. */
export function creditSpread(score) {
  if (score >= 760) return -0.005;
  if (score >= 680) return 0;
  if (score >= 600) return 0.0075;
  if (score >= 520) return 0.015;
  return null;
}

/* ============================================================ rates */
export function primeFromBoi(boiRate) { return round6(checkRate(boiRate, 'boiRate') + BANK.primeSpread); }
/**
 * Rates for a real month from js/data/real.js (pass the module: pure, nothing is imported here).
 * @returns {{boi, prime, cpiYearly, cpiMonthly}} decimals. cpiYearly = trailing-12-month CPI change.
 */
export function ratesFromReal(real, ym) {
  const boi = real.seriesAt('boiRate', ym) / 100;
  const n = typeof ym === 'number' ? ym : null;
  const prevYm = n !== null ? n - 12 : real.ymAdd(ym, -12);
  const cpiYearly = real.seriesAt('cpiIL', ym) / real.seriesAt('cpiIL', prevYm) - 1;
  return { boi: round6(boi), prime: primeFromBoi(boi), cpiYearly: round6(cpiYearly), cpiMonthly: round6(dpow(1 + cpiYearly, 1 / 12) - 1) };
}
/** Average yearly CPI change over the `years` ending at ym (real.js). */
export function cpiTrend(real, ym, years = 10) {
  const end = real.seriesAt('cpiIL', ym), start = real.seriesAt('cpiIL', real.ymAdd(ym, -12 * years));
  return round6(dpow(end / start, 1 / years) - 1);
}

/* ============================================================ amortization */
/** Spitzer (annuity) payment for a balance (float, agorot), monthly rate m, n months. */
export function pmt(balance, m, n) {
  if (n <= 0) return balance;
  if (Math.abs(m) < 1e-12) return balance / n;
  return (balance * m) / (1 - ipow(1 + m, -n));
}

/**
 * Amortization schedule (לוח סילוקין).
 * @param {object} p
 * @param {number} p.principal          ₪
 * @param {number|number[]} p.annualRate decimal; an array = per-month rate (variable/prime track; last value repeats)
 * @param {number} p.months             1..600
 * @param {'spitzer'|'equal'} [p.method] שפיצר (equal payments) | קרן שווה (equal principal parts)
 * @param {number|number[]} [p.cpiMonthly] CPI change per month (צמוד מדד): balance is indexed before interest
 * @param {number} [p.openingFee] ₪ once · @param {number} [p.monthlyFee] ₪/month (fees are NOT in the rows; see totals)
 * @param {number} [p.payment] ₪ — Spitzer only: keep this fixed payment (e.g. after a "shorten the term" prepayment);
 *   the last row closes whatever is left (smaller, or a balloon if the payment is too low for `months`).
 * @returns {{method, months, principal, principalAg, payment, paymentAg, lastPayment, lastPaymentAg, totalInterest,
 *   totalInterestAg, totalIndexation, totalIndexationAg, totalPaid, totalPaidAg, totalFees, totalCost, rows}}
 *   rows[i] = {n, payment, interest, principal, indexation, balance, paymentAg, interestAg, principalAg, indexationAg, balanceAg}
 */
export function amortize({ principal, annualRate, months, method = 'spitzer', cpiMonthly = 0, openingFee = 0, monthlyFee = 0, payment }) {
  checkMonths(months);
  if (method !== 'spitzer' && method !== 'equal') throw new RangeError(`method must be 'spitzer' or 'equal'`);
  const P = toAg(principal);
  if (P < 0) throw new RangeError('principal must be ≥ 0');
  const fixedPay = payment == null ? null : toAg(payment);
  let bal = P, payAg = fixedPay, lastRate = null;
  const raw = [];
  for (let i = 1; i <= months; i++) {
    const rem = months - i + 1;
    const r = checkRate(at(annualRate, i - 1)) / 12;
    const c = at(cpiMonthly, i - 1) || 0;
    const idx = c ? rnd(bal * c) : 0;
    bal += idx;
    const interest = rnd(bal * r);
    let prin;
    if (method === 'spitzer') {
      if (fixedPay === null && (payAg === null || r !== lastRate || idx !== 0)) payAg = rnd(pmt(bal, r, rem)); // fixed unless rate/CPI moved
      prin = i === months ? bal : Math.max(0, Math.min(bal, payAg - interest));
    } else {
      prin = i === months ? bal : Math.floor(bal / rem);
    }
    lastRate = r;
    bal -= prin;
    raw.push({ n: i, interestAg: interest, principalAg: prin, indexationAg: idx, paymentAg: interest + prin, balanceAg: bal });
  }
  const pay = splitIls(raw.map((x) => x.paymentAg)), int = splitIls(raw.map((x) => x.interestAg));
  const ind = splitIls(raw.map((x) => x.indexationAg));
  const rows = raw.map((x, i) => ({ n: x.n, payment: pay[i], interest: int[i], principal: pay[i] - int[i], indexation: ind[i],
    balance: toIls(x.balanceAg), ...x }));
  const sum = (k) => raw.reduce((s, x) => s + x[k], 0);
  const totalInterestAg = sum('interestAg'), totalIndexationAg = sum('indexationAg'), totalPaidAg = sum('paymentAg');
  const feesAg = toAg(openingFee) + toAg(monthlyFee) * months;
  return {
    method, months, principal: toIls(P), principalAg: P,
    payment: toIls(raw[0].paymentAg), paymentAg: raw[0].paymentAg,
    lastPayment: toIls(raw[months - 1].paymentAg), lastPaymentAg: raw[months - 1].paymentAg,
    totalInterest: toIls(totalInterestAg), totalInterestAg, totalIndexation: toIls(totalIndexationAg), totalIndexationAg,
    totalPaid: toIls(totalPaidAg), totalPaidAg, totalFees: toIls(feesAg), totalFeesAg: feesAg,
    totalCost: toIls(totalInterestAg + totalIndexationAg + feesAg), rows,
  };
}

/** Monthly IRR of integer cash flows (t = 0..n), bisection — deterministic. Returns decimal per month. */
export function irr(flows, lo = -0.99, hi = 1) {
  const npv = (m) => { let s = 0, d = 1; for (const f of flows) { s += f / d; d *= 1 + m; } return s; };
  let fLo = npv(lo), fHi = npv(hi);
  if (fLo * fHi > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2, f = npv(mid);
    if (f === 0 || hi - lo < 1e-14) return mid;
    if ((f > 0) === (fLo > 0)) { lo = mid; fLo = f; } else { hi = mid; fHi = f; }
  }
  return (lo + hi) / 2;
}

/**
 * ריבית אפקטיבית: annualised IRR of what you really get vs what you really pay, fees included.
 * Same params as amortize (+ openingFee, monthlyFee). CPI-linked: computed WITHOUT indexation (a real rate), like Israeli disclosure.
 * @returns {{nominal, nominalEffective, effective, effectivePct, feesAddPct}} decimals (pct = percent, 2 decimals)
 */
export function effectiveRate({ principal, annualRate, months, method = 'spitzer', openingFee = 0, monthlyFee = 0 }) {
  const s = amortize({ principal, annualRate, months, method });
  const fee = toAg(monthlyFee);
  const flows = [s.principalAg - toAg(openingFee), ...s.rows.map((r) => -(r.paymentAg + fee))];
  const m = irr(flows);
  const r0 = at(annualRate, 0);
  const effective = round6(ipow(1 + m, 12) - 1);
  const nominalEffective = round6(ipow(1 + r0 / 12, 12) - 1);
  return { nominal: r0, nominalEffective, effective, effectivePct: Math.round(effective * 10000) / 100,
    feesAddPct: Math.round((effective - nominalEffective) * 10000) / 100 };
}

/* ============================================================ early repayment (פירעון מוקדם) */
/**
 * Prepay a loan after `atMonth` payments. Simplified צו הבנקאות (עמלת פירעון מוקדם):
 *  - operational fee (₪60) always;
 *  - no-notice fee 0.1% of the amount if notice < 10 days (not on prime);
 *  - capitalization fee (עמלת היוון) on fixed / CPI-linked / variable-between-change-points tracks:
 *      max(0, PV(remaining scheduled payments @ marketRate) − balance) × (amount / balance),
 *      discount 20% if the loan is ≥ 3 years old, 30% if ≥ 5 years; none on prime, none for variable at a change point;
 *  - CPI fee (עמלת מדדים) on CPI-linked: amount × ½ × average monthly CPI change.
 * @param {object} p — loan: principal, annualRate (number), months, method; plus
 *   atMonth (payments already made, 0..months-1), amount (₪; omit = full), track 'fixed'|'prime'|'variable'|'cpi',
 *   marketRate (current average rate for this kind of loan, decimal), noticeDays (default 30), loanAgeMonths (default atMonth),
 *   mode 'reducePayment'|'shortenTerm', cpiMonthlyAvg (CPI track).
 * @returns integers ₪: balance, amount, fee, fees{operational, noNotice, capitalization, cpi, discountPct}, cashNeeded,
 *   oldPayment, newPayment, newMonths, interestSaved, netSaving, worthIt, creditDelta, schedule (new, or null if paid off)
 */
export function prepay({ principal, annualRate, months, method = 'spitzer', atMonth, amount, track = 'fixed', marketRate,
  noticeDays = 30, loanAgeMonths, mode = 'reducePayment', cpiMonthlyAvg = 0 }) {
  checkRate(annualRate);
  if (!Number.isInteger(atMonth) || atMonth < 0 || atMonth >= months) throw new RangeError('atMonth must be 0..months-1');
  const C = BANK.prepay;
  const s = amortize({ principal, annualRate, months, method });
  const balAg = atMonth === 0 ? s.principalAg : s.rows[atMonth - 1].balanceAg;
  const amtAg = amount == null ? balAg : Math.min(balAg, Math.max(0, toAg(amount)));
  const frac = balAg > 0 ? amtAg / balAg : 0;
  const age = loanAgeMonths ?? atMonth;
  const mr = marketRate == null ? annualRate : checkRate(marketRate, 'marketRate');
  const remaining = s.rows.slice(atMonth);

  let capAg = 0;
  if (track !== 'prime' && !(track === 'variable' && atMonth % C.variableEvery === 0)) {
    // PV of the remaining scheduled payments (variable: only up to the next change point + the balance there)
    let horizon = remaining.length;
    if (track === 'variable') horizon = Math.min(horizon, C.variableEvery - (atMonth % C.variableEvery));
    const m = mr / 12;
    let pv = 0, d = 1;
    for (let k = 0; k < horizon; k++) { d *= 1 + m; pv += remaining[k].paymentAg / d; }
    if (horizon < remaining.length) pv += remaining[horizon - 1].balanceAg / d;
    capAg = Math.max(0, rnd((pv - balAg) * frac));
  }
  const discountPct = age >= 60 ? C.discount5y : age >= 36 ? C.discount3y : 0;
  capAg = capAg - rnd(capAg * discountPct);
  const opAg = amtAg > 0 ? toAg(C.operationalFee) : 0;
  const nnAg = track !== 'prime' && noticeDays < C.noticeDays ? rnd(amtAg * C.noNoticePct) : 0;
  const cpiAg = track === 'cpi' && cpiMonthlyAvg > 0 ? rnd(amtAg * 0.5 * cpiMonthlyAvg) : 0;
  const feeAg = opAg + nnAg + capAg + cpiAg;

  const oldInterestAg = remaining.reduce((t, r) => t + r.interestAg, 0);
  const restAg = balAg - amtAg, remMonths = months - atMonth;
  let sched = null, newMonths = 0;
  if (restAg > 0) {
    newMonths = remMonths;
    if (mode === 'shortenTerm') {
      const m = annualRate / 12, pay = remaining[0].paymentAg;
      if (method === 'equal') newMonths = Math.ceil(restAg / remaining[0].principalAg);
      else if (Math.abs(m) < 1e-12) newMonths = Math.ceil(restAg / pay);
      else { newMonths = 1; while (newMonths < remMonths && pmt(restAg, m, newMonths) > pay) newMonths++; } // fewest months the same payment covers
      newMonths = Math.max(1, Math.min(remMonths, newMonths));
    }
    const keepPay = mode === 'shortenTerm' && method === 'spitzer' ? remaining[0].paymentAg / 100 : undefined;
    sched = amortize({ principal: restAg / 100, annualRate, months: newMonths, method, payment: keepPay });
  }
  const newInterestAg = sched ? sched.totalInterestAg : 0;
  const savedAg = oldInterestAg - newInterestAg;
  return {
    track, balance: toIls(balAg), balanceAg: balAg, amount: toIls(amtAg), amountAg: amtAg,
    fee: toIls(feeAg), feeAg,
    fees: { operational: toIls(opAg), noNotice: toIls(nnAg), capitalization: toIls(capAg), cpi: toIls(cpiAg), discountPct },
    cashNeeded: toIls(amtAg + feeAg),
    oldPayment: toIls(remaining[0].paymentAg), newPayment: sched ? sched.payment : 0, newMonths,
    interestSaved: toIls(savedAg), netSaving: toIls(savedAg - feeAg), worthIt: savedAg - feeAg > 0,
    creditDelta: amtAg > 0 ? CREDIT_DELTAS.prepay : 0, schedule: sched,
  };
}

/* ============================================================ checking account (עו"ש) + overdraft (מסגרת) */
/** Annual overdraft rate for a BoI rate and credit score (null = no overdraft line for this score). */
export function overdraftRate(boiRate, score = 680) {
  const sp = creditSpread(score);
  return sp === null ? null : round6(primeFromBoi(boiRate) + BANK.overdraftSpread + sp);
}
/**
 * One month of a checking account. Negative balance pays overdraft interest; the part beyond `limit` pays +3% (ריבית חריגה).
 * @param {{balance:number, limit:number, annualRate:number, creditRate?:number, fee?:number}} p ₪ / decimals
 * @returns {{interest, fee, newBalance, overLimit:boolean, overLimitBy, creditDelta}} integers ₪ (interest ≥ 0 = cost)
 */
export function checkingMonth({ balance, limit = 0, annualRate, creditRate = 0, fee = BANK.accountFee }) {
  checkRate(annualRate);
  const b = toAg(balance), L = Math.max(0, toAg(limit));
  let costAg = 0, overAg = 0;
  if (b < 0) {
    const debt = -b, inside = Math.min(debt, L);
    overAg = debt - inside;
    costAg = rnd((inside * annualRate) / 12) + rnd((overAg * (annualRate + BANK.overLimitExtra)) / 12);
  } else if (creditRate) costAg = -rnd((b * creditRate) / 12);
  const feeAg = toAg(fee);
  const nb = b - costAg - feeAg;
  return { interest: toIls(costAg), interestAg: costAg, fee: toIls(feeAg), newBalance: toIls(nb), newBalanceAg: nb,
    overLimit: overAg > 0, overLimitBy: toIls(overAg), creditDelta: overAg > 0 ? CREDIT_DELTAS.overLimit : 0 };
}

/* ============================================================ savings & fixed deposits */
/** One month of a liquid savings account; tax (15%) withheld on the interest. */
export function savingsMonth({ balance, annualRate = BANK.savingsRate, taxRate = BANK.depositTaxUnlinked }) {
  checkRate(annualRate);
  const b = Math.max(0, toAg(balance));
  const g = rnd((b * annualRate) / 12), tax = g > 0 ? rnd(g * taxRate) : 0;
  return { interest: toIls(g), interestAg: g, tax: toIls(tax), taxAg: tax, net: toIls(g - tax), newBalance: toIls(b + g - tax), newBalanceAg: b + g - tax };
}

function depositInterestAg(aAg, annualRate, months, compounding) {
  if (compounding === 'monthly') {
    let b = aAg;
    for (let i = 0; i < months; i++) b += rnd((b * annualRate) / 12);
    return b - aAg;
  }
  return rnd((aAg * annualRate * months) / 12); // simple interest, paid at maturity (typical closed shekel deposit)
}
/**
 * Fixed deposit (פיקדון) held to maturity.
 * linked: CPI-linked — principal grows by cpiTotal (whole-period CPI change), annualRate is the REAL rate, tax 25% of the real interest only.
 * @returns {{amount, interest, indexation, tax, net, maturity}} integers ₪ (+ …Ag)
 */
export function fixedDeposit({ amount, annualRate, months, compounding = 'simple', linked = false, cpiTotal = 0, taxRate }) {
  checkRate(annualRate); checkMonths(months);
  const aAg = toAg(amount);
  if (aAg < 0) throw new RangeError('amount must be ≥ 0');
  const idxAg = linked ? rnd(aAg * cpiTotal) : 0;
  const gAg = depositInterestAg(aAg + idxAg, annualRate, months, compounding);
  const tr = taxRate ?? (linked ? BANK.depositTaxLinked : BANK.depositTaxUnlinked);
  const taxAg = gAg > 0 ? rnd(gAg * tr) : 0;
  const mat = aAg + idxAg + gAg - taxAg;
  return { amount: toIls(aAg), interest: toIls(gAg), interestAg: gAg, indexation: toIls(idxAg), tax: toIls(taxAg), taxAg,
    net: toIls(gAg - taxAg), maturity: toIls(mat), maturityAg: mat, creditDelta: CREDIT_DELTAS.depositOpened };
}
/**
 * Break a fixed deposit early after `elapsed` months. Simplified Israeli rule:
 *  exitEvery > 0 (פיקדון עם תחנות יציאה): you keep the interest up to the last exit point (full interest if `elapsed` is an exit point);
 *  exitEvery = 0 (סגור לגמרי): you lose all accrued interest. Plus an optional fee = feePct × amount. Principal is never touched
 *  by lost interest, but the fee can bite into it.
 * @returns {{payout, interestKept, tax, interestLost, fee, penalty, atExitPoint}} integers ₪; penalty = interestLost(after tax) + fee
 */
export function breakDeposit({ amount, annualRate, months, elapsed, exitEvery = 0, feePct = 0, compounding = 'simple', taxRate = BANK.depositTaxUnlinked }) {
  checkRate(annualRate); checkMonths(months);
  if (!Number.isInteger(elapsed) || elapsed < 0) throw new RangeError('elapsed must be an integer ≥ 0');
  if (elapsed >= months) { const f = fixedDeposit({ amount, annualRate, months, compounding, taxRate }); return { payout: f.maturity, payoutAg: f.maturityAg, interestKept: f.interest, tax: f.tax, interestLost: 0, fee: 0, penalty: 0, penaltyAg: 0, atExitPoint: true }; }
  const aAg = toAg(amount);
  const kept = exitEvery > 0 ? Math.floor(elapsed / exitEvery) * exitEvery : 0;
  const atExit = exitEvery > 0 && elapsed % exitEvery === 0;
  const fullAg = elapsed > 0 ? depositInterestAg(aAg, annualRate, elapsed, compounding) : 0;
  const keptAg = kept > 0 ? depositInterestAg(aAg, annualRate, kept, compounding) : 0;
  const tax = (g) => (g > 0 ? rnd(g * taxRate) : 0);
  const feeAg = atExit ? 0 : rnd(aAg * feePct);
  const lostNetAg = (fullAg - tax(fullAg)) - (keptAg - tax(keptAg));
  const payoutAg = aAg + keptAg - tax(keptAg) - feeAg;
  return { payout: toIls(payoutAg), payoutAg, interestKept: toIls(keptAg), tax: toIls(tax(keptAg)), interestLost: toIls(fullAg - keptAg),
    fee: toIls(feeAg), penalty: toIls(lostNetAg + feeAg), penaltyAg: lostNetAg + feeAg, atExitPoint: atExit };
}

/* ============================================================ credit card installments (תשלומים) */
/**
 * Split a card purchase into installments. count ≤ freeInstallments (3) and no rate ⇒ "ללא ריבית": equal parts, the extra
 * agorot on the first installment (as Israeli card companies do). Otherwise "תשלומי קרדיט": Spitzer at annualRate.
 * @returns {{count, first, perInstallment, total, interest, amounts:[₪...] (sum === total), amountsAg, effectivePct}}
 */
export function installments({ price, count, annualRate }) {
  checkMonths(count);
  const pAg = toAg(price);
  const rate = annualRate ?? (count <= BANK.freeInstallments ? 0 : BANK.cardInstallmentRate);
  checkRate(rate);
  let amountsAg;
  if (rate === 0) {
    const base = Math.floor(pAg / count);
    amountsAg = Array.from({ length: count }, (_, i) => base + (i === 0 ? pAg - base * count : 0));
  } else amountsAg = amortize({ principal: pAg / 100, annualRate: rate, months: count }).rows.map((r) => r.paymentAg);
  const totalAg = amountsAg.reduce((s, a) => s + a, 0);
  const eff = rate === 0 ? 0 : effectiveRate({ principal: pAg / 100, annualRate: rate, months: count }).effectivePct;
  return { count, annualRate: rate, first: toIls(amountsAg[0]), perInstallment: toIls(amountsAg[count - 1]), total: toIls(totalAg), totalAg,
    interest: toIls(totalAg - pAg), interestAg: totalAg - pAg, amounts: splitIls(amountsAg), amountsAg, effectivePct: eff };
}

/* ============================================================ personal loans */
export function loanOpeningFee(principal) {
  return Math.min(BANK.loanOpeningFeeMax, Math.max(BANK.loanOpeningFeeMin, toIls(rnd(toAg(principal) * BANK.loanOpeningFeePct))));
}
/**
 * A personal-loan offer from the bank (what a "bank" tile shows before you sign).
 * track 'prime' (variable: prime + 2.5%) | 'fixed' (BoI + 3.5%); both + creditSpread(score).
 * @returns {{ok, reason?, track, annualRate, payment, totalInterest, totalPaid, openingFee, effectivePct, variable:boolean, schedule}}
 */
export function loanOffer({ principal, months, track = 'prime', boiRate, creditScore = 680, method = 'spitzer', openingFee }) {
  checkRate(boiRate, 'boiRate');
  const sp = creditSpread(creditScore);
  if (sp === null) return { ok: false, track, reason: `דירוג האשראי שלך (${Math.round(creditScore)}) נמוך מדי — הבנק לא מאשר הלוואה חדשה` };
  const base = track === 'prime' ? primeFromBoi(boiRate) + BANK.personalLoanSpread : boiRate + BANK.personalLoanFixedSpread;
  const annualRate = round6(Math.max(0, base + sp));
  const fee = openingFee ?? loanOpeningFee(principal);
  const s = amortize({ principal, annualRate, months, method, openingFee: fee });
  const e = effectiveRate({ principal, annualRate, months, method, openingFee: fee });
  return { ok: true, track, annualRate, payment: s.payment, totalInterest: s.totalInterest, totalPaid: s.totalPaid, openingFee: fee,
    effectivePct: e.effectivePct, variable: track === 'prime', schedule: s };
}

/* ============================================================ mortgages (משכנתא) */
export const TRACK_NAMES = { prime: 'פריים', fixed: 'קבועה לא צמודה', cpi: 'קבועה צמודה למדד', variable: 'משתנה כל 5 שנים' };
/**
 * Split a mortgage into tracks (מסלולים) and amortize each.
 * @param {object} p principal ₪, months (≤360), mix {prime, fixed, cpi} shares summing to 1, boiRate (decimal),
 *   rates? {fixed, cpi (real), primeTrackSpread}, cpiYearly (expected CPI, decimal), method.
 * Prime track rate = prime + primeTrackSpread (follows the BoI rate: pass `primePath` = array of future annual prime-track rates to replay history).
 * CPI track: balance indexed monthly by (1+cpiYearly)^(1/12)−1 (simplified, constant unless `cpiPath` array given).
 * @returns {{tracks:[{id,name,share,principal,annualRate,linked,payment,totalInterest,totalIndexation,totalPaid,schedule}],
 *   payment, totalPaid, totalInterest, totalIndexation, fileFee, stress:{primePlus2, cpiPlus2}, rules:{ok, issues[]}}}
 */
export function mortgageTracks({ principal, months = BANK.mortgage.months, mix = { prime: 1 / 3, fixed: 1 / 3, cpi: 1 / 3 }, boiRate,
  rates = {}, cpiYearly = BANK.mortgage.cpiYearly, method = 'spitzer', primePath, cpiPath }) {
  checkRate(boiRate, 'boiRate'); checkMonths(months);
  const R = { ...BANK.mortgage, ...rates };
  const ids = Object.keys(mix).filter((k) => mix[k] > 0);
  for (const k of ids) if (!TRACK_NAMES[k] || k === 'variable') throw new RangeError(`unknown track ${k} (prime|fixed|cpi)`);
  const total = ids.reduce((s, k) => s + mix[k], 0);
  if (Math.abs(total - 1) > 1e-6) throw new RangeError(`mix shares must sum to 1, got ${total}`);
  const parts = splitByWeights(toAg(principal), ids.map((k) => mix[k]));
  const primeRate = round6(primeFromBoi(boiRate) + R.primeTrackSpread);
  const build = (id, pAg, bump = 0, cpiBump = 0) => {
    const linked = id === 'cpi';
    const annualRate = id === 'prime' ? (primePath && !bump ? primePath : primeRate + bump) : id === 'fixed' ? R.fixedRate : R.cpiRate;
    const cpiMonthly = linked ? (cpiPath && !cpiBump ? cpiPath : round6(dpow(1 + cpiYearly + cpiBump, 1 / 12) - 1)) : 0;
    return amortize({ principal: pAg / 100, annualRate, months, method, cpiMonthly });
  };
  const tracks = ids.map((id, i) => {
    const s = build(id, parts[i]);
    return { id, name: TRACK_NAMES[id], share: mix[id], principal: toIls(parts[i]), principalAg: parts[i],
      annualRate: id === 'prime' ? primeRate : id === 'fixed' ? R.fixedRate : R.cpiRate, linked: id === 'cpi',
      payment: s.payment, paymentAg: s.paymentAg, totalInterest: s.totalInterest, totalIndexation: s.totalIndexation, totalPaid: s.totalPaid, schedule: s };
  });
  const sumAg = (k) => tracks.reduce((t, x) => t + x.schedule[k], 0);
  // stress: prime +2% from month 1 (payment), and CPI +2%/yr (payment after 10 years)
  const primePlus2Ag = tracks.reduce((t, x, i) => t + (x.id === 'prime' ? build('prime', parts[i], 0.02).paymentAg : x.paymentAg), 0);
  const y10 = Math.min(months, 121) - 1;
  const cpiPlus2Ag = tracks.reduce((t, x, i) => t + (x.id === 'cpi' ? build('cpi', parts[i], 0, 0.02) : x.schedule).rows[y10].paymentAg, 0);
  const issues = [];
  const fixedShare = (mix.fixed || 0) + (mix.cpi || 0);
  if (fixedShare < BANK.limits.minFixed - 1e-9) issues.push('לפחות שליש מהמשכנתא חייב להיות בריבית קבועה');
  if ((mix.prime || 0) > BANK.limits.maxPrime + 1e-9) issues.push('לכל היותר שני שלישים מהמשכנתא יכולים להיות בפריים');
  if (months > BANK.limits.maxMonths) issues.push('משכנתא ארוכה מ־30 שנה אינה מותרת');
  return {
    tracks, months, primeRate, cpiYearly,
    payment: toIls(sumAg('paymentAg')), paymentAg: sumAg('paymentAg'),
    totalPaid: toIls(sumAg('totalPaidAg')), totalInterest: toIls(sumAg('totalInterestAg')), totalIndexation: toIls(sumAg('totalIndexationAg')),
    fileFee: BANK.mortgageFileFee,
    stress: { primePlus2: toIls(primePlus2Ag), cpiPlus2Year10: toIls(cpiPlus2Ag), baseYear10: toIls(tracks.reduce((t, x) => t + x.schedule.rows[y10].paymentAg, 0)) },
    rules: { ok: issues.length === 0, issues },
  };
}

/**
 * Will the bank approve? LTV (מימון) by buyer type and PTI (החזר מהכנסה) ≤ 50% of net household income.
 * @returns {{ok, ltv, pti, maxPrincipal, issues:[Hebrew], warnings:[Hebrew]}} ltv/pti decimals (4 places)
 */
export function mortgageCheck({ price, principal, netIncome, payment, buyer = 'first' }) {
  const L = BANK.limits;
  const maxLtv = L.ltv[buyer];
  if (maxLtv == null) throw new RangeError(`buyer must be first|upgrade|investor`);
  const ltv = price > 0 ? Math.round((principal / price) * 1e4) / 1e4 : 1;
  const pti = netIncome > 0 ? Math.round((payment / netIncome) * 1e4) / 1e4 : Infinity;
  const issues = [], warnings = [];
  if (ltv > maxLtv + 1e-9) issues.push(`הבנק מממן עד ${Math.round(maxLtv * 100)}% משווי הנכס — צריך הון עצמי של לפחות ₪${Math.ceil(price * (1 - maxLtv)).toLocaleString('en-US')}`);
  if (pti > L.pti + 1e-9) issues.push('ההחזר החודשי גבוה מ־50% מההכנסה הפנויה — הבנק לא יאשר');
  else if (pti > L.ptiWarn) warnings.push('ההחזר מעל 40% מההכנסה — כל עלייה בריבית או במדד תכאב');
  return { ok: issues.length === 0, ltv, pti, maxPrincipal: Math.floor(price * maxLtv), issues, warnings };
}

/* ============================================================ monthly fees */
/** Bank fees for one month (₪, integer). Simplified: account fee + ₪x per teller action beyond the free quota. */
export function monthlyFees({ plan = 'basic', tellerActions = 0 } = {}) {
  const account = plan === 'digital' ? 0 : plan === 'premium' ? 30 : BANK.accountFee;
  const teller = Math.max(0, tellerActions - 2) * 7;
  return { account, teller, total: account + teller };
}
