import { open } from './shot.mjs';
const t0 = Date.now();
const { browser, page, errors } = await open(1280, 800);
console.log('opened', Date.now() - t0);
await page.evaluate(() => { const v = window.__sumu.view; v.__frame = v.frame; v.frame = () => {}; window.__sumu.view.setQuality('low'); });
const dump = () => page.evaluate(() => { const m = document.getElementById('modal'); const d = m && !m.hidden ? m.querySelector('.dialog') : null; const s = window.__sumu.game.state; return { modal: d?.getAttribute('aria-label'), text: d?.textContent?.slice(0, 400), btns: d ? [...d.querySelectorAll('[data-act]')].slice(0, 30).map(b => b.dataset.act + ':' + (b.dataset.arg ?? '') + ':' + b.textContent.trim().slice(0, 20)) : [], tut: s.tutorial, goalPick: s.goalPick, mode: s.mode, month: s.month, pop: Math.round(s.stats.pop), cash: Math.round(s.cash), title: document.getElementById('title')?.outerHTML.slice(0, 200), tutbox: [...document.querySelectorAll('[class*=tut], [id*=tut]')].map(e => e.id + '.' + e.className + ':' + e.textContent.slice(0, 150)) }; });
for (const g of ['wait', 'water', 'fiscal']) { await page.click(`#modal [data-act="gpick"][data-arg="${g}"]`); await page.waitForTimeout(150); }
console.log(await page.evaluate(() => [...document.querySelectorAll('#modal [data-act]')].slice(30).map(b => b.dataset.act + ':' + (b.dataset.arg ?? '') + ':' + b.textContent.trim().slice(0, 30) + (b.disabled ? '(dis)' : ''))));
console.log(await page.evaluate(() => document.getElementById('tutorial')?.innerHTML.slice(0, 1500)));
console.log('errors', errors);
await browser.close();
