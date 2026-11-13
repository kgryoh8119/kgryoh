// v86：走る車（タクシー・パトカー・救急車・消防車・箱車・ごみ収集車・スクーター・自転車）と電車の車体を、箱や棒を組み合わせて作る。
// 乗用車の形は cargen.ts の断面から作る仕組み。ここはその仕組みに合わない角ばった車や、乗る人つきの二輪車、電車の車体。
// 面の種類は車と同じ番号に、7 白・8 赤・9 青・10 黄・11 乗る人の服・12 肌・13 ナンバー（白）・14 ナンバー（軽の黄）・15 暗い鉄ホイール・16 灰色ホイールを足した（CAR_PART）。
import { build, makeCars, CAR_KINDS, SEDAN, VAN, type CarMesh } from './cargen';

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
  const B = (sp: Parameters<typeof build>[0]) => build(sp, N), K = makeCars(N);
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
  return { ...K, taxi, police, ambulance: amb, fire, box2t: box2, garbage: gar, scooter: sc, bicycle: bi };
}

/** 車の部位の色（面の種類 0〜16）。0 は車ごとの色 */
export const CAR_PART = [0xffffff, 0x151515, 0x3a3a3c, 0xfff6d8, 0xd02020, 0x26313a, 0x9aa0a6, 0xf4f4f2, 0xd8261c, 0x2a52c8, 0xffc21a, 0x2c2f38, 0xe0b090, 0xeeeeea, 0xf2d030, 0x4a4e54, 0x6c7076];
/** 日本の街の車の色（白・黒・銀・灰で 7 割強）。r は 0〜1。軽は明るい色が少し多い */
export function carColor(r: number, kei = false): number {
  const T: [number, number][] = kei ? [[0.2, 0xf4f4f2], [0.3, 0x2a2c30], [0.38, 0xc4c8cc], [0.45, 0x8a9096], [0.54, 0xa8d4e6], [0.62, 0xf2c8d4], [0.7, 0xd8e8b8], [0.76, 0x2c3e5c], [0.82, 0xd8d0b8], [0.88, 0xc0302a], [0.94, 0xe8b830], [1, 0x3a7a5a]]
    : [[0.28, 0xf4f4f2], [0.48, 0x24262a], [0.61, 0xc4c8cc], [0.73, 0x777c82], [0.8, 0x2a3a58], [0.85, 0xb02e2a], [0.89, 0xd8d0b8], [0.92, 0x2f4a3a], [0.94, 0x6a4a36], [0.96, 0xe08a2a], [0.98, 0x8fb3c9], [1, 0xe8c840]];
  for (const [p, c] of T) if (r < p) return c; return 0xf4f4f2;
}

