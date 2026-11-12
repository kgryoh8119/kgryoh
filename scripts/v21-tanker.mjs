import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate(() => {
  const g = window.__sumu.game, S = window.__sumu; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; g.state.cash = 1e8; g.state.fame = 60;
  for (let y = 3; y < 64; y++) for (let x = 3; x < 72; x++) { g.state.stats.pop = 60000; if (g.act({ type: 'build', kind: 'oilRefinery', x, y }).ok) { y = 99; break; } }
  for (const b of g.state.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; }
  g.state.bVersion++; g.changed && g.changed(); S.ui.refresh();
});
await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const v = window.__sumu.view; return { n: v.ships.length, t: v.ships.filter(s => s.tanker).map(s => [s.x0, s.x1, s.z, s.sp, s.ph]), cnt: v.shipTanker?.count, m: v.shipTanker && Array.from(v.shipTanker.instanceMatrix.array.slice(12, 15)) }; });
console.log(JSON.stringify(info));
if (info.m) { await page.evaluate(([x, z]) => window.__sumu.view.focus(Math.floor(z / 30) * 76 + Math.floor(x / 30), 220), [info.m[0], info.m[2]]); await page.waitForTimeout(400); await page.screenshot({ path: 'shots/v21-tanker.png' }); }
console.log(errors);
await browser.close();
