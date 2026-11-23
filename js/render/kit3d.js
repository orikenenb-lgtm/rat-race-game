// T5 §5.2 / §9.2 — the living-city layer of the 3D board: "owned" plinths with a world-coloured rim, level pips, the
// procedural business stage kit (scaffold, cone, sign, flag, glow ring, people) and upgrade parts (roof band, dome), plus
// sign/activity badges from one runtime icon atlas. Everything that repeats is ONE InstancedMesh for the whole city
// (shared geometry and materials, colour per instance), so a 24-item city costs ≤ 10 extra draw calls + 1 sprite per sign/badge.
// It only draws what scene.js hands it (items with a normalised `level`): no game rule lives here (R-1).
import * as THREE from 'three';
import { kitParts } from './vocab.js';

const CAP = 64;            // city items (8×8 grid max)
const CELLS = ['cup', 'washer', 'box', 'pizza', 'phone', 'shop', 'people', 'rival', 'wrench', 'emptybox', 'garland', 'alert', 'up', 'down', 'star', 'blank', 'heart'];
const ATLAS_COLS = 8, CELL = 64;
const RING = { alert: '#b8322a', down: '#b8322a', up: '#13744a', star: '#8a5a00', heart: '#be185d' };

/* ---------- icon atlas (icons only, no text: R-5) */
function drawCell(g, name, x, y) {
  const cx = x + CELL / 2, cy = y + CELL / 2;
  g.save();
  g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(cx, cy, 29, 0, 7); g.fill();
  g.lineWidth = 4; g.strokeStyle = RING[name] || '#1d1a2b'; g.stroke();
  g.fillStyle = g.strokeStyle = name === 'alert' || name === 'down' ? '#b8322a' : name === 'up' ? '#13744a' : name === 'star' ? '#c98a12' : '#1d1a2b';
  g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  const P = () => g.beginPath();
  switch (name) {
    case 'cup': g.fillRect(cx - 12, cy - 8, 20, 18); P(); g.arc(cx + 10, cy, 6, -1.4, 1.4); g.stroke(); g.fillRect(cx - 15, cy + 12, 26, 3); break;
    case 'washer': g.strokeRect(cx - 14, cy - 15, 28, 30); P(); g.arc(cx, cy + 3, 8, 0, 7); g.stroke(); g.fillRect(cx - 10, cy - 12, 6, 3); break;
    case 'box': case 'emptybox': g.strokeRect(cx - 14, cy - 8, 28, 22); P(); g.moveTo(cx - 14, cy - 8); g.lineTo(cx - 8, cy - 15); g.lineTo(cx + 20, cy - 15); g.lineTo(cx + 14, cy - 8); g.stroke();
      if (name === 'emptybox') { P(); g.moveTo(cx - 8, cy - 2); g.lineTo(cx + 8, cy + 10); g.moveTo(cx + 8, cy - 2); g.lineTo(cx - 8, cy + 10); g.stroke(); } break;
    case 'pizza': P(); g.moveTo(cx, cy + 16); g.lineTo(cx - 15, cy - 12); g.quadraticCurveTo(cx, cy - 19, cx + 15, cy - 12); g.closePath(); g.stroke(); [[-4, -6], [4, -2], [-1, 5]].forEach(([dx, dy]) => { P(); g.arc(cx + dx, cy + dy, 2.6, 0, 7); g.fill(); }); break;
    case 'phone': g.strokeRect(cx - 9, cy - 16, 18, 32); g.fillRect(cx - 3, cy + 10, 6, 3); break;
    case 'shop': g.strokeRect(cx - 13, cy - 2, 26, 16); g.fillRect(cx - 16, cy - 12, 32, 8); g.fillRect(cx - 4, cy + 4, 8, 10); break;
    case 'people': [[-8, 0], [8, 0]].forEach(([dx]) => { P(); g.arc(cx + dx, cy - 7, 5, 0, 7); g.fill(); P(); g.arc(cx + dx, cy + 12, 9, Math.PI, 0); g.fill(); }); break;
    case 'rival': g.strokeRect(cx - 13, cy - 4, 26, 16); g.fillRect(cx - 15, cy - 12, 30, 7); g.strokeStyle = '#b8322a'; P(); g.moveTo(cx - 17, cy - 17); g.lineTo(cx + 17, cy + 17); g.stroke(); break;
    case 'wrench': g.save(); g.translate(cx, cy); g.rotate(-Math.PI / 4); g.fillRect(-3, -4, 6, 22); P(); g.arc(0, -10, 8, 0, 7); g.fill(); g.globalCompositeOperation = 'destination-out'; g.fillRect(-3, -20, 6, 9); g.restore(); break;
    case 'garland': P(); g.moveTo(cx - 17, cy - 8); g.quadraticCurveTo(cx, cy + 8, cx + 17, cy - 8); g.stroke(); [-10, 0, 10].forEach((dx, i) => { g.fillStyle = ['#be185d', '#c98a12', '#2459b8'][i]; P(); g.arc(cx + dx, cy + 4 - Math.abs(dx) * 0.4, 4, 0, 7); g.fill(); }); break;
    case 'alert': P(); g.moveTo(cx, cy - 17); g.lineTo(cx + 17, cy + 13); g.lineTo(cx - 17, cy + 13); g.closePath(); g.fill(); g.fillStyle = '#fffaf0'; g.fillRect(cx - 2, cy - 7, 4, 11); g.fillRect(cx - 2, cy + 7, 4, 3); break;
    case 'up': case 'down': g.save(); g.translate(cx, cy); if (name === 'down') g.rotate(Math.PI); P(); g.moveTo(0, -16); g.lineTo(13, 0); g.lineTo(5, 0); g.lineTo(5, 15); g.lineTo(-5, 15); g.lineTo(-5, 0); g.lineTo(-13, 0); g.closePath(); g.fill(); g.restore(); break;
    case 'heart': g.fillStyle = '#be185d'; P(); g.moveTo(cx, cy + 15); g.bezierCurveTo(cx - 22, cy, cx - 14, cy - 18, cx, cy - 7); g.bezierCurveTo(cx + 14, cy - 18, cx + 22, cy, cx, cy + 15); g.fill(); break;
    case 'star': P(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 8 : 18; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.closePath(); g.fill(); break;
    default: break;
  }
  g.restore();
}
let atlasTex = null;
function atlas() {
  if (atlasTex) return atlasTex;
  const cv = document.createElement('canvas'); cv.width = ATLAS_COLS * CELL; cv.height = Math.ceil(CELLS.length / ATLAS_COLS) * CELL;
  const g = cv.getContext('2d');
  CELLS.forEach((n, i) => drawCell(g, n, (i % ATLAS_COLS) * CELL, Math.floor(i / ATLAS_COLS) * CELL));
  atlasTex = new THREE.CanvasTexture(cv); atlasTex.colorSpace = THREE.SRGBColorSpace;
  return atlasTex;
}
const cellMats = new Map();
/** Sprite material for one atlas cell (textures are clones that share one GPU upload). */
export function iconMaterial(name) {
  if (!CELLS.includes(name)) name = 'shop';
  if (cellMats.has(name)) return cellMats.get(name);
  const base = atlas(); const t = base.clone(); const i = CELLS.indexOf(name);
  const cols = ATLAS_COLS, rows = Math.ceil(CELLS.length / ATLAS_COLS);
  t.repeat.set(1 / cols, 1 / rows); t.offset.set((i % cols) / cols, 1 - (Math.floor(i / cols) + 1) / rows); t.needsUpdate = true;
  const m = new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false });
  cellMats.set(name, m); return m;
}
export const ATLAS_CELLS = CELLS;

