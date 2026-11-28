// v105b：保育所の送り（朝 8 時）・バス停（朝 8 時）・平日の公園（10 時・16 時）・駅へ向かう道（朝 8 時）を撮り、数を照らし合わせる。
// node scripts/v105b-shots.mjs（先に npx vite build）。OUT=docs/shots/v105b  TAG=after  WHAT=care,bus,park10,park16,station  DIST=…（直す前の版）
// 住野市にはバス停が無いので、住宅地の道路とスーパー・駅の前にバス停を置いてから撮る（撮影のためだけ。直す前の版でも同じ所に置く）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v105b', TAG = process.env.TAG ?? 'after', WHAT = (process.env.WHAT ?? 'care,bus,park10,park16,station').split(',');
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1000, 640, 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(q => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {}; v.dayNo = 1; }, process.env.Q ?? 'mid');
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, W = S.W; let x = 0, y = 0, n = 0;
  for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = x / n, cy = y / n, near = l => { let best = null, bv = 1e9; for (const b of l) { const d = Math.abs(b.x - cx) + Math.abs(b.y - cy); if (d < bv) { bv = d; best = b; } } return best; };
  const care = near(s.buildings.filter(b => ['nursery', 'nurseryS', 'nurseryL', 'privNursery', 'kindergarten'].includes(b.kind) && b.status === 'operating'));
  const park = near(s.buildings.filter(b => ['park', 'parkM', 'parkL'].includes(b.kind) && b.status === 'operating'));
  const st = near(s.buildings.filter(b => b.kind === 'station' && b.status === 'operating'));
  // バス停：住宅の前の道路（6 区画以上離す）とスーパー・駅の前
  const before = (s.busStops ?? []).length, tiles = [];
  const res = s.buildings.filter(b => b.hh && b.acc >= 0).sort((a, b) => (Math.abs(a.x - cx) + Math.abs(a.y - cy)) - (Math.abs(b.x - cx) + Math.abs(b.y - cy)));
  for (const b of res) { if (tiles.length >= 14) break; if (tiles.some(t => Math.abs(t % W - b.acc % W) + Math.abs(((t / W) | 0) - ((b.acc / W) | 0)) < 6)) continue; tiles.push(b.acc); }
  for (const b of s.buildings) if ((b.kind === 'supermarket' || b.kind === 'station') && b.acc >= 0 && !tiles.includes(b.acc)) tiles.push(b.acc);
  s.cash = Math.max(s.cash, 1e6); const r = before < 3 ? g.act({ type: 'busStop', tiles, on: true }) : { ok: true, msg: 'あり' };
  const ctr = b => b ? (b.y + Math.floor(b.h / 2)) * W + b.x + Math.floor(b.w / 2) : -1;
  return { pop: Math.round(s.stats.pop), care: ctr(care), careId: care?.id, careKind: care?.kind, park: ctr(park), parkId: park?.id, parkKind: park?.kind, st: ctr(st), stId: st?.id, stAcc: st?.acc, stX: st?.x, stY: st?.y, stops: (s.busStops ?? []).length, act: r.ok }; });
