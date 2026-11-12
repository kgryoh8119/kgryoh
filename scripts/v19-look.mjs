// v19：初仕事・お祝いの花火・ビジョンの特典・SNS 風の声・スマホの画面
import { open } from './shot.mjs';
const mobile = !!process.env.MOBILE;
const { browser, page, errors } = await open(mobile ? 390 : 1440, mobile ? 844 : 900);
// 公約とビジョンの画面（特典の説明）
await page.waitForTimeout(800);
await page.screenshot({ path: `shots/v19-${mobile ? 'm-' : ''}goals.png` });
await page.evaluate(() => { const S = window.__sumu, g = S.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'], vision: 'tourism' }); g.state.tutorial.done = true; g.state.cash = 5e6; S.ui.refresh(); });
if (!mobile) {
  // 初仕事：道路を少し引いて、ひとつ達成した状態に
  await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; for (let k = 0; k < 2; k++) S.stepMonth(s); g.act({ type: 'civic', id: 'festival' }); S.stepMonth(s); for (const e of [...s.events.active]) g.act({ type: 'event', id: e.id, option: 0 }); S.ui.eventHidden = true; g.changed && g.changed(); S.ui.tab = 'home'; S.ui.refresh(); });
  await page.waitForTimeout(600);
  await page.evaluate(() => { const el = document.querySelector('.missions'); el && el.scrollIntoView(); });
  await page.waitForTimeout(400); await page.screenshot({ path: 'shots/v19-missions.png' });
  // お祝い：夜の花火とまつり
  await page.evaluate(() => { const S = window.__sumu, s = S.game.state, v = S.view; s.celeb = { kind: 'festival', month: s.month, label: '市民まつり' }; v.celebrate('festival', '市民まつり'); v.hour = 20.3; v.clockRun = false; v.weatherForce = 'clear'; const b = s.buildings.find(o => o.kind === 'cityHall') ?? s.buildings.find(o => o.kind === 'station'); v.focus(b.y * 76 + b.x, 420); v.want.pitch = 0.45; });
  await page.waitForTimeout(3500); await page.screenshot({ path: 'shots/v19-fireworks.png' });
  await page.evaluate(() => { const v = window.__sumu.view; v.hour = 11; const s = window.__sumu.game.state; const b = ['parkL', 'parkM', 'park', 'cityHall', 'station'].map(k => s.buildings.find(o => o.kind === k && o.status === 'operating')).find(Boolean); v.focus((b.y + 1) * 76 + b.x + 1, 140); v.want.pitch = 0.8; });
  await page.waitForTimeout(3000); await page.screenshot({ path: 'shots/v19-festival.png' });
  // 声（SNS 風）とお礼
  await page.evaluate(() => { const S = window.__sumu, s = S.game.state; s.thanks = [{ key: 'care2', month: s.month, who: '子育て世帯', text: '保育園に入れて、仕事に戻れました。ほんとうに助かっています！', was: '保育園に入れません', months: 7 }]; S.stepMonth(s); for (const e of [...s.events.active]) S.game.act({ type: 'event', id: e.id, option: 0 }); S.ui.eventHidden = true; S.ui.tab = 'voice'; S.ui.refresh(); });
  await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v19-voices.png' });
  // 施設のメニュー（観光のビジョン専用）
  await page.evaluate(() => { const u = window.__sumu.ui; u.tab = 'home'; u.group = 'build'; u.bcat = 'landmark'; u.renderTools(); });
  await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v19-build.png' });
} else {
  await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v19-m-map.png' });
  await page.evaluate(() => { const u = window.__sumu.ui; u.group = 'road'; u.renderTools(); });
  await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v19-m-road.png' });
  await page.evaluate(() => { const u = window.__sumu.ui; u.group = null; u.renderTools(); document.getElementById('side').classList.remove('closed'); u.tab = 'home'; u.refresh(); });
  await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v19-m-home.png' });
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
