// Business sim — known-answer + invariant tests. Run: node tests/business.test.mjs
import * as B from '../js/finance/business.js';
import * as R from '../js/rng.js';

let fails = 0, n = 0;
const ok = (cond, msg, extra) => { n++; if (!cond) { fails++; console.log('FAIL', msg, extra !== undefined ? JSON.stringify(extra) : ''); } };
const eq = (got, want, msg) => ok(JSON.stringify(got) === JSON.stringify(want), msg, { got, want });
const seeded = (seed) => { const h = { s: seed >>> 0 }; return () => R.next(h, 's'); };
const NEUTRAL = () => 0.5; // demand noise ×1.0, no event (eventChance 0 in the lab)

// "Lab" business: round numbers so every result can be checked by hand.
// price ₪118 incl. VAT (= ₪100 net), unit cost ₪40, 100 customers/month, rent ₪3,000 + fixed ₪1,000, no fees, no equipment.
const LAB = { price: 118, unitCost: 40, baseDemand: 100, elasticity: 1, rent: 3000, fixed: 1000, feePct: 0, royaltyPct: 0,
  equipment: 0, equipCap: null, expand: null, startCapital: 10000, ownerCap: 1000, staff: 0, maxStaff: 3, wage: 5000, perStaff: 100,
  cashShare: 1, events: {}, eventChance: 0, mktHalf: 1000, mktMax: 0.5, mktMaxSpend: 10000, managerWage: 1000, multiple: 3 };
const lab = (o = {}) => B.create('laundromat', { name: 'מעבדה', overrides: { ...LAB, ...o } });

// ---------------------------------------------------------------- VAT
eq([B.vatOf(118), B.netOf(118), B.vatOn(100), B.vatOf(14), B.netOf(14)], [18, 100, 18, 2, 12], 'VAT 18%: inside 118 → 18, on 100 → 18, coffee ₪14 → ₪2 VAT');
eq([B.rnd(2.5), B.rnd(-2.5), B.rnd(0.49)], [3, -3, 0], 'rounding half away from zero');

// ---------------------------------------------------------------- break-even
{
  const be = B.breakEven(lab());
  eq([be.units, be.contribution, be.fixed, be.revenue], [67, 60, 4000, 6700], 'break-even: ₪4,000 fixed ÷ ₪60 contribution = 66.7 → 67 units');
  const be2 = B.breakEven(B.applyDecisions(lab(), { marketing: 2000 }).business);
  eq(be2.units, 100, 'break-even with ₪2,000 marketing: 6,000 ÷ 60 = 100 units');
  const bad = B.breakEven(lab({ unitCost: 120 }));
  eq(bad.units, null, 'no break-even when every sale loses money');
}

// ---------------------------------------------------------------- margin math, one known month
{
  const b0 = lab();
  const { business: b, report: r } = B.simulate(b0, null, NEUTRAL);
  eq([r.units, r.revenueGross, r.vatOut, r.revenue], [100, 11800, 1800, 10000], 'sales: 100 × ₪118 = ₪11,800, VAT ₪1,800, revenue ₪10,000');
  eq([r.cogs.total, r.grossProfit, r.grossMargin], [4000, 6000, 60], 'gross profit ₪6,000 = 60%');
  eq([r.opex.total, r.ebt, r.corpTax, r.netProfit, r.netMargin], [4000, 2000, 460, 1540, 15.4], 'net profit 2,000 − 23% tax = ₪1,540 = 15.4%');
  eq([r.vat.output, r.vat.input, r.vat.payable], [1800, 1440, 360], 'VAT: output 1,800 − input 18%×(4,000+3,000+1,000)=1,440 → pay 360');
  eq(r.cash.change, 1540, 'no receivables/stock/depreciation ⇒ cash change = net profit');
  eq(r.flows, { owner: 0, customers: 11800, suppliers: -4720, staff: 0, landlord: -3540, services: -1180, franchisor: 0, state: -820 }, 'who got paid (incl. VAT)');
  eq(B.margins(r), { gross: 60, net: 15.4 }, 'margins()');
  eq(b.cash, 11540, 'business cash');
  const lines = Object.fromEntries(r.lines.map((l) => [l.k, l.amount]));
  eq([lines.gross, lines.vatOut, lines.revenue, lines.cogs, lines.gp, lines.np], [11800, -1800, 10000, -4000, 6000, 1540], 'P&L card lines');
}

