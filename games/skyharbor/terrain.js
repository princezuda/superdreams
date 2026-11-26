// Pure terrain generation: one heightfield per planet type, shared by the renderer (mesh) and the sim (buildable cells).
// Non-uniform grid: 2-unit spacing inside the city zone, 8-unit spacing out to the horizon mountains (one mesh, no seams).
import { makeNoise2D, fbm, smooth, lerp, clamp, mulberry32 } from './noise.js';

export const GRID = 32;            // city grid cells per side
export const CELL = 4;             // world units per cell (1 unit ≈ 2.5 m)
export const HALF = GRID * CELL / 2; // 64
export const INNER = 80, OUTER = 330, IN_STEP = 2, OUT_STEP = 10;
const NIN = INNER * 2 / IN_STEP, NOUT = (OUTER - INNER) / OUT_STEP; // 80, 25
export const SEG = NIN + NOUT * 2; // 130 segments per axis
export const axisCoord = (i) => {
  if (i < NOUT) return -OUTER + i * OUT_STEP;
  if (i <= NOUT + NIN) return -INNER + (i - NOUT) * IN_STEP;
  return INNER + (i - NOUT - NIN) * OUT_STEP;
};
const axisIndex = (x) => { // continuous inverse of axisCoord
  if (x < -INNER) return clamp((x + OUTER) / OUT_STEP, 0, NOUT);
  if (x <= INNER) return NOUT + (x + INNER) / IN_STEP;
  return clamp(NOUT + NIN + (x - INNER) / OUT_STEP, 0, SEG);
};
export const cellCenter = (c) => (c - GRID / 2 + 0.5) * CELL;
export const worldToCell = (x) => Math.floor(x / CELL + GRID / 2);

// Water features per type: what liquid, at what level, carved where.
export const LIQUID = { ocean: 'sea', desert: 'oasis', ice: 'ice', jungle: 'river', volcanic: 'lava', crystal: 'lake', moon: null };

