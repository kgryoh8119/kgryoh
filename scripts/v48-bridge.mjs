// v48：橋げた（川の橋）と谷を渡る橋。TERRAIN=river か mountain
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(400000); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, W = S.W, m = S.view.map; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash += 1e8; const H = s.road.length / W; const out = [];
  // 水か急斜面を横切る横一列（両端は道路にできる土地）で、橋の道具が通る所を探す
  for (let y = 3; y < H - 3 && out.length < 2; y++) {
    let x0 = -1;
    for (let x = 1; x < W - 1; x++) { const i = y * W + x, gap = m.water[i] || m.steep[i];
      if (gap && x0 < 0) x0 = x;
      if (!gap && x0 >= 0) { const L = x - x0; if (L >= 2 && L <= 8) { const tiles = []; for (let k = x0 - 2; k <= x + 1; k++) tiles.push(y * W + k); const r = g.act({ type: 'bridge', tiles, road: 1 }); if (r.ok) { out.push({ y, x0, L, water: !!m.water[y * W + x0], msg: r.msg, t: y * W + x0 + (L >> 1) }); y += 6; break; } } x0 = -1; } }
  }
  s.roadVersion++; S.stepMonth(s); s.events.active = []; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  S.view.clockRun = false; S.view.weatherForce = 'clear'; return out; });
console.log(JSON.stringify(info));
let k = 0; for (const b of info) { await page.evaluate(([t]) => { const v = window.__sumu.view; v.hour = 10; v.focus(t, 110); v.orbitBy(0.6, 0.15); }, [b.t]); await page.waitForTimeout(6000); await page.screenshot({ path: `shots/v48-bridge-${process.env.TERRAIN}-${k++}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