// ---------------------------------------------------------------- price elasticity & marketing diminishing returns
{
  const p = lab().p;
  eq([B.priceFactor(p, 118), Math.round(B.priceFactor(p, 129.8) * 1000) / 1000, Math.round(B.priceFactor(p, 106.2) * 1000) / 1000], [1, 0.9, 1.1], 'elasticity 1: +10% price → −10% customers');
  const up = B.simulate(lab(), { price: 130 }, NEUTRAL).report;
  eq(up.units, 90, '+10% price (₪130) ⇒ 90 customers');
  const L = [0, 1000, 2000, 3000, 4000].map((m) => B.marketingLift(p, m));
  const inc = L.slice(1).map((x, i) => x - L[i]);
  ok(inc.every((x, i) => i === 0 || x < inc[i - 1]) && inc[0] > 0, 'marketing: every extra ₪1,000 brings fewer customers', inc);
  eq(Math.round(B.marketingLift(p, 1000) * 1000) / 1000, 0.25, 'marketing ₪1,000 at half-point ₪1,000 → +25% (half of max 50%)');
}

// ---------------------------------------------------------------- revenue grows but profit falls (hiring + marketing)
{
  const run = (decisions) => { let b = B.create('coffee'); const rng = seeded(777); const out = []; for (let m = 1; m <= 4; m++) { const r = B.simulate(b, m === 2 ? decisions : null, rng); b = r.business; out.push(r.report); } return out; };
  const base = run(null), grow = run({ hire: 2, marketing: 6000 });
  for (let i = 1; i < 4; i++) {
    ok(grow[i].revenue > base[i].revenue * 1.3, `month ${i + 1}: hiring 2 + ₪6,000 marketing grows revenue >30%`, [grow[i].revenue, base[i].revenue]);
    ok(grow[i].netProfit < base[i].netProfit, `month ${i + 1}: …but net profit is lower`, [grow[i].netProfit, base[i].netProfit]);
  }
  ok(grow[1].notes.some((x) => x.id === 'rev_up_profit_down'), 'teaching note "revenue up, profit down" shown', grow[1].notes);
  ok(grow[1].lessons.includes('biz_revenue_profit'), 'unlocks lesson biz_revenue_profit');
  ok(base[0].lostSales.capacity > 0 && base[0].notes.some((x) => x.id === 'capacity'), 'owner alone cannot serve all demand → capacity note');
}

// ---------------------------------------------------------------- receivables (pizza: 70% now, 30% next month)
{
  let b = B.create('pizza'); const rng = seeded(5);
  const r1 = B.simulate(b, null, rng); b = r1.business; const r2 = B.simulate(b, null, rng);
  const g1 = r1.report.revenueGross, g2 = r2.report.revenueGross;
  eq(r1.report.cash.collected, B.rnd(g1 * 0.7), 'month 1: only 70% of sales collected');
  eq(r2.report.cash.collected, B.rnd(g2 * 0.7) + (g1 - B.rnd(g1 * 0.7)), 'month 2: 70% of month 2 + the 30% left from month 1');
  ok(r1.report.netProfit > 0 && r1.report.cash.change < 0, 'profitable on paper while the cash box shrinks', [r1.report.netProfit, r1.report.cash.change]);
  ok(r1.report.notes.some((x) => x.id === 'cash_vs_profit'), 'cash-vs-profit note explains it');
}

// ---------------------------------------------------------------- inventory: buying stock is cash, not (yet) expense
{
  const b = B.create('toyshop');
  const no = B.simulate(b, { marketing: 4000 }, NEUTRAL).report, yes = B.simulate(b, { marketing: 4000, order: 400 }, NEUTRAL).report;
  // 400 × ₪25 goods + 400 × ₪6 shipping = 12,400; duty 12% = 1,488; import VAT 18% of 13,888 = 2,500
  eq(yes.cash.inventoryBought, 13888, 'order 400 units: goods 10,000 + shipping 2,400 + duty 1,488');
  eq(no.cash.change - yes.cash.change, 13888 + 2500 - 2500, 'cash: −13,888 − 2,500 import VAT, VAT reclaimed same month (net −13,888)');
  eq(yes.netProfit, no.netProfit, 'net profit identical: stock becomes expense only when sold');
  eq([yes.inventory.onOrder, yes.inventory.arrived], [400, 0], 'arrives next month (lead time 1)');
  // inventory value conservation over 12 months
  let x = B.create('toyshop'); const rng = seeded(99); let inV = x.stockValue, outV = 0;
  for (let m = 1; m <= 12; m++) { const r = B.simulate(x, m % 3 === 1 ? { marketing: 4000, order: 450 } : null, rng); x = r.business; inV += r.report.cash.inventoryBought; outV += r.report.cogs.goods + r.report.cogs.waste; }
  const pending = x.orders.reduce((s, o) => s + o.value, 0);
  eq(inV, x.stockValue + pending + outV, 'stock value in = sold + dead stock + on hand + on order (no stock created)');
}

