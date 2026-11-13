// ブラウザ検証用：dist/index.html を開いてスクリーンショットを撮る
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
import path from 'path';
import http from 'http';
import fs from 'fs';
let server = null;
/** dist を http で配る（地図データを fetch で読むため。file:// では読めない） */
function serve() {
  if (server) return server.port;
  const root = path.resolve(process.env.DIST ?? 'dist');
  const srv = http.createServer((req, res) => {
    const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
    if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8' }); fs.createReadStream(p).pipe(res);
  });
  srv.listen(0); srv.unref(); server = { port: srv.address().port };
  return server.port;
}
/** ページを開き、タイトル画面で地図を選んで始める（MAPID 環境変数、既定は住野市） */
export async function open(w = 1440, h = 900, mapId = process.env.MAPID ?? 'sumino', before = null) {
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
  const page = await browser.newPage(process.env.MOBILE ? { viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: w, height: h } });
  page.setDefaultTimeout(Number(process.env.TMO ?? 30000)); const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message + (process.env.STACK ? ' ' + (e.stack || '').split('\n').slice(0, 4).join(' | ') : '')));
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  if (process.env.TERRAIN) await page.addInitScript(() => { try { localStorage.setItem('sumu-career', JSON.stringify({ lv: 99, cities: [], moves: 0 })); } catch {} });
  await page.goto(`http://127.0.0.1:${serve()}/${process.env.PAGE ?? "index.html"}`);
  if (before) { await page.evaluate(before); await page.reload(); }
  if (process.env.TITLESHOT) { await page.waitForSelector('#title [data-t="start"]'); await page.click(`#title [data-t="start"][data-id="${mapId}"]`); await page.waitForTimeout(500); await page.screenshot({ path: process.env.TITLESHOT }); }
  await page.waitForSelector(`#title [data-t="start"][data-id="${mapId}"]`, { timeout: 60000 });
  if (!process.env.TITLESHOT) await page.click(`#title [data-t="start"][data-id="${mapId}"]`);
  const tr = process.env.TERRAIN ?? 'coast';
  if (await page.$(`#title [data-t="terrain"][data-tr="${tr}"]`)) await page.click(`#title [data-t="terrain"][data-tr="${tr}"]`);
  await page.waitForFunction(tr => window.__sumu && (window.__sumu.view.stats.buildings > 0 || tr === 'castaway'), tr, { timeout: 240000 }); // v88：無人島ははじめ建物がない
  return { browser, page, errors };
}
if (process.argv[1].endsWith('/shot.mjs')) {
  const { browser, page, errors } = await open();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'shots/01-start.png' });
  console.log(JSON.stringify(await page.evaluate(() => window.__sumu.view.stats)));
  console.log('errors', errors);
  await browser.close();
}
