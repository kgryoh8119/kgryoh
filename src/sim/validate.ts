// 入力の検証。操作（Action）と保存データ（GameState）の型・値域・相互参照を、状態を変える前に確かめる。
// ここで弾けば、月次計算や再計算が不正な値を参照して例外や NaN を出すことはない。
import { onMapChange, REAL } from './real';
import { W, H, P, DEFS, POLICIES, GOALS, VISIONS, LV_CAP } from './config';
import { OPT } from './options';
import { getMap, buildable, syncTerrain, isCastaway, setTerrainVer } from './map';
import { EVENTS } from './events';
import { validPol, POL_OPS } from './politics';
import type { GameState, Action, Effect, Kind } from './types';

let N = 0;
onMapChange(() => { N = W * H; });
const KINDS = Object.keys(DEFS) as Kind[];
const STATUSES = ['construction', 'operating', 'suspended', 'renewing'];
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isFin = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max;
const intIn = (v: unknown, lo: number, hi: number) => isInt(v) && v >= lo && v <= hi;
const finIn = (v: unknown, lo: number, hi: number) => isFin(v) && v >= lo && v <= hi;

export const ACTION_NAMES: Record<string, string> = {
  road: '道路の建設', unroad: '道路の撤去', rail: '線路の敷設', unrail: '線路の撤去', railgrade: '線路の高架化・地下化', repair: '道路の補修', zone: '用途の指定', build: '施設の建設', demolish: '撤去・工事の中止',
  renew: '施設の更新', staff: '職員の目標', suspend: '休止・再開', policy: '政策の切り替え', borrow: '市債の発行', tunnel: 'トンネル', area: '線引き・立地適正化', terra: '地形の造作', widen: '6 車線化', flyover: '立体交差', railKind: '線の種類', street: '道路の種類', busStop: 'バス停', levee: '堤防', airportUp: '空港の拡張', airRoute: '航空路線', bridge: '橋', overpass: '陸橋', footbridge: '歩道橋', canal: '水路', repayTemp: '一時借入の返済', stationUp: '駅の拡張', event: 'イベントへの対応', sandboxPlace: '直接配置',
  upgrade: '施設の増築', buyout: '住宅の用地買収', tax: '税率の変更', goals: '公約とビジョン', civic: '市長の取り組み', difficulty: '難易度の変更', annex: '区域の編入', option: '施設の改修', expand: '増設の補助', move: '施設の移設', challenge: '挑戦モード', sister: '国際交流', pol: '市政', style: '外観の変更', rerun: '立候補', team: 'プロスポーツチーム',
};

/** タイル一覧：配列・整数・地図内であることを確かめ、重複を除いて返す。不正なら理由の文字列 */
export function cleanTiles(tiles: unknown): number[] | string {
  if (!Array.isArray(tiles)) return '区画の指定が配列ではありません';
  if (tiles.length === 0) return '場所を選んでください';
  if (tiles.length > N) return '指定された区画が多すぎます';
  for (const i of tiles) if (!intIn(i, 0, N - 1)) return `地図の外か不正な区画が含まれています（${String(i)}）`;
  return [...new Set(tiles as number[])];
}

