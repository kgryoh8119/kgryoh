// v90：3 つの「選択 → 時間差 → 副作用 → 再判断」のループ（駅前再開発・老朽インフラ・産業と暮らし）。
// ・指標はひとつの関数（loopIndicators）から出す。予測（forecast.ts）・結果（年次報告）・期待効果の幅で同じ値を比べる。
// ・対策（loopOptions）は既存の dispatch に渡せる操作。期待効果は、対策を仮に実行した複製と何もしない複製を、
//   楽観／慎重の転入係数で数か月回した差の幅（forecast と同じく、できごとは起こさない）。
// ・どの対策にも費用と副作用がある（一つの正解は作らない）。ここは読むだけで、本番の状態は変えない。
import type { GameState, Action, Building, Kind } from './types';
import { NHH, DISTRICTS, HH_NAMES } from './types';
import { DEFS, P, POLICIES, policyCost, isRes, isShop, isCity, fam, W, H } from './config';
import { modMul, modAdd, sumHH, distField } from './core';
import { stepMonth, monthlyBudget } from './step';
import { dispatch, checkPlace, upgradeBlock, planZone, planRepair } from './actions';
import { FREQS } from './big';
import { logView, renewCostOf } from './loopHooks';
import { waterOldK } from './events';
import { getMap, idx } from './map';
import { commonRng } from './report';

export type LoopId = 'station' | 'aging' | 'industry';
export type IndicatorId =
  | 'inflowHH' | 'rentBurden' | 'careWait' | 'schoolCrowd' | 'stationCrowd' | 'roadVc' | 'taxRevenue' | 'levy'
  | 'lifeline' | 'renewal60' | 'waterBill' | 'debt' | 'disasterLoss'
  | 'jobs' | 'bizTax' | 'shopSales' | 'shopClosed' | 'traffic' | 'envSat'
  | 'satSingle' | 'satCouple' | 'satFamYoung' | 'satFamSchool' | 'satSenior' | 'satDistrictMin';

export interface IndicatorDef { id: IndicatorId; name: string; unit: string; better: 'up' | 'down'; scope: 'city' | 'district' }
export const INDICATORS: IndicatorDef[] = [
  { id: 'inflowHH', name: '転入世帯（月）', unit: '世帯', better: 'up', scope: 'city' },
  { id: 'rentBurden', name: '住宅費の負担（家賃 ÷ 所得）', unit: '%', better: 'down', scope: 'city' },
  { id: 'careWait', name: '保育の待機', unit: '人', better: 'down', scope: 'city' },
  { id: 'schoolCrowd', name: '小学校の過密（いちばん混む学校、または市全体の児童 ÷ 定員）', unit: '%', better: 'down', scope: 'city' },
  { id: 'stationCrowd', name: '駅の朝の混雑率（いちばん混む駅の乗客 ÷ 電車の能力）', unit: '%', better: 'down', scope: 'city' },
  { id: 'roadVc', name: '道路の混雑率（いちばん混む区間）', unit: '%', better: 'down', scope: 'city' },
  { id: 'taxRevenue', name: '市税（月）', unit: '万円', better: 'up', scope: 'city' },
  { id: 'levy', name: '開発負担金（累計）', unit: '万円', better: 'up', scope: 'city' },
  { id: 'lifeline', name: '実効容量（水道・下水・ごみのうち余力のいちばん少ないもの ÷ 需要）', unit: '%', better: 'up', scope: 'city' },
  { id: 'renewal60', name: '更新費の見通し（5 年以内。先送りの割増しを含む）', unit: '万円', better: 'down', scope: 'city' },
  { id: 'waterBill', name: '水道料金（1 世帯・月）', unit: '円', better: 'down', scope: 'city' },
  { id: 'debt', name: '市債・借入の残高', unit: '万円', better: 'down', scope: 'city' },
  { id: 'disasterLoss', name: '災害時の想定損失（中くらいの地震）', unit: '万円', better: 'down', scope: 'city' },
  { id: 'jobs', name: '市内の雇用', unit: '人', better: 'up', scope: 'city' },
  { id: 'bizTax', name: '事業の税収（月）', unit: '万円', better: 'up', scope: 'city' },
  { id: 'shopSales', name: '市内の小さな店の売上（月）', unit: '万円', better: 'up', scope: 'city' },
  { id: 'shopClosed', name: '閉店した店（直近 12 か月）', unit: '店', better: 'down', scope: 'city' },
  { id: 'traffic', name: '幹線道路の交通量（混む上位 1 割の区間の平均の混雑率）', unit: '%', better: 'down', scope: 'city' },
  { id: 'envSat', name: '環境（空気・騒音）の満足', unit: '点', better: 'up', scope: 'city' },
  { id: 'satSingle', name: `満足：${HH_NAMES[0]}`, unit: '点', better: 'up', scope: 'city' },
  { id: 'satCouple', name: `満足：${HH_NAMES[1]}`, unit: '点', better: 'up', scope: 'city' },
  { id: 'satFamYoung', name: `満足：${HH_NAMES[2]}`, unit: '点', better: 'up', scope: 'city' },
  { id: 'satFamSchool', name: `満足：${HH_NAMES[3]}`, unit: '点', better: 'up', scope: 'city' },
  { id: 'satSenior', name: `満足：${HH_NAMES[4]}`, unit: '点', better: 'up', scope: 'city' },
  { id: 'satDistrictMin', name: '満足のいちばん低い地区', unit: '点', better: 'up', scope: 'district' },
];
const SAT_IDS: IndicatorId[] = ['satSingle', 'satCouple', 'satFamYoung', 'satFamSchool', 'satSenior'];

