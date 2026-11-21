// Motion preference — the single source of truth for reduced motion (T5 §7.1).
// pref 'auto' follows the device (prefers-reduced-motion); 'reduce' / 'full' are the in-app setting and win over the OS.
// Stored in localStorage 'rr2-settings'.motion (merged, like audio.js / game.js do). No DOM access at import time.
// <html data-motion="reduce|full"> always carries the EFFECTIVE value, so CSS can use :root[data-motion=reduce].
// Turbo + reduced → reduced wins (callers check reducedMotion() before applying speed).
import { bus } from './bus.js';

const KEY = 'rr2-settings';
const PREFS = ['auto', 'reduce', 'full'];
const QUERY = '(prefers-reduced-motion: reduce)';
let mql = null, inited = false, memPref = null;   // memPref: used only when localStorage cannot be written

const read = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
const media = () => { try { if (!mql && typeof matchMedia === 'function') mql = matchMedia(QUERY); return mql; } catch (e) { return null; } };
const apply = () => { try { if (typeof document !== 'undefined' && document.documentElement) document.documentElement.dataset.motion = reducedMotion() ? 'reduce' : 'full'; } catch (e) { /* no DOM */ } };
const emit = () => bus.emit('motion:change', { pref: motionPref(), reduced: reducedMotion() });

/** 'auto' | 'reduce' | 'full' (rr2-settings.motion, default 'auto'; anything else reads as 'auto'). */
export function motionPref() {
  if (memPref) return memPref;
  const p = read().motion;
  return PREFS.includes(p) ? p : 'auto';
}

/** true when motion should be reduced: pref 'reduce' → true; 'full' → false; 'auto' → the OS media query. */
export function reducedMotion() {
  const p = motionPref();
  if (p === 'reduce') return true;
  if (p === 'full') return false;
  const m = media();
  return !!(m && m.matches);
}

/** Save the in-app setting (merged into rr2-settings), update <html data-motion>, emit bus 'motion:change' {pref, reduced}. */
export function setMotionPref(p) {
  const pref = PREFS.includes(p) ? p : 'auto';
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), motion: pref })); memPref = null; } catch (e) { memPref = pref; /* private mode: this session still follows the choice */ }
  apply();
  emit();
  return pref;
}

/** Call once at startup: sets <html data-motion> and follows OS changes while the pref is 'auto' (→ bus 'motion:change'). */
export function initMotion() {
  apply();
  if (inited) return;
  inited = true;
  const m = media();
  if (!m) return;
  const onChange = () => { if (motionPref() !== 'auto') return; apply(); emit(); };
  try { m.addEventListener('change', onChange); } catch (e) { try { m.addListener(onChange); } catch (e2) { /* old browsers */ } }
}
