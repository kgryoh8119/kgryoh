// v104b：駅と施設の見た目のグレードを撮る。node scripts/v104b-shots.mjs（先に npx vite build）。
//   WHAT=station,fac  OUT=docs/shots/v104b  Q=high
//   station：街の中心に近い駅を、段 0〜4（と赤れんがの駅舎）に切り替えて、同じ角度から撮る（view.stGradeForce）
//   fac：空き地に施設を 1 つずつ置き、lv と人口を変えて 3 段を撮る
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v104b', WHAT = (process.env.WHAT ?? 'station,fac').split(','), RAW = `${OUT}/raw`;
fs.mkdirSync(RAW, { recursive: true });
const { browser, page, errors } = await open(1000, 680, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(2500);
await page.evaluate(q => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {}; v.hour = 10; v.applyTime?.(); }, process.env.Q ?? 'high');
const cam = (x, z, d, pitch, yaw) => page.evaluate(([x, z, d, p, y]) => { const v = window.__sumu.view; Object.assign(v.want, { x, z, dist: d, pitch: p, yaw: y }); v.target.x = x; v.target.z = z; v.dist = d; v.pitch = p; v.yaw = y; }, [x, z, d, pitch, yaw]);
const shoot = async name => { await page.evaluate(() => { const v = window.__sumu.view; for (let k = 0; k < 6; k++) v.__frame.call(v, 0.05); v.renderer.render(v.scene, v.camera); });
  await page.screenshot({ path: `${RAW}/${name}.jpg`, type: 'jpeg', quality: 82 }); console.log('shot', name); };

if (WHAT.includes('station')) {
  const ids = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, v = S.view; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05);
    let x = 0, y = 0, n = 0; for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
    const cx = x / n, cy = y / n;
    return s.buildings.filter(b => b.kind === 'station' && v.stSpots.some(o => o.id === b.id && o.pts.length)).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy)).map(b => b.id); });
  console.log('stations', ids);
  if (process.env.OVER) { const c = await page.evaluate(id => { const v = window.__sumu.view, sp = v.stSpots.find(o => o.id === id); return { x: sp.pts[0], z: sp.pts[2] }; }, ids[0]); await cam(c.x, c.z, 420, 1.2, 0); await shoot('overview'); }
  for (const [si, id] of ids.slice(0, Number(process.env.NST ?? 2)).entries()) {
    for (const gr of (process.env.GR ?? '0,1,2,3,4,5').split(',').map(Number)) {
      const c = await page.evaluate(([id, gr]) => { const v = window.__sumu.view; v.stGradeForce = gr; v.sigRoad = ''; for (let k = 0; k < 3; k++) v.__frame.call(v, 0.05);
        const sp = v.stSpots.find(o => o.id === id); let x = 0, z = 0, n = 0; for (let i = 0; i < sp.pts.length; i += 3) { x += sp.pts[i]; z += sp.pts[i + 2]; n++; } return { x: x / n, z: z / n, bld: !!sp.bld }; }, [id, gr]);
      if (gr === 5 && !c.bld) { console.log('heritage glb not placed'); }
      const yaw = Number(process.env.YAW ?? 0.75) + si * 1.6;
      await cam(c.x, c.z, gr >= 3 ? 230 : 150, gr >= 3 ? 0.5 : 0.62, yaw); await shoot(`st${si}-g${gr}`);
      if (si === 0) { await cam(c.x, c.z, gr >= 3 ? 200 : 120, 0.55, yaw + Math.PI); await shoot(`st${si}-g${gr}-back`); }
    }
  }
  await page.evaluate(() => { const v = window.__sumu.view; v.stGradeForce = null; v.sigRoad = ''; });
}

if (WHAT.includes('fac')) {
  // 空き地（道も建物も無い 6×4 区画）を街の外れに探す
  const spot = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W, H = s.road.length / W;
    const st = s.buildings.find(b => b.kind === 'station'); let best = null, bd = 1e9;
    for (let y = 4; y < H - 10; y++) for (let x = 2; x < W - 8; x++) { let ok = true; for (let dy = -1; dy < 5 && ok; dy++) for (let dx = -1; dx < 7 && ok; dx++) { const i = (y + dy) * W + x + dx; if (s.road[i] || s.occ[i] || s.rail?.[i] || s.water?.[i]) ok = false; }
      if (!ok) continue; const d = Math.hypot(x - st.x, y - st.y); if (d < bd && d > 8) { bd = d; best = { x, y }; } }
    return best; });
  console.log('fac spot', spot);
  const FAC = [['school', 3, 2, [[1, 1500], [3, 50000], [5, 50000]]], ['hospital', 3, 2, [[1, 50000], [3, 50000], [5, 50000]]], ['koban', 1, 1, [[1, 1500], [2, 50000], [5, 50000]]],
    ['police', 2, 2, [[1, 50000], [3, 50000], [5, 50000]]], ['fire', 1, 1, [[1, 1500], [2, 50000], [5, 50000]]], ['cityHall', 3, 2, [[1, 5000], [2, 50000], [5, 50000]]], ['park', 1, 1, [[1, 50000], [3, 50000], [5, 50000]]]];
  for (const [kind, w, h, steps] of FAC) {
    for (const [gi, [lv, pop]] of steps.entries()) {
      await page.evaluate(([kind, w, h, lv, pop, sx, sy]) => { const S = window.__sumu, s = S.game.state, v = S.view;
        s.buildings = s.buildings.filter(b => b.id !== 9900001); const W = S.W; for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 3; dx++) s.occ[(sy + dy) * W + sx + 1 + dx] = 0; for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) s.occ[(sy + dy) * W + sx + 1 + dx] = 9900001; // 敷地に畑を描かない
        document.querySelectorAll('.toast, #toast, .note').forEach(e => e.style.display = 'none');
        s.buildings.push({ id: 9900001, kind, x: sx + 1, y: sy, w, h, status: 'operating', remain: 0, total: 1, builtMonth: s.month, age: 5, v: 0.37, lv, acc: -1, connected: true, effCap: 0, used: 0, revenue: 0, shopP: 0, sv: [], sat: [], unmet: 0 });
        s.stats.pop = pop; s.bVersion++; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05); }, [kind, w, h, lv, pop, spot.x, spot.y]);
      const cx = (spot.x + 1 + w / 2) * 30, cz = (spot.y + h / 2) * 30, d = 70 + 32 * Math.max(w, h);
      await cam(cx, cz, d, 0.62, 0.55); await shoot(`fac-${kind}-${gi}`);
    }
  }
}
console.log('errors', JSON.stringify(errors.filter(e => !e.includes('404') && !e.includes('TUNNEL')).slice(0, 5)));
await browser.close();
