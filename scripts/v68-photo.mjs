// v68：フォトの色と日付の焼き込みを確かめる
import { open } from './shot.mjs'; import fs from 'fs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 16.8; });
await page.evaluate(() => { const v = window.__sumu.view; v.focus(window.__sumu.game.state.buildings.find(b => b.kind === 'station').y * window.__sumu.W + window.__sumu.game.state.buildings.find(b => b.kind === 'station').x, 260); });
await page.waitForTimeout(3000);
await page.evaluate(() => document.querySelector('[data-act="cam"][data-arg="photo"]')?.click() ?? window.__sumu.ui.setPhoto?.(true));
await page.waitForTimeout(1500);
console.log(await page.evaluate(() => !!document.getElementById('pfilter')));
for (const f of ['film', 'mono']) {
  await page.selectOption('#pfilter', f); await page.waitForTimeout(1200);
  await page.screenshot({ path: `shots/v68-pf-${f}-live.png` });
  await page.evaluate(() => { window.__dl = null; const u = window.__sumu.ui; u.download = (n, d) => { window.__dl = d; }; document.querySelector('[data-act="shoot"]').click(); });
  await page.waitForFunction(() => window.__dl, null, { timeout: 60000 });
  const d = await page.evaluate(() => window.__dl); fs.writeFileSync(`shots/v68-pf-${f}.png`, Buffer.from(d.split(',')[1], 'base64'));
  await page.evaluate(() => { const m = document.getElementById('modal'); if (m) m.style.display = 'none'; });
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
