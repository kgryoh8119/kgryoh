// v70：8 つの地形を上から撮る（地形ごとの特色が出ているか）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const T = (process.env.T ?? 'coast,inland,rural,river,lake,mountain,urban,island').split(',');
const IDS = ['coast', 'inland', 'rural', 'river', 'lake', 'mountain', 'urban', 'island'];
for (const id of T) {
  const k = IDS.indexOf(id), seed = k === 0 ? 20261011 : 2e9 + k * 1e6 + 261011;
  await page.evaluate(([seed]) => { const S = window.__sumu, g = S.game; g.reset({ seed }); const s = g.state; s.tutorial.done = true; s.goalPick = false; s.month = 2; S.fixedQuality = true; S.view.setQuality('high');
    S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; g.speed = 0; }, [seed]);
  await page.waitForTimeout(5000);
  for (const [n, d, p, yaw, fx, fy] of [['a', 2300, 0.62, 0.55, 38, 34], ['b', 900, 0.38, 0.9, 52, 36], ['c', 700, 0.16, 1.57, 40, 34], ['d', 600, 0.22, 3.14, 40, 58]]) {
    await page.evaluate(([d, p, yaw, fx, fy]) => { const S = window.__sumu, v = S.view; v.focus(fy * S.W + fx, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [d, p, yaw, fx, fy]);
    await page.waitForTimeout(3500); await page.screenshot({ path: `shots/v70-${id}-${n}.png` });
  }
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
