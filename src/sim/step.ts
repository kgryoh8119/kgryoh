// 月次処理。1 回の呼び出しで 1 か月進む。描画やフレームレートには依存しない。
import { onMapChange, REAL } from './real';
import { W, H, P, DEFS, POLICIES, policyCost, AIR_ROUTES, GOALS, VISIONS, isRes, isShop, isCity, isBiz, RES_TYPE, LV_UPKEEP, LV_CAP, lvK, lvOf, stageName, diffOf, hasOp, countOp, SPORTS, SCALE } from './config';
import { getMap, idx, buildable, syncTerrain, terrainOf, isCastaway } from './map';
import { isleCost, ISLE_STEPS, isleK, isleGrant } from './isle';
import { mayorMonthly } from './mayor';
import { challengeMonthly } from './challenge';
import { intlMonthly } from './intl';
import { execCost, routeDeficit, landK, execOf } from './admin';
import { polOf, politicsMonthly, demoAdd, campaignParts, setGoalKept } from './politics';
import { optIncome, optUpkeep } from './options';
import { repairState, voiceList, refreshVoices, recompute, modMul, modAdd, sumHH, staffReq, accessTile, distField, roadInfo, designCap, stationDist, shinOpen } from './core';
import { rngNext } from './rng';
import { applyEffect, tickEvents, addBuilding, removeBuilding } from './events';
import type { GameState, Building, Ledger, ElectionResult, Kind, Sport, Team } from './types';
import { NHH } from './types';
import { logOf, logView, recordClose, chargeLevy, pipelineUnits } from './loopHooks';
import { updateMacro, sectorK, rateAdd, macroOf, sectorOf } from './macro';
import { updateThreats } from './threats';
import { updateRailDev } from './raildev';
import { updateEconomy, updateFiscal, econFactor, bizFx, chainFactor, fxDev, furusatoCalc } from './economy';

let N = 0;
onMapChange(() => { N = W * H; });
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

export function emptyLedger(month: number, cashStart = 0): Ledger {
  return { month, cashStart, taxResident: 0, taxProperty: 0, taxBusiness: 0, transfer: 0, fees: 0, taxStay: 0, admin: 0, upkeep: 0, wages: 0, subsidy: 0, roads: 0, policy: 0, interest: 0, capital: 0, repay: 0, borrowed: 0, other: 0, operating: 0, cashEnd: 0 };
}

/** 施設の月額維持費（稼働状態と老朽度で変わる） */
export function upkeepOf(b: Building): number {
  const d = DEFS[b.kind];
  if (!isCity(b.kind) || b.status === 'construction') return 0;
  const f = b.status === 'operating' ? 1 : b.status === 'renewing' ? 0.6 : 0.3;
  return d.upkeep * f * (b.age > 60 ? 1 + (b.age - 60) / 80 : 1) * LV_UPKEEP[lvOf(b) - 1] + optUpkeep(b);
}

/** 経済の大きな動き（利上げ・利下げ・海外の戦争・日経平均の節目）を知らせる */
function macroNotes(s: GameState, run: () => void): void {
  const M0 = { ...macroOf(s) }; run(); const M = macroOf(s);
  if (M.rate !== M0.rate) s.notes.push(`📈 日銀が政策金利を ${M0.rate.toFixed(2)}% から ${M.rate.toFixed(2)}% に${M.rate > M0.rate ? '引き上げました（物価高をおさえるため。市債と住宅ローンの利息が重くなります）' : '引き下げました（景気を支えるため。借りやすくなります）'}`);
  if (M.warLeft > 0 && M0.warLeft === 0) s.notes.push('🌍 海外で戦争が始まりました。原油と資材が値上がりし、物価が上がります。防衛と商社は伸び、自動車・食品・電力は苦しくなります');
  if (M.warLeft === 0 && M0.warLeft > 0) s.notes.push('🕊 海外の戦争が停戦しました。原油の値段が少しずつ落ち着きます');
  const lv = (v: number) => Math.floor(v / 5000); if (lv(M.nikkei) !== lv(M0.nikkei) && M0.nikkei > 0) s.notes.push(`💹 日経平均が ${(lv(M.nikkei) * 5000).toLocaleString()} 円を${M.nikkei > M0.nikkei ? '上回りました' : '割り込みました'}（${M.nikkei.toLocaleString()} 円）`);
}
/** v86：移転収入の内訳（難易度・できごとの倍率を掛ける前）。L は税を集計済みの台帳（ふるさと納税で住民税を減らす前）。
 *  標準的な税収 = 税率を標準（100%）に戻した税収。超過課税・減税の分は交付税の計算に入れない（実際の制度と同じ）ので、増税した分は市の手元に残る */
export function transferParts(s: GameState, L: Pick<Ledger, 'taxResident' | 'taxProperty' | 'taxBusiness'>): { need: number; stdTax: number; kofu: number; grants: number } {
  const tax = s.tax ?? { res: 1, prop: 1, biz: 1, stay: 0 }, pop = s.stats.pop;
  const stdTax = L.taxResident / Math.max(0.5, tax.res) + L.taxProperty / Math.max(0.5, tax.prop) + L.taxBusiness / Math.max(0.5, tax.biz);
  const need = P.transferBase * isleK(s) + P.needPerCapita * pop + P.needPerElder * elderPersons(s);
  return { need, stdTax, kofu: Math.max(0, need - P.kofuOffset * stdTax), grants: P.transferPerCapita * pop + isleGrant(s) };
}
/** 高齢世帯の人数（高齢化の負担の計算に使う） */
export const elderPersons = (s: GameState) => (s.stats.hhByType?.[4] ?? 0) * P.persons[4];
function transferOf(s: GameState, L: Ledger): number { const t = transferParts(s, L); return t.kofu + t.grants; }
/** 今の状態が 1 か月続いたときの毎月の収支の内訳（表示・予測・月次処理で共用） */
export function monthlyBudget(s: GameState): Ledger {
  const L = emptyLedger(s.month);
  const tax = s.tax ?? { res: 1, prop: 1, biz: 1, stay: 0 }, econ = (hasOp(s, 'megaBank') ? 1.02 : 1) * (hasOp(s, 'maglevStation') ? 1.05 : 1) * (hasOp(s, 'autoHub') ? 1.015 : 1) * (hasOp(s, 'department') ? 1.01 : 1) * (hasOp(s, 'stockExch') ? 1.025 : 1) * (hasOp(s, 'tradingCo') ? 1.008 : 1) * modMul(s, 'econ') * teamEcon(s) * (shinOpen(s) ? 1.04 : 1) * econFactor(s); // 新幹線の駅は出張・観光で景気を押し上げる
  let hotel = false;
  L.fees = (L.fees ?? 0) + modAdd(s, 'teamIncome'); // 優勝の経済効果（グッズ・放映・ふるさと納税）
  // 改修オプションの使用料・売上と維持費（市の施設の維持費は upkeepOf に含む）
  for (const b of s.buildings) if (b.opts && b.status === 'operating') { if (b.connected) L.fees! += optIncome(b); if (!isCity(b.kind)) L.upkeep += optUpkeep(b); }
  for (const b of s.buildings) {
    const d = DEFS[b.kind];
    if (isRes(b.kind) && b.status === 'operating') {
      for (let t = 0; t < NHH; t++) L.taxResident += b.hh![t] * P.income[t] * P.residentTaxRate * tax.res * econ;
      L.taxProperty += b.units! * P.propertyTaxPerUnit * tax.prop * landK(s, b);
    } else if (isShop(b.kind) && b.status === 'operating') {
      L.taxBusiness += b.revenue * P.businessTaxRate * tax.biz * econ;
    } else if (isCity(b.kind)) {
      L.upkeep += upkeepOf(b);
      if (b.status === 'operating' || b.status === 'renewing') L.wages += (b.staff ?? 0) * d.wage;
      if (b.status === 'operating' && b.connected && d.bizTax) L.taxBusiness += d.bizTax * tax.biz * econ * LV_CAP[lvOf(b) - 1]; // 市が造成した工業団地に入った企業の税
      if (b.status === 'operating' && b.connected && d.income) L.fees! += d.income * (b.effCap > 0 && d.capacity > 1 ? Math.min(1, b.effCap / Math.max(1, d.capacity)) : lvK(b));
    } else if (b.kind === 'privNursery') {
      L.subsidy += b.used * P.privNurserySubsidy;
    } else if (b.status === 'operating' && b.connected && d.bizTax) {
      L.taxBusiness += d.bizTax * tax.biz * (1 + 0.3 * (tax.prop - 1)) * econ * (d.fam === 'agri' ? s.climate?.crop ?? 1 : 1) * bizFx(s, b.kind) * chainFactor(s, b.kind) * sectorK(s, b.kind) * (sectorOf(b.kind) === 'it' && s.stats.telDemand ? 0.75 + 0.25 * Math.min(1, (s.stats.telCap ?? 1e9) / s.stats.telDemand) : 1) * (b.kind === 'smallFactory' ? modMul(s, 'smallFactory') : 1) * lvK(b); // 業種の調子も。農業は作柄しだい。輸出の工場は為替、材料の工場は市内のつながりしだい
      if (b.kind === 'hotel') hotel = true;
    }
  }
  if (tax.stay && hotel) L.taxStay! += s.stats.visitors * P.stayShare * P.stayTax;
  L.transfer = transferOf(s, L) * modMul(s, 'transfer') * diffOf(s).transfer * ((s.stats.yudoShare ?? 0) >= 0.6 ? 1.03 : 1); // 立地適正化計画で居住誘導区域に 6 割が住むと、国の補助（コンパクトシティ）
  L.admin = (P.adminBase * isleK(s) + s.stats.pop * P.adminPerCapita + elderPersons(s) * P.elderCost) * modMul(s, 'prices') * (hasOp(s, 'cityHall') ? 0.93 : 1) * (hasOp(s, 'cityOS') ? 0.9 : 1) * (1 - 0.01 * Math.min(4, countOp(s, 'branchOffice')));
  // 市内の斎場で受け入れられない火葬は、隣の市に頼む（1 件 8 万円の上乗せ）
  L.admin += Math.max(0, (s.stats?.deaths ?? 0) - (s.stats?.cremCap ?? 0)) * P.cremOut;
  L.admin += isleCost(s); // v88：無人島で採れない食べ物の船便の運賃
  // 道の駅：市内の農地が多いほど売上が伸び、市の収入が増える
  if (hasOp(s, 'michinoeki')) L.fees! += 15 * Math.min(16, countOp(s, 'farm') + countOp(s, 'paddy') + countOp(s, 'field') + ['dairy', 'orchard', 'teaField', 'greenhouse', 'flowerFarm', 'wasabi', 'apiary', 'shiitake', 'poultry', 'beefRanch'].reduce((a, k) => a + countOp(s, k as Kind), 0)) * countOp(s, 'michinoeki') * (s.climate?.crop ?? 1); // 作柄が悪いと売上も減る
  for (let i = 0; i < N; i++) if (s.road[i]) L.roads += P.roadUpkeep[s.road[i]];
  if (s.rail && s.railCity) for (const i of s.railCity) L.roads += (P.railUpkeep[s.rail[i]] ?? 0) * [1, 1.5, 2, 1.3][s.railGrade?.[i] ?? 0]; // 市が敷いた線路の負担金
  if (s.climate?.snow) L.roads *= 1.35; // 大雪の月は除雪費
  L.upkeep *= modMul(s, 'prices') * (1 + 0.15 * fxDev(s)); // 円安だと燃料・資材が値上がり
  // 不況のときは生活保護・就労支援がふえる
  const cyc = s.econ?.cycle ?? 0; if (cyc < 0) L.admin += -cyc * s.stats.pop * 0.004;
  // ふるさと納税：寄付から返礼品と経費を引いた分が入り、市民がよその市へ寄付した分だけ住民税が減る
  const fz = furusatoCalc(s, L.taxResident); L.fees! += fz.gift - fz.cost; L.taxResident -= fz.loss;
  // 路線バスの赤字補助（バス停の数に比例。自動運転バスの車庫があると半分）と、航空路線の誘致の補助
  const nStop = s.busStops?.length ?? 0; if (nStop) L.policy += nStop * P.busStopSubsidy * (hasOp(s, 'autoBusDepot') ? 0.5 : 1);
  for (const r of s.airRoutes ?? []) { const d = AIR_ROUTES.find(o => o.id === r.id); if (d) L.policy += d.subsidy; }
  for (const p of POLICIES) if (s.policies[p.id]?.on) L.policy += policyCost(s, p); // v86：人口に比例
  for (const t of s.teams ?? []) { L.policy += SPORTS[t.sport].support; L.taxBusiness += SPORTS[t.sport].bizTax * tax.biz * econ; } // チームへの支援と、球団・クラブの会社からの税
  for (const m of s.modifiers) L.policy += m.cost;
  L.policy += execCost(s); { const d = routeDeficit(s); if (d > 0) L.policy += d; else L.fees! += -d; } // 幹部の給与と、バス路線の赤字（黒字なら収入）
  for (const l of s.loans) L.interest += l.remaining * l.rate / 12;
  L.operating = L.taxResident + L.taxProperty + L.taxBusiness + L.transfer + L.fees! + L.taxStay! - (L.admin + L.upkeep + L.wages + L.subsidy + L.roads + L.policy + L.interest);
  return L;
}

