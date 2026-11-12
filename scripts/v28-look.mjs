// v28：市政の画面（議会・選挙戦・SNS・国や県・行事・人口動態）
import { open } from './shot.mjs';
for (const [w, h, tag] of [[1280, 860, 'pc'], [390, 844, 'sp']]) {
  const { browser, page, errors } = await open(w, h, 'sumino');
  await page.evaluate(() => {
    const S = window.__sumu, g = S.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; g.state.cash = 1e6;
    for (let i = 0; i < 40; i++) { S.stepMonth(g.state); for (const e of [...g.state.events.active]) g.state.events.active = []; }
    const s = g.state; s.pol.flame = { id: 'wait', m: s.month, text: '「保育園落ちた、市長なにしてる」の投稿が拡散しています' };
    g.act({ type: 'pol', op: 'speech' }); g.act({ type: 'pol', op: 'grant', id: 'kosodate' }); g.act({ type: 'pol', op: 'fest', id: 'hanabi', n: 1 });
    document.getElementById('side')?.classList.remove('closed'); S.ui.tab = 'city'; S.ui.refresh(); S.ui.renderSide(); document.getElementById('modal')?.remove();
  });
  await page.waitForTimeout(800);
  for (const [k, y] of [[0, 0], [1, 900], [2, 1900], [3, 3000]]) { await page.evaluate(y => { document.getElementById('panel').scrollTop = y; }, y); await page.waitForTimeout(250); await page.screenshot({ path: `shots/v28-${tag}-${k}.png` }); }
  console.log(tag, errors.filter(e => !e.includes('ERR_TUNNEL')));
  await browser.close();
}
