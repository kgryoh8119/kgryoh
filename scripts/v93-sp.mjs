// v93：スマホ幅（390×844）で、v91・v92 で変わった画面を撮り、はみ出し・横スクロール・押せないボタン（ほかの要素に覆われている）を機械検査する。
// 街の 3 つの論点／試算の上位 5 件と「ほかの候補を見る」／水道などの注意／タイトルの「この作品について」とライセンスの全文／地図の読み込み中・失敗の表示。
// REAL=1 で、実在マップ（まちづくり版）の「街のいま」の出典・推計の欄も撮る（重い）。
// 使い方：npx vite build && node scripts/v93-sp.mjs   （OUT=出力先、既定 docs/shots/v93）
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v93';
fs.mkdirSync(OUT, { recursive: true });
process.env.MOBILE = '1';
const MOB = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const { browser, page, errors } = await open(390, 844, 'sumino');
const R = { checks: [], overflow: [] };
const ok = (name, v, d = '') => { R.checks.push({ name, ok: !!v, d }); console.log(v ? '✓' : '✗', name, String(d).slice(0, 300)); };
await page.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('low'); S.fixedQuality = true; });
const draw = p => p.evaluate(() => { const v = window.__sumu?.view; if (v?.__frame) v.__frame.call(v, 0.25); });
/** はみ出し（横スクロールの箱の外で中身が幅を超える要素）・ページの横スクロール・画面内で覆われて押せないボタン */
const inspect = (p, root) => p.evaluate(root => {
  const scope = [...document.querySelectorAll(root)];
  const all = scope.flatMap(r => [r, ...r.querySelectorAll('*')]);
  const over = all.filter(e => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || !e.clientWidth) return false; if (e.closest('.f90-scroll') || ['auto', 'scroll'].includes(cs.overflowX)) return false; if (['INPUT', 'TEXTAREA', 'SELECT', 'CANVAS', 'svg', 'PRE'].includes(e.tagName)) return false; if (cs.textOverflow === 'ellipsis') return false; return e.scrollWidth > e.clientWidth + 1; })
    .map(e => `${e.tagName}.${String(e.className).slice(0, 24)} ${e.scrollWidth}>${e.clientWidth}「${(e.textContent || '').trim().slice(0, 20)}」`);
  const covered = all.filter(e => e.matches('button, a, summary, label.btn, input[type=radio], input[type=checkbox]')).filter(e => { const r = e.getBoundingClientRect(); if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return false; const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.pointerEvents === 'none') return false;
    // スクロールする箱の外に隠れている（スクロールすれば見える）ものは数えない
    for (let a = e.parentElement; a; a = a.parentElement) { const st = getComputedStyle(a); if (/(auto|scroll|hidden)/.test(st.overflowY + st.overflowX)) { const q = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; if (cx < q.left || cx > q.right || cy < q.top || cy > q.bottom) return false; } }
    const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2)), h = document.elementFromPoint(x, y); return h && h !== e && !e.contains(h) && !h.contains(e) && !(e.tagName === 'INPUT' && h.closest('label')?.contains(e)); })
    .map(e => { const r = e.getBoundingClientRect(), h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return `「${(e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 16)}」が ${h?.tagName}.${String(h?.className).slice(0, 20)} に覆われる`; });
  const small = all.filter(e => e.matches('button, summary, label.btn')).filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.bottom > 0 && r.top < innerHeight && (r.height < 24 || r.width < 24); }).map(e => `「${(e.textContent || '').trim().slice(0, 12)}」${Math.round(e.getBoundingClientRect().width)}×${Math.round(e.getBoundingClientRect().height)}`);
  return { over: over.slice(0, 8), nOver: over.length, page: document.documentElement.scrollWidth > innerWidth, covered: covered.slice(0, 8), nCovered: covered.length, small: small.slice(0, 6), nSmall: small.length };
}, root);
const shot = async (p, name, root = '#panel, #modal, #info, #tutorial') => { await draw(p); await p.waitForTimeout(150); await p.screenshot({ path: `${OUT}/sp-${name}.png` }); const o = await inspect(p, root); R.overflow.push({ name, ...o }); console.log('shot', name, o.nOver ? `はみ出し ${o.nOver} ${o.over.join(' / ')}` : '', o.page ? '横スクロールあり' : '', o.nCovered ? `覆われたボタン ${o.nCovered} ${o.covered.join(' / ')}` : '', o.nSmall ? `小さいボタン ${o.nSmall} ${o.small.join(' / ')}` : ''); return o; };
const label = () => page.evaluate(() => { const m = document.getElementById('modal'); return m && !m.hidden ? m.querySelector('.dialog')?.getAttribute('aria-label') ?? '?' : null; });
const modals = async () => { for (let g = 0; g < 8; g++) { if (!(await label())) return; if (await page.$('#modal .f90-report')) { await page.click('#modal [data-act="report"][data-arg="close"]'); continue; } const o = await page.$('#modal .opt:not([disabled])'); if (o) { await o.click(); continue; } const b = await page.$('#modal button:text-is("閉じる"), #modal [data-act$="close"], #modal [data-act="closeModal"]') ?? await page.$('#modal .btnrow .btn.primary'); if (b) { await b.click(); await page.waitForTimeout(150); continue; } return; } };
const advance = async n => { for (let i = 0; i < n; i++) { await page.evaluate(() => { const g = window.__sumu.game; g.speed = 3; g.tick(1.0001); g.speed = 0; g.state.pendingElection = null; window.__sumu.ui.refresh(); window.__sumu.ui.renderModal(); }); await modals(); } };
const panel = async () => { if (await page.evaluate(() => document.getElementById('side').classList.contains('closed'))) await page.click('.tool.panelbtn'); await page.waitForTimeout(250); };
const tab = async t => { await panel(); await page.click(`#tabs [data-arg="${t}"]`); await page.waitForTimeout(250); };
if (!process.env.TITLEONLY) try { // TITLEONLY=1 でタイトル画面だけ
  for (const g of ['wait', 'water', 'fiscal']) await page.click(`#modal [data-act="gpick"][data-arg="${g}"]`);
  await page.click('#modal [data-act="gok"]'); await page.waitForTimeout(300);
  await page.click('#tutorial [data-act="tutskip"]'); await page.waitForTimeout(300); await modals();
  // 1. 街の 3 つの論点
  await tab('home'); await page.evaluate(() => document.querySelector('.ltopics')?.scrollIntoView({ block: 'start' }));
  const topics = await page.$$eval('.ltopics .ltopic h4', e => e.map(x => x.textContent.trim()));
  ok('街の 3 つの論点が 3 件', topics.length === 3, topics.join(' / '));
  await shot(page, '01-topics');
  // 2. 駅前の論点の試算：上位 5 件と「ほかの候補を見る」
  await advance(2); await tab('home');
  await page.click('.ltopics [data-arg="trial|loop:station"]'); await page.waitForTimeout(400);
  await page.evaluate(() => document.querySelector('.ltopics .f90-opts, .ltopics .f90-opt')?.scrollIntoView({ block: 'start' }));
  const vis = await page.$$eval('.ltopics .f90-opt', e => e.filter(x => !x.closest('details.f90-more')).length);
  const moreSel = '.ltopics details.f90-more summary';
  ok('試算の候補は上位 5 件まで', vis > 0 && vis <= 5, `表示 ${vis} 件`);
  await shot(page, '02-trial-top5');
  if (await page.$(moreSel)) { await page.click(moreSel); await page.waitForTimeout(250); await page.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'start' }), moreSel); ok('「ほかの候補を見る」を開ける', await page.$eval('.ltopics details.f90-more', e => e.open)); await shot(page, '03-trial-more'); }
  else ok('「ほかの候補を見る」（畳む候補がない月）', true, '畳む候補なし');
  // 3. 容積を上げる試算の注意（⚠）：「？」を押さなくても見える
  const labels = await page.$$eval('.ltopics .f90-opt', e => e.map(x => x.textContent));
  const k = labels.findIndex(l => /容積を上げる/.test(l));
  if (k >= 0) {
    if (k >= 5 && await page.$(moreSel) && !(await page.$eval('.ltopics details.f90-more', e => e.open))) await page.click(moreSel);
    await page.click(`.ltopics input[data-arg="pick|loop:station|${k}"]`);
    await page.waitForSelector('.ltopics .f90-cmp', { timeout: 180000 });
    const w = await page.$$eval('.ltopics .f90-warn', e => e.map(x => ({ t: x.textContent.slice(0, 60), shown: !!x.offsetParent })));
    await page.evaluate(() => (document.querySelector('.ltopics p.f90-warn') ?? document.querySelector('.ltopics .f90-cmp'))?.scrollIntoView({ block: 'start' }));
    ok('容積の試算：注意は常に見える（隠れた注意 0）', w.every(x => x.shown), JSON.stringify(w));
    await shot(page, '04-upzone-warn');
  } else ok('容積を上げる候補', false, labels.join(' / ').slice(0, 200));
  // 4. 水道の不足を作って、課題の注意を見る（浄水場を止める）
  await page.evaluate(() => { const s = window.__sumu.game.state; for (const b of s.buildings) if (b.kind.startsWith('water')) b.status = 'suspended'; });
  await advance(1); await tab('home');
  const issueWarn = await page.$$eval('.issues .f90-warn, .issues .warn, .ltopics .f90-warn', e => e.map(x => ({ t: x.textContent.slice(0, 50), shown: !!x.offsetParent })));
  await page.evaluate(() => document.querySelector('.issues')?.scrollIntoView({ block: 'start' }));
  ok('水道を止めた月：注意が見える', issueWarn.every(x => x.shown), JSON.stringify(issueWarn).slice(0, 300));
  await shot(page, '05-water-issue');
} catch (e) { ok('ゲーム画面の途中で止まった', false, String(e).slice(0, 300)); await page.screenshot({ path: `${OUT}/sp-zz-error.png` }); }