/** 任期の目標（公約）の進み具合：0〜1 と達成か */
export function goalProgress(s: GameState, g: { id: string; base: number; target: number }): { p: number; ok: boolean; v: number } {
  const def = GOALS.find(o => o.id === g.id);
  if (!def) return { p: 0, ok: false, v: 0 };
  const v = def.value(s), lower = !!def.lower;
  const ok = lower ? v <= g.target : (g.id === 'fiscal' ? v >= 0 && fiscalWatch(s).months > 0 : v >= g.target);
  let p: number;
  if (ok) p = 1;
  else if (g.id === 'fiscal') p = v >= -50 ? 0.7 : 0.3;
  else { const span = lower ? g.base - g.target : g.target - g.base; p = span > 1e-9 ? clamp((lower ? g.base - v : v - g.base) / span) : 0; }
  return { p, ok, v };
}
setGoalKept((st, id) => { const g = (st.goals ?? []).find(o => o.id === id); return g ? goalProgress(st, g).ok : false; });
/** 公約の達成状況（互換のため。目標ごとの達成か） */
/** 財政の公約の観測：直近 12 か月のうち記録のある月数・その平均収支・一時借入の残高。記録が 0 か月なら評価待ち（達成にも未達にもしない表示用） */
export function fiscalWatch(s: GameState): { months: number; avg: number; temp: number; waiting: boolean } {
  const L = s.ledger.slice(-12), temp = s.loans.filter(l => l.kind === 'temp').reduce((a, l) => a + l.remaining, 0);
  return { months: L.length, avg: L.length ? L.reduce((a, l) => a + l.operating, 0) / L.length : 0, temp, waiting: L.length === 0 };
}
/** 当選の線（得票率 %）。これ以上で当選。説明・判定・確率はすべてこの値を使う */
export const WIN_VOTE = 50;
/** 得票率の表示（小数 1 桁）。丸めで当選の線をまたがないようにする（49.96 を「50.0」と書かない、50.0 以上を「49.9」と書かない） */
export function voteText(v: number): string { const r = Math.round(v * 10) / 10; return (v < WIN_VOTE && r >= WIN_VOTE ? WIN_VOTE - 0.1 : v >= WIN_VOTE && r < WIN_VOTE ? WIN_VOTE : r).toFixed(1); }
export function pledgeStatus(s: GameState): boolean[] { return (s.goals ?? []).map(g => goalProgress(s, g).ok); }
/** ビジョンの進み具合（その目標群の達成度の平均） */
export function visionProgress(s: GameState): number {
  const v = VISIONS.find(o => o.id === s.vision); if (!v) return 0;
  let sum = 0;
  for (const id of v.goals) { const def = GOALS.find(o => o.id === id)!; const g = { id, base: def.value(s), target: def.target(s) }; const cur = (s.goals ?? []).find(o => o.id === id); sum += goalProgress(s, cur ?? { ...g, base: g.base }).ok ? 1 : cur ? goalProgress(s, cur).p * 0.8 : 0.4; }
  return sum / v.goals.length;
}

/** 選挙の見込み：得票率の見込みとばらつき、内訳 */
export function electionOutlook(s: GameState, rerun = false): { vote: number; sd: number; parts: { label: string; v: number }[]; win: number } {
  const st = s.stats;
  let num = 0, den = 0;
  for (let t = 0; t < NHH; t++) { num += st.hhByType[t] * P.turnout[t] * st.satType[t]; den += st.hhByType[t] * P.turnout[t]; }
  const support = den > 0 ? num / den : 0;
  const goals = rerun ? [] : s.goals ?? []; // 返り咲きの選挙は公約なしで戦う
  let gv = 0; for (const g of goals) { const pr = goalProgress(s, g), w = 1.2 + 0.8 * g.diff; gv += pr.ok ? w : -w * 0.6 * (1 - pr.p); }
  const last = s.ledger.slice(-12);
  const op = last.length ? last.reduce((a, l) => a + l.operating, 0) / last.length : 0;
  const td = tempDebt(s);
  const appr = s.approval ?? 0.5;
  const parts = [
    { label: `暮らしの満足（投票率で重みづけ ${Math.round(support * 100)}%）`, v: 100 * (support - P.voteCenter) * (support < P.voteCenter ? diffOf(s).satDown : 1) }, // v91：基準より低いときの下げ幅は難易度で変える（むずかしいは v90 と同じ）
    { label: `公約 ${goals.filter(g => goalProgress(s, g).ok).length}/${goals.length} 達成（難しい公約ほど重い）`, v: gv },
    { label: `支持率 ${Math.round(appr * 100)}%`, v: 18 * (appr - 0.5) },
    { label: op >= 0 ? '毎月の収支が黒字' : '毎月の収支が赤字', v: op >= 0 ? 1.5 : -Math.min(4, 1 + -op / 150) },
    { label: td > 0 ? `一時借入の残高 ${Math.round(td).toLocaleString()} 万円` : '一時借入なし', v: td > 0 ? -Math.min(10, 3 + td / 4000) : 0 },
  ];
  const df = diffOf(s);
  parts.push({ label: `難易度「${df.name}」`, v: df.vote });
  parts.push({ label: s.term > 1 ? `対立候補（${s.term} 期目は「多選」への批判も）` : '対立候補の地力', v: -(2.5 + 0.7 * (s.term - 1)) });
  parts.push(...campaignParts(s));
  if (s.vision) parts.push({ label: `ビジョン「${VISIONS.find(v => v.id === s.vision)?.name ?? ''}」の進み具合 ${Math.round(visionProgress(s) * 100)}%`, v: 4 * (visionProgress(s) - 0.4) });
  if (rerun) parts.push({ label: '返り咲きへの期待（落選後に街を立て直した）', v: RERUN.bonus });
  const vote = WIN_VOTE + parts.reduce((a, p) => a + p.v, 0);
  const sd = (3.2 + 1.5 * Math.abs((s.term % 3) - 1) * 0.3) * df.luck;
  return { vote, sd, parts, win: winChance(vote, sd) };
}
/** 当日の風向き：3 つの一様乱数（0〜1）の和 S から (S − 1.5) × 2 × sd。標準偏差は sd、幅は ±3sd */
function luckOf(u1: number, u2: number, u3: number, sd: number): number { return (u1 + u2 + u3 - 1.5) * 2 * sd; }
/** 当選する確率。本番の抽選（runElection）と同じ式から厳密に出す：得票の見込み + 風向き が当選の線以上になる確率。
 *  前は正規分布で近似していて（返り咲きの画面はさらに別の式）、本番の抽選と数 % ずれていた。sd が 0（風向きなし）なら 0 か 1 */
export function winChance(vote: number, sd: number): number {
  if (!(sd > 1e-9)) return vote >= WIN_VOTE ? 1 : 0;
  const x = 1.5 + (WIN_VOTE - vote) / (2 * sd); // 風向きの和 S がこれ以上なら当選
  // 3 つの一様乱数の和の分布（アーウィン・ホール分布）の累積
  const F = x <= 0 ? 0 : x >= 3 ? 1 : x < 1 ? x * x * x / 6 : x < 2 ? (-2 * x * x * x + 9 * x * x - 9 * x + 3) / 6 : 1 - (3 - x) ** 3 / 6;
  return Math.max(0, Math.min(1, 1 - F));
}

