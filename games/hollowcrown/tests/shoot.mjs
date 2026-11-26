// node games/hollowcrown/tests/shoot.mjs <outdir> <spec.json|inline-json>
// spec: { url, w, h, steps:[{eval:"js", wait:frames, shot:"name.png"}] }
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import fs from 'node:fs';
const [outDir, specArg] = process.argv.slice(2);
const spec = JSON.parse(fs.existsSync(specArg) ? fs.readFileSync(specArg, 'utf8') : specArg);
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: spec.w || 1280, height: spec.h || 720 }, deviceScaleFactor: 1 });
const errs = [];
p.on('pageerror', (e) => errs.push('PAGE: ' + e.message));
p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
const t0 = Date.now();
await p.goto(spec.url);
try { await p.waitForFunction(() => window.__bootError || (window.__cam && window.__cam.dataReady && window.__cam.frames > 2), null, { timeout: 240000 }); } catch (e) { errs.push('TIMEOUT boot'); }
const be = await p.evaluate(() => window.__bootError); if (be) { console.log('BOOT ERROR', be); }
console.log('boot ms', Date.now() - t0);
const waitFrames = async (n) => { const f0 = await p.evaluate(() => window.__cam?.frames || 0); try { await p.waitForFunction((t) => window.__bootError || window.__cam.frames >= t, f0 + n, { timeout: 240000 }); } catch { errs.push('TIMEOUT frames'); } };
for (const st of spec.steps || []) {
  if (st.eval) { try { const r = await p.evaluate(st.eval); if (r !== undefined) console.log('eval ->', JSON.stringify(r).slice(0, 1500)); } catch (e) { errs.push('EVAL: ' + e.message.slice(0, 300)); } }
  if (st.click) await p.mouse.click(st.click[0], st.click[1], { button: st.button || 'left' });
  if (st.move) await p.mouse.move(st.move[0], st.move[1]);
  if (st.key) await p.keyboard.press(st.key);
  if (st.wait) await waitFrames(st.wait);
  if (st.ms) await p.waitForTimeout(st.ms);
  if (st.shot) { await p.screenshot({ path: outDir + '/' + st.shot, timeout: 240000 }); console.log('shot', st.shot, (Date.now() - t0) + 'ms'); }
}
const cam = await p.evaluate(() => ({ ft: window.__cam?.ft, frames: window.__cam?.frames, drawCalls: window.__cam?.drawCalls, tris: window.__cam?.triangles, counts: window.__cam?.counts, errors: window.__cam?.errors, backend: window.__cam?.backend }));
console.log(JSON.stringify(cam));
console.log('errors:', JSON.stringify(errs.slice(0, 20), null, 1));
await b.close();
