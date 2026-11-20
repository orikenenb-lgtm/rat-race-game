// js/finance/invest.js — simulated investments for "מירוץ העכברים" (owner: banking & credit engineer).
// Pure, deterministic ES module: no DOM, no Date, no Math.random. Money conventions are bank.js's: integer agorot inside,
// integer ₪ in every public ₪ field (exact value in the sibling …Ag field). Rates/returns are DECIMALS (0.07 = 7%).
// NOTHING HERE IS A PROMISE: every "return" is an assumption or a past statistic. Projections carry `guaranteed:false`
// and a Hebrew `note`; prefer showing projectRange() (bad / typical / good) over a single number.
import { rnd, toAg, toIls, ipow, dexp, dlog, dpow } from './bank.js';

export const NOTE_NO_GUARANTEE = 'תחזית בלבד — אין תשואה מובטחת. תשואות עבר אינן מבטיחות תשואות בעתיד.';

/* ============================================================ configuration */
export const INVEST = {
  capitalGainsTax: 0.25,   // מס רווח הון: 25% of the REAL gain (individual, securities). Game default mode: 'real' here; engine may use 'nominal'.
  dividendTax: 0.25,       // מס על דיבידנד (individual, non-controlling holder)
  commissionPct: 0.001,    // עמלת קנייה/מכירה: 0.1% of the order …
  minCommission: 5,        // … minimum ₪5 per order (typical Israeli online broker, simplified)
  custodyFeeYear: 0,       // דמי משמרת — many brokers now charge 0; kept as a knob
};

// Long-run characteristics used for teaching & pre-drawing paths. `ret` = assumed long-run annual (geometric) return,
// `vol` = annual volatility. Typical, NOT guaranteed. Index ≈ S&P 500 / TA-125 history (see seriesRisk on real.js).
export const INSTRUMENTS = {
  deposit:   { name: 'פיקדון בנקאי',          risk: 1, liquidity: 'בסוף התקופה (שבירה = קנס)', ret: 0.03,  vol: 0,    mgmtFee: 0 },
  govBond:   { name: 'אג"ח ממשלתי',           risk: 2, liquidity: 'יומית',  ret: 0.035, vol: 0.05, mgmtFee: 0 },
  corpBond:  { name: 'אג"ח קונצרני',          risk: 3, liquidity: 'יומית',  ret: 0.05,  vol: 0.08, mgmtFee: 0 },
  index:     { name: 'קרן סל מחקה מדד',       risk: 3, liquidity: 'יומית',  ret: 0.07,  vol: 0.16, mgmtFee: 0.002 },
  stock:     { name: 'מניה בודדת',            risk: 4, liquidity: 'יומית',  ret: 0.07,  vol: 0.35, mgmtFee: 0 },
  realEstate:{ name: 'נדל"ן להשקעה',          risk: 3, liquidity: 'חודשים (מכירה איטית ויקרה)', ret: 0.05, vol: 0.08, mgmtFee: 0 },
  crypto:    { name: 'קריפטו',                risk: 5, liquidity: 'מיידית', ret: 0.0,   vol: 0.75, mgmtFee: 0 },
  cash:      { name: 'מזומן / עו"ש',          risk: 1, liquidity: 'מיידית', ret: 0.0,   vol: 0,    mgmtFee: 0 },
};
// crypto ret 0: there is no cash flow behind it, so the teaching model assumes no drift — only volatility.

const r4 = (x) => Math.round(x * 1e4) / 1e4;
const r6 = (x) => Math.round(x * 1e6) / 1e6;
function checkRet(r, name) {
  if (!Number.isFinite(r) || r > 2 || r < -0.99) throw new RangeError(`${name}=${r}: pass decimals (0.07 = 7%)`);
  return r;
}

