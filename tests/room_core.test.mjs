#!/usr/bin/env node
// room_core (live rooms, BRIEF §21–§23) — unit tests in Node against the SAME files the Edge Function `room` runs:
// the pinned engine bundle (tools/build-edge.mjs → verify-result/engine_loader.js) + supabase/functions/room/room_core.js.
// The room object is JSON round-tripped after every call (= what the Edge Function stores in Postgres between requests).
// The "client" engine is js/engine.js (the browser copy): every server step is replayed locally and compared byte for byte.
// Run: node tests/room_core.test.mjs [rooms=6]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collect, bundleText } from '../tools/build-edge.mjs';
import { loadEngine } from '../supabase/functions/verify-result/engine_loader.js';
import { verifyGame } from '../supabase/functions/verify-result/verify_core.js';
import * as C from '../supabase/functions/room/room_core.js';
import * as L from '../js/engine.js';
import { next as rngNext } from '../js/rng.js';
import { botIntent, prng } from './lib/room_bot.mjs';

const ROOMS = +(process.argv[2] || 6);
const E = await loadEngine(bundleText(collect()));        // the server's engine (pinned bundle, data: URLs)
let passed = 0, failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); }
}
const T_R4 = Date.UTC(2026, 11, 10, 8);                  // 2026-12-10 Israel → rules 4 (after RULES4_FROM 2026-12-07)
const T_R3 = Date.UTC(2026, 10, 25, 8);                  // 2026-11-25 → rules 3
const P = (i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, nickname: `טסט${i}`, pawn: null });
const IDS = (k = 1) => ({ id: `10000000-0000-4000-8000-${String(k).padStart(12, '0')}`, code: 'ABCDEF', seed: 1000 + k * 7919, topic: 'f'.repeat(32), engine_sha: 'pin' });
const rt = (o) => JSON.parse(JSON.stringify(o));
let AID = 0; const aid = () => `act-${(++AID).toString(36).padStart(8, '0')}`;

