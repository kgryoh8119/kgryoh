// 施設の「候補地」：足りない所の近くで、実際に建てられる場所を数か所えらぶ（建てるのはプレイヤーが選んでから）。
// 需要の重みを区画ごとに集め、周りの合計が大きい順に、設置の確認（checkPlace）を通る所を拾う。
import { W, H, DEFS, REAL, checkPlace, sumHH, idx, isRes } from '../sim/index';
import type { GameState, Kind } from '../sim/index';

export interface Cand { x: number; y: number; score: number; cost: number; acqUnits: number; label: string }

/** 候補を出せる施設と、需要の重み・説明 */
const NEED: Partial<Record<Kind, { w: (s: GameState) => Float64Array; what: string; unit: string }>> = {
  nursery: { what: '保育園に入れない子', unit: '人', w: s => weights(s, b => b.unmet) },
  school: { what: '学校が遠い・足りない子', unit: '人', w: s => weights(s, b => (b.hh?.[3] ?? 0) * 1.4 * (1 - b.sv[1])) },
  park: { what: '公園が遠い世帯', unit: '世帯', w: s => weights(s, b => sumHH(b) * (1 - b.sv[2])) },
  fire: { what: '消防が届きにくい世帯', unit: '世帯', w: s => weights(s, b => sumHH(b) * (1 - b.sv[3])) },
};
export const hasCandidates = (k: Kind) => k in NEED;

function weights(s: GameState, f: (b: any) => number): Float64Array {
  const w = new Float64Array(W * H);
  for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating') { const v = f(b); if (v > 0) w[idx(b.x, b.y)] += v; }
  return w;
}

export function findCandidates(s: GameState, kind: Kind, max = 4): Cand[] {
  const need = NEED[kind]; if (!need) return [];
  const d = DEFS[kind], w = need.w(s);
  // 区画ごとの周りの合計（累積和で正方形の窓）
  const r = REAL ? 12 : 6, S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[(y + 1) * (W + 1) + x + 1] = w[y * W + x] + S[y * (W + 1) + x + 1] + S[(y + 1) * (W + 1) + x] - S[y * (W + 1) + x];
  const box = (x0: number, y0: number, x1: number, y1: number) => { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1); return S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]; };
  const order: [number, number][] = [];
  for (let y = 0; y + d.h <= H; y++) for (let x = 0; x + d.w <= W; x++) { const v = box(x - r, y - r, x + d.w + r, y + d.h + r); if (v >= 1) order.push([v, idx(x, y)]); }
  order.sort((a, b) => b[0] - a[0]);
  const found: Cand[] = [];
  let checks = 0;
  for (const [v, i] of order) {
    if (found.length >= max * 3 || checks > 500) break;
    const x = i % W, y = (i / W) | 0;
    if (found.some(c => Math.max(Math.abs(c.x - x), Math.abs(c.y - y)) < r * 0.7)) continue;
    checks++;
    const c = checkPlace(s, kind, x, y);
    if (!c.ok || c.reasons.some(t => /道路に接していません|つながっていません/.test(t))) continue;
    const acqUnits = c.acq.length ? s.buildings.filter(b => c.acq.includes(b.id)).reduce((a, b) => a + (b.units ?? 0), 0) : 0;
    found.push({ x, y, score: v, cost: c.cost, acqUnits, label: '' });
  }
  // 用地費の重さで並べ直す（空き地を優先）
  found.sort((a, b) => b.score / (1 + (b.cost - d.cost) / d.cost) - a.score / (1 + (a.cost - d.cost) / d.cost));
  const out = found.slice(0, max);
  out.forEach(c => { c.label = `${need.what} 約 ${Math.round(c.score).toLocaleString()} ${need.unit}の近く・${c.acqUnits ? `用地買収 ${c.acqUnits} 戸` : '空き地'}`; });
  return out;
}