// 5. タイトル：この作品について・ライセンスの全文・地図の読み込み中・失敗
const base = page.url().replace(/[^/]*$/, '');
const tp = await browser.newPage(MOB); const terr = []; tp.on('pageerror', e => terr.push(e.message));
try {
  await tp.goto(base + 'index.html'); await tp.waitForSelector('#title [data-t="start"]', { timeout: 120000 });
  await tp.click('#title .tabout summary'); await tp.waitForTimeout(200);
  await tp.evaluate(() => document.querySelector('#title .tabout')?.scrollIntoView({ block: 'start' }));
  await shot(tp, '06-title-about', '#title');
  const lic = await tp.$('#title .tlicense summary');
  ok('ライセンスの全文の欄がある', !!lic);
  if (lic) { await lic.click(); await tp.waitForTimeout(200); await tp.evaluate(() => document.querySelector('#title .tlicense')?.scrollIntoView({ block: 'start' })); const pre = await tp.$eval('#title .tlicense pre', e => ({ len: e.textContent.length, sw: e.scrollWidth, cw: e.clientWidth })); ok('ライセンスの全文：横にはみ出さない', pre.sw <= pre.cw + 1, JSON.stringify(pre)); await shot(tp, '07-title-license', '#title'); }
  // 読み込み中：地図データの応答を遅らせる → 失敗：404 を返す
  const real = await tp.$$eval('#title .mreal [data-t="start"]', e => e.map(b => b.dataset.id));
  ok('実在マップのカードがある', real.length > 0, real.join(','));
  if (real.length) {
    let release; const gate = new Promise(r => { release = r; });
    await tp.route(/maps\/.*\.json/, async route => { await gate; await route.fulfill({ status: 404, body: '' }); });
    await tp.click(`#title .mreal [data-t="start"][data-id="${real[0]}"]`); await tp.waitForTimeout(800);
    const loading = await tp.$eval('#title .tmsg', e => e.textContent).catch(() => '');
    ok('地図の読み込み中の表示', /読み込んでいます/.test(loading), loading);
    await tp.evaluate(() => document.querySelector('#title .tmsg')?.scrollIntoView({ block: 'center' }));
    await shot(tp, '08-title-loading', '#title');
    release(); await tp.waitForTimeout(1500);
    const fail = await tp.$eval('#title .tmsg', e => e.textContent).catch(() => '');
    ok('地図の読み込み失敗の表示（理由と、もう一度読み込む）', /読めませんでした/.test(fail), fail.slice(0, 160));
    await tp.evaluate(() => document.querySelector('#title .tmsg')?.scrollIntoView({ block: 'center' }));
    await shot(tp, '09-title-fail', '#title');
  }
} catch (e) { ok('タイトル画面の途中で止まった', false, String(e).slice(0, 300)); await tp.screenshot({ path: `${OUT}/sp-zz-title-error.png` }); }

