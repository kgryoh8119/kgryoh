// 季節・天気・時刻の見た目を撮る。SHOTS=[[名前, ゲームの月(0=4月), 天気, 時刻, 'orbit'|'ground', 距離]]
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate((t) => { const g = window.__sumu.game; g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); window.__sumu.fixedQuality = true; }, readFileSync(process.env.SAVE, 'utf8'));
const [x, y] = JSON.parse(process.env.AT ?? '[30,30]');
for (const [name, month, w, hour, mode, dist] of JSON.parse(process.env.SHOTS)) {
  await page.evaluate(([x, y, month, w, hour, mode, dist]) => { const v = window.__sumu.view, s = window.__sumu.game.state; s.month = Math.floor(s.month / 12) * 12 + month; v.weatherForce = w; v.hour = hour; v.clockRun = false; if (mode === 'ground') { v.focus(y * 76 + x, 300); } else { v.setMode && v.setMode('orbit'); v.focus(y * 76 + x, dist ?? 420); } }, [x, y, month, w, hour, mode, dist]);
  if (mode === 'ground') { await page.waitForTimeout(500); await page.click('[data-act="cam"][data-arg="ground"]').catch(() => {}); }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/${name}.png` });
  if (mode === 'ground') await page.click('[data-act="cam"][data-arg="orbit"]').catch(() => {});
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
