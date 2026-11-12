// v66：屋号の看板（店ごとの違い）と、公共施設の正式名の看板を撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; });
const pub = await page.evaluate(() => { const S = window.__sumu, s = S.game.state; const r = {}; for (const b of s.buildings) if (['school', 'fire', 'cityHall', 'police', 'nursery', 'koban', 'jhs', 'clinic'].includes(b.kind) && !r[b.kind]) r[b.kind] = (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1); return [r, [...new Set(s.buildings.map(b => b.kind))].join(',')]; });
console.log(JSON.stringify(pub[0]), pub[1]);
for (const [k, t] of Object.entries(pub[0]).filter(([k]) => ['school', 'fire', 'koban'].includes(k))) for (let r = 0; r < 4; r++) { await page.evaluate(([t, r]) => { const v = window.__sumu.view; v.focus(t, 55); v.yaw = v.want.yaw = 0.1 + r * Math.PI / 2; v.pitch = v.want.pitch = 0.22; }, [t, r]); await page.waitForTimeout(r ? 2500 : 4000); await page.screenshot({ path: `shots/v66-${k}${r}.png` }); }
for (let q = 0; q < 0; q++) {
  const o = await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state, st = s.buildings.find(b => b.kind === 'station'); s.cash = 1e12;
    for (let rr = 6 + q * 6; rr < 60; rr++) for (let dy = -rr; dy <= rr; dy += 2) for (let dx = -rr; dx <= rr; dx += 2) { if (Math.max(Math.abs(dx), Math.abs(dy)) < rr - 1) continue; const r = g.act({ type: 'build', kind: 'libraryS', x: st.x + dx, y: st.y + dy }); if (r.ok) { const b = s.buildings[s.buildings.length - 1]; b.status = 'operating'; b.remain = 0; b.v = 0.21 + q * 0.27; b.kind = 'shop'; s.bVersion++; return (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1); } } return -1; }, q);
  if (o < 0) continue; await page.evaluate(([t]) => { const v = window.__sumu.view; v.focus(t, 45); v.yaw = 0.15; v.pitch = 0.28; }, [o]); await page.waitForTimeout(4000); await page.screenshot({ path: `shots/v66-shop${q}.png` });
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
