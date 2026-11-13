// v88：列車の車体を箱・板・断面の押し出しで作る。通勤形（ステンレス・4 扉）・近郊形（3 扉・クロスシートの窓割り）・特急形（流線形の先頭・連続窓）・
// ディーゼルカー（塗装車・パンタ無し・屋根の排気管）・貨物（電気機関車・コンテナ車・タンク車）・モノレール（跨座式）・新交通（ゴムタイヤ）・SL の客車（旧型客車）。
// 座標は x 左右・y 前（+y が前）・z 上で、z=0 がレール面（車輪の下端）。面の種類は TRAIN_PART の番号（0 は編成ごとの色が掛かる）。
// 品質 q：0（低）は細部を省く、1（中）、2（高）は前面のワイパー・手すり、側面の車番・優先席、屋根の配管、台車の軸箱・ブレーキまで。
import type { CarMesh } from './cargen';

type V3 = number[];
const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], crs = (a: V3, b: V3) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a: V3) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mesh = (): CarMesh => ({ V: [], F: [] });
function emit(M: CarMesh, a: number, b: number, c: number, t: number, out: V3): void { const A = M.V[a], n = crs(sub(M.V[b], A), sub(M.V[c], A)); M.F.push(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? [a, b, c, t] : [a, c, b, t]); }
function quadV(M: CarMesh, p: V3[], t: number, out: V3): void { const i = p.map(q => M.V.push([q[0], q[1], q[2]]) - 1); emit(M, i[0], i[1], i[2], t, out); emit(M, i[0], i[2], i[3], t, out); }
function hex8(M: CarMesh, p: V3[], T: number[]): void {
  const i = p.map(q => M.V.push([q[0], q[1], q[2]]) - 1), c = [0, 1, 2].map(k => p.reduce((s, q) => s + q[k], 0) / 8);
  const Q: [number, number, number, number, number][] = [[0, 1, 2, 3, T[0]], [4, 5, 6, 7, T[1]], [0, 1, 5, 4, T[2]], [1, 2, 6, 5, T[3]], [2, 3, 7, 6, T[4]], [3, 0, 4, 7, T[5]]];
  for (const [a, b, d, e, t] of Q) { const m = [0, 1, 2].map(k => (p[a][k] + p[b][k] + p[d][k] + p[e][k]) / 4 - c[k]); emit(M, i[a], i[b], i[d], t, m); emit(M, i[a], i[d], i[e], t, m); }
}
/** 下の長方形 b=[x0,x1,y0,y1]（高さ z0）と上の長方形 u（z1）をつなぐ箱。t は 1 つか [前, 後, 左右, 上, 下] */
function frus(M: CarMesh, b: number[], z0: number, u: number[], z1: number, t: number | number[]): void {
  const T = Array.isArray(t) ? t : [t, t, t, t, t];
  hex8(M, [[b[0], b[2], z0], [b[1], b[2], z0], [b[1], b[3], z0], [b[0], b[3], z0], [u[0], u[2], z1], [u[1], u[2], z1], [u[1], u[3], z1], [u[0], u[3], z1]], [T[4], T[3], T[1], T[2], T[0], T[2]]);
}
const box = (M: CarMesh, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, t: number | number[]) => frus(M, [Math.min(x0, x1), Math.max(x0, x1), y0, y1], z0, [Math.min(x0, x1), Math.max(x0, x1), y0, y1], z1, t);
function limb(M: CarMesh, a: V3, b: V3, w: number, t: number): void {
  const d = nrm(sub(b, a)); let s = crs(d, [0, 0, 1]); if (Math.hypot(s[0], s[1], s[2]) < 0.2) s = crs(d, [1, 0, 0]); s = nrm(s); const u = nrm(crs(s, d)), P: V3[] = [];
  for (const e of [a, b]) for (const [ks, ku] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push([e[0] + (s[0] * ks + u[0] * ku) * w, e[1] + (s[1] * ks + u[1] * ku) * w, e[2] + (s[2] * ks + u[2] * ku) * w]);
  hex8(M, P, [t, t, t, t, t, t]);
}
/** 横の面の板（x = sx*xo） */
const side = (M: CarMesh, sx: number, y0: number, y1: number, z0: number, z1: number, t: number, xo: number) => quadV(M, [[sx * xo, y0, z0], [sx * xo, y1, z0], [sx * xo, y1, z1], [sx * xo, y0, z1]], t, [sx, 0, 0]);
/** 前（dir=1）か後ろ（-1）の面の板 */
const endQ = (M: CarMesh, x0: number, x1: number, y: number, z0: number, z1: number, t: number, dir: number) => quadV(M, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], t, [0, dir, 0]);
/** 車輪（軸は x）。外側の面に輪心。t はタイヤ、hub は輪心の面 */
function wheel(M: CarMesh, cx: number, y: number, r: number, w: number, N: number, sx: number, t = 5, hub = 6, zc = r): void {
  const xo = cx + sx * w / 2, xi = cx - sx * w / 2, ro: number[] = [], ri: number[] = [];
  for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); ro.push(M.V.push([xo, y + c * r, zc + s * r]) - 1); ri.push(M.V.push([xi, y + c * r, zc + s * r]) - 1); }
  const hc = M.V.push([xo + sx * 0.03, y, zc]) - 1; // 輪心は外へ少しふくらむ（面は 3N 枚）
  for (let k = 0; k < N; k++) { const j = (k + 1) % N, a = ((k + 0.5) / N) * Math.PI * 2, o = [0, Math.cos(a), Math.sin(a)];
    emit(M, ro[k], ro[j], ri[j], t, o); emit(M, ro[k], ri[j], ri[k], t, o); emit(M, hc, ro[k], ro[j], hub, [sx, 0, 0]); }
}
/** 断面（x,z の閉じた凸多角形）を y に沿って押し出す。T(区間, 辺) で面の種類。cap で最初（-1）・最後（1）の断面を閉じる */
function loft(M: CarMesh, ys: number[], secs: number[][][], T: (s: number, e: number) => number, cap: number[] = []): void {
  const P = secs[0].length;
  for (let s = 0; s + 1 < ys.length; s++) {
    const A = secs[s], B = secs[s + 1], cz = (A.reduce((a, p) => a + p[1], 0) + B.reduce((a, p) => a + p[1], 0)) / (2 * P);
    for (let e = 0; e < P; e++) { const f = (e + 1) % P, mx = (A[e][0] + A[f][0] + B[e][0] + B[f][0]) / 4, mz = (A[e][1] + A[f][1] + B[e][1] + B[f][1]) / 4;
      quadV(M, [[A[e][0], ys[s], A[e][1]], [A[f][0], ys[s], A[f][1]], [B[f][0], ys[s + 1], B[f][1]], [B[e][0], ys[s + 1], B[e][1]]], T(s, e), [mx, (ys[s + 1] - ys[s]) * 0.02, mz - cz]); }
  }
  for (const c of cap) { const k = c < 0 ? 0 : ys.length - 1, S = secs[k], y = ys[k], cx = S.reduce((a, p) => a + p[0], 0) / P, cz = S.reduce((a, p) => a + p[1], 0) / P, ci = M.V.push([cx, y, cz]) - 1, ii = S.map(p => M.V.push([p[0], y, p[1]]) - 1);
    for (let e = 0; e < P; e++) emit(M, ci, ii[e], ii[(e + 1) % P], T(-1, e), [0, c, 0]); }
}
/** 車体の断面（10 角）：下・下の側面・帯・上の側面・肩・屋根。辺の番号 0 下、1/9 下の側面、2/8 帯、3/7 上の側面、4/6 肩、5 屋根 */
const sec10 = (hw: number, zb: number, zs: number, zt: number, b0: number, b1: number, sh = 0.72): number[][] => {
  const c0 = Math.min(Math.max(b0, zb + 0.01), zs - 0.02), c1 = Math.min(Math.max(b1, c0 + 0.01), zs - 0.01);
  return [[-hw, zb], [hw, zb], [hw, c0], [hw, c1], [hw, zs], [hw * sh, zt], [-hw * sh, zt], [-hw, zs], [-hw, c1], [-hw, c0]];
};
/** 円（タンク・丸屋根）の断面 */
const circ = (r: number, zc: number, n: number, sz = 1): number[][] => Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; return [Math.cos(a) * r, zc + Math.sin(a) * r * sz]; });
/** 前後に反転した写しを足す（両運転台の車・機関車） */
function mirrorAdd(M: CarMesh, P: CarMesh): void { const o = M.V.length; for (const v of P.V) M.V.push([v[0], -v[1], v[2]]); for (const f of P.F) M.F.push([f[0] + o, f[2] + o, f[1] + o, f[3]]); }
function merge(M: CarMesh, P: CarMesh): void { const o = M.V.length; for (const v of P.V) M.V.push([v[0], v[1], v[2]]); for (const f of P.F) M.F.push([f[0] + o, f[1] + o, f[2] + o, f[3]]); }

