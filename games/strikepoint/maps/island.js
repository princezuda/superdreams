// "Harrow Isle" — Dropzone battle-royale island. Rolling hills, pine woods, a central relay hill and five
// points of interest built from the same kits as the handcrafted maps. Flattened pads keep POIs walkable.
import * as THREE from 'three/webgpu';

const POI = [
  { id: 'saltworks', name: 'Saltworks', x: 72, z: -70, r: 34, h: 3 },
  { id: 'quarter', name: 'Old Quarter', x: -72, z: 62, r: 32, h: 2.5 },
  { id: 'pier', name: 'Pier Nine', x: 84, z: 78, r: 26, h: 1.2 },
  { id: 'relay', name: 'Relay Hill', x: 0, z: -40, r: 16, h: 17 },
  { id: 'farm', name: 'Farmstead', x: -80, z: -66, r: 30, h: 4 },
  { id: 'cross', name: 'Crossroads', x: 6, z: 44, r: 24, h: 3.5 },
];
const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rawH(x, z) {
  const n = Math.sin(x * 0.021 + 1.3) * Math.cos(z * 0.017 - 0.4) * 4 + Math.sin(x * 0.047 - z * 0.033) * 2.2 + Math.cos(x * 0.09 + z * 0.11) * 0.8;
  const hill = 15 * Math.exp(-((x) ** 2 + (z + 40) ** 2) / (2 * 34 ** 2));
  const d = Math.hypot(x, z * 1.05) + Math.sin(Math.atan2(z, x) * 5) * 8;
  const land = 1 - sm(118, 146, d);
  return (n + 4 + hill) * land - (1 - land) * 7;
}
function terrain(x, z) {
  let h = rawH(x, z);
  for (const p of POI) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r + 20) { const k = sm(p.r, p.r + 20, d); h = p.h + (h - p.h) * k; } }
  return h;
}
const WATER = -1.0;

