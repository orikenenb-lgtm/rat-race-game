#!/usr/bin/env node
// Live-room sidecar of the offline fake backend (tests/fakebackend.py). Runs the SAME room_core.js as the Edge Function `room`
// with the SAME pinned engine bundle (tools/build-edge.mjs → verify-result/engine_loader.js), so the fake answers every rr_room_*
// RPC and every /functions/v1/room call with production semantics (design §4.4.3). Rooms live in this process's memory.
//
// newline-delimited JSON on stdin/stdout (one request at a time — the Python side holds a lock):
//   in : {"rid":n,"op":"create|join|ready|leave|kick|cancel|state|heartbeat|react|my_rooms|start|act|tick|dump|load|stats|pin",
//         "player":{"id","nickname","pawn"}, "groups":[group ids of the player], "args":{...}, "now": ms}
//   out: {"rid":n,"status":http,"body":{...},"actions":n}
// The Python side authenticates the player (game.auth) BEFORE it calls this sidecar — exactly the order of the SQL RPCs / index.ts.
import { createInterface } from 'node:readline';
import { randomUUID, randomInt, randomBytes } from 'node:crypto';
import { collect, bundleText } from '../tools/build-edge.mjs';
import { loadEngine } from '../supabase/functions/verify-result/engine_loader.js';
import { ENGINE_SHA256 } from '../supabase/functions/verify-result/engine_pin.js';
import * as C from '../supabase/functions/room/room_core.js';
import * as CR from '../supabase/functions/room/chat_rules.js';

const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
let E;
try { E = await loadEngine(bundleText(collect())); }
catch (e) { out({ ready: false, error: String(e && e.stack || e).slice(0, 500) }); process.exit(1); }

/* the SQL draft's limits (supabase/migrations/20261124_rooms.sql) */
export const SQL_LIMITS = { openRoomsPerPlayer: 3, roomsPerDay: 10, failedJoinsPerHour: 20 };
const rooms = new Map();                 // id → room
const created = new Map();               // player id → [ms]
const failedJoins = new Map();           // player id → [ms]
let actionsStored = 0;
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() { for (;;) { let c = ''; for (let i = 0; i < 6; i++) c += ALPHA[randomInt(ALPHA.length)]; if (![...rooms.values()].some((r) => r.code === c)) return c; } }
const err = (status, error, extra = {}) => ({ status, body: { ok: false, error, ...extra }, actions: [] });
// = the SQL caps (S2): lobbies + playing rooms active in the last 2 h
const openOf = (pid, now) => [...rooms.values()].filter((r) => C.countsAsOpen(r, now) && r.seats.some((s) => s.player_id === pid && !['left', 'forfeit', 'finished'].includes(s.status)));
/** = game.room_sweep() at the start of rr_room_create / rr_room_join / rr_my_rooms (S2) */
const sweep = (now) => { for (const r of rooms.values()) C.expireLobby(r, now); };
/** the engine pin of "this deploy" (test-only op 'pin' simulates a deploy that changes it — S1) */
let PIN = ENGINE_SHA256;

/* ---- in-room chat + owner moderation (= draft 20261126_admin_mod_chat.sql: rr_room_chat_*, rr_admin_* room parts). The Python side
 * authenticates, checks is_admin and passes `banned` (game.is_banned); everything about rooms and chat is decided here. */
