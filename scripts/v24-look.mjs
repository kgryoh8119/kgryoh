// v24：UI の見直し（表示メニュー・概要・お知らせ・設定・文字の大きさ）
import { open } from './shot.mjs';
const M = !!process.env.MOBILE, [w, h] = M ? [390, 844] : [1440, 900], P = M ? 'm' : 'd';
const { browser, page, errors } = await open(w, h);
await page.evaluate(() => { const S = window.__sumu, g = S.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; for (let k = 0; k < 13; k++) S.stepMonth(g.state); g.state.mayor.seenLv = 99; g.state.mayor.seenRank = 1e5; S.ui.refresh(); });
const click = sel => page.evaluate(q => document.querySelector(q)?.click(), sel);
await page.waitForTimeout(800);
await click('#tabs [data-arg="home"]'); await page.waitForTimeout(400);
await page.screenshot({ path: `shots/v24-${P}-home.png` });
await click('.bellbtn'); await page.waitForTimeout(400); await page.screenshot({ path: `shots/v24-${P}-news.png` }); await click('[data-act="news"].btn');
await click('[data-act="menu"].topbtn'); await page.waitForTimeout(300); await click('[data-act="menutab"][data-arg="set"]'); await page.waitForTimeout(300); await page.screenshot({ path: `shots/v24-${P}-set.png` });
await click('[data-act="fontsize"][data-arg="l"]'); await page.waitForTimeout(300); await click('.dialog [data-act="menu"]'); await page.waitForTimeout(300);
await click('[data-act="group"][data-arg="build"]'); await page.waitForTimeout(400); await page.screenshot({ path: `shots/v24-${P}-big.png` }); await click('[data-act="group"][data-arg="select"]');
if (!M) { await click('.vtog [data-act="viewtoggle"]'); await page.waitForTimeout(300); await page.screenshot({ path: `shots/v24-${P}-viewopen.png` }); }
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
