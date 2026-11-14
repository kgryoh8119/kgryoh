// v90：ゲームループのために、既存の月次処理（step / core / events）から 1 行ずつ呼ぶ小さな関数。
// config と types だけを読む（core・step と循環しない）。
import type { GameState, Building } from './types';
import { DEFS } from './config';

/** ゲームループの記録（古いセーブにはない → はじめて使うときに作る） */
export function logOf(s: GameState): NonNullable<GameState['loopLog']> {
  return (s.loopLog ??= { closed: [], levy: 0, levyM: 0, inHH: 0 });
}

/** 店が閉じた月を残す（直近 60 件） */
export function recordClose(s: GameState): void {
  const l = logOf(s); l.closed.push(s.month);
  if (l.closed.length > 60) l.closed.splice(0, l.closed.length - 60);
}

/** 今月着工した住宅の戸数から開発負担金（rate 万円/戸）を計算して記録する。財政への計上は step の 9（財政） */
export function chargeLevy(s: GameState, units: number, rate: number): void {
  const l = logOf(s), v = rate > 0 && units > 0 ? Math.round(units * rate) : 0;
  l.levyM = v; l.levy += v;
}

/** 住宅の工事中の戸数（開発負担金の計算用） */
export function pipelineUnits(s: GameState): number {
  let u = 0; for (const b of s.buildings) if (b.status === 'construction' && b.units) u += b.units;
  return u;
}

/** 先送りの費用：老朽度 80 を超えて使い続けた施設は、傷みが進んで更新費が高くなる（100 で 1.6 倍）。ゲームの仮定 */
export const DEFER_PREMIUM = 0.6;
export function renewCostOf(b: Pick<Building, 'kind' | 'age'>, age = b.age): number {
  const d = DEFS[b.kind];
  return Math.round(d.renewCost * (1 + DEFER_PREMIUM * Math.max(0, Math.min(20, age - 80)) / 20));
}

/** 大型店（市内の小さな店と買物客を取り合う）。w は住民の買物の重み（小さな店の集客力 ÷ (1+距離) と同じ尺度）、R は届く範囲（区画）、
 *  a は来訪者の買物を店と分け合うときの集客力（スーパー 6 と同じ尺度）。どれもゲームの仮定 */
export const BIG_STORES: Partial<Record<string, { w: number; R: number; a: number }>> = {
  mall: { w: 0.9, R: 60, a: 20 }, outletMall: { w: 0.35, R: 60, a: 16 }, department: { w: 0.45, R: 50, a: 10 }, warehouseClub: { w: 0.4, R: 50, a: 6 },
  discount: { w: 0.25, R: 35, a: 4 }, homeCenter: { w: 0.15, R: 35, a: 3 }, electronics: { w: 0.12, R: 35, a: 3 },
};
