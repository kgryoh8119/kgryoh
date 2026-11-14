// 設定データ。ここの数値は全てゲーム用の仮定で、実在の制度・統計の値ではない。
// 係数・施設・政策はこのファイルを書き換えれば変えられる。
import type { Kind, Pledge } from './types';
import { LOOP_POLICIES } from './loopPolicies';

import { REAL, MAP_ID, onMapChange } from './real';
import { mapEntry } from '../maps/registry';

/** 地図の大きさ（区画数）。実在都市版では取り込んだ地図の大きさ（地図を選ぶと変わる） */
export let W = 128;
export let H = 112;
/** 架空の街（住野市）の大きさ。v9 で 44×44 から 76×68 へ、v87 で 128×112（約 3.8km×3.4km）へ、東と南へ広げた（古い保存データは読込時に広げる）。
 *  FIC_PREV は v86 までの大きさ。はじめの町はこの中だけに置き、広げた土地は開発の余地として空けておく */
export const FIC_W = 128, FIC_H = 112, FIC_OLD = 44, FIC_PREV_W = 76, FIC_PREV_H = 68;
/** 実在都市版の規模（架空の街の何倍の世帯がいるか）。予算・転入などの係数に掛ける */
export let SCALE = 1;
/** 市債の残高上限：街が大きくなると返せる力（税収）も増えるので、人口に合わせて最大 3 倍まで広がる */
export const bondCap = (s: { stats: { pop: number }; fiscal?: { status: string } }) => Math.round(P.bondLimit * Math.max(1, Math.min(3, (s.stats?.pop ?? 0) / (5500 * SCALE))) * (s.fiscal?.status === 'rebuild' ? 0 : s.fiscal?.status === 'early' ? 0.6 : 1) / 1000) * 1000; // 早期健全化団体は 6 割まで、財政再生団体は発行できない
/** 1 タイルの一辺（m） */
export const TILE = 30;

export const P = {
  startCash: 26000,          // 開始時の資金（万円）
  termMonths: 48,
  shortTermMonths: 24,
  pledgeWait: 10, pledgeVc: 1.0, // 公約の目標（待機児童の人数、最大混雑率）
  voteCenter: 0.681,          // 得票 50% になる暮らしの満足度

  // --- 世帯類型：[単身, 夫婦のみ, 子育て(未就学), 子育て(就学), 高齢] ---
  persons: [1, 2, 3.7, 3.9, 1.7],
  workers: [0.9, 1.6, 1.5, 1.6, 0.2],
  preschool: [0, 0, 1.15, 0.1, 0],   // 未就学児（人/世帯）
  schoolKids: [0, 0, 0.3, 1.35, 0],  // 小学生（人/世帯）
  income: [24, 42, 44, 50, 22],      // 世帯月収（万円/月）
  turnout: [0.35, 0.5, 0.5, 0.55, 0.7],
  /** 月あたりの類型遷移率 [from, to, rate]。to=-1 は市外・施設等へ */
  transitions: [
    [0, 1, 0.004], [1, 2, 0.006], [2, 3, 1 / 66], [3, 1, 1 / 110], [1, 4, 0.0035], [4, -1, 0.004],
  ] as [number, number, number][], // v86：夫婦のみ → 高齢を 0.002 → 0.0035（平均 24 年）。v85 では子育てを終えた夫婦が 40 年以上かけて高齢になり、20 年で高齢化率が 15% → 6% に下がり続けていた
  /** 転入希望（世帯/月）。駅前開発で子育て世帯が多いシナリオ */
  baseInflow: [7, 7, 12, 4, 3],
  baseOutRate: 0.006,                 // 月あたりの基礎転出率
  /** v86：類型ごとの転出のしやすさ（baseOutRate に掛ける）。単身は転勤・進学でよく動き、子育て・高齢の世帯は動きにくい。
   *  はじめの街の平均はほぼ 1（v85 と同じ総量）。v85 は全類型が年 7% で入れ替わり、住民が高齢になる前に出ていって高齢化が進まなかった */
  outByType: [2.0, 1.0, 0.8, 0.6, 0.3],
  /** 住宅の好み [類型][house, apartment, mansion] */
  housingPref: [
    [0.2, 1, 0.8], [0.6, 0.8, 1], [0.9, 0.6, 1], [1, 0.4, 0.6], [1, 0.6, 0.3],
  ],
  rent: { house: 7, apartment: 7.5, mansion: 11, towerMansion: 14, danchi: 5, newTown: 7.5, shataku: 4, studentDorm: 4, shareHouse: 5, sakouju: 12, yuryoRojin: 16, groupHome: 10, nagaya: 4.5, kominka: 5, besso: 9, nisetai: 8.5, hiraya: 7, garageHouse: 9, gatedTown: 16, tinyVillage: 4, kasetsu: 0.5, jiritsu: 1, kaitaku: 2 } as Record<string, number>, // 住居費（万円/月）
  targetVacancy: 0.05,

  // --- 保育・学校 ---
  careUseRate: 0.4,    // 未就学児のうち保育利用を希望する割合
  careRange: 30,        // 保育園の利用圏（道路タイル数）
  schoolRange: 50,
  jhsKids: [0, 0, 0, 0.6, 0],        // 中学生（人/世帯）
  jhsRange: 70,
  elderNeedRate: 0.035,              // 高齢世帯のうち施設への入所が必要な割合（人/世帯）
  baseMargin: 1.3,                   // 市外からまかなう能力（電力・下水・ガス）は、はじめの需要のこの倍
  visitorSpend: 0.25,                // 来訪者 1 人が市内の店で使う額（万円）
  stayShare: 0.12,                   // 来訪者のうち市内に泊まる割合（ホテルがある場合）
  stayTax: 0.02,                     // 宿泊税（万円/人泊）
  parkRange: 15,
  fireRange: 60,

  // --- 商業 ---
  retailShare: 0.2,     // 世帯月収のうち市内小売に向かいうる割合
  outsideWeight: 0.35,  // 市外・通販へ流れる重み
  margin: 0.3,          // 粗利率
  openRatio: 1.15,      // 見込み売上 ÷ 採算売上 がこれ以上で出店を検討
  openProb: 0.3,
  closeStreak: 4,       // 赤字がこの月数続くと閉店

  // --- 交通（朝の通勤時間帯）---
  carShare: 0.4,       // 就業者のうち車で市外へ通勤する割合
  railShare: 0.45,      // 駅を使う割合
  railCarShare: 0.5,    // 駅利用者のうち車で駅へ向かう割合
  peakFactor: 0.8,      // 1 時間に集中する割合
  shopTrip: 0.1,       // 世帯あたり買物等の車利用（台/時）
  throughTraffic: 420,  // 国道の通過交通（台/時）
  roadCap: [0, 240, 700, 1600],   // 道路容量（台/時）
  roadSpeed: [0, 25, 40, 50],      // 自由走行速度（km/h）

  // --- 道路 ---
  roadCost: [0, 120, 320, 0],      // 建設費（万円/タイル）
  roadUpkeep: [0, 1.2, 3, 0],      // 維持費（万円/タイル/月）。国道は国が負担
  // --- 線路（まちづくり版）：市が費用を負担して鉄道事業者に敷設・複線化してもらう（ゲーム用の仮定）---
  railCost: [0, 2400, 4000, 7000], // 敷設費（万円/区画）。単線・複線・複々線。増やすときは差額
  railRemoveCost: 300,
  railUpkeep: [0, 4, 6, 9],           // 市が敷いた線路の負担金（万円/区画/月）。高架・地下は railGradeMul の半分ほど割り増し
  railGradeMul: [1, 2.5, 5, 3.2],  // 線路の敷設費の倍率（地上・高架・地下・掘割）
  railKindCost: [0, 5000, 5500], // 線の種類を変える費用（モノレール・新交通。高架の軌道を含む。万円/区画）
  railGradeCost: [1500, 6000, 12000, 8000], // 線路の高さを変える費用（地上へ戻す・高架化・地下化・掘割。万円/区画。複線は 1.4 倍、複々線は 2 倍）
  crossingDelay: [0, 0.8, 1.6, 2.8], // 踏切で車が待つ時間（分/回。単線・複線・複々線）
  stationCap: [0, 450, 1400, 2600],
  stationUpCost: [0, 30000, 70000],  // 駅ビル化（レベル 2）と大型ターミナル（レベル 3）の市の負担（万円）
  stationUpMonths: [0, 24, 36],
  shinCost: 50000, shinMonths: 72, // 新幹線の新駅：地元の負担と整備の期間      // 駅を朝 1 時間に使える人数（面する線路が単線・複線）
  roadRemoveCost: 30,
  tunnelCost: [0, 2400, 3600],     // トンネル（万円/区画）。生活道路・幹線道路
  bridgeCost: [0, 3200, 5200],     // 橋（万円/区画）。川・水路の上の道路
  overpassCost: 9000,              // 陸橋（跨線橋）で踏切をなくす（万円/か所）
  footbridgeCost: 1500,            // 歩道橋（万円/か所）
  canalCost: 1600,                 // 水路・運河を掘る（万円/区画）
  leveeCost: 2500,                 // 堤防（万円/区画）
  terraCost: { raise: 400, lower: 400, flatten: 300, hill: 500, mountain: 900, valley: 600, cliff: 800, water: 700, fill: 1800, forest: 150, clear: 120, wet: 400, sand: 250, desert: 250, snow: 250, reset: 200 } as Record<string, number>, // 地形の造作（万円/区画）
  wideCost: 3000,                  // 幹線を 6 車線に（万円/区間）
  wideCap: 1.5,                    // 6 車線の容量（4 車線の何倍か）
  flyoverCost: 15000,              // 立体交差（万円/か所）
  busStopCost: 150, busStopSubsidy: 3,
  streetCost: { tree: 120, stone: 220, nopole: 700, charge: 900 } as Record<string, number>, // 並木・石畳・無電柱化（万円/区間） // バス停の設置（万円）と、路線の運行補助（万円/月/停留所）
  airportUpCost: [0, 0, 40000, 90000], // 空港の拡張（滑走路の延長・国際線ターミナル）
  /** 財政指標の基準（地方公共団体財政健全化法）：実質公債費比率と将来負担比率 */
  fiscalEarly: { kosai: 0.25, shorai: 3.5 }, fiscalRebuild: { kosai: 0.35 },
  /** 平年の降水量（mm/月、暦の 1〜12 月）。日本の内陸の街を想定 */
  rainNormal: [50, 60, 110, 120, 140, 190, 180, 150, 210, 170, 90, 50],
  roadRepairCost: 45,
  roadAgeRate: 0.22,               // 老朽度/月（交通量で増える）

  // --- 民間開発 ---
  devProb: [0, 0.34, 0.24, 0.16, 0],   // 用途ごとの月あたり着工確率（需要が十分なとき）
  devMaxStarts: 4,
  acqTile: 2000,              // 実在都市版：用地買収の費用（1 区画あたり、万円）
  acqUnit: 600,               // 実在都市版：用地買収の補償（1 戸あたり、万円）
  cremOut: 8,                 // 隣の市の火葬場に頼むときの上乗せ（万円/件）
  redevAge: 180,              // 架空の街：建ってからこの月数（15 年）たった住宅は、用途を引き上げると建て替えの対象になる
  redevRate: 0.35,            // 実在都市版：用途を引き上げた既存住宅の建て替えの起こりやすさ（新規の着工に対する比）
  mansionStationRange: 22,
  towerStationRange: 8,                 // タワーマンションは駅からこの距離以内（人口 2 万人以上）
  towerPop: 20000,              // 高層は駅からこの距離以内でのみ分譲マンションになる

  // --- 財政（万円/月）---
  residentTaxRate: 0.055,     // 住民税相当：世帯収入に対する率
  propertyTaxPerUnit: 1.05,   // 固定資産税相当：住戸あたり
  businessTaxRate: 0.03,      // 事業課税相当：店舗売上に対する率
  // 移転収入（中学校の維持費の分を含む）。v86：地方交付税の「財源保障・調整」の仕組みを入れた。
  // 交付税 = 基準財政需要額（transferBase + needPerCapita × 人口）− 標準的な税収 × kofuOffset（0 未満は 0＝不交付団体）。
  // 国県支出金 = transferPerCapita × 人口。v85 までは「1950 + 0.46 × 人口」で、税収が増えても移転収入が減らず、街が育つほど黒字が膨らんでいた。
  // はじめの街（住野市・稲穂町）で v85 と同じ額になるよう合わせてある（ゲーム用の仮定）
  transferBase: 1609, needPerCapita: 1.25, transferPerCapita: 0.25, kofuOffset: 0.75,
  needPerElder: 0.3,         // v86：基準財政需要額の高齢者の分（高齢者 1 人あたり。福祉の費用 elderCost の半分を交付税で見る）
  adminBase: 3600, adminPerCapita: 0.51,          // 基礎行政費（施設以外の全て）。v86：0.6 → 0.51（高齢者の福祉の分を elderCost に分けた）
  elderCost: 0.6,             // v86：高齢者 1 人あたりの福祉・介護・医療の市の負担（扶助費・介護保険と後期高齢者医療への繰出金に相当、万円/人/月）。高齢化が進むほど歳出が増える
  privNurserySubsidy: 2.2,    // 私立保育園への運営費補助（万円/利用児/月）
  bondRate: 0.015, bondMonths: 240, bondLimit: 120000, bondUnit: 5000, // v86：上限 6 億 → 12 億（返済期間を 2 倍にしたので、上限まで借りたときの毎年の元金返済は v85 と同じ）。返済 120 → 240 か月（施設の地方債は 20〜30 年の償還が多い）。交付税の調整で黒字が細ったので、10 年返済だと元金返済が黒字を上回り、借りて育てる手が打てなかった
  tempRate: 0.04, tempMonths: 24,
  tempLimit: 20000,           // 一時借入の残高がこれを超えると財政危機（新しい建設・道路・政策の開始ができない）
  demolishRate: 0.1,          // 撤去費＝建設費×この率
  cancelRefund: 0.5,
};

export type Authority = 'direct' | 'attract' | 'consult';
/** 市がどう関わって建つか：city 市が建てて運営／request 市が用地・負担金を出して事業者に設置を求める（協議）／invite 市が用地を整えて企業を誘致／none 市は建てられない */
export type Build = 'city' | 'request' | 'invite' | 'none';
/** 施設の系統（同じ働きをするサイズ違いをまとめる） */
export type Fam = 'res' | 'shop' | 'care' | 'privCare' | 'school' | 'jhs' | 'high' | 'park' | 'fire' | 'water' | 'sewage' | 'waste' | 'power' | 'gas' | 'telecom'
  | 'health' | 'safety' | 'library' | 'culture' | 'welfare' | 'shelter' | 'basin' | 'biz' | 'station'
  | 'transport' | 'gov' | 'univ' | 'leisure' | 'agri' | 'religion' | 'funeral';
/** 建設メニューの分類 */
export type Cat = 'kids' | 'edu' | 'park' | 'safety' | 'infra' | 'health' | 'transport' | 'gov' | 'landmark' | 'history' | 'leisure' | 'nature' | 'funeral' | 'biz' | 'agri' | 'industry' | 'commerce' | 'housing' | 'other';
export const CAT_NAMES: Record<Cat, string> = { kids: '子育て', edu: '教育・文化', park: '公園・スポーツ', safety: '消防・防災・治安', infra: '水道・電気・ガス・ごみ', health: '医療・福祉', transport: '交通・広域', gov: '官公庁', landmark: 'ランドマーク・大型施設', history: '寺社・城・歴史', funeral: '葬祭', leisure: 'レジャー・商業', nature: '自然・農業', biz: '企業誘致', agri: '農林水産業', industry: '工場・鉱業・処理', commerce: '店・サービス', housing: '住まい', other: 'その他' };

export interface Def {
  name: string;
  owner: string;         // 所有・運営主体
  authority: Authority;  // 市長が直接建設できるか／誘致・補助の対象か／協議のみか
  note: string;
  w: number; h: number;
  cost: number;          // 建設費（万円）
  months: number;        // 工期（月）
  upkeep: number;        // 維持費（万円/月）
  staffReq: number;      // 必要職員（人）
  staffKind: string;
  wage: number;          // 人件費（万円/人/月）。市が負担しない場合は 0
  hire: number;          // 月あたり採用できる上限（人）
  capacity: number;      // 設計容量
  capUnit: string;
  ageRate: number;       // 老朽度/月
  renewCost: number; renewMonths: number; renewFactor: number;
  jobs?: number;         // 店舗の雇用（人）
  fixed?: number;        // 店舗の月固定費（万円）
  attract?: number;      // 店舗の集客力
  range?: number;        // 店舗の商圏（道路タイル数）
  units?: number;        // 住宅の戸数
  floors?: number;
  // --- v5 ---
  fam: Fam; cat: Cat; build: Build;
  /** 利用・到達の範囲（道路の区画数） */
  reach?: number;
  /** 電力などの使用量（世帯相当）。住宅・店は計算で決める */
  use?: number;
  /** 発電量（世帯相当） */
  gen?: number;
  /** 大気への負荷（工場 3 程度） */
  pollution?: number;
  /** 月あたりの来訪者（人） */
  visitors?: number;
  /** 知名度への寄与 */
  fame?: number;
  /** 事業所からの税（法人の市民税・固定資産税など、万円/月） */
  bizTax?: number;
  /** 施設の収入（売電など、万円/月） */
  income?: number;
  /** 誘致・設置の条件 */
  req?: 'arterial' | 'station' | 'power' | 'fame' | 'big' | 'water' | 'mountain' | 'nature' | 'forest' | 'geo' | 'open' | 'dam';
  /** サプライチェーン：市内にこのどれか（防衛装備品工場はすべて）があると本来の売上（ないと減る） */
  chain?: Kind[];
  /** 緑の量（空気をきれいにする。公園は 1） */
  green?: number;
  /** 市に 1 か所だけ */
  unique?: boolean;
  /** このビジョンを選んだ市長だけが建てられる（ビジョン専用の施設） */
  vision?: string;
  /** 使えるようになる年（ゲームの何年目か。新しい技術） */
  unlock?: number;
  /** 増築できる最大のレベル（0 は増築なし） */
  lvMax?: number;
  /** v88：無人島のシナリオだけで建てられる */
  isle?: boolean;
}

const base = { staffReq: 0, staffKind: '', wage: 0, hire: 0, capacity: 0, capUnit: '', ageRate: 0, renewCost: 0, renewMonths: 0, renewFactor: 1, upkeep: 0, cost: 0 };
const priv = { ...base, owner: '民間', authority: 'attract' as Authority, w: 1, h: 1 };
const city = (fam: Fam, cat: Cat) => ({ ...base, owner: '市', authority: 'direct' as Authority, fam, cat, build: 'city' as Build, lvMax: 3 });
const req = (fam: Fam, cat: Cat, owner: string) => ({ ...base, owner, authority: 'consult' as Authority, fam, cat, build: 'request' as Build });
const inv = (owner: string) => ({ ...base, owner, authority: 'attract' as Authority, fam: 'biz' as Fam, cat: 'biz' as Cat, build: 'invite' as Build });