let chat = [];            // {id, room_id, seat, player_id, nickname, text, hidden, hidden_by, hidden_at, at}
let blocked = [];         // {player_id, nickname, room_id, reason, at}   (never the text)
let reports = [];         // {msg_id, reporter_id, at}
let nextMsg = 1;
const W7 = CR.CHAT.keepMs;
/** = game.chat_sweep (every send): messages / refusal rows older than 7 days go, reports with their message */
function chatSweep(now) {
  const gone = new Set(chat.filter((m) => now - m.at >= W7).map((m) => m.id));
  if (gone.size) { chat = chat.filter((m) => !gone.has(m.id)); reports = reports.filter((r) => !gone.has(r.msg_id)); }
  blocked = blocked.filter((b) => now - b.at < W7);
}
/** = game.chat_member */
function chatMember(roomId, pid) {
  const room = typeof roomId === 'string' ? rooms.get(roomId) : null;
  if (!room) return [null, err(404, 'room_not_found')];
  if (!room.seats.some((s) => s.player_id === pid) || (room.kicked || []).includes(pid)) return [null, err(403, 'not_in_room')];
  return [room, null];
}
const msgOut = (m, pid) => ({ id: m.id, seat: m.seat, nickname: m.nickname, text: m.text, at: m.at, me: m.player_id === pid });
function chatOp(q, now) {
  const p = q.player; const a = q.args || {};
  switch (q.op) {
    case 'chat_send': {
      if (q.banned) return err(400, 'banned');
      const [room, e] = chatMember(a.room, p.id); if (e) return e;
      if (!(room.status === 'lobby' || room.status === 'playing' || (['finished', 'cancelled'].includes(room.status) && now - (room.finished_at || 0) < CR.CHAT.afterEndMs))) return err(409, 'chat_closed');
      const n = (ms) => chat.filter((m) => m.player_id === p.id && now - m.at < ms).length + blocked.filter((b) => b.player_id === p.id && now - b.at < ms).length;
      if (n(CR.CHAT.burstMs) >= CR.CHAT.burst || n(CR.CHAT.hourMs) >= CR.CHAT.hourly) return err(429, 'rate_limited');
      chatSweep(now);
      const t = CR.clean(a.text); const code = CR.check(t);
      if (code) { blocked.push({ player_id: p.id, nickname: p.nickname, room_id: room.id, reason: code, at: now }); return err(400, code); }
      const seat = room.seats.find((s) => s.player_id === p.id).seat;
      const m = { id: nextMsg++, room_id: room.id, seat, player_id: p.id, nickname: p.nickname, text: t, hidden: false, hidden_by: null, hidden_at: null, at: now };
      chat.push(m); return { status: 200, body: { ok: true, id: m.id, at: m.at }, actions: [] };
    }
    case 'chat_list': {
      const [room, e] = chatMember(a.room, p.id); if (e) return e;
      const all = chat.filter((m) => m.room_id === room.id).sort((x, y) => x.id - y.id);
      const since = Number.isInteger(a.since) ? a.since : 0;
      const msgs = all.filter((m) => !m.hidden && m.id > since).slice(-CR.CHAT.listMax).map((m) => msgOut(m, p.id));
      return { status: 200, body: { ok: true, msgs, hidden: all.slice(-CR.CHAT.hiddenWindow).filter((m) => m.hidden).map((m) => m.id), last: all.length ? all[all.length - 1].id : 0 }, actions: [] };
    }
    case 'chat_report': {
      const m = chat.find((x) => x.id === a.msg); if (!m) return err(404, 'msg_not_found');
      const [, e] = chatMember(m.room_id, p.id); if (e) return e;
      if (m.player_id === p.id) return err(400, 'cannot_report_self');
      if (reports.some((r) => r.msg_id === m.id && r.reporter_id === p.id)) return { status: 200, body: { ok: true, reported: true }, actions: [] };
      if (reports.filter((r) => r.reporter_id === p.id && now - r.at < 3600e3).length >= CR.CHAT.reportsPerHour) return err(429, 'rate_limited');
      reports.push({ msg_id: m.id, reporter_id: p.id, at: now });
      return { status: 200, body: { ok: true, reported: true }, actions: [] };
    }
    case 'admin_hide': {
      const m = chat.find((x) => x.id === a.msg); if (!m) return err(404, 'msg_not_found');
      const was = m.hidden; if (!was) { m.hidden = true; m.hidden_by = p.id; m.hidden_at = now; }
      return { status: 200, body: { ok: true, hidden: true, changed: !was, sender: m.player_id, room: m.room_id }, actions: [] };
    }
    case 'admin_room_chat': {
      const room = typeof a.room === 'string' ? rooms.get(a.room) : null; if (!room) return err(404, 'room_not_found');
      const list = chat.filter((m) => m.room_id === room.id).sort((x, y) => x.id - y.id).slice(-100)
        .map((m) => ({ id: m.id, seat: m.seat, player_id: m.player_id, nickname: m.nickname, text: m.text, at: m.at, hidden: m.hidden, reports: reports.filter((r) => r.msg_id === m.id).length }));
      return { status: 200, body: list, actions: [] };
    }
    case 'admin_reports': {
      const by = new Map();
      for (const r of reports.filter((x) => now - x.at < W7)) { const o = by.get(r.msg_id) || { n: 0, last: 0 }; o.n++; o.last = Math.max(o.last, r.at); by.set(r.msg_id, o); }
      const reps = [...by].map(([id, o]) => [chat.find((m) => m.id === id), o]).filter(([m]) => m).sort((x, y) => y[1].last - x[1].last).slice(0, 50)
        .map(([m, o]) => ({ msg_id: m.id, room_id: m.room_id, room_code: (rooms.get(m.room_id) || {}).code, sender_id: m.player_id, sender: m.nickname, text: m.text, hidden: m.hidden,
          at: m.at, reports: o.n, last_report: o.last, banned: (q.banned_ids || []).includes(m.player_id) }));
      const bl = new Map();
      for (const b of blocked.filter((x) => now - x.at < 86400e3)) { const o = bl.get(b.player_id) || { player_id: b.player_id, nickname: b.nickname, n: 0, reasons: new Set() }; o.n++; o.reasons.add(b.reason); bl.set(b.player_id, o); }
      const blk = [...bl.values()].sort((x, y) => y.n - x.n).slice(0, 20).map((o) => ({ player_id: o.player_id, nickname: o.nickname, n: o.n, reasons: [...o.reasons].sort(), banned: (q.banned_ids || []).includes(o.player_id) }));
      return { status: 200, body: { reports: reps, blocked: blk }, actions: [] };
    }
    case 'admin_rooms': {
      const list = [...rooms.values()].filter((r) => r.status === 'lobby' || r.status === 'playing').sort((x, y) => y.last_activity - x.last_activity).slice(0, 50)
        .map((r) => ({ id: r.id, code: r.code, status: r.status, world: r.settings.world, round: r.round, max_seats: r.settings.max_seats, created_at: r.created_at, last_activity: r.last_activity,
          seats: r.seats.map((s) => ({ seat: s.seat, player_id: s.player_id, nickname: s.nickname, status: s.status, host: s.player_id === r.host_id, connected: now - s.last_seen <= C.LIMITS.offlineMs })),
          chat: chat.filter((m) => m.room_id === r.id).length, reports: reports.filter((x) => (chat.find((m) => m.id === x.msg_id) || {}).room_id === r.id).length }));
      return { status: 200, body: list, actions: [] };
    }
    case 'admin_kick': {
      const room = typeof a.room === 'string' ? rooms.get(a.room) : null; if (!room) return err(404, 'room_not_found');
      if (room.status !== 'lobby' && room.status !== 'playing') return err(409, 'room_not_open');
      if (!room.seats.some((s) => s.player_id === a.target)) return err(404, 'player_not_in_room');
      const code = room.code; const out = C.adminSeatOut(room, a.target, 'admin', now);
      if (out === 'none') return err(409, 'seat_finished');
      return { status: 200, body: { ok: true, result: out, status: room.status, needs_tick: !!room.needs_tick, code }, actions: [] };
    }
    case 'admin_close': {
      const room = typeof a.room === 'string' ? rooms.get(a.room) : null; if (!room) return err(404, 'room_not_found');
      const was = room.status;
      try { const r = C.adminClose(room, now); return { ...r, body: { ...r.body, code: room.code, was }, actions: [] }; }
      catch (e2) { if (e2 instanceof C.RoomError) return err(e2.status, e2.code); throw e2; }
    }
    case 'ban_sweep': {
      let n = 0;
      for (const r of rooms.values()) if ((r.status === 'lobby' || r.status === 'playing') && r.seats.some((s) => s.player_id === a.target) && C.adminSeatOut(r, a.target, 'ban', now) !== 'none') n++;
      return { status: 200, body: { ok: true, rooms: n }, actions: [] };
    }
    case 'player_info': {
      const rs = [...rooms.values()].filter((r) => (r.status === 'lobby' || r.status === 'playing') && r.seats.some((s) => s.player_id === a.target)).sort((x, y) => y.last_activity - x.last_activity)
        .map((r) => { const s = r.seats.find((x) => x.player_id === a.target); return { id: r.id, code: r.code, status: r.status, seat: s.seat, seat_status: s.status }; });
      const mine = new Set(chat.filter((m) => m.player_id === a.target).map((m) => m.id));
      return { status: 200, body: { ok: true, rooms: rs, blocked_24h: blocked.filter((b) => b.player_id === a.target && now - b.at < 86400e3).length,
        reported_24h: reports.filter((r) => mine.has(r.msg_id) && now - r.at < 86400e3).length }, actions: [] };
    }
    default: return null;
  }
}
const CHAT_OPS = new Set(['chat_send', 'chat_list', 'chat_report', 'admin_hide', 'admin_room_chat', 'admin_reports', 'admin_rooms', 'admin_kick', 'admin_close', 'ban_sweep', 'player_info']);

