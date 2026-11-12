// v30：夜景のにじみとネオン・完成の紙吹雪・地震の土煙・開票速報
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 1e6; window.__sumu.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 24; i++) { S.stepMonth(s); s.events.active = []; } if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); S.ui.renderModal();
  S.view.hour = 21; S.view.clockRun = false; S.view.focus(20 * 76 + 30, 1300); });
await page.waitForTimeout(2500); await page.screenshot({ path: 'shots/v30-night.png' });
await page.evaluate(() => { const S = window.__sumu, s = S.game.state; S.view.hour = 13; const b = s.buildings.find(b => b.status === 'operating' && b.kind === 'apartment'); b.status = 'construction'; s.bVersion++; S.view.focus(b.y * 76 + b.x, 300); window.__b = b.id; });
await page.waitForTimeout(800);
await page.evaluate(() => { const S = window.__sumu, s = S.game.state, b = s.buildings.find(o => o.id === window.__b); b.status = 'operating'; s.bVersion++; });
await page.waitForTimeout(700); await page.screenshot({ path: 'shots/v30-complete.png' });
await page.evaluate(() => { const S = window.__sumu, s = S.game.state; S.view.focus(20 * 76 + 30, 900); s.events.active.push({ id: 'megaQuake', start: s.month, target: -1, expire: s.month + 3 }); });
await page.waitForTimeout(900); await page.screenshot({ path: 'shots/v30-quake.png' });
await page.evaluate(() => { const S = window.__sumu, s = S.game.state; s.events.active = []; s.pendingElection = { month: s.month, term: 1, vote: 56.3, win: true, support: 0.6, pledgesKept: [true, false, true], parts: [], typeSupport: [0.6, 0.6, 0.6, 0.6, 0.6] }; S.ui.renderModal(); });
await page.waitForTimeout(5000); await page.screenshot({ path: 'shots/v30-count.png' });
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')), await page.evaluate(() => window.__sumu.view.stats));
await browser.close();