/** 操作の形式チェック（状態は変えない）。問題がなければ null */
export function validateAction(s: GameState, a: unknown): string | null {
  if (!isObj(a) || typeof a.type !== 'string' || !(a.type in ACTION_NAMES)) return '不明な操作です';
  const findB = (id: unknown) => (isInt(id) ? s.buildings.find(b => b.id === id) : undefined);
  const xy = (x: unknown, y: unknown) => intIn(x, 0, W - 1) && intIn(y, 0, H - 1);
  switch (a.type) {
    case 'bridge': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return a.road === 1 || a.road === 2 ? null : '道路の種類が不正です'; }
    case 'area': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return a.v === 0 || a.v === 1 || a.v === 2 ? null : '区域の種類が不正です'; }
    case 'street': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return ['tree', 'stone', 'nopole', 'charge', 'none'].includes(a.style) ? null : '道路の種類が不正です'; }
    case 'busStop': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return typeof a.on === 'boolean' ? null : '設置か撤去かが不正です'; }
    case 'airportUp': return isInt(a.id) ? null : '空港の番号が不正です';
    case 'airRoute': return typeof a.route === 'string' && a.route.length < 20 && typeof a.on === 'boolean' ? null : '路線が不正です';
    case 'terra': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return ['raise', 'lower', 'flatten', 'hill', 'mountain', 'valley', 'cliff', 'water', 'fill', 'forest', 'clear', 'wet', 'sand', 'desert', 'snow', 'reset'].includes(a.op as string) ? null : '造作の種類が不正です'; }
    case 'widen': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return typeof a.on === 'boolean' ? null : '広げるか戻すかが不正です'; }
    case 'flyover': case 'levee': case 'overpass': case 'footbridge': case 'canal': { const t = cleanTiles(a.tiles); return typeof t === 'string' ? t : null; }
    case 'tunnel': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return a.road === 1 || a.road === 2 ? null : '道路の種類が不正です'; }
    case 'road': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return a.road === 1 || a.road === 2 ? null : '道路の種類が不正です（生活道路か幹線道路のみ）'; }
    case 'unroad': case 'repair': { const t = cleanTiles(a.tiles); return typeof t === 'string' ? t : null; }
    case 'railKind': { if (!s.rail) return 'この地図では線路は変えられません'; const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return intIn(a.kind, 0, 2) ? null : '線の種類が不正です'; }
    case 'rail': case 'unrail': case 'railgrade': {
      if (!s.rail) return 'この地図では線路は鉄道事業者の管理で、市は変えられません（まちづくり版で操作できます）';
      const t = cleanTiles(a.tiles); if (typeof t === 'string') return t;
      if (a.type === 'railgrade') return intIn(a.grade, 0, 3) ? null : '線路の高さが不正です（地上・高架・地下・掘割のみ）';
      if (a.type === 'rail' && a.grade !== undefined && !intIn(a.grade, 0, 3)) return '線路の高さが不正です（地上・高架・地下・掘割のみ）';
      return a.type === 'unrail' || intIn(a.level, 1, 3) ? null : '線路の種類が不正です（単線・複線・複々線のみ）';
    }
    case 'zone': { const t = cleanTiles(a.tiles); if (typeof t === 'string') return t; return intIn(a.zone, 0, 6) ? null : '用途の種類が不正です'; }
    case 'build': case 'sandboxPlace':
      if (!KINDS.includes(a.kind)) return '施設の種類が不正です';
      return xy(a.x, a.y) ? null : '置く場所が地図の外か、座標が整数ではありません';
    case 'demolish': case 'renew': case 'suspend': return findB(a.id) ? null : '対象の建物がありません';
    case 'staff': {
      const b = findB(a.id); if (!b) return '対象の施設がありません';
      if (!isInt(a.n)) return '職員数は整数で指定してください';
      const max = Math.round((DEFS[b.kind].staffReq || 0) * LV_CAP[(b.lv ?? 1) - 1] * 1.2);
      return a.n >= 0 && a.n <= max ? null : `職員の目標は 0〜${max} 人で指定してください`;
    }
    case 'policy': return POLICIES.some(p => p.id === a.id) && typeof a.on === 'boolean' ? null : '政策の指定が不正です';
    case 'repayTemp': return a.amount === undefined || (isInt(a.amount) && a.amount > 0) ? null : '返済額は正の整数（万円）で指定してください';
    case 'borrow':
      if (!isInt(a.amount) || a.amount <= 0) return '市債の金額は正の整数（万円）で指定してください';
      return a.amount <= P.bondLimit * 3 ? null : `市債の金額が上限（${(P.bondLimit * 3).toLocaleString()} 万円）を超えています`;
    case 'upgrade': return findB(a.id) ? null : '対象の建物がありません';
    case 'stationUp': return findB(a.id) && (a.what === 'bldg' || a.what === 'shin') ? null : '駅の指定が不正です';
    case 'buyout': return findB(a.id) ? null : '対象の建物がありません';
    case 'tax': {
      if (!['res', 'prop', 'biz', 'stay'].includes(a.key)) return '税の種類が不正です';
      if (a.key === 'stay') return a.v === 0 || a.v === 1 ? null : '宿泊税は 0 か 1 で指定してください';
      return finIn(a.v, 0.85, 1.15) ? null : '税率は標準の 85%〜115% の範囲で指定してください';
    }
    case 'goals': {
      if (!Array.isArray(a.ids) || a.ids.length !== 3 || new Set(a.ids).size !== 3 || !a.ids.every((id: unknown) => GOALS.some(g => g.id === id))) return '公約は候補から 3 つ選んでください';
      if (a.vision !== undefined && !VISIONS.some(v => v.id === a.vision)) return 'ビジョンの指定が不正です';
      return null;
    }
    case 'rerun': return null;
    case 'team': return ['soccer', 'baseball', 'basket'].includes(a.sport) && typeof a.on === 'boolean' ? null : 'チームの指定が不正です';
    case 'difficulty': return ['easy', 'normal', 'hard'].includes(a.v) ? null : '難易度の指定が不正です';
    case 'annex': return intIn(a.block, 0, 35) ? null : '区域の指定が不正です';
    case 'option': return intIn(a.id, 0, 1e9) && isStr(a.opt, 20) && typeof a.on === 'boolean' ? null : '改修の指定が不正です';
    case 'move': return intIn(a.id, 0, 1e9) && intIn(a.x, -10, W + 10) && intIn(a.y, -10, H + 10) ? null : '移設の指定が不正です';
    case 'pol': return POL_OPS.includes(a.op) && (a.id === undefined || isStr(a.id, 20)) && (a.n === undefined || intIn(a.n, 0, 9)) ? null : '市政の操作の指定が不正です';
    case 'sister': return isStr(a.id, 20) && ['join', 'student', 'trade', 'culture', 'end'].includes(a.act) ? null : '国際交流の指定が不正です';
    case 'challenge': return isStr(a.id, 20) ? null : '挑戦の指定が不正です';
    case 'expand': return intIn(a.id, 0, 1e9) ? null : '施設の指定が不正です';
    case 'style': return intIn(a.id, 0, 1e9) && intIn(a.v, 0, 5) ? null : '外観の指定が不正です';
    case 'civic': return typeof a.id === 'string' && a.id.length < 40 ? null : '取り組みの指定が不正です';
    case 'event': {
      const inst = typeof a.id === 'string' ? s.events.active.find(e => e.id === a.id) : undefined;
      if (!inst) return 'そのイベントは対応待ちではありません';
      const def = EVENTS.find(e => e.id === a.id)!;
      return intIn(a.option, 0, def.options.length - 1) ? null : '選択肢の番号が不正です';
    }
  }
  return '不明な操作です';
}

