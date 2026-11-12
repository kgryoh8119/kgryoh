// 実在都市版の画面確認
import { open } from './shot.mjs';
process.env.MAPID = process.env.MAPID ?? 'hodogaya';
const t0 = Date.now();
const { browser, page, errors } = await open(+(process.env.WW ?? 1440), +(process.env.HH ?? 900));
console.log('loaded ms', Date.now() - t0);
await page.waitForTimeout(3000);
await page.screenshot({ path: 'shots/real-01.png' });
console.log(JSON.stringify(await page.evaluate(() => window.__sumu.view.stats)));
for (const [name, fn] of [
  ['real-01b-notut', v => { document.querySelector('[data-act="tutskip"]')?.click(); }],
  ['real-02-far', v => { v.want.dist = 4200; v.want.pitch = 1.0; v.want.x = 2355; v.want.z = 2550; }],
  ['real-03-close', v => { v.want.dist = 260; v.want.pitch = 0.6; v.want.x = 3060; v.want.z = 2680; }],
]) {
  await page.evaluate(f => { const v = window.__sumu.view; (0, eval)('(' + f + ')')(v); }, fn.toString());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/${name}.png` });
}
console.log(JSON.stringify(await page.evaluate(() => ({ stats: window.__sumu.view.stats, mem: performance.memory?.usedJSHeapSize }))));
console.log('errors', errors);
await browser.close();