/** 面の種類：0 編成の色（帯・塗装・コンテナ）1 窓ガラス 2 屋根の銀・クーラー 3 床下機器 4 台車の枠 5 黒 6 暗い灰 7 ステンレスの車体 8 白い塗装 9 前照灯 10 尾灯
 * 11 行先表示（LED）12 ドア（ステンレス）13 幌 14 黄（優先席・警戒）15 クリーム 16 灰の塗装（屋根） 17 タンクの黒 18 開いたドアの中 19 碍子 20 車輪の踏面 */
export const TRAIN_PART = [0xffffff, 0x1e2a33, 0xc3c8cd, 0x2a2a2c, 0x4c5156, 0x16181c, 0x3a3d40, 0xd9dde1, 0xf2f2ee, 0xfff4cc, 0xb81c18, 0xf2a33a, 0xc2c7cc, 0x302e2c, 0xeec00e, 0xeee2c2, 0x8a8f94, 0x222427, 0xa89a80, 0xe8e2d4, 0x6a6c70];

/** 屋根のクーラー（集中式）：箱と面取り、上に送風機 2 つ、側面のルーバー */
function cooler(M: CarMesh, y: number, hl: number, hw: number, z: number, h: number, q: number, t = 2): void {
  box(M, -hw, hw, y - hl, y + hl, z, z + h - 0.08, t); frus(M, [-hw, hw, y - hl, y + hl], z + h - 0.08, [-hw + 0.12, hw - 0.12, y - hl + 0.12, y + hl - 0.12], z + h, t);
  if (q >= 1) for (const o of [-0.5, 0.5]) { const yy = y + o * hl; box(M, -0.32, 0.32, yy - 0.32, yy + 0.32, z + h, z + h + 0.03, 6); }
  if (q >= 2) for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) { const y0 = y - hl + 0.25 + k * (2 * hl - 0.5) / 3; side(M, sx, y0 + 0.06, y0 + (2 * hl - 0.5) / 3 - 0.06, z + 0.07, z + h - 0.14, 6, hw + 0.005); }
}
/** シングルアームのパンタグラフ（台枠・碍子 4 つ・下枠・上枠・舟）。zH が舟の上（架線のすぐ下） */
function pantoS(M: CarMesh, y: number, z: number, zH: number, q: number): void {
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(M, sx * 0.5 - 0.07, sx * 0.5 + 0.07, y + sy * 0.55 - 0.07, y + sy * 0.55 + 0.07, z, z + 0.22, 19);
  box(M, -0.6, 0.6, y - 0.68, y + 0.68, z + 0.22, z + 0.3, 6);
  const kz = z + 0.3 + (zH - z - 0.3) * 0.45, ky = y + 0.95;
  for (const sx of [-1, 1]) limb(M, [sx * 0.18, y - 0.5, z + 0.34], [sx * 0.06, ky, kz], 0.045, 6); // 下枠
  limb(M, [0, ky, kz], [0, y - 0.15, zH - 0.12], 0.035, 6); limb(M, [-0.2, ky - 0.05, kz], [0.2, ky - 0.05, kz], 0.03, 6); // 上枠・関節
  box(M, -0.62, 0.62, y - 0.32, y - 0.16, zH - 0.12, zH - 0.08, 6); for (const yy of [y - 0.3, y - 0.18]) box(M, -0.78, 0.78, yy - 0.025, yy + 0.025, zH - 0.06, zH, 20); // 舟とすり板
  for (const sx of [-1, 1]) limb(M, [sx * 0.78, y - 0.24, zH - 0.03], [sx * 1.0, y - 0.24, zH - 0.22], 0.025, 6); // 舟の角
  if (q >= 2) limb(M, [0.25, y - 0.45, z + 0.32], [0.12, y + 0.2, kz - 0.4], 0.02, 5); // 主ばね・ダンパ
}
/** 菱形のパンタグラフ（機関車・古い電車） */
function pantoR(M: CarMesh, y: number, z: number, zH: number): void {
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) box(M, sx * 0.55 - 0.07, sx * 0.55 + 0.07, y + sy * 0.6 - 0.07, y + sy * 0.6 + 0.07, z, z + 0.22, 19);
  box(M, -0.65, 0.65, y - 0.72, y + 0.72, z + 0.22, z + 0.3, 6); const zm = (z + 0.3 + zH) / 2;
  for (const sx of [-0.45, 0.45]) for (const sy of [-1, 1]) { limb(M, [sx, y + sy * 0.55, z + 0.32], [sx, y + sy * 0.95, zm], 0.035, 6); limb(M, [sx, y + sy * 0.95, zm], [sx, y + sy * 0.2, zH - 0.08], 0.03, 6); }
  box(M, -0.8, 0.8, y - 0.22, y + 0.22, zH - 0.08, zH, 20); for (const sx of [-1, 1]) limb(M, [sx * 0.8, y, zH - 0.04], [sx * 1.02, y, zH - 0.22], 0.025, 6);
}
/** 台車：側枠・軸箱・空気ばね・横はり・ブレーキ・車輪。kind：0 ボルスタレス（電車）1 コイルばね（客車・貨車）2 機関車 3 ゴムタイヤ（新交通）*/
function bogie(M: CarMesh, yb: number, N: number, q: number, kind: number, motor = false, zTop = 1.0): void {
  if (kind === 3) { // 新交通：走行輪（ゴム）と案内輪
    for (const yw of [yb - 0.0]) for (const sx of [-1, 1]) { wheel(M, sx * 0.85, yw, 0.42, 0.3, Math.max(8, N), sx, 5, 6, 0.22); if (q >= 1) wheel(M, sx * 0.25, yw, 0.18, 0.1, 8, sx, 5, 6, -0.02); }
    box(M, -0.62, 0.62, yb - 0.35, yb + 0.35, 0.3, zTop, 4); return;
  }
  const r = kind === 2 ? 0.56 : 0.43, wb = kind === 2 ? 2.3 : kind === 1 ? 2.0 : 2.1, xs = 0.567, xf = 0.82;
  for (const yw of [yb - wb / 2, yb + wb / 2]) { for (const sx of [-1, 1]) wheel(M, sx * xs, yw, r, 0.13, N, sx, 20, 6); if (q >= 1) box(M, -xs, xs, yw - 0.07, yw + 0.07, r - 0.07, r + 0.07, 5); } // 車軸
  for (const sx of [-1, 1]) {
    if (kind === 0) { box(M, sx * (xf - 0.09), sx * (xf + 0.09), yb - 0.75, yb + 0.75, 0.3, 0.62, 4); for (const sy of [-1, 1]) box(M, sx * (xf - 0.08), sx * (xf + 0.08), Math.min(yb + sy * 0.75, yb + sy * 1.45), Math.max(yb + sy * 0.75, yb + sy * 1.45), 0.46, 0.66, 4); }
    else { box(M, sx * (xf - 0.07), sx * (xf + 0.07), yb - wb / 2 - 0.45, yb + wb / 2 + 0.45, 0.42, 0.66, kind === 2 ? 6 : 5); box(M, sx * (xf - 0.08), sx * (xf + 0.08), yb - 0.5, yb + 0.5, 0.28, 0.5, kind === 2 ? 6 : 5); }
    if (q >= 1) for (const yw of [yb - wb / 2, yb + wb / 2]) { box(M, sx * (xf - 0.11), sx * (xf + 0.11), yw - 0.17, yw + 0.17, r - 0.15, r + 0.12, 6); if (kind !== 0) box(M, sx * (xf - 0.07), sx * (xf + 0.07), yw - 0.1, yw + 0.1, r + 0.12, 0.66, 5); } // 軸箱とばね
    if (kind === 0 || kind === 1) box(M, sx * (xf - 0.17), sx * (xf + 0.17), yb - 0.2, yb + 0.2, 0.62, zTop, 5); // 空気ばね（客車はまくらばね）
    if (q >= 2) for (const yw of [yb - wb / 2, yb + wb / 2]) box(M, sx * 0.3, sx * 0.48, yw + (yw < yb ? 0.42 : -0.42) - 0.12, yw + (yw < yb ? 0.42 : -0.42) + 0.12, r - 0.12, r + 0.12, 6); // ブレーキ
  }
  box(M, -xf, xf, yb - 0.2, yb + 0.2, 0.36, 0.56, 4); // 横はり
  if (motor && q >= 1) for (const sy of [-1, 1]) box(M, -0.36, 0.36, yb + sy * 0.25, yb + sy * 0.62, 0.3, 0.6, 3); // 主電動機
  if (kind === 2) box(M, -1.0, 1.0, yb - 1.6, yb + 1.6, 0.66, 0.78, 6);
}
/** 床下機器：m 電動車（VVVF・断流器・フィルタ）、t 付随車（SIV・圧縮機・蓄電池・空気だめ）、d 気動車（機関・燃料タンク・ラジエーター） */
function under(M: CarMesh, half: number, kind: 'm' | 't' | 'd' | 'x', zb: number, q: number): void {
  const z1 = zb - 0.02, L: [number, number, number, number, number, number][] = kind === 'm' ? [[-4.9, -2.0, -1.25, 0.1, 0.48, 3], [-1.6, -0.4, 0.2, 1.25, 0.58, 6], [-0.1, 2.2, -1.2, -0.1, 0.52, 3], [2.5, 4.6, 0.15, 1.2, 0.6, 3], [1.0, 2.2, 0.3, 1.2, 0.72, 6]]
    : kind === 't' ? [[-4.6, -2.6, 0.1, 1.25, 0.52, 3], [-2.2, -0.9, -1.15, -0.2, 0.6, 6], [-0.4, 1.4, -1.2, -0.1, 0.64, 3], [2.0, 4.4, 0.3, 1.2, 0.68, 6]]
    : kind === 'd' ? [[-2.6, 1.6, -0.75, 0.75, 0.42, 3], [2.0, 4.0, -1.2, -0.15, 0.52, 6], [-4.6, -3.0, 0.1, 1.2, 0.6, 3], [2.0, 3.6, 0.2, 1.2, 0.55, 5]]
    : [[-3.5, -1.0, -1.2, 1.2, 0.6, 3], [0.5, 3.0, -1.2, 1.2, 0.65, 3]];
  for (const [a, b, x0, x1, z0, t] of L) { if (Math.max(Math.abs(a), Math.abs(b)) > half) continue; box(M, x0, x1, a, b, z0, z1, t); if (q >= 2 && t === 3) side(M, x1 > 0 ? 1 : -1, a + 0.15, b - 0.15, z0 + 0.08, z1 - 0.1, 6, Math.abs(x1 > 0 ? x1 : x0) + 0.005); } // 箱の扉の線
  if (kind === 't' && q >= 1) for (const x of [-0.9, -0.6]) limb(M, [x, -4.6, 0.72], [x, -2.6, 0.72], 0.14, 6); // 空気だめ
  if (kind === 'm' && q >= 1) box(M, -1.25, -0.25, 2.6, 4.4, 0.66, z1, 16); // 抵抗器・冷却器（ルーバーの灰）
}
/** 連結面：幌と連結器（dir=1 で +y の端） */
function gangway(M: CarMesh, y: number, dir: number, zf: number, q: number, w = 0.55, h = 3.2): void {
  box(M, -w, w, Math.min(y, y + dir * 0.26), Math.max(y, y + dir * 0.26), zf + 0.1, h, 13);
  box(M, -0.12, 0.12, Math.min(y, y + dir * 0.3), Math.max(y, y + dir * 0.3), 0.72, 0.9, 5);
  if (q >= 2) for (const sx of [-1, 1]) limb(M, [sx * 0.85, y, 1.2], [sx * 0.85, y, h - 0.2], 0.02, 2); // 妻面の手すり
}

