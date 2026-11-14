// v90：3 つのゲームループ（駅前再開発・老朽インフラ・産業と暮らし）の回帰テスト。
// 「実際の選択で、指標と結果が変わる」ことを、同じ状態の複製で選択だけを変えて確かめる（できごとは起こさない forecast の回し方）。
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, dispatch, loopIndicators, loopOptions, LOOPS, INDICATORS, siteNear, validateState, allIssues, forecast, serialize, deserialize, renewCostOf } from '../src/sim/index';
import type { GameState, Action } from '../src/sim/types';

const go = (s: GameState, n: number) => { let inH = 0; for (let i = 0; i < n; i++) { stepMonth(s, { forecast: true }); inH += s.loopLog?.inHH ?? 0; } return inH; };
const act = (s: GameState, a: Action) => { const r = dispatch(s, a); expect(r.ok, r.msg).toBe(true); return r; };

/** 水道の余力を足した街（はじめの街は浄水場が古く、水道の余力がないと民間の住宅が建たない＝老朽インフラのループが駅前を止める） */
let watered: GameState | null = null;
function wateredCity(): GameState {
  if (watered) return structuredClone(watered);
  const s = newGame(); stepMonth(s);
  const w = siteNear(s, 'waterS', 40, 30, 60, 3000)!;
  act(s, { type: 'build', kind: 'waterS', x: w.x, y: w.y }); go(s, 8);
  watered = s; return structuredClone(s);
}

describe('v90 ループの公開関数', () => {
  it('LOOPS の指標はすべて INDICATORS にあり、loopIndicators がすべて有限の数を返す', () => {
    const s = newGame(), v = loopIndicators(s);
    for (const l of LOOPS) for (const k of l.indicators) { expect(INDICATORS.some(d => d.id === k)).toBe(true); expect(Number.isFinite(v[k])).toBe(true); }
    for (const d of INDICATORS) expect(Number.isFinite(v[d.id])).toBe(true);
  });
  it('予測（forecast）の各行に、結果と同じ指標が入る', () => {
    const s = newGame(), f = forecast(s, 3);
    expect(f[0].rows[0].loop).toEqual(loopIndicators(s));
    expect(Object.keys(f[1].rows[3].loop).length).toBe(INDICATORS.length);
  });
  it('どのループにも複数の対策があり、どれも dispatch で実行でき、費用か副作用がある', () => {
    const s = newGame(); stepMonth(s);
    for (const l of LOOPS) {
      const ops = loopOptions(s, l.id, { expect: false });
      expect(ops.length, l.id).toBeGreaterThanOrEqual(4);
      for (const o of ops) {
        expect(o.side.length + (o.cost > 0 ? 1 : 0) + (o.monthly > 0 ? 1 : 0), o.id).toBeGreaterThan(0);
        if (!o.ok) continue;
        const c = structuredClone(s); expect(dispatch(c, o.action).ok, o.id).toBe(true); expect(validateState(c), o.id).toBeNull();
      }
    }
  });
  it('期待効果は幅（lo ≤ hi）で、ループの指標ごとに出る', () => {
    const s = newGame(); stepMonth(s);
    const ops = loopOptions(s, 'aging', { months: 6 });
    const o = ops.find(x => x.id === 'deferRenew')!;
    expect(o.expect.length).toBe(LOOPS.find(l => l.id === 'aging')!.indicators.length);
    for (const e of o.expect) expect(e.lo).toBeLessThanOrEqual(e.hi);
    expect(o.expect.find(e => e.indicator === 'renewal60')!.hi).toBeGreaterThan(0); // 先送りで更新費の見通しが増える
  });
  it('古いセーブ（loopLog なし）も読めて、保存して読み直せる', () => {
    const s = newGame(); go(s, 2); delete s.loopLog;
    const r = deserialize(serialize(s)); expect(r.ok).toBe(true); if (!r.ok) return; const t = r.state; expect(validateState(t)).toBeNull(); go(t, 1); expect(t.loopLog).toBeTruthy();
    const r2 = deserialize(serialize(t)); expect(r2.ok).toBe(true);
  });
});

