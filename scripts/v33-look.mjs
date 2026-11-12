// v33：新しい建物（車両基地・リニア・次世代交通・領事館・デパート・未来タワー・万博・昔の建物・外国風の名所・自動運転）と、レアな景色、市政の鉄道
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
const KS = ['railDepot', 'maglevStation', 'hyperloop', 'consulate', 'department', 'futureTower', 'expoSite', 'redBrick', 'westernHouse', 'machiya', 'clockTower', 'ironTower', 'windmill', 'pyramidHall', 'triumphGate', 'autoHub'];
const placed = await page.evaluate(KS => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.cash = 1e7; s.mode = 'sandbox';
  const out = {}; let x = 46, y = 41;
  const free = (x, y, w, h) => { for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) { if (xx >= 76 || yy >= 56) return false; const i = yy * 76 + xx; if (s.road[i] || s.occ[i]) return false; } return true; };
  const tmpl = s.buildings.find(b => b.kind === 'park') ?? s.buildings[0];
  for (const k of KS) { const d = S.DEFS[k]; let done = false; for (let yy = 2; yy < 52 && !done; yy += 1) for (let xx = 2; xx < 72 && !done; xx += 1) { if (!free(xx - 1, yy - 1, d.w + 2, d.h + 2)) continue;
      const b = JSON.parse(JSON.stringify(tmpl)); Object.assign(b, { id: s.nextId++, kind: k, x: xx, y: yy, w: d.w, h: d.h, status: 'operating', remain: 0, builtMonth: -5, lv: 1, opts: undefined, style: undefined }); s.buildings.push(b);
      for (let y2 = yy; y2 < yy + d.h; y2++) for (let x2 = xx; x2 < xx + d.w; x2++) s.occ[y2 * 76 + x2] = b.id; out[k] = [xx, yy]; done = true; } }
  s.bVersion++;
  S.stepMonth(s); s.events.active = []; S.view.hour = 13; S.view.clockRun = false; return out; }, KS);
console.log(JSON.stringify(placed));
const shots = [];
for (const [i, k] of KS.entries()) { const p = placed[k]; if (!p) continue; await page.evaluate(([x, y]) => { const S = window.__sumu; S.view.focus(y * 76 + x, 230); }, p); await page.waitForTimeout(900); const f = `shots/v33-${k}.png`; await page.screenshot({ path: f, clip: { x: 200, y: 120, width: 640, height: 520 } }); shots.push(f); }
await page.evaluate(() => { const S = window.__sumu; S.view.rareForce = 'balloon'; S.view.wKey = ''; S.view.focus(30 * 76 + 40, 900); });
await page.waitForTimeout(1500); await page.screenshot({ path: 'shots/v33-rare.png' });
await page.evaluate(() => { const S = window.__sumu; document.getElementById('side')?.classList.remove('closed'); S.ui.tab = 'city'; S.ui.openK.add('home-🚃 鉄道と街づくり'); S.ui.openK.add('home-🏟 国際大会・万博の誘致'); S.ui.renderSide(); });
await page.waitForTimeout(500); await page.screenshot({ path: 'shots/v33-city.png' });
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