function handle(q) {
  const now = Number.isFinite(q.now) ? q.now : Date.now(); const p = q.player; const a = q.args || {};
  if (CHAT_OPS.has(q.op)) return chatOp(q, now);
  switch (q.op) {
    case 'create': {
      sweep(now);
      const day = (created.get(p.id) || []).filter((t) => now - t < 86400e3);
      if (day.length >= SQL_LIMITS.roomsPerDay) return err(429, 'rate_limited');
      if (openOf(p.id, now).length >= SQL_LIMITS.openRoomsPerPlayer) return err(409, 'too_many_rooms');
      let room;
      try {
        room = C.newRoom(E, { id: randomUUID(), code: newCode(), seed: randomInt(1, 2 ** 31 - 1), topic: randomBytes(16).toString('hex'), engine_sha: null },
          p, a.settings, now, { group_id: a.group || null, groups: q.groups || [] });
      } catch (e) { if (e instanceof C.RoomError) return err(e.status, e.code, e.extra || {}); throw e; }
      if (q.banned) return err(400, 'banned');                  // = the ban guard on game.room_seats: nothing is created
      rooms.set(room.id, room); day.push(now); created.set(p.id, day);
      return { status: 200, body: { ok: true, room_id: room.id, code: room.code }, actions: [] };
    }
    case 'join': {
      sweep(now);
      const code = String(a.code ?? '').trim().toUpperCase();
      const fails = (failedJoins.get(p.id) || []).filter((t) => now - t < 3600e3);
      if (fails.length >= SQL_LIMITS.failedJoinsPerHour) return err(429, 'rate_limited');
      const room = /^[A-Z2-9]{6}$/.test(code) ? [...rooms.values()].find((r) => r.code === code && (r.status === 'lobby' || r.seats.some((s) => s.player_id === p.id))) : null;
      if (!room) { fails.push(now); failedJoins.set(p.id, fails); return err(404, 'room_not_found'); }
      if (room.status === 'lobby' && !room.seats.some((s) => s.player_id === p.id) && openOf(p.id, now).length >= SQL_LIMITS.openRoomsPerPlayer) return err(409, 'too_many_rooms');
      const before = q.banned ? JSON.stringify(room) : null;
      const r = C.dispatch(E, room, 'join', p, a, now, { groups: q.groups || [] });
      if (r.status === 404) { fails.push(now); failedJoins.set(p.id, fails); }
      if (q.banned && r.status === 200 && !r.body.rejoined) { rooms.set(room.id, JSON.parse(before)); return err(400, 'banned'); }   // the seat insert is refused
      return r;
    }
    case 'my_rooms': {
      sweep(now);
      const list = [...rooms.values()].filter((r) => r.seats.some((s) => s.player_id === p.id) && (['lobby', 'playing'].includes(r.status) || now - (r.finished_at || 0) < 86400e3))
        .sort((x, y) => y.last_activity - x.last_activity).slice(0, 20).map((r) => C.listing(r, p.id));
      return { status: 200, body: list, actions: [] };
    }
    case 'dump': return { status: 200, body: { rooms: [...rooms.values()], created: [...created], failedJoins: [...failedJoins], chat, blocked, reports, nextMsg }, actions: [] };
    case 'load': rooms.clear(); for (const r of (a.rooms || [])) rooms.set(r.id, r); created.clear(); for (const [k, v] of a.created || []) created.set(k, v); failedJoins.clear(); for (const [k, v] of a.failedJoins || []) failedJoins.set(k, v);
      chat = a.chat || []; blocked = a.blocked || []; reports = a.reports || []; nextMsg = a.nextMsg || (chat.reduce((m, x) => Math.max(m, x.id), 0) + 1);
      return { status: 200, body: { ok: true, rooms: rooms.size }, actions: [] };
    case 'pin': PIN = typeof a.sha === 'string' && /^[0-9a-f]{64}$/.test(a.sha) ? a.sha : ENGINE_SHA256; return { status: 200, body: { ok: true, pin: PIN }, actions: [] };
    case 'stats': return { status: 200, body: { rooms: rooms.size, actions: actionsStored, byStatus: [...rooms.values()].reduce((m, r) => ((m[r.status] = (m[r.status] || 0) + 1), m), {}) }, actions: [] };
    default: {
      if (!['ready', 'leave', 'kick', 'cancel', 'state', 'heartbeat', 'react', 'start', 'act', 'tick'].includes(q.op)) return err(400, 'bad_op');
      const room = typeof a.room === 'string' ? rooms.get(a.room) : null;
      if (!room) return err(q.op === 'act' || q.op === 'start' || q.op === 'tick' ? 403 : 404, q.op === 'act' || q.op === 'start' || q.op === 'tick' ? 'not_in_room' : 'room_not_found');
      if (!room.seats.some((s) => s.player_id === p.id)) return err(403, 'not_in_room');
      const r = C.dispatch(E, room, q.op, p, q.op === 'act' ? a.intent : a, now, { groups: q.groups || [], engine_sha: PIN });
      actionsStored += r.actions.length;
      return r;
    }
  }
}

out({ ready: true, engine: ENGINE_SHA256 });
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let q; try { q = JSON.parse(line); } catch (e) { return out({ rid: null, status: 400, body: { ok: false, error: 'bad_json' } }); }
  try { const r = handle(q); out({ rid: q.rid, status: r.status, body: r.body, actions: (r.actions || []).length }); }
  catch (e) { out({ rid: q.rid, status: 500, body: { ok: false, error: 'server_error', detail: String(e && e.message || e).slice(0, 300) } }); }
});
rl.on('close', () => process.exit(0));
