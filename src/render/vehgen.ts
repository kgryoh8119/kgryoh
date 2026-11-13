// v86：走る車（タクシー・パトカー・救急車・消防車・箱車・ごみ収集車・スクーター・自転車）と電車の車体を、箱や棒を組み合わせて作る。
// 乗用車の形は cargen.ts の断面から作る仕組み。ここはその仕組みに合わない角ばった車や、乗る人つきの二輪車、電車の車体。
// 面の種類は車と同じ番号に、7 白・8 赤・9 青・10 黄・11 乗る人の服・12 肌・13 ナンバー（白）・14 ナンバー（軽の黄）・15 暗い鉄ホイール・16 灰色ホイール・17 ナンバー（事業用の緑）を足した（CAR_PART）。
import { build, makeCars, CAR_KINDS, SEDAN, VAN, type CarMesh } from './cargen';
import { makeTrains } from './trainkit';

type V3 = number[];
const sub = (a: V3, b: V3) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], crs = (a: V3, b: V3) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], nrm = (a: V3) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const mesh = (): CarMesh => ({ V: [], F: [] });
/** 外向き（out のほう）になる順で三角を足す */
function emit(M: CarMesh, a: number, b: number, c: number, t: number, out: V3): void { const A = M.V[a], n = crs(sub(M.V[b], A), sub(M.V[c], A)); M.F.push(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? [a, b, c, t] : [a, c, b, t]); }
function quadV(M: CarMesh, p: V3[], t: number, out: V3): void { const i = p.map(q => M.V.push([q[0], q[1], q[2]]) - 1); emit(M, i[0], i[1], i[2], t, out); emit(M, i[0], i[2], i[3], t, out); }
/** 8 つの角から立体を作る（0〜3 が下の輪、4〜7 が上の輪）。T = [下, 上, 辺01, 辺12, 辺23, 辺30] の面の種類 */
function hex8(M: CarMesh, p: V3[], T: number[]): void {
  const i = p.map(q => M.V.push([q[0], q[1], q[2]]) - 1), c = [0, 1, 2].map(k => p.reduce((s, q) => s + q[k], 0) / 8);
  const Q: [number, number, number, number, number][] = [[0, 1, 2, 3, T[0]], [4, 5, 6, 7, T[1]], [0, 1, 5, 4, T[2]], [1, 2, 6, 5, T[3]], [2, 3, 7, 6, T[4]], [3, 0, 4, 7, T[5]]];
  for (const [a, b, d, e, t] of Q) { const m = [0, 1, 2].map(k => (p[a][k] + p[b][k] + p[d][k] + p[e][k]) / 4 - c[k]); emit(M, i[a], i[b], i[d], t, m); emit(M, i[a], i[d], i[e], t, m); }
}
/** 下の長方形 b=[x0,x1,y0,y1]（高さ z0）と上の長方形 u（高さ z1）をつなぐ箱。t は 1 つの種類か [前, 後, 左右, 上, 下] */
function frus(M: CarMesh, b: number[], z0: number, u: number[], z1: number, t: number | number[]): void {
  const T = Array.isArray(t) ? t : [t, t, t, t, t];
  hex8(M, [[b[0], b[2], z0], [b[1], b[2], z0], [b[1], b[3], z0], [b[0], b[3], z0], [u[0], u[2], z1], [u[1], u[2], z1], [u[1], u[3], z1], [u[0], u[3], z1]], [T[4], T[3], T[1], T[2], T[0], T[2]]);
}
const box = (M: CarMesh, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, t: number | number[]) => frus(M, [x0, x1, y0, y1], z0, [x0, x1, y0, y1], z1, t);
/** 点 a から b へ、太さ w の棒（断面は四角） */
function limb(M: CarMesh, a: V3, b: V3, w: number, t: number): void {
  const d = nrm(sub(b, a)); let s = crs(d, [0, 0, 1]); if (Math.hypot(s[0], s[1], s[2]) < 0.2) s = crs(d, [1, 0, 0]); s = nrm(s); const u = nrm(crs(s, d)), P: V3[] = [];
  for (const e of [a, b]) for (const [ks, ku] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P.push([e[0] + (s[0] * ks + u[0] * ku) * w, e[1] + (s[1] * ks + u[1] * ku) * w, e[2] + (s[2] * ks + u[2] * ku) * w]);
  hex8(M, P, [t, t, t, t, t, t]);
}
/** 横の面の板（x = sx*xo）。y と z の範囲 */
const side = (M: CarMesh, sx: number, y0: number, y1: number, z0: number, z1: number, t: number, xo: number) => quadV(M, [[sx * xo, y0, z0], [sx * xo, y1, z0], [sx * xo, y1, z1], [sx * xo, y0, z1]], t, [sx, 0, 0]);
/** 前（dir=1）か後ろ（-1）の面の板 */
const end = (M: CarMesh, x0: number, x1: number, y: number, z0: number, z1: number, t: number, dir: number) => quadV(M, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], t, [0, dir, 0]);
/** 車輪（軸は x）。中心の x、前後位置 y、半径 r、幅 w、角数 N。sx の向きの面にホイール */
function wheel(M: CarMesh, cx: number, y: number, r: number, w: number, N: number, sx: number, hub = 6): void {
  const xo = cx + sx * w / 2, xi = cx - sx * w / 2, ro: number[] = [], ri: number[] = [], rh: number[] = [];
  for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); ro.push(M.V.push([xo, y + c * r, r + s * r]) - 1); ri.push(M.V.push([xi, y + c * r, r + s * r]) - 1); rh.push(M.V.push([xo + sx * 0.01, y + c * r * 0.6, r + s * r * 0.6]) - 1); }
  const hc = M.V.push([xo + sx * 0.02, y, r]) - 1;
  for (let k = 0; k < N; k++) { const j = (k + 1) % N, a = ((k + 0.5) / N) * Math.PI * 2, o = [0, Math.cos(a), Math.sin(a)];
    emit(M, ro[k], ro[j], ri[j], 1, o); emit(M, ro[k], ri[j], ri[k], 1, o); emit(M, ro[k], ro[j], rh[j], 1, [sx, 0, 0]); emit(M, ro[k], rh[j], rh[k], 1, [sx, 0, 0]); emit(M, hc, rh[k], rh[j], hub, [sx, 0, 0]); }
}
const wheels = (M: CarMesh, xs: number, ys: number[], r: number, w: number, N: number, hub = 6) => { for (const y of ys) for (const sx of [-1, 1]) wheel(M, sx * xs, y, r, w, N, sx, hub); };
/** トラックの運転台（前が少し傾いた箱）。z0 が下、z1 が上、yb が後ろ、yf が下の前、rake が上で前が引っ込む量。窓・グリル・バンパーつき */
function truckCab(M: CarMesh, hw: number, yb: number, yf: number, z0: number, z1: number, rake: number, t: number): void {
  frus(M, [-hw, hw, yb, yf], z0, [-hw * 0.96, hw * 0.96, yb, yf - rake], z1, t);
  const zs0 = z0 + (z1 - z0) * 0.5, zs1 = z1 - 0.1, xo = hw * 0.97 + 0.012, yAt = (z: number) => yf - rake * (z - z0) / (z1 - z0) + 0.012;
  quadV(M, [[-hw * 0.84, yAt(zs0), zs0], [hw * 0.84, yAt(zs0), zs0], [hw * 0.84, yAt(zs1), zs1], [-hw * 0.84, yAt(zs1), zs1]], 5, [0, 1, 0.4]);
  for (const sx of [-1, 1]) { side(M, sx, yb + 0.25, yf - rake - 0.2, zs0, zs1, 5, xo); end(M, sx * hw * 0.3, sx * hw * 0.78, yAt(z0 + 0.35), z0 + 0.12, z0 + 0.42, 3, 1); }
  end(M, -hw * 0.45, hw * 0.45, yAt(z0 + 0.4), z0 + 0.1, z0 + 0.34, 2, 1); // グリル
  box(M, -hw - 0.02, hw + 0.02, yf - 0.02, yf + 0.3, 0.62, 1.02, 2); end(M, -0.28, 0.28, yf + 0.31, 0.72, 0.84, 13, 1); // バンパーとナンバー
}
const lights = (M: CarMesh, hw: number, yr: number, zr: number) => { for (const sx of [-1, 1]) end(M, sx * hw * 0.62, sx * hw * 0.92, yr - 0.012, zr, zr + 0.26, 4, -1); end(M, -0.28, 0.28, yr - 0.014, zr - 0.05, zr + 0.07, 13, -1); };
/** 赤と青の回転灯（パトカー・救急車・消防車） */
const bar = (M: CarMesh, y0: number, y1: number, z: number, hw = 0.46) => { box(M, -hw, hw, y0, y1, z, z + 0.07, 2); box(M, -hw, -0.02, y0 + 0.02, y1 - 0.02, z + 0.07, z + 0.17, 8); box(M, 0.02, hw, y0 + 0.02, y1 - 0.02, z + 0.07, z + 0.17, 9); };

