// T5 §8.1 — graphics quality tiers. Pure module (no three, no DOM at import): the 3D scene asks it which tier to use and how
// a tier is configured; the lobby settings and game.js read/write the saved preference (rr2-settings.quality).
//   auto (default) → detection: software renderer → low; deviceMemory ≤ 2 or ≤ 2 cores → low; coarse pointer with ≥ 6 GB and
//   ≥ 6 cores → high; other coarse pointers → mid; everything else → high. `?hq` forces high.
import { bus } from '../bus.js';

const KEY = 'rr2-settings';
export const TIERS = Object.freeze(['high', 'mid', 'low']);
export const PREFS = Object.freeze(['auto', 'high', 'mid', 'low']);
/** Hebrew labels (T5-S2) for the settings UI and the "עכשיו: {tier}" status line. */
export const TIER_LABEL = Object.freeze({ auto: 'אוטומטית', high: 'גבוהה', mid: 'בינונית', low: 'חסכונית' });

/** Per-tier configuration (T5 §8.1 table). dpr = [fine pointer, coarse pointer]; software renderers are capped at 0.6 anyway. */
export const TIER_CONFIG = Object.freeze({
  high: { dpr: [2, 1.75], antialias: true, shadows: 'soft', shadowMap: [2048, 1536], casters: 'all', decor: 1, updaters: true, particles: 1, confetti: 320, labels: 4, sepia: true, people: true },
  mid: { dpr: [1.5, 1.5], antialias: true, shadows: 'pcf', shadowMap: [1024, 1024], casters: 'main', decor: 0.7, updaters: true, particles: 0.6, confetti: 160, labels: 3, sepia: true, people: true },
  low: { dpr: [1, 1], antialias: false, shadows: 'off', shadowMap: [0, 0], casters: 'none', decor: 0.4, updaters: false, particles: 0.3, confetti: 0, labels: 2, sepia: false, people: false },
});

const read = () => { try { const o = JSON.parse(localStorage.getItem(KEY) || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
/** Saved preference: 'auto' | 'high' | 'mid' | 'low' (default 'auto'). */
export function qualityPref() { const p = read().quality; return PREFS.includes(p) ? p : 'auto'; }
/** Save the preference (merged into rr2-settings) and emit bus 'quality:change' {tier, pref, auto:false}. → the effective tier. */
export function setQualityPref(p, env = {}) {
  const pref = PREFS.includes(p) ? p : 'auto';
  try { localStorage.setItem(KEY, JSON.stringify({ ...read(), quality: pref })); } catch (e) { /* private mode */ }
  const tier = resolveTier(env);
  try { bus.emit('quality:change', { tier, pref, auto: false }); } catch (e) { /* ignore */ }
  return tier;
}

/** Device detection → tier. env: {lowPower, deviceMemory, cores, coarse, hq} (missing values are read from the browser). */
export function autoTier(env = {}) {
  const g = globalThis;
  const nav = g.navigator || {};
  const hq = env.hq ?? (typeof g.location !== 'undefined' && /[?&]hq\b/.test(g.location.search || ''));
  if (hq) return 'high';
  if (env.lowPower) return 'low';
  const mem = env.deviceMemory ?? nav.deviceMemory;
  const cores = env.cores ?? nav.hardwareConcurrency;
  if ((mem != null && mem <= 2) || (cores != null && cores <= 2)) return 'low';
  let coarse = env.coarse;
  if (coarse == null) { try { coarse = !!(g.matchMedia && g.matchMedia('(pointer:coarse)').matches); } catch (e) { coarse = false; } }
  if (coarse) return (mem != null && mem >= 6 && cores != null && cores >= 6) ? 'high' : 'mid';
  return 'high';
}
/** The effective tier: `?hq` → high; a saved non-auto preference; else autoTier(env). */
export function resolveTier(env = {}) {
  const g = globalThis;
  const hq = env.hq ?? (typeof g.location !== 'undefined' && /[?&]hq\b/.test(g.location.search || ''));
  if (hq) return 'high';
  const p = env.pref ?? qualityPref();
  if (p !== 'auto') return p;
  return autoTier(env);
}
/** Pixel ratio for a tier (A-29): min(devicePixelRatio, cap) — software renderers stay at 0.6. */
export function tierDpr(tier, { dpr = 1, coarse = false, lowPower = false } = {}) {
  if (lowPower) return 0.6;
  const c = (TIER_CONFIG[tier] || TIER_CONFIG.high).dpr[coarse ? 1 : 0];
  return Math.min(dpr || 1, c);
}

/**
 * Governor (P1, T5 §8.1): feed it frame deltas (ms) of ACTIVE frames only. When the median of a full 90-frame window is
 * > 34 ms and the pref is auto, it steps down one tier — at most once per 30 s and twice per session, never up.
 * → { step(dtMs, now) → null | 'mid' | 'low', reset() }. Disabled (always null) when `disabled` (software renderer, CI).
 */
export function makeGovernor({ tier = 'high', disabled = false, window = 90, limitMs = 34, coolMs = 30000, maxSteps = 2 } = {}) {
  let cur = tier, buf = [], last = -Infinity, steps = 0;
  return {
    get tier() { return cur; },
    set tier(t) { cur = t; buf = []; },
    reset() { buf = []; },
    step(dt, now) {
      if (disabled || !(dt > 0)) return null;
      buf.push(dt); if (buf.length < window) return null;
      const s = [...buf].sort((a, b) => a - b); const med = s[s.length >> 1]; buf = [];
      if (med <= limitMs || steps >= maxSteps || now - last < coolMs || cur === 'low') return null;
      cur = cur === 'high' ? 'mid' : 'low'; steps++; last = now;
      return cur;
    },
  };
}
