// 再計算：状態から導ける値（接続、実効容量、サービス水準、売上、混雑、満足度、声、集計）を作り直す。
// 金銭・人口・乱数は変えない。操作の直後と月次処理の最後に呼ぶ。
import { lvK, reachOf, NIMBY, W, H, P, DEFS, POLICIES, AIR_ROUTES, VISION_PERKS, SAT_W, SCALE, isRes, isShop, isCity, isBiz, fam, LV_CAP, lvOf, hasOp, countOp, SPORTS } from './config';
import type { Fam, VisionPerk } from './config';
import { getMap, idx, tx, ty, inMap, NEIGH } from './map';
import { railNbrs } from './railnet';
import type { GameState, Building, Voice, Stats } from './types';
import { NHH, DISTRICTS } from './types';
import { REAL, onMapChange } from './real';
import { syncTerrain } from './map';
import { chainFactor, fxDev } from './economy';
import { cpiBurden } from './macro';
import { threatSafety } from './threats';
import { mayorAdd, mayorMul } from './mayor';
import { optAdd, optMul, optCap } from './options';
import { intlAdd, intlMul, intlVisitors } from './intl';
import { execAdd, execMul, routeAdd, routeCarK } from './admin';
import { shipGates } from './isle';
import { renewCostOf, BIG_STORES } from './loopHooks';

/** 市外への出入口（道路でここにつながれば市外とつながる）。実在都市版では地図の縁の幹線道路 */
const LIVESTOCK = new Set<string>(['poultry', 'pigFarm', 'beefRanch', 'dairy']);
export let GATEWAYS: number[] = [];
/** 通過交通の入口と出口 */
let THROUGH: number[] = [];
/** 街区から道路までの距離の上限（区画）。実在都市版は住宅地の細い道（描画だけ）を通って 180m まで */
export let ACCESS_R = 1;
let N = 0;
onMapChange(() => {
  GATEWAYS = REAL ? REAL.gateways : [idx(0, 15), idx(W - 1, 15)];
  THROUGH = REAL ? REAL.through : [GATEWAYS[0], GATEWAYS[1]];
  ACCESS_R = REAL && !REAL.deformed ? 6 : 1; // まちづくり版は架空の街と同じく、道路に面した区画だけ
  N = W * H;
});

export interface Tree { d: Float64Array; p: Int32Array }
export interface RoadInfo {
  conn: Uint8Array; dist: Map<number, Int16Array>;
  /** 距離の上限つきの到達範囲（区画と距離の組）。施設ごとの利用圏の計算に使う */
  reach: Map<string, { t: Int32Array; d: Int16Array }>;
  /** 道路タイルだけの詰めたグラフ */
  n: number; nodes: Int32Array; nodeOf: Int32Array; adj: Int32Array; free: Float64Array;
  freeTrees: Map<number, Tree>;
}
const infoCache = new WeakMap<GameState, { ver: string; info: RoadInfo }>();

/** 操作の取り消し後などに、道路の解析結果の使い回しをやめる */
export function invalidateCaches(s: GameState): void { infoCache.delete(s); }

/** 国道の市外接続点から道路でつながるタイル */
export function roadInfo(s: GameState): RoadInfo {
  const ships = shipGates(s), ver = ships.length ? s.roadVersion + ':' + ships.join(',') : String(s.roadVersion); // v88：無人島は桟橋・港に面した道路も出入口
  const c = infoCache.get(s);
  if (c && c.ver === ver) return c.info;
  const conn = new Uint8Array(N);
  const q: number[] = [];
  for (const g of [...GATEWAYS, ...ships]) if (s.road[g] && !conn[g]) { conn[g] = 1; q.push(g); }
  for (let h = 0; h < q.length; h++) {
    const i = q[h], x = tx(i), y = ty(i);
    for (const [dx, dy] of NEIGH) {
      const nx = x + dx, ny = y + dy;
      if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny);
      if (s.road[j] && !conn[j]) { conn[j] = 1; q.push(j); }
    }
  }
  const nodeOf = new Int32Array(N).fill(-1);
  const list: number[] = [];
  for (let i = 0; i < N; i++) if (s.road[i]) { nodeOf[i] = list.length; list.push(i); }
  const n = list.length, nodes = Int32Array.from(list), adj = new Int32Array(n * 4).fill(-1), free = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const i = nodes[k], x = tx(i), y = ty(i);
    free[k] = (0.03 / P.roadSpeed[s.road[i]]) * 60; // 分/タイル（自由走行）
    if (s.rail?.[i] && !s.railGrade?.[i] && !(s.overpass && s.overpass.includes(i))) free[k] += P.crossingDelay[s.rail[i]] ?? 0; // 踏切で待つ（陸橋なら待たない）
    if (s.flyover && s.flyover.includes(i)) free[k] *= 0.7; // 立体交差は信号で止まらない
    for (let e = 0; e < 4; e++) { const nx = x + NEIGH[e][0], ny = y + NEIGH[e][1]; if (inMap(nx, ny)) adj[k * 4 + e] = nodeOf[idx(nx, ny)]; }
  }
  const info: RoadInfo = { conn, dist: new Map<number, Int16Array>(), reach: new Map(), n, nodes, nodeOf, adj, free, freeTrees: new Map() };
  infoCache.set(s, { ver, info });
  return info;
}

/** 道路タイル src から各道路タイルまでの経路長（タイル数）。届かなければ -1 */
export function distField(s: GameState, src: number): Int16Array {
  const info = roadInfo(s);
  let d = info.dist.get(src);
  if (d) return d;
  d = new Int16Array(N).fill(-1);
  if (src >= 0 && s.road[src]) {
    d[src] = 0;
    const q = [src];
    for (let h = 0; h < q.length; h++) {
      const i = q[h], x = tx(i), y = ty(i);
      for (const [dx, dy] of NEIGH) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const j = idx(nx, ny);
        if (s.road[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); }
      }
    }
  }
  info.dist.set(src, d);
  return d;
}

/** 最寄りの駅までの道路距離（区画）。駅が複数あれば一番近い駅 */
const stDistCache = new WeakMap<GameState, { ver: string; d: Int16Array | null }>();
export function stationDist(s: GameState): Int16Array | null {
  const st = s.buildings.filter(b => b.kind === 'station' && b.connected && b.acc >= 0);
  const ver = s.roadVersion + ':' + st.map(b => b.acc).join(',');
  const c = stDistCache.get(s);
  if (c && c.ver === ver) return c.d;
  let d: Int16Array | null = null;
  for (const b of st) { const f = distField(s, b.acc); if (!d) d = Int16Array.from(f); else for (let i = 0; i < d.length; i++) if (f[i] >= 0 && (d[i] < 0 || f[i] < d[i])) d[i] = f[i]; }
  stDistCache.set(s, { ver, d });
  return d;
}

/** 道路タイル src から道路距離 R 以内の道路タイルと距離（幅優先探索）。施設ごとに地図全体をたどらずに済む */
export function reach(s: GameState, src: number, R: number): { t: Int32Array; d: Int16Array } {
  const info = roadInfo(s), key = src + ':' + R;
  const c = info.reach.get(key);
  if (c) return c;
  const t: number[] = [], d: number[] = [];
  if (src >= 0 && s.road[src]) {
    const seen = new Map<number, number>([[src, 0]]); t.push(src); d.push(0);
    for (let h = 0; h < t.length; h++) {
      const i = t[h], dd = d[h]; if (dd >= R) continue;
      const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of NEIGH) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (!s.road[j] || seen.has(j)) continue; seen.set(j, dd + 1); t.push(j); d.push(dd + 1); }
    }
  }
  const out = { t: Int32Array.from(t), d: Int16Array.from(d) };
  info.reach.set(key, out);
  return out;
}

/** 区画 (x,y,w,h) に接する道路タイル。市外につながる道路を優先 */
export function accessTile(s: GameState, x: number, y: number, w: number, h: number, minRoad = 1): number {
  const info = roadInfo(s);
  let any = -1;
  const check = (cx: number, cy: number): number => {
    if (!inMap(cx, cy)) return -1;
    const i = idx(cx, cy);
    if (s.road[i] < minRoad) return -1;
    if (info.conn[i]) return i;
    if (any < 0) any = i;
    return -1;
  };
  for (let k = 0; k < w; k++) { const a = check(x + k, y + h); if (a >= 0) return a; }
  for (let k = 0; k < w; k++) { const a = check(x + k, y - 1); if (a >= 0) return a; }
  for (let k = 0; k < h; k++) { const a = check(x - 1, y + k); if (a >= 0) return a; }
  for (let k = 0; k < h; k++) { const a = check(x + w, y + k); if (a >= 0) return a; }
  if (ACCESS_R > 1 && any < 0) {
    // 近い順に周りを探す（細い道でつながっているとみなす）
    for (let r = 2; r <= ACCESS_R; r++) {
      let best = -1, bd = 1e9;
      for (let yy = y - r; yy < y + h + r; yy++) for (let xx = x - r; xx < x + w + r; xx++) {
        if (xx >= x - r + 1 && xx < x + w + r - 1 && yy >= y - r + 1 && yy < y + h + r - 1) continue;
        if (!inMap(xx, yy)) continue;
        const i = idx(xx, yy);
        if (s.road[i] < minRoad) continue;
        const d = (info.conn[i] ? 0 : 1000) + Math.abs(xx - (x + (w - 1) / 2)) + Math.abs(yy - (y + (h - 1) / 2));
        if (d < bd) { bd = d; best = i; }
      }
      if (best >= 0) return best;
    }
  }
  return any;
}

/** 政策と期限つき効果を合成した係数 */
/** 新幹線が停まっている（この駅、または市内のどこか） */
export function shinOpen(s: GameState, b?: Building): boolean { return (b ? [b] : s.buildings).some(o => o.kind === 'station' && o.shin !== undefined && s.month >= o.shin && o.status === 'operating'); }
/** ビジョンの特典（選んだビジョンと専用施設） */
const perkOn = new WeakMap<GameState, { k: string; on: boolean }>();
function visionPerk(s: GameState): { p: VisionPerk; kind: boolean } | null {
  const p = s.vision ? VISION_PERKS[s.vision] : undefined; if (!p) return null;
  const key = `${s.bVersion}:${s.month}:${s.buildings.length}`, c = perkOn.get(s);
  if (c && c.k === key) return { p, kind: c.on };
  const on = hasOp(s, p.kind); perkOn.set(s, { k: key, on }); return { p, kind: on };
}
export function modMul(s: GameState, key: string): number {
  let v = streetMul(s, key) * mayorMul(s, key) * optMul(s, key) * intlMul(s, key) * execMul(s, key);
  { const vp = visionPerk(s); if (vp) { v *= vp.p.mul[key] ?? 1; if (vp.kind) v *= vp.p.kindMul[key] ?? 1; } }
  for (const m of s.modifiers) if (m.key === key && m.op === 'mul') v *= m.v;
  for (const p of POLICIES) {
    const st = s.policies[p.id];
    if (!st || !st.on) continue;
    const f = Math.min(1, (s.month - st.since) / p.ramp);
    for (const e of p.effects) if (e.key === key && e.op === 'mul') v *= 1 + (e.v - 1) * f;
  }
  return v;
}
/**
 * v90：行政サービスへのアクセスと言語の支援（住民全体の指標。0〜1）。
 * - access：相談窓口・手続きの届きやすさ・多言語/やさしい日本語の情報・オンライン手続き
 * - lang：日本語学習の機会・通訳・学校での支援（1 - lang が「言語の壁」）
 * - reach：情報が届きにくい住民（高齢のひとり暮らし・障害のある人・転入したばかりの世帯・日本語に不慣れな人）に、
 *   医療・防災・福祉の情報と相談が届く割合
 * - retain：人手不足の職の採用と定着への倍率（外国人の働き手が多い街ほど、支援の差が効く）
 * 外国人住民の人数そのものは、どの値も悪くしない（人数は reach の重みにだけ入る）。
 */
export function accessOf(s: GameState, pop: number, foreignTotal: number, aging: number): { access: number; lang: number; reach: number; retain: number; hard: number } {
  const mc = hasOp(s, 'multicultural');
  const access = clamp(0.3 + (mc ? 0.25 : 0) + (hasOp(s, 'cityOS') ? 0.05 : 0) + (hasOp(s, 'dxCenter') ? 0.08 : 0) + modAdd(s, 'access'));
  const lang = clamp(0.15 + (mc ? 0.2 : 0) + 0.6 * modAdd(s, 'support') /* 日本語教室の政策（v89 までの鍵） */ + modAdd(s, 'lang') + (hasOp(s, 'intlSchool') || hasOp(s, 'foreignSchool') ? 0.05 : 0));
  const fShare = pop > 0 ? Math.min(0.3, foreignTotal / pop) : 0, oShare = clamp(aging * 0.5 + 0.06, 0, 0.5);
  const gapF = 1 - clamp(0.3 + 0.35 * access + 0.35 * lang), gapO = 1 - clamp(0.45 + 0.5 * access);
  const hard = fShare + oShare, reach = hard > 0 ? clamp(1 - (fShare * gapF + oShare * gapO) / hard) : 1;
  const retain = 1 + Math.min(1, fShare * 15) * 0.3 * (0.5 * access + 0.5 * lang - 0.25);
  const r2 = (v: number) => Math.round(v * 1000) / 1000;
  return { access: r2(access), lang: r2(lang), reach: r2(reach), retain: r2(retain), hard: r2(hard) };
}
export function modAdd(s: GameState, key: string): number {
  let v = streetAdd(s, key) + mayorAdd(s, key) + optAdd(s, key) + intlAdd(s, key) + execAdd(s, key) + routeAdd(s, key);
  { const vp = visionPerk(s); if (vp) { v += vp.p.add[key] ?? 0; if (vp.kind) v += vp.p.kindAdd[key] ?? 0; } }
  for (const m of s.modifiers) if (m.key === key && m.op === 'add') v += m.v;
  for (const p of POLICIES) {
    const st = s.policies[p.id];
    if (!st || !st.on) continue;
    const f = Math.min(1, (s.month - st.since) / p.ramp);
    for (const e of p.effects) if (e.key === key && e.op === 'add') v += e.v * f;
  }
  return v;
}

