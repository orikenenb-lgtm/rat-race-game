#!/usr/bin/env node
// Content pools (CATALOG-25 §4, wave A0): js/systems/content.js + js/content/*.js — schema (C-schema / C-free / C-band), fixed draws per pool
// on the lazy stream `content` (C-draws), seed reproducibility (C-seed), the no-repeat window and cooldowns (C-repeat), the fallback chain
// (C-empty), frozen instances (C-freeze), rotation and triggered entries, bounded seen tracking, and that w1–w9 never carry content state.
// Run: node tests/content.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import '../js/worlds/all.js';
import { next, makeStreams, lazyStreamSeed, LAZY_STREAMS, STREAMS } from '../js/rng.js';
import * as CT from '../js/systems/content.js';
import { DEALS_W10 } from '../js/content/deals-w10.js';
import { NEWS } from '../js/content/news.js';
import { RUMORS } from '../js/content/rumor.js';

let passed = 0, failed = 0;
async function test(name, fn) { const t0 = Date.now(); try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }
const W10 = E.getWorld('w10'); const SPEC = W10.content;
const fake = (seed = 1, month = 1) => { const st = { month, turn: 0, rng: { content: lazyStreamSeed(seed, 'content') } }; return st; };
const drawOf = (st) => () => next(st.rng, 'content');

await test('C-schema: every shipped pool entry is well formed (ids, pools, weights, gen ranges, placeholders, preview, C-free)', () => {
  assert.deepEqual(CT.checkPool('deal', DEALS_W10), []); assert.deepEqual(CT.checkPool('news', NEWS), []); assert.deepEqual(CT.checkPool('rumor', RUMORS), []);
  assert.ok(CT.checkEntry({ id: 'deal.x', v: 1, pool: 'deal', w: 1, text: { n: '{who}' } }).some((x) => /\{who\}/.test(x)));
  assert.ok(CT.checkEntry({ id: 'deal.x', v: 1, pool: 'deal', w: 1, gen: { cf: ['yield', 0.01, 0.02] }, text: { n: 'x' } }).some((x) => /C-free/.test(x)), 'pays with no cost and no sealed risk');
  assert.deepEqual(CT.checkEntry({ id: 'deal.x', v: 1, pool: 'deal', w: 1, gen: { cf: ['yield', 0.01, 0.02] }, risk: 'sealed:x', text: { n: 'x' } }).filter((x) => /C-free/.test(x)), []);
  assert.ok(CT.checkEntry({ id: 'news.x', v: 1, pool: 'news', w: 0, text: { n: 'x' } }).some((x) => /positive integer/.test(x)));
  assert.ok(CT.checkEntry({ id: 'deal.x', v: 1, pool: 'deal', w: 1, text: { n: 'x' }, bogus: 1 }).some((x) => /unknown field/.test(x)));
  assert.ok(CT.checkPool('deal', [DEALS_W10[0], DEALS_W10[0]]).some((x) => /duplicate/.test(x)));
  assert.equal(NEWS.filter((e) => e.tags[0] === 'regime').length >= 3, true); for (const t of ['revUp', 'revDown', 'launch', 'lostClient', 'debt', 'merger', 'fraud']) assert.ok(NEWS.some((e) => e.tags.includes(t)), t);
});

await test('C-draws: a selection consumes EXACTLY POOL_D[pool] draws — eligible or not, empty pool or not; init 1 per pool; rotation 1 per pool every 12 paydays', () => {
  for (const pool of ['deal', 'news', 'rumor']) {
    const st = fake(7); CT.initContent(st, SPEC, drawOf(st)); let n = 0; const d = () => { n++; return next(st.rng, 'content'); };
    for (let i = 0; i < 40; i++) { const before = n; CT.select(st, SPEC, pool, { worldId: 'w10', tags: pool === 'news' ? ['revUp'] : undefined }, d, { band: [5e6, 1e8] }); assert.equal(n - before, CT.POOL_D[pool], pool); st.month++; }
    const none = n; CT.select(st, SPEC, pool, { worldId: 'w10', tags: ['no-such-tag'] }, d, {}); assert.equal(n - none, CT.POOL_D[pool], 'an empty set still consumes its draws');
  }
  const st = fake(3); let n = 0; CT.initContent(st, SPEC, () => { n++; return next(st.rng, 'content'); }); assert.equal(n, Object.keys(SPEC.data).length, '1 draw per pool at game start');
  n = 0; for (let p = 1; p <= 36; p++) { st.month = p; CT.paydayContent(st, SPEC, () => { n++; return next(st.rng, 'content'); }, p); } assert.equal(n, 3 * Object.keys(SPEC.data).length, 'paydays 12, 24, 36');
});

