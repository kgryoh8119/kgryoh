// ゲーム状態の型。GameState が唯一の正で、JSON にそのまま保存できる値だけを持つ。

export const HH_KEYS = ['single', 'couple', 'famYoung', 'famSchool', 'senior'] as const;
export const HH_NAMES = ['単身', '夫婦のみ', '子育て（未就学）', '子育て（就学）', '高齢'] as const;
export const NHH = 5;

import { REAL, onMapChange } from './real';
/** 地区名（4 つ）。地図を選ぶと変わる */
export let DISTRICTS: readonly string[] = [];
onMapChange(() => { DISTRICTS = REAL ? REAL.districts.map(d => d.name) : ['駅前', '本町', '丘陵台', '西新町', '東台', '南原', '東野', '新田']; });

/** 0 なし / 1 低層住宅 / 2 中層住宅 / 3 高層住宅 / 4 商業 */
export type Zone = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export const ZONE_NAMES = ['指定なし', '低層住宅', '中層住宅', '高層住宅', '商業', '業務（オフィス）', '工業'] as const;

/** 0 なし / 1 生活道路（市道） / 2 幹線道路（市道） / 3 国道（国管理） */
export type Road = 0 | 1 | 2 | 3;
export const ROAD_NAMES = ['', '生活道路', '幹線道路', '国道'] as const;