export const DEFS: Record<Kind, Def> = {
  house: { ...priv, fam: 'res', cat: 'other', build: 'none', name: '戸建て住宅', note: '低層住宅の用途指定をした区画に、需要があれば民間が建てます。', months: 2, units: 4 },
  apartment: { ...priv, fam: 'res', cat: 'other', build: 'none', name: '集合住宅', note: '中層住宅の用途指定をした区画に民間が建てます。', months: 4, units: 14 },
  towerMansion: { ...priv, fam: 'res', cat: 'other', build: 'none', name: 'タワーマンション', note: '高層住宅の用途指定で、駅のすぐ近く（道路で約 240m 以内）に、人口 2 万人以上の街で大手デベロッパーが建てる 40 階前後の超高層マンション。1 区画で 150 戸。共働きの子育て世帯に人気で、保育と小学校が一気に足りなくなりがちです。', months: 30, units: 150 },
  mansion: { ...priv, fam: 'res', cat: 'other', build: 'none', name: '分譲マンション', note: '高層住宅の用途指定で、駅に近い区画に民間が建てます。', months: 8, units: 40 },
  bakery: { ...priv, fam: 'shop', cat: 'other', build: 'none', name: 'パン屋', note: '商業区画に、商圏の需要が採算を超えると民間が開業します。', months: 2, jobs: 4, fixed: 150, attract: 1, range: 16 },
  shop: { ...priv, fam: 'shop', cat: 'other', build: 'none', name: '商店・飲食店', note: '商業区画に、商圏の需要が採算を超えると民間が開業します。', months: 2, jobs: 6, fixed: 300, attract: 1.6, range: 22 },
  konbini: { ...priv, fam: 'shop', cat: 'other', build: 'none', name: 'コンビニ', note: '商業区画に、商圏の需要が採算を超えると民間が開業します。24 時間あいていて、少ない世帯でも成り立ちます。', months: 2, jobs: 8, fixed: 260, attract: 1.3, range: 20 },
  cafe: { ...priv, fam: 'shop', cat: 'other', build: 'none', name: 'カフェ', note: '商業区画に、商圏の需要が採算を超えると民間が開業します。', months: 2, jobs: 5, fixed: 180, attract: 1.05, range: 15 },
  drugstore: { ...priv, fam: 'shop', cat: 'other', build: 'none', name: 'ドラッグストア', note: '商業区画に、商圏の需要が採算を超えると民間が開業します。薬と日用品、食品も扱います。', months: 3, jobs: 14, fixed: 650, attract: 2.4, range: 32 },
  supermarket: { ...priv, fam: 'shop', cat: 'other', build: 'none', name: 'スーパー', note: '幹線道路か国道に面した 2×2 の商業区画に出店します。', w: 2, h: 2, months: 5, jobs: 40, fixed: 1500, attract: 6, range: 48 },
  // ---- 子育て ----
  nurseryS: {
    ...city('care', 'kids'), name: '小規模保育所', note: '0〜2 歳児向けの小さな保育所。安く早く建ち、空き店舗や住宅地の 1 区画に置けます。', lvMax: 0,
    w: 1, h: 1, cost: 4500, months: 4, upkeep: 40, staffReq: 6, staffKind: '保育士', wage: 24, hire: 1, capacity: 19, capUnit: '人', ageRate: 0.2, renewCost: 2500, renewMonths: 3, renewFactor: 0.5,
  },
  nursery: {
    ...city('care', 'kids'), name: '市立保育園', note: '市が建設・運営します。保育士が足りないと定員まで受け入れられません。',
    w: 1, h: 1, cost: 13000, months: 8, upkeep: 100, staffReq: 18, staffKind: '保育士', wage: 24, hire: 1, capacity: 90, capUnit: '人',
    ageRate: 0.2, renewCost: 7000, renewMonths: 5, renewFactor: 0.5,
  },
  nurseryL: {
    ...city('care', 'kids'), name: '大型保育園（子育て支援センター併設）', note: '定員の大きな園。子育て相談の窓口もあり、子育て世帯の満足が少し上がります。',
    w: 2, h: 1, cost: 26000, months: 12, upkeep: 190, staffReq: 32, staffKind: '保育士', wage: 24, hire: 1, capacity: 170, capUnit: '人', ageRate: 0.18, renewCost: 13000, renewMonths: 6, renewFactor: 0.5,
  },
  privNursery: {
    ...base, fam: 'privCare', cat: 'kids', build: 'none', name: '私立保育園', owner: '社会福祉法人（民間）', authority: 'attract', note: '民間が運営します。市は運営費補助と協議で関わり、職員配置は直接決められません。',
    w: 1, h: 1, months: 8, staffReq: 12, staffKind: '保育士', hire: 1, capacity: 70, capUnit: '人', ageRate: 0.1,
  },
  // ---- 教育 ----
  school: {
    ...city('school', 'edu'), name: '市立小学校', owner: '市（教職員は県が配置）', note: '校舎は市が建設・維持します。教職員は県が配置し、人件費は市の負担になりません（簡略化）。災害時は避難所になります。',
    w: 3, h: 2, cost: 30000, months: 12, upkeep: 380, staffReq: 26, staffKind: '教職員（県費）', wage: 0, hire: 4, capacity: 660, capUnit: '人',
    ageRate: 0.18, renewCost: 20000, renewMonths: 8, renewFactor: 0.7,
  },
  jhs: {
    ...city('jhs', 'edu'), name: '市立中学校', owner: '市（教職員は県が配置）', note: '中学生が通います。ないと市外や遠くの中学校へ通うことになり、子育て（就学）世帯の満足が下がります。災害時は避難所になります。',
    w: 3, h: 2, cost: 34000, months: 14, upkeep: 420, staffReq: 30, staffKind: '教職員（県費）', wage: 0, hire: 4, capacity: 600, capUnit: '人', ageRate: 0.18, renewCost: 22000, renewMonths: 8, renewFactor: 0.7,
  },
  highschool: {
    ...req('high', 'edu', '県（県立高校）'), name: '県立高校', note: '県が設置します。市は用地を提供して誘致を働きかけます。若い世帯の満足と、街のにぎわいが少し上がります。',
    w: 3, h: 2, cost: 6000, months: 30, capacity: 720, capUnit: '人', jobs: 60, reach: 120, use: 30,
  },
  libraryS: {
    ...city('library', 'edu'), name: '図書館分館', note: '地区の小さな図書館。学習と文化の満足が上がります。', lvMax: 0,
    w: 1, h: 1, cost: 5000, months: 6, upkeep: 60, staffReq: 4, staffKind: '司書', wage: 26, hire: 1, capacity: 8000, capUnit: '人（利用圏の人口）', reach: 30, ageRate: 0.15, renewCost: 2500, renewMonths: 3, renewFactor: 0.5,
  },
  library: {
    ...city('library', 'edu'), name: '中央図書館', note: '蔵書の多い中央館。広い範囲の学習と文化を支えます。',
    w: 2, h: 2, cost: 26000, months: 16, upkeep: 260, staffReq: 14, staffKind: '司書', wage: 26, hire: 1, capacity: 30000, capUnit: '人（利用圏の人口）', reach: 70, ageRate: 0.12, renewCost: 13000, renewMonths: 8, renewFactor: 0.6, visitors: 300,
  },
  // ---- 公園・スポーツ ----
  park: {
    ...city('park', 'park'), name: '街区公園', owner: '市', note: '身近な小さな公園。管理は委託で、維持費に含みます。', lvMax: 0,
    w: 1, h: 1, cost: 2400, months: 3, upkeep: 26, capacity: 400, capUnit: '世帯', ageRate: 0.15, renewCost: 1000, renewMonths: 2, renewFactor: 0.3,
  },
  parkM: {
    ...city('park', 'park'), name: '近隣公園', note: '遊具と広場のある公園。利用圏が広く、空気をきれいにします。', lvMax: 0,
    w: 2, h: 2, cost: 9000, months: 6, upkeep: 70, capacity: 1200, capUnit: '世帯', reach: 24, ageRate: 0.12, renewCost: 4000, renewMonths: 3, renewFactor: 0.4,
  },
  parkL: {
    ...city('park', 'park'), name: '総合公園（運動場つき）', note: '運動場・池・芝生のある大きな公園。スポーツと文化の満足、空気、災害時の避難場所にも効きます。', lvMax: 0,
    w: 3, h: 3, cost: 32000, months: 12, upkeep: 200, staffReq: 3, staffKind: '管理職員', wage: 28, hire: 1, capacity: 3000, capUnit: '世帯', reach: 40, ageRate: 0.1, renewCost: 12000, renewMonths: 6, renewFactor: 0.5, visitors: 1500, fame: 2,
  },
  gym: {
    ...city('culture', 'park'), name: '体育館・スポーツセンター', note: '屋内のスポーツ施設。文化・スポーツの満足が上がり、災害時は避難所になります。',
    w: 2, h: 2, cost: 20000, months: 14, upkeep: 160, staffReq: 4, staffKind: '管理職員', wage: 28, hire: 1, capacity: 15000, capUnit: '人（利用圏の人口）', reach: 60, ageRate: 0.15, renewCost: 9000, renewMonths: 6, renewFactor: 0.5, visitors: 500,
  },
  // ---- 消防・防災・治安 ----
  fireS: {
    ...city('fire', 'safety'), name: '消防出張所', note: '小さな消防拠点。到達範囲は狭いですが安く建ちます。', lvMax: 0,
    w: 1, h: 1, cost: 9000, months: 8, upkeep: 120, staffReq: 10, staffKind: '消防隊員', wage: 42, hire: 2, capacity: 40, capUnit: 'タイル（到達範囲）', ageRate: 0.15, renewCost: 4500, renewMonths: 4, renewFactor: 0.7,
  },
  fire: {
    ...city('fire', 'safety'), name: '消防署', owner: '市', note: '市の消防。隊員が不足すると出動できる範囲が狭まります。',
    w: 1, h: 1, cost: 19000, months: 10, upkeep: 240, staffReq: 20, staffKind: '消防隊員', wage: 42, hire: 2, capacity: 60, capUnit: 'タイル（到達範囲）',
    ageRate: 0.15, renewCost: 9000, renewMonths: 6, renewFactor: 0.7,
  },
  fireL: {
    ...city('fire', 'safety'), name: '消防本部（救急・防災センター）', note: '指令センターと救急隊を持つ本部。到達範囲が広く、救急で医療の満足も上がります。', lvMax: 2,
    w: 2, h: 2, cost: 52000, months: 18, upkeep: 520, staffReq: 45, staffKind: '消防隊員', wage: 42, hire: 2, capacity: 85, capUnit: 'タイル（到達範囲）', ageRate: 0.12, renewCost: 22000, renewMonths: 8, renewFactor: 0.7,
  },
  shelter: {
    ...city('shelter', 'safety'), name: '防災備蓄倉庫', note: '食料・水・毛布の備蓄。地震や水害のときの被害と混乱が小さくなります。', lvMax: 0,
    w: 1, h: 1, cost: 1500, months: 3, upkeep: 10, capacity: 3000, capUnit: '人分', reach: 35, ageRate: 0.1, renewCost: 600, renewMonths: 1, renewFactor: 0.5,
  },
  tsunamiTower: {
    ...city('shelter', 'safety'), name: '津波避難タワー', note: '海の近くの低い土地に建てる、高さ 15m の鉄骨の避難場所（800 人）。まわり 540m の住民は、津波のときに逃げ遅れにくくなります。高台が遠い海辺の地区に。', lvMax: 0,
    w: 1, h: 1, cost: 3000, months: 6, upkeep: 15, capacity: 800, capUnit: '人', reach: 18, ageRate: 0.1, renewCost: 900, renewMonths: 2, renewFactor: 0.5,
  },
  basin: {
    ...city('basin', 'safety'), name: '雨水調整池', note: '大雨のときに水をためる池。同じ地区の浸水の被害が小さくなります。', lvMax: 0,
    w: 2, h: 2, cost: 12000, months: 12, upkeep: 30, capacity: 1, capUnit: '地区', ageRate: 0.08, renewCost: 4000, renewMonths: 4, renewFactor: 0.5,
  },
  koban: { ...req('safety', 'safety', '都道府県警察'), name: '交番', note: '警察は都道府県警察の所管です（東京は警視庁）。市は用地を用意して設置を要望できます（協議）。周りの治安の満足が上がります。', w: 1, h: 1, cost: 500, months: 8, capacity: 5000, capUnit: '人（受け持ちの人口）', reach: 22 },
  police: { ...req('safety', 'safety', '都道府県警察'), name: '警察署', note: '都道府県警察が設置します（東京は警視庁）。市は用地を提供して要望します（協議）。広い範囲の治安を支えます。', w: 2, h: 2, cost: 4000, months: 24, capacity: 30000, capUnit: '人（受け持ちの人口）', reach: 70, jobs: 120, use: 20 },
  // ---- 水道・電気・ガス・ごみ ----
  waterS: {
    ...city('water', 'infra'), name: '配水池・小規模浄水場', owner: '市（水道事業）', note: '小さな浄水・配水の拠点。新しい住宅地の水をまかないます。', lvMax: 2,
    w: 1, h: 1, cost: 9000, months: 8, upkeep: 120, staffReq: 3, staffKind: '技術職員', wage: 40, hire: 1, capacity: 1100, capUnit: '世帯', ageRate: 0.3, renewCost: 5000, renewMonths: 4, renewFactor: 0.7,
  },
  water: {
    ...city('water', 'infra'), name: '浄水場', owner: '市（水道事業）', note: '浄水・配水の拠点。管路は扱わず、処理能力と道路接続だけで判定します。',
    w: 2, h: 2, cost: 30000, months: 12, upkeep: 400, staffReq: 8, staffKind: '技術職員', wage: 40, hire: 1, capacity: 3400, capUnit: '世帯',
    ageRate: 0.35, renewCost: 18000, renewMonths: 9, renewFactor: 0.75,
  },
  waterL: {
    ...city('water', 'infra'), name: '大規模浄水場', owner: '市（水道事業）', note: '大きな浄水場。人口が大きく増えるときに。', lvMax: 2,
    w: 3, h: 3, cost: 85000, months: 24, upkeep: 900, staffReq: 18, staffKind: '技術職員', wage: 40, hire: 1, capacity: 9000, capUnit: '世帯', ageRate: 0.25, renewCost: 45000, renewMonths: 12, renewFactor: 0.75,
  },
  sewageS: {
    ...city('sewage', 'infra'), name: '小規模下水処理場', owner: '市（下水道事業）', note: '下水をきれいにして川へ戻します。足りないと川が汚れ、新しい住宅が建ちにくくなります。', lvMax: 2,
    w: 2, h: 1, cost: 14000, months: 10, upkeep: 180, staffReq: 4, staffKind: '技術職員', wage: 40, hire: 1, capacity: 1600, capUnit: '世帯', ageRate: 0.25, renewCost: 7000, renewMonths: 5, renewFactor: 0.7, pollution: 0.3,
  },
  sewage: {
    ...city('sewage', 'infra'), name: '下水処理場', owner: '市（下水道事業）', note: '大きな下水処理場。', lvMax: 2,
    w: 3, h: 2, cost: 48000, months: 20, upkeep: 520, staffReq: 10, staffKind: '技術職員', wage: 40, hire: 1, capacity: 6000, capUnit: '世帯', ageRate: 0.22, renewCost: 24000, renewMonths: 10, renewFactor: 0.7, pollution: 0.5,
  },
  waste: {
    ...city('waste', 'infra'), name: 'ごみ収集拠点', owner: '市', note: '収集車の拠点。焼却は市外の広域施設への委託で、費用は維持費に含みます（簡略化）。',
    w: 2, h: 1, cost: 8000, months: 6, upkeep: 170, staffReq: 10, staffKind: '収集職員', wage: 34, hire: 2, capacity: 2500, capUnit: '世帯',
    ageRate: 0.2, renewCost: 3500, renewMonths: 4, renewFactor: 0.6,
  },
  wasteL: {
    ...city('waste', 'infra'), name: '清掃工場（ごみ発電つき）', owner: '市', note: 'ごみを焼却し、熱で発電します（市の電力の一部をまかなう）。煙突の周りの空気は少し悪くなります。', lvMax: 2,
    w: 3, h: 2, cost: 90000, months: 30, upkeep: 900, staffReq: 30, staffKind: '技術職員', wage: 40, hire: 1, capacity: 9000, capUnit: '世帯', ageRate: 0.25, renewCost: 45000, renewMonths: 12, renewFactor: 0.6, gen: 1500, pollution: 1.6, income: 120,
  },
  solar: {
    ...city('power', 'infra'), name: '市営メガソーラー', owner: '市', note: '太陽光発電所。電力の一部をまかない、売電収入が入ります。空気を汚しません。', lvMax: 2,
    w: 3, h: 3, cost: 18000, months: 6, upkeep: 25, capacity: 900, capUnit: '世帯相当（発電）', gen: 900, income: 150, ageRate: 0.2, renewCost: 9000, renewMonths: 3, renewFactor: 0.5,
  },
  substation: { ...req('power', 'infra', '電力会社'), name: '変電所', note: '電力会社が設置・運営します。市は用地を提供して増設を求めます（協議）。電力が足りないと新しい住宅や企業が来ません。', w: 2, h: 2, cost: 3000, months: 18, capacity: 4000, capUnit: '世帯相当', jobs: 6 },
  gas: { ...req('gas', 'infra', 'ガス会社'), name: 'ガス整圧所', note: 'ガス会社が設置します。都市ガスが届く範囲が広がり、プロパンより住居費が下がります。', w: 1, h: 1, cost: 800, months: 10, capacity: 2500, capUnit: '世帯' },
  cellTower: { ...req('telecom', 'infra', '携帯電話会社'), name: '携帯電話の基地局（5G）', note: '携帯電話会社が建てる鉄塔とアンテナ。市は用地を貸します。通信が混み合う（動画が止まる・つながりにくい）のを解消します。人が増えると足りなくなります。', w: 1, h: 1, cost: 600, months: 4, capacity: 1500, capUnit: '世帯相当（通信）', use: 5 },
  telecomHub: { ...req('telecom', 'infra', '通信会社'), name: '通信ビル（光回線の局舎）', note: '光回線と携帯電話の基地局をつなぐ通信会社の建物。多くの世帯と企業の通信をまかないます。データセンター・IT 企業が多い街に。', w: 2, h: 1, cost: 3000, months: 12, capacity: 8000, capUnit: '世帯相当（通信）', jobs: 40, use: 300 },
  lngTerminal: { ...req('gas', 'infra', 'ガス会社・電力会社'), name: 'LNG 基地（都市ガスの受け入れ基地）', note: '海外から船で運ばれた液化天然ガスを受け入れ、球形のタンクにためて都市ガスとして送り出す基地。都市ガスが一度に大きく届くようになります。原油と円安で、ガス代が上がりやすいのは変わりません。水辺から 90m 以内（1 か所）。', w: 4, h: 3, cost: 6000, months: 30, capacity: 20000, capUnit: '世帯', jobs: 120, pollution: 0.2, req: 'water', unique: true },
  desalination: {
    ...city('water', 'infra'), name: '海水淡水化プラント', owner: '市（水道事業）', note: '海水から真水をつくる施設（膜でこす方式）。雨が少なくダムや川の水が減っても、水を送り続けられます。電気をたくさん使い、費用は浄水場より高めです。水辺から 90m 以内。', lvMax: 1,
    w: 3, h: 2, cost: 60000, months: 24, upkeep: 700, staffReq: 10, staffKind: '技術職員', wage: 40, hire: 1, capacity: 3000, capUnit: '世帯', ageRate: 0.25, renewCost: 30000, renewMonths: 9, renewFactor: 0.75, req: 'water', use: 1200,
  },
  // ---- 医療・福祉 ----
  clinic: { ...base, fam: 'health', cat: 'health', build: 'invite', name: '診療所・クリニック', owner: '医療法人（民間）', authority: 'attract', note: '民間の医療機関。市は開業用地の紹介と補助で誘致できます。周りの医療の満足が上がります。', w: 1, h: 1, cost: 1500, months: 8, capacity: 3000, capUnit: '人（利用圏の人口）', reach: 25, jobs: 12 },
  hospital: {
    ...city('health', 'health'), name: '市民病院', note: '入院と救急を受け持つ病院。広い範囲の医療を支えますが、人件費と維持費が重い施設です。', lvMax: 2,
    w: 3, h: 2, cost: 120000, months: 30, upkeep: 1800, staffReq: 120, staffKind: '医師・看護師', wage: 45, hire: 4, capacity: 25000, capUnit: '人（利用圏の人口）', reach: 80, ageRate: 0.2, renewCost: 60000, renewMonths: 12, renewFactor: 0.7, income: 1200,
  },
  elderly: { ...req('welfare', 'health', '社会福祉法人（民間）'), name: '特別養護老人ホーム', note: '介護が必要な高齢者の入所施設。社会福祉法人が運営し、市は建設費を補助します。', w: 2, h: 1, cost: 6000, months: 14, capacity: 80, capUnit: '人（入所）', jobs: 45 },
  carePlaza: {
    ...city('welfare', 'health'), name: '地域ケアプラザ', note: '高齢者の相談・デイサービス・子育て支援の拠点。高齢世帯の満足が上がります。', lvMax: 2,
    w: 1, h: 1, cost: 7000, months: 8, upkeep: 90, staffReq: 8, staffKind: '福祉職員', wage: 30, hire: 1, capacity: 6000, capUnit: '人（利用圏の人口）', reach: 30, ageRate: 0.15, renewCost: 3500, renewMonths: 4, renewFactor: 0.5,
  },
  // ---- ランドマーク ----
  hall: {
    ...city('culture', 'landmark'), name: '文化ホール', note: 'コンサートや式典のホール。文化の満足と知名度が上がり、来訪者が来ます。', lvMax: 0,
    w: 3, h: 2, cost: 60000, months: 24, upkeep: 420, staffReq: 10, staffKind: '管理職員', wage: 28, hire: 1, capacity: 40000, capUnit: '人（利用圏の人口）', reach: 140, ageRate: 0.12, renewCost: 25000, renewMonths: 10, renewFactor: 0.4, visitors: 2500, fame: 4,
  },
  museum: {
    ...city('culture', 'landmark'), name: '美術館', note: '街の顔になる美術館。知名度と来訪者が増え、文化の満足が上がります。', lvMax: 0,
    w: 3, h: 3, cost: 90000, months: 30, upkeep: 520, staffReq: 12, staffKind: '学芸員', wage: 30, hire: 1, capacity: 50000, capUnit: '人（利用圏の人口）', reach: 200, ageRate: 0.1, renewCost: 35000, renewMonths: 12, renewFactor: 0.3, visitors: 6000, fame: 9,
  },
  tower: {
    ...city('culture', 'landmark'), name: '展望タワー', note: '遠くからも見えるランドマーク。来訪者と知名度が大きく増えます。', lvMax: 0,
    w: 2, h: 2, cost: 70000, months: 24, upkeep: 300, staffReq: 6, staffKind: '管理職員', wage: 28, hire: 1, capacity: 1, capUnit: '', reach: 0, ageRate: 0.1, renewCost: 25000, renewMonths: 8, renewFactor: 0.3, visitors: 9000, fame: 12, income: 350,
  },
  stadium: {
    ...city('culture', 'landmark'), name: 'スタジアム', note: 'プロスポーツの試合ができる競技場。試合の日は人と車が集まり、知名度と商店の売上が上がります。', lvMax: 0,
    w: 4, h: 4, cost: 160000, months: 36, upkeep: 900, staffReq: 15, staffKind: '管理職員', wage: 28, hire: 1, capacity: 60000, capUnit: '人（利用圏の人口）', reach: 200, ageRate: 0.1, renewCost: 60000, renewMonths: 12, renewFactor: 0.3, visitors: 15000, fame: 15, income: 500,
  },
  // ---- 企業誘致（市は用地の整備と誘致活動。建てて運営するのは企業）----
  office: { ...inv('企業'), name: 'オフィスビル（本社・支店）', note: '事務所の誘致。駅の近く（道路で 750m 以内）か幹線道路沿いに来ます。市内の職と税収が増えます。', w: 2, h: 2, cost: 6000, months: 18, jobs: 400, bizTax: 260, use: 300, pollution: 0.2, req: 'station' },
  factory: { ...inv('企業'), cat: 'industry', name: '工場', note: '製造業の工場。幹線道路か国道に面した土地に来ます。雇用と税収は大きいですが、周りの空気が悪くなり、トラックが増えます。', w: 3, h: 3, cost: 9000, months: 24, jobs: 320, bizTax: 340, use: 800, pollution: 3.2, req: 'arterial' },
  logistics: { ...inv('企業'), name: '物流センター', note: '倉庫と配送の拠点。幹線道路か国道に面した土地に来ます。トラックが朝の道路を混ませます。', w: 3, h: 2, cost: 7000, months: 18, jobs: 180, bizTax: 180, use: 220, pollution: 1.2, req: 'arterial' },
  datacenter: { ...inv('企業'), name: 'データセンター', note: '雇用は少ないですが税収が大きい施設。大量の電力を使うので、電力に余裕が必要です。', w: 2, h: 2, cost: 5000, months: 20, jobs: 40, bizTax: 380, use: 2000, req: 'power' },
  hotel: { ...inv('ホテル事業者'), name: 'ホテル', note: '来訪者が泊まる施設。宿泊税を設けると税収になり、周りの店の売上も増えます。', w: 2, h: 1, cost: 3000, months: 18, jobs: 60, bizTax: 70, use: 120, visitors: 2000, fame: 1, req: 'station' },
  themepark: { ...inv('レジャー企業'), name: 'テーマパーク', note: '大型の集客施設。知名度・来訪者・雇用が大きく増えますが、週末と朝夕の道路がとても混みます。知名度 30 以上で、幹線道路か国道に面した 5×5 の土地が要ります。', w: 5, h: 5, cost: 30000, months: 36, jobs: 900, bizTax: 650, use: 600, pollution: 0.6, visitors: 40000, fame: 22, req: 'fame' },
  // ---- v6：交通・広域 ----
  airport: { ...req('transport', 'transport', '国・県（空港の設置者）'), name: '地方空港', note: '国と県が設置し、市は用地と負担金を出します。来訪者・知名度が大きく伸び、オフィス・ホテル・データセンターが来やすくなります。周りは航空機の騒音で環境が下がります。幹線道路か国道に面した広い土地が要ります。市に 1 か所。', w: 6, h: 4, cost: 60000, months: 48, jobs: 600, use: 400, visitors: 25000, fame: 18, pollution: 2.2, req: 'arterial', unique: true, income: 100 },
  port: { ...req('transport', 'transport', '県（港湾管理者）'), name: '港湾（コンテナ埠頭）', note: '県が整備する港。水辺（川・海）から 90m 以内の土地にだけ置けます。工場と物流センターが来やすくなり、雇用と港湾関連の税収が入ります。大型客船が寄港することもあります。', w: 4, h: 3, cost: 40000, months: 36, jobs: 400, bizTax: 260, use: 200, visitors: 1500, fame: 4, pollution: 1.4, req: 'water' },
  ic: { ...req('transport', 'transport', '高速道路会社'), name: '高速道路インターチェンジ', note: '高速道路会社に要望し、市はアクセス道路と負担金を出します。高速道路につながり、物流・工場・テーマパーク・モールが来やすくなり、来訪者も 1.15 倍に。幹線道路か国道に面した土地が要ります（高速道路の本線は地図に描きません）。市に 1 か所。', w: 3, h: 3, cost: 25000, months: 30, jobs: 20, visitors: 0, pollution: 0.8, req: 'arterial', unique: true },
  busTerminal: { ...city('transport', 'transport'), name: 'バスターミナル', note: '路線バスの起点。車で通勤する人が 6% 減り、朝の渋滞が少し和らぎます（3 か所まで効きます）。', lvMax: 0, w: 2, h: 1, cost: 6000, months: 8, upkeep: 60, capacity: 1, capUnit: '', ageRate: 0.15, renewCost: 2500, renewMonths: 3, renewFactor: 0.5, visitors: 200 },
  // ---- 官公庁 ----
  cityHall: { ...city('gov', 'gov'), name: '市役所 新庁舎', note: '窓口と事務をまとめた新しい庁舎。基礎行政費が 7% 減り、支持率と知名度が少し上がります。災害時の対策本部（避難所にもなる）。市に 1 か所。', lvMax: 0, w: 3, h: 2, cost: 80000, months: 30, upkeep: 400, staffReq: 0, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 30000, renewMonths: 12, renewFactor: 0.7, fame: 2, unique: true },
  branchOffice: { ...city('gov', 'gov'), name: '行政センター（支所）', note: '住民票や福祉の相談ができる地域の窓口。近くの高齢・子育て世帯の福祉の満足が上がり、基礎行政費が 1% 減ります（4 か所まで）。', lvMax: 0, w: 2, h: 1, cost: 9000, months: 10, upkeep: 90, staffReq: 8, staffKind: '事務職員', wage: 32, hire: 1, capacity: 20000, capUnit: '人（受け持ちの人口）', reach: 50, ageRate: 0.12, renewCost: 4000, renewMonths: 4, renewFactor: 0.6 },
  govOffice: { ...req('gov', 'gov', '国（合同庁舎）'), name: '国の合同庁舎', note: '税務署・ハローワークなどが入る国の庁舎。国に用地を提供して誘致します。雇用が増え、街の格（知名度）が上がります。', w: 2, h: 2, cost: 3000, months: 30, jobs: 300, use: 80, fame: 2, unique: true },
  court: { ...req('gov', 'gov', '国（裁判所）'), name: '裁判所・法務局', note: '国の機関。用地を提供して誘致します。雇用と知名度が少し増え、近くの治安の満足も少し上がります。', w: 2, h: 2, cost: 2000, months: 30, jobs: 120, use: 40, fame: 2, unique: true },
  // ---- 医療・大型施設 ----
  univHospital: { ...base, fam: 'health', cat: 'health', build: 'invite', name: '大学病院', owner: '大学法人', authority: 'attract', note: '高度な医療と救急を担う病院。大学法人を誘致します（用地の提供と補助）。広い範囲の医療を支え、雇用も大きい。', w: 4, h: 3, cost: 10000, months: 36, capacity: 60000, capUnit: '人（利用圏の人口）', reach: 150, jobs: 1500, use: 600, visitors: 1500, fame: 5, req: 'arterial', unique: true },
  nightClinic: { ...city('health', 'health'), name: '夜間急病センター', note: '夜間と休日の急病を診る市の診療所。医療の満足が上がり、救急の到達が広がります。', lvMax: 2, w: 1, h: 1, cost: 6000, months: 8, upkeep: 120, staffReq: 8, staffKind: '医師・看護師', wage: 45, hire: 1, capacity: 20000, capUnit: '人（利用圏の人口）', reach: 60, ageRate: 0.15, renewCost: 3000, renewMonths: 3, renewFactor: 0.5 },
  university: { ...base, fam: 'univ', cat: 'landmark', build: 'invite', name: '大学のキャンパス', owner: '学校法人', authority: 'attract', note: '大学を誘致します（用地の提供）。学生と若い単身世帯の転入が 1.3 倍になり、文化の満足と知名度が上がります。駅の近くか幹線沿いに来ます。', w: 4, h: 4, cost: 12000, months: 36, jobs: 500, use: 300, visitors: 1500, fame: 6, req: 'station', unique: true },
  convention: { ...city('culture', 'landmark'), name: 'コンベンションセンター', note: '国際会議や展示会の会場。来訪者・知名度・ホテルの需要が増え、使用料が入ります。災害時は避難所になります。', lvMax: 0, w: 3, h: 3, cost: 50000, months: 24, upkeep: 300, staffReq: 8, staffKind: '管理職員', wage: 28, hire: 1, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 20000, renewMonths: 8, renewFactor: 0.4, visitors: 5000, fame: 6, income: 150 },
  arena: { ...city('culture', 'landmark'), name: 'アリーナ', note: '1 万人規模の屋内競技場。コンサートとプロスポーツで来訪者が増え、文化・スポーツの満足が上がります。災害時は大きな避難所になります。', lvMax: 0, w: 3, h: 3, cost: 45000, months: 24, upkeep: 260, staffReq: 8, staffKind: '管理職員', wage: 28, hire: 1, capacity: 50000, capUnit: '人（利用圏の人口）', reach: 150, ageRate: 0.1, renewCost: 18000, renewMonths: 8, renewFactor: 0.4, visitors: 7000, fame: 7, income: 200 },
  // ---- レジャー・商業 ----
  mall: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'ショッピングモール', owner: '商業デベロッパー', authority: 'attract', note: '大型の商業施設。市外へ買物に出る人が減り（市内の買物が増える）、来訪者と雇用が増えます。休日の道路が混みます。幹線道路か国道に面した土地に来ます。', w: 4, h: 4, cost: 8000, months: 24, jobs: 700, bizTax: 380, use: 500, visitors: 12000, fame: 3, pollution: 0.4, req: 'arterial' },
  cinema: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'シネマコンプレックス', owner: '映画会社', authority: 'attract', note: '映画館。文化の満足が少し上がり、来訪者が来ます。駅の近くか幹線沿いに来ます。', w: 2, h: 2, cost: 2500, months: 14, jobs: 40, bizTax: 40, use: 80, visitors: 3000, fame: 1, req: 'station' },
  onsen: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: '温浴施設（スーパー銭湯）', owner: 'レジャー企業', authority: 'attract', note: '温泉の日帰り入浴施設。高齢世帯の満足と、来訪者が増えます。', w: 2, h: 2, cost: 2500, months: 14, jobs: 50, bizTax: 45, use: 100, visitors: 4000, fame: 2 },
  aquarium: { ...city('culture', 'leisure'), name: '水族館', note: '海や川の生きものの水族館。来訪者・知名度が大きく伸び、入館料が入ります。子育て世帯の文化の満足が上がります。', lvMax: 0, w: 3, h: 3, cost: 55000, months: 30, upkeep: 400, staffReq: 15, staffKind: '飼育員', wage: 28, hire: 1, capacity: 60000, capUnit: '人（利用圏の人口）', reach: 200, ageRate: 0.12, renewCost: 22000, renewMonths: 10, renewFactor: 0.4, visitors: 12000, fame: 10, income: 400 },
  zoo: { ...city('culture', 'leisure'), name: '動物園', note: '動物と緑の多い園。来訪者と知名度が増え、空気もきれいにします。入園料が入ります。', lvMax: 0, w: 4, h: 4, cost: 40000, months: 30, upkeep: 450, staffReq: 20, staffKind: '飼育員', wage: 28, hire: 1, capacity: 60000, capUnit: '人（利用圏の人口）', reach: 200, ageRate: 0.1, renewCost: 16000, renewMonths: 10, renewFactor: 0.4, visitors: 10000, fame: 8, income: 300, green: 0.7 },
  golf: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'ゴルフ場', owner: 'レジャー企業', authority: 'attract', note: '広い芝生と林のゴルフ場。来訪者と税収があり、空気もきれいにします。広い土地が要ります。', w: 5, h: 5, cost: 4000, months: 24, jobs: 60, bizTax: 60, use: 40, visitors: 3000, fame: 1, green: 1 },
  camp: { ...city('leisure', 'nature'), name: 'キャンプ場', note: '林の中のオートキャンプ場。来訪者と文化の満足が少し増え、使用料が入ります。林か水辺から 90m 以内に置けます。', req: 'nature', lvMax: 0, w: 3, h: 3, cost: 4000, months: 6, upkeep: 30, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 1500, renewMonths: 2, renewFactor: 0.5, visitors: 2500, fame: 2, income: 25, green: 1 },
  michinoeki: { ...city('leisure', 'nature'), name: '道の駅', note: '農産物の直売所と休憩所。来訪者と知名度が増え、売上の一部が市に入ります。市内の農地が多いほど売上が伸びます。幹線道路か国道に面した土地が要ります。', lvMax: 0, w: 2, h: 2, cost: 12000, months: 12, upkeep: 60, staffReq: 0, capacity: 1, capUnit: '', ageRate: 0.12, renewCost: 5000, renewMonths: 4, renewFactor: 0.5, visitors: 4000, fame: 3, income: 60, req: 'arterial' },
  // ---- 自然・農業 ----
  farm: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: '農地（農業振興）', note: '農家と JA に営農を続けてもらう農地。市は基盤整備を補助します。わずかな税と雇用、緑による空気の改善。道の駅の売上が伸びます。', w: 2, h: 2, cost: 800, months: 3, jobs: 4, bizTax: 6, green: 0.8 },
  allotment: { ...city('park', 'nature'), name: '市民農園', note: '区画を貸し出す市民農園。高齢・子育て世帯に人気で、公園と文化の満足が少し上がります。', lvMax: 0, w: 1, h: 1, cost: 800, months: 2, upkeep: 8, capacity: 150, capUnit: '世帯', ageRate: 0.1, renewCost: 300, renewMonths: 1, renewFactor: 0.5, green: 0.8 },
  forestPark: { ...city('park', 'nature'), name: '森林公園（里山）', note: '雑木林と散策路を残した大きな公園。空気をきれいにし、文化の満足と来訪者が増えます。災害時の避難場所にも。', lvMax: 0, w: 4, h: 4, cost: 15000, months: 8, upkeep: 60, capacity: 2500, capUnit: '世帯', reach: 50, ageRate: 0.06, renewCost: 5000, renewMonths: 3, renewFactor: 0.5, visitors: 2500, fame: 3, green: 1.6 },
  riverPark: { ...city('park', 'nature'), name: '河川敷公園', note: '川沿いの広場と運動場。水辺から 90m 以内の土地にだけ置けます。安く広い公園です。', lvMax: 0, w: 2, h: 2, cost: 5000, months: 4, upkeep: 30, capacity: 1500, capUnit: '世帯', reach: 30, ageRate: 0.1, renewCost: 2000, renewMonths: 2, renewFactor: 0.4, req: 'water' },
  biotope: { ...city('park', 'nature'), name: 'ビオトープ（湿地）', note: '生きものが暮らせる湿地と池。周りの空気をよくきれいにし、子どもの学びの場になります。', lvMax: 0, w: 2, h: 2, cost: 3000, months: 4, upkeep: 15, capacity: 300, capUnit: '世帯', ageRate: 0.05, renewCost: 1000, renewMonths: 2, renewFactor: 0.5, green: 2 },
  ballpark: { ...city('culture', 'landmark'), name: '野球場（ボールパーク）', note: '3 万人が入る野球場。プロ野球の球団を誘致できます。高校野球や草野球でも使われ、来訪者と知名度が増えます。', lvMax: 0, w: 4, h: 4, cost: 120000, months: 36, upkeep: 700, staffReq: 12, staffKind: '管理職員', wage: 28, hire: 1, capacity: 60000, capUnit: '人（利用圏の人口）', reach: 200, ageRate: 0.1, renewCost: 40000, renewMonths: 12, renewFactor: 0.3, visitors: 4000, fame: 5, income: 200 },
  // ---- v8：業務・工業の用途に民間が建てるもの ----
  officeS: { ...priv, fam: 'biz', cat: 'other', build: 'none', name: '中小のオフィスビル', note: '業務（オフィス）の用途指定をした区画に、市内の職が足りないと民間が建てます。', months: 6, jobs: 60, bizTax: 28, use: 40, floors: 5 },
  officeM: { ...priv, fam: 'biz', cat: 'other', build: 'none', name: 'オフィスビル', note: '駅の近くの業務区画に、働き手が多いと民間が建てます。', months: 10, jobs: 160, bizTax: 75, use: 100, floors: 12 },
  smallFactory: { ...priv, fam: 'biz', cat: 'other', build: 'none', name: '町工場（中小の工場）', note: '工業の用途指定をした区画に民間が建てます。雇用は小さいですが、ものづくりの税収があります。周りの空気が少し悪くなります。', months: 5, jobs: 25, bizTax: 14, use: 30, pollution: 0.8 },
  hqTower: { ...inv('大企業'), name: '大企業の本社ビル', note: '大企業の本社を誘致します。駅の近く（道路で 750m 以内）か幹線沿いに来ます。雇用 2,000 人と大きな税収、知名度。電力を多く使います。', w: 2, h: 2, cost: 12000, months: 30, jobs: 2000, bizTax: 1100, use: 1200, fame: 5, req: 'station' },
  // ---- v8：新しい技術（年が進むと使えるようになる）----
  radioTower: { ...req('transport', 'transport', '通信会社'), name: '電波塔（5G 基地局）', note: '通信会社に設置を求めます。高速の移動通信が使え、オフィス・データセンター・研究所が来やすくなります。', w: 1, h: 1, cost: 1500, months: 6, unlock: 3 },
  fiberHub: { ...city('transport', 'transport'), name: '光ファイバー網（局舎）', note: '家と事業所に光回線を引きます。テレワークが広がって朝の通勤が 4% 減り、通勤の満足が上がります。企業も来やすくなります。', lvMax: 0, w: 1, h: 1, cost: 8000, months: 10, upkeep: 40, capacity: 1, capUnit: '', ageRate: 0.15, renewCost: 4000, renewMonths: 3, renewFactor: 0.5, unlock: 6, unique: true },
  evStation: { ...inv('エネルギー企業'), name: 'EV 急速充電ステーション', note: '電気自動車の急速充電所。電気自動車が増え、道路から出る排気が減ります（1 か所で 4%、3 か所まで）。', w: 1, h: 1, cost: 600, months: 4, jobs: 4, bizTax: 8, use: 60, unlock: 10 },
  smartSignal: { ...city('transport', 'transport'), name: 'スマート信号管制センター', note: 'AI で信号を制御し、道路の流れを良くします。市道の容量が 1 割増えます。', lvMax: 0, w: 1, h: 1, cost: 15000, months: 12, upkeep: 80, staffReq: 6, staffKind: '技術職員', wage: 40, hire: 1, capacity: 1, capUnit: '', ageRate: 0.2, renewCost: 7000, renewMonths: 4, renewFactor: 0.5, unlock: 15, unique: true },
  autoBusDepot: { ...city('transport', 'transport'), name: '自動運転バスの車庫', note: '運転手のいらない路線バスを市内に走らせます。車で通勤する人が 15% 減り、高齢世帯の満足も上がります。', lvMax: 0, w: 2, h: 1, cost: 25000, months: 18, upkeep: 200, capacity: 1, capUnit: '', ageRate: 0.2, renewCost: 10000, renewMonths: 6, renewFactor: 0.5, unlock: 25, unique: true },
  ioDatacenter: { ...inv('IT 企業'), name: '光電融合データセンター', note: '光で計算する次世代のデータセンター。電力は従来の半分で、税収がとても大きい施設です。', w: 2, h: 2, cost: 8000, months: 24, jobs: 120, bizTax: 1000, use: 900, fame: 4, req: 'power', unlock: 30 },
  vertiport: { ...city('transport', 'transport'), name: '空飛ぶクルマのポート', note: '空飛ぶクルマの発着場。渋滞と関係なく移動でき、通勤の満足と来訪者・知名度が上がります。', lvMax: 0, w: 2, h: 2, cost: 60000, months: 24, upkeep: 300, staffReq: 8, staffKind: '技術職員', wage: 40, hire: 1, capacity: 1, capUnit: '', ageRate: 0.15, renewCost: 25000, renewMonths: 8, renewFactor: 0.5, visitors: 4000, fame: 6, income: 150, unlock: 40 },
  cityOS: { ...city('gov', 'gov'), name: 'スマートシティ管制センター', note: '交通・エネルギー・行政のデータを一つにまとめて運営します。基礎行政費が 10% 減り、すべての世帯の満足が少し上がります。', lvMax: 0, w: 2, h: 2, cost: 80000, months: 24, upkeep: 300, staffReq: 20, staffKind: '技術職員', wage: 40, hire: 2, capacity: 1, capUnit: '', ageRate: 0.15, renewCost: 30000, renewMonths: 8, renewFactor: 0.6, fame: 5, unlock: 50, unique: true },
  fusion: { ...req('power', 'infra', '国・電力会社'), name: '核融合発電所', note: '国と電力会社が建てる、燃料が海水でつくれる発電所。4 万世帯分の電気をつくり、空気を汚しません。知名度が大きく上がります。', w: 4, h: 4, cost: 50000, months: 60, capacity: 40000, capUnit: '世帯相当（発電）', jobs: 400, fame: 10, visitors: 2000, unlock: 60, unique: true },
  // ---- v7：自然 ----
  beach: { ...city('leisure', 'nature'), name: '海水浴場・海浜公園', note: '砂浜と海の家、ライフセーバーの詰所。夏は人でにぎわい、知名度が上がります。水辺から 90m 以内に置けます。', lvMax: 0, w: 3, h: 2, cost: 8000, months: 6, upkeep: 60, staffReq: 6, staffKind: 'ライフセーバー', wage: 20, hire: 2, capacity: 1, capUnit: '', ageRate: 0.12, renewCost: 3000, renewMonths: 2, renewFactor: 0.5, visitors: 7000, fame: 4, income: 40, req: 'water' },
  hotSpring: { ...city('leisure', 'nature'), name: '温泉の源泉（掘削と配湯）', note: '地下 1,500m まで掘って温泉を出し、温浴施設やホテルに配湯します。温浴施設とホテルの来訪者が 1.5 倍になり、配湯料が入ります。', lvMax: 0, w: 1, h: 1, cost: 20000, months: 12, upkeep: 40, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 6000, renewMonths: 4, renewFactor: 0.5, fame: 3, income: 60, unique: true },
  flowerPark: { ...city('park', 'nature'), name: '桜並木と花の名所', note: '桜並木と季節の花の公園。春の来訪者と知名度が増え、公園と文化の満足が上がります。', lvMax: 0, w: 2, h: 2, cost: 6000, months: 6, upkeep: 40, capacity: 1200, capUnit: '世帯', reach: 30, ageRate: 0.08, renewCost: 2000, renewMonths: 2, renewFactor: 0.5, visitors: 3500, fame: 3, green: 1.2 },
  tameike: { ...city('basin', 'nature'), name: 'ため池', note: '昔からの農業用のため池を整え、大雨のときに水をためます。同じ地区の浸水の被害が半分になり、渇水のときも農地を守ります。緑と水辺で空気もきれいに。', lvMax: 0, w: 2, h: 2, cost: 4000, months: 6, upkeep: 15, capacity: 1, capUnit: '地区', ageRate: 0.06, renewCost: 1500, renewMonths: 2, renewFactor: 0.5, green: 1 },
  // ---- v7：交通 ----
  lrt: { ...city('transport', 'transport'), name: '路面電車・LRT（車両基地と電停）', note: '道路の上を走る次世代型の路面電車。車両基地から道路で 2.4km の範囲の世帯は、車の通勤が 2 割減り、通勤の満足が上がります。線路は地図に描かず、範囲で表します。', lvMax: 2, w: 3, h: 1, cost: 120000, months: 36, upkeep: 900, staffReq: 30, staffKind: '運転士', wage: 35, hire: 3, capacity: 1, capUnit: '', reach: 80, ageRate: 0.15, renewCost: 40000, renewMonths: 10, renewFactor: 0.6, visitors: 1500, fame: 5, income: 250 },
  parkingLot: { ...city('transport', 'transport'), name: '市営駐車場', note: '店の多い所の駐車場。近く（180m 以内）の店の売上が 1 割増え、駐車料が入ります。', lvMax: 0, w: 1, h: 1, cost: 1500, months: 2, upkeep: 10, capacity: 1, capUnit: '', ageRate: 0.12, renewCost: 600, renewMonths: 1, renewFactor: 0.5, income: 18 },
  // ---- v7：産業 ----
  industrialPark: { ...city('biz', 'biz'), cat: 'industry', name: '工業団地（市が造成・分譲）', note: '市が土地を造成して企業に分けます。入居した企業から雇用と税収が入り、工場・物流・研究所が市内に来やすくなります。周りの空気は少し悪くなります。幹線沿いに置きます。', lvMax: 2, w: 4, h: 4, cost: 30000, months: 24, upkeep: 30, capacity: 1, capUnit: '', ageRate: 0.08, renewCost: 8000, renewMonths: 4, renewFactor: 0.7, jobs: 600, bizTax: 280, use: 700, pollution: 1.6, req: 'arterial' },
  lab: { ...base, fam: 'biz', cat: 'biz', build: 'invite', name: '研究所', owner: '企業・研究機関', authority: 'attract', note: '企業の研究所。税収と知名度があり、大学や工業団地があると来やすくなります。駅の近くか幹線沿いに来ます。', w: 3, h: 2, cost: 5000, months: 24, jobs: 300, bizTax: 200, use: 400, fame: 4, req: 'station' },
  fishPort: { ...req('biz', 'biz', '漁協・県'), cat: 'agri', name: '漁港と朝市', note: '漁協と県が整備する港。水辺から 90m 以内に置けます。漁業の雇用と、朝市の来訪者・知名度が増えます。', w: 3, h: 2, cost: 6000, months: 24, jobs: 120, bizTax: 40, visitors: 2500, fame: 3, req: 'water' },
  tourFarm: { ...base, fam: 'agri', cat: 'agri', build: 'invite', name: '観光農園・ワイナリー', owner: '農業法人', authority: 'attract', note: '果物狩りとワインづくりの農園。来訪者と知名度が増え、緑で空気もきれいに。市内に農地があると来やすくなります。', w: 3, h: 3, cost: 2500, months: 18, jobs: 40, bizTax: 40, use: 40, visitors: 5000, fame: 4, green: 0.8 },
  // ---- v12：企業のバリエーション ----
  itPark: { ...inv('IT 企業'), name: 'IT・ソフトウェア企業', note: 'ソフトウェアやネットのサービスの会社。若い単身世帯の働き口になり、税収も大きめ。駅の近くか幹線沿いに来ます。光回線があると来やすくなります。', w: 2, h: 2, cost: 5000, months: 14, jobs: 500, bizTax: 300, use: 500, req: 'station' },
  gameStudio: { ...inv('制作会社'), name: 'ゲーム・アニメ制作スタジオ', note: 'ゲームやアニメをつくる会社。知名度が上がり、ファンが訪れます。駅の近くか幹線沿いに来ます。', w: 2, h: 1, cost: 3000, months: 12, jobs: 220, bizTax: 140, use: 200, visitors: 1200, fame: 3, req: 'station' },
  foodFactory: { ...inv('食品メーカー'), cat: 'industry', name: '食品工場', note: 'パンやお菓子、お惣菜をつくる工場。空気への影響は小さく、パートの働き口が多い。幹線道路か国道に面した土地に来ます。', w: 3, h: 2, cost: 7000, months: 18, jobs: 380, bizTax: 190, use: 500, pollution: 0.6, req: 'arterial' },
  pharma: { ...inv('製薬会社'), cat: 'industry', name: '製薬会社の研究所・工場', note: '薬の研究と製造。税収が大きく、知名度も上がります。大学や研究所があると来やすくなります。幹線沿いに来ます。', w: 3, h: 3, cost: 12000, months: 30, jobs: 450, bizTax: 380, use: 900, pollution: 0.8, fame: 2, req: 'arterial' },
  callCenter: { ...inv('サービス会社'), name: 'コールセンター・事務センター', note: '電話やチャットの窓口、事務の受託。税収は小さめですが、短時間でも働ける職が多い。駅の近くに来ます。', w: 2, h: 1, cost: 2500, months: 10, jobs: 400, bizTax: 80, use: 250, req: 'station' },
  bankHq: { ...inv('地方銀行'), name: '地方銀行の本店', note: '地域の銀行の本店。法人の税と知名度、地元の企業への融資で景気を少し支えます。駅の近くに来ます（1 か所）。', w: 2, h: 2, cost: 8000, months: 24, jobs: 350, bizTax: 240, use: 300, fame: 2, req: 'station', unique: true },
  battery: { ...inv('電池メーカー'), cat: 'industry', name: 'EV・蓄電池の工場', note: '電気自動車と蓄電池の工場。雇用と税収がとても大きい一方、電力を多く使い、トラックが増えます。12 年目から。', w: 4, h: 3, cost: 20000, months: 36, jobs: 1200, bizTax: 700, use: 2500, pollution: 1.6, req: 'power', unlock: 12 },
  semicon: { ...inv('半導体メーカー'), cat: 'industry', name: '半導体工場', note: '最先端の半導体工場。雇用・税収・知名度が非常に大きい一方、電力と水を大量に使います。20 年目から（1 か所）。', w: 4, h: 4, cost: 40000, months: 48, jobs: 1800, bizTax: 1300, use: 4000, pollution: 1.2, fame: 6, req: 'power', unique: true, unlock: 20 },
  // ---- v13：発電所（どれも実在する方式。数値はゲーム用の仮定） ----
  nuclear: { ...req('power', 'infra', '電力会社'), name: '原子力発電所', note: '電力会社が国の審査を経て建てる大きな発電所。6 万世帯分の電気を二酸化炭素を出さずにつくり、電源立地の交付金が入ります。冷却水のため水辺から 90m 以内。住民の不安や避難計画のできごとが起きます（1 か所）。', w: 4, h: 4, cost: 30000, months: 84, capacity: 60000, capUnit: '世帯相当（発電）', jobs: 900, income: 600, fame: 2, req: 'water', unique: true, unlock: 5 },
  lngPower: { ...req('power', 'infra', '電力会社'), name: 'LNG 火力発電所', note: '天然ガスを燃やす火力発電所。2.5 万世帯分。石炭より空気への影響は小さいですが、周りの空気は少し悪くなります。燃料の船のため水辺から 90m 以内。', w: 4, h: 3, cost: 12000, months: 48, capacity: 25000, capUnit: '世帯相当（発電）', jobs: 250, income: 150, pollution: 1.6, req: 'water' },
  coalPower: { ...req('power', 'infra', '電力会社'), name: '石炭火力発電所', note: '石炭を燃やす火力発電所。2.5 万世帯分を安く建てられますが、周りの空気がかなり悪くなります。水辺から 90m 以内。', w: 4, h: 3, cost: 8000, months: 42, capacity: 25000, capUnit: '世帯相当（発電）', jobs: 300, income: 150, pollution: 4.5, req: 'water' },
  windFarm: { ...city('power', 'infra'), name: '風力発電所（陸上）', note: '大きな風車 3 基。1,500 世帯分の電気と売電収入。風車の音のため、まわり 2 区画に住宅がない場所に置きます。', lvMax: 2, w: 3, h: 3, cost: 14000, months: 12, upkeep: 40, capacity: 1500, capUnit: '世帯相当（発電）', gen: 1500, income: 180, ageRate: 0.25, renewCost: 7000, renewMonths: 4, renewFactor: 0.5, req: 'open' },
  hydro: { ...city('power', 'infra'), name: '小水力発電所', note: '川や水路の流れで発電する小さな発電所。400 世帯分。水辺から 90m 以内。', lvMax: 2, w: 1, h: 1, cost: 4000, months: 10, upkeep: 15, capacity: 400, capUnit: '世帯相当（発電）', gen: 400, income: 50, ageRate: 0.15, renewCost: 2000, renewMonths: 3, renewFactor: 0.5, req: 'water' },
  geothermal: { ...req('power', 'infra', '電力会社'), name: '地熱発電所', note: '地下の熱水と蒸気で発電します。3,000 世帯分を昼も夜も安定してつくれます。温泉の源泉か山（急斜面）の近く（120m 以内）に置けます。', w: 2, h: 2, cost: 9000, months: 48, capacity: 3000, capUnit: '世帯相当（発電）', jobs: 40, income: 60, fame: 1, req: 'geo' },
  biomass: { ...city('power', 'infra'), name: '木質バイオマス発電所', note: '間伐材や製材の端材を燃やして発電します。2,000 世帯分。林業の仕事が生まれます。保全林から 180m 以内。', lvMax: 2, w: 2, h: 2, cost: 9000, months: 18, upkeep: 90, staffReq: 6, staffKind: '技術職員', wage: 36, hire: 1, capacity: 2000, capUnit: '世帯相当（発電）', gen: 2000, income: 120, ageRate: 0.25, renewCost: 4500, renewMonths: 4, renewFactor: 0.5, pollution: 0.8, req: 'forest' },
  // ---- v13：山・レジャー・スポーツ・交通 ----
  ropeway: { ...city('leisure', 'nature'), name: 'ロープウェイ', note: '山のふもとの駅から山頂までゴンドラで上がります。眺めがよく、来訪者と知名度が増え、運賃が入ります。山（急斜面か保全林）の近くで、近くの山頂が 15m 以上高い場所に置けます。', lvMax: 0, w: 2, h: 1, cost: 15000, months: 18, upkeep: 80, staffReq: 6, staffKind: '運行職員', wage: 26, hire: 1, capacity: 1, capUnit: '', ageRate: 0.15, renewCost: 6000, renewMonths: 4, renewFactor: 0.5, visitors: 9000, fame: 5, income: 160, req: 'mountain' },
  dome: { ...city('culture', 'landmark'), name: 'ドーム球場（多目的ドーム）', note: '屋根のある 4 万人規模の競技場。雨でも試合やコンサートができ、来訪者と知名度が大きく増えます。野球とバスケットボールのチームの本拠地になります（1 か所）。', lvMax: 0, w: 5, h: 5, cost: 200000, months: 48, upkeep: 1100, staffReq: 20, staffKind: '管理職員', wage: 28, hire: 1, capacity: 80000, capUnit: '人（利用圏の人口）', reach: 240, ageRate: 0.08, renewCost: 70000, renewMonths: 12, renewFactor: 0.3, visitors: 22000, fame: 18, income: 900, unique: true },
  liveHouse: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'ライブハウス', owner: '音楽事業者', authority: 'attract', note: '数百人の小さな音楽の会場。若い世帯の文化の満足が上がり、市外からもファンが来ます。駅の近くか幹線沿いに来ます。', w: 1, h: 1, cost: 800, months: 6, jobs: 15, bizTax: 12, use: 30, visitors: 1500, fame: 1, req: 'station' },
  fitness: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'スポーツジム（フィットネスクラブ）', owner: 'フィットネス事業者', authority: 'attract', note: '民間のジムとプール。周りの世帯の文化・スポーツと医療の満足が少し上がります。', w: 1, h: 1, cost: 600, months: 6, jobs: 20, bizTax: 15, use: 60, req: 'arterial' },
  robotaxi: { ...inv('交通事業者'), name: '自動運転タクシーの営業所', note: '運転手のいないタクシーとバスを走らせる拠点。車を持たない高齢世帯の満足が上がり、通勤の車が減ります。街に自動運転の車が走ります。20 年目から（1 か所）。', w: 2, h: 2, cost: 6000, months: 18, jobs: 80, bizTax: 60, use: 300, unique: true, unlock: 20, req: 'arterial' },
  // ---- v15：寺社・城・歴史 ----
  shrine: { ...req('religion', 'history', '神社（宗教法人）'), name: '神社', note: '鳥居と社殿、鎮守の森。市は参道と境内の整備を補助します。初詣や祭りで人が集まり、地域のつながり（福祉）と文化の満足が少し上がります。', w: 2, h: 2, cost: 2500, months: 12, visitors: 1500, fame: 2, green: 0.6 },
  temple: { ...req('religion', 'history', '寺院（宗教法人）'), name: '寺院（五重塔）', note: '本堂と五重塔、庭園のある寺。市は参道と駐車場の整備を補助します。観光の名所になり、墓地の相談にも乗ってもらえます。', w: 3, h: 3, cost: 4000, months: 18, visitors: 2500, fame: 3, green: 0.5 },
  grandShrine: { ...req('religion', 'history', '大社（宗教法人）'), name: '大社', note: '全国から参拝者が来る大きな神社。大鳥居と長い参道、広い鎮守の森。来訪者と知名度が大きく増えます。知名度 25 以上（1 か所）。', w: 4, h: 4, cost: 20000, months: 36, visitors: 16000, fame: 12, green: 1, unique: true, req: 'fame' },
  church: { ...req('religion', 'history', '教会（宗教法人）'), name: '教会', note: '尖塔のある教会。結婚式やコンサートが開かれ、文化の満足が少し上がります。', w: 2, h: 1, cost: 1500, months: 10, visitors: 400, fame: 1 },
  castle: { ...city('culture', 'history'), name: '城（天守の復元）', note: '石垣の上に天守を復元します。街の象徴になり、来訪者と知名度が大きく増え、入城料が入ります（1 か所）。', lvMax: 0, w: 4, h: 4, cost: 150000, months: 48, upkeep: 500, staffReq: 10, staffKind: '学芸員', wage: 30, hire: 1, capacity: 60000, capUnit: '人（利用圏の人口）', reach: 220, ageRate: 0.06, renewCost: 40000, renewMonths: 12, renewFactor: 0.4, visitors: 20000, fame: 16, income: 600, unique: true },
  castleRuins: { ...city('culture', 'history'), name: '城跡公園', note: '石垣と堀の残る城跡を公園にします。桜の名所になり、空気をきれいにし、来訪者が増えます（1 か所）。', lvMax: 0, w: 3, h: 3, cost: 12000, months: 12, upkeep: 60, capacity: 30000, capUnit: '人（利用圏の人口）', reach: 120, ageRate: 0.05, renewCost: 4000, renewMonths: 4, renewFactor: 0.5, visitors: 5000, fame: 5, green: 1, unique: true },
  // ---- v15：葬祭 ----
  crematorium: { ...city('funeral', 'funeral'), name: '斎場（火葬場）', note: '市が運営する火葬場と式場。亡くなった人を市内で見送れます。足りないと隣の市に頼むことになり、待ち日数と費用がかかり、暮らしの満足が下がります。煙突のある施設は、近くの住民が嫌がります。', lvMax: 2, w: 3, h: 2, cost: 45000, months: 24, upkeep: 260, staffReq: 8, staffKind: '職員', wage: 26, hire: 1, capacity: 150, capUnit: '件/月', ageRate: 0.12, renewCost: 20000, renewMonths: 8, renewFactor: 0.5, income: 60 },
  funeralHall: { ...base, fam: 'funeral', cat: 'funeral', build: 'invite', name: '葬儀場（セレモニーホール）', owner: '葬祭事業者', authority: 'attract', note: '民間の葬儀場。通夜と告別式の会場。近くにあると、家族を見送る負担が軽くなります。', w: 2, h: 1, cost: 1200, months: 8, jobs: 25, bizTax: 18, use: 40, capacity: 80, capUnit: '件/月', req: 'arterial' },
  cemetery: { ...city('funeral', 'funeral'), name: '市営霊園', note: '芝生と木々の霊園。お墓が足りないと、遠くの霊園まで通うことになります。緑で空気もきれいにします。', lvMax: 0, w: 3, h: 3, cost: 9000, months: 10, upkeep: 40, capacity: 4000, capUnit: '区画', ageRate: 0.04, renewCost: 2000, renewMonths: 3, renewFactor: 0.6, green: 0.6, income: 20 },
  // ---- v15：世界のいろいろな施設 ----
  lighthouse: { ...city('leisure', 'nature'), name: '灯台', note: '水辺に立つ白い灯台。船の目印で、夕日の名所になります。水辺から 90m 以内。', lvMax: 0, w: 1, h: 1, cost: 3000, months: 8, upkeep: 10, capacity: 1, capUnit: '', ageRate: 0.08, renewCost: 1000, renewMonths: 2, renewFactor: 0.5, visitors: 1500, fame: 2, req: 'water' },
  observatory: { ...city('culture', 'edu'), name: '天文台', note: '大きな望遠鏡のドーム。星空の観望会と科学の学びの場。林か水辺の近く（街の明かりから少し離れた所）に置きます。', lvMax: 0, w: 2, h: 2, cost: 9000, months: 14, upkeep: 60, staffReq: 3, staffKind: '研究員', wage: 30, hire: 1, capacity: 20000, capUnit: '人（利用圏の人口）', reach: 120, ageRate: 0.08, renewCost: 3500, renewMonths: 4, renewFactor: 0.5, visitors: 2500, fame: 3, req: 'nature' },
  ferrisWheel: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: '大観覧車', owner: 'レジャー企業', authority: 'attract', note: '高さ 100m の観覧車。夜はライトアップされ、デートと観光の名所になります。幹線道路か国道に面した土地が要ります。', w: 2, h: 2, cost: 3000, months: 14, jobs: 30, bizTax: 40, use: 60, visitors: 8000, fame: 5, req: 'arterial' },
  racecourse: { ...req('leisure', 'landmark', '地方競馬組合'), name: '競馬場', note: '馬が走る楕円のコースとスタンド。開催日は大勢が来て、収益の一部が市に入ります。週末の道路が混みます（1 か所）。', w: 5, h: 5, cost: 20000, months: 36, jobs: 300, income: 400, visitors: 15000, fame: 6, unique: true },
  botanical: { ...city('culture', 'leisure'), name: '植物園', note: '温室と花壇、世界の植物。空気をきれいにし、家族連れの文化の満足が上がります。', lvMax: 0, w: 4, h: 4, cost: 25000, months: 20, upkeep: 200, staffReq: 8, staffKind: '園芸職員', wage: 26, hire: 1, capacity: 40000, capUnit: '人（利用圏の人口）', reach: 160, ageRate: 0.08, renewCost: 8000, renewMonths: 6, renewFactor: 0.5, visitors: 6000, fame: 4, green: 1, income: 80 },
  operaHouse: { ...city('culture', 'landmark'), name: '歌劇場（オペラハウス）', note: 'オペラ・バレエ・オーケストラのための劇場。世界の舞台が来ると、知名度が大きく上がります（1 か所）。', lvMax: 0, w: 3, h: 3, cost: 120000, months: 36, upkeep: 700, staffReq: 20, staffKind: '管理職員', wage: 30, hire: 1, capacity: 60000, capUnit: '人（利用圏の人口）', reach: 220, ageRate: 0.08, renewCost: 40000, renewMonths: 12, renewFactor: 0.4, visitors: 9000, fame: 12, income: 300, unique: true },
  market: { ...inv('卸売業者'), name: '中央卸売市場', note: '魚・野菜・花の卸売市場。早朝からトラックが集まり、市場の食堂に観光客も来ます。幹線道路か国道に面した土地が要ります。', w: 4, h: 3, cost: 8000, months: 24, jobs: 450, bizTax: 220, use: 150, visitors: 3000, fame: 2, req: 'arterial' },
  shipyard: { ...inv('造船会社'), cat: 'industry', name: '造船所（船舶ドック）', note: '大きな船をつくり直すドックとクレーン。雇用と税収が大きく、関連する町工場も増えます。水辺から 90m 以内。音と空気の汚れを近くの住民が嫌がります。', w: 5, h: 3, cost: 15000, months: 36, jobs: 900, bizTax: 520, use: 500, pollution: 1.4, req: 'water' },
  prison: { ...req('safety', 'gov', '国（法務省）'), name: '刑務所（刑事施設）', note: '国の刑事施設。職員と家族が住み、交付金が入ります。近くの住民は不安に思います（1 か所）。', w: 5, h: 5, cost: 3000, months: 48, jobs: 350, income: 200, unique: true },
  // ---- v16：ダム ----
  dam: { ...req('power', 'infra', '国・県（河川管理者）'), name: 'ダム（多目的ダム）', note: '川をせき止めて水をためます。雨の少ない月も水道の水が足りるようになり（給水制限が起きにくい）、大雨のときは洪水を減らし、水力で 3,000 世帯分を発電します。川と山（急斜面か保全林）が近い所に置けます。市は負担金を出します。', w: 4, h: 3, cost: 30000, months: 72, capacity: 3000, capUnit: '世帯相当（発電）', jobs: 30, income: 120, visitors: 2500, fame: 3, req: 'dam' },
  // ---- v17：音楽・産業の連鎖・子育てと医療・暮らし・農業・空 ----
  musicArena: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: '音楽専用アリーナ', owner: 'エンタメ企業', authority: 'attract', note: 'コンサート専用の 1 万人規模の会場。週末ごとに市外からファンが集まり、来訪者・知名度・周りの店の売上が増えます。幹線道路か国道に面した土地が要ります。', w: 4, h: 3, cost: 4000, months: 30, jobs: 120, bizTax: 130, use: 200, visitors: 12000, fame: 6, req: 'arterial' },
  brewery: { ...inv('飲料メーカー'), cat: 'industry', name: 'ビール工場', note: 'ビールの工場と見学コース・ビアレストラン。市内に田畑（麦・ホップ）があると地元産の原料で売上が伸び、ふるさと納税の返礼品にもなります。', w: 3, h: 3, cost: 6000, months: 24, jobs: 220, bizTax: 160, use: 250, visitors: 2500, fame: 2, pollution: 0.4, req: 'arterial', chain: ['farm', 'field', 'paddy'] },
  steelMill: { ...inv('鉄鋼メーカー'), cat: 'industry', name: '製鉄所（電炉）', note: '鉄くずを溶かして鋼材をつくる工場。部品工場・造船所・防衛装備品工場の材料になります（サプライチェーンの川上）。雇用と税は大きく、空気はかなり悪くなります。水辺から 90m 以内。', w: 5, h: 4, cost: 18000, months: 42, jobs: 1100, bizTax: 700, use: 2500, pollution: 3.6, req: 'water' },
  partsPlant: { ...inv('部品メーカー'), cat: 'industry', name: '精密部品工場', note: '鋼材から精密な部品をつくる工場。市内に製鉄所があると材料が近く、売上が 1.25 倍になります（ないと 0.7 倍）。', w: 3, h: 2, cost: 5000, months: 20, jobs: 380, bizTax: 260, use: 400, pollution: 0.8, req: 'arterial', chain: ['steelMill'] },
  defensePlant: { ...inv('防衛装備メーカー'), cat: 'industry', name: '防衛装備品工場', note: '国（防衛省）から受注して装備品をつくる工場。製鉄所と精密部品工場がそろうと、本来の生産ができます（どちらかが欠けると 0.5 倍）。雇用と税は大きいですが、近くの住民の不安と、反対のできごとがあります（1 か所）。', w: 4, h: 3, cost: 12000, months: 36, jobs: 1400, bizTax: 900, use: 900, pollution: 1, req: 'arterial', unique: true, chain: ['steelMill', 'partsPlant'] },
  kindergarten: {
    ...city('care', 'kids'), name: '市立幼稚園（認定こども園）', note: '3〜5 歳の子どもを預かる幼稚園。保育の受け入れが増えます。', lvMax: 0,
    w: 2, h: 1, cost: 9000, months: 8, upkeep: 70, staffReq: 10, staffKind: '保育士', wage: 24, hire: 1, capacity: 150, capUnit: '人', ageRate: 0.15, renewCost: 4500, renewMonths: 4, renewFactor: 0.5,
  },
  salon: { ...priv, fam: 'shop', cat: 'other', build: 'none', name: '美容室', note: '商業区画に、商圏の需要が採算を超えると民間が開業します。', months: 2, jobs: 5, fixed: 140, attract: 0.7, range: 18 },
  maternity: { ...base, fam: 'health', cat: 'health', build: 'invite', name: '産院（産婦人科クリニック）', owner: '医療法人（民間）', authority: 'attract', note: '出産ができる産婦人科。市内で産めるので、子どもを持つ世帯が増えます（ないと出生が 2 割減ります）。', w: 1, h: 1, cost: 2500, months: 10, capacity: 6000, capUnit: '人（利用圏の人口）', reach: 40, jobs: 30 },
  perinatal: {
    ...city('health', 'health'), name: '総合病院（周産期母子医療センター）', note: 'ハイリスクの出産と新生児の集中治療（NICU）ができる総合病院。出生が増え、亡くなる赤ちゃんと母親が減り、医療の満足が大きく上がります。', lvMax: 0,
    w: 3, h: 3, cost: 120000, months: 42, upkeep: 900, staffReq: 120, staffKind: '看護師', wage: 32, hire: 2, capacity: 80000, capUnit: '人（利用圏の人口）', reach: 160, ageRate: 0.1, renewCost: 40000, renewMonths: 12, renewFactor: 0.5,
  },
  clubhouse: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'クラブハウス（練習場）', owner: 'プロクラブ', authority: 'attract', note: 'プロチームの練習場とクラブハウス。ファンが増えやすく、子どものスクールも開かれます。市にプロチームがあるときに置けます。', w: 3, h: 2, cost: 1500, months: 12, jobs: 50, bizTax: 20, use: 60, visitors: 1500, fame: 1 },
  postOffice: { ...req('welfare', 'gov', '日本郵便'), name: '郵便局', note: '郵便・貯金・保険の窓口。お年寄りの見守りも担い、周りの福祉の満足が少し上がります。', w: 1, h: 1, cost: 300, months: 6, jobs: 12 },
  paddy: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: '田んぼ', note: '水田。お米はふるさと納税の返礼品の定番です。雨の量で作柄が変わり、空気と景色をよくします。', w: 2, h: 2, cost: 700, months: 3, jobs: 3, bizTax: 5, green: 1 },
  field: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: '畑（野菜・麦）', note: '野菜や麦の畑。道の駅とビール工場の原料になり、ふるさと納税の返礼品にもなります。', w: 2, h: 2, cost: 700, months: 3, jobs: 4, bizTax: 7, green: 0.7 },
  heliport: { ...city('health', 'health'), name: 'ヘリポート（ドクターヘリ）', note: '救急ヘリの発着場。市内のどこへでも 15 分で駆けつけ、救急の水準が大きく上がります。災害時の救助と物資輸送にも使えます。', lvMax: 0, w: 2, h: 2, cost: 15000, months: 12, upkeep: 160, staffReq: 6, staffKind: '運航職員', wage: 34, hire: 1, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 5000, renewMonths: 4, renewFactor: 0.5, unique: true },
  multicultural: { ...city('welfare', 'gov'), name: '多文化共生センター', note: '誰でも使える相談と情報の拠点。多言語・やさしい日本語の生活相談、日本語教室、通訳の手配、手続きの案内。行政サービスへのアクセスと言語の支援が上がり、高齢の人・転入したばかりの世帯・外国人住民に医療・防災・福祉の情報が届きやすくなります（相談の利用・孤立・採用の定着・災害時の避難）。', lvMax: 0, w: 1, h: 1, cost: 6000, months: 6, upkeep: 50, staffReq: 4, staffKind: '相談員', wage: 26, hire: 1, capacity: 1, capUnit: '', ageRate: 0.12, renewCost: 2000, renewMonths: 2, renewFactor: 0.5, unique: true },
  // ---- v20：遊び・暮らし・仕事の施設 ----
  weddingHall: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: '結婚式場（ゲストハウス）', owner: 'ブライダル企業', authority: 'attract', note: 'チャペルと庭のある結婚式場。週末は市外からも招待客が来ます。若い夫婦世帯の満足が少し上がります。幹線道路か国道に面した土地が要ります。', w: 2, h: 2, cost: 1500, months: 12, jobs: 60, bizTax: 50, use: 60, visitors: 3000, fame: 2, req: 'arterial' },
  jidokan: { ...city('culture', 'kids'), name: '児童館', note: '0〜18 歳の子どもが自由に遊べる市の施設。放課後の居場所になり、子育て世帯の文化の満足が上がります。', lvMax: 0, w: 1, h: 1, cost: 4000, months: 8, upkeep: 40, staffReq: 4, staffKind: '児童厚生員', wage: 22, hire: 1, capacity: 1, capUnit: '', reach: 40, ageRate: 0.15, renewCost: 1500, renewMonths: 3, renewFactor: 0.5 },
  kidsPark: { ...base, fam: 'leisure', cat: 'kids', build: 'invite', name: '屋内キッズパーク', owner: 'レジャー企業', authority: 'attract', note: 'ボールプール・トランポリン・ふわふわ遊具の屋内遊び場。雨の日も親子でにぎわいます。', w: 2, h: 2, cost: 1200, months: 8, jobs: 40, bizTax: 35, use: 60, visitors: 6000, fame: 2, req: 'arterial' },
  amusementPark: { ...inv('遊園地の運営会社'), cat: 'leisure', name: '遊園地', note: 'ジェットコースター・メリーゴーラウンド・観覧車のある遊園地。家族連れが市外から来て、知名度と雇用が増えます。週末は道路が混みます。', w: 4, h: 4, cost: 12000, months: 30, jobs: 400, bizTax: 260, use: 300, visitors: 25000, fame: 10, req: 'arterial' },
  megaPark: { ...inv('エンターテインメント企業'), cat: 'landmark', name: 'キャラクターのテーマリゾート', note: 'お城とキャラクターのパレードがある大型テーマリゾートとホテル。国内外から年間 1,000 万人規模の客が来ます。知名度 45 以上・人口 3 万人以上で、6×6 の広い土地が要ります（1 か所）。', w: 6, h: 6, cost: 80000, months: 60, jobs: 4000, bizTax: 2500, use: 2500, pollution: 0.5, visitors: 120000, fame: 30, req: 'fame', unique: true },
  pool: { ...city('park', 'park'), name: '市民プール', note: '流れるプールとウォータースライダーのある屋外プール（屋内の 25m プールつき）。夏は子どもでいっぱいになります。', lvMax: 0, w: 2, h: 2, cost: 9000, months: 12, upkeep: 90, staffReq: 8, staffKind: '監視員', wage: 20, hire: 2, capacity: 1, capUnit: '', reach: 50, ageRate: 0.15, renewCost: 4000, renewMonths: 4, renewFactor: 0.5, visitors: 4000, income: 40 },
  athletics: { ...city('park', 'park'), name: '陸上競技場', note: '400m トラックとスタンドの陸上競技場。中高生の大会と市民マラソンの会場になり、健康と文化の満足が上がります。', lvMax: 0, w: 4, h: 3, cost: 25000, months: 24, upkeep: 160, staffReq: 6, staffKind: '職員', wage: 24, hire: 1, capacity: 1, capUnit: '', reach: 80, ageRate: 0.1, renewCost: 9000, renewMonths: 8, renewFactor: 0.5, visitors: 5000, fame: 3 },
  rugby: { ...city('park', 'park'), name: 'ラグビー場', note: 'ラグビー専用のグラウンドとスタンド。社会人リーグの試合と国際大会の合宿で、市外から観客が来ます。', lvMax: 0, w: 4, h: 3, cost: 22000, months: 24, upkeep: 140, staffReq: 6, staffKind: '職員', wage: 24, hire: 1, capacity: 1, capUnit: '', reach: 60, ageRate: 0.1, renewCost: 8000, renewMonths: 8, renewFactor: 0.5, visitors: 8000, fame: 4 },
  pachinko: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'パチンコ店', owner: '遊技場の運営会社', authority: 'attract', note: '駐車場の大きな遊技場。雇用と税収はありますが、周りの治安が少し悪くなり、子育て世帯は近くに来ることを嫌がります。幹線道路か国道に面した土地が要ります。', w: 2, h: 2, cost: 1500, months: 8, jobs: 50, bizTax: 90, use: 150, req: 'arterial' },
  boatRace: { ...req('leisure', 'landmark', '競艇の施行者（自治体の組合）'), name: '競艇場（ボートレース場）', note: '水面を 6 艇のボートが走る公営競技場。売上の一部が市の収入になります。水辺から 90m 以内に置けます（1 か所）。', w: 5, h: 3, cost: 18000, months: 30, jobs: 250, income: 450, visitors: 12000, fame: 5, req: 'water', unique: true },
  keirin: { ...req('leisure', 'landmark', '競輪の施行者（自治体の組合）'), name: '競輪場', note: 'すりばち状のバンクを自転車が走る公営競技場。売上の一部が市の収入になります（1 か所）。', w: 4, h: 4, cost: 15000, months: 30, jobs: 200, income: 350, visitors: 9000, fame: 4, unique: true },
  japaneseGarden: { ...city('culture', 'history'), name: '日本庭園', note: '池と石橋、茶室と枯山水のある回遊式の庭園。季節ごとに観光客が訪れ、高齢世帯の文化の満足が上がります。', lvMax: 0, w: 3, h: 3, cost: 12000, months: 18, upkeep: 60, staffReq: 4, staffKind: '庭師', wage: 24, hire: 1, capacity: 1, capUnit: '', reach: 60, ageRate: 0.06, renewCost: 4000, renewMonths: 6, renewFactor: 0.5, visitors: 6000, fame: 5, green: 1 },
  giantRobot: { ...base, fam: 'leisure', cat: 'landmark', build: 'invite', name: '実物大ロボット像', owner: 'アニメ・玩具メーカー', authority: 'attract', note: '高さ 18m の実物大ロボットの立像。夜は目が光り、決まった時間に首や腕が動きます。世界中からファンが写真を撮りに来ます。知名度 25 以上が要ります（1 か所）。', w: 2, h: 2, cost: 2500, months: 18, jobs: 30, bizTax: 40, visitors: 15000, fame: 9, req: 'fame', unique: true },
  robotFactory: { ...inv('ロボットメーカー'), cat: 'industry', name: 'ロボット工場', note: '産業用ロボットと介護ロボットをつくる工場。市内に精密部品工場か半導体工場があると材料が近く、売上が伸びます（ないと 0.7 倍）。輸出が多く、円安で税が増えます。', w: 4, h: 3, cost: 9000, months: 30, jobs: 900, bizTax: 700, use: 700, pollution: 0.4, fame: 4, chain: ['partsPlant', 'semicon'] },
  casino: { ...inv('IR 事業者'), cat: 'landmark', name: '統合型リゾート（カジノ）', note: 'カジノ・国際会議場・ホテル・劇場をまとめた統合型リゾート。来訪者と税収（カジノの納付金）がとても大きい一方、ギャンブル依存と治安への不安から、支持率と子育て世帯の満足が下がります。知名度 40 以上・人口 4 万人以上（1 か所）。', w: 5, h: 4, cost: 60000, months: 60, jobs: 3500, bizTax: 3500, use: 2500, pollution: 0.3, visitors: 60000, fame: 15, req: 'fame', unique: true },
  outletMall: { ...inv('商業デベロッパー'), cat: 'leisure', name: 'アウトレットモール', note: 'ブランド店が並ぶ屋外型のモール。インターや幹線道路の近くに、市外から車で買物客が来ます。', w: 4, h: 3, cost: 6000, months: 24, jobs: 600, bizTax: 300, use: 400, visitors: 18000, fame: 4, req: 'arterial' },
  skiResort: { ...base, fam: 'leisure', cat: 'nature', build: 'invite', name: 'スキー場', owner: '索道会社', authority: 'attract', note: 'ゲレンデとリフトのあるスキー場。冬は市外から人が来ます。急斜面か林のある山のふもとに置けます。', w: 3, h: 3, cost: 5000, months: 18, jobs: 120, bizTax: 60, use: 150, visitors: 9000, fame: 4, req: 'mountain' },
  skyscraper: { ...inv('大手デベロッパー'), cat: 'landmark', name: '超高層ビル（複合タワー）', note: '高さ 300m・62 階建ての複合タワー。オフィス・ホテル・展望台・商業が入り、街の顔になります。駅の近くで、人口 2 万人・知名度 30 以上が要ります。', w: 3, h: 3, cost: 50000, months: 54, jobs: 5000, bizTax: 2200, use: 2000, visitors: 20000, fame: 14, req: 'station' },
  esportsArena: { ...base, fam: 'leisure', cat: 'leisure', build: 'invite', name: 'e スポーツアリーナ', owner: 'ゲーム企業', authority: 'attract', note: '大画面の観客席がある e スポーツの大会会場と配信スタジオ。若い世代が集まり、IT の仕事も生まれます。駅の近くか幹線沿いに来ます。', w: 2, h: 2, cost: 3000, months: 14, jobs: 120, bizTax: 90, use: 300, visitors: 7000, fame: 4, req: 'station' },
  // ---- v21 ----
  usBase: { ...req('safety', 'safety', '国（防衛省）・在日米軍'), name: '米軍基地', note: '在日米軍の基地（国が用地を提供し、市は受け入れに同意する形）。基地で働く日本人従業員の雇用と、国からの交付金（基地交付金・再編交付金など）が入り、基地のお祭りで見物客も来ます。一方で航空機や訓練の騒音、事件・事故への不安から、周りの暮らしの満足と支持率が下がります。人口 1.5 万人以上（1 か所）。', w: 6, h: 5, cost: 10000, months: 48, jobs: 1500, income: 600, visitors: 4000, fame: 3, unique: true },
  oilField: { ...inv('石油開発会社'), cat: 'industry', name: '石油・天然ガスの採掘場', note: '井戸のやぐらとポンプで原油と天然ガスをくみ上げます（日本では新潟・秋田などに小さな油田・ガス田があります）。税収は大きめですが、周りの空気と環境が悪くなります。売上は為替の影響を受けます（円安で増える）。', w: 2, h: 2, cost: 4000, months: 18, jobs: 60, bizTax: 380, use: 150, pollution: 1.6 },
  oilRefinery: { ...inv('石油元売り'), cat: 'industry', name: '製油所と石油タンク基地', note: '原油を精製してガソリンや灯油にする工場と、大きな丸いタンク群。タンカーが着く水辺（90m 以内）に置けます。雇用と税は大きい一方、空気が悪くなり、近くに住むのは嫌がられます。港か製油所があると沖をタンカーが行き来します。', w: 5, h: 4, cost: 30000, months: 48, jobs: 700, bizTax: 1600, use: 900, pollution: 2.6, req: 'water' },
  gasStation: { ...inv('石油販売店'), name: 'ガソリンスタンド', note: '給油と洗車の店。幹線道路か国道沿いに来ます。小さいですが雇用と税が入ります。', w: 1, h: 1, cost: 300, months: 3, jobs: 8, bizTax: 10, use: 30, pollution: 0.1, req: 'arterial' },
  parkingTower: { ...city('transport', 'transport'), name: '立体駐車場', note: '自走式 6 層の市営立体駐車場。駅前や商店街に置くと、近く（240m 以内）の店の売上が 1.5 割増え、路上駐車が減って中心部の渋滞が少し軽くなります。駐車料が入ります。', lvMax: 0, w: 2, h: 2, cost: 9000, months: 10, upkeep: 40, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 3000, renewMonths: 3, renewFactor: 0.5, income: 90 },
  ancientRuins: { ...city('culture', 'history'), name: '古代遺跡（史跡公園）', note: '発掘された古墳と竪穴住居・物見やぐらを復元した史跡公園と出土品の展示館。歴史好きの観光客と修学旅行が来て、文化の満足が上がります（1 か所）。', lvMax: 0, w: 4, h: 3, cost: 14000, months: 24, upkeep: 70, staffReq: 5, staffKind: '学芸員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.05, renewCost: 4000, renewMonths: 6, renewFactor: 0.5, visitors: 9000, fame: 7, green: 1, unique: true },
  // ---- v27 ----
  tvStation: { ...inv('放送局'), cat: 'landmark', name: 'ローカルテレビ局', note: '県域のテレビ局の本社と電波塔。ニュースや情報番組で街が取り上げられやすくなり、ときどき特集で知名度が上がります。スタジオ見学の人も来ます。駅の近くに来ます（1 か所）。', w: 3, h: 2, cost: 6000, months: 24, jobs: 350, bizTax: 300, use: 300, visitors: 3000, fame: 8, req: 'station', unique: true },
  megaBank: { ...inv('メガバンク'), name: 'メガバンクの地域本部', note: '全国の大銀行の地域本部と大型店。地元企業への融資が増えて景気が少し強くなり、法人の税が入ります。人口 3 万人以上・駅の近く（1 か所）。', w: 2, h: 2, cost: 15000, months: 24, jobs: 800, bizTax: 1100, use: 500, fame: 4, req: 'station', unique: true },
  globalIT: { ...inv('米大手 IT 企業'), cat: 'landmark', name: '米大手 IT 企業の日本拠点（研究所）', note: 'アメリカの大手 IT 企業が研究所とオフィスを置きます。高い給料の職で若い世代が集まり、知名度が大きく上がります。進出のあと、市とスマートシティの提携ができます。知名度 35 以上・人口 2.5 万人以上（1 か所）。', w: 4, h: 3, cost: 30000, months: 36, jobs: 1800, bizTax: 1600, use: 1500, visitors: 3000, fame: 12, req: 'fame', unique: true },
  // ---- v33：鉄道・次世代交通・国際・未来・万博・昔の建物・外国風の名所 ----
  railDepot: { ...inv('鉄道会社'), cat: 'transport', name: '電車の車両基地', note: '電車を止めて点検・洗車する基地。運行本数が増え、駅の混雑がやわらぎ、整備の職が生まれます。線路と駅がある街に来ます（1 か所）。近くは夜も明るく、少し嫌がられます。', w: 5, h: 2, cost: 8000, months: 24, jobs: 320, bizTax: 180, use: 120, req: 'station', unique: true },
  maglevStation: { ...inv('鉄道会社（リニア）'), cat: 'landmark', name: 'リニア中央新幹線の駅', note: '時速 500km の超電導リニアの中間駅。大都市まで数十分になり、会社と観光客が集まり、知名度が大きく上がります。知名度 50 以上・人口 6 万人以上・駅の近く（1 か所）。', w: 5, h: 2, cost: 60000, months: 48, jobs: 400, bizTax: 900, use: 800, visitors: 12000, fame: 15, req: 'station', unique: true },
  hyperloop: { ...inv('次世代交通の研究機構'), cat: 'landmark', name: '次世代交通（真空チューブ列車）の実験線', note: '浮いたカプセルが低圧のチューブの中を走る、次世代の鉄道の実験線と見学館。研究者と見学の人が来て、知名度が上がります。知名度 40 以上・人口 4 万人以上（1 か所）。', w: 6, h: 1, cost: 30000, months: 36, jobs: 260, bizTax: 300, use: 300, visitors: 6000, fame: 10, req: 'fame', unique: true },
  consulate: { ...inv('外務省・外国政府'), cat: 'landmark', name: '外国の総領事館', note: '外国の総領事館。旗のある洋館と警備。外国の人の手続きと交流の拠点になり、来訪者と知名度が上がります。知名度 40 以上・姉妹都市が 1 つ以上（1 か所）。まれに、スパイの疑いのある事件が起きることも。', w: 2, h: 2, cost: 5000, months: 18, jobs: 60, bizTax: 50, use: 40, visitors: 2500, fame: 5, req: 'fame', unique: true },
  department: { ...inv('百貨店'), cat: 'biz', name: 'デパート（百貨店）', note: '駅前の老舗デパート。地下の食品売り場と屋上の遊園地。買物の満足が上がり、市外からも人が来ます。人口 2 万人以上・駅の近く（1 か所）。', w: 3, h: 3, cost: 20000, months: 30, jobs: 700, bizTax: 700, use: 900, visitors: 4000, fame: 4, req: 'station', unique: true },
  futureTower: { ...inv('都市開発会社'), cat: 'landmark', name: '未来都市タワー', note: '空中庭園とドローンポートのある、ねじれたガラスの超高層ビル。夜は全面が光ります。会社と人が集まり、知名度が大きく上がります。知名度 45 以上・人口 4 万人以上（1 か所）。', w: 3, h: 3, cost: 70000, months: 48, jobs: 2500, bizTax: 2200, use: 1800, visitors: 5000, fame: 14, req: 'station', unique: true },
  expoSite: { ...city('leisure', 'landmark'), name: '万博会場（パビリオン）', note: '国際博覧会の会場。各国のパビリオンと大屋根の輪。万博の誘致に勝った街だけが建てられ、開催の年は国内外から大勢の人が来ます。閉幕後は記念公園として残ります。', lvMax: 0, staffReq: 30, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 6, h: 5, cost: 60000, months: 36, upkeep: 300, visitors: 30000, fame: 20, green: 1, unique: true },
  redBrick: { ...city('culture', 'history'), name: '赤レンガ倉庫', note: '明治のころの赤レンガの倉庫を、店とホールに生まれ変わらせた歴史の名所。来訪者と文化の満足。水辺によく似合います（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 4, h: 1, cost: 9000, months: 18, upkeep: 50, visitors: 6000, fame: 5, unique: true },
  westernHouse: { ...city('culture', 'history'), name: '洋館（異人館）', note: '明治・大正の外国人の住まいだった洋館。見学と結婚式の前撮りで人が来ます（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 2, h: 2, cost: 5000, months: 12, upkeep: 30, visitors: 3000, fame: 3, unique: true },
  machiya: { ...city('culture', 'history'), name: '町家の街並み（重要伝統的建造物群）', note: '格子戸と瓦屋根の町家が並ぶ通りを、保存して店や宿に活かします。歩いて楽しい通りに観光客が来ます（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 4, h: 2, cost: 12000, months: 24, upkeep: 60, visitors: 7000, fame: 6, unique: true },
  clockTower: { ...city('leisure', 'landmark'), name: '時計塔（ロンドン風）', note: 'ヨーロッパの国会議事堂の時計塔を思わせる、石造り風の高い時計塔のある広場。待ち合わせと写真の名所になります（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 2, h: 2, cost: 8000, months: 18, upkeep: 30, visitors: 4000, fame: 4, unique: true },
  ironTower: { ...city('leisure', 'landmark'), name: '鉄の塔（パリ風）', note: '19 世紀のパリの鉄の塔を思わせる、鉄骨の展望塔。夜は金色に光ります（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 3, h: 3, cost: 15000, months: 24, upkeep: 50, visitors: 8000, fame: 7, unique: true },
  windmill: { ...city('park', 'nature'), name: '風車とチューリップ畑（オランダ風）', note: '大きな風車と、春に咲くチューリップ畑の公園。花の季節は人でにぎわいます（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 3, h: 2, cost: 4000, months: 10, upkeep: 25, visitors: 3500, fame: 3, green: 1, unique: true },
  pyramidHall: { ...city('culture', 'landmark'), name: 'ピラミッド形の展示館', note: 'ガラスのピラミッドの屋根の博物館。世界の文明の展示で、修学旅行と観光の人が来ます（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 3, h: 3, cost: 16000, months: 24, upkeep: 60, visitors: 7000, fame: 6, unique: true },
  triumphGate: { ...city('leisure', 'landmark'), name: '凱旋門風の門', note: '大通りの突き当たりに立つ、石造り風のアーチの門。パレードと記念写真の名所です（1 か所）。', lvMax: 0, staffReq: 4, staffKind: '職員', wage: 26, hire: 1, capacity: 1, capUnit: '', reach: 70, ageRate: 0.04, renewCost: 3000, renewMonths: 6, renewFactor: 0.5, w: 2, h: 1, cost: 6000, months: 14, upkeep: 20, visitors: 3000, fame: 3, unique: true },
  autoHub: { ...inv('物流会社'), cat: 'biz', name: '自動運転トラックの中継拠点', note: '高速道路の近くで、無人で走るトラックの荷物を積み替える拠点。物流が速くなり、景気と工場の売上が伸びます。インターチェンジか幹線道路の近く（1 か所）。', w: 4, h: 3, cost: 12000, months: 24, jobs: 220, bizTax: 400, use: 300, req: 'arterial', unique: true },
  // ---- v19：ビジョン専用の施設（選んだビジョンの街だけ） ----
  kodomoMirai: { ...city('care', 'kids'), name: 'こども未来館', note: '【子育て日本一の街 専用】一時預かり・子育て相談・屋内遊び場をひとつにした拠点。保育の受け入れが増え、子育て世帯の満足が上がり、市外からも親子が遊びに来ます。', lvMax: 0, w: 2, h: 2, cost: 18000, months: 14, upkeep: 160, staffReq: 18, staffKind: '保育士', wage: 24, hire: 2, capacity: 160, capUnit: '人', ageRate: 0.12, renewCost: 7000, renewMonths: 6, renewFactor: 0.5, unique: true, vision: 'family', visitors: 2500, fame: 3 },
  ecoCenter: { ...city('park', 'nature'), name: 'ゼロカーボン・エコパーク', note: '【環境先進都市 専用】太陽光と蓄電池・ビオトープ・環境学習館の公園。市内の工場の排出が減り、電力が増え、まわりの空気がよくなります。', lvMax: 0, w: 3, h: 2, cost: 22000, months: 16, upkeep: 120, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 8000, renewMonths: 6, renewFactor: 0.5, unique: true, vision: 'green', green: 2, gen: 1500, visitors: 1500, fame: 3 },
  kankoDmo: { ...city('leisure', 'landmark'), name: '観光まちづくり会社（DMO）と案内所', note: '【観光・文化の街 専用】観光地域づくり法人の拠点。宿泊・体験の売り込みと案内で、来訪者と知名度が大きく伸び、宿泊税の収入も増えます。', lvMax: 0, w: 1, h: 1, cost: 9000, months: 8, upkeep: 90, staffReq: 8, staffKind: '職員', wage: 26, hire: 2, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 3000, renewMonths: 3, renewFactor: 0.5, unique: true, vision: 'tourism', visitors: 9000, fame: 8 },
  incubator: { ...city('biz', 'biz'), name: '産業支援センター（インキュベーション）', note: '【産業と雇用の街 専用】起業の相談・試作工房・貸しオフィス。企業が来やすくなり、新しい会社が育って職と税が増えます。', lvMax: 0, w: 2, h: 1, cost: 15000, months: 12, upkeep: 110, staffReq: 10, staffKind: '職員', wage: 28, hire: 2, capacity: 1, capUnit: '', ageRate: 0.1, renewCost: 5000, renewMonths: 4, renewFactor: 0.5, unique: true, vision: 'industry', jobs: 350, bizTax: 60 },
  bosaiCenter: { ...city('shelter', 'safety'), name: '総合防災センター', note: '【安心・安全で長く住める街 専用】災害対策本部・備蓄・防災学習と、消防・警察・医療の連携拠点。避難所と備蓄が大きく増え、災害の被害が減り、治安と救急の水準が上がります。', lvMax: 0, w: 2, h: 2, cost: 20000, months: 14, upkeep: 140, staffReq: 12, staffKind: '職員', wage: 28, hire: 2, capacity: 8000, capUnit: '人', ageRate: 0.08, renewCost: 7000, renewMonths: 6, renewFactor: 0.5, unique: true, vision: 'safe' },
  dxCenter: { ...city('gov', 'gov'), name: '行政 DX 推進センター', note: '【健全財政の街 専用】手続きのオンライン化・窓口の集約・データでの施設管理。行政の費用と施設の維持費が下がります。', lvMax: 0, w: 1, h: 1, cost: 8000, months: 10, upkeep: 60, staffReq: 6, staffKind: '職員', wage: 30, hire: 2, capacity: 1, capUnit: '', ageRate: 0.12, renewCost: 3000, renewMonths: 3, renewFactor: 0.5, unique: true, vision: 'sound' },
  // ---- v12：自衛隊 ----
  sdfBase: { ...req('safety', 'safety', '国（防衛省）'), name: '自衛隊の駐屯地', note: '陸上自衛隊の部隊が置かれます（市は用地を用意）。隊員と家族が住み、基地交付金が入り、大きな災害のときは被害が早く収まります。訓練の音に反対する声もあります（1 か所）。', w: 4, h: 4, cost: 15000, months: 36, jobs: 700, income: 180, fame: 2, unique: true },
  // ---- v7：暮らし ----
  recycleCenter: { ...city('waste', 'infra'), name: 'リサイクルセンター', note: '分別した資源ごみを選別して売ります。ごみの量が 1 割減り（2 か所まで）、資源の売却益が入ります。', lvMax: 0, w: 2, h: 1, cost: 7000, months: 8, upkeep: 70, staffReq: 6, staffKind: '収集職員', wage: 34, hire: 2, capacity: 1, capUnit: '', ageRate: 0.15, renewCost: 3000, renewMonths: 3, renewFactor: 0.6, income: 40 },
  // ---- 市以外 ----
  // ---- v49 未来の施設 ----
  megaFloat: { ...inv('海洋開発の会社'), cat: 'landmark', name: '海上都市（メガフロート）', note: '海に浮かぶ人工の街区。高潮に強く、世界から視察が来ます（未来の技術）。水辺から 90m 以内。', w: 5, h: 5, cost: 200000, months: 72, jobs: 1500, bizTax: 600, visitors: 4000, fame: 8, req: 'water', unlock: 10, unique: true },
  undergroundCity: { ...inv('デベロッパー'), cat: 'landmark', name: '地下都市の入口', note: '暑さと災害に強い地下の街の入口（未来の技術）。', w: 2, h: 2, cost: 60000, months: 48, jobs: 500, bizTax: 200, visitors: 1000, fame: 4, unlock: 8 },
  skyGarden: { ...inv('デベロッパー'), cat: 'landmark', name: '空中庭園のツインタワー', note: '2 本の超高層ビルを結ぶ空中の庭園（未来の技術）。', w: 2, h: 2, cost: 90000, months: 48, jobs: 1200, bizTax: 400, visitors: 2500, fame: 6, unlock: 6 },
  verticalFarm: { ...inv('アグリテック'), cat: 'agri', name: '垂直農場', note: '高層ビルの中で野菜を育てる農場（未来の技術）。', w: 1, h: 1, cost: 8000, months: 18, jobs: 40, bizTax: 40, use: 600, unlock: 4 },
  orbitalHotel: { ...inv('宇宙旅行の会社'), cat: 'landmark', name: '宇宙ホテルの受付センター', note: '軌道上のホテルへ旅立つ人の受付と訓練の施設。宇宙港があると来ます（未来の技術）。', w: 2, h: 2, cost: 40000, months: 36, jobs: 200, bizTax: 200, visitors: 1500, fame: 6, unlock: 12 },
  moonBase: { ...inv('宇宙機関'), cat: 'landmark', name: '月面基地の管制所', note: '月面基地と通信して運用する管制所（未来の技術）。', w: 3, h: 2, cost: 50000, months: 36, jobs: 400, bizTax: 100, fame: 6, unlock: 14 },
  aiDataCity: { ...inv('AI 企業'), cat: 'landmark', name: 'AI データ都市', note: '巨大な AI 計算機が並ぶ街区。電気を非常に多く使います（未来の技術）。', w: 4, h: 4, cost: 150000, months: 48, jobs: 800, bizTax: 1200, fame: 5, use: 12000, unlock: 8 },
  robotDistrict: { ...inv('ロボット企業'), cat: 'landmark', name: 'ロボットと暮らす街区', note: '配送・介護・清掃をロボットが担う実験の街区（未来の技術）。', w: 3, h: 3, cost: 60000, months: 48, jobs: 300, bizTax: 250, visitors: 1200, fame: 5, unlock: 9 },
  metaverseHall: { ...inv('IT 企業'), cat: 'landmark', name: 'メタバース体験館', note: '仮想空間の街を体験するドーム。若者が集まります（未来の技術）。', w: 2, h: 2, cost: 12000, months: 18, jobs: 60, bizTax: 60, visitors: 1500, fame: 3, unlock: 3 },
  // ---- v49 宗教・地域の小さな施設 ----
  jizodo: { ...req('religion', 'history', '自治会'), name: '地蔵堂（お地蔵さん）', note: '辻に立つお地蔵さんと小さなお堂。子どもの見守りと、地域の安心の象徴です。', w: 1, h: 1, cost: 100, months: 1 },
  hokora: { ...req('religion', 'history', '氏子'), name: '祠と鳥居（鎮守の森）', note: '小さな祠と鳥居、まわりの木立。地域の鎮守です。', w: 1, h: 1, cost: 100, months: 1, green: 0.5 },
  mosque: { ...req('religion', 'history', '宗教法人'), name: 'モスク', note: 'イスラム教の礼拝所（宗教法人が建てます）。信者の礼拝と交流の場で、見学会や炊き出しで近所との行き来も生まれます。', w: 2, h: 2, cost: 3000, months: 14, visitors: 100 },
  synagogue: { ...req('religion', 'history', '宗教法人'), name: 'シナゴーグ', note: 'ユダヤ教の会堂。', w: 1, h: 1, cost: 1000, months: 10 },
  hinduTemple: { ...req('religion', 'history', '宗教法人'), name: 'ヒンドゥー寺院', note: '色とりどりの塔をもつヒンドゥー教の寺院（宗教法人が建てます）。祭りの日は見物の人も訪れます。', w: 2, h: 1, cost: 2000, months: 12, visitors: 100 },
  monastery: { ...req('religion', 'history', '修道会'), name: '修道院', note: '回廊に囲まれた修道院。クッキーとバターが名物です。', w: 3, h: 2, cost: 2500, months: 14, visitors: 150, green: 0.5 },
  shinshukyo: { ...req('religion', 'history', '宗教法人'), name: '新宗教の本部', note: '大きな礼拝殿をもつ新宗教の本部。信者が全国から集まり、選挙の票をまとめる力もあります。', w: 4, h: 3, cost: 20000, months: 30, jobs: 200, visitors: 2000, fame: 1 },
  chonaikaikan: { ...city('culture', 'edu'), name: '町内会館', note: '町内会の集会所。祭りの準備とお年寄りの集まりの場。', w: 1, h: 1, cost: 800, months: 4, upkeep: 5, lvMax: 0 },
  shobodan: { ...city('fire', 'safety'), name: '消防団の詰所（火の見櫓）', note: '地域の消防団の詰所と、半鐘の火の見櫓。災害のときの助けになります。', w: 1, h: 1, cost: 800, months: 4, upkeep: 10, lvMax: 0 },
  koshuToilet: { ...city('park', 'park'), name: '公衆トイレ', note: '駅前と観光地の公衆トイレ。観光客の満足が少し上がります。', w: 1, h: 1, cost: 300, months: 2, upkeep: 5, lvMax: 0 },
  bosaiMusen: { ...city('gov', 'safety'), name: '防災行政無線の塔', note: '街じゅうに放送を流すスピーカーの塔。夕方 5 時のチャイムも。', w: 1, h: 1, cost: 300, months: 2, upkeep: 2, lvMax: 0 },
  // ---- v49 観光・レジャー・文化・まつり ----
  observatoryDeck: { ...req('leisure', 'leisure', '市・観光協会'), name: '山頂の展望台', note: '街を一望する山頂の展望台。夜景の名所になります。', w: 2, h: 2, cost: 3000, months: 12, visitors: 600, fame: 2 },
  suspensionBridge: { ...req('leisure', 'leisure', '市・観光協会'), name: '渓谷のつり橋', note: '谷にかかる歩行者のつり橋。スリルと紅葉で人が来ます。', w: 4, h: 1, cost: 4000, months: 12, visitors: 800, fame: 2 },
  waterfallTrail: { ...req('leisure', 'nature', '市・森林管理署'), name: '滝と遊歩道', note: '滝を見上げる遊歩道。夏は涼を求めて人が来ます。', w: 2, h: 2, cost: 1500, months: 8, visitors: 500, fame: 1, green: 1 },
  cave: { ...req('leisure', 'nature', '観光協会'), name: '鍾乳洞', note: '地下の鍾乳洞の観光コース。一年中ひんやり。', w: 2, h: 2, cost: 2500, months: 12, visitors: 700, fame: 2 },
  zipline: { ...inv('アウトドアの会社'), cat: 'leisure', name: 'ジップライン', note: '森の上をワイヤーで滑り降りるアトラクション。', w: 1, h: 4, cost: 1500, months: 6, jobs: 8, bizTax: 8, visitors: 400 },
  athletic: { ...inv('アウトドアの会社'), cat: 'leisure', name: '森のアスレチック', note: '丸太の遊具で遊ぶ森の公園。子どもの満足が上がります。', w: 2, h: 2, cost: 1200, months: 6, jobs: 6, bizTax: 5, visitors: 300, green: 0.6 },
  glamping: { ...inv('アウトドアの会社'), cat: 'leisure', name: 'グランピング', note: 'テントでホテルのように泊まるキャンプ。若い人と家族に人気。', w: 2, h: 2, cost: 2000, months: 8, jobs: 15, bizTax: 15, visitors: 500, fame: 1, green: 0.5 },
  autoCamp: { ...inv('アウトドアの会社'), cat: 'leisure', name: 'オートキャンプ場', note: '車を横づけできるキャンプ場。週末はにぎわいます。', w: 3, h: 2, cost: 1500, months: 6, jobs: 6, bizTax: 8, visitors: 400, green: 0.6 },
  circuit: { ...inv('サーキットの会社'), cat: 'leisure', name: 'サーキット（自動車レース場）', note: 'レースの開かれるサーキット。大きな大会の日は街があふれます。騒音に苦情も。', w: 6, h: 4, cost: 40000, months: 36, jobs: 120, bizTax: 80, visitors: 4000, fame: 5, pollution: 0.5 },
  kart: { ...inv('民間'), cat: 'leisure', name: 'カートコース', note: 'ゴーカートのコース。家族と若者が遊びます。', w: 2, h: 2, cost: 1500, months: 6, jobs: 8, bizTax: 8, visitors: 300 },
  horseClub: { ...inv('乗馬クラブ'), cat: 'leisure', name: '乗馬クラブ', note: '馬に乗れるクラブ。子どもの体験と、お年寄りの趣味に。', w: 3, h: 2, cost: 1500, months: 8, jobs: 10, bizTax: 8, visitors: 200, green: 0.5 },
  skateRink: { ...inv('民間・財団'), cat: 'leisure', name: 'スケートリンク', note: '屋内のアイススケート場。フィギュアスケートの選手が育ちます。', w: 3, h: 2, cost: 6000, months: 18, jobs: 30, bizTax: 15, visitors: 600, fame: 1, use: 300 },
  skiJump: { ...req('leisure', 'leisure', '市・スキー連盟'), name: 'スキージャンプ台', note: 'ジャンプ競技の大きな台。大会で知名度が上がります。', w: 1, h: 5, cost: 8000, months: 24, visitors: 500, fame: 3 },
  rowing: { ...req('leisure', 'leisure', '市・ボート協会'), name: 'ボートの漕艇場', note: 'ボート競技のコース。大学と高校のボート部が練習します。水辺から 90m 以内。', w: 2, h: 5, cost: 3000, months: 12, visitors: 200, req: 'water' },
  budokan: { ...req('leisure', 'leisure', '市・武道団体'), name: '武道館（柔道・剣道・弓道）', note: '武道の稽古と大会の場。子どもの心と体を育てます。', w: 2, h: 2, cost: 6000, months: 18, visitors: 300, fame: 1 },
  sumoBeya: { ...inv('相撲部屋'), cat: 'leisure', name: '相撲部屋', note: '力士が暮らして稽古する部屋。朝稽古の見学が観光になります。', w: 1, h: 1, cost: 1000, months: 8, jobs: 15, bizTax: 5, visitors: 300, fame: 2 },
  nohgaku: { ...req('leisure', 'history', '財団'), name: '能楽堂', note: '能と狂言の舞台。伝統芸能の水準と知名度が上がります。', w: 2, h: 2, cost: 8000, months: 24, visitors: 300, fame: 2 },
  kabukiza: { ...inv('興行会社'), cat: 'leisure', name: '歌舞伎の劇場', note: '提灯と定式幕の歌舞伎の劇場。外国人観光客にも人気。', w: 3, h: 2, cost: 20000, months: 30, jobs: 150, bizTax: 60, visitors: 2000, fame: 4 },
  yose: { ...inv('興行会社'), cat: 'leisure', name: '寄席（落語・漫才）', note: '落語と漫才の小屋。昼から夜まで笑い声。', w: 1, h: 1, cost: 1000, months: 6, jobs: 10, bizTax: 6, visitors: 300, fame: 1 },
  smallTheater: { ...inv('劇団'), cat: 'leisure', name: '小劇場', note: '若い劇団が芝居をする小さな劇場。文化の水準が少し上がります。', w: 1, h: 1, cost: 800, months: 5, jobs: 6, bizTax: 4, visitors: 150 },
  jazzClub: { ...inv('民間'), cat: 'leisure', name: 'ジャズクラブ・ライブバー', note: '夜に生演奏を聴ける店。夜の街の大人の楽しみ。', w: 1, h: 1, cost: 600, months: 4, jobs: 6, bizTax: 6, visitors: 100 },
  artIsland: { ...req('leisure', 'leisure', '財団'), name: '屋外アートの丘', note: '現代アートの作品が野外に並ぶ丘。世界から人が来ます。', w: 3, h: 3, cost: 15000, months: 24, visitors: 1500, fame: 4 },
  railMuseum: { ...inv('鉄道会社'), cat: 'leisure', name: '鉄道博物館', note: '本物の車両と SL が並ぶ博物館。子どもと鉄道ファンが集まります。', w: 4, h: 2, cost: 20000, months: 24, jobs: 60, bizTax: 20, visitors: 2500, fame: 3 },
  mangaMuseum: { ...inv('財団・出版社'), cat: 'leisure', name: '漫画・アニメのミュージアム', note: 'ゆかりの漫画家とアニメの記念館。聖地巡礼の人が来ます。', w: 2, h: 2, cost: 8000, months: 18, jobs: 30, bizTax: 15, visitors: 1500, fame: 3 },
  hauntedHouse: { ...inv('民間'), cat: 'leisure', name: 'お化け屋敷', note: '夏に人気のお化け屋敷。', w: 1, h: 1, cost: 500, months: 3, jobs: 6, bizTax: 4, visitors: 200 },
  maze: { ...inv('民間'), cat: 'leisure', name: '巨大迷路', note: '生け垣の巨大迷路。家族連れに。', w: 2, h: 2, cost: 800, months: 4, jobs: 4, bizTax: 3, visitors: 200, green: 0.5 },
  yagura: { ...req('leisure', 'leisure', '自治会・商店会'), name: '盆踊りの広場（夏祭りの櫓）', note: '夏祭りと盆踊りの櫓と屋台。地域のつながりが強まり、夏に人が来ます。', w: 2, h: 2, cost: 500, months: 2, visitors: 400, fame: 1 },
  mikoshiGura: { ...req('leisure', 'history', '氏子・自治会'), name: '神輿蔵', note: '祭りの神輿をしまう蔵。祭りの準備の拠点です。', w: 1, h: 1, cost: 600, months: 4 },
  dashiKaikan: { ...req('leisure', 'history', '保存会'), name: '山車会館', note: '祭りの豪華な山車を一年中展示する館。', w: 2, h: 1, cost: 4000, months: 14, visitors: 600, fame: 2 },
  monzenmachi: { ...req('leisure', 'history', '商店会'), name: '門前町の通り', note: '寺社へ向かう参道に、土産物と茶屋が並ぶ通り。食べ歩きの観光地になります。', w: 3, h: 2, cost: 3000, months: 12, jobs: 60, visitors: 1500, fame: 2 },
  shukubamachi: { ...req('leisure', 'history', '保存会'), name: '宿場町の町並み', note: '街道沿いの格子戸の町家が並ぶ宿場町。保存地区になると知名度が上がります。', w: 3, h: 2, cost: 3000, months: 12, jobs: 30, visitors: 1200, fame: 3 },
  onsenGai: { ...inv('旅館組合'), cat: 'leisure', name: '温泉街', note: '湯けむりの立つ旅館と土産物の通り。射的と浴衣の散歩。源泉があるとにぎわいます。', w: 3, h: 2, cost: 8000, months: 18, jobs: 200, bizTax: 60, visitors: 2500, fame: 3 },
  ashiyu: { ...req('leisure', 'leisure', '観光協会'), name: '足湯', note: '誰でも無料で入れる足湯。観光客の休憩所。', w: 1, h: 1, cost: 300, months: 2, visitors: 150 },
  kofun: { ...req('leisure', 'history', '市・文化庁'), name: '古墳（前方後円墳）', note: '古代の王の墓。史跡公園として整備すると知名度が上がります。', w: 4, h: 3, cost: 3000, months: 12, visitors: 600, fame: 3, green: 0.8 },
  bukeYashiki: { ...req('leisure', 'history', '保存会'), name: '武家屋敷の通り', note: '白壁と黒い瓦の武家屋敷が並ぶ通り。城下町の風情。', w: 3, h: 2, cost: 4000, months: 14, visitors: 1000, fame: 3 },
  sando: { ...req('leisure', 'history', '寺社'), name: '石灯籠の参道', note: '石灯籠が並ぶ杉並木の参道。夜は灯籠がともります。', w: 1, h: 4, cost: 1500, months: 6, visitors: 400, fame: 1, green: 0.5 },
  // ---- v49 エネルギー・インフラ・観測 ----
  pumpedHydro: { ...city('power', 'infra'), name: '揚水発電所', note: '夜の余った電気で水をくみ上げ、昼に流して発電する「巨大な電池」。太陽光と風力が多い街の電気を安定させます。', w: 4, h: 4, cost: 60000, months: 48, upkeep: 200, lvMax: 0, capacity: 3000, capUnit: '世帯相当（発電）', gen: 3000, income: 200, ageRate: 0.1 },
  solarThermal: { ...city('power', 'infra'), name: '太陽熱発電（タワー式）', note: '鏡で日光を塔に集めて発電します。晴れた日の昼に強い。', w: 4, h: 4, cost: 40000, months: 36, upkeep: 150, lvMax: 0, capacity: 2000, capUnit: '世帯相当（発電）', gen: 2000, income: 150, ageRate: 0.2, unlock: 3 },
  tidalPower: { ...city('power', 'infra'), name: '潮力・波力発電', note: '潮の満ち引きと波で発電します。海に面した街だけ。水辺から 90m 以内。', w: 3, h: 2, cost: 30000, months: 36, upkeep: 120, lvMax: 0, capacity: 1200, capUnit: '世帯相当（発電）', gen: 1200, income: 120, ageRate: 0.2, req: 'water', unlock: 2 },
  biogas: { ...city('power', 'infra'), name: 'バイオガス発電（メタン発酵）', note: '生ごみと家畜のふんを発酵させてガスをとり、発電します。においが少し減り、ごみも減ります。', w: 2, h: 2, cost: 8000, months: 18, upkeep: 60, lvMax: 0, capacity: 400, capUnit: '世帯相当（発電）', gen: 400, income: 40, ageRate: 0.25 },
  rdf: { ...city('waste', 'infra'), name: 'ごみ固形燃料（RDF）の工場', note: '燃えるごみを乾かして固め、燃料にする工場。', w: 2, h: 2, cost: 9000, months: 18, upkeep: 80, lvMax: 0, pollution: 0.4 },
  pylon: { ...req('power', 'infra', '電力会社'), name: '高圧送電線の鉄塔', note: '遠くの発電所から電気を運ぶ鉄塔。景観を気にする声もあります。', w: 1, h: 3, cost: 1500, months: 8 },
  districtHeat: { ...req('gas', 'infra', 'ガス会社'), name: '地域冷暖房のプラント', note: '街の一角のビルにまとめて冷水と温水を送る設備。オフィス街の電気を減らします。', w: 2, h: 2, cost: 8000, months: 18, jobs: 20 },
  kyodoko: { ...city('gov', 'infra'), name: '共同溝（地下の電線・水道のトンネル）', note: '電線・ガス・水道をまとめて道路の下に通すトンネルの入口。工事で道路を掘り返さずに済みます。v87：周り 240m の生活道路の電柱と電線がなくなり（無電柱化 15 区間ぶん）、景観と災害への強さが上がります。', w: 1, h: 1, cost: 6000, months: 24, upkeep: 20, lvMax: 0 },
  gasHolder: { ...req('gas', 'infra', 'ガス会社'), name: '球形のガスタンク', note: '都市ガスをためる大きな球形のタンク。', w: 2, h: 2, cost: 5000, months: 18, jobs: 5 },
  waterTower: { ...city('water', 'infra'), name: '給水塔', note: '高い所から水を送る塔。高台の水圧を保ちます。', w: 1, h: 1, cost: 1500, months: 8, upkeep: 10, lvMax: 0 },
  oilStockpile: { ...req('power', 'infra', '国（石油備蓄）'), name: '石油備蓄基地', note: '国の石油を蓄える巨大なタンク群。交付金が入ります。', w: 5, h: 4, cost: 30000, months: 36, jobs: 60, income: 120, pollution: 0.3 },
  irrigation: { ...city('agri', 'agri'), name: '農業用水路と取水堰', note: '川から田畑へ水を引く用水路。田んぼと畑の作柄が安定します。', w: 3, h: 1, cost: 2500, months: 10, upkeep: 15, lvMax: 0 },
  sabo: { ...city('basin', 'safety'), name: '砂防ダム', note: '山からの土石流を食い止めるダム。土砂災害が減ります。', w: 2, h: 2, cost: 6000, months: 18, upkeep: 10, lvMax: 0 },
  yusuichi: { ...city('basin', 'safety'), name: '遊水地', note: '大雨のとき川の水を一時ためる低い原っぱ。ふだんは運動場や田んぼ。浸水が減ります。', w: 4, h: 4, cost: 15000, months: 30, upkeep: 30, lvMax: 0 },
  gaikaku: { ...city('basin', 'safety'), name: '地下放水路（地下神殿）', note: 'あふれそうな川の水を地下のトンネルで大きな川へ流す施設。浸水が大きく減り、見学ツアーで人が来ます。', w: 2, h: 2, cost: 80000, months: 60, upkeep: 200, lvMax: 0, visitors: 600, fame: 3, unique: true },
  haisuiki: { ...city('basin', 'safety'), name: '排水機場', note: '低い土地にたまった雨水をポンプで川へ出す施設。浸水が減ります。', w: 2, h: 1, cost: 8000, months: 18, upkeep: 40, lvMax: 0 },
  cableLanding: { ...req('telecom', 'infra', '通信会社'), name: '海底ケーブルの陸揚げ局', note: '海外とつながる海底ケーブルが上陸する局。データセンターが来やすくなります。水辺から 90m 以内。', w: 2, h: 1, cost: 5000, months: 18, jobs: 10, req: 'water' },
  satStation: { ...req('telecom', 'infra', '通信会社・宇宙機関'), name: '衛星の地上局', note: '人工衛星と通信するパラボラアンテナ。宇宙の会社が来やすくなります。', w: 3, h: 2, cost: 6000, months: 18, jobs: 20 },
  radioTelescope: { ...req('culture', 'edu', '国立天文台'), name: '電波望遠鏡', note: '宇宙からの電波をとらえる巨大なパラボラ。研究者と見学の人が来ます。', w: 3, h: 3, cost: 20000, months: 36, jobs: 30, visitors: 300, fame: 2 },
  // ---- v49 交通の施設 ----
  serviceArea: { ...req('transport', 'transport', '高速道路会社'), name: '高速道路のサービスエリア', note: '高速道路の休憩所。フードコートとお土産で人が集まり、ご当地グルメが知名度を上げます。', w: 4, h: 3, cost: 8000, months: 20, jobs: 150, visitors: 1500, fame: 2 },
  parkingArea: { ...req('transport', 'transport', '高速道路会社'), name: '高速道路のパーキングエリア', note: 'トイレと自販機の小さな休憩所。', w: 3, h: 2, cost: 2000, months: 10, jobs: 10, visitors: 200 },
  tollGate: { ...req('transport', 'transport', '高速道路会社'), name: '高速道路の料金所（ETC）', note: '高速道路の料金所。', w: 3, h: 1, cost: 3000, months: 12, jobs: 10 },
  jct: { ...req('transport', 'transport', '高速道路会社・国'), name: 'ジャンクション（高速道路の分岐）', note: '高速道路どうしをつなぐ立体の分岐。物流が便利になり、工場と物流センターが来やすくなります。', w: 4, h: 4, cost: 40000, months: 36, fame: 1 },
  ventTower: { ...req('transport', 'transport', '高速道路会社'), name: 'トンネルの換気塔', note: '地下の高速道路や長いトンネルの空気を入れかえる塔。', w: 1, h: 1, cost: 2000, months: 12 },
  parkRide: { ...city('transport', 'transport'), name: 'パーク＆ライドの駐車場', note: '駅の近くに車を置いて電車に乗りかえる立体駐車場。都心の渋滞が少し減ります。', w: 3, h: 2, cost: 4000, months: 10, upkeep: 20, lvMax: 0 },
  truckStation: { ...inv('物流団体'), cat: 'transport', name: 'トラックステーション', note: '長距離トラックの休憩所。運転手の休息と物流の安全を支えます。', w: 3, h: 2, cost: 2000, months: 8, jobs: 20, bizTax: 15 },
  coinParking: { ...inv('民間'), cat: 'transport', name: 'コインパーキング', note: '空き地の時間貸し駐車場。', w: 1, h: 1, cost: 200, months: 1, bizTax: 3 },
  bikeParking: { ...city('transport', 'transport'), name: '駐輪場（屋根付き）', note: '駅前の屋根付き駐輪場。放置自転車が減ります。', w: 1, h: 1, cost: 600, months: 3, upkeep: 5, lvMax: 0 },
  shinkansen: { ...req('transport', 'transport', '国・JR'), name: '新幹線の駅', note: '新幹線の駅と高架のホーム。東京や大阪まで日帰りでき、知名度と企業の進出が大きく伸びます（1 か所）。', w: 6, h: 2, cost: 120000, months: 60, jobs: 200, visitors: 5000, fame: 8, unique: true },
  freightTerminal: { ...req('transport', 'transport', 'JR 貨物'), name: '貨物ターミナル（鉄道貨物）', note: 'コンテナを貨物列車に積みかえる駅。トラックが減り、物流の会社が来やすくなります。', w: 6, h: 3, cost: 20000, months: 30, jobs: 150 },
  busDepot: { ...req('transport', 'transport', 'バス会社'), name: '路線バスの営業所', note: '路線バスの車庫と運転士の詰所。バスの本数を増やせます。', w: 3, h: 2, cost: 3000, months: 10, jobs: 120 },
  cableCar: { ...inv('観光鉄道'), cat: 'transport', name: 'ケーブルカー', note: '急な山を登るケーブルカー。山頂の展望に観光客が来ます。', w: 2, h: 4, cost: 8000, months: 24, jobs: 30, bizTax: 25, visitors: 1200, fame: 2 },
  chairlift: { ...inv('観光会社'), cat: 'transport', name: '観光リフト', note: '山の斜面を登るリフト。スキー場や花の山に。', w: 1, h: 4, cost: 2500, months: 10, jobs: 10, bizTax: 8, visitors: 400 },
  torokko: { ...inv('観光鉄道'), cat: 'transport', name: 'トロッコ列車', note: '渓谷を走る窓のないトロッコ列車。紅葉の季節に人が集まります。', w: 3, h: 1, cost: 3000, months: 12, jobs: 20, bizTax: 15, visitors: 800, fame: 2 },
  ferryTerminal: { ...req('transport', 'transport', 'フェリー会社'), name: 'フェリーターミナル', note: '島や遠くの港と結ぶフェリーののりば。トラックと観光客が乗ります。水辺から 90m 以内。', w: 4, h: 3, cost: 15000, months: 24, jobs: 120, visitors: 1500, fame: 2, req: 'water' },
  marina: { ...inv('マリーナ会社'), cat: 'transport', name: 'マリーナ（ヨットハーバー）', note: 'ヨットとボートの港。お金持ちと観光客が来ます。水辺から 90m 以内。', w: 3, h: 3, cost: 6000, months: 18, jobs: 30, bizTax: 30, visitors: 600, fame: 1, req: 'water' },
  funadamari: { ...req('transport', 'transport', '漁協'), name: '漁船の船だまり', note: '小さな漁船をつなぐ港。水辺から 90m 以内。', w: 2, h: 2, cost: 1500, months: 8, jobs: 10, req: 'water' },
  lock: { ...city('transport', 'transport'), name: '運河の閘門', note: '水位の違う川や運河の間で船を上げ下げする門。水上交通を広げ、見物の人が来ます。水辺から 90m 以内。', w: 3, h: 1, cost: 8000, months: 24, upkeep: 30, lvMax: 0, visitors: 200, req: 'water' },
  suimon: { ...city('basin', 'safety'), name: '水門', note: '高潮や洪水のときに川を閉める門。浸水を防ぎます。水辺から 90m 以内。', w: 2, h: 1, cost: 6000, months: 20, upkeep: 20, lvMax: 0, req: 'water' },
  hangar: { ...inv('航空会社'), cat: 'transport', name: '空港の格納庫（整備場）', note: '飛行機を整備する大きな格納庫。空港があると来ます。', w: 3, h: 2, cost: 8000, months: 18, jobs: 200, bizTax: 60 },
  controlTower: { ...req('transport', 'transport', '国（航空局）'), name: '空港の管制塔', note: '空港の飛行機を誘導する塔。空港の便数が少し増やせます。', w: 1, h: 1, cost: 4000, months: 18, jobs: 40 },
  heliTour: { ...inv('ヘリ会社'), cat: 'transport', name: 'ヘリコプター遊覧', note: '街と山をヘリで空から見る遊覧。知名度が上がります。', w: 2, h: 1, cost: 1500, months: 6, jobs: 8, bizTax: 10, visitors: 300, fame: 1 },
  deliveryRobot: { ...inv('物流ベンチャー'), cat: 'transport', name: '自動配送ロボの拠点', note: '歩道を走る配送ロボの拠点。買い物の不便な高齢者を助けます（新しい技術）。', w: 1, h: 1, cost: 800, months: 4, jobs: 4, bizTax: 6, unlock: 2 },
  airshipMast: { ...inv('飛行船の会社'), cat: 'transport', name: '飛行船の係留塔', note: '空の遊覧と広告の飛行船。とても目立ち、知名度が上がります（新しい技術）。', w: 3, h: 2, cost: 6000, months: 18, jobs: 20, bizTax: 15, visitors: 600, fame: 3, unlock: 4 },
  // ---- v49 行政・治安・防衛・市の現場 ----
  kencho: { ...req('gov', 'gov', '県'), name: '県庁', note: '県の本庁舎。県庁所在地になると知名度と雇用が大きく上がり、国の出先機関も集まります（1 か所）。', w: 4, h: 3, cost: 60000, months: 48, jobs: 3000, fame: 5, income: 0, unique: true },
  zeimusho: { ...req('gov', 'gov', '国（国税庁）'), name: '税務署', note: '国税の窓口。確定申告の季節はにぎわいます。', w: 2, h: 1, cost: 3000, months: 16, jobs: 60 },
  hellowork: { ...req('gov', 'gov', '国（厚生労働省）'), name: 'ハローワーク（公共職業安定所）', note: '仕事さがしの窓口。失業した人が早く仕事に戻れます。', w: 2, h: 1, cost: 3000, months: 16, jobs: 50 },
  nenkin: { ...req('gov', 'gov', '国（日本年金機構）'), name: '年金事務所', note: '年金の相談窓口。', w: 1, h: 1, cost: 1500, months: 12, jobs: 30 },
  menkyo: { ...req('gov', 'gov', '県警'), name: '運転免許センター', note: '免許の更新と試験の会場。県内から人が来ます。', w: 4, h: 3, cost: 8000, months: 24, jobs: 120, visitors: 200 },
  nyukan: { ...req('gov', 'gov', '国（出入国在留管理庁）'), name: '出入国在留管理局', note: '外国人の在留の手続きをする国の機関。外国人住民の手続きが近くでできます。', w: 2, h: 2, cost: 5000, months: 20, jobs: 120 },
  kensatsu: { ...req('gov', 'gov', '国（法務省）'), name: '検察庁', note: '事件を起訴する国の機関。裁判所の近くに置かれます。', w: 2, h: 1, cost: 4000, months: 18, jobs: 80 },
  kasai: { ...req('gov', 'gov', '国（裁判所）'), name: '家庭裁判所', note: '離婚・相続・少年事件を扱う裁判所。', w: 2, h: 1, cost: 4000, months: 18, jobs: 60 },
  kochisho: { ...req('safety', 'safety', '国（法務省）'), name: '拘置所', note: '裁判を待つ人を収容する国の施設。近くの住民は不安に思います（1 か所）。', w: 3, h: 3, cost: 12000, months: 30, jobs: 200, income: 60, unique: true },
  shonenin: { ...req('safety', 'safety', '国（法務省）'), name: '少年院', note: '非行のあった少年が学び直す国の施設。', w: 3, h: 3, cost: 8000, months: 24, jobs: 100, income: 30, unique: true },
  policeAcademy: { ...req('safety', 'safety', '県警'), name: '警察学校', note: '警察官を育てる県の学校。治安が少し上がります。', w: 4, h: 3, cost: 10000, months: 30, jobs: 200 },
  kidotai: { ...req('safety', 'safety', '県警'), name: '機動隊の基地', note: '大きな行事・災害・デモに出動する県警の部隊。治安と災害への強さが上がります。', w: 3, h: 2, cost: 6000, months: 20, jobs: 300 },
  coastGuard: { ...req('safety', 'safety', '国（海上保安庁）'), name: '海上保安部（巡視船の基地）', note: '海の警察と救助を担う国の基地。海の事故と密輸に備えます。水辺から 90m 以内。', w: 3, h: 2, cost: 8000, months: 24, jobs: 200, req: 'water' },
  kenekijo: { ...req('gov', 'gov', '国（厚生労働省）'), name: '検疫所', note: '港と空港で感染症の侵入を防ぐ国の機関。港か空港があると役に立ちます。', w: 2, h: 1, cost: 2500, months: 12, jobs: 40 },
  navyBase: { ...req('safety', 'safety', '国（防衛省）'), name: '海上自衛隊の基地', note: '護衛艦が停泊する港の基地。隊員と家族が住み、交付金が入ります。反対運動や国際情勢の影響も（1 か所）。水辺から 90m 以内。', w: 5, h: 4, cost: 40000, months: 48, jobs: 1500, income: 250, fame: 2, unique: true, req: 'water' },
  airBase: { ...req('safety', 'safety', '国（防衛省）'), name: '航空自衛隊の基地', note: '戦闘機の滑走路と格納庫。騒音が大きく、交付金も大きい（1 か所）。', w: 6, h: 4, cost: 50000, months: 48, jobs: 1800, income: 300, fame: 2, unique: true, pollution: 0.6 },
  radarSite: { ...req('safety', 'safety', '国（防衛省）'), name: 'レーダーサイト', note: '空を見張る白い球形のレーダー。山の上に置かれます。', w: 2, h: 2, cost: 6000, months: 24, jobs: 60, income: 40 },
  ammoDepot: { ...req('safety', 'safety', '国（防衛省）'), name: '弾薬庫', note: '土盛りの弾薬庫が並ぶ自衛隊の施設。住民の不安が強い（1 か所）。', w: 4, h: 3, cost: 8000, months: 24, jobs: 40, income: 80, unique: true },
  gikai: { ...city('gov', 'gov'), name: '市議会の議事堂', note: '市議会が開かれる建物。傍聴に来る人も。', w: 2, h: 2, cost: 15000, months: 24, upkeep: 80, lvMax: 0, unique: true },
  seisoJimusho: { ...city('waste', 'infra'), name: '清掃事務所（ごみ収集車の車庫）', note: 'ごみ収集車の車庫と事務所。ごみ収集の拠点が増え、ごみの満足が上がります。', w: 2, h: 2, cost: 3000, months: 10, upkeep: 60, lvMax: 0, jobs: 30 },
  doroJimusho: { ...city('gov', 'infra'), name: '道路維持事務所', note: '道路の補修と除雪の車両の基地。道路が傷みにくくなります。', w: 2, h: 2, cost: 3000, months: 10, upkeep: 60, lvMax: 0, jobs: 30 },
  yukisute: { ...city('gov', 'infra'), name: '雪捨て場・融雪施設', note: '除雪した雪を集める場所。雪の多い街の冬の渋滞と事故を減らします。', w: 3, h: 2, cost: 1500, months: 6, upkeep: 30, lvMax: 0 },
  suibo: { ...city('gov', 'safety'), name: '水防倉庫', note: '土のうと排水ポンプをしまう倉庫。大雨のときの備えです。', w: 1, h: 1, cost: 500, months: 3, upkeep: 5, lvMax: 0 },
  // ---- v49 医療・福祉・葬送 ----
  dental: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: '歯科医院', note: 'むし歯と入れ歯の治療。高齢者の満足が少し上がります。', w: 1, h: 1, cost: 1000, months: 6, capacity: 2500, capUnit: '人（利用圏の人口）', reach: 25, jobs: 6 },
  specialClinic: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: '専門クリニック（眼科・皮膚科・耳鼻科）', note: '専門の診療所が入ったビル。医療の満足が上がります。', w: 1, h: 1, cost: 1800, months: 8, capacity: 4000, capUnit: '人（利用圏の人口）', reach: 30, jobs: 15 },
  psychHospital: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: '精神科病院（こころの病院）', note: 'こころの病気の入院と外来。緑の多い敷地。医療の満足が上がり、相談の窓口にもなります。', w: 3, h: 3, cost: 12000, months: 24, capacity: 30000, capUnit: '人（利用圏の人口）', reach: 150, jobs: 150 },
  rehabHospital: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: 'リハビリ病院（回復期）', note: '脳卒中や骨折のあと、歩けるようになるまで入院する病院。高齢者の満足が上がります。', w: 3, h: 2, cost: 9000, months: 20, capacity: 20000, capUnit: '人（利用圏の人口）', reach: 120, jobs: 120 },
  ryoyo: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: '療養病院', note: '長く入院する高齢者の病院。介護の負担を減らします。', w: 2, h: 2, cost: 6000, months: 18, capacity: 15000, capUnit: '人（利用圏の人口）', reach: 120, jobs: 80 },
  hospice: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: 'ホスピス（緩和ケア病棟）', note: '最期の時を穏やかに過ごす緩和ケアの施設。花の庭がある静かな場所。', w: 2, h: 2, cost: 4000, months: 14, capacity: 8000, capUnit: '人（利用圏の人口）', reach: 150, jobs: 40 },
  dialysis: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: '透析クリニック', note: '週 3 回の人工透析に通うクリニック。近くにあると通院の負担が減ります。', w: 1, h: 1, cost: 1500, months: 8, capacity: 4000, capUnit: '人（利用圏の人口）', reach: 40, jobs: 15 },
  hokenjo: { ...req('health', 'health', '県'), name: '保健所', note: '感染症・食品衛生・こころの相談を担う県の機関。感染症の流行を早く抑えます。', w: 2, h: 1, cost: 4000, months: 16, capacity: 30000, capUnit: '人（利用圏の人口）', reach: 200, jobs: 40 },
  bloodRoom: { ...req('health', 'health', '日本赤十字社'), name: '献血ルーム', note: '駅前の献血ルーム。病院の輸血を支えます。', w: 1, h: 1, cost: 600, months: 4, jobs: 8 },
  pharmacy: { ...base, fam: 'health', cat: 'health', build: 'invite', authority: 'attract', owner: '医療法人（民間）', name: '調剤薬局', note: '病院の処方せんの薬を出す薬局。病院や診療所の近くに。', w: 1, h: 1, cost: 500, months: 4, capacity: 2000, capUnit: '人（利用圏の人口）', reach: 20, jobs: 5 },
  dayService: { ...req('welfare', 'health', '社会福祉法人'), name: 'デイサービス', note: '高齢者が日中を過ごし、お風呂と体操をする施設。送迎の車が走ります。', w: 1, h: 1, cost: 800, months: 6, capacity: 30, capUnit: '人', jobs: 12 },
  shuro: { ...req('welfare', 'health', '社会福祉法人'), name: '就労支援の工房（パン・雑貨）', note: '障害のある人が働くパン工房とお店。福祉の満足が上がります。', w: 1, h: 1, cost: 600, months: 5, capacity: 20, capUnit: '人', jobs: 8 },
  yogo: { ...req('welfare', 'health', '社会福祉法人'), name: '児童養護施設', note: '家庭で暮らせない子どもの家。家庭的な小さな家で暮らします。', w: 2, h: 1, cost: 2500, months: 12, capacity: 40, capUnit: '人', jobs: 30 },
  boshi: { ...req('welfare', 'health', '社会福祉法人'), name: '母子生活支援施設', note: 'ひとり親の母と子が暮らしながら自立をめざす施設。', w: 1, h: 1, cost: 1500, months: 10, capacity: 20, capUnit: '世帯', jobs: 10 },
  jisou: { ...req('welfare', 'health', '県'), name: '児童相談所（一時保護所）', note: '子どもの虐待の相談と一時保護を担う県の機関。子育ての安心が上がります。', w: 2, h: 1, cost: 4000, months: 16, capacity: 30000, capUnit: '人（利用圏の人口）', reach: 250, jobs: 50 },
  houkatsu: { ...req('welfare', 'health', '市の委託法人'), name: '地域包括支援センター', note: '高齢者の介護と暮らしの相談窓口。高齢者の満足が上がります。', w: 1, h: 1, cost: 600, months: 4, capacity: 5000, capUnit: '人（利用圏の人口）', reach: 30, jobs: 6 },
  nokotsudo: { ...req('funeral', 'funeral', '寺院・民間'), name: '納骨堂', note: '建物の中にお骨を納める都市型のお墓。墓地が足りない街の助けになります。', w: 1, h: 1, cost: 1500, months: 10, jobs: 4 },
  petCemetery: { ...req('funeral', 'funeral', '民間'), name: 'ペット霊園', note: '家族だったペットのお墓と火葬の施設。', w: 2, h: 1, cost: 500, months: 4, jobs: 3 },
  // ---- v49 教育・研究・学び ----
  privSchool: { ...req('high', 'edu', '学校法人'), cat: 'edu', name: '私立中高一貫校', note: '中学から高校まで 6 年間の私立校。進学実績が子育て世帯を呼びます。', w: 3, h: 2, cost: 9000, months: 30, capacity: 900, capUnit: '人', jobs: 90, reach: 160, use: 40 },
  intlSchool: { ...req('high', 'edu', '学校法人'), cat: 'edu', name: 'インターナショナルスクール', note: '英語で学ぶ学校。外国人の家族や外資系企業が来やすくなります。', w: 2, h: 2, cost: 5000, months: 20, capacity: 300, capUnit: '人', jobs: 50, reach: 220, use: 30, fame: 1 },
  foreignSchool: { ...req('high', 'edu', '学校法人'), cat: 'edu', name: '外国人学校', note: '母語と母国の課程で学ぶ学校（学校法人・各種学校）。母語での学びを続けられ、通訳や日本語の学校との行き来の支えにもなります（言語の支援が少し上がる）。', w: 2, h: 2, cost: 2500, months: 18, capacity: 250, capUnit: '人', jobs: 30, reach: 220, use: 20 },
  specialSchool: { ...req('school', 'edu', '県'), cat: 'edu', name: '特別支援学校', note: '障害のある子が学ぶ県立の学校。スロープと平らな庭。子育ての安心が上がります。', w: 3, h: 2, cost: 7000, months: 24, capacity: 200, capUnit: '人', jobs: 90, reach: 300, use: 30 },
  teijisei: { ...req('high', 'edu', '県'), cat: 'edu', name: '定時制・通信制高校', note: '働きながら、学び直しながら通える高校。夜の授業もあります。', w: 2, h: 2, cost: 3000, months: 20, capacity: 400, capUnit: '人', jobs: 30, reach: 200, use: 20 },
  kosen: { ...req('high', 'edu', '国（高専機構）'), cat: 'edu', name: '高等専門学校（高専）', note: '5 年間でものづくりを学ぶ国立の学校。工場と研究所が来やすく、ロボコンで知名度も。', w: 4, h: 3, cost: 15000, months: 36, capacity: 1000, capUnit: '人', jobs: 120, reach: 300, use: 60, fame: 1 },
  senmon: { ...inv('学校法人'), cat: 'edu', name: '専門学校（看護・調理・美容・IT）', note: '資格をとる専門学校。若い単身者が集まり、病院や店の人手が増えます。', w: 1, h: 1, cost: 2000, months: 12, jobs: 40, bizTax: 20 },
  tandai: { ...inv('学校法人'), cat: 'edu', name: '短期大学', note: '2 年で学ぶ短大。保育士や栄養士を育て、保育の人手が少し増えます。', w: 3, h: 2, cost: 6000, months: 24, jobs: 80, bizTax: 20, visitors: 100 },
  kunren: { ...req('gov', 'edu', '県'), cat: 'edu', name: '職業訓練校', note: '溶接・電気・介護などを学ぶ県の訓練校。工場と介護の人手が増えます。', w: 2, h: 2, cost: 3000, months: 18, jobs: 30 },
  kyoshujo: { ...inv('民間'), cat: 'edu', name: '自動車教習所', note: '運転免許をとる教習所。高校生と大学生が通います。', w: 4, h: 3, cost: 3500, months: 10, jobs: 30, bizTax: 25 },
  accelerator: { ...inv('国の研究機関'), cat: 'edu', name: '大型加速器の研究機構', note: '地下に円形の加速器をもつ国の研究機構。世界から研究者が来て、知名度が大きく上がります。', w: 5, h: 5, cost: 80000, months: 60, jobs: 600, bizTax: 0, fame: 6, visitors: 500, use: 4000 },
  natLab: { ...inv('国'), cat: 'edu', name: '国の研究機関', note: '国立の研究所（環境・食品・防災など）。研究者の家族が暮らし、教育の水準が上がります。', w: 3, h: 3, cost: 20000, months: 36, jobs: 300, bizTax: 0, fame: 2, use: 600 },
  kishodai: { ...req('gov', 'safety', '国（気象庁）'), cat: 'safety', name: '気象台', note: '天気を観測して警報を出す国の施設。災害への備えが少しよくなります。', w: 2, h: 2, cost: 2500, months: 18, jobs: 20 },
  quakeObs: { ...req('gov', 'safety', '国・大学'), cat: 'safety', name: '地震観測所', note: '地震と火山を観測する施設。緊急地震速報の精度が上がります。', w: 1, h: 1, cost: 800, months: 8, jobs: 4 },
  histMuseum: { ...req('culture', 'edu', '県'), cat: 'edu', name: '博物館（歴史・民俗）', note: '地域の歴史と暮らしの道具を展示する博物館。文化の満足と来訪者が上がります。', w: 3, h: 3, cost: 20000, months: 30, capacity: 30000, capUnit: '人（利用圏の人口）', reach: 200, jobs: 40, visitors: 800, fame: 2 },
  scienceMuseum: { ...req('culture', 'edu', '県'), cat: 'edu', name: '科学館', note: '体験しながら科学を学ぶ館。ドームのプラネタリウムとロケットが目印。子どもの満足が上がります。', w: 3, h: 3, cost: 18000, months: 30, capacity: 30000, capUnit: '人（利用圏の人口）', reach: 200, jobs: 40, visitors: 1000, fame: 2 },
  bungakukan: { ...req('culture', 'edu', '財団'), cat: 'edu', name: '文学館', note: 'ゆかりの作家の原稿や書斎を展示する館。文化の満足と知名度が少し上がります。', w: 2, h: 2, cost: 4000, months: 18, capacity: 10000, capUnit: '人（利用圏の人口）', reach: 120, jobs: 10, visitors: 300, fame: 1 },
  kominkan: { ...req('culture', 'edu', '自治会・市'), cat: 'edu', name: '公民館', note: '地域の集まりと講座の場。お年寄りの居場所になり、つながりが強まります。', w: 2, h: 1, cost: 1500, months: 10, capacity: 6000, capUnit: '人（利用圏の人口）', reach: 40, jobs: 3 },
  lifelong: { ...req('culture', 'edu', '市・財団'), cat: 'edu', name: '生涯学習センター', note: '講座・サークル・図書の大きな学びの拠点。高齢者の満足が上がります。', w: 2, h: 2, cost: 6000, months: 20, capacity: 20000, capUnit: '人（利用圏の人口）', reach: 120, jobs: 15 },
  seishonen: { ...req('leisure', 'edu', '県'), cat: 'edu', name: '青少年の家・少年自然の家', note: '子どもが泊まって自然体験をする施設。林間学校で人が来ます。', w: 3, h: 3, cost: 5000, months: 20, jobs: 20, visitors: 300 },
  planetarium: { ...inv('民間・財団'), cat: 'edu', name: 'プラネタリウム', note: '満天の星を映すドーム。デートと子どもの学びに。', w: 2, h: 2, cost: 3000, months: 14, jobs: 15, bizTax: 10, visitors: 400, fame: 1 },
  // ---- v49 住まい（誘致すると世帯が入居する住宅） ----
  danchi: { ...inv('UR・県'), fam: 'res', cat: 'housing', name: '団地（UR・公営住宅）', note: '昭和に建った中層の団地。家賃が安く、子育て世帯と高齢者が暮らします。古くなると建て替えや空き部屋が課題に。', w: 3, h: 2, cost: 6000, months: 18, units: 150 },
  newTown: { ...inv('デベロッパー'), fam: 'res', cat: 'housing', name: 'ニュータウン（計画住宅地）', note: '丘を造成した計画的な住宅地。戸建てが整然と並び、中央に公園があります。一斉に年をとるのが悩み。', w: 4, h: 4, cost: 15000, months: 30, units: 140 },
  shataku: { ...inv('企業'), fam: 'res', cat: 'housing', name: '社宅・独身寮', note: '企業の社員が住む寮。工場や本社があると来ます。', w: 1, h: 1, cost: 1500, months: 8, units: 30 },
  studentDorm: { ...inv('大学・民間'), fam: 'res', cat: 'housing', name: '学生寮', note: '大学生が住む寮。大学があると来ます。', w: 1, h: 1, cost: 1500, months: 8, units: 40 },
  shareHouse: { ...inv('民間'), fam: 'res', cat: 'housing', name: 'シェアハウス', note: '台所と居間を共有する家。若い単身者が集まります。', w: 1, h: 1, cost: 300, months: 3, units: 8 },
  sakouju: { ...inv('介護事業者'), fam: 'res', cat: 'housing', name: 'サービス付き高齢者向け住宅', note: '見守りと生活相談のついた高齢者の住まい。高齢者の暮らしやすさが上がります。', w: 2, h: 1, cost: 2500, months: 10, units: 40 },
  yuryoRojin: { ...inv('介護事業者'), fam: 'res', cat: 'housing', name: '有料老人ホーム', note: '食事と介護つきの民間の老人ホーム。介護の働き口もできます。', w: 2, h: 1, cost: 3000, months: 12, units: 50 },
  groupHome: { ...inv('福祉法人'), fam: 'res', cat: 'housing', name: 'グループホーム', note: '認知症の高齢者や障害のある人が少人数で暮らす家。', w: 1, h: 1, cost: 600, months: 5, units: 9 },
  nagaya: { ...inv('大家'), fam: 'res', cat: 'housing', name: '長屋・文化住宅', note: '昔ながらの連なった借家。家賃が安く、下町の風情があります。', w: 1, h: 1, cost: 300, months: 3, units: 6 },
  kominka: { ...inv('移住者'), fam: 'res', cat: 'housing', name: '古民家（茅葺き）', note: '茅葺き屋根の古民家。移住者が住み、古民家カフェや宿として人も来ます。', w: 1, h: 1, cost: 400, months: 4, units: 1, visitors: 60 },
  besso: { ...inv('デベロッパー'), fam: 'res', cat: 'housing', name: '別荘地', note: '林の中の別荘。夏や週末に都会の人が来ます。ふだんは静かです。', w: 2, h: 2, cost: 2000, months: 10, units: 8, visitors: 200 },
  nisetai: { ...inv('民間'), fam: 'res', cat: 'housing', name: '二世帯住宅', note: '親と子の世帯が一緒に住む家。子育てを祖父母が手伝えます。', w: 1, h: 1, cost: 300, months: 3, units: 2 },
  hiraya: { ...inv('民間'), fam: 'res', cat: 'housing', name: '平屋', note: '階段のない平屋。高齢者にも若い世帯にも人気です。', w: 1, h: 1, cost: 250, months: 2, units: 1 },
  garageHouse: { ...inv('民間'), fam: 'res', cat: 'housing', name: 'ガレージハウス', note: '車とバイクを置ける家。趣味の人に人気。', w: 1, h: 1, cost: 300, months: 3, units: 1 },
  gatedTown: { ...inv('デベロッパー'), fam: 'res', cat: 'housing', name: 'ゲーテッドタウン', note: '門と塀に囲まれ、警備員のいる高級住宅地。治安が高い一方、地域から閉じているという声も。', w: 3, h: 3, cost: 9000, months: 20, units: 9 },
  tinyVillage: { ...inv('民間'), fam: 'res', cat: 'housing', name: 'タイニーハウス村', note: '小さな家が集まる村。ミニマルな暮らしと週末の滞在に。', w: 2, h: 1, cost: 600, months: 4, units: 7 },
  kasetsu: { ...inv('県'), fam: 'res', cat: 'housing', name: '仮設住宅', note: '災害で家を失った人のための仮の住まい。県が建てます。', w: 3, h: 2, cost: 3000, months: 3, units: 20 },
  jiritsu: { ...inv('福祉法人'), fam: 'res', cat: 'housing', name: '自立支援センター（住まいの支援）', note: '家を失った人に住まいと就労の支えを用意する施設。安心が少し上がります。', w: 1, h: 1, cost: 800, months: 6, units: 20 },
  // ---- v49 商業・サービス ----
  electronics: { ...inv('民間'), cat: 'commerce', name: '家電量販店', note: 'テレビ・パソコン・スマホがそろう大型店。週末は家族連れでにぎわいます。', w: 3, h: 3, cost: 4000, months: 10, jobs: 120, bizTax: 90, visitors: 300 },
  homeCenter: { ...inv('民間'), cat: 'commerce', name: 'ホームセンター', note: '木材・工具・園芸用品の大型店。家の修理や災害の備えの買い出しに。', w: 3, h: 3, cost: 3500, months: 10, jobs: 100, bizTax: 70 },
  furnitureStore: { ...inv('民間'), cat: 'commerce', name: '家具の大型店', note: '組み立て家具の大きな倉庫型の店。遠くからも車で来ます。', w: 3, h: 3, cost: 5000, months: 12, jobs: 150, bizTax: 90, visitors: 500 },
  bookstore: { ...inv('民間'), cat: 'commerce', name: '書店', note: '本と文具の店。文化の水準が少し上がります。町の書店は減りつつあります。', w: 2, h: 2, cost: 1200, months: 6, jobs: 25, bizTax: 15 },
  reuseShop: { ...inv('民間'), cat: 'commerce', name: '古本・リサイクルの店', note: '古本・古着・中古家電を買い取って売る店。ごみが少し減ります。', w: 2, h: 2, cost: 1000, months: 5, jobs: 20, bizTax: 12 },
  dollarShop: { ...inv('民間'), cat: 'commerce', name: '100 円ショップ', note: '何でも 100 円の店。物価が高いときに暮らしを助けます。', w: 2, h: 2, cost: 900, months: 5, jobs: 20, bizTax: 14 },
  discount: { ...inv('民間'), cat: 'commerce', name: 'ディスカウントストア', note: '深夜まで開いている、何でも安い店。夜の街の明かりになります。', w: 2, h: 2, cost: 1500, months: 6, jobs: 50, bizTax: 30, visitors: 200 },
  warehouseClub: { ...inv('民間'), cat: 'commerce', name: '会員制倉庫店', note: '大容量の商品を倉庫で売る会員制の店。遠くからも車で来て、周りの道が混みます。', w: 4, h: 3, cost: 8000, months: 14, jobs: 250, bizTax: 150, visitors: 1200 },
  carGoods: { ...inv('民間'), cat: 'commerce', name: 'カー用品店', note: 'タイヤ交換・オイル交換もできるカー用品の店。', w: 2, h: 2, cost: 1200, months: 6, jobs: 25, bizTax: 18 },
  dealer: { ...inv('民間'), cat: 'commerce', name: '自動車ディーラー', note: '新車のショールームと整備工場。自動車メーカーの工場があると売れ行きが上がります。', w: 2, h: 2, cost: 1800, months: 8, jobs: 30, bizTax: 30 },
  usedCar: { ...inv('民間'), cat: 'commerce', name: '中古車店', note: '中古車がずらりと並ぶ店。のぼりが目印です。', w: 2, h: 2, cost: 800, months: 4, jobs: 10, bizTax: 12 },
  rentACar: { ...inv('民間'), cat: 'commerce', name: 'レンタカー', note: '観光客や出張の人が車を借りる店。駅や空港の近くがよく、来訪者が少し増えます。', w: 2, h: 1, cost: 600, months: 4, jobs: 10, bizTax: 10, visitors: 100 },
  laundromat: { ...inv('民間'), cat: 'commerce', name: 'コインランドリー', note: '大きな洗濯乾燥機がある店。梅雨は混みます。', w: 1, h: 1, cost: 300, months: 3, jobs: 1, bizTax: 4 },
  carWash: { ...inv('民間'), cat: 'commerce', name: '洗車場', note: '門型の洗車機と手洗いの洗車場。', w: 2, h: 1, cost: 500, months: 3, jobs: 4, bizTax: 6 },
  autoRepair: { ...inv('民間'), cat: 'commerce', name: '自動車整備工場', note: '車の修理と車検をする町の整備工場。', w: 2, h: 1, cost: 700, months: 4, jobs: 15, bizTax: 10 },
  carInspect: { ...inv('国（運輸支局）'), cat: 'commerce', name: '運輸支局（車検場）', note: '国の車検場とナンバーの交付所。地名のついたご当地ナンバーができると知名度が上がります。', w: 3, h: 2, cost: 4000, months: 14, jobs: 60, bizTax: 0, fame: 1 },
  famiRes: { ...inv('民間'), cat: 'commerce', name: 'ファミリーレストラン', note: '駐車場のある家族向けのレストラン。夜遅くまで明かりがつきます。', w: 2, h: 2, cost: 1000, months: 5, jobs: 40, bizTax: 15 },
  chainFood: { ...inv('民間'), cat: 'commerce', name: '牛丼・ラーメン・寿司のチェーン店', note: '早くて安い外食のチェーン店。学生と働く人の味方です。', w: 1, h: 1, cost: 500, months: 3, jobs: 15, bizTax: 8 },
  fastFood: { ...inv('民間'), cat: 'commerce', name: 'ファストフード（ドライブスルー）', note: '車のまま注文できるハンバーガー店。', w: 2, h: 1, cost: 800, months: 4, jobs: 30, bizTax: 12 },
  izakaya: { ...inv('民間'), cat: 'commerce', name: '居酒屋', note: '駅前の居酒屋。提灯の明かりが夜の街をつくります。', w: 1, h: 1, cost: 400, months: 3, jobs: 12, bizTax: 6 },
  yataiMura: { ...inv('民間'), cat: 'commerce', name: '屋台村', note: '小さな屋台がずらりと並ぶ夜の飲食街。観光客が集まります。', w: 2, h: 1, cost: 600, months: 4, jobs: 20, bizTax: 10, visitors: 400, fame: 1 },
  jogaiMarket: { ...inv('民間'), cat: 'commerce', name: '場外市場（食べ歩きの市場）', note: '魚・干物・漬物の店が並ぶ市場の通り。朝から観光客が食べ歩きます。漁港か卸売市場があると品ぞろえが増えます。', w: 3, h: 2, cost: 2500, months: 8, jobs: 80, bizTax: 40, visitors: 1500, fame: 2 },
  kojinten: { ...inv('民間'), cat: 'commerce', name: '商店街の個人店（八百屋・魚屋・肉屋・豆腐屋・和菓子屋・酒屋）', note: '昔ながらの個人の店が並ぶ通り。高齢者の買い物を支え、地域のつながりが強まります。', w: 2, h: 1, cost: 500, months: 3, jobs: 15, bizTax: 8 },
  shinkin: { ...inv('民間'), cat: 'commerce', name: '信用金庫', note: '地元の中小企業と家計を支える金融機関。町工場や商店の資金繰りを助けます。', w: 1, h: 1, cost: 800, months: 6, jobs: 25, bizTax: 20 },
  securities: { ...inv('民間'), cat: 'commerce', name: '証券会社の支店', note: '株や投資信託の窓口。景気がよいと人が集まります。', w: 1, h: 1, cost: 1000, months: 6, jobs: 25, bizTax: 30 },
  realEstate: { ...inv('民間'), cat: 'commerce', name: '不動産屋', note: '家の売買と賃貸の店。人口が増えると忙しくなります。', w: 1, h: 1, cost: 400, months: 3, jobs: 6, bizTax: 8 },
  lawOffice: { ...inv('民間'), cat: 'commerce', name: '法律・会計事務所（士業の事務所）', note: '弁護士・税理士・司法書士の事務所。相続や会社の相談に。', w: 1, h: 1, cost: 700, months: 4, jobs: 15, bizTax: 18 },
  pawnShop: { ...inv('民間'), cat: 'commerce', name: '質屋', note: '品物を預かってお金を貸す昔ながらの店。', w: 1, h: 1, cost: 300, months: 3, jobs: 2, bizTax: 4 },
  cleaning: { ...inv('民間'), cat: 'commerce', name: 'クリーニング店', note: 'ワイシャツや制服のクリーニング取次の店。', w: 1, h: 1, cost: 300, months: 2, jobs: 3, bizTax: 3 },
  photoStudio: { ...inv('民間'), cat: 'commerce', name: '写真館', note: '七五三・成人式・家族写真の写真館。', w: 1, h: 1, cost: 400, months: 3, jobs: 4, bizTax: 4 },
  petShop: { ...inv('民間'), cat: 'commerce', name: 'ペットショップとトリミングサロン', note: 'ペットと用品の店、犬のトリミング・ペットホテル。', w: 2, h: 1, cost: 800, months: 4, jobs: 15, bizTax: 12 },
  vet: { ...inv('民間'), cat: 'commerce', name: '動物病院', note: '犬や猫の病院。ペットを飼う人の安心が増えます。', w: 1, h: 1, cost: 600, months: 4, jobs: 8, bizTax: 8 },
  cramSchool: { ...inv('民間'), cat: 'commerce', name: '学習塾・予備校', note: '受験の塾。夜まで明かりがつき、教育の満足が少し上がります。', w: 1, h: 1, cost: 700, months: 4, jobs: 15, bizTax: 10 },
  lessonSchool: { ...inv('民間'), cat: 'commerce', name: '英会話・音楽教室', note: '習いごとの教室。子育ての満足が少し上がります。', w: 1, h: 1, cost: 500, months: 3, jobs: 8, bizTax: 6 },
  karaokeBox: { ...inv('民間'), cat: 'commerce', name: 'カラオケボックス', note: '部屋ごとに歌えるカラオケ店。夜遅くまでにぎわいます。', w: 1, h: 1, cost: 700, months: 4, jobs: 15, bizTax: 12 },
  bowling: { ...inv('民間'), cat: 'commerce', name: 'ボウリング場', note: '大きなピンが屋根にあるボウリング場。家族と学生が遊びに来ます。', w: 3, h: 2, cost: 2500, months: 8, jobs: 40, bizTax: 20, visitors: 300 },
  gameCenter: { ...inv('民間'), cat: 'commerce', name: 'ゲームセンター', note: 'クレーンゲームと音楽ゲームの店。', w: 1, h: 1, cost: 600, months: 3, jobs: 8, bizTax: 8 },
  mangaCafe: { ...inv('民間'), cat: 'commerce', name: '漫画喫茶・ネットカフェ', note: '漫画とネットの個室。24 時間開いています。', w: 1, h: 1, cost: 500, months: 3, jobs: 8, bizTax: 6 },
  mahjong: { ...inv('民間'), cat: 'commerce', name: '麻雀店', note: '麻雀の店。健康麻雀の教室もあります。', w: 1, h: 1, cost: 300, months: 2, jobs: 3, bizTax: 3 },
  battingCenter: { ...inv('民間'), cat: 'commerce', name: 'バッティングセンター', note: 'ネットに囲まれたバッティングの施設。高校野球が強いと人が来ます。', w: 2, h: 2, cost: 800, months: 4, jobs: 6, bizTax: 6, visitors: 150 },
  golfRange: { ...inv('民間'), cat: 'commerce', name: 'ゴルフ練習場', note: '高いネットの打ちっぱなし。夜も照明で練習できます。', w: 3, h: 4, cost: 2500, months: 8, jobs: 20, bizTax: 15, visitors: 200 },
  fishingPond: { ...inv('民間'), cat: 'commerce', name: '釣り堀', note: '池で魚を釣る遊び場。子どもと年配の人が楽しみます。', w: 2, h: 1, cost: 300, months: 2, jobs: 2, bizTax: 2, visitors: 100 },
  sauna: { ...inv('民間'), cat: 'commerce', name: 'サウナ専門店', note: 'ととのうサウナと水風呂の店。サウナ好きが遠くから来ます。', w: 1, h: 1, cost: 500, months: 4, jobs: 8, bizTax: 8, visitors: 150 },
  capsuleHotel: { ...inv('民間'), cat: 'commerce', name: 'カプセルホテル', note: '安く泊まれるカプセルの宿。終電を逃した人と観光客に。', w: 1, h: 1, cost: 800, months: 5, jobs: 10, bizTax: 10, visitors: 150 },
  minpaku: { ...inv('民間'), cat: 'commerce', name: '民泊（空き家の宿）', note: '空き家を直して旅行者に貸す宿。空き家が減り、来訪者が増えます。', w: 1, h: 1, cost: 300, months: 2, jobs: 1, bizTax: 3, visitors: 80 },
  loveHotel: { ...inv('民間'), cat: 'commerce', name: 'ラブホテル', note: '郊外や繁華街の裏のホテル。派手な外観は景観の議論になります。', w: 1, h: 1, cost: 800, months: 5, jobs: 6, bizTax: 10 },
  coworking: { ...inv('民間'), cat: 'commerce', name: 'コワーキングスペース', note: 'フリーランスやリモートワークの人の共用オフィス。IT 企業が来やすくなります。', w: 1, h: 1, cost: 600, months: 3, jobs: 4, bizTax: 6 },
  // ---- v49 製造業・工場・鉱業・処理施設 ----
  chemPlant: { ...inv('民間企業'), cat: 'industry', name: '化学コンビナート', note: '石油から樹脂や薬品の原料をつくる工場群。税と雇用はとても大きいが、空気が汚れ、事故の備えが要ります。夜は無数の灯りがきらめき「工場夜景」で人が来ます。港の近くが便利。', w: 4, h: 3, cost: 30000, months: 36, jobs: 900, bizTax: 900, pollution: 2.4, visitors: 400, fame: 1, use: 2500, req: 'arterial' },
  paperMill: { ...inv('民間企業'), cat: 'industry', name: '製紙工場', note: '木材チップから紙と段ボールをつくる工場。水を多く使い、においと煙が出ます。雇用と税は大きい。', w: 4, h: 3, cost: 18000, months: 30, jobs: 500, bizTax: 420, pollution: 1.6, use: 1800, req: 'arterial' },
  cementPlant: { ...inv('民間企業'), cat: 'industry', name: 'セメント工場', note: '石灰石を焼いてセメントをつくる工場。採石場があると原料が近い。ほこりと煙が出ます。', w: 4, h: 3, cost: 16000, months: 30, jobs: 300, bizTax: 360, pollution: 1.8, use: 1500, req: 'arterial', chain: ['quarry'] },
  glassWorks: { ...inv('民間企業'), cat: 'industry', name: 'ガラス工場', note: '窓ガラスや瓶をつくる工場。炉の火は一年中消えません。', w: 3, h: 2, cost: 8000, months: 20, jobs: 200, bizTax: 180, pollution: 0.9, use: 800, req: 'arterial' },
  tirePlant: { ...inv('民間企業'), cat: 'industry', name: 'タイヤ工場', note: '車のタイヤをつくる工場。自動車メーカーの工場があるとよく売れます。', w: 3, h: 2, cost: 10000, months: 22, jobs: 450, bizTax: 260, pollution: 0.9, use: 700, req: 'arterial', chain: ['carPlant'] },
  textileMill: { ...inv('民間企業'), cat: 'industry', name: '繊維・紡績工場（赤レンガ）', note: '明治から続く紡績工場。のこぎり屋根の赤レンガは産業遺産で、見学の人が来ます。', w: 3, h: 2, cost: 6000, months: 18, jobs: 220, bizTax: 120, pollution: 0.4, visitors: 300, fame: 1 },
  aluminumPlant: { ...inv('民間企業'), cat: 'industry', name: 'アルミ工場', note: 'アルミ地金や部材をつくる工場。電気をとても多く使います。', w: 4, h: 2, cost: 14000, months: 24, jobs: 280, bizTax: 300, pollution: 1.0, use: 3000, req: 'arterial' },
  kiln: { ...inv('民間企業'), cat: 'industry', name: '陶磁器の窯元（登り窯）', note: '斜面の登り窯で器を焼く窯元。陶器市の日はにぎわい、器は返礼品になります。煙が少し出ます。', w: 2, h: 2, cost: 800, months: 8, jobs: 15, bizTax: 14, visitors: 400, fame: 2, pollution: 0.2 },
  cutlery: { ...inv('民間企業'), cat: 'industry', name: '刃物の工場（鍛冶）', note: '包丁やはさみを鍛える工場。職人の技は海外の観光客にも人気。', w: 2, h: 1, cost: 900, months: 8, jobs: 30, bizTax: 22, visitors: 150, fame: 1 },
  furnitureShop: { ...inv('民間企業'), cat: 'industry', name: '家具工房', note: '地元の木で家具をつくる工房と展示場。製材所があると材料が近い。', w: 2, h: 1, cost: 700, months: 6, jobs: 20, bizTax: 14, visitors: 100 },
  foundry: { ...inv('民間企業'), cat: 'industry', name: '鋳物工場', note: '溶かした鉄を砂型に流して部品や鍋をつくる工場。熱と音、少しの煙が出ます。', w: 2, h: 2, cost: 2500, months: 12, jobs: 80, bizTax: 50, pollution: 0.7, use: 300 },
  printPlant: { ...inv('民間企業'), cat: 'industry', name: '印刷工場', note: '新聞・本・チラシを刷る工場。夜も輪転機が回ります。', w: 3, h: 2, cost: 5000, months: 16, jobs: 180, bizTax: 90, use: 400 },
  dairyPlant: { ...inv('民間企業'), cat: 'industry', name: '乳製品・パンの工場', note: '牛乳・ヨーグルト・パンをつくる工場。酪農牧場があると原料が近い。パートの働き口が多い。', w: 3, h: 2, cost: 6000, months: 16, jobs: 280, bizTax: 120, use: 500, chain: ['dairy', 'field'] },
  bottling: { ...inv('民間企業'), cat: 'industry', name: '飲料のボトリング工場', note: 'お茶・水・炭酸飲料を詰める工場。水のよい土地に来ます。トラックが出入りします。', w: 3, h: 2, cost: 7000, months: 16, jobs: 200, bizTax: 150, use: 600, req: 'arterial' },
  medDevice: { ...inv('民間企業'), cat: 'industry', name: '医療機器工場', note: 'カテーテルや検査機器をつくるクリーンルームの工場。給料が高く、大学があると来やすい。', w: 3, h: 2, cost: 9000, months: 20, jobs: 300, bizTax: 260, use: 600 },
  aeroParts: { ...inv('民間企業'), cat: 'industry', name: '航空機部品工場', note: '旅客機の胴体や主翼の部品をつくる工場。重工業の工場があると仕事が回ってきます。', w: 4, h: 2, cost: 16000, months: 26, jobs: 500, bizTax: 420, use: 1200, req: 'arterial', chain: ['heavyInd'] },
  quarry: { ...inv('民間企業'), cat: 'industry', name: '採石場', note: '山を段々に削って石を切り出す採石場。道路やコンクリートの材料。ほこりと発破の音が出て、景色が変わります。', w: 3, h: 3, cost: 2500, months: 10, jobs: 40, bizTax: 40, pollution: 1.2 },
  gravelPit: { ...inv('民間企業'), cat: 'industry', name: '砂利採取場', note: '川や池の底から砂利をとる場所。建設の材料になります。', w: 3, h: 2, cost: 1500, months: 8, jobs: 20, bizTax: 22, pollution: 0.5 },
  mine: { ...inv('民間企業'), cat: 'industry', name: '鉱山（坑道とやぐら）', note: '金・銅・石灰を掘る鉱山。立坑のやぐらは産業遺産になります。ズリ山と排水の手当てが要ります。', w: 3, h: 3, cost: 8000, months: 24, jobs: 200, bizTax: 200, pollution: 1.0, fame: 1 },
  indWaste: { ...inv('民間'), cat: 'industry', name: '産業廃棄物処理場', note: '工場の廃棄物を燃やし、砕いて処理する民間の施設。工場が多い街には欠かせませんが、住民の反対が起きやすい。', w: 3, h: 2, cost: 6000, months: 18, jobs: 80, bizTax: 80, pollution: 1.2 },
  landfill: { ...inv('民間'), cat: 'industry', name: '最終処分場（埋立地）', note: '燃やした灰や燃えないごみを埋める場所。いっぱいになると覆土して公園にできます。においと反対運動に注意。', w: 4, h: 3, cost: 5000, months: 18, jobs: 30, bizTax: 10, pollution: 0.8 },
  nightSoil: { ...inv('民間'), cat: 'industry', name: 'し尿処理場', note: 'くみ取りと浄化槽の汚泥を処理する施設。下水道が届かない地域に必要です。少しにおいます。', w: 2, h: 2, cost: 3000, months: 14, jobs: 15, bizTax: 0, pollution: 0.4 },
  scrapYard: { ...inv('民間'), cat: 'industry', name: '解体・スクラップ工場', note: '古い車や家電を解体して、鉄やアルミを取り出す工場。リサイクル率が上がります。景観は悪くなります。', w: 2, h: 2, cost: 1200, months: 6, jobs: 25, bizTax: 18, pollution: 0.6 },
  carAuction: { ...inv('民間企業'), cat: 'industry', name: '中古車オークション会場', note: '全国の業者が中古車をせり落とす会場。車がずらりと並び、輸出の港があると活発になります。', w: 4, h: 3, cost: 6000, months: 12, jobs: 120, bizTax: 90, req: 'arterial' },
  cosmetics: { ...inv('民間企業'), cat: 'industry', name: '化粧品工場', note: '化粧品やシャンプーをつくる明るい工場。女性の働き口が多く、見学も人気。', w: 3, h: 2, cost: 7000, months: 18, jobs: 250, bizTax: 160, use: 400, visitors: 200 },
  toyFactory: { ...inv('民間企業'), cat: 'industry', name: 'おもちゃ工場', note: 'おもちゃやプラモデルをつくる工場。工場見学とアウトレットに家族連れが来ます。', w: 3, h: 2, cost: 5000, months: 16, jobs: 180, bizTax: 110, visitors: 500, fame: 1 },
  // ---- v49 農業・畜産・漁業・林業 ----
  poultry: { ...req('agri', 'nature', '養鶏農家'), cat: 'agri', name: '養鶏場（採卵・ブロイラー）', note: '窓のない鶏舎で卵と鶏肉をつくる養鶏場。ふるさと納税の返礼品（卵・焼き鳥）になります。においと、秋から冬の鳥インフルエンザに注意。家から少し離して。', w: 3, h: 2, cost: 1200, months: 6, jobs: 18, bizTax: 14, pollution: 0.5 },
  pigFarm: { ...req('agri', 'nature', '養豚農家'), cat: 'agri', name: '養豚場', note: 'ブランド豚を育てる養豚場。返礼品の定番。においが強く、周りの住宅の満足が下がります。浄化槽で排水をきれいにします。', w: 2, h: 2, cost: 1000, months: 6, jobs: 12, bizTax: 12, pollution: 0.8 },
  beefRanch: { ...req('agri', 'nature', '畜産農家'), cat: 'agri', name: '肉牛の牧場（黒毛和牛）', note: '黒毛和牛を育てる牧場。ブランド牛は返礼品の人気上位で、知名度も上がります。においが少しあります。', w: 3, h: 2, cost: 1500, months: 8, jobs: 10, bizTax: 18, fame: 1, pollution: 0.4, green: 0.4 },
  dairy: { ...req('agri', 'nature', '酪農家'), cat: 'agri', name: '酪農牧場（牛舎・サイロ）', note: '乳牛を育てて生乳を出荷する牧場。赤い牛舎とサイロは景色になり、牛乳・チーズは返礼品になります。においが少しあります。', w: 3, h: 2, cost: 1500, months: 8, jobs: 12, bizTax: 15, visitors: 200, pollution: 0.4, green: 0.4 },
  horseFarm: { ...req('agri', 'nature', '生産牧場'), cat: 'agri', name: '馬の牧場（競走馬の生産）', note: 'サラブレッドを生産・育成する牧場。競馬場があると縁が深まり、乗馬体験で人が来ます。', w: 3, h: 2, cost: 1800, months: 8, jobs: 14, bizTax: 20, visitors: 300, fame: 1, green: 0.6 },
  teaField: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: '茶畑', note: '丘の斜面に広がる茶畑。新茶の季節は景色が美しく、お茶は返礼品になります。空気と景色をよくします。', w: 2, h: 2, cost: 700, months: 4, jobs: 4, bizTax: 6, visitors: 100, green: 0.9 },
  orchard: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: '果樹園（りんご・みかん・ぶどう）', note: '果物狩りもできる果樹園。秋は観光客が来ます。果物は返礼品の人気上位です。', w: 2, h: 2, cost: 900, months: 6, jobs: 6, bizTax: 9, visitors: 400, green: 0.9 },
  greenhouse: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: 'ビニールハウス群（いちご・トマト）', note: '一年中、いちごやトマトを育てるハウス。冬は暖房に燃料を使い、燃料の値上がりで苦しくなります。', w: 2, h: 2, cost: 900, months: 3, jobs: 8, bizTax: 10, use: 30 },
  plantFactory: { ...inv('植物工場の会社'), cat: 'agri', name: '植物工場（LED の水耕栽培）', note: '天候に左右されず、LED の光で葉物野菜を育てる工場。電気を多く使います。新しい農業の働き口。', w: 2, h: 2, cost: 3000, months: 12, jobs: 40, bizTax: 40, use: 300 },
  flowerFarm: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: '花き農園（切り花・鉢花）', note: '色とりどりの花の畑と温室。母の日やお盆の花を出荷し、花の季節は写真を撮りに人が来ます。', w: 2, h: 2, cost: 800, months: 4, jobs: 6, bizTax: 8, visitors: 200, green: 0.7 },
  shiitake: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: 'しいたけ栽培（原木）', note: '杉林の木陰でほだ木からしいたけを育てます。干ししいたけは返礼品になります。', w: 2, h: 1, cost: 400, months: 4, jobs: 3, bizTax: 4, green: 0.8 },
  bamboo: { ...req('agri', 'nature', '森林組合'), cat: 'agri', name: '竹林', note: '風にそよぐ竹林。春のたけのこと、竹細工の材料。手入れしないと荒れて広がります。観光の小径にもなります。', w: 2, h: 2, cost: 300, months: 2, jobs: 1, bizTax: 2, visitors: 150, green: 1 },
  riceCenter: { ...req('agri', 'nature', 'JA'), cat: 'agri', name: 'JA のライスセンター（カントリーエレベーター・精米所）', note: '農家のお米を乾燥・貯蔵・精米する JA の施設。田んぼと畑の収入が 1 割上がります。', w: 3, h: 2, cost: 3500, months: 12, jobs: 30, bizTax: 25, use: 120 },
  compost: { ...req('agri', 'nature', 'JA'), cat: 'agri', name: '堆肥センター', note: '家畜のふんと生ごみから、たい肥をつくる施設。畜産のにおいを減らし、ごみも少し減ります。施設そのものも少しにおいます。', w: 2, h: 2, cost: 1500, months: 8, jobs: 8, bizTax: 4, pollution: 0.3 },
  sakeBrewery: { ...inv('酒蔵'), cat: 'agri', name: '酒蔵（日本酒）', note: '水と米のよい土地の酒蔵。蔵見学と直売所に人が来て、地酒は返礼品の人気上位です。', w: 2, h: 2, cost: 1800, months: 10, jobs: 25, bizTax: 30, visitors: 600, fame: 2, chain: ['paddy', 'riceCenter', 'farm'] },
  soyBrewery: { ...inv('醸造元'), cat: 'agri', name: '醤油・味噌の蔵', note: '木桶で仕込む醤油と味噌の蔵。蔵の町並みが観光になり、返礼品にもなります。', w: 2, h: 2, cost: 1500, months: 10, jobs: 20, bizTax: 22, visitors: 300, fame: 1 },
  teaFactory: { ...inv('製茶問屋'), cat: 'agri', name: '製茶工場', note: '摘んだ茶葉を蒸して揉み、荒茶にする工場。茶畑があると収入が増えます。新茶の季節は香りが街に広がります。', w: 2, h: 1, cost: 1200, months: 8, jobs: 15, bizTax: 16, chain: ['teaField'] },
  aquaRaft: { ...req('agri', 'nature', '漁協'), cat: 'agri', name: '養殖いかだ（牡蠣・のり・真珠）', note: '静かな海や湖で牡蠣・のり・真珠を育てるいかだ。水辺から 90m 以内。冬の牡蠣小屋に人が来ます。', w: 2, h: 2, cost: 900, months: 6, jobs: 10, bizTax: 12, visitors: 200, req: 'water' },
  landAqua: { ...inv('陸上養殖の会社'), cat: 'agri', name: '陸上養殖場（サーモン・えび）', note: '海から離れた所でも、水を循環させて魚を育てる新しい養殖。電気を多く使います。', w: 2, h: 2, cost: 2800, months: 12, jobs: 30, bizTax: 32, use: 250 },
  fishFarm: { ...req('agri', 'nature', '養魚組合'), cat: 'agri', name: '養魚場（うなぎ・鮎）', note: 'きれいな水を引いた池で、うなぎや鮎を育てます。うなぎは返礼品の人気上位。', w: 2, h: 2, cost: 900, months: 6, jobs: 8, bizTax: 12 },
  setNet: { ...req('agri', 'nature', '漁協'), cat: 'agri', name: '定置網の番屋', note: '沖の定置網で魚をとる漁師の作業小屋。朝の水揚げを漁港と朝市に運びます。水辺から 90m 以内。', w: 2, h: 1, cost: 600, months: 4, jobs: 12, bizTax: 10, req: 'water' },
  fishProcess: { ...inv('水産加工の会社'), cat: 'agri', name: '魚の加工場（水産加工）', note: '干物・かまぼこ・缶詰をつくる工場。漁港があると原料が近く、パートの働き口が多い。においが少しあります。', w: 3, h: 2, cost: 4000, months: 14, jobs: 150, bizTax: 70, use: 200, pollution: 0.3, chain: ['fishPort', 'setNet', 'aquaRaft'] },
  coldStorage: { ...inv('物流会社'), cat: 'agri', name: '冷凍冷蔵倉庫', note: '冷凍の魚・肉・冷凍食品を保管する大きな倉庫。漁港・食品工場・市場の近くが便利。電気を多く使い、トラックが出入りします。幹線道路か国道に面した土地に来ます。', w: 3, h: 2, cost: 4500, months: 12, jobs: 60, bizTax: 60, use: 600, req: 'arterial' },
  sawmill: { ...inv('製材会社'), cat: 'agri', name: '製材所', note: '山の丸太を柱や板にする工場。地元の木の家づくりを支え、林業の作業所があると原料が近くなります。音が少しします。', w: 3, h: 2, cost: 2500, months: 10, jobs: 40, bizTax: 30, pollution: 0.3, chain: ['forestry', 'timberMarket'] },
  timberMarket: { ...req('agri', 'nature', '森林組合'), cat: 'agri', name: '木材市場（原木のせり）', note: '森林組合が開く丸太のせり市。林業の収入が上がり、製材所が来やすくなります。', w: 3, h: 2, cost: 2000, months: 8, jobs: 15, bizTax: 15 },
  forestry: { ...req('agri', 'nature', '森林組合'), cat: 'agri', name: '林業の作業所（作業道と土場）', note: '間伐で山の手入れをする森林組合の拠点。土砂災害をすこし防ぎ、木材を製材所へ送ります。', w: 2, h: 2, cost: 800, months: 4, jobs: 10, bizTax: 6, green: 0.8 },
  ranchPark: { ...inv('観光牧場の会社'), cat: 'agri', name: '観光牧場（ふれあい牧場）', note: '牛や羊とふれあえて、しぼりたての牛乳とソフトクリームが名物の牧場。家族連れが来て、子育ての満足も少し上がります。', w: 3, h: 2, cost: 2500, months: 10, jobs: 35, bizTax: 25, visitors: 1500, fame: 2, green: 0.6 },
  apiary: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: '養蜂場', note: '巣箱を並べてはちみつをとる養蜂場。花畑や果樹園の受粉を助け、はちみつは返礼品になります。', w: 2, h: 1, cost: 300, months: 2, jobs: 2, bizTax: 4, green: 0.4 },
  wasabi: { ...req('agri', 'nature', '農家・JA'), cat: 'agri', name: 'わさび田', note: '冷たい湧き水が流れる段々のわさび田。景色が名所になり、わさびは返礼品の人気品です。', w: 2, h: 2, cost: 800, months: 6, jobs: 4, bizTax: 8, visitors: 300, fame: 1, green: 0.8 },
  saltField: { ...req('agri', 'nature', '製塩所'), cat: 'agri', name: '塩田（揚げ浜式の製塩）', note: '浜に海水をまいて天日で乾かし、釜で煮つめて塩をつくる伝統の塩田。体験に人が来ます。水辺から 90m 以内。', w: 2, h: 2, cost: 700, months: 6, jobs: 6, bizTax: 6, visitors: 250, fame: 1, req: 'water' },
  // ---- v48 観光の乗り物と水上交通 ----
  slDepot: { ...inv('鉄道会社'), cat: 'transport', name: '観光SLの機関区（転車台）', note: '蒸気機関車（SL）を保存・運行する機関区。転車台で向きを変えたSLが、週末に客車を引いて市内の線路を走ります。来訪者と知名度が上がり、鉄道ファンが集まります。線路と駅がある街に来ます（1 か所）。煙が少し嫌がられます。', w: 3, h: 2, cost: 3000, months: 14, jobs: 40, bizTax: 30, use: 40, visitors: 900, fame: 3, pollution: 0.3, req: 'station', unique: true },
  waterBus: { ...inv('水上バスの会社'), cat: 'transport', name: '水上バスの船着き場', note: '川や海を走る水上バスののりば。渋滞と関係なく、水辺の駅や観光地を結びます。通勤と観光の足になり、来訪者が増えます。水辺（川・海・池）から 90m 以内。', w: 2, h: 1, cost: 1200, months: 8, jobs: 20, bizTax: 15, use: 30, visitors: 500, fame: 1, req: 'water' },
  cruisePier: { ...inv('観光船の会社'), cat: 'transport', name: '遊覧船の乗り場', note: '街と水辺の景色を船から楽しむ遊覧船の乗り場。夜はライトアップしたクルーズも出ます。来訪者と知名度が上がり、ホテルが来やすくなります。水辺から 90m 以内。', w: 2, h: 2, cost: 2500, months: 12, jobs: 40, bizTax: 35, use: 40, visitors: 1200, fame: 2, req: 'water' },
  yakatabune: { ...inv('船宿'), cat: 'transport', name: '屋形船の船宿', note: '提灯をともした屋形船で、天ぷらを食べながら花火や夜景を楽しむ船宿。夜の観光が増え、知名度が上がります。水辺から 90m 以内。', w: 2, h: 1, cost: 800, months: 6, jobs: 15, bizTax: 12, use: 20, visitors: 400, fame: 2, req: 'water' },
  // ---- v44 次世代（10〜25 年目）と次次世代（35 年目〜）の都市の要素 ----
  hydrogenStation: { ...inv('エネルギー会社'), name: '水素ステーション（燃料電池車・バス）', note: '【次世代】燃料電池で走る車とバスに水素を入れる場所。排気ガスが水だけの車が増え、空気が少しきれいになり、知名度が上がります。8 年目から。幹線道路の近く。', w: 1, h: 1, cost: 800, months: 8, jobs: 8, bizTax: 10, use: 30, fame: 1, req: 'arterial', unlock: 8 },
  droneHub: { ...inv('物流会社'), name: 'ドローン配送の拠点', note: '【次世代】荷物と薬をドローンで届ける拠点。山間部や郊外の買い物が楽になり、高齢世帯の満足が上がります。10 年目から。', w: 2, h: 1, cost: 2000, months: 10, jobs: 30, bizTax: 40, use: 60, fame: 2, unlock: 10 },
  mobilityHub: { ...city('transport', 'transport'), owner: '市と交通事業者', name: 'モビリティハブ（MaaS：シェアサイクル・電動キックボード・オンデマンド交通）', note: '【次世代】スマホ 1 つで、電車・バス・シェアサイクル・乗り合いタクシーを予約して乗り継げる拠点。朝の車が 5% 減り、通勤の満足が上がります。6 年目から（3 か所まで効果）。', lvMax: 1, w: 1, h: 1, cost: 1500, months: 6, upkeep: 20, capacity: 1, ageRate: 0.15, renewCost: 600, renewMonths: 2, renewFactor: 0.7, unlock: 6 },
  gridBattery: { ...req('power', 'infra', '電力会社'), name: '系統用の大型蓄電池', note: '【次世代】太陽光と風力の電気をためて、夜と無風のときに使う大きな電池。市内の発電の力が 6% 上がり、停電しにくくなります。8 年目から。', w: 2, h: 1, cost: 4000, months: 10, capacity: 0, capUnit: '世帯相当（発電）', use: 10, unlock: 8 },
  perovskite: { ...city('power', 'infra'), name: 'ペロブスカイト太陽電池の発電ビル', owner: '市', note: '【次世代】薄く曲がる日本生まれの太陽電池を、壁と窓に張ったビル。土地をあまり使わずに 1,200 世帯分の電気をつくります。12 年目から。', lvMax: 1, w: 1, h: 1, cost: 9000, months: 12, upkeep: 30, capacity: 1200, capUnit: '世帯相当（発電）', gen: 1200, income: 120, fame: 2, ageRate: 0.2, renewCost: 4000, renewMonths: 3, renewFactor: 0.5, unlock: 12 },
  offshoreWind: { ...req('power', 'infra', '電力会社・商社'), name: '洋上風力発電（浮体式）', note: '【次世代】海に浮かべた大きな風車の発電所。1 万 2,000 世帯分の電気をつくり、港の仕事が増えます。水辺から 90m 以内。12 年目から（1 か所）。', w: 3, h: 3, cost: 30000, months: 36, capacity: 12000, capUnit: '世帯相当（発電）', jobs: 120, fame: 4, req: 'water', unique: true, unlock: 12 },
  smr: { ...req('power', 'infra', '国・電力会社'), name: '小型モジュール原子炉（SMR）', note: '【次世代】工場でつくった小さな原子炉を並べる発電所。1 万 5,000 世帯分の電気を、空気を汚さずにつくります。事故の不安から反対もあります。25 年目から（1 か所）。', w: 3, h: 3, cost: 40000, months: 48, capacity: 15000, capUnit: '世帯相当（発電）', jobs: 200, fame: 4, unique: true, unlock: 25 },
  logiTunnel: { ...req('transport', 'transport', '国・物流会社'), name: '自動物流道路（地下の物流トンネル）', note: '【次次世代】地下のトンネルを、無人のカートが荷物を載せて走り続ける道。トラックが減って朝の混雑が 10% 減り、企業の売上が少し伸びます。35 年目から（1 か所）。', w: 2, h: 2, cost: 50000, months: 48, jobs: 100, fame: 6, unique: true, unlock: 35 },
  spaceSolar: { ...req('power', 'infra', '国（宇宙機関）・電力会社'), name: '宇宙太陽光発電の受電所', note: '【次次世代】宇宙の太陽光パネルでつくった電気をマイクロ波で送り、地上の大きなアンテナで受け取る施設。夜も雨も関係なく 5 万世帯分の電気が届きます。50 年目から（1 か所）。', w: 5, h: 5, cost: 80000, months: 60, capacity: 50000, capUnit: '世帯相当（発電）', jobs: 150, fame: 15, visitors: 5000, unique: true, unlock: 50 },
  spaceElevator: { ...req('biz', 'landmark', '国際コンソーシアム'), name: '宇宙エレベーターの地上局', note: '【次次世代】高さ 10 万 km のケーブルを昇って、ロケットを使わずに宇宙へ行く乗り物の地上の駅。世界中から人が集まり、知名度が最大級に上がります。70 年目から・知名度 80 以上（1 か所）。', w: 5, h: 5, cost: 200000, months: 72, jobs: 1500, visitors: 60000, fame: 25, unique: true, unlock: 70, req: 'water' },
  // ---- v41 夜の街 ----
  yokocho: { ...base, fam: 'leisure' as Fam, cat: 'leisure' as Cat, build: 'invite' as Build, authority: 'attract' as Authority, owner: '飲食店の組合', name: '飲み屋横丁（高架下・駅裏の居酒屋街）', note: '小さな居酒屋・立ち飲み・焼き鳥屋が軒を連ねる路地。仕事帰りの人と観光客が集まり、夜の売上と雇用が生まれます。酔ったうえのけんかが少し増えます。駅の近く。', w: 2, h: 1, cost: 600, months: 6, jobs: 60, bizTax: 40, use: 60, visitors: 1500, fame: 1, req: 'station' },
  nightDistrict: { ...base, fam: 'leisure' as Fam, cat: 'leisure' as Cat, build: 'invite' as Build, authority: 'attract' as Authority, owner: '飲食・娯楽の事業者', name: '繁華街（ネオン街：バー・スナック・カラオケ・クラブ）', note: 'ネオンの看板が並ぶ夜の盛り場。夜の観光と売上・雇用が大きく、知名度も上がります。一方で客引き・ぼったくり・けんかが増え、近くの治安が悪くなります（警察署・交番・防犯の政策で和らぐ）。人口 2 万人以上・駅の近く。', w: 2, h: 2, cost: 2500, months: 12, jobs: 350, bizTax: 260, use: 300, visitors: 6000, fame: 2, req: 'station' },
  fuzokuDistrict: { ...base, fam: 'leisure' as Fam, cat: 'leisure' as Cat, build: 'invite' as Build, authority: 'attract' as Authority, owner: '風俗営業の事業者', name: '歓楽街（風俗営業の許可地区）', note: 'キャバクラ・ホストクラブ・性風俗店など、風営法の許可が要る店が集まる地区（市は条例で営業してよい区域を決めます）。税と雇用は大きいものの、治安と街のイメージが悪くなり、子育て世帯は近くを嫌がります。暴力団の資金源にならない対策が要ります。繁華街があり、人口 3 万人以上。', w: 2, h: 2, cost: 2000, months: 10, jobs: 250, bizTax: 220, use: 200, visitors: 4000, req: 'station' },
  // ---- v41 産業（東証の業種）----
  carPlant: { ...inv('自動車メーカー'), cat: 'industry', name: '自動車メーカーの完成車工場', note: '組み立てラインで 1 日に何百台もつくる大工場。雇用と税がとても大きく、部品・鉄鋼・電池の工場があると調子が上がります（ないと 0.7 倍）。円安で伸び、戦争で部品が止まると落ちます。人口 2.5 万人以上・幹線道路の近く（1 か所）。', w: 5, h: 4, cost: 40000, months: 36, jobs: 4000, bizTax: 2400, use: 2500, pollution: 1, fame: 6, req: 'arterial', unique: true, chain: ['partsPlant', 'steelMill', 'battery'] },
  heavyInd: { ...inv('重工メーカー'), cat: 'industry', name: '重工業の工場（発電機・航空機エンジン・艦船）', note: '大きな機械をつくる工場。設備投資の波と防衛の予算で伸びます。鉄鋼か精密部品の工場があると材料が近く、売上が伸びます。水辺から 90m 以内（1 か所）。', w: 5, h: 4, cost: 35000, months: 36, jobs: 2500, bizTax: 1600, use: 2000, pollution: 1, fame: 4, req: 'water', unique: true, chain: ['steelMill', 'partsPlant'] },
  foodMaker: { ...inv('大手食品メーカー'), cat: 'industry', name: '大手食品メーカーの工場（即席めん・菓子・飲料）', note: '全国に出荷する食品の工場。工場見学に人が来ます。市内の田畑・農地・漁港の産物を使うと売上が伸びます。景気に強い一方、円安と物価高で原料が値上がりすると苦しくなります。', w: 4, h: 3, cost: 12000, months: 24, jobs: 900, bizTax: 500, use: 700, pollution: 0.3, visitors: 3000, fame: 3, req: 'arterial', chain: ['paddy', 'field', 'farm', 'fishPort'] },
  zenecon: { ...inv('大手ゼネコン'), name: '大手ゼネコンの支店', note: 'ビル・橋・トンネルをつくる大手建設会社の支店。市の工事を地元で請けられるので、施設の建設費が 4% 下がります。金利と資材の値上がりに弱く、談合のできごとが起きることがあります。駅の近く（1 か所）。', w: 1, h: 1, cost: 3000, months: 12, jobs: 250, bizTax: 220, use: 120, req: 'station', unique: true },
  tradingCo: { ...inv('総合商社'), name: '総合商社の支社', note: '資源・食料・機械を世界と取引する商社の支社。円安と資源の値上がりで利益が増え、戦争のときも伸びます。市内の企業の輸出入を手伝い、景気が少し強くなります。知名度 20 以上・人口 3 万人以上・駅の近く（1 か所）。', w: 2, h: 1, cost: 6000, months: 18, jobs: 300, bizTax: 500, use: 250, fame: 3, req: 'station', unique: true },
  stockExch: { ...req('biz', 'landmark', '証券取引所（株式会社）'), name: '証券取引所（地方の取引所）', note: '株を売り買いする取引所（名古屋・福岡・札幌のような地方の取引所）。地元の企業が上場しやすくなって景気が強くなり、金融の仕事で若い世代が集まります。知名度 50 以上・人口 8 万人以上（1 か所）。', w: 2, h: 2, cost: 20000, months: 36, jobs: 400, bizTax: 400, use: 300, fame: 8, req: 'station', unique: true },
  // ---- v41 宇宙・ロボット ----
  spaceport: { ...req('transport', 'transport', '宇宙ベンチャー・国（JAXA）'), name: 'ロケットの射場（宇宙港）', note: '人工衛星を打ち上げるロケットの発射場。打ち上げのたびに見物客が大勢来て、知名度が大きく上がります。宇宙ベンチャーが近くに集まります。打ち上げの音と安全の区域に反対する声もあります。水辺から 90m 以内（1 か所）。', w: 6, h: 5, cost: 30000, months: 48, jobs: 600, visitors: 25000, fame: 12, use: 400, req: 'water', unique: true, unlock: 4 },
  spaceVenture: { ...inv('宇宙ベンチャー'), name: '宇宙ベンチャー（小型ロケット・人工衛星の工場）', note: '小さなロケットと人工衛星をつくる新しい会社。精密部品・半導体の工場か、ロケットの射場があると調子が上がります。若い技術者が集まります。', w: 3, h: 2, cost: 8000, months: 24, jobs: 350, bizTax: 280, use: 300, fame: 5, chain: ['partsPlant', 'semicon', 'spaceport'] },
  humanoidLab: { ...inv('ロボットメーカー'), name: '人型ロボットの開発拠点', note: '二本足で歩き、手で物をつかむ人型ロボットを開発・製造する拠点。介護・物流・工場の人手不足を補う実験を市内で行い、高齢世帯の満足が少し上がり、介護職員の採用が楽になります。精密部品・半導体・ロボット工場があると伸びます。知名度 30 以上。', w: 3, h: 2, cost: 10000, months: 24, jobs: 600, bizTax: 450, use: 500, fame: 6, chain: ['partsPlant', 'semicon', 'robotFactory'], unlock: 3 },
  // ---- v41 ホテル ----
  bizHotel: { ...inv('ホテル事業者'), name: 'ビジネスホテル', note: '出張の人が泊まる手ごろなホテル。駅の近く。', w: 1, h: 1, cost: 1200, months: 10, jobs: 25, bizTax: 30, use: 50, visitors: 900, req: 'station' },
  luxuryHotel: { ...inv('外資系ホテル'), name: '外資系の高級ホテル', note: '世界のホテルチェーンの高級ホテル。国際会議・結婚式・外国人の富裕層が来て、知名度が上がります。知名度 40 以上・人口 3 万人以上・駅の近く。', w: 2, h: 2, cost: 15000, months: 30, jobs: 350, bizTax: 350, use: 400, visitors: 5000, fame: 5, req: 'station' },
  ryokan: { ...inv('旅館'), name: '温泉旅館', note: '畳の部屋と露天風呂の旅館。温泉の源泉か温浴施設が市内に要ります。外国人観光客に人気です。', w: 2, h: 1, cost: 2500, months: 12, jobs: 70, bizTax: 60, use: 80, visitors: 2500, fame: 2 },
  // ---- v41 学校とスポーツ・町の要素 ----
  privHigh: { ...base, owner: '学校法人', authority: 'attract' as Authority, fam: 'biz' as Fam, cat: 'edu' as Cat, build: 'invite' as Build, name: '私立高校（スポーツの強豪校）', note: '野球部とサッカー部が強い私立高校。甲子園や全国高校サッカー選手権に出ると街が盛り上がり、知名度が上がります。寮があり、市外からも生徒が来ます。', w: 3, h: 2, cost: 6000, months: 24, jobs: 120, use: 200, visitors: 400, fame: 2 },
  clubTeam: { ...city('park', 'park'), name: '地域スポーツクラブ（ユースのクラブチーム）', note: 'サッカー・野球・バスケットの子どものクラブチームと練習場。部活動の地域移行の受け皿になり、子育て（就学）世帯の満足が上がります。', lvMax: 2, w: 2, h: 2, cost: 2500, months: 10, upkeep: 25, staffReq: 4, staffKind: '指導者', wage: 28, hire: 2, capacity: 300, capUnit: '人', ageRate: 0.1, renewCost: 800, renewMonths: 2, renewFactor: 0.7 },
  arcade: { ...city('park', 'leisure'), owner: '市と商店街振興組合', name: 'アーケード商店街（屋根付きの商店街）', note: '雨でも歩ける屋根のある商店街。近くに店が出やすくなり、高齢世帯の買い物が楽になって満足が上がります。来訪者も少し増えます。', lvMax: 2, w: 3, h: 1, cost: 3000, months: 8, upkeep: 15, visitors: 800, capacity: 1, ageRate: 0.12, renewCost: 1000, renewMonths: 2, renewFactor: 0.7 },
  station: { ...base, fam: 'station', cat: 'other', build: 'none', name: '鉄道駅', owner: '鉄道事業者', authority: 'consult', note: '市外との接続拠点。運行や改築は鉄道事業者が決めます。市は協議しかできません。', w: 3, h: 1, months: 18, cost: 30000 },
  // ---- v87 インフラと国の施設（地下駐車場・ビジネスジェット・法務省の施設・メガソーラーの型） ----
  // 地下駐車場：立体駐車場（2×2・9,000 万円・効果 240m）の約 4 倍の費用。掘削と換気・防災設備で 1 台あたりの費用は地上の数倍（駅前広場の地下駐車場は 500〜1,000 台で数十億円）。地上は広場・公園のまま（緑 0.5）
  ugParking: { ...city('transport', 'transport'), name: '地下駐車場（駅前広場の地下）', note: '広場や公園の地下に 800 台。地上は広場のまま、出入口のスロープと換気塔だけが見えます。近く（300m 以内）の店の売上が 1.5 割増え、路上駐車が減って周りの道路の渋滞が軽くなります。建設費は高めです。', lvMax: 0, w: 3, h: 3, cost: 36000, months: 30, upkeep: 140, capacity: 1, capUnit: '', ageRate: 0.08, renewCost: 12000, renewMonths: 6, renewFactor: 0.5, income: 260, green: 0.5 },
  // ビジネスジェット専用ターミナル：空港（市の負担 60,000 万円・知名度 18）の一部の施設。国内の FBO は羽田・成田・中部・関空など。来訪者は空港の 1/15 ほど（富裕層・企業の役員）
  fbo: { ...req('transport', 'transport', '空港会社・運航会社'), name: 'ビジネスジェット専用ターミナル（FBO）', note: '企業の役員や富裕層が使う小型ジェットの専用ターミナルと格納庫。市内に空港が要ります。知名度が上がり、本社やホテルが来やすくなります。小さいながら機体の騒音があります（1 か所）。', w: 3, h: 2, cost: 12000, months: 18, jobs: 60, use: 60, visitors: 1600, fame: 4, income: 40, bizTax: 30, unique: true },
  // 法務省の施設（拘置所・少年院・検察庁は v49 からある。ここでは足りない 2 つ）：刑務所（5×5・雇用 350・交付金 200）にならい、規模に比べて控えめに。周辺の不安は NIMBY の表、再犯防止の効果は core.ts の犯罪の計算で（保護観察所 4%・少年院 3% 減）
  kanbetsu: { ...req('gov', 'safety', '国（法務省）'), name: '少年鑑別所（法務少年支援センター）', note: '少年の心と行動を調べる国の施設。地域の子育てや非行の相談にも応じます（1 か所）。', w: 2, h: 1, cost: 900, months: 24, jobs: 35, income: 20, unique: true },
  hogoKansatsu: { ...req('gov', 'safety', '国（法務省）と更生保護法人'), name: '保護観察所・更生保護施設', note: '刑務所や少年院を出た人の生活と仕事を支え、保護司と見守ります。再び罪を犯す人が減り、市の治安が少し良くなります。', w: 2, h: 1, cost: 800, months: 12, jobs: 30, income: 10, unique: true },
  // メガソーラーの型：市営メガソーラー（3×3・18,000 万円・900 世帯）と面積あたり同じ水準。斜面は造成と土砂の対策で費用が 1 割高く、水上は水で冷えて発電量が 1 割多い
  solarSlope: { ...city('power', 'infra'), name: '斜面のメガソーラー', note: '山の斜面に段々にパネルを並べる大きな太陽光発電所。急斜面の近くに置きます。造成で費用が高く、土砂の流出と景観を気にする声があります。', lvMax: 0, w: 4, h: 4, cost: 36000, months: 12, upkeep: 50, capacity: 1600, capUnit: '世帯相当（発電）', gen: 1600, income: 260, ageRate: 0.2, renewCost: 16000, renewMonths: 4, renewFactor: 0.5 },
  solarFloat: { ...city('power', 'infra'), name: '水上メガソーラー（ため池）', note: 'ため池の水面にパネルを浮かべる太陽光発電所。土地を使わず、水で冷えて発電量が少し多い。水辺の近くに置きます。', lvMax: 0, w: 3, h: 3, cost: 21000, months: 8, upkeep: 30, capacity: 1000, capUnit: '世帯相当（発電）', gen: 1000, income: 170, ageRate: 0.2, renewCost: 10000, renewMonths: 3, renewFactor: 0.5, req: 'water' },
  // ---- v88：無人島（特別シナリオ）の施設。isle の印のものは無人島でだけ建てられる ----
  pier: { ...city('transport', 'transport'), name: '桟橋（船着き場）', note: '【無人島】定期船が着く木の桟橋。桟橋に面した道路が、島の外との出入口になります（ここに道路でつながった区画だけが使えます）。水辺から 90m 以内。維持費は定期船の運航の補助です。', lvMax: 0, w: 2, h: 1, cost: 1200, months: 3, upkeep: 40, capacity: 0, capUnit: '', ageRate: 0.25, renewCost: 500, renewMonths: 1, renewFactor: 0.5, req: 'water', isle: true },
  well: { ...city('water', 'infra'), name: '井戸（手押しポンプ）', note: '【無人島】地下水をくみ上げる井戸。安くすぐできますが、30 世帯分まで。日照りの年は水が減ります。', lvMax: 0, w: 1, h: 1, cost: 200, months: 1, upkeep: 3, capacity: 30, capUnit: '世帯', ageRate: 0.2, renewCost: 80, renewMonths: 1, renewFactor: 0.5, isle: true },
  rainTank: { ...city('water', 'infra'), name: '雨水タンク', note: '【無人島】屋根の雨水をためる大きなタンク。12 世帯分。雨が少ないと減ります。', lvMax: 0, w: 1, h: 1, cost: 120, months: 1, upkeep: 2, capacity: 12, capUnit: '世帯', ageRate: 0.25, renewCost: 50, renewMonths: 1, renewFactor: 0.5, isle: true },
  miniWater: { ...city('water', 'infra'), name: '簡易浄水施設（沢の水）', note: '【無人島】沢や湧水の水をろ過・消毒して配る小さな浄水施設。400 世帯分。水辺から 90m 以内。島が大きくなったら海水淡水化プラントへ。', lvMax: 0, w: 2, h: 1, cost: 3500, months: 6, upkeep: 60, staffReq: 2, staffKind: '技術職員', wage: 40, hire: 1, capacity: 400, capUnit: '世帯', ageRate: 0.2, renewCost: 1500, renewMonths: 2, renewFactor: 0.5, req: 'water', isle: true },
  dieselGen: { ...city('power', 'infra'), name: 'ディーゼル発電機', note: '【無人島】すぐに電気が使える発電機（150 世帯相当）。燃料の軽油を船で運ぶので、維持費がとても高く、音と排気が出ます。太陽光や風力に置き換えていきます。', lvMax: 0, w: 1, h: 1, cost: 600, months: 1, upkeep: 160, capacity: 150, capUnit: '世帯相当（発電）', gen: 150, ageRate: 0.3, renewCost: 300, renewMonths: 1, renewFactor: 0.5, pollution: 0.4, isle: true },
  solarKit: { ...city('power', 'infra'), name: '太陽光パネルと蓄電池', note: '【無人島】小さな太陽光パネルと、夜に使う蓄電池の組（70 世帯相当）。燃料が要らず、維持費が安い。', lvMax: 0, w: 1, h: 1, cost: 1500, months: 2, upkeep: 6, capacity: 70, capUnit: '世帯相当（発電）', gen: 70, ageRate: 0.2, renewCost: 700, renewMonths: 1, renewFactor: 0.5, isle: true },
  kaitaku: { ...city('res', 'housing'), name: '開拓小屋', note: '【無人島】開拓者が最初に暮らす木の小屋（4 世帯）。市が建て、桟橋につながった道路に面していれば、定期船で開拓者が移ってきます。', lvMax: 0, w: 1, h: 1, cost: 150, months: 2, upkeep: 1, capacity: 0, capUnit: '', ageRate: 0.3, renewCost: 60, renewMonths: 1, renewFactor: 0.5, units: 4, isle: true },
  musenTower: { ...city('telecom', 'infra'), name: '無線中継塔', note: '【無人島】本土と無線でつなぐ中継塔。電話とインターネットが 600 世帯分使えるようになり、急病の連絡もできます。', lvMax: 0, w: 1, h: 1, cost: 800, months: 3, upkeep: 10, capacity: 600, capUnit: '世帯相当（通信）', ageRate: 0.15, renewCost: 300, renewMonths: 1, renewFactor: 0.5, isle: true },
  miniIncin: { ...city('waste', 'infra'), name: '小型焼却炉', note: '【無人島】島のごみを島で燃やす小さな炉（400 世帯分）。灰は埋め立てます。煙が出るので、住宅から少し離して。', lvMax: 0, w: 1, h: 1, cost: 2500, months: 4, upkeep: 45, staffReq: 1, staffKind: '技術職員', wage: 40, hire: 1, capacity: 400, capUnit: '世帯', ageRate: 0.25, renewCost: 1000, renewMonths: 2, renewFactor: 0.5, pollution: 0.6, isle: true },
  kaitakuFarm: { ...city('agri', 'agri'), name: '開拓の畑', note: '【無人島】森を切り開いた畑。いも・野菜で 40 世帯分の食べ物をまかないます。島で採れない分は船で運ぶので、その運賃が毎月かかります。', lvMax: 0, w: 2, h: 2, cost: 400, months: 4, upkeep: 4, capacity: 40, capUnit: '世帯分（食料）', jobs: 6, ageRate: 0.1, renewCost: 150, renewMonths: 1, renewFactor: 0.5, green: 0.3, isle: true },
  fishRaft: { ...city('agri', 'agri'), name: '漁船だまりと養殖いかだ', note: '【無人島】小さな漁船の船だまりと、魚・貝を育てるいかだ。120 世帯分の食べ物と、漁の仕事。水辺から 90m 以内。', lvMax: 0, w: 2, h: 1, cost: 1800, months: 6, upkeep: 12, capacity: 120, capUnit: '世帯分（食料）', jobs: 15, ageRate: 0.15, renewCost: 700, renewMonths: 2, renewFactor: 0.5, req: 'water', isle: true },
};

