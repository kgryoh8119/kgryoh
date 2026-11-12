// v65：特急・観光バス・路線バス・トラック・新幹線を近くで撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 11; S.view.expEvery = 1; });
await page.waitForTimeout(4000);
// 特急
for (let i = 0; i < 2; i++) { await page.evaluate((i) => { const S = window.__sumu, v = S.view, t = v.trains[i]; const P = v.railPaths[t.path]; let j = 0; while (j < P.d.length - 1 && P.d[j] < t.d) j++;
  const x = P.p[j * 3], z = P.p[j * 3 + 2]; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), 38); v.pitch = 0.26; v.yaw = 0.8 + i * 2; }, i); await page.waitForTimeout(1200); await page.screenshot({ path: `shots/v65-exp${i}.png` }); }
// 車：観光バス・バス・トラックに差し替え（同じ道に 3 台）
const at = await page.evaluate(() => { const S = window.__sumu, v = S.view; const L = (v.rCars && v.rCars.length ? v.rCars : v.cars); const mv = L.filter(a => !a.ped && a.speed > 2);
  const a0 = mv[5]; if (!a0) return -1; const near = mv.filter(a => Math.abs((a.cur % S.W) - (a0.cur % S.W)) + Math.abs(((a.cur / S.W) | 0) - ((a0.cur / S.W) | 0)) <= 2).slice(0, 6);
  mv.forEach((a, i) => { a.kind = [4, 1, 2][i % 3]; }); window.__mv = mv; v.speedMul = 0; return a0.cur; });
console.log('car tile', at);
for (let i = 0; i < 2 && at >= 0; i++) { await page.evaluate(([t, i]) => { const S = window.__sumu, v = S.view; t = window.__mv[i * 4].cur; v.focus(t, 32); v.pitch = 0.3; v.yaw = 0.6 + i * 1.6; }, [at, i]); await page.waitForTimeout(1500); await page.screenshot({ path: `shots/v65-car${i}.png` }); }
// 新幹線
const sh = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, st = s.buildings.find(b => b.kind === 'station'); if (!st) return { err: 'no station' }; st.shin = 0; s.roadVersion++; s.bVersion++; return { at: 0 }; });
console.log('shin', JSON.stringify(sh));
if (!sh.err) { await page.waitForTimeout(5000);
  await page.evaluate(() => { const v = window.__sumu.view; Object.assign(v.shin, { run: true, stop: true, u: 140, v: 0, wait: 1e6, dir: 1, stop: false }); }); await page.waitForTimeout(1500);
  const p = await page.evaluate(() => { const v = window.__sumu.view; if (!v.shinNose) return null; const m = new (v.shinNose.matrix.constructor)(); v.shinNose.getMatrixAt(0, m); return [m.elements[12], m.elements[14]]; });
  console.log('nose', p);
  if (p) for (let i = 0; i < 2; i++) { await page.evaluate(([x, z, i]) => { const S = window.__sumu, v = S.view; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), 80); v.pitch = 0.32; v.yaw = 0.7 + i * 2.2; }, [p[0], p[1], i]); await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v65-shin${i}.png` }); } }
const hs = await page.evaluate(() => { const S = window.__sumu, s = S.game.state; return s.buildings.filter(b => b.kind === 'house').slice(0, 40).map(b => (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1)); });
for (const i of [3, 10, 17, 24, 31]) { if (hs[i] === undefined) break; await page.evaluate(([t]) => { const v = window.__sumu.view; v.focus(t, 110); v.pitch = 0.5; v.yaw = 0.3; }, [hs[i]]); await page.waitForTimeout(3500); await page.screenshot({ path: `shots/v65-house${i}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
