// Pure verification logic for the verify-result Edge Function (no I/O; unit-tested in Node: tests/verify.test.mjs).
// E = the engine module namespace (loaded from the pinned bundle). row = the server-side result row as index.ts selects it.

export const MAX_ACTIONS = 6000;          // a 60-month game is ~300–700 actions; generous cap keeps replay < 1 s CPU
export const MAX_BUNDLE = 900000;         // chars — an optional pinned engine bundle in the request (bootstrap / tests)
export const MAX_BODY = 1000000;           // chars — normal calls are ~5–20 KB (the action log)
const CODES = new Set(['r', 'l', 'c', 'L', 'R', 'C', 'P', 'A', 'I', 'S', 'T', 'F', 'H', 'M']); // = the cases of engine.js replay()
/** Israel date (YYYY-MM-DD) of the first day the v4 engine is live. Set at release. Earlier ranked games replay with rules 3. */
export const RULES4_FROM = '2026-12-01';
/** YYYY-MM-DD from a date-ish key ('2026-11-30', '20261130', a Date) or null. */
function isoDay(v) {
  if (v == null) return null;
  if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
  const m = /(\d{4})-?(\d{2})-?(\d{2})/.exec(String(v)); return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
/** Legacy games (daily/weekly/challenge started before RULES4_FROM) replay with the pre-T2 rules. */
export function rulesFor(row) {
  const day = isoDay(row.daily_key) || isoDay(row.weekly_start) || isoDay(row.challenge_day); // see index.ts ROW
  return day && day < RULES4_FROM ? 3 : 4;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class VerifyError extends Error { constructor(code, status = 400) { super(code); this.code = code; this.status = status; } }

/** Validate the request body → {id, secret, resultId, actions|null}. */
export function parseRequest(body) {
  if (!body || typeof body !== 'object') throw new VerifyError('bad_request');
  const id = body.id ?? body.p_id; const secret = body.secret ?? body.p_secret; const resultId = body.result_id ?? body.resultId;
  if (typeof id !== 'string' || !UUID.test(id)) throw new VerifyError('unauthorized', 401);
  if (typeof secret !== 'string' || secret.length < 8 || secret.length > 200) throw new VerifyError('unauthorized', 401);
  if (typeof resultId !== 'string' || !UUID.test(resultId)) throw new VerifyError('result_not_found', 404);
  const actions = body.actions == null ? null : validateActions(body.actions);
  return { id, secret, resultId, actions };
}

/** The action log must be the engine's compact format: [code, ...primitive args]. Throws bad_actions. */
export function validateActions(a) {
  if (!Array.isArray(a) || a.length === 0 || a.length > MAX_ACTIONS) throw new VerifyError('bad_actions');
  for (const x of a) {
    if (!Array.isArray(x) || x.length < 1 || x.length > 3 || !CODES.has(x[0])) throw new VerifyError('bad_actions');
    for (let i = 1; i < x.length; i++) {
      const v = x[i];
      if (v === null || typeof v === 'boolean') continue;
      if (typeof v === 'number' ? !Number.isFinite(v) : typeof v !== 'string' || v.length > 40) throw new VerifyError('bad_actions');
    }
  }
  return a;
}

/** Daily/weekly character exactly as js/lobby.js dailyChar(): index into world.daily.chars (fallback all characters). */
export function dailyCharId(world, i) {
  const list = (world.daily && world.daily.chars) || world.characters.map((c) => c.id);
  const id = list[(((+i || 0) % list.length) + list.length) % list.length];
  return (world.characters.find((c) => c.id === id) || world.characters[0]).id;
}

/** Replay config for a ranked result row — every field comes from the SERVER, never from the client. */
export function configFor(E, row) {
  if (!['daily', 'weekly', 'challenge'].includes(row.mode)) throw new VerifyError('unsupported_mode', 422);
  let world; try { world = E.getWorld(row.world); } catch (e) { world = null; }
  if (!world || world.id !== row.world) throw new VerifyError('bad_world', 422);
  let charId;
  const prof = String(row.profession || '');
  if (prof.startsWith('idx:')) charId = dailyCharId(world, parseInt(prof.slice(4), 10));
  else if (world.characters.some((c) => c.id === prof)) charId = prof;
  else throw new VerifyError('bad_char', 422);
  const seed = Number(row.seed);
  if (!Number.isFinite(seed)) throw new VerifyError('bad_seed', 422);
  const cfg = { worldId: world.id, charId, seed, mode: row.mode, tutorial: false, bailout: false, mentor: 'hint', rules: rulesFor(row) };
  if (row.max_months != null) cfg.maxMonths = +row.max_months;
  return cfg;
}

/** Same normalisation as net.finish() applies before rr_finish (so an honest claim compares equal). */
export function normalize(r) {
  return { status: r.status, months: Math.max(1, Math.min(200, Math.round(r.months))), passive: Math.round(r.passive),
    expenses: Math.max(0, Math.round(r.expenses)), netWorth: Math.round(r.netWorth) };
}

/** The client's claim as stored by rr_finish. */
export function claimOf(row) {
  return { status: row.status, months: row.months, passive: row.passive, expenses: row.expenses, netWorth: row.net_worth,
    stars: row.claim_stars == null ? null : +row.claim_stars, progress: row.claim_progress == null ? null : +row.claim_progress };
}

/**
 * Re-run the game and compare with the claim.
 * → {ok:true, result} or {ok:false, error, result|null, diff}
 * result = the SERVER's numbers {status, months, passive, expenses, netWorth, stars, progress, reason, turns, actions}
 */
export function verifyGame(E, row, actions) {
  const cfg = configFor(E, row);
  let st;
  try { st = E.replay(cfg, actions); }
  catch (e) { return { ok: false, error: 'replay:' + String(e && e.message || e).slice(0, 300), result: null, diff: null, cfg }; }
  if (!st.over || !st.result) return { ok: false, error: 'replay:not_over', result: null, diff: null, cfg };
  const end = st.result;
  const result = { ...normalize(end), stars: end.stars || 0, progress: end.progress ?? null, reason: end.reason || null, turns: st.turn, actions: actions.length };
  const claim = claimOf(row);
  const diff = {};
  for (const k of ['status', 'months', 'passive', 'expenses', 'netWorth']) if (claim[k] !== result[k]) diff[k] = [claim[k], result[k]];
  if (claim.stars != null && claim.stars !== result.stars) diff.stars = [claim.stars, result.stars];
  if (claim.progress != null && result.progress != null && Math.abs(claim.progress - result.progress) > 0.006) diff.progress = [claim.progress, result.progress];
  if (Object.keys(diff).length) return { ok: false, error: 'claim_mismatch:' + Object.keys(diff).join(','), result, diff, cfg };
  return { ok: true, result, diff: null, cfg };
}

export async function sha256Hex(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Browser engine family from the User-Agent (only for triaging cross-engine float differences; nothing else is stored). */
export function clientEngine(ua) {
  ua = String(ua || '');
  if (/Firefox\//.test(ua)) return 'spidermonkey';
  if (/(Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(ua)) return 'v8';
  if (/Safari\//.test(ua) || /AppleWebKit/.test(ua)) return 'jsc';
  return 'other';
}
