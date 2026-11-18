// v90：施策の予測と結果の記録、年次報告、課題の対策の試算。
// ここは画面（DOM）に依存しない。記録は s.decisions にだけ書き、街の計算には使わない（記録を取っても取らなくても街の進み方は同じ）。
// 予測は状態の複製に月次処理（forecast モード：イベント・景気・市政は動かさない）を回して出す。本番の乱数は使わない。
import { stepMonth, monthlyBudget } from './step';
import { checkPlace } from './actions';
import { dispatch } from './actions';
import { DEFS, POLICIES, policyCost, W, H } from './config';
import { DISTRICTS, HH_NAMES, type GameState, type Action, type Kind } from './types';
import { getMap } from './map';
import type { Issue } from './issues';

// ---------------------------------------------------------------- 指標
export interface IndicatorDef {
  id: string; name: string; unit: string;
  /** 増えるとよい（up）・減るとよい（down） */
  better: 'up' | 'down';
  /** 予測の幅の最小（これより小さい差は「ほぼ予測どおり」） */
  tol: number;
  /** 表示の小数の桁 */
  digits?: number;
  scope?: 'city' | 'district';
  get(s: GameState): number;
}

const fin = (v: number) => (Number.isFinite(v) ? v : 0);
/** 転入−転出（人/月）：人口の増減から出生と死亡を除いたもの */
function netMig(s: GameState): number {
  const h = s.history; if (h.length < 2) return 0;
  return fin(h[h.length - 1].pop - h[h.length - 2].pop - (s.stats.births ?? 0) + (s.stats.deaths ?? 0));
}
const minPos = (a: number[], ok: (k: number) => boolean) => { let m = Infinity; a.forEach((v, k) => { if (ok(k) && v < m) m = v; }); return m === Infinity ? 0 : m; };

/** 汎用の指標（ループ担当の指標は registerIndicators で足す） */
export const BASE_INDICATORS: IndicatorDef[] = [
  { id: 'pop', name: '人口', unit: '人', better: 'up', tol: 20, get: s => Math.round(s.stats.pop) },
  { id: 'netMig', name: '転入−転出', unit: '人/月', better: 'up', tol: 6, get: s => Math.round(netMig(s)) },
  { id: 'wait', name: '保育の待機', unit: '人', better: 'down', tol: 3, get: s => Math.round(s.stats.waitlist) },
  { id: 'schoolOver', name: '学校の過密', unit: '人', better: 'down', tol: 5, get: s => Math.round(Math.max(0, s.stats.schoolKids - s.stats.schoolCap) + Math.max(0, (s.stats.jhsKids ?? 0) - (s.stats.jhsCap ?? 0))) },
  { id: 'maxVc', name: '最大混雑率', unit: '%', better: 'down', tol: 3, get: s => Math.round(s.stats.maxVc * 100) },
  { id: 'operating', name: '月の収支', unit: '万円', better: 'up', tol: 30, get: s => Math.round(s.ledger.at(-1)?.operating ?? monthlyBudget(s).operating) },
  { id: 'debt', name: '市債残高', unit: '万円', better: 'down', tol: 100, get: s => Math.round(s.stats.debt) },
  { id: 'sat', name: '満足（全体）', unit: '%', better: 'up', tol: 1, digits: 1, get: s => Math.round(s.stats.sat * 1000) / 10 },
  { id: 'satType', name: '満足（いちばん低い世帯類型）', unit: '%', better: 'up', tol: 1.5, digits: 1, get: s => Math.round(minPos(s.stats.satType, k => (s.stats.hhByType?.[k] ?? 0) > 0) * 1000) / 10 },
  { id: 'satDist', name: '満足（いちばん低い地区）', unit: '%', better: 'up', tol: 1.5, digits: 1, scope: 'district', get: s => Math.round(minPos(s.stats.satDistrict, k => (s.stats.popDistrict?.[k] ?? 0) > 0) * 1000) / 10 },
  { id: 'burden', name: '住宅費の負担（満足の不足）', unit: '%', better: 'down', tol: 1.5, digits: 1, get: s => Math.round((1 - (s.stats.satParts?.[0] ?? 1)) * 1000) / 10 },
];

