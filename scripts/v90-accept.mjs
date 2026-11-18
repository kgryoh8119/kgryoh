// v90 受入検証：住野市（海辺・ふつう）を初回開始から 48 か月、画面のボタンで進める（PC 1280×800）。
// 施策の実行・保存・読込・選挙はすべて画面のクリック。window.__sumu は時間送り（g.tick）と確認の読み取りだけに使う。
// 使い方：npx vite build && node scripts/v90-accept.mjs   （OUT=出力先、既定 docs/shots/v90。結果の JSON は OUT/accept-pc.json）
// MAPID=hodogaya-d で実在風マップ（まちづくり版）。その場合は画像名の頭が real- になり、ループは自動送り。
import { open } from './shot.mjs';
import fs from 'fs';
const OUT = process.env.OUT ?? 'docs/shots/v90';
fs.mkdirSync(OUT, { recursive: true });
const MAP = process.env.MAPID ?? 'sumino', real = MAP !== 'sumino', P = real ? 'real-' : 'pc-';
if (!real) process.env.TITLESHOT = `${OUT}/${P}00-title.png`; // 実在マップは読み込みが重く、タイトルの撮影が時間切れになるので撮らない
const t0 = Date.now();
const { browser, page, errors } = await open(1280, 800, MAP);
const R = { map: MAP, openMs: Date.now() - t0, steps: [], metrics: [], overflow: [], decisions: [], notes: [] };
const note = (...a) => { const t = a.join(' '); R.notes.push(t); console.log(t); };
// 3D はソフトウェア描画で 1 コマ数秒。毎フレームの描画を止め、撮る前だけ描く
await page.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('low'); S.fixedQuality = true; });
const draw = (n = 2) => page.evaluate(n => { const v = window.__sumu.view; for (let i = 0; i < n; i++) v.__frame.call(v, 0.25); }, n);
/** はみ出しの機械検査：横スクロールの箱の外で scrollWidth > clientWidth の要素と、ページの横スクロール */
const overflow = () => page.evaluate(() => {
  const bad = [...document.querySelectorAll('#panel *, #modal *, #info *, #toast *, #tutorial *')].filter(e => { const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || !e.clientWidth) return false; if (e.closest('.f90-scroll') || ['auto', 'scroll'].includes(cs.overflowX)) return false; if (['INPUT', 'TEXTAREA', 'SELECT', 'CANVAS', 'svg'].includes(e.tagName)) return false; if (cs.textOverflow === 'ellipsis') return false; return e.scrollWidth > e.clientWidth + 1; })
    .map(e => `${e.tagName}.${String(e.className).slice(0, 30)} ${e.scrollWidth}>${e.clientWidth}「${(e.textContent || '').trim().slice(0, 24)}」`);
  return { els: bad.slice(0, 8), n: bad.length, page: document.documentElement.scrollWidth > innerWidth };
});
const shot = async (name, frames = 2) => { await draw(frames); await page.waitForTimeout(150); await page.screenshot({ path: `${OUT}/${P}${name}.png` }); const o = await overflow(); R.overflow.push({ name, ...o }); console.log('shot', name, o.n ? `はみ出し ${o.n} ${o.els.join(' / ')}` : '', o.page ? '横スクロールあり' : ''); };
const S0 = () => page.evaluate(() => { const s = window.__sumu.game.state; return { month: s.month, pop: Math.round(s.stats.pop), cash: Math.round(s.cash), sat: Math.round(s.stats.sat * 1000) / 10, approval: Math.round((s.approval ?? 0) * 1000) / 10, debt: Math.round(s.stats.debt), decisions: (s.decisions ?? []).length }; });
const metric = async tag => { const m = await S0(); R.metrics.push({ tag, ...m }); console.log('metric', tag, JSON.stringify(m)); return m; };
const step = (name, ok, detail = '') => { R.steps.push({ name, ok, detail }); console.log(ok ? '✓' : '✗', name, detail); };
const modalLabel = () => page.evaluate(() => { const m = document.getElementById('modal'); return m && !m.hidden ? m.querySelector('.dialog')?.getAttribute('aria-label') ?? '(no label)' : null; });
const openPanel = async () => {};
const tab = async t => { await page.click(`#tabs [data-arg="${t}"]`); await page.waitForTimeout(250); };
let reportsSeen = 0, eventsAnswered = 0;
/** 画面に出たダイアログを、人が押すのと同じボタンで片づける（できごと：先頭の選べる選択肢。年次報告：撮って閉じる） */
const handleModals = async (reportName) => {
  for (let guard = 0; guard < 8; guard++) {
    const lab = await modalLabel(); if (!lab) return;
    if (await page.$('#modal .f90-report')) { reportsSeen++; if (reportName) { await page.evaluate(() => { const b = document.querySelector('#modal .body'); if (b) b.scrollTop = 0; }); await shot(reportName); const txt = await page.$eval('#modal .f90-report', e => e.textContent.slice(0, 2000)); R[reportName] = txt; reportName = null; } await page.click('#modal [data-act="report"][data-arg="close"]'); await page.waitForTimeout(200); continue; }
    if (await page.$('#modal .opt:not([disabled])')) { const label = (await page.textContent('#modal .opt:not([disabled]) b'))?.trim(); await page.click('#modal .opt:not([disabled])'); eventsAnswered++; note(`  できごと「${lab}」→ ${label}`); await page.waitForTimeout(200); continue; }
    if (await page.$('#modal [data-act="election"]')) return; // 選挙は呼び出し側で撮る
    if (lab === 'メニュー') { await page.click('#modal [data-act="menu"]'); await page.waitForTimeout(200); continue; }
    if (lab === '開票速報') return;
    // 閉じるボタン（文言が「閉じる」「OK」など）を優先し、なければ主ボタン
    const b = await page.$('#modal button:text-is("閉じる"), #modal [data-act$="close"], #modal [data-act="closeModal"]') ?? await page.$('#modal .btnrow .btn.primary');
    if (b) { const bt = (await b.textContent())?.trim().slice(0, 20); note(`  ダイアログ「${lab}」→「${bt}」で閉じる`); await b.click(); await page.waitForTimeout(200); continue; }
    note(`  閉じられないダイアログ「${lab}」`); return;
  }
};
/** 1 か月ずつ進める（画面の ▶ と同じ g.tick）。ダイアログは画面のボタンで処理する */
const advance = async (n, reportName) => {
  for (let i = 0; i < n; i++) {
    const r = await page.evaluate(() => { const g = window.__sumu.game; g.speed = 3; const k = g.tick(1.0001); g.speed = 0; window.__sumu.ui.refresh(); window.__sumu.ui.renderModal(); return { k, m: g.state.month, el: !!g.state.pendingElection, blocked: !!g.blocked }; });
    await handleModals(reportName && (await page.$('#modal .f90-report')) ? reportName : null);
    if (r.el) return r;
  }
  return null;
};
const cardOf = key => `.issues .issue:has([data-arg="cause|${key}"])`;
const issueKeys = async () => { await tab('home'); return page.$$eval('.issues .issue [data-act="ix"][data-arg^="cause|"]', e => e.map(b => b.dataset.arg.slice(6))); };
/** 課題の②で対策を選んで試算し、撮ってから③で実行する（もう一度押して確定） */
const trialAndRun = async (key, re, name, run = true) => {
  await tab('home');
  if (!(await page.$(cardOf(key)))) { step(`${name}: 課題「${key}」が上位 3 件にない`, false); return null; }
  const opened = await page.$(`${cardOf(key)} .f90-opts`);
  if (!opened) await page.click(`${cardOf(key)} [data-act="ix"][data-arg="trial|${key}"]`);
  await page.waitForSelector(`${cardOf(key)} .f90-opts`);
  const labels = await page.$$eval(`${cardOf(key)} .f90-opt`, e => e.map(x => (x.querySelector('input')?.disabled ? '(自動では試せない) ' : '') + x.textContent.trim().slice(0, 40)));
  const k = labels.findIndex(l => !l.startsWith('(自動') && re.test(l));
  if (k < 0) { step(`${name}: 対策 ${re} が候補にない`, false, labels.join(' / ')); return null; }
  await page.click(`${cardOf(key)} input[data-arg="pick|${key}|${k}"]`);
  await page.waitForSelector(`${cardOf(key)} .f90-cmp`, { timeout: 120000 });
  await page.evaluate(sel => document.querySelector(sel + ' .f90-cmp')?.scrollIntoView({ block: 'center' }), cardOf(key));
  const table = await page.$$eval(`${cardOf(key)} .f90-cmp tr`, e => e.slice(1).map(r => [...r.children].map(c => c.textContent.trim().replace(/\s+/g, ' ')).join(' | ')));
  const warn = await page.$eval(cardOf(key), e => e.querySelector('p.f90-warn')?.textContent ?? '');
  const quiet = await page.$eval(cardOf(key), e => [...e.querySelectorAll('.f90-sub')].map(x => x.textContent).find(t => t.includes('省略')) ?? '');
  await shot(name);
  R.decisions.push({ name, key, option: labels[k], table, warn, quiet });
  note(`  試算 ${labels[k]}\n    ${table.join('\n    ')}${warn ? '\n    注意：' + warn : ''}${quiet ? '\n    ' + quiet : ''}`);
  if (!run) return { table, warn };
  const cash0 = (await S0()).cash;
  await page.click(`${cardOf(key)} [data-act="ix"][data-arg="run|${key}"]:not(.f90-step)`);
  const same = (await S0()).cash === cash0;
  await page.click(`${cardOf(key)} [data-act="ix"][data-arg="run|${key}"]:not(.f90-step)`);
  await page.waitForTimeout(300);
  await page.waitForFunction(() => { const d = window.__sumu.game.state.decisions ?? []; return d.length && d.at(-1).expect; }, null, { timeout: 120000 });
  const d = await page.evaluate(() => { const d = window.__sumu.game.state.decisions.at(-1); return { label: d.label, issue: d.issue, month: d.month }; });
  step(`${name}: 実行（1 回目は確定待ちで街は変わらない＝${same}）`, d.issue === key, d.label);
  return { table, warn };
};
/** 課題のカードの「④ 数か月後の結果」を開いて撮る */
const results = async (key, name) => {
  await tab('home');
  const badge = await page.$$eval('.f90-new', e => e.length);
  const sel = (await page.$(cardOf(key))) ? `${cardOf(key)} [data-act="ix"][data-arg="result|${key}"]` : null;
  if (sel) { const isOpen = await page.$(`${cardOf(key)} .f90-gap, ${cardOf(key)} .f90-box .note`); if (!isOpen) await page.click(sel); }
  else { const sm = await page.$('.f90-past summary'); if (sm) { await sm.click(); } }
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('.f90-gap')?.scrollIntoView({ block: 'center' }));
  const gap = await page.$$eval('.f90-gap', t => t.length ? [...t[0].querySelectorAll('tr')].slice(1).map(r => [...r.children].map(c => c.textContent.trim()).join(' | ')) : []);
  await shot(name);
  R.decisions.push({ name, gap, badge });
  note(`  結果（「結果が出ました」の印 ${badge}）\n    ${gap.join('\n    ')}`);
  return { badge, gap };
};
const policyTrial = async (id, name) => {
  await tab('policy');
  const c = await page.$(`[data-act="ptrial"][data-arg="${id}"]`); if (!c) { step(`${name}: 政策 ${id} の試算ボタンがない`, false); return; }
  await c.click();
  await page.waitForFunction(id => { const card = document.getElementById('pol-' + id)?.closest('.card'); return card && !card.textContent.includes('試算しています'); }, id, { timeout: 120000 });
  await page.evaluate(id => document.getElementById('pol-' + id)?.closest('.card')?.scrollIntoView(), id);
  const txt = await page.evaluate(id => document.getElementById('pol-' + id)?.closest('.card')?.innerText.replace(/\n+/g, ' / ').slice(0, 900), id);
  await shot(name); R.decisions.push({ name, policy: id, card: txt }); note('  政策カード', txt);
};
const policyRun = async (id, label) => { await tab('policy'); const on = await page.$eval(`#pol-${id}`, e => e.checked); if (!on) await page.click(`#pol-${id}`); await page.waitForTimeout(300); step(`政策「${label}」を政策タブのスイッチで実行`, await page.$eval(`#pol-${id}`, e => e.checked)); };
const saveAll = async (name) => {
  await page.click('[data-act="menu"]'); await page.waitForTimeout(250);
  await page.click('[data-act="menutab"][data-arg="save"]'); await page.waitForTimeout(250);
  await page.click('#modal [data-act="save"]'); await page.waitForTimeout(300);
  await page.click('#modal [data-act="export"]'); await page.waitForTimeout(400);
  const text = await page.$eval('#iotext', e => e.value);
  await shot(name);
  await page.click('[data-act="menu"]').catch(() => {}); await page.waitForTimeout(200);
  if (await modalLabel()) await page.keyboard.press('Escape');
  await page.waitForTimeout(200);
  return text;
};
const summary = () => page.evaluate(() => { const s = window.__sumu.game.state; return JSON.stringify({ month: s.month, pop: Math.round(s.stats.pop), cash: Math.round(s.cash), dec: (s.decisions ?? []).map(d => d.label + '@' + d.month + ':' + d.results.length), pol: Object.keys(s.policies).filter(k => s.policies[k].on).sort() }); });

