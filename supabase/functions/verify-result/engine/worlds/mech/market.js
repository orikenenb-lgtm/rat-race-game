// World mechanic `market` — a stock market of fictional companies (CATALOG-25 §3; built first, for w10 מרכז הפיננסים; later w15, w16, w17,
// w19, w20, w21, w23, w24, w25 and ∞ reuse it). The state lives in st.mkt (not st.world) so several modules can read it.
//
// Contract (DESIGN §4.2 + CATALOG §3.8): pure and deterministic; NO engine import (helpers arrive in ctx); only + − × ÷ and Math.round /
// min / max / floor / abs. Draws come ONLY from the lazy stream `exch` (js/rng.js LAZY_STREAMS, index 16) with FIXED counts: at init
// 1 + 3 × slots (the first regime; per slot: the pool pick, the sealed quality, the listing jitter), every payday 1 + K + 8 + slots × K
// + 2 × 3 + 2 = 69 for 12 slots (regime · index sub-steps · one per sector · idiosyncratic per slot and sub-step · 2 event slots × 3 · 2
// relisting) — empty slots, halted and bankrupt companies still consume theirs. News text comes from the `content` stream (js/systems/
// content.js, pool `news` / `rumor`): exactly NEWS_PICKS × 2 draws every payday, so text variety never moves a price.
//
// Fairness (I7, M-target): an event's company is picked from the payday process with weights that read the companies only — never a
// player's holdings. Identity (I8, M-id): holdings, claims and closed trades key on the company id (`c<n>`, never reused, never a slot or a
// ticker); a bankrupt company keeps its history (claims, closed, grave); a relisted slot gets a NEW id and a pool entry not yet used this game.
// Candles (§3.4, M-candle): one per game month, built ONLY from prints that happened (payday sub-steps, event jumps, card shocks, trade
// fills): l ≤ min(o, c) ≤ max(o, c) ≤ h, ≥ 1 agora while listed, integers, the open candle's c is the trading price, rings bounded.
// Prices are integer agorot (₪ = px / 100); money is integer ₪.
import { COMPANIES, SECTORS, SECTOR_IDS } from '../data/companies.js';
import { tradeCost, capitalGainsTax, INVEST } from '../../finance/invest.js';
import { select as contentSelect } from '../../systems/content.js';

export const ID = 'market';
export const K = 4; // sub-steps ("weeks") per payday
export const SLOTS = 12;
export const EVENT_SLOTS = 2;
export const NEWS_PICKS = 4; // content picks per payday: 2 event slots, the regime line, a rumour (2 draws each, always)
export const RING = Object.freeze({ cand: 36, idx: 60, ev: 12, news: 24, closed: 24, grave: 12, graveCand: 12 });
export const drawsFor = (slots = SLOTS) => Object.freeze({ init: 1 + 3 * slots, month: 1 + K + SECTOR_IDS.length + slots * K + EVENT_SLOTS * 3 + 2 });
export const DRAWS = drawsFor(SLOTS); // {init: 37, month: 69}

/** Regimes (§3.3, TUNE): monthly index drift / σ, event rate per slot, minimum months, exit probability, next-regime weights. */
export const REGIMES = Object.freeze({
  growth: Object.freeze({ label: 'צמיחה', mu: 0.010, sigma: 0.030, p: 0.55, min: 6, exit: 0.12, next: { bubble: 25, highVol: 25, recession: 30, sectorCrisis: 20 } }),
  bubble: Object.freeze({ label: 'בועה', mu: 0.020, sigma: 0.035, p: 0.60, min: 3, exit: 0.25, next: { recession: 50, highVol: 30, sectorCrisis: 20 }, tilt: 0.03 }),
  recession: Object.freeze({ label: 'מיתון', mu: -0.016, sigma: 0.045, p: 0.65, min: 4, exit: 0.20, next: { recovery: 70, highVol: 30 } }),
  recovery: Object.freeze({ label: 'התאוששות', mu: 0.018, sigma: 0.035, p: 0.55, min: 4, exit: 0.18, next: { growth: 70, highVol: 15, recession: 15 } }),
  highVol: Object.freeze({ label: 'תנודתיות גבוהה', mu: 0.0, sigma: 0.070, p: 0.80, min: 2, exit: 0.30, next: { growth: 30, recession: 30, recovery: 40 } }),
  sectorCrisis: Object.freeze({ label: 'משבר בענף', mu: -0.003, sigma: 0.040, p: 0.75, min: 3, exit: 0.25, next: { recovery: 50, growth: 30, recession: 20 }, tilt: -0.04 }),
});
export const REGIME_IDS = Object.freeze(Object.keys(REGIMES));
/** Market crashes (the fat tail, TUNE): a crash month's probability by regime and its index jump in the first sub-step. Decided from the
 *  regime draw's own fraction (no extra draw), so the count per payday stays 69. */
