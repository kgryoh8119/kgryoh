// 地形。シードから毎回同じものを作るので GameState には保存しない。
import { W, H, TILE } from './config';
import { REAL, RF, onMapChange } from './real';

export interface MapDef {
  seed: number;
  heights: Float32Array; // (W+1)*(H+1) 頂点の標高（m）
  water: Uint8Array;
  rail: Uint8Array;
  forest: Uint8Array;    // 保全林（開発不可）
  steep: Uint8Array;
  district: Uint8Array;
  /** 実在都市版：既存の建物・墓地など（計算外で、開発できない） */
  blocked?: Uint8Array;
  /** 実在都市版：公園・緑地 */
  park?: Uint8Array;
  /** 実在都市版：国道の区画（国の管理） */
  national?: Uint8Array;
  /** 実在都市版：取り込んだ元からの道路（橋や斜面でも可） */
  fixedRoad?: Uint8Array;
  /** 実在都市版：空き地・畑 */
  open?: Uint8Array;
  /** 地形の造作：湿地・砂地・人が掘った水面（池・川・海） */
  wet?: Uint8Array;
  sand?: Uint8Array;
  /** v21：砂漠（砂丘）・雪原 */
  desert?: Uint8Array;
  snow?: Uint8Array;
  dug?: Uint8Array;
  /** 掘った池・湿地の水面の高さ（m） */
  waterLv?: Float32Array;
  /** 造作の前の地形（元の地図） */
  base?: MapDef;
  /** v70：地形の見た目だけの印（計算には使わない）。1 砂浜 2 田んぼ 3 岩肌 4 河原 5 雪の頂 */
  deco?: Uint8Array;
}

export const idx = (x: number, y: number) => y * W + x;
export const inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
export const tx = (i: number) => i % W;
export const ty = (i: number) => (i / W) | 0;

export function hash(a: number, b: number, seed: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const smooth = (t: number) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };

const cache = new Map<number, MapDef>();

