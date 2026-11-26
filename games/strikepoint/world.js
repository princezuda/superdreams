// Collision world: AABB colliders + ramps in a uniform spatial hash, terrain height function,
// DDA raycast for bullets/LOS, circle-vs-box movement resolution, cover points and nav-grid bake.
import { rayAABB } from './logic.js';
import { NavGrid } from './nav.js';

const CELL = 4;
const _n = [0, 0, 0];

export class World {
  constructor(bounds, terrainFn = null, terrainSurf = null) {
    this.bounds = bounds; // {minX,maxX,minZ,maxZ}
    this.terrain = terrainFn || (() => 0);
    this.terrainSurf = terrainSurf || (() => 'concrete');
    this.flat = !terrainFn;
    this.cols = [];
    this.gw = Math.ceil((bounds.maxX - bounds.minX) / CELL) + 2;
    this.gh = Math.ceil((bounds.maxZ - bounds.minZ) / CELL) + 2;
    this.grid = Array.from({ length: this.gw * this.gh }, () => []);
    this.stamp = 0;
    this.cover = [];
    this.smokes = []; // {x,y,z,r,until}
    this.killY = -30;
  }
  _cells(c, fn) {
    const i0 = Math.max(0, Math.floor((c.min[0] - this.bounds.minX) / CELL) + 1), i1 = Math.min(this.gw - 1, Math.floor((c.max[0] - this.bounds.minX) / CELL) + 1);
    const j0 = Math.max(0, Math.floor((c.min[2] - this.bounds.minZ) / CELL) + 1), j1 = Math.min(this.gh - 1, Math.floor((c.max[2] - this.bounds.minZ) / CELL) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(this.grid[j * this.gw + i]);
  }
  // kind: 'box' | 'ramp' (ramp rises along axis 0=x/2=z in direction dir ±1). flags: {surf, noBullet, noNav, piece, glass}
  add(minx, miny, minz, maxx, maxy, maxz, surf = 'concrete', o = {}) {
    const c = { min: [minx, miny, minz], max: [maxx, maxy, maxz], surf, kind: o.kind || 'box', axis: o.axis ?? 0, dir: o.dir ?? 1, noBullet: !!o.noBullet, noNav: !!o.noNav, piece: o.piece || null, s: 0, dead: false, hp: o.hp ?? 0, onHit: o.onHit || null };
    this.cols.push(c); this._cells(c, (l) => l.push(c));
    return c;
  }
  remove(c) { c.dead = true; this._cells(c, (l) => { const k = l.indexOf(c); if (k >= 0) l.splice(k, 1); }); }
  rampY(c, x, z) {
    const a = c.axis, lo = c.min[a], hi = c.max[a], p = a === 0 ? x : z;
    let t = (p - lo) / (hi - lo); if (c.dir < 0) t = 1 - t; t = t < 0 ? 0 : t > 1 ? 1 : t;
    return c.min[1] + (c.max[1] - c.min[1]) * t;
  }
  query(x, z, r, out) {
    out.length = 0; const st = ++this.stamp;
    const i0 = Math.max(0, Math.floor((x - r - this.bounds.minX) / CELL) + 1), i1 = Math.min(this.gw - 1, Math.floor((x + r - this.bounds.minX) / CELL) + 1);
    const j0 = Math.max(0, Math.floor((z - r - this.bounds.minZ) / CELL) + 1), j1 = Math.min(this.gh - 1, Math.floor((z + r - this.bounds.minZ) / CELL) + 1);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) for (const c of this.grid[j * this.gw + i]) {
      if (c.s === st) continue; c.s = st;
      if (x + r < c.min[0] || x - r > c.max[0] || z + r < c.min[2] || z - r > c.max[2]) continue;
      out.push(c);
    }
    return out;
  }
  // Highest walkable surface under a circle that is at most `step` above footY.
  floorAt(x, z, r, footY, step = 0.5, info = null) {
    let best = this.terrain(x, z), surf = null, col = null;
    const list = this.query(x, z, r * 0.7, _q);
    for (const c of list) {
      let top;
      if (c.kind === 'ramp') { if (x < c.min[0] || x > c.max[0] || z < c.min[2] || z > c.max[2]) continue; top = this.rampY(c, x, z); }
      else top = c.max[1];
      if (top <= footY + step && top > best) { best = top; surf = c.surf; col = c; }
    }
    if (info) { info.surf = surf || this.terrainSurf(x, z); info.col = col; }
    return best;
  }
  // ground-level standing height (never a roof): terrain plus low slabs/curbs
  groundAt(x, z, r = 0.3) { return this.floorAt(x, z, r, this.terrain(x, z) + 0.3, 0.35); }
  ceilAt(x, z, r, fromY) {
    let best = 1e9; const list = this.query(x, z, r * 0.8, _q);
    for (const c of list) if (c.kind === 'box' && c.min[1] >= fromY - 0.05 && c.min[1] < best) best = c.min[1];
    return best;
  }
  // Push a vertical cylinder out of boxes. Mutates p {x,z}. Returns true if touched a wall.
  collide(p, r, footY, height, step = 0.5) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      const list = this.query(p.x, p.z, r, _q);
      for (const c of list) {
        if (c.kind === 'ramp') continue;
        if (c.max[1] <= footY + step || c.min[1] >= footY + height) continue;
        const cx = Math.max(c.min[0], Math.min(p.x, c.max[0])), cz = Math.max(c.min[2], Math.min(p.z, c.max[2]));
        let dx = p.x - cx, dz = p.z - cz; const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
        else { // centre inside box: push out along the smallest axis
          const ex = [p.x - c.min[0], c.max[0] - p.x, p.z - c.min[2], c.max[2] - p.z]; let m = 0; for (let i = 1; i < 4; i++) if (ex[i] < ex[m]) m = i;
          if (m === 0) p.x = c.min[0] - r; else if (m === 1) p.x = c.max[0] + r; else if (m === 2) p.z = c.min[2] - r; else p.z = c.max[2] + r;
        }
      }
    }
    return hit;
  }
  // Terrain ray (flat: plane; else march + bisect).
  rayTerrain(ox, oy, oz, dx, dy, dz, maxT) {
    if (this.flat) { if (dy >= -1e-6) return -1; const t = (this.terrain(0, 0) - oy) / dy; return t >= 0 && t <= maxT ? t : -1; }
    let prev = 0, step = 1.0;
    if (oy - this.terrain(ox, oz) < 0) return 0;
    for (let t = step; t <= maxT + step; t += step) {
      const tt = Math.min(t, maxT), x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
      if (y < this.terrain(x, z)) {
        let a = prev, b = tt; for (let k = 0; k < 8; k++) { const m = (a + b) / 2; if (oy + dy * m < this.terrain(ox + dx * m, oz + dz * m)) b = m; else a = m; }
        return b;
      }
      prev = tt; if (tt >= maxT) break;
      if (t > 40) step = 2.0;
    }
    return -1;
  }
  // Raycast against everything static. o/d plain numbers. Returns hit object (reused) or null.
  ray(ox, oy, oz, dx, dy, dz, maxT, opt = 0) {
    let best = maxT, bc = null, nx = 0, ny = 1, nz = 0;
    const tt = this.rayTerrain(ox, oy, oz, dx, dy, dz, maxT);
    if (tt >= 0 && tt < best) { best = tt; bc = TERRAIN; if (this.flat) { nx = 0; ny = 1; nz = 0; } else { const x = ox + dx * tt, z = oz + dz * tt, e = 0.5; const hx = this.terrain(x + e, z) - this.terrain(x - e, z), hz = this.terrain(x, z + e) - this.terrain(x, z - e); const l = Math.hypot(hx, 2 * e, hz); nx = -hx / l; ny = 2 * e / l; nz = -hz / l; } }
    // 2D DDA over the hash grid
    const st = ++this.stamp, B = this.bounds;
    let gx = (ox - B.minX) / CELL + 1, gz = (oz - B.minZ) / CELL + 1;
    let i = Math.floor(gx), j = Math.floor(gz);
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const tdx = Math.abs(dx) > 1e-9 ? CELL / Math.abs(dx) : 1e9, tdz = Math.abs(dz) > 1e-9 ? CELL / Math.abs(dz) : 1e9;
    let tmx = Math.abs(dx) > 1e-9 ? ((dx > 0 ? (i + 1 - gx) : (gx - i)) * CELL) / Math.abs(dx) : 1e9;
    let tmz = Math.abs(dz) > 1e-9 ? ((dz > 0 ? (j + 1 - gz) : (gz - j)) * CELL) / Math.abs(dz) : 1e9;
    let tEnter = 0;
    for (let guard = 0; guard < 400; guard++) {
      if (i >= 0 && j >= 0 && i < this.gw && j < this.gh) {
        for (const c of this.grid[j * this.gw + i]) {
          if (c.s === st) continue; c.s = st;
          if ((opt & 1) && c.noBullet) continue;
          let t;
          if (c.kind === 'ramp') t = this._rayRamp(c, ox, oy, oz, dx, dy, dz, best);
          else t = rayAABB(ox, oy, oz, dx, dy, dz, c.min, c.max, best, _n);
          if (t >= 0 && t < best) { best = t; bc = c; if (c.kind === 'ramp') { nx = _rn[0]; ny = _rn[1]; nz = _rn[2]; } else { nx = _n[0]; ny = _n[1]; nz = _n[2]; } }
        }
      } else if ((si > 0 && i >= this.gw) || (si < 0 && i < 0) || (sj > 0 && j >= this.gh) || (sj < 0 && j < 0)) break;
      tEnter = Math.min(tmx, tmz);
      if (tEnter > best) break;
      if (tmx < tmz) { tmx += tdx; i += si; } else { tmz += tdz; j += sj; }
    }
    if (!bc) return null;
    // smoke doesn't stop bullets; it stops eyes (see los)
    HIT.t = best; HIT.x = ox + dx * best; HIT.y = oy + dy * best; HIT.z = oz + dz * best; HIT.nx = nx; HIT.ny = ny; HIT.nz = nz;
    HIT.col = bc === TERRAIN ? null : bc; HIT.surf = bc === TERRAIN ? this.terrainSurf(HIT.x, HIT.z) : bc.surf;
    return HIT;
  }
  _rayRamp(c, ox, oy, oz, dx, dy, dz, maxT) {
    // inclined plane through the ramp: y = y0 + (y1-y0) * t(axis)
    const a = c.axis, lo = c.min[a], hi = c.max[a], h = c.max[1] - c.min[1], L = hi - lo;
    const slope = (c.dir > 0 ? h : -h) / L; // dy/daxis
    const base = c.dir > 0 ? c.min[1] - slope * lo : c.min[1] - slope * hi;
    // plane: y - slope*p - base = 0
    const da = a === 0 ? dx : dz, oa = a === 0 ? ox : oz;
    const den = dy - slope * da; if (Math.abs(den) < 1e-8) return -1;
    const t = (slope * oa + base - oy) / den; if (t < 0 || t > maxT) return -1;
    const x = ox + dx * t, z = oz + dz * t; if (x < c.min[0] || x > c.max[0] || z < c.min[2] || z > c.max[2]) return -1;
    const l = Math.hypot(slope, 1); _rn[0] = a === 0 ? -slope / l : 0; _rn[1] = 1 / l; _rn[2] = a === 2 ? -slope / l : 0;
    if (dy * _rn[1] + dx * _rn[0] + dz * _rn[2] > 0) { _rn[0] *= -1; _rn[1] *= -1; _rn[2] *= -1; }
    return t;
  }
  // Line of sight for eyes: blocked by geometry (except see-through) and by smoke.
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz); if (L < 1e-4) return true;
    for (const s of this.smokes) if (s.r > 0.5 && segSphere(ax, ay, az, bx, by, bz, s.x, s.y, s.z, s.r)) return false;
    const h = this.ray(ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, 0);
    return !h;
  }
  addCover(x, z, nx, nz, low) { this.cover.push({ x, z, nx, nz, low, occ: null, y: 0 }); }
  bakeNav(cell = 1, inflate = 0.42) {
    const B = this.bounds, g = new NavGrid(B.minX, B.minZ, B.maxX, B.maxZ, cell); const list = [];
    for (let k = 0; k < g.w * g.h; k++) {
      const x = g.cx(k), z = g.cz(k);
      let h = this.terrain(x, z);
      this.query(x, z, 0.05, list);
      for (const c of list) {
        if (c.noNav) continue;
        if (c.kind === 'ramp') { const ry = this.rampY(c, x, z); if (ry <= h + 3.2 && ry > h) h = ry; continue; }
        if (c.max[1] <= h + 0.5 && c.max[1] > h) h = c.max[1];
      }
      g.height[k] = h;
      this.query(x, z, inflate, list); let blocked = false;
      for (const c of list) {
        if (c.kind === 'ramp' || c.noNav) continue;
        if (c.max[1] > h + 0.5 && c.min[1] < h + 1.75) { blocked = true; break; }
      }
      if (!blocked && !this.flat) { const s = Math.abs(this.terrain(x + 1, z) - this.terrain(x - 1, z)) + Math.abs(this.terrain(x, z + 1) - this.terrain(x, z - 1)); if (s > 2.2) blocked = true; }
      g.block[k] = blocked ? 1 : 0;
    }
    // walls nearby cost more so paths hug open ground but still use cover lanes
    for (let k = 0; k < g.w * g.h; k++) if (!g.block[k]) { const i = k % g.w, j = (k / g.w) | 0; let near = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < g.w && jj < g.h && g.block[jj * g.w + ii]) near++; } g.cost[k] = 1 + near * 0.15; }
    // cover heights
    for (const cp of this.cover) cp.y = this.floorAt(cp.x, cp.z, 0.3, 50, 0.5);
    this.nav = g; return g;
  }
}
function segSphere(ax, ay, az, bx, by, bz, cx, cy, cz, r) {
  const ux = bx - ax, uy = by - ay, uz = bz - az; const l2 = ux * ux + uy * uy + uz * uz;
  let t = ((cx - ax) * ux + (cy - ay) * uy + (cz - az) * uz) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = ax + ux * t - cx, y = ay + uy * t - cy, z = az + uz * t - cz; return x * x + y * y + z * z < r * r;
}
const _q = []; const _rn = [0, 1, 0];
const TERRAIN = { surf: 'dirt' };
const HIT = { t: 0, x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, col: null, surf: 'concrete' };
export function copyHit(h, out = {}) { return Object.assign(out, h); }
