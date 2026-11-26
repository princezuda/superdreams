// Pebble Peaks — level data (pure; node-tested for counts, ids and route feasibility).
// Conventions: forward is −Z, y is up, `top` = walkable surface height. Shards float 0.9 above their surface.
// kind: box {x,z,w,d,top,h} · cyl {x,z,r,top,h} · ramp {x,z,w,d,top0 (min edge), top1 (max edge), axis}

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

class Lv {
  constructor(id, o) { Object.assign(this, { id, solids: [], shards: [], relics: [], checkpoints: [], enemies: [], hazards: [], hints: [], decor: [], route: [], boss: null, portals: [] }, o); this.base = o.base ?? -4; }
  _s(o) { this.solids.push(o); return o; }
  box(x, z, w, d, top, o = {}) { return this._s({ kind: 'box', x, z, w, d, top, h: o.h ?? top - this.base, m: o.m ?? 'ground', ...o }); }
  cyl(x, z, r, top, o = {}) { return this._s({ kind: 'cyl', x, z, r, top, h: o.h ?? this.floatH ?? top - this.base, island: !!this.floatH && !o.h && !o.path, m: o.m ?? 'ground', ...o }); }
  ramp(x, z, w, d, top0, top1, axis = 'z', o = {}) { return this._s({ kind: 'ramp', x, z, w, d, top0, top1, axis, h: o.h ?? Math.min(top0, top1) - this.base, m: o.m ?? 'ground', ...o }); }
  plat(x, z, w, d, top, o = {}) { return this.box(x, z, w, d, top, { h: 0.7, m: 'plank', ...o }); }
  mover(x, z, w, d, top, path, o = {}) { return this.box(x, z, w, d, top, { h: 0.7, m: 'plank', path, ...o }); }
  moverC(x, z, r, top, path, o = {}) { return this.cyl(x, z, r, top, { h: 0.7, m: 'plank', path, ...o }); }
  crumble(x, z, s, top, o = {}) { return this.box(x, z, s, s, top, { h: 0.7, m: 'crumble', crumble: true, ...o }); }
  shroom(x, z, r, top, v = 22, o = {}) { return this.cyl(x, z, r, top, { h: 0.8, m: 'shroom', bounce: v, ...o }); }
  breakable(x, z, s, top, loot = { shards: 3 }, o = {}) { return this.box(x, z, s, s, top, { h: s, m: 'crack', breakable: true, loot, camBlock: false, ...o }); }
  cloud(x, z, w, d, top, o = {}) { return this.box(x, z, w, d, top, { h: 0.6, m: 'cloud', semi: true, camBlock: false, ...o }); }
  shard(x, y, z) { this.shards.push([x, y, z]); }
  line(a, b, n) { for (let i = 0; i < n; i++) { const k = n === 1 ? 0.5 : i / (n - 1); this.shard(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k); } }
  arc(a, b, n, hgt = 2) { for (let i = 0; i < n; i++) { const k = (i + 1) / (n + 1); this.shard(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + Math.sin(k * Math.PI) * hgt, a[2] + (b[2] - a[2]) * k); } }
  ring(cx, y, cz, r, n) { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; this.shard(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r); } }
  relic(x, y, z) { this.relics.push([x, y, z]); }
  cp(x, y, z) { this.checkpoints.push([x, y, z]); }
  enemy(type, o) { this.enemies.push({ type, ...o }); }
  hint(x, z, r, key, y = null) { this.hints.push({ x, z, r, key, y }); }
  deco(type, x, y, z, s = 1, rot = 0) { this.decor.push({ type, x, y, z, s, rot }); }
  // scatter decor on a solid's top, away from its centre line (keeps the path readable)
  scatter(sol, type, n, seed, { margin = 0.8, avoid = 1.6, s0 = 0.7, s1 = 1.2 } = {}) {
    const r = rng(seed);
    for (let i = 0, tries = 0; i < n && tries < n * 20; tries++) {
      let x, z;
      if (sol.kind === 'cyl') { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * (sol.r - margin); x = sol.x + Math.cos(a) * d; z = sol.z + Math.sin(a) * d; if (Math.hypot(x - sol.x, z - sol.z) < avoid) continue; }
      else { x = sol.x + (r() - 0.5) * (sol.w - margin * 2); z = sol.z + (r() - 0.5) * (sol.d - margin * 2); if (Math.abs(x - sol.x) < avoid && sol.w > sol.d) { /* along-x path */ } else if (Math.abs(x - sol.x) < avoid) continue; }
      this.deco(type, x, sol.top, z, s0 + r() * (s1 - s0), r() * 6.28); i++;
    }
  }
  // route: ordered waypoints {p:[x,y,z], how:'walk'|'jump'|'double'|'long'|'bounce'|'ride'} checked by tests/route.test.mjs
  way(x, y, z, how = 'jump') { this.route.push({ p: [x, y, z], how }); }
}

