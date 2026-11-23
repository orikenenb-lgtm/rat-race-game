#!/usr/bin/env node
// tools/validate-worlds.mjs (worlds wave 0, I5): the real config passes; every error class is caught on a broken fixture; the module lint;
// the module draw / safe-option fuzz; the meta unlock DAG (DESIGN §1.3). Run: node tests/worlds_config.test.mjs
import assert from 'node:assert/strict';
import * as E from '../js/engine.js';
import '../js/worlds/all.js';
import { validate, lintModules, fuzzModules, shekelsIn } from '../tools/validate-worlds.mjs';
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

test('the shipped worlds validate with no errors (w1–w6)', () => {
  const r = validate(); assert.deepEqual(r.errors, []); assert.equal(E.loadedWorlds().length, 6);
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
  const lazy = validate({ lazyIds: ['w5', 'w6', 'w7'] }); assert.ok(has(lazy, /LAZY_IDS/)); assert.ok(has(validate({ lazyIds: ['w5'] }), /LAZY_IDS/));
  assert.ok(has(validate({ metas: WORLD_META.filter((m) => m.id !== 'w5') }), /w5: no meta entry/));
});
test('module contract check and the arithmetic lint pass for the shipped modules; a bad module is reported', () => {
  assert.deepEqual(checkModule(W5.mech[0]), []); assert.deepEqual(checkModule(E.getWorld('w6').mech[0]), []);
  assert.deepEqual(lintModules(), []);
  assert.ok(checkModule({ id: 'x', draws: { init: 0, month: 0, landing: {} }, tiles: { Q: { create() {}, describe() {}, choose() {} } } }).some((x) => /safe|draws\.landing/.test(x)));
  assert.ok(checkModule({ id: 'x', draws: { init: 0, month: 0, landing: {} }, weird: 1 }).some((x) => /unknown hook/.test(x)));
});
test('fuzz: module draws are decision-independent and every safe option spends nothing (all characters of every module world)', () => {
  const r = fuzzModules(E.loadedWorlds(), 50); assert.deepEqual(r.errors, []); assert.equal(r.notes.length, 6, 'w5 + w6: 3 characters each');
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
test('shekelsIn reads Hebrew ₪ amounts', () => {
  assert.deepEqual(shekelsIn('עולה ₪300 אלף ועוד ₪1.5 מיליון ו־₪250,000'), [300000, 1500000, 250000]);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
