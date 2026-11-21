// T6 ghost client (main thread, spec §2.4–2.6). Owns the worker, the finished-ghost cache (rr2-ghosts, LRU ≤ 8) and the ONE accessor
// the UI may read during play: view(month) — every series clamped to the player's month (R3: rows m ≤ month, marks m < month).
// Nothing ghost-related is ever sent to the server (DD-6). No Worker → no ghost computation during play; after the game ends the
// ghosts are computed on the main thread in idle callbacks, only while the end screen is visible.
// bus: 'ghosts:update' {key} (new rows) · 'ghosts:done' {key, ends} · 'ghosts:state' {state}
import * as E from './engine.js';
import { bus } from './bus.js';
import { flag } from './flags.js';
import { ARCH_IDS, PERSONAS_FALLBACK } from './summary.js';

export const CACHE_KEY = 'rr2-ghosts', CACHE_MAX = 8;
const PROTO_V = 1;
let G = null;                // the current game's ghost state
let worker = null, workerBroken = false;
let pol = null;              // main-thread policies (idle fallback only)
const audit = { msgs: 0, rowMsgs: 0, violations: 0, maxRowOver: 0, perf: [] }; // AC-17 / AC-19 instrumentation (tests read ghosts.audit())

/** display data of the four personas: the engine's table (E.RIVALS, T6 ENGINE part) when it exists */
export function personas() { const R = E.RIVALS; return R && R.saver ? R : PERSONAS_FALLBACK; }
const ls = () => { try { return globalThis.localStorage || null; } catch (e) { return null; } };
/** §2.6 key (ARCH_V is appended once the policies report their version) */
export function baseKey(st) {
  const c = E.replayConfig(st);
  return [c.worldId, c.charId, c.seed >>> 0, c.mode, c.maxMonths ?? '', c.scenarioId ?? '', c.rules ?? '', c.tutorial ? 1 : 0, c.bailout ? 1 : 0, st.dream ? (st.dream.id || st.dream) : '', E.SAVE_VERSION, E.OUTCOME_REV ?? 0].join('|');
}
/** may ghosts run for this game? (flag rivals; not in history mode — real market data is lazy and the comparison is the benchmark) */
export function enabledFor(st) { return !!(st && flag('rivals') && st.mode !== 'history' && st.worldId !== 'h'); }

/* ---------------------------------------------------------------- cache (finished ghost games only) */
export function cacheRead(key) {
  try { const all = JSON.parse(ls()?.getItem(CACHE_KEY) || '[]'); const e = Array.isArray(all) ? all.find((x) => x && x.key === key) : null; return e && e.ghosts ? e : null; } catch (e) { return null; }
}
export function cacheWrite(key, ghosts) {
  const s = ls(); if (!s) return false;
  let all = []; try { all = JSON.parse(s.getItem(CACHE_KEY) || '[]'); if (!Array.isArray(all)) all = []; } catch (e) { all = []; }
  all = all.filter((x) => x && x.key !== key); all.unshift({ key, at: Date.now(), ghosts }); all = all.slice(0, CACHE_MAX);
  for (let n = all.length; n > 0; n--) { try { s.setItem(CACHE_KEY, JSON.stringify(all.slice(0, n))); return true; } catch (e) { /* quota: drop the oldest */ } }
  return false;
}

/* ---------------------------------------------------------------- worker */
function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    if (typeof Worker !== 'function') throw new Error('no Worker');
    worker = new Worker(new URL('./ghost-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => onMsg(ev.data);
    worker.onerror = (e) => { console.warn('ghost worker failed', e && e.message); workerBroken = true; try { worker.terminate(); } catch (x) { /* ignore */ } worker = null; if (G && G.mode === 'worker') { G.mode = 'none'; G.state = 'noworker'; bus.emit('ghosts:state', { state: G.state }); if (G.over) startIdle(); } };
  } catch (e) { workerBroken = true; worker = null; }
  return worker;
}
const postW = (m) => { try { worker && worker.postMessage(m); } catch (e) { console.warn(e); } };