export function runElection(s: GameState, rerun = false): ElectionResult {
  const o = electionOutlook(s, rerun);
  const luck = luckOf(rngNext(s), rngNext(s), rngNext(s), o.sd); // 当日の風向き（3 つの一様乱数の和で山形の分布）
  const parts = [...o.parts, { label: '当日の風向き・対立候補（乱数）', v: luck }];
  const vote = clamp(o.vote + luck, 18, 82);
  let num = 0, den = 0; const st = s.stats;
  for (let t = 0; t < NHH; t++) { num += st.hhByType[t] * P.turnout[t] * st.satType[t]; den += st.hhByType[t] * P.turnout[t]; }
  return { month: s.month, term: s.term, vote, win: o.vote + luck >= WIN_VOTE, support: den > 0 ? num / den : 0, pledgesKept: pledgeStatus(s), parts, typeSupport: [...st.satType] };
}

/** 一時借入の残高 */
export function tempDebt(s: GameState): number { return s.loans.filter(l => l.kind === 'temp').reduce((a, l) => a + l.remaining, 0); }
/** 財政危機：一時借入が上限を超えている */
export function fiscalCrisis(s: GameState): boolean { return tempDebt(s) > P.tempLimit * diffOf(s).crisis; }

/** 台帳 1 行の検算：月初 + 経常収支 − 返済 + 借入 − 資本的支出 − その他 − 月末（0 なら一致） */
export function ledgerGap(L: Ledger): number { return (L.cashStart ?? NaN) + L.operating - L.repay + L.borrowed - L.capital - L.other - L.cashEnd; }

