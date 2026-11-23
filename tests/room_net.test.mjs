#!/usr/bin/env node
// Multi-identity NETWORK test of live rooms, groups v2 and competitions (BRIEF §30: "a test on a shared JavaScript object is not a
// network proof"). 2–4 separate identities, each with its own credentials, talk to the fake backend over HTTP only
// (python3 tests/fakebackend.py --serve → PostgREST-like /rest/v1/rpc/rr_* + the Edge Function /functions/v1/room, whose rooms run
// in tests/fakeroom.mjs with room_core.js + the pinned engine). No identity ever touches another's object or the server state.
//   node tests/room_net.test.mjs [--port=8791] [--target=http://127.0.0.1:8791]
// Covers §30: room + join, permissions, start, turn, out of turn, double click, parallel actions, duplicate message, stale state,
// disconnect + return, host leaves, timeout, finish once, forged result, foreign user, revoked invite, closed competition.
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { botIntent, prng } from './lib/room_bot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
let TARGET = arg('target', null); let child = null;
if (!TARGET) {
  const port = +arg('port', '8791');
  child = spawn('python3', [join(HERE, 'fakebackend.py'), '--serve', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  TARGET = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) { try { if ((await fetch(TARGET + '/__fake/health')).ok) break; } catch (e) { /* not up */ } await sleep(100); }
  process.on('exit', () => child && child.kill());
}
let passed = 0, failed = 0;
const check = (name, ok, ev) => { if (ok) { passed++; console.log(`PASS  ${name}`); } else { failed++; console.log(`FAIL  ${name}  ${String(JSON.stringify(ev)).slice(0, 400)}`); } };
const advance = (seconds) => fetch(TARGET + '/__fake/advance', { method: 'POST', body: JSON.stringify({ seconds }) });
let AID = 0;

/** One player = one identity = its own credentials; every call is an HTTP request. */
class Client {
  constructor(name) { this.name = name; this.cred = null; this.r = prng(name.length * 977 + name.charCodeAt(0)); }
  async rpc(fn, args = {}) {
    const res = await fetch(`${TARGET}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: 'fake-anon', 'Content-Type': 'application/json' }, body: JSON.stringify(this.cred ? { p_id: this.cred.id, p_secret: this.cred.secret, ...args } : args) });
    const body = await res.json().catch(() => null); return { status: res.status, ok: res.ok, body, code: res.ok ? null : body?.message };
  }
  async fn(op, room, extra = {}) {
    const res = await fetch(`${TARGET}/functions/v1/room`, { method: 'POST', headers: { apikey: 'fake-anon', 'Content-Type': 'application/json' }, body: JSON.stringify({ op, id: this.cred.id, secret: this.cred.secret, room, ...extra }) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  async register() { const r = await this.rpc('rr_register2', { p_nickname: this.name, p_ref: null }); this.cred = r.body; return this; }
  state(room, since = null) { return this.rpc('rr_room_state', { p_room: room, p_since: since }); }
  act(room, code, args = [], o = {}) { return this.fn('act', room, { action_id: o.action_id || `n-${this.name.length}-${++AID}-${Date.now().toString(36)}`, state_version: o.state_version, code, args, ...(o.extra || {}) }); }
  /** play intents until this seat is done for the round (or the room ends). */
  async playRound(room, policy = 'pass') {
    for (let n = 0; n < 60; n++) {
      const s = (await this.state(room)).body; if (!s || !s.room || s.room.status !== 'playing') return s;
      const me = s.me; if (!me || !me.view) return s;
      const it = botIntent(me, policy, this.r); if (!it) return s;
      let r = await this.act(room, it.code, it.args, { state_version: me.state_version });
      if (r.status === 422 && it.code !== 'c') r = await this.act(room, 'r', [], { state_version: me.state_version });
      if (r.status === 429) await advance(61);
    }
    return (await this.state(room)).body;
  }
}

const tag = Math.floor(Math.random() * 9000 + 1000);
const [A, B, Cc, D, X] = await Promise.all(['טסט-חדר-א', 'טסט-חדר-ב', 'טסט-חדר-ג', 'טסט-חדר-ד', 'טסט-זר'].map((n) => new Client(`${n}${tag}`.slice(0, 20)).register()));
console.log(`room network test · ${TARGET} · identities ${[A, B, Cc, D, X].map((c) => c.cred.id.slice(0, 8)).join(' ')}`);

/* ------------------------------------------------ room + join + permissions + start */
let r = await A.rpc('rr_room_create', { p_settings: { world: 'w1', max_rounds: 12, end: 'all', turn_secs: 60 }, p_group: null });
const ROOM = r.body?.room_id; const CODE = r.body?.code;
check('create → {room_id, code}', r.ok && /^[A-Z2-9]{6}$/.test(CODE || '') && !!ROOM, r);
r = await A.rpc('rr_room_create', { p_settings: { world: 'w9' }, p_group: null }); check('bad settings → bad_settings', r.code === 'bad_settings', r);
r = await B.rpc('rr_room_join', { p_code: 'ZZZZZ9' }); check('unknown code → room_not_found', r.code === 'room_not_found', r);
r = await B.rpc('rr_room_join', { p_code: "' or 1=1" }); check('injection-ish code → room_not_found', r.code === 'room_not_found', r);
r = await B.rpc('rr_room_join', { p_code: CODE.toLowerCase() }); check('join by code (case-insensitive) → seat 1', r.ok && r.body.seat === 1, r);
r = await Cc.rpc('rr_room_join', { p_code: CODE }); check('third identity joins → seat 2', r.ok && r.body.seat === 2, r);
r = await X.state(ROOM); check('foreign user cannot read the room → not_in_room', r.code === 'not_in_room', r);
r = await X.fn('act', ROOM, { action_id: 'x-00000001', state_version: 0, code: 'r', args: [] }); check('foreign user cannot act → 403 not_in_room', r.status === 403 && r.body.error === 'not_in_room', r);
r = await X.rpc('rr_room_kick', { p_room: ROOM, p_seat: 1 }); check('foreign user cannot kick', r.code === 'not_in_room', r);
r = await B.rpc('rr_room_kick', { p_room: ROOM, p_seat: 2 }); check('non-host cannot kick → not_host', r.code === 'not_host', r);
r = await B.fn('start', ROOM); check('non-host cannot start → 403 not_host', r.status === 403 && r.body.error === 'not_host', r);
r = await A.fn('start', ROOM); check('start before everyone is ready → 409 not_ready', r.status === 409 && r.body.error === 'not_ready', r);
for (const c of [A, B, Cc]) await c.rpc('rr_room_ready', { p_room: ROOM, p_ready: true, p_char: null });
r = await A.fn('start', { bad: 1 }); check('start with a malformed room id → 403', r.status === 403, r);
r = await A.fn('start', ROOM); check('host starts → round 1 with a deadline', r.status === 200 && r.body.round === 1 && !!r.body.deadline, r);
r = await D.rpc('rr_room_join', { p_code: CODE }); check('joining a started room → room_not_found (no oracle)', r.code === 'room_not_found', r);
const sA = (await A.state(ROOM)).body; const sB = (await B.state(ROOM)).body;
check('each identity gets ITS OWN seat + view; the seed is hidden; opponents see public progress only',
  sA.me.seat === 0 && sB.me.seat === 1 && sA.room.seed === null && !JSON.stringify(sA).includes('"rng"') && sA.seats.every((s) => !('view' in s) && !('state' in s)) && !!sA.me.view.state, { a: sA.me.seat, b: sB.me.seat, seed: sA.room.seed });

/* ------------------------------------------------ turn, out of turn, double click, parallel, duplicate, stale */
const v0 = sA.me.state_version;
const id1 = 'dbl-click-0001';
const [d1, d2] = await Promise.all([A.act(ROOM, 'r', [], { action_id: id1, state_version: v0 }), A.act(ROOM, 'r', [], { action_id: id1, state_version: v0 })]);
const applied = [d1, d2].filter((x) => x.status === 200 && !x.body.replayed).length;
check('double click (same action_id twice, concurrently) → applied once', applied === 1 && [d1, d2].every((x) => x.status === 200) && (await A.state(ROOM)).body.me.state_version === v0 + 1, [d1.body?.replayed, d2.body?.replayed]);
r = await A.act(ROOM, 'r', [], { action_id: id1, state_version: v0 }); check('duplicate message later → stored response (replayed:true), nothing applied', r.status === 200 && r.body.replayed === true && r.body.current_state_version === v0 + 1, r.body);
r = await A.act(ROOM, 'r', [], { state_version: v0 + 1 }); check('out of turn: a second roll in the same round → 409 not_your_roll', r.status === 409 && r.body.error === 'not_your_roll', r.body);
r = await A.act(ROOM, 'c', ['pass'], { state_version: v0 }); check('stale state version → 409 stale + current view', r.status === 409 && r.body.error === 'stale' && r.body.state_version === v0 + 1 && !!r.body.view, { s: r.status, e: r.body?.error });
const vB = (await B.state(ROOM)).body.me.state_version;
const [p1, p2] = await Promise.all([B.act(ROOM, 'L', [], { state_version: vB }), B.act(ROOM, 'r', [], { state_version: vB })]);
check('parallel actions from two tabs of one identity (different intents, same version) → exactly one applies, the other 409 stale',
  [p1, p2].filter((x) => x.status === 200).length === 1 && [p1, p2].filter((x) => x.status === 409 && x.body.error === 'stale').length === 1, [p1.status, p2.status]);
r = await B.fn('act', ROOM, { action_id: 'forge-0000001', state_version: (await B.state(ROOM)).body.me.state_version, code: 'X', args: [] }); check('forged intent code (retire) → 400 bad_action', r.status === 400 && r.body.error === 'bad_action', r.body);
r = await B.fn('act', ROOM, { action_id: 'forge-0000002', state_version: (await B.state(ROOM)).body.me.state_version, code: 'L', args: [{ cash: 1e9 }] }); check('forged argument object → 400 bad_action', r.status === 400, r.body);
const before = (await B.state(ROOM)).body.me.view.state.cash;
r = await B.fn('act', ROOM, { action_id: 'forge-0000003', state_version: (await B.state(ROOM)).body.me.state_version, code: 'L', args: [], cash: 99999999, result: { status: 'won' }, seat: 0 });
const after = (await B.state(ROOM)).body;
check('forged result fields in the body are ignored (cash/result/seat come from the server only)', r.status === 200 && after.me.seat === 1 && after.me.view.state.cash < before + 1e6 && !after.me.view.state.over, { cash: after.me.view.state.cash });
r = await fetch(`${TARGET}/functions/v1/room`, { method: 'POST', body: JSON.stringify({ op: 'act', id: A.cred.id, secret: A.cred.secret, room: ROOM, pad: 'x'.repeat(9000) }) });
check('body > 8 KB → 413', r.status === 413, r.status);
r = await A.fn('act', ROOM, { secret: 'wrong-secret-123' }); r = await fetch(`${TARGET}/functions/v1/room`, { method: 'POST', body: JSON.stringify({ op: 'act', id: A.cred.id, secret: 'wrong-secret-123', room: ROOM }) });
check('wrong secret → 401', r.status === 401, r.status);

/* ------------------------------------------------ disconnect + return; host leaves; timeout */
// A had rolled (dbl click); C goes "offline": its last intent's response is lost, it reconnects and resends the same action_id
const sC = (await Cc.state(ROOM)).body; const lost = 'lost-resp-0001';
await Cc.act(ROOM, 'r', [], { action_id: lost, state_version: sC.me.state_version });
const back = (await Cc.state(ROOM)).body; r = await Cc.act(ROOM, 'r', [], { action_id: lost, state_version: sC.me.state_version });
check('disconnect + return: snapshot shows the applied roll; resending the same action_id applies nothing twice', back.me.state_version === sC.me.state_version + 1 && r.body.replayed === true, { v: back.me.state_version, rep: r.body?.replayed });
r = await Cc.rpc('rr_room_heartbeat', { p_room: ROOM, p_conn: 'tab-new-00001' }); check('heartbeat → {version, state_version, deadline, now, needs_tick, primary}', r.ok && typeof r.body.now === 'number' && r.body.primary === true, r.body);
await A.playRound(ROOM); await B.playRound(ROOM); await Cc.playRound(ROOM);
r = await A.rpc('rr_room_leave', { p_room: ROOM }); check('host leaves mid-game → forfeit for the host only', r.ok && r.body.forfeit === true, r.body);
r = await B.state(ROOM); check('the room goes on without the host (server is the source of truth)', r.body.room.status === 'playing' && r.body.seats.find((s) => s.seat === 0).status === 'forfeit', r.body?.room?.status);
await B.fn('tick', ROOM);
await B.playRound(ROOM);                                    // B plays; C does nothing in this round → timeout
const sT = (await B.state(ROOM)).body; const rnd = sT.room.round; const cDone = sT.seats.find((s) => s.seat === 2).done;
r = await B.fn('tick', ROOM); check('no timeout before the deadline', r.status === 200 && r.body.applied === 0, r.body);
await advance(200);
r = await B.fn('tick', ROOM); const afterT = (await Cc.state(ROOM)).body;
check('timeout: the next tick plays the idle seat with the safe autopilot and closes the round', !cDone && r.status === 200 && r.body.applied >= 1 && afterT.room.round === rnd + 1 && afterT.events.some((e) => e.kind === 'autopilot' && e.data.seat === 2), { rnd, cDone, body: r.body, ev: afterT.events.slice(-12).map((e) => [e.round, e.kind, e.data.seat, e.data.why].join(':')) });

/* ------------------------------------------------ finish exactly once */
for (let k = 0; k < 40; k++) {
  const s = (await B.state(ROOM)).body; if (s.room.status !== 'playing') break;
  await B.playRound(ROOM, 'greedy'); await Cc.playRound(ROOM, 'random');
  const t = (await B.state(ROOM)).body; if (t.room.status === 'playing' && t.room.round === s.room.round) { await advance(200); await Cc.fn('tick', ROOM); }
}
const fin = await Promise.all([A, B, Cc].map((c) => c.state(ROOM)));
const res0 = JSON.stringify(fin[0].body.room.results);
check('finish: one result table, identical in every identity\'s snapshot; the seed is revealed', fin.every((x) => x.body.room.status === 'finished' && JSON.stringify(x.body.room.results) === res0) && fin[1].body.room.seed > 0, fin.map((x) => x.body.room.status));
check('ranks are server-computed; the forfeited host ranks last', JSON.parse(res0).find((x) => x.seat === 0).forfeit === true && JSON.parse(res0).find((x) => x.seat === 0).rank === 3, res0);
r = await B.act(ROOM, 'r', [], { state_version: fin[1].body.me.state_version }); check('acting after the finish → 409 room_not_playing', r.status === 409 && r.body.error === 'room_not_playing', r.body);
await advance(3 * 3600); await B.fn('tick', ROOM); await Cc.fn('tick', ROOM);
check('finish exactly once: later ticks change nothing', JSON.stringify((await Cc.state(ROOM)).body.room.results) === res0);

/* ------------------------------------------------ groups v2: revoked invite, removal, permissions by id */
r = await A.rpc('rr_create_group', { p_name: `טסט רשת ${tag}` }); const G = r.body;
await B.rpc('rr_join_group', { p_code: G.code }); await Cc.rpc('rr_join_group', { p_code: G.code });
let grp = (await A.rpc('rr_group', { p_group: G.id })).body;
check('group v2: members carry role + opaque handle, never a player id', grp.members.every((m) => ['owner', 'admin', 'member'].includes(m.role) && /^[0-9a-f-]{36}$/.test(m.handle)) && !JSON.stringify(grp).includes(B.cred.id), grp.members);
const hB = grp.members.find((m) => m.nickname === B.name).handle; const hC = grp.members.find((m) => m.nickname === Cc.name).handle;
r = await B.rpc('rr_group_remove', { p_group: G.id, p_member: hC }); check('a member cannot remove another member → not_allowed', r.code === 'not_allowed', r);
r = await X.rpc('rr_group_remove', { p_group: G.id, p_member: hC }); check('a foreign user cannot touch the group → not_member', r.code === 'not_member', r);
r = await A.rpc('rr_group_set_role', { p_group: G.id, p_member: hB, p_role: 'admin' }); check('owner makes B admin', r.ok && r.body.my_role === 'owner', r);
r = await B.rpc('rr_group_remove', { p_group: G.id, p_member: hC }); check('admin removes a member', r.ok, r);
r = await Cc.rpc('rr_join_group', { p_code: G.code }); check('a removed member cannot rejoin with the same code (answers like an unknown code)', r.code === 'group_not_found', r);
r = await B.rpc('rr_group_rotate_code', { p_group: G.id }); const NEW = r.body?.code; check('admin rotates the invite code', r.ok && NEW && NEW !== G.code, r);
r = await D.rpc('rr_join_group', { p_code: G.code }); check('revoked (rotated) invite code → group_not_found', r.code === 'group_not_found', r);
r = await D.rpc('rr_join_group', { p_code: NEW }); check('the new code works', r.ok, r);
// a group-private room: a removed / foreign player cannot join it
r = await A.rpc('rr_room_create', { p_settings: { privacy: 'group' }, p_group: G.id }); const GR = r.body;
r = await X.rpc('rr_room_join', { p_code: GR.code }); check('group room: a non-member cannot join → not_member', r.code === 'not_member', r);
r = await D.rpc('rr_room_join', { p_code: GR.code }); check('group room: a member joins', r.ok, r);

/* ------------------------------------------------ competitions: closed, cancelled */
const now = (await A.state(GR.room_id)).body.room.now;     // the fake's clock (advanced above), not this machine's
r = await A.rpc('rr_create_competition', { p_group: G.id, p_title: `טסט תחרות ${tag}`, p_world: 'w1', p_char: 'teacher', p_starts_at: new Date(now).toISOString(), p_ends_at: new Date(now + 2 * 3600e3).toISOString(), p_rules: { attempts: 2 } });
const COMP = r.body; check('create competition (2 attempts)', r.ok && COMP.status === 'open' && COMP.rules.attempts === 2, r);
r = await D.rpc('rr_begin', { p_mode: 'challenge', p_challenge: COMP.id }); check('begin attempt 1 (old rr_begin keeps working)', r.ok && r.body.attempt === 1, r);
r = await D.rpc('rr_begin_attempt', { p_challenge: COMP.id }); check('second attempt while the first is open → attempt_open', r.code === 'attempt_open', r);
r = await X.rpc('rr_competition', { p_challenge: COMP.id }); check('foreign user cannot read a competition → not_member', r.code === 'not_member', r);
r = await A.rpc('rr_create_competition', { p_group: G.id, p_title: `טסט בוטל ${tag}`, p_world: 'w2', p_char: 'chef', p_starts_at: new Date(now).toISOString(), p_ends_at: new Date(now + 5 * 3600e3).toISOString(), p_rules: null });
const CX = r.body; r = await D.rpc('rr_cancel_competition', { p_challenge: CX.id }); check('a plain member cannot cancel someone else\'s competition', r.code === 'not_allowed', r);
r = await B.rpc('rr_cancel_competition', { p_challenge: CX.id }); check('an admin cancels it; the board is kept', r.ok && r.body.status === 'cancelled' && Array.isArray(r.body.board), r);
r = await D.rpc('rr_begin', { p_mode: 'challenge', p_challenge: CX.id }); check('begin on a cancelled competition → challenge_cancelled', r.code === 'challenge_cancelled', r);
await advance(3 * 3600);
r = await B.rpc('rr_begin', { p_mode: 'challenge', p_challenge: COMP.id }); check('begin on a closed competition → challenge_closed', r.code === 'challenge_closed', r);
r = await A.rpc('rr_competition', { p_challenge: COMP.id }); check('closed competition board: an unfinished attempt is shown as unfinished, not ranked', r.ok && r.body.status === 'closed' && r.body.board.some((x) => x.flag === 'unfinished' && x.rank === null), r.body?.board);

console.log(`\n${passed} passed, ${failed} failed`);
if (child) child.kill();
process.exit(failed ? 1 : 0);
