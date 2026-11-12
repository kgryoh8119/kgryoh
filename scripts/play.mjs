// 実操作の検証：ポインタ操作で道路・用途・施設、時間進行、イベント、予測、保存読込、撤去まで通す
import { open } from './shot.mjs';
const { browser, page, errors } = await open();
const log = (...a) => console.log(...a);
const st = () => page.evaluate(() => { const s = window.__sumu.game.state; return { month: s.month, cash: Math.round(s.cash), pop: Math.round(s.stats.pop), wait: Math.round(s.stats.waitlist), b: s.buildings.length, roads: s.road.filter(r => r).length, ev: s.events.active.map(e => e.id), tut: s.tutorial.step, rng: s.rng }; });
const tileXY = (x, y) => page.evaluate(([x, y]) => { const v = window.__sumu.view; const p = v.project((x + 0.5) * 30, 0.3, (y + 0.5) * 30); const r = v.renderer.domElement.getBoundingClientRect(); return [p.x + r.left, p.y + r.top]; }, [x, y]);
const cam = async (o) => { await page.evaluate(o => { const v = window.__sumu.view; Object.assign(v.want, o); v.clockRun = false; v.hour = 13; }, o); await page.waitForTimeout(2500); };
const drag = async (a, b) => { const p = await tileXY(...a), q = await tileXY(...b); await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.move((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, { steps: 4 }); await page.mouse.move(q[0], q[1], { steps: 4 }); await page.waitForTimeout(300); const hint = await page.textContent('#hint'); await page.mouse.up(); await page.waitForTimeout(300); return hint; };
const click = async (sel) => { await page.click(sel); await page.waitForTimeout(250); };
const toast = () => page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).join(' | '));

