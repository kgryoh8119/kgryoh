// v41：雨にぬれた道路・川のさざ波と空の映り込み
import { open } from './shot.mjs';
const tag = process.env.TAG ?? 'after';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(150000); await page.waitForTimeout(1500);
const T = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 40; i++) { S.stepMonth(s); s.events.active = []; } s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed');
  S.view.clockRun = false; const st = s.buildings.find(b => b.kind === 'station'); return { st: st ? st.y * 76 + st.x + 1 : 0 }; });
const shots = [[16.8, 'clear', 65 * 76 + 16, 110, 'river']];
for (const [h, w, t, d, n] of shots) { await page.evaluate(([h, w, t, d]) => { const v = window.__sumu.view; v.hour = h; v.weatherForce = w; v.focus(t, d); }, [h, w, t, d]); await page.waitForTimeout(6000); await page.screenshot({ path: `shots/v41-${tag}-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
