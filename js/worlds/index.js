// World registry. Order = progression order on the world map.
// 'h' (מכונת הזמן, history mode) is resolvable by getWorld but not part of WORLDS (no map pin, no daily rotation).
//
// Worlds wave 0 (DESIGN §4.1 / §4.5): WORLDS stays exactly [w1, w2, w3, w4] — the core worlds bundled with the engine, the daily/weekly
// rotation and every legacy caller depend on it. Later worlds (w5 …) are NOT imported here: their full rules load on demand with
// ensureWorld(id) (browser: one dynamic import per world) or all at once from js/worlds/all.js (Node: sim, tests, tools). The map reads
// js/worlds/meta.js (imported by js/progress.js / the lobby, never by the engine). getWorld(id) stays synchronous: a known world whose rules are not loaded yet throws 'world_not_loaded'.
import w1 from './w1.js';
import w2 from './w2.js';
import w3 from './w3.js';
import w4 from './w4.js';
import h from './h.js';
/** Ids of the released lazy worlds (= js/worlds/meta.js status 'lazy'; tools/validate-worlds.mjs checks they agree). Kept here, not read
 *  from meta.js, so the engine — and the verifier's pinned core bundle — never carry the map data. */
export const LAZY_IDS = Object.freeze(['w5', 'w6', 'w7', 'w8', 'w9']);

export const WORLDS = [w1, w2, w3, w4];
const BY_ID = Object.fromEntries([...WORLDS, h].map((w) => [w.id, w]));
const LOADED = []; // registered later worlds, in registration order
export function getWorld(id) {
  const w = BY_ID[id];
  if (w) return w;
  if (LAZY_IDS.includes(id)) throw new Error('world_not_loaded ' + id);
  throw new Error('unknown world ' + id);
}
/** Register a full world config (idempotent). Called by js/worlds/all.js, by ensureWorld and by the verifier's per-world pack. */
export function registerWorld(w) {
  if (!w || typeof w.id !== 'string') throw new Error('registerWorld: bad world');
  const old = BY_ID[w.id];
  if (old === w) return w;
  if (old && (WORLDS.includes(old) || old === h)) throw new Error('registerWorld: core world ' + w.id);
  if (old) LOADED.splice(LOADED.indexOf(old), 1, w); else LOADED.push(w);
  BY_ID[w.id] = w;
  for (const fn of HOOKS) fn(w);
  return w;
}
const HOOKS = [];
/** Engine-side hook run for every registered world (and replayed for already-registered ones): system config registration. */
export function onRegister(fn) { HOOKS.push(fn); for (const w of LOADED) fn(w); }
/** Is the world's full config loaded? */
export function isLoaded(id) { return !!BY_ID[id]; }
/** Every loaded playable world in map order (core first, then registered later worlds by order). */
export function loadedWorlds() { return [...WORLDS, ...LOADED.slice().sort((a, b) => a.order - b.order)]; }
const PENDING = {};
/**
 * Load a world's full rules (async). Core worlds resolve at once; later worlds import ./<id>.js (which brings its mechanic modules) and
 * register it. The lobby calls this before createGame / deserialize / resume / the character picker of a lazy world.
 */
export function ensureWorld(id) {
  if (BY_ID[id]) return Promise.resolve(BY_ID[id]);
  if (!LAZY_IDS.includes(id)) return Promise.reject(new Error('unknown world ' + id));
  const spec = './' + id + '.js'; // a computed specifier: tools/build-edge.mjs does not pull lazy worlds into the core bundle
  return (PENDING[id] ||= import(spec).then((mod) => registerWorld(mod.default)).catch((e) => { delete PENDING[id]; throw e; }));
}
