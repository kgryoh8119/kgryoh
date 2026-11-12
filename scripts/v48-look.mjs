// v48：鉄道会社の新線と新駅・列車の複線走行とすれ違い・夜の灯り・SL・水上交通
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(400000); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 60; i++) { S.stepMonth(s); s.events.active = []; }
  s.cash += 1e8; s.fame = 100; const pop0 = s.stats.pop;
  for (let k = 0; k < 3; k++) { if (s.railDev) s.railDev.next = s.month; s.stats.pop = 40000; S.stepMonth(s); s.events.active = []; }
  const W = S.W, kinds = ['slDepot', 'waterBus', 'cruisePier', 'yakatabune'], placed = {};
  const st = s.buildings.find(b => b.kind === 'station');
  for (const k of kinds) { const d = S.DEFS[k]; let done = false;
    for (let r = 2; r < 45 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = st.x + dx, y = st.y + dy;
      const res = g.act({ type: 'build', kind: k, x, y }); if (res.ok) { const b = s.buildings.at(-1); b.status = 'operating'; b.remain = 0; placed[k] = y * W + x; done = true; } } }
  s.buildings.forEach(b => { if (b.kind === 'station') { b.status = 'operating'; b.remain = 0; } });
  s.roadVersion++; s.bVersion++;
  S.stepMonth(s); s.events.active = []; s.notes = []; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  S.view.clockRun = false; S.view.weatherForce = 'clear';
  const nt = s.buildings.filter(b => b.kind === 'station').map(b => b.y * W + b.x + 1);
  return { pop0, dev: s.railDev, placed, stations: nt, tick: s.month };
});
console.log(JSON.stringify(info));
const nst = info.stations.at(-1);
const shots = [[11, nst, 420, 'branch'], [11, info.placed.slDepot, 160, 'sl'], [20, info.placed.yakatabune ?? info.placed.cruisePier, 260, 'boats-night'], [11, info.placed.cruisePier, 220, 'boats-day']];
for (const [h, t, d, n] of shots) { if (t == null) continue; await page.evaluate(([h, t, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); }, [h, t, d]); await page.waitForTimeout(6000); await page.screenshot({ path: `shots/v48-${n}.png` }); }
// 電車に乗る（昼と夜）
for (const [h, n] of [[11, 'ride-day'], [21, 'ride-night']]) { await page.evaluate(h => { const v = window.__sumu.view; v.hour = h; v.ride = 'train'; }, h); await page.waitForTimeout(9000); await page.screenshot({ path: `shots/v48-${n}.png` }); }
const tr = await page.evaluate(() => { const v = window.__sumu.view; return { n: v.trains?.length, paths: v.railPaths?.length, kinds: v.trains?.map(t => t.path + ':' + t.dir) }; });
console.log(JSON.stringify(tr));
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
