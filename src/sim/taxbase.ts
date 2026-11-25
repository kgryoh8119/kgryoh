// v99：住民税を住民一人ひとりの所得から積み上げる。
// 住民の層（people.ts）と歳入（step.ts の monthlyBudget）が同じ規則・同じ人数を使う：
//  - 働く人の所得は、職場（事業所の種類）の業種と雇用形態（正規・非正規）で決める。正規の割合も職場の業種で決める（v90：住民の属性では決めない）
//  - 高齢者は年金（3 段階）、家の大人・子どもは所得なし
//  - 税額は所得割 10%（市町村 6%・県 4%。この街には県の会計がないので合わせて市の歳入に入れる）＋均等割（年 5,000 円）。
//    給与所得控除・公的年金等控除・社会保険料・基礎控除を引き、非課税の限度（合計所得 45 万円以下）を入れた簡略の計算
// 歳入では、住民を一人ずつ作らずに「職場ごとの市民の人数 × その職場の所得」で数える（予測・試算の複製でも重くならないように）。
// 住民の層の一人ずつの合計とは、職場の選び方（近い順の確率）と正規・非正規の引き当ての偶然の分だけずれる（数 % 以内。テストで確かめる）。
import { P, DEFS, SCALE, isRes, isShop, isCity, fam, lvK } from './config';
import { sectorOf, type Sector } from './macro';
import { terrainOf } from './map';
import type { GameState, Building, Kind } from './types';
import { NHH } from './types';

// ---------------------------------------------------------------- 所得の相場
/** 業種の区分。reg・non は正規・非正規の月あたりの所得（年収 ÷ 12、万円）、share は正規の割合。
 *  相場：国税庁「民間給与実態統計調査」（令和 5 年分）の業種別の平均給与と、正社員 530 万円・正社員以外 202 万円、
 *  総務省「労働力調査」の産業別の非正規の割合（宿泊・飲食 7 割台、小売 5 割前後、製造 2 割台、金融 2 割前後）をまるめた */
export const WAGE_GROUPS = {
  out: { name: '市外の会社', reg: 45, non: 17, share: 0.68 },
  fin: { name: '金融・情報通信', reg: 55, non: 19, share: 0.82 },
  office: { name: '事務所・研究', reg: 47, non: 18, share: 0.75 },
  maker: { name: '製造・建設・エネルギー', reg: 43, non: 18, share: 0.78 },
  move: { name: '運輸・物流', reg: 38, non: 16, share: 0.72 },
  shop: { name: '小売・飲食', reg: 32, non: 11, share: 0.42 },
  leisure: { name: '宿泊・観光・娯楽', reg: 30, non: 11, share: 0.35 },
  care: { name: '医療・福祉・教育', reg: 38, non: 15, share: 0.65 },
  pub: { name: '市役所・市の施設', reg: 46, non: 15, share: 0.70 },
  agri: { name: '農林水産', reg: 28, non: 10, share: 0.50 },
} as const;
export type WageGroup = keyof typeof WAGE_GROUPS;
export const WAGE_IDS = Object.keys(WAGE_GROUPS) as WageGroup[];
const SEC_GROUP: Partial<Record<Sector, WageGroup>> = {
  bank: 'fin', it: 'fin', trading: 'office', pharma: 'maker', auto: 'maker', machine: 'maker', elec: 'maker', material: 'maker', food: 'maker',
  construct: 'maker', energy: 'maker', defense: 'maker', space: 'maker', transport: 'move', retail: 'shop', service: 'leisure', agri: 'agri', realty: 'office',
} as Partial<Record<Sector, WageGroup>>;
/** 職場の建物の種類 → 業種の区分（市外は 'out'） */
export function wageGroupOf(kind: Kind | null): WageGroup {
  if (!kind) return 'out';
  if (kind === 'station') return 'move';
  if (isShop(kind)) return 'shop';
  if (isCity(kind)) { const f = fam(kind) as string; return f === 'health' || f === 'care' || f === 'school' || f === 'jhs' || DEFS[kind].cat === 'edu' || DEFS[kind].cat === 'health' || DEFS[kind].cat === 'kids' ? 'care' : 'pub'; }
  const sec = sectorOf(kind); if (sec && SEC_GROUP[sec]) return SEC_GROUP[sec]!;
  const c = DEFS[kind].cat as string;
  return c === 'biz' ? 'office' : c === 'industry' ? 'maker' : c === 'agri' ? 'agri' : c === 'commerce' ? 'shop' : c === 'leisure' || c === 'landmark' || c === 'nature' ? 'leisure' : c === 'health' || c === 'edu' || c === 'kids' ? 'care' : c === 'transport' ? 'move' : 'office';
}
/** 地方と都市の賃金の差（賃金構造基本統計調査 2023 年の都道府県別：東京は全国の約 1.15 倍、地方の県は 0.85 倍前後）。市外の会社は近くの都市の水準 */
export function regionK(s: GameState, outside: boolean): number {
  const id = terrainOf(s.seed).id as string;
  const k = id === 'urban' ? 1.06 : id === 'rural' || id === 'mountain' || id === 'island' || id === 'castaway' ? 0.94 : 1; // 差を半分ほどにまるめた（はじめの街の歳入を大きく変えないため）
  return outside ? k * 1.03 : k;
}
/** 年金（月あたり、万円）：国民年金が中心の人・厚生年金の人・厚生年金と企業年金の人（厚生労働省「厚生年金保険・国民年金事業の概況」の相場をまるめた） */
export const PENSIONS = [{ v: 6, share: 0.3 }, { v: 14, share: 0.5 }, { v: 20, share: 0.2 }] as const;

