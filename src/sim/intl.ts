// 国際交流：海外の姉妹都市と、交流（留学・経済・文化）で深まる関係
// ここは core.ts を読み込まない（core.ts が効果を読むため）
import type { GameState } from './types';

export type SisterDef = { id: string; name: string; country: string; theme: string; fame: number; cost: number; visitors: number; desc: string; mods: { key: string; op: 'add' | 'mul'; v: number }[] };
export const SISTERS: SisterDef[] = [
  { id: 'portland', name: 'ポートランド', country: 'アメリカ', theme: '環境・まちづくり', fame: 15, cost: 1500, visitors: 1500, desc: '自転車と公共交通、地元の店を大事にする街。環境と暮らしの満足に。', mods: [{ key: 'sat:all', op: 'add', v: 0.004 }] },
  { id: 'taipei', name: '台北', country: '台湾', theme: '観光・経済', fame: 10, cost: 1200, visitors: 4000, desc: '近くて行き来が多い。来訪者と商売が増える。', mods: [{ key: 'visitors', op: 'mul', v: 1.03 }, { key: 'econ', op: 'mul', v: 1.005 }] },
  { id: 'helsinki', name: 'ヘルシンキ', country: 'フィンランド', theme: '子育て・教育', fame: 20, cost: 1800, visitors: 800, desc: '子育てと教育の先進地。子育て世帯の満足と転入に。', mods: [{ key: 'sat:2', op: 'add', v: 0.005 }, { key: 'sat:3', op: 'add', v: 0.005 }, { key: 'inflow', op: 'mul', v: 1.01 }] },
  { id: 'barcelona', name: 'バルセロナ', country: 'スペイン', theme: '観光・建築', fame: 30, cost: 2500, visitors: 5000, desc: '世界的な観光都市。知名度と来訪者が伸びる。', mods: [{ key: 'fame', op: 'add', v: 3 }, { key: 'visitors', op: 'mul', v: 1.03 }] },
  { id: 'munich', name: 'ミュンヘン', country: 'ドイツ', theme: '産業・ものづくり', fame: 25, cost: 2200, visitors: 1200, desc: '工業と技術の都市。企業が来やすくなり、景気を支える。', mods: [{ key: 'bizIncentive', op: 'add', v: 0.05 }, { key: 'econ', op: 'mul', v: 1.01 }] },
  { id: 'singapore', name: 'シンガポール', country: 'シンガポール', theme: '金融・物流', fame: 35, cost: 3000, visitors: 2500, desc: 'アジアの金融と物流の中心。景気と企業の税に。', mods: [{ key: 'econ', op: 'mul', v: 1.015 }] },
  { id: 'melbourne', name: 'メルボルン', country: 'オーストラリア', theme: '留学・スポーツ', fame: 20, cost: 1600, visitors: 2000, desc: '留学とスポーツの街。若い世代の転入と文化に。', mods: [{ key: 'inflow', op: 'mul', v: 1.01 }, { key: 'sat:0', op: 'add', v: 0.004 }] },
  { id: 'seoul', name: 'ソウル', country: '韓国', theme: '文化・エンタメ', fame: 15, cost: 1400, visitors: 4500, desc: '音楽とドラマの交流。若い来訪者が増える。', mods: [{ key: 'visitors', op: 'mul', v: 1.02 }, { key: 'sat:0', op: 'add', v: 0.003 }] },
];
export const SIS = Object.fromEntries(SISTERS.map(x => [x.id, x])) as Record<string, SisterDef>;
export const EXCHANGES = [
  { id: 'student', name: '中高生の交換留学', cost: 400, rel: 0.15, desc: '夏休みに中高生を送り、迎える。子育て世帯の満足も少し上がる。' },
  { id: 'trade', name: '経済ミッション（企業の訪問団）', cost: 900, rel: 0.2, desc: '地元企業と一緒に訪れ、商談をする。景気が 1 年少しよくなる。' },
  { id: 'culture', name: '文化交流祭', cost: 600, rel: 0.18, desc: '料理・音楽・祭りを紹介し合う。来訪者と知名度。' },
] as const;
export const MAX_SISTERS = 3;

/** 効果：関係の深さ（0〜1）に比例 */
export function intlAdd(s: GameState, key: string): number { let v = 0; for (const p of s.sisters ?? []) for (const m of SIS[p.id]?.mods ?? []) if (m.key === key && m.op === 'add') v += m.v * p.rel; return v; }
export function intlMul(s: GameState, key: string): number { let v = 1; for (const p of s.sisters ?? []) for (const m of SIS[p.id]?.mods ?? []) if (m.key === key && m.op === 'mul') v *= 1 + (m.v - 1) * p.rel; return v; }
export const intlVisitors = (s: GameState) => (s.sisters ?? []).reduce((a, p) => a + (SIS[p.id]?.visitors ?? 0) * p.rel, 0);
/** 毎月：交流がないと関係は少しずつ冷める。ときどき訪問団が来る */
export function intlMonthly(s: GameState, rnd: () => number): void {
  for (const p of s.sisters ?? []) {
    p.rel = Math.max(0.2, Math.min(1, p.rel - 0.006));
    if (rnd() < 0.02 * p.rel) { const d = SIS[p.id]; if (d) { s.notes.push(`✈ 姉妹都市${d.name}（${d.country}）から訪問団が来ました。${d.theme}の交流で、関係が深まりました`); p.rel = Math.min(1, p.rel + 0.05); } }
  }
}
