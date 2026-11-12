// 日本と世界の経済（v41）：物価・金利（日銀の政策金利）・日経平均・海外の戦争・業種ごとの調子・1 次〜3 次産業の割合。
// 乱数の並び（rngNext）は使わず、地図の種と月から決める（ほかの計算の結果を変えないため）。
import type { GameState, Kind } from './types';
import { DEFS } from './config';

const h01 = (a: number) => { const v = Math.sin(a) * 43758.5453; return v - Math.floor(v); };
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** 業種（東証の業種をまとめたもの）。市内の企業はどれかに入り、業種の調子が法人の税に効く */
export type Sector = 'auto' | 'food' | 'machine' | 'construct' | 'trading' | 'elec' | 'bank' | 'realty' | 'retail' | 'it' | 'pharma' | 'material' | 'energy' | 'transport' | 'service' | 'defense' | 'space' | 'agri';
export const SECTORS: { id: Sector; name: string; why: string; k: { cyc: number; fx: number; rate: number; war: number; cpi: number } }[] = [
  { id: 'auto', name: '輸送用機器（自動車）', why: '円安と好況で伸び、戦争で部品が止まると落ちます', k: { cyc: 0.09, fx: 0.5, rate: -0.02, war: -0.05, cpi: 0 } },
  { id: 'machine', name: '機械・重工', why: '設備投資の波に乗り、防衛と円安で伸びます', k: { cyc: 0.08, fx: 0.3, rate: -0.02, war: 0.06, cpi: 0 } },
  { id: 'elec', name: '電気機器・半導体', why: '景気の波に最も敏感。円安で伸びます', k: { cyc: 0.11, fx: 0.4, rate: -0.03, war: -0.02, cpi: 0 } },
  { id: 'material', name: '鉄鋼・化学・素材', why: '景気と資源の値段しだい', k: { cyc: 0.09, fx: 0.2, rate: -0.01, war: 0.03, cpi: 0.01 } },
  { id: 'food', name: '食料品', why: '景気に強い。円安と物価高で原料が値上がりすると苦しい', k: { cyc: 0.02, fx: -0.2, rate: 0, war: -0.05, cpi: -0.015 } },
  { id: 'pharma', name: '医薬品', why: '景気に左右されにくく、海外売上は円安で増えます', k: { cyc: 0.01, fx: 0.15, rate: -0.01, war: 0, cpi: 0 } },
  { id: 'construct', name: '建設（ゼネコン）', why: '公共事業と再開発で伸び、金利と資材の値上がりに弱い', k: { cyc: 0.05, fx: -0.05, rate: -0.05, war: -0.03, cpi: -0.02 } },
  { id: 'realty', name: '不動産', why: '低金利で伸び、利上げで冷えます', k: { cyc: 0.06, fx: 0.05, rate: -0.09, war: -0.02, cpi: 0 } },
  { id: 'trading', name: '卸売（総合商社）', why: '資源の値上がりと円安で利益が出ます（戦争のときも）', k: { cyc: 0.04, fx: 0.25, rate: 0, war: 0.08, cpi: 0.01 } },
  { id: 'bank', name: '銀行・証券', why: '金利が上がると利ざやが増えます', k: { cyc: 0.04, fx: 0, rate: 0.07, war: -0.02, cpi: 0 } },
  { id: 'retail', name: '小売', why: '暮らしの景気しだい。物価高で節約されると落ちます', k: { cyc: 0.05, fx: -0.1, rate: -0.01, war: -0.02, cpi: -0.02 } },
  { id: 'it', name: '情報・通信', why: '成長が続き、利上げに少し弱い', k: { cyc: 0.06, fx: 0, rate: -0.04, war: 0, cpi: 0 } },
  { id: 'energy', name: '電力・ガス・石油', why: '燃料を輸入するので、円安と戦争で苦しくなります', k: { cyc: 0.01, fx: -0.3, rate: -0.01, war: -0.06, cpi: 0 } },
  { id: 'transport', name: '陸運・空運・物流', why: '人と物の動きしだい。燃料の値上がりに弱い', k: { cyc: 0.05, fx: -0.05, rate: -0.01, war: -0.04, cpi: -0.01 } },
  { id: 'service', name: 'サービス（ホテル・娯楽・夜の街）', why: '景気と観光客しだい。円安で外国人観光客が増えます', k: { cyc: 0.07, fx: 0.3, rate: -0.01, war: -0.03, cpi: -0.01 } },
  { id: 'defense', name: '防衛', why: '世界が不安定になると国の予算が増えます', k: { cyc: 0, fx: 0.05, rate: 0, war: 0.25, cpi: 0 } },
  { id: 'space', name: '宇宙', why: '国の計画と民間の投資で伸びる新しい産業', k: { cyc: 0.04, fx: 0.1, rate: -0.03, war: 0.05, cpi: 0 } },
  { id: 'agri', name: '水産・農林', why: '作柄しだい。物価高で値段は上がります', k: { cyc: 0, fx: -0.05, rate: 0, war: 0.02, cpi: 0.01 } },
];
const SEC_OF: Partial<Record<Kind, Sector>> = {};
const put = (s: Sector, ks: string[]) => { for (const k of ks) if ((DEFS as any)[k]) SEC_OF[k as Kind] = s; };
put('auto', ['factory', 'partsPlant', 'battery', 'carPlant', 'autoHub']);
put('machine', ['robotFactory', 'shipyard', 'heavyInd', 'humanoidLab', 'smallFactory']);
put('elec', ['semicon', 'datacenter', 'ioDatacenter', 'lab']);
put('material', ['steelMill', 'industrialPark', 'oilRefinery']);
put('food', ['foodFactory', 'brewery', 'market', 'sakeBrewery', 'soyBrewery', 'teaFactory', 'fishProcess', 'ranchPark']);
put('pharma', ['pharma']);
put('construct', ['zenecon']);
put('trading', ['tradingCo', 'port']);
put('bank', ['bankHq', 'megaBank', 'stockExch']);
put('it', ['itPark', 'gameStudio', 'globalIT', 'callCenter', 'office', 'officeS', 'officeM', 'hqTower', 'tvStation']);
put('energy', ['oilField', 'gasStation']);
put('transport', ['logistics', 'robotaxi', 'busTerminal']);
put('service', ['hotel', 'bizHotel', 'luxuryHotel', 'ryokan', 'mall', 'outletMall', 'department', 'cinema', 'pachinko', 'casino', 'yokocho', 'nightDistrict', 'fuzokuDistrict', 'weddingHall', 'liveHouse', 'fitness', 'onsen', 'amusementPark', 'themepark', 'megaPark']);
put('defense', ['defensePlant']);
put('service', ['electronics', 'homeCenter', 'furnitureStore', 'bookstore', 'reuseShop', 'dollarShop', 'discount', 'warehouseClub', 'carGoods', 'dealer', 'usedCar', 'rentACar', 'laundromat', 'carWash', 'autoRepair', 'famiRes', 'chainFood', 'fastFood', 'izakaya', 'yataiMura', 'jogaiMarket', 'kojinten', 'realEstate', 'lawOffice', 'pawnShop', 'cleaning', 'photoStudio', 'petShop', 'vet', 'cramSchool', 'lessonSchool', 'karaokeBox', 'bowling', 'gameCenter', 'mangaCafe', 'mahjong', 'battingCenter', 'golfRange', 'fishingPond', 'sauna', 'capsuleHotel', 'minpaku', 'loveHotel', 'coworking']);
put('bank', ['shinkin', 'securities']);
put('material', ['chemPlant', 'paperMill', 'cementPlant', 'glassWorks', 'aluminumPlant', 'foundry', 'textileMill', 'quarry', 'gravelPit', 'mine']);
put('machine', ['tirePlant', 'medDevice', 'aeroParts', 'cutlery', 'kiln', 'furnitureShop', 'printPlant', 'toyFactory', 'cosmetics']);
put('food', ['dairyPlant', 'bottling']);
put('space', ['spaceport', 'spaceVenture']);
put('agri', ['paddy', 'field', 'farm', 'fishPort', 'tourFarm', 'poultry', 'pigFarm', 'beefRanch', 'dairy', 'horseFarm', 'teaField', 'orchard', 'greenhouse', 'plantFactory', 'flowerFarm', 'shiitake', 'bamboo', 'riceCenter', 'compost', 'aquaRaft', 'landAqua', 'fishFarm', 'setNet', 'timberMarket', 'forestry', 'apiary', 'wasabi', 'saltField']);
export const sectorOf = (k: Kind): Sector | undefined => SEC_OF[k];

