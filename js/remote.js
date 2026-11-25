// RemoteDriver — the client side of a live room (wave 3b). docs/full-upgrade/ONLINE.md §3–§5, §9; research/O1-online-design.md.
//
// In a room the SERVER owns the game: the client sends intents {action_id, state_version, code, args} to the Edge Function `room`
// (op 'act') and replaces its local state with the server's REDACTED view (`view.state`) + the server-described card (`view.event`).
// Money, dice, cards and results never come from this file.
//
// Two users:
//   1. js/rooms.js (the room screen in the lobby): snapshot polling, heartbeat, lazy ticks, act() for roll / choose / reactions.
//   2. js/game.js through a small hook (/tmp/w3b/game_hook.patch, applied by the lead): `setDriver(driver)` and, at the ~12 engine
//      mutation call sites, `D ? await D.roll(S) : E.rollDice(S)` and friends. The methods below (roll, landing, choose, call,
//      currentEvent, adopt, canRoll, persistOff) are that contract — they mirror the engine's synchronous API, but async.
//
// Safety rules kept here (BRIEF §22–§23):
//   * one intent in flight per driver (a double click is refused locally; the server also dedups by action_id);
//   * a lost answer is resent with the SAME action_id (never a new one) — also after a reload (pending intent in localStorage);
//   * 409 stale → the server's current view is adopted, nothing is retried silently with a new id;
//   * the clock is the server's (`now` of every answer → offset); deadlines are server ms.
// No DOM, no engine import: runs in Node (tests/remote_driver.test.mjs) with any `net`-like transport.

export const ROOM_CODE = Object.freeze({
  takeLoan: 'L', repayLoan: 'R', payCredit: 'C', setPlan: 'P', setAutoInvest: 'A', invest: 'I', moveSavings: 'S',
  setSideReport: 'T', setFocus: 'F', requestHint: 'H', resolveStory: 'Q',
  worldAction: 'Z',   // worlds wave 0: a world module action (room_core ALLOWED has Z; args [name, param])
});
/** Engine calls a room never allows (help level is a room setting; practice/after-win features are off in rooms). */
export const ROOM_REFUSED = Object.freeze(['setMentorLevel', 'retire', 'answerPractice', 'afterWin', 'rewind', 'branch']);
export const REACTIONS = Object.freeze([
  ['clap', '👏', 'מחיאות כפיים'], ['wow', '😮', 'וואו'], ['lol', '😂', 'צחוק'], ['strong', '💪', 'חזק'], ['bravo', '🏅', 'כל הכבוד'], ['again', '🔁', 'עוד סיבוב!'],
]);
export const POLL = Object.freeze({ waitMs: 3000, playMs: 8000, idleMs: 15000, heartbeatMs: 15000, tickGapMs: 5000, offlineRetries: 3 });
const ACTIVE = new Set(['playing', 'away']);
const PKEY = 'rr2-room-pending';

/** UUIDv4 (crypto when available; the server accepts any [A-Za-z0-9:_-]{8,64}). */
export function newActionId() {
  try { if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID(); } catch (e) { /* fall back */ }
  const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
  return `${h()}${h()}-${h()}-4${h().slice(1)}-a${h().slice(1)}-${h()}${h()}${h()}`;
}
const sleep = (ms, T) => new Promise((r) => (T.setTimeout || setTimeout)(r, ms));
const err = (code, message, extra = {}) => Object.assign(new Error(message || code), { code, ...extra });

export class RemoteDriver {
  /**
   * @param {object} o
   * @param {object} o.net      js/net.js `net` (roomState, roomHeartbeat, roomFn, roomReact, roomLeave, roomCancel, roomReady, roomKick)
   * @param {string} o.roomId
   * @param {Storage} [o.storage] localStorage (pending intent across reloads); null = memory only
   * @param {string} [o.conn]   per-tab connection id (heartbeat 'primary' flag); default: a fresh one
   * @param {() => number} [o.clock]
   * @param {object} [o.timers] {setTimeout, clearTimeout} (tests)
   */
  constructor({ net, roomId, storage, conn, clock, timers } = {}) {
    this.net = net; this.roomId = roomId;
    this.storage = storage === undefined ? (globalThis.localStorage || null) : storage;
    this.conn = conn || ('tab-' + newActionId().replace(/-/g, '').slice(0, 20));
    this.clock = clock || (() => Date.now());
    this.T = timers || globalThis;
    this.snap = null;            // last full rr_room_state body {room, seats, me, events}
    this.offset = 0;             // server ms − local ms
    this.primary = true;         // heartbeat: this tab is the newest connection of this player
    this.inflight = null;        // the intent being sent (one at a time)
    this.lastError = null;
    this.listeners = new Set();
    this._landing = undefined;   // the landing event that came with the last roll (game hook)
    this._timer = null; this._running = false;
    this._lastPoll = 0; this._lastBeat = 0; this._lastTick = 0; this._polling = null;
    this.fatal = null;           // not_in_room / room gone: the screen leaves the room
  }