export type Kind =
  | 'house' | 'apartment' | 'mansion'
  | 'bakery' | 'shop' | 'supermarket'
  | 'nursery' | 'privNursery' | 'school' | 'park' | 'fire' | 'water' | 'waste'
  | 'station' | 'clinic' | 'koban'
  // v5：施設の種類とサイズ違い
  | 'nurseryS' | 'nurseryL' | 'jhs' | 'highschool' | 'parkM' | 'parkL' | 'fireS' | 'fireL'
  | 'waterS' | 'waterL' | 'sewageS' | 'sewage' | 'wasteL' | 'solar' | 'substation' | 'gas'
  | 'police' | 'hospital' | 'libraryS' | 'library' | 'gym' | 'hall' | 'museum' | 'tower' | 'stadium'
  | 'elderly' | 'carePlaza' | 'shelter' | 'basin'
  | 'office' | 'factory' | 'logistics' | 'datacenter' | 'hotel' | 'themepark'
  // v6：交通・官公庁・医療・大型施設・レジャー・自然と農業
  | 'airport' | 'port' | 'ic' | 'busTerminal'
  | 'cityHall' | 'branchOffice' | 'govOffice' | 'court'
  | 'univHospital' | 'nightClinic' | 'university' | 'convention' | 'arena'
  | 'mall' | 'cinema' | 'onsen' | 'aquarium' | 'zoo' | 'golf' | 'camp' | 'michinoeki'
  | 'farm' | 'allotment' | 'forestPark' | 'riverPark' | 'biotope'
  // v7：自然・交通・産業・暮らし
  | 'officeS' | 'officeM' | 'smallFactory' | 'hqTower'
  | 'radioTower' | 'fiberHub' | 'evStation' | 'smartSignal' | 'autoBusDepot' | 'ioDatacenter' | 'vertiport' | 'cityOS' | 'fusion'
  | 'ballpark' | 'beach' | 'hotSpring' | 'flowerPark' | 'tameike' | 'lrt' | 'parkingLot' | 'industrialPark' | 'lab' | 'fishPort' | 'tourFarm' | 'recycleCenter' | 'cellTower' | 'telecomHub' | 'lngTerminal' | 'desalination'
  | 'hydrogenStation' | 'droneHub' | 'mobilityHub' | 'gridBattery' | 'perovskite' | 'offshoreWind' | 'smr' | 'logiTunnel' | 'spaceSolar' | 'spaceElevator'
  | 'slDepot' | 'waterBus' | 'cruisePier' | 'yakatabune'
  | 'megaFloat' | 'undergroundCity' | 'skyGarden' | 'verticalFarm' | 'orbitalHotel' | 'moonBase' | 'aiDataCity' | 'robotDistrict' | 'metaverseHall'
  | 'jizodo' | 'hokora' | 'mosque' | 'synagogue' | 'hinduTemple' | 'monastery' | 'shinshukyo' | 'chonaikaikan' | 'shobodan' | 'koshuToilet' | 'bosaiMusen'
  | 'observatoryDeck' | 'suspensionBridge' | 'waterfallTrail' | 'cave' | 'zipline' | 'athletic' | 'glamping' | 'autoCamp' | 'circuit' | 'kart' | 'horseClub' | 'skateRink' | 'skiJump' | 'rowing' | 'budokan' | 'sumoBeya' | 'nohgaku' | 'kabukiza' | 'yose' | 'smallTheater' | 'jazzClub' | 'artIsland' | 'railMuseum' | 'mangaMuseum' | 'hauntedHouse' | 'maze' | 'yagura' | 'mikoshiGura' | 'dashiKaikan' | 'monzenmachi' | 'shukubamachi' | 'onsenGai' | 'ashiyu' | 'kofun' | 'bukeYashiki' | 'sando'
  | 'pumpedHydro' | 'solarThermal' | 'tidalPower' | 'biogas' | 'rdf' | 'pylon' | 'districtHeat' | 'kyodoko' | 'gasHolder' | 'waterTower' | 'oilStockpile' | 'irrigation' | 'sabo' | 'yusuichi' | 'gaikaku' | 'haisuiki' | 'cableLanding' | 'satStation' | 'radioTelescope'
  | 'serviceArea' | 'parkingArea' | 'tollGate' | 'jct' | 'ventTower' | 'parkRide' | 'truckStation' | 'coinParking' | 'bikeParking' | 'shinkansen' | 'freightTerminal' | 'busDepot' | 'cableCar' | 'chairlift' | 'torokko' | 'ferryTerminal' | 'marina' | 'funadamari' | 'lock' | 'suimon' | 'hangar' | 'controlTower' | 'heliTour' | 'deliveryRobot' | 'airshipMast'
  | 'kencho' | 'zeimusho' | 'hellowork' | 'nenkin' | 'menkyo' | 'nyukan' | 'kensatsu' | 'kasai' | 'kochisho' | 'shonenin' | 'policeAcademy' | 'kidotai' | 'coastGuard' | 'kenekijo' | 'navyBase' | 'airBase' | 'radarSite' | 'ammoDepot' | 'gikai' | 'seisoJimusho' | 'doroJimusho' | 'yukisute' | 'suibo'
  | 'dental' | 'specialClinic' | 'psychHospital' | 'rehabHospital' | 'ryoyo' | 'hospice' | 'dialysis' | 'hokenjo' | 'bloodRoom' | 'pharmacy' | 'dayService' | 'shuro' | 'yogo' | 'boshi' | 'jisou' | 'houkatsu' | 'nokotsudo' | 'petCemetery'
  | 'privSchool' | 'intlSchool' | 'foreignSchool' | 'specialSchool' | 'teijisei' | 'kosen' | 'senmon' | 'tandai' | 'kunren' | 'kyoshujo' | 'accelerator' | 'natLab' | 'kishodai' | 'quakeObs' | 'histMuseum' | 'scienceMuseum' | 'bungakukan' | 'kominkan' | 'lifelong' | 'seishonen' | 'planetarium'
  | 'danchi' | 'newTown' | 'shataku' | 'studentDorm' | 'shareHouse' | 'sakouju' | 'yuryoRojin' | 'groupHome' | 'nagaya' | 'kominka' | 'besso' | 'nisetai' | 'hiraya' | 'garageHouse' | 'gatedTown' | 'tinyVillage' | 'kasetsu' | 'jiritsu'
  | 'electronics' | 'homeCenter' | 'furnitureStore' | 'bookstore' | 'reuseShop' | 'dollarShop' | 'discount' | 'warehouseClub' | 'carGoods' | 'dealer' | 'usedCar' | 'rentACar' | 'laundromat' | 'carWash' | 'autoRepair' | 'carInspect' | 'famiRes' | 'chainFood' | 'fastFood' | 'izakaya' | 'yataiMura' | 'jogaiMarket' | 'kojinten' | 'shinkin' | 'securities' | 'realEstate' | 'lawOffice' | 'pawnShop' | 'cleaning' | 'photoStudio' | 'petShop' | 'vet' | 'cramSchool' | 'lessonSchool' | 'karaokeBox' | 'bowling' | 'gameCenter' | 'mangaCafe' | 'mahjong' | 'battingCenter' | 'golfRange' | 'fishingPond' | 'sauna' | 'capsuleHotel' | 'minpaku' | 'loveHotel' | 'coworking'
  | 'chemPlant' | 'paperMill' | 'cementPlant' | 'glassWorks' | 'tirePlant' | 'textileMill' | 'aluminumPlant' | 'kiln' | 'cutlery' | 'furnitureShop' | 'foundry' | 'printPlant' | 'dairyPlant' | 'bottling' | 'medDevice' | 'aeroParts' | 'quarry' | 'gravelPit' | 'mine' | 'indWaste' | 'landfill' | 'nightSoil' | 'scrapYard' | 'carAuction' | 'cosmetics' | 'toyFactory'
  | 'poultry' | 'pigFarm' | 'beefRanch' | 'dairy' | 'horseFarm' | 'teaField' | 'orchard' | 'greenhouse' | 'plantFactory' | 'flowerFarm' | 'shiitake' | 'bamboo' | 'riceCenter' | 'compost' | 'sakeBrewery' | 'soyBrewery' | 'teaFactory' | 'aquaRaft' | 'landAqua' | 'fishFarm' | 'setNet' | 'fishProcess' | 'coldStorage' | 'sawmill' | 'timberMarket' | 'forestry' | 'ranchPark' | 'apiary' | 'wasabi' | 'saltField'
  | 'yokocho' | 'nightDistrict' | 'fuzokuDistrict' | 'carPlant' | 'heavyInd' | 'foodMaker' | 'zenecon' | 'tradingCo' | 'stockExch' | 'spaceport' | 'spaceVenture' | 'humanoidLab' | 'bizHotel' | 'luxuryHotel' | 'ryokan' | 'privHigh' | 'clubTeam' | 'arcade'
  // v12：企業・店のバリエーション、自衛隊
  | 'itPark' | 'gameStudio' | 'foodFactory' | 'pharma' | 'callCenter' | 'bankHq' | 'battery' | 'semicon'
  | 'konbini' | 'cafe' | 'drugstore'
  | 'sdfBase'
  // v13：発電所・山・レジャー・自動運転
  | 'nuclear' | 'lngPower' | 'coalPower' | 'windFarm' | 'hydro' | 'geothermal' | 'biomass'
  | 'ropeway' | 'dome' | 'liveHouse' | 'fitness' | 'robotaxi'
  // v15：寺社・城・葬祭・世界のいろいろな施設
  | 'shrine' | 'temple' | 'grandShrine' | 'church' | 'castle' | 'castleRuins' | 'crematorium' | 'funeralHall' | 'cemetery'
  | 'lighthouse' | 'observatory' | 'ferrisWheel' | 'racecourse' | 'botanical' | 'operaHouse' | 'market' | 'shipyard' | 'prison'
  | 'dam'
  // v17
  | 'weddingHall' | 'jidokan' | 'kidsPark' | 'amusementPark' | 'megaPark' | 'pool' | 'athletics' | 'rugby' | 'pachinko' | 'boatRace' | 'keirin' | 'japaneseGarden' | 'giantRobot' | 'robotFactory' | 'casino' | 'outletMall' | 'skiResort' | 'esportsArena' | 'skyscraper'
  | 'usBase' | 'oilField' | 'oilRefinery' | 'gasStation' | 'parkingTower' | 'ancientRuins' | 'towerMansion' | 'tsunamiTower' | 'tvStation' | 'megaBank' | 'globalIT'
  | 'railDepot' | 'maglevStation' | 'hyperloop' | 'consulate' | 'department' | 'futureTower' | 'expoSite' | 'redBrick' | 'westernHouse' | 'machiya' | 'clockTower' | 'ironTower' | 'windmill' | 'pyramidHall' | 'triumphGate' | 'autoHub'
  | 'kodomoMirai' | 'ecoCenter' | 'kankoDmo' | 'incubator' | 'bosaiCenter' | 'dxCenter'
  | 'musicArena' | 'brewery' | 'steelMill' | 'partsPlant' | 'defensePlant' | 'kindergarten' | 'salon' | 'maternity' | 'perinatal' | 'clubhouse' | 'postOffice' | 'paddy' | 'field' | 'heliport' | 'multicultural';

