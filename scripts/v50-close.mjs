// v50：近くで見る（窓の奥の部屋・古い建物の雨だれ・道路のひびとマンホール）。NAME=接頭辞
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v50c';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(500000); await page.waitForTimeout(1500);
const t = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 48; i++) { S.stepMonth(s); s.events.active = []; } s.buildings.forEach((b, k) => { if (k % 2) b.builtMonth = s.month - 600; }); s.bVersion++; s.roadVersion++;
  s.notes = []; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear';
  const tall = s.buildings.filter(b => ['apartment', 'mansion', 'officeM', 'officeS', 'towerMansion', 'hotel', 'bizHotel'].includes(b.kind)).sort((a, b) => (b.h * b.w) - (a.h * a.w))[0]; return tall.y * S.W + tall.x; });
for (const [h, d, n] of (process.env.ONLYNIGHT ? [[21, 35, 'win-night']] : [[21, 60, 'win-night'], [11, 60, 'win-day'], [11, 22, 'street']])) { await page.evaluate(([t, h, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); }, [t, h, d]); await page.waitForTimeout(7000); await page.screenshot({ path: `shots/${NAME}-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
