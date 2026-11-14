// v90：配布の確認。分割版で選んだ地図だけが要求されるか、単体版で埋め込み地図の解析が選ぶまで走らないか、
// 読み込み中・失敗・オフラインの表示（画面を docs/shots/v90-dist/ に撮る）。使い方：node scripts/v90-dist.mjs
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path';
const root = path.resolve('dist'), OUT = 'docs/shots/v90-dist'; fs.mkdirSync(OUT, { recursive: true });
let delayMs = 0;
const srv = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  const send = () => { const sz = fs.statSync(p).size; res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8', 'Content-Length': sz }); fs.createReadStream(p).pipe(res); };
  if (p.endsWith('.json') && delayMs) setTimeout(send, delayMs); else send();
}); await new Promise(r => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const out = {};
async function newPage(ctxOpts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...ctxOpts }); const page = await ctx.newPage(); page.setDefaultTimeout(60000);
  const reqs = []; page.on('request', r => { const m = r.url().match(/maps\/(?!manifest)([\w-]+)\.json/); if (m) reqs.push(m[1]); });
  return { ctx, page, reqs };
}
const built = () => window.__sumu && window.__sumu.view.stats.buildings > 0;
// (a) 分割版・通常：開始時とタイトル表示時に maps/*.json が要求されないこと → 選んだ地図だけが要求されること
{ const { ctx, page, reqs } = await newPage(); await page.goto(base); await page.waitForSelector('#title .mcard'); await page.waitForTimeout(1500);
  out.split_title_reqs = [...reqs]; await page.screenshot({ path: `${OUT}/a-title.png` });
  await page.click('#title [data-t="start"][data-id="hodogaya-d"]'); await page.waitForFunction(built, null, { timeout: 240000 });
  out.split_after_pick_reqs = [...reqs]; await ctx.close(); }
// (b) 地図の要求を 4 秒遅延：読み込み中の表示・二重押しの防止
{ delayMs = 4000; const { ctx, page } = await newPage(); await page.goto(base); await page.waitForSelector('#title .mcard');
  await page.click('#title [data-t="start"][data-id="hodogaya"]'); await page.waitForTimeout(800);
  out.loading_msg = await page.textContent('#title .tmsg'); out.loading_buttons_disabled = await page.evaluate(() => [...document.querySelectorAll('#title button[data-t="start"]')].every(b => b.disabled));
  await page.screenshot({ path: `${OUT}/b-loading.png` }); delayMs = 0; await ctx.close(); }
// (c) 地図の要求を失敗（500）→ 再試行で成功
{ const { ctx, page } = await newPage(); let fail = true; await page.route('**/maps/hodogaya.json', r => fail ? r.fulfill({ status: 500, body: 'x' }) : r.continue());
  await page.goto(base); await page.waitForSelector('#title .mcard'); await page.click('#title [data-t="start"][data-id="hodogaya"]'); await page.waitForSelector('#title [data-t="retry"]');
  out.fail_msg = await page.textContent('#title .tmsg'); await page.screenshot({ path: `${OUT}/c-fail.png` });
  fail = false; await page.click('#title [data-t="retry"]'); await page.waitForFunction(built, null, { timeout: 240000 }); out.retry_ok = true; await ctx.close(); }
// (d) オフライン：タイトル表示後にネットワークを切って地図を選ぶ
{ const { ctx, page } = await newPage(); await page.goto(base); await page.waitForSelector('#title .mcard'); await ctx.setOffline(true);
  await page.click('#title [data-t="start"][data-id="hodogaya"]'); await page.waitForSelector('#title [data-t="retry"]');
  out.offline_msg = await page.textContent('#title .tmsg'); await page.screenshot({ path: `${OUT}/d-offline.png` }); await ctx.close(); }
// (e) file:// で分割版を開く
{ const { ctx, page } = await newPage(); await page.goto('file://' + root + '/index.html'); await page.waitForSelector('#title .mcard'); await page.click('#title [data-t="start"][data-id="hodogaya"]'); await page.waitForSelector('#title [data-t="retry"]');
  out.file_msg = await page.textContent('#title .tmsg'); await page.screenshot({ path: `${OUT}/e-file.png` }); await ctx.close(); }
// (f) 単体版：起動時に大きな JSON.parse が走らない／選んだ地図だけ解析する
{ const { ctx, page } = await newPage(); await page.addInitScript(() => { window.__parses = []; const o = JSON.parse; JSON.parse = function (t, ...a) { if (typeof t === 'string' && t.length > 200000) window.__parses.push(t.length); return o.call(this, t, ...a); }; });
  await page.goto('file://' + root + '/sumucity-standalone.html'); await page.waitForSelector('#title .mcard'); await page.waitForTimeout(1500);
  out.standalone_big_parses_at_title = await page.evaluate(() => window.__parses.length);
  await page.click('#title [data-t="start"][data-id="hodogaya"]'); await page.waitForFunction(built, null, { timeout: 240000 });
  out.standalone_big_parses_after_pick = await page.evaluate(() => window.__parses); await ctx.close(); }
console.log(JSON.stringify(out, null, 1)); await browser.close(); srv.close();
