// World mechanic `chain` — w7 רשתות המסחר (docs/full-upgrade/worlds/w7-retail.md). Growth vs profitability.
//
// Contract (DESIGN §4.2): one object of optional hooks; pure and deterministic; NO engine import (helpers arrive in ctx); only + − × ÷ and
// Math.round / min / max / floor. Draws come ONLY from the `world` stream through ctx.draw, with FIXED counts declared in `draws`
// (tests/w7.test.mjs asserts them): 1 per payday (demand noise; its low digits also decide a bad franchisee's brand incident), 2 per 'R'
// (site) landing (the site kind + its sealed location quality; the survey's second-of-three + the franchisee's sealed quality), 0 at init.
//
// The model. A branch is an engine asset with `a.op` = {ck:'branch', kind street|mall|outlet|airport|hood|pack, loc A|B|C (SEALED until
// surveyed or until its sales show it), area 0–9, age (months trading), openAt (fit-out: 2 months of rent and wages before the doors open),
// base (₪ sales a month at maturity in a B location), rent, staff, capex, rate (% a month on its equipment loan), own true|false, fq (a
// franchisee's sealed quality), count (branches in one asset: a bought competitor chain), esc (rent escalation a year)}. Every month:
//   sales = base × loc × ramp[age] × (1 − cannibalisation 6 % × neighbours) × span penalty × cycle × demand × season × brand × shocks
//   own:       profit = sales × fill × (1 − cogs) − rent − staff − interest;   cogs = 62 % − scale (1 % per 5 own branches, max 8 %) − DC 2 %
//   franchise: royalty = 6 % × sales × franchisee quality (no capex, no stock, no span — and not your quality)
// Stock is pooled in one 'inventory' asset (value = stock + in transit at cost, debt = unpaid supplier invoices). An order-up-to rule
// (`Z:cover` months) orders at every payday; goods arrive after 2 months and are paid after the supplier terms (30 or 60 days). The month's
// sold goods were already expensed in the branches' profit, so the payday's inventory cash = cost of goods sold − invoices paid: a growing
// chain's stock and orders eat cash while its profit looks fine. That is the lesson: a profitable chain can run out of money.
// Value (the net-worth goal): own branch 12 × its mature normal-month profit × the cycle multiple × (0.5 + 0.5 × ramp) (floor: 25 % of the
// fit-out); a franchise 12 × royalty × 3. Liquidity (the second goal): (cash + savings + liquid holdings) ÷ the chain's monthly fixed costs.

export const ID = 'chain';
export const DRAWS = Object.freeze({ init: 0, month: 1, landing: Object.freeze({ R: 2 }) });

export const LOC = Object.freeze({ A: 1.25, B: 1.0, C: 0.65 });
export const RAMP = Object.freeze([0.40, 0.55, 0.70, 0.82, 0.92, 1.0]);
const RAMP_CFO = Object.freeze([0.35, 0.50, 0.65, 0.80, 0.90, 1.0]);
/** Calendar demand (Jan → Dec): Pesach, the autumn holidays and the November–December sales. */
export const SEASON = Object.freeze([0.93, 0.90, 1.0, 1.08, 0.97, 0.95, 1.0, 1.03, 1.18, 1.06, 0.95, 1.10]);
export const DEM = Object.freeze({ pro: Object.freeze({ exp: 1.10, slow: 1.0, rec: 0.86, recov: 0.96 }), counter: Object.freeze({ exp: 0.97, slow: 1.0, rec: 1.06, recov: 1.0 }) });
export const MULT = Object.freeze({ exp: 4.6, slow: 4.2, rec: 3.6, recov: 4.0 });
export const KIND_LABEL = Object.freeze({ street: 'סניף רחוב', mall: 'סניף בקניון', outlet: 'סניף אאוטלט', airport: 'סניף בנמל התעופה', hood: 'חנות שכונתית', pack: 'רשת מתחרה' });
export const LOC_LABEL = Object.freeze({ A: 'מיקום מצוין', B: 'מיקום סביר', C: 'מיקום חלש' });
const COGS = Object.freeze({ base: 0.62, perFive: 0.01, maxDisc: 0.08, dc: 0.02, terms60: 0.01 });
const SPAN = Object.freeze({ perMgr: 6, owner: 3, pen: 0.05, floor: 0.5, wage: 70000, hire: 120000 });
const CANNIB = Object.freeze({ per: 0.06, max: 0.3 });
export const AREAS = 10;
const STOCK = Object.freeze({ lead: 2, over: 2.5, markdown: 0.15, clear: 0.25, covers: Object.freeze([0.5, 1, 1.5, 2, 3]), initCover: 1.5 });
export const ROYALTY = Object.freeze({ pct: 0.06, pctFranchisor: 0.08, mult: 4.5, fee: 0.15, sys: 1500000, buyBack: 4, convert: 0.7, fqMin: 0.6, fqSpan: 0.55, badFq: 0.35, interestP: 0.55 });
const FIT = Object.freeze({ months: 2, staff: 0.5, salvage: 0.25 });
const CLOSE = Object.freeze({ min: 0.2, span: 0.4 });
const SURVEY = Object.freeze({ fee: 30000 });
const BRAND = Object.freeze({ start: 62, founder: 75, drift: 0.25, home: 68, incident: 6, span: 0.5 });
const DEMAND = Object.freeze({ min: 0.86, max: 1.14, revert: 0.15, noise: 0.08 });
const ECOM = Object.freeze({ share: 0.08, fixed: 120000, ramp: 9 });
const DC = Object.freeze({ fixed: 150000, lease: 0.7, rent: 0.009 });
const INSOLV = Object.freeze({ fixed: 1, paydays: 3 });
const CFO_RATE = 0.3;          // the CFO's bank loans: −0.3 pp a month (a rebate on the bank interest, the module's expense hook)
export const MAX_BRANCHES = 40;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r10 = (x) => Math.round(x / 10) * 10;
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;

/* ---------------------------------------------------------------- state helpers */
const W = (st) => st.world;
const C = (st) => st.world.chain;
const branches = (st) => st.assets.filter((a) => a.op && a.op.ck === 'branch');
const own = (st) => branches(st).filter((a) => a.op.own);
const fran = (st) => branches(st).filter((a) => !a.op.own);
const inv = (st) => st.assets.find((a) => a.op && a.op.ck === 'inv') || null;
const dcOf = (st) => st.assets.find((a) => a.op && a.op.ck === 'dc') || null;
const ecomOf = (st) => st.assets.find((a) => a.op && a.op.ck === 'ecom') || null;
const isFounder = (st) => st.charId === 'shopFounder';
const isCfo = (st) => st.charId === 'cfo';
const isFranchisor = (st) => st.charId === 'franchisor';
const royPct = (st) => (isFranchisor(st) ? ROYALTY.pctFranchisor : ROYALTY.pct); // the big franchisor's own system earns 8 %
const phaseOf = (st) => (st.econ && st.econ.phase) || 'slow';
const cnt = (a) => a.op.count || 1;
const ownCount = (st) => own(st).reduce((s, a) => s + cnt(a), 0);
const calAt = (st, ctx, m) => { const c0 = ctx.calOf(st); return (((c0 - 1 + (m - st.month)) % 12) + 12) % 12 + 1; };
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
const findBranch = (st, id) => { const n = +String(id || '').replace(/^a/, ''); return st.assets.find((x) => x.id === n && x.op && x.op.ck === 'branch') || null; };

