// 施設の改修オプション（施設ごとの特化メニュー）・外観の様式・命名権
// ここは core.ts を読み込まない（core.ts が効果を読むため）
import type { GameState, Building, Kind } from './types';
import { DEFS, fam, lvOf } from './config';

export type OptDef = {
  id: string; name: string; desc: string; cost: number; upkeep?: number; income?: number; cap?: number;
  /** 付けられる施設：種類・系統（fam）・分類（cat）のどれかに当たれば可 */
  kinds?: Kind[]; fams?: string[]; cats?: string[];
  mods?: { key: string; op: 'add' | 'mul'; v: number }[];
};
const SAT = (t: number | 'all', v: number) => ({ key: t === 'all' ? 'sat:all' : `sat:${t}`, op: 'add' as const, v });
export const OPTIONS: OptDef[] = [
  // 保育・子育て
  { id: 'sickCare', name: '病児保育', desc: '熱が出た子も預かる部屋と看護師。共働きの子育て（未就学）世帯の満足が上がります。', fams: ['care'], cost: 1500, upkeep: 15, mods: [SAT(2, 0.004)] },
  { id: 'nightCare', name: '延長・夜間保育', desc: '夜 10 時まで預かります。定員 +10%、夫婦のみ・子育て世帯の満足が少し上がります。', fams: ['care'], cost: 1200, upkeep: 12, cap: 0.1, mods: [SAT(1, 0.002), SAT(2, 0.002)] },
  { id: 'yard', name: '園庭の拡張', desc: '芝生と遊具の広い園庭。子育て（未就学）世帯の満足と空気。', fams: ['care'], kinds: ['kindergarten', 'jidokan', 'kidsPark'], cost: 900, mods: [SAT(2, 0.002)] },
  // 学校
  { id: 'aircon', name: '教室のエアコン', desc: '夏の授業が楽になり、子育て（就学）世帯の満足が上がります。', fams: ['school', 'jhs', 'high'], cost: 2000, upkeep: 10, mods: [SAT(3, 0.003)] },
  { id: 'ict', name: 'ICT 教育（1 人 1 台）', desc: 'タブレットと電子黒板。子育て世帯の満足と、街に住みたい人が少し増えます。', fams: ['school', 'jhs', 'high', 'library'], cost: 2500, upkeep: 20, mods: [SAT(3, 0.003), { key: 'inflow', op: 'mul', v: 1.01 }] },
  { id: 'poolOpen', name: 'プールと校庭の開放', desc: '休日に地域へ開放。だれでも使えて、満足が少し上がります。', fams: ['school', 'jhs', 'high'], cost: 600, upkeep: 6, mods: [SAT('all', 0.001)] },
  // 公園
  { id: 'dogRun', name: 'ドッグラン', desc: '犬を放して遊ばせる柵の広場。単身・夫婦のみの世帯に人気です。', fams: ['park'], cost: 400, mods: [SAT(0, 0.002), SAT(1, 0.002)] },
  { id: 'bbq', name: 'BBQ 広場', desc: '予約制のバーベキュー場。使用料が入り、市外からも人が来ます。', fams: ['park'], cats: ['nature'], cost: 600, income: 8, mods: [{ key: 'visitors', op: 'mul', v: 1.01 }] },
  { id: 'bigPlay', name: '大型遊具', desc: 'ロープの塔と長いすべり台。子育て世帯の満足が上がります。', fams: ['park'], kinds: ['kidsPark', 'amusementPark'], cost: 800, mods: [SAT(2, 0.002), SAT(3, 0.002)] },
  // 図書館・文化
  { id: 'cafe', name: 'カフェ併設', desc: '館内にカフェ。売上の一部が入り、単身・夫婦のみの世帯の満足が上がります。', fams: ['library', 'culture'], cats: ['culture', 'history'], cost: 800, income: 10, mods: [SAT(0, 0.002), SAT(1, 0.001)] },
  { id: 'study', name: '学習室', desc: '中高生が放課後に勉強できる部屋。子育て（就学）世帯の満足。', fams: ['library'], kinds: ['jidokan', 'hall', 'convention'], cost: 500, upkeep: 5, mods: [SAT(3, 0.002)] },
  // 医療
  { id: 'kids', name: '小児科の充実', desc: '夜間も診る小児科。子育て世帯の満足と医療の水準。', fams: ['health'], cost: 3000, upkeep: 30, mods: [SAT(2, 0.003), SAT(3, 0.002), { key: 'health', op: 'add', v: 0.01 }] },
  { id: 'er', name: '救急の強化', desc: '救急の受け入れを 24 時間に。高齢世帯の満足と医療の水準。', fams: ['health'], cost: 4000, upkeep: 40, mods: [SAT(4, 0.003), { key: 'health', op: 'add', v: 0.015 }] },
  { id: 'online', name: 'オンライン診療', desc: '自宅から診察。遠くに住む高齢世帯が助かります。', fams: ['health', 'welfare'], cost: 1200, upkeep: 10, mods: [SAT(4, 0.002)] },
  // 福祉・介護
  { id: 'dayService', name: 'デイサービス', desc: '日帰りの介護。定員 +10%、高齢世帯の満足。', fams: ['welfare'], cost: 1500, upkeep: 15, cap: 0.1, mods: [SAT(4, 0.002)] },
  { id: 'watch', name: '見守りの仕組み', desc: '一人暮らしの高齢者を見守るセンサーと訪問。高齢世帯の満足。', fams: ['welfare'], cats: ['gov'], cost: 800, upkeep: 8, mods: [SAT(4, 0.002)] },
  // 安全
  { id: 'camera', name: '防犯カメラ網', desc: '駅前と通学路にカメラ。治安が少しよくなります。', fams: ['safety', 'fire'], cats: ['safety'], cost: 1500, upkeep: 10, mods: [{ key: 'safety', op: 'add', v: 0.01 }] },
  { id: 'rescue', name: '救助隊・資機材の増強', desc: '災害のときの被害が少し小さくなります。', fams: ['fire', 'shelter'], cats: ['safety'], cost: 2500, upkeep: 20, mods: [{ key: 'disasterDmg', op: 'mul', v: 0.96 }] },
  // 交通
  { id: 'bikePark', name: '駐輪場とシェアサイクル', desc: '駅や施設に自転車の拠点。満足が少し上がります。', cats: ['transport'], cost: 500, upkeep: 5, mods: [SAT('all', 0.001)] },
  // 観光・名所・レジャー
  { id: 'lightup', name: 'ライトアップ', desc: '夜に建物を照らします。来訪者と知名度が少し増えます。', cats: ['landmark', 'history', 'leisure', 'nature'], cost: 1000, upkeep: 8, mods: [{ key: 'visitors', op: 'mul', v: 1.02 }, { key: 'fame', op: 'add', v: 1 }] },
  { id: 'guide', name: '多言語案内と Wi-Fi', desc: '海外のお客さんに案内。来訪者が増えます。', cats: ['landmark', 'history', 'leisure', 'nature', 'transport'], cost: 600, upkeep: 4, mods: [{ key: 'visitors', op: 'mul', v: 1.015 }] },
  { id: 'shop', name: '売店・グッズ', desc: '名物とグッズの売店。売上の一部が入ります。', cats: ['landmark', 'history', 'leisure', 'nature'], cost: 500, income: 12 },
  // 命名権
  { id: 'naming', name: '命名権（ネーミングライツ）', desc: '施設の愛称を企業に売ります。毎月の収入が入りますが、名前がころころ変わるのを嫌う声も少しあります。', kinds: ['stadium', 'ballpark', 'dome', 'arena', 'hall', 'gym', 'athletics', 'rugby', 'musicArena', 'convention', 'pool', 'esportsArena'], cost: 0, income: 60, mods: [{ key: 'approval', op: 'add', v: -0.002 }] },
];
export const OPT = Object.fromEntries(OPTIONS.map(o => [o.id, o])) as Record<string, OptDef>;
/** この施設に付けられる改修オプション */
export function optionsFor(k: Kind): OptDef[] {
  const d = DEFS[k]; if (!d || d.build === 'none' || d.build === 'invite' && d.cat !== 'leisure' && d.cat !== 'landmark' && d.cat !== 'nature') return [];
  const f = fam(k) as string;
  return OPTIONS.filter(o => (o.kinds?.includes(k)) || (o.fams?.includes(f)) || (o.cats?.includes(d.cat)));
}
/** 付けられる数：レベル 1〜3 は 2 つ、レベル 4 以上は 3 つ */
export const optSlots = (b: Building) => (lvOf(b) >= 4 ? 3 : 2);
export const optCost = (b: Building, o: OptDef) => Math.round(o.cost * (1 + 0.15 * (Math.max(DEFS[b.kind].w * DEFS[b.kind].h, 1) - 1) ** 0.5) / 100) * 100;