export const CRASH = Object.freeze({ p: Object.freeze({ growth: 0.008, bubble: 0.06, recession: 0.05, recovery: 0.01, highVol: 0.08, sectorCrisis: 0.02 }), jump: Object.freeze([-0.22, -0.1]) });
const REGIME0 = Object.freeze({ growth: 50, recovery: 20, highVol: 10, recession: 20 });
/** Company events (§3.5, TUNE): weight per regime, jump range, distress change, negative? */
export const EVENTS = Object.freeze({
  revUp: Object.freeze({ label: 'הכנסות עלו', w: { growth: 30, recession: 10, highVol: 15, bubble: 30, recovery: 30, sectorCrisis: 8 }, jump: [0.04, 0.12], dist: -1, neg: false }),
  revDown: Object.freeze({ label: 'הכנסות ירדו', w: { growth: 12, recession: 30, highVol: 20, bubble: 8, recovery: 15, sectorCrisis: 25 }, jump: [-0.15, -0.05], dist: 1, neg: true }),
  launch: Object.freeze({ label: 'השקת מוצר', w: { growth: 18, recession: 6, highVol: 12, bubble: 25, recovery: 15, sectorCrisis: 5 }, jump: [0.08, 0.25], dist: 0, neg: false }),
  lostClient: Object.freeze({ label: 'לקוח גדול עזב', w: { growth: 10, recession: 18, highVol: 15, bubble: 6, recovery: 10, sectorCrisis: 18 }, jump: [-0.20, -0.08], dist: 1, neg: true }),
  debt: Object.freeze({ label: 'אזהרת אשראי', w: { growth: 10, recession: 16, highVol: 14, bubble: 12, recovery: 10, sectorCrisis: 16 }, jump: [-0.08, -0.03], dist: 1, neg: true }),
  merger: Object.freeze({ label: 'הצעת רכישה', w: { growth: 12, recession: 6, highVol: 8, bubble: 15, recovery: 14, sectorCrisis: 6 }, jump: [0.20, 0.35], dist: 0, neg: false }),
  fraud: Object.freeze({ label: 'חשד להונאה', w: { growth: 2, recession: 5, highVol: 6, bubble: 6, recovery: 2, sectorCrisis: 6 }, jump: [-0.70, -0.40], dist: 1, neg: true }),
});
export const EVENT_IDS = Object.freeze(Object.keys(EVENTS));
/** Trading (§3.7): half-spread by size, commission (invest.js: 0.1 %, min ₪5), tax 25 % (invest.js, loss carry), dividends quarterly. */
export const SPREAD = Object.freeze({ large: 0.0005, mid: 0.0015, small: 0.004, highVol: 2, crisis: 3 });
export const BK = Object.freeze({ distress: 4, recovMax: 0.08, claimMonths: 3, relistAfter: 6, fraudBk: 0.5, fraudWindow: 3, haltMonths: 1, calm: 12 });
const DRIFT = Object.freeze({ q: 0.03, q0: 0.45, distress: 0.001, sector: 0.02 }); // monthly alpha per (q − q0); drag per distress point (per sub-step); sector noise σ
const IDX0 = 10000; // the index starts at ₪100.00 (agorot)
export const RESEARCH_FEE = 250000;
export const TRADE_MIN = 10000; // ₪: the smallest order the panel offers

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const frac = (x) => x - Math.floor(x);
const round3 = (x) => Math.round(x * 1000) / 1000;
const round4 = (x) => Math.round(x * 10000) / 10000;
const z = (u) => (u - 0.5) * 3.4641; // unit variance, bounded ±1.73 (fat tails come from events, not from z)
const MK = (st) => st.mkt;
const isLive = (c) => c && (c.status === 'listed' || c.status === 'halted');
const ils = (qty, px) => Math.round(qty * px / 100);
const wpick = (pairs, u) => { let tot = 0; for (const [, w] of pairs) tot += w; let r = u * tot; for (const [k, w] of pairs) { r -= w; if (r < 0) return k; } return pairs[pairs.length - 1][0]; };
const ring = (arr, x, n) => { arr.push(x); while (arr.length > n) arr.shift(); };
/** The world's market declaration (w.market = {slots, sectors:{id: n}, …}) — only when it is an object (w1–w9 use `market` as a card deck). */
export const cfgOf = (w) => (w && w.marketCfg) || { slots: SLOTS, sectors: 'all' };

/* ---------------------------------------------------------------- slots and listing */
/** The fixed sector of each slot: the world's mix in sector order (or round-robin over all sectors). */
export function slotSectors(cfg) {
  const n = cfg.slots || SLOTS; const out = [];
  if (cfg.sectors && cfg.sectors !== 'all') { for (const s of SECTOR_IDS) for (let i = 0; i < (cfg.sectors[s] || 0); i++) out.push(s); }
  let k = 0; while (out.length < n) out.push(SECTOR_IDS[k++ % SECTOR_IDS.length]);
  return out.slice(0, n);
}
/** List one company from the pool into `slot` (3 values: pick, q, jitter). → the company record, or null when the sector is exhausted. */
function listFrom(st, slot, sector, u1, u2, u3) {
  const M = MK(st); const pool = (M.poolKeys ? COMPANIES.filter((c) => M.poolKeys.includes(c.key)) : COMPANIES).filter((c) => c.sector === sector && !M.usedKeys.includes(c.key));
  if (!pool.length) return null;
  const e = pool[Math.min(pool.length - 1, Math.floor(u1 * pool.length))];
  const q = round3(e.q[0] + (e.q[1] - e.q[0]) * u2);
  const j = (k) => frac(u3 * k);
  const px = Math.max(100, Math.round((e.px[0] + (e.px[1] - e.px[0]) * j(1)) * 100));
  const id = 'c' + M.nextId++; M.usedKeys.push(e.key);
  const co = { id, key: e.key, name: e.name, tk: e.tk, sector: e.sector, size: e.size, debt: e.debt, slot,
    beta: round3(e.beta[0] + (e.beta[1] - e.beta[0]) * j(7919)), vol: round4(e.vol[0] + (e.vol[1] - e.vol[0]) * j(613)), div: round4(e.div[0] + (e.div[1] - e.div[0]) * j(977)),
    q, recov: round4(BK.recovMax * q * j(104729)), distress: 0, status: 'listed', listedM: st.month, endedM: null, endPx: null, peakPx: px, px, px0: px,
    open: { o: px, h: px, l: px, c: px, n: 0, v: 0 }, cand: [], ev: [], lastEv: {}, lastNeg: st.month, halt: 0, merge: null, fraudBk: null, fraudDone: false, seen: null };
  M.cos[id] = co; M.slots[slot] = id;
  return co;
}

/* ---------------------------------------------------------------- prints and candles */
/** One price print on the open candle (every price that really existed this month). */
function print(c, px, vol = 0) { const O = c.open; c.px = px; O.h = Math.max(O.h, px); O.l = Math.min(O.l, px); O.c = px; O.n++; O.v += vol; if (px > c.peakPx) c.peakPx = px; }
/** Close the month's candle: push it (ring) and open the next one at the close. */
function closeCandle(c, m, n) { const O = c.open; ring(c.cand, [m, O.o, O.h, O.l, O.c, O.n, O.v], n); c.open = { o: O.c, h: O.c, l: O.c, c: O.c, n: 0, v: 0 }; }
/** A card or module price shock (a print, decision-independent): the index by `idx`, each live company by β × idx + its sector's move. */
export function shock(st, o = {}) {
  const M = MK(st); if (!M) return;
  const ix = o.idx || 0; const I = M.idx;
  if (ix) { const p = Math.max(1, Math.round(I.px * (1 + ix))); I.px = p; I.open.h = Math.max(I.open.h, p); I.open.l = Math.min(I.open.l, p); I.open.c = p; I.open.n++; }
  for (const id of M.slots) { const c = id && M.cos[id]; if (!c || c.status !== 'listed') continue;
    const r = clamp(c.beta * ix + ((o.sectors || {})[c.sector] || 0), -0.6, 0.6); if (!r) continue;
    let p = Math.max(1, Math.round(c.px * (1 + r))); if (p === 1) c.distress++; print(c, p); }
}

