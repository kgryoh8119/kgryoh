// v77：駅のホーム（屋根・柵・ベンチ・駅名標）を近くから
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const t = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, v = S.view; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 11; S.ui.refresh();
  const st = s.buildings.find(b => b.kind === 'station'); return (st.y) * S.W + st.x + 1; });
await page.waitForTimeout(6000);
let n = 0; for (const [d, p, yaw] of [[90, 0.5, 0.35], [45, 0.3, 2.6]]) {
  await page.evaluate(([t, d, p, yaw]) => { const v = window.__sumu.view; v.focus(t, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [t, d, p, yaw]);
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v77-platform-${n++}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
