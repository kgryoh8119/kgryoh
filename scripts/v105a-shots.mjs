// v105a：線路の形ごとの駅の段・赤れんがの駅・公園の段・夜を撮る。node scripts/v105a-shots.mjs（先に npx vite build）。
//   WHAT=layout,heritage,park,night  OUT=docs/shots/v105a  Q=high  ONLY=single-g1,…（撮る場面を絞る）
//   layout：住野市の中心の駅のまわりの線路を、単線・複々線・高架・地下に書きかえ、新幹線の駅にもして、段を切り替えて撮る（view.stGradeForce）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v105a', WHAT = (process.env.WHAT ?? 'layout,heritage,park,night').split(','), RAW = `${OUT}/raw`, ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
fs.mkdirSync(RAW, { recursive: true });
const { browser, page, errors } = await open(1000, 680, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(1800000); await page.waitForTimeout(2500);
await page.evaluate(q => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {}; v.hour = 10; v.applyTime?.();
  // 元の線路を覚えておく
  window.__rail0 = s.rail.slice(); window.__grade0 = (s.railGrade ?? []).slice(); }, process.env.Q ?? 'high');
const cam = (x, z, d, pitch, yaw) => page.evaluate(([x, z, d, p, y]) => { const v = window.__sumu.view; Object.assign(v.want, { x, z, dist: d, pitch: p, yaw: y }); v.target.x = x; v.target.z = z; v.dist = d; v.pitch = p; v.yaw = y; }, [x, z, d, pitch, yaw]);
const shoot = async name => { await page.evaluate(() => { const v = window.__sumu.view; for (let k = 0; k < 6; k++) v.__frame.call(v, 0.05); v.renderer.render(v.scene, v.camera); });
  await page.screenshot({ path: `${RAW}/${name}.jpg`, type: 'jpeg', quality: 82 }); console.log('shot', name); };
const want = n => !ONLY || ONLY.includes(n);

// 中心の駅
const st = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, v = S.view; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05);
  let x = 0, y = 0, n = 0; for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = x / n, cy = y / n, b = s.buildings.filter(b => b.kind === 'station' && v.stSpots.some(o => o.id === b.id && o.pts.length)).sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
  return { id: b.id, x: b.x, y: b.y, w: b.w, h: b.h }; });
console.log('station', st);
/** 線路を書きかえる：駅から r 区画以内の線路の lv（1 単線・2 複線・3 複々線）と高さ（0 地上・1 高架・2 地下）。shin：新幹線 */
const setRail = (lv, gr, shin = false, r = 14) => page.evaluate(([id, lv, gr, shin, r]) => { const S = window.__sumu, s = S.game.state, v = S.view, W = S.W, b = s.buildings.find(o => o.id === id);
  s.rail = window.__rail0.slice(); s.railGrade = window.__grade0.slice();
  for (let i = 0; i < s.rail.length; i++) if (s.rail[i]) { const x = i % W, y = (i / W) | 0, d = Math.max(Math.abs(x - (b.x + b.w / 2)), Math.abs(y - (b.y + b.h / 2)));
    if (lv && d <= r + 6) s.rail[i] = lv; if (gr !== null && d <= r) s.railGrade[i] = gr; }
  if (shin) b.shin = 0; else delete b.shin;
  s.roadVersion++; v.sigRoad = ''; for (let k = 0; k < 3; k++) v.__frame.call(v, 0.05); }, [st.id, lv, gr, shin, r]);
const center = () => page.evaluate(id => { const v = window.__sumu.view, s = window.__sumu.game.state, sp = v.stSpots.find(o => o.id === id); if (sp && sp.pts.length) { let x = 0, z = 0, n = 0; for (let i = 0; i < sp.pts.length; i += 3) { x += sp.pts[i]; z += sp.pts[i + 2]; n++; } return { x: x / n, z: z / n }; }
  const b = s.buildings.find(o => o.id === id); return { x: (b.x + b.w / 2) * 30, z: (b.y + b.h / 2) * 30 }; }, st.id);
const grade = gr => page.evaluate(gr => { const v = window.__sumu.view; v.stGradeForce = gr; v.sigRoad = ''; v.sigTown = ''; for (let k = 0; k < 3; k++) v.__frame.call(v, 0.05); }, gr);

