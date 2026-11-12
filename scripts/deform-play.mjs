// まちづくり版の実操作：案内、道路（自動ルート）、用途、時間、おすすめの場所、予測の速さ
process.env.MAPID = 'hodogaya-d';
const { open } = await import('./shot.mjs');
const t0 = Date.now();
const { browser, page, errors } = await open(1440, 900);
const log = (...a) => console.log(...a);
log('load ms', Date.now() - t0);
await page.evaluate(() => { window.__sumu.fixedQuality = true; });
const S = () => page.evaluate(() => { const s = window.__sumu.game.state; return { m: s.month, pop: Math.round(s.stats.pop), cash: Math.round(s.cash), wait: Math.round(s.stats.waitlist), n: s.buildings.length, step: s.tutorial.step }; });
log('start', JSON.stringify(await S()), (await page.textContent('#tutorial')).slice(0, 80));
const scr = i => page.evaluate(i => { const p = window.__sumu.view.tileToScreen(i); return [p.x, p.y]; }, i);
// 道路：既存の道路の端から、空き地へ
const pair = await page.evaluate(() => { const s = window.__sumu.game.state, v = window.__sumu.view, W = s.road.length / 56 | 0; const w = Math.round(Math.sqrt(s.road.length)); const WW = window.__sumu.view.map.heights ? Math.round((window.__sumu.view.map.heights.length) ** 0.5) - 1 : w; return null; });
const ends = await page.evaluate(() => {
  const s = window.__sumu.game.state, v = window.__sumu.view, N = s.road.length, W = 52, H = N / W;
  const cx = Math.floor(v.target.x / 30), cy = Math.floor(v.target.z / 30);
  for (let r = 2; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = cx + dx, y = cy + dy, i = y * W + x; if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || s.road[i] !== 1) continue;
    // 道路の端から、道のない方向へ 4 区画
    for (const [ux, uy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { let ok = true; for (let k = 1; k <= 4; k++) { const j = (y + uy * k) * W + x + ux * k; if (x + ux * k < 0 || x + ux * k >= W || y + uy * k < 0 || y + uy * k >= H || s.road[j] || s.occ[j]) ok = false; } if (ok) return [i, (y + uy * 4) * W + x + ux * 4]; }
  }
  return null;
});
log('road ends', ends);
await page.evaluate(([a]) => { const W = 52; Object.assign(window.__sumu.view.want, { x: (a % W + 0.5) * 30, z: ((a / W | 0) + 0.5) * 30, dist: 300, pitch: 1.1 }); }, ends); await page.waitForTimeout(2500);
await page.click('.tool[data-arg="road"]'); await page.click('[data-arg="road:1"]');
let a = await scr(ends[0]), b = await scr(ends[1]);
await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move(b[0], b[1], { steps: 6 }); await page.waitForTimeout(300);
log('road hint', await page.textContent('#hint')); await page.mouse.up(); await page.waitForTimeout(500);
log('after road', JSON.stringify(await S()), (await page.textContent('#toast')).slice(-60));
// 用途：新しい道路の両側
await page.click('.tool[data-arg="zone"]'); await page.click('[data-arg="zone:1"]');
const side = await page.evaluate(([a, b]) => { const W = 52, ax = a % W, ay = a / W | 0, bx = b % W, by = b / W | 0; return ax === bx ? [(ay + 1) * W + ax + 1, by * W + bx + 1] : [(ay + 1) * W + ax + 1, (by + 1) * W + bx]; }, ends);
a = await scr(side[0]); b = await scr(side[1]);
await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move(b[0], b[1], { steps: 6 }); await page.waitForTimeout(300);
log('zone hint', await page.textContent('#hint')); await page.mouse.up(); await page.waitForTimeout(500);
log('after zone', JSON.stringify(await S()));
await page.keyboard.press('Escape');
// 6 か月
const t1 = Date.now(); await page.evaluate(() => { const g = window.__sumu.game; for (let k = 0; k < 6; k++) window.__sumu.stepMonth(g.state); g.changed(); }); log('6 months ms', Date.now() - t1, JSON.stringify(await S()));
await page.waitForTimeout(800);
for (let k = 0; k < 3 && await page.$('#modal:not([hidden]) .opt'); k++) { await page.click('#modal .opt:not([disabled])'); await page.waitForTimeout(400); }
// 保育園：おすすめの場所から
await page.click('.tool[data-arg="build"]'); await page.click('[data-arg="build:nursery"]'); await page.waitForTimeout(600);
log('cands', (await page.textContent('#cands')).replace(/\s+/g, ' ').slice(0, 200));
await page.click('#cands [data-act="candbuild"]'); await page.waitForTimeout(600);
log('after nursery', JSON.stringify(await S()), (await page.textContent('#toast')).slice(-80));
await page.keyboard.press('Escape');
await page.screenshot({ path: 'shots/deform-2.png' });
// 予測
await page.click('#tabs [data-arg="fc"]'); await page.waitForTimeout(300); const f0 = Date.now(); await page.click('#panel [data-act="fcrun"]');
await page.waitForFunction(() => window.__sumu.ui.fc && !window.__sumu.ui.fcBusy, null, { timeout: 300000 });
log('forecast wall ms', Date.now() - f0);
log('tutorial step', (await S()).step);
log('errors', JSON.stringify(errors.filter(e => !e.includes('404') && !e.includes('TUNNEL'))));
await browser.close();
