// v104a：道路の断面のつながりと、歩く人の足元。
// ・v103 までは、交差点の区画（つながる道の広い方の等級）だけが段差のある歩道で、となりの生活道路の区画は路側帯だったため、
//   区画の境で歩道の平板が路側帯の上へ突き出し、路側帯を歩く人が平板の横腹に突き当たっていた（駅前の朝 8 時の真上の画）。
//   ここでは、区画の境の両側で断面（歩道か路側帯か）が同じであること、変わる所では歩道の平板が区画の境まで来ないこと（すりつけて終わる）を確かめる。
// ・人は草地（道路の区画の歩道の外）に立たない：歩道・路側帯・交差点の横断・入口の通路の上だけ（遠くの簡略な人・建物に出入りする人）。
import { describe, it, expect } from 'vitest';
import { roadGeom, walkPos, walkMid, type PathOut } from '../src/render/farpath';
import { kerbPlan, kerbArm, roadBase, walkW, TAPER_L, CORNER_R, WALK_Y } from '../src/render/roadbase';
import { frontagePlan, frontDoor, surfaceAt, sideBit, frontW, FRONT_U } from '../src/render/frontage';
import type { Geo, V3 } from '../src/render/geo';

const W = 24, H = 20, T = 30, HW = [0, 2.5, 5, 7.5];
const id = (x: number, y: number) => y * W + x;
/** 幹線（東西）、二車線（南北）、生活道路の格子、駅（10〜12, 2）の前の生活道路、曲がり角・行き止まり */
function town() {
  const road = new Uint8Array(W * H), set = (x: number, y: number, t: number) => { road[id(x, y)] = Math.max(road[id(x, y)], t); };
  for (let x = 1; x < W - 1; x++) set(x, 8, 2);
  for (let y = 1; y < H - 1; y++) set(12, y, 2);
  for (let x = 1; x < W - 1; x++) set(x, 3, 1);                       // 駅前の生活道路（駅は 10〜12, 2 の北）
  for (let x = 2; x < 22; x++) set(x, 14, 1);
  for (const x of [4, 8, 17, 20]) for (let y = 3; y < 18; y++) set(x, y, 1);
  for (let x = 4; x <= 8; x++) set(x, 18, 1); set(8, 18, 1);           // 曲がり角（4,18）と（8,18）
  set(21, 10, 1); set(21, 11, 1); set(20, 11, 1);                     // 行き止まりの枝
  road[id(11, 2)] = 0; road[id(10, 2)] = 0; road[id(12, 2)] = 0;        // 駅の敷地
  const station = { x: 10, y: 2, w: 3, h: 1 };
  const busy = (i: number) => { const x = i % W, y = (i / W) | 0; return road[i] === 1 && x >= station.x - 3 && x < station.x + station.w + 3 && y >= station.y - 3 && y < station.y + station.h + 3; };
  const plan = kerbPlan(road, W, H, { busy });
  return { road, plan, station };
}
const conn = (road: Uint8Array, i: number, dx: number, dy: number) => { const x = i % W + dx, y = ((i / W) | 0) + dy; return x >= 0 && y >= 0 && x < W && y < H && !!road[y * W + x]; };
const D = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

describe('v104a 段差のある歩道の区画（kerbPlan）', () => {
  const { road, plan } = town();
  it('幹線・二車線・その交差点は歩道あり、ふつうの生活道路は路側帯', () => {
    expect(plan[id(6, 8)]).toBe(1); expect(plan[id(12, 11)]).toBe(1); expect(plan[id(8, 8)]).toBe(1); // 幹線と生活道路の交差点（等級は広い方）
    expect(plan[id(8, 11)]).toBe(0); expect(plan[id(6, 14)]).toBe(0);
  });
  it('駅のまわり 3 区画の生活道路は歩道あり（駅前の通りの全体）', () => { for (let x = 7; x <= 15; x++) if (road[id(x, 3)]) expect(plan[id(x, 3)]).toBe(1); expect(plan[id(2, 3)]).toBe(0); });
  it('区画の境の両側で、腕の断面（歩道か路側帯か）が同じ', () => {
    let n = 0; for (let i = 0; i < W * H; i++) if (road[i]) for (const [dx, dy] of D) { if (!conn(road, i, dx, dy)) continue; n++;
      expect(kerbArm(plan, W, H, i, dx, dy)).toBe(kerbArm(plan, W, H, id(i % W + dx, ((i / W) | 0) + dy), -dx, -dy)); }
    expect(n).toBeGreaterThan(200);
  });
  it('円弧の曲がり角は、両側がどちらも歩道ありのときだけ歩道あり', () => { expect(plan[id(4, 18)]).toBe(0); expect(plan[id(8, 18)]).toBe(0); });
});

