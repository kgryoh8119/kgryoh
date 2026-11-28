// v105b：未就学児は一人で移動しない・集団登校・バス停で待つ人は住民のバスの移動から・公園の利用は時刻と曜日で変わる
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, dispatch, W } from '../src/sim/index';
import { people, peopleStats, weekdayLegs, busWaiting, busFlowHour, sampleTrips, ESC_HOME, ESC_WORK, ESC_GRAND, ESC_BUS } from '../src/sim/people';
import { outings, parkPresent, parkByHour, OUT_WALK, OUT_TODDLER, OUT_KIDS, OUT_JOG } from '../src/sim/leisure';
import { residentPlan, companionTrips, stationFlow, dowOf } from '../src/render/residents';
import { serialize, deserialize } from '../src/sim/save';
import { fam } from '../src/sim/config';
import type { GameState } from '../src/sim/types';
import '../src/sim/wire';

function town(months = 30): GameState {
  const s = newGame(); s.tutorial.done = true;
  for (let m = 0; m < months; m++) { stepMonth(s); s.events.active = []; s.goalPick = false; s.pendingElection = null; }
  return s;
}
const S = town();
/** 住宅のまわりの道路にバス停を置いた街（バスで通う住民ができる） */
function busTown(): GameState {
  const s = town(); s.cash = 1e7;
  const tiles: number[] = [];
  for (const b of s.buildings) if (b.hh && b.acc >= 0 && b.id % 3 === 0 && !tiles.some(t => Math.abs(t % W - b.acc % W) + Math.abs(((t / W) | 0) - ((b.acc / W) | 0)) < 5)) tiles.push(b.acc);
  for (const b of s.buildings) if ((fam(b.kind) === 'shop' || b.kind === 'station' || (b.kind as string) === 'cityHall') && b.acc >= 0 && !tiles.includes(b.acc)) tiles.push(b.acc);
  expect(dispatch(s, { type: 'busStop', tiles, on: true }).ok).toBe(true);
  return s;
}

describe('v105b 未就学児の送り迎え・集団登校', () => {
  it('未就学児は一人で移動しない（園に通う子は全員、朝も夕方も送り迎えの人か園バス）', () => {
    const p = people(S), { legs } = weekdayLegs(S);
    let att = 0;
    const withAm = new Set<number>(), withPm = new Set<number>();
    for (const l of legs) for (const k of l.with) if (p.role[k] === 0) (l.why === '保育園・幼稚園へ送る' ? withAm : withPm).add(k);
    for (let i = 0; i < p.n; i++) {
      if (p.role[i] !== 0 || p.dest[i] < 0) continue; att++;
      // 朝
      if (p.escAm[i] === -2) { expect(p.escKAm[i]).toBe(ESC_BUS); expect(legs.some(l => l.p === i && l.why === '園バス' && l.mode === 2)).toBe(true); }
      else { expect(withAm.has(i)).toBe(true); const g = p.escAm[i]; expect([3, 4, 5]).toContain(p.role[g]); expect([ESC_HOME, ESC_WORK, ESC_GRAND]).toContain(p.escKAm[i]);
        if (p.escKAm[i] !== ESC_GRAND) { expect(p.home[g]).toBe(p.home[i]); expect(p.hhType[g]).toBe(p.hhType[i]); } else expect(p.home[g]).toBe(p.home[i]); }
      // 夕方
      if (p.escPm[i] === -2) expect(legs.some(l => l.p === i && l.why === '園バスで帰る')).toBe(true); else expect(withPm.has(i)).toBe(true);
      expect(p.depart[i]).toBeGreaterThanOrEqual(7 - 1e-6); // 保育所は 7 時から
      expect(p.back[i]).toBeLessThanOrEqual(19);              // 延長保育は 19 時まで
    }
    expect(att).toBeGreaterThan(0);
    // 未就学児が先に立つ区間は園バスだけ
    for (const l of legs) if (p.role[l.p] === 0) expect(l.mode).toBe(2);
    // 画面に出す移動：朝・夕方のどの時刻も、未就学児は一人では出てこない（いっしょに歩く人は先の人から作る）
    for (const h of [7, 7.5, 8, 8.5, 15, 16.5, 17.5, 18.5]) {
      for (const t of sampleTrips(S, h, 4000)) if (t.role === 0) expect(t.mode).toBe(2);
      const pl = residentPlan(S, h, false, W / 2, 84, 400, 20000);
      for (const t of pl.trips) { if (t.role === 0) expect(t.mode).toBe(2); for (const c of companionTrips(S, t)) expect(c.person).not.toBe(t.person); }
    }
  });
  it('働く親が送るときは、いつもの時刻に園を出られるよう家を早く出る（園から職場へ）', () => {
    const p = people(S), { legs } = weekdayLegs(S);
    for (let i = 0; i < p.n; i++) {
      if (p.role[i] !== 0 || p.escKAm[i] !== ESC_WORK) continue; const g = p.escAm[i]; if (p.mode[g] === 255) continue;
      const drop = legs.find(l => l.p === g && l.why === '保育園・幼稚園へ送る'); expect(drop).toBeTruthy();
      const next = legs.find(l => l.p === g && l.dep >= drop!.dep + drop!.dur - 1e-6 && l.why !== '保育園・幼稚園へ送る'); expect(next).toBeTruthy();
      expect(next!.from).toBe(drop!.to); // 園から
    }
  });
  it('小学生の朝の徒歩通学は班（集団登校）で、班の子は班長の区間に入る', () => {
    const p = people(S), { legs } = weekdayLegs(S), grp = legs.filter(l => l.why === '集団登校');
    expect(grp.length).toBeGreaterThan(0);
    const inG = new Set<number>(); for (const g of grp) { expect(p.role[g.p]).toBe(1); expect(g.with.length).toBeGreaterThan(0); expect(g.with.length).toBeLessThanOrEqual(9); for (const k of [g.p, ...g.with]) { expect(inG.has(k)).toBe(false); inG.add(k); expect(p.dest[k]).toBe(g.dest); expect(g.dep).toBeLessThanOrEqual(p.depart[k] + 1e-6); } }
    // 班の子は自分の朝の区間を持たない
    for (const l of legs) if (l.why === '通学' && inG.has(l.p)) expect(false).toBe(true);
  });
  it('統計（人口・就業・駅の乗車・事故の起きやすさの積み上げ）は送り迎えで変わらない', () => {
    const st = peopleStats(S), p = people(S);
    let b = 0; for (const v of st.boardings.values()) b += v; let n = 0; for (let i = 0; i < p.n; i++) if (p.station[i] >= 0) n++;
    expect(b).toBe(n); expect(st.n).toBe(Math.round(S.stats.pop));
  });
});

