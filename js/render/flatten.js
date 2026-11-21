// T5 §8.3.2 — flatten a loaded GLB at load time: its primitives (one per material, 6–17 per model) are merged into 1–3 meshes.
// Bucket key: transparent · emissive (colour + intensity) · metal (metalness ≥ 0.5) · roughness rounded to 0.25 · side.
// The base colour is baked into a `color` vertex attribute, so one MeshStandardMaterial({vertexColors:true}) per bucket.
// Kept unmerged: textured materials, `PawnColor` (pawn tint), materials named water (ship plate hidden in w3), and
// "lit window" emissive materials (the stage-1 "lights on" boost targets them). `?flat=0` disables flattening (visual compare).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const KEEP = /^(PawnColor|water)$/i;
export const LIT_RE = /lit\s*window|litwindow/i;
export const flatEnabled = () => { try { return !/[?&]flat=0\b/.test(globalThis.location ? location.search : ''); } catch (e) { return true; } };

function keyOf(m) {
  if (!m || !m.isMeshStandardMaterial || m.map || m.emissiveMap || m.normalMap || m.alphaMap || KEEP.test(m.name || '') || LIT_RE.test(m.name || '')) return null;
  const em = m.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0 && m.emissiveIntensity > 0 ? m.emissive.getHexString() + '@' + m.emissiveIntensity.toFixed(2) : '-';
  return [m.transparent ? 't' + m.opacity.toFixed(2) : 'o', em, m.metalness >= 0.5 ? 'm' : 'd', Math.round(m.roughness * 4) / 4, m.side, m.flatShading ? 'f' : 's'].join('|');
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
    for (const { mat, list } of buckets.values()) {
      const geos = list.map(({ o, rel }) => {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', o.geometry.attributes.position.clone()); g.setAttribute('normal', o.geometry.attributes.normal.clone());
        if (o.geometry.index) g.setIndex(o.geometry.index.clone());
        else { const n = g.attributes.position.count; const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); }
        g.applyMatrix4(rel);
        c.copy(o.material.color); const n = g.attributes.position.count; const col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        return g;
      });
      // mixed 16/32-bit indices can't merge: promote to 32-bit when needed
      if (geos.some((g) => g.index.array instanceof Uint32Array)) for (const g of geos) if (!(g.index.array instanceof Uint32Array)) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(g.index.array), 1));
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) { for (const it of list) kept.push(it); continue; }
      if (geos.length > 1) for (const g of geos) g.dispose();
      merged.computeBoundingBox(); merged.computeBoundingSphere();
      const m = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: mat.roughness, metalness: mat.metalness, transparent: mat.transparent, opacity: mat.opacity,
        side: mat.side, flatShading: mat.flatShading, emissive: mat.emissive, emissiveIntensity: mat.emissiveIntensity, depthWrite: mat.depthWrite, envMapIntensity: mat.envMapIntensity ?? 1 });
      m.name = 'flat:' + list.map((x) => x.o.material.name).join('+').slice(0, 60);
      const mesh = new THREE.Mesh(merged, m); mesh.name = m.name; mesh.userData.flat = true; out.add(mesh);
    }
    for (const { o, rel } of kept) {
      const k = new THREE.Mesh(o.geometry, o.material); k.name = o.name; k.userData = { ...o.userData };
      rel.decompose(k.position, k.quaternion, k.scale); out.add(k);
    }
    return out;
  } catch (e) { console.warn('[flatten]', e); return root; }
}
