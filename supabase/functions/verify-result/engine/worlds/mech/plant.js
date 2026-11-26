// World mechanic `plant` — w6 אזור התעשייה (docs/full-upgrade/worlds/w6-industry.md). Capacity, maintenance, operating leverage.
//
// Contract (DESIGN §4.2): one object of optional hooks; pure and deterministic; NO engine import (helpers arrive in ctx); only + − × ÷ and
// Math.round / min / max / floor. Draws come ONLY from the `world` stream through ctx.draw, with FIXED counts declared in `draws`
// (tests/w6.test.mjs asserts them): 6 per payday (one per line slot, empty slots included), 3 per 'C' (contract) landing, 0 at init.
//
// The model. A production line is an engine asset with `a.op` = {lk line kind, full (₪ revenue a month at full one-shift output and list
// price), cm (contribution margin at list price), fixed (₪ a month), cost (replacement cost), cond 0–100, maint 'preventive'|'basic'|'run',
// shift 1|2|3, spot (base spot demand, share of one-shift capacity), cyc 'pro'|'counter', contract|null, downUntil, slot 0–5, rate (% a
// month on the line's own debt), auto, solar, mothball, readyAt (an ordered line not delivered yet), eff (output quality: the due-diligence
// truth), union, lockUntil, lease}. Every month:
//   capacity = shiftCap[shift] × (down ? 0 : 1) × supply;  contract output first, then spot output up to the spot demand (cycle × base);
//   cf = revenue − variable − fixed × shiftFixed − maintenance(policy) − contract penalty (1.5 × margin per undelivered unit; spec said 3 — TUNE: 3 bankrupted a stopped food plant in one month) − interest.
// At every payday the line wears (wear[policy] × utilisation × shiftWear) and its slot's sealed draw is compared with hazard(cond): below
// it the line breaks down for 1–3 months (from the same draw) with a repair of 4–10 % of its cost. The same seed gives every player the
// same draws; a well-kept line simply has a lower hazard against them.
// Value (the net-worth goal): sustainable profit (a normal month, basic maintenance, one shift, no contract) × 12 × the cycle's multiple ×
// (0.6 + 0.4 × cond/100) — deferred maintenance shows up as lost value on the day that counts.

export const ID = 'plant';
export const SLOTS = 6;
export const DRAWS = Object.freeze({ init: 0, month: SLOTS, landing: Object.freeze({ C: 3 }) });

export const SHIFT_CAP = Object.freeze({ 1: 1.0, 2: 1.4, 3: 1.7 });
export const SHIFT_WEAR = Object.freeze({ 1: 1.0, 2: 1.5, 3: 2.2 });
export const SHIFT_FIXED = Object.freeze({ 1: 1.0, 2: 1.15, 3: 1.4 });   // night-shift wages and lights (TUNE)
export const MAINT = Object.freeze({ preventive: 0.008, basic: 0.0025, run: 0 }); // of the line's cost, a month
export const WEAR = Object.freeze({ preventive: 0.25, basic: 1.0, run: 2.2 });     // condition points a month at full utilisation (TUNE)
export const MAINT_LABEL = Object.freeze({ preventive: 'מונעת', basic: 'בסיסית', run: 'עד שזה נשבר' });
export const LK_LABEL = Object.freeze({ cnc: 'קו CNC', plastic: 'הזרקת פלסטיק', food: 'מפעל מזון', recycle: 'מיחזור', metal: 'מסגרייה', pack: 'קו אריזה' });
/** Spot demand and price by cycle phase (true phase, like the engine's cfOther); recycling is counter-cyclical. */
export const DEM = Object.freeze({ pro: Object.freeze({ exp: 1.2, slow: 1.0, rec: 0.78, recov: 0.95 }), counter: Object.freeze({ exp: 0.88, slow: 1.0, rec: 1.22, recov: 1.04 }) });
export const PRICE = Object.freeze({ pro: Object.freeze({ exp: 1.06, slow: 1.0, rec: 0.93, recov: 0.97 }), counter: Object.freeze({ exp: 0.97, slow: 1.0, rec: 1.05, recov: 1.0 }) });
/** Valuation multiple (years of sustainable profit) by phase. */
export const MULT = Object.freeze({ exp: 6.4, slow: 6.0, rec: 5.4, recov: 5.8 }); // a line on its normal yield is worth about its cost at slow / cond 85
/** Monthly breakdown hazard by condition (linear between the points). */
export const HAZ = Object.freeze([[0, 0.30], [20, 0.17], [40, 0.075], [60, 0.03], [80, 0.01], [100, 0.003]]);
export const CONTRACT = Object.freeze({ months: 24, price: 0.85, counterPrice: 0.92, pen: 1.5, volMin: 0.3, volSpan: 0.4, counterP: 0.45, traderBonus: 0.2, renegP: 0.5 });
const REPAIR = Object.freeze({ min: 0.04, span: 0.06, cond: 20, condMax: 85 });
const OVERHAUL = Object.freeze({ pct: 0.08, cond: 95 });
const MOTHBALL = Object.freeze({ fixed: 0.4, restart: 0.02, value: 0.8 });
const SELL = 0.7;
const LEASE = Object.freeze({ cash: 0.25, rent: 0.009 });
const AUTO = Object.freeze({ pct: 0.2, min: 1000000, varCut: 0.92, grant: 0.8 });
const SOLAR = Object.freeze({ pct: 0.06, min: 500000, fixedCut: 0.92 });
const FACTOR = 0.03;
const UNION = 1.15;
const SALVAGE = 0.3;
const TRADER_SPOT = 1.05;
const PREV_CUT = 0.75;        // the operations engineer's preventive maintenance costs 25 % less
const BASIC_FOR_VALUE = 'basic';
const INSPECT_COND = 30;

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r10 = (x) => Math.round(x / 10) * 10;
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;

/** Monthly breakdown probability at a condition. */
export function hazardOf(cond) {
  const c = clamp(cond, 0, 100);
  for (let i = 1; i < HAZ.length; i++) { const [x1, y1] = HAZ[i]; const [x0, y0] = HAZ[i - 1]; if (c <= x1) return round3(y0 + (y1 - y0) * (c - x0) / (x1 - x0)); }
  return HAZ[HAZ.length - 1][1];
}
export const hazardBand = (h) => (h < 0.02 ? 'low' : h < 0.06 ? 'mid' : 'high');
const BAND_LABEL = Object.freeze({ low: 'נמוך', mid: 'בינוני', high: 'גבוה' });

/* ---------------------------------------------------------------- the pure monthly model (also prices the cards) */
/**
 * One month of a line. o = a.op, debt = the asset's debt, env = {month, phase, spotAdd, supply, fixedMult, noShift3, trader, prevCut}.
 * `norm` = the valuation's normal month (slow phase, basic maintenance, one shift, no contract, no shocks, no interest).
 */