/* ============================================================ fees & taxes */
/** Commission for one buy/sell order (₪, integer agorot exact in commissionAg). */
export function tradeCost({ amount, commissionPct = INVEST.commissionPct, minCommission = INVEST.minCommission }) {
  const aAg = Math.abs(toAg(amount));
  const cAg = aAg === 0 ? 0 : Math.max(toAg(minCommission), rnd(aAg * commissionPct));
  return { commission: toIls(cAg), commissionAg: cAg };
}

/**
 * מס רווח הון (simplified Israeli rule for an individual on securities).
 *  mode 'real': only the REAL gain is taxed — the part of the gain that just kept up with the CPI (cpiSell/cpiBuy) is exempt;
 *    nominal gain but real loss ⇒ no tax and no loss; nominal loss ⇒ the nominal loss is carried forward.
 *  mode 'nominal': 25% of the nominal gain (what the v3 engine does today — simpler for kids, documented).
 *  lossCarry (₪, ≥ 0) from earlier sales offsets this gain first.
 * @returns {{nominalGain, inflationPart, realGain, taxable, tax, net, lossCarryOut}} integers ₪
 */
export function capitalGainsTax({ cost, proceeds, cpiBuy = 1, cpiSell = 1, mode = 'real', lossCarry = 0, rate = INVEST.capitalGainsTax }) {
  const cAg = toAg(cost), pAg = toAg(proceeds), carryAg = Math.max(0, toAg(lossCarry));
  const nominal = pAg - cAg;
  const infl = mode === 'real' && nominal > 0 ? Math.max(0, rnd(cAg * (cpiSell / cpiBuy - 1))) : 0;
  const real = nominal - infl;
  let taxable = 0, carryOut = carryAg;
  if (nominal < 0) carryOut = carryAg - nominal;              // carry the loss
  else if (real > 0) { const off = Math.min(carryAg, real); taxable = real - off; carryOut = carryAg - off; }
  const tax = rnd(taxable * rate);
  return { nominalGain: toIls(nominal), inflationPart: toIls(Math.min(infl, Math.max(0, nominal))), realGain: toIls(real),
    taxable: toIls(taxable), tax: toIls(tax), taxAg: tax, net: toIls(pAg - tax), netAg: pAg - tax, lossCarryOut: toIls(carryOut) };
}

/** Dividend paid on a holding, 25% withheld. */
export function dividend({ units, perUnit, taxRate = INVEST.dividendTax }) {
  const g = rnd(units * perUnit * 100), t = rnd(g * taxRate);
  return { gross: toIls(g), tax: toIls(t), net: toIls(g - t), netAg: g - t };
}

/* ============================================================ compounding */
function monthlyRate(annualReturn, rateMode) {
  return rateMode === 'nominal' ? annualReturn / 12 : dpow(1 + annualReturn, 1 / 12) - 1;
}
function fvClosed(pv, c, m, n, begin) {
  const g = ipow(1 + m, n);
  const ann = Math.abs(m) < 1e-15 ? n : (g - 1) / m;
  return pv * g + c * ann * (begin ? 1 + m : 1);
}
/**
 * Future value of a lump sum + a monthly deposit (ריבית דריבית). Closed form, rounded ONCE per reported point (no drift).
 * @param {object} p pv ₪, monthly ₪, annualReturn (decimal), years or months, timing 'end'|'begin',
 *   rateMode 'effective' (default: annualReturn is a yearly growth, monthly = (1+R)^(1/12)−1) | 'nominal' (R/12, bank style),
 *   mgmtFee yearly decimal (דמי ניהול) — taken monthly from the balance.
 * @returns {{value, contributed, growth, feeDrag, path:[{year, value, contributed}], guaranteed:false, note}} integers ₪
 */
