// v95：市役所の人たち（秘書・部長・課長・係長）が市長に話しかける形の表示。
// 中身はすべて、いまある計算結果（今月の課題・論点・財政・声・選挙の見通し・施設・施策の記録）から作る。数字は計算結果のまま、言い回しだけを人の言葉にする。
// 人の発言は吹き出し（.st-say）、数値は表と「計算結果」のラベル、住民の声は引用（.f90-q）で、見た目を分ける（v90 の方針）。
// 「淡々とした表示（従来）」に戻す設定は localStorage（端末ごとの好み。街の計算には使わない）。
import type { GameState, Issue } from '../sim/index';
import { gapsOf, type Decision, type AnnualReport } from '../sim/report';

const esc = (t: string) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const num = (v: number, d = 0) => (Math.round(v * 10 ** d) / 10 ** d).toLocaleString('ja-JP', { minimumFractionDigits: d, maximumFractionDigits: d });
const dateStr = (m: number) => `${Math.floor(m / 12) + 1} 年目 ${((m + 3) % 12) + 1} 月`;
/** 文の終わりに「。」を付ける（計算結果の文をそのまま話し言葉につなぐため） */
const end = (t: string) => { const x = t.trim(); return !x ? '' : /[。！？」）)]$/.test(x) ? x : x + '。'; };

export type DeptId = 'sec' | 'plan' | 'urban' | 'kids' | 'welfare' | 'life' | 'crisis' | 'water' | 'econ';
export interface Person { name: string; role: string; color: string; tone: 'polite' | 'report' | 'concrete' }
/** 人物（名前は架空の姓。頭文字の丸いアイコンと色で見分ける） */
export const STAFF: Record<DeptId, { dept: string; head: Person; staff: Person }> = {
  sec: { dept: '秘書課', head: { name: '小野寺', role: '市長秘書', color: '#7a5bb5', tone: 'polite' }, staff: { name: '辻', role: '企画政策課 係長', color: '#9a7fd0', tone: 'concrete' } },
  plan: { dept: '企画財政部', head: { name: '森川', role: '企画財政部長', color: '#2f6fb0', tone: 'report' }, staff: { name: '三浦', role: '財政課長', color: '#5a93cc', tone: 'concrete' } },
  urban: { dept: '都市整備部', head: { name: '大槻', role: '都市整備部長', color: '#6d7f2e', tone: 'report' }, staff: { name: '片桐', role: '道路課 係長', color: '#8fa24a', tone: 'concrete' } },
  kids: { dept: 'こども未来部', head: { name: '佐藤', role: 'こども未来部長', color: '#d0662f', tone: 'report' }, staff: { name: '早川', role: '保育課 係長', color: '#e38a57', tone: 'concrete' } },
  welfare: { dept: '福祉部', head: { name: '堀内', role: '福祉部長', color: '#b0476a', tone: 'report' }, staff: { name: '野口', role: '介護保険課長', color: '#cc6d8c', tone: 'concrete' } },
  life: { dept: '市民生活部', head: { name: '宮下', role: '市民生活部長', color: '#2f8f7a', tone: 'report' }, staff: { name: '藤沢', role: '生活安全課 係長', color: '#53ad98', tone: 'concrete' } },
  crisis: { dept: '危機管理室', head: { name: '黒田', role: '危機管理監', color: '#a33b32', tone: 'report' }, staff: { name: '石原', role: '防災係長', color: '#c25e55', tone: 'concrete' } },
  water: { dept: '上下水道局', head: { name: '土屋', role: '上下水道局長', color: '#2b86b8', tone: 'report' }, staff: { name: '杉本', role: '浄水課長', color: '#55a6d1', tone: 'concrete' } },
  econ: { dept: '経済観光部', head: { name: '今井', role: '経済観光部長', color: '#b08a1f', tone: 'report' }, staff: { name: '今村', role: '商工観光課 係長', color: '#c9a646', tone: 'concrete' } },
};
const SAT_DEPT: Record<string, DeptId> = { '0': 'plan', '2': 'kids', '3': 'kids', '4': 'urban', '5': 'econ', '6': 'crisis', '8': 'econ', '9': 'welfare', '10': 'life', '11': 'urban', '12': 'life', '13': 'welfare' };
/** 課題の担当部署 */
export function deptOf(key: string): DeptId {
  const [k, sub] = key.split(':');
  if (k === 'care') return 'kids';
  if (k === 'fiscal') return 'plan';
  if (k === 'election' || k === 'pledge') return 'sec';
  if (k === 'cap') return sub === 'water' || sub === 'sewage' ? 'water' : sub === 'school' || sub === 'jhs' ? 'kids' : sub === 'waste' ? 'life' : 'urban';
  if (k === 'sat') return SAT_DEPT[sub] ?? 'sec';
  if (k === 'loop') return sub === 'industry' ? 'econ' : 'urban';
  return 'urban'; // aging・traffic・housing・grade・isle
}
/** 部長の呼び方（「佐藤部長」「黒田危機管理監」など） */
const title = (p: Person) => `${p.name}${/部長$/.test(p.role) ? '部長' : /局長$/.test(p.role) ? '局長' : /危機管理監$/.test(p.role) ? '危機管理監' : /課長$/.test(p.role) ? '課長' : /係長$/.test(p.role) ? '係長' : ''}`;

