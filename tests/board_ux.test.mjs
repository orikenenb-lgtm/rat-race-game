// 3D upgrade wave 1 (team ג) — Node checks for the board UX layer. Run: node tests/board_ux.test.mjs
//  T-opt   : SCENE_OPTIONAL (markTile, onTilePick, cityKeys, homeView) is exported by null.js, board2d.js and scene.js; game.js calls
//            them only as scene.name?.(…) (an older renderer without them never throws); SCENE_API itself is unchanged (48).
//  T-tiles : every tile of every world has a short name ≤ 10 chars (never "…") and a one-line description; the steps / "אתה כאן" text.
//  T-pin   : the engine files stay pinned (tools/build-edge.mjs --check) and no pinned file imports the render layer.
//  T-saves : the wave adds nothing to S.ui (no display data in saves: no new S.ui.<key> writes in game.js).
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let fails = 0, n = 0;
const ok = (c, msg) => { n++; if (!c) { fails++; console.log('FAIL', msg); } };
const src = (f) => readFileSync(resolve(ROOT, f), 'utf8');

const nul = await import('../js/render/null.js');
const b2d = await import('../js/render/board2d.js');
const T = await import('../js/render/tiles.js');
const E = await import('../js/engine.js');

/* T-opt */
const OPT = nul.SCENE_OPTIONAL;
ok(Array.isArray(OPT) && Object.isFrozen(OPT), 'SCENE_OPTIONAL frozen');
for (const f of ['markTile', 'onTilePick', 'cityKeys', 'homeView']) ok(OPT.includes(f), 'SCENE_OPTIONAL has ' + f);
ok(nul.SCENE_API.length === 48 && OPT.every((f) => !nul.SCENE_API.includes(f)), 'SCENE_API unchanged (48) and disjoint from SCENE_OPTIONAL');
const scene = src('js/scene.js'); const game = src('js/game.js');
for (const f of OPT) {
  ok(typeof nul[f] === 'function', 'null.js exports ' + f);
  ok(typeof b2d[f] === 'function', 'board2d.js exports ' + f);
  ok(new RegExp(`export (async )?function ${f}\\b`).test(scene), 'scene.js exports ' + f);
  ok(!new RegExp(`\\bscene\\.${f}\\(`).test(game), `game.js calls scene.${f} only optionally (scene.${f}?.(…))`);
}
ok(/scene\.markTile\?\.\('dest', dest\)/.test(game) && /scene\.markTile\?\.\('current', pos\)/.test(game), 'game.js marks the destination before the hops and the current tile after landing');
ok(nul.cityKeys().length === 0 && typeof nul.onTilePick(() => {}) === 'function' && nul.markTile('dest', 3) === undefined, 'null scene: no-op defaults');
ok(typeof b2d.onTilePick(() => {}) === 'function' && b2d.cityKeys().length === 0, 'board2d: callable before init (no DOM at import)');
// the watchdog exists and is wall-clock based (G10): every awaited tween is armed, cleared when the loop finishes it
ok(/function armWatch\(tw, ms = tw\.dur \+ WATCH_MARGIN_MS\)/.test(scene) && /tweens\.push\(tw\); armWatch\(tw\)/.test(scene) && /clearTimeout\(tw\.wd\); tw\.res\(\)/.test(scene), 'scene.js: tween watchdog armed per tween, cleared on finish');
ok(/if \(pageHidden \|\| paused \|\| covered\(\)\) \{ armWatch\(tw, 1000\); return; \}/.test(scene), 'scene.js: the watchdog waits (re-arms) while hidden / paused / covered');
// camera (G7): resize keeps the user's orbit; azimuth limits; homeView resets
ok(/addScaledVector\(userDir \|\| dir, userDir \? goalDist\(\) : goalD\)/.test(scene), 'scene.js: resize keeps the user orbit');
ok(/controls\.minAzimuthAngle = az0 - AZ_RANGE; controls\.maxAzimuthAngle = az0 \+ AZ_RANGE/.test(scene) && /maxPolarAngle = 1\.36/.test(scene), 'scene.js: azimuth ±60°, the under-board limit kept');
ok(/export function resetCamera\(\) \{[^}]*userDir = null/.test(scene), 'resetCamera (new game) forgets the user orbit');