export const RES_KINDS: Kind[] = ['house', 'apartment', 'mansion', 'towerMansion'];
export const SHOP_KINDS: Kind[] = ['bakery', 'shop', 'supermarket', 'konbini', 'cafe', 'drugstore'];
/** 市が建てて運営する施設 */
export const CITY_KINDS: Kind[] = (Object.keys(DEFS) as Kind[]).filter(k => DEFS[k].build === 'city');
/** 市が建設メニューから置けるもの（直営・協議・誘致） */
/** 迷惑施設：近くの住民が嫌がる（強さ 0〜1、届く範囲の区画数）。ごみ・工場・空港・火葬場・発電所・刑務所など */
export const NIMBY: Partial<Record<Kind, [number, number]>> = {
  waste: [0.5, 2], wasteL: [0.8, 3], recycleCenter: [0.4, 2], sewage: [0.4, 2], sewageS: [0.2, 1], factory: [0.6, 2], smallFactory: [0.2, 1], industrialPark: [0.5, 3],
  coalPower: [1, 4], lngPower: [0.7, 3], nuclear: [1, 5], biomass: [0.4, 2], windFarm: [0.3, 2], substation: [0.2, 1], gas: [0.3, 1],
  airport: [1, 5], vertiport: [0.3, 2], port: [0.4, 3], logistics: [0.4, 2], semicon: [0.3, 2], battery: [0.4, 2], foodFactory: [0.2, 1], pharma: [0.2, 1],
  crematorium: [0.7, 3], cemetery: [0.2, 1], funeralHall: [0.2, 1], prison: [0.8, 4], kochisho: [0.5, 2], shonenin: [0.4, 2], kanbetsu: [0.2, 1], hogoKansatsu: [0.3, 1], fbo: [0.3, 2], dieselGen: [0.3, 1], miniIncin: [0.4, 2], solarSlope: [0.2, 1], pylon: [0.1, 1], sdfBase: [0.6, 4], shipyard: [0.6, 3], racecourse: [0.3, 2], market: [0.3, 2], pachinko: [0.25, 1], smr: [0.6, 3], offshoreWind: [0.2, 2], yokocho: [0.1, 1], nightDistrict: [0.35, 2], fuzokuDistrict: [0.8, 3], carPlant: [0.6, 3], heavyInd: [0.6, 3], foodMaker: [0.2, 1], spaceport: [0.5, 4], casino: [0.5, 3], boatRace: [0.3, 2], keirin: [0.3, 2], robotFactory: [0.3, 2], usBase: [1.0, 5], oilRefinery: [0.6, 4], oilField: [0.3, 2],
};
export const BUILD_KINDS: Kind[] = (Object.keys(DEFS) as Kind[]).filter(k => DEFS[k].build !== 'none');
/** 誘致して建てる住宅（v49）。ふつうの住宅と同じく世帯が入居する */
/** 誘致する住宅が、ふつうの住宅のどれに近いか（住み手の好み・家賃の計算に使う） */
export const RES_TYPE: Record<string, 'house' | 'apartment' | 'mansion'> = { danchi: 'apartment', newTown: 'house', shataku: 'apartment', studentDorm: 'apartment', shareHouse: 'apartment', sakouju: 'apartment', yuryoRojin: 'apartment', groupHome: 'apartment', nagaya: 'apartment', kominka: 'house', besso: 'house', nisetai: 'house', hiraya: 'house', garageHouse: 'house', gatedTown: 'mansion', tinyVillage: 'house', kasetsu: 'apartment', jiritsu: 'apartment', kaitaku: 'house' };
export const HOUSING_EXTRA = new Set<Kind>(['danchi', 'newTown', 'shataku', 'studentDorm', 'shareHouse', 'sakouju', 'yuryoRojin', 'groupHome', 'nagaya', 'kominka', 'besso', 'nisetai', 'hiraya', 'garageHouse', 'gatedTown', 'tinyVillage', 'kasetsu', 'jiritsu', 'kaitaku']);
export const isRes = (k: Kind) => k === 'house' || k === 'apartment' || k === 'mansion' || k === 'towerMansion' || HOUSING_EXTRA.has(k);
export const isShop = (k: Kind) => k === 'bakery' || k === 'shop' || k === 'supermarket' || k === 'konbini' || k === 'cafe' || k === 'drugstore';
export const isCity = (k: Kind) => DEFS[k].build === 'city';
export const isBiz = (k: Kind) => DEFS[k].build === 'invite';
/** 稼働中の、その種類の施設があるか */
export const hasOp = (s: { buildings: { kind: Kind; status: string; connected: boolean }[] }, k: Kind) => s.buildings.some(b => b.kind === k && b.status === 'operating' && b.connected);
/** 稼働中の数 */
export const countOp = (s: { buildings: { kind: Kind; status: string; connected: boolean }[] }, k: Kind) => s.buildings.filter(b => b.kind === k && b.status === 'operating' && b.connected).length;
/** 系統（同じ働きのサイズ違い）が同じか */
export const fam = (k: Kind) => DEFS[k].fam;
export const kindsOf = (f: Fam): Kind[] => (Object.keys(DEFS) as Kind[]).filter(k => DEFS[k].fam === f);
/** 増築レベルによる倍率 */
export const LV_CAP = [1, 1.35, 1.7, 2.05, 2.4], LV_UPKEEP = [1, 1.25, 1.5, 1.75, 2.0];
export const lvOf = (b: { lv?: number }) => Math.max(1, Math.min(5, b.lv ?? 1));
/** レベルによる効果の倍率（来訪者・使用料・雇用・税・文化など。容量は LV_CAP） */
export const lvK = (b: { lv?: number }) => 1 + 0.2 * (lvOf(b) - 1);
/** 増築・格上げできる最高レベル（駅・空港は専用の拡張。住宅と店は民間） */
export function maxLv(k: Kind): number {
  const d = DEFS[k]; if (!d || isRes(k) || isShop(k) || k === 'station' || k === 'airport' || d.build === 'none') return 0;
  return d.build === 'invite' ? 3 : 5;
}
/** レベルごとの呼び名（[1] がレベル 2） */
const STAGE_BY: Partial<Record<string, string[]>> = {
  park: ['', '遊具を増やした', '噴水広場つき', '大型公園', '県内有数の公園'],
  library: ['', '閲覧室を拡張', '中央図書館', '図書館＋ホール', '知の拠点（複合文化施設）'],
  hospital: ['', '病棟を増築', '地域医療支援病院', '救命救急センター', '高度医療センター'],
  stadium: ['', 'スタンド増設', '屋根つき（ドーム化）', '国際規格スタジアム', 'ワールドカップ会場'],
  castleRuins: ['', '石垣の修復', '櫓の復元', '天守の復元', '国宝級の城'],
  amusementPark: ['', '新アトラクション', '夜のパレード', '大型コースター', 'テーマランド'],
  aquarium: ['', '大水槽', 'イルカショー', 'ジンベエザメの水槽', '世界最大級の水族館'],
  zoo: ['', 'ふれあい広場', 'サファリゾーン', 'パンダ舎', '世界の動物園'],
  school: ['', '教室を増築', '新校舎', 'ICT モデル校', '全国の先進校'],
  nursery: ['', '定員を拡大', '園舎を増築', '子育て支援センター併設', 'モデル園'],
  landmark: ['', '拡張', 'リニューアル', '大型化', '世界に誇る名所'],
  leisure: ['', '拡張', 'リニューアル', '大型化', '全国から人が来る名所'],
  biz: ['', '増設', '第 2 工場・新棟', '本社機能を移転', '国内最大級の拠点'],
  city: ['', '増築', '大規模改修', '地域の拠点', '全国のモデル施設'],
};
export function stageName(k: Kind, lv: number): string {
  if (lv <= 1) return ''; const d = DEFS[k];
  const t = STAGE_BY[k] ?? STAGE_BY[d.fam === 'park' ? 'park' : ''] ?? STAGE_BY[d.cat === 'landmark' ? 'landmark' : d.cat === 'leisure' ? 'leisure' : d.build === 'invite' ? 'biz' : 'city']!;
  return t[Math.min(4, lv - 1)] ?? '';
}
/** レベルで少し広がる利用圏 */
export const reachOf = (b: { kind: Kind; lv?: number }, def: number) => (DEFS[b.kind].reach ?? def) * (1 + 0.08 * (lvOf(b) - 1));

