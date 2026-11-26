import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [url, out, minFrames='3'] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--use-angle=swiftshader','--no-sandbox','--disable-dev-shm-usage','--enable-unsafe-webgpu'] });
const p = await b.newPage({ viewport: { width: 640, height: 360 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto(url);
try { await p.waitForFunction(n => window.__cam && window.__cam.frames >= n, +minFrames, { timeout: 60000 }); } catch (e) { errs.push('TIMEOUT ' + e.message.split('\n')[0]); }
console.log(JSON.stringify(await p.evaluate(() => { const c = window.__cam || {}; return { frames: c.frames, dataReady: c.dataReady, backend: c.backend, drawCalls: c.drawCalls, triangles: c.triangles, counts: c.counts, errors: c.errors }; })));
await p.screenshot({ path: out, timeout: 180000 }); console.log('errors:', errs.slice(0,8)); await b.close();
