// v88：無人島（特別シナリオ）。桟橋 → 道 → 水 → 電気 → 住まい の順に整えると人が来ること、桟橋がないと誰も来ないこと、長く回しても壊れないこと
import { test, expect } from 'vitest';
import { newGame, stepMonth, dispatch, checkPlace, seedForTerrain, getMap, W, H, DEFS, isleNext, foodSelf, monthlyIssues, missionsFor, type GameState, type Kind } from '../src/sim/index';

const SEED = seedForTerrain('castaway');
const fresh = () => { const s = newGame({ seed: SEED }); s.goalPick = false; return s; };
const ok = (s: GameState, k: Kind, x: number, y: number) => checkPlace(s, k, x, y).level !== 'error';
/** 入り江の近くで、桟橋を置ける場所と、そこから内陸へのびる道路の列 */
function landing(s: GameState): { px: number; py: number; road: number[] } {
  const m = getMap(s.seed);
  for (let y = H - 3; y > 60; y--) for (let x = 60; x < 84; x++) {
    if (!ok(s, 'pier', x, y)) continue;
    // 桟橋の上の区画から北へ道路
    const road: number[] = []; let yy = y - 1;
    while (yy > y - 14 && !m.water[yy * W + x] && !m.forest[yy * W + x] && !m.steep[yy * W + x]) { road.push(yy * W + x); yy--; }
    if (road.length >= 8) return { px: x, py: y, road };
  }
  throw new Error('桟橋の場所がない');
}
/** 道路の両側に施設を置く */
function along(s: GameState, road: number[], k: Kind, n: number): number {
  let put = 0;
  for (const i of road) for (const dx of [1, -1]) { if (put >= n) return put; const x = (i % W) + (dx > 0 ? 1 : -DEFS[k].w), y = (i / W) | 0; if (ok(s, k, x, y) && dispatch(s, { type: 'build', kind: k, x, y }).ok) put++; }
  return put;
}
function settle(withPier: boolean): GameState & { L?: ReturnType<typeof landing> } {
  const s = fresh(), L = landing(s);
  const must = (r: { ok: boolean; msg: string }) => { if (!r.ok) throw new Error(r.msg); };
  if (withPier) must(dispatch(s, { type: 'build', kind: 'pier', x: L.px, y: L.py }));
  must(dispatch(s, { type: 'road', tiles: L.road, road: 1 }));
  expect(along(s, L.road, 'well', 2)).toBe(2);
  expect(along(s, L.road, 'solarKit', 2)).toBe(2);
  expect(along(s, L.road, 'kaitaku', 6)).toBeGreaterThanOrEqual(5);
  for (let m = 0; m < 18; m++) { stepMonth(s); s.events.active = []; }
  return Object.assign(s, { L });
}

test('無人島ははじめ、道路も建物も人もない', () => {
  const s = fresh();
  expect(s.buildings.length).toBe(0);
  expect(s.road.some(v => v > 0)).toBe(false);
  expect(s.stats.pop).toBe(0);
  expect(isleNext(s)?.key).toBe('pier');
  expect(monthlyIssues(s)[0]?.key).toBe('isle');
  expect(missionsFor(s)[0].id).toBe('i-pier');
  // 島の施設は、ふつうの街では建てられない
  const c = newGame({ seed: seedForTerrain('coast') });
  expect(checkPlace(c, 'well', 20, 20).reasons.join()).toContain('無人島');
});

test('桟橋 → 道 → 水 → 電気 → 住まい の順に整えると、定期船で開拓者が来る', () => {
  const s = settle(true);
  console.log('pop', s.stats.pop.toFixed(1), 'hh', s.stats.households.toFixed(1), 'water', s.stats.waterCap, 'power', s.stats.powerCap, 'cash', Math.round(s.cash), 'next', isleNext(s)?.key, 'food', foodSelf(s).self.toFixed(2));
  expect(s.stats.households).toBeGreaterThan(5);
  expect(isleNext(s)?.key).toBe('food');
});

test('桟橋がなければ、道と家があっても誰も来ない', () => {
  const s = settle(false);
  expect(s.stats.households).toBeLessThan(0.01);
});

test('無人島を 20 年回しても NaN や例外が出ない', () => {
  const s = settle(true), L = s.L!; s.cash += 50000;
  along(s, L.road, 'kaitakuFarm', 1); along(s, L.road, 'dieselGen', 1);
  for (let m = 0; m < 222; m++) { stepMonth(s); s.events.active = []; for (const b of s.buildings) if ((b.status === 'suspended' || b.age > 80) && DEFS[b.kind].isle) dispatch(s, { type: 'renew', id: b.id }); /* 古くなった施設は更新する */ if (m % 24 === 0) console.log('y', m / 12, Math.round(s.stats.pop), Math.round(s.cash), 'sat', s.stats.sat.toFixed(2), 'w', Math.round(s.stats.waterCap), Math.round(s.stats.waterDemand), 'p', Math.round(s.stats.powerCap), Math.round(s.stats.powerDemand), 'b', s.buildings.length, s.fiscal?.status ?? ''); }
  expect(Number.isFinite(s.cash) && Number.isFinite(s.stats.pop) && Number.isFinite(s.stats.sat)).toBe(true);
  expect(s.stats.pop).toBeGreaterThan(0);
  console.log('20 年後', Math.round(s.stats.pop), '人', Math.round(s.cash), '万円', 'sat', s.stats.sat.toFixed(2));
}, 300000);
