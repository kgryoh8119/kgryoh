// v90 の画面確認：課題 → 原因を見る → 対策を試算 → 実行 → 月を進める → 結果、政策カード、年次報告、声の詳細。PC 幅とスマホ幅
// 使い方：npx vite build && node scripts/v90-ui.mjs  （PHONE=1 でスマホ幅 390×844）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'shots/v90';
fs.mkdirSync(OUT, { recursive: true });
const phone = !!process.env.PHONE, tag = phone ? 'sp' : 'pc';
if (phone) process.env.MOBILE = '1';
const { browser, page, errors } = await open(phone ? 390 : 1280, phone ? 844 : 800);
const shot = async n => { await page.waitForTimeout(300); await page.screenshot({ path: `${OUT}/${tag}-${n}.png` }); console.log('shot', n); };
await page.evaluate(() => { const S = window.__sumu; S.view.setQuality('low'); S.fixedQuality = true; const g = S.game; g.state.tutorial.done = true; g.state.goalPick = false; g.state.goals = [{ id: 'wait', base: 0, target: 10, diff: 1 }]; S.ui.refresh(); S.ui.renderModal(); });
await page.waitForTimeout(800);
const openPanel = async () => { if (phone) { const closed = await page.evaluate(() => document.getElementById('side').classList.contains('closed')); if (closed) await page.click('.tool.panelbtn'); await page.waitForTimeout(300); } };
const tab = async t => { await openPanel(); await page.click(`#tabs [data-arg="${t}"]`); await page.waitForTimeout(300); };
/** はみ出しの機械検査：横スクロールにしていない要素で、文字が箱からはみ出していないか */
const overflow = () => page.evaluate(() => [...document.querySelectorAll('#panel *, #modal *, #cands *')].filter(e => { const cs = getComputedStyle(e); if (cs.display === 'none' || !e.clientWidth) return false; if (e.closest('.f90-scroll') || ['auto', 'scroll'].includes(cs.overflowX)) return false; if (!e.closest('.f90-box, .f90-pol, .f90-report, .issue, .f90-bf, .f90-past')) return false; return e.scrollWidth > e.clientWidth + 1; }).map(e => `${e.tagName}.${e.className} ${e.scrollWidth}>${e.clientWidth} 「${(e.textContent || '').slice(0, 30)}」`).slice(0, 10));
const checks = {};
const advance = n => page.evaluate(n => { const S = window.__sumu, g = S.game; for (let i = 0; i < n; i++) { const s = g.state; for (const e of [...s.events.active]) S.game.act({ type: 'event', id: e.id, option: 0 }); s.pendingElection = null; g.speed = 3; g.tick(1.0001); } g.speed = 0; S.ui.refresh(); return g.state.month; }, n);

await tab('home');
await page.evaluate(() => document.querySelector('.issues')?.scrollIntoView());
await shot('01-issues');
checks.first = await page.$eval('.issues', e => !!e.querySelector('.f90-first'));
await page.click('.issues [data-act="ix"][data-arg^="cause|"]');
await page.waitForTimeout(1200); await page.evaluate(() => document.querySelector('.f90-box')?.scrollIntoView({ block: 'center' }));
await shot('02-cause');
checks.cause = await page.$$eval('.f90-box', e => e.length);
await page.click('.issues [data-act="ix"][data-arg^="trial|"]');
await page.waitForSelector('.f90-cmp', { timeout: 60000 });
await page.evaluate(() => document.querySelector('.f90-cmp')?.scrollIntoView({ block: 'center' }));
await shot('03-trial');
checks.trialRows = await page.$$eval('.f90-cmp tr', e => e.length);
const cash0 = await page.evaluate(() => window.__sumu.game.state.cash);
await page.click('.issues [data-act="ix"][data-arg^="run|"]');
checks.notYet = (await page.evaluate(() => window.__sumu.game.state.cash)) === cash0;
await page.evaluate(() => document.querySelector('[data-arg^="run|"]')?.scrollIntoView({ block: 'center' }));
await shot('04-confirm');
await page.click('.issues [data-act="ix"][data-arg^="run|"]');
await page.waitForTimeout(300);
checks.decisions = await page.evaluate(() => window.__sumu.game.state.decisions?.length ?? 0);
await shot('05-done');
await page.waitForFunction(() => window.__sumu.game.state.decisions?.[0]?.expect, null, { timeout: 60000 });
await advance(3);
await tab('home');
checks.fresh = await page.$$eval('.f90-new', e => e.length);
await page.evaluate(() => document.querySelector('.f90-new')?.scrollIntoView({ block: 'center' }));
await shot('06-result-badge');
const rb = await page.$('.issues [data-act="ix"][data-arg^="result|"] .f90-new');
if (rb) await rb.click(); else { const any = await page.$('.f90-past summary'); if (any) await any.click(); }
await page.waitForTimeout(300); await page.evaluate(() => document.querySelector('.f90-gap')?.scrollIntoView({ block: 'center' }));
await shot('07-result');
checks.gapTables = await page.$$eval('.f90-gap', e => e.length);
checks.over1 = await overflow();
// 年次報告：12 か月まで進める（年度末に自動で開く）
await advance(9);
await page.waitForTimeout(500);
checks.reportAuto = await page.evaluate(() => !!document.querySelector('#modal .f90-report'));
if (!checks.reportAuto) { await tab('home'); await page.click('[data-act="report"][data-arg="year"]'); }
await page.waitForSelector('#modal .f90-report');
await shot('08-report');
checks.overReport = await overflow();
await page.click('[data-act="report"][data-arg="close"]');
// 政策カード
await tab('policy');
await page.click('[data-act="ptrial"][data-arg="careStaff"]');
await page.waitForFunction(() => !document.querySelector('.f90-pol .note') || !document.querySelector('.f90-pol')?.textContent?.includes('試算しています'), null, { timeout: 60000 });
await page.waitForTimeout(500);
await page.evaluate(() => document.getElementById('pol-careStaff')?.closest('.card')?.scrollIntoView());
await shot('09-policy');
checks.overPolicy = await overflow();
// 声
await tab('voice');
const vq = await page.$('.voice [data-act="vsel"]');
if (vq) { await vq.click(); await page.waitForTimeout(1500); await page.evaluate(() => document.querySelector('.f90-vd')?.scrollIntoView({ block: 'center' })); }
await shot('10-voice');
checks.voice = await page.$$eval('.f90-vd', e => e.length);
checks.overVoice = await overflow();
// 建設メニューの詳細
await page.evaluate(() => { const S = window.__sumu; S.ui.setTool({ t: 'build', kind: 'nursery' }); });
await page.waitForTimeout(400);
await page.evaluate(() => { const d = document.querySelector('.f90-bf'); if (d) d.open = true; });
await shot('11-build');
checks.overBuild = await overflow();
checks.pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
console.log(JSON.stringify(checks, null, 1));
console.log('errors', errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
