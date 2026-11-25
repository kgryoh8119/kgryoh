// v95：住民一人ひとりの層（人数の一致・定員・駅・対策・決定性・保存）
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, dispatch } from '../src/sim/index';
import { people, peopleStats, incidentRate, recordIncident, sampleTrips, monthlyIncidents, incidentYear, safetyEventK } from '../src/sim/people';
import { serialize, deserialize } from '../src/sim/save';
import { stationStats } from '../src/sim/big';
import { fam } from '../src/sim/config';
import type { GameState } from '../src/sim/types';
import '../src/sim/wire';

function town(months = 6): GameState {
  const s = newGame(); s.tutorial.done = true;
  for (let m = 0; m < months; m++) { stepMonth(s); s.events.active = []; s.goalPick = false; s.pendingElection = null; }
  return s;
}
const S = town();

describe('v95 住民一人ひとり', () => {
  it('住民の数の合計が人口と一致し、役割の人数も既存の集計と 1 人以内で一致する', () => {
    const p = people(S), st = peopleStats(S);
    expect(p.n).toBe(Math.round(S.stats.pop));
    expect(Math.abs(st.byRole[3] - S.stats.workers)).toBeLessThanOrEqual(1);
    expect(Math.abs(st.byRole[1] - S.stats.schoolKids)).toBeLessThanOrEqual(1);
    expect(Math.abs(st.byRole[2] - S.stats.jhsKids)).toBeLessThanOrEqual(1);
    // 建物ごとの人数も世帯からの期待値に近い（役割ごとに丸めるので、ずれは役割 1 つにつき 1 人未満）
    const per = new Map<number, number>(); for (let i = 0; i < p.n; i++) per.set(p.home[i], (per.get(p.home[i]) ?? 0) + 1);
    for (const b of S.buildings) if (b.hh && b.status === 'operating') { const e = b.hh.reduce((a, h, t) => a + h * [1, 2, 3.7, 3.9, 1.7][t], 0); expect(Math.abs((per.get(b.id) ?? 0) - e)).toBeLessThan(4); }
  });
  it('学校・保育・職場の割り当ては定員（雇用）を超えない', () => {
    const st = peopleStats(S);
    for (const b of S.buildings) {
      const n = st.enroll.get(b.id) ?? 0;
      if (['school', 'jhs', 'care', 'privCare'].includes(fam(b.kind) as string)) expect(n).toBeLessThanOrEqual(Math.floor(b.effCap) + 1e-9);
    }
    let local = 0; for (const v of st.workers.values()) local += v;
    expect(local).toBe(st.localWork);
    expect(st.localWork + st.outWork + st.teleWork).toBe(st.byRole[3]);
  });
  it('駅の朝の乗車は、その駅を使う住民の数から出る', () => {
    const p = people(S), st = peopleStats(S), ss = stationStats(S);
    let n = 0; for (let i = 0; i < p.n; i++) if (p.station[i] >= 0) n++;
    let b = 0; for (const v of st.boardings.values()) b += v;
    expect(b).toBe(n);
    if (ss.length) expect(b).toBeGreaterThan(0);
  });
  it('同じ状態からは同じ住民が再生成される（保存して読み直しても同じ）', () => {
    const a = people(S);
    const r = deserialize(serialize(S)); expect(r.ok).toBe(true); if (!r.ok) return;
    const b = people(r.state);
    expect(b.n).toBe(a.n);
    expect(Array.from(b.dest)).toEqual(Array.from(a.dest));
    expect(Array.from(b.mode)).toEqual(Array.from(a.mode));
    expect(Array.from(b.holDest)).toEqual(Array.from(a.holDest));
  });
  it('交通安全の対策（歩道とガードレール・信号機・ゾーン 30）で、その区画の事故の起きやすさが下がる', () => {
    const s = town();
    const st0 = peopleStats(s);
    let t = -1, v = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 1 && st0.risk.ped[i] + st0.risk.car[i] > v) { v = st0.risk.ped[i] + st0.risk.car[i]; t = i; }
    expect(t).toBeGreaterThanOrEqual(0);
    const ped0 = incidentRate(s, t, 8, 'ped'), car0 = incidentRate(s, t, 8, 'car');
    s.cash = 1e6;
    for (const style of ['safe', 'signal', 'zone30'] as const) expect(dispatch(s, { type: 'street', tiles: [t], style }).ok).toBe(true);
    const ped1 = incidentRate(s, t, 8, 'ped'), car1 = incidentRate(s, t, 8, 'car');
    expect(ped1).toBeLessThan(ped0 * 0.5);
    expect(car1).toBeLessThan(car0 * 0.8);
    expect(safetyEventK(s)).toBeLessThan(1);
    expect(safetyEventK(S)).toBe(1); // 対策がなければ v94 のまま
  });
  it('毎月の事故の件数が残り、描画からの事故は「見えた分」だけ数える', () => {
    const s = town(3);
    for (let m = 0; m < 3; m++) stepMonth(s);
    expect((s.incid ?? []).length).toBeGreaterThanOrEqual(3);
    const before = incidentYear(s);
    recordIncident(s, { kind: 'car', tile: 0 });
    const after = incidentYear(s);
    expect(after.traffic).toBe(before.traffic);
    expect(after.seen).toBe(before.seen + 1);
    const e = monthlyIncidents(s); expect(e.car + e.ped + e.bike).toBeGreaterThanOrEqual(0);
    const r = deserialize(serialize(s)); expect(r.ok).toBe(true);
  });
  it('移動中の住民の経路を時間帯ごとに返す', () => {
    const tr = sampleTrips(S, 7.5, 20);
    expect(tr.length).toBeGreaterThan(0);
    for (const x of tr) { expect(x.path.length).toBeGreaterThan(0); expect(x.depart).toBeLessThanOrEqual(7.5); }
    expect(sampleTrips(S, 7.5, 20).map(x => x.person)).toEqual(tr.map(x => x.person));
  });
  it('v94 までのセーブ（事故の統計を持たない）を読める', () => {
    const s = town(2); delete s.incid;
    const r = deserialize(serialize(s)); expect(r.ok).toBe(true); if (!r.ok) return;
    stepMonth(r.state);
    expect((r.state.incid ?? []).length).toBe(1);
  });
});
