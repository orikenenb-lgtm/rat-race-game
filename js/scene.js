// מירוץ העכברים 2.0 — three.js scene: per-world board + decor, landmarks, the growing city, the pawn and all the juice
// (drops, dust, labels, sparkles, confetti, shake, launches). No game rules here — game.js tells us what to show.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

let renderer, scene, camera, controls, hemi, sun, fill;
let worldGroup, cityGroup, fxGroup, pawn = null, pawnRing = null, pawnKey = '';
let world = null, theme = null;
let speed = 1;
let hopping = false;
let shakeUntil = 0, shakeDur = 1, shakeAmp = 0;
let viewRect = null;
let centerMat = null;
const tweens = [];
const updaters = new Set();
const disposables = [];
export let lowPower = false;

const loader = new GLTFLoader();
const cache = new Map();   // url -> Promise<Group>
const ready = new Map();   // url -> Group (loaded)

/** Animation speed factor: 1 normal, 0.5 = turbo (durations are multiplied by it). */
export function setSpeed(f) { speed = f; }
const D = (ms) => Math.max(1, ms * speed);

/* ============================================================ setup */
export async function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rn = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
    lowPower = /swiftshader|llvmpipe|software|basic render/i.test(rn);
  } catch (e) { /* ignore */ }
  if (/[?&]hq\b/.test(location.search)) lowPower = false;
  const coarse = matchMedia('(pointer:coarse)').matches;
  renderer.setPixelRatio(lowPower ? 0.6 : Math.min(devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = lowPower ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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
  sun.position.set(12, 22, 9); sun.castShadow = true;
  const sm = lowPower ? 1024 : coarse ? 1536 : 2048;
  sun.shadow.mapSize.set(sm, sm);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 70 });
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  fill = new THREE.PointLight(0xffffff, 0, 40, 1.6); fill.position.set(0, 6, 0); scene.add(fill);

  worldGroup = new THREE.Group(); cityGroup = new THREE.Group(); fxGroup = new THREE.Group();
  scene.add(worldGroup, cityGroup, fxGroup);

  addEventListener('resize', () => { resize(); invalidate(); });
  resize();
  controls.addEventListener('start', () => { interacting = true; wake(); });
  controls.addEventListener('end', () => { interacting = false; wake(1500); });
  controls.addEventListener('change', () => wake(600));
  let last = performance.now();
  renderer.setAnimationLoop((now) => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    // render on demand: full speed while something moves; frozen (≤ 1 frame / 2 s) when idle; nothing under the lobby
    const active = interacting || tweens.length > 0 || now < shakeUntil || now < activeUntil;
    if (paused && !dirty) return;
    if (!active && !dirty && now - lastRender < 2000) return;
    dirty = false; lastRender = now;
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i]; const p = Math.min(1, (now - tw.t0) / tw.dur);
      try { tw.fn(p); } catch (e) { console.error(e); }
      if (p >= 1) { tweens.splice(i, 1); tw.res(); }
    }
    if (active) {
      simT += dt;
      for (const f of updaters) { try { f(simT, dt); } catch (e) { console.error(e); updaters.delete(f); } }
      if (pawn && !hopping) pawn.rotation.y += 0.6 * dt;
      if (pawnRing) pawnRing.rotation.z += dt * 0.8;
    }
    if (pawn && pawnRing) { pawnRing.position.x = pawn.position.x; pawnRing.position.z = pawn.position.z; }
    controls.update();
    let off = null;
    if (now < shakeUntil) {
      const k = (shakeUntil - now) / shakeDur;
      off = new THREE.Vector3(Math.random() - 0.5, (Math.random() - 0.5) * 0.6, Math.random() - 0.5).multiplyScalar(shakeAmp * k);
      camera.position.add(off);
    }
    renderer.render(scene, camera);
    if (off) camera.position.sub(off);
  });
}

