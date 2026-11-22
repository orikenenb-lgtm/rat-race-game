// ⚡ Energy — the real-time limit for free play and story worlds (DESIGN-v3 §3).
// max 25, each roll costs 1, +1 every 6 minutes (timestamp based → survives reloads and closed tabs).
// Bonuses can push above the max (up to CAP); natural refill only runs while below the max.
// Ranked modes (daily/weekly/challenge) never call spend() — game.js decides that.
//
// API: get() · max · canRoll(n=1) · spend(n=1) → bool · msUntilNext() · msUntilFull() · add(n, reason) → added
//      grantOnce(key, n, reason) → added (0 if that key was already granted) · fmtWait(ms) · onChange(fn)
// Bus: 'energy:change' {energy, max, delta, reason, msUntilNext}
import { bus } from './bus.js';

/** T4 §8 naming: ⚡ is called "זריקות" (singular "זריקה") everywhere on screen; 🔋 stays "כוח" (the story's strength). */
export const NAME = 'זריקות';
export const ONE = 'זריקה';
export const ICON = '⚡';
/** 1 → 'זריקה אחת', n → '{n} זריקות' (no icon; callers add ⚡ where the line needs it). */
export function label(n) { n = Math.floor(+n || 0); return n === 1 ? 'זריקה אחת' : `${n} ${NAME}`; }

export const MAX = 25;
export const REFILL_MS = 6 * 60 * 1000;
export const CAP = 99;
const KEY = 'rr2-energy';
const now = () => Date.now();

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
  if (!s || typeof s !== 'object' || !Number.isFinite(+s.e) || !Number.isFinite(+s.at)) s = { e: MAX, at: now(), granted: {} };
  s.e = Math.max(0, Math.min(CAP, Math.floor(+s.e))); s.at = +s.at; s.granted = s.granted && typeof s.granted === 'object' ? s.granted : {};
  return s;
}
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode */ } }

/** Fold elapsed refill time into the stored value (keeps the partial progress toward the next point). */
function settle() {
  const t = now();
  if (t < S.at) S.at = t; // clock moved backwards: never give free energy, never get stuck
  if (S.e >= MAX) { S.at = t; return; }
  const n = Math.floor((t - S.at) / REFILL_MS);
  if (n > 0) {
    S.e = Math.min(MAX, S.e + n);
    S.at = S.e >= MAX ? t : S.at + n * REFILL_MS;
  }
}
function emit(delta, reason) {
  const p = { energy: S.e, max: MAX, delta, reason: reason || '', msUntilNext: msUntilNext() };
  try { bus.emit('energy:change', p); } catch (e) { /* ignore */ }
  for (const fn of listeners) { try { fn(p); } catch (e) { console.error(e); } }
}
const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function get() { settle(); return S.e; }
export function canRoll(n = 1) { return get() >= n; }
export function spend(n = 1) {
  settle();
  if (S.e < n) return false;
  if (S.e >= MAX && S.e - n < MAX) S.at = now(); // refill clock starts when we drop below the max
  S.e -= n; save(); emit(-n, 'roll');
  return true;
}
export function msUntilNext() {
  settle();
  if (S.e >= MAX) return 0;
  return Math.max(0, REFILL_MS - (now() - S.at));
}
export function msUntilFull() {
  settle();
  if (S.e >= MAX) return 0;
  return msUntilNext() + (MAX - S.e - 1) * REFILL_MS;
}
export function add(n, reason = 'bonus') {
  n = Math.floor(+n || 0); if (n <= 0) return 0;
  settle();
  const before = S.e;
  S.e = Math.min(CAP, S.e + n);
  if (S.e >= MAX) S.at = now();
  save(); emit(S.e - before, reason);
  return S.e - before;
}
/** One-time bonus guarded by a key (e.g. 'daily:2026-11-20', 'streak7:2026-11-20', 'ach:golden'). */
export function grantOnce(key, n, reason) {
  if (!key || S.granted[key]) return 0;
  S.granted[key] = now();
  // keep the guard list small: drop dated keys older than ~60 days
  const keys = Object.keys(S.granted);
  if (keys.length > 300) { const old = now() - 60 * 864e5; for (const k of keys) if (S.granted[k] < old) delete S.granted[k]; }
  save();
  return add(n, reason || key);
}
export function wasGranted(key) { return !!S.granted[key]; }
/** "4:05" under an hour, "1:12 ש׳" above. */
export function fmtWait(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')} ש׳` : `${m}:${String(sec).padStart(2, '0')}`;
}
// another tab spent/received energy → reload and tell listeners
if (typeof addEventListener === 'function') addEventListener('storage', (e) => { if (e.key === KEY) { S = load(); emit(0, 'sync'); } });

/** Tests only. */
export function _reset(state) { S = state ? { granted: {}, ...state } : { e: MAX, at: now(), granted: {} }; save(); }
