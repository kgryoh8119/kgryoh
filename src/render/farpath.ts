// v103：車線と歩道の上の位置（純粋な関数。精細な車・遠くの簡略な車・遠くの簡略な人で同じ答え。tests/v103_far.test.ts で確かめる）。
// 区画は 1 辺 T（30m）。prev→cur→next→nn と進む物の、cur→next の t（0〜1）での位置を返す。t < 0.5 は cur の区画の中、t ≥ 0.5 は next の区画の中。
// v102 の簡略な人・車は「区画の中心から次の区画の中心への直線を、いまの区画の幅だけ横へずらす」位置だったため、
//  ・生活道路から幹線へ入る区画の後ろ半分を生活道路の歩道の位置（中心から 3.7m）で歩き、幹線の車道の中を歩いていた
//  ・幹線の交差点から生活道路へ出ると、幹線の歩道の位置（8.7m）のまま生活道路の歩道の外（家の敷地）を歩いていた
//  ・曲がり角では区画の中心で向きが変わり、横へ飛んでいた（車も同じ）
// ここでは、区画ごとに描いた道の形（roadbase.ts：腕ごとの車道の半幅、交差点の隅切り、曲がり角の円弧、幅の変わる区画のすりつけ）に合わせる。
import { walkW } from './roadbase';

/** 道の形の問い合わせ（scene が作る。テストでは同じ作り方の小さな地図） */
export interface PathEnv {
  W: number; TILE: number;
  /** 区画 i の (dx, dz) の向きの腕の車道の半幅（腕が無ければ 0）。roadbase の aE・aW・aS・aN と同じ */
  armHW(i: number, dx: number, dz: number): number;
  /** 区画 i の車道の半幅（交差点はつながる道の広い方。roadbase の hw） */
  midHW(i: number): number;
  /** 区画 i が円弧の曲がり角として描かれているか（2 方向が直角につながる、高架でない区画） */
  bend(i: number): boolean;
}
export interface PathOut { x: number; z: number; dx: number; dz: number; /** walkPos：その所の歩道（路側帯）の幅 */ w?: number }
const dirOf = (W: number, a: number, b: number): [number, number] => [Math.sign(b % W - a % W), Math.sign(((b / W) | 0) - ((a / W) | 0))];
/** 来た向きの分からない（出発したばかりの）曲がり角の区画では、もう一方の腕から入ってきたとみなす（円弧の上に置く） */
function entryOf(e: PathEnv, c: number, d1: [number, number]): [number, number] {
  if (!e.bend(c)) return d1;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if ((dx !== d1[0] || dz !== d1[1]) && e.armHW(c, dx, dz) > 0) return [-dx, -dz];
  return d1;
}
/** 車道の半幅 h の道の、道の中心から車線の中心までの距離（scene.laneOff と同じ：幹線・6 車線の幅は外側 5.6m・内側 1.9m、2 車線 2.5m、生活道路 1.25m） */
export const laneOfHW = (h: number, lane: number) => (h >= 7 ? (lane ? 1.9 : 5.6) : h >= 4.5 ? 2.5 : 1.25);
/** 歩道（路側帯）の幅の中ほど：車道の半幅 h の道の、中心からの距離 */
export const walkMid = (h: number) => h + walkW(h) * 0.5;

/** 道の形の問い合わせを、道路の配列から作る（scene の rebuildRoads と同じ決め方：腕の半幅は min(交差点の幅, 隣の幅)、交差点の幅はつながる道の広い方）。
 *  road：区画の等級（1 生活道路・2 二車線・3 幹線/高速）、wide：二車線の区画のうち 6 車線の幅で描く区画、deck：高架の区画（円弧にしない）、gate：地図の端の出入り口 */
