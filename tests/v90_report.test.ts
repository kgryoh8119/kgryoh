// v90：施策の予測と結果の記録・年次報告・課題の対策の試算
import { describe, it, expect } from 'vitest';
import { newGame, dispatch, stepMonth, eventDef, serialize, deserialize, monthlyIssues } from '../src/sim/index';
import { recordDecision, updateDecisions, indicatorValues, gapsOf, annualReport, registerIndicators, indicators, trialOptions, compareTrial, actionLabel, policyTarget, BASE_INDICATORS } from '../src/sim/report';
import type { GameState, Action } from '../src/sim/types';

const run = (s: GameState, n: number, rec = true) => { for (let i = 0; i < n; i++) { stepMonth(s); if (rec) updateDecisions(s); for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 }); s.pendingElection = null; } };
const act = (s: GameState, a: Action) => { const before = indicatorValues(s); const r = dispatch(s, a); expect(r.ok).toBe(true); return recordDecision(s, actionLabel(s, a), 'policy', before, { action: a, issue: 'care' }); };

describe('v90 施策の記録と年次報告', () => {
  it('施策を実行すると記録が残り、3・6・12 か月後に実績と予測との差が入る', () => {
    const s = newGame(); run(s, 2);
    const d = act(s, { type: 'policy', id: 'careStaff', on: true });
    expect(s.decisions?.length).toBe(1);
    expect(d.before.wait).toBeGreaterThanOrEqual(0);
    expect(Object.keys(d.expect ?? {})).toEqual(['3', '6', '12']);
    for (const id of BASE_INDICATORS.map(x => x.id)) { const [lo, mid, hi] = d.expect![12][id]; expect(lo).toBeLessThanOrEqual(mid); expect(mid).toBeLessThanOrEqual(hi); }
    expect(d.focus.slice(0, 2)).toEqual(['wait', 'satType']); // 統合後は、課題が入口になるゲームループの指標（駅前再開発）が後ろに続く
    run(s, 2); expect(d.results.length).toBe(0);
    run(s, 1); expect(d.results.map(r => r.at)).toEqual([3]);
    run(s, 3); expect(d.results.map(r => r.at)).toEqual([3, 6]);
    run(s, 6); expect(d.results.map(r => r.at)).toEqual([3, 6, 12]);
    const g = gapsOf(d, d.results[2]);
    expect(g.length).toBe(d.focus.length); expect(g.length).toBeGreaterThanOrEqual(2); // 統合後は、ゲームループの指標の分だけ行が増える
    for (const x of g) { expect(Number.isFinite(x.diff)).toBe(true); expect(x.diff).toBeCloseTo(x.actual - x.mid, 5); if (x.outside) expect(d.results[2].factors.length).toBeGreaterThan(0); }
    const rep = annualReport(s, 0, s.month);
    expect(rep.rows.length).toBe(1); expect(rep.rows[0].r?.at).toBe(12); expect(['better', 'worse', 'mixed']).toContain(rep.rows[0].verdict);
    expect(rep.change.length).toBeGreaterThan(0);
    console.log(rep.rows[0].gaps.map(x => `${x.name} ${x.before} → [${x.lo}〜${x.hi}] → ${x.actual}（差 ${x.diff}${x.outside ? '・幅の外' : ''}）`).join('\n'), d.results[2].factors);
  });

  it('記録は街の計算を変えない（乱数も使わない）：記録した街としない街で結果が一致', () => {
    const a = newGame(), b = newGame(); run(a, 2, true); run(b, 2, false);
    const A: Action = { type: 'policy', id: 'careStaff', on: true };
    act(a, A); expect(dispatch(b, A).ok).toBe(true);
    const strip = (s: GameState) => { const c = structuredClone(s); delete c.decisions; return JSON.stringify(c); };
    expect(strip(a)).toBe(strip(b));
    run(a, 13, true); run(b, 13, false);
    expect(strip(a)).toBe(strip(b));
    expect(a.decisions![0].results.length).toBe(3);
  });

  it('記録は保存・読込でそのまま残り、記録のない古いセーブも読める', () => {
    const s = newGame(); run(s, 1); act(s, { type: 'policy', id: 'careStaff', on: true }); run(s, 3);
    const r = deserialize(serialize(s)); expect(r.ok).toBe(true);
    expect((r as any).state.decisions[0].results[0].at).toBe(3);
    const old = newGame(); run(old, 1, false); delete old.decisions;
    const r2 = deserialize(serialize(old)); expect(r2.ok).toBe(true); expect((r2 as any).state.decisions).toBeUndefined();
    updateDecisions((r2 as any).state); // 記録がなくても動く
    const bad: any = structuredClone(old); bad.decisions = 'x';
    const r3 = deserialize(serialize(bad)); expect(r3.ok).toBe(true); expect((r3 as any).state.decisions).toBeUndefined();
  });

  it('指標は外から足せる（ループ担当の指標をつなぐ入口）', () => {
    const n = indicators().length;
    registerIndicators([{ id: 'test:x', name: '試験', unit: '点', better: 'up', tol: 1, get: s => s.month }]);
    expect(indicators().length).toBe(n + 1);
    const s = newGame(); expect(indicatorValues(s)['test:x']).toBe(0);
    registerIndicators([{ id: 'test:x', name: '試験2', unit: '点', better: 'up', tol: 1, get: () => 5 }]);
    expect(indicators().length).toBe(n + 1); expect(indicatorValues(s)['test:x']).toBe(5);
  });

  it('課題の対策を試算できる（する場合としない場合の 12 か月後）。試算は状態を変えない', () => {
    const s = newGame(); run(s, 2, false);
    const iss = monthlyIssues(s).find(i => i.key === 'care')!; expect(iss).toBeTruthy();
    const before = JSON.stringify(s);
    const opts = trialOptions(s, iss); expect(opts.some(o => o.actions)).toBe(true);
    const o = opts.find(x => x.actions)!;
    const t = compareTrial(s, o.actions!, iss.key);
    expect(t.ok).toBe(true); expect(t.with[12].wait).toBeTruthy(); expect(t.without[12].wait).toBeTruthy();
    expect(JSON.stringify(s)).toBe(before);
    expect(policyTarget(s, '子育て世帯（未就学）')).toMatch(/世帯/);
    console.log(opts.map(x => x.label), '待機 12 か月後：しない', t.without[12].wait, 'する', t.with[12].wait);
  });
  it('試算の 2 本は毎月同じ乱数から始まる。水道に余力がないと容積を上げる対策に注意が出る。負の費用は収入と書く', async () => {
    const { housingBlocked, monthlyText } = await import('../src/sim/wire');
    const s = newGame(); run(s, 2, false);
    // 乱数の状態が違っても、しない場合とする場合の差（道路維持強化の混雑率）は同じ＝差は施策の効果だけ
    const r0 = s.rng, diffs: number[] = [];
    for (const k of [0, 1, 2]) { s.rng = (r0 + k * 7919) | 0; const t = compareTrial(s, [{ type: 'policy', id: 'roadCare', on: true }], 'traffic'); diffs.push(t.with[12].maxVc[1] - t.without[12].maxVc[1]); }
    expect(new Set(diffs).size).toBe(1);
    s.rng = r0;
    const iss = monthlyIssues(s).find(i => i.key === 'care')!, up = trialOptions(s, iss).find(o => /容積を上げる/.test(o.label));
    expect(!!up?.warn).toBe(!!housingBlocked(s));
    expect(monthlyText(-120)).toMatch(/120 万円の収入/);
  });
  it('任期末の報告：当選しても落選しても、選挙の月に前の任期の施策で報告を出す', async () => {
    const { Game } = await import('../src/game');
    for (const win of [true, false]) {
      const s = newGame(); s.termLength = 3; s.goalPick = false; run(s, 1, false); if (!win) s.approval = 0; // 支持を 0 にして落選させる
      const g = new Game(s); const before = indicatorValues(s); dispatch(s, { type: 'policy', id: 'careStaff', on: true }); recordDecision(s, '保育人材支援', 'policy', before, { forecast: false });
      g.speed = 3;
      for (let k = 0; k < 6 && !s.pendingElection; k++) { for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: 0 } as any); g.tick(1.0001); }
      expect(s.pendingElection).toBeTruthy();
      expect(s.mode).toBe(s.pendingElection!.win ? 'term' : 'sandbox');
      const rd = g.reportDue!; expect(rd.title).toMatch(/任期末/);
      expect(annualReport(s, rd.from, rd.to, rd.title).rows.length).toBe(1);
    }
  });
});
