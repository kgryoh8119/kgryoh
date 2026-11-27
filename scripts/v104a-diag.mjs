// v104a：朝 8 時の駅前で、人の足元の位置を書き出す（草地の上にいる人を数えるため）。node scripts/v104a-diag.mjs（先に npx vite build）
//   OUT=…json（書き出す先）  DIST=…（調べる版）。数えるのは npx vite-node scripts/v104a-count.ts <json>
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'v104a-pos.json';
const { browser, page } = await open(1000, 640, 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality('mid');
  const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {}; });
const st = await page.evaluate(() => { const S = window.__sumu, s = S.game.state; let x = 0, y = 0, n = 0, best = null, bv = -1e9;
  for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = Math.round(x / n), cy = Math.round(y / n);
  for (const b of s.buildings) if (b.kind === 'station') { const d = -Math.abs(b.x - cx) - Math.abs(b.y - cy); if (d > bv) { bv = d; best = b; } }
  return best.y * S.W + best.x; });
const sim = sec => page.evaluate(sec => { const v = window.__sumu.view, s = window.__sumu.game.state; for (let t = 0; t < sec; t += 0.1) { v.lifeT += 0.1; v.updateCamera(0.1); v.moveAgents(s, 0.1); } }, sec);
await page.evaluate(t => { const v = window.__sumu.view; v.hour = 8; v.holiday = false; v.applyTime?.(); v.focus(t, 400); v.pitch = 0.9; v.yaw = 0.7; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = 400; v.agentSpawnAt.x = -1e9; v.spawnAgents(); }, st);
await sim(15);
const gt = await page.evaluate(() => { const v = window.__sumu.view, c = new Map(); for (const a of v.peds) { const g = a.goal; if (g >= 0) c.set(g, (c.get(g) ?? 0) + 1); } let b = -1, n = 0; for (const [k, m] of c) if (m > n) { n = m; b = k; } return b; });
await page.evaluate(t => { const v = window.__sumu.view; v.focus(t, 55); v.pitch = 1.2; v.yaw = 0.4; v.want.pitch = 1.2; v.want.yaw = 0.4; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = 55; }, gt);
const all = [];
for (let k = 0; k < 6; k++) { await sim(2);
  all.push(await page.evaluate(() => { const S = window.__sumu, v = S.view, s = S.game.state, out = { peds: [], low: [], crowd: [] };
    for (const a of v.peds) if (a.px !== undefined && !a.dead) out.peds.push([a.px, a.pz, a.enter !== undefined || a.exit !== undefined ? 1 : 0, a.cur]);
    const rd = (mesh, arr) => { const m = mesh.instanceMatrix.array; for (let i = 0; i < mesh.count; i++) arr.push([m[i * 16 + 12], m[i * 16 + 14]]); };
    if (v.lowPed?.mesh) rd(v.lowPed.mesh, out.low); if (v.crowdP?.mesh) rd(v.crowdP.mesh, out.crowd); return out; })); }
const env = await page.evaluate(() => { const S = window.__sumu, v = S.view, s = S.game.state; const f = v.frontOf ? [...v.frontOf(s)] : [];
  return { W: S.W, H: s.road.length / S.W, road: [...s.road], wide: [...v.wideSet], deck: [...v.deckH.keys()], front: f, kerb: v.kerbP ? [...v.kerbP] : null }; });
fs.writeFileSync(OUT, JSON.stringify({ env, frames: all, goal: gt }));
console.log('wrote', OUT, all.map(f => [f.peds.length, f.low.length, f.crowd.length])); await browser.close();