/** 走る車の形（v86）：乗用 9 種 + タクシー・パトカー・救急車・消防車・2t 箱車・ごみ収集車・スクーター・自転車。並び順は scene.ts の車の形の番号 */
export const VEH_MODELS = [...CAR_KINDS, 'taxi', 'police', 'ambulance', 'fire', 'box2t', 'garbage', 'scooter', 'bicycle'] as const;
export type VehModel = typeof VEH_MODELS[number];
/** N：タイヤの角数（品質で 8 / 10 / 14）。二輪は N - 2、N - 4 角 */
export function makeVeh(N = 14): Record<VehModel, CarMesh> {
  const B = (sp: Parameters<typeof build>[0], inside = true) => build(sp, N, inside), K = makeCars(N, true);
  // タクシー：セダンに屋根の行灯（黄）
  const taxi = B(SEDAN); box(taxi, -0.2, 0.2, -0.12, 0.2, 1.41, 1.5, [2, 2, 2, 10, 2]); box(taxi, -0.18, 0.18, -0.1, 0.18, 1.5, 1.57, 10);
  // パトカー：セダンの屋根・ボンネット・トランクを白に（車体は黒）。屋根に赤と青の回転灯、側面に白い帯
  const police = B(SEDAN); for (const f of police.F) if (f[3] === 0) { const z = (police.V[f[0]][2] + police.V[f[1]][2] + police.V[f[2]][2]) / 3; if (z > 0.8) f[3] = 7; }
  bar(police, -0.2, 0.1, 1.41); for (const sx of [-1, 1]) side(police, sx, -0.7, 0.9, 0.58, 0.72, 7, 0.9);
  // 救急車：背の高いバン（車体は白）。側面に赤い帯、屋根に赤色灯
  const amb = B({ ...VAN, secs: VAN.secs.map((s, i) => i < 3 ? { ...s, zt: s.zt + 0.42 } : s), wheelR: 0.33 });
  for (const sx of [-1, 1]) { side(amb, sx, -2.1, 1.0, 0.62, 0.9, 8, 0.905); side(amb, sx, -2.1, 1.0, 1.15, 1.2, 8, 0.905); } bar(amb, -0.3, 0.2, 2.4, 0.5); end(amb, -0.3, 0.3, 2.43, 0.62, 0.82, 8, 1);
  // 消防車：赤い車体、白い帯、はしご、運転台の赤色灯
  const fire = mesh(); box(fire, -1.05, 1.05, -3.6, 3.7, 0.5, 1.0, 3); box(fire, -1.15, 1.15, -3.5, 0.8, 1.0, 2.5, 0);
  for (const sx of [-1, 1]) { side(fire, sx, -3.5, 0.8, 1.0, 1.14, 7, 1.152); for (const [a, b] of [[-3.3, -1.2], [-1.0, 0.55]]) side(fire, sx, a, b, 1.25, 2.25, 6, 1.152); }
  truckCab(fire, 1.1, 0.9, 3.3, 1.0, 2.7, 0.3, 0); bar(fire, 1.55, 2.05, 2.7, 0.5);
  for (const sx of [-1, 1]) limb(fire, [sx * 0.5, -3.4, 2.6], [sx * 0.5, 0.5, 2.95], 0.04, 6);
  for (let k = 0; k < 9; k++) { const y = -3.2 + k * 0.4, z = 2.6 + (y + 3.4) / 3.9 * 0.35; limb(fire, [-0.5, y, z], [0.5, y, z], 0.025, 6); }
  lights(fire, 1.1, -3.5, 1.3); wheels(fire, 1.12, [-2.2, 2.25], 0.5, 0.34, N, 15);
  // 2t の箱車：荷台と小さな運転台（箱と運転台は車ごとの色）
  const box2 = mesh(); box(box2, -0.92, 0.92, -3.0, 1.55, 1.0, 3.0, 0); box(box2, -0.85, 0.85, -3.0, 3.1, 0.55, 1.0, 3);
  truckCab(box2, 0.9, 1.6, 3.0, 1.0, 2.35, 0.45, 0); for (const sx of [-1, 1]) side(box2, sx, -2.9, 1.5, 1.2, 1.5, 9, 0.925);
  lights(box2, 0.9, -3.0, 1.15); wheels(box2, 0.93, [-1.9, 2.1], 0.37, 0.24, N, 15);
  // ごみ収集車：荷箱の後ろに投入口、運転台の屋根に黄色い回転灯
  const gar = mesh(); box(gar, -0.95, 0.95, -3.1, 1.05, 1.0, 2.6, 0); box(gar, -0.9, 0.9, -3.35, -2.6, 0.95, 1.85, 2); box(gar, -0.8, 0.8, -3.4, -3.3, 1.0, 1.1, 2);
  for (const sx of [-1, 1]) { side(gar, sx, -2.6, 1.0, 1.3, 1.5, 9, 0.955); side(gar, sx, -2.5, -0.4, 1.7, 2.4, 7, 0.955); } box(gar, -0.5, 0.5, -3.0, 0.9, 2.6, 2.66, 7);
  truckCab(gar, 0.92, 1.15, 2.85, 1.0, 2.35, 0.42, 0); box(gar, -0.12, 0.12, 1.8, 2.0, 2.35, 2.5, 10);
  lights(gar, 0.92, -3.4, 1.12); wheels(gar, 0.96, [-1.6, 2.0], 0.37, 0.26, N, 15);
  // スクーター（乗る人つき）：車体の色は人の上着にも掛かる
  const sc = mesh(), n8 = Math.max(8, N - 2);
  for (const y of [-0.62, 0.6]) { wheel(sc, 0, y, 0.24, 0.12, n8, 1, 15); wheel(sc, 0, y, 0.24, 0.12, n8, -1, 15); }
  box(sc, -0.2, 0.2, -0.75, 0.4, 0.26, 0.58, 0); frus(sc, [-0.17, 0.17, 0.38, 0.72], 0.3, [-0.15, 0.15, 0.5, 0.64], 1.12, 0); limb(sc, [0, 0.6, 0.4], [0, 0.56, 0.82], 0.03, 2);
  box(sc, -0.33, 0.33, 0.54, 0.6, 1.07, 1.12, 2); end(sc, -0.1, 0.1, 0.725, 0.78, 0.98, 3, 1); end(sc, -0.1, 0.1, -0.76, 0.46, 0.56, 4, -1); box(sc, -0.15, 0.15, -0.72, -0.05, 0.58, 0.68, 2);
  for (const sx of [-1, 1]) { limb(sc, [sx * 0.13, -0.15, 0.8], [sx * 0.17, 0.3, 0.7], 0.06, 11); limb(sc, [sx * 0.17, 0.3, 0.7], [sx * 0.17, 0.42, 0.3], 0.055, 11); limb(sc, [sx * 0.14, -0.08, 1.2], [sx * 0.3, 0.5, 1.1], 0.045, 0); }
  limb(sc, [0, -0.3, 0.78], [0, -0.1, 1.38], 0.13, 0); box(sc, -0.1, 0.1, -0.2, 0.0, 1.38, 1.5, 12); box(sc, -0.14, 0.14, -0.25, 0.06, 1.48, 1.7, 7);
  // 自転車（ママチャリ型。乗る人つき）
  const bi = mesh(), n6 = Math.max(8, N - 4);
  for (const y of [-0.55, 0.55]) { wheel(bi, 0, y, 0.33, 0.04, n6, 1, 1); wheel(bi, 0, y, 0.33, 0.04, n6, -1, 1); }
  limb(bi, [0, -0.55, 0.33], [0, -0.12, 0.58], 0.015, 6); limb(bi, [0, -0.12, 0.58], [0, 0.4, 0.74], 0.015, 6); limb(bi, [0, 0.55, 0.33], [0, 0.4, 0.74], 0.015, 6); limb(bi, [0, 0.4, 0.74], [0, 0.36, 1.02], 0.015, 6); limb(bi, [0, -0.12, 0.58], [0, -0.2, 0.84], 0.015, 6);
  box(bi, -0.22, 0.22, 0.34, 0.4, 1.0, 1.04, 2); box(bi, -0.12, 0.12, -0.28, -0.1, 0.84, 0.88, 2); box(bi, -0.14, 0.14, 0.52, 0.76, 0.84, 1.02, 6); end(bi, -0.05, 0.05, 0.775, 0.9, 0.96, 3, 1); end(bi, -0.04, 0.04, -0.58, 0.45, 0.52, 4, -1);
  for (const sx of [-1, 1]) { limb(bi, [sx * 0.11, -0.2, 0.9], [sx * 0.12, 0.05, 0.38], 0.045, 11); limb(bi, [sx * 0.15, 0.3, 1.38], [sx * 0.2, 0.4, 1.04], 0.03, 0); }
  limb(bi, [0, -0.18, 0.98], [0, 0.18, 1.4], 0.1, 0); box(bi, -0.09, 0.09, 0.14, 0.34, 1.4, 1.54, 12); box(bi, -0.1, 0.1, 0.12, 0.34, 1.52, 1.62, 11);
  for (const M of [taxi, box2, gar]) for (const f of M.F) if (f[3] === 13) f[3] = 17; // v88：事業用（緑ナンバー）
  return { ...K, taxi, police, ambulance: amb, fire, box2t: box2, garbage: gar, scooter: sc, bicycle: bi };
}

