// room_core.js — pure logic of a live room (BRIEF §21–§23, docs/full-upgrade/research/O1-online-design.md §3–§4).
// No I/O, no clock, no randomness of its own: the caller passes the engine module E (the pinned bundle), `now` (ms, server clock)
// and fresh ids/seeds. Runs unchanged in Deno (supabase/functions/room/index.ts) and in Node (tests/fakeroom.mjs, tests/*.test.mjs).
//
// A room is ONE plain JSON object (see newRoom()). The Edge Function rebuilds it from game.rooms + game.room_seats rows
// (locked FOR UPDATE), calls one function here, and writes it back; the fake keeps it in memory. Every public function returns
// {status, body} (HTTP-like) and mutates `room` in place only when it succeeds (engine work is done on a copy first).
//
// Model (MVP, design §3.1): 2–4 seats, ONE server seed shared by every seat (same dice, same cards), each seat runs its own economy,
// SIMULTANEOUS rounds: in round r every active seat rolls once ('r' = rollDice + landing, atomic) and resolves its card(s); the round
// closes when every active seat is done or at the deadline (lazy timeouts: SAFE defaults only — roll / pass / ok / skip, never a
// purchase, investment or loan). The seed and the full engine state never leave the server: a seat sees its own REDACTED state
// (redact()) and the other seats' public progress as of the last closed round (pubOf()).

export const CORE_VERSION = 1;
export const WORLDS = ['w1', 'w2', 'w3', 'w4'];            // the history world 'h' needs real data — never in rooms
/** Intent codes a seat may send. 'l' is implicit after 'r'; M (mentor) is fixed by the settings; K/W/X are practice/after-win only. */
export const ALLOWED = new Set(['r', 'c', 'L', 'R', 'C', 'P', 'A', 'I', 'S', 'T', 'F', 'H', 'Q', 'Z']); // Z = a world module action (worlds wave 0) — a seat's own intent, never the autopilot's
export const LIMITS = Object.freeze({
  minSeats: 2, maxSeats: 4, turnSecs: [60, 300], defTurnSecs: 90, graceSecs: 15, maxRounds: [10, 120], defMaxRounds: 80,
  awayAfter: 3, forfeitAfter: 10, strictForfeitAfter: 3, actionsPerMin: 120, maxActions: 6000, autopilotSteps: 12,
  lobbyTtlMs: 2 * 3600e3, idleMs: 2 * 3600e3, allAwayMs: 30 * 60e3, offlineMs: 45e3, keepEvents: 50, reactGapMs: 3000,
  maxIntentBytes: 2048, maxOutBytes: 24000,
  // S1: a playing room started under another engine pin is closed (cancelled, unranked) once the pin has differed for this long —
  // the grace covers the deploy window, when old and new isolates may answer the same room. S5: a poll refreshes last_seen only
  // when it is older than seenWriteMs (the 15 s heartbeat keeps it fresh; "connected" means ≤ offlineMs = 45 s).
  pinGraceMs: 120e3, seenWriteMs: 15e3,
});
export const REACTIONS = Object.freeze(['clap', 'wow', 'lol', 'strong', 'bravo', 'again']); // 👏 😮 😂 💪 "כל הכבוד" "עוד סיבוב!"
const ACTIVE = new Set(['playing', 'away']);
const GONE = new Set(['finished', 'forfeit', 'left']);
const ID_RE = /^[A-Za-z0-9:_-]{8,64}$/;

export class RoomError extends Error {
  constructor(code, status = 400, extra = undefined) { super(code); this.code = code; this.status = status; this.extra = extra; }
}
const fail = (code, status, extra) => { throw new RoomError(code, status, extra); };
const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

/* ============================================================ Israel calendar date (the rules era of a room = its start day) */
export function israelDay(ms) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/* ============================================================ settings (frozen at start — §21 "no rule change after start") */
export const SETTING_KEYS = ['world', 'mode', 'char_policy', 'char', 'help', 'turn_secs', 'disconnect', 'end', 'max_rounds', 'privacy', 'max_seats', 'min_seats'];
/**
 * Validate + complete the host's settings. Unknown keys / bad values → bad_settings (400).
 * mode 'ranked' = the engine's 'challenge' mode (ranked rules, mentor fixed at 'hint', no practice features);
 * mode 'casual' = the engine's 'free' mode with the chosen help level (tutorial and bailout always off); the room caps the length.
 */
export function normalizeSettings(E, s) {
  if (!s || typeof s !== 'object' || Array.isArray(s)) fail('bad_settings');
  for (const k of Object.keys(s)) if (!SETTING_KEYS.includes(k)) fail('bad_settings', 400, { key: k });
  const pick = (k, allowed, def) => { const v = s[k] ?? def; if (!allowed.includes(v)) fail('bad_settings', 400, { key: k }); return v; };
  const int = (k, [lo, hi], def) => { const v = s[k] ?? def; if (!Number.isInteger(v) || v < lo || v > hi) fail('bad_settings', 400, { key: k }); return v; };
  const world = pick('world', WORLDS, 'w1');
  const chars = E.getWorld(world).characters.map((c) => c.id);
  const mode = pick('mode', ['ranked', 'casual'], 'ranked');
  const char_policy = pick('char_policy', ['same', 'choose'], 'same');
  const char = char_policy === 'same' ? pick('char', chars, chars[0]) : (s.char == null ? null : pick('char', chars, null));
  const help = mode === 'ranked' ? pick('help', ['hint'], 'hint') : pick('help', ['guide', 'hint', 'pro'], 'hint');
  const max_seats = int('max_seats', [LIMITS.minSeats, LIMITS.maxSeats], 4);
  const min_seats = int('min_seats', [LIMITS.minSeats, max_seats], 2);
  return {
    world, mode, char_policy, char, help,
    turn_secs: int('turn_secs', LIMITS.turnSecs, LIMITS.defTurnSecs),
    disconnect: pick('disconnect', ['autopilot', 'strict'], 'autopilot'),
    end: pick('end', ['first_win', 'all'], 'first_win'),
    max_rounds: int('max_rounds', LIMITS.maxRounds, LIMITS.defMaxRounds),
    privacy: pick('privacy', ['code', 'group'], 'code'),
    max_seats, min_seats,
  };
}
/** Engine config of a seat — every field from the server (the seed never comes from a client). */
export function seatConfig(room, charId) {
  const s = room.settings;
  const cfg = { worldId: s.world, charId, seed: room.seed, mode: s.mode === 'ranked' ? 'challenge' : 'free', tutorial: false, bailout: false, mentor: s.help };
  if (s.mode === 'ranked') cfg.dateKey = room.date_key;     // ranked rules era = the room's start day (rulesForDay, like a challenge)
  else cfg.rules = room.rules || 4;
  return cfg;
}

