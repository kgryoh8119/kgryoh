// v94：財政の課題で、財源の候補（収支を良くするもの）を上位に並べる
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, monthlyIssues, dispatch } from '../src/sim/index';
import { trialOptions } from '../src/sim/report';
import { DIFFS } from '../src/sim/config';
import '../src/sim/wire';

function deficitTown() {
  const s = newGame(); s.tutorial.done = true; for (let m = 0; m < 3; m++) stepMonth(s);
  for (const l of s.ledger) l.operating = -400;
  s.cash = 500;
  return s;
}

describe('v94 財政の課題の候補', () => {
  it('赤字の街で財政の課題を開くと、上位に財源の候補が並び、「良くならない」の印は付かない', () => {
    const s = deficitTown();
    const iss = monthlyIssues(s).find(i => i.key === 'fiscal');
    expect(iss).toBeTruthy();
    const opts = trialOptions(s, iss!);
    const top = opts.slice(0, 3);
    expect(top.length).toBe(3);
    for (const o of top) {
      expect(o.actions?.length).toBeGreaterThan(0);
      expect(o.fitNote).toBeUndefined();
      expect(o.warn).toBeUndefined();
      expect(o.note).toMatch(/毎月の資金が約 [\d,]+ 万円よくなる/);
    }
    expect(top.some(o => /税を上げる|料金|先送り|やめる/.test(o.label))).toBe(true);
    // 良くなる額の大きい順
    const gain = (n: string) => Number(/約 ([\d,]+) 万円/.exec(n)?.[1].replace(/,/g, '') ?? 0);
    for (let k = 1; k < top.length; k++) expect(gain(top[k - 1].note)).toBeGreaterThanOrEqual(gain(top[k].note));
    // 増税の副作用（支持率）は印で示す
    const tax = opts.find(o => /住民税を上げる/.test(o.label));
    expect(tax?.side).toMatch(/支持率/);
    // 実行できる
    const r = dispatch(s, top[0].actions![0]);
    expect(r.ok).toBe(true);
  });
  it('一時借入があると、市債への借り換えが候補に出て、実行すると一時借入がなくなる', () => {
    const s = deficitTown();
    s.loans.push({ principal: 8000, remaining: 8000, rate: 0.04, months: 24, kind: 'temp' });
    const iss = monthlyIssues(s).find(i => i.key === 'fiscal')!;
    const o = trialOptions(s, iss).find(x => /借り換え/.test(x.label));
    expect(o).toBeTruthy();
    for (const a of o!.actions!) expect(dispatch(s, a).ok).toBe(true);
    expect(s.loans.filter(l => l.kind === 'temp').length).toBe(0);
  });
  it('ほかの課題の並べ方は変えない（財政以外では財源の候補を足さない）', () => {
    const s = deficitTown();
    for (const iss of monthlyIssues(s).filter(i => i.key !== 'fiscal')) expect(trialOptions(s, iss).some(o => /税を上げる|借り換え/.test(o.label))).toBe(false);
  });
  it('ふつう・やさしいの係数は v93 のまま', () => {
    expect(DIFFS.normal).toMatchObject({ vote: 7, appr: 0.04, satDown: 0.65 });
    expect(DIFFS.easy).toMatchObject({ vote: 12, appr: 0.07, satDown: 0.5 });
  });
});
