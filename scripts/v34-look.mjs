// v34：走る新幹線と、地下鉄の出入口・工事
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true;
  for (let i = 0; i < 6; i++) { S.stepMonth(s); s.events.active = []; } const st = s.buildings.find(b => b.kind === 'station'); st.shin = s.month - 1; s.pol.rail = { freq: 0, subway: { start: s.month, done: false } };
  if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = -1; } s.notes = []; S.view.hour = 14; S.view.clockRun = false; S.view.sigSites = ''; S.view.focus(st.y * 76 + st.x, 520); S.ui.renderModal(); return [st.x, st.y]; });
await page.waitForTimeout(2500);
await page.evaluate(() => { const v = window.__sumu.view; v.shin.run = true; v.shin.dir = 1; v.shin.u = 60; v.shin.stop = false; v.shin.v = 4; const S = window.__sumu, st = S.game.state.buildings.find(b => b.kind === 'station'); v.focus((st.y) * 76 + st.x, 230); v.tutorialOff = 1; S.game.state.tutorial.done = true; S.ui.refresh(); });
await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v34-shin1.png' });
await page.evaluate(() => { const v = window.__sumu.view; v.shin.u = -40; v.shin.v = 0; v.shin.stop = true; v.shin.wait = 30; });
await page.waitForTimeout(600); await page.screenshot({ path: 'shots/v34-shin2.png' });
await page.evaluate(() => { const S = window.__sumu, s = S.game.state; const st = s.buildings.find(b => b.kind === 'station'); S.view.focus((st.y + 2) * 76 + st.x + 3, 140); S.view.sigSites = ''; });
await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v34-subwork.png' });
await page.evaluate(() => { const S = window.__sumu, s = S.game.state; s.pol.rail.subway.done = true; S.view.sigSites = ''; S.view.hour = 20; });
await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v34-subnight.png' });
await page.evaluate(() => { const S = window.__sumu; S.view.hour = 13; });
await page.waitForTimeout(800); await page.screenshot({ path: 'shots/v34-subday.png' });
console.log(info, errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
