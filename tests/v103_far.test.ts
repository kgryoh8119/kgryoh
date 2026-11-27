// v103：遠くの簡略な人・車の位置。人は歩道（路側帯）の帯の中、車は車道の中の左側（左側通行）。
// v102 では、駅前の幹線で遠くの人が車道を歩いていた（区画の中心どうしを結ぶ線を、いまの区画の幅だけずらしていたため。src/render/farpath.ts の冒頭）。
// 小さな街（幹線・2 車線・生活道路、交差点・T 字・曲がり角・行き止まり・幅の変わる所）で遠くの住民をたくさん動かし、
// 描く位置を全部、描いた道の形（roadbase.ts と同じ決め方の車道の範囲）と照らし合わせる。
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { FarFlow, LowSet, lowPersonGeo, lowCarGeo, type FarEnv, type FarTrip } from '../src/render/lodcrowd';
import { roadGeom, walkMid, lanePos, walkPos, type PathEnv } from '../src/render/farpath';
import { walkW, CORNER_R } from '../src/render/roadbase';

const W = 26, H = 26, T = 30;
/** 道路：幹線（6 車線の幅の 2 車線区画＝歩道あり）、2 車線、生活道路の格子。曲がり角・行き止まり・途中で等級が変わる通りを含む */
function town(): { road: Uint8Array; wide: Set<number> } {
  const road = new Uint8Array(W * H), wide = new Set<number>(), set = (x: number, y: number, t: number, w = false) => { const i = y * W + x; road[i] = Math.max(road[i], t); if (w) wide.add(i); };
  for (let x = 1; x < W - 1; x++) set(x, 8, 2, true);             // 駅前の幹線（東西）
  for (let y = 1; y < H - 1; y++) set(12, y, 2);                  // 2 車線（南北）
  for (let x = 2; x < 23; x++) set(x, 15, 1);                     // 生活道路（東西）
  for (const x of [4, 8, 17, 21]) for (let y = 2; y < 22; y++) set(x, y, 1); // 生活道路（南北）
  for (let x = 13; x < 20; x++) set(x, 4, x < 16 ? 2 : 1);        // 途中で 2 車線から生活道路へ
  for (let x = 4; x <= 8; x++) set(x, 22, 1); for (let y = 22; y < 25; y++) set(8, y, 1); // 曲がり角（L 字）
  set(24, 15, 1); set(23, 15, 1); set(24, 16, 1); set(24, 17, 1); // 曲がり角と行き止まり
  for (let y = 9; y < 15; y++) set(1, y, 1);                      // 幹線の端から南へ（曲がり角）
  set(1, 15, 1); set(2, 15, 1);
  return { road, wide };
}
const HW = [0, 2.5, 5, 7.5];

