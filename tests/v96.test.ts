// v96：オートの計画的な宅地開発（道路に面していない空き地へ、既存の道路から格子状の生活道路を引く）
import { describe, it, expect } from 'vitest';
import { newGame, dispatch, seedForTerrain, W, H, roadInfo } from '../src/sim/index';
import { planGrid, frontage, devFree, landSpare } from '../src/autodev';
import '../src/sim/wire';

describe('v96 オートの宅地開発', () => {
  it('格子状の計画は、既存の道路につながり、道路に面していなかった空き地を道路に面するようにする', () => {
    const s = newGame({ seed: seedForTerrain('coast', 261011) }); s.tutorial.done = true; s.cash = 1e6;
    const before = landSpare(s);
    const gp = planGrid(s, { x: W >> 1, y: H >> 1 });
    expect(gp).not.toBeNull();
    const f0 = frontage(s);
    expect(gp!.lots.every(i => !f0[i] && devFree(s)(i))).toBe(true);
    expect(gp!.gain).toBeGreaterThanOrEqual(8);
    expect(dispatch(s, { type: 'road', tiles: gp!.road, road: 1 }).ok).toBe(true);
    // 引いた道路はすべて市外までつながり、使えるようになるはずの区画は道路に面している
    const conn = roadInfo(s).conn;
    expect(gp!.road.filter(i => s.road[i]).every(i => conn[i])).toBe(true);
    const f1 = frontage(s);
    const fronted = gp!.lots.filter(i => f1[i]).length;
    expect(fronted).toBeGreaterThanOrEqual(gp!.lots.length * 0.9);
    expect(landSpare(s).back).toBeLessThan(before.back);
  });
  it('工事費の上限より高い計画は選ばない', () => {
    const s = newGame({ seed: seedForTerrain('coast', 261011) });
    const gp = planGrid(s, { x: W >> 1, y: H >> 1 }, { maxCost: 1 });
    expect(gp).toBeNull();
  });
});