export function lineMonth(o, debt, env, norm = false) {
  const month = env.month ?? 0;
  if (!norm && o.readyAt && month < o.readyAt) return { pending: true, cf: 0, rev: 0, varc: 0, fixed: 0, maint: 0, pen: 0, interest: 0, util: 0, cap: 0, down: false };
  const interest = norm ? 0 : Math.round(debt * (o.rate || 0) / 100);
  const fixedBase = o.fixed * (o.union ? UNION : 1) * (o.solar ? SOLAR.fixedCut : 1) + (o.lease || 0);
  if (!norm && o.mothball) { const fx = Math.round(fixedBase * MOTHBALL.fixed); return { mothball: true, cf: r10(-fx - interest), rev: 0, varc: 0, fixed: fx, maint: 0, pen: 0, interest, util: 0, cap: 0, down: false }; }
  const phase = norm ? 'slow' : env.phase || 'slow';
  let shift = norm ? 1 : o.shift || 1; if (!norm && env.noShift3 && shift === 3) shift = 2;
  const down = !norm && o.downUntil != null && o.downUntil >= month;
  const cap = down ? 0 : SHIFT_CAP[shift] * (norm ? 1 : env.supply ?? 1);
  const c = norm ? null : o.contract && month >= (o.contract.from ?? 0) && month <= o.contract.until ? o.contract : null;
  const D = Math.max(0, o.spot * DEM[o.cyc || 'pro'][phase] + (norm ? 0 : env.spotAdd || 0));
  const co = c ? Math.min(c.vol, cap) : 0;
  const so = Math.min(D, Math.max(0, cap - co));
  const pS = PRICE[o.cyc || 'pro'][phase] * (env.trader ? TRADER_SPOT : 1);
  const eff = o.eff ?? 1;
  const rev = o.full * eff * (co * (c ? c.price : 1) + so * pS);
  const varc = o.full * (1 - o.cm) * (co + so) * (o.auto ? AUTO.varCut : 1);
  const fixed = fixedBase * SHIFT_FIXED[shift] * (norm ? 1 : env.fixedMult ?? 1);
  const mp = MAINT[norm ? BASIC_FOR_VALUE : o.maint || 'basic'] * (!norm && o.maint === 'preventive' && env.prevCut ? PREV_CUT : 1);
  const maint = o.cost * mp;
  const pen = c ? Math.max(0, c.vol - co) * o.full * o.cm * CONTRACT.pen : 0;
  return { cf: r10(rev - varc - fixed - maint - pen - interest), rev: Math.round(rev), varc: Math.round(varc), fixed: Math.round(fixed), maint: Math.round(maint), pen: Math.round(pen), interest,
    util: round3(co + so), contractOut: round3(co), spotOut: round3(so), demand: round3(D), cap: round3(cap), shift, down, contract: !!c };
}
/** The line's value (₪): sustainable profit × 12 × multiple(phase) × condition factor, never below salvage. */
export function lineValue(o, phase) {
  if (o.readyAt && o.readyPaid != null) return o.readyPaid;
  const P = lineMonth(o, 0, {}, true).cf;
  const v = Math.max(o.cost * SALVAGE * o.cond / 100, 12 * P * (MULT[phase] || MULT.slow) * (0.6 + 0.4 * o.cond / 100));
  return r1000(v * (o.mothball ? MOTHBALL.value : 1));
}
/** Card helper: builds card.op from a few design numbers and prices card.cf (the normal month on the standard plan, after interest).
 *  y = EBITDA yield on cost a year at a normal month; fk = fixed costs ÷ EBITDA (operating leverage); cm, spot, cyc, cond. */
export function lineCard({ k, n, d, cost, down, y = 0.18, fk = 1, cm = 0.38, spot = 0.95, cyc = 'pro', cond = 85, order = false, used = false, contract = null, value = null, q = null, rate = 0.55, eff = 1, union = false }) {
  const e = cost * y / 12; const fixed = Math.round(fk * e); const maintB = cost * MAINT.basic;
  const util = Math.min(spot, 1);
  const full = Math.round((e + fixed + maintB) / (util * cm));
  const op = { lk: k, full, cm, fixed, cost, cond, maint: 'basic', shift: 1, spot, cyc, rate, eff, union, contract: null };
  const card = { k, n, d, cost, down, op, value: value ?? cost, ...(q ? { q } : {}), ...(order ? { order: true } : {}), ...(used ? { used: true } : {}), ...(contract ? { contract } : {}) };
  const ct = contract ? { vol: contract.vol, price: contract.price ?? 1, from: 0, until: 999 } : null;
  card.cf = lineMonth({ ...op, contract: ct }, cost - down, { month: 1, phase: 'slow' }).cf; card.cf0 = card.cf;
  return card;
}

/* ---------------------------------------------------------------- state */
const W = (st) => st.world;
const lines = (st) => st.assets.filter((a) => a.op && a.op.lk);
const isOps = (st) => st.charId === 'opseng';
const isTrader = (st) => st.charId === 'trader';
const phaseOf = (st) => (st.econ && st.econ.phase) || 'slow';
function envOf(st, ctx, monthDelta = 0) {
  const w = W(st); const month = st.month + monthDelta;
  let spotAdd = 0, supply = 1, fixedMult = 1;
  for (const s of w.shocks || []) if (s.until >= month && s.from <= month) { if (s.t === 'spot') spotAdd += s.v; if (s.t === 'supply') supply *= s.v; if (s.t === 'fixed') fixedMult *= s.v; }
  void ctx;
  return { month, phase: phaseOf(st), spotAdd, supply: round3(supply), fixedMult: round3(fixedMult), noShift3: (w.noShift3Until || 0) >= month, trader: isTrader(st), prevCut: isOps(st) };
}
const findLine = (st, id) => { const n = +String(id || '').replace(/^a/, ''); return st.assets.find((x) => x.id === n && x.op && x.op.lk) || null; };
const freeSlot = (st) => { const used = new Set(lines(st).map((a) => a.op.slot)); for (let s = 0; s < SLOTS; s++) if (!used.has(s)) return s; return -1; };
function revalue(st, a) { a.value = lineValue(a.op, phaseOf(st)); }
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
const pendingLine = (a, month) => !!(a.op.readyAt && month < a.op.readyAt);

