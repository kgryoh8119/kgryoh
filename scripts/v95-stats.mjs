// v95：全景の三角形の数と形状のメモリを計る（SHOT=1 で全景も撮る）。TERRAIN=地形、OUT=出力先、NAME=名前、DIST=dist の場所
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, process.env.MAP ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state, v = S.view; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; v.setQuality(q);
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh(); }, process.env.Q ?? 'high');
await page.waitForTimeout(4000);
const [x, y, d, p, yaw] = JSON.parse(process.env.V ?? '[96,84,6500,1.35,0]');
await page.evaluate(([x, y, d, p, yaw]) => { const v = window.__sumu.view, W = window.__sumu.W; v.focus(Math.max(0, Math.min(W - 1, Math.round(x))) + Math.max(0, Math.round(y)) * W, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; v.dist = v.want.dist = d; v.target.x = v.want.x = x * 30; v.target.z = v.want.z = y * 30; }, [x, y, d, p, yaw]);
await page.waitForTimeout(3000);
await page.evaluate(() => { const v = window.__sumu.view; for (let n = 0; n < 60 && v.lazyChunks?.size; n++) { v.lodT = 0; v.updateLod(0.016); } });
await page.waitForTimeout(Number(process.env.WAIT ?? 4000));
const st = await page.evaluate(() => { const v = window.__sumu.view, seen = new Set(); let bytes = 0;
  v.scene.traverse(o => { const g = o.geometry; if (!g || seen.has(g)) return; seen.add(g); for (const a of Object.values(g.attributes)) bytes += a.array.byteLength; if (g.index) bytes += g.index.array.byteLength; tri += (g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3 * (o.isInstancedMesh ? o.count : 1); });
  const r = v.renderer.info; return { triStatic: Math.round(tri), tris: r.render.triangles, calls: r.render.calls, geoMB: Math.round(bytes / 1048576), geos: r.memory.geometries }; });
if (process.env.SHOT) await page.screenshot({ path: `${process.env.OUT}/${process.env.NAME ?? 'full'}.png` });
console.log(JSON.stringify(st), errors.filter(e => !e.includes('404')).slice(0, 5)); await browser.close();