/* ============================================================ room object */
/**
 * ids = {id, code, seed, topic, engine_sha} from the caller (crypto random / server pin). player = {id, nickname, pawn}.
 * opts = {group_id, groups:[group ids the player belongs to]}.
 */
export function newRoom(E, ids, player, settings, now, opts = {}) {
  const st = normalizeSettings(E, settings);
  if (st.privacy === 'group') {
    if (!opts.group_id) fail('bad_settings', 400, { key: 'privacy' });
    if (!(opts.groups || []).includes(opts.group_id)) fail('not_member', 403);
  }
  if (!ids || !/^[A-HJ-NP-Z2-9]{6}$/.test(ids.code || '') || !Number.isInteger(ids.seed) || ids.seed < 1) fail('server_error', 500);
  const room = {
    id: ids.id, code: ids.code, host_id: player.id, group_id: st.privacy === 'group' ? opts.group_id : null, status: 'lobby', settings: st,
    rules: null, engine_sha: ids.engine_sha || null, seed: ids.seed, date_key: null, round: 0, round_started: null, deadline: null,
    version: 1, signal_topic: ids.topic || null, created_at: now, started_at: null, finished_at: null, last_activity: now, end_reason: null,
    cancel_votes: [], needs_tick: false, results: null, seats: [], events: [], next_event: 1, pin_mismatch_at: null,
  };
  addSeat(room, player, now);
  event(room, 'created', { by: 0 }, now);
  return room;
}
function newSeat(no, player, now) {
  return { seat: no, player_id: player.id, nickname: String(player.nickname || '').slice(0, 20), pawn: player.pawn || null, status: 'joined',
    char_id: null, state: null, view: null, pub: null, pub_round: 0, state_version: 0, rolled_round: 0, missed: 0, acted_round: 0,
    last_seen: now, conn_id: null, conns: {}, result: null, seq: 0, rate: [], acts: {}, last_react: 0 };
}
function addSeat(room, player, now) {
  const used = new Set(room.seats.map((s) => s.seat)); let no = 0; while (used.has(no)) no++;
  const s = newSeat(no, player, now); room.seats.push(s); room.seats.sort((a, b) => a.seat - b.seat); return s;
}
function event(room, kind, data, now) {
  room.events.push({ id: room.next_event++, round: room.round, kind, data: data || {}, at: now });
  if (room.events.length > LIMITS.keepEvents) room.events.splice(0, room.events.length - LIMITS.keepEvents);
}
/** Action rows to persist (game.room_actions) are collected on the room and drained by dispatch() — transient, never stored. */
const ROWS = (room, v) => Object.defineProperty(room, '__rows', { value: v, enumerable: false, configurable: true, writable: true });
function emit(room, row) { if (!room.__rows) ROWS(room, []); room.__rows.push(row); }
export function drainRows(room) { const r = room.__rows || []; ROWS(room, []); return r; }
const seatOf = (room, pid) => room.seats.find((s) => s.player_id === pid) || null;
const touch = (room, now) => { room.version++; room.last_activity = now; };
const hostSeat = (room) => (seatOf(room, room.host_id) || {}).seat ?? null;

/* ============================================================ lobby ops (mirrored 1:1 by the rr_room_* SQL draft) */
export function join(room, player, now, opts = {}) {
  const me = seatOf(room, player.id);
  if (me) { me.last_seen = now; return ok({ room_id: room.id, seat: me.seat, rejoined: true }); }   // reconnect by code = same seat
  if (room.status !== 'lobby' || (room.kicked || []).includes(player.id)) fail('room_not_found', 404); // started/finished/cancelled/kicked: one code, no oracle
  if (room.group_id && !(opts.groups || []).includes(room.group_id)) fail('not_member', 403);
  if (room.seats.length >= room.settings.max_seats) fail('room_full', 409);
  const s = addSeat(room, player, now); touch(room, now); event(room, 'joined', { seat: s.seat }, now);
  return ok({ room_id: room.id, seat: s.seat, rejoined: false });
}
export function setReady(E, room, player, ready, charId, now) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  if (room.status !== 'lobby') fail('room_started', 409);
  if (ready) {
    const chars = E.getWorld(room.settings.world).characters.map((c) => c.id);
    if (room.settings.char_policy === 'choose') {
      const c = charId ?? me.char_id; if (!chars.includes(c)) fail('bad_char');
      me.char_id = c;
    } else { if (charId != null && charId !== room.settings.char) fail('bad_char'); me.char_id = room.settings.char; }
  }
  me.status = ready ? 'ready' : 'joined'; me.last_seen = now; touch(room, now); event(room, ready ? 'ready' : 'unready', { seat: me.seat }, now);
  return ok({ version: room.version });
}
/** Lobby: the seat is freed (the host role moves to the lowest remaining seat). Playing: forfeit (frozen, ranked last). */
export function leave(room, player, now) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  if (room.status === 'lobby') {
    room.seats = room.seats.filter((s) => s !== me);
    event(room, 'left', { seat: me.seat }, now);
    if (!room.seats.length) { room.status = 'cancelled'; room.end_reason = 'empty'; room.finished_at = now; }
    else if (room.host_id === player.id) { room.host_id = room.seats[0].player_id; event(room, 'host', { seat: room.seats[0].seat }, now); }
    touch(room, now); return ok({ left: true, status: room.status });
  }
  if (room.status === 'playing' && ACTIVE.has(me.status)) {
    me.status = 'forfeit'; me.forfeit_round = room.round; room.needs_tick = true;             // the next tick closes the round / ends the room
    event(room, 'forfeit', { seat: me.seat, why: 'left' }, now); touch(room, now);
    return ok({ left: true, forfeit: true, status: room.status });
  }
  return ok({ left: true, status: room.status });
}
export function kick(room, player, seatNo, now) {
  if (room.host_id !== player.id) fail('not_host', 403);
  if (room.status !== 'lobby') fail('room_started', 409);
  const t = room.seats.find((s) => s.seat === seatNo); if (!t || t.player_id === player.id) fail('bad_seat');
  room.seats = room.seats.filter((s) => s !== t); (room.kicked ||= []).push(t.player_id);
  event(room, 'kicked', { seat: seatNo }, now); touch(room, now); return ok({ version: room.version });
}
/** Lobby: the host cancels. Playing: a vote — more than half of the active seats cancel the room (no ranking). */
export function cancel(room, player, now) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  if (room.status === 'lobby') {
    if (room.host_id !== player.id) fail('not_host', 403);
    room.status = 'cancelled'; room.end_reason = 'host'; room.finished_at = now; event(room, 'cancelled', { why: 'host' }, now); touch(room, now);
    return ok({ status: room.status });
  }
  if (room.status !== 'playing') fail('room_not_playing', 409);
  if (!ACTIVE.has(me.status)) fail('seat_finished', 409);
  if (!room.cancel_votes.includes(me.seat)) room.cancel_votes.push(me.seat);
  const active = room.seats.filter((s) => ACTIVE.has(s.status)).map((s) => s.seat);
  const votes = room.cancel_votes.filter((v) => active.includes(v)).length;
  if (votes * 2 > active.length) { room.status = 'cancelled'; room.end_reason = 'vote'; room.finished_at = now; room.deadline = null; event(room, 'cancelled', { why: 'vote' }, now); }
  else event(room, 'cancel_vote', { seat: me.seat, votes, of: active.length }, now);
  touch(room, now); return ok({ status: room.status, votes, of: active.length });
}
/* ============================================================ owner moderation (= game.admin_seat_out / rr_admin_close_room of the
 * draft 20261126_admin_mod_chat.sql; the SQL is the production path — these are the fake's model and the tests' reference) */
