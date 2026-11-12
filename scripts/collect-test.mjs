// 収集ツールの動作確認（外部への通信は偽の応答に差し替える）
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
import path from 'path';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const page = await browser.newPage();
const errs = []; page.on('pageerror', e => errs.push(e.message));
let demCalls = 0;
await page.route('**/api/interpreter', r => { const q = decodeURIComponent(r.request().postData()); const isB = q.includes('out center'); r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' }, body: JSON.stringify({ elements: isB ? [{ id: 1, center: { lat: 35.46, lon: 139.59 }, tags: { building: 'house' } }] : [{ type: 'way', id: 2, tags: { highway: 'primary' }, geometry: [{ lat: 35.45, lon: 139.58 }, { lat: 35.46, lon: 139.59 }] }] }) }); });
await page.route('**/cyberjapandata.gsi.go.jp/**', r => { demCalls++; const rows = []; for (let j = 0; j < 256; j++) rows.push(Array.from({ length: 256 }, (_, i) => (i % 50 === 0 ? 'e' : (10 + j * 0.1).toFixed(1))).join(',')); r.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*' }, body: rows.join('\n') }); });
await page.goto('file://' + path.resolve('tools/collect-map.html'));
await page.click('#go');
await page.waitForSelector('a.dl', { timeout: 60000 });
const r = await page.evaluate(async () => { const t = await (await fetch(document.querySelector('a.dl').href)).text(); const d = JSON.parse(t); return { mb: t.length / 1e6, osm: d.osm.elements.length, b: d.buildings.length, cols: d.dem.cols, rows: d.dem.rows, nulls: d.dem.values.filter(v => v === null).length, sample: d.dem.values.slice(0, 3), errors: d.errors }; });
console.log(JSON.stringify(r), 'demTiles', demCalls, 'errors', errs, await page.textContent('#out'));
await browser.close();
