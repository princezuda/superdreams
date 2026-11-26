// Load a game with ?webgl, click its start button, wait 6 frames, screenshot. Usage: node tools/start-shot.mjs <url> <out.png> [w] [h]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [url, out, w = 1280, h = 720] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } }); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(url, { timeout: 60000 });
await p.waitForFunction(() => window.__cam?.dataReady && window.__cam.frames >= 2, null, { timeout: 300000 });
await p.evaluate(() => (document.querySelector('#sd-start') || document.querySelector('[data-start],#start,.start-btn'))?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
const f0 = await p.evaluate(() => window.__cam.frames);
await p.waitForFunction((f) => window.__cam.frames >= f + 6, f0, { timeout: 300000 });
await p.screenshot({ path: out, timeout: 180000 }); console.log('errors:', errs); await b.close();
