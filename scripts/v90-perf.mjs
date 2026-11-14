// v90：起動と読み込みの性能の計測（Chromium・ソフトウェア描画 SwiftShader・この環境の CPU）。
// 実機の GPU・低性能 PC・実機スマートフォンの代わりにはならない。CPU 4 倍・6 倍の絞りと回線の絞りは「目安」。
// 使い方：node scripts/v90-perf.mjs            （dist を使う。先に npm run build）
//   RUNS=3（各条件の回数）  ONLY=split-sumino,standalone（条件名で絞る）  OUT=docs/v90-perf-raw.json
// 計測は 3 回の中央値。配信は gzip 付きの http（実際のホスティングに近づけるため。brotli ならさらに小さい）。
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
import http from 'http'; import fs from 'fs'; import path from 'path'; import zlib from 'zlib';
const root = path.resolve('dist'), RUNS = Number(process.env.RUNS ?? 3), ONLY = process.env.ONLY?.split(','), OUT = process.env.OUT ?? 'docs/v90-perf-raw.json';
const gz = new Map();
const srv = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!p.startsWith(root) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  if (!gz.has(p)) gz.set(p, zlib.gzipSync(fs.readFileSync(p), { level: 6 }));
  const b = gz.get(p);
  res.writeHead(200, { 'Content-Type': p.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8', 'Content-Encoding': 'gzip', 'Content-Length': b.length }); res.end(b);
}); await new Promise(r => srv.listen(0, r)); const base = `http://127.0.0.1:${srv.address().port}/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const median = a => { const s = a.filter(x => x != null && !Number.isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2) + (s.length % 2 ? 0 : 0)] : null; };
const sec = ms => ms == null ? null : Math.round(ms) / 1000;
const built = () => window.__sumu && window.__sumu.view.stats.buildings > 0;

/** 1 回の計測：ページを開く → タイトル → 地図を選ぶ → 街 → （任意）別の地図へ切り替え → ヒープ・品質別の負荷 */
async function once(c) {
  const ctx = await browser.newContext(c.mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(); page.setDefaultTimeout(600000); const errors = [];
  page.on('pageerror', e => errors.push(e.message)); const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (c.cpu) await cdp.send('Emulation.setCPUThrottlingRate', { rate: c.cpu });
  if (c.net) await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 }); // Fast 3G 相当
  const heap = async () => { const m = await cdp.send('Performance.getMetrics'); return (m.metrics.find(x => x.name === 'JSHeapUsedSize')?.value ?? 0) / 1e6; };
  const r = {};
  const url = c.file ? 'file://' + path.join(root, c.page) : base + c.page;
  const t0 = Date.now(); await page.goto(url, { waitUntil: 'commit' });
  await page.waitForFunction(() => document.querySelector('#title .mcard'), null, { polling: 25 }); r.titleMs = Date.now() - t0;
  r.nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { respEnd: n.responseEnd, dcl: n.domContentLoadedEventEnd, load: n.loadEventEnd, bytes: n.encodedBodySize }; });
  r.heapTitle = await heap();
  const pick = async (id) => {
    const t = Date.now();
    await page.click(`#title [data-t="start"][data-id="${id}"]`);
    if (await page.$(`#title [data-t="terrain"][data-tr="coast"]`)) await page.click(`#title [data-t="terrain"][data-tr="coast"]`);
    await page.waitForFunction(built, null, { polling: 50 }); return Date.now() - t;
  };
  r.pickMs = await pick(c.map); await page.waitForTimeout(2500); r.heapCity = await heap();
  if (c.second) { // マップ切替：街 → タイトル → 別の地図
    await page.evaluate(() => document.querySelector('[data-act="tutskip"]')?.click());
    const t = Date.now(); await page.click('#top .plate'); await page.waitForTimeout(300); await page.click('[data-act="titlesave"]');
    await page.waitForFunction(() => document.querySelector('#title .mcard'), null, { polling: 25 }); r.backMs = Date.now() - t;
    r.switchMs = await pick(c.second); await page.waitForTimeout(2500); r.heapSwitch = await heap();
  }
  if (c.quality) { // 品質別の三角形・draw call（ソフトウェア描画なので fps は参考にならない）
    await page.evaluate(() => { window.__sumu.fixedQuality = true; }); r.q = {};
    for (const q of ['low', 'mid', 'high']) {
      await page.evaluate(q => { window.__sumu.view.setQuality(q); window.__sumu.view.stats.tris = -1; }, q); // stats は 1 秒ぶんの描画のたびに更新される。-1 が書き換わるまで待つ
      await page.waitForFunction(() => window.__sumu.view.stats.tris !== -1, null, { polling: 200, timeout: 180000 });
      r.q[q] = await page.evaluate(() => { const s = window.__sumu.view.stats; return { tris: s.tris, calls: s.calls, fps: s.fps, cars: s.cars, peds: s.peds }; });
    }
  }
  if (c.auto) { // 自動で品質を下げる仕組み（fps 24 未満を 5 秒ごとに見る）が働くか
    const seq = [await page.evaluate(() => window.__sumu.view.quality)]; const t = Date.now(); r.auto = { start: seq[0], steps: [] };
    while (Date.now() - t < 45000) { await page.waitForTimeout(2000); const q = await page.evaluate(() => window.__sumu.view.quality); if (q !== seq[seq.length - 1]) { seq.push(q); r.auto.steps.push({ at: sec(Date.now() - t), q }); } }
    r.auto.end = seq[seq.length - 1]; r.auto.fps = await page.evaluate(() => window.__sumu.view.stats.fps);
  }
  r.errors = errors.length; await ctx.close(); return r;
}
const CONDS = [
  { name: 'split-sumino', page: 'index.html', map: 'sumino', quality: true },
  { name: 'split-hodogaya-d', page: 'index.html', map: 'hodogaya-d', second: 'shibuya-d', quality: true },
  { name: 'split-hodogaya', page: 'index.html', map: 'hodogaya', quality: true },
  { name: 'standalone-hodogaya-d', page: 'sumucity-standalone.html', map: 'hodogaya-d', second: 'shibuya-d' },
  { name: 'standalone-file-hodogaya-d', page: 'sumucity-standalone.html', file: true, map: 'hodogaya-d' },
  { name: 'artifact-hodogaya-d', page: 'sumucity-artifact.html', map: 'hodogaya-d' },
  { name: 'cpu4-hodogaya-d', page: 'index.html', map: 'hodogaya-d', cpu: 4 },
  { name: 'cpu6-hodogaya-d', page: 'index.html', map: 'hodogaya-d', cpu: 6 },
  { name: 'fast3g-split-hodogaya-d', page: 'index.html', map: 'hodogaya-d', net: true },
  { name: 'mobile-hodogaya-d', page: 'index.html', map: 'hodogaya-d', mobile: true },
  { name: 'auto-quality-sumino', page: 'index.html', map: 'sumino', auto: true, runs: 1 },
].filter(c => !ONLY || ONLY.includes(c.name));
const result = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};
for (const c of CONDS) {
  const runs = []; for (let i = 0; i < (c.runs ?? RUNS); i++) { try { runs.push(await once(c)); } catch (e) { runs.push({ error: String(e).slice(0, 200) }); } console.error(new Date().toISOString().slice(11, 19), c.name, i, JSON.stringify(runs[runs.length - 1]).slice(0, 400)); }
  const ok = runs.filter(r => !r.error), m = k => median(ok.map(r => r[k])), q = {};
  if (c.quality) for (const k of ['low', 'mid', 'high']) q[k] = { tris: median(ok.map(r => r.q?.[k]?.tris)), calls: median(ok.map(r => r.q?.[k]?.calls)) };
  result[c.name] = { runs: runs.length, ok: ok.length, title_s: sec(m('titleMs')), pick_s: sec(m('pickMs')), back_s: sec(m('backMs')), switch_s: sec(m('switchMs')), html_resp_ms: median(ok.map(r => r.nav?.respEnd)), dcl_ms: median(ok.map(r => r.nav?.dcl)), load_ms: median(ok.map(r => r.nav?.load)), wire_MB: ok[0]?.nav?.bytes ? Math.round(ok[0].nav.bytes / 1e5) / 10 : null, heapTitle_MB: m('heapTitle') && Math.round(m('heapTitle')), heapCity_MB: m('heapCity') && Math.round(m('heapCity')), heapSwitch_MB: m('heapSwitch') && Math.round(m('heapSwitch')), q, auto: ok[0]?.auto, errors: ok.reduce((a, r) => a + r.errors, 0), raw: runs };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(result).map(([k, v]) => [k, { ...v, raw: undefined }])), null, 1)); await browser.close(); srv.close();