export function futureValue({ pv = 0, monthly = 0, annualReturn, years, months, timing = 'end', rateMode = 'effective', mgmtFee = 0 }) {
  checkRet(annualReturn, 'annualReturn');
  const n = months ?? Math.round(years * 12);
  if (!Number.isInteger(n) || n < 0 || n > 1200) throw new RangeError('months must be an integer 0..1200');
  const m0 = monthlyRate(annualReturn, rateMode);
  const fm = 1 - dpow(1 - mgmtFee, 1 / 12);
  const m = (1 + m0) * (1 - fm) - 1;
  const pvA = toAg(pv), cA = toAg(monthly), begin = timing === 'begin';
  const valAt = (k, rate) => rnd(fvClosed(pvA, cA, rate, k, begin));
  const value = valAt(n, m), noFee = valAt(n, m0);
  const contributed = pvA + cA * n;
  const path = [];
  for (let k = 0; k <= n; k += 12) path.push({ year: k / 12, value: toIls(valAt(k, m)), contributed: toIls(pvA + cA * k) });
  if (n % 12) path.push({ year: r4(n / 12), value: toIls(value), contributed: toIls(contributed) });
  return { value: toIls(value), valueAg: value, contributed: toIls(contributed), growth: toIls(value - contributed),
    feeDrag: toIls(noFee - value), monthlyRate: r6(m), path, guaranteed: false, note: NOTE_NO_GUARANTEE };
}

// standard normal CDF / inverse (deterministic approximations, |err| < 1e-7 / 4.5e-4)
export function normCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * dexp(-z * z / 2);
  const p = d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}
const Z = { p10: -1.2815516, p50: 0, p90: 1.2815516 };

/**
 * Bad / typical / good outcome range for a lump sum + monthly deposits in a volatile asset (for the futureValue visual).
 * Model: log-normal growth with median annual return `annualReturn` and annual volatility `vol`; each deposit is placed at the
 * same percentile (comonotonic approximation — a teaching range, not a forecast). Also the chance to end below what you put in.
 * @returns {{p10, p50, p90, contributed, lossChance, path:[{year,p10,p50,p90,contributed}], guaranteed:false, note}}
 */
export function projectRange({ pv = 0, monthly = 0, years, annualReturn = INSTRUMENTS.index.ret, vol = INSTRUMENTS.index.vol, mgmtFee = 0 }) {
  checkRet(annualReturn, 'annualReturn');
  const n = Math.round(years * 12);
  if (!(n >= 1 && n <= 1200)) throw new RangeError('years must give 1..1200 months');
  const g = dlog(1 + annualReturn) + dlog(1 - mgmtFee); // median log growth per year
  const at = (z, k) => { // value after k months at percentile z
    let v = pv * dexp(g * k / 12 + z * vol * Math.sqrt(k / 12));
    for (let j = 1; j <= k; j++) { const t = (k - j) / 12; v += monthly * dexp(g * t + z * vol * Math.sqrt(t)); }
    return toIls(toAg(v));
  };
  const contributed = toIls(toAg(pv + monthly * n));
  // chance the lump-sum-equivalent ends below cost: P(log return < 0) over the money-weighted average horizon
  const avgT = (pv * n + monthly * (n * (n - 1)) / 2) / Math.max(1e-9, (pv + monthly * n)) / 12;
  const lossChance = avgT > 0 && vol > 0 ? r4(normCdf(-g * avgT / (vol * Math.sqrt(avgT)))) : g < 0 ? 1 : 0;
  const path = [];
  for (let k = 0; k <= n; k += 12) path.push({ year: k / 12, p10: at(Z.p10, k), p50: at(Z.p50, k), p90: at(Z.p90, k), contributed: toIls(toAg(pv + monthly * k)) });
  return { p10: at(Z.p10, n), p50: at(Z.p50, n), p90: at(Z.p90, n), contributed, lossChance, path, guaranteed: false, note: NOTE_NO_GUARANTEE };
}

/**
 * Dollar-cost averaging (השקעה חודשית קבועה) through a price path vs investing everything at the first price.
 * Fractional units (6 decimals) unless wholeUnits; leftover cash (whole units) rolls to the next month and is reported.
 * Conservation: invested === spentOnUnits + fees + leftover (agorot, exact).
 * @returns {{invested, fees, units, avgCost, avgCostAg, value, gain, leftover, lumpSum:{units, fees, value, gain}, buys:[{i, price, units}]}}
 */