/* ---------------------------------------------------------------- the payday step */
function regimeStep(st, u, out, news) {
  const M = MK(st); const R = M.regime; const T = REGIMES[R.id];
  if (R.minLeft > 0) { R.minLeft--; return false; }
  if (u >= T.exit) return false;
  const v = u / T.exit; // uniform in [0, 1) given the exit: the next regime (first part) and its sector (the same value, rescaled)
  let next = wpick(Object.entries(T.next), v);
  const old = R.id; let sector = null;
  if (next === 'bubble' || next === 'sectorCrisis') {
    const mix = {}; for (const id of M.slots) { const c = id && M.cos[id]; if (c) mix[c.sector] = (mix[c.sector] || 0) + 1; }
    const pairs = SECTOR_IDS.filter((s) => mix[s]).map((s) => [s, mix[s]]);
    sector = next === 'sectorCrisis' && R.id === 'bubble' && R.sector ? R.sector : pairs.length ? wpick(pairs, frac(v * 977)) : null;
    if (!sector) next = 'highVol';
  }
  M.regime = { id: next, sector, since: st.month, minLeft: REGIMES[next].min - 1 };
  M.regimes.push([st.month, next]); while (M.regimes.length > RING.news) M.regimes.shift();
  news.push({ type: 'regime', co: null, vars: { regime: REGIMES[next].label + (sector ? ' · ' + SECTORS[sector] : ''), sector: sector ? SECTORS[sector] : '' }, from: old });
  void out; return true;
}
function eligibleFor(M, type, regime) {
  const T = EVENTS[type]; const out = [];
  for (const id of M.slots) {
    const c = id && M.cos[id]; if (!c || c.status !== 'listed' || c.merge) continue;
    if (c.lastEv[type] != null && M.month - c.lastEv[type] < 12) continue; // the same type on the same company within 12 months: excluded
    if (type === 'fraud' && (c.q >= 0.35 || c.fraudDone)) continue; // fraud: only companies with q < 0.35, at most once each
    let w = 10;
    if (T.neg) w *= (1 + c.distress) * (1.5 - c.q); else w *= 0.5 + c.q; // quality tilts who gets good and bad news (TUNE)
    if (type === 'fraud') w *= 1.5 - c.q;
    if (type === 'launch' && (c.sector === 'tech' || c.sector === 'health')) w *= 1.4;
    if (type === 'debt' && c.sector === 'fin') w *= 0.5;
    if (T.neg && regime.id === 'sectorCrisis' && c.sector === regime.sector) w *= 3;
    const last = Math.max(-99, ...Object.values(c.lastEv)); if (M.month - last < 2) w *= 0.3;
    out.push([c.id, Math.round(w * 100)]);
  }
  return out;
}
function applyEvent(st, c, type, uMag, uFol, out, news) {
  const M = MK(st); const T = EVENTS[type];
  const pct = round3(T.jump[0] + (T.jump[1] - T.jump[0]) * uMag);
  const px = Math.max(1, Math.round(c.px * (1 + pct))); print(c, px);
  c.distress = Math.max(0, c.distress + T.dist); if (T.neg) c.lastNeg = st.month;
  c.lastEv[type] = st.month; ring(c.ev, [st.month, type, pct], RING.ev);
  M.stats.events[type] = (M.stats.events[type] || 0) + 1; M.stats.bySlot[c.slot] = (M.stats.bySlot[c.slot] || 0) + (type === 'fraud' ? 1 : 0);
  if (type === 'merger') c.merge = { at: st.month + 1, px };
  if (type === 'fraud') { c.fraudDone = true; c.halt = st.month + BK.haltMonths; c.status = 'halted'; // the follow-up is SEALED now (uFol)
    c.fraudBk = uFol < BK.fraudBk ? st.month + 1 + Math.floor(frac(uFol * 613) * BK.fraudWindow) : null; M.stats.fraudKeys[c.key] = (M.stats.fraudKeys[c.key] || 0) + 1; }
  news.push({ type, co: c.id, vars: { co: c.name, tk: c.tk, sector: SECTORS[c.sector], pct: (pct > 0 ? '+' : '−') + Math.round(Math.abs(pct) * 100) + '%' } });
  void out;
}
/** Bankruptcy (§3.5): status, the price to its sealed recovery, every holding into a claim paid at +3 months; the loss is booked now. */
function bankrupt(st, c, why, out, ctx, news) {
  const M = MK(st); const recPx = Math.max(1, Math.round(c.px * c.recov)); print(c, recPx);
  c.status = 'bankrupt'; c.endedM = st.month; c.endPx = recPx; c.halt = 0; c.merge = null; c.why = why; M.stats.bankrupt++;
  const h = M.held[c.id];
  if (h && h.qty > 0) {
    const proceeds = ils(h.qty, recPx); const pnl = proceeds - h.basis;
    M.claims.push({ coId: c.id, qty: h.qty, px: recPx, payM: st.month + BK.claimMonths, amount: proceeds });
    lossCarry(st, h.basis, proceeds);
    ring(M.closed, { coId: c.id, name: c.name, qty: h.qty, basis: h.basis, proceeds, pnl, fees: h.fees, divs: h.divs, reason: 'bankrupt', m: st.month }, RING.closed);
    M.realized += pnl; delete M.held[c.id];
    if (ctx) ctx.lesson(st, out, 'mkt_bankrupt');
  }
  news.push({ type: 'bankrupt', co: c.id, vars: { co: c.name, tk: c.tk, sector: SECTORS[c.sector], pct: '' }, fixed: `${c.name} (${c.tk}) פשטה רגל. בעלי המניות יקבלו בעוד ${BK.claimMonths} חודשים ${fmtPx(recPx)} למניה.` });
}
function lossCarry(st, cost, proceeds) { if (!st.life) return 0; const r = capitalGainsTax({ cost, proceeds, mode: 'nominal', lossCarry: st.life.lossCarry || 0 }); st.life.lossCarry = r.lossCarryOut; return r.tax; }
function toGrave(st, c) {
  const M = MK(st); ring(M.grave, { id: c.id, key: c.key, name: c.name, tk: c.tk, sector: c.sector, peakPx: c.peakPx, endPx: c.endPx, endedM: c.endedM, reason: c.status, cand: c.cand.slice(-RING.graveCand) }, RING.grave);
  if (M.slots[c.slot] === c.id) { M.slots[c.slot] = null; M.freed[c.slot] = c.endedM; }
  delete M.cos[c.id];
}
export const fmtPx = (px) => '₪' + (px / 100).toFixed(2).replace(/\.00$/, '');

