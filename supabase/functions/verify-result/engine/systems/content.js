// js/systems/content.js — dynamic content pools (CATALOG-25 §4, wave A0). Pure; no engine import (the engine and the modules pass a
// `draw` function that reads ONE lazy stream: `content`, STREAMS index 17 — js/rng.js LAZY_STREAMS).
//
// "The tile TYPE stays on the board. The CONTENT comes from pools." A world with minRules ≥ 7 declares
//   content: { pools: { D: 'deal', … },                // tile letter → pool (the engine's deal tile reads pools.D)
//              data: { deal: [entries], news: [entries], … } }   // the pool entries (data only; js/content/<pool>.js)
// Worlds w1–w9 declare nothing: their legacy decks and their states are untouched (no `content` stream, no st.content).
//
// Determinism and fairness (I7): every selection consumes EXACTLY POOL_D[pool] draws, whatever is eligible; game start consumes 1 draw per
// pool (the seeded active pack) and every ROTATE_EVERY paydays 1 more per pool (the rotation). Eligibility never reads a player's choices
// beyond the declared `needs` / `excl` tags of the card's own world, so two players of one seed see the same ids at the same landings.
// Identity (I8, C-freeze): an instance copies every number into the card (`iid` = pool:id:turn); a pack edit, a rotation or a market move
// never rewrites an accepted offer.
//
// Entry schema (§4.2, checked by checkEntry → C-schema):
//   { id:'deal.bondFund', v:1, pool:'deal', tiles:['O'], worlds:['w10'] | tiers:[7,12], tags:['bond'], w:10,
//     mult:{ regime:{recession:0.5} }, needs:['tag'], excl:['tag'], firstMonth:0, lastMonth:null, cooldown:8, perRun:2,
//     trigger:null | { on:'regime:recession', months:6 },
//     gen:{ cost:['band',0.2,0.6], down:['ofCost',1,1], cf:['yield',0.003,0.005], x:['range',a,b], n:['int',a,b] },
//     text:{ n, d, q }, vars:{ name:['…','…'] }, effects:{ k, op:{…} }, preview:true, risk:'sealed:…' | null }

export const CONTENT_V = 1;
/** The pools (§4.1) and their FIXED draw count per selection (draw 1 = the pick, the rest fill gen ranges and vars). */
export const POOL_D = Object.freeze({ deal: 4, doodad: 3, news: 2, crisis: 3, opportunity: 4, personal: 3, economic: 2, company: 3, asset: 4, round: 4, mission: 2, rumor: 2 });
export const POOLS = Object.freeze(Object.keys(POOL_D));
/** Placeholders a pool's caller fills (not gen / vars): news text names the company, its sector and the move. */
export const POOL_CTX = Object.freeze({ news: ['co', 'tk', 'sector', 'pct', 'regime'], rumor: ['co', 'tk', 'sector'], deal: ['area'], economic: ['regime'] });
export const ACTIVE_SHARE = 0.7;   // the seeded active pack: 70 % of a pool's entries (at least ACTIVE_MIN, at most all)
export const ACTIVE_MIN = 8;
export const ROTATE_EVERY = 12;    // paydays between rotations
export const ROTATE_SHARE = 0.25;  // a rotation swaps 25 % of the active pack
export const RING_MAX = 8;         // the no-repeat ring per pool (window W = min(8, ⌊eligible / 2⌋))
const GEN_KINDS = ['band', 'ofCost', 'yield', 'range', 'int'];
const REQUIRED = ['id', 'v', 'pool', 'w', 'text'];
const ALLOWED = new Set(['id', 'v', 'pool', 'tiles', 'worlds', 'tiers', 'tags', 'w', 'mult', 'needs', 'excl', 'firstMonth', 'lastMonth', 'cooldown', 'perRun', 'trigger', 'gen', 'text', 'vars', 'effects', 'preview', 'risk']);

