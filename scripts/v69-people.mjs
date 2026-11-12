// v69：Mixamo の動きを入れた人を地上から撮る（歩き・立ち話・電話・ホームの人）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 8.2; });
const st = await page.evaluate(() => { const S = window.__sumu, b = S.game.state.buildings.find(b => b.kind === 'station'); return b.y * S.W + b.x; });
await page.evaluate((t) => window.__sumu.view.focus(t, 200), st); await page.waitForTimeout(2500);
await page.evaluate(() => window.__sumu.view.setMode('ground')); await page.waitForTimeout(3000);
const look = async (name, k, d, lat) => {
  const r = await page.evaluate(([k, d, lat]) => { const v = window.__sumu.view, m = new v.tmpM.constructor(), e = m.elements; if (k >= v.pedP.mesh.count) return null; v.pedP.mesh.getMatrixAt(k, m);
    const px = e[12], pz = e[14], fx = e[8], fz = e[10], L = Math.hypot(fx, fz) || 1;
    v.ground.x = px + (fx / L) * d * (1 - lat) + (fz / L) * d * lat; v.ground.z = pz + (fz / L) * d * (1 - lat) - (fx / L) * d * lat; v.ground.yaw = Math.atan2(px - v.ground.x, pz - v.ground.z); v.ground.pitch = -0.12; return [v.pedP.mesh.count]; }, [k, d, lat]);
  await page.waitForTimeout(150); await page.screenshot({ path: `shots/v69-${name}.png` }); return r;
};
// 歩く人：動いたまま、横からの連写
for (const k of [3, 9]) for (let f = 0; f < 3; f++) { const r = await look(`walk${k}-${f}`, k, 3.6, 0.95); if (!r) break; }
// 止まった人（待ち）：その場の身ぶり。歩いている人を止める
await page.evaluate(() => { for (const a of window.__sumu.view.peds) a.wait = 99; });
await page.waitForTimeout(3000);
for (const k of [2, 5, 11, 14]) await look(`stand${k}`, k, 3.2, 0.5);
// ホームの人
await page.evaluate(() => { const v = window.__sumu.view; v.setMode('orbit'); }); await page.waitForTimeout(500);
await page.evaluate((t) => { const v = window.__sumu.view; v.focus(t, 28); v.pitch = v.want.pitch = 0.2; }, st); await page.waitForTimeout(4000);
await page.screenshot({ path: 'shots/v69-platform.png' });
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
