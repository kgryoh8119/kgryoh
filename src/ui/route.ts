// 実在都市版の置きやすさ：道路の自動ルートと、施設の置き場所の吸着。どちらも画面側の補助で、実行は通常の操作（dispatch）を通る。
import { railNbrs, railLine } from '../sim/railnet';
import { W, H, DEFS, getMap, landReason, idx, inMap, acquirable, checkPlace } from '../sim/index';
import type { GameState, Kind, Building } from '../sim/index';

const byIdOf = (s: GameState) => { const m = new Map<number, Building>(); for (const b of s.buildings) m.set(b.id, b); return m; };

/**
 * 道路の自動ルート：始点から終点まで、通れる区画を通る最も安い道筋（上下左右のつながり）。
 * 既存の道路はほぼ無料、空き地は 1、住宅の街区（用地買収）は重く、川・線路・急斜面・施設は通らない。
 * 見つからなければ null（呼び出し側はまっすぐの線にする）。
 */
export function routeRoad(s: GameState, a: number, b: number): number[] | null {
  if (a === b) return [a];
  const m = getMap(s.seed), byId = byIdOf(s);
  const ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0, PAD = 12;
  const x0 = Math.max(0, Math.min(ax, bx) - PAD), x1 = Math.min(W - 1, Math.max(ax, bx) + PAD), y0 = Math.max(0, Math.min(ay, by) - PAD), y1 = Math.min(H - 1, Math.max(ay, by) + PAD);
  const cost = (i: number): number => {
    if (s.road[i]) return 0.35;
    const ab = s.occ[i] ? acquirable(s, i, byId) : null;
    if (s.occ[i] && !ab) return Infinity;
    if ((!ab || !m.steep[i]) && landReason(m, i)) return Infinity;
    return ab ? 7 : 1;
  };
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, n = bw * bh, local = (x: number, y: number) => (y - y0) * bw + (x - x0);
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), seen = new Uint8Array(n);
  // 小さな二分ヒープ（[推定コスト, 区画]）
  const heap: [number, number][] = [];
  const push = (f: number, k: number) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let mi = i; if (l < heap.length && heap[l][0] < heap[mi][0]) mi = l; if (r < heap.length && heap[r][0] < heap[mi][0]) mi = r; if (mi === i) break; [heap[mi], heap[i]] = [heap[i], heap[mi]]; i = mi; } } return top; };
  const hEst = (x: number, y: number) => (Math.abs(x - bx) + Math.abs(y - by)) * 0.35;
  const sa = local(ax, ay), sb = local(bx, by);
  if (cost(b) === Infinity) return null;
  dist[sa] = 0; push(hEst(ax, ay), sa);
  let guard = 0;
  while (heap.length && guard++ < 40000) {
    const [, k] = pop();
    if (seen[k]) continue; seen[k] = 1;
    if (k === sb) break;
    const x = (k % bw) + x0, y = ((k / bw) | 0) + y0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < x0 || nx > x1 || ny < y0 || ny > y1) continue;
      const nk = local(nx, ny); if (seen[nk]) continue;
      const c = cost(idx(nx, ny)); if (c === Infinity) continue;
      // 曲がり角を少し嫌う（まっすぐな道になりやすく）
      const p = prev[k], turn = p >= 0 && ((p % bw) + x0 !== x - dx || ((p / bw) | 0) + y0 !== y - dy) ? 0.15 : 0;
      const nd = dist[k] + c + turn;
      if (nd < dist[nk]) { dist[nk] = nd; prev[nk] = k; push(nd + hEst(nx, ny), nk); }
    }
  }
  if (!seen[sb]) return null;
  const out: number[] = [];
  for (let k = sb; k >= 0; k = prev[k]) out.push(idx((k % bw) + x0, ((k / bw) | 0) + y0));
  return out.reverse();
}

/**
 * 施設の置き場所の吸着：指した場所に置ければそのまま。置けなければ、近く（3 区画以内）で置ける場所に寄せる。
 * 空き地を先に探し、なければ用地買収が要る場所。見つからなければ指した場所のまま返す。
 */
