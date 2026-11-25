// w5 עיר התיירות + w6 אזור התעשייה + w7 רשתות המסחר + w8 מטרופולין הנדל"ן — procedural 3D stand-ins for the world's model keys (w5.js `models`: hotel_beach, resort, spa, conference,
// waterpark, apartments, restaurant, dive_center, staff_housing). No .glb exists for them, so scene.js never requests one
// (worldModelNames skips STANDIN names) and builds these instead — never a 404, never a grey placeholder box.
//
// Occupancy (season.js cityModels → m.occ / m.occDecile / m.closed, normalised by vocab.normLevel kind 'occ'): every stand-in carries
// ONE InstancedMesh of 10 window panes (`group.userData.win`) — lit panes = the occupancy decile (warm), the rest dark; a closed wing
// turns the right half into shutters; a closed asset (a water park in winter, a half-built park) is all dark. paintWindows() is the
// only writer; scene.js calls it from applyLevelParts. Pure three.js, no DOM, no engine import.
import * as THREE from 'three';
import { W910 } from './standins910.js';   // w9 / w10 stand-ins (energy sites, holdings blocks)
import { W13 } from './standins13.js';     // w13 stand-ins (the stadium, a sponsor's billboard, the club shop)
import { W1115_DIR } from './standins1115.js';   // w11: its own port warehouse (w3 keeps warehouse.glb)
import { W1216_DIR } from './standins1216.js';   // w16: the farm (its warehouse key; w3 keeps warehouse.glb)

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const box = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 12, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
function shadowAll(g) { g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return g; }

export const WIN_LIT = '#ffd27a', WIN_DARK = '#2d3a4f', WIN_SHUT = '#8a7f76';
/**
 * 10 window panes on the front face (+z) of a block: 2 rows × 5, centred at x0, rows at y1 / y2, depth z (front face).
 * MeshBasicMaterial: the instance colour shows as is (lit panes read in any light, also at night).
 */
function windows(g, { w, y1, y2, z, x0 = 0, pane = 0.16 }) {
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(pane, pane * 1.25), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 10);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(30).fill(1), 3);
  const d = new THREE.Object3D(); const step = w / 5;
  for (let i = 0; i < 10; i++) {
    const col = i % 5, row = Math.floor(i / 5);
    d.position.set(x0 - w / 2 + step * (col + 0.5), row ? y2 : y1, z + 0.006); d.updateMatrix(); im.setMatrixAt(i, d.matrix);
  }
  im.name = 'standin:windows'; im.userData.windows = true; im.castShadow = false; im.receiveShadow = false;
  g.add(im); g.userData.win = im;
  paintWindows(g, null);
  return im;
}
/**
 * Paint a stand-in's windows for a normalised level (kind 'occ': {n: decile 0–10, closed, wing}); null → a neutral 6/10 lit.
 * Window order: bottom row then top row, right to left in RTL reading is irrelevant here — lit panes fill from the centre outwards
 * so 3 lit windows always read as "some rooms", never as one lit side.
 */
const ORDER = [2, 7, 1, 6, 3, 8, 0, 5, 4, 9];   // centre first, both rows
export function paintWindows(g, L) {
  const im = g && g.userData && g.userData.win; if (!im) return false;
  const c = new THREE.Color();
  const lit = !L ? 6 : L.closed ? 0 : Math.max(0, Math.min(10, L.n | 0));
  const on = new Set(ORDER.slice(0, lit));
  for (let i = 0; i < 10; i++) {
    const right = i % 5 >= 3;   // a closed wing = the two right columns
    c.set(L && L.wing && right ? WIN_SHUT : on.has(i) ? WIN_LIT : WIN_DARK);
    im.setColorAt(i, c);
  }
  im.instanceColor.needsUpdate = true;
  g.userData.winLit = L && L.wing ? [...on].filter((i) => i % 5 < 3).length : lit;
  return true;
}