/** 地形の造作（市長が盛り土・掘削・水面・植林などをした結果）。いま計算している街の分だけを持つ */
let TERRA: { seed: number; key: string; map: MapDef } | null = null;
/** 造作の種類（区画ごと）：0 元のまま・1 水面（池・川・海）・2 陸（埋め立て）・3 森（植林）・4 伐採（林なし）・5 湿地・6 砂地 */
export const TERRA_T = { none: 0, water: 1, land: 2, forest: 3, clear: 4, wet: 5, sand: 6, desert: 7, snow: 8 } as const;
/** 街の状態に合わせて地形の造作を反映する（計算・検査・描画の前に呼ぶ） */
export function syncTerrain(s: { seed: number; terraVer?: number; terraH?: number[]; terraT?: number[] } | null): void {
  if (REAL || !s || !s.terraVer || (!s.terraH && !s.terraT)) { TERRA = null; return; }
  let sum = 0;
  if (s.terraH) for (let k = 0; k < s.terraH.length; k++) if (s.terraH[k]) sum = (sum * 31 + k * 7 + Math.round(s.terraH[k] * 10)) % 1000000007;
  if (s.terraT) for (let k = 0; k < s.terraT.length; k++) if (s.terraT[k]) sum = (sum * 37 + k * 11 + s.terraT[k]) % 1000000007;
  const key = `${s.seed}:${s.terraVer}:${sum}`;
  if (TERRA && TERRA.key === key) return;
  TERRA = { seed: s.seed, key, map: deriveMap(baseMap(s.seed), s.terraH, s.terraT) };
}
/** 元の地形に造作を重ねた地図 */
function deriveMap(b: MapDef, dh: number[] | undefined, tt: number[] | undefined): MapDef {
  const S = W + 1, heights = new Float32Array(b.heights);
  if (dh) for (let k = 0; k < heights.length && k < dh.length; k++) if (dh[k]) heights[k] += dh[k];
  const water = new Uint8Array(b.water), forest = new Uint8Array(b.forest), wet = new Uint8Array(W * H), sand = new Uint8Array(W * H), desert = new Uint8Array(W * H), snow = new Uint8Array(W * H), dug = new Uint8Array(W * H);
  const corners = (i: number) => { const x = i % W, y = (i / W) | 0; return [y * S + x, y * S + x + 1, (y + 1) * S + x, (y + 1) * S + x + 1]; };
  if (tt) for (let i = 0; i < W * H; i++) {
    const t = tt[i]; if (!t) continue;
    if (t === 1) { water[i] = 1; dug[i] = b.water[i] ? 0 : 1; forest[i] = 0; }
    else if (t === 2) { water[i] = 0; forest[i] = 0; }
    else if (t === 3) forest[i] = 1;
    else if (t === 4) forest[i] = 0;
    else if (t === 5) { wet[i] = 1; forest[i] = 0; }
    else if (t === 6) { sand[i] = 1; forest[i] = 0; }
    else if (t === 7) { desert[i] = 1; forest[i] = 0; }
    else if (t === 8) { snow[i] = 1; forest[i] = 0; }
  }
  // 埋め立てた所は水面より上に、掘った水面・湿地は少し低くする（岸ができる）
  if (tt) for (let i = 0; i < W * H; i++) {
    const t = tt[i];
    if (t === 2 && b.water[i]) for (const v of corners(i)) heights[v] = Math.max(heights[v], 0.4);
  }
  const hs0 = new Float32Array(heights); // 斜面の判定は、掘った水面・湿地の岸を下げる前の高さで（となりの道路や建物の区画が急斜面にならないように）
  // 掘った池・湿地は、つながった水面ごとに水位をそろえ（いちばん低い岸に合わせる）、底をその下まで掘る
  const waterLv = new Float32Array(W * H);
  if (tt) {
    const seen = new Uint8Array(W * H);
    for (let i0 = 0; i0 < W * H; i0++) {
      const t0 = tt[i0], kind = t0 === 1 && !b.water[i0] ? 1 : t0 === 5 ? 5 : 0;
      if (!kind || seen[i0]) continue;
      const comp: number[] = [i0]; seen[i0] = 1;
      for (let h = 0; h < comp.length; h++) {
        const i = comp[h], x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of NEIGH) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const j = idx(xx, yy), tj = tt[j], kj = tj === 1 && !b.water[j] ? 1 : tj === 5 ? 5 : 0; if (kj === kind && !seen[j]) { seen[j] = 1; comp.push(j); } }
      }
      let lv = Infinity; for (const i of comp) for (const v of corners(i)) lv = Math.min(lv, hs0[v]);
      const surf = lv - (kind === 1 ? 0.5 : 0.15), bottom = surf - (kind === 1 ? 1.4 : 0.45);
      const inC = new Set(comp), vx = (v: number) => v % S, vy = (v: number) => (v / S) | 0;
      const inner = (v: number) => { for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const x = vx(v) + dx, y = vy(v) + dy; if (inMap(x, y) && !inC.has(idx(x, y))) return false; } return true; };
      // 岸（水面でない区画と共有する角）は 1.6m までしか下げない（となりの建物や道路が傾かないように）
      for (const i of comp) { waterLv[i] = surf; for (const v of corners(i)) heights[v] = Math.min(heights[v], inner(v) ? bottom : Math.max(bottom, hs0[v] - 1.6)); }
    }
  }
  const steep = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const hs = [hs0[y * S + x], hs0[y * S + x + 1], hs0[(y + 1) * S + x], hs0[(y + 1) * S + x + 1]];
    if (Math.max(...hs) - Math.min(...hs) > 3.5) steep[i] = 1;
  }
  return { ...b, heights, water, forest, steep, wet, sand, desert, snow, dug, waterLv, base: b };
}

