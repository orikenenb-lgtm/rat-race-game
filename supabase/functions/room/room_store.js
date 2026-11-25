// room_store.js — the Postgres side of the Edge Function `room`: rebuild a room_core room object from game.rooms / game.room_seats /
// game.room_events (rows LOCKED with FOR UPDATE inside the caller's transaction) and write it back. No engine, no HTTP.
// `q(text, params) → Promise<rows[]>` is the only dependency, so the same code runs in Deno (postgres.js: tx.unsafe) and in Node tests
// against real PostgreSQL semantics (tests/sql_drafts.test.mjs: PGlite + the migration drafts).
// Times: room_core uses epoch milliseconds; the tables use timestamptz. json/jsonb parameters are passed as JSON TEXT and cast
// `$n::text::jsonb` — never `$n::jsonb`: postgres.js (prepare:false still describes the statement) sees a jsonb parameter and
// JSON.stringify()s the JS string AGAIN, so `$n::jsonb` stored a JSON string literal ("{\"world\":…}") and the settings CHECK failed
// (found on the local staging stack, tools/staging, 2026-11-25; PGlite does not do this). Through `::text` both drivers send the
// text as is, and json keeps its key order byte for byte.

const ms = (t) => (t == null ? null : t instanceof Date ? t.getTime() : typeof t === 'number' ? t : Date.parse(t));
const ts = (n) => (n == null ? null : Number(n));
const J = (v) => (v === undefined ? null : JSON.stringify(v));

/** Load + lock. → room object (room_core shape) or null. Seat nickname/pawn are the players' current ones. */
export async function loadRoom(q, roomId, { lock = true } = {}) {
  const fu = lock ? ' for update' : '';
  const [r] = await q(`select * from game.rooms where id = $1::uuid${fu}`, [roomId]);
  if (!r) return null;
  const seats = await q(`select s.*, p.nickname, p.pawn from game.room_seats s join game.players p on p.id = s.player_id
    where s.room_id = $1::uuid order by s.seat${lock ? ' for update of s' : ''}`, [roomId]);
  const events = await q(`select seq, round, kind, data, at from game.room_events where room_id = $1::uuid order by seq desc limit 50`, [roomId]);
  const room = {
    id: r.id, code: r.code, host_id: r.host_id, group_id: r.group_id, status: r.status, settings: r.settings, rules: r.rules,
    engine_sha: r.engine_sha, seed: Number(r.seed), date_key: r.date_key, round: r.round, round_started: ms(r.round_started), deadline: ms(r.deadline),
    version: Number(r.version), signal_topic: r.signal_topic, created_at: ms(r.created_at), started_at: ms(r.started_at), finished_at: ms(r.finished_at),
    last_activity: ms(r.last_activity), end_reason: r.end_reason, cancel_votes: r.cancel_votes || [], kicked: r.kicked || [], needs_tick: r.needs_tick,
    results: r.results, next_event: Number(r.next_event), pin_mismatch_at: ms(r.pin_mismatch_at),
    events: events.reverse().map((e) => ({ id: Number(e.seq), round: e.round, kind: e.kind, data: e.data, at: ms(e.at) })),
    seats: seats.map((s) => loaded({
      seat: s.seat, player_id: s.player_id, nickname: s.nickname, pawn: s.pawn, status: s.status, char_id: s.char_id, state: s.state, view: s.view,
      pub: s.pub, pub_round: s.pub_round, state_version: Number(s.state_version), rolled_round: s.rolled_round, missed: s.missed, acted_round: s.acted_round,
      finished_round: s.finished_round, forfeit_round: s.forfeit_round, last_seen: ms(s.last_seen), conn_id: s.conn_id, conns: s.conns || {}, result: s.result,
      seq: Number(s.seq), rate: [], acts: {}, last_react: ms(s.last_react) || 0,
    })),
  };
  Object.defineProperty(room, '__nseats', { value: seats.length, enumerable: false, configurable: true, writable: true });
  return room;
}
/* S5 — write only what changed. A loaded seat remembers (non-enumerable) the objects it was loaded with and a signature of its
 * small columns. room_core never edits a state/view in place: it replaces them (store() after every engine step), so identity
 * tells whether the big json columns (state ≤ 400 KB, view) must be rewritten. Seats that did not change are not written at all. */
const SMALL = (s) => JSON.stringify([s.status, s.char_id, s.pub, s.pub_round || 0, s.state_version, s.rolled_round || 0, s.missed || 0, s.acted_round || 0,
  s.finished_round ?? null, s.forfeit_round ?? null, s.last_seen, s.conn_id, s.conns || {}, s.result, s.seq || 0, s.last_react || 0]);
function loaded(s) { Object.defineProperty(s, '__orig', { value: { state: s.state, view: s.view, small: SMALL(s) }, enumerable: false, configurable: true }); return s; }