await test('C-seed: same seed → same active packs, same ids and the same frozen numbers; another seed differs', () => {
  const run = (seed) => { const st = fake(seed); CT.initContent(st, SPEC, drawOf(st)); const out = []; for (let m = 1; m <= 60; m++) { st.month = m; const x = CT.select(st, SPEC, 'deal', { worldId: 'w10', tile: 'O' }, drawOf(st), { band: [5e6, 1e8], fmt: String }); out.push(x ? [x.id, x.nums.cost, x.nums.cf] : null); CT.paydayContent(st, SPEC, drawOf(st), m); } return { out, act: st.content.act.deal.join() }; };
  assert.deepEqual(run(11), run(11)); assert.notDeepEqual(run(11).out, run(12).out);
  const packs = new Set(); for (let s = 1; s <= 12; s++) packs.add(run(s).act); assert.ok(packs.size >= 4, 'two seeds of the same world feel different (seeded active pack)');
});

await test('C-repeat: inside the no-repeat window W = min(8, ⌊eligible / 2⌋) no id comes back; cooldowns hold; perRun caps', () => {
  const st = fake(5); CT.initContent(st, SPEC, drawOf(st)); const ids = [];
  for (let m = 1; m <= 200; m++) { st.month = m; const x = CT.select(st, SPEC, 'deal', { worldId: 'w10', tile: 'O' }, drawOf(st), { band: [5e6, 1e8] }); if (x) ids.push([m, x.id]); }
  const elig = st.content.act.deal.filter((id) => !DEALS_W10.find((e) => e.id === id).trigger).length; const W = Math.min(CT.RING_MAX, Math.floor(elig / 2));
  for (let i = 0; i < ids.length; i++) for (let j = Math.max(0, i - W + 1); j < i; j++) assert.notEqual(ids[i][1], ids[j][1], `repeat within W=${W} at ${ids[i][0]}`);
  for (let i = 0; i < ids.length; i++) for (let j = 0; j < i; j++) if (ids[i][1] === ids[j][1]) { const e = DEALS_W10.find((x) => x.id === ids[i][1]); if (i - j >= W && e.cooldown) assert.ok(ids[i][0] - ids[j][0] >= Math.floor(e.cooldown / 2), 'cooldown (relaxed at most to half)'); }
  const once = { ...SPEC, data: { ...SPEC.data, deal: DEALS_W10.map((e) => ({ ...e, perRun: 1, cooldown: 0, trigger: undefined })) } };
  const s2 = fake(9); CT.initContent(s2, once, drawOf(s2)); const seen = []; for (let m = 1; m <= 40; m++) { s2.month = m; const x = CT.select(s2, once, 'deal', { worldId: 'w10' }, drawOf(s2), {}); if (x) seen.push(x.id); }
  assert.equal(new Set(seen).size, seen.length, 'perRun 1: every id at most once'); assert.ok(seen.length <= s2.content.act.deal.length);
});

await test('C-empty: 10k simulated deal landings in every regime never come back empty in w10 (the legacy deck is the last fallback); the band holds (C-band)', () => {
  const regs = ['growth', 'bubble', 'recession', 'recovery', 'highVol', 'sectorCrisis']; let n = 0, none = 0; const band = W10.econ.band.deal;
  for (let s = 0; s < 60; s++) { const st = fake(100 + s); CT.initContent(st, SPEC, drawOf(st));
    for (let m = 1; m <= 170 && n < 10000; m++) { st.month = m; const x = CT.select(st, SPEC, 'deal', { worldId: 'w10', tile: 'O', regime: regs[(s + m) % regs.length] }, drawOf(st), { band }); n++; if (!x) none++;
      else { assert.ok(x.nums.cost >= band[0] && x.nums.cost <= band[1], 'cost in econ.band.deal'); assert.equal(x.nums.down, x.nums.cost); assert.ok(x.nums.cf >= 0); }
      if (m % 7 === 0) CT.fireTrigger(st, SPEC, 'regime:' + regs[m % regs.length]); CT.paydayContent(st, SPEC, drawOf(st), m); } }
  assert.equal(none, 0, `${none} empty of ${n}`); assert.ok(W10.deals.length > 0, 'legacy fallback deck');
});

