// 公開ページ（claude.ai の Artifact）と同じ制限で、単体 HTML を開いて警告・エラーが出ないか確かめる。
// 制限：fetch / XMLHttpRequest は外へ出られない（中継で Request を渡せず DataCloneError になる）。1 つでも警告・エラーが出たら失敗（終了コード 1）
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
import path from 'path'; import http from 'http'; import fs from 'fs';
const file = path.resolve(process.argv[2] ?? 'dist/sumucity-standalone.html');
const html = fs.readFileSync(file);
const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(html); }).listen(0);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.addInitScript(() => {
  const deny = (what) => Promise.reject(new DOMException(`Failed to execute 'postMessage' on 'Window': ${what} could not be cloned.`, 'DataCloneError'));
  window.fetch = (input) => deny(typeof input === 'string' ? 'Request object' : 'Request object');
  const X = window.XMLHttpRequest; window.XMLHttpRequest = class extends X { send() { setTimeout(() => this.dispatchEvent(new Event('error')), 0); } };
});
const bad = [];
page.on('pageerror', e => bad.push('ERROR ' + e.message));
page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') bad.push(m.type().toUpperCase() + ' ' + m.text().slice(0, 240)); });
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForTimeout(4000);
const b = await page.$('#title [data-t="start"][data-id="sumino"]'); if (b) await b.click(); await page.waitForTimeout(800);
const t = await page.$('#title [data-t="terrain"][data-tr="coast"]'); if (t) await t.click();
await page.waitForTimeout(20000);
const st = await page.evaluate(() => { const v = window.__sumu?.view; const lm = v?.landmarks; return { started: !!window.__sumu, nan: window.__sumuNaN ?? 0, lm: lm ? ['castle', 'station', 'tower', 'stadium', 'temple'].filter(k => lm.has(k)).length : -1 }; });
const ign = (s) => /TUNNEL|GPU stall|Automatic fallback to software WebGL|swiftshader/i.test(s); // WebGL: INVALID_ は見逃さない（人が消えるなどの壊れ方の合図）
const real = [...new Set(bad.filter(s => !ign(s)))];
console.log(JSON.stringify(st)); for (const s of real) console.log(s);
await browser.close(); srv.close();
if (!st.started || st.lm < 5 || real.length || st.nan) { console.log('NG：公開ページで問題が出ます'); process.exit(1); } else console.log('OK：警告・エラーなし（名所の glb も読めた）');