export function getMap(seed: number): MapDef {
  if (REAL) return realMap();
  if (TERRA && TERRA.seed === seed) return TERRA.map;
  return baseMap(seed);
}
/** 架空の街の地形のパターン。lv は選べるようになる市長の経歴レベル。シードの 10 億以上の部分に番号を入れる */
export const TERRAINS = [
  { id: 'coast', name: '海辺の街', desc: '南に海、北に鉄道。いちばん標準の街。', lv: 0, city: '住野市' },
  { id: 'inland', name: '内陸の盆地', desc: '海がなく、東を山に囲まれた盆地。津波の心配はないが、川があふれやすい。', lv: 1, city: '盆野市' },
  { id: 'rural', name: '田園の町', desc: '平らな田畑が広がる小さな町。人は少なく、のびのび広げられる。', lv: 2, city: '稲穂町' },
  { id: 'river', name: '大河が横切る街', desc: '東を大きな川が南北に流れ、橋が要になる。水運と水害。', lv: 3, city: '川辺市' },
  { id: 'lake', name: '湖のほとりの街', desc: '東に大きな湖。観光と水辺の暮らし。', lv: 3, city: '湖畔市' },
  { id: 'mountain', name: '山あいの村', desc: '東と南に険しい山。平地が少なく、過疎と土砂災害に向き合う。', lv: 4, city: '山里村' },
  { id: 'urban', name: '都会の街', desc: '最初から人口が多く、資金もあるが、地価と渋滞が手ごわい。', lv: 5, city: '新都市' },
  { id: 'island', name: '島の町', desc: '三方を海に囲まれ、橋で本土とつながる。港と観光、そして津波。', lv: 6, city: '汐見町' },
] as const;
export type TerrainId = typeof TERRAINS[number]['id'];
export const terrainIx = (seed: number) => (seed >= 1e9 ? Math.max(0, Math.min(TERRAINS.length - 1, Math.floor(((seed >= 2e9 ? seed - 2e9 : seed - 1e9)) / 1e6))) : 0);
/** v70 の地形（湖を大きく、川を太く、山を高く）。古いセーブの地形は変えないよう、新しく始めた街だけ（シードの 20 億以上） */
export const terrainV2 = (seed: number) => seed >= 2e9;
export const terrainOf = (seed: number) => TERRAINS[terrainIx(seed)];
export const seedForTerrain = (id: string, n = 261011) => { const k = Math.max(0, TERRAINS.findIndex(t => t.id === id)); return k === 0 && n === 261011 ? 20261011 : 2e9 + k * 1e6 + (n % 1e6); };
/** 造作の前の、元の地形 */
export function baseMap(seed: number): MapDef {
  if (REAL) return realMap();
  const c = cache.get(seed);
  if (c) return c;
  // v9：44×44 の旧市街はそのままの位置に残し、東（東台）と南（南原）へ広げた。川は地図の南端
  const T = terrainOf(seed).id, noSea = T === 'inland' || T === 'rural' || T === 'mountain', V2 = terrainV2(seed);
  // v70 の湖：東の半分を占める大きな湖（楕円）と、小さな島
  const lakeD = (x: number, y: number) => V2 ? Math.hypot((x - 63) / 11.5, (y - 38) / 15) : Math.hypot(x - 62, y - 46) / 7.3;
  const RW = V2 ? 2.4 : 1.5; // 大河の幅（半分）
  const RY = noSea ? H - 3.4 : H - 4.8; // 川岸の始まり（海のない地形は細い川）
  const riverX = (y: number) => 52 + 5 * Math.sin(y / 9); // 大河が横切る街：南北の川
  const heights = new Float32Array((W + 1) * (H + 1));
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) {
    const d1 = Math.hypot(x - 33.5, y - 26) / 11;       // 丘陵台
    const d2 = Math.hypot(x - 39.5, y - 9) / 5;         // 北東の保全林の丘
    const d3 = Math.hypot(x - 6, y - 34) / 5.5;         // 南西の小丘
    const d4 = Math.hypot(x - 66, y - 29) / 6.5;        // 東の森（東台の奥）
    const d5 = Math.hypot(x - 57, y - 52) / 10;         // 南原のゆるい台地
    const d6 = Math.hypot(x - 44.5, y - 50.5) / 2.6;    // ため池
    let h = 15 * smooth(1 - d1) + 20 * smooth(1 - d2) + 8 * smooth(1 - d3) + 22 * smooth(1 - d4) + 9 * smooth(1 - d5) - 2.6 * smooth(1 - d6);
    if (T === 'rural') h *= 0.35;
    if (T === 'inland') h += 26 * smooth((x - 63) / 9) + (V2 ? 34 * smooth((x - 68) / 5) + 22 * smooth((3 - x) / 2.5) * smooth((y - 18) / 4) : 0); // v70：盆地を囲む東と西の山
    if (T === 'mountain') h += (V2 ? 56 : 38) * smooth((x - 50) / 12) * (0.7 + 0.3 * Math.sin(y / 5)) + (V2 ? 40 : 30) * smooth((y - 40) / 14) * smooth((x - 10) / 30)
      + (V2 ? 14 * smooth((x - 56) / 10) * Math.max(0, Math.sin(x / 3.1) * Math.sin(y / 3.7)) + 150 * smooth((x - 63) / 6) * Math.pow(Math.abs(Math.sin(y / 3.3 + 0.7) * Math.sin(x / 2.6 + 1.1)), 0.8) : 0); // v70：尾根と谷の起伏、東の奥の高い峰
    if (T === 'river' && y >= 3) { const dr = Math.abs(x - riverX(y)), k = V2 ? smooth((dr - RW + 0.1) / 1.2) : smooth((dr - 1.4) / 1.5); h = V2 ? (h * smooth((dr - RW - 1.6) / 1.4) - 0.5 * (1 - smooth((dr - RW - 1.6) / 1.4))) * k - 2.6 * (1 - k) : h * k - 2.6 * (1 - k); } // v70：太い川と、両岸の河川敷（低い平地）
    if (T === 'lake') { const dl = V2 ? lakeD(x, y) : Math.hypot(x - 62, y - 46) / 8.5; h = h * smooth(dl - 0.85) - 2.8 * (1 - smooth(dl - 0.85));
      if (V2) { h += 3.2 * smooth(1 - Math.hypot(x - 67, y - 41) / 2.2); h += 18 * smooth((x - 73) / 4) * smooth((y - 16) / 6); } } // 湖の小島と、向こう岸の山
    if (T === 'island') { const e1 = smooth((x - (W - 6.5)) / 1.6) * (y >= 13.5 && y <= 17.5 ? 0 : 1), e2 = smooth((3.5 - x) / 1.6) * smooth((y - 24) / 2); const e = Math.max(e1, e2); h = h * (1 - e) - 3.2 * e; }
    // ゆるい起伏（地図の縁では 0 にして外側の地面とつなぐ）
    const edge = smooth(Math.min(x, y, W - x) / 3);
    const gx = Math.floor(x / 4), gy = Math.floor(y / 4), fx = (x % 4) / 4, fy = (y % 4) / 4;
    const n = (a: number, b: number) => hash(a, b, seed);
    const sx = smooth(fx), sy = smooth(fy);
    h += ((n(gx, gy) * (1 - sx) + n(gx + 1, gy) * sx) * (1 - sy) + (n(gx, gy + 1) * (1 - sx) + n(gx + 1, gy + 1) * sx) * sy - 0.5) * 0.9 * edge;
    // 南の川
    const r = smooth((y - RY) / 1.6);
    h = h * (1 - r) - 3.2 * r;
    heights[y * (W + 1) + x] = h;
  }
  const water = new Uint8Array(W * H), rail = new Uint8Array(W * H), forest = new Uint8Array(W * H), steep = new Uint8Array(W * H), district = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const hs = [heights[y * (W + 1) + x], heights[y * (W + 1) + x + 1], heights[(y + 1) * (W + 1) + x], heights[(y + 1) * (W + 1) + x + 1]];
    const lo = Math.min(...hs), hi = Math.max(...hs);
    if (y >= (noSea ? H - 3 : H - 4)) water[i] = 1;
    if (T === 'river' && y >= 3 && Math.abs(x + 0.5 - riverX(y + 0.5)) < RW) water[i] = 1;
    if (T === 'lake' && lakeD(x + 0.5, y + 0.5) < (V2 ? 0.93 : 1) && !(V2 && Math.hypot(x + 0.5 - 67, y + 0.5 - 41) < 1.6)) water[i] = 1;
    if (T === 'island' && ((x >= W - 5 && (y < 14 || y > 16)) || (x <= 2 && y >= 25))) water[i] = 1;
    if (Math.hypot(x + 0.5 - 44.5, y + 0.5 - 50.5) < 2.1) water[i] = 1; // ため池
    // 線路は GameState の rail（市が敷き直せる）。地形としての鉄道用地は持たない
    if (hi - lo > 3.5) steep[i] = 1;
    const d2 = Math.hypot(x + 0.5 - 39.5, y + 0.5 - 9) / 5;
    const d3 = Math.hypot(x + 0.5 - 6, y + 0.5 - 34) / 5.5;
    const d4 = Math.hypot(x + 0.5 - 66, y + 0.5 - 29) / 6.5;
    if ((d2 < 0.9 && y > 1) || d3 < 0.75 || d4 < 0.8 || y === (noSea ? H - 5 : H - 6) || y === (noSea ? H - 4 : H - 5)) forest[i] = 1;
    if ((T === 'mountain' || T === 'inland') && lo > 12 && !water[i]) forest[i] = 1;
    if (water[i]) forest[i] = 0;
    district[i] = y < 15 ? (x < 13 ? 3 : x < 44 ? 0 : 4) : y >= 40 ? 5 : x < 22 ? 1 : x < 44 ? 2 : 4;
  }
  // v70：見た目だけの印（砂浜・田んぼ・岩肌・河原・雪の頂）。古いセーブでも計算は変わらない
  const deco = new Uint8Array(W * H), hv = (x: number, y: number) => heights[y * (W + 1) + x];
  const nearW = (x: number, y: number, r: number) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < W && b < H && water[idx(a, b)]) return true; } return false; };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); if (water[i]) continue;
    const hm = (hv(x, y) + hv(x + 1, y) + hv(x, y + 1) + hv(x + 1, y + 1)) / 4, sea = y >= H - 7;
    if ((T === 'coast' || T === 'island') && nearW(x, y, 1) && hm < 1.2 && (sea || T === 'island')) deco[i] = 1;
    else if (T === 'lake' && nearW(x, y, 1) && hm < 1.0 && y < H - 6) deco[i] = 1;
    else if (T === 'river' && y < H - 6 && nearW(x, y, 1) && hm < 0.4) deco[i] = 4;
    const snowT = T === 'mountain' ? (V2 ? 118 : 40) : 30, rockT = T === 'mountain' && V2 ? 92 : 20;
    if (hm > snowT) { deco[i] = 5; if (V2) forest[i] = 0; } else if (hm > rockT && (!forest[i] || V2)) { deco[i] = 3; if (V2) forest[i] = 0; }
    if (!deco[i] && !forest[i] && !steep[i] && (T === 'rural' || ((T === 'mountain' || T === 'inland') && hm > 2 && hm < 16)) && hash(x >> 1, y >> 1, seed + 77) < (T === 'rural' ? 0.85 : 0.55)) deco[i] = 2;
  }
  const m: MapDef = { seed, heights, water, rail, forest, steep, district, deco };
  cache.set(seed, m);
  return m;
}