function palm(g, x, z, s = 1) {
  const t = cyl(g, 0.035 * s, 0.06 * s, 0.9 * s, '#8b5e34', x, 0, z, 6); t.rotation.z = 0.12;
  for (let k = 0; k < 5; k++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.55 * s, 4), mat('#2f8f4e', { flatShading: true }));
    f.position.set(x + Math.cos((k / 5) * Math.PI * 2) * 0.2 * s, 0.92 * s, z + Math.sin((k / 5) * Math.PI * 2) * 0.2 * s);
    f.rotation.set(Math.sin((k / 5) * Math.PI * 2) * 1.2, 0, -Math.cos((k / 5) * Math.PI * 2) * 1.2); g.add(f);
  }
}
const BUILD = {
  hotel_beach() {   // a white beach hotel, coral roof band, balconies
    const g = new THREE.Group();
    box(g, 1.5, 1.25, 0.9, '#fbf4ea'); box(g, 1.56, 0.1, 0.96, '#ff7a59', 0, 1.25);
    for (const y of [0.42, 0.84]) box(g, 1.44, 0.04, 0.12, '#e8dccb', 0, y, 0.5);
    windows(g, { w: 1.3, y1: 0.28, y2: 0.7, z: 0.45 });
    box(g, 0.32, 0.36, 0.06, '#2ec4d6', 0, 0, 0.47); palm(g, 0.92, 0.55, 0.9);
    return g;
  },
  resort() {   // a stepped resort with a pool
    const g = new THREE.Group();
    box(g, 1.8, 0.75, 1.0, '#fff1de'); box(g, 1.2, 0.6, 0.8, '#fde7cc', 0, 0.75, -0.08); box(g, 1.26, 0.08, 0.86, '#ff7a59', 0, 1.35, -0.08);
    windows(g, { w: 1.6, y1: 0.2, y2: 0.52, z: 0.5 });
    const pool = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.35), mat('#48cae4', { roughness: 0.15 })); pool.position.set(0, 0.02, 0.78); g.add(pool);
    palm(g, -0.98, 0.7, 0.8); palm(g, 1.0, 0.72, 0.85);
    return g;
  },
  spa() {   // a low desert spa: sandstone block, a dome, a warm pool
    const g = new THREE.Group();
    box(g, 1.4, 0.7, 0.9, '#e7c9a0'); const d = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat('#d9a066')); d.position.set(0, 0.7, -0.05); g.add(d);
    windows(g, { w: 1.2, y1: 0.18, y2: 0.46, z: 0.45, pane: 0.13 });
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 18), mat('#7fd6c2', { roughness: 0.2 })); pool.position.set(0.55, 0.02, 0.72); g.add(pool);
    return g;
  },
  conference() {   // columns + a wide hall
    const g = new THREE.Group();
    box(g, 1.7, 0.95, 0.95, '#eef1f6'); box(g, 1.78, 0.12, 1.02, '#9a3412', 0, 0.95);
    for (let i = 0; i < 5; i++) cyl(g, 0.05, 0.05, 0.62, '#ffffff', -0.64 + i * 0.32, 0, 0.56, 8);
    windows(g, { w: 1.5, y1: 0.22, y2: 0.66, z: 0.48 });
    return g;
  },
  waterpark() {   // slides + a pool; windows = the ticket hall
    const g = new THREE.Group();
    const pool = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.06, 1.0), mat('#48cae4', { roughness: 0.15 })); pool.position.y = 0.03; g.add(pool);
    cyl(g, 0.08, 0.08, 1.2, '#ff7a59', -0.55, 0, -0.3, 8); cyl(g, 0.08, 0.08, 0.9, '#ffd166', 0.5, 0, -0.35, 8);
    const s1 = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.06, 6, 18, Math.PI), mat('#ff7a59')); s1.position.set(-0.2, 0.75, -0.3); s1.rotation.z = Math.PI / 6; g.add(s1);
    box(g, 0.9, 0.5, 0.4, '#fff7ea', 0, 0, 0.42); windows(g, { w: 0.8, y1: 0.12, y2: 0.32, z: 0.62, pane: 0.1 });
    return g;
  },
  apartments() {   // two small holiday blocks
    const g = new THREE.Group();
    box(g, 0.7, 1.0, 0.8, '#fde2cc', -0.42); box(g, 0.7, 0.8, 0.8, '#ffe9d6', 0.42);
    box(g, 0.74, 0.06, 0.84, '#48cae4', -0.42, 1.0); box(g, 0.74, 0.06, 0.84, '#48cae4', 0.42, 0.8);
    windows(g, { w: 1.5, y1: 0.22, y2: 0.58, z: 0.4, pane: 0.12 });
    return g;
  },
  restaurant() {   // a beach restaurant with an awning and tables
    const g = new THREE.Group();
    box(g, 1.3, 0.62, 0.8, '#fff3e0'); const aw = box(g, 1.4, 0.06, 0.42, '#ff7a59', 0, 0.6, 0.55); aw.rotation.x = 0.25;
    windows(g, { w: 1.1, y1: 0.16, y2: 0.4, z: 0.4, pane: 0.12 });
    for (const x of [-0.45, 0, 0.45]) { cyl(g, 0.13, 0.13, 0.04, '#ffffff', x, 0.3, 0.95, 10); cyl(g, 0.02, 0.02, 0.3, '#8b5e34', x, 0, 0.95, 6); }
    return g;
  },
  dive_center() {   // a hut with a boat and a flag
    const g = new THREE.Group();
    box(g, 0.9, 0.55, 0.7, '#f6e3c5'); const r = new THREE.Mesh(new THREE.ConeGeometry(0.68, 0.36, 4), mat('#2ec4d6')); r.position.y = 0.73; r.rotation.y = Math.PI / 4; g.add(r);
    windows(g, { w: 0.8, y1: 0.14, y2: 0.36, z: 0.35, pane: 0.1 });
    const boat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.26), mat('#ffffff')); boat.position.set(0.7, 0.07, 0.62); g.add(boat);
    cyl(g, 0.015, 0.015, 0.6, '#3b2a17', -0.55, 0, 0.4, 6); box(g, 0.24, 0.14, 0.02, '#e2483d', -0.43, 0.42, 0.4);
    return g;
  },
  staff_housing() {   // a plain block
    const g = new THREE.Group();
    box(g, 1.2, 1.15, 0.8, '#e6ddd1'); box(g, 1.24, 0.06, 0.84, '#9a3412', 0, 1.15);
    windows(g, { w: 1.0, y1: 0.3, y2: 0.74, z: 0.4 });
    return g;
  },
};
/* ---------------------------------------------------------------- w6 אזור התעשייה: production lines
   plant.js cityModels → {cond, condLight, condPips, running, down, pending, mothball, shift, hazardBand, util}, normalised by
   vocab.normLevel kind 'plant'. Every line carries (userData): `lamp` (a condition light on a pole: green / amber / red, grey when
   stopped on purpose), `pips` (3 condition pips on the facade: the shape that does not rely on colour), `belt` (a conveyor with crates
   that scene.js moves while the line runs — never under reduced motion), `scaff` (a scaffold shown while an ordered line is still on its
   way, the shed itself drawn as a pale frame) and `shutter` (a closed door when the line is mothballed). paintPlant() is the only writer. */
