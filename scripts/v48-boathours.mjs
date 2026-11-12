// v48：船の運航時間（大河の地形）。種類ごとの動いている船の数を時刻ごとに数える
import { open } from './shot.mjs';
const { browser, page, errors } = await open(800, 560, 'sumino');
page.setDefaultTimeout(400000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, W = S.W; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('low'); s.cash += 1e8; s.fame = 100;
  const wt = []; for (let i = 0; i < s.road.length; i++) if (S.view.map.water[i]) wt.push(i); const H = s.road.length / W, cy = Math.floor(H / 2);
  for (const k of ['waterBus', 'cruisePier', 'yakatabune']) { let done = false; for (let r = 0; r < 30 && !done; r++) for (const dir of [1, -1]) { if (done) break; const y = cy + dir * r * 2, w0 = wt.find(i => Math.floor(i / W) === y); if (w0 == null) continue; for (let dx = -6; dx <= 6 && !done; dx++) { const res = g.act({ type: 'build', kind: k, x: w0 % W + dx, y }); if (res.ok) { const b = s.buildings.at(-1); b.status = 'operating'; b.remain = 0; done = true; } } } }
  s.roadVersion++; s.bVersion++; S.stepMonth(s); s.events.active = []; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.view.clockRun = false; });
const out = [];
for (const h of [3, 8, 12, 15, 18, 21.5, 22.5]) { await page.evaluate(h => { window.__sumu.view.hour = h; }, h); await page.waitForTimeout(2500); out.push(await page.evaluate(() => { const v = window.__sumu.view; return { hour: v.hour, calM: v.calM, boats: v.fx.boats.map(b => b.count).join('/') }; })); }
for (const o of out) console.log(JSON.stringify(o));
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
