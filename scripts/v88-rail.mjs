// v88：鉄道（線路・駅・列車）の撮影。WHAT（train,cross,station,track,night をカンマ区切り）、OUT（出力先）、PFX（ファイル名の頭）、Q（品質）
import { open } from './shot.mjs';
const WHAT = (process.env.WHAT ?? 'train,cross,station,track').split(','), OUT = process.env.OUT ?? 'shots', PFX = process.env.PFX ?? 'rail-';
const { browser, page, errors } = await open(960, 600, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10; }, process.env.Q ?? 'high');
await page.waitForTimeout(3000);
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, v = S.view, W = S.W; const cross = []; for (let i = 0; i < s.rail.length; i++) if (s.rail[i] && s.road[i] && !s.railGrade[i]) cross.push(i);
  const st = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating'); return { W, cross, st: st.map(b => b.y * W + b.x), trains: v.trains?.length ?? 0, kinds: v.trains?.map(t => t.kind) }; });
console.log(JSON.stringify({ ...info, cross: info.cross.length }));
const shot = async (n, wait = 6000) => { await page.waitForTimeout(wait); console.log(n, new Date().toISOString(), JSON.stringify(await page.evaluate(() => window.__sumu.view.stats))); await page.screenshot({ path: `${OUT}/${PFX}${n}.png` }); console.log('shot', n); };
// 列車を止めて、その横から（K 番の編成。駅に止めておく）
const trainAt = async (k, dist, pitch, yaw, back = 0) => page.evaluate(([k, dist, pitch, yaw, back]) => { const S = window.__sumu, v = S.view, t = v.trains[Math.min(k, v.trains.length - 1)]; v.hour = 10; const P = v.railPaths[t.path]; let j = 0; const d = t.d - t.dir * back; while (j < P.d.length - 1 && P.d[j] < d) j++;
  const x = P.p[j * 3], z = P.p[j * 3 + 2]; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), dist); v.pitch = pitch; v.yaw = yaw; v.trains.forEach(t => { t.wait = 1e9; }); return [t.path, t.d, t.fam, v.trains.map(t => t.fam).join(",")]; }, [k, dist, pitch, yaw, back]);
if (WHAT.includes('train') && info.trains > 0) { console.log(await trainAt(Number(process.env.K ?? 0), 34, 0.18, 0.9, 20)); await shot('train', 9000); }
if (WHAT.includes('train2') && info.trains > 1) { console.log(await trainAt(Number(process.env.K2 ?? 2), 40, 0.25, 2.2, 0)); await shot('train2', 9000); }
if (WHAT.includes('cross') && info.cross.length) { await page.evaluate(([i, W]) => { const v = window.__sumu.view; Object.assign(v.view?.want ?? {}, {}); v.focus(i, 60); v.pitch = 0.45; v.yaw = 0.6; }, [info.cross[0], info.W]); await shot('cross', 8000); }
if (WHAT.includes('station') && info.st.length) { await page.evaluate((i) => { const v = window.__sumu.view; v.focus(i, 70); v.pitch = 0.35; v.yaw = 2.6; }, info.st[0]); await shot('station', 9000); }
if (WHAT.includes('track') && info.trains > 0) { await page.evaluate(() => { const S = window.__sumu, v = S.view, P = v.railPaths[0], j = Math.floor(P.d.length * 0.4); const x = P.p[j * 3], z = P.p[j * 3 + 2]; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), 26); v.pitch = 0.42; v.yaw = 1.3; }); await shot('track', 8000); }
if (WHAT.includes('night') && info.trains > 0) { await trainAt(0, 60, 0.3, 0.9, 10); await page.evaluate(() => { window.__sumu.view.hour = 21; }); await shot('night', 9000); }
console.log('errors', JSON.stringify(errors.filter(e => !e.includes('404')).slice(0, 5)));
await browser.close();
