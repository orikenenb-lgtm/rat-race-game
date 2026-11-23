#!/usr/bin/env node
// Wave 3b: js/remote.js (RemoteDriver) + the REAL js/net.js against the offline fake over HTTP (tests/fakebackend.py --serve, rooms in
// tests/fakeroom.mjs = room_core.js + the pinned engine). Each identity is its own net.js module instance (own credentials); every
// call is an HTTP request. fetch is shimmed: any https://<ref>.supabase.co URL is rewritten to the local fake, anything else is
// refused — nothing can reach a real Supabase project.
//   node tests/remote_driver.test.mjs [--port=8793]
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { botIntent, prng } from './lib/room_bot.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)); const ROOT = join(HERE, '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const port = +arg('port', '8793'); const TARGET = `http://127.0.0.1:${port}`;
const child = spawn('python3', [join(HERE, 'fakebackend.py'), '--serve', String(port)], { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' } });
process.on('exit', () => child.kill());

/* ---------------- fetch shim: supabase → fake; a switchable "network" to lose answers */
const realFetch = globalThis.fetch;
const NET = { loseRoomAnswers: 0, dropRoomRequests: 0, roomActs: 0 };
globalThis.fetch = async (url, opts) => {
  const u = String(url);
  const m = u.match(/^https:\/\/[a-z0-9]+\.supabase\.co(\/.*)$/);
  if (!m) throw new Error('blocked non-fake request ' + u);
  const isAct = m[1] === '/functions/v1/room' && /"op":"act"/.test(String(opts && opts.body));
  if (isAct) NET.roomActs++;
  if (isAct && NET.dropRoomRequests > 0) { NET.dropRoomRequests--; throw new TypeError('Failed to fetch'); }      // never reached the server
  const res = await realFetch(TARGET + m[1], opts);
  if (isAct && NET.loseRoomAnswers > 0) { NET.loseRoomAnswers--; await res.text(); throw new TypeError('Failed to fetch'); }   // applied, answer lost
  return res;
};
const mem = () => { const d = new Map(); return { getItem: (k) => (d.has(k) ? d.get(k) : null), setItem: (k, v) => d.set(k, String(v)), removeItem: (k) => d.delete(k) }; };
globalThis.localStorage = mem();
for (let i = 0; i < 150; i++) { try { if ((await realFetch(TARGET + '/__fake/health')).ok) break; } catch (e) { /* not up */ } await sleep(100); }
const advance = (seconds) => realFetch(TARGET + '/__fake/advance', { method: 'POST', body: JSON.stringify({ seconds }) });

const { RemoteDriver, ROOM_CODE } = await import(pathToFileURL(join(ROOT, 'js/remote.js')).href);
let n = 0;
async function identity(name) {
  const { net } = await import(pathToFileURL(join(ROOT, 'js/net.js')).href + `?id=${++n}`);
  await net.register(name, null);
  return net;
}
let passed = 0, failed = 0;
const check = (name, ok, ev) => { if (ok) { passed++; console.log(`PASS  ${name}`); } else { failed++; console.log(`FAIL  ${name}  ${String(JSON.stringify(ev)).slice(0, 400)}`); } };
const fast = { setTimeout: (f, ms) => setTimeout(f, Math.min(ms, 20)), clearTimeout };
const tag = Math.floor(Math.random() * 900 + 100);
const [A, B, C] = await Promise.all([`טסט-דרייבר-א${tag}`, `טסט-דרייבר-ב${tag}`, `טסט-דרייבר-ג${tag}`].map(identity));

/* ---------------- lobby through net.js */
const made = await A.roomCreate({ world: 'w1', max_rounds: 10, end: 'all', turn_secs: 60 }, null);
const ROOM = made.room_id;
check('net.roomCreate → {room_id, code}', !!ROOM && /^[A-Z2-9]{6}$/.test(made.code), made);
let e = null; try { await B.roomJoin('ZZZZZ9'); } catch (x) { e = x; }
check('net.roomJoin(unknown) → Hebrew error + code room_not_found', e && e.code === 'room_not_found' && /חדר/.test(e.message), e && [e.code, e.message]);
check('net.roomJoin lower-case code → seat 1', (await B.roomJoin(made.code.toLowerCase())).seat === 1);
await C.roomJoin(made.code);
const dA = new RemoteDriver({ net: A, roomId: ROOM, storage: mem(), conn: 'tab-a-000001', timers: fast });
const dB = new RemoteDriver({ net: B, roomId: ROOM, storage: mem(), conn: 'tab-b-000001', timers: fast });
const sC = mem(); const dC = new RemoteDriver({ net: C, roomId: ROOM, storage: sC, conn: 'tab-c-000001', timers: fast });
await Promise.all([dA, dB, dC].map((d) => d.refresh(true)));
check('driver snapshot: lobby, A is host, B is not', dA.status === 'lobby' && dA.isHost && !dB.isHost && dA.seats.length === 3, [dA.status, dA.isHost, dB.isHost]);
e = null; try { await B.roomFn('start', ROOM); } catch (x) { e = x; }
check('net.roomFn start by non-host → 403 not_host', e && e.status === 403 && e.code === 'not_host', e && [e.status, e.code]);
for (const x of [A, B, C]) await x.roomReady(ROOM, true, null);
const st0 = await A.roomFn('start', ROOM);
check('host starts through net.roomFn → round 1', st0.round === 1 && !!st0.deadline, st0);
await Promise.all([dA, dB, dC].map((d) => d.refresh()));
check('canRoll for every seat at round open; server clock offset known', [dA, dB, dC].every((d) => d.canRoll()) && Number.isFinite(dA.offset) && dA.secondsLeft() > 0, [dA.canRoll(), dA.secondsLeft()]);

/* ---------------- double click (local) + roll through the hook API */
const S = { ui: { seq: 7, keep: 'me' } };
const v0 = dA.stateVersion;
const p1 = dA.roll(S); let busyErr = null; try { await dA.act('r'); } catch (x) { busyErr = x; }
const out = await p1;
check('double click: a second intent while one is in flight is refused locally (busy)', busyErr && busyErr.code === 'busy', busyErr && busyErr.code);
check('roll(S): one server apply, S adopts the redacted view in place (ui kept), out has dice/steps', dA.stateVersion === v0 + 1 && S.ui.keep === 'me' && S.month === dA.state.month && !('rng' in S) && Array.isArray(out.steps) && (out.dice || out.die), { sv: dA.stateVersion, v0, keys: Object.keys(out) });
check('after the roll: canRoll() false (one roll per round), me.rolled', !dA.canRoll() && dA.me.rolled, [dA.canRoll(), dA.me.rolled]);
const ev = dA.landing(S);
check('landing() hands over the server-described card once', (ev === null || typeof ev.title === 'string') && dA.landing(S) === (dA.event || null), ev && ev.title);
// resolve A's round through choose() with safe options
for (let i = 0; i < 12 && dA.event; i++) {
  const o = dA.event.options.find((x) => x.enabled && ['pass', 'skip', 'ok', 'done', 'decline', 'no', 'later'].includes(x.id)) || dA.event.options.find((x) => x.enabled);
  const r = await dA.choose(S, dA.event, o.id, o.needsQty ? { qty: 1 } : {});
  if (r.ok === false) { check('choose refusal comes back engine-shaped', typeof r.error === 'string', r); break; }
}
check('choose(): A done for the round → waiting()', dA.waiting() && !dA.event, { w: dA.waiting(), ev: dA.event && dA.event.title });
const refused = await dA.call('retire', S);
check('call(): engine calls a room refuses (retire) → {ok:false} without a request', refused.ok === false && refused.code === 'room_refused', refused);
check('ROOM_CODE maps the 11 allowed mutations', Object.keys(ROOM_CODE).length === 11 && ROOM_CODE.takeLoan === 'L' && ROOM_CODE.resolveStory === 'Q');

/* ---------------- lost answer → same action_id retried (applied once) */
const vB = dB.stateVersion; const acts0 = NET.roomActs;
NET.loseRoomAnswers = 1;
const rb = await dB.act('r');
check('lost answer: retried with the SAME action_id → replayed, applied once', rb.replayed === true && dB.stateVersion === vB + 1 && NET.roomActs - acts0 === 2, { rep: rb.replayed, sv: dB.stateVersion, vB, n: NET.roomActs - acts0 });
/* ---------------- all retries lost → pending kept → a "reload" (new driver, same storage) resends it once */
const vC = dC.stateVersion;
NET.loseRoomAnswers = 4;
let lost = null; try { await dC.act('r'); } catch (x) { lost = x; }
const pend = JSON.parse(sC.getItem('rr2-room-pending') || '{}')[ROOM];
check('every answer lost → offline error, the intent stays pending in storage', lost && lost.code === 'offline' && pend && pend.code === 'r', { code: lost && lost.code, pend });
const dC2 = new RemoteDriver({ net: C, roomId: ROOM, storage: sC, conn: 'tab-c-000002', timers: fast });
await dC2.refresh(true);
const back = await dC2.resumePending();
check('reload: resumePending resends the same action_id → replayed, the roll counted once', back && back.replayed === true && dC2.stateVersion === vC + 1 && !JSON.parse(sC.getItem('rr2-room-pending') || '{}')[ROOM], { back: back && back.replayed, sv: dC2.stateVersion, vC });
/* ---------------- request that never arrived → retried transparently */
NET.dropRoomRequests = 1;
const dropped = await dB.act('L', []).catch((x) => x);
check('a request that never reached the server is retried (same id) and applied once', dropped && dropped.ok === true && !dropped.replayed, dropped && (dropped.code || dropped.replayed));
/* ---------------- stale view → 409 stale, server view adopted */
const dB2 = new RemoteDriver({ net: B, roomId: ROOM, storage: mem(), conn: 'tab-b-000002', timers: fast });
await dB2.refresh(true); dB2.snap.me.state_version -= 1;
let st = null; try { await dB2.act('R', []); } catch (x) { st = x; }
check('stale state_version → 409 stale; the driver adopts the server\'s version', st && st.code === 'stale' && dB2.stateVersion === dB.stateVersion, { code: st && st.code, a: dB2.stateVersion, b: dB.stateVersion });
/* ---------------- two tabs: the newest connection is primary */
await dB.heartbeat(); await dB2.heartbeat();
const hb = await dB.heartbeat();
check('two tabs of one identity: the newer connection is primary, the older is not', dB.primary === false && dB2.primary === true && hb && hb.primary === false, [dB.primary, dB2.primary]);
await dB.takeOver();
check('takeOver(): the old tab becomes primary again (new connection id)', dB.primary === true);

/* ---------------- timeout: the deadline passes → pollOnce ticks → the round closes with the safe autopilot */
const r1 = dA.room.round;
await advance(200);
dA._lastTick = 0; dA._lastPoll = 0; dA._lastBeat = 0;
await dA.pollOnce(); await dA.refresh(true);
check('deadline passed: the driver\'s loop ticks; the server closes the round (autopilot for idle seats)', dA.room.round === r1 + 1 && dA.snap.events.some((x) => x.kind === 'autopilot'), { r: dA.room.round, r1, ev: dA.snap.events.slice(-6).map((x) => x.kind) });

/* ---------------- play to the end through the driver only; finish exactly once */
const bots = [[dA, 'pass'], [dB, 'greedy'], [dC2, 'random']];
for (let k = 0; k < 60; k++) {
  await dA.refresh(true); if (dA.status !== 'playing') break;
  for (const [d, pol] of bots) {
    await d.refresh(true); const rr = prng(k * 31 + d.conn.length);
    for (let j = 0; j < 30 && d.status === 'playing' && d.active(); j++) {
      const it = botIntent({ view: d.view, rolled: d.me.rolled }, pol, rr); if (!it) break;
      try { await d.act(it.code, it.args); } catch (x) { if (x.code === 'illegal_action' && it.code !== 'c') { try { await d.act('r'); } catch (y) { break; } } else if (x.code === 'rate_limited') await advance(61); else break; }
    }
  }
  const before = dA.room.round; await dA.refresh(true);
  if (dA.status === 'playing' && dA.room.round === before) { await advance(200); dA._lastTick = 0; await dA.tick(true); }
}
await Promise.all([dA, dB, dC2].map((d) => d.refresh(true)));
const res = JSON.stringify(dA.room.results);
check('finished: the same server-ranked results in every identity; the seed is revealed', [dA, dB, dC2].every((d) => d.status === 'finished' && JSON.stringify(d.room.results) === res) && dA.room.seed > 0, [dA.status, dB.status]);
const rk = JSON.parse(res).map((x) => x.rank);
check('ranks are 1-based and ties share a rank (never a time key)', rk[0] === 1 && rk.every((x, i) => i === 0 || x >= rk[i - 1]) && JSON.parse(res).every((x) => !('time' in x) && !('duration' in x)), rk);
let fin = null; try { await dB.act('r'); } catch (x) { fin = x; }
check('acting after the finish → room_not_playing', fin && fin.code === 'room_not_playing', fin && fin.code);
await advance(3 * 3600); await dB.tick(true); await dA.refresh(true);
check('finish exactly once: later ticks change nothing', JSON.stringify(dA.room.results) === res);
check('net.myRooms lists the finished room', (await A.myRooms()).some((x) => x.id === ROOM && x.status === 'finished'));

console.log(`\n${passed} passed, ${failed} failed`);
child.kill();
process.exit(failed ? 1 : 0);
