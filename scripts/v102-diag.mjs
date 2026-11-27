// v102：場面ごとに、見えている物の三角形を材質・影・視錐台カリングの有無で集計する（重さの元を探す）。node scripts/v102-diag.mjs（先に npx vite build）。Q=mid
import { open } from './shot.mjs';
const { browser, page } = await open(1280, 800, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const r = await page.evaluate(q => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; g.speed = 0; S.fixedQuality = true; const v = S.view; v.clockRun = false; v.__frame = v.frame; v.frame = () => {}; v.setQuality(q);
  const W = S.W; let x = 0, y = 0, n = 0; for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const c = Math.round(y / n) * W + Math.round(x / n); const out = {};
  for (const [nm, d, p] of [['near', 420, 0.62], ['far', 2600, 0.95]]) {
    v.focus(c, d); v.pitch = p; v.yaw = 0.7; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = d; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.1);
    const rows = {}; v.scene.traverseVisible(o => { if (!o.isMesh) return; const g = o.geometry; if (!g) return; let t = (g.index ? g.index.count : g.attributes.position.count) / 3; if (o.isInstancedMesh) t *= o.count;
      const key = (o.material?.type ?? '').replace('Material', '') + (o.isInstancedMesh ? ':inst' : '') + (o.castShadow ? ':cast' : '') + (o.frustumCulled ? ':fc' : ':nofc') + ':' + (o.material?.uuid.slice(0, 4)); const rr = rows[key] ??= { n: 0, tris: 0 }; rr.n++; rr.tris += t; });
    out[nm] = Object.entries(rows).sort((a, b) => b[1].tris - a[1].tris).slice(0, 14).map(([k, x]) => `${k} n=${x.n} tris=${(x.tris / 1e4).toFixed(1)}万`);
    out[nm + 'Info'] = { tris: v.renderer.info.render.triangles, calls: v.renderer.info.render.calls, chunks: v.chunkMeshes.size, low: [...v.chunkLow.values()].filter(m => m.visible).length };
  }
  return out; }, process.env.Q ?? 'mid');
console.log(JSON.stringify(r, null, 1)); await browser.close();
