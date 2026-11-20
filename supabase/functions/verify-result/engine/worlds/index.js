// World registry. Order = progression order on the world map.
// 'h' (מכונת הזמן, history mode) is resolvable by getWorld but not part of WORLDS (no map pin, no daily rotation).
import w1 from './w1.js';
import w2 from './w2.js';
import w3 from './w3.js';
import w4 from './w4.js';
import h from './h.js';

export const WORLDS = [w1, w2, w3, w4];
const BY_ID = Object.fromEntries([...WORLDS, h].map((w) => [w.id, w]));
export function getWorld(id) {
  const w = BY_ID[id];
  if (!w) throw new Error('unknown world ' + id);
  return w;
}