export function genTerrain(type, seed) {
  const n = makeNoise2D(seed), n2 = makeNoise2D(seed + 7), n3 = makeNoise2D(seed + 13);
  const rng = mulberry32(seed + 99);
  const craters = [];
  if (type === 'moon') for (let i = 0; i < 46; i++) {
    const big = Math.pow(rng(), 3), R = 4 + big * 40;
    const a = rng() * 6.283, d = 20 + rng() * 260;
    craters.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, R, depth: R * 0.18, rim: R * 0.07 });
  }
  const ridged = (x, z) => { let s = 0, a = 1, f = 1; for (let i = 0; i < 4; i++) { s += a * (1 - Math.abs(n2(x * f, z * f))); a *= 0.5; f *= 2.1; } return s / 1.875; };
  const hRaw = (x, z) => {
    const ax = Math.abs(x), az = Math.abs(z);
    const edge = Math.max(ax, az) * 0.6 + Math.hypot(x, z) * 0.4;
    const zm = 1 - smooth(70, 125, edge);
    const gentle = 1.7 + fbm(n, x * 0.016, z * 0.016, 3) * 1.1;
    let mount = 5 + Math.pow(ridged(x * 0.0055, z * 0.0055), 2.2) * 78 * smooth(95, 270, edge) + fbm(n3, x * 0.02, z * 0.02, 3) * 5;
    if (type === 'desert') { mount = Math.floor(mount / 9) * 9 + smooth(0.6, 1, (mount / 9) % 1) * 9; mount += Math.sin(x * 0.09 + n(x * 0.01, z * 0.01) * 3) * 1.2; }
    if (type === 'ice') mount *= 1.25;
    if (type === 'crystal') mount = mount * 0.9 + Math.max(0, n3(x * 0.03, z * 0.03)) * 14 * smooth(90, 200, edge);
    let h = lerp(mount, gentle, zm);
    switch (type) {
      case 'ocean': { // sea to the east, shoreline wanders; a few islands offshore
        const s = x - (34 + n(z * 0.02, 3) * 9);
        h = lerp(h, -7 + fbm(n3, x * 0.01, z * 0.01, 2) * 3, smooth(-4, 10, s));
        if (s > 40) { const isl = fbm(n2, x * 0.012, z * 0.012, 3); h = Math.max(h, (isl - 0.25) * 60); }
        break;
      }
      case 'desert': { const d = Math.hypot(x + 30, z - 28); h = lerp(h, -2.5, 1 - smooth(9, 15, d + n(x * 0.05, z * 0.05) * 2)); break; }
      case 'ice': { const c = Math.abs(z + 38 - Math.sin(x * 0.045) * 7); h = lerp(h, -3, 1 - smooth(5, 11, c)); break; }
      case 'jungle': { const c = Math.abs(z - (12 * Math.sin(x * 0.033) + 5 * Math.sin(x * 0.081 + 1))); h = lerp(h, -2.5, 1 - smooth(3.2, 7, c)); break; }
      case 'volcanic': {
        const c = Math.abs(x + 26 - (10 * Math.sin(z * 0.04 + 2))); h = lerp(h, -1.5, 1 - smooth(2.5, 6, c));
        const vd = Math.hypot(x + 120, z + 210); h = Math.max(h, 95 - vd * 0.72 - Math.max(0, 22 - vd) * 2.4);
        break;
      }
      case 'crystal': { const d = Math.hypot(x - 30, z + 30), d2 = Math.hypot(x - 40, z + 20); h = lerp(h, -2.5, (1 - smooth(10, 17, d)) * smooth(6, 10, d2)); break; }
      case 'moon': {
        for (const c of craters) { const u = Math.hypot(x - c.x, z - c.z) / c.R; if (u > 2.2) continue; if (u < 1) h += c.depth * (Math.max(u, 0.3) ** 2 - 1) * (zm > 0.5 ? 0.25 : 1); h += c.rim * Math.exp(-((u - 1) ** 2) / 0.06) * (zm > 0.5 ? 0.3 : 1); }
        break;
      }
    }
    return h;
  };
  const N = SEG + 1, heights = new Float32Array(N * N), xs = new Float32Array(N);
  for (let i = 0; i < N; i++) xs[i] = axisCoord(i);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = hRaw(xs[i], xs[j]);
  const heightAt = (x, z) => {
    const fi = axisIndex(x), fj = axisIndex(z);
    const i0 = Math.min(SEG - 1, Math.floor(fi)), j0 = Math.min(SEG - 1, Math.floor(fj));
    const u = fi - i0, v = fj - j0;
    const a = heights[j0 * N + i0], b = heights[j0 * N + i0 + 1], c = heights[(j0 + 1) * N + i0], d = heights[(j0 + 1) * N + i0 + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
  const liquid = LIQUID[type];
  const waterLevel = liquid ? 0 : -999;
  // per-cell classification: 0 buildable land, 1 water, 2 too steep/rough
  const cells = new Uint8Array(GRID * GRID), cellH = new Float32Array(GRID * GRID);
  for (let cz = 0; cz < GRID; cz++) for (let cx = 0; cx < GRID; cx++) {
    const x0 = (cx - GRID / 2) * CELL, z0 = (cz - GRID / 2) * CELL;
    let mn = 1e9, mx = -1e9;
    for (let k = 0; k <= 2; k++) for (let l = 0; l <= 2; l++) { const h = heightAt(x0 + k * CELL / 2, z0 + l * CELL / 2); mn = Math.min(mn, h); mx = Math.max(mx, h); }
    cellH[cz * GRID + cx] = mx;
    cells[cz * GRID + cx] = mn < waterLevel + 0.45 ? 1 : (mx - mn > 1.8 ? 2 : 0);
  }
  return { type, seed, N, xs, heights, heightAt, waterLevel, liquid, cells, cellH };
}
