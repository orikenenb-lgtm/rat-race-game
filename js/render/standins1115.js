// w11 התאגיד הבינלאומי / w15 מגדלי הענן — procedural 3D parts painted onto the worlds' shared model keys (no .glb is ever requested):
//
// w11 (multinational.js cityModels → vocab.normLevel kind 'sub'): a subsidiary is the shared regional_office stand-in, dressed per country:
// a flag pole with a FICTIONAL two-colour band (vocab.COUNTRY_BAND — never a real flag; the country is also named in words everywhere), a gold
// glow ring at the base while you run it yourself, the manager's portrait token on a post with a trust ring of 10 segments (lit = the shown
// trust, only what audits and results revealed; a green seal once audited), a red crate + a red ring when its supplier's port is disrupted,
// a second crate stack when it is dual-sourced, a small dome when its currency is hedged. w11 also gets its own warehouse (a port shed with
// stacked containers; w3 keeps its warehouse.glb, w6 / w7 their own sheds).
//
// w15 (platform.js cityModels → kind 'app'): the app is the shared glass_tower stand-in with a runway FUSE along its base (its length ∝ the
// months of cash, 36 = full; red under 6 months, green when the app makes money), a spark at the fuse's end, a cloud of user dots over the
// roof whose count ∝ the users (still: nothing moves here — the board's drifting cloud is scene.js decor and stops under reduced motion),
// and a "sold" flag once the company was sold. paintSub / paintApp are the only writers. Pure three.js, no DOM, no engine import.
import * as THREE from 'three';
import { COUNTRY_BAND } from './vocab.js';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, ...o });
const box = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
export const AMBER = '#f59e0b', TRUST_ON = '#2dd4bf', TRUST_OFF = '#475569', DISRUPT = '#dc2626', VIOLET = '#7c3aed';
const SEGS = 10;
const _o = new THREE.Object3D();