/* ---------- render on demand */
let activeUntil = 0, lastRender = 0, dirty = true, paused = false, interacting = false, simT = 0;
/** Keep animating (decor, idle pawn spin) for `ms` more milliseconds. */
export function wake(ms = 4000) { activeUntil = Math.max(activeUntil, performance.now() + ms); }
/** Render one frame at the next tick even when idle or paused (geometry changed, canvas resized…). */
export function invalidate() { dirty = true; }
/** Pause all rendering (e.g. while the lobby covers the board). Tweens resume (and jump to their end) when unpaused. */
export function setPaused(b) { paused = !!b; if (!paused) { wake(); invalidate(); } }
export const isPaused = () => paused;

function tween(dur, fn, tag = null) { wake(dur + 1500); return new Promise((res) => tweens.push({ t0: performance.now(), dur: Math.max(1, dur), fn, res, tag })); }
/** Finish (resolve) and drop running tweens with a tag without applying their last frame. */
function cancelTweens(tag) { for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].tag === tag) { const tw = tweens[i]; tweens.splice(i, 1); tw.res(); } }
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
  camera.setViewOffset(W, H, offX, offY, W, H); camera.updateProjectionMatrix();
  camDist = dist;
  controls.target.copy(tgt);
  controls.maxDistance = Math.max(40, dist * 1.7);
  controls.minDistance = Math.min(9, dist * 0.5);
  if (!celebrating) camera.position.copy(tgt).addScaledVector(dir, dist);
  if (scene.fog) { scene.fog.near = dist * 1.25; scene.fog.far = dist * 3.4; }
  controls.update();
}
let celebrating = false;
export function resetCamera() { celebrating = false; controls.enabled = true; resize(); }

/* ============================================================ models */
export const modelUrl = (dir, name) => `assets/${dir}/${name}.glb`;
function loadGLB(url) {
  if (!cache.has(url)) {
    cache.set(url, loader.loadAsync(url).then((g) => {
      const s = g.scene;
      s.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = !(o.material && o.material.transparent);
          o.receiveShadow = true;
        }
      });
      ready.set(url, s);
      return s;
    }));
  }
  return cache.get(url);
}
/** Names of every model a world needs (landmarks, city kinds, holdings, decor). */
export function worldModelNames(w) {
  const set = new Set(landmarkNames(w));
  for (const m of Object.values(w.models || {})) if (m) set.add(m);
  for (const t of Object.values(w.tickers || {})) if (t.model) set.add(t.model);
  const dm = DECOR_MODEL[w.theme.decor]; if (dm) set.add(dm);
  return [...set];
}
const DECOR_MODEL = { skyline: 'skyline', sea: 'crane', stars: 'turbine' };
function landmarkNames(w) {
  const list = [];
  for (const m of Object.values(w.models || {})) if (m && !list.includes(m)) list.push(m);
  for (const t of Object.values(w.tickers || {})) if (t.model && !list.includes(t.model)) list.push(t.model);
  return list.slice(0, 4);
}
export function worldLoaded(w) { return worldModelNames(w).every((n) => ready.has(modelUrl(w.id, n))); }
export async function preloadWorld(w, onProgress) {
  const names = worldModelNames(w);
  let done = 0;
  await Promise.all(names.map((n) => loadGLB(modelUrl(w.id, n))
    .catch((e) => { console.warn('model failed', n, e); return null; })
    .finally(() => { done++; if (onProgress) onProgress(done / names.length); })));
}
function inst(name, dir = world && world.id) {
  const g = ready.get(modelUrl(dir, name));
  if (g) return g.clone(true);
  // placeholder so a missing model never breaks the game
  const grp = new THREE.Group();
  const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.4, 1.6), new THREE.MeshStandardMaterial({ color: (theme && theme.accent) || '#f2b632', roughness: 0.6 }));
  m.position.y = 0.7; m.castShadow = true; grp.add(m);
  return grp;
}

