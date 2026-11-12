// v61：走る電車と車を近くで撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.weatherForce = 'clear'; S.view.hour = 10.5; S.view.clockRun = false; });
await page.waitForTimeout(4000);
for (let i = 0; i < 3; i++) {
  const ok = await page.evaluate((i) => { const v = window.__sumu.view, t = v.trains[i % v.trains.length]; if (!t) return false; const P = v.railPaths[t.path]; let j = 0; while (j < P.d.length - 1 && P.d[j] < t.d) j++;
    const x = P.p[j * 3], y = P.p[j * 3 + 1], z = P.p[j * 3 + 2]; v.focus(Math.floor(z / 30) * window.__sumu.W + Math.floor(x / 30), 45); v.pitch = 0.3; v.yaw = 0.9 + i; return true; }, i);
  if (!ok) break; await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v61-train${i}.png` });
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
