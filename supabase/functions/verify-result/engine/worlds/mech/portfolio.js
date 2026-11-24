// World mechanic `portfolio` — w10 מרכז הפיננסים (docs/full-upgrade/worlds/w10-finance.md, CATALOG-25 §1.2 / §2.3): own money across
// three LIQUIDITY CLASSES, borrowed against on margin. It sits on the `market` module (js/worlds/mech/market.js: st.mkt, the listed
// companies and the index fund = the DAILY class) and adds:
//   • MONTHLY class — funds bought on the deal tile from the content pool `deal` (js/content/deals-w10.js): government / corporate bonds,
//     private credit, REITs, a hedge fund … each with public factor loadings on the policy rate, credit spreads, property and the index
//     (correlation emerges from shared factors: no matrix) and, for the traps, a SEALED one (a "guaranteed 12 %" note with 3× hidden credit
//     beta; a fund marked at stale prices). Redemption is paid at the next payday at NAV, or now at −5 %.
//   • LOCKED class — private deals on the new 'Y' tile: a PE fund commitment (capital calls on sealed months: the liquidity trap) or a
//     direct stake (locked 18–36 months), exits at a sealed multiple; a secondary sale costs 25 %.
//   • MARGIN — borrow against the daily (60 %) and monthly (40 %) classes, never the locked one. LTV > 1 at a payday → a margin call due at
//     the next payday; still > 1 then (or > 1.25 at once) → a FORCED liquidation down to 60 % (daily first at a 3 % fire-sale cost, then
//     monthly −5 %, then locked −30 %). ★★★ needs 0 forced liquidations.
//   • A put overlay (1 % a quarter of the daily class; pays the index's monthly loss beyond −5 %).
// Contract: pure; no engine import; draws ONLY from the `world` stream with FIXED counts — 2 at init (the sealed fate of a starting private
// commitment, drawn by every character), 3 per payday (rate, credit spread, property noise), 4 per 'Y' landing (the deal, its size, its
// sealed multiple, its sealed call / exit schedule). The market's own draws are its own (stream `exch`).
import * as MKT from './market.js';

export const ID = 'portfolio';
export const DRAWS = Object.freeze({ init: 2, month: 3, landing: Object.freeze({ Y: 4 }) });
export const LTV = Object.freeze({ daily: 0.6, monthly: 0.4, locked: 0, trader: 0.1, hard: 1.25, target: 0.6, borrowMax: 0.95 }); // a forced sale brings the debt down to 60 % of the capacity
export const FIRE = Object.freeze({ daily: 0.03, monthly: 0.05, locked: 0.3, secondary: 0.25 });
export const RATE = Object.freeze({ start: 4.0, min: 0.5, max: 9, revert: 0.04, noise: 0.18, margin: 4.0, trader: 1.0 }); // annual %: the margin loan costs the policy rate + 4 % (the trader + 5 %)
export const SPREAD = Object.freeze({ start: 2.0, min: 0.8, max: 7, revert: 0.08, noise: 0.15, blowout: 4.5, dur: 4 }); // credit spread (pp)
export const PROP = Object.freeze({ drift: 0.003, noise: 0.012 }); // property index return / month
export const HEDGE = Object.freeze({ cost: 0.0033, floor: -0.05 }); // put overlay: cost per month of the daily class, pays below −5 %
export const PE = Object.freeze({ calls: 4, gapMin: 3, gapSpan: 4, distFrom: 18, distSpan: 12, dists: 3, jcurve: 0.94, remark: 6 });
export const STAKE = Object.freeze({ lockMin: 18, lockSpan: 18 });
export const REG_EXIT = Object.freeze({ growth: 1.0, bubble: 1.15, recession: 0.8, recovery: 0.95, highVol: 0.9, sectorCrisis: 0.92 }); // exits by regime
const TILT = Object.freeze({ // credit spread pp / month and property return / month by market regime
  spread: { growth: -0.05, bubble: -0.08, recession: 0.25, recovery: -0.12, highVol: 0.12, sectorCrisis: 0.08 },
  prop: { growth: 0.002, bubble: 0.006, recession: -0.008, recovery: 0.004, highVol: -0.002, sectorCrisis: -0.002 },
});
const DEALS = Object.freeze([ // the 'Y' tile's private deals (TUNE): type, size band (share of the world's deal band), multiple range [lo, hi]
  Object.freeze({ type: 'pe', n: 'קרן פרייבט אקוויטי', d: 'קרן שקונה חברות פרטיות. אתה מתחייב לסכום — והיא קוראת לכסף בשלבים, מתי שהיא צריכה.', size: [0.25, 0.7], moic: [0.5, 2.0] }),
  Object.freeze({ type: 'pe', n: 'קרן הון סיכון בשלב מאוחר', d: 'קרן שמשקיעה בחברות טכנולוגיה לפני הנפקה. מעט מאוד נזילות, הרבה פיזור בתוצאות.', size: [0.2, 0.5], moic: [0.1, 2.8] }),
  Object.freeze({ type: 'stake', n: 'אחזקה ישירה בחברה פרטית', d: 'נתח של 20% בחברה משפחתית רווחית. אין מחיר יומי — ואין קונה מחר בבוקר.', size: [0.2, 0.6], moic: [0.4, 1.9] }),
  Object.freeze({ type: 'stake', n: 'שותפות בנדל"ן מניב', d: 'בניין משרדים עם שוכרים, דרך שותפות סגורה. מחלקת רווח בסוף התקופה.', size: [0.25, 0.8], moic: [0.7, 1.5] }),
  Object.freeze({ type: 'pe', n: 'קרן אשראי פרטי', d: 'קרן שמלווה לחברות בינוניות. תשואה יציבה יחסית — עד שלווה אחד לא מחזיר.', size: [0.2, 0.6], moic: [0.85, 1.3] }),
]);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const round2 = (x) => Math.round(x * 100) / 100;
const round3 = (x) => Math.round(x * 1000) / 1000;
const round4 = (x) => Math.round(x * 10000) / 10000;
const r1000 = (x) => Math.round(x / 1000) * 1000;
const frac = (x) => x - Math.floor(x);
const PF = (st) => st.world.pf;
const funds = (st) => st.assets.filter((a) => a.op && a.op.ck === 'fund');
const privs = (st) => st.assets.filter((a) => a.op && a.op.ck === 'private');
const isTrader = (st) => st.charId === 'floorTrader';
const regimeOf = (st) => (st.mkt ? st.mkt.regime.id : 'growth');
const findA = (st, id, ck) => { const n = +String(id || '').replace(/^a/, ''); return st.assets.find((x) => x.id === n && x.op && x.op.ck === ck) || null; };
function fail(out, msg) { out.ok = false; out.error = msg; return false; }

/* ---------------------------------------------------------------- classes, capacity, LTV */
/** Value by liquidity class: daily = listed holdings + the index fund (claims are not marginable), monthly = funds, locked = privates. */
export function classes(st) {
  const daily = Math.max(0, MKT.holdingsValue(st) - (st.mkt ? st.mkt.claims.reduce((s, c) => s + c.amount, 0) : 0));
  let monthly = 0, locked = 0; for (const a of funds(st)) monthly += a.value; for (const a of privs(st)) locked += a.value;
  return { daily, monthly, locked, claims: st.mkt ? st.mkt.claims.reduce((s, c) => s + c.amount, 0) : 0 };
}
export const ltvRates = (st) => ({ daily: LTV.daily + (isTrader(st) ? LTV.trader : 0), monthly: PF(st).freezeUntil >= st.month ? 0 : LTV.monthly, locked: LTV.locked });
/** Margin capacity: Σ class value × its LTV rate. */
export function capacity(st) { const c = classes(st); const r = ltvRates(st); return Math.round(c.daily * r.daily + c.monthly * r.monthly); }
export const ltvOf = (st) => { const cap = capacity(st); const d = PF(st).debt; return d <= 0 ? 0 : cap <= 0 ? 9.99 : round3(d / cap); };
export const marginRate = (st) => round2(PF(st).rate + RATE.margin + (isTrader(st) ? RATE.trader : 0));
export const marginInterest = (st) => Math.round(PF(st).debt * marginRate(st) / 1200);
/** The unfunded part of every PE commitment (a promise: cash the funds will call). */
export const unfunded = (st) => privs(st).reduce((s, a) => s + (a.op.type === 'pe' ? a.op.commit - a.op.called : 0), 0);

