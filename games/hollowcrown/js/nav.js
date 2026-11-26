// Walk-area navigation: a polygon (XZ ground plane) with holes, visibility-graph A*. Pure — unit tested in node.
export function pointInPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > p[1]) !== (zj > p[1]) && p[0] < ((xj - xi) * (p[1] - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segInter(p1, p2, q1, q2) {
  const r = sub(p2, p1), s = sub(q2, q1), d = cross(r, s);
  if (Math.abs(d) < 1e-9) return false;
  const t = cross(sub(q1, p1), s) / d, u = cross(sub(q1, p1), r) / d;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6;
}
function closestOnSeg(p, a, b) {
  const ab = sub(b, a), t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / (ab[0] * ab[0] + ab[1] * ab[1] || 1)));
  return [a[0] + ab[0] * t, a[1] + ab[1] * t];
}

export class NavArea {
  constructor(outer, holes = []) {
    this.outer = outer; this.holes = holes; this.polys = [outer, ...holes];
    this.nodes = [];
    // inset every vertex slightly into the walkable region so edges never block their own corners
    for (const poly of this.polys) for (let i = 0; i < poly.length; i++) {
      const a = poly[(i - 1 + poly.length) % poly.length], v = poly[i], b = poly[(i + 1) % poly.length];
      const e1 = norm(sub(v, a)), e2 = norm(sub(b, v));
      let bis = norm([-(e1[1] + e2[1]), e1[0] + e2[0]]);
      if (!isFinite(bis[0]) || (bis[0] === 0 && bis[1] === 0)) bis = [-e1[1], e1[0]];
      for (const k of [1, -1]) {
        const c = [v[0] + bis[0] * 0.12 * k, v[1] + bis[1] * 0.12 * k];
        if (this.inside(c)) { this.nodes.push(c); break; }
      }
    }
  }
  inside(p) { if (!pointInPoly(p, this.outer)) return false; for (const h of this.holes) if (pointInPoly(p, h)) return false; return true; }
  clamp(p) {
    if (this.inside(p)) return p;
    let best = null, bd = Infinity;
    for (const poly of this.polys) for (let i = 0; i < poly.length; i++) {
      const c = closestOnSeg(p, poly[i], poly[(i + 1) % poly.length]); const d = dist(c, p);
      if (d < bd) { bd = d; best = c; }
    }
    // nudge toward the interior
    for (const r of [0.06, 0.15, 0.3, 0.6]) for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, c = [best[0] + Math.cos(a) * r, best[1] + Math.sin(a) * r];
      if (this.inside(c)) return c;
    }
    return this.nodes[0] || p;
  }
  los(a, b) {
    for (const poly of this.polys) for (let i = 0; i < poly.length; i++) if (segInter(a, b, poly[i], poly[(i + 1) % poly.length])) return false;
    const steps = Math.ceil(dist(a, b) / 0.4);
    for (let i = 1; i < steps; i++) { const t = i / steps; if (!this.inside([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t])) return false; }
    return true;
  }
  path(a, b) {
    a = this.clamp(a); b = this.clamp(b);
    if (this.los(a, b)) return [b];
    const N = [a, b, ...this.nodes], n = N.length;
    const g = new Array(n).fill(Infinity), f = new Array(n).fill(Infinity), from = new Array(n).fill(-1), open = new Set([0]), closed = new Set();
    g[0] = 0; f[0] = dist(a, b);
    const losCache = new Map();
    const vis = (i, j) => { const k = i < j ? i * 1000 + j : j * 1000 + i; if (!losCache.has(k)) losCache.set(k, this.los(N[i], N[j])); return losCache.get(k); };
    while (open.size) {
      let cur = -1, cf = Infinity; for (const i of open) if (f[i] < cf) { cf = f[i]; cur = i; }
      if (cur === 1) break;
      open.delete(cur); closed.add(cur);
      for (let j = 0; j < n; j++) {
        if (j === cur || closed.has(j) || !vis(cur, j)) continue;
        const ng = g[cur] + dist(N[cur], N[j]);
        if (ng < g[j]) { g[j] = ng; f[j] = ng + dist(N[j], b); from[j] = cur; open.add(j); }
      }
    }
    if (from[1] === -1) return [b]; // disconnected: walk straight (never strand the player)
    const out = []; for (let c = 1; c !== 0; c = from[c]) out.unshift(N[c]);
    return out;
  }
}
function norm(v) { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; }
