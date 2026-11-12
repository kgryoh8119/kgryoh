// 経済と財政：景気循環・為替・サプライチェーン・ふるさと納税・財政指標（地方公共団体財政健全化法）。
// 乱数の並び（rngNext）は使わず、地図の種と月から決める（ほかの計算の結果を変えないため）。
import { P, DEFS } from './config';
import { modMul } from './core';
import type { GameState, Kind } from './types';
import { industryBalance } from './macro';

const h01 = (a: number) => { const v = Math.sin(a) * 43758.5453; return v - Math.floor(v); };

/** 景気（-1 不況〜1 好況）と為替（1 ドル何円）を 1 か月進める。8〜9 年の波と、まれな金融危機（約 10 年に 1 度、1 年半） */
export function updateEconomy(s: GameState): void {
  const e = s.econ ?? { cycle: 0.2, fx: 135, shock: 0 };
  const ph = (s.seed % 97) / 97 * Math.PI * 2, t = s.month / (12 * 8.5) * Math.PI * 2;
  if (e.shock > 0) e.shock--;
  else if (s.month > 36 && h01(s.seed * 0.71 + s.month * 3.17) < 1 / 120) e.shock = 18;
  const base = 0.75 * Math.sin(t + ph) + 0.25 * (h01(s.seed + s.month * 1.37) - 0.5);
  e.cycle = Math.max(-1.5, Math.min(1, base - (e.shock > 0 ? 0.9 * e.shock / 18 + 0.3 : 0)));
  // 為替：ゆっくり 135 円へ戻る酔歩。金融危機のときは円高に振れる
  e.fx = Math.max(85, Math.min(180, e.fx + (135 - e.fx) * 0.03 + (h01(s.seed * 1.3 + s.month * 7.77) - 0.5) * 5 - (e.shock > 12 ? 2.5 : 0)));
  e.fx = Math.round(e.fx * 10) / 10; e.cycle = Math.round(e.cycle * 1000) / 1000;
  s.econ = e;
}
/** 景気が税収と企業の動きに効く倍率（好況 1.07、不況 0.93、危機の底 0.9） */
export const econFactor = (s: GameState) => { const c = s.econ?.cycle ?? 0; return 1 + 0.07 * c * (c < 0 ? 1 - 0.35 * industryBalance(s) : 1); }; // 産業がかたよらない街は、不況の落ち込みが小さい
/** 為替のずれ（円安が正。135 円が 0） */
export const fxDev = (s: GameState) => ((s.econ?.fx ?? 135) - 135) / 135;
/** 輸出の多い工場：円安で売上が伸び、円高で落ちる */
export const EXPORT = new Set<Kind>(['factory', 'semicon', 'battery', 'shipyard', 'steelMill', 'partsPlant', 'pharma', 'foodFactory', 'industrialPark', 'robotFactory', 'oilField', 'oilRefinery']);
/** 輸出の影響と、景気の影響を合わせた企業の税の倍率 */
export const bizFx = (s: GameState, k: Kind) => (EXPORT.has(k) ? 1 + 0.6 * fxDev(s) : 1);

/** サプライチェーン：材料の工場が市内にあるか。防衛装備品工場はすべて、ほかはどれか 1 つ */
export function chainFactor(s: GameState, k: Kind): number {
  const has = (x: Kind) => s.buildings.some(b => b.kind === x && b.status === 'operating');
  if (k === 'steelMill') return s.buildings.some(b => (b.kind === 'partsPlant' || b.kind === 'defensePlant' || b.kind === 'shipyard') && b.status === 'operating') ? 1.2 : 1; // 川下の工場があると鋼材がよく売れる
  if ((k === 'paddy' || k === 'field' || k === 'farm') && has('riceCenter')) return 1.1; // JA のライスセンターで乾燥・精米して高く売れる
  const c = DEFS[k].chain; if (!c) return 1;
  const ok = k === 'defensePlant' ? c.every(has) : c.some(has);
  return ok ? (k === 'defensePlant' ? 1 : 1.25) : k === 'defensePlant' ? 0.5 : 0.7;
}

