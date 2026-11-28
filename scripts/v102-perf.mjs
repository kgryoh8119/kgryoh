// v102：重さの元の計測。品質（低・中・高）× 場面（全景・近景・駅前・地上視点）ごとに、三角形・draw call（影を含む／影だけ）、
// JS の 1 フレームの時間（車・人の更新、町の作り直し、影・描画）を測る。ソフトウェア描画（SwiftShader）なので fps は目安。
// node scripts/v102-perf.mjs（先に npx vite build）。OUT=docs/v102-perf-after.json  QS=low,mid,high  N=6（測るコマ数）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/v102-perf.json', QS = (process.env.QS ?? 'low,mid,high').split(','), N = Number(process.env.N ?? 6), WARM = Number(process.env.WARM ?? 4), SC = process.env.SC ? process.env.SC.split(',') : null; // v105a：WARM（測る前に回すコマ数）・SC（場面を絞る）
const { browser, page, errors } = await open(1280, 800, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true;
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {};
  // 区間ごとの時間を測るため、主な処理を包む
  const T = v.__t = {}; const wrap = (o, k, name) => { const f = o[k]; if (typeof f !== 'function') return; o[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[name] = (T[name] ?? 0) + performance.now() - t; } }; };
  for (const k of ['moveAgents', 'rebuildTown', 'rebuildRoads', 'rebuildSites', 'decorate', 'rebuildOverlay', 'updateLod', 'moveBuses', 'dramatize', 'updatePaddy', 'spawnAgents']) wrap(v, k, k);
});
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; let x = 0, y = 0, n = 0, best = null, bv = -1e9;
  for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = Math.round(x / n), cy = Math.round(y / n);
  for (const b of s.buildings) if (b.kind === 'station') { const d = -Math.abs(b.x - cx) - Math.abs(b.y - cy); if (d > bv) { bv = d; best = b; } }
  return { pop: Math.round(s.stats.pop), c: cy * W + cx, st: best ? best.y * W + best.x : cy * W + cx }; });
console.log(JSON.stringify(info));
const SCENES = [['全景', 'c', 2600, 0.95, 'orbit'], ['近景', 'c', 420, 0.62, 'orbit'], ['駅前', 'st', 150, 0.6, 'orbit'], ['地上', 'st', 150, 0.6, 'ground']];
const res = [];
for (const q of QS) {
  await page.evaluate(q => window.__sumu.view.setQuality(q), q);
  for (const [name, at, d, pitch, mode] of SCENES) {
    if (SC && !SC.includes(name)) continue;
    const r = await page.evaluate(([q, t, d, pitch, mode, N, WARM]) => { const v = window.__sumu.view; v.setMode('orbit'); v.hour = 8; v.holiday = false; v.applyTime?.(); v.focus(t, d); v.pitch = pitch; v.yaw = 0.7;
      v.target.x = v.want.x; v.target.z = v.want.z; v.dist = v.want.dist; if (mode === 'ground') v.setMode('ground');
      v.agentSpawnAt && (v.agentSpawnAt.x = -1e9); v.spawnAgents();
      for (let k = 0; k < WARM; k++) v.__frame.call(v, 0.1); // 作り直し・LOD を済ませる
      const gl = v.renderer.getContext(), px = new Uint8Array(4), sync = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); sync(); // 1 画素を読んで描画の終わりを待つ（GPU の分も含めた時間）
      const T = v.__t; for (const k in T) delete T[k];
      let js = 0, tot = 0; for (let k = 0; k < N; k++) { const t0 = performance.now(); v.__frame.call(v, 0.1); const t1 = performance.now(); sync(); const t2 = performance.now(); js += t1 - t0; tot += t2 - t0; }
      const inf = v.renderer.info.render, all = { tris: inf.triangles, calls: inf.calls };
      // 影だけの三角形・draw call：影を切って描いた差
      const cs = v.sun.castShadow; v.sun.castShadow = false; v.__frame.call(v, 0.1); const ns = { tris: v.renderer.info.render.triangles, calls: v.renderer.info.render.calls }; v.sun.castShadow = cs; v.__frame.call(v, 0.1);
      const per = {}; for (const k in T) per[k] = +(T[k] / N).toFixed(1);
      const ri = v.resInfo ?? {};
      return { q, scene: mode === 'ground' ? '地上' : null, tris: all.tris, calls: all.calls, shadowTris: all.tris - ns.tris, shadowCalls: all.calls - ns.calls,
        jsMs: +(js / N).toFixed(1), totalMs: +(tot / N).toFixed(1), per, cars: v.cars.length, peds: v.peds.length, visible: ri.visible, drawn: ri.drawn, far: ri.far };  }, [q, info[at], d, pitch, mode, N, WARM]);
    r.scene = name; res.push(r); console.log(JSON.stringify(r));
  }
}
fs.writeFileSync(OUT, JSON.stringify(res, null, 1));
// 表（Markdown）
console.log('| 品質 | 場面 | 三角形（万） | うち影 | draw call | うち影 | JS ms | 描き終わりまで ms | 車・人の更新 ms | LOD・作り直し ms | 精細な車/人 |');
for (const r of res) console.log(`| ${r.q} | ${r.scene} | ${(r.tris / 1e4).toFixed(0)} | ${(r.shadowTris / 1e4).toFixed(0)} | ${r.calls} | ${r.shadowCalls} | ${r.jsMs} | ${r.totalMs} | ${r.per.moveAgents ?? '-'} | ${((r.per.updateLod ?? 0) + (r.per.rebuildTown ?? 0) + (r.per.rebuildSites ?? 0) + (r.per.updatePaddy ?? 0)).toFixed(1)} | ${r.cars}/${r.peds} |`);
console.log('errors', errors.filter(e => !e.includes('TUNNEL')).slice(0, 5)); await browser.close();
