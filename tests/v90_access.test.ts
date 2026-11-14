// v90 多文化施策の因果：外国人住民の人数そのものでは治安を悪くしない。行政サービスへのアクセスと言語の支援が、住民全体の暮らしに効く
import { describe, it, expect } from 'vitest';
import { newGame, recompute, serialize, deserialize, accessOf, updateThreats, threatsOf } from '../src/sim/index';
import type { GameState } from '../src/sim/types';

const mod = (s: GameState, key: string, op: 'add' | 'mul', v: number) => s.modifiers.push({ key, op, v, until: s.month + 999, cost: 0, src: 'テスト' } as any);

describe('v90 外国人住民と治安', () => {
  it('外国人住民が増えても、それだけでは crime が上がらない', () => {
    const a = newGame({ seed: 5 });
    const bl = a.buildings.find(x => x.status === 'operating' && x.connected)!;
    for (let i = 0; i < 4; i++) a.buildings.push({ ...structuredClone(bl), id: 900000 + i, kind: 'factory' } as any); // 工場の働き手（技能実習）を置く
    recompute(a);
    const b = structuredClone(a); mod(b, 'foreign', 'mul', 6); recompute(b);
    expect(b.stats.foreign!.total).toBeGreaterThan(a.stats.foreign!.total);
    expect(b.stats.crime).toBeLessThanOrEqual(a.stats.crime + 1e-9);
  });
  it('不法滞在の推計（undoc）は出さず、アクセスの指標を出す', () => {
    const s = newGame({ seed: 5 }); recompute(s);
    expect(s.stats.foreign!.undoc).toBeUndefined();
    expect(s.stats.access).toBeDefined();
  });
  it('右翼団体の強さは外国人住民の割合で変わらない', () => {
    const a = newGame({ seed: 5 }); recompute(a);
    const b = structuredClone(a); b.stats.foreign!.total = a.stats.pop * 0.3;
    for (let i = 0; i < 24; i++) { updateThreats(a); updateThreats(b); }
    expect(threatsOf(b).right).toBeCloseTo(threatsOf(a).right, 9);
  });
});

describe('v90 相談と日本語学習の拠点', () => {
  it('アクセスと言語の支援が上がると、情報の到達と採用の定着が上がる', () => {
    const s = newGame({ seed: 5 }); recompute(s);
    const lo = accessOf(s, 20000, 800, 0.28);
    mod(s, 'access', 'add', 0.3); mod(s, 'lang', 'add', 0.4);
    const hi = accessOf(s, 20000, 800, 0.28);
    expect(hi.reach).toBeGreaterThan(lo.reach);
    expect(hi.retain).toBeGreaterThan(lo.retain);
  });
  it('外国人住民がいなくても、高齢の住民への到達はアクセスで上がる（住民全体に効く）', () => {
    const s = newGame({ seed: 5 });
    const lo = accessOf(s, 20000, 0, 0.35);
    mod(s, 'access', 'add', 0.4);
    expect(accessOf(s, 20000, 0, 0.35).reach).toBeGreaterThan(lo.reach);
  });
  it('多言語の相談窓口と日本語教室の政策で、街の access・lang・reach が上がる', () => {
    const a = newGame({ seed: 5 }); recompute(a);
    const b = structuredClone(a);
    b.policies.tabunka = { on: true, since: b.month - 12 } as any;
    b.policies.nihongo = { on: true, since: b.month - 12 } as any;
    recompute(b);
    expect(b.stats.access!.access).toBeGreaterThan(a.stats.access!.access);
    expect(b.stats.access!.lang).toBeGreaterThan(a.stats.access!.lang);
    expect(b.stats.access!.reach).toBeGreaterThan(a.stats.access!.reach);
  });
});

describe('v90 既存セーブ', () => {
  it('v89 までの foreign（undoc つき）を読めて、再計算で undoc が消える', () => {
    const s = newGame({ seed: 5 }); recompute(s);
    (s.stats as any).foreign = { total: 500, trainee: 100, skilled: 50, student: 250, undoc: 12, support: 0.25 };
    delete (s.stats as any).access;
    const r = deserialize(serialize(s));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    recompute(r.state);
    expect(r.state.stats.foreign!.undoc).toBeUndefined();
    expect(r.state.stats.access!.reach).toBeGreaterThan(0);
  });
});
