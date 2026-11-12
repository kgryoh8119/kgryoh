// v73：車とバスが左側通行を守っているか（数値で検査）＋交差点・行き止まり・バス路線の画面
// まっすぐ走っている車は、道の中心より進む向きの左にいること。向かい合う車が 2.2m 以内に近づかないこと
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, W = S.W; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; S.view.setQuality('high');
  S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5;
  // バス路線：道の上を幅優先でたどって、遠い 2 点を結ぶ
  const roads = []; for (let i = 0; i < s.road.length; i++) if (s.road[i]) roads.push(i);
  const a = roads[0], prev = new Map([[a, -1]]), q = [a]; let last = a;
  while (q.length) { const c = q.shift(); last = c; for (const d of [1, -1, W, -W]) { const n = c + d; if (n < 0 || n >= s.road.length || !s.road[n] || prev.has(n) || (Math.abs(d) === 1 && ((n / W) | 0) !== ((c / W) | 0))) continue; prev.set(n, c); q.push(n); } }
  const path = []; for (let c = last; c >= 0; c = prev.get(c)) path.push(c);
  s.pol = s.pol ?? {}; s.busStops = [...(s.busStops ?? []), a, last]; s.pol.routes = [{ a: last, b: a, freq: 3, path }];
  const ends = roads.filter(i => [1, -1, W, -W].filter(d => s.road[i + d]).length === 1), cross = roads.filter(i => [1, -1, W, -W].filter(d => s.road[i + d]).length >= 3);
  return { n: roads.length, pathLen: path.length, mid: path[(path.length / 2) | 0], end: ends[0], cross: cross[(cross.length / 2) | 0], types: [1, 2, 3].map(t => roads.filter(i => s.road[i] === t).length) }; });
console.log(JSON.stringify(info));
await page.evaluate(() => { const v = window.__sumu.view; v.hour = 8; }); await page.waitForTimeout(8000);
let bad = 0, tot = 0, minLat = 99, head = 0, busN = 0, over = 0, frames = 0;
for (let r = 0; r < 8; r++) {
  await page.evaluate(() => { window.__sumu.view.dbgVeh = []; }); await page.waitForTimeout(60);
  const d = await page.evaluate(() => { const v = window.__sumu.view, a = v.dbgVeh; v.dbgVeh = null; return a; });
  const T = 30, HLK = [2.2, 4.24, 4.24, 3.17, 3.17, 2.2, 2.2, 4.45, 4.45]; let P = [];
  const flush = () => { // 1 コマぶん：向かい合って近い組と、車体が重なっている組（同じ向きで、前後の間が車の長さより短い）
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j], ex = b[0] - a[0], ez = b[1] - a[1], dd = Math.hypot(ex, ez); if (dd > 12) continue; const dot = a[2] * b[2] + a[3] * b[3];
      if (dot < -0.7 && dd < 2.2) head++;
      if (dot > 0.9) { const along = Math.abs(ex * a[2] + ez * a[3]), lat = Math.abs(ex * a[3] - ez * a[2]); if (lat < 1.5 && along < HLK[a[4]] + HLK[b[4]] - 0.3) { over++; if (over < 5) console.log('重なり', along.toFixed(1), lat.toFixed(1), a[4], b[4]); } } }
    P = []; frames++; };
  for (let i = 0; i < d.length; i += 5) { if (d[i + 4] < 0) { if (P.length) flush(); continue; } const x = d[i], z = d[i + 1], dx = d[i + 2], dz = d[i + 3]; P.push([x, z, dx, dz, d[i + 4]]); if (d[i + 4] === 1) busN++;
    if (Math.max(Math.abs(dx), Math.abs(dz)) < 0.999) continue; const cx = (Math.floor(x / T) + 0.5) * T, cz = (Math.floor(z / T) + 0.5) * T, lat = (x - cx) * dz + (z - cz) * -dx; tot++; minLat = Math.min(minLat, lat); if (lat < 0.5) { bad++; if (bad < 6) console.log('右側/中央を走行', x.toFixed(1), z.toFixed(1), dx, dz, lat.toFixed(2)); } }
  if (P.length) flush();
  await page.waitForTimeout(800);
}
console.log(`直進の標本 ${tot}（うちバス標本 ${busN}）  中心より左でない ${bad}  いちばん中心寄り ${minLat.toFixed(2)}m  向かい合って 2.2m 以内 ${head}  車体の重なり ${over}（${frames} コマ）`);
let n = 0;
for (const [tile, d, p, yaw] of [[info.cross, 150, 0.75, 0.4], [info.mid, 70, 0.55, 0.8]]) {
  if (tile === undefined) continue;
  await page.evaluate(([tile, d, p, yaw]) => { const v = window.__sumu.view; v.focus(tile, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [tile, d, p, yaw]);
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v73-lane-${n++}.png` });
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
process.exit(bad || head || over ? 1 : 0);