// ================================================================== HUB — Pebble Plateau
function hub() {
  const L = new Lv('hub', { name: 'Pebble Plateau', theme: 'hub', base: -6, killY: -10, spawn: [0, 0, 7], yaw: Math.PI, sea: 'water', seaY: -1.2 });
  const main = L.cyl(0, 0, 15, 0);
  L.cyl(0, 2.5, 2.2, 0.5, { h: 0.5, m: 'stone' }); // fountain rim
  // practice playground (west): steps, a mushroom and a floating block
  L.box(-10, 4, 3, 3, 1.2, { m: 'stone', h: 1.2 }); L.box(-12, 0.5, 3, 3, 2.6, { m: 'stone', h: 2.6 }); L.shroom(-6.5, 7.5, 1.1, 0.8, 21);
  L.plat(-9, -3.5, 2.6, 2.6, 4.4, { m: 'plank' });
  L.box(10, 4, 4, 4, 1, { m: 'stone', h: 1 }); L.breakable(10, 4, 1.4, 2.4, { shards: 3 });
  // portals on an arc at the north rim
  const P = [[-9, -9], [-3.3, -12.3], [3.3, -12.3], [9, -9]];
  ['meadow', 'caves', 'sky', 'forge'].forEach((id, i) => { const [x, z] = P[i]; L.portals.push({ id, x, y: 0, z, yaw: Math.atan2(-x, -z) }); L.cyl(x, z, 1.7, 0.3, { m: 'stone', h: 0.3 }); });
  L.deco('tree', -12, 0, 9, 1.2); L.deco('tree', 12.5, 0, 7.5, 1.1); L.deco('tree', -13.2, 0, -5, 1); L.deco('tree', 13, 0, -4, 1.15); L.deco('tree', 5, 0, 12.5, 0.9);
  L.scatter(main, 'flower', 40, 11, { avoid: 3 }); L.scatter(main, 'tuft', 50, 12, { avoid: 2 }); L.scatter(main, 'rock', 6, 13, { avoid: 6 });
  L.hint(0, 7, 3, 'hub');
  return L;
}