/** The admin takes a player out of a room (kick, ban). lobby → the seat is freed (+ kicked: no way back by code; the host role moves;
 *  an empty lobby is cancelled 'empty') · playing → forfeit like leaving (needs_tick: the next tick closes the round; the others play on)
 *  + kicked (no chat). → 'removed' | 'forfeit' | 'none'. */
export function adminSeatOut(room, pid, why, now) {
  const s = seatOf(room, pid); if (!s) return 'none';
  if ((room.status === 'lobby' || room.status === 'playing') && !(room.kicked || []).includes(pid)) (room.kicked ||= []).push(pid);
  let out = 'none';
  if (room.status === 'lobby') {
    room.seats = room.seats.filter((x) => x !== s);
    event(room, 'kicked', { seat: s.seat, by: why }, now);
    if (!room.seats.length) { room.status = 'cancelled'; room.end_reason = 'empty'; room.finished_at = now; event(room, 'cancelled', { why: 'empty' }, now); }
    else if (room.host_id === pid) { room.host_id = room.seats[0].player_id; event(room, 'host', { seat: room.seats[0].seat }, now); }
    out = 'removed';
  } else if (room.status === 'playing' && ACTIVE.has(s.status)) {
    s.status = 'forfeit'; s.forfeit_round = room.round; room.needs_tick = true; event(room, 'forfeit', { seat: s.seat, why }, now); out = 'forfeit';
  }
  if (out !== 'none') touch(room, now);
  return out;
}
/** The admin closes an open room: cancelled, end_reason 'admin', nobody ranked (like a cancel vote). */
export function adminClose(room, now) {
  if (room.status !== 'lobby' && room.status !== 'playing') fail('room_not_open', 409);
  room.status = 'cancelled'; room.end_reason = 'admin'; room.finished_at = now; room.deadline = null; room.needs_tick = false; room.cancel_votes = [];
  event(room, 'cancelled', { why: 'admin' }, now); touch(room, now);
  return ok({ status: 'cancelled' });
}
export function heartbeat(room, player, connId, now) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  const c = typeof connId === 'string' && ID_RE.test(connId) ? connId : null;
  if (c && !(c in me.conns)) me.conn_id = c;                                         // the newest connection is primary (UX only)
  if (c) { me.conns[c] = now; for (const [k, t] of Object.entries(me.conns)) if (now - t > 10 * 60e3) delete me.conns[k]; }
  const wasOff = now - me.last_seen > LIMITS.offlineMs; me.last_seen = now;
  if (wasOff) room.version++;                                                       // others see "connected" again
  back(room, me, now);
  return ok({ version: room.version, state_version: me.state_version, deadline: room.deadline, now, status: room.status,
    needs_tick: needsTick(room, now), primary: !c || c === me.conn_id });
}
/** An away player who shows up again (heartbeat / snapshot / intent) plays again from the next round on. */
function back(room, me, now) { if (room.status === 'playing' && me.status === 'away') { me.status = 'playing'; me.missed = 0; event(room, 'back', { seat: me.seat }, now); touch(room, now); } }
export function needsTick(room, now) {
  if (room.status === 'lobby') return now - room.last_activity > LIMITS.lobbyTtlMs;
  if (room.status !== 'playing') return false;
  return !!room.needs_tick || (room.deadline != null && now >= room.deadline) || now - room.last_activity > LIMITS.idleMs;
}
export function react(room, player, kind, now) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  if (!REACTIONS.includes(kind)) fail('bad_reaction');
  if (now - (me.last_react || 0) < LIMITS.reactGapMs) fail('rate_limited', 429);
  me.last_react = now; event(room, 'react', { seat: me.seat, kind }, now); touch(room, now); return ok({ version: room.version });
}

/* ============================================================ start (Edge: needs the engine) */
export function start(E, room, player, now, ctx = {}) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  if (room.host_id !== player.id) fail('not_host', 403);
  if (room.status !== 'lobby') fail('room_started', 409);
  if (room.seats.length < room.settings.min_seats) fail('not_enough_players', 409);
  if (room.seats.some((s) => s.status !== 'ready')) fail('not_ready', 409);
  room.date_key = israelDay(now);
  if (ctx.engine_sha) room.engine_sha = ctx.engine_sha;            // the Edge Function's pin: clients with another engine get 426
  const seats = room.seats.map((s) => {
    const st = E.createGame(seatConfig(room, s.char_id || room.settings.char));
    return { s, st };
  });
  room.rules = seats[0].st.rules || 3;
  for (const { s, st } of seats) { s.status = 'playing'; store(E, s, st); s.pub = pubOf(E, st); }
  room.status = 'playing'; room.started_at = now; room.cancel_votes = [];
  event(room, 'started', { seats: room.seats.length, rules: room.rules }, now);
  openRound(E, room, now);
  touch(room, now);
  return ok({ version: room.version, round: room.round, deadline: room.deadline });
}
function store(E, s, st) {
  s.state = st;                       // a fresh object (createGame / deserialize copy) — plain JSON data, persisted as jsonb
  s.view = { state: redact(E, st), event: st.pending && !st.over ? E.currentEvent(st) : null };
}
const load = (E, s) => E.deserialize(s.state);
function openRound(E, room, now) {
  room.round++; room.round_started = now; room.deadline = now + (room.settings.turn_secs + LIMITS.graceSecs) * 1000; room.cancel_votes = [];
  // away seats are played by the safe autopilot right away — unless EVERY active seat is away (then the deadline decides)
  const active = room.seats.filter((s) => ACTIVE.has(s.status));
  if (active.some((s) => s.status === 'playing')) for (const s of active) if (s.status === 'away') { autopilotSeat(E, room, s, now, 'away'); missedRound(room, s, now); }
}
/** One more round played by the autopilot: away after LIMITS.awayAfter in a row, forfeit after forfeitAfter (strict: 3). */
function missedRound(room, s, now) {
  const lim = room.settings.disconnect === 'strict' ? LIMITS.strictForfeitAfter : LIMITS.forfeitAfter;
  s.missed++;
  if (s.missed >= lim && ACTIVE.has(s.status)) { s.status = 'forfeit'; s.forfeit_round = room.round; event(room, 'forfeit', { seat: s.seat, why: 'timeouts' }, now); }
  else if (s.missed >= LIMITS.awayAfter && s.status === 'playing') { s.status = 'away'; event(room, 'away', { seat: s.seat }, now); }
}