export type Status = 'construction' | 'operating' | 'suspended' | 'renewing';

export interface Building {
  id: number;
  kind: Kind;
  x: number; y: number; w: number; h: number;
  status: Status;
  /** 工事・更新工事の残り月数 */
  remain: number;
  /** 工期（進捗表示用） */
  total: number;
  builtMonth: number;
  /** 老朽度 0-100 */
  age: number;
  /** 見た目の乱数（計算には使わない） */
  v: number;
  sandbox?: boolean;
  /** 実在都市版：取り込んだ実際の建物で描く街区 */
  osm?: boolean;
  /** 実在都市版：施設の名前 */
  name?: string;
  // --- 住宅 ---
  units?: number;
  hh?: number[];
  // --- 施設 ---
  /** 増築のレベル（1〜3。なければ 1）。能力と維持費が上がる */
  lv?: number;
  /** 更新工事のかわりに増築工事をしている */
  upg?: boolean;
  /** 改修オプション（OPTIONS の id）と外観の様式（0 標準） */
  opts?: string[]; style?: number;
  /** 移設の工事中（終わっても職員と建った月を引き継ぐ） */
  moved?: boolean;
  /** 駅：駅ビルの拡張工事が終わる月（終わると lv が 1 上がる） */
  upAt?: number;
  /** 駅：新幹線の停車が始まる月（工事中は未来の月） */
  shin?: number;
  /** 誘致：交渉がまとまらず延びた回数 */
  tries?: number;
  staff?: number;
  staffTarget?: number;
  // --- 店舗 ---
  lossStreak?: number;
  // --- 再計算で作る値 ---
  acc: number;        // 接する道路タイル（なければ -1）
  connected: boolean; // 国道の市外接続点まで道路でつながるか
  effCap: number;
  used: number;
  revenue: number;    // 店舗の月売上（万円）
  shopP: number;      // 住宅：周辺店舗の集客力の合計（商圏計算用）
  sv: number[];       // 住宅：サービス水準 [保育,学校,公園,消防,買物,通勤]
  sat: number[];      // 住宅：類型別満足度
  unmet: number;      // 住宅：保育を利用できない児童数
}

