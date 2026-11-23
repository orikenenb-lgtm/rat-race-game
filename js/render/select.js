// Renderer choice: WebGL probe, flags/"מצב קל" setting, dynamic import of the 3D scene with a timeout, and the fallback chain
// 3D → 2D (js/render/board2d.js) → none (js/render/null.js). The renderer only draws: rules stay in engine.js / game.js.
import { flag } from '../flags.js';
import * as nullScene from './null.js';

export const RENDERER_TIMEOUT_MS = 20000;

let glInfoC = null;
/** Read the GPU's renderer string from a live context ('' when the browser hides it). Never throws. */
function rendererString(gl) {
  try {
    const x = gl.getExtension('WEBGL_debug_renderer_info');
    const s = x ? gl.getParameter(x.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  } catch (e) { return ''; }
}
/**
 * What WebGL can this browser create? → {gl2, gl1, renderer}. Cached; never throws; every probe context is released at once.
 * three.js r170 (the 3D renderer) needs WebGL2 — a WebGL1-only browser is sent to the 2D board without downloading three.
 * `renderer` is the GPU string, shown only in the notices' "פרטים טכניים" line (never sent anywhere).
 */
export function glInfo() {
  if (glInfoC) return glInfoC;
  const out = { gl2: false, gl1: false, renderer: '' };
  const probe = (type) => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext(type);
      if (!gl) return false;
      if (!out.renderer) out.renderer = rendererString(gl);
      try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* ignore */ }
      return true;
    } catch (e) { return false; }
  };
  out.gl2 = probe('webgl2');
  out.gl1 = out.gl2 || probe('webgl') || probe('experimental-webgl');
  glInfoC = Object.freeze(out);
  return glInfoC;
}
/** Can this browser create any WebGL context (1 or 2)? Kept for older callers; the 3D choice uses glInfo().gl2. */
export function webglAvailable() { return glInfo().gl1; }
/** test hook: forget the cached probe */
export function _resetProbe() { glInfoC = null; }

let p3 = null;
/** Start downloading scene.js + three once (keeps the download parallel to game.js). */
export function prefetch3D() {
  if (!p3) { p3 = import('../scene.js'); p3.catch(() => {}); }
  return p3;
}

function liteSetting() {
  try { return !!(JSON.parse(localStorage.getItem('rr2-settings') || '{}') || {}).lite; } catch (e) { return false; }
}
/** → {kind:'3d'|'2d', reason} — the renderer this device should try first. */
export function preferredChoice() {
  const f = flag('board2d');
  if (f === 'off') return { kind: '3d', reason: null };          // never 2D (the lite button is hidden then)
  if (liteSetting()) return { kind: '2d', reason: 'user-lite' };
  if (f === 'on') return { kind: '2d', reason: 'flag' };
  const g = glInfo();
  if (g.gl2) return { kind: '3d', reason: null };
  return { kind: '2d', reason: g.gl1 ? 'no-webgl2' : 'no-webgl' };   // no WebGL2: no point downloading three r170
}
export function preferredKind() { return preferredChoice().kind; }

function setKind(k) { try { document.body.dataset.renderer = k; } catch (e) { /* ignore */ } }

/**
 * → { scene, kind: '3d'|'2d'|'none', reason, gpu }
 *   reason: null|'user-lite'|'flag'|'no-webgl'|'no-webgl2'|'three-failed'|'three-timeout'|'webgl-init-failed'|'context-lost'|'2d-failed'
 *   ('context-lost' only comes in from the caller: WebGL died while the lobby was up and this start must use 2D)
 *   gpu: the renderer string for the "פרטים טכניים" line ('' when unknown or not probed — user-lite / flag never probe WebGL)
 */
export async function loadRenderer({ want, reason = null, canvas, root, onSlow } = {}) {
  const gpu = () => (glInfoC ? glInfoC.renderer : '');
  if (want === '3d') {
    let timer = 0, mod = null;
    const timeout = new Promise((r) => { timer = setTimeout(() => r('timeout'), RENDERER_TIMEOUT_MS); });
    try {
      const v = await Promise.race([prefetch3D(), timeout]);
      if (v === 'timeout') { reason = 'three-timeout'; try { if (onSlow) onSlow(); } catch (e) { /* ignore */ } }
      else mod = v; // a late import after the timeout is simply ignored
    } catch (e) { console.warn('[render] 3D module failed', e); reason = 'three-failed'; }
    clearTimeout(timer);
    if (mod) {
      try { await mod.init(canvas); setKind('3d'); return { scene: mod, kind: '3d', reason: null, gpu: gpu() }; }
      catch (e) { console.warn('[render] WebGL init failed', e); reason = 'webgl-init-failed'; try { if (mod.dispose) mod.dispose(); } catch (e2) { /* ignore */ } }
    }
  }
  if (flag('board2d') !== 'off') {
    try {
      const b = await import('./board2d.js');
      await b.init(root);
      setKind('2d');
      return { scene: b, kind: '2d', reason, gpu: gpu() };
    } catch (e) { console.warn('[render] 2D board failed', e); reason = reason || '2d-failed'; }
  }
  setKind('none');
  return { scene: nullScene, kind: 'none', reason: reason || '2d-failed', gpu: gpu() };
}
