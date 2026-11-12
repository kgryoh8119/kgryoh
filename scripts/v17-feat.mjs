// v17 の道具と演出を撮る：バス停・堤防・船・ヘリ・線引き・経済の欄・空港の欄
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate((t) => { const g = window.__sumu.game; g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); window.__sumu.fixedQuality = true; }, readFileSync(process.env.SAVE, 'utf8'));
const info = await page.evaluate(() => {
  const S = window.__sumu, g = S.game, s = g.state, W = 76, H = 68; s.cash = 5e6; s.fame = 60;
  const out = {};
  // バス停：幹線沿いに 3 か所
  const roads = []; for (let i = 0; i < W * H; i++) if (s.road[i] === 2) roads.push(i);
  const mid = roads[Math.floor(roads.length / 2)]; out.bus = g.act({ type: 'busStop', tiles: [mid], on: true }).msg; out.busAt = mid;
  // 堤防：川に面した空き地
  const t = []; for (let x = 0; x < W; x++) for (let y = 55; y < 64; y++) { const i = y * W + x; if (!s.occ[i] && !s.road[i]) t.push(i); }
  const r = g.act({ type: 'levee', tiles: t }); out.levee = r.msg; out.leveeAt = (s.levee ?? [])[Math.floor((s.levee ?? []).length / 2)];
  // ヘリポートと空港
  for (const k of ['heliport', 'airport']) { let ok = null; for (let y = 2; y < 62 && !ok; y++) for (let x = 2; x < 72; x++) { const rr = g.act({ type: 'build', kind: k, x, y }); if (rr.ok) { ok = [x, y]; break; } } out[k] = ok; }
  for (const b of s.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; b.staff = b.staffTarget ?? 0; }
  s.bVersion++; g.changed && g.changed(); S.ui.refresh();
  return out;
});
console.log(JSON.stringify(info));
const shot = async (name, tile, d, hour = 11) => { console.log('shot', name); await page.evaluate(([t, d, h]) => { const v = window.__sumu.view; v.hour = h; v.clockRun = false; v.focus(t, d); }, [tile, d, hour]); await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v17-${name}.png` }); };
await shot('busstop', info.busAt, 90);
if (info.leveeAt !== undefined) await shot('levee', info.leveeAt, 260);
if (info.heliport) { await page.evaluate(() => { window.__sumu.view.lifeT = 60 * 0.2; }); await shot('heli', (info.heliport[1] + 1) * 76 + info.heliport[0] + 1, 380); }
// 船（川の航路）
const sp = await page.evaluate(() => { const v = window.__sumu.view; const sh = v.ships[0]; if (!sh) return null; const L = sh.x1 - sh.x0, d = ((sh.ph * L + v.lifeT * sh.sp) % L + L) % L; return Math.floor(sh.z / 30) * 76 + Math.max(0, Math.min(75, Math.floor((sh.x0 + d) / 30))); });
if (sp !== null) await shot('ships', sp, 220);
// 線引きの道具（区域の色）
await page.evaluate(() => { const u = window.__sumu.ui; u.setTool({ t: 'area', v: 2 }); u.group = 'zone'; u.renderTools(); });
const yt = await page.evaluate(() => { const a = window.__sumu.game.state.area ?? []; const l = []; a.forEach((v, i) => { if (v === 2) l.push(i); }); return l[Math.floor(l.length / 2)] ?? 34 * 76 + 38; });
await shot('area', yt, 1300);
await page.evaluate(() => { const u = window.__sumu.ui; u.setTool({ t: 'select' }); u.group = null; u.renderTools(); });
// 概要の経済の欄
await page.evaluate(() => { const el = [...document.querySelectorAll('section h2')].find(h => h.textContent.startsWith('経済・財政')); el && el.scrollIntoView(); });
await page.waitForTimeout(600); await page.screenshot({ path: 'shots/v17-econ.png' });
// 空港の欄
if (info.airport) { await page.evaluate(([x, y]) => { const S = window.__sumu, b = S.game.state.buildings.find(o => o.kind === 'airport'); S.ui.sel = { b: b.id }; S.ui.markSel(); S.ui.renderInfo(); S.view.focus(b.y * 76 + b.x + 2, 500); }, info.airport); await page.waitForTimeout(2000); await page.screenshot({ path: 'shots/v17-airport.png' }); }
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