/* ---------------------------------------------------------------- valuations */
function fundNav(st, a, f) { // f = {dr (pp), ds (pp), pr, ir}: one month of factor moves → the fund's NAV
  const o = a.op; const cr = -SPREAD.dur * f.ds / 100;
  let ret = o.beq * f.ir - o.dur * f.dr / 100 + o.bcr * (o.hid || 1) * cr + o.bpr * (o.hidP || 1) * f.pr + (o.alpha || 0);
  ret = clamp(ret, -0.5, 0.5); o.nav = Math.max(1000, Math.round(o.nav * (1 + ret)));
  if (o.kind === 'note' && !o.dflt && PF(st).spread >= SPREAD.blowout) { o.dflt = st.month; o.nav = Math.round(o.nav * 0.35); }
}
function fundValue(st, a) { const o = a.op; if (o.kind === 'stale') { if (st.month >= o.markAt) { o.mark = o.nav; o.markAt = st.month + PE.remark; } a.value = o.mark; } else a.value = o.nav; a.debt = 0; }
function privValue(st, a) {
  const o = a.op; const t = st.month - o.since; const R = REG_EXIT[regimeOf(st)] || 1;
  if (st.month >= o.markAt) { const pathT = clamp(t / Math.max(1, o.horizon), 0, 1); o.mark = round3(t < 12 ? PE.jcurve : 1 + (o.moic * R - 1) * pathT); o.markAt = st.month + PE.remark; }
  a.value = Math.max(0, Math.round((o.type === 'pe' ? o.called - o.returned : o.cost) * o.mark)); a.debt = 0;
}
const revalueAll = (st) => { for (const a of funds(st)) fundValue(st, a); for (const a of privs(st)) privValue(st, a); };

/* ---------------------------------------------------------------- forced liquidation (the margin call) */
/** Sell until margin debt ≤ target (60 %) × capacity: daily first (largest positions, +3 % fire-sale cost), then funds (−5 %), then privates (−30 %). */
export function liquidate(st, out, ctx, why) {
  const P = PF(st); const M = st.mkt; let sold = 0; const lines = [];
  const enough = () => P.debt <= LTV.target * capacity(st) || P.debt <= 0;
  const repay = (cash) => { const x = Math.min(P.debt, Math.max(0, cash)); P.debt -= x; st.cash -= x; };
  // daily: the largest positions first (the index fund and companies); x ₪ sold (at a 3 % fire-sale cost) lowers the debt by x × 0.97 and
  // the capacity by x × its LTV rate → sell x ≥ (debt − target × cap) / (0.97 − target × rate)
  const pos = Object.entries(M.held).map(([id, h]) => ({ id, v: Math.round(h.qty * (id === 'IDX' ? M.idx.px : (M.cos[id] || {}).px || 0) / 100), h })).filter((x) => x.v > 0 && !MKT.tradeBlock(st, x.id)).sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  for (const p of pos) { if (enough()) break;
    const x = Math.max(0, P.debt - LTV.target * capacity(st)) / Math.max(0.05, (1 - FIRE.daily) - LTV.target * ltvRates(st).daily);
    const px = p.id === 'IDX' ? M.idx.px : M.cos[p.id].px; const qty = Math.min(p.h.qty, Math.max(1, Math.ceil(x * 1.02 * 100 / Math.max(1, px))));
    const t = MKT.trade(st, p.id, 's', qty, out, ctx, { forced: true, discount: FIRE.daily }); if (t.ok) { sold += t.cash; repay(t.cash); lines.push(p.id === 'IDX' ? M.idxName : M.cos[p.id].name); } }
  for (const a of funds(st).slice().sort((x, y) => y.value - x.value)) { if (enough()) break; const cash = Math.round(a.value * (1 - FIRE.monthly)); st.cash += cash; sold += cash; repay(cash); removeAsset(st, a, out); lines.push(a.n); }
  for (const a of privs(st).slice().sort((x, y) => y.value - x.value)) { if (enough()) break; const cash = Math.round(a.value * (1 - FIRE.locked)); st.cash += cash; sold += cash; repay(cash); removeAsset(st, a, out); lines.push(a.n); }
  P.forcedEvents++; P.forcedValue += sold; P.call = null;
  if (st.cash < 0) ctx.ensureCash(st, out, 'sell');
  ctx.lesson(st, out, 'margin_call');
  out.news.push({ kind: 'portfolio', type: 'forced', text: `מכירה כפויה (${why}): הברוקר מכר ${ctx.fmtM(sold)} — ${lines.slice(0, 4).join(', ')}${lines.length > 4 ? ' ועוד' : ''} — כדי לכסות את ההלוואה. מכירה בתחתית היא ההפסד שלא חוזר.` });
  return sold;
}
function removeAsset(st, a, out) { st.assets = st.assets.filter((x) => x !== a); out.despawn.push('a' + a.id); st.stats.sold++; }
/** The payday margin check (after every valuation): open a call, cure it, or force a sale. */
function marginCheck(st, out, ctx, o = {}) {
  const P = PF(st); if (P.debt <= 0) { P.call = null; return; }
  const cap = capacity(st); const over = P.debt - cap;
  if (over > (LTV.hard - 1) * cap) { liquidate(st, out, ctx, 'ההלוואה עברה 125% מהבטוחות'); return; }
  if (o.immediateOnly) return;
  if (P.call && over > 0 && st.month >= P.call.due) { liquidate(st, out, ctx, 'קריאת המרווח לא כוסתה בזמן'); return; }
  if (over > 0 && !P.call) { P.call = { need: Math.round(over + 0.05 * cap), due: st.month + 1, at: st.month }; P.calls++;
    out.news.push({ kind: 'portfolio', type: 'marginCall', text: `קריאת מרווח: ההלוואה (${ctx.fmtM(P.debt)}) גדולה מהבטוחות (${ctx.fmtM(cap)}). עד המשכורת הבאה צריך להחזיר ${ctx.fmtM(P.call.need)} או למכור — אחרת הברוקר ימכור בשבילך.` });
    ctx.lesson(st, out, 'margin_call'); }
  else if (over <= 0 && P.call) { P.call = null; out.news.push({ kind: 'portfolio', type: 'callCured', text: 'קריאת המרווח כוסתה. ההלוואה שוב בתוך הבטוחות.' }); }
}

/** A character's starting market positions (no fees: they were bought before the game): the index fund, stocks by slot, the heir's block. */
function startPositions(st, S) {
  const M = st.mkt; if (!M) return;
  if (S.feeMult) M.feeMult = { ...S.feeMult };
  if (S.mandate) M.mandate = { sector: S.mandate };
  if (S.freeResearch) { M.freeResearch = true; for (const c of MKT.liveCos(st)) c.seen = { band: c.q < 0.4 ? 'low' : c.q < 0.7 ? 'mid' : 'high', distress: c.distress, m: st.month }; }
  const put = (id, value, basisPct = 1) => { const px = id === 'IDX' ? M.idx.px : M.cos[id].px; const qty = Math.floor(value * 100 / px); if (qty <= 0) return null;
    M.held[id] = { qty, basis: Math.round(qty * px / 100 * basisPct), fees: 0, divs: 0, opened: st.month }; return qty; };
  if (S.idx) put('IDX', S.idx);
  for (const x of S.stocks || []) { const id = M.slots[x.slot]; if (id) put(id, x.value); }
  if (S.block) { const ids = M.slots.filter(Boolean); const id = ids.find((i) => M.cos[i].size === 'large') || ids[0]; // the family company: the first large-cap listed
    const qty = put(id, Math.round(S.block.of * S.block.share), S.block.basis); if (qty) M.block = { coId: id, qty0: qty, sold: 0 }; }
}

