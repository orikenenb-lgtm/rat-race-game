#!/usr/bin/env node
// Byte-identical replay corpus for w1–w4 (DESIGN §4.2 / §4.7, wave 0 I2): a fixed set of games (worlds w1–w4 × rules 3/4/5 × free/daily × seeds),
// played by the seeded legal random player (tests/lib/random-player.mjs, v4 actions + stories), reduced to the SHA-256 of a canonical
// final state. New engine infrastructure must not move any of these hashes; rules 6 and rules 7 must equal rules 5 in w1–w4, and rules 7
// must equal rules 6 in the module worlds w5–w9 (CATALOG-25 §3.8: rules 7 changes nothing for a world without `market` / content pools).
//
//   node tools/replay-corpus.mjs --write     record tests/fixtures/replay-corpus.json from the current engine
//   node tools/replay-corpus.mjs             compare (exit 1 on any difference) — also rules 6 vs the rules-5 hashes
//
// Canonical state = serialize() with fields that the wave-0 infrastructure adds for every world removed (rng.world: a new, never-drawn
// stream in w1–w4) and, for the rules-6 check, `rules` itself.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as E from '../js/engine.js';
import { LAZY } from '../js/worlds/all.js';
import { prng, playOut } from '../tests/lib/random-player.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = join(ROOT, 'tests', 'fixtures', 'replay-corpus.json');
export const WORLDS4 = ['w1', 'w2', 'w3', 'w4'];
export const SEEDS = 6;
const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

export function canon(st, dropRules = false) {
  const x = JSON.parse(E.serialize(st));
  if (x.rng) delete x.rng.world;
  if (dropRules) delete x.rules;
  return JSON.stringify(x);
}
export function corpusConfigs() {
  const out = [];
  for (const w of WORLDS4) for (const rules of [3, 4, 5]) for (const mode of ['free', 'daily']) for (let k = 0; k < SEEDS; k++) {
    const seed = (k * 104729 + w.charCodeAt(1) * 7 + rules * 31 + (mode === 'daily' ? 5 : 0)) >>> 0;
    const world = E.getWorld(w); const ch = world.characters[k % world.characters.length];
    out.push({ key: `${w}/r${rules}/${mode}/${k}`, cfg: { worldId: w, charId: ch.id, seed, mode, rules, mentor: mode === 'free' ? 'guide' : 'hint', ...(mode === 'daily' ? { maxMonths: 24 } : {}) }, rseed: seed ^ 0x5bd1e995 });
  }
  return out;
}
export function playCorpus(cfgPatch = {}, filter = () => true) {
  const res = {};
  for (const c of corpusConfigs()) {
    if (!filter(c)) continue;
    const st = playOut(E, { ...c.cfg, ...cfgPatch }, prng(c.rseed), { v4: true, stories: true });
    res[c.key] = { h: sha(canon(st)), h6: sha(canon(st, true)), turns: st.turn, over: st.over || null, actions: st.actions.length };
  }
  return res;
}

/** w5–w9 (worlds without market / content): the same games under rules 6 and rules 7 → the same canonical state without `rules`. */
export const MODULE_WORLDS = LAZY.filter((w) => (w.minRules || 0) <= 6).map((w) => w.id);
export function moduleCorpus(rules, seeds = 2) {
  const res = {};
  for (const wid of MODULE_WORLDS) { const w = E.getWorld(wid); for (const ch of w.characters) for (let k = 0; k < seeds; k++) {
    const seed = (k * 7919 + wid.length * 131 + ch.id.length * 17) >>> 0; const st = playOut(E, { worldId: wid, charId: ch.id, seed, mode: 'free', rules, mentor: 'guide' }, prng(seed ^ 0x2545f491), { v4: true, stories: true });
    res[`${wid}/${ch.id}/${k}`] = sha(canon(st, true)); } }
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  if (process.argv.includes('--write')) {
    const res = playCorpus();
    writeFileSync(FILE, JSON.stringify({ note: 'tools/replay-corpus.mjs — w1–w4 × rules 3/4/5 × free/daily × ' + SEEDS + ' seeds; h = sha256(canonical final state)', games: res }, null, 0) + '\n');
    console.log(`wrote ${Object.keys(res).length} games in ${((Date.now() - t0) / 1000).toFixed(1)} s → ${FILE}`);
  } else {
    if (!existsSync(FILE)) { console.error('no corpus — run with --write on the base engine'); process.exit(2); }
    const ref = JSON.parse(readFileSync(FILE, 'utf8')).games; const now = playCorpus(); let bad = 0;
    for (const [k, v] of Object.entries(ref)) if (!now[k] || now[k].h !== v.h) { bad++; console.error('✗ ' + k); }
    // rules 6 = rules 5 in w1–w4 (same decisions → same canonical state without the `rules` field)
    let bad6 = 0; let n6 = 0; let bad7 = 0; let n7 = 0; let badM = 0; let nM = 0;
    if (E.RULES_CURRENT >= 6) {
      const r6 = playCorpus({ rules: 6 }, (c) => c.cfg.rules === 5);
      for (const [k, v] of Object.entries(r6)) { n6++; if (v.h6 !== ref[k].h6) { bad6++; console.error('✗ rules 6 ≠ 5: ' + k); } }
    }
    if (E.RULES_CURRENT >= 7) {
      const r7 = playCorpus({ rules: 7 }, (c) => c.cfg.rules === 5);
      for (const [k, v] of Object.entries(r7)) { n7++; if (v.h6 !== ref[k].h6) { bad7++; console.error('✗ rules 7 ≠ 5: ' + k); } }
      if (!process.argv.includes('--quick')) { const a = moduleCorpus(6), b = moduleCorpus(7); for (const k of Object.keys(a)) { nM++; if (a[k] !== b[k]) { badM++; console.error('✗ rules 7 ≠ 6: ' + k); } } }
    }
    console.log(`${Object.keys(ref).length - bad}/${Object.keys(ref).length} corpus games identical; rules 6 = 5: ${n6 - bad6}/${n6}; rules 7 = 5: ${n7 - bad7}/${n7}; w5–w9 rules 7 = 6: ${nM - badM}/${nM}  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    process.exit(bad || bad6 || bad7 || badM ? 1 : 0);
  }
}
