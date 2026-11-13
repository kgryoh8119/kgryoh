// v88：働く車と二輪（形 20〜37）と乗用車を止めて並べて撮る。DIST、OUT、NAME、HOUR、Q（品質）
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'after', OUT = process.env.OUT ?? 'shots', HOUR = Number(process.env.HOUR ?? 11);
const { browser, page, errors } = await open(960, 600, 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
await page.evaluate(([hour, q]) => { const S = window.__sumu, g = S.game, s = g.state; s.tutorial.done = true; s.goalPick = false; g.speed = 0; S.fixedQuality = true; S.view.setQuality(q);
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = hour; }, [HOUR, process.env.Q ?? 'high']);
await page.waitForTimeout(4000);
const seg = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; for (let i = 4; i < s.road.length - 4; i++) if (s.road[i] && s.road[i] !== 3 && [-2, -1, 1, 2, 3].every(d => s.road[i + d]) && !s.road[i - W] && !s.road[i + W] && !s.road[i + 1 - W] && !s.road[i + 1 + W]) return i; return -1; });
console.log('seg', seg);
await page.evaluate((seg) => { const v = window.__sumu.view, VM = [0, 9, 10, ...Array.from({ length: 18 }, (_, k) => 20 + k)], cols = [0xf4f4f2, 0xe8c840, 0x1c1e22, 0x2a64b8, 0x3a8a4a, 0xf4f4f2, 0xf4f4f2, 0x2a8a50, 0xf4f4f2, 0xe8c030, 0xf4f4f2, 0xf4f4f2, 0xc0261c, 0xc0261c, 0xc0392b, 0xf6f6f2, 0xd8382c, 0xf2f2f2, 0x2aa060, 0xc8261c, 0x2a64b8];
  const L = v.cars.slice(0, VM.length);
  L.forEach((a, k) => { const tile = seg - 1 + Math.floor(k / 6); a.em = undefined; a.kind = 0; a.vm = VM[k]; a.vc = cols[k]; a.speed = 0; a.v = 0; a.cur = tile; a.next = tile + 1; a.prev = tile - 1; a.nn = tile + 2; a.t = 0.12 + ((k % 6) >> 1) * 0.33; a.lane = k & 1; a.yaw = Math.PI / 2; });
  v.cars.slice(VM.length).forEach(a => { a.cur = a.next = seg + 6; a.speed = 0; }); }, seg);
for (let i = 0; i < 2; i++) { await page.evaluate(([seg, i]) => { const v = window.__sumu.view; v.focus(seg + i * 2, 30); v.pitch = 0.38; v.yaw = 0.75; }, [seg, i]); await page.waitForTimeout(12000); await page.screenshot({ path: `${OUT}/${NAME}-fleet${i}.png` }); console.log('shot fleet', i); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