export interface Modifier {
  key: string;
  op: 'mul' | 'add';
  v: number;
  /** この月になったら失効（-1 は無期限） */
  until: number;
  /** 有効な間の月額費用（万円） */
  cost: number;
  src: string;
}

export type Effect =
  | { t: 'cash'; v: number; label: string }
  | { t: 'mod'; key: string; op: 'mul' | 'add'; v: number; months: number; cost?: number; delay?: number }
  | { t: 'age'; kind: Kind; dv: number }
  | { t: 'renew'; kind: Kind }
  | { t: 'tempStaff'; n: number; months: number }
  | { t: 'closeShop'; prob: number }
  | { t: 'keepShop' }
  | { t: 'openStore'; kind: Kind; delay: number }
  | { t: 'expandPrivNursery'; add: number; delay: number }
  | { t: 'roadBoost'; v: number; delay: number }
  | { t: 'sat'; who: number[]; v: number; months: number; delay?: number }
  | { t: 'fame'; v: number }
  | { t: 'approval'; v: number }
  | { t: 'damage'; what: 'quake' | 'flood' | 'fire' | 'snow' | 'slide' | 'wind'; v: number }
  | { t: 'place'; kind: Kind }
  | { t: 'neighbor'; v: number }
  | { t: 'team'; sport: Sport }
  /** プロチームの人気と戦力を動かす（対象は競技の番号 0 サッカー・1 野球・2 バスケ）。remove でチームが去る */
  | { t: 'teamAdj'; fans?: number; power?: number; remove?: boolean }
  /** 災害からの復旧：傷んだ市道と市の施設の老朽度を戻す（v は 0〜1） */
  | { t: 'recover'; v: number; delay?: number }
  /** 新幹線の駅の整備を始める（対象は駅の建物 id。months 後に開業） */
  | { t: 'shin'; months: number };

export interface Scheduled { due: number; eff: Effect; target: number; src: string }

export interface EventInstance {
  id: string;
  start: number;
  /** 対象の建物 id や道路タイル（なければ -1） */
  target: number;
  detail: string;
}