export function snapPlace(s: GameState, kind: Kind, x: number, y: number, free = false): { x: number; y: number; moved: boolean } {
  const here = checkPlace(s, kind, x, y, free);
  if (here.level !== 'error' || here.reasons.some(r => r.startsWith('資金'))) return { x, y, moved: false };
  const m = getMap(s.seed), d = DEFS[kind], byId = byIdOf(s);
  // 区画だけで判断できる下調べ（重い checkPlace を呼ぶ前に絞る）
  const quick = (px: number, py: number, allowAcq: boolean) => {
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
      const cx = px + dx, cy = py + dy; if (!inMap(cx, cy)) return false;
      const i = idx(cx, cy); if (s.road[i]) return false;
      const ab = s.occ[i] ? acquirable(s, i, byId) : null;
      if (s.occ[i] && !(allowAcq && ab)) return false;
      if ((!ab || !m.steep[i]) && landReason(m, i)) return false;
    }
    return true;
  };
  for (const allowAcq of [false, true]) {
    for (let r = 1; r <= 3; r++) {
      const ring: [number, number][] = [];
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push([dx, dy]);
      ring.sort((p, q) => Math.hypot(p[0], p[1]) - Math.hypot(q[0], q[1]));
      for (const [dx, dy] of ring) {
        const px = x + dx, py = y + dy;
        if (!quick(px, py, allowAcq)) continue;
        if (checkPlace(s, kind, px, py, free).level !== 'error') return { x: px, y: py, moved: true };
      }
    }
  }
  return { x, y, moved: false };
}

/** 線路の上だけをたどる道筋（複線化・撤去を、曲がった線路に沿ってまとめて指定するため）。たどれなければ null */
export function railPath(s: GameState, a: number, b: number): number[] | null {
  if (!s.rail || !s.rail[a] || !s.rail[b]) return null;
  const prev = new Int32Array(W * H).fill(-2), q = [a]; prev[a] = -1;
  for (let h = 0; h < q.length; h++) {
    const i = q[h]; if (i === b) break;
    for (const j of railNbrs(k => s.rail![k] > 0, i)) { if (prev[j] !== -2) continue; prev[j] = i; q.push(j); }
  }
  if (prev[b] === -2) return null;
  const out: number[] = []; for (let k = b; k >= 0; k = prev[k]) out.push(k);
  return out.reverse().slice(0, 400);
}

/**
 * 新しく敷く線路の道筋：始点から終点まで、斜めも使ったまっすぐな線。
 * 既にある線路の端から引き始めたときは、その線路の向きに合わせて、はじめの数区画を曲線（向きを少しずつ変える）でつなぐ
 */
export function railLayPath(s: GameState, a: number, b: number): number[] {
  const line = railLine(a, b);
  if (!s.rail || !s.rail[a] || line.length < 4) return line;
  const nb = railNbrs(k => s.rail![k] > 0, a);
  if (nb.length !== 1) return line;
  // 既存の線路の向き（端の 3 区画先から）
  let p = a, q = nb[0], back = q; for (let k = 0; k < 3; k++) { const n2 = railNbrs(j => s.rail![j] > 0, q).filter(j => j !== p); if (n2.length !== 1) break; p = q; q = n2[0]; back = q; }
  const dx0 = (a % W) - (back % W), dy0 = ((a / W) | 0) - ((back / W) | 0), l0 = Math.hypot(dx0, dy0) || 1;
  const ax = a % W + 0.5, ay = ((a / W) | 0) + 0.5, bx = b % W + 0.5, by = ((b / W) | 0) + 0.5, L = Math.hypot(bx - ax, by - ay);
  // 2 次ベジェ曲線（制御点は既存の線の延長上）で引く
  const k = Math.min(L * 0.5, 6), cx = ax + dx0 / l0 * k, cy = ay + dy0 / l0 * k, out: number[] = [];
  const n = Math.ceil(L * 4);
  for (let t = 0; t <= n; t++) {
    const u = t / n, x = (1 - u) * (1 - u) * ax + 2 * u * (1 - u) * cx + u * u * bx, y = (1 - u) * (1 - u) * ay + 2 * u * (1 - u) * cy + u * u * by;
    const tx = Math.floor(x), ty = Math.floor(y); if (!inMap(tx, ty)) continue;
    const i = idx(tx, ty), last = out[out.length - 1];
    if (last === i) continue;
    out.push(i);
  }
  // L 字の角を外す
  for (let j = 1; j < out.length - 1; j++) { const u = out[j - 1], v = out[j + 1]; if (Math.abs(u % W - v % W) === 1 && Math.abs(((u / W) | 0) - ((v / W) | 0)) === 1) { out.splice(j, 1); j--; } }
  return out;
}