const PIP_ON = '#f8fafc', PIP_OFF = '#1f2937';
export const PLANT_LAMP = Object.freeze({ green: '#22c55e', amber: '#f59e0b', red: '#ef4444', off: '#6b7280' });
/** a sawtooth shed (the classic factory roof): body + n roof teeth along x; returns the body meshes (for the "on its way" frame) */
function shed(g, { w, d, h, body, roof, teeth = 3, x = 0, z = 0 }) {
  const parts = [box(g, w, h, d, body, x, 0, z)];
  const tw = w / teeth;
  for (let i = 0; i < teeth; i++) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(tw * 0.58, tw * 0.58, d * 0.98, 3), mat(roof));
    t.rotation.set(-Math.PI / 2, 0, 0); t.position.set(x - w / 2 + tw * (i + 0.5), h + tw * 0.26, z); g.add(t); parts.push(t);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(tw * 0.5, tw * 0.36), mat('#bfdbfe', { roughness: 0.2 })); gl.position.set(x - w / 2 + tw * (i + 0.5), h + tw * 0.2, z + d / 2 + 0.004); g.add(gl);
  }
  return parts;
}
function chimney(g, x, z, h, r = 0.09) { const c = cyl(g, r * 0.85, r, h, '#9ca3af', x, 0, z, 10); const b = cyl(g, r * 0.9, r * 0.9, 0.08, '#ef4444', x, h * 0.78, z, 10); return [c, b]; }
/** the plant kit every line shares: lamp on a pole, 3 pips on the facade, a conveyor with 4 crates, a scaffold and a shutter (hidden) */
function plantKit(g, { w, d, h, beltY = 0, beltZ, crate = '#c2410c', door = 0.34 }) {
  const fz = d / 2;
  // condition lamp (MeshBasicMaterial: the colour reads in any light) on a pole at the front corner
  cyl(g, 0.02, 0.025, h * 0.95, '#374151', w / 2 + 0.12, 0, fz - 0.05, 6);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), new THREE.MeshBasicMaterial({ color: PLANT_LAMP.green }));
  lamp.position.set(w / 2 + 0.12, h * 0.95 + 0.08, fz - 0.05); lamp.name = 'standin:lamp'; g.add(lamp); g.userData.lamp = lamp;
  // 3 condition pips on the facade
  const pips = new THREE.InstancedMesh(new THREE.BoxGeometry(0.11, 0.11, 0.02), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 3);
  pips.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(9).fill(1), 3);
  const o = new THREE.Object3D();
  for (let i = 0; i < 3; i++) { o.position.set(-0.18 + i * 0.18, h * 0.78, fz + 0.012); o.updateMatrix(); pips.setMatrixAt(i, o.matrix); }
  pips.name = 'standin:pips'; pips.castShadow = false; g.add(pips); g.userData.pips = pips;
  // the door + a shutter that closes it (mothball)
  box(g, door, h * 0.5, 0.02, '#334155', -w * 0.3, 0, fz + 0.005);
  const sh = box(g, door + 0.04, h * 0.52, 0.03, '#9ca3af', -w * 0.3, 0, fz + 0.02); sh.visible = false; sh.name = 'standin:shutter'; g.userData.shutter = sh;
  // conveyor: a dark belt on legs in front of the shed, 4 crates riding it (scene.js moves them while the line runs)
  const bz = beltZ ?? fz + 0.32, bw = w * 0.92;
  box(g, bw, 0.05, 0.22, '#1f2937', 0, beltY + 0.18, bz);
  for (const lx of [-bw / 2 + 0.06, bw / 2 - 0.06]) box(g, 0.04, 0.18, 0.18, '#4b5563', lx, beltY, bz);
  const crates = [];
  for (let i = 0; i < 4; i++) { const c = box(g, 0.13, 0.11, 0.14, crate, -bw / 2 + bw * (i + 0.5) / 4, beltY + 0.23, bz); c.name = 'standin:crate'; crates.push(c); }
  g.userData.belt = { crates, w: bw, x0: -bw / 2, phase: 0, y: beltY + 0.23 };
  // scaffold (an ordered line that has not arrived): 4 poles + 2 rails, hidden
  const sc = new THREE.Group(); sc.name = 'standin:scaffold'; sc.visible = false;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) box(sc, 0.04, h * 1.15, 0.04, '#f59e0b', sx * (w / 2 + 0.06), 0, sz * (d / 2 + 0.06));
  for (const f of [0.45, 0.95]) box(sc, w + 0.16, 0.035, 0.035, '#f59e0b', 0, h * f, d / 2 + 0.06);
  g.add(sc); g.userData.scaff = sc;
}
function finishPlant(g, body) { g.userData.body = body; g.userData.plant = true; paintPlant(g, null); return g; }
const PLANT = {
  factory_cnc() {   // a precise machining hall: blue-grey shed, sawtooth roof, a small exhaust stack
    const g = new THREE.Group(); const body = shed(g, { w: 1.5, d: 0.95, h: 0.75, body: '#cbd5e1', roof: '#475569' });
    body.push(...chimney(g, 0.55, -0.32, 1.25, 0.07)); plantKit(g, { w: 1.5, d: 0.95, h: 0.75, crate: '#64748b' }); return finishPlant(g, body);
  },
  factory_plastic() {   // injection moulding: a tall white hall with two silos for the pellets
    const g = new THREE.Group(); const body = shed(g, { w: 1.3, d: 0.9, h: 0.9, body: '#f1f5f9', roof: '#f97316', teeth: 2, x: -0.12 });
    body.push(cyl(g, 0.16, 0.16, 1.2, '#e2e8f0', 0.68, 0, -0.22, 12), cyl(g, 0.12, 0.12, 1.0, '#fdba74', 0.7, 0, 0.18, 12));
    plantKit(g, { w: 1.3, d: 0.9, h: 0.9, crate: '#0ea5e9' }); return finishPlant(g, body);
  },
  factory_food() {   // a big food plant: long shed, two stacks, a tank
    const g = new THREE.Group(); const body = shed(g, { w: 1.8, d: 1.0, h: 0.8, body: '#fef3c7', roof: '#b45309', teeth: 4 });
    body.push(...chimney(g, -0.55, -0.35, 1.5), ...chimney(g, -0.25, -0.35, 1.3), cyl(g, 0.2, 0.2, 0.7, '#e5e7eb', 0.72, 0.8, -0.2, 14));
    plantKit(g, { w: 1.8, d: 1.0, h: 0.8, crate: '#d97706' }); return finishPlant(g, body);
  },
  factory_recycle() {   // recycling: a green shed, a scrap heap and a sorting hopper
    const g = new THREE.Group(); const body = shed(g, { w: 1.4, d: 0.9, h: 0.7, body: '#bbf7d0', roof: '#166534', teeth: 3 });
    const heap = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.36, 7), mat('#78716c', { flatShading: true })); heap.position.set(0.62, 0.18, -0.3); g.add(heap); body.push(heap);
    const hop = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.3, 4, 1, true), mat('#15803d')); hop.position.set(-0.5, 1.0, -0.1); hop.rotation.x = Math.PI; g.add(hop); body.push(hop);
    plantKit(g, { w: 1.4, d: 0.9, h: 0.7, crate: '#16a34a' }); return finishPlant(g, body);
  },
  factory_metal() {   // a metal works: dark steel shed, a gantry crane on top, a stack
    const g = new THREE.Group(); const body = shed(g, { w: 1.4, d: 0.95, h: 0.8, body: '#9ca3af', roof: '#374151', teeth: 2 });
    body.push(box(g, 0.06, 0.5, 0.06, '#f59e0b', -0.6, 0.8, 0.3), box(g, 0.06, 0.5, 0.06, '#f59e0b', 0.6, 0.8, 0.3), box(g, 1.3, 0.06, 0.08, '#f59e0b', 0, 1.3, 0.3), ...chimney(g, 0.5, -0.3, 1.4, 0.08));
    plantKit(g, { w: 1.4, d: 0.95, h: 0.8, crate: '#57534e' }); return finishPlant(g, body);
  },
  factory_pack() {   // a packing line: a low wide hall with a loading dock
    const g = new THREE.Group(); const body = shed(g, { w: 1.7, d: 0.85, h: 0.6, body: '#e7e5e4', roof: '#0f766e', teeth: 3 });
    body.push(box(g, 0.6, 0.18, 0.3, '#a8a29e', 0.45, 0, 0.56));
    plantKit(g, { w: 1.7, d: 0.85, h: 0.6, beltZ: 0.72, crate: '#a16207' }); return finishPlant(g, body);
  },
};
/** w6's logistics warehouse (a leased box: no machines, no breakdowns) — w6 only: w3 has a real warehouse.glb (see DIR_BUILD). */
function warehouse6() {
  const g = new THREE.Group();
  const body = [box(g, 1.6, 0.7, 1.0, '#d6d3d1'), box(g, 1.66, 0.06, 1.06, '#f97316', 0, 0.7)];
  for (let i = 0; i < 3; i++) box(g, 0.34, 0.42, 0.02, i === 1 ? '#475569' : '#64748b', -0.5 + i * 0.5, 0, 0.505);
  for (let i = 0; i < 3; i++) box(g, 0.24, 0.16, 0.2, '#b45309', -0.55 + i * 0.3, 0, 0.75);
  g.userData.body = body;
  return g;
}
/** level (normalised, kind 'plant') → lamp colour, lit pips, conveyor on/off, the "on its way" frame, the shutter. null → a neutral fit line. */
export function paintPlant(g, L) {
  const ud = g && g.userData; if (!ud || !ud.lamp) return false;
  const lv = L && L.kind === 'plant' ? L : null;
  const pending = !!(lv && lv.pending), mothball = !!(lv && lv.mothball), down = !!(lv && lv.down);
  const light = !lv ? 'green' : pending || mothball ? 'off' : down ? 'red' : lv.light || 'green';
  ud.lamp.material.color.set(PLANT_LAMP[light] || PLANT_LAMP.green);
  const lit = pending ? 0 : lv ? Math.max(0, Math.min(3, lv.n | 0)) : 3;
  const c = new THREE.Color();
  for (let i = 0; i < 3; i++) { c.set(i < lit ? PIP_ON : PIP_OFF); ud.pips.setColorAt(i, c); }
  ud.pips.instanceColor.needsUpdate = true;
  const conveyor = !!(lv ? lv.running : true);
  for (const cr of ud.belt.crates) cr.visible = !pending;
  if (ud.scaff) ud.scaff.visible = pending;
  if (ud.shutter) ud.shutter.visible = mothball;
  for (const m of ud.body || []) { if (!m.material) continue; m.material.transparent = pending; m.material.opacity = pending ? 0.42 : 1; m.material.depthWrite = !pending; m.material.needsUpdate = true; }
  ud.plantState = { light, pipsLit: lit, conveyor, ghost: pending, shutter: mothball, shift: lv ? lv.shift || 1 : 1 };
  return true;
}
/** One animation step of a line's conveyor (scene.js calls it per frame while the scene is animating, never under reduced motion). */
export function stepBelt(g, dt) {
  const ud = g && g.userData; const b = ud && ud.belt; if (!b || !ud.plantState || !ud.plantState.conveyor) return false;
  b.phase = (b.phase + dt * 0.12 * (ud.plantState.shift || 1)) % 1;
  b.crates.forEach((c, i) => { c.position.x = b.x0 + (((i + 0.5) / b.crates.length + b.phase) % 1) * b.w; });
  return true;
}