export function dca({ prices, amount, commissionPct = INVEST.commissionPct, minCommission = INVEST.minCommission, wholeUnits = false }) {
  if (!Array.isArray(prices) || prices.length === 0 || prices.some((p) => !(p > 0))) throw new RangeError('prices must be positive numbers');
  const aAg = toAg(amount);
  let cash = 0, units = 0, fees = 0, spent = 0;
  const buys = [];
  const buy = (budgetAg, priceAg) => {
    const fee = budgetAg > 0 ? tradeCost({ amount: budgetAg / 100, commissionPct, minCommission }).commissionAg : 0;
    const net = Math.max(0, budgetAg - fee);
    let u = wholeUnits ? Math.floor(net / priceAg) : Math.floor((net / priceAg) * 1e6) / 1e6;
    let cost = wholeUnits ? u * priceAg : net; // fractional: whole net amount buys units (sub-micro-unit dust stays in the fund)
    if (u <= 0) return { u: 0, cost: 0, fee: 0 };
    return { u, cost, fee };
  };
  prices.forEach((p, i) => {
    cash += aAg;
    const r = buy(cash, toAg(p));
    units = r6(units + r.u); fees += r.fee; spent += r.cost; cash -= r.cost + r.fee;
    buys.push({ i, price: p, units: r.u });
  });
  const invested = aAg * prices.length;
  const last = toAg(prices[prices.length - 1]);
  const valueAg = rnd(units * last);
  const ls = buy(invested, toAg(prices[0]));
  const lsLeft = invested - ls.cost - ls.fee;
  const lsValue = rnd(ls.u * last) + lsLeft;
  return { invested: toIls(invested), investedAg: invested, fees: toIls(fees), feesAg: fees, spentAg: spent, units,
    avgCost: units > 0 ? toIls(rnd(spent / units)) : 0, avgCostAg: units > 0 ? rnd(spent / units) : 0,
    value: toIls(valueAg + cash), valueAg: valueAg + cash, gain: toIls(valueAg + cash - invested), leftover: toIls(cash), leftoverAg: cash,
    lumpSum: { units: ls.u, fees: toIls(ls.fee), value: toIls(lsValue), gain: toIls(lsValue - invested) }, buys, guaranteed: false };
}

