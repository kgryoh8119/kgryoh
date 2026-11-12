// v59：Blender の木を撮る（公園・街路樹・森）。NAME=接頭辞 MONTH=月
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v59';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const r = await page.evaluate((mon) => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; g.speed = 0; if (mon) S.view.calM = mon;
  const st = s.buildings.find(b => b.kind === 'station'); let park = null;
  for (let rr = 3; rr < 30 && !park; rr++) for (let dy = -rr; dy <= rr && !park; dy += 2) for (let dx = -rr; dx <= rr && !park; dx += 2) { if (g.act({ type: 'build', kind: 'parkL', x: st.x + dx, y: st.y + dy }).ok) park = s.buildings[s.buildings.length - 1]; }
  if (park) { park.status = 'operating'; park.remain = 0; } s.bVersion++;
  return { park: park ? (park.y + 1) * S.W + park.x + 1 : -1, st: st.y * S.W + st.x, edge: 3 * S.W + 3 }; }, Number(process.env.MONTH ?? 0));
console.log(JSON.stringify(r));
for (const [t, d, n, yaw, pitch] of [[r.park, 70, 'park', 0.5, 0.35], [r.park, 34, 'close', 0.7, 0.2], [r.st, 200, 'town', 0.6, 0.5], [r.edge, 160, 'forest', 0.4, 0.4]]) {
  await page.evaluate(([t, d, yaw, pitch]) => { const v = window.__sumu.view; v.hour = 10.5; v.focus(t, d); v.yaw = yaw; v.pitch = pitch; }, [t, d, yaw, pitch]); await page.waitForTimeout(5000);
  await page.screenshot({ path: `shots/${NAME}-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