/* ---------------------------------------------------------------- w7 רשתות המסחר: storefronts, the stock pool, the DC, e-commerce, managers
   chain.js cityModels → {stage 0–4, lights, own / franchise, fitout, flicker (over span), stockout, count}, normalised by vocab.normLevel
   kind 'branch'. Every storefront carries (userData): `lights` (4 window panes: lit panes = the ramp stage), `sign` (the shop sign over
   the door: grey while fitting out, gold when open, flickering when the chain has more branches than its managers can hold — the flicker
   only moves while the scene animates, never under reduced motion; a still frame shows a dimmed sign), `awn` (the striped awning: red /
   white for your own branch, blue / white for a franchise) and `boards` (boarded windows + a scaffold during the 2-month fit-out).
   paintBranch() is the only writer; stepShop() is the flicker step. */
export const AWN = Object.freeze({ own: ['#e63946', '#fff5f5'], fran: ['#2563eb', '#eef2ff'] });
export const SIGN = Object.freeze({ on: '#ffd166', dim: '#7c6a3a', off: '#6b7280' });
function awning(g, { w, y, z, n = 7, depth = 0.26 }) {
  const strips = []; const sw = w / n;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sw * 1.02, 0.035, depth), mat(i % 2 ? AWN.own[1] : AWN.own[0]));
    m.position.set(-w / 2 + sw * (i + 0.5), y, z + depth / 2 - 0.02); m.rotation.x = 0.38; g.add(m); strips.push(m);
  }
  // scalloped valance (one dark strip under the awning edge)
  box(g, w, 0.05, 0.02, '#7f1d1d', 0, y - 0.11, z + depth * 0.93);
  g.userData.awn = strips; return strips;
}
/** the storefront kit every branch model shares: 4 window panes, a sign, an awning, the fit-out boards (hidden) */
function shopKit(g, { w, h, z, winY = 0.18, winH = 0.34, signY, awnY, door = 0.22 }) {
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(w * 0.19, winH), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 4);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(12).fill(1), 3);
  const o = new THREE.Object3D();
  for (let i = 0; i < 4; i++) { const x = -w * 0.36 + i * w * 0.24 + (i >= 2 ? door * 0.5 : -door * 0.1); o.position.set(x, winY + winH / 2, z + 0.006); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
  im.name = 'standin:shoplights'; g.add(im); g.userData.lights = im;
  box(g, door, winH + 0.08, 0.02, '#3f2a1d', w * 0.12, 0, z + 0.004);
  const sg = new THREE.Mesh(new THREE.BoxGeometry(w * 0.62, 0.13, 0.04), new THREE.MeshBasicMaterial({ color: SIGN.on }));
  sg.position.set(0, signY ?? h - 0.12, z + 0.025); sg.name = 'standin:sign'; g.add(sg); g.userData.sign = sg;
  awning(g, { w: w * 0.96, y: awnY ?? winY + winH + 0.1, z });
  const bd = new THREE.Group(); bd.name = 'standin:boards'; bd.visible = false;
  for (let i = 0; i < 4; i++) box(bd, w * 0.9, 0.05, 0.02, '#c08a52', 0, winY + 0.03 + i * winH * 0.28, z + 0.03);
  for (const sx of [-1, 1]) box(bd, 0.035, h * 1.05, 0.035, '#f59e0b', sx * (w / 2 + 0.05), 0, z + 0.08);
  box(bd, w + 0.16, 0.03, 0.03, '#f59e0b', 0, h * 0.62, z + 0.08);
  g.add(bd); g.userData.boards = bd;
}
function finishShop(g, body) { g.userData.body = body; g.userData.shop = true; paintBranch(g, null); return g; }
const SHOP = {
  store_street() {   // a two-storey street shop: plaster upper floor with two windows, a red / white awning
    const g = new THREE.Group(); const body = [box(g, 1.3, 1.05, 0.8, '#f5e6d3'), box(g, 1.36, 0.06, 0.86, '#9b1c24', 0, 1.05)];
    for (const x of [-0.32, 0.32]) box(g, 0.24, 0.18, 0.02, '#475569', x, 0.64, 0.405);
    shopKit(g, { w: 1.3, h: 1.05, z: 0.4, signY: 0.94 }); return finishShop(g, body);
  },
  store_mall() {   // a mall unit: a wide glass front in a beige mall block with a skylight
    const g = new THREE.Group(); const body = [box(g, 1.7, 0.95, 1.0, '#e7dccb'), box(g, 1.76, 0.08, 1.06, '#a8a29e', 0, 0.95), box(g, 0.7, 0.16, 0.5, '#bae6fd', 0, 1.03, -0.1, { roughness: 0.2 })];
    shopKit(g, { w: 1.6, h: 0.95, z: 0.5, winH: 0.4, signY: 0.85, awnY: 0.66 }); return finishShop(g, body);
  },
  store_outlet() {   // an outlet: a low wide box with pennants on a pole
    const g = new THREE.Group(); const body = [box(g, 1.8, 0.7, 0.9, '#d6d3d1'), box(g, 1.84, 0.05, 0.94, '#e63946', 0, 0.7)];
    const pole = cyl(g, 0.02, 0.02, 1.2, '#57534e', 0.95, 0, 0.3, 6); body.push(pole);
    for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 3), mat(i % 2 ? '#ffd166' : '#e63946')); f.rotation.z = Math.PI / 2; f.position.set(0.88, 1.12 - i * 0.14, 0.3); g.add(f); body.push(f); }
    shopKit(g, { w: 1.7, h: 0.7, z: 0.45, winH: 0.26, winY: 0.12, signY: 0.58, awnY: 0.48 }); return finishShop(g, body);
  },
  store_airport() {   // a glass pavilion in the terminal, a tail fin on the roof
    const g = new THREE.Group(); const body = [box(g, 1.4, 0.85, 0.9, '#cbd5e1', 0, 0, 0, { roughness: 0.25, metalness: 0.2 }), box(g, 1.46, 0.05, 0.96, '#334155', 0, 0.85)];
    const fin = box(g, 0.08, 0.42, 0.34, '#e63946', 0.42, 0.9, -0.1); fin.rotation.z = -0.25; body.push(fin);
    shopKit(g, { w: 1.4, h: 0.85, z: 0.45, signY: 0.75, awnY: 0.58 }); return finishShop(g, body);
  },
};
/** the chain's stock pool: 4 pallet stacks on a loading pad (how many are full = months of sales on hand) */
function stockPallets() {
  const g = new THREE.Group(); box(g, 1.5, 0.05, 1.0, '#a8a29e');
  const stacks = [];
  for (let i = 0; i < 4; i++) {
    const st = new THREE.Group(); st.position.set(-0.52 + (i % 2) * 0.62 + (i > 1 ? 0.42 : 0), 0.05, i > 1 ? 0.22 : -0.22);
    box(st, 0.46, 0.06, 0.4, '#a16207'); box(st, 0.42, 0.34, 0.36, i % 2 ? '#d6a35c' : '#c08a52', 0, 0.06); box(st, 0.44, 0.012, 0.38, '#f5f5f4', 0, 0.42);
    g.add(st); stacks.push(st);
  }
  g.userData.pallets = stacks; g.userData.body = []; paintStock(g, null); return g;
}
/** w7's distribution centre (a big shed with docks and a truck) — w7 only: w3 keeps its real warehouse.glb (DIR_BUILD). */
function warehouse7() {
  const g = new THREE.Group();
  const body = [box(g, 1.9, 0.8, 1.1, '#e7e5e4'), box(g, 1.94, 0.06, 1.14, '#9b1c24', 0, 0.8), box(g, 1.9, 0.08, 0.02, '#e63946', 0, 0.62, 0.551)];
  for (let i = 0; i < 4; i++) box(g, 0.3, 0.36, 0.02, '#475569', -0.66 + i * 0.44, 0, 0.555);
  box(g, 0.5, 0.26, 0.22, '#f8fafc', 0.5, 0.05, 0.82); box(g, 0.18, 0.2, 0.2, '#e63946', 0.16, 0.05, 0.82);   // a truck at the dock
  for (const x of [0.2, 0.62]) { const w = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), mat('#111827')); w.rotation.x = Math.PI / 2; w.position.set(x, 0.06, 0.82); g.add(w); }
  g.userData.body = body; return g;
}
/** the e-commerce hub: a parcel hall with a big screen, an antenna and a stack of boxes */
function ecomHub() {
  const g = new THREE.Group(); const body = [box(g, 1.3, 0.8, 0.9, '#e0f2fe'), box(g, 1.34, 0.05, 0.94, '#0369a1', 0, 0.8)];
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.32), new THREE.MeshBasicMaterial({ color: '#38bdf8' })); scr.position.set(0, 0.45, 0.452); g.add(scr);
  body.push(cyl(g, 0.015, 0.02, 0.7, '#475569', 0.45, 0.8, -0.2, 6)); const dish = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat('#f8fafc')); dish.rotation.x = -1.2; dish.position.set(0.45, 1.42, -0.15); g.add(dish);
  for (let i = 0; i < 3; i++) box(g, 0.2, 0.16, 0.2, '#c08a52', -0.45 + i * 0.12, i === 2 ? 0.16 : 0, 0.62);
  g.userData.body = body; return g;
}
/** a regional manager's office: a slim tower with lit windows and a beacon (scene.js draws the light lines to its 6 branches) */
function regionalOffice() {
  const g = new THREE.Group(); const body = [box(g, 0.75, 1.6, 0.75, '#334155', 0, 0, 0, { roughness: 0.35, metalness: 0.2 }), box(g, 0.8, 0.06, 0.8, '#e63946', 0, 1.6)];
  windows(g, { w: 0.62, y1: 0.55, y2: 1.15, z: 0.375, pane: 0.09 });
  const bc = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), new THREE.MeshBasicMaterial({ color: SIGN.on })); bc.position.set(0, 1.76, 0); bc.name = 'standin:beacon'; g.add(bc); g.userData.beacon = bc;
  g.userData.body = body; g.userData.office = true; return g;
}
/** level (normalised, kind 'branch') → lit panes, the sign, the awning colours, the fit-out boards. null → a mature own branch. */
export function paintBranch(g, L) {
  const ud = g && g.userData; if (!ud || !ud.lights) return false;
  const lv = L && L.kind === 'branch' ? L : null;
  const fitout = !!(lv && lv.fitout), fran = !!(lv && !lv.own), flicker = !!(lv && lv.flicker);
  const lit = !lv ? 4 : fitout ? 0 : Math.max(0, Math.min(4, lv.n | 0));
  const c = new THREE.Color();
  for (let i = 0; i < 4; i++) { c.set(i < lit ? WIN_LIT : WIN_DARK); ud.lights.setColorAt(i, c); }
  ud.lights.instanceColor.needsUpdate = true;
  const pal = fran ? AWN.fran : AWN.own;
  (ud.awn || []).forEach((m, i) => m.material.color.set(pal[i % 2]));
  if (ud.boards) ud.boards.visible = fitout;
  const sign = fitout ? SIGN.off : flicker ? SIGN.dim : SIGN.on;   // a still over-span frame shows a dimmed sign (reduced motion)
  ud.sign.material.color.set(sign);
  ud.shopState = { lit, fitout, franchise: fran, flicker, sign, stockout: !!(lv && lv.stockout) };
  return true;
}
/** One flicker step of an over-span branch's sign (scene.js calls it per frame while the scene animates, never under reduced motion). */
export function stepShop(g, t) {
  const ud = g && g.userData; const s = ud && ud.shopState; if (!s || !s.flicker || !ud.sign) return false;
  const on = Math.sin(t * 13.1) + Math.sin(t * 5.3 + 1) > 0.4;
  ud.sign.material.color.set(on ? SIGN.on : SIGN.dim); s.blink = on; return true;
}
/** level (kind 'stock') → visible pallet stacks (0–4); null → 2. */
export function paintStock(g, L) {
  const ud = g && g.userData; if (!ud || !ud.pallets) return false;
  const n = L && L.kind === 'stock' ? Math.max(0, Math.min(4, L.n | 0)) : 2;
  ud.pallets.forEach((p, i) => { p.visible = i < n; });
  ud.stockState = { pallets: n }; return true;
}

