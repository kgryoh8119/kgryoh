// v97：オートの鉄道の延伸と新駅。人口が増えて、駅勢圏（駅から 800m〜1km）の外に住宅地がまとまってできたら、
// 既存の駅から支線を延ばして新しい駅を置く（市の操作 { type: 'rail' } と駅の建設 { type: 'build', kind: 'station' } だけを使う）。
// 線路の区画は斜めの隣でつながるので、本線から直接分けると急な分岐（90 度）になり planRail に断られる。鉄道会社の新線（raildev.ts）と同じく、
// 既存の駅の本線と反対側から出て、駅で乗り換える支線にする。道筋は raildev の route（1 歩 45 度まで・ほかの線路に寄らない）。
// 高さ：川の上と国道を越える所は高架、建物・林・公園の下は地下、ほかは地上（道路とは踏切）。踏切が隣り合う所（v94 の規則）や、
// 立体交差の坂と重なる所は planRail の bad を見て高架・地下に上げる。sim の計算は変えない。
import { W, H, P, DEFS, idx, getMap, isRes, checkPlace, planRail, sumHH } from './sim/index';
import { isLocked } from './sim/mayor';
import { route, findSite } from './sim/raildev';
import { sharpAt } from './sim/railnet';
import type { GameState } from './sim/index';

/** 駅勢圏（区画）：800m ≒ 27 区画。その外（1km ≒ 33 区画まで含めて 30 区画より遠い所）を「駅から遠い」とする */
export const FAR = 30;

export interface BranchPlan {
  /** 敷く線路（起点の駅のそばから新駅まで、順に） */
  tiles: number[];
  /** 区画ごとの高さ（0 地上・1 高架・2 地下） */
  grade: number[];
  /** 新駅の左上（3×1） */
  site: [number, number];
  /** 線路と駅の工事費（万円） */
  cost: number;
  railCost: number;
  /** 線路の負担金（万円/月） */
  upkeep: number;
  /** 新駅の駅勢圏に入る、駅から遠かった住宅の戸数 */
  units: number;
  /** 起点の駅 */
  from: number;
  /** 踏切・高架・地下の区画数 */
  cross: number; high: number; under: number;
}

/** 駅から遠い住宅のまとまり：中心と戸数。多い順に、重ならないものを n か所まで */
export function farClusters(s: GameState, n = 3): { x: number; y: number; units: number }[] {
  const sts = s.buildings.filter(b => b.kind === 'station');
  const dist = (x: number, y: number) => sts.reduce((a, b) => Math.min(a, Math.abs(b.x + 1 - x) + Math.abs(b.y - y)), 1e9);
  const u = new Float32Array(W * H);
  for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating' && dist(b.x, b.y) > FAR) u[idx(b.x, b.y)] += Math.max(b.units ?? 0, sumHH(b));
  const all: { x: number; y: number; units: number }[] = [];
  for (let y = 4; y < H - 4; y += 3) for (let x = 4; x < W - 4; x += 3) {
    let v = 0; for (let dy = -9; dy <= 9; dy++) for (let dx = -9; dx <= 9; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && Math.abs(dx) + Math.abs(dy) <= 12) v += u[idx(xx, yy)]; }
    if (v > 0) all.push({ x, y, units: v });
  }
  all.sort((a, b) => b.units - a.units);
  const out: typeof all = [];
  for (const c of all) { if (out.length >= n) break; if (out.every(o => Math.abs(o.x - c.x) + Math.abs(o.y - c.y) > 24)) out.push(c); }
  return out;
}

/** 支線と新駅の計画：駅から遠い住宅のまとまり（上位 3 か所）と起点の駅の組み合わせのうち、1 戸あたりの工事費がいちばん安いもの。つくれなければ null */
export function planBranch(s: GameState, minUnits: number): BranchPlan | null {
  if (!s.rail) return null;
  let best: BranchPlan | null = null;
  for (const c of farClusters(s)) {
    if (c.units < minUnits) break;
    const p = planTo(s, c);
    if (p && (!best || p.cost / p.units < best.cost / best.units)) best = p;
  }
  return best;
}

