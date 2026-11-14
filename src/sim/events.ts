// イベント定義。発生条件は街の状態に連動し、確率・再発待ち・選択肢・費用・即時効果・遅延効果・終結条件を持つ。
import { noteDisaster } from './politics';
import { DEFS, P, isShop, isRes, isCity, fam, W, H, SCALE, diffOf, hasOp, SPORTS } from './config';
import { DISTRICTS } from './types';
import { REAL, onMapChange } from './real';
import { getMap, idx, buildable, isCastaway } from './map';
import { foodSelf } from './isle';
import { addTeam } from './step';
import { modAdd, modMul, staffReq, accessTile, recompute, floodRisk, sumHH, designCap } from './core';
import { rngNext } from './rng';
import type { GameState, Effect, EventInstance, Building, Result } from './types';
import { tsunamiDepth, evacOK, liquefyRisk, hasSea, SEAWALL_H } from './hazard';

export interface EventOption { label: string; cost: number; desc: string; effects: Effect[] }
export interface EventDef {
  id: string;
  title: string;
  /** 発生条件。満たしていれば対象と状況説明を返す */
  cond: (s: GameState) => { target: number; detail: string } | null;
  /** 条件を満たした月あたりの発生確率 */
  prob: number;
  /** 再発待ち（月） */
  cooldown: number;
  /** 条件がこの月数続いてから発生 */
  minStreak: number;
  /** 選ばずにいると、この月数で最後の選択肢として終結する */
  expire: number;
  options: EventOption[];
  /** 起きた瞬間に街へ及ぶ影響（災害の被害など）。説明に足す文を返す */
  hit?: (s: GameState, target: number) => string;
  /** 一度だけ起きる */
  once?: boolean;
}

const TSP = ['soccer', 'baseball', 'basket'] as const;
/** 条件に合うプロチームを 1 つ（本拠地で試合をしているチームのうち、乱数で選ぶ）。乱数は条件を見るたびに使わないよう月で決める */
const teamPick = (s: GameState, f: (t: NonNullable<GameState['teams']>[number]) => boolean) => { const l = (s.teams ?? []).filter(t => SPORTS[t.sport] && s.buildings.some(b => SPORTS[t.sport].venue.includes(b.kind) && b.status === 'operating') && f(t)); return l.length ? l[s.month % l.length] : null; };
const cityNursery = (s: GameState) => s.buildings.filter(b => fam(b.kind) === 'care' && isCity(b.kind) && b.status === 'operating');
import { threatLv } from './threats';
const r0 = (v: number) => Math.round(v);
/** できごとの起きる月を、地図の種と月から決める（0〜1） */
const hh = (s: GameState, k: number) => { const v = Math.sin(s.seed * 0.0137 * k + s.month * (1.37 + k * 0.211) + k * 7.7) * 43758.5453; return v - Math.floor(v); };