/* ---------------------------------------------------------------- news text (content stream: exactly 2 draws per pick) */
function newsText(st, ctx, item, type) {
  const w = ctx.world(st); const spec = w.content; const has = st.rng && st.rng.content != null && spec && spec.data && spec.data.news;
  const draw = () => ctx.drawX(st, 'content');
  if (!has) return item ? item.fixed || defaultNews(item) : null;
  if (!item) { draw(); draw(); return null; } // an empty pick still consumes its 2 draws
  if (item.fixed) { draw(); draw(); return item.fixed; }
  const inst = contentSelect(st, spec, 'news', { worldId: st.worldId, tags: [type], regime: MK(st).regime.id }, draw, { ctx: item.vars });
  return inst ? inst.text.n : defaultNews(item);
}
function defaultNews(it) { const v = it.vars || {}; return it.type === 'regime' ? `מצב השוק: ${v.regime}.` : `${v.co || 'השוק'}: ${(EVENTS[it.type] || {}).label || it.type} ${v.pct || ''}`.trim(); }
function rumorPick(st, ctx) {
  const w = ctx.world(st); const spec = w.content; const M = MK(st);
  if (!(st.rng && st.rng.content != null && spec && spec.data && spec.data.rumor)) return null;
  const draw = () => ctx.drawX(st, 'content');
  if (M.regime.id !== 'highVol' && M.regime.id !== 'bubble') { draw(); draw(); return null; }
  const live = M.slots.map((id) => id && M.cos[id]).filter((c) => c && c.status === 'listed');
  const rs = [draw(), draw()]; if (!live.length) return null; // the rumour's company and text come from these 2 content draws only (noise)
  const c = live[Math.min(live.length - 1, Math.floor(rs[1] * live.length))];
  const es = spec.data.rumor; const e = es[Math.min(es.length - 1, Math.floor(rs[0] * es.length))];
  return { m: st.month, coId: c.id, type: 'rumor', text: String(e.text.n).replace(/\{co\}/g, c.name).replace(/\{tk\}/g, c.tk).replace(/\{sector\}/g, SECTORS[c.sector]), poolId: e.id };
}

