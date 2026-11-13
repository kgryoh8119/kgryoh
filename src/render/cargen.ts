// 車の形を作る（v80）。前は Blender の低ポリの車（車体 110 面）で、くさび形の箱に見えていた。
// 断面（屋根・窓の下端・側面・すそ）を前後に並べてつなぐ作りにして、ボンネット・フロントガラス・屋根・トランクの流れ、
// 上すぼまりの客室、窓の柱、タイヤ（14 角）とホイール、タイヤハウス、前照灯・尾灯・グリル・ドアミラーをつける。
// 形式は cars.json と同じ：V=頂点（x 横, y 前, z 高さ）、F=[a, b, c, 種類]。種類 0 車体 1 タイヤ 2 樹脂 3 前照灯 4 尾灯 5 窓 6 ホイール
export type CarMesh = { V: number[][]; F: number[][] };
type Sec = { y: number; w: number; zb: number; zt: number; wt: number }; // 位置、車体の半幅、窓の下端の高さ、屋根（ボンネット）の高さ、屋根の半幅
export type Spec = { secs: Sec[]; side: [number, number]; front: [number, number]; rear?: [number, number]; pillars: number[]; wheelY: [number, number]; wheelX: number; wheelR: number; hatch?: boolean; floor?: number; norw?: boolean; kei?: boolean; wt?: number };

