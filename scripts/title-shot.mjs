// タイトル画面の確認
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
import { open } from './shot.mjs';
void open;
const http = await import('http'); const fs = await import('fs'); const path = await import('path');
const root = path.resolve('dist');
const srv = http.createServer((req, res) => { const p = path.join(root, req.url.split('?')[0].replace(/^\/+/, '') || 'index.html'); if (!fs.existsSync(p)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); fs.createReadStream(p).pipe(res); }).listen(0);
const port = srv.address().port;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
for (const [w, h, name] of [[1440, 900, 'title-pc'], [390, 844, 'title-phone']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/index.html`); await page.waitForSelector('#title .mcard'); await page.waitForTimeout(500);
  await page.screenshot({ path: `shots/${name}.png` }); console.log(name, errs);
}
await browser.close(); srv.close();