// ================================================================== 1. MOSSY MEADOW (teaches everything)
function meadow() {
  const L = new Lv('meadow', { name: 'Mossy Meadow', theme: 'meadow', base: -4, killY: -2.2, spawn: [0, 0, 4], yaw: Math.PI, sea: 'water', seaY: -0.6, par: 150 });
  const s0 = L.box(0, 0, 14, 14, 0); L.way(0, 0, 4, 'walk');
  L.line([0, 0.9, 1], [0, 0.9, -5], 4);
  L.hint(0, 3, 3.5, 'move'); L.deco('tree', -5, 0, 5, 1.1); L.deco('tree', 5.2, 0, 3.6, 0.9); L.deco('tree', -5.3, 0, -4.4, 1); L.deco('tree', 5.5, 0, -5.2, 1.2);
  L.scatter(s0, 'flower', 26, 1, { avoid: 1.8 }); L.scatter(s0, 'tuft', 30, 2);
  // secret: little island behind the start (curiosity reward)
  const sec = L.cyl(0, 12.5, 2.4, -0.2); L.ring(0, 0.7, 12.5, 1.3, 6); L.deco('rock', 1.3, -0.2, 13.4, 0.8);
  // S1 step up + first bug
  const s1 = L.box(0, -10, 9, 6, 1.6); L.way(0, 1.6, -9, 'jump'); L.hint(0, -5, 2.6, 'jump');
  L.enemy('bug', { a: [-3, 1.6, -10.5], b: [3, 1.6, -10.5], speed: 1.6 }); L.hint(0, -8, 2.2, 'bop');
  L.line([-2.5, 2.5, -11.8], [2.5, 2.5, -11.8], 3); L.scatter(s1, 'tuft', 10, 3, { avoid: 3.5 });
  // S2 gap
  const s2 = L.box(0, -18.5, 6, 5, 1.6); L.arc([0, 2.5, -13], [0, 2.5, -16], 3, 1.6); L.way(0, 1.6, -18, 'jump');
  L.scatter(s2, 'flower', 8, 4, { avoid: 1.5 });
  // S3 tall ledge → double jump
  const s3 = L.box(0, -26, 8, 6, 4.6); L.hint(0, -19.8, 2.2, 'double'); L.way(0, 4.6, -25, 'double');
  L.line([0, 3.4, -21.3], [0, 5.9, -22.6], 3); L.cp(0, 4.6, -26.5);
  L.deco('tree', -3, 4.6, -28, 1); L.scatter(s3, 'flower', 8, 5, { avoid: 1.6 });
  // S4 crumbling planks → east
  L.hint(4, -26, 1.8, 'crumble');
  [6.6, 10.1, 13.6].forEach((x) => { L.crumble(x, -26, 2.6, 4.6); L.shard(x, 5.5, -26); L.way(x, 4.6, -26, 'jump'); });
  // S5 meadow island, mushroom + relic pillar
  const s5 = L.box(21, -26, 9, 9, 4.6); L.way(19, 4.6, -26, 'jump');
  L.enemy('bug', { a: [18, 4.6, -29], b: [18, 4.6, -23], speed: 1.7 }); L.enemy('bug', { a: [20.5, 4.6, -29.5], b: [24.5, 4.6, -29.5], speed: 1.8 });
  L.shroom(23.6, -22.8, 1.15, 5.4, 22); L.hint(23.6, -22.8, 2.6, 'shroom'); L.ring(23.6, 6.4, -22.8, 1.8, 6);
  L.cyl(23.6, -16.8, 1.6, 11, { m: 'ground' }); L.relic(23.6, 12, -16.8); L.deco('flower', 23.0, 11, -17.4, 1.1);
  L.deco('tree', 17.6, 4.6, -22.6, 1.1); L.scatter(s5, 'tuft', 12, 6, { avoid: 2.4 });
  // S6 moving plank north
  L.mover(21, -33, 3.4, 3.4, 4.6, { a: [21, 4.6, -33], b: [21, 4.6, -43], T: 7 }); L.way(21, 4.6, -33, 'ride');
  L.line([21, 5.6, -35], [21, 5.6, -41], 4);
  // S7 checkpoint island, roll + pound tutorial, long-jump relic far west
  const s7 = L.box(21, -51, 10, 11, 4.6); L.way(21, 4.6, -48, 'jump'); L.cp(23.5, 4.6, -47.8);
  L.hint(21, -50, 2.6, 'roll'); L.hint(17.6, -51, 2, 'long');
  L.breakable(24.5, -54.5, 1.4, 6.0, { shards: 3 }); L.breakable(22.6, -55.2, 1.2, 5.8, { shards: 2 }); L.hint(23.6, -53.4, 2.2, 'pound');
  L.enemy('bug', { a: [18, 4.6, -54], b: [18, 4.6, -48], speed: 1.9 });
  L.line([14.5, 6.6, -51], [5.5, 6.6, -51], 5); // breadcrumb over the 12 u gap
  const far = L.cyl(2, -51, 2.2, 4.6); L.relic(2, 5.5, -51); L.deco('tree', 1.2, 4.6, -52.2, 0.8);
  L.scatter(s7, 'flower', 10, 7, { avoid: 2 });
  // S8 ramp up to the cliffs
  L.ramp(21, -61, 5, 9, 8, 4.6, 'z'); L.line([21, 6.2, -58], [21, 8.4, -64], 4); L.way(21, 6.3, -61, 'walk');
  const s9 = L.box(21, -70, 9, 9, 8); L.way(21, 8, -69, 'walk');
  L.enemy('bug', { a: [18, 8, -72], b: [24, 8, -72], speed: 2 }); L.enemy('bug', { a: [24, 8, -67], b: [24, 8, -73], speed: 1.6 });
  L.breakable(17.8, -73.3, 1.6, 9.6, { relic: 2 }); L.breakable(17.8, -71.5, 1.2, 9.2, { shards: 2 }); // the boulder pile hides relic #2
  L.relic(17.8, 8.9, -73.3);
  L.deco('tree', 24.6, 8, -73.6, 1.2); L.scatter(s9, 'tuft', 10, 8, { avoid: 2.5 });
  // S10 pillars to the summit
  [[21, -79, 9.2], [17, -83, 10.4], [21, -87.5, 11.6]].forEach(([x, z, t]) => { L.cyl(x, z, 1.6, t, { m: 'ground' }); L.shard(x, t + 0.9, z); L.way(x, t, z, 'jump'); });
  const top = L.cyl(21, -95, 5, 12.8); L.way(21, 12.8, -92, 'jump');
  L.goal = [21, 12.8, -96.5]; L.deco('tree', 18, 12.8, -98, 1.3); L.deco('tree', 24.4, 12.8, -97, 1); L.scatter(top, 'flower', 14, 9, { avoid: 2.2 });
  L.way(21, 12.8, -96.5, 'walk');
  for (const [x, z, sc] of [[-8.5, -3, 2.2], [8.6, -12, 1.8], [-5.5, -18, 2.6], [6, -31, 2], [12, -19, 1.6], [28.5, -34, 2.4], [14, -40, 2.2], [28, -58, 2.8], [13.5, -66, 2], [27, -80, 2.4], [14, -90, 3], [-4, 9, 1.8]]) L.deco('rock', x, L.seaY - 0.35, z, sc, x * z);
  L.scatter(s5, 'rock', 3, 61, { avoid: 3 }); L.scatter(s7, 'rock', 3, 62, { avoid: 3 }); L.scatter(s9, 'rock', 2, 63, { avoid: 3 }); L.scatter(s1, 'flower', 8, 64, { avoid: 2 });
  return L;
}

