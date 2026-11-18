// v90 受入検証（スマホ幅 390×844）：主要な画面（課題・試算・政策カード・年次報告・選挙）だけを画面のボタンで通し、はみ出しを調べる。
// 時間送りは g.tick（できごとは先頭の選択肢を画面で押す）。使い方：npx vite build && node scripts/v90-accept-sp.mjs
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v90';
fs.mkdirSync(OUT, { recursive: true });
process.env.MOBILE = '1';
const { browser, page, errors } = await open(390, 844, 'sumino');
const R = { overflow: [], steps: [] };
await page.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('low'); S.fixedQuality = true; });
const draw = (n = 2) => page.evaluate(n => { const v = window.__sumu.view; for (let i = 0; i < n; i++) v.__frame.call(v, 0.25); }, n);
const overflow = () => page.evaluate(() => {
  const bad = [...document.querySelectorAll('#panel *, #modal *, #info *, #tutorial *')].filter(e => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || !e.clientWidth) return false; if (e.closest('.f90-scroll') || ['auto', 'scroll'].includes(cs.overflowX)) return false; if (['INPUT', 'TEXTAREA', 'SELECT', 'CANVAS', 'svg'].includes(e.tagName)) return false; if (cs.textOverflow === 'ellipsis') return false; return e.scrollWidth > e.clientWidth + 1; })
    .map(e => `${e.tagName}.${String(e.className).slice(0, 30)} ${e.scrollWidth}>${e.clientWidth}「${(e.textContent || '').trim().slice(0, 24)}」`);
  return { els: bad.slice(0, 8), n: bad.length, page: document.documentElement.scrollWidth > innerWidth };
});
const shot = async name => { await draw(); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/sp-${name}.png` }); const o = await overflow(); R.overflow.push({ name, ...o }); console.log('shot', name, o.n ? `はみ出し ${o.n} ${o.els.join(' / ')}` : '', o.page ? '横スクロールあり' : ''); };
const step = (name, ok, d = '') => { R.steps.push({ name, ok, d }); console.log(ok ? '✓' : '✗', name, d); };
const label = () => page.evaluate(() => { const m = document.getElementById('modal'); return m && !m.hidden ? m.querySelector('.dialog')?.getAttribute('aria-label') ?? '?' : null; });
const panel = async () => { if (await page.evaluate(() => document.getElementById('side').classList.contains('closed'))) await page.click('.tool.panelbtn'); await page.waitForTimeout(250); };
const tab = async t => { await panel(); await page.click(`#tabs [data-arg="${t}"]`); await page.waitForTimeout(250); };
const modals = async (keepReport = false) => { for (let g = 0; g < 8; g++) { const l = await label(); if (!l) return; if (keepReport && await page.$('#modal .f90-report')) return; if (await page.$('#modal .f90-report')) { await page.click('#modal [data-act="report"][data-arg="close"]'); continue; } if (await page.$('#modal .opt:not([disabled])')) { await page.click('#modal .opt:not([disabled])'); await page.waitForTimeout(150); continue; } if (l === '開票速報' || await page.$('#modal [data-act="election"]')) return; const b = await page.$('#modal button:text-is("閉じる"), #modal [data-act$="close"]') ?? await page.$('#modal .btnrow .btn.primary'); if (b) { await b.click(); await page.waitForTimeout(150); continue; } return; } };
const advance = async (n, keepReport = false) => { for (let i = 0; i < n; i++) { const el = await page.evaluate(() => { const g = window.__sumu.game; g.speed = 3; g.tick(1.0001); g.speed = 0; window.__sumu.ui.refresh(); window.__sumu.ui.renderModal(); return !!g.state.pendingElection; }); if (keepReport && await page.$('#modal .f90-report')) return 'report'; await modals(); if (el) return 'el'; } return null; };
try {
  await shot('01-pledge');
  for (const g of ['wait', 'water', 'fiscal']) await page.click(`#modal [data-act="gpick"][data-arg="${g}"]`);
  await page.click('#modal [data-act="gok"]'); await page.waitForTimeout(300);
  await shot('02-tutorial');
  await page.click('#tutorial [data-act="tutskip"]'); await page.waitForTimeout(300); await modals();
  await tab('home'); await page.evaluate(() => document.querySelector('.issues')?.scrollIntoView());
  await shot('03-issues');
  const key = await page.$eval('.f90-first', e => e.closest('.issue').querySelector('[data-arg^="cause|"]').dataset.arg.slice(6));
  const card = `.issues .issue:has([data-arg="cause|${key}"])`;
  await page.click(`${card} [data-act="ix"][data-arg="trial|${key}"]`);
  await page.waitForSelector(`${card} .f90-cmp`, { timeout: 120000 });
  await page.evaluate(sel => document.querySelector(sel + ' .f90-cmp')?.scrollIntoView({ block: 'center' }), card);
  await shot('04-trial');
  // 駅前の容積を上げる（水道が足りない注意）
  const labels = await page.$$eval(`${card} .f90-opt`, e => e.map(x => x.textContent));
  const k = labels.findIndex(l => /容積を上げる/.test(l));
  if (k >= 0) { await page.click(`${card} input[data-arg="pick|${key}|${k}"]`); await page.waitForSelector(`${card} .f90-cmp`, { timeout: 120000 }); await page.evaluate(sel => document.querySelector(sel + ' p.f90-warn')?.scrollIntoView({ block: 'start' }), card); await shot('05-trial-upzone-warn'); step('容積を上げる試算に水道の注意', !!(await page.$(`${card} p.f90-warn`))); }
  await tab('policy');
  await page.click('[data-act="ptrial"][data-arg="deferRenew"]');
  await page.waitForFunction(() => !document.getElementById('pol-deferRenew')?.closest('.card')?.textContent.includes('試算しています'), null, { timeout: 120000 });
  await page.evaluate(() => document.getElementById('pol-deferRenew')?.closest('.card')?.scrollIntoView());
  await shot('06-policy-defer');
  const r = await advance(12, true);
  step('年次報告（12 か月）', r === 'report' || !!(await page.$('#modal .f90-report')), String(r));
  if (await page.$('#modal .f90-report')) { await shot('07-report'); await page.click('#modal [data-act="report"][data-arg="close"]'); }
  let el = null; for (let g = 0; g < 40 && el !== 'el'; g++) el = await advance(1, true) ?? el;
  if (await page.$('#modal .f90-report')) { await shot('08-term-report'); await page.click('#modal [data-act="report"][data-arg="close"]'); await page.waitForTimeout(200); }
  await page.evaluate(() => window.__sumu.ui.renderModal());
  if ((await label()) === '開票速報') { await page.waitForTimeout(3000); await page.evaluate(() => window.__sumu.ui.renderModal()); await shot('09-count'); const sk = await page.$('#modal [data-act="countskip"]'); if (sk) await sk.click(); await page.waitForTimeout(300); }
  step('選挙の結果', !!(await page.$('#modal [data-act="election"]')), await label());
  await shot('10-election');
} catch (e) { step('途中で止まった', false, String(e).slice(0, 300)); await page.screenshot({ path: `${OUT}/sp-zz-error.png` }); }
R.errors = errors; fs.writeFileSync(`${OUT}/accept-sp.json`, JSON.stringify(R, null, 1));
console.log('errors', errors.length, errors.slice(0, 5)); console.log('overflow', R.overflow.filter(o => o.n || o.page).map(o => o.name + ':' + o.n + (o.page ? '+page' : '')));
await browser.close();