  /* ------------------------------------------------------------------ read-only views of the snapshot */
  get room() { return this.snap ? this.snap.room : null; }
  get seats() { return this.snap ? this.snap.seats : []; }
  get me() { return this.snap ? this.snap.me : null; }
  get mySeat() { const m = this.me; return m ? this.seats.find((s) => s.seat === m.seat) || null : null; }
  get view() { const m = this.me; return m ? m.view : null; }
  get state() { const v = this.view; return v ? v.state : null; }
  get event() { const v = this.view; return v ? v.event : null; }
  get stateVersion() { const m = this.me; return m ? m.state_version : 0; }
  get status() { const r = this.room; return r ? r.status : null; }
  get isHost() { const r = this.room; const m = this.me; return !!(r && m && r.host_seat === m.seat); }
  serverNow() { return this.clock() + this.offset; }
  /** seconds left in the round (server clock), or null */
  secondsLeft() { const r = this.room; if (!r || r.status !== 'playing' || r.deadline == null) return null; return Math.max(0, Math.ceil((r.deadline - this.serverNow()) / 1000)); }
  /** My seat may act this round (not finished / forfeited) and the room is playing. */
  active() { const s = this.mySeat; return this.status === 'playing' && !!s && ACTIVE.has(s.status); }
  /** The roll button: playing, my seat active, not rolled in this round, no open card, not over, this tab is primary. */
  canRoll() {
    const st = this.state; const m = this.me;
    return this.active() && !!m && !m.rolled && !!st && !st.over && st.phase === 'roll' && !st.pending && !this.inflight;
  }
  /** I am done for this round: waiting for the others (or the deadline). */
  waiting() { const m = this.me; return this.active() && !!m && !!m.done; }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(kind, data) { for (const fn of [...this.listeners]) { try { fn(kind, data, this); } catch (e) { console.error(e); } } }

