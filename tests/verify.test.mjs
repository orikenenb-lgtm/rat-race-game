#!/usr/bin/env node
// verify-result (T-15) — the server-side replay check, run in Node against the SAME files the Edge Function uses:
// tools/build-edge.mjs bundle → supabase/functions/verify-result/engine_loader.js → verify_core.js.
// Run: node tests/verify.test.mjs [games=120]
import assert from 'node:assert/strict';
import { collect, bundleText, sha256 } from '../tools/build-edge.mjs';
import { loadEngine } from '../supabase/functions/verify-result/engine_loader.js';
import { verifyGame, parseRequest, validateActions, configFor, normalize, dailyCharId, clientEngine, rulesFor, RULES4_FROM } from '../supabase/functions/verify-result/verify_core.js';
import * as Local from '../js/engine.js';
import { playOut, prng } from './lib/random-player.mjs';

const GAMES = +(process.argv[2] || 120);
let passed = 0, failed = 0;
async function test(name, fn) {
  const t0 = Date.now();
  try { await fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e.stack).split('\n').slice(0, 5).join('\n   ')}`); }
}

/** The server row a ranked game produces (rr_begin + rr_finish), from the client's final state. */
function rowFor(E, st, { mode, profession, seed }) {
  const end = normalize(st.result);
  return { mode, world: st.worldId, profession, seed: String(seed), max_months: mode === 'daily' ? 24 : null, daily_key: mode === 'daily' ? '2026-12-02' : null, weekly_start: mode === 'weekly' ? '2026-12-07' : null, challenge_day: mode === 'challenge' ? '2026-12-05' : null,
    status: end.status, months: end.months, passive: end.passive, expenses: end.expenses, net_worth: end.netWorth,
    claim_stars: st.result.stars || 0, claim_progress: st.result.progress ?? null };
}

const files = collect(); const text = bundleText(files);
const E = await loadEngine(text);            // exactly what the Edge Function executes
const games = [];

await test('the edge bundle is the client engine: same exports, every module byte-identical to js/', async () => {
  assert.deepEqual(Object.keys(E).sort(), Object.keys(Local).sort());
  assert.ok(Object.keys(files).includes('engine.js') && Object.keys(files).length >= 10, 'module graph collected: ' + Object.keys(files).join(','));
  assert.equal(sha256(text), sha256(bundleText(collect())), 'canonical bundle is stable');
});

await test(`honest ranked games verify (${GAMES} games: daily / weekly / challenge × 4 worlds, played on the browser copy, replayed on the edge copy)`, async () => {
  const modes = ['daily', 'weekly', 'challenge'];
  let ms = 0, maxActs = 0, won = 0;
  for (let i = 0; i < GAMES; i++) {
    const w = Local.WORLDS[i % Local.WORLDS.length]; const mode = modes[i % 3];
    const seed = Math.abs((i * 2654435761) | 0) % 2147483646 + 1;
    let profession, charId;
    if (mode === 'challenge') { charId = w.characters[i % w.characters.length].id; profession = charId; }
    else { const idx = (i * 7) % 3; profession = 'idx:' + idx; charId = dailyCharId(w, idx); }
    const cfg = { worldId: w.id, charId, seed, mode, maxMonths: mode === 'daily' ? 24 : undefined, tutorial: false, bailout: false };
    const st = playOut(Local, cfg, prng(seed ^ 0x5bd1e995), { v4: true });
    assert.ok(st.over, 'game ended');
    const row = rowFor(Local, st, { mode, profession, seed });
    const t0 = performance.now(); const out = verifyGame(E, row, st.actions); ms = Math.max(ms, performance.now() - t0);
    assert.ok(out.ok, `game ${i} ${w.id}/${mode} should verify: ${out.error}`);
    assert.equal(out.result.months, row.months); assert.equal(out.result.netWorth, row.net_worth);
    maxActs = Math.max(maxActs, st.actions.length); if (st.over === 'won') won++;
    games.push({ st, row });
  }
  console.log(`   max replay ${ms.toFixed(0)} ms · max actions ${maxActs} · won ${won}/${GAMES}`);
});

await test('forged claims are rejected (months, net worth, passive, expenses, status, stars, progress)', async () => {
  const g = games.find((x) => x.row.status === 'lost') || games[0];
  const forge = (patch) => verifyGame(E, { ...g.row, ...patch }, g.st.actions);
  for (const [patch, key] of [[{ months: g.row.months - 1 }, 'months'], [{ net_worth: g.row.net_worth + 100000 }, 'netWorth'],
    [{ passive: g.row.passive + 500 }, 'passive'], [{ expenses: Math.max(0, g.row.expenses - 1000) }, 'expenses'],
    [{ status: g.row.status === 'won' ? 'lost' : 'won' }, 'status'], [{ claim_stars: 3 }, 'stars'], [{ claim_progress: 1 }, 'progress']]) {
    if (key === 'stars' && g.row.claim_stars === 3) continue;
    if (key === 'progress' && Math.abs((g.row.claim_progress ?? 1) - 1) < 0.01) continue;
    const out = forge(patch);
    assert.equal(out.ok, false, 'forged ' + key); assert.match(out.error, /^claim_mismatch:/); assert.ok(key in out.diff, key + ' in diff ' + JSON.stringify(out.diff));
  }
});

await test('tampered / foreign action logs are rejected (edited decision, dropped action, truncated, other seed, other character, free-mode log)', async () => {
  const g = games.find((x) => x.st.actions.filter((a) => a[0] === 'c').length > 10);
  const acts = g.st.actions;
  // edit one decision: find a choose whose option we can swap
  let rejected = 0, tries = 0;
  for (let i = 0; i < acts.length && tries < 15; i++) {
    if (acts[i][0] !== 'c' || !['buy', 'pass', 'ok', 'pay', 'credit'].includes(acts[i][1])) continue;
    tries++;
    const alt = acts.slice(); alt[i] = ['c', acts[i][1] === 'pass' ? 'buy' : 'pass'];
    const out = verifyGame(E, g.row, alt); if (!out.ok) rejected++;
  }
  assert.ok(tries > 0 && rejected === tries, `every edited decision rejected (${rejected}/${tries})`);
  const dropped = acts.slice(); dropped.splice(Math.floor(acts.length / 2), 1);
  assert.equal(verifyGame(E, g.row, dropped).ok, false, 'dropped action');
  const trunc = verifyGame(E, g.row, acts.slice(0, Math.floor(acts.length / 2)));
  assert.equal(trunc.ok, false); assert.match(trunc.error, /replay:/, 'truncated log never reaches the end');
  assert.equal(verifyGame(E, { ...g.row, seed: String(Number(g.row.seed) + 1) }, acts).ok, false, 'log of another seed (e.g. yesterday / another player\'s challenge)');
  const otherChar = g.row.profession.startsWith('idx:') ? { profession: 'idx:' + ((+g.row.profession.slice(4) + 1) % 3) } : { profession: E.getWorld(g.row.world).characters.find((c) => c.id !== g.row.profession).id };
  if (dailyCharId(E.getWorld(g.row.world), +String(otherChar.profession).slice(4)) !== dailyCharId(E.getWorld(g.row.world), +g.row.profession.slice(4)) || !otherChar.profession.startsWith('idx:'))
    assert.equal(verifyGame(E, { ...g.row, ...otherChar }, acts).ok, false, 'other character');
  // a free game (bailout + tutorial) on the same seed cannot pass as the ranked one
  const free = playOut(Local, { worldId: g.row.world, charId: g.st.charId, seed: Number(g.row.seed), mode: 'free', tutorial: true, bailout: true }, prng(9));
  const fr = rowFor(Local, free, { mode: g.row.mode, profession: g.row.profession, seed: g.row.seed });
  assert.equal(verifyGame(E, fr, free.actions).ok, false, 'free-mode log replayed under ranked rules');
});

await test('replay config comes only from the server row (client cannot pick seed / bailout / tutorial / month limit)', async () => {
  const w = E.getWorld('w2');
  const c = configFor(E, { mode: 'daily', world: 'w2', profession: 'idx:4', seed: '123', max_months: 24, bailout: true, tutorial: true });
  assert.deepEqual(c, { worldId: 'w2', charId: dailyCharId(w, 4), seed: 123, mode: 'daily', tutorial: false, bailout: false, mentor: 'hint', rules: 4, maxMonths: 24 });
  assert.throws(() => configFor(E, { mode: 'free', world: 'w1', profession: 'idx:0', seed: '1' }), /unsupported_mode/);
  assert.throws(() => configFor(E, { mode: 'weekly', world: 'w9', profession: 'idx:0', seed: '1' }), /bad_world/);
  assert.throws(() => configFor(E, { mode: 'challenge', world: 'w1', profession: 'hacker', seed: '1' }), /bad_char/);
});

await test('request validation (identity, uuid, action log shape and size)', async () => {
  const id = '11111111-2222-3333-4444-555555555555';
  assert.throws(() => parseRequest(null), /bad_request/);
  assert.throws(() => parseRequest({ id: 'x', secret: 'abcdefghij', result_id: id }), /unauthorized/);
  assert.throws(() => parseRequest({ id, secret: 'short', result_id: id }), /unauthorized/);
  assert.throws(() => parseRequest({ id, secret: 'abcdefghij', result_id: "x' or 1=1" }), /result_not_found/);
  assert.equal(parseRequest({ id, secret: 'abcdefghij', result_id: id }).actions, null);
  for (const bad of [[], 'r', [['x']], [['r', {}]], [['c', 'a'.repeat(41)]], [['c', 'buy', 1, 2]], [['I', 'buy', Infinity]], Array(6001).fill(['r'])])
    assert.throws(() => validateActions(bad), /bad_actions/, JSON.stringify(bad).slice(0, 40));
  assert.ok(validateActions([['r'], ['l'], ['c', 'buy', 3], ['L', 5000], ['P', 'rest'], ['I', 'buy', 2], ['C']]));
  assert.equal(clientEngine('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120 Mobile/15E148 Safari/604.1'), 'jsc');
  assert.equal(clientEngine('Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36'), 'v8');
});

await test('every action code the engine replays is accepted (S = savings, T = side-income report)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/engine.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function replay('));
  const codes = [...body.slice(0, 4000).matchAll(/case '([A-Za-z])':/g)].map((m) => m[1]);
  assert.ok(codes.length >= 11, 'found the replay switch: ' + codes.join(''));
  for (const c of codes) assert.ok(validateActions([[c, 'x']]), c);
  assert.ok(validateActions([['S', 1500], ['S', -500], ['T', true], ['T', false]]));
});

await test('T17: F/H/M are accepted codes; rulesFor maps a legacy day to rules 3; a rules-3 ranked log replays and verifies; an M entry in a ranked log is rejected', async () => {
  assert.ok(validateActions([['F', 'scout', 0], ['F', 'none', 2], ['H'], ['M', 'pro']]));
  assert.equal(RULES4_FROM, '2026-12-01');
  assert.equal(rulesFor({ daily_key: '2026-11-30' }), 3); assert.equal(rulesFor({ daily_key: '2026-12-01' }), 4); assert.equal(rulesFor({ weekly_start: '2026-11-23' }), 3);
  assert.equal(rulesFor({ challenge_day: '2026-12-09' }), 4); assert.equal(rulesFor({ daily_key: '20261129' }), 3); assert.equal(rulesFor({}), 4);
  assert.equal(configFor(E, { mode: 'weekly', world: 'w1', profession: 'idx:0', seed: '5', weekly_start: '2026-11-16' }).rules, 3);
  // a game started under v3 rules (before the release day) replays with rules 3 and verifies
  const w = Local.getWorld('w3'); const charId = dailyCharId(w, 1);
  const st = playOut(Local, { worldId: 'w3', charId, seed: 4242, mode: 'daily', maxMonths: 24, tutorial: false, bailout: false, rules: 3 }, prng(77));
  assert.equal(st.rules, 3);
  const row = { ...rowFor(Local, st, { mode: 'daily', profession: 'idx:1', seed: 4242 }), daily_key: '2026-11-28' };
  const out = verifyGame(E, row, st.actions); assert.ok(out.ok, out.error); assert.equal(out.cfg.rules, 3);
  assert.equal(verifyGame(E, { ...row, daily_key: '2026-12-02' }, st.actions).ok, false, 'the same log under rules 4 does not verify');
  // a v4 ranked game with hints and focus verifies; an M entry is rejected (setMentorLevel refuses in ranked modes)
  const g = games.find((x) => x.st.actions.some((a) => a[0] === 'F' || a[0] === 'H')) || games[0];
  const acts = g.st.actions.slice(); const at = acts.findIndex((a) => a[0] === 'r');
  acts.splice(at, 0, ['M', 'pro']);
  const bad = verifyGame(E, g.row, acts); assert.equal(bad.ok, false); assert.match(bad.error, /^replay:/);
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
