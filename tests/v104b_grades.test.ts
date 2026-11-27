// v104b：駅・施設の見た目のグレード（render/grades.ts の純粋な関数）
import { describe, it, expect } from 'vitest';
import { stationGrade, stationHeritage, stationFloors, platformSpan, facilityGrade, FAC_NAMES, FAC_RULE, ST_NAMES, ST_RIDERS, ST_POP } from '../src/render/grades';

describe('駅の段', () => {
  it('lv 1 は乗降客数で 無人駅・小さな駅舎・橋上駅舎', () => {
    expect(stationGrade({ lv: 1, riders: 100, pop: 5000 })).toBe(0);
    expect(stationGrade({ lv: 1, riders: ST_RIDERS.manned - 1, pop: 5000 })).toBe(0);
    expect(stationGrade({ lv: 1, riders: ST_RIDERS.manned, pop: 5000 })).toBe(1);
    expect(stationGrade({ lv: 1, riders: 3100, pop: 5200 })).toBe(1); // 始めの街の中心の駅
    expect(stationGrade({ lv: 1, riders: ST_RIDERS.bridge, pop: 5000 })).toBe(2);
  });
  it('人口の多い街では乗る人が少なくても上の段', () => {
    expect(stationGrade({ lv: 1, riders: 0, pop: ST_POP.manned })).toBe(1);
    expect(stationGrade({ lv: 1, riders: 0, pop: ST_POP.bridge })).toBe(2);
  });
  it('lv 2 は駅ビル、lv 3 は大型ターミナル（乗る人に関係なく）', () => {
    expect(stationGrade({ lv: 2, riders: 0, pop: 0 })).toBe(3);
    expect(stationGrade({ lv: 3, riders: 0, pop: 0 })).toBe(4);
    expect(stationGrade({ lv: 9, riders: 0, pop: 0 })).toBe(4);
    expect(stationGrade({ lv: 0, riders: NaN, pop: NaN })).toBe(0);
  });
  it('段は lv と乗降客数について単調（増えて下がることはない）', () => {
    let prev = -1;
    for (const lv of [1, 2, 3]) for (let r = 0; r < 20000; r += 500) { const g = stationGrade({ lv, riders: r, pop: 1000 }); expect(g).toBeGreaterThanOrEqual(prev); prev = g; }
    expect(ST_NAMES.length).toBe(5);
  });
  it('赤れんがの駅舎は段 4 だけで、駅ごとに決まり、すべての駅にはならない', () => {
    for (let id = 0; id < 50; id++) for (const g of [0, 1, 2, 3]) expect(stationHeritage(g, id)).toBe(false);
    let n = 0; for (let id = 0; id < 300; id++) { const h = stationHeritage(4, id); expect(stationHeritage(4, id)).toBe(h); if (h) n++; }
    expect(n).toBeGreaterThan(60); expect(n).toBeLessThan(150);
  });
  it('階数とホームの長さ', () => {
    for (let id = 0; id < 100; id++) { const f3 = stationFloors(3, id), f4 = stationFloors(4, id);
      expect(f3.bldg).toBeGreaterThanOrEqual(6); expect(f3.bldg).toBeLessThanOrEqual(9);
      expect(f4.towerA).toBeGreaterThanOrEqual(22); expect(f4.towerA).toBeLessThanOrEqual(34); expect(f4.towerB).toBeGreaterThanOrEqual(18); expect(f4.towerB).toBeLessThanOrEqual(25); }
    for (let g = 0; g <= 4; g++) { const p = platformSpan(g); expect(p.half * 2).toBeGreaterThanOrEqual(82); expect(p.half).toBeLessThanOrEqual(50); expect(p.roof).toBeLessThanOrEqual(p.half); if (g) expect(p.roof).toBeGreaterThan(platformSpan(g - 1).roof); }
  });
});

describe('施設の段', () => {
  it('対象外の種類は -1', () => { expect(facilityGrade('house', 3, 1e5)).toBe(-1); expect(facilityGrade('station', 3, 1e5)).toBe(-1); });
  it('学校：小さな街のレベル 1 は木造の分校、レベル 4 から大規模校', () => {
    expect(facilityGrade('school', 1, 2000)).toBe(0);
    expect(facilityGrade('school', 1, 5000)).toBe(1);
    expect(facilityGrade('school', 2, 2000)).toBe(1);
    expect(facilityGrade('school', 4, 2000)).toBe(2);
  });
  it('病院・警察署・公園は lv だけで決まる', () => {
    expect([1, 2, 3, 4, 5].map(l => facilityGrade('hospital', l, 1e6))).toEqual([0, 0, 1, 1, 2]);
    expect([1, 2, 3, 4, 5].map(l => facilityGrade('police', l, 0))).toEqual([0, 0, 1, 1, 2]);
    expect([1, 2, 3, 4, 5].map(l => facilityGrade('park', l, 0))).toEqual([0, 1, 1, 2, 2]);
  });
  it('交番・消防署・市役所：小さな街は駐在所・出張所・町役場', () => {
    expect(facilityGrade('koban', 1, 3000)).toBe(0); expect(facilityGrade('koban', 1, 9000)).toBe(1); expect(facilityGrade('koban', 4, 100)).toBe(2);
    expect(facilityGrade('fire', 1, 3000)).toBe(0); expect(facilityGrade('fire', 3, 3000)).toBe(1); expect(facilityGrade('fire', 5, 3000)).toBe(2);
    expect(facilityGrade('cityHall', 1, 8000)).toBe(0); expect(facilityGrade('cityHall', 1, 20000)).toBe(1); expect(facilityGrade('cityHall', 4, 20000)).toBe(2);
  });
  it('どの対象の種類も、名前が 3 段あり、段は lv について単調', () => {
    for (const k of Object.keys(FAC_RULE) as (keyof typeof FAC_RULE)[]) {
      expect(FAC_NAMES[k]?.length).toBe(3);
      for (const pop of [0, 5000, 50000]) { let p = -1; for (let l = 1; l <= 5; l++) { const g = facilityGrade(k, l, pop); expect(g).toBeGreaterThanOrEqual(p); expect(g).toBeLessThanOrEqual(2); p = g; } }
    }
  });
});