/** v88：円筒（軸は y。中心 (0, y, z)、半径 r。ミキサーのドラム・タンク）。t は 1 つか、帯の交互 [a, b] */
function drum(M: CarMesh, y0: number, z0: number, r0: number, y1: number, z1: number, r1: number, n: number, t: number | [number, number], caps = true): void {
  const A: number[] = [], B: number[] = [];
  for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); A.push(M.V.push([c * r0, y0, z0 + s * r0]) - 1); B.push(M.V.push([c * r1, y1, z1 + s * r1]) - 1); }
  for (let k = 0; k < n; k++) { const j = (k + 1) % n, a = (k + 0.5) / n * Math.PI * 2, o = [Math.cos(a), 0, Math.sin(a)], tt = Array.isArray(t) ? t[k % 2] : t; emit(M, A[k], A[j], B[j], tt, o); emit(M, A[k], B[j], B[k], tt, o); }
  if (caps) { const ca = M.V.push([0, y0, z0]) - 1, cb = M.V.push([0, y1, z1]) - 1, tc = Array.isArray(t) ? t[0] : t; for (let k = 0; k < n; k++) { const j = (k + 1) % n; emit(M, ca, A[k], A[j], tc, [0, -1, 0]); emit(M, cb, B[k], B[j], tc, [0, 1, 0]); } }
}
/** v88：二輪に乗る人。腰 (0, yh, zh)、手 (±hx, yg, zg)、足の先 (y=yf, z=zf)、前傾 lean（0 まっすぐ〜1 深く）。服は種類 c、ヘルメットは helm */
function rider(M: CarMesh, yh: number, zh: number, yg: number, zg: number, hx: number, yf: number, zf: number, lean: number, c = 11, helm = 7): void {
  const yt = yh + 0.45 * lean, zt = zh + 0.58 - 0.18 * lean; limb(M, [0, yh, zh], [0, yt, zt], 0.12, c); // 胴
  box(M, -0.09, 0.09, yt - 0.06, yt + 0.12, zt + 0.02, zt + 0.16, 12); box(M, -0.13, 0.13, yt - 0.1, yt + 0.12, zt + 0.12, zt + 0.32, helm); // 顔・ヘルメット
  for (const sx of [-1, 1]) { limb(M, [sx * 0.14, yt - 0.02, zt - 0.05], [sx * hx, yg, zg], 0.04, c); limb(M, [sx * 0.11, yh, zh], [sx * 0.15, yh + 0.3, zh - 0.12], 0.06, 2); limb(M, [sx * 0.15, yh + 0.3, zh - 0.12], [sx * 0.15, yf, zf], 0.05, 2); }
}
/** v88：働く車と二輪（scene.ts で 20 番からの形。並び順は WORK_MODELS） */
export const WORK_MODELS = ['dump', 'mixer', 'tanker', 'crane', 'parcel', 'tow', 'kitchen', 'welfare', 'kyoshu', 'ladder', 'rescue', 'moto', 'whitebike', 'roadbike', 'mamachari', 'kick', 'postbike', 'carrier'] as const;
export type WorkModel = typeof WORK_MODELS[number];
/** 前照灯の前後位置（車の中心から。scene.ts の車間と灯りの位置） */
export const WORK_HL = [3.6, 3.7, 3.6, 3.7, 2.6, 3.0, 1.8, 2.45, 2.2, 4.8, 3.7, 0.9, 0.9, 0.85, 0.9, 0.5, 0.9, 3.8];
/** N：タイヤの角数（品質で 8 / 10 / 14） */
export function makeWork(N = 14): Record<WorkModel, CarMesh> {
  const n8 = Math.max(8, N - 2), n6 = Math.max(8, N - 4), dn = N >= 12 ? 12 : 8;
  /** 大型の車台：運転台（色 tc）・はしご形の車台・尾灯・車輪（ys の前後位置） */
  const chassis = (M: CarMesh, hw: number, yr: number, yf: number, cabZ: number, tc: number, ys: number[], r = 0.5) => { truckCab(M, hw, yf - 2.0, yf, 1.0, cabZ, 0.3, tc); box(M, -0.55, 0.55, yr, yf - 2.0, 0.62, 1.0, 2); lights(M, hw, yr, 1.0); wheels(M, hw + 0.02, ys, r, 0.34, N, 15); box(M, -hw, hw, yf - 2.6, yf - 2.0, 0.9, 1.05, 2); };
  // ダンプ：白い運転台と、荷台（車ごとの色。あおりは厚く、前に鳥居）
  const dump = mesh(); chassis(dump, 1.15, -3.4, 3.4, 2.75, 7, [-2.5, -1.25, 2.4]); box(dump, -1.15, 1.15, -3.4, 1.2, 1.05, 1.2, 0); for (const sx of [-1, 1]) box(dump, sx * 1.15 - 0.06, sx * 1.15 + 0.06, -3.4, 1.2, 1.2, 2.05, 0);
  box(dump, -1.15, 1.15, -3.46, -3.34, 1.2, 2.0, 0); box(dump, -1.15, 1.15, 1.1, 1.25, 1.2, 2.9, 0); for (const sx of [-1, 1]) side(dump, sx, -3.3, 1.1, 1.75, 1.9, 2, 1.215);
  // ミキサー車：斜めの白いドラム（赤い帯の渦）と投入口
  const mixer = mesh(); chassis(mixer, 1.15, -3.5, 3.5, 2.75, 0, [-2.6, -1.4, 2.5]); drum(mixer, -3.2, 1.6, 0.85, 0.2, 2.45, 1.15, dn, [7, 8]); drum(mixer, 0.2, 2.45, 1.15, 1.2, 2.7, 0.7, dn, 7); box(mixer, -0.3, 0.3, -3.55, -3.0, 2.0, 2.5, 16); box(mixer, -0.7, 0.7, 1.1, 1.4, 1.0, 2.2, 2);
  // タンクローリー：銀のタンク、上の歩み板、後ろの危険物の黄色い標識、側面の赤い帯
  const tanker = mesh(); chassis(tanker, 1.15, -3.8, 3.4, 2.75, 0, [-2.8, -1.6, 2.4]); drum(tanker, -3.75, 2.0, 1.0, 1.25, 2.0, 1.0, dn, 16); box(tanker, -0.35, 0.35, -3.4, 0.9, 2.95, 3.05, 2); end(tanker, -0.25, 0.25, -3.77, 1.3, 1.6, 10, -1);
  for (const sx of [-1, 1]) side(tanker, sx, -3.6, 1.1, 1.05, 1.15, 8, 1.02);
  // ラフタークレーン：低い車体の前に小さな運転台、上に黄色い伸縮ブームとフック、張り出す脚
  const crane = mesh(); box(crane, -1.2, 1.2, -3.6, 3.6, 0.8, 1.7, 0); box(crane, -0.6, 0.15, 1.6, 3.4, 1.7, 2.9, 0); for (const sx of [-1, 1]) side(crane, sx, 1.8, 3.2, 2.1, 2.75, 5, sx > 0 ? 0.152 : 0.602); end(crane, -0.55, 0.1, 3.41, 2.1, 2.75, 5, 1);
  box(crane, -0.8, 0.8, -1.4, 0.4, 1.7, 2.3, 10); limb(crane, [0, -2.0, 2.4], [0, 4.4, 3.4], 0.3, 10); limb(crane, [0, 4.4, 3.4], [0, 4.6, 2.5], 0.03, 2); box(crane, -0.15, 0.15, 4.45, 4.75, 2.2, 2.5, 10);
  for (const sx of [-1, 1]) for (const y of [-2.9, 2.6]) box(crane, sx > 0 ? 1.2 : -1.55, sx > 0 ? 1.55 : -1.2, y - 0.2, y + 0.2, 0.7, 1.0, 10); wheels(crane, 1.22, [-2.2, 2.2], 0.62, 0.42, N, 15); lights(crane, 1.2, -3.6, 1.1);
  // 宅配の箱車（ウォークスルー）：白い箱に会社の色の帯（車ごとの色）、低い運転台、緑ナンバー
  const parcel = mesh(); box(parcel, -1.0, 1.0, -2.6, 2.1, 0.55, 2.75, 7); frus(parcel, [-1.0, 1.0, 2.1, 2.5], 0.55, [-0.98, 0.98, 2.1, 2.3], 2.2, 7); for (const sx of [-1, 1]) { side(parcel, sx, -2.5, 1.2, 0.7, 1.15, 0, 1.012); side(parcel, sx, -2.5, 1.2, 2.3, 2.55, 0, 1.012); side(parcel, sx, 1.45, 2.05, 1.3, 2.1, 5, 1.012); }
  quadV(parcel, [[-0.85, 2.36, 1.35], [0.85, 2.36, 1.35], [0.85, 2.29, 2.1], [-0.85, 2.29, 2.1]], 5, [0, 1, 0.1]); end(parcel, -1.0, 1.0, 2.51, 0.55, 0.85, 2, 1); for (const sx of [-1, 1]) end(parcel, sx > 0 ? 0.55 : -0.9, sx > 0 ? 0.9 : -0.55, 2.51, 0.95, 1.12, 3, 1); end(parcel, -0.28, 0.28, 2.52, 0.6, 0.75, 17, 1);
  lights(parcel, 1.0, -2.6, 0.75); end(parcel, -0.9, 0.9, -2.612, 1.0, 2.6, 0, -1); wheels(parcel, 0.98, [-1.6, 1.5], 0.38, 0.26, N, 15);
  // レッカー車：運転台・後ろの黄色いブームとフック・屋根の黄色い回転灯
  const tow = mesh(); chassis(tow, 1.0, -3.0, 2.6, 2.4, 0, [-1.9, 1.7], 0.42); box(tow, -0.9, 0.9, -3.0, 0.6, 1.0, 1.3, 0); limb(tow, [0, -0.2, 1.3], [0, -2.8, 2.5], 0.12, 10); limb(tow, [0, -2.8, 2.5], [0, -3.0, 1.4], 0.025, 2); box(tow, -0.1, 0.1, -3.1, -2.9, 1.25, 1.45, 2);
  box(tow, -0.9, 0.9, -3.3, -3.0, 0.6, 0.8, 10); box(tow, -0.5, 0.5, 0.75, 0.95, 2.4, 2.55, 10);
  // キッチンカー（軽トラの荷台の箱。横の窓が開いて、赤白のひさしと黄色い看板）
  const kitchen = mesh(); box(kitchen, -0.73, 0.73, -1.75, 0.45, 0.55, 2.3, 0); for (const sx of [-1, 1]) side(kitchen, sx, -1.6, 0.3, 0.6, 0.8, 7, 0.742); side(kitchen, -1, -1.5, 0.2, 1.2, 1.9, 5, 0.745);
  quadV(kitchen, [[-0.74, -1.55, 1.95], [-0.74, 0.25, 1.95], [-1.25, 0.25, 1.75], [-1.25, -1.55, 1.75]], 8, [-0.3, 0, 1]); quadV(kitchen, [[-0.74, -1.55, 1.948], [-0.74, 0.25, 1.948], [-1.25, 0.25, 1.748], [-1.25, -1.55, 1.748]], 7, [0.3, 0, -1]);
  box(kitchen, -0.7, 0.7, -0.5, 0.0, 2.3, 2.75, 10); box(kitchen, -0.7, 0.7, 0.5, 1.6, 0.4, 1.0, 7); frus(kitchen, [-0.7, 0.7, 0.5, 1.6], 1.0, [-0.62, 0.62, 0.55, 1.25], 1.75, 7); end(kitchen, -0.58, 0.58, 1.3, 1.05, 1.7, 5, 1);
  for (const sx of [-1, 1]) end(kitchen, sx > 0 ? 0.4 : -0.62, sx > 0 ? 0.62 : -0.4, 1.61, 0.7, 0.85, 3, 1); lights(kitchen, 0.72, -1.75, 0.65); wheels(kitchen, 0.72, [-1.1, 1.15], 0.27, 0.18, N, 15);
  // 福祉車両：屋根の高いバン、後ろの車いすの昇降機の枠、青い車いすの印
  const welfare = build({ ...VAN, secs: VAN.secs.map((q, i) => i < 3 ? { ...q, zt: q.zt + 0.3 } : q) }, N); end(welfare, -0.7, 0.7, -2.45, 0.35, 0.45, 16, -1); for (const sx of [-1, 1]) box(welfare, sx * 0.72 - 0.04, sx * 0.72 + 0.04, -2.5, -2.4, 0.4, 2.1, 16); end(welfare, -0.15, 0.15, -2.42, 1.4, 1.7, 9, -1);
  // 教習車：セダンの屋根に「教習車」の行灯（白に青）
  const kyoshu = build(SEDAN, N, true); box(kyoshu, -0.42, 0.42, -0.3, 0.1, 1.41, 1.47, 2); box(kyoshu, -0.4, 0.4, -0.25, 0.05, 1.47, 1.72, 7); for (const sx of [-1, 1]) side(kyoshu, sx, -0.22, 0.02, 1.52, 1.66, 9, 0.402);
  // はしご車：長い赤い車体、上に寝かせた銀のはしご、後ろの旋回台
  const ladder = mesh(); box(ladder, -1.15, 1.15, -4.8, 2.0, 0.9, 1.95, 0); for (const sx of [-1, 1]) side(ladder, sx, -4.7, 1.9, 1.0, 1.12, 7, 1.152); truckCab(ladder, 1.15, 2.0, 4.6, 1.0, 2.8, 0.3, 0); bar(ladder, 3.0, 3.5, 2.8, 0.55);
  box(ladder, -0.9, 0.9, -4.6, -3.0, 1.95, 2.5, 16); for (const sx of [-1, 1]) { limb(ladder, [sx * 0.55, -4.0, 2.7], [sx * 0.55, 4.2, 3.0], 0.06, 16); limb(ladder, [sx * 0.4, -4.0, 2.9], [sx * 0.4, 3.8, 3.2], 0.05, 6); }
  for (let k = 0; k < 14; k++) { const y = -3.8 + k * 0.58; limb(ladder, [-0.55, y, 2.72 + (y + 4) * 0.037], [0.55, y, 2.72 + (y + 4) * 0.037], 0.02, 6); } lights(ladder, 1.15, -4.8, 1.2); wheels(ladder, 1.17, [-3.4, -2.2, 3.4], 0.5, 0.34, N, 15);
  // 救助工作車：赤い箱（銀のシャッターの扉）、後ろの小さなクレーン、屋根の照明
  const rescue = mesh(); box(rescue, -1.15, 1.15, -3.8, 1.0, 0.9, 2.75, 0); for (const sx of [-1, 1]) { for (const [a, b] of [[-3.6, -2.1], [-1.9, -0.4], [-0.2, 0.85]]) side(rescue, sx, a, b, 1.05, 2.45, 16, 1.152); side(rescue, sx, -3.7, 0.9, 2.5, 2.62, 7, 1.152); }
  truckCab(rescue, 1.15, 1.0, 3.5, 1.0, 2.75, 0.3, 0); bar(rescue, 1.8, 2.3, 2.75, 0.55); limb(rescue, [0.5, -3.4, 2.75], [0.5, -0.6, 3.05], 0.12, 7); for (const x of [-0.6, 0]) box(rescue, x - 0.15, x + 0.15, -1.0, -0.7, 2.75, 3.0, 3);
  lights(rescue, 1.15, -3.8, 1.2); wheels(rescue, 1.17, [-2.4, 2.4], 0.5, 0.34, N, 15);
  // 中型バイク（タンク・エンジン・前傾の乗る人）。車体の色は車ごと
  const moto = mesh(); for (const y of [-0.72, 0.72]) for (const sx of [-1, 1]) wheel(moto, 0, y, 0.31, 0.14, n8, sx, 15);
  box(moto, -0.16, 0.16, -0.1, 0.45, 0.32, 0.62, 16); frus(moto, [-0.2, 0.2, 0.05, 0.55], 0.72, [-0.13, 0.13, 0.1, 0.45], 0.92, 0); box(moto, -0.13, 0.13, -0.55, 0.05, 0.75, 0.84, 1); frus(moto, [-0.1, 0.1, -0.85, -0.5], 0.66, [-0.06, 0.06, -0.85, -0.55], 0.8, 0);
  limb(moto, [0, 0.72, 0.31], [0, 0.55, 0.98], 0.03, 16); box(moto, -0.36, 0.36, 0.5, 0.56, 0.98, 1.02, 2); end(moto, -0.09, 0.09, 0.66, 0.85, 1.0, 3, 1); frus(moto, [-0.13, 0.13, 0.55, 0.66], 0.82, [-0.1, 0.1, 0.55, 0.62], 1.1, 0);
  end(moto, -0.07, 0.07, -0.86, 0.68, 0.76, 4, -1); limb(moto, [0.13, -0.3, 0.42], [0.13, -0.85, 0.5], 0.05, 16); rider(moto, -0.3, 0.86, 0.5, 1.0, 0.32, 0.0, 0.45, 0.75);
  // 白バイ：白い車体と前の風よけ、左右の箱、赤色灯、白いヘルメットに青い服
  const wb = mesh(); for (const y of [-0.72, 0.72]) for (const sx of [-1, 1]) wheel(wb, 0, y, 0.31, 0.14, n8, sx, 16);
  box(wb, -0.17, 0.17, -0.1, 0.45, 0.32, 0.62, 16); frus(wb, [-0.22, 0.22, 0.0, 0.6], 0.62, [-0.15, 0.15, 0.1, 0.45], 0.95, 7); box(wb, -0.13, 0.13, -0.6, 0.05, 0.75, 0.84, 1); frus(wb, [-0.3, 0.3, 0.35, 0.7], 0.6, [-0.2, 0.2, 0.45, 0.62], 1.2, 7);
  for (const sx of [-1, 1]) { box(wb, sx > 0 ? 0.24 : -0.36, sx > 0 ? 0.36 : -0.24, -0.85, -0.35, 0.45, 0.8, 7); box(wb, sx * 0.22 - 0.04, sx * 0.22 + 0.04, 0.6, 0.66, 1.0, 1.1, 8); } box(wb, -0.04, 0.04, -0.75, -0.65, 0.84, 1.6, 2);
  end(wb, -0.09, 0.09, 0.71, 0.85, 1.0, 3, 1); end(wb, -0.07, 0.07, -0.86, 0.68, 0.76, 4, -1); rider(wb, -0.3, 0.86, 0.5, 1.1, 0.34, 0.0, 0.45, 0.4, 9, 7);
  // ロードバイク（細い枠・ドロップハンドル・深く前傾）
  const rb = mesh(); for (const y of [-0.5, 0.5]) for (const sx of [-1, 1]) wheel(rb, 0, y, 0.34, 0.025, n6, sx, 1);
  limb(rb, [0, -0.5, 0.34], [0, -0.1, 0.62], 0.012, 0); limb(rb, [0, -0.1, 0.62], [0, 0.4, 0.82], 0.014, 0); limb(rb, [0, 0.5, 0.34], [0, 0.4, 0.82], 0.012, 0); limb(rb, [0, -0.5, 0.34], [0, -0.05, 0.34], 0.012, 0); limb(rb, [0, -0.05, 0.34], [0, -0.1, 0.62], 0.014, 0);
  box(rb, -0.2, 0.2, 0.42, 0.46, 0.82, 0.86, 2); box(rb, -0.06, 0.06, -0.2, 0.0, 0.88, 0.92, 2); rider(rb, -0.15, 0.95, 0.45, 0.85, 0.2, 0.0, 0.35, 1.0, 11, 10);
  // ママチャリ（前と後ろの子ども乗せ、後ろに子ども）
  const mm = mesh(); for (const y of [-0.55, 0.55]) for (const sx of [-1, 1]) wheel(mm, 0, y, 0.3, 0.04, n6, sx, 1);
  limb(mm, [0, -0.55, 0.3], [0, -0.12, 0.58], 0.015, 0); limb(mm, [0, -0.12, 0.58], [0, 0.4, 0.5], 0.018, 0); limb(mm, [0, 0.55, 0.3], [0, 0.4, 0.74], 0.015, 0); limb(mm, [0, 0.4, 0.74], [0, 0.34, 1.02], 0.015, 0);
  box(mm, -0.22, 0.22, 0.3, 0.36, 1.0, 1.04, 2); box(mm, -0.16, 0.16, 0.42, 0.72, 0.84, 1.1, 2); box(mm, -0.18, 0.18, -0.85, -0.42, 0.72, 0.8, 2); box(mm, -0.18, 0.18, -0.87, -0.8, 0.8, 1.2, 2); box(mm, -0.1, 0.1, -0.7, -0.5, 0.8, 1.1, 11); box(mm, -0.08, 0.08, -0.7, -0.54, 1.1, 1.3, 10);
  end(mm, -0.05, 0.05, 0.73, 0.9, 0.96, 3, 1); rider(mm, -0.25, 0.88, 0.32, 1.02, 0.22, 0.05, 0.38, 0.15, 11, 2);
  // 電動キックボード（立ち乗り）
  const kick = mesh(); for (const y of [-0.45, 0.45]) for (const sx of [-1, 1]) wheel(kick, 0, y, 0.11, 0.06, n6, sx, 1); box(kick, -0.08, 0.08, -0.42, 0.38, 0.12, 0.18, 0); limb(kick, [0, 0.42, 0.15], [0, 0.36, 1.05], 0.02, 2); box(kick, -0.22, 0.22, 0.34, 0.38, 1.03, 1.07, 2);
  for (const sx of [-1, 1]) { limb(kick, [sx * 0.08, -0.05, 0.18], [sx * 0.09, -0.02, 0.62], 0.055, 2); limb(kick, [sx * 0.09, -0.02, 0.62], [sx * 0.11, 0.0, 1.0], 0.065, 2); limb(kick, [sx * 0.15, 0.05, 1.42], [sx * 0.2, 0.36, 1.06], 0.035, 11); }
  limb(kick, [0, 0.0, 1.0], [0, 0.04, 1.5], 0.13, 11); box(kick, -0.09, 0.09, -0.04, 0.14, 1.52, 1.68, 12); box(kick, -0.1, 0.1, -0.06, 0.14, 1.66, 1.74, 1);
  // 郵便バイク：赤いスクーター（車ごとの色）と、後ろの赤い箱
  const post = makeVeh(N).scooter; box(post, -0.24, 0.24, -0.95, -0.5, 0.68, 1.08, 8); end(post, -0.1, 0.1, -0.952, 0.86, 0.96, 7, -1);
  // キャリアカー：運転台と、2 段の荷台（銀の枠）
  const carrier = mesh(); chassis(carrier, 1.15, -6.5, 3.6, 2.7, 0, [-5.5, -4.4, 2.6]); box(carrier, -1.15, 1.15, -6.5, 1.6, 0.95, 1.08, 16); for (const sx of [-1, 1]) { limb(carrier, [sx * 1.1, -6.4, 3.0], [sx * 1.1, 2.9, 3.2], 0.06, 16); for (const y of [-6.2, -3.6, -1.0, 1.4]) limb(carrier, [sx * 1.1, y, 1.05], [sx * 1.1, y, 3.1], 0.05, 16); }
  box(carrier, -1.1, 1.1, -6.4, 2.9, 3.0, 3.08, 16);
  return { dump, mixer, tanker, crane, parcel, tow, kitchen, welfare, kyoshu, ladder, rescue, moto, whitebike: wb, roadbike: rb, mamachari: mm, kick, postbike: post, carrier };
}

