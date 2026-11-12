// 木の形を作る（v79）。前は Blender の低ポリの木（葉が 80〜130 面のかたまり）で、形が粗く見えていた。
// 広葉樹は、表面をゆらした丸いかたまり（細分した 20 面体、80 面）を 4〜7 個重ねて樹冠にし、ほかのかたまりに埋もれた面は捨てる。
// 下を向いた面は暗く、上は明るく（葉の陰）。幹は根元を太く、枝を 3 本。針葉樹は、すそがぎざぎざの傘を 5 段。
// 形式は trees.json と同じ：V=頂点（x, 奥行き y, 高さ z）、F=[a, b, c, 葉なら 1, 明るさ]。面は外から見て反時計回り
export type TreeMesh = { V: number[][]; F: number[][] };
const hs = (a: number, b: number) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };

/** 1 回細分した 20 面体（42 頂点・80 面、半径 1） */
function ico(): { v: number[][]; f: number[][] } {
  const t = (1 + Math.sqrt(5)) / 2, v: number[][] = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(p => { const l = Math.hypot(p[0], p[1], p[2]); return p.map(c => c / l); });
  const f0 = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  const mid = new Map<string, number>(), m = (a: number, b: number) => { const k = a < b ? a + ',' + b : b + ',' + a; let i = mid.get(k); if (i === undefined) { const p = [0, 1, 2].map(c => v[a][c] + v[b][c]), l = Math.hypot(p[0], p[1], p[2]); i = v.length; v.push(p.map(c => c / l)); mid.set(k, i); } return i; };
  const f: number[][] = []; for (const [a, b, c] of f0) { const ab = m(a, b), bc = m(b, c), ca = m(c, a); f.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
  return { v, f };
}
const ICO = ico();

type Blob = [number, number, number, number, number, number]; // 中心 x, y, z（高さ）と半径 rx, ry, rz
function canopy(M: TreeMesh, blobs: Blob[], seed: number): void {
  blobs.forEach((b, bi) => {
    const base = M.V.length;
    ICO.v.forEach((p, vi) => { const k = 0.86 + 0.28 * hs(vi + seed * 7.3, bi * 3.1 + 1); M.V.push([b[0] + p[0] * b[3] * k, b[1] + p[1] * b[4] * k, b[2] + p[2] * b[5] * k]); });
    for (const [a, c, d] of ICO.f) {
      const P = [a, c, d].map(i => M.V[base + i]), cx = (P[0][0] + P[1][0] + P[2][0]) / 3, cy = (P[0][1] + P[1][1] + P[2][1]) / 3, cz = (P[0][2] + P[1][2] + P[2][2]) / 3;
      if (blobs.some((o, oi) => oi !== bi && ((cx - o[0]) / (o[3] * 0.7)) ** 2 + ((cy - o[1]) / (o[4] * 0.7)) ** 2 + ((cz - o[2]) / (o[5] * 0.7)) ** 2 < 1)) continue; // ほかのかたまりの中
      // 外向きの順にそろえる
      const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vy = P[2][1] - P[0][1], vz = P[2][2] - P[0][2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, out = nx * (cx - b[0]) + ny * (cy - b[1]) + nz * (cz - b[2]) >= 0, nl = Math.hypot(nx, ny, nz) || 1;
      const up = (out ? nz : -nz) / nl, low = Math.max(0, Math.min(1, (cz - 2.5) / 4)); // 上向きほど明るく、樹冠の下のほうは暗く
      const sh = Math.round((0.66 + 0.12 * (up * 0.5 + 0.5) + 0.16 * low + 0.02 * hs(cx * 3.1 + seed, cy * 2.7 + cz)) * 100) / 100; // 面ごとの差は小さく（大きいとカクカクして見える）
      M.F.push(out ? [base + a, base + c, base + d, 1, sh] : [base + a, base + d, base + c, 1, sh]);
    }
  });
}
/** 先細りの角柱（幹・枝）。p0 → p1、半径 r0 → r1 */
function limb(M: TreeMesh, p0: number[], p1: number[], r0: number, r1: number, seg: number, sh: number): void {
  const d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], L = Math.hypot(d[0], d[1], d[2]) || 1, w = d.map(c => c / L);
  const ref = Math.abs(w[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0], u = [w[1] * ref[2] - w[2] * ref[1], w[2] * ref[0] - w[0] * ref[2], w[0] * ref[1] - w[1] * ref[0]], ul = Math.hypot(u[0], u[1], u[2]), U = u.map(c => c / ul), V = [w[1] * U[2] - w[2] * U[1], w[2] * U[0] - w[0] * U[2], w[0] * U[1] - w[1] * U[0]];
  const base = M.V.length;
  for (const [p, r] of [[p0, r0], [p1, r1]] as [number[], number][]) for (let i = 0; i < seg; i++) { const a = (i / seg) * Math.PI * 2, c = Math.cos(a) * r, s = Math.sin(a) * r; M.V.push([p[0] + U[0] * c + V[0] * s, p[1] + U[1] * c + V[1] * s, p[2] + U[2] * c + V[2] * s]); }
  for (let i = 0; i < seg; i++) { const j = (i + 1) % seg, s2 = Math.round(sh * (0.82 + 0.3 * (i / seg < 0.5 ? i / seg : 1 - i / seg)) * 100) / 100; M.F.push([base + i, base + j, base + seg + j, 0, s2], [base + i, base + seg + j, base + seg + i, 0, s2]); }
}
function broadleaf(blobs: Blob[], trunkH: number, trunkR: number, branches: number[][], seed: number): TreeMesh {
  const M: TreeMesh = { V: [], F: [] };
  limb(M, [0, 0, 0], [0, 0, trunkH * 0.3], trunkR * 1.45, trunkR, 7, 0.8);   // 根元は太く
  limb(M, [0, 0, trunkH * 0.3], [0.08, -0.05, trunkH], trunkR, trunkR * 0.62, 7, 0.8);
  for (const [bx, by, bz] of branches) limb(M, [0, 0, trunkH * 0.72], [bx, by, bz], trunkR * 0.5, trunkR * 0.18, 4, 0.72);
  canopy(M, blobs, seed);
  return M;
}
function conifer(): TreeMesh {
  const M: TreeMesh = { V: [], F: [] }, N = 10, T = 5;
  limb(M, [0, 0, 0], [0, 0, 2.0], 0.26, 0.2, 6, 0.8);
  for (let k = 0; k < T; k++) {
    const z0 = 1.0 + k * 1.12, rb = 2.15 * (1 - k / (T + 0.9)), z1 = z0 + 2.0 - k * 0.08, rt = k === T - 1 ? 0.02 : rb * 0.3, base = M.V.length;
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + k * 0.4, r = rb * (i % 2 ? 0.84 : 1.06), dz = i % 2 ? 0.22 : -0.1; M.V.push([Math.cos(a) * r, Math.sin(a) * r, z0 + dz]); }   // すそ（ぎざぎざ、枝先は少し垂れる）
    for (let i = 0; i < N; i++) { const a = (i / N) * Math.PI * 2 + k * 0.4; M.V.push([Math.cos(a) * rt, Math.sin(a) * rt, z1]); }
    const c = M.V.length; M.V.push([0, 0, z0 + 0.55]);                                                                                                                               // 傘の下の中心
    for (let i = 0; i < N; i++) { const j = (i + 1) % N, sh = Math.round((0.84 + 0.16 * hs(i + k * 5.1, 3.3) + 0.03 * k) * 100) / 100;
      M.F.push([base + i, base + j, base + N + j, 1, sh], [base + i, base + N + j, base + N + i, 1, sh], [base + j, base + i, c, 1, 0.58]); }
  }
  return M;
}
/** 木の形の一式（広葉樹 3 種・桜・針葉樹）。松は Blender の形をそのまま使う */
export function growTrees(): Record<string, TreeMesh> {
  return {
    round: broadleaf([[0, 0, 5.0, 2.3, 2.3, 2.0], [1.5, 0.3, 4.3, 1.6, 1.6, 1.4], [-1.4, 0.6, 4.4, 1.6, 1.5, 1.4], [0.2, -1.5, 4.3, 1.6, 1.6, 1.3], [-0.3, 1.4, 4.6, 1.5, 1.5, 1.3], [0.3, 0, 6.2, 1.6, 1.6, 1.3]], 3.9, 0.3, [[1.2, 0.3, 4.3], [-1.1, 0.5, 4.3], [0.1, -1.2, 4.2]], 1),
    vase: broadleaf([[0, 0, 5.6, 2.6, 2.4, 1.7], [2.0, 0.4, 5.2, 1.7, 1.6, 1.3], [-1.9, -0.5, 5.3, 1.8, 1.6, 1.3], [0.4, 1.9, 5.1, 1.6, 1.7, 1.2], [-0.3, -1.9, 5.0, 1.6, 1.6, 1.2], [0.2, 0.2, 6.6, 1.9, 1.8, 1.1]], 4.3, 0.3, [[1.7, 0.3, 5.0], [-1.6, -0.4, 5.1], [0.3, 1.6, 4.9], [-0.2, -1.6, 4.8]], 2),
    oval: broadleaf([[0, 0, 4.6, 1.35, 1.35, 2.6], [0.3, 0.2, 6.4, 1.05, 1.05, 1.5], [-0.4, -0.2, 3.3, 1.15, 1.15, 1.3], [0.5, -0.4, 4.6, 1.0, 1.0, 1.4]], 3.0, 0.22, [], 3),
    sakura: broadleaf([[0, 0, 4.6, 2.6, 2.5, 1.5], [2.2, 0.5, 4.2, 1.7, 1.6, 1.15], [-2.2, -0.3, 4.3, 1.8, 1.6, 1.15], [0.5, 2.1, 4.2, 1.6, 1.7, 1.1], [-0.4, -2.1, 4.1, 1.7, 1.7, 1.1], [0.9, -0.6, 5.4, 1.7, 1.6, 1.0], [-1.0, 0.7, 5.3, 1.5, 1.5, 1.0]], 3.2, 0.34, [[1.9, 0.4, 4.0], [-1.9, -0.2, 4.1], [0.4, 1.8, 4.0], [-0.3, -1.8, 3.9]], 4),
    conifer: conifer(),
  };
}
