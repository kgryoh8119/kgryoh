// v103：実際の街（住野市）で、遠くの簡略な人・車の描く位置を、描いた道の形と照らし合わせる（tests/v103_far.test.ts と同じ決め方の車道の範囲）。
// 朝 8 時の駅前と幹線で、住民を全部簡略な形にして 20 秒動かし、簡略な人が車道の中（交差点で横断歩道の位置を渡る所を除く）にいた割合、簡略な車が車道の外にいた割合を数える。
// node scripts/v103-farcheck.mjs（先に npx vite build）。DIST=… で前の版。NEAR=1 で精細な歩く人（同じ決め方で数える）
import { open } from './shot.mjs';
const { browser, page } = await open(800, 500, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const r = await page.evaluate(near => { const S = window.__sumu, g = S.game, s = g.state, v = S.view, W = S.W, H = s.road.length / W, T = 30, HW = [0, 2.5, 5, 7.5], CR = 4; s.tutorial.done = true; g.speed = 0; S.fixedQuality = true; v.setQuality('mid'); v.clockRun = false; v.__frame = v.frame; v.frame = () => {};
  const wwalk = h => (h >= 7 ? 3.5 : h >= 4.5 ? 3.0 : 2.5);
  const wide = v.wideSet, road = s.road, hwAt = j => (road[j] === 2 && wide.has(j) ? 7.5 : HW[road[j]] || 0), at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? road[y * W + x] : 0);
  const shape = (px, pz) => { const x = Math.floor(px / T), y = Math.floor(pz / T), i = y * W + x, lx = px - (x + 0.5) * T, lz = pz - (y + 0.5) * T;
    if (!at(x, y)) return { inRoad: false, kind: 'offroad' }; if (v.deckH.has(i) || v.tunnelSet.has(i)) return { skip: true, inRoad: false };
    const cE = at(x + 1, y), cW = at(x - 1, y), cS = at(x, y + 1), cN = at(x, y - 1), n = (cE ? 1 : 0) + (cW ? 1 : 0) + (cS ? 1 : 0) + (cN ? 1 : 0), junc = n >= 3;
    let hw = hwAt(i); if (junc) for (const [c, dx, dy] of [[cE, 1, 0], [cW, -1, 0], [cS, 0, 1], [cN, 0, -1]]) if (c) hw = Math.max(hw, hwAt((y + dy) * W + x + dx));
    const arm = (c, dx, dy) => (c ? Math.min(hw, hwAt((y + dy) * W + x + dx)) : 0), aE = arm(cE, 1, 0), aW = arm(cW, -1, 0), aS = arm(cS, 0, 1), aN = arm(cN, 0, -1);
    if (n === 2 && (cE || cW) && (cS || cN)) { const kx = (cE ? 1 : -1) * 15, kz = (cS ? 1 : -1) * 15, A = Math.min(cE ? aE : aW, cS ? aS : aN), rr = Math.hypot(lx - kx, lz - kz); return { inRoad: Math.abs(rr - 15) < A }; }
    const X = Math.abs(lx), Z = Math.abs(lz), a = lx >= 0 ? aE : aW, b = lz >= 0 ? aS : aN, midV = junc ? Math.max(aE, aW) : hw, midU = junc ? Math.max(aS, aN) : hw;
    const curbA = a ? (b && junc ? a : a + (midV - a) * (1 - X / 15)) : 0, curbB = b ? (a && junc ? b : b + (midU - b) * (1 - Z / 15)) : 0;
    const inA = a > 0 && Z < curbA - 0.05, inB = b > 0 && X < curbB - 0.05, inBox = junc && X < midU && Z < midV;
    const fillet = junc && a > 0 && b > 0 && X > b && X < b + CR && Z > a && Z < a + CR && Math.hypot(X - b - CR, Z - a - CR) > CR + 0.05;
    const crossing = junc && !inBox && (((inA || fillet) && !inB && X >= midU - 0.05 && X <= midU + wwalk(midU) + 0.05) || ((inB || fillet) && !inA && Z >= midV - 0.05 && Z <= midV + wwalk(midV) + 0.05));
    return { inRoad: inA || inB || inBox || fillet, crossing, kind: junc ? 'junc' : n === 2 ? 'straight' : 'end' + n, lx: +lx.toFixed(1), lz: +lz.toFixed(1), hw, aE, aW, aS, aN }; };
  let x = 0, y = 0, n = 0, best = null, bv = -1e9; for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = Math.round(x / n), cy = Math.round(y / n); for (const b of s.buildings) if (b.kind === 'station') { const d = -Math.abs(b.x - cx) - Math.abs(b.y - cy); if (d > bv) { bv = d; best = b; } }
  const rec = [];
  if (near) { const pw = v.poseWalker.bind(v); v.poseWalker = (a, i, px, py, pz, ...r) => { if ((a.enter ?? a.exit ?? 0) < 0.3) rec.push([1, px, pz]); return pw(a, i, px, py, pz, ...r); }; } // 精細な歩く人（建物に出入りする途中は除く）
  else { v.resTargets = () => ({ car: 0, bike: 0, bus: 0, ped: 0 }); const pp = v.lowPed.put.bind(v.lowPed), pc = v.lowCar.put.bind(v.lowCar);
    v.lowPed.put = (x, y, z, ...a) => { rec.push([1, x, z]); return pp(x, y, z, ...a); }; v.lowCar.put = (x, y, z, ...a) => { rec.push([0, x, z]); return pc(x, y, z, ...a); }; }
  v.hour = 8; v.holiday = false; v.applyTime?.(); v.focus(best.y * W + best.x, 400); v.target.x = v.want.x; v.target.z = v.want.z; v.dist = 400; v.agentSpawnAt.x = -1e9; v.spawnAgents();
  if (near) v.dbgVeh = []; // 精細な車・バスの位置（x, z, dx, dz, 種類）
  for (let t = 0; t < 20; t += 0.1) { v.lifeT += 0.1; v.updateCamera(0.1); v.moveAgents(s, 0.1); }
  if (near) { const d = v.dbgVeh; for (let k = 0; k < d.length; k += 5) if (d[k] > -1e8) rec.push([0, d[k], d[k + 1]]); v.dbgVeh = null; }
  let ped = 0, pedBad = 0, car = 0, carBad = 0, skip = 0; const kinds = {}, ex = [];
  for (const [p, px, pz] of rec) { const q = shape(px, pz); if (q.skip) { skip++; continue; } if (p) { ped++; if (q.inRoad && !q.crossing) { pedBad++; kinds[q.kind] = (kinds[q.kind] ?? 0) + 1; if (ex.length < 12 && Math.random() < 0.01) ex.push(q); } } else { car++; if (!q.inRoad) carBad++; } }
  return { near, ped, pedBad, pedBadPct: +(pedBad / ped * 100).toFixed(2), car, carBad, carBadPct: +(carBad / Math.max(1, car) * 100).toFixed(2), skipDeckTunnel: skip, kinds, ex };
}, !!process.env.NEAR);
console.log(JSON.stringify(r)); await browser.close();