/** 選択した時点の主な指標（あとで「選んだ時 → いま」を比べるため） */
export interface Snapshot { wait: number; maxVc: number; cash: number; op: number; sat: number[] }
export interface EventLog { id: string; month: number; title: string; choice: string; detail: string; before?: Snapshot }

export interface Loan { principal: number; remaining: number; rate: number; months: number; kind: 'bond' | 'temp' }

export interface Ledger {
  month: number;
  // 歳入
  taxResident: number; taxProperty: number; taxBusiness: number; transfer: number;
  /** 施設の収入（売電・入場料など）と宿泊税（v5。古い記録にはない） */
  fees?: number; taxStay?: number;
  // 経常歳出
  admin: number; upkeep: number; wages: number; subsidy: number; roads: number; policy: number; interest: number;
  // 資本的支出など（その月に行った操作を積む）
  capital: number; repay: number; borrowed: number; other: number;
  operating: number; // 経常収支
  /** 月初の現金（v1 の古いセーブにはない）。月末 = 月初 + 経常収支 − 返済 + 借入 − 資本的支出 − その他 */
  cashStart?: number;
  cashEnd: number;
}

export interface Voice {
  key: string;
  who: string;
  district: number; // -1 は市全体
  text: string;
  cause: string;
  layer: Layer;
  tile: number;
  tone: 'bad' | 'warn' | 'good';
}

export type Layer = 'none' | 'conn' | 'traffic' | 'care' | 'age' | 'life' | 'edu' | 'health' | 'safety' | 'env' | 'culture' | 'welfare' | 'disaster' | 'sat' | 'elev' | 'tsunami' | 'land' | 'bus';

export interface Stats {
  pop: number; households: number; units: number; vacancy: number; pentUp: number;
  hhByType: number[];
  popDistrict: number[];
  workers: number; localJobs: number;
  preschool: number; careDemand: number; careCap: number; careServed: number; waitlist: number;
  waitDistrict: number[];
  schoolKids: number; schoolCap: number;
  waterDemand: number; waterCap: number; wasteDemand: number; wasteCap: number;
  fireCover: number;
  maxVc: number; avgDelay: number;
  /** まちづくり版：いちばん混んでいる駅の利用率（利用者 ÷ 線路の能力）。0 は駅がない */
  railCrowd?: number;
  // ---- v5：暮らしの観点（世帯で重みづけた平均の水準 0〜1 と、需要・能力）----
  powerDemand: number; powerCap: number; sewageDemand: number; sewageCap: number; gasDemand: number; gasCap: number; telDemand?: number; telCap?: number;
  jhsKids: number; jhsCap: number;
  elderNeed: number; elderCap: number;
  /** 水準の平均 [ライフライン, 医療, 治安, 環境, 文化・スポーツ, 福祉, 教育, 防災] */
  lv: number[];
  /** 来訪者（人/月）・知名度（0〜100）・企業の職 */
  visitors: number; fame: number; bizJobs: number;
  /** 避難所・備蓄でまかなえる人数と、浸水のおそれのある世帯 */
  shelterCap: number; floodHH: number;
  /** 犯罪の起きやすさ（0〜1） */
  crime: number;
  shops: number; shopLevel: number;
  sat: number; satType: number[]; satDistrict: number[];
  /** 満足の内訳（SAT_PARTS の 14 項目の世帯平均）と、満点からの不足 × 重み（大きいほど満足を下げている） */
  satParts?: number[]; satDrag?: number[];
  renewal60: number;
  debt: number;
  // ---- v15：人の一生と社会の問題 ----
  /** 1 か月の死亡（人）と出生（人） */
  deaths?: number; births?: number; obstetric?: number; yudoShare?: number;
  /** 治療が必要な人（人）。医療が足りないと増える */
  sick?: number;
  /** 斎場（火葬場）の受け入れ（件/月）と、市内で見送れなかった割合（0〜1） */
  cremCap?: number; cremShort?: number;
  /** 高齢化率（高齢世帯の人 ÷ 人口） */
  aging?: number;
  /** 外国人住民（技能実習生・特定技能や永住の世帯・留学生・不法滞在の推計）と、支援の水準（0〜1） */
  foreign?: { total: number; trainee: number; skilled: number; student: number; undoc: number; support: number };
  /** ふるさと納税：寄付（万円/月）・返礼品と経費・市民がほかの市へ寄付して減った住民税 */
  furusato?: { gift: number; cost: number; loss: number };
  /** 迷惑施設の近くに住む世帯 */
  nimbyHH?: number;
  /** ひとり暮らしの高齢者で、見守り（福祉）が届いていない世帯 */
  lonely?: number;
}