describe('v105b バス停で待つ人', () => {
  const B = busTown();
  it('待つ人の数は、住民のバスの移動（いまそのバス停で待っている人）の数どおり', () => {
    const p = people(B), { legs, waits } = weekdayLegs(B);
    let riders = 0; for (let i = 0; i < p.n; i++) if (p.mode[i] === 2 || (p.mode[i] === 3 && p.access[i] === 2)) riders++;
    expect(riders).toBeGreaterThan(0);
    expect(waits.length).toBe(riders * 2); // 行きと帰りに 1 回ずつ
    let peak = 0;
    for (const h of [6.5, 7, 7.25, 7.5, 7.75, 8, 8.5, 12, 17, 18]) {
      const m = busWaiting(B, h); let tot = 0;
      for (const [stop, v] of m) { tot += v; expect((B.busStops ?? []).includes(stop)).toBe(true);
        expect(v).toBe(waits.filter(w => w.stop === stop && h >= w.t0 && h < w.t1).length); }
      if (h >= 7 && h <= 8) peak = Math.max(peak, tot);
    }
    expect(peak).toBeGreaterThan(0);
    // 待っている人は、待ち終わる時刻にそのバス停からバスに乗る
    for (const w of waits) { const ride = legs.find(l => l.p === w.p && l.mode === 2 && Math.abs(l.dep - w.t1) < 1e-6); expect(ride).toBeTruthy(); expect(ride!.from).toBe(w.stop); expect(w.t1 - w.t0).toBeLessThanOrEqual(1 / 3 + 1e-6); }
    // 乗る人・降りる人の 1 時間の数は、バスの区間の数どおり
    let board = 0, all = 0; for (let h = 0; h < 24; h++) for (const v of busFlowHour(B, h).values()) board += v.board;
    for (const l of legs) if (l.mode === 2 && !l.why.startsWith('園バス')) all++;
    expect(board).toBe(all);
  });
  it('バスで通う人を増やすと、そのバス停で待つ人が増える（バス停がなければ 0）', () => {
    expect(busWaiting(S, 7.5).size).toBe(0);
    const m1 = busWaiting(B, 7.5); let t1 = 0; for (const v of m1.values()) t1 += v;
    const s2 = deserialize(serialize(B)); expect(s2.ok).toBe(true); if (!s2.ok) return;
    for (const b of s2.state.buildings) if (b.hh) b.hh = b.hh.map(v => v * 3);
    s2.state.stats.pop *= 3; // 住民の作り直し（人口の目安が変わる）
    let t2 = 0; for (let h = 7; h < 8.5; h += 0.05) for (const v of busWaiting(s2.state, h).values()) t2 += v;
    let t1s = 0; for (let h = 7; h < 8.5; h += 0.05) for (const v of busWaiting(B, h).values()) t1s += v;
    expect(t2).toBeGreaterThan(t1s * 1.5);
    void t1;
  });
});