let REG: IndicatorDef[] = [...BASE_INDICATORS];
/** 指標を足す（同じ id は置きかえる）。ループ担当の指標をつなぐ入口 */
export function registerIndicators(defs: IndicatorDef[]): void {
  for (const d of defs) { const k = REG.findIndex(x => x.id === d.id); if (k >= 0) REG[k] = d; else REG.push(d); }
}
export const indicators = (): IndicatorDef[] => REG;
export const indicatorOf = (id: string): IndicatorDef | undefined => REG.find(d => d.id === id);
const PRE: ((s: GameState) => void)[] = [];
/** 指標をまとめて読む前に呼ぶ処理を足す（v90：ループの指標は 1 回の計算で全部出るので、ここで 1 回だけ計算して使い回す） */
export function onIndicatorValues(f: (s: GameState) => void): void { PRE.push(f); }
export function indicatorValues(s: GameState): Record<string, number> {
  for (const f of PRE) { try { f(s); } catch { /* 読めなければ個別に計算する */ } }
  const o: Record<string, number> = {};
  for (const d of REG) { try { o[d.id] = fin(d.get(s)); } catch { o[d.id] = 0; } }
  return o;
}
/** 課題の鍵 → 主に見る指標 */
const ISSUE_IND: ((key: string) => string[])[] = [];
/** 課題ごとの指標を外から足す（v90：ゲームループの指標をつなぐ入口） */
export function registerIssueIndicators(f: (key: string) => string[]): void { ISSUE_IND.push(f); }
export function issueIndicators(key: string): string[] { return [...new Set([...baseIssueIndicators(key), ...ISSUE_IND.flatMap(f => f(key))])]; }
function baseIssueIndicators(key: string): string[] {
  if (key === 'care') return ['wait', 'satType'];
  if (key === 'traffic') return ['maxVc', 'sat'];
  if (key === 'housing') return ['burden', 'netMig', 'pop'];
  if (key === 'fiscal') return ['operating', 'debt'];
  if (key === 'cap:school' || key === 'cap:jhs') return ['schoolOver', 'satType'];
  if (key.startsWith('cap:') || key === 'aging') return ['sat', 'satDist'];
  if (key === 'sat:0') return ['burden', 'sat'];
  if (key.startsWith('sat:')) return ['sat', 'satDist'];
  if (key === 'election' || key.startsWith('pledge:')) return ['sat', 'pop'];
  return ['sat', 'pop'];
}

// ---------------------------------------------------------------- 予測
export const CHECK_AT = [3, 6, 12];
/** 予測の幅の係数（基準の変化量に対する割合）。先ほど広い */
const WIDTH: Record<number, number> = { 3: 0.25, 6: 0.35, 12: 0.5 };
/** [楽観〜慎重の下端, 基準, 上端] */
export type Band = [number, number, number];
export type Expect = Record<number, Record<string, Band>>;

/** 試算の k か月目の乱数の種。比べる 2 本（しない／する）で同じ値になるので、施策で乱数を引く回数が変わっても翌月には揃い直す */
export function commonRng(anchor: number, k: number): number { let h = (anchor ^ Math.imul(k + 1, 0x9e3779b1)) | 0; h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); return (h ^ (h >>> 16)) | 0; }
/** 状態 s のまま（または actions を加えて）months か月進めた試算。基準 1 本を回し、幅は変化量の係数と指標ごとの最小幅で出す */
export function projectBands(s: GameState, actions: Action[] = [], months = 12, at: number[] = CHECK_AT): { ok: boolean; msg: string; expect: Expect; start: Record<string, number> } {
  const c: GameState = structuredClone(s);
  delete (c as any).decisions;
  let msg = '';
  for (const a of actions) { const r = dispatch(c, a); if (!r.ok) return { ok: false, msg: r.msg, expect: {}, start: {} }; msg = r.msg; }
  const start = indicatorValues(c), expect: Expect = {}, anchor = s.rng;
  for (let k = 1; k <= months; k++) {
    c.rng = commonRng(anchor, k); // しない場合とする場合で、毎月同じ乱数の列から始める（差が施策の効果だけになるように）
    stepMonth(c, { forecast: true });
    if (at.includes(k)) {
      const v = indicatorValues(c), o: Record<string, Band> = {};
      for (const d of REG) { const mid = v[d.id], w = Math.max(d.tol, Math.abs(mid - start[d.id]) * (WIDTH[k] ?? 0.5)); o[d.id] = [round(mid - w, d), mid, round(mid + w, d)]; }
      expect[k] = o;
    }
  }
  return { ok: true, msg, expect, start };
}
const round = (v: number, d: IndicatorDef) => { const p = 10 ** (d.digits ?? 0); return Math.round(v * p) / p; };

