// v86：道路と線路の見た目を同じ視点で撮る（NAME=出力名の頭、VIEWS=撮る番号、Q=品質）
// 0 幹線の十字路の近景・1 幹線の直線・2 生活道路の交差点・3 踏切の近景・4 線路（複線・架線）の近景・5 駅のホームの端・6 中景の俯瞰
import { open } from './shot.mjs';
const { browser, page, errors } = await open(+(process.env.VW ?? 960), +(process.env.VH ?? 600), process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(2400000); await page.waitForTimeout(1500);
const info = await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state, v = S.view, W = S.W; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality(q); g.speed = 0;
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh();
  const H = s.road.length / W, R = (x, y) => x >= 0 && y >= 0 && x < W && y < H ? s.road[y * W + x] : 0, rl = (i) => s.rail && s.rail[i];
  const nb = (i) => { const x = i % W, y = i / W | 0; return [R(x + 1, y), R(x - 1, y), R(x, y + 1), R(x, y - 1)]; };
  const st = s.buildings.find(b => b.kind === 'station'), sc = st ? [st.x + 1, st.y + 1] : [W / 2, H / 2], dist = (i) => Math.hypot(i % W - sc[0], (i / W | 0) - sc[1]);
  const all = [...s.road.keys()].filter(i => s.road[i] && !rl(i)).sort((a, b) => dist(a) - dist(b));
  const bigX = all.find(i => s.road[i] >= 2 && nb(i).filter(r => r).length === 4 && nb(i).filter(r => r >= 2).length >= 2) ?? all.find(i => nb(i).filter(r => r).length >= 3 && s.road[i] >= 2);
  const art = all.find(i => s.road[i] === 3 && nb(i).filter(r => r).length === 2) ?? all.find(i => s.road[i] >= 2 && nb(i).filter(r => r).length === 2);
  const small = all.find(i => s.road[i] === 1 && nb(i).filter(r => r).length >= 3 && nb(i).every(r => r <= 1));
  // 踏切が無い地図では、駅から離れた地上の直線の線路に、横切る道路（2 車線）を 5 区画だけ引く（検査のために状態を直接書き換える。前後で同じ）
  if (s.rail && !s.rail.some((r, i) => r && s.road[i] && !(s.railGrade && s.railGrade[i]))) {
    const c = [...s.rail.keys()].filter(i => s.rail[i] && !(s.railGrade && s.railGrade[i]) && s.rail[i - 1] && s.rail[i + 1] && !s.rail[i - W] && !s.rail[i + W] && dist(i) > 8 && [-2, -1, 1, 2].every(k => { const j = i + k * W, jx = j % W, jy = j / W | 0; return !s.rail[j] && !s.buildings.some(b => jx >= b.x && jx < b.x + b.w && jy >= b.y && jy < b.y + b.h); })).sort((a, b) => dist(a) - dist(b))[0];
    if (c !== undefined) { for (let k = -2; k <= 2; k++) { const j = c + k * W; s.road[j] = 2; s.roadAge[j] = 30; s.zone[j] = 0; } s.roadVersion++; }
  }
  const cross = s.rail ? [...s.rail.keys()].filter(i => s.rail[i] && s.road[i] && !(s.railGrade && s.railGrade[i])).sort((a, b) => dist(a) - dist(b))[0] : undefined;
  const track = s.rail ? [...s.rail.keys()].filter(i => s.rail[i] && !s.road[i] && !(s.railGrade && s.railGrade[i]) && dist(i) > 6).sort((a, b) => dist(a) - dist(b))[0] : undefined;
  return { W, bigX, art, small, cross, track, st: st ? (st.y + 1) * W + st.x + 1 : undefined, stats: v.stats };
}, process.env.Q ?? 'high');
console.log(JSON.stringify(info));
await page.waitForTimeout(6000);
const V = [[info.bigX, 60, 0.5, 0.7], [info.art, 110, 0.32, 1.9], [info.small, 45, 0.55, 2.4], [info.cross, 55, 0.45, 0.9], [info.track, 50, 0.35, 1.3], [info.st, 120, 0.45, 2.8], [info.bigX, 260, 0.75, 0.6]];
for (const k of (process.env.VIEWS ?? '0,1,2,3,4,5,6').split(',').map(Number)) { const [t, d, p, yaw] = V[k]; if (t === undefined) { console.log('skip', k); continue; }
  await page.evaluate(([t, d, p, yaw]) => { const v = window.__sumu.view; v.focus(t, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [t, d, p, yaw]);
  await page.waitForTimeout(3000); await page.screenshot({ path: `shots/${process.env.NAME ?? 'road'}-${k}.png` }); }
console.log(JSON.stringify(await page.evaluate(() => window.__sumu.view.stats)), errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
