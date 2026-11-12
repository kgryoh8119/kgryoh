// v36：前と後の比べ（同じ場所・同じ時刻。高品質）
import { open } from './shot.mjs';
const tag = process.env.TAG ?? 'after';
const { browser, page, errors } = await open(1280, 800, 'sumino');
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 30; i++) { S.stepMonth(s); s.events.active = []; } if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } s.pendingElection = null; s.notes = []; S.ui.refresh(); S.ui.renderModal();
  document.getElementById('side')?.classList.add('closed'); S.view.weatherForce = 'clear'; S.view.clockRun = false; S.view.hour = 11; S.view.focus(16 * 76 + 24, 620); });
for (const [h, n] of [[11, 'noon'], [17.4, 'eve'], [21, 'night']]) { await page.evaluate(h => { window.__sumu.view.hour = h; }, h); await page.waitForTimeout(2200); await page.screenshot({ path: `shots/v36-${tag}-${n}.png` }); }
await page.evaluate(() => { const S = window.__sumu; S.view.hour = 15; S.view.setMode('ground'); });
await page.waitForTimeout(2200); await page.screenshot({ path: `shots/v36-${tag}-ground.png` });
console.log(tag, errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
