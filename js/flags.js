// UI-layer feature flags. NEVER imported by engine.js or anything it imports (that would change the verify pin).
// Sources, low → high: DEFAULTS < localStorage['rr2-flags'] (JSON object) < URL ?ff= (comma list: name:value, bare name = true,
// -name = false). Values outside ALLOWED are ignored, corrupt JSON is ignored. Nothing is read at import time (Node tests).
// Director decision (after the T6 verification): rivals, rewind, recap2 and afterwin are ON by default; the flags stay the rollback
// switch (rr2-flags / ?ff=-name). rewind and afterwin remain practice-only in ranked games (PRACTICE_ONLY / flagFor below).
// Wave 3b: `rooms` = live rooms + groups v2 + competitions UI (server drafts NOT applied in production) — OFF by default; ?ff=rooms to try.
export const DEFAULTS = Object.freeze({ board2d: 'auto', recover: true, rivals: true, rewind: true, recap2: true, afterwin: true, rooms: false });
const ALLOWED = { board2d: ['auto', 'on', 'off'], recover: [true, false], rivals: [true, false], rewind: [true, false], recap2: [true, false], afterwin: [true, false], rooms: [true, false] };
const KEY = 'rr2-flags';
let F = null;
let SRC = null; // test override: {search, storage}

function norm(name, v) {
  const al = ALLOWED[name]; if (!al) return undefined;
  if (typeof al[0] === 'boolean') {
    if (v === true || v === 'true' || v === '1' || v === 'on') return true;
    if (v === false || v === 'false' || v === '0' || v === 'off') return false;
    return undefined;
  }
  return al.includes(v) ? v : undefined;
}
function readStorage() {
  try {
    const s = SRC ? SRC.storage : globalThis.localStorage;
    if (s == null) return null;
    const raw = typeof s === 'string' ? s : s.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    return o && typeof o === 'object' && !Array.isArray(o) ? o : null;
  } catch (e) { return null; }
}
function readSearch() {
  try { return SRC ? (SRC.search || '') : (globalThis.location ? globalThis.location.search : ''); } catch (e) { return ''; }
}
function load() {
  const f = { ...DEFAULTS };
  const st = readStorage();
  if (st) for (const k of Object.keys(DEFAULTS)) { const v = norm(k, st[k]); if (v !== undefined) f[k] = v; }
  try {
    const ff = new URLSearchParams(readSearch()).get('ff') || '';
    for (const tok of ff.split(',').map((t) => t.trim()).filter(Boolean)) {
      const neg = tok.startsWith('-');
      const [k, raw] = tok.replace(/^-/, '').split(':');
      if (!(k in DEFAULTS)) continue;
      const v = norm(k, neg ? false : raw === undefined ? true : raw);
      if (v !== undefined) f[k] = v;
    }
  } catch (e) { /* ignore */ }
  return f;
}
/** Value of a flag (loaded lazily, once per page). */
export function flag(name) { if (!F) F = load(); return F[name]; }
/** Copy of every flag (debugging and tests). */
export function allFlags() { if (!F) F = load(); return { ...F }; }
/** Node tests: re-read from {search, storage} (storage = object with getItem, or the raw JSON string). */
export function _resetForTests(src = {}) { SRC = src; F = null; }

/** T6 §8.1: practice-only features are off in every ranked game, whatever ?ff= or rr2-flags say. */
export const PRACTICE_ONLY = new Set(['rewind', 'afterwin']);
export const RANKED_MODES = new Set(['daily', 'weekly', 'challenge']);
/** A ranked config: a daily / weekly / group challenge, or anything that carries a server result id. */
export function isRankedCfg(cfg) { return !!(cfg && (RANKED_MODES.has(cfg.mode) || cfg.resultId)); }
/** flag(name) for a game config: PRACTICE_ONLY flags are forced false for ranked configs. */
export function flagFor(name, cfg) { if (PRACTICE_ONLY.has(name) && isRankedCfg(cfg)) return false; return flag(name); }
