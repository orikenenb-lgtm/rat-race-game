#!/usr/bin/env node
// Live rooms on the LOCAL staging stack (tools/staging: PostgreSQL 17 + PgBouncer + PostgREST + Deno running the real
// supabase/functions/room/index.ts with postgres.js) — the B1 questions of docs/full-upgrade/ONLINE_RELEASE.md that PGlite and the
// fake cannot answer, plus the S1/S2/S5/S6 fixes end to end. Talks HTTP to the gateway like a browser, and psql (RR_LOCAL_DB, the
// owner role) only to look at / age rows. Never a hosted project: RR_LOCAL_URL must be http://127.0.0.1:<port>.
//   tools/staging/setup.sh && tools/staging/start.sh && . /tmp/rr-staging/target.env && node tests/online_local.test.mjs
// Proves: (1) postgres.js binding — jsonb/json columns hold objects (not JSON strings), json state text is byte-faithful and replays
// with the engine, bigint/arrays round-trip; (2) PostgREST error mapping (raise → 400 P0001 {message}; game.auth's 28000 → 403) and
// commit-on-400 (game.room_fail rows persist: the 21st failed code → rate_limited); (3) one transaction per Edge call under
// concurrency through the pool (max 3 per isolate) — parallel acts of one seat: exactly one applies; a burst of 40 mixed calls: no 5xx;
// (4) S1 pin change → 409 then closed; (5) S2 sweep; (6) S5 no rewrite of untouched seats / fresh polls; (7) S6 room_purge.
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..');
const URL_ = (process.env.RR_LOCAL_URL || '').replace(/\/$/, ''); const KEY = process.env.RR_LOCAL_ANON; const DB = process.env.RR_LOCAL_DB;
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(URL_) || !KEY || !/^postgresql:\/\/[^@]+@127\.0\.0\.1:\d+\/postgres$/.test(DB || '')) {
  console.log('SKIP online_local: needs the local staging stack (tools/staging/start.sh, then . /tmp/rr-staging/target.env)'); process.exit(0);
}
const E = await import(join(ROOT, 'js', 'engine.js'));
const C = await import(join(ROOT, 'supabase', 'functions', 'room', 'room_core.js'));
let passed = 0, failed = 0;
const check = (name, ok, ev) => { ok ? passed++ : failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + String(JSON.stringify(ev)).slice(0, 400)}`); return ok; };
const psql = (text) => execFileSync('psql', [DB, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', text], { encoding: 'utf8' }).trim();
const sqlJson = (text) => JSON.parse(psql(`select coalesce(json_agg(t), '[]'::json) from (${text}) t`) || '[]');
const H = { apikey: KEY, 'Content-Type': 'application/json' };
async function rpc(fn, args = {}) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null); return { status: r.status, ok: r.ok, body: j, code: r.ok ? null : j?.message };
}
async function fn(p, op, room, extra = {}) {
  const r = await fetch(`${URL_}/functions/v1/room`, { method: 'POST', headers: H, body: JSON.stringify({ ...extra, op, id: p.id, secret: p.secret, room }) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
const au = (p) => ({ p_id: p.id, p_secret: p.secret });
const tag = Math.floor(Math.random() * 9000 + 1000);
const reg = async (n) => (await rpc('rr_register2', { p_nickname: `טסט-${n}-${tag}`.slice(0, 20), p_ref: null })).body;
const state = async (p, room, since = null) => (await rpc('rr_room_state', { ...au(p), p_room: room, p_since: since })).body;
let AID = 0; const aid = () => `local-${tag}-${++AID}-${Date.now().toString(36)}`;
async function startedRoom(players, settings = { world: 'w1', mode: 'casual', max_rounds: 10, max_seats: 4, turn_secs: 60 }) {
  const [h, ...rest] = players;
  const c = (await rpc('rr_room_create', { ...au(h), p_settings: settings, p_group: null })).body;
  for (const p of rest) await rpc('rr_room_join', { ...au(p), p_code: c.code });
  for (const p of players) await rpc('rr_room_ready', { ...au(p), p_room: c.room_id, p_ready: true, p_char: null });
  const s = await fn(h, 'start', c.room_id); if (s.status !== 200) throw new Error('start failed ' + JSON.stringify(s));
  return c;
}
const ver = (await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY } })).headers.get('server') || '?';
console.log(`online local · ${URL_} · ${ver} · ${psql('select version()').split(' on ')[0]}`);

const [A, B, Cc, D] = [await reg('ל-א'), await reg('ל-ב'), await reg('ל-ג'), await reg('ל-ד')];
// ------------------------------------------------ (1) postgres.js binding: json / jsonb / bigint / arrays
const R1 = await startedRoom([A, B, Cc]);
for (const p of [A, B]) { const s = await state(p, R1.room_id); await fn(p, 'act', R1.room_id, { action_id: aid(), state_version: s.me.state_version, code: 'r', args: [] }); }
const types = sqlJson(`select jsonb_typeof(r.settings) as settings, jsonb_typeof(r.cancel_votes) as votes, jsonb_typeof(r.kicked) as kicked, json_typeof(s.state) as state,
  json_typeof(s.view) as view, jsonb_typeof(s.pub) as pub, jsonb_typeof(s.conns) as conns from game.rooms r join game.room_seats s on s.room_id = r.id where r.id = '${R1.room_id}'`);
check('B1 postgres.js: settings/cancel_votes/kicked/pub/conns are jsonb objects/arrays and state/view json objects — never JSON strings',
  types.length === 3 && types.every((t) => t.settings === 'object' && t.votes === 'array' && t.kicked === 'array' && t.state === 'object' && t.view === 'object' && t.pub === 'object' && t.conns === 'object'), types);
const acts = sqlJson(`select jsonb_typeof(a) as a, jsonb_typeof(response) as resp from game.room_actions where room_id = '${R1.room_id}'`);
check('B1 postgres.js: room_actions.a is a jsonb array, response a jsonb object', acts.length >= 2 && acts.every((x) => x.a === 'array' && x.resp === 'object'), acts);
{
  const room = sqlJson(`select settings, seed, date_key, rules from game.rooms where id = '${R1.room_id}'`)[0];
  const seats = sqlJson(`select seat, char_id, state::text as txt from game.room_seats where room_id = '${R1.room_id}' order by seat`);
  const bad = seats.filter((x) => { const st = JSON.parse(x.txt); return x.txt !== JSON.stringify(st) || E.serialize(E.replay(C.seatConfig({ ...room, seed: Number(room.seed) }, x.char_id), st.actions)) !== x.txt; });
  check('B1 json state: stored text is byte-faithful (JSON.stringify of the engine state) and E.replay(actions) reproduces it for every seat', !bad.length, bad.map((x) => x.seat));
}
{
  const s = await state(A, R1.room_id);
  check('B1 bigint/int through PostgREST: version, seed-free, state_version, deadline, now are JSON numbers', [s.room.version, s.me.state_version, s.room.deadline, s.room.now].every(Number.isFinite) && s.room.seed === null, s.room);
  const v = Number(psql(`select version from game.rooms where id = '${R1.room_id}'`));
  check('B1 bigint read back by the Edge Function (Number(version)) matches the row', v === s.room.version, { v, sv: s.room.version });
}
// ------------------------------------------------ (2) PostgREST error mapping + commit-on-400
{
  let r = await rpc('rr_room_join', { ...au(D), p_code: 'ZZZZZ2' });
  check('PostgREST: room_fail answers HTTP 400 {code:P0001, message:room_not_found} (response.status GUC)', r.status === 400 && r.body?.code === 'P0001' && r.body?.message === 'room_not_found', r);
  r = await rpc('rr_room_create', { ...au(D), p_settings: { world: 'h' }, p_group: null });
  check('PostgREST: raise exception → HTTP 400 {code:P0001, message:bad_settings}', r.status === 400 && r.body?.code === 'P0001' && r.code === 'bad_settings', r);
  r = await rpc('rr_room_state', { p_id: D.id, p_secret: 'wrong-secret-000', p_room: R1.room_id, p_since: null });
  check('PostgREST: game.auth unauthorized (errcode 28000) → HTTP 403 {message:unauthorized} (net.js reads only .message)', r.status === 403 && r.code === 'unauthorized', r);
  const T = await reg('ל-ז');
  for (let i = 0; i < 20; i++) await rpc('rr_room_join', { ...au(T), p_code: 'ZZZZZ' + (2 + (i % 8)) });
  const n = Number(psql(`select count(*) from game.room_join_fails where player_id = '${T.id}'`));
  r = await rpc('rr_room_join', { ...au(T), p_code: R1.code });
  check('commit-on-400: the 20 failed codes were COMMITTED although PostgREST answered 400 → the 21st → rate_limited', n === 20 && r.code === 'rate_limited', { n, r });
}
// ------------------------------------------------ (3) transactions + pool under concurrency
{
  const s = await state(Cc, R1.room_id);
  const both = await Promise.all([0, 1].map(() => fn(Cc, 'act', R1.room_id, { action_id: aid(), state_version: s.me.state_version, code: 'r', args: [] })));
  const st = both.map((x) => x.status).sort();
  check('one transaction per call (room row FOR UPDATE): two parallel rolls of one seat at the same version → one 200, one 409 stale/not_your_roll', st[0] === 200 && st[1] === 409, both.map((x) => [x.status, x.body?.error]));
  const sv = Number(psql(`select state_version from game.room_seats where room_id = '${R1.room_id}' and seat = 2`));
  check('…and the seat advanced exactly once', sv === s.me.state_version + 1, { sv, from: s.me.state_version });
  const burst = []; const ps = [A, B, Cc];
  for (let i = 0; i < 40; i++) { const p = ps[i % 3]; burst.push(i % 4 === 0 ? fn(p, 'tick', R1.room_id) : i % 4 === 1 ? rpc('rr_room_heartbeat', { ...au(p), p_room: R1.room_id, p_conn: `tab-${tag}-${i % 3}x` }).then((x) => ({ status: x.status })) : i % 4 === 2 ? rpc('rr_room_state', { ...au(p), p_room: R1.room_id, p_since: null }).then((x) => ({ status: x.status })) : fn(p, 'act', R1.room_id, { action_id: aid(), state_version: 0, code: 'L', args: [] })); }
  const res = await Promise.all(burst); const codes = res.map((x) => x.status);
  check('pool (max 3 per isolate, through ' + (process.env.RR_EDGE_DB || 'the configured DB URL') + '): 40 concurrent mixed calls → no 5xx, only 200 / 409', codes.every((c) => c === 200 || c === 409), codes.join(','));
}
// ------------------------------------------------ (4) S1: the engine pin changes under a playing room
{
  const R = await startedRoom([A, D]);
  psql(`update game.rooms set engine_sha = repeat('b', 64) where id = '${R.room_id}'`);           // = the room was started by an older deploy
  const s = await state(A, R.room_id);
  let r = await fn(A, 'act', R.room_id, { action_id: aid(), state_version: s.me.state_version, code: 'r', args: [] });
  check('S1: 409 version_changed (closes_in) — the old state is not run with this engine', r.status === 409 && r.body.error === 'version_changed' && r.body.closes_in > 0, r.body);
  check('S1: the first sighting is stored (rooms.pin_mismatch_at) even on the error answer', psql(`select pin_mismatch_at is not null from game.rooms where id = '${R.room_id}'`) === 't');
  psql(`update game.rooms set pin_mismatch_at = now() - interval '3 minutes' where id = '${R.room_id}'`);   // the 2-minute grace passed
  r = await fn(D, 'tick', R.room_id);
  check('S1: after the grace the next tick closes the room → 200 applied:1 status cancelled', r.status === 200 && r.body.applied === 1 && r.body.status === 'cancelled', r.body);
  const t = await state(A, R.room_id);
  check('S1: cancelled · end_reason version_changed · unranked · seed revealed', t.room.status === 'cancelled' && t.room.end_reason === 'version_changed' && !t.room.results && Number.isFinite(t.room.seed), t.room);
}
// ------------------------------------------------ (5) S2: stale lobby swept by SQL
{
  const L = (await rpc('rr_room_create', { ...au(B), p_settings: {}, p_group: null })).body;
  psql(`update game.rooms set last_activity = now() - interval '3 hours' where id = '${L.room_id}'`);
  const r = await rpc('rr_my_rooms', au(D));
  check('S2: any rr_my_rooms (POST, now VOLATILE: PostgREST runs it read-write) sweeps the stale lobby', r.ok && psql(`select status || '/' || end_reason from game.rooms where id = '${L.room_id}'`) === 'cancelled/expired', r);
  const j = await rpc('rr_room_join', { ...au(D), p_code: L.code }); check('S2: the expired code → room_not_found', j.code === 'room_not_found', j);
}
// ------------------------------------------------ (6) S5: untouched seats and fresh polls are not rewritten
{
  const R = await startedRoom([B, Cc, D]);
  const xmin = () => Object.fromEntries(sqlJson(`select seat, xmin::text as x from game.room_seats where room_id = '${R.room_id}'`).map((x) => [x.seat, x.x]));
  const s = await state(B, R.room_id); const x0 = xmin();
  const r = await fn(B, 'act', R.room_id, { action_id: aid(), state_version: s.me.state_version, code: 'r', args: [] });
  const x1 = xmin();
  check('S5: an act rewrites only the acting seat (other seats keep their row version)', r.status === 200 && x1[0] !== x0[0] && x1[1] === x0[1] && x1[2] === x0[2], { x0, x1 });
  psql(`update game.room_seats set last_seen = now() - interval '2 seconds' where room_id = '${R.room_id}'`);
  const x2 = xmin(); const v = (await state(Cc, R.room_id)).room.version;
  for (let i = 0; i < 6; i++) await rpc('rr_room_state', { ...au(Cc), p_room: R.room_id, p_since: i % 2 ? v : null });
  check('S5: six polls with a fresh last_seen write nothing (no row version change)', JSON.stringify(xmin()) === JSON.stringify(x2), { x2, now: xmin() });
}
// ------------------------------------------------ (7) S6: retention
{
  const R = (await rpc('rr_room_create', { ...au(A), p_settings: {}, p_group: null })).body;
  await rpc('rr_room_cancel', { ...au(A), p_room: R.room_id });
  psql(`update game.rooms set finished_at = now() - interval '45 days' where id = '${R.room_id}'`);
  const out = JSON.parse(psql(`select game.room_purge(30)`));
  check('S6: game.room_purge(30) (as the owner) deletes the room that ended 45 days ago with its seats/events', out.rooms >= 1 && psql(`select count(*) from game.rooms where id = '${R.room_id}'`) === '0' && psql(`select count(*) from game.room_events where room_id = '${R.room_id}'`) === '0', out);
  const r = await fetch(`${URL_}/rest/v1/rpc/room_purge`, { method: 'POST', headers: { ...H, 'Content-Profile': 'game' }, body: '{}' });
  check('S6: room_purge is not reachable through REST', !r.ok, r.status);
}
console.log(`\n${passed} passed, ${failed} failed · local staging ${URL_}`);
process.exit(failed ? 1 : 0);