/** 車の部位の色（面の種類 0〜16）。0 は車ごとの色 */
export const CAR_PART = [0xffffff, 0x151515, 0x3a3a3c, 0xfff6d8, 0xd02020, 0x26313a, 0x9aa0a6, 0xf4f4f2, 0xd8261c, 0x2a52c8, 0xffc21a, 0x2c2f38, 0xe0b090, 0xeeeeea, 0xf2d030, 0x4a4e54, 0x6c7076, 0x2f7a4a];
/** 日本の街の車の色（白・黒・銀・灰で 7 割強）。r は 0〜1。軽は明るい色が少し多い */
export function carColor(r: number, kei = false): number {
  const T: [number, number][] = kei ? [[0.2, 0xf4f4f2], [0.3, 0x2a2c30], [0.38, 0xc4c8cc], [0.45, 0x8a9096], [0.54, 0xa8d4e6], [0.62, 0xf2c8d4], [0.7, 0xd8e8b8], [0.76, 0x2c3e5c], [0.82, 0xd8d0b8], [0.88, 0xc0302a], [0.94, 0xe8b830], [1, 0x3a7a5a]]
    : [[0.28, 0xf4f4f2], [0.48, 0x24262a], [0.61, 0xc4c8cc], [0.73, 0x777c82], [0.8, 0x2a3a58], [0.85, 0xb02e2a], [0.89, 0xd8d0b8], [0.92, 0x2f4a3a], [0.94, 0x6a4a36], [0.96, 0xe08a2a], [0.98, 0x8fb3c9], [1, 0xe8c840]];
  for (const [p, c] of T) if (r < p) return c; return 0xf4f4f2;
}

// ---- 電車の車体。v88 から trainkit.ts（通勤形・近郊形・特急形・気動車・貨物・モノレール・新交通・旧型客車）。ここは通勤形の 3 種を前の名前で返す
export { TRAIN_PART } from './trainkit';
/** 中間車・パンタグラフ車・先頭車（前が +y）。長さ 19.5m・幅 2.9m */
export function makeTrain(N = 10, q = 2): { mid: CarMesh; pan: CarMesh; end: CarMesh } { const T = makeTrains(N, q); return { mid: T.cm, pan: T.cp, end: T.ce }; }
