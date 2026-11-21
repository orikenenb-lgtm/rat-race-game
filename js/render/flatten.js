// T5 §8.3.2 — flatten a loaded GLB at load time: its primitives (one per material, 6–17 per model) are merged into 1–3 meshes.
// Bucket key: transparent (+opacity) · side · flat shading. Base colour, roughness/metalness and emissive (× intensity) are
// baked into vertex attributes read by one patched MeshStandardMaterial (onBeforeCompile), shared by every flattened model:
// one program and (opaque) one draw call per model. (Spec §8.3 bucketed by metal/roughness/emissive; per-vertex values
// keep the exact look with fewer calls.)
// Kept unmerged: textured materials, `PawnColor` (pawn tint) and materials named water (ship plate hidden in w3). "Lit window"
// vertices are merged but flagged (emi.a = 1), so the stage-1 "lights on" boost is one uniform on a per-item material copy. `?flat=0` disables flattening (visual compare).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = /^(PawnColor|water)$/i;
export const LIT_RE = /lit\s*window|litwindow/i;
export const flatEnabled = () => { try { return !/[?&]flat=0\b/.test(globalThis.location ? location.search : ''); } catch (e) { return true; } };

function keyOf(m) {
  if (!m || !m.isMeshStandardMaterial || m.map || m.emissiveMap || m.normalMap || m.alphaMap || KEEP.test(m.name || '')) return null;
  // roughness, metalness and emissive travel per vertex (see FLAT_PATCH), so only what changes the pipeline splits a bucket
  return [m.transparent ? 't' + m.opacity.toFixed(2) : 'o', m.side, m.flatShading ? 'f' : 's'].join('|');
}
/** one shader variant for every flattened model: base colour, roughness/metalness and emissive come from vertex attributes */
function patch(mat) {
  mat.userData.uLit = mat.userData.uLit || { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uLit = mat.userData.uLit;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 rm; attribute vec4 emi; varying vec2 vRm; varying vec4 vEmi;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRm = rm; vEmi = emi;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLit; varying vec2 vRm; varying vec4 vEmi;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = vRm.x;')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = vRm.y;')
      .replace('#include <emissivemap_fragment>', 'totalEmissiveRadiance = vEmi.rgb * (1.0 + uLit * vEmi.a);'); // a = "lit window" flag
  };
  mat.customProgramCacheKey = () => 'rr-flat-v2';
  return mat;
}
const shared = new Map();   // bucket key → material shared by every flattened model (one program, fewer state changes)
function bucketMaterial(k, mat) {
  if (shared.has(k)) return shared.get(k);
  const m = patch(new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1, metalness: 0, transparent: mat.transparent, opacity: mat.opacity,
    side: mat.side, flatShading: mat.flatShading, depthWrite: mat.depthWrite }));
  m.name = 'flat:' + k; m.userData.sharedFlat = true; shared.set(k, m); return m;
}
/** materials shared by all flattened models must never be disposed with one model */
export const isSharedFlat = (m) => !!(m && m.userData && m.userData.sharedFlat);
/** a per-item copy of a flattened material whose "lit window" vertices glow brighter (business stage ≥ 1: +0.2 emissive) */
export function litCopy(m, boost) {
  const c = patch(m.clone()); c.userData = { uLit: { value: boost } }; c.name = m.name + ':lit'; return c;
}

/** → a new Group with the same look and far fewer meshes (input is left untouched; on any error the input is returned). */
export function flattenModel(root) {
  try {
    root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map(); const kept = []; let meshes = 0;
    root.traverse((o) => {
      if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh) return;
      meshes++;
      const mats = Array.isArray(o.material) ? null : o.material;
      const k = mats ? keyOf(mats) : null;
      const rel = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
      if (!k || !o.geometry.attributes.position || !o.geometry.attributes.normal) { kept.push({ o, rel }); return; }
      if (!buckets.has(k)) buckets.set(k, { mat: mats, list: [] });
      buckets.get(k).list.push({ o, rel });
    });
    if (meshes <= 1) return root;
    const out = new THREE.Group(); out.name = root.name; out.userData = { ...root.userData, flat: true };
    const c = new THREE.Color();
    for (const [k, { mat, list }] of buckets) {
      const geos = list.map(({ o, rel }) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', o.geometry.attributes.position.clone()); g.setAttribute('normal', o.geometry.attributes.normal.clone());
        if (o.geometry.index) g.setIndex(o.geometry.index.clone());
        else { const n = g.attributes.position.count; const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
        g.applyMatrix4(rel);
        const om = o.material; c.copy(om.color); const n = g.attributes.position.count;
        const col = new Float32Array(n * 3), rm = new Float32Array(n * 2), emi = new Float32Array(n * 4); const lit = LIT_RE.test(om.name || '') ? 1 : 0;
        const e = om.emissive ? om.emissive.clone().multiplyScalar(om.emissiveIntensity ?? 1) : new THREE.Color(0, 0, 0);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; rm[i * 2] = om.roughness; rm[i * 2 + 1] = om.metalness; emi[i * 4] = e.r; emi[i * 4 + 1] = e.g; emi[i * 4 + 2] = e.b; emi[i * 4 + 3] = lit; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('rm', new THREE.BufferAttribute(rm, 2)); g.setAttribute('emi', new THREE.BufferAttribute(emi, 4));
        return g;
      });
      // mixed 16/32-bit indices can't merge: promote to 32-bit when needed
      if (geos.some((g) => g.index.array instanceof Uint32Array)) for (const g of geos) if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) { for (const it of list) kept.push(it); continue; }
      if (geos.length > 1) for (const g of geos) g.dispose();
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      const m = bucketMaterial(k, mat);
      const mesh = new THREE.Mesh(merged, m); mesh.name = 'flat:' + list.map((x) => x.o.material.name).join('+').slice(0, 60); mesh.userData.flat = true; out.add(mesh);
    }
    for (const { o, rel } of kept) {
      const k = new THREE.Mesh(o.geometry, o.material); k.name = o.name; k.userData = { ...o.userData };
      rel.decompose(k.position, k.quaternion, k.scale); out.add(k);
    }
    return out;
  } catch (e) { console.warn('[flatten]', e); return root; }
}