// ---------------------------------------------------------------- spoilage grows when demand drops (fresh stock)
{
  let b = B.create('coffee', { overrides: { events: {}, eventChance: 0 } });
  let r = B.simulate(b, null, NEUTRAL); b = r.business; const steady = r.report.cogs.waste;
  b = B.applyShock(b, { demand: 0.6, months: 2 });
  r = B.simulate(b, null, NEUTRAL);
  ok(r.report.cogs.waste >= steady * 2.5, 'demand −40% ⇒ bought by last month\'s sales ⇒ spoilage jumps', [steady, r.report.cogs.waste]);
  ok(r.report.notes.some((x) => x.id === 'waste'), 'spoilage note');
}

// ---------------------------------------------------------------- tax-loss carry-forward, dividend tax, owner injection
{
  let b = lab();
  let r = B.simulate(b, { marketing: 6000 }, NEUTRAL); b = r.business;
  // demand 100 × (1 + 0.5×6000/7000) = 142.86 → 143 → GP 8,580 − opex 10,000 = −1,420
  eq([r.report.units, r.report.ebt, r.report.corpTax, b.taxLoss], [143, -1420, 0, 1420], 'loss month: no tax, loss carried forward');
  r = B.simulate(b, { marketing: 0 }, NEUTRAL); b = r.business;
  eq([r.report.ebt, r.report.corpTax, b.taxLoss], [2000, B.rnd(580 * 0.23), 0], 'next month: tax only on 2,000 − 1,420 = 580');
  r = B.simulate(b, { draw: 1000 }, NEUTRAL);
  eq([r.report.toOwner.drawGross, r.report.toOwner.divTax, r.report.toOwner.drawNet], [1000, 300, 700], 'draw ₪1,000 → ₪300 dividend tax, ₪700 to the owner');
  const poor = lab({ startCapital: 0 });
  const rp = B.simulate(poor, { marketing: 9000 }, NEUTRAL);
  ok(rp.report.toOwner.injection > 0 && rp.business.cash === 0, 'cash would go negative → owner injects exactly the shortfall', rp.report.toOwner);
  eq(rp.business.invested, rp.report.toOwner.injection, 'injection counted as invested capital');
  ok(rp.report.notes[0].id === 'injection', 'injection is the top teaching note');
}

// ---------------------------------------------------------------- decisions: atomic, validated, costs queued
{
  const b = lab();
  const bad = B.applyDecisions(b, { price: 140, fire: 2 });
  ok(!bad.ok && bad.errors.length > 0 && bad.business === b, 'invalid decision set → ok:false, nothing applied', bad.errors);
  ok(!B.applyDecisions(b, { price: 500 }).ok, 'price outside [½×, 2×] rejected');
  ok(!B.applyDecisions(b, { order: 10 }).ok, 'no inventory orders for a no-stock business');
  const good = B.applyDecisions(b, { hire: 1, price: 130 });
  eq([good.ok, good.business.staff, good.business.price, good.costs.hiring], [true, 1, 130, 1250], 'hire 1 (recruiting = ¼ wage) + new price');
  const r = B.simulate(good.business, null, NEUTRAL).report;
  ok(r.opex.oneOffs.some((o) => o.label === 'גיוס והכשרה' && o.amount === 1250), 'recruiting cost paid in the next simulated month');
  const fire = B.applyDecisions(B.applyDecisions(b, { hire: 2 }).business, { fire: 1 });
  eq([fire.ok, fire.business.staff, fire.costs.severance], [true, 1, 5000], 'firing costs one month of wage (notice + severance, simplified)');
}

// ---------------------------------------------------------------- manager frees the owner's time (energy layer)
{
  const b = B.create('coffee');
  const m = B.applyDecisions(b, { manager: true }).business;
  eq([B.ownerEnergy(b), B.ownerEnergy(m), B.incomeKind(b), B.incomeKind(m)], [12, 2, 'active', 'passive'], 'owner-run = −12 energy/month & active income; with a manager −2 & passive');
  const r0 = B.forecast(b, null, 2), r1 = B.forecast(m, null, 2);
  ok(r1.netProfit < r0.netProfit, 'a manager costs profit (coffee cart: tiny businesses cannot afford one)', [r0.netProfit, r1.netProfit]);
}

