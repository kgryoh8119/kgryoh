// v95：オートの計画的な宅地開発。道路に面していない空き地（市の区域の中）に、既存の道路から格子状の生活道路を通す。
// 形は「はしご型」：既存の道路から垂直に 2 本の通り（間隔 4〜6 区画）を延ばし、3 区画ごとに横の通りでつなぐ。
// どの区画も道路に面し、2 本の通りは奥の横の通りでつながるので行き止まりができない（両方の通りが既存の道路に届けば、輪になる）。
// 道路は planRoad（v94 の接続の規則を含む）で置けるものだけを使い、既存の道路網につながる部分だけを引く。sim の計算は変えない。
import { W, H, P, idx, getMap, buildable, roadInfo, planRoad, stationDist } from './sim/index';
import { isLocked } from './sim/mayor';
import type { GameState } from './sim/index';

const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;

export interface GridPlan {
  /** 新しく引く生活道路 */
  road: number[];
  /** 道路に面するようになる空き区画（道路に面していなかったもの） */
  lots: number[];
  /** 新しく道路に面する区画の数 */
  gain: number;
  /** 工事費（万円） */
  cost: number;
  /** 維持費（万円/月） */
  upkeep: number;
  /** 説明用：起点の道路 */
  at: number;
  /** 起点が幹線（2 車線以上）か */
  trunk: boolean;
  /** 2 本の通りの両方が既存の道路に届く（輪になる） */
  loop: boolean;
}

/** 市の区域の中で、まだ使っていない建てられる区画（市街化調整区域は除く） */
export function devFree(s: GameState): (i: number) => boolean {
  const m = getMap(s.seed);
  return (i: number) => !s.occ[i] && !s.road[i] && buildable(m, i) && !isLocked(s, i) && !(s.rail?.[i] && s.railGrade?.[i] !== 2) && (s.area?.[i] ?? 0) !== 1;
}

/** 区画ごとに、市外までつながる道路に面しているか */
export function frontage(s: GameState): Uint8Array {
  const conn = roadInfo(s).conn, f = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) if (s.road[i] && conn[i]) { const x = i % W, y = (i / W) | 0; for (const [dx, dy] of NB) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) f[idx(xx, yy)] = 1; } }
  return f;
}

/** 土地の余り：道路に面した空き区画（すぐ使える）と、道路に面していない空き区画（道路を通せば使える）。
 *  near：道路に面した空き区画のうち、街の中心から 24 区画以内か駅の近く（サービスが届き、人が住みたがる所）。
 *  郊外の国道沿いに空き地がいくら残っていても、中心の近くが埋まったら、中心の近くの奥の土地に道路を通す（細長い沿道の開発より、まとまった街に） */
export function landSpare(s: GameState, center?: { x: number; y: number }): { front: number; back: number; zonedBack: number; near: number } {
  const free = devFree(s), f = frontage(s), sd = stationDist(s); let front = 0, back = 0, zonedBack = 0, near = 0;
  for (let i = 0; i < W * H; i++) {
    if (!free(i)) continue;
    if (f[i]) { front++; if (center && (Math.abs(i % W - center.x) + Math.abs(((i / W) | 0) - center.y) <= 24 || (sd && sd[i] >= 0 && sd[i] <= P.mansionStationRange))) near++; }
    else { back++; if (s.zone[i]) zonedBack++; }
  }
  return { front, back, zonedBack, near };
}

/**
 * 格子状の開発の計画。使えるようになる区画が多く、安く、駅・街の中心・幹線に近いものを選ぶ。
 * center：街の中心（住宅の重心）。サービス（保育・学校など）は中心の近くに集まっているので、近さで代える。
 */
