// v87：渋滞・満員の駅・緊急出動の撮影。WHAT（jam,station,train,em をカンマ区切り）、OUT（出力先）。状態は撮影のために直接書き換える（保存はしない）
import { open } from './shot.mjs';
const WHAT = (process.env.WHAT ?? 'jam,station,train,em').split(','), OUT = process.env.OUT ?? 'shots';
const { browser, page, errors } = await open(960, 600, 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality('mid');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 8; });
await page.waitForTimeout(3000);
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; let wi = -1, wv = -1; for (let i = 0; i < s.road.length; i++) if (s.road[i] && s.road[i] !== 3 && s.vc[i] > wv) { wv = s.vc[i]; wi = i; }
  const st = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating'); return { wi, wv, maxVc: s.stats.maxVc, stations: st.length, st0: st[0] ? st[0].y * W + st[0].x : -1, trains: S.view.trains?.length ?? 0, crime: s.stats.crime, pop: s.stats.pop }; });
console.log(JSON.stringify(info));
const shot = async (n, wait = 6000) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };
if (WHAT.includes('jam') && info.wi >= 0) {
  // いちばん混む道のまわり 9 区画の道を混雑率 1.7 に（朝 8 時）
  const c = await page.evaluate((wi) => { const S = window.__sumu, s = S.game.state, v = S.view, W = S.W, x0 = wi % W, y0 = (wi / W) | 0;
    for (let i = 0; i < s.road.length; i++) if (s.road[i]) { const d = Math.abs(i % W - x0) + Math.abs(((i / W) | 0) - y0); s.vc[i] = d < 9 ? 1.7 : 0.35; }
    v.focus(wi, 150); v.pitch = 0.5; v.yaw = 0.7; v.spawnAgents(); return v.cars.length; }, info.wi);
  console.log('cars', c); await shot('jam', 20000);
}
if (WHAT.includes('station') && info.st0 >= 0) {
  // 駅勢圏の世帯を 8 倍にして混雑率を上げる（stationStats の作り直しは bVersion で）
  const cr = await page.evaluate((t) => { const S = window.__sumu, s = S.game.state, v = S.view; for (const b of s.buildings) if (b.hh) for (let k = 0; k < b.hh.length; k++) b.hh[k] *= 8; s.bVersion++;
    v.focus(t, 110); v.pitch = 0.6; v.yaw = 2.2; return 0; }, info.st0);
  await shot('station', 15000);
}
if (WHAT.includes('train') && info.trains > 0) {
  await page.evaluate(() => { const S = window.__sumu, v = S.view, t = v.trains.find(t => t.wait <= 0) ?? v.trains[0]; t.wait = 0; const P = v.railPaths[t.path]; let j = 0; while (j < P.d.length - 1 && P.d[j] < t.d) j++;
    const x = P.p[j * 3], z = P.p[j * 3 + 2]; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), 34); v.pitch = 0.18; v.yaw = 0.9; v.trains.forEach(t => { t.wait = 30; }); });
  await shot('train', 9000);
}
if (WHAT.includes('em')) {
  const r = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, v = S.view, W = S.W;
    const res = s.buildings.filter(b => b.status === 'operating' && b.hh && b.kind !== 'station'); const b = res[(res.length * 0.6) | 0]; if (!b) return null;
    for (let i = 0; i < s.vc.length; i++) s.vc[i] = Math.min(s.vc[i], 0.9);
    const n = v.dispatch(s, [2, 2, 1, 0], b.y * W + b.x); v.focus(b.y * W + b.x, 150); v.pitch = 0.55; v.yaw = 0.6; v.spawnAgents();
    // 撮影用に、出動した車を現場の手前まで進める
    v.ems.forEach((a, k) => { const e = a.em; e.wait = 0; e.i = Math.max(0, e.r.length - 2 - (k === 0 ? 0 : 2 + k)); a.t = k === 0 ? 0.46 : 0.3; e.at = k === 0; v.emRoute(a, e); });
    return { n, bid: b.id, kind: b.kind, routes: v.ems.map(a => a.em.r.length) }; });
  console.log(JSON.stringify(r)); await shot('em', 15000);
  await page.evaluate(() => { const v = window.__sumu.view; v.ems.forEach((a, k) => { const e = a.em, pos = Math.max(0, e.r.length - 2 + 0.46 - 0.4 * k); e.i = Math.floor(pos); a.t = pos - e.i; e.at = true; e.stay = 60; v.emRoute(a, e); }); v.dist = 70; v.want.dist = 70; v.pitch = 0.4; }); await shot('em-site', 12000);
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
