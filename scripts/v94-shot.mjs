// v94：地形と海岸線の撮影。TERRAIN=地形、V='[[x(区画),y(区画),距離,見下ろす角,向き],...]'（区画は地図の外でもよい）、NAME=出力名の頭、OUT=出力先
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, process.env.MAP ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const t = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, v = S.view; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh();
  return { W: S.W, H: s.road.length / S.W, seed: s.seed }; });
await page.waitForTimeout(5000);
const V = JSON.parse(process.env.V ?? '[[96,84,6500,1.35,0]]'), out = process.env.OUT ?? 'shots';
for (let k = 0; k < V.length; k++) { const [x, y, d, p, yaw] = V[k];
  await page.evaluate(([x, y, d, p, yaw]) => { const v = window.__sumu.view, W = window.__sumu.W; v.focus(Math.max(0, Math.min(W - 1, Math.round(x))) + Math.max(0, Math.round(y)) * W, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; v.dist = v.want.dist = d; v.target.x = v.want.x = x * 30; v.target.z = v.want.z = y * 30; }, [x, y, d, p, yaw]);
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const v = window.__sumu.view; for (let n = 0; n < 60 && v.lazyChunks?.size; n++) { v.lodT = 0; v.updateLod(0.016); } });
  await page.waitForTimeout(Number(process.env.WAIT ?? 4000));
  await page.screenshot({ path: `${out}/${process.env.NAME ?? 'v94'}-${k}.png` }); console.log('shot', k); }
console.log(JSON.stringify(t), errors.filter(e => !e.includes('TUNNEL')).slice(0, 5)); await browser.close();
