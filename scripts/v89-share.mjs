// v89：駅前のシェアモビリティのポートと、配達員の撮影。撮影のために車の一部を配達員（形 38・39）に替える。OUT、PRE、Q、HOUR、CAMD、YAW
import { open } from './shot.mjs';
const OUT = process.env.OUT ?? 'shots', PRE = process.env.PRE ?? 'share';
const { browser, page, errors } = await open(960, 600, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q[0]);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = q[1]; }, [process.env.Q ?? 'high', Number(process.env.HOUR ?? 12.5)]);
await page.waitForTimeout(3000);
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; const st = s.buildings.find(b => b.kind === 'station' && b.status === 'operating');
  let best = -1; if (st) { let bd = 1e9; for (let i = 0; i < s.road.length; i++) { if (s.road[i] !== 1 && s.road[i] !== 2) continue; const x = i % W, y = (i / W) | 0, d = Math.abs(x - st.x - st.w / 2) + Math.abs(y - st.y - st.h / 2); if (d < bd && d > 2) { bd = d; best = i; } } }
  return { best }; });
console.log(JSON.stringify(info));
await page.evaluate(([xi, d, yaw]) => { const v = window.__sumu.view; v.focus(xi, d); v.pitch = 0.5; v.yaw = yaw; v.spawnAgents(); v.cars.forEach((a, k) => { if (k % 4 === 0 && a.kind === 0) { a.vm = k % 8 ? 38 : 39; a.vc = [0x2a8a4a, 0xc8302a, 0x58b8d8, 0x1c1e22][k % 4 === 0 ? (k / 4) % 4 : 0]; } }); },
  [info.best, Number(process.env.CAMD ?? 60), Number(process.env.YAW ?? 0.6)]);
await page.waitForTimeout(12000); await page.screenshot({ path: `${OUT}/${PRE}.png` }); console.log('shot');
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
