// v102：密集の見え方の撮影と、描いた数と実数の照合。node scripts/v102-shots.mjs（先に npx vite build）。
// OUT=docs/shots/v102  WHAT=station,main,school,holiday（撮る場面）  TAG=after（ファイル名の後ろ）  HIDE=low|ped（検査用：簡略な人・車／精細な人を隠す）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v102', WHAT = (process.env.WHAT ?? 'station,main,school,holiday').split(','), TAG = process.env.TAG ?? 'after', HIDE = process.env.HIDE ?? '';
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
  const pick = f => { const l = s.buildings.filter(f); return l.length ? l[0] : null; }, ctr = b => b ? (b.y + 1) * W + b.x + 1 : -1;
  const sch = pick(b => b.kind === 'school'), park = pick(b => /park/i.test(b.kind));
  // 幹線：見える範囲で最も混む道路の区画（朝の混雑 vc）
  let mx = -1, mv = -1; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 2 && Math.abs(i % W - cx) < 20 && Math.abs(((i / W) | 0) - cy) < 20 && (s.vc[i] || 0) > mv) { mv = s.vc[i]; mx = i; }
  return { c: cy * W + cx, st: best ? best.y * W + best.x : -1, school: ctr(sch), schoolId: sch?.id, park: ctr(park), parkId: park?.id, main: mx, mainVc: mv }; });
console.log(JSON.stringify(info));
const sim = sec => page.evaluate(sec => { const v = window.__sumu.view, s = window.__sumu.game.state; for (let t = 0; t < sec; t += 0.1) { v.lifeT += 0.1; v.updateCamera(0.1); v.moveAgents(s, 0.1); } }, sec);
const at = (hour, hol, tile, d, pitch = 0.62, yaw = 0.7) => page.evaluate(([h, hol, t, d, p, y]) => { const v = window.__sumu.view; v.hour = h; v.holiday = hol; v.applyTime?.(); v.focus(t, d); v.pitch = p; v.yaw = y; v.target.x = v.want.x; v.target.z = v.want.z; v.dist = d; v.agentSpawnAt.x = -1e9; v.spawnAgents(); }, [hour, hol, tile, d, pitch, yaw]);
const shoot = async (name) => { await page.evaluate(h => { const v = window.__sumu.view; for (let k = 0; k < 4; k++) v.__frame.call(v, 0.05); if (h.includes('low')) { v.lowPed.mesh.visible = false; v.lowCar.mesh.visible = false; } if (h.includes('ped')) { v.pedP.mesh.visible = false; v.lifeP.mesh.visible = false; v.crowdP.mesh.visible = false; } v.renderer.render(v.scene, v.camera); }, HIDE);
  await page.screenshot({ path: `${OUT}/${name}-${TAG}.jpg`, type: 'jpeg', quality: 74 }); console.log('shot', name); };
const count = (label) => page.evaluate(label => { const v = window.__sumu.view, r = v.resInfo; return { label, visible: r.visible, drawn: r.drawn, farBy: r.farBy, lowDrawn: r.far?.slice(1), st: v.stInfo?.().slice(0, 1), life: [v.lifeP.mesh.count, v.lifeFar?.length ?? 0] }; }, label);
if (WHAT.includes('station') && info.st >= 0) { await at(8, false, info.st, 170); await sim(5); console.log(JSON.stringify(await count('station8'))); await shoot('station-8am'); }
if (WHAT.includes('main') && info.main >= 0) { await at(8, false, info.main, 300, 0.75); await sim(6); console.log(JSON.stringify(await count('main8'))); await shoot('main-8am'); }
if (WHAT.includes('school') && info.school >= 0) { for (const h of [10.4, 10.9]) { await at(h, false, info.school, 160, 0.7); await sim(3); console.log(JSON.stringify({ ...(await count('school' + h)), occ: await page.evaluate(id => window.__sumu.view.occOf?.(id), info.schoolId) })); } await at(10.4, false, info.school, 160, 0.7); await sim(3); await shoot('school-break'); }
if (WHAT.includes('holiday') && info.park >= 0) { await at(11, true, info.park, 200, 0.7); await sim(3); console.log(JSON.stringify({ ...(await count('park-hol')), occ: await page.evaluate(id => window.__sumu.view.occOf?.(id), info.parkId) })); await shoot('park-holiday'); }
console.log('errors', errors.filter(e => !e.includes('TUNNEL') && !e.includes('404')).slice(0, 5)); await browser.close();
