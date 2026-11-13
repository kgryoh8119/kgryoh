// v88：無人島の全景と、開拓が進んだ様子を撮る（OUT=出力先、VIEWS=撮る番号 0 全景 1 開拓 10 年後の近景 2 開拓 10 年後の全景）
import { open } from './shot.mjs';
process.env.TERRAIN = 'castaway';
const { browser, page, errors } = await open(1280, 800, process.env.MAP ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const out = process.env.OUT ?? 'shots', views = (process.env.VIEWS ?? '0,1,2').split(',').map(Number);
const prep = () => page.evaluate(() => { const S = window.__sumu, v = S.view, s = S.game.state; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh(); });
const cam = (x, y, d, p, yaw) => page.evaluate(([x, y, d, p, yaw]) => { const v = window.__sumu.view, W = window.__sumu.W; v.focus(y * W + x, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; v.dist = v.want.dist = d; }, [x, y, d, p, yaw]);
await prep(); await page.waitForTimeout(5000);
if (views.includes(0)) { await cam(64, 56, 4300, 1.05, 0); await page.waitForTimeout(4000); await page.screenshot({ path: `${out}/isle-0.png` }); }
if (views.includes(1) || views.includes(2)) {
  const log = await page.evaluate(() => {
    const S = window.__sumu, g = S.game, s = g.state, W = S.W, H = s.road.length / W, act = a => g.act(a), msgs = [];
    s.cash += 300000;
    // 入り江の桟橋
    let px = -1, py = -1;
    for (let y = H - 3; y > 60 && px < 0; y--) for (let x = 64; x < 84 && px < 0; x++) if (act({ type: 'build', kind: 'pier', x, y }).ok) { px = x; py = y; }
    msgs.push('pier ' + px + ',' + py);
    // 桟橋から北へ幹の道、途中から東西へ枝の道
    const road = (x0, y0, x1, y1) => { const t = []; for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) t.push(y * W + x); const r = act({ type: 'road', tiles: t, road: 1 }); msgs.push('road ' + r.msg.slice(0, 40)); };
    road(px, py - 1, px, py - 16); for (const yy of [py - 5, py - 10, py - 15]) road(px - 14, yy, px + 12, yy);
    const put = (k, n) => { let c = 0; for (let y = py - 17; y < py && c < n; y++) for (let x = px - 16; x < px + 15 && c < n; x++) if (act({ type: 'build', kind: k, x, y }).ok) c++; msgs.push(k + ' ' + c); };
    put('well', 3); put('miniWater', 1); put('solarKit', 3); put('dieselGen', 1); put('musenTower', 1); put('miniIncin', 1); put('fishRaft', 1); put('kaitakuFarm', 3); put('clinic', 1); put('kaitaku', 16);
    // 残りの道沿いは住宅の用途にして、民間の家を呼ぶ
    const z = []; for (let y = py - 17; y < py; y++) for (let x = px - 15; x < px + 13; x++) { const i = y * W + x; if (!s.road[i] && !s.occ[i]) z.push(i); } msgs.push('zone ' + act({ type: 'zone', tiles: z, zone: 1 }).msg.slice(0, 30));
    for (let m = 0; m < 120; m++) { S.stepMonth(s); s.events.active = []; for (const b of s.buildings) if (b.status === 'suspended' || b.age > 80) act({ type: 'renew', id: b.id }); }
    s.roadVersion++; s.bVersion++; S.ui.refresh();
    return { msgs, pop: Math.round(s.stats.pop), hh: Math.round(s.stats.households), cash: Math.round(s.cash), b: s.buildings.length, px, py };
  });
  console.log(JSON.stringify(log));
  await page.waitForTimeout(8000);
  if (views.includes(1)) { await cam(log.px, log.py - 8, 520, 0.62, 2.6); await page.waitForTimeout(5000); await page.screenshot({ path: `${out}/isle-1.png` }); }
  if (views.includes(2)) { await cam(64, 56, 3000, 0.9, 0.3); await page.waitForTimeout(5000); await page.screenshot({ path: `${out}/isle-2.png` }); }
}
console.log(errors.filter(e => !e.includes('TUNNEL')).slice(0, 5)); await browser.close();