export const LOOPS: { id: LoopId; name: string; indicators: IndicatorId[] }[] = [
  { id: 'station', name: '駅前再開発', indicators: ['inflowHH', 'rentBurden', 'careWait', 'schoolCrowd', 'stationCrowd', 'roadVc', 'taxRevenue', 'levy'] },
  { id: 'aging', name: '老朽インフラ', indicators: ['lifeline', 'renewal60', 'waterBill', 'debt', 'disasterLoss'] },
  { id: 'industry', name: '産業と暮らし', indicators: ['jobs', 'bizTax', 'shopSales', 'shopClosed', 'traffic', 'rentBurden', 'envSat', ...SAT_IDS, 'satDistrictMin'] },
];

const r1 = (v: number) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : 0);

/** 住宅費の負担：世帯ごとの家賃 ÷ 月収の平均（%）。家賃補助（housingAid）は満足の計算と同じ換算で差し引く */
export function rentBurden(s: GameState): number {
  const ri = s.stats.rentIndex ?? 1, aid = modAdd(s, 'housingAid'), rent = P.rent as Record<string, number>;
  let num = 0, den = 0;
  for (const b of s.buildings) {
    if (!isRes(b.kind) || b.status !== 'operating' || !b.hh) continue;
    const r = (rent[b.kind] ?? 8) * ri;
    for (let t = 0; t < NHH; t++) { const n = b.hh[t]; if (!(n > 0)) continue; const inc = P.income[t]; num += n * Math.max(0, r / inc - aid * (inc < 30 ? 1 : 0.5) / 2.2); den += n; }
  }
  return den > 0 ? (num / den) * 100 : 0;
}

/** 災害（中くらいの地震）の想定損失。k は揺れの強さ（0.6〜1.5）。古い施設・道路・水道ほど大きい。実際の被害の計算（events の damage）と同じ向きの近似 */
export function disasterLoss(s: GameState, k = 1): number {
  const st = s.stats, prep = st.pop > 0 ? Math.min(1, st.shelterCap / (st.pop * 0.4)) : 1;
  const K = k * (1 - 0.5 * prep) * modMul(s, 'disasterDmg');
  let v = 0;
  for (const b of s.buildings) if (isCity(b.kind) && DEFS[b.kind].renewCost && b.status !== 'construction' && b.age > 40) v += renewCostOf(b) * 0.22 * ((b.age - 40) / 60);
  let roads = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 1 || s.road[i] === 2) roads += 0.15 * P.roadRepairCost * (0.5 + s.roadAge[i] / 100);
  const water = st.households * 0.25 * waterOldK(s) * 2; // 断水の世帯の生活の損失（万円）
  return Math.round((v + roads + water) * K);
}

/** 各ループで比べる指標のいまの値。予測（複製を回したもの）にも結果にも、同じ関数を使う */
export function loopIndicators(s: GameState): Record<IndicatorId, number> {
  const st = s.stats, L = monthlyBudget(s), log = logView(s);
  let schoolCrowd = 0;
  for (const b of s.buildings) if (fam(b.kind) === 'school' && b.effCap > 0) schoolCrowd = Math.max(schoolCrowd, b.used / b.effCap);
  if (st.schoolKids > 0) schoolCrowd = Math.max(schoolCrowd, st.schoolKids / Math.max(1, st.schoolCap)); // 通学圏の外の子も数える（市全体の在籍 ÷ 定員）
  const trunk: number[] = []; for (let i = 0; i < s.road.length; i++) if (s.road[i] >= 2) trunk.push(s.vc[i] ?? 0);
  trunk.sort((a, b) => b - a); const top = trunk.slice(0, Math.max(1, Math.ceil(trunk.length / 10))), trafficV = trunk.length ? top.reduce((a, v) => a + v, 0) / top.length : 0;
  const ratio = (c: number, d: number) => (d > 0 ? c / d : 9);
  const life = Math.min(ratio(st.waterCap, st.waterDemand), ratio(st.wasteCap, st.wasteDemand), st.sewageDemand > 0 ? ratio(st.sewageCap, st.sewageDemand) : 9);
  let shopSales = 0; for (const b of s.buildings) if (isShop(b.kind) && b.status === 'operating') shopSales += b.revenue;
  const pd = st.popDistrict ?? [], sd = st.satDistrict ?? [];
  let dmin = Infinity; for (let d = 0; d < sd.length; d++) if ((pd[d] ?? 0) > 50) dmin = Math.min(dmin, sd[d]);
  const out = {
    inflowHH: r1(log.inHH), rentBurden: r1(rentBurden(s)), careWait: Math.round(st.waitlist), schoolCrowd: Math.round(schoolCrowd * 100),
    stationCrowd: Math.round((st.railCrowd ?? 0) * 100), roadVc: Math.round(st.maxVc * 100), taxRevenue: Math.round(L.taxResident + L.taxProperty + L.taxBusiness), levy: Math.round(log.levy),
    lifeline: Math.round(Math.min(life, 9) * 100), renewal60: Math.round(st.renewal60), waterBill: Math.round(4000 * modMul(s, 'waterFee') * (s.policies.suidoGenmen?.on ? 0.85 : 1)),
    debt: Math.round(st.debt), disasterLoss: disasterLoss(s),
    jobs: Math.round(st.localJobs), bizTax: Math.round(L.taxBusiness), shopSales: Math.round(shopSales), shopClosed: log.closed.filter(m => m > s.month - 12).length,
    traffic: Math.round(trafficV * 100), envSat: r1((st.satParts?.[11] ?? 0) * 100),
    satSingle: r1(st.satType[0] * 100), satCouple: r1(st.satType[1] * 100), satFamYoung: r1(st.satType[2] * 100), satFamSchool: r1(st.satType[3] * 100), satSenior: r1(st.satType[4] * 100),
    satDistrictMin: r1(Number.isFinite(dmin) ? dmin * 100 : st.sat * 100),
  } as Record<IndicatorId, number>;
  for (const k of Object.keys(out) as IndicatorId[]) if (!Number.isFinite(out[k])) out[k] = 0;
  return out;
}