/* ---------------- w11: the subsidiary dress (added once to a regional_office group) */
function subDress(g) {
  const d = new THREE.Group(); d.name = 'standin:sub'; g.add(d);
  const pole = cyl(d, 0.012, 0.012, 0.55, '#cbd5e1', 0.3, 1.66, 0.3, 6, { metalness: 0.5 });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.18), new THREE.MeshBasicMaterial({ color: '#6366f1', side: THREE.DoubleSide })); flag.position.set(0.45, 2.1, 0.3); flag.name = 'standin:flag'; d.add(flag);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.05), new THREE.MeshBasicMaterial({ color: '#e0e7ff', side: THREE.DoubleSide })); stripe.position.set(0.45, 2.1, 0.302); stripe.name = 'standin:flagStripe'; d.add(stripe);
  // a band in the country colour around the roof line (seen from above, where the flag is thin)
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.08, 0.84), new THREE.MeshBasicMaterial({ color: '#6366f1' })); band.position.set(0, 1.5, 0); band.name = 'standin:band'; d.add(band);
  const glow = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.62, 32), new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85, side: THREE.DoubleSide })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; glow.name = 'standin:selfGlow'; d.add(glow);
  // the manager: a token on a post in front of the door, the trust ring around it
  const mg = new THREE.Group(); mg.position.set(-0.5, 0, 0.5); mg.name = 'standin:manager'; d.add(mg);
  cyl(mg, 0.015, 0.015, 0.36, '#94a3b8', 0, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), mat('#fde68a', { roughness: 0.5 })); head.position.set(0, 0.46, 0); mg.add(head);
  const body = box(mg, 0.12, 0.08, 0.06, '#334155', 0, 0.33, 0);
  const ring = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 0.035), new THREE.MeshBasicMaterial({ color: '#ffffff' }), SEGS); ring.name = 'standin:trust';
  for (let i = 0; i < SEGS; i++) { const a = Math.PI / 2 - (i * 2 * Math.PI) / SEGS; _o.position.set(Math.cos(a) * 0.14, 0.46 + Math.sin(a) * 0.14, 0); _o.rotation.set(0, 0, a); _o.scale.set(1, 1, 1); _o.updateMatrix(); ring.setMatrixAt(i, _o.matrix); ring.setColorAt(i, new THREE.Color(TRUST_OFF)); }
  mg.add(ring);
  const seal = new THREE.Mesh(new THREE.OctahedronGeometry(0.035, 0), new THREE.MeshBasicMaterial({ color: '#22c55e' })); seal.position.set(0.12, 0.6, 0); seal.name = 'standin:audited'; mg.add(seal);
  // supply: a disrupted crate (red, tipped) + a red ring; a second-source crate stack; a hedge dome
  const crate = box(d, 0.2, 0.16, 0.2, DISRUPT, 0.5, 0.04, -0.45); crate.rotation.z = 0.35; crate.name = 'standin:disrupted';
  const dring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.72, 32), new THREE.MeshBasicMaterial({ color: DISRUPT, side: THREE.DoubleSide })); dring.rotation.x = -Math.PI / 2; dring.position.y = 0.035; dring.name = 'standin:disruptRing'; d.add(dring);
  const dual = new THREE.Group(); dual.position.set(-0.52, 0, -0.45); dual.name = 'standin:dual'; box(dual, 0.18, 0.14, 0.18, '#a16207', 0, 0.04); box(dual, 0.18, 0.14, 0.18, '#ca8a04', 0, 0.18); d.add(dual);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#67e8f9', transparent: true, opacity: 0.6, roughness: 0.2 })); dome.position.set(0, 0.04, -0.55); dome.name = 'standin:hedged'; d.add(dome);
  g.userData.sub = { d, flag, stripe, band, glow, mg, head, body, ring, seal, crate, dring, dual, dome };
  return g.userData.sub;
}
/** level (normalised, kind 'sub') → the country band, the self-run glow, the manager token + trust ring + seal, disruption, dual source, hedge. */
export function paintSub(g, L) {
  if (!g || !g.userData) return false;
  if (!(L && L.kind === 'sub')) { if (g.userData.sub) g.userData.sub.d.visible = false; return false; }
  const P = g.userData.sub || subDress(g); P.d.visible = true;
  const [c1, c2] = COUNTRY_BAND[L.country] || COUNTRY_BAND.eu;
  P.flag.material.color.set(c1); P.stripe.material.color.set(c2); P.band.material.color.set(c1);
  P.glow.visible = !!L.self;
  P.mg.visible = !!L.managed;
  const lit = L.managed ? Math.max(0, Math.min(SEGS, Math.round((L.trust || 0) * SEGS))) : 0;
  const on = new THREE.Color(TRUST_ON), off = new THREE.Color(TRUST_OFF);
  for (let i = 0; i < SEGS; i++) P.ring.setColorAt(i, i < lit ? on : off); if (P.ring.instanceColor) P.ring.instanceColor.needsUpdate = true;
  P.seal.visible = !!(L.managed && L.audited); P.head.material.color.set(L.managed && L.audited ? '#fde68a' : '#cbd5e1');
  P.crate.visible = !!L.disrupted; P.dring.visible = !!L.disrupted; P.dual.visible = !!L.dual; P.dome.visible = !!L.hedged;
  // a disrupted sub dims its windows' beacon (the regional office's own beacon)
  if (g.userData.beacon) g.userData.beacon.material.color.set(L.disrupted ? DISRUPT : L.self ? AMBER : '#e2e8f0');
  g.userData.subState = { country: L.country, band: c1, self: !!L.self, glow: P.glow.visible, manager: P.mg.visible, trustSegs: lit, segs: SEGS, audited: P.seal.visible, disrupted: P.crate.visible, dual: P.dual.visible, hedged: P.dome.visible };
  return true;
}
/** w11's own warehouse: a port shed with a curved roof and stacked containers in the five districts' colours */
function warehouse11() {
  const g = new THREE.Group(); box(g, 1.3, 0.04, 1.0, '#115e59');
  box(g, 0.9, 0.5, 0.7, '#cbd5e1', -0.12, 0.04, 0, { roughness: 0.6, metalness: 0.2 });
  const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.92, 16, 1, false, 0, Math.PI), mat('#94a3b8', { metalness: 0.4 })); roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.position.set(-0.12, 0.54, 0); roof.scale.set(1, 1, 0.5); g.add(roof);
  box(g, 0.34, 0.3, 0.02, '#1f2937', -0.12, 0.04, 0.36);
  const cs = ['#6366f1', '#f97316', '#10b981', '#eab308', '#e11d48'];
  [[0.5, 0.04, -0.25], [0.5, 0.04, 0.05], [0.5, 0.2, -0.1], [0.5, 0.04, 0.35]].forEach(([x, y, z], i) => box(g, 0.24, 0.15, 0.28, cs[i % cs.length], x, y, z, { roughness: 0.8 }));
  return g;
}

