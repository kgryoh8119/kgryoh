// v100：構造の点検の場面を撮る（v95-pier.mjs を手本に）。
//   PRE=after node scripts/v100-shots.mjs                       … dist を撮る（住野市：立体交差・川の橋・斜面の建物）
//   MAPID=hodogaya-d node scripts/v100-shots.mjs                … 保土ケ谷：鉄道の高架が道路を横切る所
//   DIST=<古い版の dist> PRE=before …                            … 直す前の版で同じ場面
import { open } from './shot.mjs';
import fs from 'fs';
const PRE = process.env.PRE ?? 'after', OUT = process.env.OUT ?? 'docs/shots/v100', REAL = (process.env.MAPID ?? '').startsWith('hodogaya');
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1000, 640);
page.setDefaultTimeout(600000);
await page.evaluate(q => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality(q); S.fixedQuality = true; }, process.env.Q ?? 'mid');
const draw = (n = 1) => page.evaluate(n => { const v = window.__sumu.view; for (let k = 0; k < n; k++) v.__frame.call(v, 0.25); }, n);
const info = await page.evaluate(REAL => {
  const S = window.__sumu, g = S.game, s = g.state, W = S.W, H = s.road.length / W, v = S.view;
  g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 5e7;
  for (const q of ['#modal', '#panel', '#info', '#tutorial', '#side']) { const e = document.querySelector(q); if (e) e.style.display = 'none'; }
  const idx = (x, y) => y * W + x, out = {};
  if (!REAL) {
    const m = v.map, free = i => !s.occ[i] && !s.road[i] && !s.rail?.[i] && !m.water[i];
    let at = null;
    for (let y = 4; y < H - 18 && !at; y++) for (let x = 4; x < W - 30 && !at; x++) { let ok = true; for (let yy = y - 1; yy <= y + 14 && ok; yy++) for (let xx = x - 1; xx <= x + 26 && ok; xx++) if (!free(idx(xx, yy))) ok = false; if (ok) at = [x, y]; }
    if (at) { const [X, Y] = at, put = (i, r) => { s.road[i] = r; s.roadAge[i] = 0; s.zone[i] = 0; };
      for (let x = X; x <= X + 22; x++) put(idx(x, Y + 6), 2);
      for (const [c, r] of [[5, 2], [8, 2], [9, 1], [10, 2], [11, 3], [17, 2]]) for (let y = Y; y <= Y + 12; y++) if (y !== Y + 6) put(idx(X + c, y), r);
      s.flyover = [idx(X + 5, Y + 6), idx(X + 11, Y + 6), idx(X + 17, Y + 6)]; s.roadVersion++;
      out.fly = idx(X + 9, Y + 6); out.fly2 = idx(X + 3, Y + 6); }
    // 川の橋（水の上の道路の区画）
    for (let i = 0; i < W * H && out.bridge === undefined; i++) if (s.road[i] && m.water[i] && !s.rail?.[i]) out.bridge = i;
    // 斜面の建物（敷地の高低差がいちばん大きい家）
    let best = 0; if (v.lotLow) for (const b of s.buildings) { if (b.status !== 'operating') continue; const p = v.place(s, b), d = p.y - v.lotLow(b); if (d > best && b.w === 1) { best = d; out.slope = idx(b.x, b.y); out.drop = d; } }
  } else {
    // 高架の線路が道路と交わる区画
    for (let i = 0; i < W * H && out.rail === undefined; i++) if (s.rail?.[i] && s.railGrade?.[i] === 1 && s.road[i] >= 2) out.rail = i;
  }
  for (const b of s.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; }
  s.bVersion++; S.ui.refresh?.();
  return out;
}, REAL);
if (process.env.SLOPE) info.slope = Number(process.env.SLOPE);
console.log(JSON.stringify(info));
const shot = async (name, tile, d, pitch, yaw) => {
  if (tile === undefined) return;
  await page.evaluate(([t, d, p, yw]) => { const v = window.__sumu.view; v.hour = 10.5; v.clockRun = false; v.weatherForce = 'clear'; v.focus(t, d); if (p) v.want.pitch = p; if (yw !== undefined) v.want.yaw = yw; }, [tile, d, pitch, yaw]);
  await draw(Number(process.env.FR ?? 14)); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${PRE}-${name}.jpg`, type: 'jpeg', quality: 72, timeout: 600000 });
};
if (!REAL) {
  await shot('fly-junctions', info.fly, 120, 0.22, 0.5);
  await shot('fly-ramp', info.fly2, 70, 0.2, 1.2);
  await shot('bridge', info.bridge, 90, 0.25, 0.8);
  await shot('slope', info.slope, 45, 0.25, 0.6);
} else await shot('rail', info.rail, 90, 0.3, 0.7);
console.log(errors.filter(e => !e.includes('404')).slice(0, 5));
await browser.close();
