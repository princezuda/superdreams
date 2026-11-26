// Render a game's score offline and report levels. Usage: node tools/music-check.mjs http://127.0.0.1:8099 [/games/<id>/music.js]
// Flags: silent (rms < 0.01), too hot (peak > 0.98 or rms > 0.3).
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [base = 'http://127.0.0.1:8099', score = ''] = process.argv.slice(2);
const b = await chromium.launch({ args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] }), p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(`${base}/shared/music-smoke.html${score ? '?score=' + encodeURIComponent(score) : ''}`);
await p.waitForFunction(() => window.__music, null, { timeout: 240000 });
const r = await p.evaluate(() => window.__music); await b.close();
let bad = 0; const row = (kind, k, s) => { const flag = s.rms < 0.01 ? 'SILENT' : s.peak > 0.98 || s.rms > 0.3 ? 'HOT' : ''; if (flag) bad++; console.log(`${kind.padEnd(6)} ${k.padEnd(22)} rms ${String(s.rms).padEnd(7)} peak ${String(s.peak).padEnd(6)} ${flag}`); };
if (!score) for (const [k, s] of Object.entries(r.inst)) row('inst', k, s);
for (const [k, s] of Object.entries(r.tracks)) row('track', k, s); for (const [k, s] of Object.entries(r.stings)) row('sting', k, s);
console.log('errors:', [...r.errors, ...errs]); process.exit(bad || r.errors.length || errs.length ? 1 : 0);
