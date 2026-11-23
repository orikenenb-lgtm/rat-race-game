#!/usr/bin/env node
// Build the engine for the `verify-result` Supabase Edge Function so the server replays games with EXACTLY the client's code.
//
//   node tools/build-edge.mjs                 copy js/engine.js + every module it imports (static and `import('./…')`)
//                                             into supabase/functions/verify-result/engine/, write engine.bundle.json
//                                             (canonical {entry, files:{path: source}}) and engine_pin.js (its SHA-256).
//   node tools/build-edge.mjs --check         exit 1 if the pinned bundle differs from js/ (run in CI / before a release:
//                                             a client engine change without a function redeploy makes honest games fail verification).
//   node tools/build-edge.mjs --hash          print the SHA-256 of the current js/ engine (no files written).
//
// How the function gets the engine: it pins the bundle's SHA-256 (engine_pin.js, a few hundred bytes) and at cold start fetches the
// pinned files from the live game site (GitHub Pages = literally what players run), rebuilds the canonical bundle text, re-checks
// the hash and imports the modules from data: URLs (engine_loader.js). Code that does not hash to the pin is never executed, so
// the source of the bytes does not matter for integrity (a request may also carry `engine_bundle` = engine.bundle.json for
// bootstrapping/tests). The copied engine/ tree is for local Deno runs, CLI deploys and review diffs.
// No dependencies, no code transformation: the sources are byte-identical to js/ (only import specifiers are resolved at load time).
//
// Worlds wave 0 — per-world packs (the 900,000-char MAX_BUNDLE and the ~2 s Edge CPU limit cannot hold 12 worlds in one bundle):
//   • the CORE bundle = js/engine.js and everything it imports (w1–w4, h, systems, finance …), minus EDGE_EXCLUDE (history-mode data that
//     no ranked replay ever loads: js/data/real.js is only reached through history.js's dynamic import);
//   • one PACK per lazy world (js/worlds/index.js LAZY_IDS): worlds/<id>.js and the modules it reaches that are not in the core
//     (its mechanic modules). A replay loads the core + the played world's pack only. engine_pin.js pins the core SHA-256 and, in
//     WORLD_PACKS, each pack's SHA-256 + per-file hashes. --check verifies the core and every pack.
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'js');
const FN = join(ROOT, 'supabase', 'functions', 'verify-result');
const ENTRY = 'engine.js';
/** Never in the verifier's core bundle: history-mode market data (34 KB), reached only by history.js's dynamic import (loadRealData). */
export const EDGE_EXCLUDE = new Set(['data/real.js']);
export const MAX_CORE = 900000;   // = verify_core.js MAX_BUNDLE (chars)
export const MAX_PACK = 200000;   // = verify_core.js MAX_PACK (chars)

/** Relative import specifiers of a module: static `from '…'`, side-effect `import '…'`, dynamic `import('…')`. */
export function importsOf(src) {
  const out = new Set();
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"]+)\1/g;
  let m; while ((m = re.exec(src))) out.add(m[2]);
  return [...out];
}

/** Walk the module graph from js/engine.js → {path (relative to js/, posix): source}. */
export function collect(entry = ENTRY, srcDir = SRC, exclude = EDGE_EXCLUDE) {
  const files = {}; const todo = [entry];
  while (todo.length) {
    const p = todo.pop(); if (files[p] != null || exclude.has(p)) continue;
    const abs = join(srcDir, p);
    if (!existsSync(abs)) throw new Error(`build-edge: ${p} is imported but missing`);
    const src = readFileSync(abs, 'utf8'); files[p] = src;
    for (const s of importsOf(src)) {
      const r = normalize(join(dirname(p), s)).split('\\').join('/');
      if (r.startsWith('..')) throw new Error(`build-edge: ${p} imports outside js/: ${s}`);
      todo.push(r);
    }
  }
  return files;
}

/** Canonical bundle text (sorted keys) — its SHA-256 is the engine id pinned in the function. */
export function bundleText(files, entry = ENTRY) {
  const sorted = {}; for (const k of Object.keys(files).sort()) sorted[k] = files[k];
  return JSON.stringify({ entry, files: sorted });
}
/** The lazy worlds (js/worlds/index.js LAZY_IDS, read from the source — no import of the engine). */
export function lazyIds(srcDir = SRC) { const m = /LAZY_IDS = Object\.freeze\(\[([^\]]*)\]\)/.exec(readFileSync(join(srcDir, 'worlds', 'index.js'), 'utf8')); return m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : []; }
/** One world's pack: worlds/<id>.js + every module it reaches that the core does not already carry. */
export function collectPack(id, core = collect(), srcDir = SRC) {
  const all = collect(`worlds/${id}.js`, srcDir); const files = {};
  for (const [p, src] of Object.entries(all)) if (core[p] == null) files[p] = src; else if (core[p] !== src) throw new Error(`build-edge: ${p} differs between core and pack ${id}`);
  return files;
}
export const packEntry = (id) => `worlds/${id}.js`;
/** Core + every pack: {core: {files, text, hash}, packs: {id: {files, text, hash}}}. */
export function collectAll() {
  const files = collect(); const text = bundleText(files);
  const packs = {}; for (const id of lazyIds()) { const pf = collectPack(id, files); const pt = bundleText(pf, packEntry(id)); packs[id] = { files: pf, text: pt, hash: sha256(pt) }; }
  return { core: { files, text, hash: sha256(text) }, packs };
}
export const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