/* ============================================================ bonds (אג"ח) */
export const BOND_KINDS = {
  gov:     { name: 'אג"ח ממשלתי', spread: 0,     defaultYearly: 0,     note: 'מדינת ישראל — הסיכון הנמוך ביותר בשקלים' },
  corpAA:  { name: 'אג"ח קונצרני בדירוג גבוה', spread: 0.012, defaultYearly: 0.002, note: 'חברה חזקה — מעט יותר תשואה, מעט יותר סיכון' },
  corpBBB: { name: 'אג"ח קונצרני בדירוג נמוך (זבל)', spread: 0.04, defaultYearly: 0.025, note: 'תשואה גבוהה כי יש סיכוי אמיתי שהחברה לא תחזיר' },
};
/** Price of a bond as % of face (4 decimals) and the ₪ value of `face`. couponRate/ytm decimals, years to maturity, freq coupons/year. */
export function bondPrice({ face = 100, couponRate, ytm, years, freq = 1 }) {
  checkRet(ytm, 'ytm'); checkRet(couponRate, 'couponRate');
  const n = Math.round(years * freq), y = ytm / freq, c = (100 * couponRate) / freq;
  let p = 0;
  let d = 1;
  for (let k = 1; k <= n; k++) { d *= 1 + y; p += c / d; }
  p += 100 / d;
  const pricePct = r4(p);
  return { pricePct, value: toIls(rnd((face * p))), valueAg: rnd(face * p) };
}
/** Yield to maturity (decimal, 6 places) from a price (% of face). Bisection. */
export function bondYield({ pricePct, couponRate, years, freq = 1 }) {
  let lo = -0.5, hi = 2;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    if (bondPrice({ couponRate, ytm: mid, years, freq }).pricePct > pricePct) lo = mid; else hi = mid;
    if (hi - lo < 1e-10) break;
  }
  return r6((lo + hi) / 2);
}
/** Macaulay and modified duration (years, 3 decimals) — "how many % the price moves for 1% change in rates". */
export function bondDuration({ couponRate, ytm, years, freq = 1 }) {
  const n = Math.round(years * freq), y = ytm / freq, c = (100 * couponRate) / freq;
  let p = 0, w = 0;
  let df = 1;
  for (let k = 1; k <= n; k++) { df *= 1 + y; const cf = c + (k === n ? 100 : 0), d = cf / df; p += d; w += (k / freq) * d; }
  const mac = w / p;
  return { macaulay: Math.round(mac * 1000) / 1000, modified: Math.round((mac / (1 + y)) * 1000) / 1000 };
}
/** Rates move by dy (decimal): exact price change vs the duration approximation (both in % of price, 2 decimals). */
export function bondRateShock({ couponRate, ytm, years, dy, freq = 1 }) {
  const p0 = bondPrice({ couponRate, ytm, years, freq }).pricePct, p1 = bondPrice({ couponRate, ytm: ytm + dy, years, freq }).pricePct;
  const d = bondDuration({ couponRate, ytm, years, freq });
  return { before: p0, after: p1, exactPct: Math.round(((p1 / p0) - 1) * 1e4) / 100, approxPct: Math.round(-d.modified * dy * 1e4) / 100, duration: d.modified };
}
/** Expected yearly return of a bond kind after expected default losses (loss given default 60%). Not guaranteed. */
export function bondExpectedReturn({ kind = 'gov', govYield }) {
  const k = BOND_KINDS[kind];
  if (!k) throw new RangeError('kind must be gov|corpAA|corpBBB');
  const ytm = govYield + k.spread;
  return { ytm: r6(ytm), expected: r6(ytm - k.defaultYearly * 0.6), defaultYearly: k.defaultYearly, guaranteed: false };
}

/* ============================================================ real estate (נדל"ן) */
// מס רכישה — simplified brackets (thresholds frozen 2024–2027, rounded). first = דירה יחידה, investor = דירה נוספת.
export const PURCHASE_TAX = {
  first: [[1978745, 0], [2347040, 0.035], [6055070, 0.05], [20183565, 0.08], [Infinity, 0.10]],
  investor: [[6055070, 0.08], [Infinity, 0.10]],
};
export function purchaseTax({ price, buyer = 'investor' }) {
  const br = PURCHASE_TAX[buyer === 'first' ? 'first' : 'investor'];
  let lo = 0, t = 0;
  for (const [up, rate] of br) { if (price > lo) t += (Math.min(price, up) - lo) * rate; lo = up; }
  return toIls(toAg(t));
}
/**
 * Net yield of a rental property — "תשואה נטו ולא רק הכנסה משכירות".
 * @param {object} p price, monthlyRent ₪; vacancyMonths (per year, default 1); maintenancePct (of gross rent, default 8%);
 *   managementPct (of collected rent, default 0 — set 0.08 for a management company); insuranceYear ₪ (default 1,200);
 *   buyer 'investor'|'first'; closingPct (lawyer + broker, default 3%); renovation ₪;
 *   taxTrack 'auto'|'exempt'|'track10'|'none' — auto: exempt if rent ≤ ₪5,654/month else the 10% track on gross rent;
 *   mortgage {principal, annualRate, months} optional (Spitzer).
 * @returns integers ₪ + yields as decimals (4 places): grossYield, capRate, netYield, cashOnCash; lines:[{label, amount}]
 */
