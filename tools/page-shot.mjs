// Screenshot plain site pages: node tools/page-shot.mjs <url> <out.png> [width] [height] [fullPage]
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [url, out, w = '1280', h = '800', full = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const p = await b.newPage({ viewport: { width: +w, height: +h } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && errs.push(m.text()));
await p.goto(url, { waitUntil: 'networkidle' }).catch((e) => errs.push(e.message));
await p.screenshot({ path: out, fullPage: !!full });
const overflow = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
console.log('errors:', errs.slice(0, 5), 'hOverflow:', overflow); await b.close();
