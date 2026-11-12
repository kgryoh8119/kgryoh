// v52：駅舎・展望タワー・スタジアムの glb を撮る。NAME=接頭辞 ONLY=名前の一部
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v52';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(500000); await page.waitForTimeout(1500);
const r = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e9; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear';
  const st = s.buildings.find(b => b.kind === 'station') ?? s.buildings[0]; const out = { station: st.kind === 'station' ? (st.y) * S.W + st.x + 1 : -1 };
  for (const kind of ['tower', 'stadium']) { let at = -1;
    for (let rr = 4; rr < 40 && at < 0; rr++) for (let dy = -rr; dy <= rr && at < 0; dy++) for (let dx = -rr; dx <= rr && at < 0; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue; const x = st.x + dx, y = st.y + dy; const res = g.act({ type: 'build', kind, x, y }); if (res.ok) at = 1; }
    const b = s.buildings.find(b => b.kind === kind); if (b) { b.status = 'operating'; b.remain = 0; out[kind] = (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1); } }
  s.bVersion++; return out; });
console.log(JSON.stringify(r));
const ALL = [['station', 10.5, 110, 'station-day', 0.5, 0.35], ['station', 21, 110, 'station-night', 0.5, 0.35], ['tower', 10.5, 260, 'tower-day', 0.6, 0.18], ['tower', 21, 260, 'tower-night', 0.6, 0.18], ['stadium', 10.5, 220, 'stadium-day', 0.5, 0.55], ['stadium', 21, 220, 'stadium-night', 0.5, 0.55]];
const shots = process.env.ONLY ? ALL.filter(a => a[3].includes(process.env.ONLY)) : ALL;
for (const [k, h, d, n, yaw, pitch] of shots) { await page.evaluate(([t, h, d, yaw, pitch]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); v.yaw = yaw; v.pitch = pitch; }, [r[k], h, d, yaw, pitch]); await page.waitForTimeout(6000); await page.screenshot({ path: `shots/${NAME}-${n}.png` }); }
console.log(JSON.stringify(await page.evaluate(() => ({ lm: ['castle', 'station', 'tower', 'stadium'].map(k => window.__sumu.view.landmarks?.has(k)) }))));
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
