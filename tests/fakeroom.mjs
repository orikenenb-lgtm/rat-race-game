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

function handle(q) {
  const now = Number.isFinite(q.now) ? q.now : Date.now(); const p = q.player; const a = q.args || {};
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
      const r = C.dispatch(E, room, 'join', p, a, now, { groups: q.groups || [] });
      if (r.status === 404) { fails.push(now); failedJoins.set(p.id, fails); }
      return r;
    }
    case 'my_rooms': {
      sweep(now);
      const list = [...rooms.values()].filter((r) => r.seats.some((s) => s.player_id === p.id) && (['lobby', 'playing'].includes(r.status) || now - (r.finished_at || 0) < 86400e3))
        .sort((x, y) => y.last_activity - x.last_activity).slice(0, 20).map((r) => C.listing(r, p.id));
      return { status: 200, body: list, actions: [] };
    }
    case 'dump': return { status: 200, body: { rooms: [...rooms.values()], created: [...created], failedJoins: [...failedJoins] }, actions: [] };
    case 'load': rooms.clear(); for (const r of (a.rooms || [])) rooms.set(r.id, r); created.clear(); for (const [k, v] of a.created || []) created.set(k, v); failedJoins.clear(); for (const [k, v] of a.failedJoins || []) failedJoins.set(k, v); return { status: 200, body: { ok: true, rooms: rooms.size }, actions: [] };
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