export const rampOf = (st, o) => { const R = isCfo(st) ? RAMP_CFO : RAMP; const i = (o.age || 0) + (isFounder(st) ? 1 : 0); return i >= R.length ? 1 : R[i]; };
export function spanOf(st) { const c = C(st); return c.managers * SPAN.perMgr + SPAN.owner; }
export function spanPenalty(st) { const over = Math.max(0, ownCount(st) - spanOf(st)); return round3(Math.max(SPAN.floor, 1 - SPAN.pen * over)); }
export function cogsOf(st) {
  const n = ownCount(st); const c = C(st); let x = COGS.base - Math.min(COGS.maxDisc, COGS.perFive * Math.floor(n / 5));
  if (dcOf(st)) x -= COGS.dc; if (c.terms === 60 && !isCfo(st)) x += COGS.terms60;
  for (const s of c.shocks) if (s.t === 'cogs' && s.from <= st.month && s.until >= st.month) x += s.v;
  return round3(x);
}
const brandF = (st) => round3(0.85 + 0.3 * C(st).brand / 100);
function neighbours(st, a) { const c = C(st); let k = c.rivals[a.op.area] || 0; for (const x of st.assets) if (x.op && x.op.ck === 'branch' && x.id !== a.id && x.op.area === a.op.area && (x.op.openAt || 0) <= st.month) k++; return k; }
// chainMonth(st.month) is asked for by every branch's cash flow, the metrics and the panel: one computation per state (a pure cache keyed
// by everything it reads — the result is identical with or without it)
const MEMO = new WeakMap();
function memoKey(st) { // every module mutation bumps VER (bump); engine-side changes show in the month, phase, asset count and next id
  const c = C(st); const i = inv(st);
  return `${st.month}|${phaseOf(st)}|${VER.get(st) || 0}|${st.assets.length}|${st.nextId}|${i ? i.op.stock : 0}|${c.brand}|${c.demand}|${c.managers}|${c.terms}`;
}
const VER = new WeakMap(); // a per-object counter OUTSIDE the state (never serialized): it only invalidates the cache
const bump = (st) => { VER.set(st, (VER.get(st) || 0) + 1); };
function shockMult(st, o, month) { let m = 1; for (const s of C(st).shocks) if (s.t === 'demand' && s.from <= month && s.until >= month && (!s.loc || s.loc === o.loc)) m *= s.v; return m; }

/**
 * A branch's raw monthly sales (₪, before stock-outs) in month `month` at the state's phase. norm = the valuation's normal month (mature,
 * slow phase, demand 1, season 1, no shocks, full span).
 */
export function salesOf(st, a, ctx, month = st.month, norm = false) {
  const o = a.op;
  if (!norm && (o.openAt || 0) > month) return 0;
  const ph = norm ? 'slow' : phaseOf(st);
  const ramp = norm ? 1 : rampOf(st, o);
  const can = Math.min(CANNIB.max, CANNIB.per * neighbours(st, a));
  const span = o.own && !norm ? spanPenalty(st) : 1;
  const season = norm ? 1 : SEASON[calAt(st, ctx, month) - 1];
  const dem = norm ? 1 : C(st).demand;
  const q = o.own ? 1 : ROYALTY.fqMin + ROYALTY.fqSpan * (o.fq ?? 0.5);
  const v = o.base * cnt(a) * LOC[o.loc || 'B'] * ramp * (1 - can) * span * DEM[o.cyc || 'pro'][ph] * dem * season * brandF(st) * q * (norm ? 1 : shockMult(st, o, month));
  return Math.round(v);
}
/** The chain's month: raw sales per own branch, the stock they need and the fill rate (one pool of stock for every branch). */
export function chainMonth(st, ctx, month = st.month) {
  if (month === st.month) { const key = memoKey(st); const m = MEMO.get(st); if (m && m.key === key) return m.cm; const cm = chainMonthRaw(st, ctx, month); MEMO.set(st, { key, cm }); return cm; }
  return chainMonthRaw(st, ctx, month);
}
function chainMonthRaw(st, ctx, month) {
  const cogs = cogsOf(st); const by = new Map(); let need = 0;
  for (const a of own(st)) { const s = salesOf(st, a, ctx, month); by.set(a.id, s); need += s * cogs; }
  const i = inv(st); const stock = i ? i.op.stock : 0;
  const fill = need > 0 ? round3(Math.min(1, stock / need)) : 1;
  return { by, need: Math.round(need), fill, cogs, stock };
}
/** One branch's month (cf after interest) — the asset's cash flow. */
export function branchMonth(st, a, ctx, cm = null, month = st.month) {
  const o = a.op; const interest = Math.round(a.debt * (o.rate || 0) / 100);
  const wage = C(st).wage;
  if (!o.own) { const s = salesOf(st, a, ctx, month); const roy = Math.round(s * royPct(st)); return { cf: r10(roy - interest), sales: s, royalty: roy, interest, fixed: 0, open: (o.openAt || 0) <= month }; }
  const fixed = Math.round((o.rent + o.staff * wage) * cnt(a));
  if ((o.openAt || 0) > month) { const f = Math.round((o.rent + o.staff * wage * FIT.staff) * cnt(a)); return { cf: r10(-f - interest), sales: 0, sold: 0, gm: 0, fixed: f, interest, fitout: true, open: false }; }
  const M = cm || chainMonth(st, ctx, month);
  const s = M.by.has(a.id) ? M.by.get(a.id) : salesOf(st, a, ctx, month);
  const sold = Math.round(s * M.fill); const gm = Math.round(sold * (1 - M.cogs));
  return { cf: r10(gm - fixed - interest), sales: s, sold, lost: s - sold, gm, fixed, interest, open: true };
}
/** Mature normal-month profit of a branch (the valuation's base and the card's "a mature month"). */
export function matureProfit(st, a, ctx) {
  const o = a.op; const s = salesOf(st, a, ctx, st.month, true);
  if (!o.own) return Math.round(s * royPct(st));
  return Math.round(s * (1 - cogsOf(st)) - (o.rent + o.staff * C(st).wage) * cnt(a));
}
export function branchValue(st, a, ctx) {
  const o = a.op; const P = matureProfit(st, a, ctx);
  if (!o.own) return r1000(Math.max(0, 12 * P * ROYALTY.mult * ((o.openAt || 0) > st.month ? 0.5 : 1)));
  const ramp = (o.openAt || 0) > st.month ? 0 : rampOf(st, o);
  return r1000(Math.max(o.capex * cnt(a) * FIT.salvage, 12 * P * (MULT[phaseOf(st)] || MULT.slow) * (0.5 + 0.5 * ramp)));
}
function revalue(st, ctx) {
  for (const a of branches(st)) a.value = branchValue(st, a, ctx);
  const i = inv(st); if (i) i.value = Math.round(i.op.stock + i.op.transit.reduce((s, x) => s + x.amt, 0));
  const e = ecomOf(st); if (e) e.value = r1000(Math.max(e.cost * 0.3, 12 * Math.max(0, ecomMonth(st, e, ctx, true).cf) * 3));
}
/** The chain's fixed costs a month (rent + wages of own branches, fit-outs included, + managers + DC + e-commerce) — the liquidity unit. */
export function fixedMonth(st, ctx) {
  let f = C(st).managers * SPAN.wage; const wage = C(st).wage; void ctx;
  for (const a of own(st)) { const o = a.op; f += Math.round((o.rent + o.staff * wage * ((o.openAt || 0) > st.month ? FIT.staff : 1)) * cnt(a)); }
  if (dcOf(st)) f += DC.fixed + (dcOf(st).op.lease || 0);
  if (ecomOf(st)) f += ECOM.fixed;
  return Math.round(f);
}
function ecomMonth(st, a, ctx, norm = false) {
  const age = Math.max(0, st.month - a.op.from); const ramp = norm ? 1 : Math.min(1, (age + 1) / ECOM.ramp);
  let gm = 0; const cm = norm ? null : chainMonth(st, ctx);
  for (const b of own(st)) gm += norm ? Math.max(0, salesOf(st, b, ctx, st.month, true) * (1 - cogsOf(st))) : branchMonth(st, b, ctx, cm).gm || 0;
  const interest = norm ? 0 : Math.round(a.debt * (a.op.rate || 0) / 100);
  return { cf: r10(gm * ECOM.share * ramp - ECOM.fixed - interest), ramp: round2(ramp) };
}
/** Liquid money (cash + savings + liquid holdings) and the months of fixed costs it covers. */
function liquidOf(st, ctx) { return Math.round(st.cash + (st.savings || 0) + ctx.holdingsValue(st)); }
export function liqMonths(st, ctx) { const f = fixedMonth(st, ctx); return f > 0 ? round2(Math.max(0, liquidOf(st, ctx)) / f) : 99; }
/** Expected stock need a month over the lead time (the order rule's unit): own branches at the next months' season. */
function needAhead(st, ctx) {
  let n = 0; const cogs = cogsOf(st);
  for (let k = 1; k <= STOCK.lead + 1; k++) for (const a of own(st)) n += salesOf(st, { ...a, op: { ...a.op, age: (a.op.age || 0) + ((a.op.openAt || 0) <= st.month ? k : Math.max(0, st.month + k - (a.op.openAt || 0))) } }, ctx, st.month + k) * cogs;
  return Math.round(n / (STOCK.lead + 1));
}
/** Markdown line (months of sales on hand): 2.5, or the cover rule + 1 when the player chose to hold more. */
const overLine = (c) => Math.max(STOCK.over, c.cover + 1);
const nextPeak = (st, ctx) => { for (let k = 0; k <= 3; k++) if (SEASON[calAt(st, ctx, st.month + k) - 1] >= 1.08) return true; return false; };

