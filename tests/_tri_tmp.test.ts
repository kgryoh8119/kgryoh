// @ts-nocheck
import { createRequire } from 'module'; const require = createRequire(import.meta.url);
import { test } from 'vitest';
import { MODEL, rng, DETAIL } from '../src/render/models';
import { Geo } from '../src/render/geo';
test.skipIf(!process.env.TRI)('tri count', () => {
  const kinds = ['house', 'apartment', 'mansion', 'shop', 'bakery', 'supermarket', 'konbini', 'cafe', 'drugstore', 'officeS', 'officeM', 'office', 'smallFactory', 'factory', 'nursery', 'school', 'park', 'fire'];
  const res = {};
  for (const mode of ['H', 'M', 'L']) for (const k of kinds) { let t = 0; const N = 60, fine = mode !== 'L';
    for (let i = 0; i < N; i++) { const c = { g: new Geo(), wa: new Geo(), wb: new Geo(), sign: new Geo(true), rnd: rng((i + 0.5) / N * 0.9 + 0.05), old: false, fine };
      DETAIL.frames = fine; DETAIL.hi = mode === 'H'; Geo.fineRoof = fine; Geo.ao = true; c.g.at(i * 1000, 0, 0); MODEL[k](c); c.g.wallMat = 1; DETAIL.frames = false; DETAIL.hi = false; Geo.ao = false;
      t += c.g.triangles + c.wa.triangles + c.wb.triangles + c.sign.triangles; }
    res[mode + ' ' + k] = Math.round(t / N); }
  require('fs').writeFileSync(process.env.TRI, JSON.stringify(res, null, 0).replace(/,/g, ',\n'));
}, 600000);