describe('v90 ループ 1：駅前再開発', () => {
  it('駅前の容積を上げると、24 か月で転入と税収が増え、保育の待機・学校の過密・駅と道路の混雑が増える', () => {
    const s = wateredCity();
    const up = loopOptions(s, 'station', { expect: false }).find(o => o.id === 'upzone')!;
    expect(up).toBeTruthy();
    const a = structuredClone(s), b = structuredClone(s);
    act(a, up.action);
    const inA = go(a, 24), inB = go(b, 24), A = loopIndicators(a), B = loopIndicators(b);
    expect(inA).toBeGreaterThan(inB * 1.3);
    expect(A.taxRevenue).toBeGreaterThan(B.taxRevenue);
    expect(A.careWait).toBeGreaterThan(B.careWait);
    expect(A.schoolCrowd).toBeGreaterThan(B.schoolCrowd);
    expect(A.stationCrowd).toBeGreaterThan(B.stationCrowd);
    expect(A.roadVc).toBeGreaterThan(B.roadVc);
  });
  it('時間差：容積を上げた翌月はまだ転入は変わらず、入居は着工から数か月後', () => {
    const s = wateredCity(), up = loopOptions(s, 'station', { expect: false }).find(o => o.id === 'upzone')!;
    const a = structuredClone(s), b = structuredClone(s); act(a, up.action);
    const a1 = go(a, 1), b1 = go(b, 1);
    expect(Math.abs(a1 - b1)).toBeLessThan(15);
    expect(a.buildings.filter(x => x.status === 'construction' && (x.kind === 'mansion' || x.kind === 'apartment')).length).toBeGreaterThan(0);
  });
  it('開発負担金：財源（資金）は増えるが、着工が鈍り、家賃が上がる', () => {
    const s = wateredCity(), up = loopOptions(s, 'station', { expect: false }).find(o => o.id === 'upzone')!;
    const a = structuredClone(s), b = structuredClone(s);
    act(a, up.action); act(b, up.action); act(a, { type: 'policy', id: 'devLevy', on: true });
    let startsA = 0, startsB = 0;
    for (let i = 0; i < 12; i++) {
      const ua = a.buildings.filter(x => x.status === 'construction' && x.units).length, ub = b.buildings.filter(x => x.status === 'construction' && x.units).length;
      go(a, 1); go(b, 1);
      startsA += Math.max(0, a.buildings.filter(x => x.status === 'construction' && x.units && x.remain === x.total).length); startsB += Math.max(0, b.buildings.filter(x => x.status === 'construction' && x.units && x.remain === x.total).length);
      void ua; void ub;
    }
    expect(a.loopLog!.levy).toBeGreaterThan(0);
    expect(startsA).toBeLessThan(startsB);
    expect(a.cash).toBeGreaterThan(b.cash);
    expect(a.stats.rentIndex!).toBeGreaterThan(b.stats.rentIndex!);
  });
  it('学校の増築と保育園の新設で、過密と待機が和らぐ（工事中は一時的に定員が下がる）', () => {
    const s = wateredCity(), ops = loopOptions(s, 'station', { expect: false });
    const sc = ops.find(o => o.id === 'schoolUp')!, nu = ops.find(o => o.id === 'nursery')!;
    const a = structuredClone(s), b = structuredClone(s);
    s.cash += 0; a.cash += 30000; b.cash += 30000;
    act(a, sc.action); act(a, nu.action);
    go(a, 1); go(b, 1);
    expect(loopIndicators(a).schoolCrowd).toBeGreaterThanOrEqual(loopIndicators(b).schoolCrowd); // 工事中
    go(a, 16); go(b, 16);
    expect(loopIndicators(a).schoolCrowd).toBeLessThan(loopIndicators(b).schoolCrowd);
    expect(loopIndicators(a).careWait).toBeLessThan(loopIndicators(b).careWait);
  });
  it('バスの増便で道路の混雑が下がり、家賃補助で住宅費の負担が下がる（どちらも毎月の費用がかかる）', () => {
    const s = wateredCity(), a = structuredClone(s), b = structuredClone(s);
    act(a, { type: 'policy', id: 'busPlus', on: true }); act(a, { type: 'policy', id: 'rentAid', on: true });
    go(a, 8); go(b, 8);
    const A = loopIndicators(a), B = loopIndicators(b);
    expect(A.roadVc).toBeLessThan(B.roadVc);
    expect(A.rentBurden).toBeLessThan(B.rentBurden);
    expect(a.ledger[a.ledger.length - 1].policy).toBeGreaterThan(b.ledger[b.ledger.length - 1].policy);
  });
  it('駅前の住宅が増えた後、今月の課題に駅前のループの入口（保育・学校・混雑）が出る', () => {
    const s = wateredCity(), up = loopOptions(s, 'station', { expect: false }).find(o => o.id === 'upzone')!;
    act(s, up.action); go(s, 24);
    const is = allIssues(s).filter(i => i.loop === 'station');
    expect(is.length).toBeGreaterThan(0);
    expect(is.some(i => i.options.some(o => o.act === 'loop' && o.arg === 'station'))).toBe(true);
  });
});