export const EVENTS: EventDef[] = [
  // ---- v33：事件（犯罪）とスパイ ----
  {
    id: 'murder', title: '市内で殺人事件が起きた', prob: 0.02, cooldown: 60, minStreak: 0, expire: 3,
    cond: s => (s.month >= 24 && s.stats.pop >= 8000 ? { target: -1, detail: `住宅街で殺人事件が起き、容疑者は逃走中です。住民の不安が高まり、報道陣が集まっています（治安の水準 ${Math.round((1 - Math.min(1, s.stats.crime ?? 0)) * 100)}）。` } : null),
    options: [
      { label: '警察と連携し、見回りと防犯カメラを強める', cost: 1500, desc: '1,500 万円。2 年間、治安がよくなり、支持率が少し上がります。', effects: [{ t: 'cash', v: -1500, label: '防犯の強化' }, { t: 'mod', key: 'safety', op: 'add', v: 0.012, months: 24 }, { t: 'approval', v: 0.01 }] },
      { label: '住民説明会と、子どもの見守りを呼びかける', cost: 200, desc: '200 万円。半年間、子育て世帯の不安が少しやわらぎます。', effects: [{ t: 'cash', v: -200, label: '説明会と見守り' }, { t: 'sat', who: [2, 3], v: 0.004, months: 6 }] },
      { label: '捜査は警察に任せる', cost: 0, desc: '半年間、住民の不安で暮らしの満足が下がります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.006, months: 6 }] },
    ],
  },
  {
    id: 'tokuryu', title: '闇バイトの強盗・特殊詐欺（匿名・流動型犯罪グループ）', prob: 0.03, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => (s.month >= 24 && s.stats.pop >= 5000 && (s.stats.aging ?? 0) > 0.12 ? { target: -1, detail: 'SNS の「高額バイト」で集められた若者による強盗と、高齢者をねらう特殊詐欺が相次いでいます。指示役は匿名で、すぐに入れ替わります。' } : null),
    options: [
      { label: '詐欺対策の電話機の補助と、ATM の見守り', cost: 800, desc: '800 万円。3 年間、高齢世帯の満足と治安が上がります。', effects: [{ t: 'cash', v: -800, label: '特殊詐欺の対策' }, { t: 'mod', key: 'safety', op: 'add', v: 0.008, months: 36 }, { t: 'sat', who: [4], v: 0.005, months: 36 }] },
      { label: '学校と SNS で「闇バイト」の危険を伝える', cost: 300, desc: '300 万円。2 年間、治安が少しよくなります。', effects: [{ t: 'cash', v: -300, label: '闇バイトの注意喚起' }, { t: 'mod', key: 'safety', op: 'add', v: 0.005, months: 24 }] },
      { label: '様子を見る', cost: 0, desc: '1 年間、高齢世帯の不安が高まります。', effects: [{ t: 'sat', who: [4], v: -0.008, months: 12 }] },
    ],
  },
  {
    id: 'spy', title: '総領事館の職員にスパイの疑い', prob: 0.04, cooldown: 120, minStreak: 0, expire: 3,
    cond: s => (s.buildings.some(b => b.kind === 'consulate' && b.status === 'operating') ? { target: -1, detail: '市内の外国の総領事館の職員が、先端技術の会社の情報を集めていた疑いで、警察が調べています。国どうしの問題になりそうです。' } : null),
    options: [
      { label: '国に任せ、交流は続ける', cost: 0, desc: '知名度が少し下がりますが、国際交流は続きます。', effects: [{ t: 'fame', v: -2 }] },
      { label: '企業の情報管理を支援する', cost: 1000, desc: '1,000 万円。3 年間、企業が安心して来やすくなります。', effects: [{ t: 'cash', v: -1000, label: '情報セキュリティの支援' }, { t: 'mod', key: 'bizIncentive', op: 'add', v: 0.05, months: 36 }] },
      { label: '交流行事をしばらく中止する', cost: 0, desc: '支持率は少し上がりますが、1 年間、来訪者が減ります。', effects: [{ t: 'approval', v: 0.008 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.97, months: 12 }] },
    ],
  },
  // ---- v31：市長の決断（数年に 1 度の大きな二択。結果は数年後に響く） ----
  {
    id: 'dFactory', title: '【決断】大型工場の誘致か、里山の保全か', prob: 0.05, cooldown: 120, minStreak: 0, expire: 6,
    cond: s => (s.month >= 36 && s.stats.pop >= 8000 ? { target: -1, detail: '大手メーカーが、北の里山を造成した工場用地を探しています。雇用は 1,000 人規模。一方、里山を守る市民団体は反対の署名を集めています。' } : null),
    options: [
      { label: '誘致する', cost: 0, desc: '立地の補助金として国から 3,000 万円。5 年間、景気と転入が伸びます。ただし 2 年後から、渋滞と空気の悪化で暮らしの満足が下がります。', effects: [{ t: 'cash', v: 3000, label: '工場立地の補助' }, { t: 'mod', key: 'econ', op: 'mul', v: 1.03, months: 60 }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.03, months: 60 }, { t: 'mod', key: 'sat:all', op: 'add', v: -0.01, months: 48, delay: 24 }] },
      { label: '里山を守る', cost: 0, desc: '支持率が上がり、5 年間、暮らしの満足が少し上がります。1 年後から、自然を目当ての来訪者が増えます。', effects: [{ t: 'approval', v: 0.015 }, { t: 'mod', key: 'sat:all', op: 'add', v: 0.005, months: 60 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.04, months: 60, delay: 12 }] },
    ],
  },
  {
    id: 'dStation', title: '【決断】駅前の大型再開発か、商店街の保存か', prob: 0.05, cooldown: 120, minStreak: 0, expire: 6,
    cond: s => (s.month >= 48 && s.stats.pop >= 10000 ? { target: -1, detail: 'デベロッパーが、駅前の古い商店街を高層ビルと広場に建て替える計画を持ち込みました。商店街の店主の多くは反対しています。' } : null),
    options: [
      { label: '再開発を進める', cost: 6000, desc: '6,000 万円。1 年は反対の声で支持率が下がりますが、2 年後から 6 年間、景気・転入・知名度が伸びます。', effects: [{ t: 'cash', v: -6000, label: '駅前再開発の負担' }, { t: 'mod', key: 'approval', op: 'add', v: -0.02, months: 12 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.04, months: 72, delay: 24 }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.04, months: 72, delay: 24 }, { t: 'fame', v: 3 }] },
      { label: '商店街を守り、磨く', cost: 1500, desc: '1,500 万円で街並みを整えます。来訪者と満足が上がりますが、2 年後から景気が少し伸び悩みます。', effects: [{ t: 'cash', v: -1500, label: '商店街の修景' }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.03, months: 60 }, { t: 'mod', key: 'sat:all', op: 'add', v: 0.004, months: 60 }, { t: 'mod', key: 'econ', op: 'mul', v: 0.99, months: 48, delay: 24 }] },
    ],
  },
  {
    id: 'dHospital', title: '【決断】病院の再編（統合）か、地域の病院の維持か', prob: 0.04, cooldown: 120, minStreak: 0, expire: 6,
    cond: s => (s.month >= 36 && s.buildings.filter(b => (b.kind === 'hospital' || b.kind === 'clinic') && b.status === 'operating').length >= 2 ? { target: -1, detail: '県から、医師不足のため市内の病院を 1 つに統合する案が示されました。統合すれば高度な医療ができますが、遠くなる地区もあります。' } : null),
    options: [
      { label: '統合する', cost: 0, desc: '6 年間、事務費と維持費が 2% 下がり、2 年後から医療の水準が上がります。3 年間、高齢世帯の満足が下がります。', effects: [{ t: 'mod', key: 'prices', op: 'mul', v: 0.98, months: 72 }, { t: 'mod', key: 'health', op: 'add', v: 0.012, months: 72, delay: 24 }, { t: 'mod', key: 'sat:4', op: 'add', v: -0.01, months: 36 }] },
      { label: '地域の病院を維持する', cost: 0, desc: '5 年間、毎月 150 万円の支援が要ります。高齢世帯の満足が上がります。', effects: [{ t: 'mod', key: 'sat:4', op: 'add', v: 0.006, months: 60, cost: 150 }] },
    ],
  },
  {
    id: 'dWaste', title: '【決断】広域のごみ処理場を受け入れるか', prob: 0.04, cooldown: 120, minStreak: 0, expire: 6,
    cond: s => (s.month >= 36 && s.stats.pop >= 6000 ? { target: -1, detail: '近隣の市町と共同で使う大きなごみ処理場の建設地として、市の南部が候補に挙がりました。受け入れれば交付金が入ります。' } : null),
    options: [
      { label: '受け入れる', cost: 0, desc: '交付金 8,000 万円。5 年間、ごみの処理能力が大きく増えます。2 年間、反対の声で支持率が下がります。', effects: [{ t: 'cash', v: 8000, label: '処理場の受け入れ交付金' }, { t: 'mod', key: 'wasteCap', op: 'add', v: 3000, months: 60 }, { t: 'mod', key: 'approval', op: 'add', v: -0.03, months: 24 }] },
      { label: '断る', cost: 0, desc: '地元の住民に喜ばれ、支持率が少し上がります。', effects: [{ t: 'approval', v: 0.01 }] },
    ],
  },
  {
    id: 'dForeign', title: '【決断】外国人材の受け入れを広げるか', prob: 0.04, cooldown: 120, minStreak: 0, expire: 6,
    cond: s => (s.month >= 48 && s.stats.localJobs > s.stats.workers * 0.5 ? { target: -1, detail: '工場や介護の現場から、人手不足を外国人材で補いたいという要望が出ています。受け入れるなら、住まい探し・日本語学習・労働相談の体制が要ります。' } : null),
    options: [
      { label: '受け入れを広げる', cost: 800, desc: '800 万円で、通訳つきの相談窓口と住まいの入居支援を整えます。5 年間、転入と景気が伸び、行政サービスへのアクセスが少し上がります。ごみ出しや騒音の行き違いは、手引きと相談で早めにほどけます。', effects: [{ t: 'cash', v: -800, label: '通訳つきの相談窓口と入居支援' }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.04, months: 60 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.01, months: 60 }, { t: 'mod', key: 'access', op: 'add', v: 0.05, months: 60 }] },
      { label: '慎重に進める', cost: 0, desc: 'いまは何も変わりません。2 年後から、人手不足で景気が少し伸び悩みます。', effects: [{ t: 'mod', key: 'econ', op: 'mul', v: 0.99, months: 48, delay: 24 }] },
    ],
  },
  {
    id: 'dHall', title: '【決断】新しい市庁舎を建てるか、耐震改修で使い続けるか', prob: 0.03, cooldown: 120, minStreak: 0, expire: 6,
    cond: s => (s.month >= 60 ? { target: -1, detail: '築 50 年の市庁舎が、耐震基準を満たしていないことがわかりました。建て替えか、改修か。' } : null),
    options: [
      { label: '新庁舎を建てる', cost: 9000, desc: '9,000 万円。知名度が上がり、2 年後から 10 年間、事務の効率化で経費が 2% 下がります。', effects: [{ t: 'cash', v: -9000, label: '新庁舎の建設' }, { t: 'fame', v: 2 }, { t: 'mod', key: 'prices', op: 'mul', v: 0.98, months: 120, delay: 24 }] },
      { label: '耐震改修で使い続ける', cost: 2500, desc: '2,500 万円。10 年間、災害の被害が少し小さくなります。', effects: [{ t: 'cash', v: -2500, label: '庁舎の耐震改修' }, { t: 'mod', key: 'disasterDmg', op: 'mul', v: 0.97, months: 120 }] },
    ],
  },
  {
    id: 'careStaff', title: '保育士が足りず、定員を埋められない', prob: 0.5, cooldown: 12, minStreak: 2, expire: 4,
    cond: s => {
      const n = cityNursery(s).find(b => (b.staff ?? 0) + modAdd(s, 'tempStaff:' + b.id) < staffReq(s, b) * 0.8);
      return n ? { target: n.id, detail: `${DEFS[n.kind].name}の保育士は ${(n.staff ?? 0).toFixed(1)} 人で、必要な ${r0(staffReq(s, n))} 人に届きません。建物の定員 ${DEFS[n.kind].capacity} 人に対し、受け入れられるのは ${r0(n.effCap)} 人です。` } : null;
    },
    options: [
      { label: '処遇改善手当を出す', cost: 0, desc: '月 90 万円を 12 か月。保育士の採用が 1.8 倍になります。効果は採用が進むにつれて出ます。', effects: [{ t: 'mod', key: 'hire:保育士', op: 'mul', v: 1.8, months: 12, cost: 90 }] },
      { label: '派遣保育士で一時対応する', cost: 600, desc: '600 万円。この園に 6 か月間、4 人分の応援が入ります。期間が過ぎると元に戻ります。', effects: [{ t: 'cash', v: -600, label: '派遣保育士' }, { t: 'tempStaff', n: 4, months: 6 }] },
      { label: '受け入れを絞って運営する', cost: 0, desc: '費用なし。待機は解消せず、子育て世帯の不満が半年続きます。', effects: [{ t: 'sat', who: [2], v: -0.03, months: 6 }] },
    ],
  },
  {
    id: 'mansionBoom', title: '駅前の入居増で保育が足りない', prob: 0.4, cooldown: 24, minStreak: 2, expire: 4,
    cond: s => (s.stats.waitlist >= 30 && s.stats.waitDistrict[0] >= 12 && s.month >= 5 && s.buildings.some(b => b.kind === 'privNursery' && b.status === 'operating'))
      ? { target: s.buildings.find(b => b.kind === 'privNursery' && b.status === 'operating')!.id, detail: `${REAL ? DISTRICTS[s.stats.waitDistrict.indexOf(Math.max(...s.stats.waitDistrict))] : '駅前'}地区の待機が ${r0(REAL ? Math.max(...s.stats.waitDistrict) : s.stats.waitDistrict[0])} 人、市全体で ${r0(s.stats.waitlist)} 人になりました。マンションに入居した子育て世帯から要望書が出ています。` } : null,
    options: [
      { label: '私立園の定員拡大を支援する', cost: 2500, desc: '2,500 万円。運営法人と協議し、8 か月後に私立保育園の定員が 30 人増えます（職員も法人が増やします）。', effects: [{ t: 'cash', v: -2500, label: '私立園の増築補助' }, { t: 'expandPrivNursery', add: 30, delay: 8 }] },
      { label: '高層住宅の着工を 12 か月抑える', cost: 0, desc: '費用なし。駅前の高層住宅の着工が 8 割減ります。需要は減らないので、家賃負担が上がりやすくなります。', effects: [{ t: 'mod', key: 'dev:3', op: 'mul', v: 0.2, months: 12 }] },
      { label: '様子を見る', cost: 0, desc: '費用なし。何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'ownerRetire', title: '商店主が引退を考えている', prob: 0.12, cooldown: 14, minStreak: 0, expire: 3,
    cond: s => {
      let best: Building | null = null;
      for (const b of s.buildings) if ((b.kind === 'shop' || b.kind === 'bakery') && b.status === 'operating' && !b.sandbox && s.month - b.builtMonth >= 30 && (!best || b.builtMonth < best.builtMonth)) best = b;
      return best && s.month >= 8 ? { target: best.id, detail: `長く続いた${DEFS[best.kind].name}の店主が高齢になり、後継ぎがいません。月売上は ${r0(best.revenue)} 万円で、店そのものは${best.revenue * P.margin >= DEFS[best.kind].fixed! ? '黒字' : '赤字'}です。` } : null;
    },
    options: [
      { label: '事業承継を支援する', cost: 300, desc: '300 万円。後継者探しと改装を支援し、店は続きます。', effects: [{ t: 'cash', v: -300, label: '事業承継支援' }, { t: 'keepShop' }] },
      { label: '見守る', cost: 0, desc: '費用なし。6 割の見込みで閉店します。空いた区画には、需要があれば別の店が入ります。', effects: [{ t: 'closeShop', prob: 0.6 }] },
    ],
  },
  {
    id: 'bigStore', title: '大型スーパーの出店提案', prob: 0.25, cooldown: 36, minStreak: 0, expire: 4,
    cond: s => {
      if (s.stats.pop < 5200 || s.stats.shopLevel > 0.8 || s.month < 10) return null;
      const t = findStoreSite(s);
      return t >= 0 ? { target: t, detail: `人口が ${r0(s.stats.pop)} 人になり、事業者が幹線沿いの空き地に出店を打診してきました。現在、買物支出のうち市内で使われているのは ${r0(s.stats.shopLevel * 100)}% です。` } : null;
    },
    options: [
      { label: '受け入れる', cost: 0, desc: '用途を商業に変更。5 か月後に開店します。買物の便と雇用は増えますが、商圏が重なる店は売上が減ります。', effects: [{ t: 'openStore', kind: 'supermarket', delay: 0 }] },
      { label: '地元店との共存を条件に受け入れる', cost: 400, desc: '協議費 400 万円。開店に加え、既存店が赤字に耐える期間が 24 か月のあいだ 6 か月延びます。', effects: [{ t: 'cash', v: -400, label: '出店協議' }, { t: 'openStore', kind: 'supermarket', delay: 0 }, { t: 'mod', key: 'shopGrace', op: 'add', v: 6, months: 24 }] },
      { label: '断る', cost: 0, desc: '費用なし。何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'waterAging', title: '水道設備の老朽化が進んでいる', prob: 0.5, cooldown: 12, minStreak: 0, expire: 3,
    cond: s => {
      const w = s.buildings.find(b => fam(b.kind) === 'water' && b.status === 'operating' && b.age >= 82);
      return w ? { target: w.id, detail: `${DEFS[w.kind].name}の老朽度が ${r0(w.age)} になり、ポンプの故障が続いています。処理能力は設計の ${r0(w.effCap / DEFS[w.kind].capacity * 100)}% まで落ちています。` } : null;
    },
    options: [
      { label: '更新工事を始める', cost: DEFS.water.renewCost, desc: `${DEFS.water.renewCost.toLocaleString()} 万円、工期 ${DEFS.water.renewMonths} か月。工事中は能力が ${DEFS.water.renewFactor * 100}% になり、完了すると老朽度が 0 に戻ります。`, effects: [{ t: 'renew', kind: 'water' }] },
      { label: '緊急修繕でしのぐ', cost: 3000, desc: '3,000 万円。老朽度が 15 下がります。数年で同じ状態に戻ります。', effects: [{ t: 'cash', v: -3000, label: '水道の緊急修繕' }, { t: 'age', kind: 'water', dv: -15 }] },
      { label: '先送りする', cost: 0, desc: '費用なし。漏水が増え、12 か月のあいだ処理能力がさらに 12% 下がります。', effects: [{ t: 'mod', key: 'waterCap', op: 'mul', v: 0.88, months: 12 }] },
    ],
  },
  {
    id: 'congestion', title: '通勤時間帯の渋滞に陳情', prob: 0.4, cooldown: 18, minStreak: 3, expire: 4,
    cond: s => {
      if (s.stats.maxVc < 1.15) return null;
      let wi = -1, wv = 0; for (let i = 0; i < W * H; i++) if (s.road[i] && s.road[i] !== 3 && s.vc[i] > wv) { wv = s.vc[i]; wi = i; }
      return { target: wi, detail: `最も混む市道の混雑率が ${r0(s.stats.maxVc * 100)}% の状態が続き、自治会から陳情が出ました。通勤の所要時間は空いているときの ${s.stats.avgDelay.toFixed(2)} 倍です。` };
    },
    options: [
      { label: '交差点を改良する', cost: 1800, desc: '1,800 万円。4 か月後、最も混む区間とその前後の容量が 25% 増えます。別の経路をつくるほどの効果はありません。', effects: [{ t: 'cash', v: -1800, label: '交差点改良' }, { t: 'roadBoost', v: 1.25, delay: 4 }] },
      { label: '時差出勤を呼びかける', cost: 0, desc: '月 40 万円を 12 か月。朝の集中が 7% 和らぎます。', effects: [{ t: 'mod', key: 'peakTrips', op: 'mul', v: 0.93, months: 12, cost: 40 }] },
      { label: '見送る', cost: 0, desc: '費用なし。単身・夫婦世帯の不満が半年続きます。', effects: [{ t: 'sat', who: [0, 1], v: -0.02, months: 6 }] },
    ],
  },
  {
    id: 'rent', title: '住宅不足で家賃が上がっている', prob: 0.35, cooldown: 18, minStreak: 3, expire: 4,
    cond: s => (s.stats.vacancy < 0.025 && s.stats.pentUp > 4) ? { target: -1, detail: `空き住戸が ${(s.stats.vacancy * 100).toFixed(1)}% まで減り、入居できない転入希望が月 ${r0(s.stats.pentUp)} 世帯あります。収入の低い世帯ほど住居費の負担が重くなっています。` } : null,
    options: [
      { label: '家賃補助を出す', cost: 0, desc: '月 160 万円を 12 か月。収入の低い世帯を中心に住宅負担が軽くなります。住宅そのものは増えません。', effects: [{ t: 'mod', key: 'housingAid', op: 'add', v: 0.1, months: 12, cost: 160 }] },
      { label: '住宅開発の手続きを早める', cost: 200, desc: '200 万円。12 か月のあいだ、住宅用途の区画での民間着工が 1.5 倍になります。区画と道路が要ります。', effects: [{ t: 'cash', v: -200, label: '開発手続きの迅速化' }, { t: 'mod', key: 'dev:all', op: 'mul', v: 1.5, months: 12 }] },
      { label: '見送る', cost: 0, desc: '費用なし。何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'parkNoise', title: '公園の音をめぐる意見の違い', prob: 0.15, cooldown: 30, minStreak: 0, expire: 3,
    cond: s => {
      const p = s.buildings.find(b => fam(b.kind) === 'park' && b.status === 'operating' && b.used >= 110);
      return p && s.month >= 9 ? { target: p.id, detail: `近くに約 ${r0(p.used)} 世帯が住む公園で、夕方の子どもの声とボール遊びについて、高齢の住民と子育て世帯の双方から意見が届いています。どちらも毎日の生活に関わる話です。` } : null;
    },
    options: [
      { label: '説明会を開いて利用ルールを決める', cost: 80, desc: '80 万円。2 か月後から 12 か月、子育て世帯と高齢世帯の両方の満足が少し上がります。', effects: [{ t: 'cash', v: -80, label: '住民説明会' }, { t: 'sat', who: [2, 3, 4], v: 0.012, months: 12, delay: 2 }] },
      { label: '夕方以降の利用を制限する', cost: 0, desc: '費用なし。高齢世帯の満足は上がり、子育て世帯は下がります（12 か月）。', effects: [{ t: 'sat', who: [4], v: 0.02, months: 12 }, { t: 'sat', who: [2, 3], v: -0.03, months: 12 }] },
      { label: '何もしない', cost: 0, desc: '費用なし。高齢世帯の不満が半年続きます。', effects: [{ t: 'sat', who: [4], v: -0.02, months: 6 }] },
    ],
  },
  {
    id: 'wasteOver', title: 'ごみ収集が追いつかない', prob: 0.5, cooldown: 14, minStreak: 2, expire: 3,
    cond: s => s.stats.wasteDemand > s.stats.wasteCap + 1 ? { target: -1, detail: `収集需要 ${r0(s.stats.wasteDemand)} 世帯に対し、収集能力は ${r0(s.stats.wasteCap)} 世帯です。集積所に残るごみが増えています。` } : null,
    options: [
      { label: '収集の委託を増やす', cost: 0, desc: '月 120 万円を 12 か月。収集能力が 400 世帯分増えます。', effects: [{ t: 'mod', key: 'wasteCap', op: 'add', v: 400, months: 12, cost: 120 }] },
      { label: '分別・減量を呼びかける', cost: 250, desc: '250 万円。3 か月後から 24 か月、収集需要が 10% 減ります。', effects: [{ t: 'cash', v: -250, label: '分別・減量の啓発' }, { t: 'mod', key: 'wasteDemand', op: 'mul', v: 0.9, months: 24, delay: 3 }] },
      { label: '何もしない', cost: 0, desc: '費用なし。不足が続くと水道・ごみの満足が下がったままになります。', effects: [] },
    ],
  },
  {
    id: 'fireDelay', title: '火災で消防の到着が遅れた', prob: 0.3, cooldown: 18, minStreak: 1, expire: 3,
    cond: s => s.stats.fireCover < 0.85 && s.stats.households > 100 ? { target: -1, detail: `消防署の到達範囲に入っている世帯は ${r0(s.stats.fireCover * 100)}% です。範囲の外で住宅火災があり、到着まで時間がかかりました。けが人はいませんでした。` } : null,
    options: [
      { label: '消防団の装備を支援する', cost: 0, desc: '月 60 万円を 24 か月。到達範囲が 20% 広がります。', effects: [{ t: 'mod', key: 'fireRange', op: 'mul', v: 1.2, months: 24, cost: 60 }] },
      { label: '被災世帯の住まいを支援する', cost: 400, desc: '400 万円。6 か月のあいだ全世帯の満足が少し上がります。到達範囲は変わりません。', effects: [{ t: 'cash', v: -400, label: '被災世帯支援' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.01, months: 6 }] },
      { label: '何もしない', cost: 0, desc: '費用なし。高齢世帯の不安が 12 か月続きます。', effects: [{ t: 'sat', who: [4], v: -0.03, months: 12 }] },
    ],
  },
  // ======== v5：災害 ========
  {
    id: 'quake', title: '地震（震度 6 弱）が起きた', prob: 0.0045, cooldown: 120, minStreak: 0, expire: 3,
    cond: s => (s.month >= 6 ? { target: -1, detail: '早朝に強い揺れがありました。古い建物や道路に被害が出ています。' } : null),
    hit: s => damage(s, 'quake', 0.8),
    options: [
      { label: '国・県の支援を受けながら、復旧を急ぐ', cost: 4000, desc: '4,000 万円（国の補助を差し引いた市の負担）。6 か月かけて道路と施設を直し、暮らしの満足の落ち込みが小さくなります。支持率が上がります。', effects: [{ t: 'cash', v: -4000, label: '地震の復旧' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.015, months: 6 }, { t: 'approval', v: 0.04 }, { t: 'age', kind: 'school', dv: -10 }] },
      { label: '被災した世帯の住まいと生活の再建を手厚く支える', cost: 7000, desc: '7,000 万円。仮設住宅と生活再建の支援。12 か月、転出が減り、満足と支持率が大きく戻ります。', effects: [{ t: 'cash', v: -7000, label: '生活再建の支援' }, { t: 'mod', key: 'outflow', op: 'mul', v: 0.85, months: 12 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.025, months: 12 }, { t: 'approval', v: 0.07 }] },
      { label: '最低限の復旧にとどめる', cost: 1200, desc: '1,200 万円。費用は小さいですが、12 か月、満足が下がり、支持率も下がります。', effects: [{ t: 'cash', v: -1200, label: '地震の応急復旧' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.02, months: 12 }, { t: 'approval', v: -0.05 }] },
    ],
  },
  {
    id: 'flood', title: '台風の大雨で浸水した', prob: 0.04, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => { const m = s.month % 12; return m >= 3 && m <= 6 && s.stats.floodHH >= 5 ? { target: -1, detail: `台風の大雨で川があふれそうになりました。川沿いの低い土地には ${r0(s.stats.floodHH)} 世帯が住んでいます（雨水調整池のある地区は被害が半分）。` } : null; },
    hit: s => damage(s, 'flood', 0.7),
    options: [
      { label: '災害見舞金と復旧、雨水対策の計画づくり', cost: 1800, desc: '1,800 万円。被災世帯を支え、12 か月、満足の落ち込みを抑えます。支持率が上がります。調整池は［施設を建てる］から建てられます。', effects: [{ t: 'cash', v: -1800, label: '浸水の復旧と見舞金' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.01, months: 12 }, { t: 'approval', v: 0.03 }] },
      { label: '道路と公共施設の復旧だけ行う', cost: 700, desc: '700 万円。被災世帯の不満が 12 か月続きます。', effects: [{ t: 'cash', v: -700, label: '浸水の復旧' }, { t: 'sat', who: [2, 3, 4], v: -0.015, months: 12 }, { t: 'approval', v: -0.02 }] },
    ],
  },
  {
    id: 'snow', title: '記録的な大雪', prob: 0.04, cooldown: 12, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 9 && m <= 10 ? { target: -1, detail: '一晩で 30cm を超える雪が積もり、坂道で車が動けなくなっています。バスも止まりました。' } : null; },
    options: [
      { label: '除雪の委託を増やし、すぐに道を開ける', cost: 500, desc: '500 万円。混乱は 1 か月で収まります。', effects: [{ t: 'cash', v: -500, label: '緊急の除雪' }, { t: 'approval', v: 0.01 }] },
      { label: '幹線だけ除雪し、生活道路は住民に協力を頼む', cost: 150, desc: '150 万円。2 か月、朝の交通が 15% 余計に混み、高齢世帯の満足が下がります。', effects: [{ t: 'cash', v: -150, label: '除雪' }, { t: 'mod', key: 'peakTrips', op: 'mul', v: 1.15, months: 2 }, { t: 'sat', who: [4], v: -0.03, months: 2 }] },
    ],
  },
  {
    id: 'heat', title: '猛暑で熱中症が相次いでいる', prob: 0.05, cooldown: 12, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 3 && m <= 4 && s.stats.hhByType[4] > 50 ? { target: -1, detail: `最高気温 38 度の日が続き、高齢の方の熱中症による救急搬送が増えています。高齢世帯は ${r0(s.stats.hhByType[4])} 世帯です。` } : null; },
    options: [
      { label: '公共施設を「涼みどころ」として開放する', cost: 200, desc: '200 万円。2 か月、高齢世帯の満足が上がります。', effects: [{ t: 'cash', v: -200, label: '涼みどころの開設' }, { t: 'sat', who: [4], v: 0.02, months: 2 }] },
      { label: '民生委員と見守りの訪問を強める', cost: 400, desc: '400 万円。2 か月、高齢世帯の満足が上がり、支持率も少し上がります。', effects: [{ t: 'cash', v: -400, label: '高齢者の見守り' }, { t: 'sat', who: [4], v: 0.03, months: 2 }, { t: 'approval', v: 0.01 }] },
      { label: '注意の呼びかけだけ行う', cost: 0, desc: '費用なし。2 か月、高齢世帯の満足が下がります。', effects: [{ t: 'sat', who: [4], v: -0.03, months: 2 }, { t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'epidemic', title: '感染症が流行している', prob: 0.006, cooldown: 120, minStreak: 0, expire: 3,
    cond: s => (s.month >= 12 ? { target: -1, detail: `新しい感染症が広がり、医療の水準 ${r0(s.stats.lv[1] * 100)}% の街で病院がひっ迫し始めています。` } : null),
    options: [
      { label: '検査と接種の体制を整え、医療を支える', cost: 2500, desc: '2,500 万円。6 か月、医療の水準が上がり、来訪者の落ち込みも小さくなります。', effects: [{ t: 'cash', v: -2500, label: '感染症対策' }, { t: 'mod', key: 'health', op: 'add', v: 0.1, months: 6 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.8, months: 6 }, { t: 'approval', v: 0.03 }] },
      { label: '学校・保育・イベントを一時休止する', cost: 300, desc: '300 万円。感染は広がりにくくなりますが、3 か月、子育て世帯の満足が下がり、来訪者が大きく減ります。', effects: [{ t: 'cash', v: -300, label: '休止の対応' }, { t: 'sat', who: [2, 3], v: -0.03, months: 3 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.5, months: 6 }] },
      { label: '国の方針に従うだけにする', cost: 0, desc: '費用なし。6 か月、全世帯の満足と来訪者が下がります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.015, months: 6 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.6, months: 6 }, { t: 'approval', v: -0.03 }] },
    ],
  },
  {
    id: 'bigFire', title: '住宅地で大きな火災', prob: 0.03, cooldown: 24, minStreak: 0, expire: 2,
    cond: s => { if (s.stats.fireCover > 0.92 || s.stats.households < 150) return null; const r = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating').sort((a, b) => a.sv[3] - b.sv[3])[0]; return r ? { target: idx(r.x, r.y), detail: `消防の到達範囲が ${r0(s.stats.fireCover * 100)}% にとどまる中、住宅が密集した所で火災が起き、燃え広がりました。` } : null; },
    hit: (s, t) => damage(s, 'fire', 1, t),
    options: [
      { label: '被災世帯を支え、消防出張所の整備を約束する', cost: 600, desc: '600 万円。支持率の落ち込みが小さくなります。出張所は［施設を建てる］から建てられます。', effects: [{ t: 'cash', v: -600, label: '火災の被災世帯支援' }, { t: 'approval', v: 0.01 }] },
      { label: '消防団の装備を強める', cost: 0, desc: '月 60 万円を 24 か月。消防の到達範囲が 20% 広がります。', effects: [{ t: 'mod', key: 'fireRange', op: 'mul', v: 1.2, months: 24, cost: 60 }] },
    ],
  },
  // ======== 事件・事故 ========
  {
    id: 'accident', title: '通学路で交通事故', prob: 0.03, cooldown: 18, minStreak: 0, expire: 3,
    cond: s => { if (s.stats.maxVc < 1.0 || s.stats.hhByType[3] < 30) return null; let wi = -1, wv = 0; for (let i = 0; i < W * H; i++) if (s.road[i] === 1 && s.vc[i] > wv) { wv = s.vc[i]; wi = i; } return wi >= 0 ? { target: wi, detail: `抜け道として車が増えた生活道路（混雑率 ${r0(wv * 100)}%）で、登校中の小学生が車にはねられ、けがをしました。保護者から対策を求める声が上がっています。` } : null; },
    options: [
      { label: 'ガードレールと歩道を整備し、速度を抑える', cost: 1200, desc: '1,200 万円。24 か月、治安・安全の水準が上がり、支持率も上がります。', effects: [{ t: 'cash', v: -1200, label: '通学路の安全対策' }, { t: 'mod', key: 'safety', op: 'add', v: 0.15, months: 24 }, { t: 'approval', v: 0.02 }] },
      { label: '交通安全教室と見守りボランティア', cost: 80, desc: '80 万円。効果は小さめです。', effects: [{ t: 'cash', v: -80, label: '交通安全教室' }, { t: 'sat', who: [3], v: 0.005, months: 6 }] },
      { label: '警察に取り締まりを頼むだけにする', cost: 0, desc: '費用なし。子育て（就学）世帯の不満が続き、支持率が下がります。', effects: [{ t: 'sat', who: [3], v: -0.02, months: 12 }, { t: 'approval', v: -0.03 }] },
    ],
  },
  {
    id: 'scandal', title: '市の職員の不祥事が報道された', prob: 0.01, cooldown: 36, minStreak: 0, expire: 2,
    cond: s => (s.month >= 4 ? { target: -1, detail: '公金の不適切な使い方が報道されました。市への信頼が揺らいでいます。' } : null),
    options: [
      { label: '市長が謝罪し、処分と再発防止策を示す', cost: 100, desc: '100 万円。支持率は少し下がりますが、すぐに収まります。', effects: [{ t: 'cash', v: -100, label: '再発防止の研修' }, { t: 'approval', v: -0.02 }] },
      { label: '第三者委員会で徹底的に調べる', cost: 500, desc: '500 万円。支持率の落ち込みは最小になります。', effects: [{ t: 'cash', v: -500, label: '第三者委員会' }, { t: 'approval', v: -0.01 }] },
      { label: '担当者の処分だけで済ませる', cost: 0, desc: '費用なし。説明不足と受け取られ、支持率が大きく下がります。', effects: [{ t: 'approval', v: -0.07 }] },
    ],
  },
  {
    id: 'pipeBurst', title: '水道管が破裂し、断水した', prob: 0.04, cooldown: 18, minStreak: 0, expire: 2,
    cond: s => { const w = s.buildings.filter(b => fam(b.kind) === 'water' && b.status === 'operating'); const a = w.length ? Math.max(...w.map(b => b.age)) : 0; return a >= 65 ? { target: -1, detail: `古い水道管が破裂し、半日断水しました。浄水場の老朽度は ${r0(a)} です。` } : null; },
    options: [
      { label: '緊急修理と、管の更新を前倒しする', cost: 2500, desc: '2,500 万円。浄水場の老朽度が 10 下がります。', effects: [{ t: 'cash', v: -2500, label: '水道管の更新' }, { t: 'age', kind: 'water', dv: -10 }, { t: 'age', kind: 'waterS', dv: -10 }, { t: 'age', kind: 'waterL', dv: -10 }] },
      { label: '応急修理で済ませる', cost: 300, desc: '300 万円。6 か月、水を送れる量が 5% 減ります。', effects: [{ t: 'cash', v: -300, label: '応急修理' }, { t: 'mod', key: 'waterCap', op: 'mul', v: 0.95, months: 6 }, { t: 'approval', v: -0.02 }] },
    ],
  },
  {
    id: 'blackout', title: '電力が足りず、停電が起きている', prob: 0.4, cooldown: 12, minStreak: 1, expire: 3,
    cond: s => (s.stats.powerDemand > s.stats.powerCap ? { target: -1, detail: `電力の需要 ${r0(s.stats.powerDemand)} 世帯相当に対し、供給は ${r0(s.stats.powerCap)} 世帯相当です。夕方に停電が起き、新しい住宅や企業が来なくなっています。` } : null),
    options: [
      { label: '電力会社に緊急の増強を要請する', cost: 3000, desc: '3,000 万円（負担金）。12 か月後に供給が 1,500 世帯相当増えます。変電所を［施設を建てる］から求めることもできます。', effects: [{ t: 'cash', v: -3000, label: '電力増強の負担金' }, { t: 'mod', key: 'powerCap', op: 'add', v: 1500 * Math.max(1, SCALE), months: -1, delay: 12 }] },
      { label: '節電を呼びかけ、市の施設の照明を減らす', cost: 0, desc: '費用なし。12 か月、需要が 8% 減ったのと同じ効果。支持率は少し下がります。', effects: [{ t: 'mod', key: 'powerCap', op: 'mul', v: 1.08, months: 12 }, { t: 'approval', v: -0.01 }] },
      { label: '何もしない', cost: 0, desc: '費用なし。停電が続き、支持率が下がります。', effects: [{ t: 'approval', v: -0.04 }] },
    ],
  },
  {
    id: 'burglary', title: '空き巣が相次いでいる', prob: 0.05, cooldown: 18, minStreak: 2, expire: 3,
    cond: s => (s.stats.crime > 0.32 && s.stats.households > 100 ? { target: -1, detail: `空き家の多い地区を中心に空き巣が続いています（治安の水準 ${r0(s.stats.lv[2] * 100)}%）。` } : null),
    options: [
      { label: '防犯カメラと街灯を増やす', cost: 600, desc: '600 万円。24 か月、治安の水準が上がります。', effects: [{ t: 'cash', v: -600, label: '防犯カメラ' }, { t: 'mod', key: 'safety', op: 'add', v: 0.3, months: 24 }, { t: 'approval', v: 0.01 }] },
      { label: '交番の設置を県警に要望する', cost: 0, desc: '費用なし。交番は［施設を建てる］から用地を用意して求められます。それまでは不安が続きます。', effects: [{ t: 'sat', who: [0, 1, 4], v: -0.01, months: 6 }] },
    ],
  },
  // ======== 世界・経済 ========
  {
    id: 'warAbroad', title: '海外で紛争が起き、資材とエネルギーが値上がり', prob: 0.004, cooldown: 120, minStreak: 0, expire: 3,
    cond: s => (s.month >= 12 ? { target: -1, detail: '遠い国で武力紛争が起き、原油・ガス・鉄鋼の価格が上がっています。24 か月、施設と行政の費用が 1 割ほど、建設費が 2 割ほど上がります。避難してきた人の受け入れへの協力も国から求められています。' } : null),
    hit: s => { { const e: any = s.econ; if (e?.macro) e.macro.warLeft = Math.max(e.macro.warLeft ?? 0, 24); } s.modifiers.push({ key: 'prices', op: 'mul', v: 1.1, until: s.month + 24, cost: 0, src: '海外の紛争による物価高' }, { key: 'costMul', op: 'mul', v: 1.2, until: s.month + 24, cost: 0, src: '海外の紛争による資材高' }); return ''; },
    options: [
      { label: '物価高に苦しむ世帯へ給付金を出す', cost: 3000, desc: '3,000 万円。6 か月、全世帯の満足と支持率が上がります。', effects: [{ t: 'cash', v: -3000, label: '物価高対策の給付' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.02, months: 6 }, { t: 'approval', v: 0.04 }] },
      { label: '省エネの設備に投資して備える', cost: 1500, desc: '1,500 万円。36 か月、施設の費用が 4% 下がります。', effects: [{ t: 'cash', v: -1500, label: '省エネ投資' }, { t: 'mod', key: 'prices', op: 'mul', v: 0.96, months: 36 }] },
      { label: '避難民の受け入れに協力する', cost: 800, desc: '800 万円。公営住宅と日本語教室を用意します。知名度と支持率が上がり、12 か月、転入が少し増えます。', effects: [{ t: 'cash', v: -800, label: '避難民の受け入れ' }, { t: 'fame', v: 3 }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.05, months: 12 }, { t: 'approval', v: 0.02 }] },
      { label: '静観する', cost: 0, desc: '費用なし。物価高の影響はそのまま受けます。', effects: [{ t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'recession', title: '景気が悪くなってきた', prob: 0.006, cooldown: 72, minStreak: 0, expire: 3,
    cond: s => (s.month >= 10 ? { target: -1, detail: '世界的な景気の落ち込みで、市内の企業の業績が悪化しています。18 か月、税収が 6% ほど減り、店も開きにくくなります。' } : null),
    hit: s => { s.modifiers.push({ key: 'econ', op: 'mul', v: 0.94, until: s.month + 18, cost: 0, src: '景気後退' }, { key: 'shopOpen', op: 'mul', v: 1.2, until: s.month + 18, cost: 0, src: '景気後退' }); return ''; },
    options: [
      { label: '地元企業と商店へ緊急の融資・支援', cost: 2000, desc: '2,000 万円。18 か月、店が開きやすくなり、企業誘致の見込みも上がります。', effects: [{ t: 'cash', v: -2000, label: '緊急経済対策' }, { t: 'mod', key: 'shopOpen', op: 'mul', v: 0.8, months: 18 }, { t: 'mod', key: 'bizIncentive', op: 'add', v: 0.08, months: 18 }, { t: 'approval', v: 0.02 }] },
      { label: '支出を絞って耐える', cost: 0, desc: '費用なし。12 か月、政策・臨時対応以外の支出は変わりません。支持率が少し下がります。', effects: [{ t: 'approval', v: -0.02 }] },
    ],
  },
  {
    id: 'boom', title: '景気が良く、税収が伸びている', prob: 0.006, cooldown: 72, minStreak: 0, expire: 3,
    cond: s => (s.month >= 10 ? { target: -1, detail: '景気の回復で、市内の所得と企業の業績が伸びています。18 か月、税収が 5% ほど増え、転入希望も増えます。' } : null),
    hit: s => { s.modifiers.push({ key: 'econ', op: 'mul', v: 1.05, until: s.month + 18, cost: 0, src: '好景気' }, { key: 'inflow', op: 'mul', v: 1.08, until: s.month + 18, cost: 0, src: '好景気' }); return ''; },
    options: [
      { label: '増えた分を基金に積み立てる', cost: 0, desc: '何も足しません。資金に余裕ができます。', effects: [] },
      { label: '市民に還元する（施設の利用料の値下げ）', cost: 0, desc: '月 100 万円を 12 か月。満足と支持率が上がります。', effects: [{ t: 'mod', key: 'sat:all', op: 'add', v: 0.01, months: 12, cost: 100 }, { t: 'approval', v: 0.03 }] },
    ],
  },
  {
    id: 'grant', title: '国の補助金の公募がある', prob: 0.03, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => (s.month >= 3 ? { target: -1, detail: '国が、自治体の施設整備に建設費の半分を補助する公募を始めました。12 か月以内に着工する施設が対象です。分野を 1 つ選んで応募できます。' } : null),
    options: [
      { label: '子育て・教育の施設で応募する', cost: 50, desc: '申請費 50 万円。12 か月、保育園・学校・図書館の建設費が半分になります。', effects: [{ t: 'cash', v: -50, label: '補助金の申請' }, { t: 'mod', key: 'grant:kids', op: 'add', v: 0.5, months: 12 }, { t: 'mod', key: 'grant:edu', op: 'add', v: 0.5, months: 12 }] },
      { label: '防災・消防の施設で応募する', cost: 50, desc: '申請費 50 万円。12 か月、消防・防災・治安の施設の建設費が半分になります。', effects: [{ t: 'cash', v: -50, label: '補助金の申請' }, { t: 'mod', key: 'grant:safety', op: 'add', v: 0.5, months: 12 }] },
      { label: 'インフラ（水道・電気・ごみ）で応募する', cost: 50, desc: '申請費 50 万円。12 か月、上下水道・発電・ごみの施設の建設費が半分になります。', effects: [{ t: 'cash', v: -50, label: '補助金の申請' }, { t: 'mod', key: 'grant:infra', op: 'add', v: 0.5, months: 12 }] },
      { label: '応募しない', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  // ======== 誘致・ランドマーク ========
  {
    id: 'companyOffer', title: '企業から進出の打診', prob: 0.04, cooldown: 24, minStreak: 0, expire: 4,
    cond: s => { if (s.month < 6) return null; const t = findSite(s, 3, 3, 2); return t >= 0 ? { target: t, detail: `製造業の企業が、幹線沿いの空き地（${DISTRICTS[getMap(s.seed).district[t]] ?? ''}）に工場を建てたいと打診してきました。約 320 人の雇用と、月 300 万円ほどの税収が見込めますが、周りの空気は悪くなり、トラックが増えます。` } : null; },
    options: [
      { label: '用地を整えて受け入れる', cost: 3000, desc: '3,000 万円。24 か月後に工場が開業します。', effects: [{ t: 'cash', v: -3000, label: '工場用地の整備' }, { t: 'place', kind: 'factory' }] },
      { label: '環境協定を結ぶことを条件に受け入れる', cost: 4500, desc: '4,500 万円。開業に加え、市内の工場などの排出が 30% 減ります（ずっと）。', effects: [{ t: 'cash', v: -4500, label: '工場用地と環境協定' }, { t: 'place', kind: 'factory' }, { t: 'mod', key: 'factoryClean', op: 'mul', v: 0.7, months: -1 }] },
      { label: '物流センターとして受け入れる', cost: 2500, desc: '2,500 万円。18 か月後に開業。雇用は少なめで、トラックが多くなります。', effects: [{ t: 'cash', v: -2500, label: '物流用地の整備' }, { t: 'place', kind: 'logistics' }] },
      { label: '断る', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'themeparkOffer', title: 'テーマパーク計画の打診', prob: 0.03, cooldown: 120, minStreak: 0, expire: 4, once: true,
    cond: s => { if (s.month < 18 || (s.fame ?? 0) < 25) return null; const t = findSite(s, 5, 5, 2); return t >= 0 ? { target: t, detail: `知名度 ${r0(s.fame)} の街に目をつけたレジャー企業が、テーマパークの建設を打診してきました。年間 50 万人近い来訪者と 900 人の雇用が見込めますが、週末と朝夕の道路がとても混みます。` } : null; },
    options: [
      { label: '受け入れて、周りの道路も整える', cost: 15000, desc: '1 億 5,000 万円（用地と周辺道路）。36 か月後に開業します。', effects: [{ t: 'cash', v: -15000, label: 'テーマパークの用地と道路' }, { t: 'place', kind: 'themepark' }, { t: 'roadBoost', v: 1.2, delay: 12 }] },
      { label: '断る', cost: 0, desc: '何も変わりません。来訪者の多い街を望む声からは不満が出ます。', effects: [{ t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'hotelOffer', title: 'ホテルの進出', prob: 0.06, cooldown: 30, minStreak: 0, expire: 4,
    cond: s => { if (s.stats.visitors < 3000) return null; const t = findSite(s, 2, 1, 1); return t >= 0 ? { target: t, detail: `来訪者が月 ${r0(s.stats.visitors).toLocaleString()} 人になり、ホテル事業者が進出を打診してきました。宿泊税を設けると税収になります。` } : null; },
    options: [
      { label: '受け入れる', cost: 1500, desc: '1,500 万円（用地の紹介と整備）。18 か月後に開業します。', effects: [{ t: 'cash', v: -1500, label: 'ホテル用地' }, { t: 'place', kind: 'hotel' }] },
      { label: '断る', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'proTeam', title: 'プロスポーツチームが本拠地にしたいと言ってきた', prob: 0.05, cooldown: 120, minStreak: 0, expire: 4, once: true,
    cond: s => (s.buildings.some(b => b.kind === 'stadium' && b.status === 'operating') && !(s.teams ?? []).some(t => t.sport === 'soccer') ? { target: -1, detail: 'スタジアムを本拠地にしたいと、プロのサッカーチームが申し出てきました。試合の日は街に人があふれます。' } : null),
    options: [
      { label: '受け入れ、地域ぐるみで応援する', cost: 1000, desc: '1,000 万円（通常の設立より安い）。市のサッカーチームになり、支援は月 120 万円。知名度と来訪者が増え、毎年の順位で人気が動きます。', effects: [{ t: 'cash', v: -1000, label: 'ホームタウン協定' }, { t: 'team', sport: 'soccer' }, { t: 'fame', v: 3 }, { t: 'approval', v: 0.04 }] },
      { label: '断る', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'award', title: '「住みよい街ランキング」で上位に入った', prob: 0.06, cooldown: 36, minStreak: 2, expire: 3,
    cond: s => (s.stats.sat >= 0.76 && s.month >= 12 ? { target: -1, detail: `暮らしの満足度 ${r0(s.stats.sat * 100)}% が評価され、全国の住みよい街ランキングで上位に入りました。` } : null),
    options: [
      { label: '記念のイベントを開く', cost: 100, desc: '100 万円。支持率と知名度が上がります。', effects: [{ t: 'cash', v: -100, label: '記念イベント' }, { t: 'approval', v: 0.03 }, { t: 'fame', v: 2 }] },
      { label: '移住 PR に活用する', cost: 500, desc: '500 万円。知名度が上がり、12 か月、転入希望が 1.1 倍になります。', effects: [{ t: 'cash', v: -500, label: '移住 PR' }, { t: 'fame', v: 4 }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.1, months: 12 }] },
    ],
  },
  {
    id: 'inspection', title: '他の市から視察団が来る', prob: 0.04, cooldown: 18, minStreak: 0, expire: 2,
    cond: s => { const best = Math.max(...s.stats.lv); return s.month >= 8 && (best >= 0.9 || (s.stats.waitlist < 1 && s.stats.careDemand > 100)) ? { target: -1, detail: `${s.stats.waitlist < 1 && s.stats.careDemand > 100 ? '待機児童ゼロ' : '進んだ取り組み'}を学びたいと、他の市の議員と職員が視察を申し込んできました。` } : null; },
    options: [
      { label: '歓迎して案内する', cost: 50, desc: '50 万円。知名度が上がり、隣町との関係も良くなります。', effects: [{ t: 'cash', v: -50, label: '視察の受け入れ' }, { t: 'fame', v: 2 }, { t: 'neighbor', v: 0.05 }] },
      { label: '忙しいので断る', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  // ======== 隣町 ========
  {
    id: 'neighborMall', title: '隣町に大型ショッピングモールができる', prob: 0.01, cooldown: 60, minStreak: 0, expire: 3,
    cond: s => (s.month >= 8 ? { target: -1, detail: `${s.neighbors[0]?.name ?? '隣町'}に大型のショッピングモールが開業します。24 か月、市内の買物の一部がモールへ流れ、店の売上が落ちます。` } : null),
    hit: s => { s.modifiers.push({ key: 'outside', op: 'mul', v: 1.35, until: s.month + 24, cost: 0, src: '隣町のショッピングモール' }); if (s.neighbors[0]) s.neighbors[0].appeal = Math.min(0.85, s.neighbors[0].appeal + 0.04); return ''; },
    options: [
      { label: '商店街の活性化を支援する', cost: 800, desc: '800 万円。24 か月、店が開きやすくなり、市外へ流れる買物が減ります。', effects: [{ t: 'cash', v: -800, label: '商店街の活性化' }, { t: 'mod', key: 'shopOpen', op: 'mul', v: 0.85, months: 24 }, { t: 'mod', key: 'outside', op: 'mul', v: 0.85, months: 24 }] },
      { label: '様子を見る', cost: 0, desc: '費用なし。売上の落ちた店は閉まりやすくなります。', effects: [] },
    ],
  },
  {
    id: 'neighborMerge', title: '隣町から合併の打診', prob: 0.003, cooldown: 240, minStreak: 0, expire: 4, once: true,
    cond: s => (s.month >= 36 ? { target: -1, detail: `人口が減っている${s.neighbors[1]?.name ?? '隣町'}から、合併を前提にした協議の申し入れがありました。国の特例で交付金が増えますが、住民の意見は分かれています。` } : null),
    options: [
      { label: '合併協議を始める', cost: 300, desc: '300 万円。交付金がずっと 4% 増え、知名度が上がります。支持率は一時的に下がります。', effects: [{ t: 'cash', v: -300, label: '合併協議' }, { t: 'mod', key: 'transfer', op: 'mul', v: 1.04, months: -1 }, { t: 'fame', v: 3 }, { t: 'approval', v: -0.03 }] },
      { label: '広域連携にとどめる', cost: 0, desc: '合併はしませんが、ごみ処理などで協力します。36 か月、ごみ処理の能力が増えます。', effects: [{ t: 'mod', key: 'wasteCap', op: 'add', v: 600, months: 36 }, { t: 'neighbor', v: 0.05 }] },
      { label: '断る', cost: 0, desc: '支持率が少し上がりますが、隣町との関係は冷えます。', effects: [{ t: 'approval', v: 0.01 }, { t: 'neighbor', v: -0.1 }] },
    ],
  },
  {
    id: 'neighborHelp', title: '隣町で災害、応援の要請', prob: 0.006, cooldown: 48, minStreak: 0, expire: 2,
    cond: s => (s.month >= 6 ? { target: -1, detail: `${s.neighbors[2]?.name ?? '隣町'}が豪雨で大きな被害を受け、職員と物資の応援を求めています。` } : null),
    options: [
      { label: '職員と物資を派遣する', cost: 500, desc: '500 万円。知名度と支持率が上がり、隣町との関係が良くなります。', effects: [{ t: 'cash', v: -500, label: '被災地への応援' }, { t: 'fame', v: 2 }, { t: 'approval', v: 0.02 }, { t: 'neighbor', v: 0.1 }] },
      { label: '物資だけ送る', cost: 150, desc: '150 万円。', effects: [{ t: 'cash', v: -150, label: '支援物資' }, { t: 'neighbor', v: 0.03 }] },
      { label: '見送る', cost: 0, desc: '隣町との関係が冷えます。', effects: [{ t: 'neighbor', v: -0.1 }] },
    ],
  },
  // ---- v6：自然災害 ----
  {
    id: 'typhoon', title: '大型の台風が直撃した', prob: 0.05, cooldown: 12, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 4 && m <= 6 && s.month >= 4 ? { target: -1, detail: '大型の台風が夜のうちに通り過ぎました。強風で街路樹が倒れ、川沿いでは浸水も出ています。' } : null; },
    hit: s => damage(s, 'flood', 0.4),
    options: [
      { label: '早めの避難指示と、道路・施設の復旧', cost: 1200, desc: '1,200 万円。被害の不満が小さく、支持率が上がります。', effects: [{ t: 'cash', v: -1200, label: '台風の復旧' }, { t: 'approval', v: 0.03 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.005, months: 6 }] },
      { label: '道路の復旧だけ行う', cost: 400, desc: '400 万円。6 か月、満足が少し下がります。', effects: [{ t: 'cash', v: -400, label: '台風の復旧' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.01, months: 6 }, { t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'landslide', title: '大雨で土砂崩れが起きた', prob: 0.03, cooldown: 24, minStreak: 0, expire: 2,
    cond: s => { const mm = s.month % 12; if (mm < 3 || mm > 6) return null; const m = getMap(s.seed); const n = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating' && [[-1, 0], [1, 0], [0, -1], [0, 1]].some(([dx, dy]) => { const x = b.x + dx, y = b.y + dy; return x >= 0 && y >= 0 && x < W && y < H && m.steep[idx(x, y)]; })).length; return n >= 2 ? { target: -1, detail: `長雨で地盤がゆるみ、斜面が崩れました。斜面に接する住宅は ${n} 棟あります。` } : null; },
    hit: s => damage(s, 'slide', 0.8),
    options: [
      { label: '砂防工事と、危ない斜面の住宅の移転を支える', cost: 3000, desc: '3,000 万円。12 か月、満足の落ち込みを抑え、支持率が上がります。', effects: [{ t: 'cash', v: -3000, label: '砂防と移転支援' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.008, months: 12 }, { t: 'approval', v: 0.03 }] },
      { label: '応急の復旧だけ行う', cost: 800, desc: '800 万円。6 か月、子育て・高齢世帯の満足が下がります。', effects: [{ t: 'cash', v: -800, label: '土砂の撤去' }, { t: 'sat', who: [2, 3, 4], v: -0.015, months: 6 }, { t: 'approval', v: -0.02 }] },
    ],
  },
  {
    id: 'tornado', title: '竜巻が住宅地を通った', prob: 0.006, cooldown: 60, minStreak: 0, expire: 2,
    cond: s => { const mm = s.month % 12; if (mm < 4 || mm > 7) return null; const res = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating'); if (res.length < 10) return null; const b = res[Math.floor((s.month * 7919) % res.length)]; return { target: idx(b.x, b.y), detail: '突風とともに竜巻が住宅地を通り抜けました。屋根が飛ばされた家があります。' }; },
    hit: (s, t) => damage(s, 'wind', 0.8, t),
    options: [
      { label: '見舞金と、ブルーシート・修理の支援', cost: 800, desc: '800 万円。支持率が上がります。', effects: [{ t: 'cash', v: -800, label: '竜巻の見舞金' }, { t: 'approval', v: 0.02 }] },
      { label: '道路の片付けだけ行う', cost: 200, desc: '200 万円。支持率が下がります。', effects: [{ t: 'cash', v: -200, label: '竜巻の片付け' }, { t: 'approval', v: -0.02 }] },
    ],
  },
  // v88：無人島の孤立のリスク（台風で定期船が止まる・燃料の船が遅れる）
  {
    id: 'isleTyphoon', title: '台風で定期船が止まった', prob: 0.25, cooldown: 10, minStreak: 0, expire: 1,
    cond: s => { const m = s.month % 12; if (!isCastaway(s.seed) || s.stats.pop < 1 || m < 7 || m > 9 || !s.buildings.some(b => b.kind === 'pier' || b.kind === 'port')) return null; const f = foodSelf(s);
      return { target: -1, detail: `海が荒れて、2 か月のあいだ定期船が来ません。島の食べ物の自給率は ${Math.round(f.self * 100)}% です。${f.self < 0.8 ? '足りない分は、晴れ間に割高な船で運ぶことになります。' : '島で採れる食べ物で、なんとかしのげそうです。'}新しい開拓者も来られません。` }; },
    hit: s => { s.modifiers.push({ key: 'shipStop', op: 'add', v: 1, until: s.month + 2, cost: 0, src: '台風で定期船が欠航' }, { key: 'inflow', op: 'mul', v: 0.2, until: s.month + 2, cost: 0, src: '台風で定期船が欠航' }); return ''; },
    options: [
      { label: 'ヘリで急病人と物資を運ぶ', cost: 900, desc: '900 万円。島の人の不安が和らぎ、支持率が少し上がります。', effects: [{ t: 'cash', v: -900, label: '物資のヘリ輸送' }, { t: 'approval', v: 0.015 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.01, months: 2 }] },
      { label: '島の備蓄と助け合いでしのぐ', cost: 0, desc: '費用なし。2 か月、暮らしの満足が下がります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.02, months: 2 }] },
    ],
  },
  {
    id: 'isleFuel', title: '発電機の燃料の船が遅れている', prob: 0.04, cooldown: 18, minStreak: 0, expire: 2,
    cond: s => (isCastaway(s.seed) && s.stats.pop > 0 && s.buildings.some(b => b.kind === 'dieselGen' && b.status === 'operating') ? { target: -1, detail: '軽油を運ぶ船の都合がつかず、ディーゼル発電機を止めながら使っています。3 か月、電気の力が 2 割下がります。太陽光や風力があれば、燃料に頼らずに済みます。' } : null),
    hit: s => { s.modifiers.push({ key: 'powerCap', op: 'mul', v: 0.8, until: s.month + 3, cost: 0, src: '燃料の船の遅れ' }); return ''; },
    options: [
      { label: 'チャーター船で燃料を急いで運ぶ', cost: 700, desc: '700 万円。3 か月、電気の力が元に戻ります。', effects: [{ t: 'cash', v: -700, label: '燃料のチャーター船' }, { t: 'mod', key: 'powerCap', op: 'mul', v: 1.25, months: 3 }] },
      { label: '節電でしのぐ', cost: 0, desc: '費用なし。3 か月、満足が少し下がります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.012, months: 3 }] },
    ],
  },
  {
    id: 'drought', title: '雨が降らず、渇水になった', prob: 0.03, cooldown: 24, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 2 && m <= 4 && s.stats.waterDemand > 0 ? { target: -1, detail: 'ダムの貯水率が 30% を切りました。3 か月、浄水場で送れる水が 2 割減ります。' } : null; },
    hit: s => { s.modifiers.push({ key: 'waterCap', op: 'mul', v: 0.8, until: s.month + 3, cost: 0, src: '渇水' }); return ''; },
    options: [
      { label: '近くの市から水を融通してもらう', cost: 1500, desc: '1,500 万円。3 か月、水を送れる量が 15% 戻ります。', effects: [{ t: 'cash', v: -1500, label: '水の融通' }, { t: 'mod', key: 'waterCap', op: 'mul', v: 1.15, months: 3 }, { t: 'neighbor', v: 0.03 }, { t: 'approval', v: 0.01 }] },
      { label: '節水を呼びかけ、給水車を出す', cost: 300, desc: '300 万円。3 か月、満足が少し下がります。', effects: [{ t: 'cash', v: -300, label: '給水車' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.008, months: 3 }] },
    ],
  },
  {
    id: 'bigBlackout', title: '大規模な停電が起きた', prob: 0.012, cooldown: 36, minStreak: 0, expire: 2,
    cond: s => (s.month >= 6 && s.stats.powerCap < s.stats.powerDemand * 1.2 ? { target: -1, detail: `送電線の事故で、市内のほぼ全域が半日停電しました。電力の余裕は ${Math.round((s.stats.powerCap / Math.max(1, s.stats.powerDemand) - 1) * 100)}% しかありません。` } : null),
    options: [
      { label: '病院・避難所に非常用電源を配る', cost: 1000, desc: '1,000 万円。支持率が上がり、24 か月、電力の供給が 5% 増えます（市の自家発電）。', effects: [{ t: 'cash', v: -1000, label: '非常用電源' }, { t: 'mod', key: 'powerCap', op: 'mul', v: 1.05, months: 24 }, { t: 'approval', v: 0.02 }] },
      { label: '電力会社に再発防止を求めるだけ', cost: 0, desc: '費用なし。支持率が下がります。', effects: [{ t: 'approval', v: -0.015 }] },
    ],
  },
  {
    id: 'linearRain', title: '線状降水帯で記録的な大雨', prob: 0.02, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => { const m = s.month % 12; return m >= 2 && m <= 5 && s.stats.floodHH >= 5 ? { target: -1, detail: `同じ場所に雨雲がかかり続け、1 時間に 100mm を超える雨が降りました。川沿いの低い土地には ${r0(s.stats.floodHH)} 世帯が住んでいます。` } : null; },
    hit: s => damage(s, 'flood', 1.0),
    options: [
      { label: '災害救助法の適用を求め、生活再建を手厚く', cost: 3500, desc: '3,500 万円。12 か月、満足の落ち込みを抑え、支持率が大きく上がります。', effects: [{ t: 'cash', v: -3500, label: '大雨の復旧と生活再建' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.015, months: 12 }, { t: 'approval', v: 0.05 }] },
      { label: '道路と公共施設の復旧だけ行う', cost: 1200, desc: '1,200 万円。12 か月、被災世帯の不満が続きます。', effects: [{ t: 'cash', v: -1200, label: '大雨の復旧' }, { t: 'sat', who: [2, 3, 4], v: -0.02, months: 12 }, { t: 'approval', v: -0.03 }] },
    ],
  },
  // ---- v6：事件・事故 ----
  {
    id: 'cyber', title: '市のシステムがサイバー攻撃を受けた', prob: 0.01, cooldown: 60, minStreak: 0, expire: 2,
    cond: s => (s.month >= 12 && modAdd(s, 'cyberShield') <= 0 ? { target: -1, detail: '市役所のシステムが身代金要求型のウイルスに感染し、住民票の発行や税の窓口が止まりました。海外のハッカー集団によるものとみられます。' } : null),
    options: [
      { label: '専門業者に復旧を頼み、対策も強める', cost: 2500, desc: '2,500 万円。1 か月で復旧し、支持率への影響は小さく済みます。守りを固めるので、10 年は同じ攻撃を防げます。', effects: [{ t: 'cash', v: -2500, label: 'システムの復旧と対策' }, { t: 'approval', v: 0.005 }, { t: 'mod', key: 'cyberShield', op: 'add', v: 1, months: 120 }] },
      { label: '最低限の復旧で、紙の手続きでしのぐ', cost: 600, desc: '600 万円。12 か月、事務の手間で行政の費用が 2% 増え、支持率が下がります。', effects: [{ t: 'cash', v: -600, label: 'システムの応急復旧' }, { t: 'mod', key: 'prices', op: 'mul', v: 1.02, months: 12 }, { t: 'approval', v: -0.03 }] },
    ],
  },
  {
    id: 'birdFlu', title: '養鶏場で鳥インフルエンザ', prob: 0.04, cooldown: 36, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 8 && m <= 11 && s.buildings.some(b => (b.kind === 'farm' || b.kind === 'poultry') && b.status === 'operating') ? { target: -1, detail: '市内の養鶏場で鳥インフルエンザが見つかりました。半径 3km の移動制限がかかります。' } : null; },
    options: [
      { label: '防疫を手伝い、農家の損失を補う', cost: 600, desc: '600 万円。農家の信頼を保ち、支持率が少し上がります。', effects: [{ t: 'cash', v: -600, label: '防疫と農家の支援' }, { t: 'approval', v: 0.01 }] },
      { label: '国の手順どおりの対応だけ行う', cost: 100, desc: '100 万円。知名度が少し下がります。', effects: [{ t: 'cash', v: -100, label: '防疫' }, { t: 'fame', v: -1 }] },
    ],
  },
  {
    id: 'bear', title: 'クマが住宅地の近くに出た', prob: 0.04, cooldown: 12, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; if (m < 5 || m > 7) return null; const g = getMap(s.seed); let forest = 0; for (let i = 0; i < W * H; i++) forest += g.forest[i]; const near = s.buildings.some(b => (b.kind === 'forestPark' || b.kind === 'camp' || b.kind === 'farm' || b.kind === 'golf') && b.status === 'operating'); return near || forest > W * H * 0.08 ? { target: -1, detail: 'エサを求めたクマが、林から住宅地の近くまで出てきました。通学路で目撃されています。' } : null; },
    options: [
      { label: '猟友会と見回り、電気柵を設ける', cost: 300, desc: '300 万円。支持率が少し上がります。', effects: [{ t: 'cash', v: -300, label: 'クマの対策' }, { t: 'approval', v: 0.01 }] },
      { label: '注意を呼びかける', cost: 0, desc: '費用なし。3 か月、子育て・高齢世帯の満足と、来訪者が減ります。', effects: [{ t: 'sat', who: [2, 3, 4], v: -0.01, months: 3 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.9, months: 3 }] },
    ],
  },
  {
    id: 'highwayCrash', title: '高速道路で多重事故', prob: 0.03, cooldown: 24, minStreak: 0, expire: 1,
    cond: s => (s.buildings.some(b => b.kind === 'ic' && b.status === 'operating') ? { target: -1, detail: '霧の朝、市内の高速道路で 20 台以上が絡む事故が起きました。通行止めの車が一般道にあふれています。' } : null),
    options: [
      { label: '消防と病院で救急搬送を応援する', cost: 200, desc: '200 万円。支持率が上がります。', effects: [{ t: 'cash', v: -200, label: '救急の応援' }, { t: 'approval', v: 0.02 }] },
      { label: '国と高速道路会社に任せる', cost: 0, desc: '費用なし。1 か月、朝の道路が 10% 余計に混みます。', effects: [{ t: 'mod', key: 'peakTrips', op: 'mul', v: 1.1, months: 1 }, { t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'overtourism', title: '観光客が増えすぎて住民が困っている', prob: 0.05, cooldown: 24, minStreak: 2, expire: 3,
    cond: s => (s.stats.visitors > 25000 ? { target: -1, detail: `来訪者が月 ${r0(s.stats.visitors).toLocaleString()} 人になり、路線バスに住民が乗れない、ごみが増えたという声が出ています。` } : null),
    options: [
      { label: 'マナー対策と交通規制、住民向けの便を増やす', cost: 600, desc: '600 万円。12 か月、住民の満足が上がり、来訪者は 5% 減ります。', effects: [{ t: 'cash', v: -600, label: '観光公害の対策' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.01, months: 12 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.95, months: 12 }] },
      { label: '観光を優先する', cost: 0, desc: '費用なし。知名度が上がりますが、12 か月、住民の満足が下がります。', effects: [{ t: 'fame', v: 2 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.015, months: 12 }, { t: 'approval', v: -0.02 }] },
    ],
  },
  // ---- v6：交流・にぎわい ----
  {
    id: 'airRoute', title: '空港に新しい路線が就航する', prob: 0.05, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => (s.buildings.some(b => b.kind === 'airport' && b.status === 'operating') ? { target: -1, detail: '航空会社が、市の空港から新しい路線を飛ばしたいと言ってきました。就航記念の PR と着陸料の補助を求めています。' } : null),
    options: [
      { label: '就航を歓迎し、PR と補助をする', cost: 800, desc: '800 万円。知名度が上がり、24 か月、来訪者が 1.1 倍になります。', effects: [{ t: 'cash', v: -800, label: '就航の PR' }, { t: 'fame', v: 3 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.1, months: 24 }] },
      { label: '補助はしない', cost: 0, desc: '就航は見送られます。', effects: [] },
    ],
  },
  {
    id: 'cruise', title: '大型客船が港に寄港する', prob: 0.06, cooldown: 18, minStreak: 0, expire: 2,
    cond: s => (s.buildings.some(b => b.kind === 'port' && b.status === 'operating') ? { target: -1, detail: '3,000 人を乗せた大型客船が、市の港に寄りたいと言ってきました。' } : null),
    options: [
      { label: '歓迎のイベントとシャトルバスを用意する', cost: 400, desc: '400 万円。知名度が上がり、12 か月、来訪者が 1.08 倍になります。', effects: [{ t: 'cash', v: -400, label: '客船の歓迎' }, { t: 'fame', v: 2 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.08, months: 12 }, { t: 'approval', v: 0.01 }] },
      { label: '受け入れだけする', cost: 0, desc: '知名度が少し上がります。', effects: [{ t: 'fame', v: 1 }] },
    ],
  },
  {
    id: 'filmLoc', title: '映画のロケ地に選ばれた', prob: 0.03, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => ((s.fame ?? 0) >= 20 ? { target: -1, detail: '有名な監督が、市の街並みを映画の舞台にしたいと言ってきました。撮影には道路の一時的な通行止めが要ります。' } : null),
    options: [
      { label: 'ロケを全面的に支える', cost: 300, desc: '300 万円。知名度が上がり、18 か月、来訪者が 1.1 倍になります（聖地巡礼）。', effects: [{ t: 'cash', v: -300, label: 'ロケの支援' }, { t: 'fame', v: 4 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.1, months: 18 }] },
      { label: '断る', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'conference', title: '国際会議の誘致の話が来た', prob: 0.06, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => (s.buildings.some(b => b.kind === 'convention' && b.status === 'operating') ? { target: -1, detail: '2,000 人が集まる国際会議を、市のコンベンションセンターで開けないかと打診がありました。' } : null),
    options: [
      { label: '誘致に手を挙げ、開催を支える', cost: 1500, desc: '1,500 万円。知名度が大きく上がり、12 か月、来訪者が 1.1 倍、景気も少し良くなります。', effects: [{ t: 'cash', v: -1500, label: '国際会議の開催支援' }, { t: 'fame', v: 5 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.1, months: 12 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.02, months: 12 }] },
      { label: '見送る', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'fireworks', title: '花火大会の季節', prob: 0.12, cooldown: 12, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 3 && m <= 4 && s.month >= 3 ? { target: -1, detail: '毎年の花火大会について、実行委員会から市の協賛を求められています。' } : null; },
    options: [
      { label: '盛大に開く', cost: 500, desc: '500 万円。支持率と知名度が上がり、2 か月、満足も少し上がります。', effects: [{ t: 'cash', v: -500, label: '花火大会の協賛' }, { t: 'approval', v: 0.02 }, { t: 'fame', v: 1 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.006, months: 2 }] },
      { label: '規模を小さくして開く', cost: 100, desc: '100 万円。何も変わりません。', effects: [{ t: 'cash', v: -100, label: '花火大会の協賛' }] },
      { label: '今年は中止する', cost: 0, desc: '支持率が少し下がります。', effects: [{ t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'highwayPlan', title: '高速道路のインターチェンジ計画', prob: 0.02, cooldown: 120, minStreak: 0, expire: 4, once: true,
    cond: s => { if (s.month < 24 || s.buildings.some(b => b.kind === 'ic')) return null; const t = findSite(s, 3, 3, 2); return t >= 0 ? { target: t, detail: '高速道路会社が、市内にインターチェンジをつくる計画を示しました。市はアクセス道路の負担を求められています。物流と観光には追い風ですが、周りの交通と騒音は増えます。' } : null; },
    options: [
      { label: '受け入れ、アクセス道路を負担する', cost: 10000, desc: '1 億円。30 か月後に開通します。', effects: [{ t: 'cash', v: -10000, label: 'IC のアクセス道路' }, { t: 'place', kind: 'ic' }, { t: 'roadBoost', v: 1.15, delay: 6 }] },
      { label: '断る', cost: 0, desc: '環境を守る声からは支持されますが、知名度は伸びません。', effects: [{ t: 'approval', v: 0.01 }] },
    ],
  },
  {
    id: 'mallOffer', title: 'ショッピングモールの進出の打診', prob: 0.03, cooldown: 60, minStreak: 0, expire: 4,
    cond: s => { if (s.stats.pop < 6000 * SCALE || s.buildings.some(b => b.kind === 'mall')) return null; const t = findSite(s, 4, 4, 2); return t >= 0 ? { target: t, detail: '大手の商業デベロッパーが、幹線沿いにショッピングモールを出したいと言ってきました。市内で買物が済むようになりますが、商店街は客を取られると心配しています。' } : null; },
    options: [
      { label: '受け入れる', cost: 2000, desc: '2,000 万円（用地の紹介と道路）。24 か月後に開業します。', effects: [{ t: 'cash', v: -2000, label: 'モールの用地' }, { t: 'place', kind: 'mall' }] },
      { label: '商店街を守るため断る', cost: 0, desc: '商店主からは支持されます。', effects: [{ t: 'approval', v: 0.01 }] },
    ],
  },
  // ---- v7 ----
  {
    id: 'beachSeason', title: '海開き：水の事故への備え', prob: 0.3, cooldown: 12, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 2 && m <= 3 && s.buildings.some(b => b.kind === 'beach' && b.status === 'operating') ? { target: -1, detail: '海水浴場の海開きを前に、去年は水の事故が 2 件あったと地元から心配の声が出ています。' } : null; },
    options: [
      { label: 'ライフセーバーを増やし、監視台を足す', cost: 300, desc: '300 万円。支持率が上がり、来訪者も少し増えます。', effects: [{ t: 'cash', v: -300, label: '海水浴場の安全対策' }, { t: 'approval', v: 0.01 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.03, months: 3 }] },
      { label: '遊泳区域を狭くして済ませる', cost: 0, desc: '費用なし。3 か月、来訪者が 1 割減ります。', effects: [{ t: 'mod', key: 'visitors', op: 'mul', v: 0.9, months: 3 }] },
    ],
  },
  {
    id: 'sakura', title: '桜が満開、さくらまつり', prob: 0.4, cooldown: 12, minStreak: 0, expire: 1,
    cond: s => (s.month % 12 === 0 && s.month > 0 && s.buildings.some(b => b.kind === 'flowerPark' && b.status === 'operating') ? { target: -1, detail: '桜並木が満開になりました。週末のさくらまつりをどうしますか。' } : null),
    options: [
      { label: 'ライトアップと屋台で盛大に', cost: 300, desc: '300 万円。知名度と支持率が上がり、来訪者が増えます。', effects: [{ t: 'cash', v: -300, label: 'さくらまつり' }, { t: 'fame', v: 2 }, { t: 'approval', v: 0.01 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.1, months: 1 }] },
      { label: '例年どおり静かに', cost: 0, desc: '何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'labBreakthrough', title: '市内の研究所が新しい技術を発表', prob: 0.02, cooldown: 48, minStreak: 0, expire: 3,
    cond: s => (s.buildings.some(b => b.kind === 'lab' && b.status === 'operating') ? { target: -1, detail: '市内の研究所が、世界で注目される新しい技術を発表しました。関連企業が集まる好機です。' } : null),
    options: [
      { label: '実証実験の場を提供し、関連企業を呼び込む', cost: 800, desc: '800 万円。知名度が上がり、18 か月、企業誘致の見込みと景気が上がります。', effects: [{ t: 'cash', v: -800, label: '実証実験の支援' }, { t: 'fame', v: 3 }, { t: 'mod', key: 'bizIncentive', op: 'add', v: 0.08, months: 18 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.02, months: 18 }] },
      { label: 'お祝いのコメントだけ出す', cost: 0, desc: '知名度が少し上がります。', effects: [{ t: 'fame', v: 1 }] },
    ],
  },
  {
    id: 'foreignWorkers', title: '企業から外国人の働き手を受け入れたいと相談', prob: 0.03, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => (s.stats.bizJobs >= 400 && !s.policies.tabunka?.on ? { target: -1, detail: `市内の企業（職 ${r0(s.stats.bizJobs)} 人）が人手不足で、外国人の働き手を受け入れたいと言っています。住まい探し・日本語・労働条件の相談の支えが要ります。` } : null),
    options: [
      { label: '住まいの入居支援と日本語教室を用意する', cost: 400, desc: '400 万円。24 か月、単身世帯の転入が 1 割増え、景気も少し良くなり、言語の支援が上がります。', effects: [{ t: 'cash', v: -400, label: '入居支援と日本語教室' }, { t: 'mod', key: 'inflow:0', op: 'mul', v: 1.1, months: 24 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.01, months: 24 }, { t: 'mod', key: 'lang', op: 'add', v: 0.08, months: 24 }] },
      { label: '企業に任せる', cost: 0, desc: '12 か月、人手不足で景気が少し下がります。', effects: [{ t: 'mod', key: 'econ', op: 'mul', v: 0.99, months: 12 }] },
    ],
  },
  // ---- v13：原子力発電所 ----
  {
    id: 'nuclearDrill', title: '原子力発電所の避難計画を見直してほしい', prob: 0.05, cooldown: 36, minStreak: 0, expire: 4,
    cond: s => (hasOp(s, 'nuclear') ? { target: -1, detail: '市内の原子力発電所について、子育て世帯を中心に「事故のときにどう逃げるのか」という声が上がっています。' } : null),
    options: [
      { label: '原子力防災訓練を開き、避難計画を見直す', cost: 400, desc: '400 万円。24 か月、災害への備えが上がり、6 か月、支持率が上がります。', effects: [{ t: 'cash', v: -400, label: '原子力防災訓練' }, { t: 'mod', key: 'prep', op: 'mul', v: 1.1, months: 24 }, { t: 'mod', key: 'approval', op: 'add', v: 0.012, months: 6 }] },
      { label: '電力会社と説明会を開く', cost: 50, desc: '50 万円。支持率は少しだけ下がります。', effects: [{ t: 'cash', v: -50, label: '説明会' }, { t: 'mod', key: 'approval', op: 'add', v: -0.005, months: 3 }] },
      { label: '国と電力会社に任せる', cost: 0, desc: '費用なし。6 か月、支持率が下がります。', effects: [{ t: 'mod', key: 'approval', op: 'add', v: -0.02, months: 6 }] },
    ],
  },
  {
    id: 'nuclearOutage', title: '原子力発電所が点検で止まった', prob: 0.02, cooldown: 48, minStreak: 0, expire: 2,
    cond: s => (hasOp(s, 'nuclear') ? { target: -1, detail: '国の審査に合わせた点検で、原子力発電所が 4 か月止まることになりました。市内の電気の余裕が少なくなります。' } : null),
    hit: s => { s.modifiers.push({ key: 'powerCap', op: 'add', v: -55000, until: s.month + 4, cost: 0, src: '原子力発電所の点検' }); return ' 4 か月、電力の能力が下がります。'; },
    options: [
      { label: 'ほかの電力会社から電気の融通を受ける', cost: 1500, desc: '1,500 万円。4 か月、止まった分の電気をまかないます。', effects: [{ t: 'cash', v: -1500, label: '電気の融通' }, { t: 'mod', key: 'powerCap', op: 'add', v: 55000, months: 4 }] },
      { label: '市民と企業に節電を呼びかける', cost: 0, desc: '費用なし。4 か月、満足と景気が少し下がります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.012, months: 4 }, { t: 'mod', key: 'econ', op: 'mul', v: 0.99, months: 4 }] },
    ],
  },
  // ---- v13：新幹線 ----
  {
    id: 'shinkansenPlan', title: '新幹線の新駅の候補地を国が募っている', prob: 0.05, cooldown: 60, minStreak: 0, expire: 6,
    cond: s => { if (s.month < 60 || s.buildings.some(b => b.shin !== undefined)) return null; const b = s.buildings.find(o => o.kind === 'station' && (o.lv ?? 1) >= 2 && o.status === 'operating'); return b && s.stats.pop >= 13000 * SCALE && (s.fame ?? 0) >= 20 ? { target: b.id, detail: `整備中の新幹線の新駅について、国が沿線の市から候補地を募っています。${b.name ?? '駅ビルのある駅'}は乗り換えが便利で、手を挙げれば有力です。地元の負担は大きいですが、開業すれば来訪者・知名度・企業・転入が大きく伸びます。` } : null; },
    options: [
      { label: '手を挙げ、地元の負担を約束する', cost: 40000, desc: '4 億円。6 年後に新幹線が停まるようになります（来訪者 +2 万人/月、知名度 +12、職 +600、転入 1.12 倍、景気 +4%、企業が来やすくなる）。', effects: [{ t: 'cash', v: -40000, label: '新幹線の新駅（地元負担）' }, { t: 'shin', months: 72 }, { t: 'mod', key: 'approval', op: 'add', v: 0.02, months: 12 }] },
      { label: '今回は見送る', cost: 0, desc: '費用なし。あとで駅の画面から自分で誘致することもできます（負担は 5 億円）。', effects: [] },
    ],
  },
  // ---- v12：大きな災害と自衛隊 ----
  {
    id: 'megaQuake', title: '大地震（震度 6 強）が街を襲った', prob: 0.0025, cooldown: 300, minStreak: 0, expire: 2,
    cond: s => (s.month >= 48 ? { target: -1, detail: `深夜に非常に強い揺れが続きました。古い住宅や市の施設、道路と水道に大きな被害が出ています。${hasOp(s, 'sdfBase') ? '市内の駐屯地の部隊がすでに救助に動いています。' : '県を通じて自衛隊に災害派遣を要請できます。'}` } : null),
    hit: s => { const a = damage(s, 'quake', 1); damage(s, 'quake', 0.5); const lq = damage(s, 'liquefy', 0.8); const ts = hasSea(s) && rngNext(s) < 0.35 ? ' 津波注意報が出て、' + damage(s, 'tsunami', 1.5 + rngNext(s) * 2.5).trim() : ''; s.modifiers.push({ key: 'econ', op: 'mul', v: 0.95, until: s.month + 12, cost: 0, src: '大地震の影響' }); return a + lq + ts + ' 12 か月、景気が下がります。'; },
    options: [
      { label: '自衛隊の災害派遣を要請し、総力で救助と復旧を進める', cost: 6000, desc: '6,000 万円。救助・給水・がれきの撤去が早く進み、傷んだ道路と施設がかなり戻ります。6 か月、満足と支持率が上がり、水道も早く戻ります。', effects: [{ t: 'cash', v: -6000, label: '大地震の救助と復旧' }, { t: 'recover', v: 0.9 }, { t: 'mod', key: 'waterCap', op: 'mul', v: 1.2, months: 6 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.02, months: 6 }, { t: 'mod', key: 'approval', op: 'add', v: 0.04, months: 8 }] },
      { label: '国の激甚災害の指定を受け、補助で計画的に復旧する', cost: 2500, desc: '2,500 万円（国が多くを負担）。復旧は 6 か月後から。その間は満足が少し下がります。', effects: [{ t: 'cash', v: -2500, label: '大地震の復旧（市の負担）' }, { t: 'recover', v: 0.7, delay: 6 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.015, months: 6 }, { t: 'mod', key: 'approval', op: 'add', v: 0.01, months: 6 }] },
      { label: '最低限の応急復旧にとどめる', cost: 800, desc: '800 万円。12 か月、満足と支持率が大きく下がります。', effects: [{ t: 'cash', v: -800, label: '大地震の応急復旧' }, { t: 'recover', v: 0.3 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.035, months: 12 }, { t: 'mod', key: 'approval', op: 'add', v: -0.05, months: 12 }] },
    ],
  },
  {
    // 南海トラフのような海溝型の巨大地震：長く強い揺れ、液状化、そして大津波。海のある街だけ
    id: 'nankai', title: '巨大地震（震度 7）と大津波', prob: 0.0012, cooldown: 600, minStreak: 0, expire: 2,
    cond: s => (s.month >= 36 && hasSea(s) ? { target: -1, detail: '沖合の海溝で巨大地震が起き、3 分近く強い揺れが続きました。気象庁は「大津波警報」を出し、防災無線が高台への避難を呼びかけています。' } : null),
    hit: s => {
      const wave = (6 + rngNext(s) * 8) * (s.difficulty === 'easy' ? 0.7 : s.difficulty === 'hard' ? 1.15 : 1);
      const a = damage(s, 'quake', 1.2), lq = damage(s, 'liquefy', 1), ts = damage(s, 'tsunami', wave);
      s.modifiers.push({ key: 'econ', op: 'mul', v: 0.92, until: s.month + 18, cost: 0, src: '巨大地震と津波の影響' });
      return a + lq + ts + ' 18 か月、景気が下がります。';
    },
    options: [
      { label: '自衛隊・緊急消防援助隊に救助を要請し、総力で復旧する', cost: 9000, desc: '9,000 万円。救助とがれきの撤去が早く進み、傷んだ道路と施設がかなり戻ります。満足と支持率が上がります。', effects: [{ t: 'cash', v: -9000, label: '巨大地震・津波の救助と復旧' }, { t: 'recover', v: 0.9 }, { t: 'mod', key: 'waterCap', op: 'mul', v: 1.2, months: 6 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.02, months: 6 }, { t: 'mod', key: 'approval', op: 'add', v: 0.05, months: 8 }] },
      { label: '復興計画をつくり、高台移転と防潮堤の強化を進める', cost: 14000, desc: '1 億 4,000 万円。復旧に加えて、この先の災害の被害が 3 割小さくなります（ずっと）。復旧は 3 か月後から。', effects: [{ t: 'cash', v: -14000, label: '復興計画（高台移転・防潮堤）' }, { t: 'recover', v: 0.8, delay: 3 }, { t: 'mod', key: 'disasterDmg', op: 'mul', v: 0.7, months: -1 }, { t: 'mod', key: 'approval', op: 'add', v: 0.03, months: 12 }] },
      { label: '国の激甚災害の補助で、計画的に復旧する', cost: 3000, desc: '3,000 万円（国が多くを負担）。復旧は 6 か月後から。その間は満足が下がります。', effects: [{ t: 'cash', v: -3000, label: '巨大地震の復旧（市の負担）' }, { t: 'recover', v: 0.7, delay: 6 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.02, months: 6 }] },
    ],
  },
  {
    id: 'megaRain', title: '豪雨で川の堤防が決壊し、大規模な水害に', prob: 0.006, cooldown: 120, minStreak: 0, expire: 2,
    cond: s => { const m = s.month % 12; return m >= 4 && m <= 8 && s.month >= 24 ? { target: -1, detail: `線状降水帯が半日居座り、1 か月分の雨が降りました。川の堤防が切れて市街地に水が流れ込み、斜面も崩れています（川沿いの低い土地に ${r0(s.stats.floodHH)} 世帯）。` } : null; },
    hit: s => damage(s, 'flood', 1) + damage(s, 'slide', 0.8),
    options: [
      { label: '自衛隊に災害派遣を要請し、救助と復旧を急ぐ', cost: 4000, desc: '4,000 万円。孤立した地区の救助と復旧が早く進みます。6 か月、満足と支持率が上がります。', effects: [{ t: 'cash', v: -4000, label: '豪雨の救助と復旧' }, { t: 'recover', v: 0.7 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.015, months: 6 }, { t: 'mod', key: 'approval', op: 'add', v: 0.03, months: 6 }] },
      { label: '復旧に加えて、川の改修と避難の仕組みを見直す', cost: 7000, desc: '7,000 万円。この先の大雨と土砂の被害が 3 割小さくなります（ずっと）。', effects: [{ t: 'cash', v: -7000, label: '豪雨の復旧と河川改修' }, { t: 'recover', v: 0.6 }, { t: 'mod', key: 'disasterDmg', op: 'mul', v: 0.85, months: -1 }, { t: 'mod', key: 'approval', op: 'add', v: 0.02, months: 6 }] },
      { label: '応急の復旧だけ行う', cost: 1000, desc: '1,000 万円。12 か月、満足と支持率が下がります。', effects: [{ t: 'cash', v: -1000, label: '豪雨の応急復旧' }, { t: 'recover', v: 0.3 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.02, months: 12 }, { t: 'mod', key: 'approval', op: 'add', v: -0.03, months: 12 }] },
    ],
  },
  {
    id: 'ashfall', title: '遠くの火山が噴火し、灰が降り積もった', prob: 0.0015, cooldown: 360, minStreak: 0, expire: 3,
    cond: s => (s.month >= 36 ? { target: -1, detail: '西風に乗って火山灰が数センチ積もりました。道路は滑りやすく、洗濯物も外に干せません。観光客の予約の取り消しが相次いでいます。' } : null),
    hit: s => { for (let i = 0; i < W * H; i++) if (s.road[i] === 1 || s.road[i] === 2) s.roadAge[i] = Math.min(100, s.roadAge[i] + 8); s.modifiers.push({ key: 'visitors', op: 'mul', v: 0.7, until: s.month + 6, cost: 0, src: '降灰' }, { key: 'econ', op: 'mul', v: 0.98, until: s.month + 6, cost: 0, src: '降灰' }); return ' 6 か月、来訪者が 3 割減り、景気も少し下がります。'; },
    options: [
      { label: '道路と公共施設の灰を一斉に除去する', cost: 1500, desc: '1,500 万円。傷んだ道路が少し戻り、3 か月、暮らしの満足が下がらずにすみます。', effects: [{ t: 'cash', v: -1500, label: '降灰の除去' }, { t: 'recover', v: 0.3 }, { t: 'mod', key: 'approval', op: 'add', v: 0.01, months: 3 }] },
      { label: '収集日を決めて、市民と一緒に片づける', cost: 200, desc: '200 万円。3 か月、満足が少し下がります。', effects: [{ t: 'cash', v: -200, label: '降灰の収集' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.01, months: 3 }] },
    ],
  },
  {
    id: 'sdfOffer', title: '自衛隊の駐屯地の設置について打診があった', prob: 0.03, cooldown: 120, minStreak: 0, expire: 6, once: true,
    cond: s => { if (s.month < 36 || s.stats.pop < 7000 * SCALE || s.buildings.some(b => b.kind === 'sdfBase')) return null; const t = findSite(s, 4, 4, 1); return t >= 0 ? { target: t, detail: `防衛省から、市内の空き地（${DISTRICTS[getMap(s.seed).district[t]] ?? ''}）に陸上自衛隊の駐屯地を置きたいと打診がありました。隊員と家族の転入、基地交付金、災害のときの初動の速さが見込めます。一方で、訓練の音や安全を心配する声もあります。` } : null; },
    options: [
      { label: '受け入れる', cost: 3000, desc: '3,000 万円（用地の整備）。36 か月後に駐屯地ができ、職 700 人と基地交付金（月 180 万円）、災害の被害が 2 割小さくなります。12 か月、支持率が少し下がります。', effects: [{ t: 'cash', v: -3000, label: '駐屯地の用地整備' }, { t: 'place', kind: 'sdfBase' }, { t: 'mod', key: 'approval', op: 'add', v: -0.015, months: 12 }, { t: 'fame', v: 2 }] },
      { label: '騒音と安全の対策を条件に受け入れる', cost: 6000, desc: '6,000 万円（用地と防音・安全対策）。駐屯地の効果は同じで、支持率は下がりません。', effects: [{ t: 'cash', v: -6000, label: '駐屯地の用地と対策' }, { t: 'place', kind: 'sdfBase' }, { t: 'fame', v: 2 }] },
      { label: '見送る', cost: 0, desc: '費用なし。何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'sdfDrill', title: '駐屯地の部隊と合同の防災訓練', prob: 0.06, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => (hasOp(s, 'sdfBase') ? { target: -1, detail: '駐屯地の部隊から、市と合同で大規模な防災訓練をしたいと申し出がありました。' } : null),
    options: [
      { label: '市の全部署と自治会が参加する', cost: 300, desc: '300 万円。24 か月、災害への備えが 2 割上がり、支持率も少し上がります。', effects: [{ t: 'cash', v: -300, label: '合同防災訓練' }, { t: 'mod', key: 'prep', op: 'mul', v: 1.2, months: 24 }, { t: 'mod', key: 'approval', op: 'add', v: 0.01, months: 6 }] },
      { label: '担当の部署だけ参加する', cost: 0, desc: '費用なし。12 か月、備えが少し上がります。', effects: [{ t: 'mod', key: 'prep', op: 'mul', v: 1.07, months: 12 }] },
    ],
  },
  {
    id: 'sdfOpenDay', title: '駐屯地の創立記念行事（一般公開）', prob: 0.08, cooldown: 12, minStreak: 0, expire: 3,
    cond: s => (hasOp(s, 'sdfBase') && s.month % 12 >= 3 && s.month % 12 <= 7 ? { target: -1, detail: '駐屯地の創立記念で、車両の展示や音楽隊の演奏が行われます。市外からも見物客が来そうです。' } : null),
    options: [
      { label: '駅からのシャトルバスと出店を用意する', cost: 300, desc: '300 万円。3 か月、来訪者が 1 割増え、知名度が少し上がります。', effects: [{ t: 'cash', v: -300, label: '記念行事の協力' }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.1, months: 3 }, { t: 'fame', v: 1 }] },
      { label: '告知だけ協力する', cost: 0, desc: '費用なし。', effects: [] },
    ],
  },
  // ---- v12：他国の脅威（国の安全保障に関わるできごと。市ができるのは住民を守る備えと情報発信） ----
  {
    id: 'missile', title: '近隣国の弾道ミサイル発射で J アラートが鳴った', prob: 0.006, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => (s.month >= 18 ? { target: -1, detail: '早朝、全国瞬時警報システム（J アラート）で避難の呼びかけがありました。ミサイルは海に落ちたとみられますが、住民からは「どこへ逃げればいいのか」という声が上がっています。' } : null),
    hit: s => { s.modifiers.push({ key: 'econ', op: 'mul', v: 0.99, until: s.month + 3, cost: 0, src: 'ミサイル発射の不安' }, { key: 'sat:all', op: 'add', v: -0.008, until: s.month + 3, cost: 0, src: 'ミサイル発射の不安' }); return ' 3 か月、景気と満足が少し下がります。'; },
    options: [
      { label: '避難施設を指定し、地区ごとに説明会を開く', cost: 300, desc: '300 万円。6 か月、支持率が少し上がり、災害への備えも上がります。', effects: [{ t: 'cash', v: -300, label: '避難施設の指定と説明会' }, { t: 'mod', key: 'approval', op: 'add', v: 0.01, months: 6 }, { t: 'mod', key: 'prep', op: 'mul', v: 1.05, months: 24 }] },
      { label: '公共施設の地下に避難スペースを整える', cost: 3000, desc: '3,000 万円（国の補助を差し引いた市の負担）。災害の被害がずっと 1 割小さくなり、12 か月、支持率が上がります。', effects: [{ t: 'cash', v: -3000, label: '地下の避難スペース' }, { t: 'mod', key: 'disasterDmg', op: 'mul', v: 0.9, months: -1 }, { t: 'mod', key: 'approval', op: 'add', v: 0.015, months: 12 }] },
      { label: 'ホームページで情報を出す', cost: 0, desc: '費用なし。何も変わりません。', effects: [] },
    ],
  },
  {
    id: 'energyCrisis', title: '近隣の海域の緊張で、燃料と電気の値段が上がった', prob: 0.004, cooldown: 72, minStreak: 0, expire: 3,
    cond: s => (s.month >= 30 ? { target: -1, detail: '海上輸送が乱れ、燃料の輸入が滞っています。電気・ガス代が上がり、町工場や店から悲鳴が上がっています。' } : null),
    hit: s => { s.modifiers.push({ key: 'econ', op: 'mul', v: 0.97, until: s.month + 12, cost: 0, src: 'エネルギー価格の高騰' }, { key: 'prices', op: 'mul', v: 1.04, until: s.month + 12, cost: 0, src: 'エネルギー価格の高騰' }); return ' 12 か月、景気が下がり、物価が上がります。'; },
    options: [
      { label: '家庭と中小企業の光熱費を補助する', cost: 2000, desc: '2,000 万円。6 か月、満足と支持率が上がり、景気の落ち込みも和らぎます。', effects: [{ t: 'cash', v: -2000, label: '光熱費の補助' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.01, months: 6 }, { t: 'mod', key: 'approval', op: 'add', v: 0.02, months: 6 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.015, months: 6 }] },
      { label: '公共施設の省エネと太陽光を急ぐ', cost: 3000, desc: '3,000 万円。電力の能力がずっと 3% 増え、次の値上がりにも強くなります。', effects: [{ t: 'cash', v: -3000, label: '省エネと太陽光' }, { t: 'mod', key: 'powerCap', op: 'mul', v: 1.03, months: -1 }, { t: 'mod', key: 'approval', op: 'add', v: 0.005, months: 6 }] },
      { label: '国の対策を待つ', cost: 0, desc: '費用なし。6 か月、満足が少し下がります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.01, months: 6 }] },
    ],
  },
  // ---- v12：プロチーム（対象 target は競技の番号：0 サッカー・1 野球・2 バスケ） ----
  {
    id: 'teamStar', title: 'スター選手を獲得するチャンス', prob: 0.07, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => { const t = teamPick(s, tm => s.month - tm.since >= 10); return t ? { target: TSP.indexOf(t.sport), detail: `${t.name}に、リーグを代表する選手が移籍に前向きだと伝わってきました。獲得には地元の支援が欠かせません。いまの戦力 ${Math.round((t.power ?? 0.35) * 100)}、人気 ${Math.round(t.fans * 100)}。` } : null; },
    options: [
      { label: '市と地元企業で獲得費を支援する', cost: 2500, desc: '2,500 万円。戦力が大きく上がり（＋15）、人気も上がります。強いチームは優勝しやすく、景気を押し上げます。', effects: [{ t: 'cash', v: -2500, label: 'スター選手の獲得支援' }, { t: 'teamAdj', power: 0.15, fans: 0.05 }] },
      { label: 'ふるさと納税でファンに支援を呼びかける', cost: 200, desc: '200 万円。戦力が少し上がり（＋6）、人気と支持率も少し上がります。', effects: [{ t: 'cash', v: -200, label: '獲得のための寄付の呼びかけ' }, { t: 'teamAdj', power: 0.06, fans: 0.03 }, { t: 'mod', key: 'approval', op: 'add', v: 0.005, months: 6 }] },
      { label: '見送る', cost: 0, desc: '費用なし。ほかのチームに取られ、戦力が少し下がります。', effects: [{ t: 'teamAdj', power: -0.02 }] },
    ],
  },
  {
    id: 'teamParade', title: '優勝パレードをしたい', prob: 0.9, cooldown: 10, minStreak: 0, expire: 3,
    cond: s => { const t = teamPick(s, tm => tm.rank === 1 && s.month % 12 >= 8 && s.month % 12 <= 9); return t ? { target: TSP.indexOf(t.sport), detail: `${t.name}の優勝で街がわいています。駅前通りでパレードをしてほしいという声が商店会から上がっています。` } : null; },
    options: [
      { label: '駅前通りで盛大にパレードを開く', cost: 800, desc: '800 万円。6 か月、満足と支持率が上がり、来訪者と景気も上向きます。人気も上がります。', effects: [{ t: 'cash', v: -800, label: '優勝パレード' }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.012, months: 6 }, { t: 'mod', key: 'approval', op: 'add', v: 0.02, months: 6 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.1, months: 6 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.01, months: 6 }, { t: 'teamAdj', fans: 0.04 }] },
      { label: '市役所で優勝報告会を開く', cost: 100, desc: '100 万円。3 か月、支持率が少し上がります。', effects: [{ t: 'cash', v: -100, label: '優勝報告会' }, { t: 'mod', key: 'approval', op: 'add', v: 0.01, months: 3 }] },
    ],
  },
  {
    id: 'teamVenue', title: 'チームから本拠地の改修・増席の要望', prob: 0.05, cooldown: 72, minStreak: 0, expire: 6,
    cond: s => { const t = teamPick(s, tm => tm.fans >= 0.5 && s.month - tm.since >= 36); return t ? { target: TSP.indexOf(t.sport), detail: `${t.name}の試合はいつも満員です。チームから、席を増やし、大型ビジョンや飲食の売店を整えたいと要望がありました。` } : null; },
    options: [
      { label: '改修費を出す', cost: 6000, desc: '6,000 万円。人気と戦力が上がり、来訪者がずっと 6% 増えます。', effects: [{ t: 'cash', v: -6000, label: '本拠地の改修' }, { t: 'teamAdj', fans: 0.1, power: 0.05 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.06, months: -1 }] },
      { label: '費用の一部を負担する', cost: 2500, desc: '2,500 万円。人気が少し上がります。', effects: [{ t: 'cash', v: -2500, label: '本拠地の改修（一部負担）' }, { t: 'teamAdj', fans: 0.04 }] },
      { label: '断る', cost: 0, desc: '費用なし。人気が下がり、6 か月、支持率が少し下がります。', effects: [{ t: 'teamAdj', fans: -0.06 }, { t: 'mod', key: 'approval', op: 'add', v: -0.01, months: 6 }] },
    ],
  },
  {
    id: 'teamAllStar', title: 'オールスター戦・国際試合の開催地に名乗りを上げる', prob: 0.04, cooldown: 48, minStreak: 0, expire: 4,
    cond: s => { const t = teamPick(s, tm => tm.fans >= 0.6); return t ? { target: TSP.indexOf(t.sport), detail: `${t.name}の人気を受けて、リーグから大きな試合の開催地にならないかと声がかかりました。` } : null; },
    options: [
      { label: '開催に手を挙げ、街を挙げて迎える', cost: 1500, desc: '1,500 万円。知名度が大きく上がり、6 か月、来訪者と景気が上向きます。', effects: [{ t: 'cash', v: -1500, label: '大きな試合の開催' }, { t: 'fame', v: 4 }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.15, months: 6 }, { t: 'mod', key: 'econ', op: 'mul', v: 1.015, months: 6 }, { t: 'teamAdj', fans: 0.03 }] },
      { label: '見送る', cost: 0, desc: '費用なし。', effects: [] },
    ],
  },
  {
    id: 'teamKids', title: '選手が小学校を訪ねるスポーツ教室', prob: 0.06, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => { const t = teamPick(s, () => true); return t ? { target: TSP.indexOf(t.sport), detail: `${t.name}から、選手が市内の小学校を回ってスポーツ教室を開きたいと申し出がありました。` } : null; },
    options: [
      { label: '全校で受け入れ、送迎バスを出す', cost: 150, desc: '150 万円。6 か月、子育て世帯の満足が上がり、チームの人気も上がります。', effects: [{ t: 'cash', v: -150, label: 'スポーツ教室' }, { t: 'sat', who: [2, 3], v: 0.012, months: 6 }, { t: 'teamAdj', fans: 0.03 }] },
      { label: '希望する学校だけ受け入れる', cost: 0, desc: '費用なし。人気が少し上がります。', effects: [{ t: 'teamAdj', fans: 0.01 }] },
    ],
  },
  {
    id: 'teamScandal', title: '所属選手の不祥事が報道された', prob: 0.02, cooldown: 48, minStreak: 0, expire: 3,
    cond: s => { const t = teamPick(s, () => true); return t ? { target: TSP.indexOf(t.sport), detail: `${t.name}の選手が、試合の後に飲酒運転で事故を起こしたと報道されました。市はチームの後援者でもあります。` } : null; },
    options: [
      { label: 'チームに再発防止を求め、後援は続ける', cost: 0, desc: '費用なし。人気が少し下がり、3 か月、支持率も少し下がります。', effects: [{ t: 'teamAdj', fans: -0.05 }, { t: 'mod', key: 'approval', op: 'add', v: -0.01, months: 3 }] },
      { label: '市の後援を 1 年止める', cost: 0, desc: '費用なし。支持率は保てますが、人気と戦力が下がります。', effects: [{ t: 'teamAdj', fans: -0.1, power: -0.05 }] },
    ],
  },
  {
    id: 'teamRelocate', title: 'チームが本拠地の移転を考えている', prob: 0.3, cooldown: 36, minStreak: 6, expire: 6,
    cond: s => { const t = teamPick(s, tm => tm.fans < 0.22 && s.month - tm.since >= 48); return t ? { target: TSP.indexOf(t.sport), detail: `人気が落ちた${t.name}に、隣の大きな市から本拠地を移さないかと誘いが来ています。` } : null; },
    options: [
      { label: '支援を増やして引き留める', cost: 3000, desc: '3,000 万円。人気と戦力が上がります。', effects: [{ t: 'cash', v: -3000, label: 'チームの引き留め' }, { t: 'teamAdj', fans: 0.12, power: 0.08 }] },
      { label: '移転を受け入れる', cost: 0, desc: '費用なし。チームは市外へ去り、6 か月、支持率が下がります。', effects: [{ t: 'teamAdj', remove: true }, { t: 'mod', key: 'approval', op: 'add', v: -0.03, months: 6 }] },
    ],
  },

  // ---- v19：日本の自治体の課題（つづきのあるできごと） ----
  {
    id: 'genkai', title: '山あいの集落が「限界集落」に', prob: 0.15, cooldown: 120, minStreak: 6, expire: 6,
    cond: s => {
      const D = DISTRICTS.length, tot = new Array(D).fill(0), old = new Array(D).fill(0), m = getMap(s.seed);
      for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating') { const d = m.district[idx(b.x, b.y)]; if (d < D) { tot[d] += sumHH(b); old[d] += b.hh![4]; } }
      let best = -1, bv = 0; for (let d = 0; d < D; d++) if (tot[d] > 15 && tot[d] < 900 && old[d] / tot[d] > bv) { bv = old[d] / tot[d]; best = d; }
      return best >= 0 && bv > 0.42 && s.month >= 60 ? { target: -1, detail: `${DISTRICTS[best]}は世帯の ${Math.round(bv * 100)}% が高齢世帯になりました。路線バスは赤字で減便、最後の商店も閉まり、祭りの担い手もいません。「このままでは集落が消える」と自治会長が訴えています。` } : null;
    },
    options: [
      { label: '集落支援員と移動販売車を入れる', cost: 300, desc: '300 万円と、毎月 40 万円（3 年）。見回りと買物の手段ができ、高齢世帯の満足が上がり、転出が減ります。', effects: [{ t: 'cash', v: -300, label: '集落支援員' }, { t: 'mod', key: 'sat:4', op: 'add', v: 0.025, months: 36, cost: 40 }, { t: 'mod', key: 'outflow', op: 'mul', v: 0.95, months: 36 }] },
      { label: 'デマンド型の乗合タクシーを走らせる', cost: 800, desc: '800 万円。予約で家の前まで来る乗合タクシー。通院と買物が楽になり、5 年、高齢世帯の満足が上がります。', effects: [{ t: 'cash', v: -800, label: '乗合タクシー' }, { t: 'mod', key: 'sat:4', op: 'add', v: 0.018, months: 60 }, { t: 'mod', key: 'health', op: 'add', v: 0.01, months: 60 }] },
      { label: '中心部への住み替えを進める（コンパクト化）', cost: 2000, desc: '2,000 万円。住み替えを支援して集落を畳みます。インフラの費用が減り、国の支援も増えますが、反発で支持率が下がります。', effects: [{ t: 'cash', v: -2000, label: '住み替え支援' }, { t: 'mod', key: 'transfer', op: 'mul', v: 1.02, months: -1 }, { t: 'mod', key: 'roadAge', op: 'mul', v: 0.95, months: -1 }, { t: 'approval', v: -0.03 }] },
      { label: '見守るしかない', cost: 0, desc: '費用なし。2 年、転出が増えます。', effects: [{ t: 'mod', key: 'outflow', op: 'mul', v: 1.06, months: 24 }, { t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'shutter', title: '駅前の商店街がシャッター街に', prob: 0.12, cooldown: 120, minStreak: 6, expire: 6,
    cond: s => (s.stats.pop > 7000 && s.stats.shopLevel < 0.62 && s.month >= 48 ? { target: -1, detail: `市内で使われる買物のお金のうち、市内の店に落ちるのは ${Math.round(s.stats.shopLevel * 100)}% だけです。郊外の大型店とネット通販に客を取られ、駅前の商店街は半分がシャッターを下ろしています。` } : null),
    options: [
      { label: 'リノベーションまちづくり（家守会社）', cost: 1500, desc: '1,500 万円。空き店舗を若い人のカフェや工房に改修して貸す民間の会社を育てます。3 年、店が開きやすく、市外へ流れる買物が減り、2 年後に評判が広がるかもしれません。', effects: [{ t: 'cash', v: -1500, label: 'リノベーションまちづくり' }, { t: 'mod', key: 'shopOpen', op: 'mul', v: 0.8, months: 36 }, { t: 'mod', key: 'outside', op: 'mul', v: 0.9, months: 36 }, { t: 'fame', v: 2 }, { t: 'mod', key: 'flag:renov', op: 'add', v: 1, months: 60 }] },
      { label: '空き店舗で起業する若者に補助する', cost: 800, desc: '800 万円。2 年、店が開きやすく、若い世帯の転入が少し増えます。', effects: [{ t: 'cash', v: -800, label: '起業補助' }, { t: 'mod', key: 'shopOpen', op: 'mul', v: 0.85, months: 24 }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.02, months: 24 }] },
      { label: '駐車場とチェーン店に任せる', cost: 0, desc: '費用なし。昔からの商店主からの支持が下がります。', effects: [{ t: 'approval', v: -0.015 }, { t: 'mod', key: 'outside', op: 'mul', v: 0.96, months: 12 }] },
    ],
  },
  {
    id: 'renovBoom', title: 'リノベした商店街が雑誌で話題に', prob: 0.5, cooldown: 600, minStreak: 24, expire: 4, once: true,
    cond: s => (modAdd(s, 'flag:renov') > 0 ? { target: -1, detail: '空き店舗を改修したカフェや雑貨店が、旅行雑誌と SNS で取り上げられました。週末は若い人でにぎわい、2 号店を出したいという人も出てきています。' } : null),
    options: [
      { label: '面で広げる（エリアリノベーション）', cost: 1200, desc: '1,200 万円。周りの路地にも広げます。ずっと来訪者が 1 割増え、店が開きやすく、知名度が上がります。', effects: [{ t: 'cash', v: -1200, label: 'エリアリノベーション' }, { t: 'mod', key: 'visitors', op: 'mul', v: 1.1, months: -1 }, { t: 'mod', key: 'shopOpen', op: 'mul', v: 0.9, months: -1 }, { t: 'fame', v: 5 }, { t: 'approval', v: 0.02 }] },
      { label: '民間に任せて見守る', cost: 0, desc: '費用なし。知名度が少し上がります。', effects: [{ t: 'fame', v: 2 }] },
    ],
  },
  {
    id: 'infraWave', title: 'インフラの一斉更新の波が来る', prob: 0.2, cooldown: 120, minStreak: 3, expire: 6,
    cond: s => {
      const old = s.buildings.filter(b => isCity(b.kind) && b.status !== 'construction' && b.age >= 55).length;
      let r = 0, ro = 0; for (let i = 0; i < s.road.length; i++) if (s.road[i] === 1 || s.road[i] === 2) { r++; if (s.roadAge[i] > 55) ro++; }
      return old >= 4 && s.month >= 36 ? { target: -1, detail: `高度成長期のように一度に建てた施設が、いっせいに古くなっています。老朽度 55 を超えた市の施設が ${old} か所、古い道路が ${r ? Math.round(ro / r * 100) : 0}%。このまま全部を建て替える予算はありません。` } : null;
    },
    options: [
      { label: '長寿命化計画で予防保全に切り替える', cost: 1000, desc: '1,000 万円。壊れる前に直す計画をつくります。5 年、道路の傷みが 2 割遅くなり、施設の費用が少し下がります。', effects: [{ t: 'cash', v: -1000, label: '長寿命化計画' }, { t: 'mod', key: 'roadAge', op: 'mul', v: 0.8, months: 60 }, { t: 'mod', key: 'prices', op: 'mul', v: 0.98, months: 60 }] },
      { label: '民間に包括委託する（PFI）', cost: 0, desc: '毎月 30 万円（10 年）。維持管理をまとめて民間に任せ、施設の費用が下がります。「公共を手放すのか」と支持率が少し下がります。', effects: [{ t: 'mod', key: 'prices', op: 'mul', v: 0.96, months: 120, cost: 30 }, { t: 'approval', v: -0.01 }] },
      { label: '施設を減らして統廃合する（公共施設の再編）', cost: 0, desc: '費用なし。集約で費用は下がりますが、地区の反発で支持率が下がります。', effects: [{ t: 'mod', key: 'prices', op: 'mul', v: 0.95, months: -1 }, { t: 'approval', v: -0.03 }, { t: 'mod', key: 'sat:all', op: 'add', v: -0.01, months: 24 }] },
      { label: '先送りする', cost: 0, desc: '費用なし。いまは何も起きませんが、3 年のうちに大きな事故が起きるかもしれません。', effects: [{ t: 'mod', key: 'flag:defer', op: 'add', v: 1, months: 36 }] },
    ],
  },
  {
    id: 'pipeBurst', title: '古い水道管が破裂、道路が陥没', prob: 0.1, cooldown: 60, minStreak: 0, expire: 3,
    cond: s => (modAdd(s, 'flag:defer') > 0 ? { target: -1, detail: '先送りしていた古い水道管が、朝の通勤時間に破裂しました。幹線道路が大きく陥没し、周りの数千世帯が断水しています。テレビの中継車も来ています。' } : null),
    options: [
      { label: '緊急工事と、全路線の点検をする', cost: 3000, desc: '3,000 万円。すぐ直し、点検で次の事故を防ぎます。支持率は下がります。', effects: [{ t: 'cash', v: -3000, label: '緊急工事' }, { t: 'approval', v: -0.03 }, { t: 'mod', key: 'flag:defer', op: 'add', v: -1, months: 36 }] },
      { label: '応急処置だけする', cost: 600, desc: '600 万円。半年、水道の能力が落ち、支持率が大きく下がります。', effects: [{ t: 'cash', v: -600, label: '応急処置' }, { t: 'mod', key: 'waterCap', op: 'mul', v: 0.9, months: 6 }, { t: 'approval', v: -0.05 }] },
    ],
  },
  {
    id: 'akiyaBank', title: '空き家が目立ってきた', prob: 0.15, cooldown: 96, minStreak: 6, expire: 6,
    cond: s => (s.stats.vacancy > 0.08 && s.stats.pop > 4000 && s.month >= 24 ? { target: -1, detail: `住宅の ${Math.round(s.stats.vacancy * 100)}% が空き家です。庭の草が伸び放題の家や、屋根が傾いた家もあり、近所から苦情が来ています。` } : null),
    options: [
      { label: '空き家バンクとリフォーム補助', cost: 600, desc: '600 万円。空き家を売りたい人と住みたい人をつなぎます。3 年、転入が増え、転出が減ります。', effects: [{ t: 'cash', v: -600, label: '空き家バンク' }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.05, months: 36 }, { t: 'mod', key: 'outflow', op: 'mul', v: 0.97, months: 36 }] },
      { label: '危ない空き家を代執行で撤去する', cost: 1200, desc: '1,200 万円。倒れそうな「特定空家」を市が撤去します。5 年、治安が良くなります。', effects: [{ t: 'cash', v: -1200, label: '空き家の代執行' }, { t: 'mod', key: 'safety', op: 'add', v: 0.03, months: 60 }] },
      { label: '様子を見る', cost: 0, desc: '費用なし。2 年、治安が少し悪くなります。', effects: [{ t: 'mod', key: 'safety', op: 'add', v: -0.02, months: 24 }] },
    ],
  },
  {
    id: 'shometsu', title: '「消滅可能性都市」と名指しされた', prob: 0.1, cooldown: 180, minStreak: 6, expire: 6,
    cond: s => { const b = s.stats.births ?? 0; return (s.stats.aging ?? 0) > 0.28 && s.stats.pop > 3000 && b < s.stats.pop * 0.0006 && s.month >= 60 ? { target: -1, detail: `民間の研究会が、子どもを産む世代の女性が 30 年で半分以下になる自治体として、住野市を名指ししました（いま月に生まれる子どもは約 ${Math.round(b)} 人）。新聞とテレビが取り上げています。` } : null; },
    options: [
      { label: '若い世代の移住・定住プロジェクト', cost: 0, desc: '毎月 80 万円（5 年）。住まい・仕事・子育ての支援をまとめて打ち出します。転入が増え、知名度が上がります。', effects: [{ t: 'mod', key: 'inflow', op: 'mul', v: 1.06, months: 60, cost: 80 }, { t: 'fame', v: 2 }] },
      { label: '地域おこし協力隊を受け入れる', cost: 500, desc: '500 万円。都会の若者が 3 年住んで地域の仕事をします。転入と知名度が少し上がり、高齢世帯の満足も上がります。', effects: [{ t: 'cash', v: -500, label: '地域おこし協力隊' }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.03, months: 36 }, { t: 'mod', key: 'fame', op: 'add', v: 2, months: 36 }, { t: 'mod', key: 'sat:4', op: 'add', v: 0.01, months: 36 }] },
      { label: '反論の会見を開く', cost: 0, desc: '費用なし。支持者は喜びますが、何も変わりません。', effects: [{ t: 'approval', v: 0.01 }] },
    ],
  },

  // ======== v41：いじめ・米兵・原発と自衛隊の打診・高校スポーツ・夜の街・談合・ロケット ========
  // 起きる月は地図の種と月で決め（rng を使わない）、prob 1 の確率で起こす（ほかのできごとの乱数の並びを変えない）
  {
    id: 'ijime', title: '中学校でいじめの重大事態が起きた', prob: 1, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => (s.stats.pop > 3000 && s.buildings.some(b => (b.kind === 'jhs' || b.kind === 'school') && b.status === 'operating') && hh(s, 11) < 0.012 * (1 - Math.min(0.8, modAdd(s, 'ijime'))) ? { target: -1, detail: '同級生からのいじめで、生徒が長く学校を休んでいます。保護者は学校の対応が遅かったと訴え、報道も始まりました。' } : null),
    options: [
      { label: '第三者委員会で調べ、結果を公表する', cost: 500, desc: '500 万円。支持率は少し下がりますが、24 か月、就学の子がいる世帯の信頼（満足）が上がります。', effects: [{ t: 'cash', v: -500, label: 'いじめの第三者委員会' }, { t: 'approval', v: -0.01 }, { t: 'sat', who: [3], v: 0.01, months: 24 }] },
      { label: 'すべての学校に相談の体制をつくる', cost: 1200, desc: '1,200 万円。5 年間、いじめが起きにくくなり、就学の子がいる世帯の満足が上がります。', effects: [{ t: 'cash', v: -1200, label: 'いじめ対策の体制づくり' }, { t: 'mod', key: 'ijime', op: 'add', v: 0.5, months: 60 }, { t: 'sat', who: [3], v: 0.008, months: 60 }, { t: 'approval', v: 0.01 }] },
      { label: '学校と教育委員会に任せる', cost: 0, desc: '費用なし。「市は何もしない」と批判され、支持率と、就学の子がいる世帯の満足が下がります。', effects: [{ t: 'approval', v: -0.04 }, { t: 'sat', who: [3], v: -0.015, months: 12 }] },
    ],
  },
  {
    id: 'usSoldier', title: '米兵による事件が起きた', prob: 1, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => (hasOp(s, 'usBase') && hh(s, 12) < 0.025 ? { target: -1, detail: '基地の外で、酒に酔った米兵が市民にけがをさせる事件が起きました。容疑者の身柄は日米地位協定により米軍側にあり、市民の怒りが広がっています。' } : null),
    options: [
      { label: '基地に強く抗議し、再発防止を求める', cost: 0, desc: '費用なし。支持率が上がります。6 か月、不安で暮らしの満足が少し下がります。', effects: [{ t: 'approval', v: 0.02 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.005, months: 6 }] },
      { label: '国に日米地位協定の見直しを求める', cost: 0, desc: '費用なし。全国で報じられ、支持率と知名度が上がります。すぐには何も変わりません。', effects: [{ t: 'approval', v: 0.03 }, { t: 'fame', v: 1 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.005, months: 6 }] },
      { label: '夜間の外出制限と、合同パトロールを求める', cost: 300, desc: '300 万円（見回りの費用）。24 か月、治安が良くなります。', effects: [{ t: 'cash', v: -300, label: '基地周辺の合同パトロール' }, { t: 'mod', key: 'safety', op: 'add', v: 0.1, months: 24 }, { t: 'approval', v: 0.01 }] },
    ],
  },
  {
    id: 'nuclearOffer', title: '電力会社から、原子力発電所の立地調査の申し入れ', prob: 1, cooldown: 120, minStreak: 0, expire: 4, once: true,
    cond: s => (s.month >= 36 && s.stats.pop >= 10000 && !s.buildings.some(b => b.kind === 'nuclear') && hh(s, 13) < 0.01 ? { target: -1, detail: '電力会社と国が、市の海沿い（川沿い）で原子力発電所の立地調査をしたいと申し入れてきました。調査を受け入れるだけで電源立地の交付金が入ります。賛成は「雇用と財政」、反対は「事故と避難の不安」です。' } : null),
    options: [
      { label: '調査を受け入れる', cost: 0, desc: '交付金 5,000 万円と、10 年間、国からの交付金が 4% 増えます。支持率が下がり、［施設を建てる］から原子力発電所を求められます（建つまでは長い年月）。', effects: [{ t: 'cash', v: 5000, label: '電源立地の交付金（調査）' }, { t: 'mod', key: 'transfer', op: 'mul', v: 1.04, months: 120 }, { t: 'approval', v: -0.05 }] },
      { label: '住民の意見を聞く会を重ね、慎重に進める', cost: 300, desc: '300 万円。支持率は変わりません。交付金は半分（2,500 万円）。', effects: [{ t: 'cash', v: -300, label: '原発の住民説明会' }, { t: 'cash', v: 2500, label: '電源立地の交付金（調査）' }] },
      { label: '断る', cost: 0, desc: '費用なし。反対の市民に支持され、12 か月、暮らしの満足が少し上がります。', effects: [{ t: 'approval', v: 0.02 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.003, months: 12 }] },
    ],
  },
  {
    id: 'sdfOffer', title: '防衛省から、自衛隊の駐屯地を置く打診', prob: 1, cooldown: 120, minStreak: 0, expire: 4, once: true,
    cond: s => (s.month >= 24 && s.stats.pop >= 15000 && !s.buildings.some(b => b.kind === 'sdfBase') && hh(s, 14) < 0.01 ? { target: -1, detail: '南西の守りと災害派遣のため、市内に陸上自衛隊の駐屯地を置きたいと打診がありました。隊員と家族が住み、交付金と災害への備えが得られます。訓練の音を心配する声もあります。' } : null),
    options: [
      { label: '受け入れる', cost: 0, desc: '協力金 2,000 万円。5 年間、転入が 3% 増えます。支持率が少し下がります。［施設を建てる］から駐屯地を置けます。', effects: [{ t: 'cash', v: 2000, label: '駐屯地の受け入れ協力金' }, { t: 'mod', key: 'inflow', op: 'mul', v: 1.03, months: 60 }, { t: 'approval', v: -0.02 }] },
      { label: '断る', cost: 0, desc: '費用なし。支持率が少し上がります。', effects: [{ t: 'approval', v: 0.01 }] },
    ],
  },
  {
    id: 'koshien', title: '地元の高校が甲子園に出場！', prob: 1, cooldown: 10, minStreak: 0, expire: 2,
    cond: s => (s.month % 12 >= 3 && s.month % 12 <= 4 && (s.buildings.some(b => b.kind === 'privHigh' && b.status === 'operating') ? hh(s, 15) < 0.35 : s.buildings.some(b => b.kind === 'highschool' && b.status === 'operating') ? hh(s, 15) < 0.06 : false) ? { target: -1, detail: `${s.buildings.some(b => b.kind === 'privHigh') ? '私立の強豪校' : '市立高校'}の野球部が、地方大会を勝ち抜いて夏の甲子園に出場します。街じゅうが応援ムードです。` } : null),
    options: [
      { label: '応援バスとパブリックビューイングを出す', cost: 300, desc: '300 万円。知名度が 2 上がり、6 か月、暮らしの満足が上がります。', effects: [{ t: 'cash', v: -300, label: '甲子園の応援' }, { t: 'fame', v: 2 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: 0.006, months: 6 }, { t: 'approval', v: 0.01 }] },
      { label: '市長が激励に行く', cost: 0, desc: '費用なし。知名度が 1 上がります。', effects: [{ t: 'fame', v: 1 }] },
    ],
  },
  {
    id: 'kokoSoccer', title: '地元の高校が全国高校サッカー選手権に出場！', prob: 1, cooldown: 10, minStreak: 0, expire: 2,
    cond: s => (s.month % 12 >= 8 && s.month % 12 <= 9 && (s.buildings.some(b => b.kind === 'privHigh' && b.status === 'operating') ? hh(s, 16) < 0.3 : s.buildings.some(b => (b.kind === 'highschool' || b.kind === 'clubTeam') && b.status === 'operating') ? hh(s, 16) < 0.05 : false) ? { target: -1, detail: '高校のサッカー部が県大会で優勝し、冬の全国高校サッカー選手権に出場します。地域のクラブチームで育った選手も多く、子どもたちのあこがれです。' } : null),
    options: [
      { label: '壮行会と応援ツアーを開く', cost: 250, desc: '250 万円。知名度が 2 上がり、6 か月、就学の子がいる世帯の満足が上がります。', effects: [{ t: 'cash', v: -250, label: '高校サッカーの応援' }, { t: 'fame', v: 2 }, { t: 'sat', who: [3], v: 0.01, months: 6 }] },
      { label: '激励のメッセージを送る', cost: 0, desc: '費用なし。知名度が 1 上がります。', effects: [{ t: 'fame', v: 1 }] },
    ],
  },
  {
    id: 'nightTrouble', title: '繁華街で客引きとぼったくりの被害が続いている', prob: 1, cooldown: 18, minStreak: 0, expire: 3,
    cond: s => ((hasOp(s, 'nightDistrict') || hasOp(s, 'fuzokuDistrict')) && hh(s, 17) < 0.04 * (1 - Math.min(0.8, modAdd(s, 'nightSafe'))) ? { target: -1, detail: '夜の繁華街で、強引な客引きと高額請求（ぼったくり）の相談が相次ぎ、終電のあとの路上のけんかも増えています。観光客の口コミで「怖い街」と書かれ始めました。' } : null),
    options: [
      { label: '警察と合同で一斉に取り締まる', cost: 200, desc: '200 万円。12 か月、夜の街の治安が良くなります。店の売上が少し落ち、来訪者がわずかに減ります。', effects: [{ t: 'cash', v: -200, label: '繁華街の一斉取り締まり' }, { t: 'mod', key: 'nightSafe', op: 'add', v: 0.3, months: 12 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.98, months: 12 }, { t: 'approval', v: 0.01 }] },
      { label: '客引き防止条例を急いでつくる', cost: 0, desc: '費用なし。3 年間、夜の街の治安が良くなります（政策の［客引き防止条例］と同じ効果を先取り）。', effects: [{ t: 'mod', key: 'nightSafe', op: 'add', v: 0.2, months: 36 }, { t: 'approval', v: 0.01 }] },
      { label: '様子を見る', cost: 0, desc: '費用なし。支持率と暮らしの満足が下がり、知名度が少し落ちます。', effects: [{ t: 'approval', v: -0.02 }, { t: 'sat', who: [0, 1, 2, 3, 4], v: -0.005, months: 6 }, { t: 'fame', v: -1 }] },
    ],
  },
  {
    id: 'yakuza', title: '歓楽街で暴力団どうしの抗争が起きた', prob: 1, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => ((hasOp(s, 'fuzokuDistrict') || threatLv(s, 'yakuza') > 0.3) && hh(s, 18) < 0.012 * (1 - Math.min(0.8, modAdd(s, 'nightSafe'))) ? { target: -1, detail: '歓楽街のみかじめ料をめぐって暴力団どうしの抗争が起き、発砲事件がありました。近くの学校は集団で下校しています。' } : null),
    options: [
      { label: '暴力団排除条例を強め、店に協力を求める', cost: 100, desc: '100 万円。5 年間、夜の街の治安が良くなります。24 か月、来訪者が少し減ります。', effects: [{ t: 'cash', v: -100, label: '暴力団排除の取り組み' }, { t: 'mod', key: 'nightSafe', op: 'add', v: 0.3, months: 60 }, { t: 'mod', key: 'visitors', op: 'mul', v: 0.97, months: 24 }, { t: 'approval', v: 0.02 }] },
      { label: '警察に任せる', cost: 0, desc: '費用なし。支持率と、子育て世帯の満足が下がります。', effects: [{ t: 'approval', v: -0.03 }, { t: 'sat', who: [2, 3], v: -0.012, months: 6 }] },
    ],
  },
  {
    id: 'dango', title: '市の工事で談合の疑いが報じられた', prob: 1, cooldown: 48, minStreak: 0, expire: 3,
    cond: s => (hasOp(s, 'zenecon') && hh(s, 19) < 0.01 ? { target: -1, detail: '市の大きな工事の入札で、ゼネコンと地元の建設会社が事前に落札する会社を決めていた疑いがあると報じられました。' } : null),
    options: [
      { label: '入札の仕組みを見直す（電子入札・公表）', cost: 200, desc: '200 万円。支持率が少し上がり、3 年間、建設費が 2% 下がります。', effects: [{ t: 'cash', v: -200, label: '入札制度の見直し' }, { t: 'approval', v: 0.01 }, { t: 'mod', key: 'costMul', op: 'mul', v: 0.98, months: 36 }] },
      { label: '調べの結果を待つ', cost: 0, desc: '費用なし。支持率が下がります。', effects: [{ t: 'approval', v: -0.03 }] },
    ],
  },
  {
    id: 'rocketLaunch', title: 'ロケットの打ち上げ', prob: 1, cooldown: 6, minStreak: 0, expire: 2,
    cond: s => (hasOp(s, 'spaceport') && hh(s, 20) < 0.12 ? { target: -1, detail: hh(s, 21) < 0.85 ? '宇宙港から人工衛星を載せたロケットが打ち上がり、軌道に乗りました。打ち上げを見に、全国から人が集まりました。' : 'ロケットの打ち上げは、エンジンの不具合で失敗しました。それでも挑戦を応援する声が届いています。' } : null),
    options: [
      { label: '見物の会場と、子どもの宇宙教室を開く', cost: 100, desc: '100 万円。知名度が 3 上がり、3 か月、就学の子がいる世帯の満足が上がります。', effects: [{ t: 'cash', v: -100, label: '打ち上げの見物会場' }, { t: 'fame', v: 3 }, { t: 'sat', who: [3], v: 0.008, months: 3 }] },
      { label: '見守る', cost: 0, desc: '費用なし。知名度が 1 上がります。', effects: [{ t: 'fame', v: 1 }] },
    ],
  },
  // ======== v42：治安の脅威（過激派・右翼・テロ・カルト・特殊詐欺・宗教と政治） ========
  {
    id: 'leftSabotage', title: '過激派によるゲリラ事件', prob: 1, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => (threatLv(s, 'left') > 0.15 && hh(s, 22) < 0.02 * threatLv(s, 'left') * 5 ? { target: -1, detail: `${s.buildings.some(b => b.kind === 'usBase') ? '米軍基地' : s.buildings.some(b => b.kind === 'nuclear') ? '原子力発電所' : '大きな国の事業の現場'}への反対運動に紛れて、過激派が工事車両に火をつける事件を起こしました。けが人はいませんでした。平和的に反対している市民の団体は「私たちとは関係ない」と声明を出しています。` } : null),
    options: [
      { label: '警察と警備を強め、現場を守る', cost: 300, desc: '300 万円。2 年間、治安が良くなり、過激派の力が落ちます。', effects: [{ t: 'cash', v: -300, label: '過激派への警備' }, { t: 'mod', key: 'safety', op: 'add', v: 0.05, months: 24 }, { t: 'mod', key: 'threat:left', op: 'add', v: 0.3, months: 36 }] },
      { label: '暴力は許さないと表明し、反対の市民とは対話の場をつくる', cost: 100, desc: '100 万円。支持率が上がり、反対運動が過激派から離れていきます。', effects: [{ t: 'cash', v: -100, label: '対話の場' }, { t: 'approval', v: 0.02 }, { t: 'mod', key: 'threat:left', op: 'add', v: 0.2, months: 36 }] },
      { label: '警察に任せる', cost: 0, desc: '費用なし。支持率が少し下がります。', effects: [{ t: 'approval', v: -0.01 }] },
    ],
  },
  {
    id: 'rightGaisen', title: '右翼団体の街宣車が駅前で大音量の演説', prob: 1, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => (threatLv(s, 'right') > 0.12 && hh(s, 23) < 0.03 * threatLv(s, 'right') * 5 ? { target: -1, detail: `${s.buildings.some(b => b.kind === 'consulate') ? '外国の領事館' : '市役所と駅前'}の近くで、右翼団体の街宣車が連日、大音量で演説しています。近くの学校と病院から苦情が来ています。表現の自由との兼ね合いが問われます。` } : null),
    options: [
      { label: '拡声器の音量の規制条例をつくる（内容は問わない）', cost: 50, desc: '50 万円。3 年間、右翼団体の街宣が減り、近くの住民の満足が戻ります。', effects: [{ t: 'cash', v: -50, label: '拡声器の規制条例' }, { t: 'mod', key: 'threat:right', op: 'add', v: 0.35, months: 36 }, { t: 'approval', v: 0.01 }] },
      { label: '警察に、道路の使い方の取り締まりを求める', cost: 0, desc: '費用なし。1 年間、少し減ります。', effects: [{ t: 'mod', key: 'threat:right', op: 'add', v: 0.15, months: 12 }] },
      { label: '表現の自由として静観する', cost: 0, desc: '費用なし。6 か月、暮らしの満足が少し下がります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.004, months: 6 }] },
    ],
  },
  {
    id: 'terrorThreat', title: 'テロの予告が届いた', prob: 1, cooldown: 36, minStreak: 0, expire: 2,
    cond: s => (threatLv(s, 'terror') > 0.1 && hh(s, 24) < 0.02 * threatLv(s, 'terror') * 6 ? { target: -1, detail: `「${s.buildings.some(b => b.kind === 'airport') ? '空港' : s.buildings.some(b => b.kind === 'expoSite') ? '万博の会場' : '駅'}を爆破する」という予告が、海外のサーバーを経由して市に届きました。警察は国際テロ組織の関与も含めて調べています。` } : null),
    options: [
      { label: '警備を最高の段階に上げ、全員で点検する', cost: 800, desc: '800 万円。1 年間、治安が良くなり、テロの脅威が下がります。数日は駅と空港が混雑します。', effects: [{ t: 'cash', v: -800, label: 'テロの予告への警備' }, { t: 'mod', key: 'safety', op: 'add', v: 0.05, months: 12 }, { t: 'mod', key: 'threat:terror', op: 'add', v: 0.4, months: 24 }, { t: 'approval', v: 0.01 }] },
      { label: '行事を中止し、施設を一時閉鎖する', cost: 0, desc: '費用なし。安全ですが、来訪者が 3 か月減り、知名度が下がります。', effects: [{ t: 'mod', key: 'visitors', op: 'mul', v: 0.9, months: 3 }, { t: 'fame', v: -1 }] },
      { label: 'いたずらと見て、公表せず警戒を続ける', cost: 0, desc: '費用なし。何も起きなければそれで終わりですが、半年、市民の不安が少し残ります。', effects: [{ t: 'sat', who: [0, 1, 2, 3, 4], v: -0.003, months: 6 }] },
    ],
  },
  {
    id: 'cultTrouble', title: 'カルト的な団体の高額献金と勧誘が問題に', prob: 1, cooldown: 36, minStreak: 0, expire: 3,
    cond: s => (threatLv(s, 'cult') > 0.12 && hh(s, 25) < 0.025 * threatLv(s, 'cult') * 5 ? { target: -1, detail: '家族が全財産を献金してしまったという相談が、消費生活センターに相次いでいます。大学の前では、名前を隠した勧誘が行われています。信教の自由は守りながら、被害をどう防ぐかが問われます。' } : null),
    options: [
      { label: '被害者の相談窓口と弁護士の無料相談をつくる', cost: 300, desc: '300 万円。3 年間、カルト的な団体の力が落ち、支持率が上がります。', effects: [{ t: 'cash', v: -300, label: 'カルト被害の相談窓口' }, { t: 'mod', key: 'threat:cult', op: 'add', v: 0.4, months: 36 }, { t: 'approval', v: 0.02 }] },
      { label: '大学・高校と協力して、勧誘の手口を知らせる', cost: 60, desc: '60 万円。2 年間、勧誘が減ります。', effects: [{ t: 'cash', v: -60, label: '勧誘の手口の啓発' }, { t: 'mod', key: 'threat:cult', op: 'add', v: 0.2, months: 24 }] },
      { label: '信教の自由の問題として、市は関わらない', cost: 0, desc: '費用なし。被害の家族から批判され、支持率が少し下がります。', effects: [{ t: 'approval', v: -0.02 }] },
    ],
  },
  {
    id: 'fraudWave', title: '特殊詐欺の被害が急に増えた（闇バイトの組織）', prob: 1, cooldown: 24, minStreak: 0, expire: 3,
    cond: s => (threatLv(s, 'fraud') > 0.14 && hh(s, 26) < 0.03 * threatLv(s, 'fraud') * 5 ? { target: -1, detail: '「息子だけど、会社のお金をなくした」「市役所ですが、還付金があります」。市内で高齢者の被害が 1 か月で 2 億円を超えました。お金を受け取りに来たのは、SNS の闇バイトで集められた若者でした。' } : null),
    options: [
      { label: '銀行・コンビニと見守りの協定を結び、電話に自動録音機を配る', cost: 400, desc: '400 万円。3 年間、闇の組織の力が落ち、高齢世帯の満足が上がります。', effects: [{ t: 'cash', v: -400, label: '特殊詐欺の対策' }, { t: 'mod', key: 'threat:fraud', op: 'add', v: 0.4, months: 36 }, { t: 'sat', who: [4], v: 0.008, months: 24 }] },
      { label: '若者向けに「闇バイトは犯罪」と知らせる', cost: 80, desc: '80 万円。2 年間、実行役が集まりにくくなります。', effects: [{ t: 'cash', v: -80, label: '闇バイトの啓発' }, { t: 'mod', key: 'threat:fraud', op: 'add', v: 0.2, months: 24 }] },
      { label: '防災無線で注意を呼びかけるだけ', cost: 0, desc: '費用なし。高齢世帯の満足が下がります。', effects: [{ t: 'sat', who: [4], v: -0.01, months: 6 }] },
    ],
  },
  {
    id: 'religionVote', title: '宗教団体から、次の選挙での支援の申し出', prob: 1, cooldown: 48, minStreak: 0, expire: 3,
    cond: s => (threatLv(s, 'religion') > 0.3 && (s.month - s.termStart) >= 30 && (s.month - s.termStart) <= 42 && hh(s, 27) < 0.04 ? { target: -1, detail: '市内で信者の多い宗教団体の幹部が「次の選挙では、信者の票をまとめて市長を応援したい。その代わり、団体の施設の建設を後押ししてほしい」と申し出てきました。' } : null),
    options: [
      { label: '支援を受ける', cost: 0, desc: '支持率が 4% 上がります。ただし 10 年のあいだ、関係が報じられて支持を大きく失うおそれがあります。', effects: [{ t: 'approval', v: 0.04 }, { t: 'mod', key: 'flag:religionTie', op: 'add', v: 1, months: 120 }] },
      { label: '支援は受けるが、見返りの約束はしない', cost: 0, desc: '支持率が 1% 上がります。', effects: [{ t: 'approval', v: 0.01 }] },
      { label: '特定の団体の支援は受けないと断る', cost: 0, desc: '支持率は変わりません。政治と宗教の距離を守ったと評価されることもあります。', effects: [{ t: 'fame', v: 1 }] },
    ],
  },
  {
    id: 'religionScandal', title: '市長と宗教団体の関係が報じられた', prob: 1, cooldown: 120, minStreak: 0, expire: 3, once: true,
    cond: s => (modAdd(s, 'flag:religionTie') > 0 && hh(s, 28) < 0.02 ? { target: -1, detail: '市長が選挙で宗教団体の支援を受け、見返りに団体の施設の許可を急がせたのではないかと、週刊誌が報じました。' } : null),
    options: [
      { label: '経緯を説明し、関係を断つと表明する', cost: 0, desc: '支持率が 4% 下がります。', effects: [{ t: 'approval', v: -0.04 }] },
      { label: '問題はないと答える', cost: 0, desc: '支持率が 7% 下がり、知名度も落ちます。', effects: [{ t: 'approval', v: -0.07 }, { t: 'fame', v: -2 }] },
    ],
  },
];

// 実在都市版：市全体にかかる対策の費用と量を、街の大きさに合わせる（ひとつの園・店・交差点への対策はそのまま）
const EVENTS_BASE = structuredClone(EVENTS.map(e => e.options));
onMapChange(() => {
  EVENTS.forEach((e, i) => { e.options = structuredClone(EVENTS_BASE[i]); });
  const wa = EVENTS.find(e => e.id === 'waterAging')!.options[0], dw = DEFS.water; // 浄水場の更新費は地図で変わる
  wa.cost = dw.renewCost; wa.desc = `${dw.renewCost.toLocaleString()} 万円、工期 ${dw.renewMonths} か月。工事中は能力が ${dw.renewFactor * 100}% になり、完了すると老朽度が 0 に戻ります。`;
  if (!REAL) return;
  const CITYWIDE: Record<string, number[]> = { careStaff: [0], congestion: [1], rent: [0, 1], wasteOver: [0, 1], fireDelay: [0, 1] };
  const k = SCALE, r = (v: number) => Math.round(v * k / 10) * 10;
  for (const ev of EVENTS) for (const oi of CITYWIDE[ev.id] ?? []) {
    const o = ev.options[oi];
    o.cost = r(o.cost);
    for (const e of o.effects) { if (e.t === 'cash') e.v = -r(-e.v); if (e.t === 'mod' && e.cost) e.cost = r(e.cost); if (e.t === 'mod' && e.key === 'wasteCap') e.v = r(e.v); }
    o.desc = o.desc.replace(/(\d[\d,]*) (万円|世帯分)/g, (_m, n: string, u: string) => `${r(Number(n.replace(/,/g, ''))).toLocaleString()} ${u}`);
  }
});

export const eventDef = (id: string) => EVENTS.find(e => e.id === id)!;

/** 幹線道路か国道に面した、空いている 2×2 の土地（左上タイル） */
export function findStoreSite(s: GameState): number {
  const m = getMap(s.seed);
  for (let y = 2; y < H - 6; y++) for (let x = 1; x < W - 2; x++) {
    let ok = true;
    for (let dy = 0; dy < 2 && ok; dy++) for (let dx = 0; dx < 2; dx++) { const i = idx(x + dx, y + dy); if (s.occ[i] || s.road[i] || !buildable(m, i)) { ok = false; break; } }
    if (ok && accessTile(s, x, y, 2, 2, 2) >= 0) return idx(x, y);
  }
  return -1;
}

/** 空いている w×h の土地（左上タイル）。minRoad 以上の道路に面していること */
export function findSite(s: GameState, w: number, h: number, minRoad = 1): number {
  const m = getMap(s.seed);
  const free = (x: number, y: number) => { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { if (x + dx >= W || y + dy >= H) return false; const i = idx(x + dx, y + dy); if (s.occ[i] || s.road[i] || !buildable(m, i) || (s.rail?.[i] && s.railGrade?.[i] !== 2) || s.zone[i]) return false; } return true; };
  // 決まった順に探す（同じ状態なら同じ場所）。端から少し内側を優先
  for (let y = 1; y < H - h; y++) for (let x = 1; x < W - w; x++) if (free(x, y) && accessTile(s, x, y, w, h, minRoad) >= 0) return idx(x, y);
  return -1;
}

/** 災害の被害。備え（避難所・備蓄・訓練）が多いほど小さい。説明の文を返す */
export function damage(s: GameState, what: 'quake' | 'flood' | 'fire' | 'snow' | 'slide' | 'wind' | 'tsunami' | 'liquefy', v: number, target = -1): string {
  const hh0 = s.buildings.reduce((a, b) => a + (b.hh ? b.hh.reduce((x, y) => x + y, 0) : 0), 0);
  dmgDepth++; let out = ''; try { out = damage0(s, what, v, target); } finally { dmgDepth--; }
  if (dmgDepth === 0 && (what === 'quake' || what === 'tsunami' || what === 'liquefy' || what === 'flood' || what === 'slide')) { const hh1 = s.buildings.reduce((a, b) => a + (b.hh ? b.hh.reduce((x, y) => x + y, 0) : 0), 0); noteDisaster(s, what, hh0 - hh1); }
  return out;
}
let dmgDepth = 0;
function damage0(s: GameState, what: 'quake' | 'flood' | 'fire' | 'snow' | 'slide' | 'wind' | 'tsunami' | 'liquefy', v: number, target = -1): string {
  // 自衛隊の駐屯地があると初動が早く被害が小さい。シェルターの整備（disasterDmg）も効く
  const st = s.stats, prep = st.pop > 0 ? Math.min(1, st.shelterCap / (st.pop * 0.4)) : 1, k = v * (1 - 0.5 * prep) * (1 + 0.2 * (0.6 - (st.access?.reach ?? 0.6))) /* v90：避難の情報が届きにくい住民への到達 */ * modMul(s, 'disasterDmg') * (hasOp(s, 'sdfBase') ? 0.8 : 1);
  let lost = 0, hit = 0;
  if (what === 'quake') {
    for (const b of s.buildings) {
      if (isRes(b.kind) && b.status === 'operating') { const f = 0.035 * k * (b.kind === 'house' ? 1.3 : 0.8); for (let t = 0; t < 5; t++) { lost += b.hh![t] * f; b.hh![t] *= 1 - f; } }
      else if (isCity(b.kind) && b.status === 'operating' && b.age > 40) { b.age = Math.min(99, b.age + 22 * k); hit++; }
    }
    for (let i = 0; i < W * H; i++) if ((s.road[i] === 1 || s.road[i] === 2) && rngNext(s) < 0.15) s.roadAge[i] = Math.min(100, s.roadAge[i] + 35 * k);
    s.modifiers.push({ key: 'waterCap', op: 'mul', v: 1 - 0.25 * k, until: s.month + 6, cost: 0, src: '地震による水道の被害' });
    return ` 被害：古い市の施設 ${hit} か所が傷み、市道の一部が壊れました。約 ${Math.round(lost)} 世帯が市外へ避難しました。備え（避難所・備蓄）の水準 ${Math.round(prep * 100)}%。`;
  }
  if (what === 'liquefy') {
    // 液状化：埋め立て地・湿地のそば・海抜の低い水辺で、地面が沈み、家が傾き、水道管と道路が壊れる
    for (const b of s.buildings) {
      const i = idx(b.x, b.y); if (!liquefyRisk(s, i)) continue;
      if (isRes(b.kind) && b.status === 'operating') { hit++; const f = 0.08 * k; for (let t = 0; t < 5; t++) { lost += b.hh![t] * f; b.hh![t] *= 1 - f; } }
      else if (isCity(b.kind)) b.age = Math.min(99, b.age + 18 * k);
    }
    for (let i = 0; i < W * H; i++) if ((s.road[i] === 1 || s.road[i] === 2) && liquefyRisk(s, i)) s.roadAge[i] = Math.min(100, s.roadAge[i] + 40 * k);
    return hit ? ` 埋め立て地や水辺で液状化が起き、住宅 ${hit} 棟が傾き、約 ${Math.round(lost)} 世帯が転居しました。` : '';
  }
  if (what === 'tsunami') {
    // 津波：v は波の高さ（m）。浸水の深さで被害が変わる。避難タワー・高台・高い建物が近いと逃げ遅れが少ない
    const wave = v, dep = tsunamiDepth(s, wave), towers = s.buildings.filter(b => b.kind === 'tsunamiTower' && b.status === 'operating').map(b => idx(b.x, b.y));
    let homes = 0, fac = 0, late = 0, wet = 0;
    for (const b of [...s.buildings]) {
      let d = 0; for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) d = Math.max(d, dep[idx(b.x + dx, b.y + dy)] ?? 0);
      if (d <= 0.1) continue;
      if (isRes(b.kind) && b.status !== 'construction') {
        wet++; const ev = evacOK(s, idx(b.x, b.y), wave, towers), hh = sumHH(b); late += hh * (1 - ev) * Math.min(1, d / 3) * 0.1;
        if (d >= 2 && (b.kind === 'house' || d >= 6) && rngNext(s) < Math.min(0.85, (d - 1.5) * 0.3)) { lost += hh; homes++; removeBuilding(s, b); continue; }
        const f = Math.min(0.7, 0.12 * d); for (let t = 0; t < 5; t++) { lost += b.hh![t] * f; b.hh![t] *= 1 - f; }
      } else if (isShop(b.kind) && d >= 1.5) { removeBuilding(s, b); fac++; }
      else if (b.status === 'operating' && b.kind !== 'tsunamiTower') { b.age = Math.min(99, b.age + Math.min(60, 20 * d) * (isCity(b.kind) ? 1 : 0.5)); fac++; }
    }
    for (let i = 0; i < W * H; i++) if (dep[i] > 0.3 && s.road[i] && s.road[i] !== 3) s.roadAge[i] = Math.min(100, s.roadAge[i] + Math.min(60, 25 * dep[i]));
    s.lastTsunami = { m: s.month, h: Math.round(wave * 10) / 10 };
    s.modifiers.push({ key: 'outflow', op: 'mul', v: 1.4, until: s.month + 18, cost: 0, src: '津波の被害（海辺から人が離れる）' });
    s.modifiers.push({ key: 'approval', op: 'add', v: -0.03 * Math.min(1, late / 50 + 0.3), until: s.month + 12, cost: 0, src: '津波の被害' });
    return ` 高さ約 ${wave.toFixed(1)}m の津波が押し寄せ、住宅 ${wet} 棟が浸水（うち ${homes} 棟が流され）、店や施設 ${fac} か所が被害を受けました。約 ${Math.round(lost)} 世帯が住まいを離れています。${late > 1 ? '高台や避難場所が遠い地区で、逃げ遅れた人が出ました。' : '避難が早く、逃げ遅れはほとんどありませんでした。'}${(s.levee ?? []).length ? `防潮堤（高さ ${SEAWALL_H}m）が${wave > SEAWALL_H ? '越えられましたが、勢いを弱めました' : '津波を食い止めました'}。` : ''}`;
  }
  if (what === 'flood') {
    const f = floodRisk(s), m = getMap(s.seed), basin = new Set(s.buildings.filter(b => fam(b.kind) === 'basin' && b.status === 'operating').map(b => m.district[idx(b.x, b.y)]));
    for (const b of s.buildings) {
      const i = idx(b.x, b.y); if (!f[i]) continue;
      const kk = k * (basin.has(m.district[i]) ? 0.5 : 1);
      if (isRes(b.kind) && b.status === 'operating') { hit++; for (let t = 0; t < 5; t++) { lost += b.hh![t] * 0.06 * kk; b.hh![t] *= 1 - 0.06 * kk; } }
      else if (isCity(b.kind)) b.age = Math.min(99, b.age + 12 * kk);
    }
    for (let i = 0; i < W * H; i++) if (f[i] && (s.road[i] === 1 || s.road[i] === 2)) s.roadAge[i] = Math.min(100, s.roadAge[i] + 20 * k);
    return ` 被害：川沿いの住宅 ${hit} 棟が浸水し、約 ${Math.round(lost)} 世帯が転居しました。`;
  }
  if (what === 'slide') {
    // 土砂崩れ：斜面に接する住宅のうち、最大 3 棟が被害を受ける。斜面沿いの市道も傷む
    const m = getMap(s.seed), near = (b: Building) => { for (let dy = -1; dy <= b.h; dy++) for (let dx = -1; dx <= b.w; dx++) { const x = b.x + dx, y = b.y + dy; if (x >= 0 && y >= 0 && x < W && y < H && m.steep[idx(x, y)]) return true; } return false; };
    const list = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating' && near(b));
    const n = Math.min(list.length, Math.max(1, Math.round(3 * k)));
    for (let j = 0; j < n; j++) { const b = list[Math.floor(rngNext(s) * list.length) % list.length]; if (!s.buildings.includes(b)) continue; lost += sumHH(b); removeBuilding(s, b); hit++; }
    for (let i = 0; i < W * H; i++) if (m.steep[i] && (s.road[i] === 1 || s.road[i] === 2)) s.roadAge[i] = Math.min(100, s.roadAge[i] + 30 * k);
    return ` 被害：斜面沿いの住宅 ${hit} 棟が土砂に巻き込まれ、${Math.round(lost)} 世帯が住まいを失いました。備え（避難所・備蓄）の水準 ${Math.round(prep * 100)}%。`;
  }
  if (what === 'wind' && target >= 0) {
    const tx = target % W, ty = (target / W) | 0;
    for (const b of s.buildings) {
      if (Math.abs(b.x - tx) > 2 || Math.abs(b.y - ty) > 2) continue;
      if (isRes(b.kind) && b.status === 'operating') { hit++; for (let t = 0; t < 5; t++) { lost += b.hh![t] * 0.25 * k; b.hh![t] *= 1 - 0.25 * k; } }
      else if (isCity(b.kind)) b.age = Math.min(99, b.age + 15 * k);
    }
    return ` 被害：住宅 ${hit} 棟の屋根や窓が壊れ、約 ${Math.round(lost)} 世帯が一時的に転居しました。`;
  }
  if (what === 'fire' && target >= 0) {
    const tx = target % W, ty = (target / W) | 0;
    const near = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating' && Math.abs(b.x - tx) <= 1 && Math.abs(b.y - ty) <= 1).slice(0, 2);
    for (const b of near) { lost += sumHH(b); removeBuilding(s, b); }
    return ` 住宅 ${near.length} 棟が焼け、${Math.round(lost)} 世帯が住まいを失いました。`;
  }
  return '';
}

export function addBuilding(s: GameState, kind: Building['kind'], x: number, y: number, status: Building['status'], months: number): Building {
  const d = DEFS[kind];
  const b: Building = {
    id: s.nextId++, kind, x, y, w: d.w, h: d.h, status, remain: months, total: Math.max(1, months), builtMonth: s.month, age: 0,
    v: (Math.imul(s.nextId, 2654435761) >>> 0) / 4294967296,
    acc: -1, connected: false, effCap: 0, used: 0, revenue: 0, shopP: 0, sv: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], sat: [0, 0, 0, 0, 0], unmet: 0,
  };
  if (d.units) { b.units = d.units; b.hh = [0, 0, 0, 0, 0]; }
  if (d.staffReq) { b.staff = 0; b.staffTarget = d.staffReq; }
  if (d.fixed) b.lossStreak = 0;
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) s.occ[idx(x + dx, y + dy)] = b.id;
  s.buildings.push(b);
  s.bVersion++;
  return b;
}

export function removeBuilding(s: GameState, b: Building): void {
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) { const i = idx(b.x + dx, b.y + dy); if (s.occ[i] === b.id) s.occ[i] = 0; }
  s.buildings = s.buildings.filter(o => o !== b);
  s.bVersion++;
}

/** 更新工事を始める（費用は着工時に全額） */
export function startRenew(s: GameState, b: Building): Result {
  const d = DEFS[b.kind];
  if (!d.renewCost) return { ok: false, msg: 'この施設は更新できません' };
  if (b.status !== 'operating' && b.status !== 'suspended') return { ok: false, msg: '工事中は更新を始められません' };
  if (s.cash < d.renewCost) return { ok: false, msg: `資金が足りません（更新費 ${d.renewCost.toLocaleString()} 万円）` };
  s.cash -= d.renewCost; s.pending.capital += d.renewCost;
  b.status = 'renewing'; b.remain = d.renewMonths; b.total = d.renewMonths;
  s.bVersion++;
  return { ok: true, msg: `${d.name}の更新工事を始めました`, cost: d.renewCost };
}

export function applyEffect(s: GameState, e: Effect, target: number, src: string): void {
  if ('delay' in e && e.delay && e.delay > 0) {
    s.scheduled.push({ due: s.month + e.delay, eff: { ...e, delay: 0 } as Effect, target, src });
    return;
  }
  switch (e.t) {
    case 'cash': { s.cash -= -e.v; s.pending.other += -e.v; break; } // 支払えるかは resolveEvent で事前に確かめる
    case 'mod': s.modifiers.push({ key: e.key, op: e.op, v: e.v, until: e.months < 0 ? -1 : s.month + e.months, cost: e.cost ?? 0, src }); break;
    case 'sat': for (const t of e.who) s.modifiers.push({ key: 'sat:' + t, op: 'add', v: e.v, until: s.month + e.months, cost: 0, src }); break;
    case 'age': for (const b of s.buildings) if (b.kind === e.kind && b.status !== 'construction') b.age = Math.max(0, Math.min(100, b.age + e.dv)); break;
    case 'renew': { const b = s.buildings.find(o => o.id === target) ?? s.buildings.find(o => fam(o.kind) === fam(e.kind) && (o.status === 'operating' || o.status === 'suspended')); if (b) startRenew(s, b); break; }
    case 'tempStaff': s.modifiers.push({ key: 'tempStaff:' + target, op: 'add', v: e.n, until: s.month + e.months, cost: 0, src }); break;
    case 'keepShop': { const b = s.buildings.find(o => o.id === target); if (b) { b.builtMonth = s.month; b.lossStreak = 0; } break; }
    case 'closeShop': { const b = s.buildings.find(o => o.id === target); if (b && rngNext(s) < e.prob) removeBuilding(s, b); break; }
    case 'expandPrivNursery': { const b = [...s.buildings].filter(o => o.kind === 'privNursery').sort((p, q) => designCap(s, p) - designCap(s, q) || p.id - q.id)[0]; if (b) s.modifiers.push({ key: 'privCap:' + b.id, op: 'add', v: e.add, until: -1, cost: 0, src }); break; }
    case 'openStore': {
      const x = target % W, y = (target / W) | 0, d = DEFS[e.kind];
      let ok = target >= 0;
      for (let dy = 0; dy < d.h && ok; dy++) for (let dx = 0; dx < d.w; dx++) { const i = idx(x + dx, y + dy); if (s.occ[i] || s.road[i] || (s.levee ?? []).includes(i) || (s.canal ?? []).includes(i) || (s.rail?.[i] && (s.railGrade?.[i] ?? 0) !== 2)) { ok = false; break; } }
      if (ok) { for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) s.zone[idx(x + dx, y + dy)] = 4; addBuilding(s, e.kind, x, y, 'construction', d.months); }
      break;
    }
    case 'fame': s.fame = Math.max(0, Math.min(100, (s.fame ?? 0) + e.v)); break;
    case 'approval': s.approval = Math.max(0.02, Math.min(0.98, (s.approval ?? 0.5) + e.v)); break;
    case 'teamAdj': {
      const sp = (['soccer', 'baseball', 'basket'] as const)[target], tm = (s.teams ?? []).find(o => o.sport === sp); if (!tm) break;
      if (e.remove) { s.teams = (s.teams ?? []).filter(o => o !== tm); s.notes.push(`${tm.name}が本拠地を市外へ移しました`); break; }
      if (e.fans) tm.fans = Math.round(Math.max(0, Math.min(1, tm.fans + e.fans)) * 1000) / 1000;
      if (e.power) tm.power = Math.round(Math.max(0, Math.min(1, (tm.power ?? 0.35) + e.power)) * 1000) / 1000;
      break;
    }
    case 'shin': { const b = s.buildings.find(o => o.id === target && o.kind === 'station'); if (b && !s.buildings.some(o => o.shin !== undefined)) b.shin = s.month + e.months; break; }
    case 'recover': {
      for (let i = 0; i < W * H; i++) if ((s.road[i] === 1 || s.road[i] === 2) && s.roadAge[i] > 55) s.roadAge[i] = Math.max(0, Math.round((s.roadAge[i] - 35 * e.v) * 100) / 100);
      for (const b of s.buildings) if (isCity(b.kind) && b.status === 'operating' && b.age > 45) b.age = Math.max(0, Math.round((b.age - 18 * e.v) * 100) / 100);
      break;
    }
    case 'team': if (!(s.teams ?? []).some(t => t.sport === e.sport)) { const t = addTeam(s, e.sport); s.notes.push(`「${t.name}」が誕生しました`); } break;
    case 'neighbor': for (const n of s.neighbors ?? []) n.rel = Math.max(0, Math.min(1, n.rel + e.v)); break;
    case 'damage': damage(s, e.what, e.v, target); break;
    case 'place': {
      const d = DEFS[e.kind]; if (target < 0) break;
      const x = target % W, y = (target / W) | 0;
      let ok = x + d.w <= W && y + d.h <= H;
      for (let dy = 0; dy < d.h && ok; dy++) for (let dx = 0; dx < d.w; dx++) { const i = idx(x + dx, y + dy); if (s.occ[i] || s.road[i] || (s.levee ?? []).includes(i) || (s.canal ?? []).includes(i) || (s.rail?.[i] && (s.railGrade?.[i] ?? 0) !== 2)) { ok = false; break; } }
      if (ok) { const b = addBuilding(s, e.kind, x, y, 'construction', d.months); b.tries = 2; } // 打診からの進出は、まとまりやすい（交渉の失敗は 1 回まで）
      break;
    }
    case 'roadBoost': {
      if (target < 0) break;
      const x0 = target % W, y0 = (target / W) | 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const i = idx(x, y); if (s.road[i] === 1 || s.road[i] === 2) s.roadBoost[i] = Math.min(1.6, (s.roadBoost[i] ?? 1) * e.v);
      }
      break;
    }
  }
}

/** 月次：条件判定と発生。予測中は呼ばない */
export function tickEvents(s: GameState): void {
  // 放置されたイベントは最後の選択肢で終結
  for (const inst of [...s.events.active]) {
    const def = eventDef(inst.id);
    if (s.month - inst.start >= def.expire) resolveEvent(s, inst.id, def.options.length - 1, true);
  }
  let fired = false;
  // できごとが続きすぎないよう、前のできごとから 2 か月は、災害や景気など突然起きるもの以外は起こさない
  const lastStart = Math.max(-99, ...s.events.active.map(a => a.start), ...s.events.log.map(l => l.month));
  const calm = s.month - lastStart < 2;
  for (const def of EVENTS) {
    const c = def.cond(s);
    s.streak[def.id] = c ? (s.streak[def.id] ?? 0) + 1 : 0;
    if (!c || fired || s.events.active.length >= 2) continue;
    if (s.events.active.some(a => a.id === def.id)) continue;
    if ((s.events.cooldown[def.id] ?? -1) > s.month) continue;
    if (s.streak[def.id] < def.minStreak) continue;
    if (def.once && s.events.log.some(l => l.id === def.id)) continue;
    if (calm && !def.hit) continue;
    if (def.prob >= 1 || rngNext(s) < def.prob * (def.hit ? Math.min(1, diffOf(s).events * 1.1) : diffOf(s).events)) {
      const extra = def.hit ? def.hit(s, c.target) : '';
      s.events.active.push({ id: def.id, start: s.month, target: c.target, detail: (c.detail + extra).slice(0, 3900) });
      s.events.cooldown[def.id] = s.month + Math.max(def.cooldown, def.once ? 100000 : 0);
      fired = true;
    }
  }
}

export function resolveEvent(s: GameState, id: string, option: number, auto = false): Result {
  const inst: EventInstance | undefined = s.events.active.find(a => a.id === id);
  if (!inst) return { ok: false, msg: 'そのイベントは終わっています' };
  const def = eventDef(id), opt = def.options[option];
  if (!opt) return { ok: false, msg: '選択肢がありません' };
  const renewB = s.buildings.find(o => o.id === inst.target);
  const need = Math.max(opt.cost, opt.effects.reduce((a, e) => a + (e.t === 'cash' && !('delay' in e && e.delay) ? -e.v : e.t === 'renew' ? DEFS[renewB?.kind ?? e.kind].renewCost : 0), 0));
  // 資金が足りないときも選べるようにする（足りない分は自動で一時借入。高い利子がつく）。どの選択肢も選べず先へ進めなくなるのを防ぐ
  let borrowed = 0;
  if (need > s.cash + 1e-6) { borrowed = Math.ceil((need - Math.max(0, s.cash)) / 100) * 100; s.loans.push({ principal: borrowed, remaining: borrowed, rate: P.tempRate, months: P.tempMonths, kind: 'temp' }); s.cash += borrowed; s.pending.borrowed += borrowed; }
  if (opt.effects.some(e => e.t === 'renew') && !s.buildings.some(b => fam(b.kind) === fam((opt.effects.find(x => x.t === 'renew') as any).kind) && (b.status === 'operating' || b.status === 'suspended'))) return { ok: false, msg: '更新できる施設がありません（工事中です）' };
  for (const e of opt.effects) applyEffect(s, e, inst.target, def.title);
  s.events.active = s.events.active.filter(a => a !== inst);
  const st = s.stats;
  const before = { wait: Math.round(st.waitlist * 10) / 10, maxVc: Math.round(st.maxVc * 1000) / 1000, cash: Math.round(s.cash), op: Math.round(s.ledger.at(-1)?.operating ?? 0), sat: st.satDistrict.map(v => Math.round(v * 1000) / 1000) };
  s.events.log.push({ id, month: s.month, title: def.title, choice: opt.label + (auto ? '（期限切れで自動）' : ''), detail: inst.detail, before });
  if (s.events.log.length > 40) s.events.log.shift();
  recompute(s);
  return { ok: true, msg: `「${opt.label}」を選びました${borrowed ? `。資金が足りない ${borrowed.toLocaleString()} 万円は一時借入（年利 ${P.tempRate * 100}%）でまかないました` : ''}`, cost: opt.cost };
}
