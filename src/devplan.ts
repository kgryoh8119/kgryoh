// 区画整理の計画：道路に面していない空き地（住宅の裏に取り残された土地）に道路を通す。
// 入口をふさぐ住宅は買い取る。画面の［区画整理］ツールとオートプレイで共用する。
import { W, H, P, idx, getMap, buildable, roadInfo, isRes, planRoad } from './sim/index';
import { buyoutCost } from './sim/actions';
import type { GameState, Building } from './sim/index';

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

/** 区画整理の割り付け：長い辺の向きに 3 区画ごとの通り（区画・道路・区画）と、短い辺の一方に通りどうしをつなぐ道路。既存の道路に近い側をつなぎにする */
export function devLayout(s: GameState, tiles: number[]): { road: number[]; lots: number[] } {
  if (!tiles.length) return { road: [], lots: [] };
  let x0 = W, y0 = H, x1 = 0, y1 = 0; for (const i of tiles) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const horiz = x1 - x0 >= y1 - y0, road = new Set<number>();
  const near = (x: number, y: number) => { for (const [dx, dy] of NB) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && s.road[idx(xx, yy)]) return 1; } return 0; };
  if (horiz) {
    for (let y = y0 + 1; y <= y1; y += 3) for (let x = x0; x <= x1; x++) road.add(idx(x, y));
    let l = 0, r = 0; for (let y = y0; y <= y1; y++) { l += near(x0, y); r += near(x1, y); }
    const sx = r > l ? x1 : x0; for (let y = y0; y <= y1; y++) road.add(idx(sx, y));
  } else {
    for (let x = x0 + 1; x <= x1; x += 3) for (let y = y0; y <= y1; y++) road.add(idx(x, y));
    let t = 0, b = 0; for (let x = x0; x <= x1; x++) { t += near(x, y0); b += near(x, y1); }
    const sy = b > t ? y1 : y0; for (let x = x0; x <= x1; x++) road.add(idx(x, sy));
  }
  const rs = [...road].filter(i => !s.road[i]);
  return { road: rs, lots: tiles.filter(i => !road.has(i) && !s.road[i]) };
}

export interface Redevelop {
  /** 買い取る住宅 */
  buy: number[];
  /** 新しくつくる生活道路 */
  road: number[];
  /** 道路に面するようになる空き区画（用途を指定できる） */
  lots: number[];
  /** 費用（買収 + 道路、万円） */
  cost: number;
  /** 取り残されていた空き地のうち、使えるようになる区画の数 */
  gain: number;
  /** 説明用：中心の区画 */
  at: number;
}

/**
 * 取り残された空き地を探し、道路の通し方を決める。
 * 空き地のかたまりごとに、3 区画ごとの通りを割り付け、既存の道路網につながらない部分は
 * 空き地か 1 区画の住宅（買い取る）を通る最も安い経路でつなぐ。使えるようになる区画が多く、費用の安いものを選ぶ。
 */