let realCache: MapDef | null = null;
onMapChange(() => { cache.clear(); realCache = null; TERRA = null; });
function realMap(): MapDef {
  if (realCache) return realCache;
  const R = REAL!, N = W * H, f = R.flags;
  const heights = new Float32Array((W + 1) * (H + 1));
  for (let y = 0; y <= H; y++) for (let x = 0; x <= W; x++) heights[y * (W + 1) + x] = demAt(x * TILE, y * TILE);
  const mk = (bit: number) => { const a = new Uint8Array(N); for (let i = 0; i < N; i++) a[i] = f[i] & bit ? 1 : 0; return a; };
  const steep = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let lo = 1e9, hi = -1e9;
    for (const [u, v] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]]) { const h = demAt((x + u) * TILE, (y + v) * TILE); lo = Math.min(lo, h); hi = Math.max(hi, h); }
    if (hi - lo > 8) steep[y * W + x] = 1; // 30m で 8m 以上（約 30%）は新しく開発できない
  }
  // 既に住宅が建っている斜面は造成済みの土地として扱う（用地買収のあと道路や施設を置ける）
  for (const l of R.lots) if (l[0] <= 2 && !l[4]) steep[l[2] * W + l[1]] = 0;
  realCache = { seed: 0, heights, water: mk(RF.water), rail: mk(RF.rail), forest: mk(RF.forest), steep, district: R.district,
    blocked: mk(RF.blocked), park: mk(RF.park), national: mk(RF.national), fixedRoad: mk(RF.fixed), open: mk(RF.open) };
  return realCache;
}
/** 実在都市版：10m 格子の標高から補間（m） */
function demAt(wx: number, wz: number): number {
  const d = REAL!.dem, fx = Math.max(0, Math.min(d.cols - 1.0001, wx / d.step)), fz = Math.max(0, Math.min(d.rows - 1.0001, wz / d.step));
  const x0 = Math.floor(fx), z0 = Math.floor(fz), u = fx - x0, v = fz - z0, c = d.cols, h = d.h;
  return (h[z0 * c + x0] * (1 - u) + h[z0 * c + x0 + 1] * u) * (1 - v) + (h[(z0 + 1) * c + x0] * (1 - u) + h[(z0 + 1) * c + x0 + 1] * u) * v;
}