  /* ------------------------------------------------------------------ snapshot / heartbeat / tick */
  _clock(now) { if (Number.isFinite(now)) this.offset = now - this.clock(); }
  /** rr_room_state; full=true ignores the version (reconnect / after an error). → true when something changed. */
  async refresh(full = false) {
    const since = !full && this.snap ? this.snap.room.version : null;
    let r;
    try { r = await this.net.roomState(this.roomId, since); }
    catch (e) { this.lastError = e; if (e.code === 'not_in_room' || e.code === 'room_not_found') { this.fatal = e.code; this.emit('fatal', e); } throw e; }
    this._lastPoll = this.clock();
    if (!r) return false;
    if (r.unchanged) { this._clock(r.now); if (this.snap && this.snap.me && r.state_version !== this.snap.me.state_version) return this.refresh(true); return false; }
    const prevRound = this.room ? this.room.round : 0; const prevStatus = this.status;
    this.snap = r; this._clock(r.room && r.room.now);
    this.emit('change', { round: r.room.round, prevRound, status: r.room.status, prevStatus });
    if (r.room.status !== prevStatus && prevStatus) this.emit('status', { from: prevStatus, to: r.room.status });
    if (prevRound && r.room.round !== prevRound) this.emit('round', { from: prevRound, to: r.room.round });
    return true;
  }
  async heartbeat() {
    let r;
    try { r = await this.net.roomHeartbeat(this.roomId, this.conn); }
    catch (e) { if (e.code === 'not_in_room') { this.fatal = e.code; this.emit('fatal', e); } return null; }
    this._lastBeat = this.clock();
    if (!r) return null;
    this._clock(r.now);
    const wasPrimary = this.primary; this.primary = r.primary !== false;
    if (wasPrimary !== this.primary) this.emit('primary', { primary: this.primary });
    if (r.needs_tick) await this.tick();
    if (this.snap && (r.version !== this.snap.room.version || r.state_version !== this.stateVersion)) await this.refresh().catch(() => {});
    return r;
  }
  /** Become the primary tab again (a new connection id is the newest one). */
  async takeOver() { this.conn = 'tab-' + newActionId().replace(/-/g, '').slice(0, 20); return this.heartbeat(); }
  /** Lazy timeouts: any member may ask the server to apply them (nothing happens before the deadline). */
  async tick(force = false) {
    if (!force && this.clock() - this._lastTick < POLL.tickGapMs) return null;
    this._lastTick = this.clock();
    try { const r = await this.net.roomFn('tick', this.roomId); this._clock(r && r.now); if (r && r.applied) await this.refresh().catch(() => {}); return r; }
    catch (e) { this.lastError = e; if (e.code === 'version_changed') { this.emit('version', e.body || {}); await this.refresh(true).catch(() => {}); } return null; }
  }
  /** One step of the background loop (also called directly by tests). */
  async pollOnce() {
    if (this._polling) return this._polling;
    this._polling = (async () => {
      const now = this.clock();
      const st = this.status;
      const every = !this.snap ? 0 : st === 'lobby' || this.waiting() ? POLL.waitMs : st === 'playing' ? POLL.playMs : POLL.idleMs;
      if (now - this._lastBeat >= POLL.heartbeatMs && st !== 'finished' && st !== 'cancelled') await this.heartbeat();
      if (now - this._lastPoll >= every) await this.refresh().catch(() => {});
      const r = this.room;
      if (r && r.status === 'playing' && ((r.deadline != null && this.serverNow() >= r.deadline + 500) || r.needs_tick)) await this.tick();
      this.emit('tick', null);
    })().finally(() => { this._polling = null; });
    return this._polling;
  }
  start() {
    if (this._running) return; this._running = true;
    const loop = async () => {
      if (!this._running) return;
      try { if (!(globalThis.document && globalThis.document.hidden)) await this.pollOnce(); } catch (e) { /* offline: next loop */ }
      if (this._running) this._timer = this.T.setTimeout(loop, 1000);
    };
    this._lastBeat = 0; loop();
  }
  stop() { this._running = false; if (this._timer) (this.T.clearTimeout || clearTimeout)(this._timer); this._timer = null; }

  /* ------------------------------------------------------------------ intents */
  _pending(v) {
    if (!this.storage) return v === undefined ? this._mem || null : (this._mem = v);
    try {
      if (v === undefined) { const all = JSON.parse(this.storage.getItem(PKEY) || '{}'); return (all && all[this.roomId]) || null; }
      const all = JSON.parse(this.storage.getItem(PKEY) || '{}') || {};
      if (v) all[this.roomId] = v; else delete all[this.roomId];
      this.storage.setItem(PKEY, JSON.stringify(all));
    } catch (e) { /* storage blocked: memory only */ this._mem = v; }
    return v;
  }
  /** Send one intent. Throws Error{code} on refusal (409 stale adopts the server's view first). One at a time. */
  async act(code, args = []) {
    if (this.inflight) throw err('busy', 'רגע — הפעולה הקודמת עוד בדרך');
    if (!this.snap) await this.refresh(true);
    const intent = { action_id: newActionId(), state_version: this.stateVersion, code, args: (args || []).filter((x) => x !== undefined) };
    this._pending({ ...intent, at: this.clock() });
    return this._send(intent);
  }
  async _send(intent) {
    this.inflight = intent; this.emit('busy', { busy: true, code: intent.code });
    try {
      for (let i = 0; ; i++) {
        let body;
        try { body = await this.net.roomFn('act', this.roomId, intent); }
        catch (e) {
          if (e.code === 'offline' && i < POLL.offlineRetries) { await sleep(600 * (i + 1), this.T); continue; }   // same action_id
          if (e.code !== 'offline') this._pending(null);   // answered: the intent is settled (refused); offline keeps it for a reload
          this.lastError = e;
          if (e.code === 'stale' && e.body && e.body.view && this.snap) { this.snap.me.state_version = e.body.state_version; this.snap.me.view = e.body.view; this.emit('change', {}); }
          if (['stale', 'room_not_playing', 'seat_finished', 'not_your_roll', 'version_changed'].includes(e.code)) await this.refresh(true).catch(() => {});
          if (e.code === 'not_in_room') { this.fatal = e.code; this.emit('fatal', e); }
          throw e;
        }
        this._pending(null); this.lastError = null;
        this._clock(body.now);
        if (this.snap && this.snap.me) {
          const m = this.snap.me;
          m.state_version = body.replayed ? body.current_state_version : body.state_version;
          if (body.view) m.view = body.view;
          if (typeof body.done === 'boolean') m.done = body.done;
          if (intent.code === 'r') m.rolled = true;
          const r = this.snap.room;
          if (body.replayed || body.room_version !== r.version + 1 || body.round_now !== r.round || body.room_status !== r.status) {
            await this.refresh(true).catch(() => {});        // the round closed / someone else acted / a replay: take the snapshot
          } else { r.version = body.room_version; }
        }
        this.emit('change', { acted: intent.code });
        return body;
      }
    } finally { this.inflight = null; this.emit('busy', { busy: false }); }
  }
  /** After a reload / reconnect: resend an unacknowledged intent with its SAME action_id (the server applies it at most once). */
  async resumePending() {
    const p = this._pending(); if (!p) return null;
    if (this.clock() - (p.at || 0) > 30 * 60e3) { this._pending(null); return null; }
    const { at: _at, ...intent } = p;
    try { return await this._send(intent); } catch (e) { if (e.code !== 'offline') this._pending(null); return null; }
  }
  react(kind) { return this.net.roomReact(this.roomId, kind); }

