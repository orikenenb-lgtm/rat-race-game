// w12 האימפריה / w16 ארץ השדות — procedural 3D parts painted onto the worlds' model keys (no .glb is ever requested):
//
// w12 (holding.js cityModels → vocab.normLevel kind 'div'): a division keeps its home world's stand-in (hotel_beach, factory_metal,
// store_mall, tower_done, solar_field, glass_tower, regional_office; the trophy is w5's resort) and gets a dress: a bronze ANCHOR post with a
// green lamp when HQ guarantees its debt (scene.js draws the guarantee cable from the HQ tower to it), a FENCE around it when it is
// ring-fenced, three health bars on a post (lit = health ≥ 30 / 60 / 80 — words carry the number), a red ring at the base in a deficit, a
// storm cloud with a bolt over it while the running storm hurts its kind, and a grey "no support" plaque when HQ stopped covering it.
//
// w16 (harvest.js cityModels → kind 'farm'): the farm is its own stand-in (w16's warehouse key): a barn, a silo whose fill ∝ the tonnes stored
// and six field plots in front — each painted by its crop and phase (soil while it waits, gold wheat, white cotton, green orchard trees, light
// green saplings), a blue band along its front edge ∝ the share of the crop locked in a hedge or a contract, a blue pipe when irrigated; an empty
// slot shows no plot. paintDiv / paintFarm are the only writers. Nothing steps (no updater). Pure three.js, no DOM, no engine import.
import * as THREE from 'three';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const box = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
export const BRONZE = '#92400e', HQ_GREEN = '#22c55e', DISTRESS = '#dc2626', HEALTH_ON = '#16a34a', HEALTH_OFF = '#475569', FENCE = '#78716c';
const _o = new THREE.Object3D();