/** 地区ごとの内訳（産業と暮らしで「どの地区が得をして、どの地区が損をするか」を見る） */
export function districtIndicators(s: GameState): { name: string; pop: number; sat: number; wait: number }[] {
  const st = s.stats;
  return DISTRICTS.map((name, d) => ({ name, pop: Math.round(st.popDistrict?.[d] ?? 0), sat: r1((st.satDistrict?.[d] ?? 0) * 100), wait: Math.round(st.waitDistrict?.[d] ?? 0) }));
}

// ---------------------------------------------------------------- 対策
export interface LoopOption {
  id: string;
  label: string;
  /** 既存の dispatch に渡せる操作 */
  action: Action;
  /** はじめにかかる費用（万円。負は収入） */
  cost: number;
  /** 毎月の費用（万円。負は収入・支出の削減） */
  monthly: number;
  /** 効果が出はじめるまで（工期・政策の立ち上がり） */
  months: number;
  /** 対象（誰の・何世帯の暮らしに効くか） */
  target: { who: string; hh: number };
  /** 期待効果の幅（楽観〜慎重の転入で、何もしない場合との差） */
  expect: { indicator: IndicatorId; lo: number; hi: number }[];
  /** 副作用 */
  side: string[];
  /** 決める権限（市・鉄道会社・企業…） */
  authority: string;
  /** いま実行できるか（できないときは理由） */
  ok: boolean; why?: string;
}
export interface LoopOptionsOpts { /** 期待効果を計算するか（重い。既定 true） */ expect?: boolean; /** 期待効果を見る月数（既定 12） */ months?: number }

type Draft = Omit<LoopOption, 'expect' | 'ok' | 'why' | 'cost'> & { cost?: number };

const totalHH = (s: GameState) => Math.round(s.stats.households);
const near = (b: Building, R: number, f: (r: Building) => boolean = () => true) => s0hh(b, R, f);
let curS: GameState | null = null;
function s0hh(b: Building, R: number, f: (r: Building) => boolean): number {
  let n = 0; for (const r of curS!.buildings) if (isRes(r.kind) && r.status === 'operating' && f(r) && Math.abs(r.x - b.x) <= R && Math.abs(r.y - b.y) <= R) n += sumHH(r);
  return Math.round(n);
}

/** 施設を置ける場所を、中心から近い順に探す（見つからなければ null） */
export function siteNear(s: GameState, kind: Kind, cx: number, cy: number, maxR = 40, budget = 900): { x: number; y: number; cost: number } | null {
  const d = DEFS[kind];
  for (let r = 0; r <= maxR && budget > 0; r++) {
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r || x < 0 || y < 0 || x + d.w > W || y + d.h > H) continue;
      const i = idx(x, y); if (s.occ[i] || s.road[i]) continue;
      if (--budget <= 0) return null;
      const c = checkPlace(s, kind, x, y); if (c.ok && c.level === 'ok') return { x, y, cost: c.cost };
    }
  }
  return null;
}

/** 世帯の重心（大型店・工場の候補地を探す起点） */
function hhCenter(s: GameState): { x: number; y: number } {
  let sx = 0, sy = 0, n = 0;
  for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating') { const h = sumHH(b); sx += b.x * h; sy += b.y * h; n += h; }
  return n > 0 ? { x: Math.round(sx / n), y: Math.round(sy / n) } : { x: W >> 1, y: H >> 1 };
}