export interface CarSpec { HL: number; HW: number; zf: number; zr: number; zt: number; body: number; door: number; roof: number; doors: number[]; dw: number; wins: [number, number][]; wz: [number, number]; bands: [number, number][]; panes?: number }
/** 側面：帯・ドア（戸袋の影・窓・靴ずり）・窓（枠と中桟）・雨どい・車番・優先席・側面の行先表示 */
function sides(M: CarMesh, S: CarSpec, y0: number, y1: number, q: number): void {
  const { HW, zf, zr, wz, dw, body } = S, xw = HW + 0.012;
  for (const sx of [-1, 1]) {
    for (const [b0, b1] of S.bands) side(M, sx, y0, y1, b0, b1, 0, xw);
    for (const yc of S.doors) { if (yc - dw / 2 < y0 || yc + dw / 2 > y1) continue;
      side(M, sx, yc - dw / 2 - 0.05, yc + dw / 2 + 0.05, zf + 0.04, wz[1] + 0.16, 5, HW + 0.018); // ドアの枠（すき間の影）
      for (const o of [-1, 1]) { const a = o < 0 ? yc - dw / 2 : yc + 0.012, b = o < 0 ? yc - 0.012 : yc + dw / 2; side(M, sx, a, b, zf + 0.06, wz[1] + 0.12, S.door, HW + 0.026); side(M, sx, a + 0.1, b - 0.1, wz[0] + 0.08, wz[1], 1, HW + 0.034); }
      box(M, sx * HW, sx * (HW + 0.06), yc - dw / 2, yc + dw / 2, zf - 0.02, zf + 0.05, 2); // 靴ずり
    }
    for (const [a, b] of S.wins) { if (a < y0 - 0.01 || b > y1 + 0.01) continue; const n = S.panes ?? Math.max(1, Math.round((b - a) / 1.55)), w = (b - a - 0.14 * (n - 1)) / n;
      for (let k = 0; k < n; k++) { const p0 = a + k * (w + 0.14), p1 = p0 + w; if (q >= 1) side(M, sx, p0 - 0.04, p1 + 0.04, wz[0] - 0.04, wz[1] + 0.04, 6, xw + 0.002); side(M, sx, p0, p1, wz[0], wz[1], 1, xw + 0.005); if (q >= 2 && wz[1] - wz[0] > 0.9) side(M, sx, p0, p1, wz[1] - 0.36, wz[1] - 0.32, 6, xw + 0.008); } }
    box(M, sx * (HW - 0.01), sx * (HW + 0.05), y0, y1, zr - 0.04, zr + 0.02, body === 7 ? 2 : 16); // 雨どい
    if (q >= 2) { side(M, sx, y0 + 0.5, y0 + 1.25, zr - 0.5, zr - 0.36, 5, xw + 0.004); side(M, sx, y1 - 1.1, y1 - 0.85, wz[0] + 0.08, wz[0] + 0.32, 14, xw + 0.008); } // 車番・優先席
    if (q >= 1 && S.doors.length > 1) { const yc = S.doors[S.doors.length - 2] + dw / 2 + 0.3; if (yc + 0.75 < y1) side(M, sx, yc, yc + 0.75, wz[1] - 0.3, wz[1] - 0.06, 11, xw + 0.008); } // 側面の行先表示
  }
}
/** 平らな前面（通勤形・近郊形・気動車・機関車）。style：0 黒い窓まわり＋貫通扉 1 白い前面＋貫通扉 2 塗装＋貫通扉 3 機関車（2 枚窓） */
function cabFlat(M: CarMesh, S: CarSpec, yc: number, style: number, q: number): void {
  const { HW, HL, zf, zr, zt, body, roof } = S, rk = 0.28, tz = (z: number) => (z - zf) / (zr - zf);
  frus(M, [-HW, HW, yc, HL], zf, [-HW + 0.1, HW - 0.1, yc, HL - rk], zr, body); frus(M, [-HW + 0.1, HW - 0.1, yc, HL - rk], zr, [-HW + 0.42, HW - 0.42, yc, HL - rk - 0.12], zt, roof);
  const yAt = (z: number) => HL - rk * tz(z), xAt = (z: number) => HW - 0.1 * tz(z), nrmF = [0, 1, rk / (zr - zf)];
  const fq = (x0: number, x1: number, z0: number, z1: number, t: number, off: number) => quadV(M, [[x0, yAt(z0) + off, z0], [x1, yAt(z0) + off, z0], [x1, yAt(z1) + off, z1], [x0, yAt(z1) + off, z1]], t, nrmF);
  const lamp = style === 3 ? 1.75 : 1.95;
  if (style === 0) fq(-xAt(2.1) + 0.05, xAt(2.1) - 0.05, 2.08, zr - 0.06, 5, 0.01); // 黒い窓まわり
  if (style === 3) { for (const [a, b] of [[-1.2, -0.07], [0.07, 1.2]]) { fq(a - 0.05, b + 0.05, 2.2, 3.2, 5, 0.01); fq(a, b, 2.25, 3.15, 1, 0.02); } }
  else { for (const [a, b] of [[-1.24, -0.48], [0.48, 1.24]]) { if (style) fq(a - 0.05, b + 0.05, 2.2, 3.35, 5, 0.01); fq(a, b, 2.26, 3.3, 1, 0.02); }
    fq(-0.4, 0.4, zf + 0.12, 3.5, style === 2 ? 0 : 12, 0.02); fq(-0.28, 0.28, 2.32, 3.2, 1, 0.03); // 貫通扉と窓
    fq(0.52, 1.2, 3.38, 3.56, 11, 0.02); fq(-1.2, -0.62, 3.38, 3.56, 11, 0.02); } // 行先・種別の表示
  for (const [b0, b1] of S.bands) if (b1 < 2.0) fq(-xAt(b0), xAt(b0), b0, b1, 0, 0.012);
  for (const sx of [-1, 1]) { fq(sx > 0 ? 0.6 : -0.98, sx > 0 ? 0.98 : -0.6, lamp - 0.1, lamp + 0.08, 9, 0.03); fq(sx > 0 ? 1.02 : -1.26, sx > 0 ? 1.26 : -1.02, lamp - 0.1, lamp + 0.08, 10, 0.03); } // 前照灯・尾灯
  if (q >= 2) { for (const x of style === 3 ? [-0.6, 0.6] : [-0.86, 0.86]) limb(M, [x - 0.2, yAt(2.3) + 0.05, 2.3], [x + 0.12, yAt(2.85) + 0.05, 2.85], 0.016, 5); // ワイパー
    if (style !== 3) for (const sx of [-1, 1]) limb(M, [sx * 0.46, yAt(1.4) + 0.06, 1.4], [sx * 0.46, yAt(2.9) + 0.06, 2.9], 0.018, 2); } // 手すり
  frus(M, [-1.15, 1.15, HL - 0.95, HL + 0.08], 0.42, [-1.38, 1.38, HL - 0.95, HL - 0.02], zf, style === 2 || style === 3 ? 5 : 6); // スカート
  box(M, -0.13, 0.13, HL - 0.1, HL + 0.42, 0.68, 0.86, 5); if (q >= 1) box(M, -0.2, 0.2, HL + 0.32, HL + 0.48, 0.6, 0.92, 6); // 連結器
}
/** 流線形の先頭（特急・モノレール・新交通）。nose の長さで細くなり、上がガラス。sh は帯 */
function cabNose(M: CarMesh, S: CarSpec, yc: number, nose: number, q: number, glass: [number, number] = [1, 3]): void {
  const { HW, HL, zf, zr, zt, body, roof } = S, b = S.bands[0] ?? [zf + 0.5, zf + 0.7];
  const T = [0, 0.3, 0.55, 0.78, 1], ys = T.map(t => yc + t * nose), sc = T.map((t, i) => { const w = HW * (1 - 0.42 * t * t), top = zf + (zr - zf) * (1 - 0.55 * Math.pow(t, 1.5)), tt = top + (zt - zr) * (1 - t); return sec10(w, zf + 0.06 * t, Math.max(zf + 0.3, top - (i === 4 ? 0.1 : 0)), Math.max(zf + 0.35, tt), b[0], b[1], 0.72 - 0.15 * t); });
  loft(M, ys, sc, (s, e) => s < 0 ? body : e === 0 ? 3 : e === 2 || e === 8 ? 0 : (s >= glass[0] && s <= glass[1] - 1 && (e >= 4 && e <= 6)) ? 1 : (e === 5 && s === 0) ? roof : body, [1]);
  const yL = yc + nose * 0.86, wL = HW * (1 - 0.42 * 0.74), zL = b[1] + 0.12;
  for (const sx of [-1, 1]) { quadV(M, [[sx * (wL - 0.42), yL + 0.04, zL], [sx * (wL - 0.06), yL - 0.1, zL], [sx * (wL - 0.06), yL - 0.1, zL + 0.16], [sx * (wL - 0.42), yL + 0.04, zL + 0.16]], 9, [sx * 0.4, 1, 0]); }
  if (q >= 1) box(M, -0.8, 0.8, HL - 0.6, HL + 0.05, 0.45, zf + 0.1, 5); // 前の下のスカート
}

