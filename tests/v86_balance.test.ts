// v86 バランス：直した因果を 1 件ずつ確かめる（交付税の財源調整・税の両面・高齢化の負担・市債の返済期間・公約の目標）
import { describe, it, expect } from 'vitest';
import { newGame, dispatch, stepMonth, monthlyBudget, transferParts, elderPersons, eventDef, P, GOALS, DEFS, isRes, sumHH, validateState } from '../src/sim/index';
import type { GameState } from '../src/sim/types';

const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) { stepMonth(s); for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 }); s.pendingElection = null; s.goalPick = false; } };
const clone = (s: GameState): GameState => structuredClone(s);

describe('v86 交付税の財源調整', () => {
  it('はじめの街の移転収入は v85 とほぼ同じ（住野市で ±5% 以内）', () => {
    const s = newGame(), L = monthlyBudget(s);
    const v85 = (1950 + 0.46 * s.stats.pop) * 1.04; // v85 の式（ふつうの難易度）
    expect(Math.abs(L.transfer / v85 - 1)).toBeLessThan(0.05);
  });
  it('標準的な税収が 100 増えると、交付税は 75 減る（不交付団体でなければ）', () => {
    const s = newGame(), L = monthlyBudget(s);
    const a = transferParts(s, L), b = transferParts(s, { ...L, taxProperty: L.taxProperty + 100 });
    expect(a.kofu).toBeGreaterThan(100);
    expect(a.kofu - b.kofu).toBeCloseTo(100 * P.kofuOffset, 6);
  });
  it('税収が需要を大きく上回ると交付税は 0（不交付団体）になり、負にはならない', () => {
    const s = newGame(), L = monthlyBudget(s);
    const t = transferParts(s, { ...L, taxBusiness: L.taxBusiness + 1e6 });
    expect(t.kofu).toBe(0); expect(t.grants).toBeGreaterThan(0);
  });
  it('住民税を上げた分は交付税で差し引かれず、歳入がそのまま増える', () => {
    const s = newGame({ seed: 5 }), before = monthlyBudget(s);
    expect(dispatch(s, { type: 'tax', key: 'res', v: 1.1 }).ok).toBe(true);
    const after = monthlyBudget(s);
    expect(after.taxResident).toBeGreaterThan(before.taxResident * 1.08);
    expect(Math.abs(after.transfer - before.transfer)).toBeLessThan(1); // 標準税率で測るので交付税は変わらない
  });
});

describe('v86 税の両面', () => {
  it('住民税を上げると、歳入は増えるが、転出が増え、支持率が下がる', () => {
    const base = newGame({ seed: 5 }); run(base, 2);
    const hi = clone(base), lo = clone(base);
    expect(dispatch(hi, { type: 'tax', key: 'res', v: 1.15 }).ok).toBe(true);
    run(hi, 1); run(lo, 1);
    const out = (s: GameState) => (s.pol as any).demo.outHH as number;
    expect(hi.ledger.at(-1)!.taxResident).toBeGreaterThan(lo.ledger.at(-1)!.taxResident);
    expect(out(hi)).toBeGreaterThan(out(lo));
    expect(hi.approval).toBeLessThan(lo.approval);
  });
});

describe('v86 高齢化の負担', () => {
  it('高齢世帯が増えると、行政費（福祉の負担）が増え、その半分ほどを交付税が補う', () => {
    const s = newGame(), L0 = monthlyBudget(s), e0 = elderPersons(s);
    const t = clone(s); t.stats.hhByType = [...t.stats.hhByType]; t.stats.hhByType[4] += 100;
    const L1 = monthlyBudget(t), d = elderPersons(t) - e0;
    expect(L1.admin - L0.admin).toBeCloseTo(d * P.elderCost, 0);
    expect(L1.transfer - L0.transfer).toBeGreaterThan(0);
    expect(L1.transfer - L0.transfer).toBeLessThan(L1.admin - L0.admin);
  });
  it('転入が止まると、住民は年をとり、高齢化率が上がる（単身は動きやすく、高齢世帯は動きにくい）', () => {
    const s = newGame(); s.inflowFactor = 0; const a0 = s.stats.aging!;
    run(s, 24);
    expect(s.stats.aging!).toBeGreaterThan(a0 * 1.03); // 実測 15.2% → 15.9%（年 0.35 ポイント。日本全体は年 0.5 ポイント前後）
    expect(P.outByType[0]).toBeGreaterThan(P.outByType[4]);
  }, 60000);
});

describe('v86 人口が減ったときの負担', () => {
  it('人口が減っても施設の維持費・基礎行政費の固定分は減らず、1 人あたりの負担が上がる', () => {
    const s = newGame(), L0 = monthlyBudget(s), p0 = s.stats.pop;
    const t = clone(s);
    for (const b of t.buildings) if (isRes(b.kind) && b.hh) b.hh = b.hh.map(v => v * 0.6);
    t.stats.pop *= 0.6; t.stats.hhByType = t.stats.hhByType.map(v => v * 0.6);
    const L1 = monthlyBudget(t);
    const per = (L: typeof L0, p: number) => (L.admin + L.upkeep + L.wages + L.roads) / p;
    expect(L1.upkeep).toBeCloseTo(L0.upkeep, 6);
    expect(per(L1, t.stats.pop)).toBeGreaterThan(per(L0, p0) * 1.3);
  });
});

describe('v86 市債と公約', () => {
  it('市債は 240 か月の元金均等返済で、毎月の返済は借りた額の 1/240', () => {
    const s = newGame(); const n = s.loans.length;
    expect(dispatch(s, { type: 'borrow', amount: 12000 }).ok).toBe(true);
    const l = s.loans[n]; expect(l.months).toBe(240);
    run(s, 1); expect(12000 - l.remaining).toBeCloseTo(50, 6);
  });
  it('人口の公約は「いまの 1.15 倍」、大きく増やすは 1.3 倍', () => {
    const s = newGame();
    const g = GOALS.find(o => o.id === 'pop')!, G = GOALS.find(o => o.id === 'popBig')!;
    expect(g.target(s) / s.stats.pop).toBeGreaterThan(1.14); expect(g.target(s) / s.stats.pop).toBeLessThan(1.16);
    expect(G.target(s) / s.stats.pop).toBeGreaterThan(1.29);
    void DEFS; void sumHH; void validateState;
  });
});