/** 描いた道の形（roadbase.ts / scene.rebuildRoads と同じ決め方）で、点が車道の中か。crossOk：交差点で、横断歩道の位置（横の道の歩道の延長）を渡っているときは許す */
function makeShape(road: Uint8Array, wide: Set<number>) {
  const hwAt = (j: number) => (road[j] === 2 && wide.has(j) ? 7.5 : HW[road[j]]);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? road[y * W + x] : 0);
  return (px: number, pz: number): { inRoad: boolean; crossing: boolean; tile: number; lx: number; lz: number; straight: boolean } => {
    const x = Math.floor(px / T), y = Math.floor(pz / T), i = y * W + x, lx = px - (x + 0.5) * T, lz = pz - (y + 0.5) * T;
    const none = { inRoad: false, crossing: false, tile: i, lx, lz, straight: false };
    if (!at(x, y)) return none;
    const cE = at(x + 1, y), cW = at(x - 1, y), cS = at(x, y + 1), cN = at(x, y - 1), n = (cE ? 1 : 0) + (cW ? 1 : 0) + (cS ? 1 : 0) + (cN ? 1 : 0), junc = n >= 3;
    let hw = hwAt(i); if (junc) for (const [c, dx, dy] of [[cE, 1, 0], [cW, -1, 0], [cS, 0, 1], [cN, 0, -1]]) if (c) hw = Math.max(hw, hwAt((y + dy) * W + x + dx));
    const arm = (c: number, dx: number, dy: number) => (c ? Math.min(hw, hwAt((y + dy) * W + x + dx)) : 0);
    const aE = arm(cE, 1, 0), aW = arm(cW, -1, 0), aS = arm(cS, 0, 1), aN = arm(cN, 0, -1);
    if (n === 2 && (cE || cW) && (cS || cN)) { // 曲がり角：区画の角を中心に半径 15 の円弧の道
      const kx = (cE ? 1 : -1) * 15, kz = (cS ? 1 : -1) * 15, A = Math.min(cE ? aE : aW, cS ? aS : aN), r = Math.hypot(lx - kx, lz - kz);
      return { ...none, inRoad: Math.abs(r - 15) < A };
    }
    const X = Math.abs(lx), Z = Math.abs(lz), a = lx >= 0 ? aE : aW, b = lz >= 0 ? aS : aN;
    const midV = junc ? Math.max(aE, aW) : hw, midU = junc ? Math.max(aS, aN) : hw;
    // 東西の腕：横断の幅（縁石の線）。横の腕がある角は真っすぐ、無い側は区画の中心の幅へすりつける
    const curbA = a ? (b && junc ? a : a + (midV - a) * (1 - X / 15)) : 0, curbB = b ? (a && junc ? b : b + (midU - b) * (1 - Z / 15)) : 0;
    const inA = a > 0 && Z < curbA - 0.05, inB = b > 0 && X < curbB - 0.05;
    const inBox = junc && X < midU && Z < midV;
    // 隅切り（半径 CORNER_R の円弧の外の路面）
    const fillet = junc && a > 0 && b > 0 && X > b && X < b + CORNER_R && Z > a && Z < a + CORNER_R && Math.hypot(X - b - CORNER_R, Z - a - CORNER_R) > CORNER_R + 0.05;
    const inRoad = inA || inB || inBox || fillet;
    // 交差点で横の道を渡っている：東西の腕の中で、中心からの距離が南北の道の歩道の帯（midU〜midU＋歩道の幅）にある（南北も同じ）
    // （横断歩道は隅切りの円弧の途中の切り下げから始まるので、隅切りの路面の中も渡る所に含める）
    const crossing = junc && !inBox && (((inA || fillet) && !inB && X >= midU - 0.05 && X <= midU + walkW(midU) + 0.05) || ((inB || fillet) && !inA && Z >= midV - 0.05 && Z <= midV + walkW(midV) + 0.05));
    return { inRoad, crossing, tile: i, lx, lz, straight: n === 2 && ((!!cE && !!cW) || (!!cS && !!cN)) };
  };
}

function scene() {
  const { road, wide } = town(), pe = roadGeom(road, W, H, T, wide);
  const env: FarEnv = { ...pe, road, H, surfY: () => 0, slow: () => 1, seen: () => true };
  const sc = new THREE.Scene(), cars = new LowSet(lowCarGeo(), 4000, sc), peds = new LowSet(lowPersonGeo(), 6000, sc);
  const rec: { ped: boolean; x: number; z: number; yaw: number }[] = [];
  cars.put = (x, _y, z, yaw) => { rec.push({ ped: false, x, z, yaw }); return true; };
  peds.put = (x, _y, z, yaw) => { rec.push({ ped: true, x, z, yaw }); return true; };
  const tiles: number[] = []; for (let i = 0; i < W * H; i++) if (road[i]) tiles.push(i);
  let sd = 7; const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const trips: FarTrip[] = [];
  for (let p = 0; p < 1600; p++) { const mode = p % 3 === 0 ? 4 : 0; trips.push({ person: p, mode, role: p % 6, from: tiles[(rnd() * tiles.length) | 0], to: tiles[(rnd() * tiles.length) | 0], prog: rnd() }); }
  const flow = new FarFlow(cars, peds); flow.sync(trips, env);
  return { road, wide, env, flow, rec, shape: makeShape(road, wide) };
}

