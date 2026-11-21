// "מצב קל" — a flat DOM board that implements the scene API (js/render/null.js SCENE_API) for devices without WebGL,
// when three.js can't load, or when the player turns it on. It only draws: the engine and game.js flow are the same as in 3D.
// The only engine call is E.boardInfo() for tile names/colours. No DOM access at import time; no animation loop (idle = zero
// cost); every exported function catches its own errors. Styles live in css/stability.css (#board2d / .b2d-*).
import { boardInfo } from '../engine.js';
import { reducedMotion } from '../motion.js'; // T5: the in-app motion setting wins over the OS (CR-R1)
import { MOTION, labelColor, worldStyle, cityEmoji, normLevel, pipsText, cardName, activityOf, ACTIVITY_EMOJI, ARCHETYPE_EMOJI, kindLabelOf, fixtureCity, fixtureCount } from './vocab.js';
import { bus } from '../bus.js';

export const kind = '2d';

const TOKEN = { classic: '♟', car: '🚕', tophat: '🎩', rocket: '🚀', crown: '👑', diamond: '💎' };
const TILE_ICON = [
  [/^coin$/, '💰'], [/^trend$/, '📈'], [/^bag$/, '👜'], [/^bars$/, '📊'], [/^question$/, '❓'], [/^bank$/, '🏦'], [/^hammer$/, '🔨'],
  [/^dollar$/, '💵'], [/^ship$/, '🚢'], [/^rocket$/, '🚀'], [/^heart$/, '❤️'], [/^(life|family)$/, '🏠'], [/^(edu|school|cap|study)$/, '🎓'],
  [/^(tax|receipt)$/, '🧾'], [/^piggy$/, '🐷'], [/^(index|fund|pension|chart)$/, '📊'], [/^(shop|store|business)$/, '🏪'],
  [/^(news|newspaper)$/, '📰'], [/^x$/, '✖️'],
];
const HISTORY_COLORS = { board: '#efe4c8', boardEdge: '#5b4127', center: '#e6d6b0' };

let root = null, boardEl = null, gridEl = null, cityEl = null, capEl = null, pawnEl = null, fxEl = null;
let n = 40, side = 10, pos = 0, speed = 1, paused = false, camMode = 'follow', rect = null, gridN = 4;
const city = new Map(); // key -> {el, model, label, kind, level}
const pickCbs = new Set();
let curWorld = null, motionOverride = null, quality = 'high', turnMs = 0, hlKey = null;
const timers = new Set();
const anims = new Set();

const warn = (e) => console.warn('[b2d]', e);
const reduced = () => { if (motionOverride != null) return motionOverride; try { return reducedMotion(); } catch (e) { return false; } };
const D = (ms) => { const d = Math.max(1, ms * speed); return reduced() ? Math.min(60, d) : d; };
const sleep = (ms) => new Promise((r) => { const t = setTimeout(() => { timers.delete(t); r(); }, ms); timers.add(t); });
function el(tag, cls, parent, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (parent) parent.appendChild(e); return e; }
const hidden = (e) => { e.setAttribute('aria-hidden', 'true'); return e; };
/** run a WAAPI animation; resolves when done (or after a safety timeout, so awaited flows never hang) */
function animate(target, frames, opts) {
  try {
    if (!target || !target.animate) return Promise.resolve();
    const a = target.animate(frames, opts);
    anims.add(a);
    if (paused) a.pause();
    const done = a.finished.catch(() => {}).then(() => anims.delete(a));
    return Promise.race([done, sleep((opts.duration || 0) + (opts.delay || 0) + 1500)]);
  } catch (e) { warn(e); return Promise.resolve(); }
}
const cellPx = () => (boardEl ? boardEl.clientWidth / (side + 1) : 0);
function gridXY(i) {
  i = ((i % n) + n) % n;
  let gx, gz;
  if (i <= side) { gx = side - i; gz = side; } else if (i <= 2 * side) { gx = 0; gz = side - (i - side); } else if (i <= 3 * side) { gx = i - 2 * side; gz = 0; } else { gx = side; gz = i - 3 * side; }
  return [gx, gz];
}
function tileCenter(i) { const c = cellPx(); const [gx, gz] = gridXY(i); return { x: (gx + 0.5) * c, y: (gz + 0.5) * c }; }
const pawnXf = (p, lift = 0, sx = 1, sy = 1) => `translate(${p.x}px, ${p.y - lift}px) translate(-50%, -62%) scale(${sx}, ${sy})`;
function tileIcon(icon) { const s = String(icon || ''); for (const [re, e] of TILE_ICON) if (re.test(s)) return e; return '⭐'; }
const cityIcon = cityEmoji;