// 6. 実在マップ（まちづくり版）の「街のいま」の出典・推計の欄（REAL=1 のときだけ。重い）
if (process.env.REAL) {
  await browser.close();
  const r = await open(390, 844, 'hodogaya-d'); const p = r.page;
  try {
    await p.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('low'); S.fixedQuality = true; });
    for (let i = 0; i < 4; i++) { const b = await p.$('#modal [data-act="gok"], #tutorial [data-act="tutskip"], #modal [data-act$="close"]'); if (!b) break; await b.click().catch(() => {}); await p.waitForTimeout(300); }
    if (await p.evaluate(() => document.getElementById('side').classList.contains('closed'))) await p.click('.tool.panelbtn');
    await p.click('#tabs [data-arg="home"]'); await p.waitForTimeout(300);
    const t = await p.$eval('.quick', e => e.innerText).catch(() => '');
    ok('実在マップ：街のいまに出典・取得日・推計', /出典/.test(t) && /推計/.test(t), t.replace(/\n/g, ' ').slice(0, 200));
    await p.evaluate(() => document.querySelector('.quick')?.scrollIntoView({ block: 'start' }));
    await shot(p, '10-real-quick');
  } catch (e) { ok('実在マップの途中で止まった', false, String(e).slice(0, 300)); }
  R.realErrors = r.errors; await r.browser.close();
} else await browser.close();
R.errors = errors.filter(e => !e.includes('TUNNEL')); R.titleErrors = terr;
fs.writeFileSync(`${OUT}/v93-sp.json`, JSON.stringify(R, null, 1));
console.log('errors', R.errors.length, R.errors.slice(0, 4), 'title', terr.length);
console.log('問題', R.overflow.filter(o => o.nOver || o.page || o.nCovered).map(o => `${o.name}:はみ出し${o.nOver}${o.page ? '+横' : ''} 覆い${o.nCovered}`));