// ---------------------------------------------------------------- 施策の記録
export interface DecisionResult { at: number; month: number; v: Record<string, number>; factors: string[] }
export interface Decision {
  id: number; month: number; label: string; kind: string;
  /** 課題から実行したとき、その課題の鍵 */
  issue?: string;
  /** 実行する前の指標 */
  before: Record<string, number>;
  /** 実行した場合の予測（3・6・12 か月後）。まだ計算していなければ null */
  expect: Expect | null;
  /** 主に見る指標 */
  focus: string[];
  checkAt: number[];
  results: DecisionResult[];
  /** 記録したときの景気（要因の説明に使う） */
  econ?: number;
  /** 同じ月にまとめた操作の数 */
  n?: number;
  /** 結果を課題のカードで見た印（チェックの月数） */
  seen?: number[];
}
export const MAX_DECISIONS = 40;
/** 記録する操作（主要な操作）と、その分類 */
export const RECORD_KIND: Record<string, string> = {
  policy: '政策', build: '施設の建設', renew: '施設の更新', upgrade: '施設の増築', demolish: '撤去', tax: '税率', zone: '用途の変更', area: '線引き',
  widen: '道路', road: '道路', rail: '線路', annex: '区域の編入', borrow: '財政', repayTemp: '財政', staff: '職員', suspend: '休止・再開', civic: '市長の取り組み', expand: '施設の増築',
};
/** 同じ月に続けて行うと 1 件にまとめる操作（道路・用途を何回にも分けて塗るため） */
const MERGE = new Set(['zone', 'road', 'area', 'widen', 'rail', 'staff']);

/** 操作の説明（記録の見出し） */
export function actionLabel(s: GameState, a: Action): string {
  const B = (id: number) => s.buildings.find(b => b.id === id);
  switch (a.type) {
    case 'policy': { const p = POLICIES.find(x => x.id === a.id); return `政策「${p?.name ?? a.id}」を${a.on ? '始める' : 'やめる'}`; }
    case 'build': return `${DEFS[a.kind]?.name ?? a.kind}を建てる`;
    case 'renew': { const b = B(a.id); return `${b ? DEFS[b.kind].name : '施設'}を更新する`; }
    case 'upgrade': { const b = B(a.id); return `${b ? DEFS[b.kind].name : '施設'}を増築する`; }
    case 'demolish': { const b = B(a.id); return `${b ? DEFS[b.kind].name : '施設'}を撤去する`; }
    case 'tax': return `税率（${({ res: '住民税', prop: '固定資産税', biz: '法人の税', stay: '宿泊税' } as const)[a.key]}）を ${a.key === 'stay' ? (a.v ? 'あり' : 'なし') : Math.round(a.v * 100) + '%'} にする`;
    case 'zone': return `用途を指定する（${a.tiles.length} 区画）`;
    case 'road': return `道路を引く（${a.tiles.length} 区画）`;
    default: return RECORD_KIND[a.type] ?? a.type;
  }
}