/** The site card's public numbers by location: mature month profit for each possible location, the cash an opening needs. */
function siteInfo(st, p, ctx) {
  const s = p.site; const o = { ck: 'branch', kind: s.kind, base: s.base, rent: s.rent, staff: s.staff, capex: s.capex, own: true, area: p.area, cyc: s.cyc || 'pro', age: 99, openAt: 0, count: 1 };
  const cogs = cogsOf(st); const wage = C(st).wage;
  const at = (loc, ownB = true) => { const a = { id: -1, debt: 0, op: { ...o, loc, own: ownB, fq: 0.5 } }; const sales = salesOf(st, a, ctx, st.month, true); return ownB ? Math.round(sales * (1 - cogs) - (o.rent + o.staff * wage)) : Math.round(sales * royPct(st)); };
  const locs = p.surveyed ? p.pair : s.fixedLoc ? [s.fixedLoc] : ['A', 'B', 'C'];
  const prof = Object.fromEntries(locs.map((l) => [l, at(l)]));
  const roy = Object.fromEntries(locs.map((l) => [l, at(l, false)]));
  const pr = p.surveyed ? Object.fromEntries(locs.map((l) => [l, 1 / locs.length])) : s.fixedLoc ? { [s.fixedLoc]: 1 } : s.prior;
  const exp = Math.round(locs.reduce((x, l) => x + (pr[l] || 0) * prof[l], 0));
  const worst = Math.min(...locs.map((l) => prof[l]));
  const down = Math.round(s.capex * s.downPct);
  const initStock = Math.round(s.base * cogs * STOCK.initCover);
  const fit = (s.rent + s.staff * wage * FIT.staff) * FIT.months;
  const ramp6 = Math.round(locs.reduce((x, l) => x + (pr[l] || 0) * rampLoss(st, s, l, ctx), 0));
  const cashNeed = Math.round(down + fit + Math.max(0, -ramp6) + SURVEY.fee * 0);
  return { prof, roy, exp, worst, down, initStock, fit: Math.round(fit), rampLoss: ramp6, cashNeed, locs, prior: pr };
}
function rampLoss(st, s, loc, ctx) {
  const R = isCfo(st) ? RAMP_CFO : RAMP; const cogs = cogsOf(st); const wage = C(st).wage; let sum = 0;
  for (let k = 0; k < 6; k++) { const i = k + (isFounder(st) ? 1 : 0); const ramp = i >= R.length ? 1 : R[i]; sum += Math.min(0, s.base * LOC[loc] * ramp * brandF(st) * (1 - cogs) - (s.rent + s.staff * wage)); }
  void ctx; return Math.round(sum);
}

/** World-data helper: a branch opening on the 'O' deck (a known location; the seller's numbers go through the engine's due diligence).
 *  cf = the mature month at the default brand and list cogs (what the card shows); cf0 keeps the claim so asset.create can apply the truth. */
export function branchCard({ k = 'street', n, d, base, rent, staff, capex, downPct = 0.5, loc = 'B', area = 2, cyc = 'pro', esc = 0, q = null, rate = 0.6 }) {
  const cf = r10(base * LOC[loc] * (0.85 + 0.3 * BRAND.start / 100) * (DEM[cyc] || DEM.pro).slow * (1 - COGS.base) - rent - staff);
  return { k, n, d, cost: capex, down: Math.round(capex * downPct), value: Math.round(capex * FIT.salvage), cf, cf0: cf, ...(q ? { q } : {}),
    op: { ck: 'branch', kind: k, loc, area, base, rent, staff, capex, rate, own: true, cyc, esc, count: 1, age: 0, surveyed: true } };
}

