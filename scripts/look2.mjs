import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const { browser, page, errors } = await open(1440, 900);
if (process.env.SAVE) await page.evaluate((t) => { const g = window.__sumu.game; g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); }, readFileSync(process.env.SAVE, 'utf8'));
else await page.evaluate(() => { const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; window.__sumu.ui.refresh(); });
if (process.env.PRE) await page.evaluate(process.env.PRE);
for (const [name, x, y, d] of JSON.parse(process.env.SHOTS)) {
  await page.evaluate(([x, y, d]) => window.__sumu.view.focus(y * 76 + x, d), [x, y, d]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `shots/${name}.png` });
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