const pol = (s: GameState, id: string, label: string, extra: { months?: number; target: { who: string; hh: number }; side: string[]; authority?: string }): Draft | null => {
  const p = POLICIES.find(o => o.id === id); if (!p) return null;
  const on = !!s.policies[id]?.on;
  return {
    id: (on ? 'stop:' : '') + id, label: on ? `${p.name}をやめる` : label, action: { type: 'policy', id, on: !on },
    monthly: on ? -policyCost(s, p) : policyCost(s, p), months: extra.months ?? p.ramp, target: extra.target,
    side: on ? ['効果がなくなります（' + p.why + '）'] : extra.side, authority: extra.authority ?? '市（政策・予算。議会の議決）',
  };
};

/** 主な駅（いちばん混む駅） */
function mainStation(s: GameState): Building | null {
  let best: Building | null = null, bc = -1;
  for (const b of s.buildings) if (b.kind === 'station' && b.status === 'operating' && b.connected) { const c = b.effCap > 0 ? b.used / b.effCap : 0; if (c > bc) { bc = c; best = b; } }
  return best;
}

function stationDrafts(s: GameState): Draft[] {
  const sb = mainStation(s); if (!sb) return [];
  const sd = sb.acc >= 0 ? distField(s, sb.acc) : null, out: (Draft | null)[] = []; // いちばん混む駅からの道路の距離
  const hh = near(sb, 27);
  if (sd) {
    const up: number[] = [], down: number[] = [];
    // 駅からの距離は道路の上でだけ測ってある：区画は、隣の道路の距離で見る（民間の着工と同じ）
    const dAt = new Int16Array(sd.length).fill(-1);
    for (let i = 0; i < sd.length; i++) {
      if (s.road[i] || s.occ[i]) continue;
      const x = i % W, y = (i / W) | 0; let best = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const v = sd[idx(nx, ny)]; if (v >= 0 && (best < 0 || v < best)) best = v; }
      dAt[i] = best;
      if (best < 0 || best > P.mansionStationRange) continue;
      if (s.zone[i] < 3) up.push(i); else if (s.zone[i] === 3) down.push(i);
    }
    up.sort((a, b) => dAt[a] - dAt[b]);
    const upOk = planZone(s, up.slice(0, 80), 3).ok;
    if (upOk.length) out.push({ id: 'upzone', label: `駅前の容積を上げる（${upOk.length} 区画を高層住宅に）`, action: { type: 'zone', tiles: upOk, zone: 3 }, monthly: 0, months: DEFS.mansion.months,
      target: { who: '駅前に入居する世帯（夫婦のみ・子育て）', hh: Math.round(Math.min(upOk.length, 24) * (DEFS.mansion.units ?? 40) * 0.3) },
      side: ['空き家が減ると家賃が上がる', '保育の需要と小学校の在籍が増える（入居の数か月後から）', '駅の朝の混雑・周りの道路の混雑が増える', '着工まで数か月、完成まで 8 か月かかる'], authority: '市（都市計画の用途地域）。建てるかは開発事業者' });
    const dnOk = planZone(s, down, 2).ok;
    if (dnOk.length) out.push({ id: 'zoneDown', label: `容積の上限を下げる（駅の近くの ${dnOk.length} 区画を中層まで）`, action: { type: 'zone', tiles: dnOk, zone: 2 }, monthly: 0, months: 1,
      target: { who: '駅の近くの住民', hh }, side: ['これから建つ住宅が小さくなり、転入と税収の伸びが鈍る', '家賃の上がり方はゆるやかになる'], authority: '市（都市計画の用途地域）' });
  }
  out.push(pol(s, 'devLevy', '開発負担金を取る（着工 1 戸 15 万円）', { months: 1, target: { who: '開発事業者・新しく入居する世帯', hh: 0 }, side: ['着工が減り（月の上限 4 棟 → 2 棟）、転入と将来の税収の伸びが鈍る', '負担金が家賃に上乗せされる（約 6%）', '入る負担金は学校・保育の整備の財源になる'], authority: '市（要綱。事業者の協力が前提）' }));
  // 保育：駅の近くに小さな保育園
  { const site = siteNear(s, 'nurseryS', sb.x, sb.y + 2, 30);
    if (site) out.push({ id: 'nursery', label: '駅の近くに保育園（小）を建てる', action: { type: 'build', kind: 'nurseryS', x: site.x, y: site.y }, monthly: (DEFS.nurseryS.upkeep ?? 0), months: DEFS.nurseryS.months,
      target: { who: '子育て（未就学）の世帯', hh: Math.round((s.stats.hhByType?.[2] ?? 0)) }, side: ['保育士の採用が追いつかないと定員まで受け入れられない', '維持費と人件費が毎月かかる'], authority: '市（建設は議会の予算）' }); }
  // 学校：いちばん混む小学校の増築
  { const sc = s.buildings.filter(b => fam(b.kind) === 'school' && b.effCap > 0).sort((a, b) => b.used / b.effCap - a.used / a.effCap)[0];
    if (sc && !upgradeBlock(s, sc)) out.push({ id: 'schoolUp', label: `いちばん混む小学校を増築する（在籍 ${Math.round(sc.used)} 人 ÷ 定員 ${Math.round(sc.effCap)} 人）`, action: { type: 'upgrade', id: sc.id }, monthly: 0, months: Math.max(2, Math.ceil(DEFS[sc.kind].months * 0.5)),
      target: { who: '子育て（就学）の世帯', hh: Math.round(s.stats.hhByType?.[3] ?? 0) }, side: [`工事中は定員が ${Math.round(DEFS[sc.kind].renewFactor * 100)}% に下がる（一時的に過密が悪化）`, '維持費が増える'], authority: '市（教育委員会・議会の予算）' });
    else if (!sc) { const site = siteNear(s, 'school', sb.x, sb.y + 4, 40); if (site) out.push({ id: 'schoolNew', label: '駅の近くに小学校を建てる', action: { type: 'build', kind: 'school', x: site.x, y: site.y }, monthly: DEFS.school.upkeep ?? 0, months: DEFS.school.months, target: { who: '子育て（就学）の世帯', hh: Math.round(s.stats.hhByType?.[3] ?? 0) }, side: ['建設費が大きい', '完成まで時間がかかる'], authority: '市（教育委員会・議会の予算）' }); }
  }
  out.push(pol(s, 'busPlus', 'バスを増便して駅前に交通広場をつくる', { target: { who: '駅を使う通勤の世帯・高齢世帯', hh }, side: ['毎月の運行補助がかかる', '電車の混雑は減らない'] }));
  // 鉄道会社に増発を要請（毎月の補助）
  { const freq = (s.pol as unknown as { rail?: { freq: number } } | undefined)?.rail?.freq ?? 0;
    if (s.pol && freq < 3) out.push({ id: 'railfreq', label: `鉄道会社に増発を要請する（${FREQS[freq + 1]}）`, action: { type: 'pol', op: 'railfreq', n: freq + 1 }, monthly: [0, 200, 500, 900][freq + 1] - [0, 200, 500, 900][freq], months: 1,
      target: { who: '電車で通勤・通学する世帯', hh }, side: ['毎月の補助がかかる', '電車が便利になると、駅の近くに住みたい人がさらに増える'], authority: '鉄道会社（市は要請と補助だけ）' }); }
  out.push(pol(s, 'rentAid', '家賃を補助する（若い世帯・子育て世帯）', { target: { who: '単身・子育て世帯', hh: Math.round((s.stats.hhByType?.[0] ?? 0) + (s.stats.hhByType?.[2] ?? 0)) }, side: ['毎月の費用が大きい（人口に比例）', '家賃そのものは下がらない（補助をやめると負担が戻る）'] }));
  return out.filter((d): d is Draft => !!d);
}