/** 施策を記録する。before は操作の前の指標（indicatorValues で取る）。forecast=false なら予測は後で fillForecast で入れる */
export function recordDecision(s: GameState, label: string, kind: string, before: Record<string, number>, opts: { issue?: string; forecast?: boolean; action?: Action } = {}): Decision {
  const L = (s.decisions ??= []);
  const last = L.at(-1);
  if (last && opts.action && MERGE.has(opts.action.type) && last.kind === kind && last.month === s.month && !last.results.length && last.issue === opts.issue) {
    last.n = (last.n ?? 1) + 1;
    last.label = label.replace(/（\d+ 区画）$/, '') + `（${last.n} 回の操作）`;
    last.expect = null;
    if (opts.forecast !== false) fillForecast(s, last);
    return last;
  }
  const d: Decision = { id: (last?.id ?? 0) + 1, month: s.month, label, kind, issue: opts.issue, before, expect: null, focus: opts.issue ? issueIndicators(opts.issue) : [], checkAt: [...CHECK_AT], results: [], econ: s.econ?.cycle ?? 0 };
  L.push(d);
  if (L.length > MAX_DECISIONS) L.splice(0, L.length - MAX_DECISIONS);
  if (opts.forecast !== false) fillForecast(s, d);
  return d;
}
/** 記録に予測を入れる（いまの状態から 12 か月）。主に見る指標が未定なら、予測で大きく動くものを選ぶ */
export function fillForecast(s: GameState, d: Decision): void {
  const p = projectBands(s);
  d.expect = p.expect;
  if (!d.focus.length) {
    const e12 = p.expect[12] ?? {};
    d.focus = REG.map(x => ({ id: x.id, r: Math.abs((e12[x.id]?.[1] ?? 0) - (d.before[x.id] ?? 0)) / x.tol })).sort((a, b) => b.r - a.r).slice(0, 3).map(x => x.id);
  }
}

/** 毎月の終わりに呼ぶ：3・6・12 か月たった記録に実績を入れる。新しく出た結果を返す */
export function updateDecisions(s: GameState): { d: Decision; r: DecisionResult }[] {
  const out: { d: Decision; r: DecisionResult }[] = [];
  if (!s.decisions?.length) return out;
  let v: Record<string, number> | null = null;
  for (const d of s.decisions) for (const at of d.checkAt) {
    if (s.month - d.month < at || d.results.some(r => r.at === at)) continue;
    v ??= indicatorValues(s);
    const r: DecisionResult = { at, month: s.month, v: { ...v }, factors: [] };
    r.factors = factorsFor(s, d, r);
    d.results.push(r); out.push({ d, r });
  }
  return out;
}

export interface Gap { id: string; name: string; unit: string; before: number; lo: number; mid: number; hi: number; actual: number; diff: number; outside: boolean; /** 実行前より良くなった（1）・悪くなった（-1）・変わらない（0） */ trend: -1 | 0 | 1; digits: number }
/** 結果と予測の差（主に見る指標、または全部） */
export function gapsOf(d: Decision, r: DecisionResult, all = false): Gap[] {
  const ids = all || !d.focus.length ? REG.map(x => x.id) : d.focus;
  const out: Gap[] = [];
  for (const id of ids) {
    const def = indicatorOf(id); if (!def) continue;
    const band = d.expect?.[r.at]?.[id], before = d.before[id] ?? 0, actual = r.v[id] ?? 0;
    const [lo, mid, hi] = band ?? [before, before, before];
    const ch = actual - before, t = Math.abs(ch) < def.tol * 0.5 ? 0 : (ch > 0) === (def.better === 'up') ? 1 : -1;
    out.push({ id, name: def.name, unit: def.unit, before, lo, mid, hi, actual, diff: round(actual - mid, def), outside: !!band && (actual < lo || actual > hi), trend: t, digits: def.digits ?? 0 });
  }
  return out;
}

/** 予測の幅から外れたとき、その間に起きた主な要因を 1〜2 個（できごと・ほかの施策・景気） */
function factorsFor(s: GameState, d: Decision, r: DecisionResult): string[] {
  const tmp: DecisionResult = { ...r, factors: [] };
  if (!gapsOf(d, tmp).some(g => g.outside)) return [];
  const f: string[] = [];
  const ev = (s.events?.log ?? []).filter(e => e.month > d.month && e.month <= r.month).slice(-2);
  for (const e of ev) f.push(`できごと「${e.title}」（${e.choice}）`);
  const other = (s.decisions ?? []).filter(x => x !== d && x.month >= d.month && x.month <= r.month && x.id > d.id).slice(-1);
  for (const o of other) if (f.length < 2) f.push(`ほかの施策「${o.label}」`);
  const de = (s.econ?.cycle ?? 0) - (d.econ ?? 0);
  if (f.length < 2 && Math.abs(de) > 0.3) f.push(de > 0 ? '景気が良くなった' : '景気が悪くなった');
  if (!f.length) f.push('予測では動かさない要素（できごとの影響の残り・選挙・市政など）');
  return f.slice(0, 2);
}