export function realEstateYield({ price, monthlyRent, vacancyMonths = 1, maintenancePct = 0.08, managementPct = 0, insuranceYear = 1200,
  buyer = 'investor', closingPct = 0.03, renovation = 0, taxTrack = 'auto', mortgage = null, rentalExemptUpTo = 5654 }) {
  if (!(price > 0) || !(monthlyRent >= 0)) throw new RangeError('price > 0 and monthlyRent ≥ 0 required');
  const gross = monthlyRent * 12;
  const collected = monthlyRent * Math.max(0, 12 - vacancyMonths);
  const maintenance = gross * maintenancePct, management = collected * managementPct;
  const noi = collected - maintenance - management - insuranceYear;           // before tax & financing
  const track = taxTrack === 'auto' ? (monthlyRent <= rentalExemptUpTo ? 'exempt' : 'track10') : taxTrack;
  const tax = track === 'track10' ? collected * 0.10 : 0;
  const pTax = purchaseTax({ price, buyer });
  const closing = price * closingPct;
  const totalCost = price + pTax + closing + renovation;
  const noiAfterTax = noi - tax;
  let debt = 0, equity = totalCost;
  if (mortgage && mortgage.principal > 0) {
    const m = mortgage.annualRate / 12, n = mortgage.months;
    const pay = Math.abs(m) < 1e-12 ? mortgage.principal / n : (mortgage.principal * m) / (1 - ipow(1 + m, -n));
    debt = Math.round(pay * 100) / 100 * 12; equity = totalCost - mortgage.principal;
  }
  const cash = noiAfterTax - debt;
  const I = (x) => toIls(toAg(x));
  const N = (x) => (I(x) === 0 ? 0 : -I(x)); // a cost line, never "-0"
  return {
    grossRent: I(gross), collectedRent: I(collected), vacancyLoss: I(gross - collected), maintenance: I(maintenance), management: I(management),
    insurance: I(insuranceYear), noi: I(noi), taxTrack: track, tax: I(tax), noiAfterTax: I(noiAfterTax), purchaseTax: pTax, closing: I(closing),
    totalCost: I(totalCost), debtService: I(debt), cashFlowYear: I(cash), cashFlowMonth: I(cash / 12), equity: I(equity),
    grossYield: r4(gross / price), capRate: r4(noi / price), netYield: r4(noiAfterTax / totalCost),
    cashOnCash: equity > 0 ? r4(cash / equity) : null,
    lines: [
      { label: 'שכירות שנתית (ברוטו)', amount: I(gross) }, { label: 'חודשים בלי שוכר', amount: N(gross - collected) },
      { label: 'תחזוקה ותיקונים', amount: N(maintenance) }, { label: 'דמי ניהול', amount: N(management) },
      { label: 'ביטוח', amount: N(insuranceYear) }, { label: 'מס על שכירות', amount: N(tax) },
      { label: 'החזר משכנתא', amount: N(debt) }, { label: 'נשאר לך בשנה', amount: I(cash) },
    ],
    guaranteed: false,
  };
}
/** Cap-rate valuation: value = NOI / capRate (₪ integer). Rising rates ⇒ higher cap rates ⇒ lower values. */
export function capRateValue({ noi, capRate }) {
  if (!(capRate > 0)) throw new RangeError('capRate must be > 0');
  return toIls(toAg(noi / capRate));
}

