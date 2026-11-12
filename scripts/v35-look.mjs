// v35：見やすさ（知らせは 1 つ・説明は隠す・札の重なりを消す）
import { open } from './shot.mjs';
for (const [w, h, tag] of [[1280, 800, 'pc'], [390, 844, 'sp']]) {
  const { browser, page, errors } = await open(w, h, 'sumino');
  await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; for (let i = 0; i < 26; i++) { S.stepMonth(s); s.events.active = []; } if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } s.pendingElection = null;
    s.notes.push('🎆 夏祭り・盆踊りを開きました', '🏢 内閣府の「地方創生推進交付金」は不採択でした。県との関係を深め、知名度を上げると通りやすくなります', '📮 陳情：本町の町内会長から「交差点に信号機をつけてほしい」（300 万円）。市政の画面で答えてください');
    S.ui.refresh(); S.ui.renderModal(); S.view.focus(18 * 76 + 24, 420); });
  await page.waitForTimeout(3000); await page.screenshot({ path: `shots/v35-${tag}-home.png` });
  await page.evaluate(() => { const S = window.__sumu; document.getElementById('side')?.classList.remove('closed'); S.ui.tab = 'city'; S.ui.renderSide(); });
  await page.waitForTimeout(600); await page.screenshot({ path: `shots/v35-${tag}-city.png` });
  console.log(tag, errors.filter(e => !e.includes('TUNNEL')));
  await browser.close();
}
