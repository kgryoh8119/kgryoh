// v73：新幹線の高架が坂で段にならず、なめらかにつながっているか（地形ごと）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const T = (process.env.T ?? 'mountain,inland').split(',');
const IDS = ['coast', 'inland', 'rural', 'river', 'lake', 'mountain', 'urban', 'island'];
for (const id of T) {
  const k = IDS.indexOf(id), seed = k === 0 ? 20261011 : 2e9 + k * 1e6 + 261011;
  const info = await page.evaluate(([seed, hill]) => { const S = window.__sumu, g = S.game; g.reset({ seed }); const s = g.state; s.tutorial.done = true; s.goalPick = false; s.month = 2; S.fixedQuality = true; S.view.setQuality('high');
    const st = s.buildings.find(b => b.kind === 'station'); if (st) st.shin = 0;
    S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; g.speed = 0;
    return st ? { x: st.x, y: st.y, w: st.w, h: st.h } : null; }, [seed, !!process.env.HILL]);
  console.log(id, JSON.stringify(info)); if (!info) continue;
  await page.waitForTimeout(5000);
  // HILL=1：線の先に山を盛って、トンネルの口を確かめる（検査のためだけに地形を書き換えて、作り直させる）
  if (process.env.HILL) { await page.evaluate((st) => { const S = window.__sumu, v = S.view, h = v.map.heights, w1 = S.W + 1; for (let y = 0; y <= 12; y++) for (let x = st.x + 8; x <= st.x + 22; x++) { const d = Math.min(x - st.x - 8, st.x + 22 - x) / 5; h[y * w1 + x] += 45 * Math.min(1, d); } v.map = null; }, info); await page.waitForTimeout(6000); }
  let n = 0;
  for (const [d, p, yaw, ox, oy] of process.env.HILL ? [[900, 0.45, 0.5, 10, 0], [300, 0.12, 0, 8, 0], [200, 0.2, 0.9, 8, 1], [300, 0.12, 0, 22, 0]] : [[1500, 0.5, 0.6, 0, 0], [420, 0.1, 0, 14, 0], [420, 0.1, 0, -14, 0], [420, 0.1, 1.57, 0, 14], [420, 0.1, 1.57, 0, -14], [420, 0.1, 0, 26, 0], [420, 0.1, 1.57, 0, 26], [420, 0.1, 0, -26, 0], [420, 0.1, 1.57, 0, -26]]) {
    await page.evaluate(([d, p, yaw, fx, fy]) => { const S = window.__sumu, v = S.view; v.focus(Math.max(0, Math.min(S.W - 1, fy)) * S.W + Math.max(0, Math.min(S.W - 1, fx)), d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [d, p, yaw, info.x + ox, info.y + oy]);
    await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v73-shin-${id}-${n++}.png` });
  }
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
