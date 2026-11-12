// v73：丸くした体と、ひざ・ひじの曲がりを近くから撮る（歩き・立ち）
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
const look = async (name, k, d, lat) => { await page.evaluate((F) => { window.__follow = F; }, { k, d, lat }); await frames(3); await page.screenshot({ path: `shots/v73-p-${name}.png` }); return await page.evaluate(() => window.__sumu.view.pedP.mesh.count); };
console.log(await look('walkA', 3, 3.6, 0.9)); if (!process.env.QUICK) { await look('walkB', 3, 3.6, 0.9); await look('walkC', 9, 3.4, 0.6); }
await page.evaluate(() => { for (const a of window.__sumu.view.peds) a.wait = 99; }); await frames(8);
for (const k of process.env.QUICK ? [2] : [2, 5, 11]) await look(`stand${k}`, k, 3.4, 0.5);
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
