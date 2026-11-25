// v95：歩道と車道の形を、平らな空き地に引いた試験用の道路網で同じ視点から撮る（NAME=出力名の頭、VIEWS=撮る番号、Q=品質）
// 0 国道×2 車線(拡幅)の十字・1 国道×国道の十字・2 国道の T 字（拡幅した 2 車線へ）・3 生活道路の十字・4 拡幅の 2 車線×2 車線・5 行き止まり・6 俯瞰
import { open } from './shot.mjs';
const { browser, page, errors } = await open(+(process.env.VW ?? 960), +(process.env.VH ?? 600), process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(2400000); await page.waitForTimeout(1500);
const info = await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state, v = S.view, W = S.W, m = v.map; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality(q); g.speed = 0;
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh();
  const H = s.road.length / W, RW = 16, RH = 14; s.unlocked = Array.from({ length: 4096 }, (_, i) => i); // 試験の場所の周りに、未開放の区画の黄色い柵が出ないように
  const hv = (x, y) => m.heights[y * (W + 1) + x];
  const occ = new Uint8Array(W * H); for (const b of s.buildings) for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) occ[yy * W + xx] = 1;
  let best = null, bs = 1e9;
  for (let y0 = 2; y0 + RH < H - 2; y0 += 2) for (let x0 = 2; x0 + RW < W - 2; x0 += 2) { let bad = 0, lo = 1e9, hi = -1e9;
    for (let y = y0; y <= y0 + RH && !bad; y++) for (let x = x0; x <= x0 + RW; x++) { const i = y * W + x; if (s.road[i] || occ[i] || m.water[i] || (s.rail && s.rail[i])) { bad = 1; break; } const h = hv(x, y); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (!bad && hi - lo < bs) { bs = hi - lo; best = [x0, y0]; } }
  if (!best) return { err: 'no area' };
  const [x0, y0] = best, put = (x, y, t) => { const i = (y0 + y) * W + x0 + x; s.road[i] = t; s.roadAge[i] = 20; s.zone[i] = 0; };
  for (let x = 0; x <= 14; x++) put(x, 1, 3);           // 国道（東西）
  for (let x = 0; x <= 14; x++) put(x, 6, 2);           // 2 車線（東西）。西半分は拡幅
  for (let x = 0; x <= 14; x++) put(x, 10, 1);          // 生活道路（東西）
  for (let y = 0; y <= 13; y++) put(2, y, 2);           // 2 車線（南北）
  for (let y = 0; y <= 6; y++) put(7, y, 3);            // 国道（南北）：上は十字、下は T 字
  for (let y = 6; y <= 13; y++) put(11, y, 1);          // 生活道路（南北）：T・十字・行き止まり
  s.wide = [...(s.wide ?? [])]; for (let x = 0; x <= 6; x++) s.wide.push((y0 + 6) * W + x0 + x); for (let y = 2; y <= 5; y++) s.wide.push((y0 + y) * W + x0 + 2);
  s.roadVersion = (s.roadVersion ?? 0) + 1;
  const T = (x, y) => (y0 + y) * W + x0 + x;
  return { W, area: best, flat: bs, v: [T(2, 1), T(7, 1), T(7, 6), T(11, 10), T(2, 6), T(11, 13), T(6, 5)] };
}, process.env.Q ?? 'high');
console.log(JSON.stringify(info));
await page.waitForTimeout(6000);
const P = [[60, 0.62, 0.7], [70, 0.62, 0.7], [60, 0.6, 2.2], [40, 0.65, 0.7], [60, 0.62, 3.6], [40, 0.6, 0.9], [230, 0.95, 0.6]];
for (const k of (process.env.VIEWS ?? '0,1,2,3,4,5,6').split(',').map(Number)) { const t = info.v[k], [d, p, yaw] = P[k];
  await page.evaluate(([t, d, p, yaw]) => { const v = window.__sumu.view; v.focus(t, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [t, d, p, yaw]);
  await page.waitForTimeout(3000); await page.screenshot({ path: `shots/${process.env.NAME ?? 'v95r'}-${k}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')).slice(0, 5));
await browser.close();