function checkEffect(e: unknown): string | null {
  if (!isObj(e) || typeof e.t !== 'string') return '効果の形式';
  const num = (k: string, lo = -1e7, hi = 1e7) => (finIn(e[k], lo, hi) ? null : `効果の数値（${k}）`);
  switch (e.t) {
    case 'cash': return num('v') ?? (isStr(e.label) ? null : '効果の名前');
    case 'mod': return (isStr(e.key, 60) ? null : '効果のキー') ?? (e.op === 'mul' || e.op === 'add' ? null : '効果の種類') ?? num('v', -1e5, 1e5) ?? (intIn(e.months, -1, 600) ? null : '効果の期間') ?? (e.cost === undefined ? null : num('cost', 0, 1e6)) ?? (e.delay === undefined || intIn(e.delay, 0, 600) ? null : '効果の遅れ');
    case 'age': return KINDS.includes(e.kind) ? num('dv', -100, 100) : '効果の施設種別';
    case 'renew': return KINDS.includes(e.kind) ? null : '効果の施設種別';
    case 'tempStaff': return num('n', 0, 100) ?? (intIn(e.months, 0, 600) ? null : '効果の期間');
    case 'closeShop': return num('prob', 0, 1);
    case 'keepShop': return null;
    case 'openStore': return KINDS.includes(e.kind) && intIn(e.delay, 0, 600) ? null : '効果の内容';
    case 'expandPrivNursery': return num('add', 0, 1000) ?? (intIn(e.delay, 0, 600) ? null : '効果の遅れ');
    case 'roadBoost': return num('v', 1, 3) ?? (intIn(e.delay, 0, 600) ? null : '効果の遅れ');
    case 'fame': case 'approval': case 'neighbor': return num('v', -100, 100);
    case 'team': return ['soccer', 'baseball', 'basket'].includes((e as any).sport) ? null : '効果の内容';
    case 'damage': return ['quake', 'flood', 'fire', 'snow', 'slide', 'wind'].includes(e.what) ? num('v', 0, 1) : '効果の内容';
    case 'place': return KINDS.includes(e.kind) ? null : '効果の施設種別';
    case 'teamAdj': return (e.fans === undefined || isFin(e.fans)) && (e.power === undefined || isFin(e.power)) && (e.remove === undefined || typeof e.remove === 'boolean') ? null : '効果の内容';
    case 'shin': return intIn(e.months, 0, 600) ? null : '効果の期間';
    case 'recover': return num('v', 0, 1) ?? (e.delay === undefined || intIn(e.delay, 0, 600) ? null : '効果の遅れ');
    case 'sat': return Array.isArray(e.who) && e.who.every((t: unknown) => intIn(t, 0, 4)) ? (num('v', -1, 1) ?? (intIn(e.months, 0, 600) ? null : '効果の期間') ?? (e.delay === undefined || intIn(e.delay, 0, 600) ? null : '効果の遅れ')) : '効果の対象';
  }
  return '不明な効果';
}

const LEDGER_KEYS = ['month', 'taxResident', 'taxProperty', 'taxBusiness', 'transfer', 'admin', 'upkeep', 'wages', 'subsidy', 'roads', 'policy', 'interest', 'capital', 'repay', 'borrowed', 'other', 'operating', 'cashEnd'] as const;

