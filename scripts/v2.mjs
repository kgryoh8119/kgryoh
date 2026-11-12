// 改修 v2 の実操作確認：重複課金、不正操作、不正セーブ、予測（別スレッド・中止・古い結果）、計画案の効果時期
import { open } from './shot.mjs';
const { browser, page, errors } = await open();
const log = (...a) => console.log(...a);
const click = async (sel) => { await page.click(sel); await page.waitForTimeout(250); };
const st = () => page.evaluate(() => JSON.stringify(window.__sumu.game.state));
const cash = () => page.evaluate(() => window.__sumu.game.state.cash);
const toast = () => page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).join(' | '));
const tileXY = (x, y) => page.evaluate(([x, y]) => { const v = window.__sumu.view; const p = v.project((x + 0.5) * 30, 0.3, (y + 0.5) * 30); const r = v.renderer.domElement.getBoundingClientRect(); return [p.x + r.left, p.y + r.top]; }, [x, y]);
await click('[data-act="tutskip"]');
await page.evaluate(() => Object.assign(window.__sumu.view.want, { x: 9 * 30, z: 9 * 30, dist: 420, yaw: 0, pitch: 1.2 })); await page.waitForTimeout(2500);
// 1. 同じ区画を行き来するドラッグ
await click('.tool[data-arg="road"]'); await click('[data-arg="road:1"]');
const a = await tileXY(12, 9), b = await tileXY(11, 9);
const c0 = await cash();
await page.mouse.move(a[0], a[1]); await page.mouse.down(); await page.mouse.move(b[0], b[1], { steps: 5 }); await page.mouse.move(a[0], a[1], { steps: 5 }); await page.mouse.move(b[0], b[1], { steps: 5 });
const hint = await page.textContent('#hint'); await page.mouse.up(); await page.waitForTimeout(300);
log('1 preview:', hint, '| charged:', c0 - await cash(), '|', await toast());
await page.keyboard.press('Escape');
// 2. 不正な操作（画面を通さず直接）
for (const act of [{ type: 'borrow', amount: NaN }, { type: 'road', tiles: [400], road: 9 }, { type: 'build', kind: 'castle', x: 3, y: 3 }, { type: 'staff', id: 1, n: Infinity }]) {
  const before = await st();
  const r = await page.evaluate(a => window.__sumu.ui.act(a), act);
  log('2', JSON.stringify(act).replace('null', 'NaN'), '→', r, '| unchanged:', before === await st(), '|', (await toast()).slice(-60));
}
// 3. 不正な保存データ → 元の街が残る、正常なデータは読める
const good = await page.evaluate(() => window.__sumu.game.exportText());
const before3 = await st();
await click('[data-act="menu"]');
await page.evaluate(t => { const d = JSON.parse(t); d.state.road[15 * 44 + 5] = 9; document.getElementById('iotext').value = JSON.stringify(d); }, good);
await click('[data-act="import"]'); log('3 bad save →', await toast(), '| unchanged:', before3 === await st());
await page.evaluate(t => { document.getElementById('iotext').value = t; }, good);
await click('[data-act="import"]'); log('3 good save →', (await toast()).slice(-40));
// 4. 予測：別スレッド、所要時間、操作中の表示
await click('.tool.panelbtn').catch(() => {}); await click('#tabs [data-arg="fc"]');
const fps0 = await page.evaluate(() => window.__sumu.view.stats.fps);
await click('[data-act="fcrun"]');
await page.waitForTimeout(400); const prog = await page.textContent('#fcprog').catch(() => '');
await page.waitForFunction(() => window.__sumu.ui.fc && !window.__sumu.ui.fcBusy, null, { timeout: 120000 });
const fc = await page.evaluate(() => ({ ms: Math.round(window.__sumu.ui.fc.ms), mode: window.__sumu.ui.fc.mode, fps: window.__sumu.view.stats.fps }));
log('4 forecast:', JSON.stringify(fc), 'progress shown:', prog, 'fps before', fps0);
// 4b. 計算中に街を変えると中止される
await click('[data-act="fcrun"]'); await page.waitForTimeout(300);
await page.evaluate(() => window.__sumu.ui.act({ type: 'policy', id: 'careStaff', on: true }));
await page.waitForTimeout(600);
log('4b during-change →', (await toast()).slice(-80), '| busy:', await page.evaluate(() => window.__sumu.ui.fcBusy), '| stale shown:', await page.evaluate(() => document.getElementById('panel').textContent.includes('時点の試算です')));
await page.screenshot({ path: 'shots/60-v2-stale.png' });
// 5. 計画案：保育園を建てて比較、効果の時期
await click('[data-act="fcrun"]'); await page.waitForFunction(() => window.__sumu.ui.fc && !window.__sumu.ui.fcBusy && window.__sumu.ui.fc.rev === window.__sumu.game.rev, null, { timeout: 120000 });
await click('[data-act="draft"]');
const ok5 = await page.evaluate(() => { for (let y = 4; y < 15; y++) for (let x = 14; x < 28; x++) { const r = window.__sumu.game.act({ type: 'build', kind: 'nursery', x, y }); if (r.ok) return [x, y]; } return null; });
log('5 draft nursery at', ok5);
await click('#draftbar [data-act="fcrun"]'); await page.waitForFunction(() => window.__sumu.ui.fcDraft && !window.__sumu.ui.fcBusy, null, { timeout: 120000 });
await click('#tabs [data-arg="fc"]'); await click('[data-act="fcmetric"][data-arg="wait"]');
log('5 timing:', (await page.evaluate(() => [...document.querySelectorAll('#panel li')].map(l => l.textContent).join(' / '))).slice(0, 600));
await page.screenshot({ path: 'shots/61-v2-draft.png' });
await click('[data-act="draftdiscard"]');
log('errors', JSON.stringify(errors.filter(e => !e.includes('TUNNEL'))));
await browser.close();
