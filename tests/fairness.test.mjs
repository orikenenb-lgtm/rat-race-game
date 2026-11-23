#!/usr/bin/env node
// Fairness gate (BRIEF §25, docs/FAIRNESS.md, design O1 §2.4): with the SAME seed, two OPPOSITE policies (always pass vs. greedy
// buy/borrow/invest) must see the same randomness. Per turn: all 15 RNG stream positions equal, the dice and the tile equal; the
// first card of a landing may differ only in the documented decision-dependent kinds (business tile: your own business's management
// card instead of the offer · a life card you are not eligible for is substituted · a doodad scaled/swapped to your situation).
// A future engine change that makes a draw depend on a decision fails here BEFORE a re-pin.
// Run: node tests/fairness.test.mjs [seedsPerWorld=12]
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import { STREAMS } from '../js/rng.js';
import * as C from '../supabase/functions/room/room_core.js';
import { prng } from './lib/random-player.mjs';

const N = +(process.argv[2] || 12);
let passed = 0, failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); }
}
/** The documented exceptions (docs/FAIRNESS.md §3): the card on the same tile may differ only for these tile types. */
export const ALLOWED_CARD_DIFF = new Set(['business', 'life', 'doodad']);
const SAFE = ['pass', 'skip', 'ok', 'done'];

function resolve(st, policy, r) {
  for (let n = 0; n < 40 && st.pending && !st.over; n++) {
    const ev = E.currentEvent(st); const en = ev.options.filter((o) => o.enabled);
    let o;
    if (policy === 'pass') o = en.find((x) => x.id === C.safeDefault(ev)) || en.find((x) => SAFE.includes(x.id)) || en[0];
    else {
      const buys = en.filter((x) => x.kind === 'buy' || /^(buy|start|inv:|up:)/.test(x.id));
      o = n < 6 && buys.length ? buys[Math.floor(r() * buys.length)] : (en.find((x) => SAFE.includes(x.id)) || en[0]);
    }
    E.choose(st, null, o.id, o.needsQty ? { qty: Math.max(1, Math.min(3, o.max || 1)) } : {});
  }
}
function card(st) { const ev = E.currentEvent(st); return ev ? `${ev.type}|${ev.title}` : null; }

for (const rules of [4, 3]) {
  const stats = { games: 0, turns: 0, streamDiff: 0, diceDiff: 0, tileDiff: 0, cardDiff: 0, byKind: {}, ended: { pass: 0, greedy: 0 } };
  await test(`same seed, opposite policies (rules ${rules}): 15 streams aligned after every turn, same dice and tiles, card differences only of the documented kinds`, async () => {
    for (const w of C.WORLDS) for (let k = 1; k <= N; k++) {
      const ch = E.getWorld(w).characters; const cfg = { worldId: w, charId: ch[k % ch.length].id, seed: 7000 + k * 7919 + w.charCodeAt(1), mode: 'challenge', dateKey: rules === 4 ? '2026-12-10' : '2026-11-25' };
      const A = E.createGame(cfg); const B = E.createGame(cfg); const r = prng(k);
      assert.equal(A.rules, rules);
      stats.games++;
      for (let t = 0; t < 400 && !A.over && !B.over; t++) {
        if (r() < 0.08) { try { E.takeLoan(B); } catch (e) { /* cap */ } }
        if (r() < 0.05) { try { E.invest(B, 'buy', 1); } catch (e) { /* none */ } }
        resolve(A, 'pass', r); resolve(B, 'greedy', r);          // a business panel opened between rolls
        if (A.over || B.over) break;
        E.rollDice(A); E.rollDice(B);
        if (JSON.stringify(A.lastRoll.dice) !== JSON.stringify(B.lastRoll.dice)) stats.diceDiff++;
        if (A.pos !== B.pos) stats.tileDiff++;
        if (!A.over) E.landing(A); if (!B.over) E.landing(B);
        const ca = card(A), cb = card(B);
        if (ca && cb && ca !== cb) {
          const kind = A.pending.type === B.pending.type ? A.pending.type : `${A.pending.type}/${B.pending.type}`;
          stats.cardDiff++; stats.byKind[kind] = (stats.byKind[kind] || 0) + 1;
          assert.ok(ALLOWED_CARD_DIFF.has(A.pending.type) && ALLOWED_CARD_DIFF.has(B.pending.type), `undocumented card divergence ${ca} ≠ ${cb} (${w} seed ${cfg.seed} turn ${t})`);
        }
        resolve(A, 'pass', r); resolve(B, 'greedy', r);
        stats.turns++;
        for (const s of STREAMS) if (A.rng[s] !== B.rng[s]) { stats.streamDiff++; assert.fail(`stream ${s} diverged (${w} seed ${cfg.seed} turn ${t})`); }
      }
      if (A.over) stats.ended.pass++; if (B.over) stats.ended.greedy++;
    }
    assert.equal(stats.diceDiff, 0); assert.equal(stats.tileDiff, 0); assert.equal(stats.streamDiff, 0);
    console.log(`   ${stats.games} games, ${stats.turns} turns compared; card differences ${stats.cardDiff} (${(100 * stats.cardDiff / Math.max(1, stats.turns)).toFixed(1)} %): ${JSON.stringify(stats.byKind)}`);
  });
}