/** 航空路線（誘致すると、市が運航を補助する）。intl は国際線（空港の拡張が要る） */
export const AIR_ROUTES: { id: string; dest: string; airline: string; intl: boolean; subsidy: number; visitors: number; fame: number; jobs: number; fameReq: number; popReq: number; lcc?: boolean }[] = [
  { id: 'tokyo', dest: '東京（羽田）', airline: 'あおぞら航空', intl: false, subsidy: 60, visitors: 6000, fame: 2, jobs: 40, fameReq: 0, popReq: 15000 },
  { id: 'sapporo', dest: '札幌（新千歳）', airline: 'あおぞら航空', intl: false, subsidy: 50, visitors: 3000, fame: 1, jobs: 25, fameReq: 15, popReq: 20000 },
  { id: 'fukuoka', dest: '福岡', airline: 'つばさエア（LCC）', intl: false, subsidy: 30, visitors: 3500, fame: 1, jobs: 20, fameReq: 15, popReq: 20000, lcc: true },
  { id: 'naha', dest: '那覇', airline: 'つばさエア（LCC）', intl: false, subsidy: 35, visitors: 4000, fame: 2, jobs: 20, fameReq: 20, popReq: 25000, lcc: true },
  { id: 'seoul', dest: 'ソウル', airline: 'パシフィックウイング', intl: true, subsidy: 90, visitors: 7000, fame: 4, jobs: 40, fameReq: 30, popReq: 30000 },
  { id: 'taipei', dest: '台北', airline: 'パシフィックウイング', intl: true, subsidy: 90, visitors: 8000, fame: 4, jobs: 40, fameReq: 30, popReq: 30000 },
  { id: 'shanghai', dest: '上海', airline: 'イーストスカイ', intl: true, subsidy: 100, visitors: 7000, fame: 4, jobs: 40, fameReq: 35, popReq: 35000 },
  { id: 'bangkok', dest: 'バンコク', airline: 'つばさエア（LCC）', intl: true, subsidy: 80, visitors: 6000, fame: 5, jobs: 35, fameReq: 40, popReq: 40000, lcc: true },
  { id: 'honolulu', dest: 'ホノルル', airline: 'あおぞら航空', intl: true, subsidy: 140, visitors: 5000, fame: 7, jobs: 50, fameReq: 50, popReq: 45000 },
];
export interface PolicyDef {
  id: string; name: string; cost: number; ramp: number;
  desc: string; who: string; why: string;
  effects: { key: string; op: 'mul' | 'add'; v: number }[];
}

