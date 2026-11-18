// v90：課題からの導線・施策の結果・年次報告・政策カード・住民の声の詳細の HTML。
// 計算は src/sim/report.ts。ここは文字列を組み立てるだけで、状態は変えない（「結果を見た」印を除く）。
// 数値（ゲームの計算結果）は表と「計算結果」のラベル、文章（住民の声）は引用の体裁と「住民の声」のラベルで区別する。
import { DEFS, POLICIES, policyCost, DISTRICTS, W, H, type PolicyDef, type Kind } from '../sim/index';
import type { GameState, Voice, Issue } from '../sim/index';
import { getMap } from '../sim/map';
import { housingBlocked } from '../sim/wire';
import { gapsOf, indicatorOf, issueIndicators, policyTarget, TRIAL_SHOW, type Decision, type DecisionResult, type AnnualReport, type TrialOption, type TrialResult, type Expect } from '../sim/report';

const esc = (t: string) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const num = (v: number, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
const dateStr = (m: number) => `${Math.floor(m / 12) + 1} 年目 ${((m + 3) % 12) + 1} 月`;
const sgn = (v: number, d = 0) => (v > 0 ? '+' : v < 0 ? '−' : '±') + num(Math.abs(v), d);
const CALC = '<span class="f90-lab calc" title="ゲームの計算で出した数値です">計算結果</span>';
const VOICE = '<span class="f90-lab voice" title="住民の声（雰囲気をつかむための文章で、数値ではありません）">住民の声</span>';

// ---------------------------------------------------------------- 課題の導線
export interface IssueFlow { key: string; open: 'cause' | 'trial' | 'result' | null; opts: TrialOption[]; pick: number; trial: TrialResult | null; busy: boolean; confirm: boolean; range?: { id: string; lo: number; hi: number }[] | 'busy' | null }

/** 課題のカードの下に付ける 4 つの段階（原因 → 試算 → 実行 → 結果） */
export function issueSteps(s: GameState, i: Issue, f: IssueFlow | null, first: boolean): string {
  const k = esc(i.key), mine = (s.decisions ?? []).filter(d => d.issue === i.key), fresh = mine.some(d => d.results.some(r => !(d.seen ?? []).includes(r.at)));
  const open = f?.key === i.key ? f.open : null;
  const btn = (cmd: string, label: string, on: boolean, extra = '') => `<button class="f90-step${on ? ' on' : ''}" data-act="ix" data-arg="${cmd}|${k}" aria-expanded="${on}"${extra}>${label}</button>`;
  let h = `${first ? '<p class="f90-first"><b>まずこれ</b> はじめての方は、この課題から。①〜④の順に押すと、原因を確かめて、対策の効き目を試算し、実行して、数か月後に結果を見られます。</p>' : ''}
    <div class="f90-steps">${btn('cause', '① 原因を見る', open === 'cause')}${btn('trial', '② 対策を試算', open === 'trial')}${btn('trial', '③ 実行', false, f?.key === i.key && f.trial?.ok ? '' : ' disabled title="先に②で対策を選んで試算してください"')}${btn('result', `④ 数か月後の結果${mine.length ? `（${mine.length}）` : ''}${fresh ? '<em class="f90-new">結果が出ました</em>' : ''}`, open === 'result')}</div>`;
  if (open === 'cause') h += causeHtml(s, i);
  if (open === 'trial' && f) h += trialHtml(s, i, f);
  if (open === 'result') h += resultsHtml(s, mine);
  return h;
}

function causeHtml(s: GameState, i: Issue): string {
  const P = [['影響を受ける人', i.parts.people, 40], ['悪化の傾向', i.parts.trend, 20], ['期限の近さ', i.parts.deadline, 20], ['戻しにくさ', i.parts.hard, 20]] as const;
  const ids = issueIndicators(i.key), cur = ids.map(id => indicatorOf(id)).filter(Boolean).map(d => `<tr><td>${esc(d!.name)}</td><td>${num(d!.get(s), d!.digits ?? 0)} ${esc(d!.unit)}</td></tr>`).join('');
  const v = s.voices.filter(x => x.key.split(':')[0] === i.key.split(':')[0] || (i.key === 'care' && x.key.startsWith('care'))).slice(0, 2);
  const hb = /^(sat:0|housing)$/.test(i.key) ? housingBlocked(s) : ''; // 駅前の住宅が建たない理由（水道の余力）を、住宅の課題の原因の欄でも知らせる
  return `<div class="f90-box"><h4>原因の内訳</h4><p>${esc(i.cause)}</p>${hb ? `<p class="note bad f90-warn">⚠ ${esc(hb)}</p>` : ''}
    <p class="f90-sub">${CALC} 重要度 ${num(i.score, 1)} 点の内訳</p><div class="f90-parts">${P.map(([n, v, w]) => `<span>${n}<i style="width:${Math.round(v * 100)}%"></i><b>${num(v * w, 1)} / ${w}</b></span>`).join('')}</div>
    <table class="t"><tr><th>いまの値</th><th></th></tr>${cur}</table>
    <p class="f90-sub">地図：${esc(i.where)}${i.layer !== 'none' ? '（色分けの表示を重ねました）' : ''}</p>
    ${v.length ? `<p class="f90-sub">${VOICE}</p>${v.map(x => `<blockquote class="f90-q">${esc(x.text)}<cite>— ${esc(x.who)}${x.district >= 0 ? `（${esc(DISTRICTS[x.district] ?? '')}）` : ''}</cite></blockquote>`).join('')}` : ''}</div>`;
}

function bandText(e: Expect | undefined, id: string, d: number): string {
  const b = e?.[12]?.[id]; if (!b) return '—';
  return `<b>${num(b[1], d)}</b><small>${num(b[0], d)}〜${num(b[2], d)}</small>`;
}
function trialHtml(s: GameState, i: Issue, f: IssueFlow): string {
  const k = esc(i.key);
  const one = (o: IssueFlow['opts'][number], n: number) => `<label class="f90-opt${o.actions ? '' : ' off'}"><input type="radio" name="ixo-${k}" data-act="ix" data-arg="pick|${k}|${n}" ${f.pick === n ? 'checked' : ''} ${o.actions ? '' : 'disabled'}><span><b>${esc(o.label)}</b>${o.fitNote ? `<em class="f90-fit">${esc(o.fitNote)}</em>` : ''}<small>${esc(o.note)}${o.cost ? `（${o.cost < 0 ? '収入' : '費用'} ${num(Math.abs(o.cost))} 万円${/政策/.test(o.label) ? '/月' : ''}）` : ''}${o.warn ? `<em class="f90-warn">⚠ ${esc(o.warn)}</em>` : ''}</small></span></label>`;
  // v91：課題の主な指標に効く順の上位 5 件。残りは畳む（選んでいる候補が下にあれば開いておく）
  const more = f.opts.slice(TRIAL_SHOW);
  const list = f.opts.length ? f.opts.slice(0, TRIAL_SHOW).map(one).join('') + (more.length ? `<details class="f90-more"${f.pick >= TRIAL_SHOW ? ' open' : ''}><summary>ほかの候補を見る（${more.length} 件）</summary>${more.map((o, n) => one(o, n + TRIAL_SHOW)).join('')}</details>` : '') : '<p class="note">この課題には、自動で試算できる対策がありません。上の対策のボタンで道具を開き、「計画案」で試してください。</p>';
  let t = '';
  if (f.busy) t = '<p class="note">試算しています（12 か月分の計算）…</p>';
  else if (f.trial && !f.trial.ok) t = `<p class="note bad">この対策はいま実行できません：${esc(f.trial.msg)}</p>`;
  else if (f.trial) {
    const T = f.trial;
    // 差が予測の誤差（指標ごとの tol）より小さいものは「効かない」とみなして表に並べない。課題の主な指標と収支だけは、効かないことが分かるように残す
    const keep = new Set([issueIndicators(i.key)[0], 'operating']), quiet: string[] = [];
    const rows = T.ids.map(id => { const d = indicatorOf(id); if (!d) return ''; const dg = d.digits ?? 0, a = T.without[12]?.[id]?.[1] ?? 0, b = T.with[12]?.[id]?.[1] ?? 0, df = b - a, small = Math.abs(df) < d.tol;
      if (small && !keep.has(id)) { quiet.push(d.name); return ''; }
      const good = small ? '' : (df > 0) === (d.better === 'up') ? 'good' : 'bad';
      return `<tr><td>${esc(d.name)}<small>${esc(d.unit)}</small></td><td>${num(T.now[id] ?? 0, dg)}</td><td class="f90-band">${bandText(T.without, id, dg)}</td><td class="f90-band">${bandText(T.with, id, dg)}</td><td class="${good}">${small ? `<small>ほぼ同じ（${sgn(df, dg)}）</small>` : sgn(df, dg)}</td></tr>`; }).join('');
    const rg = f.range, rgHtml = rg === 'busy' ? '<p class="note">幅を計算しています（転入が多い場合と少ない場合の 2 通り×12 か月）…</p>'
      : rg ? (rg.length ? `<div class="f90-scroll"><table class="t"><tr><th>指標（転入の楽観〜慎重）</th><th>しない場合との差の幅</th></tr>${rg.map(x => { const d = indicatorOf(x.id); return d ? `<tr><td>${esc(d.name)}<small>${esc(d.unit)}</small></td><td>${sgn(x.lo, d.digits ?? 0)}〜${sgn(x.hi, d.digits ?? 0)}</td></tr>` : ''; }).join('')}</table></div>` : '<p class="note">転入の多少では、差の幅はほとんど変わりません。</p>')
      : f.opts[f.pick]?.range ? `<button class="btn small" data-act="ix" data-arg="range|${k}">転入が多い・少ない場合の幅も見る（数秒）</button>` : '';
    const o = f.opts[f.pick];
    t = `<p class="f90-sub">${CALC} 12 か月後の予測（太字は基準、小さい数字は予測の幅）。できごとや景気の変化は入っていません</p>
      ${o?.warn ? `<p class="note bad f90-warn">⚠ ${esc(o.warn)}</p>` : stallWarn(T, o?.actions ?? null)}
      <div class="f90-scroll"><table class="t f90-cmp"><tr><th>指標</th><th>いま</th><th>しない場合</th><th>する場合</th><th>差</th></tr>${rows}</table></div>
      ${quiet.length ? `<p class="f90-sub">差が予測の誤差より小さい指標（表から省略）：${quiet.map(esc).join('・')}</p>` : ''}${rgHtml}
      <div class="btnrow"><button class="btn small ${f.confirm ? 'danger' : 'primary'}" data-act="ix" data-arg="run|${k}">${f.confirm ? `本当に実行する（もう一度押す）` : `③「${esc(o?.label ?? '')}」を実行する`}</button><button class="btn small" data-act="ix" data-arg="close|${k}">やめる</button></div>
      ${f.confirm ? `<p class="note">実行すると、費用がかかり、取り消しは同じ月のうちだけです。3・6・12 か月後に、このカードの「④ 数か月後の結果」に予測との差が出ます。</p>` : ''}`;
  }
  return `<div class="f90-box"><h4>対策を選んで試算</h4><div class="f90-opts">${list}</div>${t}</div>`;
}

/** v91：住宅を増やす対策（用途の指定）で、試算の期間に水道・下水・電力の余力が切れて着工できない月が多いとき。いまは余力があっても 1〜2 か月で切れる場合に気づけるように */
function stallWarn(T: TrialResult, actions: TrialOption['actions']): string {
  const st = T.stall; if (!st || st.months < 3 || !(actions ?? []).some(a => a.type === 'zone')) return '';
  const what = st.by === 'sewage' ? '下水' : st.by === 'power' ? '電力' : '水道';
  return `<p class="note bad f90-warn">⚠ 試算の 12 か月のうち ${st.months} か月は${what}に余力がなく、民間の住宅が着工しません（容積を上げても建たない）。先に${what === '電力' ? '発電所・変電所' : what === '下水' ? '下水処理場' : '浄水場'}を更新・増設してください</p>`;
}

/** 施策 1 件の、予測と実績の表 */
export function gapTable(d: Decision, r: DecisionResult | null, all = false): string {
  if (!r) {
    const next = d.checkAt.find(a => !d.results.some(x => x.at === a));
    return `<p class="note">結果待ち：${next !== undefined ? `${next} か月後（${dateStr(d.month + next)}）に最初の結果が出ます` : ''}</p>`;
  }
  const g = gapsOf(d, r, all);
  return `<div class="f90-scroll"><table class="t f90-gap"><tr><th>指標</th><th>実行前</th><th>予測の幅</th><th>実績</th><th>予測との差</th></tr>${g.map(x => `<tr class="${x.outside ? 'out' : ''}"><td>${esc(x.name)}<small>${esc(x.unit)}</small></td><td>${num(x.before, x.digits)}</td><td>${num(x.lo, x.digits)}〜${num(x.hi, x.digits)}</td><td class="${x.trend > 0 ? 'good' : x.trend < 0 ? 'bad' : ''}">${num(x.actual, x.digits)}</td><td>${sgn(x.diff, x.digits)}${x.outside ? '<em>幅の外</em>' : ''}</td></tr>`).join('')}</table></div>
    ${r.factors.length ? `<p class="f90-sub">予測から外れた主な要因：${r.factors.map(esc).join('／')}</p>` : ''}`;
}
function resultsHtml(s: GameState, mine: Decision[]): string {
  if (!mine.length) return '<div class="f90-box"><p class="note">この課題から実行した対策はまだありません。②で試算して③で実行すると、3・6・12 か月後の結果がここに出ます。</p></div>';
  return `<div class="f90-box">${mine.slice().reverse().map(d => { const r = d.results.slice().sort((a, b) => b.at - a.at)[0] ?? null;
    d.seen = [...new Set([...(d.seen ?? []), ...d.results.map(x => x.at)])]; // 見た印（街の計算には使わない）
    return `<h4>${esc(d.label)} <small>${dateStr(d.month)} に実行${r ? `・${r.at} か月後の結果 ${CALC}` : ''}</small></h4>${gapTable(d, r)}`; }).join('')}</div>`;
}

/** 課題が上位から外れても、課題から実行した対策の結果はここで見られる */
export function pastResults(s: GameState, shown: Set<string>): string {
  const L = (s.decisions ?? []).filter(d => d.issue && !shown.has(d.issue)).slice(-3).reverse();
  if (!L.length) return '';
  const fresh = L.some(d => d.results.some(r => !(d.seen ?? []).includes(r.at) && s.month - r.month < 3)); // 課題のカードがないので、新しい結果は 3 か月だけ知らせる
  return `<details class="f90-past"><summary>課題から実行した対策の結果（${L.length} 件）${fresh ? '<em class="f90-new">結果が出ました</em>' : ''}</summary>${L.map(d => { const r = d.results.slice().sort((a, b) => b.at - a.at)[0] ?? null; return `<h4>${esc(d.label)} <small>${dateStr(d.month)}${r ? `・${r.at} か月後` : ''}</small></h4>${gapTable(d, r)}`; }).join('')}</details>`;
}

// ---------------------------------------------------------------- 年次報告
export function reportHtml(rep: AnnualReport): string {
  const V = { better: ['良くなった', 'good'], worse: ['悪くなった', 'bad'], mixed: ['良い面と悪い面', 'warn'], pending: ['結果待ち', ''] } as const;
  const rows = rep.rows.length ? rep.rows.map(x => `<div class="f90-rrow"><h4><span class="f90-verdict ${V[x.verdict][1]}">${V[x.verdict][0]}</span>${esc(x.d.label)}<small>${dateStr(x.d.month)}・${esc(x.d.kind)}</small></h4>${gapTable(x.d, x.r)}</div>`).join('')
    : '<p class="note">この期間に記録した施策はありません（政策の開始・終了、施設の建設・更新、税率・用途の変更などを記録します）。</p>';
  const ch = rep.change.map(c => { const d = c.b - c.a, good = Math.abs(d) < 1e-9 ? '' : (d > 0) === (c.better === 'up') ? 'good' : 'bad'; return `<tr><td>${esc(c.name)}<small>${esc(c.unit)}</small></td><td>${num(c.a, c.digits)}</td><td>${num(c.b, c.digits)}</td><td class="${good}">${sgn(d, c.digits)}</td></tr>`; }).join('');
  return `<div class="dialog wide f90-report" role="dialog" aria-modal="true" aria-label="年次報告"><header><small>${dateStr(rep.from)} 〜 ${dateStr(Math.max(rep.from, rep.to - 1))}</small><h2>📘 ${esc(rep.title)}</h2></header><div class="body">
    <section><h3>この期間の街の変化 ${CALC}</h3><div class="f90-scroll"><table class="t"><tr><th>指標</th><th>はじめ</th><th>おわり</th><th>変化</th></tr>${ch}</table></div></section>
    <section><h3>実行した施策：実行前 → 予測の幅 → 実績 → 差 ${CALC}</h3><p class="f90-sub">各施策の主な指標を、実行したときの予測（12 か月後まで。3・6 か月の時点も）と比べます。色は実行前より良くなった（緑）／悪くなった（赤）。</p>${rows}</section>
    ${rep.quotes.length ? `<section><h3>街の様子 ${VOICE}</h3><p class="f90-sub">数値ではなく、いま届いている声の一部です。</p>${rep.quotes.map(q => `<blockquote class="f90-q ${q.tone}">${esc(q.text)}<cite>— ${esc(q.who)}</cite></blockquote>`).join('')}</section>` : ''}
    <div class="btnrow"><button class="btn primary" data-act="report" data-arg="close">閉じる</button></div></div></div>`;
}

// ---------------------------------------------------------------- 政策カード
const SIDE_RE = /(ただし|足りないと|なければ|かかります|悪くなり|少し減り|費用は大きめ|わずかに減り)/;
/** 政策の副作用（効く理由の文から、負の面を書いた文を拾う。必ず財政の負担を入れる） */
export function policySide(s: GameState, p: PolicyDef): string[] {
  const c = policyCost(s, p);
  const out = [c < 0 ? `財政：月 ${num(-c)} 万円（年 ${num(-c * 12)} 万円）の収入・支出減になります（その代わりの負担は下の文のとおり）` : `財政：月 ${num(c)} 万円（年 ${num(c * 12)} 万円）の支出が続きます`];
  for (const t of `${p.why}`.split('。')) if (t && SIDE_RE.test(t)) out.push(t + '。');
  return out;
}
/** 不確実性：住宅・保育・需要など、ほかの条件しだいで効き方が変わるものは高い */
export function policyRisk(p: PolicyDef): { lv: '低' | '中' | '高'; why: string } {
  if (/なければ|足りないと|需要のない|しだい/.test(p.why)) return { lv: '高', why: '住宅・保育・需要など、ほかの条件がそろわないと効きません' };
  if (/転入|来訪|景気|脅威|事態/.test(p.why)) return { lv: '中', why: '転入・景気・できごとのように、街の外の動きに左右されます' };
  if (p.ramp >= 6) return { lv: '中', why: `効果が出そろうまで ${p.ramp} か月かかり、その間に状況が変わりえます` };
  return { lv: '低', why: '市の支出で直接決まる効果です' };
}
const AUTH: Record<string, string> = { direct: '市が直接', attract: '誘致・補助（民間が建てる）', consult: '協議（県・国・事業者が決める）' };
/** 権限主体（権限担当が authorityLabel を足したら、それを使う） */
export function authorityOf(x: { authority?: string; owner?: string; authorityLabel?: string } | PolicyDef): string {
  const a = x as any;
  if (typeof a.authorityLabel === 'string') return a.authorityLabel;
  if (a.authority) return `${AUTH[a.authority] ?? a.authority}${a.owner ? `（${a.owner}）` : ''}`;
  return '市が直接（市の予算で実施）';
}
export interface PolicyTrial { id: string; busy: boolean; res: TrialResult | null }
export function policyCard(s: GameState, p: PolicyDef, on: boolean, f: number, trial: PolicyTrial | null): string {
  const risk = policyRisk(p), side = policySide(s, p), c = policyCost(s, p);
  let eff = `<p>${esc(p.why)}</p>`;
  if (trial?.busy) eff += '<p class="note">試算しています…</p>';
  else if (trial?.res?.ok) {
    const T = trial.res;
    const big = T.ids.map(id => indicatorOf(id)).filter(Boolean).map(d => { const dg = d!.digits ?? 0, a = T.without[12]?.[d!.id], b = T.with[12]?.[d!.id]; if (!a || !b) return ''; const df = b[1] - a[1], lo = b[0] - a[1], hi = b[2] - a[1]; if (Math.abs(df) < d!.tol) return ''; /* 予測の誤差より小さい差は「効かない」として並べない */ return `<tr><td>${esc(d!.name)}</td><td class="${(df > 0) === (d!.better === 'up') ? 'good' : 'bad'}">${sgn(df, dg)} ${esc(d!.unit)}</td><td><small>${sgn(Math.min(lo, hi), dg)}〜${sgn(Math.max(lo, hi), dg)}</small></td></tr>`; }).join('');
    eff += `<p class="f90-sub">${CALC} 12 か月後、${on ? 'やめなかった場合とやめた場合' : '始めた場合としない場合'}の差</p>${big ? `<table class="t"><tr><th>指標</th><th>差（基準）</th><th>幅</th></tr>${big}</table>` : '<p class="note">12 か月では、主な指標にはっきりした差は出ません（効果が小さいか、ほかの条件が足りない）。</p>'}`;
  } else if (trial?.res) eff += `<p class="note">試算できませんでした：${esc(trial.res.msg)}</p>`;
  else eff += `<button class="btn small" data-act="ptrial" data-arg="${p.id}">数値で試算する（12 か月）</button>`;
  const money = c < 0 ? `月 ${num(-c)} 万円の収入・支出減` : `月 ${num(c)} 万円`;
  return `<div class="card f90-pol"><h3>${esc(p.name)}<em>${money}</em></h3><p>${esc(p.desc)}</p>
    <dl class="f90-dl">
      <dt>費用</dt><dd>${c < 0 ? `支出なし。逆に ${money}になります（初期費用なし。人口に応じて変わります）` : `${money}（初期費用なし。人口に応じて変わります）`}</dd>
      <dt>効き始め</dt><dd>始めた翌月から少しずつ。${p.ramp} か月で満額</dd>
      <dt>対象</dt><dd>${esc(p.who)}<br><small>いまの街で ${esc(policyTarget(s, p.who))}</small></dd>
      <dt>期待効果</dt><dd>${eff}</dd>
      <dt>副作用</dt><dd><ul>${side.map(t => `<li>${esc(t)}</li>`).join('')}</ul></dd>
      <dt>不確実性</dt><dd><b class="f90-risk r${risk.lv}">${risk.lv}</b> ${esc(risk.why)}</dd>
      <dt>権限主体</dt><dd>${esc(authorityOf(p))}</dd>
    </dl>
    <label class="switch"><input type="checkbox" id="pol-${p.id}" data-policy="${p.id}" ${on ? 'checked' : ''}> ${on ? `実施中（効果 ${Math.round(f * 100)}% 発現）` : `実施する（満額まで ${p.ramp} か月）`}</label></div>`;
}
/** 建設メニューの詳細に付ける同じ並び（費用・工期・対象・効果・副作用・不確実性・権限主体） */
export function buildFacts(s: GameState, kind: Kind): string {
  const d = DEFS[kind] as any; if (!d) return '';
  const cap = d.cap ? `定員・能力 ${num(d.cap)}` : '';
  const side: string[] = []; if (d.upkeep) side.push(`維持費 月 ${num(d.upkeep)} 万円`); if (d.wage && d.staffReq) side.push(`職員の人件費（${d.staffKind ?? '職員'}）`); if (d.nimby) side.push('近くの住宅の満足が下がる（迷惑施設）');
  const risk = d.authority === 'consult' ? ['高', '相手（県・国・事業者）の判断しだいです'] : d.authority === 'attract' ? ['中', '民間の採算しだいで、来ない・撤退することがあります'] : d.staffReq ? ['中', '職員がそろうまで受け入れが少なめです'] : ['低', '完成すれば市が直接運営します'];
  return `<dl class="f90-dl f90-build">
    <dt>費用</dt><dd>初期 ${num(d.cost ?? 0)} 万円${d.upkeep ? `・維持 月 ${num(d.upkeep)} 万円` : ''}</dd>
    <dt>工期</dt><dd>${d.months ? `${d.months} か月で完成` : 'すぐ'}${d.staffReq ? '。完成後、職員を採用しながら受け入れが増えます' : ''}</dd>
    <dt>対象</dt><dd>${cap || '周辺の住民'}</dd>
    <dt>副作用</dt><dd>${side.length ? side.map(esc).join('・') : '目立ったものはありません'}</dd>
    <dt>不確実性</dt><dd><b class="f90-risk r${risk[0]}">${risk[0]}</b> ${esc(risk[1])}</dd>
    <dt>権限主体</dt><dd>${esc(authorityOf(d))}</dd></dl>`;
}

// ---------------------------------------------------------------- 住民の声の詳細
/** 声の鍵 → 関係する指標（いまの値の説明）と、効く政策・施設 */
const VLINK: Record<string, { ind: (s: GameState) => [string, string][]; pol: string[]; kinds: Kind[] }> = {
  care: { ind: s => [['保育の待機', `${num(s.stats.waitlist)} 人`], ['保育の受け入れ', `${num(s.stats.careCap)} / 希望 ${num(s.stats.careDemand)} 人`]], pol: ['careStaff'], kinds: ['nurseryS', 'nursery'] as Kind[] },
  traffic: { ind: s => [['最大混雑率', `${Math.round(s.stats.maxVc * 100)}%`], ['通勤の遅れ', `${s.stats.avgDelay.toFixed(2)} 倍`]], pol: ['bikeLanes', 'roadCare'], kinds: [] },
  housing: { ind: s => [['空き住戸', `${(s.stats.vacancy * 100).toFixed(1)}%`], ['入れない世帯', `月 ${s.stats.pentUp.toFixed(1)} 世帯`]], pol: ['akiya', 'homeReform'], kinds: [] },
  water: { ind: s => [['水道', `${num(s.stats.waterCap)} / 需要 ${num(s.stats.waterDemand)}`]], pol: [], kinds: ['waterS'] as Kind[] },
  waterOld: { ind: s => [['水道', `${num(s.stats.waterCap)} / 需要 ${num(s.stats.waterDemand)}`]], pol: [], kinds: ['waterS'] as Kind[] },
  sewage: { ind: s => [['下水', `${num(s.stats.sewageCap)} / 需要 ${num(s.stats.sewageDemand)}`]], pol: [], kinds: ['sewageS'] as Kind[] },
  waste: { ind: s => [['ごみ処理', `${num(s.stats.wasteCap)} / 需要 ${num(s.stats.wasteDemand)}`]], pol: ['sorting'], kinds: ['waste'] as Kind[] },
  jhs: { ind: s => [['中学校', `${num(s.stats.jhsKids)} 人 / 定員 ${num(s.stats.jhsCap)}`]], pol: [], kinds: ['jhs'] as Kind[] },
  elder: { ind: s => [['介護', `必要 ${num(s.stats.elderNeed)} 人 / 定員 ${num(s.stats.elderCap)}`]], pol: ['mimamoriNet'], kinds: ['elderly'] as Kind[] },
  aging: { ind: s => [['高齢化率', `${Math.round((s.stats.aging ?? 0) * 100)}%`]], pol: ['familyMove', 'mimamoriNet'], kinds: ['elderly'] as Kind[] },
  lonely: { ind: s => [['見守りの届かない高齢世帯', `${num(s.stats.lonely ?? 0)} 世帯`]], pol: ['mimamoriNet'], kinds: [] },
  crime: { ind: s => [['犯罪の起きやすさ', `${Math.round(s.stats.crime * 100)}%`]], pol: ['nightPatrol', 'kyakuhiki'], kinds: ['koban'] as Kind[] },
  noPolice: { ind: s => [['犯罪の起きやすさ', `${Math.round(s.stats.crime * 100)}%`]], pol: ['nightPatrol'], kinds: ['koban'] as Kind[] },
  shop: { ind: s => [['店の数', `${num(s.stats.shops)}`]], pol: ['shopStart', 'bukkaPremium'], kinds: [] },
  park: { ind: s => [['環境の水準', `${Math.round((s.stats.lv?.[3] ?? 0) * 100)}%`]], pol: [], kinds: ['parkM'] as Kind[] },
  env: { ind: s => [['環境の水準', `${Math.round((s.stats.lv?.[3] ?? 0) * 100)}%`]], pol: ['bikeLanes', 'sorting'], kinds: ['parkM'] as Kind[] },
  health: { ind: s => [['医療の水準', `${Math.round((s.stats.lv?.[1] ?? 0) * 100)}%`]], pol: ['kodomoIryo'], kinds: ['clinic', 'hospital'] as Kind[] },
  noHosp: { ind: s => [['医療の水準', `${Math.round((s.stats.lv?.[1] ?? 0) * 100)}%`]], pol: [], kinds: ['hospital'] as Kind[] },
  sick: { ind: s => [['治療が必要な人', `${num(s.stats.sick ?? 0)} 人`]], pol: [], kinds: ['clinic', 'hospital'] as Kind[] },
  fire: { ind: s => [['消防の届く範囲', `${Math.round(s.stats.fireCover * 100)}%`]], pol: [], kinds: ['fireS'] as Kind[] },
  roadAge: { ind: () => [], pol: ['roadCare'], kinds: [] },
  conn: { ind: () => [], pol: [], kinds: [] },
};
export function voiceDetail(s: GameState, v: Voice, idx: number): string {
  const base = v.key.split(':')[0], L = VLINK[base] ?? { ind: () => [], pol: [], kinds: [] };
  const dn = voiceDistrict(s, v);
  const sd = dn >= 0 ? s.stats.satDistrict[dn] : -1;
  const ind = [...L.ind(s), ...(dn >= 0 ? [[`${DISTRICTS[dn]}の満足`, `${Math.round(sd * 100)}%`] as [string, string]] : [])];
  const drag = (s.stats.satDrag ?? []).map((d, k) => ({ d, k })).sort((a, b) => b.d - a.d).slice(0, 2);
  const pols = L.pol.map(id => POLICIES.find(p => p.id === id)).filter(Boolean) as PolicyDef[];
  const kinds = L.kinds.filter(k => DEFS[k]);
  return `<div class="f90-box f90-vd" data-v="${idx}"><h4>この声の詳しいこと</h4>
    <p class="f90-sub">住んでいる地区：<b>${dn >= 0 ? esc(DISTRICTS[dn]) : '市全体'}</b>（地図をその場所へ動かしました）</p>
    <p class="f90-sub">${CALC} 関係する指標（いまの水準）</p>${ind.length ? `<table class="t">${ind.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table>` : '<p class="note">数値で表せる指標はありません。</p>'}
    <p class="f90-sub">発生の原因</p><p>${esc(v.cause)}</p>${drag.length && drag[0].d > 0.005 ? `<p class="f90-sub">市全体で満足を下げている要因：${drag.map(x => `${['住宅負担', '通勤', '保育', '学校', '公園', '買物', '消防・防災', 'ライフライン', '雇用', '医療', '治安', '環境', '文化・スポーツ', '福祉'][x.k]}（−${(x.d * 100).toFixed(1)} 点）`).join('・')}</p>` : ''}
    <p class="f90-sub">影響する施策</p><div class="btnrow wrap">${pols.map(p => `<button class="btn small" data-act="vpol" data-arg="${p.id}">政策「${esc(p.name)}」</button>`).join('')}${kinds.map(k => `<button class="btn small" data-act="tool" data-arg="build:${k}">${esc(DEFS[k].name)}を建てる</button>`).join('')}${v.layer !== 'none' ? `<button class="btn small" data-act="layer" data-arg="${v.layer}">地図の色分け</button>` : ''}${!pols.length && !kinds.length ? '<span class="note">直接効く政策・施設の登録はありません。原因の文を手がかりにしてください。</span>' : ''}</div></div>`;
}
/** 声の主が住む地区（声に地区がなければ、場所の区画から） */
export function voiceDistrict(s: GameState, v: Voice): number {
  if (v.district >= 0) return v.district;
  if (v.tile >= 0) { const d = getMap(s.seed).district[v.tile]; return d >= 0 && d < DISTRICTS.length ? d : -1; }
  return -1;
}
/** 地区の中心（人の住む区画の平均）。なければ -1 */
export function districtCenter(s: GameState, d: number): number {
  const m = getMap(s.seed); let sx = 0, sy = 0, n = 0;
  for (let t = 0; t < W * H; t++) if (m.district[t] === d && (s.occ[t] || s.zone[t])) { sx += t % W; sy += (t / W) | 0; n++; }
  return n ? Math.round(sy / n) * W + Math.round(sx / n) : -1;
}
