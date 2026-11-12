// v32：陳情と市長のタイプ・街並み・霧と虹・電車に乗る・アルバム・大会のカード
import { open } from './shot.mjs';
process.env.TITLESHOT = 'shots/v32-title.png';
const { browser, page, errors } = await open(1280, 800, 'sumino');
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 1e6;
  for (let i = 0; i < 30; i++) { S.stepMonth(s); s.events.active = []; } if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; }
  s.pol.pet = { id: 'signal', m: s.month, who: '本町の町内会長', ask: '交差点に信号機をつけてほしい', cost: 300 }; s.notes = [];
  document.getElementById('side')?.classList.remove('closed'); S.ui.tab = 'city'; S.ui.refresh(); S.ui.renderSide(); S.ui.renderModal(); S.view.hour = 11; S.view.clockRun = false;
  const b = s.buildings.find(b => b.kind === 'supermarket' || b.kind === 'shop'); S.view.focus(b.y * 76 + b.x, 160); });
await page.waitForTimeout(2500); await page.screenshot({ path: 'shots/v32-city.png' });
await page.evaluate(() => { const S = window.__sumu; S.view.weatherForce = 'fog'; S.view.hour = 6.5; S.view.focus(20 * 76 + 30, 900); });
await page.waitForTimeout(1800); await page.screenshot({ path: 'shots/v32-fog.png' });
await page.evaluate(() => { const S = window.__sumu; S.view.weatherForce = 'clear'; S.view.hour = 13; S.view.rainbowT = 60; });
await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v32-rainbow.png' });
await page.evaluate(() => { const S = window.__sumu; S.view.weatherForce = ''; S.view.ride = 'train'; });
await page.waitForTimeout(2500); await page.screenshot({ path: 'shots/v32-train.png' });
await page.evaluate(() => { const S = window.__sumu; S.view.ride = null; S.ui.albumOpen = true; S.ui.renderModal(); });
await page.waitForTimeout(600); await page.screenshot({ path: 'shots/v32-album.png' });
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