// ---------------------------------------------------------------- valuation & sale
{
  let a = lab(), m = B.applyDecisions(lab(), { manager: true }).business;
  for (let i = 0; i < 3; i++) { a = B.simulate(a, null, NEUTRAL).business; m = B.simulate(m, null, NEUTRAL).business; }
  const va = B.valuation(a), vm = B.valuation(m);
  // owner-run: EBT 2,000 − buyer's manager 1,000 = 1,000/month; managed: EBT already 1,000. ×12 × (1−23%) × 3 = 27,720 → 27,700
  eq([va.method, va.normMonthlyProfit, va.price], ['profit', 1000, 27700], 'owner-run: buyer deducts a manager wage, 3× after-tax yearly profit');
  eq([vm.normMonthlyProfit, vm.price], [1000, 27700], 'managed business: same value (manager already in the numbers)');
  const s = B.sell(a);
  eq(s.sale.proceeds, 27700 + a.cash, 'proceeds = price + business cash');
  eq(s.sale.tax, B.rnd((s.sale.proceeds - a.invested) * 0.25), '25% capital-gains tax on proceeds − invested');
  ok(s.business.closed && s.business.cash === 0, 'sold business is closed and emptied');
  let threw = false; try { B.simulate(s.business, null, NEUTRAL); } catch { threw = true; }
  ok(threw, 'cannot simulate a sold business');
  const fresh = B.valuation(lab());
  eq(fresh.method, 'assets', 'no history → asset value only');
}

// ---------------------------------------------------------------- startup: burn rate, runway, churn
{
  let b = B.create('app'); const rng = seeded(31);
  const r = B.simulate(b, { marketing: 10000 }, rng).report;
  ok(r.ebt < 0 && r.sub.burn > 0, 'startup burns cash', r.sub);
  eq(r.sub.runway, Math.floor(r.cash.end / r.sub.burn), 'runway = cash ÷ burn');
  eq(r.sub.users, r.sub.before - r.sub.churned + r.sub.newUsers, 'users = before − churned + new');
  ok(r.notes.some((x) => x.id === 'burn'), 'burn note');
  ok(r.sub.ltv > 0 && r.sub.cac > 0, 'LTV and CAC reported', r.sub);
}

// ---------------------------------------------------------------- inflation raises costs, not the price
{
  const b = B.applyInflation(lab(), 10);
  const r = B.simulate(b, null, NEUTRAL).report;
  eq([r.price, r.cogs.total, r.opex.rent], [118, 4400, 3300], 'CPI +10%: unit cost 44, rent 3,300; price unchanged until the player raises it');
}

// ---------------------------------------------------------------- NO MONEY CREATED: every archetype, random decisions, 36 months
for (const id of B.ARCHETYPE_IDS) {
  let b = B.create(id); const rng = seeded(1000 + id.length); const dr = seeded(4242);
  const cash0 = b.cash; let sumChange = 0, billed = 0, collected = 0, bad = null;
  for (let m = 1; m <= 36; m++) {
    let d = null;
    if (m % 3 === 1) {
      const o = B.decisionOptions(b); d = {};
      const x = dr();
      if (x < 0.3) d.price = o.price.steps[Math.floor(dr() * 4)].price; else dr();
      if (x > 0.5 && b.staff < b.p.maxStaff) d.hire = 1; else if (x < 0.15 && b.staff > 0) d.fire = 1;
      d.marketing = o.marketing.presets[Math.floor(dr() * o.marketing.presets.length)];
      if (o.order) d.order = 100 + Math.floor(dr() * 6) * 100; else dr();
      if (dr() < 0.2) d.manager = !b.manager;
      d.draw = [0, 1000, 5000, 20000][Math.floor(dr() * 4)];
      if (dr() < 0.1) d.inject = 5000;
      if (o.expand && dr() < 0.3 && o.expand.done < o.expand.max) d.expand = 1;
      const v = B.applyDecisions(b, d); if (!v.ok) { bad = { m, err: v.errors, d }; break; }
    }
    const { business, report: r } = B.simulate(b, d, rng); b = business;
    const fsum = Object.values(r.flows).reduce((s, x) => s + x, 0);
    if (fsum !== r.cash.change) { bad = { m, why: 'flows ≠ cash change', fsum, change: r.cash.change }; break; }
    if (r.revenue - r.cogs.total - r.opex.total !== r.ebt || r.ebt - r.corpTax !== r.netProfit || r.revenue + r.vatOut !== r.revenueGross) { bad = { m, why: 'P&L does not add up' }; break; }
    if (b.cash < 0 || b.stock < 0 || b.stockValue < 0 || b.users < 0) { bad = { m, why: 'negative balance', cash: b.cash, stock: b.stock }; break; }
    if (r.toOwner.drawGross !== r.toOwner.drawNet + r.toOwner.divTax) { bad = { m, why: 'draw split' }; break; }
    if (Object.values(r.flows).concat([r.revenue, r.netProfit, r.cash.end]).some((x) => !Number.isInteger(x))) { bad = { m, why: 'non-integer ₪' }; break; }
    sumChange += r.cash.change; billed += r.revenueGross; collected += r.cash.collected;
  }
  ok(!bad, `${id}: 36 months of random decisions keep every ledger exact`, bad);
  eq(b.cash, cash0 + sumChange, `${id}: end cash = start + Σ monthly changes`);
  eq(collected + b.ar[0] + b.ar[1], billed, `${id}: collected + still owed = billed (customers never pay twice)`);
}

