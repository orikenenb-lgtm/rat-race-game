#!/usr/bin/env node
// Balance gates (T7 §5) — HARNESS SKELETON (part A). Reads sim JSON only (never re-implements engine logic), checks freshness
// against the current engine hash, and prints one line per gate of T7 §5.1/§5.2:
//   PASS / FAIL / REPORT / STALE / MISSING(<lane>: <CR>)
//   node tests/balance_gates.mjs [--dir=tools] [--json=FILE]     check only (Tier 1)
//   node tests/balance_gates.mjs --run                           run the producing sims first (Tier 2; refuses while a browser runs)
// Inputs (any that exist): tools/balance-t2.json | tools/balance-t2-w{1..4}.json, tools/balance-t3.json, tools/balance-t7.json[-wN].
// Row formats accepted: {games:[{world, char, policy, …}]} or columnar {world, cols:[…], recs:[[…]]} (today's T2 output).
// Freshness: every file must carry engineSha = sha256(bundleText(collect())) (tools/build-edge.mjs). A different or missing hash
// prints STALE and exits 3 — stale data never passes. Exit 1 on any blocking FAIL. Sim gates are run later (engine still changing).
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, bundleText, sha256 } from '../tools/build-edge.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || '').split('=').slice(1).join('=') || d;
const DIR = join(ROOT, arg('dir', 'tools'));
const ENGINE = sha256(bundleText(collect()));

// ---------------------------------------------------------------- --run (producing commands, CR-21 data contract)
const RUN = [
  ...['w1', 'w2', 'w3', 'w4'].map((w) => `node tools/sim.mjs --matrix 100 ${w} --json tools/balance-t2-${w}.json`),
  'node tools/sim.mjs --dominance 40 --json tools/balance-t2-dominance.json', 'node tools/sim.mjs --ablate --json tools/balance-t2-ablate.json',
  ...['w1', 'w2', 'w3', 'w4'].map((w) => `node tools/sim.mjs --t7 100 ${w} --json tools/balance-t7-${w}.json`),
];
if (process.argv.includes('--run')) {
  const busy = spawnSync('sh', ['-c', "ps aux | grep -E 'chrome.*(swiftshader|headless)|perf_probe|_e2e\\.py|lobby_' | grep -v grep | wc -l"]).stdout.toString().trim();
  if (+busy > 0) { console.error(`REFUSED --run: ${busy} browser/perf processes are running (T7 §5.1: sims never run beside browser suites).`); process.exit(2); }
  for (const c of RUN) { console.log('$ ' + c); try { execSync(c, { cwd: ROOT, stdio: 'inherit', timeout: 3 * 3600e3 }); } catch (e) { console.log(`MISSING(engine: CR-21) command failed: ${c}`); } }
}