await test('triggers switch entries on for their months; rotation swaps 25 % of a pack; seen maps stay bounded (≤ 8 KB)', () => {
  const st = fake(21); CT.initContent(st, SPEC, drawOf(st));
  const trig = (m) => { st.month = m; const out = new Set(); for (let i = 0; i < 400; i++) { const x = CT.select(st, SPEC, 'deal', { worldId: 'w10', tile: 'O', regime: 'recession' }, drawOf(st), {}); if (x) out.add(x.id); } return out; };
  assert.ok(!trig(3).has('deal.distressed'), 'off before its trigger'); assert.deepEqual(CT.fireTrigger(st, SPEC, 'regime:recession'), ['deal.distressed']);
  assert.ok(trig(4).has('deal.distressed'), 'on while triggered'); assert.ok(!trig(4 + 6).has('deal.distressed'), 'off after its months');
  const before = st.content.act.deal.slice(); CT.paydayContent(st, SPEC, drawOf(st), 12); const after = st.content.act.deal;
  const k = before.filter((id) => !after.includes(id)).length; assert.equal(k, Math.min(DEALS_W10.length - before.length, Math.floor(before.length * CT.ROTATE_SHARE)));
  for (let m = 1; m <= 200; m++) { st.month = m; CT.select(st, SPEC, 'deal', { worldId: 'w10' }, drawOf(st), {}); CT.select(st, SPEC, 'news', { worldId: 'w10', tags: ['revUp'] }, drawOf(st), {}); CT.paydayContent(st, SPEC, drawOf(st), m); }
  assert.ok(JSON.stringify(st.content).length <= 8192, 'st.content ≤ 8 KB'); assert.ok(Object.values(st.content.recent).every((r) => r.length <= CT.RING_MAX));
});

await test('C-freeze: an accepted offer keeps its id and numbers when the pack is edited, rotated or re-weighted after it was drawn', () => {
  const st = E.createGame({ worldId: 'w10', charId: 'floorTrader', seed: 77 });
  let ev = null; let g = 0; while (g++ < 400 && !(st.pending && st.pending.type === 'deal' && st.pending.card.cid)) { E.rollDice(st); ev = E.landing(st); let k = 0; while (ev && k++ < 10) { const o = ev.options.find((x) => x.enabled && ['pass', 'done', 'ok', 'skip', 'decline'].includes(x.id)) || ev.options.find((x) => x.enabled); if (st.pending && st.pending.type === 'deal' && st.pending.card.cid) break; ev = E.choose(st, ev, o.id, o.needsQty ? { qty: 1 } : {}).event; } }
  assert.ok(st.pending && st.pending.card.cid, 'reached a content deal'); const card0 = JSON.stringify(st.pending.card);
  const e = DEALS_W10.find((x) => x.id === st.pending.card.cid); assert.ok(e && st.pending.card.iid.startsWith('deal:' + e.id + ':'));
  const saved = E.serialize(st); const orig = SPEC.data.deal; SPEC.data.deal = DEALS_W10.map((x) => ({ ...x, w: x.w * 3, gen: { ...x.gen, cost: ['band', 0.9, 1] } }));
  try { const back = E.deserialize(saved); assert.equal(JSON.stringify(back.pending.card), card0, 'the frozen card survives a pack edit'); E.choose(back, E.currentEvent(back), (E.currentEvent(back).options.find((o) => o.kind === 'buy' && o.enabled) || { id: 'pass' }).id);
    const a = back.assets.find((x) => x.op && x.op.ck === 'fund' && x.n === JSON.parse(card0).n); if (a) assert.equal(a.op.cost0, JSON.parse(card0).cost, 'the held asset keeps the frozen cost'); }
  finally { SPEC.data.deal = orig; }
});

await test('w1–w9 never carry content: no `content` / `exch` stream, no st.content, the deal tile draws the legacy deck (0 content draws)', () => {
  for (const w of E.loadedWorlds().filter((x) => !x.content)) { const st = E.createGame({ worldId: w.id, charId: w.characters[0].id, seed: 5 });
    assert.equal(st.content, undefined, w.id); for (const nm of LAZY_STREAMS) assert.equal(st.rng[nm], undefined, w.id + ' ' + nm); assert.deepEqual(Object.keys(st.rng), STREAMS, w.id); }
  const st = E.createGame({ worldId: 'w10', seed: 5 }); assert.deepEqual(Object.keys(st.rng), [...STREAMS, ...LAZY_STREAMS]); assert.equal(st.rng.content !== undefined && st.content.v, CT.CONTENT_V);
  assert.equal(makeStreams(5).content, undefined, 'makeStreams never creates a lazy stream');
  assert.equal(CT.seenIds(st).length, 0); assert.ok(Array.isArray(CT.seenIds(E.createGame({ worldId: 'w1', seed: 1 }))));
  assert.deepEqual(E.loadedWorlds().filter((x) => x.content).map((x) => x.id), ['w10', 'w13'], 'the content worlds (rules 7)');
  const s13 = E.createGame({ worldId: 'w13', seed: 5 }); assert.deepEqual(Object.keys(s13.rng), [...STREAMS, 'content'], 'w13 declares only the content stream');
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
