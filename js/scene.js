// מירוץ העכברים 2.0 — three.js scene: per-world board + decor, landmarks, the growing city, the pawn and all the juice
// (drops, dust, labels, sparkles, confetti, shake, launches). No game rules here — game.js tells us what to show.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MOTION, labelColor, worldStyle, normLevel, kitParts, fixtureLevels, fixtureCity, fixtureCount, activityOf, ACTIVITY_ICON, ARCHETYPE_ICON } from './render/vocab.js';
import { resolveTier, TIER_CONFIG, tierDpr, makeGovernor, qualityPref, setEnv } from './render/quality.js';
import { bus } from './bus.js';
import { flattenModel, flatEnabled, LIT_RE, isSharedFlat, litCopy, flatFallback, FLAT_KEY } from './render/flatten.js';
import { createKit } from './render/kit3d.js';
import { tileText } from './render/tiles.js';

let renderer, scene, camera, controls, hemi, sun, fill;
let worldGroup, cityGroup, fxGroup, pawn = null, pawnRing = null, pawnKey = '';
let world = null, theme = null;
let speed = 1;
let hopping = false;
let shakeUntil = 0, shakeDur = 1, shakeAmp = 0;
let viewRect = null;
let centerMat = null, tileFrames = null, landmarkCount = 0, pedestalCount = 0;
const tweens = [];
const updaters = new Set();
const disposables = [];
export let lowPower = false;
// T5: quality tier (§8.1), reduced motion (§7.2), frame accounting (§8.5)
let tier = 'high', cfg = TIER_CONFIG.high, coarse = false, reduced = false, pageHidden = false;
let framesRendered = 0, turnMs = 0, fpsBuf = [], governor = null, kit = null;
let loopFn = null, onVis = null, onPtr = [], offBus = [], perfEl = null, perfTimer = 0, onOnline = null;
const pickCbs = new Set(), tileCbs = new Set();

const loader = new GLTFLoader();
const cache = new Map();   // url -> Promise<Group>
const ready = new Map();   // url -> Group (loaded)
const failed = new Set();  // model names whose GLB failed or timed out (T1: S-N6 notice)
/** T1: renderer kind for game.js ('3d' | '2d' board2d.js | 'none' null.js) */
export const kind = '3d';
const GLB_TIMEOUT_MS = 15000;
let onResize = null, ctxCbs = [];

/** Animation speed factor: 1 normal, 0.5 = turbo (durations are multiplied by it). */
export function setSpeed(f) { speed = f; }
const D = (ms) => Math.max(1, ms * speed);

/* ============================================================ setup */
/** Is the GPU a software renderer? Probed on a throw-away context BEFORE the real one, so antialias can follow the tier. */
function probeLowPower() {
  try {
    const c = document.createElement('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl'); if (!gl) return false;
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rn = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* ignore */ }
    return /swiftshader|llvmpipe|software|basic render/i.test(rn);
  } catch (e) { return false; }
}
export async function init(canvas) {
  const hq = /[?&]hq\b/.test(location.search);
  lowPower = !hq && probeLowPower();
  coarse = matchMedia('(pointer:coarse)').matches;
  setEnv({ lowPower, coarse, hq }); // the lobby's "עכשיו" line and setQualityPref() resolve the same tier as the scene (M-3)
  tier = resolveTier({ lowPower, coarse, hq }); cfg = TIER_CONFIG[tier];
  // paused only if the lobby really covers the board now (game.js keeps it in sync); a start that throws later never leaves
  // a hidden, paused canvas behind a visible game (review m-3)
  try { const st = document.getElementById('start'); paused = !!(st && !st.hidden); } catch (e) { paused = false; }
  renderer = new THREE.WebGLRenderer({ canvas, antialias: cfg.antialias, alpha: true, powerPreference: 'high-performance' });
  canvasVis();
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rn = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    lowPower = !hq && /swiftshader|llvmpipe|software|basic render/i.test(rn);
  } catch (e) { /* ignore */ }
  setEnv({ lowPower });
  renderer.debug.checkShaderErrors = /[?&]shaderdebug\b/.test(location.search); // the per-program log queries are synchronous GPU waits (T5 freeze note)
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  governor = makeGovernor({ tier, disabled: lowPower || qualityPref() !== 'auto' });

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  camera.position.set(3, 20, 22);
  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.enablePan = false;
  controls.minDistance = 9; controls.maxDistance = 60; controls.maxPolarAngle = 1.36;

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  hemi = new THREE.HemisphereLight(0xfff1d6, 0x7a5a48, 1);
  scene.add(hemi);
  sun = new THREE.DirectionalLight(0xffe2b0, 2.6);
  sun.position.set(12, 22, 9);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 70 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  fill = new THREE.PointLight(0xffffff, 0, 40, 1.6); fill.position.set(0, 6, 0); scene.add(fill);
  applyTierRenderer();

  worldGroup = new THREE.Group(); cityGroup = new THREE.Group(); fxGroup = new THREE.Group();
  kit = createKit(); kit.setTier(tier);
  scene.add(worldGroup, cityGroup, fxGroup, kit.group, pickGroup, labelGroup, markGroup);

  onResize = () => { resize(); invalidate(); };
  addEventListener('resize', onResize);
  // T1: WebGL context loss → game.js decides (keep the save, wait for restore, else offer מצב קל)
  const onLost = (e) => { e.preventDefault(); for (const f of ctxCbs) { try { f('lost'); } catch (x) { console.error(x); } } };
  const onRest = () => { invalidate(); for (const f of ctxCbs) { try { f('restored'); } catch (x) { console.error(x); } } };
  canvas.addEventListener('webglcontextlost', onLost); canvas.addEventListener('webglcontextrestored', onRest);
  onPtr.push([canvas, 'webglcontextlost', onLost], [canvas, 'webglcontextrestored', onRest]);
  // an explicit choice in the lobby applies now and disarms the governor; 'auto' re-arms it (never on software GL) — M-3
  const onQ = (e = {}) => {
    if (e.auto) return;
    if (governor) governor.disabled = lowPower || e.pref !== 'auto';
    setQuality(TIER_CONFIG[e.tier] ? e.tier : resolveTier({ pref: e.pref }));
  };
  offBus.push(bus.on('quality:change', onQ));
  resize();
  controls.addEventListener('start', () => { interacting = true; orbitMoved = false; homing = false; wake(); });
  controls.addEventListener('end', () => { interacting = false; if (orbitMoved) keepUserOrbit(); wake(1500); });
  controls.addEventListener('change', () => { if (interacting) orbitMoved = true; else if (userDir && !camMoving && !celebrating && !homing) keepUserOrbit(); wake(600); }); // damping inertia after a drag
  let last = performance.now();
  loopFn = (now) => {
    const rawDt = now - last; const dt = Math.min(0.1, rawDt / 1000); last = now;
    // render on demand: full speed while something moves; nothing when idle, under the lobby (paused) or in a hidden tab.
    // (T5: frames under the lobby were wasted and each one is a synchronous GPU wait on software GL — the boot freeze.)
    if (paused || pageHidden || covered() || stalled) return;
    const active = interacting || camMoving || tweens.length > 0 || now < shakeUntil || now < activeUntil;
    if (!active && !dirty) return;
    dirty = false; lastRender = now; framesRendered++;
    if (active && rawDt > 0 && rawDt < 1000) { fpsBuf.push(rawDt); if (fpsBuf.length > 240) fpsBuf.shift(); govern(rawDt, now); }
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; if (!tw) continue; const p = Math.min(1, (now - tw.t0) / tw.dur);
      try { tw.fn(p); } catch (e) { console.error(e); }
      if (p >= 1) { tweens.splice(i, 1); clearTimeout(tw.wd); tw.res(); }
    }
    if (active && !reduced) {
      simT += dt;
      if (cfg.updaters) for (const f of updaters) { try { f(simT, dt); } catch (e) { console.error(e); updaters.delete(f); } }
      if (pawn && !hopping) pawn.rotation.y += 0.6 * dt;
      if (pawnRing) pawnRing.rotation.z += dt * 0.8;
    }
    if (pawn && pawnRing) { pawnRing.position.x = pawn.position.x; pawnRing.position.z = pawn.position.z; }
    camStep(dt);
    markStep(now);
    controls.update();
    let off = null;
    if (now < shakeUntil && !reduced) {
      const k = (shakeUntil - now) / shakeDur;
      off = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(shakeAmp * k);
      camera.position.add(off);
    }
    renderer.render(scene, camera);
    if (off) camera.position.sub(off);
    if (!flatChecked && framesRendered % 30 === 1) setTimeout(checkFlatShader, 1500);
  };
  renderer.setAnimationLoop(loopFn);
  // T5 §8.4: no frames at all while the page is hidden (combines with setPaused, the lobby pause)
  onVis = () => { const h = document.visibilityState === 'hidden'; if (h === pageHidden) return; pageHidden = h; if (h) renderer.setAnimationLoop(null); else { last = performance.now(); renderer.setAnimationLoop(loopFn); wake(800); invalidate(); } };
  document.addEventListener('visibilitychange', onVis);
  onVis();
  initPick(canvas);
  // back online: retry the dice GLBs, the life prefetch and every stand-in still in the city (m-9)
  onOnline = () => { diceReq = false; lifePrefetch = false; for (const [k, it] of city) if (it.obj.userData.fallbackOf) swapWhenReady(k, it.model); };
  addEventListener('online', onOnline);
  try { const l = document.getElementById('loading'); if (l) { const mo = new MutationObserver(() => { canvasVis(); if (!covered()) { invalidate(); wake(800); } }); mo.observe(l, { attributes: true, attributeFilter: ['hidden'] }); onPtr.push([{ removeEventListener() { mo.disconnect(); } }, '', null]); } } catch (e) { /* ignore */ }
  if (/[?&]perf=1\b/.test(location.search)) perfOverlay();
}

/* ---------- render on demand */
// starts paused: game.js unpauses when the board is on screen (no frame — and no synchronous GPU readback — behind the lobby)
let activeUntil = 0, lastRender = 0, dirty = true, paused = true, interacting = false, simT = 0;
/** Keep animating (decor, idle pawn spin) for `ms` more milliseconds. */
export function wake(ms = 4000) { activeUntil = Math.max(activeUntil, performance.now() + ms); }
/** Render one frame at the next tick even when idle or paused (geometry changed, canvas resized…). */
export function invalidate() { dirty = true; }
/** Pause all rendering (e.g. while the lobby covers the board). Tweens resume (and jump to their end) when unpaused. */
export function setPaused(b) { paused = !!b; canvasVis(); if (!paused) { wake(); invalidate(); } }
/** While paused (the lobby covers the board) the canvas is not painted at all: on software compositing every painted WebGL
 * canvas is read back at each commit, which blocks the main thread until the GPU process has finished ALL queued work
 * (shader compiles, PMREM, uploads) — the 8–20 s "boot freeze" behind the lobby (T5 part B notes, CR-19a). */
function canvasVis() { try { if (renderer) renderer.domElement.style.visibility = paused || covered() ? 'hidden' : ''; } catch (e) { /* ignore */ } }
/** the T1 loading overlay (#loading) covers the board: no frames under it either, so its progress keeps updating */
let loadingEl = null;
function covered() { if (!loadingEl) loadingEl = document.getElementById('loading'); return !!(loadingEl && !loadingEl.hidden && loadingEl.isConnected); }
export const isPaused = () => paused;

let skipUntil = 0;
const AWAITED = new Set(['hop', 'dice', 'celebrate']);
function tween(dur, fn, tag = null) {
  if (AWAITED.has(tag)) turnMs += Math.max(1, dur);
  // T5 §4.3 skip(): a tap during the turn animation finishes the awaited tweens that start right after it, too
  if (AWAITED.has(tag) && performance.now() < skipUntil) { try { fn(1); } catch (e) { console.error(e); } invalidate(); return Promise.resolve(); }
  wake(dur + 1500);
  return new Promise((res) => { const tw = { t0: performance.now(), dur: Math.max(1, dur), fn, res, tag, wd: 0 }; tweens.push(tw); armWatch(tw); });
}
/* ---------- wave 1 (B1 G10 / A2 G-08): animation watchdog. A tween normally finishes inside the render loop on wall-clock time.
 * If the loop stalls (no frames while the page is visible and not paused), the tween is finished at its end state by a timer at
 * dur + WATCH_MARGIN_MS. While the page is hidden / paused under the lobby / covered by the loading overlay the watchdog waits
 * and re-arms (the loop finishes the tween on its first frame back). It only ends an animation early: outcomes never change. */
export const WATCH_MARGIN_MS = 1500;
let stalled = false, watchFired = 0;
function armWatch(tw, ms = tw.dur + WATCH_MARGIN_MS) { clearTimeout(tw.wd); tw.wd = setTimeout(() => watchTween(tw), ms); }
function watchTween(tw) {
  const i = tweens.indexOf(tw); if (i < 0) return;
  if (pageHidden || paused || covered()) { armWatch(tw, 1000); return; }
  tweens.splice(i, 1); watchFired++;
  try { tw.fn(1); } catch (e) { console.error(e); }
  tw.res(); invalidate();
}
/** test hook (outside SCENE_API): simulate a stalled render loop (frames stop while the page stays visible). */
export function debugStall(on) { stalled = !!on; if (!stalled) { invalidate(); wake(800); } return { stalled, watchFired }; }
/** T5 §4.3: resolve every running tween at its end state (a tap on the board during dice/hops). */
export function skip() {
  try {
    skipUntil = performance.now() + 400;
    for (const tw of tweens.splice(0)) { clearTimeout(tw.wd); try { tw.fn(1); } catch (e) { console.error(e); } tw.res(); }
    invalidate();
  } catch (e) { console.warn(e); }
}
/** T5 §7.2: reduced motion in 3D (no shake, confetti, particles, camera moves; dice and pawn snap). */
export function setMotion(r) {
  reduced = !!r;
  try { if (controls) controls.enableDamping = !reduced; } catch (e) { /* ignore */ }
  invalidate();
}
export const getMotion = () => reduced;
/** Finish (resolve) and drop running tweens with a tag without applying their last frame. */
function cancelTweens(tag) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].tag === tag) { const tw = tweens[i]; tweens.splice(i, 1); clearTimeout(tw.wd); tw.res(); } }
const easeOutBack = (p) => { const c = 1.7; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
function easeOutBounce(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/* ============================================================ camera framing */
/** rect = the free screen area (CSS px) between HUD, sheet and bottom bar; the board is fitted and centred inside it. */
export function frame(rect) {
  if (rect) viewRect = rect;
  resize(); invalidate();
}
// key points that must stay on screen: the board slab and the corner landmarks
const FIT = [];
for (const x of [-11.1, 11.1]) for (const z of [-11.1, 11.1]) FIT.push(new THREE.Vector3(x, -0.72, z), new THREE.Vector3(x * 0.9, 2.9, z * 0.9));
// camera modes: 'follow' (close, tracks the pawn / dice) and 'overview' (the whole board fitted in the free area)
let camMode = 'follow';
const camGoal = { target: new THREE.Vector3(0, 0.3, 0), dist: 30, dir: new THREE.Vector3(0, 1, 1).normalize() };
let overviewDist = 30, followDist = 20, followOff = { x: 0, y: 0 }, overviewOff = { x: 0, y: 0 }, camAnimUntil = 0;
const focus = new THREE.Vector3();
export function getCameraMode() { return camMode; }
/** Debug/perf: draw calls, triangles and object counts of the last frame. */
export function renderStats() { let objs = 0, meshes = 0; scene.traverse((o) => { objs++; if (o.isMesh) meshes++; }); const r = renderer.info.render; return { calls: r.calls, triangles: r.triangles, objs, meshes, city: cityGroup.children.length, world: worldGroup.children.length, fx: fxGroup.children.length, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, px: [renderer.domElement.width, renderer.domElement.height], dpr: renderer.getPixelRatio(), shadows: renderer.shadowMap.enabled }; }
export function cameraState() {
  const off = camera.position.clone().sub(controls.target);
  return { mode: camMode, target: controls.target.toArray().map((x) => +x.toFixed(2)), pos: camera.position.toArray().map((x) => +x.toFixed(2)), focus: focus.toArray(), followDist, overviewDist, goal: camGoal.target.toArray(),
    az: +Math.atan2(off.x, off.z).toFixed(3), az0: +Math.atan2(camGoal.dir.x, camGoal.dir.z).toFixed(3), user: !!userDir, zoom: userZoom, moving: camMoving, homing, interacting, azRange: [+controls.minAzimuthAngle.toFixed(3), +controls.maxAzimuthAngle.toFixed(3)] };
}
/** 'follow' | 'overview' — smooth transition. */
export function setCameraMode(m) { camMode = m === 'overview' ? 'overview' : 'follow'; applyCamGoal(true); }
/** Point the follow camera at a world position (pawn, dice landing…). */
export function focusOn(v) { if (v) focus.copy(v); if (camMode === 'follow') applyCamGoal(false); }
function applyCamGoal(transition) {
  if (camMode === 'overview') { camGoal.target.set(0, 0.3, 0); camGoal.dist = overviewDist; }
  else { camGoal.target.set(focus.x, 0.3, focus.z); camGoal.dist = followDist; }
  camAnimUntil = performance.now() + (transition ? 900 : 700); camMoving = true; wake(1200);
}
/** Per-frame smoothing toward the goal; keeps the user's orbit angle, eases distance/target. */
function camStep(dt) {
  if (celebrating || interacting || !camMoving) return;
  const k = reduced ? 1 : 1 - Math.exp(-dt * 5.5); // reduced motion: follow/overview switches snap
  const off = camera.position.clone().sub(controls.target);
  const len = off.length(); const dir = len > 1e-3 ? off.divideScalar(len) : camGoal.dir.clone();
  // wave 1 (G7): a user's orbit is kept (no drift back) until "מבט ראשי"; without one, drift toward the default angle a
  // little; "מבט ראשי" itself (homing) eases all the way back
  const goalDir = userDir || camGoal.dir;
  dir.lerp(goalDir, homing ? (reduced ? 1 : k) : userDir ? 0 : reduced ? 0.35 : k * 0.35).normalize();
  controls.target.lerp(camGoal.target, k);
  const gd = goalDist();
  const nl = len + (gd - len) * k;
  camera.position.copy(controls.target).addScaledVector(dir, nl);
  const o = camMode === 'overview' ? overviewOff : followOff;
  const vo = camera.view; if (vo) { vo.offsetX += (o.x - vo.offsetX) * k; vo.offsetY += (o.y - vo.offsetY) * k; camera.updateProjectionMatrix(); }
  // keep animating until we are there (low frame rates must still converge)
  if (controls.target.distanceTo(camGoal.target) < 0.03 && Math.abs(nl - gd) < 0.05 && (!vo || (Math.abs(vo.offsetX - o.x) < 0.5 && Math.abs(vo.offsetY - o.y) < 0.5))
    && (!homing || dir.angleTo(goalDir) < 0.003)) { camMoving = false; homing = false; }
}
/* ---------- wave 1 (B1 G7): the user's orbit survives resizes, HUD height changes and placePawn; "מבט ראשי" resets it */
let userDir = null, userZoom = null, orbitMoved = false, homing = false;
const AZ_RANGE = Math.PI / 3;              // ±60° around the default azimuth: the tile labels always stay readable
const goalDist = () => { const d = camGoal.dist * (userZoom || 1); return Math.min(controls.maxDistance, Math.max(controls.minDistance, d)); };
function keepUserOrbit() {
  const off = camera.position.clone().sub(controls.target); const len = off.length(); if (len < 1e-3) return;
  userDir = off.divideScalar(len);
  userZoom = Math.min(2.5, Math.max(0.35, len / Math.max(1e-3, camGoal.dist)));
}
/** "מבט ראשי": back to the starting view — follow camera, default angle and distance (smooth; snaps with reduced motion). */
export function homeView() {
  try {
    if (!controls) return;
    userDir = null; userZoom = null; camMode = 'follow'; celebrating = false; controls.enabled = true;
    if (reduced) { resize(); invalidate(); return; }
    homing = true; applyCamGoal(true);
  } catch (e) { console.warn('[scene] homeView', e); }
}
/** test hook (outside SCENE_API): orbit like a user drag by `rad` around the vertical axis, then keep it as the user's orbit. */
export function debugOrbit(rad = 0.5) {
  const off = camera.position.clone().sub(controls.target).applyAxisAngle(new THREE.Vector3(0, 1, 0), rad);
  camera.position.copy(controls.target).add(off); controls.update(); keepUserOrbit(); invalidate(); return cameraState();
}
let camMoving = false;
let camDist = 30;
function resize() {
  if (!renderer) return;
  const W = innerWidth, H = innerHeight;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  const r = viewRect || { x0: 0, y0: 0, x1: W, y1: H };
  const fw = Math.max(120, r.x1 - r.x0), fh = Math.max(120, r.y1 - r.y0);
  const portrait = fw / fh < 0.95;
  const dir = (portrait ? new THREE.Vector3(0, 0.84, 0.55) : new THREE.Vector3(0.07, 0.66, 0.75)).normalize();
  const tgt = new THREE.Vector3(0, 0.3, 0);
  const m = Math.min(24, Math.max(6, Math.min(fw, fh) * 0.035));
  let offX = W / 2 - (r.x0 + r.x1) / 2, offY = H / 2 - (r.y0 + r.y1) / 2;
  const v = new THREE.Vector3();
  const bbox = (d) => {
    camera.setViewOffset(W, H, offX, offY, W, H); camera.updateProjectionMatrix();
    camera.position.copy(tgt).addScaledVector(dir, d); camera.lookAt(tgt); camera.updateMatrixWorld();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of FIT) { v.copy(p).project(camera); const sx = ((v.x + 1) / 2) * W, sy = ((1 - v.y) / 2) * H; x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy); }
    return { x0, y0, x1, y1 };
  };
  let dist = 40;
  for (let pass = 0; pass < 3; pass++) {
    let lo = 8, hi = 260;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2; const b = bbox(mid);
      const fits = (b.x1 - b.x0) <= fw - 2 * m && (b.y1 - b.y0) <= fh - 2 * m;
      if (fits) hi = mid; else lo = mid;
    }
    dist = hi;
    const b = bbox(dist);
    offX += (b.x0 + b.x1) / 2 - (r.x0 + r.x1) / 2; offY += (b.y0 + b.y1) / 2 - (r.y0 + r.y1) / 2;
  }
  camDist = dist; overviewDist = dist; overviewOff = { x: offX, y: offY };
  followOff = { x: W / 2 - (r.x0 + r.x1) / 2, y: H / 2 - (r.y0 + r.y1) / 2 };
  // follow distance: close enough that ~5–7 tiles fill the free area (the board feels huge); never beyond the overview
  const portraitF = fw / fh < 0.95;
  const wantAcross = (portraitF ? 6.2 : 7.5) * SZ;
  followDist = Math.min(dist * 0.8, Math.max(12, wantAcross / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * (fw / fh))));
  camGoal.dir.copy(dir);
  const o = camMode === 'overview' ? overviewOff : followOff;
  camera.setViewOffset(W, H, o.x, o.y, W, H); camera.updateProjectionMatrix();
  const goalT = camMode === 'overview' ? tgt : new THREE.Vector3(focus.x, 0.3, focus.z);
  const goalD = camMode === 'overview' ? dist : followDist;
  camGoal.target.copy(goalT); camGoal.dist = goalD;
  controls.target.copy(goalT);
  controls.maxDistance = Math.max(40, dist * 1.7);
  controls.minDistance = Math.min(7, dist * 0.35);
  const az0 = Math.atan2(dir.x, dir.z); controls.minAzimuthAngle = az0 - AZ_RANGE; controls.maxAzimuthAngle = az0 + AZ_RANGE;
  // a resize (window, HUD / bar height, placePawn in follow mode) keeps the user's orbit and zoom instead of snapping back
  if (!celebrating) camera.position.copy(goalT).addScaledVector(userDir || dir, userDir ? goalDist() : goalD);
  if (scene.fog) { scene.fog.near = dist * 1.25; scene.fog.far = dist * 3.6; }
  controls.update();
}
let celebrating = false;
export function resetCamera() { celebrating = false; controls.enabled = true; userDir = null; userZoom = null; homing = false; resize(); }

