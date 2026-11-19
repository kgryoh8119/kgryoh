// v93：毎月の費用がかかる対策で、毎月の収支が赤字になるときの注意
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, loopEntryIssue } from '../src/sim/index';
import { deficitWarn, trialOptions, recordDecision } from '../src/sim/report';
import '../src/sim/wire';

describe('v93 赤字になる対策の注意', () => {
  it('直近の月の収支より毎月の費用が大きいと注意を出し、余裕があれば出さない', () => {
    const s = newGame(); for (let m = 0; m < 3; m++) stepMonth(s);
    s.cash = 100; for (const l of s.ledger) l.operating = 300;
    expect(deficitWarn(s, 0)).toBeUndefined();
    expect(deficitWarn(s, 200)).toBeUndefined();
    expect(deficitWarn(s, 500)).toMatch(/赤字になります/);
    for (const l of s.ledger) l.operating = -100;
    expect(deficitWarn(s, 50)).toMatch(/いまも毎月の収支が赤字/);
    expect(deficitWarn(s, -50)).toBeUndefined(); // 収入・支出減の対策には出さない
    s.cash = 1e6; expect(deficitWarn(s, 50)).toBeUndefined(); // 資金が赤字の 3 年分より多ければ出さない
  });
  it('12 か月以内に容積を上げたばかりなら、「容積の上限を下げる」候補に注意が付く', () => {
    const s = newGame(); for (let m = 0; m < 2; m++) stepMonth(s);
    recordDecision(s, '駅前の容積を上げる（8 区画を高層住宅に）', '課題', {}, { forecast: false });
    stepMonth(s);
    const dn = trialOptions(s, loopEntryIssue(s, 'loop:station')!).find(x => /容積の上限を下げる/.test(x.label));
    if (dn) expect(dn.warn).toMatch(/か月前に「駅前の容積を上げる/);
  });
  it('課題の試算で、毎月の支出が増える候補に注意が付く（赤字のとき）', () => {
    const s = newGame(); for (let m = 0; m < 2; m++) stepMonth(s);
    s.cash = 100; for (const l of s.ledger) l.operating = -200;
    const o = trialOptions(s, loopEntryIssue(s, 'loop:station')!);
    const paid = o.filter(x => x.actions && /毎月 [\d,]+ 万円の支出/.test(x.note));
    expect(paid.length).toBeGreaterThan(0);
    for (const x of paid) expect(x.warn).toBeTruthy();
  });
});
