// v90：ゲームループ（loops.ts）の指標と対策を、予測と結果の記録・対策の試算・年次報告（report.ts）につなぐ。
// 予測の画面と結果の画面が同じ関数（loopIndicators）から指標を出すようにするための、つなぎだけの層。
import { INDICATORS, LOOPS, loopIndicators, loopOptions, loopOfIssue, type IndicatorId } from './loops';
import { registerIndicators, registerIssueIndicators, registerTrialOptions, onIndicatorValues, BASE_INDICATORS } from './report';
import type { GameState } from './types';

/** 単位ごとの「ほぼ予測どおり」とみなす幅 */
const TOL: Record<string, number> = { '人': 3, '世帯': 2, '%': 2, '万円': 30, '円': 20, '点': 1.5, '店': 1 };
// loopIndicators は 1 回で全部の指標を計算するので、まとめて読むときは 1 回だけ計算して使い回す
let memo: { s: GameState; v: Record<IndicatorId, number> } | null = null;
onIndicatorValues(s => { memo = { s, v: loopIndicators(s) }; });
const val = (s: GameState, id: IndicatorId) => (memo && memo.s === s ? memo.v : loopIndicators(s))[id];
// 汎用の指標と同じ id（市債残高）は汎用のほうを使う
const have = new Set<string>([...BASE_INDICATORS.map(d => d.id), 'careWait', 'roadVc']); // 保育の待機・道路の混雑率は汎用の指標（wait・maxVc）と同じ値なので重ねない
registerIndicators(INDICATORS.filter(d => !have.has(d.id)).map(d => ({ id: d.id, name: d.name, unit: d.unit, better: d.better, scope: d.scope, tol: TOL[d.unit] ?? 1, digits: d.unit === '点' || d.unit === '%' ? 1 : 0, get: (s: GameState) => val(s, d.id) })));
// 課題がゲームループの入口なら、そのループの指標（先頭の 5 つ）も並べる
registerIssueIndicators(key => { const lp = loopOfIssue(key); return lp ? (LOOPS.find(l => l.id === lp)?.indicators ?? []).filter(i => !have.has(i)).slice(0, 4) : []; });
// 課題の「対策を試算」に、ループの対策の候補を足す（期待効果は試算の画面で同じ指標から出すので、ここでは計算しない）
registerTrialOptions((s, issue) => { const lp = issue.loop ?? loopOfIssue(issue.key); if (!lp) return [];
  return loopOptions(s, lp, { expect: false }).filter(o => o.ok).map(o => ({ label: o.label, actions: [o.action], cost: o.cost,
    note: [o.monthly ? `月 ${o.monthly > 0 ? '' : '−'}${Math.abs(Math.round(o.monthly)).toLocaleString()} 万円` : '', o.months ? `効くまで ${o.months} か月` : '', `決めるのは${o.authority}`, o.side.length ? `副作用：${o.side.join('、')}` : ''].filter(Boolean).join('・') })); });
