// node games/pebble-peaks/tests/playthrough.mjs [http://127.0.0.1:8109] — needs the dev server (php -S … router.php).
// Bot-hops every authored route segment through the REAL game loop (live enemies/crumbles/hazards),
// then collects, finishes each level, fights the boss via hooks, checks saves, hub portals and zero page errors.
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: 480, height: 270 } }); const errs = [];
p.on('pageerror', (e) => errs.push('PAGEERR ' + e.message + ' ' + (e.stack || '').split('\n').slice(1, 4).join(' | '))); p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('GPU stall')) errs.push(m.text().slice(0, 200)); });
await p.goto((process.argv[2] || 'http://127.0.0.1:8109') + '/games/pebble-peaks/index.html?webgl', { timeout: 60000 });
await p.waitForFunction(() => window.__cam?.dataReady && window.__cam.frames >= 1, null, { timeout: 300000 });
const out = await p.evaluate(async () => {
  const g = window.__cam.game; const R = {};
  for (const id of ['meadow', 'caves', 'sky', 'forge']) {
    g.start(id); const route = g.route(); const hops = []; let ok = 0, n = 0;
    for (let i = 0; i + 1 < route.length; i++) {
      const A = route[i], B = route[i + 1];
      if (['bounce', 'stairs', 'ride'].includes(A.how) || ['bounce', 'stairs', 'ride'].includes(B.how)) continue;
      n++; const r = g.botHop(A.p, B.p, B.how); if (r.ok) ok++; else hops.push(`${i}->${i + 1} ${B.how}: ${r.why} ${r.at || ''}`);
    }
    const before = g.state(); const all = g.collectAll();
    let fin = null;
    if (id === 'forge') { g.teleport(20, 8.1, -89); g.sim(3); const b0 = g.state().boss; for (let k = 0; k < 3; k++) { g.bossStomp(); g.sim(1.6); } g.sim(2.5); const b1 = g.state().boss; fin = { b0, b1 }; }
    const f = g.finish(); g.sim(0.3);
    R[id] = { hops: `${ok}/${n}`, fails: hops, shards: `${all.shards}/${all.total}`, relics: all.relics.join(''), screen: f.screen, done: g.state().save.levels[id].done, best: g.state().save.levels[id].best, fin, hurtBefore: before.hp };
  }
  // hub portal: walk into the meadow portal
  g.start('hub'); g.teleport(-9, 0.5, -8.4); g.sim(0.3); await new Promise((r) => setTimeout(r, 1200));
  R.hub = { level: g.state().level };
  return R;
});
console.log(JSON.stringify(out, null, 1)); console.log('errors:', errs.length, errs.slice(0, 6));
await b.close();