/** 道路の種類の効果：並木道は暮らしの満足と空気、石畳は来訪者と高齢者の歩きやすさ、無電柱化は災害の被害と景観（区間の数で頭打ち） */
const stN = (s: GameState, k: 'tree' | 'stone' | 'nopole' | 'charge', cap: number) => Math.min(1, ((s.streets?.[k]?.length ?? 0) + (k === 'nopole' ? 15 * countOp(s, 'kyodoko') : 0)) / cap); // v87：共同溝 1 か所は無電柱化 15 区間ぶん（周り 240m の電線を地下に入れる）
function streetAdd(s: GameState, key: string): number {
  if (key === 'safety') return threatSafety(s); // 暴力団・詐欺・過激派・テロの脅威（v42）
  if (!s.streets && !hasOp(s, 'kyodoko')) return 0;
  if (key === 'sat:all') return 0.006 * stN(s, 'tree', 80) + 0.003 * stN(s, 'nopole', 60);
  if (key === 'sat:4') return 0.004 * stN(s, 'stone', 40) + (hasOp(s, 'droneHub') ? 0.006 : 0);
  if (key === 'fame') return 2 * stN(s, 'stone', 40) + 1.5 * stN(s, 'nopole', 60) + 3 * stN(s, 'charge', 40);
  if (key === 'sat:1') return 0.004 * stN(s, 'charge', 40);
  return 0;
}
function streetMul(s: GameState, key: string): number {
  // 次世代の都市の要素（v44）
  if (key === 'peakTrips') return (1 - 0.05 * Math.min(3, countOp(s, 'mobilityHub')) / 3 * 1) * (hasOp(s, 'logiTunnel') ? 0.9 : 1) * (s.streets ? streetMul0(s, key) : 1);
  if (key === 'powerCap') return hasOp(s, 'gridBattery') ? 1.06 : 1;
  if (key === 'econ') return hasOp(s, 'logiTunnel') ? 1.01 : 1;
  if (!s.streets && !hasOp(s, 'kyodoko')) return 1;
  return streetMul0(s, key);
}
function streetMul0(s: GameState, key: string): number {
  if (!s.streets && !hasOp(s, 'kyodoko')) return 1;
  if (key === 'visitors') return 1 + 0.05 * stN(s, 'stone', 40);
  if (key === 'econ') return 1 + 0.008 * stN(s, 'charge', 40); // 物流の EV トラックが止まらずに走れる
  if (key === 'disasterDmg') return 1 - 0.12 * stN(s, 'nopole', 60);
  return 1;
}
export const sumHH = (b: Building) => (b.hh ? b.hh[0] + b.hh[1] + b.hh[2] + b.hh[3] + b.hh[4] : 0);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
/** 区画の一覧の周り R 区画に印をつける */
function mark0(list: number[] | undefined, R: number, out: Uint8Array): void { for (const c of list ?? []) { const cx = c % W, cy = (c / W) | 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (inMap(cx + dx, cy + dy)) out[idx(cx + dx, cy + dy)] = 1; } }

export function condFactor(age: number): number {
  return age < 60 ? 1 : Math.max(0.5, 1 - (age - 60) / 80);
}

/** 長く遊んだセーブの数値のはみ出しを直す（職員数が上限を超えたままなど）。直しても街の中身は変わらない */
export function repairState(s: GameState): void {
  // 道路・建物と重なってしまった付帯物を外す（古い版の不具合で混じったデータでも、操作が止まらないように）
  const uniqF = (v: number[] | undefined, ok: (i: number) => boolean) => (Array.isArray(v) ? [...new Set(v)].filter(i => Number.isInteger(i) && i >= 0 && i < s.road.length && ok(i)) : v);
  if (Array.isArray(s.levee)) s.levee = uniqF(s.levee, i => !s.road[i] && !s.occ[i]);
  if (Array.isArray(s.busStops)) s.busStops = uniqF(s.busStops, i => !!s.road[i]);
  if (s.railKind !== undefined) { if (!Array.isArray(s.railKind) || s.railKind.length !== W * H) s.railKind = undefined; else for (let i = 0; i < W * H; i++) { const v = s.railKind[i]; if (!s.rail?.[i] || !(v === 1 || v === 2)) s.railKind[i] = 0; } }
  if (s.streets && typeof s.streets === 'object') for (const k of ['tree', 'stone', 'nopole', 'charge'] as const) { const v = (s.streets as any)[k]; if (v !== undefined) (s.streets as any)[k] = Array.isArray(v) ? uniqF(v, i => !!s.road[i]) : []; } else if (s.streets !== undefined) s.streets = {};
  if (Array.isArray(s.footbridge)) s.footbridge = uniqF(s.footbridge, i => !!s.road[i]);
  if (Array.isArray(s.overpass)) s.overpass = uniqF(s.overpass, i => !!s.road[i] && !!s.rail?.[i]);
  if (Array.isArray(s.wide)) s.wide = uniqF(s.wide, i => s.road[i] === 2);
  if (Array.isArray(s.flyover)) s.flyover = uniqF(s.flyover, i => !!s.road[i]);
  if (s.fiscal) { s.fiscal.kosai = Math.min(100, Math.max(0, Number.isFinite(s.fiscal.kosai) ? s.fiscal.kosai : 0)); s.fiscal.shorai = Math.min(1000, Math.max(0, Number.isFinite(s.fiscal.shorai) ? s.fiscal.shorai : 0)); }
  for (const b of s.buildings) {
    const d = DEFS[b.kind];
    if (!d.staffReq) continue;
    const max = d.staffReq * 9;
    if (typeof b.staff === 'number' && Number.isFinite(b.staff) && b.staff > max) b.staff = max; // 数でないものは直さない（保存データの改ざんは検査で弾く）
    const tmax = Math.round(d.staffReq * 1.7 * 1.2);
    if (typeof b.staffTarget === 'number' && Number.isInteger(b.staffTarget) && b.staffTarget > tmax) b.staffTarget = tmax;
  }
}
/** 設計容量（私立園の定員拡大などを含む） */
export function designCap(s: GameState, b: Building): number {
  const d = DEFS[b.kind];
  const base = d.capacity * LV_CAP[lvOf(b) - 1] * (d.capacity > 1 ? optCap(b) : 1);
  // 私立園の定員拡大は、元の定員の 3 倍まで（長く遊ぶと拡大が積み重なり、職員数が際限なく増えるのを防ぐ）
  return b.kind === 'privNursery' ? Math.min(base * 3, base + modAdd(s, 'privCap') + modAdd(s, 'privCap:' + b.id)) : base; // privCap は旧形式（全園）
}
export function staffReq(s: GameState, b: Building): number {
  const d = DEFS[b.kind];
  if (!d.staffReq) return 0;
  return d.staffReq * (designCap(s, b) / d.capacity);
}

// ---- 最短経路（詰めたグラフ上のヒープつきダイクストラ）----
let heap = new Int32Array(4096), hk = new Float64Array(4096);
function dijkstra(G: RoadInfo, src: number | number[], cost: Float64Array, out: Tree): Tree {
  const n = G.n, adj = G.adj, d = out.d, par = out.p;
  for (let k = 0; k < n; k++) { d[k] = Infinity; par[k] = -1; }
  const srcs = typeof src === 'number' ? (src < 0 ? [] : [src]) : src;
  if (!srcs.length) return out;
  if (heap.length < n * 4) { heap = new Int32Array(n * 4); hk = new Float64Array(n * 4); }
  let m = 0;
  for (const q of srcs) { d[q] = 0; heap[m] = q; hk[m++] = 0; } // 距離 0 が並ぶだけなのでヒープ条件は保たれる
  while (m > 0) {
    const i = heap[0], k = hk[0]; m--;
    if (m > 0) {
      heap[0] = heap[m]; hk[0] = hk[m]; let c = 0;
      for (;;) { const l = c * 2 + 1, r = l + 1; let q = c; if (l < m && hk[l] < hk[q]) q = l; if (r < m && hk[r] < hk[q]) q = r; if (q === c) break; const ti = heap[q], tk = hk[q]; heap[q] = heap[c]; hk[q] = hk[c]; heap[c] = ti; hk[c] = tk; c = q; }
    }
    if (k > d[i]) continue;
    for (let e = 0; e < 4; e++) {
      const j = adj[i * 4 + e];
      if (j < 0) continue;
      const nd = k + cost[j];
      if (nd < d[j]) {
        d[j] = nd; par[j] = i;
        let c = m++; heap[c] = j; hk[c] = nd;
        while (c > 0) { const pp = (c - 1) >> 1; if (hk[pp] <= hk[c]) break; const ti = heap[pp], tk = hk[pp]; heap[pp] = heap[c]; hk[pp] = hk[c]; heap[c] = ti; hk[c] = tk; c = pp; }
      }
    }
  }
  return out;
}
const pool: Tree[] = [];
let poolN = 0;
function tmpTree(n: number): Tree {
  let t = pool[poolN];
  if (!t || t.d.length < n) t = pool[poolN] = { d: new Float64Array(n + 64), p: new Int32Array(n + 64) };
  poolN++;
  return t;
}
/** 自由走行時の最短時間ツリー（道路が変わるまで使い回す） */
function freeTree(G: RoadInfo, tile: number, srcs?: number[]): Tree {
  let t = G.freeTrees.get(tile);
  if (!t) { t = dijkstra(G, srcs ?? (tile >= 0 ? G.nodeOf[tile] : -1), G.free, { d: new Float64Array(G.n), p: new Int32Array(G.n) }); G.freeTrees.set(tile, t); }
  return t;
}

/** 6 車線・立体交差による容量の倍率 */
export function laneMul(s: GameState, i: number): number { return (s.wide && s.road[i] === 2 && s.wide.includes(i) ? P.wideCap : 1) * (s.flyover && s.flyover.includes(i) ? 1.8 : 1); }
/** v21：立体駐車場の近く（240m 以内）は路上駐車が減り、道路の容量が少し増える */
const PT_CACHE = new WeakMap<GameState, { v: number; n: number; m: number; xs: number[] }>();
function nearParkingTower(s: GameState, i: number): boolean {
  let c = PT_CACHE.get(s);
  if (!c || c.v !== s.bVersion || c.n !== s.buildings.length || c.m !== s.month) { const xs: number[] = []; for (const b of s.buildings) if ((b.kind === 'parkingTower' || b.kind === 'ugParking') && b.status === 'operating') xs.push(b.x + (b.kind === 'ugParking' ? 1 : 0), b.y + (b.kind === 'ugParking' ? 1 : 0), b.kind === 'ugParking' ? 10 : 8); /* v87：地下駐車場（800 台）は 300m */ c = { v: s.bVersion, n: s.buildings.length, m: s.month, xs }; PT_CACHE.set(s, c); }
  if (!c.xs.length) return false;
  const x = i % W, y = (i / W) | 0;
  for (let k = 0; k < c.xs.length; k += 3) if (Math.abs(c.xs[k] + 0.5 - x) <= c.xs[k + 2] && Math.abs(c.xs[k + 1] + 0.5 - y) <= c.xs[k + 2]) return true;
  return false;
}
export function roadCapacity(s: GameState, i: number): number {
  const t = s.road[i];
  return P.roadCap[t] * (s.roadAge[i] > 70 ? 0.85 : 1) * (s.roadBoost[i] ?? 1) * (t !== 3 && hasOp(s, 'smartSignal') ? 1.1 : 1) * laneMul(s, i) * (t !== 3 && nearParkingTower(s, i) ? 1.08 : 1);
}

export function emptyStats(): Stats {
  return {
    powerDemand: 0, powerCap: 0, sewageDemand: 0, sewageCap: 0, gasDemand: 0, gasCap: 0, jhsKids: 0, jhsCap: 0, elderNeed: 0, elderCap: 0,
    lv: [1, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 0.5], visitors: 0, fame: 0, bizJobs: 0, shelterCap: 0, floodHH: 0, crime: 0,
    pop: 0, households: 0, units: 0, vacancy: 0, pentUp: 0, hhByType: [0, 0, 0, 0, 0], popDistrict: DISTRICTS.map(() => 0),
    workers: 0, localJobs: 0, preschool: 0, careDemand: 0, careCap: 0, careServed: 0, waitlist: 0, waitDistrict: DISTRICTS.map(() => 0),
    schoolKids: 0, schoolCap: 0, waterDemand: 0, waterCap: 0, wasteDemand: 0, wasteCap: 0, fireCover: 1,
    maxVc: 0, avgDelay: 1, shops: 0, shopLevel: 0, sat: 0, satType: [0, 0, 0, 0, 0], satDistrict: DISTRICTS.map(() => 0), satParts: new Array(14).fill(0), satDrag: new Array(14).fill(0), renewal60: 0, debt: 0,
  };
}

