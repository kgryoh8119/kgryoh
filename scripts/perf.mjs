// 1 フレームの中の重さ：経営（game.tick）・描画（view.frame）・画面（ui.tick）・月の計算（stepMonth）を測る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(Number(process.env.W ?? 390), Number(process.env.H ?? 844), 'sumino');
const r = await page.evaluate(async () => {
  const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('mid');
  const T = {}; const wrap = (o, k, name) => { const f = o[k].bind(o); o[k] = (...a) => { const t = performance.now(); try { return f(...a); } finally { T[name] = (T[name] ?? 0) + performance.now() - t; } }; };
  wrap(g, 'tick', 'game.tick'); wrap(S.view, 'frame', 'view.frame'); wrap(S.ui, 'tick', 'ui.tick'); wrap(S.ui, 'renderSide', 'ui.renderSide'); wrap(S.ui, 'refresh', 'ui.refresh');
  for (const k of ['rebuildTown', 'rebuildRoads', 'rebuildOverlay', 'rebuildSites', 'moveAgents', 'decorate', 'dramatize', 'moveLife', 'moveFlow', 'moveCrowd', 'moveTrains', 'updateWeather', 'applyTime']) if (S.view[k]) wrap(S.view, k, 'v.' + k);
  for (const k of ['engageTick', 'renderTop', 'updateLabels', 'flushNotes']) if (S.ui[k]) wrap(S.ui, k, 'u.' + k);
  for (let i = 0; i < 36; i++) S.stepMonth(s);
  let st = 0; const ts = performance.now(); for (let i = 0; i < 6; i++) S.stepMonth(s); st = (performance.now() - ts) / 6;
  g.auto = true; g.speed = 3; for (const k in T) T[k] = 0;
  const t0 = performance.now(), f0 = S.view.frames ?? 0; let n = 0; await new Promise(res => { const tick = () => { n++; if (performance.now() - t0 < 15000) requestAnimationFrame(tick); else res(); }; requestAnimationFrame(tick); });
  const el = performance.now() - t0; const out = Object.fromEntries(Object.entries(T).map(([k, v]) => [k, Math.round(v / n * 10) / 10]).sort((a, b) => b[1] - a[1]));
  return { frames: n, msPerFrame: Math.round(el / n), stepMonthMs: Math.round(st), month: s.month, pop: Math.round(s.stats.pop), perFrame: out, tris: S.view.stats.tris, calls: S.view.stats.calls };
});
console.log(JSON.stringify(r, null, 1)); console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