/** 状態全体の検証。保存データの読込と、操作後の不変条件の確認に使う。問題がなければ null */
export function validateState(s: unknown): string | null {
  if (!isObj(s)) return '状態がありません';
  // ---- 基本の値 ----
  if (s.version !== 2) return `状態の版が不正です（${String(s.version)}）`;
  if (!intIn(s.seed, -2147483648, 4294967295)) return '乱数シードが不正です';
  if (!intIn(s.rng, -2147483648, 2147483647)) return '乱数の状態が不正です';
  if (!intIn(s.month, 0, 100000)) return '経過月が不正です（0 以上の整数）';
  if (!intIn(s.term, 1, 10000)) return '任期の番号が不正です';
  if (!intIn(s.termStart, 0, s.month)) return '任期の開始月が不正です';
  if (!intIn(s.termLength, 1, 600)) return '任期の長さが不正です';
  if (s.mode !== 'term' && s.mode !== 'sandbox') return '遊び方の種類が不正です';
  if (!isStr(s.cityName, 40)) return '市の名前が不正です';
  if (!finIn(s.cash, 0, 1e12)) return '資金が不正です（0 以上の有限の数）';
  if (!finIn(s.inflowFactor, 0, 10)) return '転入の係数が不正です';
  if (!intIn(s.nextId, 1, 1e9) || !intIn(s.roadVersion, 0, 1e12) || !intIn(s.bVersion, 0, 1e12)) return '内部の番号が不正です';
  // v90：施策の記録（ないのは古いセーブ。形が崩れていれば記録だけ捨てる。街の計算には使わない）
  if (s.decisions !== undefined && (!Array.isArray(s.decisions) || s.decisions.length > 200 || !s.decisions.every((d: unknown) => isObj(d) && isInt(d.month) && isStr(d.label, 200) && isObj(d.before) && Array.isArray(d.results) && Array.isArray(d.checkAt)))) delete s.decisions;
  // ---- 地図 ----
  if (isFinite(s.seed)) setTerrainVer(s.seed, intIn(s.terrV, 0, 1000) ? s.terrV : 0); // v94：地形の版（古いセーブは v93 までの地形）
  { const okH = s.terraH === undefined || (Array.isArray(s.terraH) && s.terraH.length === (W + 1) * (H + 1) && s.terraH.every((v: unknown) => finIn(v, -100, 100)));
    const okT = s.terraT === undefined || (Array.isArray(s.terraT) && s.terraT.length === N && s.terraT.every((v: unknown) => intIn(v, 0, 8)));
    syncTerrain(okH && okT && (s.terraVer === undefined || intIn(s.terraVer, 0, 1e9)) ? (s as any) : null); }
  const m = getMap(s.seed);
  const arr = (k: string, ok: (v: unknown) => boolean, what: string) => {
    const a = s[k];
    if (!Array.isArray(a) || a.length !== N) return `地図データ「${k}」の大きさが合いません`;
    for (let i = 0; i < N; i++) if (!ok(a[i])) return `地図データ「${k}」の ${i} 番目が不正です（${what}）`;
    return null;
  };
  const e1 = arr('road', v => intIn(v, 0, 3), '道路の種類は 0〜3') ?? arr('roadAge', v => finIn(v, 0, 100), '老朽度は 0〜100') ?? arr('zone', v => intIn(v, 0, 6), '用途は 0〜6')
    ?? arr('occ', v => intIn(v, 0, 1e9), '建物の番号') ?? arr('vc', v => finIn(v, 0, 1e4), '混雑率');
  if (e1) return e1;
  const tun = new Set([...(Array.isArray(s.tunnel) ? s.tunnel : []), ...(Array.isArray(s.bridge) ? s.bridge : [])]);
  const canal = new Set(Array.isArray(s.canal) ? s.canal : []);
  const isle = isCastaway(s.seed);
  for (let i = 0; i < N; i++) {
    const nationalRow = m.national ? m.national[i] === 1 : !isle && i >= 15 * W && i < 16 * W; // v88：無人島には国道がない
    if (nationalRow !== (s.road[i] === 3)) return `国道の配置が不正です（区画 ${i}）`;
    if ((s.road[i] === 1 || s.road[i] === 2) && !buildable(m, i) && !(m.fixedRoad && m.fixedRoad[i]) && !tun.has(i)) return `道路を置けない土地に道路があります（区画 ${i}）`;
    if (s.road[i] && s.occ[i]) return `道路と建物が重なっています（区画 ${i}）`;
    if (canal.has(i) && (s.occ[i] || (s.road[i] && !tun.has(i)))) return `水路に建物か道路があります（区画 ${i}）`;
  }
  if (!isObj(s.roadBoost)) return '道路の改良データが不正です';
  if (s.peakPop !== undefined && !finIn(s.peakPop, 0, 1e8)) return '人口の記録が不正です';
  if (s.peakMonth !== undefined && !intIn(s.peakMonth, 0, 1e6)) return '人口の記録が不正です';
  if (s.autoOrder !== undefined && !intIn(s.autoOrder, 0, 2)) return 'オートの作戦が不正です';
  if (s.plan !== undefined && (!isObj(s.plan) || !isStr(s.plan.vision, 40) || !intIn(s.plan.made, 0, 1e6) || !Array.isArray(s.plan.roles) || s.plan.roles.length > 64 || !s.plan.roles.every((r: unknown) => intIn(r, 0, 5)))) return '都市計画の記録が不正です';
  if (s.over !== undefined && (!isObj(s.over) || !intIn(s.over.month, 0, 1e6) || typeof s.over.reason !== 'string' || s.over.reason.length > 80)) return '街の終わりの記録が不正です';
  if (s.terraH !== undefined && (!Array.isArray(s.terraH) || s.terraH.length !== (W + 1) * (H + 1) || !s.terraH.every((v: unknown) => finIn(v, -100, 100)))) return '地形の造作（高さ）のデータが不正です';
  if (s.terraT !== undefined && (!Array.isArray(s.terraT) || s.terraT.length !== N || !s.terraT.every((v: unknown) => intIn(v, 0, 8)))) return '地形の造作（種類）のデータが不正です';
  if (s.terraVer !== undefined && !intIn(s.terraVer, 0, 1e9)) return '地形の造作の記録が不正です';
  if (s.terrV !== undefined && !intIn(s.terrV, 0, 1000)) return '地形の版が不正です';
  for (const k of ['wide', 'flyover'] as const) { const v = s[k]; if (v !== undefined && (!Array.isArray(v) || v.length > N || !v.every((i: unknown) => intIn(i, 0, N - 1) && s.road[i as number]) || new Set(v).size !== v.length)) return k === 'wide' ? '6 車線のデータが不正です' : '立体交差のデータが不正です'; }
  if (s.missions !== undefined && (!Array.isArray(s.missions) || s.missions.length > 50 || !s.missions.every((m: unknown) => isStr(m, 20)))) return '初仕事の記録が不正です';
  if (s.missionBase !== undefined && (!isObj(s.missionBase) || !['roads', 'zoned', 'hh', 'shops', 'parks'].every(k => finIn((s.missionBase as any)[k], 0, 1e7)))) return '初仕事の記録が不正です';
  if (s.celeb !== undefined && (!isObj(s.celeb) || !['festival', 'parade', 'milestone'].includes(s.celeb.kind) || !intIn(s.celeb.month, 0, 1e6) || !isStr(s.celeb.label, 60))) return 'お祝いの記録が不正です';
  if (s.voiceSeen !== undefined && (!isObj(s.voiceSeen) || Object.keys(s.voiceSeen).length > 200 || !Object.values(s.voiceSeen).every((v: any) => isObj(v) && intIn(v.since, 0, 1e6) && isStr(v.who, 40) && isStr(v.text, 200)))) return '住民の声の記録が不正です';
  if (s.thanks !== undefined && (!Array.isArray(s.thanks) || s.thanks.length > 20 || !s.thanks.every((t: any) => isObj(t) && isStr(t.key, 40) && intIn(t.month, 0, 1e6) && isStr(t.who, 40) && isStr(t.text, 200) && isStr(t.was, 200) && intIn(t.months, 0, 1e6)))) return '住民の声の記録が不正です';
  if (s.area !== undefined && (!Array.isArray(s.area) || s.area.length !== N || !s.area.every((v: unknown) => intIn(v, 0, 2)))) return '線引きのデータが不正です';
  if (s.airRoutes !== undefined && (!Array.isArray(s.airRoutes) || s.airRoutes.length > 20 || !s.airRoutes.every((r: any) => isObj(r) && isStr(r.id, 20) && intIn(r.since, 0, 1e6)))) return '航空路線のデータが不正です';
  if (s.econ !== undefined && (!isObj(s.econ) || !finIn(s.econ.cycle, -2, 2) || !finIn(s.econ.fx, 50, 300) || !intIn(s.econ.shock, 0, 1000))) return '景気のデータが不正です';
  if (s.fiscal !== undefined && (!isObj(s.fiscal) || !finIn(s.fiscal.kosai, 0, 100) || !finIn(s.fiscal.shorai, 0, 1000) || !['ok', 'early', 'rebuild'].includes(s.fiscal.status) || !intIn(s.fiscal.since, 0, 1e6))) return '財政指標のデータが不正です';
  if (Array.isArray(s.busStops) && !s.busStops.every((i: number) => s.road[i])) return 'バス停のデータが不正です';
  if (s.streets !== undefined && (typeof s.streets !== 'object' || s.streets === null || !['tree', 'stone', 'nopole', 'charge'].every(k => (s.streets as any)[k] === undefined || (Array.isArray((s.streets as any)[k]) && (s.streets as any)[k].every((i: unknown) => Number.isInteger(i) && s.road[i as number]))))) return '道路の種類のデータが不正です';
  if (Array.isArray(s.levee) && !s.levee.every((i: number) => !s.road[i] && !s.occ[i])) return '堤防のデータが不正です';
  for (const k of ['bridge', 'overpass', 'footbridge', 'canal', 'busStops', 'levee'] as const) { const v = s[k]; if (v !== undefined && (!Array.isArray(v) || v.length > N || !v.every((i: unknown) => intIn(i, 0, N - 1)) || new Set(v).size !== v.length)) return '橋・陸橋・歩道橋・水路のデータが不正です'; }
  if (s.bridge && !s.bridge.every((i: number) => s.road[i] === 1 || s.road[i] === 2)) return '橋のデータが不正です';
  if (s.overpass && !s.overpass.every((i: number) => s.road[i] && s.rail?.[i])) return '陸橋のデータが不正です';
  if (s.footbridge && !s.footbridge.every((i: number) => s.road[i])) return '歩道橋のデータが不正です';
  if (s.climate !== undefined && (!isObj(s.climate) || !finIn(s.climate.rain, 0, 5000) || !finIn(s.climate.ratio, 0, 10) || !finIn(s.climate.store, 0, 1) || !finIn(s.climate.crop, 0, 2) || typeof s.climate.snow !== 'boolean')) return '天気のデータが不正です';
  if (s.tunnel !== undefined && (!Array.isArray(s.tunnel) || s.tunnel.length > N || !s.tunnel.every((i: unknown) => intIn(i, 0, N - 1) && (s.road[i as number] === 1 || s.road[i as number] === 2)) || new Set(s.tunnel).size !== s.tunnel.length)) return 'トンネルのデータが不正です';
  for (const [k, v] of Object.entries(s.roadBoost)) { const i = Number(k); if (!intIn(i, 0, N - 1) || !finIn(v, 1, 3)) return '道路の改良データが不正です'; }
  // ---- 建物 ----
  if (!Array.isArray(s.buildings) || s.buildings.length > N) return '建物の一覧が不正です';
  const byId = new Map<number, any>();
  for (const b of s.buildings) {
    if (!isObj(b)) return '建物のデータが不正です';
    const tag = `建物 ${String(b.id)}`;
    if (!intIn(b.id, 1, s.nextId - 1)) return `${tag} の番号が不正です`;
    if (byId.has(b.id)) return `${tag} の番号が重複しています`;
    byId.set(b.id, b);
    const d = DEFS[b.kind as Kind];
    if (!d || !KINDS.includes(b.kind)) return `${tag} の種類が不明です（${String(b.kind)}）`;
    if (b.w !== d.w || b.h !== d.h) return `${tag} の大きさが種類と合いません`;
    if (!intIn(b.x, 0, W - d.w) || !intIn(b.y, 0, H - d.h)) return `${tag} の座標が地図の外です`;
    if (!STATUSES.includes(b.status)) return `${tag} の状態が不正です`;
    if (!intIn(b.remain, 0, 600) || !intIn(b.total, 1, 600)) return `${tag} の工期が不正です`;
    if ((b.status === 'construction' || b.status === 'renewing') !== (b.remain > 0)) return `${tag} の状態と残り工期が合いません`;
    if (!finIn(b.age, 0, 100)) return `${tag} の老朽度が不正です`;
    if (!intIn(b.builtMonth, -100000, s.month + 1)) return `${tag} の建設月が不正です`;
    if (!finIn(b.v, 0, 1)) return `${tag} の見た目の値が不正です`;
    if (b.sandbox !== undefined && typeof b.sandbox !== 'boolean') return `${tag} の直接配置の印が不正です`;
    if (b.osm !== undefined && (b.osm !== true || !d.units)) return `${tag} の実在建物の印が不正です`;
    if (b.name !== undefined && !isStr(b.name, 60)) return `${tag} の名前が不正です`;
    if (d.units) {
      if (b.osm ? !intIn(b.units, 1, 5000) : b.units !== d.units) return `${tag} の戸数が不正です`;
      if (!Array.isArray(b.hh) || b.hh.length !== 5 || !b.hh.every((v: unknown) => finIn(v, 0, 1e6))) return `${tag} の世帯数が不正です`;
      if (b.hh.reduce((x: number, v: number) => x + v, 0) > b.units + 1e-6) return `${tag} の世帯数が戸数を超えています`;
    } else if (b.hh !== undefined) return `${tag} は住宅ではないのに世帯があります`;
    if (d.staffReq) {
      if (!finIn(b.staff, 0, d.staffReq * 10)) return `${tag} の職員数が不正です`;
      if (!intIn(b.staffTarget, 0, Math.round(d.staffReq * 1.7 * 1.2))) return `${tag} の職員の目標が不正です`;
    }
    if (d.fixed && !intIn(b.lossStreak, 0, 10000)) return `${tag} の赤字月数が不正です`;
    if (b.lv !== undefined && !intIn(b.lv, 1, 5)) return `${tag} の増築レベルが不正です`;
    if (b.opts !== undefined && (!Array.isArray(b.opts) || b.opts.length > 3 || !b.opts.every((o: unknown) => isStr(o, 20) && !!OPT[o as string]))) return `${tag} の改修のデータが不正です`;
    if (b.style !== undefined && !intIn(b.style, 0, 5)) return `${tag} の外観のデータが不正です`;
    if (b.moved !== undefined && typeof b.moved !== 'boolean') return `${tag} の移設のデータが不正です`;
    if (b.upg !== undefined && (b.upg !== true || b.status !== 'renewing')) return `${tag} の増築工事の印が不正です`;
    if (b.tries !== undefined && !intIn(b.tries, 0, 10)) return `${tag} の誘致の回数が不正です`;
    if ((b.upAt !== undefined || b.shin !== undefined) && b.kind !== 'station') return `${tag} は駅ではありません`;
    if (b.upAt !== undefined && !intIn(b.upAt, 0, 1e6)) return `${tag} の駅の工事の月が不正です`;
    if (b.shin !== undefined && !intIn(b.shin, 0, 1e6)) return `${tag} の新幹線の開業月が不正です`;
    if (b.lossStreak !== undefined && !intIn(b.lossStreak, 0, 10000)) return `${tag} の月数が不正です`;
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
      const i = (b.y + dy) * W + b.x + dx;
      if (s.occ[i] !== b.id) return `${tag} と区画の対応が合いません`;
      if (s.road[i]) return `${tag} が道路と重なっています`;
    }
  }
  // 区画 → 建物（逆方向）
  for (let i = 0; i < N; i++) {
    const id = s.occ[i];
    if (!id) continue;
    const b = byId.get(id);
    if (!b) return `存在しない建物を指す区画があります（区画 ${i}）`;
    const x = i % W, y = (i / W) | 0;
    if (x < b.x || x >= b.x + b.w || y < b.y || y >= b.y + b.h) return `建物 ${id} の外の区画が建物を指しています（区画 ${i}）`;
  }
  if (!REAL && !isle && !s.buildings.some((b: any) => b.kind === 'station')) return '駅がありません'; // 実在の地図には鉄道のない街もある。v88：無人島も
  // ---- 線路（まちづくり版だけ）----
  if (REAL?.rail || !REAL) { // まちづくり版と架空の街（v13 から線路を敷き直せる）
    if (!Array.isArray(s.rail) || s.rail.length !== N || !s.rail.every((v: unknown) => intIn(v, 0, 3))) return '線路のデータが不正です';
    if (!Array.isArray(s.railCity) || s.railCity.length > N || !s.railCity.every((v: unknown) => intIn(v, 0, N - 1)) || new Set(s.railCity).size !== s.railCity.length) return '市が敷いた線路のデータが不正です';
    if (!Array.isArray(s.railGrade) || s.railGrade.length !== N || !s.railGrade.every((v: unknown, i: number) => intIn(v, 0, 3) && (v === 0 || s.rail![i] > 0))) return '線路の高さのデータが不正です';
    for (let i = 0; i < N; i++) if (s.rail[i] && s.railGrade[i] !== 2 && s.occ[i]) return `線路と建物が重なっています（区画 ${i}）`;
  } else if (s.rail !== undefined || s.railCity !== undefined || s.railGrade !== undefined) return 'この地図には線路のデータは持てません';
  // ---- 財政 ----
  if (!Array.isArray(s.loans) || s.loans.length > 1000) return '借入のデータが不正です';
  for (const l of s.loans) {
    if (!isObj(l) || (l.kind !== 'bond' && l.kind !== 'temp')) return '借入の種類が不正です';
    if (!finIn(l.principal, 0.0001, 1e9) || !finIn(l.remaining, 0, l.principal + 1e-6) || !finIn(l.rate, 0, 1) || !intIn(l.months, 1, 1200)) return '借入の金額・利率・期間が不正です';
  }
  if (s.loans.filter((l: any) => l.kind === 'bond').reduce((x: number, l: any) => x + l.remaining, 0) > P.bondLimit * 3 + 1e-6) return '市債の残高が上限を超えています';
  const ledgerOk = (L: unknown, needStart: boolean) => isObj(L) && LEDGER_KEYS.every(k => isFin(L[k])) && (!needStart || L.cashStart === undefined || isFin(L.cashStart)) && (L.fees === undefined || isFin(L.fees)) && (L.taxStay === undefined || isFin(L.taxStay));
  if (!ledgerOk(s.pending, false)) return '今月の支出記録が不正です';
  if (!Array.isArray(s.ledger) || s.ledger.length > 1000 || !s.ledger.every((L: unknown) => ledgerOk(L, true))) return '台帳が不正です';
  if (!Array.isArray(s.history) || s.history.length > 5000 || !s.history.every((h: any) => isObj(h) && ['month', 'pop', 'cash', 'sat', 'wait', 'op', 'maxVc'].every(k => isFin(h[k])))) return '履歴が不正です';
  // ---- 政策・効果・イベント ----
  if (!isObj(s.policies)) return '政策のデータが不正です';
  if (s.loopLog !== undefined && (!isObj(s.loopLog) || !Array.isArray(s.loopLog.closed) || s.loopLog.closed.length > 60 || !s.loopLog.closed.every(isFin) || !isFin(s.loopLog.levy) || !isFin(s.loopLog.levyM) || !isFin(s.loopLog.inHH))) return 'ゲームループの記録が不正です'; // v90
  for (const p of POLICIES) { const st = s.policies[p.id]; if (st !== undefined && (!isObj(st) || typeof st.on !== 'boolean' || !intIn(st.since, 0, s.month))) return `政策「${p.name}」のデータが不正です`; }
  for (const k of Object.keys(s.policies)) if (!POLICIES.some(p => p.id === k)) return `不明な政策があります（${k}）`;
  if (!Array.isArray(s.modifiers) || s.modifiers.length > 500) return '効果の一覧が不正です';
  for (const x of s.modifiers) if (!isObj(x) || !isStr(x.key, 60) || (x.op !== 'mul' && x.op !== 'add') || !finIn(x.v, -1e5, 1e5) || !intIn(x.until, -1, 1e6) || !finIn(x.cost, 0, 1e6) || !isStr(x.src, 200)) return '効果のデータが不正です';
  if (!Array.isArray(s.scheduled) || s.scheduled.length > 500) return '予定された効果の一覧が不正です';
  for (const x of s.scheduled) { if (!isObj(x) || !intIn(x.due, 0, 1e6) || !intIn(x.target, -1, 1e9) || !isStr(x.src, 200)) return '予定された効果が不正です'; const e = checkEffect(x.eff); if (e) return `予定された効果が不正です（${e}）`; }
  if (!isObj(s.events) || !Array.isArray(s.events.active) || s.events.active.length > EVENTS.length || !isObj(s.events.cooldown) || !Array.isArray(s.events.log) || s.events.log.length > 1000) return 'イベントのデータが不正です';
  for (const e of s.events.active) if (!isObj(e) || !EVENTS.some(d => d.id === e.id) || !intIn(e.start, 0, s.month) || !intIn(e.target, -1, 1e9) || !isStr(e.detail, 4000)) return 'イベントのデータが不正です';
  if (new Set(s.events.active.map((e: any) => e.id)).size !== s.events.active.length) return '同じイベントが重複しています';
  for (const [k, v] of Object.entries(s.events.cooldown)) if (!EVENTS.some(d => d.id === k) || !intIn(v, -1, 1e6)) return 'イベントの再発待ちが不正です';
  for (const e of s.events.log) {
    if (!isObj(e) || !isStr(e.id, 60) || !intIn(e.month, 0, 1e6) || !isStr(e.title, 200) || !isStr(e.choice, 200) || !isStr(e.detail, 4000)) return 'イベントの記録が不正です';
    const b = e.before;
    if (b !== undefined && (!isObj(b) || !isFin(b.wait) || !isFin(b.maxVc) || !isFin(b.cash) || !isFin(b.op) || !Array.isArray(b.sat) || b.sat.length < 1 || b.sat.length > 64 || !b.sat.every(isFin))) return 'イベントの記録（選択時の値）が不正です';
  }
  if (!isObj(s.streak) || !Object.values(s.streak).every(v => intIn(v, 0, 1e6))) return 'イベント条件の記録が不正です';
  // ---- 任期・選挙・その他 ----
  if (!Array.isArray(s.goals) || s.goals.length > 5 || !s.goals.every((g: any) => isObj(g) && GOALS.some(o => o.id === g.id) && isFin(g.base) && isFin(g.target) && intIn(g.diff, 1, 3))) return '公約のデータが不正です';
  if (typeof s.goalPick !== 'boolean') return '公約を選ぶ時期の印が不正です';
  if (s.difficulty !== undefined && !['easy', 'normal', 'hard'].includes(s.difficulty)) return '難易度のデータが不正です';
  if (s.sisters !== undefined && (!Array.isArray(s.sisters) || s.sisters.length > 3 || !s.sisters.every((p: any) => isObj(p) && isStr(p.id, 20) && intIn(p.since, 0, 1e6) && finIn(p.rel, 0, 1) && (p.last === undefined || intIn(p.last, 0, 1e6))))) return '姉妹都市のデータが不正です';
  if (s.pol !== undefined) { const e = validPol(s.pol); if (e) return e; }
  if (s.lastTsunami !== undefined && (!isObj(s.lastTsunami) || !intIn(s.lastTsunami.m, 0, 1e6) || !finIn(s.lastTsunami.h, 0, 50))) return '津波の記録が不正です';
  if (s.challenge !== undefined) { const c = s.challenge as any; if (!isObj(c) || !isStr(c.id, 20) || !intIn(c.start, 0, 1e6) || !intIn(c.until, 0, 1e6) || !finIn(c.base, 0, 1e9) || (c.done !== undefined && c.done !== 'win' && c.done !== 'lose') || (c.at !== undefined && !intIn(c.at, 0, 1e6)) || (c.seen !== undefined && typeof c.seen !== 'boolean')) return '挑戦モードのデータが不正です'; }
  if (s.unlocked !== undefined && (!Array.isArray(s.unlocked) || s.unlocked.length > 36 || !s.unlocked.every((v: unknown) => intIn(v, 0, 35)))) return '市の区域のデータが不正です';
  if (s.mayor !== undefined) { const M = s.mayor;
    if (!isObj(M) || !finIn(M.pts, 0, 1e7) || !isObj(M.medals) || !Object.values(M.medals).every((v: unknown) => intIn(v, 0, 1e6)) || !intIn(M.annex, 0, 100) || (M.annexed !== undefined && !intIn(M.annexed, 0, 36)) || !intIn(M.seenLv, 0, 20) || !intIn(M.seenRank, -1, 1e6)) return '市長の記録が不正です';
    if (!Array.isArray(M.ranks) || M.ranks.length > 40 || !M.ranks.every((r: any) => isObj(r) && intIn(r.year, 0, 1e5) && intIn(r.month, 0, 1e6) && intIn(r.total, 1, 2000) && isObj(r.cats) && Object.values(r.cats).every((v: unknown) => intIn(v, 1, 2000)) && Array.isArray(r.awards) && r.awards.every((w: unknown) => isStr(w, 60)) && (r.pts === undefined || finIn(r.pts, 0, 1e5)))) return '全国ランキングの記録が不正です'; }
  if (s.vision !== null && !VISIONS.some(v => v.id === s.vision)) return 'ビジョンのデータが不正です';
  if (!intIn(s.visionStart, 0, 1e6)) return 'ビジョンの開始月が不正です';
  if (!isObj(s.base) || !['power', 'sewage', 'gas'].every(k => finIn(s.base[k], -1, 1e8))) return '市外からの供給のデータが不正です';
  if (!isObj(s.tax) || !finIn(s.tax.res, 0.85, 1.15) || !finIn(s.tax.prop, 0.85, 1.15) || !finIn(s.tax.biz, 0.85, 1.15) || !(s.tax.stay === 0 || s.tax.stay === 1)) return '税率のデータが不正です';
  if (!finIn(s.fame, 0, 100) || !finIn(s.approval, 0, 1)) return '知名度・支持率のデータが不正です';
  if (!Array.isArray(s.polls) || s.polls.length > 200 || !s.polls.every((v: unknown) => finIn(v, 0, 1))) return '世論調査のデータが不正です';
  if (!Array.isArray(s.neighbors) || s.neighbors.length > 10 || !s.neighbors.every((n: any) => isObj(n) && isStr(n.name, 40) && isStr(n.trait, 100) && finIn(n.pop, 0, 1e8) && finIn(n.appeal, 0, 1) && finIn(n.tax, 0.5, 1.5) && finIn(n.rel, 0, 1))) return '隣町のデータが不正です';
  if (!isObj(s.acts) || !Object.entries(s.acts).every(([k, v]) => k.length < 40 && intIn(v, 0, 1e6))) return '取り組みの記録が不正です';
  if (s.teams !== undefined && (!Array.isArray(s.teams) || s.teams.length > 3 || !s.teams.every((t: any) => isObj(t) && ['soccer', 'baseball', 'basket'].includes(t.sport) && isStr(t.name, 60) && intIn(t.since, 0, 1e6) && finIn(t.fans, 0, 1) && intIn(t.rank, 0, 40) && intIn(t.titles, 0, 1000) && (t.power === undefined || finIn(t.power, 0, 1))) || new Set(s.teams.map((t: any) => t.sport)).size !== s.teams.length)) return 'プロスポーツチームのデータが不正です';
  if (!Array.isArray(s.notes) || s.notes.length > 100 || !s.notes.every((v: unknown) => isStr(v, 400))) return '知らせのデータが不正です';
  if (s.news !== undefined && (!Array.isArray(s.news) || s.news.length > 120 || !s.news.every((v: any) => isObj(v) && intIn(v.m, 0, 1e6) && isStr(v.t, 400) && (v.at === undefined || intIn(v.at, 0, 1e7))))) return 'お知らせの履歴が不正です';
  if (s.newsSeen !== undefined && !intIn(s.newsSeen, 0, 1e7)) return 'お知らせの履歴が不正です';
  const elOk = (e: any) => isObj(e) && intIn(e.month, 0, 1e6) && intIn(e.term, 1, 1e4) && finIn(e.vote, 0, 100) && typeof e.win === 'boolean' && finIn(e.support, 0, 1)
    && Array.isArray(e.pledgesKept) && e.pledgesKept.every((v: unknown) => typeof v === 'boolean') && Array.isArray(e.parts) && e.parts.every((p: any) => isObj(p) && isStr(p.label) && isFin(p.v))
    && Array.isArray(e.typeSupport) && e.typeSupport.length === 5 && e.typeSupport.every((v: unknown) => finIn(v, 0, 1));
  if (!Array.isArray(s.elections) || s.elections.length > 1000 || !s.elections.every(elOk)) return '選挙の記録が不正です';
  if (s.pendingElection !== null && !elOk(s.pendingElection)) return '選挙結果のデータが不正です';
  if (!isObj(s.tutorial) || !intIn(s.tutorial.step, 0, 100) || typeof s.tutorial.done !== 'boolean') return '案内の進み具合が不正です';
  if (!isObj(s.stats) || !finIn(s.stats.pentUp, 0, 1e7)) return '集計のデータが不正です';
  return null;
}

/** 再計算した後の値が全て有限であることの確認（不正な状態を作らないための最後の砦） */
export function derivedFinite(s: GameState): string | null {
  for (const [k, v] of Object.entries(s.stats)) {
    if (Array.isArray(v)) { if (!v.every(isFin)) return `集計「${k}」に数値でない値`; }
    else if (v && typeof v === 'object') { if (!Object.values(v).every(isFin)) return `集計「${k}」に数値でない値`; }
    else if (!isFin(v)) return `集計「${k}」に数値でない値`;
  }
  for (const b of s.buildings) if (!isFin(b.effCap) || !isFin(b.used) || !isFin(b.revenue) || !b.sat.every(isFin) || !b.sv.every(isFin)) return `建物 ${b.id} の計算値に数値でない値`;
  return null;
}