export function build(sp: Spec, N = 14): CarMesh {
  const M: CarMesh = { V: [], F: [] };
  const add = (p: number[]) => M.V.push(p) - 1;
  /** 外向き（out のほう）になる順で三角を足す */
  const tri = (a: number, b: number, c: number, t: number, out: number[]) => { const A = M.V[a], B = M.V[b], C = M.V[c], ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx]; M.F.push(n[0] * out[0] + n[1] * out[1] + n[2] * out[2] >= 0 ? [a, b, c, t] : [a, c, b, t]); };
  const quad = (a: number, b: number, c: number, d: number, t: number, out: number[]) => { tri(a, b, c, t, out); tri(a, c, d, t, out); };
  // 断面を足す：窓の柱の前後にも断面を入れる（柱の所だけ車体の色にする）
  const at = (y: number): Sec => { const S = sp.secs; for (let i = 0; i + 1 < S.length; i++) if (y >= S[i].y && y <= S[i + 1].y) { const a = S[i], b = S[i + 1], t = (y - a.y) / (b.y - a.y), L = (p: number, q: number) => p + (q - p) * t; return { y, w: L(a.w, b.w), zb: L(a.zb, b.zb), zt: L(a.zt, b.zt), wt: L(a.wt, b.wt) }; } return { ...S[S.length - 1], y }; };
  const fl = sp.floor ?? 0.2; // 床（すそ）の高さ
  const secs = [...sp.secs]; for (const py of sp.pillars) secs.push(at(py - 0.055), at(py + 0.055)); secs.sort((a, b) => a.y - b.y);
  const ring = secs.map(s => { const half = [[0, s.zt], [s.wt, s.zt - 0.025], [s.w, s.zb], [s.w + 0.015, Math.min(s.zb - 0.05, fl + 0.3)], [s.w - 0.05, fl]]; // 屋根の中心 → 屋根の端 → 窓の下端 → 側面 → すそ
    return [4, 3, 2, 1, 0, -1, -2, -3, -4].map(k => add([k > 0 ? -half[k][0] : half[-k][0], s.y, half[Math.abs(k)][1]])); });
  const inR = (y: number, r?: [number, number]) => !!r && y > r[0] && y < r[1];
  for (let i = 0; i + 1 < secs.length; i++) { const ym = (secs[i].y + secs[i + 1].y) / 2, pillar = sp.pillars.some(p => Math.abs(ym - p) < 0.05);
    for (let k = 0; k < 8; k++) { const top = k === 3 || k === 4, glassSide = k === 2 || k === 5, low = k === 0 || k === 7;
      const t = top ? (inR(ym, sp.front) || inR(ym, sp.rear) ? 5 : 0) : glassSide ? (inR(ym, sp.side) && !pillar ? 5 : 0) : low ? 2 : 0;
      const a = ring[i][k], b = ring[i][k + 1], c = ring[i + 1][k + 1], d = ring[i + 1][k], mx = (M.V[a][0] + M.V[c][0]) / 2, mz = (M.V[a][2] + M.V[c][2]) / 2;
      quad(a, b, c, d, t, [mx, 0, mz - 0.55]); } }
  // 前後のふた（バンパーの面）
  for (const [i, dir] of [[0, -1], [secs.length - 1, 1]] as const) { const s = secs[i], c = add([0, s.y, (s.zt + fl) / 2]); for (let k = 0; k < 8; k++) tri(c, ring[i][k], ring[i][k + 1], k === 0 || k === 7 ? 2 : 0, [0, dir, 0]); const u = add([-(s.w - 0.05), s.y, fl]), v = add([s.w - 0.05, s.y, fl]); tri(c, u, v, 2, [0, dir, 0]); }
  // 灯り・グリル・後ろの窓（面のすぐ外に薄い板）
  const plate = (x0: number, x1: number, y: number, z0: number, z1: number, t: number, dir: number) => quad(add([x0, y, z0]), add([x1, y, z0]), add([x1, y, z1]), add([x0, y, z1]), t, [0, dir, 0]);
  const F = secs[secs.length - 1], R = secs[0];
  for (const sx of [-1, 1]) { plate(sx * F.w * 0.42, sx * F.w * 0.94, F.y + 0.012, F.zt - 0.17, F.zt - 0.03, 3, 1); plate(sx * R.w * 0.5, sx * R.w * 0.96, R.y - 0.012, R.zt - (sp.hatch ? 0.95 : 0.16), R.zt - (sp.hatch ? 0.7 : 0.02), 4, -1); }
  plate(-F.w * 0.36, F.w * 0.36, F.y + 0.012, fl + 0.1, F.zt - 0.06, 2, 1);                                              // グリル
  plate(-0.26, 0.26, F.y + 0.016, fl + 0.13, fl + 0.25, sp.kei ? 14 : 13, 1); plate(-0.26, 0.26, R.y - 0.016, fl + 0.16, fl + 0.28, sp.kei ? 14 : 13, -1);   // ナンバー（v86：白、軽は黄）
  if (sp.hatch && !sp.norw) plate(-R.wt * 0.92, R.wt * 0.92, R.y - 0.012, R.zb + 0.08, R.zt - 0.12, 5, -1);                      // 後ろの窓
  // ドアミラー
  { const s = at(sp.front[1] - 0.12); for (const sx of [-1, 1]) { const x0 = sx * (s.w + 0.02), x1 = sx * (s.w + 0.17), y0 = s.y - 0.07, y1 = s.y + 0.05, z0 = s.zb + 0.02, z1 = s.zb + 0.14;
      const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]].map(add), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, cz = (z0 + z1) / 2;
      for (const [a, b, c, d] of [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 3, 7, 4]]) { const m = [0, 1, 2].map(q => (M.V[p[a]][q] + M.V[p[c]][q]) / 2); quad(p[a], p[b], p[c], p[d], 0, [m[0] - cx, m[1] - cy, m[2] - cz]); } } }
  // タイヤ（14 角）・ホイール・タイヤハウス
  const r = sp.wheelR, tw = 0.21;
  for (const wy of sp.wheelY) for (const sx of [-1, 1]) { const xo = sx * (sp.wheelX + 0.03), xi = sx * (sp.wheelX + 0.03 - tw), ro: number[] = [], ri: number[] = [], rh: number[] = [], ra: number[] = [];
    for (let k = 0; k < N; k++) { const a = (k / N) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); ro.push(add([xo, wy + c * r, r + s * r])); ri.push(add([xi, wy + c * r, r + s * r])); rh.push(add([xo + sx * 0.012, wy + c * r * 0.62, r + s * r * 0.62]));
      ra.push(add([sx * (sp.wheelX + 0.006), wy + c * (r + 0.075), Math.max(fl, r + s * (r + 0.075))])); }
    const hub = add([xo + sx * 0.03, wy, r]), hc = add([sx * (sp.wheelX + 0.006), wy, r]);
    for (let k = 0; k < N; k++) { const j = (k + 1) % N, a = ((k + 0.5) / N) * Math.PI * 2;
      quad(ro[k], ro[j], ri[j], ri[k], 1, [0, Math.cos(a), Math.sin(a)]);      // 接地面
      quad(ro[k], ro[j], rh[j], rh[k], 1, [sx, 0, 0]);                           // タイヤの側面
      tri(hub, rh[k], rh[j], sp.wt ?? 6, [sx, 0, 0]);                           // ホイール
      tri(hc, ra[k], ra[j], 2, [sx, 0, 0]); }                                    // タイヤハウス（暗い面）
  }
  for (const v of M.V) for (let q = 0; q < 3; q++) v[q] = Math.round(v[q] * 1000) / 1000;
  return M;
}
/** 車の種類（v81 で 3 → 8 種類、v86 で商用バンを足して 9 種類）。駐車場の車（models.ts の car）と走る車の乗用車はここから選ぶ */
export const CAR_KINDS = ['sedan', 'kei', 'minivan', 'hatch', 'suv', 'wagon', 'sports', 'keitruck', 'van'] as const;
export type CarKind = typeof CAR_KINDS[number];
export const SEDAN: Spec = { secs: [{ y: -2.2, w: 0.7, zb: 0.6, zt: 0.64, wt: 0.6 }, { y: -2.04, w: 0.84, zb: 0.8, zt: 0.86, wt: 0.7 }, { y: -1.35, w: 0.85, zb: 0.84, zt: 0.9, wt: 0.69 }, { y: -0.75, w: 0.85, zb: 0.86, zt: 1.4, wt: 0.58 }, { y: 0.25, w: 0.85, zb: 0.86, zt: 1.42, wt: 0.6 }, { y: 0.98, w: 0.85, zb: 0.84, zt: 0.89, wt: 0.71 }, { y: 1.92, w: 0.83, zb: 0.7, zt: 0.73, wt: 0.67 }, { y: 2.2, w: 0.68, zb: 0.52, zt: 0.56, wt: 0.56 }],
      side: [-1.35, 0.98], front: [0.25, 0.98], rear: [-1.35, -0.75], pillars: [-0.28], wheelY: [-1.36, 1.36], wheelX: 0.86, wheelR: 0.31 };
