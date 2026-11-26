// Lantern Hold — wave generation. Deterministic per map seed; endless mode extends the same recipe.
import { ENEMIES } from './data.js';
import { mulberry } from './paths.js';

// A wave = { groups: [{ type, count, gap, delay, path }], boss, budget }.
export function makeWave(L, i, { endless = false, budgetMul = 1 } = {}) {
  const rng = mulberry(L.seed * 1000 + i * 7919 + (endless ? 31337 : 0));
  const nPaths = L.paths.length;
  let budget = L.budget[0] * Math.pow(L.budget[1], i) * budgetMul;
  if (endless && i > 14) budget *= 1 + (i - 14) * 0.05;
  const roster = endless ? { gloomling: 0, hound: 1, moth: 3, brute: 4, blob: 5, stalker: 6, warlock: 7 } : L.roster;
  const unlocked = Object.entries(roster).filter(([, w]) => w <= i).map(([t]) => t);
  const intro = Object.entries(roster).find(([, w]) => w === i && w > 0)?.[0];
  const groups = [];
  const isBoss = (!endless && L.boss && i === L.waves - 1) || (endless && i > 0 && (i + 1) % 10 === 0);
  const pathOf = (k) => (k + i) % nPaths;
  const add = (type, b, k) => {
    const d = ENEMIES[type];
    const count = Math.max(1, Math.round(b / d.threat));
    groups.push({ type, count, gap: d.gap * (0.85 + rng() * 0.3), delay: 0, path: pathOf(k) });
  };
  if (isBoss) {
    groups.push({ type: 'boss', count: 1, gap: 1, delay: 6, path: 0 });
    budget *= 0.55;
  }
  if (intro) { add(intro, budget * 0.5, 0); budget *= 0.5; }
  // main body: 2–3 groups, weighted toward the newest threats
  const nG = budget > 30 ? 3 : 2;
  const weights = unlocked.map((t) => 1 + roster[t] * 0.15 + (t === 'gloomling' ? 0.6 : 0));
  const pick = () => { let r = rng() * weights.reduce((a, b) => a + b, 0); for (let k = 0; k < unlocked.length; k++) { r -= weights[k]; if (r <= 0) return unlocked[k]; } return unlocked[0]; };
  const share = [0.5, 0.3, 0.2].slice(0, nG); const tot = share.reduce((a, b) => a + b, 0);
  for (let g = 0; g < nG; g++) add(pick(), budget * share[g] / tot, g + 1);
  // multi-road maps: big groups split across roads so every road matters
  if (nPaths > 1) {
    for (const g of [...groups]) if (g.type !== 'boss' && g.count >= 6 && rng() < 0.7) {
      const half = Math.floor(g.count / 2); g.count -= half;
      groups.push({ ...g, count: half, path: (g.path + 1) % nPaths });
    }
  }
  // stagger: groups overlap a little so waves read as one push
  let t = 0;
  for (const g of groups) { if (g.type === 'boss') continue; g.delay = t; t += g.count * g.gap * 0.8 + 2; }
  return { groups, boss: isBoss, budget: Math.round(budget) };
}
export function makeWaves(L, opts = {}) { return Array.from({ length: L.waves }, (_, i) => makeWave(L, i, opts)); }
export function waveSummary(w) {
  const m = {};
  for (const g of w.groups) m[g.type] = (m[g.type] || 0) + g.count;
  return m;
}
export function waveDuration(w) { return Math.max(...w.groups.map((g) => g.delay + g.count * g.gap)); }