export function roadGeom(road: ArrayLike<number>, W: number, H: number, TILE: number, wide: { has(i: number): boolean }, deck?: { has(i: number): boolean }, gate?: readonly number[]): PathEnv {
  const HW = [0, 2.5, 5, 7.5];
  const hwAt = (j: number) => { const r = road[j]; return r === 2 && wide.has(j) ? HW[3] : HW[r] || 0; };
  /** (dx, dz) の向きのつながり：隣の区画の半幅（地図の外の出入り口は 7.5、無ければ 0） */
  const nb = (i: number, dx: number, dz: number) => { const x = i % W + dx, y = ((i / W) | 0) + dz; if (x < 0 || y < 0 || x >= W || y >= H) return gate && gate.includes(i) ? HW[3] : 0; return road[y * W + x] ? hwAt(y * W + x) : 0; };
  const nConn = (i: number) => (nb(i, 1, 0) ? 1 : 0) + (nb(i, -1, 0) ? 1 : 0) + (nb(i, 0, 1) ? 1 : 0) + (nb(i, 0, -1) ? 1 : 0);
  const mid = (i: number) => { let h = hwAt(i); if (nConn(i) >= 3) h = Math.max(h, nb(i, 1, 0), nb(i, -1, 0), nb(i, 0, 1), nb(i, 0, -1)); return h || 2.5; };
  return {
    W, TILE,
    armHW: (i, dx, dz) => { const n = nb(i, dx, dz); return n ? Math.min(mid(i), n) : 0; },
    midHW: mid,
    bend: i => { if (deck && deck.has(i)) return false; const e = !!nb(i, 1, 0), w = !!nb(i, -1, 0), s = !!nb(i, 0, 1), n = !!nb(i, 0, -1); return (e ? 1 : 0) + (w ? 1 : 0) + (s ? 1 : 0) + (n ? 1 : 0) === 2 && (e || w) && (s || n); },
  };
}

/** 車：prev→cur→next→nn の cur→next の t での車線の上の位置と向き（左側通行）。曲がり角の区画（円弧の道）は円弧の車線に沿う。
 *  交差点の右左折は車線どうしの交わる点を角に丸く（左折は小回り、右折は大回り）、行き止まりは右回りの半円で折り返す（v95〜v101 の scene.lanePath と同じ） */
export function lanePos(o: PathOut, e: PathEnv, prev: number, cur: number, next: number, nn: number, t: number, lane: number): PathOut {
  const W = e.W, T = e.TILE, H2 = T / 2, cxOf = (i: number) => (i % W + 0.5) * T, czOf = (i: number) => (((i / W) | 0) + 0.5) * T;
  if (cur === next) { o.x = cxOf(cur); o.z = czOf(cur); return o; }
  const dm = dirOf(W, cur, next); let c: number, d0: [number, number], d1: [number, number], sl: number;
  if (t < 0.5) { c = cur; d1 = dm; d0 = prev >= 0 && prev !== cur ? dirOf(W, prev, cur) : entryOf(e, cur, dm); sl = t * T; }
  else { c = next; d0 = dm; d1 = nn !== undefined && nn >= 0 && nn !== next ? dirOf(W, next, nn) : dm; sl = (t - 1) * T; }
  const cx = cxOf(c), cz = czOf(c);
  // v103：車線の位置は腕ごと（腕の車道の半幅から。交差点の中でも、入ってきた腕・出ていく腕の車線のまま。区画の境で隣の区画と同じ値になるので飛ばない）。
  // 直線の区画で両端の幅が違うときは、roadbase の縁石と同じく区画の中ですりつける。前は交差点の区画の等級の車線（幹線なら 5.6m）を、入ってくる生活道路の側にも使っていた
  const m = e.midHW(c), armL = (dx: number, dz: number) => laneOfHW(e.armHW(c, dx, dz) || m, lane);
  const junc = (e.armHW(c, 1, 0) ? 1 : 0) + (e.armHW(c, -1, 0) ? 1 : 0) + (e.armHW(c, 0, 1) ? 1 : 0) + (e.armHW(c, 0, -1) ? 1 : 0) >= 3;
  const offAt = (dx: number, dz: number, q: number) => { const a = armL(dx, dz); return junc ? a : a + (laneOfHW(m, lane) - a) * (1 - Math.min(1, Math.abs(q) / H2)); };
  const l0x = d0[1], l0z = -d0[0], l1x = d1[1], l1z = -d1[0]; // 進む向きの左
  const P0 = (q: number, f: number) => { o.x = cx + d0[0] * q + l0x * f; o.z = cz + d0[1] * q + l0z * f; o.dx = d0[0]; o.dz = d0[1]; };
  const P1 = (q: number, f: number) => { o.x = cx + d1[0] * q + l1x * f; o.z = cz + d1[1] * q + l1z * f; o.dx = d1[0]; o.dz = d1[1]; };
  const dot = d0[0] * d1[0] + d0[1] * d1[1];
  if (dot > 0.5) { P1(sl, sl < 0 ? offAt(-d0[0], -d0[1], sl) : offAt(d1[0], d1[1], sl)); return o; }
  if (dot < -0.5) { // 行き止まりの折り返し：手前で右回りに半円を描いて、反対向きの車線へ
    const off = armL(-d0[0], -d0[1]), r = off + 1;
    if (sl <= -r) P0(sl, offAt(-d0[0], -d0[1], sl)); else if (sl >= r) P1(sl, offAt(d1[0], d1[1], sl));
    else { const th = Math.PI * (sl + r) / (2 * r), cs = Math.cos(th), sn = Math.sin(th), ax = cx - d0[0] * r, az = cz - d0[1] * r;
      o.x = ax + l0x * off * cs + d0[0] * off * sn; o.z = az + l0z * off * cs + d0[1] * off * sn; o.dx = -l0x * sn + d0[0] * cs; o.dz = -l0z * sn + d0[1] * cs; }
    return o;
  }
  const left = d1[0] * l0x + d1[1] * l0z > 0;
  if (e.bend(c)) { // v103：円弧の曲がり角（roadbase の bendBase：区画の角を中心に半径 15m、半幅は両腕の狭い方）。車線は半径 15 ∓ 車線の位置の円弧
    const off = laneOfHW(Math.min(e.armHW(c, -d0[0], -d0[1]) || m, e.armHW(c, d1[0], d1[1]) || m), lane);
    arcAt(o, cx, cz, d0, d1, H2, H2 - (left ? 1 : -1) * off, sl); return o;
  }
  // 右左折：入ってきた腕の車線と出ていく腕の車線の交わる点 K を角にして、手前 A から先 B へ丸く曲がる（左折は小回り、右折は大回り）
  const oi = armL(-d0[0], -d0[1]), oo = armL(d1[0], d1[1]), Wd = left ? Math.max(oi, oo) + 3 : 7;
  if (sl <= -Wd) { P0(sl, oi); return o; } if (sl >= Wd) { P1(sl, oo); return o; }
  const kx = cx + l0x * oi + l1x * oo, kz = cz + l0z * oi + l1z * oo;
  const ax = cx + d0[0] * -Wd + l0x * oi, az = cz + d0[1] * -Wd + l0z * oi, bx = cx + d1[0] * Wd + l1x * oo, bz = cz + d1[1] * Wd + l1z * oo;
  const u = (sl + Wd) / (2 * Wd), v = 1 - u;
  o.x = v * v * ax + 2 * v * u * kx + u * u * bx; o.z = v * v * az + 2 * v * u * kz + u * u * bz;
  const tx = v * (kx - ax) + u * (bx - kx), tz = v * (kz - az) + u * (bz - kz), tl = Math.hypot(tx, tz) || 1; o.dx = tx / tl; o.dz = tz / tl;
  return o;
}
/** 円弧の曲がり角の上の位置：d0 の向きで入り d1 の向きへ出る区画の、区画の角（入ってきた側と出ていく側の間）を中心とする半径 r の円弧。sl は −H2〜H2 */
function arcAt(o: PathOut, cx: number, cz: number, d0: [number, number], d1: [number, number], H2: number, r: number, sl: number): void {
  const kx = cx + (d1[0] - d0[0]) * H2, kz = cz + (d1[1] - d0[1]) * H2, ph = (sl + H2) / (2 * H2) * Math.PI / 2, cs = Math.cos(ph), sn = Math.sin(ph);
  // 角から見て、入口は −d1 の向き、出口は d0 の向き
  o.x = kx - d1[0] * r * cs + d0[0] * r * sn; o.z = kz - d1[1] * r * cs + d0[1] * r * sn;
  o.dx = d1[0] * sn + d0[0] * cs; o.dz = d1[1] * sn + d0[1] * cs;
}

