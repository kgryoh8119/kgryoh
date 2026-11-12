import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const text = readFileSync(process.env.SAVE, 'utf8');
const { browser, page, errors } = await open(1440, 900);
const r = await page.evaluate((t) => { const g = window.__sumu.game; const r = g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); return r.msg; }, text);
console.log(r);
for (const [name, x, y, d] of JSON.parse(process.env.SHOTS)) {
  await page.evaluate(([x, y, d]) => window.__sumu.view.focus(y * 76 + x, d), [x, y, d]);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/${name}.png` });
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
