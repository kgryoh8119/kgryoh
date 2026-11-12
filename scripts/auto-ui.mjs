// オートプレイの確認：［オート］を押して進める
import { open } from './shot.mjs';
const id = process.env.MAPID ?? 'sumino';
const { browser, page, errors } = await open(1440, 900, id);
await page.evaluate(() => { window.__sumu.game.state.tutorial.done = true; window.__sumu.ui.refreshTutorial(true); });
await page.click('#modal [data-act="auto"]');
const t0 = Date.now();
const r = await page.evaluate(() => { const g = window.__sumu.game; const t = performance.now(); for (let i = 0; i < 48; i++) g.tick(1.01); g.speed = 0; window.__sumu.ui.refresh(); return { m: g.state.month, ms: Math.round(performance.now() - t), log: g.autoLog.length, pop: Math.round(g.state.stats.pop), mode: g.state.mode }; });
await page.waitForTimeout(600);
await page.screenshot({ path: `shots/auto-${id}.png` });
console.log(id, JSON.stringify(r), Date.now() - t0, 'ms');
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
