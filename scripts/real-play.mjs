// 実在都市版の実操作確認：保育園の建設、月を進める、予測（並列ワーカー）、保存→読み込み、描画の負荷
process.env.MAPID = process.env.MAPID ?? 'hodogaya';
const { open } = await import('./shot.mjs');
const { browser, page, errors } = await open();
const log = (...a) => console.log(...a);
const click = async (sel) => { await page.click(sel); await page.waitForTimeout(300); };
const toast = () => page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).join(' | '));
const S = () => page.evaluate(() => { const s = window.__sumu.game.state; return { m: s.month, pop: Math.round(s.stats.pop), wait: Math.round(s.stats.waitlist), cash: Math.round(s.cash), vc: s.stats.maxVc.toFixed(2), sat: s.stats.sat.toFixed(3), n: s.buildings.length }; });
log('start', JSON.stringify(await S()));
// 1. 案内の手順 2：保育レイヤー
await click('[data-act="tutnext"]');
await click('#viewbar [data-act="layer"][data-arg="care"]').catch(async () => { log('layer button not found by selector'); });
await page.waitForTimeout(1500);
log('tutorial step', await page.evaluate(() => window.__sumu.game.state.tutorial.step), (await page.textContent('#tutorial')).slice(0, 40));
await page.screenshot({ path: 'shots/real-10-care.png' });
// 2. 待機が多い住宅の近くに市立保育園（画面の操作で）
const spot = await page.evaluate(() => {
  const s = window.__sumu.game.state, W = 157;
  const hot = s.buildings.filter(b => b.osm && b.unmet > 0.5).sort((a, b) => b.unmet - a.unmet)[0];
  for (let r = 1; r < 12; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const x = hot.x + dx, y = hot.y + dy; if (window.__sumu.ui.view && window.__sumu.game.check?.('nursery', x, y)) return [x, y]; }
  return [hot.x, hot.y];
});
log('hot spot', spot);
const placed = await page.evaluate(([hx, hy]) => { for (let r = 0; r < 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const res = window.__sumu.ui.act({ type: 'build', kind: 'nursery', x: hx + dx, y: hy + dy }); if (res && res.ok !== false) { const s = window.__sumu.game.state; if (s.buildings.some(b => b.kind === 'nursery' && b.x === hx + dx && b.y === hy + dy)) return [hx + dx, hy + dy]; } } return null; }, spot);
log('nursery placed at', placed, (await toast()).slice(-80));
await page.evaluate(([x, y]) => Object.assign(window.__sumu.view.want, { x: (x + 0.5) * 30, z: (y + 0.5) * 30, dist: 300, pitch: 0.8 }), placed);
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/real-11-nursery.png' });
log('tutorial step', await page.evaluate(() => window.__sumu.game.state.tutorial.step));
// 3. 月を進める（6 か月）と所要時間
const t0 = Date.now();
await page.evaluate(() => { const g = window.__sumu.game; for (let k = 0; k < 6; k++) window.__sumu.stepMonth(g.state); g.changed(); });
log('6 months ms', Date.now() - t0, JSON.stringify(await S()));
await page.waitForTimeout(800);
for (let k = 0; k < 4 && await page.$('#modal:not([hidden]) .opt'); k++) {
  log('event:', (await page.textContent('#modal')).replace(/\s+/g, ' ').slice(0, 400));
  await page.screenshot({ path: `shots/real-14-event${k}.png` });
  await page.click('#modal .opt:not([disabled])'); await page.waitForTimeout(600);
}
const dlg = await page.$('#modal:not([hidden])'); if (dlg) { log('modal still:', (await dlg.textContent()).slice(0, 200)); await page.keyboard.press('Escape'); }
// 4. 予測
await click('#tabs [data-arg="fc"]');
const f0 = Date.now();
await click('[data-act="fcrun"]');
await page.waitForTimeout(1500); const prog = await page.textContent('#fcprog').catch(() => '');
await page.waitForFunction(() => window.__sumu.ui.fc && !window.__sumu.ui.fcBusy, null, { timeout: 300000 });
log('forecast', JSON.stringify(await page.evaluate(() => ({ ms: Math.round(window.__sumu.ui.fc.ms), mode: window.__sumu.ui.fc.mode }))), 'wall', Date.now() - f0, 'progress:', prog);
await page.screenshot({ path: 'shots/real-12-forecast.png' });
// 5. 保存→読み込み
const txt = await page.evaluate(() => window.__sumu.game.exportText());
log('save chars', txt.length);
const before = JSON.stringify(await S());
await click('[data-act="menu"]');
await page.evaluate(t => { document.getElementById('iotext').value = t; }, txt);
await click('[data-act="import"]'); await page.waitForTimeout(1500);
log('load →', (await toast()).slice(-60), '| same:', before === JSON.stringify(await S()));
await page.keyboard.press('Escape');
// 6. 地上視点
await click('[data-act="cam"][data-arg="ground"]').catch(() => log('no ground btn'));
await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/real-13-ground.png' });
log('stats', JSON.stringify(await page.evaluate(() => window.__sumu.view.stats)));
log('errors', JSON.stringify(errors.filter(e => !e.includes('TUNNEL'))));
await browser.close();
