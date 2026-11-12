// v31：市政（折りたたみ・復興）・仮設住宅・年表・スマホの画面
import { open } from './shot.mjs';
for (const [w, h, tag] of [[1280, 800, 'pc'], [390, 844, 'sp']]) {
  const { browser, page, errors } = await open(w, h, 'sumino');
  await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 1e6;
    for (let i = 0; i < 30; i++) { S.stepMonth(s); s.events.active = []; } s.pol.rec = { m: s.month, what: 'quake', lost: 320, gekijin: true }; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; }
    s.notes = []; document.getElementById('side')?.classList.remove('closed'); S.ui.tab = 'city'; S.ui.refresh(); S.ui.renderSide(); S.ui.renderModal();
    const c = s.buildings.find(b => b.kind === 'cityHall') ?? s.buildings.find(b => b.kind === 'station'); S.view.sigSites = ''; S.view.focus(c.y * 76 + c.x, 420); });
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v31-${tag}-city.png` });
  await page.evaluate(() => { const S = window.__sumu; S.ui.tab = 'mayor'; S.ui.openK.add('home-📜 街の年表'); S.ui.renderSide(); });
  await page.waitForTimeout(500); await page.screenshot({ path: `shots/v31-${tag}-mayor.png` });
  console.log(tag, errors.filter(e => !e.includes('TUNNEL')));
  await browser.close();
}