// ---------------------------------------------------------------- 表示の設定
const KEY = 'sumu-staff';
export function staffPlain(): boolean { try { return localStorage.getItem(KEY) === 'plain'; } catch { return false; } }
export function setStaffPlain(on: boolean): void { try { localStorage.setItem(KEY, on ? 'plain' : 'talk'); } catch { /* なし */ } }

// ---------------------------------------------------------------- 吹き出し
export interface Reply { label: string; act: string; arg: string; primary?: boolean }
/** 1 人の発言。replies は市長の返事のボタン */
export function say(p: Person, text: string, replies: Reply[] = [], cls = ''): string {
  return `<div class="st-say${cls ? ' ' + cls : ''}"><span class="st-ava" style="--sc:${p.color}" aria-hidden="true">${esc(p.name[0])}</span><div class="st-bub"><b class="st-who">${esc(p.name)}<small>${esc(p.role)}</small></b><p>${esc(text)}</p>${replies.length ? `<div class="st-reply">${replies.map(r => `<button class="btn small${r.primary ? ' primary' : ''}" data-act="${esc(r.act)}" data-arg="${esc(r.arg)}">${esc(r.label)}</button>`).join('')}</div>` : ''}</div></div>`;
}

// ---------------------------------------------------------------- 毎月のまとめ（概要の課題の上）
interface Memo { month: number; seen: Map<string, string>; prev: Map<string, string>; log: { month: number; html: string }[]; later: Set<string>; last: string }
const memo: Memo = { month: -1, seen: new Map(), prev: new Map(), log: [], later: new Set(), last: '' };
/** 「あとで」：今月はその課題の部長の発言を畳む */
export function staffLater(key: string): void { memo.later.add(key); }

function issueTalk(s: GameState, i: Issue, fresh: boolean): string {
  const D = STAFF[deptOf(i.key)], p = D.head, k = esc(i.key);
  const opts = i.options.filter(o => o.act !== 'loop').slice(0, 2).map(o => `「${o.label}」`).join('');
  if (!fresh) return say(p, `${i.title}の件は、先月から続いています。対策を比べるなら、いつでも説明します。`, [{ label: '比べる', act: 'ix', arg: `trial|${k}` }], 'st-small');
  const text = `${i.where === '市全体' || i.where === '市内' ? '' : `${i.where}の件で`}報告します。${end(i.what)}主な原因は、${end(i.cause.replace(/^主因は/, ''))}${opts ? `${opts}などの案があります。` : ''}費用と効果を比べましょうか？`;
  return say(p, text, [{ label: '比べる', act: 'ix', arg: `trial|${k}`, primary: true }, { label: '原因をくわしく', act: 'ix', arg: `cause|${k}` }, ...(i.tile >= 0 ? [{ label: '地図で見る', act: 'focus', arg: `${i.tile}:${i.layer}` }] : []), { label: 'あとで', act: 'staff', arg: `later|${k}` }]);
}

