// v38：夜の明かり（建物の種類ごと・時刻ごと）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 40; i++) { S.stepMonth(s); s.events.active = []; } if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } s.notes = []; S.ui.refresh(); S.ui.renderModal(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed');
  S.view.clockRun = false; S.view.weatherForce = 'clear'; });
const sch = await page.evaluate(() => { const s = window.__sumu.game.state, b = s.buildings.find(b => /school|Ju|junior|elem/i.test(b.kind)); return b ? { t: b.y * 76 + b.x, k: b.kind } : null; });
console.log('school', sch);
for (const [h, d, tag] of [[19.5, 1300, 'far19'], [22.5, 1300, 'far22'], [2, 1300, 'far02'], [20, 420, 'near20']]) {
  await page.evaluate(([h, d, t]) => { const v = window.__sumu.view; v.hour = h; v.focus(t ?? 30 * 76 + 40, d); }, [h, d, sch?.t]);
  await page.waitForTimeout(2200); await page.screenshot({ path: `shots/v38-${tag}.png` });
}
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