/* ---------------------------------------------------------------- hooks */
export const plant = {
  id: ID, draws: DRAWS,
  lessons: ['operating_leverage', 'deferred_maintenance', 'idle_capacity', 'contract_spot'],
  mentorKeys: ['contractAsk', 'contractYes', 'contractNo', 'contractWon', 'contractLost', 'breakdown', 'delivered', 'inspectionStop'],
  sealed: ['pending.wr', 'assets[].op.contract.rn'],

  init(st) { const w = W(st); w.shocks = []; w.noShift3Until = 0; w.grantUntil = 0; w.insp = []; w.breakdowns = 0; w.factorDue = 0; w.penalties = 0; w.repairs = 0; for (const a of lines(st)) revalue(st, a); },
  defaults(st) { const w = W(st); if (!Array.isArray(w.shocks)) w.shocks = []; if (w.noShift3Until == null) w.noShift3Until = 0; if (w.grantUntil == null) w.grantUntil = 0; if (!Array.isArray(w.insp)) w.insp = []; if (w.breakdowns == null) w.breakdowns = 0; if (w.factorDue == null) w.factorDue = 0; if (w.penalties == null) w.penalties = 0; if (w.repairs == null) w.repairs = 0; },

  /** Payday (after the month's cash): wear, the 6 slot draws (breakdowns), deliveries, contracts ending, shocks expire, revaluation. */
  monthly(st, out, ctx) {
    const w = W(st);
    const r = []; for (let s = 0; s < SLOTS; s++) r.push(ctx.draw(st)); // exactly 6 'world' draws every payday, empty slots included
    const paid = envOf(st, ctx, -1); // the month that was just paid
    w.factorDue = 0;
    let pen = 0;
    for (const a of lines(st)) {
      const o = a.op;
      if (pendingLine(a, paid.month)) continue;
      const m = lineMonth(o, a.debt, paid);
      pen += m.pen;
      if (!o.mothball && !m.down) o.cond = round2(clamp(o.cond - WEAR[o.maint || 'basic'] * Math.max(0.3, m.util) * SHIFT_WEAR[m.shift || 1], 0, o.maint === 'preventive' ? 95 : 100));
    }
    if (pen > 0) { w.penalties += pen; ctx.lesson(st, out, 'contract_spot'); }
    // breakdowns: each delivered, running line against its slot's sealed draw
    for (const a of lines(st)) {
      const o = a.op; if (pendingLine(a, st.month) || o.mothball || (o.downUntil != null && o.downUntil >= st.month)) continue;
      const x = r[o.slot]; const h = hazardOf(o.cond);
      if (x < h) {
        const f = x / h; const n = 1 + Math.min(2, Math.floor(f * 3)); const rep = Math.round(o.cost * (REPAIR.min + REPAIR.span * f) / 1000) * 1000;
        o.downUntil = st.month + n - 1; o.cond = Math.min(REPAIR.condMax, round2(o.cond + REPAIR.cond)); w.breakdowns++; w.repairs += rep;
        st.cash -= rep; ctx.cashFx(out, -rep, `תיקון ${ctx.fmtM(rep)}`);
        const c = o.contract && o.contract.until >= st.month ? ' יש חוזה: כל יחידה שלא תסופק עולה קנס.' : '';
        out.news.push({ kind: 'plant', text: (ctx.mentorLine(st, 'breakdown', { name: a.n, months: String(n), repair: ctx.fmtM(rep) }) || `${a.n} התקלקל: ${n === 1 ? 'חודש' : n + ' חודשים'} בלי ייצור, ותיקון של ${ctx.fmtM(rep)}.`) + c, assetId: 'a' + a.id });
        ctx.lesson(st, out, 'deferred_maintenance');
      }
    }
    if (lines(st).some((a) => a.op.downUntil != null && a.op.downUntil >= st.month)) ctx.ensureCash(st, out, 'repair');
    // deliveries of ordered lines: the rest of the price becomes the line's debt
    for (const a of lines(st)) { const o = a.op; if (o.readyAt && st.month >= o.readyAt) { o.readyAt = 0; a.debt = o.dueDebt || 0; o.dueDebt = 0; delete o.readyPaid; out.news.push({ kind: 'plant', text: ctx.mentorLine(st, 'delivered', { name: a.n, debt: ctx.fmtM(a.debt) }) || `${a.n} הגיע ומותקן. מהחודש הבא הוא מייצר — ויתרת המחיר (${ctx.fmtM(a.debt)}) הפכה לחוב.`, assetId: 'a' + a.id }); } }
    // contracts that ended
    for (const a of lines(st)) { const c = a.op.contract; if (c && c.until < st.month) { a.op.contract = null; out.news.push({ kind: 'plant', text: `החוזה של ${a.n} הסתיים. מעכשיו הכל נמכר בשוק הפתוח.`, assetId: 'a' + a.id }); } }
    w.shocks = (w.shocks || []).filter((s) => s.until >= st.month);
    // night shifts cost strength (🔋): −1 per line on shift 2, −2 on shift 3 (at most −4 a month)
    if (st.life && st.life.energy != null) { let d = 0; for (const a of lines(st)) if (!a.op.mothball && !pendingLine(a, st.month)) d += a.op.shift === 3 ? 2 : a.op.shift === 2 ? 1 : 0; if (d) st.life.energy = Math.max(5, st.life.energy - Math.min(4, d)); }
    // lessons by experience
    const ls = lines(st);
    if (ls.length && st.stats.paydays >= 3) ctx.lesson(st, out, 'idle_capacity');
    const now = envOf(st, ctx); let contrib = 0, fixed = 0;
    for (const a of ls) { const m = lineMonth(a.op, a.debt, now); contrib += m.rev - m.varc; fixed += m.fixed; }
    if (fixed > 0 && contrib < fixed) ctx.lesson(st, out, 'operating_leverage');
    for (const a of ls) revalue(st, a);
  },

  asset: {
    create(st, a, card, ctx) {
      const op = { maint: 'basic', shift: 1, auto: false, solar: false, mothball: false, downUntil: 0, lease: 0, ...JSON.parse(JSON.stringify(card.op)) };
      const claimed = card.cf0 ?? null;
      if (claimed != null && card.cf !== claimed) { // the due-diligence truth: output quality so that the normal month equals it
        const ct = op.contract ? null : card.contract ? { vol: card.contract.vol, price: card.contract.price ?? 1, from: 0, until: 999 } : null;
        const at = (eff) => lineMonth({ ...op, eff, contract: ct }, card.cost - card.down, { month: 1, phase: 'slow' }).cf;
        const c1 = at(1), c0 = at(0); const eff = c1 !== c0 ? (card.cf - c0) / (c1 - c0) : 1;
        op.eff = round3(clamp(eff, 0.5, 1.3));
      }
      op.slot = freeSlot(st); if (op.slot < 0) op.slot = 0;
      if (card.contract) op.contract = { vol: card.contract.vol, price: card.contract.price ?? 1, from: st.month, until: st.month + (card.contract.months || 6) - 1, rn: 0.99, inherited: true };
      if (card.lockFixed) op.lockUntil = st.month + card.lockFixed;
      if (card.order) { op.readyAt = st.month + 6; op.dueDebt = a.debt; a.debt = 0; op.readyPaid = card.down; }
      a.op = op; a.cf = card.cf;
      a.value = lineValue(op, phaseOf(st));
      void ctx;
    },
    cf(st, a, ctx, neutral) { const e = envOf(st, ctx); if (neutral) e.phase = 'slow'; return lineMonth(a.op, a.debt, e).cf; },
  },
  expense(st) { return W(st).factorDue || 0; },
  liability(st) { return W(st).factorDue || 0; },

  deal: {
    describe(st, p, ev, ctx) {
      const c = p.card; if (!c.op) return;
      const o = c.op; const debt = c.cost - c.down;
      const ct = c.contract ? { vol: c.contract.vol, price: c.contract.price ?? 1, from: 0, until: 999 } : null;
      const at = (phase) => lineMonth({ ...o, contract: ct }, debt, { month: 1, phase, trader: isTrader(st) }).cf;
      const h = hazardOf(o.cond);
      const lvl = p.dd ? p.dd.level : 2;
      const condShown = !c.used || lvl >= 2 || isOps(st) ? { lo: o.cond, hi: o.cond } : lvl === 1 ? { lo: Math.max(0, o.cond - 15), hi: Math.min(100, o.cond + 15) } : { lo: 20, hi: 90 };
      ev.data.plant = { lk: o.lk, label: LK_LABEL[o.lk] || o.lk, cond: condShown, hazard: condShown.lo === condShown.hi ? h : null, hazardBand: hazardBand(hazardOf(condShown.lo)), order: !!c.order, readyIn: c.order ? 6 : 0,
        fixed: o.fixed, cm: o.cm, cyc: o.cyc, used: !!c.used, cfBoom: at('exp'), cfNormal: at('slow'), cfRecession: at('rec'), contract: c.contract ? { vol: c.contract.vol, months: c.contract.months || 6 } : null,
        slotsFree: SLOTS - lines(st).length,
        note: c.order ? 'קו חדש: משלמים 30% מקדמה עכשיו, והוא מגיע ומתחיל לייצר אחרי 6 חודשים. היתרה הופכת לחוב ביום המסירה.' : 'התזרים בחודש רגיל. בגאות ובשפל הוא זז הרבה יותר מההכנסות — העלויות הקבועות לא זזות.' };
      // the plant's runway (public): one month of every line's fixed + maintenance costs, this one included, must stay in cash after the
      // down payment — a line that stops or a recession month is paid from it. Shown as a warning (a pass rule cost the guide more growth than it saved: tools/balance-data/gates-w6.json notes).
      const env = envOf(st, ctx); let fx = o.fixed + o.cost * MAINT.basic;
      for (const a of lines(st)) { const m = lineMonth(a.op, a.debt, env); fx += (m.fixed || 0) + (m.maint || 0); }
      const need = Math.round(1.0 * fx); const buy = ev.options.find((x) => x.kind === 'buy' && x.enabled); const after = st.cash + (st.savings || 0) - c.down + (buy ? buy.loanAmount || 0 : 0);
      ev.data.plant.runwayNeed = need; ev.data.plant.runwayAfter = after;
      if (after < need) { ev.data.plant.runwayShort = true; if (!ev.data.warning) ev.data.warning = `אחרי המקדמה יישארו ${ctx.fmtM(Math.max(0, after))}, והעלויות הקבועות של הקווים צריכות כרית של בערך ${ctx.fmtM(need)}. קו שעומד או חודש של מיתון — והבנק יחליט בשבילך.`; }
      if (lines(st).length >= SLOTS) for (const x of ev.options) if (x.kind === 'buy') { x.enabled = false; x.reason = 'אין מקום לקו נוסף במפעל (6 קווים)'; }
    },
  },

  market: {
    create(st, p) {
      const c = p.card; const w = W(st); const m = st.month;
      if (c.mk === 'tariff') w.shocks.push({ t: 'fixed', v: 1 + c.pct, from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'export') w.shocks.push({ t: 'spot', v: c.add, from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'raw') w.shocks.push({ t: 'supply', v: c.supply, from: m, until: m + c.months - 1, n: c.n });
      if (c.mk === 'workers') w.noShift3Until = Math.max(w.noShift3Until || 0, m + c.months - 1);
      if (c.mk === 'grant') w.grantUntil = m + c.months - 1;
      if (c.mk === 'inspect') { p.hit = []; for (const a of lines(st)) if (!pendingLine(a, m) && !a.op.mothball && a.op.cond < INSPECT_COND) { a.op.downUntil = Math.max(a.op.downUntil || 0, m); p.hit.push(a.id); } if (p.hit.length) w.insp.push(m); }
    },
    describe(st, p, ev, ctx) {
      const c = p.card; ev.data.plant = { mk: c.mk, months: c.months || null };
      if (c.mk === 'inspect') { const n = (p.hit || []).length; ev.data.count = n; if (!n) { ev.auto = true; ev.toastText = `${c.n} — כל הקווים שלך במצב תקין. עברת.`; } else { ev.text = `${c.d} ${n === 1 ? 'קו אחד שלך עומד' : n + ' קווים שלך עומדים'} החודש.`; ev.mentor = ctx.mentorLine(st, 'inspectionStop', {}) || ev.mentor; } return; }
      if (!lines(st).length) { ev.auto = true; ev.toastText = c.n; }
    },
  },
  crisis: {
    create(st, p) {
      const c = p.card;
      if (c.mk === 'custBust') { // the biggest contract customer goes bankrupt: a month of its revenue is lost, the contract ends
        const env = { month: st.month, phase: phaseOf(st) }; let best = null, rev = 0;
        for (const a of lines(st)) if (a.op.contract && a.op.contract.until >= st.month) { const m = lineMonth(a.op, 0, env); const cr = Math.round(a.op.full * (a.op.eff ?? 1) * m.contractOut * a.op.contract.price); if (cr > rev) { rev = cr; best = a; } }
        if (best) { best.op.contract = null; p.card.cash = -rev; p.card.cashLabel = `חוב של הלקוח ש${best.n} ייצר בשבילו`; p.hit = [best.id]; } else { p.card.cash = 0; }
      }
    },
  },

  /** 'C' — a customer offers a 24-month supply contract (defined below: tiles.C). */
  tiles: {},

  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out, ctx) {
    const env = envOf(st, ctx);
    for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op || !a.op.lk) continue;
      const r = lineMonth(a.op, a.debt, env); const h = hazardOf(a.op.cond);
      m.cond = Math.round(a.op.cond); m.condLight = a.op.cond >= 70 ? 'green' : a.op.cond >= 40 ? 'amber' : 'red'; m.condPips = a.op.cond >= 70 ? 3 : a.op.cond >= 40 ? 2 : 1;
      m.running = !r.down && !r.pending && !r.mothball && r.util > 0; m.util = r.util; m.down = !!r.down; m.pending = !!r.pending; m.mothball = !!a.op.mothball; m.shift = a.op.shift; m.hazardBand = hazardBand(h); }
  },
  recapHint(st) {
    const ls = lines(st); const w = W(st);
    if (!ls.length) return 'בפעם הבאה: קווי ייצור קודם. באזור התעשייה השווי נבנה ממכונות שמייצרות, לא מהמשכורת.';
    if (w.breakdowns >= 4 && ls.some((a) => a.op.maint === 'run')) return 'בפעם הבאה: תחזוקה. כל תקלה עלתה תיקון, חודשי השבתה וקנסות — והמצב הירוד הוריד את שווי הקווים ביום הספירה.';
    if (w.penalties > 0) return 'בפעם הבאה: חוזה רק על חלק מהקיבולת. כשקו עומד, כל יחידה שלא סופקה עולה קנס — פי אחד וחצי מהרווח עליה.';
    return null;
  },
  goalValue(st, key) { if (key === 'breakdowns') return W(st).breakdowns || 0; return 0; },
  /** ★★★ also needs no safety-inspection stop in the last 12 months (spec "Goal and stars"); the engine applies it generically. */
  starGates(st) { return [{ id: 'inspect12', stars: 3, ok: !recentStop(st), label: STAR_GATE_LABEL }]; },
};
const STAR_GATE_LABEL = '★★★ רק בלי עצירה בביקורת בטיחות ב־12 החודשים האחרונים';
const recentStop = (st) => (W(st).insp || []).some((m) => m > st.month - 12);