export default {
  id: 'island', name: 'Harrow Isle', blurb: 'Dropzone island — six points of interest under a closing storm', island: true,
  bounds: { minX: -150, maxX: 150, minZ: -150, maxZ: 150 }, pois: POI,
  textures: ['grass', 'asphalt', 'concrete', 'plaster', 'roof', 'corrugated', 'wood', 'brick', 'metal'],
  ground: ['grass', 'asphalt'], terrain, waterY: WATER, isWater: (x, z) => terrain(x, z) < WATER + 0.1, navCell: 2, seg: 190, vista: 120, ambience: 'wind sea birds', sunAz: 1.1, maxLights: 4,
  terrainSurf: (x, z) => 'dirt',
  splat: (x, z) => { for (const p of POI) if (Math.hypot(x - p.x, z - p.z) < p.r * 0.75) return 0.85; const road = Math.abs(x - 6) < 3.5 && z > -10 && z < 120 || Math.abs(z - 44) < 3.5 && Math.abs(x) < 110; return road ? 1 : 0; },
  tint: (x, z) => { const h = terrain(x, z); if (h < 0.4) return [1.5, 1.35, 1.0]; const n = Math.sin(x * 0.05) * Math.cos(z * 0.06) * 0.5 + 0.5; return [0.85 + n * 0.2, 0.95 + n * 0.1, 0.7]; },
  build(B, W) {
    const r = B.r; const g = (x, z) => B.ground(x, z);
    const T = [0xf2ece0, 0xeadbc0, 0xe9c99a, 0xd8e0e2, 0xf0d8c8];
    const loot = this.lootSpots = [];
    const L = (x, z, y, chest = false) => loot.push({ x, z, y: y ?? g(x, z), chest });
    const scrap = this.scrap = [];
    // ---------------------------------------------------------------- Saltworks (industrial)
    { const p = POI[0];
      B.building({ x: p.x, z: p.z, w: 22, d: 14, h: 7, y: p.h, mat: 'corrugated', tint: 0x7a8a8a, roof: 'flat', windows: false, doors: [{ side: 's', at: 11, w: 5, h: 4.5 }, { side: 'n', at: 5, w: 1.8 }] });
      for (const [x, z] of [[-6, -2], [5, 3], [0, -4]]) { B.crate(p.x + x, p.z + z, 1.2, { y: p.h }); L(p.x + x + 1.4, p.z + z, p.h + 0.1); }
      B.tank(p.x + 20, p.z - 10, 4, 9, 'paint', 0xc8c0b0); B.tank(p.x + 20, p.z + 4, 4, 9, 'paint', 0xb8b0a0);
      B.container(p.x - 18, p.z + 12, false, 0x8a3324, { y: p.h }); B.container(p.x - 18, p.z + 14.6, false, 0x2b5a86, { y: p.h }); B.container(p.x - 10, p.z + 18, true, 0x2f6b4a, { y: p.h });
      B.barrier(p.x + 4, p.z + 14, 6, 'x', { y: p.h }); L(p.x - 18, p.z + 9, p.h, true); L(p.x + 14, p.z - 3, p.h); L(p.x + 12, p.z + 12, p.h);
      for (const [x, z] of [[-8, 22], [12, 20], [26, -16]]) scrap.push([p.x + x, p.z + z]);
    }
    // ---------------------------------------------------------------- Old Quarter (village)
    { const p = POI[1];
      const H = (dx, dz, w, d, doors, fl) => { B.building({ x: p.x + dx, z: p.z + dz, y: p.h, w, d, h: 3.3, floors: fl, mat: 'plaster', tint: T[Math.floor(r() * T.length)], roof: 'pitched', roofH: Math.min(w, d) * 0.32, roofMat: 'roof', doors, winSpacing: 3, winW: 0.9, frame: 'wood', litChance: 0.3, interiorGlow: true }); B.box(p.x + dx, p.h - 1.5, p.z + dz, w + 0.24, 1.52, d + 0.24, 'concrete', { tint: 0xb8ad98, col: false }); L(p.x + dx, p.z + dz, p.h + 0.1); };
      H(-12, -10, 8, 7, [{ side: 's', at: 4, w: 1.6 }], 2); H(2, -12, 7, 7, [{ side: 's', at: 3.5, w: 1.6 }], 1); H(14, -9, 8, 8, [{ side: 'w', at: 4, w: 1.6 }], 2);
      H(-13, 10, 8, 7, [{ side: 'n', at: 4, w: 1.6 }], 1); H(1, 13, 8, 7, [{ side: 'n', at: 4, w: 1.6 }], 2); H(15, 10, 7, 8, [{ side: 'w', at: 4, w: 1.6 }], 1);
      for (let i = 0; i < 8; i++) { const a = i / 8 * 6.28; B.box(p.x + Math.cos(a) * 2.6, p.h, p.z + Math.sin(a) * 2.6, i % 2 ? 2.0 : 0.4, 0.6, i % 2 ? 0.4 : 2.0, 'concrete', { tint: 0xe0d8c8 }); }
      L(p.x + 5, p.z, p.h, true); B.car(p.x - 4, p.z + 2, true, 0x8a3a2a);
      for (const [x, z] of [[-20, 0], [22, 2], [6, -22]]) scrap.push([p.x + x, p.z + z]);
    }
    // ---------------------------------------------------------------- Pier Nine (port)
    { const p = POI[2];
      const C = [0x8a3324, 0x2b5a86, 0x2f6b4a, 0xb56a1e, 0xc9c6bc];
      for (let i = 0; i < 6; i++) { const x = p.x - 14 + (i % 3) * 7, z = p.z - 6 + Math.floor(i / 3) * 6; B.container(x, z, false, C[i % 5], { y: p.h }); if (i % 2) B.container(x, z, false, C[(i + 2) % 5], { y: p.h + 2.6, cover: false }); }
      B.box(p.x + 12, p.h - 3, p.z + 16, 10, 3.1, 26, 'wood', { tint: 0x9a8a72 }); // pier deck
      for (let k = 0; k < 6; k++) B.geo(new THREE.CylinderGeometry(0.2, 0.2, 5, 8), new THREE.Matrix4().makeTranslation(p.x + 8 + (k % 2) * 8, p.h - 2.5, p.z + 6 + Math.floor(k / 2) * 9), 'wood', { tint: 0x5a4a3a });
      B.building({ x: p.x + 10, z: p.z - 12, y: p.h, w: 10, d: 8, h: 3.6, mat: 'concrete', tint: 0xd0c8b8, roof: 'flat', doors: [{ side: 'w', at: 4, w: 1.6 }], litChance: 0.5 });
      L(p.x + 10, p.z - 12, p.h + 0.1); L(p.x - 7, p.z - 2.5, p.h, true); L(p.x + 12, p.z + 20, p.h + 0.1); L(p.x - 14, p.z + 3, p.h);
      for (const [x, z] of [[-20, 8], [4, -18]]) scrap.push([p.x + x, p.z + z]);
    }
    // ---------------------------------------------------------------- Relay Hill (mast + bunker)
    { const p = POI[3];
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.geo(new THREE.CylinderGeometry(0.12, 0.2, 30, 6), new THREE.Matrix4().compose(new THREE.Vector3(p.x + sx * 1.2, p.h + 15, p.z + sz * 1.2), new THREE.Quaternion().setFromEuler(new THREE.Euler(sz * 0.05, 0, -sx * 0.05)), new THREE.Vector3(1, 1, 1)), 'paint', { tint: 0xc83a2a });
      for (let h = 4; h < 30; h += 4) B.box(p.x, p.h + h, p.z, 2.8 - h * 0.05, 0.12, 2.8 - h * 0.05, 'paint', { col: false, tint: 0xe8e8e8 });
      B.box(p.x, p.h + 30.4, p.z, 0.4, 0.4, 0.4, 'glow', { col: false, tint: [8, 0.3, 0.1], ao: false });
      W.add(p.x - 1.5, p.h, p.z - 1.5, p.x + 1.5, p.h + 30, p.z + 1.5, 'metal');
      B.building({ x: p.x + 8, z: p.z + 2, y: p.h, w: 7, d: 6, h: 2.8, mat: 'concrete', tint: 0x9a9a8a, roof: 'flat', windows: false, doors: [{ side: 's', at: 3.5, w: 1.6 }] });
      B.sandbags(p.x - 6, p.z + 6, 4, 'x', { y: p.h }); B.sandbags(p.x - 8, p.z - 5, 4, 'z', { y: p.h });
      L(p.x + 8, p.z + 2, p.h + 0.1, true); L(p.x - 4, p.z + 4, p.h);
    }
    // ---------------------------------------------------------------- Farmstead (barn + house + fields)
    { const p = POI[4];
      B.building({ x: p.x, z: p.z, y: p.h, w: 14, d: 10, h: 6, mat: 'wood', tint: 0xa84a32, roof: 'pitched', roofH: 4, roofMat: 'corrugated', ridgeX: true, windows: false, doors: [{ side: 's', at: 7, w: 4, h: 4 }, { side: 'n', at: 7, w: 2, h: 2.4 }] });
      for (const [x, z] of [[-4, -2], [3, 2]]) B.box(p.x + x, p.h, p.z + z, 1.4, 1.2, 1.4, 'wood', { tint: 0xd8c070, cover: 'low' });
      B.building({ x: p.x + 18, z: p.z + 6, y: p.h, w: 8, d: 7, h: 3.2, floors: 2, mat: 'plaster', tint: 0xf0e4d0, roof: 'pitched', roofH: 2.4, roofMat: 'roof', doors: [{ side: 'w', at: 3.5, w: 1.6 }], litChance: 0.5 });
      L(p.x, p.z, p.h + 0.1, true); L(p.x + 18, p.z + 6, p.h + 0.1); L(p.x - 10, p.z + 12, p.h);
      B.fence(p.x - 24, p.z + 16, p.x + 8, p.z + 16, 1.2, { y: p.h });
      for (let i = 0; i < 10; i++) B.box(p.x - 22 + i * 3, p.h, p.z + 22, 1.2, 1.2, 1.2, 'cloth', { tint: 0xd8c070, cover: 'low' }); // hay bales
      for (const [x, z] of [[-20, -10], [26, -8]]) scrap.push([p.x + x, p.z + z]);
    }
    // ---------------------------------------------------------------- Crossroads (gas station + motel)
    { const p = POI[5];
      for (const [sx, sz] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) B.box(p.x + sx, p.h, p.z + sz, 0.4, 4.2, 0.4, 'paint', { tint: 0xd8d8d0 });
      B.box(p.x, p.h + 4.2, p.z, 13, 0.5, 9, 'paint', { tint: 0xd8402a, col: false }); B.box(p.x, p.h + 4.1, p.z, 12.6, 0.05, 8.6, 'glow', { col: false, tint: [1.6, 1.6, 1.5], ao: false });
      for (const sx of [-2.5, 2.5]) B.box(p.x + sx, p.h, p.z, 0.8, 1.6, 0.6, 'paint', { tint: 0x2a5a8a, cover: 'low' });
      B.building({ x: p.x + 16, z: p.z - 2, y: p.h, w: 9, d: 8, h: 3.4, mat: 'concrete', tint: 0xe8e0c8, roof: 'flat', doors: [{ side: 'w', at: 4, w: 1.8, glow: true }], litChance: 0.7 });
      B.building({ x: p.x - 4, z: p.z + 16, y: p.h, w: 24, d: 7, h: 3.2, mat: 'plaster', tint: 0xd8c8a8, roof: 'flat', doors: [{ side: 's', at: 4, w: 1.4 }, { side: 's', at: 12, w: 1.4 }, { side: 's', at: 20, w: 1.4 }], litChance: 0.5 });
      L(p.x + 16, p.z - 2, p.h + 0.1, true); L(p.x - 12, p.z + 16, p.h + 0.1); L(p.x + 4, p.z + 16, p.h + 0.1); L(p.x, p.z, p.h);
      B.car(p.x - 12, p.z - 6, false, 0x3a5a7a); B.car(p.x + 6, p.z - 8, false, 0xd8d0c0);
      for (const [x, z] of [[-18, -10], [22, 14]]) scrap.push([p.x + x, p.z + z]);
    }
    // ---------------------------------------------------------------- wilderness: pine woods, rocks, bushes, scattered loot
    for (let i = 0; i < 260; i++) {
      const x = (r() - 0.5) * 270, z = (r() - 0.5) * 270, h = terrain(x, z); if (h < 0.6) continue;
      if (POI.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + 4)) continue;
      const k = r(); if (k < 0.6) B.tree(x, z, 'pine', 0.8 + r() * 0.7); else if (k < 0.82) B.tree(x, z, 'bush', 0.8 + r() * 0.6); else B.rock(x, z, 0.7 + r() * 1.4);
    }
    for (let i = 0; i < 26; i++) { const x = (r() - 0.5) * 220, z = (r() - 0.5) * 220; if (terrain(x, z) < 1) continue; if (POI.some((p) => Math.hypot(x - p.x, z - p.z) < p.r)) continue; L(x, z); }
    for (let i = 0; i < 14; i++) { const x = (r() - 0.5) * 200, z = (r() - 0.5) * 200; if (terrain(x, z) < 1) continue; scrap.push([x, z]); }
    // scrap piles (salvage for building material): wrecked car shells + pallets
    for (const [x, z] of scrap) { const y = g(x, z); B.box(x, y, z, 2.2, 0.9, 1.4, 'rust', { tint: 0x8a6a52 }); B.box(x + 0.3, y + 0.9, z, 1.2, 0.5, 1.2, 'rust', { tint: 0x7a5a42, col: false }); B.palletStack(x + 1.8, z + 0.6, 2); }
    // a couple of lamps for dusk/night
    for (const p of [POI[2], POI[5]]) B.lamp(p.x + 2, p.z - 8, 6, 0xffc88a, { light: B.lights.length < 4 });
  },
  spots: { start: [0, 0, 0] },
};