/** One payday of the market (69 `exch` draws + 8 `content` draws, always). */
export function marketMonth(st, out, ctx) {
  const M = MK(st); M.month = st.month; const cfg = M.cfg; const nS = cfg.slots;
  const D = drawsFor(nS); const rs = []; for (let i = 0; i < D.month; i++) rs.push(ctx.drawX(st, 'exch'));
  let k = 0; const take = () => rs[k++];
  const news = [];
  // 1. the regime (1 draw; its fraction also decides a crash month — the regime the month starts in)
  const uR = take(); const crashU = frac(uR * 104729); const crashR = M.regime.id;
  regimeStep(st, uR, out, news);
  const R = M.regime; const T = REGIMES[R.id];
  const crash = crashU < (CRASH.p[crashR] || 0) ? round3(CRASH.jump[0] + (CRASH.jump[1] - CRASH.jump[0]) * frac(uR * 7919)) : 0;
  if (crash) { M.stats.crashes = (M.stats.crashes || 0) + 1; news.push({ type: 'crash', co: null, vars: {}, fixed: `קריסה בבורסה: המדד צנח ${Math.round(-crash * 100)}% בתוך שבוע. מי שקנה במינוף — מרגיש את זה עכשיו.` }); }
  // 2. mergers announced last month complete at their deal price: holders cash out, the id retires
  for (const id of M.slots) { const c = id && M.cos[id]; if (!c || !c.merge || c.merge.at > st.month || c.status !== 'listed') continue;
    print(c, c.merge.px); c.status = 'merged'; c.endedM = st.month; c.endPx = c.merge.px; settleMerged(st, c, out, ctx);
    news.push({ type: 'merged', co: c.id, vars: { co: c.name, tk: c.tk }, fixed: `הרכישה של ${c.name} הושלמה ב־${fmtPx(c.merge.px)} למניה. בעלי המניות קיבלו מזומן, והמניה ירדה מהמסחר.` }); }
  // 3. the price path: K index sub-steps (K draws), one sector move per sector (8 draws), slot × K idiosyncratic draws
  const zi = []; for (let i = 0; i < K; i++) zi.push(z(take()));
  const sec = {}; for (const s of SECTOR_IDS) { const tilt = R.sector === s ? (T.tilt || 0) : 0; sec[s] = tilt / K + DRIFT.sector * z(take()) / K; }
  const zc = []; for (let s = 0; s < nS; s++) { const row = []; for (let i = 0; i < K; i++) row.push(z(take())); zc.push(row); }
  const I = M.idx; const m0 = I.px;
  for (let i = 0; i < K; i++) {
    const prev = I.px; const p = Math.max(1, Math.round(prev * (1 + (T.mu + (cfg.muAdd || 0)) / K + T.sigma / 2 * zi[i] + (i === 0 ? crash : 0))));
    I.px = p; I.open.h = Math.max(I.open.h, p); I.open.l = Math.min(I.open.l, p); I.open.c = p; I.open.n++;
    const ir = p / prev - 1;
    for (let s = 0; s < nS; s++) {
      const c = M.slots[s] && M.cos[M.slots[s]]; if (!c || c.status !== 'listed') continue;
      const r = clamp(c.beta * ir + sec[c.sector] + c.vol / 2 * zc[s][i] + DRIFT.q * (c.q - DRIFT.q0) / K - DRIFT.distress * c.distress, -0.35, 0.35);
      let px = Math.max(1, Math.round(c.px * (1 + r))); if (px === 1 && c.px > 1) c.distress++;
      print(c, px);
    }
  }
  M.idxRet = round4(I.px / m0 - 1);
  // 4. company events: 2 slots × 3 draws (fire · type · company), always consumed
  const RS = M.stats.reg[R.id] || (M.stats.reg[R.id] = [0, 0, ...EVENT_IDS.map(() => 0)]); // [slots, fired, per type] — M-freq (bounded: 6 × 9)
  for (let e = 0; e < EVENT_SLOTS; e++) {
    const u1 = take(), u2 = take(), u3 = take(); RS[0]++;
    if (u1 >= T.p) { news.push(null); continue; }
    const type = wpick(EVENT_IDS.map((t) => [t, EVENTS[t].w[R.id]]), u2); RS[1]++; RS[2 + EVENT_IDS.indexOf(type)]++;
    const el = eligibleFor(M, type, R);
    if (!el.length) { M.stats.fallback++; news.push({ type: 'sector', co: null, vars: { sector: R.sector ? SECTORS[R.sector] : 'השוק' }, fixed: `${R.sector ? 'בענף ' + SECTORS[R.sector] : 'בשוק'}: ${EVENTS[type].label} אצל חברות שאינן רשומות כאן.` }); continue; }
    const c = M.cos[wpick(el, u3)]; applyEvent(st, c, type, frac(u2 * 7919), u1 / T.p, out, news);
  }
  // 5. bankruptcies: distress ≥ 4, or a fraud's sealed follow-up; halts end
  for (const id of M.slots) { const c = id && M.cos[id]; if (!c) continue;
    if (c.status === 'halted' && st.month >= c.halt) c.status = 'listed'; // a halt lasts until the next payday
    if (isLive(c) && (c.distress >= BK.distress || (c.fraudBk != null && c.fraudBk <= st.month))) bankrupt(st, c, c.fraudBk != null && c.fraudBk <= st.month ? 'fraud' : 'distress', out, ctx, news);
    else if (c.status === 'listed' && c.distress > 0 && st.month - c.lastNeg >= BK.calm) { c.distress--; c.lastNeg = st.month; } }
  // 6. claims pay at +3 months; a bankrupt company leaves for the grave once its claims are paid (its slot frees)
  for (const cl of M.claims.slice()) if (cl.payM <= st.month) { st.cash += cl.amount; M.claims.splice(M.claims.indexOf(cl), 1); if (cl.amount) ctx.cashFx(out, cl.amount, `תשלום לנושים של ${(M.cos[cl.coId] || {}).name || ''} ${ctx.fmtM(cl.amount)}`); }
  for (const id of M.slots) { const c = id && M.cos[id]; if (!c) continue;
    if (c.status === 'bankrupt' && st.month - c.endedM >= BK.claimMonths && !M.claims.some((x) => x.coId === c.id)) toGrave(st, c); // its last candle closed at the recovery price
    else if (c.status === 'merged') { closeCandle(c, st.month, RING.cand); toGrave(st, c); } }
  // 7. relisting: 2 draws — the first empty slot freed ≥ 6 months ago gets a new company (a NEW id; a pool entry not used this game)
  { const u1 = take(), u2 = take(); const s = M.slots.findIndex((id, i) => id == null && M.freed[i] != null && st.month - M.freed[i] >= BK.relistAfter);
    if (s >= 0) { const sector = M.sec[s]; const c = listFrom(st, s, sector, u1, frac(u2 * 7919), u2);
      if (c) { delete M.freed[s]; M.stats.relisted++; news.push({ type: 'listing', co: c.id, vars: { co: c.name, tk: c.tk }, fixed: `הנפקה חדשה: ${c.name} (${c.tk}) נכנסת למסחר ב־${fmtPx(c.px)}. חברה חדשה — עם היסטוריה משלה.` }); }
      else M.freed[s] = -999; } }
  if (k !== D.month) throw new Error('market: draw count ' + k);
  // 8. dividends, quarterly at the company's yield, 25 % withheld (cash, through the payday's cash effect)
  if ((st.stats.paydays || 0) % 3 === 0) { let tot = 0;
    for (const [id, h] of Object.entries(M.held)) { const c = id === 'IDX' ? null : M.cos[id]; const yld = id === 'IDX' ? M.idxDiv : (c && c.status === 'listed' ? c.div : 0); if (!yld || h.qty <= 0) continue;
      const px = id === 'IDX' ? I.px : c.px; const gross = Math.round(ils(h.qty, px) * yld / 4); const net = Math.round(gross * (1 - INVEST.dividendTax)); h.divs += net; tot += net; }
    if (tot > 0) { st.cash += tot; M.divs += tot; ctx.cashFx(out, tot, `דיבידנדים ${ctx.fmtM(tot)}`); } }
  // 9. close every month candle (live companies and the index)
  for (const id of M.slots) { const c = id && M.cos[id]; if (c && (isLive(c) || c.status === 'bankrupt')) { if (c.status !== 'bankrupt' || c.endedM === st.month) closeCandle(c, st.month, RING.cand); } }
  ring(I.cand, [st.month, I.open.o, I.open.h, I.open.l, I.open.c, I.open.n, I.open.v], RING.idx); I.open = { o: I.px, h: I.px, l: I.px, c: I.px, n: 0, v: 0 };
  // 10. news: exactly NEWS_PICKS content picks (regime line, 2 event slots, a rumour) + fixed lines (no draws)
  const picks = []; const reg = news.find((x) => x && x.type === 'regime'); picks.push(reg || null);
  const evs = news.filter((x) => x === null || (x && EVENTS[x.type])); for (let e = 0; e < EVENT_SLOTS; e++) picks.push(evs[e] || null);
  for (let i = 0; i < NEWS_PICKS - 1; i++) { const it = picks[i]; const t = newsText(st, ctx, it, it ? it.type : null); if (t) pushNews(st, out, { m: st.month, coId: it.co, type: it.type, text: t }); }
  const ru = rumorPick(st, ctx); if (ru) pushNews(st, out, ru);
  for (const it of news) if (it && !picks.includes(it) && !(it && EVENTS[it.type])) pushNews(st, out, { m: st.month, coId: it.co, type: it.type, text: it.fixed || defaultNews(it) });
  if (reg && reg.from !== R.id && ctx.fireTrigger) ctx.fireTrigger(st, 'regime:' + R.id);
}
function pushNews(st, out, n) { ring(MK(st).news, n, RING.news); out.news.push({ kind: 'market', text: n.text, coId: n.coId || null, type: n.type, rumor: n.type === 'rumor' }); }
function settleMerged(st, c, out, ctx) {
  const M = MK(st); const h = M.held[c.id]; if (!h || h.qty <= 0) return;
  const gross = ils(h.qty, c.endPx); const tax = sellTax(st, h.basis, gross); const net = gross - tax;
  st.cash += net; M.realized += gross - h.basis; M.taxPaid += tax;
  ring(M.closed, { coId: c.id, name: c.name, qty: h.qty, basis: h.basis, proceeds: gross, tax, pnl: gross - h.basis, fees: h.fees, divs: h.divs, reason: 'merged', m: st.month }, RING.closed);
  delete M.held[c.id]; ctx.cashFx(out, net, `${c.name} נרכשה: ${ctx.fmtM(net)} אחרי מס`);
}
function sellTax(st, cost, proceeds) { if (!st.life) return 0; const r = capitalGainsTax({ cost, proceeds, mode: 'nominal', lossCarry: st.life.lossCarry || 0 }); st.life.lossCarry = r.lossCarryOut; return r.tax; }