export function planRedevelop(s: GameState, opt: { maxBuy?: number; maxCost?: number; minGain?: number; at?: number } = {}): Redevelop | null {
  const maxBuy = opt.maxBuy ?? 3, maxCost = opt.maxCost ?? Infinity, minGain = opt.minGain ?? 6;
  const m = getMap(s.seed), conn = roadInfo(s).conn, N = W * H;
  const byId = new Map<number, Building>(); for (const b of s.buildings) byId.set(b.id, b);
  const free = (i: number) => !s.occ[i] && !s.road[i] && buildable(m, i) && !(s.rail?.[i] && s.railGrade?.[i] !== 2);
  const buyable = (i: number) => { const b = s.occ[i] ? byId.get(s.occ[i]) : undefined; return !!b && isRes(b.kind) && b.w === 1 && b.h === 1 && !b.sandbox && !b.osm && b.status === 'operating' ? b : null; };
  const nbr = (i: number) => { const x = i % W, y = (i / W) | 0, out: number[] = []; for (const [dx, dy] of NB) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) out.push(idx(xx, yy)); } return out; };
  const onRoad = (i: number) => nbr(i).some(j => s.road[j] && conn[j]);
  // 取り残された空き地のかたまり
  const comp = new Int32Array(N).fill(-1), groups: number[][] = [];
  for (let i = 0; i < N; i++) {
    if (comp[i] >= 0 || !free(i)) continue;
    const g: number[] = [i]; comp[i] = groups.length;
    for (let h = 0; h < g.length; h++) for (const j of nbr(g[h])) if (comp[j] < 0 && free(j)) { comp[j] = groups.length; g.push(j); }
    groups.push(g);
  }
  const cand = groups.filter((_, k) => opt.at === undefined || comp[opt.at] === k).map(g => ({ g, locked: g.filter(i => !onRoad(i)).length })).filter(c => c.locked >= minGain).sort((a, b) => b.locked - a.locked).slice(0, 8);
  let best: Redevelop | null = null, bestScore = -Infinity;
  for (const { g } of cand) {
    // 大きすぎるかたまりは、道路に近い側から 12×12 ほどずつ
    let tiles = g;
    if (g.length > 150) {
      const seed = g.find(i => !onRoad(i) && nbr(i).some(j => onRoad(j) || buyable(j))) ?? g[0], sx = seed % W, sy = (seed / W) | 0;
      tiles = g.filter(i => Math.abs(i % W - sx) <= 6 && Math.abs(((i / W) | 0) - sy) <= 6);
    }
    const inSet = new Set(tiles);
    const lay = devLayout(s, tiles);
    const newRoad = new Set(lay.road.filter(i => inSet.has(i)));
    const buy = new Set<number>(); let buyCost = 0;
    // 道路網につながるまで、つながっていない部分を最も安い経路でつなぐ
    for (let guard = 0; guard < 6; guard++) {
      // つながっている新しい道路（既存の道路網に面しているところから広げる）
      const ok = new Set<number>(), q: number[] = [];
      for (const i of newRoad) if (nbr(i).some(j => s.road[j] && conn[j])) { ok.add(i); q.push(i); }
      for (let h = 0; h < q.length; h++) for (const j of nbr(q[h])) if (newRoad.has(j) && !ok.has(j)) { ok.add(j); q.push(j); }
      const rest = [...newRoad].filter(i => !ok.has(i));
      if (!rest.length && newRoad.size) break;
      // 経路探索（費用：空き地は道路代、住宅は買収 + 道路代）。始点はつながっていない道路、なければかたまりの中の取り残された区画
      const src = rest.length ? rest : tiles.filter(i => !onRoad(i)).slice(0, 40);
      const dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), heap: [number, number][] = [];
      const push = (d: number, i: number) => { heap.push([d, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
      const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let mn = k; if (l < heap.length && heap[l][0] < heap[mn][0]) mn = l; if (r < heap.length && heap[r][0] < heap[mn][0]) mn = r; if (mn === k) break; [heap[mn], heap[k]] = [heap[k], heap[mn]]; k = mn; } } return top; };
      for (const i of src) { dist[i] = 0; push(0, i); }
      let goal = -1;
      while (heap.length) {
        const [d, i] = pop(); if (d > dist[i]) continue;
        if (nbr(i).some(j => (s.road[j] && conn[j]) || ok.has(j))) { goal = i; break; }
        for (const j of nbr(i)) {
          let c: number;
          if (newRoad.has(j) || free(j)) c = P.roadCost[1];
          else { const b = buyable(j); if (!b) continue; c = P.roadCost[1] + buyoutCost(s, b) + 1500; } // 住宅は避けられるなら避ける
          if (d + c < dist[j]) { dist[j] = d + c; prev[j] = i; push(d + c, j); }
        }
      }
      if (goal < 0) break;
      for (let i = goal; i >= 0; i = prev[i]) { newRoad.add(i); const b = buyable(i); if (b && !buy.has(b.id)) { buy.add(b.id); buyCost += buyoutCost(s, b); } }
      if (buy.size > maxBuy) break;
    }
    if (buy.size > maxBuy) continue;
    // 実際に通せる道路（急斜面などを除く）と、つながる部分だけ
    const pr = planRoad(s, [...newRoad].filter(i => !s.occ[i] || buy.has(s.occ[i])), 1);
    const okRoad = new Set(pr.ok.filter(i => !s.occ[i]).concat([...newRoad].filter(i => s.occ[i] && buy.has(s.occ[i]))));
    const reach = new Set<number>(), q: number[] = [];
    for (const i of okRoad) if (nbr(i).some(j => s.road[j] && conn[j])) { reach.add(i); q.push(i); }
    for (let h = 0; h < q.length; h++) for (const j of nbr(q[h])) if (okRoad.has(j) && !reach.has(j)) { reach.add(j); q.push(j); }
    if (!reach.size) continue;
    const road = [...reach];
    const lots = tiles.filter(i => !reach.has(i) && free(i) && !onRoad(i) && nbr(i).some(j => reach.has(j)));
    const gain = lots.length;
    if (gain < minGain) continue;
    const cost = buyCost + P.roadCost[1] * road.length;
    if (cost > maxCost) continue;
    const usedBuy = [...buy].filter(id => { const b = byId.get(id)!; return reach.has(idx(b.x, b.y)); });
    const score = gain * 900 - cost; // 1 区画あたり 900 万円ほどの価値（税収で回収できる目安）
    if (score > bestScore) { bestScore = score; best = { buy: usedBuy, road, lots, cost: usedBuy.reduce((a, id) => a + buyoutCost(s, byId.get(id)!), 0) + P.roadCost[1] * road.length, gain, at: lots[lots.length >> 1] ?? road[0] }; }
  }
  return best && bestScore > 0 ? best : null;
}
