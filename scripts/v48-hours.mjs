// v48：時間帯で電車・SL・船が走る／止まるか（行列の大きさで数える）と、1〜5 時に電車に乗れないこと
import { open } from './shot.mjs';
const { browser, page, errors } = await open(800, 560, 'sumino');
page.setDefaultTimeout(400000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('low'); s.cash += 1e8;
  const st = s.buildings.find(b => b.kind === 'station');
  for (let r = 2, done = false; r < 45 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const res = g.act({ type: 'build', kind: 'slDepot', x: st.x + dx, y: st.y + dy }); if (res.ok) { const b = s.buildings.at(-1); b.status = 'operating'; b.remain = 0; done = true; } }
  s.roadVersion++; s.bVersion++; S.stepMonth(s); s.events.active = []; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.view.clockRun = false; });
const count = () => page.evaluate(() => { const v = window.__sumu.view, im = v.trainCars, m = new (im.instanceMatrix.array.constructor)(16); let on = 0; for (let k = 0; k < v.trains.length; k++) { const a = im.instanceMatrix.array, i = k * 4 * 16; if (Math.hypot(a[i], a[i + 1], a[i + 2]) > 0.01) on++; } void m; return { hour: v.hour, calM: v.calM, trains: v.trains.length, running: on, sl: v.slTrain }; });
const out = [];
for (const h of [12]) { await page.evaluate(h => { window.__sumu.view.hour = h; }, h); await page.waitForTimeout(2500); out.push(await count()); }
// 冬（1 月）の昼：SL は運休
await page.evaluate(() => { const v = window.__sumu.view, s = window.__sumu.game.state; s.month += 8; s.events.active = []; v.hour = 12; }); await page.waitForTimeout(2500); out.push({ winter: true, ...(await count()) });
// 3 時に電車に乗るボタン
await page.evaluate(() => { const v = window.__sumu.view; v.hour = 3; window.__sumu.ui.act ? 0 : 0; });
if (!(await page.evaluate(() => document.getElementById('viewbar').classList.contains('open')))) { const b = await page.locator('[data-act="viewtoggle"]:visible').first().boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(800); }
{ const b = await page.locator('#viewbar [data-act="ride"][data-arg="train"]').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(1500); }
out.push({ ride3am: await page.evaluate(() => window.__sumu.view.ride), toast: await page.evaluate(() => document.querySelector('#toast, .toast')?.textContent ?? '') });
for (const o of out) console.log(JSON.stringify(o));
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
