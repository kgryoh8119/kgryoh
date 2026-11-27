// v104b：駅の診断（線路に付いた駅・ホームの位置・線路の本数）。node scripts/v104b-diag.mjs
import { open } from './shot.mjs';
const { browser, page } = await open(800, 500, process.env.MAPID ?? 'sumino');
await page.waitForTimeout(2000);
const r = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, v = S.view;
  return { pop: Math.round(s.stats.pop), st: s.buildings.filter(b => b.kind === 'station').map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, lv: b.lv, rail: v.railStations.has(b.id) })),
    spots: v.stSpots.map(o => ({ id: o.id, n: o.pts.length, path: o.path, bld: !!o.bld, p0: o.pts.slice(0, 3).map(Math.round) })), paths: v.railPaths.map(p => [p.len | 0, Math.max(...p.lv)]) }; });
console.log(JSON.stringify(r));
await browser.close();