/** 平年比の雨から、貯水率・作柄・大雪を進める（地図の種と月で決まる。ほかの乱数の並びは変えない） */
const RAINY = new Set(['flood', 'typhoon', 'linearRain', 'megaRain', 'landslide']);
export function updateClimate(s: GameState): void {
  const cm = (s.month % 12 + 3) % 12, h = (() => { const v = Math.sin(s.seed * 0.0131 + s.month * 7.919 + 1.7) * 43758.5453; return v - Math.floor(v); })();
  let ratio = 0.35 + 1.3 * h + (h > 0.9 ? (h - 0.9) * 10 : 0);       // 平年比（少雨〜大雨。たまに 2 倍を超える）
  const act = s.events.active.map(e => e.id);
  if (act.some(id => RAINY.has(id))) ratio = Math.max(ratio, 2.2);
  if (act.includes('drought')) ratio = Math.min(ratio, 0.3);
  const c = s.climate ?? { rain: 0, ratio: 1, store: 0.8, crop: 1, snow: false };
  const dams = s.buildings.filter(b => b.kind === 'dam' && b.status === 'operating').length, k = 1 + 1.5 * dams;
  // 貯水率：多い雨でたまり、少ない雨で減る（ダムがあると変化が小さく、ゆっくり平年の水準へ戻る）
  c.store = Math.max(0.03, Math.min(1, c.store + (ratio - 1) * 0.16 / k + (0.05 + 0.03 * dams) * ((dams ? 0.9 : 0.8) - c.store)));
  // 作柄（4〜10 月の生育期）：雨が少ないと干ばつ、多すぎると水害で下がる
  c.crop = cm >= 3 && cm <= 9 ? Math.max(0.2, Math.min(1.15, 1.05 - 0.75 * Math.max(0, 0.6 - ratio) - 0.25 * Math.max(0, ratio - 1.9) - (act.some(id => RAINY.has(id)) ? 0.2 : 0))) : 1;
  c.snow = (cm === 11 || cm <= 1) && ratio > 1.3;   // 冬に雨が多い月は大雪
  c.ratio = Math.round(ratio * 100) / 100; c.rain = Math.round(P.rainNormal[cm] * ratio);
  s.climate = c;
}
export function stepMonth(s: GameState, opts: { forecast?: boolean } = {}): void {
  syncTerrain(s);
  repairState(s);
  const m = getMap(s.seed);
  const st = s.stats;

  // 0. 天気と暮らし：今月の降水量で、水がめ（ダム・川）の貯水率・作柄・大雪が決まる
  if (!opts.forecast) { updateClimate(s); updateEconomy(s); macroNotes(s, () => updateMacro(s)); updateThreats(s); updateRailDev(s); polOf(s); execOf(s); } // 市政と幹部は再計算の前に用意する（効果が再計算に入るように）
  // 1. 遅延効果と期限切れ
  const due = s.scheduled.filter(x => x.due <= s.month);
  s.scheduled = s.scheduled.filter(x => x.due > s.month);
  for (const x of due) applyEffect(s, x.eff, x.target, x.src);
  s.modifiers = s.modifiers.filter(x => x.until < 0 || x.until > s.month);

  // 2. 工事の進行
  for (const b of [...s.buildings]) {
    if (b.status !== 'construction' && b.status !== 'renewing') continue;
    b.remain -= 1;
    if (b.remain > 0) continue;
    b.remain = 0;
    if (b.status === 'construction') {
      const d = DEFS[b.kind];
      // 誘致：用地が整っても、企業が来るかは条件しだい。まとまらなければ 3 か月ずつ延び、3 回だめなら撤退
      if (isBiz(b.kind) && !opts.forecast) {
        const sc = bizScore(s, b.kind, b.x, b.y).score;
        if (rngNext(s) > sc) {
          b.tries = (b.tries ?? 0) + 1;
          if (b.tries >= 3) { s.notes.push(`${d.name}の誘致は、条件が合わず見送られました（用地は空きに戻りました）`); removeBuilding(s, b); continue; }
          b.remain = 3; b.total += 3; s.notes.push(`${d.name}の誘致交渉が長引いています（あと 3 か月。来てもらえる見込み ${Math.round(sc * 100)}%）`);
          continue;
        }
        s.notes.push(`${d.name}が開業しました${noteAt(b)}`);
      }
      if (b.moved) { b.moved = undefined; b.status = 'operating'; s.notes.push(`${d.name}の移設が終わりました${noteAt(b)}`); s.bVersion++; continue; }
      b.status = 'operating'; b.builtMonth = s.month;
      if (d.staffReq) { b.staff = Math.round(d.staffReq * (isCity(b.kind) && d.wage > 0 ? 0.3 : 0.5) * 10) / 10; b.staffTarget = d.staffReq; }
    } else if (b.upg) { b.status = 'operating'; b.upg = undefined; b.lv = lvOf(b) + 1; b.staffTarget = Math.round(DEFS[b.kind].staffReq * LV_CAP[b.lv - 1]); s.notes.push(`${DEFS[b.kind].name}の${DEFS[b.kind].build === 'invite' ? '増設' : '増築'}が終わりました（レベル ${b.lv}「${stageName(b.kind, b.lv)}」）${noteAt(b)}`); }
    else { b.status = 'operating'; b.age = 0; }
    s.bVersion++;
  }

  bizGrowth(s);
  // 3. 職員：退職のあと、職種ごとの月あたり採用上限の範囲で目標へ近づける
  const hireLeft: Record<string, number> = {};
  for (const b of s.buildings) {
    const d = DEFS[b.kind];
    if (!d.staffReq) continue;
    if (b.status !== 'operating' && b.status !== 'renewing') { b.staff = 0; continue; }
    const req = staffReq(s, b);
    const target = isCity(b.kind) && d.wage > 0 ? Math.min(b.staffTarget ?? req, req * 1.2) : req;
    let staff = (b.staff ?? 0) * (1 - (d.staffKind === '保育士' ? 0.015 : 0.004));
    if (staff > target) staff = target;
    else {
      // 採用できる人数は、街が大きいほど多い（働き手が多いほど、資格を持つ人も多い）
      if (hireLeft[d.staffKind] === undefined) hireLeft[d.staffKind] = d.hire * modMul(s, 'hire:' + d.staffKind) * (d.staffKind === '介護職員' && hasOp(s, 'humanoidLab') ? 1.15 : 1) * (s.stats.access?.retain ?? 1) * Math.max(1, s.stats.pop / (5000 * SCALE));
      const h = Math.min(target - staff, hireLeft[d.staffKind]);
      staff += h; hireLeft[d.staffKind] -= h;
    }
    b.staff = Math.round(staff * 100) / 100;
  }

  // 4. 世帯：類型の遷移 → 転出 → 転入
  const tax = s.tax ?? { res: 1, prop: 1, biz: 1, stay: 0 };
  const res = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating');
  const isle = isCastaway(s.seed); // v88：無人島は、水と電気が島にないと誰も住めない（はじめの 1 世帯から）
  const waterLv = isle ? Math.min(1, st.waterCap / Math.max(4, st.waterDemand)) : st.waterDemand > 0 ? Math.min(1, st.waterCap / st.waterDemand) : 1;
  const powerIn = isle ? clamp((Math.min(1, st.powerCap / Math.max(4, st.powerDemand)) - 0.4) / 0.6) : 1;
  const outMul = modMul(s, 'outflow') * (1 + 0.1 * (0.6 - (st.access?.reach ?? 0.6))); // v90：相談と情報が届かない街は、暮らしに行き詰まって出ていく
  // 人の一生：結婚・出産・子の成長・独立・高齢化。高齢世帯は亡くなって減る。医療（病院・診療所）が届かない地区ほど亡くなる人が多い
  let deaths = 0, births = 0; const dm = [0, 0, 0, 0, 0, 0], hh0 = res.reduce((a, r) => a + sumHH(r), 0);
  const hospShort = Math.max(0, 0.7 - (st.lv[1] ?? 0.7)); // 市全体の医療の不足（病床が足りない）
  // お産のできる場所：周産期母子医療センターのある総合病院 > 産院 > 一般の病院だけ > どこもない（市外へ通うので産み控え）
  const obMul = hasOp(s, 'perinatal') ? 1.08 : hasOp(s, 'maternity') ? 1.03 : hasOp(s, 'hospital') ? 0.96 : 0.92;
  st.obstetric = obMul;
  for (const r of res) {
    const hh = r.hh!, hl = r.sv?.[7] ?? 0.7, mort = 1 + 1.8 * Math.max(0, 0.72 - hl) + 1.2 * hospShort;
    for (const [from, to, rate] of P.transitions) {
      const k = to < 0 ? mort : from === 1 && to === 2 ? obMul : 1, n = hh[from] * rate * k; hh[from] -= n; if (to >= 0) hh[to] += n;
      if (to < 0) deaths += n * 1.3; if (from === 1 && to === 2) births += n * P.preschool[2] * 0.85;
      dm[to < 0 ? 4 : from === 0 ? 0 : from === 2 ? 1 : from === 3 ? 2 : from === 1 && to === 4 ? 3 : 5] += n;
    }
    // 高齢世帯以外の、病気や事故で亡くなる人（少し）
    for (let t = 0; t < 4; t++) deaths += hh[t] * P.persons[t] * 0.00003 * mort;
    for (let t = 0; t < NHH; t++) {
      let rate = P.baseOutRate * (P.outByType?.[t] ?? 1) * (1 + 3 * Math.max(0, 0.55 - r.sat[t])) * outMul * (1 + 1.5 * Math.max(0, tax.res - 1));
      rate *= 1 + 2 * (1 - waterLv);
      if (!r.connected) rate = 0.3;
      hh[t] = Math.max(0, hh[t] * (1 - Math.min(1, rate)));
    }
  }
  const access = s.buildings.some(b => b.kind === 'station' && b.connected) || (REAL && !s.buildings.some(b => b.kind === 'station')) ? 1 : 0.6;
  let unplaced = 0;
  const kindIx: Record<string, number> = { house: 0, apartment: 1, mansion: 2, towerMansion: 2, ...Object.fromEntries(Object.entries(RES_TYPE).map(([k, t]) => [k, t === 'house' ? 0 : t === 'apartment' ? 1 : 2])) };
  const elig = res.filter(r => r.connected);
  const waterIn = clamp((waterLv - 0.5) / 0.5); // 水道が足りないと転入が減る
  // 街の引きつける力：税・知名度・隣町との比較（隣町の魅力が高いと、転入希望がそちらへ流れる）
  const nb = s.neighbors?.length ? s.neighbors.reduce((a, n) => a + n.appeal, 0) / s.neighbors.length : 0.6;
  const cityPull = clamp((1 - 2 * (tax.res - 1) - 0.8 * (tax.prop - 1)) * (0.9 + 0.25 * Math.min(1, (s.fame ?? 0) / 60)) * (1 + 0.8 * (st.sat - nb - 0.08)), 0.4, 1.6);
  // 全類型を同時に配分する（先に処理した類型が空き住戸を取り切らないように）
  const vac = elig.map(r => Math.max(0, r.units! - sumHH(r)));
  // 住宅の供給：新しく建った空き住戸があると、不動産の広告や口コミで転入希望が増える（空き 2% を超えた分、最大 1.8 倍）
  const unitsAll = elig.reduce((a, r) => a + (r.units ?? 0), 0), vacAll = vac.reduce((a, v) => a + v, 0);
  const supplyK = 1 + 0.8 * clamp((vacAll / Math.max(1, unitsAll) - 0.02) / 0.08);
  // 職の引力：市内の職が働き手より多いと、近くに住みたい働く世帯の転入が増える（オフィス・工場・大企業を呼ぶと人口が伸びる）
  const jobPull = 1 + 0.9 * clamp((st.localJobs - 0.55 * st.workers) / Math.max(1, st.workers), 0, 1.5);
  // 大きな街の引力：街が大きくなるほど、仕事・店・学校の選び先が多く、地方から人を呼ぶ（4 万人で 1.3 倍まで）
  const bigCity = 1 + 0.3 * clamp(st.pop / (40000 * SCALE));
  const want = elig.map(() => [0, 0, 0, 0, 0]);
  let demandAll = 0, placed = 0;
  for (let t = 0; t < NHH; t++) {
    const demand = P.baseInflow[t] * s.inflowFactor * (t === 0 && hasOp(s, 'university') ? 1.3 : 1) * modMul(s, 'inflow:' + t) * (t <= 1 && hasOp(s, 'globalIT') ? 1.05 : 1) * modMul(s, 'inflow') * clamp(0.3 + 1.4 * st.satType[t], 0.3, 1.5) * access * waterIn * powerIn * cityPull * supplyK * (t < 4 ? jobPull : 1) * bigCity * (t <= 1 && hasOp(s, 'sdfBase') ? 1.08 : 1) * (shinOpen(s) ? 1.12 : 1) * (t >= 1 && t <= 3 ? 1 - 0.06 * (((s.econ as any)?.macro?.rate ?? 0.5) - 0.5) : 1); // 金利が上がると住宅ローンが重く、家族の転入が減る // 駐屯地の隊員と家族
    demandAll += demand;
    let tot = 0;
    const ws = elig.map((r, i) => { const w = vac[i] * P.housingPref[t][kindIx[r.kind]] * (0.4 + r.sat[t]); tot += w; return w; });
    if (tot > 0) for (let i = 0; i < elig.length; i++) want[i][t] = demand * ws[i] / tot;
  }
  elig.forEach((r, i) => {
    const sum = want[i][0] + want[i][1] + want[i][2] + want[i][3] + want[i][4];
    if (sum <= 0) return;
    const k = Math.min(1, vac[i] / sum);
    for (let t = 0; t < NHH; t++) { r.hh![t] += want[i][t] * k; placed += want[i][t] * k; }
  });
  unplaced = demandAll - placed;
  st.deaths = Math.round(deaths * 10) / 10; st.births = Math.round(births * 10) / 10;
  { const hh1 = res.reduce((a, r) => a + sumHH(r), 0); demoAdd(s, { marry: dm[0], school: dm[1], leave: dm[2], retire: dm[3], birth: births, death: deaths, inHH: placed, outHH: Math.max(0, hh0 + placed - hh1 - dm[4]) }); }
  st.pentUp = 0.5 * st.pentUp + 0.5 * Math.max(0, unplaced);
  logOf(s).inHH = placed; // v90：今月の転入世帯（ゲームループの指標）

  // 5. 店舗：閉店と開業
  const grace = modAdd(s, 'shopGrace');
  for (const b of [...s.buildings]) {
    if (!isShop(b.kind) || b.status !== 'operating') continue;
    const d = DEFS[b.kind];
    if (s.month <= b.builtMonth) continue;
    if (b.revenue * P.margin < d.fixed!) b.lossStreak = (b.lossStreak ?? 0) + 1; else b.lossStreak = Math.max(0, (b.lossStreak ?? 0) - 1);
    if (!b.sandbox && !b.name && b.lossStreak! >= P.closeStreak + grace) { removeBuilding(s, b); recordClose(s); } // 地図にある既存の店（名前つき）は赤字でも閉めない（ゲームの仮定）
  }
  tryOpenShop(s);
  tryOpenBiz(s);

  // 6. 民間住宅開発
  { const u0 = pipelineUnits(s); privateHousing(s, waterLv); chargeLevy(s, pipelineUnits(s) - u0, modAdd(s, 'devLevy')); } // v90：開発負担金

  // 7. 未接続のまま空になった住宅は解体される
  for (const r of [...s.buildings]) {
    if (!isRes(r.kind) || r.status !== 'operating' || r.sandbox) continue;
    if (!r.connected && sumHH(r) < 0.5) { r.lossStreak = (r.lossStreak ?? 0) + 1; if (r.lossStreak >= 12) removeBuilding(s, r); } else r.lossStreak = 0;
  }

  // 8. 老朽化（v90：市の施設は長寿命化・先送りの政策で進み方が変わる）
  const ageK = modMul(s, 'ageRate');
  for (const b of s.buildings) {
    const d = DEFS[b.kind];
    if (!d.ageRate || b.status === 'construction' || b.status === 'renewing') continue;
    b.age = Math.min(100, b.age + d.ageRate * (b.status === 'operating' ? 1 : 0.5) * (isCity(b.kind) ? ageK : 1));
    if (b.age >= 100 && b.status === 'operating' && isCity(b.kind)) { b.status = 'suspended'; s.bVersion++; }
  }
  const rAge = modMul(s, 'roadAge'), rFix = modAdd(s, 'roadFix');
  for (let i = 0; i < N; i++) {
    if (s.road[i] !== 1 && s.road[i] !== 2) continue;
    let a = s.roadAge[i] + P.roadAgeRate * (0.6 + 0.8 * Math.min(1.5, s.vc[i])) * rAge;
    if (rFix > 0 && a > 50) a -= rFix;
    s.roadAge[i] = Math.round(clamp(a, 0, 100) * 100) / 100;
  }

  // 9. 財政
  const L = monthlyBudget(s);
  { const lv = logView(s).levyM; if (lv) { L.fees = (L.fees ?? 0) + lv; L.operating += lv; } } // v90：開発負担金は今月の収入
  L.capital = s.pending.capital; L.other = s.pending.other; L.borrowed = s.pending.borrowed; L.repay = s.pending.repay ?? 0; // 繰り上げ返済（一時借入）
  L.cashStart = s.pending.cashStart ?? s.cash + s.pending.capital + s.pending.other - s.pending.borrowed + (s.pending.repay ?? 0);
  s.cash += L.operating;
  let paid = 0; // 今月の約定返済（繰り上げ返済は操作のときに資金から引いてある）
  for (const l of s.loans) {
    const pay = Math.min(l.remaining, l.principal / l.months);
    l.remaining -= pay; paid += pay;
  }
  s.cash -= paid; L.repay += paid;
  s.loans = s.loans.filter(l => l.remaining > 0.5);
  if (s.cash < 0) {
    const need = Math.ceil(-s.cash / 100) * 100;
    s.loans.push({ principal: need, remaining: need, rate: P.tempRate + rateAdd(s), months: P.tempMonths, kind: 'temp' });
    s.cash += need; L.borrowed += need;
  }
  L.cashEnd = s.cash;
  s.ledger.push(L);
  if (s.ledger.length > 120) s.ledger.shift();
  if (!opts.forecast) updateFiscal(s);
  s.pending = emptyLedger(s.month + 1, s.cash);

  // 10. 知名度・隣町・支持率
  monthlyCivic(s);
  // 11. イベント
  if (!opts.forecast) tickEvents(s);

  // 11. 月を進めて再計算
  s.month++;
  recompute(s, !!opts.forecast);
  s.history.push({ month: s.month, pop: Math.round(s.stats.pop), cash: Math.round(s.cash), sat: s.stats.sat, wait: Math.round(s.stats.waitlist), op: Math.round(L.operating), maxVc: s.stats.maxVc });
  if (s.history.length > 240) s.history.shift();
  if (s.notes.length > 60) s.notes.splice(0, s.notes.length - 60); // 画面に出す前の知らせがたまりすぎると、保存データの検査（100 件まで）で操作がすべて止まるため
  if (s.peakPop === undefined && s.history.length) { const h = s.history.reduce((a, x) => (x.pop > a.pop ? x : a), s.history[0]); s.peakPop = h.pop; s.peakMonth = h.month; } // 古い保存データ：記録から
  if (s.stats.pop > (s.peakPop ?? 0)) { s.peakPop = Math.round(s.stats.pop); s.peakMonth = s.month; }
  if (!opts.forecast) { monthlyMissions(s); mayorMonthly(s); challengeMonthly(s); intlMonthly(s, () => rngNext(s)); politicsMonthly(s); trackVoices(s); }
  // 街の終わり：一度は人が住んだ街から、人がいなくなった
  if (!opts.forecast && !s.over && s.month > 24 && s.stats.pop < 1 && ((s.peakPop ?? 0) >= 500 || s.buildings.filter(b => isRes(b.kind)).length > 30)) s.over = { month: s.month, reason: '街から人がいなくなりました' };

  // 12. 任期末：評価と選挙
  if (!opts.forecast && s.mode === 'term' && s.month - s.termStart >= s.termLength) {
    const r = runElection(s);
    s.elections.push(r);
    s.pendingElection = r;
    if (r.win) { s.term++; s.termStart = s.month; s.goalPick = true; } else s.mode = 'sandbox';
  }
  void m;
}

