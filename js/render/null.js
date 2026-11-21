// Scene API contract + a no-op scene. game.js starts with this binding (so calls before the renderer exists can't
// crash) and falls back to it when no renderer at all can start (body[data-renderer="none"]). No DOM at import time.

/** Every function game.js may call on a scene (32 used today) + the T1 and T5 additions. `kind` is a string constant. */
export const SCENE_API = Object.freeze([
  'init', 'setSpeed', 'setPaused', 'frame', 'preloadWorld', 'worldLoaded', 'preloadLife', 'preloadDice', 'setPawn', 'buildWorld',
  'placePawn', 'hop', 'throwDice', 'holdDice', 'cancelHold', 'resetCamera', 'setCameraMode', 'getCameraMode', 'spawn', 'despawn',
  'launch', 'syncCity', 'hasKey', 'bump', 'shield', 'floatLabel', 'sparkle', 'hearts', 'shake', 'confetti', 'celebrate', 'project',
  'kind', 'dispose', 'onContextLost', 'failedModels',
  // T5 §10.2 (living city, picking, motion, quality, turn skip)
  'setLevel', 'pulse', 'onPick', 'pickAt', 'highlight', 'setMotion', 'setQuality', 'getQuality', 'skip', 'introWorld', 'setPawnRing', 'perfStats',
]);

export const kind = 'none';
let camMode = 'follow';
const later = (ms) => new Promise((r) => setTimeout(r, ms));

export async function init() {}
export function setSpeed() {}
export function setPaused() {}
export function frame() {}
export async function preloadWorld(w, onProgress) { try { if (onProgress) onProgress(1, { done: 0, total: 0, failed: 0 }); } catch (e) { /* ignore */ } return { failed: [] }; }
export function worldLoaded() { return true; }
export async function preloadLife() {}
export async function preloadDice() {}
export async function setPawn() {}
export function buildWorld() {}
export function placePawn() {}
export async function hop() {}
export async function throwDice(faces) { await later(150); return faces; }
export function holdDice() {}
export function cancelHold() {}
export function resetCamera() {}
export function setCameraMode(m) { camMode = m === 'overview' ? 'overview' : 'follow'; }
export function getCameraMode() { return camMode; }
export function spawn() {}
export function despawn() {}
export function launch() {}
export function syncCity() {}
export function hasKey() { return false; }
export function bump() {}
export function shield() {}
export function floatLabel() {}
export function sparkle() {}
export function hearts() {}
export function shake() {}
export async function confetti() {}
export async function celebrate() {}
export function project() {
  const g = globalThis;
  return { x: (g.innerWidth || 0) / 2, y: (g.innerHeight || 0) / 2 };
}
export function dispose() {}
export function onContextLost() {}
export function failedModels() { return []; }
// T5 §10.2
let quality = 'high';
export function setLevel() {}
export function pulse() {}
export function onPick() { return () => {}; }
export function pickAt() { return null; }
export function highlight() {}
export function setMotion() {}
export function setQuality(t) { if (['high', 'mid', 'low'].includes(t)) quality = t; }
export function getQuality() { return quality; }
export function skip() {}
export function introWorld() {}
export function setPawnRing() {}
export function perfStats() { return {}; }
