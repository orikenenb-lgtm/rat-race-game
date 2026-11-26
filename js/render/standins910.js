// w9 מדבר האנרגיה + w10 מרכז הפיננסים — procedural 3D stand-ins for the worlds' model keys (w9.js `models`: solar_field, wind_farm, battery_yard,
// solar_storage, pylon_line, h2_pilot, grid_slot, desert_plot; w10.js: stone_block, vault, glass_tower). No .glb exists for them, so scene.js never
// requests one (standins3d.js hasStandin covers these names) — never a 404, never a grey placeholder box.
//
// w9 (energy.js cityModels → vocab.normLevel kind 'energy'): panel rows / turbines / battery containers stand up with the build % (rows = units),
// a mobile crane while a stage works, a red / white barrier while the site stands still, a LOOSE CABLE END on a project without a grid slot, a
// pylon with a wire once connected; an operating plant's current pulses run along its wire at a speed ∝ output (stepEnergy), the turbines turn
// ∝ output — only while the scene animates, never under reduced motion (scene.js calls the steppers from its updaters only).
// w10 (portfolio.js cityModels → kind 'hold'): glass = daily (a glass tower, floors ∝ value, a ticker band that runs and turns red on a margin
// call), stone = monthly (a stone block, a frost veil while the fund is frozen), vault = locked (a vault with a dial). paintEnergy / paintHold
// are the only writers. Pure three.js, no DOM, no engine import.
import * as THREE from 'three';

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });
const box = (g, w, h, d, c, x = 0, y = 0, z = 0, o) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
const cyl = (g, rt, rb, h, c, x = 0, y = 0, z = 0, seg = 10, o) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat(c, o)); m.position.set(x, y + h / 2, z); g.add(m); return m; };
export const PANEL = '#1e3a8a', PULSE = '#67e8f9', SAND = '#e3c27a';

