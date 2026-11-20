// v90：ゲームループ（loops.ts）の指標と対策を、予測と結果の記録・対策の試算・年次報告（report.ts）につなぐ。
// 予測の画面と結果の画面が同じ関数（loopIndicators）から指標を出すようにするための、つなぎだけの層。
import { INDICATORS, LOOPS, loopIndicators, loopOptions, loopOfIssue, expectOf, mainIndicatorOf, optionFit, OPTION_EFFECT, type IndicatorId } from './loops';
import { registerIndicators, registerIssueIndicators, registerTrialOptions, registerActionIndicators, onIndicatorValues, BASE_INDICATORS, deficitWarn, type TrialOption } from './report';
import type { GameState, Action } from './types';
import { tempDebt, monthlyBudget } from './step';
import { POLICIES, policyCost, bondCap, P } from './config';
import { furusatoCalc } from './economy';
import { FREQS } from './big';

/** 単位ごとの「ほぼ予測どおり」とみなす幅 */
const TOL: Record<string, number> = { '人': 3, '世帯': 2, '%': 2, '万円': 30, '円': 20, '点': 1.5, '店': 1 };
// loopIndicators は 1 回で全部の指標を計算するので、まとめて読むときは 1 回だけ計算して使い回す
let memo: { s: GameState; v: Record<IndicatorId, number> } | null = null;
onIndicatorValues(s => { memo = { s, v: loopIndicators(s) }; });
const val = (s: GameState, id: IndicatorId) => (memo && memo.s === s ? memo.v : loopIndicators(s))[id];
// 汎用の指標と同じ id（市債残高）は汎用のほうを使う
const have = new Set<string>([...BASE_INDICATORS.map(d => d.id), 'careWait', 'roadVc']); // 保育の待機・道路の混雑率は汎用の指標（wait・maxVc）と同じ値なので重ねない
registerIndicators(INDICATORS.filter(d => !have.has(d.id)).map(d => ({ id: d.id, name: d.name, unit: d.unit, better: d.better, scope: d.scope, tol: TOL[d.unit] ?? 1, digits: d.unit === '点' || d.unit === '%' || d.id === 'inflowHH' ? 1 : 0, /* inflowHH は世帯の月平均なので小数 1 桁 */ get: (s: GameState) => val(s, d.id) })));
// 課題がゲームループの入口なら、そのループの指標（先頭の 5 つ）も並べる
registerIssueIndicators(key => { const lp = loopOfIssue(key); return lp ? (LOOPS.find(l => l.id === lp)?.indicators ?? []).filter(i => !have.has(i)).slice(0, 4) : []; });
// 課題の「対策を試算」に、ループの対策の候補を足す（期待効果は試算の画面で同じ指標から出すので、ここでは計算しない）
/** 毎月の費用の書き方。負は収入か支出の削減として読めるように */
export const monthlyText = (m: number) => m > 0 ? `毎月 ${Math.round(m).toLocaleString()} 万円の支出` : `毎月 ${Math.abs(Math.round(m)).toLocaleString()} 万円の収入・支出減`;
/** 水道に余力がないと民間の住宅は着工しない（step.ts の privateHousing）。容積を上げる前に知らせる */
export function housingBlocked(s: GameState): string {
  const st = s.stats;
  if (st.waterCap >= st.waterDemand * 1.02) { // 下水・電力に余力がなくても着工しない（同じ関数の条件）
    if (st.sewageCap < st.sewageDemand) return 'いまは下水に余力がないため、容積を上げても住宅は建ちません。先に下水処理場を増設・更新してください';
    if (st.powerCap < st.powerDemand) return 'いまは電力に余力がないため、容積を上げても住宅は建ちません。先に発電所を増設してください';
    return '';
  }
  return `いまは水道に余力がないため、容積を上げても住宅は建ちません（水道の能力 ${Math.round(st.waterCap).toLocaleString()} ÷ 需要 ${Math.round(st.waterDemand).toLocaleString()}、着工には 1.02 倍以上が必要）。先に浄水場を更新・増設してください`;
}
/** v93：12 か月以内に実行した容積の変更を、すぐ逆向きに戻す候補への注意。混雑の課題では「上限を下げる」、住宅の課題では「上げる」が
 *  候補の上に来るので、課題に素直に対応すると上げる・下げるを繰り返すことがあった（効果が出る前に打ち消し合う） */
