// v50：光の仕上げ（大気・にじみ・季節の色）を時間帯と天気で撮る。NAME=接頭辞
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v50';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(500000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 48; i++) { S.stepMonth(s); s.events.active = []; } s.notes = []; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; const st = s.buildings.find(b => b.kind === 'station'); S.view.focus(st.y * S.W + st.x + 1, 420); S.view.orbitBy?.(0.5, -0.12); });
const shots = (process.env.SHOTS ?? 'day:11:clear,morning:6.6:fog,dusk:17.4:clear,night:20.5:clear,rain:14:rain').split(',');
for (const sh of shots) { const [n, h, w] = sh.split(':'); await page.evaluate(([h, w]) => { const v = window.__sumu.view; v.hour = Number(h); v.weatherForce = w; }, [h, w]); await page.waitForTimeout(7000); await page.screenshot({ path: `shots/${NAME}-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
