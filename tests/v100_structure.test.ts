// v100：構造の点検。空中の道路・線路の桁は、支えの間隔が現実の目安（高架の桁 1 径間 40m 以下）に収まり、下の道路の車線・横断歩道・歩道には柱を立てない。
import { describe, it, expect } from 'vitest';
import { newGame, W, H, recompute } from '../src/sim/index';
import { grade, flySupports, flyPiers, isJunction, maxGap, FLY_MAXSPAN, FLY_ROAD_HALF, FLY_WALK, FLY_MEDIAN, FLY_RAMP } from '../src/sim/grade';
import type { GameState } from '../src/sim/index';

const idx = (x: number, y: number) => y * W + x;
function space(s: GameState, w: number, h: number): [number, number] {
  const free = (i: number) => !s.occ[i] && !s.road[i] && !s.rail?.[i];
  for (let y = 3; y < H - h - 3; y++) for (let x = 3; x < W - w - 3; x++) {
    let ok = true; for (let yy = y - 1; yy <= y + h && ok; yy++) for (let xx = x - 1; xx <= x + w && ok; xx++) if (!free(idx(xx, yy))) ok = false;
    if (ok) return [x, y];
  }
  throw new Error('空き地がありません');
}
const put = (s: GameState, i: number, r: number) => { s.road[i] = r; s.roadAge[i] = 0; s.zone[i] = 0; };
/** 横の幹線（行 Y+6、X〜X+22）に、縦の道路（cols：列と種類）が交わる。fly の列に立体交差 */
function scene(cols: [number, number][], fly: number[]) {
  const s = newGame({ seed: 3 }); s.cash = 1e8;
  const [X, Y] = space(s, 26, 14);
  for (let x = X; x <= X + 22; x++) put(s, idx(x, Y + 6), 2);
  for (const [c, r] of cols) for (let y = Y; y <= Y + 12; y++) if (y !== Y + 6) put(s, idx(X + c, y), r);
  s.flyover = fly.map(c => idx(X + c, Y + 6));
  s.roadVersion++; recompute(s);
  return { s, X, Y };
}

describe('v100：立体交差の高架の支え', () => {
  // 交差点が 4 つ続く幹線（列 5・6・7・8 に縦の幹線、9・10 に生活道路）。v95 までは交差点・脇道の区画に橋脚を立てないので、桁が長く支えなしで渡っていた
  const cases: [string, [number, number][], number[]][] = [
    ['交差点が続く', [[5, 2], [8, 2], [9, 1], [10, 2], [11, 3]], [5, 11]],
    ['交差点 1 つ', [[6, 2]], [6]],
    ['間をあけた 2 つ', [[5, 2], [9, 2], [12, 3]], [5, 9, 12]],
  ];
  for (const [name, cols, fly] of cases) it(`${name}：支えの間隔は 40m 以下で、柱は下の道路の車線・歩道・交わる道路の上に無い`, () => {
    const { s } = scene(cols, fly), L = grade(s);
    expect(L.spans.length, name + JSON.stringify([...L.flyBad.values()])).toBeGreaterThan(0);
    for (const sp of L.spans) {
      const sup = flySupports(s, sp);
      expect(maxGap(sup.map(o => o.a)), name).toBeLessThanOrEqual(FLY_MAXSPAN);
      const piers = new Set(flyPiers(s, sp));
      for (const o of sup) {
        const t = Math.floor(o.a / 30), ti = sp.ew ? idx(t, sp.line) : idx(sp.line, t), c = (t + 0.5) * 30;
        if (o.kind === 'median') { expect(piers.has(t)).toBe(true); expect(isJunction(s, ti)).toBe(false); expect(Math.abs(o.a - c)).toBeLessThan(1); } // 分離帯の区画の中心（交差点・脇道の区画ではない）
        if (o.kind === 'portal') {
          // 柱は下の幹線の歩道の外（横の位置）。区画の中心から前後へ、交わる道路の歩道の外（前後の位置）
          expect(o.lat! - 0.6).toBeGreaterThan(FLY_ROAD_HALF + FLY_WALK);
          expect(o.lat! + 0.6).toBeLessThan(15);
          const x = ti % W, y = (ti / W) | 0; let ch = 0;
          for (const [dx, dy] of sp.ew ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) { const r = s.road[idx(x + dx, y + dy)]; if (r) ch = Math.max(ch, [0, 2.5, 5, 7.5][r]); }
          expect(ch, '門形は交差点の区画に立つ').toBeGreaterThan(0);
          expect(Math.abs(o.a - c) - 0.6).toBeGreaterThan(ch + 2.5);
          expect(Math.abs(o.a - c) + 0.6).toBeLessThan(15);
        }
      }
      // 盛土の端は坂の中（平らな所の外）
      const ab = sup.filter(o => o.kind === 'abut').map(o => o.a);
      expect(ab.length).toBe(2);
      expect(Math.min(...ab)).toBeGreaterThan((sp.j0 - FLY_RAMP - 0.5) * 30); expect(Math.min(...ab)).toBeLessThan((sp.j0 - 0.5) * 30);
    }
    void FLY_MEDIAN;
  });
});
