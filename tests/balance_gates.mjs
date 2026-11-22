#!/usr/bin/env node
// Balance gates (T7 §5) — HARNESS SKELETON (part A). Reads sim JSON only (never re-implements engine logic), checks freshness
// against the current engine hash, and prints one line per gate of T7 §5.1/§5.2:
//   PASS / FAIL / REPORT / STALE / MISSING(<lane>: <CR>)
//   node tests/balance_gates.mjs [--dir=tools] [--json=FILE]     check only (Tier 1)
//   node tests/balance_gates.mjs --run                           run the producing sims first (Tier 2; refuses while a browser runs)
// Inputs (T7-final F-8): the regenerated tools/balance-data — matrix-w1..w4.json (columnar {world, cols, recs, engineSha}),
// dominance-w1..w4.json, perf.json, rivals.json, stories-w1..w4.json. A required input that is missing prints MISSING and exits 4
// (missing data never passes). Freshness: every file must carry engineSha = sha256(bundleText(collect())) (tools/build-edge.mjs);
// a different or missing hash prints STALE and exits 3. Exit 1 on any blocking FAIL. A1–A3 are evaluated per world.
// Aggregations that the report also prints come from tools/sim.mjs (gates, t6GateResults) — one implementation, no engine logic here.
import { readFileSync, existsSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, bundleText, sha256 } from '../tools/build-edge.mjs';
import { gates as t2Gates, t6GateResults } from '../tools/sim.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const DIR = join(ROOT, arg('dir', 'tools/balance-data'));
const ENGINE = sha256(bundleText(collect()));
const WORLDS = ['w1', 'w2', 'w3', 'w4'];

// ---------------------------------------------------------------- --run (the producing commands, tools/balance-report.md header)
const RUN = [
  ...WORLDS.map((w) => `node tools/sim.mjs --matrix 100 ${w} --quiet`), ...WORLDS.map((w) => `node tools/sim.mjs --dominance 40 ${w}`),
  ...WORLDS.map((w) => `node tools/sim.mjs --stories 60 ${w}`), 'node tools/sim.mjs --perf', 'node tools/sim.mjs --rivals 80', 'node tools/sim.mjs --report',
];
if (process.argv.includes('--run')) {
  const busy = spawnSync('sh', ['-c', "ps aux | grep -E 'chrome.*(swiftshader|headless)|perf_probe|_e2e\\.py|lobby_' | grep -v grep | wc -l"]).stdout.toString().trim();
  if (+busy > 0) { console.error(`REFUSED --run: ${busy} browser/perf processes are running (T7 §5.1: sims never run beside browser suites).`); process.exit(2); }
  for (const c of RUN) { console.log('$ ' + c); try { execSync(c, { cwd: ROOT, stdio: 'inherit', timeout: 3 * 3600e3 }); } catch (e) { console.log(`command failed: ${c}`); } }
}