function fresh(st) {
  return { key: baseKey(st), cacheKey: null, cfg: E.replayConfig(st), mode: 'none', state: 'computing', rows: {}, marks: {}, escaped: {}, ends: {}, errors: {}, upTo: 0, over: false, cap: 0, endMonth: 0, polOk: null };
}
/** game start / resume (game.js). Idempotent for the same game. */
export function start(st) {
  if (!enabledFor(st)) { stop(); return null; }
  const k = baseKey(st);
  if (G && G.key === k) { advance(st); return G; }
  stop();
  G = fresh(st);
  for (const a of ARCH_IDS) { G.rows[a] = []; G.marks[a] = []; }
  const hit = scanCache(k);
  if (hit) { G.ends = hit.ghosts; G.cacheKey = hit.key; G.state = 'cached'; G.mode = 'cache'; bus.emit('ghosts:state', { state: G.state }); return G; }
  if (ensureWorker()) { G.mode = 'worker'; postW({ t: 'init', v: PROTO_V, key: G.key, cfg: G.cfg, archs: ARCH_IDS }); }
  else { G.mode = 'none'; G.state = 'noworker'; }
  bus.emit('ghosts:state', { state: G.state });
  advance(st);
  return G;
}
/** any cached entry for this base key (whatever ARCH_V it carries) — the newest wins */
function scanCache(base) {
  try { const all = JSON.parse(ls()?.getItem(CACHE_KEY) || '[]'); return (Array.isArray(all) ? all : []).find((x) => x && typeof x.key === 'string' && (x.key === base || x.key.startsWith(base + '|'))) || null; } catch (e) { return null; }
}
/** after every player payday: upTo = S.month (monotonic) */
export function advance(st) {
  if (!G || !st || G.over) return;
  const m = st.month | 0; if (m <= G.upTo) return;
  G.upTo = m;
  if (G.mode === 'worker') postW({ t: 'advance', key: G.key, upTo: m });
}
/** the player's game ended: run the ghosts to their own end or the cap (§2.6) */
export function finish(st) {
  if (!G || !st) return;
  G.over = true; G.endMonth = st.month | 0;
  const lim = st.maxMonths || (E.getWorld(st.worldId).maxMonths) || 60;
  G.cap = st.mode === 'free' ? Math.max(G.endMonth, Math.ceil(1.6 * lim)) : Math.max(G.endMonth, lim + 1);
  if (G.mode === 'cache') { setTimeout(() => bus.emit('ghosts:done', { key: G.key, ends: G.ends }), 0); return; }
  if (G.mode === 'worker') postW({ t: 'finish', key: G.key, cap: G.cap });
  else startIdle();
}
export function stop() { if (G && worker) postW({ t: 'drop', key: G.key }); stopIdle(); G = null; }

function onMsg(m) {
  const t0 = performance.now();
  try {
    if (!G || !m || m.key !== G.key) return;
    audit.msgs++;
    if (m.t === 'ready') {
      G.polOk = !!m.pol; G.cacheKey = G.key + '|' + (m.archV ?? 0);
      if (!m.pol) { G.state = 'unavailable'; bus.emit('ghosts:state', { state: G.state }); }
      return;
    }
    if (m.t === 'rows') {
      audit.rowMsgs++;
      // R3, checked again on this side: nothing past the requested month while the player plays
      const bad = !G.over && ((m.rows || []).some((r) => r[0] > G.upTo) || (m.marks || []).some((k) => k[0] >= G.upTo));
      if (bad) { audit.violations++; return; }
      for (const r of m.rows || []) G.rows[m.arch].push(r);
      for (const k of m.marks || []) G.marks[m.arch].push(k);
      if (m.over) G.escaped[m.arch] = m.over;
      if (G.state === 'computing') G.state = 'live';
      bus.emit('ghosts:update', { key: G.key });
      return;
    }
    if (m.t === 'done') { if (!G.over) return; G.ends[m.arch] = m.end; maybeDone(); return; }
    if (m.t === 'error') {
      if (m.arch) { G.errors[m.arch] = m.code; if (m.code === 'no_policies') G.state = 'unavailable'; }
      else { G.state = 'unavailable'; }
      console.warn('[ghosts]', m.arch || '-', m.code, m.msg || '');
      bus.emit('ghosts:state', { state: G.state });
      maybeDone();
    }
  } finally { const dt = performance.now() - t0; audit.perf.push(dt); if (audit.perf.length > 400) audit.perf.shift(); }
}
function maybeDone() {
  if (!G || !G.over) return;
  const left = ARCH_IDS.filter((a) => !G.ends[a] && !G.errors[a]);
  if (left.length) return;
  const ok = ARCH_IDS.filter((a) => G.ends[a]);
  if (ok.length && G.cacheKey && ok.length === ARCH_IDS.length) cacheWrite(G.cacheKey, G.ends);
  G.state = ok.length ? 'done' : 'unavailable';
  bus.emit('ghosts:done', { key: G.key, ends: { ...G.ends } });
}

