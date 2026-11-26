// Skyharbor landmark catalogue. DATA-DRIVEN: each landmark = metadata + build(K). No imports here, so the sim and node
// tests can read the metadata, and a new (player-requested) landmark is one object appended to LANDMARKS.
//
// Metadata contract:
//   id, name, kind, footprint (cells, square), height (units, for framing), cost, upkeep (/day), capacity (visits/day before
//   crowding), tier (base review stars 1–5 before traits/service), power, water, jobs,
//   appeal {sightseer, scholar, romantic, thrill, pilgrim} 0–5, boosts {traitKey: multiplier}, unlock {start|renown|milestone},
//   lore (what it is), night (its after-dark moment), build(K) → THREE.Group (K = lmkit helper vocabulary; see lmkit.js).
// Units: 1 unit ≈ 2.5 m; one city cell = 4 units. Builders sit on y = 0 and are centred on x = z = 0, front facing +z.
// Every stack below carries its y-ledger (top(A) = bottom(B)) per the blind-geometry QA pass; renders verified in the gallery.

const TAU = Math.PI * 2;

export const VISITOR_TYPES = [
  { id: 'sightseer', name: 'Sightseers', color: '#ffd27a', wants: 'spectacle, skylines, big silhouettes' },
  { id: 'scholar', name: 'Scholars', color: '#7ac8ff', wants: 'science, sky-watching, strange geology' },
  { id: 'romantic', name: 'Romantics', color: '#ff7ad9', wants: 'night beauty, water, gardens' },
  { id: 'thrill', name: 'Thrill-seekers', color: '#ff8a4a', wants: 'heights, extremes, danger' },
  { id: 'pilgrim', name: 'Pilgrims', color: '#b9a0ff', wants: 'stillness, crystal, moons, ritual' },
];