/** v86：政策の毎月の費用は、人口に比例させる（cost は人口 6,000 人の街での額）。子どもの医療費・給食費・手当は対象の人数で費用が決まるため。
 *  v85 は定額で、人口 3 万人の街では同じ政策が 5 分の 1 の負担になり、終盤は政策をすべて入れても痛まなかった。小さな町でも 6 割は下回らない */
export const POLICY_POP = 6000;
export const policyScale = (s: { stats: { pop: number } }) => Math.max(0.6, (s.stats?.pop ?? 0) / (POLICY_POP * SCALE));
export const policyCost = (s: { stats: { pop: number } }, p: { cost: number }) => Math.round(p.cost * policyScale(s));
/** 政策。効果は開始から ramp か月かけて満額になる（時間差）。 */
export const POLICIES: PolicyDef[] = [
  {
    id: 'furusatoPR', name: 'ふるさと納税の返礼品の充実', cost: 120, ramp: 6,
    desc: '地元の米・野菜・ビール・温泉の宿泊券などの返礼品をそろえ、ポータルサイトで宣伝します。',
    who: '市の財政', why: 'ふるさと納税の寄付が 1.6 倍になります。返礼品と経費で寄付の半分はかかります。',
    effects: [{ key: 'furusato', op: 'mul', v: 1.6 }],
  },
  {
    id: 'foreignWorkers', name: '外国人材の受け入れ拡大', cost: 80, ramp: 12,
    desc: '特定技能の外国人と家族の受け入れを、企業・介護施設と進めます（住まいと仕事の紹介）。',
    who: '企業・介護・保育', why: '外国人の働き手が 2 倍になり、人手不足の職（保育士・介護・工場）の採用が 1.3 倍になります。相談の窓口と日本語学習が追いつかないと、職場や地域で孤立して定着しにくくなります（採用の定着の倍率が下がる）。',
    effects: [{ key: 'foreign', op: 'mul', v: 2 }, { key: 'hire:保育士', op: 'mul', v: 1.3 }, { key: 'hire:介護職員', op: 'mul', v: 1.3 }],
  },
  {
    id: 'nihongo', name: '日本語教室と生活相談', cost: 40, ramp: 6,
    desc: '公民館で日本語教室を開き、学校に日本語指導の支援員を置き、ごみの出し方・病院・学校・防災の手引きを多言語とやさしい日本語で配ります。',
    who: '日本語に不慣れな住民とその子ども、近所の世帯', why: '言語の壁が下がり、医療・防災の情報が届きやすくなり、職場での定着と子どもの就学が支えられます。',
    effects: [{ key: 'support', op: 'add', v: 0.35 }],
  },
  {
    id: 'careStaff', name: '保育人材支援', cost: 180, ramp: 3,
    desc: '保育士の家賃補助と就職相談。市立・私立とも採用しやすくなります。',
    who: '子育て世帯（未就学）', why: '月あたり採用できる保育士が 2 倍になり、実効定員が早く埋まります。建物を増やす効果はありません。',
    effects: [{ key: 'hire:保育士', op: 'mul', v: 2 }],
  },
  {
    id: 'shopStart', name: '店舗創業支援', cost: 120, ramp: 2,
    desc: '開業時の改装費補助。採算ぎりぎりの商圏でも店が出やすくなります。',
    who: '高齢世帯、商店主', why: '出店に必要な見込み売上の水準が 22% 下がります。需要のない場所には出店しません。',
    effects: [{ key: 'shopOpen', op: 'mul', v: 0.78 }],
  },
  {
    id: 'homeReform', name: '住宅改修支援', cost: 150, ramp: 6,
    desc: '戸建ての段差解消・断熱改修への補助。住み続けやすくなります。',
    who: '高齢世帯、戸建ての世帯', why: '戸建ての住宅満足が上がり、転出率が 15% 下がります。効果が出そろうまで 6 か月かかります。',
    effects: [{ key: 'houseQuality', op: 'add', v: 0.1 }, { key: 'outflow', op: 'mul', v: 0.85 }],
  },
  {
    id: 'roadCare', name: '道路維持強化', cost: 200, ramp: 1,
    desc: '舗装の計画補修。道路の老朽化が遅くなり、傷んだ区間を順に直します。',
    who: '就業世帯、全市', why: '市道の老朽化が 6 割遅くなり、老朽度 50 超の区間を毎月少しずつ補修します。',
    effects: [{ key: 'roadAge', op: 'mul', v: 0.4 }, { key: 'roadFix', op: 'add', v: 1.5 }],
  },
  {
    id: 'familyMove', name: '子育て世帯転入支援', cost: 250, ramp: 2,
    desc: '転入する子育て世帯への引越し補助と PR。',
    who: '子育て世帯', why: '子育て世帯の転入希望が 35% 増えます。住宅と保育の受け皿がなければ待機が増えます。',
    effects: [{ key: 'inflow:2', op: 'mul', v: 1.35 }, { key: 'inflow:3', op: 'mul', v: 1.35 }],
  },
  // ---- v41 子育て・物価高・いじめ・夜の街・ものづくり ----
  {
    id: 'kyushokuFree', name: '小中学校の給食費の無償化', cost: 260, ramp: 2,
    desc: '市立の小・中学校の給食費を市が負担します（1 人あたり月 4,500 円ほど）。',
    who: '子育て世帯（就学）', why: '就学の子がいる世帯の満足が上がり、転入が 12% 増えます。物価高の負担も少し和らぎます。',
    effects: [{ key: 'sat:3', op: 'add', v: 0.025 }, { key: 'inflow:3', op: 'mul', v: 1.12 }, { key: 'bukkaRelief', op: 'add', v: 0.1 }],
  },
  {
    id: 'kodomoIryo', name: '子どもの医療費の無償化（高校生まで）', cost: 200, ramp: 2,
    desc: '18 歳までの通院・入院の自己負担を市が持ちます。',
    who: '子育て世帯', why: '子育て世帯の満足が上がり、転入が 8% 増えます。',
    effects: [{ key: 'sat:2', op: 'add', v: 0.015 }, { key: 'sat:3', op: 'add', v: 0.015 }, { key: 'inflow:2', op: 'mul', v: 1.08 }, { key: 'inflow:3', op: 'mul', v: 1.08 }],
  },
  {
    id: 'jidoTeate', name: '市独自の児童手当の上乗せ', cost: 380, ramp: 3,
    desc: '国の児童手当に、市が子ども 1 人あたり月 5,000 円を上乗せします。',
    who: '子育て世帯（未就学）', why: '小さな子のいる世帯の転入が 20% 増え、満足が上がります。費用は大きめです。',
    effects: [{ key: 'inflow:2', op: 'mul', v: 1.2 }, { key: 'sat:2', op: 'add', v: 0.02 }, { key: 'bukkaRelief', op: 'add', v: 0.1 }],
  },
  {
    id: 'bukkaPremium', name: 'プレミアム付き商品券（物価高対策）', cost: 300, ramp: 1,
    desc: '1 万円で 1 万 3,000 円分の買い物ができる市内専用の商品券を売ります。',
    who: '全市・商店', why: '物価高の暮らしの負担が 4 割和らぎ、市内の店の売上が増えて出店しやすくなります。',
    effects: [{ key: 'bukkaRelief', op: 'add', v: 0.4 }, { key: 'shopOpen', op: 'mul', v: 0.92 }],
  },
  {
    id: 'suidoGenmen', name: '水道の基本料金の減免（物価高対策）', cost: 220, ramp: 1,
    desc: '半年ごとに見直しながら、すべての世帯の水道の基本料金を免除します。',
    who: '全市（とくに年金暮らし）', why: '物価高の暮らしの負担が 3 割和らぎ、高齢世帯の満足が少し上がります。',
    effects: [{ key: 'bukkaRelief', op: 'add', v: 0.3 }, { key: 'sat:4', op: 'add', v: 0.006 }],
  },
  {
    id: 'ijimeTaisaku', name: 'いじめ対策（スクールカウンセラーと SNS 相談）', cost: 110, ramp: 4,
    desc: 'すべての小・中学校にカウンセラーを置き、匿名で相談できる SNS の窓口を開きます。',
    who: '子育て世帯（就学）', why: 'いじめの重大事態が起きにくくなり（6 割減）、起きたときも早く見つかります。就学の子がいる世帯の満足が少し上がります。',
    effects: [{ key: 'ijime', op: 'add', v: 0.6 }, { key: 'sat:3', op: 'add', v: 0.006 }],
  },
  {
    id: 'nightPatrol', name: '繁華街の防犯（防犯カメラ・警察との合同パトロール）', cost: 140, ramp: 3,
    desc: '繁華街と駅前に防犯カメラを付け、警察・商店会と夜の見回りをします。',
    who: '全市', why: '夜の街の治安の悪化が 35% 和らぎ、街全体の治安も少し良くなります。',
    effects: [{ key: 'nightSafe', op: 'add', v: 0.35 }, { key: 'safety', op: 'add', v: 0.04 }],
  },
  {
    id: 'kyakuhiki', name: '客引き防止条例と暴力団排除の取り組み', cost: 40, ramp: 6,
    desc: '客引き・スカウト行為を禁じて罰則を設け、暴力団と取引した店の名前を公表します。',
    who: '全市', why: '夜の街の治安の悪化が 25% 和らぎます。店の売上が少し減り、夜の観光客がわずかに減ります。',
    effects: [{ key: 'nightSafe', op: 'add', v: 0.25 }, { key: 'visitors', op: 'mul', v: 0.99 }],
  },
  {
    id: 'nightEcon', name: 'ナイトタイムエコノミーの推進（夜の観光）', cost: 90, ramp: 6,
    desc: '夜のライトアップ・屋台・終電後のバス・多言語の案内で、夜も楽しめる街にします。',
    who: '観光客・飲食店', why: '来訪者が 6% 増え、景気が少し強くなります。夜の街の治安は少し悪くなります。',
    effects: [{ key: 'visitors', op: 'mul', v: 1.06 }, { key: 'econ', op: 'mul', v: 1.006 }, { key: 'nightSafe', op: 'add', v: -0.1 }],
  },
  {
    id: 'monozukuri', name: '町工場の技術支援（試作と販路づくり）', cost: 100, ramp: 6,
    desc: '産業支援センターの技術者が試作を手伝い、大企業や海外への売り込みと後継ぎ探しを支えます。',
    who: '町工場・ものづくりの企業', why: '町工場の税が 25% 増え、下請けから自社製品へ育つ会社が出てきます。',
    effects: [{ key: 'smallFactory', op: 'mul', v: 1.25 }],
  },
  {
    id: 'antiTerror', name: 'テロ対策（重要施設の警備と合同訓練）', cost: 150, ramp: 6,
    desc: '駅・空港・大きな行事の警備を厚くし、警察・消防・自衛隊と年 2 回の合同訓練をします。不審物の通報の窓口もつくります。',
    who: '全市', why: '国際テロ組織の脅威が半分になり、過激派の妨害も減ります。万博・五輪や空港がある街ほど大切です。',
    effects: [{ key: 'safety', op: 'add', v: 0.02 }],
  },
  {
    id: 'koanRenkei', name: '公安・警察との情報共有（危機管理監を置く）', cost: 60, ramp: 6,
    desc: '危機管理の専門の幹部を置き、警察の公安部門と過激派・右翼団体・暴力団の動きを共有します。',
    who: '全市', why: '極左の過激派・右翼団体の街宣・テロの脅威が下がります。費用は小さめです。',
    effects: [{ key: 'safety', op: 'add', v: 0.01 }],
  },
  {
    id: 'consumerCenter', name: '消費生活センターの強化（詐欺・霊感商法の相談）', cost: 80, ramp: 4,
    desc: '相談員を増やし、特殊詐欺・高額献金・霊感商法の被害の相談と、弁護士への橋渡しをします。',
    who: '高齢世帯・孤立した人', why: 'カルト的な団体と特殊詐欺の組織の力が弱まり、高齢世帯の満足が少し上がります。',
    effects: [{ key: 'sat:4', op: 'add', v: 0.004 }],
  },
  {
    id: 'mimamoriNet', name: '高齢者の見守りネットワーク（銀行・コンビニ・郵便と連携）', cost: 70, ramp: 6,
    desc: 'ATM の前で長く電話している人への声かけ、郵便・新聞・宅配の配達員の見守りを、市が仕組みにします。',
    who: '高齢世帯', why: '特殊詐欺の被害が減り（闇の組織が弱まる）、一人暮らしの高齢者の孤立も防げます。',
    effects: [{ key: 'sat:4', op: 'add', v: 0.006 }],
  },
  // ---- v7 ----
  {
    id: 'sorting', name: 'ごみの分別とリサイクル', cost: 90, ramp: 6,
    desc: '資源ごみの分別を細かくし、集団回収に報奨金を出します。',
    who: '全市', why: 'ごみの量が 15% 減り、清掃工場や収集の余力が増えます。環境を大事にする住民の支持が少し上がります。',
    effects: [{ key: 'wasteDemand', op: 'mul', v: 0.85 }, { key: 'approval', op: 'add', v: 0.005 }],
  },
  {
    id: 'bikeLanes', name: '自転車道とシェアサイクル', cost: 150, ramp: 6,
    desc: '幹線道路に自転車専用の通行帯を引き、駅の周りにシェアサイクルの拠点を置きます。',
    who: '就業世帯、単身世帯', why: '朝に車で出る人が 5% 減り、渋滞と排気が減ります。',
    effects: [{ key: 'peakTrips', op: 'mul', v: 0.95 }, { key: 'sat:0', op: 'add', v: 0.006 }],
  },
  {
    id: 'akiya', name: '空き家対策（空き家バンクと改修補助）', cost: 120, ramp: 6,
    desc: '空き家を登録して紹介し、改修と解体に補助を出します。',
    who: '全市、転入を考える世帯', why: '転出が 6% 減り、転入が 5% 増えます。古い家の住み心地も少し上がります。',
    effects: [{ key: 'outflow', op: 'mul', v: 0.94 }, { key: 'inflow', op: 'mul', v: 1.05 }, { key: 'houseQuality', op: 'add', v: 0.03 }],
  },
  {
    id: 'tabunka', name: '多言語・やさしい日本語の相談窓口', cost: 80, ramp: 3,
    desc: '市役所の窓口に通訳（電話・タブレット）を置き、手続きの案内を多言語とやさしい日本語にし、オンラインで申請できる手続きを増やします。誰でも使えます。',
    who: '転入したばかりの世帯、高齢の人、日本語に不慣れな住民、企業', why: '行政サービスへのアクセスが上がり、言語の壁が少し下がります。相談の利用・採用の定着・転出・災害時の情報に効きます。',
    effects: [{ key: 'access', op: 'add', v: 0.2 }, { key: 'lang', op: 'add', v: 0.08 }],
  },
  {
    id: 'kodomo', name: '子ども食堂への支援', cost: 60, ramp: 2,
    desc: '地域の子ども食堂に場所代と食材費を補助し、学習支援もつなげます。',
    who: '子育て世帯', why: '子育て世帯の満足が少し上がり、支持率も上がります。',
    effects: [{ key: 'sat:2', op: 'add', v: 0.008 }, { key: 'sat:3', op: 'add', v: 0.012 }, { key: 'approval', op: 'add', v: 0.008 }],
  },  ...LOOP_POLICIES, // v90：3 つのゲームループの対策（loopPolicies.ts）
];