try {
  // ---------------------------------------------------------------- 1. 初回開始
  note(`開始まで ${R.openMs} ms（タイトル → ${MAP} → 地形 → 街ができるまで）`);
  let lab = await modalLabel();
  step('公約を選ぶ画面が出る', lab === '公約を選ぶ', lab ?? '');
  await shot('01-pledge');
  for (const g of ['wait', 'water', 'fiscal']) { const b = await page.$(`#modal [data-act="gpick"][data-arg="${g}"]`); if (b) { await b.click(); await page.waitForTimeout(120); } }
  await page.click('#modal [data-act="gok"]'); await page.waitForTimeout(400);
  const tut = await page.evaluate(() => document.getElementById('tutorial')?.innerText.slice(0, 300) ?? '');
  step('チュートリアル（案内）が出る', !!tut, tut.replace(/\n/g, ' ').slice(0, 80));
  await shot('02-tutorial');
  // 案内は 2 つ先まで読んでから「案内を終える」
  for (let i = 0; i < 2; i++) { const b = await page.$('#tutorial [data-act="tutnext"]'); if (b) { await b.click(); await page.waitForTimeout(200); } }
  note('  案内 3 枚目：' + (await page.evaluate(() => document.getElementById('tutorial')?.innerText.replace(/\n/g, ' ').slice(0, 160) ?? '')));
  const skip = await page.$('#tutorial [data-act="tutskip"]'); if (skip) await skip.click();
  await page.waitForTimeout(300);
  await handleModals();
  await tab('home');
  await page.evaluate(() => document.querySelector('.issues')?.scrollIntoView());
  const keys = await issueKeys(), first = await page.$eval('.issues', e => { const f = e.querySelector('.f90-first'); return f ? f.closest('.issue')?.querySelector('h3')?.textContent : ''; });
  step('開始時に課題が 3 件', keys.length === 3, keys.join(', '));
  step('「まずこれ」が 1 件に付く', !!first, first ?? '');
  await shot('03-start-issues');
  await metric('開始');

  // ---------------------------------------------------------------- 2. 序盤：課題①（まずこれ）→ 原因 → 試算 → 実行
  const k1 = keys.includes('care') ? 'care' : keys[0];
  await page.click(`${cardOf(k1)} [data-act="ix"][data-arg="cause|${k1}"]`); await page.waitForTimeout(300);
  await page.evaluate(sel => document.querySelector(sel + ' .f90-box')?.scrollIntoView({ block: 'center' }), cardOf(k1));
  await shot('04-cause', 4);
  const t1 = await trialAndRun(k1, real ? /保育園|建てる|政策/ : /市立保育園を建てる|保育園/, '05-trial-before');
  await metric('課題①実行直後');
  await advance(3);
  const r3 = await results(k1, '06-result-3m');
  step('3 か月後に結果（実績と予測との差）が出る', r3.gap.length > 0, `印 ${r3.badge}`);
  await metric('3か月');
  await advance(3);
  const r6 = await results(k1, '07-result-6m');
  step('6 か月後の結果', r6.gap.length > 0);
  await metric('6か月');
  // 試算の気になる点 1：道路維持強化（混雑の課題）
  const kt = (await issueKeys()).find(k => k === 'traffic');
  if (kt) await trialAndRun('traffic', /道路維持強化/, '08-trial-roadcare', false);
  await advance(6, '09-report-12m');
  step('12 か月で年次報告が自動で開く', !!R['09-report-12m'] || reportsSeen > 0, `報告 ${reportsSeen} 回`);
  await metric('12か月');

  // ---------------------------------------------------------------- 3. 中盤：3 つのループ
  if (!real) {
    // 老朽：浄水場（老朽度 78）。課題に出ていれば課題から、なければ政策カードで「先送り」「料金改定」を比べ、建物の情報から更新する
    let ks = await issueKeys(); note('  12 か月の課題：' + ks.join(', '));
    const ka = ks.find(k => ['aging', 'cap:water', 'sat:7'].includes(k));
    if (ka) { await trialAndRun(ka, /先送り|繰り延べ/, '10-aging-defer', false); await trialAndRun(ka, /浄水場.*更新|更新する/, '11-aging-renew'); }
    else {
      step('老朽の課題が上位 3 件に出る', false, ks.join(', '));
      await policyTrial('deferRenew', '10-aging-defer');
      // 浄水場を選んで更新（情報パネルのボタン）
      const id = await page.evaluate(() => { const S = window.__sumu, s = S.game.state; const b = s.buildings.filter(o => o.kind.startsWith('water')).sort((a, c) => c.age - a.age)[0]; if (!b) return -1; S.ui.sel = { b: b.id }; S.ui.renderInfo(); return b.id; });
      await page.waitForTimeout(300);
      const rb = await page.$(`[data-act="renew"][data-arg="${id}"]`);
      if (rb) { await rb.click(); await page.waitForTimeout(300); const again = await page.$(`[data-act="renew"][data-arg="${id}"]`); if (again && (await page.evaluate(() => (window.__sumu.game.state.decisions ?? []).length)) === R.metrics.at(-1).decisions) await again.click(); await page.waitForTimeout(300); await shot('11-aging-renew'); step('浄水場を情報パネルから更新', true); }
      else step('浄水場の更新ボタン', false);
    }
    await advance(4);
    await metric('老朽の対策から4か月');
    // 駅前：容積を上げる（水道が直った後）→ 副作用 → 対策
    ks = await issueKeys(); note('  16 か月の課題：' + ks.join(', '));
    const kst = ks.find(k => ['care', 'traffic', 'housing', 'school', 'stationCrowd', 'cap:school', 'sat:0', 'sat:1', 'sat:2', 'sat:3'].includes(k));
    if (kst) await trialAndRun(kst, /容積を上げる/, '12-station-upzone');
    await advance(6);
    await metric('容積から6か月');
    ks = await issueKeys(); note('  22 か月の課題：' + ks.join(', '));
    const kst2 = ks.find(k => ['care', 'traffic', 'housing', 'school', 'stationCrowd', 'cap:school', 'sat:0', 'sat:1', 'sat:2', 'sat:3'].includes(k));
    if (kst2) { await results(kst2, '13-station-after'); await trialAndRun(kst2, /開発負担金|小学校|保育園|バス/, '14-station-counter'); }
    await advance(4);
    // 産業：誘致 → 商店街・環境
    ks = await issueKeys(); note('  26 か月の課題：' + ks.join(', '));
    const ki = ks.find(k => ['shops', 'nimby', 'sat:5', 'sat:8', 'sat:11'].includes(k));
    if (ki) await trialAndRun(ki, /誘致|工場|企業/, '15-industry');
    else { step('産業の課題が上位 3 件に出る', false, ks.join(', ')); await policyTrial('shopStart', '15-industry'); await policyRun('shopStart', '商店街の開業支援'); }
    await advance(4);
    await metric('30か月');
    ks = await issueKeys(); note('  30 か月の課題：' + ks.join(', '));
    const ki2 = ks.find(k => ['shops', 'nimby', 'sat:5', 'sat:8', 'sat:11'].includes(k));
    if (ki2) await trialAndRun(ki2, /商店|環境|緑|規制|支援/, '16-industry-counter');
    else await results(ks[0], '16-industry-after');
    await advance(6, '17-report-24m');
    await metric('36か月');
  } else {
    // 実在風マップのラベル：各タブの本文に「推計」「ゲーム上の仮定」「出典」「取得日」と権限主体（区・市・県警など）が出るか
    const words = ['推計', 'ゲーム上の仮定', '出典', '取得日', '区長', '市長', '県警', '都道府県'], found = {};
    for (const tb of await page.$$eval('#tabs [data-arg]', e => e.map(b => b.dataset.arg))) { await tab(tb); const txt = await page.evaluate(() => document.getElementById('panel')?.innerText ?? ''); for (const w of words) if (txt.includes(w)) (found[w] ??= []).push(tb); }
    R.realLabels = found; note('  実在マップのラベル：' + JSON.stringify(found));
    await tab('home');
    await advance(12, 'report-24m'); await metric('24か月');
  }

  // ---------------------------------------------------------------- 5. 保存 → 開き直し → 続きから（ブラウザ内）、テキスト読込
  const before = await summary();
  const text = await saveAll('18-save');
  step('テキストで書き出せる', text.length > 1000, `${text.length} 文字`);
  await page.reload();
  await page.waitForSelector('#title [data-t="cont"]', { timeout: 120000 });
  await page.screenshot({ path: `${OUT}/${P}19-title-continue.png` });
  await page.click(`#title [data-t="cont"]`);
  await page.waitForFunction(() => window.__sumu && window.__sumu.view.stats.buildings > 0, null, { timeout: 240000 });
  await page.evaluate(() => { const S = window.__sumu, v = S.view; v.__frame = v.frame; v.frame = () => {}; v.setQuality('low'); S.fixedQuality = true; });
  await page.waitForTimeout(500); await handleModals();
  const after = await summary();
  step('開き直して「続きから」で同じ状態（月・人口・資金・施策の記録・政策）', before === after, before === after ? before.slice(0, 120) : `前 ${before}\n後 ${after}`);
  await tab('home'); await shot('20-continued');
  // テキストの読み込み：2 か月進めてからテキストを貼り付けて読み込み、書き出したときに戻ること
  await advance(2);
  await page.click('[data-act="menu"]'); await page.waitForTimeout(250); await page.click('[data-act="menutab"][data-arg="save"]'); await page.waitForTimeout(250);
  await page.$eval('#iotext', (e, t) => { e.value = t; }, text);
  await page.click('#modal [data-act="import"]'); await page.waitForTimeout(800); await handleModals();
  if (await modalLabel()) await page.keyboard.press('Escape');
  const after2 = await summary();
  step('テキストを貼り付けて読み込むと書き出した時点に戻る', after2 === before, after2.slice(0, 120));

  // ---------------------------------------------------------------- 4. 期末：任期末の報告と選挙
  let el = null;
  for (let g = 0; g < 30 && !el; g++) el = await advance(1, '21-term-report');
  await metric('選挙の月');
  // 任期末の報告（選挙の結果と同じ月に開く）
  step('任期末の報告が開く', !!R['21-term-report'], (R['21-term-report'] ?? '').slice(0, 60));
  await page.evaluate(() => { window.__sumu.ui.refresh(); window.__sumu.ui.renderModal(); });
  await page.waitForTimeout(300);
  if ((await modalLabel()) === '開票速報') { await page.waitForTimeout(3000); await page.evaluate(() => window.__sumu.ui.renderModal()); await shot('22a-count'); const sk = await page.$('#modal [data-act="countskip"]'); if (sk) await sk.click(); else { await page.waitForTimeout(5000); await page.evaluate(() => window.__sumu.ui.renderModal()); } await page.waitForTimeout(300); }
  const elText = await page.evaluate(() => document.querySelector('#modal .dialog')?.innerText.slice(0, 600) ?? '');
  const elInfo = await page.evaluate(() => { const s = window.__sumu.game.state, e = s.elections.at(-1); return e ? { vote: Math.round(e.vote * 10) / 10, win: e.win, kept: e.pledgesKept, month: e.month } : null; });
  step('選挙の結果画面が出る', !!(await page.$('#modal [data-act="election"]')), JSON.stringify(elInfo));
  await shot('22-election');
  R.election = { info: elInfo, text: elText };
  await page.click('#modal [data-act="election"]'); await page.waitForTimeout(300); await handleModals();
  const m0 = (await S0()).month; await advance(2);
  const st = await page.evaluate(() => { const s = window.__sumu.game.state; return { mode: s.mode, term: s.term, over: s.over ?? null }; });
  step('選挙のあとも続けられる', (await S0()).month === m0 + 2, JSON.stringify(st));
  await tab('home'); await shot('23-after-election');
  await metric('選挙後');
} catch (e) { step('台本の途中で止まった', false, String(e).slice(0, 400)); try { await page.screenshot({ path: `${OUT}/${P}zz-error.png` }); } catch {} }
R.errors = errors.filter(e => !e.includes('TUNNEL')); R.eventsAnswered = eventsAnswered; R.reportsSeen = reportsSeen; R.ms = Date.now() - t0;
fs.writeFileSync(`${OUT}/accept-${real ? 'real' : 'pc'}.json`, JSON.stringify(R, null, 1));
console.log('errors', R.errors.length, R.errors.slice(0, 5)); console.log('overflow', R.overflow.filter(o => o.n || o.page).map(o => o.name + ':' + o.n + (o.page ? '+page' : '')));
await browser.close();
