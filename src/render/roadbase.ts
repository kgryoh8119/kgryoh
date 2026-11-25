// v95：路面・歩道・縁石の形。区画を 4 つの象限に分け、象限ごとに「車道の端（縁石）」の折れ線を作って、路面・歩道・縁石・側溝を描く
import type { Geo, V3 } from './geo';
import { hash } from '../sim/index';

const mixHex = (a: number, b: number, t: number) => { const f = (k: number) => Math.round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
/** 歩道の幅（m）。道路の等級によらず、縁石（車道の端）から外へ一定（v95 以前の scene の SW と同じ値） */
export const SIDEWALK_W = 2.5;
/** 交差点の角の隅切り（縁石の円弧）の半径（m） */
export const CORNER_R = 3;
/** 歩道の天端の高さ（路面 0.1 から 10cm 上）。切り下げ（横断歩道の端）は 0.115 */
export const WALK_Y = 0.2;
/** 交差点の横断歩道の範囲（区画の中心から腕の向きの距離 [x0, x1]）。perp：横切る道（直交する腕）の半幅の大きい方。ah：この腕の車道の半幅。
 *  横断歩道は隅切りの円弧の途中（歩道の切り下げ）から始まり、停止線はその先 1.2m */
export function xwRange(ah: number, perp: number): [number, number] { const x0 = perp + CORNER_R * 0.5; return [x0, x0 + (ah >= 7 ? 4 : 3)]; }
/** 交差点に横断歩道を引くか（roadTile と roadBase で同じ答え） */
export function hasXw(t: number, stone: boolean, x: number, y: number, nConn: number): boolean { return nConn >= 3 && !stone && (t >= 2 || hash(x, y, 43) < 0.35); }
/** 交差点の角の歩道の中ほど（象限の座標 |u|, |v|）。b：南北の腕の半幅、a：東西の腕の半幅（0 は無い腕）。信号機・標識の柱の位置 */
export function cornerSpot(a: number, b: number, hw: number): [number, number] {
  if (a && b) { const k = (CORNER_R - SIDEWALK_W * 0.5) / Math.SQRT2; return [b + CORNER_R - k, a + CORNER_R - k]; }
  return [(b || hw) + 1.75, (a || hw) + 1.75];
}
export interface RoadBaseArgs {
  g: Geo; cx: number; cz: number; hw: number; aE: number; aW: number; aS: number; aN: number; nConn: number;
  kerbless: boolean; stone: boolean; school: boolean; xw: boolean; fine: boolean; hA: (x: number, z: number) => number;
  /** 路面の色と明るさ、歩道の平板の色（k は部品の番号） */
  asph: number; shade: number; pave: (k: number) => number;
  /** 腕の先が段差の無い道（生活道路）か。段差のある歩道は、その腕の先で路面の高さまで下りる */
  lowArm: (dx: number, dz: number) => boolean;
  /** 曲がり角（2 方向が直角）：[東西の符号, 南北の符号] と、その車道の半幅 */
  bend?: readonly [number, number] | null; bendA?: number;
}
type P2 = [number, number];
const upQ = (g: Geo, pts: V3[], col: number, sh: number) => { // 上を向く順に並べて塗る（3 点か 4 点）
  const ux = pts[1][0] - pts[0][0], uz = pts[1][2] - pts[0][2], vx = pts[2][0] - pts[0][0], vz = pts[2][2] - pts[0][2], ok = uz * vx - ux * vz >= 0;
  if (pts.length === 3) { if (ok) g.tri(pts[0], pts[1], pts[2], col, sh); else g.tri(pts[0], pts[2], pts[1], col, sh); }
  else if (ok) g.quad(pts[0], pts[1], pts[2], pts[3], col, sh); else g.quad(pts[0], pts[3], pts[2], pts[1], col, sh);
};
/** 区画の路面・歩道（または路側帯）・縁石・L 字の側溝・切り下げと点字ブロック。
 *  ・両方の腕がある角：隅切りの円弧（半径 CORNER_R）。道幅の違う道どうしでも、それぞれの腕の縁石の線を円弧でつなぐ（広い方の歩道が回り込む）
 *  ・片方の腕だけ：まっすぐな縁石（直線の区画で両端の幅が違うときは、区画の中で幅をなめらかに変える）
 *  ・腕が無い角（行き止まり）：丸めた端
 *  歩道はその折れ線から外へ SIDEWALK_W の帯（区画ごとにずれない）。路面は象限の中心からの扇で塗る */
export function roadBase(o: RoadBaseArgs): void {
  if (o.bend) { bendBase(o); return; }
  const { g, cx, cz, hw, hA, kerbless, fine } = o, SWd = SIDEWALK_W, R = CORNER_R, junction = o.nConn >= 3;
  const midV = junction ? Math.max(o.aE, o.aW) : hw, midU = junction ? Math.max(o.aS, o.aN) : hw;
  const xwE = o.xw && junction ? xwRange(Math.max(o.aE, o.aW), Math.max(o.aN, o.aS)) : null, xwN = o.xw && junction ? xwRange(Math.max(o.aN, o.aS), Math.max(o.aE, o.aW)) : null;
  const pieceN = fine ? 8 : 4, ramp = (d: number, d0: number) => Math.max(0, Math.min(1, (d - d0) / Math.max(1, 15 - d0)));
  const road = o.stone ? (hw <= 2.5 ? 0x8d877c : 0x55524c) : o.asph;
  for (const su of [1, -1]) for (const sv of [1, -1]) {
    const a = su > 0 ? o.aE : o.aW, b = sv > 0 ? o.aS : o.aN, aO = su > 0 ? o.aW : o.aE, bO = sv > 0 ? o.aN : o.aS;
    const P: P2[] = [], Q: P2[] = [];
    /** 内（縁石）A→B と外（歩道の外の端）C→D の直線を、3m ごとと横断歩道の端で切って並べる */
    const seg = (A: P2, B: P2, C: P2, D: P2, cuts: number[], axis: 0 | 1) => {
      const L = Math.hypot(B[0] - A[0], B[1] - A[1]), n = Math.max(1, Math.ceil(L / 3)), ts: number[] = [];
      for (let k = 0; k <= n; k++) ts.push(k / n);
      const span = B[axis] - A[axis]; if (Math.abs(span) > 1e-6) for (const c of cuts) { const t = (c - A[axis]) / span; if (t > 0.02 && t < 0.98) ts.push(t); }
      ts.sort((p, q) => p - q);
      for (const t of ts) { const p: P2 = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]; if (P.length) { const l = P[P.length - 1]; if (Math.abs(l[0] - p[0]) < 1e-6 && Math.abs(l[1] - p[1]) < 1e-6) continue; }
        P.push(p); Q.push([C[0] + (D[0] - C[0]) * t, C[1] + (D[1] - C[1]) * t]); }
    };
    const arc = (ci: P2, ri: number, co: P2, ro: number, t0: number, t1: number) => {
      for (let k = 1; k <= pieceN; k++) { const t = t0 + (t1 - t0) * k / pieceN, c = Math.cos(t), s2 = Math.sin(t); P.push([ci[0] + c * ri, ci[1] + s2 * ri]); Q.push([co[0] + c * ro, co[1] + s2 * ro]); }
    };
    const cE = xwE ? [xwE[0], xwE[1]] : [], cN = xwN ? [xwN[0], xwN[1]] : [];
    if (a && b) { // 隅切りの角
      const ci: P2 = [b + R, a + R], Rw = Math.max(R, SWd), co: P2 = [b + Rw, a + Rw], ro = Math.max(0, R - SWd);
      seg([15, a], [b + R, a], [15, a + SWd], [co[0], a + SWd], cE, 0);
      arc(ci, R, co, ro, -Math.PI / 2, -Math.PI);
      seg([b, a + R], [b, 15], [b + SWd, co[1]], [b + SWd, 15], cN, 1);
    } else if (a) seg([15, a], [0, midV], [15, a + SWd], [0, midV + SWd], cE, 0);       // 東西の腕だけ（直線・T 字の突き当たりの側）
    else if (b) seg([midU, 0], [b, 15], [midU + SWd, 0], [b + SWd, 15], cN, 1);         // 南北の腕だけ
    else { // 腕の無い角（行き止まりの端・孤立した区画）：丸めた端
      const X = bO ? midU : hw, Y = aO ? midV : hw, r = Math.min(X, Y) * 0.7;
      seg([X, 0], [X, Y - r], [X + SWd, 0], [X + SWd, Y - r], [], 1);
      arc([X - r, Y - r], r, [X - r, Y - r], r + SWd, 0, Math.PI / 2);
      seg([X - r, Y], [0, Y], [X - r, Y + SWd], [0, Y + SWd], [], 0);
    }
    const V = (p: P2, off: number): V3 => { const wx = cx + su * p[0], wz = cz + sv * p[1]; return [wx, hA(wx, wz) + off, wz]; };
    // --- 路面：象限の中心からの扇（地形に沿うよう 3 つの輪に切る）
    const F: P2[] = []; if (P[0][1] > 1e-6) F.push([P[0][0], 0]); for (const p of P) F.push(p); const pl = P[P.length - 1]; if (pl[0] > 1e-6) F.push([0, pl[1]]);
    for (let k = 0; k + 1 < F.length; k++) { const A = F[k], B = F[k + 1]; if (Math.abs(A[0] * B[1] - A[1] * B[0]) < 1e-6) continue;
      for (let r = 0; r < 3; r++) { const s0 = r / 3, s1 = (r + 1) / 3, sc = (p: P2, s: number): P2 => [p[0] * s, p[1] * s];
        if (r === 0) upQ(g, [V([0, 0], 0.1), V(sc(A, s1), 0.1), V(sc(B, s1), 0.1)], road, o.shade); else upQ(g, [V(sc(A, s0), 0.1), V(sc(A, s1), 0.1), V(sc(B, s1), 0.1), V(sc(B, s0), 0.1)], road, o.shade); } }
    // --- 歩道（段差あり）／路側帯（生活道路：路面の高さで白線の外）
    const lowE = !kerbless && !!a && o.lowArm(su, 0), lowN = !kerbless && !!b && o.lowArm(0, sv);
    const info = P.map((p, k) => { // 切り下げ（横断歩道の端）と、段差の無い道へ下りる割合
      const q = Q[k], cutE = !!xwE && a > 0 && p[1] <= a + 1.2 && p[0] >= xwE[0] - 0.05 && p[0] <= xwE[1] + 0.05, cutN = !!xwN && b > 0 && p[0] <= b + 1.2 && p[1] >= xwN[0] - 0.05 && p[1] <= xwN[1] + 0.05;
      const lo = Math.max(lowE && p[1] <= a + SWd + 0.01 ? ramp(Math.min(p[0], q[0]), b ? b + R : midU) : 0, lowN && p[0] <= b + SWd + 0.01 ? ramp(Math.min(p[1], q[1]), a ? a + R : midV) : 0);
      return { cut: !kerbless && (cutE || cutN), lo };
    });
    const yIn = (k: number) => kerbless ? 0.1 : info[k].cut ? 0.115 : WALK_Y - 0.1 * info[k].lo, yOut = (k: number) => kerbless ? 0.1 : WALK_Y - 0.1 * info[k].lo;
    for (let k = 0; k + 1 < P.length; k++) {
      const col = kerbless ? (o.school ? 0x3d7f55 : mixHex(o.asph, 0x6b675f, 0.12)) : o.stone ? (k % 2 ? 0xae9888 : 0xbca898) : o.pave(k + (su > 0 ? 0 : 3) + (sv > 0 ? 0 : 7));
      upQ(g, [V(P[k], yIn(k)), V(P[k + 1], yIn(k + 1)), V(Q[k + 1], yOut(k + 1)), V(Q[k], yOut(k))], col, kerbless ? o.shade : 1);
    }
    const inv = (k: number): P2 => { const dx = P[k][0] - Q[k][0], dz = P[k][1] - Q[k][1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; }; // 車道の側の向き
    const off = (k: number, d: number): P2 => { const i = inv(k); return [P[k][0] + i[0] * d, P[k][1] + i[1] * d]; };
    if (kerbless) { // 路側帯の外の端の側溝のふた
      if (fine) for (let k = 0; k + 1 < P.length; k++) { const i0 = inv(k), i1 = inv(k + 1);
        upQ(g, [V(Q[k], 0.112), V(Q[k + 1], 0.112), V([Q[k + 1][0] + i1[0] * 0.45, Q[k + 1][1] + i1[1] * 0.45], 0.112), V([Q[k][0] + i0[0] * 0.45, Q[k][1] + i0[1] * 0.45], 0.112)], 0x9a968c, 1); }
      continue;
    }
    // --- 縁石（立ち上がりと天端）・L 字の側溝・点字ブロック（切り下げの所）
    for (let k = 0; k + 1 < P.length; k++) {
      const top0 = info[k].cut ? 0.125 : 0.22 - 0.12 * info[k].lo, top1 = info[k + 1].cut ? 0.125 : 0.22 - 0.12 * info[k + 1].lo, i0 = inv(k), i1 = inv(k + 1);
      const A0 = V(P[k], 0.09), A1 = V(P[k + 1], 0.09), T0 = V(P[k], top0), T1 = V(P[k + 1], top1);
      const nx = su * (i0[0] + i1[0]), nz = sv * (i0[1] + i1[1]), fx = A1[0] - A0[0], fz = A1[2] - A0[2];
      if (-fz * nx + fx * nz < 0) g.quad(A1, A0, T0, T1, 0xb6b2a8); else g.quad(A0, A1, T1, T0, 0xb6b2a8);
      if (fine) {
        upQ(g, [T0, T1, V(off(k + 1, -0.18), top1), V(off(k, -0.18), top0)], 0xcac6bc, 1);
        upQ(g, [V(P[k], 0.118), V(P[k + 1], 0.118), V(off(k + 1, 0.45), 0.118), V(off(k, 0.45), 0.118)], 0x99958c, 1); // L 字の側溝（コンクリート）
        if (info[k].cut && info[k + 1].cut) upQ(g, [V(off(k, -0.45), 0.123), V(off(k + 1, -0.45), 0.123), V(off(k + 1, -0.85), 0.123), V(off(k, -0.85), 0.123)], 0xe0b62a, 1); // 点字ブロック
      }
    }
  }
}
/** 曲がり角（円弧の道）：路面・両側の歩道（路側帯）・縁石・側溝 */
function bendBase(o: RoadBaseArgs): void {
  const { g, cx, cz, hA, kerbless, fine } = o, [bx, bz] = o.bend!, A = o.bendA ?? o.hw, SWd = SIDEWALK_W, n = fine ? 12 : 6;
  const kx = cx + bx * 15, kz = cz + bz * 15; // 円弧の中心（区画の角）
  const at = (t: number, r: number, off: number): V3 => { const wx = kx - bx * Math.cos(t) * r, wz = kz - bz * Math.sin(t) * r; return [wx, hA(wx, wz) + off, wz]; };
  const band = (r0: number, r1: number, off0: number, col: (k: number) => number, sh: number) => { for (let k = 0; k < n; k++) { const t0 = k / n * Math.PI / 2, t1 = (k + 1) / n * Math.PI / 2;
    upQ(g, [at(t0, r0, off0), at(t1, r0, off0), at(t1, r1, off0), at(t0, r1, off0)], col(k), sh); } };
  const road = o.stone ? 0x55524c : o.asph;
  band(15 - A, 15 + A, 0.1, () => road, o.shade);
  const wy = kerbless ? 0.1 : WALK_Y, wcol = (k: number) => kerbless ? (o.school ? 0x3d7f55 : mixHex(o.asph, 0x6b675f, 0.12)) : o.stone ? (k % 2 ? 0xae9888 : 0xbca898) : o.pave(k);
  band(15 + A, 15 + A + SWd, wy, wcol, kerbless ? o.shade : 1); band(Math.max(0.2, 15 - A - SWd), 15 - A, wy, wcol, kerbless ? o.shade : 1);
  if (kerbless) return;
  for (const [r, sgn] of [[15 + A, 1], [15 - A, -1]] as const) for (let k = 0; k < n; k++) { const t0 = k / n * Math.PI / 2, t1 = (k + 1) / n * Math.PI / 2;
    const a0 = at(t0, r, 0.09), a1 = at(t1, r, 0.09), b0 = at(t0, r, 0.22), b1 = at(t1, r, 0.22), mx = (a0[0] + a1[0]) / 2 - kx, mz = (a0[2] + a1[2]) / 2 - kz, nx = -sgn * mx, nz = -sgn * mz, fx = a1[0] - a0[0], fz = a1[2] - a0[2];
    if (-fz * nx + fx * nz < 0) g.quad(a1, a0, b0, b1, 0xb6b2a8); else g.quad(a0, a1, b1, b0, 0xb6b2a8);
    if (fine) upQ(g, [at(t0, r, 0.118), at(t1, r, 0.118), at(t1, r - sgn * 0.45, 0.118), at(t0, r - sgn * 0.45, 0.118)], 0x99958c, 1); }
}