export const PLEDGES: Pledge[] = [
  { id: 'wait', text: '保育の待機児童を 10 人以下にする' },
  { id: 'water', text: '水道施設の更新を終える（老朽度 40 以下）' },
  { id: 'traffic', text: '通勤時間帯の最大混雑率を 100% 以下にする' },
  { id: 'fiscal', text: '直近 12 か月の収支の平均を 0 以上に保ち、一時借入に頼らない' },
];

/** 満足度の重み [類型][住宅負担, 通勤, 保育, 学校, 公園, 買物, 消防・防災, ライフライン, 雇用, 医療, 治安, 環境, 文化・スポーツ, 福祉] */
export const SAT_W = [
  [0.22, 0.22, 0, 0, 0.04, 0.14, 0.04, 0.08, 0.12, 0.04, 0.04, 0.03, 0.03, 0],
  [0.18, 0.22, 0, 0, 0.07, 0.12, 0.04, 0.09, 0.12, 0.05, 0.04, 0.04, 0.03, 0],
  [0.13, 0.13, 0.26, 0.04, 0.1, 0.08, 0.04, 0.07, 0, 0.06, 0.04, 0.03, 0.02, 0],
  [0.13, 0.13, 0.04, 0.22, 0.1, 0.08, 0.05, 0.08, 0, 0.04, 0.05, 0.03, 0.05, 0],
  [0.13, 0.03, 0, 0, 0.1, 0.18, 0.1, 0.1, 0.02, 0.12, 0.05, 0.04, 0.03, 0.1],
];
export const SAT_PARTS = ['住宅負担', '通勤', '保育', '学校', '公園', '買物', '消防・防災', 'ライフライン', '雇用', '医療', '治安', '環境', '文化・スポーツ', '福祉'];
/** 住宅ごとの水準 sv の並び */
export const SV = { care: 0, school: 1, park: 2, fire: 3, shop: 4, commute: 5, life: 6, health: 7, safety: 8, env: 9, culture: 10, welfare: 11 } as const;
export const SV_NAMES = ['保育の利用', '学校', '公園', '消防・防災', '買物', '通勤', 'ライフライン', '医療', '治安', '環境（空気）', '文化・スポーツ', '福祉'];

