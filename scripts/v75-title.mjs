// v75：タイトル画面（実在の街が先頭）を撮る。PC とスマホ幅
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/'); const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('dist'), srv = http.createServer((q, r) => { const p = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); r.end(); return; } r.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); fs.createReadStream(p).pipe(r); }); srv.listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
for (const [n, w, h] of [['pc', 1280, 900], ['sp', 390, 844]]) { const page = await browser.newPage({ viewport: { width: w, height: h } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/index.html`); await page.waitForSelector('#title [data-t="start"][data-id="sumino"]', { timeout: 60000 }); await page.waitForTimeout(600);
  await page.screenshot({ path: `shots/v75-title-${n}.png` }); console.log(n, await page.evaluate(() => [...document.querySelectorAll('#title h2, #title summary')].map(e => e.textContent.slice(0, 30))), errs); await page.close(); }
await browser.close(); srv.close();