// ---------------------------------------------------------------- 税額（年、万円）
const NONTAX = 45; // 非課税の限度（合計所得、単身の相場）
const KINTO = 0.5; // 均等割（市町村 3,000 円＋県 1,000 円＋森林環境税は国税なので入れず、復興の上乗せ分を含めた 5,000 円の相場）
/** 給与の年収 g（万円）にかかる個人住民税（年、万円） */
export function wageTaxYear(g: number): number {
  if (g <= 0) return 0;
  const ded = g <= 162.5 ? 55 : g <= 180 ? g * 0.4 - 10 : g <= 360 ? g * 0.3 + 8 : g <= 660 ? g * 0.2 + 44 : g <= 850 ? g * 0.1 + 110 : 195; // 給与所得控除
  const inc = Math.max(0, g - ded);
  if (inc <= NONTAX) return 0;
  return 0.1 * Math.max(0, inc - g * 0.15 - 43) + KINTO; // 社会保険料（年収の 15%）・基礎控除 43 万円
}
/** 65 歳以上の年金の年額 a（万円）にかかる個人住民税（年、万円） */
export function pensionTaxYear(a: number): number {
  const ded = a <= 330 ? 110 : a <= 410 ? a * 0.25 + 27.5 : a * 0.15 + 68.5; // 公的年金等控除
  const inc = Math.max(0, a - ded);
  if (inc <= NONTAX) return 0;
  return 0.1 * Math.max(0, inc - a * 0.08 - 43) + KINTO; // 介護・後期高齢者医療の保険料（年金の 8%）・基礎控除
}
/** 月の所得 m（万円）の人の月あたりの住民税（万円） */
export const wageTaxMonth = (m: number) => wageTaxYear(m * 12) / 12;
export const pensionTaxMonth = (m: number) => pensionTaxYear(m * 12) / 12;

// ---------------------------------------------------------------- 職場（住民の層と同じ）
/** 市民が埋める職の数（雇用の 65%。残りは市外から通う人）。people.ts の職場の割り当てと同じ */
export function jobSlots(s: GameState): { b: Building; cap: number }[] {
  const out: { b: Building; cap: number }[] = [];
  for (const b of s.buildings) {
    if (b.status !== 'operating' || !b.connected || isRes(b.kind)) continue;
    const d = DEFS[b.kind]; let j = 0;
    if (isShop(b.kind)) j = d.jobs ?? 0; else if (d.jobs) j = d.jobs * lvK(b); else if (isCity(b.kind)) j = b.staff ?? 0;
    if (b.kind === 'station') j += [0, 0, 450, 1100][Math.max(0, Math.min(3, b.lv ?? 1))] ?? 0;
    if (j > 0) out.push({ b, cap: Math.round(j * 0.65) });
  }
  // 駅・診療所など固定の職（core.ts の 260 × SCALE）は、駅か市の施設に置く
  const stations = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating' && b.connected);
  const host = stations.length ? stations : s.buildings.filter(b => isCity(b.kind) && b.status === 'operating' && b.connected).slice(0, 1);
  for (const b of host) { const k = out.findIndex(o => o.b === b), add = Math.round(260 * SCALE * 0.65 / host.length); if (k >= 0) out[k].cap += add; else out.push({ b, cap: add }); }
  return out;
}
/** 市内で働く市民の割合（雇用が十分でも 15% は市外へ） */
export const localShare = (capAll: number, nWork: number) => Math.min(0.85, capAll / Math.max(1, nWork));

