#!/usr/bin/env node
// Moderation + in-room chat over HTTP (draft supabase/migrations/20261126_admin_mod_chat.sql) — separate identities, every call a
// request. Two targets, the same cases:
//   node tests/admin_chat_contract.mjs                       → the offline fake (python3 tests/fakebackend.py --serve; rooms + chat in
//                                                              tests/fakeroom.mjs = room_core.js + chat_rules.js + the pinned engine)
//   . <staging>/target.env && node tests/admin_chat_contract.mjs --live --local   → the LOCAL staging stack (tools/staging: real
//                                                              PostgreSQL 17 + PostgREST + the Edge Function `room` under Deno). The
//                                                              owner is made admin with psql (RR_LOCAL_DB); the DB clock moves with
//                                                              RR_LOCAL_CLOCK (start.sh RR_STAGING_FAKETIME=1).
// Covers: non-admin denied on every admin RPC; ban / unban rules; a banned player cannot create / join rooms, join / create groups or
// chat, is off the daily board and sees rr_ban_status; ban sweeps an open lobby; host kick in the lobby only; admin kick in the lobby
// and MID-GAME (the room plays on: the others roll, the round closes, the kicked seat is a forfeit); admin close; chat members only;
// every row of tests/chat_cases.mjs through rr_room_chat_send (refused → never listed); rate limits (5 / 10 s incl. refusals, 60 / h);
// report → admin reports → hide → gone for players; admin room chat; remove from a group; mod log; append-only through the API.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { botIntent, prng } from './lib/room_bot.mjs';
import { CASES } from './chat_cases.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const LOCAL = process.argv.includes('--local');
let TARGET = arg('target', null), KEY = 'fake-anon', child = null;
if (LOCAL) {
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/?$/.test(process.env.RR_LOCAL_URL || '') || !process.env.RR_LOCAL_ANON || !process.env.RR_LOCAL_DB) {
    console.error('REFUSED --local: needs RR_LOCAL_URL=http://127.0.0.1:<port>, RR_LOCAL_ANON, RR_LOCAL_DB (. <staging dir>/target.env)'); process.exit(2);
  }
  TARGET = process.env.RR_LOCAL_URL.replace(/\/$/, ''); KEY = process.env.RR_LOCAL_ANON;
} else if (process.argv.includes('--live')) { console.error('REFUSED --live without --local: this suite never runs against a hosted project'); process.exit(2); }
if (!TARGET) {
  const port = +arg('port', '8795');
  child = spawn('python3', [join(HERE, 'fakebackend.py'), '--serve', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
  TARGET = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) { try { if ((await fetch(TARGET + '/__fake/health')).ok) break; } catch (e) { /* not up */ } await sleep(100); }
  process.on('exit', () => child && child.kill());
}
let passed = 0, failed = 0;
const check = (name, ok, ev) => { if (ok) { passed++; console.log(`PASS  ${name}`); } else { failed++; console.log(`FAIL  ${name}  ${String(JSON.stringify(ev)).slice(0, 400)}`); } };
const psql = (sql) => execFileSync('psql', [process.env.RR_LOCAL_DB, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
/** move the server clock forward (fake: /__fake/advance · local: the libfaketime offset file, re-read every second) */
async function advance(seconds) {
  if (!LOCAL) { await fetch(TARGET + '/__fake/advance', { method: 'POST', body: JSON.stringify({ seconds }) }); return true; }
  const f = process.env.RR_LOCAL_CLOCK; if (!f) return false;
  const cur = parseInt(readFileSync(f, 'utf8').trim() || '+0', 10) || 0; writeFileSync(f, `+${cur + Math.ceil(seconds)}\n`); await sleep(1300); return true;
}
/** let a 10-second rate window pass: the fake's clock moves at once; on the local stack real time passes (a moved libfaketime clock is
 *  picked up by each pooled PostgreSQL backend on its own schedule — seen: ~10 calls on the old time — so short windows use real time) */
const pass10s = () => (LOCAL ? sleep(10500) : advance(11));
let AID = 0;
class Client {
  constructor(name) { this.name = name; this.cred = null; this.r = prng(name.length * 977 + name.charCodeAt(0)); }
  async rpc(fn, args = {}) {
    const res = await fetch(`${TARGET}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(this.cred ? { p_id: this.cred.id, p_secret: this.cred.secret, ...args } : args) });
    const body = await res.json().catch(() => null); return { status: res.status, ok: res.ok, body, code: res.ok ? null : body?.message };
  }
  async fn(op, room, extra = {}) {
    const res = await fetch(`${TARGET}/functions/v1/room`, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ op, id: this.cred.id, secret: this.cred.secret, room, ...extra }) });
    return { status: res.status, body: await res.json().catch(() => null) };
  }
  async register() { const r = await this.rpc('rr_register2', { p_nickname: this.name, p_ref: null }); this.cred = r.body; return this; }
  get id() { return this.cred.id; }
  state(room) { return this.rpc('rr_room_state', { p_room: room, p_since: null }); }
  send(room, text) { return this.rpc('rr_room_chat_send', { p_room: room, p_text: text }); }
  act(room, code, args, sv) { return this.fn('act', room, { action_id: `ac-${this.name.length}-${++AID}-${Date.now().toString(36)}`, state_version: sv, code, args }); }
  async playRound(room) {
    for (let n = 0; n < 60; n++) {
      const s = (await this.state(room)).body; if (!s || !s.room || s.room.status !== 'playing') return s;
      const me = s.me; if (!me || !me.view) return s;
      const it = botIntent(me, 'pass', this.r); if (!it) return s;
      let r = await this.act(room, it.code, it.args, me.state_version);
      if (r.status === 422 && it.code !== 'c') r = await this.act(room, 'r', [], me.state_version);
      if (r.status === 429) await advance(61);
    }
    return (await this.state(room)).body;
  }
}
const tag = Math.floor(Math.random() * 9000 + 1000);
const names = ['טסט-מנהל', 'טסט-א', 'טסט-ב', 'טסט-ג', 'טסט-ד', 'טסט-ה', 'טסט-ו', 'טסט-ז', 'טסט-ח'];
const [ADM, A, B, C, D, E, P1, P2, P3] = await Promise.all(names.map((n) => new Client(`${n}${tag}`.slice(0, 20)).register()));
console.log(`admin + chat contract · ${LOCAL ? 'LOCAL staging' : 'fake'} ${TARGET}`);
if (LOCAL) psql(`insert into game.admins (player_id) values ('${ADM.id}') on conflict do nothing`);
else { const r = await ADM.rpc('rr_admin_claim', { p_code: 'TEST-ADMN-CODE' }); if (!r.ok) { console.error('the fake refused the admin code', r); process.exit(1); } }
check('setup: the owner is admin (rr_admin_status)', (await ADM.rpc('rr_admin_status')).body?.admin === true);
const S = { world: 'w1', max_rounds: 12, end: 'all', turn_secs: 60 };
const mkRoom = async (host, ...others) => {
  const r = (await host.rpc('rr_room_create', { p_settings: S, p_group: null })).body;
  for (const o of others) await o.rpc('rr_room_join', { p_code: r.code });
  return r;
};
let r;

/* ------------------------------------------------ non-admin denied */
const R0 = await mkRoom(B, C);
const M0 = (await B.send(R0.room_id, 'שלום לכולם')).body?.id;
check('chat send by a member → {id, at}', Number.isInteger(M0), M0);
const G0 = (await B.rpc('rr_create_group', { p_name: `טסט קבוצה ${tag}` })).body;
const adminCalls = [['rr_admin_ban', { p_target: C.id, p_reason: 'טסט', p_days: 1 }], ['rr_admin_unban', { p_target: C.id }], ['rr_admin_bans', {}], ['rr_admin_player', { p_target: C.id }],
  ['rr_admin_rooms', {}], ['rr_admin_room_chat', { p_room: R0.room_id }], ['rr_admin_kick_room', { p_room: R0.room_id, p_target: C.id }], ['rr_admin_close_room', { p_room: R0.room_id }],
  ['rr_admin_remove_from_group', { p_group: G0.id, p_target: B.id }], ['rr_admin_delete_chat', { p_msg: M0 }], ['rr_admin_reports', {}], ['rr_admin_mod_log', { p_before: null }]];
const denied = [];
for (const [fn, a] of adminCalls) { const x = await A.rpc(fn, a); if (x.code !== 'not_admin') denied.push([fn, x.status, x.code]); }
check(`a normal player gets not_admin from all ${adminCalls.length} admin RPCs`, !denied.length, denied);
check('…and nothing changed (room still open, message still listed, no ban)', (await B.state(R0.room_id)).body?.room?.status === 'lobby'
  && (await C.rpc('rr_room_chat_list', { p_room: R0.room_id, p_since: null })).body?.msgs?.length === 1 && (await C.rpc('rr_ban_status')).body?.banned === false);
r = await A.rpc('rr_admin_ban', { p_id: A.id, p_secret: 'not-the-secret', p_target: C.id, p_reason: 'טסט', p_days: 1 });
check('a wrong secret → unauthorized', r.code === 'unauthorized', r);

/* ------------------------------------------------ ban rules */
r = await ADM.rpc('rr_admin_ban', { p_target: ADM.id, p_reason: 'טסט', p_days: 1 }); check('the admin can never ban himself → cannot_ban_self', r.code === 'cannot_ban_self', r);
r = await ADM.rpc('rr_admin_ban', { p_target: A.id, p_reason: 'x', p_days: 1 }); check('reason < 2 chars → bad_reason', r.code === 'bad_reason', r);
r = await ADM.rpc('rr_admin_ban', { p_target: A.id, p_reason: 'טסט', p_days: 0 }); check('days 0 → bad_days', r.code === 'bad_days', r);
r = await ADM.rpc('rr_admin_ban', { p_target: '00000000-0000-4000-8000-000000000000', p_reason: 'טסט', p_days: 1 }); check('unknown player → player_not_found', r.code === 'player_not_found', r);
r = await ADM.rpc('rr_admin_unban', { p_target: A.id }); check('unban of a player who is not banned → not_banned', r.code === 'not_banned', r);

/* ------------------------------------------------ banned behaviour (+ the sweep of an open lobby) */
const RA = await mkRoom(D, A);                                         // A sits in D's lobby
await A.rpc('rr_daily'); const begin = (await A.rpc('rr_begin', { p_mode: 'daily', p_challenge: null })).body;
r = await A.rpc('rr_finish', { p_result: begin?.result_id, p_status: 'lost', p_months: 24, p_passive: 1000, p_expenses: 4000, p_net_worth: 5000, p_stats: { progress: 0.25 } });
const onBoard = async () => ((await E.rpc('rr_daily')).body?.board || []).some((x) => x.nickname === A.name);
check('before the ban: the player is on the daily board', await onBoard(), (await E.rpc('rr_daily')).body);
const serverNow = (await D.state(RA.room_id)).body.room.now;           // the server's clock (the local stack's may be moved)
r = await ADM.rpc('rr_admin_ban', { p_target: A.id, p_reason: 'טסט: שיתף טלפון בצ\'אט', p_days: 3 });
check('ban (3 days) → {banned, until ≈ +3 days, rooms: 1}', r.ok && r.body.banned === true && r.body.rooms === 1 && Math.abs(r.body.until - serverNow - 3 * 86400e3) < 600e3, r);
let st = (await A.rpc('rr_ban_status')).body; check('rr_ban_status → banned, not permanent, until', st?.banned === true && st.permanent === false && st.until > serverNow, st);
check('the ban took A out of the open lobby (the seat is free)', !((await D.state(RA.room_id)).body?.seats || []).some((s) => s.nickname === A.name));
r = await A.rpc('rr_room_create', { p_settings: S, p_group: null }); check('banned: create a room → banned', r.code === 'banned', r);
r = await A.rpc('rr_room_join', { p_code: R0.code }); check('banned: join a room → banned', r.code === 'banned', r);
r = await A.rpc('rr_room_join', { p_code: RA.code }); check('banned: back into the swept lobby → room_not_found (kicked, no oracle)', r.code === 'room_not_found', r);
r = await A.rpc('rr_join_group', { p_code: G0.code }); check('banned: join a group → banned', r.code === 'banned', r);
r = await A.rpc('rr_create_group', { p_name: 'קבוצה של מושעה' }); check('banned: create a group → banned', r.code === 'banned', r);
check('banned: off the daily board (for everyone)', !(await onBoard()));
const bans = (await ADM.rpc('rr_admin_bans')).body || [];
check('rr_admin_bans lists him with the reason', bans.some((b) => b.player_id === A.id && b.reason.includes('שיתף טלפון') && b.nickname === A.name), bans);
r = await ADM.rpc('rr_admin_ban', { p_target: A.id, p_reason: 'טסט: לצמיתות', p_days: null });
check('re-ban as permanent → until null', r.ok && r.body.until === null, r);
check('rr_ban_status → permanent', (await A.rpc('rr_ban_status')).body?.permanent === true);
const pv = (await ADM.rpc('rr_admin_player', { p_target: A.id })).body;
check('rr_admin_player: ban, groups, rooms, counts', pv && pv.ban && pv.ban.until === null && Array.isArray(pv.groups) && Array.isArray(pv.rooms) && pv.nickname === A.name, pv);
r = await ADM.rpc('rr_admin_unban', { p_target: A.id }); check('unban → {banned: false}', r.ok && r.body.banned === false, r);
check('after unban: join a room again', (await A.rpc('rr_room_join', { p_code: R0.code })).ok);
check('after unban: back on the daily board', await onBoard());
check('after unban: chat again', (await A.send(R0.room_id, 'חזרתי 🙂')).ok);

/* ------------------------------------------------ chat: members only, the whole case table, rate limits */
r = await E.send(R0.room_id, 'אני זר'); check('chat: a stranger → not_in_room', r.code === 'not_in_room', r);
r = await E.rpc('rr_room_chat_list', { p_room: R0.room_id, p_since: null }); check('chat list: a stranger → not_in_room', r.code === 'not_in_room', r);
const RC = await mkRoom(C, D);
const wrong = []; let sent = 0, refused = 0;
for (let i = 0; i < CASES.length; i++) {                  // C and D take turns: 4 rows per player per 10 s window, < 60 per hour each
  if (i && i % 8 === 0) await pass10s();
  const [text, want] = CASES[i];
  const x = await (i % 2 ? D : C).send(RC.room_id, text);
  const got = x.ok ? null : x.code; if (x.ok) sent++; else refused++;
  if (got !== want) wrong.push([text.slice(0, 30), want, got, x.status]);
}
check(`every row of tests/chat_cases.mjs (${CASES.length}) through rr_room_chat_send → the expected answer (${sent} sent, ${refused} refused)`, !wrong.length, wrong);
const listed = (await D.rpc('rr_room_chat_list', { p_room: RC.room_id, p_since: null })).body?.msgs || [];
check('refused messages are never listed (only ok rows, the last 40)', listed.length === Math.min(40, sent) && listed.every((m) => CASES.some(([t, w]) => w === null && t.trim() === m.text)), listed.length);
await pass10s();
r = await C.send(RC.room_id, 'www.x.com'); check('a refused message answers HTTP 400 with the code in .message (PostgREST shape)', r.status === 400 && r.code === 'chat_link', r);
const burst = [];
for (let i = 0; i < 6; i++) burst.push((await D.send(RC.room_id, `הודעה ${i}`)).code);
check('rate: 5 per 10 s, the 6th → rate_limited', JSON.stringify(burst) === JSON.stringify([null, null, null, null, null, 'rate_limited']), burst);
await pass10s();
const burst2 = [await D.send(RC.room_id, 'www.a.com'), await D.send(RC.room_id, 'www.b.com'), await D.send(RC.room_id, 'ok 1'), await D.send(RC.room_id, 'ok 2'), await D.send(RC.room_id, 'ok 3'), await D.send(RC.room_id, 'ok 4')].map((x) => x.code);
check('rate: refusals count toward the 5 / 10 s', JSON.stringify(burst2) === JSON.stringify(['chat_link', 'chat_link', null, null, null, 'rate_limited']), burst2);
await pass10s();
check('rate: the window moves on (10 s later the player can write again)', (await D.send(RC.room_id, 'שוב')).ok);
const sinceList = (await C.rpc('rr_room_chat_list', { p_room: RC.room_id, p_since: listed.length ? listed[listed.length - 1].id : 0 })).body;
check('chat list since → only newer messages; `last` = the newest id', sinceList && sinceList.msgs.every((m) => m.id > (listed.length ? listed[listed.length - 1].id : 0)) && sinceList.last >= Math.max(0, ...sinceList.msgs.map((m) => m.id)), sinceList);

/* ------------------------------------------------ report → admin → hide */
const bad = (await B.send(R0.room_id, 'אתה משחק גרוע')).body.id;
r = await B.rpc('rr_room_chat_report', { p_msg: bad }); check('report your own message → cannot_report_self', r.code === 'cannot_report_self', r);
r = await E.rpc('rr_room_chat_report', { p_msg: bad }); check('report by a stranger → not_in_room', r.code === 'not_in_room', r);
r = await C.rpc('rr_room_chat_report', { p_msg: bad }); check('report by a member → {reported: true}', r.ok && r.body.reported === true, r);
r = await C.rpc('rr_room_chat_report', { p_msg: bad }); check('a second report of the same message is a no-op', r.ok && r.body.reported === true, r);
const rep = (await ADM.rpc('rr_admin_reports')).body;
const row = rep?.reports?.find((x) => x.msg_id === bad);
check('admin reports: the message, its sender, room code, 1 report', row && row.text === 'אתה משחק גרוע' && row.sender === B.name && row.room_code === R0.code && row.reports === 1, rep);
check('admin reports: refusal summary (who tried links / phones …, never the text)', rep?.blocked?.some((x) => x.player_id === C.id && x.n >= 1 && x.reasons.includes('chat_phone')) && !JSON.stringify(rep.blocked.map(({ player_id, ...x }) => x)).includes('054'), rep?.blocked);
r = await ADM.rpc('rr_admin_delete_chat', { p_msg: bad }); check('admin hides the message → {hidden: true}', r.ok && r.body.hidden === true, r);
const after = (await C.rpc('rr_room_chat_list', { p_room: R0.room_id, p_since: null })).body;
check('players: the hidden message is gone, its id is in `hidden`', !after.msgs.some((m) => m.id === bad) && after.hidden.includes(bad), after);
const ac = (await ADM.rpc('rr_admin_room_chat', { p_room: R0.room_id })).body || [];
check('admin room chat: every message incl. the hidden one (flagged, report count, sender id)', ac.some((m) => m.id === bad && m.hidden === true && m.reports === 1 && m.player_id === B.id), ac);

/* ------------------------------------------------ kicks: host (lobby only), admin (lobby + mid-game), close */
const RK = await mkRoom(B, C, D);
const seatOf = async (room, who) => ((await B.state(room)).body.seats.find((s) => s.nickname === who.name) || {}).seat;
r = await B.rpc('rr_room_kick', { p_room: RK.room_id, p_seat: await seatOf(RK.room_id, D) }); check('host kicks in the lobby', r.ok, r);
r = await D.rpc('rr_room_join', { p_code: RK.code }); check('the kicked player cannot come back with the code', r.code === 'room_not_found', r);
r = await ADM.rpc('rr_admin_kick_room', { p_room: RK.room_id, p_target: ADM.id }); check('admin kick of himself → cannot_kick_self', r.code === 'cannot_kick_self', r);
r = await ADM.rpc('rr_admin_kick_room', { p_room: RK.room_id, p_target: E.id }); check('admin kick of someone not in the room → player_not_in_room', r.code === 'player_not_in_room', r);
r = await ADM.rpc('rr_admin_kick_room', { p_room: RK.room_id, p_target: B.id }); check('admin kicks the HOST in a lobby → removed, the host role moves', r.ok && r.body.result === 'removed' && r.body.status === 'lobby', r);
const rk = (await C.state(RK.room_id)).body; check('…C is the host now, B is gone', rk.room.host_seat === rk.seats.find((s) => s.nickname === C.name).seat && !rk.seats.some((s) => s.nickname === B.name), rk.seats);
// mid-game
const RG = await mkRoom(P1, P2, P3);   // fresh players (the cap is 3 open rooms each)
for (const p of [P1, P2, P3]) await p.rpc('rr_room_ready', { p_room: RG.room_id, p_ready: true, p_char: null });
r = await P1.fn('start', RG.room_id); check('a 3-player room starts (round 1)', r.status === 200 && r.body.round === 1, r);
r = await P1.rpc('rr_room_kick', { p_room: RG.room_id, p_seat: 1 }); check('after the start the host cannot kick → room_started', r.code === 'room_started', r);
await P1.send(RG.room_id, 'בהצלחה!');
r = await ADM.rpc('rr_admin_kick_room', { p_room: RG.room_id, p_target: P3.id });
check('admin kicks MID-GAME → forfeit, the room keeps playing, needs_tick', r.ok && r.body.result === 'forfeit' && r.body.status === 'playing' && r.body.needs_tick === true, r);
r = await P3.send(RG.room_id, 'היי'); check('the kicked player is out of the chat → not_in_room', r.code === 'not_in_room', r);
r = await P3.act(RG.room_id, 'r', [], (await P3.state(RG.room_id)).body?.me?.state_version);
check('the kicked player cannot act any more (409 seat_finished)', r.status === 409 && r.body.error === 'seat_finished', r);
let tick = await P1.fn('tick', RG.room_id);
check('the next tick is accepted (closes the round when the others are done)', tick.status === 200, tick);
let s1 = await P1.playRound(RG.room_id); await P2.playRound(RG.room_id); s1 = (await P1.state(RG.room_id)).body;
check('the game continues: the others play the round and it closes (round ≥ 2), still playing', s1.room.status === 'playing' && s1.room.round >= 2, s1.room);
check('…the kicked seat is a forfeit, the others play', JSON.stringify(s1.seats.map((s) => s.status)) === JSON.stringify(['playing', 'playing', 'forfeit']), s1.seats.map((s) => s.status));
r = await ADM.rpc('rr_admin_kick_room', { p_room: RG.room_id, p_target: P3.id }); check('kicking the same seat again → seat_finished', r.code === 'seat_finished', r);
const rooms = (await ADM.rpc('rr_admin_rooms')).body || [];
const rgRow = rooms.find((x) => x.id === RG.room_id);
check('rr_admin_rooms: the live room with every seat (player ids, statuses, chat count)', rgRow && rgRow.status === 'playing' && rgRow.seats.length === 3 && rgRow.seats.every((s) => s.player_id && s.nickname) && rgRow.chat >= 1, rgRow);
r = await ADM.rpc('rr_admin_close_room', { p_room: RG.room_id }); check('admin closes the room → cancelled', r.ok && r.body.status === 'cancelled', r);
const cl = (await P1.state(RG.room_id)).body.room; check('…end_reason admin, nobody ranked', cl.status === 'cancelled' && cl.end_reason === 'admin' && !cl.results, cl);
r = await P1.act(RG.room_id, 'r', [], (await P1.state(RG.room_id)).body.me.state_version); check('…no more intents (409 room_not_playing)', r.status === 409 && r.body.error === 'room_not_playing', r);
r = await ADM.rpc('rr_admin_close_room', { p_room: RG.room_id }); check('closing it again → room_not_open', r.code === 'room_not_open', r);
r = await P2.send(RG.room_id, 'משחק טוב 🤝'); check('chat stays open for 30 min after the end ("משחק טוב")', r.ok, r);

/* ------------------------------------------------ groups + mod log */
await D.rpc('rr_join_group', { p_code: G0.code });
r = await ADM.rpc('rr_admin_remove_from_group', { p_group: G0.id, p_target: D.id }); check('admin removes a member from a group', r.ok && r.body.removed === true && r.body.group_deleted === false, r);
r = await D.rpc('rr_join_group', { p_code: G0.code }); check('…who cannot rejoin with the same code (groups v2: until the code rotates)', r.code === 'group_not_found', r);
r = await ADM.rpc('rr_admin_remove_from_group', { p_group: G0.id, p_target: D.id }); check('removing him again → member_not_found', r.code === 'member_not_found', r);
const log = (await ADM.rpc('rr_admin_mod_log', { p_before: null })).body;
const acts = (log?.log || []).map((x) => x.action);
check('mod log: every admin action, newest first', ['remove_group', 'close_room', 'kick_room', 'hide_chat', 'unban', 'ban', 'claim'].every((a) => acts.includes(a)) && acts[0] === 'remove_group', acts);
const mine = log.log.filter((x) => x.action === 'ban' && x.target_id === A.id);
check('mod log rows name the admin and the target', mine.length === 2 && mine.every((x) => x.admin === ADM.name && x.target === A.name), log.log.filter((x) => x.action === 'ban'));
r = await fetch(`${TARGET}/rest/v1/mod_log`, { headers: { apikey: KEY } }); check('the tables are not reachable through REST (mod_log)', r.status >= 400, r.status);
r = await A.rpc('mod', {}); check('game.* helpers are not callable through the API', !r.ok, r.status);
if (LOCAL) {
  let e = null; try { psql(`delete from game.mod_log`); } catch (x) { e = String(x.stderr || x.message); }
  check('LOCAL: the mod log refuses DELETE even for the owner role (append-only trigger)', /mod_log_append_only/.test(e || ''), e);
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