/* T-tiles */
const types = new Set();
for (const wid of ['w1', 'w2', 'w3', 'w4', 'h']) {
  let tiles; try { tiles = E.boardInfo(wid); } catch (e) { tiles = null; }
  ok(tiles && tiles.length === 40, `${wid}: 40 tiles`);
  for (const t of tiles || []) {
    const x = T.tileText(t); types.add(t.type);
    ok(x.short && x.short.length <= T.SHORT_MAX, `${wid}[${t.index}] short ≤ ${T.SHORT_MAX}: "${x.short}"`);
    ok(!/…|\.\.\./.test(x.short + x.name), `${wid}[${t.index}] no ellipsis`);
    ok(x.desc && x.desc.length >= 20 && x.desc.length <= 160, `${wid}[${t.index}] one-line description (${t.type})`);
    ok(x.name === t.name, `${wid}[${t.index}] the full name is the world data name`);
    ok(x.emoji && x.emoji !== '⭐', `${wid}[${t.index}] has an icon (${t.icon})`);
  }
}
for (const ty of types) ok(T.TILE_TEXT[ty], 'TILE_TEXT covers type ' + ty);
ok(T.tileText({ type: 'crisis', name: 'פיטורים' }).desc.includes('פיטורים'), 'a world override name gets its own description');
ok(T.tileText({ type: 'edu', name: 'לימודים וקריירה' }).short === 'לימודים', 'long data names get the short word');
ok(T.stepsTo(38, 2, 40) === 4 && T.stepsTo(5, 5, 40) === 0 && T.stepsTo(10, 3, 40) === 33, 'stepsTo wraps the ring');
ok(T.whereText(0) === 'אתה כאן' && T.whereText(1) === 'עוד צעד אחד' && T.whereText(7) === 'עוד 7 צעדים', 'where text');
const sh = T.tileSheet({ type: 'deal', name: 'הזדמנות', icon: 'trend' }, 12, 0, 40);
ok(sh.where === 'עוד 12 צעדים' && sh.index === 12 && sh.emoji === '📈' && !sh.here, 'tileSheet data');
ok(T.landedText({ type: 'payday', name: 'יום משכורת' }) === 'נחתת על יום משכורת', 'landing text');

/* T-pin */
let pin = ''; try { pin = execFileSync('node', [resolve(ROOT, 'tools/build-edge.mjs'), '--check'], { encoding: 'utf8' }); } catch (e) { pin = 'ERR ' + (e.stdout || '') + (e.stderr || ''); }
ok(/✓ verify-result pins the current engine/.test(pin), 'build-edge --check passes (engine unchanged): ' + pin.trim().slice(0, 120));
for (const f of ['js/engine.js', 'js/life.js', 'js/rng.js', 'js/practice.js', 'js/history.js', 'js/achievements.js', 'js/worlds/common.js', 'js/worlds/w1.js'])
  ok(!/render\/tiles\.js/.test(src(f)), f + ' does not import the render-side tile text');

/* T-saves: no new S.ui keys from this wave (the life helpers weddingAge / burnSeen / lifeSeen were already there) */
const uiKeys = new Set([...game.matchAll(/\bS\.ui\.(\w+)\s*(?:\?\?=|=(?!=))/g)].map((m) => m[1]));
const KNOWN = ['seq', 'fundWarn', 'weddingAge', 'burnSeen', 'lifeSeen', 'inflReality', 'tl', 'hist', 'pensionHist', 'trackMonth', 'coach', 'firstPayday'];
for (const k of uiKeys) ok(KNOWN.includes(k), 'game.js writes S.ui.' + k + ' (display data must go to rr2-settings, not the save)');

console.log(`${n - fails} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