/* ---------------- w12: the division dress (added once to the division's stand-in group) */
function divDress(g) {
  const d = new THREE.Group(); d.name = 'standin:div'; g.add(d);
  // the guarantee anchor: a bronze post with a green lamp (the cable from HQ lands on it)
  const anchor = new THREE.Group(); anchor.name = 'standin:anchor'; anchor.position.set(0.62, 0, -0.55); d.add(anchor);
  cyl(anchor, 0.03, 0.045, 0.9, BRONZE, 0, 0, 0, 8, { metalness: 0.6, roughness: 0.35 });
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), new THREE.MeshBasicMaterial({ color: HQ_GREEN })); lamp.position.set(0, 0.95, 0); lamp.name = 'standin:anchorLamp'; anchor.add(lamp);
  // the ring fence: 14 posts + two rails around the base
  const fence = new THREE.Group(); fence.name = 'standin:fence'; d.add(fence);
  const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.26, 0.035), mat(FENCE, { roughness: 0.6 }), 14);
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2; _o.position.set(Math.cos(a) * 0.82, 0.13, Math.sin(a) * 0.82); _o.rotation.set(0, -a, 0); _o.scale.set(1, 1, 1); _o.updateMatrix(); posts.setMatrixAt(i, _o.matrix); }
  fence.add(posts);
  for (const y of [0.1, 0.22]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.012, 4, 42), mat('#a8a29e', { metalness: 0.5, roughness: 0.4 })); r.rotation.x = Math.PI / 2; r.position.y = y; fence.add(r); }
  // health: three bars on a post (front-left)
  const hp = new THREE.Group(); hp.name = 'standin:health'; hp.position.set(-0.66, 0, 0.55); d.add(hp);
  cyl(hp, 0.012, 0.012, 0.42, '#94a3b8', 0, 0);
  const bars = new THREE.InstancedMesh(new THREE.BoxGeometry(0.06, 0.06, 0.03), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 3); bars.name = 'standin:healthBars';
  for (let i = 0; i < 3; i++) { _o.position.set(0, 0.24 + i * 0.075, 0.02); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix(); bars.setMatrixAt(i, _o.matrix); }
  hp.add(bars);
  // a deficit: a red ring at the base
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.88, 0.96, 40), new THREE.MeshBasicMaterial({ color: DISTRESS, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.name = 'standin:distress'; d.add(ring);
  // the storm over it: a dark cloud + a yellow bolt
  const storm = new THREE.Group(); storm.name = 'standin:storm'; storm.position.set(0, 2.35, 0); d.add(storm);
  for (const [x, y, s] of [[-0.18, 0, 0.2], [0.05, 0.06, 0.25], [0.26, 0, 0.18]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), mat('#475569', { roughness: 1 })); c.position.set(x, y, 0); storm.add(c); }
  const bolt = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.32, 4), new THREE.MeshBasicMaterial({ color: '#facc15' })); bolt.rotation.z = Math.PI; bolt.position.set(0.05, -0.3, 0); storm.add(bolt);
  // HQ stopped covering its gaps: a grey plaque with a cross on the anchor side
  const nos = new THREE.Group(); nos.name = 'standin:noSupport'; nos.position.set(0.62, 0, 0.6); d.add(nos);
  box(nos, 0.24, 0.16, 0.03, '#64748b', 0, 0.1, 0); box(nos, 0.2, 0.025, 0.035, '#f8fafc', 0, 0.165, 0).rotation.z = 0.6; box(nos, 0.2, 0.025, 0.035, '#f8fafc', 0, 0.165, 0).rotation.z = -0.6;
  g.userData.div = { d, anchor, lamp, fence, bars, ring, storm, nos };
  return g.userData.div;
}
/** level (normalised, kind 'div') → the guarantee anchor or the fence, the health bars, a deficit, the storm, HQ support off. */
export function paintDiv(g, L) {
  if (!g || !g.userData) return false;
  if (!(L && L.kind === 'div')) { if (g.userData.div) g.userData.div.d.visible = false; return false; }
  const P = g.userData.div || divDress(g); P.d.visible = true;
  P.anchor.visible = !!L.cable; P.fence.visible = !!L.fenced || !!L.fence;
  P.lamp.material.color.set(L.distress ? DISTRESS : HQ_GREEN);
  const lit = Math.max(0, Math.min(3, L.n | 0)); const on = new THREE.Color(L.health < 30 ? DISTRESS : HEALTH_ON), off = new THREE.Color(HEALTH_OFF);
  for (let i = 0; i < 3; i++) P.bars.setColorAt(i, i < lit ? on : off); if (P.bars.instanceColor) P.bars.instanceColor.needsUpdate = true;
  P.ring.visible = !!L.distress; P.storm.visible = !!L.stormHit; P.nos.visible = L.support === false;
  g.userData.divState = { kind2: L.kind2, struct: L.struct, cable: P.anchor.visible, fence: P.fence.visible, health: L.health, bars: lit, distress: P.ring.visible, storm: P.storm.visible, noSupport: P.nos.visible };
  return true;
}