/** 見込み売上（万円/月）：その区画に店が開いたときに取れる買物支出 */
export function shopPotential(s: GameState, acc: number, kind: Kind): number {
  const d = DEFS[kind], dist = distField(s, acc);
  let pot = 0;
  for (const r of s.buildings) {
    if (!isRes(r.kind) || r.status !== 'operating' || !r.connected) continue;
    const dd = dist[r.acc];
    if (dd < 0 || dd > d.range!) continue;
    let sp = 0; for (let t = 0; t < NHH; t++) sp += r.hh![t] * P.income[t];
    const w = d.attract! / (1 + dd);
    pot += sp * P.retailShare * w / (r.shopP + P.outsideWeight + w);
  }
  return pot;
}

/** 業務・工業の用途：市内の職が足りない（市外へ通う人が多い）ほど、民間がオフィスや町工場を建てる */
function tryOpenBiz(s: GameState): void {
  const st = s.stats, m = getMap(s.seed), info = roadInfo(s);
  if (st.powerCap < st.powerDemand * 1.02) return;
  if (s.buildings.filter(b => (b.kind === 'officeS' || b.kind === 'officeM' || b.kind === 'smallFactory') && b.status === 'construction').length >= 2) return;
  const lack = st.workers / Math.max(1, st.localJobs);
  const net = (hasOp(s, 'radioTower') ? 1.1 : 1) * (hasOp(s, 'fiberHub') ? 1.15 : 1);
  const p = 0.22 * clamp((lack - 0.85) * 1.2, 0.08, 1.4) * clamp(1 - 2 * ((s.tax?.biz ?? 1) - 1), 0.5, 1.4) * modMul(s, 'econ') * net;
  const sd = stationDist(s);
  for (let i = 0; i < N; i++) {
    const z = s.zone[i];
    if ((z !== 5 && z !== 6) || s.occ[i] || s.road[i] || !buildable(m, i)) continue;
    const x = i % W, y = (i / W) | 0, acc = accessTile(s, x, y, 1, 1);
    if (acc < 0 || !info.conn[acc]) continue;
    if (rngNext(s) >= p) continue;
    const kind: Kind = z === 6 ? 'smallFactory' : sd && sd[acc] >= 0 && sd[acc] <= 25 && lack > 1.2 ? 'officeM' : 'officeS';
    addBuilding(s, kind, x, y, 'construction', DEFS[kind].months);
    return; // 月に 1 棟ずつ
  }
}

function tryOpenShop(s: GameState): void {
  const m = getMap(s.seed), info = roadInfo(s);
  const th = P.openRatio * modMul(s, 'shopOpen') * (1 + 0.8 * ((s.tax?.biz ?? 1) - 1));
  if (s.buildings.some(b => isShop(b.kind) && b.status === 'construction')) return; // 同時に開業準備するのは 1 店まで
  let best = { ratio: 0, x: 0, y: 0, kind: 'shop' as Kind };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (s.zone[i] !== 4 || s.occ[i] || s.road[i] || !buildable(m, i)) continue;
    const acc = accessTile(s, x, y, 1, 1);
    if (acc < 0 || !info.conn[acc]) continue;
    for (const kind of ['bakery', 'shop', 'konbini', 'cafe', 'drugstore'] as Kind[]) {
      const ratio = shopPotential(s, acc, kind) / (DEFS[kind].fixed! / P.margin);
      if (ratio > best.ratio) best = { ratio, x, y, kind };
    }
    // スーパー：2×2 の商業区画が空いていて、幹線か国道に面している
    if (x + 1 < W && y + 1 < H && [idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)].every(j => s.zone[j] === 4 && !s.occ[j] && !s.road[j] && buildable(m, j))) {
      const a2 = accessTile(s, x, y, 2, 2, 2);
      if (a2 >= 0 && info.conn[a2]) {
        const ratio = shopPotential(s, a2, 'supermarket') / (DEFS.supermarket.fixed! / P.margin);
        if (ratio > best.ratio * 1.05) best = { ratio, x, y, kind: 'supermarket' };
      }
    }
  }
  if (best.ratio >= th && rngNext(s) < P.openProb) {
    // 小さな店は、その場所で採算に乗る業態の中から、街に少ないものを選びやすく（商店街に同じ店ばかり並ばないように）
    if (best.kind !== 'supermarket') {
      const acc = accessTile(s, best.x, best.y, 1, 1), SMALL: Kind[] = ['bakery', 'shop', 'konbini', 'cafe', 'drugstore', 'salon'];
      const cand = SMALL.map(k => ({ k, r: shopPotential(s, acc, k) / (DEFS[k].fixed! / P.margin) })).filter(o => o.r >= th);
      if (cand.length > 1) {
        const w = cand.map(o => o.r / (1 + 0.6 * s.buildings.filter(b => b.kind === o.k).length));
        let x = rngNext(s) * w.reduce((a, v) => a + v, 0); best.kind = cand[cand.length - 1].k;
        for (let i = 0; i < cand.length; i++) { x -= w[i]; if (x <= 0) { best.kind = cand[i].k; break; } }
      }
    }
    addBuilding(s, best.kind, best.x, best.y, 'construction', DEFS[best.kind].months);
  }
}

function privateHousing(s: GameState, waterLv: number): void {
  const m = getMap(s.seed), info = roadInfo(s), st = s.stats;
  if (st.waterCap < st.waterDemand * 1.02 || waterLv < 1) return; // 水道に余力がないと着工しない
  if (st.sewageCap < st.sewageDemand * 1.0 || st.powerCap < st.powerDemand * 1.0) return; // 下水・電力に余力がないと着工しない
  let units = 0, vacant = 0, pipeline = 0;
  for (const b of s.buildings) {
    if (!isRes(b.kind)) continue;
    if (b.status === 'construction') pipeline += b.units!;
    else if (b.connected) { units += b.units!; vacant += Math.max(0, b.units! - sumHH(b)); }
  }
  const sDist = stationDist(s);
  const maxStarts = Math.max(1, Math.round(P.devMaxStarts * modMul(s, 'devCap'))); // v90：開発負担金で事業者の着工が減る
  const all = modMul(s, 'dev:all');
  const mul = [1, modMul(s, 'dev:1'), modMul(s, 'dev:2'), modMul(s, 'dev:3')];
  // 線引きと立地適正化：市街化調整区域は原則として家が建たない。居住誘導区域を決めると、そこに建ちやすく、外には建ちにくい
  const ar = s.area, hasYudo = !!ar && ar.some(v => v === 2);
  const areaMul = (i: number) => !ar ? 1 : ar[i] === 1 ? 0.1 : ar[i] === 2 ? 1.3 : 1;
  let starts = 0;
  for (let i = 0; i < N && starts < maxStarts; i++) {
    const z = s.zone[i];
    if (z < 1 || z > 3 || s.occ[i] || s.road[i] || !buildable(m, i)) continue;
    const x = i % W, y = (i / W) | 0;
    const acc = accessTile(s, x, y, 1, 1);
    if (acc < 0 || !info.conn[acc]) continue;
    const vEff = (vacant + pipeline) / Math.max(1, units + pipeline);
    const pressure = clamp((P.targetVacancy - vEff) / P.targetVacancy) + Math.min(1, st.pentUp / 12);
    const p = P.devProb[z] * Math.min(1.5, pressure) * all * mul[z] * areaMul(i);
    if (p <= 0) continue;
    if (rngNext(s) >= p) continue;
    const sd0 = sDist && sDist[acc] >= 0 ? sDist[acc] : 999;
    const kind: Kind = z === 1 ? 'house' : z === 2 ? 'apartment' : sd0 <= P.towerStationRange && st.pop >= P.towerPop && rngNext(s) < 0.35 ? 'towerMansion' : sd0 <= P.mansionStationRange ? 'mansion' : 'apartment';
    const b = addBuilding(s, kind, x, y, 'construction', DEFS[kind].months);
    pipeline += b.units!; starts++;
  }
  // 用途を引き上げた既存の住宅は、需要があれば民間が建て替える。住んでいた世帯は転居する
  // （実在都市版は地図の街区。架空の街は建ってから P.redevAge か月たった住宅）
  if (starts >= maxStarts) return;
  const LV: Partial<Record<Kind, number>> = { house: 1, apartment: 2, mansion: 3, towerMansion: 4 };
  // 駅のすぐ近くの分譲マンションは、人口 2 万人を超えるとタワーマンションに建て替わることがある
  const towerOK = (b: { kind: Kind; acc: number }) => b.kind === 'mansion' && st.pop >= P.towerPop && !!sDist && b.acc >= 0 && sDist[b.acc] >= 0 && sDist[b.acc] <= P.towerStationRange;
  const vEff = (vacant + pipeline) / Math.max(1, units + pipeline);
  const pressure = clamp((P.targetVacancy - vEff) / P.targetVacancy) + Math.min(1, st.pentUp / 12);
  const cands = s.buildings.filter(b => (REAL ? b.osm : isRes(b.kind) && b.w === 1 && b.h === 1 && s.month - b.builtMonth >= P.redevAge) && b.status === 'operating' && b.connected && (s.zone[idx(b.x, b.y)] > (LV[b.kind] ?? 9) || (s.zone[idx(b.x, b.y)] === 3 && towerOK(b))) && s.zone[idx(b.x, b.y)] <= 3);
  for (const b of cands) {
    if (starts >= maxStarts) break;
    const z = s.zone[idx(b.x, b.y)];
    const p = P.devProb[z] * Math.min(1.5, Math.max(0.15, pressure)) * all * mul[z] * P.redevRate;
    if (rngNext(s) >= p) continue;
    const acc = b.acc;
    const kind: Kind = z === 2 ? 'apartment' : towerOK(b) ? 'towerMansion' : (sDist && acc >= 0 && sDist[acc] >= 0 && sDist[acc] <= P.mansionStationRange ? 'mansion' : 'apartment');
    if ((DEFS[kind].units ?? 0) <= (b.units ?? 0)) continue; // 戸数が増えないなら建て替えない
    const x = b.x, y = b.y;
    removeBuilding(s, b);
    s.zone[idx(x, y)] = z;
    addBuilding(s, kind, x, y, 'construction', DEFS[kind].months);
    starts++;
  }
}

