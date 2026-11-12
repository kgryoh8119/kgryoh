// v64：家・店・病院のバリエーションと、SL・特急・バスを撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; });
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state; const hs = s.buildings.filter(b => b.kind === 'house'); const cnt = {}; for (const b of s.buildings) cnt[b.kind] = (cnt[b.kind] || 0) + 1;
  return { houses: hs.slice(0, 40).map(b => (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1)), cnt, sl: S.view.slTrain, nt: S.view.trains.length }; });
console.log('sl', info.sl, 'trains', info.nt, 'shop', info.cnt.shop, 'hosp', info.cnt.hospital);
// 家
for (let i = 0; i < 3 && i * 7 < info.houses.length; i++) { await page.evaluate(([t, i]) => { const v = window.__sumu.view; v.focus(t, 70); v.pitch = 0.42; v.yaw = 0.5 + i * 0.7; }, [info.houses[i * 7], i]); await page.waitForTimeout(4000); await page.screenshot({ path: `shots/v64-house${i}.png` }); }
// 店と病院：数か所に建てて撮る
for (const [kind, n, d] of [['hospital', 3, 190], ['libraryS', 3, 60], ['slDepot', 1, 120]]) {
  for (let q = 0; q < n; q++) {
    const o = await page.evaluate(([kind, q]) => { const S = window.__sumu, g = S.game, s = g.state; S.view.setGhost(null); const st = s.buildings.find(b => b.kind === 'station') ?? s.buildings[0]; s.cash = 1e12; let last = '', cnt = 0;
      for (let rr = 4 + q * 5; rr < 60; rr++) for (let dy = -rr; dy <= rr; dy += 2) for (let dx = -rr; dx <= rr; dx += 2) { if (Math.max(Math.abs(dx), Math.abs(dy)) < rr - 1) continue; const r = g.act({ type: 'build', kind, x: st.x + dx, y: st.y + dy }); if (r.ok) { const b = s.buildings[s.buildings.length - 1]; b.status = 'operating'; b.remain = 0; b.v = 0.13 + q * 0.31; if (kind === 'libraryS') b.kind = 'shop'; s.bVersion++; return { id: b.id, at: (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1) }; } last = r.msg; }
      return { err: last }; }, [kind, q]);
    if (o.err) { console.log(kind, o.err); continue; }
    await page.evaluate(([t, d]) => { const v = window.__sumu.view; v.focus(t, d); v.yaw = 0.35; v.pitch = 0.38; }, [o.at, d]); await page.waitForTimeout(4500);
    await page.screenshot({ path: `shots/v64-${kind}${q}.png` });
  }
}
// 電車（SL・特急）
await page.evaluate(() => { const v = window.__sumu.view; v.hour = 11; window.__sumu.game.state.bVersion++; }); await page.waitForTimeout(6000); await page.evaluate(() => { const v = window.__sumu.view; if (v.slTrain < 0 && v.trains.length > 1) v.slTrain = v.trains.length - 1; });
console.log(await page.evaluate(() => { const v = window.__sumu.view; return ['sl', v.slTrain, 'n', v.trains.length, v.trains.map(t => v.railPaths[t.path].kind ?? 0).join('')]; }));
const ks = await page.evaluate(() => { const v = window.__sumu.view; const r = []; if (v.slTrain >= 0) r.push(v.slTrain); for (let k = 0; k < v.trains.length && r.length < 3; k++) if (k % 3 === 2 && !(v.railPaths[v.trains[k].path].kind)) r.push(k); return r; });
let n = 0;
for (const k of ks) { await page.evaluate((k) => { const S = window.__sumu, v = S.view, t = v.trains[k]; const P = v.railPaths[t.path]; let j = 0; while (j < P.d.length - 1 && P.d[j] < t.d) j++;
    const x = P.p[j * 3], z = P.p[j * 3 + 2]; v.focus(Math.floor(z / 30) * S.W + Math.floor(x / 30), 40); v.pitch = 0.28; v.yaw = 0.8; }, k); await page.waitForTimeout(1500); await page.screenshot({ path: `shots/v64-train${n++}.png` }); }
console.log('trains', ks, errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