/* ---------- the instanced layer */
export function createKit() {
  const group = new THREE.Group(); group.name = 'cityKit';
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.7, ...o });
  const mk = (name, geo, mat, { color = false, shadow = false } = {}) => {
    const m = new THREE.InstancedMesh(geo, mat, CAP); m.name = 'kit:' + name; m.count = 0; m.visible = false; m.frustumCulled = false;
    if (color) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3);
    m.castShadow = shadow; m.receiveShadow = true; group.add(m); return m;
  };
  const softCv = document.createElement('canvas'); softCv.width = softCv.height = 64;
  { const g = softCv.getContext('2d'); const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }
  const softTex = new THREE.CanvasTexture(softCv);
  const plinthMat = std({ color: '#f3ead6', roughness: 0.85 });
  const rimMat = std({ color: '#f2b632', metalness: 0.6, roughness: 0.35, emissive: '#f2b632', emissiveIntensity: 0.15 });
  const M = {
    plinth: mk('plinth', new THREE.CylinderGeometry(1, 1, 1, 24), plinthMat, { color: true }),
    rim: mk('rim', new THREE.TorusGeometry(1, 0.05, 6, 32).rotateX(Math.PI / 2), rimMat, { color: true }),
    blob: mk('blob', new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: softTex, transparent: true, depthWrite: false })),
    pipOn: mk('pipOn', new THREE.CylinderGeometry(0.5, 0.5, 0.35, 12), std({ color: '#f2b632', metalness: 0.75, roughness: 0.3 })),
    pipOff: mk('pipOff', new THREE.TorusGeometry(0.42, 0.09, 5, 16).rotateX(Math.PI / 2), std({ color: '#5f586c', roughness: 0.6 })),
    box: mk('box', new THREE.BoxGeometry(1, 1, 1), std({ color: '#ffffff', roughness: 0.6 }), { color: true, shadow: true }),
    cone: mk('cone', new THREE.ConeGeometry(0.5, 1, 8), std({ color: '#ffffff', roughness: 0.5 }), { color: true }),
    glow: mk('glow', new THREE.TorusGeometry(1, 0.06, 6, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#000000', emissive: '#f2b632', emissiveIntensity: 1.8 })),
    people: mk('people', new THREE.CapsuleGeometry(0.5, 0.9, 2, 6), std({ color: '#ffffff', roughness: 0.8 }), { color: true }),
    // wave 1 (B1 G9): life events (wedding, family home, studies, side gig, rest) are not owned assets — a low hexagonal lawn with
    // a heart badge instead of the round plinth + world rim (different shape, no rim, a badge: not only a colour)
    lifeBase: mk('lifeBase', new THREE.CylinderGeometry(1, 1, 1, 6), std({ color: '#f9dbe8', roughness: 0.95 }), { color: true }),
    dome: mk('dome', new THREE.SphereGeometry(1, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2), std({ color: '#cfe8ff', roughness: 0.15, metalness: 0.2 })),
  };
  const d = new THREE.Object3D(); const col = new THREE.Color();
  const PEOPLE = ['#d9485f', '#3a7bd5', '#1f9d8a', '#e8833a', '#7b5cd6'];
  const sprites = new Map();   // key -> {sign, badge}
  let style = null, tier = 'high';

  function put(m, x, y, z, sx, sy, sz, ry = 0, c = null) {
    const i = m.count++; if (i >= CAP) { m.count = CAP; return; }
    d.position.set(x, y, z); d.rotation.set(0, ry, 0); d.scale.set(sx, sy, sz); d.updateMatrix(); m.setMatrixAt(i, d.matrix);
    if (c && m.instanceColor) { col.set(c); m.setColorAt(i, col); } else if (m.instanceColor) m.setColorAt(i, col.setRGB(1, 1, 1));
  }
  function sprite(key, slot, name, x, y, z, s) {
    let rec = sprites.get(key); if (!rec) { rec = {}; sprites.set(key, rec); }
    if (!name) { if (rec[slot]) { group.remove(rec[slot]); rec[slot] = null; } return; }
    let sp = rec[slot];
    if (!sp) { sp = new THREE.Sprite(iconMaterial(name)); sp.name = 'kit:' + slot; sp.renderOrder = 5; group.add(sp); rec[slot] = sp; }
    if (sp.userData.cell !== name) { sp.material = iconMaterial(name); sp.userData.cell = name; }
    sp.position.set(x, y, z); sp.scale.setScalar(s);
  }

  return {
    group, meshes: M,
    /** world identity: plinth top = a light shade of the board centre, rim = the world's plinth colour (§3) */
    setWorld(ws, centerHex) {
      style = ws;
      plinthMat.color.set(centerHex || '#efe3cb').lerp(new THREE.Color('#ffffff'), 0.45);
      rimMat.color.set(ws.rim); rimMat.emissive.set(ws.rim); rimMat.emissiveIntensity = ws.rimGlow ? 1.1 : 0.15;
      rimMat.metalness = ws.rimGlow ? 0.2 : 0.65;
      M.glow.material.emissive.set(ws.accent);
    },
    setTier(t) { tier = t; },
    /**
     * items: [{key, x, y, z, s, sp, h, rot, level (normalised|null), highlight, badge (atlas cell|null), sign (cell|null)}]
     * h = model height in world units at scale s. Rebuilds every instance (cheap for ≤ 64 items).
     */
    sync(items) {
      for (const m of Object.values(M)) m.count = 0;
      const live = new Set();
      for (const it of items) {
        live.add(it.key);
        const r = Math.max(0.3, Math.min(0.47 * it.sp, 1.05 * it.s)); const top = it.y; const y0 = top - 0.08;
        if (it.life) {
          put(M.lifeBase, it.x, y0 + 0.04, it.z, r * 1.06, 0.08, r * 1.06, Math.PI / 6, it.highlight ? '#ffffff' : null);
          sprite(it.key, 'sign', null);
          sprite(it.key, 'badge', it.badge || 'heart', it.x, top + it.h + 0.4 * it.s, it.z, 0.5 * Math.max(0.6, it.s));
          continue;
        }
        put(M.plinth, it.x, y0 + 0.04, it.z, r, 0.08, r, 0, it.highlight ? '#ffffff' : null);
        put(M.rim, it.x, top, it.z, r, 1, r, 0, it.highlight ? '#ffffff' : null);
        if (it.highlight && M.rim.instanceColor) { col.set(style ? style.rim : '#f2b632').multiplyScalar(1.9); M.rim.setColorAt(M.rim.count - 1, col); }
        if (tier === 'low') put(M.blob, it.x, y0 + 0.005, it.z, r * 1.25, 1, r * 1.25);
        const L = it.level; if (!L || L.kind === 'occ') { sprite(it.key, 'sign', null); sprite(it.key, 'badge', it.badge, it.x, top + it.h + 0.45 * it.s, it.z, 0.62 * Math.max(0.6, it.s)); continue; }   // w5 occupancy: the model's own windows show it (standins3d.js)
        // pips on the camera side of the plinth: filled gold discs vs hollow rings (shape, not only colour)
        const ps = Math.max(0.09, 0.15 * r), gap = ps * 2.3, z = it.z + r * 0.86;
        for (let i = 0; i < L.of; i++) { const x = it.x + (i - (L.of - 1) / 2) * gap; if (i < L.n) put(M.pipOn, x, top + 0.02, z, ps, ps, ps); else put(M.pipOff, x, top + 0.02, z, ps, ps, ps); }
        const P = kitParts(L); const w = 0.8 * it.s, h = it.h;
        if (P.scaffold) {
          const t = Math.max(0.03, 0.045 * it.s), hh = h * 0.95;
          for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) put(M.box, it.x + sx * w * 0.78, top + hh / 2, it.z + sz * w * 0.78, t, hh, t, 0, '#9aa3ad');
          for (const f of [0.42, 0.82]) put(M.box, it.x, top + hh * f, it.z + w * 0.8, w * 1.6, t, t, 0, '#c9a36b');
        }
        if (P.cone) put(M.cone, it.x + r * 0.6, top + 0.12 * it.s, it.z + r * 0.45, 0.16 * it.s, 0.24 * it.s, 0.16 * it.s, 0, '#f97316');
        if (P.sign) {
          const sx = it.x + w * 0.95, sz = it.z + w * 0.55, sh = Math.max(0.35, h * 0.45);
          put(M.box, sx, top + sh / 2, sz, 0.035 * it.s + 0.02, sh, 0.035 * it.s + 0.02, 0, '#3b2a17');
          sprite(it.key, 'sign', it.sign || 'shop', sx, top + sh + 0.18 * it.s, sz, (P.signBig ? 0.62 : 0.46) * Math.max(0.6, it.s));
        } else sprite(it.key, 'sign', null);
        if (P.flag) {
          const fy = top + h, ph = 0.55 * it.s;
          put(M.box, it.x, fy + ph / 2, it.z, 0.03 * it.s, ph, 0.03 * it.s, 0, '#3b2a17');
          put(M.box, it.x + 0.17 * it.s, fy + ph * 0.8, it.z, 0.32 * it.s, 0.18 * it.s, 0.02 * it.s, 0, '#f2b632');
          put(M.cone, it.x, fy + ph + 0.05 * it.s, it.z, 0.08 * it.s, 0.12 * it.s, 0.08 * it.s, 0, '#f2b632');
        }
        if (P.glow) put(M.glow, it.x, top + 0.01, it.z, r * 1.06, 1, r * 1.06);
        if (P.band) put(M.glow, it.x, top + h * 0.9, it.z, w * 0.98, 1.6, w * 0.98);
        if (P.dome) put(M.dome, it.x, top + h * 0.98, it.z, w * 0.42, w * 0.32, w * 0.42);
        if (P.people && tier !== 'low') {
          for (let i = 0; i < P.people; i++) put(M.people, it.x - r * 0.75 + i * 0.16 * it.s, top + 0.13 * it.s, it.z + r * 0.62 - (i % 2) * 0.05, 0.11 * it.s, 0.15 * it.s, 0.11 * it.s, 0, PEOPLE[i % PEOPLE.length]);
        }
        sprite(it.key, 'badge', it.badge, it.x, top + h + (P.flag ? 0.75 : 0.45) * it.s, it.z, 0.62 * Math.max(0.6, it.s));
      }
      for (const [k, rec] of sprites) if (!live.has(k)) { for (const s of Object.values(rec)) if (s) group.remove(s); sprites.delete(k); }
      for (const m of Object.values(M)) {
        m.visible = m.count > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
        if (m.count) m.computeBoundingSphere();
      }
    },
    /** shadow casting per tier (only the kit boxes cast) */
    setShadows(on) { M.box.castShadow = !!on; },
    /** for tests: which parts an item shows, by counting instances is not per item — scene keeps per-item records */
    clear() { this.sync([]); },
    dispose() {
      for (const m of Object.values(M)) { m.geometry.dispose(); m.material.dispose(); m.dispose(); }
      softTex.dispose(); group.clear(); sprites.clear();
    },
  };
}