const INFRA_FAMS = ['water', 'sewage', 'waste'];
function agingDrafts(s: GameState): Draft[] {
  const out: (Draft | null)[] = [];
  const old = s.buildings.filter(b => isCity(b.kind) && DEFS[b.kind].renewCost > 0 && (b.status === 'operating' || b.status === 'suspended'))
    .sort((a, b) => (INFRA_FAMS.includes(fam(b.kind)) ? 10 : 0) + b.age - ((INFRA_FAMS.includes(fam(a.kind)) ? 10 : 0) + a.age));
  const b = old[0];
  if (b) {
    const d = DEFS[b.kind], rc = renewCostOf(b), who = { who: `${d.name}を使う世帯`, hh: totalHH(s) };
    out.push({ id: 'renew', label: `${d.name}を更新する（建て替え。老朽度 ${Math.round(b.age)}）`, action: { type: 'renew', id: b.id }, cost: rc, monthly: 0, months: d.renewMonths, target: who,
      side: [`工期 ${d.renewMonths} か月は能力が ${Math.round(d.renewFactor * 100)}% に下がる`, `資金 ${rc.toLocaleString()} 万円が要る${rc > d.renewCost ? `（先送りで ${Math.round((rc / d.renewCost - 1) * 100)}% 割増し）` : ''}`], authority: '市（議会の予算）' });
    out.push({ id: 'borrow', label: `市債で更新費を用意する（${(Math.ceil(rc / 1000) * 1000).toLocaleString()} 万円）`, action: { type: 'borrow', amount: Math.ceil(rc / 1000) * 1000 }, cost: 0, monthly: Math.round(Math.ceil(rc / 1000) * 1000 / P.bondMonths), months: 0, target: who,
      side: [`${P.bondMonths / 12} 年かけて返し、利子がかかる`, '市債の残高が増え、将来の予算が縛られる'], authority: '市（議会の議決）' });
    // 統廃合・縮小：同じ種類の施設で、この施設を休止しても需要をまかなえるとき
    const same = s.buildings.filter(o => o !== b && fam(o.kind) === fam(b.kind) && o.status === 'operating');
    const cap = same.reduce((a, o) => a + o.effCap, 0), need = fam(b.kind) === 'water' ? s.stats.waterDemand : fam(b.kind) === 'waste' ? s.stats.wasteDemand : fam(b.kind) === 'sewage' ? s.stats.sewageDemand : b.used;
    if (b.status === 'operating' && same.length && cap >= need * 1.02) out.push({ id: 'consolidate', label: `${d.name}を休止して統合する（縮小）`, action: { type: 'suspend', id: b.id }, cost: 0, monthly: -Math.round((d.upkeep ?? 0) * 0.7), months: 0,
      target: { who: `${d.name}の近くの世帯`, hh: near(b, 30) }, side: ['残る施設の余力が減り、災害や故障に弱くなる', '近くの住民の反発（遠くなる）'], authority: '市（議会の議決）' });
  }
  out.push(pol(s, 'longLife', '維持する（長寿命化：点検と予防の補修）', { target: { who: '全市', hh: totalHH(s) }, side: ['毎月の補修費がかかる', '老朽化は止まらない（遅くなるだけ）'] }));
  out.push(pol(s, 'deferRenew', '先送りする（維持費を繰り延べる）', { target: { who: '全市', hh: totalHH(s) }, side: ['傷みが 2 割速く進む', '老朽度 80 を超えると更新費が割増し（100 で 1.6 倍）', '水道管の破裂などの事故が起きやすい', '災害のときの被害が大きくなる'] }));
  out.push(pol(s, 'waterRate', '水道料金を改定する（2 割の値上げ）', { months: 1, target: { who: '全世帯', hh: totalHH(s) }, side: ['家計の負担が増え、単身・高齢の世帯の満足が下がる', '支持率に響く'] }));
  { const tiles: number[] = []; for (let i = 0; i < s.road.length; i++) if ((s.road[i] === 1 || s.road[i] === 2) && s.roadAge[i] >= 70) tiles.push(i);
    const pl = tiles.length ? planRepair(s, tiles.slice(0, 200)) : null;
    if (pl && pl.ok.length) out.push({ id: 'roadRepair', label: `古い市道 ${pl.ok.length} 区画を補修する`, action: { type: 'repair', tiles: pl.ok }, cost: pl.cost, monthly: 0, months: 0, target: { who: '全市', hh: totalHH(s) }, side: ['資金が要る', '工事の間は通りにくい'], authority: '市（道路管理者）' }); }
  return out.filter((d): d is Draft => !!d);
}