/* ============================================================ board geometry */
const SZ = 2.25;
let boardN = 24;
export function tilePos(i) {
  const n = boardN, side = n / 4;
  i = ((i % n) + n) % n;
  let gx, gz;
  if (i <= side) { gx = side - i; gz = side; } else if (i <= 2 * side) { gx = 0; gz = side - (i - side); } else if (i <= 3 * side) { gx = i - 2 * side; gz = 0; } else { gx = side; gz = i - 3 * side; }
  return new THREE.Vector3((gx - side / 2) * SZ, 0.26, (gz - side / 2) * SZ);
}
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
    default: P(); g.moveTo(x - 34, y - 34); g.lineTo(x + 34, y + 34); g.moveTo(x + 34, y - 34); g.lineTo(x - 34, y + 34); g.stroke();
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
  const name = tile.name || '';
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
function drawCenter(n) {
  if (!centerMat || !theme) return;
  const cv = mkCanvas(1024), g = cv.getContext('2d');
  const dark = lum(theme.center) < 0.35;
  g.fillStyle = theme.center; g.fillRect(0, 0, 1024, 1024);
  // soft vignette
  const rg = g.createRadialGradient(512, 512, 120, 512, 512, 720); rg.addColorStop(0, dark ? 'rgba(255,255,255,.05)' : 'rgba(255,255,255,.25)'); rg.addColorStop(1, 'rgba(0,0,0,.06)');
  g.fillStyle = rg; g.fillRect(0, 0, 1024, 1024);
  g.strokeStyle = dark ? 'rgba(160,190,255,.22)' : shade(theme.center, -0.12); g.lineWidth = 5; g.setLineDash([20, 14]);
  const cell = 984 / n;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) g.strokeRect(20 + c * cell + 8, 20 + r * cell + 8, cell - 16, cell - 16);
  g.setLineDash([]);
  g.fillStyle = dark ? 'rgba(200,220,255,.16)' : 'rgba(110,80,40,.2)';
  g.font = '800 92px Rubik'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
  g.fillText(CAPTION[world.id] || 'התיק שלך', 512, 512);
  const old = centerMat.map;
  centerMat.map = canvasTex(cv); centerMat.needsUpdate = true;
  if (old) old.dispose();
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
    }
  });
  worldGroup.clear();
  for (const t of disposables.splice(0)) t.dispose();
  centerMat = null;
}
function own(mesh) { mesh.userData.ownGeo = true; mesh.userData.ownMat = true; return mesh; }
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.8, ...o });