/* ============================================================ intents */
/** {action_id, state_version, code, args} → validated intent. bad_action (400) on anything malformed. */
export function parseIntent(x) {
  if (!x || typeof x !== 'object') fail('bad_action');
  const { action_id, state_version, code } = x; const args = x.args ?? [];
  if (typeof action_id !== 'string' || !ID_RE.test(action_id)) fail('bad_action', 400, { field: 'action_id' });
  if (!Number.isInteger(state_version) || state_version < 0) fail('bad_action', 400, { field: 'state_version' });
  if (typeof code !== 'string' || !ALLOWED.has(code)) fail('bad_action', 400, { field: 'code' });
  if (!Array.isArray(args) || args.length > 2) fail('bad_action', 400, { field: 'args' });
  for (const v of args) {
    if (v === null || typeof v === 'boolean') continue;
    if (typeof v === 'number' ? !Number.isFinite(v) : typeof v !== 'string' || v.length > 40) fail('bad_action', 400, { field: 'args' });
  }
  return { action_id, state_version, code, args };
}
const sameIntent = (a, b) => a && b && a.code === b.code && JSON.stringify(a.args || []) === JSON.stringify(b.args || []);

/** Apply ONE intent to a COPY of the engine state. → {st, out, event, end} or throws RoomError illegal_action (422). */
export function applyIntent(E, st, code, args) {
  let r;
  try {
    switch (code) {
      case 'r': {
        if (st.over) fail('illegal_action', 422, { msg: 'game over' });
        if (st.phase !== 'roll' || st.pending) fail('not_your_roll', 409);
        const o = E.rollDice(st); const ev = st.over ? null : E.landing(st);
        return { st, out: o, event: ev, end: st.result || null };
      }
      case 'c': if (!st.pending) fail('illegal_action', 422, { msg: 'no event' }); r = E.choose(st, null, String(args[0] ?? ''), args[1] != null ? { qty: args[1] } : {}); break;
      case 'L': r = E.takeLoan(st, args[0] || undefined); break;
      case 'R': r = E.repayLoan(st, args[0] || undefined); break;
      case 'C': r = E.payCredit(st); break;
      case 'P': r = E.setPlan(st, args[0]); break;
      case 'A': r = E.setAutoInvest(st, args[0]); break;
      case 'I': r = E.invest(st, args[0], args[1]); break;
      case 'S': r = E.moveSavings(st, args[0]); break;
      case 'T': r = E.setSideReport(st, args[0]); break;
      case 'F': r = E.setFocus(st, args[0], args[1] ?? 0); break;
      case 'H': r = E.requestHint(st); break;
      case 'Q': r = E.resolveStory(st, args[0], args[1]); break;
      case 'Z': if (typeof E.worldAction !== 'function') fail('bad_action'); r = E.worldAction(st, String(args[0] ?? ''), args[1] == null ? null : String(args[1])); break;
      default: fail('bad_action');
    }
  } catch (e) {
    if (e instanceof RoomError) throw e;
    fail('illegal_action', 422, { msg: String(e && e.message || e).slice(0, 200) });
  }
  if (!r || r.ok === false) fail('illegal_action', 422, { msg: String((r && r.error) || 'refused').slice(0, 200) });
  return { st, out: r, event: st.over ? null : (r.event ?? E.currentEvent(st)), end: st.result || null };
}
/** The engine's `out` without the event/end copies (sent separately), size-capped. */
export function trimOut(out) {
  if (!out) return null;
  const { event: _e, end: _n, ...rest } = out;
  let o = clone(rest); let n = JSON.stringify(o).length;
  if (n > LIMITS.maxOutBytes) { for (const k of ['effects', 'spawn', 'despawn', 'lessons', 'recap']) delete o[k]; o.trimmed = true; n = JSON.stringify(o).length; }
  if (n > LIMITS.maxOutBytes) o = { ok: true, trimmed: true, dice: rest.dice, news: (rest.news || []).slice(0, 5) };
  return o;
}

/**
 * act — a seat's intent. ctx.prior = the stored response of the same (room, seat, action_id) if the caller's store has one
 * (index.ts reads game.room_actions; the fake keeps seat.acts). Order (§22): membership → idempotency → tick → room/seat status →
 * version → rate → phase/turn → engine legality.
 * Rows to persist ({seat, seq, action_id, a, by, from_version, response}) are drained by dispatch().
 */
