#!/usr/bin/env node
// tools/validate-worlds.mjs (worlds wave 0, I5): the real config passes; every error class is caught on a broken fixture; the module lint;
// the module draw / safe-option fuzz; the meta unlock DAG (DESIGN §1.3). Run: node tests/worlds_config.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import '../js/worlds/all.js';
import { validate, lintModules, fuzzModules, shekelsIn, checkCompanies, checkAdapters } from '../tools/validate-worlds.mjs';
import { COMPANIES } from '../js/worlds/data/companies.js';
import { WORLD_META, isUnlockedBy, unlockText } from '../js/worlds/meta.js';
import { checkModule } from '../js/worlds/mech/index.js';

let passed = 0, failed = 0;
function test(name, fn) { const t0 = Date.now(); try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); } catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 6).join('\n   ')}`); } }
const clone = (x) => JSON.parse(JSON.stringify(x));
/** A world with functions kept (mech modules are objects with functions): shallow-copy the parts a fixture breaks. */
const W5 = E.getWorld('w5');
const worlds = () => E.loadedWorlds();
const withW5 = (patch) => worlds().map((w) => (w.id === 'w5' ? { ...w, ...patch(w) } : w));
const has = (r, re) => r.errors.some((x) => re.test(x));

test('the shipped worlds validate with no errors (w1–w11, w13, w15)', () => {
  const r = validate(); assert.deepEqual(r.errors, []); assert.equal(E.loadedWorlds().length, 13);
});
test('error classes are caught: schema, meta mismatch, ids, references, money, goals, modules, unlock graph', () => {
  assert.ok(has(validate({ worlds: withW5(() => ({ board: W5.board.slice(0, 39) })) }), /board must be 40/));
  assert.ok(has(validate({ worlds: withW5(() => ({ maxMonths: 99 })) }), /meta\.maxMonths/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ characters: [{ ...w.characters[0], id: 'teacher' }, ...w.characters.slice(1)] })) }), /character id 'teacher' also in w1/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ deals: [...w.deals, { k: 'castle', n: 'טירה', d: '', cost: 1000000, down: 300000, cf: 1 }] })) }), /kind 'castle' not in kinds/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ deals: [...w.deals, { k: 'hotel', n: 'x', d: '', cost: 1000000, down: 2000000, cf: 1 }] })) }), /down 2000000 > cost/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ deals: [...w.deals, { k: 'hotel', n: 'x', d: 'שלום {who}', cost: 1000000, down: 300000, cf: 1 }] })) }), /placeholder/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ deals: [...w.deals, { k: 'stock', tk: 'NOPE', p: 5, n: 'x', d: '' }] })) }), /ticker NOPE/));
  assert.ok(has(validate({ worlds: withW5(() => ({ goal: { type: 'passive13', target: 1 } })) }), /goal type 'passive13'/));
  assert.ok(has(validate({ worlds: withW5(() => ({ goal: { type: 'passive12', target: 9e9 } })) }), /impossible goal/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ characters: w.characters.map((c, i) => (i ? c : { ...c, stars: { t2: 80, t3: 46 } })) })) }), /t3 < t2 < maxMonths|meta\.stars/));
  assert.ok(has(validate({ worlds: withW5(() => ({ minRules: 9 })) }), /minRules 9 > RULES_CURRENT/));
  assert.ok(has(validate({ worlds: withW5(() => ({ bounds: { nwMax: 1e14 } })) }), /nwMax/));
  const badMech = { ...W5.mech[0], tiles: { N: { ...W5.mech[0].tiles.N, safe: undefined } } };
  assert.ok(has(validate({ worlds: withW5(() => ({ mech: [badMech] })) }), /safe/));
  assert.ok(has(validate({ worlds: withW5(() => ({ mech: [{ ...W5.mech[0], lessons: ['no_such_lesson'] }] })) }), /lesson 'no_such_lesson'/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ mentor: { ...w.mentor, allotAsk: undefined } })) }), /mentor key 'allotAsk'/));
  assert.ok(has(validate({ worlds: withW5((w) => ({ tiles: { ...w.tiles, N: undefined } })) }), /board char 'N' has no tile/));
  const metas = clone(WORLD_META); metas.find((m) => m.id === 'w6').unlock = [{ any: ['w5'], count: 1, stars: 2 }];
  assert.ok(has(validate({ metas }), /★★ or more/));
  const cyc = clone(WORLD_META); cyc.find((m) => m.id === 'w2').unlock = [{ any: ['w3'], count: 1 }];
  assert.ok(has(validate({ metas: cyc }), /not reachable/));
  const lazy = validate({ lazyIds: ['w5', 'w6', 'w7', 'w8', 'w9', 'w10', 'w11', 'w12', 'w13'] }); assert.ok(has(lazy, /LAZY_IDS/)); assert.ok(has(validate({ lazyIds: ['w5'] }), /LAZY_IDS/));
  assert.ok(has(validate({ metas: WORLD_META.filter((m) => m.id !== 'w5') }), /w5: no meta entry/));
});
test('module contract check and the arithmetic lint pass for the shipped modules; a bad module is reported', () => {
  assert.deepEqual(checkModule(W5.mech[0]), []); for (const id of ['w6', 'w7', 'w8', 'w9']) assert.deepEqual(checkModule(E.getWorld(id).mech[0]), [], id); for (const id of ['w10', 'w11', 'w13', 'w15']) for (const M of E.getWorld(id).mech) assert.deepEqual(checkModule(M), [], id + ' ' + M.id);
  assert.deepEqual(lintModules(), []);
  assert.ok(checkModule({ id: 'x', draws: { init: 0, month: 0, landing: {} }, tiles: { Q: { create() {}, describe() {}, choose() {} } } }).some((x) => /safe|draws\.landing/.test(x)));
  assert.ok(checkModule({ id: 'x', draws: { init: 0, month: 0, landing: {} }, weird: 1 }).some((x) => /unknown hook/.test(x)));
});
test('fuzz: module draws are decision-independent and every safe option spends nothing (all characters of every module world)', () => {
  const r = fuzzModules(E.loadedWorlds(), 50); assert.deepEqual(r.errors, []); assert.equal(r.notes.length, 27, 'w5–w11 + w13 + w15: 3 characters each');
});
test('meta unlock DAG (DESIGN §1.3): fork after w5, any one of w6–w8 opens w9 and w10, w11 needs two of w6–w8 + one of w9/w10; banked stars; override', () => {
  const S = (o) => ({ w1: 1, w2: 1, w3: 1, w4: 1, ...o });
  assert.equal(isUnlockedBy('w1', {}), true); assert.equal(isUnlockedBy('w2', {}), false); assert.equal(isUnlockedBy('w5', S({})), true);
  assert.equal(isUnlockedBy('w5', { w4: 3 }), false, 'a banked w4 star counts only once w4 itself is unlocked');
  for (const w of ['w6', 'w7', 'w8']) assert.equal(isUnlockedBy(w, S({ w5: 1 })), true);
  assert.equal(isUnlockedBy('w9', S({ w5: 1, w7: 1 })), true); assert.equal(isUnlockedBy('w10', S({ w5: 1, w8: 1 })), true);
  assert.equal(isUnlockedBy('w11', S({ w5: 1, w6: 1, w9: 1 })), false, 'two of w6–w8 needed');
  assert.equal(isUnlockedBy('w11', S({ w5: 1, w6: 1, w7: 1, w9: 1 })), true);
  assert.equal(isUnlockedBy('w12', S({ w5: 1, w6: 1, w7: 1, w9: 1, w11: 1 })), true);
  assert.equal(isUnlockedBy('w12', {}, { all: true }), true, 'owner override');
  assert.match(unlockText('w9'), /באחד מ: אזור התעשייה/); assert.match(unlockText('w11'), /ב־2 מתוך/);
  // the shortest path to w12 passes 10 worlds
  assert.ok(WORLD_META.every((m) => !(m.unlock || []).some((c) => (c.stars || 1) > 1)));
});
test('CATALOG-25 checks: V-tier, V-mods, lazy streams, content pools (C-schema / C-free / C-band / C-empty), M-fict, V-adapter', () => {
  const W10 = E.getWorld('w10'); const with10 = (patch) => worlds().map((w) => (w.id === 'w10' ? { ...w, ...patch(w) } : w));
  const metas = clone(WORLD_META); metas.find((m) => m.id === 'w10').tier = 8; assert.ok(has(validate({ metas }), /V-tier: meta.tier 8 ≠ computed 7/));
  assert.ok(has(validate({ worlds: with10(() => ({ modules: ['market', 'portfolio', 'credit'] })) }), /V-mods: module 'credit'/));
  assert.ok(has(validate({ worlds: with10(() => ({ streams: ['exch'] })) }), /draws stream 'content'|content pools need the `content` stream/));
  assert.ok(has(validate({ worlds: with10(() => ({ minRules: 6 })) }), /needs minRules ≥ 7/));
  const bad = { ...W10.content, data: { ...W10.content.data, deal: [...W10.content.data.deal, { id: 'deal.free', v: 1, pool: 'deal', w: 5, gen: { cost: ['band', 0, 0], cf: ['yield', 0.01, 0.02] }, text: { n: 'כסף חינם {nope}' } }] } };
  const r = validate({ worlds: with10(() => ({ content: bad })) }); assert.ok(has(r, /\{nope\}/)); assert.ok(has(r, /C-free/));
  const band = { ...W10.content, data: { ...W10.content.data, deal: W10.content.data.deal.map((e, i) => (i ? e : { ...e, gen: { ...e.gen, cost: ['band', 0.5, 1.4] } })) } };
  assert.ok(has(validate({ worlds: with10(() => ({ content: band })) }), /C-band/));
  assert.ok(has(validate({ worlds: with10(() => ({ deals: [] })) }), /C-empty|needs a non-empty deals/));
  assert.deepEqual(checkCompanies(), []); assert.deepEqual(checkAdapters(), []);
  assert.ok(checkCompanies([...COMPANIES, { ...COMPANIES[0], key: 'tv', name: 'טבע', tk: 'TEVA' }]).some((x) => /real listed company/.test(x)));
  assert.ok(checkCompanies([...COMPANIES, { ...COMPANIES[0], key: 'dup' }]).some((x) => /duplicate name/.test(x)));
});
test('goal registry additions (CATALOG §2.5): modValue cmp:\'le\', noDefault {months, key}, maxDrawdown over a bounded ring', async () => {
  const { GOALS } = await import('../js/worlds/goals.js');
  const ctx = (v, nw = 100) => ({ mod: (st, k) => (typeof v === 'function' ? v(k) : v), netWorth: () => nw, fmt: String, goalPassive: () => 0 });
  const st = { stats: { paydays: 30 }, world: {} };
  const le = { type: 'modValue', key: 'wage', target: 0.7, cmp: 'le' };
  assert.equal(GOALS.modValue.met(st, le, ctx(0.65)), true); assert.equal(GOALS.modValue.met(st, le, ctx(0.8)), false); assert.ok(Math.abs(GOALS.modValue.progress(st, le, ctx(1.4)) - (0.05 + 0.95 * 0.5)) < 1e-9);
  assert.equal(GOALS.modValue.met(st, { type: 'modValue', key: 'x', target: 5 }, ctx(5)), true, 'ge stays the default'); assert.equal(GOALS.modValue.parts(st, le, ctx(0.5))[0].cmp, 'le');
  const nd = { type: 'noDefault', months: 12, key: 'margin' };
  assert.equal(GOALS.noDefault.met(st, nd, ctx((k) => (k === 'lastEvent:margin' ? 25 : 0))), false); assert.equal(GOALS.noDefault.met(st, nd, ctx((k) => (k === 'lastEvent:margin' ? 10 : 0))), true); assert.equal(GOALS.noDefault.met(st, nd, ctx(0)), true, 'never → since the start');
  const md = { type: 'maxDrawdown', pct: 0.3 }; const s2 = { stats: { paydays: 0 }, world: {} };
  for (const nw of [100, 120, 90, 110]) GOALS.maxDrawdown.onPayday(s2, md, 0, ctx(0, nw)); assert.equal(GOALS.maxDrawdown.dd(s2), 0.25); assert.equal(GOALS.maxDrawdown.met(s2, md), true);
  GOALS.maxDrawdown.onPayday(s2, md, 0, ctx(0, 60)); assert.equal(GOALS.maxDrawdown.met(s2, md), false); for (let i = 0; i < 300; i++) GOALS.maxDrawdown.onPayday(s2, md, 0, ctx(0, 50)); assert.equal(s2.world.ddRing.length, 200);
});
test('shekelsIn reads Hebrew ₪ amounts', () => {
  assert.deepEqual(shekelsIn('עולה ₪300 אלף ועוד ₪1.5 מיליון ו־₪250,000'), [300000, 1500000, 250000]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
