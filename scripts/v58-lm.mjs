// v58：名所を 1 つずつ置いて撮り、撮ったら取り除く（場所の取り合いを避ける）。KINDS=, NIGHT=, NAME=
import { open } from './shot.mjs';
const NAME = process.env.NAME ?? 'v58';
const KINDS = process.env.KINDS.split(',');
const NIGHT = new Set((process.env.NIGHT ?? '').split(','));
const SUB = { grandShrine: 'ballpark', airshipMast: 'kabukiza', megaPark: 'dome', boatRace: 'dome', skiResort: 'aquarium', skyscraper: 'aquarium', futureTower: 'aquarium', giantRobot: 'onsen', observatory: 'onsen', university: 'ballpark', megaFloat: 'dome', expoSite: 'dome', moonBase: 'kabukiza', windmill: 'kabukiza', keirin: 'ballpark', racecourse: 'dome', skyGarden: 'onsen', triumphGate: 'church', pyramidHall: 'aquarium', redBrick: 'church', westernHouse: 'onsen', machiya: 'kabukiza', botanical: 'ballpark', zoo: 'ballpark', ancientRuins: 'ballpark', orbitalHotel: 'onsen' };
const SIZE = { megaPark: [6, 6], boatRace: [5, 3], expoSite: [6, 5], redBrick: [4, 1], ancientRuins: [4, 3], machiya: [4, 2] };
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.cash = 1e12; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none';
  document.getElementById('app').classList.add('photo'); S.view.clockRun = false; S.view.weatherForce = 'clear'; g.speed = 0; });
const out = {};
for (const kind of KINDS) {
  const o = await page.evaluate(([kind, sub, size]) => { const S = window.__sumu, g = S.game, s = g.state, st = s.buildings.find(b => b.kind === 'station') ?? s.buildings[0]; s.cash = 1e12; let last = '';
    const tryK = (k) => { for (let rr = 3; rr < 40; rr++) for (let dy = -rr; dy <= rr; dy += 2) for (let dx = -rr; dx <= rr; dx += 2) { if (Math.max(Math.abs(dx), Math.abs(dy)) < rr - 1) continue; const r = g.act({ type: 'build', kind: k, x: st.x + dx, y: st.y + dy }); if (r.ok) return true; last = r.msg; } return false; };
    let ok = tryK(kind);
    if (!ok && sub) { ok = tryK(sub); if (ok) { const bb = s.buildings[s.buildings.length - 1]; bb._orig = [bb.kind, bb.w, bb.h]; bb.kind = kind; if (size) { bb.w = size[0]; bb.h = size[1]; } } }
    const b = s.buildings.find(b => b.kind === kind); if (!b) return { err: last };
    b.status = 'operating'; b.remain = 0; s.bVersion++; return { id: b.id, at: (b.y + (b.h >> 1)) * S.W + b.x + (b.w >> 1), w: b.w, h: b.h }; }, [kind, SUB[kind], SIZE[kind]]);
  out[kind] = o; if (o.err) continue;
  const d = 60 + 28 * Math.max(o.w, o.h);
  for (const h of NIGHT.has(kind) ? [10.5, 20.5] : [10.5]) {
    await page.evaluate(([t, h, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); v.yaw = 0.55; v.pitch = 0.4; }, [o.at, h, d]); await page.waitForTimeout(5000);
    await page.screenshot({ path: `shots/${NAME}-${kind}-${h > 12 ? 'night' : 'day'}.png` });
  }
  await page.evaluate((id) => { const g = window.__sumu.game; g.state.cash = 1e12; const b = g.state.buildings.find(b => b.id === id); if (b && b._orig) { [b.kind, b.w, b.h] = b._orig; delete b._orig; } g.act({ type: 'demolish', id }); }, o.id);
  await page.waitForTimeout(800);
}
console.log(JSON.stringify(out)); console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
