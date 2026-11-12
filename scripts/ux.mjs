import { open } from './shot.mjs';
const { browser, page, errors } = await open();
await page.waitForTimeout(2500); await page.screenshot({ path: 'shots/30-ux-start.png' });
await page.click('[data-act="tutskip"]'); await page.click('[data-act="issue"][data-arg="buildNursery"]'); await page.waitForTimeout(3000);
await page.mouse.move(640, 480); await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/31-ux-nursery.png' });
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