export function act(E, room, player, raw, now, ctx = {}) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  const it = parseIntent(raw);
  const prior = ctx.prior !== undefined ? ctx.prior : (me.acts[it.action_id] || null);
  if (prior) {                                                     // duplicate delivery / retry after reconnect: never applied twice
    if (prior.a && !sameIntent({ code: prior.a[0], args: prior.a.slice(1) }, it)) fail('action_id_reused', 409);
    return { status: 200, body: { ...prior.response, replayed: true, current_state_version: me.state_version, view: me.view, now } };
  }
  if (raw.engine && room.engine_sha && raw.engine !== room.engine_sha) fail('version_mismatch', 426, { engine: room.engine_sha });
  if (needsTick(room, now)) tickInner(E, room, now);
  if (room.status !== 'playing') fail('room_not_playing', 409, { status: room.status });
  if (!ACTIVE.has(me.status)) fail('seat_finished', 409, { status: me.status });
  if (it.state_version !== me.state_version) fail('stale', 409, { state_version: me.state_version, view: me.view });
  me.rate = me.rate.filter((t) => now - t < 60e3);
  if (me.rate.length >= LIMITS.actionsPerMin) fail('rate_limited', 429);
  if ((me.state.actions || []).length >= LIMITS.maxActions) fail('too_many_actions', 429);
  if (it.code === 'r' && me.rolled_round >= room.round) fail('not_your_roll', 409, { round: room.round });
  const st = load(E, me);
  const res = applyIntent(E, st, it.code, it.args);                // throws on illegal: nothing of the seat changes
  me.rate.push(now);
  const from = me.state_version;
  if (it.code === 'r') me.rolled_round = room.round;
  me.acted_round = room.round; me.missed = 0; me.last_seen = now; back(room, me, now);
  commitSeat(E, room, me, st, now);
  const response = { ok: true, state_version: me.state_version, round: room.round, out: trimOut(res.out), end: res.end ? endSummary(res.end) : null };
  const row = { seat: me.seat, seq: ++me.seq, action_id: it.action_id, a: [it.code, ...it.args], by: 'player', from_version: from, response, at: now };
  remember(me, row); emit(room, row);
  maybeCloseRound(E, room, now);
  touch(room, now);
  return { status: 200, body: { ...response, event: res.event || null, room_version: room.version, room_status: room.status, round_now: room.round, done: seatDone(room, me), view: me.view, now } };
}
/**
 * In-object idempotency memory: the last KEEP_ACTS rows of a seat (the fake keeps rooms in memory; the Edge Function reads
 * game.room_actions instead and passes ctx.prior, so production remembers every action_id). An older duplicate carries an old
 * state_version and is refused as stale — it is never applied twice either way.
 */
export const KEEP_ACTS = 64;
function remember(s, row) {
  s.acts[row.action_id] = { a: row.a, response: row.response };
  const ks = Object.keys(s.acts); if (ks.length > KEEP_ACTS) for (const k of ks.slice(0, ks.length - KEEP_ACTS)) delete s.acts[k];
}
function commitSeat(E, room, s, st, now) {
  s.state_version++;
  store(E, s, st);
  if (st.over && ACTIVE.has(s.status)) { s.status = 'finished'; s.finished_round = room.round; event(room, 'seat_over', { seat: s.seat }, now); }
}
const endSummary = (r) => ({ status: r.status, reason: r.reason || null, months: r.months, stars: r.stars || 0 });

/* ============================================================ rounds, timeouts, autopilot */
export function seatDone(room, s) {
  if (GONE.has(s.status) || !s.state) return true;
  if (s.state.over) return true;
  return s.rolled_round >= room.round && s.state.phase === 'roll' && !s.state.pending;
}
function maybeCloseRound(E, room, now, forced = false) {
  if (room.status !== 'playing') return;
  const active = room.seats.filter((s) => ACTIVE.has(s.status));
  if (!forced && active.some((s) => !seatDone(room, s))) return;
  // public snapshot of every seat as of this round close (opponents never see mid-round progress — they share your cards)
  for (const s of room.seats) if (s.state && (ACTIVE.has(s.status) || s.pub_round < room.round)) { const prev = s.pub; s.pub = pubOf(E, s.state, prev); s.pub_round = room.round; }
  event(room, 'round', { round: room.round }, now);
  const left = room.seats.filter((s) => ACTIVE.has(s.status));
  const anyWon = room.seats.some((s) => s.state && s.state.over && s.state.result && s.state.result.status === 'won');
  if (!left.length) return finish(E, room, now, 'all_done');
  if (room.settings.end === 'first_win' && anyWon) return finish(E, room, now, 'first_win');
  if (room.round >= room.settings.max_rounds) return finish(E, room, now, 'max_rounds');
  openRound(E, room, now);
  // all remaining seats may already be done (e.g. everyone but away seats finished) → close again (bounded by max_rounds)
  if (room.seats.filter((s) => ACTIVE.has(s.status)).every((s) => seatDone(room, s)) && room.seats.some((s) => s.status === 'playing')) maybeCloseRound(E, room, now);
}
/** Lazy timeouts / abandonment (any member's 'tick' or any act). Idempotent: nothing happens before the deadline. → rows to persist. */
export function tick(E, room, player, now) {
  if (player && !seatOf(room, player.id)) fail('not_in_room', 403);
  const n0 = (room.__rows || []).length; tickInner(E, room, now);
  return { status: 200, body: { ok: true, status: room.status, round: room.round, deadline: room.deadline, version: room.version, applied: (room.__rows || []).length - n0, now } };
}
function tickInner(E, room, now) {
  const out = [];
  if (room.status === 'lobby') {
    expireLobby(room, now);
    return out;
  }
  if (room.status !== 'playing') return out;
  if (now - room.last_activity > LIMITS.idleMs) { finish(E, room, now, 'abandoned'); room.version++; return out; }
  const active = room.seats.filter((s) => ACTIVE.has(s.status));
  if (active.length && active.every((s) => s.status === 'away') && active.every((s) => now - s.last_seen > LIMITS.allAwayMs)) { finish(E, room, now, 'abandoned'); room.version++; return out; }
  if (room.needs_tick) { room.needs_tick = false; maybeCloseRound(E, room, now); room.version++; }
  if (room.status === 'playing' && room.deadline != null && now >= room.deadline) {
    for (const s of room.seats.filter((x) => ACTIVE.has(x.status))) {
      if (seatDone(room, s)) continue;
      autopilotSeat(E, room, s, now, 'timeout');
      if (s.acted_round < room.round) missedRound(room, s, now);
    }
    maybeCloseRound(E, room, now, true);
    room.version++;
  }
  return out;
}
/** Safe autopilot for one seat: roll if it has not rolled this round, then resolve pending cards with SAFE defaults only. */
function autopilotSeat(E, room, s, now, why) {
  const rows = []; if (!s.state || s.state.over) return rows;
  const st = load(E, s); const from = s.state_version;
  const steps = autopilot(E, st, { roll: s.rolled_round < room.round });
  if (!steps.length) return rows;
  if (steps.some((x) => x[0] === 'r')) s.rolled_round = room.round;
  commitSeat(E, room, s, st, now);
  for (const a of steps) {
    const row = { seat: s.seat, seq: ++s.seq, action_id: `auto-${room.round}-${s.seat}-${s.seq}`, a, by: 'timeout', from_version: from, response: { ok: true, auto: true, why }, at: now };
    remember(s, row); rows.push(row); emit(room, row);
  }
  event(room, 'autopilot', { seat: s.seat, why, steps: steps.length }, now);
  return rows;
}
/** → the list of intents applied ([code, ...args]); st is mutated. Never buys, invests, borrows or starts a business. */
export function autopilot(E, st, { roll = true, budget = LIMITS.autopilotSteps } = {}) {
  const done = []; let n = 0;
  const resolve = () => {
    for (; n < budget && st.pending && !st.over; n++) {
      const id = safeDefault(E.currentEvent(st)); if (!id) return;
      const r = E.choose(st, null, id, {}); if (!r || r.ok === false) return;
      done.push(['c', id]);
    }
  };
  resolve();                                                       // e.g. a business panel opened between rolls
  if (roll && !st.over && st.phase === 'roll' && !st.pending) { E.rollDice(st); if (!st.over) E.landing(st); done.push(['r']); }
  resolve();
  return done;
}
/** Ids that never spend, borrow or risk money, in preference order (BRIEF §23: never choose a risky investment silently). */
export const SAFE_IDS = ['pass', 'skip', 'ok', 'done', 'decline', 'no', 'later', 'stay', 'keep', 'rest', 'local', 'public', 'modest', 'fix', 'pay', 'go', 'a0'];
/** Option ids / kinds the autopilot must NEVER pick. */
export const RISKY = /^(buy|buyVar|buyFix|buyHedge|inv(:|$)|start|offer:|up:|invest|lend|guarantee|credit|inst|sub|spread|loan|bigger|new|big|take|counter|accept|insure|hedge|give:|pledge|sell|biz:|q:|plan:|save|raise|course|refi|prepay|report|auto:|withdraw|yes|private|object|registry|bus|smaller|abroad|monthly|once)/; // accept: a module offer (w5 allotment) is a decision, never a timeout's
export function safeDefault(ev) {
  if (!ev || !Array.isArray(ev.options)) return null;
  const en = ev.options.filter((o) => o.enabled);
  for (const id of SAFE_IDS) { const o = en.find((x) => x.id === id); if (o) return o.id; }
  const neutral = en.filter((o) => !RISKY.test(o.id) && !['buy', 'invest', 'loan', 'inspect', 'start', 'offer'].includes(o.kind));
  if (!neutral.length) return null;
  // several neutral options (e.g. a new life card): the one that spends the least now
  const cashOf = (o) => (o.effects && Number.isFinite(o.effects.cash) ? o.effects.cash : 0);
  return neutral.reduce((a, b) => (cashOf(b) > cashOf(a) ? b : a)).id;
}