/** 車体（箱）：側面の壁・屋根・床の縁。前後の端の y（y0, y1） */
function shell(M: CarMesh, S: CarSpec, y0: number, y1: number): void {
  const { HW, zf, zr, zt, body, roof } = S; box(M, -HW, HW, y0, y1, zf, zr, body);
  frus(M, [-HW, HW, y0, y1], zr, [-HW + 0.42, HW - 0.42, y0, y1], zt, roof); box(M, -HW + 0.06, HW - 0.06, y0, y1, zf - 0.08, zf, 3);
}

export type TrainModel = 'ce' | 'cp' | 'cm' | 'ke' | 'kp' | 'km' | 'xe' | 'xp' | 'xm' | 'de' | 'el' | 'fc' | 'ft' | 'me' | 'mm' | 'ae' | 'am' | 'sc' | 'o4' | 'o3' | 'o2' | 'o1';
/** 電車のパンタグラフの舟の高さ（レール面から）。架線（トロリ線）は rails.ts でレール面の下 0.4m を基準に 5.55m、つまりレール面から 5.15m */
export const PANTO_Z = 5.13;
const WALL = 1.45;
/** 通勤形（ステンレス・4 扉・長さ 19.5m）の寸法 */
const CM: CarSpec = { HL: 9.75, HW: WALL, zf: 1.05, zr: 3.65, zt: 4.0, body: 7, door: 12, roof: 2, doors: [-7.05, -2.35, 2.35, 7.05], dw: 1.3, wins: [[-9.4, -7.95], [-6.15, -3.25], [-1.45, 1.45], [3.25, 6.15], [7.95, 9.4]], wz: [2.15, 3.25], bands: [[1.55, 1.8], [3.42, 3.55]] };
/** 近郊形（3 扉・ボックスシートの大きな窓）。帯は 2 本（下は太い） */
const KN: CarSpec = { ...CM, doors: [-6.3, 0, 6.3], wins: [[-9.4, -7.2], [-5.4, -0.9], [0.9, 5.4], [7.2, 9.4]], panes: undefined, bands: [[1.45, 1.85], [3.38, 3.5]] };
/** 特急形（白い塗装・ドアは片側 1 つ・連続窓） */
const XP: CarSpec = { HL: 10.0, HW: 1.46, zf: 1.0, zr: 3.55, zt: 3.95, body: 8, door: 8, roof: 16, doors: [-8.9], dw: 0.9, wins: [], wz: [2.2, 3.0], bands: [[1.55, 1.75]] };
/** 気動車（塗装の車体・2 扉）。帯の色＝車体の色 */
const DC: CarSpec = { HL: 10.0, HW: 1.4, zf: 1.15, zr: 3.6, zt: 3.95, body: 0, door: 0, roof: 16, doors: [-8.4, 5.6], dw: 1.0, wins: [[-7.6, 4.8], [6.4, 8.2]], wz: [2.2, 3.15], bands: [] };
/** 電気機関車（塗装・2 運転台・18m） */
const EL: CarSpec = { HL: 9.0, HW: 1.42, zf: 1.15, zr: 3.55, zt: 3.95, body: 0, door: 0, roof: 16, doors: [], dw: 0.7, wins: [], wz: [2.25, 3.1], bands: [] };
/** モノレール（跨座式）：床が軌道桁の上、両側のスカートが桁を包む。z=0 は桁の上面から 0.92 下 */
const MO: CarSpec = { HL: 7.4, HW: 1.5, zf: 1.5, zr: 4.35, zt: 4.7, body: 8, door: 12, roof: 2, doors: [-3.6, 3.0], dw: 1.3, wins: [[-6.9, -4.6], [-2.6, 2.0], [4.0, 6.0]], wz: [2.55, 3.65], bands: [[2.05, 2.35], [3.85, 3.95]] };
/** 新交通（ゴムタイヤ・8.4m）。z=0 は走行路の 0.2 下 */
const AG: CarSpec = { HL: 4.2, HW: 1.22, zf: 0.75, zr: 3.0, zt: 3.3, body: 8, door: 12, roof: 2, doors: [0], dw: 1.3, wins: [[-3.9, -0.95], [0.95, 3.0]], wz: [1.6, 2.6], bands: [[1.15, 1.4]] };
/** 旧型客車（茶色の塗装・丸屋根・小さな窓がたくさん・両端に出入口） */
const SC: CarSpec = { HL: 10.0, HW: 1.45, zf: 1.05, zr: 3.35, zt: 3.95, body: 0, door: 0, roof: 6, doors: [-9.2, 9.2], dw: 0.75, wins: [], wz: [2.05, 2.95], bands: [] };

