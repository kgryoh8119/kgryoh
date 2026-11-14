// 実在都市の地図（取り込み処理 src/mapgen/importer.ts の出力）を読み込む。架空の街では null。
// 地図はゲーム開始時に setMap で選ぶ。地図に依存する値は各モジュールが onMapChange で作り直す。

/** 線。pts: x,z（m）。線路では tunnel（トンネル・地下）、service（車庫・側線・渡り線）、freight（貨物線）、highspeed（新幹線）も持つ */
export interface RealLine { cls: number; bridge: boolean; pts: Float32Array; tunnel?: boolean; service?: boolean; freight?: boolean; highspeed?: boolean }
/** 線路の線の頭の値（ビット）：1 橋・2 トンネル・4 側線など・8 貨物線・16 新幹線 */
export const RAILBIT = { bridge: 1, tunnel: 2, service: 4, freight: 8, highspeed: 16 };
export interface RealMap {
  id: string; name: string; credits: string; W: number; H: number; tile: number;
  bbox: { s: number; w: number; n: number; e: number };
  dem: { cols: number; rows: number; step: number; h: Float32Array }; // 標高（m）
  road: Uint8Array; flags: Uint8Array; district: Uint8Array;
  districts: { name: string; x: number; y: number }[];
  gateways: number[]; through: [number, number];
  lots: [number, number, number, number, number][]; names: Record<string, string>;
  bld: Uint16Array; // [x*10, z*10, type | levels<<4] × n
  /** 建物の形 [幅*10, 奥行き*10, 向き（度）] × n。古いデータでは null */
  bldShape: Uint16Array | null;
  roads: RealLine[]; rails: RealLine[]; rivers: RealLine[]; streams: RealLine[]; waters: RealLine[];
  /** 海・大きな水面の区画数。市外の施設で代用したもの（浄水場など） */
  sea: number; assumed: string[];
  /** v90：地図データを集めた日時（ISO。古いデータでは無い） */
  collectedAt?: string;
  /** まちづくり版（実在の地図をもとにゲーム用にデフォルメした街）。区画の用途の初期値を持つ */
  deformed: boolean; zone: Uint8Array | null;
  /** まちづくり版の線路（区画ごと。0 なし・1 単線・2 複線）。プレイヤーが敷設・撤去・複線化できる */
  rail: Uint8Array | null;
  /** まちづくり版の線路の高さ（区画ごと。0 地上・1 高架・2 地下） */
  railGrade: Uint8Array | null;
}
export const RF = { water: 1, rail: 2, forest: 4, blocked: 8, park: 16, open: 32, national: 64, fixed: 128 };
export const LOT_KINDS = ['house', 'apartment', 'mansion', 'bakery', 'shop', 'supermarket', 'nursery', 'privNursery', 'school', 'park', 'fire', 'water', 'waste', 'station', 'clinic', 'koban'] as const;

function b64(s: string): Uint8Array {
  const bin = atob(s), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
const u16 = (s: string) => { const b = b64(s); return new Uint16Array(b.buffer, b.byteOffset, b.byteLength >> 1); };
function lines(s: string, withCls: boolean): RealLine[] {
  const a = u16(s), out: RealLine[] = [];
  for (let i = 0; i < a.length;) {
    const head = a[i++], n = a[i++], pts = new Float32Array(n * 2);
    for (let k = 0; k < n * 2; k++) pts[k] = a[i++] / 2;
    out.push(withCls ? { cls: head >> 1, bridge: !!(head & 1), pts } : { cls: 0, bridge: !!(head & 1), pts, tunnel: !!(head & 2), service: !!(head & 4), freight: !!(head & 8), highspeed: !!(head & 16) });
  }
  return out;
}

export function decodeMap(r: any): RealMap { return decode(r); }
function decode(r: any): RealMap {
  const dv = b64(r.dem.b64), d16 = new Int16Array(dv.buffer, dv.byteOffset, dv.byteLength >> 1), h = new Float32Array(d16.length);
  // v83：陸の標高は 0.3m 以上にそろえる（海は -20m の印のまま）。海抜 0m より低い土地（埋立地・掘り下げた道路や駅前など）が、
  // 海面（-0.5m）より下になり、道路や敷地の上に水面が顔を出していた
  for (let i = 0; i < h.length; i++) { const v = d16[i] / 10; h[i] = v <= -19 ? v : Math.max(0.3, v); }
  return {
    id: r.id ?? 'hodogaya', name: r.name, credits: r.credits, W: r.W, H: r.H, tile: r.tile, bbox: r.bbox,
    dem: { cols: r.dem.cols, rows: r.dem.rows, step: r.dem.step, h },
    road: b64(r.road), flags: b64(r.flags), district: b64(r.district), districts: r.districts,
    gateways: r.gateways, through: r.through, lots: r.lots, names: r.names, bld: u16(r.bld), bldShape: r.bldShape ? u16(r.bldShape) : null,
    deformed: !!r.deformed, zone: r.zone ? b64(r.zone) : null, rail: r.railTiles ? b64(r.railTiles) : null, railGrade: r.railTiles ? (r.railGrade ? b64(r.railGrade) : new Uint8Array(r.W * r.H)) : null,
    sea: r.seaTiles ?? 0, assumed: Array.isArray(r.assumed) ? r.assumed.map(String) : [], collectedAt: typeof r.collectedAt === 'string' ? r.collectedAt.slice(0, 40) : undefined,
    roads: lines(r.roads, true), rails: lines(r.rails, false), rivers: lines(r.rivers, false), streams: lines(r.streams, false), waters: lines(r.waters, false),
  };
}

/** いまの地図（実在都市）。架空の街「住野市」では null */
export let REAL: RealMap | null = null;
/** いまの地図の ID と、取り込んだままの地図データ（予測の別スレッドへ渡す） */
export let MAP_ID = 'sumino';
export let MAP_RAW: any = null;
const hooks: (() => void)[] = [];
/** 地図が変わったときに作り直す処理を登録する（登録時に一度呼ぶ） */
export function onMapChange(f: () => void): void { hooks.push(f); f(); }
/** 地図を切り替える。raw が null なら架空の街 */
export function setMap(id: string, raw: any | null): void {
  REAL = raw ? decode(raw) : null; MAP_ID = id; MAP_RAW = raw;
  for (const f of hooks) f();
}

/** v90：実データと推計の区別（UI のラベル用）。実在マップでは出典と取得日も返す */
export const DATA_REAL = '地形・道路・鉄道・川・建物の位置', DATA_EST = '世帯・人口・資産・施設の能力・財政・外国人住民などの人数';
export function dataSource(): { real: boolean; credits: string; date: string; assumed: string[]; note: string } {
  if (!REAL) return { real: false, credits: '', date: '', assumed: [], note: '架空の街です。すべての値はゲーム上の仮定です。' };
  const date = REAL.collectedAt ? REAL.collectedAt.slice(0, 10) : '';
  return { real: true, credits: REAL.credits, date, assumed: REAL.assumed, note: `実データ：${DATA_REAL}（${REAL.credits}${date ? `、${date} 取得` : ''}）。推計（ゲーム上の仮定）：${DATA_EST}。実在の自治体の統計ではありません。${REAL.assumed.length ? `範囲外の施設で代用：${REAL.assumed.join('・')}。` : ''}` };
}