/* ============================================================ models */
export const modelUrl = (dir, name) => `assets/${dir}/${name}.glb`;
/** the asset folder of a world: history mode ('h') re-uses world 1's city models */
const assetDir = (w) => (w && (w.assetDir || (w.id === 'h' || w.mechanic === 'history' ? 'w1' : w.id)));
const nameOf = (url) => String(url).replace(/^assets\//, '').replace(/\.glb$/, '');
/** a world's model name → URL ('dir/name' names keep their own folder, e.g. 'history/time_machine') */
const urlFor = (w, n) => (String(n).includes('/') ? `assets/${n}.glb` : modelUrl(assetDir(w), n));
/** dispose every geometry/material/texture under `root` that `keepShared` does not use (T5 §8.4, CR-17) */
function disposeTree(root, { keepShared = null } = {}) {
  const keep = new Set();
  if (keepShared) keepShared.traverse((o) => { if (o.geometry) keep.add(o.geometry); for (const m of [].concat(o.material || [])) keep.add(m); });
  root.traverse((o) => {
    if (o.isInstancedMesh) { try { o.dispose(); } catch (e) { /* ignore */ } }
    if (o.geometry && !keep.has(o.geometry)) o.geometry.dispose();
    for (const m of [].concat(o.material || [])) {
      if (!m || keep.has(m) || isSharedFlat(m)) continue;
      for (const k of ['map', 'emissiveMap', 'normalMap', 'roughnessMap', 'metalnessMap', 'alphaMap', 'aoMap']) if (m[k]) m[k].dispose();
      m.dispose();
    }
  });
}
function loadGLB(url) {
  if (!cache.has(url)) {
    // T1: every GLB has its own timeout; a rejection is dropped from the cache (deferred one tick, so callers that retry
    // in the same chain reuse it) and the next start requests it again. A late success still fills `ready`.
    let timer = 0;
    const timeout = new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('glb_timeout ' + url)), GLB_TIMEOUT_MS); });
    const p = Promise.race([loader.loadAsync(url).then((g) => {
      // T5 §8.3: merge the per-material primitives (6–17 draw calls per model → 1–3); ?flat=0 keeps the original
      const s = flatEnabled() ? flattenModel(g.scene) : g.scene;
      if (s !== g.scene) disposeTree(g.scene, { keepShared: s });
      s.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = !(o.material && o.material.transparent) && cfg.casters !== 'none';
          o.receiveShadow = true;
        }
      });
      if (cache.get(url) !== p) { disposeTree(s); return s; } // its world was released while it loaded (m-4)
      ready.set(url, s);
      failed.delete(nameOf(url));
      return s;
    }), timeout]).finally(() => clearTimeout(timer));
    p.catch(() => { failed.add(nameOf(url)); setTimeout(() => { if (cache.get(url) === p) cache.delete(url); }, 0); });
    cache.set(url, p);
  }
  return cache.get(url);
}
/** T1: names (dir/name) of models whose GLB failed or timed out on this page and have not loaded since. */
export function failedModels() { return [...failed]; }
/** T1: stop rendering and release WebGL (switch to מצב קל). Re-initialising three in the same page is not supported. */
export function dispose() {
  try { if (renderer) renderer.setAnimationLoop(null); } catch (e) { /* ignore */ }
  try { for (const tw of tweens) clearTimeout(tw.wd); } catch (e) { /* ignore */ }
  try { if (onResize) removeEventListener('resize', onResize); onResize = null; } catch (e) { /* ignore */ }
  try { if (onVis) document.removeEventListener('visibilitychange', onVis); onVis = null; } catch (e) { /* ignore */ }
  try { for (const [el, ev, f] of onPtr) el.removeEventListener(ev, f); onPtr = []; } catch (e) { /* ignore */ }
  try { clearInterval(perfTimer); if (perfEl) perfEl.remove(); perfEl = null; } catch (e) { /* ignore */ }
  try { clearCity(); clearWorld(); if (kit) kit.dispose(); kit = null; } catch (e) { /* ignore */ }
  try { for (const g of ready.values()) disposeTree(g); ready.clear(); cache.clear(); } catch (e) { /* ignore */ }
  try { for (const un of offBus) un(); offBus = []; if (onOnline) removeEventListener('online', onOnline); onOnline = null; } catch (e) { /* ignore */ }
  try { if (renderer) renderer.forceContextLoss(); } catch (e) { /* ignore */ } // the 2D board must not keep a live WebGL context (m-2)
  pickCbs.clear(); tileCbs.clear();
  try { if (controls) controls.dispose(); } catch (e) { /* ignore */ }
  try { if (renderer) renderer.dispose(); } catch (e) { /* ignore */ }
  ctxCbs = [];
}
/** T1: cb('lost' | 'restored') on WebGL context loss / restore. */
export function onContextLost(cb) { if (typeof cb === 'function') ctxCbs.push(cb); }
/** settle-counting helper: onProgress(done/total, {done,total,failed}) for the files not ready yet */
function track(urls, onProgress) {
  const todo = urls.filter((u) => !ready.has(u));
  let done = 0, bad = 0;
  const report = () => { if (onProgress) { try { onProgress(todo.length ? done / todo.length : 1, { done, total: todo.length, failed: bad }); } catch (e) { console.error(e); } } };
  report();
  return Promise.all(urls.map((u) => {
    const counted = todo.includes(u);
    return loadGLB(u).then((g) => g, (e) => { if (counted) bad++; console.warn('model failed', nameOf(u), e && e.message ? e.message : e); return null; })
      .finally(() => { if (counted) { done++; report(); } });
  }));
}
/** Names of every model a world needs (landmarks, city kinds, holdings, decor). */
export function worldModelNames(w) {
  const set = new Set(landmarkNames(w));
  for (const m of Object.values(w.models || {})) if (m) set.add(m);
  for (const t of Object.values(w.tickers || {})) if (t.model) set.add(t.model);
  const dm = DECOR_MODEL[w.theme.decor]; if (dm) set.add(dm);
  if (w.mechanic === 'history' || w.id === 'h') for (const n of HISTORY_MODELS) set.add('history/' + n); // T5 CR-05: only for h
  return [...set];
}
const DECOR_MODEL = { skyline: 'skyline', sea: 'crane', stars: 'turbine' };
function landmarkNames(w) {
  const list = [];
  for (const m of Object.values(w.models || {})) if (m && !list.includes(m)) list.push(m);
  for (const t of Object.values(w.tickers || {})) if (t.model && !list.includes(t.model)) list.push(t.model);
  return list.slice(0, 4);
}
// Life-model GLBs delivered by the 3D lead (list only files that exist — a missing file would log a 404).
// Others use the procedural stand-ins below.
export const LIFE_MODELS = ['home_family', 'university', 'pension', 'index_fund', 'side_hustle', 'wedding', 'hospital'];
export const HISTORY_MODELS = ['time_machine', 'ticker_board'];
/**
 * T5 CR-05: life models are never in the boot path. preloadLife() requests nothing and resolves at once (game.js keeps
 * calling it); a life model is fetched the first time the city needs it (the procedural stand-in shows meanwhile and is
 * swapped when the GLB arrives), and the rest are prefetched one by one at idle time after the first dice throw.
 * History models belong to the history world's model set (worldModelNames).
 */
export function preloadLife(onProgress) {
  try { if (onProgress) onProgress(1, { done: 0, total: 0, failed: 0 }); } catch (e) { console.error(e); }
  return Promise.resolve([]);
}
let lifePrefetch = false;
function prefetchLifeIdle() {
  if (lifePrefetch) return; lifePrefetch = true;
  const q = LIFE_MODELS.map((n) => modelUrl('life', n)).filter((u) => !ready.has(u));
  const idle = (f) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 4000 }) : setTimeout(f, 300));
  const next = () => { const u = q.shift(); if (!u) return; loadGLB(u).catch(() => null).finally(() => idle(next)); };
  idle(next);
}
const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
const shadowAll = (g) => { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; };
const LIFE_FALLBACK = {
  home_family() { return LIFE_FALLBACK.house(); },
  index_fund() { return LIFE_FALLBACK.indexfund(); },
  house() {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1, 1.3), mat('#f4e3c3')); b.position.y = 0.5; g.add(b);
    const r = new THREE.Mesh(new THREE.ConeGeometry(1.25, 0.8, 4), mat('#c2553a')); r.position.y = 1.4; r.rotation.y = Math.PI / 4; g.add(r);
    const d = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.5, 0.05), mat('#7a4b2a')); d.position.set(0, 0.25, 0.66); g.add(d);
    const h = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), mat('#ff4f9a', { emissive: '#ff4f9a', emissiveIntensity: 0.6 })); h.position.set(0, 1.95, 0); h.scale.set(1, 0.85, 0.5); g.add(h);
    const lawn = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.95, 0.06, 20), mat('#7dbb4f')); lawn.position.set(0, 0.03, 0); lawn.scale.set(1, 1, 1); g.add(lawn);
    return shadowAll(g);
  },
  university() {
    const g = new THREE.Group(); const stone = mat('#e9e1d0');
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.2, 1.2), stone); base.position.y = 0.1; g.add(base);
    for (let i = 0; i < 4; i++) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.9, 10), stone); c.position.set(-0.6 + i * 0.4, 0.65, 0.4); g.add(c); }
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.7), mat('#d9cdb4')); body.position.set(0, 0.65, -0.15); g.add(body);
    const pd = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 1.0, 0.45, 3), stone); pd.rotation.set(0, 0, 0); pd.position.set(0, 1.32, 0.1); pd.scale.set(1, 1, 0.6); g.add(pd);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.06, 0.6), mat('#1d1a2b')); cap.position.set(0, 1.7, 0.1); cap.rotation.y = Math.PI / 4; g.add(cap);
    return shadowAll(g);
  },
  pension() {
    const g = new THREE.Group();
    const isl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.7, 0.35, 18), mat('#f1d9a0')); isl.position.y = 0.17; g.add(isl);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 0.04, 24), mat('#38bdf8', { roughness: 0.2 })); water.position.y = 0.02; g.add(water);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 1.2, 8), mat('#8b5e34')); trunk.position.set(0.25, 0.9, 0); trunk.rotation.z = 0.2; g.add(trunk);
    for (let i = 0; i < 5; i++) { const l = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.8, 4), mat('#2f9e44')); l.position.set(0.13, 1.5, 0); l.rotation.set(0, (i / 5) * Math.PI * 2, 1.2); l.translateY(0.3); g.add(l); }
    const chest = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.3), mat('#f2b632', { metalness: 0.6, roughness: 0.3 })); chest.position.set(-0.35, 0.48, 0.2); g.add(chest);
    return shadowAll(g);
  },
  indexfund() {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 1.1), mat('#1e3a5f', { roughness: 0.25, metalness: 0.3 })); t.position.y = 1.1; g.add(t);
    [0.35, 0.7, 1.05].forEach((h, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, 0.08), mat('#22c55e', { emissive: '#22c55e', emissiveIntensity: 0.8 })); b.position.set(-0.3 + i * 0.3, 1.0 + h / 2 - 0.5, 0.56); g.add(b); });
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 8), mat('#f2b632', { metalness: 0.6 })); top.position.y = 2.45; g.add(top);
    return shadowAll(g);
  },
};
export function worldLoaded(w) { return worldModelNames(w).every((n) => ready.has(urlFor(w, n))); }
export async function preloadWorld(w, onProgress) {
  const urls = worldModelNames(w).map((n) => urlFor(w, n));
  await track(urls, onProgress);
  return { failed: urls.map(nameOf).filter((n) => failed.has(n)) };
}
function inst(name, dir = assetDir(world)) {
  if (name && name.includes('/')) [dir, name] = name.split('/');
  const g = ready.get(modelUrl(dir, name));
  if (g) return g.clone(true);
  let grp;
  if (dir === 'life' && LIFE_FALLBACK[name]) grp = LIFE_FALLBACK[name]();
  else {
    // placeholder so a missing model never breaks the game
    grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), new THREE.MeshStandardMaterial({ color: (theme && theme.accent) || '#f2b632', roughness: 0.6 }));
    m.position.y = 0.7; m.castShadow = cfg.casters !== 'none'; grp.add(m);
  }
  grp.userData.ownTree = true; grp.userData.fallbackOf = modelUrl(dir, name); // own geometry: disposed when removed (CR-17)
  return grp;
}
/** remove a city/fx object and free what only it owns */
function dropObj(o, parent = cityGroup) { if (!o) return; parent.remove(o); if (o.userData.ownTree) disposeTree(o); else o.traverse((x) => { if (x.userData.ownMat && x.material) x.material.dispose(); }); }

/* ============================================================ board geometry */
const SZ = 2.25;
let boardN = 24;
// board geometry derived from the tile count (24 → 7×7 ring, 40 → 11×11 ring). K scales everything around the ring.
let HB = 11, CS = 10.6, K = 1;
function setBoardSize(n) {
  boardN = n; const side = n / 4; const ringR = (side / 2) * SZ;
  HB = ringR + 4.25; CS = (side - 1) * SZ - 0.65; K = HB / 11;
  FIT.length = 0;
  for (const x of [-HB - 0.1, HB + 0.1]) for (const z of [-HB - 0.1, HB + 0.1]) FIT.push(new THREE.Vector3(x, -0.72, z), new THREE.Vector3(x * 0.9, 2.9, z * 0.9));
}
export function tilePos(i) {
  const n = boardN, side = n / 4;
  i = ((i % n) + n) % n;
  let gx, gz;
  if (i <= side) { gx = side - i; gz = side; } else if (i <= 2 * side) { gx = 0; gz = side - (i - side); } else if (i <= 3 * side) { gx = i - 2 * side; gz = 0; } else { gx = side; gz = i - 3 * side; }
  return new THREE.Vector3((gx - side / 2) * SZ, 0.26, (gz - side / 2) * SZ);
}
// eslint-disable-next-line no-unused-vars -- kept for a future edge-facing (Monopoly-style) option
function tileRot(i) { const side = boardN / 4; return i < side ? 0 : i < 2 * side ? -Math.PI / 2 : i < 3 * side ? Math.PI : Math.PI / 2; }

