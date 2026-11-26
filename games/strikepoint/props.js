// Instanced vegetation / rock prototypes (one draw call per part for every tree on the map).
import { THREE } from '/shared/sd-kit.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function paint(geo, fn) {
  geo = geo.index ? geo.toNonIndexed() : geo; const P = geo.attributes.position; const a = new Float32Array(P.count * 3); const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const c = fn(v); a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo;
}
const ni = (g) => (g.index ? g.toNonIndexed() : g);
function lumpy(geo, amt, seed = 1) { const P = geo.attributes.position; const v = new THREE.Vector3(); for (let i = 0; i < P.count; i++) { v.fromBufferAttribute(P, i); const n = Math.sin(v.x * 7.1 + seed) * Math.cos(v.y * 5.3 + seed * 2) * Math.sin(v.z * 6.7 + seed * 3); v.multiplyScalar(1 + n * amt); P.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); return geo; }

let cached = null;
export function treeProtos(mats) {
  if (cached) return cached;
  const bark = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.95 });
  const leaf = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });
  const rockM = new THREE.MeshStandardNodeMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
  const shade = (base, k = 0.35) => (v) => { const t = 0.65 + Math.min(1, Math.max(0, v.y / 4)) * k; return [base[0] * t, base[1] * t, base[2] * t]; };
  // olive: gnarled trunk + clumped silver-green canopy
  const oT = mergeGeometries([new THREE.CylinderGeometry(0.16, 0.26, 2.2, 7).translate(0, 1.1, 0).rotateZ(0.12), new THREE.CylinderGeometry(0.1, 0.14, 1.2, 6).rotateZ(-0.7).translate(0.45, 2.0, 0)].map(ni));
  const oC = mergeGeometries([[0, 2.9, 0, 1.5], [0.9, 2.6, 0.3, 1.1], [-0.8, 2.7, -0.4, 1.15], [0.2, 3.5, -0.5, 1.0], [-0.3, 3.3, 0.7, 0.95]].map(([x, y, z, r], i) => ni(lumpy(new THREE.IcosahedronGeometry(r, 1), 0.18, i).scale(1, 0.72, 1).translate(x, y, z))));
  // pine: trunk + stacked cones
  const pT = new THREE.CylinderGeometry(0.14, 0.24, 3.2, 7).translate(0, 1.6, 0);
  const pC = mergeGeometries([[2.6, 3.2, 2.2], [2.1, 2.9, 3.9], [1.5, 2.5, 5.4], [0.9, 2.0, 6.7]].map(([r, h, y], i) => ni(lumpy(new THREE.ConeGeometry(r, h, 9, 2), 0.06, i + 3).translate(0, y, 0))));
  const bush = lumpy(new THREE.IcosahedronGeometry(0.9, 1), 0.22, 9).scale(1.2, 0.7, 1.1).translate(0, 0.45, 0);
  const rock = lumpy(new THREE.DodecahedronGeometry(1, 1), 0.2, 4).scale(1.3, 0.75, 1.0).translate(0, 0.35, 0);
  cached = {
    olive: [{ geo: paint(oT, shade([0.32, 0.26, 0.2])), mat: bark }, { geo: paint(oC, shade([0.42, 0.48, 0.34], 0.5)), mat: leaf }],
    pine: [{ geo: paint(pT, shade([0.24, 0.17, 0.12])), mat: bark }, { geo: paint(pC, shade([0.07, 0.15, 0.09], 0.5)), mat: leaf }],
    bush: [{ geo: paint(bush, shade([0.3, 0.38, 0.22], 0.6)), mat: leaf }],
    rock: [{ geo: paint(rock, (v) => { const t = 0.55 + Math.min(1, Math.max(0, (v.y + 0.3) / 1.2)) * 0.45; return [0.5 * t, 0.48 * t, 0.45 * t]; }), mat: rockM }],
  };
  return cached;
}