/* ---------------------------------------------------------------- w9 parts */
function pad(g, w, d, c = SAND) { return box(g, w, 0.04, d, c, 0, 0, 0, { roughness: 1 }); }
/** N panel rows (instanced, tilted to the sun): count = the rows standing */
function panelRows(g, { n = 6, w = 1.3, d = 1.0, x0 = 0, z0 = 0 }) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w * 0.9, 0.025, d / n * 0.62), mat(PANEL, { roughness: 0.25, metalness: 0.4 }), n);
  const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { o.position.set(x0, 0.16, z0 - d / 2 + (i + 0.5) * (d / n)); o.rotation.set(-0.45, 0, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
  im.name = 'standin:panels'; g.add(im); g.userData.rows = im; g.userData.rowN = n;
  const legs = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.14, 0.03), mat('#94a3b8'), n * 2);
  for (let i = 0; i < n; i++) for (const sx of [-1, 1]) { o.position.set(x0 + sx * w * 0.4, 0.07, z0 - d / 2 + (i + 0.5) * (d / n)); o.rotation.set(0, 0, 0); o.updateMatrix(); legs.setMatrixAt(i * 2 + (sx > 0 ? 1 : 0), o.matrix); }
  g.add(legs); g.userData.legs = legs;
  return im;
}
function turbine(g, x, z, h = 1.5) {
  const t = new THREE.Group(); t.position.set(x, 0, z); t.name = 'standin:turbine';
  cyl(t, 0.035, 0.06, h, '#f1f5f9'); box(t, 0.16, 0.08, 0.08, '#e2e8f0', 0.03, h - 0.04);
  const hub = new THREE.Group(); hub.position.set(0, h, 0.07); t.add(hub);
  for (let k = 0; k < 3; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.62, 0.015), mat('#f8fafc')); b.position.set(Math.sin(k * 2.094) * 0.3, Math.cos(k * 2.094) * 0.3, 0); b.rotation.z = -k * 2.094; hub.add(b); }
  g.add(t); (g.userData.blades || (g.userData.blades = [])).push(hub); (g.userData.turbines || (g.userData.turbines = [])).push(t);
  return t;
}
function containers(g, { n = 4, x0 = 0, z0 = 0 }) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.22, 0.2), mat('#e5e7eb', { roughness: 0.5 }), n); const o = new THREE.Object3D();
  for (let i = 0; i < n; i++) { o.position.set(x0 + (i % 2 ? 0.28 : -0.28), 0.15, z0 - 0.36 + Math.floor(i / 2) * 0.3); o.updateMatrix(); im.setMatrixAt(i, o.matrix); }
  im.name = 'standin:containers'; g.add(im); g.userData.boxes = im; g.userData.boxN = n;
  const led = new THREE.InstancedMesh(new THREE.BoxGeometry(0.3, 0.03, 0.01), new THREE.MeshBasicMaterial({ color: '#22c55e' }), n);
  for (let i = 0; i < n; i++) { o.position.set(x0 + (i % 2 ? 0.28 : -0.28), 0.2, z0 - 0.36 + Math.floor(i / 2) * 0.3 + 0.105); o.updateMatrix(); led.setMatrixAt(i, o.matrix); }
  led.name = 'standin:leds'; g.add(led); g.userData.leds = led;
  return im;
}
/** the grid side: an inverter box, a pylon + wire (connected), a loose cable end (no slot), the current pulses along the wire */
function gridKit(g, { x = 0.75, z = 0.3 } = {}) {
  box(g, 0.18, 0.16, 0.14, '#cbd5e1', x - 0.25, 0, z);   // inverter / substation box
  const py = new THREE.Group(); py.name = 'standin:pylon'; py.position.set(x, 0, z - 0.3);
  for (const sx of [-0.06, 0.06]) { const l = box(py, 0.02, 0.85, 0.02, '#64748b', sx, 0); l.rotation.z = sx > 0 ? -0.06 : 0.06; }
  box(py, 0.32, 0.02, 0.02, '#64748b', 0, 0.72); g.add(py); g.userData.pylon = py;
  const a = new THREE.Vector3(x - 0.25, 0.16, z), b = new THREE.Vector3(x, 0.72, z - 0.3);
  const wire = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, a.distanceTo(b), 4), new THREE.MeshBasicMaterial({ color: '#1f2937' }));
  wire.position.copy(a).add(b).multiplyScalar(0.5); wire.lookAt(b); wire.rotateX(Math.PI / 2); wire.name = 'standin:wire'; g.add(wire); g.userData.wire = { mesh: wire, a, b };
  // the loose cable end: a curl on the ground with a plug that points nowhere
  const cab = new THREE.Group(); cab.name = 'standin:cable'; cab.position.set(x - 0.25, 0, z);
  const curl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 16, Math.PI * 1.6), mat('#111827')); curl.rotation.x = Math.PI / 2; curl.position.set(0.12, 0.03, 0.05); cab.add(curl);
  box(cab, 0.06, 0.04, 0.035, '#f59e0b', 0.27, 0.01, 0.12); g.add(cab); g.userData.cable = cab;
  const pulses = new THREE.InstancedMesh(new THREE.SphereGeometry(0.022, 6, 4), new THREE.MeshBasicMaterial({ color: PULSE }), 3); pulses.name = 'standin:pulses'; pulses.count = 0; g.add(pulses); g.userData.pulses = pulses;
}
/** a small mobile crane (a stage is being built) and the barrier (the site stands still) */
function siteKit(g, { x = -0.55, z = -0.45 } = {}) {
  const c = new THREE.Group(); c.name = 'standin:crane'; c.position.set(x, 0, z);
  box(c, 0.2, 0.08, 0.12, '#eab308'); const boom = box(c, 0.035, 0.7, 0.035, '#ca8a04', 0, 0.08); boom.rotation.z = -0.55; boom.position.x = 0.18; g.add(c); g.userData.crane = c;
  const bar = new THREE.Group(); bar.name = 'standin:barrier'; for (let i = 0; i < 4; i++) box(bar, 0.16, 0.05, 0.02, i % 2 ? '#f8fafc' : '#dc2626', -0.24 + i * 0.16, 0.12, 0.62); for (const sx of [-0.32, 0.32]) box(bar, 0.025, 0.2, 0.025, '#57534e', sx, 0, 0.62); g.add(bar); g.userData.barrier = bar;
}
function finishEnergy(g, kind) { g.userData.energy = kind; paintEnergy(g, null); return g; }
const EN = {
  solar_field() { const g = new THREE.Group(); pad(g, 1.6, 1.3); panelRows(g, { n: 8, w: 1.25, d: 1.1, x0: -0.1 }); gridKit(g); siteKit(g); return finishEnergy(g, 'solar'); },
  wind_farm() { const g = new THREE.Group(); pad(g, 1.6, 1.3, '#d9b46a'); turbine(g, -0.45, -0.3, 1.5); turbine(g, 0.15, 0.1, 1.7); turbine(g, -0.1, -0.5, 1.4); gridKit(g); siteKit(g, { x: 0.5, z: -0.4 }); return finishEnergy(g, 'wind'); },
  battery_yard() { const g = new THREE.Group(); pad(g, 1.4, 1.2, '#cbd5e1'); containers(g, { n: 6, x0: -0.15, z0: 0.05 }); gridKit(g); siteKit(g); return finishEnergy(g, 'storage'); },
  solar_storage() { const g = new THREE.Group(); pad(g, 1.7, 1.3); panelRows(g, { n: 6, w: 0.95, d: 1.0, x0: -0.3 }); containers(g, { n: 2, x0: 0.45, z0: 0.15 }); gridKit(g, { x: 0.8, z: -0.2 }); siteKit(g); return finishEnergy(g, 'hybrid'); },
  pylon_line() { const g = new THREE.Group(); pad(g, 1.6, 0.6, '#d6b26e'); gridKit(g, { x: 0.55, z: 0.1 }); const p2 = g.userData.pylon.clone(); p2.position.x = -0.55; g.add(p2); return finishEnergy(g, 'line'); },
  h2_pilot() { const g = new THREE.Group(); pad(g, 1.1, 0.9, '#d4d4d8'); const tank = cyl(g, 0.22, 0.22, 0.5, '#e0f2fe', -0.2, 0.04, 0, 14, { roughness: 0.3, metalness: 0.4 }); box(g, 0.34, 0.26, 0.28, '#0e7490', 0.25, 0.04, 0.05);
    g.userData.tank = tank; const x = new THREE.Group(); x.name = 'standin:failed'; for (const r of [0.75, -0.75]) { const b = box(x, 0.5, 0.05, 0.04, '#dc2626', 0, 0, 0); b.position.set(-0.2, 0.62, 0.24); b.rotation.z = r; } x.visible = false; g.add(x); g.userData.failedX = x; return finishEnergy(g, 'h2'); },
  grid_slot() { const g = new THREE.Group(); pad(g, 0.9, 0.8, '#d4d4d8'); box(g, 0.4, 0.34, 0.3, '#64748b', 0, 0.04, -0.1); for (const sx of [-0.12, 0, 0.12]) cyl(g, 0.025, 0.035, 0.18, '#f8fafc', sx, 0.38, -0.1, 6);
    const cab = new THREE.Group(); cab.name = 'standin:cable'; const curl = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.016, 6, 16, Math.PI * 1.6), mat('#111827')); curl.rotation.x = Math.PI / 2; curl.position.set(0.1, 0.06, 0.22); cab.add(curl); box(cab, 0.07, 0.05, 0.04, '#f59e0b', 0.27, 0.04, 0.3); g.add(cab); g.userData.cable = cab;
    return finishEnergy(g, 'slot'); },
  desert_plot() { const g = new THREE.Group(); pad(g, 1.5, 1.1, '#d9b46a'); const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.03, 0.26, 0.03), mat('#78716c'), 12); const o = new THREE.Object3D(); let k = 0;
    for (let i = 0; i < 3; i++) for (const [x, z] of [[-0.72 + i * 0.72, -0.52], [-0.72 + i * 0.72, 0.52], [-0.72, -0.52 + i * 0.52], [0.72, -0.52 + i * 0.52]]) { if (k >= 12) break; o.position.set(x, 0.15, z); o.updateMatrix(); posts.setMatrixAt(k++, o.matrix); }
    g.add(posts); box(g, 0.03, 0.46, 0.03, '#57534e', 0.42, 0, 0.6); box(g, 0.44, 0.22, 0.03, '#06b6d4', 0.42, 0.32, 0.62);
    const dune = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.18, 9), mat('#c9a45c', { flatShading: true })); dune.position.set(-0.25, 0.12, -0.1); g.add(dune); return finishEnergy(g, 'site'); },
};
/** level (normalised, kind 'energy') → rows / turbines / boxes standing, crane, barrier, cable vs pylon + wire, pulses, LEDs. null → operating. */
export function paintEnergy(g, L) {
  const ud = g && g.userData; if (!ud || !ud.energy) return false;
  const lv = L && L.kind === 'energy' ? L : null;
  const op = !lv || lv.n === 4; const slot = !!(lv && lv.slot), plot = !!(lv && lv.plot);
  const pct = !lv ? 1 : op ? 1 : slot || plot || lv.n === 0 ? 0 : lv.pct;
  const show = (n) => Math.max(0, Math.min(n, op ? n : Math.round(pct * n)));
  if (ud.rows) { const k = show(ud.rowN); ud.rows.count = k; ud.legs.count = k * 2; }
  if (ud.turbines) ud.turbines.forEach((t, i) => { t.visible = op || i < show(ud.turbines.length); });
  if (ud.boxes) { const k = show(ud.boxN); ud.boxes.count = k; ud.leds.count = op ? ud.boxN : 0; }
  const out = !lv ? 1 : op && !lv.down ? lv.output : 0;
  if (ud.leds) ud.leds.material.color.set(out > 0 ? '#22c55e' : '#6b7280');
  const cable = !!(lv && (lv.unconnected || lv.cable)) && !op;   // a project without a grid slot: the loose cable end
  if (ud.cable) ud.cable.visible = ud.energy === 'slot' ? true : cable;
  if (ud.pylon) ud.pylon.visible = !cable && (op || ud.energy === 'line' || !lv || lv.n >= 1);
  if (ud.wire) ud.wire.mesh.visible = !cable && op;
  if (ud.crane) ud.crane.visible = !!(lv && lv.crane);
  if (ud.barrier) ud.barrier.visible = !!(lv && lv.stalled);
  if (ud.failedX) { ud.failedX.visible = !!(lv && lv.failed); ud.tank.material.color.set(lv && lv.failed ? '#9ca3af' : '#e0f2fe'); }
  if (ud.pulses) { ud.pulses.count = op && out > 0 ? 3 : 0; ud.pulses.instanceMatrix.needsUpdate = true; }
  ud.energyState = { op, output: out, rows: ud.rows ? ud.rows.count : null, turbines: ud.turbines ? ud.turbines.filter((t) => t.visible).length : null, boxes: ud.boxes ? ud.boxes.count : null,
    cable: !!(ud.cable && ud.cable.visible), wire: !!(ud.wire && ud.wire.mesh.visible), crane: !!(ud.crane && ud.crane.visible), barrier: !!(ud.barrier && ud.barrier.visible), pulses: ud.pulses ? ud.pulses.count : 0,
    failed: !!(lv && lv.failed), phase: ud.energyState ? ud.energyState.phase || 0 : 0, spin: ud.energyState ? ud.energyState.spin || 0 : 0 };
  if (ud.pulses && ud.pulses.count) placePulses(ud);
  return true;
}
const _o = new THREE.Object3D(); const _v = new THREE.Vector3();
function placePulses(ud) {
  const W = ud.wire; const s = ud.energyState; if (!W) return;
  for (let i = 0; i < ud.pulses.count; i++) { const f = (s.phase + i / 3) % 1; _v.copy(W.a).lerp(W.b, f); _o.position.copy(_v); _o.updateMatrix(); ud.pulses.setMatrixAt(i, _o.matrix); }
  ud.pulses.instanceMatrix.needsUpdate = true;
}
/** One animation step of a plant: the current pulses run along the wire and the blades turn, both at a speed ∝ output (0 → nothing moves). */
export function stepEnergy(g, dt) {
  const ud = g && g.userData; const s = ud && ud.energyState; if (!s || !s.op || !(s.output > 0)) return false;
  const v = Math.max(0, Math.min(1.5, s.output));
  if (ud.pulses && ud.pulses.count) { s.phase = (s.phase + (dt || 0) * 0.6 * v) % 1; placePulses(ud); }
  if (ud.blades) { for (const h of ud.blades) h.rotation.z -= (dt || 0) * 2.2 * v; s.spin += (dt || 0) * 2.2 * v; }
  return true;
}

