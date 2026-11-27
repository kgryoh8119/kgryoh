// v101：道路の標示と歩道・信号の置き方・踏切・バス停を、v100 の「交差点が続く立体交差」の場面で撮る（v100-shots.mjs を手本に）。
//   PRE=after node scripts/v101-shots.mjs                 … dist を撮る
//   DIST=dist-before PRE=before node scripts/v101-shots.mjs … 直す前の版で同じ場面
//   VIEWS=fly,top,minor,cross,bus（撮る場面）、Q=mid|high|low
import { open } from './shot.mjs';
import fs from 'fs';
const PRE = process.env.PRE ?? 'after', OUT = process.env.OUT ?? 'docs/shots/v101';
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1000, 640);
page.setDefaultTimeout(900000);
await page.evaluate(q => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality(q); S.fixedQuality = true; }, process.env.Q ?? 'mid');
const draw = (n = 1) => page.evaluate(n => { const v = window.__sumu.view; for (let k = 0; k < n; k++) v.__frame.call(v, 0.25); }, n);
const info = await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state, W = S.W, H = s.road.length / W, v = S.view;
  g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 5e7;
  for (const q of ['#modal', '#panel', '#info', '#tutorial', '#side']) { const e = document.querySelector(q); if (e) e.style.display = 'none'; }
  const idx = (x, y) => y * W + x, out = {}, m = v.map, free = i => !s.occ[i] && !s.road[i] && !s.rail?.[i] && !m.water[i];
  let at = null;
  for (let y = 4; y < H - 18 && !at; y++) for (let x = 4; x < W - 30 && !at; x++) { let ok = true; for (let yy = y - 1; yy <= y + 14 && ok; yy++) for (let xx = x - 1; xx <= x + 26 && ok; xx++) if (!free(idx(xx, yy))) ok = false; if (ok) at = [x, y]; }
  if (at) { const [X, Y] = at, put = (i, r) => { s.road[i] = r; s.roadAge[i] = 0; s.zone[i] = 0; };
    for (let x = X; x <= X + 22; x++) put(idx(x, Y + 6), 2);
    for (const [c, r] of [[5, 2], [8, 2], [9, 1], [10, 2], [11, 3], [17, 2]]) for (let y = Y; y <= Y + 12; y++) if (y !== Y + 6) put(idx(X + c, y), r);
    s.flyover = [idx(X + 5, Y + 6), idx(X + 11, Y + 6), idx(X + 17, Y + 6)];
    // バス停：交差点の隣の直線の区画と、交差点そのもの（置き場所の確かめ）
    s.busStops = [...(s.busStops ?? []), idx(X + 14, Y + 6), idx(X + 9, Y + 9)];
    s.roadVersion++;
    out.fly = idx(X + 9, Y + 6); out.top = idx(X + 9, Y + 6); out.minor = idx(X + 9, Y + 6); out.bus = idx(X + 14, Y + 6); }
  // 踏切（v86-road.mjs と同じ作り方）
  const st = s.buildings.find(b => b.kind === 'station'), sc = st ? [st.x + 1, st.y + 1] : [W / 2, H / 2], dist = i => Math.hypot(i % W - sc[0], (i / W | 0) - sc[1]);
  if (s.rail && !s.rail.some((r, i) => r && s.road[i] && !(s.railGrade && s.railGrade[i]))) {
    const c = [...s.rail.keys()].filter(i => s.rail[i] && !(s.railGrade && s.railGrade[i]) && s.rail[i - 1] && s.rail[i + 1] && !s.rail[i - W] && !s.rail[i + W] && dist(i) > 8 && [-2, -1, 1, 2].every(k => { const j = i + k * W, jx = j % W, jy = j / W | 0; return !s.rail[j] && !s.buildings.some(b => jx >= b.x && jx < b.x + b.w && jy >= b.y && jy < b.y + b.h); })).sort((a, b) => dist(a) - dist(b))[0];
    if (c !== undefined) { for (let k = -2; k <= 2; k++) { const j = c + k * W; s.road[j] = 2; s.roadAge[j] = 30; s.zone[j] = 0; } s.roadVersion++; }
  }
  out.cross = s.rail ? [...s.rail.keys()].filter(i => s.rail[i] && s.road[i] && !(s.railGrade && s.railGrade[i])).sort((a, b) => dist(a) - dist(b))[0] : undefined;
  for (const b of s.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; }
  s.bVersion++; S.ui.refresh?.();
  return out;
});
console.log(JSON.stringify(info));
const shot = async (name, tile, d, pitch, yaw) => {
  if (tile === undefined) return;
  await page.evaluate(([t, d, p, yw]) => { const v = window.__sumu.view; v.hour = 10.5; v.clockRun = false; v.weatherForce = 'clear'; v.focus(t, d); if (p) v.want.pitch = p; if (yw !== undefined) v.want.yaw = yw; }, [tile, d, pitch, yaw]);
  await draw(Number(process.env.FR ?? 14)); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${PRE}-${name}.jpg`, type: 'jpeg', quality: 72, timeout: 900000 });
};
const V = { fly: ['fly', 120, 0.22, 0.5], top: ['top', 75, 1.25, 0], minor: ['minor', 45, 0.45, 2.2], cross: ['cross', 55, 0.45, 0.9], bus: ['bus', 50, 0.45, 0.4] };
for (const k of (process.env.VIEWS ?? 'fly,top,minor,cross,bus').split(',')) { const [key, d, p, yw] = V[k]; await shot(k, info[key], d, p, yw); }
console.log(errors.filter(e => !e.includes('404')).slice(0, 5));
await browser.close();
