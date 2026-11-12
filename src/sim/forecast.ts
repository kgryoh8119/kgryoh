// 将来予測。状態の複製に対して月次処理を回す。本番の状態・現金・乱数は変えない。
import { stepMonth, monthlyBudget } from './step';
import type { GameState } from './types';

export interface ForecastRow { month: number; pop: number; careDemand: number; careCap: number; wait: number; cash: number; operating: number; renewal: number; debt: number; maxVc: number; sat: number }
export interface ForecastSet { label: string; factor: number; rows: ForecastRow[] }

export const SCENARIOS = [
  { label: '楽観', factor: 1.2 },
  { label: '基準', factor: 1.0 },
  { label: '慎重', factor: 0.8 },
];

const row = (c: GameState): ForecastRow => ({
  month: c.month, pop: c.stats.pop, careDemand: c.stats.careDemand, careCap: c.stats.careCap, wait: c.stats.waitlist,
  cash: c.cash - c.loans.filter(l => l.kind === 'temp').reduce((a, l) => a + l.remaining, 0),
  operating: monthlyBudget(c).operating, renewal: c.stats.renewal60, debt: c.stats.debt, maxVc: c.stats.maxVc, sat: c.stats.sat,
});

/** 転入の強さを変えた 3 本の試算。イベントは発生させない。 */
export function forecast(s: GameState, months = 60): ForecastSet[] {
  return SCENARIOS.map(sc => {
    const c: GameState = structuredClone(s);
    c.inflowFactor *= sc.factor;
    const rows = [row(c)];
    for (let k = 0; k < months; k++) { stepMonth(c, { forecast: true }); rows.push(row(c)); }
    return { label: sc.label, factor: sc.factor, rows };
  });
}

/** 画面を止めないよう、数か月ごとに制御を返しながら計算する版 */
export async function forecastAsync(s: GameState, months = 60, onProgress?: (p: number) => void, cancelled?: () => boolean): Promise<ForecastSet[]> {
  const out: ForecastSet[] = [];
  let done = 0;
  for (const sc of SCENARIOS) {
    const c: GameState = structuredClone(s);
    c.inflowFactor *= sc.factor;
    const rows = [row(c)];
    for (let k = 0; k < months; k++) {
      stepMonth(c, { forecast: true }); rows.push(row(c)); done++;
      if (k % 5 === 4) { onProgress?.(done / (months * SCENARIOS.length)); await new Promise(r => setTimeout(r, 0)); if (cancelled?.()) throw new Error('cancelled'); }
    }
    out.push({ label: sc.label, factor: sc.factor, rows });
  }
  return out;
}

/** 予測の 1 本分（ワーカーから進捗を返しながら使う） */
export function forecastScenario(s: GameState, factor: number, months: number, onStep?: (k: number) => void): ForecastRow[] {
  const c: GameState = structuredClone(s);
  c.inflowFactor *= factor;
  const rows = [row(c)];
  for (let k = 0; k < months; k++) { stepMonth(c, { forecast: true }); rows.push(row(c)); onStep?.(k); }
  return rows;
}
