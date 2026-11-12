// v76：高架の分岐（本線から枝が分かれる所）で、桁の高さ・色・防音壁がきれいにつながるか
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, W = S.W, v = S.view; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 11; g.speed = 0;
  // 東西に走る線路の区画をさがし、その一部を高架にして、途中から南へ高架の枝を出す（検査のために状態を直接書き換える）
  const row = []; for (let i = 0; i < s.rail.length; i++) if (s.rail[i] && s.rail[i - 1] && s.rail[i + 1]) row.push(i);
  const st = s.buildings.find(b => b.kind === 'station'), far = row.filter(i => Math.abs((i % W) - st.x) > 14).sort((a, b) => a - b), mid = far[Math.floor(far.length / 2)];
  const y = (mid / W) | 0, x = mid % W, dir = y > 20 ? -1 : 1;
  for (let k = -7; k <= 7; k++) { const i = mid + k; if (s.rail[i]) s.railGrade[i] = 1; }
  for (let k = 1; k <= 9; k++) { const i = mid + dir * k * W; s.rail[i] = 2; s.railGrade[i] = k <= 5 ? 1 : 0; s.road[i] = 0; s.zone[i] = 0; }
  s.roadVersion++; S.ui.refresh(); return { mid, x, y, dir, n: row.length }; });
console.log(JSON.stringify(info)); await page.waitForTimeout(8000);
let n = 0; for (const [d, p, yaw] of [[95, 0.62, 0.5], [80, 0.45, 2.3], [150, 0.3, 1.2]]) {
  await page.evaluate(([t, d, p, yaw]) => { const v = window.__sumu.view; v.focus(t, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [info.mid, d, p, yaw]);
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v76-junc-${n++}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
