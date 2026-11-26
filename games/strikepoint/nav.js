// Grid navigation (2.5D: one walkable height per cell) with A* + string-pulling.
// Pure module (no three.js) so tests/nav.test.mjs can run it under node.

export class NavGrid {
  constructor(minX, minZ, maxX, maxZ, cell = 1) {
    this.minX = minX; this.minZ = minZ; this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell); this.h = Math.ceil((maxZ - minZ) / cell);
    this.block = new Uint8Array(this.w * this.h);     // 1 = blocked
    this.cost = new Float32Array(this.w * this.h).fill(1); // extra cost (e.g. near walls, storm)
    this.height = new Float32Array(this.w * this.h);
    const n = this.w * this.h;
    this.g = new Float32Array(n); this.f = new Float32Array(n); this.parent = new Int32Array(n);
    this.stamp = new Uint32Array(n); this.closed = new Uint32Array(n); this.run = 0;
    this.heap = new Int32Array(n); this.heapN = 0;
  }
  idx(x, z) { const i = Math.floor((x - this.minX) / this.cell), j = Math.floor((z - this.minZ) / this.cell); if (i < 0 || j < 0 || i >= this.w || j >= this.h) return -1; return j * this.w + i; }
  cx(i) { return this.minX + ((i % this.w) + 0.5) * this.cell; }
  cz(i) { return this.minZ + (Math.floor(i / this.w) + 0.5) * this.cell; }
  walkable(i) { return i >= 0 && !this.block[i]; }
  // nearest walkable cell to (x,z) within r cells
  nearest(x, z, r = 6) {
    const i0 = this.idx(x, z); if (this.walkable(i0)) return i0;
    const ci = Math.floor((x - this.minX) / this.cell), cj = Math.floor((z - this.minZ) / this.cell);
    let best = -1, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= this.w || j >= this.h) continue;
      const k = j * this.w + i; if (this.block[k]) continue;
      const d = di * di + dj * dj; if (d < bd) { bd = d; best = k; }
    }
    return best;
  }
  _push(i) { const h = this.heap, f = this.f; let n = this.heapN++; h[n] = i; while (n > 0) { const p = (n - 1) >> 1; if (f[h[p]] <= f[h[n]]) break; const t = h[p]; h[p] = h[n]; h[n] = t; n = p; } }
  _pop() {
    const h = this.heap, f = this.f; const top = h[0]; const last = h[--this.heapN]; let n = 0; const N = this.heapN;
    if (N > 0) { h[0] = last; for (;;) { const l = 2 * n + 1, r = l + 1; let m = n; if (l < N && f[h[l]] < f[h[m]]) m = l; if (r < N && f[h[r]] < f[h[m]]) m = r; if (m === n) break; const t = h[m]; h[m] = h[n]; h[n] = t; n = m; } }
    return top;
  }
  // A* from world (sx,sz) to (tx,tz). Returns array of [x,z] waypoints (smoothed) or null.
  find(sx, sz, tx, tz, maxExpand = 9000) {
    const s = this.nearest(sx, sz), t = this.nearest(tx, tz);
    if (s < 0 || t < 0) return null;
    if (s === t) return [[tx, tz]];
    const run = ++this.run, W = this.w, H = this.h, tI = t % W, tJ = Math.floor(t / W);
    const hfn = (k) => { const di = Math.abs((k % W) - tI), dj = Math.abs(Math.floor(k / W) - tJ); return (di + dj + (1.4142 - 2) * Math.min(di, dj)); };
    this.heapN = 0; this.g[s] = 0; this.f[s] = hfn(s); this.stamp[s] = run; this.parent[s] = -1; this._push(s);
    let found = false, n = 0;
    while (this.heapN > 0 && n++ < maxExpand) {
      const c = this._pop(); if (this.closed[c] === run) continue; this.closed[c] = run;
      if (c === t) { found = true; break; }
      const ci = c % W, cj = (c - ci) / W;
      for (let d = 0; d < 8; d++) {
        const di = DIRS[d * 2], dj = DIRS[d * 2 + 1], ni = ci + di, nj = cj + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const k = nj * W + ni; if (this.block[k] || this.closed[k] === run) continue;
        if (Math.abs(this.height[k] - this.height[c]) > 0.6) continue; // ledge
        const diag = di !== 0 && dj !== 0;
        if (diag && (this.block[cj * W + ni] || this.block[nj * W + ci])) continue; // no corner cutting
        const g = this.g[c] + (diag ? 1.4142 : 1) * this.cost[k];
        if (this.stamp[k] !== run || g < this.g[k]) { this.stamp[k] = run; this.g[k] = g; this.f[k] = g + hfn(k); this.parent[k] = c; this._push(k); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = t; k >= 0; k = this.parent[k]) cells.push(k); cells.reverse();
    // string-pull: keep a waypoint only when the straight line to the next candidate is blocked
    const out = []; let a = 0;
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.lineClear(cells[a], cells[b])) b--;
      out.push([this.cx(cells[b]), this.cz(cells[b])]); a = b;
    }
    if (out.length) out[out.length - 1] = [tx, tz];
    return out;
  }
  // Supercover line walk between cells (used for smoothing + cheap AI "can I walk straight there").
  lineClear(a, b) {
    const W = this.w; let x0 = a % W, y0 = Math.floor(a / W); const x1 = b % W, y1 = Math.floor(b / W);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, h0 = this.height[a];
    for (let guard = 0; guard < 4000; guard++) {
      const k = y0 * W + x0; if (this.block[k] || Math.abs(this.height[k] - h0) > 0.6) return false; h0 = this.height[k];
      if (x0 === x1 && y0 === y1) return true;
      const e2 = 2 * err;
      if (e2 > -dy && e2 < dx) { // diagonal step: both side cells must be open
        if (this.block[y0 * W + x0 + sx] || this.block[(y0 + sy) * W + x0]) return false;
      }
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return false;
  }
  clearBetween(ax, az, bx, bz) { const a = this.idx(ax, az), b = this.idx(bx, bz); return a >= 0 && b >= 0 && this.lineClear(a, b); }
}
const DIRS = [1, 0, -1, 0, 0, 1, 0, -1, 1, 1, -1, 1, 1, -1, -1, -1];
