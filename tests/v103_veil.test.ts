// v103：区域の暗幕（まだ編入していない区域）の形。前（区画ごとに 3×3 の四角）と同じ所を覆い、高さは前の格子点で 15cm 以内、三角形はずっと少ない。
import { describe, it, expect } from 'vitest';
import { veilQuads } from '../src/render/veil';

const W = 60, H = 50, T = 30;
function terrain(seed: number) {
  // 角の高さ（双一次の補間、map.ts の heightAt と同じ）。平らな低地・ゆるい丘・急な山を混ぜる
  const h = new Float32Array((W + 1) * (H + 1)); let sd = seed; const r = () => ((sd = (sd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) h[y * (W + 1) + x] = x < 20 ? 0 : x < 45 ? (x - 20) * 0.35 + Math.sin(y * 0.3) * 0.6 + r() * 0.1 : 8 + r() * 9;
  const at = (X: number, Z: number) => { const fx = Math.max(0, Math.min(W - 1e-4, X / T)), fy = Math.max(0, Math.min(H - 1e-4, Z / T)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0, s = W + 1;
    return (h[y0 * s + x0] * (1 - u) + h[y0 * s + x0 + 1] * u) * (1 - v) + (h[(y0 + 1) * s + x0] * (1 - u) + h[(y0 + 1) * s + x0 + 1] * u) * v + 1.2; };
  return at;
}
describe('v103 区域の暗幕', () => {
  const hq = terrain(5), locked = (i: number) => (i % W) + ((i / W) | 0) * 0.5 > 12 && (i % 7) !== 3; // 斜めの境と、ところどころの穴（水面など）
  const q = veilQuads(W, H, T, locked, hq);
  const all: number[] = []; for (const l of q.values()) for (const v of l) all.push(v);
  const quads: number[][] = []; for (let k = 0; k < all.length; k += 8) quads.push(all.slice(k, k + 8));
  it('前と同じ所だけを、すき間も重なりもなく覆う', () => {
    const cover = new Float64Array(W * H);
    for (const [x0, z0, x1, z1] of quads) for (let y = Math.floor(z0 / T + 1e-9); y < Math.ceil(z1 / T - 1e-9); y++) for (let x = Math.floor(x0 / T); x < Math.ceil(x1 / T - 1e-9); x++) {
      const a = Math.max(x0, x * T), b = Math.min(x1, (x + 1) * T), c = Math.max(z0, y * T), d = Math.min(z1, (y + 1) * T); if (b > a && d > c) cover[y * W + x] += (b - a) * (d - c); }
    for (let i = 0; i < W * H; i++) expect(cover[i]).toBeCloseTo(locked(i) ? T * T : 0, 6);
  });
  it('高さは前の格子点（10m おき）で 15cm 以内（地形から 1.2m 上のまま）', () => {
    let worst = 0;
    for (const [x0, z0, x1, z1, hA, hB, hC, hD] of quads) for (let X = Math.ceil(x0 / 10 - 1e-9) * 10; X <= x1 + 1e-6; X += 10) for (let Z = Math.ceil(z0 / 10 - 1e-9) * 10; Z <= z1 + 1e-6; Z += 10) {
      const u = (X - x0) / (x1 - x0), w = (z1 - Z) / (z1 - z0), h = u >= w ? hA + (hB - hA) * u + (hC - hB) * w : hA + (hC - hD) * u + (hD - hA) * w;
      worst = Math.max(worst, Math.abs(h - hq(X, Z)));
    }
    expect(worst).toBeLessThanOrEqual(0.15 + 1e-9);
  });
  it('三角形は前（区画ごとに 18）より大きく減る。急な山は前と同じ細かさ', () => {
    let n = 0; for (let i = 0; i < W * H; i++) if (locked(i)) n++;
    const before = n * 18, after = quads.length * 2;
    expect(after).toBeLessThan(before * 0.4);
    // 急な山（x ≥ 45）は 3×3 のまま（四角の 1 辺が 10m）
    const mount = quads.filter(qq => qq[0] >= 45 * T); expect(mount.length).toBeGreaterThan(0); expect(mount.some(qq => qq[2] - qq[0] < 10.01)).toBe(true);
  });
  it('塊（32×32 区画）ごとに分かれ、塊をまたぐ四角は無い', () => {
    for (const [k, l] of q) for (let j = 0; j < l.length; j += 8) { const cx = Math.floor(l[j] / T / 32), cz = Math.floor(l[j + 1] / T / 32), ex = Math.floor((l[j + 2] / T - 1e-6) / 32); expect(cz * Math.ceil(W / 32) + cx).toBe(k); expect(ex).toBe(cx); }
  });
});