/** 任期の目標（公約）の候補。target(s) は選んだときの状態から決める目標値、value(s) はいまの値、ok は達成か */
export interface GoalDef { id: string; name: string; diff: number; desc: (t: number) => string; target: (s: any) => number; value: (s: any) => number; lower?: boolean; unit: string }
const r10 = (v: number) => Math.round(v / 10) * 10;
// v86：人口の公約を 1.08 → 1.15 倍、大きく増やすを 1.18 → 1.3 倍に。v85 では何もしなくても住野市は 4 年で 1.16 倍になり、公約の意味がなかった
export const GOALS: GoalDef[] = [
  { id: 'wait', name: '待機児童をなくす', diff: 2, unit: '人', lower: true, desc: t => `保育の待機を ${t} 人以下に`, target: () => P.pledgeWait, value: s => s.stats.waitlist },
  { id: 'pop', name: '人口を増やす', diff: 2, unit: '人', desc: t => `人口を ${t.toLocaleString()} 人以上に（いまの 1.15 倍）`, target: s => r10(s.stats.pop * 1.15), value: s => s.stats.pop },
  { id: 'popBig', name: '人口を大きく増やす', diff: 3, unit: '人', desc: t => `人口を ${t.toLocaleString()} 人以上に（いまの 1.3 倍）`, target: s => r10(s.stats.pop * 1.3), value: s => s.stats.pop },
  { id: 'traffic', name: '渋滞を減らす', diff: 2, unit: '%', lower: true, desc: t => `朝の最大混雑率を ${t}% 以下に`, target: () => Math.round(P.pledgeVc * 100), value: s => Math.round(s.stats.maxVc * 100) },
  { id: 'fiscal', name: '財政を立て直す', diff: 1, unit: '万円/月', desc: () => '直近 12 か月の収支の平均が 0 以上（赤字の月があっても平均が 0 以上ならよい）で、一時借入の残高がない', target: () => 0, value: s => { const L = s.ledger.slice(-12); const op = L.length ? L.reduce((a: number, l: any) => a + l.operating, 0) / L.length : -1; return s.loans.some((l: any) => l.kind === 'temp' && l.remaining > 0) ? Math.min(op, -1) : op; } }, // 記録が 1 か月もないうちは「評価待ち」（達成にしない。step.ts の fiscalWatch）
  { id: 'water', name: '水道をよみがえらせる', diff: 1, unit: '', lower: true, desc: () => 'すべての浄水場の老朽度を 40 以下に', target: () => 40, value: s => { const w = s.buildings.filter((b: any) => DEFS[b.kind as Kind].fam === 'water' && b.status !== 'construction'); return w.length ? Math.max(...w.map((b: any) => b.age)) : 100; } },
  { id: 'env', name: '環境にやさしい街', diff: 2, unit: '%', desc: t => `空気の水準を ${t}% 以上にし、再生可能エネルギー（メガソーラー）を 1 か所以上`, target: (s: any) => Math.max(88, Math.min(96, Math.round(s.stats.lv[3] * 100) + 4)), value: s => (s.buildings.some((b: any) => b.kind === 'solar' && b.status === 'operating') ? Math.round(s.stats.lv[3] * 100) : Math.min(87, Math.round(s.stats.lv[3] * 100))) },
  { id: 'safe', name: '安心・安全の街', diff: 2, unit: '%', desc: t => `治安と防災の水準を ${t}% 以上に`, target: (s: any) => Math.max(78, Math.min(95, Math.round(Math.min(s.stats.lv[2], s.stats.lv[7]) * 100) + 5)), value: s => Math.round(Math.min(s.stats.lv[2], s.stats.lv[7]) * 100) },
  { id: 'kids', name: '子育てしやすい街', diff: 2, unit: '%', desc: t => `子育て世帯（未就学・就学）の満足度を ${t}% 以上に`, target: s => Math.max(72, Math.round(Math.min(s.stats.satType[2], s.stats.satType[3]) * 100) + 4), value: s => Math.round(Math.min(s.stats.satType[2], s.stats.satType[3]) * 100) },
  { id: 'senior', name: '高齢者が暮らしやすい街', diff: 2, unit: '%', desc: t => `高齢世帯の満足度を ${t}% 以上に`, target: s => Math.max(72, Math.round(s.stats.satType[4] * 100) + 4), value: s => Math.round(s.stats.satType[4] * 100) },
  { id: 'jobs', name: '働く場所をつくる', diff: 2, unit: '人', desc: t => `市内の職を ${t.toLocaleString()} 人以上に`, target: s => r10(s.stats.localJobs + 350 * Math.max(1, s.stats.pop / 6000)), value: s => s.stats.localJobs },
  { id: 'tour', name: '観光で人を呼ぶ', diff: 3, unit: '人/月', desc: t => `来訪者を月 ${t.toLocaleString()} 人以上に`, target: s => r10(Math.max(6000, s.stats.visitors * 1.5 + 4000)), value: s => s.stats.visitors },
  { id: 'edu', name: '教育の充実', diff: 2, unit: '%', desc: t => `教育の水準を ${t}% 以上に（小・中学校の定員と図書館）`, target: (s: any) => Math.max(85, Math.min(98, Math.round(s.stats.lv[6] * 100) + 4)), value: s => Math.round(s.stats.lv[6] * 100) },
  { id: 'health', name: '医療と福祉の充実', diff: 2, unit: '%', desc: t => `医療と福祉の水準を ${t}% 以上に`, target: (s: any) => Math.max(75, Math.min(95, Math.round(Math.min(s.stats.lv[1], s.stats.lv[5]) * 100) + 5)), value: s => Math.round(Math.min(s.stats.lv[1], s.stats.lv[5]) * 100) },
  { id: 'taxcut', name: '住民税を下げる', diff: 3, unit: '%', lower: true, desc: () => '住民税を標準より 5% 以上下げ、収支は黒字に', target: () => 95, value: s => { const L = s.ledger.slice(-6); const op = L.length ? L.reduce((a: number, l: any) => a + l.operating, 0) / L.length : 0; return op < 0 ? 100 : Math.round(s.tax.res * 100); } },
];
/** 中長期のビジョン（3 期 12 年）。指標の平均で評価する */
export interface VisionDef { id: string; name: string; desc: string; goals: string[] }
/** ビジョンの特典：選んだ街にずっと効く効果（perk）と、専用施設が動いているときに足される効果（kind / kindFx）。text は画面の説明 */
export interface VisionPerk { mul: Record<string, number>; add: Record<string, number>; kind: Kind; kindMul: Record<string, number>; kindAdd: Record<string, number>; text: string; kindText: string }
export const VISION_PERKS: Record<string, VisionPerk> = {
  family: { mul: { 'hire:保育士': 1.3, inflow: 1.04 }, add: { 'sat:2': 0.02, 'sat:3': 0.015 }, kind: 'kodomoMirai', kindMul: { inflow: 1.04 }, kindAdd: { 'sat:2': 0.02, 'sat:3': 0.02 },
    text: '保育士の採用が 3 割速い・子育て世帯の満足 +2%・転入 +4%', kindText: 'こども未来館：子育て世帯の満足がさらに +2%・転入 +4%' },
  green: { mul: { factoryClean: 0.85, powerCap: 1.05 }, add: { 'sat:all': 0.005 }, kind: 'ecoCenter', kindMul: { factoryClean: 0.8 }, kindAdd: { 'sat:all': 0.008 },
    text: '工場の排出 15% 減・電力の余力 +5%・満足 +0.5%', kindText: 'エコパーク：工場の排出がさらに 20% 減・満足 +0.8%' },
  tourism: { mul: { visitors: 1.15 }, add: { fame: 5 }, kind: 'kankoDmo', kindMul: { visitors: 1.2, furusato: 1.2 }, kindAdd: { fame: 4 },
    text: '来訪者 +15%・知名度 +5', kindText: 'DMO：来訪者がさらに +20%・ふるさと納税 +20%・知名度 +4' },
  industry: { mul: { econ: 1.03 }, add: { bizIncentive: 0.1 }, kind: 'incubator', kindMul: { econ: 1.03 }, kindAdd: { bizIncentive: 0.1 },
    text: '企業が来やすい（誘致の見込み +10 点）・税収 +3%', kindText: '産業支援センター：誘致の見込みがさらに +10 点・税収 +3%' },
  safe: { mul: { disasterDmg: 0.8, prep: 1.15 }, add: { safety: 0.05, health: 0.02 }, kind: 'bosaiCenter', kindMul: { disasterDmg: 0.7, prep: 1.2 }, kindAdd: { safety: 0.05, health: 0.02 },
    text: '災害の被害 2 割減・避難所 +15%・治安と医療の水準が上がる', kindText: '総合防災センター：災害の被害がさらに 3 割減・避難所 +20%・治安と医療がさらに上がる' },
  sound: { mul: { prices: 0.96, costMul: 0.95 }, add: {}, kind: 'dxCenter', kindMul: { prices: 0.95 }, kindAdd: { 'sat:all': 0.004 },
    text: '行政と施設の費用 4% 減・建設費 5% 減', kindText: '行政 DX：費用がさらに 5% 減・手続きが楽になり満足 +0.4%' },
};
export const VISIONS: VisionDef[] = [
  { id: 'family', name: '子育て日本一の街', desc: '保育・教育・公園を充実させ、子育て世帯が住み続けられる街に。', goals: ['wait', 'kids', 'edu'] },
  { id: 'green', name: '環境先進都市', desc: '空気がきれいで、再生可能エネルギーと緑の多い街に。', goals: ['env', 'traffic', 'water'] },
  { id: 'tourism', name: '観光・文化の街', desc: 'ランドマークと文化施設で、人が訪れる街に。', goals: ['tour', 'jobs', 'pop'] },
  { id: 'industry', name: '産業と雇用の街', desc: '企業を誘致し、市内で働ける街に。', goals: ['jobs', 'pop', 'fiscal'] },
  { id: 'safe', name: '安心・安全で長く住める街', desc: '防災・治安・医療・福祉を備え、高齢になっても暮らせる街に。', goals: ['safe', 'health', 'senior'] },
  { id: 'sound', name: '健全財政の街', desc: '借金を減らし、税を軽くしても回る街に。', goals: ['fiscal', 'taxcut', 'water'] },
];
/** 難易度。vote は得票への加算、luck は当日の風向きの大きさ、events はできごとの起きやすさ、transfer は国・県からの収入、cost は建設費、crisis は財政危機になる一時借入の上限、appr は支持率の目標への加算 */
export type Difficulty = 'easy' | 'normal' | 'hard';
export const DIFFS: Record<Difficulty, { name: string; desc: string; vote: number; luck: number; events: number; transfer: number; cost: number; crisis: number; appr: number }> = {
  easy: { name: 'やさしい', desc: '再選しやすく、できごとが少なめ。国の交付金が多く、建設費も 2 割安い。街づくりをのんびり楽しみたい人に', vote: 7, luck: 0.6, events: 0.5, transfer: 1.12, cost: 0.8, crisis: 2, appr: 0.05 },
  normal: { name: 'ふつう', desc: '公約と暮らしの満足をそこそこ上げれば再選できる。できごとは標準', vote: 2, luck: 0.85, events: 0.8, transfer: 1.04, cost: 1, crisis: 1.3, appr: 0.02 },
  hard: { name: 'むずかしい', desc: '対立候補が強く、できごとも多い。財政にも余裕がない', vote: -1, luck: 1, events: 1.1, transfer: 0.97, cost: 1.1, crisis: 1, appr: 0 },
};
export const diffOf = (s: { difficulty?: Difficulty }) => DIFFS[s.difficulty ?? 'normal'] ?? DIFFS.normal;
/** プロスポーツ。venue は本拠地にできる施設（先頭ほど良い）。cost は設立・誘致の出資、support は市の毎月の支援、league はリーグのチーム数 */
export const SPORTS: Record<'soccer' | 'baseball' | 'basket', { name: string; league: string; venue: Kind[]; cost: number; support: number; fameReq: number; jobs: number; bizTax: number; visitors: number; fame: number; size: number; suffix: (b: string) => string; desc: string }> = {
  soccer: { name: 'サッカー', league: 'プロサッカーリーグ', venue: ['stadium'], cost: 5000, support: 120, fameReq: 15, jobs: 60, bizTax: 25, visitors: 8000, fame: 6, size: 20, suffix: b => `FC ${b}`, desc: 'スタジアムを本拠地にするサッカーのクラブ。地元の企業と市が出資して設立します。' },
  baseball: { name: '野球', league: 'プロ野球', venue: ['ballpark', 'dome'], cost: 8000, support: 150, fameReq: 25, jobs: 120, bizTax: 50, visitors: 12000, fame: 8, size: 6, suffix: b => `${b}ブレイブス`, desc: '野球場を本拠地にする球団。親会社になる企業を誘致し、市も出資します。' },
  basket: { name: 'バスケットボール', league: 'プロバスケットボールリーグ', venue: ['arena', 'dome', 'gym'], cost: 2000, support: 50, fameReq: 8, jobs: 30, bizTax: 12, visitors: 3500, fame: 4, size: 18, suffix: b => `${b}サンダーズ`, desc: 'アリーナ（または体育館）を本拠地にするクラブ。体育館だと観客が少なめです。' },
};
/** 隣の市町（架空） */
export const NEIGHBOR_SEED: { name: string; trait: string; pop: number; appeal: number; tax: number }[] = [
  { name: '東野市', trait: '大型商業施設が多いベッドタウン', pop: 82000, appeal: 0.62, tax: 1.0 },
  { name: '北川町', trait: '工業団地と田園の町', pop: 24000, appeal: 0.55, tax: 0.97 },
  { name: '南浜市', trait: '港と観光の市', pop: 140000, appeal: 0.66, tax: 1.03 },
];