log('start', JSON.stringify(await st()));
await click('[data-act="tutnext"]');
await cam({ x: 9 * 30, z: 9 * 30, dist: 420, yaw: 0, pitch: 1.2 });
// 1. 道路
await click('[data-arg="road"]'); await click('[data-arg="road:1"]');
log('road hint:', await drag([12, 9], [5, 9]), '→', await toast());
log(' after road', JSON.stringify(await st()));
// 2. 用途
await click('[data-arg="zone"]'); await click('[data-arg="zone:1"]');
log('zone hint:', await drag([5, 8], [11, 8]), '→', await toast());
log('zone hint:', await drag([5, 10], [10, 10]), '→', await toast());
await click('[data-arg="zone"]'); await click('[data-arg="zone:4"]');
log('zone4 hint:', await drag([11, 10], [12, 10]), '→', await toast());
await page.screenshot({ path: 'shots/10-zoned.png' });
// 設置プレビュー：道路と重なる場所／道路に接しない場所
await click('[data-arg="build"]'); await click('[data-arg="build:nursery"]');
let p = await tileXY(8, 9); await page.mouse.move(p[0], p[1]); await page.waitForTimeout(300); log('preview on road:', await page.textContent('#hint'));
p = await tileXY(8, 4); await page.mouse.move(p[0], p[1]); await page.waitForTimeout(300); log('preview no road:', await page.textContent('#hint'));
p = await tileXY(12, 8); await page.mouse.move(p[0], p[1]); await page.waitForTimeout(400); log('preview ok:', await page.textContent('#hint'));
await page.screenshot({ path: 'shots/11-preview.png' });
await page.keyboard.press('Escape');
log(' tutorial step', (await st()).tut);
// 3. 時間を進める
await click('[data-act="speed"][data-arg="3"]');
const handleEvents = async () => { for (let k = 0; k < 4; k++) { const s = await st(); if (!s.ev.length) break; const title = await page.textContent('#modal h2'); const opts = await page.$$eval('#modal .opt', els => els.map(e => e.querySelector('b').textContent + (e.disabled ? '(不可)' : ''))); await page.click('#modal .opt:not([disabled])'); await page.waitForTimeout(300); log(`  event @${s.month}: ${title} [${opts.join(' / ')}] → ${await toast()}`); } };
for (let i = 0; i < 16; i++) { await page.waitForTimeout(1000); await handleEvents(); }
log(' after ~16s', JSON.stringify(await st()));
const west = await page.evaluate(() => { const s = window.__sumu.game.state; return s.buildings.filter(b => b.x < 13 && b.y < 15).map(b => `${b.kind}:${b.status}:${b.hh ? b.hh.reduce((a, c) => a + c, 0).toFixed(1) : ''}`); });
log(' west buildings', west.join(' '));
await page.evaluate(() => window.__sumu.ui.setSpeed(0)); await handleEvents();
await page.screenshot({ path: 'shots/12-grown.png' });
// 4. 保育レイヤー → 保育園を建設（市債も）
await click('[data-act="layer"][data-arg="care"]');
await click('[data-arg="money"]'); await click('[data-act="borrow"]'); log('borrow →', await toast());
await click('[data-arg="build"]'); await click('[data-arg="build:nursery"]');
p = await tileXY(12, 8); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(400); log('build nursery →', await toast());
await page.keyboard.press('Escape');
await click('[data-arg="policy"]'); await page.check('#pol-careStaff'); await page.waitForTimeout(300); log('policy →', await toast());
// 施設を選んで情報カード
p = await tileXY(12, 8); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(400);
log('info:', (await page.textContent('#info')).slice(0, 90));
await page.screenshot({ path: 'shots/13-nursery-site.png' });
// 5. 予測
await click('[data-arg="fc"]'); await click('[data-act="fcrun"]');
const t0 = Date.now(); await page.waitForFunction(() => window.__sumu.ui.fcBase && !window.__sumu.ui.fcBusy, null, { timeout: 120000 });
log('forecast done in ms', Date.now() - t0, JSON.stringify(await st()));
await page.screenshot({ path: 'shots/14-forecast.png' });
// 計画案（試算モード）
const before = await st();
await click('[data-act="draft"]');
await click('[data-arg="build"]'); await click('[data-arg="build:park"]');
p = await tileXY(11, 8); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(300); log('draft build →', await toast());
await page.keyboard.press('Escape');
log(' real state unchanged in draft:', JSON.stringify(await st()) === JSON.stringify(before));
await click('#draftbar [data-act="fcrun"]'); await page.waitForFunction(() => window.__sumu.ui.fcDraft && !window.__sumu.ui.fcBusy, null, { timeout: 120000 });
await click('[data-arg="fc"]'); await click('[data-act="fcmetric"][data-arg="cash"]');
await page.screenshot({ path: 'shots/15-draft.png' });
await click('[data-act="draftdiscard"]'); log(' after discard same:', JSON.stringify(await st()) === JSON.stringify(before));
// 6. 保存 → 進める → 読込
await click('[data-act="menu"]'); await click('[data-act="save"]'); const saved = await st(); await click('#modal [data-act="menu"]');
await click('[data-act="speed"][data-arg="3"]'); for (let i = 0; i < 5; i++) { await page.waitForTimeout(1000); await handleEvents(); } await page.evaluate(() => window.__sumu.ui.setSpeed(0)); await handleEvents();
log(' advanced', JSON.stringify(await st()));
await click('[data-act="menu"]'); await click('[data-act="load"]'); await page.waitForTimeout(500);
const loaded = await st(); log(' loaded equals saved:', JSON.stringify(loaded) === JSON.stringify(saved), '→', await toast());
const site = await page.evaluate(() => { const b = window.__sumu.game.state.buildings.find(b => b.kind === 'nursery' && b.status === 'construction'); return b ? b.remain : null; }); log(' construction remain after load:', site);
// 壊れたデータ
await click('[data-act="menu"]'); await page.fill('#iotext', '{"format":"sumucity-save","version":7}'); await click('[data-act="import"]'); log(' bad import →', await toast());
await click('#modal [data-act="menu"]');
// 7. 道路撤去 → 接続レイヤー
await click('[data-act="layer"][data-arg="conn"]');
await click('[data-arg="road"]'); await click('[data-arg="unroad"]');
log('unroad hint:', await drag([12, 9], [12, 9]), '→', await toast());
const dis = await page.evaluate(() => window.__sumu.game.state.buildings.filter(b => !b.connected).map(b => b.kind + ':' + b.status)); log(' disconnected', dis.join(' '));
await page.keyboard.press('Escape');
await click('[data-arg="voice"]');
await page.screenshot({ path: 'shots/16-cut.png' });
await click('[data-arg="road"]'); await click('[data-arg="road:1"]'); log('reroad:', await drag([12, 9], [12, 9]), '→', await toast());
log(' disconnected after', await page.evaluate(() => window.__sumu.game.state.buildings.filter(b => !b.connected).length));
await page.keyboard.press('Escape');
// 8. 施設撤去（2 度押し）
p = await tileXY(12, 8); await page.mouse.click(p[0], p[1]); await page.waitForTimeout(300);
const c0 = (await st()).cash; await click('#info [data-act="demolish"]'); await click('#info [data-act="demolish"]'); log('cancel site →', await toast(), 'cash', c0, '→', (await st()).cash);
log('errors', JSON.stringify(errors.filter(e => !e.includes('TUNNEL'))));
await browser.close();
