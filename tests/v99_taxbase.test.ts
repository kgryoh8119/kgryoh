// v99：住民税を住民一人ひとりの所得から積み上げる（歳入・住民の層・内訳・説明が同じ規則で食い違わない）
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, monthlyBudget, transferParts, forecast } from '../src/sim/index';
import { peopleStats, people } from '../src/sim/people';
import { taxBase, taxStory, wageTaxYear, pensionTaxYear, WAGE_IDS, wageGroupOf } from '../src/sim/taxbase';
import { serialize, deserialize } from '../src/sim/save';
import type { GameState } from '../src/sim/types';
import '../src/sim/wire';

function town(months = 4): GameState {
  const s = newGame(); s.tutorial.done = true;
  for (let m = 0; m < months; m++) { stepMonth(s); s.events.active = []; s.goalPick = false; s.pendingElection = null; }
  return s;
}
const S = town();

describe('v99 税収の積み上げ', () => {
  it('税額の計算：低い所得は非課税、所得が上がるほど税率が上がる（累進）', () => {
    expect(wageTaxYear(100)).toBe(0); // 給与所得 45 万円 → 非課税
    expect(pensionTaxYear(150)).toBe(0); // 年金 150 万円 → 非課税
    const a = wageTaxYear(300), b = wageTaxYear(540), c = wageTaxYear(800);
    expect(a).toBeGreaterThan(0);
    expect(b / 540).toBeGreaterThan(a / 300);
    expect(c / 800).toBeGreaterThan(b / 540);
    expect(c / 800).toBeLessThan(0.1); // 所得割 10% を超えない
  });
  it('歳入の住民税は積み上げ × 税率の政策 × 景気（ふるさと納税の流出を除く）で、内訳の合計が総額と一致する', () => {
    const t = taxBase(S);
    const sum = WAGE_IDS.reduce((a, g) => a + t.work[g].tax, 0) + t.senior.tax;
    expect(Math.abs(sum - t.tax)).toBeLessThan(1e-6);
    expect(Math.abs(t.regular.tax + t.nonRegular.tax + t.senior.tax - t.tax)).toBeLessThan(1e-6);
    const L = monthlyBudget(S);
    expect(L.taxResident).toBeGreaterThan(t.tax * 0.85);
    expect(L.taxResident).toBeLessThan(t.tax * 1.15);
  });
  it('住民一人ひとりの合計と、歳入の積み上げ（職場ごとの人数）が 5% 以内で一致する', () => {
    const t = taxBase(S), st = peopleStats(S);
    expect(Math.abs(st.taxResident - t.tax) / t.tax).toBeLessThan(0.05);
    const p = people(S); let nw = 0; for (let i = 0; i < p.n; i++) if (p.role[i] === 3) nw++;
    const tw = WAGE_IDS.reduce((a, g) => a + t.work[g].n, 0);
    expect(Math.abs(nw - tw)).toBeLessThan(2);
  });
  it('交付税の標準的な税収は新しい住民税から出る（税率の政策で割り戻す）', () => {
    const L = monthlyBudget(S), tp = transferParts(S, L), tax = S.tax ?? { res: 1, prop: 1, biz: 1 };
    expect(tp.stdTax).toBeCloseTo(L.taxResident / tax.res + L.taxProperty / tax.prop + L.taxBusiness / tax.biz, 6);
  });
  it('所得は職場の業種で決まる（市外・小売・市役所）', () => {
    expect(wageGroupOf(null)).toBe('out');
    expect(wageGroupOf('station')).toBe('move');
  });
  it('保存・読込の前後で住民税が同じ', () => {
    const r = deserialize(serialize(S)); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(monthlyBudget(r.state).taxResident).toBeCloseTo(monthlyBudget(S).taxResident, 6);
  });
  it('予測の 1 か月目の収支は、月次の処理と同じ住民税の式で出る', () => {
    const f = forecast(S, 1)[1];
    expect(Number.isFinite(f.rows[1].operating)).toBe(true);
    const c: GameState = structuredClone(S); c.inflowFactor *= f.factor; stepMonth(c, { forecast: true });
    expect(monthlyBudget(c).taxResident).toBeCloseTo(monthlyBudget(structuredClone(c)).taxResident, 6);
  });
  it('説明の文：内訳の割合を言う', () => {
    const t = taxStory(S);
    expect(t).toMatch(/市外の会社で働く人/);
    expect(t).toMatch(/高齢者/);
  });
});