/** 歩く人：prev→cur→next→nn の cur→next の t での歩道（路側帯）の上の位置と向き。sg：進む向きの左（1）か右（−1）の歩道。
 *  ・直進：腕の歩道の幅の中ほど。幅の違う道へすりつける区画（直線）は roadbase と同じく区画の中で寄せる
 *  ・交差点の右左折：入ってきた腕の歩道の線と出ていく腕の歩道の線の交わる角で曲がる（内側の角は渡らずに曲がり、外側の角は横断歩道の位置で 2 本の道を渡る）
 *  ・円弧の曲がり角：円弧の歩道に沿う
 *  ・折り返し（行き止まり・来た道へ戻る）：その場で向きを変える。呼ぶ側は折り返しの区画に入るとき sg の符号を変える（同じ側の歩道に残る） */
export function walkPos(o: PathOut, e: PathEnv, prev: number, cur: number, next: number, nn: number, t: number, sg: number): PathOut {
  const W = e.W, T = e.TILE, H2 = T / 2, cxOf = (i: number) => (i % W + 0.5) * T, czOf = (i: number) => (((i / W) | 0) + 0.5) * T;
  if (cur === next) { // 動かない（行き先の区画に着いて建物へ入る所など）：つながる腕の歩道の上（交差点の中・曲がり角の円弧にかからない、腕の先の方）
    let d: [number, number] = [0, 1]; for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (e.armHW(cur, dx, dz) > 0) { d = [dx, dz]; break; }
    const h = e.armHW(cur, d[0], d[1]) || e.midHW(cur), f = walkMid(h) * sg, q = H2 * 0.8; o.x = cxOf(cur) + d[0] * q + d[1] * f; o.z = czOf(cur) + d[1] * q - d[0] * f; o.dx = d[0]; o.dz = d[1]; o.w = walkW(h); return o; }
  const dm = dirOf(W, cur, next); let c: number, d0: [number, number], d1: [number, number], sl: number;
  if (t < 0.5) { c = cur; d1 = dm; d0 = prev >= 0 && prev !== cur ? dirOf(W, prev, cur) : entryOf(e, cur, dm); sl = t * T; }
  else { c = next; d0 = dm; d1 = nn >= 0 && nn !== next ? dirOf(W, next, nn) : dm; sl = (t - 1) * T; }
  const cx = cxOf(c), cz = czOf(c), dot = d0[0] * d1[0] + d0[1] * d1[1];
  /** 直線の歩道の線の、中心からの横の距離：腕 (ax, az) の側の半分、歩く側 (lx, lz)、中心からの距離 q */
  const straight = (ax: number, az: number, lx: number, lz: number, q: number) => {
    const m = e.midHW(c), a = e.armHW(c, ax, az) || m, b = e.armHW(c, lx, lz); o.w = walkW(a);
    const junc = (e.armHW(c, 1, 0) ? 1 : 0) + (e.armHW(c, -1, 0) ? 1 : 0) + (e.armHW(c, 0, 1) ? 1 : 0) + (e.armHW(c, 0, -1) ? 1 : 0) >= 3;
    if (junc && b > 0) return walkMid(a); // 交差点の、横の腕がある角：腕の縁石は真っすぐ（隅切りまで）
    const mm = junc ? Math.max(e.armHW(c, ax, az), e.armHW(c, -ax, -az)) || m : m; // 腕の先から区画の中心へ、中心の幅（roadbase の midV・hw）へすりつける
    return walkMid(a) + (walkMid(mm) - walkMid(a)) * (1 - Math.min(1, Math.abs(q) / H2));
  };
  if (dot > 0.5 || dot < -0.5) {
    const d = sl < 0 ? d0 : d1, lx = d[1] * sg, lz = -d[0] * sg, ax = sl < 0 ? -d0[0] : d1[0], az = sl < 0 ? -d0[1] : d1[1];
    const f = straight(ax, az, lx, lz, sl);
    o.x = cx + d[0] * sl + lx * f; o.z = cz + d[1] * sl + lz * f; o.dx = d[0]; o.dz = d[1]; return o;
  }
  const l0x = d0[1] * sg, l0z = -d0[0] * sg, l1x = d1[1] * sg, l1z = -d1[0] * sg; // 歩く側（左右）の向き
  if (e.bend(c)) { // 円弧の曲がり角：円弧の歩道（半径 15 ∓ 歩道の中ほど）
    const A = Math.min(e.armHW(c, -d0[0], -d0[1]) || e.midHW(c), e.armHW(c, d1[0], d1[1]) || e.midHW(c)), inner = d1[0] * l0x + d1[1] * l0z > 0;
    arcAt(o, cx, cz, d0, d1, H2, H2 + (inner ? -1 : 1) * walkMid(A), sl); o.w = walkW(A); return o;
  }
  // 交差点の右左折：入ってきた腕の歩道の線（d0 の向き、横 f0）と出ていく腕の歩道の線（d1 の向き、横 f1）の交わる角 K で曲がる
  const h0 = e.armHW(c, -d0[0], -d0[1]) || e.midHW(c), h1 = e.armHW(c, d1[0], d1[1]) || e.midHW(c), f0 = walkMid(h0), f1 = walkMid(h1);
  const k0 = (l1x * d0[0] + l1z * d0[1]) * f1, k1 = (l0x * d1[0] + l0z * d1[1]) * f0; // K の d0 の向きの座標、d1 の向きの座標
  const L0 = k0 + H2, L1 = H2 - k1, lam = (sl + H2) / T * (L0 + L1);
  if (lam <= L0) { const q = -H2 + lam; o.w = walkW(h0); o.x = cx + d0[0] * q + l0x * f0; o.z = cz + d0[1] * q + l0z * f0; o.dx = d0[0]; o.dz = d0[1]; }
  else { const q = k1 + lam - L0; o.w = walkW(h1); o.x = cx + d1[0] * q + l1x * f1; o.z = cz + d1[1] * q + l1z * f1; o.dx = d1[0]; o.dz = d1[1]; }
  return o;
}
