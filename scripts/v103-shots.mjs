// v103：遠くの簡略な人・車の位置、区域の暗幕、横断歩道の決まりを撮る。node scripts/v103-shots.mjs（先に npx vite build）。
//   TAG=after（ファイル名の後ろ）  DIST=…（直す前の版）  WHAT=far,veil,xw  Q=mid
//   far：朝 8 時の駅前と幹線。住民を全部、遠くの簡略な形で描く（精細に描く数を 0 にする）ので、近くからでも簡略な人・車の位置が見える
//   veil：全景と、編入前の区域の境（暗幕の見え方が前と同じか）
//   xw：空き地に作った密な格子（二車線 1 本と生活道路）を真上から
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v103', TAG = process.env.TAG ?? 'after', WHAT = (process.env.WHAT ?? 'far,veil,xw').split(',');
fs.mkdirSync(OUT, { recursive: true });
const { browser, page, errors } = await open(1000, 640, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(q => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); const v = S.view; v.clockRun = false; v.weatherForce = 'clear'; v.__frame = v.frame; v.frame = () => {}; }, process.env.Q ?? 'mid');
const info = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; let x = 0, y = 0, n = 0, best = null, bv = -1e9;
  for (const b of s.buildings) if (b.hh) { const h = b.hh.reduce((a, c) => a + c, 0); x += b.x * h; y += b.y * h; n += h; }
  const cx = Math.round(x / n), cy = Math.round(y / n);
  for (const b of s.buildings) if (b.kind === 'station') { const d = -Math.abs(b.x - cx) - Math.abs(b.y - cy); if (d > bv) { bv = d; best = b; } }
  let mx = -1, mv = -1; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 2 && Math.abs(i % W - cx) < 20 && Math.abs(((i / W) | 0) - cy) < 20 && (s.vc[i] || 0) > mv) { mv = s.vc[i]; mx = i; }
  return { c: cy * W + cx, st: best ? best.y * W + best.x : -1, main: mx }; });