/** 産業の区分：1 次（農林水産）・2 次（工業・建設・エネルギー）・3 次（商業・サービス・事務） */
export function industryOf(k: Kind): 1 | 2 | 3 {
  const sec = SEC_OF[k], f = DEFS[k].fam as string;
  if (sec === 'agri' || f === 'agri') return 1;
  if (sec === 'auto' || sec === 'machine' || sec === 'material' || sec === 'food' || sec === 'pharma' || sec === 'construct' || sec === 'defense' || sec === 'space' || sec === 'energy' || k === 'semicon') return 2;
  return 3;
}

export type Macro = { cpi: number; rate: number; nikkei: number; war: number; warLeft: number; oil: number; sect: Partial<Record<Sector, number>>; hist: number[]; rateHist: number[]; ind: [number, number, number] };
export const macroOf = (s: GameState): Macro => {
  const e: any = s.econ ?? (s.econ = { cycle: 0.2, fx: 135, shock: 0 });
  if (!e.macro) e.macro = { cpi: 2.0, rate: 0.5, nikkei: 38000, war: 0, warLeft: 0, oil: 1, sect: {}, hist: [], rateHist: [], ind: [0.05, 0.3, 0.65] } as Macro;
  return e.macro as Macro;
};

/** 1 か月進める（景気・為替を決めたあとに呼ぶ） */
export function updateMacro(s: GameState): void {
  const M = macroOf(s), e = s.econ!, cyc = e.cycle, fx = (e.fx - 135) / 135, mo = s.month, sd = s.seed;
  // 海外の戦争：まれに始まり（約 12 年に 1 度）、2〜4 年続く。紛争のできごと（warAbroad）でも始まる
  if (M.warLeft > 0) M.warLeft--;
  else if (mo > 30 && h01(sd * 0.37 + mo * 5.11) < 1 / 150) M.warLeft = 24 + Math.floor(h01(sd + mo * 0.7) * 24);
  M.war = Math.round((M.war + ((M.warLeft > 0 ? 1 : 0) - M.war) * 0.25) * 1000) / 1000;
  // 原油：戦争と景気で上がる
  M.oil = Math.round(clamp(M.oil + (1 + 0.45 * M.war + 0.15 * cyc - M.oil) * 0.2 + (h01(sd * 2.3 + mo * 3.7) - 0.5) * 0.04, 0.6, 2) * 1000) / 1000;
  // 物価（前の年と比べた上がり方 %）：円安・原油・好況で上がる。ゆっくり動く
  const cpiT = 1.2 + 4 * Math.max(-0.1, fx) + 3 * (M.oil - 1) + 0.9 * cyc - 0.6 * (M.rate - 0.5);
  M.cpi = Math.round(clamp(M.cpi + (cpiT - M.cpi) * 0.12, -1, 8) * 100) / 100;
  // 日銀の政策金利：半年に一度の会合で、物価が 2% を上回ると上げ、景気が悪いと下げる（0〜3%、0.25% 刻み）
  if (mo % 6 === 3) { const want = clamp(0.5 + 0.55 * (M.cpi - 2) + 0.4 * cyc, 0, 3); const step = want > M.rate + 0.2 ? 0.25 : want < M.rate - 0.2 ? -0.25 : 0; M.rate = Math.round(clamp(M.rate + step, 0, 3) * 100) / 100; }
  M.rateHist.push(M.rate); if (M.rateHist.length > 36) M.rateHist.shift();
  // 業種の調子（1 が平年）。景気・為替・金利・戦争・物価で決まる
  for (const sc of SECTORS) { const k = sc.k; M.sect[sc.id] = Math.round(clamp(1 + k.cyc * cyc + k.fx * fx + k.rate * (M.rate - 0.5) + k.war * M.war + k.cpi * (M.cpi - 2), 0.7, 1.4) * 1000) / 1000; }
  // 日経平均：長い上がり傾向に、景気・円安・金利・戦争と小さなゆらぎ
  const lt = Math.log(36000) + 0.0025 * mo + 0.22 * cyc + 0.25 * fx - 0.05 * (M.rate - 0.5) - 0.07 * M.war + 0.05 * (h01(sd * 3.1 + mo * 1.9) - 0.5), lc = Math.log(M.nikkei);
  M.nikkei = Math.round(Math.exp(lc + (lt - lc) * 0.35));
  M.hist.push(M.nikkei); if (M.hist.length > 36) M.hist.shift();
  // 1 次〜3 次産業の割合（市内の働き口）
  const j = [0, 0, 0];
  for (const b of s.buildings) { if (b.status !== 'operating') continue; const d = DEFS[b.kind], n = d.jobs ?? (d.fam === 'agri' ? 6 : d.staffReq ?? 0); if (n > 0) j[industryOf(b.kind) - 1] += n; }
  const tot = j[0] + j[1] + j[2] || 1; M.ind = [j[0] / tot, j[1] / tot, j[2] / tot].map(v => Math.round(v * 1000) / 1000) as [number, number, number];
}
/** 業種の調子が、その企業の法人の税に効く倍率 */
export function sectorK(s: GameState, k: Kind): number { const sc = SEC_OF[k]; if (!sc) return 1; const v = (s.econ as any)?.macro?.sect?.[sc]; return typeof v === 'number' ? v : 1; }
/** 産業のバランス：1 つの産業にかたよらないほど、不況のときの落ち込みが小さい（0〜1） */
export function industryBalance(s: GameState): number { const m = (s.econ as any)?.macro as Macro | undefined; if (!m) return 0.5; const p = m.ind.filter(v => v > 0); return clamp(-p.reduce((a, v) => a + v * Math.log(v), 0) / Math.log(3), 0, 1); }
/** 金利が起債の利率に足す分（政策金利 0.5% のとき 0） */
export const rateAdd = (s: GameState) => ((((s.econ as any)?.macro?.rate ?? 0.5) - 0.5) / 100);
/** 物価高の暮らしへの重さ（2% を超えた分。0 以上） */
export const cpiBurden = (s: GameState) => Math.max(0, (((s.econ as any)?.macro?.cpi ?? 2) - 2.5));
