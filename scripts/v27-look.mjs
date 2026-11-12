// v27：地形のパターン（全部）・住民・姉妹都市・テレビ局など
import { open } from './shot.mjs';
const unlock = () => localStorage.setItem('sumu-career', JSON.stringify({ lv: 10, cities: [{ key: 'x', name: '住野市', terrain: '海辺の街', years: 12, pop: 42000, lv: 7, rank: 88, at: Date.now() }], moves: 0 }));
const terr = (process.env.TERRS ?? 'coast,inland,rural,river,lake,mountain,urban,island').split(',');
for (const [k, t] of terr.entries()) {
  process.env.TERRAIN = t; process.env.TITLESHOT = k === 0 ? 'shots/v27-title.png' : '';
  if (!process.env.TITLESHOT) delete process.env.TITLESHOT;
  const { browser, page, errors } = await open(1280, 800, 'sumino', unlock);
  await page.evaluate(() => { const S = window.__sumu, g = S.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; S.ui.refresh(); S.view.focus(34 * 76 + 38, 3000); });
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `shots/v27-t-${t}.png` });
  if (k === 0) {
    await page.evaluate(() => { const S = window.__sumu, s = S.game.state; s.fame = 40; s.cash = 1e8; S.game.act({ type: 'sister', id: 'taipei', act: 'join' }); S.game.act({ type: 'sister', id: 'helsinki', act: 'join' }); S.ui.peopleOpen = true; S.ui.renderModal(); });
    await page.waitForTimeout(600); await page.screenshot({ path: 'shots/v27-people.png' });
    await page.evaluate(() => { const S = window.__sumu; S.ui.peopleOpen = false; S.ui.renderModal(); const h = S.game.state.buildings.find(b => b.kind === 'apartment' && b.status === 'operating'); S.ui.sel = { b: h.id }; S.view.focus(h.y * 76 + h.x, 240); S.ui.openK.add('res-' + h.id); S.ui.renderInfo(); document.querySelector('#tabs [data-arg="mayor"]')?.click(); });
    await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v27-house.png' });
  }
  console.log(t, errors.filter(e => !e.includes('ERR_TUNNEL')));
  await browser.close();
}
