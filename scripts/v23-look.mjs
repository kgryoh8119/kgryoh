// v23：区域の制限（暗い所と黄色い線）・市長の資料・ランキング発表・レベルアップ
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate(() => { const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; window.__sumu.ui.refresh(); window.__sumu.view.focus(34 * 76 + 38, 2600); });
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/v23-lock.png' });
await page.evaluate(() => { const S = window.__sumu, g = S.game; for (let k = 0; k < 12; k++) S.stepMonth(g.state); g.state.mayor.pts += 70; S.stepMonth(g.state); g.speed = 0; S.ui.refresh(); });
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/v23-levelup.png' });
await page.evaluate(() => { document.querySelector('[data-act="lvseen"]:not([data-arg])')?.click(); });
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/v23-rank.png' });
await page.evaluate(() => { document.querySelector('[data-act="rankseen"][data-arg="mayor"]')?.click(); });
await page.waitForTimeout(800);
await page.screenshot({ path: 'shots/v23-mayor.png' });
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