// ---------------------------------------------------------------- 年次報告
export interface ReportRow { d: Decision; r: DecisionResult | null; gaps: Gap[]; verdict: 'better' | 'worse' | 'mixed' | 'pending' }
export interface AnnualReport {
  title: string; from: number; to: number;
  rows: ReportRow[];
  /** 1 年の変化（記録の最初と最後） */
  change: { name: string; unit: string; a: number; b: number; better: 'up' | 'down'; digits: number }[];
  /** 住民の声（雰囲気。数値ではない） */
  quotes: { who: string; text: string; tone: string }[];
}
export function verdictOf(gaps: Gap[]): ReportRow['verdict'] {
  if (!gaps.length) return 'pending';
  const up = gaps.filter(g => g.trend > 0).length, dn = gaps.filter(g => g.trend < 0).length;
  return up && !dn ? 'better' : dn && !up ? 'worse' : 'mixed';
}
export function annualReport(s: GameState, from: number, to: number, title?: string): AnnualReport {
  const rows: ReportRow[] = (s.decisions ?? []).filter(d => d.month >= from && d.month < to).map(d => {
    const r = d.results.slice().sort((a, b) => b.at - a.at)[0] ?? null, gaps = r ? gapsOf(d, r) : [];
    return { d, r, gaps, verdict: r ? verdictOf(gaps) : 'pending' };
  });
  const H = s.history, a = H.find(h => h.month >= from) ?? H[0], b = H.filter(h => h.month <= to).at(-1) ?? H.at(-1)!;
  const change = a && b ? [
    { name: '人口', unit: '人', a: a.pop, b: b.pop, better: 'up' as const, digits: 0 },
    { name: '保育の待機', unit: '人', a: a.wait, b: b.wait, better: 'down' as const, digits: 0 },
    { name: '最大混雑率', unit: '%', a: Math.round(a.maxVc * 100), b: Math.round(b.maxVc * 100), better: 'down' as const, digits: 0 },
    { name: '月の収支', unit: '万円', a: a.op || (H.find(h => h.month > a.month)?.op ?? 0), b: b.op, /* はじめの月は収支の記録が 0 なので、最初の月の実績を使う */ better: 'up' as const, digits: 0 },
    { name: '満足（全体）', unit: '%', a: Math.round(a.sat * 1000) / 10, b: Math.round(b.sat * 1000) / 10, better: 'up' as const, digits: 1 },
  ] : [];
  const quotes = (s.voices ?? []).slice().sort((x, y) => (x.tone === 'bad' ? 0 : x.tone === 'warn' ? 1 : 2) - (y.tone === 'bad' ? 0 : y.tone === 'warn' ? 1 : 2)).filter((v, k, A) => A.findIndex(x => x.text === v.text) === k).slice(0, 3).map(v => ({ who: v.who + (v.district >= 0 && v.district < DISTRICTS.length ? `（${DISTRICTS[v.district]}）` : ''), text: v.text, tone: v.tone }));
  return { title: title ?? `${Math.floor(from / 12) + 1} 年目の年次報告`, from, to, rows, change, quotes };
}

// ---------------------------------------------------------------- 課題の対策の試算
export interface TrialOption { label: string; actions: Action[] | null; note: string; cost?: number;
  /** 実行しても効かない条件があるときの注意（例：水道に余力がなく住宅が建たない）。試算の結果の上に目立たせて出す */
  warn?: string;
  /** 転入の楽観〜慎重で、何もしない場合との差の幅を出す（重い。押したときだけ呼ぶ） */
  range?: () => { id: string; lo: number; hi: number }[];
  /** v91：課題の主な指標に効く向きと強さ（+1 よく効く・0 ほぼ効かない・負は悪化）。未設定は課題に合わせて用意した対策（建設・更新など） */
  fit?: number;
  /** v91：課題そのものは良くならないが、財源・先送りとして比べる選択肢 */
  trade?: boolean;
  /** v91：この課題への効き方の短い説明（効果は小さい・財源の選択肢） */
  fitNote?: string }
