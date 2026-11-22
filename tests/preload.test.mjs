// T7 CR-33 — the lobby's boot path (Node, no browser). Run: node tests/preload.test.mjs [-v]
// 1. index.html preloads exactly the static import graph of js/main.js + js/lobby.js (one parallel fetch instead of a waterfall),
//    and every preloaded file exists.
// 2. Nothing that only the game needs is on that graph: game.js, ui.js and the T6/T4 in-game modules load on demand (dynamic
//    import() with a cached promise), after the lobby home is usable.
// 3. css/game-play.css (the in-game half of the old game.css) sits right after game.css with no href, so it is not fetched before
//    the lobby is open; window.__rrPlayCss() enables it.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const VERBOSE = process.argv.includes('-v');
let n = 0, fails = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } else if (VERBOSE) console.log('ok  ', msg); };

/** static imports / re-exports of one module (comments stripped; dynamic import() is not followed) */
function staticDeps(file) {
  const src = read(file).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out = [];
  for (const m of src.matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"](\.[^'"]+)['"]|^\s*import\s*['"](\.[^'"]+)['"]/gm)) {
    out.push(posix.normalize(posix.join(posix.dirname(file), m[1] || m[2])));
  }
  return out;
}
function graph(entries) {
  const seen = new Set(); const q = [...entries];
  while (q.length) { const f = q.shift(); if (seen.has(f)) continue; seen.add(f); ok(existsSync(join(ROOT, f)), `${f} exists`); if (existsSync(join(ROOT, f))) q.push(...staticDeps(f)); }
  return seen;
}

const html = read('index.html');
const pre = [...html.matchAll(/<link rel="modulepreload" href="([^"]+)">/g)].map((m) => m[1]);
const G = graph(['js/main.js', 'js/lobby.js']);

/* ---------- 1. preload list == boot graph */
ok(pre.length === new Set(pre).size, `no duplicate modulepreload (${pre.length})`);
for (const f of G) ok(pre.includes(f), `boot module ${f} is preloaded`);
for (const f of pre) ok(G.has(f), `preloaded ${f} is on the boot graph (stale entry otherwise)`);
for (const f of pre) ok(existsSync(join(ROOT, f)), `preloaded ${f} exists`);
const mainTag = html.indexOf('<script type="module" src="js/main.js">');
ok(mainTag > 0 && pre.length > 0 && html.indexOf('rel="modulepreload"') < mainTag, 'preloads come before the main.js script tag');

/* ---------- 2. in-game modules stay off the boot graph */
const LAZY = ['js/game.js', 'js/ui.js', 'js/summary.js', 'js/ghosts.js', 'js/ghost-worker.js', 'js/rewind.js', 'js/onboard.js', 'js/scene.js',
  'js/render/select.js', 'js/render/overlay.js', 'js/render/assetinfo.js', 'js/render/vocab.js', 'js/data/characters-meta.js'];
for (const f of LAZY) ok(!G.has(f), `${f} is not loaded before the lobby home (on demand only)`);
// (practice.js and js/systems/* are still on it, via engine.js — engine lane; see docs/next-level/verification)

/* ---------- 3. css/game-play.css is deferred, in the old cascade spot */
const iGame = html.indexOf('<link rel="stylesheet" href="css/game.css">'), iPlay = html.indexOf('<link id="playCss" data-href="css/game-play.css">');
const iLobby = html.indexOf('<link rel="stylesheet" href="css/lobby.css">');
ok(iGame > 0 && iPlay > iGame && iLobby > iPlay, 'playCss placeholder sits between game.css and lobby.css');
ok(!/<link[^>]*\shref="css\/game-play\.css"/.test(html), 'game-play.css has no href in the markup (not fetched at boot)');
ok(existsSync(join(ROOT, 'css/game-play.css')), 'css/game-play.css exists');
ok(/window\.__rrPlayCss\s*=\s*function/.test(html), 'index.html defines window.__rrPlayCss()');
ok(/__rrPlayCss/.test(read('js/main.js')) && /__rrPlayCss/.test(read('js/lobby.js')) && /__rrPlayCss/.test(read('js/game.js')), 'main.js, lobby.js and game.js enable it');
const play = read('css/game-play.css');
for (const sel of ['.hud{', '#evCard', '#sheet', '#coach', '#toast']) ok(play.includes(sel), `game-play.css styles ${sel}`);
const core = read('css/game.css');
for (const sel of [':root{', '.primary{', '.chip{', '.modal{', '.loading{', '.fbworld{']) ok(core.includes(sel), `game.css keeps ${sel.replace('{', '')}`);

console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