describe('v105b 公園の利用（時刻・曜日・年代）', () => {
  it('平日も公園に人がいる：朝は高齢者の散歩、昼前は親子、放課後は小学生、夜はジョギング。土日はもっと多い', () => {
    const wd = parkByHour(S, 1), we = parkByHour(S, 6);
    expect(wd[10]).toBeGreaterThan(0); expect(wd[16]).toBeGreaterThan(0);
    const walk = parkByHour(S, 1, OUT_WALK), tod = parkByHour(S, 1, OUT_TODDLER), kids = parkByHour(S, 1, OUT_KIDS), jog = parkByHour(S, 1, OUT_JOG);
    expect(Math.max(walk[6], walk[7], walk[8])).toBeGreaterThan(walk[13]);
    expect(tod[10] + tod[11]).toBeGreaterThan(tod[15] + tod[16]);
    expect(kids[15] + kids[16]).toBeGreaterThan(0); expect(kids[10] + kids[11]).toBe(0); // 平日の昼前は学校
    expect(jog[19] + jog[20] + jog[21]).toBeGreaterThanOrEqual(jog[12]);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    expect(sum(we)).toBeGreaterThan(sum(wd) * 1.3);
    expect(wd[2]).toBe(0); // 夜中は 0
  });
  it('公園にいる人数は外出の一覧（だれが・いつ・どの公園）の積み上げで、同じ状態・曜日なら同じ。保存して読み直しても同じ', () => {
    const a = outings(S, 2), b = outings(S, 2); expect(b).toBe(a);
    const m = parkPresent(S, 10.5, 2); let tot = 0; for (const v of m.values()) tot += v; expect(tot).toBe(parkByHour(S, 2)[10]);
    for (const o of a) { const pk = S.buildings.find(x => x.id === o.park)!; expect(fam(pk.kind)).toBe('park'); expect(o.dep).toBeGreaterThanOrEqual(6); expect(o.dep + 2 * o.tt + o.stay).toBeLessThan(23); }
    const r = deserialize(serialize(S)); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(outings(r.state, 2).map(o => [o.p, o.park, o.dep])).toEqual(a.map(o => [o.p, o.park, o.dep]));
    // 曜日で変わる
    expect(outings(S, 0).map(o => o.p).join()).not.toBe(outings(S, 5).map(o => o.p).join());
  });
  it('曜日の決め方：休日を固定しても土日、平日を固定しても月〜金', () => {
    for (let d = 0; d < 14; d++) { expect(dowOf(true, d)).toBeGreaterThanOrEqual(5); expect(dowOf(false, d)).toBeLessThan(5); }
  });
});

describe('v105b 駅へ歩く人と保存', () => {
  it('駅に着く人の数（1 時間あたり）は、駅までの区間の終わりの時刻から出て、電車で通う人の数と合う', () => {
    const p = people(S); let rail = 0; for (let i = 0; i < p.n; i++) if (p.mode[i] === 3) rail++;
    let sum = 0; for (let h = 4; h < 12; h += 0.5) { const f = stationFlow(S, h + 0.25, false); for (const v of f.now.values()) sum += v * 0.5; } // 30 分ごとの 1 時間あたりの値 × 0.5 時間
    expect(Math.abs(sum - rail)).toBeLessThanOrEqual(Math.max(2, rail * 0.02));
  });
  it('区間・送り迎え・バス停・外出は保存して読み直しても同じ', () => {
    const B = busTown(), a = weekdayLegs(B);
    const r = deserialize(serialize(B)); expect(r.ok).toBe(true); if (!r.ok) return;
    const b = weekdayLegs(r.state), pa = people(B), pb = people(r.state);
    expect(b.legs.length).toBe(a.legs.length); expect(b.waits.map(w => [w.p, w.stop, w.t0])).toEqual(a.waits.map(w => [w.p, w.stop, w.t0]));
    expect(Array.from(pb.escAm)).toEqual(Array.from(pa.escAm)); expect(Array.from(pb.depart)).toEqual(Array.from(pa.depart)); expect(Array.from(pb.stop)).toEqual(Array.from(pa.stop));
  });
});