describe('v90 ループ 2：老朽インフラ', () => {
  const water = (s: GameState) => s.buildings.find(b => b.kind === 'water')!;
  const renewCost = (s: GameState) => renewCostOf(water(s));
  it('更新中は実効容量が下がり、終わると戻る（老朽度は 0 に）', () => {
    const s = newGame(); stepMonth(s);
    const ren = loopOptions(s, 'aging', { expect: false }).find(o => o.id === 'renew')!;
    expect(ren.action).toEqual({ type: 'renew', id: water(s).id });
    const a = structuredClone(s), b = structuredClone(s);
    act(a, ren.action); go(a, 1); go(b, 1);
    expect(loopIndicators(a).lifeline).toBeLessThan(loopIndicators(b).lifeline);
    go(a, 10); go(b, 10);
    expect(water(a).age).toBeLessThan(5);
    expect(loopIndicators(a).lifeline).toBeGreaterThan(loopIndicators(b).lifeline);
  });
  it('水道の更新を先送りすると、4 年後の更新費の見通しと災害時の想定損失が、更新した場合より大きい', () => {
    const s = newGame(); stepMonth(s);
    const a = structuredClone(s), b = structuredClone(s);
    act(a, { type: 'policy', id: 'deferRenew', on: true });
    act(b, { type: 'renew', id: water(b).id });
    go(a, 48); go(b, 48);
    const A = loopIndicators(a), B = loopIndicators(b);
    expect(A.renewal60).toBeGreaterThan(B.renewal60);
    expect(A.disasterLoss).toBeGreaterThan(B.disasterLoss);
    expect(A.lifeline).toBeLessThan(B.lifeline);
  });
  it('先送りした施設ほど更新費が高い（老朽度 80 を超えると割増し、100 で 1.6 倍）', () => {
    const s = newGame(), w = water(s), base = renewCost(s);
    w.age = 79; expect(renewCost(s)).toBe(base);
    w.age = 90; expect(renewCost(s)).toBe(Math.round(base * 1.3));
    w.age = 100; expect(renewCost(s)).toBe(Math.round(base * 1.6));
    s.cash = 1e6; w.age = 95; const c0 = s.cash; act(s, { type: 'renew', id: w.id }); expect(c0 - s.cash).toBe(Math.round(base * 1.45));
  });
  it('先送りは毎月の支出を減らし、長寿命化は毎月の費用がかかるが傷みを遅くする', () => {
    const s = newGame(); stepMonth(s);
    const a = structuredClone(s), b = structuredClone(s), c = structuredClone(s);
    act(a, { type: 'policy', id: 'deferRenew', on: true }); act(b, { type: 'policy', id: 'longLife', on: true });
    go(a, 12); go(b, 12); go(c, 12);
    const pol = (x: GameState) => x.ledger[x.ledger.length - 1].policy;
    expect(pol(a)).toBeLessThan(pol(c)); expect(pol(b)).toBeGreaterThan(pol(c));
    expect(water(a).age).toBeGreaterThan(water(c).age); expect(water(b).age).toBeLessThan(water(c).age);
  });
  it('水道料金の改定は収入になるが、単身・高齢の世帯の満足が下がる', () => {
    const s = newGame(); stepMonth(s);
    const a = structuredClone(s), b = structuredClone(s);
    act(a, { type: 'policy', id: 'waterRate', on: true }); go(a, 3); go(b, 3);
    const A = loopIndicators(a), B = loopIndicators(b);
    expect(A.waterBill).toBeGreaterThan(B.waterBill);
    expect(a.ledger[a.ledger.length - 1].operating).toBeGreaterThan(b.ledger[b.ledger.length - 1].operating);
    expect(A.satSenior).toBeLessThan(B.satSenior); expect(A.satSingle).toBeLessThan(B.satSingle);
  });
  it('市債で更新費を用意すると、残高が増える', () => {
    const s = newGame(); stepMonth(s);
    const o = loopOptions(s, 'aging', { expect: false }).find(x => x.id === 'borrow')!;
    const a = structuredClone(s); act(a, o.action);
    expect(loopIndicators(a).debt).toBeGreaterThan(loopIndicators(s).debt);
  });
  it('老朽の課題に「維持・更新・先送りを比べる」が出る', () => {
    const s = newGame(); water(s).age = 85; stepMonth(s, { forecast: true });
    const i = allIssues(s).find(x => x.key === 'aging')!;
    expect(i.loop).toBe('aging');
    expect(i.options.some(o => o.act === 'loop' && o.label.includes('先送り'))).toBe(true);
  });
});