// ---------------------------------------------------------------- 積み上げ
export interface TaxPart { n: number; income: number; tax: number }
export interface TaxBase {
  /** 業種ごと（働く人）：人数・所得の合計（万円/月）・住民税（万円/月、税率の政策と景気の前） */
  work: Record<WageGroup, TaxPart>;
  /** 高齢者（年金）・その他（子ども・家の大人。所得なし） */
  senior: TaxPart; other: { n: number };
  /** 正規・非正規（働く人の合計） */
  regular: TaxPart; nonRegular: TaxPart;
  /** 住民税の合計（税率の政策と景気の前、万円/月） */
  tax: number;
}
const cache = new WeakMap<GameState, { key: string; t: TaxBase }>();
const keyOf = (s: GameState) => `${s.month}:${s.bVersion}:${Math.round((s.stats?.pop ?? 0) * 100)}:${s.buildings.length}`;
/** 住民税の積み上げ（人数は世帯の構成から、職場は雇用の 65% を市民が埋める規則から） */
export function taxBase(s: GameState): TaxBase {
  const key = keyOf(s), c = cache.get(s); if (c && c.key === key) return c.t;
  const hh = [0, 0, 0, 0, 0];
  for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating') for (let t = 0; t < NHH; t++) hh[t] += b.hh?.[t] ?? 0;
  let nWork = 0, nSenior = 0, nAll = 0;
  for (let t = 0; t < NHH; t++) {
    const w = P.workers[t] ?? 0, kids = (P.preschool[t] ?? 0) + (P.schoolKids[t] ?? 0) + (P.jhsKids[t] ?? 0), rest = Math.max(0, P.persons[t] - kids - w);
    nWork += hh[t] * w; nAll += hh[t] * P.persons[t]; if (t === 4) nSenior += hh[t] * rest;
  }
  const work = Object.fromEntries(WAGE_IDS.map(g => [g, { n: 0, income: 0, tax: 0 }])) as Record<WageGroup, TaxPart>;
  const regular = { n: 0, income: 0, tax: 0 }, nonRegular = { n: 0, income: 0, tax: 0 };
  const add = (g: WageGroup, n: number, outside: boolean) => {
    if (n <= 0) return;
    const G = WAGE_GROUPS[g], rk = regionK(s, outside), r = G.reg * rk, q = G.non * rk;
    const nr = n * G.share, nq = n - nr, w = work[g];
    w.n += n; w.income += nr * r + nq * q; w.tax += nr * wageTaxMonth(r) + nq * wageTaxMonth(q);
    regular.n += nr; regular.income += nr * r; regular.tax += nr * wageTaxMonth(r);
    nonRegular.n += nq; nonRegular.income += nq * q; nonRegular.tax += nq * wageTaxMonth(q);
  };
  const slots = jobSlots(s), capAll = slots.reduce((a, o) => a + o.cap, 0);
  const local = slots.length ? nWork * localShare(capAll, nWork) : 0, k = capAll > 0 ? Math.min(1, local / capAll) : 0;
  for (const o of slots) add(wageGroupOf(o.b.kind), o.cap * k, false);
  add('out', nWork - local, true);
  const senior = { n: nSenior, income: 0, tax: 0 };
  for (const p of PENSIONS) { senior.income += nSenior * p.share * p.v; senior.tax += nSenior * p.share * pensionTaxMonth(p.v); }
  const K = P.resTaxK ?? 1; for (const x of [senior, regular, nonRegular, ...WAGE_IDS.map(g => work[g])]) x.tax *= K; // 合わせの係数（内訳の合計が総額と一致するよう内訳にも掛ける）
  let tax = senior.tax; for (const g of WAGE_IDS) tax += work[g].tax;
  const t: TaxBase = { work, senior, other: { n: Math.max(0, nAll - nWork - nSenior) }, regular, nonRegular, tax };
  cache.set(s, { key, t });
  return t;
}