/* ---------------------------------------------------------------- contract tile (functions need module scope) */
function contractChance(st) { return round2(Math.min(0.95, CONTRACT.counterP + (isTrader(st) ? CONTRACT.traderBonus : 0))); }
function contractTarget(st) {
  const c = lines(st).filter((a) => !a.op.mothball && !a.op.contract && !pendingLine(a, st.month));
  c.sort((x, y) => y.op.full - x.op.full || x.id - y.id);
  return c[0] || null;
}
/** The card's public numbers: the line's monthly cf with and without the contract at the current phase, in a boom and in a recession. */
function contractInfo(st, p, a, ctx) {
  const price = p.price ?? CONTRACT.price; const env = envOf(st, ctx);
  const ct = { vol: p.vol, price, from: st.month, until: st.month + CONTRACT.months - 1 };
  const cur = a.op.shift || 1;
  // with the contract the player would add a shift when contract + normal spot demand overflow the line (the panel suggests it): show that
  const sh = cur === 1 && p.vol + a.op.spot > SHIFT_CAP[1] ? 2 : cur;
  const d = (phase) => { const e = { ...env, phase, spotAdd: 0, supply: 1, fixedMult: 1 }; return lineMonth({ ...a.op, shift: sh, contract: ct }, a.debt, e).cf - lineMonth({ ...a.op, contract: null }, a.debt, e).cf; };
  const capNow = SHIFT_CAP[cur];
  return { price, now: r10(d(env.phase)), boom: r10(d('exp')), normal: r10(d('slow')), recession: r10(d('rec')), share: round2(p.vol / capNow), months: CONTRACT.months,
    penaltyPerMonth: Math.round(p.vol * a.op.full * a.op.cm * CONTRACT.pen), chance: contractChance(st), withShift: sh };
}
plant.tiles.C = {
  safe: 'decline',
  create(st, ctx) {
    const r1 = ctx.draw(st), r2 = ctx.draw(st), r3 = ctx.draw(st); // exactly 3 'world' draws on every C landing, whatever the card turns out to be
    const a = contractTarget(st);
    return { wr: [r1, r2, r3], assetId: a ? a.id : null, vol: round2(CONTRACT.volMin + CONTRACT.volSpan * r1), countered: false };
  },
  describe(st, p, ev, ctx) {
    const a = p.assetId != null ? st.assets.find((x) => x.id === p.assetId) : null;
    ev.tag = 'חוזה אספקה'; ev.title = 'לקוח מציע חוזה ל־24 חודשים';
    if (!a || !a.op) { ev.text = 'לקוח גדול מחפש ספק לשנתיים — אבל אין לך קו פנוי שיכול לייצר בשבילו.'; ev.options = [ctx.opt('decline', 'המשך', true, { primary: true })]; ev.auto = true; ev.toastText = 'לקוח חיפש ספק — אין לך קו פנוי לחוזה.'; return; }
    const I = contractInfo(st, p, a, ctx);
    ev.text = `"${a.n}": הלקוח רוצה ${Math.round(p.vol * 100)}% מהקיבולת של משמרת אחת, כל חודש ל־${CONTRACT.months} חודשים, ב־${Math.round((1 - I.price) * 100)}% פחות ממחיר השוק. כל יחידה שלא תסופק — קנס של פי אחד וחצי מהרווח עליה.`;
    ev.mentor = ctx.mentorLine(st, 'contractAsk', {}) || 'חוזה מוריד סיכון בשפל ועולה כסף בגאות. ומה קורה אם הקו עומד?';
    ev.data = { assetId: 'a' + a.id, name: a.n, vol: p.vol, share: I.share, months: I.months, price: I.price, delta: { now: I.now, boom: I.boom, normal: I.normal, recession: I.recession },
      penaltyPerMonth: I.penaltyPerMonth, withShift: I.withShift, counter: { chance: I.chance, price: CONTRACT.counterPrice }, countered: !!p.countered, hazard: hazardOf(a.op.cond),
      note: 'ההפרש בתזרים החודשי של הקו עם החוזה מול בלעדיו, בשלושה מצבי שוק. בשוק חזק החוזה תופס קיבולת שהייתה נמכרת במחיר מלא.' };
    ev.options = [
      ctx.opt('accept', `לחתום (עכשיו ${ctx.sgn(I.now)} בחודש · בשפל ${ctx.sgn(I.recession)})`, true, { kind: 'contract', net: I.now }),
      ...(p.countered ? [] : [ctx.opt('counter', `לבקש ${Math.round((1 - CONTRACT.counterPrice) * 100)}% הנחה במקום ${Math.round((1 - CONTRACT.price) * 100)}% · סיכוי ${Math.round(I.chance * 100)}%`, true, { kind: 'offer', chance: I.chance })]),
      ctx.opt('decline', 'לוותר — להישאר בשוק הפתוח', true),
    ];
    const fits = p.vol <= 0.6 * SHIFT_CAP[a.op.shift || 1];
    const pick = fits && (I.normal + I.recession) / 2 > 0 ? 'accept' : 'decline';
    ev.options.find((o) => o.id === pick).primary = true;
  },
  choose(st, p, o, params, out, ctx) {
    const a = st.assets.find((x) => x.id === p.assetId);
    if (o.id === 'decline' || !a) { out.mentor = ctx.mentorLine(st, 'contractNo', {}) || null; ctx.logDecision(st, 'חוזה אספקה', 'ויתר'); return true; }
    if (o.id === 'counter') {
      p.countered = true;
      if (p.wr[1] < contractChance(st)) { p.price = CONTRACT.counterPrice; out.mentor = ctx.mentorLine(st, 'contractWon', {}) || 'הלקוח הסכים. עכשיו להחליט: לחתום או לוותר.'; ctx.addLuck(st, 'negotiation', 0); return false; }
      out.mentor = ctx.mentorLine(st, 'contractLost', {}) || 'הלקוח הלך למפעל אחר. משא ומתן הוא סיכון.';
      ctx.logDecision(st, 'חוזה אספקה', 'ביקש הנחה קטנה ונכשל'); return true;
    }
    a.op.contract = { vol: p.vol, price: p.price ?? CONTRACT.price, from: st.month, until: st.month + CONTRACT.months - 1, rn: p.wr[2] };
    out.mentor = ctx.mentorLine(st, 'contractYes', {}) || 'חתמת. עכשיו יש לך ביקוש קבוע — וגם התחייבות קבועה.';
    ctx.lesson(st, out, 'contract_spot'); ctx.logDecision(st, 'חוזה אספקה', 'חתם', Math.round(p.vol * 100));
    revalue(st, a);
    return true;
  },
  score(st, ev, ctx) {
    const d = ev.data || {}; const E = Math.max(1, ctx.expenses(st)); const D = d.delta || {};
    const exp = ((D.normal || 0) * 2 + (D.recession || 0) + (D.boom || 0)) / 4; const hz = d.hazard || 0;
    return ev.options.filter((o) => o.enabled).map((o) => {
      let U = 0;
      if (o.id === 'accept') U = (exp * 12 - hz * 12 * (d.penaltyPerMonth || 0) * 2) / E;
      if (o.id === 'counter') U = d.counter.chance * Math.max(0, exp * 12 * 1.1) / E;
      return { id: o.id, U: round2(U), flags: [], reasons: [] };
    });
  },
};

