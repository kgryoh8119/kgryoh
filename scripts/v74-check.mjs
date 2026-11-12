// v74：オートの作戦ボタン（概要タブ）と、遠くの山・木・車の見た目
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const r = await page.evaluate(async () => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.ui.refresh();
  const q = (sel) => document.querySelector(sel); q('[data-act="tab"][data-arg="home"]')?.click(); await new Promise(r => setTimeout(r, 300));
  const b = q('[data-act="aorder"][data-arg="0"]'); if (!b) return 'ボタンが無い'; b.scrollIntoView({ block: 'center' }); b.click(); await new Promise(r => setTimeout(r, 300));
  const b2 = q('[data-act="aorder"][data-arg="0"]'); b2?.scrollIntoView({ block: 'center' }); return { order: s.autoOrder, pressed: b2?.getAttribute('aria-pressed'), log: g.autoLog.slice(-1) }; });
console.log(JSON.stringify(r)); await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v74-order.png' });
await page.evaluate(() => { const S = window.__sumu, v = S.view, st = S.game.state.buildings.find(b => b.kind === 'station'); document.getElementById('app').classList.add('photo'); S.fixedQuality = true; v.setQuality('high'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; v.focus((st.y + 6) * S.W + st.x, 260); v.pitch = v.want.pitch = 0.16; v.yaw = v.want.yaw = 0.4; });
await page.waitForTimeout(9000); await page.screenshot({ path: 'shots/v74-view.png' });
console.log(errors); await browser.close();
