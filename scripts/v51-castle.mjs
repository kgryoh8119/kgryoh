// v51：Blender で作った天守（glb）を置いて撮る。NAME=接頭辞
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v51';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(500000); await page.waitForTimeout(1500);
const r = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e9; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear';
  const st = s.buildings[0]; let res = null, at = -1, last = '';
  for (let rr = 3; rr < 30 && at < 0; rr++) for (let dy = -rr; dy <= rr && at < 0; dy++) for (let dx = -rr; dx <= rr && at < 0; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue; const x = st.x + dx, y = st.y + dy; res = g.act({ type: 'build', kind: 'castle', x, y }); last = res.msg; if (res.ok) at = y * S.W + x; }
  const b = s.buildings.find(b => b.kind === 'castle'); if (b) { b.status = 'operating'; b.remain = 0; } s.bVersion++;
  return { at: b ? (b.y + 2) * S.W + b.x + 2 : -1, last, lm: !!S.view.landmarks?.has('castle') }; });
console.log(JSON.stringify(r));
const ALL = [[10.5, 170, 'day', 0.55, 0.42], [10.5, 95, 'close', 0.2, 0.28], [16.8, 160, 'evening', 2.4, 0.35], [21, 150, 'night', 0.9, 0.38]], shots = process.env.ONLY ? ALL.filter(a => a[2] === process.env.ONLY) : ALL;
for (const [h, d, n, yaw, pitch] of shots) { await page.evaluate(([t, h, d, yaw, pitch]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); v.yaw = yaw; v.pitch = pitch; }, [r.at, h, d, yaw, pitch]); await page.waitForTimeout(6000); await page.screenshot({ path: `shots/${NAME}-${n}.png` }); }
console.log(JSON.stringify(await page.evaluate(() => ({ lm: !!window.__sumu.view.landmarks?.has('castle') }))));
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
