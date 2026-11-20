// v95：林・田畑・草地のまとまりの境を、区画の格子の階段からなめらかな曲線にする（見た目だけ。sim の区画は変えない）
// - warp：区画を引く座標を、ゆるやかなノイズで少しずらす（境が区画の辺に沿わず、くねる）
// - field：区画ごとの「その種類なら 1」を、ずらした座標で双一次補間した値（0.5 の等高線が境。区画の中を部分的に塗る・木を間引く）
import { W, H } from '../sim/index';

const hsh = (a: number, b: number, k: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(k, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vn = (x: number, y: number, g: number, k: number) => { const X = x / g, Y = y / g, gx = Math.floor(X), gy = Math.floor(Y), fx = X - gx, fy = Y - gy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (hsh(gx, gy, k) * (1 - sx) + hsh(gx + 1, gy, k) * sx) * (1 - sy) + (hsh(gx, gy + 1, k) * (1 - sx) + hsh(gx + 1, gy + 1, k) * sx) * sy; };

/** 区画の座標（1 区画 = 1）をずらす。ずれは最大で約 0.6 区画（大きなうねり＋小さなむら） */
export function warp(u: number, v: number): [number, number] {
  const a = (vn(u, v, 2.6, 951) - 0.5) * 0.8 + (vn(u, v, 0.9, 953) - 0.5) * 0.45, b = (vn(u, v, 2.6, 952) - 0.5) * 0.8 + (vn(u, v, 0.9, 954) - 0.5) * 0.45;
  return [u + a, v + b];
}
/** ずらした座標の区画（地図の外は端の区画） */
export function warpTile(u: number, v: number): number {
  const [a, b] = warp(u, v), x = Math.max(0, Math.min(W - 1, Math.floor(a))), y = Math.max(0, Math.min(H - 1, Math.floor(b)));
  return y * W + x;
}
/** 区画の印 ind（0/1）を、ずらした座標で双一次補間した値（区画の中心で 1、境の外で 0 へなめらかに） */
export function field(ind: (i: number) => number, u: number, v: number): number {
  const [a, b] = warp(u, v), p = a - 0.5, q = b - 0.5, x0 = Math.floor(p), y0 = Math.floor(q), tx = p - x0, ty = q - y0;
  const at = (x: number, y: number) => ind(Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x)));
  return (at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx) * (1 - ty) + (at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx) * ty;
}
/** 多角形（区画の座標）を field ≥ 0.5 の側で切り抜く（四角の田を、境で曲線に沿って欠く） */
export function clipPoly(P: [number, number][], F: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length], fa = F[k], fb = F[(k + 1) % P.length];
    if (fa >= 0.5) out.push(a);
    if ((fa >= 0.5) !== (fb >= 0.5)) { const t = (0.5 - fa) / (fb - fa); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
  return out;
}
export { hsh as softHash };
