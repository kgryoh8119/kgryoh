// v105a：駅舎の形（render/stationkit.ts）を、線路の形ごとに確かめる。高架は高架下のコンコース、地下は出入口と換気塔、赤れんがの駅の高層ビルは線路の反対側
import { describe, it, expect } from 'vitest';
import { Geo } from '../src/render/geo';
import { drawStationBuilding, type StationFrame } from '../src/render/stationkit';

const frame = (o: Partial<StationFrame>): StationFrame => ({ g: new Geo(), detail: 2, lamps: [], ox: 0, oy: 0, oz: 0, rot: 0, yr: 0, edgeN: 7.75, edgeF: -7.75, pfN: 5.75, pfF: -5.75, want: 0,
  grade: 2, seed: 7, elevated: false, heritage: false, shin: 0, ground: () => 0, ...o });
const verts = (g: Geo) => { const out: [number, number, number][] = []; for (let i = 0; i < g.pos.length; i += 3) out.push([g.pos[i], g.pos[i + 1], g.pos[i + 2]]); return out; };

describe('高架の駅', () => {
  const yr = 8.5;
  for (const grade of [0, 1, 2, 3, 4]) it(`段 ${grade}：桁の中に何も無く、線路の上に橋のコンコースが無い`, () => {
    const F = frame({ yr, elevated: true, grade, deck: 6.0 }); drawStationBuilding(F); const V = verts(F.g);
    expect(V.length).toBeGreaterThan(0);
    expect(V.every(v => v.every(Number.isFinite))).toBe(true);
    const over = V.filter(([, y, z]) => z > -6 && z < 6 && y > yr + 7); // 線路の真上（ホームの屋根より上）
    expect(over.length).toBe(0);
    const inDeck = V.filter(([, y, z]) => z > -5.9 && z < 5.9 && y > yr - 1.85 && y < yr + 1.05); // 桁（レールの 1.9m 下から床まで）
    expect(inDeck.length).toBe(0);
    const under = V.filter(([, y, z]) => z > -8 && z < 8 && y < yr - 2.3 && y > 1); // 高架下の駅舎
    expect(under.length).toBeGreaterThan(0);
  });
});

describe('地下の駅', () => {
  for (const grade of [0, 1, 2, 3, 4]) it(`段 ${grade}：敷地（88m × 28m）の中に、出入口${grade >= 2 ? 'と駅舎' : 'だけ'}`, () => {
    const F = frame({ under: true, grade, pfN: NaN, pfF: NaN, edgeN: 0, edgeF: 0 }); drawStationBuilding(F); const V = verts(F.g);
    expect(V.every(v => v.every(Number.isFinite))).toBe(true);
    expect(V.every(([x, , z]) => Math.abs(x) <= 44 && Math.abs(z) <= 14)).toBe(true);
    const top = Math.max(...V.map(v => v[1]));
    if (grade <= 1) expect(top).toBeLessThan(5); else if (grade === 2) expect(top).toBeLessThan(10); else expect(top).toBeGreaterThan(20);
    expect(F.lamps.length).toBeGreaterThan(0);
  });
});

describe('赤れんがの駅（大型ターミナル）', () => {
  it('反対側が空いていれば、高層ビルは線路の反対側（駅舎の両脇には建てない）', () => {
    const F = frame({ grade: 4, heritage: true, free: () => true }); const r = drawStationBuilding(F); const V = verts(F.g);
    expect(r.bld).toBeTruthy();
    const high = V.filter(v => v[1] > 30);
    expect(high.length).toBeGreaterThan(0);
    expect(high.every(v => v[2] < -15)).toBe(true);
  });
  it('反対側がふさがっていれば、駅前の側で駅舎から離し、低く（約 60m まで）', () => {
    const F = frame({ grade: 4, heritage: true, free: () => false }); drawStationBuilding(F); const V = verts(F.g);
    const top = Math.max(...V.map(v => v[1]));
    expect(top).toBeLessThan(62);
    expect(V.filter(v => v[1] > 25).every(v => Math.abs(v[0]) > 37)).toBe(true);
  });
});

describe('単線・複々線の地上の駅', () => {
  for (const [nm, o] of [['単線', { edgeN: 5.55, edgeF: -2.6, pfN: 3.55, pfF: NaN }], ['複々線', { edgeN: 12.15, edgeF: -12.15, pfN: 10.15, pfF: -10.15 }]] as const)
    for (const grade of [0, 1, 2, 3, 4]) it(`${nm}・段 ${grade}：形が作れる`, () => {
      const F = frame({ ...o, grade }); drawStationBuilding(F); const V = verts(F.g);
      expect(V.length).toBeGreaterThan(0); expect(V.every(v => v.every(Number.isFinite))).toBe(true);
    });
});