/* ============================================================ setup */
export async function init(r) {
  root = r || document.getElementById('board2d');
  if (!root) throw new Error('board2d root missing');
  root.innerHTML = '';
  root.setAttribute('role', 'group'); // T5: the city cards are buttons (role=img would hide them from assistive tech)
  root.setAttribute('aria-label', 'לוח המשחק (מצב קל)');
  boardEl = el('div', 'b2d-board', root);
  gridEl = el('div', 'b2d-grid', boardEl);
  fxEl = hidden(el('div', 'b2d-fx', boardEl));
  pawnEl = hidden(el('div', 'b2d-pawn', boardEl));
  el('span', 'b2d-glyph', pawnEl, TOKEN.classic);
  root.hidden = false;
  layout();
}
export function dispose() {
  try {
    for (const t of timers) clearTimeout(t); timers.clear();
    for (const a of anims) { try { a.cancel(); } catch (e) { /* ignore */ } } anims.clear();
    city.clear(); pickCbs.clear();
    if (root) { root.innerHTML = ''; root.hidden = true; }
    root = boardEl = gridEl = cityEl = capEl = pawnEl = fxEl = null;
  } catch (e) { warn(e); }
}
export function onContextLost() {}
export function failedModels() { return []; }
export function setSpeed(f) { speed = Number(f) > 0 ? Number(f) : 1; }
export function setPaused(b) {
  paused = !!b;
  try { for (const a of anims) { if (paused) a.pause(); else a.play(); } } catch (e) { warn(e); }
}
/** rect = free screen area {x0,y0,x1,y1}: the square board is centred inside it. */
export function frame(r) { try { if (r) rect = r; layout(); } catch (e) { warn(e); } }
function layout() {
  if (!boardEl) return;
  const W = globalThis.innerWidth || 800, H = globalThis.innerHeight || 600;
  const R = rect || { x0: 0, y0: 0, x1: W, y1: H };
  const w = Math.max(0, R.x1 - R.x0), h = Math.max(0, R.y1 - R.y0);
  const s = Math.max(120, Math.floor(Math.min(w, h) - 8));
  boardEl.style.width = boardEl.style.height = s + 'px';
  boardEl.style.left = Math.round(R.x0 + (w - s) / 2) + 'px';
  boardEl.style.top = Math.round(R.y0 + (h - s) / 2) + 'px';
  const cell = s / (side + 1);
  boardEl.style.setProperty('--cell', cell + 'px');
  boardEl.classList.toggle('b2d-sm', cell < 46);
  if (pawnEl) pawnEl.style.transform = pawnXf(tileCenter(pos));
}

/* ============================================================ preload (nothing to load in 2D) */
export async function preloadWorld(w, onProgress) { try { if (onProgress) onProgress(1, { done: 0, total: 0, failed: 0 }); } catch (e) { warn(e); } return { failed: [] }; }
export function worldLoaded() { return true; }
export async function preloadLife() {}
export async function preloadDice() {}

