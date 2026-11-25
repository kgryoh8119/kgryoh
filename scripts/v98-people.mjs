// v98：画面の車・人を住民の移動から出す確認。時刻（朝 8 時・昼 12 時・休日 11 時・夜 22 時）ごとに、見える住民の数と描いた数、
// 押したときの紹介、計算の時間を出し、朝と休日を撮る。node scripts/v98-people.mjs（先に npx vite build）。OUT・WHAT（people,station,occ,inc）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v98', WHAT = (process.env.WHAT ?? 'people').split(','), SHOT = process.env.SHOT !== '0';
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1000, 640, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality('mid');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {}; });
// 街を大きくする（MONTHS か月進める）
const M = Number(process.env.MONTHS ?? 0);
if (M) await page.evaluate(m => { const S = window.__sumu; for (let k = 0; k < m; k++) S.stepMonth(S.game.state); }, M);
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; let x = 0, y = 0, n = 0, best = null, bv = -1;
  for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = Math.round(x / n), cy = Math.round(y / n);
  for (const b of s.buildings) if (b.kind === 'station' && b.status === 'operating') { const d = -Math.abs(b.x - cx) - Math.abs(b.y - cy); if (d > bv) { bv = d; best = b; } }
  return { pop: Math.round(s.stats.pop), c: cy * W + cx, st: best ? best.y * W + best.x : -1 }; });
console.log(JSON.stringify(info));
const draw = (n = 1) => page.evaluate(n => { const v = window.__sumu.view; for (let k = 0; k < n; k++) v.__frame.call(v, 0.25); }, n);
const sim = sec => page.evaluate(sec => { const v = window.__sumu.view, s = window.__sumu.game.state; const t0 = performance.now(); let n = 0; for (let t = 0; t < sec; t += 0.1) { v.lifeT += 0.1; v.moveAgents(s, 0.1); n++; } return +((performance.now() - t0) / n).toFixed(2); }, sec);
const at = (hour, hol, tile, d = 260) => page.evaluate(([h, hol, t, d]) => { const v = window.__sumu.view; v.hour = h; v.holiday = hol; v.applyTime?.(); v.focus(t, d); v.pitch = 0.62; v.yaw = 0.7; v.target.x = v.want.x; v.target.z = v.want.z; v.agentSpawnAt.x = -1e9; v.spawnAgents(); }, [hour, hol, tile, d]);
const report = (label) => page.evaluate(label => { const v = window.__sumu.view, r = v.resInfo, ped = v.peds.find(a => a.rt), car = v.cars.find(a => a.rt && a.rt.mode === 4), bike = v.cars.find(a => a.rt && a.rt.mode === 1);
  const whys = {}; for (const a of [...v.peds, ...v.cars]) if (a.rt) whys[a.rt.why] = (whys[a.rt.why] ?? 0) + 1;
  return { label, visible: r.visible, drawn: r.drawn, total: r.total, holiday: r.holiday, spawnMs: r.ms, tickMs: r.tickMs, cars: v.cars.length, peds: v.peds.length, whys,
    ped: ped ? v.whoIs(ped, true) : null, car: car ? v.whoIs(car, false) : null, bike: bike ? v.whoIs(bike, false) : null }; }, label);
if (WHAT.includes('people')) {
  for (const [h, hol, name] of [[8, false, 'am'], [12.5, false, 'noon'], [11, true, 'holiday'], [17.8, false, 'pm'], [22.5, false, 'night']]) {
    await at(h, hol, info.c); const ms = await sim(12); const r = await report(name); r.moveMs = ms; console.log(JSON.stringify(r));
    if (SHOT && (name === 'am' || name === 'holiday')) { await draw(5); await page.screenshot({ path: `${OUT}/${name}.jpg`, type: 'jpeg', quality: 72 }); console.log('shot', name); }
  }
  // 押したときの紹介（いちばん手前の人の画面の位置を押す）
  await at(8, false, info.c, 120); await sim(4);
  const pt = await page.evaluate(() => { const v = window.__sumu.view; for (const a of v.peds) { if (!a.rt || a.px === undefined) continue; const p = v.project(a.px, v.surfY(a.px, a.pz) + 0.9, a.pz); if (p.visible && p.x > 100 && p.x < 900 && p.y > 100 && p.y < 540) return p; } return null; });
  if (pt) { const r = await page.evaluate(([x, y]) => { const v = window.__sumu.view, c = v.renderer.domElement.getBoundingClientRect(); return v.pickPerson(x + c.left, y + c.top); }, [pt.x, pt.y]); console.log('pick', r); }
}
console.log('errors', errors.filter(e => !e.includes('TUNNEL')).slice(0, 5)); await browser.close();