console.log(JSON.stringify(info));
const sim = sec => page.evaluate(sec => { const v = window.__sumu.view, s = window.__sumu.game.state; for (let t = 0; t < sec; t += 0.1) { v.lifeT += 0.1; v.updateCamera(0.1); v.moveAgents(s, 0.1); } }, sec);
const at = (hour, tile, d, pitch, yaw) => page.evaluate(([h, t, d, p, y]) => { const v = window.__sumu.view; v.hour = h; v.holiday = false; v.applyTime?.(); v.focus(t, d); v.pitch = p; v.yaw = y; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = d; v.want.pitch = p; v.want.yaw = y; v.agentSpawnAt.x = -1e9; v.spawnAgents(); }, [hour, tile, d, pitch, yaw]);
const shoot = async name => { await page.evaluate(() => { const v = window.__sumu.view; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05); v.renderer.render(v.scene, v.camera); });
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.jpg`, type: 'jpeg', quality: 78 }); console.log('shot', name); };
if (WHAT.includes('far')) {
  await page.evaluate(() => { const v = window.__sumu.view; v.resTargets = () => ({ car: 0, bike: 0, bus: 0, ped: 0 }); }); // 住民は全部、簡略な形で
  for (const [nm, t, d, p, y] of [['far-station', info.st, 110, 1.05, 0.7], ['far-main', info.main, 130, 1.0, 2.2]]) {
    if (t < 0) continue; await at(8, t, d, p, y); await sim(8);
    console.log(nm, JSON.stringify(await page.evaluate(() => { const v = window.__sumu.view; return { far: v.resInfo.far, low: [v.lowPed.mesh.count, v.lowCar.mesh.count] }; })));
    await shoot(nm);
  }
}
if (WHAT.includes('goal')) {
  // 朝 8 時、駅へ歩く人がいちばん多く着く道路の区画（駅前）を真上から。精細な人のまま（前は着いた人が車道の真ん中に立っていた）
  await at(8, info.st, 400, 0.9, 0.7); await sim(15);
  const gt = await page.evaluate(() => { const v = window.__sumu.view, c = new Map(); for (const a of v.peds) { const g = a.goal; if (g >= 0) c.set(g, (c.get(g) ?? 0) + 1); } let b = -1, n = 0; for (const [k, m] of c) if (m > n) { n = m; b = k; } return { tile: b, n }; });
  console.log('goal', JSON.stringify(gt));
  if (gt.tile >= 0) { await page.evaluate(t => { const v = window.__sumu.view; v.focus(t, 55); v.pitch = 1.2; v.yaw = 0.4; v.want.pitch = 1.2; v.want.yaw = 0.4; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = 55; }, gt.tile); await sim(4); await shoot('goal-8am'); }
}
if (WHAT.includes('veil')) {
  await at(10.5, info.c, 2600, 0.95, 0.7); await shoot('veil-zenkei');
  await at(10.5, info.c, 1100, 0.7, 2.6); await shoot('veil-mid'); // 斜めから、編入前の区域の暗幕と黄色い柵
}
if (WHAT.includes('veilsame')) {
  // 同じ街・同じコマで、v103 の暗幕と v102 までの作り方（区画ごとに 3×3 の四角）の暗幕を描き比べる（街の状態の違いを除く）
  const mk = await page.evaluate(() => { const S = window.__sumu, v = S.view, m = v.map, W = S.W, T = 30, Wp = W + 1, h = m.heights, H = h.length / Wp - 1;
    const ha = (X, Z) => { const fx = Math.max(0, Math.min(W - 1e-4, X / T)), fy = Math.max(0, Math.min(H - 1e-4, Z / T)), x0 = Math.floor(fx), y0 = Math.floor(fy), u = fx - x0, w = fy - y0; return (h[y0 * Wp + x0] * (1 - u) + h[y0 * Wp + x0 + 1] * u) * (1 - w) + (h[(y0 + 1) * Wp + x0] * (1 - u) + h[(y0 + 1) * Wp + x0 + 1] * u) * w + 1.2; };
    const L = v.lockMeshes, tiles = new Set(); let col = null;
    for (const o of L) { const P = o.geometry.attributes.position; col ??= [...o.geometry.attributes.color.array.slice(0, 3)]; for (let k = 0; k < P.count; k += 4) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let j = 0; j < 4; j++) { x0 = Math.min(x0, P.getX(k + j)); x1 = Math.max(x1, P.getX(k + j)); z0 = Math.min(z0, P.getZ(k + j)); z1 = Math.max(z1, P.getZ(k + j)); }
      for (let y = Math.floor(z0 / T + 1e-6); y < Math.ceil(z1 / T - 1e-6); y++) for (let x = Math.floor(x0 / T + 1e-6); x < Math.ceil(x1 / T - 1e-6); x++) tiles.add(y * W + x); } }
    const pos = [], ix = [], cl = []; const q = (a, b, c, d) => { const n = pos.length / 3; for (const p of [a, b, c, d]) { pos.push(...p); cl.push(...col); } ix.push(n, n + 1, n + 2, n, n + 2, n + 3); };
    for (const i of tiles) { const x = i % W, y = (i / W) | 0, st = T / 3; for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) { const X0 = x * T + k * st, X1 = X0 + st, Z0 = y * T + j * st, Z1 = Z0 + st; q([X0, ha(X0, Z1), Z1], [X1, ha(X1, Z1), Z1], [X1, ha(X1, Z0), Z0], [X0, ha(X0, Z0), Z0]); } }
    const G = L[0].geometry.constructor, A = L[0].geometry.attributes.position.constructor, g = new G(); g.setAttribute('position', new A(new Float32Array(pos), 3)); g.setAttribute('color', new A(new Float32Array(cl), 3)); g.setIndex(ix);
    const old = L[0].clone(); old.geometry = g; old.frustumCulled = false; v.scene.add(old); old.visible = false; v.__oldVeil = old;
    let nt = 0; for (const o of L) nt += o.geometry.index.count / 3; return { tiles: tiles.size, oldTris: ix.length / 3, newTris: nt }; });
  console.log('veilsame', JSON.stringify(mk));
  for (const [nm, d, p, y] of [['veilsame-zenkei', 2600, 0.95, 0.7], ['veilsame-mid', 1100, 0.7, 2.6]]) {
    await at(10.5, info.c, d, p, y);
    for (const which of ['new', 'old']) { await page.evaluate(w => { const v = window.__sumu.view; for (const o of v.lockMeshes) o.visible = w === 'new'; v.__oldVeil.visible = w === 'old'; }, which);
      await page.evaluate(() => { const v = window.__sumu.view; for (let k = 0; k < 3; k++) v.__frame.call(v, 0.0); v.renderer.render(v.scene, v.camera); });
      await page.screenshot({ path: `${OUT}/${nm}-${which}.png` }); }
  }
  await page.evaluate(() => { const v = window.__sumu.view; for (const o of v.lockMeshes) o.visible = true; v.__oldVeil.visible = false; });
}
if (WHAT.includes('xw')) {
  const g = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W, H = s.road.length / W, v = S.view, m = v.map, idx = (x, y) => y * W + x;
    const free = i => !s.occ[i] && !s.road[i] && !s.rail?.[i] && !m.water[i] && !m.forest?.[i];
    let at = null; for (let y = 4; y < H - 16 && !at; y++) for (let x = 4; x < W - 16 && !at; x++) { let ok = true; for (let yy = y - 1; yy <= y + 11 && ok; yy++) for (let xx = x - 1; xx <= x + 11 && ok; xx++) if (!free(idx(xx, yy))) ok = false; if (ok) at = [x, y]; }
    if (!at) return null; const [X, Y] = at, put = (i, r) => { s.road[i] = Math.max(s.road[i], r); s.roadAge[i] = 0; s.zone[i] = 0; };
    for (let k = 0; k <= 10; k += 2) for (let j = 0; j <= 10; j++) { put(idx(X + j, Y + k), k === 6 ? 2 : 1); put(idx(X + k, Y + j), 1); } // 2 区画おきの生活道路の格子、東西の 1 本は二車線
    s.roadVersion++; s.bVersion++; return idx(X + 5, Y + 5); });
  console.log('grid', g);
  if (g !== null) { await at(10.5, g, 230, 1.35, 0); await page.evaluate(() => { const v = window.__sumu.view; for (let k = 0; k < 10; k++) v.__frame.call(v, 0.25); }); await shoot('xw-grid'); }
}
console.log('errors', errors.filter(e => !e.includes('TUNNEL') && !e.includes('404')).slice(0, 5)); await browser.close();
