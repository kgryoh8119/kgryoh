// v18：地形の造作・6 車線・立体交差・曲がり角・複々線・掘割を撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
const info = await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state, W = 76, H = 68;
  g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 5e7;
  const out = {}, idx = (x, y) => y * W + x;
  const free = i => !s.occ[i] && !s.road[i] && !s.rail?.[i];
  const rect = (x0, y0, w, h) => { const t = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t.push(idx(x, y)); return t; };
  // 空き地の大きな固まりを探す（12×10）
  let at = null;
  for (let y = 3; y < H - 16 && !at; y++) for (let x = 2; x < W - 14; x++) if (rect(x, y, 12, 10).every(free)) { at = [x, y]; break; }
  out.at = at;
  if (at) {
    const [x, y] = at;
    out.mountain = g.act({ type: 'terra', tiles: rect(x, y, 5, 5), op: 'mountain' }).msg;
    out.lake = g.act({ type: 'terra', tiles: [...rect(x + 6, y, 6, 6)].filter(i => !(i % W >= x + 8 && i % W <= x + 9 && ((i / W) | 0) >= y + 2 && ((i / W) | 0) <= y + 3)), op: 'water' }).msg; // 真ん中を残して島に
    out.sand = g.act({ type: 'terra', tiles: rect(x + 6, y + 6, 6, 1), op: 'sand' }).msg;
    out.wet = g.act({ type: 'terra', tiles: rect(x, y + 6, 5, 3), op: 'wet' }).msg;
    out.forest = g.act({ type: 'terra', tiles: rect(x + 6, y + 7, 6, 3), op: 'forest' }).msg;
  }
  // 6 車線と立体交差
  const arts = []; for (let i = 0; i < W * H; i++) if (s.road[i] === 2) arts.push(i);
  out.widen = g.act({ type: 'widen', tiles: arts.slice(0, 40), on: true }).msg;
  let j = -1; for (let i = 0; i < W * H && j < 0; i++) { const x = i % W, y = (i / W) | 0; if (x < 1 || y < 1 || x > W - 2 || y > H - 2 || s.rail?.[i]) continue; const n = [[1,0],[-1,0],[0,1],[0,-1]].filter(([a, b]) => s.road[idx(x + a, y + b)] >= 2).length; if (s.road[i] >= 2 && n >= 3) j = i; }
  out.fly = g.act({ type: 'flyover', tiles: [j] }).msg; out.flyAt = j;
  // 線路：複々線と掘割
  const rails = []; for (let i = 0; i < W * H; i++) if (s.rail?.[i]) rails.push(i);
  rails.sort((a, b) => a - b);
  out.rail3 = g.act({ type: 'rail', tiles: rails.filter(i => i % W >= 20 && i % W < 40), level: 3 }).msg;
  out.cut = g.act({ type: 'railgrade', tiles: rails.filter(i => i % W >= 46 && i % W < 60 && !s.road[i]), grade: 3 }).msg;
  out.rail3At = rails.find(i => i % W === 30); out.cutAt = rails.find(i => i % W === 53);
  // 曲がり角：生活道路を L 字に引く
  { let c = null; for (let y = 20; y < 50 && !c; y++) for (let x = 5; x < 60; x++) { const t = []; for (let k = 0; k < 5; k++) t.push(idx(x + k, y)); for (let k = 1; k < 5; k++) t.push(idx(x + 4, y + k)); if (t.every(free) && [idx(x - 1, y)].some(i => s.road[i])) { c = [x, y]; break; } }
    if (c) { const [x, y] = c; const t = []; for (let k = 0; k < 5; k++) t.push(idx(x + k, y)); for (let k = 1; k < 5; k++) t.push(idx(x + 4, y + k)); out.bend = g.act({ type: 'road', tiles: t, road: 1 }).msg; out.bendAt = idx(x + 4, y); } }
  for (const b of s.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; }
  s.bVersion++; S.ui.refresh();
  return out;
});
console.log(JSON.stringify(info, null, 1));
const shot = async (name, tile, d, pitch) => { await page.evaluate(([t, d, p]) => { const v = window.__sumu.view; v.hour = 10.5; v.clockRun = false; v.weatherForce = 'clear'; v.focus(t, d); if (p) { v.want.pitch = p; v.want.yaw = 0; } }, [tile, d, pitch]); await page.waitForTimeout(2800); await page.screenshot({ path: `shots/v18-${name}.png` }); };
const W = 76;
if (info.at) { await shot('terrain', (info.at[1] + 5) * W + info.at[0] + 6, 520); await shot('terrain2', (info.at[1] + 3) * W + info.at[0] + 9, 260); }
if (info.flyAt >= 0) await shot('flyover', info.flyAt, 170);
if (info.bendAt) await shot('curves', info.bendAt, 120);
if (info.rail3At !== undefined) await shot('rail3', info.rail3At + W, 130, 1.25);
if (info.cutAt !== undefined) await shot('cut', info.cutAt + W, 110, 1.0);
// 地形の道具の欄
await page.evaluate(() => { const u = window.__sumu.ui; u.group = 'terra'; u.renderTools(); });
await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v18-tools.png' });
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