/* ---------------------------------------------------------------- the module */
export const chain = {
  id: ID, draws: DRAWS,
  lessons: ['growth_cash', 'ramp_up', 'management_span', 'inventory_cover', 'own_franchise', 'working_capital'],
  mentorKeys: ['siteAsk', 'siteOwn', 'siteFranchise', 'sitePass', 'surveyed', 'stockout', 'overstock', 'overSpan', 'opened'],
  sealed: ['pending.wr', 'pending.truth', 'assets[].op.loc', 'assets[].op.fq'],

  init(st, w, ch, ctx) {
    const c = { managers: ch.managers || 0, terms: isCfo(st) ? 60 : 30, cover: 1.5, demand: 1, brand: isFounder(st) ? BRAND.founder : BRAND.start, wage: 1, rivals: new Array(AREAS).fill(0), shocks: [],
      lost: 0, markdowns: 0, stockouts: 0, incidents: 0, opened: 0, closed: 0, franSys: isFranchisor(st), lastSpanOver: 0, payables: [] };
    W(st).chain = c;
    const iv = { id: st.nextId++, k: 'inventory', n: 'המלאי של הרשת', cost: 0, down: 0, debt: 0, value: 0, month: st.month, ups: 0, cpi: 1, cf: 0, op: { ck: 'inv', stock: 0, transit: [] } };
    st.assets.push(iv);
    void ctx; // the character's starting branches are added after init (createGame): asset.create gives each its paid starting stock
  },
  defaults(st) { const c = C(st); if (!c) return; if (!Array.isArray(c.shocks)) c.shocks = []; if (!Array.isArray(c.payables)) c.payables = []; if (!Array.isArray(c.rivals)) c.rivals = new Array(AREAS).fill(0); },

  monthly(st, out, ctx) {
    bump(st); const c = C(st); const r = ctx.draw(st); // exactly 1 'world' draw every payday
    const pm = st.month - 1; const iv = inv(st);
    // 1. the month just paid: stock consumed by what the own branches sold (its cost was already expensed in their profit)
    const cm = chainMonth(st, ctx, pm); let sold = 0, lost = 0;
    for (const a of own(st)) { if ((a.op.openAt || 0) > pm) continue; const s = cm.by.get(a.id) || 0; sold += s * cm.fill; lost += s * (1 - cm.fill); }
    const used = Math.round(Math.min(iv.op.stock, sold * cm.cogs)); iv.op.stock -= used;
    if (lost > 1000) { c.lost += Math.round(lost); c.stockouts++; out.news.push({ kind: 'chain', text: ctx.mentorLine(st, 'stockout', { lost: ctx.fmtM(Math.round(lost * (1 - cm.cogs))) }) || `נגמר המלאי: הסניפים איבדו מכירות, ו־${ctx.fmtM(Math.round(lost * (1 - cm.cogs)))} רווח הלכו למתחרים.` }); ctx.lesson(st, out, 'inventory_cover'); }
    // 2. arrivals, invoices due
    const arrived = iv.op.transit.filter((x) => x.arrives <= st.month); iv.op.transit = iv.op.transit.filter((x) => x.arrives > st.month);
    for (const x of arrived) iv.op.stock += x.amt;
    let paid = 0; c.payables = c.payables.filter((x) => { if (x.due <= st.month) { paid += x.amt; return false; } return true; });
    iv.debt = Math.max(0, iv.debt - paid);
    // 3. overstock markdown
    const need1 = Math.max(1, cm.need); const over = iv.op.stock - overLine(c) * need1;
    if (cm.need > 0 && over > 0) { const md = Math.round(over * STOCK.markdown); iv.op.stock -= md; c.markdowns += md; out.news.push({ kind: 'chain', text: ctx.mentorLine(st, 'overstock', { md: ctx.fmtM(md) }) || `יותר מדי מלאי במחסנים: סחורה ישנה נמכרת בהנחה — ${ctx.fmtM(md)} ירדו מהשווי.` }); ctx.lesson(st, out, 'inventory_cover'); }
    // 4. the inventory cash of the month: + cost of what was sold, − the invoices paid
    const cashIn = used - paid; st.cash += cashIn;
    if (cashIn) ctx.cashFx(out, cashIn, `מלאי וספקים ${ctx.sgn(cashIn)}`);
    // 5. age, rent escalation, branch open news
    for (const a of branches(st)) { const o = a.op; if ((o.openAt || 0) <= pm) o.age = (o.age || 0) + 1;
      if (o.openAt === st.month) { out.news.push({ kind: 'chain', text: ctx.mentorLine(st, 'opened', { name: a.n }) || `${a.n} נפתח החודש. חצי שנה עד שהוא מגיע למכירות מלאות.`, assetId: 'a' + a.id }); ctx.lesson(st, out, 'ramp_up'); }
      if (o.esc && o.age > 0 && o.age % 12 === 0) o.rent = Math.round(o.rent * (1 + o.esc)); }
    // 6. demand noise; a bad franchisee's incident (the draw's low digits)
    const r2 = (r * 997) % 1;
    c.demand = round3(clamp(c.demand + DEMAND.revert * (1 - c.demand) + (r - 0.5) * DEMAND.noise, DEMAND.min, DEMAND.max));
    const badL = fran(st).filter((a) => (a.op.fq ?? 0.5) < ROYALTY.badFq); const bad = badL.length; let incident = false;
    if (bad && r2 < 0.05 * bad) { // the culprit (by the same draw) is now known: the panel shows it and suggests ending that franchise
      const who = badL[Math.min(bad - 1, Math.floor(r2 / 0.05))]; who.op.fqKnown = true; incident = true;
      c.brand = Math.max(20, round2(c.brand - BRAND.incident)); c.incidents++; out.news.push({ kind: 'chain', text: `הזכיין של ${who.n} עשה בושות: ביקורות רעות ברשתות. המותג נפגע — בכל הסניפים, גם שלך.`, assetId: 'a' + who.id }); ctx.lesson(st, out, 'own_franchise'); }
    // 7. span
    const overN = Math.max(0, ownCount(st) - spanOf(st));
    if (overN > 0) { c.brand = Math.max(20, round2(c.brand - BRAND.span * overN)); if (!c.lastSpanOver) out.news.push({ kind: 'chain', text: ctx.mentorLine(st, 'overSpan', { n: String(overN) }) || `יש ${overN} סניפים מעבר למה שהמנהלים מסוגלים להחזיק. כל הסניפים מוכרים פחות.` }); ctx.lesson(st, out, 'management_span'); }
    else if (!incident) c.brand = round2(Math.min(BRAND.home + 10, c.brand + (c.brand < BRAND.home ? BRAND.drift : 0)));
    c.lastSpanOver = overN;
    if (st.life && st.life.energy != null && ownCount(st) > c.managers * SPAN.perMgr && ownCount(st) > 0) st.life.energy = Math.max(5, st.life.energy - 1); // the owner runs the branches no manager covers
    // 8. expire shocks; the order-up-to rule (goods in 2 months, invoices after the terms)
    c.shocks = c.shocks.filter((s) => s.until >= st.month);
    const lead = STOCK.lead + (c.shocks.some((s) => s.t === 'ship') ? 1 : 0);
    const nd = needAhead(st, ctx); const pos = iv.op.stock + iv.op.transit.reduce((s, x) => s + x.amt, 0);
    const want = Math.round((STOCK.lead + c.cover) * nd - pos);
    const hold = (c.holdUntil || 0) >= st.month;
    if (hold) out.news.push({ kind: 'chain', text: 'הספקים מחכים לכסף: החודש לא נשלחה הזמנה חדשה. מדפים ריקים בעוד חודשיים.' });
    if (want > 10000 && !hold) { const amt = r1000(want); const terms = c.shocks.some((s) => s.t === 'terms30') ? 30 : c.terms; iv.op.transit.push({ amt, arrives: st.month + lead }); c.payables.push({ amt, due: st.month + terms / 30 }); iv.debt += amt; }
    if (st.cash < 0) ctx.ensureCash(st, out, 'stock');
    // insolvency while profitable (the w7 lesson): bank debt pushed by forced loans beyond what the bank lends voluntarily, by more than
    // INSOLV.fixed months of the chain's fixed costs. The suppliers stop shipping (no order next payday); 3 such paydays in a row and the
    // bank calls the loans — bankruptcy, whatever the branches are worth on paper.
    const capRoom = ctx.loanCap(st); const gap = st.loans - capRoom; const fx = fixedMonth(st, ctx);
    if (Number.isFinite(capRoom) && fx > 0 && gap > INSOLV.fixed * fx) {
      c.squeeze = (c.squeeze || 0) + 1; c.holdUntil = st.month + 1; ctx.lesson(st, out, 'growth_cash');
      if (c.squeeze >= INSOLV.paydays) { st.flags.bankrupt = true; c.insolvent = st.month; out.news.push({ kind: 'chain', text: `הבנק קרא להלוואות. הרשת רווחית על הנייר — אבל אין לה מזומן לשלם לספקים ולבנק.` }); }
      else out.news.push({ kind: 'chain', text: `הבנק מודאג: החוב גדול ממה שהוא מוכן לתת (${ctx.fmtM(gap)} מעל המסגרת). הספקים עוצרים משלוחים. עוד ${INSOLV.paydays - c.squeeze} ${INSOLV.paydays - c.squeeze === 1 ? 'משכורת' : 'משכורות'} כאלה — והבנק יקרא להלוואות.` });
    } else c.squeeze = 0;
    if (own(st).some((a) => a.op.openAt > pm) && st.stats.paydays > 1) ctx.lesson(st, out, 'growth_cash');
    bump(st); revalue(st, ctx);
  },

  asset: {
    create(st, a, card, ctx) {
      const op = JSON.parse(JSON.stringify(card.op));
      if (op.ck === 'branch' && card.cf0 != null && card.cf !== card.cf0) { // a deck branch bought at its due-diligence truth: sales so that the mature month equals it
        const fx = op.rent + op.staff; op.base = Math.round(op.base * clamp((card.cf + fx) / Math.max(1, card.cf0 + fx), 0.55, 1.35)); }
      if (op.ck === 'branch') { op.age = op.age ?? 0; op.area = op.area ?? 0; op.count = op.count || 1; if (op.openAt == null) op.openAt = st.month + FIT.months;
        if (op.start && op.own && inv(st)) { const iv = inv(st); const m1 = Math.round(op.base * op.count * COGS.base); iv.op.stock += Math.round(m1 * STOCK.initCover); // a trading branch comes with its (paid) stock …
          for (let k = 1; k <= STOCK.lead; k++) { const x = iv.op.transit.find((t) => t.arrives === st.month + k); if (x) x.amt += m1; else iv.op.transit.push({ amt: m1, arrives: st.month + k }); } } // … and its pipeline (paid)
        delete op.start; }
      if (op.ck === 'ecom') op.from = st.month;
      a.op = op; a.cf = 0; bump(st);
      if (op.ck === 'branch' && C(st)) a.value = branchValue(st, a, ctx);
    },
    cf(st, a, ctx, neutral) {
      const o = a.op;
      if (o.ck === 'inv') return 0;
      if (o.ck === 'dc') return r10(-DC.fixed - (o.lease || 0) - Math.round(a.debt * (o.rate || 0) / 100));
      if (o.ck === 'ecom') return ecomMonth(st, a, ctx).cf;
      void neutral; return branchMonth(st, a, ctx).cf;
    },
  },
  expense(st) { return isCfo(st) && st.loans > 0 ? -Math.round(st.loans * CFO_RATE / 100) : 0; },

  deal: {
    describe(st, p, ev, ctx) {
      const c = p.card; if (!c.op) return;
      const o = c.op;
      if (o.ck === 'dc') ev.data.chain = { ck: 'dc', fixed: DC.fixed, cogsCut: COGS.dc, saving: Math.round(own(st).reduce((s, a) => s + (branchMonth(st, a, ctx).sold || 0), 0) * COGS.dc), note: 'מרכז הפצה מוריד 2% מעלות הסחורה של כל הסניפים — כדאי רק לרשת גדולה מספיק.' };
      if (o.ck === 'ecom') ev.data.chain = { ck: 'ecom', fixed: ECOM.fixed, share: ECOM.share, rampMonths: ECOM.ramp, note: 'אתר מוסיף 8% מהרווח הגולמי של הסניפים שלך, אחרי 9 חודשי הרצה. עלות קבועה ₪120 אלף בחודש.' };
      if (o.ck === 'branch') { ev.data.chain = { ck: 'branch', kind: o.kind, count: o.count || 1, fit: FIT.months, note: 'רשת שלמה בבת אחת: מכירות מיד, וגם בעיית ניהול מיד — כל 6 סניפים צריכים מנהל אזור.' }; }
      if (o.ck === 'branch' && ownCount(st) + (o.count || 1) > MAX_BRANCHES) for (const x of ev.options) if (x.kind === 'buy') { x.enabled = false; x.reason = 'הרשת הגיעה ל־40 סניפים'; }
    },
  },

  market: {
    create(st, p) {
      const c = p.card; const ch = C(st); const m = st.month; bump(st);
      if (c.mk === 'supplier') ch.shocks.push({ t: 'cogs', v: c.pct, from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'ship') ch.shocks.push({ t: 'ship', from: m, until: m + (c.months || 1) - 1, n: c.n });
      if (c.mk === 'viral') ch.shocks.push({ t: 'demand', v: 1 + c.add, from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'mall') ch.shocks.push({ t: 'demand', v: 1 - c.drop, loc: 'C', from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'wage') ch.wage = round3(ch.wage * (1 + c.pct));
      if (c.mk === 'credit') ch.shocks.push({ t: 'terms30', from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'rival') { const by = new Array(AREAS).fill(0); for (const a of branches(st)) by[a.op.area] += cnt(a); let best = 0; for (let i = 1; i < AREAS; i++) if (by[i] > by[best]) best = i; ch.rivals[best] = Math.min(3, (ch.rivals[best] || 0) + 1); p.hit = [best]; }
    },
    describe(st, p, ev) {
      const c = p.card; ev.data.chain = { mk: c.mk, months: c.months || null, area: p.hit ? p.hit[0] : null };
      if (!branches(st).length) { ev.auto = true; ev.toastText = c.n; }
    },
  },
  crisis: {
    create(st, p) {
      const c = p.card; const ch = C(st); bump(st);
      if (c.mk === 'scandal') { if (fran(st).length) { ch.brand = Math.max(20, round2(ch.brand - 10)); ch.incidents++; p.card.cash = 0; } else p.card.cash = 0; }
    },
  },

  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out, ctx) {
    const cm = chainMonth(st, ctx); const over = Math.max(0, ownCount(st) - spanOf(st));
    for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || a.op.ck !== 'branch') continue;
      const o = a.op; const r = rampOf(st, o); const open = (o.openAt || 0) <= st.month;
      m.stage = !open ? 0 : r < 0.6 ? 1 : r < 0.85 ? 2 : r < 1 ? 3 : 4; m.lights = m.stage / 4; m.own = !!o.own; m.franchise = !o.own; m.fitout = !open; m.flicker = !!(o.own && over > 0); m.count = cnt(a); m.area = o.area; m.stockout = o.own && cm.fill < 0.98; }
    for (let i = 0; i < C(st).managers; i++) out.push({ key: 'chain:mgr:' + i, assetId: 'chain:mgr:' + i, model: (ctx.world(st).models || {}).manager || 'regional_office', label: 'מנהל אזור', kind: 'manager', links: SPAN.perMgr });
  },
  recapHint(st) {
    const c = C(st); if (!c) return null;
    if (!branches(st).length) return 'בפעם הבאה: סניפים. ברשתות המסחר השווי נבנה מסניפים שמוכרים — לא מהמשכורת.';
    if (st.stats.forcedLoans > 0 && c.opened >= 4) return 'בפעם הבאה: לפתוח לאט יותר. כל סניף חדש בולע שיפוץ, מלאי וחצי שנה של הפסדים — והבנק החליט בשבילך.';
    if (c.lastSpanOver > 0) return 'בפעם הבאה: מנהל אזור לכל 6 סניפים. בלי מנהלים כל הסניפים מוכרים פחות — גם הישנים.';
    if (c.stockouts >= 4) return 'בפעם הבאה: יותר מלאי לפני החגים. סחורה מגיעה אחרי חודשיים — ומדף ריק מוכר אפס.';
    return null;
  },
  goalValue(st, key, ctx) {
    if (key === 'liqMonths') return liqMonths(st, ctx);
    if (key === 'liquid') return liquidOf(st, ctx);
    if (key === 'fixedMonth') return fixedMonth(st, ctx);
    return 0;
  },
};

/* ---------------------------------------------------------------- 'R' — a site for a branch (an opening offer) */
/** Location truth of a site from the draw r (the site kind's prior; the airport is always A). */
function locFrom(prior, x) { let acc = 0; for (const l of ['A', 'B', 'C']) { acc += prior[l] || 0; if (x < acc) return l; } return 'C'; }
chain.tiles.R = {
  safe: 'pass',
  create(st, ctx) {
    const r1 = ctx.draw(st), r2 = ctx.draw(st); // exactly 2 'world' draws on every R landing, whatever is chosen
    const sites = ctx.world(st).sites || [];
    const s = sites[Math.min(sites.length - 1, Math.floor(r1 * sites.length))];
    const sub = (r1 * sites.length) % 1;
    const loc = s.fixedLoc || locFrom(s.prior, sub);
    const pair = loc === 'A' ? ['A', 'B'] : loc === 'C' ? ['B', 'C'] : (r2 * 13) % 1 < 0.5 ? ['A', 'B'] : ['B', 'C'];
    const area = Math.floor(((r1 * 7919) % 1) * AREAS);
    const interested = isFranchisor(st) || ((r2 * 31) % 1) < ROYALTY.interestP;
    return { wr: [r1, r2], site: JSON.parse(JSON.stringify(s)), truth: { loc, fq: round3(r2) }, pair: s.fixedLoc ? [loc] : pair, area, surveyed: !!s.fixedLoc, franchiseOk: interested };
  },
  describe(st, p, ev, ctx) {
    const s = p.site; const I = siteInfo(st, p, ctx); const c = C(st);
    ev.tag = 'מיקום לסניף'; ev.title = s.n;
    const full = ownCount(st) >= MAX_BRANCHES;
    const locTxt = p.surveyed ? I.locs.map((l) => LOC_LABEL[l]).join(' או ') : 'לא ידוע (הסוכן אומר: "מיקום מצוין")';
    ev.text = `${s.d} שיפוץ והקמה ${ctx.fmtM(s.capex)} (מקדמה ${ctx.fmtM(I.down)}), שכירות ${ctx.fmtM(s.rent)} בחודש. אזור ${p.area + 1}. המיקום: ${locTxt}.`;
    ev.mentor = ctx.mentorLine(st, 'siteAsk', {}) || 'סניף חדש בולע מזומן חצי שנה לפני שהוא מרוויח. כמה כרית תישאר לך — ומי ינהל אותו?';
    const liq = liquidOf(st, ctx); const fx = fixedMonth(st, ctx) + s.rent + s.staff * c.wage;
    const after = liq - I.cashNeed; const runway = fx > 0 ? round2(after / fx) : 99;
    const spanLeft = spanOf(st) - ownCount(st);
    ev.data = { site: s.kind, label: KIND_LABEL[s.kind], area: p.area, surveyed: !!p.surveyed, locs: I.locs, prior: I.prior, mature: I.prof, royalty: I.roy, expected: I.exp, worst: I.worst, capex: s.capex, down: I.down, rent: s.rent,
      fitMonths: FIT.months, fitCost: I.fit, rampLoss: I.rampLoss, initStock: I.initStock, cashNeed: I.cashNeed, exactNeed: isCfo(st) ? I.cashNeed + I.initStock : null, runwayAfter: runway, spanLeft, neighbours: neighbours(st, { id: -1, op: { area: p.area } }),
      franchise: { ok: !!p.franchiseOk && c.franSys, sys: c.franSys, interested: !!p.franchiseOk, pct: royPct(st), fee: r1000(s.capex * ROYALTY.fee) }, surveyFee: SURVEY.fee, esc: s.esc || 0,
      note: 'רווח בחודש בוגר (אחרי חצי שנה), לכל מיקום אפשרי. בחודשים הראשונים הסניף מפסיד, והמלאי הראשון יוצא מהקופה כשהספק מגיש חשבון.' };
    if (runway < 4) ev.data.warning = `אחרי הפתיחה יישארו בערך ${ctx.fmtM(Math.max(0, after))} — פחות מ־4 חודשים של עלויות קבועות של הרשת. רשת רווחית נופלת ממחסור במזומן.`;
    const ownOk = !full; const L = ctx.loanFor(st, I.down);
    ev.options = [
      ...(p.surveyed ? [] : [ctx.opt('survey', `סקר מיקום (${ctx.fmtM(SURVEY.fee)})`, st.cash >= SURVEY.fee, { kind: 'inspect', reason: st.cash >= SURVEY.fee ? undefined : 'אין מספיק מזומן' })]),
      ctx.opt('own', `לפתוח סניף משלך (מקדמה ${ctx.fmtM(I.down)} · בוגר ${ctx.sgn(I.exp)} בחודש)`, ownOk && L.ok, { kind: 'branch', net: I.exp, reason: full ? 'הרשת הגיעה ל־40 סניפים' : !L.ok ? 'הבנק לא נותן הלוואה כזו' : undefined, loanAmount: L.need }),
      ...(s.fixedLoc === 'A' && s.kind === 'airport' ? [] : [ctx.opt('franchise', c.franSys ? (p.franchiseOk ? `לתת לזכיין (דמי כניסה ${ctx.fmtM(r1000(s.capex * ROYALTY.fee))} + ${Math.round(royPct(st) * 100)}% מהמכירות, בלי השקעה)` : 'אין זכיין שמעוניין במיקום הזה') : 'זכיינות: צריך קודם מערכת זכיינות', !!(c.franSys && p.franchiseOk) && !full, { kind: 'franchise', net: Math.round(I.locs.reduce((x, l) => x + (I.prior[l] || 0) * I.roy[l], 0)) })]),
      ctx.opt('pass', 'לוותר', true),
    ];
    // the guide: survey first (cheap against millions), then open only with a 4-month cushion left, inside the managers' span (+1), and a positive worst case
    let pick = 'pass';
    const fr = ev.options.find((o) => o.id === 'franchise' && o.enabled);
    if (!p.surveyed && st.cash >= SURVEY.fee + I.down && !full) pick = 'survey';
    else if (ownOk && L.ok && I.worst > 0 && runway >= 4 && spanLeft >= -1) pick = 'own';
    else if (fr && fr.net > 0 && (runway < 4 || spanLeft < -1 || I.worst <= 0)) pick = 'franchise';
    const po = ev.options.find((o) => o.id === pick && o.enabled) || ev.options.find((o) => o.id === 'pass');
    po.primary = true; ev.forcePrimary = po.id; // the guide's pick is this rule (the engine's scores rank options for the dominance scan only)
  },
  choose(st, p, o, params, out, ctx) {
    const s = p.site; const c = C(st); bump(st);
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'sitePass', {}) || null; ctx.logDecision(st, 'מיקום לסניף', 'ויתר'); return true; }
    if (o.id === 'survey') { if (st.cash < SURVEY.fee) return true; st.cash -= SURVEY.fee; ctx.cashFx(out, -SURVEY.fee, `סקר ${ctx.fmtM(SURVEY.fee)}`); p.surveyed = true; st.stats.ddPassed = (st.stats.ddPassed || 0);
      out.mentor = ctx.mentorLine(st, 'surveyed', { locs: p.pair.map((l) => LOC_LABEL[l]).join(' או ') }) || `הסקר אומר: ${p.pair.map((l) => LOC_LABEL[l]).join(' או ')}. עכשיו להחליט.`; ctx.logDecision(st, 'מיקום לסניף', 'סקר'); return false; }
    const I = siteInfo(st, p, ctx);
    const ownB = o.id === 'own';
    const op = { ck: 'branch', kind: s.kind, loc: p.truth.loc, area: p.area, base: s.base, rent: s.rent, staff: s.staff, capex: s.capex, rate: s.rate ?? 0.6, own: ownB, fq: ownB ? null : p.truth.fq, cyc: s.cyc || 'pro', esc: s.esc || 0, count: 1, age: 0, openAt: st.month + (ownB ? FIT.months : 1), surveyed: !!p.surveyed };
    const card = { k: s.kind, n: s.name || s.n, cost: ownB ? s.capex : 0, down: ownB ? I.down : 0, value: 0, op };
    const a = ctx.buy(st, card, out, { label: ownB ? 'סניף חדש' : 'סניף זכיינות' });
    if (!a) { out.mentor = 'הבנק לא נתן הלוואה לפתיחה.'; return true; }
    c.opened++;
    if (ownB) { // the first stock arrives with the fit-out; its invoice comes after the supplier terms
      const iv = inv(st); const amt = r1000(I.initStock); iv.op.stock += amt; iv.debt += amt; c.payables.push({ amt, due: st.month + c.terms / 30 });
      out.mentor = ctx.mentorLine(st, 'siteOwn', { fit: String(FIT.months) }) || `חתמת. חודשיים של שיפוץ (שכירות ושכר בלי מכירות), ואחר כך חצי שנה של הרצה.`;
      ctx.lesson(st, out, 'growth_cash'); ctx.logDecision(st, 'מיקום לסניף', 'פתח סניף', s.capex);
    } else { const fee = r1000(s.capex * ROYALTY.fee); st.cash += fee; ctx.cashFx(out, fee, `דמי כניסה +${ctx.fmtM(fee)}`); // the franchisee pays the entry fee
      out.mentor = ctx.mentorLine(st, 'siteFranchise', {}) || 'זכיין פותח בכסף שלו ומשלם לך 6% מהמכירות. האיכות — שלו.'; ctx.lesson(st, out, 'own_franchise'); ctx.logDecision(st, 'מיקום לסניף', 'זכיינות'); }
    revalue(st, ctx);
    return true;
  },
  score(st, ev, ctx) {
    const d = ev.data || {}; const E = Math.max(1, ctx.expenses(st));
    return ev.options.filter((o) => o.enabled).map((o) => {
      let U = 0;
      if (o.id === 'own') U = ((d.expected || 0) * 24 + (d.rampLoss || 0) - (d.capex || 0) * 0.3 - ((d.runwayAfter ?? 9) < 4 ? 6 * E : 0)) / E / 12;
      if (o.id === 'franchise') U = (o.net || 0) * 24 / E / 12;
      if (o.id === 'survey') U = 0.5;
      return { id: o.id, U: round2(U), flags: [], reasons: [] };
    });
  },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) */