/* ============================================================ risk metrics */
/** Simple period returns of a value series. */
export function returnsOf(values) {
  const out = [];
  for (let i = 1; i < values.length; i++) out.push(values[i] / values[i - 1] - 1);
  return out;
}
/** Annualised volatility (sample st.dev. of period returns × √periodsPerYear), 4 decimals. */
export function volatility(values, periodsPerYear = 12) {
  const r = returnsOf(values);
  if (r.length < 2) return 0;
  const mean = r.reduce((s, x) => s + x, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - mean) ** 2, 0) / (r.length - 1);
  return r4(Math.sqrt(v) * Math.sqrt(periodsPerYear));
}
/** Worst peak-to-trough fall. maxDrawdown is negative (−0.5 = fell 50%); recoveryIndex = first index back at the old peak, or null. */
export function maxDrawdown(values) {
  let peak = values[0], peakI = 0, best = { maxDrawdown: 0, peakIndex: 0, troughIndex: 0 };
  for (let i = 1; i < values.length; i++) {
    if (values[i] > peak) { peak = values[i]; peakI = i; }
    const dd = values[i] / peak - 1;
    if (dd < best.maxDrawdown) best = { maxDrawdown: dd, peakIndex: peakI, troughIndex: i };
  }
  let rec = null;
  for (let i = best.troughIndex + 1; i < values.length; i++) if (values[i] >= values[best.peakIndex]) { rec = i; break; }
  return { maxDrawdown: r4(best.maxDrawdown), peakIndex: best.peakIndex, troughIndex: best.troughIndex, recoveryIndex: rec,
    monthsToRecover: rec === null ? null : rec - best.troughIndex };
}
/** Compound annual growth rate of a series (4 decimals). */
export function cagr(values, periodsPerYear = 12) {
  const years = (values.length - 1) / periodsPerYear;
  return years > 0 ? r4(dpow(values[values.length - 1] / values[0], 1 / years) - 1) : 0;
}
function ymIndex(series, ym) {
  const [sy, sm] = series.start.split('-').map(Number), [y, m] = String(ym).split('-').map(Number);
  return Math.max(0, Math.min(series.values.length - 1, (y * 12 + m - 1) - (sy * 12 + sm - 1)));
}
/**
 * Risk stats of a REAL series from js/data/real.js (pass the module). name: 'sp500'|'ta125'|'homeIL'|'usdIls'|…
 * @returns {{from, to, months, cagr, volatility, maxDrawdown, peakYm, troughYm, recoveryMonths, worstMonth, bestMonth, worst12m}}
 */
export function seriesRisk(real, name, fromYm, toYm) {
  const s = real.SERIES[name];
  if (!s) throw new RangeError(`unknown series ${name}`);
  const a = fromYm ? ymIndex(s, fromYm) : 0, b = toYm ? ymIndex(s, toYm) : s.values.length - 1;
  const v = s.values.slice(a, b + 1);
  const r = returnsOf(v);
  const dd = maxDrawdown(v);
  let worst12 = 0;
  for (let i = 12; i < v.length; i++) worst12 = Math.min(worst12, v[i] / v[i - 12] - 1);
  const ymOf = (i) => real.ymAdd(s.start, a + i);
  return { from: ymOf(0), to: ymOf(v.length - 1), months: v.length - 1, cagr: cagr(v), volatility: volatility(v),
    maxDrawdown: dd.maxDrawdown, peakYm: ymOf(dd.peakIndex), troughYm: ymOf(dd.troughIndex), recoveryMonths: dd.monthsToRecover,
    worstMonth: r4(Math.min(...r)), bestMonth: r4(Math.max(...r)), worst12m: r4(worst12) };
}