/* ============================================================ canvas textures */
function canvasTex(cv, { repeat = null, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  disposables.push(t);
  return t;
}
const mkCanvas = (w, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
function lum(hex) { const c = new THREE.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }
function shade(hex, k) { const c = new THREE.Color(hex); if (k >= 0) c.lerp(new THREE.Color('#ffffff'), k); else c.lerp(new THREE.Color('#000000'), -k); return '#' + c.getHexString(); }

function drawIcon(g, icon, x, y, c) {
  g.save(); g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const P = () => g.beginPath();
  switch (icon) {
    case 'coin': P(); g.arc(x, y, 42, 0, 7); g.stroke(); g.font = '800 50px Rubik'; g.fillText('₪', x, y + 3); break;
    case 'trend': P(); g.moveTo(x - 46, y + 34); g.lineTo(x - 14, y + 2); g.lineTo(x + 8, y + 22); g.lineTo(x + 44, y - 26); g.stroke(); P(); g.moveTo(x + 44, y - 26); g.lineTo(x + 16, y - 26); g.moveTo(x + 44, y - 26); g.lineTo(x + 44, y + 2); g.stroke(); break;
    case 'bag': P(); g.roundRect(x - 36, y - 20, 72, 62, 8); g.stroke(); P(); g.arc(x, y - 20, 20, Math.PI, 0); g.stroke(); break;
    case 'bars': [[-34, -10, 30], [-6, -30, 50], [22, -4, 24]].forEach(([dx, dy, h]) => { g.fillRect(x + dx, y + dy, 18, h); g.fillRect(x + dx + 7, y + dy - 12, 4, h + 24); }); break;
    case 'question': g.font = '800 96px Rubik'; g.fillText('?', x, y + 6); P(); g.arc(x, y, 46, 0, 7); g.lineWidth = 7; g.stroke(); break;
    case 'bank': P(); g.moveTo(x - 46, y - 14); g.lineTo(x, y - 44); g.lineTo(x + 46, y - 14); g.closePath(); g.fill(); [-30, -6, 18].forEach((dx) => g.fillRect(x + dx, y - 6, 12, 36)); g.fillRect(x - 46, y + 34, 92, 10); break;
    case 'hammer': g.save(); g.translate(x, y); g.rotate(-Math.PI / 4); g.fillRect(-6, -14, 12, 64); g.fillRect(-30, -38, 60, 24); g.restore(); break;
    case 'dollar': P(); g.arc(x, y, 42, 0, 7); g.stroke(); g.font = '800 58px Rubik'; g.fillText('$', x, y + 4); break;
    case 'ship': P(); g.moveTo(x - 50, y + 4); g.lineTo(x + 50, y + 4); g.lineTo(x + 34, y + 30); g.lineTo(x - 34, y + 30); g.closePath(); g.fill(); g.fillRect(x - 24, y - 24, 30, 24); g.fillRect(x + 12, y - 14, 18, 14); g.lineWidth = 6; P(); g.moveTo(x - 52, y + 44); g.quadraticCurveTo(x - 26, y + 34, x, y + 44); g.quadraticCurveTo(x + 26, y + 54, x + 52, y + 44); g.stroke(); break;
    case 'rocket': P(); g.moveTo(x, y - 50); g.quadraticCurveTo(x + 26, y - 20, x + 18, y + 26); g.lineTo(x - 18, y + 26); g.quadraticCurveTo(x - 26, y - 20, x, y - 50); g.fill(); P(); g.moveTo(x - 18, y + 4); g.lineTo(x - 34, y + 34); g.lineTo(x - 16, y + 26); g.fill(); P(); g.moveTo(x + 18, y + 4); g.lineTo(x + 34, y + 34); g.lineTo(x + 16, y + 26); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; P(); g.arc(x, y - 14, 9, 0, 7); g.fill(); g.restore(); P(); g.moveTo(x - 9, y + 32); g.lineTo(x, y + 50); g.lineTo(x + 9, y + 32); g.fill(); break;
    case 'heart': P(); g.moveTo(x, y + 40); g.bezierCurveTo(x - 60, y, x - 40, y - 50, x, y - 22); g.bezierCurveTo(x + 40, y - 50, x + 60, y, x, y + 40); g.fill(); break;
    case 'life': case 'family': // house with a heart
      P(); g.moveTo(x - 44, y - 2); g.lineTo(x, y - 44); g.lineTo(x + 44, y - 2); g.stroke(); g.strokeRect(x - 32, y - 6, 64, 48);
      P(); g.moveTo(x, y + 32); g.bezierCurveTo(x - 26, y + 14, x - 16, y - 6, x, y + 6); g.bezierCurveTo(x + 16, y - 6, x + 26, y + 14, x, y + 32); g.fill(); break;
    case 'edu': case 'school': case 'cap': case 'study': // graduation cap
      P(); g.moveTo(x - 52, y - 8); g.lineTo(x, y - 34); g.lineTo(x + 52, y - 8); g.lineTo(x, y + 18); g.closePath(); g.fill();
      g.fillRect(x - 30, y + 2, 60, 26); g.lineWidth = 6; P(); g.moveTo(x + 40, y - 4); g.lineTo(x + 40, y + 30); g.stroke(); break;
    case 'tax': case 'receipt': // receipt with %
      P(); g.moveTo(x - 32, y - 44); g.lineTo(x + 32, y - 44); g.lineTo(x + 32, y + 42); g.lineTo(x + 20, y + 34); g.lineTo(x + 8, y + 42); g.lineTo(x - 4, y + 34); g.lineTo(x - 16, y + 42); g.lineTo(x - 32, y + 34); g.closePath(); g.stroke();
      g.font = '800 46px Rubik'; g.fillText('%', x, y + 2); break;
    case 'piggy':
      P(); g.ellipse(x, y + 4, 46, 34, 0, 0, 7); g.fill(); g.fillRect(x - 30, y + 28, 12, 18); g.fillRect(x + 18, y + 28, 12, 18);
      P(); g.arc(x + 44, y - 2, 10, 0, 7); g.fill(); g.save(); g.globalCompositeOperation = 'destination-out'; g.fillRect(x - 12, y - 26, 24, 6); P(); g.arc(x + 22, y - 8, 4, 0, 7); g.fill(); g.restore(); break;
    case 'index': case 'fund': case 'pension': case 'chart': // growing bars with a trend
      [[-36, 10, 24], [-12, -6, 40], [12, -22, 56]].forEach(([dx, dy, h]) => g.fillRect(x + dx, y + dy + 6, 18, h)); g.lineWidth = 7;
      P(); g.moveTo(x - 46, y - 2); g.lineTo(x - 10, y - 26); g.lineTo(x + 10, y - 14); g.lineTo(x + 46, y - 44); g.stroke(); break;
    case 'shop': case 'store': case 'business': // storefront: scalloped awning, window, door
      g.lineWidth = 7; g.strokeRect(x - 40, y - 4, 80, 48);
      P(); g.moveTo(x - 50, y - 36); g.lineTo(x + 50, y - 36); g.lineTo(x + 50, y - 14); g.lineTo(x - 50, y - 14); g.closePath(); g.fill();
      for (let k = 0; k < 5; k++) { P(); g.arc(x - 40 + k * 20, y - 14, 10, 0, Math.PI); g.fill(); }
      g.fillRect(x - 32, y + 8, 30, 20); g.fillRect(x + 10, y + 8, 20, 36); break;
    case 'news': case 'newspaper':
      g.strokeRect(x - 44, y - 34, 88, 68); g.fillRect(x - 34, y - 24, 68, 12); [0, 14, 28].forEach((d) => g.fillRect(x - 34, y - 4 + d, 30, 6)); g.fillRect(x + 4, y - 4, 30, 34); break;
    case 'x': P(); g.moveTo(x - 34, y - 34); g.lineTo(x + 34, y + 34); g.moveTo(x + 34, y - 34); g.lineTo(x - 34, y + 34); g.stroke(); break;
    default: P(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 18 : 42; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); g.fill();
  }
  g.restore();
}

function tileTexture(tile, frame) {
  const cv = mkCanvas(256), g = cv.getContext('2d');
  g.fillStyle = frame; g.fillRect(0, 0, 256, 256);
  g.fillStyle = tile.color; g.beginPath(); g.roundRect(12, 12, 232, 232, 28); g.fill();
  const gr = g.createLinearGradient(0, 12, 0, 244); gr.addColorStop(0, 'rgba(255,255,255,.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,.08)');
  g.fillStyle = gr; g.beginPath(); g.roundRect(12, 12, 232, 232, 28); g.fill();
  drawIcon(g, tile.icon, 128, 94, tile.ink || '#fff');
  g.fillStyle = tile.ink || '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  const name = tileText(tile).short || ''; // wave 1 (G5): the short render-side name, never cut
  let fs = 38; g.font = `800 ${fs}px Rubik`;
  const words = name.split(' ');
  if (g.measureText(name).width > 214 && words.length > 1) {
    let a = words[0], b = words.slice(1).join(' ');
    if (words.length > 2 && g.measureText(words.slice(0, 2).join(' ')).width < 214) { a = words.slice(0, 2).join(' '); b = words.slice(2).join(' '); }
    while ((g.measureText(a).width > 220 || g.measureText(b).width > 220) && fs > 24) { fs -= 2; g.font = `800 ${fs}px Rubik`; }
    g.fillText(a, 128, 170); g.fillText(b, 128, 210);
  } else {
    while (g.measureText(name).width > 222 && fs > 22) { fs -= 2; g.font = `800 ${fs}px Rubik`; }
    g.fillText(name, 128, 190);
  }
  return canvasTex(cv);
}

const CAPTION = { w1: 'התיק שלך', w2: 'העיר שלך', w3: 'הנמל שלך', w4: 'העמק שלך' };
/** wave 1 (B1 G8): the empty-city text and the per-world look of an empty lot (render-side, no rules) */
export const EMPTY_CAPTION = 'כאן יקומו הנכסים שלך';
const LOT = { trees: ['#d9e7b4', '#9bbf6a'], skyline: ['#454c5e', '#ffd166'], sea: ['#ead6a6', '#a8805a'], stars: ['#eef4ff', '#22d3ee'], history: ['#e6d6b0', '#8a6a40'] };
let emptyShown = true, emptyGroup = null;
function drawCenter(n) {
  if (!centerMat || !theme) return;
  const cv = mkCanvas(1024), g = cv.getContext('2d');
  const dark = lum(theme.center) < 0.35;
  g.fillStyle = theme.center; g.fillRect(0, 0, 1024, 1024);
  // soft vignette
  const rg = g.createRadialGradient(512, 512, 120, 512, 512, 720); rg.addColorStop(0, dark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.25)'); rg.addColorStop(1, 'rgba(0,0,0,.06)');
  g.fillStyle = rg; g.fillRect(0, 0, 1024, 1024);
  const cell = 984 / n;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  if (emptyShown) {
    // an intended empty state: building lots (not plinths), the first one where the first asset will rise glows softly
    const [lot, edge] = LOT[theme.decor] || LOT.trees;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = 20 + c * cell + 12, y = 20 + r * cell + 12, s = cell - 24;
      g.fillStyle = lot; g.globalAlpha = 0.85; g.beginPath(); g.roundRect(x, y, s, s, 18); g.fill(); g.globalAlpha = 1;
      g.strokeStyle = edge; g.lineWidth = 4; g.setLineDash([3, 15]); g.lineCap = 'round'; g.beginPath(); g.roundRect(x + 6, y + 6, s - 12, s - 12, 14); g.stroke(); g.setLineDash([]);
    }
    const x0 = 20 + 12, y0 = 20 + 12, s0 = cell - 24;
    g.save(); g.shadowColor = 'rgba(242,182,50,.9)'; g.shadowBlur = 28; g.strokeStyle = '#f2b632'; g.lineWidth = 9; g.beginPath(); g.roundRect(x0, y0, s0, s0, 18); g.stroke(); g.restore();
    g.fillStyle = dark ? '#fff4d6' : '#7a4a12'; g.font = `800 ${Math.round(cell * 0.22)}px Rubik`; g.fillText('+', x0 + s0 / 2, y0 + s0 / 2);
    // caption on a soft band across the middle
    g.font = '800 70px Rubik'; const tw = g.measureText(EMPTY_CAPTION).width + 80;
    g.fillStyle = dark ? 'rgba(10,14,30,.55)' : 'rgba(255,250,240,.82)'; g.beginPath(); g.roundRect(512 - tw / 2, 512 - 56, tw, 112, 56); g.fill();
    g.fillStyle = dark ? '#f8fafc' : '#5b3a1a'; g.fillText(EMPTY_CAPTION, 512, 516);
  } else {
    g.strokeStyle = dark ? 'rgba(160,190,255,.22)' : shade(theme.center, -0.12); g.lineWidth = 5; g.setLineDash([20, 14]);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g.strokeRect(20 + c * cell + 8, 20 + r * cell + 8, cell - 16, cell - 16);
    g.setLineDash([]);
    g.fillStyle = dark ? 'rgba(200,220,255,.16)' : 'rgba(110,80,40,.2)';
    g.font = '800 92px Rubik';
    g.fillText(CAPTION[world.id] || 'התיק שלך', 512, 512);
  }
  const old = centerMat.map;
  centerMat.map = canvasTex(cv); centerMat.needsUpdate = true;
  if (old) old.dispose();
}

/** three small red-and-white "למכירה" signs on empty lots (shared texture / geometry, freed with the world) */
function buildEmptyLots() {
  const cv = mkCanvas(256, 128), g = cv.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128); g.strokeStyle = '#c0262d'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 118);
  g.fillStyle = '#c0262d'; g.font = '800 58px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText('למכירה', 128, 68);
  const tex = canvasTex(cv);
  const board = std('#ffffff', { map: tex, roughness: 0.6 }), wood = std('#8b5e34', { roughness: 0.9 }), plain = std('#f1f1f1', { roughness: 0.7 });
  const bGeo = new THREE.BoxGeometry(1.1, 0.55, 0.06), pGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6);
  disposables.push(board, wood, plain, bGeo, pGeo);
  emptyGroup = new THREE.Group(); emptyGroup.name = 'city:empty';
  const s = Math.min(1.45, CS / 10.6);
  for (const slot of [3, 12, 15]) {   // clear of the caption band and of slot 0 (the glowing "next" lot)
    const [x, z] = slotXZ(slot, 4); const sg = new THREE.Group();
    const pole = new THREE.Mesh(pGeo, wood); pole.position.y = 0.45; sg.add(pole);
    const b = new THREE.Mesh(bGeo, [plain, plain, plain, plain, board, plain]); b.position.y = 0.95; sg.add(b);
    sg.position.set(x, 0.1, z); sg.scale.setScalar(s); sg.rotation.y = (slot % 2 ? 0.12 : -0.1);
    sg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    emptyGroup.add(sg);
  }
  emptyGroup.visible = emptyShown; worldGroup.add(emptyGroup);
}
/** the city became empty / non-empty: swap the centre between the empty lots and the city grid */
function updateEmpty() {
  const e = city.size === 0; if (e === emptyShown) return;
  emptyShown = e; drawCenter(gridN); if (emptyGroup) emptyGroup.visible = e; invalidate();
}
function plankTexture(base) {
  const cv = mkCanvas(512), g = cv.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 16; i++) {
    const y = i * 32; g.fillStyle = shade(base, (i % 3 - 1) * 0.05); g.fillRect(0, y, 512, 30);
    g.fillStyle = shade(base, -0.25); g.fillRect(0, y + 30, 512, 2);
    const off = (i * 137) % 512; g.fillRect(off, y, 2, 30); g.fillRect((off + 256) % 512, y, 2, 30);
    for (let k = 0; k < 6; k++) { g.fillStyle = 'rgba(90,60,20,.06)'; g.fillRect(Math.random() * 512, y + 4 + Math.random() * 22, 40 + Math.random() * 80, 1.5); }
  }
  return canvasTex(cv, { repeat: 3 });
}
function gridTexture(line, bg) {
  const cv = mkCanvas(256), g = cv.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = line; g.lineWidth = 3; g.strokeRect(0, 0, 256, 256);
  g.globalAlpha = 0.4; g.lineWidth = 1.5; g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 256); g.moveTo(0, 128); g.lineTo(256, 128); g.stroke();
  return canvasTex(cv, { repeat: 36 });
}
let softTex = null, starTex = null, heartTex = null;
function soft() {
  if (softTex) return softTex;
  const cv = mkCanvas(64), g = cv.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.5, 'rgba(255,255,255,.5)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  softTex = new THREE.CanvasTexture(cv); return softTex;
}
function star() {
  if (starTex) return starTex;
  const cv = mkCanvas(64), g = cv.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 30); r.addColorStop(0, 'rgba(255,255,230,1)'); r.addColorStop(0.25, 'rgba(255,214,90,.9)'); r.addColorStop(1, 'rgba(255,180,0,0)');
  g.fillStyle = r; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? 6 : 31; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
  g.closePath(); g.fill();
  starTex = new THREE.CanvasTexture(cv); starTex.colorSpace = THREE.SRGBColorSpace; return starTex;
}
function heart() {
  if (heartTex) return heartTex;
  const cv = mkCanvas(64), g = cv.getContext('2d');
  g.fillStyle = '#ff4f9a'; g.beginPath(); g.moveTo(32, 54); g.bezierCurveTo(-4, 30, 8, 2, 32, 18); g.bezierCurveTo(56, 2, 68, 30, 32, 54); g.fill();
  heartTex = new THREE.CanvasTexture(cv); heartTex.colorSpace = THREE.SRGBColorSpace; return heartTex;
}

/* ============================================================ world build */
const LIGHTS = {
  history: { hemi: 1.0, sun: 2.3, exp: 1.0, env: 0.3, sunPos: [14, 18, 6] },
  trees: { hemi: 1.0, sun: 2.5, exp: 1.02, env: 0.32, sunPos: [12, 22, 9] },
  skyline: { hemi: 0.95, sun: 1.8, exp: 1.0, env: 0.32, sunPos: [-13, 19, 10], fill: ['#ff4fd8', 9] },
  sea: { hemi: 1.15, sun: 2.7, exp: 1.04, env: 0.42, sunPos: [10, 24, 12] },
  stars: { hemi: 0.75, sun: 1.5, exp: 1.0, env: 0.36, sunPos: [-8, 20, 10], fill: ['#22d3ee', 10] },
};

