// v63：雲と空を低い視点で撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.weatherForce = 'clear'; S.view.clockRun = false; });
const st = await page.evaluate(() => { const s = window.__sumu.game.state, b = s.buildings.find(b => b.kind === 'station'); return b.y * window.__sumu.W + b.x; });
for (const [h, n, yaw] of [[10.5, 'day', 0.4], [17.2, 'dusk', 2.6]]) { await page.evaluate(([t, h, yaw]) => { const v = window.__sumu.view, W = window.__sumu.W; v.hour = h; v.setMode('ground'); v.ground.x = (t % W) * 30 + 15; v.ground.z = Math.floor(t / W) * 30 + 60; v.ground.yaw = yaw; v.ground.pitch = 0.35; }, [st, h, yaw]); await page.waitForTimeout(5000); await page.screenshot({ path: `shots/v63-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
