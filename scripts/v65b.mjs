import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 11; });
await page.waitForTimeout(3000);
const t = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, hs = s.buildings.filter(b => b.kind === 'house'); const b = hs[3]; return (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1); });
for (const [i, yaw] of [[0, 0.2], [1, -0.6]]) { await page.evaluate(([t, yaw]) => { const v = window.__sumu.view; v.focus(t, 48); v.pitch = 0.42; v.yaw = yaw; }, [t, yaw]); await page.waitForTimeout(3500); await page.screenshot({ path: `shots/v65-3f${i}.png` }); }
// 車：全部を観光バス・バス・トラックにして、観光バスの 1 台を追う
const info = await page.evaluate(() => { const v = window.__sumu.view; const mv = v.cars.filter(a => a.kind !== undefined || true); let n = 0; v.cars.forEach((a, i) => { a.kind = [4, 1, 2, 0][n++ % 4]; }); return { n: v.cars.length, sample: Object.keys(v.cars[0] || {}).join(',') }; });
console.log(JSON.stringify(info));
await page.waitForTimeout(6000); console.log(await page.evaluate(() => { const v = window.__sumu.view; const nz = (im) => { const a = im.instanceMatrix.array; let n = 0; for (let k = 0; k < im.count; k++) if (Math.abs(a[k * 16]) + Math.abs(a[k * 16 + 2]) > 0.5) n++; return n; }; return [v.cars.length, nz(v.carBody), nz(v.coachBody), nz(v.busBody), nz(v.truckBody), v.cars.slice(0, 4).map(a => a.cur + ':' + a.t.toFixed(2))]; }));
for (let i = 0; i < 3; i++) {
  const p = await page.evaluate((i) => { const v = window.__sumu.view, im = v.coachBody, m = new (im.matrix.constructor)(); const L = [], tx = v.target.x, tz = v.target.z; for (let k = 0; k < im.count; k++) { im.getMatrixAt(k, m); if (Math.abs(m.elements[0]) + Math.abs(m.elements[2]) > 0.5) L.push([m.elements[12], m.elements[14]]); } L.sort((a, b) => Math.hypot(a[0] - tx, a[1] - tz) - Math.hypot(b[0] - tx, b[1] - tz)); return [L.length, L[i] ?? null]; }, i);
  console.log(p); if (!p[1]) break; const [x, z] = p[1];
  await page.evaluate(([x, z, i]) => { const S = window.__sumu, v = S.view; S.game.speed = 0; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), 26); v.pitch = 0.3; v.yaw = 0.5 + i; }, [x, z, i]); await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v65-veh${i}.png` });
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
