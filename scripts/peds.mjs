// 歩く人の近くから地上視点で撮る。SHOTS=[[名前, 時刻, 何人目, 月(任意), 雨(任意)]]
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate((t) => { const g = window.__sumu.game; g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); }, readFileSync(process.env.SAVE, 'utf8'));
const [x, y] = JSON.parse(process.env.AT ?? '[21,9]');
await page.evaluate(([x, y]) => window.__sumu.view.focus(y * 76 + x, 300), [x, y]);
await page.waitForTimeout(800);
await page.click('[data-act="cam"][data-arg="ground"]');
await page.waitForTimeout(1000);
for (const [name, hour, k, month, rain, dist] of JSON.parse(process.env.SHOTS)) {
  await page.evaluate(([hour, month, rain]) => { const v = window.__sumu.view, s = window.__sumu.game.state; v.hour = hour; v.clockRun = false; if (month !== undefined && month !== null) s.month = month; if (rain) s.events.active.push({ id: 'linearRain', start: s.month, target: -1 }); else s.events.active = s.events.active.filter(e => e.id !== 'linearRain'); v.lifeKey = ''; v.crowdKey = ''; v.spawnAgents(); }, [hour, month, rain]);
  await page.waitForTimeout(1500);
  await page.evaluate(([k, dist]) => { const v = window.__sumu.view, m = new v.tmpM.constructor(), e = m.elements; v.pedP.mesh.getMatrixAt(Math.min(k, v.pedP.mesh.count - 1), m);
    const px = e[12], pz = e[14], fx = e[8], fz = e[10], L = Math.hypot(fx, fz) || 1, d = dist ?? 5;
    // 横から斜め前に立って、その人を見る
    v.ground.x = px + (fx / L) * d * 0.7 + (fz / L) * d * 0.7; v.ground.z = pz + (fz / L) * d * 0.7 - (fx / L) * d * 0.7; v.ground.yaw = Math.atan2(px - v.ground.x, pz - v.ground.z); v.ground.pitch = -0.08; v.clockRun = false; return [px, e[13], pz, v.ground.x, v.ground.z, v.ground.yaw, v.pedP.mesh.count]; }, [k, dist]).then(r => console.log(name, JSON.stringify(r)));
  await page.waitForTimeout(1200);
  await page.evaluate(() => { for (const a of window.__sumu.view.peds) a.speed = 0; });
  await page.waitForTimeout(600);
  await page.evaluate(([k, dist]) => { const v = window.__sumu.view, m = new v.tmpM.constructor(), e = m.elements; v.pedP.mesh.getMatrixAt(Math.min(k, v.pedP.mesh.count - 1), m);
    const px = e[12], pz = e[14], fx = e[8], fz = e[10], L = Math.hypot(fx, fz) || 1, d = dist ?? 5;
    // 横から斜め前に立って、その人を見る
    v.ground.x = px + (fx / L) * d * 0.7 + (fz / L) * d * 0.7; v.ground.z = pz + (fz / L) * d * 0.7 - (fx / L) * d * 0.7; v.ground.yaw = Math.atan2(px - v.ground.x, pz - v.ground.z); v.ground.pitch = -0.08; v.clockRun = false; return [px, e[13], pz, v.ground.x, v.ground.z, v.ground.yaw, v.pedP.mesh.count]; }, [k, dist]).then(r => console.log(name, JSON.stringify(r)));
  await page.waitForTimeout(250);
  await page.screenshot({ path: `shots/${name}.png` });
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
