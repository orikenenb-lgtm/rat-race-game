// Renderer choice: WebGL probe, flags/"מצב קל" setting, dynamic import of the 3D scene with a timeout, and the fallback chain
// 3D → 2D (js/render/board2d.js) → none (js/render/null.js). The renderer only draws: rules stay in engine.js / game.js.
import { flag } from '../flags.js';
import * as nullScene from './null.js';

export const RENDERER_TIMEOUT_MS = 20000;

let glOk = null;
/** Can this browser create a WebGL context? Cached; never throws; the probe context is released at once. */
export function webglAvailable() {
  if (glOk !== null) return glOk;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    glOk = !!gl;
    if (gl) { try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* ignore */ } }
  } catch (e) { glOk = false; }
  return glOk;
}

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
  return webglAvailable() ? { kind: '3d', reason: null } : { kind: '2d', reason: 'no-webgl' };
}
export function preferredKind() { return preferredChoice().kind; }

function setKind(k) { try { document.body.dataset.renderer = k; } catch (e) { /* ignore */ } }

/**
 * → { scene, kind: '3d'|'2d'|'none', reason: null|'user-lite'|'flag'|'no-webgl'|'three-failed'|'three-timeout'|'webgl-init-failed'|'2d-failed' }
 */
export async function loadRenderer({ want, reason = null, canvas, root, onSlow } = {}) {
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
      try { await mod.init(canvas); setKind('3d'); return { scene: mod, kind: '3d', reason: null }; }
      catch (e) { console.warn('[render] WebGL init failed', e); reason = 'webgl-init-failed'; try { if (mod.dispose) mod.dispose(); } catch (e2) { /* ignore */ } }
    }
  }
  if (flag('board2d') !== 'off') {
    try {
      const b = await import('./board2d.js');
      await b.init(root);
      setKind('2d');
      return { scene: b, kind: '2d', reason };
    } catch (e) { console.warn('[render] 2D board failed', e); reason = reason || '2d-failed'; }
  }
  setKind('none');
  return { scene: nullScene, kind: 'none', reason: reason || '2d-failed' };
}
