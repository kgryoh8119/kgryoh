import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
const r = await page.evaluate(() => {
  const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; g.state.cash = 1e6;
  let done = null;
  for (let y = 0; y < 44 && !done; y++) for (let x = 0; x < 44; x++) { { const r = g.act({ type: 'build', kind: 'ballpark', x, y }); if (r.ok && !r.msg.includes('道路')) { done = [x, y]; break; } if (r.ok) g.act({ type: 'demolish', id: g.state.buildings.at(-1).id }); } }
  for (const b of g.state.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; b.staff = b.staffTarget ?? 0; }
  g.state.fame = 30; g.state.bVersion++;
  const t = g.act({ type: 'team', sport: 'baseball', on: true });
  window.__sumu.ui.tab = 'term'; window.__sumu.ui.refresh();
  if (done) window.__sumu.view.focus(done[1] * 44 + done[0] + 2 * 44 + 2, 420);
  return { done, t: t.msg };
});
console.log(JSON.stringify(r));
await page.waitForTimeout(1500);
await page.evaluate(() => { const p = document.querySelector('#panel'); const h = [...p.querySelectorAll('h2')].find(e => e.textContent.startsWith('プロスポーツ')); if (h) p.scrollTop = h.offsetTop - 10; });
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/team.png' });
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
