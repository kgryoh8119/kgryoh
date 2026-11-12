// v48：水上バス・遊覧船・屋形船（大河の地形）と、川の橋の橋げた
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(400000); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, W = S.W; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 12; i++) { S.stepMonth(s); s.events.active = []; } s.cash += 1e8; s.fame = 100;
  const placed = {}, msgs = {};
  // 川の水面の区画
  const wt = []; for (let i = 0; i < s.road.length; i++) if (S.view.map.water[i]) wt.push(i);
  const H = s.road.length / W, cy = Math.floor(H / 2);
  const rowW = wt.filter(i => Math.abs(Math.floor(i / W) - cy) < 2);
  for (const k of ['waterBus', 'cruisePier', 'yakatabune']) { let done = false;
    for (let r = 0; r < 30 && !done; r++) for (const dir of [1, -1]) { if (done) break; const y = cy + dir * r * 2; const w0 = wt.find(i => Math.floor(i / W) === y); if (w0 == null) continue;
      for (let dx = -6; dx <= 6 && !done; dx++) { const x = w0 % W + dx; const res = g.act({ type: 'build', kind: k, x, y }); msgs[k] = res.msg; if (res.ok) { const b = s.buildings.at(-1); b.status = 'operating'; b.remain = 0; placed[k] = y * W + x; done = true; } } } }
  // 川を渡る橋
  const by = cy + 9, row = wt.filter(i => Math.floor(i / W) === by).map(i => i % W); let br = null;
  if (row.length) { const tiles = []; for (let x = Math.min(...row) - 3; x <= Math.max(...row) + 3; x++) tiles.push(by * W + x); br = g.act({ type: 'bridge', tiles, road: 1 }).msg; placed.bridge = by * W + Math.min(...row); }
  s.roadVersion++; s.bVersion++;
  S.stepMonth(s); s.events.active = []; s.notes = []; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  S.view.clockRun = false; S.view.weatherForce = 'clear';
  return { placed, msgs, br };
});
console.log(JSON.stringify(info));
const p = info.placed;
const shots = [[11, p.cruisePier ?? p.waterBus, 200, 'piers-day'], [20.5, p.yakatabune ?? p.cruisePier, 320, 'piers-night'], [11, p.bridge, 120, 'bridge']];
for (const [h, t, d, n] of shots) { if (t == null) continue; await page.evaluate(([h, t, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); }, [h, t, d]); await page.waitForTimeout(6000); await page.screenshot({ path: `shots/v48-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