await test('a live room: seats with opposite policies roll the same dice and land on the same tiles every round', async () => {
  const pid = (i) => ({ id: `00000000-0000-4000-8000-0000000000${i}0`, nickname: 'טסט' + i });
  for (const w of C.WORLDS) {
    const room = C.newRoom(E, { id: 'r-' + w, code: 'ABCDEF', seed: 4242 + w.charCodeAt(1), topic: 't', engine_sha: 'x' }, pid(1), { world: w, end: 'all', max_rounds: 30 }, Date.UTC(2026, 11, 10, 8));
    let now = Date.UTC(2026, 11, 10, 8);
    C.dispatch(E, room, 'join', pid(2), {}, now);
    for (const i of [1, 2]) C.dispatch(E, room, 'ready', pid(i), { ready: true }, now);
    assert.equal(C.dispatch(E, room, 'start', pid(1), {}, now).status, 200);
    const r = prng(9); let rounds = 0;
    while (room.status === 'playing' && rounds < 30) {
      const round = room.round;
      for (const [i, pol] of [[1, 'pass'], [2, 'greedy']]) {
        for (let n = 0; n < 60; n++) {
          const me = C.snapshot(room, pid(i), null, now).body.me; const s = room.seats.find((x) => x.player_id === pid(i).id);
          if (!['playing', 'away'].includes(s.status) || room.round !== round) break;
          const ev = me.view.event; let intent;
          if (ev) { const en = ev.options.filter((o) => o.enabled); const o = pol === 'pass' ? (en.find((x) => SAFE.includes(x.id)) || en[0]) : (n < 6 && en.find((x) => x.kind === 'buy')) || en.find((x) => SAFE.includes(x.id)) || en[0]; intent = { code: 'c', args: o.needsQty ? [o.id, 1] : [o.id] }; }
          else if (!me.rolled) intent = { code: 'r', args: [] }; else break;
          now += 500;
          const res = C.dispatch(E, room, 'act', pid(i), { action_id: `f-${w}-${i}-${round}-${n}`, state_version: s.state_version, ...intent }, now);
          assert.equal(res.status, 200, JSON.stringify(res.body).slice(0, 200));
          if (intent.code === 'r') { /* compare after both rolled */ }
        }
      }
      const [s1, s2] = room.seats.map((s) => s.state);
      if (!s1.over && !s2.over) { assert.deepEqual(s1.lastRoll.dice, s2.lastRoll.dice, `round ${round}`); assert.equal(s1.pos, s2.pos); for (const k of STREAMS) assert.equal(s1.rng[k], s2.rng[k], `stream ${k} round ${round}`); }
      rounds++;
    }
    assert.ok(rounds >= 5, `${w}: ${rounds} rounds`);
  }
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
