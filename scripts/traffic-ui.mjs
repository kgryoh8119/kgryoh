import { open } from './shot.mjs';
const id = process.env.MAPID ?? 'sumino';
const { browser, page, errors } = await open(1440, 900, id);
await page.evaluate(() => { const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; window.__sumu.view.hour = 8; window.__sumu.ui.refresh(); });
await page.click('[data-act="layer"][data-arg="traffic"]');
// 混む所の近くの住宅を選ぶ
const r = await page.evaluate(() => { const S = window.__sumu, s = S.game.state, W = S.W; let best = -1, bv = 0; for (let i = 0; i < s.vc.length; i++) if (s.road[i] && s.road[i] !== 3 && s.vc[i] > bv) { bv = s.vc[i]; best = i; }
  const bx = best % W, by = Math.floor(best / W); let h = null, hd = 1e9; for (const b of s.buildings) if ((b.kind === 'house' || b.kind === 'apartment') && b.status === 'operating') { const d = Math.abs(b.x - bx) + Math.abs(b.y - by); if (d > 6 && d < hd) { hd = d; h = b; } }
  S.ui.sel = { b: h.id }; S.ui.renderInfo(); S.ui.refresh(); S.view.focus(best, 380); return { best, bv, h: h.id }; });
await page.waitForTimeout(2500);
await page.screenshot({ path: `shots/traffic-${id}.png` });
console.log(JSON.stringify(r), 'errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