/** チームの本拠地（稼働中の施設）。なければ null */
export function teamVenue(s: GameState, sport: Sport): Building | null {
  for (const k of SPORTS[sport].venue) { const b = s.buildings.find(o => o.kind === k && o.status === 'operating' && o.connected); if (b) return b; }
  return null;
}
/** チームをつくれるか（できないときは理由） */
export function teamCheck(s: GameState, sport: Sport): string | null {
  const d = SPORTS[sport];
  if ((s.teams ?? []).some(t => t.sport === sport)) return 'すでにチームがあります';
  if (!teamVenue(s, sport)) return `本拠地になる${d.venue.map(k => DEFS[k].name).join('か')}が要ります`;
  if ((s.fame ?? 0) < d.fameReq) return `知名度が ${d.fameReq} に届いていません（いま ${Math.round(s.fame ?? 0)}）`;
  return null;
}
export function addTeam(s: GameState, sport: Sport): Team {
  const base = (s.cityName || '住野市').replace(/(市|区|町|村)$/, '');
  const t: Team = { sport, name: SPORTS[sport].suffix(base).slice(0, 60), since: s.month, fans: 0.3, rank: 0, titles: 0 };
  (s.teams ??= []).push(t);
  return t;
}
/** チームの毎月：人気が少しずつ育ち、12 月にシーズンの順位が決まる */
/** 強くて人気のあるチームは街の景気を押し上げる（試合の日の人出、関連の仕事、街の雰囲気）。本拠地で試合をしているチームだけ */
export function teamEcon(s: GameState): number {
  let k = 1; for (const t of s.teams ?? []) if (teamVenue(s, t.sport)) k += 0.02 * t.fans * (0.5 + (t.power ?? 0.35));
  return k;
}
function monthlyTeams(s: GameState): void {
  for (const t of s.teams ?? []) {
    const d = SPORTS[t.sport], venue = teamVenue(s, t.sport);
    t.fans = Math.round(clamp(t.fans + (venue ? 0.004 + 0.004 * Math.min(1, (s.fame ?? 0) / 60) + (hasOp(s, 'clubhouse') ? 0.002 : 0) : -0.01)) * 1000) / 1000; // クラブハウス（練習場・ファンとの交流）でファンが増える
    t.power = Math.round(clamp((t.power ?? 0.35) + (0.35 - (t.power ?? 0.35)) * 0.012) * 1000) / 1000; // 戦力は補強しないと少しずつ平均へ
    if (s.month % 12 === 8) {
      const strength = 0.25 + 0.3 * t.fans + 0.35 * (t.power ?? 0.35) + 0.45 * rngNext(s);
      t.rank = Math.max(1, Math.min(d.size, Math.round((1 - strength / 1.25) * d.size) + 1));
      const mod = (key: string, op: 'mul' | 'add', v: number, months: number, src: string) => s.modifiers.push({ key, op, v, until: s.month + months, cost: 0, src });
      if (t.rank === 1) {
        t.titles++; s.celeb = { kind: 'parade', month: s.month, label: `${SPORTS[t.sport].name}の優勝パレード` }; t.fans = Math.min(1, t.fans + 0.08); s.fame = Math.min(100, (s.fame ?? 0) + 4); s.approval = Math.min(0.98, s.approval + 0.03);
        const bonus = Math.round(d.cost * 0.04);
        mod('econ', 'mul', 1.03, 12, `${t.name}の優勝`); mod('visitors', 'mul', 1.1, 12, `${t.name}の優勝`); mod('sat:all', 'add', 0.01, 6, `${t.name}の優勝`); mod('teamIncome', 'add', bonus, 12, `${t.name}の優勝`);
        s.notes.push(`${t.name}が${d.league}で優勝しました！ 12 か月、景気が 3% 上向き、来訪者が 1 割増え、グッズや放映、ふるさと納税で月 ${bonus} 万円の収入。知名度と支持率も上がりました`);
      } else if (t.rank <= Math.ceil(d.size / 4)) {
        t.fans = Math.min(1, t.fans + 0.04); mod('econ', 'mul', 1.012, 12, `${t.name}の上位進出`); mod('visitors', 'mul', 1.04, 12, `${t.name}の上位進出`);
        s.notes.push(`${t.name}は ${d.size} チーム中 ${t.rank} 位の上位でした。12 か月、景気と来訪者が少し上向きます`);
      } else if (t.rank > d.size * 0.75) {
        t.fans = Math.max(0, t.fans - 0.04); mod('approval', 'add', -0.005, 6, `${t.name}の不振`);
        s.notes.push(`${t.name}は ${d.size} チーム中 ${t.rank} 位と低迷しました。人気が少し下がりました（補強のできごとで戦力を上げられます）`);
      } else s.notes.push(`${t.name}の今シーズンは ${d.size} チーム中 ${t.rank} 位でした`);
      t.fans = Math.round(t.fans * 1000) / 1000;
    }
  }
}

/** 落選後に、もう一度立候補できるか（できないときは理由） */
export function rerunCheck(s: GameState): string | null {
  if (s.mode !== 'sandbox') return '任期中です';
  const last = s.elections.at(-1);
  if (!last || last.win) return '立候補できるのは落選したあとです';
  const since = s.month - Math.max(last.month, s.acts.rerun ?? -1e9);
  if (since < RERUN.wait) return `前回の選挙から ${RERUN.wait} か月たつと立候補できます（あと ${RERUN.wait - since} か月）`;
  const R = rerunRules(s);
  if (!R[1].ok) return `街の支持（支持率）が ${R[1].need} に届いていません（いま ${R[1].now}）。暮らしの満足を上げると支持が戻ります`;
  if (!R[2].ok) return `暮らしの満足が ${R[2].need} に届いていません（いま ${R[2].now}）`;
  if (!R[3].ok) return '一時借入を返し終えてから立候補できます';
  return null;
}
/** 返り咲きの条件の定義（ここだけで決める。画面の条件文・ボタンの有効／無効・理由文・CPU の判断はすべてここから作る） */
export const RERUN = { wait: 12, approval: 0.5, satBelowCenter: 0.05, bonus: 2 };
/** 返り咲きの条件の一覧と、いま満たしているか。比べるのは丸める前の値（表示は切り捨てなので「50%」と出ていれば必ず満たしている） */
export function rerunRules(s: GameState): { label: string; need: string; now: string; ok: boolean }[] {
  const last = s.elections.at(-1), since = last ? s.month - Math.max(last.month, s.acts.rerun ?? -1e9) : 0, satNeed = P.voteCenter - RERUN.satBelowCenter, td = tempDebt(s);
  const pc = (v: number) => (Math.floor(v * 1000 + 1e-6) / 10).toFixed(1) + '%';
  return [
    { label: '前回の選挙から', need: `${RERUN.wait} か月以上`, now: `${Math.max(0, since)} か月`, ok: since >= RERUN.wait },
    { label: '支持率', need: `${pc(RERUN.approval)} 以上`, now: pc(s.approval), ok: s.approval >= RERUN.approval },
    { label: '暮らしの満足', need: `${pc(satNeed)} 以上`, now: pc(s.stats.sat), ok: s.stats.sat >= satNeed },
    { label: '一時借入', need: 'なし', now: td > 0 ? `${Math.round(td).toLocaleString()} 万円` : 'なし', ok: !(td > 0) },
  ];
}
/** 返り咲きの選挙。勝てば新しい任期が始まる */
export function rerunElection(s: GameState): ElectionResult {
  s.goals = [];
  const r = runElection(s, true); // 返り咲きの補正（+2・公約なし）は electionOutlook(s, true) に入っている。見込みの表示と同じ式
  (r as any).comeback = true;
  s.elections.push(r); s.pendingElection = r; s.acts.rerun = s.month;
  if (r.win) { s.mode = 'term'; s.term++; s.termStart = s.month; s.goalPick = true; }
  return r;
}

export { designCap };

/** 知名度は、ランドマーク・企業・できごとから決まる目標値へ少しずつ近づく。隣町も少しずつ変わる。支持率は暮らしの満足と最近のできごとで決まる */
export function monthlyCivic(s: GameState): void {
  for (const b of s.buildings) if (b.kind === 'airport' && b.upAt !== undefined && s.month >= b.upAt) { b.lv = Math.min(3, (b.lv ?? 1) + 1); delete b.upAt; s.notes.push(b.lv === 2 ? '空港の滑走路が 2,500m に延び、国際線が就航できるようになりました' : '空港に国際線ターミナルができ、24 時間使えるようになりました。来訪者が増えます'); }
  for (const b of s.buildings) if (b.kind === 'station') {
    if (b.upAt !== undefined && s.month >= b.upAt) { b.lv = Math.min(3, (b.lv ?? 1) + 1); delete b.upAt; s.notes.push(`${b.name ?? '駅'}が${b.lv === 2 ? '駅ビル' : '大型ターミナル'}になりました。店と事務所の職が増え、来訪者と知名度が上がり、ホームも広がりました`); }
    if (b.shin !== undefined && s.month === b.shin) s.notes.push(`${b.name ?? '駅'}に新幹線が停まるようになりました！ 来訪者・知名度・転入・景気が大きく伸びます`);
  }
  if (!s.tax) return;
  monthlyTeams(s);
  // 新しい技術：その年の初めに使えるようになったことを知らせる
  if (s.month % 12 === 0) { const y = s.month / 12 + 1; for (const k of Object.keys(DEFS) as Kind[]) if (DEFS[k].unlock === y) s.notes.push(`新しい技術：「${DEFS[k].name}」が使えるようになりました（［施設を建てる］）`); }
  let fameT = 10 + modAdd(s, 'fame');
  for (const t of s.teams ?? []) if (teamVenue(s, t.sport)) fameT += SPORTS[t.sport].fame * (0.5 + t.fans);
  for (const b of s.buildings) if (b.status === 'operating' && b.connected) fameT += (DEFS[b.kind].fame ?? 0) * (1 + 0.25 * (lvOf(b) - 1)) + (lvOf(b) >= 3 && DEFS[b.kind].cat === 'landmark' ? 2 * (lvOf(b) - 2) : 0);
  { const T = s.terraT; if (T) { let de = 0; for (const v of T) if (v === 7) de++; if (de >= 16) fameT += 4; } }
  if (hasOp(s, 'airport')) for (const r of s.airRoutes ?? []) fameT += AIR_ROUTES.find(o => o.id === r.id)?.fame ?? 0;
  // 財政再生団体のあいだは、住民サービスの切り詰めで支持率が下がり続ける
  if (s.fiscal?.status === 'rebuild') s.approval = Math.max(0.1, s.approval - 0.003);
  s.fame = Math.round(clamp((s.fame ?? 0) + (Math.min(100, fameT) - (s.fame ?? 0)) * 0.08, 0, 100) * 100) / 100;
  for (const n of s.neighbors) {
    const drift = (Math.sin((s.month + n.name.length * 7) * 0.21) * 0.004);
    n.appeal = Math.round(clamp(n.appeal + drift + (0.6 - n.appeal) * 0.01, 0.35, 0.85) * 1000) / 1000;
    n.pop = Math.round(n.pop * (1 + (n.appeal - 0.6) * 0.002));
  }
  const st = s.stats, tax = s.tax;
  const target = clamp(0.5 + 1.6 * (st.sat - P.voteCenter) - 0.9 * (tax.res - 1) - 0.4 * (tax.prop - 1) + modAdd(s, 'approval') + diffOf(s).appr - (tempDebt(s) > 0 ? 0.04 : 0), 0.05, 0.95);
  s.approval = Math.round(clamp(s.approval + (target - s.approval) * 0.25, 0.02, 0.98) * 1000) / 1000;
  s.polls.push(Math.round(s.approval * 1000) / 1000); if (s.polls.length > 72) s.polls.shift();
}

