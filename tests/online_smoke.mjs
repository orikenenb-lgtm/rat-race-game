#!/usr/bin/env node
// Release smoke test of live rooms (docs/full-upgrade/ONLINE_RELEASE.md §5): two identities play the real path end to end over HTTP —
// health → create → join → ready ×2 → start (Edge) → roll ×2 → duplicate action_id (replayed) → stale state_version (409) → tick →
// heartbeat → cancel by vote (2/2) → seed revealed → rr_my_rooms → wrong secret 401 → CORS preflight. Prints the latency of every
// step (the first Edge call is the cold start: engine load).
//   node tests/online_smoke.mjs                                   → its own fake backend (python3 tests/fakebackend.py --serve 11695)
//   node tests/online_smoke.mjs --target=http://127.0.0.1:8779    → an already running fake
//   RR_SMOKE_URL=https://<ref>.supabase.co RR_SMOKE_ANON=<publishable key> node tests/online_smoke.mjs --live      (staging)
//   … + RR_SMOKE_CONFIRM=production for the production project (OWNER APPROVAL: it registers 2 players named טסט-חדר-*, and
//     leaves one cancelled room; set RR_SMOKE_P1 / RR_SMOKE_P2 = '{"id":…,"secret":…}' to reuse two existing test players instead).
// The room is casual, 2 seats, 10 rounds, cancelled at the end: nothing is ranked, no board row, no game.results row.
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const LIVE = process.argv.includes('--live');
const PROD_REF = /SB_PROD = 'https:\/\/([a-z0-9]+)\.supabase\.co'/.exec(readFileSync(join(HERE, 'fakebackend.py'), 'utf8'))[1];
const { ENGINE_SHA256 } = await import(join(ROOT, 'supabase', 'functions', 'verify-result', 'engine_pin.js'));
let TARGET = arg('target', null), KEY = 'fake-anon', child = null;
if (LIVE) {
  const m = /^https:\/\/([a-z0-9]{8,40})\.supabase\.co\/?$/.exec(process.env.RR_SMOKE_URL || '');
  if (!m || !process.env.RR_SMOKE_ANON) { console.error('REFUSED --live: needs RR_SMOKE_URL=https://<ref>.supabase.co and RR_SMOKE_ANON'); process.exit(2); }
  if (m[1] === PROD_REF && process.env.RR_SMOKE_CONFIRM !== 'production') { console.error('REFUSED: this is the PRODUCTION project — set RR_SMOKE_CONFIRM=production only with the owner\'s approval'); process.exit(2); }
  TARGET = process.env.RR_SMOKE_URL.replace(/\/$/, ''); KEY = process.env.RR_SMOKE_ANON;
} else if (!TARGET) {
  const port = +arg('port', '11695');
  child = spawn('python3', [join(HERE, 'fakebackend.py'), '--serve', String(port)], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  process.on('exit', () => child && child.kill());
  TARGET = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) { try { if ((await fetch(TARGET + '/__fake/health')).ok) break; } catch (e) { /* not up yet */ } await sleep(100); }
}
const FAKE = !LIVE;
let pass = 0, fail = 0; const times = [];
const check = (name, ok, ev) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + JSON.stringify(ev).slice(0, 300)}`); return ok; };
async function timed(label, fn) { const t0 = performance.now(); const r = await fn(); const ms = Math.round(performance.now() - t0); times.push([label, ms]); return r; }
const H = { apikey: KEY, 'Content-Type': 'application/json' };
async function rpc(fn, args = {}) {
  const r = await fetch(`${TARGET}/rest/v1/rpc/${fn}`, { method: 'POST', headers: H, body: JSON.stringify(args) });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, body: j, code: r.ok ? null : j?.message ?? j?.code };
}
async function fn(p, op, room, extra = {}) {
  const r = await fetch(`${TARGET}/functions/v1/room`, { method: 'POST', headers: H, body: JSON.stringify({ ...extra, op, id: p.id, secret: p.secret, room }) });
  const j = await r.json().catch(() => null);
  return { status: r.status, ok: r.ok, body: j, code: r.ok ? null : j?.error };
}
const au = (p) => ({ p_id: p.id, p_secret: p.secret });
const uuid = () => crypto.randomUUID();
const tag = Math.floor(Math.random() * 9000 + 1000);
const player = async (env, nick) => (process.env[env] ? JSON.parse(process.env[env]) : (await rpc('rr_register2', { p_nickname: nick, p_ref: null })).body);

console.log(`online smoke · target=${FAKE ? 'fake ' : 'LIVE '}${TARGET}`);
try {
  // 0. health (GET loads nothing) — the deployed function must pin the engine this checkout pins
  const h = await timed('GET health', () => fetch(`${TARGET}/functions/v1/room`, { headers: { apikey: KEY } }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) })));
  if (FAKE && h.status === 404) console.log('SKIP  health (the fake has no GET route)');
  else check('room function health: engine pin = this checkout', h.status === 200 && h.body && h.body.engine === ENGINE_SHA256, h);
  if (!FAKE) {
    const o = await fetch(`${TARGET}/functions/v1/room`, { method: 'OPTIONS', headers: { Origin: 'https://example.org', 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'apikey,content-type' } });
    const ah = (o.headers.get('access-control-allow-headers') || '').toLowerCase();
    check('CORS preflight allows apikey + content-type', o.status < 300 && ah.includes('apikey') && ah.includes('content-type'), { status: o.status, ah });
  }
  const A = await player('RR_SMOKE_P1', `טסט-חדר-A-${tag}`); const B = await player('RR_SMOKE_P2', `טסט-חדר-B-${tag}`);
  check('two identities', !!(A && A.id && B && B.id), { A, B });

  let r = await timed('rr_room_create', () => rpc('rr_room_create', { ...au(A), p_settings: { world: 'w1', mode: 'casual', help: 'hint', turn_secs: 60, max_rounds: 10, max_seats: 2 }, p_group: null }));
  check('create → {room_id, code}', r.ok && /^[A-Z2-9]{6}$/.test(r.body?.code || ''), r);
  const room = r.body.room_id, code = r.body.code;
  r = await timed('rr_room_join', () => rpc('rr_room_join', { ...au(B), p_code: code.toLowerCase() }));
  check('join by code (any case) → seat 1', r.ok && r.body.seat === 1 && r.body.rejoined === false, r);
  r = await rpc('rr_room_join', { ...au(B), p_code: 'ZZZZZ2' }); check('unknown code → 400 room_not_found', r.status === 400 && r.code === 'room_not_found', r);
  r = await fn(A, 'start', room); check('start before ready → 409 not_ready', r.status === 409 && r.code === 'not_ready', r);
  for (const p of [A, B]) { r = await timed('rr_room_ready', () => rpc('rr_room_ready', { ...au(p), p_room: room, p_ready: true, p_char: null })); check('ready', r.ok, r); }

  r = await timed('Edge start (cold?)', () => fn(A, 'start', room));
  check('start → round 1 with a deadline', r.ok && r.body.round === 1 && Number.isFinite(r.body.deadline), r);
  let sA = (await timed('rr_room_state', () => rpc('rr_room_state', { ...au(A), p_room: room, p_since: null }))).body;
  check('state: my view, no seed while playing, opponents without view/state', !!(sA?.me?.view?.state) && sA.room.seed == null && sA.room.status === 'playing'
    && sA.seats.every((s) => !('view' in s) && !('state' in s)), sA && { room: sA.room, seats: sA.seats });
  check('state: deadline is server ms in the future', sA.room.deadline > sA.room.now, sA.room);

  const id = uuid();
  r = await timed('Edge act r', () => fn(A, 'act', room, { action_id: id, state_version: sA.me.state_version, code: 'r', args: [] }));
  check('A rolls → state_version +1, a view', r.ok && r.body.state_version === sA.me.state_version + 1 && !!r.body.view, r);
  const sv = r.body.state_version;
  r = await timed('Edge act (duplicate)', () => fn(A, 'act', room, { action_id: id, state_version: sA.me.state_version, code: 'r', args: [] }));
  check('same action_id again → replayed, nothing applied twice', r.ok && r.body.replayed === true && r.body.current_state_version === sv, r);
  r = await fn(A, 'act', room, { action_id: uuid(), state_version: sA.me.state_version, code: 'H', args: [] });
  check('old state_version → 409 stale + current view', r.status === 409 && r.code === 'stale' && r.body.state_version === sv && !!r.body.view, r);
  r = await fn(A, 'act', room, { action_id: uuid(), state_version: sv, code: 'r', args: [] });
  check('second roll in the same round → 409 not_your_roll (or 422 while a card is open)', (r.status === 409 && r.code === 'not_your_roll') || (r.status === 422 && r.code === 'illegal_action'), r);
  const sB = (await rpc('rr_room_state', { ...au(B), p_room: room, p_since: null })).body;
  r = await fn(B, 'act', room, { action_id: uuid(), state_version: sB.me.state_version, code: 'r', args: [] });
  check('B rolls', r.ok, r);
  r = await timed('Edge tick', () => fn(B, 'tick', room)); check('tick (nothing overdue) → 200', r.ok && r.body.status === 'playing', r);
  r = await timed('rr_room_heartbeat', () => rpc('rr_room_heartbeat', { ...au(A), p_room: room, p_conn: 'smoke-' + tag + '-tab1' }));
  check('heartbeat → primary, server now', r.ok && r.body.primary === true && Number.isFinite(r.body.now), r);
  r = await rpc('rr_room_state', { ...au(A), p_room: room, p_since: 1e15 }); check('poll with p_since ≥ version → unchanged', r.ok && r.body.unchanged === true, r);
  r = await fn({ id: A.id, secret: 'wrong-secret-000' }, 'tick', room); check('wrong secret → 401 unauthorized', r.status === 401 && r.code === 'unauthorized', r);
  r = await fn(A, 'tick', uuid()); check('foreign room → 403 not_in_room', r.status === 403 && r.code === 'not_in_room', r);

  r = await rpc('rr_room_cancel', { ...au(A), p_room: room }); check('cancel vote 1/2 → still playing', r.ok && r.body.status === 'playing' && r.body.votes === 1, r);
  r = await rpc('rr_room_cancel', { ...au(B), p_room: room }); check('cancel vote 2/2 → cancelled', r.ok && r.body.status === 'cancelled', r);
  sA = (await rpc('rr_room_state', { ...au(A), p_room: room, p_since: null })).body;
  check('cancelled room: seed revealed, nothing ranked', sA.room.status === 'cancelled' && Number.isFinite(sA.room.seed) && !sA.room.results, sA.room);
  r = await fn(A, 'act', room, { action_id: uuid(), state_version: sv, code: 'H', args: [] }); check('act after cancel → 409 room_not_playing', r.status === 409 && r.code === 'room_not_playing', r);
  r = await rpc('rr_my_rooms', au(A)); check('rr_my_rooms lists it as cancelled', r.ok && r.body.some((x) => x.id === room && x.status === 'cancelled'), r);
} catch (e) { fail++; console.log('FAIL  crashed: ' + (e && e.stack || e)); }
console.log('\nlatency (ms): ' + times.map(([k, v]) => `${k} ${v}`).join(' · '));
console.log(`${pass} passed, ${fail} failed · target=${FAKE ? 'fake' : 'live'}`);
process.exit(fail ? 1 : 0);