/* ---------------------------------------------------------------- private deals */
function privFromDraws(st, deal, rs, scale, B) {
  const size = r1000((B[0] + (B[1] - B[0]) * (deal.size[0] + (deal.size[1] - deal.size[0]) * rs[1])) * scale);
  const moic = round2(deal.moic[0] + (deal.moic[1] - deal.moic[0]) * rs[2]); // SEALED
  const g = (k) => frac(rs[3] * k);
  if (deal.type === 'pe') {
    const sched = []; let m = st.month; for (let i = 0; i < PE.calls; i++) { m += PE.gapMin + Math.floor(g(7919 + i * 31) * PE.gapSpan); sched.push(m); }
    const d0 = st.month + PE.distFrom + Math.floor(g(613) * PE.distSpan); const dist = []; for (let i = 0; i < PE.dists; i++) dist.push(d0 + i * 6);
    return { ck: 'private', type: 'pe', name: deal.n, commit: size, called: 0, returned: 0, paidOut: 0, moic, sched, dist, since: st.month, horizon: dist[dist.length - 1] - st.month, mark: 1, markAt: st.month + PE.remark, band: moicBand(deal, null) };
  }
  const lock = STAKE.lockMin + Math.floor(g(977) * STAKE.lockSpan);
  return { ck: 'private', type: 'stake', name: deal.n, cost: size, moic, lockUntil: st.month + lock, since: st.month, horizon: lock, mark: 1, markAt: st.month + PE.remark, band: moicBand(deal, null) };
}
/** The public multiple range of a deal: the deal's printed range, or ± 0.3 around the truth after due diligence. */
function moicBand(deal, moic) { return moic == null ? { lo: deal.moic[0], hi: deal.moic[1] } : { lo: round2(Math.max(deal.moic[0], moic - 0.3)), hi: round2(Math.min(deal.moic[1], moic + 0.3)) }; }
function privMonth(st, a, out, ctx) {
  const o = a.op; const R = REG_EXIT[regimeOf(st)] || 1;
  if (o.type === 'pe') {
    if (o.sched.includes(st.month) && o.called < o.commit) { const last = o.sched[o.sched.length - 1] === st.month; const amt = last ? o.commit - o.called : Math.min(o.commit - o.called, Math.round(o.commit / PE.calls));
      o.called += amt; st.cash -= amt; PF(st).callsPaid += amt; ctx.cashFx(out, -amt, `קריאה להון: ${a.n} ${ctx.fmtM(amt)}`);
      out.news.push({ kind: 'portfolio', type: 'capitalCall', text: `${a.n} קראה להון: ${ctx.fmtM(amt)}. ההתחייבות שנותרה: ${ctx.fmtM(o.commit - o.called)}.`, assetId: 'a' + a.id }); ctx.lesson(st, out, 'capital_call'); }
    if (o.dist.includes(st.month) && o.called > 0) { const left = o.dist.filter((m) => m >= st.month).length; const tot = Math.round(o.called * o.moic * R); const amt = Math.max(0, Math.round((tot - o.paidOut) / Math.max(1, left)));
      o.paidOut += amt; o.returned = Math.min(o.called, Math.round(o.called * (PE.dists - left + 1) / PE.dists)); st.cash += amt; PF(st).distGot += amt; ctx.cashFx(out, amt, `חלוקה מ${a.n} ${ctx.fmtM(amt)}`);
      out.news.push({ kind: 'portfolio', type: 'distribution', text: `${a.n} חילקה ${ctx.fmtM(amt)} במזומן.`, assetId: 'a' + a.id });
      if (left <= 1) { removeAsset(st, a, out); PF(st).exits++; return; } }
  } else if (st.month >= o.lockUntil) { const cash = Math.round(o.cost * o.moic * R); st.cash += cash; PF(st).distGot += cash; PF(st).exits++; ctx.cashFx(out, cash, `יציאה מ${a.n} ${ctx.fmtM(cash)}`);
    out.news.push({ kind: 'portfolio', type: 'exit', text: `${a.n}: תקופת הנעילה נגמרה — נמכרה ב־${ctx.fmtM(cash)} (${round2(o.moic * R)}× על ההשקעה).`, assetId: 'a' + a.id }); removeAsset(st, a, out); return; }
  privValue(st, a);
}