/* ---------------------------------------------------------------- between-roll actions (`Z`) */
plant.act = {
  maint(st, p, out, ctx) { const [id, m] = String(p || '').split(':'); const a = findLine(st, id); if (!a || !MAINT_LABEL[m]) return fail(out, 'bad_param'); if (a.op.maint === m) return fail(out, 'כבר כך');
    a.op.maint = m; if (m !== 'preventive') ctx.lesson(st, out, 'deferred_maintenance'); out.toast = `${a.n}: תחזוקה ${MAINT_LABEL[m]}`; return true; },
  shift(st, p, out, ctx) { const [id, s] = String(p || '').split(':'); const a = findLine(st, id); const n = +s; if (!a || ![1, 2, 3].includes(n)) return fail(out, 'bad_param'); if (a.op.shift === n) return fail(out, 'כבר כך');
    if (n === 3 && (W(st).noShift3Until || 0) >= st.month) return fail(out, 'אין עובדים מקצועיים למשמרת לילה עכשיו'); if (a.op.mothball) return fail(out, 'הקו מושבת');
    a.op.shift = n; ctx.lesson(st, out, 'idle_capacity'); out.toast = `${a.n}: ${n === 1 ? 'משמרת אחת' : n === 2 ? 'שתי משמרות' : 'שלוש משמרות'}`; return true; },
  overhaul(st, p, out, ctx) { const a = findLine(st, p); if (!a || pendingLine(a, st.month)) return fail(out, 'bad_param'); const cost = Math.round(a.op.cost * OVERHAUL.pct / 1000) * 1000;
    if (a.op.cond >= 85) return fail(out, 'הקו במצב טוב'); if (st.cash < cost) return fail(out, 'אין מספיק מזומן');
    st.cash -= cost; a.op.cond = OVERHAUL.cond; a.op.downUntil = Math.max(a.op.downUntil || 0, st.month); ctx.cashFx(out, -cost, `שיפוץ ${ctx.fmtM(cost)}`); revalue(st, a); out.toast = `${a.n}: שיפוץ כללי — החודש הוא עומד, ואחר כך כמו חדש.`; ctx.lesson(st, out, 'deferred_maintenance'); return true; },
  mothball(st, p, out, ctx) { const [id, s] = String(p || '').split(':'); const a = findLine(st, id); if (!a || !['on', 'off'].includes(s) || pendingLine(a, st.month)) return fail(out, 'bad_param'); const on = s === 'on';
    if (!!a.op.mothball === on) return fail(out, 'כבר כך'); if (on && (a.op.lockUntil || 0) >= st.month) return fail(out, 'הסכם העבודה עם הוועד: אי אפשר להשבית בשנה הראשונה');
    if (on && a.op.contract && a.op.contract.until >= st.month) return fail(out, 'יש חוזה פעיל על הקו');
    if (!on) { const cost = Math.round(a.op.cost * MOTHBALL.restart / 1000) * 1000; if (st.cash < cost) return fail(out, 'אין מספיק מזומן'); st.cash -= cost; ctx.cashFx(out, -cost, `הפעלה מחדש ${ctx.fmtM(cost)}`); }
    a.op.mothball = on; revalue(st, a); out.toast = on ? `${a.n} הושבת: ${Math.round(MOTHBALL.fixed * 100)}% מהעלויות הקבועות, המצב קפוא.` : `${a.n} חוזר לעבוד.`; ctx.lesson(st, out, 'idle_capacity'); return true; },
  sellLine(st, p, out, ctx) { const a = findLine(st, p); if (!a || pendingLine(a, st.month)) return fail(out, 'bad_param'); if ((a.op.lockUntil || 0) >= st.month) return fail(out, 'הסכם העבודה עם הוועד: אי אפשר למכור בשנה הראשונה');
    const offer = Math.round(a.value * SELL / 1000) * 1000; const net = offer - a.debt;
    st.cash += net; st.stats.sold++; st.stats.soldProfit += net - a.down; st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); ctx.cashFx(out, net, ctx.sgn(net)); ctx.ensureCash(st, out, 'sell');
    out.toast = `מכרת את ${a.n} למתחרה ב־${ctx.fmtM(offer)} (${Math.round(SELL * 100)}% מהשווי): ${ctx.fmtM(net)} אחרי החוב.`; return true; },
  leaseback(st, p, out, ctx) { const a = findLine(st, p); if (!a || pendingLine(a, st.month)) return fail(out, 'bad_param'); if (a.op.lease) return fail(out, 'המבנה כבר נמכר');
    const cash = Math.round(a.op.cost * LEASE.cash / 1000) * 1000; a.op.lease = Math.round(cash * LEASE.rent); st.cash += cash; ctx.cashFx(out, cash, '+' + ctx.fmtM(cash)); revalue(st, a);
    out.toast = `מכרת את המבנה של ${a.n} ושכרת אותו בחזרה: ${ctx.fmtM(cash)} עכשיו, ו־${ctx.fmtM(a.op.lease)} שכירות כל חודש.`; return true; },
  renegotiate(st, p, out, ctx) { const a = findLine(st, p); const c = a && a.op.contract; if (!c || c.until < st.month) return fail(out, 'אין חוזה פעיל'); if (c.tried) return fail(out, 'כבר ניסית');
    c.tried = true; const ch = CONTRACT.renegP + (isTrader(st) ? CONTRACT.traderBonus : 0);
    if ((c.rn ?? 1) < ch) { a.op.contract = null; out.toast = `הלקוח הסכים לסיים את החוזה של ${a.n} בלי קנס.`; ctx.addLuck(st, 'negotiation', 0); revalue(st, a); return true; }
    out.toast = 'הלקוח סירב. החוזה נשאר כמו שהוא.'; return true; },
  factor(st, p, out, ctx) { const w = W(st); if (w.factorDue) return fail(out, 'כבר מכרת את החשבוניות של החודש'); const env = envOf(st, ctx); let amt = 0;
    for (const a of lines(st)) { const c = a.op.contract; if (!c || c.until < st.month) continue; const m = lineMonth(a.op, a.debt, env); amt += Math.round(a.op.full * (a.op.eff ?? 1) * m.contractOut * c.price); }
    amt = Math.round(amt / 1000) * 1000; if (amt < 10000) return fail(out, 'אין חשבוניות של חוזים למכור');
    const got = Math.round(amt * (1 - FACTOR)); w.factorDue = amt; st.cash += got; ctx.cashFx(out, got, '+' + ctx.fmtM(got));
    out.toast = `מכרת לבנק את החשבוניות של החודש: ${ctx.fmtM(got)} עכשיו (${Math.round(FACTOR * 100)}% עמלה). ביום המשכורת הכסף של הלקוחות הולך לבנק.`; return true; },
  automate(st, p, out, ctx) { const a = findLine(st, p); if (!a || pendingLine(a, st.month)) return fail(out, 'bad_param'); if (a.op.auto) return fail(out, 'כבר אוטומטי'); const cost = autoCost(st, a);
    if (st.cash < cost) return fail(out, 'אין מספיק מזומן'); st.cash -= cost; a.op.auto = true; ctx.cashFx(out, -cost, `אוטומציה ${ctx.fmtM(cost)}`); revalue(st, a); out.toast = `${a.n}: אוטומציה — עלות משתנה −${Math.round((1 - AUTO.varCut) * 100)}%.`; return true; },
  solar(st, p, out, ctx) { const a = findLine(st, p); if (!a || pendingLine(a, st.month)) return fail(out, 'bad_param'); if (a.op.solar) return fail(out, 'כבר יש'); const cost = solarCost(a);
    if (st.cash < cost) return fail(out, 'אין מספיק מזומן'); st.cash -= cost; a.op.solar = true; ctx.cashFx(out, -cost, `גג סולארי ${ctx.fmtM(cost)}`); revalue(st, a); out.toast = `${a.n}: גג סולארי — עלויות קבועות −8%.`; return true; },
};
const autoCost = (st, a) => Math.round(Math.max(AUTO.min, a.op.cost * AUTO.pct) * ((W(st).grantUntil || 0) >= st.month ? AUTO.grant : 1) / 1000) * 1000;
const solarCost = (a) => Math.round(Math.max(SOLAR.min, a.op.cost * SOLAR.pct) / 1000) * 1000;