function planTo(s: GameState, c: { x: number; y: number; units: number }): BranchPlan | null {
  const m = getMap(s.seed), rail = s.rail!, has = (i: number) => rail[i] > 0;
  const sts = s.buildings.filter(b => b.kind === 'station');
  // 新駅の場所：まとまりの中心に近い、道路に面した 3×1 の空き地（市の区域の中）
  let site = findSite(s, c.x, c.y, 7) ?? findSite(s, c.x, c.y, 11);
  if (site && [0, 1, 2].some(dx => isLocked(s, idx(site![0] + dx, site![1])))) site = null;
  if (!site) return null;
  if (sts.some(b => Math.abs(b.x - site![0]) + Math.abs(b.y - site![1]) < 22)) return null;
  { const cash = s.cash; s.cash = 1e12; try { const pc = checkPlace(s, 'station', site[0], site[1]); if (!pc.ok && pc.reasons.some(r => !/線路に面していません/.test(r)) && pc.level === 'error') return null; } finally { s.cash = cash; } }
  // 起点：既存の駅の、本線と反対側の列（本線とは 1 区画あける）。駅に沿って 3 区画まっすぐ出てから曲がる
  const near1 = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && has(idx(x + dx, y + dy))) return true; return false; };
  const starts: { seq: number[]; v: [number, number]; d: number; from: number }[] = [];
  for (const b of sts) {
    if (b.status !== 'operating') continue;
    const row = (y: number) => [0, 1, 2].some(dx => y >= 0 && y < H && has(idx(b.x + dx, y)));
    const rowSeq = (y: number) => [0, 1, 2].map(dx => idx(b.x + dx, y));
    const cands: [number[], [number, number]][] = [];
    if (row(b.y - 1) && !row(b.y + 1) && b.y + 1 < H - 1) { const q = rowSeq(b.y + 1); cands.push([q, [1, 0]], [[...q].reverse(), [-1, 0]]); }
    if (row(b.y + 1) && !row(b.y - 1) && b.y - 1 > 0) { const q = rowSeq(b.y - 1); cands.push([q, [1, 0]], [[...q].reverse(), [-1, 0]]); }
    for (const [seq, v] of cands) {
      if (seq.some(i => near1(i % W, (i / W) | 0) || m.water[i] || s.occ[i] || isLocked(s, i))) continue;
      const e = seq[seq.length - 1], d = Math.hypot(site[0] + 1 - e % W, site[1] - ((e / W) | 0));
      if (d < 12 || d > 80) continue;
      if (Math.sign(site[0] + 1 - e % W) !== v[0] && Math.abs(site[0] + 1 - e % W) > Math.abs(site[1] - ((e / W) | 0))) continue; // 目的地と逆向きに出ない
      starts.push({ seq, v, d, from: b.id });
    }
  }
  starts.sort((a, b) => a.d - b.d);
  const w = weight(s);
  let best: BranchPlan | null = null;
  for (const st of starts.slice(0, 4)) {
    const p = route(s, st.seq[st.seq.length - 1], st.v, site, new Set(st.seq), w); if (!p) continue;
    const tiles = [...st.seq, ...p.slice(1)];
    if (tiles.some(i => isLocked(s, i))) continue;
    const set = new Set(tiles), h2 = (i: number) => has(i) || set.has(i);
    if (tiles.some(i => sharpAt(h2, i))) continue;
    const grade = pickGrade(s, tiles);
    const chk = checkRuns(s, tiles, grade); if (!chk) continue;
    const upkeep = tiles.reduce((a, _i, k) => a + (P.railUpkeep[1] ?? 0) * [1, 1.5, 2, 1.3][grade[k]], 0);
    const plan: BranchPlan = { tiles, grade, site, cost: chk + DEFS.station.cost, railCost: chk, upkeep, units: c.units, from: st.from, cross: tiles.filter((i, k) => s.road[i] && !grade[k]).length, high: grade.filter(g => g === 1).length, under: grade.filter(g => g === 2).length };
    if (!best || plan.cost < best.cost) best = plan; // 最短（いちばん安い）起点から延ばす
  }
  return best;
}

/** 区画の重み（工事費の倍率に近く）：建物の下は地下で高く、道路は踏切 1 か所ならよいが沿って走らない、川は高架の橋、国道は高架 */
function weight(s: GameState): (i: number) => number {
  const m = getMap(s.seed);
  return (i: number) => s.occ[i] ? 6 : (m.forest[i] || (m.park && m.park[i]) || (m.blocked && m.blocked[i])) ? 5 : m.water[i] ? 3.2 : s.road[i] === 3 ? 4 : s.road[i] ? 3 : m.steep[i] ? 1.5 : 1;
}

/** 工事の途中で、残りの区間の用地が変わった（家が建った・鉄道会社の新線が近くに来た）とき：残りの高さを選び直し、
 *  それでも敷けなければ、敷き終えた所から新駅まで道筋を引き直す。laid は敷き終えた区画の数。つくれなければ null */
export function replanRest(s: GameState, tiles: number[], laid: number, site: [number, number]): { tiles: number[]; grade: number[]; cost: number } | null {
  if (!s.rail) return null;
  const rest = tiles.slice(laid);
  { const g = pickGrade(s, rest), c = checkRuns(s, rest, g); if (c) return { tiles: [...tiles.slice(0, laid), ...rest], grade: g, cost: c }; }
  if (laid < 2) return null;
  const a = tiles[laid - 2], b = tiles[laid - 1], v: [number, number] = [Math.sign(b % W - a % W), Math.sign(((b / W) | 0) - ((a / W) | 0))];
  // 敷き終えた区画は、道筋を探す間だけ線路がないものとして扱う（route はほかの線路の隣を通らないため）
  const done = tiles.slice(0, laid), keep = done.map(i => s.rail![i]);
  let p: number[] | null = null;
  try { for (const i of done) s.rail![i] = 0; p = route(s, b, v, site, new Set(done.slice(0, -1)), weight(s)); } finally { done.forEach((i, k) => { s.rail![i] = keep[k]; }); }
  if (!p) return null;
  const nt = p.slice(1); if (!nt.length || nt.some(i => isLocked(s, i))) return null;
  const set = new Set(nt), h2 = (i: number) => s.rail![i] > 0 || set.has(i);
  if ([b, ...nt].some(i => sharpAt(h2, i))) return null;
  const g = pickGrade(s, nt), c = checkRuns(s, nt, g); if (!c) return null;
  return { tiles: [...done, ...nt], grade: g, cost: c };
}

