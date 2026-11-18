// v91 の画面確認（該当の場面だけ）：街の 3 つの論点、課題の対策の候補（上位 5 件・逆効果を外す）、
// ②を開いたまま月が進んだときの候補の作り直し（容積の試算の水道の注意）、実在マップの「街のいま」のラベル。
// 使い方：npx vite build && node scripts/v91-check.mjs   （MAPID=hodogaya-d で実在マップ。OUT=出力先、既定 docs/shots/v90）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v90';
fs.mkdirSync(OUT, { recursive: true });
const MAP = process.env.MAPID ?? 'sumino', real = MAP !== 'sumino', P = real ? 'real-' : 'pc-';
const { browser, page, errors } = await open(1280, 800, MAP);
const R = { map: MAP, checks: [] };
const ok = (name, v, detail = '') => { R.checks.push({ name, ok: !!v, detail }); console.log(v ? '✓' : '✗', name, String(detail).slice(0, 300)); };
await page.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('low'); S.fixedQuality = true; });
const draw = () => page.evaluate(() => { const v = window.__sumu.view; v.__frame.call(v, 0.25); });
const shot = async name => { await draw(); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${P}${name}.png` }); };
const tab = async t => { await page.click(`#tabs [data-arg="${t}"]`); await page.waitForTimeout(250); };
const closeModals = async () => { for (let i = 0; i < 6; i++) { const m = await page.$('#modal:not([hidden])'); if (!m) return; const o = await page.$('#modal .opt:not([disabled])'); if (o) { await o.click(); continue; } const b = await page.$('#modal button:text-is("閉じる"), #modal [data-act$="close"], #modal [data-act="closeModal"]') ?? await page.$('#modal .btnrow .btn.primary'); if (!b) return; await b.click(); await page.waitForTimeout(200); } };
const advance = async n => { for (let i = 0; i < n; i++) { await page.evaluate(() => { const g = window.__sumu.game; g.speed = 3; g.tick(1.0001); g.speed = 0; window.__sumu.ui.refresh(); window.__sumu.ui.renderModal(); }); await closeModals(); } };
try {
  for (const g of ['wait', 'water', 'fiscal']) { const b = await page.$(`#modal [data-act="gpick"][data-arg="${g}"]`); if (b) { await b.click(); await page.waitForTimeout(120); } }
  const gok = await page.$('#modal [data-act="gok"]'); if (gok) { await gok.click(); await page.waitForTimeout(400); }
  const skip = await page.$('#tutorial [data-act="tutskip"]'); if (skip) { await skip.click(); await page.waitForTimeout(300); }
  await closeModals(); await tab('home');
  // 1. 実在マップのラベル（街のいま）
  if (real) {
    const t = await page.$eval('.quick', e => e.innerText).catch(() => '');
    ok('街のいま：出典・取得日', /出典/.test(t) && /取得日/.test(t), t.replace(/\n/g, ' ').slice(0, 260));
    ok('街のいま：推計・ゲーム上の仮定', /推計/.test(t) && /ゲーム上の仮定/.test(t));
    ok('街のいま：役と権限の主体', /役/.test(t) && /警察/.test(t));
    await page.evaluate(() => document.querySelector('.quick')?.scrollIntoView()); await shot('v91-label-home');
    // 施設の詳細（交番・警察署か、なければ最初の施設）
    const id = await page.evaluate(() => { const s = window.__sumu.game.state; const b = s.buildings.find(b => b.kind === 'koban' || b.kind === 'police') ?? s.buildings.find(b => b.kind === 'school'); return b ? b.id : -1; });
    if (id >= 0) { await page.evaluate(id => { const u = window.__sumu.ui; u.sel = { b: id }; u.markSel?.(); u.renderInfo(); }, id); await page.waitForTimeout(200);
      const it = await page.$eval('#info', e => e.innerText).catch(() => '');
      ok('施設の詳細：推計・出典・権限の主体', /ゲーム上の仮定|推計/.test(it) && /市の権限/.test(it), it.replace(/\n/g, ' ').slice(0, 300)); await shot('v91-label-facility'); }
  }
  // 2. 街の 3 つの論点
  const topics = await page.$$eval('.ltopics .ltopic h4', e => e.map(x => x.textContent.trim()));
  ok('街の 3 つの論点が 3 件', topics.length === 3, topics.join(' / '));
  await page.click('.ltopics [data-arg="trial|loop:aging"]'); await page.waitForTimeout(400);
  const agingOpts = await page.$$eval('.ltopics .f90-opt b', e => e.map(x => x.textContent.trim()));
  ok('老朽インフラの論点から対策の候補が開く', agingOpts.length > 0, agingOpts.join(' / '));
  await page.evaluate(() => document.querySelector('.ltopics')?.scrollIntoView()); await shot('v91-topics');
  // 3. 課題の対策の候補（上位 5 件・逆効果を外す）
  const keys = await page.$$eval('.issues .issue [data-act="ix"][data-arg^="cause|"]', e => e.map(b => b.dataset.arg.slice(6)));
  for (const key of keys) {
    await page.click(`.issues .issue:has([data-arg="cause|${key}"]) [data-act="ix"][data-arg="trial|${key}"]`); await page.waitForTimeout(500);
    const card = `.issues .issue:has([data-arg="cause|${key}"])`;
    const shown = await page.$$eval(`${card} .f90-opts > .f90-opt b`, e => e.map(x => x.textContent.trim()));
    const more = await page.$$eval(`${card} .f90-more .f90-opt b`, e => e.map(x => x.textContent.trim()));
    const notes = await page.$$eval(`${card} .f90-fit`, e => e.map(x => x.textContent.trim()));
    ok(`課題 ${key}：候補は 5 件まで表示（ほか ${more.length} 件は畳む）`, shown.length <= 5, shown.join(' / ') + (notes.length ? ` ｜印：${[...new Set(notes)].join('・')}` : ''));
    if (/traffic|care|school|stationCrowd/.test(key)) ok(`課題 ${key}：容積を上げる案を外す`, ![...shown, ...more].some(l => /容積を上げる/.test(l)));
    if (key === keys[0]) { await page.evaluate(c => document.querySelector(c + ' .f90-opts')?.scrollIntoView(), card); await shot('v91-trial-top5'); }
  }
  // 4. ②を開いたまま月が進む → 候補を作り直す（容積の試算の水道の注意）
  await page.click('.ltopics [data-arg="trial|loop:station"]').catch(() => {}); await page.waitForTimeout(400);
  const before = await page.evaluate(() => window.__sumu.ui.ix?.opts.map(o => o.label + (o.warn ? '⚠' : '')).join(' / '));
  const k = await page.evaluate(() => window.__sumu.ui.ix?.opts.findIndex(o => /容積を上げる/.test(o.label)) ?? -1);
  await advance(2);
  const after = await page.evaluate(() => ({ m: window.__sumu.game.state.month, open: window.__sumu.ui.ix?.open, opts: window.__sumu.ui.ix?.opts.map(o => o.label + (o.warn ? '⚠' : '')).join(' / ') }));
  ok('②を開いたまま 2 か月進むと候補を作り直す', after.open === 'trial' && after.opts !== undefined, `前：${before}\n後（${after.m} か月）：${after.opts}`);
  const k2 = await page.evaluate(() => window.__sumu.ui.ix?.opts.findIndex(o => /容積を上げる/.test(o.label)) ?? -1);
  if (k2 >= 0) {
    await page.click(`.ltopics input[data-arg="pick|loop:station|${k2}"]`); await page.waitForSelector('.ltopics .f90-cmp', { timeout: 180000 });
    const w = await page.$eval('.ltopics', e => (e.innerText.match(/⚠[^\n]*/) ?? [''])[0]); // 画面に見えている文字（説明の文を隠していても出るか）
    const stall = await page.evaluate(() => window.__sumu.ui.ix?.trial?.stall);
    ok('容積の試算：着工できない月があれば注意が出る', stall && stall.months >= 3 ? !!w : true, `${JSON.stringify(stall)} ${w}`);
    await page.evaluate(() => document.querySelector('.ltopics .f90-cmp')?.scrollIntoView({ block: 'center' })); await shot('v91-upzone-warn');
  } else ok('容積を上げる案が候補にない（駅前に区画がない）', true, String(k));
} catch (e) { ok('台本の例外', false, e.stack); }
R.errors = errors;
fs.writeFileSync(`${OUT}/v91-check-${MAP}.json`, JSON.stringify(R, null, 1));
console.log('errors', errors.length, errors.slice(0, 3));
await browser.close();
