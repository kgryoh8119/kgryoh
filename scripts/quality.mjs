// 画質ごとの実測（この検証環境のソフトウェア描画での値）
import { open } from './shot.mjs';
const { browser, page, errors } = await open();
await page.click('[data-act="tutskip"]'); await page.evaluate(() => { window.__sumu.fixedQuality = true; });
for (const q of ['high', 'mid', 'low']) {
  await page.evaluate(q => { window.__sumu.view.setQuality(q); Object.assign(window.__sumu.view.want, { x: 21.5 * 30, z: 11 * 30, dist: 620, yaw: 0.55, pitch: 0.72 }); }, q);
  await page.waitForTimeout(6000);
  const r = await page.evaluate(() => { const { view, game, stepMonth } = window.__sumu; const c = structuredClone(game.state); for (let i = 0; i < 6; i++) stepMonth(c, { forecast: true }); const t = performance.now(); for (let i = 0; i < 12; i++) stepMonth(c, { forecast: true }); return { ...view.stats, stepMs: +((performance.now() - t) / 12).toFixed(1), dpr: view.renderer.getPixelRatio(), shadow: view.renderer.shadowMap.enabled && view['sun'].castShadow }; });
  console.log(q, JSON.stringify(r));
  await page.screenshot({ path: `shots/70-q-${q}.png` });
}
console.log('errors', JSON.stringify(errors.filter(e => !e.includes('TUNNEL'))));
await browser.close();
