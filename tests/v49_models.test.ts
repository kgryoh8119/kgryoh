// v49：すべての施設のモデルが例外なく組めて、頂点の座標が数になっていること（NaN がない）
import { test, expect } from 'vitest';
import { MODEL, rng } from '../src/render/models';
import { Geo } from '../src/render/geo';
import { DEFS } from '../src/sim/config';
test('全部の施設のモデルを組む', () => {
  const bad: string[] = [];
  for (const k of Object.keys(DEFS) as (keyof typeof MODEL)[]) {
    const c = { g: new Geo(), wa: new Geo(), wb: new Geo(), sign: new Geo(), rnd: rng(7), old: false, fine: true };
    try { MODEL[k](c); } catch (e) { bad.push(k + ': ' + (e as Error).message); continue; }
    for (const geo of [c.g, c.wa, c.sign]) { const p = (geo as any).pos ?? (geo as any).p ?? (geo as any).positions; if (p && Array.from(p as ArrayLike<number>).some(v => !Number.isFinite(v))) { bad.push(k + ': NaN'); break; } }
  }
  expect(bad).toEqual([]);
});
