// v94：水辺の岸をなめらかな曲線で描く。
// 計算（sim）の陸と水は 30m の区画ごとのまま。描画では、区画の中心に置いた「水なら 1、陸なら 0」を
// Catmull-Rom（中心を通るなめらかな補間）でつなぎ、少しのむらを足した値 f の 0.5 の等高線を岸にする。
// - 水面：区画を細かく（1 区画を 3×3）分け、f ≥ 0.5 の所だけを切り抜いて描く（区画の角に沿わない）
// - 地面：水の区画の中は、f に合わせて岸の外側を水面より少し上に、内側を水面より下にそろえる（陸の区画の地面は変えない。
//   水の区画と接する頂点だけは、水面より低ければ水面の高さまで上げる）
// 水面の高さは、まわりの水の区画の高さをなめらかに補間する（川は上流から下流へなめらかに下がる）
import { W, H, TILE, extWater, terrainOf, REAL, type MapDef } from '../sim/index';
import type { Geo } from './geo';

export interface Shore { wf: Uint8Array; lv: Float32Array; emit: Uint8Array; f: (px: number, pz: number) => number; level: (px: number, pz: number) => number; adjust: (px: number, pz: number, y: number) => number }
const hsh = (a: number, b: number, k: number) => { let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(k, 2147483647)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const vn = (x: number, y: number, g: number, k: number) => { const X = x / g, Y = y / g, gx = Math.floor(X), gy = Math.floor(Y), fx = X - gx, fy = Y - gy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return (hsh(gx, gy, k) * (1 - sx) + hsh(gx + 1, gy, k) * sx) * (1 - sy) + (hsh(gx, gy + 1, k) * (1 - sx) + hsh(gx + 1, gy + 1, k) * sx) * sy; };
const cr = (t: number, o: number[]) => { const t2 = t * t, t3 = t2 * t; o[0] = (-t3 + 2 * t2 - t) / 2; o[1] = (3 * t3 - 5 * t2 + 2) / 2; o[2] = (-3 * t3 + 4 * t2 + t) / 2; o[3] = (t3 - t2) / 2; };

/** 岸を曲線で描く水の区画を決める。実在の街と無人島（v88 から自然の海岸）は null */
export function makeShore(m: MapDef): Shore | null {
  if (REAL) return null;
  const tId = terrainOf(m.seed).id; if (tId === 'castaway') return null;
  const N = W * H, wf = new Uint8Array(N), lv = new Float32Array(N).fill(NaN), emit = new Uint8Array(N), v3 = !!m.surf;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!m.water[i] || m.dug?.[i] || m.wet?.[i] || (m.base && !m.base.water[i])) continue;
    if (v3) { const s = m.surf![i]; if (!Number.isFinite(s)) continue; wf[i] = 1; lv[i] = s; emit[i] = 1; continue; }
    // v93 までの地形：ため池（円で描く）と、広げた土地の用水路・谷川（地面の高さに置く）はそのまま
    if (extWater(tId, x, y) || Math.hypot(x + 0.5 - 44.5, y + 0.5 - 50.5) < 2.1 || (W > 76 && Math.hypot(x + 0.5 - 112.5, y + 0.5 - 72.5) < 2.5)) continue;
    const sea = tId === 'coast' || y >= H - 4; wf[i] = 1; lv[i] = sea ? -1.55 : -1.44; emit[i] = sea ? 0 : 1; // 南の海・川は大きな水面が覆う
  }
  // 水の区画のとなりの陸の区画にも、はみ出した水面を描く
  const e2 = new Uint8Array(emit);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!emit[i]) continue; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < W && b < H && !wf[b * W + a] && !m.water[b * W + a]) e2[b * W + a] = 2; } }
  const wAt = (x: number, y: number) => wf[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
  const wx = [0, 0, 0, 0], wz = [0, 0, 0, 0];
  const f = (px: number, pz: number) => {
    const u = px - 0.5, v = pz - 0.5, i0 = Math.floor(u), j0 = Math.floor(v);
    let all = -1, same = true; for (let b = -1; b <= 2 && same; b++) for (let a = -1; a <= 2; a++) { const w = wAt(i0 + a, j0 + b); if (all < 0) all = w; else if (w !== all) { same = false; break; } }
    if (same) return all;
    cr(u - i0, wx); cr(v - j0, wz); let s = 0;
    for (let b = 0; b < 4; b++) { let r = 0; for (let a = 0; a < 4; a++) r += wx[a] * wAt(i0 + a - 1, j0 + b - 1); s += wz[b] * r; }
    return s + 0.2 * (vn(px, pz, 1.3, 57) - 0.5) + 0.1 * (vn(px, pz, 0.45, 58) - 0.5); // 岸に少しのむら（区画の中心では 0.5 を越えない大きさ）
  };
  const level = (px: number, pz: number) => {
    const u = px - 0.5, v = pz - 0.5, i0 = Math.floor(u), j0 = Math.floor(v), tu = u - i0, tv = v - j0; let s = 0, t = 0;
    for (const [a, b, w] of [[0, 0, (1 - tu) * (1 - tv)], [1, 0, tu * (1 - tv)], [0, 1, (1 - tu) * tv], [1, 1, tu * tv]] as const) { const x = i0 + a, y = j0 + b; if (x < 0 || y < 0 || x >= W || y >= H) continue; const l = lv[y * W + x]; if (Number.isFinite(l)) { s += l * (w + 1e-4); t += w + 1e-4; } }
    if (t > 0) return s / t;
    const x = Math.max(0, Math.min(W - 1, Math.floor(px))), y = Math.max(0, Math.min(H - 1, Math.floor(pz))); let best = NaN, bd = 9;
    for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const l = lv[yy * W + xx]; if (Number.isFinite(l) && Math.abs(a) + Math.abs(b) < bd) { bd = Math.abs(a) + Math.abs(b); best = l; } }
    return best;
  };
  /** 地面の頂点（区画の座標）の高さを、岸の曲線に合わせる */
  const adjust = (px: number, pz: number, y: number) => {
    const xs = px % 1 === 0 ? [px - 1, px] : [Math.floor(px)], zs = pz % 1 === 0 ? [pz - 1, pz] : [Math.floor(pz)];
    let any = false, all = true; for (const a of xs) for (const b of zs) { if (a < 0 || b < 0 || a >= W || b >= H) continue; if (wf[b * W + a]) any = true; else all = false; }
    if (!any) return y;
    const l = level(px, pz); if (!Number.isFinite(l)) return y;
    const fv = f(px, pz);
    if (all) return fv < 0.5 ? Math.max(y, l + 0.06 + 1.6 * (0.5 - fv)) : Math.min(y, l - 0.12 - 2.4 * (fv - 0.5));
    if (fv < 0.5) return Math.max(y, l + 0.05); // 陸と接する頂点：水面より低ければ上げる（岸の外に水たまりのような穴を見せない）
    return y < l + 0.8 ? Math.min(y, l - 0.1) : y;
  };
  return { wf, lv, emit: e2, f, level, adjust };
}