/* ---------------- w16: the farm (w16's warehouse key) */
export const CROP_COLOR = Object.freeze({ soil: '#7c4a21', wheat: '#eab308', cotton: '#f1f5f9', avo: '#15803d', young: '#86efac' });
const PLOTS = [[-0.62, 0.42], [0, 0.42], [0.62, 0.42], [-0.62, -0.08], [0, -0.08], [0.62, -0.08]];
function farm16() {
  const g = new THREE.Group(); g.name = 'standin:farm';
  box(g, 2.0, 0.04, 1.7, '#a3b84a', 0, 0, 0.05, { roughness: 1 });
  // the barn (back-left) and the silo (back-right)
  box(g, 0.62, 0.42, 0.42, '#b91c1c', -0.55, 0.04, -0.55, { roughness: 0.8 });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.4, 0.26, 4, 1), mat('#7f1d1d')); roof.rotation.y = Math.PI / 4; roof.scale.set(1.1, 1, 0.75); roof.position.set(-0.55, 0.59, -0.55); g.add(roof);
  box(g, 0.16, 0.22, 0.02, '#fef3c7', -0.55, 0.04, -0.33);
  const shell = cyl(g, 0.2, 0.2, 0.9, '#cbd5e1', 0.55, 0.04, -0.55, 16, { metalness: 0.5, roughness: 0.4, transparent: true, opacity: 0.55 }); shell.name = 'standin:siloShell';
  const fill = new THREE.Mesh(new THREE.CylinderGeometry(0.185, 0.185, 1, 16), mat('#eab308', { roughness: 0.9 })); fill.name = 'standin:siloFill'; fill.position.set(0.55, 0.04, -0.55); g.add(fill);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.18, 16), mat('#94a3b8', { metalness: 0.5 })); cap.position.set(0.55, 1.03, -0.55); g.add(cap);
  // six plots: soil + a crop layer + the hedge band + the irrigation pipe
  const plots = PLOTS.map(([x, z], i) => {
    const p = new THREE.Group(); p.position.set(x, 0.04, z); p.name = 'standin:field' + i; g.add(p);
    const soil = box(p, 0.54, 0.03, 0.44, CROP_COLOR.soil, 0, 0, 0, { roughness: 1 });
    const crop = box(p, 0.5, 0.06, 0.4, CROP_COLOR.wheat, 0, 0.03, 0, { roughness: 0.9 });
    const trees = new THREE.Group(); trees.name = 'standin:trees'; p.add(trees);
    for (const [tx, tz] of [[-0.15, -0.1], [0.05, -0.1], [-0.05, 0.1], [0.15, 0.1]]) { cyl(trees, 0.012, 0.016, 0.1, '#7a5236', tx, 0.03, tz, 5); const c = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), mat(CROP_COLOR.avo)); c.position.set(tx, 0.18, tz); trees.add(c); }
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.025, 0.06), new THREE.MeshBasicMaterial({ color: '#0284c7' })); hedge.name = 'standin:hedge'; hedge.position.set(0, 0.1, 0.2); p.add(hedge);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.44, 6), mat('#0ea5e9', { roughness: 0.4 })); pipe.rotation.x = Math.PI / 2; pipe.position.set(0.27, 0.05, 0); pipe.name = 'standin:pipe'; p.add(pipe);
    return { p, soil, crop, trees, hedge, pipe };
  });
  g.userData.farm = { plots, fill, shell };
  paintFarm(g, null);
  return g;
}
/** level (normalised, kind 'farm') → each plot's crop / phase, its hedged share, irrigation; the silo's fill (30,000 t = full). */
export function paintFarm(g, L) {
  const F = g && g.userData && g.userData.farm; if (!F) return false;
  const fields = L && L.kind === 'farm' ? L.fields : [{ crop: 'wheat', ph: 'grow', hedged: 0, irr: false }, { crop: 'cotton', ph: 'idle', hedged: 0, irr: false }, null, null, null, null];
  const state = [];
  F.plots.forEach((P, i) => { const f = fields[i];
    P.p.visible = !!f; if (!f) { state.push(null); return; }
    const grow = f.ph === 'grow', young = f.ph === 'young';
    P.crop.visible = (grow || young) && f.crop !== 'avo'; P.trees.visible = f.crop === 'avo' && (grow || young);
    P.crop.material.color.set(f.crop === 'cotton' ? CROP_COLOR.cotton : f.crop === 'wheat' ? CROP_COLOR.wheat : CROP_COLOR.young);
    P.trees.scale.setScalar(young ? 0.6 : 1);
    const h = grow ? Math.max(0, Math.min(1, +f.hedged || 0)) : 0; P.hedge.visible = h > 0; P.hedge.scale.x = Math.max(0.02, h); P.hedge.position.x = -0.25 + 0.25 * h;
    P.pipe.visible = !!f.irr;
    state.push({ crop: f.crop, ph: f.ph, hedged: h, irr: !!f.irr });
  });
  const silo = L && L.kind === 'farm' ? L.silo : 0; const k = Math.max(0, Math.min(1, silo / 30000));
  F.fill.visible = k > 0; F.fill.scale.y = Math.max(0.01, 0.88 * k); F.fill.position.y = 0.04 + (0.88 * k) / 2;
  g.userData.farmState = { fields: state, silo, siloFill: Math.round(k * 100) / 100, regime: L && L.kind === 'farm' ? L.regime : null };
  return true;
}
/** w16's own warehouse = the farm (w3 keeps warehouse.glb; w6 / w7 / w11 their own sheds) */
export const W1216_DIR = Object.freeze({ w16: Object.freeze({ warehouse: farm16 }) });
