// タイトルへ戻る：街の名前 → 保存してタイトルへ → 地図の「続きから」で同じ月から再開
process.env.MAPID = 'hodogaya';
const { open } = await import('./shot.mjs');
const { browser, page, errors } = await open(1280, 800);
await page.evaluate(() => { document.querySelector('[data-act="tutskip"]')?.click(); const g = window.__sumu.game; for (let k = 0; k < 2; k++) window.__sumu.stepMonth(g.state); g.changed(); });
const m0 = await page.evaluate(() => window.__sumu.game.state.month);
await page.click('#top .plate'); await page.waitForTimeout(300);
await page.click('[data-act="titlesave"]');
await page.waitForSelector('#title .mcard', { timeout: 60000 });
const cont = await page.locator('#title button[data-t="cont"][data-id="hodogaya"]').count();
await page.click('#title button[data-t="cont"][data-id="hodogaya"]');
await page.waitForFunction(() => window.__sumu && window.__sumu.view.stats.buildings > 0, null, { timeout: 240000 });
console.log('month before', m0, 'continue button', cont, 'month after', await page.evaluate(() => window.__sumu.game.state.month), await page.evaluate(() => window.__sumu.game.state.cityName));
console.log('errors', errors.filter(e => !e.includes('404') && !e.includes('TUNNEL')));
await browser.close();