function clearWorld() {
  updaters.clear();
  worldGroup.traverse((o) => {
    if (o.isMesh || o.isPoints || o.isSprite) {
      if (o.userData.ownGeo && o.geometry) o.geometry.dispose();
      if (o.userData.ownMat && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      if (o.isInstancedMesh) o.dispose(); // instanceMatrix / instanceColor GL buffers (CR-17: they leaked on every rebuild)
    }
  });
  for (const o of worldGroup.children) if (o.userData.ownTree) disposeTree(o);  // inst() placeholders (m-5)
  worldGroup.clear();
  for (const t of disposables.splice(0)) t.dispose();
  centerMat = null; tileFrames = null; emptyGroup = null;
}
function own(mesh) { mesh.userData.ownGeo = true; mesh.userData.ownMat = true; return mesh; }
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

/** Build the whole board + decor for a world (models must be preloaded). */
let worldDir = null;
/** T5 §8.4: entering a world with another asset folder frees the previous world's models (life/, pawns/, history/ stay). */
function releaseOtherWorlds(dir) {
  if (dir === worldDir) return; worldDir = dir;
  for (const url of new Set([...cache.keys(), ...ready.keys()])) {
    const m = /^assets\/(w[1-4])\//.exec(url); if (!m || m[1] === dir) continue;
    const g = ready.get(url); if (g) disposeTree(g); // still loading → freed when it lands (loadGLB)
    ready.delete(url); cache.delete(url); heightOf.delete(url);
  }
}
export function buildWorld(w) {
  clearWorld(); clearCity(); marks.current = marks.dest = null; if (markObj) placeMarks();
  releaseOtherWorlds(assetDir(w));
  world = w; theme = w.mechanic === 'history' ? HISTORY_THEME(w.theme) : w.theme; setBoardSize(w.board.length);
  const T = theme;
  const L = LIGHTS[T.decor] || LIGHTS.trees;
  scene.fog = new THREE.Fog(T.fog, 42, 130);
  hemi.color.set(T.light.hemiSky); hemi.groundColor.set(T.light.hemiGround); hemi.intensity = L.hemi;
  sun.color.set(T.light.sun); sun.intensity = L.sun; sun.position.set(...L.sunPos);
  renderer.toneMappingExposure = L.exp;
  scene.environmentIntensity = L.env;
  if (L.fill) { fill.color.set(L.fill[0]); fill.intensity = L.fill[1]; } else fill.intensity = 0;

  const dark = lum(T.board) < 0.35;
  const glass = !!T.glass;
  // base + top
  const base = own(new THREE.Mesh(new THREE.BoxGeometry(HB * 2, 0.7, HB * 2), std(T.boardEdge, { roughness: T.planks ? 0.85 : 0.65 })));
  base.position.y = -0.35; base.castShadow = true; base.receiveShadow = true; worldGroup.add(base);
  const topMat = T.planks ? std('#ffffff', { map: plankTexture(T.board), roughness: 0.9 })
    : glass ? std(T.board, { roughness: 0.18, metalness: 0.08 })
    : std(T.board, { roughness: dark ? 0.55 : 0.9 });
  const top = own(new THREE.Mesh(new THREE.BoxGeometry(HB * 2 - 1, 0.1, HB * 2 - 1), topMat));
  top.position.y = 0.05; top.receiveShadow = true; worldGroup.add(top);
  // centre
  centerMat = std('#ffffff', { roughness: glass ? 0.3 : 0.95 });
  const cm = own(new THREE.Mesh(new THREE.PlaneGeometry(CS, CS), centerMat));
  cm.rotation.x = -Math.PI / 2; cm.position.y = 0.102; cm.receiveShadow = true; worldGroup.add(cm);
  drawCenter(gridN);
  // tiles
  const frame = T.planks ? shade(T.board, 0.35) : dark ? shade(T.board, -0.25) : glass ? '#f6f9ff' : shade(T.board, 0.45);
  const tGeo = new THREE.BoxGeometry(2.12, 0.16, 2.12), pGeo = new THREE.PlaneGeometry(2.04, 2.04);
  const tMat = std(frame, { roughness: glass ? 0.25 : 0.85 });
  const emissive = T.neon ? 0.42 : glass ? 0.22 : 0;
  const mats = {};
  disposables.push(tGeo, pGeo, tMat, { dispose() { Object.values(mats).forEach((m) => m.dispose()); } });
  // T5 §8.3.1: tile frames = one InstancedMesh; tile faces = one InstancedMesh per tile type (80 draw calls → ≤ 11)
  const byType = new Map();
  for (let i = 0; i < boardN; i++) { const ch = w.board[i]; if (!byType.has(ch)) byType.set(ch, []); byType.get(ch).push(i); }
  const frames = own(new THREE.InstancedMesh(tGeo, tMat, boardN)); frames.userData.ownGeo = false; frames.userData.ownMat = false; frames.receiveShadow = true; frames.name = 'tiles:frames';
  const d0 = new THREE.Object3D();
  for (let i = 0; i < boardN; i++) { const p = tilePos(i); d0.position.set(p.x, 0.18, p.z); d0.rotation.set(0, 0, 0); d0.updateMatrix(); frames.setMatrixAt(i, d0.matrix); }
  worldGroup.add(frames); tileFrames = frames;
  for (const [ch, list] of byType) {
    const tile = w.tiles[ch];
    const tex = tileTexture(tile, frame);
    mats[ch] = std('#ffffff', { map: tex, roughness: glass ? 0.3 : 0.7, ...(emissive ? { emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: emissive } : {}) });
    const faces = new THREE.InstancedMesh(pGeo, mats[ch], list.length); faces.receiveShadow = true; faces.name = 'tiles:' + ch;
    list.forEach((i, k) => { const p = tilePos(i); d0.position.set(p.x, 0.18 + 0.084, p.z); d0.rotation.set(-Math.PI / 2, 0, 0); d0.updateMatrix(); faces.setMatrixAt(k, d0.matrix); });
    faces.userData.tileIdx = list; worldGroup.add(faces); // labels face the camera (it always looks from the near (+z) side)
  }
  // neon trims (dusk / night worlds)
  if (T.neon || T.aurora) neonTrim(T);
  // landmarks on the four board corners — decoration, so they stand on a square stone pedestal (wave 1, B1 G9): never the round
  // "owned" plinth with the world-coloured rim that the player's own assets get
  const lm = landmarkNames(w); landmarkCount = 0; pedestalCount = 0;
  const stone = std(shade(T.boardEdge, 0.55), { roughness: 0.95 }), stoneTop = std(shade(T.boardEdge, 0.72), { roughness: 0.9 });
  const pedGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(stone, stoneTop, pedGeo);
  [[-1, 1], [-1, -1], [1, -1], [1, 1]].forEach(([sx, sz], k) => {
    const name = lm[k % lm.length]; if (!name) return;
    const x = sx * (HB - 1.7), z = sz * (HB - 1.7), ps = 2.7 * Math.min(1.5, K);
    const ped = new THREE.Group(); ped.name = 'landmark:pedestal'; ped.userData.pedestal = true;
    const b0 = new THREE.Mesh(pedGeo, stone); b0.scale.set(ps, 0.18, ps); b0.position.y = 0.19;
    const b1 = new THREE.Mesh(pedGeo, stoneTop); b1.scale.set(ps * 0.86, 0.12, ps * 0.86); b1.position.y = 0.34;
    for (const b of [b0, b1]) { b.castShadow = true; b.receiveShadow = true; ped.add(b); }
    ped.position.set(x, 0, z); worldGroup.add(ped); pedestalCount++;
    const m = inst(name); m.position.set(x, 0.4, z); m.scale.setScalar(0.88 * Math.min(1.5, K)); m.userData.landmark = true;
    m.lookAt(sx * 3, 0.4, 40);
    worldGroup.add(m); landmarkCount++;
  });
  buildEmptyLots(T);
  // decor
  const before = worldGroup.children.length;
  ({ trees: decorTrees, skyline: decorSkyline, sea: decorSea, stars: decorStars, history: decorHistory }[T.decor] || decorTrees)(T);
  if (K !== 1) spreadDecor(worldGroup.children.slice(before), K);
  for (const o of worldGroup.children.slice(before)) o.userData.decor = true;
  applyCasters();
  kit.setWorld(worldStyle(w), T.center);
  markMeshes().cur.material.color.set(dark ? '#ffffff' : '#2b2540');   // the current-tile outline contrasts with the tile frames
  // history sepia is a full-screen CSS filter (an extra compositing pass): off at the low tier (§3, §8.1)
  try { renderer.domElement.style.filter = (w.mechanic === 'history' && !cfg.sepia) ? 'none' : ''; } catch (e) { /* ignore */ }
  if (w.mechanic === 'history') historyModelsLater(w);
  resize(); invalidate(); wake(1500);
  precompile();
}
/** history GLBs not ready yet (e.g. the start that also waited for init): fetch them now and rebuild the decor when they land */
function historyModelsLater(w) {
  const urls = HISTORY_MODELS.map((n) => modelUrl('history', n)); if (urls.every((u) => ready.has(u))) return;
  Promise.all(urls.map((u) => loadGLB(u).catch(() => null))).then((r) => { if (world === w && r.some(Boolean)) rebuildKeepCity(); });
}
/** T5 freeze fix (CR-19a): compile the world's programs while the lobby still covers the board. With
 * KHR_parallel_shader_compile the GPU process links them in the background (no main-thread wait); the first real frame then
 * finds them ready instead of blocking on every program's link. */
let precompileP = null;
function precompile() {
  if (!paused || precompileP) return;
  try {
    // without the extension (e.g. swiftshader) compile() still queues every compile/link now; the first frame then waits less
    if (!renderer.extensions.has('KHR_parallel_shader_compile')) { renderer.compile(scene, camera); return; }
    precompileP = renderer.compileAsync(scene, camera).catch(() => {}).finally(() => { precompileP = null; });
  } catch (e) { precompileP = null; }
}
/** rebuild the board + decor (quality change, late history models) and put the same city back, silently */
function rebuildKeepCity() {
  if (!world) return;
  const keep = [...city.entries()].sort((a, b) => a[1].slot - b[1].slot).map(([key, it]) => ({ key, model: it.model, level: it.level }));
  buildWorld(world);
  for (const m of keep) spawn(m.key, m.model, { silent: true, level: m.level });
  relayout(false);
}
/** shadow casters per tier: all (city, pawn, landmarks, trees) · main (no decor) · none */
function applyCasters() {
  const on = cfg.casters !== 'none';
  worldGroup.traverse((o) => { if (!o.isMesh) return; if (o.userData.cast0 === undefined) o.userData.cast0 = o.castShadow; const decor = o.userData.decor || (o.parent && o.parent.userData.decor); o.castShadow = o.userData.cast0 && (decor ? cfg.casters === 'all' : on); });
  for (const it of city.values()) it.obj.traverse((o) => { if (o.isMesh) o.castShadow = on && !(o.material && o.material.transparent); });
  if (pawn) pawn.traverse((o) => { if (o.isMesh) o.castShadow = on; });
  if (kit) kit.setShadows(on);
}
function applyTierRenderer() {
  renderer.setPixelRatio(tierDpr(tier, { dpr: devicePixelRatio || 1, coarse, lowPower }));
  const on = cfg.shadows !== 'off';
  renderer.shadowMap.enabled = on; sun.castShadow = on;
  renderer.shadowMap.type = cfg.shadows === 'soft' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const sm = on ? (coarse ? cfg.shadowMap[1] : cfg.shadowMap[0]) : 512;
  if (sun.shadow.mapSize.x !== sm) { sun.shadow.mapSize.set(sm, sm); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
}
/** T5 §8.1: change the tier at run time (DPR, shadows and casters now; decor density by rebuilding the board, city kept). */
export function setQuality(t) {
  try {
    if (!TIER_CONFIG[t] || !renderer) return;
    if (t === tier) return;
    const decorChange = TIER_CONFIG[t].decor !== cfg.decor;
    tier = t; cfg = TIER_CONFIG[t]; if (governor) governor.tier = t; if (kit) kit.setTier(t);
    while (labelPool.length > cfg.labels) { const e = labelPool.pop(); labelGroup.remove(e.sp); e.tx.dispose(); e.sp.material.dispose(); }
    applyTierRenderer(); resize();
    scene.traverse((o) => { if (o.material) for (const m of [].concat(o.material)) m.needsUpdate = true; });
    if (decorChange && world) rebuildKeepCity(); else applyCasters();
    try { document.body.dataset.quality = t; } catch (e) { /* ignore */ }
    invalidate(); wake(600);
  } catch (e) { console.warn('[scene] setQuality', e); }
}
export function getQuality() { return tier; }
/** P1 governor: active-frame deltas → one step down (auto pref only, never up, ≤ 2 per session) + bus 'quality:change'. */
function govern(dt, now) {
  if (!governor) return;
  const t = governor.step(dt, now); if (!t) return;
  setQuality(t);
  try { bus.emit('quality:change', { tier: t, pref: 'auto', auto: true }); } catch (e) { /* ignore */ }
}

/** "מכונת הזמן": sepia newspaper world, whatever the data theme says. */
export const HISTORY_THEME = (t = {}) => ({ ...t, sky: ['#efe2c4', '#c9b089'], fog: '#d8c7a3', board: '#daceb8', boardEdge: '#5b4127', center: '#e6d6b0', accent: '#c8a24a', decor: 'history',
  light: { hemiSky: '#fff1d6', hemiGround: '#6b5236', sun: '#ffe2b0' } });
function decorHistory(T) {
  island(33, std('#d9c7a0', { roughness: 1 }), '#7a5f3e');
  const plaza = own(new THREE.Mesh(new THREE.RingGeometry(11.4, 14.4, 64), std('#c8b48c', { roughness: 1 })));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = -0.7; plaza.receiveShadow = true; worldGroup.add(plaza);
  // an old downtown: sepia blocks with cornices, mostly behind the board
  const pts = scatter(dn(40), 16, 31, { seed: 17, backOnly: false });
  const bodyG = new THREE.BoxGeometry(1.6, 1, 1.6), capG = new THREE.BoxGeometry(1.8, 0.16, 1.8);
  const body = new THREE.InstancedMesh(bodyG, std('#ffffff', { roughness: 0.9 }), pts.length);
  const cap = new THREE.InstancedMesh(capG, std('#6b5236', { roughness: 0.8 }), pts.length);
  const d = new THREE.Object3D(); const tones = ['#cdb48a', '#b99b6e', '#e0cfa9', '#a8875c', '#d6c19b'];
  pts.forEach((p, i) => {
    const front = p.z > 4 && Math.abs(p.x) < 18; const h = front ? 1 + p.k * 1.4 : 2 + p.k * 5;
    d.position.set(p.x, -0.72 + h / 2, p.z); d.rotation.set(0, Math.round(p.a * 2) / 2, 0); d.scale.set(1 + p.k * 0.6, h, 1 + (1 - p.k) * 0.6); d.updateMatrix(); body.setMatrixAt(i, d.matrix); body.setColorAt(i, new THREE.Color(tones[i % tones.length]));
    d.position.y = -0.72 + h + 0.08; d.scale.set(1 + p.k * 0.6, 1, 1 + (1 - p.k) * 0.6); d.updateMatrix(); cap.setMatrixAt(i, d.matrix);
  });
  [body, cap].forEach((m) => { m.castShadow = true; m.receiveShadow = true; own(m); worldGroup.add(m); });
  // the time machine: a clock tower behind the board (assets/history/clocktower.glb if the 3D lead delivered one)
  const tower = new THREE.Group(); tower.position.set(0, -0.72, -20);
  const glb = ready.get(modelUrl('history', 'time_machine'));
  if (glb) { const m = glb.clone(true); m.scale.setScalar(5.5); tower.add(m); tower.position.z = -18.5;
    const tb = ready.get(modelUrl('history', 'ticker_board'));
    if (tb) [[-11, -15, 0.5], [11, -15, -0.5]].forEach(([x, z, r]) => { const b = tb.clone(true); b.scale.setScalar(3.2); b.position.set(x, -0.72, z); b.rotation.y = r; worldGroup.add(b); });
  }
  else {
    const st0 = std('#a8875c', { roughness: 0.85 }), st1 = std('#7a5f3e', { roughness: 0.8 });
    const b0 = new THREE.Mesh(new THREE.BoxGeometry(4, 9, 4), st0); b0.position.y = 4.5; b0.castShadow = true; tower.add(b0);
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.4, 3.2), st0); b1.position.y = 10.7; tower.add(b1);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.2, 4), st1); roof.position.y = 14; roof.rotation.y = Math.PI / 4; tower.add(roof);
    const cv = mkCanvas(256), g = cv.getContext('2d');
    g.fillStyle = '#f4ead2'; g.beginPath(); g.arc(128, 128, 120, 0, 7); g.fill(); g.strokeStyle = '#3b2a17'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#3b2a17'; for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.fillRect(128 + Math.sin(a) * 96 - 5, 128 - Math.cos(a) * 96 - 5, 10, 10); }
    const face = new THREE.Mesh(new THREE.CircleGeometry(1.3, 40), new THREE.MeshStandardMaterial({ map: canvasTex(cv), roughness: 0.6 }));
    face.position.set(0, 10.8, 1.62); tower.add(face);
    const handM = std('#2a1c0e'); const hh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.05), handM), mh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.1, 0.05), handM);
    hh.geometry.translate(0, 0.35, 0); mh.geometry.translate(0, 0.5, 0); hh.position.set(0, 10.8, 1.66); mh.position.set(0, 10.8, 1.68); tower.add(hh, mh);
    tower.traverse((o) => { if (o.isMesh) { o.userData.ownGeo = true; } });
    updaters.add((t) => { mh.rotation.z = -t * 1.6; hh.rotation.z = -t * 0.14; }); // time runs fast in the machine
  }
  worldGroup.add(tower);
  // street lamps
  const glow = new THREE.SpriteMaterial({ map: soft(), color: '#ffcf7a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + 0.26; const x = Math.sin(a) * 14.9, z = Math.cos(a) * 14.9;
    const pole = own(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 2, 6), std('#3b2a17'))); pole.position.set(x, 0.28, z); worldGroup.add(pole);
    const gl = new THREE.Sprite(glow); gl.position.set(x, 1.4, z); gl.scale.setScalar(1.2); worldGroup.add(gl); }
  disposables.push(glow);
}

/** Spread decor made for the 24-tile board outward for a bigger board (positions × K; centred rings/islands stretched). */
function spreadDecor(list, k) {
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
  for (const o of list) {
    if (o.isInstancedMesh) {
      for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); m.decompose(p, q, sc); p.x *= k; p.z *= k; m.compose(p, q, sc); o.setMatrixAt(i, m); }
      o.instanceMatrix.needsUpdate = true; o.computeBoundingSphere && o.computeBoundingSphere();
      continue;
    }
    if (Math.abs(o.position.x) + Math.abs(o.position.z) > 0.01) { o.position.x *= k; o.position.z *= k; if (o.userData.k0) o.userData.k0.multiplyScalar(k); continue; }
    if (o.isPoints) continue; // sky
    const flat = Math.abs(Math.abs(o.rotation.x) - Math.PI / 2) < 0.01;
    if (flat) { o.scale.x *= k; o.scale.y *= k; } else { o.scale.x *= k; o.scale.z *= k; }
  }
}

function neonTrim(T) {
  const a = new THREE.MeshStandardMaterial({ color: '#000000', emissive: T.accent || '#ff4fd8', emissiveIntensity: 2.4 });
  const b = new THREE.MeshStandardMaterial({ color: '#000000', emissive: T.accent2 || '#22d3ee', emissiveIntensity: 2.2 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.userData.ownGeo = true; worldGroup.add(m); };
  const L1 = HB * 2 - 0.9, E1 = HB - 0.5, L2 = HB * 2 + 0.1, E2 = HB + 0.02, L3 = CS + 0.3, E3 = CS / 2 + 0.12;
  const gx = new THREE.BoxGeometry(L1, 0.06, 0.1), gz = new THREE.BoxGeometry(0.1, 0.06, L1);
  add(gx, a, 0, 0.13, E1); add(gx, a, 0, 0.13, -E1); add(gz, a, E1, 0.13, 0); add(gz, a, -E1, 0.13, 0);
  const sx = new THREE.BoxGeometry(L2, 0.08, 0.06), sz = new THREE.BoxGeometry(0.06, 0.08, L2);
  add(sx, b, 0, -0.42, E2); add(sx, b, 0, -0.42, -E2); add(sz, b, E2, -0.42, 0); add(sz, b, -E2, -0.42, 0);
  const ix = new THREE.BoxGeometry(L3, 0.04, 0.06), iz = new THREE.BoxGeometry(0.06, 0.04, L3);
  add(ix, b, 0, 0.12, E3); add(ix, b, 0, 0.12, -E3); add(iz, b, E3, 0.12, 0); add(iz, b, -E3, 0.12, 0);
  disposables.push({ dispose() { a.dispose(); b.dispose(); } });
}

/** decor density per tier (100 % / 70 % / 40 %) */
const dn = (n) => Math.max(1, Math.round(n * cfg.decor));
/** Annulus scatter that keeps the camera side (+z) clear near the board. */
function scatter(n, rMin, rMax, { backOnly = false, frontMin = 0, seed = 7 } = {}) {
  let s = seed; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const out = []; let guard = 0;
  while (out.length < n && guard++ < n * 40) {
    const a = rnd() * Math.PI * 2, r = rMin + Math.sqrt(rnd()) * (rMax - rMin);
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (backOnly && z > -2 && Math.abs(x) < r * 0.75) continue;
    if (frontMin && z > 0 && r < frontMin) continue;
    if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < 4)) continue;
    out.push({ x, z, r, a, k: rnd() });
  }
  return out;
}

