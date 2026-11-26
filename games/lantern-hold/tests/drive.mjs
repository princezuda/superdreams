// Playwright driver for scripted verification: node games/lantern-hold/tests/drive.mjs <url> <steps.json|inline-json> [w] [h]
// steps: [{eval:"js"}, {wait:frames}, {shot:"out.png"}, {click:"#sel"}, {tap:[x,y]}, {drag:[x0,y0,x1,y1]}, {key:"KeyQ"}, {log:"js"}]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [url, stepsArg, w = '1280', h = '720'] = process.argv.slice(2);
const steps = JSON.parse(fs.existsSync(stepsArg) ? fs.readFileSync(stepsArg, 'utf8') : stepsArg);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-swiftshader'] });
const p = await b.newPage({ viewport: { width: +w, height: +h }, hasTouch: false });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
await p.goto(url);
await p.waitForFunction(() => window.__cam && window.__cam.dataReady && window.__cam.frames >= 2, null, { timeout: 180000 });
const frames = () => p.evaluate(() => window.__cam.frames);
for (const s of steps) {
  if (s.eval) { const r = await p.evaluate(s.eval); if (r !== undefined) console.log('eval →', JSON.stringify(r)?.slice(0, 400)); }
  if (s.wait) { const f0 = await frames(), t0 = Date.now(); await p.waitForFunction((n) => window.__cam.frames >= n, f0 + s.wait, { timeout: 600000, polling: 200 }); console.log('wait', s.wait, ((Date.now() - t0) / s.wait | 0) + 'ms/frame'); }
  if (s.sleep) await p.waitForTimeout(s.sleep);
  if (s.click) await p.evaluate((sel) => document.querySelector(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true })), s.click);
  if (s.tap) await p.mouse.click(s.tap[0], s.tap[1]);
  if (s.drag) { const [x0, y0, x1, y1] = s.drag; await p.mouse.move(x0, y0); await p.mouse.down(); await p.mouse.move(x1, y1, { steps: 6 }); await p.mouse.up(); }
  if (s.key) await p.keyboard.press(s.key);
  if (s.log) console.log('log →', JSON.stringify(await p.evaluate(s.log))?.slice(0, 1500));
  if (s.shot) { const t0 = Date.now(); await p.screenshot({ timeout: 300000, path: s.shot, type: s.shot.endsWith('.jpg') ? 'jpeg' : 'png', quality: s.shot.endsWith('.jpg') ? 90 : undefined }); console.log('shot', s.shot, (Date.now() - t0) + 'ms'); }
}
const cam = await p.evaluate(() => ({ frames: __cam.frames, drawCalls: __cam.drawCalls, triangles: __cam.triangles, backend: __cam.backend, counts: __cam.counts, errors: __cam.errors }));
console.log(JSON.stringify(cam));
console.log('errors:', errs.filter((e) => !/GPU stall|Automatic fallback|WebGPU/.test(e)).slice(0, 12));
await b.close();