/** Build the whole board + decor for a world (models must be preloaded). */
export function buildWorld(w) {
  clearWorld(); clearCity();
  world = w; theme = w.theme; boardN = w.board.length;
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
  const base = own(new THREE.Mesh(new THREE.BoxGeometry(22, 0.7, 22), std(T.boardEdge, { roughness: T.planks ? 0.85 : 0.65 })));
  base.position.y = -0.35; base.castShadow = true; base.receiveShadow = true; worldGroup.add(base);
  const topMat = T.planks ? std('#ffffff', { map: plankTexture(T.board), roughness: 0.9 })
    : glass ? std(T.board, { roughness: 0.18, metalness: 0.08 })
    : std(T.board, { roughness: dark ? 0.55 : 0.9 });
  const top = own(new THREE.Mesh(new THREE.BoxGeometry(21, 0.1, 21), topMat));
  top.position.y = 0.05; top.receiveShadow = true; worldGroup.add(top);
  // centre
  centerMat = std('#ffffff', { roughness: glass ? 0.3 : 0.95 });
  const cm = own(new THREE.Mesh(new THREE.PlaneGeometry(10.6, 10.6), centerMat));
  cm.rotation.x = -Math.PI / 2; cm.position.y = 0.102; cm.receiveShadow = true; worldGroup.add(cm);
  drawCenter(gridN);
  // tiles
  const frame = T.planks ? shade(T.board, 0.35) : dark ? shade(T.board, -0.25) : glass ? '#f6f9ff' : shade(T.board, 0.45);
  const tGeo = new THREE.BoxGeometry(2.12, 0.16, 2.12), pGeo = new THREE.PlaneGeometry(2.04, 2.04);
  const tMat = std(frame, { roughness: glass ? 0.25 : 0.85 });
  const emissive = T.neon ? 0.42 : glass ? 0.22 : 0;
  const mats = {};
  disposables.push(tGeo, pGeo, tMat, { dispose() { Object.values(mats).forEach((m) => m.dispose()); } });
  for (let i = 0; i < boardN; i++) {
    const ch = w.board[i]; const tile = w.tiles[ch];
    if (!mats[ch]) {
      const tex = tileTexture(tile, frame);
      mats[ch] = std('#ffffff', { map: tex, roughness: glass ? 0.3 : 0.7, ...(emissive ? { emissive: '#ffffff', emissiveMap: tex, emissiveIntensity: emissive } : {}) });
    }
    const g = new THREE.Group(); const p = tilePos(i); g.position.set(p.x, 0.18, p.z); g.rotation.y = tileRot(i);
    const b = new THREE.Mesh(tGeo, tMat); b.castShadow = false; b.receiveShadow = true; g.add(b);
    const f = new THREE.Mesh(pGeo, mats[ch]); f.rotation.x = -Math.PI / 2; f.position.y = 0.084; f.receiveShadow = true; g.add(f);
    worldGroup.add(g);
  }
  // neon trims (dusk / night worlds)
  if (T.neon || T.aurora) neonTrim(T);
  // landmarks on the four board corners
  const lm = landmarkNames(w);
  [[-1, 1], [-1, -1], [1, -1], [1, 1]].forEach(([sx, sz], k) => {
    const name = lm[k % lm.length]; if (!name) return;
    const m = inst(name); m.position.set(sx * 9.3, 0.1, sz * 9.3); m.scale.setScalar(0.95);
    m.lookAt(sx * 3, 0.1, 40);
    worldGroup.add(m);
  });
  // decor
  ({ trees: decorTrees, skyline: decorSkyline, sea: decorSea, stars: decorStars }[T.decor] || decorTrees)(T);
  resize(); invalidate(); wake(1500);
}

function neonTrim(T) {
  const a = new THREE.MeshStandardMaterial({ color: '#000000', emissive: T.accent || '#ff4fd8', emissiveIntensity: 2.4 });
  const b = new THREE.MeshStandardMaterial({ color: '#000000', emissive: T.accent2 || '#22d3ee', emissiveIntensity: 2.2 });
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.userData.ownGeo = true; worldGroup.add(m); };
  const gx = new THREE.BoxGeometry(21.1, 0.06, 0.1), gz = new THREE.BoxGeometry(0.1, 0.06, 21.1);
  add(gx, a, 0, 0.13, 10.5); add(gx, a, 0, 0.13, -10.5); add(gz, a, 10.5, 0.13, 0); add(gz, a, -10.5, 0.13, 0);
  const sx = new THREE.BoxGeometry(22.1, 0.08, 0.06), sz = new THREE.BoxGeometry(0.06, 0.08, 22.1);
  add(sx, b, 0, -0.42, 11.02); add(sx, b, 0, -0.42, -11.02); add(sz, b, 11.02, -0.42, 0); add(sz, b, -11.02, -0.42, 0);
  const ix = new THREE.BoxGeometry(10.9, 0.04, 0.06), iz = new THREE.BoxGeometry(0.06, 0.04, 10.9);
  add(ix, b, 0, 0.12, 5.42); add(ix, b, 0, 0.12, -5.42); add(iz, b, 5.42, 0.12, 0); add(iz, b, -5.42, 0.12, 0);
  disposables.push({ dispose() { a.dispose(); b.dispose(); } });
}

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
  const pts = scatter(lowPower ? 40 : 58, 15.5, 31, { seed: 11 });
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
  const bushes = scatter(34, 14.4, 15.4, { seed: 5 });
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
  const pts = scatter(lowPower ? 12 : 16, 21, 31.5, { backOnly: true, seed: 3 });
  pts.forEach((p) => {
    const m = inst('skyline'); const s = 2.4 + p.k * 1.8;
    m.position.set(p.x, -0.72, p.z); m.scale.setScalar(s); m.rotation.y = Math.atan2(-p.x, -p.z) + Math.PI + (p.k - 0.5) * 0.6;
    m.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
    worldGroup.add(m);
  });
  // side blocks, smaller
  scatter(8, 19, 30, { seed: 9 }).filter((p) => p.z < 8).forEach((p) => {
    const m = inst('skyline'); m.position.set(p.x, -0.72, p.z); m.scale.setScalar(1.5 + p.k * 0.5); m.rotation.y = p.a; worldGroup.add(m);
  });
  disposables.push(glowMat);
}

