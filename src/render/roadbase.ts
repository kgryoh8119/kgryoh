// v95：路面・歩道・縁石の形。区画を 4 つの象限に分け、象限ごとに「車道の端（縁石）」の折れ線を作って、路面・歩道・縁石・側溝を描く
import type { Geo, V3 } from './geo';

const mixHex = (a: number, b: number, t: number) => { const f = (k: number) => Math.round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
/** 歩道の幅の最小（m）。生活道路の路側帯と同じ（v95 以前の scene の SW と同じ値） */
export const SIDEWALK_W = 2.5;
/** v101：歩道の幅（m）を車道の半幅 ah（等級）から決める。道路構造令の目安（歩行者の多い道 3.5m 以上、その他 2m 以上）に合わせ、
 *  幹線（4 車線・立体交差の前後の 6 車線の幅：半幅 7.5m）は 3.5m、2 車線（半幅 5m）は 3.0m、生活道路（半幅 2.5m、路側帯）は 2.5m。
 *  区画ごとではなく等級ごとに一定なので、同じ通りの区画の境で段違いにならない。歩行者の歩く位置・橋脚の位置・バス停もここから出す */
export function walkW(ah: number): number { return ah >= 7 ? 3.5 : ah >= 4.5 ? 3.0 : SIDEWALK_W; }
/** 交差点の角の隅切り（縁石の円弧）の半径（m）。v101：3→4m。どの等級の歩道（〜3.5m）より大きくし、歩道の外の端も同じ中心の円弧で回す（角でも歩道の幅が一定） */
export const CORNER_R = 4;
/** 歩道の天端の高さ（路面 0.1 から 10cm 上）。切り下げ（横断歩道の端）は 0.115 */
export const WALK_Y = 0.2;
/** v101：横断歩道の幅（m。歩く向きと直角の長さ）。標識令の目安は 4m 以上（やむを得ない所は 3m）。生活道路は 3m */
export function xwWidth(ah: number): number { return ah >= 4.5 ? 4 : 3; }
/** v101：横断歩道の縞（幅 0.45m・間隔 0.45m）と、横断歩道の手前の停止線までの間（標示の運用の目安 1〜2m） */
export const XW_STRIPE = 0.45, XW_GAP = 0.45, STOP_GAP = 1.5, STOP_W = 0.45;
/** 横断歩道を交差する道の縁石から離す距離（隅切りの円弧の途中の切り下げから始める） */
const XW_SET = 1.0;
/** 交差点の横断歩道の範囲（区画の中心から腕の向きの距離 [x0, x1]）。perp：横切る道（直交する腕）の半幅の大きい方。ah：この腕の車道の半幅。
 *  横断歩道は隅切りの円弧の途中（歩道の切り下げ）から始まる。v101：幹線どうし（perp 7.5m）でも停止線まで区画の半分（15m）に収まる */
export function xwRange(ah: number, perp: number): [number, number] { const x0 = perp + XW_SET; return [x0, x0 + xwWidth(ah)]; }
/** v101：交差点の 1 本の腕の標示の配置（純粋な関数。描画とテストで同じ答え）。
 *  xw：横断歩道の範囲、stop：停止線の範囲（横断歩道の外の端から STOP_GAP 手前）、stripes：縞の横の範囲（車道の端から端まで）。
 *  どれも区画の中心から 15m（隣の区画との境）の内に収まるので、隣り合う交差点の標示と重ならない */
export function crosswalkLayout(ah: number, perp: number): { xw: [number, number]; stop: [number, number]; stripes: [number, number][] } {
  const xw = xwRange(ah, perp), s0 = xw[1] + STOP_GAP, stripes: [number, number][] = [];
  for (let k = -ah + 0.5; k + XW_STRIPE <= ah - 0.3 + 1e-6; k += XW_STRIPE + XW_GAP) stripes.push([k, k + XW_STRIPE]);
  return { xw, stop: [s0, s0 + STOP_W], stripes };
}
/** v103：交差点の腕ごとの横断歩道（純粋な関数。roadTile・roadBase・手前の区画のダイヤマークで同じ答え）。返り値はビット：1 東・2 西・4 南・8 北の腕を横切る横断歩道。
 *  e・w・s・n：その向きの腕の先の道の等級（0 腕なし・1 生活道路・2 二車線・3 幹線）、sig：信号のある交差点、near：学校・保育所・駅の近く。
 *  ・信号のある交差点、学校・駅の近く：つながる腕のすべて
 *  ・二車線以上の道が通る交差点（幹線と脇の道を含む）：つながる腕のすべて（幹線を渡る横断歩道と、幹線の歩道を歩く人が脇の道の入口を渡る横断歩道）
 *  ・生活道路どうし（一時停止の交差点）：引かない（日本の住宅地に多い形。歩く人は路側帯から交差点をそのまま渡る）
 *  v101 までは、生活道路どうしでも 35% の交差点に引いていた */
export function crosswalkArms(o: { e: number; w: number; s: number; n: number; sig: boolean; near: boolean; stone: boolean }): number {
  const arms = (o.e ? 1 : 0) | (o.w ? 2 : 0) | (o.s ? 4 : 0) | (o.n ? 8 : 0), nConn = (o.e ? 1 : 0) + (o.w ? 1 : 0) + (o.s ? 1 : 0) + (o.n ? 1 : 0);
  if (nConn < 3 || o.stone) return 0;
  if (o.sig || o.near || Math.max(o.e, o.w, o.s, o.n) >= 2) return arms;
  return 0;
}
/** 交差点の角の歩道の中ほど（象限の座標 |u|, |v|）。b：南北の腕の半幅、a：東西の腕の半幅（0 は無い腕）。信号機・標識の柱の位置。
 *  v101：歩道の幅は腕の等級ごと（walkW）。角は隅切りの円弧の中心から、歩道の幅の半分だけ内 */
export function cornerSpot(a: number, b: number, hw: number): [number, number] {
  const wa = walkW(a || hw), wb = walkW(b || hw);
  if (a && b) { const k = (CORNER_R - (wa + wb) * 0.25) / Math.SQRT2; return [b + CORNER_R - k, a + CORNER_R - k]; }
  return [(b || hw) + wb * 0.7, (a || hw) + wa * 0.7];
}
/** v101：信号機を置く交差点（純粋な関数。v86 の車・人の信号停止と v89 の灯の切り替えは、scene の signals() を通してこの答えだけを使う）。
 *  ・3 方向以上に道路がつながり、東西の道と南北の道がどちらも 2 車線以上（幹線どうし）の交差点だけ。生活道路との交差点は一時停止（止まれ）
 *  ・信号機設置の指針の目安（隣の信号と 150m 以上）に合わせ、同じ通りで 5 区画（150m）未満に並ぶ候補は、交わる道の広い方（同じなら番号の小さい方）を残す
 *  返り値：1＝信号あり */
export function sigPlan(road: ArrayLike<number>, W: number, H: number, wide?: { has(i: number): boolean }): Uint8Array {
  const N = W * H, out = new Uint8Array(N), cls = (i: number) => (road[i] === 2 && wide?.has(i) ? 3 : road[i]);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? cls(y * W + x) : 0);
  const cand: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    if (!road[i]) continue;
    const x = i % W, y = (i / W) | 0, e = at(x + 1, y), w = at(x - 1, y), so = at(x, y + 1), no = at(x, y - 1);
    const n = (e ? 1 : 0) + (w ? 1 : 0) + (so ? 1 : 0) + (no ? 1 : 0), ew = Math.max(e, w), ns = Math.max(so, no);
    // 東西の道・南北の道のどちらも 2 車線以上（T 字は突き当たる道も 2 車線以上）
    if (n >= 3 && Math.min(ew, ns) >= 2) cand.push([i, ew + ns]);
  }
  cand.sort((p, q) => q[1] - p[1] || p[0] - q[0]);
  const SPACE = 5;
  for (const [i] of cand) {
    const x = i % W, y = (i / W) | 0; let ok = true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { for (let k = 1; k < SPACE && ok; k++) { const xx = x + dx * k, yy = y + dy * k; if (!at(xx, yy)) break; if (out[yy * W + xx]) ok = false; } if (!ok) break; }
    if (ok) out[i] = 1;
  }
  return out;
}
export interface RoadBaseArgs {
  g: Geo; cx: number; cz: number; hw: number; aE: number; aW: number; aS: number; aN: number; nConn: number;
  kerbless: boolean; stone: boolean; school: boolean;
  /** v103：横断歩道を引く腕（crosswalkArms のビット：1 東・2 西・4 南・8 北） */
  xwArms: number; fine: boolean; hA: (x: number, z: number) => number;
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
  const { g, cx, cz, hw, hA, kerbless, fine } = o, R = CORNER_R, junction = o.nConn >= 3;
  const midV = junction ? Math.max(o.aE, o.aW) : hw, midU = junction ? Math.max(o.aS, o.aN) : hw;
  const pieceN = fine ? 8 : 4, ramp = (d: number, d0: number) => Math.max(0, Math.min(1, (d - d0) / Math.max(1, 15 - d0)));
  const road = o.stone ? (hw <= 2.5 ? 0x8d877c : 0x55524c) : o.asph;
  for (const su of [1, -1]) for (const sv of [1, -1]) {
    const a = su > 0 ? o.aE : o.aW, b = sv > 0 ? o.aS : o.aN, aO = su > 0 ? o.aW : o.aE, bO = sv > 0 ? o.aN : o.aS;
    // 横断歩道の切り下げ：この象限の東西の腕（xwE）・南北の腕（xwN）に横断歩道があるとき（v103：腕ごと）
    const xwE = junction && (o.xwArms & (su > 0 ? 1 : 2)) ? xwRange(Math.max(o.aE, o.aW), Math.max(o.aN, o.aS)) : null, xwN = junction && (o.xwArms & (sv > 0 ? 4 : 8)) ? xwRange(Math.max(o.aN, o.aS), Math.max(o.aE, o.aW)) : null;
    // v101：歩道の幅は腕の等級ごと（東西の腕 wa、南北の腕 wb）。直線の区画で両端の幅が違うときは、区画の中でなめらかに変える
    const wa = walkW(a || midV), wb = walkW(b || midU), SWd = Math.max(wa, wb);
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
    if (a && b) { // 隅切りの角：歩道の外の端は縁石の円弧と同じ中心の円弧（半径 R − 歩道の幅）。両方の腕の歩道の幅が違うときは円弧の中で移す
      const ci: P2 = [b + R, a + R];
      seg([15, a], [b + R, a], [15, a + wa], [b + R, a + wa], cE, 0);
      for (let k = 1; k <= pieceN; k++) { const t = -Math.PI / 2 - Math.PI / 2 * k / pieceN, c = Math.cos(t), s2 = Math.sin(t), w = wa + (wb - wa) * k / pieceN; P.push([ci[0] + c * R, ci[1] + s2 * R]); Q.push([ci[0] + c * (R - w), ci[1] + s2 * (R - w)]); }
      seg([b, a + R], [b, 15], [b + wb, a + R], [b + wb, 15], cN, 1);
    } else if (a) seg([15, a], [0, midV], [15, a + walkW(a)], [0, midV + walkW(midV)], cE, 0);       // 東西の腕だけ（直線・T 字の突き当たりの側）
    else if (b) seg([midU, 0], [b, 15], [midU + walkW(midU), 0], [b + walkW(b), 15], cN, 1);         // 南北の腕だけ
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
      const lo = Math.max(lowE && p[1] <= a + wa + 0.01 ? ramp(Math.min(p[0], q[0]), b ? b + R : midU) : 0, lowN && p[0] <= b + wb + 0.01 ? ramp(Math.min(p[1], q[1]), a ? a + R : midV) : 0);
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
  const { g, cx, cz, hA, kerbless, fine } = o, [bx, bz] = o.bend!, A = o.bendA ?? o.hw, SWd = walkW(A), n = fine ? 12 : 6;
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