/* ============================================================ finish (exactly once) + ranking */
function finish(E, room, now, reason) {
  if (room.status !== 'playing') return;                             // exactly once: only a playing room finishes
  room.status = 'finished'; room.finished_at = now; room.end_reason = reason; room.deadline = null; room.needs_tick = false;
  const rows = room.seats.filter((s) => s.state).map((s) => {
    const st = load(E, s); const r = st.over && st.result ? st.result : E.endNow(st);
    const m = E.metrics(st);
    return { seat: s.seat, nickname: s.nickname, forfeit: s.status === 'forfeit', status: s.status === 'forfeit' ? 'forfeit' : r.status,
      months: r.months, progress: round3(r.progress ?? m.goalProgress ?? 0), passive: Math.round(r.passive ?? m.passive), expenses: Math.round(r.expenses ?? m.expenses),
      netWorth: Math.round(r.netWorth ?? m.netWorth), stars: r.stars || 0, reason: r.reason || null, actions: (st.actions || []).length };
  });
  rank(rows, 'escape', 'ratio');
  for (const s of room.seats) {
    const r = rows.find((x) => x.seat === s.seat); if (!r) continue;
    s.result = r; if (ACTIVE.has(s.status)) s.status = 'finished';
    if (s.state) { const pv = s.pub; s.pub = pubOf(E, s.state, pv); s.pub_round = room.round; }
  }
  room.results = rows.slice().sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  event(room, 'finished', { reason }, now);
}
const round3 = (x) => Math.round((+x || 0) * 1000) / 1000;
/**
 * Competition metric (§25: success first, never click speed). metric 'escape': won first → fewer months → more progress;
 * 'networth': higher net worth. tiebreak 'ratio': passive ÷ expenses ↓ then net worth ↓; 'networth': net worth ↓ then ratio ↓.
 * Forfeits rank after everyone else. Equal keys share a rank (1, 1, 3). Mutates rows (adds rank) and returns them.
 */
export function rankKey(r, metric = 'escape', tiebreak = 'ratio') {
  const ratio = (r.passive || 0) / Math.max(1, r.expenses || 0);
  const tb = tiebreak === 'networth' ? [-(r.netWorth || 0), -round3(ratio)] : [-round3(ratio), -(r.netWorth || 0)];
  const won = r.status === 'won';
  const main = metric === 'networth' ? [-(r.netWorth || 0)] : [won ? 0 : 1, won ? (r.months || 0) : -round3(r.progress)];
  return [r.forfeit ? 1 : 0, ...main, ...tb];
}
const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
export function rank(rows, metric = 'escape', tiebreak = 'ratio') {
  const keyed = rows.map((r) => ({ r, k: rankKey(r, metric, tiebreak) })).sort((a, b) => cmp(a.k, b.k));
  keyed.forEach((x, i) => { x.r.rank = i > 0 && cmp(keyed[i - 1].k, x.k) === 0 ? keyed[i - 1].r.rank : i + 1; });
  return rows;
}