/** A floating island: flat top + rocky sides, so the sky shows beyond it. */
function island(radius, topMat, side = '#8a5a3a', rim = null, y = -0.72) {
  const top = own(new THREE.Mesh(new THREE.CircleGeometry(radius, 80), topMat));
  top.rotation.x = -Math.PI / 2; top.position.y = y; top.receiveShadow = true; worldGroup.add(top);
  const cliff = own(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 0.8, 6, 80, 3, true), std(side, { roughness: 1, flatShading: true })));
  const cp = cliff.geometry.attributes.position;
  for (let i = 0; i < cp.count; i++) { const yy = cp.getY(i); if (yy < 2.9) { const k = 1 + Math.sin(i * 12.9898) * 0.04; cp.setX(i, cp.getX(i) * k); cp.setZ(i, cp.getZ(i) * k); } }
  cliff.geometry.computeVertexNormals();
  cliff.position.y = y - 3; worldGroup.add(cliff);
  const bot = own(new THREE.Mesh(new THREE.ConeGeometry(radius * 0.8, 7, 40), std(shade(side, -0.25), { roughness: 1, flatShading: true })));
  bot.rotation.x = Math.PI; bot.position.y = y - 9.5; worldGroup.add(bot);
  if (rim) {
    const r = own(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 8, 120), new THREE.MeshStandardMaterial({ color: '#000', emissive: rim, emissiveIntensity: 2.2 })));
    r.rotation.x = Math.PI / 2; r.position.y = y; worldGroup.add(r);
  }
  return top;
}

function decorTrees(T) {
  island(33, std('#9cc46a', { roughness: 1 }), '#8a5a3a');
  const plaza = own(new THREE.Mesh(new THREE.RingGeometry(11.4, 14.2, 64), std('#ead8b0', { roughness: 1 })));
  plaza.rotation.x = -Math.PI / 2; plaza.position.y = -0.7; plaza.receiveShadow = true; worldGroup.add(plaza);
  const pts = scatter(dn(58), 15.5, 31, { seed: 11 });
  const trunkG = new THREE.CylinderGeometry(0.12, 0.17, 0.9, 6), roundG = new THREE.IcosahedronGeometry(0.85, 0), pineG = new THREE.ConeGeometry(0.75, 1.9, 7);
  const trunk = new THREE.InstancedMesh(trunkG, std('#7a5236'), pts.length);
  const round = new THREE.InstancedMesh(roundG, std('#ffffff', { flatShading: true, roughness: 0.9 }), pts.length);
  const pine = new THREE.InstancedMesh(pineG, std('#ffffff', { flatShading: true, roughness: 0.9 }), pts.length);
  const d = new THREE.Object3D(); const greens = ['#5f9e3f', '#4f8f3a', '#79b04a', '#e2a23b', '#c9772e', '#6aa84f'];
  let ri = 0, pi = 0;
  pts.forEach((p, i) => {
    const s = 0.9 + p.k * 0.9;
    d.position.set(p.x, -0.72 + 0.45 * s, p.z); d.rotation.set(0, p.a, 0); d.scale.setScalar(s); d.updateMatrix(); trunk.setMatrixAt(i, d.matrix);
    const col = new THREE.Color(greens[Math.floor(p.k * 97) % greens.length]);
    if (p.k < 0.6) { d.position.y = -0.72 + 1.45 * s; d.rotation.set(p.k * 3, p.a, p.k); d.updateMatrix(); round.setMatrixAt(ri, d.matrix); round.setColorAt(ri++, col); }
    else { d.position.y = -0.72 + 1.6 * s; d.rotation.set(0, p.a, 0); d.updateMatrix(); pine.setMatrixAt(pi, d.matrix); pine.setColorAt(pi++, col.lerp(new THREE.Color('#2f6b3a'), 0.4)); }
  });
  round.count = ri; pine.count = pi;
  [trunk, round, pine].forEach((m) => { m.castShadow = true; m.receiveShadow = true; own(m); worldGroup.add(m); });
  // flower bushes on the plaza edge
  const bushes = scatter(dn(34), 14.4, 15.4, { seed: 5 });
  const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), std('#ffffff', { flatShading: true, roughness: 0.9 }), bushes.length);
  const flowers = ['#5f9e3f', '#6aa84f', '#f28ab2', '#4f8f3a', '#ffd166', '#79b04a'];
  bushes.forEach((p, i) => { d.position.set(p.x, -0.55, p.z); d.rotation.set(p.k, p.a, 0); d.scale.set(1 + p.k * 0.5, 0.7 + p.k * 0.3, 1 + p.k * 0.5); d.updateMatrix(); bush.setMatrixAt(i, d.matrix); bush.setColorAt(i, new THREE.Color(flowers[i % flowers.length])); });
  bush.castShadow = true; own(bush); worldGroup.add(bush);
}

function decorSkyline(T) {
  island(34, std('#1c2133', { roughness: 0.85 }), '#2b2440', T.accent || '#ff4fd8');
  const road = own(new THREE.Mesh(new THREE.RingGeometry(12.2, 16.6, 72), std('#2a3042', { roughness: 0.7 })));
  road.rotation.x = -Math.PI / 2; road.position.y = -0.7; road.receiveShadow = true; worldGroup.add(road);
  const dashes = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 0.02, 0.9), new THREE.MeshStandardMaterial({ color: '#000', emissive: '#ffd166', emissiveIntensity: 1.6 }), 56);
  const d = new THREE.Object3D();
  for (let i = 0; i < 56; i++) { const a = (i / 56) * Math.PI * 2; d.position.set(Math.sin(a) * 14.4, -0.68, Math.cos(a) * 14.4); d.rotation.set(0, a, 0); d.scale.setScalar(1); d.updateMatrix(); dashes.setMatrixAt(i, d.matrix); }
  own(dashes); worldGroup.add(dashes);
  // street lamps glow
  const glowMat = new THREE.SpriteMaterial({ map: soft(), color: '#ffb36b', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.2; const x = Math.sin(a) * 17.2, z = Math.cos(a) * 17.2;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 2.2, 6), std('#40465a')); pole.position.set(x, 0.38, z); own(pole); worldGroup.add(pole);
    const gl = new THREE.Sprite(glowMat); gl.position.set(x, 1.55, z); gl.scale.setScalar(1.6); worldGroup.add(gl);
  }
  // distant skyline ring, mostly behind the board
  const pts = scatter(dn(16), 21, 31.5, { backOnly: true, seed: 3 });
  pts.forEach((p) => {
    const m = inst('skyline'); const s = 2.4 + p.k * 1.8;
    m.position.set(p.x, -0.72, p.z); m.scale.setScalar(s); m.rotation.y = Math.atan2(-p.x, -p.z) + Math.PI + (p.k - 0.5) * 0.6;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    worldGroup.add(m);
  });
  // side blocks, smaller
  scatter(dn(8), 19, 30, { seed: 9 }).filter((p) => p.z < 8).forEach((p) => {
    const m = inst('skyline'); m.position.set(p.x, -0.72, p.z); m.scale.setScalar(1.5 + p.k * 0.5); m.rotation.y = p.a; worldGroup.add(m);
  });
  disposables.push(glowMat);
}

function decorSea(T) {
  const W = cfg.updaters ? (lowPower ? 44 : 72) : 8; // static water at low: no vertex animation
  const geo = new THREE.PlaneGeometry(220, 220, W, W);
  const water = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: shade(T.water || '#0284c7', -0.18), roughness: 0.16, metalness: 0.25 }));
  water.rotation.x = -Math.PI / 2; water.position.y = -1.05; water.receiveShadow = true; own(water); worldGroup.add(water);
  const pos = geo.attributes.position; const base = Float32Array.from(pos.array);
  let frameN = 0;
  updaters.add((t) => {
    if (lowPower && (frameN++ & 1)) return;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      pos.array[i * 3 + 2] = Math.sin(x * 0.16 + t * 1.1) * 0.13 + Math.cos(y * 0.21 + t * 1.4) * 0.1 + Math.sin((x + y) * 0.07 + t * 0.6) * 0.08;
    }
    pos.needsUpdate = true; geo.computeVertexNormals();
  });
  // shallow lagoon tint around the pier
  const lag = own(new THREE.Mesh(new THREE.PlaneGeometry(48, 48), new THREE.MeshBasicMaterial({ map: soft(), color: '#5eead4', transparent: true, opacity: 0.45, depthWrite: false })));
  lag.rotation.x = -Math.PI / 2; lag.position.y = -0.8; worldGroup.add(lag);
  // pier posts under the board
  const postG = new THREE.CylinderGeometry(0.32, 0.36, 3, 8), postM = std('#6b4a2b');
  for (const x of [-10, -3.4, 3.4, 10]) for (const z of [-10, 10]) { const p = new THREE.Mesh(postG, postM); p.position.set(x, -2.1, z); worldGroup.add(p); }
  for (const z of [-3.4, 3.4]) for (const x of [-10, 10]) { const p = new THREE.Mesh(postG, postM); p.position.set(x, -2.1, z); worldGroup.add(p); }
  disposables.push(postG, postM);
  // quay with cranes and containers behind the board
  const quay = own(new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 7), std('#c9c2b4', { roughness: 0.95 })));
  quay.position.set(0, -1.2, -18.5); quay.receiveShadow = true; worldGroup.add(quay);
  [[-12, -18], [0.5, -18.4], [13, -18]].forEach(([x, z], i) => { const c = inst('crane'); c.position.set(x, -0.6, z); c.scale.setScalar(2.3 + i * 0.15); c.rotation.y = (i - 1) * 0.25; worldGroup.add(c); });
  const cont = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.7, 0.7), std('#ffffff', { roughness: 0.7 }), 40);
  const d = new THREE.Object3D(); const cols = ['#e2483d', '#2f6fdb', '#f2b632', '#1f9d63', '#0ea5e9', '#f97316'];
  for (let i = 0; i < 40; i++) {
    const col = i % 10, row = Math.floor(i / 10) % 2, h = Math.floor(i / 20);
    d.position.set(-20 + col * 1.75 + (col > 4 ? 18 : 0), -0.25 + h * 0.72, -16.6 - row * 0.8); d.rotation.set(0, 0, 0); d.updateMatrix();
    cont.setMatrixAt(i, d.matrix); cont.setColorAt(i, new THREE.Color(cols[(i * 7) % cols.length]));
  }
  cont.castShadow = true; own(cont); worldGroup.add(cont);
  // ships out at sea (hide their own water plate)
  [[-27, 2, 2.4, 1.2], [26, -6, 2.1, -0.9], [-8, -34, 2.6, 0.3]].forEach(([x, z, s, r], i) => {
    const sh = inst('ship'); sh.scale.setScalar(s); sh.position.set(x, -1.0, z); sh.rotation.y = r;
    sh.traverse((o) => { if (o.isMesh && o.material && /^water$/i.test(o.material.name)) o.visible = false; });
    worldGroup.add(sh);
    updaters.add((t) => { sh.position.y = -1.0 + Math.sin(t * 1.2 + i) * 0.12; sh.rotation.z = Math.sin(t * 0.9 + i) * 0.03; });
  });
  // gulls (tiny white sprites circling)
  const gm = new THREE.SpriteMaterial({ map: soft(), color: '#ffffff', transparent: true, depthWrite: false, opacity: 0.85 });
  const gulls = [0, 1, 2].map(() => { const s = new THREE.Sprite(gm); s.scale.set(0.5, 0.2, 1); s.position.set(5, 9, 5); worldGroup.add(s); return s; });
  updaters.add((t) => gulls.forEach((g, i) => { const a = t * 0.25 + i * 2.1; g.position.set(Math.sin(a) * (16 + i * 3) * K, 9 + i * 1.5 + Math.sin(t * 2 + i), (Math.cos(a) * (14 + i * 2) - 4) * K); }));
  disposables.push(gm);
}