// ---------------------------------------------------------------- 内訳の移り変わり（秘書・部長の説明用。保存しない）
interface Mix { month: number; tax: number; out: number; nOut: number; local: number; nLocal: number; senior: number; nSenior: number; top: WageGroup | null; byG: Partial<Record<WageGroup, number>> }
const mixLog = new WeakMap<GameState, Mix[]>();
const mixOf = (s: GameState): Mix => {
  const t = taxBase(s), byG: Partial<Record<WageGroup, number>> = {}; let local = 0, nLocal = 0, top: WageGroup | null = null;
  for (const g of WAGE_IDS) { if (g === 'out') continue; const w = t.work[g]; byG[g] = w.tax; local += w.tax; nLocal += w.n; if (w.n > 0.5 && (!top || w.tax > t.work[top].tax)) top = g; }
  return { month: s.month, tax: t.tax, out: t.work.out.tax, nOut: t.work.out.n, local, nLocal, senior: t.senior.tax, nSenior: t.senior.n, top, byG };
};
/** 月次の処理で今月の内訳を覚える（予測・試算の複製では呼ばない。保存しないので、読み込んだ直後は記録が空） */
export function recordTaxMix(s: GameState): void {
  let L = mixLog.get(s); if (!L) mixLog.set(s, L = []);
  if (L.length && L[L.length - 1].month === s.month) L.pop();
  L.push(mixOf(s)); if (L.length > 13) L.shift();
}
const n0 = (v: number) => Math.round(v).toLocaleString('ja-JP');
const pctOf = (a: number, b: number) => Math.round(100 * a / Math.max(1e-9, b));
/** 住民税の内訳を人の言葉で（企画財政部長の発言に使う）。数字は taxBase の積み上げのまま（税率の政策・景気の係数の前） */
export function taxStory(s: GameState): string {
  const now = mixOf(s); if (now.tax <= 0) return '';
  const L = mixLog.get(s) ?? [], old = L.find(m => m.month <= s.month - 12) ?? L.find(m => m.month <= s.month - 3);
  const comp = `住民税の ${pctOf(now.out, now.tax)}% は市外の会社で働く人、${pctOf(now.local, now.tax)}% は市内の職場で働く人${now.top ? `（いちばん多いのは${WAGE_GROUPS[now.top].name}）` : ''}、${pctOf(now.senior, now.tax)}% は年金の高齢者からです。`;
  if (!old) return comp;
  const d = now.tax - old.tax, span = s.month - old.month;
  if (Math.abs(d) < old.tax * 0.01) return `住民税は ${span} か月前とほぼ同じです。${comp}`;
  // いちばん大きく動いた内訳を理由に挙げる
  const cand: { v: number; why: string }[] = [
    { v: now.out - old.out, why: `市外の会社で働く住民が ${n0(Math.abs(now.nOut - old.nOut))} 人${now.nOut >= old.nOut ? '増えた' : '減った'}` },
    { v: now.senior - old.senior, why: `年金で暮らす高齢者が ${n0(Math.abs(now.nSenior - old.nSenior))} 人${now.nSenior >= old.nSenior ? '増えた' : '減った'}` },
  ];
  for (const g of WAGE_IDS) if (g !== 'out') { const v = (now.byG[g] ?? 0) - (old.byG[g] ?? 0); if (v) cand.push({ v, why: `市内の${WAGE_GROUPS[g].name}の職場で働く住民が${v > 0 ? '増えた' : '減った'}` }); }
  const main = cand.filter(c => Math.sign(c.v) === Math.sign(d)).sort((a, b) => Math.abs(b.v) - Math.abs(a.v))[0];
  return `住民税は ${span} か月前より月 ${n0(Math.abs(d))} 万円${d > 0 ? '増えました' : '減りました'}${main ? `。いちばん大きいのは、${main.why}ためです` : ''}。${comp}`;
}
