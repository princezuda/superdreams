// "Calvera" — sun-bleached hillside village. Road climbs from the south into a walled village core
// (plaza + market, two crossing streets, alleys for flanks), then up a stair-cut slope to the church
// plateau and bell tower that overwatches everything.
import * as THREE from 'three/webgpu';

const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function base(z) { if (z > 22) return -(z - 22) * 0.12; if (z < -30) return sm(-30, -42, z) * 5; return 0; }
function terrain(x, z) {
  const edge = Math.max(0, Math.abs(x) - 58) + Math.max(0, -z - 64) * 0.8 + Math.max(0, z - 70) * 0.3;
  const und = Math.sin(x * 0.11) * Math.cos(z * 0.09) * 0.35 + Math.sin(x * 0.031 + z * 0.023) * 0.6;
  const core = Math.abs(x) < 46 && z > -62 && z < 24 ? 0 : 1;
  return base(z) + Math.pow(edge, 1.25) * 0.55 + und * core * (Math.abs(x) > 6 ? 1 : 0.2);
}
function street(x, z) {
  if (Math.hypot(x, z) < 14) return 1; if (Math.abs(x) < 4 && z > -44 && z < 70) return 1; if (Math.abs(z) < 3.5 && Math.abs(x) < 44) return 1;
  if (Math.hypot(x, z + 50) < 13) return 1; if (Math.abs(z + 20) < 2.6 && Math.abs(x) < 30) return 1; return 0;
}

