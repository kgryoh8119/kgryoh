// v86：民間の建物の見本（tests/_bldg_lineup.test.ts で作った SAV）を読み込み、同じ視点で撮る（NAME=出力名の頭、VIEWS=撮る番号、Q=品質）
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const SAV = process.env.SAV, list = JSON.parse(readFileSync(SAV + '.json', 'utf8')), OUT = process.env.OUTDIR ?? 'shots';
const { browser, page, errors } = await open(Number(process.env.W ?? 1100), Number(process.env.H ?? 700), 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1000);
await page.evaluate(([t, q]) => { const S = window.__sumu; S.game.loadText(t); const s = S.game.state; s.tutorial.done = true; s.goalPick = false; s.notes = []; S.fixedQuality = true; S.view.setQuality(q); S.ui.refresh();
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; S.game.speed = 0; }, [readFileSync(SAV, 'utf8'), process.env.Q ?? 'high']);
await page.waitForTimeout(6000);
const W = 76, at = (k) => list[k][2];
// [中心の区画, 距離, 見下ろす角, 向き]（向き 0 は南から北を見る、π は北から南を見る）
const V = [[at(4), 230, 0.5, 2.6], [at(2), 62, 0.42, Math.PI - 0.5], [at(7), 62, 0.42, Math.PI + 0.5], [at(16), 70, 0.4, 0.5], [at(21), 70, 0.4, -0.5], [at(25), 70, 0.4, 0.4], [at(12), 66, 0.42, Math.PI - 0.4]];
const pick = (process.env.VIEWS ?? '0,1,2,3,4,5,6').split(',').map(Number);
for (const k of pick) {
  if (k === 9) { // 地上：家の並ぶ道を歩道から
    await page.evaluate((t) => { const v = window.__sumu.view; v.setMode('ground'); v.ground.x = (t % 76 + 0.2) * 30; v.ground.z = (Math.floor(t / 76) - 0.5) * 30 - 3.2; v.ground.yaw = Math.PI / 2 + 0.55; v.ground.pitch = 0.08; }, at(1));
  } else { const [t, d, p, yaw] = V[k]; await page.evaluate(([t, d, p, yaw]) => { const v = window.__sumu.view; v.setMode('orbit'); v.focus(t, d); v.dist = d; v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [t, d, p, yaw]); }
  await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/${process.env.NAME ?? 'bldg'}-${k}.png` }); console.log('shot', k);
}
console.log(JSON.stringify(await page.evaluate(() => window.__sumu.view.stats)), errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
