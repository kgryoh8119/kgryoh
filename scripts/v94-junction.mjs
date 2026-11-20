// v94：立体交差・陸橋のつなぎ目を撮る。空き地に幹線の格子を直接書き込み、作者の見た「立体でぶつかる」場面を作る。
//   node scripts/v94-junction.mjs           … dist を撮る（PRE=after）
//   DIST=<古い版の dist> PRE=before node scripts/v94-junction.mjs … 直す前の版で同じ場面を撮る
// 場面（空き地の左上を (X, Y) として）：
//   ・横の幹線（行 Y+4、X〜X+16 で終わる）に、縦の幹線（列 X+5・X+14・X+16）が交わる。X+16 は T 字。
//   ・列 X+7 から生活道路が横の幹線へ出る（X+5 の立体交差の坂の途中に脇道がある）。
//   ・立体交差を (X+5,Y+4)・(X+14,Y+4)・(X+16,Y+4) に置く（直す前は X+14 の東西の高架の坂が X+16 の南北の高架とぶつかる）。
//   ・踏切の陸橋：既存の踏切のうち 1 か所を陸橋にし、隣に脇道を足す（直す前は脇道から 25% の坂へ跳ぶ）。
import { open } from './shot.mjs';
import fs from 'fs';
const PRE = process.env.PRE ?? 'after', OUT = process.env.OUT ?? 'docs/shots/v94';
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1280, 800);
await page.evaluate(q => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality(q); S.fixedQuality = true; }, process.env.Q ?? 'mid');
const draw = (n = 1) => page.evaluate(n => { const v = window.__sumu.view; for (let k = 0; k < n; k++) v.__frame.call(v, 0.25); }, n);
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
  for (let y = Y + 5; y <= Y + 9; y++) put(idx(X + 7, y), 1);
  s.flyover = [idx(X + 5, Y + 4), idx(X + 14, Y + 4), idx(X + 16, Y + 4)];
  // 陸橋：踏切を探して陸橋にし、隣の区画に脇道を足す
  let ov = -1;
  for (let i = 0; i < W * H && ov < 0; i++) { const x = i % W, y = (i / W) | 0; if (s.road[i] && s.rail?.[i] && !s.railGrade?.[i] && s.road[idx(x, y - 1)] && s.road[idx(x, y + 1)] && !s.rail[idx(x, y - 1)] && !s.occ[idx(x + 1, y - 1)] && !s.road[idx(x + 1, y - 1)] && !s.rail[idx(x + 1, y - 1)]) ov = i; }
  if (ov >= 0) { const x = ov % W, y = (ov / W) | 0; s.overpass = [...new Set([...(s.overpass ?? []), ov])]; put(idx(x + 1, y - 1), 1); }
  s.roadVersion++;
  for (const b of s.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; }
  s.bVersion++; S.ui.refresh?.();
  for (const q of ['#modal', '#panel', '#info', '#tutorial']) { const e = document.querySelector(q); if (e) e.style.display = 'none'; }
  return { X, Y, W, ov, fly: s.flyover };
});
console.log(JSON.stringify(info));
const shot = async (name, tile, d, pitch, yaw) => {
  await page.evaluate(([t, d, p, yw]) => { const v = window.__sumu.view; v.hour = 10.5; v.clockRun = false; v.weatherForce = 'clear'; v.focus(t, d); if (p) v.want.pitch = p; if (yw !== undefined) v.want.yaw = yw; }, [tile, d, pitch, yaw]);
  await draw(Number(process.env.FR ?? 14)); await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${PRE}-${name}.jpg`, type: 'jpeg', quality: 72 });
};
if (!info.err) {
  const { X, Y, W } = info, T = (x, y) => y * W + x;
  await shot('fly-all', T(X + 10, Y + 5), 330, 0.95, 0.5);
  await shot('fly-cross', T(X + 15, Y + 4), 140, 0.7, 0.9);
  await shot('fly-side', T(X + 6, Y + 5), 140, 0.7, -0.6);
  if (info.ov >= 0) await shot('overpass', info.ov, 150, 0.75, 0.7);
  // 車の検査：高架の上の車（dk>=0）が高架の向きにまっすぐ走っているか、高架の下の車の高さは地面か
  const chk = await page.evaluate(() => {
    const v = window.__sumu.view, s = window.__sumu.game.state, W = window.__sumu.W, out = { deck: 0, ground: 0, badTurn: 0 };
    for (const a of v.agents ?? v.cars ?? []) { const dk = a.dk ?? -1; if (dk < 0) { out.ground++; continue; } out.deck++; const f = v.flySpans[dk]; const along = f.ew ? Math.abs(a.next - a.cur) === 1 : Math.abs(a.next - a.cur) === W; if (!along) out.badTurn++; }
    return out;
  });
  console.log('cars', JSON.stringify(chk));
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')).slice(0, 5));
await browser.close();
