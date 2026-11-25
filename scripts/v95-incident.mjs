// v95：歩行者が車道に出ていないかの検査と、事故・取り締まりの連鎖を撮る。
//   node scripts/v95-incident.mjs                       … dist（PRE=after）
//   DIST=<古い dist> PRE=before ONLY=peds node scripts/v95-incident.mjs … 直す前の版で歩行者の検査だけ
// 場面：v94-junction.mjs と同じく空き地に幹線の格子と立体交差を書き込む（立体交差の前後の幹線は 6 車線の幅に広がる＝作者の見た「4 車線の車道の真ん中を歩く人」の場所）
import { open } from './shot.mjs';
import fs from 'fs';
const PRE = process.env.PRE ?? 'after', OUT = process.env.OUT ?? 'docs/shots/v95-incident', ONLY = process.env.ONLY ?? '';
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1100, 700);
await page.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('mid'); S.fixedQuality = true; });
const draw = (n = 1) => page.evaluate(n => { const v = window.__sumu.view; for (let k = 0; k < n; k++) v.__frame.call(v, 0.25); }, n);
// 絵を描かずに車と人だけ進める（速い）
const sim = (sec) => page.evaluate(sec => { const v = window.__sumu.view, s = window.__sumu.game.state; for (let t = 0; t < sec; t += 0.1) { v.lifeT += 0.1; v.moveAgents(s, 0.1); } }, sec);
const info = await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state, W = S.W, H = s.road.length / W;
  g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 5e7;
  const idx = (x, y) => y * W + x, free = i => !s.occ[i] && !s.road[i] && !s.rail?.[i];
  const rect = (x0, y0, w, h) => { const t = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t.push(idx(x, y)); return t; };
  let at = null;
  for (let y = 4; y < H - 20 && !at; y++) for (let x = 4; x < W - 26; x++) if (rect(x - 1, y - 1, 21, 16).every(free)) { at = [x, y]; break; }
  if (!at) return { err: 'no space' };
  const [X, Y] = at, put = (i, r) => { s.road[i] = r; s.roadAge[i] = 0; s.zone[i] = 0; };
  for (let x = X; x <= X + 16; x++) put(idx(x, Y + 4), 2);
  for (const c of [X + 5, X + 14, X + 16]) for (let y = Y; y <= Y + 13; y++) put(idx(c, y), 2);
  s.flyover = [idx(X + 5, Y + 4), idx(X + 14, Y + 4)];
  s.roadVersion++; s.bVersion++; S.ui.refresh?.();
  for (const q of ['#modal', '#panel', '#info', '#tutorial', '#side']) { const e = document.querySelector(q); if (e) e.style.display = 'none'; }
  return { X, Y, W };
});
console.log(JSON.stringify(info));
const look = async (tile, d, pitch, yaw) => page.evaluate(([t, d, p, yw]) => { const v = window.__sumu.view; v.hour = 8.2; v.clockRun = false; v.weatherForce = 'clear'; v.focus(t, d); v.want.pitch = p; v.want.yaw = yw; v.target.x = v.want.x; v.target.z = v.want.z; }, [tile, d, pitch, yaw]);
const shot = async (name) => { await draw(Number(process.env.FR ?? 6)); await page.screenshot({ path: `${OUT}/${PRE}-${name}.jpg`, type: 'jpeg', quality: 70, timeout: 240000 }); };
const { X, Y, W } = info, T = (x, y) => y * W + x;
// 1) 歩行者の検査：区画の中（交差点を除く）で、描いた車道の半幅より内側にいる人を数える（立体交差の前後の広い幹線を見る）
await look(T(X + 9, Y + 4), 200, 0.8, 0.6); await draw(2);
for (let k = 0; k < 3; k++) {
  await sim(20);
  const r = await page.evaluate(() => {
    const v = window.__sumu.view, s = window.__sumu.game.state, W = window.__sumu.W, HW = [0, 2.5, 5, 7.5], m = new (v.camera.matrix.constructor)(), out = { peds: 0, onRoad: 0, onWide: 0, wideSeen: 0, ex: [] };
    const deg = i => [i - 1, i + 1, i - W, i + W].filter(j => j >= 0 && j < s.road.length && s.road[j]).length;
    v.peds.forEach((a, i) => { if (a.enter !== undefined || a.exit !== undefined) return; v.pedP.mesh.getMatrixAt(i, m); const x = m.elements[12], z = m.elements[14], tx = Math.floor(x / 30), tz = Math.floor(z / 30), t = tz * W + tx; out.peds++;
      if (!s.road[t] || deg(t) >= 3) return; const ew = (s.road[t - 1] || s.road[t + 1]) && !(s.road[t - W] || s.road[t + W]), ns = (s.road[t - W] || s.road[t + W]) && !(s.road[t - 1] || s.road[t + 1]); if (!ew && !ns) return;
      const wide = s.road[t] === 2 && v.wideSet.has(t), hw = wide ? 7.5 : HW[s.road[t]], lat = Math.abs(ew ? z - (tz + 0.5) * 30 : x - (tx + 0.5) * 30); if (wide) out.wideSeen++;
      if (lat < hw - 0.3) { out.onRoad++; if (wide) out.onWide++; if (out.ex.length < 3) out.ex.push({ t, lat: +lat.toFixed(2), hw, lead: a.lead !== undefined }); } });
    return out;
  });
  console.log('peds', JSON.stringify(r));
}
await look(T(X + 9, Y + 4), 60, 0.55, 0.3); await shot('peds-wide');
if (ONLY !== 'peds') {
  // 2) 事故の連鎖：追突 → パトカー・救急車・レッカー。歩行者 → 救急車。建物火災 → 消防車。スピード違反 → 白バイ。駐車違反 → 標章
  const run = async (sub, name, wait, tile) => {
    if (tile !== undefined) { await look(tile, 120, 0.7, 0.5); await sim(3); }
    const ok = await page.evaluate(sub => { const v = window.__sumu.view; v.incAuto = false; return v.startIncident(sub); }, sub);
    await sim(1);
    const where = await page.evaluate(() => { const v = window.__sumu.view, q = v.incs[v.incs.length - 1]; return q ? { tile: q.tile, x: q.x, z: q.z } : null; });
    if (!ok || !where) { console.log(sub, 'not started'); return; }
    await sim(wait);
    const st = await page.evaluate(() => { const v = window.__sumu.view; return { inc: v.incInfo(), ems: v.ems.map(a => [a.vm, a.em.at ? 'at' : a.em.lit ? 'go' : 'back']), feed: [...document.querySelectorAll('#incfeed button')].map(b => b.textContent) }; });
    console.log(sub, JSON.stringify(st));
    await page.evaluate(([x, z]) => { const v = window.__sumu.view; v.want.x = x; v.want.z = z; v.target.x = x; v.target.z = z; v.want.dist = 70; v.want.pitch = 0.6; }, [where.x, where.z]);
    await shot(name);
  };
  const cityT = await page.evaluate(() => { const s = window.__sumu.game.state, W = window.__sumu.W; const b = s.buildings.filter(b => b.status === 'operating' && b.hh).sort((a, b) => b.hh - a.hh)[0]; return b ? b.y * W + b.x : 0; });
  const W2 = (process.env.SUBS ?? 'rear:crash:40,ped:pedestrian:30,bldFire:fire:45,speed:speed:30,parking:parking:40').split(',');
  for (const w of W2) { const [a, b, c] = w.split(':'); await run(a, b, Number(c), cityT); }
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL') && !e.includes('404')).slice(0, 5));
await browser.close();