/* ---------------------------------------------------------------- w8 מטרופולין הנדל"ן: building sites, finished blocks, fenced plots
   projects.js cityModels → {pct, stage 0–4, floors, stalled / tarp, craneOn, permit, presold} (+ rentals stage 5, plots fence), normalised
   by vocab.normLevel kind 'build'. A site carries (userData): `slabs` (an InstancedMesh of floor slabs: how many stand = % complete),
   `cols` (4 corner columns as tall as the slabs), `crane` + `jib` (a tower crane whose jib turns while work goes on — only while the scene
   animates, never under reduced motion), `tarp` (a blue sheet over the frame when the site stands still), `sign` (the permit board while
   the plot waits for its permit) and `banner` (the presale banner on the fence: its green part = the share sold on paper). paintBuild()
   is the only writer; stepCrane() is the jib step. */
function towerCrane(g, { x, z, h = 2.0, jib = 1.2 }) {
  const c = new THREE.Group(); c.name = 'standin:crane'; c.position.set(x, 0, z);
  box(c, 0.11, h, 0.11, '#eab308');
  for (let i = 0; i < 6; i++) { const b = box(c, 0.1, 0.012, 0.012, '#a16207', 0, (i + 0.5) * h / 6); b.rotation.z = 0.6; }
  const j = new THREE.Group(); j.position.y = h; j.name = 'standin:jib'; c.add(j);
  box(j, jib, 0.07, 0.08, '#eab308', jib / 2 - 0.15, 0); box(j, 0.4, 0.05, 0.06, '#eab308', -0.32, 0); box(j, 0.14, 0.14, 0.12, '#57534e', -0.46, -0.07);
  box(j, 0.12, 0.12, 0.1, '#f8fafc', 0.02, -0.1); const cable = box(j, 0.008, 0.5, 0.008, '#1f2937', jib * 0.7, -0.52); const hook = box(j, 0.05, 0.05, 0.05, '#1f2937', jib * 0.7, -0.56);
  g.add(c); g.userData.crane = c; g.userData.jib = j; g.userData.hook = [cable, hook];
  return c;
}
function siteKit(g, { w, d, n = 10, fh = 0.15, slab = '#d6d3d1', glass = null, crane = true, cx, cz }) {
  box(g, w + 0.3, 0.04, d + 0.3, '#a8a29e');   // the site pad
  const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(w, 0.04, d), mat(slab, { roughness: 0.9 }), n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { o.position.set(0, 0.06 + (i + 1) * fh, 0); o.updateMatrix(); sl.setMatrixAt(i, o.matrix); }
  sl.name = 'standin:slabs'; sl.castShadow = true; sl.receiveShadow = true; g.add(sl); g.userData.slabs = sl; g.userData.slabN = n; g.userData.fh = fh;
  if (glass) { const gl = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 0.96, fh * 0.7, d * 0.96), mat(glass, { roughness: 0.15, metalness: 0.3, transparent: true, opacity: 0.75 }), n);
    for (let i = 0; i < n; i++) { o.position.set(0, 0.06 + i * fh + fh * 0.62, 0); o.updateMatrix(); gl.setMatrixAt(i, o.matrix); } gl.name = 'standin:glass'; g.add(gl); g.userData.glass = gl; }
  const cols = [];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]]) { const c = box(g, 0.08, 1, 0.08, '#57534e', sx * (w / 2 - 0.05), 0.06, sz * (d / 2 - 0.05)); cols.push(c); }
  g.userData.cols = cols;
  const tarp = new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, 1, d + 0.08), mat('#2563eb', { transparent: true, opacity: 0.62, roughness: 0.9 }));
  tarp.name = 'standin:tarp'; tarp.visible = false; g.add(tarp); g.userData.tarp = tarp;
  // the permit board (two posts, a yellow face) and the presale banner on the fence
  const sign = new THREE.Group(); sign.name = 'standin:permit'; sign.visible = false;
  for (const sx of [-0.22, 0.22]) box(sign, 0.03, 0.42, 0.03, '#57534e', sx, 0, d / 2 + 0.22);
  box(sign, 0.58, 0.28, 0.03, '#facc15', 0, 0.32, d / 2 + 0.24); box(sign, 0.4, 0.04, 0.035, '#854d0e', 0, 0.44, d / 2 + 0.25); box(sign, 0.3, 0.04, 0.035, '#854d0e', 0, 0.36, d / 2 + 0.25);
  g.add(sign); g.userData.sign = sign;
  const bn = new THREE.Group(); bn.name = 'standin:banner'; bn.position.set(-(w / 2) - 0.08, 0, d / 2 + 0.16);
  box(bn, 0.03, 0.62, 0.03, '#57534e', -0.11, 0); box(bn, 0.03, 0.62, 0.03, '#57534e', 0.11, 0);
  box(bn, 0.24, 0.42, 0.015, '#f8fafc', 0, 0.18, 0.01);
  const fill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.38, 0.02), new THREE.MeshBasicMaterial({ color: '#16a34a' })); fill.position.set(0, 0.2, 0.02); bn.add(fill);
  g.add(bn); g.userData.banner = { group: bn, fill, y0: 0.2, h: 0.38 };
  if (crane) towerCrane(g, { x: cx ?? w / 2 + 0.22, z: cz ?? -d / 2 + 0.1, h: n * fh + 0.55, jib: Math.max(1.0, w * 0.85) });
}
function finishSite(g, body = []) { g.userData.body = body; g.userData.site = true; paintBuild(g, null); return g; }
const SITE = {
  tower_build() { const g = new THREE.Group(); siteKit(g, { w: 1.2, d: 1.0, n: 10, fh: 0.15, slab: '#b5aea5' }); return finishSite(g); },
  office_build() { const g = new THREE.Group(); siteKit(g, { w: 1.2, d: 1.0, n: 8, fh: 0.16, slab: '#94a3b8', glass: '#38bdf8' }); return finishSite(g); },
  logistics_build() {   // a logistics hall: wide and low, built bay by bay (the slabs here are roof bays along x)
    const g = new THREE.Group(); box(g, 1.9, 0.04, 1.1, '#a8a29e');
    const n = 6; const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.28, 0.5, 0.9), mat('#e7e5e4', { roughness: 0.9 }), n); const o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { o.position.set(-0.75 + i * 0.3, 0.29, 0); o.updateMatrix(); sl.setMatrixAt(i, o.matrix); }
    sl.name = 'standin:slabs'; sl.castShadow = true; g.add(sl); g.userData.slabs = sl; g.userData.slabN = n; g.userData.bays = true;
    const tarp = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.56, 0.96), mat('#2563eb', { transparent: true, opacity: 0.62 })); tarp.position.y = 0.3; tarp.visible = false; tarp.name = 'standin:tarp'; g.add(tarp); g.userData.tarp = tarp;
    const sign = new THREE.Group(); sign.visible = false; sign.name = 'standin:permit'; box(sign, 0.03, 0.42, 0.03, '#57534e', 0, 0, 0.7); box(sign, 0.5, 0.26, 0.03, '#facc15', 0, 0.3, 0.72); g.add(sign); g.userData.sign = sign;
    towerCrane(g, { x: 1.05, z: -0.3, h: 1.2, jib: 1.1 });
    return finishSite(g);
  },
};
/** a finished block (a rental: the units you kept) — lit windows */
function towerDone() {
  const g = new THREE.Group(); const body = [box(g, 0.9, 1.7, 0.8, '#e7e5e4'), box(g, 0.96, 0.06, 0.86, '#854d0e', 0, 1.7)];
  windows(g, { w: 0.78, y1: 0.6, y2: 1.25, z: 0.4, pane: 0.11 });
  box(g, 0.3, 0.32, 0.02, '#334155', 0, 0, 0.405);
  g.userData.body = body; return g;
}
/** a fenced plot: dirt, a fence, a "for development" board */
function plotFence() {
  const g = new THREE.Group(); box(g, 1.5, 0.04, 1.1, '#b08968', 0, 0, 0, { roughness: 1 });
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.32, 0.035), mat('#78716c'), 16); const o = new THREE.Object3D(); let k = 0;
  for (let i = 0; i < 4; i++) for (const [x, z] of [[-0.75 + i * 0.5, -0.55], [-0.75 + i * 0.5, 0.55], [-0.75, -0.55 + i * 0.367], [0.75, -0.55 + i * 0.367]]) { if (k >= 16) break; o.position.set(x, 0.18, z); o.updateMatrix(); posts.setMatrixAt(k++, o.matrix); }
  g.add(posts);
  for (const z of [-0.55, 0.55]) box(g, 1.52, 0.03, 0.02, '#f59e0b', 0, 0.26, z);
  for (const x of [-0.75, 0.75]) box(g, 0.02, 0.03, 1.12, '#f59e0b', x, 0.26, 0);
  box(g, 0.03, 0.5, 0.03, '#57534e', 0.4, 0, 0.62); box(g, 0.5, 0.26, 0.03, '#facc15', 0.4, 0.36, 0.64);
  const heap = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.24, 7), mat('#8b6b4a', { flatShading: true })); heap.position.set(-0.3, 0.16, -0.1); g.add(heap);
  g.userData.body = []; g.userData.plot = true; return g;
}
/** level (normalised, kind 'build') → slabs standing, columns, crane, tarp, the permit board, the presale banner. null → half built. */
export function paintBuild(g, L) {
  const ud = g && g.userData; if (!ud || !ud.slabs) return false;
  const lv = L && L.kind === 'build' ? L : null;
  const permit = !!(lv && lv.permit), stalled = !!(lv && lv.stalled);
  const pct = lv ? (permit ? 0 : lv.pct) : 0.5;
  const N = ud.slabN; const k = permit ? 0 : Math.max(pct > 0 ? 1 : 0, Math.min(N, Math.round(pct * N)));
  ud.slabs.count = k; ud.slabs.instanceMatrix.needsUpdate = true;
  if (ud.glass) { ud.glass.count = Math.max(0, k - 1); }
  const top = 0.06 + k * (ud.fh || 0.15);
  for (const c of ud.cols || []) { c.visible = k > 0; c.scale.y = Math.max(0.01, top - 0.06); c.position.y = 0.06 + (top - 0.06) / 2; }
  if (ud.tarp) { ud.tarp.visible = stalled && k > 0; if (!ud.bays) { ud.tarp.scale.y = Math.max(0.05, top - 0.06); ud.tarp.position.y = 0.06 + (top - 0.06) / 2; } }
  if (ud.sign) ud.sign.visible = permit || k === 0;
  if (ud.crane) ud.crane.visible = !permit && pct < 1;
  if (ud.banner) { const p = lv ? lv.presold : 0; ud.banner.group.visible = !permit; ud.banner.fill.scale.y = Math.max(0.02, p); ud.banner.fill.position.y = ud.banner.y0 - ud.banner.h / 2 + (ud.banner.h * Math.max(0.02, p)) / 2; }
  ud.buildState = { slabs: k, crane: !!(ud.crane && ud.crane.visible), craneOn: !!(lv ? lv.crane : true) && !stalled && !permit, tarp: !!(ud.tarp && ud.tarp.visible), permit, presold: lv ? lv.presold : 0 };
  return true;
}
/** One step of a working site's crane (the jib turns; scene.js calls it while the scene animates, never under reduced motion). */
export function stepCrane(g, dt) {
  const ud = g && g.userData; const s = ud && ud.buildState; if (!s || !s.craneOn || !ud.jib) return false;
  ud.jib.rotation.y = (ud.jib.rotation.y + (dt || 0) * 0.35) % (Math.PI * 2); s.jib = ud.jib.rotation.y; return true;
}
/** A procedural tower crane for the w8 background when w3's crane.glb is not loaded (scene.js decorCranes). */
export function buildCrane(h = 6) { const g = new THREE.Group(); towerCrane(g, { x: 0, z: 0, h, jib: h * 0.6 }); return shadowAll(g); }