function decorSea(T) {
  const W = lowPower ? 44 : 72;
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
  const gulls = [0, 1, 2].map(() => { const s = new THREE.Sprite(gm); s.scale.set(0.5, 0.2, 1); worldGroup.add(s); return s; });
  updaters.add((t) => gulls.forEach((g, i) => { const a = t * 0.25 + i * 2.1; g.position.set(Math.sin(a) * (16 + i * 3), 9 + i * 1.5 + Math.sin(t * 2 + i), Math.cos(a) * (14 + i * 2) - 4); }));
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
  const n = 2200, arr = new Float32Array(n * 3), colors = new Float32Array(n * 3);
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
  scatter(lowPower ? 6 : 9, 21, 31.5, { backOnly: true, seed: 21 }).forEach((p) => {
    const m = inst('turbine'); const s = 2.2 + p.k * 1.3; m.position.set(p.x, -0.72, p.z); m.scale.setScalar(s); m.rotation.y = Math.atan2(p.x, p.z) + Math.PI;
    m.traverse((o) => { if (o.isMesh) o.castShadow = false; }); worldGroup.add(m);
  });
  // floating light motes
  const mm = new THREE.SpriteMaterial({ map: soft(), color: T.accent2 || '#a78bfa', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.7 });
  const motes = Array.from({ length: 14 }, (_, i) => { const s = new THREE.Sprite(mm); s.scale.setScalar(0.5); worldGroup.add(s); return { s, a: i * 0.45, r: 12 + (i % 4) * 2.5, h: 1.5 + (i % 5) }; });
  updaters.add((t) => motes.forEach((m) => { const a = m.a + t * 0.07; m.s.position.set(Math.sin(a) * m.r, m.h + Math.sin(t + m.a * 3) * 0.6, Math.cos(a) * m.r); }));
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
  } else pawnRing.material.color.set(color);
}
export function placePawn(i) { cancelTweens('hop'); hopping = false; if (pawn) { pawn.position.copy(tilePos(i)); pawn.scale.setScalar(1.7); } invalidate(); }
/** One hop from tile `from` to tile `to`. last=true adds a squash on landing. */
export async function hop(from, to, last = false) {
  if (!pawn) return;
  const a = tilePos(from), b = tilePos(to);
  hopping = true;
  pawn.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
  await tween(D(190), (p) => {
    if (!pawn) return;
    pawn.position.lerpVectors(a, b, p); pawn.position.y = a.y + Math.sin(p * Math.PI) * 0.85;
    const k = Math.sin(p * Math.PI); pawn.scale.set(1.7 * (1 - k * 0.04), 1.7 * (1 + k * 0.1), 1.7 * (1 - k * 0.04));
  }, 'hop');
  if (last) await tween(D(110), (p) => { const k = Math.sin(p * Math.PI) * 0.14; pawn.scale.set(1.7 * (1 + k), 1.7 * (1 - k), 1.7 * (1 + k)); }, 'hop');
  pawn.scale.setScalar(1.7);
  hopping = false;
}

