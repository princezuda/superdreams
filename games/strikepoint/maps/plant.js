// "Kessler Works" — industrial power plant at dusk. Turbine hall in the centre (indoor CQB + catwalks),
// pipe racks bridging the yards, tank farm NE, smokestacks east, control block NW (roof = finale LZ),
// rail siding on the south edge, fenced transformer yard SE.
import * as THREE from 'three/webgpu';

export default {
  id: 'plant', name: 'Kessler Works', blurb: 'Industrial power plant under an orange dusk haze',
  bounds: { minX: -72, maxX: 72, minZ: -62, maxZ: 60 },
  textures: ['asphalt', 'concrete', 'metal', 'rust', 'brick', 'corrugated', 'wood'],
  ground: ['asphalt', 'concrete'], sunAz: -0.4, sunEl: { dusk: 7, day: 40 }, ambience: 'plant', expMul: 1.0, fogMul: 1.0,
  splat: (x, z) => { const road = Math.abs(z - 22) < 5 || Math.abs(x + 30) < 4 || Math.abs(z + 46) < 4; const n = Math.sin(x * 0.5) * Math.sin(z * 0.43); return road ? 0 : n > 0.55 ? 0.7 : 0.25; },
  tint: (x, z) => { const n = Math.sin(x * 0.07 + 1) * Math.cos(z * 0.09) * 0.5 + 0.5; return [0.86 + n * 0.12, 0.84 + n * 0.1, 0.8 + n * 0.08]; },
  build(B, W, game) {
    const r = B.r; const rust = 0x9a7a62;
    // ---------------------------------------------------------------- turbine hall
    const hall = B.building({ x: 0, z: 0, w: 40, d: 28, h: 13, mat: 'brick', tint: 0xb89080, roof: 'flat', windows: false, frame: 'metal',
      doors: [{ side: 's', at: 20, w: 8, h: 7 }, { side: 'n', at: 14, w: 6, h: 6 }, { side: 'e', at: 8, w: 2, h: 2.6 }, { side: 'w', at: 20, w: 2, h: 2.6 }], cover: true });
    // clerestory windows (lit)
    for (let i = 0; i < 9; i++) { B.quad(-17 + i * 4.25, 9.5, 14.06, 2.6, 2.2, 0, 1, 'glow', [2.4, 1.6, 0.8]); B.quad(-17 + i * 4.25, 9.5, -14.06, 2.6, 2.2, 0, -1, 'glow', [2.4, 1.6, 0.8]); }
    // turbines on plinths
    for (const tx of [-12, 0, 12]) {
      B.box(tx, 0.08, -3, 7, 1.0, 5, 'concrete', { tint: 0x8a8580, cover: 'low' });
      B.geo(new THREE.CylinderGeometry(1.9, 1.9, 6.4, 20).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(tx, 3.0, -3), 'paint', { tint: 0x3a6a8a });
      B.geo(new THREE.CylinderGeometry(1.2, 1.9, 1.2, 20).rotateZ(Math.PI / 2), new THREE.Matrix4().makeTranslation(tx + 3.8, 3.0, -3), 'paint', { tint: 0x2a4a6a });
      B.box(tx, 4.9, -3, 1.2, 0.8, 1.2, 'paint', { tint: 0xd0a020, col: false });
      W.add(tx - 3.2, 1.08, -5, tx + 4.4, 4.9, -1, 'metal');
    }
    // catwalk around the inside of the hall + stairs
    B.box(0, 5.2, 12.6, 38, 0.2, 2.2, 'metal', { tint: 0x8a8a84 }); B.box(0, 5.2, -12.6, 38, 0.2, 2.2, 'metal', { tint: 0x8a8a84 });
    B.box(18.4, 5.2, 0, 2.2, 0.2, 23, 'metal', { tint: 0x8a8a84 });
    for (const z of [11.6, -11.6]) B.box(0, 5.4, z, 38, 1.0, 0.06, 'paint', { col: false, tint: 0xd0a020 });
    B.stairs(-14, 10.6, 1.6, 7.5, 5.2, 'x', 1, 'metal', { tint: 0x7a7a74 });
    B.stairs(14, -10.6, 1.6, 7.5, 5.2, 'x', -1, 'metal', { tint: 0x7a7a74 });
    for (const [x, z] of [[-6, 8], [-4.8, 8.2], [8, 8], [6, 7], [16, 3]]) B.crate(x, z, 1.2);
    B.box(-16, 0.08, 4, 3, 1.1, 1.2, 'metal', { tint: 0x6a7a6a, cover: 'low' }); B.box(5, 0.08, 9, 1.2, 1.1, 3, 'metal', { tint: 0x6a7a6a, cover: 'low' });
    for (let i = 0; i < 4; i++) B.box(-15 + i * 10, 12.4, 0, 0.6, 0.15, 6, 'glow', { col: false, tint: [2.6, 2.2, 1.6], ao: false });
    B.light('point', 0, 10, 0, 0xffd8a0, 50, 30);
    // ---------------------------------------------------------------- pipe racks bridging the yards
    const rack = (x1, z1, x2, z2, y = 4.6) => {
      const alongX = Math.abs(x2 - x1) > Math.abs(z2 - z1); const L = alongX ? Math.abs(x2 - x1) : Math.abs(z2 - z1);
      for (let t = 0; t <= L; t += 8) { const px = alongX ? Math.min(x1, x2) + t : x1, pz = alongX ? z1 : Math.min(z1, z2) + t; B.box(px + (alongX ? 0 : -1.2), 0, pz + (alongX ? -1.2 : 0), 0.3, y + 0.6, 0.3, 'rust', { tint: rust }); B.box(px + (alongX ? 0 : 1.2), 0, pz + (alongX ? 1.2 : 0), 0.3, y + 0.6, 0.3, 'rust', { tint: rust }); B.box(px, y + 0.3, pz, alongX ? 0.3 : 2.8, 0.3, alongX ? 2.8 : 0.3, 'rust', { col: false, tint: rust }); }
      for (const [o, rr, c] of [[-0.8, 0.32, 0x8a8a7a], [-0.1, 0.24, 0x9a5a3a], [0.6, 0.4, 0xa8a8a0], [1.1, 0.16, 0x4a6a8a]]) B.pipe(alongX ? x1 : x1 + o, y + 0.6 + rr, alongX ? z1 + o : z1, alongX ? x2 : x1 + o, alongX ? z1 + o : z2, rr, c, false);
    };
    rack(-66, -24, 66, -24); rack(32, -50, 32, 44); rack(-66, 30, -26, 30);
    // ---------------------------------------------------------------- tank farm NE
    for (const [x, z] of [[46, -40], [58, -40], [46, -52], [58, -52]]) B.tank(x, z, 4.5, 11, 'paint', 0xc8c0b0);
    B.box(52, 0, -46, 26, 0.9, 0.5, 'concrete', { tint: 0xa8a49a, cover: 'low', coverSides: 'ns' });
    // ---------------------------------------------------------------- smokestacks (landmark) east
    for (const [x, z, h] of [[58, 2, 42], [58, 14, 36]]) {
      B.geo(new THREE.CylinderGeometry(1.6, 2.6, h, 18), new THREE.Matrix4().makeTranslation(x, h / 2, z), 'brick', { tint: 0xa88070, groundY: 0 });
      for (const yy of [h * 0.3, h * 0.6, h - 1]) B.geo(new THREE.TorusGeometry(2.6 - (yy / h) * 1.0 + 0.05, 0.12, 4, 24).rotateX(Math.PI / 2), new THREE.Matrix4().makeTranslation(x, yy, z), 'paint', { tint: 0xd8d0c0, ao: false });
      B.box(x, h - 0.6, z, 0.3, 0.3, 0.3, 'glow', { col: false, tint: [8, 0.3, 0.1], ao: false });
      W.add(x - 2, 0, z - 2, x + 2, h, z + 2, 'concrete');
      game?.emitters?.push({ x, y: h + 1, z, rate: 0.12, kind: 'stack' });
    }
    B.building({ x: 52, z: 8, w: 10, d: 18, h: 6, mat: 'corrugated', tint: 0x6a7470, roof: 'flat', doors: [{ side: 'w', at: 9, w: 3, h: 3.5 }], windows: false });
    // ---------------------------------------------------------------- coolant pumps (objectives) — west, north, east
    const pump = (x, z, rotZ) => {
      B.box(x, 0, z, rotZ ? 2.4 : 4, 0.4, rotZ ? 4 : 2.4, 'concrete', { tint: 0x9a958c });
      B.geo(new THREE.CylinderGeometry(0.9, 0.9, 2.6, 16).rotateZ(rotZ ? 0 : Math.PI / 2).rotateX(rotZ ? Math.PI / 2 : 0), new THREE.Matrix4().makeTranslation(x, 1.3, z), 'paint', { tint: 0x2f7a5a });
      B.box(x + (rotZ ? 0 : 1.6), 0.4, z + (rotZ ? 1.6 : 0), 0.9, 1.4, 0.9, 'paint', { tint: 0xd0a020 });
      B.pipe(x, 2.0, z, x + (rotZ ? 0 : -6), z + (rotZ ? -6 : 0), 0.22, 0x8a8a7a, false);
      W.add(x - (rotZ ? 1.2 : 2), 0, z - (rotZ ? 2 : 1.2), x + (rotZ ? 1.2 : 2), 2.3, z + (rotZ ? 2 : 1.2), 'metal');
      B.coverAround(x, z, rotZ ? 2.4 : 4, rotZ ? 4 : 2.4, 'low');
    };
    pump(-46, 8, true); pump(10, -38, false); pump(44, 26, false);
    // ---------------------------------------------------------------- control block NW (2 floors + roof access)
    B.building({ x: -46, z: -40, w: 16, d: 12, h: 3.6, floors: 2, mat: 'concrete', tint: 0xd0c8b8, roof: 'flat', doors: [{ side: 's', at: 4, w: 1.6, glow: true }, { side: 'e', at: 6, w: 1.6 }], litChance: 0.8, glow: 0xd8e8ff });
    B.stairs(-36.6, -37, 1.8, 8.5, 7.2, 'z', -1, 'metal', { tint: 0x6a6a6a });
    B.box(-37.0, 7.2, -42.6, 2.4, 0.2, 2.8, 'metal', { tint: 0x6a6a6a });
    B.box(-46, 7.2, -34.1, 16, 1.0, 0.25, 'concrete', { tint: 0xc0b8a8 }); B.box(-46, 7.2, -45.9, 16, 1.0, 0.25, 'concrete', { tint: 0xc0b8a8 }); B.box(-53.9, 7.2, -40, 0.25, 1.0, 12, 'concrete', { tint: 0xc0b8a8 });
    B.box(-48, 7.2, -40, 3, 1.4, 2, 'metal', { tint: 0x7a8088 }); B.box(-43, 7.2, -42, 1.4, 2.2, 1.4, 'metal', { tint: 0x7a8088 });
    // ---------------------------------------------------------------- rail siding south
    for (let x = -68; x < 68; x += 1.2) B.box(x, 0, 47, 0.25, 0.12, 3.0, 'wood', { col: false, tint: 0x5a4a3a });
    B.box(0, 0.12, 46.2, 136, 0.12, 0.12, 'metal', { col: false, tint: 0x6a6660 }); B.box(0, 0.12, 47.8, 136, 0.12, 0.12, 'metal', { col: false, tint: 0x6a6660 });
    for (const [x, c] of [[-40, 0x6a3a2a], [-31, 0x3a5a6a], [-14, 0x6a5a2a], [18, 0x5a3a3a], [27, 0x3a4a5a]]) { B.container(x, 47, false, c, { y: 0.9 }); B.box(x, 0, 47, 5.6, 0.9, 2.2, 'dark', { tint: 0x1a1a1a }); }
    // ---------------------------------------------------------------- transformer yard SE (fenced)
    B.fence(38, 30, 64, 30, 2.6); B.fence(38, 30, 38, 40, 2.6); B.fence(64, 30, 64, 42, 2.6);
    for (const [x, z] of [[44, 36], [52, 36], [60, 36]]) { B.box(x, 0, z, 3, 2.6, 2.2, 'paint', { tint: 0x6a7068, cover: 'high' }); for (let i = 0; i < 3; i++) B.geo(new THREE.CylinderGeometry(0.12, 0.18, 1.2, 8), new THREE.Matrix4().makeTranslation(x - 1 + i, 3.2, z), 'paint', { tint: 0xc8c0b0 }); }
    // ---------------------------------------------------------------- yard clutter (cover lanes)
    B.barrier(-20, 22, 6, 'x'); B.barrier(20, 24, 6, 'x'); B.barrier(-8, 34, 6, 'x'); B.barrier(10, 36, 4, 'x');
    B.barrier(-30, -6, 6, 'z'); B.barrier(28, 2, 6, 'z');
    for (const [x, z] of [[-26, 16], [-25, 17.2], [24, 14], [-10, -30], [-8.6, -30.4], [22, -34], [-58, 18], [-56.8, 18.3]]) B.crate(x, z, 1.25);
    for (const [x, z] of [[-34, 20], [-34.7, 20.5], [-33.4, 20.6], [26, 30], [26.6, 30.7], [-56, -8], [-55.3, -8.5], [14, -48], [14.7, -48.6]]) B.barrel(x, z, r() < 0.5 ? 0x7a3a1c : 0x2a4a6a);
    B.container(-58, -6, true, 0x3a5a6a); B.container(-14, -40, false, 0x8a5a2a); B.container(-14, -40, false, 0x5a6a3a, { y: 2.6, cover: false }); B.container(22, -46, false, 0x6a3a3a);
    B.truck(-50, 26, false, 0x8a6a2a); B.truck(8, 30, false, 0x3a5a7a);
    B.sandbags(-38, 2, 4, 'z'); B.sandbags(36, -10, 4, 'z'); B.sandbags(0, 22, 5, 'x');
    B.palletStack(-20, -32, 4); B.palletStack(40, -18, 3); B.tires(-62, 40); B.tires(62, -24);
    // perimeter
    B.fence(-70, -60, 70, -60, 3.2); B.fence(-70, 52, 70, 52, 3.2); B.fence(-70, -60, -70, 52, 3.2); B.fence(70, -60, 70, 52, 3.2);
    // lights: sodium lamps + floods
    B.floodMast(-30, 40, 14, [-20, 24], 0xffd0a0);
    B.floodMast(30, -32, 14, [14, -38], 0xffd0a0);
    for (const [x, z, d] of [[-24, 20, [1, 0]], [22, 20, [-1, 0]], [-30, -20, [1, 0]], [28, -20, [-1, 0]], [-50, 0, [1, 0]], [48, 20, [-1, 0]]]) B.lamp(x, z, 7, 0xffa850, { dir: d, light: B.lights.length < 6, intensity: 70, dist: 24 });
  },
  spots: {
    start: [-60, 44, Math.PI * 0.75], hallS: [0, 16], pumps: [[-46, 8], [10, -38], [44, 26]], roof: [-46, -40, 7.2], ladder: [-36.6, -37],
    teamA: [[-62, 42], [-56, 44], [-62, 34], [-50, 40], [-44, 44], [-60, 20]],
    teamB: [[62, -54], [54, -30], [62, -20], [40, -56], [60, 40], [66, 24]],
    holdout: [[-68, -56], [68, -56], [-68, 48], [68, 48], [0, -58], [0, 50], [-68, 0], [68, -4]],
    holdoutPlayer: [0, 0], buy: [[-8, 6], [8, 6], [0, -8]],
  },
};