/** One month of every line's fixed + maintenance costs (the plant's runway unit). */
function plantFixed(st, ctx) { const env = envOf(st, ctx); let f = 0; for (const a of lines(st)) { const m = lineMonth(a.op, a.debt, env); f += (m.fixed || 0) + (m.maint || 0); } return f; }
/** The guide's suggested maintenance and shift for a line (public numbers only). */
export function suggestOps(st, a, phase) {
  const o = a.op; const m = lineMonth(o, a.debt, { month: st.month, phase });
  const loaded = !!(o.contract && o.contract.until >= st.month); void m;
  const maint = o.cond < 72 || (loaded && o.cond < 85) ? 'preventive' : o.cond >= 82 ? 'basic' : o.maint === 'run' ? 'basic' : o.maint; // keep the line in its band: cheap while fit, preventive once worn
  const boom = phase === 'exp';
  const shift = boom && o.spot * DEM[o.cyc || 'pro'].exp + (o.contract ? o.contract.vol : 0) > 1.05 ? 2 : (o.contract && o.contract.vol + o.spot * DEM[o.cyc || 'pro'][phase] > 1.05 ? 2 : 1);
  return { maint, shift };
}
function actionList(st, ctx) {
  const out = []; const E0 = ctx.expenses(st) + plantFixed(st, ctx); const label = ctx.econLabel(st); // the guide's cash rules keep a month of the lines' fixed costs too
  const pubPhase = label === 'צמיחה' ? 'exp' : label === 'מיתון' ? 'rec' : label === 'התאוששות' ? 'recov' : 'slow'; // the public gauge, never the true phase
  const env = envOf(st, ctx);
  for (const a of lines(st)) {
    const o = a.op; if (pendingLine(a, st.month)) continue;
    const sg = suggestOps(st, a, pubPhase);
    for (const m of ['preventive', 'basic', 'run']) out.push({ id: 'maint', param: `${a.id}:${m}`, assetId: 'a' + a.id, label: `${a.n}: תחזוקה ${MAINT_LABEL[m]}`, enabled: o.maint !== m, current: o.maint === m, suggested: !o.mothball && o.maint !== m && sg.maint === m });
    for (const s of [1, 2, 3]) { const blocked = s === 3 && (W(st).noShift3Until || 0) >= st.month; out.push({ id: 'shift', param: `${a.id}:${s}`, assetId: 'a' + a.id, label: `${a.n}: ${s === 1 ? 'משמרת אחת' : s === 2 ? 'שתי משמרות' : 'שלוש משמרות'}`, enabled: o.shift !== s && !blocked && !o.mothball, current: o.shift === s, reason: blocked ? 'אין עובדים למשמרת לילה' : undefined, suggested: !o.mothball && o.shift !== s && sg.shift === s }); }
    const oc = Math.round(o.cost * OVERHAUL.pct / 1000) * 1000;
    // housekeeping pass: the suggestion weighs the value an overhaul restores (the valuation's condition factor) against its cost — a worn big
    // plant gains several times the overhaul in value, which only the max-debt strategy used to collect (it had the cash)
    const vGain = o.cond < 85 ? Math.max(0, lineValue({ ...o, cond: OVERHAUL.cond }, phaseOf(st)) - a.value) : 0;
    out.push({ id: 'overhaul', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: שיפוץ כללי (${ctx.fmtM(oc)}, חודש השבתה, מצב 95${vGain > oc ? `, שווי +${ctx.fmtM(vGain)}` : ''})`, enabled: o.cond < 85 && st.cash >= oc, reason: o.cond >= 85 ? 'הקו במצב טוב' : st.cash < oc ? 'אין מספיק מזומן' : undefined, cost: oc, gain: vGain,
      suggested: !o.mothball && o.cond < 85 && st.cash >= oc + 2 * E0 && (o.cond < 45 || (vGain >= 3 * oc && !(o.contract && o.contract.until >= st.month))) && !(o.downUntil != null && o.downUntil >= st.month) });
    const m = lineMonth(o, a.debt, env);
    const losing = m.cf < 0 && !o.contract;
    out.push({ id: 'mothball', param: `${a.id}:${o.mothball ? 'off' : 'on'}`, assetId: 'a' + a.id, label: o.mothball ? `${a.n}: להפעיל מחדש (${ctx.fmtM(Math.round(o.cost * MOTHBALL.restart / 1000) * 1000)})` : `${a.n}: להשבית זמנית (עלויות קבועות −60%)`, enabled: o.mothball || ((o.lockUntil || 0) < st.month && !(o.contract && o.contract.until >= st.month)), suggested: false });
    out.push({ id: 'sellLine', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור למתחרה (${ctx.fmtM(Math.round(a.value * SELL / 1000) * 1000)})`, enabled: (o.lockUntil || 0) < st.month, suggested: false });
    if (!o.lease) out.push({ id: 'leaseback', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור את המבנה ולשכור בחזרה (${ctx.fmtM(Math.round(o.cost * LEASE.cash / 1000) * 1000)})`, enabled: true, suggested: false });
    if (o.contract && !o.contract.tried && o.contract.until >= st.month) out.push({ id: 'renegotiate', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: לנסות לצאת מהחוזה`, enabled: true, suggested: losing });
    if (!o.auto) { const c = autoCost(st, a); const gain = Math.round(o.full * (1 - o.cm) * Math.min(o.spot, 1) * (1 - AUTO.varCut)); out.push({ id: 'automate', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: אוטומציה (${ctx.fmtM(c)} → בערך +${ctx.fmtM(gain)} בחודש)`, enabled: st.cash >= c, reason: st.cash >= c ? undefined : 'אין מספיק מזומן', gain, suggested: st.cash >= c + 4 * E0 && gain * 36 > c }); }
    if (!o.solar) { const c = solarCost(a); const gain = Math.round(o.fixed * (o.union ? UNION : 1) * (1 - SOLAR.fixedCut)); out.push({ id: 'solar', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: גג סולארי (${ctx.fmtM(c)} → ${ctx.fmtM(gain)} בחודש)`, enabled: st.cash >= c, reason: st.cash >= c ? undefined : 'אין מספיק מזומן', gain, suggested: st.cash >= c + 4 * E0 && gain * 36 > c }); }
  }
  if (lines(st).some((a) => a.op.contract && a.op.contract.until >= st.month)) out.push({ id: 'factor', param: null, label: `למכור לבנק את החשבוניות של החודש (${Math.round(FACTOR * 100)}% עמלה)`, enabled: !W(st).factorDue, suggested: false });
  return out;
}
function indicatorsOf(st, ctx) {
  const w = W(st); const env = envOf(st, ctx); const ls = lines(st); const ops = isOps(st);
  let contrib = 0, fixed = 0, util = 0, capSum = 0, cf = 0;
  const rows = ls.map((a) => {
    const o = a.op; const m = lineMonth(o, a.debt, env); const h = hazardOf(o.cond);
    if (!m.pending) { contrib += m.rev - m.varc; fixed += m.fixed + m.maint; if (!m.mothball) { util += m.util; capSum += SHIFT_CAP[m.shift || o.shift || 1]; } cf += m.cf; }
    return { assetId: 'a' + a.id, name: a.n, lk: o.lk, label: LK_LABEL[o.lk] || o.lk, cond: Math.round(o.cond), condPips: o.cond >= 70 ? 3 : o.cond >= 40 ? 2 : 1, condLight: o.cond >= 70 ? 'green' : o.cond >= 40 ? 'amber' : 'red',
      hazard: ops ? h : null, hazardBand: hazardBand(h), hazardLabel: BAND_LABEL[hazardBand(h)], maint: o.maint, shift: o.shift, util: m.util, cap: m.cap, demand: m.demand ?? null, cfNow: m.cf, value: a.value, debt: a.debt,
      down: !!m.down, downUntil: m.down ? o.downUntil : null, pending: !!m.pending, readyAt: m.pending ? o.readyAt : null, mothball: !!o.mothball, auto: !!o.auto, solar: !!o.solar, lease: o.lease || 0, slot: o.slot,
      contract: o.contract && o.contract.until >= st.month ? { vol: o.contract.vol, price: o.contract.price, until: o.contract.until } : null, penalty: m.pen || 0 };
  });
  const coverage = fixed > 0 ? round2(contrib / fixed) : null;
  const runway = fixed > 0 ? round2((st.cash + (st.savings || 0)) / fixed) : null;
  const utilAvg = capSum > 0 ? round2(util / capSum) : null;
  return {
    plant: { lines: ls.length, slots: SLOTS, utilisation: utilAvg, coverage, runway, fixedMonth: Math.round(fixed), cfMonth: r10(cf), breakdowns: w.breakdowns || 0, penalties: w.penalties || 0, repairs: w.repairs || 0,
      noShift3Until: w.noShift3Until || 0, grant: (w.grantUntil || 0) >= st.month, inspections: (w.insp || []).length, inspectStop12: recentStop(st), starGate: { id: 'inspect12', ok: !recentStop(st), label: STAR_GATE_LABEL }, factorDue: w.factorDue || 0, exactHazard: ops,
      shocks: (w.shocks || []).map((s) => ({ t: s.t, v: s.v, until: s.until, n: s.n || '' })) },
    panel: {
      id: 'plant', title: 'קווי ייצור',
      gauges: [{ id: 'util', label: 'ניצולת קיבולת', value: utilAvg, min: 0, max: 1, ref: 0.85 }, { id: 'coverage', label: 'כיסוי עלויות קבועות (תרומה ÷ קבועות)', value: coverage, ref: 1.3 }, { id: 'runway', label: 'כרית (חודשי עלויות קבועות)', value: runway, ref: 3 }],
      bars: { label: ops ? 'סיכוי לתקלה החודש' : 'סיכון לתקלה', items: rows.map((r) => ({ assetId: r.assetId, name: r.name, value: ops ? r.hazard : null, band: r.hazardBand })) },
      rows,
      actions: actionList(st, ctx),
    },
  };
}
export default plant;