/** 空気の汚れ（区画ごと 0〜2 程度）。道路の交通量と、工場などの排出を周りへぼかして広げ、緑で減らす */
function pollution(s: GameState, B: Building[], G: RoadInfo, load: Float64Array): Float32Array {
  const m = getMap(s.seed), e = new Float32Array(N);
  const ev = 1 - 0.04 * Math.min(3, countOp(s, 'evStation')); // 電気自動車が増えると排気が減る
  for (let k = 0; k < G.n; k++) { const i = G.nodes[k]; e[i] += load[k] / 1600 * 3 * ev; }
  const compostOn = s.buildings.some(b => b.kind === 'compost' && b.status === 'operating');
  for (const b of B) {
    const d = DEFS[b.kind]; if (!d.pollution || b.status === 'construction') continue;
    const v = d.pollution * (b.status === 'operating' ? 1 : 0.4) * modMul(s, 'factoryClean') * (LIVESTOCK.has(b.kind) && compostOn ? 0.6 : 1); // 堆肥センターが家畜のふんを引き取ると、においが減る
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) e[idx(b.x + dx, b.y + dy)] += v;
  }
  const green = new Float32Array(N);
  for (let i = 0; i < N; i++) if (m.forest[i] || (m.park && m.park[i])) green[i] = 1;
  for (const b of B) { const gv = DEFS[b.kind].green ?? (fam(b.kind) === 'park' ? 1 : 0); if (gv && b.status === 'operating') for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) green[idx(b.x + dx, b.y + dy)] = Math.max(green[idx(b.x + dx, b.y + dy)], gv); }
  const blur = (a: Float32Array, r: number) => {
    const t = new Float32Array(N);
    for (let y = 0; y < H; y++) { let acc = 0; for (let x = -r; x < W + r; x++) { if (x + r < W && x + r >= 0) acc += a[y * W + x + r]; if (x - r - 1 >= 0 && x - r - 1 < W) acc -= a[y * W + x - r - 1]; if (x >= 0 && x < W) t[y * W + x] = acc / (2 * r + 1); } }
    const o = new Float32Array(N);
    for (let x = 0; x < W; x++) { let acc = 0; for (let y = -r; y < H + r; y++) { if (y + r < H && y + r >= 0) acc += t[(y + r) * W + x]; if (y - r - 1 >= 0 && y - r - 1 < H) acc -= t[(y - r - 1) * W + x]; if (y >= 0 && y < H) o[y * W + x] = acc / (2 * r + 1); } }
    return o;
  };
  const p1 = blur(blur(e, 2), 2), g1 = blur(green, 3);
  for (let i = 0; i < N; i++) p1[i] = Math.max(0, p1[i] * 4.5 - 0.25 * g1[i]);
  return p1;
}
/** 水がめの貯水率から、浄水場が送れる水の割合（4 割を切ると給水制限、1 割を切ると断水に近い） */
export const storeFactor = (st: number) => (st >= 0.4 ? 1 : 0.55 + st * 1.125);
/** 迷惑施設の近さ（区画ごと 0〜1 程度）。ごみ・工場・空港・火葬場・発電所・刑務所などから、届く範囲の中で近いほど強い */
export function nimbyField(s: GameState): Float32Array {
  const f = new Float32Array(N), nbK = modMul(s, 'nimby');
  for (const b of s.buildings) {
    const nb = NIMBY[b.kind]; if (!nb || b.status === 'suspended') continue;
    const [v, R0] = nb, k = b.status === 'construction' ? 0.6 : 1; // 工事中から反対の声
    const R = Math.max(1, Math.round(R0 * nbK)); // v90：緩衝緑地の条件づけで届く範囲が狭まる
    for (let y = b.y - R; y < b.y + b.h + R; y++) for (let x = b.x - R; x < b.x + b.w + R; x++) {
      if (!inMap(x, y)) continue;
      const dx = Math.max(b.x - x, 0, x - (b.x + b.w - 1)), dy = Math.max(b.y - y, 0, y - (b.y + b.h - 1)), d = Math.max(dx, dy);
      if (d === 0) continue;
      const i = idx(x, y); f[i] = Math.max(f[i], v * k * (1 - (d - 1) / R));
    }
  }
  return f;
}
/** 浸水のおそれのある区画（川・水面から 2 区画以内で、近くの水面より 3m 以上高くない所）。地形だけで決まる */
const floodCache = new WeakMap<object, Uint8Array>();
export function floodRisk(s: GameState): Uint8Array {
  const m = getMap(s.seed), key = m;
  let f = floodCache.get(key);
  if (f) return f;
  f = new Uint8Array(N);
  const hc = (i: number) => (m.heights[((i / W) | 0) * (W + 1) + (i % W)] ?? 0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); if (m.water[i]) continue;
    let wh = Infinity;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const nx = x + dx, ny = y + dy; if (inMap(nx, ny) && m.water[idx(nx, ny)]) wh = Math.min(wh, hc(idx(nx, ny))); }
    if (wh !== Infinity && hc(i) <= wh + 3) f[i] = 1;
  }
  floodCache.set(key, f);
  return f;
}