// ---------------------------------------------------------------- load
function rowsOf(d) {
  if (Array.isArray(d.games)) return d.games;
  if (Array.isArray(d.cols) && Array.isArray(d.recs)) return d.recs.map((r) => Object.fromEntries(d.cols.map((c, i) => [c, r[i]]).concat(d.world && !d.cols.includes('world') ? [['world', d.world]] : [])));
  return [];
}
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^balance-t[237](-[a-z0-9]+)?\.json$/.test(f)) : [];
if (arg('json')) files.push(arg('json'));
const data = { t2: [], t3: [], t7: [] }; const stale = []; const meta = {};
for (const f of files) {
  const p = f.includes('/') ? f : join(DIR, f); let d;
  try { d = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { stale.push(`${f}: unreadable (${e.message})`); continue; }
  const lane = (/balance-(t[237])/.exec(f) || [])[1] || 't7';
  if (d.engineSha !== ENGINE) stale.push(`${f}: engineSha ${d.engineSha ? d.engineSha.slice(0, 12) : '(none — CR-21)'} ≠ engine ${ENGINE.slice(0, 12)}`);
  data[lane].push(...rowsOf(d)); meta[f] = { n: rowsOf(d).length, gates: d.gates || null };
}

// ---------------------------------------------------------------- helpers
const pct = (xs, f) => (xs.length ? +(100 * xs.filter(f).length / xs.length).toFixed(1) : null);
const by = (xs, k) => xs.reduce((m, x) => ((m[x[k]] ||= []).push(x), m), {});
const has = (rows, ...ks) => rows.length > 0 && ks.every((k) => rows.some((r) => r[k] !== undefined));
const inT = (r) => !!r.inTime;
const median = (xs) => { const s = xs.filter((x) => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const precomputed = (lane, id) => { for (const m of Object.values(meta)) if (m.gates && m.gates[id] != null) return m.gates[id]; return null; };
const M = (lane, cr) => ({ status: `MISSING(${lane}: ${cr})` });

// ---------------------------------------------------------------- gates (T7 §5.1 + §5.2)
const T2 = data.t2, T7 = data.t7.length ? data.t7 : data.t2;
const G = [
  ['G-A1', true, 'guideTapper in time ≥ 65 %, no character < 50 %', () => {
    const g = T2.filter((r) => r.policy === 'guideTapper'); if (!has(g, 'inTime', 'char')) return M('engine', 'CR-21');
    const all = pct(g, inT); const chars = Object.entries(by(g, 'char')).map(([c, xs]) => [c, pct(xs, inT)]);
    return { status: all >= 65 && chars.every(([, v]) => v >= 50) ? 'PASS' : 'FAIL', value: { all, chars } }; }],
  ['G-A2', true, 'blindTapper in time ≤ 30 %', () => { const g = T2.filter((r) => r.policy === 'blindTapper'); if (!has(g, 'inTime')) return M('engine', 'CR-21'); const v = pct(g, inT); return { status: v <= 30 ? 'PASS' : 'FAIL', value: v }; }],
  ['G-A2b', false, 'naive in time ≤ 40 % (report, director decision)', () => { const g = T2.filter((r) => r.policy === 'naive'); if (!has(g, 'inTime')) return M('engine', 'CR-21'); return { status: 'REPORT', value: pct(g, inT) }; }],
  ['G-A3', true, 'smart and adaptive in time 55–75 %', () => {
    const v = ['smart', 'adaptive'].map((p) => [p, pct(T2.filter((r) => r.policy === p), inT)]); if (v.some(([, x]) => x == null)) return M('engine', 'CR-21');
    return { status: v.every(([, x]) => x >= 55 && x <= 75) ? 'PASS' : 'FAIL', value: v }; }],
  ...['A4', 'A5', 'A6', 'A6b', 'A7', 'A8', 'A9', 'A10'].map((a) => [`G-${a}`, !['A6b'].includes(a), `T2 §13.5 ${a}`, () => { const p = precomputed('t2', a); return p ? { status: p.ok ? 'PASS' : (a === 'A6b' ? 'REPORT' : 'FAIL'), value: p.value } : M('engine', 'CR-21 (cell aggregates / dominance / ablation JSON)'); }]),
  ...['S8', 'S9', 'S10', 'S11', 'S15', 'S16', 'S17', 'S21', 'S24', 'S25', 'S28'].map((s) => [`G-${s}`, s !== 'S15', `T3 #${s.slice(1)}`, () => { const p = precomputed('t3', s); return p ? { status: p.ok ? 'PASS' : (s === 'S15' ? 'REPORT' : 'FAIL'), value: p.value } : M('stories (T3)', 'tools/balance-t3.json'); }]),
  ['G-T4', false, 'T4 tutorial sim check (if T4 ships it)', () => M('onboarding (T4)', 'AC-R5')],
  ...[1, 2, 3, 4].map((i) => [`G-T6-${i}`, true, 'reserved for the T6 spec', () => M('T6', 'spec rows G-T6-1…4')]),
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

console.log(`balance gates · engine ${ENGINE.slice(0, 16)} · files ${files.length ? files.map((f) => `${f}(${meta[f]?.n ?? 0})`).join(', ') : 'none'}`);
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