console.log(JSON.stringify(info));
const sim = sec => page.evaluate(sec => { const v = window.__sumu.view, s = window.__sumu.game.state; for (let t = 0; t < sec; t += 0.1) { v.lifeT += 0.1; v.updateCamera(0.1); v.moveAgents(s, 0.1); } }, sec);
const at = (hour, tile, d, pitch = 0.7, yaw = 0.7) => page.evaluate(([h, t, d, p, y]) => { const v = window.__sumu.view; v.hour = h; v.holiday = false; v.applyTime?.(); v.focus(t, d); v.pitch = p; v.yaw = y; v.want.yaw = y; v.want.pitch = p; v.want.dist = d; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = d; v.agentSpawnAt.x = -1e9; v.spawnAgents(); }, [hour, tile, d, pitch, yaw]);
const shoot = async name => { await page.evaluate(() => { const v = window.__sumu.view; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05); v.renderer.render(v.scene, v.camera); });
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.jpg`, type: 'jpeg', quality: 80 }); console.log('shot', name); };
/** 画面の住民（精細な人の用事の内訳、一人で歩く未就学児、いっしょに歩く人、遠くの簡略な人） */
const count = label => page.evaluate(label => { const v = window.__sumu.view, r = v.resInfo, why = {}; let alonePre = 0, fol = 0, lead = 0;
  for (const a of v.peds) { const t = a.rt; if (!t) continue; why[t.why] = (why[t.why] ?? 0) + 1; if (a.ldA) fol++; else if (t.with?.length) lead++; if (t.role === 0 && !a.ldA && t.mode !== 2) alonePre++; }
  const planPre = (v.resPlan?.trips ?? []).filter(t => t.role === 0 && t.mode !== 2).length;
  return { label, visible: r.visible, drawn: r.drawn, farBy: r.farBy, alonePre, planPre, lead, fol, why: Object.entries(why).sort((a, b) => b[1] - a[1]).slice(0, 10), bus: v.busInfo, st: v.stInfo?.().slice(0, 1) }; }, label);
if (WHAT.includes('care') && info.care >= 0) { await at(8, info.care, Number(process.env.CD ?? 45), 0.6, Number(process.env.CY ?? 0.5)); await sim(4); console.log(JSON.stringify({ ...(await count('care8')), occ: await page.evaluate(id => window.__sumu.view.occOf?.(id), info.careId) })); await shoot('care-8am'); }
if (WHAT.includes('bus')) {
  const stops = await page.evaluate(() => { const v = window.__sumu.view; v.hour = 8; return v.busStopsNow ? v.busStopsNow().sort((a, b) => b[1] - a[1]) : (window.__sumu.game.state.busStops ?? []).map(t => [t, -1]); });
  console.log('stops8', JSON.stringify(stops.slice(0, 8)));
  console.log('待つ人（時刻・合計・いちばん多いバス停）', JSON.stringify(await page.evaluate(() => { const v = window.__sumu.view, out = []; if (!v.busStopsNow) return out; for (const h of [6.5, 6.75, 7, 7.25, 7.5, 7.75, 8, 8.25, 8.5, 9, 12, 17, 17.5, 18, 18.5]) { v.hour = h; const l = v.busStopsNow(); out.push([h, l.reduce((a, q) => a + q[1], 0), Math.max(0, ...l.map(q => q[1]))]); } v.hour = 8; return out; })));
  const t = stops[0]?.[0]; if (t !== undefined) { await at(8, t, Number(process.env.BD ?? 32), 0.6, Number(process.env.BY ?? 0.4)); await sim(1.5); console.log(JSON.stringify(await page.evaluate(t => { const v = window.__sumu.view, s = window.__sumu.game.state; return v.stopGeoOf ? { geo: v.stopGeoOf(s, t), wait: v.busStopsNow().find(x => x[0] === t), peds: v.crowdP.mesh.count } : null; }, t))); console.log(JSON.stringify(await count('bus8'))); await shoot('busstop-8am'); }
  // 待つ人がいちばん多い時刻（7 時 45 分）の、いちばん多いバス停も
  const s2 = await page.evaluate(() => { const v = window.__sumu.view; v.hour = 7.75; return v.busStopsNow ? v.busStopsNow().sort((a, b) => b[1] - a[1]) : []; });
  if (s2[0]) { await at(7.75, s2[0][0], Number(process.env.BD ?? 32), 0.6, Number(process.env.BY ?? 0.4)); await sim(1.5); console.log(JSON.stringify({ stop745: s2[0], ...(await count('bus745')) })); await shoot('busstop-0745'); }
}
for (const [w, h] of [['park10', 10], ['park16', 16]]) if (WHAT.includes(w) && info.park >= 0) { await at(h, info.park, Number(process.env.PD ?? 55), 0.75, 0.7); await sim(3); console.log(JSON.stringify({ ...(await count(w)), occ: await page.evaluate(id => window.__sumu.view.occOf?.(id), info.parkId) })); await shoot(`park-weekday-${h}h`); }
if (WHAT.includes('station') && info.st >= 0) {
  console.log('駅の 1 時間あたりの乗車（住民。時刻ごと）', JSON.stringify(await page.evaluate(id => { const v = window.__sumu.view, s = window.__sumu.game.state, out = []; for (const h of [6.5, 7, 7.25, 7.5, 7.75, 8, 8.25, 8.5, 9]) { v.hour = h; v.stRK = ''; v.stCrowdRes(s); out.push([h, v.stRNow.get(id) ?? 0]); } return out; }, info.stId)));
  await at(8, info.st, Number(process.env.SD ?? 190), 0.95, 0.6); await sim(6);
  // 駅へ向かう歩く人：住民の移動（見える範囲）の位置と、画面に描いた人（精細＋遠くの簡略）の位置を、駅からの距離（区画）で数える
  const ring = await page.evaluate(([sx, sy, sid, sacc]) => { const v = window.__sumu.view, W = window.__sumu.W, d = t => Math.abs(t % W - sx) + Math.abs(((t / W) | 0) - sy), bin = t => { const k = d(t); return k < 4 ? 0 : k < 9 ? 1 : k < 17 ? 2 : 3; };
    const truth = [0, 0, 0, 0], fine = [0, 0, 0, 0], far = [0, 0, 0, 0];
    for (const t of v.resPlan?.trips ?? []) { if (t.dest !== sid || t.mode !== 0) continue; const q = t.prog, at = t.path?.length ? t.path[Math.min(t.path.length - 1, Math.floor(q * t.path.length))] : Math.round(t.from % W + (t.to % W - t.from % W) * q) + W * Math.round(((t.from / W) | 0) + (((t.to / W) | 0) - ((t.from / W) | 0)) * q); truth[bin(at)]++; }
    for (const a of v.peds) if (a.rt && a.rt.dest === sid) fine[bin(a.cur)]++;
    for (const m of v.far.movers) if (m.mode === 0 && m.goal === sacc) far[bin(m.cur)]++;
    return { truth, fine, far, stDrawn: v.stDrawn }; }, [info.stX, info.stY, info.stId, info.stAcc]);
  console.log(JSON.stringify({ ...(await count('station8')), ring })); await shoot('station-approach-8am');
  await at(8, info.st, 120, 0.75, 0.6); await sim(4); await shoot('station-near-8am');
}
console.log('errors', errors.filter(e => !e.includes('TUNNEL') && !e.includes('404')).slice(0, 5)); await browser.close();