// 商用バン：全高 1.95m・長さ 4.8m。窓は運転席と助手席だけ
export const VAN: Spec = { secs: [{ y: -2.4, w: 0.8, zb: 1.0, zt: 1.85, wt: 0.72 }, { y: -2.26, w: 0.88, zb: 1.0, zt: 1.96, wt: 0.78 }, { y: 0.9, w: 0.88, zb: 1.0, zt: 1.98, wt: 0.78 }, { y: 1.75, w: 0.88, zb: 1.0, zt: 1.1, wt: 0.82 }, { y: 2.2, w: 0.86, zb: 0.82, zt: 0.86, wt: 0.74 }, { y: 2.4, w: 0.72, zb: 0.54, zt: 0.58, wt: 0.6 }],
  side: [0.1, 1.75], front: [0.9, 1.75], pillars: [0.02], wheelY: [-1.5, 1.52], wheelX: 0.89, wheelR: 0.31, hatch: true, norw: true, wt: 15 };
/** 車の形の一式：セダン・軽・ミニバン・コンパクト・SUV・ワゴン・スポーツカー・軽トラック */
export function makeCars(N = 14): Record<CarKind, CarMesh> {
  const B = (sp: Spec) => build(sp, N); // N：タイヤの角数（品質で 8 / 10 / 14）
  return {
    sedan: B(SEDAN),
    minivan: B({ secs: [{ y: -2.34, w: 0.8, zb: 0.9, zt: 1.64, wt: 0.66 }, { y: -2.2, w: 0.87, zb: 0.92, zt: 1.77, wt: 0.7 }, { y: 0.75, w: 0.88, zb: 0.92, zt: 1.79, wt: 0.7 }, { y: 1.62, w: 0.88, zb: 0.96, zt: 1.02, wt: 0.75 }, { y: 2.16, w: 0.86, zb: 0.8, zt: 0.83, wt: 0.7 }, { y: 2.36, w: 0.72, zb: 0.54, zt: 0.58, wt: 0.58 }],
      side: [-2.2, 1.62], front: [0.75, 1.62], pillars: [-1.15, 0.15], wheelY: [-1.55, 1.58], wheelX: 0.89, wheelR: 0.33, hatch: true, wt: 16 }),
    kei: B({ secs: [{ y: -1.71, w: 0.67, zb: 0.86, zt: 1.56, wt: 0.55 }, { y: -1.6, w: 0.73, zb: 0.88, zt: 1.68, wt: 0.6 }, { y: 0.55, w: 0.73, zb: 0.88, zt: 1.7, wt: 0.6 }, { y: 1.16, w: 0.73, zb: 0.9, zt: 0.96, wt: 0.63 }, { y: 1.56, w: 0.72, zb: 0.78, zt: 0.81, wt: 0.6 }, { y: 1.71, w: 0.62, zb: 0.52, zt: 0.56, wt: 0.5 }],
      side: [-1.6, 1.16], front: [0.55, 1.16], pillars: [-0.92, 0.02], wheelY: [-1.16, 1.18], wheelX: 0.74, wheelR: 0.28, hatch: true, kei: true }),
    // コンパクト（5 ドアのハッチバック）
    hatch: B({ secs: [{ y: -1.95, w: 0.7, zb: 0.84, zt: 1.3, wt: 0.56 }, { y: -1.8, w: 0.82, zb: 0.86, zt: 1.46, wt: 0.6 }, { y: 0.3, w: 0.83, zb: 0.86, zt: 1.5, wt: 0.62 }, { y: 1.05, w: 0.83, zb: 0.86, zt: 0.92, wt: 0.7 }, { y: 1.75, w: 0.81, zb: 0.72, zt: 0.75, wt: 0.66 }, { y: 1.95, w: 0.68, zb: 0.52, zt: 0.56, wt: 0.56 }],
      side: [-1.8, 1.05], front: [0.3, 1.05], pillars: [-0.95, 0.0], wheelY: [-1.25, 1.25], wheelX: 0.84, wheelR: 0.3, hatch: true }),
    // SUV（車高が高く、タイヤが大きい）
    suv: B({ secs: [{ y: -2.3, w: 0.78, zb: 1.0, zt: 1.55, wt: 0.64 }, { y: -2.15, w: 0.9, zb: 1.02, zt: 1.7, wt: 0.7 }, { y: 0.35, w: 0.91, zb: 1.02, zt: 1.72, wt: 0.72 }, { y: 1.2, w: 0.91, zb: 1.02, zt: 1.1, wt: 0.78 }, { y: 2.05, w: 0.9, zb: 0.92, zt: 0.96, wt: 0.76 }, { y: 2.3, w: 0.78, zb: 0.62, zt: 0.68, wt: 0.62 }],
      side: [-2.15, 1.2], front: [0.35, 1.2], pillars: [-1.2, -0.05], wheelY: [-1.45, 1.45], wheelX: 0.92, wheelR: 0.38, hatch: true, floor: 0.34, wt: 15 }),
    // ステーションワゴン（低く長い屋根）
    wagon: B({ secs: [{ y: -2.3, w: 0.72, zb: 0.82, zt: 1.3, wt: 0.58 }, { y: -2.12, w: 0.85, zb: 0.84, zt: 1.44, wt: 0.62 }, { y: 0.25, w: 0.85, zb: 0.86, zt: 1.46, wt: 0.62 }, { y: 1.0, w: 0.85, zb: 0.84, zt: 0.89, wt: 0.71 }, { y: 1.95, w: 0.83, zb: 0.7, zt: 0.73, wt: 0.67 }, { y: 2.25, w: 0.68, zb: 0.52, zt: 0.56, wt: 0.56 }],
      side: [-2.12, 1.0], front: [0.25, 1.0], pillars: [-1.25, -0.28], wheelY: [-1.4, 1.38], wheelX: 0.86, wheelR: 0.31, hatch: true }),
    // スポーツカー（低く幅広い 2 ドア）
    sports: B({ secs: [{ y: -2.15, w: 0.74, zb: 0.6, zt: 0.66, wt: 0.62 }, { y: -1.95, w: 0.9, zb: 0.78, zt: 0.84, wt: 0.74 }, { y: -1.2, w: 0.91, zb: 0.8, zt: 0.9, wt: 0.7 }, { y: -0.45, w: 0.91, zb: 0.8, zt: 1.24, wt: 0.56 }, { y: 0.2, w: 0.91, zb: 0.8, zt: 1.26, wt: 0.58 }, { y: 1.0, w: 0.9, zb: 0.76, zt: 0.8, wt: 0.72 }, { y: 1.95, w: 0.88, zb: 0.6, zt: 0.63, wt: 0.68 }, { y: 2.15, w: 0.72, zb: 0.44, zt: 0.48, wt: 0.58 }],
      side: [-1.2, 1.0], front: [0.2, 1.0], rear: [-1.2, -0.45], pillars: [], wheelY: [-1.33, 1.33], wheelX: 0.91, wheelR: 0.33, floor: 0.16 }),
    // 軽トラック（前に箱形の運転台、後ろは平らな荷台）
    keitruck: B({ secs: [{ y: -1.7, w: 0.7, zb: 0.78, zt: 0.8, wt: 0.68 }, { y: 0.42, w: 0.7, zb: 0.78, zt: 0.8, wt: 0.68 }, { y: 0.5, w: 0.72, zb: 0.9, zt: 1.74, wt: 0.6 }, { y: 1.25, w: 0.72, zb: 0.9, zt: 1.76, wt: 0.6 }, { y: 1.62, w: 0.72, zb: 0.88, zt: 0.98, wt: 0.62 }, { y: 1.71, w: 0.66, zb: 0.52, zt: 0.58, wt: 0.56 }],
      side: [0.5, 1.62], front: [1.25, 1.62], pillars: [], wheelY: [-1.12, 1.2], wheelX: 0.71, wheelR: 0.27, floor: 0.3, kei: true, wt: 15 }),
    // 商用バン（ハイエース型のワンボックス。後ろに窓がなく、荷室の側面も板）
    van: B(VAN),
  };
}
