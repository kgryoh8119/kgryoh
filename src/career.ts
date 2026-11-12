// 市長の経歴：街をまたいで残る記録（このブラウザに保存）。いちばん高かった市長レベルで、選べる地形のパターンが増える
import { levelOf, TERRAINS, terrainOf, MAP_ID } from './sim/index';
import type { GameState } from './sim/index';

export type CityRec = { key: string; name: string; terrain: string; years: number; pop: number; lv: number; rank?: number; at: number };
export type Career = { lv: number; cities: CityRec[]; moves: number };
const KEY = 'sumu-career';
export function loadCareer(): Career {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v && typeof v.lv === 'number' && Array.isArray(v.cities)) return { lv: v.lv, cities: v.cities.slice(-20), moves: v.moves ?? 0 }; } catch { /* 読めない */ }
  return { lv: 1, cities: [], moves: 0 };
}
function save(c: Career): void { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* 保存できない */ } }
/** 毎月：いまの街の記録を経歴に書く */
export function noteCareer(s: GameState): Career {
  const c = loadCareer(), lv = s.mayor ? levelOf(s.mayor.pts) : 1, key = `${MAP_ID}:${s.seed}:${s.cityName}`;
  c.lv = Math.max(c.lv, lv);
  const rec: CityRec = { key, name: s.cityName, terrain: terrainOf(s.seed).name, years: Math.floor(s.month / 12) + 1, pop: Math.round(s.stats.pop), lv, rank: s.mayor?.ranks.at(-1)?.total, at: Date.now() };
  const k = c.cities.findIndex(x => x.key === key); if (k >= 0) c.cities[k] = rec; else c.cities.push(rec);
  save(c); return c;
}
/** 選べる地形（経歴のレベルで増える） */
export const terrainOpen = (c: Career, id: string) => (TERRAINS.find(t => t.id === id)?.lv ?? 99) <= c.lv;
/** 別の街に立候補できるか：市長レベル 4 以上で、1 回は再選している */
export function canRun(s: GameState): string | null {
  const lv = s.mayor ? levelOf(s.mayor.pts) : 1;
  if (lv < 4) return `市長レベル 4 から（いま ${lv}）`;
  if (!s.elections.some(e => e.win)) return '1 回は再選してから';
  return null;
}
/** 立候補：いまの街を「前の街」として残し、経験の一部（市長ポイントの 3 割）を持って、タイトルで地形を選ぶ */
export function startRun(s: GameState, text: string): void {
  const c = noteCareer(s); c.moves++; save(c);
  try {
    localStorage.setItem(`sumucity.prev.${Date.now() % 1e6}`, text);
    sessionStorage.setItem('sumu-run', JSON.stringify({ carry: Math.round((s.mayor?.pts ?? 0) * 0.3), from: s.cityName }));
    sessionStorage.setItem('sumu-title', '1');
  } catch { /* 保存できない */ }
  location.reload();
}
export function takeRun(): { carry: number; from: string } | null {
  try { const v = JSON.parse(sessionStorage.getItem('sumu-run') ?? 'null'); return v && typeof v.carry === 'number' ? v : null; } catch { return null; }
}
export function clearRun(): void { try { sessionStorage.removeItem('sumu-run'); } catch { /* なし */ } }