export function recompute(s: GameState, lite = false): void {
  syncTerrain(s);
  const m = getMap(s.seed);
  const info = roadInfo(s);
  const B = s.buildings;
  const st = emptyStats();
  st.pentUp = s.stats ? s.stats.pentUp : 0;
  st.deaths = s.stats?.deaths ?? 0; st.births = s.stats?.births ?? 0; if (s.stats?.obstetric !== undefined) st.obstetric = s.stats.obstetric; // 月次処理で数える（再計算では引き継ぐ）

  // 1. 道路接続
  for (const b of B) {
    b.acc = accessTile(s, b.x, b.y, b.w, b.h);
    b.connected = b.acc >= 0 && !!info.conn[b.acc];
  }
  // まちづくり版の線路：地図の端の線路から、線路でたどれる区画だけが市外とつながる
  let railNet: Uint8Array | null = null;
  if (s.rail) {
    railNet = new Uint8Array(N); const q: number[] = [];
    for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (s.rail[i] && (x === 0 || y === 0 || x === W - 1 || y === H - 1)) { railNet[i] = 1; q.push(i); } }
    while (q.length) { const i = q.pop()!; for (const j of railNbrs(k => s.rail![k] > 0, i)) if (!railNet[j]) { railNet[j] = 1; q.push(j); } }
  }
  /** 駅に面した、市外とつながる線路の水準（0 なし・1 単線・2 複線）。線路のない地図では 2 */
  const railLv = (b: Building) => {
    if (!s.rail || !railNet) return 2;
    let lv = 0;
    for (let dy = -1; dy <= b.h; dy++) for (let dx = -1; dx <= b.w; dx++) {
      const x = b.x + dx, y = b.y + dy; if (!inMap(x, y)) continue;
      const i = idx(x, y);
      if (dx >= 0 && dx < b.w && dy >= 0 && dy < b.h && s.railGrade?.[i] !== 2) continue; // 敷地の下は地下の線路だけ
      if (railNet[i]) lv = Math.max(lv, s.rail[i]);
    }
    return lv;
  };
  const stationsOk = B.filter(b => b.kind === 'station' && b.connected && (!s.rail || (b.status === 'operating' && railLv(b) > 0)));
  const station = (s.rail ? stationsOk[0] : undefined) ?? B.find(b => b.kind === 'station' && b.connected) ?? B.find(b => b.kind === 'station');
  const stationOk = s.rail ? stationsOk.length > 0 : !!station && station.connected;

  // 2. 施設の実効容量 = 設計容量 × 職員充足率 × 老朽係数 × 更新中係数（未接続は 0）
  for (const b of B) {
    const d = DEFS[b.kind];
    b.used = 0;
    if (!d.capacity) { b.effCap = 0; continue; }
    if ((b.status !== 'operating' && b.status !== 'renewing') || !b.connected) { b.effCap = 0; continue; }
    const req = staffReq(s, b);
    const staff = (b.staff ?? 0) + modAdd(s, 'tempStaff:' + b.id);
    const sr = req > 0 ? Math.min(1, staff / req) : 1;
    const ren = b.status === 'renewing' ? d.renewFactor : 1;
    b.effCap = Math.max(0, designCap(s, b) * sr * condFactor(b.age) * ren);
  }

  const res = B.filter(b => isRes(b.kind) && b.status === 'operating');
  const nRes = res.length;

  // 住宅を、つながっている道路タイルごとに引けるようにする（施設の利用圏を道路網でたどるため）
  const resAt = new Map<number, number[]>();
  res.forEach((r, ri) => { if (!r.connected) return; let a = resAt.get(r.acc); if (!a) resAt.set(r.acc, (a = [])); a.push(ri); });
  const each = (src: number, R: number, f: (ri: number, d: number) => void) => {
    const rc = reach(s, src, Math.ceil(R));
    for (let k = 0; k < rc.t.length; k++) { const a = resAt.get(rc.t[k]); if (a) for (const ri of a) f(ri, rc.d[k]); }
  };
  const hhOf = new Float64Array(nRes);
  res.forEach((r, ri) => { hhOf[ri] = sumHH(r); });

  // 3. 保育：需要 = 未就学児 × 利用希望率。道路網で近い組み合わせから実効定員を割り当てる
  const useRate = P.careUseRate;
  const need = new Float64Array(nRes), served = new Float64Array(nRes);
  const nurs = B.filter(b => (fam(b.kind) === 'care' || b.kind === 'privNursery') && b.effCap > 0);
  const capLeft = nurs.map(n => n.effCap);
  const pairs: number[][] = [];
  res.forEach((r, ri) => {
    const hh = r.hh!;
    let kids = 0;
    for (let t = 0; t < NHH; t++) kids += hh[t] * P.preschool[t];
    st.preschool += kids;
    need[ri] = kids * useRate;
    r.unmet = 0;
  });
  nurs.forEach((n, ni) => each(n.acc, P.careRange, (ri, d) => pairs.push([d, ri, ni])));
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [, ri, ni] of pairs) {
    const want = need[ri] - served[ri];
    if (want <= 1e-9 || capLeft[ni] <= 1e-9) continue;
    const take = Math.min(want, capLeft[ni]);
    served[ri] += take; capLeft[ni] -= take;
  }
  nurs.forEach((n, ni) => { n.used = n.effCap - capLeft[ni]; st.careCap += n.effCap; });

  // 4. 学校：通学圏内の最寄り校に全員が通う。定員超過は過密として水準が下がる
  const schools = B.filter(b => fam(b.kind) === 'school' && b.effCap > 0);
  const schoolOf = new Int32Array(nRes).fill(-1), schoolD = new Float64Array(nRes).fill(1e9), kidsOf = new Float64Array(nRes);
  const enroll = schools.map(() => 0);
  res.forEach((r, ri) => {
    let kids = 0;
    for (let t = 0; t < NHH; t++) kids += r.hh![t] * P.schoolKids[t];
    st.schoolKids += kids; kidsOf[ri] = kids;
  });
  schools.forEach((sc, si) => each(sc.acc, P.schoolRange, (ri, d) => { if (d < schoolD[ri]) { schoolD[ri] = d; schoolOf[ri] = si; } }));
  for (let ri = 0; ri < nRes; ri++) if (schoolOf[ri] >= 0) enroll[schoolOf[ri]] += kidsOf[ri];
  schools.forEach((sc, si) => { sc.used = enroll[si]; st.schoolCap += sc.effCap; });

  // 5. 公園・消防：道路網上の距離で判定
  const parks = B.filter(b => fam(b.kind) === 'park' && b.effCap > 0);
  const fires = B.filter(b => fam(b.kind) === 'fire' && b.effCap > 0);
  const fireRange = modMul(s, 'fireRange');
  const parkLv = new Float64Array(nRes), fireLv = new Float64Array(nRes);
  res.forEach((r, ri) => { fireLv[ri] = r.connected ? 0.2 : 0; });
  parks.forEach(p => { const R = reachOf(p, P.parkRange); each(p.acc, R * 2, (ri, dd) => {
    const lv = (dd <= R ? 1 : 1 - (dd - R) / R) * Math.min(1, p.effCap / designCap(s, p));
    if (lv > parkLv[ri]) parkLv[ri] = lv;
    if (dd <= R) p.used += hhOf[ri] / Math.max(1, parks.length);
  }); });
  fires.forEach(f => {
    const R = f.effCap * fireRange;
    each(f.acc, R * 1.5, (ri, dd) => { const lv = dd <= R ? 1 : dd <= R * 1.5 ? 1 - 0.8 * (dd - R) / (R * 0.5) : 0.2; if (lv > fireLv[ri]) fireLv[ri] = lv; });
  });

  // 6. ライフライン（電力・上水・下水・ガス・ごみ）：市全体の能力と需要（世帯相当）。市外からまかなう分（base）を足す
  let hhConnected = 0;
  for (const r of res) if (r.connected) hhConnected += sumHH(r);
  const shopsOp = B.filter(b => isShop(b.kind) && b.status === 'operating' && b.connected);
  const others = B.filter(b => !isRes(b.kind) && !isShop(b.kind) && b.status === 'operating' && b.connected);
  let bizUse = 0; for (const b of others) bizUse += DEFS[b.kind].use ?? 0;
  st.waterDemand = hhConnected + shopsOp.length * 5 + bizUse * 0.25;
  st.sewageDemand = st.waterDemand;
  st.powerDemand = hhConnected + shopsOp.length * 3 + bizUse;
  st.gasDemand = hhConnected + shopsOp.length * 2;
  if (s.base) {
    if (s.base.power < 0) s.base.power = Math.round(st.powerDemand * P.baseMargin / 100) * 100;
    if (s.base.sewage < 0) s.base.sewage = Math.round(st.sewageDemand * P.baseMargin / 100) * 100;
    if (s.base.gas < 0) s.base.gas = Math.round(st.gasDemand * P.baseMargin / 100) * 100;
    if (s.base.telecom === undefined || s.base.telecom < 0) s.base.telecom = Math.round((hhConnected + shopsOp.length * 2 + bizUse * 0.6) * P.baseMargin / 100) * 100; // 通信（v42）：はじめは足りている
  }
  st.telDemand = hhConnected + shopsOp.length * 2 + bizUse * 0.6 + (s.month > 0 ? 0 : 0); st.telCap = s.base?.telecom ?? 1e9;
  st.powerCap = (s.base?.power ?? 1e9) + modAdd(s, 'powerCap'); st.sewageCap = (s.base?.sewage ?? 1e9); st.gasCap = (s.base?.gas ?? 1e9);
  for (const b of B) {
    const f = fam(b.kind);
    if (f === 'water') { if (b.kind !== 'desalination') st.waterCap += b.effCap * modMul(s, 'waterCap'); }
    else if (f === 'waste') { st.wasteCap += b.effCap; if (b.effCap > 0 && DEFS[b.kind].gen) st.powerCap += DEFS[b.kind].gen! * b.effCap / designCap(s, b); }
    else if (f === 'sewage') st.sewageCap += b.effCap;
    else if (f === 'power') st.powerCap += b.effCap;
    else if (f === 'gas') st.gasCap += b.effCap;
    else if (f === 'telecom' && b.status === 'operating') st.telCap! += DEFS[b.kind].capacity ?? 0;
  }
  // 通信は 1 人あたりの使う量が年々増える（動画・在宅勤務）。年 3% ほど
  st.telDemand! *= 1 + 0.03 * Math.min(30, s.month / 12);
  st.powerCap *= modMul(s, 'powerCap');
  // 雨が少なく水がめ（ダム・川）の水が減ると、浄水場があっても送れる水が減る（給水制限・断水）
  st.waterCap *= storeFactor(s.climate?.store ?? 1);
  for (const b of B) if (b.kind === 'desalination') st.waterCap += b.effCap; // 海水淡水化は、雨が少なくても水を送れる
  st.wasteCap += modAdd(s, 'wasteCap');
  st.wasteDemand = (hhConnected + bizUse * 0.15) * modMul(s, 'wasteDemand') * (1 - 0.1 * Math.min(2, countOp(s, 'recycleCenter')));
  const waterLv = st.waterDemand > 0 ? Math.min(1, st.waterCap / st.waterDemand) : 1;
  const wasteLv = st.wasteDemand > 0 ? Math.min(1, st.wasteCap / st.wasteDemand) : 1;
  const powerLv = st.powerDemand > 0 ? Math.min(1, st.powerCap / st.powerDemand) : 1;
  const sewageLv = st.sewageDemand > 0 ? Math.min(1, st.sewageCap / st.sewageDemand) : 1;
  const gasLv = st.gasDemand > 0 ? Math.min(1, st.gasCap / st.gasDemand) : 1;
  const telLv = st.telDemand! > 0 ? Math.min(1, st.telCap! / st.telDemand!) : 1;
  const lifeLv = clamp((waterLv * waterLv * 0.35 + sewageLv * 0.2 + powerLv * powerLv * 0.25 + gasLv * 0.08 + wasteLv * 0.12) * (0.9 + 0.1 * telLv));

  // 6b. 中学校・医療・治安・文化・福祉・防災：施設からの道路距離で届く範囲（近いほど 1、範囲の 1.6 倍で 0）
  const cover = (list: Building[], R: (b: Building) => number, w: (b: Building) => number, out: Float64Array, sum: boolean) => {
    for (const b of list) {
      if (b.effCap <= 0 && DEFS[b.kind].capacity) continue;
      if (b.status !== 'operating' && b.status !== 'renewing') continue;
      if (!b.connected) continue;
      const r = R(b), wb = w(b);
      each(b.acc, r * 1.6, (ri, d) => { const v = (d <= r ? 1 : 1 - (d - r) / (r * 0.6)) * wb; if (sum) out[ri] += v; else if (v > out[ri]) out[ri] = v; });
    }
  };
  const ofFam = (f: Fam) => B.filter(b => fam(b.kind) === f);
  // 中学校（学校と同じく、最寄り校に通う）
  const jhs = ofFam('jhs').filter(b => b.effCap > 0);
  const jhsOf = new Int32Array(nRes).fill(-1), jhsD = new Float64Array(nRes).fill(1e9), jkOf = new Float64Array(nRes), jEnroll = jhs.map(() => 0);
  res.forEach((r, ri) => { let k = 0; for (let t = 0; t < NHH; t++) k += r.hh![t] * P.jhsKids[t]; st.jhsKids += k; jkOf[ri] = k; });
  jhs.forEach((sc, si) => each(sc.acc, P.jhsRange, (ri, d) => { if (d < jhsD[ri]) { jhsD[ri] = d; jhsOf[ri] = si; } }));
  for (let ri = 0; ri < nRes; ri++) if (jhsOf[ri] >= 0) jEnroll[jhsOf[ri]] += jkOf[ri];
  jhs.forEach((sc, si) => { sc.used = jEnroll[si]; st.jhsCap += sc.effCap; });
  // 医療（診療所・市民病院、消防本部の救急）
  const healthCov = new Float64Array(nRes), safetyCov = new Float64Array(nRes), cultCov = new Float64Array(nRes), libCov = new Float64Array(nRes), careCov = new Float64Array(nRes), emerg = new Float64Array(nRes);
  const health = ofFam('health'), safety = ofFam('safety');
  cover(health, b => reachOf(b, 25), b => (b.kind === 'hospital' || b.kind === 'univHospital' ? 1 : 0.7), healthCov, true);
  cover(B.filter(b => b.kind === 'fireL' || b.kind === 'hospital' || b.kind === 'univHospital' || b.kind === 'nightClinic' || b.kind === 'perinatal' || b.kind === 'heliport'), b => (b.kind === 'hospital' ? 80 : b.kind === 'univHospital' ? 150 : b.kind === 'nightClinic' ? 60 : b.kind === 'perinatal' ? 120 : b.kind === 'heliport' ? 220 : b.effCap), b => (b.kind === 'nightClinic' ? 0.7 : b.kind === 'heliport' ? 0.8 : 1), emerg, false); // ドクターヘリは遠くまで届く
  cover([...safety, ...B.filter(b => b.kind === 'court')], b => reachOf(b, b.kind === 'court' ? 40 : 22), b => (b.kind === 'police' ? 0.7 : b.kind === 'court' ? 0.25 : 0.8), safetyCov, true);
  // v87：法務省の施設は fam を gov にして交番のようには効かせず、検察庁（裁判所があると強め）と保護観察所だけ控えめに治安の満足を足す
  cover(B.filter(b => b.kind === 'kensatsu' || b.kind === 'hogoKansatsu'), () => 40, b => (b.kind === 'kensatsu' ? (hasOp(s, 'court') ? 0.2 : 0.1) : 0.12), safetyCov, true);
  const CULT: Partial<Record<string, number>> = { ancientRuins: 0.14, dome: 0.2, liveHouse: 0.08, fitness: 0.1, ropeway: 0.06, libraryS: 0.12, library: 0.22, gym: 0.18, hall: 0.2, museum: 0.18, stadium: 0.15, tower: 0.08, parkL: 0.12, highschool: 0.05, convention: 0.1, arena: 0.18, aquarium: 0.15, zoo: 0.15, cinema: 0.1, onsen: 0.06, university: 0.12, forestPark: 0.1, camp: 0.06, golf: 0.04, allotment: 0.05, mall: 0.05, biotope: 0.04, flowerPark: 0.08, beach: 0.08, tourFarm: 0.04, shrine: 0.04, temple: 0.06, grandShrine: 0.12, church: 0.04, castle: 0.18, castleRuins: 0.1, observatory: 0.08, botanical: 0.12, operaHouse: 0.22, ferrisWheel: 0.04, racecourse: 0.04, lighthouse: 0.03, jidokan: 0.14, kidsPark: 0.08, amusementPark: 0.1, megaPark: 0.15, pool: 0.1, athletics: 0.12, rugby: 0.08, japaneseGarden: 0.12, giantRobot: 0.06, esportsArena: 0.06, musicArena: 0.1, weddingHall: 0.03, outletMall: 0.04, skiResort: 0.05, casino: 0.05, kodomoMirai: 0.15, ecoCenter: 0.08 };
  cover(B.filter(b => CULT[b.kind] !== undefined), b => reachOf(b, 40), b => CULT[b.kind]! * lvK(b), cultCov, true);
  // 路面電車・LRT：車両基地から範囲内の世帯
  const lrtCov = new Float64Array(nRes);
  cover(B.filter(b => b.kind === 'lrt'), b => (DEFS[b.kind].reach ?? 80) * (b.lv === 3 ? 1.5 : b.lv === 2 ? 1.25 : 1), () => 1, lrtCov, false);
  cover(ofFam('library'), b => reachOf(b, 30), b => (b.kind === 'library' ? 1 : 0.6), libCov, false);
  cover(B.filter(b => b.kind === 'carePlaza' || b.kind === 'nurseryL' || b.kind === 'branchOffice' || b.kind === 'onsen' || b.kind === 'postOffice'), b => DEFS[b.kind].reach ?? (b.kind === 'onsen' ? 60 : 30), b => (b.kind === 'carePlaza' ? 1 : b.kind === 'branchOffice' ? 0.6 : b.kind === 'onsen' ? 0.35 : b.kind === 'postOffice' ? 0.25 : 0.3), careCov, false); // 郵便局は見守り・年金の受け取りの窓口
  const popNow = res.reduce((a, r) => { let p = 0; for (let t = 0; t < NHH; t++) p += r.hh![t] * P.persons[t]; return a + p; }, 0);
  const capSum = (list: Building[]) => list.reduce((a, b) => a + (b.status === 'operating' || b.status === 'renewing' ? (DEFS[b.kind].capacity ? b.effCap || (isCity(b.kind) ? 0 : designCap(s, b)) : 0) : 0), 0);
  const hasHosp = B.some(b => (b.kind === 'hospital' || b.kind === 'univHospital') && b.status === 'operating' && b.connected);
  const hasPolice = B.some(b => b.kind === 'police' && b.status === 'operating' && b.connected);
  const healthRatio = popNow > 0 ? Math.min(1, capSum(health) / popNow) : 1, safetyRatio = popNow > 0 ? Math.min(1, capSum(safety) / popNow) : 1;
  // 福祉：入所が必要な高齢者と、特別養護老人ホームの定員
  for (const r of res) st.elderNeed += r.hh![4] * P.elderNeedRate;
  st.elderCap = capSum(ofFam('welfare').filter(b => b.kind === 'elderly'));
  const elderRatio = st.elderNeed > 0 ? Math.min(1, st.elderCap / st.elderNeed) : 1;
  // 防災：避難所（学校・中学校・体育館・総合公園）と備蓄
  for (const b of B) if (b.status === 'operating' && b.connected) { const k = b.kind; st.shelterCap += k === 'shelter' || k === 'tsunamiTower' ? b.effCap : fam(k) === 'school' || fam(k) === 'jhs' ? 600 : k === 'gym' ? 800 : k === 'parkL' ? 1500 : k === 'highschool' ? 700 : k === 'arena' ? 2500 : k === 'convention' ? 2000 : k === 'cityHall' ? 400 : k === 'forestPark' ? 1200 : k === 'university' ? 1500 : 0; }
  st.shelterCap *= modMul(s, 'prep');
  const prepared = popNow > 0 ? Math.min(1, st.shelterCap / (popNow * 0.4)) : 1;
  // 浸水のおそれ：川・水面の近くの低い区画。同じ地区に調整池があれば半分
  const flood = floodRisk(s), basinD = new Set(B.filter(b => fam(b.kind) === 'basin' && b.status === 'operating').map(b => m.district[idx(b.x, b.y)]));
  // 知名度・来訪者
  let fameT = 10 + modAdd(s, 'fame'), vis = 0;
  const spring = hasOp(s, 'hotSpring');
  for (const b of B) if (b.kind === 'station' && b.status === 'operating' && b.connected) { vis += 2500 * (lvOf(b) - 1) + (shinOpen(s, b) ? 20000 : 0); fameT += 2 * (lvOf(b) - 1) + (shinOpen(s, b) ? 12 : 0); }
  for (const b of B) if (b.status === 'operating' && b.connected) { const d = DEFS[b.kind]; if (d.fame) fameT += d.fame; if (d.visitors) vis += d.visitors * lvK(b) * (spring && (b.kind === 'onsen' || b.kind === 'hotel') ? 1.5 : 1); }
  vis += intlVisitors(s); // 姉妹都市から
  // v21：造作した砂漠（砂丘）は 16 区画以上で観光地に。雪原はスキー場の客を増やす
  { const T = s.terraT; if (T) { let de = 0, sn = 0; for (let i = 0; i < T.length; i++) { if (T[i] === 7) de++; else if (T[i] === 8) sn++; }
    if (de >= 16) vis += Math.min(12000, 300 * de);
    if (sn && hasOp(s, 'skiResort')) vis += Math.min(9000, 150 * sn); } }
  st.fame = s.fame ?? 0;
  // 高速道路・空港でつながると、市外から来やすくなる
  const apLv = Math.max(0, ...B.filter(b => b.kind === 'airport' && b.status === 'operating').map(b => b.lv ?? 1));
  const reachK = (hasOp(s, 'ic') ? 1.15 : 1) * (apLv ? 1.2 + 0.05 * (apLv - 1) : 1);
  // 航空路線：誘致した便で来る人。海外からは円安ほど多い
  if (apLv) for (const r of s.airRoutes ?? []) { const d = AIR_ROUTES.find(o => o.id === r.id); if (d) vis += d.visitors * (d.intl ? Math.max(0.5, 1 + 1.2 * fxDev(s)) : 1) * Math.min(1, (s.month - r.since + 1) / 12); }
  // プロスポーツの試合を見に来る人（本拠地が使えるときだけ。体育館のバスケは少なめ）
  for (const t of s.teams ?? []) { const v = SPORTS[t.sport].venue.map(k => B.find(b => b.kind === k && b.status === 'operating' && b.connected)).find(Boolean); if (v) vis += SPORTS[t.sport].visitors * (0.6 + 0.8 * t.fans) * (v.kind === 'gym' ? 0.6 : 1); }
  st.visitors = Math.round(vis * (0.7 + 0.6 * Math.min(1, st.fame / 60)) * modMul(s, 'visitors') * reachK);
  void fameT;
  const OW = P.outsideWeight * modMul(s, 'outside'); // v90：モールが市外への買物を減らす効果は、大型店の重み（bigW）で市内の大型店に流れる形にした
  // 7. 商業：世帯の買物支出を、集客力 ÷ (1+距離) の比で店舗と市外に配分する
  for (const sh of B) if (isShop(sh.kind)) sh.revenue = 0;
  const spend = new Float64Array(nRes);
  const favShop = new Int32Array(nRes).fill(-1), favW = new Float64Array(nRes);
  let spendAll = 0, spendLocal = 0;
  res.forEach((r, ri) => {
    let sp = 0;
    for (let t = 0; t < NHH; t++) sp += r.hh![t] * P.income[t];
    sp *= P.retailShare; spend[ri] = sp; spendAll += sp;
    r.shopP = 0;
  });
  const contrib: { ri: Int32Array; w: Float64Array }[] = shopsOp.map((sh, si) => {
    const df = DEFS[sh.kind], ris: number[] = [], ws: number[] = [];
    each(sh.acc, df.range!, (ri, d) => { const w = df.attract! / (1 + d); ris.push(ri); ws.push(w); res[ri].shopP += w; if (w > favW[ri]) { favW[ri] = w; favShop[ri] = si; } });
    return { ri: Int32Array.from(ris), w: Float64Array.from(ws) };
  });
  // v90：大型店（モール・量販店）は近くの住民の買物を取り合う。近くの小さな店ほど売上が減る（商店街の支援 shopRev で一部を取り戻す）
  const bigW = new Float64Array(nRes);
  for (const b of B) { const g = BIG_STORES[b.kind]; if (!g || b.status !== 'operating' || !b.connected || b.acc < 0) continue; each(b.acc, g.R, (ri, d) => { bigW[ri] += g.w / (1 + d / 8); }); }
  const shopK = modMul(s, 'shopRev');
  shopsOp.forEach((sh, si) => { const c = contrib[si]; for (let k = 0; k < c.ri.length; k++) { const ri = c.ri[k]; sh.revenue += spend[ri] * c.w[k] / (res[ri].shopP + OW + bigW[ri]) * shopK; } });
  // 市営駐車場の近く（180m 以内）の店は、車の客が増える
  const lots = B.filter(b => b.kind === 'parkingLot' && b.status === 'operating');
  if (lots.length) for (const sh of shopsOp) if (lots.some(p => Math.abs(p.x - sh.x) <= 6 && Math.abs(p.y - sh.y) <= 6)) sh.revenue *= 1.1;
  const towers = B.filter(b => b.kind === 'parkingTower' && b.status === 'operating');
  if (towers.length) for (const sh of shopsOp) if (towers.some(p => Math.abs(p.x + 0.5 - sh.x) <= 8 && Math.abs(p.y + 0.5 - sh.y) <= 8)) sh.revenue *= 1.15;
  const ugp = B.filter(b => b.kind === 'ugParking' && b.status === 'operating'); // v87：地下駐車場（立体駐車場と同じ 1.5 割、範囲は 300m。重ねては効かない）
  if (ugp.length) for (const sh of shopsOp) if (!towers.some(p => Math.abs(p.x + 0.5 - sh.x) <= 8 && Math.abs(p.y + 0.5 - sh.y) <= 8) && ugp.some(p => Math.abs(p.x + 1 - sh.x) <= 10 && Math.abs(p.y + 1 - sh.y) <= 10)) sh.revenue *= 1.15;
  // 来訪者の買物：店の集客力の比で分け合う
  if (st.visitors > 0 && shopsOp.length) { const tot = shopsOp.reduce((a, b) => a + DEFS[b.kind].attract!, 0) + B.reduce((a, b) => a + (b.status === 'operating' && b.connected ? BIG_STORES[b.kind]?.a ?? 0 : 0), 0); for (const sh of shopsOp) sh.revenue += st.visitors * P.visitorSpend * DEFS[sh.kind].attract! / tot; } // v90：来訪者の買物は大型店とも分け合う
  res.forEach((r, ri) => { if (r.connected) spendLocal += spend[ri] * (r.shopP + bigW[ri]) / (r.shopP + OW + bigW[ri]); });
  st.shops = shopsOp.length;
  st.shopLevel = spendAll > 0 ? spendLocal / spendAll : 0;

  // 8. 雇用（市内の職）
  for (const b of B) {
    if (b.status !== 'operating' && b.status !== 'renewing') continue;
    if (isShop(b.kind) && b.connected) st.localJobs += DEFS[b.kind].jobs!;
    else if (DEFS[b.kind].jobs && b.connected) { const j = DEFS[b.kind].jobs! * lvK(b) * (DEFS[b.kind].chain ? Math.min(1, chainFactor(s, b.kind)) : 1); st.localJobs += j; if (isBiz(b.kind)) st.bizJobs += j; } // 材料が市内にない工場は人を減らす
    else st.localJobs += b.staff ?? 0;
  }
  for (const t of s.teams ?? []) st.localJobs += SPORTS[t.sport].jobs;
  if (hasOp(s, 'airport')) for (const r of s.airRoutes ?? []) st.localJobs += AIR_ROUTES.find(o => o.id === r.id)?.jobs ?? 0; // 航空会社の支店・空港の地上職
  for (const b of B) if (b.kind === 'station' && b.status === 'operating') st.localJobs += [0, 0, 450, 1100][lvOf(b)] + (shinOpen(s, b) ? 600 : 0); // 駅ビルの店と事務所、新幹線の駅
  st.localJobs += 260 * SCALE; // 駅・診療所・事業所など固定の職
  for (const r of res) for (let t = 0; t < NHH; t++) st.workers += r.hh![t] * P.workers[t];
  const noRail = !!REAL && !B.some(b => b.kind === 'station'); // 鉄道のない街（バス・車で通う）では駅がないことを不足としない
  const jobLv = clamp(0.45 + 0.5 * Math.min(1, st.localJobs / Math.max(1, 0.3 * st.workers))) * (stationOk || noRail ? 1 : 0.8);

  // 9. 交通：朝の通勤時間帯の交通を 3 回に分けて最短時間経路に載せる
  const G = info, gn = G.n, node = G.nodeOf;
  poolN = 0;
  const load = tmpTree(gn).d, cost = tmpTree(gn).d, cap = tmpTree(gn).d, ageF = tmpTree(gn).d, smart = hasOp(s, 'smartSignal');
  const wideS = new Set((s.wide ?? []).filter(i => s.road[i] === 2)), flyS = new Set(s.flyover ?? []);
  for (let k = 0; k < gn; k++) {
    const i = G.nodes[k], old = s.roadAge[i] > 70;
    load[k] = 0; cap[k] = P.roadCap[s.road[i]] * (s.climate?.snow ? 0.8 : 1) * (old ? 0.85 : 1) * (s.roadBoost[i] ?? 1) * (smart && s.road[i] !== 3 ? 1.1 : 1) * (wideS.has(i) ? P.wideCap : 1) * (flyS.has(i) ? 1.8 : 1); ageF[k] = old ? 1.15 : 1;
  }
  const peak = modMul(s, 'peakTrips') * (hasOp(s, 'fiberHub') ? 0.96 : 1); // 光回線でテレワークが広がる
  const stTile = stationOk ? station!.acc : -1;
  // v88：無人島で本土とつながっていなければ、桟橋・港が市外への出入口（通過交通はない）
  const ships = shipGates(s), isleOnly = ships.length > 0 && !GATEWAYS.some(g => s.road[g]);
  const gt0 = isleOnly ? ships[0] : THROUGH[0], gt1 = isleOnly ? ships[ships.length - 1] : THROUGH[1];
  const g0 = node[gt0], g1 = node[gt1];
  const gwN = GATEWAYS.map(g => node[g]).filter(q => q >= 0);
  // 駅には、駅に面した道路のどこからでも入れる
  const stN: number[] = [], stOf = new Map<number, Building>();
  for (const st of stationsOk) { // 架空の街も駅が複数あれば、それぞれの駅へ
    for (let k = -1; k <= st.w; k++) for (const yy of [st.y - 1, st.y + st.h]) { if (!inMap(st.x + k, yy)) continue; const q = idx(st.x + k, yy); if (s.road[q] && info.conn[q] && k >= 0 && k < st.w) { stN.push(node[q]); stOf.set(node[q], st); } }
    if (REAL && st.acc >= 0 && info.conn[st.acc] && !stN.includes(node[st.acc])) { stN.push(node[st.acc]); stOf.set(node[st.acc], st); }
  }
  const shopTree = shopsOp.map(b => freeTree(G, b.acc));
  const walk = (from: number, t: Tree, vol: number) => {
    if (vol <= 0 || from < 0 || t.d[from] === Infinity) return;
    for (let k = from; k >= 0; k = t.p[k]) load[k] += vol;
  };
  const resNode = res.map(r => (r.connected ? node[r.acc] : -1));
  const resW = res.map(r => { let w = 0; for (let t = 0; t < NHH; t++) w += r.hh![t] * P.workers[t]; return w; });
  const T0 = tmpTree(gn), T1 = tmpTree(gn), T2 = tmpTree(gn);
  // バス停から 4 区画以内の世帯は、路線バスで通勤する人がいて車が減る（自動運転バスだと本数が多い）
  const busNear = new Uint8Array(N); mark0(s.busStops, 4, busNear);
  const busStopK = hasOp(s, 'autoBusDepot') ? 0.8 : 0.87;
  const busK = (1 - 0.06 * Math.min(3, countOp(s, 'busTerminal'))) * (hasOp(s, 'autoBusDepot') ? 0.85 : 1) * (hasOp(s, 'robotaxi') ? 0.92 : 1);
  const techCommute = (hasOp(s, 'fiberHub') ? 0.03 : 0) + (hasOp(s, 'autoBusDepot') ? 0.03 : 0) + (hasOp(s, 'vertiport') ? 0.04 : 0) + (hasOp(s, 'robotaxi') ? 0.03 : 0); // テレワーク・自動運転バス・空飛ぶクルマ // バスターミナル 1 か所で車の通勤が 6% 減る（3 か所まで）
  const fr = [0.4, 0.3, 0.3];
  let cum = 0;
  for (let k = 0; k < 3; k++) {
    for (let q = 0; q < gn; q++) { const vc = cum > 0 ? Math.min(2.5, load[q] / cap[q] / cum) : 0; cost[q] = G.free[q] * ageF[q] * (1 + 0.6 * vc * vc * vc); }
    if (REAL) { dijkstra(G, gwN, cost, T0); dijkstra(G, g1, cost, T1); } else { dijkstra(G, g0, cost, T0); dijkstra(G, g1, cost, T1); }
    dijkstra(G, stN, cost, T2);
    const f = fr[k];
    if (!isleOnly) walk(g0, T1, P.throughTraffic * f);
    for (let ri = 0; ri < nRes; ri++) {
      const a = resNode[ri]; if (a < 0) continue;
      const gt = REAL || T0.d[a] <= T1.d[a] ? T0 : T1;
      const car = resW[ri] * P.carShare * busK * (busNear[idx(res[ri].x, res[ri].y)] ? busStopK : 1) * routeCarK(s, idx(res[ri].x, res[ri].y)) * (1 - 0.2 * lrtCov[ri]) * P.peakFactor * peak, rail = resW[ri] * P.railShare * P.railCarShare * P.peakFactor * peak;
      walk(a, gt, car * f);
      walk(a, stationOk ? T2 : gt, rail * f);
      if (favShop[ri] >= 0) walk(a, shopTree[favShop[ri]], sumHH(res[ri]) * P.shopTrip * f);
    }
    // 市外から企業・大型施設へ通う人と、来訪者の車（市外の出入口から）
    for (const b of others) {
      const d = DEFS[b.kind], q = node[b.acc]; if (q === undefined || q < 0) continue;
      const vol = ((d.jobs ?? 0) * 0.35 + (d.visitors ?? 0) * 0.004 + (b.kind === 'logistics' ? 120 : b.kind === 'factory' ? 60 : 0) + (BIG_STORES[b.kind]?.a ?? 0) * 8) * P.peakFactor * peak; // v90：大型店は買物客の車と搬入のトラックを集める
      if (vol > 0) walk(q, T0.d[q] <= T1.d[q] ? T0 : T1, vol * f);
    }
    cum += f;
  }
  let maxVc = 0;
  s.vc.fill(0);
  for (let q = 0; q < gn; q++) {
    const i = G.nodes[q], vc = load[q] / cap[q];
    s.vc[i] = Math.round(vc * 1000) / 1000;
    if (s.road[i] !== 3 && vc > maxVc) maxVc = vc; // 国道は国の管理なので市の指標から外す
    cost[q] = G.free[q] * ageF[q] * (1 + 0.6 * Math.min(2.5, vc) ** 3);
  }
  st.maxVc = maxVc;
  // 所要時間（混雑あり・なし）
  if (REAL) { dijkstra(G, gwN, cost, T0); dijkstra(G, gwN, cost, T1); } else { dijkstra(G, g0, cost, T0); dijkstra(G, g1, cost, T1); }
  dijkstra(G, stN, cost, T2);
  const F0 = REAL ? freeTree(G, -200, gwN) : freeTree(G, isleOnly ? gt0 : GATEWAYS[0]), F1 = REAL ? F0 : freeTree(G, isleOnly ? gt1 : GATEWAYS[1]), F2 = freeTree(G, -100, stN);
  // まちづくり版：駅ごとの朝の利用者と、面する線路の能力（単線・複線）。あふれると駅経由の通勤が遅くなる
  const resCrowd = new Float64Array(nRes).fill(1);
  st.railCrowd = 0;
  const railFreqK = 1 + 0.25 * ((s.pol as unknown as { rail?: { freq?: number } } | undefined)?.rail?.freq ?? 0); // v90：鉄道会社の増発で電車の能力が増える（big.ts の混雑率と同じ係数）
  if (s.rail && stN.length) {
    const resSt: (Building | undefined)[] = new Array(nRes);
    const load = new Map<Building, number>();
    for (let ri = 0; ri < nRes; ri++) {
      const a = resNode[ri]; if (a < 0 || T2.d[a] === Infinity) continue;
      let r = a, guard = 0; while (T2.p[r] >= 0 && guard++ < 100000) r = T2.p[r];
      const sb = stOf.get(r); if (!sb) continue;
      resSt[ri] = sb; load.set(sb, (load.get(sb) ?? 0) + resW[ri] * P.railShare * P.peakFactor * peak);
    }
    const crowd = new Map<Building, number>();
    for (const sb of stationsOk) { const cap = (P.stationCap[railLv(sb)] ?? 0) * [1, 1, 1.4, 1.8][lvOf(sb)] * (shinOpen(s, sb) ? 1.3 : 1) * railFreqK, used = load.get(sb) ?? 0; sb.used = Math.round(used); sb.effCap = cap; const o = cap > 0 ? used / cap : 0; crowd.set(sb, o); if (o > st.railCrowd) st.railCrowd = Math.round(o * 1000) / 1000; }
    for (let ri = 0; ri < nRes; ri++) { const sb = resSt[ri]; if (sb) resCrowd[ri] = 1 + 0.8 * Math.max(0, (crowd.get(sb) ?? 0) - 1); }
  }

  // 10. 環境（空気）：道路の交通と工場などの排出を、近くへぼかして広げる。緑（公園・樹林）はきれいにする
  const pol = pollution(s, B, G, load);
  // 迷惑施設の近さ・斎場（火葬場）と霊園・寺社（地域のつながり）
  const nimbyF = nimbyField(s);
  const crems = B.filter(b => b.kind === 'crematorium');
  st.cremCap = crems.reduce((a, b) => a + (b.status === 'operating' || b.status === 'renewing' ? b.effCap : 0), 0);
  st.cremShort = st.deaths > 0.5 ? clamp((st.deaths - st.cremCap) / st.deaths) : 0;
  const graves = B.filter(b => b.kind === 'cemetery' && b.status === 'operating').length, halls = B.filter(b => b.kind === 'funeralHall' && b.status === 'operating').length;
  const funeralLack = 0.12 * st.cremShort + (popNow > 8000 * SCALE && !graves ? 0.03 : 0) + (popNow > 8000 * SCALE && !halls ? 0.02 : 0);
  const relCov = new Float64Array(nRes);
  cover(B.filter(b => fam(b.kind) === 'religion'), b => (b.kind === 'grandShrine' ? 120 : b.kind === 'temple' ? 60 : 40), b => (b.kind === 'grandShrine' ? 1 : 0.6), relCov, false);
  let nimbyHH = 0, sickW = 0, elderHH = 0, lonely = 0;
  // ダム・水路（放水路）・歩道橋の届く範囲
  const dams = B.some(b => b.kind === 'dam' && b.status === 'operating');
  const nearCanal = new Uint8Array(N), nearFoot = new Uint8Array(N);
  const mark = (list: number[] | undefined, R: number, out: Uint8Array) => { for (const c of list ?? []) { const cx = c % W, cy = (c / W) | 0; for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (inMap(cx + dx, cy + dy)) out[idx(cx + dx, cy + dy)] = 1; } };
  const nearLevee = new Uint8Array(N);
  mark(s.canal, 3, nearCanal); mark(s.footbridge, 3, nearFoot); mark(s.levee, 4, nearLevee);
  // 地形の造作：人がつくった池・林・湿地のそばは環境がよく、湿地は大雨の水をためて浸水を減らす（遊水地）
  const nearNat = new Uint8Array(N), nearWet = new Uint8Array(N);
  if (s.terraT) { const nat: number[] = [], wt: number[] = []; s.terraT.forEach((t, i) => { if (t === 1 || t === 3 || t === 5) nat.push(i); if (t === 5) wt.push(i); }); mark(nat, 2, nearNat); mark(wt, 3, nearWet); }
  // 11. 満足度
  st.units = 0;
  let vacant = 0;
  for (const r of res) { st.units += r.units!; vacant += Math.max(0, r.units! - sumHH(r)); }
  st.vacancy = st.units > 0 ? vacant / st.units : 0;
  const tv = P.targetVacancy * 1.4;
  const tax = s.tax ?? { res: 1, prop: 1, biz: 1, stay: 0 };
  const rentIndex = (1 + 0.5 * clamp((tv - st.vacancy) / tv, -0.5, 1) + 0.1 * Math.min(1, st.pentUp / 12)) * (1 + 0.6 * (tax.prop - 1)) * (1 + 0.004 * modAdd(s, 'devLevy')); // v90：開発負担金は家賃・分譲価格に上乗せされる
  st.rentIndex = rentIndex;
  const houseQ = modAdd(s, 'houseQuality'), aid = modAdd(s, 'housingAid');
  const satAdd = [0, 1, 2, 3, 4].map(t => modAdd(s, 'sat:' + t) + modAdd(s, 'sat:all') + (hasOp(s, 'cityOS') ? 0.01 : 0) + (t === 4 && hasOp(s, 'autoBusDepot') ? 0.01 : 0) + (t === 4 && hasOp(s, 'robotaxi') ? 0.015 : 0) + ((t === 2 || t === 3) && hasOp(s, 'casino') ? -0.012 : 0) + (hasOp(s, 'usBase') ? -0.008 : 0) + (t === 1 && hasOp(s, 'weddingHall') ? 0.004 : 0) + (t === 4 && hasOp(s, 'humanoidLab') ? 0.008 : 0) + (t === 4 && hasOp(s, 'arcade') ? 0.004 : 0) + (t === 3 && hasOp(s, 'clubTeam') ? 0.005 : 0) + ((t === 2 || t === 3) && hasOp(s, 'fuzokuDistrict') ? -0.008 : 0) - 0.004 * Math.max(0, (((s.econ as any)?.macro?.oil ?? 1) - 1.1)) * (1 - Math.min(0.7, ((s.stats.powerCap - (s.base?.power ?? 0)) / Math.max(1, s.stats.powerDemand)))) /* 電気・ガス代の値上がり（市内で発電するほど軽い） */ - 0.006 * cpiBurden(s) * (1 - Math.min(0.8, modAdd(s, 'bukkaRelief'))) * (t === 4 || t === 2 || t === 3 ? 1.3 : 1)); // 物価高：年金暮らしと子育て世帯ほど苦しい。物価高対策で和らぐ
  const satNum = [0, 0, 0, 0, 0], dNum = DISTRICTS.map(() => 0), dDen = DISTRICTS.map(() => 0);
  const lvSum = [0, 0, 0, 0, 0, 0, 0, 0];
  const partV = new Array(14).fill(0), partDrag = new Array(14).fill(0); let partN = 0; // 満足の内訳（14 項目の平均と、満点からの不足 × 重み）
  let delayNum = 0, delayDen = 0, covered = 0, lvDen = 0;
  // 外国人住民：工場・農業・介護などで働く技能実習生・特定技能、大学の留学生（働き手・学ぶ人としての推計）。
  // v90：国籍や人数そのものは治安に効かせない。代わりに住民全体に効く 2 つの指標を出す。
  //  - 行政サービスへのアクセス（相談窓口・手続きの届きやすさ・多言語/やさしい日本語の情報・オンライン手続き）
  //  - 言語の支援（日本語学習の機会・通訳・学校での支援。低いほど「言語の壁」が高い）
  // これが、情報が届きにくい住民（高齢のひとり暮らし・障害のある人・転入したばかりの世帯・日本語に不慣れな人）への
  // 情報の到達を決め、相談の利用（福祉の満足・孤立）、採用の定着、災害時の被害、転出に効く。
  {
    const fm = modMul(s, 'foreign');
    let tr = 0, sk = 0, stu = 0;
    for (const b of B) {
      if (b.status !== 'operating' || !b.connected) continue;
      const j = DEFS[b.kind].jobs ?? 0, f = fam(b.kind);
      if (f === 'agri' || b.kind === 'factory' || b.kind === 'smallFactory' || b.kind === 'foodFactory' || b.kind === 'shipyard' || b.kind === 'steelMill' || b.kind === 'partsPlant' || b.kind === 'industrialPark' || b.kind === 'brewery' || b.kind === 'fishPort') tr += j * 0.05;
      else if (b.kind === 'elderly' || b.kind === 'hotel' || b.kind === 'logistics' || b.kind === 'semicon' || b.kind === 'battery') sk += (j || (b.staff ?? 0)) * 0.04;
      if (b.kind === 'university') stu += 250; else if (b.kind === 'highschool') stu += 10;
    }
    tr *= fm; sk *= fm * (1 + 0.3 * Math.max(0, s.econ?.cycle ?? 0));
    const base = popNow * 0.018, total = base + tr + sk + stu;
    const agingNow = popNow > 0 ? res.reduce((x, r) => x + r.hh![4], 0) * P.persons[4] / popNow : 0.28; // 今月の世帯から（保存して開き直しても同じ値になるように）
    const acc = accessOf(s, popNow, total, agingNow);
    st.access = acc;
    st.foreign = { total: Math.round(total), trainee: Math.round(tr), skilled: Math.round(sk), student: Math.round(stu), support: Math.round((0.5 * acc.access + 0.5 * acc.lang) * 100) / 100 };
  }
  if (s.area) { let yi = 0, yt = 0; for (const r of res) { const n = sumHH(r); yt += n; if (s.area[idx(r.x, r.y)] === 2) yi += n; } st.yudoShare = yt > 0 ? Math.round(yi / yt * 1000) / 1000 : 0; }
  // 遊技場とカジノ：近くの治安の不安（店の数で頭打ち）
  const gamble = 0.012 * Math.min(4, countOp(s, 'pachinko')) + (hasOp(s, 'casino') ? 0.035 : 0) + (hasOp(s, 'usBase') ? 0.01 : 0)
    // 夜の街：横丁・繁華街・歓楽街は、けんか・客引き・ぼったくり・暴力団の不安。警察署・交番と防犯の政策で和らぐ
    + (0.005 * Math.min(4, countOp(s, 'yokocho')) + 0.028 * Math.min(2, countOp(s, 'nightDistrict')) + 0.045 * Math.min(2, countOp(s, 'fuzokuDistrict'))) * (hasOp(s, 'police') ? 0.7 : 1) * (1 - 0.1 * Math.min(3, countOp(s, 'koban'))) * (1 - Math.min(0.6, modAdd(s, 'nightSafe')));
  const crimeBase = clamp(gamble + 0.25 + 0.6 * st.vacancy + 0.2 * (1 - st.shopLevel) - 0.1 * modAdd(s, 'safety')); // v90：外国人住民の数や割合は治安に入れない
  res.forEach((r, ri) => {
    const hh = r.hh!, i0 = idx(r.x, r.y), d = m.district[i0];
    const tot = sumHH(r);
    // 保育
    const care = need[ri] > 0.01 ? served[ri] / need[ri] : 1;
    r.unmet = Math.max(0, need[ri] - served[ri]);
    st.careDemand += need[ri]; st.careServed += served[ri]; st.waitDistrict[d] += r.unmet;
    // 学校（小学校 6・中学校 4 の割合。図書館が近いと少し上がる）
    const si = schoolOf[ri];
    const elem = si >= 0 ? Math.min(1, schools[si].effCap / Math.max(1, enroll[si])) : 0.25;
    const ji = jhsOf[ri];
    const jun = ji >= 0 ? Math.min(1, jhs[ji].effCap / Math.max(1, jEnroll[ji])) : 0.35;
    const school = clamp(0.6 * elem + 0.4 * jun - 0.06 + 0.12 * libCov[ri]);
    const park = parkLv[ri];
    const fire = r.connected ? clamp(fireLv[ri] * 0.85 + 0.15 * prepared) : 0;
    if (fireLv[ri] >= 0.99) covered += tot;
    // 買物
    const shop = Math.min(1, (r.shopP + bigW[ri]) / (r.shopP + OW + bigW[ri]) / 0.85); // v90：近くの大型店は住民の買物を便利にする
    // 通勤
    let commute = 0, ratio = 1;
    if (r.connected) {
      const a = resNode[ri];
      const tg = Math.min(T0.d[a], T1.d[a]), tg0 = Math.min(F0.d[a], F1.d[a]), rail = stationOk && T2.d[a] !== Infinity;
      const T = rail ? 0.6 * T2.d[a] * resCrowd[ri] + 0.4 * tg : tg;
      const Tf = rail ? 0.6 * F2.d[a] + 0.4 * tg0 : tg0;
      ratio = Tf > 0 ? T / Tf : 1;
      commute = clamp(0.82 - 0.05 * Math.max(0, T - 1.5) - 0.8 * (ratio - 1) - (rail ? 0 : 0.15 * (1 - lrtCov[ri])) + 0.06 * lrtCov[ri] + techCommute);
      delayNum += ratio * resW[ri]; delayDen += resW[ri];
    }
    const life = r.connected ? lifeLv : 0;
    // 医療：診療所だけでは入院や手術ができない。市内に病院（市民病院・大学病院）がないと上限が下がる
    const healthLv = clamp(0.3 + 0.45 * Math.min(1, healthCov[ri]) * (0.5 + 0.5 * healthRatio) + 0.12 * emerg[ri] + (hasHosp ? 0.13 : 0) + modAdd(s, 'health'));
    // 治安：交番だけでは事件の捜査や夜間の体制が弱い。市内に警察署がなければ、隣の市の警察署が受け持つ（少し遠い）
    const safetyLv = clamp(0.38 + 0.42 * Math.min(1, safetyCov[ri]) * (0.5 + 0.5 * safetyRatio) - 0.25 * crimeBase + (hasPolice ? 0.12 : 0.04) + (nearFoot[i0] ? 0.04 : 0));
    const nb = Math.min(1, nimbyF[i0]);
    if (nb > 0.25) nimbyHH += tot;
    const envLv = clamp(1 - 0.5 * pol[i0] - 0.3 * nb + (nearCanal[i0] ? 0.05 : 0) + (nearNat[i0] ? 0.04 : 0));
    const culture = clamp(0.5 + Math.min(0.5, cultCov[ri] + 0.04 * (s.teams?.length ?? 0)));
    const welfare = clamp(0.5 + 0.25 * elderRatio + 0.25 * careCov[ri] + 0.06 * Math.min(1, relCov[ri]) - funeralLack + 0.08 * (st.access!.reach - 0.6)); // 相談と情報が届くほど、福祉の制度を使える
    sickW += tot * (1.6 - healthLv); elderHH += hh[4];
    if (welfare < 0.62) lonely += hh[4] * 0.3 * (0.62 - welfare) / 0.62 * 3 * Math.max(0.6, 1 + 0.5 * (0.3 - st.access!.access)); // ひとり暮らしの高齢者（高齢世帯の 3 割）で、見守りが届いていない
    r.sv = [care, school, park, fire, shop, commute, life, healthLv, safetyLv, envLv, culture, welfare];
    const rent = P.rent[r.kind] * rentIndex * (1 + 0.06 * (1 - gasLv));
    r.sat = [];
    const fl = flood[i0] ? (basinD.has(d) ? 0.5 : 1) * (dams ? 0.5 : 1) * (nearCanal[i0] ? 0.5 : 1) * (nearLevee[i0] ? 0.2 : 1) * (nearWet[i0] ? 0.5 : 1) : 0; // 調整池・ダム・放水路・堤防で浸水が減る
    if (fl) st.floodHH += tot * fl;
    for (let t = 0; t < NHH; t++) {
      const housing = clamp(1.05 - 2.2 * rent / P.income[t] + (r.kind === 'house' ? houseQ : 0) + aid * (P.income[t] < 30 ? 1 : 0.5) - 1.2 * (tax.res - 1));
      const c = [housing, commute, care, school, park, shop, fire, life, jobLv, healthLv, safetyLv, envLv, culture, welfare];
      let v = 0; for (let k = 0; k < 14; k++) { v += SAT_W[t][k] * c[k]; partV[k] += hh[t] * c[k]; partDrag[k] += hh[t] * SAT_W[t][k] * (1 - c[k]); } partN += hh[t];
      v = clamp(v + satAdd[t] - 0.06 * nb - 0.25 * (1 - waterLv) - 0.15 * (1 - powerLv) - 0.03 * fl); // 水や電気の不足は暮らし全体に響く
      if (!r.connected) v *= 0.3;
      r.sat.push(v);
      satNum[t] += v * hh[t]; st.hhByType[t] += hh[t];
      dNum[d] += v * hh[t]; dDen[d] += hh[t];
      st.popDistrict[d] += hh[t] * P.persons[t];
    }
    lvSum[0] += life * tot; lvSum[1] += healthLv * tot; lvSum[2] += safetyLv * tot; lvSum[3] += envLv * tot; lvSum[4] += culture * tot; lvSum[5] += welfare * tot; lvSum[6] += school * tot; lvSum[7] += fire * tot; lvDen += tot;
  });
  for (let t = 0; t < NHH; t++) { st.households += st.hhByType[t]; st.pop += st.hhByType[t] * P.persons[t]; st.satType[t] = st.hhByType[t] > 0 ? satNum[t] / st.hhByType[t] : 0; }
  // 社会の問題：病人（医療が足りないほど多い）・高齢化・孤立・迷惑施設
  st.sick = Math.round(st.households > 0 ? st.pop * 0.018 * (sickW / st.households) : 0);
  st.aging = st.pop > 0 ? elderHH * P.persons[4] / st.pop : 0;
  st.nimbyHH = Math.round(nimbyHH); st.lonely = Math.round(lonely);
  st.sat = st.households > 0 ? (satNum[0] + satNum[1] + satNum[2] + satNum[3] + satNum[4]) / st.households : 0;
  st.satParts = partV.map(v => partN > 0 ? Math.round(v / partN * 1000) / 1000 : 0); st.satDrag = partDrag.map(v => partN > 0 ? Math.round(v / partN * 10000) / 10000 : 0);
  for (let d = 0; d < DISTRICTS.length; d++) st.satDistrict[d] = dDen[d] > 0 ? dNum[d] / dDen[d] : 0;
  st.lv = lvSum.map(v => (lvDen > 0 ? v / lvDen : 0.5));
  st.crime = Math.round(crimeBase * (1.4 - st.lv[2]) * (1 - (hasOp(s, 'hogoKansatsu') ? 0.04 : 0) - (hasOp(s, 'shonenin') ? 0.03 : 0)) * 1000) / 1000; // v87：再犯防止（保護観察・少年院の矯正教育）で犯罪が少し減る
  st.waitlist = Math.max(0, st.careDemand - st.careServed);
  st.avgDelay = delayDen > 0 ? delayNum / delayDen : 1;
  st.fireCover = st.households > 0 ? covered / st.households : 1;

  // 12. 将来の更新負担：今後 60 か月に老朽度 80 へ達する（または既に達している）施設・道路の更新費
  let ren = 0;
  for (const b of B) {
    const d = DEFS[b.kind];
    if (!isCity(b.kind) || b.status === 'construction' || b.status === 'renewing') continue;
    if (b.age + d.ageRate * 60 >= 80) ren += renewCostOf(b); // v90：老朽度 80 を超えて先送りした施設は更新費が高い
  }
  const rAge = modMul(s, 'roadAge');
  for (let i = 0; i < N; i++) if (s.road[i] === 1 || s.road[i] === 2) { if (s.roadAge[i] + P.roadAgeRate * rAge * 60 >= 70) ren += P.roadRepairCost; }
  st.renewal60 = ren;
  st.debt = s.loans.reduce((a, l) => a + l.remaining, 0);

  s.stats = st;
  if (!lite) s.voices = makeVoices(s);
}