// ================================================================== 2. GLIMMER GROTTO (crystal caves)
function caves() {
  const L = new Lv('caves', { name: 'Glimmer Grotto', theme: 'caves', base: -10, killY: -7, spawn: [0, 0, 3], yaw: Math.PI, sea: 'abyss', seaY: -6, par: 170 });
  const c0 = L.box(0, 0, 10, 10, 0); L.way(0, 0, 3, 'walk'); L.line([0, 0.9, 1], [0, 0.9, -3], 3);
  // cave walls (visual mass + camera collision)
  { const wr = rng(77); for (const side of [-1, 1]) { let z = side < 0 ? 15 : 3; while (z > -56) { const len = 5 + wr() * 6, inner = 8 + wr() * 1.1, w = 5 + wr() * 2, top = 8 + wr() * 9;
      const c = L.box(side * (inner + w / 2), z - len / 2, w, len, top, { m: 'wall', h: 24 }); if (wr() < 0.7) L.deco('crystal', c.x + (wr() - 0.5) * (w - 1.5), top, c.z + (wr() - 0.5) * (len - 1.5), 1 + wr() * 0.8, wr() * 6); z -= len; } } }
  L.scatter(c0, 'crystal', 6, 21, { avoid: 2.5 }); L.scatter(c0, 'rock', 5, 22, { avoid: 2.5 });
  const c1 = L.box(0, -10, 6, 6, 0); L.way(0, 0, -10, 'jump'); L.line([0, 1.6, -5.6], [0, 1.6, -6.4], 1);
  L.enemy('mite', { x: 0, y: 0, z: -10, range: 2.2, speed: 2.2, charge: 5.5 }); L.hint(0, -6, 2.4, 'mite');
  // crumbling crystal bridge (and a secret ledge underneath it)
  [-15.5, -18.5, -21.5, -24.5].forEach((z) => { L.crumble(0, z, 2.4, 0, { m: 'crumble' }); L.shard(0, 0.9, z); L.way(0, 0, z, 'jump'); });
  const sec = L.box(-6, -20, 4, 4, -3.5, { h: 1.2, m: 'ground' }); L.relic(-6.6, -2.6, -20.6); L.shroom(-5.2, -19.2, 1.0, -2.8, 23); L.deco('crystal', -7.4, -3.5, -21.4, 1.2);
  const c2 = L.box(0, -31, 8, 6, 0); L.way(0, 0, -30, 'jump'); L.cp(2.5, 0, -31); L.scatter(c2, 'crystal', 4, 23, { avoid: 2.2 }); L.breakable(-2.8, -32.6, 1.3, 1.3, { shards: 3 }, { m: 'crack' });
  // elevator shaft
  L.mover(0, -37.5, 3, 3, 0, { a: [0, 0, -37.5], b: [0, 7, -37.5], T: 6.5 }); L.way(0, 0, -37.5, 'ride'); L.line([0, 2, -37.5], [0, 7, -37.5], 4);
  const c3 = L.box(0, -44, 8, 6, 7); L.way(0, 7, -43, 'jump');
  L.enemy('mite', { x: -2.4, y: 7, z: -45.6, range: 1.4, speed: 2.4, charge: 5 }); L.enemy('mite', { x: 2.6, y: 7, z: -43.2, range: 1.2, speed: 2.4, charge: 5 });
  L.scatter(c3, 'crystal', 4, 24, { avoid: 2.4 }); L.line([-3, 7.9, -42], [3, 7.9, -42], 4);
  // great crystal pillar with orbiting platforms (a riding mushroom launches to relic #2 on top)
  L.cyl(0, -56, 2.5, 14, { m: 'crystalwall' });
  L.moverC(0, -50.5, 1.5, 7, { orbit: [0, 7, -56, 5.5], T: 9, ph: 0.25 }); L.moverC(0, -61.5, 1.5, 7, { orbit: [0, 7, -56, 5.5], T: 9, ph: 0.75 });
  L.cyl(5.5, -56, 1.25, 7.6, { h: 0.8, m: 'shroom', bounce: 24.5, path: { orbit: [0, 7.6, -56, 5.5], T: 9, ph: 0 } });
  L.relic(0, 15, -56); L.hint(0, -48.6, 2.2, 'orbit');
  L.way(0, 7, -50.5, 'ride');
  L.ring(0, 8, -56, 5.5, 10);
  const c4 = L.box(0, -67, 8, 5, 7); L.way(0, 7, -66, 'jump'); L.cp(-2.5, 7, -67); L.line([0.5, 7.9, -65.5], [3.2, 7.9, -68.5], 3); L.breakable(-2.6, -68.6, 1.2, 8.2, { shards: 3 });
  // zig-zag crystal ledges
  const c5 = L.box(6, -74, 5, 5, 9, { m: 'stone' }); L.way(6, 9, -74, 'jump'); L.shard(6, 9.9, -74);
  // long-jump alcove under a low ceiling (relic #3)
  L.box(12.25, -74, 5.5, 3.6, 13.4, { h: 1.8, m: 'wall', camBlock: false }); // overhang: bottom 11.6 → only the low long jump fits
  const alc = L.box(16.6, -74, 3.2, 3.6, 9, { m: 'stone' }); L.relic(17.2, 9.9, -74); L.line([9.6, 10.1, -74], [13.8, 10.1, -74], 3); L.hint(7.4, -74, 1.5, 'lowroof');
  const c6 = L.box(0, -81, 5, 5, 11, { m: 'stone' }); L.way(0, 11, -81, 'jump'); L.shard(0, 11.9, -81);
  L.enemy('mite', { x: 0, y: 11, z: -81, range: 1.2, speed: 2.6, charge: 4 });
  const c7 = L.box(-6, -88, 5, 5, 13, { m: 'stone' }); L.way(-6, 13, -88, 'jump'); L.shard(-6, 13.9, -88);
  [[-2.2, -93.6], [1.6, -96.2]].forEach(([x, z]) => { L.crumble(x, z, 2.4, 13); L.shard(x, 13.9, z); L.way(x, 13, z, 'jump'); });
  const top = L.cyl(4, -103, 5, 14); L.way(4, 14, -100, 'jump'); L.goal = [4, 14, -104.5]; L.way(4, 14, -104.5, 'walk'); L.ring(4, 14.9, -103, 3.2, 6);
  L.scatter(top, 'crystal', 8, 25, { avoid: 2.4 }); L.scatter(c4, 'rock', 3, 26, { avoid: 2 });
  // big background crystals
  for (const [x, z, s] of [[-7.5, -8, 2.2], [7.6, -16, 2.6], [-7.6, -40, 3], [7.4, -48, 2.4], [-7.4, -66, 2.8], [7.8, -86, 3.2], [-9, -100, 3.4], [10, -104, 2.6]]) L.deco('bigcrystal', x, -1, z, s);
  return L;
}

