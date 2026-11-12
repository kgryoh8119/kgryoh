// 資金がないときのできごとの画面
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800);
await page.evaluate(() => { const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; g.state.cash = 100;
  g.state.events.active.push({ id: 'pipeBurst', start: g.state.month, target: g.state.buildings.find(b => b.kind === 'water').id, detail: '古い水道管が破裂し、半日断水しました。' }); window.__sumu.ui.refresh(); });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/v5-event-nocash.png' });
await page.click('[data-act="event"][data-arg="pipeBurst:1"]');
await page.waitForTimeout(300);
console.log(await page.evaluate(() => ({ active: window.__sumu.game.state.events.active.length, blocked: window.__sumu.game.blocked, cash: window.__sumu.game.state.cash, toast: document.querySelector('#toast').textContent })));
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