/* ---------------------------------------------------------------- trading */
/** The half-spread of an instrument now (× the world's / character's fee multiplier). */
export function halfSpread(st, id) {
  const M = MK(st); const c = id === 'IDX' ? { size: 'large', sector: null } : M.cos[id]; if (!c) return 0;
  let hs = SPREAD[c.size] || SPREAD.mid;
  if (M.regime.id === 'highVol') hs *= SPREAD.highVol;
  if (M.regime.id === 'sectorCrisis' && c.sector === M.regime.sector) hs *= SPREAD.crisis;
  return round4(hs * (M.feeMult ? M.feeMult.spread : 1));
}
const pxOf = (M, id) => (id === 'IDX' ? M.idx.px : (M.cos[id] || {}).px);
const commOf = (st, amount) => { const M = MK(st); const c = tradeCost({ amount: Math.abs(amount) }).commission; return Math.max(amount ? 5 : 0, Math.round(c * (M.feeMult ? M.feeMult.comm : 1))); };
/** Can `id` be traded now? → null or the reason. */
export function tradeBlock(st, id) {
  const M = MK(st); if (id === 'IDX') return null; const c = M.cos[id];
  if (!c) return 'אין חברה כזו'; if (c.status === 'halted') return 'המסחר במניה מושהה'; if (c.status === 'bankrupt') return 'החברה פשטה רגל — רק תביעת נושים'; if (c.status !== 'listed') return 'המניה כבר לא נסחרת';
  return null;
}
/**
 * The preview of an order (I1: shown before the tap): qty, mid, fill, spread cost, commission, total cash, the position after, and the
 * cash a sale of the whole position would leave after tax now. side 'b' | 's'; qty in shares.
 */
export function preview(st, id, side, qty) {
  const M = MK(st); const px = pxOf(M, id); if (px == null) return null; qty = Math.max(0, Math.floor(qty || 0));
  const hs = halfSpread(st, id); const fill = side === 'b' ? px * (1 + hs) : px * (1 - hs);
  const amount = Math.round(qty * fill / 100); const spreadCost = Math.round(qty * px * hs / 100); const commission = qty ? commOf(st, amount) : 0;
  const h = M.held[id] || { qty: 0, basis: 0 }; const qAfter = side === 'b' ? h.qty + qty : Math.max(0, h.qty - qty);
  const basisSold = side === 's' && h.qty ? Math.round(h.basis * Math.min(qty, h.qty) / h.qty) : 0;
  const tax = side === 's' ? capitalGainsTax({ cost: basisSold, proceeds: amount - commission, mode: 'nominal', lossCarry: (st.life && st.life.lossCarry) || 0 }).tax : 0;
  const total = side === 'b' ? amount + commission : amount - commission - tax;
  const valueAfter = ils(qAfter, px); const basisAfter = side === 'b' ? h.basis + amount + commission : h.basis - basisSold;
  const allGross = Math.round(qAfter * px * (1 - hs) / 100); const allTax = qAfter ? capitalGainsTax({ cost: basisAfter, proceeds: allGross, mode: 'nominal', lossCarry: (st.life && st.life.lossCarry) || 0 }).tax : 0;
  return { id, side, qty, px, fill: Math.round(fill), hs, amount, spreadCost, commission, tax, total, qtyAfter: qAfter, valueAfter, basisAfter, ifSoldNow: allGross - (qAfter ? commOf(st, allGross) : 0) - allTax };
}
/** The most shares a ₪ amount buys (spread and commission included). */
export function qtyFor(st, id, cash) { const M = MK(st); const px = pxOf(M, id); if (!px) return 0; const hs = halfSpread(st, id); let q = Math.floor(cash * 100 / (px * (1 + hs) * (1 + 0.001 * (M.feeMult ? M.feeMult.comm : 1)))); while (q > 0 && preview(st, id, 'b', q).total > cash) q = Math.floor(q * 0.999); return Math.max(0, q); }
/**
 * Execute an order (the Z:trade action, a tile, a forced sale). o = {forced, discount (extra fire-sale %), noMandate}. → {ok, error?, qty,
 * cash, pnl, tax}. Buys need the cash (margin is the portfolio module's: borrow first). Every fill is a print at the mid (v += qty).
 */
export function trade(st, id, side, qty, out, ctx, o = {}) {
  const M = MK(st); const b = tradeBlock(st, id); if (b) return { ok: false, error: b };
  qty = Math.max(0, Math.floor(qty)); if (!qty) return { ok: false, error: 'כמות לא חוקית' };
  const h = M.held[id] || (M.held[id] = { qty: 0, basis: 0, fees: 0, divs: 0, opened: st.month });
  if (side === 's' && h.qty < qty) { if (!h.qty) delete M.held[id]; return { ok: false, error: 'אין לך כמות כזו' }; }
  const p = preview(st, id, side, qty); let cash = p.total; let tax = p.tax;
  if (side === 'b' && st.cash < p.total) { if (!h.qty) delete M.held[id]; return { ok: false, error: 'אין מספיק מזומן' }; }
  if (side === 'b' && M.mandate && !o.noMandate && id !== 'IDX') { const c = M.cos[id]; const nw = Math.max(1, ctx.netWorth(st)); let exp = 0;
    for (const [hid, x] of Object.entries(M.held)) { const cc = M.cos[hid]; if (cc && cc.sector === c.sector) exp += ils(x.qty, cc.px); }
    if (exp + p.amount > M.mandate.sector * nw) { if (!h.qty) delete M.held[id]; return { ok: false, error: `המנדט: עד ${Math.round(M.mandate.sector * 100)}% מהשווי בענף אחד` }; } }
  const c = id === 'IDX' ? null : M.cos[id];
  if (side === 'b') { st.cash -= p.total; h.qty += qty; h.basis += p.amount + p.commission; h.fees += p.commission; M.fees += p.commission; M.spreadPaid += p.spreadCost; }
  else {
    let gross = p.amount; if (o.discount) gross = Math.round(gross * (1 - o.discount));
    const basisSold = Math.round(h.basis * qty / h.qty); tax = sellTax(st, basisSold, gross - p.commission); cash = gross - p.commission - tax;
    st.cash += cash; h.qty -= qty; h.basis -= basisSold; h.fees += p.commission; M.fees += p.commission; M.spreadPaid += p.spreadCost + (p.amount - gross); M.taxPaid += tax;
    const pnl = gross - p.commission - basisSold; M.realized += pnl;
    ring(M.closed, { coId: id, name: c ? c.name : M.idxName, qty, basis: basisSold, proceeds: gross - p.commission, tax, pnl, reason: o.forced ? 'forced' : 'sold', m: st.month }, RING.closed);
    if (!h.qty) delete M.held[id];
  }
  // the fill prints at the mid (volume); the heir's block moves its own price (−1 % per 5 % of the block sold)
  if (c) { let px = c.px; if (side === 's' && M.block && M.block.coId === id) { const imp = clamp(0.2 * qty / Math.max(1, M.block.qty0), 0, 0.3); px = Math.max(1, Math.round(c.px * (1 - imp))); M.block.sold += qty; } print(c, px, qty); }
  else { M.idx.open.n++; M.idx.open.v += qty; }
  M.trades++;
  return { ok: true, qty, cash, tax, side };
}
/** Pay `fee` to research a company: its quality band (low / mid / high, never the number) and its distress. */
export function research(st, id, fee, out, ctx) {
  const M = MK(st); const c = M.cos[id]; if (!c || !isLive(c)) return { ok: false, error: 'אין חברה כזו' };
  if (st.cash < fee) return { ok: false, error: 'אין מספיק מזומן' };
  st.cash -= fee; if (fee) ctx.cashFx(out, -fee, `מחקר על ${c.name} ${ctx.fmtM(fee)}`); M.researchSpent += fee;
  c.seen = { band: c.q < 0.4 ? 'low' : c.q < 0.7 ? 'mid' : 'high', distress: c.distress, m: st.month };
  return { ok: true, band: c.seen.band };
}

