// v104a：駅前の道路の等級と、歩く人が草の上にいるかを数える。node scripts/v104a-diag.mjs（先に npx vite build）
import { open } from './shot.mjs';
const { browser, page } = await open(800, 500, 'sumino');
page.setDefaultTimeout(900000);
const r = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; const out = [];
  const g = Number(new URLSearchParams('').get('g') ?? 596), gx = g % W, gy = (g / W) | 0;
  for (let y = gy - 6; y <= gy + 6; y++) { let row = ''; for (let x = gx - 10; x <= gx + 10; x++) { const i = y * W + x; const b = s.buildings.find(b => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h); row += s.road[i] ? String(s.road[i]) : b ? (b.kind === 'station' ? 'S' : b.kind[0]) : (s.zone[i] ? 'z' : '.'); } out.push(row); }
  return { W, gx, gy, out };
});
console.log(JSON.stringify(r, null, 1)); await browser.close();
