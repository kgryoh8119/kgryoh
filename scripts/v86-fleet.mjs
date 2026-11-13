// v86：新しい車の形を全部、止めて並べて撮る（after のみ）。DIST、OUT、NAME、HOUR（時刻。夜は 21）
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'after', OUT = process.env.OUT ?? 'shots', HOUR = Number(process.env.HOUR ?? 11);
const { browser, page, errors } = await open(1000, 640, 'sumino');
await page.waitForTimeout(1500);
await page.evaluate((hour) => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('mid');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = hour; S.view.expEvery = 1; }, HOUR);
await page.waitForTimeout(4000);
const seg = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; for (let i = 3; i < s.road.length - 3; i++) if (s.road[i] === 1 && s.road[i - 1] && s.road[i + 1] && !s.road[i - W] && !s.road[i + W] && s.road[i - 2] && s.road[i + 2]) return i; return -1; });
console.log('seg', seg);
await page.evaluate((seg) => { const v = window.__sumu.view, L = v.cars.slice(0, 20), cols = [0xf4f4f2, 0xf2c8d4, 0x24262a, 0xc4c8cc, 0x2a3a58, 0xb02e2a, 0xe8c840, 0xf4f4f2, 0xf4f4f2, 0xe8c840, 0x1c1e22, 0xf6f6f2, 0xc0261c, 0xe8c030, 0x2a8a50, 0xc0392b, 0x3a5a8a, 0x2f8a5a, 0x2a7fe0, 0xf2f2ee];
  L.forEach((a, k) => { const tile = seg - 1 + Math.floor(k / 8); a.kind = k >= 17 ? [1, 2, 4][k - 17] : 0; a.vm = k; a.vc = cols[k]; a.speed = 0; a.v = 0; a.cur = tile; a.next = tile + 1; a.prev = tile - 1; a.nn = tile + 2; a.t = 0.1 + ((k % 8) >> 1) * 0.25; a.lane = k & 1; a.yaw = Math.PI / 2; });
  v.cars.slice(20).forEach(a => { a.cur = a.next = seg + 5; a.speed = 0; }); v.focus(seg - 1, 30); v.pitch = 0.4; v.yaw = 0.6; }, seg);
for (let i = 0; i < 3; i++) { await page.evaluate(([seg, i]) => { const v = window.__sumu.view; v.focus(seg - 1 + i, 24); v.pitch = 0.42; v.yaw = 0.7; }, [seg, i]); await page.waitForTimeout(2500); await page.screenshot({ path: `${OUT}/${NAME}-fleet${i}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