/* ---------------------------------------------------------------- values */
/** Market value of every holding (live companies at the price, the index fund) + unpaid claims. */
export function holdingsValue(st) {
  const M = MK(st); if (!M) return 0; let v = 0;
  for (const [id, h] of Object.entries(M.held)) { const px = pxOf(M, id); if (px != null) v += ils(h.qty, px); }
  for (const cl of M.claims) v += cl.amount;
  return v;
}
export const liveCos = (st) => { const M = MK(st); return M.slots.map((id) => id && M.cos[id]).filter((c) => c && isLive(c)); };
const QB = { low: 'נמוכה', mid: 'בינונית', high: 'גבוהה' };
/** The public view of a company (NO sealed field: q, recov and the fraud follow-up never leave the engine; a research shows a band). */
export function publicCo(st, c) {
  const M = MK(st); const h = M.held[c.id]; const val = h ? ils(h.qty, c.px) : 0;
  return { id: c.id, name: c.name, tk: c.tk, sector: c.sector, sectorLabel: SECTORS[c.sector], size: c.size, debt: c.debt, beta: c.beta, vol: c.vol, div: c.div, status: c.status, slot: c.slot,
    px: c.px, open: { ...c.open }, cand: c.cand.slice(), peakPx: c.peakPx, listedM: c.listedM, endedM: c.endedM, endPx: c.endPx, halted: c.status === 'halted', merge: c.merge ? { at: c.merge.at, px: c.merge.px } : null,
    ev: c.ev.map(([m, t, pct]) => ({ m, type: t, label: EVENTS[t].label, pct })), seen: c.seen ? { band: c.seen.band, bandLabel: QB[c.seen.band], distress: c.seen.distress, m: c.seen.m } : null,
    hs: halfSpread(st, c.id), held: h ? { qty: h.qty, basis: h.basis, value: val, pnl: val - h.basis, fees: h.fees, divs: h.divs, opened: h.opened } : null };
}
/** "אילו קנית את המדד באותם חודשים": the index fund's return over a holding's months (teaching, no advice). */
export function benchmark(st, fromM) { const I = MK(st).idx; const c = I.cand.find((x) => x[0] === fromM - 1) || I.cand.find((x) => x[0] >= fromM - 1); const p0 = c ? c[4] : IDX0; return round3(I.px / p0 - 1); }
export function marketView(st) {
  const M = MK(st); if (!M) return null; const R = M.regime;
  const idxH = M.held.IDX; const idxVal = idxH ? ils(idxH.qty, M.idx.px) : 0;
  return { regime: { id: R.id, label: REGIMES[R.id].label, sector: R.sector, sectorLabel: R.sector ? SECTORS[R.sector] : null, since: R.since, minLeft: R.minLeft },
    idx: { id: 'IDX', name: M.idxName, tk: 'MDD', px: M.idx.px, open: { ...M.idx.open }, cand: M.idx.cand.slice(), ret: M.idxRet, hs: halfSpread(st, 'IDX'), div: M.idxDiv, held: idxH ? { qty: idxH.qty, basis: idxH.basis, value: idxVal, pnl: idxVal - idxH.basis, fees: idxH.fees, divs: idxH.divs, opened: idxH.opened } : null },
    cos: M.slots.map((id) => id && M.cos[id]).filter(Boolean).map((c) => publicCo(st, c)), news: M.news.slice(), grave: M.grave.map((g) => ({ ...g, cand: g.cand.slice() })),
    claims: M.claims.map((c) => ({ ...c })), closed: M.closed.slice(), value: holdingsValue(st), realized: M.realized, fees: M.fees, spreadPaid: M.spreadPaid, taxPaid: M.taxPaid, divs: M.divs, research: M.researchSpent,
    sectors: SECTORS, regimes: Object.fromEntries(REGIME_IDS.map((r) => [r, REGIMES[r].label])) };
}

