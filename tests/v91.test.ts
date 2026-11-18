// v91：街の 3 つの論点・課題の対策の候補の並べ替えと絞り込み
import { describe, it, expect } from 'vitest';
import { newGame, dispatch, stepMonth, eventDef, monthlyIssues, allIssues, loopTopics, loopEntryIssue } from '../src/sim/index';
import { trialOptions, rankTrial, TRIAL_SHOW, compareTrial, housingStalled } from '../src/sim/report';
import { optionFit, mainIndicatorOf } from '../src/sim/loops';
import '../src/sim/wire';
import type { GameState } from '../src/sim/types';

const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) { stepMonth(s); for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 }); s.pendingElection = null; } };

describe('v91 街の 3 つの論点', () => {
  it('3 つの論点はいつも出て、それぞれ対策を比べられる（上位 3 件の課題とは別）', () => {
    const s = newGame(); run(s, 1);
    const T = loopTopics(s);
    expect(T.map(t => t.id)).toEqual(['station', 'aging', 'industry']);
    for (const t of T) {
      expect(t.summary.length).toBeGreaterThan(10);
      const iss = loopEntryIssue(s, t.key)!;
      expect(iss.loop).toBe(t.id);
      expect(trialOptions(s, iss).some(o => o.actions)).toBe(true);
    }
    expect(monthlyIssues(s).length).toBeLessThanOrEqual(3);
    expect(loopEntryIssue(s, 'loop:nothing')).toBeUndefined();
  });
});

describe('v91 対策の候補', () => {
  it('課題の主な指標を悪化させる候補は外し、効く順に並べ、効果の小さいものは下に印を付ける', () => {
    const s = newGame(); run(s, 2);
    const care = allIssues(s).find(i => i.key === 'care');
    if (care) {
      const o = trialOptions(s, care);
      expect(o.some(x => /容積を上げる/.test(x.label))).toBe(false); // 保育の待機を増やす
      const k = o.findIndex(x => x.fitNote); if (k >= 0) expect(o.slice(k).every(x => x.fitNote)).toBe(true); // 印の付いた候補は下にまとまる
    }
    // 混雑の課題：容積を上げる（混雑を悪化）は外し、道路維持強化は「効果は小さい」
    expect(optionFit('upzone', mainIndicatorOf('traffic')!).v).toBeLessThan(0);
    const r = rankTrial([
      { label: 'A 容積', actions: [], note: '', fit: -1 },
      { label: 'B 道路維持', actions: [], note: '', fit: 0.1 },
      { label: 'C 建設', actions: [], note: '' },
      { label: 'D バス', actions: [], note: '', fit: 0.5 },
      { label: 'E 先送り', actions: [], note: '', fit: -0.5, trade: true },
    ]);
    expect(r.map(x => x.label[0])).toEqual(['C', 'D', 'E', 'B']);
    expect(r.find(x => x.label[0] === 'B')!.fitNote).toMatch(/効果は小さい/);
    expect(TRIAL_SHOW).toBe(5);
  });
});

describe('v91 容積の試算の水道の注意', () => {
  it('試算の 12 か月で、住宅が着工できない月を数える（いまは余力があっても途中で切れる場合）', () => {
    const s = newGame();
    const up = trialOptions(s, loopEntryIssue(s, 'loop:station')!).find(o => /容積を上げる/.test(o.label))!;
    expect(up?.actions).toBeTruthy();
    const t = compareTrial(s, up.actions!, 'loop:station');
    expect(t.stall).toBeDefined();
    expect(t.stall!.months).toBeGreaterThanOrEqual(housingStalled(s.stats) ? 1 : 0);
    expect(t.stall!.months).toBeLessThanOrEqual(12);
    if (t.stall!.months) expect(['water', 'sewage', 'power']).toContain(t.stall!.by);
  });
});
