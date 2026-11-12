// 画面の混み具合を見る（PC・スマホ、3 年目の街）
import { open } from './shot.mjs';
for (const [w, h, tag] of [[1280, 800, 'pc'], [390, 844, 'sp']]) {
  const { browser, page } = await open(w, h, 'sumino');
  await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; for (let i = 0; i < 26; i++) { S.stepMonth(s); s.events.active = []; } if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } s.pendingElection = null; S.ui.refresh(); S.ui.renderModal(); });
  await page.waitForTimeout(3000); await page.screenshot({ path: `shots/clutter-${tag}.png` });
  await browser.close();
}