/* ---------------------------------------------------------------- w10 parts */
export const HOLD_COLOR = Object.freeze({ glass: '#7dd3fc', stone: '#d6c7a1', vault: '#475569', gold: '#d4af37', call: '#dc2626' });
function floorsKit(g, { w, d, n = 6, fh = 0.26, c, o = {} }) {
  const im = new THREE.InstancedMesh(new THREE.BoxGeometry(w, fh * 0.94, d), mat(c, o), n); const t = new THREE.Object3D();
  for (let i = 0; i < n; i++) { t.position.set(0, 0.04 + fh * i + fh / 2, 0); t.updateMatrix(); im.setMatrixAt(i, t.matrix); }
  im.name = 'standin:floors'; im.castShadow = true; g.add(im); g.userData.floors = im; g.userData.floorN = n; g.userData.fh = fh; return im;
}
function glassTower() {
  const g = new THREE.Group(); box(g, 1.0, 0.04, 1.0, '#334155');
  floorsKit(g, { w: 0.72, d: 0.72, n: 6, fh: 0.3, c: HOLD_COLOR.glass, o: { roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.88 } });
  // the ticker band: a gold ring of small dashes that runs around the top floor (stepTicker), all red on a margin call (still under reduced motion)
  const band = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.05, 0.012), new THREE.MeshBasicMaterial({ color: HOLD_COLOR.gold }), 24); band.name = 'standin:ticker'; g.add(band); g.userData.ticker = band;
  const cap = box(g, 0.76, 0.04, 0.76, HOLD_COLOR.gold, 0, 0, 0, { metalness: 0.6, roughness: 0.3 }); g.userData.cap = cap;
  g.userData.hold = 'daily'; paintHold(g, null); return g;
}
function stoneBlock() {
  const g = new THREE.Group(); box(g, 1.0, 0.04, 0.9, '#57534e');
  floorsKit(g, { w: 0.82, d: 0.7, n: 5, fh: 0.22, c: HOLD_COLOR.stone, o: { roughness: 0.95 } });
  for (const sx of [-0.3, -0.1, 0.1, 0.3]) box(g, 0.06, 0.42, 0.06, '#f5f5f4', sx, 0.04, 0.37);   // columns
  const frost = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1, 0.78), new THREE.MeshStandardMaterial({ color: '#e0f2fe', transparent: true, opacity: 0.55, roughness: 0.2 })); frost.name = 'standin:frost'; frost.visible = false; g.add(frost); g.userData.frost = frost;
  g.userData.hold = 'monthly'; paintHold(g, null); return g;
}
function vault() {
  const g = new THREE.Group(); box(g, 0.9, 0.04, 0.9, '#334155');
  floorsKit(g, { w: 0.7, d: 0.62, n: 4, fh: 0.2, c: HOLD_COLOR.vault, o: { roughness: 0.4, metalness: 0.6 } });
  const door = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 20), mat('#94a3b8', { metalness: 0.8, roughness: 0.3 })); door.rotation.x = Math.PI / 2; door.position.set(0, 0.28, 0.33); g.add(door);
  const dial = new THREE.Group(); dial.position.set(0, 0.28, 0.37); for (let k = 0; k < 3; k++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.02), mat(HOLD_COLOR.gold, { metalness: 0.7 })); s.rotation.z = k * 1.047; dial.add(s); } g.add(dial); g.userData.dial = dial;
  g.userData.hold = 'locked'; paintHold(g, null); return g;
}
/** level (normalised, kind 'hold') → floors ∝ value, the ticker colour (red on a call), the frost veil, the dial. null → 4 floors. */
export function paintHold(g, L) {
  const ud = g && g.userData; if (!ud || !ud.hold) return false;
  const lv = L && L.kind === 'hold' ? L : null;
  const k = Math.max(1, Math.min(ud.floorN, lv ? lv.floors ?? lv.n : 4)); ud.floors.count = k; ud.floors.instanceMatrix.needsUpdate = true;
  const top = 0.04 + k * ud.fh;
  if (ud.cap) ud.cap.position.y = top + 0.02;
  if (ud.frost) { ud.frost.visible = !!(lv && lv.frozen); ud.frost.scale.y = top; ud.frost.position.y = top / 2; }
  if (ud.dial) ud.dial.visible = true;
  const call = !!(lv && lv.call);
  if (ud.ticker) { ud.ticker.material.color.set(call ? HOLD_COLOR.call : HOLD_COLOR.gold); placeTicker(ud, top - ud.fh * 0.35, ud.holdState ? ud.holdState.phase || 0 : 0); }
  ud.holdState = { cls: ud.hold, floors: k, call, frozen: !!(ud.frost && ud.frost.visible), phase: ud.holdState ? ud.holdState.phase || 0 : 0, y: top };
  return true;
}
function placeTicker(ud, y, phase) {
  const n = ud.ticker.count; const r = 0.4;
  for (let i = 0; i < n; i++) { const f = ((i / n) + phase) % 1; const side = Math.floor(f * 4); const t = (f * 4) % 1; const a = -r + 2 * r * t;
    const [x, z, ry] = side === 0 ? [a, r, 0] : side === 1 ? [r, -a, Math.PI / 2] : side === 2 ? [-a, -r, Math.PI] : [-r, a, -Math.PI / 2];
    _o.position.set(x, y, z); _o.rotation.set(0, ry, 0); _o.updateMatrix(); ud.ticker.setMatrixAt(i, _o.matrix); }
  ud.ticker.instanceMatrix.needsUpdate = true;
}
/** One step of the ticker band (it runs around the tower; on a margin call it blinks red / dark red). Only while the scene animates. */
export function stepTicker(g, dt, t = 0) {
  const ud = g && g.userData; const s = ud && ud.holdState; if (!s || !ud.ticker) return false;
  s.phase = (s.phase + (dt || 0) * 0.08) % 1; placeTicker(ud, s.y - ud.fh * 0.35, s.phase);
  if (s.call) ud.ticker.material.color.set(Math.floor((t || 0) * 3) % 2 ? '#7f1d1d' : HOLD_COLOR.call);
  return true;
}
export const W910 = Object.freeze({ ...EN, glass_tower: glassTower, stone_block: stoneBlock, vault });