/** 施策の結果の報告（課題から実行し、まだ見ていない結果） */
export function resultTalk(d: Decision): string {
  const r = d.results.slice().sort((a, b) => b.at - a.at)[0]; if (!r) return '';
  const D = STAFF[d.issue ? deptOf(d.issue) : 'sec'], g = gapsOf(d, r)[0];
  if (!g) return say(D.staff, `報告です。「${d.label}」（${dateStr(d.month)}に実行）の ${r.at} か月後の結果が出ました。表を見てください。`);
  const how = !g.outside ? '予測の幅の中でした' : g.actual > g.hi ? '予測より大きくなりました' : '予測より小さくなりました';
  const fac = r.factors.length ? `主な要因は、${r.factors.slice(0, 2).join('、')}と見ています。` : '';
  return say(D.staff, `報告です。「${d.label}」（${dateStr(d.month)}に実行）の ${r.at} か月後の結果です。${g.name}は、予測では ${num(g.lo, g.digits)}〜${num(g.hi, g.digits)} ${g.unit}でしたが、実際は ${num(g.actual, g.digits)} ${g.unit}で、${how}。${fac}`);
}

export interface Brief { issues: Issue[]; outlook?: { win: number; vote: number; left: number } | null; operating: number; cash: number; events: string[] }
/** 秘書のまとめと、変化があった部署の発言。課題のカード（計算結果）の上に置く */
export function staffBrief(s: GameState, b: Brief): string {
  if (memo.month !== s.month) {
    if (memo.month >= 0 && memo.last) { memo.log.push({ month: memo.month, html: memo.last }); if (memo.log.length > 6) memo.log.shift(); }
    memo.prev = memo.seen; memo.seen = new Map(); memo.later.clear(); memo.month = s.month;
  }
  const sec = STAFF.sec.head, L = b.issues;
  const fresh = (i: Issue) => memo.prev.get(i.key) !== i.title;
  const lines: string[] = [];
  if (!L.length) lines.push('市長、今月は急いで手を打つ課題はありません。公約やビジョンを進めるか、街を広げる時期です。');
  else {
    const D = STAFF[deptOf(L[0].key)];
    lines.push(`市長、今月の優先は ${L.length} 件です。まず、${L[0].title}。${deptOf(L[0].key) === 'sec' ? '私から説明します。' : `${D.dept}の${title(D.head)}から説明があります。`}`);
    if (L.length > 1) lines.push(`ほかに、${L.slice(1).map(i => i.title).join('、')}もあります。`);
  }
  const res = (s.decisions ?? []).filter(d => d.issue && d.results.some(r => !(d.seen ?? []).includes(r.at) && s.month - r.month < 3));
  if (res.length) lines.push(`それから、以前の施策の結果の報告が ${res.length} 件届いています。`);
  if (b.events.length) lines.push(`対応を待っているできごとがあります（${b.events.slice(0, 2).join('・')}）。`);
  if (b.outlook && b.outlook.left <= 18) lines.push(`任期は残り ${b.outlook.left} か月、いま選挙なら当選の見込みは ${Math.round(b.outlook.win * 100)}% です。`);
  const parts: string[] = [say(sec, lines.join(''), [], 'st-sec')];
  for (const i of L) {
    const f = fresh(i); memo.seen.set(i.key, i.title);
    if (memo.later.has(i.key)) { parts.push(say(STAFF[deptOf(i.key)].head, `${i.title}の件は、のちほど説明します。`, [{ label: 'いま聞く', act: 'ix', arg: `trial|${esc(i.key)}` }], 'st-small')); continue; }
    if (deptOf(i.key) !== 'sec' || !f) parts.push(issueTalk(s, i, f));
  }
  for (const d of res.slice(-2)) parts.push(resultTalk(d));
  const html = parts.join('');
  memo.last = say(sec, lines.join(''), [], 'st-sec st-small');
  const past = memo.log.slice().reverse();
  return `<section class="st-brief" aria-label="市役所からの報告"><h2>市役所から <small>${esc(dateStr(s.month))}・人の言葉で伝えます（数字は下の計算結果と同じ）</small><button class="btn small st-mode" data-act="staffmode" data-arg="plain" title="担当者の発言をやめ、従来の淡々とした表示にします">淡々と表示</button></h2>
    ${html}${past.length ? `<details class="st-past"><summary>これまでの発言（${past.length} か月）</summary>${past.map(p => `<p class="st-when">${esc(dateStr(p.month))}</p>${p.html}`).join('')}</details>` : ''}</section>`;
}

