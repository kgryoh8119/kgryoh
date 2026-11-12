// 実在の地図・まちづくり版で、公約選び→施設の配置→数か月進めてもエラーが出ないか
import { open } from './shot.mjs';
const id = process.env.MAPID;
const { browser, page, errors } = await open(1440, 900, id);
await page.waitForTimeout(500);
const ok = await page.evaluate(() => !!document.querySelector('[data-act="gok"]'));
await page.evaluate(() => { const u = window.__sumu.ui; u.gp = ['wait', 'pop', 'jobs']; u.gv = 'industry'; });
await page.click('[data-act="gvision"][data-arg="industry"]'); await page.click('[data-act="gvision"][data-arg="industry"]');
await page.evaluate(() => { const u = window.__sumu.ui; u.gp = ['wait', 'pop', 'jobs']; u.renderModal(); });
await page.click('[data-act="gok"]');
const r = await page.evaluate(() => { const g = window.__sumu.game; g.state.tutorial.done = true; g.state.cash += 300000;
  const out = [];
  for (let i = 0; i < 12; i++) { g.speed = 3; g.tick(1); for (const e of [...g.state.events.active]) g.act({ type: 'event', id: e.id, option: 0 }); }
  g.speed = 0; window.__sumu.ui.tab = 'term'; window.__sumu.ui.refresh();
  return { m: g.state.month, pop: Math.round(g.state.stats.pop), goals: g.state.goals.length, lv: g.state.stats.lv.map(v => v.toFixed(2)).join(','), power: [g.state.stats.powerDemand, g.state.stats.powerCap].map(Math.round), sew: [g.state.stats.sewageDemand, g.state.stats.sewageCap].map(Math.round) }; });
await page.click('[data-act="layer"][data-arg="health"]');
await page.waitForTimeout(800);
await page.screenshot({ path: `shots/v5-real-${id}.png` });
console.log(id, ok, JSON.stringify(r)); console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
