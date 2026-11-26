// Scripted "competent player" city planner — pure. Used by node balance tests, the __cam.game.demoCity() hook and
// thumbnail/shot staging. Lays a 5-cell road lattice aligned to the starter spaceport and fills blocks.
import { GRID } from './terrain.js';
import { placeBuilding, canPlace, sizeOf, computeCity, costOf } from './sim.js';

export function lattice(p) {
  const sp = p.buildings.find((b) => b.kind === 'spaceport');
  const ox = sp ? (sp.x + 3) % 5 : 2, oz = sp ? (sp.z + 3) % 5 : 2;
  return { ox, oz, isRoad: (x, z) => (x % 5 === ox) || (z % 5 === oz) };
}
// Lay roads in a square window around the spaceport; stops at water.
export function layRoads(st, p, radius = 9, budget = Infinity) {
  const sp = p.buildings.find((b) => b.kind === 'spaceport'); const { isRoad } = lattice(p);
  const cx = sp ? sp.x + 1 : GRID / 2, cz = sp ? sp.z + 1 : GRID / 2;
  let spent = 0;
  const cells = [];
  for (let z = 0; z < GRID; z++) for (let x = 0; x < GRID; x++) if (isRoad(x, z) && Math.max(Math.abs(x - cx), Math.abs(z - cz)) <= radius) cells.push([x, z, Math.abs(x - cx) + Math.abs(z - cz)]);
  cells.sort((a, b) => a[2] - b[2]);
  for (const [x, z] of cells) { if (spent > budget) break; const r = placeBuilding(st, p, 'road', x, z, { instant: true }); if (r.ok) spent += r.cost; }
  return spent;
}
// Blocks = 4×4 interiors of the lattice, sorted by distance to the spaceport.
export function blocks(p) {
  const { ox, oz } = lattice(p); const sp = p.buildings.find((b) => b.kind === 'spaceport');
  const cx = sp ? sp.x + 1 : GRID / 2, cz = sp ? sp.z + 1 : GRID / 2;
  const out = [];
  for (let bz = oz + 1 - 5; bz < GRID; bz += 5) for (let bx = ox + 1 - 5; bx < GRID; bx += 5) {
    if (bx < 0 || bz < 0 || bx + 4 > GRID || bz + 4 > GRID) continue;
    out.push({ x: bx, z: bz, d: Math.hypot(bx + 2 - cx, bz + 2 - cz) });
  }
  return out.sort((a, b) => a.d - b.d);
}
export function fillBlock(st, p, blk, mix) {
  let n = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) {
    const x = blk.x + i, z = blk.z + j;
    const edge = i === 0 || j === 0 || i === 3 || j === 3; if (!edge) continue;
    const kind = mix[(n++) % mix.length];
    if (kind === 'power') { if (i <= 2 && j <= 2 && canPlace(p, 'power', x, z).ok) placeBuilding(st, p, 'power', x, z, { instant: true }); continue; }
    if (canPlace(p, kind, x, z).ok) placeBuilding(st, p, kind, x, z, { instant: true });
  }
  // interior cells: parks
  for (const [i, j] of [[1, 1], [2, 1], [1, 2], [2, 2]]) if (canPlace(p, 'park', blk.x + i, blk.z + j).ok) placeBuilding(st, p, 'park', blk.x + i, blk.z + j, { instant: true });
}
export function placeLandmarkInBlock(st, p, id, blk, opts = {}) {
  const s = sizeOf(id);
  for (const [dx, dz] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (dx + s <= 4 && dz + s <= 4 && canPlace(p, id, blk.x + dx, blk.z + dz).ok) return placeBuilding(st, p, id, blk.x + dx, blk.z + dz, opts);
  return { ok: false };
}
// Whole-city recipe: roads, utilities, homes, shops, hotels, transit, landmarks. Returns blocks used.
export function demoCity(st, p, { landmarks = [], radius = 10, instant = true } = {}) {
  layRoads(st, p, radius);
  const bl = blocks(p).filter((b) => canPlaceAny(p, b));
  const used = new Set();
  // landmarks get the 2nd..nth closest blocks with room
  let li = 0;
  for (const b of bl.slice(1)) { if (li >= landmarks.length) break; const r = placeLandmarkInBlock(st, p, landmarks[li], b, { instant }); if (r.ok) { used.add(b); li++; } }
  const mixes = [
    ['housing', 'housing', 'shop', 'housing', 'hotel', 'housing', 'shop', 'housing'],
    ['power', 'water', 'housing', 'housing', 'transit', 'housing', 'park', 'housing'],
    ['housing', 'hotel', 'housing', 'shop', 'housing', 'housing', 'hotel', 'park'],
  ];
  let k = 0;
  for (const b of bl) { if (used.has(b)) continue; fillBlock(st, p, b, mixes[k++ % mixes.length]); }
  computeCity(st, p);
  return bl.length;
}
function canPlaceAny(p, b) { let ok = 0; for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) if (p.land[(b.z + j) * GRID + b.x + i] === 0) ok++; return ok >= 10; }
export { costOf };