/* ---------------------------------------------------------------- the module */
export const market = {
  id: ID, draws: Object.freeze({ init: 0, month: 0, landing: Object.freeze({ W: 0 }) }),
  streams: Object.freeze({ exch: DRAWS, content: Object.freeze({ month: NEWS_PICKS * 2 }) }),
  lessons: ['mkt_candle', 'mkt_diversify', 'mkt_fees', 'mkt_bankrupt', 'mkt_rumor'],
  mentorKeys: ['tradeFloor', 'researched'],
  sealed: ['mkt.cos.*.q', 'mkt.cos.*.recov', 'mkt.cos.*.fraudBk', 'rng.exch', 'rng.content'],

  init(st, w, ch, ctx) {
    const cfg = { slots: cfgOf(w).slots || SLOTS, sectors: cfgOf(w).sectors || 'all', muAdd: cfgOf(w).muAdd || 0 }; const D = drawsFor(cfg.slots);
    const rs = []; for (let i = 0; i < D.init; i++) rs.push(ctx.drawX(st, 'exch')); // exactly 1 + 3 × slots `exch` draws, whoever plays
    const r0 = wpick(Object.entries(REGIME0), rs[0]);
    st.mkt = { v: 1, cfg, month: st.month, regime: { id: r0, sector: null, since: st.month, minLeft: REGIMES[r0].min - 1 }, regimes: [[st.month, r0]],
      idx: { px: IDX0, open: { o: IDX0, h: IDX0, l: IDX0, c: IDX0, n: 0, v: 0 }, cand: [] }, idxRet: 0, idxName: 'קרן מדד הבורסה', idxDiv: 0.02,
      cos: {}, slots: Array.from({ length: cfg.slots }, () => null), sec: slotSectors(cfg), freed: {}, nextId: 1, usedKeys: [], poolKeys: null,
      held: {}, closed: [], news: [], grave: [], claims: [], realized: 0, fees: 0, spreadPaid: 0, taxPaid: 0, divs: 0, researchSpent: 0, trades: 0,
      feeMult: null, mandate: null, block: null, stats: { events: {}, bySlot: {}, fraudKeys: {}, bankrupt: 0, relisted: 0, fallback: 0, reg: {} } };
    for (let s = 0; s < cfg.slots; s++) listFrom(st, s, st.mkt.sec[s], rs[1 + 3 * s], rs[2 + 3 * s], rs[3 + 3 * s]);
  },
  defaults(st) { const M = MK(st); if (!M) return; for (const k of ['closed', 'news', 'grave', 'claims']) if (!Array.isArray(M[k])) M[k] = []; if (!M.stats.reg) M.stats.reg = {}; },
  monthly(st, out, ctx) { if (MK(st)) marketMonth(st, out, ctx); },
  worth(st) { return holdingsValue(st); },
  tiles: {
    // 'W' — the trading floor: the month's news and the market's state; a free look at one company; the safe option spends nothing
    W: {
      safe: 'done',
      create(st) { const M = MK(st); const live = liveCos(st); const hot = M.news.slice().reverse().find((n) => n.coId && M.cos[n.coId] && isLive(M.cos[n.coId]));
        return { focusCo: hot ? hot.coId : (live[0] ? live[0].id : null), m: st.month }; },
      describe(st, p, ev, ctx) {
        const M = MK(st); const V = marketView(st); const c = p.focusCo && M.cos[p.focusCo];
        ev.tag = 'הבורסה'; ev.title = `חדר המסחר · ${V.regime.label}${V.regime.sectorLabel ? ' · ' + V.regime.sectorLabel : ''}`;
        ev.text = `המדד ${fmtPx(M.idx.px)} (${M.idxRet >= 0 ? '+' : '−'}${Math.round(Math.abs(M.idxRet) * 1000) / 10}% בחודש האחרון). ${M.news.length ? 'בחדשות: ' + M.news[M.news.length - 1].text : 'שקט בשוק.'}`;
        ev.mentor = ctx.mentorLine(st, 'tradeFloor', {}) || 'מחיר זה לא ערך. נר חודשי מראה מה קרה — לא מה יקרה.';
        ev.data = { market: { regime: V.regime, idx: V.idx, news: V.news.slice(-6), focus: c ? publicCo(st, c) : null, value: V.value }, note: 'המסחר עצמו — בלוח הבורסה בין הטלות. כאן: מבט חינם על החברה שבחדשות.' };
        ev.options = [ctx.opt('done', 'להמשיך', true), ...(c && !c.seen ? [ctx.opt('peek', `מבט חינם על ${c.name}: איכות וחוב`, true, { kind: 'inspect' })] : [])];
        ev.forcePrimary = c && !c.seen ? 'peek' : 'done';
      },
      choose(st, p, o, params, out, ctx) {
        if (o.id === 'peek') { const r = research(st, p.focusCo, 0, out, ctx); if (r.ok) { ctx.lesson(st, out, 'mkt_candle'); out.mentor = ctx.mentorLine(st, 'researched', { co: MK(st).cos[p.focusCo].name, band: QB[r.band] }) || `${MK(st).cos[p.focusCo].name}: איכות ${QB[r.band]}.`; } }
        ctx.logDecision(st, 'הבורסה', o.id === 'peek' ? 'מבט על חברה' : 'המשך'); return true;
      },
    },
  },
  act: {
    /** p = "<id>:<b|s|B|S>:<qty | ₪ | all>" — b/s shares, B/S ₪ amount, S:all sells the position. */
    trade(st, p, out, ctx) {
      const [id, sd, n] = String(p || '').split(':'); if (!id || !['b', 's', 'B', 'S'].includes(sd)) return fail(out, 'bad_param');
      const M = MK(st); const side = sd.toLowerCase(); let qty;
      if (sd === 'b' || sd === 's') qty = Math.floor(+n); else if (sd === 'S' && n === 'all') qty = (M.held[id] || {}).qty || 0; else if (sd === 'B') qty = qtyFor(st, id, +n); else { const px = pxOf(M, id); qty = px ? Math.min((M.held[id] || {}).qty || 0, Math.ceil(+n * 100 / px)) : 0; }
      if (!Number.isFinite(qty) || qty <= 0) return fail(out, 'כמות לא חוקית');
      const r = trade(st, id, side, qty, out, ctx); if (!r.ok) return fail(out, r.error);
      ctx.cashFx(out, side === 'b' ? -Math.abs(r.cash) : r.cash, null); ctx.sound(out, side === 'b' ? 'buy' : 'coin');
      if (M.trades === 1) ctx.lesson(st, out, 'mkt_fees');
      if (Object.keys(M.held).length >= 5) ctx.lesson(st, out, 'mkt_diversify');
      const name = id === 'IDX' ? M.idxName : M.cos[id].name;
      out.toast = side === 'b' ? `קנית ${r.qty.toLocaleString('en-US')} ${name} · ${ctx.fmtM(Math.abs(r.cash))} כולל עמלה ומרווח` : `מכרת ${r.qty.toLocaleString('en-US')} ${name} · ${ctx.fmtM(r.cash)} אחרי עמלה${r.tax ? ' ומס ' + ctx.fmtM(r.tax) : ''}`;
      ctx.logDecision(st, 'מסחר', side === 'b' ? 'קנייה' : 'מכירה', Math.abs(r.cash)); return true;
    },
    research(st, p, out, ctx) { const fee = researchFee(st, ctx); const r = research(st, String(p || ''), fee, out, ctx); if (!r.ok) return fail(out, r.error); const c = MK(st).cos[p];
      out.toast = `מחקר על ${c.name}: איכות ${QB[r.band]}${c.seen.distress ? ` · ${c.seen.distress} סימני מצוקה` : ''}.`; ctx.lesson(st, out, 'mkt_rumor'); ctx.logDecision(st, 'מחקר חברה', c.name, fee); return true; },
  },
  actions(st, ctx) {
    const M = MK(st); const out = []; const fee = researchFee(st, ctx);
    for (const c of liveCos(st)) {
      if (!c.seen) out.push({ id: 'research', param: c.id, coId: c.id, label: `מחקר על ${c.name} (${ctx.fmtM(fee)}): איכות וחוב`, enabled: st.cash >= fee && c.status === 'listed', suggested: false, cost: fee });
      const h = M.held[c.id]; if (h && c.status === 'listed') out.push({ id: 'trade', param: `${c.id}:S:all`, coId: c.id, label: `למכור את כל ${c.name}`, enabled: true, suggested: false, preview: preview(st, c.id, 's', h.qty) });
    }
    return out;
  },
  indicators(st) { return { market: marketView(st) }; },
};
function fail(out, msg) { out.ok = false; out.error = msg; return false; }
export function researchFee(st, ctx) { const M = MK(st); if (M && M.freeResearch) return 0; const e = ctx.world(st).econ || {}; return e.ddMinFee || RESEARCH_FEE; }
export default market;