export default {
  id: 'village', name: 'Calvera', blurb: 'Sun-bleached hillside village',
  bounds: { minX: -64, maxX: 64, minZ: -66, maxZ: 68 },
  textures: ['plaster', 'roof', 'wood', 'concrete', 'cobble', 'grass', 'brick'],
  ground: ['cobble', 'grass'], groundRough: 1, terrain, sunAz: 2.3, sunEl: { day: 52, dusk: 8 }, ambience: 'wind birds', navCell: 1, seg: 140,
  terrainSurf: (x, z) => (street(x, z) ? 'concrete' : 'dirt'),
  splat: (x, z) => { let s = 1 - street(x, z); const n = Math.sin(x * 0.7) * Math.cos(z * 0.6) * 0.5 + 0.5; if (s === 0 && n > 0.86) s = 0.4; return s; },
  tint: (x, z) => { const n = Math.sin(x * 0.13 + z * 0.07) * 0.5 + 0.5; return street(x, z) ? [1.05, 1.0, 0.92] : [1.1 + n * 0.15, 1.0 + n * 0.08, 0.72]; },
  build(B, W) {
    const r = B.r; const T = [0xf2ece0, 0xeadbc0, 0xe9c99a, 0xd8e0e2, 0xf0d8c8, 0xe4e0cf, 0xd9c7a8];
    const tint = () => T[Math.floor(r() * T.length)];
    const house = (x, z, w, d, o = {}) => {
      const y = B.ground(x, z);
      const b = B.building({ x, z, w, d, y, h: o.h ?? 3.3, floors: o.floors ?? (r() < 0.55 ? 2 : 1), mat: 'plaster', tint: o.tint ?? tint(), roof: 'pitched', roofH: Math.min(w, d) * 0.32, roofMat: 'roof', ridgeX: o.ridgeX ?? w >= d,
        doors: o.doors ?? [], winSpacing: 3.0, winW: 0.9, winH: 1.25, frame: 'wood', glow: 0xffc070, litChance: 0.35, interiorGlow: !!o.doors?.length, shutters: [0x3a6a5a, 0x4a5a7a, 0x7a4a2a, 0x5a7a4a, 0x8a3a2a][Math.floor(r() * 5)] });
      // shutters + sills give the plaster faces some rhythm
      B.box(x, y - 1.5, z, w + 0.24, 1.52, d + 0.24, 'concrete', { tint: 0xb8ad98, col: false });
      if (o.balcony) { const bz = z + d / 2 + 0.6; B.box(x, y + 3.2, bz, w * 0.5, 0.15, 1.2, 'concrete', { tint: 0xd8d0c0 }); B.box(x, y + 3.35, bz + 0.55, w * 0.5, 0.9, 0.06, 'wood', { tint: 0x5a3a24, col: false }); }
      return b;
    };
    // ---------------------------------------------------------------- core blocks around the plaza (streets at x≈0, z≈0)
    // NW block
    house(-12, -12, 8, 7, { doors: [{ side: 's', at: 4, w: 1.6 }, { side: 'e', at: 3.5, w: 1.5 }], floors: 2, balcony: true });
    house(-22, -11, 7, 8, { doors: [{ side: 's', at: 2.5, w: 1.5 }] });
    house(-32, -12, 9, 7, {});
    house(-15, -27, 10, 8, { doors: [{ side: 'n', at: 5, w: 1.6 }, { side: 's', at: 5, w: 1.6 }], floors: 2 });
    house(-28, -27, 8, 8, { floors: 1 });
    // NE block
    house(12, -12, 8, 7, { doors: [{ side: 's', at: 2, w: 1.6 }, { side: 'w', at: 3.5, w: 1.5 }], floors: 2 });
    house(22, -12, 7, 7, { doors: [{ side: 's', at: 3.5, w: 1.5 }, { side: 'n', at: 3.5, w: 1.5 }] });
    house(33, -11, 9, 8, { floors: 2 });
    house(15, -27, 9, 8, { doors: [{ side: 's', at: 4.5, w: 1.6 }] });
    house(28, -28, 10, 7, { floors: 2, balcony: true });
    // SW block
    house(-12, 12, 8, 7, { doors: [{ side: 'n', at: 4, w: 1.6 }, { side: 'e', at: 3.5, w: 1.5 }], floors: 2, balcony: true });
    house(-22, 11, 7, 8, { doors: [{ side: 'n', at: 3.5, w: 1.5 }, { side: 's', at: 3.5, w: 1.5 }] });
    house(-33, 12, 9, 7, {});
    house(-14, 24, 9, 7, {});
    // SE block
    house(12, 12, 8, 7, { doors: [{ side: 'n', at: 2.5, w: 1.6 }, { side: 'w', at: 3.5, w: 1.5 }], floors: 2 });
    house(22, 12, 7, 8, { doors: [{ side: 'n', at: 3.5, w: 1.5 }] });
    house(33, 11, 9, 8, { floors: 2, balcony: true });
    house(15, 24, 10, 7, {});
    // ---------------------------------------------------------------- plaza: fountain, market stalls, relay mast
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = Math.cos(a) * 3.2, z = Math.sin(a) * 3.2; B.box(x, 0, z, i % 2 ? 2.6 : 0.5, 0.7, i % 2 ? 0.5 : 2.6, 'concrete', { tint: 0xe0d8c8 }); }
    B.box(0, 0, 0, 4.6, 0.35, 4.6, 'concrete', { tint: 0x8aa0a8, col: false });
    B.geo(new THREE.CylinderGeometry(0.4, 0.6, 2.2, 10), new THREE.Matrix4().makeTranslation(0, 1.1, 0), 'concrete', { tint: 0xe8e0d0, groundY: 0 });
    B.geo(new THREE.CylinderGeometry(1.1, 0.5, 0.35, 12), new THREE.Matrix4().makeTranslation(0, 2.2, 0), 'concrete', { tint: 0xe8e0d0 });
    W.add(-0.6, 0, -0.6, 0.6, 2.4, 0.6, 'concrete'); B.coverAround(0, 0, 7, 7, 'low');
    const stall = (x, z, col, rotZ = false) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.box(x + sx * (rotZ ? 0.9 : 1.3), 0, z + sz * (rotZ ? 1.3 : 0.9), 0.1, 2.3, 0.1, 'wood', { tint: 0x7a5a3a, col: false });
      B.box(x, 0, z, rotZ ? 1.6 : 2.4, 0.9, rotZ ? 2.4 : 1.6, 'wood', { tint: 0xa08060, cover: 'low' });
      B.geo(new THREE.BoxGeometry(rotZ ? 2.2 : 3.0, 0.05, rotZ ? 3.0 : 2.2), new THREE.Matrix4().compose(new THREE.Vector3(x, 2.35, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rotZ ? 0 : 0.18, 0, rotZ ? 0.18 : 0)), new THREE.Vector3(1, 1, 1)), 'cloth', { tint: col });
      for (let i = 0; i < 5; i++) B.box(x + (r() - 0.5) * 1.6, 0.9, z + (r() - 0.5) * 1, 0.3, 0.22, 0.3, 'wood', { col: false, tint: [0xc04a2a, 0xd8a030, 0x6a8a3a][i % 3] });
    };
    stall(-8, -6.5, 0xb83a2a); stall(8, 6.5, 0x2a6ab8); stall(-8, 6.8, 0xd8a83a, true); stall(7.5, -7, 0x3a8a5a, true);
    // relay mast (jammer objective)
    B.box(6, 0, -2.5, 1.2, 1.2, 1.2, 'paint', { tint: 0x5a6470, cover: 'low' });
    B.geo(new THREE.CylinderGeometry(0.06, 0.1, 9, 6), new THREE.Matrix4().makeTranslation(6, 5.7, -2.5), 'paint', { tint: 0x9aa0a8 });
    for (const h of [4, 6.5, 9]) B.box(6, 1.2 + h, -2.5, 0.9, 0.06, 0.06, 'paint', { col: false, tint: 0x9aa0a8 });
    B.box(6, 10.3, -2.5, 0.15, 0.15, 0.15, 'glow', { col: false, tint: [6, 0.4, 0.2], ao: false });
    // ---------------------------------------------------------------- streets furniture: carts, walls, crates, trees
    B.car(-2.5, 16, true, 0x8a3a2a); B.car(2.4, -20, true, 0x3a5a7a); B.car(-30, -2.0, false, 0xd8d0c0);
    for (const [x, z, s] of [[-4.6, 30, 1.0], [5.2, 34, 1.2], [4.4, 46, 1.0], [-5, 52, 1.1], [-26, 3.5, 1], [26, -3.5, 1.1], [40, 2.5, 1], [-40, -3, 1]]) B.crate(x, z, s);
    // low stone field walls on the south slope (approach cover)
    const sw = (x1, z1, x2, z2) => B.wall(x1, z1, x2, z2, 1.05, 0.55, 'brick', { tint: 0xd8c8b0 });
    sw(-14, 36, -6, 36); sw(6, 40, 16, 40); sw(-20, 48, -8, 48); sw(8, 54, 20, 54); sw(-12, 60, -6, 60);
    for (const [x1, z1, x2, z2] of [[-14, 36, -6, 36], [6, 40, 16, 40], [-20, 48, -8, 48], [8, 54, 20, 54], [-12, 60, -6, 60]]) B.coverAround((x1 + x2) / 2, z1, Math.abs(x2 - x1), 0.55, 'low', 'ns');
    // village perimeter wall (west/east) with gates at the E-W street
    B.wall(-46, -40, -46, -4, 2.6, 0.6, 'brick', { tint: 0xc8b8a0 }); B.wall(-46, 4, -46, 30, 2.6, 0.6, 'brick', { tint: 0xc8b8a0 });
    B.wall(46, -40, 46, -4, 2.6, 0.6, 'brick', { tint: 0xc8b8a0 }); B.wall(46, 4, 46, 30, 2.6, 0.6, 'brick', { tint: 0xc8b8a0 });
    // ---------------------------------------------------------------- church plateau (z≈-50, +5m)
    const cy = B.ground(0, -52);
    B.building({ x: 9, z: -54, w: 10, d: 16, y: cy, h: 8, mat: 'plaster', tint: 0xf4efe4, roof: 'pitched', roofH: 3, roofMat: 'roof', ridgeX: false, doors: [{ side: 'w', at: 8, w: 2.2, h: 3 }], winSpacing: 4, winH: 2.2, winW: 1.0, litChance: 0.3 });
    // bell tower with open belfry (marksman perch)
    const tx = -4, tz = -50;
    B.box(tx, cy, tz, 4.2, 12.5, 4.2, 'plaster', { tint: 0xf0e8d8 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(tx + sx * 1.8, cy + 12.5, tz + sz * 1.8, 0.6, 3.2, 0.6, 'plaster', { tint: 0xf0e8d8 });
    B.box(tx, cy + 12.4, tz, 4.4, 0.25, 4.4, 'concrete', { tint: 0xd8d0c0 });
    B.box(tx, cy + 15.7, tz, 4.8, 0.4, 4.8, 'concrete', { tint: 0xd8d0c0 });
    B.pitchedRoof(tx, cy + 16.1, tz, 4.8, 4.8, 2.6, 'roof', true);
    B.geo(new THREE.CylinderGeometry(0.5, 0.8, 1.1, 10, 1, true), new THREE.Matrix4().makeTranslation(tx, cy + 14.6, tz), 'paint', { tint: 0x8a6a30 });
    for (const [sx, sz] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) B.box(tx + sx * 2.1, cy + 12.65, tz + sz * 2.1, sx ? 0.15 : 3.6, 0.9, sz ? 0.15 : 3.6, 'plaster', { tint: 0xf0e8d8 });
    // plateau retaining wall + central stair
    B.wall(-30, -40.5, -3, -40.5, 1.0, 0.6, 'brick', { tint: 0xc8b8a0, y: cy - 0.2 }); B.wall(3, -40.5, 30, -40.5, 1.0, 0.6, 'brick', { tint: 0xc8b8a0, y: cy - 0.2 });
    B.coverAround(-16.5, -40.5, 27, 0.6, 'low', 'n'); B.coverAround(16.5, -40.5, 27, 0.6, 'low', 'n');
    for (const [x, z] of [[-12, -56], [18, -46], [-20, -48], [24, -58], [-14, -46]]) B.tree(x, z, 'olive', 1.1);
    B.sandbags(-6, -44, 4, 'x'); B.sandbags(8, -44, 4, 'x');
    // ---------------------------------------------------------------- vegetation + rocks (outside the core)
    for (let i = 0; i < 70; i++) {
      const x = (r() - 0.5) * 150, z = (r() - 0.5) * 150; if (street(x, z) || (Math.abs(x) < 46 && z > -44 && z < 30)) continue;
      if (Math.abs(x) < 7 && z > 20) continue; B.tree(x, z, r() < 0.7 ? 'olive' : 'bush', 0.9 + r() * 0.5);
    }
    for (let i = 0; i < 24; i++) { const x = (r() - 0.5) * 140, z = 30 + r() * 40; if (Math.abs(x) < 8) continue; B.rock(x, z, 0.6 + r() * 1.1); }
    for (const [x, z] of [[-40, 18], [38, -22], [-38, -24], [40, 24], [-10, -36], [12, -36]]) B.tree(x, z, 'olive', 1.0);
    // lamps for dusk/night variants
    for (const [x, z, d] of [[-4.5, -6, [1, 0]], [4.5, 8, [-1, 0]], [-4.5, 26, [1, 0]], [4.5, -32, [-1, 0]], [-14, -3.6, [0, 1]], [14, 3.6, [0, -1]]]) B.lamp(x, z, 4.6, 0xffc080, { dir: d, light: B.lights.length < 6, intensity: 40, dist: 20, pool: 4.5 });
  },
  spots: {
    start: [0, 62, 0], tower: [-4, -50], relay: [6, -2.5], lz: [0, -54],
    teamA: [[-3, 60], [3, 60], [-8, 56], [8, 56], [0, 52], [-12, 58]],
    teamB: [[-10, -54], [10, -46], [-18, -50], [18, -52], [0, -46], [24, -48]],
    holdout: [[-58, 0], [58, 0], [0, 64], [0, -60], [-50, -36], [50, -36], [-50, 34], [50, 34]],
    holdoutPlayer: [0, -6], buy: [[-6, -3], [6, 3], [0, 9]],
  },
};