/** 水面を描く（区画を 3×3 に分け、f ≥ 0.5 の所を切り抜く） */
export function drawShoreWater(sh: Shore, g: Geo, color: number): void {
  const R = 3, { wf, emit, f, level } = sh;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!emit[i]) continue;
    let inner = !!wf[i]; if (inner) for (let b = -1; b <= 1 && inner; b++) for (let a = -1; a <= 1; a++) { const xx = Math.max(0, Math.min(W - 1, x + a)), yy = Math.max(0, Math.min(H - 1, y + b)); if (!wf[yy * W + xx]) { inner = false; break; } }
    if (inner) { const L = (u: number, v: number) => level(u, v); g.quad([x * TILE, L(x, y + 1), (y + 1) * TILE], [(x + 1) * TILE, L(x + 1, y + 1), (y + 1) * TILE], [(x + 1) * TILE, L(x + 1, y), y * TILE], [x * TILE, L(x, y), y * TILE], color); continue; }
    for (let sj = 0; sj < R; sj++) for (let si = 0; si < R; si++) {
      const u0 = x + si / R, u1 = x + (si + 1) / R, v0 = y + sj / R, v1 = y + (sj + 1) / R;
      const P: [number, number][] = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], F = P.map(([u, v]) => f(u, v));
      if (F.every(v => v < 0.5)) continue;
      const out: [number, number][] = [];
      for (let k = 0; k < 4; k++) { const a = P[k], b = P[(k + 1) % 4], fa = F[k], fb = F[(k + 1) % 4];
        if (fa >= 0.5) out.push(a);
        if ((fa >= 0.5) !== (fb >= 0.5)) { const t = (0.5 - fa) / (fb - fa); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
      if (out.length < 3) continue;
      const V = out.map(([u, v]) => { const l = level(u, v); return [u * TILE, Number.isFinite(l) ? l : -1.44, v * TILE] as [number, number, number]; });
      for (let k = 1; k + 1 < V.length; k++) g.tri(V[0], V[k], V[k + 1], color);
    }
  }
}
