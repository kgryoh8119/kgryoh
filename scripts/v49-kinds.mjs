// v49：指定した施設（KINDS=a,b,c）をまとめて置いて撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(500000); await page.waitForTimeout(1500);
const K = (process.env.KINDS ?? '').split(',');
const info = await page.evaluate(K => { const S = window.__sumu, g = S.game, s = g.state, W = S.W; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high'); s.cash += 1e9; s.fame = 100;
  const H = s.road.length / W, placed = {}, fail = {}, st = s.buildings.find(b => b.kind === 'station') ?? { x: W >> 1, y: H >> 1 };
  for (const k of K) { let done = false, msg = '';
    for (let r = 2; r < 60 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const res = g.act({ type: 'build', kind: k, x: st.x + dx, y: st.y + dy }); msg = res.msg; if (res.ok) { const b = s.buildings.at(-1); b.status = 'operating'; b.remain = 0; placed[k] = (b.y + (b.h >> 1)) * W + b.x + (b.w >> 1); done = true; } }
    if (!done) fail[k] = msg; }
  s.roadVersion++; s.bVersion++; S.stepMonth(s); s.events.active = []; s.notes = []; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  S.view.clockRun = false; S.view.weatherForce = 'clear'; S.view.hour = 10.5; return { placed, fail }; }, K);
console.log(JSON.stringify(info.fail));
const pick = (process.env.ONLY ?? '').split(',').filter(Boolean);
for (const k of (pick.length ? pick : K)) { const t = info.placed[k]; if (t == null) continue; await page.evaluate(([t]) => { const v = window.__sumu.view; v.focus(t, 95); }, [t]); await page.waitForTimeout(4500); await page.screenshot({ path: `shots/v49b-${k}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