/** 高さを決める：川・国道は高架、建物・林・公園の下は地下、ほかは地上。短い地上の区間は前後に合わせ、隣り合う踏切は高架に */
function pickGrade(s: GameState, tiles: number[]): number[] {
  const m = getMap(s.seed);
  const need = (i: number) => (s.occ[i] || m.forest[i] || (m.park && m.park[i]) || (m.blocked && m.blocked[i])) ? 2 : m.water[i] || s.road[i] === 3 ? 1 : 0;
  const g: number[] = tiles.map(need);
  // 高架・地下へは前後 1 区画で上がり下がりする（国道・川の手前から高架に）
  for (let k = 0; k < g.length; k++) if (g[k] === 1) for (const j of [k - 1, k + 1]) if (j >= 0 && j < g.length && g[j] === 0 && need(tiles[j]) === 0) g[j] = 3; // 仮の印
  for (let k = 0; k < g.length; k++) if (g[k] === 3) g[k] = 1;
  // 短い地上の区間（3 区画以下）が高架・地下にはさまれていれば、高架にする（細かく上下しない）
  for (let k = 0; k < g.length; k++) if (g[k] === 0) { let e = k; while (e < g.length && g[e] === 0) e++; if (k > 0 && e < g.length && e - k <= 3) for (let q = k; q < e; q++) g[q] = 1; k = e; }
  // 踏切が隣り合う（v94：踏切は 1 区画ずつ。並ぶと渋滞と事故のもと）なら、その区間は高架
  const lx = (i: number, k: number) => !!s.road[i] && g[k] === 0;
  const pos = new Map(tiles.map((i, k) => [i, k] as const));
  for (let k = 0; k < g.length; k++) {
    if (!lx(tiles[k], k)) continue;
    const x = tiles[k] % W, y = (tiles[k] / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const j = idx(xx, yy), q = pos.get(j);
      if ((q !== undefined && lx(j, q)) || (s.road[j] && s.rail![j] && !(s.railGrade?.[j] ?? 0))) { g[k] = 1; if (q !== undefined && g[q] === 0) g[q] = 1; }
    }
  }
  return g;
}

/** 高さごとの連続した区間に分けて planRail で確かめ、断られた区画は高架→地下に上げる。全部敷けるなら工事費、だめなら 0 */
function checkRuns(s: GameState, tiles: number[], g: number[]): number {
  for (let tries = 0; tries < 4; tries++) {
    let cost = 0, bump = false;
    for (const run of runs(g)) {
      const ts = tiles.slice(run.a, run.b), pl = planRail(s, ts, 1, run.g as 0 | 1 | 2);
      if (pl.bad.length) {
        bump = true;
        for (const [i] of pl.bad) { const k = tiles.indexOf(i); if (k >= 0 && g[k] < 2) g[k] = g[k] === 0 ? 1 : 2; }
        if (pl.bad.every(([i]) => g[tiles.indexOf(i)] === 2 && run.g === 2)) return 0; // 地下でも敷けない
        break;
      }
      cost += pl.cost;
    }
    if (!bump) return cost;
  }
  return 0;
}

/** 同じ高さの連続区間 [a, b) */
export function runs(g: number[]): { a: number; b: number; g: number }[] {
  const out: { a: number; b: number; g: number }[] = [];
  for (let k = 0; k < g.length;) { let e = k; while (e < g.length && g[e] === g[k]) e++; out.push({ a: k, b: e, g: g[k] }); k = e; }
  return out;
}

/** 駅前の商業：新駅の敷地から 3 区画以内の、道路に面した空き地（用途の決まっていない所か低層住宅） */
export function stationFront(s: GameState, site: [number, number]): number[] {
  const m = getMap(s.seed), out: number[] = [];
  for (let y = site[1] - 3; y <= site[1] + 3; y++) for (let x = site[0] - 3; x <= site[0] + 5; x++) {
    if (x < 0 || y < 0 || x >= W || y >= H) continue;
    const i = idx(x, y);
    if (s.occ[i] || s.road[i] || s.rail?.[i] || m.water[i] || isLocked(s, i) || (s.zone[i] && s.zone[i] !== 1)) continue;
    if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && s.road[idx(x + dx, y + dy)])) out.push(i);
  }
  return out;
}