// ================================================================== 3. CLOUDTOP ISLES (sky islands)
function sky() {
  const L = new Lv('sky', { name: 'Cloudtop Isles', theme: 'sky', base: -5, floatH: 3.2, killY: -9, spawn: [0, 0, 3], yaw: Math.PI, sea: 'clouds', seaY: -8, par: 180 });
  const k0 = L.cyl(0, 0, 6, 0); L.way(0, 0, 3, 'walk'); L.scatter(k0, 'flower', 16, 31, { avoid: 1.6 }); L.scatter(k0, 'tuft', 16, 32); L.deco('tree', -3.6, 0, 2.6, 1); L.deco('tree', 3.8, 0, -1.8, 0.9); L.ring(0, 0.9, -0.5, 3.6, 6);
  // cloud stairs (semi-solid: jump up through them)
  L.hint(0, -5, 2.4, 'cloud');
  [[0, -9, 1.5], [-3.6, -13, 3], [0, -17, 4.5]].forEach(([x, z, t]) => { L.cloud(x, z, 4, 3, t); L.shard(x, t + 0.9, z); L.way(x, t, z, 'jump'); });
  const k2 = L.cyl(0, -25, 4, 4.5); L.way(0, 4.5, -24, 'jump'); L.cp(1.5, 4.5, -24); L.deco('tree', -2, 4.5, -26.5, 0.9); L.ring(0, 5.4, -25, 2.6, 5);
  // puffling chain across the big gap
  L.hint(0, -27.6, 1.8, 'puff');
  [[0, 6.6, -33], [0, 7.6, -38.5], [0, 8.4, -44]].forEach(([x, y, z]) => { L.enemy('puff', { x, y, z, bob: 0.25, respawn: true }); L.way(x, y + 0.5, z, 'bounce'); });
  L.arc([0, 9.4, -33], [0, 10, -44], 4, 1.5);
  const k4 = L.cyl(0, -50, 4.5, 6); L.way(0, 6, -49, 'jump'); L.scatter(k4, 'flower', 10, 33, { avoid: 1.5 }); L.breakable(-2.4, -51.2, 1.3, 7.3, { shards: 3 }); L.line([-1.5, 6.9, -47.5], [1.5, 6.9, -47.5], 3);
  L.enemy('puff', { x: 2.2, y: 9.4, z: -51.5, bob: 0.4, respawn: true }); L.cloud(4.4, -54, 2.6, 2.6, 13, { h: 0.6 }); L.relic(4.4, 13.9, -54); // bonus puff → high cloud
  // sliding planks
  L.mover(-5, -58, 3, 3, 6, { a: [-5, 6, -58], b: [5, 6, -58], T: 5 }); L.mover(5, -64, 3, 3, 6, { a: [5, 6, -64], b: [-5, 6, -64], T: 5 });
  L.way(0, 6, -58, 'ride'); L.way(0, 6, -64, 'ride'); L.line([-3, 7, -61], [3, 7, -61], 3);
  const k6 = L.cyl(0, -72, 4.5, 6); L.way(0, 6, -71, 'jump'); L.cp(-1.5, 6, -71.5); L.ring(0, 6.9, -72, 3, 6);
  L.enemy('bug', { a: [-2.5, 6, -73.5], b: [2.5, 6, -73.5], speed: 2.1 });
  // a hidden ledge under k6 (drop off the west side), with a cloud bounce back up
  L.cloud(-6.8, -72, 3, 3, 1.6); L.relic(-6.8, 2.5, -72.6); L.shroom(-6.2, -71.2, 0.9, 2.2, 19.5, { h: 0.6, m: 'shroom', semi: false });
  // crumbling cloud bridge
  [-77.6, -81.1, -84.6, -88.1].forEach((z, i) => { L.crumble(i % 2 ? 0.8 : -0.8, z, 2.6, 6, { m: 'crumblecloud' }); L.shard(i % 2 ? 0.8 : -0.8, 6.9, z); L.way(i % 2 ? 0.8 : -0.8, 6, z, 'walk'); });
  const k8 = L.cyl(0, -95, 5, 7); L.way(0, 7, -94, 'jump'); L.enemy('puff', { x: -2, y: 8.6, z: -96, bob: 0.5, hover: 1.6 }); L.enemy('bug', { a: [2.5, 7, -97], b: [2.5, 7, -93], speed: 2 });
  L.deco('tree', 3.3, 7, -98, 1); L.scatter(k8, 'flower', 10, 34, { avoid: 2 }); L.ring(0, 7.9, -95, 3.4, 6); L.breakable(-3, -93, 1.3, 8.3, { shards: 3 });
  // rotating staircase around the sky tower
  L.cyl(0, -107, 2, 19, { m: 'stone', h: 30 }); L.relic(0, 19.9, -107);
  const T = 12; // all co-rotate so the offsets are constant
  [[0, 9], [0.13, 12], [0.26, 15], [0.39, 18]].forEach(([ph, top], i) => { L.moverC(0, -101.5, 1.5, top, { orbit: [0, top, -107, 5.5], T, ph: 0.25 + ph }); });
  L.way(0, 9, -101.5, 'stairs');
  L.hint(0, -99.2, 2, 'stairs');
  const k10 = L.cyl(0, -120, 5, 17); L.way(0, 17, -117, 'stairs'); L.goal = [0, 17, -121.5]; L.way(0, 17, -121.5, 'walk');
  L.scatter(k10, 'flower', 12, 35, { avoid: 2 }); L.deco('tree', -3, 17, -122, 1.2);
  L.ring(0, 10, -107, 5.5, 8);
  return L;
}