/* ============================================================ the city (bought assets) */
const city = new Map(); // key -> {obj, slot, model}
let gridN = 4;
const slotScale = (n) => (0.86 * 4) / n;
function slotXZ(idx, n) { const sp = 10 / n; const r = Math.floor(idx / n), c = idx % n; return [(c - (n - 1) / 2) * sp, (r - (n - 1) / 2) * sp]; }
function freeSlot() { const used = new Set([...city.values()].map((x) => x.slot)); let i = 0; while (used.has(i)) i++; return i; }
function relayout(animate = true) {
  const s = slotScale(gridN);
  // compact slots in current order so a bigger grid stays tidy
  const items = [...city.values()].sort((a, b) => a.slot - b.slot);
  items.forEach((it, i) => {
    it.slot = i; const [x, z] = slotXZ(i, gridN); const o = it.obj;
    if (!animate) { o.position.set(x, 0.1, z); o.scale.setScalar(s); return; }
    const p0 = o.position.clone(), s0 = o.scale.x;
    tween(D(500), (p) => { const e = easeInOut(p); o.position.set(p0.x + (x - p0.x) * e, 0.1, p0.z + (z - p0.z) * e); o.scale.setScalar(s0 + (s - s0) * e); });
  });
}
function ensureGrid(count, animate = true) {
  let n = 4; while (n * n < count && n < 8) n++;
  if (n !== gridN) { gridN = n; relayout(animate); drawCenter(n); }
}
export function clearCity() { for (const it of city.values()) cityGroup.remove(it.obj); city.clear(); fxGroup.clear(); if (gridN !== 4) { gridN = 4; drawCenter(4); } }
export function hasKey(key) { return city.has(key); }

/** Drop a model into the city. opts {label, color, golden, silent} */
export function spawn(key, model, opts = {}) {
  if (!key || city.has(key)) return;
  ensureGrid(city.size + 1, !opts.silent);
  const obj = inst(model);
  const slot = freeSlot(); const [x, z] = slotXZ(slot, gridN); const s = slotScale(gridN);
  obj.position.set(x, 0.1, z); obj.rotation.y = (Math.random() - 0.5) * 0.3;
  city.set(key, { obj, slot, model }); cityGroup.add(obj);
  if (opts.silent) { obj.scale.setScalar(s); invalidate(); return; }
  obj.position.y = 7; obj.scale.setScalar(s * 0.8);
  tween(D(720), (p) => { obj.position.y = 0.1 + (1 - easeOutBounce(p)) * 7; obj.scale.setScalar(s * (0.8 + 0.2 * Math.min(1, p * 1.6))); })
    .then(() => { dust(key); if (opts.label) floatLabel(opts.label, opts.color || 'green', key); if (opts.golden) sparkle(key); });
}
/** Shrink a model away. */
export function despawn(key) {
  const it = city.get(key); if (!it) return;
  city.delete(key);
  const o = it.obj, s0 = o.scale.x;
  tween(D(380), (p) => { o.scale.setScalar(Math.max(0.001, s0 * (1 - p))); o.rotation.y += 0.08; }).then(() => cityGroup.remove(o));
}
/** Startup exit: success = rocket lifts off; fail = it topples into dust. */
export function launch(key, success) {
  const it = city.get(key); if (!it) return;
  city.delete(key);
  const o = it.obj, y0 = o.position.y, s0 = o.scale.x;
  dust(key, success ? '#f8fafc' : '#94a3b8', 16);
  if (success) {
    tween(D(1300), (p) => { o.position.y = y0 + p * p * 16; o.rotation.y += 0.05; o.position.x += Math.sin(p * 30) * 0.01; if (p > 0.7) o.scale.setScalar(s0 * (1 - (p - 0.7) / 0.3)); }).then(() => cityGroup.remove(o));
  } else {
    tween(D(800), (p) => { o.rotation.z = p * 1.3; o.position.y = y0 - p * 0.4; o.scale.setScalar(Math.max(0.001, s0 * (1 - p * p))); }).then(() => cityGroup.remove(o));
  }
}
/** Rebuild the city to match the engine's cityModels() list (resume). */
export function syncCity(list, { silent = true } = {}) {
  const want = new Set(list.map((m) => m.key));
  for (const k of [...city.keys()]) if (!want.has(k)) { cityGroup.remove(city.get(k).obj); city.delete(k); }
  ensureGrid(list.length, false);
  for (const m of list) if (!city.has(m.key)) spawn(m.key, m.model, { silent });
  relayout(false);
}
export function bump(key) {
  const it = city.get(key); if (!it) return;
  const o = it.obj, s0 = slotScale(gridN);
  tween(D(520), (p) => o.scale.setScalar(s0 * (1 + Math.sin(p * Math.PI) * 0.18)));
  sparkle(key, 14);
}
export function shield(keys) {
  for (const key of keys || []) {
    const it = city.get(key); if (!it) continue;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1.25, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#38bdf8', transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    m.position.copy(it.obj.position); m.scale.setScalar(0.01); fxGroup.add(m);
    const s = slotScale(gridN) * 1.25;
    tween(D(1700), (p) => { m.scale.setScalar(s * Math.min(1, p * 4)); m.material.opacity = p < 0.6 ? 0.35 : 0.35 * (1 - (p - 0.6) / 0.4); })
      .then(() => { fxGroup.remove(m); m.geometry.dispose(); m.material.dispose(); });
  }
}

