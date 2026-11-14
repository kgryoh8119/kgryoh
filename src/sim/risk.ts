// v90：主要な災害（浸水・地震・土砂・津波）の、いまの街でのリスクの見通し。
// 一点の予言ではなく、年あたりの発生の幅（不確かさ ±40%）と、影響を受ける世帯、主な要因、対策でどれだけ下がるかを返す。
// 発生確率の係数（probK）は events.ts の発生判定でも使う（地形・人口・対策に結び付ける）。
import { getMap, idx } from './map';
import { W, H, isRes, hasOp, countOp, diffOf } from './config';
import { sumHH } from './core';
import { tsunamiDepth, designWave, hasSea, liquefyRisk } from './hazard';
import type { GameState, Building } from './types';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** 斜面に接する住宅 */
export function slopeHomes(s: GameState): Building[] {
  const m = getMap(s.seed);
  return s.buildings.filter(b => isRes(b.kind) && b.status === 'operating' && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => { const x = b.x + dx, y = b.y + dy; return x >= 0 && y >= 0 && x < W && y < H && m.steep[idx(x, y)]; }));
}
/** 浸水：浸水のおそれのある世帯の割合で決まる（調整池・ダム・堤防で floodHH が減るので、対策で発生も下がる） */
export function floodProbK(s: GameState): number {
  const share = (s.stats.floodHH ?? 0) / Math.max(1, s.stats.households ?? 1);
  return clamp(0.5 + share * 10, 0.5, 2);
}
/** 土砂：斜面に接する住宅の数と、砂防ダム */
export function slideProbK(s: GameState, n = slopeHomes(s).length): number {
  return clamp(n / 8, 0.5, 2) * (hasOp(s, 'sabo') ? Math.max(0.3, 1 - 0.35 * Math.min(2, countOp(s, 'sabo'))) : 1);
}

export type RiskLevel = '低' | '中' | '高';
export interface RiskRow { id: 'flood' | 'quake' | 'slide' | 'tsunami'; name: string; level: RiskLevel; perYear: [number, number]; exposed: number; factors: string; measures: string }

const yearly = (pMonth: number, months: number) => 1 - Math.pow(1 - Math.min(1, pMonth), months);
const band = (p: number): [number, number] => [Math.round(p * 0.6 * 1000) / 10, Math.round(Math.min(1, p * 1.4) * 1000) / 10];
const lvOf = (score: number): RiskLevel => (score >= 0.02 ? '高' : score >= 0.005 ? '中' : '低');

/** いまの街のリスクの見通し（年あたりの発生の幅は %） */
export function riskOutlook(s: GameState): RiskRow[] {
  const d = diffOf(s).events, hh = Math.max(1, s.stats.households ?? 1), out: RiskRow[] = [];
  const res = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating');
  // 浸水（台風・大雨の季節 4 か月）
  { const k = floodProbK(s), p = (s.stats.floodHH ?? 0) >= 5 ? yearly(0.04 * k * d, 4) : 0, ex = Math.round(s.stats.floodHH ?? 0);
    out.push({ id: 'flood', name: '浸水', level: lvOf(p * ex / hh), perYear: band(p), exposed: ex, factors: `川・水面の近くの低い土地に ${ex} 世帯`, measures: '雨水調整池（同じ地区で半分）・堤防（8 割減）・放水路・ダム・湿地。浸水世帯が減るほど、被害の出る大雨も起きにくくなります' }); }
  // 地震（地域の地震動の予測は持たないので発生は一律。被害は液状化・老朽・備えで変わる）
  { const p = yearly((0.0045 + 0.0025) * d, 12), m = getMap(s.seed);
    let lq = 0; for (const b of res) if (liquefyRisk(s, idx(b.x, b.y))) lq += sumHH(b);
    const prep = Math.min(1, (s.stats.shelterCap ?? 0) / Math.max(1, (s.stats.pop ?? 0) * 0.4)); void m;
    out.push({ id: 'quake', name: '地震', level: lvOf(p * (0.3 + lq / hh) * (1.2 - 0.5 * prep)), perYear: band(p), exposed: Math.round(lq), factors: `液状化のおそれのある土地に ${Math.round(lq)} 世帯・避難所と備蓄の水準 ${Math.round(prep * 100)}%（発生の確率は地域によらず一律の仮定）`, measures: '避難所・備蓄（被害が最大半分）・総合防災訓練・施設の耐震化（更新）・情報の届きやすさ' }); }
  // 土砂（梅雨〜台風の 4 か月）
  { const n = slopeHomes(s), k = slideProbK(s, n.length), p = n.length >= 2 ? yearly(0.03 * k * d, 4) : 0, ex = Math.round(n.reduce((a, b) => a + sumHH(b), 0));
    out.push({ id: 'slide', name: '土砂', level: lvOf(p * ex / hh * 3), perYear: band(p), exposed: ex, factors: `斜面に接する住宅 ${n.length} 棟${hasOp(s, 'sabo') ? '・砂防ダムあり' : ''}`, measures: '砂防ダム（発生が 3〜6 割減）・斜面沿いを住宅以外の用途にする' }); }
  // 津波（海のある街だけ。巨大地震と、地震のときの津波）
  if (hasSea(s)) {
    const p = yearly((0.0012 + 0.0045 * 0.35) * d, 12), ts = tsunamiDepth(s, designWave(s));
    let ex = 0; for (const b of res) if (ts[idx(b.x, b.y)] > 0.05) ex += sumHH(b);
    out.push({ id: 'tsunami', name: '津波', level: lvOf(p * (ex / hh) * 4), perYear: band(p), exposed: Math.round(ex), factors: `想定の津波（${designWave(s)}m）で浸水する土地に ${Math.round(ex)} 世帯`, measures: '津波避難タワー・防潮堤・高台への住宅の誘導・避難の情報が届くこと' });
  }
  return out;
}
