// 見た目の全体確認：街の中心を 3 つの距離から（NAME=出力名の頭、HOUR=時刻、VIEWS=撮る番号）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, process.env.MAP ?? 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const t = await page.evaluate((hour) => { const S = window.__sumu, g = S.game, s = g.state, v = S.view; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = hour; S.ui.refresh();
  const st = s.buildings.find(b => b.kind === 'station'); return st ? (st.y + 5) * S.W + st.x + 2 : (S.W * 20 + 20); }, +(process.env.HOUR ?? 10.5));
await page.waitForTimeout(7000);
const V = [[320, 0.42, 0.5, 0], [900, 0.6, -0.4, 0], [130, 0.2, 2.2, 3], [200, 0.3, 1.1, -2], [30, 0.42, 2.2, 3], [500, 0.04, 0.5, 0], [22, 0.3, 0.6, 123]], pick = (process.env.VIEWS ?? '0,1,2').split(',').map(Number);
for (const k of pick) { const [d, p, yaw, o] = V[k];
  await page.evaluate(([t, d, p, yaw]) => { const v = window.__sumu.view; v.focus(t, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [t + o, d, p, yaw]);
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/${process.env.NAME ?? 'look'}-${k}.png` }); }
console.log(JSON.stringify(await page.evaluate(() => window.__sumu.view.stats)), errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