/** Inverse standard normal CDF (Acklam's rational approximation, |rel err| < 1.2e-9), deterministic math only. */
export function normInv(p) {
  if (!(p > 0 && p < 1)) throw new RangeError('normInv: 0 < p < 1');
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.3577518672690, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const lo = 0.02425;
  if (p < lo || p > 1 - lo) {
    const q = Math.sqrt(-2 * dlog(p < lo ? p : 1 - p));
    const x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
    return p < lo ? x : -x;
  }
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/**
 * Seeded monthly returns for a pre-drawn price path (log-normal, median annual growth `annualReturn`).
 * rand: () => [0,1) supplied by the caller (engine: () => rng.next(st.rng, 'idx')) — so this stays pure & replayable.
 * Draws: EXACTLY 1 per month, or 2 per month when crashChance > 0 (the crash draw is always taken, to keep the stream aligned).
 * @returns {number[]} simple monthly returns (6 decimals)
 */
export function simulateReturns({ months, annualReturn, vol, rand, crashChance = 0, crash = -0.15 }) {
  const mu = dlog(1 + annualReturn) / 12, s = vol / Math.sqrt(12);
  const out = [];
  for (let i = 0; i < months; i++) {
    const u = Math.min(1 - 1e-12, Math.max(1e-12, rand()));
    let r = dexp(mu + s * normInv(u)) - 1;
    if (crashChance > 0 && rand() < crashChance) r = (1 + r) * (1 + crash) - 1;
    out.push(r6(r));
  }
  return out;
}

/* ============================================================ diversification */
const CLASS_OF = { index: 'equity', stock: 'equity', govBond: 'bonds', corpBond: 'bonds', deposit: 'cash', cash: 'cash', realEstate: 'realEstate', crypto: 'crypto', business: 'business', gold: 'commodity', usd: 'fx' };
/**
 * 0..100 diversification score + Hebrew tips. holdings: [{kind (INSTRUMENTS key or business|gold|usd), value ₪, name?}].
 * Base 0..70: effective number of asset classes (1/HHI) from 1 → 4+. +20 if ≥ 25% sits in a broad index fund (internally diversified).
 * +10 if some liquid cushion (cash/deposit/bonds ≥ 5%). Penalties: a single non-index position > 25% (−15), crypto > 10% (−15).
 * @returns {{score, classes:{class: share}, effectiveClasses, tips:[string]}}
 */
export function diversificationScore(holdings) {
  const pos = holdings.filter((h) => h.value > 0);
  const total = pos.reduce((s, h) => s + h.value, 0);
  if (total <= 0) return { score: 0, classes: {}, effectiveClasses: 0, tips: ['עוד אין לך נכסים — כל התחלה קטנה נחשבת'] };
  const classes = {};
  for (const h of pos) { const c = CLASS_OF[h.kind] || 'other'; classes[c] = (classes[c] || 0) + h.value / total; }
  const hhi = Object.values(classes).reduce((s, w) => s + w * w, 0);
  const eff = 1 / hhi;
  let score = Math.min(1, (eff - 1) / 3) * 70;
  const idxShare = pos.filter((h) => h.kind === 'index').reduce((s, h) => s + h.value, 0) / total;
  const liquid = (classes.cash || 0) + (classes.bonds || 0);
  const big = pos.filter((h) => h.kind !== 'index' && h.value / total > 0.25);
  const tips = [];
  if (idxShare >= 0.25) score += 20; else tips.push('קרן מחקה מדד מפזרת אותך על מאות חברות בפעולה אחת');
  if (liquid >= 0.05) score += 10; else tips.push('כדאי להחזיק כרית נזילה (פיקדון/אג"ח) לימים קשים');
  if (big.length) { score -= 15; tips.push(`יותר מרבע מהכסף בנכס אחד (${big[0].name || INSTRUMENTS[big[0].kind]?.name || big[0].kind}) — אם הוא נופל, הכול נופל`); }
  if ((classes.crypto || 0) > 0.10) { score -= 15; tips.push('יותר מ־10% בקריפטו — תנודתיות קיצונית'); }
  if (eff < 2) tips.push('כמעט הכול בסוג נכס אחד — פזר בין מניות, אג"ח, נדל"ן ומזומן');
  const out = {};
  for (const [k, v] of Object.entries(classes)) out[k] = r4(v);
  return { score: Math.max(0, Math.min(100, Math.round(score))), classes: out, effectiveClasses: Math.round(eff * 100) / 100, tips };
}

/** Real (inflation-adjusted) annual return from nominal return and inflation (Fisher). */
export function realReturn(nominal, inflation) { return r6((1 + nominal) / (1 + inflation) - 1); }
/** Years for money to double (exact, 2 decimals) — the "rule of 72" teaching aid. */
export function doublingYears(annualReturn) { return annualReturn > 0 ? Math.round((dlog(2) / dlog(1 + annualReturn)) * 100) / 100 : null; }
