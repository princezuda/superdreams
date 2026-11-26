// Catalog QA: for every games/*/meta.json (not hidden), load ?webgl, click start, wait for frames,
// capture errors / draw calls / triangles and a screenshot. Usage:
//   node tools/qa-all.mjs http://127.0.0.1:8099 <outDir> [gameId ...]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import path from 'node:path';
const [base = 'http://127.0.0.1:8099', out = '/tmp/qa', ...only] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
const ids = fs.readdirSync('games').filter((d) => fs.existsSync(`games/${d}/meta.json`))
  .filter((d) => !JSON.parse(fs.readFileSync(`games/${d}/meta.json`, 'utf8')).hidden).filter((d) => !only.length || only.includes(d));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const rows = [];
for (const id of ids) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', (e) => errs.push(e.message)); page.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
  let crashed = false; page.on('crash', () => { crashed = true; });
  const t0 = Date.now(); let r = { id };
  try {
    await page.goto(`${base}/games/${id}/?webgl`, { timeout: 60000 });
    await page.waitForFunction(() => window.__cam && window.__cam.dataReady && window.__cam.frames >= 2, null, { timeout: 300000 });
    r.readyMs = Date.now() - t0;
    await page.evaluate(() => (document.querySelector('#sd-start')||document.querySelector('[data-start],#start,.start-btn,button.primary'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    const f0 = await page.evaluate(() => window.__cam.frames);
    await page.waitForFunction((f) => window.__cam.frames >= f + 2, f0, { timeout: 300000 });
    Object.assign(r, await page.evaluate(() => ({ backend: __cam.backend, drawCalls: __cam.drawCalls, triangles: __cam.triangles, counts: __cam.counts, camErrors: (__cam.errors || []).slice(0, 3) })));
    await page.screenshot({ path: path.join(out, `${id}.png`) });
  } catch (e) { r.fail = (crashed ? 'TAB CRASH: ' : '') + e.message.split('\n')[0]; }
  r.errors = errs.slice(0, 5); rows.push(r); await page.close();
  console.log(JSON.stringify(r));
}
await browser.close();
const bad = rows.filter((r) => r.fail || r.errors.length || (r.drawCalls ?? 0) > 300);
console.log(`\n${rows.length} games, ${bad.length} with problems: ${bad.map((b) => b.id).join(', ') || 'none'}`);
