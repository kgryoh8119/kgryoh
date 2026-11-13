// v88：ページのエラーと列車の様子だけを見る（品質 Q、待つ秒 T）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(320, 200, process.env.MAPID ?? 'sumino');
await page.evaluate((q) => { const S = window.__sumu; S.fixedQuality = true; S.view.setQuality(q); S.view.hour = 10; }, process.env.Q ?? 'low');
await page.waitForTimeout(Number(process.env.T ?? 15) * 1000);
console.log(JSON.stringify(await page.evaluate(() => { const v = window.__sumu.view; return { stats: v.stats, trains: v.trains.map(t => [t.fam, Math.round(t.d), Math.round(t.v * 10) / 10, t.wait > 0 ? Math.round(t.wait) : 0]) }; })));
console.log('errors', JSON.stringify(errors.slice(0, 5)));
await browser.close();
