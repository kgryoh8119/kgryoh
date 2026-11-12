// v48：街めぐりのやめ方・電車を降りるボタン・ResizeObserver の警告・谷/川の橋（実際にボタンを押して確かめる）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(900, 640, 'sumino');
page.setDefaultTimeout(400000); await page.waitForTimeout(1500);
const log = [];
const press = async sel => { const b = await page.locator(sel).boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.view.clockRun = false; S.fixedQuality = true; S.view.setQuality('low'); });
const st = () => page.evaluate(() => ({ photo: document.getElementById('app').classList.contains('photo'), busy: window.__sumu.ui.tlBusy, stop: !document.getElementById('tourstop')?.hidden, ride: window.__sumu.view.ride, rideBtn: document.getElementById('rideexit') ? !document.getElementById('rideexit').hidden : null, err: !!document.getElementById('bootErr') }));
// ビューバーを開く
if (!(await page.evaluate(() => document.getElementById('viewbar').classList.contains('open')))) await page.locator('[data-act="viewtoggle"]:visible').first().click();
await page.waitForTimeout(800);
console.log('tour btn visible', await page.locator('#viewbar [data-act="tour"]').isVisible());
await page.screenshot({ path: 'shots/v48-ui-viewbar.png' });
// 1) 街めぐり → ボタンでやめる
await press('#viewbar [data-act="tour"]'); log.push(['tour started', await st()]); console.log(JSON.stringify(log.at(-1)));
await press('#tourstop'); await page.waitForTimeout(2500); log.push(['after stop button', await st()]);
// 2) 街めぐり → Esc でやめる
await press('#viewbar [data-act="tour"]'); log.push(['tour 2 started', await st()]);
await page.keyboard.press('Escape'); await page.waitForTimeout(2500); log.push(['after Esc', await st()]);
// 3) 街めぐり → 画面を押してやめる
await press('#viewbar [data-act="tour"]'); await page.waitForTimeout(600); log.push(['tour 3 started', await st()]);
await page.mouse.click(600, 600); await page.waitForTimeout(2500); log.push(['after tap', await st()]);
// 4) 電車に乗る → 降りるボタン
await press('#viewbar [data-act="ride"][data-arg="train"]'); await page.waitForTimeout(2500); log.push(['ride', await st()]);
await page.screenshot({ path: 'shots/v48-ui-ride.png' });
await press('#rideexit'); await page.waitForTimeout(1500); log.push(['after exit', await st()]);
// 5) ResizeObserver の警告
await page.evaluate(() => { window.dispatchEvent(new ErrorEvent('error', { message: 'ResizeObserver loop completed with undelivered notifications.' })); }); await page.waitForTimeout(300); log.push(['after RO warning', await st()]);
for (const l of log) console.log(JSON.stringify(l));
console.log(errors.filter(e => !e.includes('TUNNEL') && !e.includes('ResizeObserver')));
await browser.close();