function decorStars(T) {
  const gt = gridTexture('#22d3ee', '#0b1030');
  gt.repeat.set(10, 10);
  island(34, new THREE.MeshStandardMaterial({ color: '#0e1438', emissive: '#22d3ee', emissiveMap: gt, emissiveIntensity: 0.55, roughness: 0.35, metalness: 0.2 }), '#151a3f', T.accent || '#22d3ee');
  // halo under the board
  const halo = own(new THREE.Mesh(new THREE.RingGeometry(11.6, 15.5, 72), new THREE.MeshBasicMaterial({ color: T.accent || '#22d3ee', transparent: true, opacity: 0.12, depthWrite: false })));
  halo.rotation.x = -Math.PI / 2; halo.position.y = -0.69; worldGroup.add(halo);
  // starfield
  const n = dn(2200), arr = new Float32Array(n * 3), colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random(), v = Math.random() * 2 - 1; const th = u * Math.PI * 2, ph = Math.acos(v); // full sphere: the island floats in space
    const r = 120 + Math.random() * 60; arr[i * 3] = Math.sin(ph) * Math.cos(th) * r; arr[i * 3 + 1] = Math.cos(ph) * r * 0.8; arr[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * r;
    const c = new THREE.Color().setHSL(0.6 + Math.random() * 0.1, 0.5, 0.75 + Math.random() * 0.25); colors.set([c.r, c.g, c.b], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(arr, 3)); sg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.95, fog: false, depthWrite: false }));
  own(stars); worldGroup.add(stars);
  updaters.add((t) => { stars.rotation.y = t * 0.006; stars.material.opacity = 0.85 + Math.sin(t * 1.7) * 0.1; });
  // aurora ribbons
  if (T.aurora) {
    const cv = mkCanvas(512, 128), g = cv.getContext('2d');
    const hg = g.createLinearGradient(0, 0, 512, 0); hg.addColorStop(0, 'rgba(52,211,153,0)'); hg.addColorStop(0.2, 'rgba(52,211,153,1)'); hg.addColorStop(0.55, 'rgba(34,211,238,1)'); hg.addColorStop(0.85, 'rgba(167,139,250,1)'); hg.addColorStop(1, 'rgba(167,139,250,0)');
    g.fillStyle = hg; g.fillRect(0, 0, 512, 128);
    g.globalCompositeOperation = 'destination-in';
    const vg = g.createLinearGradient(0, 0, 0, 128); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.55, 'rgba(0,0,0,.9)'); vg.addColorStop(0.8, 'rgba(0,0,0,.45)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = vg; g.fillRect(0, 0, 512, 128);
    const tex = canvasTex(cv);
    [[-72, -4, 0.55, 0], [-92, 8, 0.4, 1.7], [-110, 30, 0.35, 3.1]].forEach(([z, y, op, ph]) => {
      const geo = new THREE.PlaneGeometry(220, 36, 60, 1);
      const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const rib = own(new THREE.Mesh(geo, mat)); rib.position.set(0, y, z); worldGroup.add(rib);
      const p = geo.attributes.position; const b = Float32Array.from(p.array);
      updaters.add((t) => {
        for (let i = 0; i < p.count; i++) { const x = b[i * 3]; p.array[i * 3 + 1] = b[i * 3 + 1] + Math.sin(x * 0.035 + t * 0.5 + ph) * 5; p.array[i * 3 + 2] = -(x * x) / 260 + Math.sin(x * 0.05 + t * 0.3 + ph) * 6; }
        p.needsUpdate = true; mat.opacity = op * (0.75 + Math.sin(t * 0.7 + ph) * 0.25);
      });
    });
  }
  // wind turbines
  scatter(dn(9), 21, 31.5, { backOnly: true, seed: 21 }).forEach((p) => {
    const m = inst('turbine'); const s = 2.2 + p.k * 1.3; m.position.set(p.x, -0.72, p.z); m.scale.setScalar(s); m.rotation.y = Math.atan2(p.x, p.z) + Math.PI;
    m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); worldGroup.add(m);
  });
  // floating light motes
  const mm = new THREE.SpriteMaterial({ map: soft(), color: T.accent2 || '#a78bfa', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  const motes = Array.from({ length: dn(14) }, (_, i) => { const s = new THREE.Sprite(mm); s.scale.setScalar(0.5); s.position.set(5, 2, 5); worldGroup.add(s); return { s, a: i * 0.45, r: 12 + (i % 4) * 2.5, h: 1.5 + (i % 5) }; });
  updaters.add((t) => motes.forEach((m) => { const a = m.a + t * 0.07; m.s.position.set(Math.sin(a) * m.r * K, m.h + Math.sin(t + m.a * 3) * 0.6, Math.cos(a) * m.r * K); }));
  disposables.push(mm);
}

/* ============================================================ pawn */
export async function setPawn(id = 'classic', color = '#e2483d') {
  const key = id + '|' + color;
  if (pawn && pawnKey === key) return;
  let src = null;
  try { src = await loadGLB(modelUrl('pawns', id)); } catch (e) { console.warn('pawn failed', id, e); }
  if (!src) { try { src = await loadGLB(modelUrl('pawns', 'classic')); } catch (e) { src = null; } }
  const p = src ? src.clone(true) : inst('pawn');
  p.traverse((o) => { if (o.isMesh && o.material && o.material.name === 'PawnColor') { o.material = o.material.clone(); o.material.color.set(color); o.material.roughness = Math.min(o.material.roughness, 0.45); } });
  p.scale.setScalar(1.7);
  const pos = pawn ? pawn.position.clone() : tilePos(0);
  if (pawn) scene.remove(pawn);
  pawn = p; pawn.position.copy(pos); scene.add(pawn); pawnKey = key; invalidate();
  if (!pawnRing) {
    pawnRing = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.8, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    pawnRing.rotation.x = -Math.PI / 2; pawnRing.position.y = 0.27; scene.add(pawnRing);
  } else pawnRing.material.color.set(ringColor || color);
  if (ringColor) pawnRing.material.color.set(ringColor);
}
export function placePawn(i) { cancelTweens('hop'); hopping = false; if (pawn) { pawn.position.copy(tilePos(i)); pawn.scale.setScalar(1.7); pawn.userData.away = false; } focus.copy(tilePos(i)); if (camMode === 'follow') { resize(); } invalidate(); }
/* ---------- wave 1 (B1 G6): tile markers — a persistent outline on the current tile; during a move the destination tile gets a
 * gold outline and a bobbing arrow before the first hop, cleared after landing (game.js drives both through markTile). */
const markGroup = new THREE.Group(); markGroup.name = 'marks';
const marks = { current: null, dest: null };
let markObj = null;
function markMeshes() {
  if (markObj) return markObj;
  const sq = (rIn, rOut) => new THREE.RingGeometry(rIn, rOut, 4, 1, Math.PI / 4).rotateX(-Math.PI / 2); // a square outline, axis-aligned
  const cur = new THREE.Mesh(sq(1.3, 1.5), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
  const dest = new THREE.Group();
  const ring = new THREE.Mesh(sq(1.24, 1.5), new THREE.MeshBasicMaterial({ color: '#f2b632', transparent: true, opacity: 0.95, depthWrite: false }));
  const fillM = new THREE.Mesh(new THREE.PlaneGeometry(2.04, 2.04).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b632', transparent: true, opacity: 0.22, depthWrite: false }));
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.62, 4).rotateX(Math.PI), new THREE.MeshStandardMaterial({ color: '#f2b632', emissive: '#f2b632', emissiveIntensity: 0.55, roughness: 0.4 }));
  arrow.position.y = 2.1; arrow.name = 'arrow';
  dest.add(ring, fillM, arrow);
  cur.renderOrder = dest.renderOrder = 3; cur.visible = dest.visible = false; cur.name = 'mark:current'; dest.name = 'mark:dest';
  markGroup.add(cur, dest);
  markObj = { cur, dest, arrow, ring };
  return markObj;
}
function placeMarks() {
  const m = markMeshes();
  for (const [k, o] of [['current', m.cur], ['dest', m.dest]]) {
    const i = marks[k]; o.visible = i != null && i >= 0 && i < boardN;
    if (o.visible) { const p = tilePos(i); o.position.set(p.x, 0.285, p.z); }
  }
  invalidate();
}
/** markTile('current' | 'dest', tileIndex | null) — show / move / clear a tile marker (SCENE_OPTIONAL, no-op in null.js). */
export function markTile(kind, i) {
  try { if (!(kind in marks)) return; marks[kind] = i == null || i < 0 ? null : Number(i); placeMarks(); if (kind === 'dest' && marks.dest != null) wake(1200); } catch (e) { console.warn('[scene] markTile', e); }
}
function markStep(now) {
  if (!markObj || !markObj.dest.visible) return;
  const t = now / 1000;
  if (reduced) { markObj.arrow.position.y = 2.1; markObj.ring.material.opacity = 0.95; return; }
  markObj.arrow.position.y = 2.1 + Math.sin(t * 5) * 0.22; markObj.arrow.rotation.y = t * 1.6;
  markObj.ring.material.opacity = 0.7 + Math.sin(t * 6) * 0.25;
}
let glowMesh = null;
function tileGlow(i) {
  if (!glowMesh) { glowMesh = new THREE.Mesh(new THREE.RingGeometry(0.75, 1.05, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#f2b632', transparent: true, depthWrite: false })); glowMesh.visible = false; }
  const m = glowMesh.clone(); m.material = glowMesh.material.clone(); m.visible = true; m.position.copy(tilePos(i)); m.position.y = 0.36; fxGroup.add(m);
  tween(300, (p) => { m.material.opacity = 1 - p; }).then(() => { fxGroup.remove(m); m.material.dispose(); });
}
/** One hop from tile `from` to tile `to`. last=true adds a squash on landing. */
export async function hop(from, to, last = false) {
  if (!pawn) return;
  const a = tilePos(from), b = tilePos(to);
  if (reduced) { // T5 §4.3: teleport (≤ 300 ms per move, not per tile) + a 300 ms glow on every tile passed
    hopping = true; tileGlow(to);
    if (!pawn.userData.away) { pawn.userData.away = true; await tween(80, (p) => pawn.scale.setScalar(1.7 * Math.max(0.001, 1 - p)), 'hop'); }
    pawn.position.copy(b); focusOn(b);
    if (last) { await tween(120, (p) => pawn.scale.setScalar(1.7 * Math.max(0.001, p)), 'hop'); pawn.userData.away = false; pawn.scale.setScalar(1.7); }
    hopping = false; invalidate(); return;
  }
  hopping = true; focusOn(b);
  pawn.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  await tween(D(MOTION.hop), (p) => {
    if (!pawn) return;
    pawn.position.lerpVectors(a, b, p); pawn.position.y = a.y + Math.sin(p * Math.PI) * 0.85;
    const k = Math.sin(p * Math.PI); pawn.scale.set(1.7 * (1 - k * 0.04), 1.7 * (1 + k * 0.1), 1.7 * (1 - k * 0.04));
  }, 'hop');
  if (last) await tween(D(MOTION.hopSquash), (p) => { const k = Math.sin(p * Math.PI) * 0.14; pawn.scale.set(1.7 * (1 + k), 1.7 * (1 - k), 1.7 * (1 + k)); }, 'hop');
  pawn.scale.setScalar(1.7);
  hopping = false;
}

/* ============================================================ the city (bought assets) — T5 living city */
const CITY_Y = 0.18;                      // every item stands on a 0.08 "owned" plinth (A-41)
const city = new Map(); // key -> {obj, slot, model, level, h0, annex, badgeCell, badgeUntil, lastAnim}
let gridN = 4, hlKey = null, hoverKey = null;
const heightOf = new Map();               // model url → height at scale 1 (bounding box)
const slotScale = (n) => ((0.86 * 4) / n) * Math.min(1.45, CS / 10.6);
const slotSpacing = () => (CS - 0.6) / gridN;
function slotXZ(idx, n) { const sp = (CS - 0.6) / n; const r = Math.floor(idx / n), c = idx % n; return [(c - (n - 1) / 2) * sp, (r - (n - 1) / 2) * sp]; }
function freeSlot() { const used = new Set([...city.values()].map((x) => x.slot)); let i = 0; while (used.has(i)) i++; return i; }
/** the item's model scale: slot scale × the stage factor (stage 0 ×0.8, stage 3 ×1.12) */
const sOf = (it) => slotScale(gridN) * kitParts(it.level).scale;
function measure(obj, model) {
  const k = String(model);
  if (heightOf.has(k)) return heightOf.get(k);
  const p = obj.position.clone(), s = obj.scale.clone(), r = obj.rotation.clone();
  obj.position.set(0, 0, 0); obj.scale.setScalar(1); obj.rotation.set(0, 0, 0); obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj); const h = Math.max(0.6, Math.min(4, b.max.y - Math.max(0, b.min.y)));
  obj.position.copy(p); obj.scale.copy(s); obj.rotation.copy(r);
  if (!obj.userData.ownTree) heightOf.set(k, h);
  return h;
}
/* ---------- kit + pick proxies (rebuilt from the city map; cheap for ≤ 64 items) */
const pickGroup = new THREE.Group(); const pickGeo = new THREE.BoxGeometry(1, 1, 1); const pickMat = new THREE.MeshBasicMaterial({ visible: false });
let kitDirty = false;
function syncKit() {
  if (!kit) return;
  const now = performance.now(); const items = []; const sp = slotSpacing();
  while (pickGroup.children.length > city.size) pickGroup.remove(pickGroup.children[pickGroup.children.length - 1]);
  let i = 0;
  for (const [key, it] of city) {
    const o = it.obj; const s = o.scale.x; const h = (it.h0 || 1.4) * s;
    let badge = it.badgeUntil > now ? it.badgeCell : null;
    if (!badge && it.level) { const a = activityOf({ ...it.level, trouble: false }); if (a) badge = ACTIVITY_ICON[a]; }
    items.push({ key, x: o.position.x, y: CITY_Y, z: o.position.z, s, sp, h, level: it.level, highlight: key === hlKey || key === hoverKey, badge, life: isLifeMarker(key),
      sign: it.level && it.level.kind === 'biz' ? (ARCHETYPE_ICON[it.level.type] || 'shop') : null });
    let px = pickGroup.children[i];
    if (!px) { px = new THREE.Mesh(pickGeo, pickMat); px.layers.set(1); pickGroup.add(px); }
    const w = Math.min(sp * 0.98, 2 * 1.15 * Math.max(Math.min(0.47 * sp, 1.05 * s), 0.8 * s)); px.userData.key = key; // bounds × 1.15
    px.position.set(o.position.x, CITY_Y + h * 0.575, o.position.z); px.scale.set(w, h * 1.15, w); px.updateMatrixWorld();
    i++;
  }
  kit.sync(items); kitDirty = false; updateEmpty(); invalidate();
}
function relayout(animate = true) {
  // compact slots in current order so a bigger grid stays tidy
  const items = [...city.values()].sort((a, b) => a.slot - b.slot);
  items.forEach((it, i) => {
    it.slot = i; const [x, z] = slotXZ(i, gridN); const o = it.obj; const s = sOf(it);
    if (!animate || reduced) { o.position.set(x, CITY_Y, z); o.scale.setScalar(s); return; }
    const p0 = o.position.clone(), s0 = o.scale.x;
    tween(D(MOTION.tmax * 0.8), (p) => { const e = easeInOut(p); o.position.set(p0.x + (x - p0.x) * e, CITY_Y, p0.z + (z - p0.z) * e); o.scale.setScalar(s0 + (s - s0) * e); syncKit(); });
  });
  syncKit();
}
function ensureGrid(count, animate = true) {
  let n = 4; while (n * n < count && n < 8) n++;
  if (n !== gridN) { gridN = n; relayout(animate); drawCenter(n); }
}
export function clearCity() { for (const it of city.values()) dropObj(it.obj); city.clear(); for (const o of [...cityGroup.children]) dropObj(o); fxGroup.clear(); hlKey = hoverKey = null; if (gridN !== 4) { gridN = 4; drawCenter(4); } syncKit(); }
export function hasKey(key) { return city.has(key); }
/** wave 1 (A2 G-03): the keys the city shows now (SCENE_OPTIONAL) — game.js reconciles them with E.cityModels(S) + L:* */
export function cityKeys() { return [...city.keys()]; }
/** life events (not owned assets) get the "life" base instead of the owned plinth + rim; the pension and the index fund are real holdings */
export const isLifeMarker = (key) => /^L:/.test(String(key)) && key !== 'L:pension' && key !== 'L:index';
/** test / debug (outside SCENE_API): what the board shows right now */
export function boardUx() {
  return { empty: emptyShown && !!(emptyGroup && emptyGroup.visible), city: city.size, current: marks.current, dest: marks.dest, landmarks: landmarkCount, pedestals: pedestalCount,
    life: [...city.keys()].filter(isLifeMarker), watchFired, stalled, pawnTile: pawnTileNow() };
}
function pawnTileNow() { if (!pawn) return null; let best = null, bd = 1e9; for (let i = 0; i < boardN; i++) { const p = tilePos(i); const d = (p.x - pawn.position.x) ** 2 + (p.z - pawn.position.z) ** 2; if (d < bd) { bd = d; best = i; } } return bd < 0.05 ? best : null; }
/** life models arrive lazily (CR-05): swap the stand-in for the real model in place */
function swapWhenReady(key, model) {
  const it = city.get(key); if (!it || !it.obj.userData.fallbackOf) return;
  loadGLB(it.obj.userData.fallbackOf).then(() => {
    const cur = city.get(key); if (!cur || cur !== it || !it.obj.userData.fallbackOf) return;
    const n = inst(model); if (n.userData.ownTree) { dropObj(n, new THREE.Group()); return; }
    // the rest pose, not the stand-in's current pose: a spawn bounce / relayout tween may still be animating the old object (M-1)
    const [x, z] = slotXZ(it.slot, gridN); n.position.set(x, CITY_Y, z); n.rotation.y = it.obj.rotation.y; n.scale.setScalar(sOf(it));
    n.userData.key = key; n.userData.level = it.obj.userData.level;
    dropObj(it.obj); it.obj = n; it.annex = null; if (it.level) applyLevelParts(it); it.h0 = measure(n, n.userData.fallbackOf || modelUrlOf(model)); cityGroup.add(n); syncKit();
  }, () => {});
}
const modelUrlOf = (model) => { let dir = assetDir(world), name = model; if (String(model).includes('/')) [dir, name] = String(model).split('/'); return modelUrl(dir, name); };

/** Drop a model into the city. opts {label, color, golden, silent, level} */
export function spawn(key, model, opts = {}) {
  if (!key || city.has(key)) return;
  ensureGrid(city.size + 1, !opts.silent);
  const obj = inst(model);
  const slot = freeSlot(); const [x, z] = slotXZ(slot, gridN);
  obj.position.set(x, CITY_Y, z); obj.rotation.y = (Math.random() - 0.5) * 0.3;
  const it = { obj, slot, model, level: normLevel(opts.level), h0: 1.4, annex: null, badgeCell: null, badgeUntil: 0, lastAnim: 0 };
  it.h0 = measure(obj, modelUrlOf(model));
  obj.userData.key = key; obj.userData.level = it.level ? { ...it.level, parts: kitParts(it.level) } : null;
  city.set(key, it); cityGroup.add(obj);
  if (obj.userData.fallbackOf) swapWhenReady(key, model);
  if (it.level) applyLevelParts(it);
  const s = sOf(it);
  if (opts.silent) { obj.scale.setScalar(s); syncKit(); return; }
  if (reduced) { // fade-in feel without motion: a 120 ms scale 0.9 → 1, static label, no dust
    obj.scale.setScalar(s * 0.9); syncKit();
    tween(MOTION.t1, (p) => obj.scale.setScalar(s * (0.9 + 0.1 * p))).then(() => { if (opts.label) floatLabel(opts.label, opts.color || 'green', key); if (opts.golden) sparkle(key); });
    return;
  }
  obj.position.y = 7; obj.scale.setScalar(s * 0.8); syncKit();
  tween(D(MOTION.spawn), (p) => { obj.position.y = CITY_Y + (1 - easeOutBounce(p)) * 7; obj.scale.setScalar(s * (0.8 + 0.2 * Math.min(1, p * 1.6))); })
    .then(() => { dust(key); if (opts.label) floatLabel(opts.label, opts.color || 'green', key); if (opts.golden) sparkle(key); });
}
/** Shrink a model away. */
export function despawn(key) {
  const it = city.get(key); if (!it) return;
  city.delete(key); syncKit();
  const o = it.obj, s0 = o.scale.x;
  tween(reduced ? MOTION.t1 : D(MOTION.despawn), (p) => { o.scale.setScalar(Math.max(0.001, s0 * (1 - p))); if (!reduced) o.rotation.y += 0.08; }).then(() => dropObj(o));
}
/** Startup exit: success = rocket lifts off; fail = it topples into dust. */
export function launch(key, success) {
  const it = city.get(key); if (!it) return;
  city.delete(key); syncKit();
  const o = it.obj, y0 = o.position.y, s0 = o.scale.x;
  if (reduced) { tween(MOTION.t2, (p) => o.scale.setScalar(Math.max(0.001, s0 * (1 - p)))).then(() => dropObj(o)); return; }
  dust(key, success ? '#f8fafc' : '#94a3b8', 16);
  if (success) {
    tween(D(1300), (p) => { o.position.y = y0 + p * p * 16; o.rotation.y += 0.05; o.position.x += Math.sin(p * 30) * 0.01; if (p > 0.7) o.scale.setScalar(s0 * (1 - (p - 0.7) / 0.3)); }).then(() => dropObj(o));
  } else {
    tween(D(800), (p) => { o.rotation.z = p * 1.3; o.position.y = y0 - p * 0.4; o.scale.setScalar(Math.max(0.001, s0 * (1 - p * p))); }).then(() => dropObj(o));
  }
}
/** Rebuild the city to match the engine's cityModels() list (resume). Entries may carry `level` (applied silently). */
export function syncCity(list, { silent = true } = {}) {
  list = [...(list || []), ...fixtureItems()];
  const want = new Set(list.map((m) => m.key));
  for (const k of [...city.keys()]) if (!want.has(k)) { dropObj(city.get(k).obj); city.delete(k); }
  ensureGrid(list.length, false);
  for (const m of list) if (!city.has(m.key)) spawn(m.key, m.model, { silent, level: m.level });
  for (const m of list) if ('level' in m) setLevel(m.key, m.level, { animate: false });
  relayout(false);
}
/** `?fx=levels[:N]` dev fixture (T5 §13): the "mixed levels" city (stages 0–3, two busy; upgrades 1/2, 2/2; rest plain). */
function fixtureItems() {
  const n = fixtureCount(location.search); return n && world ? fixtureCity(world, n) : [];
}
export function bump(key) {
  const it = city.get(key); if (!it) return;
  const o = it.obj, s0 = sOf(it);
  if (reduced) { o.scale.setScalar(s0); return; }
  tween(D(MOTION.bump), (p) => o.scale.setScalar(s0 * (1 + Math.sin(p * Math.PI) * 0.18)));
  sparkle(key, 14);
}

/* ---------- T5 §5.2: levels (business stages, upgrades), pulses, activity badges */
function applyLevelParts(it) {
  const P = kitParts(it.level);
  if (P.annex && !it.annex) {
    const a = inst(it.model); a.position.set(-0.78, 0, -0.78); a.scale.set(0.55, 0.42, 0.55); a.userData.annex = true; it.obj.add(a); it.annex = a;
  } else if (!P.annex && it.annex) { it.obj.remove(it.annex); if (it.annex.userData.ownTree) disposeTree(it.annex); it.annex = null; }
  // stage ≥ 1: windows lit (+0.2 emissive on the item's own copy of its "lit window" materials)
  const lit = !!(it.level && it.level.kind === 'biz' && it.level.n >= 1);
  it.obj.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material) || o.userData.annexPart) return;
    if (isSharedFlat(o.material) || (o.userData.ownMat && o.material.userData.uLit)) { // flattened: one uniform on a per-item copy
      if (!lit && !o.userData.ownMat) return;
      if (!o.userData.ownMat) { o.material = litCopy(o.material, 0.2); o.userData.ownMat = true; }
      o.material.userData.uLit.value = lit ? 0.2 : 0; return;
    }
    if (!LIT_RE.test(o.material.name || '')) return;                                       // ?flat=0: the original material
    if (!o.userData.ownMat) { o.userData.baseEI = o.material.emissiveIntensity; o.material = o.material.clone(); o.userData.ownMat = true; }
    o.material.emissiveIntensity = o.userData.baseEI + (lit ? 0.2 : 0);
  });
}
function flashBadge(it, cell, ms) {
  it.badgeCell = cell; it.badgeUntil = performance.now() + ms; syncKit();
  setTimeout(() => { if (it.badgeUntil <= performance.now() + 5) { it.badgeCell = null; syncKit(); } }, ms + 30);
}
/** setLevel(key, level, {animate}) — plinth pips, stage kit, scale (T5 §5.2). level = null → plinth only (A-16). */
export function setLevel(key, level, { animate = false } = {}) {
  try {
    const it = city.get(key); if (!it) return;
    const L = normLevel(level); const prev = it.level;
    if (JSON.stringify(L) === JSON.stringify(prev)) return;
    it.level = L; it.obj.userData.level = L ? { ...L, parts: kitParts(L) } : null;
    const down = prev && L && prev.kind === 'biz' && L.kind === 'biz' && L.n < prev.n;
    if (down || (L && L.trouble && !(prev && prev.trouble))) flashBadge(it, 'alert', 1500);
    applyLevelParts(it);
    const s1 = sOf(it), o = it.obj, now = performance.now();
    const up = !down && animate && !reduced && now - it.lastAnim > 2500; // ≤ 1 level animation per item per payday
    if (up) {
      it.lastAnim = now; const s0 = o.scale.x;
      tween(D(MOTION.bump), (p) => { o.scale.setScalar((s0 + (s1 - s0) * easeInOut(p)) * (1 + Math.sin(p * Math.PI) * 0.12)); syncKit(); }).then(() => { o.scale.setScalar(s1); syncKit(); sparkle(key, 10); });
    } else o.scale.setScalar(s1);
    syncKit();
  } catch (e) { console.warn('[scene] setLevel', e); }
}
/** pulse(key, kind 'good'|'bad'|'event') — bob 300 ms + an arrow badge for 1.2 s (T5 §4.1 business pulse). */
export function pulse(key, kind = 'good') {
  try {
    const it = city.get(key); if (!it) return;
    flashBadge(it, kind === 'bad' ? 'down' : kind === 'event' ? 'garland' : 'up', 1200);
    if (reduced) return;
    const o = it.obj; tween(D(MOTION.pulse), (p) => { o.position.y = CITY_Y + Math.sin(p * Math.PI) * 0.35 * o.scale.x; }).then(() => { o.position.y = CITY_Y; });
  } catch (e) { console.warn('[scene] pulse', e); }
}
/** highlight(key|null) — brightens the item's plinth rim (taps that are not allowed to open the modal, hover). */
export function highlight(key) { try { hlKey = key && city.has(key) ? key : null; syncKit(); } catch (e) { console.warn(e); } }
/** for tests and the info modal: the level object an item currently shows */
export function levelOf(key) { const it = city.get(key); return it && it.level ? { ...it.level, parts: kitParts(it.level), annex: !!it.annex } : null; }
export function shield(keys) {
  for (const key of keys || []) {
    const it = city.get(key); if (!it) continue;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(it.obj.position); m.scale.setScalar(0.01); fxGroup.add(m);
    const s = slotScale(gridN) * 1.25;
    if (reduced) m.scale.setScalar(s); // reduced motion: a static dome, opacity fade 200 ms in / out (m-8)
    const T = D(1700), f = 200 / T;
    tween(T, (p) => { if (reduced) { m.material.opacity = 0.3 * Math.min(1, p / f, (1 - p) / f); return; } m.scale.setScalar(s * Math.min(1, p * 4)); m.material.opacity = p < 0.6 ? 0.35 : 0.35 * (1 - (p - 0.6) / 0.4); })
      .then(() => { fxGroup.remove(m); m.geometry.dispose(); m.material.dispose(); });
  }
}