/* ============================================================ effects */
const COLORS = { green: '#178a55', red: '#d23b30', blue: '#2f6fdb', gold: '#a8740a' };
function anchor(at) {
  if (at && at !== 'pawn' && city.has(at)) { const o = city.get(at).obj; return new THREE.Vector3(o.position.x, 0.1, o.position.z); }
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
export function floatLabel(text, color = 'green', at = 'pawn', { rise = 1.5, dur = 1900 } = {}) {
  if (!text) return;
  const col = COLORS[color] || color;
  const cv = mkCanvas(1024, 128), g = cv.getContext('2d');
  g.font = '800 64px Rubik'; g.direction = 'rtl';
  const w = Math.min(1000, g.measureText(text).width + 56);
  g.fillStyle = 'rgba(255,250,240,.96)'; g.beginPath(); g.roundRect(512 - w / 2, 12, w, 104, 52); g.fill();
  g.strokeStyle = col; g.lineWidth = 5; g.stroke();
  g.fillStyle = col; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 512, 66);
  const tx = new THREE.CanvasTexture(cv); tx.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, depthTest: false, transparent: true }));
  sp.scale.set(8, 1, 1); sp.renderOrder = 20; sp.position.copy(anchorTop(at)); fxGroup.add(sp);
  const y0 = sp.position.y;
  tween(D(dur) * 1.2, (p) => {
    sp.position.y = y0 + easeOutBack(Math.min(1, p * 1.6)) * rise * 0.7 + p * rise * 0.3;
    sp.material.opacity = p < 0.75 ? 1 : 1 - (p - 0.75) / 0.25;
    const s = 0.7 + Math.min(1, p * 5) * 0.3; sp.scale.set(8 * s, s, 1);
  }).then(() => { fxGroup.remove(sp); tx.dispose(); sp.material.dispose(); });
}
function particles(at, n, { tex, color = '#ffffff', size = 0.3, spread = 1, up = 2, dur = 1200, additive = false, y = 0.3 }) {
  const base = anchor(at); const s0 = (at && at !== 'pawn' && city.has(at)) ? slotScale(gridN) / 0.86 : 1;
  const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const ps = [];
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(mat); const a = Math.random() * Math.PI * 2, r = (0.3 + Math.random() * 0.9) * spread * s0;
    ps.push({ sp, a, r, h: Math.random(), v: 0.6 + Math.random() * 0.8 });
    sp.position.set(base.x, base.y + y, base.z); sp.scale.setScalar(size); fxGroup.add(sp);
  }
  return tween(D(dur), (p) => {
    for (const q of ps) {
      const rr = q.r * (0.3 + p * 0.9);
      q.sp.position.set(base.x + Math.cos(q.a) * rr, base.y + y + q.h * 0.4 + p * up * q.v * s0, base.z + Math.sin(q.a) * rr);
      q.sp.material.opacity = 1 - p;
      q.sp.scale.setScalar(size * (0.6 + p * 0.9) * (additive ? 0.7 + Math.sin((p * 10 + q.h * 6)) * 0.3 : 1));
    }
  }).then(() => { for (const q of ps) fxGroup.remove(q.sp); mat.dispose(); });
}
const DUST = { trees: '#e8dcc4', skyline: '#9aa3c0', sea: '#f3e6c8', stars: '#c7d2fe' };
export function dust(at, color, n = 12) { return particles(at, n, { tex: soft(), color: color || DUST[theme && theme.decor] || '#e8dcc4', size: 0.75, spread: 1.6, up: 0.6, dur: 750, y: 0.15 }); }
export function sparkle(at = 'pawn', n = 26) { return particles(at, n, { tex: star(), color: '#ffffff', size: 0.55, spread: 1.4, up: 2.6, dur: 1400, additive: true, y: 0.5 }); }
export function hearts(at = 'pawn', n = 9) { return particles(at, n, { tex: heart(), color: '#ffffff', size: 0.45, spread: 0.9, up: 3, dur: 1500, y: 1 }); }
export function shake(amp = 0.35, dur = 480) { shakeAmp = amp; shakeDur = D(dur); shakeUntil = performance.now() + shakeDur; wake(dur + 500); }
export function confetti() {
  const n = lowPower ? 160 : 320, geo = new THREE.BoxGeometry(0.18, 0.04, 0.12), mat = new THREE.MeshStandardMaterial({ roughness: 0.5 });
  const im = new THREE.InstancedMesh(geo, mat, n); const cols = ['#f2b632', '#e2483d', '#1f9d63', '#2f6fdb', '#ffffff', '#ff4fd8']; const P = []; const d = new THREE.Object3D();
  for (let i = 0; i < n; i++) { P.push({ x: (Math.random() - 0.5) * 18, y: 10 + Math.random() * 8, z: (Math.random() - 0.5) * 18, v: 2 + Math.random() * 3, r: Math.random() * 6, s: Math.random() * 4 }); im.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
  fxGroup.add(im);
  return tween(5200, (p) => {
    const t = p * 5.2;
    P.forEach((q, i) => { d.position.set(q.x + Math.sin(t * 2 + i) * 0.4, q.y - q.v * t, q.z); d.rotation.set(q.r + t * q.s, t * q.s, q.r); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
    im.instanceMatrix.needsUpdate = true;
  }).then(() => { fxGroup.remove(im); geo.dispose(); mat.dispose(); });
}
/** End-of-game camera move (~1.4 s). */
export async function celebrate(win) {
  celebrating = true; controls.enabled = false;
  const tgt = controls.target.clone();
  const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(tgt));
  const to = from.clone();
  if (win) { to.theta += 0.75; to.phi = Math.min(from.phi + 0.18, 1.15); to.radius *= 0.8; } else { to.radius *= 1.1; to.phi = Math.max(from.phi - 0.12, 0.35); }
  await tween(win ? 1500 : 1200, (p) => {
    const e = easeInOut(p);
    const s = new THREE.Spherical(from.radius + (to.radius - from.radius) * e, from.phi + (to.phi - from.phi) * e, from.theta + (to.theta - from.theta) * e);
    camera.position.copy(tgt).add(new THREE.Vector3().setFromSpherical(s)); camera.lookAt(tgt);
  });
  controls.enabled = true;
}
