import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
await page.waitForTimeout(500);
await page.click('[data-act="diff"][data-arg="easy"]');
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/v5-diff.png' });
console.log(await page.evaluate(() => window.__sumu.game.state.difficulty));
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
