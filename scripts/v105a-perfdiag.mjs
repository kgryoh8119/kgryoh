// v105a：全景の JS の時間の内わけ。1 コマずつ、updateLod の時間・その中で作った空き地の塊（buildPlain）の数と時間・
// 駅の段（stGrades）・道路の作り直し（rebuildRoads）・町の作り直し（rebuildTown）を数える。
// node scripts/v105a-perfdiag.mjs（先に npx vite build）。QS=mid,high  F=24（測るコマ数）
import { open } from './shot.mjs';
const QS = (process.env.QS ?? 'mid,high').split(','), F = Number(process.env.F ?? 24);
const { browser, page, errors } = await open(1280, 800, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true;
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {};
  const T = v.__t = {}, C = v.__c = {}; const wrap = (k) => { const f = v[k]; if (typeof f !== 'function') return; v[k] = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T[k] = (T[k] ?? 0) + performance.now() - t; C[k] = (C[k] ?? 0) + 1; } }; };
  for (const k of ['moveAgents', 'rebuildTown', 'rebuildRoads', 'rebuildSites', 'updateLod', 'buildPlain', 'stGrades', 'lookGrade', 'stStats', 'decorate', 'rebuildOverlay',
    'updateCamera', 'updateSky2', 'updateRide', 'moveBuses', 'moveShin', 'updateWeather', 'applyTime', 'dramatize', 'moveTsunami', 'updatePaddy', 'blackout', 'rush']) wrap(k);
  { const r = v.renderer, f = r.render; r.render = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { T.render = (T.render ?? 0) + performance.now() - t; } }; }
});
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; let x = 0, y = 0, n = 0;
  for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  return Math.round(y / n) * W + Math.round(x / n); });
for (const q of QS) {
  const r = await page.evaluate(([q, c, F]) => { const v = window.__sumu.view; v.setMode('orbit'); v.hour = 8; v.holiday = false; v.applyTime?.(); v.focus(c, 2600); v.pitch = 0.95; v.yaw = 0.7;
    v.target.x = v.want.x; v.target.z = v.want.z; v.dist = v.want.dist; v.updateCamera(0); // 先にカメラを全景の位置へ（作り直しのとき、後で作る空き地の塊がカメラの位置で決まるため）
    v.setQuality(q); v.agentSpawnAt && (v.agentSpawnAt.x = -1e9); v.spawnAgents();
    const rows = [];
    for (let k = 0; k < F; k++) { const T = v.__t, C = v.__c; for (const o of [T, C]) for (const x in o) delete o[x];
      const t0 = performance.now(); v.__frame.call(v, 0.1); const js = performance.now() - t0;
      rows.push({ k, js: +js.toFixed(1), lod: +(T.updateLod ?? 0).toFixed(1), plainN: C.buildPlain ?? 0, plain: +(T.buildPlain ?? 0).toFixed(1), lazy: v.lazyChunks.size, town: +(T.rebuildTown ?? 0).toFixed(1), roads: +(T.rebuildRoads ?? 0).toFixed(1), stG: +(T.stGrades ?? 0).toFixed(2), stGN: C.stGrades ?? 0, agents: +(T.moveAgents ?? 0).toFixed(1), render: +(T.render ?? 0).toFixed(1), rest: Object.fromEntries(Object.entries(T).filter(([k, x]) => x > 0.3 && !['render', 'moveAgents', 'updateLod', 'buildPlain', 'rebuildTown', 'rebuildRoads'].includes(k)).map(([k, x]) => [k, +x.toFixed(1)])) }); }
    return rows; }, [q, info, F]);
  console.log('quality', q); for (const x of r) console.log(JSON.stringify(x));
  // 作り直し・LOD の作成・シェーダーの準備（1 秒を超えるコマ）を除いた、ふだんのコマの中央値
  const st = r.slice(4).filter(x => x.lod < 1 && x.js < 1000), med = a => { const b = a.slice().sort((p, q) => p - q); return b.length ? b[b.length >> 1] : NaN; };
  console.log('steady', q, JSON.stringify({ n: st.length, js: med(st.map(x => x.js)), render: med(st.map(x => x.render)), agents: med(st.map(x => x.agents)), other: med(st.map(x => x.js - x.render - x.agents)) }));
}
console.log('errors', errors.filter(e => !e.includes('TUNNEL')).slice(0, 5)); await browser.close();
