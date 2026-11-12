// v25：施設を育てる（レベル・旗・外観）、改修メニュー、統計、記念カード
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
const out = await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 1e8;
  for (let k = 0; k < 14; k++) S.stepMonth(s);
  s.mayor.pts = 2500; s.mayor.seenLv = 99; s.mayor.seenRank = 1e5; s.events.active = [];
  const near = s.buildings.filter(b => ['school', 'nursery', 'library', 'parkL', 'fire', 'hospital', 'gym'].includes(b.kind) && b.status === 'operating');
  near.forEach((b, i) => { b.lv = 2 + (i % 4); b.style = i % 6; });
  const nur = s.buildings.find(b => b.kind === 'nursery' && b.status === 'operating');
  if (nur) { g.act({ type: 'option', id: nur.id, opt: 'sickCare', on: true }); }
  s.bVersion++; S.ui.refresh(); return nur ? [nur.id, nur.x, nur.y] : null;
});
await page.waitForTimeout(1000);
if (out) { await page.evaluate(([id, x, y]) => { const S = window.__sumu; S.view.focus(y * 76 + x, 330); S.ui.select(y * 76 + x); }, out); }
await page.waitForTimeout(1800);
await page.screenshot({ path: 'shots/v25-grow.png' });
await page.evaluate(() => document.querySelector('[data-act="stats"]')?.click() || (window.__sumu.ui.statsOpen = true, window.__sumu.ui.renderModal()));
await page.waitForTimeout(600); await page.screenshot({ path: 'shots/v25-stats.png' });
await page.evaluate(() => { window.__sumu.ui.statsOpen = false; window.__sumu.ui.renderModal(); window.__sumu.ui.makeCard().then(u => { window.__card = u; }); });
await page.waitForTimeout(2500);
const card = await page.evaluate(() => window.__card);
if (card) { const fs = await import('node:fs'); fs.writeFileSync('shots/v25-card.png', Buffer.from(card.split(',')[1], 'base64')); }
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
