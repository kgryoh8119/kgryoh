// 挑戦モード：はじめに選ぶ目標つきの遊び方（限界集落の再生・財政再建・10 万都市・子育て日本一）
// ここは core.ts を読み込まない
import type { GameState } from './types';
import { mayorDiff } from './mayor';
import { noteDisaster } from './politics';

export type ChallengeDef = { id: string; name: string; desc: string; years: number; goal: string; pts: number;
  setup: (s: GameState) => void; base: (s: GameState) => number; progress: (s: GameState, base: number) => number; won: (s: GameState, base: number) => boolean };
export const CHALLENGES: ChallengeDef[] = [
  { id: 'kaso', name: '限界集落の再生', desc: '若い人が出ていき、転入も少ない街。資金も 3 分の 1 から。', years: 15, goal: '15 年以内に、人口を始めの 1.3 倍に', pts: 120,
    setup: s => { s.cash = Math.round(s.cash / 3); s.inflowFactor *= 0.6; },
    base: s => Math.max(1, s.stats.pop), progress: (s, b) => s.stats.pop / (b * 1.3), won: (s, b) => s.stats.pop >= b * 1.3 },
  { id: 'zaisei', name: '財政再建', desc: '前の市長が残した借金 15 億円。資金はほとんどありません。', years: 8, goal: '8 年以内に、借金を半分にし、財政を「健全」に戻す', pts: 120,
    setup: s => { s.loans.push({ principal: 150000, remaining: 150000, rate: 0.012, months: 240, kind: 'bond' }); s.cash = 2000; },
    base: s => s.loans.reduce((a, l) => a + l.remaining, 0), progress: (s, b) => Math.min(1, (b - s.loans.reduce((a, l) => a + l.remaining, 0)) / (b / 2)) * (s.fiscal?.status === 'ok' ? 1 : 0.8),
    won: (s, b) => s.loans.reduce((a, l) => a + l.remaining, 0) <= b / 2 && (s.fiscal?.status ?? 'ok') === 'ok' },
  { id: 'pop10', name: '10 万都市', desc: '資金は 2 倍。大きく育てるための挑戦。', years: 25, goal: '25 年以内に、人口 10 万人', pts: 200,
    setup: s => { s.cash *= 2; }, base: () => 100000, progress: (s, b) => s.stats.pop / b, won: (s, b) => s.stats.pop >= b },
  { id: 'kids', name: '子育て日本一', desc: '子育て世帯に選ばれる街へ。', years: 12, goal: '12 年以内に、全国ランキングの子育て部門で 1 位', pts: 160,
    setup: () => { /* そのまま */ }, base: () => 1, progress: s => { const r = s.mayor?.ranks.at(-1)?.cats.kids; return r ? Math.min(1, 1 - Math.log10(r) / Math.log10(1741)) : 0; }, won: s => (s.mayor?.ranks ?? []).some(r => r.cats.kids === 1) },
];
// v31：シナリオの追加
CHALLENGES.push(
  { id: 'shinsai', name: '大地震からの復興', desc: '震度 6 強の地震の直後から始まります。1 割あまりの世帯が避難し、施設と道路が傷んでいます。', years: 6, goal: '6 年以内に、避難した人が戻り、人口が地震の前と同じになる', pts: 140,
    setup: s => { let lost = 0; for (const x of s.buildings) if (x.hh) for (let t = 0; t < x.hh.length; t++) { lost += x.hh[t] * 0.13; x.hh[t] *= 0.87; } for (const x of s.buildings) if (x.age > 30) x.age = Math.min(99, x.age + 25); noteDisaster(s, 'quake', lost); },
    base: s => Math.max(1, s.stats.pop), progress: (s, b) => s.stats.pop / b, won: (s, b) => s.stats.pop >= b }, // base は地震の前の人口（setup のあと、まだ再計算していない値）
  { id: 'kanko', name: '観光で全国区へ', desc: '知名度の低い街。名所・行事・SNS で人を呼びます。', years: 10, goal: '10 年以内に、知名度 70', pts: 140,
    setup: s => { s.fame = Math.min(s.fame ?? 0, 8); }, base: () => 70, progress: (s, b) => (s.fame ?? 0) / b, won: (s, b) => (s.fame ?? 0) >= b },
  { id: 'kogai', name: '人口 3,000 人の過疎の村', desc: '人が半分しかいない、資金も少ない村から。', years: 20, goal: '20 年以内に、人口 1 万人', pts: 180,
    setup: s => { for (const x of s.buildings) if (x.hh) for (let t = 0; t < x.hh.length; t++) x.hh[t] *= 0.55; s.cash = Math.round(s.cash / 2); }, base: () => 10000, progress: (s, b) => s.stats.pop / b, won: (s, b) => s.stats.pop >= b },
);
export const CH = Object.fromEntries(CHALLENGES.map(c => [c.id, c])) as Record<string, ChallengeDef>;
export function startChallenge(s: GameState, id: string): string | null {
  const c = CH[id]; if (!c) return 'その挑戦はありません';
  if (s.month > 0 || s.challenge) return '挑戦は、街を始めるときだけ選べます';
  c.setup(s);
  s.challenge = { id, start: s.month, until: s.month + c.years * 12, base: Math.round(c.base(s)) };
  return null;
}
export function challengeMonthly(s: GameState): void {
  const ch = s.challenge; if (!ch || ch.done) return;
  const c = CH[ch.id]; if (!c) return;
  if (c.won(s, ch.base)) {
    ch.done = 'win'; ch.at = s.month;
    const p = Math.round(c.pts * mayorDiff(s).gain); if (s.mayor) s.mayor.pts += p;
    s.fame = Math.min(100, (s.fame ?? 0) + 5); s.celeb = { kind: 'milestone', month: s.month, label: `挑戦「${c.name}」達成！` };
    s.notes.push(`🏆 挑戦「${c.name}」を達成しました！（${c.goal}）市長ポイント +${p}・知名度 +5`);
  } else if (s.month >= ch.until) {
    ch.done = 'lose'; ch.at = s.month;
    s.notes.push(`挑戦「${c.name}」は期限に届きませんでした（${c.goal}）。街づくりはこのまま続けられます`);
  }
}