const frac = (x) => x - Math.floor(x);
/** A local mulberry32 from one draw (used to shuffle a pack without consuming more stream draws). */
function local(u) { let s = (Math.floor(u * 4294967296) >>> 0) || 1; return () => { let t = (s = (s + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
/** {placeholder} names in a string. */
export function placeholders(s) { return [...String(s || '').matchAll(/\{(\w+)\}/g)].map((m) => m[1]); }

/* ---------------------------------------------------------------- C-schema */
/** → [] when the entry is well formed, else the problems (C-schema, C-free). */
export function checkEntry(e) {
  const errs = []; const id = e && e.id;
  if (!e || typeof e !== 'object') return ['not an object'];
  for (const k of REQUIRED) if (e[k] == null) errs.push(`${id}: missing ${k}`);
  for (const k of Object.keys(e)) if (!ALLOWED.has(k)) errs.push(`${id}: unknown field ${k}`);
  if (typeof e.id !== 'string' || !e.id.startsWith(e.pool + '.')) errs.push(`${id}: id must start with "${e.pool}."`);
  if (!POOL_D[e.pool]) errs.push(`${id}: unknown pool ${e.pool}`);
  if (!Number.isInteger(e.w) || e.w <= 0) errs.push(`${id}: w must be a positive integer`);
  if (!Number.isInteger(e.v) || e.v < 1) errs.push(`${id}: v must be an integer ≥ 1`);
  for (const [k, g] of Object.entries(e.gen || {})) {
    if (!Array.isArray(g) || !GEN_KINDS.includes(g[0]) || !Number.isFinite(g[1]) || !Number.isFinite(g[2]) || g[2] < g[1]) errs.push(`${id}: gen.${k} must be [kind, lo, hi] with lo ≤ hi`);
  }
  if ((e.gen || {}).down && (e.gen.down[0] !== 'ofCost' || e.gen.down[2] > 1)) errs.push(`${id}: gen.down must be ['ofCost', a, b ≤ 1]`);
  if (Object.keys(e.gen || {}).length > POOL_D[e.pool] - 1 + 2) errs.push(`${id}: more gen fields than the pool's draws can fill`);
  for (const [k, xs] of Object.entries(e.vars || {})) if (!Array.isArray(xs) || !xs.length || xs.some((x) => typeof x !== 'string')) errs.push(`${id}: vars.${k} must be a non-empty string list`);
  const known = new Set([...Object.keys(e.gen || {}), ...Object.keys(e.vars || {}), ...(POOL_CTX[e.pool] || []), 'value', 'months']);
  for (const f of ['n', 'd', 'q']) for (const ph of placeholders((e.text || {})[f])) if (!known.has(ph)) errs.push(`${id}: text.${f} {${ph}} has no var, gen field or pool context`);
  if (!e.text || typeof e.text.n !== 'string' || !e.text.n) errs.push(`${id}: text.n`);
  if (e.mult) for (const [dim, m] of Object.entries(e.mult)) for (const [k, x] of Object.entries(m || {})) if (!(x > 0) || Math.round(x * 10) < 1) errs.push(`${id}: mult.${dim}.${k} must be ≥ 0.1`);
  if (e.cooldown != null && (!Number.isInteger(e.cooldown) || e.cooldown < 0)) errs.push(`${id}: cooldown`);
  if (e.perRun != null && (!Number.isInteger(e.perRun) || e.perRun < 1)) errs.push(`${id}: perRun`);
  if (e.trigger != null && (typeof e.trigger.on !== 'string' || !Number.isInteger(e.trigger.months) || e.trigger.months < 1)) errs.push(`${id}: trigger {on, months}`);
  // C-free (I2): nothing costs ≤ 0 and pays > 0 without a sealed risk
  if (e.gen && e.gen.cf && e.gen.cf[1] > 0 && (!e.gen.cost || e.gen.cost[2] <= 0) && !e.risk) errs.push(`${id}: C-free — pays without a cost and without a sealed risk`);
  if (e.pool === 'deal' && e.preview === false) errs.push(`${id}: I1 — a deal must carry a preview`);
  return errs;
}
/** → [] when the pool is valid: entries well formed, unique ids, all of this pool. */
export function checkPool(pool, entries) {
  const errs = []; const seen = new Set();
  if (!Array.isArray(entries) || !entries.length) return [`${pool}: empty pool`];
  for (const e of entries) { for (const x of checkEntry(e)) errs.push(x); if (e.pool !== pool) errs.push(`${e.id}: in pool ${pool} but declares ${e.pool}`); if (seen.has(e.id)) errs.push(`${e.id}: duplicate id`); seen.add(e.id); }
  return errs;
}

/* ---------------------------------------------------------------- state: active packs, rotation, triggers */
/** The content state of a new game: one draw per pool (sorted by name) seeds that pool's active pack. */
export function initContent(st, spec, draw) {
  const C = st.content = { v: CONTENT_V, act: {}, recent: {}, last: {}, count: {}, trig: {}, rotAt: ROTATE_EVERY };
  for (const pool of Object.keys(spec.data || {}).sort()) {
    const u = draw(); const ids = spec.data[pool].map((e) => e.id).sort();
    const n = Math.min(ids.length, Math.max(ACTIVE_MIN, Math.ceil(ids.length * ACTIVE_SHARE)));
    C.act[pool] = shuffled(ids, u).slice(0, n).sort(); C.recent[pool] = [];
  }
  return C;
}
function shuffled(ids, u) { const r = local(u); const a = ids.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
/** Payday upkeep: the periodic rotation (1 draw per pool, every ROTATE_EVERY paydays) and the pruning of the seen maps. */
export function paydayContent(st, spec, draw, paydays) {
  const C = st.content; if (!C) return;
  if (paydays >= C.rotAt) {
    C.rotAt = paydays + ROTATE_EVERY;
    for (const pool of Object.keys(spec.data || {}).sort()) {
      const u = draw(); const all = spec.data[pool].map((e) => e.id).sort(); const act = (C.act[pool] || []).filter((id) => all.includes(id));
      const off = all.filter((id) => !act.includes(id)); const k = Math.min(off.length, Math.floor(act.length * ROTATE_SHARE)); if (!k) { C.act[pool] = act; continue; }
      const out = shuffled(act, u).slice(0, k); const inn = shuffled(off, frac(u * 7919)).slice(0, k);
      C.act[pool] = act.filter((id) => !out.includes(id)).concat(inn).sort();
    }
  }
  prune(st, spec);
}
/** Keep the seen maps bounded: `last` only inside the entry's cooldown, `count` only for perRun-limited ids (budget ≤ 8 KB). */
function prune(st, spec) {
  const C = st.content; const m = st.month; const E = entryIndex(spec);
  for (const id of Object.keys(C.last)) { const e = E[id]; if (!e || m - C.last[id] > Math.max(e.cooldown || 0, 1)) delete C.last[id]; }
  for (const id of Object.keys(C.count)) { const e = E[id]; if (!e || !e.perRun) delete C.count[id]; }
  for (const id of Object.keys(C.trig)) if (C.trig[id] < m) delete C.trig[id];
}
const IDX = new WeakMap();
function entryIndex(spec) { let x = IDX.get(spec); if (!x) { x = {}; for (const es of Object.values(spec.data || {})) for (const e of es) x[e.id] = e; IDX.set(spec, x); } return x; }
/** A triggered event (e.g. 'regime:recession'): entries with that trigger switch on for their months. No draw. */
export function fireTrigger(st, spec, on) {
  const C = st.content; if (!C) return [];
  const hit = []; for (const es of Object.values(spec.data || {})) for (const e of es) if (e.trigger && e.trigger.on === on) { C.trig[e.id] = st.month + e.trigger.months - 1; hit.push(e.id); }
  return hit;
}

/* ---------------------------------------------------------------- selection */
/**
 * Pick one entry of `pool` and instantiate it. ALWAYS consumes POOL_D[pool] draws (even when nothing is eligible: then → null and the
 * caller falls back to its legacy deck). f = {worldId, tier, tile, tags:[…] (an entry must carry one of them), regime, phase, has(tag)}.
 */
export function select(st, spec, pool, f, draw, o = {}) {
  const D = POOL_D[pool]; const rs = []; for (let i = 0; i < D; i++) rs.push(draw());
  const C = st.content; const all = (spec.data || {})[pool] || [];
  if (!C || !all.length) return null;
  const elig = eligible(st, C, all, pool, f);
  const pick = pickFrom(st, C, elig, pool, rs[0]);
  if (!pick) return null;
  record(st, C, pool, pick, elig.length);
  return instantiate(pick, rs, { turn: st.turn, band: o.band, fmt: o.fmt, ctx: o.ctx });
}
function eligible(st, C, all, pool, f) {
  const act = new Set(C.act[pool] || all.map((e) => e.id)); const m = st.month;
  return all.filter((e) => (act.has(e.id) || (C.trig[e.id] != null && C.trig[e.id] >= m)) && (!e.trigger || (C.trig[e.id] != null && C.trig[e.id] >= m))
    && (!e.worlds || e.worlds.includes(f.worldId) || e.worlds.includes('∞')) && (!e.tiers || f.tier == null || (f.tier >= e.tiers[0] && f.tier <= e.tiers[1]))
    && (!e.tiles || !f.tile || e.tiles.includes(f.tile)) && (!f.tags || !f.tags.length || (e.tags || []).some((t) => f.tags.includes(t)))
    && (!e.needs || e.needs.every((t) => (f.has ? f.has(t) : false))) && (!e.excl || !e.excl.some((t) => (f.has ? f.has(t) : false)))
    && (e.firstMonth == null || m >= e.firstMonth) && (e.lastMonth == null || m <= e.lastMonth) && (!e.perRun || (C.count[e.id] || 0) < e.perRun))
    .map((e) => ({ e, wt: weightOf(e, f) })).filter((x) => x.wt > 0).sort((a, b) => byId(a.e, b.e));
}
/** Integer weight: w × Π round(mult × 10) over the dimensions that apply (regime, cycle phase). */
function weightOf(e, f) {
  let w = e.w; const M = e.mult || {};
  if (M.regime) w *= Math.round((M.regime[f.regime] ?? 1) * 10); else w *= 10;
  if (M.cycle) w *= Math.round((M.cycle[f.phase] ?? 1) * 10); else w *= 10;
  return w;
}
function pickFrom(st, C, elig, pool, u) {
  const m = st.month; const ring = C.recent[pool] || [];
  const W = Math.min(RING_MAX, Math.floor(elig.length / 2));
  const tries = [{ w: W, cd: 1 }, { w: Math.floor(W / 2), cd: 0.5 }, { w: 0, cd: 0 }];
  for (const t of tries) {
    const rec = new Set(t.w ? ring.slice(-t.w) : []);
    const xs = elig.filter((x) => !rec.has(x.e.id) && !(C.last[x.e.id] != null && m - C.last[x.e.id] < Math.floor((x.e.cooldown || 0) * t.cd)));
    if (xs.length) { const tot = xs.reduce((s, x) => s + x.wt, 0); let r = Math.floor(u * tot); for (const x of xs) { r -= x.wt; if (r < 0) return x.e; } return xs[xs.length - 1].e; }
  }
  return null;
}
function record(st, C, pool, e, n) {
  const ring = C.recent[pool] || (C.recent[pool] = []); ring.push(e.id); const W = Math.max(1, Math.min(RING_MAX, Math.floor(n / 2))); while (ring.length > Math.max(W, 1)) ring.shift();
  C.last[e.id] = st.month; if (e.perRun) C.count[e.id] = (C.count[e.id] || 0) + 1;
}
const r1000 = (x) => Math.round(x / 1000) * 1000;
const round3 = (x) => Math.round(x * 1000) / 1000;
/**
 * Freeze an entry into an instance: every number generated now (draws rs[1…] in the fixed gen-key order: cost, down, cf, value, then the
 * others sorted), the vars picked, the text filled. o.band = [lo, hi] ₪ for 'band' (the world's econ.band.deal), o.fmt(n) = money text,
 * o.ctx = caller placeholders ({co}, {pct} …).
 */
export function instantiate(e, rs, o = {}) {
  const band = o.band || [0, 0]; const nums = {}; const keys = orderGen(e.gen || {}); let k = 1;
  const u = (i) => (i < rs.length ? rs[i] : frac(rs[rs.length - 1] * (7919 + 104729 * i)));
  for (const key of keys) {
    const [kind, a, b] = e.gen[key]; const x = a + (b - a) * u(k++);
    if (kind === 'band') nums[key] = r1000(band[0] + (band[1] - band[0]) * x);
    else if (kind === 'ofCost') nums[key] = r1000((nums.cost || 0) * x);
    else if (kind === 'yield') nums[key] = Math.round((nums.cost || 0) * x / 10) * 10;
    else if (kind === 'int') nums[key] = Math.min(b, Math.floor(a + (b - a + 1) * u(k - 1)));
    else nums[key] = round3(x);
  }
  const vars = {}; let j = 0; for (const name of Object.keys(e.vars || {}).sort()) { const xs = e.vars[name]; vars[name] = xs[Math.floor(frac(u(0) * (613 + 97 * j++)) * xs.length)]; }
  const fmt = o.fmt || ((n) => String(n)); const fill = {};
  for (const [kk, v] of Object.entries(nums)) fill[kk] = ['range'].includes((e.gen[kk] || [])[0]) ? String(v) : (e.gen[kk] || [])[0] === 'int' ? String(v) : fmt(v);
  Object.assign(fill, vars, o.ctx || {});
  const text = {}; for (const f of ['n', 'd', 'q']) if (e.text[f] != null) text[f] = String(e.text[f]).replace(/\{(\w+)\}/g, (m0, ph) => (ph in fill ? fill[ph] : m0));
  return { iid: `${e.pool}:${e.id}:${o.turn ?? 0}`, id: e.id, pool: e.pool, v: e.v, tags: (e.tags || []).slice(), nums, vars, text, risk: e.risk || null,
    effects: e.effects ? JSON.parse(JSON.stringify(e.effects)) : null };
}
function orderGen(g) { const first = ['cost', 'down', 'cf', 'value'].filter((k) => g[k]); return first.concat(Object.keys(g).filter((k) => !first.includes(k)).sort()); }
/** A deal instance → an engine deal card (frozen numbers; op from the entry's effects, merged with the generated numbers). */
export function dealCard(inst) {
  const n = inst.nums; const ef = inst.effects || {}; const cost = n.cost || 0;
  const card = { k: ef.k || 'stock', n: inst.text.n, d: inst.text.d || '', cost, down: n.down ?? cost, value: n.value ?? cost, cf: n.cf || 0, iid: inst.iid, cid: inst.id };
  if (inst.text.q) card.q = inst.text.q;
  if (ef.op) card.op = { ...ef.op, gen: Object.fromEntries(Object.entries(n).filter(([k]) => !['cost', 'down', 'value', 'cf'].includes(k))) };
  if (ef.tk) { card.tk = ef.tk; delete card.op; }
  return card;
}
/** The ids a finished game showed (for the profile's local `contentSeen`: library "חדש!" badges; never an input of a seeded game). */
export function seenIds(st) { const C = st.content; if (!C) return []; return [...new Set([...Object.values(C.recent).flat(), ...Object.keys(C.last)])].sort(); }
