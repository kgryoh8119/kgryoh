// v95：秘書・担当者の発言の画面を撮り、スマホ幅（390）ではみ出し・横スクロールを機械検査する。
// 使い方：npx vite build && node scripts/v95-staff.mjs   （OUT=出力先、既定 docs/shots/v95-ui。WIDE=1 で 1280 幅）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v95-ui';
fs.mkdirSync(OUT, { recursive: true });
const wide = !!process.env.WIDE;
if (!wide) process.env.MOBILE = '1';
const { browser, page, errors } = await open(wide ? 1280 : 390, wide ? 860 : 844, 'sumino');
const R = [];
await page.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('low'); S.fixedQuality = true; });
const draw = () => page.evaluate(() => { const v = window.__sumu?.view; if (v?.__frame) v.__frame.call(v, 0.25); });
const inspect = () => page.evaluate(() => {
  const all = [...document.querySelectorAll('#panel, #panel *, #modal *')];
  const over = all.filter(e => { const cs = getComputedStyle(e); if (cs.display === 'none' || !e.clientWidth) return false; if (e.closest('.f90-scroll') || ['auto', 'scroll'].includes(cs.overflowX)) return false; if (['INPUT', 'CANVAS', 'svg'].includes(e.tagName)) return false; return e.scrollWidth > e.clientWidth + 1; }).map(e => `${e.tagName}.${String(e.className).slice(0, 20)}「${(e.textContent || '').trim().slice(0, 16)}」`);
  return { over: over.slice(0, 6), nOver: over.length, page: document.documentElement.scrollWidth > innerWidth, says: document.querySelectorAll('#panel .st-say').length };
});
const shot = async (name) => { await draw(); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${wide ? 'pc' : 'sp'}-${name}.png` }); const o = await inspect(); R.push({ name, ...o }); console.log('shot', name, JSON.stringify(o)); };
const label = () => page.evaluate(() => { const m = document.getElementById('modal'); return m && !m.hidden ? m.querySelector('.dialog')?.getAttribute('aria-label') ?? '?' : null; });
const modals = async () => { for (let g = 0; g < 8; g++) { if (!(await label())) return; if (await page.$('#modal .f90-report')) { await page.click('#modal [data-act="report"][data-arg="close"]'); continue; } const o = await page.$('#modal .opt:not([disabled])'); if (o) { await o.click(); continue; } const b = await page.$('#modal button:text-is("閉じる"), #modal [data-act$="close"]') ?? await page.$('#modal .btnrow .btn.primary'); if (b) { await b.click(); await page.waitForTimeout(150); continue; } return; } };
const advance = async n => { for (let i = 0; i < n; i++) { await page.evaluate(() => { const g = window.__sumu.game; g.speed = 3; g.tick(1.0001); g.speed = 0; g.state.pendingElection = null; window.__sumu.ui.refresh(); window.__sumu.ui.renderModal(); }); await modals(); } };
const panel = async () => { if (await page.evaluate(() => document.getElementById('side').classList.contains('closed'))) await page.click('.tool.panelbtn'); await page.waitForTimeout(250); };
const tab = async t => { await panel(); await page.click(`#tabs [data-arg="${t}"]`); await page.waitForTimeout(250); };
try {
  for (const g of ['wait', 'water', 'fiscal']) await page.click(`#modal [data-act="gpick"][data-arg="${g}"]`);
  await page.click('#modal [data-act="gok"]'); await page.waitForTimeout(300);
  await page.click('#tutorial [data-act="tutskip"]'); await page.waitForTimeout(300); await modals();
  await advance(3); await tab('home');
  await page.evaluate(() => document.querySelector('.st-brief')?.scrollIntoView({ block: 'start' }));
  await shot('01-brief');
  // 部長の「比べる」→ 担当者の試算の発言
  const cmp = await page.$('.st-brief .st-reply [data-act="ix"][data-arg^="trial|"]');
  if (cmp) { await cmp.click(); await page.waitForTimeout(1500); await page.evaluate(() => document.querySelector('.f90-box .st-say')?.scrollIntoView({ block: 'start' })); await shot('02-trial-talk'); }
  await tab('money'); await shot('03-money');
  // 淡々とした表示に戻せる
  await tab('home'); await page.evaluate(() => document.querySelector('.st-mode')?.click()); await page.waitForTimeout(300);
  const plain = await page.evaluate(() => !document.querySelector('#panel .st-brief') && !!document.querySelector('[data-act="staffmode"][data-arg="talk"]'));
  console.log(plain ? '✓' : '✗', '淡々とした表示に切り替わる');
  await page.evaluate(() => document.querySelector('[data-act="staffmode"][data-arg="talk"]')?.click());
} catch (e) { console.log('ERR', e.message); }
console.log('errors', errors.slice(0, 5));
fs.writeFileSync(`${OUT}/check-${wide ? 'pc' : 'sp'}.json`, JSON.stringify(R, null, 1));
await browser.close();
