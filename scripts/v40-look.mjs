// v40：外壁・屋根の模様と、窓に映る空
import { open } from './shot.mjs';
const tag = process.env.TAG ?? 'after';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(150000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 40; i++) { S.stepMonth(s); s.events.active = []; } s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed');
  S.view.clockRun = false; S.view.weatherForce = 'clear'; });
const T = await page.evaluate(() => { const s = window.__sumu.game.state, f = k => { const b = s.buildings.find(b => k.includes(b.kind)); return b ? (b.y + Math.floor(b.h / 2)) * 76 + b.x + Math.floor(b.w / 2) : 0; };
  return { house: f(['house']), apt: f(['mansion', 'apartment']), off: f(['officeM', 'officeS', 'skyscraper', 'department']), jhs: f(['jhs', 'school']) }; });
console.log(T);
const shots = [[9.5, T.house, 70, 'house'], [15.5, T.apt, 110, 'apt'], [10, T.off, 120, 'office'], [16.5, T.jhs, 160, 'jhs']];
for (const [h, t, d, n] of shots) { await page.evaluate(([h, t, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); }, [h, t, d]); await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v40-${tag}-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