/* ---------------- w15: the app dress (added once to a glass_tower group) */
const CLOUD_MAX = 240;
function appDress(g) {
  const d = new THREE.Group(); d.name = 'standin:app'; g.add(d);
  // the fuse: a dark cord along the front edge, the burning part a coloured cylinder (scaled along x), a spark at its end
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.96, 8), mat('#1f2937')); cord.rotation.z = Math.PI / 2; cord.position.set(0, 0.07, 0.56); d.add(cord);
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1, 8), new THREE.MeshBasicMaterial({ color: '#22c55e' })); fuse.rotation.z = Math.PI / 2; fuse.position.set(0, 0.07, 0.56); fuse.name = 'standin:fuse'; d.add(fuse);
  const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.05, 0), new THREE.MeshBasicMaterial({ color: '#fde047' })); spark.position.set(0.48, 0.07, 0.56); spark.name = 'standin:spark'; d.add(spark);
  // the user cloud over the roof: a fixed pool of dots, drawRange = the shown count
  const pos = new Float32Array(CLOUD_MAX * 3); let s = 9301;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < CLOUD_MAX; i++) { const a = rnd() * Math.PI * 2, r = 0.15 + rnd() * 0.55, h = 1.55 + rnd() * 0.5; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = h; pos[i * 3 + 2] = Math.sin(a) * r; }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const cloud = new THREE.Points(geo, new THREE.PointsMaterial({ color: '#c4b5fd', size: 0.06, sizeAttenuation: true })); cloud.name = 'standin:users'; d.add(cloud);
  const flagP = new THREE.Group(); flagP.name = 'standin:sold'; cyl(flagP, 0.012, 0.012, 0.5, '#e2e8f0', 0, 1.25); const sf = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.16), new THREE.MeshBasicMaterial({ color: '#16a34a', side: THREE.DoubleSide })); sf.position.set(0.14, 1.65, 0); flagP.add(sf); d.add(flagP);
  g.userData.app = { d, fuse, spark, cloud, flagP };
  return g.userData.app;
}
/** users → shown dots (a log scale: 100k ≈ 30, 1M ≈ 120, 6M+ = all 240) */
export const cloudCount = (users) => { const u = Math.max(0, +users || 0); return u <= 0 ? 0 : Math.max(8, Math.min(CLOUD_MAX, Math.round(30 + 90 * Math.log10(Math.max(1, u / 100000)) * 1.0 + (u >= 2000000 ? 30 : 0)))); };
/** level (normalised, kind 'app') → the fuse (length ∝ runway, colour), the spark, the user cloud, the sold flag. */
export function paintApp(g, L) {
  if (!g || !g.userData) return false;
  if (!(L && L.kind === 'app')) { if (g.userData.app) g.userData.app.d.visible = false; return false; }
  const P = g.userData.app || appDress(g); P.d.visible = true;
  const f = L.sold ? 0 : L.profitable ? 1 : Math.max(0.02, Math.min(1, L.runway / 36));
  P.fuse.scale.y = Math.max(0.001, f * 0.96); P.fuse.position.x = -0.48 + (f * 0.96) / 2; P.fuse.visible = !L.sold;
  const col = L.profitable ? '#22c55e' : L.runway < 6 ? DISRUPT : L.runway < 12 ? AMBER : VIOLET; P.fuse.material.color.set(col);
  P.spark.position.x = -0.48 + f * 0.96; P.spark.visible = !L.sold && !L.profitable;
  const n = L.sold ? 0 : cloudCount(L.users); P.cloud.geometry.setDrawRange(0, n); P.cloud.visible = n > 0; P.cloud.material.color.set(L.net ? '#67e8f9' : '#c4b5fd');
  P.flagP.visible = !!L.sold;
  g.userData.appState = { fuse: Math.round(f * 100) / 100, fuseColor: col, spark: P.spark.visible, dots: n, net: !!L.net, sold: !!L.sold };
  return true;
}
export { CLOUD_MAX };
export const W1115_DIR = Object.freeze({ w11: Object.freeze({ warehouse: warehouse11 }) });