function sizes(all) {
  const rows = [{ id: 'core', chars: all.core.text.length, bytes: Buffer.byteLength(all.core.text), max: MAX_CORE, modules: Object.keys(all.core.files).length }];
  for (const [id, p] of Object.entries(all.packs)) rows.push({ id, chars: p.text.length, bytes: Buffer.byteLength(p.text), max: MAX_PACK, modules: Object.keys(p.files).length, total: all.core.text.length + p.text.length });
  return rows;
}
function build() {
  const all = collectAll(); const { files, text, hash } = all.core;
  for (const r of sizes(all)) if (r.chars > r.max) throw new Error(`build-edge: ${r.id} is ${r.chars} chars > ${r.max}`);
  rmSync(join(FN, 'engine'), { recursive: true, force: true }); rmSync(join(FN, 'packs'), { recursive: true, force: true });
  const copy = (fs) => { for (const [p, src] of Object.entries(fs)) { const out = join(FN, 'engine', p); mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, src); } };
  copy(files); for (const p of Object.values(all.packs)) copy(p.files);
  writeFileSync(join(FN, 'engine.bundle.json'), text);
  mkdirSync(join(FN, 'packs'), { recursive: true });
  for (const [id, p] of Object.entries(all.packs)) writeFileSync(join(FN, 'packs', `${id}.bundle.json`), p.text);
  const list = (fs) => Object.keys(fs).sort().map((p) => `    ${JSON.stringify(p)}: ${JSON.stringify(sha256(fs[p]))},`).join('\n');
  const packs = Object.entries(all.packs).map(([id, p]) => `  ${JSON.stringify(id)}: { sha256: ${JSON.stringify(p.hash)}, chars: ${p.text.length}, bytes: ${Buffer.byteLength(p.text)}, entry: ${JSON.stringify(packEntry(id))}, files: {\n${list(p.files)}\n  } },`).join('\n');
  writeFileSync(join(FN, 'engine_pin.js'),
    `// GENERATED by tools/build-edge.mjs — do not edit. SHA-256 of engine.bundle.json (the exact client engine core this function replays)\n` +
    `// and of each lazy world's pack (packs/<id>.bundle.json: the world file + its mechanic modules; a replay loads core + one pack).\n` +
    `export const ENGINE_SHA256 = ${JSON.stringify(hash)};\nexport const ENGINE_BYTES = ${Buffer.byteLength(text)};\nexport const ENGINE_CHARS = ${text.length};\nexport const ENGINE_FILES = {\n${list(files).replace(/^    /gm, '  ')}\n};\n` +
    `export const WORLD_PACKS = {\n${packs}\n};\n`);
  for (const r of sizes(all)) console.log(`${r.id === 'core' ? 'engine core' : 'pack ' + r.id}: ${r.id === 'core' ? hash.slice(0, 12) : all.packs[r.id].hash.slice(0, 12)}  ${r.modules} modules, ${r.chars} chars (${(r.chars / r.max * 100).toFixed(1)}% of ${r.max})${r.total ? `, core + pack = ${r.total} chars` : ''}`);
  console.log(`→ ${relative(ROOT, FN)}`);
  return { hash, text };
}

function pinned() {
  const p = join(FN, 'engine_pin.js'); if (!existsSync(p)) return null;
  const src = readFileSync(p, 'utf8');
  const m = /ENGINE_SHA256 = "([0-9a-f]{64})"/.exec(src); if (!m) return null;
  const packs = {}; for (const x of src.matchAll(/"([^"]+)": \{ sha256: "([0-9a-f]{64})"/g)) packs[x[1]] = x[2];
  return { core: m[1], packs };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (args.includes('--check')) {
    const all = collectAll(); const pin = pinned() || { core: null, packs: {} }; let bad = 0;
    if (all.core.hash !== pin.core) { bad++; console.error(`✗ engine core changed since the last edge build (js/ ${all.core.hash.slice(0, 12)} ≠ pinned ${String(pin.core).slice(0, 12)}). Run: node tools/build-edge.mjs and redeploy verify-result together with the site.`); }
    for (const [id, p] of Object.entries(all.packs)) if (p.hash !== pin.packs[id]) { bad++; console.error(`✗ world pack ${id} changed (js/ ${p.hash.slice(0, 12)} ≠ pinned ${String(pin.packs[id]).slice(0, 12)}). Run: node tools/build-edge.mjs`); }
    for (const id of Object.keys(pin.packs)) if (!all.packs[id]) { bad++; console.error(`✗ pinned pack ${id} is no longer a lazy world`); }
    for (const r of sizes(all)) if (r.chars > r.max) { bad++; console.error(`✗ ${r.id}: ${r.chars} chars > ${r.max}`); }
    if (bad) process.exit(1);
    console.log(`✓ verify-result pins the current engine core ${all.core.hash} and ${Object.keys(all.packs).length} world pack(s): ${Object.entries(all.packs).map(([id, p]) => `${id} ${p.hash.slice(0, 12)}`).join(', ')}`);
    for (const r of sizes(all)) console.log(`  ${r.id}: ${r.chars} chars (${(r.chars / r.max * 100).toFixed(1)}% of ${r.max})`);
  } else if (args.includes('--hash')) console.log(sha256(bundleText(collect())));
  else if (args.includes('--sizes')) for (const r of sizes(collectAll())) console.log(JSON.stringify(r));
  else build();
}
