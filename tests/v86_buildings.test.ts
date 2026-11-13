// v86：民間の建物の型と細部。同じ乱数なら同じ形になること、品質（細部の有無）で乱数の並びが変わらないこと、型が十分に分かれること
import { test, expect } from 'vitest';
import { MODEL, rng, DETAIL } from '../src/render/models';
import { Geo } from '../src/render/geo';
import type { Kind } from '../src/sim/types';
const KINDS: Kind[] = ['house', 'apartment', 'mansion', 'shop', 'bakery', 'supermarket', 'officeS', 'officeM', 'smallFactory'];
/** 1 棟を組み、本体の頂点と、使った乱数の数を返す */
function build(k: Kind, v: number, q: 'high' | 'mid' | 'low') {
  const fine = q !== 'low'; let n = 0; const r = rng(v * 0.9 + 0.05);
  const c = { g: new Geo(), wa: new Geo(), wb: new Geo(), sign: new Geo(true), rnd: () => { n++; return r(); }, old: false, fine };
  DETAIL.frames = fine; DETAIL.hi = q === 'high'; Geo.fineRoof = fine; Geo.ao = true; c.g.at(120, 0, 240);
  try { MODEL[k](c); } finally { DETAIL.frames = false; DETAIL.hi = false; Geo.ao = false; c.g.wallMat = 1; }
  return { c, n };
}
test('同じ乱数なら同じ形（作り直しても変わらない）', () => {
  for (const k of KINDS) for (const v of [0.13, 0.57, 0.91]) {
    const a = build(k, v, 'high').c, b = build(k, v, 'high').c;
    expect(a.g.pos.length, k).toBe(b.g.pos.length); expect(a.g.col).toEqual(b.g.col); expect(a.wa.pos.length + a.wb.pos.length).toBe(b.wa.pos.length + b.wb.pos.length);
  }
});
test('品質で乱数の並びが変わらない（高品質と低品質で同じ型・同じ色になる）', () => {
  for (const k of KINDS) for (let i = 0; i < 12; i++) { const v = (i + 0.5) / 12;
    const h = build(k, v, 'high').n, m = build(k, v, 'mid').n, l = build(k, v, 'low').n;
    expect([k, v, m], 'mid').toEqual([k, v, h]); expect([k, v, l], 'low').toEqual([k, v, h]);
  }
});
test('戸建て・アパート・マンションは形の違う型に分かれる', () => {
  // 屋根の高さ（本体の頂点の最高点）と外壁の素材の組で型を見分ける
  const sig = (k: Kind, v: number) => { const g = build(k, v, 'mid').c.g; let top = 0; for (let i = 1; i < g.pos.length; i += 3) top = Math.max(top, g.pos[i]); return `${Math.round(top * 2)}|${[...new Set(g.surf.filter(s => s >= 4))].sort().join('.')}`; };
  for (const [k, min] of [['house', 10], ['apartment', 5], ['mansion', 4]] as [Kind, number][]) {
    const s = new Set<string>(); for (let i = 0; i < 60; i++) s.add(sig(k, (i + 0.5) / 60));
    expect(s.size, k).toBeGreaterThanOrEqual(min);
  }
});
test('細部を増やしても三角形は高品質で 3 割増しまで（v85 の値と比べる）', () => {
  const V85: Partial<Record<Kind, number>> = { house: 3101, apartment: 5009, mansion: 5880, shop: 2255, officeS: 2524, officeM: 4474 };
  for (const [k, base] of Object.entries(V85) as [Kind, number][]) { let t = 0; const N = 40;
    for (let i = 0; i < N; i++) { const { c } = build(k, (i + 0.5) / N, 'high'); t += c.g.triangles + c.wa.triangles + c.wb.triangles + c.sign.triangles; }
    expect(t / N, k).toBeLessThanOrEqual(base * 1.3);
  }
});