/* ============================================================ board */
export function buildWorld(w) {
  try {
    if (!gridEl) return;
    const hist = !!(w && w.mechanic === 'history');
    let tiles = [];
    try { tiles = [...boardInfo(w.id)]; } catch (e) { tiles = (w && w.board ? [...w.board] : []).map((ch, i) => ({ index: i, name: '', color: '#ddd', ink: '#222', icon: '' })); }
    n = tiles.length || 40; side = Math.max(1, Math.round(n / 4));
    const T = hist ? HISTORY_COLORS : ((w && w.theme) || {});
    boardEl.style.setProperty('--b2d-board', T.board || '#f6efe2');
    boardEl.style.setProperty('--b2d-edge', T.boardEdge || '#6b4430');
    boardEl.style.setProperty('--b2d-center', T.center || '#efe3cb');
    boardEl.classList.toggle('b2d-hist', hist);
    curWorld = w || null; const ws = worldStyle(w);
    for (const c of [...boardEl.classList]) if (c.startsWith('b2d-m-')) boardEl.classList.remove(c);
    boardEl.classList.add('b2d-m-' + ws.motif); boardEl.dataset.world = hist ? 'h' : (w && w.id) || '';
    boardEl.style.setProperty('--b2d-accent', ws.accent); boardEl.style.setProperty('--b2d-rim', ws.rim);
    gridEl.innerHTML = '';
    gridEl.style.gridTemplateColumns = gridEl.style.gridTemplateRows = `repeat(${side + 1}, 1fr)`;
    for (const t of tiles) {
      const i = t.index ?? t.i ?? 0; const [gx, gz] = gridXY(i);
      const d = el('div', 'b2d-tile' + (t.type === 'payday' ? ' b2d-corner' : ''), gridEl);
      d.style.gridColumn = String(gx + 1); d.style.gridRow = String(gz + 1);
      d.style.background = t.color || '#ddd'; d.style.color = t.ink || '#222';
      d.dataset.i = String(i); d.title = t.name || ''; hidden(d);
      hidden(el('span', 'b2d-ti', d, tileIcon(t.icon)));
      const nm = el('span', 'b2d-tn', d, t.name || ''); nm.dir = 'rtl';
    }
    const center = el('div', 'b2d-center', gridEl);
    center.style.gridColumn = `2 / span ${Math.max(1, side - 1)}`; center.style.gridRow = `2 / span ${Math.max(1, side - 1)}`;
    capEl = hidden(el('div', 'b2d-cap', center, worldStyle(w).caption)); capEl.dir = 'rtl';
    cityEl = el('div', 'b2d-city', center); cityEl.setAttribute('role', 'group'); cityEl.setAttribute('aria-label', 'העיר שלך');
    city.clear(); gridN = 4; cityEl.style.setProperty('--n', String(gridN));
    layout();
  } catch (e) { warn(e); }
}
export async function setPawn(id = 'classic', color = '#e2483d') {
  try {
    if (!pawnEl) return;
    pawnEl.style.setProperty('--pawn', color || '#e2483d');
    const g = pawnEl.querySelector('.b2d-glyph'); if (g) g.textContent = TOKEN[id] ?? '♟';
  } catch (e) { warn(e); }
}
export function placePawn(i) { try { pos = Number(i) || 0; if (pawnEl) pawnEl.style.transform = pawnXf(tileCenter(pos)); } catch (e) { warn(e); } }
export async function hop(from, to, last = false) {
  try {
    if (!pawnEl) return;
    const a = tileCenter(from), b = tileCenter(to), lift = cellPx() * 0.6;
    const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    pos = Number(to) || 0;
    pawnEl.style.transform = pawnXf(b);
    if (reduced()) { glowTile(to); turnMs += last ? 120 : 0; if (last) await animate(pawnEl, [{ opacity: 0 }, { opacity: 1 }], { duration: 120 }); return; } // teleport + passed-tile glow
    turnMs += D(MOTION.hop) + (last ? D(MOTION.hopSquash) : 0);
    await animate(pawnEl, [{ transform: pawnXf(a) }, { transform: pawnXf(m, lift) }, { transform: pawnXf(b) }], { duration: D(MOTION.hop), easing: 'ease-in-out' });
    if (last) await animate(pawnEl, [{ transform: pawnXf(b) }, { transform: pawnXf(b, 0, 1.15, 0.8) }, { transform: pawnXf(b) }], { duration: D(MOTION.hopSquash) });
  } catch (e) { warn(e); }
}
export async function throwDice(faces, opts = {}) {
  try {
    const d = reduced() ? 150 : D(450); const cb = opts && opts.onBounce; turnMs = d;
    if (cb) { const t1 = setTimeout(() => { timers.delete(t1); try { cb(1); } catch (e) { warn(e); } }, d * 0.55); timers.add(t1); const t2 = setTimeout(() => { timers.delete(t2); try { cb(2); } catch (e) { warn(e); } }, d * 0.78); timers.add(t2); }
    await sleep(d);
  } catch (e) { warn(e); }
  return faces;
}
export function holdDice() {}
export function cancelHold() {}
export function resetCamera() {}
export function setCameraMode(m) { camMode = m === 'overview' ? 'overview' : 'follow'; }
export function getCameraMode() { return camMode; }