export function planGrid(s: GameState, center: { x: number; y: number }, opt: { maxCost?: number } = {}): GridPlan | null {
  const conn = roadInfo(s).conn, free = devFree(s), front = frontage(s), sd = stationDist(s);
  const isRoad = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !!s.road[idx(x, y)] && !!conn[idx(x, y)];
  const okT = (x: number, y: number) => x >= 1 && y >= 1 && x < W - 1 && y < H - 1 && free(idx(x, y));
  type C = { road: number[]; score: number; at: number; trunk: boolean; loop: boolean };
  const cands: C[] = [];
  for (let i = 0; i < W * H; i++) {
    if (!s.road[i] || !conn[i] || s.road[i] === 3 && false) continue;
    const x0 = i % W, y0 = (i / W) | 0;
    for (const [dx, dy] of NB) {
      if (!okT(x0 + dx, y0 + dy)) continue;
      const px = -dy, py = dx;
      for (const sg of [1, -1]) for (const wd of [5, 4, 6]) {
        const bx = x0 + px * sg * wd, by = y0 + py * sg * wd;
        // 2 本目の通り：起点の横（wd 区画先）が既存の道路なら輪になる。空き地から始めてもよい（奥でつながる）
        const loopB = isRoad(bx, by), startB = loopB || okT(bx, by);
        if (!startB) continue;
        let lu = 0;
        for (let u = 1; u <= 12; u++) {
          const ax = x0 + dx * u, ay = y0 + dy * u, cx = bx + dx * u, cy = by + dy * u;
          if (!okT(ax, ay) || !okT(cx, cy)) break;
          lu = u;
        }
        // 奥の横の通りがすべて通せる所まで（3 区画ごと）
        let L = lu - (lu % 3);
        const rungOk = (u: number) => { for (let v = 1; v < wd; v++) { const xx = x0 + dx * u + px * sg * v, yy = y0 + dy * u + py * sg * v; if (!okT(xx, yy) && !isRoad(xx, yy)) return false; } return true; };
        while (L >= 3 && !rungOk(L)) L -= 3;
        if (L < 3) continue;
        const road: number[] = [];
        for (let u = 1; u <= L; u++) { road.push(idx(x0 + dx * u, y0 + dy * u)); road.push(idx(bx + dx * u, by + dy * u)); }
        if (!loopB) road.push(idx(bx, by));
        for (let u = 3; u <= L; u += 3) for (let v = 1; v < wd; v++) { const xx = x0 + dx * u + px * sg * v, yy = y0 + dy * u + py * sg * v; if (okT(xx, yy)) road.push(idx(xx, yy)); }
        // 使えるようになる区画（いま道路に面していない空き区画で、新しい道路に面するもの）
        const rs = new Set(road), seen = new Set<number>(); let gain = 0;
        for (const t of road) { const tx = t % W, ty = (t / W) | 0; for (const [ex, ey] of NB) { const xx = tx + ex, yy = ty + ey; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = idx(xx, yy); if (rs.has(j) || seen.has(j) || !free(j) || front[j]) continue; seen.add(j); gain++; } }
        if (gain < 10 || gain < road.length * 0.8) continue;
        const cost = road.length * P.roadCost[1];
        if (opt.maxCost !== undefined && cost > opt.maxCost) continue;
        const dc = Math.abs(x0 - center.x) + Math.abs(y0 - center.y), ds = sd && sd[i] >= 0 ? sd[i] : 99;
        const score = gain * 900 - cost - dc * 60 + (ds <= P.mansionStationRange ? 4000 - ds * 100 : 0) + (s.road[i] >= 2 ? 2500 : 0) + (loopB ? 3000 : 0);
        cands.push({ road, score, at: i, trunk: s.road[i] >= 2, loop: loopB });
      }
    }
  }
  cands.sort((a, b) => b.score - a.score || a.at - b.at);
  // 上位から、実際に通せる道路（planRoad：急斜面・v94 の接続の規則）だけで、既存の道路網につながる部分を確かめる
  for (const c of cands.slice(0, 6)) {
    const pr = planRoad(s, c.road, 1), ok = new Set(pr.ok.filter(i => !s.occ[i]));
    const reach = new Set<number>(), q: number[] = [];
    for (const i of ok) { const x = i % W, y = (i / W) | 0; if (NB.some(([dx, dy]) => isRoad(x + dx, y + dy))) { reach.add(i); q.push(i); } }
    for (let h = 0; h < q.length; h++) { const x = q[h] % W, y = (q[h] / W) | 0; for (const [dx, dy] of NB) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = idx(xx, yy); if (ok.has(j) && !reach.has(j)) { reach.add(j); q.push(j); } } }
    if (reach.size < 4) continue;
    const road = [...reach], seen = new Set<number>();
    for (const t of road) { const tx = t % W, ty = (t / W) | 0; for (const [ex, ey] of NB) { const xx = tx + ex, yy = ty + ey; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = idx(xx, yy); if (!reach.has(j) && free(j) && !front[j]) seen.add(j); } }
    const lots = [...seen];
    if (lots.length < 8 || lots.length < road.length * 0.7) continue;
    return { road, lots, gain: lots.length, cost: road.length * P.roadCost[1], upkeep: road.length * P.roadUpkeep[1], at: c.at, trunk: c.trunk, loop: c.loop && reach.size === c.road.length };
  }
  return null;
}
