// v86：車・人・電車の前後比較用。DIST（配る dist）、NAME（before / after）、WHAT（car,ped,xing,train,fleet をカンマ区切り）、OUT（出力先）
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'after', WHAT = (process.env.WHAT ?? 'car,ped,xing,train').split(','), OUT = process.env.OUT ?? 'shots';
const { browser, page, errors } = await open(1000, 640, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality(window.__Q ?? 'mid');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 11; S.view.expEvery = 1; });
await page.waitForTimeout(4000);
const info = await page.evaluate(() => { const S = window.__sumu, v = S.view, s = S.game.state, W = S.W; const cars = v.rCars?.length ? v.rCars : v.cars;
  // まっすぐな東西の道（両隣も道）を探す
  let seg = -1; for (let i = 3; i < s.road.length - 3; i++) if (s.road[i] === 1 && s.road[i - 1] && s.road[i + 1] && !s.road[i - W] && !s.road[i + W] && s.road[i - 2] && s.road[i + 2]) { seg = i; break; }
  let cross = -1; for (let i = W + 1; i < s.road.length - W - 1; i++) if (s.road[i] && s.road[i - 1] && s.road[i + 1] && s.road[i - W] && s.road[i + W]) { cross = i; break; }
  return { seg, cross, nc: cars.length, np: (v.rPeds?.length ? v.rPeds : v.peds).length, trains: v.trains?.length ?? 0, calls: v.stats.calls, tris: v.stats.tris }; });
console.log(JSON.stringify(info));
const shot = async (n) => { await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/${NAME}-${n}.png` }); };
if (WHAT.includes('car') && info.seg >= 0) {
  // 同じ区間に車を 10 台並べて止め、近くから撮る
  await page.evaluate((seg) => { const v = window.__sumu.view, cars = v.cars.filter(a => !a.kind); const L = cars.slice(0, 10);
    L.forEach((a, k) => { a.cur = seg; a.next = seg + 1; a.prev = seg - 1; a.nn = seg + 2; a.t = 0.08 + (k >> 1) * 0.17; a.lane = k & 1; a.speed = 0; a.v = 0; a.yaw = Math.PI / 2; });
    v.focus(seg, 40); v.pitch = 0.32; v.yaw = 0.5; }, info.seg);
  await shot('car-1'); await page.evaluate(() => { const v = window.__sumu.view; v.yaw = 2.4; v.pitch = 0.2; v.dist = 24; }); await shot('car-2');
}
if (WHAT.includes('xing') && info.cross >= 0) {
  await page.evaluate((c) => { const v = window.__sumu.view; v.focus(c, 110); v.pitch = 0.55; v.yaw = 0.4; }, info.cross); await shot('xing');
}
if (WHAT.includes('ped')) {
  await page.evaluate(() => { const v = window.__sumu.view; const P = v.peds; const a = P.find(a => a.L && !a.lead) ?? P[0]; v.focus(a.cur, 20); });
  await page.waitForTimeout(500); await page.evaluate(() => window.__sumu.view.setMode('ground')); await page.waitForTimeout(1200);
  await page.evaluate(() => { const v = window.__sumu.view; let best = 0, bd = 1e9; const m = new v.tmpM.constructor(), e = m.elements;
    for (let k = 0; k < Math.min(v.pedP.mesh.count, 200); k++) { v.pedP.mesh.getMatrixAt(k, m); const d = Math.hypot(e[12] - v.ground.x, e[14] - v.ground.z); if (d < bd) { bd = d; best = k; } }
    v.pedP.mesh.getMatrixAt(best, m); const px = e[12], pz = e[14], fx = e[8], fz = e[10], L = Math.hypot(fx, fz) || 1, d = 6;
    v.ground.x = px + (fx / L) * d * 0.7 + (fz / L) * d * 0.7; v.ground.z = pz + (fz / L) * d * 0.7 - (fx / L) * d * 0.7; v.ground.yaw = Math.atan2(px - v.ground.x, pz - v.ground.z); v.ground.pitch = -0.08; });
  await shot('ped');
  await page.evaluate(() => window.__sumu.view.setMode('orbit'));
}
if (WHAT.includes('train') && info.trains > 0) {
  await page.evaluate(() => { const S = window.__sumu, v = S.view, t = v.trains[0]; const P = v.railPaths[t.path]; let j = 0; while (j < P.d.length - 1 && P.d[j] < t.d) j++;
    const x = P.p[j * 3], z = P.p[j * 3 + 2]; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), 42); v.pitch = 0.25; v.yaw = 0.8; });
  await shot('train');
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
