// v55：名所の第 3 弾（16 種）を置いて撮る。NAME=接頭辞 ONLY=種類名の一部
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v55';
const KINDS = (process.env.KINDS ? process.env.KINDS.split(',') : null) ?? ['grandShrine', 'kabukiza', 'castleRuins', 'japaneseGarden', 'clockTower', 'ironTower', 'church', 'operaHouse', 'kencho', 'cityHall', 'dome', 'ballpark', 'controlTower', 'aquarium', 'amusementPark', 'airshipMast'];
const ks = process.env.ONLY ? KINDS.filter(k => process.env.ONLY.split(',').some(o => k.includes(o))) : KINDS;
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const r = await page.evaluate((ks) => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear';
  const st = s.buildings.find(b => b.kind === 'station') ?? s.buildings[0]; const out = {};
  for (const kind of ks) { let ok = false, msg = '';
    const R = 24; for (let rr = 3; rr < R && !ok; rr++) for (let dy = -rr; dy <= rr && !ok; dy += 2) for (let dx = -rr; dx <= rr && !ok; dx += 2) { if (Math.max(Math.abs(dx), Math.abs(dy)) < rr - 1) continue; const res = g.act({ type: 'build', kind, x: st.x + dx, y: st.y + dy }); if (res.ok) ok = true; else if (!msg) msg = res.msg; }
    // 条件（宗教法人の誘致など）で置けない種類は、同じ大きさの施設を置いてから種類を差し替える（写真用）
    const SUB = { grandShrine: 'ballpark', airshipMast: 'kabukiza', megaPark: 'dome', boatRace: 'dome', skiResort: 'aquarium', skyscraper: 'aquarium', futureTower: 'aquarium', giantRobot: 'onsen', observatory: 'onsen', university: 'ballpark', megaFloat: 'dome', expoSite: 'dome', moonBase: 'kabukiza', windmill: 'kabukiza', keirin: 'ballpark', racecourse: 'dome', skyGarden: 'onsen', triumphGate: 'church', pyramidHall: 'aquarium', redBrick: 'church', westernHouse: 'onsen', machiya: 'kabukiza', botanical: 'ballpark', zoo: 'ballpark', ancientRuins: 'ballpark', orbitalHotel: 'onsen' };
    const SIZE = { megaPark: [6, 6], boatRace: [5, 3], expoSite: [6, 5], redBrick: [4, 1], ancientRuins: [4, 3], machiya: [4, 2] };
    if (!ok && SUB[kind]) { const n0 = s.buildings.length;
      for (let rr = 3; rr < 40 && !ok; rr++) for (let dy = -rr; dy <= rr && !ok; dy += 2) for (let dx = -rr; dx <= rr && !ok; dx += 2) { if (Math.max(Math.abs(dx), Math.abs(dy)) < rr - 1) continue; if (g.act({ type: 'build', kind: SUB[kind], x: st.x + dx, y: st.y + dy }).ok) ok = true; }
      if (ok) { const bb = s.buildings[s.buildings.length - 1]; bb.kind = kind; if (SIZE[kind]) { bb.w = SIZE[kind][0]; bb.h = SIZE[kind][1]; } } void n0; }
    const b = s.buildings.find(b => b.kind === kind); if (b) { b.status = 'operating'; b.remain = 0; out[kind] = { at: (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1), w: b.w, h: b.h }; } else out[kind] = { err: msg }; }
  s.bVersion++; return out; }, ks);
console.log(JSON.stringify(r));
const night = new Set((process.env.NIGHT ?? 'amusementPark,clockTower,ironTower,kabukiza,dome,ballpark').split(','));
for (const k of ks) { const o = r[k]; if (!o || o.at === undefined) continue; const d = 60 + 28 * Math.max(o.w, o.h);
  for (const h of night.has(k) ? [10.5, 20.5] : [10.5]) {
    await page.evaluate(([t, h, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); v.yaw = 0.55; v.pitch = 0.4; }, [o.at, h, d]); await page.waitForTimeout(5000);
    await page.screenshot({ path: `shots/${NAME}-${k}-${h > 12 ? 'night' : 'day'}.png` }); } }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
