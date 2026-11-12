// タイトル画面で地図を取り込み、その地図で始める（海の多い試験用の地図）
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const http = await import('http'); const fs = await import('fs'); const path = await import('path');
const root = path.resolve('dist'), file = process.argv[2];
const srv = http.createServer((req, res) => { const p = path.join(root, req.url.split('?')[0].replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); fs.createReadStream(p).pipe(res); }).listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } }); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('TUNNEL')) errs.push(m.text()); });
await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForSelector('#title .mcard');
const t0 = Date.now();
await page.setInputFiles('.tfoot input[data-t="import"]', file);
await page.waitForFunction(() => !document.querySelector('#title .tmsg')?.textContent.includes('取り込んでいます'), null, { timeout: 120000 });
console.log('import ms', Date.now() - t0, (await page.textContent('#title .tmsg')).slice(0, 300));
const id = process.argv[3] ?? 'test';
await page.click(`#title button[data-t="start"][data-id="${id}"]`);
await page.waitForFunction(() => window.__sumu && window.__sumu.view.stats.buildings > 0, null, { timeout: 240000 });
await page.waitForTimeout(2500);
for (let k = 0; k < 6; k++) { const t0 = Date.now(); const st = await page.evaluate(() => JSON.stringify(window.__sumu.view.stats)); console.log('stats', Date.now() - t0, st); await page.waitForTimeout(3000); }
await page.screenshot({ path: `shots/import-${id}-1.png`, timeout: 120000 });
await page.evaluate(() => { document.querySelector('[data-act="tutskip"]')?.click(); Object.assign(window.__sumu.view.want, { dist: 4200, pitch: 1.0, x: 2355, z: 2550 }); });
await page.waitForTimeout(3000);
await page.screenshot({ path: `shots/import-${id}-2.png` });
console.log(JSON.stringify(await page.evaluate(() => { const s = window.__sumu.game.state; return { city: s.cityName, pop: Math.round(s.stats.pop), d: [...document.querySelectorAll('#labels .dl')].map(e => e.textContent) }; })));
console.log('errors', errs);
await browser.close(); srv.close();
