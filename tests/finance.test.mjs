#!/usr/bin/env node
// Finance engine tests (bank.js + invest.js) — run: node tests/finance.test.mjs
// KNOWN-ANSWER tests: every expected value is computed HERE, independently (own formulas / hand arithmetic), never by
// calling the function under test. Plus property tests (no money created, schedules non-negative, rounding conserved).
import assert from 'node:assert/strict';
import * as B from '../js/finance/bank.js';
import * as I from '../js/finance/invest.js';
import * as REAL from '../js/data/real.js';
import { readFileSync } from 'node:fs';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`✔ ${name}`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e.stack).split('\n').slice(0, 5).join('\n   ')}`); }
}
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} got ${a}, want ${b} ±${tol}`);
const sum = (a) => a.reduce((s, x) => s + x, 0);
// independent helpers (do not use the module's)
const ag = (ils) => Math.round(ils * 100);
const roundHalfUp = (x) => Math.sign(x) * Math.floor(Math.abs(x) + 0.5);
function prng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ------------------------------------------------------------------ money primitives */
test('rounding: half away from zero, agorot <-> ₪', () => {
  assert.equal(B.rnd(2.5), 3); assert.equal(B.rnd(-2.5), -3); assert.equal(B.rnd(2.4999), 2);
  assert.equal(B.toAg(1.15), 115); assert.equal(B.toAg(0.1 + 0.2), 30);
  assert.equal(B.toIls(60598), 606); assert.equal(B.toIls(50), 1); assert.equal(B.toIls(-50), -1); assert.equal(B.toIls(49), 0);
  assert.throws(() => B.toAg(NaN)); assert.throws(() => B.amortize({ principal: 1000, annualRate: 4, months: 12 }), /percent/);
});
test('splitIls / splitEven / splitByWeights conserve every agora', () => {
  assert.deepEqual(B.splitEven(100000, 3), [33334, 33333, 33333]);
  const parts = B.splitByWeights(100000001, [1 / 3, 1 / 3, 1 / 3]);
  assert.equal(sum(parts), 100000001);
  const r = prng(7);
  for (let k = 0; k < 200; k++) {
    const xs = Array.from({ length: 1 + Math.floor(r() * 40) }, () => Math.floor(r() * 1e6) - 2e5);
    assert.equal(sum(B.splitIls(xs)), B.toIls(sum(xs)), 'displayed ₪ add up to the displayed total');
    const tot = Math.floor(r() * 1e9), w = Array.from({ length: 1 + Math.floor(r() * 5) }, () => r() + 0.01);
    assert.equal(sum(B.splitByWeights(tot, w)), tot);
  }
});