/** 車種ごとの寸法（場面の側：長さ・ライトの位置・窓の灯りの高さ・立ち客を並べる範囲） */
export const CAR_DIM: Record<string, { HL: number; HW: number; lamp: number; lx: number; win: number; winH: number }> = {
  c: { HL: CM.HL, HW: CM.HW, lamp: 1.95, lx: 0.8, win: 2.7, winH: 1.1 }, k: { HL: KN.HL, HW: KN.HW, lamp: 1.95, lx: 0.8, win: 2.7, winH: 1.1 }, x: { HL: XP.HL, HW: XP.HW, lamp: 1.9, lx: 0.55, win: 2.6, winH: 0.8 },
  d: { HL: DC.HL, HW: DC.HW, lamp: 1.95, lx: 0.8, win: 2.68, winH: 0.95 }, el: { HL: EL.HL, HW: EL.HW, lamp: 1.75, lx: 0.8, win: 0, winH: 0 }, fc: { HL: 9.8, HW: 1.3, lamp: 1.2, lx: 1.0, win: 0, winH: 0 }, ft: { HL: 7.0, HW: 1.3, lamp: 1.2, lx: 1.0, win: 0, winH: 0 },
  m: { HL: MO.HL, HW: MO.HW, lamp: 2.4, lx: 0.55, win: 3.1, winH: 1.1 }, a: { HL: AG.HL, HW: AG.HW, lamp: 1.5, lx: 0.45, win: 2.1, winH: 1.0 }, s: { HL: SC.HL, HW: SC.HW, lamp: 1.6, lx: 0.9, win: 2.5, winH: 0.9 }, sl: { HL: 6.25, HW: 1.4, lamp: 2.6, lx: 0.0, win: 0, winH: 0 },
};