/** roadBase の描いた面を集める（高さ 0 の平らな地形） */
function capture(road: Uint8Array, plan: Uint8Array) {
  const pts: { tile: number; v: V3[] }[] = []; let cur = -1;
  const g = { tri: (a: V3, b: V3, c: V3) => pts.push({ tile: cur, v: [a, b, c] }), quad: (a: V3, b: V3, c: V3, d: V3) => pts.push({ tile: cur, v: [a, b, c, d] }) } as unknown as Geo;
  const hwAt = (j: number) => HW[road[j]];
  for (let i = 0; i < W * H; i++) {
    if (!road[i]) continue; cur = i; const x = i % W, y = (i / W) | 0;
    const c = D.map(([dx, dy]) => conn(road, i, dx, dy)), nConn = c.filter(Boolean).length;
    let hw = hwAt(i); if (nConn >= 3) D.forEach(([dx, dy], k) => { if (c[k]) hw = Math.max(hw, hwAt(id(x + dx, y + dy))); });
    const arm = (k: number) => (c[k] ? Math.min(hw, hwAt(id(x + D[k][0], y + D[k][1]))) : 0), [aE, aW, aS, aN] = [arm(0), arm(1), arm(2), arm(3)];
    const ka = (dx: number, dz: number) => kerbArm(plan, W, H, i, dx, dz), kerbless = !D.some(([dx, dy], k) => c[k] && ka(dx, dy));
    const bend = nConn === 2 && (c[0] || c[1]) && (c[2] || c[3]) ? [c[0] ? 1 : -1, c[2] ? 1 : -1] as const : null;
    roadBase({ g, cx: (x + 0.5) * T, cz: (y + 0.5) * T, hw, aE, aW, aS, aN, nConn, kerbless, stone: false, school: false, xwArms: nConn >= 3 ? 15 : 0, fine: true, hA: () => 0,
      asph: 0x333333, shade: 1, pave: () => 0xbbbbbb, kerbArm: ka, bend, bendA: bend ? Math.min(c[0] ? aE : aW, c[2] ? aS : aN) : 0 });
  }
  return pts;
}

describe('v104a 区画の境で歩道の平板が路側帯へ突き出さない', () => {
  const { road, plan } = town(), pts = capture(road, plan);
  it('区画の境の上の、歩道（路側帯）の帯の高さ：歩道ありの腕は 20cm、路側帯の腕は路面の高さ（平板の横腹が出ない）', () => {
    let nK = 0, nF = 0;
    for (let i = 0; i < W * H; i++) if (road[i]) for (const [dx, dy] of D) {
      if (!conn(road, i, dx, dy)) continue; const k = kerbArm(plan, W, H, i, dx, dy), cx = (i % W + 0.5) * T, cz = (((i / W) | 0) + 0.5) * T;
      let top = 0, any = false; const h = roadGeom(road, W, H, T, new Set()).armHW(i, dx, dy);
      for (const p of pts) { if (p.tile !== i) continue; for (const v of p.v) { const along = dx ? (v[0] - cx) * dx : (v[2] - cz) * dy, lat = Math.abs(dx ? v[2] - cz : v[0] - cx);
        if (Math.abs(along - 15) > 0.01 || lat < h + 0.3 || lat > h + walkW(h) + 0.01) continue; any = true; top = Math.max(top, v[1]); } }
      if (!any) continue;
      if (k) { nK++; expect(top).toBeGreaterThan(WALK_Y - 0.01); } else { nF++; expect(top).toBeLessThan(0.13); }
    }
    expect(nK).toBeGreaterThan(20); expect(nF).toBeGreaterThan(20);
  });
  it('幹線と路側帯の生活道路の角：縁石は隅切りの円弧を回ってから、すりつけて終わる（区画の境より手前）', () => {
    const J = id(8, 8), cx = 8.5 * T, cz = 8.5 * T; // 南北の生活道路の腕（北・南）に、幹線の歩道がすりつけて終わる
    let maxRaised = 0; for (const p of pts) if (p.tile === J) for (const v of p.v) { const along = Math.abs(v[2] - cz); if (v[1] > 0.15 && Math.abs(v[0] - cx) < 2.5 + walkW(2.5)) maxRaised = Math.max(maxRaised, along); }
    expect(maxRaised).toBeLessThanOrEqual(5 + CORNER_R + TAPER_L + 0.01); expect(maxRaised).toBeGreaterThan(5 + CORNER_R - 0.01);
  });
});