test('deterministic math kit matches Math.* to ~1e-14 and the source uses no Math.pow/exp/log', () => {
  const r = prng(3);
  for (let k = 0; k < 5000; k++) {
    const x = (r() - 0.5) * 60, y = r() * 1e6 + 1e-9, b = 0.5 + r() * 1.5, e = (r() - 0.5) * 50;
    near(B.dexp(x) / Math.exp(x), 1, 1e-13, `dexp(${x})`);
    near(B.dlog(y), Math.log(y), 1e-13 * Math.max(1, Math.abs(Math.log(y))), `dlog(${y})`);
    near(B.dpow(b, e) / Math.pow(b, e), 1, 1e-12, `dpow(${b},${e})`);
  }
  assert.equal(B.ipow(2, 10), 1024); assert.equal(B.ipow(1.5, 0), 1); assert.equal(B.ipow(2, -2), 0.25);
  for (const p of [0.001, 0.02, 0.1, 0.5, 0.9, 0.975, 0.999]) near(I.normCdf(I.normInv(p)), p, 2e-7, `normInv(${p})`);
  for (const f of ['bank.js', 'invest.js']) {
    const src = readFileSync(new URL(`../js/finance/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/Math\.(pow|exp|log|cos|sin|random)\b|Date\b|document\b|window\b/.test(src), `${f}: platform-dependent or impure call`);
  }
});

/* ------------------------------------------------------------------ amortization (KNOWN ANSWERS) */
test('Shpitzer ₪100,000 / 20y / 4% → ₪605.98 a month', () => {
  const m = 0.04 / 12, want = 100000 * m / (1 - Math.pow(1 + m, -240)); // 605.9802…
  assert.equal(Math.round(want * 100), 60598);
  const s = B.amortize({ principal: 100000, annualRate: 0.04, months: 240, method: 'spitzer' });
  assert.equal(s.paymentAg, 60598);
  assert.equal(B.agToIls2(s.paymentAg), 605.98);
  assert.equal(s.payment, 606);
  // all payments but the last are identical; the last one closes the balance to the agora
  assert.ok(s.rows.slice(0, -1).every((r) => r.paymentAg === 60598));
  near(s.lastPaymentAg, 60598, 5, 'last payment within a few agorot');
  // first month: interest = 100,000 × 4%/12 = 333.33
  assert.equal(s.rows[0].interestAg, 33333); assert.equal(s.rows[0].principalAg, 60598 - 33333);
  // total interest ≈ 240 × 605.98 − 100,000 = 45,435.20 (± last-row rounding)
  near(s.totalInterestAg, 240 * 60598 - 10000000, 5);
});
test('principal parts sum EXACTLY to the principal (no agora lost); ₪ columns add up', () => {
  for (const method of ['spitzer', 'equal']) {
    const s = B.amortize({ principal: 123456.78, annualRate: 0.0537, months: 97, method });
    assert.equal(sum(s.rows.map((r) => r.principalAg)), 12345678, method);
    assert.equal(s.rows.at(-1).balanceAg, 0);
    assert.equal(sum(s.rows.map((r) => r.payment)), s.totalPaid, 'displayed payments add up');
    assert.equal(sum(s.rows.map((r) => r.interest)), s.totalInterest, 'displayed interest adds up');
    assert.equal(sum(s.rows.map((r) => r.principal)), s.totalPaid - s.totalInterest);
    assert.equal(s.totalPaidAg, 12345678 + s.totalInterestAg, 'paid = principal + interest, exactly');
  }
});
test('קרן שווה ₪120,000 / 12 months / 6% → ₪10,000 principal each, total interest ₪3,900', () => {
  const s = B.amortize({ principal: 120000, annualRate: 0.06, months: 12, method: 'equal' });
  assert.ok(s.rows.every((r) => r.principalAg === 1000000));
  assert.equal(s.rows[0].interestAg, 60000);   // 120,000 × 0.5%
  assert.equal(s.rows[11].interestAg, 5000);   // 10,000 × 0.5%
  assert.equal(s.totalInterestAg, 0.005 * 1000000 * 78); // 0.5% × 10,000 × (12+11+…+1)
  assert.ok(s.rows.every((r, i) => i === 0 || r.paymentAg < s.rows[i - 1].paymentAg), 'payments fall every month');
});
test('zero rate: payments = principal / n, extra agorot on the last row, no interest', () => {
  const s = B.amortize({ principal: 1000, annualRate: 0, months: 3 });
  assert.equal(s.totalInterestAg, 0); assert.equal(s.totalPaidAg, 100000);
  assert.deepEqual(s.rows.map((r) => r.paymentAg), [33333, 33333, 33334]);
});
test('variable rate (array): payment is recomputed when the rate moves, principal still conserved', () => {
  const rates = [...Array(12).fill(0.05), ...Array(12).fill(0.08)];
  const s = B.amortize({ principal: 50000, annualRate: rates, months: 24 });
  assert.ok(s.rows[12].paymentAg > s.rows[11].paymentAg, 'rate up ⇒ payment up');
  // independent: payment after the switch = Spitzer on the balance after 12 months at 8% for 12 months
  const bal = s.rows[11].balanceAg, m = 0.08 / 12;
  assert.equal(s.rows[12].paymentAg, roundHalfUp(bal * m / (1 - Math.pow(1 + m, -12))));
  assert.equal(sum(s.rows.map((r) => r.principalAg)), 5000000);
});
test('CPI-linked: principal parts = principal + indexation, exactly', () => {
  const s = B.amortize({ principal: 300000, annualRate: 0.03, months: 180, cpiMonthly: 0.002 });
  assert.ok(s.totalIndexationAg > 0);
  assert.equal(sum(s.rows.map((r) => r.principalAg)), 30000000 + s.totalIndexationAg);
  assert.equal(s.totalPaidAg, 30000000 + s.totalIndexationAg + s.totalInterestAg);
  // month 1: indexation = 300,000 × 0.2% = 600; interest on 300,600 × 0.25% = 751.50
  assert.equal(s.rows[0].indexationAg, 60000); assert.equal(s.rows[0].interestAg, 75150);
});

/* ------------------------------------------------------------------ effective rate */
test('effective rate: no fees = (1+r/12)^12 − 1; fees raise it (single-payment known answer)', () => {
  const e0 = B.effectiveRate({ principal: 100000, annualRate: 0.04, months: 240 });
  near(e0.effective, Math.pow(1 + 0.04 / 12, 12) - 1, 1e-6);
  assert.equal(e0.effectivePct, 4.07);
  // ₪1,000 for 1 month at 12%: you get 990 (fee 10), repay 1,010 → monthly 1010/990 − 1
  const e1 = B.effectiveRate({ principal: 1000, annualRate: 0.12, months: 1, openingFee: 10 });
  near(e1.effective, Math.pow(1010 / 990, 12) - 1, 1e-6);
  const e2 = B.effectiveRate({ principal: 100000, annualRate: 0.04, months: 240, openingFee: 500, monthlyFee: 5 });
  assert.ok(e2.effective > e0.effective && e2.feesAddPct > 0);
});

/* ------------------------------------------------------------------ prepayment */
function indepSchedule(P, r, n) { // independent Spitzer in agorot (same rounding policy, own code)
  const m = r / 12; let bal = ag(P); const pay = roundHalfUp(bal * m / (1 - Math.pow(1 + m, -n))); const rows = [];
  for (let i = 1; i <= n; i++) { const int = roundHalfUp(bal * m); const pr = i === n ? bal : pay - int; bal -= pr; rows.push({ pay: int + pr, int, bal }); }
  return rows;
}
test('prepayment fee: full early repayment of a fixed loan when rates fell to 0% (known answer)', () => {
  // 120,000 / 12 months / 6%: at month 0, PV of remaining payments at 0% = Σ payments ⇒ capitalization fee = total interest
  const rows = indepSchedule(120000, 0.06, 12);
  const totalInterestAg = sum(rows.map((r) => r.int));
  const p = B.prepay({ principal: 120000, annualRate: 0.06, months: 12, atMonth: 0, track: 'fixed', marketRate: 0, noticeDays: 30 });
  assert.equal(p.fees.capitalization, B.toIls(totalInterestAg));
  assert.equal(p.fees.operational, 60); assert.equal(p.fees.noNotice, 0);
  assert.equal(p.feeAg, totalInterestAg + 6000);
  assert.equal(p.cashNeeded, 120000 + B.toIls(totalInterestAg + 6000));
  assert.equal(p.schedule, null);
});
test('prepayment fee: prime = only ₪60; market above contract = no capitalization; discounts 20% (3y) / 30% (5y); no-notice 0.1%', () => {
  const base = { principal: 500000, annualRate: 0.05, months: 240, atMonth: 24, amount: 100000 };
  const prime = B.prepay({ ...base, track: 'prime', marketRate: 0.02, noticeDays: 0 });
  assert.equal(prime.fee, 60);
  const up = B.prepay({ ...base, track: 'fixed', marketRate: 0.07 });
  assert.equal(up.fees.capitalization, 0);
  // independent capitalization: PV of the remaining payments @ 3.5%, minus balance, × (amount / balance)
  const rows = indepSchedule(500000, 0.05, 240), bal = rows[23].bal, m = 0.035 / 12;
  let pv = 0; rows.slice(24).forEach((r, k) => { pv += r.pay / Math.pow(1 + m, k + 1); });
  const capAg = roundHalfUp((pv - bal) * (10000000 / bal));
  const f0 = B.prepay({ ...base, track: 'fixed', marketRate: 0.035, loanAgeMonths: 24 });
  assert.equal(f0.fees.capitalization, B.toIls(capAg));
  const f3 = B.prepay({ ...base, track: 'fixed', marketRate: 0.035, loanAgeMonths: 40 });
  assert.equal(f3.fees.discountPct, 0.2); assert.equal(f3.fees.capitalization, B.toIls(capAg - roundHalfUp(capAg * 0.2)));
  const f5 = B.prepay({ ...base, track: 'fixed', marketRate: 0.035, loanAgeMonths: 61 });
  assert.equal(f5.fees.capitalization, B.toIls(capAg - roundHalfUp(capAg * 0.3)));
  const nn = B.prepay({ ...base, track: 'fixed', marketRate: 0.07, noticeDays: 3 });
  assert.equal(nn.fees.noNotice, 100); // 0.1% × 100,000
  // partial prepay: payment drops (reducePayment) or term shortens (shortenTerm)
  assert.ok(f0.newPayment < f0.oldPayment && f0.newMonths === 216);
  const st = B.prepay({ ...base, track: 'fixed', marketRate: 0.07, mode: 'shortenTerm' });
  assert.ok(st.newMonths < 216 && Math.abs(st.newPayment - st.oldPayment) <= 1, 'same payment, shorter loan');
  assert.ok(st.interestSaved > f0.interestSaved, 'shortening saves more interest than lowering the payment');
});
test('prepay: variable track at a change point has no capitalization fee; CPI track pays עמלת מדדים', () => {
  const v = B.prepay({ principal: 200000, annualRate: 0.05, months: 240, atMonth: 60, track: 'variable', marketRate: 0.02 });
  assert.equal(v.fees.capitalization, 0);
  const c = B.prepay({ principal: 200000, annualRate: 0.03, months: 240, atMonth: 12, amount: 50000, track: 'cpi', marketRate: 0.04, cpiMonthlyAvg: 0.002 });
  assert.equal(c.fees.cpi, 50); // 50,000 × ½ × 0.2%
});

/* ------------------------------------------------------------------ checking / savings / deposits */
test('overdraft: inside the מסגרת at rate/12, beyond it +3% (ריבית חריגה)', () => {
  const r = B.checkingMonth({ balance: -10000, limit: 5000, annualRate: 0.12, fee: 12 });
  // 5,000 × 1% = 50.00 ; 5,000 × 15%/12 = 62.50 ⇒ 112.50
  assert.equal(r.interestAg, 11250); assert.equal(r.interest, 113);
  assert.equal(r.newBalanceAg, -1000000 - 11250 - 1200); assert.equal(r.newBalance, -10125);
  assert.equal(r.overLimit, true); assert.equal(r.overLimitBy, 5000); assert.equal(r.creditDelta, B.CREDIT_DELTAS.overLimit);
  const ok = B.checkingMonth({ balance: 3000, limit: 5000, annualRate: 0.12, fee: 0 });
  assert.equal(ok.interest, 0); assert.equal(ok.newBalance, 3000);
  assert.equal(B.overdraftRate(0.0325, 700), 0.0325 + 0.015 + 0.06);
  assert.equal(B.overdraftRate(0.0325, 400), null);
});
test('savings month: ₪12,000 at 2% → ₪20 interest, 15% tax', () => {
  const s = B.savingsMonth({ balance: 12000, annualRate: 0.02 });
  assert.equal(s.interestAg, 2000); assert.equal(s.taxAg, 300); assert.equal(s.newBalanceAg, 1201700);
});
test('fixed deposit ₪50,000 / 12 months / 4% → ₪2,000 interest, ₪300 tax, ₪51,700 at maturity', () => {
  const d = B.fixedDeposit({ amount: 50000, annualRate: 0.04, months: 12 });
  assert.equal(d.interest, 2000); assert.equal(d.tax, 300); assert.equal(d.maturity, 51700);
  // CPI-linked: 2% real + 3% CPI → indexation 1,500 (untaxed), real interest on 51,500 = 1,030, tax 25% = 257.50
  const l = B.fixedDeposit({ amount: 50000, annualRate: 0.02, months: 12, linked: true, cpiTotal: 0.03 });
  assert.equal(l.indexation, 1500); assert.equal(l.interestAg, 103000); assert.equal(l.taxAg, 25750);
  assert.equal(l.maturityAg, 5000000 + 150000 + 103000 - 25750);
});
test('deposit early-break penalty (known answer)', () => {
  // ₪50,000 at 4%, exit points every 3 months, broken after 7 months: keep interest of 6 months = 1,000 (tax 150)
  const b = B.breakDeposit({ amount: 50000, annualRate: 0.04, months: 12, elapsed: 7, exitEvery: 3 });
  assert.equal(b.interestKept, 1000); assert.equal(b.tax, 150); assert.equal(b.payout, 50850);
  // accrued after 7 months = 50,000×4%×7/12 = 1,166.67 → net 1,166.67 − 175.00 = 991.67; kept net 850 ⇒ penalty 141.67
  const fullAg = roundHalfUp(5000000 * 0.04 * 7 / 12), netFull = fullAg - roundHalfUp(fullAg * 0.15);
  assert.equal(b.penaltyAg, netFull - 85000); assert.equal(b.penalty, 142);
  // fully closed deposit: lose all interest; plus a 0.5% fee between exit points
  const c = B.breakDeposit({ amount: 50000, annualRate: 0.04, months: 12, elapsed: 7, feePct: 0.005 });
  assert.equal(c.payout, 50000 - 250); assert.equal(c.fee, 250); assert.equal(c.penaltyAg, netFull + 25000);
  // at an exit point: no fee, nothing lost
  const e = B.breakDeposit({ amount: 50000, annualRate: 0.04, months: 12, elapsed: 6, exitEvery: 3, feePct: 0.005 });
  assert.equal(e.penalty, 0); assert.equal(e.payout, 50850);
});

/* ------------------------------------------------------------------ credit card, loans, credit score */
test('card installments: 3 × no interest (extra agorot on the first); 12 × קרדיט with interest', () => {
  const f = B.installments({ price: 1000, count: 3 });
  assert.deepEqual(f.amountsAg, [33334, 33333, 33333]); assert.equal(f.total, 1000); assert.equal(f.interest, 0);
  assert.equal(sum(f.amounts), 1000);
  const c = B.installments({ price: 6000, count: 12 });
  const m = 0.12 / 12, pay = roundHalfUp(600000 * m / (1 - Math.pow(1 + m, -12)));
  assert.equal(c.amountsAg[0], pay); assert.equal(sum(c.amountsAg), c.totalAg); assert.ok(c.interest > 0);
  assert.equal(sum(c.amounts), c.total);
});
test('credit score hooks: bands change the rate; a poor score is refused', () => {
  assert.equal(B.creditSpread(800), -0.005); assert.equal(B.creditSpread(700), 0);
  assert.equal(B.creditSpread(650), 0.0075); assert.equal(B.creditSpread(550), 0.015); assert.equal(B.creditSpread(500), null);
  const good = B.loanOffer({ principal: 30000, months: 36, boiRate: 0.0325, creditScore: 780 });
  const fair = B.loanOffer({ principal: 30000, months: 36, boiRate: 0.0325, creditScore: 640 });
  assert.ok(good.ok && fair.ok && good.annualRate < fair.annualRate && good.payment < fair.payment);
  near(good.annualRate, 0.0325 + 0.015 + 0.025 - 0.005, 1e-9);
  assert.ok(good.effectivePct > good.annualRate * 100, 'opening fee shows up in the effective rate');
  const no = B.loanOffer({ principal: 30000, months: 36, boiRate: 0.0325, creditScore: 480 });
  assert.equal(no.ok, false); assert.match(no.reason, /דירוג האשראי/);
  assert.equal(B.loanOpeningFee(30000), 150); assert.equal(B.loanOpeningFee(1000), 100); assert.equal(B.loanOpeningFee(1e6), 1000);
});

/* ------------------------------------------------------------------ mortgage */
test('mortgage tracks: split is exact, rates follow BoI, rules enforced, stress tests', () => {
  const m = B.mortgageTracks({ principal: 1000000.01, months: 300, boiRate: 0.0325, cpiYearly: 0 });
  assert.equal(sum(m.tracks.map((t) => t.principalAg)), 100000001);
  const p = m.tracks.find((t) => t.id === 'prime');
  near(p.annualRate, 0.0325 + 0.015 - 0.005, 1e-9);
  // CPI 0 ⇒ the linked track is a plain fixed loan at 3.2%
  const c = m.tracks.find((t) => t.id === 'cpi');
  const want = B.amortize({ principal: c.principalAg / 100, annualRate: 0.032, months: 300 });
  assert.equal(c.paymentAg, want.paymentAg);
  assert.equal(m.paymentAg, sum(m.tracks.map((t) => t.paymentAg)));
  assert.ok(m.stress.primePlus2 > m.payment, 'prime +2% raises the payment');
  assert.ok(m.rules.ok);
  const bad = B.mortgageTracks({ principal: 900000, boiRate: 0.0325, mix: { prime: 0.8, fixed: 0.2 } });
  assert.equal(bad.rules.ok, false); assert.equal(bad.rules.issues.length, 2);
  assert.throws(() => B.mortgageTracks({ principal: 1, boiRate: 0.03, mix: { prime: 0.5, fixed: 0.4 } }), /sum to 1/);
  const lk = B.mortgageTracks({ principal: 600000, boiRate: 0.0325, cpiYearly: 0.03 });
  assert.ok(lk.totalIndexation > 0 && lk.stress.cpiPlus2Year10 > lk.stress.baseYear10);
});
test('mortgage approval: LTV 75% first home, PTI ≤ 50%', () => {
  const a = B.mortgageCheck({ price: 2000000, principal: 1600000, netIncome: 20000, payment: 8000, buyer: 'first' });
  assert.equal(a.ok, false); assert.equal(a.ltv, 0.8); assert.equal(a.maxPrincipal, 1500000);
  const b = B.mortgageCheck({ price: 2000000, principal: 1500000, netIncome: 20000, payment: 9000 });
  assert.equal(b.ok, true); assert.equal(b.warnings.length, 1);
  assert.equal(B.mortgageCheck({ price: 2e6, principal: 1e6, netIncome: 10000, payment: 6000 }).ok, false);
});
test('real.js rates: prime = BoI + 1.5%, trailing CPI', () => {
  const r = B.ratesFromReal(REAL, '2026-10');
  assert.equal(r.boi, 0.0325); assert.equal(r.prime, 0.0475);
  near(r.cpiYearly, 105.18 / 104.08 - 1, 1e-6);
  const r08 = B.ratesFromReal(REAL, '2009-03'); assert.equal(r08.boi, 0.005);
});

/* ------------------------------------------------------------------ investing (KNOWN ANSWERS) */
test('FV of ₪500/month for 30 years at 7%', () => {
  const m = 0.07 / 12, nominal = 500 * (Math.pow(1 + m, 360) - 1) / m; // 609,985.50 (bank-style monthly compounding)
  const fN = I.futureValue({ monthly: 500, annualReturn: 0.07, years: 30, rateMode: 'nominal' });
  assert.equal(fN.valueAg, Math.round(nominal * 100)); assert.equal(fN.value, 609986);
  const me = Math.pow(1.07, 1 / 12) - 1, eff = 500 * (Math.pow(1.07, 30) - 1) / me; // 7% a YEAR (effective)
  const fE = I.futureValue({ monthly: 500, annualReturn: 0.07, years: 30 });
  assert.equal(fE.valueAg, Math.round(eff * 100));
  assert.equal(fE.contributed, 180000); assert.equal(fE.growth, fE.value - 180000);
  assert.equal(fE.guaranteed, false); assert.match(fE.note, /אין תשואה מובטחת/);
  assert.equal(fE.path.length, 31); assert.equal(fE.path.at(-1).value, fE.value);
  assert.ok(fE.path.every((p, i) => i === 0 || p.value > fE.path[i - 1].value));
  // lump sum: 10,000 × 1.07^10 = 19,671.51
  assert.equal(I.futureValue({ pv: 10000, annualReturn: 0.07, years: 10 }).value, 19672);
  // management fee costs money (1% a year over 30 years is a lot)
  const fee = I.futureValue({ monthly: 500, annualReturn: 0.07, years: 30, mgmtFee: 0.01 });
  assert.ok(fee.value < fE.value && fee.feeDrag === fE.value - fee.value && fee.feeDrag > 50000);
});
test('projectRange: p10 < p50 < p90, p50 = median FV, loss chance falls with time', () => {
  const r = I.projectRange({ monthly: 500, years: 30, annualReturn: 0.07, vol: 0.16 });
  assert.ok(r.p10 < r.p50 && r.p50 < r.p90);
  near(r.p50, I.futureValue({ monthly: 500, annualReturn: 0.07, years: 30 }).value, 1);
  const r1 = I.projectRange({ pv: 10000, years: 1 }), r20 = I.projectRange({ pv: 10000, years: 20 });
  assert.ok(r1.lossChance > r20.lossChance && r1.lossChance > 0.3 && r20.lossChance < 0.05);
  assert.equal(r.guaranteed, false);
});
test('capital-gains tax 25%: real vs nominal, real loss, loss carry-forward', () => {
  // buy 10,000, sell 15,000, CPI +10%: inflation part 1,000 exempt, real gain 4,000 ⇒ tax 1,000
  const a = I.capitalGainsTax({ cost: 10000, proceeds: 15000, cpiBuy: 100, cpiSell: 110 });
  assert.deepEqual([a.nominalGain, a.inflationPart, a.realGain, a.tax, a.net], [5000, 1000, 4000, 1000, 14000]);
  assert.equal(I.capitalGainsTax({ cost: 10000, proceeds: 15000, cpiBuy: 100, cpiSell: 110, mode: 'nominal' }).tax, 1250);
  const b = I.capitalGainsTax({ cost: 10000, proceeds: 10500, cpiBuy: 100, cpiSell: 110 });
  assert.deepEqual([b.tax, b.lossCarryOut], [0, 0], 'nominal gain but real loss: no tax, no loss');
  const c = I.capitalGainsTax({ cost: 10000, proceeds: 8000 });
  assert.equal(c.lossCarryOut, 2000); assert.equal(c.tax, 0);
  const d = I.capitalGainsTax({ cost: 10000, proceeds: 15000, lossCarry: c.lossCarryOut });
  assert.deepEqual([d.taxable, d.tax, d.lossCarryOut], [3000, 750, 0]);
  const dv = I.dividend({ units: 100, perUnit: 2.5 }); assert.deepEqual([dv.gross, dv.tax, dv.net], [250, 63, 188]);
});
test('trade commissions: 0.1% with a ₪5 minimum', () => {
  assert.equal(I.tradeCost({ amount: 1000 }).commissionAg, 500);
  assert.equal(I.tradeCost({ amount: 20000 }).commissionAg, 2000);
  assert.equal(I.tradeCost({ amount: 0 }).commissionAg, 0);
});
test('DCA: buys more units when prices are low; money is conserved to the agora', () => {
  const d = I.dca({ prices: [100, 80, 60, 80, 100], amount: 1000, minCommission: 0, commissionPct: 0 });
  near(d.units, 10 + 12.5 + 1000 / 60 + 12.5 + 10, 1e-5);
  assert.ok(d.gain > 0 && d.lumpSum.gain === 0, 'same start/end price: DCA wins only because of the dip');
  const w = I.dca({ prices: [97.3, 91.12, 103.5, 88.01], amount: 750, wholeUnits: true });
  assert.equal(w.investedAg, w.spentAg + w.feesAg + w.leftoverAg);
  assert.ok(w.buys.every((b) => Number.isInteger(b.units)));
});
test('bonds: par, zero-coupon, yield inverse, duration, price falls when rates rise', () => {
  assert.equal(I.bondPrice({ couponRate: 0.05, ytm: 0.05, years: 10 }).pricePct, 100);
  assert.equal(I.bondPrice({ couponRate: 0, ytm: 0.04, years: 5 }).pricePct, Math.round(100 / Math.pow(1.04, 5) * 1e4) / 1e4); // 82.1927
  const p = I.bondPrice({ couponRate: 0.05, ytm: 0.06, years: 10 }).pricePct;
  near(I.bondYield({ pricePct: p, couponRate: 0.05, years: 10 }), 0.06, 1e-5);
  const d0 = I.bondDuration({ couponRate: 0, ytm: 0.04, years: 5 });
  assert.equal(d0.macaulay, 5); assert.equal(d0.modified, Math.round(5 / 1.04 * 1000) / 1000);
  const s = I.bondRateShock({ couponRate: 0.04, ytm: 0.04, years: 10, dy: 0.01 });
  assert.ok(s.exactPct < 0 && Math.abs(s.exactPct - s.approxPct) < 0.5);
  const j = I.bondExpectedReturn({ kind: 'corpBBB', govYield: 0.04 });
  assert.ok(j.ytm > j.expected && j.guaranteed === false);
});
test('real estate: net yield ≠ rent (known answer) + 10% rental track + mortgage cash-on-cash', () => {
  // ₪1,000,000, rent ₪4,000 (≤ exemption ceiling), 1 empty month, maintenance 8% of gross, insurance 1,200,
  // investor purchase tax 8% = 80,000, closing 3% = 30,000 ⇒ total cost 1,110,000
  const y = I.realEstateYield({ price: 1000000, monthlyRent: 4000 });
  assert.deepEqual([y.grossRent, y.collectedRent, y.maintenance, y.noi, y.tax, y.purchaseTax, y.totalCost], [48000, 44000, 3840, 38960, 0, 80000, 1110000]);
  assert.equal(y.grossYield, 0.048); assert.equal(y.capRate, Math.round(38960 / 1e6 * 1e4) / 1e4);
  assert.equal(y.netYield, Math.round(38960 / 1110000 * 1e4) / 1e4); // 3.51% — not the 4.8% "on paper"
  assert.equal(y.taxTrack, 'exempt'); assert.equal(sum(y.lines.slice(0, -1).map((l) => l.amount)), y.lines.at(-1).amount);
  const t = I.realEstateYield({ price: 2000000, monthlyRent: 6000 });
  assert.equal(t.taxTrack, 'track10'); assert.equal(t.tax, 6600); assert.equal(t.purchaseTax, 160000);
  const lev = I.realEstateYield({ price: 1000000, monthlyRent: 4000, mortgage: { principal: 500000, annualRate: 0.05, months: 300 } });
  assert.equal(lev.equity, 610000); assert.ok(lev.debtService > 0 && lev.cashFlowYear < y.cashFlowYear);
  assert.equal(I.capRateValue({ noi: 40000, capRate: 0.04 }), 1000000);
  assert.equal(I.purchaseTax({ price: 2000000, buyer: 'first' }), Math.round((2000000 - 1978745) * 0.035));
});
test('risk metrics: drawdown / volatility / CAGR (hand-made series)', () => {
  const dd = I.maxDrawdown([100, 120, 60, 90, 130]);
  assert.deepEqual(dd, { maxDrawdown: -0.5, peakIndex: 1, troughIndex: 2, recoveryIndex: 4, monthsToRecover: 2 });
  assert.equal(I.volatility([100, 100, 100, 100]), 0);
  assert.equal(I.cagr([100, 110, 121], 1), 0.1);
  // two-point returns +10%, −10%: sample st.dev = 0.1414…, monthly ⇒ ×√12
  assert.equal(I.volatility([100, 110, 99]), Math.round(Math.sqrt(0.02) * Math.sqrt(12) * 1e4) / 1e4);
});
test('real series (real.js): S&P 500 2007–2009 fell ≈ 52%, TA-125 is volatile, no money promise', () => {
  const s = I.seriesRisk(REAL, 'sp500');
  assert.equal(s.peakYm, '2007-10'); assert.equal(s.troughYm, '2009-02');
  near(s.maxDrawdown, 735.09 / 1549.38 - 1, 1e-4);
  assert.ok(s.volatility > 0.1 && s.volatility < 0.25 && s.worst12m < -0.4);
  const t = I.seriesRisk(REAL, 'ta125', '2007-06', '2012-06');
  assert.equal(t.months, 60); assert.ok(t.maxDrawdown < -0.4);
  const h = I.seriesRisk(REAL, 'homeIL', '2008-01', '2020-12'); assert.ok(h.cagr > 0.05);
});
test('seeded returns are reproducible and depend only on the supplied random stream', () => {
  const a = I.simulateReturns({ months: 120, annualReturn: 0.07, vol: 0.16, rand: prng(42) });
  const b = I.simulateReturns({ months: 120, annualReturn: 0.07, vol: 0.16, rand: prng(42) });
  assert.deepEqual(a, b); assert.equal(a.length, 120);
  const long = I.simulateReturns({ months: 12000, annualReturn: 0.07, vol: 0.16, rand: prng(1) });
  const g = Math.exp(long.reduce((s, r) => s + Math.log(1 + r), 0) / 1000) - 1;
  near(g, 0.07, 0.02, 'long-run geometric return near the assumption');
});
test('diversification score: one stock ≪ index + bonds + cash; crypto-heavy penalised', () => {
  const one = I.diversificationScore([{ kind: 'stock', value: 100000, name: 'BANK' }]);
  const mix = I.diversificationScore([{ kind: 'index', value: 60000 }, { kind: 'govBond', value: 25000 }, { kind: 'deposit', value: 10000 }, { kind: 'realEstate', value: 20000 }]);
  const cr = I.diversificationScore([{ kind: 'index', value: 50000 }, { kind: 'crypto', value: 40000 }, { kind: 'deposit', value: 10000 }]);
  assert.ok(one.score < 10 && mix.score >= 70 && cr.score < mix.score, `${one.score} ${mix.score} ${cr.score}`);
  assert.ok(one.tips.length > 0); assert.equal(I.diversificationScore([]).score, 0);
  assert.equal(I.realReturn(0.05, 0.03), Math.round((1.05 / 1.03 - 1) * 1e6) / 1e6);
  assert.equal(I.doublingYears(0.07), 10.24);
});

/* ------------------------------------------------------------------ PROPERTY tests */
test('property: 2,000 random loans — no money created, non-negative rows, exact conservation, deterministic', () => {
  const r = prng(20261120);
  for (let k = 0; k < 2000; k++) {
    const P = Math.round(r() * 2e8) / 100 + 0.01, rate = Math.round(r() * 0.18 * 1e4) / 1e4, n = 1 + Math.floor(r() * 360);
    const method = r() < 0.5 ? 'spitzer' : 'equal', cpi = r() < 0.3 ? Math.round(r() * 0.004 * 1e5) / 1e5 : 0;
    const s = B.amortize({ principal: P, annualRate: rate, months: n, method, cpiMonthly: cpi });
    const Pag = Math.round(P * 100);
    assert.equal(s.principalAg, Pag);
    assert.equal(sum(s.rows.map((x) => x.principalAg)), Pag + s.totalIndexationAg, 'principal parts = principal + indexation');
    assert.equal(s.totalPaidAg - s.totalInterestAg - s.totalIndexationAg, Pag, 'no money created or destroyed');
    assert.equal(s.rows.at(-1).balanceAg, 0);
    for (const x of s.rows) {
      assert.ok(x.interestAg >= 0 && x.principalAg >= 0 && x.balanceAg >= 0 && x.paymentAg >= 0, `row ${x.n} of loan ${k}`);
      assert.ok(Number.isInteger(x.paymentAg) && Number.isInteger(x.balanceAg) && Number.isInteger(x.payment));
    }
    assert.equal(sum(s.rows.map((x) => x.payment)), s.totalPaid);
    if (k % 50 === 0) assert.deepEqual(B.amortize({ principal: P, annualRate: rate, months: n, method, cpiMonthly: cpi }), s);
  }
});
test('property: random prepayments — fees ≥ 0, cash = amount + fee, remaining balance consistent', () => {
  const r = prng(99);
  for (let k = 0; k < 400; k++) {
    const P = 10000 + Math.round(r() * 1e6), rate = 0.01 + r() * 0.08, n = 12 + Math.floor(r() * 348);
    const atMonth = Math.floor(r() * n), track = ['fixed', 'prime', 'variable', 'cpi'][k % 4];
    const amount = r() < 0.3 ? undefined : Math.round(r() * P);
    const p = B.prepay({ principal: P, annualRate: rate, months: n, atMonth, amount, track, marketRate: r() * 0.1, noticeDays: Math.floor(r() * 20), mode: r() < 0.5 ? 'reducePayment' : 'shortenTerm', cpiMonthlyAvg: 0.002 });
    assert.ok(p.feeAg >= 0 && p.amountAg <= p.balanceAg && p.amountAg >= 0);
    assert.equal(p.cashNeeded, B.toIls(p.amountAg + p.feeAg));
    if (p.schedule) assert.equal(p.schedule.principalAg, p.balanceAg - p.amountAg);
    else assert.equal(p.amountAg, p.balanceAg);
    assert.ok(p.interestSaved >= 0, 'paying earlier never costs more interest');
  }
});
test('property: deposits/savings never create money; breaking never beats maturity', () => {
  const r = prng(5);
  for (let k = 0; k < 500; k++) {
    const amount = Math.round(r() * 5e6) / 100, rate = r() * 0.06, months = 1 + Math.floor(r() * 60);
    const elapsed = Math.floor(r() * (months + 2)), exitEvery = [0, 1, 3, 6][k % 4], feePct = (k % 3) * 0.0025;
    const f = B.fixedDeposit({ amount, annualRate: rate, months });
    const b = B.breakDeposit({ amount, annualRate: rate, months, elapsed, exitEvery, feePct });
    assert.ok(f.maturityAg >= B.toAg(amount) && f.taxAg <= f.interestAg);
    assert.ok(b.payoutAg <= f.maturityAg && b.penaltyAg >= 0);
    assert.ok(b.payoutAg >= B.toAg(amount) - B.rnd(B.toAg(amount) * feePct), 'only the fee can touch the principal');
  }
});
test('edge cases: zero principal, zero balance, negative rate, 1-month loan', () => {
  const z = B.amortize({ principal: 0, annualRate: 0.05, months: 12 });
  assert.equal(z.totalPaidAg, 0); assert.ok(z.rows.every((x) => x.paymentAg === 0));
  const neg = B.amortize({ principal: 10000, annualRate: -0.005, months: 12 });
  assert.ok(neg.totalInterestAg < 0 && neg.totalPaidAg === 1000000 + neg.totalInterestAg);
  const one = B.amortize({ principal: 1000, annualRate: 0.12, months: 1 });
  assert.equal(one.paymentAg, 101000);
  assert.equal(B.checkingMonth({ balance: 0, annualRate: 0.1, fee: 0 }).newBalance, 0);
  assert.equal(I.futureValue({ pv: 0, monthly: 0, annualReturn: 0.07, years: 10 }).value, 0);
  assert.throws(() => B.amortize({ principal: 1000, annualRate: 0.05, months: 0 }));
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