/* ============================================================ effects */
function anchor(at) {
  if (at && at !== 'pawn' && city.has(at)) { const o = city.get(at).obj; return new THREE.Vector3(o.position.x, CITY_Y, o.position.z); }
  return pawn ? new THREE.Vector3(pawn.position.x, 0.26, pawn.position.z) : new THREE.Vector3();
}
function anchorTop(at) {
  const p = anchor(at);
  p.y += (at && at !== 'pawn' && city.has(at)) ? 2.7 * slotScale(gridN) / 0.86 : 2.3;
  return p;
}
/** Screen position (CSS px) of a pawn/asset anchor — for DOM effects like flying coins. */
export function project(at = 'pawn') {
  const p = anchorTop(at); p.y -= 0.8; p.project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height };
}
/* ---------- float labels: a pool of sprite + canvas pairs (size = the tier's concurrency cap), no per-label allocation (§8.3.4) */
const labelPool = []; const labelGroup = new THREE.Group();
function labelSlot() {
  let e = labelPool.find((x) => !x.busy);
  if (!e && labelPool.length < cfg.labels) {
    const cv = mkCanvas(1024, 128); const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true })); sp.renderOrder = 20; sp.visible = false;
    e = { cv, g: cv.getContext('2d'), tx, sp, busy: false, gen: 0, t0: 0 }; labelPool.push(e); labelGroup.add(sp);
  }
  if (!e) { e = labelPool.reduce((a, b) => (a.t0 <= b.t0 ? a : b)); } // the oldest is removed early
  e.gen++; e.busy = true; e.t0 = performance.now();
  return e;
}
function drawLabel(e, text, col, big) {
  const g = e.g; g.clearRect(0, 0, 1024, 128);
  g.font = `800 ${big ? 70 : 64}px Rubik`; g.direction = 'rtl';
  const w = Math.min(1000, g.measureText(text).width + 56);
  g.fillStyle = 'rgba(255,250,240,.96)'; g.beginPath(); g.roundRect(512 - w / 2, 12, w, 104, 52); g.fill();
  g.strokeStyle = col; g.lineWidth = 5; g.stroke();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 66);
  e.tx.needsUpdate = true;
}
function showLabel(text, color, pos, { rise = 1.5, dur = 1900, w = 8, h = 1 } = {}) {
  if (!text) return Promise.resolve();
  const e = labelSlot(); const gen = e.gen; const col = labelColor(color);
  drawLabel(e, String(text), col); const sp = e.sp; sp.visible = true; sp.material.opacity = 1; sp.position.copy(pos); sp.scale.set(w, h, 1);
  const y0 = pos.y; const T = reduced ? 1200 : D(Math.min(dur, 1900)) * 0.85; // rise ≤ 600 ms, then a readable hold (label 1.2 s)
  return tween(T, (p) => {
    if (e.gen !== gen) return;
    if (!reduced) { const r = Math.min(1, (p * T) / MOTION.label); sp.position.y = y0 + easeOutBack(r) * rise * 0.8; const s = 0.7 + Math.min(1, r * 3) * 0.3; sp.scale.set(w * s, h * s, 1); }
    sp.material.opacity = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
  }).then(() => { if (e.gen === gen) { e.busy = false; sp.visible = false; } });
}
export function floatLabel(text, color = 'green', at = 'pawn', opts = {}) { return showLabel(text, color, anchorTop(at), opts); }
function particles(at, n, o) { const base = anchor(at); const s0 = (at && at !== 'pawn' && city.has(at)) ? slotScale(gridN) / 0.86 : 1; return particlesAt(base, n, { ...o, s0 }); }
const DUST = { trees: '#e8dcc4', skyline: '#9aa3c0', sea: '#f3e6c8', stars: '#c7d2fe' };
const nPart = (n) => Math.max(1, Math.round(n * cfg.particles));
export function dust(at, color, n = 12) { if (reduced || cfg.particles < 0.5) return Promise.resolve(); return particles(at, nPart(n), { tex: soft(), color: color || DUST[theme && theme.decor] || '#e8dcc4', size: 0.75, spread: 1.6, up: 0.6, dur: MOTION.dust, y: 0.15 }); }
export function sparkle(at = 'pawn', n = 26) {
  if (reduced) { // golden: a static star badge, 800 ms hold
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: star(), transparent: true, depthWrite: false })); sp.position.copy(anchorTop(at)); sp.scale.setScalar(1.2); fxGroup.add(sp);
    return tween(800, () => {}).then(() => { fxGroup.remove(sp); sp.material.dispose(); });
  }
  return particles(at, nPart(n * 0.6), { tex: star(), color: '#ffffff', size: 0.55, spread: 1.4, up: 2.2, dur: MOTION.sparkle, additive: true, y: 0.5 });
}
export function hearts(at = 'pawn', n = 9) { if (reduced) return Promise.resolve(); return particles(at, nPart(n), { tex: heart(), color: '#ffffff', size: 0.45, spread: 0.9, up: 2.4, dur: MOTION.tmax, y: 1 }); }
export function shake(amp = 0.25, dur = 300) { if (reduced) return; amp = Math.min(amp, 0.25); dur = Math.min(dur, MOTION.shake); shakeAmp = amp; shakeDur = D(dur); shakeUntil = performance.now() + shakeDur; wake(dur + 500); }
export function confetti() {
  const n = cfg.confetti; if (reduced || !n) return Promise.resolve();
  const geo = new THREE.BoxGeometry(0.18, 0.04, 0.12), mat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const im = new THREE.InstancedMesh(geo, mat, n); const cols = ['#f2b632', '#e2483d', '#1f9d63', '#2f6fdb', '#ffffff', '#ff4fd8']; const P = []; const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) { P.push({ x: (Math.random() - 0.5) * 18, y: 7 + Math.random() * 6, z: (Math.random() - 0.5) * 18, v: 3 + Math.random() * 4, r: Math.random() * 6, s: Math.random() * 4 }); im.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
  fxGroup.add(im);
  return tween(MOTION.confetti, (p) => {
    const t = p * 2.4;
    P.forEach((q, i) => { d.position.set(q.x + Math.sin(t * 2 + i) * 0.4, q.y - q.v * t, q.z); d.rotation.set(q.r + t * q.s, t * q.s, q.r); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.instanceMatrix.needsUpdate = true;
  }).then(() => { fxGroup.remove(im); geo.dispose(); mat.dispose(); im.dispose(); });
}
/** End-of-game camera move (≤ 1.2 s; resolves at once with reduced motion). */
export async function celebrate(win) {
  if (reduced) return;
  celebrating = true; controls.enabled = false;
  const tgt = controls.target.clone();
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(tgt));
  const to = from.clone();
  if (win) { to.theta += 0.75; to.phi = Math.min(from.phi + 0.18, 1.15); to.radius *= 0.8; } else { to.radius *= 1.1; to.phi = Math.max(from.phi - 0.12, 0.35); }
  to.theta = Math.min(controls.maxAzimuthAngle, Math.max(controls.minAzimuthAngle, to.theta)); // never ends outside the orbit limits (no jump after it)
  await tween(win ? MOTION.celebrate : MOTION.celebrate * 0.8, (p) => {
    const e = easeInOut(p);
    const s = new THREE.Spherical(from.radius + (to.radius - from.radius) * e, from.phi + (to.phi - from.phi) * e, from.theta + (to.theta - from.theta) * e);
    camera.position.copy(tgt).add(new THREE.Vector3().setFromSpherical(s)); camera.lookAt(tgt);
  }, 'celebrate');
  controls.enabled = true;
}
/** T5 G-7: first game in a world — camera from overview to follow in 600 ms, not awaited (no-op with reduced motion). */
export function introWorld() {
  try {
    if (reduced || !controls) return;
    const m = camMode; camMode = 'overview'; applyCamGoal(false); camera.position.copy(camGoal.target).addScaledVector(camGoal.dir, camGoal.dist); controls.target.copy(camGoal.target);
    camMode = m; applyCamGoal(true); camAnimUntil = performance.now() + MOTION.intro;
  } catch (e) { console.warn(e); }
}
/** T5 G-8: the pawn ring takes the character colour (§3.1); the pawn keeps the colour the player chose. */
let ringColor = null;
export function setPawnRing(color) { try { ringColor = color || null; if (pawnRing && ringColor) { pawnRing.material.color.set(ringColor); invalidate(); } } catch (e) { console.warn(e); } }


/* ============================================================ 3D dice thrown by a hand
   Scripted, not simulated: every throw ends EXACTLY on the engine's faces. Die faces (standard: opposite sides sum to 7):
   +Y=1 −Y=6 +Z=2 −Z=5 +X=3 −X=4. BoxGeometry material order is [+X, −X, +Y, −Y, +Z, −Z]. */
const DIE = 0.62;
const FACE_NORMAL = { 1: [0, 1, 0], 6: [0, -1, 0], 2: [0, 0, 1], 5: [0, 0, -1], 3: [1, 0, 0], 4: [-1, 0, 0] };
const FACE_ORDER = [3, 4, 1, 6, 2, 5];
let diceObjs = [], hand = null, handFingers = [], handGLB = false, holding = false, holdT0 = 0, diceHideT = 0;
const PIPXY = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
function dieFaceTex(n) {
  const cv = mkCanvas(128), g = cv.getContext('2d');
  g.fillStyle = '#e9e4da'; g.fillRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 54, 10, 64, 64, 90); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#efe9de');
  g.fillStyle = gr; g.beginPath(); g.roundRect(5, 5, 118, 118, 22); g.fill();
  g.fillStyle = n === 1 ? '#d23b30' : '#1d1a2b';
  for (const [x, y] of PIPXY[n]) { g.beginPath(); g.arc(64 + x * 33, 64 + y * 33, n === 1 ? 15 : 11.5, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
let dieMats = null, dieGeo = null;
function makeDie() {
  const g = ready.get(modelUrl('life', 'die'));
  if (g) { const m = g.clone(true); m.scale.setScalar(DIE); m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); m.visible = false; scene.add(m); return m; }
  if (!dieMats) { dieMats = FACE_ORDER.map((n) => new THREE.MeshStandardMaterial({ map: dieFaceTex(n), roughness: 0.35, metalness: 0.02 })); dieGeo = new THREE.BoxGeometry(DIE, DIE, DIE); }
  const m = new THREE.Mesh(dieGeo, dieMats); m.castShadow = true; m.receiveShadow = true; m.visible = false;
  scene.add(m); return m;
}
/** Quaternion that puts face `n` on top, then turns it by `yaw` around the vertical. */
export function faceUpQuat(n, yaw = 0) {
  const nv = new THREE.Vector3(...FACE_NORMAL[n]);
  const q = new THREE.Quaternion().setFromUnitVectors(nv, new THREE.Vector3(0, 1, 0));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw).multiply(q);
}
/** Which face points up for a quaternion (used by the tests). */
export function faceUpOf(q) {
  let best = 1, bd = -2; const up = new THREE.Vector3(0, 1, 0);
  for (const [n, v] of Object.entries(FACE_NORMAL)) { const d = new THREE.Vector3(...v).applyQuaternion(q).dot(up); if (d > bd) { bd = d; best = +n; } }
  return best;
}
/** Faces currently showing on the 3D dice (null when none). */
export function diceTopFaces() { return diceObjs.filter((d) => d.visible).map((d) => faceUpOf(d.quaternion)); }

function skin(c) { return new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }); }
function makeHand() {
  const g = new THREE.Group(); g.visible = false; scene.add(g);
  const open = ready.get(modelUrl('life', 'hand')), fist = ready.get(modelUrl('life', 'hand_closed'));
  if (open && fist) {
    // glb: origin at the wrist, fingers +Z, palm −Y — same frame as the procedural hand; swap meshes to open/close
    const o = open.clone(true), c = fist.clone(true); const S = 1.25; o.scale.setScalar(S); c.scale.setScalar(S);
    o.position.z = c.position.z = -0.55; o.visible = false; g.add(o, c); handGLB = { open: o, fist: c };
    return g;
  }
  const sk = skin('#f1c9a5'), sl = skin('#2f6fdb');
  const palm = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.32, 1.05), sk); palm.castShadow = true; g.add(palm);
  palm.geometry.translate(0, 0, 0);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 1.1, 14), sl); cuff.rotation.x = Math.PI / 2; cuff.position.z = -1.05; cuff.castShadow = true; g.add(cuff);
  const fg = new THREE.CapsuleGeometry(0.11, 0.55, 4, 8);
  [-0.36, -0.12, 0.12, 0.36].forEach((x, i) => {
    const pivot = new THREE.Group(); pivot.position.set(x, -0.02, 0.5); g.add(pivot);
    const f = new THREE.Mesh(fg, sk); f.rotation.x = Math.PI / 2; f.position.z = 0.33 - (i === 0 || i === 3 ? 0.06 : 0); f.castShadow = true; pivot.add(f);
    handFingers.push(pivot);
  });
  const tp = new THREE.Group(); tp.position.set(0.55, -0.02, 0.05); tp.rotation.y = -0.7; g.add(tp);
  const th = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.38, 4, 8), sk); th.rotation.x = Math.PI / 2; th.position.z = 0.25; th.castShadow = true; tp.add(th);
  handFingers.push(tp);
  return g;
}
function curl(k) {
  if (handGLB) { handGLB.fist.visible = k > 0.5; handGLB.open.visible = k <= 0.5; return; }
  handFingers.forEach((f, i) => { f.rotation.x = (i === 4 ? 0.6 : 1.25) * k; });
}
/** T5 CR-05: the dice/hand GLBs live in assets/life/ — not in the boot path either. preloadDice() requests nothing; the first
 * hold/throw starts the download (that throw uses the procedural die and hand) and later throws use the GLBs. */
export async function preloadDice(onProgress) {
  try { if (onProgress) onProgress(1, { done: 0, total: 0, failed: 0 }); } catch (e) { console.error(e); }
}
let diceReq = false, diceStale = false;
function ensureDiceModels() {
  if (diceReq) return; diceReq = true;
  Promise.all(['hand', 'hand_closed', 'die'].map((n) => loadGLB(modelUrl('life', n)).catch(() => null))).then((r) => { if (r.some(Boolean)) diceStale = true; });
}
/** rebuild dice + hand from the GLBs once they arrived (never while they are on screen) */
function refreshDice() {
  if (!diceStale || holding || diceObjs.some((d) => d.visible) || (hand && hand.visible)) return;
  diceStale = false;
  const glbDie = ready.has(modelUrl('life', 'die'));
  for (const d of diceObjs) scene.remove(d); diceObjs = [];
  if (glbDie && dieGeo) { dieGeo.dispose(); for (const m of dieMats) { m.map && m.map.dispose(); m.dispose(); } dieGeo = null; dieMats = null; } // procedural die no longer used (CR-17)
  if (hand) { scene.remove(hand); if (!handGLB) disposeTree(hand); hand = null; handFingers = []; handGLB = false; }
}

function throwFrame() {
  const P = pawn ? pawn.position.clone() : new THREE.Vector3();
  const inward = new THREE.Vector3(-P.x, 0, -P.z); if (inward.lengthSq() < 0.01) inward.set(0, 0, -1); inward.normalize();
  const side = new THREE.Vector3(inward.z, 0, -inward.x);
  const land = P.clone().addScaledVector(inward, 2.0); land.y = 0.12 + DIE / 2;
  const start = land.clone().addScaledVector(inward, -3.2).add(new THREE.Vector3(0, 3.3, 0));
  return { P, inward, side, land, start };
}
function placeHand(f, t, shake = 0) {
  if (!hand) hand = makeHand();
  hand.visible = true;
  const pos = f.start.clone().add(new THREE.Vector3(0, 0.55, 0)).addScaledVector(f.inward, -0.35);
  hand.position.copy(pos);
  hand.position.x += Math.sin(t * 38) * shake * 0.18; hand.position.y += Math.cos(t * 31) * shake * 0.12;
  hand.lookAt(pos.clone().add(f.inward)); hand.rotateX(0.55 + Math.sin(t * 30) * shake * 0.15);
}
function diceInHand(f, t) {
  diceObjs.forEach((d, i) => {
    d.visible = true; d.scale.setScalar(1);
    d.position.copy(f.start).addScaledVector(f.side, (i - (diceObjs.length - 1) / 2) * 0.38);
    d.position.y -= 0.05; d.rotation.set(t * 9 + i, t * 7 + i * 2, t * 5);
  });
}
/** Touch/mouse hold: the hand comes in and shakes the dice until throwDice() is called. */
export function holdDice(count = 2) {
  if (holding || reduced) return;
  ensureDiceModels(); refreshDice();
  holding = true; holdT0 = performance.now();
  while (diceObjs.length < count) diceObjs.push(makeDie());
  clearTimeout(diceHideT);
  const f = throwFrame(); focusOn(f.land);
  const step = () => {
    if (!holding) return;
    const t = (performance.now() - holdT0) / 1000;
    placeHand(f, t, 1); curl(1); diceInHand(f, t);
    wake(300); requestAnimationFrame(step);
  };
  step();
}
export function cancelHold() { holding = false; if (hand) hand.visible = false; diceObjs.forEach((d) => { d.visible = false; }); invalidate(); }

/**
 * Throw dice that land showing exactly `faces` (array of 1..6). opts {held, onBounce(i), turbo}. Resolves when settled.
 */
