// v30：概要（今日の課題・主人公・称号）・ニュースのテロップ・主人公のカード・振り返り・写真のミニチュア風・鳥と小舟
import { open } from './shot.mjs';
process.env.STACK = '1';
const { browser, page, errors } = await open(1280, 800, 'sumino');
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 1e6;
  for (let i = 0; i < 30; i++) { S.stepMonth(s); s.events.active = []; if (s.month % 12 === 0) { /* 記録 */ } } if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; }
  S.ui.tab = 'home'; S.ui.refresh(); S.ui.renderModal(); S.view.hour = 10; S.view.clockRun = false; S.view.focus(30 * 76 + 52, 700); });
await page.waitForTimeout(2500);
await page.evaluate(() => { const S = window.__sumu, s = S.game.state; s.notes.push('🔥 炎上：「保育園落ちた、市長なにしてる」の投稿が拡散しています。対応を決めてください（市政の画面）'); const h = S.game.state.pol.cit.find(c => !c.gone); s.pol.hero = h.id; h.log.push({ m: s.month, t: '結婚した' }); });
await page.waitForTimeout(2600); await page.screenshot({ path: 'shots/v30-home.png' });
await page.evaluate(() => { const S = window.__sumu; S.ui.onAct ? 0 : 0; S.view.weatherForce = ''; document.getElementById('app').classList.add('photo', 'mini'); S.ui.photo = true; S.ui.renderPhoto(); S.view.focus(20 * 76 + 30, 600); });
await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v30-mini.png' });
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
