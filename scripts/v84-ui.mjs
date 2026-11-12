// 第 1 段階の画面確認：試算モードの帯（費用の合計・失敗の表示）、返り咲きの条件の表、「未保存」の表示
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
const shot = n => page.screenshot({ path: `shots/v84-${n}.png`, timeout: 280000 });
const out = {};
// B：計画案
out.draft = await page.evaluate(() => { const { game: g, ui } = window.__sumu; g.startDraft(); g.act({ type: 'build', kind: 'nursery', x: 14, y: 16 }); g.act({ type: 'policy', id: 'careStaff', on: true }); ui.render?.(); return g.draftSummary(); });
await page.waitForTimeout(1500); out.bar1 = await page.evaluate(() => document.getElementById('banner')?.innerText ?? [...document.querySelectorAll('[data-act=draftcommit]')].map(b => b.parentElement.innerText).join('|'));

await page.evaluate(() => { const { game: g } = window.__sumu; g.state.cash = 100; });
await page.evaluate(() => document.querySelector('[data-act=draftcommit]').click()); await page.waitForTimeout(1500);
out.bar2 = await page.evaluate(() => document.querySelector('[data-act=draftcommit]').parentElement.innerText);
out.afterFail = await page.evaluate(() => { const { game: g } = window.__sumu; return { cash: g.state.cash, draft: g.draft?.actions.length, nurseries: g.state.buildings.filter(b => b.kind === 'nursery' && b.x === 14).length }; });
await shot('draft-fail');
await page.evaluate(() => document.querySelector('[data-act=draftdrop]').click()); await page.waitForTimeout(1000);
out.bar3 = await page.evaluate(() => document.querySelector('[data-act=draftcommit]').parentElement.innerText);
await page.evaluate(() => document.querySelector('[data-act=draftcommit]').click()); await page.waitForTimeout(1000);
out.afterOk = await page.evaluate(() => { const { game: g } = window.__sumu; return { draft: !!g.draft, careStaff: g.state.policies.careStaff?.on, undo: g.canUndo, undoShown: !document.getElementById('undo').hidden, undoText: document.getElementById('undo').innerText }; });
// C：保存の失敗
out.save = await page.evaluate(() => { const { game: g } = window.__sumu; const o = Storage.prototype.setItem; Storage.prototype.setItem = function () { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); }; const r = g.saveSlot('auto'); window.__restore = () => { Storage.prototype.setItem = o; }; return { r, mark: !document.getElementById('unsaved').hidden, title: document.getElementById('unsaved').title }; });
await page.waitForTimeout(800); 
await page.evaluate(() => document.querySelector('#unsaved').click()); await page.waitForTimeout(800);
out.menu = await page.evaluate(() => document.querySelector('.savefail')?.innerText); await shot('unsaved-menu');
out.retryFail = await page.evaluate(async () => { document.querySelector('[data-act=saveretry]').click(); await new Promise(r => setTimeout(r, 300)); return !document.getElementById('unsaved').hidden; });
out.retryOk = await page.evaluate(async () => { window.__restore(); document.querySelector('[data-act=saveretry]').click(); await new Promise(r => setTimeout(r, 300)); return { mark: !document.getElementById('unsaved').hidden, box: !!document.querySelector('.savefail'), last: window.__sumu.game.lastOk?.where }; });

// A：返り咲きの画面
await page.evaluate(() => { const { game: g, ui } = window.__sumu; ui.menu = false; ui.renderModal(); const s = g.state; s.mode = 'sandbox'; s.goals = []; s.elections = [{ month: s.month - 12, term: 1, vote: 45.2, win: false, support: 0.5, pledgesKept: [], parts: [], typeSupport: [] }]; s.approval = 0.49996; g.changed?.(); });
for (const t of ['term']) { await page.evaluate(t => document.querySelector(`[data-act=tab][data-arg=${t}]`)?.click(), t); }
await page.waitForTimeout(1200);
out.tabs = await page.evaluate(() => [...document.querySelectorAll('[data-act=tab]')].map(b => b.dataset.arg + ':' + b.innerText));
out.rerun = await page.evaluate(() => { const b = document.querySelector('[data-act=rerun]'); const sec = b?.closest('section'); return { text: sec?.innerText, disabled: b?.disabled }; });
await shot('rerun');
console.log(JSON.stringify(out, null, 1)); console.log('errors', errors);
await browser.close();