/** 誘致の見込み（0〜1）と、足りない条件 */
export function bizScore(s: GameState, kind: Kind, x: number, y: number): { score: number; why: string[] } {
  const d = DEFS[kind], st = s.stats, why: string[] = [];
  let sc = 0.55;
  const art = accessTile(s, x, y, d.w, d.h, 2) >= 0;
  if (d.req === 'arterial' && !art) { sc -= 0.45; why.push('幹線道路か国道に面していない'); }
  if (d.req === 'station') { const sd = stationDist(s), a = accessTile(s, x, y, d.w, d.h); if (!(sd && a >= 0 && sd[a] >= 0 && sd[a] <= 25) && !art) { sc -= 0.35; why.push('駅の近く（道路で 750m 以内）でも幹線沿いでもない'); } }
  if (d.req === 'power' && st.powerCap - st.powerDemand < (d.use ?? 0)) { sc -= 0.45; why.push(`電力の余裕が足りない（あと ${Math.round((d.use ?? 0) - (st.powerCap - st.powerDemand))} 世帯相当）`); }
  if (d.req === 'fame') { if ((s.fame ?? 0) < 30) { sc -= 0.5; why.push(`知名度が 30 に届かない（いま ${Math.round(s.fame ?? 0)}）`); } if (!art) { sc -= 0.3; why.push('幹線道路か国道に面していない'); } }
  if (d.jobs && st.workers < (st.localJobs + d.jobs) * 0.9) { sc -= 0.1; why.push('市内で働き手が集まりにくい'); }
  // 交通の便：空港・港・高速道路 IC があると、相性のよい企業が来やすい
  const good: Partial<Record<Kind, Kind[]>> = { airport: ['office', 'hotel', 'datacenter', 'university', 'univHospital', 'cinema', 'hqTower', 'itPark', 'semicon'], port: ['factory', 'logistics', 'foodFactory', 'battery', 'semicon'], ic: ['logistics', 'factory', 'themepark', 'mall', 'office', 'golf', 'onsen', 'tourFarm', 'foodFactory', 'battery', 'pharma'], industrialPark: ['factory', 'logistics', 'lab', 'datacenter', 'foodFactory', 'battery', 'semicon', 'pharma'], university: ['lab', 'office', 'itPark', 'pharma', 'gameStudio'], lab: ['pharma', 'semicon'], farm: ['tourFarm', 'foodFactory'], hotSpring: ['onsen', 'hotel'], beach: ['hotel'], radioTower: ['office', 'datacenter', 'lab', 'hqTower', 'ioDatacenter', 'itPark', 'callCenter'], fiberHub: ['office', 'datacenter', 'lab', 'hqTower', 'ioDatacenter', 'itPark', 'gameStudio', 'callCenter'], hqTower: ['bankHq', 'callCenter'], fusion: ['semicon', 'battery'] };
  for (const [k, list] of Object.entries(good) as [Kind, Kind[]][]) if (list.includes(kind) && hasOp(s, k)) { sc += 0.12; why.push(`＋${DEFS[k].name}がある`); }
  if (shinOpen(s) && ['office', 'hqTower', 'itPark', 'hotel', 'bankHq', 'callCenter', 'convention', 'lab', 'pharma'].includes(kind)) { sc += 0.12; why.push('＋新幹線の駅がある'); }
  sc += 0.25 * (1 - (s.tax?.biz ?? 1)) * 2 + 0.12 * Math.min(1, (s.fame ?? 0) / 60) + modAdd(s, 'bizIncentive');
  return { score: clamp(sc, 0.05, 0.97), why };
}

