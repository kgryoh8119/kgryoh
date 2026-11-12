// v74：持ち物（裾・ベビーカー・車いす・犬・帽子）と、信号待ちの立ち姿を近くから撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const frames = (n) => page.evaluate((n) => new Promise(r => { let k = 0; const f = () => (++k >= n ? r(0) : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true;
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.2; });
const st = await page.evaluate(() => { const S = window.__sumu, b = S.game.state.buildings.find(b => b.kind === 'station'); return b.y * S.W + b.x; });
await page.evaluate((t) => window.__sumu.view.focus(t, 200), st); await frames(4);
await page.evaluate(() => window.__sumu.view.setMode('ground')); await frames(6);
// 毎コマ、狙った人の横へカメラを置き直す（人は歩き続けるので、置いてから撮るまでに離れないように）
await page.evaluate(() => { const loop = () => { const F = window.__follow, v = window.__sumu.view; if (F && F.k < v.pedP.mesh.count) { const m = new v.tmpM.constructor(), e = m.elements; v.pedP.mesh.getMatrixAt(F.k, m);
  const px = e[12], pz = e[14], fx = e[8], fz = e[10], L = Math.hypot(fx, fz) || 1, d = F.d, lat = F.lat;
  v.ground.x = px + (fx / L) * d * (1 - lat) + (fz / L) * d * lat; v.ground.z = pz + (fz / L) * d * (1 - lat) - (fx / L) * d * lat; v.ground.yaw = Math.atan2(px - v.ground.x, pz - v.ground.z); v.ground.pitch = -0.1; } requestAnimationFrame(loop); }; loop(); });
const look = async (name, k, d, lat) => { await page.evaluate((F) => { window.__follow = F; }, { k, d, lat }); await frames(3); await page.screenshot({ path: `shots/v74-p-${name}.png` }); return await page.evaluate(() => window.__sumu.view.pedP.mesh.count); };
// 持ち物ごとに 1 人ずつ（コート 16・スカート 8・ベビーカー 32・車いす 2048・犬 64・帽子 128）、信号待ちの人、後処理なし（Q=low）の比較
const pick = (bit) => page.evaluate((bit) => window.__sumu.view.peds.findIndex(a => a.L && (a.L.bits & bit) && !a.wait), bit);
for (const [name, bit, d, lat] of [['coat', 16, 3.6, 0.85], ['skirt', 8, 3.6, 0.85], ['stroller', 32, 4.2, 0.8], ['wheel', 2048, 3.8, 0.7], ['dog', 64, 4.2, 0.7], ['cap', 128, 3.0, 0.4]]) {
  const k = await pick(bit); console.log(name, k); if (k >= 0) await look(name, k, d, lat); }
let w = -1; for (let t = 0; t < 40 && w < 0; t++) { w = await page.evaluate(() => window.__sumu.view.peds.findIndex(a => a.wait && (a.mv ?? 1) < 0.08)); if (w < 0) await frames(3); }
console.log('wait', w); if (w >= 0) { await look('wait', w, 3.4, 0.45); await page.evaluate(() => window.__sumu.view.setQuality('low')); await frames(4); await look('wait-low', w, 3.4, 0.45); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
