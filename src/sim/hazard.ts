// 海抜（標高）と津波・液状化。地図の高さに「海からの距離に応じた土地の高さ」を足して、海抜（m）として扱う
// ここは core.ts を読み込まない（core.ts と events.ts が使うため）
import type { GameState } from './types';
import type { MapDef } from './map';
import { W, H } from './config';
import { getMap, idx, inMap, NEIGH } from './map';
import { REAL } from './real';

type Haz = { alt: Float32Array; sea: Uint8Array; dist: Int16Array; hasSea: boolean };
const CACHE = new WeakMap<MapDef, Haz>();
/** 海：地図の縁につながった大きな水面（掘った池・川の細い水路は含めない） */
function build(m: MapDef): Haz {
  const N = W * H, S = W + 1, sea = new Uint8Array(N), seen = new Uint8Array(N);
  for (let i0 = 0; i0 < N; i0++) {
    if (!m.water[i0] || seen[i0] || (m.dug && m.dug[i0])) continue;
    const comp = [i0]; seen[i0] = 1; let edge = false;
    for (let k = 0; k < comp.length; k++) {
      const i = comp[k], x = i % W, y = (i / W) | 0; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
      for (const [dx, dy] of NEIGH) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const j = idx(xx, yy); if (m.water[j] && !seen[j] && !(m.dug && m.dug[j])) { seen[j] = 1; comp.push(j); } }
    }
    if (edge && comp.length >= 250) for (const i of comp) sea[i] = 1;
  }
  // 海からの距離（区画）
  const dist = new Int16Array(N).fill(-1), q: number[] = [];
  for (let i = 0; i < N; i++) if (sea[i]) { dist[i] = 0; q.push(i); }
  for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of NEIGH) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const j = idx(xx, yy); if (dist[j] < 0) { dist[j] = dist[i] + 1; q.push(j); } } }
  const hasSea = q.length > 0;
  const alt = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0, h = (m.heights[y * S + x] + m.heights[y * S + x + 1] + m.heights[(y + 1) * S + x] + m.heights[(y + 1) * S + x + 1]) / 4;
    // 架空の街：海辺は海抜 1.5m ほど、内陸ほど高い（1km で約 4m）。実在の街は地図の高さのまま
    alt[i] = REAL ? h : sea[i] ? Math.min(0, h) : h + (hasSea ? 1.5 + 0.13 * Math.max(0, dist[i]) : 6);
  }
  return { alt, sea, dist, hasSea };
}
function haz(s: GameState): Haz { const m = getMap(s.seed); let h = CACHE.get(m); if (!h) { h = build(m); CACHE.set(m, h); } return h; }
/** 区画の海抜（m） */
export const altitude = (s: GameState, i: number) => haz(s).alt[i];
export const hasSea = (s: GameState) => haz(s).hasSea;
export const seaDist = (s: GameState, i: number) => haz(s).dist[i];
/** 防潮堤（堤防）の高さ（m）。これより低い津波は越えられない */
export const SEAWALL_H = 7;
/**
 * 高さ wave（m）の津波で、区画ごとの浸水の深さ（m）。海から陸へ広がり、内陸ほど低くなる（区画ごとに 0.22m）。
 * 防潮堤（堤防の区画）を越えるときは、堤防の高さぶん低くなる
 */
export function tsunamiDepth(s: GameState, wave: number): Float32Array {
  const h = haz(s), N = W * H, out = new Float32Array(N); if (!h.hasSea || wave <= 0) return out;
  const levee = new Set(s.levee ?? []), best = new Float32Array(N).fill(-1), q: number[] = [];
  for (let i = 0; i < N; i++) if (h.sea[i]) { best[i] = wave; q.push(i); }
  for (let k = 0; k < q.length; k++) {
    const i = q[k], x = i % W, y = (i / W) | 0, hw = best[i];
    for (const [dx, dy] of NEIGH) {
      const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const j = idx(xx, yy); if (h.sea[j]) continue;
      let w = hw - 0.22; if (levee.has(j)) w -= SEAWALL_H;
      if (w <= h.alt[j] || w <= best[j]) continue;
      best[j] = w; q.push(j);
    }
  }
  for (let i = 0; i < N; i++) if (!h.sea[i] && best[i] > 0) out[i] = Math.max(0, best[i] - h.alt[i]);
  return out;
}
/** 想定の最大クラスの津波（ハザードマップ用）。むずかしいほど高い */
export const designWave = (s: GameState) => (s.difficulty === 'easy' ? 8 : s.difficulty === 'hard' ? 13 : 10);
/** 液状化のおそれ：埋め立てた土地・湿地のそば・海抜 3m 未満の水辺 */
export function liquefyRisk(s: GameState, i: number): boolean {
  const m = getMap(s.seed), h = haz(s); if (m.water[i]) return false;
  if (m.base && m.base.water[i]) return true; // 埋め立て地
  const x = i % W, y = (i / W) | 0;
  for (const [dx, dy] of NEIGH) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const j = idx(xx, yy); if ((m.wet && m.wet[j]) || (m.water[j] && h.alt[i] < 3)) return true; }
  return false;
}
/** 津波から逃げられる見込み（0〜1）：近くに高台（海抜が津波より高い所）か避難タワー・高い建物があるか */
export function evacOK(s: GameState, i: number, wave: number, towers: number[]): number {
  const h = haz(s), x = i % W, y = (i / W) | 0;
  for (const t of towers) { const tx = t % W, ty = (t / W) | 0; if (Math.abs(tx - x) + Math.abs(ty - y) <= 18) return 1; }
  for (let r = 1; r <= 16; r++) for (let dy = -r; dy <= r; dy++) for (const dx of [-r + Math.abs(dy), r - Math.abs(dy)]) { const xx = x + dx, yy = y + dy; if (inMap(xx, yy) && h.alt[idx(xx, yy)] > wave + 1) return r <= 8 ? 1 : 0.7; }
  return 0.4;
}