/* ============================================================ what a client may see */
const NEUTRAL_SEAL = (s) => Object.fromEntries(Object.keys(s || {}).map((k) => [k, 0.5]));
const r10 = (x) => Math.round(x / 10) * 10;
/** design §3.3 / engine shadowOf(): the expectation a player is allowed to know for a sealed dd card (level < 2). */
function ddPublic(E, st, p) {
  const dd = p.dd; const c = p.card; const noi = c.noi != null; const base0 = noi ? c.noi : c.cf; const value0 = c.value ?? c.cost; const down = Math.max(0, c.down);
  if (dd.level === 0) {
    const ex = E.DD.expectFactors(st.worldId, dd.golden ? 0 : dd.flags.length);
    const rs = dd.golden ? [{ ...ex.byRisk[0], p: 1 }] : ex.byRisk;
    const R = rs.map((x) => ({ p: x.p, base: E.DD.trueBase(base0, noi ? x.fNoi : x.f), value: Math.round(value0 * x.vf), rep: Math.round(x.rep * down) }));
    return { base: r10(R.reduce((a, x) => a + x.p * x.base, 0)), value: Math.round(R.reduce((a, x) => a + x.p * x.value, 0)), rep: Math.round(R.reduce((a, x) => a + x.p * x.rep, 0)) };
  }
  const truth = { base: dd.base ?? E.DD.trueBase(base0, dd.f), value: dd.val ?? Math.round(value0 * dd.vf), repair: dd.repair };
  const cfClaimed = E.assetCf(st, { k: c.k, debt: c.cost - c.down, sens: c.sens, ref: st.world.usd, ...(noi ? { noi: base0 } : { cf: base0 }) });
  const range = E.DD.rangeOf(dd, { base: truth.base, value: truth.value, repair: truth.repair, down, width: Math.max(50, Math.abs(cfClaimed) * 0.3), valueWidth: Math.abs(value0) * 0.06 });
  return { base: r10((range.base[0] + range.base[1]) / 2), value: Math.round((range.value[0] + range.value[1]) / 2), rep: Math.round(E.DD.BUCKET_REP[range.repair] * down), range };
}
/**
 * The REDACTED engine state for its own seat. Removed: seed, every RNG holder (rng, bizRng, bizStory), the deck order (= the
 * future cards), the action log (count only), log beyond 40 rows. Neutralised exactly like the engine's shadowOf(): dd truth of
 * an uninspected/partly inspected card, negR/raiseR/r, a pitch's hidden fate, rival close/taker, rival deal truths, life.raiseR/
 * sideSeed, the coin path — plus every story/chain `seal`, the payday story draw story.r, a business offer's sealed seed, the sealed
 * outcome of a lent/guaranteed friend loan, an active angel investment's fate, and economic truth not yet officially published.
 * Exception (documented in ONLINE.md): for a dd card at level 1 the view keeps the public RANGE in pending.dd.range and the local
 * describe() of the view re-centres it; the server's own `event` (sent with every response) is authoritative.
 */
export function redact(E, st) {
  const { rng: _r, bizRng: _b, bizStory: _s, decks, actions, log, seed: _seed, ...rest } = st;
  const v = clone(rest);
  v.actionsN = (actions || []).length; v.log = (log || []).slice(-40);
  v.decks = Object.fromEntries(Object.entries(decks || {}).map(([k, d]) => [k, Array.isArray(d) ? new Array(d.length).fill(-1) : d]));
  v.redacted = CORE_VERSION;
  const p = v.pending;
  if (p) {
    if (p.dd && p.type === 'deal' && (st.rules || 3) >= 4 && !p.dd.starter && p.dd.level < 2) {
      const B = ddPublic(E, st, st.pending);
      Object.assign(p.dd, { base: B.base, val: B.value, repair: B.rep, f: 1, vf: 1, jitter: 0.5, risk: 0 }); if (B.range) p.dd.range = B.range;
    } else if (p.dd && p.dd.level < 2) Object.assign(p.dd, { f: 1, vf: 1, jitter: 0.5, risk: 0, repair: 0 });
    if (p.negR != null) p.negR = 0.5;
    if (p.raiseR != null) p.raiseR = 0.5;
    if (p.r != null) p.r = 0.5;
    if (p.hidden) p.hidden = { mult: 1, revealIn: 99, signalIn: 99, signalMult: 1 };
    if (p.rv) { p.rv.close = 0; p.rv.taker = null; }
    if (p.type === 'business' && p.seed != null) p.seed = 0;
  }
  if (v.rivalDeals) v.rivalDeals = v.rivalDeals.map((d) => (d.revealed ? d : { ...d, truth: { cf: d.claimedCf, value: d.claimedValue, repair: 0 } }));
  if (v.life) { v.life.raiseR = 0.5; v.life.sideSeed = 1; if (v.life.friend) v.life.friend = { ...v.life.friend, ok: null }; }
  if (v.world && v.world.coin && Array.isArray(v.world.coin.path)) v.world.coin.path = v.world.coin.path.map(() => 1);
  if (v.angels) v.angels = v.angels.map((x) => (x.status === 'active' ? { ...x, mult: 1, signalMult: x.signalDone ? x.signalMult : 1 } : x));
  if (v.econ && Array.isArray(v.econ.truth)) v.econ.truth = v.econ.truth.filter((x) => x.m <= st.month - 1);
  if (v.story) {
    if (Array.isArray(v.story.r)) v.story.r = v.story.r.map(() => 0.5);
    for (const it of v.story.inbox || []) if (it.seal) it.seal = NEUTRAL_SEAL(it.seal);
    for (const c of Object.values(v.story.chains || {})) if (c && c.seal) c.seal = NEUTRAL_SEAL(c.seal);
  }
  return v;
}
const NW_BANDS = [0, 50e3, 100e3, 250e3, 500e3, 1e6, 2.5e6, 5e6, 10e6];
/** Public progress of a seat (what opponents see, per closed round): no hidden value, no card. */
export function pubOf(E, st, prev = null) {
  const m = E.metrics(st);
  const nw = Math.round(m.netWorth); let band = 0; while (band < NW_BANDS.length && nw >= NW_BANDS[band]) band++;
  const news = [];
  if (prev) {
    if ((st.assets || []).length > (prev.assets || 0)) news.push('bought');
    if ((st.assets || []).length < (prev.assets || 0)) news.push('sold');
    if (st.flags && st.flags.bankrupt && !prev.bankrupt) news.push('bankrupt');
  }
  if (st.over && st.result && st.result.status === 'won' && !(prev && prev.won)) news.push('escaped');
  return { month: st.month, progress: round3(m.goalProgress), passive: Math.round(m.passive), expenses: Math.round(m.expenses), nw_band: band,
    over: !!st.over, won: !!(st.over && st.result && st.result.status === 'won'), bankrupt: !!(st.flags && st.flags.bankrupt), assets: (st.assets || []).length, news: news.slice(0, 2) };
}
const ok = (body) => ({ status: 200, body: { ok: true, ...body } });

