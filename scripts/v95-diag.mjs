// v95：水面のまだらの原因を調べる（同じ視点で、水面の設定を変えて撮る）。OUT=出力先、MODES=base,noshadow,noenv、XY='[x,y]'、D=距離
import { open } from './shot.mjs';
const { browser, page, errors } = await open(960, 600, process.env.MAP ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const info = await page.evaluate((q) => { const S = window.__sumu, g = S.game, s = g.state, v = S.view; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; v.setQuality(q);
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh();
  const m = v.map, W = S.W, H = m.water.length / W; let best = null, bs = -1;
  for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) { const i = y * W + x; if (!m.water[i] || m.sea?.[i]) continue; let n = 0, sea = 0; for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) { const j = (y + b) * W + x + a; if (m.water[j]) n++; if (m.sea?.[j]) sea++; } const sc = n + (sea ? 30 : 0) - Math.abs(x - W / 2) * 0.1; if (sc > bs) { bs = sc; best = [x, y]; } }
  return { W, H, best }; }, process.env.Q ?? 'high');
const [bx, by] = JSON.parse(process.env.XY ?? 'null') ?? info.best; console.log(JSON.stringify(info));
const D = Number(process.env.D ?? 900), P = Number(process.env.P ?? 0.75), Y = Number(process.env.YAW ?? 0.4);
await page.evaluate(([x, y, d, p, yaw]) => { const v = window.__sumu.view, W = window.__sumu.W; v.focus(x + y * W, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; v.dist = v.want.dist = d; v.target.x = v.want.x = x * 30; v.target.z = v.want.z = y * 30; }, [bx, by, D, P, Y]);
await page.waitForTimeout(3000);
const modes = (process.env.MODES ?? 'base').split(',');
for (const md of modes) {
  await page.evaluate((md) => { const v = window.__sumu.view; const wm = v.matWater;
    if (md === 'noshadow') v.scene.traverse(o => { if (o.isMesh && o.material === wm) o.receiveShadow = false; });
    if (md === 'noenv') { v.noEnv = true; wm.envMap = null; }
    if (md === 'opaque') { wm.transparent = false; wm.opacity = 1; }
    if (md === 'noterrain') { wm.transparent = true; wm.opacity = 0.9; v.terrain.visible = false; }
    if (md === 'nodepth') { v.terrain.visible = true; wm.depthWrite = false; }
    if (md === 'count') { const r = []; v.scene.traverse(o => { if (o.isMesh && o.material === wm) r.push([o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3, o.position.y, o.visible, o.renderOrder]); }); console.log(JSON.stringify(r)); window.__cnt = r; }
    wm.needsUpdate = true; }, md).catch(e => console.log('err', md, e.message));
  await page.waitForTimeout(Number(process.env.WAIT ?? 4000));
  if (md === 'count') { console.log(JSON.stringify(await page.evaluate(() => window.__cnt))); continue; }
  await page.screenshot({ path: `${process.env.OUT}/${md}.png` }); console.log('shot', md); }
console.log(errors.slice(0, 5)); await browser.close();
