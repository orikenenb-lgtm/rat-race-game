// T6 helper (Node): ghost games for one key, with the engine lane's archetypes — used by tests/t6_e2e.py for AC-18 (browser worker == Node)
// and for worker timing (CDP CPU throttling does not slow dedicated workers, so the worker's cost is measured here).
//   node tests/t6_ghost_node.mjs <file.json {ends, cfg, cap}>   → prints SAME or the first difference
//   node tests/t6_ghost_node.mjs --time                        → per-world timing: 4 ghosts, monthly advance + finish
import { readFileSync } from 'node:fs';
import * as E from '../js/engine.js';
import * as A from '../js/systems/archetypes.js';
import { GhostSet, setPolicies } from '../js/ghost-worker.js';
const pol = setPolicies(A);
if (!pol) { console.log('no ARCH_API 2 policies'); process.exit(2); }
function run(cfg, cap, step = 1) {
  const out = []; const gs = new GhostSet({ key: 'k', cfg, pol, post: (m) => out.push(m) });
  const per = [];
  for (let m = 2; m <= Math.min(cap, 60); m += step) { const t = performance.now(); gs.advance(m); while (gs.step()); per.push(performance.now() - t); }
  const t1 = performance.now(); gs.finish(cap); while (gs.step()); const fin = performance.now() - t1;
  return { ends: Object.fromEntries(out.filter((x) => x.t === 'done').map((x) => [x.arch, x.end])), per, fin };
}
if (process.argv[2] === '--time') {
  for (const w of ['w1', 'w2', 'w3', 'w4']) {
    const st = E.createGame({ worldId: w, seed: 2024, mode: 'free' }); const cap = Math.ceil(1.6 * st.maxMonths);
    const r = run(E.replayConfig(st), cap); const p = r.per.slice().sort((a, b) => a - b);
    console.log(`${w}: 4 ghosts, advance per player-month p50 ${p[Math.floor(p.length / 2)].toFixed(1)} ms, p95 ${p[Math.floor(0.95 * (p.length - 1))].toFixed(1)} ms, max ${p[p.length - 1].toFixed(1)} ms; months 1–60 total ${r.per.reduce((a, b) => a + b, 0).toFixed(0)} ms; finish to cap ${cap}: ${r.fin.toFixed(0)} ms`);
  }
} else {
  const B = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const r = run(B.cfg, B.cap, 3);
  const norm = (e) => JSON.stringify(e ? { status: e.status, months: e.months, reason: e.reason, stars: e.stars, dims: e.recap && e.recap.dims, tl: e.tl, marks: e.marks } : null);
  const diff = Object.keys(r.ends).concat(Object.keys(B.ends || {})).filter((a, i, x) => x.indexOf(a) === i).filter((a) => norm(r.ends[a]) !== norm((B.ends || {})[a]));
  if (!Object.keys(B.ends || {}).length) { console.log('NO BROWSER ENDS'); process.exit(1); }
  if (diff.length) { console.log('DIFF', diff.join(','), norm(r.ends[diff[0]]).slice(0, 160), '≠', norm((B.ends || {})[diff[0]]).slice(0, 160)); process.exit(1); }
  console.log('SAME', Object.keys(r.ends).length, 'ghosts, cap', B.cap);
}