if (WHAT.includes('layout')) {
  // [名前, lv, 高さ, 新幹線, 段の並び, 距離]
  const L = [['single', 1, null, false, [1, 2]], ['quad', 3, null, false, [1, 3]], ['elev', 0, 1, false, [0, 2, 4]], ['under', 0, 2, false, [1, 3, 4]], ['shin', 0, null, true, [2]]];
  for (const [nm, lv, gr, shin, gs] of L) {
    if (!gs.some(g => want(`${nm}-g${g}`))) continue;
    await setRail(lv, gr, shin);
    for (const g of gs) { if (!want(`${nm}-g${g}`)) continue; await grade(g); const c = await center();
      await cam(c.x, c.z, g >= 3 || shin ? 230 : 150, 0.55, 0.75); await shoot(`${nm}-g${g}`);
      if (nm === 'elev' || nm === 'shin' || (nm === 'quad' && g === 3)) { await cam(c.x, c.z, g >= 3 || shin ? 200 : 120, 0.42, 0.75 + Math.PI); await shoot(`${nm}-g${g}-back`); } }
  }
  await setRail(0, null, false);
}
if (WHAT.includes('heritage')) {
  await setRail(0, null, false); await grade(5); const c = await center();
  if (want('heritage')) { await cam(c.x, c.z, 260, 0.45, 0.75); await shoot('heritage'); }
  if (want('heritage-back')) { await cam(c.x, c.z, 240, 0.45, 0.75 + Math.PI); await shoot('heritage-back'); }
  if (want('modern')) { await grade(4); await cam(c.x, c.z, 260, 0.45, 0.75); await shoot('modern'); }
}
if (WHAT.includes('park')) {
  const spot = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W, H = s.road.length / W;
    const st = s.buildings.find(b => b.kind === 'station'); let best = null, bd = 1e9;
    for (let y = 4; y < H - 10; y++) for (let x = 2; x < W - 12; x++) { let ok = true; for (let dy = -1; dy < 2 && ok; dy++) for (let dx = -1; dx < 6 && ok; dx++) { const i = (y + dy) * W + x + dx; if (s.road[i] || s.occ[i] || s.rail?.[i] || s.water?.[i]) ok = false; }
      if (!ok) continue; let rd = false; for (let dy = -2; dy < 4 && !rd; dy++) for (let dx = -2; dx < 7 && !rd; dx++) if (s.road[(y + dy) * W + x + dx]) rd = true; if (!rd) continue; // 道路ぞいの空き地（林の中は避ける）
      const d = Math.hypot(x - st.x, y - st.y); if (d < bd && d > 8) { bd = d; best = { x, y }; } }
    return best; });
  // 3 段の公園を横に並べて、ふつうの距離から 1 枚に
  await page.evaluate(([sx, sy]) => { const S = window.__sumu, s = S.game.state, v = S.view, W = S.W;
    document.querySelectorAll('.toast, #toast, .note').forEach(e => e.style.display = 'none');
    [1, 3, 5].forEach((lv, k) => { const id = 9900010 + k, x = sx + 1 + k; s.occ[sy * W + x] = id; s.buildings.push({ id, kind: 'park', x, y: sy, w: 1, h: 1, status: 'operating', remain: 0, total: 1, builtMonth: s.month, age: 5, v: 0.37, lv, acc: -1, connected: true, effCap: 0, used: 0, revenue: 0, shopP: 0, sv: [], sat: [], unmet: 0 }); });
    s.bVersion++; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05); }, [spot.x, spot.y]);
  const cx = (spot.x + 2.5) * 30, cz = (spot.y + 0.5) * 30;
  if (want('parks-far')) { await cam(cx, cz, 380, 0.7, 0.55); await shoot('parks-far'); }
  if (want('parks-near')) { await cam(cx, cz, 150, 0.6, 0.55); await shoot('parks-near'); }
}
if (WHAT.includes('night')) {
  const night = h => page.evaluate(h => { const v = window.__sumu.view; v.hour = h; v.applyTime?.(); }, h);
  await setRail(0, null, false); await grade(null); let c = await center();
  if (want('night-front')) { await night(20); await cam(c.x, c.z, 170, 0.5, 0.75); await shoot('night-front'); }
  if (want('night-g4')) { await grade(4); await night(20); await cam(c.x, c.z, 260, 0.45, 0.75); await shoot('night-g4'); }
  if (want('night-g5')) { await grade(5); await night(20); await cam(c.x, c.z, 260, 0.45, 0.75); await shoot('night-g5'); }
  if (want('night-res')) { await grade(null); const r = await page.evaluate(() => { const s = window.__sumu.game.state; const hs = s.buildings.filter(b => b.kind === 'house'); let x = 0, y = 0; for (const b of hs) { x += b.x; y += b.y; } return { x: x / hs.length * 30, z: y / hs.length * 30 }; });
    await night(20); await cam(r.x, r.z, 160, 0.45, 0.4); await shoot('night-res'); await night(10); await shoot('day-res'); }
}
console.log('errors', JSON.stringify(errors.filter(e => !e.includes('404') && !e.includes('TUNNEL')).slice(0, 5)));
await browser.close();
