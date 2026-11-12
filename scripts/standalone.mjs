// 単体ファイル版をファイルとして直接開き、同梱の地図（保土ケ谷）で始められるか
import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium } = require('playwright');
const path = await import('path');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } }); const errs = []; page.on('pageerror', e => errs.push(e.message));
await page.goto('file://' + path.resolve('dist/sumucity-standalone.html')); await page.waitForSelector('#title .mcard');
await page.click('#title button[data-t="start"][data-id="hodogaya"]');
await page.waitForFunction(() => window.__sumu && window.__sumu.view.stats.buildings > 0, null, { timeout: 240000 });
console.log(await page.evaluate(() => window.__sumu.game.state.cityName), Math.round(await page.evaluate(() => window.__sumu.game.state.stats.pop)));
// 予測（別スレッド）も file:// で動くか
await page.evaluate(() => document.querySelector('[data-act="tutskip"]')?.click());
await page.click('#tabs [data-arg="fc"]'); await page.waitForTimeout(500); console.log('fcrun buttons', await page.locator('[data-act="fcrun"]').count()); await page.click('#panel [data-act="fcrun"]'); await page.waitForTimeout(1500); console.log('toast', await page.textContent('#toast'), 'busy', await page.evaluate(() => window.__sumu.ui.fcBusy));
for (let k = 0; k < 2; k++) { await page.waitForTimeout(10000); const st = await page.evaluate(() => ({ busy: window.__sumu.ui.fcBusy, fc: !!window.__sumu.ui.fc, prog: document.getElementById('fcprog')?.textContent, panel: document.getElementById('panel').textContent.slice(0, 200) })); console.log(k, JSON.stringify(st)); if (st.fc && !st.busy) break; }
console.log('forecast', JSON.stringify(await page.evaluate(() => ({ ms: Math.round(window.__sumu.ui.fc.ms), mode: window.__sumu.ui.fc.mode }))));
console.log('errors', errs); await browser.close();