chain.act = {
  cover(st, p, out, ctx) { const v = +p; if (!STOCK.covers.includes(v)) return fail(out, 'bad_param'); if (C(st).cover === v) return fail(out, 'כבר כך'); C(st).cover = v; ctx.lesson(st, out, 'inventory_cover'); out.toast = `הזמנות מלאי: ${v} חודשי כיסוי`; return true; },
  hire(st, p, out, ctx) { const c = C(st); if (st.cash < SPAN.hire) return fail(out, 'אין מספיק מזומן'); if (c.managers >= 8) return fail(out, 'מספיק מנהלים'); st.cash -= SPAN.hire; c.managers++; ctx.cashFx(out, -SPAN.hire, `גיוס ${ctx.fmtM(SPAN.hire)}`); ctx.lesson(st, out, 'management_span'); out.toast = `גייסת מנהל אזור (${ctx.fmtM(SPAN.wage)} בחודש). עכשיו הרשת מחזיקה ${spanOf(st)} סניפים.`; return true; },
  fire(st, p, out) { const c = C(st); if (c.managers <= 0) return fail(out, 'אין מנהלים'); c.managers--; out.toast = `מנהל אזור עזב. הרשת מחזיקה ${spanOf(st)} סניפים.`; return true; },
  terms(st, p, out, ctx) { const v = +p; if (![30, 60].includes(v)) return fail(out, 'bad_param'); const c = C(st); if (c.terms === v) return fail(out, 'כבר כך'); c.terms = v; ctx.lesson(st, out, 'working_capital'); out.toast = v === 60 ? (isCfo(st) ? 'אשראי ספקים ל־60 יום.' : 'אשראי ספקים ל־60 יום — תמורת 1% יותר על הסחורה.') : 'משלמים לספקים אחרי 30 יום.'; return true; },
  close(st, p, out, ctx) { const a = findBranch(st, p); if (!a) return fail(out, 'bad_param'); const o = a.op; let net;
    if (o.own) { const g = closeValue(st, a); net = g - a.debt; } else { net = -a.debt; }
    st.cash += net; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); C(st).closed++; ctx.cashFx(out, net, ctx.sgn(net)); ctx.ensureCash(st, out, 'sell'); revalue(st, ctx);
    out.toast = o.own ? `סגרת את ${a.n} ומכרת את חוזה השכירות: ${ctx.fmtM(net)} אחרי החוב.` : `סיימת את הזכיינות של ${a.n}.`; return true; },
  convert(st, p, out, ctx) { const a = findBranch(st, p); if (!a || !a.op.own) return fail(out, 'bad_param'); const c = C(st); if (!c.franSys) return fail(out, 'צריך קודם מערכת זכיינות'); if ((a.op.openAt || 0) > st.month) return fail(out, 'הסניף עוד בשיפוץ');
    const price = r1000(a.value * ROYALTY.convert); const net = price - a.debt; a.debt = 0; a.op.own = false; a.op.fq = 0.6; st.cash += net; ctx.cashFx(out, net, ctx.sgn(net)); ctx.ensureCash(st, out, 'sell'); revalue(st, ctx); ctx.lesson(st, out, 'own_franchise');
    out.toast = `${a.n} עבר לזכיין: ${ctx.fmtM(net)} עכשיו, ו־${Math.round(royPct(st) * 100)}% מהמכירות כל חודש.`; return true; },
  buyBack(st, p, out, ctx) { const a = findBranch(st, p); if (!a || a.op.own) return fail(out, 'bad_param'); const cost = buyBackCost(st, a, ctx); if (st.cash < cost) return fail(out, 'אין מספיק מזומן');
    st.cash -= cost; a.op.own = true; a.op.fq = null; a.op.capex = a.op.capex || Math.round(a.op.base * 3); ctx.cashFx(out, -cost, `קנייה חזרה ${ctx.fmtM(cost)}`); revalue(st, ctx); out.toast = `קנית בחזרה את ${a.n}. עכשיו הוא שלך — עם המלאי, העובדים והשכירות.`; return true; },
  clearance(st, p, out, ctx) { const iv = inv(st); const cm = chainMonth(st, ctx); const keep = Math.round(cm.need * 1); const x = iv.op.stock - keep; if (x < 50000) return fail(out, 'אין עודף מלאי');
    const got = r1000(x * (1 - STOCK.clear)); iv.op.stock = keep; st.cash += got; ctx.cashFx(out, got, '+' + ctx.fmtM(got)); revalue(st, ctx); ctx.lesson(st, out, 'inventory_cover'); out.toast = `מכירת חיסול: ${ctx.fmtM(got)} עכשיו (${Math.round(STOCK.clear * 100)}% פחות מהעלות).`; return true; },
  franSys(st, p, out, ctx) { const c = C(st); if (c.franSys) return fail(out, 'כבר יש'); if (st.cash < ROYALTY.sys) return fail(out, 'אין מספיק מזומן'); st.cash -= ROYALTY.sys; c.franSys = true; ctx.cashFx(out, -ROYALTY.sys, `מערכת זכיינות ${ctx.fmtM(ROYALTY.sys)}`); ctx.lesson(st, out, 'own_franchise'); out.toast = 'הקמת מערכת זכיינות: חוזים, הדרכה ובקרה. מעכשיו אפשר לתת מיקומים לזכיינים.'; return true; },
  dcLeaseback(st, p, out, ctx) { const d = dcOf(st); if (!d) return fail(out, 'אין מרכז הפצה'); if (d.op.lease) return fail(out, 'כבר נמכר'); const cash = r1000(d.cost * DC.lease); d.op.lease = Math.round(cash * DC.rent); const net = cash - d.debt; d.debt = 0; d.value = 0; st.cash += net; ctx.cashFx(out, net, ctx.sgn(net)); ctx.ensureCash(st, out, 'sell');
    out.toast = `מכרת את מרכז ההפצה ושכרת אותו בחזרה: ${ctx.fmtM(net)} עכשיו, ${ctx.fmtM(d.op.lease)} שכירות בחודש.`; return true; },
};
for (const [k, f] of Object.entries(chain.act)) chain.act[k] = (st, p, out, ctx) => { bump(st); const r = f(st, p, out, ctx); bump(st); return r; }; // every action may change what chainMonth reads
function closeValue(st, a) { const o = a.op; const r = (o.openAt || 0) > st.month ? 0 : rampOf(st, o); return r1000(o.capex * cnt(a) * (CLOSE.min + CLOSE.span * r * LOC[o.loc || 'B'] / LOC.A)); }
function buyBackCost(st, a, ctx) { return r1000(ROYALTY.buyBack * 12 * Math.max(0, branchMonth(st, a, ctx).royalty || 0)); }