function industryDrafts(s: GameState): Draft[] {
  const out: (Draft | null)[] = [], c = hhCenter(s);
  for (const [kind, label, who] of [['mall', 'ショッピングモールを誘致する', '買物をする世帯（車のある世帯ほど）'], ['factory', '工場を誘致する', '働き手の世帯']] as [Kind, string, string][]) {
    if (s.buildings.some(b => b.kind === kind && b.status === 'construction')) continue;
    const site = siteNear(s, kind, c.x, c.y, 45, 1200);
    if (site) out.push({ id: kind, label, action: { type: 'build', kind, x: site.x, y: site.y }, monthly: 0, months: DEFS[kind].months,
      target: { who, hh: totalHH(s) },
      side: kind === 'mall' ? ['近くの小さな店の売上が下がり、閉店が増える', '休日・朝の道路が混む', '雇用と税収・来訪者が増え、近くの住民の買物は便利になる'] : ['周りの空気が悪くなり、近くの世帯の満足が下がる', 'トラックで道路が混む', '雇用と事業の税収が増える'],
      authority: '企業（市は用地と条件を用意する。来るかは企業しだい）' });
  }
  out.push(pol(s, 'nightEcon', '観光を進める（夜の観光・来訪者の誘致）', { target: { who: '店・宿・飲食の事業者', hh: 0 }, side: ['夜の治安が少し悪くなる', '毎月の費用がかかる'] }));
  out.push(pol(s, 'shotengai', '商店街を支援する（共同店舗・空き店舗の活用）', { target: { who: '商店主・近くの高齢世帯', hh: Math.round(s.stats.hhByType?.[4] ?? 0) }, side: ['毎月の費用がかかる', '大型店との競争そのものは無くならない'] }));
  out.push(pol(s, 'bufferZone', '立地に条件をつける（幹線沿い・緩衝緑地）', { target: { who: '工場・大型店の近くの世帯', hh: s.stats.nimbyHH ?? 0 }, side: ['企業の投資が少し鈍る（景気の係数）', '効果が出そろうまで 1 年'] }));
  out.push(pol(s, 'logiRoute', '搬入路と駐車場を整える（交通対策）', { target: { who: '通勤の世帯', hh: totalHH(s) }, side: ['毎月の費用がかかる'] }));
  out.push(pol(s, 'localHire', '地元雇用の協定を結ぶ', { target: { who: '単身・夫婦のみの世帯', hh: Math.round((s.stats.hhByType?.[0] ?? 0) + (s.stats.hhByType?.[1] ?? 0)) }, side: ['企業の負担が増え、景気の係数が少し下がる'], authority: '市と企業（協定）' }));
  out.push(pol(s, 'kogaiTaisaku', '環境対策をする（騒音・大気の監視と指導）', { target: { who: '工場の近くの世帯', hh: s.stats.nimbyHH ?? 0 }, side: ['毎月の費用がかかる'] }));
  return out.filter((d): d is Draft => !!d);
}

