// v104a：道路の断面（歩道の始まり・終わり、生活道路と幹線の交差点）を斜めから撮る。node scripts/v104a-shots.mjs（先に npx vite build）
//   TAG=after（ファイル名の後ろ）  DIST=…（直す前の版）。真上の駅前（goal-8am）は scripts/v103-shots.mjs の WHAT=goal で撮る
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v104a', TAG = process.env.TAG ?? 'after';
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1000, 640, 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality('mid');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {}; });
// 駅から離れた、二車線以上の道と生活道路（歩道なし）の T 字・十字（街の中心に近い順）。直す前の版でも同じ所を撮るよう、道路の配列だけで選ぶ
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W, H = s.road.length / W, R = s.road, at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? R[y * W + x] : 0);
  let x = 0, y = 0, n = 0; for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = x / n, cy = y / n, st = s.buildings.filter(b => b.kind === 'station' || b.kind === 'school' || b.kind === 'nursery' || b.kind === 'nurseryS' || b.kind === 'nurseryL' || b.kind === 'jhs');
  let best = -1, bv = 1e9;
  for (let yy = 1; yy < H - 1; yy++) for (let xx = 1; xx < W - 1; xx++) { const i = yy * W + xx; if (R[i] !== 2) continue; const c = [at(xx + 1, yy), at(xx - 1, yy), at(xx, yy + 1), at(xx, yy - 1)]; if (c.filter(v => v).length < 3 || !c.includes(1) || !c.includes(2)) continue;
    if (st.some(b => xx >= b.x - 4 && xx < b.x + b.w + 4 && yy >= b.y - 4 && yy < b.y + b.h + 4)) continue;
    const d = Math.hypot(xx - cx, yy - cy); if (d < bv) { bv = d; best = i; } }
  let sta = -1, sv = 1e9; for (const b of s.buildings) if (b.kind === 'station') { const d = Math.hypot(b.x - cx, b.y - cy); if (d < sv) { sv = d; sta = (b.y + b.h) * W + b.x + 1; } }
  return { jn: best, st: sta }; });
console.log(JSON.stringify(info));
const sim = sec => page.evaluate(sec => { const v = window.__sumu.view, s = window.__sumu.game.state; for (let t = 0; t < sec; t += 0.1) { v.lifeT += 0.1; v.updateCamera(0.1); v.moveAgents(s, 0.1); } }, sec);
const at = (hour, tile, d, pitch, yaw) => page.evaluate(([h, t, d, p, y]) => { const v = window.__sumu.view; v.hour = h; v.holiday = false; v.applyTime?.(); v.focus(t, d); v.pitch = p; v.yaw = y; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = d; v.want.pitch = p; v.want.yaw = y; v.agentSpawnAt.x = -1e9; v.spawnAgents(); }, [hour, tile, d, pitch, yaw]);
const shoot = async name => { await page.evaluate(() => { const v = window.__sumu.view; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05); v.renderer.render(v.scene, v.camera); });
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.jpg`, type: 'jpeg', quality: 80 }); console.log('shot', name); };
if (info.jn >= 0) { await at(8, info.jn, 48, 0.55, 0.8); await sim(10); await shoot('junction-oblique'); await at(8, info.jn, 70, 1.3, 0.3); await sim(2); await shoot('junction-top'); }
if (info.st >= 0) { await at(8, info.st, 60, 0.6, 3.6); await sim(12); await shoot('station-oblique'); }
console.log('errors', errors.filter(e => !e.includes('TUNNEL') && !e.includes('404')).slice(0, 5)); await browser.close();
