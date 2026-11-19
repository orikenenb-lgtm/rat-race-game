// World registry. Order = progression order on the world map.
import w1 from './w1.js';
import w2 from './w2.js';
import w3 from './w3.js';
import w4 from './w4.js';

export const WORLDS = [w1, w2, w3, w4];
const BY_ID = Object.fromEntries(WORLDS.map((w) => [w.id, w]));
export function getWorld(id) {
  const w = BY_ID[id];
  if (!w) throw new Error('unknown world ' + id);
  return w;
}