/** 建物や道路を置ける土地か */
export function buildable(m: MapDef, i: number): boolean {
  return !m.water[i] && !(m.wet && m.wet[i]) && !m.rail[i] && !m.forest[i] && !m.steep[i] && !(m.blocked && m.blocked[i]) && !(m.park && m.park[i]);
}

export function landReason(m: MapDef, i: number): string {
  if (m.water[i]) return '水面です';
  if (m.wet && m.wet[i]) return '湿地です（埋め立てるか、元に戻すと使えます）';
  if (m.rail[i]) return '鉄道用地です';
  if (m.forest[i]) return '保全区域（樹林）です';
  if (m.steep[i]) return '斜面が急すぎます';
  if (m.blocked && m.blocked[i]) return '既存の建物・施設があります（工場・学校・寺社・墓地など）';
  if (m.park && m.park[i]) return '公園・緑地です';
  return '';
}

/** ワールド座標 (wx, wz) の標高（双線形補間） */
export function heightAt(m: MapDef, wx: number, wz: number): number {
  if (REAL) return demAt(wx, wz);
  const fx = Math.max(0, Math.min(W - 0.0001, wx / TILE)), fy = Math.max(0, Math.min(H - 0.0001, wz / TILE));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, v = fy - y0;
  const h = m.heights, s = W + 1;
  return (h[y0 * s + x0] * (1 - u) + h[y0 * s + x0 + 1] * u) * (1 - v) + (h[(y0 + 1) * s + x0] * (1 - u) + h[(y0 + 1) * s + x0 + 1] * u) * v;
}

/** タイル中心の標高 */
export function tileHeight(m: MapDef, x: number, y: number): number {
  return heightAt(m, (x + 0.5) * TILE, (y + 0.5) * TILE);
}

export const NEIGH = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** ロープウェイの山頂駅：ふもと（x, y の敷地）から 14 区画以内で、15m 以上高い、いちばん高い区画。なければ null */
export function ropewayTop(m: MapDef, x: number, y: number, w = 2, h = 1): { x: number; y: number; dh: number } | null {
  const base = tileHeight(m, x + (w - 1) / 2, y + (h - 1) / 2);
  let best: { x: number; y: number; dh: number } | null = null;
  for (let dy = -14; dy <= 14; dy++) for (let dx = -14; dx <= 14; dx++) {
    const xx = x + dx, yy = y + dy; if (!inMap(xx, yy) || dx * dx + dy * dy > 196 || m.water[idx(xx, yy)]) continue;
    const dh = tileHeight(m, xx, yy) - base; if (dh >= 15 && (!best || dh > best.dh)) best = { x: xx, y: yy, dh };
  }
  return best;
}