export const LANDMARKS = [
  {
    id: 'halo', name: 'Halo Gate', kind: 'Floating ring arch', footprint: 3, height: 38, cost: 16000, upkeep: 140, capacity: 600, tier: 3.6,
    power: 8, water: 0, jobs: 10,
    appeal: { sightseer: 5, scholar: 1, romantic: 4, thrill: 2, pilgrim: 2 }, boosts: { lowGravity: 1.35, ringshine: 1.25, giantRise: 1.1 },
    unlock: { start: true },
    lore: 'A ceramic ring the size of a cathedral, held aloft over a reflecting pool by nothing but field-lines from two pylons. Couples walk through the gap beneath it at dawn.',
    night: 'Gold light chases around the ring while the inner hoop counter-spins.',
    build(K) {
      const g = K.root();
      const stone = K.mat(0xd9d2c3, { r: 0.7 }), dark = K.mat(0x2b2f3a, { r: 0.5, m: 0.3 });
      // plinth 13×0.8×5: y .4 → top .8
      K.box(g, 13, 0.8, 5, stone, 0, 0.4, 0);
      K.box(g, 6, 0.4, 1.4, stone, 0, 0.2, 3.1); // front step: top .4
      K.mesh(g, new K.THREE.BoxGeometry(9, 0.1, 3.4), K.water('sea'), 0, 0.85, 0); // pool: .8 → .9
      for (const sx of [-1, 1]) {
        // pylon: square tapered prism, bottom .8, top 14.8 (centre 7.8)
        K.cyl(g, 0.75, 1.3, 14, dark, sx * 4.8, 7.8, 0, { seg: 4, rot: { y: Math.PI / 4 } });
        K.cyl(g, 0.9, 1.45, 0.5, stone, sx * 4.8, 1.05, 0, { seg: 4, rot: { y: Math.PI / 4 } });
        K.sph(g, 0.55, K.glow(0xffd27a, { day: 1.2, night: 4 }), sx * 4.8, 15.4, 0); // cap: 14.85 → 15.95
        K.strut(g, [sx * 4.8, 15.4, 0], [sx * 3.2, 17.7, 0], 0.09, K.glow(0xffe3a8, { day: 0.8, night: 3.5, additive: true }));
      }
      // ring centre y 26.6: bottom 26.6-9-.85 = 16.75 (> cap top 15.95 even at bob -0.35)
      const ring = K.dyn(g, 0, 26.6, 0);
      K.tor(ring, 9, 0.85, K.chase(0xece6f2, 0xffc45a, { bands: 3 }), 0, 0, 0, { rs: 16, ts: 96 });
      const inner = K.dyn(ring);
      K.tor(inner, 7.7, 0.22, K.glow(0xffd27a, { day: 0.9, night: 3.2 }), 0, 0, 0, { rs: 6, ts: 80 });
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; K.box(inner, 0.25, 0.9, 0.25, K.glow(0xfff2c8, { day: 1, night: 4 }), Math.cos(a) * 7.7, Math.sin(a) * 7.7, 0, { rot: { z: a } }); }
      const gyro = K.dyn(ring);
      K.tor(gyro, 10.8, 0.14, K.mat(0xb8a070, { r: 0.3, m: 0.6 }), 0, 0, 0, { rs: 6, ts: 96 });
      K.anim((t) => { ring.position.y = 26.6 + Math.sin(t * 0.6) * 0.35; inner.rotation.z = -t * 0.25; gyro.rotation.y = t * 0.12; });
      K.light(0, 26.6, 0, 0xffc45a, 1.2);
      return g;
    },
  },
  {
    id: 'garden', name: 'The Hanging Terraces', kind: 'Sky garden', footprint: 3, height: 38, cost: 22000, upkeep: 180, capacity: 560, tier: 3.7,
    power: 6, water: 14, jobs: 14,
    appeal: { sightseer: 4, scholar: 2, romantic: 5, thrill: 1, pilgrim: 2 }, boosts: { temperate: 1.3, humid: 1.3, lowGravity: 1.15, arid: 0.85, airless: 0.75 },
    unlock: { start: true },
    lore: 'Five garden decks spiral up a living stone trunk; water climbs inside it and falls from deck to deck. Every terrace is planted from a different world.',
    night: 'Hundreds of paper lanterns wake along the terrace rims and the falls glow.',
    build(K) {
      const g = K.root();
      const stone = K.mat(0xb7a58a, { r: 0.85 }), soil = K.mat(0x4d6b2e, { r: 0.95 }), under = K.mat(0x6f5f4a, { r: 0.9, f: true });
      K.mesh(g, new K.THREE.CylinderGeometry(6.4, 6.4, 0.3, 40), K.water('oasis'), 0, 0.15, 0); // pool 0 → .3
      K.tor(g, 6.5, 0.28, stone, 0, 0.3, 0, { rot: { x: Math.PI / 2 }, rs: 8, ts: 48 });
      K.cyl(g, 1.3, 2.2, 35, stone, 0, 17.5, 0, { seg: 14 }); // trunk 0 → 35
      const bushes = [], lanterns = [], greens = [0x3f7a2c, 0x5a9a36, 0x2f6a3a, 0x7aa83e, 0x4a8a5a];
      const falls = K.flow(0x9ae8ff, 0xffffff, { speed: 1.1, opacity: 0.8 });
      let prev = null;
      for (let k = 0; k < 5; k++) {
        const yt = 7 + k * 6.6, r = 5.4 - k * 0.6, a = k * 1.25, cx = Math.cos(a) * 1.4, cz = Math.sin(a) * 1.4;
        K.cyl(g, r, r * 0.92, 1.1, stone, cx, yt - 0.55, cz, { seg: 28 });       // rim: yt-1.1 → yt
        K.cyl(g, r - 0.35, r - 0.35, 0.3, soil, cx, yt + 0.1, cz, { seg: 28 });   // soil: yt-.05 → yt+.25
        K.cone(g, r * 0.85, 3.0, under, cx, yt - 2.6, cz, { seg: 12, rot: { x: Math.PI } }); // underside: yt-4.1 → yt-1.1
        const n = 10 + (4 - k) * 4;
        for (let i = 0; i < n; i++) {
          const aa = K.rng() * TAU, rr = (r - 0.6) * (0.35 + K.rng() * 0.6), s = 0.45 + K.rng() * 0.6;
          bushes.push({ x: cx + Math.cos(aa) * rr, y: yt + 0.25 + s * 0.45, z: cz + Math.sin(aa) * rr, sx: s, sy: s * 0.85, sz: s, color: K.rng() < 0.12 ? (K.rng() < 0.5 ? 0xd86a9a : 0xe8c84a) : greens[(K.rng() * 5) | 0] });
        }
        for (let i = 0; i < 9; i++) { const aa = i / 9 * TAU + k; lanterns.push({ x: cx + Math.cos(aa) * (r + 0.1), y: yt + 0.55, z: cz + Math.sin(aa) * (r + 0.1), s: 1 }); }
        if (prev) { // waterfall from this deck's rim down to the deck below (height 6.6)
          const dx = prev.cx - cx, dz = prev.cz - cz, ang = Math.atan2(dx, dz);
          const ex = cx + Math.sin(ang) * (r - 0.2), ez = cz + Math.cos(ang) * (r - 0.2);
          K.mesh(g, new K.THREE.PlaneGeometry(1.3, 6.4), falls, ex, yt - 3.3, ez, { rot: { y: ang }, shadow: false });
        }
        prev = { cx, cz };
      }
      K.inst(g, K.jitter(new K.THREE.IcosahedronGeometry(1, 1), 0.25, 3), K.mat(0xffffff, { r: 0.9, f: true }), bushes);
      K.inst(g, new K.THREE.SphereGeometry(0.2, 8, 6), K.glow(0xffb45a, { day: 0.6, night: 4.5 }), lanterns, { shadow: false });
      // crown pavilion over the trunk top (35): dome r1.8 → 36.8, finial 36.8 → 38.4
      K.sph(g, 1.8, K.mat(0xf4efe6, { r: 0.4, e: 0xffd9a0, ei: 1.4 }), 0, 35, 0, { tl: Math.PI / 2 });
      K.cone(g, 0.2, 1.6, K.mat(0xd8b04a, { r: 0.3, m: 0.7 }), 0, 37.6, 0, { seg: 8 });
      K.light(0, 20, 0, 0xffb45a, 1);
      return g;
    },
  },
  {
    id: 'observatory', name: 'Starwatch Observatory', kind: 'Star observatory dome', footprint: 3, height: 16, cost: 24000, upkeep: 160, capacity: 380, tier: 3.8,
    power: 14, water: 2, jobs: 16,
    appeal: { sightseer: 2, scholar: 5, romantic: 3, thrill: 1, pilgrim: 2 }, boosts: { clearSkies: 1.4, meteors: 1.3, twinMoons: 1.2, giantRise: 1.25, thinAir: 1.15, airless: 1.2, humid: 0.85 },
    unlock: { start: true },
    lore: 'A white drum and copper dome built for the public, not for science: anyone may book the great telescope for one hour, once in their life.',
    night: 'The dome slit opens and a sodium-gold guide laser sweeps the stars.',
    build(K) {
      const g = K.root();
      const base = K.mat(0x8f8a84, { r: 0.9 }), white = K.mat(0xf0ede6, { r: 0.6 }), trim = K.mat(0x3a3e48, { r: 0.5, m: 0.3 });
      K.box(g, 11.6, 1.2, 11.6, base, 0, 0.6, 0);  // 0 → 1.2
      K.box(g, 9.2, 1.2, 9.2, white, 0, 1.8, 0);   // 1.2 → 2.4
      K.box(g, 3, 0.5, 3.0, base, 0, 1.0, 5.5, { rot: { x: 0.6 } }); // entrance ramp
      K.cyl(g, 4.2, 4.2, 8, white, 0, 6.4, 0, { seg: 40 }); // drum 2.4 → 10.4
      for (const y of [2.6, 6.4, 10.4]) K.tor(g, 4.28, 0.16, trim, 0, y, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 48 });
      K.tor(g, 5.6, 0.1, K.glow(0x9ad8ff, { day: 0.4, night: 3 }), 0, 2.45, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 48 });
      const dome = K.dyn(g, 0, 10.4, 0);
      K.sph(dome, 4.5, K.mat(0xc98a5a, { r: 0.35, m: 0.55 }), 0, 0, 0, { tl: Math.PI / 2, w: 40, h: 16 }); // 10.4 → 14.9
      K.sph(dome, 4.56, K.mat(0x0a0c14, { r: 0.9 }), 0, 0, 0, { ps: -0.2, pl: 0.4, tl: Math.PI / 2 * 0.98, w: 6, h: 16 }); // slit toward -x
      // telescope: axis (-sin .75, cos .75); centre (-1, 2.6) → tip (-3.56, 5.34) pokes through the slit
      K.cyl(dome, 0.55, 0.7, 7.5, K.mat(0xdedad2, { r: 0.4, m: 0.4 }), -1.0, 2.6, 0, { rot: { z: 0.75 } });
      const beamLen = 600, ax = -Math.sin(0.75), ay = Math.cos(0.75);
      K.mesh(dome, new K.THREE.CylinderGeometry(0.1, 0.1, beamLen, 6, 1, true), K.beam(0xffb13b, { len: beamLen }), -3.56 + ax * beamLen / 2, 5.34 + ay * beamLen / 2, 0, { rot: { z: 0.75 }, shadow: false });
      K.sph(dome, 0.3, K.glow(0xffc45a, { day: 0.2, night: 5 }), -3.6, 5.4, 0);
      K.anim((t) => { dome.rotation.y = t * 0.04; });
      for (const [x, z] of [[4.2, 4.2], [-4.2, -4.2]]) { // dish: post 2.4 → 3.9, cup centre 5.1 (flipped cap spans 3.9 → 4.35)
        K.cyl(g, 0.12, 0.12, 1.5, trim, x, 3.15, z, { seg: 8 });
        K.sph(g, 1.2, white, x, 5.1, z, { tl: 0.9, w: 20, h: 6, rot: { x: Math.PI, z: 0.35 } });
      }
      K.light(0, 13, 0, 0xffd7a0, 0.9);
      return g;
    },
  },
  {
    id: 'fountain', name: 'Comet Fountain', kind: 'Sculpted fountain', footprint: 3, height: 16, cost: 14000, upkeep: 110, capacity: 640, tier: 3.5,
    power: 6, water: 10, jobs: 8,
    appeal: { sightseer: 4, scholar: 1, romantic: 3, thrill: 2, pilgrim: 1 }, boosts: { meteors: 1.4, clearSkies: 1.1 },
    unlock: { renown: 700 },
    lore: 'A bronze helix holds a captive comet head above a wide basin. Eight jets arc toward it as if the water were trying to catch it.',
    night: 'The comet tail ignites and the basin glows cyan from beneath.',
    build(K) {
      const g = K.root();
      const stone = K.mat(0xcfc8bc, { r: 0.8 }), bronze = K.mat(0xa8743a, { r: 0.35, m: 0.7 });
      K.lathe(g, [[5.4, 0.3], [5.4, 1.1], [5.9, 1.1], [5.9, 0], [5.4, 0]], stone, 0, 0, 0, { seg: 48 }); // basin wall 0 → 1.1
      K.cyl(g, 5.4, 5.4, 0.3, K.mat(0x2a4a5a, { r: 0.6 }), 0, 0.15, 0, { seg: 40 });                    // floor 0 → .3
      K.mesh(g, new K.THREE.CylinderGeometry(5.38, 5.38, 0.1, 48), K.water('oasis'), 0, 0.9, 0);          // water .85 → .95
      K.tor(g, 5.65, 0.06, K.glow(0x7af0ff, { day: 0.3, night: 3 }), 0, 1.13, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 64 });
      K.mesh(g, K.jitter(new K.THREE.IcosahedronGeometry(1.6, 1), 0.4, 5), K.mat(0x5a5560, { r: 0.9, f: true }), 0, 1.4, 0, { scale: [1, 1.1, 1] }); // rock ~ -.36 → 3.2
      const hel = []; for (let i = 0; i <= 24; i++) { const t = i / 24, a = t * TAU * 2; hel.push([Math.cos(a) * 0.7, 2.6 + t * 7.4, Math.sin(a) * 0.7]); }
      K.tube(g, hel, 0.22, bronze, { seg: 60 });
      const jet = K.flow(0x8af6ff, 0xffffff, { speed: 1.6, opacity: 0.75 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU, c = Math.cos(a), s = Math.sin(a); K.tube(g, [[c * 5.1, 1.0, s * 5.1], [c * 4, 4.6, s * 4], [c * 2.6, 6.2, s * 2.6], [c * 1.4, 5.2, s * 1.4]], 0.11, jet, { seg: 24, rseg: 6, shadow: false }); }
      const comet = K.dyn(g, 0, 12, 0);
      K.sph(comet, 1.3, K.glow(0xdffcff, { day: 1.4, night: 5 }), 0, 0, 0);
      K.sph(comet, 2.1, K.glow(0x7ae0ff, { day: 0.15, night: 0.9, additive: true }), 0, 0, 0);
      const tailLen = 12;
      const tail = K.dyn(comet); tail.rotation.z = 1.9; // tail extends to -x and slightly down
      K.mesh(tail, new K.THREE.ConeGeometry(1.9, tailLen, 20, 1, true), K.beam(0x8ae8ff, { len: tailLen, nightOnly: false, strength: 0.75, flip: true }), 0, tailLen / 2 + 0.6, 0, { rot: { x: Math.PI }, shadow: false });
      const sparks = []; for (let i = 0; i < 40; i++) { const t = i / 40; sparks.push({ x: Math.cos(t * 25) * (0.5 + t * 1.6), y: 1 + t * tailLen, z: Math.sin(t * 25) * (0.5 + t * 1.6), s: 1 - t * 0.7 }); }
      K.inst(tail, new K.THREE.SphereGeometry(0.16, 6, 4), K.glow(0xffffff, { day: 1.2, night: 4 }), sparks, { shadow: false });
      K.anim((t) => { comet.rotation.y = t * 0.22; comet.position.y = 12 + Math.sin(t * 0.8) * 0.4; });
      K.light(0, 11, 0, 0x7ae0ff, 1.1);
      return g;
    },
  },
  {
    id: 'helix', name: 'The Helix of Vael', kind: 'Spiral crystal spire', footprint: 3, height: 54, cost: 32000, upkeep: 260, capacity: 520, tier: 4.0,
    power: 12, water: 0, jobs: 12,
    appeal: { sightseer: 4, scholar: 3, romantic: 3, thrill: 1, pilgrim: 5 }, boosts: { crystal: 1.45, thinAir: 1.1, clearSkies: 1.1, auroras: 1.1 },
    unlock: { renown: 1800 },
    lore: 'Sixty grown crystals wound in a double helix around a core of light. The Vael believed a world was not alive until something on it sang; the Helix hums at 40 Hz.',
    night: 'A band of light climbs the shards from root to crown, again and again.',
    build(K) {
      const g = K.root();
      const stone = K.mat(0x3a3550, { r: 0.6, m: 0.1 }), trim = K.mat(0xc8c0e8, { r: 0.4, m: 0.3 });
      K.cyl(g, 5.6, 5.8, 1.2, stone, 0, 0.6, 0, { seg: 6 }); // 0 → 1.2
      K.cyl(g, 4.6, 4.8, 1.0, trim, 0, 1.7, 0, { seg: 6 });  // 1.2 → 2.2
      K.cyl(g, 3.6, 3.8, 0.8, stone, 0, 2.6, 0, { seg: 6 }); // 2.2 → 3.0
      K.tor(g, 4.2, 0.08, K.glow(0x7af0ff, { day: 0.6, night: 3 }), 0, 2.24, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 6 });
      const shardMat = K.crystal(0xb89aff, { height: 54, climb: 0.1 });
      K.cyl(g, 0.5, 0.95, 44, K.crystal(0x8ad8ff, { height: 54, climb: 0.1 }), 0, 25, 0, { seg: 12 }); // core 3 → 47
      K.cyl(g, 0.26, 0.38, 43.5, K.glow(0x9af6ff, { day: 0.9, night: 4.2 }), 0, 25, 0, { seg: 8 });
      const spin = K.dyn(g);
      const list = [];
      for (let s = 0; s < 2; s++) for (let k = 0; k < 22; k++) { // two bold ribbons of shards spiralling up and in
        const t = k / 21, a = t * TAU * 1.6 + s * Math.PI, r = 5.2 * (1 - t) + 1.6, sc = 1.9 - t * 1.05;
        list.push({ x: Math.cos(a) * r, y: 4.6 + t * 40, z: Math.sin(a) * r, ry: -a, rz: -0.5, sx: 0.7 * sc, sy: 2.4 * sc, sz: 0.7 * sc });
      }
      K.inst(spin, new K.THREE.OctahedronGeometry(1, 0), shardMat, list);
      K.anim((t) => { spin.rotation.y = t * 0.05; });
      const roots = []; for (let i = 0; i < 9; i++) { const a = i / 9 * TAU + 0.3, r = 3.2 + (i % 3) * 0.6, s2 = 1.4 + (i % 4) * 0.35; roots.push({ x: Math.cos(a) * r, y: 2.2 + s2 * 1.2, z: Math.sin(a) * r, ry: -a, rz: -0.35 - (i % 2) * 0.2, sx: 0.8 * s2, sy: 2.2 * s2, sz: 0.8 * s2 }); }
      K.inst(g, new K.THREE.OctahedronGeometry(1, 0), K.crystal(0x9a7aff, { height: 54, climb: 0.1 }), roots); // root cluster, buried ~1 into the plinth
      K.mesh(g, new K.THREE.OctahedronGeometry(1, 0), shardMat, 0, 49, 0, { scale: [1.5, 4.6, 1.5] }); // crown 44.4 → 53.6
      K.tor(g, 2.6, 0.1, K.glow(0xd8c8ff, { day: 0.8, night: 3.5 }), 0, 45, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 40 });
      K.light(0, 18, 0, 0x7ad8ff, 1); K.light(0, 46, 0, 0xb89aff, 1);
      return g;
    },
  },
  {
    id: 'grove', name: 'Lumen Grove Pavilion', kind: 'Bioluminescent forest pavilion', footprint: 3, height: 25, cost: 36000, upkeep: 220, capacity: 500, tier: 4.0,
    power: 4, water: 12, jobs: 12,
    appeal: { sightseer: 3, scholar: 3, romantic: 5, thrill: 1, pilgrim: 4 }, boosts: { glowFlora: 1.5, longNights: 1.25, humid: 1.2, spores: 1.2, arid: 0.85, infernal: 0.8 },
    unlock: { renown: 3000 },
    lore: 'Five giant fungal trees coaxed to grow around a cedar deck. Their gills breathe light in a slow wave that visitors swear matches their own heartbeat.',
    night: 'The gills pulse teal-to-magenta and spores drift like slow fireflies.',
    build(K) {
      const g = K.root();
      K.cyl(g, 6, 6, 0.5, K.mat(0x5a4636, { r: 0.85 }), 0, 0.25, 0, { seg: 36 }); // deck 0 → .5
      K.tor(g, 6.05, 0.12, K.glow(0x5affd8, { day: 0.3, night: 2.6 }), 0, 0.5, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 48 });
      const stem = K.mat(0xe0d6c4, { r: 0.7 }), cap = K.mat(0x4a2a7a, { r: 0.55, e: 0x7a3aff, ei: 0.5, ed: 0.02 });
      const gills = K.pulse(0x3affd0, 0xff4ad8, { speed: 0.9 });
      const tend = [];
      const trees = [[0, 0, 22, 5.2], [-3.2, 2.4, 15, 3.8], [3.4, 1.8, 17, 4.2], [-2.0, -3.4, 12, 3.2], [2.6, -3.2, 13.5, 3.4]];
      for (const [x, z, h, R] of trees) {
        const k = R / 5.2;
        K.lathe(g, [[1.4 * k, 0], [0.9 * k, 0.6], [0.62 * k, 2], [0.5 * k, h * 0.5], [0.55 * k, h * 0.85], [0.75 * k, h]], stem, x, 0.5, z, { seg: 14 }); // .5 → .5+h
        const top = 0.5 + h;
        K.lathe(g, [[0.001, 1.9 * k + 0.4], [R * 0.5, 1.75 * k + 0.3], [R * 0.85, 1.0 * k], [R, 0.15], [R * 0.95, 0]], cap, x, top, z, { seg: 28 });
        K.lathe(g, [[R * 0.95, 0], [R * 0.6, -0.35], [0.6 * k, -0.45]], gills, x, top, z, { seg: 28 });
        for (let i = 0; i < 12; i++) { const a = i / 12 * TAU + K.rng(), len = 1.5 + K.rng() * 2.5; tend.push({ x: x + Math.cos(a) * R * 0.88, y: top - 0.1 - len / 2, z: z + Math.sin(a) * R * 0.88, sy: len }); }
      }
      K.inst(g, new K.THREE.CylinderGeometry(0.05, 0.02, 1, 4), K.glow(0x5affd8, { day: 0.4, night: 3.2 }), tend, { shadow: false });
      const spores = K.dyn(g);
      const sp = []; for (let i = 0; i < 80; i++) { const a = K.rng() * TAU, r = 1 + K.rng() * 6.5; sp.push({ x: Math.cos(a) * r, y: 1.2 + K.rng() * 20, z: Math.sin(a) * r, s: 0.6 + K.rng() * 0.8 }); }
      K.inst(spores, new K.THREE.SphereGeometry(0.12, 6, 4), K.glow(0xc8ffe8, { day: 0.2, night: 3.5 }), sp, { shadow: false });
      K.anim((t) => { spores.rotation.y = t * 0.03; spores.position.y = Math.sin(t * 0.4) * 0.6; });
      K.light(0, 6, 0, 0x3affd0, 1.1); K.light(0, 18, 0, 0xff4ad8, 0.8);
      return g;
    },
  },
  {
    id: 'cathedral', name: 'Tidal-Glass Cathedral', kind: 'Sea-glass cathedral', footprint: 4, height: 35, cost: 52000, upkeep: 320, capacity: 480, tier: 4.3,
    power: 10, water: 6, jobs: 18,
    appeal: { sightseer: 3, scholar: 2, romantic: 5, thrill: 0, pilgrim: 5 }, boosts: { coast: 1.3, tides: 1.4, twinMoons: 1.1 },
    unlock: { renown: 4500 },
    lore: 'Eight fins of sea-glass rise like a breaking wave frozen mid-curl. The forecourt floods and drains with the tide; at high water the cathedral seems to stand on the sea.',
    night: 'Every leaded cell of glass lights from within in tide-pool colours.',
    build(K) {
      const g = K.root();
      const stone = K.mat(0xd8d4c8, { r: 0.75 });
      K.cyl(g, 8.4, 8.6, 0.8, stone, 0, 0.4, 0, { seg: 48 }); // plinth 0 → .8
      const tide = K.dyn(g, 0, 0.86, 0);
      K.mesh(tide, new K.THREE.CylinderGeometry(7.9, 7.9, 0.1, 48), K.water('sea'), 0, 0, 0, { shadow: false });
      K.anim((t) => { tide.position.y = 0.86 + (Math.sin(t * 0.12) * 0.5 + 0.5) * 0.45; });
      K.tor(g, 8.45, 0.25, stone, 0, 0.95, 0, { rot: { x: Math.PI / 2 }, rs: 8, ts: 64 }); // seawall rim
      K.cyl(g, 3.2, 3.4, 1.4, stone, 0, 0.7, 0, { seg: 32 }); // dais 0 → 1.4
      const glass = K.stained(0x7ad8d0);
      const fin = [[1.5, 0], [7.4, 0], [8.1, 3.5], [8.3, 8], [7.7, 13], [6.6, 18], [5.6, 22], [5.3, 25], [6.3, 27.3], [7.3, 27.6], [6.6, 28.8], [5.0, 29.2], [3.6, 28.2], [2.6, 25.5], [1.9, 20], [1.6, 12], [1.4, 5]]; // outer edge bulges, lip curls outward at the crest
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * TAU, main = i % 2 === 0;
        K.extrude(g, fin, 0.35, glass, 0, 1.4, 0, { rot: { y: -a }, scale: main ? [1, 1, 1] : [0.8, 0.6, 1] }); // local +x radial (ry = -a); fins rise from the dais top (1.4)
      }
      K.cone(g, 1.1, 33, glass, 0, 1.4 + 16.5, 0, { seg: 16 });                       // needle spire 1.4 → 34.4
      K.cyl(g, 0.3, 0.4, 30, K.glow(0xbff6ff, { day: 0.8, night: 4 }), 0, 16.4, 0, { seg: 8 });
      K.sph(g, 0.5, K.glow(0xfff0c0, { day: 1, night: 5 }), 0, 34.8, 0);
      K.light(0, 10, 0, 0x7ad8ff, 1.1); K.light(0, 24, 0, 0xff8ad8, 0.8);
      return g;
    },
  },
  {
    id: 'amphitheatre', name: 'Cascade Amphitheatre', kind: 'Waterfall amphitheatre', footprint: 4, height: 18, cost: 42000, upkeep: 260, capacity: 800, tier: 3.9,
    power: 16, water: 18, jobs: 22,
    appeal: { sightseer: 4, scholar: 1, romantic: 4, thrill: 3, pilgrim: 2 }, boosts: { river: 1.25, coast: 1.15, temperate: 1.15, humid: 1.1 },
    unlock: { renown: 6500 }, festivalBoost: 1.5,
    lore: 'Seven tiers of seats face a stage set before a man-made waterfall. Performers time their finales to the moment the falls switch from white to colour.',
    night: 'The falls turn to light and four beams find the stage.',
    build(K) {
      const g = K.root();
      const seatA = K.mat(0xcdbfa8, { r: 0.85 }), seatB = K.mat(0xb3a48c, { r: 0.85 }), rock = K.mat(0x7a7068, { r: 0.95, f: true });
      const L = 3.4, ps = -L / 2; // seats centred on +z (θ = 0 → +z), so the falls face the front/viewer
      const aisle = [];
      for (let k = 0; k < 7; k++) {
        const r0 = 3.0 + k * 0.72, r1 = r0 + 0.72, h = 0.5 + k * 0.5;
        K.lathe(g, [[r0, 0], [r1, 0], [r1, h], [r0, h], [r0, 0]], k % 2 ? seatA : seatB, 0, 0, 0, { seg: 36, ps, pl: L });
        for (let i = 0; i <= 8; i++) { const a = ps + i / 8 * L; aisle.push({ x: Math.sin(a) * (r0 + 0.05), y: h - 0.1, z: Math.cos(a) * (r0 + 0.05) }); }
      }
      K.inst(g, new K.THREE.SphereGeometry(0.09, 6, 4), K.glow(0xffd27a, { day: 0.3, night: 4 }), aisle, { shadow: false });
      K.cyl(g, 2.4, 2.5, 0.7, K.mat(0x2e2a36, { r: 0.4, m: 0.2 }), 0, 0.35, 0, { seg: 32 }); // stage 0 → .7, r 2.5 < seats' inner r 3
      K.tor(g, 2.45, 0.06, K.glow(0xff6ad8, { day: 0.4, night: 3 }), 0, 0.71, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 48 });
      // cliff behind the stage (-z); the waterfall faces +z toward the seats
      K.box(g, 6.6, 15, 2.0, rock, 0, 7.5, -7.3);
      for (const sx of [-1, 1]) K.mesh(g, K.jitter(new K.THREE.IcosahedronGeometry(4.2, 1), 0.9, sx + 4), rock, sx * 5.3, 5.6, -7.3, { scale: [0.7, 1.35, 0.55] }); // inner edge x≈±2.4 frames the falls
      K.mesh(g, K.jitter(new K.THREE.IcosahedronGeometry(3.0, 1), 0.7, 9), rock, 0, 15.2, -7.1, { scale: [1.4, 0.5, 0.65] });
      K.mesh(g, new K.THREE.PlaneGeometry(4.8, 14.6), K.flow(0xbfefff, 0x6ad8ff, { speed: 1.4, opacity: 0.9 }), 0, 7.5, -6.15, { shadow: false });
      K.mesh(g, new K.THREE.CylinderGeometry(2.2, 2.2, 0.3, 32), K.water('oasis'), 0, 0.15, -5.0, { shadow: false }); // plunge pool z -7.2 → -2.8 (stage starts -2.5)
      for (const [x, z] of [[-3.8, -3.2], [3.8, -3.2], [-4.6, 1.4], [4.6, 1.4]]) {
        K.cyl(g, 0.12, 0.14, 6, K.mat(0x22252c, { r: 0.5, m: 0.5 }), x, 3, z, { seg: 6 });
        K.sph(g, 0.3, K.glow(0xfff2d8, { day: 0.5, night: 5 }), x, 6.1, z);
        const dx = 0 - x, dz = 0 - z, dy = -5.4, len = Math.hypot(dx, dy, dz);
        const beam = K.mesh(g, new K.THREE.ConeGeometry(1.3, len, 16, 1, true), K.beam(0xfff0d0, { len, strength: 0.5 }), x + dx / 2, 6.1 + dy / 2, z + dz / 2, { shadow: false });
        beam.quaternion.setFromUnitVectors(new K.THREE.Vector3(0, -1, 0), new K.THREE.Vector3(dx, dy, dz).normalize()); beam.userData.keep = true;
      }
      K.light(0, 5, -3, 0xff6ad8, 1); K.light(0, 10, -5, 0x6ad8ff, 0.8);
      return g;
    },
  },
  {
    id: 'aurora', name: 'Aurora Needle', kind: 'Aurora tower', footprint: 3, height: 61, cost: 58000, upkeep: 300, capacity: 520, tier: 4.2,
    power: 24, water: 0, jobs: 14,
    appeal: { sightseer: 4, scholar: 3, romantic: 4, thrill: 2, pilgrim: 4 }, boosts: { auroras: 1.6, longNights: 1.3, frozen: 1.15, clearSkies: 1.1 },
    unlock: { renown: 8500 },
    lore: 'Three ceramic legs braid into a needle that bleeds charged gas into curtains around its crown — a private aurora that appears on any world, any night.',
    night: 'Green-to-violet curtains unfurl around the crown and ripple in slow wind.',
    build(K) {
      const g = K.root();
      const white = K.mat(0xeef0f4, { r: 0.45, m: 0.15 }), dark = K.mat(0x23303a, { r: 0.6 });
      K.cyl(g, 5.4, 5.6, 1.2, dark, 0, 0.6, 0, { seg: 3 });                                // 0 → 1.2
      K.cyl(g, 3.6, 3.8, 1.0, white, 0, 1.7, 0, { seg: 3, rot: { y: Math.PI / 3 } });      // 1.2 → 2.2
      for (let i = 0; i < 3; i++) { const a = i / 3 * TAU + Math.PI / 6; K.strut(g, [Math.cos(a) * 2.6, 2.2, Math.sin(a) * 2.6], [Math.cos(a) * 0.35, 52, Math.sin(a) * 0.35], 0.5, white, { rt: 0.22, seg: 10 }); }
      K.cyl(g, 0.22, 0.3, 50, K.glow(0x8affd8, { day: 0.6, night: 3.4 }), 0, 27, 0, { seg: 8 }); // core 2 → 52
      for (const y of [14, 26, 38, 48]) { const r = 2.6 + (0.35 - 2.6) * (y - 2.2) / 49.8 + 0.25; K.tor(g, r, 0.16, K.glow(0x9affe0, { day: 0.5, night: 3 }), 0, y, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 32 }); }
      K.cone(g, 0.5, 9, K.glow(0xd8fff0, { day: 1, night: 4 }), 0, 56.5, 0, { seg: 10 }); // 52 → 61
      // observation deck clasping the legs at y 32.4 → 33.6 (legs' radius there ≈ 1.2)
      K.cyl(g, 3.2, 2.4, 1.2, white, 0, 33, 0, { seg: 24 });
      K.cyl(g, 3.25, 3.25, 0.5, K.mat(0x9ad8e8, { r: 0.15, m: 0.4, e: 0x8affd8, ei: 1.2 }), 0, 33.85, 0, { seg: 24 }); // glazing band 33.6 → 34.1
      K.cyl(g, 3.4, 3.4, 0.18, white, 0, 34.19, 0, { seg: 24 });
      const rib = K.dyn(g);
      const mat = K.aurora();
      for (let r = 0; r < 3; r++) {
        const N = 72, pos = [], uvs = [], idx = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N, th = t * TAU * 1.15 + r * 2.1, rad = 6.8 + 1.9 * Math.sin(th * 3 + r), y0 = 30 + r * 4 + 8 * t + 1.8 * Math.sin(th * 5);
          const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
          pos.push(x, y0, z, x * 1.18, y0 + 12 + 2.5 * Math.sin(th * 2 + r), z * 1.18); uvs.push(t, 0, t, 1);
          if (i < N) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
        }
        const geo = new K.THREE.BufferGeometry(); geo.setAttribute('position', new K.THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new K.THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(idx); geo.computeVertexNormals();
        const m = K.mesh(rib, geo, mat, 0, 0, 0, { shadow: false }); m.userData.keep = true;
      }
      K.anim((t) => { rib.rotation.y = t * 0.035; });
      K.light(0, 40, 0, 0x5affb0, 1.2);
      return g;
    },
  },
  {
    id: 'moons', name: 'Monument of Moons', kind: 'Orrery monument', footprint: 3, height: 25, cost: 64000, upkeep: 320, capacity: 460, tier: 4.1,
    power: 18, water: 0, jobs: 14,
    appeal: { sightseer: 4, scholar: 4, romantic: 3, thrill: 1, pilgrim: 4 }, boosts: { twinMoons: 1.45, giantRise: 1.5, ringshine: 1.2, clearSkies: 1.05 },
    unlock: { renown: 11000 },
    lore: 'A basalt obelisk carries a captive sun; four sculpted moons — one from each kind of world — orbit it on hair-thin arms, each lit by its little star.',
    night: 'The moons glow from their night sides and the orb burns gold.',
    build(K) {
      const g = K.root();
      const basalt = K.mat(0x1e1d24, { r: 0.55, m: 0.2 }), pale = K.mat(0xd8d2c6, { r: 0.8 });
      K.cyl(g, 5.8, 6.0, 1, pale, 0, 0.5, 0, { seg: 40 });   // 0 → 1
      K.cyl(g, 4.6, 4.8, 1, basalt, 0, 1.5, 0, { seg: 40 }); // 1 → 2
      K.cyl(g, 0.8, 1.5, 18, basalt, 0, 11, 0, { seg: 4, rot: { y: Math.PI / 4 } }); // 2 → 20
      for (const y of [6, 12, 17]) { const r = 1.5 + (0.8 - 1.5) * (y - 2) / 18; K.cyl(g, r * 1.02 + 0.06, r * 1.02 + 0.06, 0.25, K.glow(0xffc86a, { day: 0.5, night: 3 }), 0, y, 0, { seg: 4, rot: { y: Math.PI / 4 } }); }
      const cy = 22.3;
      K.sph(g, 2.1, K.glow(0xffc46a, { day: 1.3, night: 4.5 }), 0, cy, 0, { w: 32, h: 20 }); // orb 20.2 → 24.4
      K.sph(g, 3.0, K.glow(0xff9a3a, { day: 0.1, night: 0.7, additive: true }), 0, cy, 0);
      const orbits = [[3.7, 'ice', 1.0, 0.0, 0.45], [5.2, 'volcanic', 1.3, 1.3, -0.3], [6.7, 'crystal', 1.1, 2.6, 0.22], [8.1, 'ocean', 1.6, 4.1, -0.16]];
      const tmpA = new K.THREE.Vector3(), tmpB = new K.THREE.Vector3();
      const moons = [];
      for (const [R, type, rad, ph, spd] of orbits) {
        K.tor(g, R, 0.04, K.glow(0xffe0a8, { day: 0.4, night: 1.6 }), 0, cy, 0, { rot: { x: Math.PI / 2 }, rs: 4, ts: 80 });
        const arm = K.dyn(g, 0, cy, 0); arm.rotation.y = ph;
        K.box(arm, R - 2.1, 0.06, 0.06, K.mat(0xb8a070, { r: 0.3, m: 0.7 }), 2.1 + (R - 2.1) / 2, 0, 0);
        const pm = K.planet(type, R * 13);
        const moon = K.mesh(arm, new K.THREE.SphereGeometry(rad, 32, 20), pm.mat, R, 0, 0, { shadow: false });
        pm.u.city.value = 1;
        moons.push({ arm, moon, pm, spd, ph });
      }
      K.anim((t) => {
        for (const m of moons) {
          m.arm.rotation.y = m.ph + t * m.spd * 0.3;
          m.arm.getWorldPosition(tmpA); m.moon.getWorldPosition(tmpB);
          m.pm.u.lightDir.value.copy(tmpA).sub(tmpB).normalize();
        }
      });
      K.light(0, cy, 0, 0xffb45a, 1.4);
      return g;
    },
  },
  {
    id: 'ziggurat', name: 'Lantern Ziggurat', kind: 'Stepped lantern temple', footprint: 4, height: 25, cost: 72000, upkeep: 340, capacity: 700, tier: 4.1,
    power: 10, water: 2, jobs: 20,
    appeal: { sightseer: 4, scholar: 3, romantic: 3, thrill: 2, pilgrim: 5 }, boosts: { singingDunes: 1.4, arid: 1.2, longNights: 1.2, geothermal: 1.1 },
    unlock: { renown: 14000 },
    lore: 'Six sandstone tiers ringed with two hundred lanterns, one lit for every ship that ever arrived. Pilgrims climb at dusk to release a sky-lantern of their own.',
    night: 'Every tier edge glows and sky-lanterns rise from the shrine.',
    build(K) {
      const g = K.root();
      const sandA = K.mat(0xc8a070, { r: 0.9 }), sandB = K.mat(0xb08860, { r: 0.9 }), trim = K.mat(0x6a4a34, { r: 0.85 });
      const W = [15, 12.6, 10.4, 8.4, 6.6, 5.0], lan = [];
      for (let k = 0; k < 6; k++) {
        const w = W[k], top = 3 * (k + 1);
        K.box(g, w, 3, w, k % 2 ? sandB : sandA, 0, 1.5 + 3 * k, 0);         // 3k → 3k+3
        K.box(g, w + 0.2, 0.25, w + 0.2, trim, 0, top - 0.085, 0);           // cornice top = top + .04 (no z-fight)
        const hw = w / 2 - 0.35, n = Math.max(3, Math.round(w / 1.3));
        for (let i = 0; i <= n; i++) { const t = -hw + i / n * hw * 2; for (const [x, z] of [[t, hw], [t, -hw], [hw, t], [-hw, t]]) if (Math.abs(x) > 1.6 || z < 0) lan.push({ x, y: top + 0.25, z }); }
      }
      // stair: (0,0,7.5) → (0,18,2.5); len 18.7, rx = +atan2(18,5) tips the +z end down to the ground
      const ang = Math.atan2(18, 5);
      K.box(g, 2.6, 0.5, Math.hypot(18, 5) + 0.4, sandA, 0, 9, 5.0, { rot: { x: ang } });
      for (let i = 0; i < 14; i++) { const t = i / 13; for (const sx of [-1.45, 1.45]) lan.push({ x: sx, y: 0.5 + t * 18, z: 7.5 - t * 5 + 0.1 }); }
      K.inst(g, new K.THREE.BoxGeometry(0.32, 0.42, 0.32), K.glow(0xffb04a, { day: 0.5, night: 4.2 }), lan, { shadow: false });
      K.box(g, 4, 3, 4, K.mat(0xe0c8a0, { r: 0.7, e: 0xffb04a, ei: 0.6 }), 0, 19.5, 0);   // shrine 18 → 21
      K.box(g, 1.2, 1.8, 0.05, K.glow(0xffc870, { day: 0.6, night: 4 }), 0, 18.9, 2.03); // door: proud of face z=2
      K.cone(g, 3.3, 2.8, trim, 0, 22.4, 0, { seg: 4, rot: { y: Math.PI / 4 } });        // roof 21 → 23.8
      K.sph(g, 0.7, K.glow(0xffd27a, { day: 1.2, night: 5 }), 0, 24.5, 0);
      const sky = K.dyn(g);
      const N = 24, seeds = []; for (let i = 0; i < N; i++) seeds.push([K.rng() * TAU, K.rng(), 0.6 + K.rng() * 1.4]);
      const skyL = K.inst(sky, new K.THREE.BoxGeometry(0.4, 0.55, 0.4), K.glow(0xffa040, { day: 0.0, night: 3.6 }), seeds.map(() => ({ y: -100 })), { shadow: false });
      skyL.frustumCulled = false;
      const M = new K.THREE.Matrix4();
      K.anim((t, dt, night) => {
        for (let i = 0; i < N; i++) {
          const [a, p, sp] = seeds[i], life = (t * 0.025 * sp + p) % 1, r = 1 + life * 14;
          M.makeTranslation(Math.cos(a + life * 2) * r, night > 0.2 ? 24 + life * 70 : -100, Math.sin(a + life * 2) * r);
          skyL.setMatrixAt(i, M);
        }
        skyL.instanceMatrix.needsUpdate = true;
      });
      K.light(0, 20, 0, 0xffb04a, 1.2);
      return g;
    },
  },
  {
    id: 'elevator', name: 'The Skyhook', kind: 'Orbital elevator', footprint: 4, height: 60, cost: 120000, upkeep: 600, capacity: 900, tier: 4.5,
    power: 40, water: 4, jobs: 40,
    appeal: { sightseer: 5, scholar: 4, romantic: 2, thrill: 5, pilgrim: 1 }, boosts: { lowGravity: 1.5, ringshine: 1.2, giantRise: 1.1, heavyGravity: 0.8 },
    unlock: { milestone: 'threePlanets' },
    lore: 'A carbon thread from the ground to geostationary orbit. Climber cars take nine hours to reach the top; the view from the halfway lounge is the most-photographed in the cluster.',
    night: 'Beacons blink up the tether until they vanish among the stars; climbers glide past them.',
    build(K) {
      const g = K.root();
      const hull = K.mat(0x9aa4b0, { r: 0.4, m: 0.5 }), dark = K.mat(0x2a303a, { r: 0.6, m: 0.3 });
      K.cyl(g, 7.6, 7.8, 3, hull, 0, 1.5, 0, { seg: 8 });  // 0 → 3
      K.cyl(g, 5.6, 5.8, 4, dark, 0, 5, 0, { seg: 8 });    // 3 → 7
      K.tor(g, 7.7, 0.1, K.glow(0x9ad8ff, { day: 0.4, night: 3 }), 0, 1.8, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 8 });
      K.tor(g, 5.7, 0.12, K.glow(0x9ad8ff, { day: 0.4, night: 3 }), 0, 7, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 8 });
      K.cyl(g, 2.4, 2.8, 6, hull, 0, 10, 0, { seg: 16 });  // collar 7 → 13
      K.tor(g, 2.6, 0.25, dark, 0, 13, 0, { rot: { x: Math.PI / 2 }, rs: 8, ts: 24 });
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + Math.PI / 8; K.strut(g, [Math.cos(a) * 6.8, 3, Math.sin(a) * 6.8], [Math.cos(a) * 2.5, 12.6, Math.sin(a) * 2.5], 0.32, dark); }
      const tether = K.cyl(g, 0.32, 0.32, 1500, K.glow(0xe8f0ff, { day: 0.9, night: 2.2 }), 0, 13 + 750, 0, { seg: 6, shadow: false }); tether.castShadow = false;
      const bea = []; for (let y = 30; y < 1300; y += 32) bea.push({ y, x: 0, z: 0 });
      K.inst(g, new K.THREE.SphereGeometry(0.7, 8, 6), K.beacon(0xff4a3a, { rate: 1.2 }), bea, { shadow: false });
      const pods = [];
      for (let i = 0; i < 2; i++) {
        const pod = K.dyn(g, 0, 16, 0);
        K.cyl(pod, 1.3, 1.3, 2.6, hull, 0, 0, 0, { seg: 12 });
        K.tor(pod, 1.35, 0.14, K.glow(0xffe0a0, { day: 0.8, night: 4 }), 0, 0, 0, { rot: { x: Math.PI / 2 }, rs: 6, ts: 24 });
        K.cone(pod, 1.3, 1.0, dark, 0, 1.8, 0, { seg: 12 });
        pods.push(pod);
      }
      K.anim((t) => { pods.forEach((p, i) => { p.position.y = 16 + (0.5 + 0.5 * Math.sin(t * 0.05 + i * Math.PI)) * 280; }); });
      // the halfway lounge: a ring station around the tether at y 62 (the most-photographed view in the cluster)
      const lounge = K.dyn(g, 0, 62, 0);
      K.tor(lounge, 7, 0.9, hull, 0, 0, 0, { rot: { x: Math.PI / 2 }, rs: 12, ts: 48 });
      K.tor(lounge, 7, 0.95, K.glow(0xffe0a0, { day: 0.5, night: 3.2 }), 0, 0, 0, { rot: { x: Math.PI / 2 }, rs: 4, ts: 48, arc: Math.PI * 2, scale: [1, 1, 0.25] });
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU; K.strut(lounge, [Math.cos(a) * 0.6, 0, Math.sin(a) * 0.6], [Math.cos(a) * 6.2, 0, Math.sin(a) * 6.2], 0.22, dark); }
      K.cyl(lounge, 1.4, 1.4, 3.2, hull, 0, 0, 0, { seg: 12 }); // hub clamps the tether
      K.anim((t) => { lounge.rotation.y = t * 0.03; });
      K.light(0, 9, 0, 0x9ad8ff, 1);
      return g;
    },
  },
];

export const LANDMARK_BY_ID = Object.fromEntries(LANDMARKS.map((l) => [l.id, l]));
