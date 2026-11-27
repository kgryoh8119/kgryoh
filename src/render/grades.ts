// v104b：施設の見た目のグレード（計算には使わない。描くときだけ）。
// 駅は「無人駅 → 小さな駅舎 → 橋上駅舎 → 駅ビル → 大型ターミナル」の 5 段。増築のレベル（lv）・乗降客数・人口で決める。
// ほかの施設（学校・病院・交番・警察署・消防署・市役所・公園）は、増築のレベルと街の人口で 3 段（0 小・1 標準・2 大）。
// ここは three を読み込まない純粋な関数だけ（テストで確かめる）。
import type { Kind } from '../sim/types';

/** 駅の見た目の段：0 無人駅・1 小さな駅舎・2 橋上駅舎・3 駅ビル・4 大型ターミナル */
export const ST_NAMES = ['無人駅', '小さな駅舎', '橋上駅舎', '駅ビル', '大型ターミナル'] as const;
/** 駅の段を決める入力。riders：1 日の乗降客数（sim の stationStats）、pop：街の人口 */
export interface StGradeIn { lv: number; riders: number; pop: number }
/** レベル 1 の駅の段の境目（1 日の乗降客数）。人口が多い街では 1 段上げる */
export const ST_RIDERS = { manned: 1200, bridge: 6000 } as const;
export const ST_POP = { manned: 20000, bridge: 40000 } as const;

/** 駅の見た目の段（0〜4）。lv 2 は駅ビル、lv 3 は大型ターミナル。lv 1 は乗降客数か人口で 無人駅・小さな駅舎・橋上駅舎 */
export function stationGrade(i: StGradeIn): number {
  const lv = Math.max(1, Math.min(3, Math.round(i.lv || 1)));
  if (lv >= 3) return 4;
  if (lv === 2) return 3;
  const r = Math.max(0, i.riders || 0), p = Math.max(0, i.pop || 0);
  if (r >= ST_RIDERS.bridge || p >= ST_POP.bridge) return 2;
  if (r >= ST_RIDERS.manned || p >= ST_POP.manned) return 1;
  return 0;
}
/** 決まった乱数（0〜1）。駅の id などから作る */
export function seed01(a: number, k = 0): number { const v = Math.sin(a * 12.9898 + k * 78.233 + 0.5) * 43758.5453; return v - Math.floor(v); }
/** 大型ターミナルを赤れんがの駅舎（東京駅のような）にするか。段 4 で、駅ごとの乱数が当たったときだけ（およそ 3 駅に 1 駅） */
export function stationHeritage(grade: number, seed: number): boolean { return grade >= 4 && seed01(seed, 3) < 0.34; }
/** 駅ビル・ターミナルの階数（駅ごとに少し変える）。段 3 は 6〜9 階、段 4 の塔は 22〜34 階と 18〜25 階 */
export function stationFloors(grade: number, seed: number): { bldg: number; towerA: number; towerB: number } {
  const r = seed01(seed, 7), q = seed01(seed, 11);
  return { bldg: grade >= 4 ? 4 + Math.floor(r * 2) : 6 + Math.floor(r * 4), towerA: 22 + Math.floor(q * 13), towerB: 18 + Math.floor(r * 8) };
}
/** ホームの長さの半分と、屋根の長さの半分（m）。4 両（約 82m）が止まれる長さは守り、屋根で差をつける */
export function platformSpan(grade: number): { half: number; roof: number } {
  return [{ half: 42, roof: 6 }, { half: 44, roof: 18 }, { half: 50, roof: 32 }, { half: 50, roof: 44 }, { half: 50, roof: 48 }][Math.max(0, Math.min(4, grade))];
}

// ---------------------------------------------------------------- ほかの施設
/** 見た目を段で変える施設と、段の呼び名（0 小・1 標準・2 大） */
export const FAC_NAMES: Partial<Record<Kind, [string, string, string]>> = {
  school: ['木造の分校', '鉄筋 3 階の校舎', '大規模校（4 階・新校舎）'],
  hospital: ['郊外型の低層病院', '総合病院', '高層の病棟とヘリポート'],
  koban: ['駐在所', '交番', '大型の交番（2 階建て）'],
  police: ['警察署', '警察署（別棟つき）', '高層の警察署とヘリポート'],
  fire: ['消防出張所', '消防署', '消防署（高い訓練塔・車庫 5 台）'],
  cityHall: ['町役場', '市役所', '高層の市役所'],
  park: ['小さな公園', '噴水広場つきの公園', '池と花壇のある公園'],
};
/** 段の境目：その段になる最低の lv と、人口（段 0 は「lv 1 で人口がこれ未満」のときだけ） */
export const FAC_RULE: Partial<Record<Kind, { small: number; mid: number; big: number }>> = {
  school: { small: 3000, mid: 1, big: 4 },
  hospital: { small: 0, mid: 3, big: 5 },
  koban: { small: 4000, mid: 1, big: 4 },
  police: { small: 0, mid: 3, big: 5 },
  fire: { small: 4000, mid: 1, big: 4 },
  cityHall: { small: 10000, mid: 1, big: 4 },
  park: { small: 0, mid: 2, big: 4 },
};
/** 施設の見た目の段（0 小・1 標準・2 大）。対象でない種類は -1（見た目を変えない） */
export function facilityGrade(kind: Kind, lv: number, pop: number): number {
  const r = FAC_RULE[kind]; if (!r) return -1;
  const l = Math.max(1, Math.min(5, Math.round(lv || 1)));
  if (l >= r.big) return 2;
  if (r.small > 0) return l === 1 && pop < r.small ? 0 : 1; // 小さな街のレベル 1 は小さい姿
  return l >= r.mid ? 1 : 0;
}
