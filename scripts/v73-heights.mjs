// v73：高さの違う物どうしのつながり（橋・陸橋）を近くから撮る。車・バスが路面に沿って上り下りしているか
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { window.__sumu.game.reset({ seed: 2e9 + 3e6 + 261011 }); }); await page.waitForTimeout(6000);
const r = await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state, W = S.W, H = (s.road.length / W) | 0, v = S.view; s.tutorial.done = true; s.goalPick = false; s.cash = 1e8; v.clockRun = false; v.hour = 13; v.weatherForce = 'clear'; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo');
  const m = v.map, out = {};
  for (let y = 2; y < H - 2 && !out.bridge; y++) for (let x = 2; x < W - 10 && !out.bridge; x++) {
    const i = y * W + x; if (!s.road[i] || m.water[i]) continue;
    let k = 1; while (k < 9 && m.water[i + k]) k++;
    if (k > 1 && k < 9 && !m.water[i + k]) { const tiles = []; for (let j = 0; j <= k; j++) tiles.push(i + j); const a = g.act({ type: 'bridge', tiles, road: 2 }); if (a.ok) out.bridge = i + (k >> 1); else out.bmsg = a.msg; }
  }
  if (s.rail) for (let i = W; i < W * (H - 3) && out.overpass === undefined; i++) { if (!s.rail[i] || s.road[i] || s.railGrade?.[i]) continue; const line = [i - 2 * W, i - W, i, i + W, i + 2 * W]; if (line.some(t => s.rail[t] && t !== i)) continue; const ra = g.act({ type: 'road', tiles: line, road: 2 }); if (!ra.ok) { out.rmsg = ra.msg; continue; } { const a = g.act({ type: 'overpass', tiles: [i] }); if (a.ok) out.overpass = i; else out.omsg = a.msg; } }
  const x = s.road.findIndex((r, i) => r && s.rail && s.rail[i] && !(s.railGrade && s.railGrade[i])); if (out.overpass === undefined && x >= 0) { const a = g.act({ type: 'overpass', tiles: [x] }); if (a.ok) out.overpass = x; else out.omsg = a.msg; }
  S.ui.refresh(); return out; });
console.log(JSON.stringify(r)); await page.waitForTimeout(6000);
for (const [k, t] of Object.entries(r)) { if (typeof t !== 'number') continue;
  for (const [n, d, p, yaw] of [['a', 150, 0.3, 0.3], ['b', 110, 0.18, 1.57]]) {
    await page.evaluate(([t, d, p, yaw]) => { const v = window.__sumu.view; v.focus(t, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [t, d, p, yaw]);
    await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v73-h-${k}-${n}.png` }); } }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
