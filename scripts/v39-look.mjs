// v39：中学校のはみ出し・窓 1 枚ごとの明かり・雪の粒
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 40; i++) { S.stepMonth(s); s.events.active = []; } s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed');
  S.view.clockRun = false; S.view.weatherForce = 'clear'; const b = s.buildings.find(b => b.kind === 'jhs') ?? s.buildings.find(b => b.kind === 'school'); return b ? { t: (b.y + 1) * 76 + b.x + 1, k: b.kind } : null; });
console.log(info);
for (const [h, w, tag] of [[20, 'clear', 'jhs20'], [21, 'snow', 'snow21'], [17, 'clear', 'jhs17']]) {
  await page.evaluate(([h, w, t]) => { const v = window.__sumu.view; v.hour = h; v.weatherForce = w; v.focus(t, 150); }, [h, w, info.t]);
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v39-${tag}.png` });
}
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