/** 1 本の試算：複製に（あれば）操作をして、forecast と同じく months か月回した後の指標 */
function trial(s: GameState, factor: number, months: number, action?: Action): { ind: Record<IndicatorId, number>; ok: boolean; msg: string; cost: number } {
  const c: GameState = structuredClone(s);
  c.inflowFactor *= factor;
  let ok = true, msg = '', cost = 0;
  if (action) { const r = dispatch(c, action); ok = r.ok; msg = r.msg; cost = r.cost ?? 0; }
  if (ok) for (let k = 0; k < months; k++) { c.rng = commonRng(s.rng, k + 1); stepMonth(c, { forecast: true }); } // 何もしない場合と同じ乱数の列（report.ts の試算と同じ）
  return { ind: loopIndicators(c), ok, msg, cost };
}
const FACTORS = [1.2, 0.8]; // 楽観・慎重（forecast の SCENARIOS と同じ）

/** 対策 1 件の期待効果（何もしない場合との差の幅）。base は同じ月数で回した何もしない複製の指標（楽観・慎重の順） */
export function expectOf(s: GameState, id: LoopId, action: Action, months = 12, base?: Record<IndicatorId, number>[]): { indicator: IndicatorId; lo: number; hi: number }[] {
  const ids = LOOPS.find(l => l.id === id)!.indicators;
  const b = base ?? FACTORS.map(f => trial(s, f, months).ind);
  const with_ = FACTORS.map(f => trial(s, f, months, action).ind);
  return ids.map(k => { const d = FACTORS.map((_, j) => with_[j][k] - b[j][k]); return { indicator: k, lo: r1(Math.min(...d)), hi: r1(Math.max(...d)) }; });
}

/** そのループでいま選べる対策（費用・時間差・対象・期待効果の幅・副作用・権限） */
export function loopOptions(s: GameState, id: LoopId, opts: LoopOptionsOpts = {}): LoopOption[] {
  curS = s;
  const drafts = id === 'station' ? stationDrafts(s) : id === 'aging' ? agingDrafts(s) : industryDrafts(s);
  curS = null;
  const months = opts.months ?? 12, doExpect = opts.expect ?? true;
  const base = doExpect ? FACTORS.map(f => trial(s, f, months).ind) : undefined;
  return drafts.map(d => {
    const probe = trial(s, 1, 0, d.action);
    const o: LoopOption = { ...d, cost: d.cost ?? probe.cost, expect: [], ok: probe.ok, ...(probe.ok ? {} : { why: probe.msg }) };
    if (doExpect && probe.ok) o.expect = expectOf(s, id, d.action, months, base);
    return o;
  });
}

/** v91：対策ごとに、どの指標をどちら向きに動かすか（+1 良くする・−1 悪くする。0.3 以下は弱い）。課題の候補の並べ替えと絞り込みに使う。
 *  値は各ループの対策の副作用の説明（side）と、v90 の 12 か月の試算（変更記録）の向きから。trade は「課題は良くならないが、財源・先送りとして比べる選択肢」 */
export const OPTION_EFFECT: Record<string, Partial<Record<IndicatorId, number>> & { trade?: boolean }> = {
  upzone: { inflowHH: 1, taxRevenue: 1, rentBurden: -0.5, careWait: -1, schoolCrowd: -1, stationCrowd: -1, roadVc: -1, traffic: -0.5 },
  zoneDown: { inflowHH: -1, taxRevenue: -0.5, rentBurden: 0.3, careWait: 0.3, schoolCrowd: 0.3, stationCrowd: 0.3, roadVc: 0.3 },
  devLevy: { levy: 1, inflowHH: -1, rentBurden: -0.5, careWait: 0.3, schoolCrowd: 0.5, stationCrowd: 0.3, roadVc: 0.3 },
  nursery: { careWait: 1, satFamYoung: 1 },
  schoolUp: { schoolCrowd: 1, satFamSchool: 0.5 }, schoolNew: { schoolCrowd: 1, satFamSchool: 0.5 },
  busPlus: { roadVc: 0.5, traffic: 0.5, stationCrowd: 0.1 },
  railfreq: { stationCrowd: 1, inflowHH: 0.3, roadVc: 0.2 },
  rentAid: { rentBurden: 1, inflowHH: 0.5, satSingle: 0.5, satFamYoung: 0.5 },
  renew: { lifeline: 1, renewal60: 1, disasterLoss: 1 },
  borrow: { debt: -1, trade: true },
  consolidate: { lifeline: -1, disasterLoss: -0.5, trade: true },
  longLife: { lifeline: 0.5, renewal60: 0.5, disasterLoss: 0.3 },
  deferRenew: { lifeline: -0.5, renewal60: -1, disasterLoss: -0.5, trade: true },
  waterRate: { waterBill: -1, satSingle: -0.3, satSenior: -0.3, trade: true },
  roadRepair: { roadVc: 0.1, traffic: 0.1, disasterLoss: 0.3 },
  mall: { jobs: 1, bizTax: 1, shopSales: -1, shopClosed: -1, traffic: -0.5, roadVc: -0.5 },
  factory: { jobs: 1, bizTax: 1, envSat: -1, traffic: -0.5, roadVc: -0.3 },
  nightEcon: { shopSales: 0.5, bizTax: 0.5, jobs: 0.3 },
  shotengai: { shopSales: 1, shopClosed: 1, satSenior: 0.3 },
  bufferZone: { envSat: 1, jobs: -0.2 },
  logiRoute: { traffic: 1, roadVc: 0.5 },
  localHire: { jobs: 0.5, satSingle: 0.3, satCouple: 0.3 },
  kogaiTaisaku: { envSat: 1 },
};
/** v91：課題の主な指標（ループの指標の名前で）。対策の候補をこの指標に効く順に並べる */
export function mainIndicatorOf(key: string): IndicatorId | undefined {
  const M: Record<string, IndicatorId> = { care: 'careWait', 'sat:2': 'careWait', traffic: 'roadVc', 'sat:1': 'roadVc', stationCrowd: 'stationCrowd', housing: 'inflowHH', 'sat:0': 'rentBurden', 'sat:13': 'rentBurden',
    school: 'schoolCrowd', 'cap:school': 'schoolCrowd', 'sat:3': 'schoolCrowd', aging: 'lifeline', 'cap:water': 'lifeline', 'cap:waste': 'lifeline', 'cap:sewage': 'lifeline', 'sat:7': 'lifeline',
    shops: 'shopSales', 'sat:5': 'shopSales', nimby: 'envSat', 'sat:11': 'envSat', 'sat:8': 'jobs' };
  return M[key];
}
/** 対策（ループの対策の id、または政策の id）が課題の主な指標に効く向きと強さ。表にないものは 0（効果は小さい） */
export function optionFit(optId: string, main: IndicatorId): { v: number; trade: boolean } {
  const e = OPTION_EFFECT[optId.replace(/^stop:/, '')]; if (!e) return { v: 0, trade: false };
  const v = (e[main] ?? 0) * (optId.startsWith('stop:') ? -1 : 1);
  return { v, trade: !!e.trade };
}