/** The stored response of (room, seat, action_id), for idempotent replays. */
export async function priorAction(q, roomId, seat, actionId) {
  const [a] = await q(`select a, response from game.room_actions where room_id = $1::uuid and seat = $2 and action_id = $3`, [roomId, seat, actionId]);
  return a ? { a: a.a, response: a.response } : null;
}
/** Player intents of a seat in the last minute (rate limit 120/min; autopilot rows do not count). */
export async function recentRate(q, roomId, seat, now) {
  const rows = await q(`select at from game.room_actions where room_id = $1::uuid and seat = $2 and by = 'player' and at > to_timestamp($3::double precision / 1000)`, [roomId, seat, now - 60e3]);
  return rows.map((x) => ms(x.at));
}

/** Write the room back (inside the same transaction). before = {next_event} of the loaded room; rows = dispatch().actions.
 *  Only seats whose columns changed are written (S5); the big json columns only when room_core replaced state / view. */
export async function saveRoom(q, room, before, rows = []) {
  await q(`update game.rooms set host_id = $2::uuid, status = $3, end_reason = $4, settings = $5::text::jsonb, rules = $6, engine_sha = $7, date_key = $8,
      round = $9, round_started = to_timestamp($10::double precision / 1000), deadline = to_timestamp($11::double precision / 1000), version = $12,
      needs_tick = $13, cancel_votes = $14::text::jsonb, kicked = $15::text::jsonb, results = $16::text::jsonb, next_event = $17,
      started_at = to_timestamp($18::double precision / 1000), finished_at = to_timestamp($19::double precision / 1000), last_activity = to_timestamp($20::double precision / 1000),
      pin_mismatch_at = to_timestamp($21::double precision / 1000)
    where id = $1::uuid`,
    [room.id, room.host_id, room.status, room.end_reason, J(room.settings), room.rules, room.engine_sha, room.date_key, room.round, ts(room.round_started), ts(room.deadline),
      room.version, !!room.needs_tick, J(room.cancel_votes || []), J(room.kicked || []), J(room.results), room.next_event, ts(room.started_at), ts(room.finished_at), ts(room.last_activity), ts(room.pin_mismatch_at)]);
  const keep = room.seats.map((s) => s.seat);
  if (room.__nseats !== keep.length || room.seats.some((s) => !s.__orig))       // Edge ops never add or remove seats: normally skipped
    await q(`delete from game.room_seats where room_id = $1::uuid and not (seat = any($2::smallint[]))`, [room.id, keep]);
  for (const s of room.seats) {
    const o = s.__orig; const st = s.state;
    const big = !o || o.state !== s.state || o.view !== s.view;
    if (o && !big && o.small === SMALL(s)) continue;                 // S5: an unchanged seat is not written
    const p = [room.id, s.seat, s.status, s.char_id, J(s.pub), s.pub_round || 0, s.state_version, s.rolled_round || 0, s.missed || 0, s.acted_round || 0,
      s.finished_round ?? null, s.forfeit_round ?? null, ts(s.last_seen), s.conn_id, J(s.conns || {}), J(s.result), s.seq || 0, s.last_react ? ts(s.last_react) : null,
      !!(st && st.over), st ? st.phase : null, !!(st && st.pending)];
    const cols = `status = $3, char_id = $4, pub = $5::text::jsonb, pub_round = $6, state_version = $7, rolled_round = $8, missed = $9, acted_round = $10,
        finished_round = $11, forfeit_round = $12, last_seen = to_timestamp($13::double precision / 1000), conn_id = $14, conns = $15::text::jsonb, result = $16::text::jsonb,
        seq = $17, last_react = to_timestamp($18::double precision / 1000), st_over = $19, st_phase = $20, st_pending = $21`;
    if (big) await q(`update game.room_seats set ${cols}, state = $22::text::json, view = $23::text::json where room_id = $1::uuid and seat = $2`, [...p, J(st), J(s.view)]);
    else await q(`update game.room_seats set ${cols} where room_id = $1::uuid and seat = $2`, p);
    loaded(s);                                                       // a second save in the same transaction writes only new changes
  }
  for (const a of rows) {
    await q(`insert into game.room_actions (room_id, seat, seq, action_id, a, by, from_version, response, at)
      values ($1::uuid, $2, $3, $4, $5::text::jsonb, $6, $7, $8::text::jsonb, to_timestamp($9::double precision / 1000))`,
      [room.id, a.seat, a.seq, a.action_id, J(a.a), a.by, a.from_version, J(a.response), a.at]);
  }
  for (const e of room.events.filter((x) => x.id >= before.next_event)) {
    await q(`insert into game.room_events (room_id, seq, round, kind, data, at) values ($1::uuid, $2, $3, $4, $5::text::jsonb, to_timestamp($6::double precision / 1000))`,
      [room.id, e.id, e.round, e.kind, J(e.data || {}), e.at]);
  }
}