/* ---------------------------------------------------------------- the module */
export const portfolio = {
  id: ID, draws: DRAWS,
  lessons: ['margin_call', 'liquidity_ladder', 'capital_call', 'correlation', 'stale_marks', 'put_overlay'],
  mentorKeys: ['privAsk', 'privCommit', 'privPass', 'privDD', 'callDue'],
  sealed: ['world.pf.init', 'assets[].op.moic', 'assets[].op.sched', 'assets[].op.dist', 'assets[].op.hid', 'assets[].op.hidP', 'assets[].op.nav (stale funds)', 'pending.wr'],

  init(st, w, ch, ctx) {
    const rs = [ctx.draw(st), ctx.draw(st)]; // exactly 2 'world' draws at init, whoever plays (the sealed fate of a starting commitment)
    st.world.pf = { rate: RATE.start, rateAvg: RATE.start, spread: SPREAD.start, prop: 1, debt: 0, call: null, calls: 0, forcedEvents: 0, forcedValue: 0,
      hedge: false, hedgePaid: 0, hedgeGot: 0, freezeUntil: 0, gateUntil: 0, flash: null, callsPaid: 0, distGot: 0, exits: 0, peak: 0, maxDD: 0, init: rs, start: ch && ch.cash || 0, redeemQ: [] };
    startPositions(st, (ch && ch.start) || {});
  },
  defaults(st) { const P = PF(st); if (!P) return; if (!Array.isArray(P.redeemQ)) P.redeemQ = []; },

  monthly(st, out, ctx) {
    const P = PF(st); const u = [ctx.draw(st), ctx.draw(st), ctx.draw(st)]; const reg = regimeOf(st); // exactly 3 'world' draws every payday
    // 1. factors: the policy rate (mean-reverting), the credit spread (regime tilt), property; the index return is the market's month
    const r0 = P.rate; P.rate = round2(clamp(P.rate + (RATE.start - P.rate) * RATE.revert + (u[0] - 0.5) * 2 * RATE.noise, RATE.min, RATE.max)); P.rateAvg = round2(P.rateAvg + (P.rate - P.rateAvg) / 12);
    const s0 = P.spread; P.spread = round2(clamp(P.spread + (SPREAD.start - P.spread) * SPREAD.revert + (TILT.spread[reg] || 0) + (u[1] - 0.5) * 2 * SPREAD.noise, SPREAD.min, SPREAD.max));
    const pr = round4(PROP.drift + (TILT.prop[reg] || 0) + (u[2] - 0.5) * 2 * PROP.noise); P.prop = round4(P.prop * (1 + pr));
    let ir = st.mkt ? st.mkt.idxRet : 0;
    if (P.flash && P.flash.back <= st.month) { MKT.shock(st, { idx: P.flash.up }); ir = round4((1 + ir) * (1 + P.flash.up) - 1); P.flash = null; } // a flash crash recovers at the next payday
    for (const a of funds(st)) fundNav(st, a, { dr: P.rate - r0, ds: P.spread - s0, pr, ir });
    // 2. the put overlay: pay the index's monthly loss beyond −5 % on the daily class, then its monthly cost
    if (P.hedge) { const d = classes(st).daily; const pre = Math.round(d / (1 + ir)); if (ir < HEDGE.floor) { const got = Math.round(pre * (HEDGE.floor - ir)); st.cash += got; P.hedgeGot += got; ctx.cashFx(out, got, `הגנת אופציות ${ctx.fmtM(got)}`); out.news.push({ kind: 'portfolio', type: 'hedge', text: `ההגנה עבדה: המדד ירד ${Math.round(-ir * 100)}% והאופציות שילמו ${ctx.fmtM(got)}.` }); ctx.lesson(st, out, 'put_overlay'); }
      const cost = Math.round(d * HEDGE.cost); st.cash -= cost; P.hedgePaid += cost; if (cost) ctx.cashFx(out, -cost, `עלות הגנה ${ctx.fmtM(cost)}`); }
    // 3. redemptions ordered last month are paid at today's NAV
    for (const q of P.redeemQ.slice()) { const a = findA(st, q.id, 'fund'); P.redeemQ.splice(P.redeemQ.indexOf(q), 1); if (!a) continue; const cash = a.op.nav; st.cash += cash; ctx.cashFx(out, cash, `פדיון ${a.n} ${ctx.fmtM(cash)}`); removeAsset(st, a, out); }
    // 4. privates: capital calls, distributions, exits, marks
    for (const a of privs(st).slice()) privMonth(st, a, out, ctx);
    for (const a of funds(st)) { fundValue(st, a); if (a.op.kind === 'note' && a.op.dflt === st.month) out.news.push({ kind: 'portfolio', type: 'default', text: `${a.n}: מרווחי האשראי התפוצצו — והפיקדון ה"מובטח" הפסיק לשלם. השווי ירד ב־65%. התשואה הגבוהה הייתה מחיר של סיכון חבוי.`, assetId: 'a' + a.id });
      if (a.op.kind === 'stale' && a.op.markAt === st.month + PE.remark && st.month > a.op.since + 1) { ctx.lesson(st, out, 'stale_marks'); } }
    if (st.cash < 0) ctx.ensureCash(st, out, 'portfolio');
    // 5. the margin check (after every valuation)
    marginCheck(st, out, ctx);
    // 6. drawdown tracking (bounded: two numbers)
    const nw = ctx.netWorth(st); if (nw > P.peak) P.peak = nw; if (P.peak > 0) P.maxDD = Math.max(P.maxDD, round3(1 - nw / P.peak));
    if (classes(st).daily > 0 && Object.keys(st.mkt.held).length >= 3 && Math.abs(ir) > 0.06) ctx.lesson(st, out, 'correlation');
  },
  expense(st) { return marginInterest(st); },
  liability(st) { return PF(st) ? PF(st).debt : 0; },

  asset: {
    create(st, a, card, ctx) {
      const op = JSON.parse(JSON.stringify(card.op)); a.op = op; void ctx;
      if (op.ck === 'fund') { const g = op.gen || {}; op.nav = Math.round(card.value || card.cost); op.cost0 = Math.round(card.cost); op.yld = op.yld ?? round4((card.cf || 0) * 12 / Math.max(1, card.cost)); op.since = st.month;
        if (op.kind === 'note') op.hid = 3; if (op.kind === 'stale') { op.hidP = 1.6; op.mark = op.nav; op.markAt = st.month + PE.remark; } if (op.kind === 'hedge') op.alpha = round4(((g.x ?? 0.5) - 0.45) * 0.008); delete op.gen; fundValue(st, a); }
      if (op.ck === 'private' && op.start) { // a starting commitment (a year old): its sealed multiple and schedule are the 2 init draws
        const P = PF(st); const pr = privFromDraws(st, DEALS[op.deal || 0], [0, 0, P.init[0], P.init[1]], 1, dealBand(st, ctx));
        pr.commit = op.commit; pr.called = Math.round(op.commit / PE.calls); pr.sched = pr.sched.slice(1); pr.since = st.month - 12; pr.horizon += 12; pr.name = a.n;
        a.op = pr; op.start = false; }
      if (a.op.ck === 'private') privValue(st, a);
    },
    cf(st, a) { const o = a.op; if (o.ck === 'fund') return o.dflt ? 0 : Math.round(o.nav * o.yld / 12 / 10) * 10; return 0; },
  },
  deal: {
    describe(st, p, ev, ctx) {
      const c = p.card; if (!c.op || c.op.ck !== 'fund') return; const o = c.op;
      ev.data.fund = { kind: o.kind, cls: 'monthly', dur: o.dur, beq: o.beq, bcr: o.bcr, bpr: o.bpr, yieldPct: round2((c.cf || 0) * 12 / Math.max(1, c.cost) * 100), ltv: LTV.monthly, redeem: 'בתשלום במשכורת הבאה לפי השווי, או מיד ב־5% הנחה',
        note: o.kind === 'note' ? 'תשואה גבוהה בלי סיכון נראה לעין? תשאל איפה הסיכון.' : o.kind === 'stale' ? 'השווי מתעדכן רק פעם בחצי שנה — המחיר בדוח הוא לא מחיר שאפשר למכור בו מחר.' : 'נזילות חודשית: אפשר לפדות, אבל לא היום.' };
      const buy = ev.options.find((x) => x.kind === 'buy' && x.enabled); const pass = ev.options.find((x) => x.id === 'pass' && x.enabled);
      const C = classes(st); const nw = Math.max(1, ctx.netWorth(st)); const mShare = (C.monthly + c.cost) / nw;
      if (buy && o.kind !== 'note' && o.kind !== 'stale' && mShare <= 0.35 && st.cash - c.down >= ctx.expenses(st) * 6 + unfunded(st) * 0.5) ev.forcePrimary = buy.id; else if (pass) ev.forcePrimary = pass.id;
    },
  },
  market: {
    create(st, p, ctx) { // a card is decision-independent: applied at the landing (prints on the open candles)
      const c = p.card; const P = PF(st); const m = st.month; void ctx;
      if (c.mk === 'rate') { const r0 = P.rate; P.rate = round2(clamp(P.rate + c.dr, RATE.min, RATE.max)); for (const a of funds(st)) fundNav(st, a, { dr: P.rate - r0, ds: 0, pr: 0, ir: 0 }); MKT.shock(st, { idx: c.idx || 0, sectors: c.sectors }); }
      if (c.mk === 'spread') { const s0 = P.spread; P.spread = round2(clamp(P.spread + c.ds, SPREAD.min, SPREAD.max)); for (const a of funds(st)) fundNav(st, a, { dr: 0, ds: P.spread - s0, pr: 0, ir: 0 }); MKT.shock(st, { idx: c.idx || 0, sectors: c.sectors }); }
      if (c.mk === 'prop') { P.prop = round4(P.prop * (1 + c.pr)); for (const a of funds(st)) fundNav(st, a, { dr: 0, ds: 0, pr: c.pr, ir: 0 }); MKT.shock(st, { sectors: { property: c.pr * 1.5 } }); }
      if (c.mk === 'shock') { MKT.shock(st, { idx: c.idx || 0, sectors: c.sectors }); for (const a of funds(st)) fundNav(st, a, { dr: c.dr || 0, ds: c.ds || 0, pr: 0, ir: c.idx || 0 }); if (c.dr) P.rate = round2(clamp(P.rate + c.dr, RATE.min, RATE.max)); if (c.ds) P.spread = round2(clamp(P.spread + c.ds, SPREAD.min, SPREAD.max)); }
      if (c.mk === 'flash') { MKT.shock(st, { idx: c.idx }); P.flash = { back: m + 1, up: round4(1 / (1 + c.idx) * (1 + c.idx * (1 - c.rec)) - 1) }; }
      if (c.mk === 'freeze') P.freezeUntil = m + (c.months || 2) - 1;
      if (c.mk === 'gate') P.gateUntil = m + (c.months || 3) - 1;
      revalueAll(st);
      p.pf = { ltv: ltvOf(st), cap: capacity(st) };
    },
    describe(st, p, ev) { const c = p.card; const P = PF(st); ev.data.portfolio = { mk: c.mk, rate: P.rate, spread: P.spread, ltv: ltvOf(st), debt: P.debt, cap: capacity(st), freezeUntil: P.freezeUntil, gateUntil: P.gateUntil, flash: P.flash ? { back: P.flash.back } : null };
      ev.data.market = MKT.marketView(st) ? { regime: MKT.marketView(st).regime, idx: { px: st.mkt.idx.px, open: { ...st.mkt.idx.open } } } : null; },
  },
  crisis: { create(st, p, ctx) { if (p.card.mk) portfolio.market.create(st, p, ctx); } },
  tiles: {},
  act: {},
  actions(st, ctx) { return actionList(st, ctx); },
  indicators(st, ctx) { return indicatorsOf(st, ctx); },
  cityModels(st, out, ctx) {
    const w = ctx.world(st); const C = classes(st); const mods = w.models || {};
    if (C.daily > 0) out.push({ key: 'mkt:daily', assetId: 'mkt:daily', model: mods.daily || null, label: 'מניות וקרן מדד', kind: 'holding', cls: 'daily', value: C.daily, call: !!PF(st).call });
    for (const m of out) { const a = m.assetId && m.assetId[0] === 'a' ? st.assets.find((x) => 'a' + x.id === m.assetId) : null; if (!a || !a.op) continue;
      m.cls = a.op.ck === 'fund' ? 'monthly' : 'locked'; m.value = a.value; if (a.op.ck === 'fund') m.frozen = PF(st).freezeUntil >= st.month || (a.op.kind === 'credit' && PF(st).gateUntil >= st.month); if (a.op.ck === 'private') m.lockUntil = a.op.lockUntil || (a.op.dist ? a.op.dist[a.op.dist.length - 1] : null); }
  },
  recapHint(st) {
    const P = PF(st); if (!P) return null;
    if (P.forcedEvents) return 'בפעם הבאה: פחות מינוף על נכסים שאי אפשר למכור מהר. מכירה כפויה מוכרת בתחתית.';
    if (!st.mkt || !Object.keys(st.mkt.held).length) return 'בפעם הבאה: מניות וקרן מדד. מזומן לבד לא יגיע ל־₪400 מיליון.';
    if (unfunded(st) > 0 && P.callsPaid > 0 && P.maxDD > 0.25) return 'בפעם הבאה: התחייבויות לקרנות פרטיות קוראות לכסף בדיוק כשהשוק נופל. השאר כרית נזילה.';
    return null;
  },
  goalValue(st, key, ctx) {
    if (key === 'ltv') return ltvOf(st); if (key === 'forced') return PF(st).forcedEvents; if (key === 'maxDD') return PF(st).maxDD;
    if (key === 'liqMonths') { const E0 = Math.max(1, ctx.expenses(st)); return round2((st.cash + (st.savings || 0) + classes(st).daily) / E0); }
    return 0;
  },
  starGates(st) { const P = PF(st); return [{ id: 'noForced', stars: 3, ok: P.forcedEvents === 0, label: 'בלי אף מכירה כפויה' }]; },
};

