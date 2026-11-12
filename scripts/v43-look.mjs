// v43：新しい施設（夜の街・産業・宇宙・ホテル・高校）と道路の種類、経済の画面
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(240000); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 30; i++) { S.stepMonth(s); s.events.active = []; } s.month += 48; s.fame = 100; s.cash += 1e7; const pop0 = s.stats.pop; s.stats.pop = 1e5; s.sisters = s.sisters ?? [];
  const kinds = ['nightDistrict', 'yokocho', 'fuzokuDistrict', 'luxuryHotel', 'bizHotel', 'zenecon', 'tradingCo', 'stockExch', 'arcade', 'humanoidLab', 'spaceVenture', 'privHigh', 'clubTeam', 'ryokan', 'foodMaker', 'carPlant', 'heavyInd', 'spaceport'];
  const st = s.buildings.find(b => b.kind === 'station'), placed = {};
  for (const k of kinds) { let done = false; const d = S.DEFS[k];
    for (let r = 2; r < 40 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = st.x + dx, y = st.y + dy; if (x < 1 || y < 2 || x + d.w > 75 || y + d.h > 66) continue; const res = g.act({ type: 'build', kind: k, x, y }); if (res.ok) { for (const b of s.buildings) if (b.kind === k && b.status === 'construction') { b.status = 'operating'; b.remain = 0; } s.bVersion++; s.stats.pop = 1e5; done = true; placed[k] = { x, y, t: (y + Math.floor(d.h / 2)) * 76 + x + Math.floor(d.w / 2) }; } } }
  // 駅前の道路を石畳・並木・無電柱に
  const rd = []; for (let dy = -6; dy <= 6; dy++) for (let dx = -8; dx <= 8; dx++) { const i = (st.y + dy) * 76 + st.x + dx; if (s.road[i] === 1) rd.push(i); }
  s.cash += 1e6; const a = g.act({ type: 'street', tiles: rd.slice(0, Math.floor(rd.length / 3)), style: 'stone' }), b = g.act({ type: 'street', tiles: rd.slice(Math.floor(rd.length / 3), Math.floor(rd.length * 2 / 3)), style: 'tree' }), c = g.act({ type: 'street', tiles: rd.slice(Math.floor(rd.length * 2 / 3)), style: 'nopole' });
  for (let i = 0; i < 2; i++) { S.stepMonth(s); s.events.active = []; }
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed');
  S.view.clockRun = false; S.view.weatherForce = 'clear';
  return { placed, st: st.y * 76 + st.x + 1, street: [a.msg, b.msg, c.msg], miss: kinds.filter(k => !placed[k]) }; });
console.log(JSON.stringify(info));
const P = info.placed, shots = [[11, info.st, 260, 'station'], [21.5, P.nightDistrict?.t ?? info.st, 160, 'night'], [21.5, info.st, 320, 'nightwide'], [11, P.carPlant?.t ?? info.st, 320, 'car'], [11, P.spaceport?.t ?? info.st, 320, 'space'], [11, P.humanoidLab?.t ?? info.st, 200, 'robot']];
for (const [h, t, d, n] of shots.filter(x => !process.env.ONLY || process.env.ONLY.split(',').includes(x[3]))) { await page.evaluate(([h, t, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); }, [h, t, d]); await page.waitForTimeout(3000); await page.screenshot({ path: `shots/v43-${n}.png` }); }
// 経済の画面
if (!process.env.ONLY) {
await page.evaluate(() => { document.getElementById('side')?.classList.remove('closed'); const b = [...document.querySelectorAll('[data-act="tab"]')].find(x => x.textContent.includes('概要')); b?.click(); });
await page.waitForTimeout(800);
await page.evaluate(() => { const d = document.querySelector('details[data-k="macro"]'); if (d) { d.open = true; d.scrollIntoView(); } });
await page.waitForTimeout(800); await page.screenshot({ path: 'shots/v43-econ.png' }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
