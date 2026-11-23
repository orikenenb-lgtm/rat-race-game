// Every playable world, registered at once — for Node (tools/sim.mjs, tests, tools/validate-worlds.mjs) and any caller that wants the
// whole catalogue synchronously. The browser does NOT import this file: it calls ensureWorld(id) for the one world it plays
// (js/worlds/index.js), so it never downloads rules it does not use. The verifier loads one per-world pack instead (tools/build-edge.mjs).
import { registerWorld } from './index.js';
import w5 from './w5.js';
import w6 from './w6.js';
import w7 from './w7.js';

export const LAZY = [w5, w6, w7];
for (const w of LAZY) registerWorld(w);
