// Architecture tests (Node, no browser). Run: node tests/render_api.test.mjs
//  T-api   (A-32): every scene.<name>( used in game.js is in SCENE_API; null.js and board2d.js export all of it.
//  T-graph (A-31): the static import graph of js/engine.js never reaches flags.js, saves.js or js/render/.
//  T-history-keys: lobby.js has no {mode:'history', worldId:'h'} lookup without scenarioId.
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };

const nul = await import('../js/render/null.js');
const b2d = await import('../js/render/board2d.js'); // must not touch the DOM at import
const API = nul.SCENE_API;
ok(Array.isArray(API) && Object.isFrozen(API) && API.length === 48, 'SCENE_API frozen, 48 names: 36 T1 + 12 T5 (' + API.length + ')');
for (const f of ['setLevel', 'pulse', 'onPick', 'pickAt', 'highlight', 'setMotion', 'setQuality', 'getQuality', 'skip', 'introWorld', 'setPawnRing', 'perfStats']) ok(API.includes(f), 'T5 §10.2 name in SCENE_API: ' + f);
const game = readFileSync(resolve(ROOT, 'js/game.js'), 'utf8');
const used = new Set([...game.matchAll(/\bscene\.(\w+)\(/g)].map((m) => m[1]));
for (const u of used) ok(API.includes(u), `game.js calls scene.${u}( which is not in SCENE_API`);
ok(used.size >= 32, 'game.js uses ≥ 32 scene functions (' + used.size + ')');
for (const [name, mod] of [['null.js', nul], ['board2d.js', b2d]]) {
  for (const f of API) {
    if (f === 'kind') ok(typeof mod.kind === 'string', `${name}: kind is a string`);
    else ok(typeof mod[f] === 'function', `${name}: exports ${f}()`);
  }
}
ok(nul.kind === 'none' && b2d.kind === '2d', 'kinds none / 2d');
// scene.js (3D) exports the same API (text check: importing it needs three)
const sceneSrc = readFileSync(resolve(ROOT, 'js/scene.js'), 'utf8');
for (const f of API) ok(new RegExp(`export (async )?(function|const|let) ${f}\\b`).test(sceneSrc), `scene.js exports ${f}`);
// no-op behaviour of the null scene
ok(nul.hasKey('x') === false && (await nul.throwDice([3, 4])).join() === '3,4' && nul.worldLoaded() === true, 'null scene defaults');
ok(JSON.stringify(nul.failedModels()) === '[]' && JSON.stringify(b2d.failedModels()) === '[]', 'failedModels() = []');

// T-graph
const seen = new Set();
function walk(file) {
  if (seen.has(file)) return; seen.add(file);
  if (!existsSync(file)) return;
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:^|\n)\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const spec = m[1] || m[2];
    if (!spec || !spec.startsWith('.')) continue;
    walk(resolve(dirname(file), spec));
  }
}
walk(resolve(ROOT, 'js/engine.js'));
const graph = [...seen].map((f) => f.slice(ROOT.length));
ok(graph.length > 5, 'engine graph parsed (' + graph.length + ' files)');
for (const f of graph) ok(!/flags\.js|saves\.js|\/render\//.test(f), 'engine graph reaches ' + f);

// T-history-keys
const lobby = readFileSync(resolve(ROOT, 'js/lobby.js'), 'utf8');
const lits = [...lobby.matchAll(/\{\s*mode:\s*'history',\s*worldId:\s*'h'[^}]*\}/g)].map((m) => m[0]);
ok(lits.length >= 6, 'history literals found (' + lits.length + ')');
for (const l of lits) ok(/scenarioId/.test(l), 'history lookup without scenarioId: ' + l);

console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