function undoWarn(s: GameState, id: string): string | undefined {
  const re = id === 'zoneDown' ? /容積を上げる/ : id === 'upzone' ? /容積の上限を下げる/ : null; if (!re) return undefined;
  const d = (s.decisions ?? []).filter(x => s.month - x.month < 12 && re.test(x.label)).at(-1); if (!d) return undefined;
  return `${s.month - d.month} か月前に「${d.label}」を実行したばかりです。すぐ戻すと、効果が出る前に打ち消し合い、開発事業者の計画も無駄になります`;
}
registerTrialOptions((s, issue) => { const lp = issue.loop ?? loopOfIssue(issue.key); if (!lp) return [];
  const loop = LOOPS.find(l => l.id === lp)!, main = mainIndicatorOf(issue.key);
  return loopOptions(s, lp, { expect: false }).filter(o => o.ok).map(o => ({ label: o.label, actions: [o.action], cost: o.cost,
    ...(main ? (() => { const f = optionFit(o.id, main); return { fit: f.v, trade: f.trade || undefined }; })() : {}),
    warn: (o.id === 'upzone' ? housingBlocked(s) || undefined : undefined) ?? undoWarn(s, o.id) ?? deficitWarn(s, o.monthly), // v93：直前の容積の変更を戻す対策・毎月の収支が赤字になる対策にも注意
    range: () => expectOf(s, lp, o.action, 12).filter(e => !have.has(e.indicator) && (e.lo || e.hi)).map(e => ({ id: e.indicator, lo: e.lo, hi: e.hi })),
    note: [o.monthly ? monthlyText(o.monthly) : '', o.months ? `効くまで ${o.months} か月` : '', `決めるのは${o.authority}`, o.side.length ? `副作用：${o.side.join('、')}` : '', `（${loop.name}の対策）`].filter(Boolean).join('・') })); });
// v91：政策・建設・更新が効く指標に、ループの対策の向き（OPTION_EFFECT）を足す。保育の待機・道路の混雑率は汎用の指標の名前で
const SAME: Partial<Record<IndicatorId, string>> = { careWait: 'wait', roadVc: 'maxVc' };
const BUILD_OPT: Record<string, string> = { nurseryS: 'nursery', nursery: 'nursery', school: 'schoolNew', mall: 'mall', factory: 'factory' };
registerActionIndicators((s, a) => {
  const id = a.type === 'policy' ? a.id : a.type === 'build' ? BUILD_OPT[a.kind] : a.type === 'renew' ? 'renew' : a.type === 'upgrade' && s.buildings.find(b => b.id === a.id)?.kind === 'school' ? 'schoolUp' : a.type === 'zone' ? (a.zone === 3 ? 'upzone' : '') : '';
  const e = id ? OPTION_EFFECT[id] : undefined; if (!e) return [];
  return (Object.entries(e) as [string, unknown][]).filter(([k, v]) => k !== 'trade' && typeof v === 'number' && Math.abs(v) >= 0.3).map(([k]) => SAME[k as IndicatorId] ?? k);
});