/** Model names that are built here in every world (no GLB is ever requested for them). */
const W78 = Object.freeze({ ...SHOP, ...SITE, stock_pallets: stockPallets, ecom_hub: ecomHub, regional_office: regionalOffice, tower_done: towerDone, plot_fence: plotFence, ...W910, ...W13 });
export const STANDIN_NAMES = Object.freeze([...Object.keys(BUILD), ...Object.keys(PLANT), ...Object.keys(W78)]);
/** Names built here only for a given asset folder (a name another world has a real .glb for). */
const DIR_BUILD = Object.freeze({ w6: Object.freeze({ warehouse: warehouse6 }), w7: Object.freeze({ warehouse: warehouse7 }), ...W1115_DIR, ...W1216_DIR,
  // w12: the HQ / office deals (tower), the trophy division (hotel) and a side business (warehouse) reuse existing stand-ins in w12's folder —
  // no assets/w12/*.glb is ever requested; w2 keeps tower.glb / hotel.glb, w3 warehouse.glb. w16: the farm shop (business) is w7's street shop.
  w12: Object.freeze({ tower: () => towerDone(), hotel: () => BUILD.resort(), warehouse: () => warehouse7() }),
  w16: Object.freeze({ ...W1216_DIR.w16, business: () => SHOP.store_street() }) });