const pct = (v: number) => Math.round(v * 100) + '%';
const r0 = (v: number) => Math.round(v);

/** 住民の声。実際に計算された不足・変化だけから作る（ルールと定型文）。 */
/** 画面に出しきれない分も含めた、いまの不満の声（キーと内容） */
const voiceAll = new WeakMap<GameState, { key: string; who: string; text: string }[]>();
export function voiceList(s: GameState): { key: string; who: string; text: string }[] { return voiceAll.get(s) ?? s.voices.filter(v => v.tone !== 'good') }
/** 声だけを作り直す（お礼が増えたとき） */
export function refreshVoices(s: GameState): void { s.voices = makeVoices(s); }
function makeVoices(s: GameState): Voice[] {
  const m = getMap(s.seed);
  const st = s.stats, B = s.buildings, out: Voice[] = [];
  const DN = DISTRICTS;
  const res = B.filter(b => isRes(b.kind) && b.status === 'operating');
  const worstIn = (d: number, f: (b: Building) => number) => {
    let best = -1, bv = -1e9;
    for (const r of res) { if (d >= 0 && m.district[idx(r.x, r.y)] !== d) continue; const v = f(r); if (v > bv) { bv = v; best = idx(r.x, r.y); } }
    return best;
  };
  // 保育
  const nurs = B.filter(b => DEFS[b.kind].fam === 'care' || b.kind === 'privNursery');
  const design = nurs.filter(b => b.status === 'operating' || b.status === 'renewing').reduce((a, b) => a + designCap(s, b), 0);
  const short = nurs.filter(b => b.status === 'operating' && (b.staff ?? 0) < staffReq(s, b) * 0.95);
  for (let d = 0; d < DISTRICTS.length; d++) if (st.waitDistrict[d] >= 4) {
    out.push({
      key: 'care' + d, who: '子育て世帯', district: d, tone: st.waitDistrict[d] >= 12 ? 'bad' : 'warn', layer: 'care', tile: worstIn(d, b => b.unmet),
      text: st.waitDistrict[d] >= 12 ? '保育園に入れず、育休を延ばしました。このままだと仕事を辞めるか、引っ越すかを考えます。' : '希望した園に空きがなく、遠くの園まで送り迎えしています。',
      cause: `${DN[d]}の待機 ${r0(st.waitDistrict[d])} 人。市全体では保育需要 ${r0(st.careDemand)} 人に対し、実効定員 ${r0(st.careCap)} 人（設計定員 ${r0(design)} 人）。` +
        (short.length ? `保育士が不足している園が ${short.length} か所あり、建物の定員まで受け入れられていません。` : '建物の定員そのものが足りていません。') + '徒歩・送迎圏は道路で 900m までとしています。',
    });
  }
  if (st.waitlist < 1 && st.careDemand > 50 && s.month > 3) out.push({ key: 'careOk', who: '子育て世帯', district: -1, tone: 'good', layer: 'care', tile: -1, text: '保育園に入れました。仕事に戻れて助かっています。', cause: `保育需要 ${r0(st.careDemand)} 人を実効定員 ${r0(st.careCap)} 人で受け入れできています。` });
  // 通勤
  if (st.maxVc > 1.0) {
    let wi = -1, wv = 0; for (let i = 0; i < N; i++) if (s.road[i] && s.road[i] !== 3 && s.vc[i] > wv) { wv = s.vc[i]; wi = i; }
    out.push({
      key: 'traffic', who: '就業世帯', district: wi >= 0 ? m.district[wi] : -1, tone: st.maxVc > 1.3 ? 'bad' : 'warn', layer: 'traffic', tile: wi,
      text: '朝、駅や国道へ出る道が動きません。保育園の送りと重なると間に合いません。',
      cause: `最も混む市道の混雑率は ${pct(st.maxVc)}（容量に対する朝 1 時間の交通量）。通勤の所要時間は空いているときの ${st.avgDelay.toFixed(2)} 倍です。住宅が増えた地区から駅・国道へ向かう経路が 1 本に集中しています。`,
    });
  }
  // 買物
  for (let d = 0; d < 4; d++) {
    let n = 0, lv = 0; for (const r of res) if (m.district[idx(r.x, r.y)] === d) { const h = sumHH(r); n += h; lv += h * r.sv[4]; }
    if (n > 30 && lv / n < 0.55) out.push({
      key: 'shop' + d, who: '高齢世帯', district: d, tone: 'warn', layer: 'none', tile: worstIn(d, b => 1 - b.sv[4]),
      text: '歩いて行ける店がなく、買物は週に一度まとめてです。パン屋でも一軒あると違うのですが。',
      cause: `${DN[d]}の買物の便は ${pct(lv / n)}（近くの店の集客力と道路距離から計算）。店は商業用途の区画に、商圏の需要が採算を超えたときだけ民間が開きます。`,
    });
  }
  // 商店主
  for (const b of B) if (isShop(b.kind) && b.status === 'operating' && (b.lossStreak ?? 0) >= 2) {
    const d = DEFS[b.kind];
    out.push({ key: 'owner' + b.id, who: '商店主', district: m.district[idx(b.x, b.y)], tone: 'warn', layer: 'none', tile: idx(b.x, b.y), text: '客足が足りず、このままでは続けられません。', cause: `${d.name}の月売上 ${r0(b.revenue)} 万円。採算には ${r0(d.fixed! / P.margin)} 万円が必要で、${b.lossStreak} か月赤字です。${b.connected ? '商圏の世帯数か、競合との分け合いが原因です。' : '道路が市外につながっておらず、客も仕入れも届きません。'}` });
    break;
  }
  // 水道
  const waters = B.filter(b => DEFS[b.kind].fam === 'water');
  const oldW = waters.find(b => b.age >= 70 && b.status === 'operating');
  if (st.waterCap < st.waterDemand) out.push({ key: 'water', who: '全市', district: -1, tone: 'bad', layer: 'age', tile: waters[0] ? idx(waters[0].x, waters[0].y) : -1, text: '朝と夕方に水の出が悪くなります。濁ることもあって不安です。', cause: `水道の需要 ${r0(st.waterDemand)} 世帯相当に対し、実効能力 ${r0(st.waterCap)} 世帯。老朽化・更新工事・職員不足で能力が落ちています。能力に余裕がないと新しい住宅も建ちません。` });
  else if (oldW) out.push({ key: 'waterOld', who: '全市', district: -1, tone: 'warn', layer: 'age', tile: idx(oldW.x, oldW.y), text: '水道施設がだいぶ古いと聞きました。止まる前に直してもらえますか。', cause: `水道施設の老朽度 ${r0(oldW.age)}。60 を超えると処理能力が下がり、100 で使用停止になります。更新費は ${DEFS[oldW.kind].renewCost.toLocaleString()} 万円、工期 ${DEFS[oldW.kind].renewMonths} か月（工事中は能力 ${pct(DEFS[oldW.kind].renewFactor)}）。` });
  // ごみ
  if (st.wasteCap < st.wasteDemand) out.push({ key: 'waste', who: '全市', district: -1, tone: 'warn', layer: 'none', tile: -1, text: 'ごみの収集が遅れて、集積所にカラスが集まっています。', cause: `収集需要 ${r0(st.wasteDemand)} 世帯に対し、収集能力 ${r0(st.wasteCap)} 世帯。` });
  // 公園
  for (let d = 0; d < 4; d++) {
    let n = 0, lv = 0; for (const r of res) if (m.district[idx(r.x, r.y)] === d) { const h = r.hh![2] + r.hh![3] + r.hh![4]; n += h; lv += h * r.sv[2]; }
    if (n > 40 && lv / n < 0.4) out.push({ key: 'park' + d, who: '子育て・高齢世帯', district: d, tone: 'warn', layer: 'none', tile: worstIn(d, b => 1 - b.sv[2]), text: '子どもを遊ばせる場所も、散歩の途中で座る場所もありません。', cause: `${DN[d]}で公園まで道路 450m 以内の世帯は少なく、公園の水準は ${pct(lv / n)}。` });
  }
  // 消防
  if (st.fireCover < 0.9) out.push({ key: 'fire', who: '高齢世帯', district: -1, tone: 'warn', layer: 'conn', tile: worstIn(-1, b => 1 - b.sv[3]), text: '消防車がここまで何分で来るのか心配です。', cause: `消防署から到達範囲内の世帯は ${pct(st.fireCover)}。隊員の充足や老朽化で到達範囲が縮みます。` });
  // 道路
  let old = 0, tot = 0, oi = -1; for (let i = 0; i < N; i++) if (s.road[i] === 1 || s.road[i] === 2) { tot++; if (s.roadAge[i] > 70) { old++; if (oi < 0) oi = i; } }
  if (tot > 0 && old / tot > 0.12) out.push({ key: 'roadAge', who: '就業世帯', district: -1, tone: 'warn', layer: 'age', tile: oi, text: '路面のひび割れと段差がひどく、自転車の子どもが危ないです。', cause: `市道 ${tot} 区間のうち ${old} 区間が老朽度 70 超。容量が 15% 落ち、走行も遅くなります。` });
  // 未接続
  const dis = B.filter(b => (isRes(b.kind) || isShop(b.kind) || isCity(b.kind)) && b.status === 'operating' && !b.connected);
  if (dis.length) out.push({ key: 'conn', who: '住民・事業者', district: m.district[idx(dis[0].x, dis[0].y)], tone: 'bad', layer: 'conn', tile: idx(dis[0].x, dis[0].y), text: '道が途切れて、車も配達も来られなくなりました。', cause: `${dis.length} 棟が、国道の市外接続点まで道路でつながっていません。未接続の住宅は転出が進み、店舗・施設は稼働できません。` });
  // ---- v5：ライフライン・医療・治安・環境・福祉・教育・防災 ----
  const lvLow = (k: number, f: (b: Building) => number) => { let n = 0, a = 0; for (const r of res) { const h = sumHH(r); n += h; a += h * f(r); } return n > 40 ? a / n : 1; };
  if (st.powerDemand > 0 && st.powerCap < st.powerDemand) out.push({ key: 'power', who: '全市', district: -1, tone: 'bad', layer: 'life', tile: -1, text: '夕方に停電がありました。冷蔵庫の中身が心配です。', cause: `電力の使用 ${r0(st.powerDemand)} 世帯分に対し、供給は ${r0(st.powerCap)} 世帯分。変電所の増設（電力会社への要望）か、市の発電所（メガソーラー・清掃工場）で増やせます。` });
  if (st.sewageDemand > 0 && st.sewageCap < st.sewageDemand) out.push({ key: 'sewage', who: '川沿いの住民', district: -1, tone: 'bad', layer: 'env', tile: -1, text: '川がにおうようになりました。魚もいなくなった気がします。', cause: `下水 ${r0(st.sewageDemand)} 世帯分に対し、処理能力 ${r0(st.sewageCap)} 世帯分。処理しきれない分が川へ流れています。` });
  if ((st.telDemand ?? 0) > 0 && (st.telCap ?? 1e9) < st.telDemand! * 0.97) out.push({ key: 'telecom', who: '若い世帯・企業', district: -1, tone: 'warn', layer: 'life', tile: -1, text: '夜になると携帯電話と光回線が混み合って、動画が止まり、在宅勤務の会議が切れます。基地局か通信ビルを増やしてほしい', cause: `通信の能力 ${r0(st.telCap!)} ／ 使う量 ${r0(st.telDemand!)} 世帯相当` });
  if (st.gasDemand > 0 && st.gasCap < st.gasDemand * 0.95) out.push({ key: 'gas', who: '新しく越してきた世帯', district: -1, tone: 'warn', layer: 'life', tile: -1, text: '都市ガスが来ていなくてプロパンです。毎月の光熱費が高いです。', cause: `都市ガスの供給 ${r0(st.gasCap)} 世帯分に対し、需要 ${r0(st.gasDemand)} 世帯。ガス整圧所の設置をガス会社に要望できます。` });
  const hl = lvLow(7, b => b.sv[7] ?? 1);
  if (hl < 0.55) out.push({ key: 'health', who: '高齢世帯', district: -1, tone: hl < 0.45 ? 'bad' : 'warn', layer: 'health', tile: worstIn(-1, b => 1 - (b.sv[7] ?? 1)), text: '近くに病院がなく、具合が悪いときは隣の市までタクシーです。', cause: `医療の水準は ${pct(hl)}。診療所の誘致（用地の紹介と補助）や市民病院、救急つきの消防本部で上がります。` });
  if (!B.some(b => (b.kind === 'hospital' || b.kind === 'univHospital') && b.status === 'operating') && st.pop > 2000) out.push({ key: 'noHosp', who: '高齢世帯', district: -1, tone: hl < 0.6 ? 'bad' : 'warn', layer: 'health', tile: -1, text: '入院や手術が必要になると、隣の市の病院まで行くしかありません。救急車も時間がかかります。', cause: `市内に病院（市民病院・大学病院）がなく、診療所だけでは入院・手術・夜間の救急を受けられません。医療の水準は ${pct(hl)}。市民病院を建てるか、大学病院を誘致すると大きく上がります。夜間急病センターでも救急は少し良くなります。` });
  if (!B.some(b => b.kind === 'police' && b.status === 'operating') && st.pop > 2000 && (st.lv[2] ?? 1) < 0.7) out.push({ key: 'noPolice', who: '子育て世帯', district: -1, tone: 'warn', layer: 'safety', tile: -1, text: '何かあったとき、警察署が隣の市にあるので来てもらうのに時間がかかります。', cause: `市内に警察署がなく、隣の市の警察署が受け持っています。交番だけでは事件の捜査や夜間の体制が弱く、治安の水準は ${pct(st.lv[2] ?? 0)}。警察署は県に用地を出して設置を要望できます。` });
  if (st.crime > 0.45) out.push({ key: 'crime', who: '子育て世帯', district: -1, tone: 'warn', layer: 'safety', tile: worstIn(-1, b => 1 - (b.sv[8] ?? 1)), text: '最近、空き巣や自転車の盗難が続いています。夜道も暗くて心配です。', cause: `治安の水準は ${pct(st.lv[2] ?? 0)}。交番・警察署の設置を県に要望するか、防犯パトロールを支援すると良くなります。` });
  const ev = lvLow(9, b => b.sv[9] ?? 1);
  if (ev < 0.7) out.push({ key: 'env', who: '子育て世帯', district: -1, tone: ev < 0.6 ? 'bad' : 'warn', layer: 'env', tile: worstIn(-1, b => 1 - (b.sv[9] ?? 1)), text: '幹線道路や工場の近くは空気が悪くて、洗濯物を外に干せません。', cause: `空気の水準は ${pct(ev)}。車の多い道路や工場・清掃工場の近くで下がり、公園や緑で上がります。` });
  if (st.elderNeed > 5 && st.elderCap < st.elderNeed * 0.8) out.push({ key: 'elder', who: '高齢世帯', district: -1, tone: 'warn', layer: 'welfare', tile: -1, text: '母の介護施設を探していますが、市内はどこも空きがありません。', cause: `介護が必要な高齢者 ${r0(st.elderNeed)} 人に対し、特別養護老人ホームの定員 ${r0(st.elderCap)} 人。社会福祉法人に建設を補助して要望できます。` });
  if (st.jhsKids > 30 && st.jhsCap < st.jhsKids) out.push({ key: 'jhs', who: '就学の子がいる世帯', district: -1, tone: 'warn', layer: 'edu', tile: -1, text: '中学校が遠くて、子どもが毎日 1 時間かけて通っています。', cause: `中学生 ${r0(st.jhsKids)} 人に対し、通える範囲の中学校の定員 ${r0(st.jhsCap)} 人。` });
  if (st.floodHH > 20 && st.shelterCap < st.pop * 0.1) out.push({ key: 'flood', who: '川沿いの住民', district: -1, tone: 'warn', layer: 'disaster', tile: -1, text: '大雨のたびに川があふれそうで眠れません。避難所も遠いです。', cause: `浸水のおそれがある世帯 ${r0(st.floodHH)}。雨水調整池で地区の浸水が減り、防災備蓄倉庫や学校・体育館（避難所）で災害のときの被害が小さくなります。` });
  if ((s.fame ?? 0) >= 40 && s.month > 6) out.push({ key: 'fame', who: '商店主', district: -1, tone: 'good', layer: 'none', tile: -1, text: '最近は市外からのお客さんが増えて、週末は忙しいです。', cause: `知名度 ${r0(s.fame)}、来訪者は月 ${r0(st.visitors)} 人。来訪者は市内の店で買物をします。` });
  // 住宅
  if (st.vacancy < 0.025 && st.pentUp > 3) out.push({ key: 'housing', who: '単身・若い世帯', district: -1, tone: 'warn', layer: 'none', tile: -1, text: '家賃が上がりました。更新のたびに負担が重くなります。', cause: `空き住戸は ${pct(st.vacancy)}。転入したくても入れない世帯が月 ${r0(st.pentUp)} 世帯あります。住宅用途の区画と道路があれば民間が建てます。` });
  // 天気と暮らし
  const cl = s.climate;
  if (cl && cl.store < 0.4) out.push({ key: 'drought', who: '全市', district: -1, tone: cl.store < 0.2 ? 'bad' : 'warn', layer: 'life', tile: -1, text: cl.store < 0.2 ? '夜の 8 時から朝まで水が止まります。お風呂もためられません。' : '給水制限で、蛇口の水の出が弱くなりました。', cause: `雨が少なく、水がめの貯水率が ${pct(cl.store)} に下がりました（4 割を切ると給水制限）。浄水場が送れる水は ${pct(storeFactor(cl.store))}。ダムがあると、少雨の月も水が減りにくくなります。` });
  if (cl && cl.crop < 0.8) out.push({ key: 'crop', who: '農家', district: -1, tone: cl.crop < 0.6 ? 'bad' : 'warn', layer: 'none', tile: -1, text: cl.ratio < 1 ? '雨が降らず、畑の野菜が育ちません。今年は赤字です。' : '長雨で田んぼが水につかり、稲が倒れました。', cause: `今月の雨は平年の ${pct(cl.ratio)}。作柄は平年の ${pct(cl.crop)} で、農地の税と道の駅の売上が減ります。ため池やダムで水を確保できます。` });
  if (cl?.snow) out.push({ key: 'snow', who: '通勤する人', district: -1, tone: 'warn', layer: 'traffic', tile: -1, text: '雪で道路がつるつるです。いつもの倍の時間をかけて会社へ行きました。', cause: '大雪で道路の流れが 2 割落ちています。除雪の費用（道路の維持費の 35% 増し）もかかります。' });
  // 迷惑施設・葬祭・医療・高齢化（社会の問題）
  if ((st.nimbyHH ?? 0) > 40) { const nf = nimbyField(s); let tile = -1, bv = 0; for (const r of res) { const v = nf[idx(r.x, r.y)]; if (v > bv) { bv = v; tile = idx(r.x, r.y); } }
    out.push({ key: 'nimby', who: '近くの住民', district: -1, tone: (st.nimbyHH ?? 0) > 300 ? 'bad' : 'warn', layer: 'env', tile, text: '家のすぐ近くに清掃工場や工場ができて、においと音、トラックが気になります。引っ越しも考えています。', cause: `ごみ処理場・工場・空港・火葬場・発電所・刑務所などの近くに住む世帯 ${r0(st.nimbyHH ?? 0)}。これらは住宅から離れた場所（工業の地区）に置くと不満が出ません。` }); }
  if ((st.deaths ?? 0) > 3 && (st.cremShort ?? 0) > 0.2) out.push({ key: 'crem', who: '家族を亡くした世帯', district: -1, tone: (st.cremShort ?? 0) > 0.6 ? 'bad' : 'warn', layer: 'welfare', tile: -1, text: '父を見送るのに、隣の市の火葬場が空くまで 1 週間待ちました。費用もかさみました。', cause: `この 1 か月に亡くなった人 ${r0(st.deaths ?? 0)} 人。市内の斎場（火葬場）で受け入れられるのは ${r0(st.cremCap ?? 0)} 件まで。足りない分は隣の市に頼み、1 件 ${P.cremOut} 万円の上乗せがかかります。` });
  if ((st.sick ?? 0) > st.pop * 0.03 && st.pop > 2000) out.push({ key: 'sick', who: '高齢世帯', district: -1, tone: 'warn', layer: 'health', tile: worstIn(-1, b => 1 - (b.sv[7] ?? 1)), text: '持病の通院に 1 時間かかります。入院が必要と言われても、市内の病院は空きがありません。', cause: `治療が必要な人は約 ${r0(st.sick ?? 0)} 人（人口の ${pct((st.sick ?? 0) / Math.max(1, st.pop))}）。医療の水準が低い地区ほど病人と亡くなる人が増えます。病院・急病センター・診療所で下がります。` });
  if ((st.aging ?? 0) > 0.3) out.push({ key: 'aging', who: '自治会長', district: -1, tone: 'warn', layer: 'welfare', tile: -1, text: '町内会の役員はみんな 70 代です。お祭りも見守りも、担い手がいなくなりました。', cause: `高齢化率 ${pct(st.aging ?? 0)}。子育て世帯の転入（保育・学校・住宅）と、福祉の拠点・介護施設で暮らしを支えられます。` });
  if ((st.lonely ?? 0) > 20) out.push({ key: 'lonely', who: '民生委員', district: -1, tone: 'bad', layer: 'welfare', tile: worstIn(-1, b => b.hh![4] * (1 - (b.sv[11] ?? 1))), text: 'ひとり暮らしのお年寄りが、亡くなって何日もたってから見つかりました。見守りが追いつきません。', cause: `見守りが届いていないひとり暮らしの高齢者は約 ${r0(st.lonely ?? 0)} 世帯。福祉の拠点・介護施設・寺社や公民館（地域のつながり）で減らせます。` });
  voiceAll.set(s, out.map(v => ({ key: v.key, who: v.who, text: v.text })));
  // 解消した不満へのお礼（6 か月）
  const th: Voice[] = (s.thanks ?? []).slice().reverse().map(t => ({ key: 'thanks:' + t.key, who: t.who, district: -1, tone: 'good', layer: 'none', tile: -1, text: t.text, cause: `${t.months} か月続いた「${t.was}」という声が、手を打ったことで解消しました（${t.month - s.month === 0 ? '今月' : `${s.month - t.month} か月前`}）。` }));
  return [...th.slice(0, 3), ...out.slice(0, 12)];
}