// ---- v19：市長の初仕事（ミッション）・人口の節目・住民の声のお礼 ----
export interface MissionDef { id: string; title: string; how: string; /** この地形の街だけ */ terrain?: string[]; reward: { cash: number; approval?: number; fame?: number }; done: (s: GameState, b: NonNullable<GameState['missionBase']>) => boolean; progress?: (s: GameState, b: NonNullable<GameState['missionBase']>) => string }
const cntRoad = (s: GameState) => { let n = 0; for (let i = 0; i < N; i++) if (s.road[i] === 1 || s.road[i] === 2) n++; return n; };
const cntZoned = (s: GameState) => { let n = 0; for (let i = 0; i < N; i++) if (s.zone[i] >= 1 && s.zone[i] <= 3) n++; return n; };
const cntShops = (s: GameState) => s.buildings.filter(b => isShop(b.kind) && b.status === 'operating').length;
const cntParks = (s: GameState) => s.buildings.filter(b => DEFS[b.kind].fam === 'park').length;
export const MISSIONS: MissionDef[] = [
  { id: 'road', title: '道路を 10 区間引く', how: '［道路を引く］→［生活道路］。いまある道路の端からドラッグします', reward: { cash: 1000 }, done: (s, b) => cntRoad(s) >= b.roads + 10, progress: (s, b) => `${Math.max(0, cntRoad(s) - b.roads)} / 10 区間` },
  { id: 'zone', title: '住宅の用途を 12 区画に指定する', how: '［土地の用途］→［低層住宅］。道路沿いの空き地をドラッグします', reward: { cash: 800 }, done: (s, b) => cntZoned(s) >= b.zoned + 12, progress: (s, b) => `${Math.max(0, cntZoned(s) - b.zoned)} / 12 区画` },
  { id: 'move', title: '新しく 50 世帯に住んでもらう', how: '時間を進めると、民間が家を建て、世帯が引っ越してきます', reward: { cash: 1500, approval: 0.01 }, done: (s, b) => s.stats.households >= b.hh + 50, progress: (s, b) => `${Math.max(0, Math.round(s.stats.households - b.hh))} / 50 世帯` },
  { id: 'care', title: '保育の待機児童を 30 人以下にする', how: '［施設を建てる］→［子育て］で保育園を。保育士の採用には時間がかかります', reward: { cash: 2000, approval: 0.02 }, done: s => s.stats.waitlist <= 30, progress: s => `いま ${Math.round(s.stats.waitlist)} 人` },
  { id: 'shop', title: '新しい店を開いてもらう', how: '［土地の用途］→［商業］を、住宅の近くの道路沿いに指定します', reward: { cash: 800 }, done: (s, b) => cntShops(s) > b.shops, progress: (s, b) => `${Math.max(0, cntShops(s) - b.shops)} / 1 店` },
  { id: 'park', title: '公園をつくる', how: '［施設を建てる］→［公園・スポーツ］。住宅の近くに置くと暮らしの満足が上がります', reward: { cash: 600 }, done: (s, b) => cntParks(s) > b.parks },
  { id: 'festival', title: '市民まつりを開く', how: '［政策］→ 市民との取り組み →［市民まつりの開催］', reward: { cash: 0, approval: 0.01, fame: 2 }, done: s => s.acts.festival !== undefined },
  { id: 'pop10k', title: '人口 1 万人の街にする', how: '住宅地を広げ、保育・学校・水道を足りるように', reward: { cash: 5000, fame: 3 }, done: s => s.stats.pop >= 10000, progress: s => `いま ${Math.round(s.stats.pop).toLocaleString()} 人` },
  { id: 'bus', title: 'バス停を置く', how: '［道路を引く］→［バス停を置く］。駅から遠い住宅地に', reward: { cash: 500 }, done: s => (s.busStops?.length ?? 0) > 0 },
  { id: 'vision', title: 'ビジョン専用の施設を建てる', how: '［施設を建てる］で、選んだビジョンの専用施設（【専用】の印）を', reward: { cash: 3000, fame: 2 }, done: s => !!s.vision && s.buildings.some(b => DEFS[b.kind].vision === s.vision && b.status === 'operating') },
  { id: 'pop20k', title: '人口 2 万人の街にする', how: '職（業務・工業・企業の誘致）も増やすと、働く世帯が来ます', reward: { cash: 8000, fame: 4 }, done: s => s.stats.pop >= 20000, progress: s => `いま ${Math.round(s.stats.pop).toLocaleString()} 人` },
  { id: 'team', title: 'プロスポーツのチームを持つ', how: '知名度を上げ、本拠地（体育館・スタジアム・野球場）を用意します', reward: { cash: 5000, fame: 3 }, done: s => (s.teams ?? []).length > 0 },
  { id: 'pop50k', title: '人口 5 万人の街にする', how: '鉄道・高層住宅・大きな施設で、都市の格を上げます', reward: { cash: 20000, fame: 6 }, done: s => s.stats.pop >= 50000, progress: s => `いま ${Math.round(s.stats.pop).toLocaleString()} 人` },
];
const has = (s: GameState, ...k: Kind[]) => s.buildings.some(b => k.includes(b.kind) && b.status === 'operating');
// v29：地形ごとの初仕事（その地形らしい課題）と、市政の初仕事
MISSIONS.splice(2, 0,
  { id: 't-coast', terrain: ['coast', 'island'], title: '津波から逃げる場所をつくる', how: '［施設を建てる］→［消防・防災］で津波避難タワーか避難所を、海に近い住宅地に。［地図の表示］→［津波］で浸水の深さを確かめられます', reward: { cash: 2000, approval: 0.01 }, done: s => has(s, 'tsunamiTower', 'shelter') },
  { id: 't-river', terrain: ['river', 'inland'], title: '川沿いに堤防を 6 区画築く', how: '［道路を引く］→［堤防］を、川に面した低い土地に。大雨の浸水が減ります', reward: { cash: 1500 }, done: s => (s.levee?.length ?? 0) >= 6 },
  { id: 't-lake', terrain: ['lake'], title: '湖畔に人を呼ぶ施設をつくる', how: '［施設を建てる］→［レジャー］や［自然］を湖のそばに。来訪者と知名度が上がります', reward: { cash: 2000, fame: 2 }, done: s => s.buildings.some(b => b.status === 'operating' && ['leisure', 'nature'].includes(DEFS[b.kind].cat)) },
  { id: 't-rural', terrain: ['rural', 'mountain'], title: 'バス路線を開く', how: 'バス停を 2 つ以上置き、［市政］→［バス路線］で起点と終点を選びます。車のない高齢者の暮らしを支えます', reward: { cash: 1500, approval: 0.01 }, done: s => (s.pol?.routes?.length ?? 0) > 0 },
  { id: 't-mount', terrain: ['mountain'], title: '道の駅をつくる', how: '［施設を建てる］で道の駅を、幹線の道路沿いに。農産物が売れ、来訪者も来ます', reward: { cash: 1500, fame: 1 }, done: s => has(s, 'michinoeki') },
  { id: 't-urban', terrain: ['urban'], title: 'タワーマンションか超高層ビルを建てる', how: '駅前を高度利用します。地価が上がり、固定資産税も増えます', reward: { cash: 4000, fame: 2 }, done: s => has(s, 'towerMansion', 'skyscraper', 'hqTower') },
  { id: 't-island', terrain: ['island'], title: '港を整える', how: '［施設を建てる］で港か漁港を、海に面した所に。島の暮らしと観光の玄関口です', reward: { cash: 2500, fame: 1 }, done: s => has(s, 'port', 'fishPort') },
);
MISSIONS.splice(MISSIONS.findIndex(m => m.id === 'pop10k'), 0,
  { id: 'budget', title: '3 月議会で予算を可決してもらう', how: '［市政］で予算案を選び、賛成が足りなければ会派と意見交換します', reward: { cash: 1000, approval: 0.01 }, done: s => !!s.pol?.vote?.pass },
  { id: 'grant', title: '国の補助金を採択してもらう', how: '［市政］→［国・県との交渉］で条件に合う補助金を申請します（審査 3 か月）', reward: { cash: 0, fame: 1 }, done: s => s.acts.grantOk !== undefined },
);
// v88：無人島の開拓の段階（上陸 → 道 → 水 → 電気 → 住まい → 食べ物 → 通信と医療 → ごみ → 発展）
MISSIONS.splice(0, 0, ...ISLE_STEPS.map(x => ({ id: 'i-' + x.key, terrain: ['castaway'], title: x.title, how: x.how, reward: { cash: x.reward, fame: x.key === 'grow' ? 4 : undefined }, done: (s: GameState) => x.done(s) })));
/** この街の初仕事（地形に合うもの） */
export const missionsFor = (s: GameState) => { const t = terrainOf(s.seed).id; return MISSIONS.filter(m => !m.terrain || (!REAL && m.terrain.includes(t))); };
const MILESTONES = [10000, 20000, 30000, 50000, 100000];
function monthlyMissions(s: GameState): void {
  if (!s.missionBase) s.missionBase = { roads: cntRoad(s), zoned: cntZoned(s), hh: Math.round(s.stats.households), shops: cntShops(s), parks: cntParks(s) };
  const done = s.missions ?? (s.missions = []);
  for (const m of missionsFor(s)) {
    if (done.includes(m.id) || !m.done(s, s.missionBase)) continue;
    done.push(m.id);
    s.cash += m.reward.cash; s.pending.other -= m.reward.cash; // ごほうびは「その他」の収入として記録
    if (m.reward.approval) s.approval = Math.min(0.98, s.approval + m.reward.approval);
    if (m.reward.fame) s.fame = Math.min(100, (s.fame ?? 0) + m.reward.fame);
    s.notes.push(`市長の初仕事「${m.title}」を達成しました！${m.reward.cash ? `国の地域づくり交付金 ${m.reward.cash.toLocaleString()} 万円` : ''}${m.reward.approval ? '・支持率アップ' : ''}${m.reward.fame ? '・知名度アップ' : ''}`);
  }
  // 人口の節目：前の月より上で、はじめて越えた節目を祝う
  const prev = s.history.length >= 2 ? s.history[s.history.length - 2].pop : 0;
  for (const k of MILESTONES) if (prev < k && s.stats.pop >= k && (s.peakPop ?? 0) <= s.stats.pop + 1) { s.celeb = { kind: 'milestone', month: s.month, label: `人口 ${(k / 10000).toLocaleString()} 万人突破` }; s.notes.push(`祝・人口 ${(k / 10000).toLocaleString()} 万人突破！ 記念の花火が上がります`); s.approval = Math.min(0.98, s.approval + 0.01); }
}
/** 住民の声：不満が 3 か月以上続いたあとに消えたら、お礼の声にする（6 か月表示） */
const THANKS: Record<string, string> = {
  care: '保育園に入れて、仕事に戻れました。ほんとうに助かっています！', traffic: '朝の道がずいぶん空きました。子どもの送りも楽になりました。', crime: '夜道が明るくなって、安心して歩けます。',
  water: '水道が安定して、毎日の暮らしが楽になりました。', waterOld: '古い水道管が直って、にごり水が出なくなりました。', sewage: '川のにおいがなくなりました。', health: '近くに病院ができて、通院が楽になりました。',
  noHosp: '市内で入院できるようになり、家族も安心です。', sick: '体調を崩しても、すぐ診てもらえるようになりました。', elder: '親を近くの施設に預けられて、本当に助かりました。', lonely: '見守りの人が来てくれて、話し相手ができました。',
  park: '近くに公園ができて、子どもが外で遊べるようになりました。', shop: '歩いて行ける所に店ができて、買物が楽になりました。', housing: 'やっと市内で住む家が見つかりました。', jhs: '中学校が近くなって、通学が安心です。',
  env: '空気がきれいになった気がします。洗濯物も外に干せます。', flood: '大雨の日も、もう怖くありません。', fire: '消防署が近くなって安心です。', power: '電気が安定しました。', gas: '都市ガスが来て、料金が安くなりました。',
  waste: 'ごみの収集がちゃんと来るようになりました。', crem: '市内の斎場で、家族を見送ることができました。', nimby: '家の近くの迷惑な施設の問題が片づきました。', roadAge: '道路のでこぼこが直って、自転車で走りやすくなりました。',
  conn: '家の前まで道路がつながりました！', noPolice: '近くに交番ができて安心です。', aging: '年をとっても、この街で暮らしていけそうです。',
};
function trackVoices(s: GameState): void {
  const seen = s.voiceSeen ?? (s.voiceSeen = {}), now = new Set<string>();
  for (const v of voiceList(s)) { if (v.key.startsWith('thanks') || v.key === 'careOk' || v.key === 'fame') continue; now.add(v.key); if (!seen[v.key]) seen[v.key] = { since: s.month, who: v.who, text: v.text.slice(0, 60) }; }
  const th = s.thanks ?? (s.thanks = []), n0 = th.length;
  for (const k of Object.keys(seen)) {
    if (now.has(k)) continue;
    const o = seen[k], months = s.month - o.since; delete seen[k];
    if (months < 3) continue;
    const base = k.replace(/[0-9]+$/, '');
    th.push({ key: k, month: s.month, who: o.who, text: THANKS[base] ?? '前より暮らしやすくなりました。市長さん、ありがとう。', was: o.text, months });
    s.notes.push(`住民の声：${months} か月続いた「${o.text.slice(0, 24)}…」の不満が解消しました`);
  }
  s.thanks = th.filter(t => s.month - t.month <= 6).slice(-6);
  if (th.length !== n0) refreshVoices(s);
}

/** 知らせに場所を付ける（画面で「地図で見る」に使う。\u0001 のあとに区画の番号） */
export const noteAt = (b: { x: number; y: number; w?: number; h?: number }) => `\u0001${(b.y + Math.floor((b.h ?? 1) / 2)) * W + b.x + Math.floor((b.w ?? 1) / 2)}`;
/** 民間施設の成長：景気がよく、街が大きいと、誘致した企業・レジャー施設が自分で増設する（レベル 3 まで） */
function bizGrowth(s: GameState): void {
  // テレビ局があると、ときどき特集で街が紹介される
  const tv = s.buildings.find(b => b.kind === 'tvStation' && b.status === 'operating');
  if (tv && rngNext(s) < 0.04) { s.fame = Math.min(100, (s.fame ?? 0) + 1.5); s.notes.push(`📺 ローカルテレビ局の特集「${pickTv(s)}」で${s.cityName}が紹介され、知名度が上がりました${noteAt(tv)}`); }
  if (s.stats.pop < 8000) return;
  const cyc = s.econ?.cycle ?? 0;
  for (const b of s.buildings) {
    const d = DEFS[b.kind];
    if (d.build !== 'invite' || b.status !== 'operating' || !b.connected || lvOf(b) >= 3 || s.month - b.builtMonth < 24) continue;
    const p = 0.004 * (1 + cyc) * Math.min(1.5, s.stats.pop / 30000) * (lvOf(b) === 2 ? 0.6 : 1);
    if (rngNext(s) >= p) continue;
    b.lv = lvOf(b) + 1; s.bVersion++;
    s.notes.push(`📈 ${d.name}が業績好調で増設しました（レベル ${b.lv}「${stageName(b.kind, b.lv)}」）。雇用と税が増えます${noteAt(b)}`);
  }
}
const TV = ['住みたい街の新しい顔', '週末のおでかけスポット', '子育てにやさしい街', '地元グルメ探訪', '市長に聞く', '街の名所を歩く', '駅前の今と昔'];
const pickTv = (s: GameState) => TV[Math.floor(rngNext(s) * TV.length) % TV.length];
