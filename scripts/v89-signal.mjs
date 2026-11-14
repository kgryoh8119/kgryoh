// v89：信号の灯の撮影。同じ交差点を、周期をずらして 2 枚（A：東西が青／B：南北が青）。OUT（出力先）、PRE、Q（品質）、HOUR、DIST
import { open } from './shot.mjs';
const OUT = process.env.OUT ?? 'shots', PRE = process.env.PRE ?? 'sig';
const { browser, page, errors } = await open(960, 600, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q[0]);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = q[1]; }, [process.env.Q ?? 'high', Number(process.env.HOUR ?? 17)]);
await page.waitForTimeout(3000);
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, v = S.view, g = v.signals(s); let xi = -1, best = -1;
  for (let i = 0; i < s.road.length; i++) if (g[i] && s.vc[i] > best) { best = s.vc[i]; xi = i; }
  return { xi, n: g.reduce((a, b) => a + b, 0), lamps: v.sigData.length / 7 }; });
console.log(JSON.stringify(info));
await page.evaluate(([xi, d, yaw]) => { const v = window.__sumu.view; v.focus(xi, d); v.pitch = 0.42; v.yaw = yaw; v.spawnAgents(); }, [info.xi, Number(process.env.DIST ?? 45), Number(process.env.YAW ?? 0.6)]);
for (const [n, t] of [['A', 13], ['B', 31]]) {
  await page.evaluate((t) => { window.__sumu.view.lifeT = 36 * 20 + t - 9; }, t); // 少し前から走らせて、赤で止まる車を溜める
  await page.waitForTimeout(9000);
  const lt = await page.evaluate((t) => { const v = window.__sumu.view, b = v.lifeT % 36; v.lifeT = 36 * 20 + t; return b; }, t);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${PRE}${n}.png` }); const fin = await page.evaluate(() => window.__sumu.view.lifeT % 36); console.log('shot', n, lt.toFixed(1), fin.toFixed(1));
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
