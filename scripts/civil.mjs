// 橋・水路・陸橋・歩道橋・ダムを置いて撮る
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate((t) => { const g = window.__sumu.game; g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); window.__sumu.fixedQuality = true; }, readFileSync(process.env.SAVE, 'utf8'));
const r = await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state, W = 76, H = 68, v = S.view; s.cash = 1e8; v.clockRun = false; v.hour = 13; v.weatherForce = 'clear';
  const m = v.map, out = {};
  // 橋：水の区画の両岸に道路がある所を探し、水の上を渡す
  for (let y = 2; y < H - 2 && !out.bridge; y++) for (let x = 2; x < W - 10 && !out.bridge; x++) {
    const i = y * W + x; if (!s.road[i] || m.water[i]) continue;
    let k = 1; while (k < 9 && m.water[i + k]) k++;
    if (k > 1 && k < 9 && s.road[i + k] && !m.water[i + k]) { const tiles = []; for (let j = 0; j <= k; j++) tiles.push(i + j); const a = g.act({ type: 'bridge', tiles, road: 2 }); if (a.ok) out.bridge = i + 1; }
  }
  if (!out.bridge) for (let y = 2; y < H - 2 && !out.bridge; y++) for (let x = 2; x < W - 10 && !out.bridge; x++) { const i = y * W + x; if (!s.road[i] || !m.water[i + 1]) continue; const tiles = []; for (let j = 0; j < 8; j++) tiles.push(i + j); const a = g.act({ type: 'bridge', tiles, road: 2 }); if (a.ok) out.bridge = i + 1; }
  if (!out.bridge) { for (const y of [50, 49, 51]) { const tiles = []; for (let x = 39; x <= 49; x++) tiles.push(y * W + x); const a = g.act({ type: 'bridge', tiles, road: 1 }); if (a.ok) { out.bridge = y * W + 44; break; } else out.bmsg = a.msg; } }
  // 水路：住宅地の空き地を 6 区画
  for (let i = W * 18; i < W * H && !out.canal; i++) { const tiles = [0, 1, 2, 3, 4, 5].map(k => i + k); if (tiles.every(t => !s.occ[t] && !s.road[t] && !m.water[t] && !m.steep[t] && !m.forest[t] && !(s.rail && s.rail[t]))) { const a = g.act({ type: 'canal', tiles }); if (a.ok) out.canal = i + 2; } }
  // 陸橋：線路を横切る道路を引いてから
  if (s.rail) for (let i = W; i < W * (H - 3) && out.overpass === undefined; i++) { if (!s.rail[i] || s.road[i] || s.railGrade?.[i] || i % W < 28) continue; const line = [i - W, i, i + W, i + 2 * W, i + 3 * W]; if (g.act({ type: 'road', tiles: line, road: 2 }).ok && g.act({ type: 'overpass', tiles: [i] }).ok) out.overpass = i; }
  // 陸橋：踏切
  const x = s.road.findIndex((r, i) => r && s.rail && s.rail[i] && !(s.railGrade && s.railGrade[i])); if (out.overpass === undefined && x >= 0 && g.act({ type: 'overpass', tiles: [x] }).ok) out.overpass = x;
  // 歩道橋：幹線
  const f = s.road.findIndex((r, i) => r === 2 && i > W * 10 && !(s.bridge || []).includes(i) && !(s.overpass || []).includes(i)); if (f >= 0 && g.act({ type: 'footbridge', tiles: [f] }).ok) out.foot = f;
  // ダム
  for (let i = 0; i < W * H && !out.dam; i++) { const a = g.act({ type: 'build', kind: 'dam', x: i % W, y: (i / W) | 0 }); if (a.ok) out.dam = i; }
  for (const b of s.buildings) if (b.kind === 'dam') { b.status = 'operating'; b.remain = 0; }
  s.bVersion++; S.ui.refresh();
  return out;
});
console.log(JSON.stringify(r));
for (const [k, d] of [['bridge', 140], ['canal', 140], ['overpass', 110], ['foot', 70], ['dam', 260]]) {
  const t = r[k]; if (t === undefined) continue;
  await page.evaluate(([t, d]) => window.__sumu.view.focus(t, d), [t, d]);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `shots/civil-${k}.png` });
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
