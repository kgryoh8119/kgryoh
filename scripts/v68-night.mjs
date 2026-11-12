// v68：夜の街（袖看板・ちょうちん・自販機の明かり）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 20.5; g.speed = 0; });
const at = [];
for (let q = 0; q < 4; q++) {
  const o = await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state, st = s.buildings.find(b => b.kind === 'station'); s.cash = 1e12;
    for (let rr = 4 + q * 9; rr < 70; rr++) for (let dy = -rr; dy <= rr; dy += 2) for (let dx = -rr; dx <= rr; dx += 2) { if (Math.max(Math.abs(dx), Math.abs(dy)) < rr - 1) continue; const r = g.act({ type: 'build', kind: 'libraryS', x: st.x + dx, y: st.y + dy }); if (r.ok) { const b = s.buildings[s.buildings.length - 1]; b.status = 'operating'; b.remain = 0; b.v = [0.07, 0.29, 0.53, 0.81][q]; b.kind = 'shop'; s.bVersion++; return (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1); } } return -1; }, q);
  if (o >= 0) at.push(o);
}
console.log('shops', at.length);
await page.waitForTimeout(3000);
let n = 0;
for (const t of at) { for (let r = 0; r < 4; r++) { await page.evaluate(([t, r]) => { const v = window.__sumu.view; v.hour = 20.5; v.focus(t, 40); v.yaw = v.want.yaw = 0.35 + r * Math.PI / 2; v.pitch = v.want.pitch = 0.3; }, [t, r]); await page.waitForTimeout(3500); await page.screenshot({ path: `shots/v68-shop${n}-${r}.png` }); } n++; }
// 自販機
const vend = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W, out = [];
  for (let i = 0; i < s.road.length; i++) { const t = s.road[i]; if (t !== 1 && t !== 2) continue; const x = i % W, y = (i / W) | 0; let n = 0, e = 0, ns = 0;
    for (const [dx, dy, k] of [[1, 0, 'e'], [-1, 0, 'e'], [0, 1, 'n'], [0, -1, 'n']]) { const j = (y + dy) * W + x + dx; if (s.road[j]) { n++; if (k === 'e') e++; else ns++; } }
    if (n >= 3 || !((e > 0) !== (ns > 0))) continue; const hv = ((x * 73856093) ^ (y * 19349663)) >>> 0; if (hv % 11 <= 2 && out.length < 2) out.push(i); } return out; });
for (const t of []) { await page.evaluate(([t]) => { const v = window.__sumu.view; v.hour = 21; v.focus(t, 40); v.pitch = v.want.pitch = 0.35; }, [t]); await page.waitForTimeout(4000); await page.screenshot({ path: `shots/v68-vend${vend.indexOf(t)}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