/* ---------------------------------------------------------------- no-Worker fallback: idle callbacks, end screen visible only */
let idle = null;
function stopIdle() { if (idle) { idle.stop = true; idle = null; } }
async function startIdle() {
  if (!G || idle) return;
  const my = (idle = { stop: false }); const g0 = G;
  let mod; try { mod = await import('./ghost-worker.js'); } catch (e) { g0.state = 'unavailable'; bus.emit('ghosts:state', { state: g0.state }); return; }
  if (!pol) pol = await mod.loadPolicies();
  if (my.stop || G !== g0) return;
  if (!pol) { g0.state = 'unavailable'; bus.emit('ghosts:state', { state: g0.state }); return; }
  g0.cacheKey = g0.key + '|' + (pol.v ?? 0);
  const set = new mod.GhostSet({ key: g0.key, cfg: g0.cfg, pol, post: onMsg });
  set.finish(g0.cap);
  const ric = globalThis.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 25, didTimeout: false }), 16));
  const visible = () => { try { const s = document.getElementById('start'); return !document.hidden && (!s || !s.hidden); } catch (e) { return true; } };
  const tick = (dl) => {
    if (my.stop || G !== g0) return;
    if (visible() && dl.timeRemaining() > 20) { if (!set.step()) { idle = null; return; } }
    ric(tick, { timeout: 1000 });
  };
  ric(tick, { timeout: 1000 });
}

/* ---------------------------------------------------------------- the accessor (R3) */
/**
 * What the UI may show at the player's month. During play every series is clamped (rows m ≤ month, marks m < month,
 * escapes at m ≤ month); a cached full game is clamped the same way. After the game (st.over) → ends() instead.
 * → {state, ghosts:{arch:{rows, marks, escaped, error}}}
 */
export function view(month) {
  if (!G) return { state: 'off', ghosts: {} };
  const out = {}; const mo = month | 0;
  for (const a of ARCH_IDS) {
    let rows = G.rows[a] || [], marks = G.marks[a] || [], esc = G.escaped[a] || null;
    const end = G.ends[a];
    if (end && end.tl && G.mode === 'cache') { rows = end.tl.m.map((m, i) => [m, end.tl.nw[i], end.tl.liq[i], end.tl.debt[i], end.tl.pas[i], end.tl.exp[i], end.tl.pg[i], end.tl.hap[i], end.tl.en[i]]); marks = end.marks || []; esc = end.status && end.status !== 'capped' ? { m: end.months, status: end.status } : null; }
    out[a] = { rows: rows.filter((r) => r[0] <= mo), marks: marks.filter((k) => k[0] < mo), escaped: esc && esc.m <= mo ? esc : null, error: G.errors[a] || null };
  }
  const state = G.state === 'cached' ? 'live' : G.state;
  return { state, ghosts: out };
}
/** finished ghost results, only once the player's game is over */
export function ends() { return G && G.over ? { ...G.ends } : null; }
export function status() { return G ? { state: G.state, mode: G.mode, over: G.over, key: G.key, upTo: G.upTo, errors: { ...G.errors } } : { state: 'off' }; }
export function audited() { const p = audit.perf.slice().sort((a, b) => a - b); return { ...audit, perf: undefined, n: p.length, p95: p.length ? p[Math.floor(0.95 * (p.length - 1))] : 0, max: p.length ? p[p.length - 1] : 0 }; }
export { audited as audit, onMsg as _msg };   // _msg: Node tests feed protocol messages
if (typeof window !== 'undefined') window.__rrGhosts = { view, status, audit: audited, ends };
