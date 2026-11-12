import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate(() => { const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; window.__sumu.ui.refresh(); });
const W = 76;
for (const [name, x, y, d] of [['all', 38, 32, 2300], ['east', 56, 8, 520], ['south', 40, 50, 700], ['old', 21, 12, 620]]) {
  await page.evaluate(([x, y, d, W]) => window.__sumu.view.focus(y * W + x, d), [x, y, d, W]);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `shots/v9-${name}.png` });
}
const fps = await page.evaluate(() => document.body.innerText.match(/(\d+) fps/)?.[1]);
console.log('fps', fps, 'errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