// ================================================================== 4. CINDER FORGE (finale + boss)
function forge() {
  const L = new Lv('forge', { name: 'Cinder Forge', theme: 'forge', base: -4, killY: -0.9, spawn: [0, 2, 3], yaw: Math.PI, sea: 'lava', seaY: -0.4, par: 240 });
  const f0 = L.box(0, 0, 10, 10, 2); L.way(0, 2, 3, 'walk'); L.line([0, 2.9, 1], [0, 2.9, -3], 3); L.scatter(f0, 'rock', 5, 41, { avoid: 2 });
  L.hint(0, -3.5, 2.4, 'sink'); L.way(0, 2, -4.2, 'walk');
  [-9, -14, -19].forEach((z, i) => { L.cyl(0, z, 1.6, 2, { h: 1.4, m: 'basalt', path: { a: [0, 2, z], b: [0, -2.2, z], T: 6.5, ph: 0.2 - i * 0.16 } }); L.shard(0, 2.9, z); L.way(0, 2, z, 'jump'); });
  const f2 = L.box(0, -27, 8, 6, 2); L.way(0, 2, -26, 'jump'); L.cp(-2.6, 2, -25.4); L.line([-3, 2.9, -29.4], [3, 2.9, -29.4], 4);
  L.hazards.push({ t: 'jet', x: -1.6, y: 2, z: -28.2, r: 0.7, h: 3.2, T: 2.4, on: 0.45, ph: 0 }, { t: 'jet', x: 1.6, y: 2, z: -28.2, r: 0.7, h: 3.2, T: 2.4, on: 0.45, ph: 0.5 });
  L.hint(0, -25, 2, 'jet');
  L.box(3, -28.6, 2, 2, 7.8, { h: 5.8, m: 'metal' }); L.relic(3, 8.7, -28.6); L.hint(1.4, -26.8, 1.4, 'highjump');
  // ferry across the lava
  L.mover(0, -34, 3.4, 3.4, 2, { a: [0, 2, -34], b: [0, 2, -46], T: 6.5 }, { m: 'metal' }); L.way(0, 2, -34, 'ride'); L.line([0, 3, -36], [0, 3, -44], 4);
  const f4 = L.box(0, -53, 8, 8, 2); L.way(0, 2, -51, 'jump');
  L.enemy('blob', { x: -1.5, y: 2, z: -54, range: 2, hop: 1.6 }); L.ring(0, 2.9, -53, 3, 6); L.breakable(2.8, -55.6, 1.3, 3.3, { shards: 3 });
  // crumbling basalt bridge east, relic ledge on a spring below
  [6.5, 10, 13.5].forEach((x) => { L.crumble(x, -53, 2.6, 2, { m: 'crumble' }); L.shard(x, 2.9, -53); L.way(x, 2, -53, 'jump'); });
  L.box(10, -59.2, 3, 3, 0.4, { h: 1.2, m: 'metal' }); L.relic(10.6, 1.3, -59.8); L.shroom(9.3, -58.5, 0.9, 1.0, 20, { m: 'spring', h: 0.6 });
  const f5 = L.box(20, -53, 8, 8, 2); L.way(19, 2, -53, 'jump'); L.cp(21.5, 2, -50.6);
  L.enemy('blob', { x: 20, y: 2, z: -55, range: 2.4, hop: 1.8 }); L.enemy('blob', { x: 22.5, y: 2, z: -51, range: 1.4, hop: 1.4 }); L.ring(20, 2.9, -53, 3, 6); L.breakable(17.2, -56.2, 1.3, 3.3, { shards: 3 });
  // girders up
  [[20, -61, 4], [20, -67, 6], [20, -73, 8]].forEach(([x, z, t], i) => { L.box(x, z, 4, 4, t, { m: 'metal' }); L.shard(x, t + 0.9, z); L.way(x, t, z, 'jump'); });
  L.hazards.push({ t: 'jet', x: 20, y: 6, z: -67, r: 0.8, h: 3, T: 3, on: 0.35, ph: 0.2 });
  L.cyl(27.2, -66, 1.2, 9.4, { m: 'metal' }); L.relic(27.2, 10.3, -66); L.hazards.push({ t: 'jet', x: 27.2, y: 9.4, z: -66, r: 0.8, h: 2.6, T: 3.2, on: 0.3, ph: 0.6 });
  // bridge + boss arena
  L.box(20, -81, 4, 12, 8, { m: 'metal' }); L.way(20, 8, -79, 'walk'); L.cp(21.3, 8, -77.6); L.line([20, 8.9, -77.5], [20, 8.9, -84.5], 4);
  L.cyl(20, -98, 11, 8, { m: 'arena' }); L.way(20, 8, -90, 'walk'); L.ring(20, 8.9, -98, 8.5, 10);
  L.boss = { x: 20, y: 8, z: -99, r: 11 };
  L.goal = [20, 8, -99]; L.goalHidden = true;
  for (const [x, z, s] of [[-26, -18, 1.1], [24, -10, 0.9], [-24, -60, 1.2], [44, -40, 1], [46, -78, 1.3], [-8, -98, 1.1], [40, -112, 1.2], [4, -126, 1]]) L.deco('chimney', x, -1, z, s);
  return L;
}

export const LEVELS = { hub: hub(), meadow: meadow(), caves: caves(), sky: sky(), forge: forge() };
export const ORDER = ['meadow', 'caves', 'sky', 'forge'];
export const NAMES = { meadow: 'Mossy Meadow', caves: 'Glimmer Grotto', sky: 'Cloudtop Isles', forge: 'Cinder Forge' };
export const totalShards = (id) => LEVELS[id].shards.length + LEVELS[id].solids.reduce((n, s) => n + (s.loot?.shards || 0), 0);