/** 停車中に開くドア（開口部の中の明るい面と床）。ドアの並びごとに 1 つ */
function doorOpen(S: CarSpec): CarMesh { const M = mesh(); for (const sx of [-1, 1]) for (const yc of S.doors) { side(M, sx, yc - S.dw / 2, yc + S.dw / 2, S.zf + 0.06, S.wz[1] + 0.12, 18, S.HW + 0.042); side(M, sx, yc - S.dw / 2, yc + S.dw / 2, S.zf + 0.02, S.zf + 0.09, 6, S.HW + 0.046); } return M; }

/** 列車の全車種（N：車輪の角数、q：品質 0〜2） */
export function makeTrains(N = 10, q = 2): Record<TrainModel, CarMesh> {
  // 通勤形・近郊形：中間車（m）・パンタ車（p）・先頭車（e、前が +y）
  const emu = (S: CarSpec, kind: 0 | 1 | 2, kinko: boolean): CarMesh => {
    const M = mesh(), yc = kind === 2 ? S.HL - 1.05 : S.HL; shell(M, S, -S.HL, yc); sides(M, S, -S.HL, yc, q);
    if (kind === 2) cabFlat(M, S, yc, kinko ? 1 : 0, q); else gangway(M, S.HL, 1, S.zf, q);
    gangway(M, -S.HL, -1, S.zf, q);
    for (const yb of [-6.85, 6.85]) bogie(M, yb, N, q, 0, kind === 1 || (kind === 0 && !kinko));
    under(M, 5.3, kind === 1 ? 'm' : 't', S.zf - 0.08, q);
    if (kind === 1) { pantoS(M, -2.3, S.zt, PANTO_Z, q); for (const y of [-6.4, 4.6]) cooler(M, y, 1.25, 0.72, S.zt - 0.02, 0.42, q); if (q >= 2) for (const x of [-0.3, 0.3]) limb(M, [x, -1.6, S.zt + 0.05], [x, 3.2, S.zt + 0.05], 0.025, 6); } // 屋根の配管
    else for (const y of kind === 2 ? [-5.0, 4.2] : [-5.0, 5.0]) cooler(M, y, 1.3, 0.72, S.zt - 0.02, 0.44, q);
    if (q >= 1 && kinko) for (const y of [-1.6, 1.6]) box(M, -0.22, 0.22, y - 0.3, y + 0.3, S.zt - 0.02, S.zt + 0.16, 2); // ベンチレーター
    if (kind === 2 && q >= 1) box(M, -0.25, 0.25, yc - 1.4, yc - 0.7, S.zt - 0.02, S.zt + 0.12, 2); // 運転台の上の箱（無線アンテナ台）
    return M;
  };
  // 特急形：流線形の先頭（e）・中間（m）・パンタ車（p）。連続窓と細い柱、ドアは後ろに 1 つ
  const exp = (kind: 0 | 1 | 2): CarMesh => {
    const S = XP, M = mesh(), yc = kind === 2 ? S.HL - 3.6 : S.HL, ys = [-S.HL, yc], sc = [0, 1].map(() => sec10(S.HW, S.zf, S.zr, S.zt, S.bands[0][0], S.bands[0][1]));
    loft(M, ys, sc, (s, e) => e === 0 ? 3 : e === 2 || e === 8 ? 0 : e === 5 ? S.roof : e === 4 || e === 6 ? S.roof : S.body, kind === 2 ? [-1] : [-1, 1]);
    if (kind === 2) cabNose(M, S, yc, 3.6, q, [1, 3]); else gangway(M, S.HL, 1, S.zf, q, 0.55, 3.0);
    gangway(M, -S.HL, -1, S.zf, q, 0.55, 3.0); const xw = S.HW + 0.012, w0 = -S.HL + 2.2, w1 = yc - (kind === 2 ? 0.6 : 1.0);
    for (const sx of [-1, 1]) { side(M, sx, w0, w1, S.wz[0] - 0.06, S.wz[1] + 0.06, 5, xw); side(M, sx, w0 + 0.05, w1 - 0.05, S.wz[0], S.wz[1], 1, xw + 0.004);
      if (q >= 1) for (let y = w0 + 1.85; y < w1 - 0.3; y += 1.85) side(M, sx, y - 0.05, y + 0.05, S.wz[0], S.wz[1], 5, xw + 0.007); // 窓の柱
      side(M, sx, w0, w1, S.wz[1] + 0.12, S.wz[1] + 0.2, 0, xw); // 窓の上の細い帯
      const yd = S.doors[0]; side(M, sx, yd - 0.5, yd + 0.5, S.zf + 0.04, 3.12, 5, S.HW + 0.018); side(M, sx, yd - 0.45, yd + 0.45, S.zf + 0.06, 3.08, S.door, S.HW + 0.026); side(M, sx, yd - 0.22, yd + 0.22, 2.3, 2.9, 1, S.HW + 0.034);
      if (q >= 1) side(M, sx, yd + 0.7, yd + 1.4, 2.62, 2.84, 11, xw + 0.008); }
    for (const yb of [-7.0, 7.0]) bogie(M, yb, N, q, 0, kind === 1);
    under(M, 5.3, kind === 1 ? 'm' : 't', S.zf - 0.08, q); box(M, -S.HW + 0.1, S.HW - 0.1, -5.6, 5.6, 0.62, S.zf - 0.08, q >= 1 ? 6 : 3); // 床下のカバー
    if (kind === 1) pantoS(M, -3.2, S.zt, PANTO_Z, q);
    for (const y of kind === 2 ? [-5.5] : [-5.8, 4.8]) cooler(M, y, 1.1, 0.7, S.zt - 0.02, 0.3, q, 16);
    return M;
  };
  // 気動車（両運転台。先頭の前が +y、後ろは反転した運転台）
  const dc = (): CarMesh => {
    const S = DC, M = mesh(), yc = S.HL - 1.05; shell(M, S, -yc, yc); sides(M, S, -yc, yc, q);
    const C = mesh(); cabFlat(C, S, yc, 2, q); merge(M, C); mirrorAdd(M, C);
    for (const yb of [-7.0, 7.0]) bogie(M, yb, N, q, 1, false);
    under(M, 5.3, 'd', S.zf - 0.08, q);
    box(M, -0.25, 0.25, 1.3, 1.9, S.zt - 0.02, S.zt + 0.5, 5); box(M, -0.3, 0.3, 1.25, 1.95, S.zt + 0.5, S.zt + 0.56, 6); // 排気管
    box(M, -0.7, 0.7, -4.8, -2.2, S.zt - 0.02, S.zt + 0.3, 16); if (q >= 1) box(M, -0.55, 0.55, -4.6, -2.4, S.zt + 0.3, S.zt + 0.32, 6); // 屋根の冷房・放熱器
    if (q >= 1) for (const y of [-7.5, 3.5, 6.5]) box(M, -0.2, 0.2, y - 0.25, y + 0.25, S.zt - 0.02, S.zt + 0.16, 16); // ベンチレーター
    return M;
  };
  // 電気機関車（EF210 風：箱形・両運転台・3 台車・ルーバー・パンタ 2 つ）
  const el = (): CarMesh => {
    const S = EL, M = mesh(), yc = S.HL - 0.9; shell(M, S, -yc, yc);
    const C = mesh(); cabFlat(C, S, yc, 3, q);
    for (const sx of [-1, 1]) { side(C, sx, yc - 1.25, yc - 0.45, 1.35, 3.25, 6, S.HW + 0.012); side(C, sx, yc - 1.15, yc - 0.55, 2.35, 3.0, 1, S.HW + 0.02); side(C, sx, yc - 2.2, yc - 1.4, 2.35, 3.0, 1, S.HW + 0.012); } // 乗務員扉と窓
    pantoS(C, yc - 2.0, S.zt, PANTO_Z, q); merge(M, C); mirrorAdd(M, C);
    for (const sx of [-1, 1]) { const y0 = -yc + 2.4, y1 = yc - 2.4, n = q >= 1 ? 8 : 3; for (let k = 0; k < n; k++) { const a = y0 + (y1 - y0) * k / n + 0.12, b = y0 + (y1 - y0) * (k + 1) / n - 0.12; side(M, sx, a, b, 2.1, 3.15, 6, S.HW + 0.01); if (q >= 2) for (let z = 2.2; z < 3.1; z += 0.16) side(M, sx, a + 0.05, b - 0.05, z, z + 0.05, 5, S.HW + 0.014); } // ルーバー
      side(M, sx, -yc, yc, 1.5, 1.62, 15, S.HW + 0.012); }
    box(M, -S.HW, S.HW, -S.HL + 0.2, S.HL - 0.2, 0.85, S.zf, 5); // 台枠
    for (const yb of [-6.2, 0, 6.2]) bogie(M, yb, N, q, 2, true, 0.85);
    box(M, -0.7, 0.7, -3.0, 3.0, S.zt - 0.02, S.zt + 0.25, 16); if (q >= 1) { for (const y of [-2.2, 0, 2.2]) for (const x of [-0.4, 0.4]) box(M, x - 0.08, x + 0.08, y - 0.08, y + 0.08, S.zt + 0.25, S.zt + 0.5, 19); limb(M, [-0.4, -yc + 2.0, S.zt + 0.45], [-0.4, yc - 2.0, S.zt + 0.45], 0.03, 6); } // 屋根の機器・碍子・母線
    return M;
  };
  // 貨車の台枠（両端に連結器・側はり）
  const frame = (M: CarMesh, HL: number, yb: number) => { box(M, -1.32, 1.32, -HL + 0.3, HL - 0.3, 1.0, 1.18, 6); for (const sx of [-1, 1]) box(M, sx * 1.22, sx * 1.34, -HL + 0.3, HL - 0.3, 0.72, 1.18, 6); for (const dir of [-1, 1]) { box(M, -0.12, 0.12, dir < 0 ? -HL : HL - 0.3, dir < 0 ? -HL + 0.3 : HL, 0.72, 0.9, 5); box(M, -1.3, 1.3, dir < 0 ? -HL + 0.3 : HL - 0.5, dir < 0 ? -HL + 0.5 : HL - 0.3, 0.7, 1.18, 6); } for (const y of [-yb, yb]) bogie(M, y, N, q, 1, false, 0.95); };
  // コンテナ車（12ft コンテナ 5 個。コンテナの色は車ごと）
  const fc = (): CarMesh => {
    const M = mesh(), HL = 9.8; frame(M, HL, 7.2);
    for (let i = 0; i < 5; i++) { const yc = (i - 2) * 3.82, a = yc - 1.83, b = yc + 1.83; box(M, -1.22, 1.22, a, b, 1.2, 3.68, 0);
      for (const sx of [-1, 1]) { if (q >= 2) for (let k = 1; k < 6; k++) side(M, sx, a + k * 0.61 - 0.03, a + k * 0.61 + 0.03, 1.28, 3.6, 6, 1.226); if (q >= 1) side(M, sx, yc - 0.6, yc + 0.6, 2.9, 3.3, 8, 1.228); }
      if (q >= 1) for (const sy of [-1, 1]) { endQ(M, -0.02, 0.02, sy > 0 ? b + 0.004 : a - 0.004, 1.25, 3.6, 6, sy); for (const x of [-0.6, 0.6]) endQ(M, x - 0.03, x + 0.03, sy > 0 ? b + 0.006 : a - 0.006, 1.3, 3.55, 5, sy); } } // 扉の合わせ目と締め金具
    return M;
  };
  // タンク車（黒い円筒・ドーム・歩み板・はしご）
  const ft = (): CarMesh => {
    const M = mesh(), HL = 7.0, nC = q >= 2 ? 14 : q >= 1 ? 10 : 8; frame(M, HL, 4.6);
    const ys = [-6.6, -6.35, 6.35, 6.6], sc = [circ(0.9, 2.45, nC), circ(1.25, 2.45, nC), circ(1.25, 2.45, nC), circ(0.9, 2.45, nC)];
    loft(M, ys, sc, () => 17, [-1, 1]); box(M, -0.45, 0.45, -0.45, 0.45, 3.55, 3.95, 17); box(M, -1.15, 1.15, -0.9, 0.9, 1.18, 1.32, 6); // ドームと台
    for (const sx of [-1, 1]) box(M, sx * 0.9, sx * 1.2, -1.2, 1.2, 1.3, 1.42, 6);
    if (q >= 1) { for (const sx of [-1, 1]) { limb(M, [sx * 1.15, -0.5, 1.4], [sx * 0.95, -0.5, 3.6], 0.025, 14); limb(M, [sx * 1.15, -0.2, 1.4], [sx * 0.95, -0.2, 3.6], 0.025, 14); } side(M, 1, -1.6, 1.6, 2.2, 2.5, 8, 1.258); side(M, -1, -1.6, 1.6, 2.2, 2.5, 8, 1.258); } // はしご・表示
    return M;
  };
  // モノレール（跨座式）：流線形の先頭、桁を包むスカート、大きな窓
  const mono = (end: boolean): CarMesh => {
    const S = MO, M = mesh(), yc = end ? S.HL - 2.2 : S.HL; shell(M, S, -S.HL, yc); sides(M, S, -S.HL, yc, q);
    if (end) cabNose(M, S, yc, 2.2, q, [1, 4]); else gangway(M, S.HL, 1, S.zf, q, 0.6, 3.9); gangway(M, -S.HL, -1, S.zf, q, 0.6, 3.9);
    for (const sx of [-1, 1]) { box(M, sx * 0.52, sx * S.HW, -S.HL + 0.25, (end ? yc : S.HL) - 0.25, -0.35, S.zf, S.body); side(M, sx, -S.HL + 0.25, (end ? yc : S.HL) - 0.25, 0.4, 0.65, 0, S.HW + 0.01); } // 桁を包むスカートと帯
    for (const yb of [-4.6, 4.6]) { box(M, -0.5, 0.5, yb - 1.1, yb + 1.1, 1.0, S.zf, 5); for (const yw of [yb - 0.6, yb + 0.6]) wheel(M, 0, yw, 0.5, 0.75, Math.max(8, N), 1, 5, 6, 1.42); } // 走行輪（桁の上）
    for (const y of end ? [-4.0] : [-4.0, 3.5]) cooler(M, y, 1.2, 0.72, S.zt - 0.02, 0.35, q);
    return M;
  };
  // 新交通：小さな車体、前は大きな傾いたガラス
  const agt = (end: boolean): CarMesh => {
    const S = AG, M = mesh(), yc = end ? S.HL - 1.6 : S.HL; shell(M, S, -S.HL, yc); sides(M, S, -S.HL, yc, q);
    if (end) cabNose(M, S, yc, 1.6, q, [1, 4]); else gangway(M, S.HL, 1, S.zf, q, 0.55, 2.6); gangway(M, -S.HL, -1, S.zf, q, 0.55, 2.6);
    for (const yb of [-2.6, 2.6]) bogie(M, yb, N, q, 3, false, S.zf);
    box(M, -S.HW + 0.05, S.HW - 0.05, -S.HL + 0.2, yc - 0.2, 0.42, S.zf, 6); cooler(M, -1.6, 0.9, 0.6, S.zt - 0.02, 0.3, q);
    return M;
  };
  // 旧型客車：丸屋根・小さな窓（上下 2 段）・両端の出入口・ベンチレーター
  const coach = (): CarMesh => {
    const S = SC, M = mesh(), ys = [-S.HL, S.HL], sec = [[-S.HW, S.zf], [S.HW, S.zf], [S.HW, S.zr], [S.HW * 0.8, S.zr + 0.38], [S.HW * 0.4, S.zt - 0.04], [0, S.zt], [-S.HW * 0.4, S.zt - 0.04], [-S.HW * 0.8, S.zr + 0.38], [-S.HW, S.zr]];
    loft(M, ys, [sec, sec], (s, e) => s < 0 ? 0 : e === 0 ? 3 : e >= 3 && e <= 6 ? 6 : e === 2 || e === 7 ? 6 : 0, [-1, 1]);
    for (const sx of [-1, 1]) { for (let k = 0; k < 11; k++) { const y = -7.6 + k * 1.52; side(M, sx, y - 0.48, y + 0.48, S.wz[0], S.wz[1], 1, S.HW + 0.006); if (q >= 1) side(M, sx, y - 0.48, y + 0.48, S.wz[0] + 0.42, S.wz[0] + 0.47, 0, S.HW + 0.009); }
      for (const y of S.doors) { side(M, sx, y - 0.38, y + 0.38, S.zf + 0.05, 3.1, 5, S.HW + 0.008); side(M, sx, y - 0.32, y + 0.32, S.zf + 0.08, 3.05, 0, S.HW + 0.014); side(M, sx, y - 0.2, y + 0.2, 2.2, 2.8, 1, S.HW + 0.02); }
      box(M, sx * (S.HW - 0.01), sx * (S.HW + 0.04), -S.HL, S.HL, S.zr - 0.03, S.zr + 0.02, 5); }
    if (q >= 1) for (let k = 0; k < 8; k++) { const y = -7.7 + k * 2.2; box(M, -0.15, 0.15, y - 0.15, y + 0.15, S.zt - 0.03, S.zt + 0.2, 5); }
    for (const dir of [-1, 1]) gangway(M, dir * S.HL, dir, S.zf, q, 0.5, 3.0);
    for (const yb of [-7.0, 7.0]) bogie(M, yb, N, q, 1, false);
    box(M, -S.HW + 0.06, S.HW - 0.06, -S.HL, S.HL, S.zf - 0.1, S.zf, 5); under(M, 5.0, 'x', S.zf - 0.1, q);
    return M;
  };
  return { ce: emu(CM, 2, false), cp: emu(CM, 1, false), cm: emu(CM, 0, false), ke: emu(KN, 2, true), kp: emu(KN, 1, true), km: emu(KN, 0, true), xe: exp(2), xp: exp(1), xm: exp(0), de: dc(), el: el(), fc: fc(), ft: ft(),
    me: mono(true), mm: mono(false), ae: agt(true), am: agt(false), sc: coach(), o4: doorOpen(CM), o3: doorOpen(KN), o2: doorOpen({ ...DC, doors: [-8.4, 5.6, -5.6, 8.4] }), o1: doorOpen({ ...XP, doors: [-8.9] }) };
}

