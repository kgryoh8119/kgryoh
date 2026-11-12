// まちづくり版の操作性：置ける土地の表示、道具を選んだままの地図の移動、線路の複線化・撤去・敷設、新駅
process.env.MAPID = 'hodogaya-d';
const { open } = await import('./shot.mjs');
const { browser, page, errors } = await open(1440, 900);
const log = (...a) => console.log(...a);
await page.evaluate(() => { window.__sumu.fixedQuality = true; document.querySelector('[data-act="tutskip"]')?.click(); });
const W = await page.evaluate(() => Math.round(window.__sumu.game.state.road.length ** 0.5) && window.__sumu.view.map.heights ? 0 : 0);
const target = () => page.evaluate(() => [Math.round(window.__sumu.view.target.x), Math.round(window.__sumu.view.target.z)]);
log('trains', await page.evaluate(() => window.__sumu.view.trains?.length));
// 1. 施設の道具：置ける土地の表示、ドラッグで地図が動く、クリックで置ける
await page.click('.tool[data-arg="build"]'); await page.click('[data-arg="build:park"]'); await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/deform-ui-1.png' });
const t0 = await target();
await page.mouse.move(600, 500); await page.mouse.down(); await page.mouse.move(450, 420, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(800);
log('build tool drag pans:', JSON.stringify(t0), '→', JSON.stringify(await target()), 'buildings same:', await page.evaluate(() => window.__sumu.game.state.buildings.length));
// 2. 道路の道具：右ドラッグで地図が動く
await page.click('.tool[data-arg="road"]'); await page.click('[data-arg="road:1"]');
const t1 = await target();
await page.mouse.move(600, 500); await page.mouse.down({ button: 'right' }); await page.mouse.move(700, 560, { steps: 8 }); await page.mouse.up({ button: 'right' }); await page.waitForTimeout(800);
log('road tool right-drag pans:', JSON.stringify(t1), '→', JSON.stringify(await target()));
// 3. 線路：複線化（単線にしてから）・撤去・敷設
const r = await page.evaluate(() => {
  const g = window.__sumu.game, s = g.state, N = s.rail.length, W = window.__sumu.view.map.heights ? Math.round(Math.sqrt(window.__sumu.view.map.heights.length)) - 1 : 0;
  const tiles = s.rail.map((v, i) => v ? i : -1).filter(i => i >= 0);
  const out = {};
  out.unrail = g.act({ type: 'unrail', tiles: tiles.slice(0, 2) }).msg;
  out.single = g.act({ type: 'rail', tiles: tiles.slice(0, 2), level: 1 }).msg;
  out.double = g.act({ type: 'rail', tiles: tiles.slice(0, 2), level: 2 }).msg;
  // 新駅：線路に面した空き地
  let st = null;
  for (let i = 0; i < N && !st; i++) { const x = i % 52, y = (i / 52) | 0; const res = g.act({ type: 'build', kind: 'station', x, y }); if (res.ok) st = [x, y, res.msg]; }
  out.station = st;
  out.railCrowd = s.stats.railCrowd;
  return out;
});
log('rail ops', JSON.stringify(r));
await page.screenshot({ path: 'shots/deform-ui-2.png' });
log('errors', JSON.stringify(errors.filter(e => !e.includes('404') && !e.includes('TUNNEL'))));
await browser.close();
