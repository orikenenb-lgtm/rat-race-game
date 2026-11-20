#!/usr/bin/env node
// Cross-engine determinism for server verification (T-15).
// The browser (V8 / JavaScriptCore / SpiderMonkey) and the Edge Function (Deno = V8) must compute bit-identical games, or honest
// ranked results get flagged. IEEE-754 + − × ÷, Math.sqrt/floor/round/trunc/abs/min/max/imul are exact in every engine; the
// "implementation-approximated" functions (Math.log/exp/pow/sin/cos/…, and the ** operator) are NOT — engines may differ in the
// last bit. This test proves the engine's results do not depend on them:
//   1. static scan of the exact module graph the Edge Function replays (tools/build-edge.mjs collect) — no approximated
//      Math call and no ** with a non-integer-literal exponent outside comments (allow-list below, each one justified);
//   2. dynamic: 300 seeded ranked games are played, then replayed with every approximated Math function nudged by ±1 ulp
//      (a model of another JS engine's libm) — the serialized final states must be byte-identical. Call counts are reported.
// Run: node tests/determinism.test.mjs [games=300]
import assert from 'node:assert/strict';
import { collect } from '../tools/build-edge.mjs';
import * as E from '../js/engine.js';
import { playOut, prng } from './lib/random-player.mjs';

const GAMES = +(process.argv[2] || 300);
const APPROX = ['log', 'exp', 'pow', 'sin', 'cos', 'tan', 'atan', 'atan2', 'asin', 'acos', 'sinh', 'cosh', 'tanh', 'asinh', 'acosh', 'atanh',
  'log1p', 'expm1', 'log2', 'log10', 'cbrt', 'hypot'];
// `x ** n` sites that are exact in every engine (or never reach game state). Key = file:trimmed source line.
const ALLOW = [
  [/^engine\.js$/, /10 \*\* d/, 'pct(): 10**d for d ∈ {0,1,2} is an exact power of ten; formatting text only'],
  [/^finance\/invest\.js$/, /\(x - mean\) \*\* 2/, 'volatility statistic for the UI; squaring is a single correctly-rounded multiply'],
];
let passed = 0, failed = 0;
function test(name, fn) {
  const t0 = Date.now();
  try { fn(); passed++; console.log(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; console.log(`✘ ${name}\n   ${String(e.stack).split('\n').slice(0, 6).join('\n   ')}`); }
}
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

test('static: no implementation-approximated math in the replayed module graph', () => {
  const files = collect(); const hits = [];
  for (const [p, src] of Object.entries(files)) {
    stripComments(src).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/Math\.([a-z0-9]+)\s*\(/gi)) if (APPROX.includes(m[1])) hits.push(`${p}:${i + 1} Math.${m[1]} — ${line.trim().slice(0, 100)}`);
      if (/\*\*/.test(line) && !/\*\*\s*\d+\b(?!\s*[./])/.test(line.replace(/10 \*\* d/g, '')) && !ALLOW.some(([f, re]) => f.test(p) && re.test(line)))
        hits.push(`${p}:${i + 1} ** — ${line.trim().slice(0, 100)}`);
    });
  }
  console.log(`   scanned ${Object.keys(files).length} modules: ${Object.keys(files).sort().join(', ')}`);
  assert.deepEqual(hits, [], 'approximated math found (use bank.js ipow/dexp/dlog/dpow instead):\n' + hits.join('\n'));
});

// ---- dynamic perturbation
const orig = {}; for (const f of APPROX) orig[f] = Math[f];
const calls = Object.fromEntries(APPROX.map((f) => [f, 0]));
const dv = new DataView(new ArrayBuffer(8));
function nudge(x, dir) {               // next representable double towards ±∞ (only for non-integers: libms agree on exact results)
  if (!Number.isFinite(x) || Number.isInteger(x)) return x;
  dv.setFloat64(0, x); let b = dv.getBigUint64(0);
  b = (x > 0) === (dir > 0) ? b + 1n : b - 1n; dv.setBigUint64(0, b); return dv.getFloat64(0);
}
function install(dir) { for (const f of APPROX) Math[f] = function (...a) { calls[f]++; return nudge(orig[f].apply(Math, a), dir); }; }
function restore() { for (const f of APPROX) Math[f] = orig[f]; }

test(`dynamic: ${GAMES} seeded ranked games replay byte-identically with every approximated Math function nudged ±1 ulp`, () => {
  const modes = ['daily', 'weekly', 'challenge'];
  const recs = [];
  install(0); // count calls during normal play (dir 0 = identity)
  for (let i = 0; i < GAMES; i++) {
    const w = E.WORLDS[i % E.WORLDS.length]; const mode = modes[i % 3]; const seed = (i * 7919 + 17) >>> 0;
    const cfg = { worldId: w.id, charId: w.characters[i % w.characters.length].id, seed, mode, maxMonths: mode === 'daily' ? 24 : undefined };
    const st = playOut(E, cfg, prng(seed + 1));
    recs.push({ cfg: E.replayConfig(st), actions: st.actions, ser: E.serialize(st), res: JSON.stringify(st.result) });
  }
  const playCalls = { ...calls }; restore();
  const diverged = { '+1ulp': 0, '-1ulp': 0 };
  for (const [dir, key] of [[1, '+1ulp'], [-1, '-1ulp']]) {
    install(dir);
    try {
      for (const r of recs) {
        let ok = false;
        try { const st = E.replay(r.cfg, r.actions); ok = E.serialize(st) === r.ser && JSON.stringify(st.result) === r.res; } catch (e) { ok = false; }
        if (!ok) diverged[key]++;
      }
    } finally { restore(); }
  }
  const used = Object.entries(playCalls).filter(([, n]) => n > 0);
  console.log(`   approximated Math calls during ${GAMES} games: ${used.length ? used.map(([f, n]) => `${f}×${n}`).join(', ') : 'none'}`);
  console.log(`   diverged: +1ulp ${diverged['+1ulp']}/${GAMES}, −1ulp ${diverged['-1ulp']}/${GAMES}`);
  assert.deepEqual(diverged, { '+1ulp': 0, '-1ulp': 0 });
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
