// Lantern Hold — scripted players for balance tests and the in-browser autoplay hook.
//  smart: a reasonable human plan (mixed towers on the best spots, upgrades, branches, hero ability).
//  weak:  two tier-1 archers and nothing else (should lose — proves the maps need thought).
//  idle:  only calls the first wave (must lose).
import { TOWERS, ENEMIES } from './data.js';
import { build, upgrade, upgradeOptions, callWave, heroAbility, towerStats } from './sim.js';

const ORDER = ['archer', 'barracks', 'mortar', 'prism', 'archer', 'beacon', 'mortar', 'prism', 'archer', 'barracks', 'mortar', 'prism', 'beacon', 'archer', 'mortar', 'prism'];
const BRANCH = { archer: 'A', mortar: 'A', prism: 'A', beacon: 'B', barracks: 'A' };

export function makeBot(G, style = 'smart') {
  const L = G.L;
  let order = ORDER.slice();
  const stealthAt = L.roster.stealth ?? 99;
  if (stealthAt <= 5 || G.o.endless) { order.splice(order.indexOf('beacon'), 1); order.splice(2, 0, 'beacon'); }
  if (L.boss) BRANCH.prism = 'B';
  let built = 0, called = false, acc = 0;
  const pads = G.map.pads.map((p, i) => i); // already sorted best-first
  function tryBuild() {
    const free = pads.filter((i) => !G.padTower[i]);
    if (!free.length) return false;
    const type = order[built % order.length];
    // barracks want the spot closest to the road among the good ones
    let pad = free[0];
    if (type === 'barracks') pad = free.slice(0, 4).sort((a, b) => G.map.pads[a].score - G.map.pads[b].score)[0];
    if (G.gold < TOWERS[type].tiers[0].cost) return false;
    if (build(G, pad, type).ok) { built++; return true; }
    return false;
  }
  function tryUpgrade() {
    let best = null;
    for (const t of G.towers) {
      const o = upgradeOptions(t); if (!o.length) continue;
      const pick = t.tier < 2 ? o[0] : o.find((x) => x.key === BRANCH[t.type]);
      const lvl = t.tier + (t.branch ? 1 : 0);
      const sc = lvl * 1000 + pick.cost;
      if (!best || sc < best.sc) best = { t, pick, sc };
    }
    if (!best || G.gold < best.pick.cost) return false;
    return upgrade(G, best.t.id, best.t.tier < 2 ? null : best.pick.key).ok;
  }
  return {
    tick(dt) {
      acc += dt; if (acc < 0.5) return; acc = 0;
      if (style === 'idle') { if (!called) { callWave(G); called = true; } return; }
      if (style === 'weak') {
        if (built < 2) { if (tryBuild()) return; }
        if (!called) { callWave(G); called = true; }
        return;
      }
      // smart
      const want = Math.min(G.map.pads.length, 3 + Math.floor(G.wave * 0.9));
      for (let guard = 0; guard < 4; guard++) {
        const ok = G.towers.length < want ? (tryBuild() || tryUpgrade()) : (tryUpgrade() || tryBuild());
        if (!ok) break;
      }
      if (!called && G.state === 'prep') { callWave(G); called = true; }
      // hero: Dawnburst into a crowd or onto anything big
      const h = G.hero;
      if (!h.dead && h.abilityCd <= 0) {
        let n = 0, big = false;
        for (const e of G.enemies) if ((e.x - h.x) ** 2 + (e.z - h.z) ** 2 < 6) { n++; if (e.d.boss || e.d.threat >= 4) big = true; }
        if (n >= 4 || big) heroAbility(G);
      }
    },
  };
}
export { towerStats, ENEMIES };