  /* ------------------------------------------------------------------ game.js hook API (S = the game's state, mutated in place) */
  /** Copy the server's redacted view into S (same object: every reference game.js holds stays valid). S.ui is kept. */
  adopt(S) {
    const v = this.state; if (!S || !v) return S;
    const ui = S.ui;
    for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, JSON.parse(JSON.stringify(v)));
    if (ui) S.ui = ui;
    return S;
  }
  /** E.rollDice(S) in a room: intent 'r' (= roll + landing, atomic on the server). → the roll's `out` (dice, steps, paydays…). */
  async roll(S) {
    const b = await this.act('r');
    this.adopt(S);
    this._landing = b.event !== undefined ? b.event : this.event;
    return { ok: true, ...(b.out || {}), end: b.end || null };
  }
  /** E.landing(S) || E.currentEvent(S) in a room: the server already resolved the landing in 'r' — this hands its card over. */
  landing() { const ev = this._landing !== undefined ? this._landing : this.event; this._landing = undefined; return ev || null; }
  currentEvent() { return this.event || null; }
  /** E.choose(S, ev, optId, params) in a room. Refusals come back like the engine's ({ok:false, error}) so the card shows them. */
  async choose(S, ev, optId, params = {}) {
    const args = [String(optId)]; if (params && params.qty != null) args.push(+params.qty);
    let b;
    try { b = await this.act('c', args); }
    catch (e) {
      if (['illegal_action', 'stale', 'busy', 'rate_limited'].includes(e.code)) { this.adopt(S); return { ok: false, error: (e.body && e.body.msg) || e.message, code: e.code, event: this.event }; }
      throw e;
    }
    this.adopt(S);
    return this._result(b);
  }
  /** Any other engine mutation (takeLoan, setPlan, invest, …) by its engine name. Refused ones → {ok:false}. */
  async call(name, S, ...args) {
    const code = ROOM_CODE[name];
    if (!code) return { ok: false, error: 'לא זמין במשחק בחדר', code: 'room_refused' };
    let b;
    try { b = await this.act(code, args); }
    catch (e) {
      if (['illegal_action', 'stale', 'busy', 'rate_limited', 'not_your_roll'].includes(e.code)) { this.adopt(S); return { ok: false, error: (e.body && e.body.msg) || e.message, code: e.code }; }
      throw e;
    }
    this.adopt(S);
    return this._result(b);
  }
  _result(b) {
    const out = b.out || {};
    return { ...out, ok: out.ok !== false, event: b.event !== undefined ? b.event : this.event, end: b.end ? { ...b.end, room: true } : null };
  }
  /** game.js: no local saves / server checkpoints / ⚡ in a room (the server holds the game). */
  persistOff() { return true; }
}
