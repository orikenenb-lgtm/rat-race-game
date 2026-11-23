// room — the Edge Function of live rooms (BRIEF §21–§23, design O1 §3–§4). NOT DEPLOYED: needs owner approval
// (deploy with verify_jwt = false — players have no Supabase auth session; the function authenticates them itself, like verify-result).
//
// POST {op:'start', id, secret, room}                                   host; every seat ready → one engine game per seat, round 1
// POST {op:'act',   id, secret, room, action_id, state_version, code, args, engine?}   one intent of the caller's seat
// POST {op:'tick',  id, secret, room}                                   any member; applies overdue timeouts (idempotent)
//   200 {ok:true, …} · 400 bad_json|bad_op|bad_action · 401 unauthorized · 403 not_in_room|not_host · 409 stale{state_version,view} |
//   not_your_roll | room_not_playing | room_started | not_ready | not_enough_players | seat_finished | action_id_reused · 413 too_big ·
//   409 version_changed (the pin changed under a running room) · 422 illegal_action{msg} · 426 version_mismatch{engine} ·
//   429 rate_limited · 503 engine_unavailable · 500 server_error
// The cheap calls (create / join / ready / leave / state / heartbeat …) are SQL RPCs: supabase/migrations/20261124_rooms.sql.
//
// Order per request (§22): body size → shape → game.auth FIRST (before any engine work) → per-isolate throttle → engine (pinned) →
// ONE transaction: room row FOR UPDATE (every writer, SQL RPCs included, serialises on it) → idempotency lookup → room_core →
// write back → commit. The engine is the exact pinned client engine (verify-result/engine_pin.js), deployed WITH the function
// (engine.bundle.json is imported statically; its SHA-256 is re-checked before anything is executed). Requests can never supply
// engine code. The seed and full engine states never leave this function except as redacted views.
import postgres from 'npm:postgres@3.4.5';
import { ENGINE_SHA256 } from '../verify-result/engine_pin.js';
import { loadEngine } from '../verify-result/engine_loader.js';
import bundle from '../verify-result/engine.bundle.json' with { type: 'json' };
import * as C from './room_core.js';
import { loadRoom, saveRoom, priorAction, recentRate } from './room_store.js';

const MAX_BODY = 8192;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CORS = {
  'Access-Control-Allow-Origin': '*',          // no cookies / ambient credentials: auth is the secret in the body
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Max-Age': '86400',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
class HttpError extends Error { constructor(public code: string, public status: number) { super(code); } }

// ---------------------------------------------------------------- database
let sqlConn: ReturnType<typeof postgres> | null = null;
const db = () => (sqlConn ??= postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3, idle_timeout: 20, connect_timeout: 10 }));
const pgMsg = (e: unknown) => String((e as any)?.message ?? '');

// ---------------------------------------------------------------- engine (pinned, deployed with the function, cached per isolate)
let engineMod: any = null;
async function sha256Hex(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function engine() {
  if (engineMod) return engineMod;
  const text = JSON.stringify(bundle);                    // = tools/build-edge.mjs bundleText() (key order preserved by JSON.parse)
  if (await sha256Hex(text) !== ENGINE_SHA256) throw new HttpError('engine_unavailable', 503);   // never execute unpinned code
  engineMod = await loadEngine(text);
  return engineMod;
}

// ---------------------------------------------------------------- per-player throttle (per isolate; the core also caps 120 intents/seat/min)
const recent = new Map<string, number[]>();
function throttle(id: string) {
  const now = Date.now(); const l = (recent.get(id) ?? []).filter((t) => now - t < 60_000);
  if (l.length >= 240) throw new HttpError('rate_limited', 429);
  l.push(now); recent.set(id, l); if (recent.size > 10000) recent.clear();
}

async function handle(body: any) {
  if (!body || typeof body !== 'object') throw new HttpError('bad_json', 400);
  const { op, id, secret, room } = body;
  if (typeof id !== 'string' || !UUID.test(id) || typeof secret !== 'string' || secret.length < 8 || secret.length > 200) throw new HttpError('unauthorized', 401);
  if (!['start', 'act', 'tick'].includes(op)) throw new HttpError('bad_op', 400);
  if (typeof room !== 'string' || !UUID.test(room)) throw new HttpError('not_in_room', 403);
  const sql = db();
  try { await sql`select game.auth(${id}::uuid, ${secret})`; }                          // 1. identity first
  catch (e) { if (pgMsg(e) === 'unauthorized') throw new HttpError('unauthorized', 401); throw e; }
  throttle(id);
  const E = await engine();                                                             // 2. engine (503: not the player's fault)
  const intent = op === 'act' ? { action_id: body.action_id, state_version: body.state_version, code: body.code, args: body.args ?? [], engine: body.engine } : {};
  // 3. one transaction, the room row locked
  return await sql.begin(async (tx: any) => {
    const q = (text: string, params: unknown[] = []) => tx.unsafe(text, params as any[]);
    const [{ now }] = await q('select game.ms(now()) as now');                          // the DB clock = the clock of the SQL RPCs
    const r = await loadRoom(q, room, { lock: true });
    if (!r) throw new HttpError('not_in_room', 403);
    const me = r.seats.find((s: any) => s.player_id === id);
    if (!me) throw new HttpError('not_in_room', 403);
    // a deploy changed the pinned engine while this room was playing: never continue old states with another engine.
    // The room can still be cancelled by vote (rr_room_cancel, SQL only) or ends as abandoned after 2 h (ranked as-is by an old-pin
    // deploy, never by this one). Deploy at quiet times (docs/full-upgrade/ONLINE.md §release).
    if (r.status === 'playing' && r.engine_sha && r.engine_sha !== ENGINE_SHA256 && op !== 'start') {
      return { status: 409, body: { ok: false, error: 'version_changed', engine: r.engine_sha }, actions: [] };
    }
    const ctx: Record<string, unknown> = { engine_sha: ENGINE_SHA256 };
    if (op === 'act' && typeof intent.action_id === 'string' && intent.action_id.length <= 64) {
      ctx.prior = await priorAction(q, room, me.seat, intent.action_id);
      me.rate = await recentRate(q, room, me.seat, Number(now));
    }
    const v0 = r.version; const before = { next_event: r.next_event };
    const res = C.dispatch(E, r, op, { id, nickname: me.nickname, pawn: me.pawn }, intent, Number(now), ctx);
    if (r.version !== v0 || res.actions.length) await saveRoom(q, r, before, res.actions);
    console.log(JSON.stringify({ room, op, code: intent.code ?? null, status: res.status, error: res.body?.error ?? null, rows: res.actions.length }));
    return res;
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  try {
    if (req.method === 'GET') return json(200, { ok: true, engine: ENGINE_SHA256, engineLoaded: !!engineMod, core: C.CORE_VERSION });   // health: loads nothing
    if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
    if (+(req.headers.get('content-length') ?? 0) > MAX_BODY) return json(413, { ok: false, error: 'too_big' });
    const text = await req.text();
    if (new TextEncoder().encode(text).length > MAX_BODY) return json(413, { ok: false, error: 'too_big' });
    let body: unknown; try { body = JSON.parse(text); } catch (_e) { return json(400, { ok: false, error: 'bad_json' }); }
    const res = await handle(body);
    return json(res.status ?? 500, res.body);
  } catch (e) {
    if (e instanceof HttpError) return json(e.status, { ok: false, error: e.code });
    console.error('room failed', String((e as Error)?.stack || e));
    return json(500, { ok: false, error: 'server_error' });
  }
});