describe('v104a 人は草地に立たない（歩道・路側帯・横断歩道・入口の通路の上）', () => {
  const { road, station } = town(), e = roadGeom(road, W, H, T, new Set()), o: PathOut = { x: 0, z: 0, dx: 0, dz: 1 };
  const door = (j: number) => { const x = j % W, y = (j / W) | 0; return x >= station.x && x < station.x + station.w && y === station.y ? 1 : (x + y) % 3 === 0 ? 2 : 0; };
  const front = frontagePlan(road, W, H, door);
  it('歩く人の位置（遠くの簡略な人と同じ walkPos）：草地は 0、車道は交差点で渡るときだけ', () => {
    let sd = 3; const rnd = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    const tiles: number[] = []; for (let i = 0; i < W * H; i++) if (road[i]) tiles.push(i);
    let n = 0, grass = 0, road1 = 0;
    for (let r = 0; r < 3000; r++) {
      const path = [tiles[(rnd() * tiles.length) | 0]];
      for (let k = 0; k < 6; k++) { const c = path[path.length - 1], nb = D.filter(([dx, dy]) => conn(road, c, dx, dy)).map(([dx, dy]) => c + dx + dy * W).filter(j => j !== path[path.length - 2]); if (!nb.length) break; path.push(nb[(rnd() * nb.length) | 0]); }
      if (path.length < 3) continue; const sg = rnd() < 0.5 ? 1 : -1;
      for (let k = 0; k + 2 < path.length; k++) for (let t = 0; t < 1; t += 0.05) { // 次の次の区画まで決まっている所（遠くの人・精細な人と同じ）
        walkPos(o, e, k ? path[k - 1] : -1, path[k], path[k + 1], path[k + 2], t, sg);
        for (const dl of [-0.3, 0, 0.3]) { const v = surfaceAt(e, road, H, o.x + o.dz * dl * sg, o.z - o.dx * dl * sg, front); n++;
          if (v === 0) { if (grass < 6) console.log('草地', path[k] % W, (path[k] / W) | 0, '→', path[k + 1] % W, ((path[k + 1] / W) | 0), t.toFixed(2), sg, (o.x % T - 15).toFixed(2), (o.z % T - 15).toFixed(2)); grass++; } if (v === 1) { const ti = Math.floor((o.z) / T) * W + Math.floor(o.x / T), nc = D.filter(([dx, dy]) => conn(road, ti, dx, dy)).length; if (nc < 3) road1++; } }
      }
    }
    expect(n).toBeGreaterThan(100000); expect(grass).toBe(0); expect(road1).toBe(0);
  });
  it('建物に出入りする人：歩道の中ほどから入口の通路を通って敷地へ（草地を横切らない）', () => {
    let n = 0;
    for (const [i, v] of front) { const x = i % W, y = (i / W) | 0, ew = conn(road, i, 1, 0) || conn(road, i, -1, 0), h = HW[road[i]];
      for (const [dx, dy] of ew ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) { const bit = sideBit(dx, dy); if (!frontDoor(v, bit)) continue; expect(door(id(x + dx, y + dy))).toBe(frontDoor(v, bit));
        for (const u of [-FRONT_U, FRONT_U]) for (let q = walkMid(h); q < 15; q += 0.25) { n++;
          const px = (x + 0.5) * T + (dx ? dx * q : u), pz = (y + 0.5) * T + (dy ? dy * q : u); expect(surfaceAt(e, road, H, px, pz, front)).toBeGreaterThanOrEqual(2); } } }
    expect(n).toBeGreaterThan(500); expect(frontW(1)).toBeGreaterThan(2 * FRONT_U);
  });
  it('入口の通路は直線の区画だけ（交差点・曲がり角の角の草地へ入らない）、駅の前には広い通路', () => {
    for (const i of front.keys()) { const n = D.filter(([dx, dy]) => conn(road, i, dx, dy)).length; expect(n).toBeLessThanOrEqual(2); }
    expect(frontDoor(front.get(id(11, 3)), 8)).toBe(1);
  });
});