/** 編成の組み方（車種の並び・後ろ向きの車・車種の寸法のキー・開くドア）。sl は Blender の蒸気機関車 */
export type TrainFam = 'commuter' | 'kinko' | 'express' | 'diesel' | 'freight' | 'mono' | 'agt' | 'sl';
export const FAMS: Record<TrainFam, { cars: (TrainModel | 'sl')[]; flip: number[]; dim: string[]; door: TrainModel | null; pax: boolean; stop: boolean }> = {
  commuter: { cars: ['ce', 'cp', 'cm', 'ce'], flip: [0, 0, 0, 1], dim: ['c', 'c', 'c', 'c'], door: 'o4', pax: true, stop: true },
  kinko: { cars: ['ke', 'kp', 'km', 'ke'], flip: [0, 0, 0, 1], dim: ['k', 'k', 'k', 'k'], door: 'o3', pax: true, stop: true },
  express: { cars: ['xe', 'xp', 'xm', 'xe'], flip: [0, 0, 0, 1], dim: ['x', 'x', 'x', 'x'], door: 'o1', pax: true, stop: true },
  diesel: { cars: ['de', 'de'], flip: [0, 1], dim: ['d', 'd'], door: 'o2', pax: true, stop: true },
  freight: { cars: ['el', 'fc', 'ft', 'fc'], flip: [0, 0, 0, 0], dim: ['el', 'fc', 'ft', 'fc'], door: null, pax: false, stop: false },
  mono: { cars: ['me', 'mm', 'mm', 'me'], flip: [0, 0, 0, 1], dim: ['m', 'm', 'm', 'm'], door: null, pax: true, stop: true },
  agt: { cars: ['ae', 'am', 'am', 'ae'], flip: [0, 0, 0, 1], dim: ['a', 'a', 'a', 'a'], door: null, pax: true, stop: true },
  sl: { cars: ['sl', 'sc', 'sc', 'sc'], flip: [0, 0, 0, 0], dim: ['sl', 's', 's', 's'], door: null, pax: false, stop: true },
};
/** 編成ごとの色（帯・塗装・コンテナ）。k は編成の番号、c は何両目 */
export function famColor(f: TrainFam, k: number, c: number): number {
  switch (f) {
    case 'commuter': return [0x2f6fb5, 0x1f8a5a, 0xd9622b, 0xc8283c, 0x6a3fa0, 0x1a9ad6][k % 6];
    case 'kinko': return [0xe0782a, 0x1f7a4a, 0x2a5ab0][k % 3];
    case 'express': return [0xc8283c, 0x2a4a9a, 0xe08a1a][k % 3];
    case 'diesel': return [0xe8752a, 0x2f8a6a, 0xd8d0b8][k % 3];
    case 'freight': return c === 0 ? 0x3c5a8c : [0x8a3a2a, 0x2f5a9a, 0x3a7a4a, 0xa88a2a][(k + c * 3) % 4];
    case 'mono': return [0x1a9ad6, 0x2f6fb5, 0x2aa060][k % 3];
    case 'agt': return [0x1a9ad6, 0x2f6fb5, 0xd9622b][k % 3];
    default: return 0x6b3a22;
  }
}