/** A room driven through dispatch(), persisted (JSON) between calls, with a local client engine per seat. */
class Harness {
  constructor(settings, n, { now = T_R4, k = 1 } = {}) {
    this.now = now; this.players = Array.from({ length: n }, (_, i) => P(i + 1 + k * 10));
    this.room = rt(C.newRoom(E, IDS(k), this.players[0], settings, now));
    this.local = []; this.steps = 0; this.pace = 250;   // 0.25 s between intents (rate limit 120/min); deadlines may still pass → autopilot + stale, like real play
  }
  call(op, i, args = {}, ctx) { if (op === 'act') this.now += this.pace; const res = C.dispatch(E, this.room, op, this.players[i], args, this.now, ctx); if (op !== 'state') this.room = rt(this.room); this.mirror(res.actions); return res; }
  seat(i) { return this.room.seats.find((s) => s.player_id === this.players[i].id); }
  startAll(chars = []) {
    for (let i = 1; i < this.players.length; i++) assert.equal(this.call('join', i).status, 200);
    this.players.forEach((_, i) => assert.equal(this.call('ready', i, { ready: true, char: chars[i] ?? null }).status, 200));
    const r = this.call('start', 0); assert.equal(r.status, 200, JSON.stringify(r.body));
    this.local = this.room.seats.map((s) => L.createGame(C.seatConfig(this.room, s.char_id)));
    this.check();
  }
  /** apply server action rows to the local client engines (player rows are applied by act(); autopilot rows here). */
  mirror(rows) { for (const a of rows || []) if (a.by === 'timeout') this.localApply(a.seat, a.a); }
  localApply(seatNo, a) {
    const st = this.local[this.room.seats.findIndex((s) => s.seat === seatNo)];
    C.applyIntent(L, st, a[0], a.slice(1));
  }
  check(only = null) {   // byte parity: server state === local client engine state (every seat, or just the one that acted)
    this.room.seats.forEach((s, i) => { if (s.state && (only == null || i === only)) assert.equal(JSON.stringify(s.state), L.serialize(this.local[i]), `seat ${s.seat} diverged at step ${this.steps}`); });
  }
  act(i, code, args = [], extra = {}) {
    const s = this.seat(i); const body = { action_id: extra.action_id || aid(), state_version: extra.state_version ?? s.state_version, code, args, ...(extra.engine ? { engine: extra.engine } : {}) };
    const res = this.call('act', i, body);
    if (res.status === 200 && !res.body.replayed) { this.localApply(s.seat, [code, ...args]); this.steps++; }
    return { res, body };
  }
  me(i) { const r = this.call('state', i); return r.body.me; }
  /** play until the room ends (bots, one intent per seat per pass). */
  play(policies, r, { check = true, onState } = {}) {
    for (let guard = 0; this.room.status === 'playing' && guard < 20000; guard++) {
      let moved = false;
      for (let i = 0; i < this.players.length && this.room.status === 'playing'; i++) {
        const s = this.seat(i); if (!s || !['playing', 'away'].includes(s.status)) continue;
        const me = this.me(i); const it = botIntent(me, policies[i % policies.length], r); if (!it) continue;
        let { res } = this.act(i, it.code, it.args);
        if (res.status === 422 && it.code !== 'c') ({ res } = this.act(i, 'r'));
        if (res.status === 409 && res.body.error === 'stale') this.stale = (this.stale || 0) + 1;      // a timeout moved the seat: re-read, like a client
        else if (res.status === 429) { this.limited = (this.limited || 0) + 1; this.now += 1000; }
        else assert.ok(res.status === 200 || (res.status === 409 && ['room_not_playing', 'seat_finished', 'not_your_roll'].includes(res.body.error)), `act ${it.code} → ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
        moved = true;
        if (check) this.check(this.steps % 20 ? this.room.seats.findIndex((x) => x.player_id === this.players[i].id) : null);
        if (onState && this.steps % 2 === 0) onState(this, i);
      }
      if (!moved) { this.now = this.room.deadline + 1; this.call('tick', 0); }
    }
    if (check) this.check();
    return this.room;
  }
}

/* ---------------------------------------------------------------- settings */
await test('settings: defaults, validation, ranked help is fixed, group privacy needs membership', async () => {
  const s = C.normalizeSettings(E, {});
  assert.deepEqual(s, { world: 'w1', mode: 'ranked', char_policy: 'same', char: 'teacher', help: 'hint', turn_secs: 90, disconnect: 'autopilot', end: 'first_win', max_rounds: 80, privacy: 'code', max_seats: 4, min_seats: 2 });
  for (const bad of [{ world: 'h' }, { world: 'w9' }, { mode: 'x' }, { help: 'guide' }, { turn_secs: 59 }, { turn_secs: 301 }, { max_rounds: 121 }, { max_seats: 5 }, { min_seats: 1 },
    { char: 'lawyer' }, { evil: 1 }, { turn_secs: '90' }, { max_seats: 2, min_seats: 3 }, null, [], 'x']) {
    assert.throws(() => C.normalizeSettings(E, bad), (e) => e.code === 'bad_settings', JSON.stringify(bad));
  }
  assert.equal(C.normalizeSettings(E, { mode: 'casual', help: 'guide' }).help, 'guide');
  assert.equal(C.normalizeSettings(E, { world: 'w2', char_policy: 'choose' }).char, null);
  assert.throws(() => C.newRoom(E, IDS(), P(1), { privacy: 'group' }, T_R4, { group_id: 'g1', groups: [] }), (e) => e.code === 'not_member');
  assert.throws(() => C.newRoom(E, IDS(), P(1), { privacy: 'group' }, T_R4, {}), (e) => e.code === 'bad_settings');
});
await test('group room: a non-member cannot join, a member can', async () => {
  const g = C.newRoom(E, IDS(), P(1), { privacy: 'group' }, T_R4, { group_id: 'g1', groups: ['g1'] });
  assert.equal(C.dispatch(E, g, 'join', P(2), {}, T_R4, { groups: [] }).body.error, 'not_member');
  assert.equal(C.dispatch(E, g, 'join', P(3), {}, T_R4, { groups: ['g1'] }).status, 200);
});

/* ---------------------------------------------------------------- lobby lifecycle */
await test('lobby: join / rejoin same seat / full / ready / start conditions / host leaves → host moves / kick / cancel', async () => {
  const h = new Harness({ max_seats: 3, char_policy: 'choose', world: 'w2' }, 4);
  assert.equal(h.call('join', 1).body.seat, 1);
  assert.equal(h.call('join', 1).body.rejoined, true, 'second connection of the same player = same seat');
  assert.equal(h.call('join', 2).body.seat, 2);
  assert.equal(h.call('join', 3).body.error, 'room_full');
  assert.equal(h.call('start', 1).body.error, 'not_host');
  assert.equal(h.call('start', 0).body.error, 'not_ready');
  assert.equal(h.call('ready', 1, { ready: true, char: 'teacher' }).body.error, 'bad_char', 'w1 character in a w2 room');
  assert.equal(h.call('ready', 1, { ready: true }).body.error, 'bad_char', 'choose policy needs a character');
  assert.equal(h.call('ready', 3, { ready: true, char: 'chef' }).body.error, 'not_in_room');
  for (const [i, c] of [[0, 'lawyer'], [1, 'chef'], [2, 'pm']]) assert.equal(h.call('ready', i, { ready: true, char: c }).status, 200);
  assert.equal(h.call('leave', 0).body.left, true);
  assert.equal(h.room.host_id, h.players[1].id, 'host role moves to the lowest seat');
  assert.equal(h.call('kick', 2, { seat: 1 }).body.error, 'not_host');
  assert.equal(h.call('kick', 1, { seat: 2 }).status, 200);
  assert.equal(h.call('join', 2).body.error, 'room_not_found', 'a kicked player cannot rejoin by code');
  assert.equal(h.call('start', 1).body.error, 'not_enough_players');
  assert.equal(h.call('cancel', 3).body.error, 'not_in_room');
  assert.equal(h.call('cancel', 1).body.status, 'cancelled');
  assert.equal(h.call('join', 3).body.error, 'room_not_found', 'cancelled room: same error as an unknown code');
});
await test('lobby: unready, reactions (fixed list, rate-limited), heartbeat primary connection, lobby expiry by tick', async () => {
  const h = new Harness({}, 2); h.call('join', 1);
  assert.equal(h.call('react', 1, { kind: 'clap' }).status, 200);
  assert.equal(h.call('react', 1, { kind: 'clap' }).body.error, 'rate_limited');
  h.now += 3001; assert.equal(h.call('react', 1, { kind: '<script>' }).body.error, 'bad_reaction');
  let r = h.call('heartbeat', 1, { conn: 'tab-one-0001' }); assert.equal(r.body.primary, true);
  r = h.call('heartbeat', 1, { conn: 'tab-two-0002' }); assert.equal(r.body.primary, true);
  r = h.call('heartbeat', 1, { conn: 'tab-one-0001' }); assert.equal(r.body.primary, false, 'the older tab becomes read-only (UX)');
  h.now += C.LIMITS.lobbyTtlMs + 1; assert.equal(h.call('state', 0).body.room.needs_tick, true);
  h.call('tick', 0); assert.equal(h.room.status, 'cancelled'); assert.equal(h.room.end_reason, 'expired');
});

/* ---------------------------------------------------------------- the protocol (§22) */
await test('intents: bad shapes → bad_action; non-member → not_in_room; out of turn → not_your_roll; illegal → 422', async () => {
  const h = new Harness({}, 2); h.startAll();
  const s0 = h.seat(0);
  for (const bad of [{}, { action_id: 'short', state_version: 0, code: 'r' }, { action_id: 'x'.repeat(65), state_version: 0, code: 'r' }, { action_id: aid(), state_version: -1, code: 'r' },
    { action_id: aid(), state_version: 0, code: 'M', args: ['pro'] }, { action_id: aid(), state_version: 0, code: 'K' }, { action_id: aid(), state_version: 0, code: 'X' }, { action_id: aid(), state_version: 0, code: 'l' },
    { action_id: aid(), state_version: 0, code: 'c', args: [{ $gt: 1 }] }, { action_id: aid(), state_version: 0, code: 'c', args: ['a', 1, 2] }, { action_id: aid(), state_version: 0, code: 'c', args: ['x'.repeat(41)] },
    { action_id: aid(), state_version: 0, code: 'L', args: [Infinity] }, { action_id: "x' or 1=1 --", state_version: 0, code: 'r' }]) {
    const r = h.call('act', 0, bad); assert.equal(r.body.error, 'bad_action', JSON.stringify(bad)); assert.equal(r.status, 400);
  }
  const stranger = { id: '00000000-0000-4000-8000-999999999999', nickname: 'זר' };
  assert.equal(C.dispatch(E, h.room, 'act', stranger, { action_id: aid(), state_version: 0, code: 'r' }, h.now).body.error, 'not_in_room');
  assert.equal(C.dispatch(E, h.room, 'state', stranger, {}, h.now).status, 403);
  assert.equal(h.act(0, 'c', ['pass']).res.status, 422, 'choose without a card');
  assert.equal(h.act(0, 'r').res.status, 200);
  const me = h.me(0); assert.ok(me.view.event, 'a card is open after the roll');
  assert.equal(h.act(0, 'r').res.body.error, 'not_your_roll', 'second roll while the card is open');
  // resolve the card, then try to roll again in the same round
  while (h.me(0).view.event) { const ev = h.me(0).view.event; const o = ev.options.find((x) => x.enabled && ['pass', 'ok', 'skip', 'done'].includes(x.id)) || ev.options.find((x) => x.enabled); h.act(0, 'c', [o.id]); }
  const r2 = h.act(0, 'r').res; assert.equal(r2.status, 409); assert.equal(r2.body.error, 'not_your_roll');
  assert.equal(h.act(0, 'c', ['no-such-option']).res.status, 422);
  assert.equal(s0.seat, 0); h.check();
});
await test('idempotency: the same action_id is applied once and answers the stored response; reused id with another intent → 409', async () => {
  const h = new Harness({}, 2); h.startAll();
  const id = aid(); const v0 = h.seat(0).state_version;
  const a = h.act(0, 'r', [], { action_id: id }).res; assert.equal(a.status, 200);
  const b = h.act(0, 'r', [], { action_id: id, state_version: v0 }).res;   // duplicate delivery (same body)
  assert.equal(b.status, 200); assert.equal(b.body.replayed, true); assert.deepEqual(b.body.out, a.body.out); assert.equal(b.body.state_version, a.body.state_version);
  assert.equal(h.seat(0).state_version, v0 + 1, 'applied exactly once');
  assert.equal(h.act(0, 'L', [], { action_id: id, state_version: v0 + 1 }).res.body.error, 'action_id_reused');
  h.check();
});
await test('optimistic concurrency: two tabs of one player send different intents on the same version → one applies, the other gets 409 stale + the current view', async () => {
  const h = new Harness({}, 2); h.startAll();
  const v = h.seat(1).state_version;
  const t1 = h.act(1, 'L', [], { state_version: v }).res; const t2 = h.act(1, 'r', [], { state_version: v }).res;
  assert.equal(t1.status, 200); assert.equal(t2.status, 409); assert.equal(t2.body.error, 'stale');
  assert.equal(t2.body.state_version, v + 1); assert.ok(t2.body.view && t2.body.view.state, 'stale answer carries the snapshot');
  h.check();
});
await test('version check: a client with another engine hash → 426 version_mismatch', async () => {
  const h = new Harness({}, 2); h.startAll();
  const r = h.act(0, 'r', [], { engine: 'other' }).res; assert.equal(r.status, 426); assert.equal(r.body.error, 'version_mismatch');
  assert.equal(h.act(0, 'r', [], { engine: 'pin' }).res.status, 200);
});
await test('rate limit: 120 intents per seat per minute', async () => {
  const h = new Harness({}, 2); h.startAll(); h.pace = 0;
  let last; for (let i = 0; i < 121; i++) { last = h.act(0, i % 2 ? 'R' : 'L').res; if (last.status !== 200 && i < 120) assert.fail(`intent ${i}: ${JSON.stringify(last.body)}`); }
  assert.equal(last.status, 429); h.now += 60001; assert.equal(h.act(0, 'L').res.status, 200);
});

/* ---------------------------------------------------------------- full games: parity, leak, ranking, finish once */
function secretsOf(st) {
  // RNG-grade numbers only (≥ 6 significant decimals, or ≥ 7-digit integers); short sealed values are checked structurally below
  const nums = new Set(); const add = (x) => { if (typeof x === 'number' && Number.isFinite(x) && !Number.isInteger(x) && String(x).length >= 8) nums.add(String(x)); else if (Number.isInteger(x) && Math.abs(x) >= 1e6) nums.add(String(x)); };
  add(st.seed);
  for (const h of [st.rng, st.bizRng, st.bizStory]) for (const v of Object.values(h || {})) add(v);
  const holder = JSON.parse(JSON.stringify(st.rng)); for (const k of Object.keys(holder)) for (let i = 0; i < 4; i++) add(rngNext(holder, k));
  const p = st.pending;
  if (p) { add(p.negR); add(p.raiseR); add(p.r); if (p.hidden) Object.values(p.hidden).forEach(add); if (p.rv) add(p.rv.close); if (p.dd && p.dd.level < 2) { add(p.dd.f); add(p.dd.vf); add(p.dd.jitter); } if (p.type === 'business') add(p.seed); }
  if (st.life) { add(st.life.raiseR); add(st.life.sideSeed); }
  if (st.story) { (st.story.r || []).forEach(add); for (const it of st.story.inbox || []) Object.values(it.seal || {}).forEach(add); for (const c of Object.values(st.story.chains || {})) if (c && c.seal) Object.values(c.seal).forEach(add); }
  for (const a of st.angels || []) if (a.status === 'active') { add(a.mult); if (!a.signalDone) add(a.signalMult); }
  if (st.world && st.world.coin) st.world.coin.path.slice(st.world.coin.step).forEach(add);
  return nums;
}
function assertNoLeak(st, view) {
  const j = JSON.stringify(view);
  const walk = (o, path) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { assert.ok(!['rng', 'bizRng', 'bizStory', 'actions'].includes(k), `forbidden key ${path}.${k}`); walk(v, path + '.' + k); } };
  walk(view, 'view'); assert.ok(!('seed' in view.state), 'no seed');
  for (const x of secretsOf(st)) assert.ok(!j.includes(x), `sealed value ${x} appears in the view`);
  for (const [k, d] of Object.entries(st.decks || {})) if (Array.isArray(d) && d.length >= 3) assert.ok(!j.includes(JSON.stringify(d)), `deck order ${k} leaked`);
  const v = view.state;
  if (v.pending && v.pending.dd && v.pending.dd.level < 2) assert.ok(v.pending.dd.f === 1 && v.pending.dd.jitter === 0.5);
  if (v.world && v.world.coin) assert.ok(v.world.coin.path.every((x) => x === 1));
  if (v.econ) assert.ok(v.econ.truth.every((x) => x.m <= v.month - 1));
  if (v.life && v.life.friend) assert.equal(v.life.friend.ok, null);
  if (v.pending) { const p = v.pending; if (p.negR != null) assert.equal(p.negR, 0.5); if (p.r != null) assert.equal(p.r, 0.5); if (p.raiseR != null) assert.equal(p.raiseR, 0.5);
    if (p.hidden) assert.deepEqual(p.hidden, { mult: 1, revealIn: 99, signalIn: 99, signalMult: 1 }); if (p.rv) assert.ok(p.rv.close === 0 && p.rv.taker === null); }
  for (const a of v.angels || []) if (a.status === 'active') assert.equal(a.mult, 1);
  if (v.story) { (v.story.r || []).forEach((x) => assert.equal(x, 0.5)); for (const it of v.story.inbox || []) Object.values(it.seal || {}).forEach((x) => assert.equal(x, 0.5)); }
  for (const d of v.rivalDeals || []) if (!d.revealed) assert.equal(d.truth.cf, d.claimedCf);
}
const PARITY = { metrics: 0, event: 0, eventDiff: 0, ddL1: 0, states: 0 };
function parity(st, view) {
  PARITY.states++;
  assert.deepEqual(L.metrics(view.state), L.metrics(st), 'metrics(view) === metrics(state)'); PARITY.metrics++;
  const evV = L.currentEvent(view.state); const evS = view.event;
  if (!st.pending || st.over) { assert.equal(evS, null); return; }
  if (st.pending.dd && st.pending.dd.level === 1) { PARITY.ddL1++; return; }       // documented exception (ONLINE.md §view)
  try { assert.deepEqual(rt(evV), evS); PARITY.event++; } catch (e) { PARITY.eventDiff++; if (PARITY.eventDiff <= 3) console.log('   event diff', st.pending.type, String(e.message).slice(0, 400)); }
}
const finished = [];
await test(`full rooms (${ROOMS}): 2–4 seats × w1–w4 × pass/greedy/random bots — server step-by-step === local client engine, views leak nothing, metrics parity`, async () => {
  const pols = [['random', 'greedy'], ['pass', 'random', 'greedy'], ['greedy', 'pass', 'random', 'random']];
  let acts = 0, ms = 0;
  for (let k = 0; k < ROOMS; k++) {
    const world = C.WORLDS[k % 4]; const n = 2 + (k % 3);
    const casual = k % 6 === 5 ? { mode: 'casual', help: 'guide' } : {};          // one casual room (engine 'free' + help level)
    const h = new Harness({ world, end: k % 2 ? 'all' : 'first_win', max_rounds: k % 3 === 0 ? 120 : 40, char_policy: k % 3 ? 'choose' : 'same', ...casual }, n, { k: k + 2, now: k % 5 === 4 ? T_R3 : T_R4 });
    const chars = E.getWorld(world).characters.map((c) => c.id);
    h.startAll(h.room.settings.char_policy === 'choose' ? h.players.map((_, i) => chars[i % chars.length]) : []);
    const t0 = Date.now();
    h.play(pols[k % 3], prng(k + 1), { onState: (hh, i) => { const s = hh.seat(i); assertNoLeak(s.state, s.view); if (s.state && !s.state.over) parity(s.state, s.view); } });
    ms += Date.now() - t0; acts += h.steps;
    assert.ok(['finished'].includes(h.room.status), h.room.status);
    if (casual.mode) assert.ok(h.room.seats.every((x) => x.state.mode === 'free' && x.state.mentor === 'guide' && !x.state.tutorial && !x.state.bailout), 'casual room = free mode with the chosen help');
    finished.push(h);
  }
  console.log(`   ${acts} intents, ${(ms / Math.max(1, acts)).toFixed(1)} ms/intent incl. JSON persistence; parity: metrics ${PARITY.metrics}/${PARITY.states}, event ${PARITY.event} equal, ${PARITY.eventDiff} differ, ${PARITY.ddL1} dd level-1 skipped`);
  assert.equal(PARITY.eventDiff, 0, 'the view describes the same event as the server (except dd level 1)');
});
await test('finish exactly once: results computed by the server, ranks dense, later intents/ticks change nothing; ranked seats verify like a challenge', async () => {
  let verified = 0, replayed = 0;
  for (const h of finished) {
    const res = h.room.results; assert.ok(Array.isArray(res) && res.length === h.room.seats.length);
    assert.ok(res.every((r) => Number.isInteger(r.rank) && r.rank >= 1));
    const before = JSON.stringify(h.room.results); const v = h.room.version;
    assert.equal(h.act(0, 'r').res.body.error, 'room_not_playing');
    h.now += 3 * 3600e3; h.call('tick', 1); h.call('tick', 0);
    assert.equal(JSON.stringify(h.room.results), before); assert.equal(h.room.status, 'finished');
    assert.ok(h.room.version >= v);
    assert.equal(h.call('state', 0).body.room.seed, h.room.seed, 'the seed is revealed after the room finished');
    for (const s of h.room.seats) {
      const st = L.deserialize(s.state);
      assert.equal(E.serialize(E.replay(C.seatConfig(h.room, st.charId), st.actions)), JSON.stringify(s.state), 'E.replay(cfg, actions) === server state'); replayed++;
      if (h.room.settings.mode !== 'ranked' || !s.state.over) continue;
      const end = st.result;
      const row = { mode: 'challenge', world: st.worldId, profession: st.charId, seed: String(h.room.seed), max_months: null, challenge_day: h.room.date_key,
        status: end.status, months: Math.max(1, Math.min(200, Math.round(end.months))), passive: Math.round(end.passive), expenses: Math.max(0, Math.round(end.expenses)), net_worth: Math.round(end.netWorth),
        claim_stars: end.stars || 0, claim_progress: end.progress ?? null };
      const out = verifyGame(E, row, st.actions); assert.ok(out.ok, `seat ${s.seat}: ${out.error}`); verified++;
    }
  }
  console.log(`   ${replayed} seats: E.replay(seatConfig, actions) === stored state; ${verified} finished ranked seats accepted by verify_core.verifyGame (server audit)`);
});
await test('snapshot: seed hidden while playing, opponents see only public progress of the last closed round, never views/states', async () => {
  const h = new Harness({ world: 'w3' }, 3, { k: 77 }); h.startAll();
  const snap = h.call('state', 1).body;
  assert.equal(snap.room.seed, null); const j = JSON.stringify(snap);
  assert.ok(!j.includes(String(h.room.seed)), 'the seed is nowhere in the snapshot');
  for (const s of snap.seats) { assert.ok(!('view' in s) && !('state' in s)); if (!s.me) assert.deepEqual(Object.keys(s.pub).sort(), ['assets', 'bankrupt', 'expenses', 'month', 'news', 'nw_band', 'over', 'passive', 'progress', 'won']); }
  h.act(0, 'r'); const mid = h.call('state', 1).body.seats.find((s) => s.seat === 0);
  assert.equal(mid.pub_round, 0, 'mid-round progress of an opponent is not published');
  assert.equal(h.call('state', 1, { since: snap.room.version + 99 }).body.unchanged, true);
});

/* ---------------------------------------------------------------- timeouts, away, forfeit, host leaves, cancel, abandonment */
await test('timeout: the autopilot only rolls and takes safe defaults; away after 3 missed rounds, forfeit after 10; the room never stalls', async () => {
  const h = new Harness({ world: 'w1', end: 'all', max_rounds: 40 }, 2, { k: 91 }); h.startAll();
  const r = prng(5); let rounds = 0;
  const assetsOf = (i) => (h.seat(i).state.assets || []).length;
  for (let guard = 0; h.room.status === 'playing' && guard < 4000; guard++) {
    // seat 0 plays (random bot) until done for the round; seat 1 is gone
    const me = h.me(0); const it = botIntent(me, 'random', r);
    if (it) { const { res } = h.act(0, it.code, it.args); if (res.status === 422 && it.code !== 'c') h.act(0, 'r'); h.check(); continue; }
    const a1 = assetsOf(1); const loans = h.seat(1).state.loans; const hold = JSON.stringify(h.seat(1).state.holdings); const ang = (h.seat(1).state.angels || []).length;
    if (h.seat(1).status === 'playing' || h.seat(1).status === 'away') {
      assert.equal(h.call('tick', 0).body.applied, 0, 'no timeout before the deadline');
      h.now = h.room.deadline + 1;
    } else h.now = Math.max(h.now, (h.room.deadline || h.now) + 1);
    h.call('tick', 1); h.check(); rounds++;
    assert.ok(assetsOf(1) <= a1, 'autopilot never buys'); assert.ok((h.seat(1).state.angels || []).length === ang, 'never invests in a startup');
    assert.equal(JSON.stringify(h.seat(1).state.holdings), hold, 'never trades');
    assert.ok(h.seat(1).state.loans - loans <= 0 || h.seat(1).state.stats.forcedLoans > 0, 'never takes a voluntary loan');
    if (h.seat(1).missed === 3) assert.equal(h.seat(1).status, 'away');
  }
  const s1 = h.seat(1);
  assert.equal(s1.status === 'forfeit' || s1.result?.forfeit, true, 'forfeit after 10 missed rounds');
  assert.equal(h.room.status, 'finished'); assert.ok(h.room.events.filter((e) => e.kind === 'autopilot' && e.data.seat === s1.seat).length >= 10 || s1.missed >= 10, `rounds ${rounds} ${h.room.end_reason} r${h.room.round} ` + JSON.stringify(h.room.seats.map((s) => [s.status, s.missed, s.state.over && s.state.result.status])));
  const ev = h.room.events.map((e) => e.kind); assert.ok(ev.includes('away') && ev.includes('forfeit') && ev.includes('autopilot'));
  const fr = h.room.results.find((x) => x.seat === s1.seat); assert.ok(fr.forfeit && fr.rank === 2, 'a forfeit ranks after everyone else');
});
await test('strict disconnect policy: forfeit after 3 missed rounds; a returning away player is playing again', async () => {
  const h = new Harness({ disconnect: 'strict', end: 'all' }, 3, { k: 92 }); h.startAll();
  const playRound = (i) => { for (let n = 0; n < 40; n++) { const it = botIntent(h.me(i), 'pass', prng(n)); if (!it) return; h.act(i, it.code, it.args); } };
  for (let k = 0; k < 3 && h.room.status === 'playing'; k++) { playRound(0); playRound(1); h.now = h.room.deadline + 1; h.call('tick', 0); h.check(); }
  assert.equal(h.seat(2).status, 'forfeit');
  const g = new Harness({ end: 'all' }, 3, { k: 93 }); g.startAll();
  const pr = (i) => { for (let n = 0; n < 40; n++) { const it = botIntent(g.me(i), 'pass', prng(n)); if (!it) return; g.act(i, it.code, it.args); } };
  for (let k = 0; k < 3; k++) { pr(0); pr(1); g.now = g.room.deadline + 1; g.call('tick', 0); g.check(); }
  assert.equal(g.seat(2).status, 'away');
  // round k+1 opened: the away seat was already autopiloted at round open (seat 0/1 still playing) — it can act again next round
  // round 4 opened: seats 0/1 play, so the away seat was autopiloted at round open already
  assert.ok(g.seat(2).rolled_round === g.room.round, 'away seat was autopiloted at round open');
  const me2 = g.me(2); assert.equal(me2.rolled, true); assert.equal(g.seat(2).status, 'playing', 'a snapshot from the away player = back');
  pr(0); pr(1); g.check();
  assert.ok(g.seat(2).rolled_round < g.room.round, 'back: not autopiloted at the next round open');
  const it = botIntent(g.me(2), 'pass', prng(1)); assert.ok(it); assert.equal(g.act(2, it.code, it.args).res.status, 200);
});
await test('host leaves mid-game: forfeit for the host only, the room goes on; leave → next tick closes the round', async () => {
  const h = new Harness({ end: 'all', max_rounds: 12 }, 3, { k: 94 }); h.startAll();
  assert.equal(h.call('leave', 0).body.forfeit, true);
  assert.equal(h.seat(0).status, 'forfeit'); assert.equal(h.room.status, 'playing');
  assert.equal(h.call('state', 1).body.room.needs_tick, true);
  h.play(['pass', 'pass', 'random'], prng(3));
  assert.equal(h.room.status, 'finished'); assert.equal(h.room.results.find((r) => r.seat === 0).forfeit, true);
});
await test('cancel during play needs a majority of the active seats; ranked results are not computed for a cancelled room', async () => {
  const h = new Harness({}, 3, { k: 95 }); h.startAll();
  assert.equal(h.call('cancel', 0).body.status, 'playing');
  assert.equal(h.call('cancel', 0).body.votes, 1, 'a vote counts once');
  assert.equal(h.call('cancel', 1).body.status, 'cancelled');
  assert.equal(h.room.results, null); assert.equal(h.act(2, 'r').res.body.error, 'room_not_playing');
  assert.equal(h.call('state', 2).body.room.seed, h.room.seed, 'cancelled after start: the seed is revealed (nothing ranked)');
});
await test('stuck room: no action for 2 h → abandoned (ranked as-is, exactly once)', async () => {
  const h = new Harness({}, 2, { k: 96 }); h.startAll(); h.act(0, 'r');
  h.now += C.LIMITS.idleMs + 1; h.call('tick', 1);
  assert.equal(h.room.status, 'finished'); assert.equal(h.room.end_reason, 'abandoned'); assert.equal(h.room.results.length, 2);
});
await test('reconnect: snapshot + resend of the unacknowledged intent with the same action_id applies nothing twice', async () => {
  const h = new Harness({}, 2, { k: 97 }); h.startAll();
  const id = aid(); const v = h.seat(0).state_version;
  h.act(0, 'r', [], { action_id: id, state_version: v });                    // the response is "lost" (tab closed)
  const snap = h.me(0); assert.equal(snap.state_version, v + 1); assert.ok(snap.view.event);
  const again = h.act(0, 'r', [], { action_id: id, state_version: v }).res;  // client resends after reload
  assert.equal(again.body.replayed, true); assert.equal(h.seat(0).state_version, v + 1); assert.equal(again.body.current_state_version, v + 1);
  h.check();
});

/* ---------------------------------------------------------------- safe defaults (exhaustive fuzz) */
await test('safe default: exists for every card met in 4 worlds × 3 policies × many seeds, and never buys / invests / borrows', async () => {
  let cards = 0, max = 0; const byType = {}; const gifts = {};
  for (const w of C.WORLDS) for (let s = 1; s <= 30; s++) for (const pol of ['pass', 'greedy', 'random']) {
    const st = L.createGame({ worldId: w, charId: L.getWorld(w).characters[s % L.getWorld(w).characters.length].id, seed: s * 104729 + w.charCodeAt(1), mode: 'challenge', dateKey: s % 4 ? '2026-12-10' : '2026-11-25' });
    const r = prng(s * 31 + pol.length);
    for (let t = 0; t < 400 && !st.over; t++) {
      if (st.phase === 'roll' && !st.pending) { if (pol !== 'pass' && r() < 0.05) L.takeLoan(st); if (pol === 'random' && r() < 0.05) L.setFocus(st, 'ops', 0); if (!st.pending) { L.rollDice(st); if (!st.over) L.landing(st); } }
      for (let n = 0; n < 15 && st.pending && !st.over; n++) {
        const ev = L.currentEvent(st); cards++;
        const id = C.safeDefault(ev); byType[ev.type] = (byType[ev.type] || 0) + 1;
        assert.ok(id, `no safe option: ${ev.type} ${ev.options.map((o) => o.id + (o.enabled ? '' : '✗')).join(',')}`);
        assert.ok(!C.RISKY.test(id) || ['pay', 'go', 'fix'].includes(id), `risky default ${id}`);
        // apply the safe default on a copy: it never adds assets/holdings/angels/businesses and never takes a voluntary loan
        const cp = L.deserialize(L.serialize(st)); const before = { a: cp.assets.length, h: JSON.stringify(cp.holdings), an: (cp.angels || []).length, L: cp.loans, f: cp.stats.forcedLoans, cash: cp.cash + (cp.savings || 0) };
        const res = L.choose(cp, null, id, {}); assert.notEqual(res.ok, false, `${ev.type}/${id}: ${res.error}`);
        const got = cp.assets.length > before.a || (cp.angels || []).length !== before.an || JSON.stringify(cp.holdings) !== before.h;
        assert.ok(!got || (cp.cash + (cp.savings || 0) >= before.cash && cp.loans <= before.L), `${ev.type}/${id} paid for an acquisition`);
        if (got) gifts[ev.type] = (gifts[ev.type] || 0) + 1;
        assert.ok(cp.loans <= before.L || cp.stats.forcedLoans > before.f, `${ev.type}/${id} borrowed`);
        // the game itself continues with the policy's choice
        const en = ev.options.filter((o) => o.enabled);
        const o = pol === 'pass' ? en.find((x) => x.id === id) : pol === 'greedy' ? (en.find((x) => x.kind === 'buy') || en.find((x) => x.id === id)) : en[Math.floor(r() * en.length)];
        L.choose(st, null, o.id, o.needsQty ? { qty: 1 } : {});
      }
      max = Math.max(max, t);
    }
  }
  console.log(`   ${cards} cards checked: ${Object.entries(byType).map(([k, v]) => k + ' ' + v).join(', ')}; free gifts taken (no payment): ${JSON.stringify(gifts)}`);
});
await test('autopilot(): rolls once, resolves the card, stops within the step budget', async () => {
  for (const w of C.WORLDS) for (let s = 1; s <= 20; s++) {
    const st = L.createGame({ worldId: w, seed: s * 7, mode: 'challenge', dateKey: '2026-12-10' });
    for (let k = 0; k < 30 && !st.over; k++) {
      const steps = C.autopilot(L, st, { roll: true });
      assert.equal(steps.filter((x) => x[0] === 'r').length, st.over ? steps.filter((x) => x[0] === 'r').length : 1);
      if (!st.over) { assert.equal(st.pending, null, `left a card open in ${w}`); assert.equal(st.phase, 'roll'); }
    }
  }
});

/* ---------------------------------------------------------------- ranking */
await test('ranking: won → fewer months → progress; ratio tiebreak; equal keys share a rank; forfeits last; never by time', async () => {
  const rows = [
    { seat: 0, status: 'won', months: 30, progress: 1, passive: 9000, expenses: 8000, netWorth: 1, forfeit: false },
    { seat: 1, status: 'won', months: 30, progress: 1, passive: 9000, expenses: 8000, netWorth: 1, forfeit: false, finishedAt: 1 },
    { seat: 2, status: 'won', months: 25, progress: 1, passive: 1, expenses: 8000, netWorth: 1, forfeit: false },
    { seat: 3, status: 'lost', months: 60, progress: 0.9, passive: 1, expenses: 1, netWorth: 1e9, forfeit: false },
    { seat: 4, status: 'won', months: 10, progress: 1, passive: 1, expenses: 1, netWorth: 1, forfeit: true },
    { seat: 5, status: 'capped', months: 40, progress: 0.95, passive: 1, expenses: 1, netWorth: 1, forfeit: false },
  ];
  C.rank(rows, 'escape', 'ratio');
  assert.deepEqual(rows.map((r) => r.rank), [2, 2, 1, 5, 6, 4]);
  C.rank(rows, 'networth', 'ratio'); assert.equal(rows.find((r) => r.seat === 3).rank, 1);
});

/* ---------------------------------------------------------------- SQL draft consistency */
await test('SQL draft rooms: character lists and limits match the engine / room_core', async () => {
  let sql; try { sql = readFileSync(new URL('../supabase/migrations/20261124_rooms.sql', import.meta.url), 'utf8'); } catch (e) { return; }
  for (const w of E.WORLDS.filter((x) => C.WORLDS.includes(x.id))) {
    const m = new RegExp(`when '${w.id}' then array\\[([^\\]]+)\\]`).exec(sql); assert.ok(m, 'char list for ' + w.id);
    assert.deepEqual(m[1].split(',').map((x) => x.trim().replace(/'/g, '')), w.characters.map((c) => c.id), w.id);
  }
  assert.ok(sql.includes('NOT APPLIED — needs owner approval'));
  for (const fn of ['rr_room_create', 'rr_room_join', 'rr_room_ready', 'rr_room_leave', 'rr_room_kick', 'rr_room_cancel', 'rr_room_state', 'rr_room_heartbeat', 'rr_room_react', 'rr_my_rooms']) assert.ok(sql.includes(`public.${fn}(`), fn);
  for (const r of C.REACTIONS) assert.ok(sql.includes(`'${r}'`), r);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
