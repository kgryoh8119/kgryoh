// 続けて遊びたくなる仕組み（v30）：今日の課題・住民の主人公・はじめての〇〇・街の称号
import type { GameState, Kind } from '../sim/index';
import { isRes, isShop, DEFS, citsOf, hasOp } from '../sim/index';

// ---------------------------------------------------------------- 今日の課題（日付で毎日入れかわる。端末に記録）
type Daily = { day: string; base: Record<string, number>; ids: string[]; done: string[] };
const cnt = (s: GameState, f: (k: Kind) => boolean) => s.buildings.filter(b => b.status === 'operating' && f(b.kind)).length;
export const DAILY: { id: string; name: string; value: (s: GameState) => number; need: number; unit: string }[] = [
  { id: 'road', name: '道路を 8 区画ふやす', value: s => s.road.filter(v => v > 0).length, need: 8, unit: '区画' },
  { id: 'hh', name: '世帯を 30 ふやす', value: s => Math.round(s.stats.households), need: 30, unit: '世帯' },
  { id: 'fac', name: '施設を 1 つ建てる', value: s => s.buildings.filter(b => !isRes(b.kind) && !isShop(b.kind)).length, need: 1, unit: 'つ' },
  { id: 'shop', name: '店を 2 つ増やす', value: s => cnt(s, k => isShop(k)), need: 2, unit: '店' },
  { id: 'months', name: '時間を 6 か月進める', value: s => s.month, need: 6, unit: 'か月' },
  { id: 'appr', name: '支持率を 2 ポイント上げる', value: s => Math.round(s.approval * 100), need: 2, unit: 'ポイント' },
  { id: 'fame', name: '知名度を 2 上げる', value: s => Math.round(s.fame ?? 0), need: 2, unit: '' },
  { id: 'park', name: '公園を 1 つつくる', value: s => s.buildings.filter(b => DEFS[b.kind].fam === 'park').length, need: 1, unit: 'つ' },
  { id: 'pop', name: '人口を 200 人ふやす', value: s => Math.round(s.stats.pop), need: 200, unit: '人' },
];
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const hashStr = (t: string) => { let h = 2166136261; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
export function dailyOf(s: GameState): Daily {
  let d: Daily | null = null; try { d = JSON.parse(localStorage.getItem('sumu-daily') ?? 'null'); } catch { /* なし */ }
  if (!d || d.day !== today() || !Array.isArray(d.ids)) {
    const h = hashStr(today()), pool = [...DAILY], ids: string[] = []; for (let k = 0; k < 3; k++) ids.push(pool.splice((h >>> (k * 5)) % pool.length, 1)[0].id);
    d = { day: today(), base: Object.fromEntries(DAILY.map(x => [x.id, x.value(s)])), ids, done: [] };
    try { localStorage.setItem('sumu-daily', JSON.stringify(d)); } catch { /* なし */ }
  }
  return d;
}
export const dailyProgress = (s: GameState, d: Daily, id: string) => { const x = DAILY.find(o => o.id === id)!; return Math.max(0, Math.min(x.need, x.value(s) - (d.base[id] ?? 0))); };
export const DAILY_PTS = 5; // v43：8 → 5（1 日に最大 15 ポイント）
/** 達成した課題を数えて、ごほうび（市長ポイント）を渡す。達成した課題の名前を返す */
export function checkDaily(s: GameState): string[] {
  const d = dailyOf(s), out: string[] = [];
  for (const id of d.ids) { if (d.done.includes(id)) continue; const x = DAILY.find(o => o.id === id)!; if (dailyProgress(s, d, id) >= x.need) { d.done.push(id); out.push(x.name); if (s.mayor) s.mayor.pts += DAILY_PTS; } }
  if (out.length) try { localStorage.setItem('sumu-daily', JSON.stringify(d)); } catch { /* なし */ }
  return out;
}

// ---------------------------------------------------------------- 住民の主人公（追いかけている住民から 1 人）
export function heroOf(s: GameState) {
  const cs = citsOf(s); if (!cs.length || !s.pol) return null;
  let h = cs.find(c => c.id === s.pol!.hero && !c.gone);
  if (!h) { h = cs.find(c => !c.gone && c.age >= 20 && c.age < 34) ?? cs.find(c => !c.gone); if (h) s.pol.hero = h.id; }
  return h ?? null;
}
export const avatar = (age: number, sex: string) => (age < 6 ? '👶' : age < 13 ? (sex === 'm' ? '👦' : '👧') : age < 20 ? '🧑' : age < 65 ? (sex === 'm' ? '👨' : '👩') : sex === 'm' ? '👴' : '👵');
export const lifeIcon = (t: string) => (/結婚/.test(t) ? '💍' : /生まれ/.test(t) ? '👶' : /働きはじめ/.test(t) ? '💼' : /定年/.test(t) ? '🎉' : /住みかえ|移った/.test(t) ? '🏠' : /市外/.test(t) ? '🚚' : /亡くな/.test(t) ? '🕊' : /仕事を探/.test(t) ? '📋' : '📝');

// ---------------------------------------------------------------- はじめての〇〇（序盤の手ざわり）
export const FIRSTS: { id: string; name: string; test: (s: GameState) => boolean }[] = [
  { id: 'road', name: 'はじめての道路', test: s => (s.missionBase ? s.road.filter(v => v === 1 || v === 2).length > s.missionBase.roads : false) },
  { id: 'house', name: 'はじめての新しい家', test: s => s.buildings.some(b => isRes(b.kind) && b.builtMonth > 0 && b.status === 'operating') },
  { id: 'shop', name: 'はじめての新しい店', test: s => s.buildings.some(b => isShop(b.kind) && b.builtMonth > 0 && b.status === 'operating') },
  { id: 'fac', name: 'はじめての施設の完成', test: s => s.buildings.some(b => !isRes(b.kind) && !isShop(b.kind) && b.builtMonth > 0 && b.status === 'operating' && DEFS[b.kind].build !== 'none') },
  { id: 'hh50', name: '新しい住民 50 世帯', test: s => !!s.missionBase && s.stats.households >= s.missionBase.hh + 50 },
  { id: 'bus', name: 'はじめてのバス停', test: s => (s.busStops?.length ?? 0) > 0 },
];

// ---------------------------------------------------------------- 街の称号（統計から決まる肩書き）
export function cityTitles(s: GameState): string[] {
  const st = s.stats, out: string[] = [], hh = st.hhByType, tot = hh.reduce((a, b) => a + b, 0) || 1;
  if ((hh[2] + hh[3]) / tot > 0.42 && st.waitlist < 10) out.push('子育ての街');
  if ((st.aging ?? 0) > 0.3) out.push('ゆったり長寿の街');
  if ((s.fame ?? 0) >= 60) out.push('全国区の観光地'); else if ((s.fame ?? 0) >= 35) out.push('話題の街');
  if (st.maxVc > 1.4) out.push('渋滞の街');
  if (st.sat >= 0.78) out.push('住みよさ自慢の街');
  if (s.buildings.filter(b => b.status === 'operating' && (b.kind === 'towerMansion' || b.kind === 'skyscraper' || b.kind === 'hqTower')).length >= 3) out.push('夜景の街');
  if ((s.pol?.fests?.length ?? 0) >= 5) out.push('お祭りの街');
  if ((s.sisters?.length ?? 0) >= 2) out.push('国際交流の街');
  if (hasOp(s, 'tvStation') && hasOp(s, 'globalIT')) out.push('メディアと IT の街');
  if ((s.teams ?? []).length) out.push('スポーツの街');
  if (s.fiscal?.status === 'ok' && s.cash > 100000) out.push('財政優良の街');
  if (!out.length) out.push(st.pop >= 20000 ? '成長中の街' : 'これからの街');
  return out.slice(0, 3);
}
