// 建物の模型が敷地（w×h 区画）からはみ出していないか調べる
import { test } from 'vitest';
import { MODEL, rng } from '../src/render/models';
import { Geo } from '../src/render/geo';
import { DEFS, TILE } from '../src/sim/index';
test('bounds', () => {
  const out: string[] = [];
  for (const k of Object.keys(MODEL) as (keyof typeof MODEL)[]) {
    const d = DEFS[k]; if (!d) continue; const hx = (d.w ?? 1) * TILE / 2, hz = (d.h ?? 1) * TILE / 2;
    const c: any = { g: new Geo(), wa: new Geo(), wb: new Geo(), sign: new Geo(true), rnd: rng(0.37), old: false };
    try { MODEL[k](c); } catch (e) { out.push(`${k}: error ${e}`); continue; }
    let mx = 0, mz = 0; for (const g of [c.g, c.wa, c.wb, c.sign]) for (let i = 0; i < g.pos.length; i += 3) { mx = Math.max(mx, Math.abs(g.pos[i]) - hx); mz = Math.max(mz, Math.abs(g.pos[i + 2]) - hz); }
    if (mx > 0.3 || mz > 0.3) out.push(`${k} (${d.w}x${d.h}): x+${mx.toFixed(1)} z+${mz.toFixed(1)}`);
  }
  console.log(out.length + ' kinds over\n' + out.join('\n'));
});
