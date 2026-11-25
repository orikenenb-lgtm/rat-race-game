// Every playable world, registered at once — for Node (tools/sim.mjs, tests, tools/validate-worlds.mjs) and any caller that wants the
// whole catalogue synchronously. The browser does NOT import this file: it calls ensureWorld(id) for the one world it plays
// (js/worlds/index.js), so it never downloads rules it does not use. The verifier loads one per-world pack instead (tools/build-edge.mjs).
import { registerWorld } from './index.js';
import w5 from './w5.js';
import w6 from './w6.js';
import w7 from './w7.js';
import w8 from './w8.js';
import w9 from './w9.js';
import w10 from './w10.js';
import w11 from './w11.js';
import w12 from './w12.js';
import w13 from './w13.js';
import w14 from './w14.js';
import w15 from './w15.js';
import w16 from './w16.js';
import w17 from './w17.js';
import w18 from './w18.js';

export const LAZY = [w5, w6, w7, w8, w9, w10, w11, w12, w13, w14, w15, w16, w17, w18];
for (const w of LAZY) registerWorld(w);
