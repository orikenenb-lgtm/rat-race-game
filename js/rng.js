// Seeded PRNG for מירוץ העכברים 2.0.
// mulberry32 — bit-for-bit identical to v1's R(): the generator state is a plain uint32 kept inside the game state,
// so a game can be saved as JSON and resumed with the exact same future random sequence.
//
// The engine keeps several independent named streams (dice, deal, doodad, …) in `state.rng`.
// Every stream is consumed only by "what tile did you land on" — never by "what did you decide" — so all players of a
// seeded challenge see the same dice and the same cards no matter how they play.

/** One mulberry32 step on holder[key] (uint32). Returns a float in [0,1). Mutates holder[key]. */
export function next(holder, key = 'rng') {
  let t = (holder[key] = (holder[key] + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [lo, hi] inclusive. Consumes exactly one draw. */
export function int(holder, key, lo, hi) {
  return lo + Math.floor(next(holder, key) * (hi - lo + 1));
}

/** Uniform pick from a non-empty array. Consumes exactly one draw. */
export function pick(holder, key, arr) {
  return arr[Math.floor(next(holder, key) * arr.length)];
}

/** true with probability p. Consumes exactly one draw (even when p is 0 or 1, to keep the stream aligned). */
export function chance(holder, key, p) {
  return next(holder, key) < p;
}

/** Fisher–Yates shuffle (in place, returns arr). Consumes arr.length-1 draws — same algorithm as v1's deck shuffle. */
export function shuffle(holder, key, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(next(holder, key) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Weighted pick: items [{w, ...}] or parallel weights. Consumes exactly one draw. */
export function weighted(holder, key, items, weightOf = (x) => x.w) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = next(holder, key) * total;
  for (const x of items) { r -= weightOf(x); if (r < 0) return x; }
  return items[items.length - 1];
}

/** murmur3 finaliser — derives well-mixed independent stream seeds from one game seed. */
export function mix32(x) {
  x = x >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x85ebca6b) >>> 0;
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * Build the named streams object for a seed. Stream order/names are part of the save format — APPEND ONLY (a stream's seed
 * comes from its index). 0–9 v1–v3 · 10 dd, 11 cycle (T2, rules 4 only) · 12 rival, 13 listing (reserved for T6, unused) ·
 * 14 story (T3, rules 4 only: exactly 2 draws per payday) · 15 world (worlds wave 0: drawn ONLY by world mechanic modules js/worlds/mech/*,
 * each with its declared fixed counts per payday / per landing type; w1–w4 never touch it). Per-business sealed streams live in
 * state.bizRng / state.bizStory (not here). Next free index: 16.
 */
export const STREAMS = ['dice', 'deal', 'doodad', 'market', 'crisis', 'mystery', 'special', 'drift', 'life', 'index',
  'dd', 'cycle', 'rival', 'listing', 'story', 'world'];
export function makeStreams(seed) {
  const s = {};
  STREAMS.forEach((name, k) => { s[name] = mix32((seed >>> 0) + Math.imul(k + 1, 0x9E3779B9)); });
  return s;
}

/** Seed from a string (e.g. a daily-challenge date "2026-11-19:w3"). FNV-1a → uint32, never 0. */
export function seedFrom(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return mix32(h) || 1;
}