// ---------------------------------------------------------------- load
function rowsOf(d) {
  if (Array.isArray(d.games)) return d.games;
  if (Array.isArray(d.cols) && Array.isArray(d.recs)) return d.recs.map((r) => Object.fromEntries(d.cols.map((c, i) => [c, r[i]]).concat(d.world && !d.cols.includes('world') ? [['world', d.world]] : [])));
  return [];
}
const REQUIRED = [...WORLDS.map((w) => `matrix-${w}.json`), ...WORLDS.map((w) => `dominance-${w}.json`), 'perf.json'];
const OPTIONAL = ['rivals.json', ...WORLDS.map((w) => `stories-${w}.json`)];
const files = []; const missing = []; const stale = []; const raw = {};
for (const f of [...REQUIRED, ...OPTIONAL]) {
  const p = join(DIR, f);
  if (!existsSync(p)) { if (REQUIRED.includes(f)) missing.push(f); continue; }
  let d; try { d = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { stale.push(`${f}: unreadable (${e.message})`); continue; }
  files.push(f); raw[f] = d;
  if (d.engineSha !== ENGINE) stale.push(`${f}: engineSha ${d.engineSha ? d.engineSha.slice(0, 12) : '(none — CR-21)'} ≠ engine ${ENGINE.slice(0, 12)}`);
}
const byWorld = Object.fromEntries(WORLDS.filter((w) => raw[`matrix-${w}.json`]).map((w) => [w, raw[`matrix-${w}.json`]]));
const T2 = Object.values(byWorld).flatMap((d) => rowsOf(d)); const T7 = T2;
const dom = {}; for (const w of WORLDS) { const d = raw[`dominance-${w}.json`]; if (d) { const { engineSha, ...rest } = d; Object.assign(dom, rest); } }
const perf = raw['perf.json'] || null; const cal = raw['rivals.json'] || null;
const meta = {};

// ---------------------------------------------------------------- helpers
const pct = (xs, f) => (xs.length ? +(100 * xs.filter(f).length / xs.length).toFixed(1) : null);
const by = (xs, k) => xs.reduce((m, x) => ((m[x[k]] ||= []).push(x), m), {});
const has = (rows, ...ks) => rows.length > 0 && ks.every((k) => rows.some((r) => r[k] !== undefined));
const inT = (r) => !!r.inTime;
const median = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const precomputed = (lane, id) => { for (const m of Object.values(meta)) if (m.gates && m.gates[id] != null) return m.gates[id]; return null; };
const M = (lane, cr) => ({ status: `MISSING(${lane}: ${cr})` });

// ---------------------------------------------------------------- gates (T7 §5.1 + §5.2)
const G2 = Object.keys(byWorld).length === WORLDS.length ? t2Gates(byWorld) : null; const G6 = G2 ? t6GateResults(byWorld, dom, cal) : [];
const perWorld = (pol, f) => WORLDS.map((w) => [w, pct(T2.filter((r) => r.world === w && r.policy === pol), f)]);
const G = [
  ['G-A1', true, 'guideTapper in time ≥ 65 %, no character < 50 % (per world)', () => {
    const g = T2.filter((r) => r.policy === 'guideTapper'); if (!has(g, 'inTime', 'char', 'world')) return M('engine', 'matrix');
    const out = WORLDS.map((w) => { const xs = g.filter((r) => r.world === w); const chars = Object.entries(by(xs, 'char')).map(([c, ys]) => [c, pct(ys, inT)]); return { w, all: pct(xs, inT), worst: Math.min(...chars.map(([, v]) => v)), ok: pct(xs, inT) >= 65 && chars.every(([, v]) => v >= 50) }; });
    return { status: out.every((x) => x.ok) ? 'PASS' : 'FAIL', value: out.map((x) => `${x.w} ${x.all}% (worst ${x.worst}%)${x.ok ? '' : ' ✗'}`) }; }],
  ['G-A2', true, 'blindTapper in time ≤ 30 % (per world)', () => { const v = perWorld('blindTapper', inT); if (v.some(([, x]) => x == null)) return M('engine', 'matrix'); return { status: v.every(([, x]) => x <= 30) ? 'PASS' : 'FAIL', value: v }; }],
  ['G-A2b', false, 'naive in time ≤ 40 % (report, director decision)', () => { const v = perWorld('naive', inT); if (v.some(([, x]) => x == null)) return M('engine', 'matrix'); return { status: 'REPORT', value: v }; }],
  ['G-A3', true, 'smart and adaptive in time 55–75 % (per world)', () => {
    const v = WORLDS.flatMap((w) => ['smart', 'adaptive'].map((p) => [w + ' ' + p, pct(T2.filter((r) => r.world === w && r.policy === p), inT)])); if (v.some(([, x]) => x == null)) return M('engine', 'matrix');
    return { status: v.every(([, x]) => x >= 55 && x <= 75) ? 'PASS' : 'FAIL', value: v }; }],
  ['G-A4', true, 'T2 §13.5 A4 no policy best in > 60 % of cells', () => G2 ? { status: G2.A4.pass ? 'PASS' : 'FAIL', value: Object.entries(G2.A4.share).map(([p, x]) => `${p} ${(x * 100).toFixed(0)}%`) } : M('engine', 'matrix')],
  ['G-A5', true, 'T2 §13.5 A5 every focus best in ≥ 1 cell and worse than f:none in ≥ 1', () => G2 ? { status: G2.A5.every((x) => x.pass) ? 'PASS' : 'FAIL', value: G2.A5.map((x) => `${x.focus} ${x.bestCells}/${x.worseThanNoneCells}`) } : M('engine', 'matrix')],
  ['G-A6', true, 'T2 §13.5 A6 dd:flagged beats never & always (pooled, ≥ 3 worlds)', () => G2 ? { status: G2.A6.pass ? 'PASS' : 'FAIL', value: G2.A6.worlds.map((x) => `${x.wid} ${x.beats ? '✓' : '✗'}`) } : M('engine', 'matrix')],
  ['G-A6b', false, 'T2 §13.5 A6b dd:always worse than dd:never in ≥ 1 world', () => G2 ? { status: G2.A6b.pass ? 'PASS' : 'REPORT', value: G2.A6b.worlds.map((x) => `${x.wid} ${x.alwaysWorse}`) } : M('engine', 'matrix')],
  ['G-A7', true, 'T2 §13.5 A7 no option top in > 85 % (allowlist; life / quiz cards listed apart)', () => {
    if (!Object.keys(dom).length) return M('engine', 'dominance');
    const flagged = Object.entries(dom).flatMap(([w, t]) => Object.entries(t).filter(([k, x]) => !x.allow && x.n >= 20 && x.top / x.n > 0.85 && !/^(life|mystery):/.test(k)).map(([k, x]) => `${w} ${k} ${x.top}/${x.n}`));
    return { status: flagged.length ? 'FAIL' : 'PASS', value: flagged }; }],
  ['G-A8', true, 'T2 §13.5 A8 ramp', () => G2 ? { status: G2.A8.pass ? 'PASS' : 'FAIL', value: { smart: G2.A8.smart, guide: G2.A8.guideTapper } } : M('engine', 'matrix')],
  ['G-A9', true, 'T2 §13.5 A9 each ablation changes smart in time by ≥ 3 pp in ≥ 1 world', () => G2 ? { status: G2.A9.every((x) => x.pass) ? 'PASS' : 'FAIL', value: G2.A9.map((x) => `${x.system}: ${x.deltas.map((d) => (d.delta * 100).toFixed(0)).join('/')}`) } : M('engine', 'matrix')],
  ['G-A10', true, 'T2 §13.5 A10 describe p95 < 2 ms, impactFor p95 < 8 ms', () => perf ? { status: perf.describe.p95 < 2 && perf.impactFor.p95 < 8 ? 'PASS' : 'FAIL', value: { describe: perf.describe.p95, impactFor: perf.impactFor.p95 } } : M('engine', 'perf')],
  ...['S8', 'S9', 'S10', 'S11', 'S15', 'S16', 'S17', 'S21', 'S24', 'S25', 'S28'].map((x) => [`G-${x}`, false, `T3 #${x.slice(1)} (stories table in tools/balance-report.md)`, () => (raw[`stories-w1.json`] ? { status: 'REPORT', value: 'see the T3 table' } : M('stories (T3)', 'tools/balance-data/stories-wN.json'))]),
  ['G-T4', false, 'T4 tutorial sim check (if T4 ships it)', () => M('onboarding (T4)', 'AC-R5')],
  ...['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'].map((id) => [`T6-${id}`, !['G5', 'G9'].includes(id), `T6 §16 ${id}`, () => { const x = G6.find((y) => y.id === id); if (!x) return M('engine', 'matrix / dominance'); return { status: x.status === 'met' ? 'PASS' : x.status === 'not met' ? 'FAIL' : x.status === 'accepted' ? 'ACCEPTED' : x.status === 'report' ? 'REPORT' : 'MISSING(engine: --rivals)', value: x.text }; }]),
  ['B-1', true, 'cautious in time ≥ 30 % per world and ≥ 0.5× smart; no character < 15 %', () => {
    if (!has(T7.filter((r) => r.policy === 'cautious'), 'inTime', 'world')) return M('engine', 'CR-21 (cautious policy)');
    const out = Object.entries(by(T7, 'world')).map(([w, xs]) => { const c = pct(xs.filter((r) => r.policy === 'cautious'), inT), s = pct(xs.filter((r) => r.policy === 'smart'), inT);
      const chars = Object.values(by(xs.filter((r) => r.policy === 'cautious'), 'char')).map((ys) => pct(ys, inT)); return { w, c, s, ok: c >= 30 && c >= 0.5 * s && chars.every((v) => v >= 15) }; });
    return { status: out.every((x) => x.ok) ? 'PASS' : 'FAIL', value: out }; }],
  ['B-2', true, 'reckless/gambler ≤ smart − 15 pp; ★★★ ≤ smart; reckless bankrupt ≥ 30 %; greedy ≤ smart', () => {
    if (!has(T7.filter((r) => r.policy === 'reckless'), 'inTime', 'bankrupt', 'stars')) return M('engine', 'CR-21 (reckless/gambler/greedy, bankrupt)');
    const out = Object.entries(by(T7, 'world')).map(([w, xs]) => { const P = (p) => xs.filter((r) => r.policy === p); const s = pct(P('smart'), inT), s3 = pct(P('smart'), (r) => r.stars === 3);
      const ok = ['reckless', 'gambler'].every((p) => pct(P(p), inT) <= s - 15 && pct(P(p), (r) => r.stars === 3) <= s3) && pct(P('reckless'), (r) => r.bankrupt) >= 30 && pct(P('greedy'), inT) <= s; return { w, ok }; });
    return { status: out.every((x) => x.ok) ? 'PASS' : 'FAIL', value: out }; }],
  ['B-3', true, 'soft locks: 0 errors, forced picks ≤ 0.1 % of decisions, dead ends ≤ 5 %', () => {
    if (!has(T7, 'errors', 'forcedPicks', 'decisions')) return M('engine', 'CR-21 (errors, forcedPicks, maxNegCashStreak)');
    const err = T7.reduce((a, r) => a + (r.errors || 0), 0), fp = T7.reduce((a, r) => a + (r.forcedPicks || 0), 0), dec = T7.reduce((a, r) => a + (r.decisions || 0), 0);
    const dead = pct(T7.filter((r) => ['guideTapper', 'cautious', 'smart', 'adaptive'].includes(r.policy)), (r) => r.status === 'playing' && (r.maxNegCashStreak || 0) >= 12);
    return { status: err === 0 && fp <= dec * 0.001 && dead <= 5 ? 'PASS' : 'FAIL', value: { err, fp, dec, dead } }; }],
  ['B-4', true, 'recover in time ≥ 35 % and ≥ 0.5× adaptive; bankrupt ≤ 25 %', () => {
    const g = T7.filter((r) => r.policy === 'recover'); if (!has(g, 'inTime', 'bankrupt')) return M('engine', 'CR-21 (recover policy)');
    const out = Object.entries(by(T7, 'world')).map(([w, xs]) => { const r = pct(xs.filter((x) => x.policy === 'recover'), inT), a = pct(xs.filter((x) => x.policy === 'adaptive'), inT), b = pct(xs.filter((x) => x.policy === 'recover'), (x) => x.bankrupt); return { w, r, a, b, ok: r >= 35 && r >= 0.5 * a && b <= 25 }; });
    return { status: out.every((x) => x.ok) ? 'PASS' : 'FAIL', value: out }; }],
  ['B-5a', true, 'per character, smart in time ∈ [45 %, 85 %]', () => {
    const g = T2.filter((r) => r.policy === 'smart'); if (!has(g, 'inTime', 'char')) return M('engine', 'CR-21');
    const v = Object.entries(by(g, 'char')).map(([c, xs]) => [c, pct(xs, inT)]); return { status: v.every(([, x]) => x >= 45 && x <= 85) ? 'PASS' : 'FAIL', value: v }; }],
  ['B-5b', false, 'characters differ: smart median months span ≥ 6 per world (report)', () => {
    const g = T2.filter((r) => r.policy === 'smart'); if (!has(g, 'months', 'char', 'world')) return M('engine', 'CR-21');
    return { status: 'REPORT', value: Object.entries(by(g, 'world')).map(([w, xs]) => { const m = Object.values(by(xs, 'char')).map((ys) => median(ys.map((y) => y.months))); return [w, Math.max(...m) - Math.min(...m)]; }) }; }],
  ['B-5c', false, 'share of decisions by type per character (report)', () => has(T7, 'decisionsByType') ? { status: 'REPORT', value: 'see JSON' } : M('engine', 'CR-21 (decisionsByType)')],
  ['B-6', false, 'worlds differ: JS distance of decisionsByType ≥ 0.05 per pair (report)', () => has(T7, 'decisionsByType') ? { status: 'REPORT', value: 'computed when data exists' } : M('engine', 'CR-21 (decisionsByType)')],
  ['B-7', true, 'smart median turns ≤ 70 per world [TUNE from R0]', () => {
    const g = T7.filter((r) => r.policy === 'smart'); if (!has(g, 'turns', 'world')) return M('engine', 'CR-21 (turns per game)');
    const v = Object.entries(by(g, 'world')).map(([w, xs]) => [w, median(xs.map((x) => x.turns))]); return { status: v.every(([, t]) => t <= 70) ? 'PASS' : 'FAIL', value: v }; }],
  ['B-8', true, 'impactMismatches = 0 over certain-basis decisions', () => has(T7, 'impactMismatches') ? (() => { const n = T7.reduce((a, r) => a + (r.impactMismatches || 0), 0); return { status: n === 0 ? 'PASS' : 'FAIL', value: n }; })() : M('engine', 'CR-21 (impactMismatches)')],
  ['B-9', true, 'replay byte-identical on a 5 % sample', () => has(T7, 'replayOk') ? (() => { const s = T7.filter((r) => r.replayOk !== undefined); const bad = s.filter((r) => r.replayOk === false).length; return { status: bad === 0 && s.length ? 'PASS' : 'FAIL', value: { sample: s.length, bad } }; })() : M('engine', 'CR-21 (replayOk)')],
];

console.log(`balance gates · engine ${ENGINE.slice(0, 16)} · ${DIR.replace(ROOT + '/', '')} · files ${files.length ? files.join(', ') : 'none'}`);
if (missing.length) { for (const f of missing) console.log(`MISSING  required input ${f} (run: node tests/balance_gates.mjs --run)`); process.exit(4); }
if (stale.length) {
  for (const s of stale) console.log(`STALE (engine changed since the sim ran, or no engineSha) ${s}`);
  for (const [id] of G) console.log(`${id.padEnd(8)} STALE`);
  process.exit(3);
}
let fail = 0;
for (const [id, blocking, what, fn] of G) {
  let r; try { r = fn(); } catch (e) { r = { status: 'FAIL', value: 'gate crashed: ' + e.message }; }
  const st = r.status === 'FAIL' && !blocking ? 'REPORT' : r.status;
  if (st === 'FAIL') fail++;
  console.log(`${id.padEnd(8)} ${st.padEnd(34)} ${what}${r.value !== undefined ? '  ' + JSON.stringify(r.value).slice(0, 160) : ''}`);
}
process.exit(fail ? 1 : 0);
