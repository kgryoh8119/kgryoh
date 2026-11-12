import { createRequire } from 'module';
const require = createRequire('/opt/npm-tools/node_modules/');
const { chromium, devices } = require('playwright');
const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const page = await ctx.newPage(); const errs = [];
page.on('pageerror', e => errs.push('pageerror: ' + e.message + '\n' + (e.stack||'').slice(0,600)));
page.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errs.push(m.type()+': ' + m.text().slice(0,300)); });
await page.goto('file:///home/claude/sumucity/dist/sumucity-standalone.html');
await page.waitForTimeout(6000);
await page.screenshot({ path: '/tmp/claude-0/m1.png' });
const st = await page.$('#title [data-t="start"]');
if (st) { await st.click(); await page.waitForTimeout(800); const tc = await page.$('#title [data-t="terrain"][data-tr="coast"]'); if (tc) await tc.click(); await page.waitForTimeout(25000); }
await page.screenshot({ path: '/tmp/claude-0/m2.png' });
console.log(await page.evaluate(() => JSON.stringify(window.__sumu?.view?.stats ?? null)));
console.log(errs.join('\n'));
await b.close();