const base = (name) => String(name || '').split('/').pop();
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** Is `name` (in asset folder `dir`) a procedural stand-in? A 'dir/name' model keeps its own folder. */
export function hasStandin(name, dir = null) {
  const s = String(name || ''); const n = base(s); const d = s.includes('/') ? s.split('/')[0] : dir;
  return own(BUILD, n) || own(PLANT, n) || own(W78, n) || !!(d && DIR_BUILD[d] && own(DIR_BUILD[d], n));
}
/** A fresh stand-in group (own geometry / materials: the caller disposes it with the object). */
export function buildStandin(name, dir = null) {
  const s = String(name || ''); const n = base(s); const d = s.includes('/') ? s.split('/')[0] : dir;
  const f = (own(BUILD, n) && BUILD[n]) || (own(PLANT, n) && PLANT[n]) || (own(W78, n) && W78[n]) || (d && DIR_BUILD[d] && DIR_BUILD[d][n]); if (!f) return null;
  const g = shadowAll(f()); g.userData.standin = name;
  if (g.userData.win) { g.userData.win.castShadow = false; g.userData.win.receiveShadow = false; }
  for (const k of ['lamp', 'pips', 'lights', 'sign', 'beacon', 'tarp', 'pulses', 'ticker', 'leds', 'frost', 'face', 'stripe']) if (g.userData[k] && g.userData[k].isMesh) { g.userData[k].castShadow = false; g.userData[k].receiveShadow = false; }
  return g;
}
