// w13 אצטדיון הכוכבים — procedural 3D stand-ins for the world's model keys (w13.js `models`: stadium, billboard, club_shop). No .glb exists
// for them, so scene.js never requests one (standins3d.js hasStandin covers these names) — never a 404, never a grey placeholder box.
//
// The stadium (league.js cityModels → vocab.normLevel kind 'club'): a pitch with its lines, four stands whose height grows with the seats
// (+40 % per expansion, twice at most), a crowd on the stands ∝ the fill (rows of coloured seats, the empty part grey), four floodlight masts
// with lit lamp heads (still — nothing moves, also under reduced motion), a tower crane + scaffold on the east stand while the expansion builds
// (stage 1 / 2), a small training pitch beside it with the training ground, a sprout bed with the academy, and the tier as 1–3 stars on the
// scoreboard. The billboard (kind 'sponsor'): a lit panel on two legs — dark once the contract ended. The club shop: a kiosk with a scarf
// awning. paintClub / paintBillboard are the only writers. Pure three.js, no DOM, no engine import.
import * as THREE from 'three';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const box = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
export const CLUB_RED = '#dc2626', PITCH = '#16a34a', LAMP = '#fef9c3';
const _o = new THREE.Object3D();

/** the pitch: grass + white lines (one thin box per line) */
function pitch(g, w, d, y = 0.04) {
  box(g, w, 0.02, d, PITCH, 0, y, 0, { roughness: 1 });
  const L = (lw, ld, x, z) => box(g, lw, 0.005, ld, '#f8fafc', x, y + 0.02, z, { roughness: 1 });
  L(w * 0.96, 0.012, 0, d * 0.48); L(w * 0.96, 0.012, 0, -d * 0.48); L(0.012, d * 0.96, w * 0.48, 0); L(0.012, d * 0.96, -w * 0.48, 0); L(0.012, d * 0.96, 0, 0);
  const c = new THREE.Mesh(new THREE.TorusGeometry(d * 0.14, 0.006, 4, 32), mat('#f8fafc')); c.rotation.x = Math.PI / 2; c.position.set(0, y + 0.025, 0); g.add(c);
}
/** one stand: a sloped block whose seats are instanced rows (the crowd); the count of red rows = the fill */
const ROWS = 6;
function stand(g, { w, x, z, ry }) {
  const s = new THREE.Group(); s.position.set(x, 0, z); s.rotation.y = ry; s.name = 'standin:stand';
  const body = box(s, w, 0.3, 0.26, '#475569', 0, 0.04, 0.0, { roughness: 0.8 });
  const seats = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 0.94, 0.035, 0.035), mat('#ffffff', { roughness: 0.7 }), ROWS);
  seats.name = 'standin:crowd'; s.add(seats);
  g.add(s); return { s, body, seats };
}
function mast(g, x, z, h) {
  const m = new THREE.Group(); m.position.set(x, 0, z); m.name = 'standin:floodlight';
  cyl(m, 0.025, 0.04, h, '#cbd5e1', 0, 0.04);
  const head = box(m, 0.24, 0.14, 0.05, '#e2e8f0', 0, 0.04 + h, 0, { metalness: 0.3 });
  const lamp = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.1), new THREE.MeshBasicMaterial({ color: LAMP })); lamp.position.set(0, 0.04 + h + 0.07, 0.03); m.add(lamp);
  m.lookAt(0, 0, 0); m.rotation.x = 0; m.rotation.z = 0;
  g.add(m); return lamp;
}
function crane(g, x, z, h = 1.25) {
  const c = new THREE.Group(); c.position.set(x, 0, z); c.name = 'standin:crane';
  box(c, 0.06, h, 0.06, '#eab308', 0, 0.04); box(c, 0.9, 0.05, 0.06, '#eab308', -0.25, 0.04 + h); box(c, 0.14, 0.1, 0.1, '#475569', 0.16, 0.04 + h - 0.08);
  box(c, 0.012, 0.32, 0.012, '#1f2937', -0.6, 0.04 + h - 0.32);
  g.add(c); return c;
}
function stadium() {
  const g = new THREE.Group();
  box(g, 1.9, 0.04, 1.5, '#14532d', 0, 0, 0, { roughness: 1 });   // the ground
  pitch(g, 1.08, 0.7);
  const parts = [stand(g, { w: 1.2, x: 0, z: -0.5, ry: 0 }), stand(g, { w: 1.2, x: 0, z: 0.5, ry: Math.PI }), stand(g, { w: 0.78, x: -0.73, z: 0, ry: Math.PI / 2 }), stand(g, { w: 0.78, x: 0.73, z: 0, ry: -Math.PI / 2 })];
  g.userData.stands = parts;
  g.userData.lamps = [[-0.86, -0.66], [0.86, -0.66], [-0.86, 0.66], [0.86, 0.66]].map(([x, z]) => mast(g, x, z, 0.95));
  const cr = crane(g, 0.95, 0.2); cr.visible = false; g.userData.crane = cr;
  const scaf = box(g, 0.08, 0.5, 0.86, '#a16207', 0.88, 0.04, 0, { roughness: 0.9, transparent: true, opacity: 0.85 }); scaf.visible = false; scaf.name = 'standin:scaffold'; g.userData.scaf = scaf;
  // the training pitch (with the training ground) and the academy's sprout bed — hidden until bought
  const tr = new THREE.Group(); tr.position.set(-0.55, 0, 0.98); pitch(tr, 0.5, 0.32, 0.0); tr.visible = false; tr.name = 'standin:training'; g.add(tr); g.userData.training = tr;
  const ac = new THREE.Group(); ac.position.set(0.55, 0, 0.98); box(ac, 0.36, 0.04, 0.22, '#78350f', 0, 0); for (let k = 0; k < 5; k++) cyl(ac, 0.008, 0.012, 0.09, '#65a30d', -0.14 + k * 0.07, 0.04, 0, 5); ac.visible = false; ac.name = 'standin:academy'; g.add(ac); g.userData.academy = ac;
  // the scoreboard: the tier as 1–3 stars
  const sb = box(g, 0.44, 0.16, 0.04, '#0f172a', 0, 0.4, -0.66); sb.name = 'standin:scoreboard';
  const stars = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: '#facc15' }), 3); stars.position.set(0, 0.48, -0.63); g.add(stars); g.userData.stars = stars;
  g.userData.club = true; paintClub(g, null); return g;
}
/** level (normalised, kind 'club') → stand height ∝ seats (expansions), the crowd ∝ fill, the crane + scaffold while building, training / academy, tier stars, lamps. null → a default. */
export function paintClub(g, L) {
  const ud = g && g.userData; if (!ud || !ud.club) return false;
  const lv = L && L.kind === 'club' ? L : null;
  const expanded = lv ? lv.expanded : 0; const fill = lv ? lv.fill : 0.6; const stage = lv ? lv.stage : 0; const div = lv ? lv.div : 1;
  const hk = 1 + 0.35 * expanded + (stage ? 0.15 * stage : 0);
  const full = Math.round(Math.max(0, Math.min(1, fill)) * ROWS);
  const red = new THREE.Color(CLUB_RED), grey = new THREE.Color('#94a3b8');
  for (const P of ud.stands) {
    P.body.scale.y = hk; P.body.position.y = 0.04 + (0.3 * hk) / 2;
    for (let i = 0; i < ROWS; i++) { const t = i / (ROWS - 1); _o.position.set(0, 0.06 + t * 0.26 * hk, 0.13 - t * 0.22); _o.rotation.set(0, 0, 0); _o.scale.set(1, 1, 1); _o.updateMatrix(); P.seats.setMatrixAt(i, _o.matrix); P.seats.setColorAt(i, i < full ? red : grey); }
    P.seats.instanceMatrix.needsUpdate = true; if (P.seats.instanceColor) P.seats.instanceColor.needsUpdate = true;
  }
  ud.crane.visible = stage > 0; ud.scaf.visible = stage > 0; ud.scaf.scale.y = stage === 2 ? 1.25 : 1;
  ud.training.visible = !!(lv && lv.training); ud.academy.visible = !!(lv && lv.academy);
  ud.stars.count = div + 1; for (let i = 0; i < 3; i++) { _o.position.set((i - div / 2) * 0.1, 0, 0); _o.rotation.set(0, 0, 0); _o.scale.setScalar(1); _o.updateMatrix(); ud.stars.setMatrixAt(i, _o.matrix); } ud.stars.instanceMatrix.needsUpdate = true;
  const lit = !lv || lv.floodlights !== false; for (const l of ud.lamps) l.material.color.set(lit ? LAMP : '#334155');
  ud.clubState = { stage, expanded, standH: Math.round(hk * 100) / 100, crowdRows: full, rows: ROWS, crane: stage > 0, training: ud.training.visible, academy: ud.academy.visible, stars: div + 1, lamps: lit };
  return true;
}
function billboard() {
  const g = new THREE.Group(); box(g, 0.9, 0.04, 0.4, '#14532d');
  for (const sx of [-0.3, 0.3]) box(g, 0.05, 0.5, 0.05, '#64748b', sx, 0.04, 0);
  box(g, 0.86, 0.38, 0.06, '#1f2937', 0, 0.5, 0);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.32), new THREE.MeshBasicMaterial({ color: '#ffffff' })); face.position.set(0, 0.69, 0.035); g.add(face); g.userData.face = face;
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.08), new THREE.MeshBasicMaterial({ color: CLUB_RED })); stripe.position.set(0, 0.6, 0.037); g.add(stripe); g.userData.stripe = stripe;
  g.userData.board = true; paintBillboard(g, null); return g;
}
/** level (kind 'sponsor') → lit (white face, red stripe) or dark (an ended contract) */
export function paintBillboard(g, L) {
  const ud = g && g.userData; if (!ud || !ud.board) return false;
  const lit = !(L && L.kind === 'sponsor' && L.expired);
  ud.face.material.color.set(lit ? '#ffffff' : '#334155'); ud.stripe.material.color.set(lit ? CLUB_RED : '#475569');
  ud.boardState = { lit };
  return true;
}
function clubShop() {
  const g = new THREE.Group(); box(g, 0.9, 0.04, 0.8, '#14532d');
  box(g, 0.66, 0.42, 0.5, '#f8fafc', 0, 0.04, 0);
  for (let k = 0; k < 6; k++) box(g, 0.11, 0.06, 0.18, k % 2 ? '#ffffff' : CLUB_RED, -0.275 + k * 0.11, 0.46, 0.3);   // the scarf awning
  box(g, 0.2, 0.26, 0.02, '#1f2937', 0.12, 0.04, 0.26); box(g, 0.2, 0.14, 0.02, '#93c5fd', -0.16, 0.18, 0.26);
  return g;
}
export const W13 = Object.freeze({ stadium, billboard, club_shop: clubShop });
