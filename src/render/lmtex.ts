// 名所の glb に貼る模様（瓦・石垣・レンガ・スレート・芝・座席・外壁）をゲーム側で作る。
// 画像を glb に入れないことで、単一 HTML の大きさを抑える（16MB の上限対策）。
// 作り方は Blender 側の手順（tools/blender_*.py）の numpy の式と同じ。配列は Blender と同じ「下の行が先」で作り、
// 最後に上下を入れ替えて glTF の UV（Blender から書き出すと v が反転する）に合わせる。
import * as THREE from 'three';

type Tex = { map: THREE.DataTexture; normal?: THREE.DataTexture };
const cache = new Map<string, Tex | null>();

function rand(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function gauss(r: () => number): number { return Math.sqrt(-2 * Math.log(r() + 1e-9)) * Math.cos(2 * Math.PI * r()); }
function noise(S: number, r: () => number, sd: number): Float32Array { const a = new Float32Array(S * S); for (let i = 0; i < a.length; i++) a[i] = gauss(r) * sd; return a; }
/** 上下左右との平均を n 回（端はつながる） */
function blur(a: Float32Array, S: number, n: number): Float32Array {
  let src: Float32Array = a, dst: Float32Array = new Float32Array(a.length);
  for (let k = 0; k < n; k++) {
    for (let y = 0; y < S; y++) {
      const yu = ((y + 1) % S) * S, yd = ((y + S - 1) % S) * S, yc = y * S;
      for (let x = 0; x < S; x++) {
        const xl = (x + S - 1) % S, xr = (x + 1) % S;
        dst[yc + x] = (src[yc + x] + src[yu + x] + src[yd + x] + src[yc + xl] + src[yc + xr]) / 5;
      }
    }
    [src, dst] = [dst, src];
  }
  return src;
}
/** rgb（0〜1、sRGB）を上下反転して DataTexture に */
function toTex(S: number, rgb: Float32Array, color: boolean): THREE.DataTexture {
  const d = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y * S + x) * 3, o = ((S - 1 - y) * S + x) * 4;
    d[o] = Math.round(Math.min(1, Math.max(0, rgb[i])) * 255); d[o + 1] = Math.round(Math.min(1, Math.max(0, rgb[i + 1])) * 255); d[o + 2] = Math.round(Math.min(1, Math.max(0, rgb[i + 2])) * 255); d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 8; t.needsUpdate = true;
  return t;
}
function normalTex(S: number, h: Float32Array, s: number): THREE.DataTexture {
  const rgb = new Float32Array(S * S * 3);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (h[y * S + (x + 1) % S] - h[y * S + (x + S - 1) % S]) * s;
    const dy = (h[((y + 1) % S) * S + x] - h[((y + S - 1) % S) * S + x]) * s;
    const L = Math.hypot(dx, dy, 1), i = (y * S + x) * 3;
    rgb[i] = -dx / L * 0.5 + 0.5; rgb[i + 1] = -dy / L * 0.5 + 0.5; rgb[i + 2] = 1 / L * 0.5 + 0.5;
  }
  return toTex(S, rgb, false);
}

/** 本瓦葺き（緑青の銅瓦） */
function tile(base = [0x5f / 255, 0x94 / 255, 0x83 / 255], tint = [0.62, 0.76, 0.70]): Tex {
  const S = 512, P = 64, r = rand(7), rgb = new Float32Array(S * S * 3), h = new Float32Array(S * S);
  const varT = Array.from({ length: 64 }, () => 0.9 + r() * 0.18);
  const nz = blur(noise(S, r, 0.05), S, 2), st = blur(noise(S, r, 1), S, 6);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = (x % P) / P, cy = (y % P) / P, d = Math.abs(cx - 0.5) / 0.2;
    const maru = Math.sqrt(Math.max(0, 1 - d * d)), hira = 0.25 * (1 - Math.cos(2 * Math.PI * cx)) * 0.5, lip = (1 - cy) ** 2 * 0.35;
    const hh = Math.max(maru * 0.9 + lip * 0.6, hira + lip), edge = cy < 0.05 ? 0.7 : 1;
    const v = varT[(Math.floor(y / P) % 8) * 8 + (Math.floor(x / P) % 8)];
    const groove = maru > 0 ? 1 : 0.85 + 0.15 * (hira / 0.25);
    const k = (0.62 + 0.45 * hh) * v * edge * groove * (1 + nz[y * S + x]);
    const s = Math.min(1, Math.max(0, st[y * S + x] * 6)), i = (y * S + x) * 3;
    for (let c = 0; c < 3; c++) rgb[i + c] = base[c] * k * (1 - 0.15 * s) + tint[c] * 0.15 * s;
    h[y * S + x] = hh * edge;
  }
  return { map: toTex(S, rgb, true), normal: normalTex(S, h, 3) };
}

