// v54：五重塔・神社・観覧車・灯台の glb を撮る。NAME=接頭辞 ONLY=名前の一部
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v54';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(500000); await page.waitForTimeout(1500);
const r = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e9; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear';
  const st = s.buildings.find(b => b.kind === 'station') ?? s.buildings[0]; const out = { station: st.kind === 'station' ? (st.y) * S.W + st.x + 1 : -1 };
  for (const kind of ['temple', 'shrine', 'ferrisWheel', 'lighthouse']) { let at = -1;
    for (let rr = 4; rr < 40 && at < 0; rr++) for (let dy = -rr; dy <= rr && at < 0; dy++) for (let dx = -rr; dx <= rr && at < 0; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue; const x = st.x + dx, y = st.y + dy; const res = g.act({ type: 'build', kind, x, y }); if (res.ok) at = 1; }
    const b = s.buildings.find(b => b.kind === kind); if (!b && kind === 'lighthouse') { outer: for (let y = 2; y < S.W - 2; y += 1) for (let x = 2; x < S.W - 2; x += 1) { if (g.act({ type: 'build', kind, x, y }).ok) break outer; } }
    const b2 = s.buildings.find(b => b.kind === kind); if (b2 && !b) { b2.status = 'operating'; b2.remain = 0; out[kind] = b2.y * S.W + b2.x; }
    if (!b && !b2 && kind === 'lighthouse') { // 水辺の無い地図では、写真用に空き地へ直接置く
      let done = false;
      for (let rr = 6; rr < 40 && !done; rr++) for (let dy = -rr; dy <= rr && !done; dy++) for (let dx = -rr; dx <= rr && !done; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue; const x = st.x + dx, y = st.y + dy;
        const res = g.act({ type: 'build', kind: 'allotment', x, y }); if (res.ok) { const bb = s.buildings[s.buildings.length - 1]; bb.kind = 'lighthouse'; bb.status = 'operating'; bb.remain = 0; out[kind] = y * S.W + x; done = true; } } }
    if (!s.buildings.find(o => o.kind === kind)) out[kind + '_err'] = g.act({ type: 'build', kind, x: st.x + 5, y: st.y + 5 }).msg; if (b) { b.status = 'operating'; b.remain = 0; out[kind] = (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1); } }
  s.bVersion++; return out; });
console.log(JSON.stringify(r));
const ALL = [['temple', 10.5, 120, 'temple-day', 0.6, 0.38], ['shrine', 10.5, 70, 'shrine-day', 0.5, 0.4], ['shrine', 20.5, 70, 'shrine-night', 0.5, 0.4], ['ferrisWheel', 10.5, 130, 'ferris-day', 0.3, 0.15], ['ferrisWheel', 20.5, 130, 'ferris-night', 0.3, 0.15], ['lighthouse', 10.5, 70, 'lh-day', 0.5, 0.25], ['lighthouse', 21, 160, 'lh-night', 0.5, 0.35]];
const shots = process.env.ONLY ? ALL.filter(a => a[3].includes(process.env.ONLY)) : ALL;
for (const [k, h, d, n, yaw, pitch] of shots) { await page.evaluate(([t, h, d, yaw, pitch]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); v.yaw = yaw; v.pitch = pitch; }, [r[k], h, d, yaw, pitch]); await page.waitForTimeout(6000); await page.screenshot({ path: `shots/${NAME}-${n}.png` }); }
console.log(JSON.stringify(await page.evaluate(() => ({ lm: ['temple', 'shrine', 'ferrisWheel', 'lighthouse'].map(k => window.__sumu.view.landmarks?.has(k)) }))));
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