// ---- 電車の車体（通勤形）。前は Blender の 1 形（718 面・全車同じ）。ここでは帯の色だけ編成ごとに変え、窓・ドア・屋根の機器・台車・先頭車の前面窓・パンタグラフ車を作る
/** 面の種類：0 帯の色（編成ごと）1 窓 2 銀（屋根・ドア）3 床下の暗い面 4 台車の灰 5 黒 6 暗い灰 7 車体（ステンレス・白） */
export const TRAIN_PART = [0xffffff, 0x26313a, 0xc9cdd2, 0x2a2a2c, 0x9aa0a6, 0x16181c, 0x3a3a3c, 0xe8ebee];
/** 中間車・パンタグラフ車・先頭車（前が +y）。長さ 19.04m・幅 2.9m・高さ 4.1m（Blender 版と同じ寸法） */
export function makeTrain(N = 10): { mid: CarMesh; pan: CarMesh; end: CarMesh } {
  const one = (kind: 0 | 1 | 2): CarMesh => {
    const M = mesh(), HW = 1.45, y1 = kind === 2 ? 8.4 : 9.52, ye = 9.52;
    box(M, -HW, HW, -9.52, y1, 1.0, 3.7, 7); // 側面の壁
    frus(M, [-HW, HW, -9.52, y1], 3.7, [-1.05, 1.05, -9.52, y1], 4.08, 2); // 屋根
    if (kind === 2) { // 先頭の前面：下が広く上が少し引っ込む。窓 2 枚（真ん中に柱）、帯、暗い下部、連結器
      frus(M, [-HW, HW, 8.4, ye], 1.0, [-1.3, 1.3, 8.4, ye - 0.3], 3.7, 7); frus(M, [-1.3, 1.3, 8.4, ye - 0.3], 3.7, [-1.05, 1.05, 8.4, ye - 0.35], 4.08, 2);
      const yAt = (z: number) => ye - 0.3 * (z - 1.0) / 2.7 + 0.012, xAt = (z: number) => HW - 0.15 * (z - 1.0) / 2.7;
      for (const [a, b] of [[-0.92, -0.05], [0.05, 0.92]]) quadV(M, [[a * xAt(2.9), yAt(2.3), 2.3], [b * xAt(2.9), yAt(2.3), 2.3], [b * xAt(3.5), yAt(3.55), 3.55], [a * xAt(3.5), yAt(3.55), 3.55]], 1, [0, 1, 0.3]);
      quadV(M, [[-xAt(1.9), yAt(1.5), 1.5], [xAt(1.9), yAt(1.5), 1.5], [xAt(1.9), yAt(1.9), 1.9], [-xAt(1.9), yAt(1.9), 1.9]], 0, [0, 1, 0.3]); quadV(M, [[-xAt(1.4), yAt(1.02), 1.02], [xAt(1.4), yAt(1.02), 1.02], [xAt(1.4), yAt(1.4), 1.4], [-xAt(1.4), yAt(1.4), 1.4]], 3, [0, 1, 0.3]);
      box(M, -0.22, 0.22, ye - 0.05, ye + 0.3, 0.7, 1.0, 5);
    }
    for (const sx of [-1, 1]) {
      const xw = HW + 0.012; side(M, sx, -9.52, y1, 1.55, 1.8, 0, xw); side(M, sx, -9.52, y1, 3.45, 3.58, 0, xw); // 帯 2 本
      for (const yc of [-6.9, -2.3, 2.3, 6.9]) { side(M, sx, yc - 0.75, yc + 0.75, 1.05, 3.6, 2, HW + 0.024); for (const o of [-0.38, 0.38]) side(M, sx, yc + o - 0.27, yc + o + 0.27, 2.2, 3.3, 1, HW + 0.034); } // ドア（窓つき）
      for (const [a, b] of [[-9.2, -7.8], [-6.1, -3.1], [-1.5, 1.5], [3.1, 6.1], [7.8, kind === 2 ? 8.2 : 9.2]]) { const n = Math.max(1, Math.round((b - a) / 1.5)), w = (b - a - 0.15 * (n - 1)) / n; for (let k = 0; k < n; k++) side(M, sx, a + k * (w + 0.15), a + k * (w + 0.15) + w, 2.15, 3.3, 1, xw + 0.004); } // 窓
      box(M, sx * 0.5 - 0.5, sx * 0.5 + 0.5, -4.5, 4.5, 0.62, 1.0, 3); // 床下の機器
    }
    box(M, -1.3, 1.3, -9.52, y1, 0.95, 1.0, 3);
    for (const yb of [-6.6, 6.6]) { box(M, -1.0, 1.0, yb - 1.35, yb + 1.35, 0.4, 0.78, 4); for (const yw of [yb - 0.95, yb + 0.95]) for (const sx of [-1, 1]) wheel(M, sx * 0.57, yw, 0.43, 0.14, N, sx, 4); } // 台車と車輪（v87：軌間 1,067mm のレールに載る位置。車輪径 860mm）
    if (kind === 1) { // パンタグラフ（碍子・2 本の腕・すり板）とクーラー
      for (const sx of [-1, 1]) box(M, sx * 0.55 - 0.08, sx * 0.55 + 0.08, -2.35, -1.65, 4.08, 4.28, 4);
      limb(M, [-0.5, -2.0, 4.28], [-0.1, -1.5, 4.95], 0.05, 5); limb(M, [0.5, -2.0, 4.28], [0.1, -1.5, 4.95], 0.05, 5); limb(M, [-0.1, -1.5, 4.95], [-0.1, -2.0, 5.3], 0.04, 5); limb(M, [0.1, -1.5, 4.95], [0.1, -2.0, 5.3], 0.04, 5);
      box(M, -0.95, 0.95, -2.12, -1.88, 5.28, 5.34, 5); for (const y of [-6.0, 4.8]) box(M, -0.7, 0.7, y - 1.2, y + 1.2, 4.08, 4.46, 2);
    } else for (const y of [-5.2, 5.0]) box(M, -0.7, 0.7, y - 1.3, y + 1.3, 4.08, 4.5, 2); // 屋根のクーラー
    return M;
  };
  return { mid: one(0), pan: one(1), end: one(2) };
}
