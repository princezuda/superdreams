// "Saltmarsh Docks" — rain-slick container port at night. Quay + gantry crane to the south, container
// yard lanes in the middle (long sightlines + cross alleys for flanks), brick pump house / warehouse /
// office block to the north (CQB), fuel tanks west, truck yard east.
import * as THREE from 'three/webgpu';

export default {
  id: 'dockyard', name: 'Saltmarsh Docks', blurb: 'Rain-slick container port at night',
  bounds: { minX: -74, maxX: 74, minZ: -60, maxZ: 50 },
  textures: ['asphalt', 'concrete', 'corrugated', 'metal', 'brick', 'wood', 'rust'],
  ground: ['asphalt', 'concrete'], waterZ: 46, waterY: -1.6, rainAtNight: true, wetAtNight: true, ambience: 'sea', menuCam: [[-60, 3.0, 43], [-30, 4.2, 40]],
  build(B, W) {
    const r = B.r;
    const C = [0x8a3324, 0x2b5a86, 0x2f6b4a, 0xb56a1e, 0xc9c6bc, 0x6b2d5c, 0x8c8f2a, 0x9a3a30, 0x2a3b5a];
    const pick = () => C[Math.floor(r() * C.length)];
    // ---------------------------------------------------------------- quay edge, bollards, rail
    B.box(0, -2.2, 46.6, 148, 2.2, 1.2, 'concrete', { tint: 0x8a8880, col: false });
    B.box(0, 0, 46.2, 148, 0.25, 0.6, 'concrete', { tint: 0xb8b4a8, col: false });
    W.add(-74, 0, 46.0, 74, 1.3, 47.4, 'concrete', { noBullet: true }); // invisible safety rail
    for (let x = -70; x <= 70; x += 8) {
      B.geo(new THREE.CylinderGeometry(0.22, 0.28, 0.7, 10), new THREE.Matrix4().makeTranslation(x, 0.35, 45.7), 'paint', { tint: 0x2c2c2c, groundY: 0 });
      B.geo(new THREE.CylinderGeometry(0.32, 0.32, 0.1, 10), new THREE.Matrix4().makeTranslation(x, 0.72, 45.7), 'paint', { tint: 0x2c2c2c });
      B.geo(new THREE.TorusGeometry(0.45, 0.2, 6, 12), new THREE.Matrix4().makeTranslation(x + 4, -0.8, 47.3), 'dark', { tint: 0x151515 });
    }
    // yellow safety line along quay
    B.box(0, 0.005, 44.6, 148, 0.02, 0.18, 'paint', { col: false, tint: 0xc89a1a, ao: false });
    // ---------------------------------------------------------------- cargo ship backdrop
    B.box(-6, -3, 60, 92, 11, 14, 'rust', { tint: 0x3a1e1a, col: false });
    B.box(-6, 8, 60, 92, 0.4, 14, 'metal', { tint: 0x6a6a62, col: false });
    B.box(-6, 6.6, 53.05, 92, 0.6, 0.1, 'paint', { tint: 0xd0d0c8, col: false, ao: false });
    B.box(28, 8.4, 60, 12, 12, 12, 'paint', { tint: 0xd6d2c6, col: false });
    B.box(28, 20.4, 60, 14, 0.6, 13, 'paint', { tint: 0xb0aca2, col: false });
    for (let f = 0; f < 4; f++) for (let k = -4; k <= 4; k++) B.quad(28 + k * 1.25, 9.6 + f * 2.8, 53.95, 0.7, 0.9, 0, -1, 'glow', r() < 0.6 ? [2.4, 1.8, 1.0] : [0.08, 0.1, 0.12]);
    for (let k = 0; k < 18; k++) B.quad(-48 + k * 4.4, 4.0, 52.95, 0.35, 0.35, 0, -1, 'glow', r() < 0.5 ? [2.0, 1.6, 0.9] : [0.05, 0.05, 0.06]);
    for (let s = 0; s < 3; s++) for (let k = 0; k < 6; k++) B.container(-40 + k * 6.3, 56 + s * 2.6, false, pick(), { y: 8.4, cover: false });
    B.box(-30, 8.4, 61, 1.2, 14, 1.2, 'paint', { tint: 0xc9a020, col: false });
    B.box(-30 + 7, 21.4, 61, 15, 0.8, 0.8, 'paint', { tint: 0xc9a020, col: false });
    B.box(36, 21, 60, 0.5, 6, 0.5, 'paint', { tint: 0x333333, col: false });
    B.box(36, 27, 60, 0.3, 0.3, 0.3, 'glow', { tint: [6, 0.2, 0.1], col: false, ao: false });
    // ---------------------------------------------------------------- gantry crane (landmark)
    const craneX = -24;
    for (const cx of [craneX - 7, craneX + 7]) for (const cz of [34, 45]) {
      B.box(cx, 0, cz, 1.2, 22, 1.2, 'paint', { tint: 0xd09a1c });
      B.box(cx, 0, cz, 1.8, 0.9, 1.8, 'paint', { tint: 0x2a2a2a });
    }
    for (const cx of [craneX - 7, craneX + 7]) { B.box(cx, 21, 46, 1.4, 1.6, 36, 'paint', { tint: 0xd09a1c, col: false }); B.box(cx, 9, 39.5, 0.6, 0.6, 11, 'paint', { tint: 0xd09a1c, col: false }); }
    B.box(craneX, 22.6, 40, 16, 1.0, 1.0, 'paint', { tint: 0xd09a1c, col: false });
    B.box(craneX, 22.6, 56, 16, 1.0, 1.0, 'paint', { tint: 0xd09a1c, col: false });
    B.box(craneX, 19.5, 50, 4, 2.5, 3.5, 'paint', { tint: 0xb8b4aa, col: false });
    B.quad(craneX, 20.2, 48.2, 3, 1, 0, -1, 'glow', [2.6, 2.2, 1.4]);
    B.box(craneX, 8, 50, 0.08, 11.4, 0.08, 'dark', { col: false, tint: 0x111111 });
    B.container(craneX, 50, false, 0x2b5a86, { y: 5.4, cover: false });
    for (const cz of [40, 63]) B.box(craneX - 7.6, 23.2, cz, 0.3, 0.3, 0.3, 'glow', { tint: [8, 0.3, 0.1], col: false, ao: false });
    // ---------------------------------------------------------------- quay apron: staged containers, straddle carrier
    B.container(-46, 38, false, pick()); B.container(-46, 40.6, false, pick(), { cover: false }); B.container(-46, 38, false, pick(), { y: 2.6, cover: false });
    B.container(4, 36, false, pick()); B.container(10.2, 36, false, pick());
    B.container(34, 40, true, pick()); B.container(36.6, 40, true, pick()); B.container(34, 40, true, pick(), { y: 2.6, cover: false });
    B.barrier(-8, 30, 6, 'x'); B.barrier(20, 28, 6, 'x'); B.barrier(52, 34, 6, 'z');
    // straddle carrier
    const sx = 18, sz = 42;
    for (const dx of [-2.2, 2.2]) for (const dz of [-3, 3]) B.box(sx + dx, 0, sz + dz, 0.5, 9, 0.5, 'paint', { tint: 0xb8b8b8 });
    for (const dx of [-2.2, 2.2]) B.box(sx + dx, 9, sz, 0.7, 0.8, 7, 'paint', { tint: 0xb8b8b8, col: false });
    B.box(sx, 9.6, sz - 3, 5.2, 1.6, 1.8, 'paint', { tint: 0x2a5c8a, col: false });
    // ---------------------------------------------------------------- west: tutorial quay + fuel tanks
    // tutorial channel (x -72..-58): crouch under the pipe, mantle the wall, then the yard opens up
    B.box(-57.7, 0, 35, 0.6, 2.6, 22, 'concrete', { tint: 0xb8b4a8 });          // channel wall
    B.pipe(-72, 1.55, 30.5, -58, 30.5, 0.28, 0x7a7a70);                         // crouch-under pipe
    B.box(-71.6, 1.3, 30.5, 0.5, 0.5, 0.5, 'paint', { tint: 0x5a5a52 });
    B.box(-65, 1.83, 30.5, 14, 2.2, 0.4, 'corrugated', { tint: 0x6a6f70 });     // hoarding above the pipe
    for (const x of [-71.4, -70.2, -60.6, -59.0]) B.crate(x, 24, 1.2);
    B.crate(-69.0, 24.1, 1.1); B.crate(-62.0, 24.0, 1.1);
    B.box(-65.4, 0, 24.1, 5.0, 1.05, 1.0, 'concrete', { tint: 0xa8a49a, cover: 'low' }); // mantle wall
    B.tank(-62, 4, 5, 9, 'paint', 0xc9c6bc); B.tank(-62, -12, 5, 9, 'paint', 0xb8b6ae);
    B.pipe(-56.5, 5.5, -16, -56.5, 8, 0.4, 0x8a8a80); B.pipe(-56.5, 6.5, -16, -56.5, 8, 0.3, 0x6a6a60);
    for (const z of [-14, -6, 2, 8]) B.box(-56.5, 0, z, 0.4, 6.8, 0.4, 'paint', { tint: 0x5a5a52 });
    B.barrier(-50, 14, 6, 'z'); B.barrier(-48, -4, 6, 'z');
    B.sandbags(-44, -22, 4, 'x');
    // ---------------------------------------------------------------- container yard (rows A/B/C with cross alleys)
    const rows = [-2, 10, 22]; const alleys = [-38, -16, 6, 28];
    rows.forEach((rz, ri) => {
      for (let x = -48; x < 44; x += 6.4) {
        if (alleys.some((a) => Math.abs(x + 3.1 - a) < 4.2)) continue;
        const h = 1 + Math.floor(r() * (ri === 1 ? 3 : 2.4));
        for (let k = 0; k < h; k++) B.container(x + 3.1, rz, false, pick(), { y: k * 2.6, cover: k === 0 ? 'high' : false });
        if (r() < 0.45) B.container(x + 3.1, rz + 2.5, false, pick(), { cover: 'high' });
      }
    });
    // loose cover in lanes
    B.container(-27, 4.5, true, pick()); B.container(16, 16.5, true, pick());
    B.crate(-6, 4, 1.3); B.crate(-4.7, 4.2, 1.1); B.crate(30, 16, 1.3); B.palletStack(-30, 16.2, 4); B.palletStack(12, 4.4, 3);
    B.barrier(-12, 16, 4, 'x'); B.barrier(36, 4, 4, 'x'); B.barrier(-40, 28, 4, 'x');
    B.barrel(0, 28); B.barrel(0.7, 28.4, 0x2a4a7a); B.barrel(-34, 4.2, 0x7a2b1c); B.tires(24, 28); B.tires(-20, 28.5);
    // ---------------------------------------------------------------- north compound
    // pump house (breach target) — brick, door on south face
    const ph = B.building({ x: 10, z: -34, w: 14, d: 10, h: 5, mat: 'brick', doors: [{ side: 's', at: 7, w: 1.8 }, { side: 'n', at: 3, w: 1.6 }], winSpacing: 3.4, winH: 1.0, interiorGlow: true, litChance: 0.8 });
    B.box(6, 0.08, -35, 3, 1.8, 2, 'metal', { tint: 0x6a7a6a, cover: 'low' }); B.box(13, 0.08, -36, 2, 2.4, 3, 'metal', { tint: 0x5a6a7a });
    B.pipe(5, 2.6, -31, 15, -31, 0.25, 0x8a6a3a); B.crate(14.5, -31.5, 1.0);
    B.box(10, 4.0, -29.6, 2, 0.15, 0.4, 'glow', { tint: [3, 2.6, 1.6], col: false, ao: false });
    // warehouse — big roller door south, side door east
    B.building({ x: -30, z: -36, w: 26, d: 16, h: 8, mat: 'corrugated', tint: 0x7a8a8a, doors: [{ side: 's', at: 13, w: 6, h: 5 }, { side: 'e', at: 8, w: 1.8 }, { side: 'n', at: 6, w: 1.8 }], windows: false, interiorGlow: true });
    for (const [x, z] of [[-38, -40], [-36.8, -40], [-24, -32], [-22.8, -32.2], [-30, -42], [-34, -33]]) B.crate(x, z, 1.2);
    B.container(-22, -41, false, pick()); B.palletStack(-38, -32, 5); B.box(-30, 0, -37, 6, 1.1, 1.2, 'wood', { tint: 0xa08a6a, cover: 'low' });
    for (let k = 0; k < 4; k++) B.box(-40 + k * 7, 7.4, -36, 0.5, 0.12, 3, 'glow', { tint: [2.2, 2.4, 2.6], col: false, ao: false });
    B.light('point', -30, 6.5, -36, 0xffe0b0, 30, 22);
    // office: two floors, external stairs to roof
    B.building({ x: 46, z: -38, w: 14, d: 10, h: 3.4, floors: 2, mat: 'concrete', tint: 0xd8d2c4, doors: [{ side: 's', at: 4, w: 1.6, glow: true }], litChance: 0.7 });
    B.stairs(55, -36, 1.8, 7, 6.8, 'z', -1, 'metal', { tint: 0x6a6a6a });
    B.box(55, 6.8, -41.5, 1.8, 0.15, 3.2, 'metal', { tint: 0x6a6a6a });
    B.box(46, 6.8, -33.2, 14, 1.0, 0.2, 'concrete', { tint: 0xc8c2b4 }); // parapet
    // perimeter fence + gate
    B.fence(-72, -56, 50, -56, 3); B.fence(50, -56, 72, -56, 3);
    B.fence(72, -56, 72, -24, 3); B.fence(72, -16, 72, 44, 3);
    B.fence(-72, -56, -72, 46.2, 3);
    B.box(64, 0, -20, 3, 3, 3, 'concrete', { tint: 0xd0c8b8 }); B.quad(64, 1.2, -18.45, 1.6, 0.9, 0, 1, 'glow', [2.5, 2.2, 1.4]);
    B.box(68, 1.0, -20, 7, 0.12, 0.12, 'paint', { col: false, tint: 0xd02020 });
    // ---------------------------------------------------------------- east truck yard
    B.truck(54, 12, true, 0x2f5d8a); B.truck(62, 12, true, 0x8a2f2f); B.truck(56, -6, false, 0x3a6a3a);
    B.barrier(44, 0, 6, 'z'); B.barrier(44, 22, 6, 'z');
    B.container(64, 30, true, pick()); B.crate(48, 30, 1.3); B.crate(49.3, 30.2, 1.1);
    B.sandbags(40, -14, 5, 'x'); B.sandbags(-6, -18, 5, 'x'); B.sandbags(24, -20, 4, 'x');
    // ---------------------------------------------------------------- lights: masts are the key light sources at night
    B.floodMast(-40, 32, 16, [-30, 18]);
    B.floodMast(26, 30, 16, [14, 18]);
    B.floodMast(-8, -24, 14, [4, -26]);
    for (const [x, z, d] of [[-14, -12, [1, 0]], [38, -24, [0, -1]], [56, 26, [-1, 0]], [-50, 26, [1, 0]], [8, -12, [0, 1]], [-64, 42, [0, -1]]]) B.lamp(x, z, 6.5, 0xffc88a, { dir: d, light: B.lights.length < 5 });
    // puddles (glossy patches handled by wet roughness mask) + light pools near ship
    B.pool(28, 52, 9, [0.25, 0.2, 0.12]);
  },
  // gameplay anchors
  spots: {
    start: [-65, 42, 0], tut1: [-65, 32.5], tut2: [-65.4, 25.6], tut3: [-62, 18],
    yard: [-10, 12], breach: [10, -28.6], terminal: [12.5, -36.2], extract: [62, 42], boat: [62, 47],
    teamA: [[-62, 38], [-60, 18], [-64, 30], [-52, 8], [-66, 14], [-58, -2]],
    teamB: [[60, -40], [62, 2], [50, -28], [66, 20], [58, -12], [40, -48]],
    holdout: [[-68, -50], [68, -50], [-68, 30], [68, 36], [0, -52], [-40, -52], [40, 8]],
    holdoutPlayer: [-6, 5.2], buy: [[-10, 5.2], [1.5, 5.2], [-19, 5.2]],
    cams: [[-56, 30.6, 3.2], [-50, 22, 3.6], [-44, 30, 4.5]],
  },
};
