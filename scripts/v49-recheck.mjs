// v49：季節（4 月）の桜色が作物・ネットに乗らなくなったかを撮る（見本の街のセーブ SAV、KINDS=a,b）
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const SAV = process.env.SAV, list = JSON.parse(readFileSync(SAV + '.json', 'utf8')), K = process.env.KINDS.split(',');
const { browser, page, errors } = await open(960, 640, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(t => { const S = window.__sumu; S.game.loadText(t); S.fixedQuality = true; S.view.setQuality('high'); S.game.state.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; }, readFileSync(SAV, 'utf8'));
for (const k of K) { const t = list.find(e => e[0] === k)[1]; await page.evaluate(([t]) => window.__sumu.view.focus(t, 120), [t]); await page.waitForTimeout(4000); await page.screenshot({ path: `shots/v49r-${k}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