/* ============================================================ city: cards in the centre grid */
function ensureGrid(count) {
  let g = 4; while (g * g < count && g < 8) g++;
  if (g !== gridN) { gridN = g; if (cityEl) { cityEl.style.setProperty('--n', String(g)); cityEl.classList.toggle('b2d-dense', g >= 6); } }
}
/** T5 §5.3 / §6.2: every city card is a real button; click / Enter → the same pick event as a 3D tap */
function addCard(key, model, label, kind = null, level = null) {
  const c = el('button', 'b2d-card', cityEl); c.type = 'button';
  c.dataset.key = key; c.dataset.kind = 'plain'; c.title = label || '';
  hidden(el('span', 'b2d-ce', c, cityIcon(model)));
  if (label) { const l = hidden(el('span', 'b2d-cl', c, String(label).slice(0, 18))); l.dir = 'rtl'; }
  c.addEventListener('click', (e) => { const r = c.getBoundingClientRect(); emitPick(key, e.clientX || r.left + r.width / 2, e.clientY || r.top + r.height / 2); });
  const it = { el: c, model, label: label || '', kind, level: null };
  city.set(key, it);
  paintLevel(it, normLevel(level));
  return c;
}
function emitPick(key, x, y) {
  for (const f of [...pickCbs]) { try { f(key, { x, y }); } catch (e) { warn(e); } }
  try { bus.emit('city:pick', { key, x, y, source: '2d' }); } catch (e) { warn(e); }
}
/** card look per level (T5 §5.3): data-level / data-kind, pips, corner badges, accessible name T5-C2 */
function paintLevel(it, L) {
  const c = it.el; it.level = L;
  c.dataset.kind = L ? L.kind : 'plain';
  if (L) c.dataset.level = String(L.n); else delete c.dataset.level;
  c.setAttribute('aria-label', cardName(it.label, kindLabelOf(curWorld, it.kind, it.model), L));
  for (const x of c.querySelectorAll('.b2d-pips,.b2d-corner-b,.b2d-annex,.b2d-act')) x.remove();
  if (L) {
    hidden(el('span', 'b2d-pips', c, pipsText(L)));
    if (L.kind === 'biz') {
      const corner = L.n === 0 ? '🚧' : L.n === 3 ? '★' : (ARCHETYPE_EMOJI[L.type] || '🏪');
      hidden(el('span', 'b2d-corner-b', c, corner));
      if (L.n >= 2) hidden(el('span', 'b2d-annex', c, '+'));
    }
  }
  const a = activityOf(L);
  if (a) hidden(el('span', 'b2d-act', c, ACTIVITY_EMOJI[a]));
}
export function spawn(key, model, opts = {}) {
  try {
    if (!key || !cityEl || city.has(key)) return;
    ensureGrid(city.size + 1);
    const c = addCard(key, model, opts.label, opts.kind || null, opts.level || null);
    if (opts.silent) return;
    const frames = reduced() ? [{ transform: 'scale(.9)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }]
      : [{ transform: 'translateY(-160%) scale(.8)', opacity: 0 }, { transform: 'translateY(0) scale(1.05)', opacity: 1, offset: 0.6 }, { transform: 'translateY(-12%) scale(1)', offset: 0.8 }, { transform: 'translateY(0) scale(1)', opacity: 1 }];
    animate(c, frames, { duration: reduced() ? MOTION.t1 : D(MOTION.spawn), easing: 'ease-out' }).then(() => { if (opts.label) floatLabel(opts.label, opts.color || 'green', key); if (opts.golden) sparkle(key); });
  } catch (e) { warn(e); }
}
export function despawn(key) {
  try {
    const it = city.get(key); if (!it) return; city.delete(key);
    animate(it.el, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.01)', opacity: 0 }], { duration: reduced() ? MOTION.t1 : D(MOTION.despawn), fill: 'forwards' }).then(() => it.el.remove());
  } catch (e) { warn(e); }
}
export function launch(key, success) {
  try {
    const it = city.get(key); if (!it) return; city.delete(key);
    const frames = success ? [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-400%)', opacity: 0 }] : [{ transform: 'rotate(0)', opacity: 1 }, { transform: 'rotate(70deg) translateY(20%)', opacity: 0 }];
    animate(it.el, frames, { duration: D(success ? 1300 : 800), easing: success ? 'ease-in' : 'ease-out', fill: 'forwards' }).then(() => it.el.remove());
  } catch (e) { warn(e); }
}
export function syncCity(list, { silent = true } = {}) { // eslint-disable-line no-unused-vars -- always without animation
  try {
    if (!cityEl) return;
    const fx = fixtureCount(globalThis.location ? location.search : '');
    const want = new Map([...(list || []), ...(fx && curWorld ? fixtureCity(curWorld, fx) : [])].map((m) => [m.key, m]));
    for (const k of [...city.keys()]) if (!want.has(k)) { city.get(k).el.remove(); city.delete(k); }
    ensureGrid(want.size);
    for (const m of want.values()) {
      if (!city.has(m.key)) addCard(m.key, m.model, m.label, m.kind || null, m.level || null);
      else if ('level' in m) setLevel(m.key, m.level, { animate: false });
    }
  } catch (e) { warn(e); }
}
export function hasKey(key) { try { return city.has(key); } catch (e) { return false; } }
export function bump(key) {
  try {
    const it = city.get(key); if (!it) return;
    if (reduced()) return;
    animate(it.el, [{ transform: 'scale(1)' }, { transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: D(MOTION.bump) });
    sparkle(key, 3);
  } catch (e) { warn(e); }
}
export function shield(keys) {
  try {
    for (const k of keys || []) {
      const it = city.get(k); if (!it) continue;
      const r = hidden(el('span', 'b2d-shield', it.el));
      animate(r, [{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1)', offset: 0.25 }, { opacity: 1, offset: 0.6 }, { opacity: 0, transform: 'scale(1.05)' }], { duration: D(1700) }).then(() => r.remove());
    }
  } catch (e) { warn(e); }
}

/* ============================================================ effects */
/** anchor point (board-local px): the pawn or a city card */
function anchorXY(at) {
  if (!boardEl) return { x: 0, y: 0 };
  const it = at && at !== 'pawn' ? city.get(at) : null;
  const b = boardEl.getBoundingClientRect();
  if (it) { const r = it.el.getBoundingClientRect(); return { x: r.left - b.left + r.width / 2, y: r.top - b.top + r.height * 0.2 }; }
  const p = tileCenter(pos); return { x: p.x, y: p.y - cellPx() * 0.5 };
}
export function floatLabel(text, color = 'green', at = 'pawn', { rise = 1.5, dur = 1900 } = {}) {
  try {
    if (!text || !fxEl) return;
    const p = anchorXY(at);
    const s = el('span', 'b2d-float', fxEl, String(text)); s.dir = 'rtl';
    const col = labelColor(color);
    s.style.left = p.x + 'px'; s.style.top = p.y + 'px'; s.style.color = col; s.style.borderColor = col;
    const up = reduced() ? 0 : Math.max(24, cellPx() * rise); // reduced: no rise, opacity only
    animate(s, [{ transform: 'translate(-50%,-50%) scale(.7)', opacity: 0 }, { transform: `translate(-50%,calc(-50% - ${up * 0.6}px)) scale(1)`, opacity: 1, offset: 0.25 },
      { transform: `translate(-50%,calc(-50% - ${up * 0.8}px))`, opacity: 1, offset: 0.75 }, { transform: `translate(-50%,calc(-50% - ${up}px))`, opacity: 0 }], { duration: reduced() ? 1200 : D(Math.min(dur, 1900)) * 0.85 }).then(() => s.remove());
  } catch (e) { warn(e); }
}
function burst(at, glyph, count, cls) {
  if (!fxEl || reduced()) return Promise.resolve();
  const p = anchorXY(at); const c = cellPx(); const all = [];
  for (let i = 0; i < count; i++) {
    const s = el('span', 'b2d-pt ' + cls, fxEl, glyph);
    s.style.left = p.x + 'px'; s.style.top = p.y + 'px';
    const a = (i / count) * Math.PI * 2 + Math.random() * 0.5, r = c * (0.8 + Math.random() * 0.9);
    all.push(animate(s, [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 1 }, { transform: `translate(calc(-50% + ${Math.cos(a) * r}px), calc(-50% + ${Math.sin(a) * r - c}px)) scale(1)`, opacity: 0 }],
      { duration: D(MOTION.sparkle), easing: 'ease-out' }).then(() => s.remove()));
  }
  return Promise.all(all);
}
export function sparkle(at = 'pawn', count = 6) { try { burst(at, '✨', Math.min(6, Number(count) || 6), 'b2d-spark'); } catch (e) { warn(e); } }
export function hearts(at = 'pawn') { try { burst(at, '❤', 5, 'b2d-heart'); } catch (e) { warn(e); } }
export function shake(amp = 0.35, dur = 480) {
  try {
    if (!boardEl || reduced()) return;
    const a = Math.max(2, Math.min(14, (Number(amp) || 0.35) * 20));
    const f = []; for (let i = 0; i < 8; i++) f.push({ transform: `translate(${(Math.random() - 0.5) * 2 * a}px, ${(Math.random() - 0.5) * a}px)` });
    f.push({ transform: 'translate(0,0)' });
    animate(boardEl, f, { duration: D(Math.min(dur, MOTION.shake)) });
  } catch (e) { warn(e); }
}
export async function confetti() {
  try {
    if (!root || reduced()) return;
    const cols = ['#f2b632', '#e2483d', '#1f9d63', '#2f6fdb', '#ffffff', '#ff4fd8'];
    const H = globalThis.innerHeight || 600, W = globalThis.innerWidth || 800; const all = [];
    for (let i = 0; i < 40; i++) {
      const s = hidden(el('span', 'b2d-conf', root));
      s.style.left = Math.random() * W + 'px'; s.style.background = cols[i % cols.length];
      all.push(animate(s, [{ transform: `translate(0,-20px) rotate(0deg)`, opacity: 1 }, { transform: `translate(${(Math.random() - 0.5) * 120}px, ${H + 40}px) rotate(${360 + Math.random() * 720}deg)`, opacity: 0.9 }],
        { duration: MOTION.confetti - 400, delay: Math.random() * 400, easing: 'cubic-bezier(.3,.6,.6,1)' }).then(() => s.remove()));
    }
    await Promise.all(all);
  } catch (e) { warn(e); }
}
export async function celebrate(win) {
  try { if (boardEl && !reduced()) await animate(boardEl, [{ transform: 'scale(1)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], { duration: D(win ? MOTION.celebrate : MOTION.celebrate * 0.8), easing: 'ease-in-out' }); } catch (e) { warn(e); }
}
/** Screen point (CSS px) of the pawn or a city card — for DOM effects such as flying coins. */
export function project(at = 'pawn') {
  try {
    const it = at && at !== 'pawn' ? city.get(at) : null;
    const t = it ? it.el : pawnEl;
    if (t) { const r = t.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  } catch (e) { warn(e); }
  return { x: (globalThis.innerWidth || 0) / 2, y: (globalThis.innerHeight || 0) / 2 };
}

/* ============================================================ T5 §10.2 */
/** setLevel(key, level, {animate}) — data-level, pips, border style, accessible name; level-up pulse 450 ms (reduced: instant). */
export function setLevel(key, level, { animate: anim = false } = {}) {
  try {
    const it = city.get(key); if (!it) return;
    const L = normLevel(level); const prev = it.level;
    if (JSON.stringify(L) === JSON.stringify(prev)) return;
    paintLevel(it, L);
    const down = prev && L && prev.kind === 'biz' && L.kind === 'biz' && L.n < prev.n;
    if (down || (L && L.trouble && !(prev && prev.trouble))) flash(it, '⚠', 1500); // same rule as 3D (review m-7)
    if (anim && !down && !reduced()) animate(it.el, [{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: D(MOTION.bump) });
  } catch (e) { warn(e); }
}
function flash(it, glyph, ms) {
  const b = hidden(el('span', 'b2d-act b2d-flash', it.el, glyph));
  const t = setTimeout(() => { timers.delete(t); b.remove(); }, ms); timers.add(t);
}
/** pulse(key, kind) — an arrow badge for 1.2 s */
export function pulse(key, kind = 'good') { try { const it = city.get(key); if (it) flash(it, kind === 'bad' ? '⬇️' : kind === 'event' ? '🎉' : '⬆️', 1200); } catch (e) { warn(e); } }
export function onPick(cb) { if (typeof cb !== 'function') return () => {}; pickCbs.add(cb); return () => pickCbs.delete(cb); }
export function pickAt(x, y) {
  try { const e = document.elementFromPoint(x, y); const c = e && e.closest && e.closest('#board2d .b2d-card'); return c && city.has(c.dataset.key) ? c.dataset.key : null; } catch (e) { return null; }
}
export function highlight(key) {
  try { if (hlKey && city.has(hlKey)) city.get(hlKey).el.classList.remove('hl'); hlKey = key && city.has(key) ? key : null; if (hlKey) city.get(hlKey).el.classList.add('hl'); } catch (e) { warn(e); }
}
export function setMotion(r) { motionOverride = r == null ? null : !!r; }
export function setQuality(t) { if (['high', 'mid', 'low'].includes(t)) quality = t; }
export function getQuality() { return quality; }
/** finish running WAAPI animations (a tap on the board during the turn animation) */
export function skip() { try { for (const a of [...anims]) { try { a.finish(); } catch (e) { /* ignore */ } } } catch (e) { warn(e); } }
export function introWorld() { try { if (boardEl && !reduced()) animate(boardEl, [{ opacity: 0 }, { opacity: 1 }], { duration: MOTION.t2 }); } catch (e) { warn(e); } }
export function setPawnRing(color) { try { if (pawnEl && color) pawnEl.style.setProperty('--ring', color); } catch (e) { warn(e); } }
export function perfStats() { return { framesRendered: 0, lastTurnMs: Math.round(turnMs), tier: quality }; }
function glowTile(i) {
  try {
    const t = gridEl && gridEl.querySelector(`.b2d-tile[data-i="${i}"]`); if (!t) return;
    t.classList.add('b2d-passed'); const h = setTimeout(() => { timers.delete(h); t.classList.remove('b2d-passed'); }, 300); timers.add(h);
  } catch (e) { warn(e); }
}
