// v29：人事・バス路線・地価・追いかける住民・オンラインランキング
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 860, 'sumino');
await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 1e6;
  for (let i = 0; i < 30; i++) { S.stepMonth(s); s.events.active = []; }
  const roads = s.road.map((r, i) => (r ? i : -1)).filter(i => i >= 0), W = S.W;
  const pick = (x, y) => roads.reduce((a, i) => (Math.abs(i % W - x) + Math.abs(Math.floor(i / W) - y) < Math.abs(a % W - x) + Math.abs(Math.floor(a / W) - y) ? i : a), roads[0]);
  const st = [pick(10, 20), pick(30, 26), pick(40, 14), pick(60, 40), pick(20, 45)];
  window.__rt = [g.act({ type: 'busStop', tiles: st, on: true }), s.busStops, g.act({ type: "pol", op: "route", id: `${s.busStops[0]}-${s.busStops[1]}`, n: 2 }), g.act({ type: "pol", op: "route", id: `${s.busStops[2]}-${s.busStops[s.busStops.length - 1] === s.busStops[2] ? s.busStops[0] : s.busStops.at(-1)}`, n: 1 })];
  S.stepMonth(s); s.events.active = [];
  document.getElementById('side')?.classList.remove('closed'); S.ui.tab = 'city'; S.ui.openK.add('post-1'); if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); S.ui.renderSide(); S.ui.renderModal();
  S.view.layer = 'bus'; const rp = s.pol.routes[0].path; S.view.focus(rp[Math.floor(rp.length / 2)], 900);
});
await page.waitForTimeout(1500);
const panelY = async y => { await page.evaluate(y => { document.getElementById('panel').scrollTop = y; }, y); await page.waitForTimeout(300); };
const t = await page.evaluate(() => [...document.querySelectorAll('#panel h2')].map(h => [h.textContent, h.offsetTop]));
const at = k => t.find(x => x[0].includes(k))?.[1] ?? 0;
await panelY(at('人事') - 10); await page.screenshot({ path: 'shots/v29-hr.png' });
await panelY(at('バス路線') - 10); await page.screenshot({ path: 'shots/v29-bus.png' });
await panelY(at('地価') - 10); await page.evaluate(() => { window.__sumu.view.layer = 'land'; }); await page.waitForTimeout(800); await page.screenshot({ path: 'shots/v29-land.png' });
await page.evaluate(() => { const S = window.__sumu; S.view.layer = 'none'; S.view.focus(30 * 76 + 35, 700); S.ui.peopleOpen = true; S.ui.renderModal(); });
await page.waitForTimeout(800); await page.screenshot({ path: 'shots/v29-people.png' });
await page.evaluate(() => { const S = window.__sumu; S.ui.peopleOpen = false; S.ui.renderModal(); S.ui.tab = 'mayor'; S.ui.renderSide(); const h = [...document.querySelectorAll('#panel h2')].find(h => h.textContent.includes('オンライン')); if (h) document.getElementById('panel').scrollTop = h.offsetTop - 10; });
await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v29-online.png' });
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')), JSON.stringify(await page.evaluate(() => window.__rt)));
await browser.close();
