// 花火と完成の演出（夜）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(200000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 24; i++) { S.stepMonth(s); s.events.active = []; } s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed');
  S.view.clockRun = false; S.view.hour = 21; S.view.weatherForce = 'clear'; S.view.celebrate('festival', '夏祭り'); S.view.fwNight = 2; });
await page.waitForTimeout(800);
await page.evaluate(() => { const v = window.__sumu.view; if (v.festAt) { v.focus(Math.floor(v.festAt.z / 30) * 76 + Math.floor(v.festAt.x / 30), 420); const p = v.festAt; v.fx.burst(p.x + 60, p.y + 20, p.z, 'confetti', 120, 14); v.fx.burst(p.x + 60, p.y + 1, p.z, 'sparkle', 40, 24); v.fx.burst(p.x - 60, p.y + 1, p.z, 'dust', 14, 18); } });
for (let k = 0; k < 3; k++) { await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v42-fw${k}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
