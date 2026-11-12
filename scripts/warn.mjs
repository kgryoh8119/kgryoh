import { open } from './shot.mjs';
const { browser, page } = await open(800, 600);
const w = []; page.on('console', m => { if (m.type() === 'warning') w.push(m.text()); });
await page.reload(); await page.waitForFunction(() => window.__sumu && window.__sumu.view.stats.buildings > 0, null, { timeout: 60000 }); await page.waitForTimeout(1500);
console.log('warnings:', JSON.stringify(w)); await browser.close();