/** 石垣（大きさのばらばらな石を積む） */
function stone(): Tex {
  const S = 512, r = rand(11), lab = new Int32Array(S * S), dist = new Float32Array(S * S);
  const ri = (a: number, b: number) => a + Math.floor(r() * (b - a));
  const hs: number[] = []; while (hs.reduce((a, b) => a + b, 0) < S) hs.push(ri(38, 70));
  hs[hs.length - 1] -= hs.reduce((a, b) => a + b, 0) - S; if (hs[hs.length - 1] < 20) { hs[hs.length - 2] += hs.pop()!; }
  let sid = 0, y0 = 0;
  for (const rh of hs) {
    const ws: number[] = []; while (ws.reduce((a, b) => a + b, 0) < S) ws.push(ri(46, 118));
    ws[ws.length - 1] -= ws.reduce((a, b) => a + b, 0) - S; if (ws[ws.length - 1] < 24) { ws[ws.length - 2] += ws.pop()!; }
    const off = ri(0, S); let x0 = 0;
    for (const w of ws) {
      for (let yy = 0; yy < rh; yy++) for (let xx = 0; xx < w; xx++) {
        const X = (xx + x0 + off) % S, Y = y0 + yy;
        lab[Y * S + X] = sid; dist[Y * S + X] = Math.min(yy, rh - 1 - yy, xx, w - 1 - xx);
      }
      sid++; x0 += w;
    }
    y0 += rh;
  }
  const tone = Array.from({ length: sid + 1 }, () => 0.78 + r() * 0.37), hue = Array.from({ length: sid + 1 }, () => -0.04 + r() * 0.08);
  const bump = blur(noise(S, r, 1), S, 3), fine = blur(noise(S, r, 0.06), S, 1);
  const rgb = new Float32Array(S * S * 3), h = new Float32Array(S * S), base = [0x9c / 255, 0x96 / 255, 0x8a / 255];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const wx = 6 * Math.sin(2 * Math.PI * (y * 3 / S + x / S)) + 4 * Math.sin(2 * Math.PI * (y * 7 / S - x * 2 / S) + 1.3);
    const wy = 5 * Math.sin(2 * Math.PI * (x * 4 / S + y / S) + 0.7) + 3 * Math.sin(2 * Math.PI * (x * 9 / S + y * 3 / S));
    const X = ((Math.floor(x + wx) % S) + S) % S, Y = ((Math.floor(y + wy) % S) + S) % S, j = Y * S + X;
    const L = lab[j], dd = dist[j], bev = Math.min(1, dd / 7) ** 0.6, i = (y * S + x) * 3;
    if (dd < 2) { rgb[i] = 0.30; rgb[i + 1] = 0.29; rgb[i + 2] = 0.27; h[y * S + x] = 0; continue; }
    const k = (0.75 + 0.3 * bev) * (1 + fine[y * S + x]);
    rgb[i] = (base[0] * tone[L] + hue[L]) * k; rgb[i + 1] = (base[1] * tone[L] + hue[L] * 0.3) * k; rgb[i + 2] = (base[2] * tone[L] - hue[L]) * k;
    h[y * S + x] = bev + bump[y * S + x] * 0.12;
  }
  return { map: toTex(S, rgb, true), normal: normalTex(S, h, 2.5) };
}

/** 赤レンガ（長手積み、目地は白っぽい） */
function brick(): Tex {
  const S = 512, r = rand(13), rgb = new Float32Array(S * S * 3), h = new Float32Array(S * S);
  const N = 8 * 16 + 8, tone = Array.from({ length: N }, () => 0.78 + r() * 0.34), dark = Array.from({ length: N }, () => r() < 0.12);
  const nz = blur(noise(S, r, 0.06), S, 1), base = [0xa2 / 255, 0x4a / 255, 0x36 / 255];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / 32), off = row % 2 ? 32 : 0, bx = (x + off) % 64, by = y % 32;
    const id = ((Math.floor((x + off) / 64) % 8) + row * 8) % N, i = (y * S + x) * 3;
    if (bx < 3 || by < 3) { rgb[i] = 0.72; rgb[i + 1] = 0.70; rgb[i + 2] = 0.66; h[y * S + x] = 0; continue; }
    const k = tone[id] * (1 + nz[y * S + x]) * (dark[id] ? 0.7 : 1);
    for (let c = 0; c < 3; c++) rgb[i + c] = base[c] * k;
    h[y * S + x] = 1;
  }
  return { map: toTex(S, rgb, true), normal: normalTex(S, blur(h, S, 1), 2) };
}

/** スレート葺き */
function slate(): Tex {
  const S = 256, r = rand(17), rgb = new Float32Array(S * S * 3), h = new Float32Array(S * S);
  const tone = Array.from({ length: 256 }, () => 0.85 + r() * 0.25), base = [0x4a / 255, 0x50 / 255, 0x58 / 255];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const row = Math.floor(y / 16), off = row % 2 ? 8 : 0, bx = (x + off) % 16, by = y % 16;
    const k = tone[((Math.floor((x + off) / 16) % 16) + row * 16) % 256], edge = by > 13 || bx < 1, i = (y * S + x) * 3;
    for (let c = 0; c < 3; c++) rgb[i + c] = base[c] * k * (edge ? 0.6 : 1);
    h[y * S + x] = edge ? 0 : 1 - (by / 16) * 0.6;
  }
  return { map: toTex(S, rgb, true), normal: normalTex(S, h, 1.5) };
}