/** v91：課題の対策の候補を見せる数（残りは「ほかの候補を見る」に畳む） */
export const TRIAL_SHOW = 5;
/** 課題に効く弱い政策（課題の主な指標にほとんど効かないもの） */
const ISSUE_POLICY_FIT: Record<string, number> = { roadCare: 0.1 };
/** 課題ごとの、効く政策 */
const ISSUE_POLICY: Record<string, string[]> = {
  care: ['careStaff', 'familyMove'], traffic: ['roadCare'], housing: ['homeReform'], fiscal: ['furusatoPR'], 'sat:5': ['shopStart'], 'sat:0': ['homeReform'], 'sat:13': ['homeReform'],
};
/** 場所を自動で選べる建設（課題の場所の近くで、置ける空き地をさがす） */
export function findSite(s: GameState, kind: Kind, tile: number): { x: number; y: number } | null {
  const m = getMap(s.seed);
  let cx = tile >= 0 ? tile % W : -1, cy = tile >= 0 ? Math.floor(tile / W) : -1;
  if (cx < 0) { // 人のいちばん多い地区の中心
    const d = (s.stats.popDistrict ?? []).map((v, k) => ({ v, k })).sort((a, b) => b.v - a.v)[0]?.k ?? 0;
    let sx = 0, sy = 0, n = 0; for (let t = 0; t < W * H; t += 3) if (m.district[t] === d && s.zone[t] > 0) { sx += t % W; sy += Math.floor(t / W); n++; }
    if (!n) return null; cx = Math.round(sx / n); cy = Math.round(sy / n);
  }
  for (let r = 0; r <= 14; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
    const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
    try { if (checkPlace(s, kind, x, y).level === 'ok') return { x, y }; } catch { /* 範囲外など */ }
  }
  return null;
}
export function trialOptions(s: GameState, issue: Issue): TrialOption[] {
  const out: TrialOption[] = [];
  for (const o of issue.options) {
    const m = /^build:(\w+)$/.exec(o.arg);
    const kind = o.act === 'tool' && m ? m[1] as Kind : o.act === 'issue' && o.arg === 'buildNursery' ? 'nursery' as Kind : null;
    if (kind && DEFS[kind]) {
      const p = findSite(s, kind, issue.tile);
      out.push(p ? { label: `${DEFS[kind].name}を建てる（${DISTRICTS[getMap(s.seed).district[p.y * W + p.x]] ?? ''}の空き地）`, actions: [{ type: 'build', kind, x: p.x, y: p.y }], note: '置き場所は課題の近くの空き地から自動で選んだ仮の場所です。実際の場所は建設メニューで選べます', cost: DEFS[kind].cost }
        : { label: o.label, actions: null, note: '置ける空き地が近くに見つかりません。建設メニューで場所を選んでください' });
    } else if (o.act === 'renewall') {
      const ids = s.buildings.filter(b => b.status === 'suspended' && b.age >= 99 && (o.arg === 'all' || DEFS[b.kind].fam === o.arg)).map(b => b.id);
      out.push({ label: o.label, actions: ids.map(id => ({ type: 'renew', id } as Action)), note: '止まっている施設を更新します', cost: ids.reduce((a, id) => a + (DEFS[s.buildings.find(b => b.id === id)!.kind].renewCost ?? 0), 0) });
    } else if (o.act === 'tool' || (o.act === 'issue' && ['road', 'zone', 'widen'].includes(o.arg))) {
      out.push({ label: o.label, actions: null, note: '場所や範囲を選ぶ操作なので自動では試算できません。「計画案」で描いてから予測を見てください' });
    }
  }
  for (const id of ISSUE_POLICY[issue.key] ?? []) {
    const p = POLICIES.find(x => x.id === id); if (!p || s.policies[id]?.on) continue;
    out.push({ label: `政策「${p.name}」を始める`, actions: [{ type: 'policy', id, on: true }], note: `月 ${policyCost(s, p)} 万円。効果は ${p.ramp} か月かけて出そろいます`, cost: policyCost(s, p), ...(ISSUE_POLICY_FIT[id] !== undefined ? { fit: ISSUE_POLICY_FIT[id] } : {}) });
  }
  for (const f of TRIAL_SRC) { try { out.push(...f(s, issue)); } catch { /* 足した側の誤りで課題の画面を止めない */ } }
  return rankTrial(out);
}
/** v91：課題の主な指標に効く順に並べ、悪化させる候補は外す。財源・先送りの選択肢と、効果の小さいものは下に。同じ名前の候補は 1 つに */
export function rankTrial(out: TrialOption[]): TrialOption[] {
  const seen = new Set<string>(), keep: TrialOption[] = [];
  for (const o of out) {
    if (seen.has(o.label)) continue; seen.add(o.label);
    if (o.fit !== undefined && o.fit < -0.15 && !o.trade) continue; // その課題の主な指標を悪化させる（混雑の課題での「容積を上げる」など）
    if (o.trade) o.fitNote = 'この課題は良くならない（財源・先送りとして比べる選択肢）';
    else if (o.fit !== undefined && o.fit <= 0.15) o.fitNote = 'この課題への効果は小さい';
    keep.push(o);
  }
  const rank = (o: TrialOption) => (o.trade ? -1 : o.fit === undefined ? 1.1 : o.fit <= 0.15 ? -2 : o.fit) - (o.actions ? 0 : 0.05);
  return keep.map((o, k) => ({ o, k })).sort((a, b) => rank(b.o) - rank(a.o) || a.k - b.k).map(x => x.o);
}
const TRIAL_SRC: ((s: GameState, issue: Issue) => TrialOption[])[] = [];
/** 課題の対策の候補を外から足す（ループ担当の loopOptions をつなぐ入口） */
export function registerTrialOptions(f: (s: GameState, issue: Issue) => TrialOption[]): void { TRIAL_SRC.push(f); }
export interface TrialResult { ok: boolean; msg: string; ids: string[]; now: Record<string, number>; without: Expect; with: Expect }
/** 対策を実行した場合としない場合の 12 か月後（同じ指標で並べる） */
export function compareTrial(s: GameState, actions: Action[], issueKey: string): TrialResult {
  const now = indicatorValues(s), a = projectBands(s, [], 12, [12]), b = projectBands(s, actions, 12, [12]);
  const ids = issueKey === '*' ? REG.map(d => d.id) : [...new Set([...issueIndicators(issueKey), 'operating', 'sat', 'pop'])];
  return { ok: b.ok, msg: b.ok ? '' : b.msg, ids, now, without: a.expect, with: b.expect };
}

// ---------------------------------------------------------------- 政策カードの数値
/** 政策の対象（いまの街の人数・世帯数）。who の文から世帯類型を読み取る */
export function policyTarget(s: GameState, who: string): string {
  const hh = s.stats.hhByType ?? [], per = s.stats.pop / Math.max(1, s.stats.households);
  const pick: number[] = [];
  if (/単身|若い/.test(who)) pick.push(0);
  if (/夫婦/.test(who)) pick.push(1);
  if (/子育て|未就学|保育/.test(who)) pick.push(2);
  if (/子育て|就学|子ども/.test(who) && !/未就学/.test(who)) pick.push(3);
  if (/高齢/.test(who)) pick.push(4);
  if (/全市|市全体|財政|全員/.test(who) || !pick.length) return `全市民 約 ${Math.round(s.stats.pop).toLocaleString()} 人（${Math.round(s.stats.households).toLocaleString()} 世帯）`;
  const u = [...new Set(pick)], n = u.reduce((a, k) => a + (hh[k] ?? 0), 0);
  return `${u.map(k => HH_NAMES[k]).join('・')} 約 ${Math.round(n).toLocaleString()} 世帯（約 ${Math.round(n * per).toLocaleString()} 人）`;
}