// ---------------------------------------------------------------- 課題の導線（試算・実行・結果）の中の発言
export function trialTalk(i: Issue, label: string, ind: { name: string; unit: string; a: number; b: number; digits: number } | null, warn: string): string {
  const p = STAFF[deptOf(i.key)].staff;
  const t = ind ? `試算しました。12 か月後の${ind.name}は、何もしない場合 ${num(ind.a, ind.digits)} ${ind.unit}、「${label}」の場合 ${num(ind.b, ind.digits)} ${ind.unit}の見込みです。` : `「${label}」を試算しました。`;
  return say(p, t + (warn ? `ただし、注意があります。${end(warn)}` : '') + '実行するなら、下のボタンで決めてください。', [], 'st-small');
}
export function runTalk(i: Issue, d: Decision | undefined): string {
  const p = STAFF[deptOf(i.key)].staff;
  return say(p, d && !d.results.length ? `承知しました。「${d.label}」を進めます。${d.checkAt[0] ?? 3} か月後（${dateStr(d.month + (d.checkAt[0] ?? 3))}）に、予測と比べて報告に来ます。` : 'これまでに実行した対策の結果です。', [], 'st-small');
}

// ---------------------------------------------------------------- タブごとの一言
export function tabTalk(dept: DeptId, text: string, replies: Reply[] = [], staff = false): string {
  const D = STAFF[dept]; return plainGuard(() => `<div class="st-tab">${say(staff ? D.staff : D.head, text, replies)}</div>`);
}
function plainGuard(f: () => string): string { return staffPlain() ? '' : f(); }

// ---------------------------------------------------------------- 年次報告・任期末の報告
export function reportTalk(rep: AnnualReport): string {
  if (staffPlain()) return '';
  const n = rep.rows.length, good = rep.rows.filter(r => r.verdict === 'better').length, bad = rep.rows.filter(r => r.verdict === 'worse').length, wait = rep.rows.filter(r => r.verdict === 'pending').length;
  const ch = rep.change.slice(0, 2).map(c => `${c.name}は ${num(c.a, c.digits)} から ${num(c.b, c.digits)} ${c.unit}`).join('、');
  const out = [say(STAFF.sec.head, `市長、${rep.title}がまとまりました。${ch ? `この期間に、${ch}になりました。` : ''}${n ? `記録した施策は ${n} 件で、良くなったもの ${good} 件、悪くなったもの ${bad} 件、結果待ち ${wait} 件です。` : 'この期間に記録した施策はありません。'}`, [], 'st-sec')];
  const fin = rep.change.find(c => /収支|資金/.test(c.name));
  if (fin) out.push(say(STAFF.plan.head, `財政から一言。${fin.name}は ${num(fin.a, fin.digits)} → ${num(fin.b, fin.digits)} ${fin.unit}です。${fin.b < fin.a ? '来年度は歳出の伸びに注意が要ります。' : '来年度も、この水準を保つ予算を組みます。'}`));
  const worst = rep.rows.find(r => r.verdict === 'worse');
  if (worst) { const D = STAFF[worst.d.issue ? deptOf(worst.d.issue) : 'plan']; out.push(say(D.head, `「${worst.d.label}」は、実行前より悪くなった指標があります。原因を調べて、次の手を考えます。`)); }
  return `<section class="st-brief st-report">${out.join('')}</section>`;
}
