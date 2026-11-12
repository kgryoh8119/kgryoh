// 実在都市版（保土ケ谷区）の確認
import { describe, it, expect } from 'vitest';
import mapText from '../public/maps/hodogaya.json?raw';
import { setMap } from '../src/sim/index';
import { newGame, stepMonth, dispatch, serialize, deserialize, forecast, validateState, W, H, SCALE, DISTRICTS, monthlyBudget } from '../src/sim/index';
import { ledgerGap } from '../src/sim/step';
import { checkPlace, planRoad, planZone, acqCost, DEFS as D, sumHH, idx as ix, P as PP } from '../src/sim/index';

setMap('hodogaya', JSON.parse(mapText));

describe('保土ケ谷区', () => {
  const t0 = performance.now();
  const s = newGame();
  const tNew = performance.now() - t0;
  it('初期状態が正しく、統計が出る', () => {
    const st = s.stats, L = monthlyBudget(s);
    console.log(`地図 ${W}×${H}、規模 ×${SCALE.toFixed(1)}、建物 ${s.buildings.length}、開始 ${tNew.toFixed(0)} ms`);
    console.log(`人口 ${st.pop.toFixed(0)}、世帯 ${st.households.toFixed(0)}/${st.units}、保育 ${st.careDemand.toFixed(0)}/${st.careCap.toFixed(0)} 待機 ${st.waitlist.toFixed(0)} [${st.waitDistrict.map(v => v.toFixed(0))}]、学校 ${st.schoolKids.toFixed(0)}/${st.schoolCap.toFixed(0)}、水 ${st.waterDemand.toFixed(0)}/${st.waterCap.toFixed(0)}、ごみ ${st.wasteDemand.toFixed(0)}/${st.wasteCap.toFixed(0)}`);
    console.log(`混雑 ${st.maxVc.toFixed(2)} 遅れ ${st.avgDelay.toFixed(2)}、店 ${st.shops} 買物 ${st.shopLevel.toFixed(2)}、消防 ${st.fireCover.toFixed(2)}、満足 ${st.sat.toFixed(3)} [${st.satType.map(v => v.toFixed(2))}] 地区 ${DISTRICTS.map((n, d) => n + ':' + st.satDistrict[d].toFixed(2) + '/' + st.popDistrict[d].toFixed(0)).join(' ')}`);
    console.log(`資金 ${s.cash}、収支 ${L.operating.toFixed(0)}（税 ${(L.taxResident + L.taxProperty + L.taxBusiness).toFixed(0)} 移転 ${L.transfer.toFixed(0)} 行政 ${L.admin.toFixed(0)} 維持 ${L.upkeep.toFixed(0)} 人件 ${L.wages.toFixed(0)} 道路 ${L.roads.toFixed(0)} 補助 ${L.subsidy.toFixed(0)}）`);
    const unconn = s.buildings.filter(b => !b.connected);
    console.log(`未接続 ${unconn.length}（${[...new Set(unconn.map(b => b.kind))].join(',')}）、声 ${s.voices.map(v => v.key).join(',')}`);
    expect(validateState(s)).toBeNull();
    expect(st.pop).toBeGreaterThan(50000);
  });
  it('月次計算・保存・予測', () => {
    const c = structuredClone(s);
    let t = performance.now();
    for (let i = 0; i < 12; i++) { stepMonth(c); for (const e of [...c.events.active]) dispatch(c, { type: 'event', id: e.id, option: 0 }); }
    const step = (performance.now() - t) / 12;
    const st = c.stats;
    console.log(`1 か月 ${step.toFixed(0)} ms。12 か月後：人口 ${st.pop.toFixed(0)} 待機 ${st.waitlist.toFixed(0)} 混雑 ${st.maxVc.toFixed(2)} 満足 ${st.sat.toFixed(3)} 資金 ${c.cash.toFixed(0)} 収支 ${c.ledger.at(-1)!.operating.toFixed(0)} 店 ${st.shops} 空室 ${(st.vacancy * 100).toFixed(1)}% 待ち ${st.pentUp.toFixed(0)} 着工 ${c.buildings.filter(b => b.status === 'construction').length} イベント ${c.events.log.map(e => e.id).join(',')}`);
    expect(Math.abs(ledgerGap(c.ledger.at(-1)!))).toBeLessThan(1e-6);
    t = performance.now(); const txt = serialize(c); const r = deserialize(txt);
    console.log(`保存 ${(txt.length / 1e6).toFixed(2)} MB、書き出し＋読込 ${(performance.now() - t).toFixed(0)} ms`);
    expect(r.ok).toBe(true);
    t = performance.now(); const before = serialize(c);
    const t1 = performance.now(); const c2 = structuredClone(c); for (let i = 0; i < 3; i++) stepMonth(c2, { forecast: true });
    console.log(`予測 1 か月 ${((performance.now() - t1) / 3).toFixed(0)} ms`);
    expect(serialize(c)).toBe(before);
  }, 300000);
  it('用地買収：住宅の街区に保育園を建てると、費用に用地費が入り、世帯は転居する', () => {
    const c = structuredClone(s);
    const lot = c.buildings.find(b => b.osm && b.kind === 'house' && b.connected && checkPlace(c, 'nursery', b.x, b.y).ok)!;
    expect(lot).toBeTruthy();
    const chk = checkPlace(c, 'nursery', lot.x, lot.y);
    expect(chk.acq).toEqual([lot.id]);
    expect(chk.cost).toBe(D.nursery.cost + acqCost(lot));
    const cash = c.cash, hh = sumHH(lot), pop = c.stats.households;
    const r = dispatch(c, { type: 'build', kind: 'nursery', x: lot.x, y: lot.y });
    expect(r.ok).toBe(true);
    expect(c.cash).toBeCloseTo(cash - chk.cost, 6);
    expect(c.buildings.some(b => b.id === lot.id)).toBe(false);
    expect(c.buildings.find(b => b.x === lot.x && b.y === lot.y)!.kind).toBe('nursery');
    expect(c.stats.households).toBeCloseTo(pop - hh, 3);
    expect(validateState(c)).toBeNull();
  });
  it('用地買収：道路を住宅の街区に通すと、費用は道路＋用地費で、表示と請求が一致する', () => {
    const c = structuredClone(s);
    const lot = c.buildings.find(b => b.osm && b.kind === 'house' && b.connected)!;
    const tiles = [ix(lot.x, lot.y)];
    const pl = planRoad(c, tiles, 1);
    expect(pl.ok).toEqual(tiles);
    expect(pl.cost).toBe(PP.roadCost[1] + acqCost(lot));
    const cash = c.cash;
    expect(dispatch(c, { type: 'road', tiles, road: 1 }).ok).toBe(true);
    expect(c.cash).toBeCloseTo(cash - pl.cost, 6);
    expect(c.road[tiles[0]]).toBe(1);
    expect(validateState(c)).toBeNull();
  });
  it('用途の引き上げ：地図の住宅の街区を中層・高層にすると、民間が建て替える', () => {
    const c = structuredClone(s);
    const lots = c.buildings.filter(b => b.osm && b.kind === 'house' && b.connected).slice(0, 400);
    const tiles = lots.map(b => ix(b.x, b.y));
    expect(planZone(c, tiles, 3).ok.length).toBe(tiles.length);
    expect(dispatch(c, { type: 'zone', tiles, zone: 3 }).ok).toBe(true);
    for (let i = 0; i < 12; i++) { stepMonth(c); for (const e of [...c.events.active]) dispatch(c, { type: 'event', id: e.id, option: 0 }); }
    const rebuilt = tiles.filter(t => { const b = c.buildings.find(o => o.id === c.occ[t]); return b && !b.osm && (b.kind === 'apartment' || b.kind === 'mansion'); });
    console.log(`用途を引き上げた 400 区画のうち、12 か月で建て替え ${rebuilt.length}`);
    expect(rebuilt.length).toBeGreaterThan(0);
    expect(validateState(c)).toBeNull();
  }, 120000);
});