// ---- 地図ごとの調整 ----
// 架空の街の値を覚えておき、地図を選ぶたびに戻してから、実在都市の調整（ゲーム用の仮定）を掛ける
const BASE = structuredClone({ P, DEFS, PLEDGES });
onMapChange(() => {
  for (const k of Object.keys(BASE.P)) (P as any)[k] = structuredClone((BASE.P as any)[k]);
  for (const k of Object.keys(BASE.DEFS) as Kind[]) { for (const f of Object.keys(DEFS[k])) if (!(f in BASE.DEFS[k])) delete (DEFS[k] as any)[f]; Object.assign(DEFS[k], structuredClone(BASE.DEFS[k])); }
  BASE.PLEDGES.forEach((p, i) => Object.assign(PLEDGES[i], p));
  W = REAL ? REAL.W : FIC_W; H = REAL ? REAL.H : FIC_H;
  SCALE = REAL ? Math.max(1, REAL.lots.reduce((a, l) => a + (l[0] <= 2 ? l[3] : 0), 0) / 2300) : 1;
  if (!REAL) return;

  const k = SCALE;
  if (REAL.deformed) {
    // まちづくり版：架空の街と同じ遊び方（空き地を開発して育てる）。予算と規模だけ街の大きさに合わせる
    P.startCash = Math.round(P.startCash * k * 1.5 / 100) * 100;
    P.baseInflow = P.baseInflow.map(v => v * k);
    P.transferBase = P.transferBase * k + 1950 * 1.3 * k; P.adminBase *= k; // 既存の施設が多い街なので、交付金をやや多めに（ゲーム用の調整。v85 の「基礎分 × 2.3」と同じ上乗せ額）
    P.bondLimit = Math.round(P.bondLimit * k / 1000) * 1000; P.bondUnit = Math.round(P.bondUnit * k / 1000) * 1000; P.tempLimit = Math.round(P.tempLimit * k / 1000) * 1000;
    for (const d of Object.values(DEFS)) if (d.hire) d.hire = Math.round(d.hire * Math.max(1, k * 0.7) * 10) / 10;
    P.throughTraffic = Math.round(P.throughTraffic * k);
    P.roadUpkeep = P.roadUpkeep.map(v => v * 0.5); // 既にある幹線道路が多いので、道路の維持費は半分に（ゲーム用の調整）
    P.pledgeWait = Math.max(10, Math.round(k * 5)); PLEDGES[0].text = `保育の待機児童を ${P.pledgeWait} 人以下にする`;
    P.pledgeVc = 1.3; PLEDGES[2].text = '通勤時間帯の最大混雑率を 130% 以下にする';
    Object.assign(DEFS.station, { cost: 30000, months: 18, note: '鉄道事業者の駅。まちづくり版では、市が費用を負担して新しい駅をつくってもらえます（請願駅）。線路に面していないと使えません。' });
    DEFS.water.capacity = Math.round(DEFS.water.capacity * k * 1.4 / 100) * 100; DEFS.waste.capacity = Math.round(DEFS.waste.capacity * k * 1.4 / 100) * 100;
    P.voteCenter = 0.636; // 既成市街地は医療・治安・教育の水準が架空の街より低めに出るので、得票の基準もそれに合わせる（ゲーム用の調整）
    const t = mapEntry(MAP_ID.replace(/-d$/, ''))?.tune; if (t?.carShare) P.carShare = t.carShare;
    return;
  }
  P.startCash = Math.round(P.startCash * k / 100) * 100;
  P.baseInflow = P.baseInflow.map(v => v * k * 0.55); // 既成市街地は人口がほぼ横ばい。転出と釣り合う程度の転入
  P.voteCenter = 0.596;
  for (const d of Object.values(DEFS)) if (d.hire) d.hire = Math.round(d.hire * k * 10) / 10; // 採用できる人数も街の大きさに合わせる
  P.pledgeWait = Math.max(20, Math.round(k * 4 / 10) * 10); P.pledgeVc = 1.5; // 街の規模に合わせた公約（保土ケ谷で 100 人）
  PLEDGES[0].text = `保育の待機児童を ${P.pledgeWait} 人以下にする`; PLEDGES[2].text = '通勤時間帯の最大混雑率を 150% 以下にする';
  P.transferBase *= k; P.adminBase *= k;
  P.bondLimit = Math.round(P.bondLimit * k / 1000) * 1000; P.bondUnit = Math.round(P.bondUnit * k / 1000) * 1000; P.tempLimit = Math.round(P.tempLimit * k / 1000) * 1000;
  P.throughTraffic = 900;
  // 首都圏の住宅地は鉄道・バス通勤が多く、駅へは歩きかバスが中心（ゲーム用の仮定。地図ごとに registry の tune で変える）
  P.carShare = 0.2; P.railCarShare = 0.15; P.shopTrip = 0.03;
  P.roadCap = [0, 400, 1100, 1800];
  P.adminPerCapita = 1.01; // v86：1.1 から高齢者の福祉の分（elderCost）を分けた
  // OSM に載っていない園があるため、私立園 1 か所の定員を大きめにとる
  DEFS.privNursery.capacity = 110;
  P.careRange = 40;               // 保育園の送迎圏を 1.2km に（坂の多い住宅地で自転車・車の送迎を見込む）
  // 実際には地図にない小さな店も多いので、買物支出の市内比率と小さな店の固定費を調整
  P.retailShare = 0.25; DEFS.bakery.fixed = 110; DEFS.shop.fixed = 220;
  P.mansionStationRange = 25;
  Object.assign(DEFS.water, { name: '浄水場', note: '市の水道局が運営する浄水・配水の拠点。Phase 1 の計算では処理能力と道路接続だけを見ます（管路は扱いません）。', cost: 300000, upkeep: 4000, renewCost: 180000, renewMonths: 18, months: 30, staffReq: 30, hire: 3, capacity: Math.round(k * 2300 * 1.25 / 1000) * 1000 }); // 能力は街の戸数の 1.25 倍（ゲーム用）
  Object.assign(DEFS.waste, { name: 'ごみ処理工場', note: '市の資源循環局が運営する焼却工場。収集を含めて処理能力だけで判定します（簡略化）。', cost: 120000, upkeep: 2500, renewCost: 60000, renewMonths: 12, months: 24, staffReq: 30, hire: 3, capacity: Math.round(k * 2300 * 1.25 / 1000) * 1000 });
  DEFS.station.note = '鉄道事業者の駅。市外との行き来の拠点で、市は協議しかできません（地下鉄は市交通局ですが、Phase 1 では同じ扱い）。';
  // 地図ごとの係数（車の分担率など）
  Object.assign(P, mapEntry(MAP_ID)?.tune ?? {});
});
