// w5 עיר התיירות + w6 אזור התעשייה — procedural 3D stand-ins for the world's model keys (w5.js `models`: hotel_beach, resort, spa, conference,
// waterpark, apartments, restaurant, dive_center, staff_housing). No .glb exists for them, so scene.js never requests one
// (worldModelNames skips STANDIN names) and builds these instead — never a 404, never a grey placeholder box.
//
// Occupancy (season.js cityModels → m.occ / m.occDecile / m.closed, normalised by vocab.normLevel kind 'occ'): every stand-in carries
// ONE InstancedMesh of 10 window panes (`group.userData.win`) — lit panes = the occupancy decile (warm), the rest dark; a closed wing
// turns the right half into shutters; a closed asset (a water park in winter, a half-built park) is all dark. paintWindows() is the
// only writer; scene.js calls it from applyLevelParts. Pure three.js, no DOM, no engine import.
import * as THREE from 'three';

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

/** Model names that are built here in every world (no GLB is ever requested for them). */
export const STANDIN_NAMES = Object.freeze([...Object.keys(BUILD), ...Object.keys(PLANT)]);
/** Names built here only for a given asset folder (a name another world has a real .glb for). */
const DIR_BUILD = Object.freeze({ w6: Object.freeze({ warehouse: warehouse6 }) });
const base = (name) => String(name || '').split('/').pop();
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
/** Is `name` (in asset folder `dir`) a procedural stand-in? A 'dir/name' model keeps its own folder. */
export function hasStandin(name, dir = null) {
  const s = String(name || ''); const n = base(s); const d = s.includes('/') ? s.split('/')[0] : dir;
  return own(BUILD, n) || own(PLANT, n) || !!(d && DIR_BUILD[d] && own(DIR_BUILD[d], n));
}
/** A fresh stand-in group (own geometry / materials: the caller disposes it with the object). */
export function buildStandin(name, dir = null) {
  const s = String(name || ''); const n = base(s); const d = s.includes('/') ? s.split('/')[0] : dir;
  const f = BUILD[n] || PLANT[n] || (d && DIR_BUILD[d] && DIR_BUILD[d][n]); if (!f) return null;
  const g = shadowAll(f()); g.userData.standin = name;
  if (g.userData.win) { g.userData.win.castShadow = false; g.userData.win.receiveShadow = false; }
  for (const k of ['lamp', 'pips']) if (g.userData[k]) { g.userData[k].castShadow = false; g.userData[k].receiveShadow = false; }
  return g;
}