/** rr_room_state: the snapshot a member gets (reconnect = this + resend the unacknowledged intent with the SAME action_id). */
export function snapshot(room, player, since, now) {
  const me = seatOf(room, player.id); if (!me) fail('not_in_room', 403);
  if (me.status === 'away' || now - me.last_seen > LIMITS.seenWriteMs) { me.last_seen = Math.max(me.last_seen, now); back(room, me, now); }   // S5: = rr_room_state
  if (since != null && Number.isInteger(since) && since >= room.version) return ok({ unchanged: true, version: room.version, state_version: me.state_version, now });
  const over = ['finished', 'cancelled', 'abandoned'].includes(room.status);
  return ok({
    room: { id: room.id, code: room.code, status: room.status, settings: room.settings, round: room.round, deadline: room.deadline, version: room.version, now,
      host_seat: hostSeat(room), rules: room.rules, engine_sha: room.engine_sha, signal_topic: room.signal_topic, end_reason: room.end_reason,
      started_at: room.started_at, finished_at: room.finished_at, results: room.results, seed: over && room.started_at ? room.seed : null,
      needs_tick: needsTick(room, now) },
    seats: room.seats.map((s) => ({ seat: s.seat, nickname: s.nickname, pawn: s.pawn, status: s.status, char: s.char_id, me: s === me,
      connected: now - s.last_seen <= LIMITS.offlineMs, done: room.status === 'playing' ? seatDone(room, s) : null, pub: s.pub, pub_round: s.pub_round,
      result: room.status === 'finished' ? s.result : null })),
    me: { seat: me.seat, state_version: me.state_version, view: me.view, done: room.status === 'playing' ? seatDone(room, me) : null, rolled: me.rolled_round >= room.round && room.round > 0 },
    events: room.events.slice(-30),
  });
}
/** rr_my_rooms row. */
export function listing(room, pid) {
  const me = seatOf(room, pid);
  return { id: room.id, code: room.code, status: room.status, world: room.settings.world, seats: room.seats.length, max_seats: room.settings.max_seats,
    round: room.round, host: room.host_id === pid, seat: me ? me.seat : null };
}

/* ============================================================ one dispatcher for every transport (fake sidecar, tests, Edge) */
/**
 * op ∈ create · join · ready · leave · kick · cancel · state · heartbeat · react · start · act · tick.
 * → {status, body, actions}: actions = the game.room_actions rows this call produced (player + autopilot), also on an error
 * (a lazy tick may have run first). RoomError → {status, body:{ok:false, error, ...extra}}.
 */
export function dispatch(E, room, op, player, args, now, ctx = {}) {
  drainRows(room);
  try {
    const g = EDGE_OPS.has(op) ? pinGate(room, op, now, ctx) : null;
    const r = g || route(E, room, op, player, args || {}, now, ctx); return { ...r, actions: drainRows(room) };
  }
  catch (e) {
    if (e instanceof RoomError) return { status: e.status, body: { ok: false, error: e.code, ...(e.extra || {}) }, actions: drainRows(room) };
    drainRows(room); throw e;
  }
}
const EDGE_OPS = new Set(['start', 'act', 'tick']);
/**
 * S1 — the engine pin changed under a playing room (a deploy). Old engine states are never continued with another engine, and the
 * room must not stay stuck (409 forever, counted in the open-rooms cap): the first time a server with another pin (ctx.engine_sha)
 * sees it, it notes the time (pin_mismatch_at) and answers 409 version_changed; once the pin has differed for LIMITS.pinGraceMs
 * (the deploy window — a server with the room's own pin clears the note), the room is closed: cancelled, end_reason
 * 'version_changed', nobody ranked, the seed revealed like any cancelled room. tick → 200 (applied:1); start/act → 409
 * version_changed {closed:true}. Needs no engine. Callers persist the room when room.__dirty is set (also on an error answer).
 */
function pinGate(room, op, now, ctx) {
  const pin = ctx.engine_sha;
  if (!pin || !room.engine_sha || room.engine_sha === pin) {
    if (pin && room.pin_mismatch_at != null && room.engine_sha === pin) { room.pin_mismatch_at = null; DIRTY(room); }
    return null;
  }
  if (room.status !== 'playing') return null;                       // lobby: no pin yet (start sets it) · ended rooms: nothing to run
  if (room.pin_mismatch_at == null) { room.pin_mismatch_at = now; DIRTY(room); }
  if (now - room.pin_mismatch_at < LIMITS.pinGraceMs) fail('version_changed', 409, { engine: room.engine_sha, closes_in: Math.ceil((LIMITS.pinGraceMs - (now - room.pin_mismatch_at)) / 1000) });
  room.status = 'cancelled'; room.end_reason = 'version_changed'; room.finished_at = now; room.deadline = null; room.needs_tick = false; room.cancel_votes = [];
  event(room, 'cancelled', { why: 'version' }, now); touch(room, now); DIRTY(room);
  if (op === 'tick') return { status: 200, body: { ok: true, status: room.status, round: room.round, deadline: null, version: room.version, applied: 1, now } };
  fail('version_changed', 409, { engine: room.engine_sha, closed: true });
  return null;
}
const DIRTY = (room) => Object.defineProperty(room, '__dirty', { value: true, enumerable: false, configurable: true, writable: true });
/**
 * S2 — a lobby nobody touched for LIMITS.lobbyTtlMs is cancelled ('expired') — the same rule as tick(), applied without a tick:
 * the SQL draft runs it (game.room_sweep) at the start of rr_room_create / rr_room_join / rr_my_rooms, the fake before the same ops.
 * → true when it expired the room now.
 */
export function expireLobby(room, now) {
  if (room.status !== 'lobby' || now - room.last_activity <= LIMITS.lobbyTtlMs) return false;
  room.status = 'cancelled'; room.end_reason = 'expired'; room.finished_at = now; event(room, 'cancelled', { why: 'expired' }, now); room.version++;
  return true;
}
/** S2 — counts toward the 3-open-rooms cap: lobby, or playing with activity in the last LIMITS.idleMs (= the SQL caps). */
export function countsAsOpen(room, now) { return room.status === 'lobby' || (room.status === 'playing' && now - room.last_activity <= LIMITS.idleMs); }
function route(E, room, op, player, args, now, ctx) {
  {
    switch (op) {
      case 'join': return join(room, player, now, ctx);
      case 'ready': return setReady(E, room, player, !!args.ready, args.char ?? null, now);
      case 'leave': return leave(room, player, now);
      case 'kick': return kick(room, player, args.seat, now);
      case 'cancel': return cancel(room, player, now);
      case 'state': return snapshot(room, player, args.since ?? null, now);
      case 'heartbeat': return heartbeat(room, player, args.conn ?? null, now);
      case 'react': return react(room, player, args.kind, now);
      case 'start': return start(E, room, player, now, ctx);
      case 'act': return act(E, room, player, args, now, ctx);
      case 'tick': return tick(E, room, player, now);
      default: fail('bad_op');
    }
  }
}
