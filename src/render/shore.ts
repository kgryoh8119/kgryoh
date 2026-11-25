// v94：水辺の岸をなめらかな曲線で描く。
// 計算（sim）の陸と水は 30m の区画ごとのまま。描画では、区画の中心に置いた「水なら 1、陸なら 0」を
// Catmull-Rom（中心を通るなめらかな補間）でつなぎ、少しのむらを足した値 f の 0.5 の等高線を岸にする。
// - 水面：区画を細かく（1 区画を 3×3）分け、f ≥ 0.5 の所だけを切り抜いて描く（区画の角に沿わない）
// - 地面：水の区画の中は、f に合わせて岸の外側を水面より少し上に、内側を水面より下にそろえる（陸の区画の地面は変えない。
//   水の区画と接する頂点だけは、水面より低ければ水面の高さまで上げる）
// 水面の高さは、まわりの水の区画の高さをなめらかに補間する（川は上流から下流へなめらかに下がる）
import { W, H, TILE, extWater, terrainOf, REAL, type MapDef } from '../sim/index';
import * as THREE from 'three';

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

/** v95：水深の色（深い所 0x3f7fa6＝地図の外の海と同じ、浅い岸ほど明るい浅葱色）。s は浅さ 0〜1 */
const DEEP = new THREE.Color(0x3f7fa6), MID = new THREE.Color(0x4688ad), SHALLOW = new THREE.Color(0x66a8ba);
export function waterTint(s: number, o: THREE.Color): THREE.Color { return s < 0.5 ? o.copy(DEEP).lerp(MID, s * 2) : o.copy(MID).lerp(SHALLOW, (s - 0.5) * 2); }
/** 地図の外の海の板に、深い所の色の頂点色を付ける（v95：地図の中の海と色をそろえる） */
export function seaColors(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.position.count, c = new Float32Array(n * 3); for (let k = 0; k < n; k++) { c[k * 3] = DEEP.r; c[k * 3 + 1] = DEEP.g; c[k * 3 + 2] = DEEP.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

/** 水面を描く（区画を 3×3 に分け、f ≥ 0.5 の所を切り抜く）。v95：1 枚の結合メッシュに、上向きの法線と水深の頂点色（区画の境で色・高さ・法線がつながる） */
export function buildShoreWater(sh: Shore): THREE.BufferGeometry | null {
  const R = 3, { wf, emit, f, level } = sh, N = W * H;
  // 岸からの距離（区画）：陸 0、陸のとなりの水 1、…（8 近傍）
  const dist = new Float32Array(N).fill(99), q: number[] = [];
  for (let i = 0; i < N; i++) if (!wf[i]) { dist[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) { const xx = x + a, yy = y + b; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (dist[j] > dist[i] + 1) { dist[j] = dist[i] + 1; q.push(j); } } }
  const dAt = (x: number, y: number) => { const v = dist[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))]; return Math.min(v, 6); };
  const shallow = (u: number, v: number) => { const p = u - 0.5, r = v - 0.5, x0 = Math.floor(p), y0 = Math.floor(r), tx = p - x0, ty = r - y0;
    const d = (dAt(x0, y0) * (1 - tx) + dAt(x0 + 1, y0) * tx) * (1 - ty) + (dAt(x0, y0 + 1) * (1 - tx) + dAt(x0 + 1, y0 + 1) * tx) * ty;
    const a = 1 - Math.min(1, Math.max(0, (d - 0.5) / 3.2)), fv = f(u, v), b = 1 - Math.min(1, Math.max(0, (fv - 0.5) * 2.2));
    const s = Math.max(a * a * (3 - 2 * a) * 0.7, b); return Math.min(1, s); };
  const pos: number[] = [], col: number[] = [], c = new THREE.Color(), memo = new Map<number, number>();
  const vert = (u: number, v: number) => { const key = Math.round(u * 3) * 4099 + Math.round(v * 3); // 3×3 の格子の点は 1 度だけ計算（同じ点で色・高さがそろう）
    const onGrid = Math.abs(u * 3 - Math.round(u * 3)) < 1e-6 && Math.abs(v * 3 - Math.round(v * 3)) < 1e-6;
    let l = onGrid ? memo.get(key) : undefined; if (l === undefined) { l = level(u, v); if (!Number.isFinite(l)) l = -1.44; if (onGrid) memo.set(key, l); }
    pos.push(u * TILE, l, v * TILE); waterTint(shallow(u, v), c); col.push(c.r, c.g, c.b); };
  const tri = (a: [number, number], b: [number, number], d: [number, number]) => { vert(a[0], a[1]); vert(b[0], b[1]); vert(d[0], d[1]); };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (!emit[i]) continue;
    let inner = !!wf[i]; if (inner) for (let b = -1; b <= 1 && inner; b++) for (let a = -1; a <= 1; a++) { const xx = Math.max(0, Math.min(W - 1, x + a)), yy = Math.max(0, Math.min(H - 1, y + b)); if (!wf[yy * W + xx]) { inner = false; break; } }
    if (inner) { tri([x, y + 1], [x + 1, y + 1], [x + 1, y]); tri([x, y + 1], [x + 1, y], [x, y]); continue; } // 岸に接しない区画は 1 区画 1 枚（v94 と同じ面数。色は角の頂点でなめらかにつながる）
    for (let sj = 0; sj < R; sj++) for (let si = 0; si < R; si++) {
      const u0 = x + si / R, u1 = x + (si + 1) / R, v0 = y + sj / R, v1 = y + (sj + 1) / R;
      const P: [number, number][] = [[u0, v1], [u1, v1], [u1, v0], [u0, v0]], F = P.map(([u, v]) => f(u, v));
      if (F.every(v => v < 0.5)) continue;
      const out: [number, number][] = [];
      for (let k = 0; k < 4; k++) { const a = P[k], b = P[(k + 1) % 4], fa = F[k], fb = F[(k + 1) % 4];
        if (fa >= 0.5) out.push(a);
        if ((fa >= 0.5) !== (fb >= 0.5)) { const t = (0.5 - fa) / (fb - fa); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); } }
      if (out.length < 3) continue;
      for (let k = 1; k + 1 < out.length; k++) tri(out[0], out[k], out[k + 1]);
    }
  }
  if (!pos.length) return null;
  const g = new THREE.BufferGeometry(), nor = new Float32Array(pos.length); for (let k = 1; k < nor.length; k += 3) nor[k] = 1;
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}