/* ---------------------------------------------------------------- 'Y' — a private deal */
portfolio.tiles.Y = {
  safe: 'pass',
  create(st, ctx) {
    const rs = [ctx.draw(st), ctx.draw(st), ctx.draw(st), ctx.draw(st)]; // exactly 4 'world' draws on every Y landing, whatever is chosen
    const deal = DEALS[Math.min(DEALS.length - 1, Math.floor(rs[0] * DEALS.length))];
    return { wr: rs, deal: { ...deal }, dd: false };
  },
  describe(st, p, ev, ctx) {
    const d = p.deal; const I = privInfo(st, p, ctx);
    ev.tag = 'השקעה פרטית'; ev.title = d.n;
    ev.text = `${d.d} ${d.type === 'pe' ? `התחייבות של ${ctx.fmtM(I.size)}: הקרן תקרא לכסף ב־${PE.calls} שלבים בשנה־שנתיים הקרובות, ותחלק אחרי ${PE.distFrom}–${PE.distFrom + PE.distSpan} חודשים.` : `השקעה של ${ctx.fmtM(I.size)} עכשיו, נעולה ${STAKE.lockMin}–${STAKE.lockMin + STAKE.lockSpan} חודשים.`} מכפיל צפוי: ${I.band.lo}×–${I.band.hi}×.`;
    ev.mentor = ctx.mentorLine(st, 'privAsk', {}) || 'כמה מזה תצטרך למכור מחר בבוקר? כסף נעול לא מכסה קריאת מרווח.';
    ev.data = { private: { type: d.type, size: I.size, half: I.half, band: I.band, dd: !!p.dd, ddFee: I.ddFee, calls: d.type === 'pe' ? { n: PE.calls, each: Math.round(I.size / PE.calls), gap: [PE.gapMin, PE.gapMin + PE.gapSpan - 1] } : null,
      lock: d.type === 'stake' ? [STAKE.lockMin, STAKE.lockMin + STAKE.lockSpan - 1] : null, distFrom: d.type === 'pe' ? [PE.distFrom, PE.distFrom + PE.distSpan - 1] : null, cls: 'locked', ltv: 0,
      liquid: I.liquid, unfunded: unfunded(st), share: I.share, cashAfter: I.cashAfter, note: 'נכס נעול: אין מחיר יומי, אי אפשר ללוות כנגדו, ומכירה מוקדמת עולה 25%.' } };
    const L = (x) => st.cash >= x; const pay = (x) => (d.type === 'pe' ? 0 : x);
    ev.options = [
      ...(p.dd ? [] : [ctx.opt('dd', `בדיקת נאותות על המנהל (${ctx.fmtM(I.ddFee)}): טווח מכפיל צר`, st.cash >= I.ddFee, { kind: 'inspect', reason: st.cash >= I.ddFee ? undefined : 'אין מספיק מזומן' })]),
      ctx.opt('commit', d.type === 'pe' ? `להתחייב ל־${ctx.fmtM(I.size)}` : `להשקיע ${ctx.fmtM(I.size)}`, L(pay(I.size)), { kind: 'private', cost: { cash: pay(I.size) }, reason: L(pay(I.size)) ? undefined : 'אין מספיק מזומן' }),
      ctx.opt('half', d.type === 'pe' ? `להתחייב לחצי (${ctx.fmtM(I.half)})` : `להשקיע חצי (${ctx.fmtM(I.half)})`, L(pay(I.half)), { kind: 'private', cost: { cash: pay(I.half) }, reason: L(pay(I.half)) ? undefined : 'אין מספיק מזומן' }),
      ctx.opt('pass', 'לוותר', true),
    ];
    // the guide: commitments ≤ 15 % of net worth, the liquid classes cover the unfunded calls twice, a due diligence first, then a band whose middle beats 1.5×
    const mid = (I.band.lo + I.band.hi) / 2; const nw = Math.max(1, ctx.netWorth(st)); const lockedAfter = (classes(st).locked + unfunded(st) + I.half) / nw;
    let pick = 'pass';
    if (!p.dd && st.cash >= I.ddFee && lockedAfter <= 0.15) pick = 'dd';
    else if (p.dd && mid >= 1.5 && I.liquid >= 2 * (unfunded(st) + I.half) && lockedAfter <= 0.15) pick = (classes(st).locked + unfunded(st) + I.size) / nw <= 0.15 && L(pay(I.size)) ? 'commit' : L(pay(I.half)) ? 'half' : 'pass';
    const po = ev.options.find((o) => o.id === pick && o.enabled) || ev.options.find((o) => o.id === 'pass'); po.primary = true; ev.forcePrimary = po.id;
  },
  choose(st, p, o, params, out, ctx) {
    const d = p.deal;
    if (o.id === 'pass') { out.mentor = ctx.mentorLine(st, 'privPass', {}) || null; ctx.logDecision(st, 'השקעה פרטית', 'ויתר'); return true; }
    if (o.id === 'dd') { const I = privInfo(st, p, ctx); if (st.cash < I.ddFee) return true; st.cash -= I.ddFee; ctx.cashFx(out, -I.ddFee, `בדיקת נאותות ${ctx.fmtM(I.ddFee)}`); p.dd = true; const J = privInfo(st, p, ctx);
      out.mentor = ctx.mentorLine(st, 'privDD', { lo: String(J.band.lo), hi: String(J.band.hi) }) || `הבדיקה: מכפיל צפוי ${J.band.lo}×–${J.band.hi}×.`; ctx.logDecision(st, 'השקעה פרטית', 'בדיקת נאותות', I.ddFee); return false; }
    const op = privFromDraws(st, d, p.wr, o.id === 'half' ? 0.5 : 1, dealBand(st, ctx)); op.band = p.dd ? moicBand(d, op.moic) : moicBand(d, null);
    const pay = op.type === 'pe' ? 0 : op.cost;
    const a = ctx.buy(st, { k: op.type === 'pe' ? 'pe' : 'stake', n: d.n, cost: pay, down: pay, value: pay, cf: 0, op }, out, { label: op.type === 'pe' ? 'התחייבות לקרן' : 'אחזקה פרטית', noLoan: true });
    if (!a) { out.mentor = 'אין מספיק מזומן.'; return true; }
    ctx.lesson(st, out, 'liquidity_ladder');
    out.mentor = ctx.mentorLine(st, 'privCommit', {}) || (op.type === 'pe' ? 'התחייבת. הכסף עוד אצלך — אבל הוא כבר לא באמת שלך: הקרן תקרא לו.' : 'השקעת. הכסף נעול עד סוף התקופה.');
    ctx.logDecision(st, 'השקעה פרטית', o.id === 'half' ? 'חצי' : 'מלא', op.type === 'pe' ? op.commit : op.cost);
    return true;
  },
  score(st, ev, ctx) { const d = (ev.data || {}).private || {}; const E = Math.max(1, ctx.expenses(st)); const mid = d.band ? (d.band.lo + d.band.hi) / 2 : 1;
    return ev.options.filter((o) => o.enabled).map((o) => ({ id: o.id, U: round2(o.id === 'dd' ? 0.5 : o.id === 'commit' ? (mid - 1.3) * d.size / E / 24 : o.id === 'half' ? (mid - 1.3) * d.half / E / 24 : 0), flags: [], reasons: [] })); },
};
const dealBand = (st, ctx) => ((ctx.world(st).econ || {}).band || {}).deal || [5000000, 100000000];
function privInfo(st, p, ctx) {
  const d = p.deal; const B = dealBand(st, ctx);
  const size = r1000(B[0] + (B[1] - B[0]) * (d.size[0] + (d.size[1] - d.size[0]) * p.wr[1])); const half = r1000(size / 2);
  const moic = round2(d.moic[0] + (d.moic[1] - d.moic[0]) * p.wr[2]); const band = p.dd ? moicBand(d, moic) : moicBand(d, null);
  const C = classes(st); const liquid = st.cash + C.daily + C.monthly - PF(st).debt; const nw = Math.max(1, ctx.netWorth(st));
  return { size, half, band, ddFee: Math.max((ctx.world(st).econ || {}).ddMinFee || 250000, r1000(size * 0.004)), liquid, share: round3((C.locked + unfunded(st) + size) / nw), cashAfter: st.cash - (d.type === 'pe' ? 0 : size) };
}