export async function throwDice(faces, opts = {}) {
  faces = (faces || []).map((n) => Math.max(1, Math.min(6, n | 0)));
  turnMs = 0; ensureDiceModels(); refreshDice();
  while (diceObjs.length < faces.length) diceObjs.push(makeDie());
  diceObjs.forEach((d, i) => { d.visible = i < faces.length; });
  const dice = diceObjs.slice(0, faces.length);
  clearTimeout(diceHideT);
  const f = throwFrame(); focusOn(f.land);
  const wasHeld = holding; holding = false;
  if (reduced) { // T5 §7.2: no hand; the dice appear already showing their faces (150 ms), stay 600 ms, then hide
    if (hand) hand.visible = false;
    dice.forEach((d, i) => { d.visible = true; d.quaternion.copy(faceUpQuat(faces[i], Math.atan2(f.inward.x, f.inward.z))); d.position.copy(f.land).addScaledVector(f.side, (i - (dice.length - 1) / 2) * (DIE * 1.45)); d.position.y = DIE / 2 + 0.12; d.scale.setScalar(0.01); });
    if (opts.onBounce) { try { opts.onBounce(1); } catch (e) { console.error(e); } }
    await tween(150, (p) => dice.forEach((d) => d.scale.setScalar(Math.max(0.01, p))), 'dice');
    prefetchLifeIdle();
    invalidate(); clearTimeout(diceHideT); diceHideT = setTimeout(() => { dice.forEach((d) => { d.visible = false; d.scale.setScalar(1); }); invalidate(); }, 600);
    return faces;
  }
  // 1) the hand swoops in (skipped when the player was already holding) and shakes — total throw ≤ 1200 ms (T5 §4.3)
  if (!wasHeld) {
    const from = f.start.clone().add(new THREE.Vector3(0, 5, 0)).addScaledVector(f.inward, -5);
    await tween(D(180), (p) => { placeHand(f, p, 0); curl(1); const e = 1 - Math.pow(1 - p, 3); hand.position.lerpVectors(from, hand.position, e); diceInHand(f, p); hand.visible = true; }, 'dice');
    await tween(D(opts.held ? 80 : 220), (p) => { placeHand(f, p * 2, 1); curl(1); diceInHand(f, p * 2); }, 'dice');
  }
  // 2) release: fingers open, dice fly in an arc, bounce twice and roll to their faces
  const yaw = () => (Math.random() - 0.5) * 0.9;
  const finals = dice.map((d, i) => ({
    q: faceUpQuat(faces[i], Math.atan2(f.inward.x, f.inward.z) + yaw()),
    land: f.land.clone().addScaledVector(f.side, (i - (dice.length - 1) / 2) * (DIE * 1.45)).addScaledVector(f.inward, (Math.random() - 0.5) * 0.35),
    from: dice[i].position.clone(),
    ax: new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize(),
    spin: Math.PI * (4 + Math.floor(Math.random() * 3)) + Math.random(),
    q0: dice[i].quaternion.clone(),
  }));
  const T = D(800);
  const handFrom = hand ? hand.position.clone() : null;
  let bounced = [0, 0];
  const yAt = (u, h0) => {
    // flight 0..0.5 (parabola from start height to floor), bounce 0.5..0.72 (h .42), bounce 0.72..0.88 (h .12), settle
    const fl = DIE / 2 + 0.12;
    if (u < 0.5) { const t = u / 0.5; return h0 + (fl - h0) * t + Math.sin(t * Math.PI) * 0.9; }
    if (u < 0.72) { const t = (u - 0.5) / 0.22; return fl + Math.sin(t * Math.PI) * 0.42; }
    if (u < 0.88) { const t = (u - 0.72) / 0.16; return fl + Math.sin(t * Math.PI) * 0.12; }
    return fl;
  };
  await tween(T, (u) => {
    if (hand) { curl(Math.max(0, 1 - u * 5)); hand.position.lerpVectors(handFrom, handFrom.clone().add(new THREE.Vector3(0, 3.5, 0)).addScaledVector(f.inward, -4), Math.min(1, u * 1.6)); if (u > 0.6) hand.visible = false; }
    dice.forEach((d, i) => {
      const F = finals[i];
      const ex = 1 - Math.pow(1 - Math.min(1, u / 0.95), 2.2); // horizontal: fast then slow (roll out)
      d.position.lerpVectors(F.from, F.land, ex);
      d.position.y = yAt(u, F.from.y);
      // rotation decays to exactly the final quaternion (angle → 0 at u = 1)
      const left = Math.pow(1 - u, 1.7) * F.spin;
      d.quaternion.copy(F.q).multiply(new THREE.Quaternion().setFromAxisAngle(F.ax, left));
    });
    const hit = u >= 0.5 ? (u >= 0.72 ? 2 : 1) : 0;
    if (hit > bounced[0]) { bounced[0] = hit; if (opts.onBounce) opts.onBounce(hit); if (hit === 1) shake(0.12, 220); }
  }, 'dice');
  dice.forEach((d, i) => { d.quaternion.copy(finals[i].q); d.position.copy(finals[i].land); d.position.y = DIE / 2 + 0.12; });
  if (hand) hand.visible = false;
  if (faces.length === 2 && faces[0] === faces[1]) {
    const mid = finals[0].land.clone().lerp(finals[1].land, 0.5);
    particlesAt(mid, nPart(14), { tex: star(), color: '#ffffff', size: 0.5, spread: 1.2, up: 2.2, dur: MOTION.sparkle, additive: true, y: 0.4 });
    showLabel('דאבל!', 'gold', mid.clone().add(new THREE.Vector3(0, 1.6, 0)), { w: 4, h: 0.5, rise: 1.2, dur: 1500 });
  }
  invalidate();
  diceHideT = setTimeout(() => hideDice(), 2600 * speed + 400);
  prefetchLifeIdle();   // after the first roll: the remaining life models, one by one at idle (m-9)
  return faces;
}
export function hideDice() {
  const ds = diceObjs.filter((d) => d.visible); if (!ds.length) return;
  tween(D(300), (p) => ds.forEach((d) => d.scale.setScalar(Math.max(0.001, 1 - p)))).then(() => ds.forEach((d) => { d.visible = false; d.scale.setScalar(1); }));
}
function particlesAt(pos, n, o) {
  const s0 = o.s0 || 1;
  const mat = new THREE.SpriteMaterial({ map: o.tex, color: o.color, transparent: true, depthWrite: false, blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const ps = [];
  for (let i = 0; i < n; i++) { const sp = new THREE.Sprite(mat); ps.push({ sp, a: Math.random() * 6.28, r: (0.3 + Math.random() * 0.9) * o.spread * s0, h: Math.random(), v: 0.6 + Math.random() * 0.8 }); sp.position.copy(pos); sp.scale.setScalar(o.size); fxGroup.add(sp); }
  return tween(D(o.dur), (p) => {
    for (const q of ps) {
      const rr = q.r * (0.3 + p * 0.9);
      q.sp.position.set(pos.x + Math.cos(q.a) * rr, pos.y + (o.y || 0) + q.h * 0.4 + p * o.up * q.v * s0, pos.z + Math.sin(q.a) * rr);
      q.sp.material.opacity = 1 - p;
      q.sp.scale.setScalar(o.size * (0.6 + p * 0.9) * (o.additive ? 0.7 + Math.sin((p * 10 + q.h * 6)) * 0.3 : 1));
    }
  }).then(() => { for (const q of ps) fxGroup.remove(q.sp); mat.dispose(); });
}

/* ============================================================ T5 §6.1: tap an asset → bus 'city:pick' + onPick callbacks */
const raycaster = new THREE.Raycaster(); raycaster.layers.set(1); // proxies live on layer 1: the camera (layer 0) never draws them
const ndc = new THREE.Vector2();
/** key of the city item under a screen point: raycast the proxies, else the nearest projected centre within 22 px (44 px target). */
export function pickAt(cx, cy) {
  try {
    if (!renderer || !city.size) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    // 1) the first pick proxy under the point (bounding box × 1.15, layer 1) — §6.1
    camera.updateMatrixWorld(); raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickGroup.children, false)[0];
    if (hit && hit.object.userData.key && city.has(hit.object.userData.key)) return hit.object.userData.key;
    // 2) the ray missed: the nearest projected centre within 22 px (small / far items still get a 44 px target)
    let best = null, bd = 22.5 * 22.5;
    for (const k of city.keys()) { const p = project(k); const d = (p.x - cx) ** 2 + (p.y - cy) ** 2; if (d <= bd) { bd = d; best = k; } }
    return best;
  } catch (e) { console.warn('[scene] pickAt', e); return null; }
}
/** wave 1 (B1 G5): index of the board tile under a screen point (raycast the instanced tile frames), else null. */
const tileRay = new THREE.Raycaster();
export function tileAt(cx, cy) {
  try {
    if (!renderer || !tileFrames) return null;
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    camera.updateMatrixWorld(); tileRay.setFromCamera(ndc, camera);
    const hit = tileRay.intersectObject(tileFrames, false)[0];
    return hit && hit.instanceId != null ? hit.instanceId : null;
  } catch (e) { console.warn('[scene] tileAt', e); return null; }
}
/** onTilePick(cb) → unsubscribe; cb(tileIndex, {x, y}) on a tap on a board tile that is not a city item (same tap rule as onPick). */
export function onTilePick(cb) { if (typeof cb !== 'function') return () => {}; tileCbs.add(cb); return () => tileCbs.delete(cb); }
function emitTile(i, x, y) {
  for (const f of [...tileCbs]) { try { f(i, { x, y }); } catch (e) { console.error(e); } }
  try { bus.emit('tile:pick', { index: i, x, y, source: '3d' }); } catch (e) { console.error(e); }
}
/** onPick(cb) → unsubscribe; cb(key, {x, y}) on a tap (one pointer, < 8 px, < 350 ms; drags/pinches/orbits never pick). */
export function onPick(cb) { if (typeof cb !== 'function') return () => {}; pickCbs.add(cb); return () => pickCbs.delete(cb); }
function emitPick(key, x, y) {
  for (const f of [...pickCbs]) { try { f(key, { x, y }); } catch (e) { console.error(e); } }
  try { bus.emit('city:pick', { key, x, y, source: '3d' }); } catch (e) { console.error(e); }
}
function initPick(canvas) {
  const down = new Map(); let multi = false, hoverRaf = 0, hx = 0, hy = 0;
  const fine = matchMedia('(pointer:fine)').matches;
  const on = (ev, f) => { canvas.addEventListener(ev, f, { passive: true }); onPtr.push([canvas, ev, f]); };
  on('pointerdown', (e) => { down.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() }); if (down.size > 1) multi = true; });
  on('pointerup', (e) => {
    const d = down.get(e.pointerId); down.delete(e.pointerId);
    const was = multi; if (!down.size) multi = false;
    if (!d || was || e.button > 0) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) >= 8 || performance.now() - d.t >= 350) return;
    const key = pickAt(e.clientX, e.clientY); if (key) { emitPick(key, e.clientX, e.clientY); return; }
    const t = tileAt(e.clientX, e.clientY); if (t != null) emitTile(t, e.clientX, e.clientY);
  });
  on('pointercancel', (e) => { down.delete(e.pointerId); if (!down.size) multi = false; });
  if (fine) on('pointermove', (e) => {
    if (down.size) return; hx = e.clientX; hy = e.clientY; if (hoverRaf) return;
    hoverRaf = requestAnimationFrame(() => {
      hoverRaf = 0; if (paused) return; const k = pickAt(hx, hy);
      if (k !== hoverKey) { hoverKey = k; syncKit(); }
      canvas.style.cursor = k || (tileCbs.size && tileAt(hx, hy) != null) ? 'pointer' : '';
    });
  });
}

/* ============================================================ T5 §8.5: measuring */
function texBytes() {
  const seen = new Set(); let b = 0;
  const add = (t) => { if (!t || seen.has(t)) return; seen.add(t); const im = t.image || {}; const w = im.width || (t.source && t.source.data && t.source.data.width) || 0, h = im.height || 0; b += w * h * 4 * (t.generateMipmaps !== false && !t.isRenderTargetTexture ? 1.33 : 1); };
  scene.traverse((o) => { for (const m of [].concat(o.material || [])) { if (!m) continue; for (const k of ['map', 'emissiveMap', 'normalMap', 'alphaMap', 'roughnessMap', 'metalnessMap']) add(m[k]); } });
  if (scene.environment) { const t = scene.environment; b += (t.image && t.image.width ? t.image.width * t.image.height * 8 : 0); }
  if (renderer.shadowMap.enabled) b += sun.shadow.mapSize.x * sun.shadow.mapSize.y * 4;
  return b;
}
/** perfStats() → {calls, triangles, geos, textures, texMB, dpr, tier, framesRendered, lastTurnMs, fps:{median,p95,samples}, programs, city} */
export function perfStats() {
  const r = renderer.info; const s = [...fpsBuf].sort((a, b) => a - b);
  const q = (f) => (s.length ? s[Math.min(s.length - 1, Math.floor(s.length * f))] : null);
  return { calls: r.render.calls, triangles: r.render.triangles, geos: r.memory.geometries, textures: r.memory.textures, texMB: +(texBytes() / 1048576).toFixed(1),
    dpr: renderer.getPixelRatio(), tier, lowPower, shadows: renderer.shadowMap.enabled, antialias: !!renderer.getContextAttributes()?.antialias, framesRendered, lastTurnMs: Math.round(turnMs),
    fps: { median: q(0.5) ? +(1000 / q(0.5)).toFixed(1) : null, p95: q(0.95) ? +q(0.95).toFixed(1) : null, samples: s.length }, programs: (r.programs || []).length, city: city.size,
    paused, hidden: pageHidden, reduced, damping: !!(controls && controls.enableDamping), shaking: performance.now() < shakeUntil, fx: fxGroup.children.length,
    kit: kit ? { ...Object.fromEntries(Object.entries(kit.meshes).map(([k, m]) => [k, m.visible ? m.count : 0])), sprites: kit.group.children.filter((o) => o.isSprite).length, rimColor: '#' + kit.meshes.rim.material.color.getHexString() } : null,
    shader: { checked: flatChecked, ok: flatOk }, glb: [...ready.keys()] };
}
function perfOverlay() {
  perfEl = document.createElement('div'); perfEl.setAttribute('aria-hidden', 'true');
  perfEl.style.cssText = 'position:fixed;top:4px;inset-inline-start:4px;z-index:200;background:rgba(0,0,0,.72);color:#fff;font:12px/1.35 monospace;padding:4px 6px;border-radius:6px;pointer-events:none;direction:ltr;white-space:pre';
  document.body.appendChild(perfEl);
  perfTimer = setInterval(() => { try { const p = perfStats(); perfEl.textContent = `${p.tier} dpr ${p.dpr} calls ${p.calls} tris ${p.triangles}\ntex ${p.texMB}MB geo ${p.geos} frames ${p.framesRendered}\nfps ${p.fps.median} p95 ${p.fps.p95}ms turn ${p.lastTurnMs}`; } catch (e) { /* ignore */ } }, 1000);
  // governor test hook (?perf=1 only): feed fake active-frame deltas
  window.__rrPerfInject = (ms = 50, n = 90) => { const t = performance.now(); for (let i = 0; i < n; i++) govern(ms, t + i); return tier; };
  window.__rrPerfRun = perfRun;
}
/** scripted 10 s run (?perf=1): overview + 360° orbit, the 24-item mixed-level city, one level-up, one purchase → fps stats */
export async function perfRun(ms = 10000) {
  const was = camMode; setCameraMode('overview'); fpsBuf = [];
  const keep = [...city.keys()];
  const lv = fixtureLevels(24); const models = Object.values((world && world.models) || {}).filter(Boolean);
  lv.forEach((level, i) => spawn('perf' + i, models[i % models.length] || 'business', { silent: true, level }));
  const t0 = performance.now(); const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target));
  let lvUp = false, buy = false;
  await tween(ms, (p) => {
    sph.theta += 0.02; camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sph)); camera.lookAt(controls.target);
    if (!lvUp && p > 0.3) { lvUp = true; setLevel('perf0', { kind: 'biz', n: 1, type: 'coffee' }, { animate: true }); }
    if (!buy && p > 0.6) { buy = true; spawn('perfBuy', models[0] || 'business', { label: '-₪1', color: 'red' }); }
  });
  const out = perfStats();
  for (const k of [...city.keys()]) if (!keep.includes(k)) { dropObj(city.get(k).obj); city.delete(k); }
  relayout(false); setCameraMode(was);
  return { ms: Math.round(performance.now() - t0), ...out.fps, calls: out.calls, tier: out.tier };
}
/* ---------- review M-2: one guarded check of the shared flatten shader, after its link has finished (no boot-path wait) */
let flatChecked = false, flatOk = null;
function checkFlatShader() {
  if (flatChecked || !renderer) return;
  try {
    const gl = renderer.getContext(); const progs = (renderer.info.programs || []).filter((p) => String(p.cacheKey || '').includes(FLAT_KEY));
    if (!progs.length) return;                       // no flattened model drawn yet: try again on a later frame
    flatChecked = true;
    const bad = progs.filter((p) => p.program && gl.getProgramParameter(p.program, gl.LINK_STATUS) === false);
    flatOk = !bad.length;
    if (bad.length) {
      console.error('[render] the flattened-model shader failed to link; falling back to plain materials', gl.getProgramInfoLog(bad[0].program));
      try { (window.__rrErrors = window.__rrErrors || []).push({ msg: 'flat_shader_link', where: 'scene', at: Date.now() }); } catch (e) { /* ignore */ }
      flatFallback(); invalidate();
    }
  } catch (e) { console.warn('[render] shader check', e); }
}
/** debug / tests: the shader check state; `fail` simulates a link failure (the fallback path) */
export function shaderCheck({ fail = false } = {}) { if (fail) { flatChecked = true; flatOk = false; flatFallback(); invalidate(); } return { checked: flatChecked, ok: flatOk }; }
/** debug / tests (outside SCENE_API): pick-proxy screen rects {key: [x0, y0, x1, y1]} and a board tile's screen point */
export function pickRects() {
  const out = {}; const r = renderer.domElement.getBoundingClientRect(); const v = new THREE.Vector3(); camera.updateMatrixWorld();
  for (const px of pickGroup.children) {
    if (!city.has(px.userData.key)) continue; let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const sx of [-0.5, 0.5]) for (const sy of [-0.5, 0.5]) for (const sz of [-0.5, 0.5]) { v.set(sx, sy, sz).applyMatrix4(px.matrixWorld).project(camera); const X = r.left + ((v.x + 1) / 2) * r.width, Y = r.top + ((1 - v.y) / 2) * r.height; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    out[px.userData.key] = [x0, y0, x1, y1];
  }
  return out;
}
export function itemPose(key) { const it = city.get(key); if (!it) return null; const o = it.obj; return { y: +o.position.y.toFixed(3), s: +o.scale.x.toFixed(3), rest: +sOf(it).toFixed(3), restY: CITY_Y, fallback: !!o.userData.fallbackOf, inScene: o.parent === cityGroup }; }
export function projectTile(i) { const p = tilePos(i); p.project(camera); const r = renderer.domElement.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; }
/** debug (outside SCENE_API): approximate draw calls per group — visible renderables inside the camera frustum */
export function perfBreakdown() {
  const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const groups = { world: worldGroup, city: cityGroup, fx: fxGroup, kit: kit && kit.group, labels: labelGroup, other: null }; const out = {};
  const seen = new Set();
  for (const [k, g] of Object.entries(groups)) {
    if (!g) continue; let n = 0; const names = {};
    g.traverseVisible((o) => { if (!(o.isMesh || o.isSprite || o.isPoints)) return; seen.add(o); if (o.frustumCulled && !o.isInstancedMesh && !fr.intersectsObject(o)) return; const c = Array.isArray(o.material) ? o.material.length : 1; n += c; const nm = (o.name || o.parent?.name || o.type).slice(0, 24); names[nm] = (names[nm] || 0) + c; });
    out[k] = { n, top: Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 8) };
  }
  let other = 0; scene.traverseVisible((o) => { if ((o.isMesh || o.isSprite || o.isPoints) && !seen.has(o)) other++; }); out.other = other;
  return out;
}