// v94：財政の課題（赤字・一時借入・資金不足）の候補。v91〜93 は、財源・先送りの対策に「この課題は良くならない」の印が付いて下位に回り、
// 課題に素直に対応すると 2 期目に赤字が続いて一時借入で崩れた（山あい・田園）。財政の課題では「月の収支・市債を良くする」を効果として数え、
// 収支が良くなる額の大きい順に上に並べる（fit を良くなる額から出す。trade の印は付けない）。支持率・転出などの副作用は印（side）で示す
const TAX_NAME = { res: '住民税', prop: '固定資産税', biz: '法人の税' } as const;
const RAIL_SUB = [0, 200, 500, 900];
export function fiscalOptions(s: GameState): TrialOption[] {
  const out: (TrialOption & { gain: number })[] = [];
  const L = s.ledger.at(-1), last = s.ledger.slice(-6);
  const op = last.length ? last.reduce((a, l) => a + l.operating, 0) / last.length : monthlyBudget(s).operating;
  const td = tempDebt(s), scale = Math.max(150, -op, td / 24);
  const fitOf = (gain: number) => gain > 0 ? Math.max(0.2, Math.min(1, gain / scale)) : 0;
  const push = (label: string, actions: Action[], gain: number, side: string, note: string, cost?: number) =>
    out.push({ label, actions, gain, fit: fitOf(gain), side: side || undefined, note: `${gain > 0 ? `毎月の資金が約 ${Math.round(gain).toLocaleString()} 万円よくなる見込み・` : ''}${note}`, ...(cost !== undefined ? { cost } : {}) });
  // 税率を 5% 上げる（6 か月に 1 回・上限 115%）。増税した分は交付税の計算に入らないので、そのまま市の収入になる
  if (L) for (const k of ['res', 'prop', 'biz'] as const) {
    const v = s.tax[k], lastT = s.acts['tax:' + k];
    if (v >= 1.149 || (lastT !== undefined && s.month - lastT < 6)) continue;
    const nv = Math.min(1.15, Math.round((v + 0.05) * 100) / 100), base = k === 'res' ? L.taxResident : k === 'prop' ? L.taxProperty : L.taxBusiness;
    const gain = base * (nv - v) / Math.max(0.5, v), ap = Math.round((k === 'res' ? 1.3 : k === 'prop' ? 0.8 : 0.3) * (nv - v) * 1000) / 10;
    push(`${TAX_NAME[k]}を上げる（標準の ${Math.round(v * 100)}% → ${Math.round(nv * 100)}%）`, [{ type: 'tax', key: k, v: nv }], gain,
      `支持率 約 −${ap} ポイント（1 年）${k === 'res' ? '・転出が増え、転入が減る' : k === 'prop' ? '・家賃が上がり、転入が減る' : '・企業の進出・出店が減る'}`, '翌月の収支から反映。決めるのは市（議会で条例を改正）');
  }
  // 料金改定・先送り・統廃合（老朽化のループの対策）と、費用のかかる対策をやめる（駅・産業のループの政策）
  const seen = new Set<string>();
  for (const lp of ['aging', 'station', 'industry'] as const) {
    let opts: ReturnType<typeof loopOptions> = []; try { opts = loopOptions(s, lp, { expect: false }); } catch { continue; }
    for (const o of opts) {
      if (!o.ok || !(o.monthly < 0) || seen.has(o.id)) continue; seen.add(o.id);
      push(o.label, [o.action], -o.monthly, o.side.join('、'), `決めるのは${o.authority}`, o.action.type === 'policy' ? o.monthly : undefined);
    }
  }
  for (const p of POLICIES) {
    if (!s.policies[p.id]?.on || seen.has('stop:' + p.id)) continue;
    const c = policyCost(s, p); if (c <= 0) continue;
    push(`政策「${p.name}」をやめる`, [{ type: 'policy', id: p.id, on: false }], c, `効果がなくなる（${p.why}）`, '翌月から', -c);
  }
  const freq = (s.pol as unknown as { rail?: { freq: number } } | undefined)?.rail?.freq ?? 0;
  if (freq > 0) push(`鉄道会社への増発の要請を 1 段下げる（${FREQS[freq - 1]}）`, [{ type: 'pol', op: 'railfreq', n: freq - 1 }], RAIL_SUB[freq] - RAIL_SUB[freq - 1], '電車の本数が減り、駅の混雑・通勤の満足が悪くなる', '決めるのは鉄道会社（市は補助を減らすだけ）');
  // ふるさと納税：寄付が 1.6 倍になり、返礼品と経費で半分かかる
  { const p = POLICIES.find(x => x.id === 'furusatoPR');
    if (p && !s.policies[p.id]?.on && L) { const fz = furusatoCalc(s, L.taxResident), c = policyCost(s, p);
      push(`政策「${p.name}」を始める`, [{ type: 'policy', id: p.id, on: true }], 0.6 * (fz.gift - fz.cost) - c, '', `月 ${c} 万円。効果は ${p.ramp} か月かけて出そろいます`, c); } }
  // 一時借入を市債に借り換える（年利 4%・2 年で返す一時借入を、低い利率で 20 年かけて返す市債に）
  if (td > 0 && s.fiscal?.status !== 'rebuild') {
    const debt = s.loans.filter(l => l.kind === 'bond').reduce((a, l) => a + l.remaining, 0);
    const amt = Math.min(Math.ceil(td / 1000) * 1000, Math.floor((bondCap(s) - debt) / 1000) * 1000);
    if (amt >= 1000) push(`市債に借り換えて一時借入を返す（${amt.toLocaleString()} 万円）`, [{ type: 'borrow', amount: amt }, { type: 'repayTemp', amount: amt }],
      amt / P.tempMonths - amt / P.bondMonths + amt * (P.tempRate - P.bondRate) / 12, `市債の残高が ${amt.toLocaleString()} 万円増え、${P.bondMonths / 12} 年かけて返す`, '一時借入がなくなると、選挙で不利になる分（支持率 −4 ポイントなど）が消える。決めるのは市（議会の議決）');
  }
  return out.sort((a, b) => b.gain - a.gain).map(({ gain: _g, ...o }) => o);
}
registerTrialOptions((s, issue) => issue.key === 'fiscal' ? fiscalOptions(s) : []);