/* ---------------------------------------------------------------- between-roll actions (`Z`) */
portfolio.act = {
  /** p = "b:<₪>" | "b:max" | "r:<₪>" | "r:all" — borrow on margin / repay. */
  margin(st, p, out, ctx) {
    const P = PF(st); const [s, n] = String(p || '').split(':'); const cap = capacity(st);
    if (s === 'b') { if (P.call) return fail(out, 'יש קריאת מרווח פתוחה'); const room = Math.max(0, Math.round(cap * LTV.borrowMax) - P.debt); const x = n === 'max' ? room : Math.min(room, Math.round(+n)); if (!(x >= 100000)) return fail(out, 'אין מרווח ללוות');
      P.debt += x; st.cash += x; P.borrowed = (P.borrowed || 0) + x; ctx.cashFx(out, x, '+' + ctx.fmtM(x)); out.toast = `לווית ${ctx.fmtM(x)} כנגד התיק. LTV עכשיו ${Math.round(ltvOf(st) * 100)}% · ריבית ${marginRate(st)}% בשנה.`; ctx.logDecision(st, 'מרווח', 'הלוואה', x); return true; }
    if (s === 'r') { const x = n === 'all' ? Math.min(P.debt, Math.max(0, st.cash)) : Math.min(P.debt, Math.max(0, st.cash), Math.round(+n)); if (!(x > 0)) return fail(out, 'אין מה להחזיר');
      P.debt -= x; st.cash -= x; ctx.cashFx(out, -x, '−' + ctx.fmtM(x)); if (P.call && P.debt <= capacity(st)) { P.call = null; out.news.push({ kind: 'portfolio', type: 'callCured', text: 'קריאת המרווח כוסתה.' }); }
      out.toast = `החזרת ${ctx.fmtM(x)}. ההלוואה כנגד התיק: ${ctx.fmtM(P.debt)}.`; ctx.logDecision(st, 'מרווח', 'החזר', x); return true; }
    return fail(out, 'bad_param');
  },
  /** Redeem a fund at the next payday's NAV. */
  redeem(st, p, out, ctx) { const a = findA(st, p, 'fund'); if (!a) return fail(out, 'bad_param'); const P = PF(st); if (P.freezeUntil >= st.month) return fail(out, 'הנזילות קפואה'); if (a.op.kind === 'credit' && P.gateUntil >= st.month) return fail(out, 'הקרן נעלה פדיונות'); if (P.redeemQ.some((q) => q.id === a.id)) return fail(out, 'כבר בפדיון');
    P.redeemQ.push({ id: a.id, at: st.month + 1 }); out.toast = `${a.n}: הפדיון ישולם במשכורת הבאה לפי השווי באותו יום.`; void ctx; return true; },
  /** Sell a fund now, 5 % below its NAV. */
  sellNow(st, p, out, ctx) { const a = findA(st, p, 'fund'); if (!a) return fail(out, 'bad_param'); const P = PF(st); if (P.freezeUntil >= st.month) return fail(out, 'הנזילות קפואה'); if (a.op.kind === 'credit' && P.gateUntil >= st.month) return fail(out, 'הקרן נעלה פדיונות');
    const cash = Math.round(a.value * (1 - FIRE.monthly)); st.cash += cash; removeAsset(st, a, out); P.redeemQ = P.redeemQ.filter((q) => q.id !== a.id); ctx.cashFx(out, cash, '+' + ctx.fmtM(cash)); out.toast = `מכרת את ${a.n} מיד: ${ctx.fmtM(cash)} (5% פחות מהשווי).`; return true; },
  /** Sell a private holding on the secondary market (−25 %); a PE buyer takes over the unfunded commitment. */
  secondary(st, p, out, ctx) { const a = findA(st, p, 'private'); if (!a) return fail(out, 'bad_param'); const cash = Math.round(a.value * (1 - FIRE.secondary)); st.cash += cash; removeAsset(st, a, out); ctx.cashFx(out, cash, '+' + ctx.fmtM(cash));
    out.toast = `מכרת את ${a.n} בשוק המשני: ${ctx.fmtM(cash)} (25% פחות מהשווי בדוח)${a.op.type === 'pe' ? ', והקונה לקח את ההתחייבות שנותרה' : ''}.`; ctx.logDecision(st, 'שוק משני', a.n, cash); return true; },
  /** The put overlay on the daily class: "on" | "off". */
  hedge(st, p, out) { const P = PF(st); if (p !== 'on' && p !== 'off') return fail(out, 'bad_param'); if ((p === 'on') === P.hedge) return fail(out, 'כבר כך'); P.hedge = p === 'on'; out.toast = P.hedge ? 'הגנת אופציות על המניות: עולה בערך 1% לרבעון, ומשלמת כשהמדד יורד יותר מ־5% בחודש.' : 'ההגנה בוטלה.'; return true; },
};