/** サッカーの芝（刈り目の縞とライン）。UV は芝全体で 0〜1 */
function pitch(): Tex {
  const S = 1024, r = rand(19), FA = 38, FB = 25, rgb = new Float32Array(S * S * 3);
  const nz = blur(noise(S, r, 0.05), S, 2), base = [0x4f / 255, 0x9a / 255, 0x45 / 255], w = 0.18, hx = 35, hy = 22;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const X = x / S * 2 * FA - FA, Y = y / S * 2 * FB - FB, i = (y * S + x) * 3;
    const stripe = Math.floor((X + FA) / (2 * FA / 14)) % 2;
    let L = (Math.abs(Math.abs(X) - hx) < w && Math.abs(Y) <= hy + w) || (Math.abs(Math.abs(Y) - hy) < w && Math.abs(X) <= hx + w) || (Math.abs(X) < w && Math.abs(Y) <= hy);
    const rr = Math.hypot(X, Y); L ||= Math.abs(rr - 6.5) < w || rr < 0.35;
    for (const sx of [-1, 1]) {
      const xs = X * sx;
      for (const [dx, dy] of [[11.5, 13], [4, 6]]) {
        L ||= Math.abs(xs - (hx - dx)) < w && Math.abs(Y) <= dy;
        L ||= Math.abs(Math.abs(Y) - dy) < w && xs >= hx - dx - w && xs <= hx;
      }
      const d = Math.hypot(X - sx * (hx - 7.7), Y); L ||= (Math.abs(d - 6.5) < w && xs < hx - 11.5) || d < 0.25;
    }
    if (L) { rgb[i] = 0.93; rgb[i + 1] = 0.95; rgb[i + 2] = 0.92; continue; }
    const out = Math.abs(X) > hx + 1.2 || Math.abs(Y) > hy + 1.2, k = (0.9 + 0.12 * stripe) * (1 + nz[y * S + x]) * (out ? 0.85 : 1);
    for (let c = 0; c < 3; c++) rgb[i + c] = base[c] * k;
  }
  return { map: toTex(S, rgb, true) };
}

/** スタンドの座席 */
function seat(): Tex {
  const S = 256, rgb = new Float32Array(S * S * 3), h = new Float32Array(S * S), base = [0x2a / 255, 0x5f / 255, 0xb0 / 255];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const cx = (x % 32) / 32, cy = y / S, on = cx > 0.12 && cx < 0.88 && cy > 0.35 && cy < 0.9, i = (y * S + x) * 3;
    if (on) { const k = 0.95 + (cy > 0.6 ? 0.1 : 0); for (let c = 0; c < 3; c++) rgb[i + c] = base[c] * k; } else { rgb[i] = 0.45; rgb[i + 1] = 0.46; rgb[i + 2] = 0.47; }
    h[y * S + x] = on ? 1 : 0;
  }
  return { map: toTex(S, rgb, true), normal: normalTex(S, blur(h, S, 1), 2) };
}

/** スタジアムの外壁（縦のルーバー） */
function facade(): Tex {
  const S = 256, rgb = new Float32Array(S * S * 3), h = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const fin = (x % 64) / 64 < 0.18, i = (y * S + x) * 3;
    const c = fin ? [0.92, 0.93, 0.94] : [0.55, 0.62, 0.68]; rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; h[y * S + x] = fin ? 1 : 0;
  }
  return { map: toTex(S, rgb, true), normal: normalTex(S, blur(h, S, 1), 3) };
}

const GEN: Record<string, () => Tex> = {
  copperRoof: () => tile(), pgd_kawara: () => tile([0x5a / 255, 0x5e / 255, 0x63 / 255], [0.55, 0.57, 0.6]), stone,
  kawara: () => tile([0x5a / 255, 0x5e / 255, 0x63 / 255], [0.55, 0.57, 0.6]), ishigaki: stone, stn_brick: brick, stn_slate: slate, std_pitch: pitch, std_seat: seat, std_facade: facade,
};
/** 接頭辞つきでも模様を貼る名前（stone などは誤爆しやすいので完全一致だけ） */
const SUFFIX = new Set(['kawara', 'ishigaki']);
/** 材質名に合う模様（無ければ null）。同じ模様は使い回す */
export function lmTexture(name: string): Tex | null {
  if (cache.has(name)) return cache.get(name)!;
  // 「接頭辞_名前」の材質は、名前の部分でも探す（例: kbk_kawara → kawara）。同じ模様は使い回す
  const tail = name.slice(name.indexOf('_') + 1), key = GEN[name] ? name : SUFFIX.has(tail) ? tail : '';
  if (!key) { cache.set(name, null); return null; }
  if (!cache.has(key)) cache.set(key, GEN[key]());
  const t = cache.get(key)!; cache.set(name, t); return t;
}