/** ふるさと納税：返礼品の元（米・野菜・ビール・魚・温泉・ワイン）が多く、知名度が高いほど寄付が集まる。返礼品と経費で 5 割。市民がほかの市へ寄付した分は住民税が減る */
const GIFT: Partial<Record<Kind, number>> = { paddy: 1.2, field: 1, farm: 0.8, brewery: 2.5, foodFactory: 1.2, fishPort: 1.5, tourFarm: 1.2, onsen: 0.8, hotSpring: 1, michinoeki: 1, castle: 0.8, hotel: 0.5, poultry: 0.5, pigFarm: 0.8, beefRanch: 1.5, dairy: 0.8, orchard: 1.2, teaField: 0.6, greenhouse: 0.8, flowerFarm: 0.4, shiitake: 0.4, sakeBrewery: 2, soyBrewery: 0.8, aquaRaft: 1, fishFarm: 1.2, fishProcess: 0.8, wasabi: 0.8, apiary: 0.4, saltField: 0.4, ranchPark: 0.6 };
export function furusatoCalc(s: GameState, taxResident: number): { gift: number; cost: number; loss: number } {
  let pts = 1; for (const b of s.buildings) if (b.status === 'operating') pts += GIFT[b.kind] ?? 0;
  const gift = taxResident * 0.03 * Math.min(2.5, Math.sqrt(pts)) * (0.5 + 0.7 * Math.min(1, (s.fame ?? 0) / 60)) * (s.climate?.crop ?? 1) * modMul(s, 'furusato');
  return { gift: Math.round(gift), cost: Math.round(gift * 0.5), loss: Math.round(taxResident * 0.025) };
}

/** 財政指標：実質公債費比率（借金の返済と利子 ÷ 標準的な収入）と将来負担比率（借金の残高 ÷ 標準的な収入）。直近 12 か月で計算し、段階を決める */
export function updateFiscal(s: GameState): void {
  const L = s.ledger.slice(-12); if (L.length < 6) return;
  const k = 12 / L.length;
  const std = L.reduce((a, l) => a + l.taxResident + l.taxProperty + l.taxBusiness + l.transfer, 0) * k;
  const svc = L.reduce((a, l) => a + l.repay + l.interest, 0) * k;
  const debt = s.loans.reduce((a, l) => a + l.remaining, 0);
  const kosai = std > 0 ? svc / std : 0, shorai = std > 0 ? debt / std : 0;
  const f = s.fiscal ?? { kosai: 0, shorai: 0, status: 'ok' as const, since: s.month };
  f.kosai = Math.min(100, Math.round(kosai * 1000) / 1000); f.shorai = Math.min(1000, Math.round(shorai * 1000) / 1000);
  const want = kosai >= P.fiscalRebuild.kosai ? 'rebuild' : kosai >= P.fiscalEarly.kosai || shorai >= P.fiscalEarly.shorai ? 'early' : 'ok';
  const rank = { ok: 0, early: 1, rebuild: 2 } as const;
  // 悪くなるのはすぐ。よくなるのは、その段階になって 12 か月たち、指標が基準を下回ってから（健全化・再生計画の期間）
  if (rank[want] > rank[f.status]) { f.status = want; f.since = s.month; s.notes.push(want === 'rebuild' ? `財政再生団体になりました（実質公債費比率 ${Math.round(kosai * 100)}%）。国の同意なしに市債を出せず、暮らしに欠かせない施設のほかは建てられません` : `早期健全化団体になりました（実質公債費比率 ${Math.round(kosai * 100)}%・将来負担比率 ${Math.round(shorai * 100)}%）。市債は上限の 6 割までです`); }
  else if (rank[want] < rank[f.status] && s.month - f.since >= 12) { f.status = want; f.since = s.month; s.notes.push(want === 'ok' ? '財政の健全化が終わり、ふつうの団体に戻りました' : '財政再生団体を抜け、早期健全化団体になりました'); }
  s.fiscal = f;
}