/** The guide's LTV target (as tuned): 65 % of the margin capacity in a calm market, 25 % in a recession or high volatility. */
export const GUIDE = Object.freeze({ ltvCalm: 0.65, ltvStress: 0.25, band: 0.1, keepMonths: 8, weight: 0.12, weightMid: 0.04, perSector: 2, trimAt: 0.15, blockAt: 0.25, blockSell: 0.1, minOrder: 500000, research: 3 });
const stressed = (st) => ['recession', 'highVol'].includes(regimeOf(st));
/** … and, once the goal is reached, the stress level too: after the exit from the race the guide de-risks (G-durable). */
export const guideLtv = (st, ctx) => (stressed(st) || (ctx && ctx.netWorth(st) >= (((ctx.world(st) || {}).goal || {}).target || Infinity)) ? GUIDE.ltvStress : GUIDE.ltvCalm);
/** The cash the guide keeps: 8 months of expenses (margin interest included) + half of the unfunded commitments. */
export const guideKeep = (st, ctx) => Math.round(Math.max(1, ctx.expenses(st)) * GUIDE.keepMonths + unfunded(st) * 0.5);
/** The guide's concrete market orders (public numbers only): research, sells (a low band, distress, over-weight, the heir's block), buys. */
function guideTrades(st, ctx) {
  const M = st.mkt; const out = []; if (!M) return out; const nw = Math.max(1, ctx.netWorth(st)); const keep = guideKeep(st, ctx);
  const fee = MKT.researchFee(st, ctx); let rk = 0;
  const live = MKT.liveCos(st).filter((c) => c.status === 'listed' && !c.merge);
  for (const c of live) if (!c.seen && rk < GUIDE.research && st.cash >= fee + keep) { rk++; out.push({ id: 'research', param: c.id, coId: c.id, label: `מחקר על ${c.name} (${ctx.fmtM(fee)})`, enabled: true, suggested: true, guide: true, cost: fee }); }
  const val = (id) => { const h = M.held[id]; return h ? Math.round(h.qty * (id === 'IDX' ? M.idx.px : M.cos[id].px) / 100) : 0; };
  for (const c of live) { const h = M.held[c.id]; if (!h) continue;
    if (M.block && M.block.coId === c.id && val(c.id) > nw * GUIDE.blockAt) { const q = Math.ceil(M.block.qty0 * GUIDE.blockSell); out.push({ id: 'trade', param: `${c.id}:s:${Math.min(q, h.qty)}`, coId: c.id, label: `למכור 10% מהבלוק של ${c.name} (פיזור)`, enabled: true, suggested: true, guide: true, preview: MKT.preview(st, c.id, 's', Math.min(q, h.qty)) }); continue; }
    if (c.seen && (c.seen.band === 'low' || (c.seen.distress || 0) >= 2)) out.push({ id: 'trade', param: `${c.id}:S:all`, coId: c.id, label: `למכור את ${c.name} (${c.seen.band === 'low' ? 'איכות נמוכה' : 'סימני מצוקה'})`, enabled: true, suggested: true, guide: true, preview: MKT.preview(st, c.id, 's', h.qty) });
    else if (val(c.id) > nw * GUIDE.trimAt) { const q = Math.ceil(h.qty * 0.25); out.push({ id: 'trade', param: `${c.id}:s:${q}`, coId: c.id, label: `לצמצם את ${c.name} (יותר מ־15% מהשווי)`, enabled: true, suggested: true, guide: true, preview: MKT.preview(st, c.id, 's', q) }); } }
  let spare = st.cash - keep; if (spare < GUIDE.minOrder || PF(st).call) return out;
  const per = {}; for (const id of Object.keys(M.held)) { const c = M.cos[id]; if (c) per[c.sector] = (per[c.sector] || 0) + 1; }
  const rank = { high: 3, mid: 1 }; // the guide buys companies its research rated high (10 % each) or mid without distress (4 %); the rest goes to the index fund
  const wOf = (c) => (c.seen.band === 'high' ? GUIDE.weight : GUIDE.weightMid);
  const picks = live.filter((c) => c.seen && rank[c.seen.band] && (c.seen.band === 'high' || !c.seen.distress) && (c.seen.distress || 0) < 2 && val(c.id) < nw * wOf(c) * 0.8).sort((a, b) => rank[b.seen.band] - rank[a.seen.band] || (a.id < b.id ? -1 : 1));
  for (const c of picks) { if (spare < GUIDE.minOrder) break; if (!M.held[c.id] && (per[c.sector] || 0) >= GUIDE.perSector) continue;
    const x = Math.min(spare * 0.5, nw * wOf(c) - val(c.id)); if (x < GUIDE.minOrder) continue;
    if (M.mandate) { let e = 0; for (const [hid, h] of Object.entries(M.held)) { const cc = M.cos[hid]; if (cc && cc.sector === c.sector) e += Math.round(h.qty * cc.px / 100); } if (e + x > M.mandate.sector * nw) continue; }
    if (!M.held[c.id]) per[c.sector] = (per[c.sector] || 0) + 1; spare -= x;
    out.push({ id: 'trade', param: `${c.id}:B:${Math.floor(x)}`, coId: c.id, label: `לקנות ${c.name} ב־${ctx.fmtM(x)} (איכות ${c.seen.band === 'high' ? 'גבוהה' : 'בינונית'})`, enabled: true, suggested: true, guide: true, preview: MKT.preview(st, c.id, 'b', MKT.qtyFor(st, c.id, x)) }); }
  if (spare >= GUIDE.minOrder) out.push({ id: 'trade', param: `IDX:B:${Math.floor(spare)}`, coId: 'IDX', label: `לקנות קרן מדד ב־${ctx.fmtM(spare)} (פיזור רחב)`, enabled: true, suggested: true, guide: true, preview: MKT.preview(st, 'IDX', 'b', MKT.qtyFor(st, 'IDX', spare)) });
  return out;
}
/** The guide's suggestions (public numbers only). */
function actionList(st, ctx) {
  const out = []; const P = PF(st); const cap = capacity(st); const ltv = ltvOf(st); const E0 = ctx.expenses(st); const reg = regimeOf(st);
  const tgt = guideLtv(st, ctx); const keep = guideKeep(st, ctx);
  const sells = guideTrades(st, ctx); out.push(...sells.filter((a) => a.id !== 'trade' || /:[sS]:/.test(a.param)));
  if (!P.call && P.debt > 0 && ltv > tgt + GUIDE.band) { const x = Math.min(P.debt, Math.max(0, st.cash - E0 * 3), Math.round(P.debt - tgt * cap)); if (x >= 100000) out.push({ id: 'margin', param: `r:${x}`, label: `להקטין את המינוף: להחזיר ${ctx.fmtM(x)}`, enabled: true, suggested: true, guide: true }); }
  if (!P.call && ltv < tgt - GUIDE.band && st.cash < keep + GUIDE.minOrder * 4) { const x = Math.round(tgt * cap - P.debt); if (x >= 1000000) out.push({ id: 'margin', param: `b:${x}`, label: `ללוות ${ctx.fmtM(x)} כנגד התיק (LTV יעד ${Math.round(tgt * 100)}%)`, enabled: true, suggested: true, guide: true, preview: { ltvAfter: round3((P.debt + x) / Math.max(1, cap)), monthly: Math.round(x * marginRate(st) / 1200) } }); }
  out.push(...sells.filter((a) => a.id === 'trade' && /:B:/.test(a.param)));
  if (P.call) out.push({ id: 'margin', param: 'r:all', label: `לכסות את קריאת המרווח: להחזיר ${ctx.fmtM(Math.min(P.debt, Math.max(0, st.cash)))}`, enabled: st.cash > 0, suggested: true, urgent: true });
  out.push({ id: 'margin', param: 'b:max', label: `ללוות כנגד התיק (עד ${ctx.fmtM(Math.max(0, Math.round(cap * LTV.borrowMax) - P.debt))} · ריבית ${marginRate(st)}%)`, enabled: !P.call && Math.round(cap * LTV.borrowMax) - P.debt >= 100000, suggested: false, preview: { ltvAfter: cap ? round3(Math.round(cap * LTV.borrowMax) / cap) : 0, monthly: Math.round(Math.max(0, Math.round(cap * LTV.borrowMax) - P.debt) * marginRate(st) / 1200) } });
  if (P.debt > 0) out.push({ id: 'margin', param: 'r:all', label: `להחזיר את ההלוואה כנגד התיק (${ctx.fmtM(P.debt)})`, enabled: st.cash > 0, suggested: false });
  out.push({ id: 'hedge', param: P.hedge ? 'off' : 'on', label: P.hedge ? 'לבטל את הגנת האופציות' : `הגנת אופציות על המניות (${ctx.fmtM(Math.round(classes(st).daily * HEDGE.cost))} בחודש)`, enabled: classes(st).daily > 0 || P.hedge,
    suggested: P.hedge ? !['recession', 'highVol'].includes(reg) : ['recession', 'highVol'].includes(reg) && classes(st).daily > 0 });
  for (const a of funds(st)) { const fr = P.freezeUntil >= st.month || (a.op.kind === 'credit' && P.gateUntil >= st.month);
    out.push({ id: 'redeem', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: לפדות במשכורת הבאה (${ctx.fmtM(a.op.nav)})`, enabled: !fr && !P.redeemQ.some((q) => q.id === a.id), suggested: (a.op.kind === 'note' && P.spread > 3.2) || (a.op.kind === 'stale') });
    out.push({ id: 'sellNow', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור עכשיו (${ctx.fmtM(Math.round(a.value * (1 - FIRE.monthly)))})`, enabled: !fr, suggested: !!P.call && ltv > 1 }); }
  for (const a of privs(st)) out.push({ id: 'secondary', param: String(a.id), assetId: 'a' + a.id, label: `${a.n}: למכור בשוק המשני (${ctx.fmtM(Math.round(a.value * (1 - FIRE.secondary)))})`, enabled: a.value > 0, suggested: false });
  return out;
}
function indicatorsOf(st, ctx) {
  const P = PF(st); const C = classes(st); const cap = capacity(st); const nw = ctx.netWorth(st); const target = ((ctx.world(st).goal || {}).target) || 0; const r = ltvRates(st);
  const M = st.mkt; const sec = {}; let eq = 0;
  if (M) for (const [id, h] of Object.entries(M.held)) { const c = M.cos[id]; const v = Math.round(h.qty * (id === 'IDX' ? M.idx.px : c ? c.px : 0) / 100); eq += v; const s = id === 'IDX' ? 'index' : c ? c.sector : 'other'; sec[s] = (sec[s] || 0) + v; }
  const fundsV = funds(st).map((a) => ({ assetId: 'a' + a.id, name: a.n, kind: a.op.kind, value: a.value, nav: a.op.kind === 'stale' ? null : a.op.nav, cost: a.op.cost0, cf: Math.round(a.op.nav * a.op.yld / 12), yieldPct: round2(a.op.yld * 100), dur: a.op.dur, beq: a.op.beq, bcr: a.op.bcr, bpr: a.op.bpr, frozen: P.freezeUntil >= st.month || (a.op.kind === 'credit' && P.gateUntil >= st.month), redeeming: P.redeemQ.some((q) => q.id === a.id), defaulted: !!a.op.dflt, stale: a.op.kind === 'stale', markAt: a.op.markAt || null }));
  const privV = privs(st).map((a) => { const o = a.op; return { assetId: 'a' + a.id, name: a.n, type: o.type, value: a.value, commit: o.commit || null, called: o.called || null, unfunded: o.type === 'pe' ? o.commit - o.called : 0, cost: o.cost || null, band: o.band, lockUntil: o.lockUntil || null,
    nextCall: o.type === 'pe' && o.called < o.commit ? 'בחודשים הקרובים' : null, distFrom: o.type === 'pe' ? null : null, paidOut: o.paidOut || 0, mark: o.mark, markAt: o.markAt }; });
  const ladder = [{ id: 'cash', label: 'מזומן', days: 0, value: st.cash + (st.savings || 0) }, { id: 'daily', label: 'מניות וקרן מדד (יום)', days: 2, value: C.daily }, { id: 'monthly', label: 'קרנות (חודש)', days: 30, value: C.monthly }, { id: 'locked', label: 'פרטי (נעול)', days: 540, value: C.locked }];
  return {
    portfolio: { nw, target, cash: st.cash, classes: C, capacity: cap, debt: P.debt, ltv: ltvOf(st), ltvRates: r, marginRate: marginRate(st), interest: marginInterest(st), call: P.call ? { ...P.call } : null, calls: P.calls, forced: P.forcedEvents, forcedValue: P.forcedValue,
      hedge: P.hedge, hedgePaid: P.hedgePaid, hedgeGot: P.hedgeGot, rate: P.rate, rateAvg: P.rateAvg, spread: P.spread, prop: P.prop, freezeUntil: P.freezeUntil, gateUntil: P.gateUntil, flash: P.flash ? { back: P.flash.back } : null,
      funds: fundsV, privates: privV, unfunded: unfunded(st), callsPaid: P.callsPaid, distGot: P.distGot, ladder, exposure: { sectors: sec, equity: eq, classes: { daily: C.daily, monthly: C.monthly, locked: C.locked } }, peak: P.peak, maxDD: P.maxDD },
    panel: { id: 'market', title: 'הבורסה והתיק',
      gauges: [{ id: 'nw', label: 'שווי נקי מול היעד', value: nw, ref: target, unit: '₪' }, { id: 'ltv', label: 'מינוף: הלוואה מול בטוחות (LTV)', value: ltvOf(st), min: 0, max: LTV.hard, ref: 1 },
        { id: 'liquid', label: 'נזיל תוך יומיים מול ההתחייבויות', value: st.cash + C.daily, ref: P.debt + unfunded(st), unit: '₪' }],
      ladder, actions: [...MKT.market.actions(st, ctx), ...actionList(st, ctx)] },
  };
}
export default portfolio;
