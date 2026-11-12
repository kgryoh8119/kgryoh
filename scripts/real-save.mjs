process.env.MAPID = process.env.MAPID ?? 'hodogaya';
const { open } = await import('./shot.mjs');
const { browser, page } = await open();
const r = await page.evaluate(() => { const g = window.__sumu.game; const t0 = performance.now(); const a = g.saveLocal(); const t1 = performance.now(); const b = g.loadLocal(); return { a, b, saveMs: Math.round(t1 - t0), loadMs: Math.round(performance.now() - t1) }; });
console.log(JSON.stringify(r));
await browser.close();