export interface Pledge { id: string; text: string }

export interface ElectionResult {
  month: number; term: number; vote: number; win: boolean;
  support: number; pledgesKept: boolean[]; parts: { label: string; v: number }[];
  typeSupport: number[];
}

export interface GameState {
  version: number;
  seed: number;
  rng: number;
  month: number;
  term: number;
  termStart: number;
  termLength: number;
  mode: 'term' | 'sandbox';
  cityName: string;
  cash: number;
  loans: Loan[];
  road: number[];
  roadAge: number[];
  roadBoost: Record<string, number>;
  /** 山を抜けるトンネルの区画（道路があり、地形は急斜面や保全林）。古いセーブにはない */
  tunnel?: number[];
  /** 橋（川・水路の上の道路）・陸橋（踏切をなくした区画）・歩道橋（道路の区画）・水路（掘った運河の区画） */
  bridge?: number[]; overpass?: number[]; footbridge?: number[]; canal?: number[];
  /** 線引き：区画ごとに 0 市街化区域・1 市街化調整区域・2 居住誘導区域（立地適正化計画） */
  area?: number[];
  /** バス停の区画（道路）と、堤防の区画 */
  busStops?: number[]; levee?: number[];
  /** 道路の種類（v41）：並木道・石畳とカラー舗装・電線の地中化（無電柱）の区画 */
  streets?: { tree?: number[]; stone?: number[]; nopole?: number[]; charge?: number[] };
  /** 地形の造作：頂点ごとの標高の上げ下げ（m）、区画ごとの種類（TERRA_T）、変えた回数 */
  terraH?: number[]; terraT?: number[]; terraVer?: number;
  /** 6 車線に広げた幹線の区画 */
  wide?: number[];
  /** 立体交差にした交差点の区画（片方の道路が高架でまたぐ） */
  flyover?: number[];
  /** 誘致した航空路線（AIR_ROUTES の id）と、就航した月 */
  airRoutes?: { id: string; since: number }[];
  /** 景気（-1 不況〜1 好況）・為替（1 ドル何円）・金融危機の残り月数 */
  econ?: { cycle: number; fx: number; shock: number; macro?: import('./macro').Macro; threat?: import('./threats').Threats };
  /** 財政指標（地方公共団体財政健全化法）：実質公債費比率・将来負担比率と、健全化の段階 */
  fiscal?: { kosai: number; shorai: number; status: 'ok' | 'early' | 'rebuild'; since: number };
  /** 天気と暮らし：今月の降水量（mm）と平年比、水がめの貯水率（0〜1）、作柄（1 が平年）、大雪 */
  climate?: { rain: number; ratio: number; store: number; crop: number; snow: boolean };
  /** いちばん多かった人口とその月（街の記録） */
  peakPop?: number; peakMonth?: number;
  /** オートの都市計画：地区ごとの役割（cityplan.ts の ROLES の番号）と、つくった月 */
  plan?: { vision: string; roles: number[]; made: number };
  /** オートへの作戦：0 どんどん攻めろ／1 バランスよく／2 財布だいじに（autoplay.ts の AUTO_ORDERS）。無ければ 1 */
  autoOrder?: 0 | 1 | 2;
  /** 市長の初仕事（達成したミッション）と、数えはじめの値 */
  missions?: string[]; missionBase?: { roads: number; zoned: number; hh: number; shops: number; parks: number };
  /** お祝い（まつり・優勝パレード・人口の節目）。画面の演出に使う */
  celeb?: { kind: 'festival' | 'parade' | 'milestone'; month: number; label: string };
  /** 住民の不満の声が最初に届いた月（キーごと）と、解消した声へのお礼 */
  voiceSeen?: Record<string, { since: number; who: string; text: string }>;
  thanks?: { key: string; month: number; who: string; text: string; was: string; months: number }[];
  /** 街の終わり（人口が 0 になった）。この状態では時間が進まない */
  over?: { month: number; reason: string };
  /** 市長の成長：市長ポイント・勲章（受けた月）・全国ランキングの記録・編入できる残り回数・編入した数・見た印 */
  mayor?: { pts: number; medals: Record<string, number>; ranks: { year: number; month: number; total: number; cats: Record<string, number>; awards: string[]; pts?: number }[]; annex: number; annexed?: number; seenLv: number; seenRank: number };
  /** 姉妹都市（id・提携した月・関係の深さ 0〜1）と、交流をした月 */
  sisters?: { id: string; since: number; rel: number; last?: number }[];
  /** 市政（議会・選挙戦・メディア・国や県・行事・人口動態）。politics.ts の Pol */
  pol?: import('./politics').Pol;
  /** いちばん最近の津波（月と高さ m）。画面の演出とハザードの記録に使う */
  lastTsunami?: { m: number; h: number };
  /** 挑戦モード：id・始めた月・期限の月・基準の値・結果（勝ち・負け）とその月・結果を見た印 */
  challenge?: { id: string; start: number; until: number; base: number; done?: 'win' | 'lose'; at?: number; seen?: boolean };
  /** 市の区域（地図を 4×4 に分けた区域の番号）。ない街は全域が使える */
  unlocked?: number[];
  zone: number[];
  occ: number[];
  vc: number[];
  buildings: Building[];
  nextId: number;
  roadVersion: number;
  bVersion: number;
  policies: Record<string, { on: boolean; since: number }>;
  modifiers: Modifier[];
  scheduled: Scheduled[];
  events: { active: EventInstance[]; cooldown: Record<string, number>; log: EventLog[] };
  /** イベント条件用の連続月数カウンタ */
  streak: Record<string, number>;
  inflowFactor: number;
  pending: Ledger; // 今月ここまでの操作による支出
  ledger: Ledger[];
  stats: Stats;
  history: { month: number; pop: number; cash: number; sat: number; wait: number; op: number; maxVc: number }[];
  voices: Voice[];
  elections: ElectionResult[];
  pendingElection: ElectionResult | null;
  tutorial: { step: number; done: boolean };
  /** まちづくり版の線路（区画ごと。0 なし・1 単線・2 複線）と、市が敷いた区画（維持費の対象）。ほかの地図にはない */
  rail?: number[];
  railCity?: number[];
  /** まちづくり版の線路の高さ（区画ごと。0 地上・1 高架・2 地下）。道路と地上の線路が同じ区画にあれば踏切 */
  railGrade?: number[];
  /** 線の種類（v44）：0 ふつうの鉄道・1 モノレール（跨座式）・2 新交通システム（ゴムタイヤの無人運転）。どちらも高架 */
  railKind?: number[];
  // ---- v5 ----
  /** 市外からまかなっている能力（世帯相当）。電力会社の既存の変電所・流域下水道・既存のガス管。-1 は最初の再計算で決める */
  base: { power: number; sewage: number; gas: number; telecom?: number };
  /** 税率の倍率（1 が標準。住民税・固定資産税・法人の税）と宿泊税（0 なし・1 あり） */
  tax: { res: number; prop: number; biz: number; stay: number };
  /** 知名度（0〜100） */
  fame: number;
  /** 支持率（0〜1）と、その推移（直近） */
  approval: number;
  polls: number[];
  /** 任期の目標（公約）。選んだときの値 base と目標 target。diff は難しさ（1〜3） */
  goals: Goal[];
  /** 任期の初めに目標を選ぶ画面を出す */
  goalPick: boolean;
  /** 難易度（古いセーブにはない。ないときは「ふつう」） */
  difficulty?: 'easy' | 'normal' | 'hard';
  /** 中長期のビジョン（3 期 12 年）。null はまだ選んでいない */
  vision: string | null;
  visionStart: number;
  /** 隣の市町 */
  neighbors: Neighbor[];
  /** 視察・交流などの記録（id → 最後に行った月） */
  acts: Record<string, number>;
  /** 画面に知らせる短い知らせ（表示したら空にする） */
  notes: string[];
  /** お知らせの履歴（画面に出した知らせを残す。新しいものが後ろ）と、読んだところまでの数 */
  news?: { m: number; t: string; at?: number }[]; newsSeen?: number;
  /** プロスポーツチーム（古いセーブにはない） */
  teams?: Team[];
}

