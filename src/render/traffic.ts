// v87：街の状態を画面の動きで見せる（渋滞・駅と列車の満員・緊急出動）。描画だけの計算で、sim の状態と乱数には触れない
import type { GameState, Building } from '../sim/index';

/** 緊急車両の種類：0 パトカー・1 救急車・2 消防車（車の形 vm は 10・11・12） */
export type EmKind = 0 | 1 | 2;
export const EM_VM = [10, 11, 12] as const;
/** 出動する拠点の種類 */
export const EM_BASE: readonly (readonly string[])[] = [['police', 'koban'], ['fire'], ['fire']];
export const HOSPITALS = ['hospital', 'univHospital', 'clinic', 'nightClinic'];

/** できごと → 出動する車。出動しないできごとは null */
export function emPlan(id: string): EmKind[] | null {
  switch (id) {
    case 'bigFire': return [2, 2, 2, 1, 0];
    case 'fireDelay': return [2, 2, 1];
    case 'accident': case 'highwayCrash': return [0, 0, 1, 1];
    case 'murder': return [0, 0, 0, 1];
    case 'tokuryu': case 'burglary': case 'spy': return [0, 0];
    case 'bear': return [0, 0];
    case 'quake': case 'megaQuake': case 'nankai': case 'tornado': case 'landslide': case 'typhoon': case 'megaRain': case 'linearRain': case 'flood': return [2, 1, 0, 1, 2];
    case 'heat': case 'epidemic': return [1, 1];
    case 'pipeBurst': return [0];
    default: return null;
  }
}

/** 道路の上の最短経路（4 近傍の幅優先）。from・to は道路の区画。見つからなければ null */
export function roadRoute(road: ArrayLike<number>, W: number, H: number, from: number, to: number): number[] | null {
  if (from < 0 || to < 0 || !road[from] || !road[to]) return null;
  if (from === to) return [from];
  const prev = new Int32Array(W * H).fill(-1); prev[from] = from;
  const q = new Int32Array(W * H); let qh = 0, qt = 0; q[qt++] = from;
  while (qh < qt) {
    const c = q[qh++], x = c % W, y = (c / W) | 0;
    for (let d = 0; d < 4; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0), ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const n = ny * W + nx; if (prev[n] >= 0 || !road[n]) continue;
      prev[n] = c; if (n === to) { const out = [n]; let k = n; while (k !== from) { k = prev[k]; out.push(k); } return out.reverse(); }
      q[qt++] = n;
    }
  }
  return null;
}

/** 区画 t（建物なら外周）にいちばん近い道路の区画（なければ -1） */
export function roadNear(road: ArrayLike<number>, W: number, H: number, x0: number, y0: number, w = 1, h = 1, R = 6): number {
  for (let r = 1; r <= R; r++) {
    let best = -1, bd = 1e9;
    for (let y = y0 - r; y < y0 + h + r; y++) for (let x = x0 - r; x < x0 + w + r; x++) {
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (x >= x0 - r + 1 && x < x0 + w + r - 1 && y >= y0 - r + 1 && y < y0 + h + r - 1) continue; // 輪の上だけ
      const i = y * W + x; if (!road[i]) continue;
      const d = Math.abs(x - (x0 + w / 2)) + Math.abs(y - (y0 + h / 2)); if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** できごとの対象（区画番号または建物 id）から、現場の建物（なければ null）と区画 */
export function emSite(s: GameState, target: number, W: number, H: number, rnd: () => number): { b: Building | null; x: number; y: number } | null {
  const N = W * H;
  if (target >= 0 && target < N) {
    const x = target % W, y = (target / W) | 0;
    const b = s.buildings.find(o => x >= o.x && x < o.x + o.w && y >= o.y && y < o.y + o.h) ?? null;
    return { b, x, y };
  }
  const byId = s.buildings.find(o => o.id === target); if (byId) return { b: byId, x: byId.x, y: byId.y };
  const res = s.buildings.filter(o => o.status === 'operating' && (o.hh || o.kind === 'house'));
  if (!res.length) return null; const b = res[(rnd() * res.length) | 0]; return { b, x: b.x, y: b.y };
}

/** 最寄りの拠点（直線距離）。kinds のどれも無ければ null */
export function nearestBase(s: GameState, kinds: readonly string[], x: number, y: number): Building | null {
  let best: Building | null = null, bd = 1e9;
  for (const b of s.buildings) { if (b.status !== 'operating' || !kinds.includes(b.kind)) continue; const d = Math.abs(b.x - x) + Math.abs(b.y - y); if (d < bd) { bd = d; best = b; } }
  return best;
}

/** 渋滞の見え方：区間の混雑率（時刻で増減した値 v）から、区間あたりの列の台数・車間の詰め（m）・のろのろの強さ（0〜1） */
export function jamLook(v: number): { per: number; gap: number; crawl: number } {
  if (v < 0.9) return { per: 0, gap: 2, crawl: 0 };
  const per = Math.min(v > 1.5 ? 7 : v > 1 ? 5 : 3, Math.round((v - 0.6) * 3.2));
  return { per, gap: v > 1.5 ? 0.9 : v > 1 ? 1.3 : 1.8, crawl: Math.max(0, Math.min(1, (v - 0.95) * 1.6)) };
}

/** 駅の混雑率（%、sim の stationStats の crowd。140 で定員ちょうど）→ 見え方。
 *  load：定員に対する比。fill：ホームの埋まり方の倍率。spill：駅前へあふれる人の割合（0〜1）。left：発車後に乗り残す割合。pax：1 両の窓に見える人の数（片側） */
export function stationLook(crowd: number): { load: number; fill: number; spill: number; left: number; pax: number; c: number; plat: number; dense: number; queue: number; street: number } {
  const load = Math.max(0, (crowd - 40) / 100), c = crowd / 100, cl = (v: number) => Math.max(0, Math.min(1, v));
  // v88：表示の混雑率 c（1.0 で「混んでいる」、1.5 で「あふれている」）で段階をつける。plat：ホームの埋まり方（0〜1）、dense：ホームの詰まり（すき間を埋める人）、
  // spill：改札前から駅前広場へ広がる割合、queue：入場規制で入口の外に伸びる列、street：まわりの歩道にあふれる人
  return { load, fill: Math.min(2.2, 0.5 + load * 0.7), spill: cl((c - 0.85) / 0.65), left: Math.max(0.15, Math.min(0.65, (load - 1.3) / 1.4)), pax: Math.round(Math.min(12, 1 + load * 5)),
    c, plat: cl(0.15 + 0.6 * c), dense: cl((c - 0.95) / 0.5), queue: cl((c - 1.2) / 0.3), street: cl((c - 1.1) / 0.4) };
}

/** 右折か（左側通行。区画の並び cur → next → nn で、進む向きが右へ 90 度変わる） */
export function isRightTurn(W: number, cur: number, next: number, nn: number): boolean {
  const ax = next % W - cur % W, az = ((next / W) | 0) - ((cur / W) | 0), bx = nn % W - next % W, bz = ((nn / W) | 0) - ((next / W) | 0);
  return -az * bx + ax * bz > 0.5; // 右の向き = (-az, ax)
}
