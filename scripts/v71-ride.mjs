// v71：電車・バスに乗ったときの画面を連続で撮り、明るさの急な変化（ちらつき）を数える
import { open } from './shot.mjs'; import fs from 'fs';
const { browser, page, errors } = await open(1280, 720, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.goalPick = false; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; });
const hour = Number(process.env.HOUR ?? 10.5);
await page.evaluate((h) => { const v = window.__sumu.view; v.hour = h; v.dist = 900; }, hour);
for (const mode of (process.env.MODES ?? 'train').split(',')) {
  await page.evaluate((m) => { const v = window.__sumu.view; v.ride = m; }, mode); await page.waitForTimeout(4000);
  const lum = [];
  for (let k = 0; k < Number(process.env.N ?? 16); k++) {
    const b = await page.screenshot({ path: k % 4 === 0 ? `shots/v71-${mode}-${k}.png` : undefined, type: 'png' });
    lum.push(await page.evaluate(async (u) => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = 64; c.height = 36; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 64, 36); const d = x.getImageData(0, 0, 64, 36).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11; return Math.round(s / (d.length / 4)); }, 'data:image/png;base64,' + b.toString('base64')));
  }
  console.log(mode, 'ride=', await page.evaluate(() => window.__sumu.view.ride), 'lum', lum.join(' '));
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
