// v90：ゲームループ（loops.ts）の指標と対策を、予測と結果の記録・対策の試算・年次報告（report.ts）につなぐ。
// 予測の画面と結果の画面が同じ関数（loopIndicators）から指標を出すようにするための、つなぎだけの層。
import { INDICATORS, LOOPS, loopIndicators, loopOptions, loopOfIssue, expectOf, mainIndicatorOf, optionFit, OPTION_EFFECT, type IndicatorId } from './loops';
import { registerIndicators, registerIssueIndicators, registerTrialOptions, registerActionIndicators, onIndicatorValues, BASE_INDICATORS, deficitWarn } from './report';
import type { GameState } from './types';

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
