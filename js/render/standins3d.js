// w5 עיר התיירות — procedural 3D stand-ins for the world's model keys (w5.js `models`: hotel_beach, resort, spa, conference,
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
/** Model names that are built here (no GLB is ever requested for them). */
export const STANDIN_NAMES = Object.freeze(Object.keys(BUILD));
export function hasStandin(name) { return Object.prototype.hasOwnProperty.call(BUILD, String(name || '').split('/').pop()); }
/** A fresh stand-in group (own geometry / materials: the caller disposes it with the object). */
export function buildStandin(name) {
  const f = BUILD[String(name || '').split('/').pop()]; if (!f) return null;
  const g = shadowAll(f()); g.userData.standin = name;
  if (g.userData.win) { g.userData.win.castShadow = false; g.userData.win.receiveShadow = false; }
  return g;
}