/** 課題（issues）の鍵から、どのループの入口か */
export function loopOfIssue(key: string): LoopId | undefined {
  if (key.startsWith('loop:')) { const id = key.slice(5); return id === 'station' || id === 'aging' || id === 'industry' ? id : undefined; } // v91：街の 3 つの論点
  // 満足の要因の鍵は 'sat:' + SAT_PARTS の番号（0 住宅負担・1 通勤・2 保育・3 学校・5 買物・7 ライフライン・8 雇用・11 環境）
  if (['care', 'traffic', 'housing', 'school', 'stationCrowd', 'cap:school', 'sat:0', 'sat:1', 'sat:2', 'sat:3'].includes(key)) return 'station';
  if (['aging', 'cap:water', 'cap:waste', 'cap:sewage', 'sat:7'].includes(key)) return 'aging';
  if (['shops', 'nimby', 'sat:5', 'sat:8', 'sat:11'].includes(key)) return 'industry';
  return undefined;
}
/** ループの入口になる、既存の課題にない状態（学校の過密・駅の混雑・閉店の続出）。issues の add に渡す材料 */
export function loopIssueSeeds(s: GameState): { key: string; title: string; what: string; cause: string; tile: number; people: number; trend: number }[] {
  const out: ReturnType<typeof loopIssueSeeds> = [], ind = loopIndicators(s), m = getMap(s.seed);
  void m;
  if (ind.schoolCrowd > 105) { const sc = s.buildings.filter(b => fam(b.kind) === 'school' && b.effCap > 0).sort((a, b) => b.used / b.effCap - a.used / a.effCap)[0];
    out.push({ key: 'school', title: `小学校が過密です（在籍が定員の ${ind.schoolCrowd}%）`, what: '教室が足りず、学校の満足が下がっています。駅前や新しい住宅地に子育て世帯が入ると、数か月〜数年後に効いてきます', cause: '入居した世帯の子どもが学齢になり、在籍が増えた', tile: sc ? idx(sc.x, sc.y) : -1, people: Math.min(1, (s.stats.hhByType?.[3] ?? 0) / Math.max(1, s.stats.households)), trend: 0.4 }); }
  if (ind.stationCrowd > 150) { const sb = mainStation(s);
    out.push({ key: 'stationCrowd', title: `駅の朝の混雑率が ${ind.stationCrowd}% です`, what: '電車に乗りきれず、通勤の満足が下がっています。駅の近くに住宅が増えるほど混みます', cause: '駅の近くの住宅と職場が増え、朝の乗客が電車の能力を超えている', tile: sb ? idx(sb.x, sb.y) : -1, people: 0.3, trend: 0.3 }); }
  if (ind.shopClosed >= 2) out.push({ key: 'shops', title: `この 1 年で店が ${ind.shopClosed} 軒閉じました`, what: '近くの店がなくなると、車のない高齢世帯の買物が不便になります', cause: '大型店・市外の店や通販に客を取られ、赤字が続いた', tile: -1, people: 0.15 + 0.05 * ind.shopClosed, trend: 0.3 });
  return out;
}
