// v92：広げた住野市の全景と、広げた土地の近景。描画の重さ（三角形・draw call・メモリ）も出す
// OUT=出力先のフォルダ、VIEWS=撮る番号（0 全景、1 広げた土地の近景、2 東の境目の斜め見下ろし）、NAME=出力名の頭、TERRAIN=地形、DIST=dist のフォルダ（前の版との比較用）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const t = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, v = S.view; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh();
  const W = S.W, H = s.road.length / W; return { mid: Math.floor(H / 2) * W + Math.floor(W / 2), ext: Math.floor(H * 0.62) * W + Math.floor(W * 0.8), edge: 40 * W + 128, W, H }; });
await page.waitForTimeout(7000);
const cdp = await page.context().newCDPSession(page);
await cdp.send('HeapProfiler.collectGarbage');
const heap = await cdp.send('Runtime.getHeapUsage');
const mem = await page.evaluate(() => { const v = window.__sumu.view, r = v.renderer.info.memory; let verts = 0, bytes = 0, meshes = 0; v.scene.traverse(o => { const ge = o.geometry; if (ge?.attributes?.position) { meshes++; verts += ge.attributes.position.count; for (const a of Object.values(ge.attributes)) bytes += a.array.byteLength; if (ge.index) bytes += ge.index.array.byteLength; } }); return { ...r, meshes, verts, geoMB: Math.round(bytes / 1e6) }; });
console.log('MEM', JSON.stringify({ heapMB: Math.round(heap.usedSize / 1e6), ...mem }));
const far = Math.round(2600 * t.W / 76 * 0.98);
// [中心, 距離, 見下ろす角, 向き]
const V = [[t.mid, far, 1.05, 0], [t.ext, 700, 0.62, 0.5], [t.edge, 1300, 0.7, 1.2]], out = process.env.OUT ?? 'shots';
for (const k of (process.env.VIEWS ?? '0,1').split(',').map(Number)) { const [c, d, p, yaw] = V[k];
  await page.evaluate(([c, d, p, yaw]) => { const v = window.__sumu.view; v.focus(c, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; v.dist = v.want.dist = d; }, [c, d, p, yaw]);
  await page.waitForTimeout(5000);
  const r = await page.evaluate(() => { const i = window.__sumu.view.renderer.info.render; return { calls: i.calls, triangles: i.triangles }; });
  console.log('VIEW', k, JSON.stringify(r));
  await page.screenshot({ path: `${out}/${process.env.NAME ?? 'v92'}-${k}.png` }); }
console.log(JSON.stringify(t), errors.filter(e => !e.includes('TUNNEL')).slice(0, 5)); await browser.close();