// 外観の様式（見た目だけ。景観の満足が少しだけ上がる）
export const STYLES = ['標準', '和風（白壁と木）', 'モダン（ガラスと白）', 'レンガ', '木造（あたたかい木）', 'パステル'] as const;
export const STYLE_COST = 300;

// ---------------------------------------------------------------- 効果の集計（core.ts の modAdd / modMul へ）
const CACHE = new WeakMap<GameState, { k: string; add: Record<string, number>; mul: Record<string, number> }>();
function agg(s: GameState): { add: Record<string, number>; mul: Record<string, number> } {
  const k = `${s.bVersion}:${s.month}:${s.buildings.length}`, c = CACHE.get(s); if (c && c.k === k) return c;
  const add: Record<string, number> = {}, mul: Record<string, number> = {};
  let styled = 0;
  for (const b of s.buildings) {
    if (b.status !== 'operating') continue;
    if (b.style) styled++;
    for (const id of b.opts ?? []) for (const m of OPT[id]?.mods ?? []) { if (m.op === 'add') add[m.key] = (add[m.key] ?? 0) + m.v; else mul[m.key] = (mul[m.key] ?? 1) * m.v; }
  }
  // 同じ効果は重ねすぎない（満足は 1 キーあたり +0.03 まで）
  for (const key of Object.keys(add)) if (key.startsWith('sat:')) add[key] = Math.min(0.03, add[key]);
  if (styled) add['sat:all'] = (add['sat:all'] ?? 0) + Math.min(0.006, styled * 0.0006); // 街並みに気を配ると、少しだけ満足が上がる
  for (const key of Object.keys(mul)) mul[key] = Math.max(0.8, Math.min(1.3, mul[key]));
  const r = { k, add, mul }; CACHE.set(s, r); return r;
}
export const optAdd = (s: GameState, key: string) => agg(s).add[key] ?? 0;
export const optMul = (s: GameState, key: string) => agg(s).mul[key] ?? 1;
export const optCap = (b: Building) => 1 + (b.opts ?? []).reduce((a, id) => a + (OPT[id]?.cap ?? 0), 0);
export const optIncome = (b: Building) => (b.opts ?? []).reduce((a, id) => a + (OPT[id]?.income ?? 0), 0);
export const optUpkeep = (b: Building) => (b.opts ?? []).reduce((a, id) => a + (OPT[id]?.upkeep ?? 0), 0);
/** 命名権の愛称（施設ごとに決まった企業名） */
const SPONSORS = ['すみのフーズ', 'ミナト電機', 'あおぞら銀行', 'ひかり通信', 'さくら製薬', 'ほしぞら保険', 'やまびこ建設', 'つばさ自動車', 'みどり住宅', 'こだま鉄道'];
export const sponsorOf = (b: Building) => SPONSORS[b.id % SPONSORS.length];
