// v49：node で全施設を置いたセーブ（SAV）を読み込み、置いた順に STEP 件ごとに撮る
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const SAV = process.env.SAV, list = JSON.parse(readFileSync(SAV + '.json', 'utf8')), STEP = Number(process.env.STEP ?? 5), FROM = Number(process.env.FROM ?? 0);
const { browser, page, errors } = await open(960, 640, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const r = await page.evaluate(t => { const S = window.__sumu; const res = S.game.loadText(t); S.fixedQuality = true; S.view.setQuality('high'); S.game.state.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; return res; }, readFileSync(SAV, 'utf8'));
console.log(JSON.stringify(r));
for (let i = FROM; i < list.length; i += STEP) { const grp = list.slice(i, i + STEP); const t = grp[Math.floor(grp.length / 2)][1];
  await page.evaluate(([t]) => { window.__sumu.view.focus(t, 190); }, [t]); await page.waitForTimeout(3500);
  await page.screenshot({ path: `shots/v49s-${String(i).padStart(3, '0')}.png` }); console.log(i, grp.map(g => g[0]).join(',')); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