describe('v103 遠くの簡略な人・車は歩道と車線の上', () => {
  const { flow, env, rec, shape } = scene();
  for (let f = 0; f < 600; f++) flow.step(0.1, env, 0, 0, 0, 1e9);
  const peds = rec.filter(r => r.ped), cars = rec.filter(r => !r.ped);
  it('たくさん動かした（人・車とも数十万の位置）', () => { expect(peds.length).toBeGreaterThan(300000); expect(cars.length).toBeGreaterThan(150000); });
  it('人は車道の中を歩かない（交差点で横断歩道の位置を渡るときだけ）', () => {
    const bad = peds.filter(p => { const s = shape(p.x, p.z); return s.inRoad && !s.crossing; });
    if (bad.length) console.log('車道の人', bad.length, bad.slice(0, 5).map(p => { const s = shape(p.x, p.z); return [s.tile % W, (s.tile / W) | 0, s.lx.toFixed(2), s.lz.toFixed(2), (p.yaw * 180 / Math.PI).toFixed(0)]; }));
    expect(bad.length).toBe(0);
  });
  it('人は歩道（路側帯）の帯の外（家の敷地）へ出ない：直線の区画では車道の端から歩道の幅の中', () => {
    const { road, wide } = town(), hwAt = (j: number) => (road[j] === 2 && wide.has(j) ? 7.5 : HW[road[j]]);
    let bad = 0, n = 0;
    for (const p of peds) { const s = shape(p.x, p.z); if (!s.straight) continue; const t = s.tile, x = t % W, ew = !!road[t + 1] && !!road[t - 1] && x > 0 && x < W - 1;
      const nb = ew ? [t - 1, t + 1] : [t - W, t + W]; if (nb.some(j => hwAt(j) !== hwAt(t))) continue; // 幅のすりつけの区画は除く
      const h = hwAt(t), lat = Math.abs(ew ? s.lz : s.lx); n++; if (lat < h - 0.01 || lat > h + walkW(h) + 0.01) bad++; }
    expect(n).toBeGreaterThan(50000); expect(bad).toBe(0);
  });
  it('車は車道の中、直線の区画では進む向きの左の車線（左側通行）', () => {
    let off = 0, wrong = 0;
    for (const c of cars) { const s = shape(c.x, c.z); if (!s.inRoad) { off++; continue; }
      if (s.straight) { const fx = Math.sin(c.yaw), fz = Math.cos(c.yaw), lat = s.lx * fz - s.lz * fx; if (lat <= 0.3) wrong++; } } // 進む向きの左 = (fz, −fx)
    expect(off).toBe(0); expect(wrong).toBe(0);
  });
});

describe('v103 歩道・車線の位置（純粋な関数）', () => {
  const { road, wide } = town(), e: PathEnv = roadGeom(road, W, H, T, wide), o = { x: 0, z: 0, dx: 0, dz: 1 };
  const id = (x: number, y: number) => y * W + x;
  it('区画の境い目・中心で位置が飛ばない（人：直進・右左折・幅の変わる所、車：曲がり角）', () => {
    const routes = [[id(10, 8), id(11, 8), id(12, 8), id(12, 9), id(12, 10)], [id(12, 6), id(12, 7), id(12, 8), id(13, 8), id(14, 8)], [id(4, 13), id(4, 14), id(4, 15), id(5, 15), id(6, 15)],
      [id(14, 4), id(15, 4), id(16, 4), id(17, 4), id(17, 5)], [id(6, 22), id(7, 22), id(8, 22), id(8, 23), id(8, 24)], [id(4, 7), id(4, 8), id(5, 8), id(6, 8)]];
    for (const r of routes) for (const sg of [1, -1]) for (const car of [false, true]) {
      let px = NaN, pz = NaN;
      for (let k = 0; k + 1 < r.length; k++) for (let t = 0; t < 1; t += 0.01) {
        const prev = k > 0 ? r[k - 1] : -1, nn = k + 2 < r.length ? r[k + 2] : r[k + 1];
        if (car) lanePos(o, e, prev, r[k], r[k + 1], nn, t, 0); else walkPos(o, e, prev, r[k], r[k + 1], nn, t, sg);
        if (!Number.isNaN(px)) expect(Math.hypot(o.x - px, o.z - pz)).toBeLessThan(1.2); // 1 コマ 0.3m 進む。横へ飛ばない
        px = o.x; pz = o.z;
      }
    }
  });
  it('行き先の区画に着いて動かない人（いまの区画＝次の区画）も、車道の真ん中でなく歩道の上（前は区画の中心に立っていた）', () => {
    const shape = makeShape(road, wide);
    for (let i = 0; i < W * H; i++) if (road[i]) for (const sg of [1, -1]) { walkPos(o, e, -1, i, i, i, 0.3, sg); const q = shape(o.x, o.z); expect(q.inRoad && !q.crossing).toBe(false); }
  });
  it('歩道の中ほど：幹線 9.25m・2 車線 6.5m・生活道路 3.75m', () => { expect(walkMid(7.5)).toBeCloseTo(9.25); expect(walkMid(5)).toBeCloseTo(6.5); expect(walkMid(2.5)).toBeCloseTo(3.75); });
});
