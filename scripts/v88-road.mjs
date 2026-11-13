// v88：道路・車・駅のあふれの撮影。WHAT（st100,st160,car,cross をカンマ区切り）、OUT（出力先）、PRE（ファイル名の頭）、Q（品質）
import { open } from './shot.mjs';
const WHAT = (process.env.WHAT ?? 'st100,st160,car,cross').split(','), OUT = process.env.OUT ?? 'shots', PRE = process.env.PRE ?? '';
const { browser, page, errors } = await open(960, 600, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q[0]);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = q[1]; }, [process.env.Q ?? "high", Number(process.env.HOUR ?? 8)]);
await page.waitForTimeout(3000);
const shot = async (n, wait = 6000) => { await page.waitForTimeout(wait); await page.screenshot({ path: `${OUT}/${PRE}${n}.png` }); console.log('shot', n); };
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; let wi = -1, wv = -1, xi = -1;
  for (let i = 0; i < s.road.length; i++) if (s.road[i] && s.road[i] !== 3 && s.vc[i] > wv) { wv = s.vc[i]; wi = i; }
  for (let i = W; i < s.road.length - W && xi < 0; i++) if (s.road[i] === 2 && s.road[i - 1] && s.road[i + 1] && s.road[i - W] && s.road[i + W]) xi = i;
  const st = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating'); return { wi, xi, st0: st[0] ? st[0].y * W + st[0].x : -1, sid: st[0]?.id }; });
console.log(JSON.stringify(info));
for (const w of WHAT) {
  if (w.startsWith('st') && info.st0 >= 0) {
    // 駅勢圏の世帯を増減して、いちばん目の駅の混雑率を target（%）に合わせる
    const target = Number(w.slice(2));
    const cr = await page.evaluate(([t, sid, target]) => { const S = window.__sumu, s = S.game.state, v = S.view; const cur = () => (v.stStats(s).find(x => x.b.id === sid)?.crowd ?? 0);
      for (let it = 0; it < 4; it++) { const c = cur(); if (!c) break; const f = target / c; for (const b of s.buildings) if (b.hh) for (let k = 0; k < b.hh.length; k++) b.hh[k] *= f; s.bVersion++; }
      v.focus(t, 120); v.pitch = 0.62; v.yaw = 2.2; return cur(); }, [info.st0, info.sid, target]);
    console.log('crowd', cr); await shot(w, 15000);
  }
  if (w === 'car' && info.wi >= 0) { await page.evaluate((wi) => { const v = window.__sumu.view; v.focus(wi, 26); v.pitch = 0.32; v.yaw = 0.7; v.spawnAgents(); }, info.wi); await shot('car', 15000); }
  if (w === 'cross' && info.xi >= 0) { await page.evaluate((xi) => { const v = window.__sumu.view; v.focus(xi, 70); v.pitch = 0.75; v.yaw = 0.4; }, info.xi); await shot('cross', 12000); }
}
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