/** The guide's suggestions (public numbers only). */
function actionList(st, ctx) {
  const out = []; const c = C(st); const cm = chainMonth(st, ctx); const fx = fixedMonth(st, ctx); const liq = liquidOf(st, ctx); const E0 = ctx.expenses(st);
  const n = ownCount(st); const span = spanOf(st);
  const wantCover = nextPeak(st, ctx) ? 2 : 1.5;
  for (const v of STOCK.covers) out.push({ id: 'cover', param: String(v), label: `מלאי: ${v} חודשי כיסוי`, enabled: c.cover !== v, current: c.cover === v, suggested: c.cover !== v && v === wantCover && n > 0 });
  out.push({ id: 'hire', param: null, label: `לגייס מנהל אזור (${ctx.fmtM(SPAN.hire)} + ${ctx.fmtM(SPAN.wage)} בחודש)`, enabled: st.cash >= SPAN.hire && c.managers < 8, reason: st.cash < SPAN.hire ? 'אין מספיק מזומן' : undefined, suggested: n > span - 1 && st.cash >= SPAN.hire + E0 * 2 && c.managers < 8 });
  if (c.managers > 0) out.push({ id: 'fire', param: null, label: 'לוותר על מנהל אזור', enabled: true, suggested: n <= (c.managers - 1) * SPAN.perMgr + SPAN.owner - 3 });
  out.push({ id: 'terms', param: c.terms === 60 ? '30' : '60', label: c.terms === 60 ? 'לחזור לתשלום לספקים אחרי 30 יום' : `אשראי ספקים ל־60 יום${isCfo(st) ? '' : ' (+1% על הסחורה)'}`, enabled: true, suggested: c.terms === 30 && n > 0 && (isCfo(st) || (fx > 0 && liq / fx < 2)) });
  const iv = inv(st); const overStock = cm.need > 0 && iv && iv.op.stock > (overLine(c) + 0.5) * cm.need;
  out.push({ id: 'clearance', param: null, label: `מכירת חיסול של עודף המלאי (−${Math.round(STOCK.clear * 100)}%)`, enabled: !!(iv && iv.op.stock - cm.need >= 50000), suggested: !!overStock });
  if (!c.franSys) out.push({ id: 'franSys', param: null, label: `מערכת זכיינות (${ctx.fmtM(ROYALTY.sys)})`, enabled: st.cash >= ROYALTY.sys, reason: st.cash < ROYALTY.sys ? 'אין מספיק מזומן' : undefined, suggested: false });
  const d = dcOf(st); if (d && !d.op.lease) out.push({ id: 'dcLeaseback', param: null, label: `למכור את מרכז ההפצה ולשכור בחזרה (${ctx.fmtM(r1000(d.cost * DC.lease))})`, enabled: true, suggested: fx > 0 && liq / fx < 1 });
  for (const a of branches(st)) {
    const o = a.op; const m = branchMonth(st, a, ctx, cm); const open = (o.openAt || 0) <= st.month;
    const losing = o.own && open && (o.age || 0) >= 6 && matureProfit(st, a, ctx) < 0;
    out.push({ id: 'close', param: String(a.id), assetId: 'a' + a.id, label: o.own ? `${a.n}: לסגור ולמכור את השכירות (${ctx.fmtM(closeValue(st, a))})` : `${a.n}: לסיים את הזכיינות`, enabled: true, suggested: losing || (!o.own && !!o.fqKnown) });
    if (o.own) out.push({ id: 'convert', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: להעביר לזכיין (${ctx.fmtM(r1000(a.value * ROYALTY.convert))})`, enabled: c.franSys && open, reason: !c.franSys ? 'צריך מערכת זכיינות' : !open ? 'הסניף עוד בשיפוץ' : undefined, suggested: c.franSys && open && fx > 0 && liq / fx < 1 && m.cf < 0 });
    else out.push({ id: 'buyBack', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: לקנות בחזרה מהזכיין (${ctx.fmtM(buyBackCost(st, a, ctx))})`, enabled: st.cash >= buyBackCost(st, a, ctx), reason: st.cash < buyBackCost(st, a, ctx) ? 'אין מספיק מזומן' : undefined, suggested: false });
  }
  return out;
}
function indicatorsOf(st, ctx) {
  const c = C(st); const cm = chainMonth(st, ctx); const fx = fixedMonth(st, ctx); const liq = liquidOf(st, ctx); const n = ownCount(st); const span = spanOf(st); const iv = inv(st);
  const rows = branches(st).map((a) => {
    const o = a.op; const m = branchMonth(st, a, ctx, cm); const open = (o.openAt || 0) <= st.month; const known = !!o.surveyed || (open && (o.age || 0) >= 2) || !o.own;
    return { assetId: 'a' + a.id, name: a.n, kind: o.kind, label: KIND_LABEL[o.kind] || o.kind, own: !!o.own, area: o.area, count: cnt(a), loc: known && o.own ? o.loc : null, locLabel: known && o.own ? LOC_LABEL[o.loc] : null,
      open, openAt: open ? null : o.openAt, age: o.age || 0, ramp: open ? rampOf(st, o) : 0, stage: !open ? 0 : rampOf(st, o) < 0.6 ? 1 : rampOf(st, o) < 0.85 ? 2 : rampOf(st, o) < 1 ? 3 : 4,
      sales: m.sales || 0, lost: m.lost || 0, cfNow: m.cf, mature: matureProfit(st, a, ctx), value: a.value, debt: a.debt, rent: o.rent, neighbours: neighbours(st, a), royalty: m.royalty ?? null, badFranchisee: !o.own && !!o.fqKnown };
  });
  const coverNow = cm.need > 0 && iv ? round2(iv.op.stock / cm.need) : null;
  const transit = iv ? iv.op.transit.reduce((s, x) => s + x.amt, 0) : 0;
  const lm = fx > 0 ? round2(Math.max(0, liq) / fx) : 99;
  return {
    chain: { branches: n, franchises: fran(st).length, managers: c.managers, span, spanPenalty: spanPenalty(st), overSpan: Math.max(0, n - span), cover: c.cover, coverNow, stock: iv ? iv.op.stock : 0, transit, payables: iv ? iv.debt : 0, fill: cm.fill,
      cogs: cogsOf(st), terms: c.terms, brand: Math.round(c.brand), demand: c.demand, fixedMonth: fx, liquid: liq, liqMonths: lm, lost: c.lost, markdowns: c.markdowns, franSys: !!c.franSys, exactNeed: isCfo(st),
      rivals: c.rivals.slice(), shocks: c.shocks.map((s) => ({ t: s.t, v: s.v ?? null, until: s.until, n: s.n || '' })), dc: !!dcOf(st), ecom: !!ecomOf(st) },
    panel: {
      id: 'chain', title: 'הרשת',
      gauges: [{ id: 'liq', label: 'נזילות (חודשי עלויות קבועות)', value: lm >= 99 ? null : lm, ref: 4 }, { id: 'span', label: `סניפים מול יכולת הניהול (${n}/${span})`, value: span > 0 ? round2(n / span) : null, min: 0, max: 1.5, ref: 1 },
        { id: 'cover', label: 'מלאי (חודשי מכירות)', value: coverNow, ref: c.cover }, { id: 'brand', label: 'מותג', value: Math.round(c.brand), min: 0, max: 100, ref: 60 }],
      rows,
      actions: actionList(st, ctx),
    },
  };
}
export default chain;