// ---------------------------------------------------------------- determinism, fixed RNG use, purity, save/resume
{
  const play = (seed, decide) => { let b = B.create('pizza'); const rng = seeded(seed); const reps = []; for (let m = 1; m <= 18; m++) { const r = B.simulate(b, decide && m === 4 ? { hire: 2, marketing: 8000, price: 66 } : null, rng); b = r.business; reps.push(r.report); } return JSON.stringify([b, reps]); };
  eq(play(2024) === play(2024), true, 'same seed ⇒ identical business and reports');
  eq(play(2024) === play(2025), false, 'different seed ⇒ different story');
  // exactly RNG_DRAWS per month regardless of decisions
  const count = (decide) => { let c = 0; const base = seeded(9); const rng = () => { c++; return base(); }; let b = B.create('toyshop'); for (let m = 1; m <= 12; m++) b = B.simulate(b, decide && m % 3 === 1 ? { order: 300, marketing: 8000, hire: m === 1 ? 1 : 0 } : null, rng).business; return c; };
  eq([count(false), count(true)], [12 * B.RNG_DRAWS, 12 * B.RNG_DRAWS], 'simulate consumes exactly 3 draws/month whatever the player decides');
  // purity
  const b0 = B.create('coffee'); const snap = JSON.stringify(b0);
  B.simulate(b0, { hire: 1, marketing: 2000 }, seeded(1)); B.applyDecisions(b0, { price: 16 }); B.sell(b0); B.valuation(b0); B.decisionOptions(b0); B.forecast(b0, { marketing: 3000 }, 3);
  eq(JSON.stringify(b0), snap, 'no function mutates its input business');
  // save/resume mid-run == continuous
  const h1 = { s: 77 }, h2 = { s: 77 };
  let a = B.create('laundromat'), c = B.create('laundromat');
  for (let m = 1; m <= 10; m++) {
    a = B.simulate(a, m === 2 ? { marketing: 3000, expand: 1 } : null, () => R.next(h1, 's')).business;
    c = B.simulate(c, m === 2 ? { marketing: 3000, expand: 1 } : null, () => R.next(h2, 's')).business;
    if (m === 5) { c = JSON.parse(JSON.stringify(c)); h2.s = JSON.parse(JSON.stringify(h2)).s; }
  }
  eq(JSON.stringify(a), JSON.stringify(c), 'JSON round-trip mid-game continues identically');
}

// ---------------------------------------------------------------- suggest / options / summary / data sanity
{
  let b = B.create('toyshop');
  for (let m = 0; m < 2; m++) b = B.simulate(b, m === 0 ? { marketing: 4000 } : null, seeded(3)).business;
  const s = B.suggest(b);
  ok(s.decisions.order > 0 && s.why.length > 0, 'suggest orders stock when it will run out', s);
  ok(B.applyDecisions(b, s.decisions).ok, 'suggested decisions are valid');
  const o = B.decisionOptions(b);
  ok(o.order && o.price.steps.length === 4 && o.manager.wage > 0 && o.sell.price >= 0, 'decisionOptions has all sections');
  const sum = B.summary(b);
  ok(sum.breakEven && sum.valuation && Array.isArray(sum.hist), 'summary for the UI card');
  eq(B.ARCHETYPE_IDS.length >= 4 && B.ARCHETYPE_IDS.length <= 6, true, '4–6 archetypes');
  ok(B.BIZ_LESSONS.every((l) => l.id.startsWith('biz_') && l.title && l.text), 'lessons well-formed');
  for (const id of B.ARCHETYPE_IDS) {
    const b1 = B.create(id);
    ok(Object.keys(b1.p.events).every((e) => B.EVENTS[e]), `${id}: all events exist`);
    ok(B.breakEven(b1).units > 0, `${id}: has a break-even point at default settings`);
  }
}

console.log(fails ? `\n${fails}/${n} FAILED` : `\nall ${n} business tests passed`);
process.exit(fails ? 1 : 0);