export interface Goal { id: string; base: number; target: number; diff: number }
export type Sport = 'soccer' | 'baseball' | 'basket';
/** プロスポーツチーム。fans は人気（0〜1）、rank は前のシーズンの順位（0 はまだ）、titles は優勝回数 */
export interface Team { sport: Sport; name: string; since: number; fans: number; rank: number; titles: number; /** 戦力（0〜1。古いセーブにはない＝0.35） */ power?: number }
export interface Neighbor { name: string; pop: number; appeal: number; tax: number; trait: string; rel: number }

/** 地形の造作の種類 */
export type TerraOp = 'raise' | 'lower' | 'flatten' | 'hill' | 'mountain' | 'valley' | 'cliff' | 'water' | 'fill' | 'forest' | 'clear' | 'wet' | 'sand' | 'desert' | 'snow' | 'reset';
export type Action =
  | { type: 'road'; tiles: number[]; road: 1 | 2 }
  | { type: 'unroad'; tiles: number[] }
  | { type: 'tunnel'; tiles: number[]; road: 1 | 2 }
  | { type: 'bridge'; tiles: number[]; road: 1 | 2 }
  | { type: 'overpass'; tiles: number[] }
  | { type: 'footbridge'; tiles: number[] }
  | { type: 'canal'; tiles: number[] }
  | { type: 'area'; tiles: number[]; v: 0 | 1 | 2 }
  | { type: 'busStop'; tiles: number[]; on: boolean }
  | { type: 'railKind'; tiles: number[]; kind: 0 | 1 | 2 }
  | { type: 'street'; tiles: number[]; style: 'tree' | 'stone' | 'nopole' | 'charge' | 'none' }
  | { type: 'levee'; tiles: number[] }
  | { type: 'terra'; tiles: number[]; op: TerraOp }
  | { type: 'widen'; tiles: number[]; on: boolean }
  | { type: 'flyover'; tiles: number[] }
  | { type: 'airportUp'; id: number }
  | { type: 'airRoute'; route: string; on: boolean }
  | { type: 'rail'; tiles: number[]; level: 1 | 2 | 3; grade?: 0 | 1 | 2 | 3 }
  | { type: 'railgrade'; tiles: number[]; grade: 0 | 1 | 2 | 3 }
  | { type: 'unrail'; tiles: number[] }
  | { type: 'repair'; tiles: number[] }
  | { type: 'zone'; tiles: number[]; zone: Zone }
  | { type: 'build'; kind: Kind; x: number; y: number }
  | { type: 'demolish'; id: number }
  | { type: 'renew'; id: number }
  | { type: 'staff'; id: number; n: number }
  | { type: 'suspend'; id: number }
  | { type: 'policy'; id: string; on: boolean }
  | { type: 'borrow'; amount: number }
  | { type: 'repayTemp'; amount?: number }
  | { type: 'stationUp'; id: number; what: 'bldg' | 'shin' }
  | { type: 'event'; id: string; option: number }
  | { type: 'sandboxPlace'; kind: Kind; x: number; y: number }
  | { type: 'upgrade'; id: number }
  | { type: 'buyout'; id: number }
  | { type: 'tax'; key: 'res' | 'prop' | 'biz' | 'stay'; v: number }
  | { type: 'goals'; ids: string[]; vision?: string }
  | { type: 'civic'; id: string }
  | { type: 'rerun' }
  | { type: 'team'; sport: Sport; on: boolean }
  | { type: 'difficulty'; v: 'easy' | 'normal' | 'hard' }
  | { type: 'annex'; block: number }
  | { type: 'option'; id: number; opt: string; on: boolean }
  | { type: 'style'; id: number; v: number }
  | { type: 'expand'; id: number }
  | { type: 'move'; id: number; x: number; y: number }
  | { type: 'challenge'; id: string }
  | { type: 'sister'; id: string; act: 'join' | 'student' | 'trade' | 'culture' | 'end' }
  | import('./politics').PolAct;

export interface Result { ok: boolean; msg: string; cost?: number }
