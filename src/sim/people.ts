// v95：住民一人ひとりの層。既存の世帯数（建物の hh）から住民を決定的に作り、学校・職場・通勤の手段・休日の行き先を割り当て、
// 駅の利用・道路の交通・学校の在籍・事故の起きやすさを住民の積み上げで出す。
// 住民は保存しない（s.seed・建物の番号・世帯数から同じ住民が再生成される）。街の乱数 s.rng は使わない。
// 書き換えるのは月 1 回の事故の統計 s.incid だけ（monthlyIncidents）。人口・満足・お金・交通の既存の式は変えない（設計：docs/v95-住民一人ひとり-設計.md）
import { P, DEFS, W, H, SCALE, isRes, isShop, isCity, fam, lvK, hasOp, countOp } from './config';
import type { GameState, Building } from './types';
import { NHH } from './types';
import { GATEWAYS } from './core';
import { stationStats } from './big';

// ---------------------------------------------------------------- 定数（現実の相場。出典は設計の文書 7 章）
export const ROLE_NAMES = ['未就学児', '小学生', '中学生', '働く人', '家の大人', '高齢者'] as const;
export const MODE_NAMES = ['徒歩', '自転車', 'バス', '電車', '車'] as const;
export const HOL_NAMES = ['家', '買い物', '行楽地', '公園', '通院'] as const;
export type IncidentKind = 'car' | 'ped' | 'bike' | 'rail' | 'crossing' | 'fire' | 'crime';
export const INCIDENT_NAMES: Record<IncidentKind, string> = { car: '車どうし・単独の事故', ped: '歩行者の事故', bike: '自転車の事故', rail: '電車の人身事故（ホーム）', crossing: '踏切事故', fire: '住宅火災', crime: '刑法犯' };
const R_PRE = 0, R_ELEM = 1, R_JHS = 2, R_WORK = 3, R_HOME = 4, R_SENIOR = 5;
const M_WALK = 0, M_BIKE = 1, M_BUS = 2, M_RAIL = 3, M_CAR = 4, M_NONE = 255;
/** 区画の大きさ（km）と、道路の回り道の係数 */
const KM = 0.03, DETOUR = 1.25;
/** 平日・休日の日数（1 か月） */
const WEEKDAYS = 20, HOLIDAYS = 10;
/** 事故の基準の率（100 万キロあたりの件数）。全国の件数 ÷ 推計の延べ距離（警察庁 2023 年の相場）。CAL は地図の縮尺の補正（下記） */
const RATE = { car: 0.5, ped: 1.2, bike: 1.5 };
/** 地図の縮尺の補正：地図の中だけを走る距離は実際の街より短い（市外へ出た先の距離を数えない）ので、市内の延べ距離あたりの率を上げて、
 *  「人口 10 万人あたり年 250 件」前後になるよう合わせた（scripts/v95-people.ts で確かめた） */
const CAL = 2.5;
/** 1 件あたりの死者・負傷者 */
const FATAL: Record<IncidentKind, number> = { car: 0.006, ped: 0.02, bike: 0.005, rail: 0.35, crossing: 0.4, fire: 0.09, crime: 0.001 };
const HURT: Record<IncidentKind, number> = { car: 1.25, ped: 1.0, bike: 1.0, rail: 0.65, crossing: 0.6, fire: 0.5, crime: 0.05 };
/** ホームの人身事故：乗車 1 億回あたり（国交省の相場）。踏切事故：1 か所あたり年。住宅火災：1 世帯あたり年（消防白書）。刑法犯：人口 10 万人あたり年 */
const RAIL_PER_BOARD = 1.2e-8, CROSSING_PER_YEAR = 0.006, FIRE_PER_HH_YEAR = 2.0e-4, CRIME_PER_CAPITA_YEAR = 560e-5;

// ---------------------------------------------------------------- 乱数（住民ごとのハッシュ）
function h32(a: number, b: number, c: number, d = 0): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (c + 0x165667b1), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ (d + 0x27d4eb2f), 0x85ebca6b); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// ---------------------------------------------------------------- 住民
export interface People {
  key: string;
  n: number;
  /** 住まいの建物の番号（Building.id） */
  home: Int32Array;
  hhType: Uint8Array;
  role: Uint8Array;
  /** 平日の行き先（建物の番号。-1 は家にいる、-2 は市外） */
  dest: Int32Array;
  /** 平日の手段（255 は移動なし） */
  mode: Uint8Array;
  /** 電車の人が使う駅（建物の番号。-1 は使わない）と、駅までの手段 */
  station: Int32Array;
  access: Uint8Array;
  /** 出発・帰りの時刻（時） */
  depart: Float32Array;
  back: Float32Array;
  /** 片道の距離（km） */
  dist: Float32Array;
  /** 働く人：正規 1・非正規 0。所得（万円/月。高齢者は年金） */
  regular: Uint8Array;
  income: Float32Array;
  /** 休日の過ごし方（HOL_NAMES）と行き先（建物の番号） */
  hol: Uint8Array;
  holDest: Int32Array;
  holMode: Uint8Array;
  /** 平日に通院する日がある（その月の代表の 1 日に通院する割合で決めた） */
  clinic: Uint8Array;
}

/** 類型 t の 1 世帯あたりの役割ごとの人数（P.persons と合計が一致） */
export function roleComp(t: number): number[] {
  const pre = P.preschool[t] ?? 0, el = P.schoolKids[t] ?? 0, j = P.jhsKids[t] ?? 0, w = P.workers[t] ?? 0;
  const rest = Math.max(0, P.persons[t] - pre - el - j - w);
  return t === 4 ? [pre, el, j, w, 0, rest] : [pre, el, j, w, rest, 0];
}

/** 建物の中心（建物の番号ごと。build のはじめに作り直す） */
let CX = new Float64Array(0), CY = new Float64Array(0);
/** いまの CX・CY・メモがどの街のものか */
let lastS: GameState | null = null, lastKey = '';
function centers(s: GameState): void {
  let mx = 0; for (const b of s.buildings) if (b.id > mx) mx = b.id;
  CX = new Float64Array(mx + 1); CY = new Float64Array(mx + 1);
  for (const b of s.buildings) { const d = DEFS[b.kind]; CX[b.id] = b.x + d.w / 2; CY[b.id] = b.y + d.h / 2; }
}
const cx = (b: Building) => CX[b.id], cy = (b: Building) => CY[b.id];
/** 建物ごとの近くの施設（同じ建物の住民で使い回す） */
const nearMemo = new Map<string, Map<number, Building | null>>();
const dTiles = (a: Building, b: Building) => Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b));
const toKm = (tiles: number) => tiles * KM * DETOUR;
const isHealth = (b: Building) => fam(b.kind) === 'health' || b.kind === 'hospital' || b.kind === 'univHospital' || b.kind === 'nightClinic';
const LEISURE_CATS = new Set(['leisure', 'landmark', 'nature', 'history', 'park']);

type Ctx = { s: GameState; res: Building[]; byId: Map<number, Building>; stations: Building[]; target: number };

/** 建物の世帯から住民の人数を決める（最大剰余法で合計を人口に一致させる）。戻り値は [建物の添字, 類型, 役割, 人数] の並び */
function counts(c: Ctx): Int32Array {
  const cells: number[] = [], fr: number[] = [], roleE = [0, 0, 0, 0, 0, 0];
  const comps = Array.from({ length: NHH }, (_, t) => roleComp(t));
  c.res.forEach((b, ri) => {
    const hh = b.hh ?? [];
    for (let t = 0; t < NHH; t++) {
      const n = hh[t] ?? 0; if (n <= 0) continue;
      const comp = comps[t];
      for (let r = 0; r < 6; r++) { if (!comp[r]) continue; const e = n * comp[r], f = Math.floor(e + 1e-9); cells.push(ri, t, r, f); fr.push(e - f); roleE[r] += e; }
    }
  });
  // 1) 役割ごとの人数：合計が目標（人口）になるよう最大剰余法で丸める  2) 役割の中で建物に最大剰余法で配る
  const roleN = largest(roleE, c.target);
  const m = fr.length, byRole: number[][] = [[], [], [], [], [], []], floorR = [0, 0, 0, 0, 0, 0];
  for (let q = 0; q < m; q++) { const r = cells[q * 4 + 2]; byRole[r].push(q); floorR[r] += cells[q * 4 + 3]; }
  for (let r = 0; r < 6; r++) {
    const L = byRole[r]; let need = roleN[r] - floorR[r];
    if (need > 0) { L.sort((a, b) => fr[b] - fr[a] || a - b); for (let k = 0; need > 0 && L.length; k = (k + 1) % L.length, need--) cells[L[k] * 4 + 3]++; }
    else if (need < 0) { L.sort((a, b) => fr[a] - fr[b] || a - b); for (let k = 0; k < L.length && need < 0; k++) if (cells[L[k] * 4 + 3] > 0) { cells[L[k] * 4 + 3]--; need++; } }
  }
  return Int32Array.from(cells);
}
/** 実数の並び v を、合計 total の整数に丸める（最大剰余法。同じ端数は前のものを優先） */
function largest(v: number[], total: number): number[] {
  const f = v.map(x => Math.floor(x + 1e-9)); let need = total - f.reduce((a, x) => a + x, 0);
  const o = v.map((_, i) => i).sort((a, b) => (v[b] - f[b]) - (v[a] - f[a]) || a - b);
  for (let k = 0; need > 0; k = (k + 1) % o.length, need--) f[o[k]]++;
  for (let k = o.length - 1; need < 0 && k >= 0; k--) if (f[o[k]] > 0) { f[o[k]]--; need++; }
  return f;
}

/** 近い順に定員まで割り当てる（保育・学校）。groups は [建物, 人数]。戻り値は建物ごとの [施設の番号, 人数] の並び */
function nearestFill(groups: [Building, number][], facs: Building[], cap: (b: Building) => number, maxD: number): Map<Building, [number, number][]> {
  const left = facs.map(cap), pairs: [number, number, number][] = [], out = new Map<Building, [number, number][]>(), want = groups.map(g => g[1]);
  groups.forEach(([b], gi) => facs.forEach((f, fi) => { const d = dTiles(b, f); if (d <= maxD) pairs.push([d, gi, fi]); }));
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  for (const [, gi, fi] of pairs) {
    if (want[gi] <= 0 || left[fi] <= 0) continue;
    const take = Math.min(want[gi], Math.floor(left[fi])); if (take <= 0) continue;
    want[gi] -= take; left[fi] -= take;
    const g = groups[gi][0], l = out.get(g) ?? []; l.push([facs[fi].id, take]); out.set(g, l);
  }
  return out;
}

const cache = new WeakMap<GameState, { key: string; p: People; st: PeopleStats }>();
const keyOf = (s: GameState) => `${s.month}:${s.bVersion}:${s.roadVersion}:${Math.round((s.stats?.pop ?? 0) * 100)}:${(s.busStops ?? []).length}:${(s.pol as { rail?: { door?: boolean } } | undefined)?.rail?.door ? 1 : 0}:${JSON.stringify(s.streets ?? {}).length}:${(s.footbridge ?? []).length}`;

/** 住民の一覧（同じ状態からは同じ住民）。1 か月に 1 回だけ作る */
export function people(s: GameState): People { return build(s).p; }

function build(s: GameState): { p: People; st: PeopleStats } {
  const key = keyOf(s), c0 = cache.get(s);
  // 建物の中心・近くの施設のメモはモジュールで 1 つだけ持つので、別の街（保存から読み込んだ複製・予測の複製）を計算したあとに
  // この街の作り置きを使うときは、この街の中心で作り直す（前は別の街の中心のまま距離を測り、保存・読込の前後で結果がずれた）
  if (c0 && c0.key === key) { if (lastS !== s || lastKey !== key) { nearMemo.clear(); candCache.clear(); centers(s); lastS = s; lastKey = key; } return c0; }
  nearMemo.clear(); candCache.clear(); centers(s); lastS = s; lastKey = key;
  const res = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating');
  const byId = new Map(s.buildings.map(b => [b.id, b] as [number, Building]));
  const hhT = [0, 0, 0, 0, 0]; for (const b of res) for (let t = 0; t < NHH; t++) hhT[t] += b.hh?.[t] ?? 0;
  let tot = 0; for (let t = 0; t < NHH; t++) tot += hhT[t] * P.persons[t]; // core.ts の人口と同じ順で足す
  const stations = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating' && b.connected);
  const c: Ctx = { s, res, byId, stations, target: Math.round(tot) };
  const cells = counts(c);
  let n = 0; for (let k = 3; k < cells.length; k += 4) n += cells[k];
  const p: People = {
    key, n, home: new Int32Array(n), hhType: new Uint8Array(n), role: new Uint8Array(n), dest: new Int32Array(n).fill(-1), mode: new Uint8Array(n).fill(M_NONE),
    station: new Int32Array(n).fill(-1), access: new Uint8Array(n).fill(M_NONE), depart: new Float32Array(n), back: new Float32Array(n), dist: new Float32Array(n),
    regular: new Uint8Array(n), income: new Float32Array(n), hol: new Uint8Array(n), holDest: new Int32Array(n).fill(-1), holMode: new Uint8Array(n).fill(M_NONE), clinic: new Uint8Array(n),
  };
  // 個人の番号：建物ごと・役割ごとに 0, 1, 2…（建物の番号と合わせて乱数の種にする＝人数が変わらなければ同じ人は同じ選択）
  const kth = new Int32Array(n);
  { let i = 0; const seenK = new Map<string, number>(); for (let q = 0; q < cells.length; q += 4) { const b = res[cells[q]], t = cells[q + 1], r = cells[q + 2], m = cells[q + 3]; const sk = b.id + ':' + r; let k0 = seenK.get(sk) ?? 0; for (let j = 0; j < m; j++, i++) { p.home[i] = b.id; p.hhType[i] = t; p.role[i] = r; kth[i] = k0++; } seenK.set(sk, k0); } }
  const u = (i: number, salt: number) => h32(s.seed, p.home[i] * 8 + p.role[i], kth[i], salt);
  const homeB: Building[] = new Array(n); for (let i = 0; i < n; i++) homeB[i] = byId.get(p.home[i])!;
  const homeOf = (i: number) => homeB[i];

  // ---- 保育・学校（近い順に定員まで。あふれた子は遠くの学校＝市外）
  const groupsOf = (role: number) => { const m = new Map<Building, number>(); for (let i = 0; i < n; i++) if (p.role[i] === role) { const b = homeOf(i); m.set(b, (m.get(b) ?? 0) + 1); } return [...m.entries()]; };
  const ok = (b: Building) => b.status === 'operating' && b.connected && b.effCap > 0;
  const nurs = s.buildings.filter(b => ok(b) && (fam(b.kind) === 'care' || fam(b.kind) === 'privCare'));
  const elem = s.buildings.filter(b => ok(b) && fam(b.kind) === 'school'), jhs = s.buildings.filter(b => ok(b) && fam(b.kind) === 'jhs');
  const assignSchool = (role: number, facs: Building[], maxD: number, useRate = 1) => {
    const alloc = nearestFill(groupsOf(role), facs, b => b.effCap, maxD), ptr = new Map<Building, number>();
    for (let i = 0; i < n; i++) {
      if (p.role[i] !== role) continue;
      const b = homeOf(i);
      if (useRate < 1 && u(i, 1) > useRate) continue; // 家で育てる（保育を使わない）
      const l = alloc.get(b), k = ptr.get(b) ?? 0; let acc = 0, got = -1;
      if (l) for (const [id, m] of l) { if (k < acc + m) { got = id; break; } acc += m; }
      ptr.set(b, k + 1);
      p.dest[i] = got >= 0 ? got : role === R_PRE ? -1 : -2; // 保育に入れない子は家（待機）、学校からあふれた子は遠くの学校
    }
  };
  assignSchool(R_PRE, nurs, P.careRange ?? 30, 0.6); // 保育の利用は未就学児の約 6 割（0〜2 歳の在宅を含む相場）
  assignSchool(R_ELEM, elem, P.schoolRange * 1.5);
  assignSchool(R_JHS, jhs, (P.jhsRange ?? P.schoolRange) * 1.5);

  // ---- 職場：市民が埋めるのは雇用の 65%（残りは市外から通う人＝core.ts の交通の式と同じ）
  const jobB: Building[] = [], jobCap: number[] = [];
  for (const b of s.buildings) {
    if (b.status !== 'operating' || !b.connected || isRes(b.kind)) continue;
    const d = DEFS[b.kind]; let j = 0;
    if (isShop(b.kind)) j = d.jobs ?? 0; else if (d.jobs) j = d.jobs * lvK(b); else if (isCity(b.kind)) j = b.staff ?? 0;
    if (b.kind === 'station') j += [0, 0, 450, 1100][Math.max(0, Math.min(3, b.lv ?? 1))] ?? 0;
    if (j > 0) { jobB.push(b); jobCap.push(Math.round(j * 0.65)); }
  }
  { // 駅・診療所など固定の職（core.ts の 260 × SCALE）は、駅か市の施設に置く
    const host = stations.length ? stations : s.buildings.filter(b => isCity(b.kind) && b.status === 'operating' && b.connected).slice(0, 1);
    for (const b of host) { const k = jobB.indexOf(b), add = Math.round(260 * SCALE * 0.65 / host.length); if (k >= 0) jobCap[k] += add; else { jobB.push(b); jobCap.push(add); } }
  }
  const capAll = jobCap.reduce((a, x) => a + x, 0);
  let nWork = 0; for (let i = 0; i < n; i++) if (p.role[i] === R_WORK) nWork++;
  const fLocal = Math.min(0.85, capAll / Math.max(1, nWork)); // 雇用が十分でも 15% は市外へ（大都市圏の相場）
  const left = Float64Array.from(jobCap), L = 45; // 距離の減衰（区画。約 1.7 km）
  const order: number[] = []; for (let i = 0; i < n; i++) if (p.role[i] === R_WORK) { if (u(i, 3) < fLocal && jobB.length) order.push(i); else p.dest[i] = -2; }
  { const key = new Float64Array(n); for (const i of order) key[i] = u(i, 2); order.sort((a, b) => key[a] - key[b]); }
  const wCache = new Map<number, Float64Array>();
  for (const i of order) {
    const hb = homeOf(i);
    let e = wCache.get(hb.id);
    if (!e) { e = new Float64Array(jobB.length); for (let j = 0; j < jobB.length; j++) e[j] = Math.exp(-dTiles(hb, jobB[j]) / L); wCache.set(hb.id, e); }
    let sum = 0; for (let j = 0; j < jobB.length; j++) sum += left[j] > 0 ? left[j] * e[j] : 0;
    if (sum <= 0) { p.dest[i] = -2; continue; }
    let x = u(i, 4) * sum, got = -1;
    for (let j = 0; j < jobB.length; j++) { if (left[j] <= 0) continue; x -= left[j] * e[j]; if (x <= 0) { got = j; break; } }
    if (got < 0) for (let j = jobB.length - 1; j >= 0; j--) if (left[j] > 0) { got = j; break; }
    left[got]--; p.dest[i] = jobB[got].id;
  }

  // ---- 通勤・通学の手段・時刻（国勢調査 2020 年の相場。設計の文書 2 章）
  const busNear = new Uint8Array(W * H);
  for (const t of s.busStops ?? []) { const x0 = t % W, y0 = (t / W) | 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < W && y < H) busNear[y * W + x] = 1; } }
  const carK = (1 - 0.06 * Math.min(3, countOp(s, 'busTerminal'))) * (hasOp(s, 'autoBusDepot') ? 0.85 : 1) * (hasOp(s, 'robotaxi') ? 0.92 : 1) * (hasOp(s, 'lrt') ? 0.95 : 1);
  const tele = (hasOp(s, 'fiberHub') ? 0.04 : 0) + 0.06; // テレワーク（2023 年の雇用者の実施率の相場 約 15%、うちその日に在宅の割合で 6%）
  const nearSt = (b: Building): [Building | null, number] => { let best: Building | null = null, bd = 1e9; for (const st of stations) { const d = dTiles(b, st); if (d < bd) { bd = d; best = st; } } return [best, toKm(bd)]; };
  const stOf = new Map<number, [Building | null, number]>();
  const stFor = (b: Building) => { let v = stOf.get(b.id); if (!v) { v = nearSt(b); stOf.set(b.id, v); } return v; };
  const ownMemo = new Map<number, number>();
  const carOwn = (b: Building) => { const v = ownMemo.get(b.id); if (v !== undefined) return v; const o = carOwn0(b); ownMemo.set(b.id, o); return o; };
  const carOwn0 = (b: Building) => { const un = b.units ?? 1, [, ds] = stFor(b); return (un <= 1 ? 0.95 : un <= 12 ? 0.82 : b.kind === 'towerMansion' ? 0.55 : 0.68) * (ds < 0.8 ? 0.85 : 1); }; // 自動車検査登録情報協会の世帯の保有の相場（地方 1.5 台・東京 0.4 台）をまるめた
  const SPEED = [4.5, 12, 15, 35, 25]; // km/h
  const decide = (i: number, km: number, outside: boolean, hb: Building, kid: boolean) => {
    const r1 = u(i, 5), r2 = u(i, 6), hasCar = u(i, 7) < carOwn(hb), bus = busNear[hb.acc >= 0 ? hb.acc : hb.y * W + hb.x] === 1;
    const [st, ds] = stFor(hb);
    let m: number;
    if (kid) m = km < 2 ? M_WALK : km < 6 ? M_BIKE : bus ? M_BUS : M_CAR;
    else if (km < 1) m = r1 < 0.55 ? M_WALK : r1 < 0.85 ? M_BIKE : M_CAR;
    else if (km < 3) m = r1 < 0.35 ? M_BIKE : r1 < 0.4 ? M_WALK : bus && r1 < 0.55 ? M_BUS : M_CAR;
    else if (outside && st && ds < 1.5 && r1 < Math.min(0.9, P.railShare * 0.95 * (1 - ds / 2))) m = M_RAIL; // 駅に近いほど電車（既存の駅を使う割合 P.railShare に合わせた）
    else m = bus && r1 > 0.88 ? M_BUS : M_CAR;
    if (m === M_CAR && !kid) {
      if (!hasCar || r2 > carK) m = outside && st && ds < 2.5 && r2 < 0.3 ? M_RAIL : bus ? M_BUS : km < 6 ? M_BIKE : hasCar ? M_CAR : M_RAIL;
    }
    if (m === M_RAIL && !st) m = hasCar ? M_CAR : M_BUS;
    return m;
  };
  for (let i = 0; i < n; i++) {
    const r = p.role[i], hb = homeOf(i);
    if (r === R_WORK) {
      // 雇用形態と所得（労働力調査 2023 年：非正規 37%。職場の種類で月収を変える。賃金構造基本統計調査の相場をまるめた）
      p.regular[i] = u(i, 8) < 0.63 ? 1 : 0;
      const jb = p.dest[i] >= 0 ? byId.get(p.dest[i]) : undefined;
      const base = !jb ? 31 : isShop(jb.kind) ? 19 : isCity(jb.kind) ? 30 : DEFS[jb.kind].cat === 'biz' ? 34 : DEFS[jb.kind].cat === 'industry' ? 28 : 25;
      p.income[i] = base * (p.regular[i] ? 1 : 0.55);
      if (u(i, 9) < tele) { p.mode[i] = M_NONE; continue; } // 今日は在宅勤務
    } else if (r === R_SENIOR) p.income[i] = 11; // 年金（厚生年金・国民年金の平均の相場をまるめた）
    // 家・学校・職場・市外の行き先
    let km = 0, outside = false, tgt: Building | undefined;
    if (r === R_PRE || r === R_ELEM || r === R_JHS || r === R_WORK) {
      if (p.dest[i] === -1) continue;
      if (p.dest[i] === -2) { outside = true; km = r === R_WORK ? 8 + 12 * u(i, 10) : 5; } else { tgt = byId.get(p.dest[i]); km = tgt ? toKm(dTiles(hb, tgt)) : 1; }
      let m = decide(i, km, outside, hb, r !== R_WORK);
      if (r === R_PRE) m = km < 1 ? M_WALK : km < 2.5 ? M_BIKE : M_CAR; // 保護者が送る
      p.mode[i] = m;
      const bus = busNear[hb.acc >= 0 ? hb.acc : hb.y * W + hb.x] === 1;
      if (m === M_RAIL) { const [st, ds] = stFor(hb); p.station[i] = st!.id; p.access[i] = ds < 0.8 ? M_WALK : u(i, 11) < 0.6 ? M_BIKE : bus ? M_BUS : M_CAR; }
      const start = r === R_WORK ? (tgt && isShop(tgt.kind) ? 9.5 : tgt && DEFS[tgt.kind].cat === 'industry' ? 8 : 8.5) : 8;
      const tt = km / SPEED[m] + (m === M_BUS ? 0.15 : m === M_RAIL ? 0.25 : 0.05);
      p.depart[i] = Math.max(5, start - tt - 0.4 * u(i, 12));
      p.back[i] = r === R_WORK ? (p.regular[i] ? 17.5 + 2.5 * u(i, 13) : 15.5 + 2 * u(i, 13)) + tt : r === R_JHS ? 15.5 + 2 * u(i, 13) : r === R_ELEM ? 14.5 + 1.5 * u(i, 13) : 16 + 2 * u(i, 13);
      p.dist[i] = km;
    } else {
      // 家の大人・高齢者：昼に買い物（週 3 日）か通院（外来の受療率：高齢者 1 日 10%、ほか 4%）
      const clin = u(i, 14) < (r === R_SENIOR ? 0.1 : 0.04), shop = u(i, 15) < 3 / 7;
      const pick = clin ? nearestOf(s, hb, isHealth, 'h') : shop ? nearestOf(s, hb, b => isShop(b.kind) || b.kind === 'mall', 's') : null;
      if (!pick) continue;
      p.clinic[i] = clin ? 1 : 0; p.dest[i] = pick.id; km = toKm(dTiles(hb, pick)); p.dist[i] = km;
      const hasCar = u(i, 7) < carOwn(hb);
      p.mode[i] = km < 0.8 ? M_WALK : km < 2.5 && u(i, 16) < 0.5 ? M_BIKE : hasCar && u(i, 16) < (r === R_SENIOR ? 0.75 : 0.85) ? M_CAR : busNear[hb.acc >= 0 ? hb.acc : 0] ? M_BUS : M_WALK;
      p.depart[i] = 9.5 + 5 * u(i, 17); p.back[i] = p.depart[i] + 1 + u(i, 18);
    }
  }

  // ---- 休日（家 25%・買い物 45%・行楽 15%・公園 15%）
  const leisure = s.buildings.filter(b => b.status === 'operating' && b.connected && (DEFS[b.kind].visitors ?? 0) > 0 && !isRes(b.kind) && LEISURE_CATS.has(DEFS[b.kind].cat));
  const lwMemo = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const hb = homeOf(i), r = u(i, 20);
    if (p.role[i] === R_PRE && u(i, 21) < 0.5) continue; // 小さい子は家族といっしょ（半分は数えない）
    let kind = r < 0.25 ? 0 : r < 0.7 ? 1 : r < 0.85 ? 2 : 3, dst: Building | null = null;
    if (kind === 1) dst = nearestOf(s, hb, b => isShop(b.kind) || b.kind === 'mall' || b.kind === 'outletMall' || b.kind === 'department', 'S');
    else if (kind === 2 && leisure.length) { let w = lwMemo.get(hb.id); if (!w) { w = leisure.map(b => (DEFS[b.kind].visitors ?? 0) / (1 + toKm(dTiles(hb, b)))); lwMemo.set(hb.id, w); } let sum = 0; for (const v of w) sum += v; let x = u(i, 22) * sum; for (let j = 0; j < leisure.length; j++) { x -= w[j]; if (x <= 0) { dst = leisure[j]; break; } } dst ??= leisure[leisure.length - 1]; }
    else if (kind === 3) dst = nearestOf(s, hb, b => ok(b) && fam(b.kind) === 'park', 'p');
    if (!dst) kind = 0;
    p.hol[i] = kind;
    if (dst) { p.holDest[i] = dst.id; const km = toKm(dTiles(hb, dst)); const hasCar = u(i, 7) < carOwn(hb); p.holMode[i] = km < 0.8 ? M_WALK : km < 2 && u(i, 23) < 0.5 ? M_BIKE : hasCar ? M_CAR : busNear[hb.acc >= 0 ? hb.acc : 0] ? M_BUS : M_BIKE; }
  }
  const st = accumulate(s, p, byId, stations);
  const out = { key, p, st };
  cache.set(s, out);
  return out;
}

const candCache = new Map<string, Building[]>();
function nearestOf(s: GameState, from: Building, pred: (b: Building) => boolean, tag = ''): Building | null {
  let memo = tag ? nearMemo.get(tag) : undefined; if (tag && !memo) { memo = new Map(); nearMemo.set(tag, memo); }
  if (memo) { const v = memo.get(from.id); if (v !== undefined) return v; }
  let list = tag ? candCache.get(tag) : undefined;
  if (!list) { list = s.buildings.filter(b => b.status === 'operating' && b.connected && pred(b)); if (tag) candCache.set(tag, list); }
  let best: Building | null = null, bd = 1e9; const fx = cx(from), fy = cy(from);
  for (const b of list) { const d = Math.abs(cx(b) - fx) + Math.abs(cy(b) - fy); if (d < bd) { bd = d; best = b; } }
  if (memo) memo.set(from.id, best);
  return best;
}

// ---------------------------------------------------------------- 統計の積み上げ
export interface PeopleStats {
  n: number;
  byRole: number[];
  /** 通勤・通学の手段（働く人・小中学生・保育） */
  modes: number[];
  /** 働く人のうち市内で働く人・市外へ通う人・在宅勤務 */
  localWork: number; outWork: number; teleWork: number;
  /** 駅ごとの朝の乗車（住民） */
  boardings: Map<number, number>;
  /** 学校・保育の在籍、職場の就業者、行楽地の来訪（月）。建物の番号ごと */
  enroll: Map<number, number>; workers: Map<number, number>; visits: Map<number, number>;
  /** 学校からあふれて遠くの学校へ通う子・保育に入れない子（家） */
  farSchool: number; careHome: number;
  /** 区画ごとの 1 日あたりの延べ通過（人・台）：徒歩・自転車・車（市外の人と通過交通を含む） */
  walk: Float32Array; bike: Float32Array; car: Float32Array;
  /** 朝 7〜9 時に通る住民の車（台） */
  carAm: Float32Array;
  /** 手段ごとの時間帯の割合（24 時間、合計 1） */
  hourShare: Float32Array[];
  /** 住民税の積み上げ（万円/月）：所得 × 税率 */
  taxResident: number;
  /** 区画ごとの 1 日の期待件数（交通事故の 3 種類） */
  risk: { car: Float32Array; ped: Float32Array; bike: Float32Array };
  /** 1 か月の期待件数（種類ごと） */
  expected: Record<IncidentKind, number>;
  /** v95 の交通安全の対策（通りの整備）で、歩行者と自転車の事故が何倍になったか（対策なしで 1） */
  newMeasureK: number;
}

/** 道路の区画を L 字にたどる（徒歩・自転車。近いので道路の網の最短路との差は小さい） */
function lPath(a: number, b: number, f: (t: number) => void): void {
  let x = a % W, y = (a / W) | 0; const x1 = b % W, y1 = (b / W) | 0;
  f(y * W + x);
  while (x !== x1) { x += x < x1 ? 1 : -1; f(y * W + x); }
  while (y !== y1) { y += y < y1 ? 1 : -1; f(y * W + x); }
}
/** 道路の距離場をたどって、行き先 rep までの最短路を坂を下るように進む（車） */
const fields = new WeakMap<GameState, { ver: number; m: Map<number, Int16Array> }>();
let bfsQ = new Int32Array(0);
/** 道路の区画 src からの道路の距離（区画数。届かなければ -1）。roadVersion が変わるまで使い回す */
function field(s: GameState, src: number): Int16Array {
  let c = fields.get(s); if (!c || c.ver !== s.roadVersion) { c = { ver: s.roadVersion, m: new Map() }; fields.set(s, c); }
  let d = c.m.get(src); if (d) return d;
  const N = W * H, road = s.road; d = new Int16Array(N).fill(-1); if (bfsQ.length < N) bfsQ = new Int32Array(N);
  if (road[src]) {
    let h = 0, tl = 0; d[src] = 0; bfsQ[tl++] = src;
    while (h < tl) {
      const i = bfsQ[h++], x = i % W, nd = d[i] + 1;
      if (x > 0 && road[i - 1] && d[i - 1] < 0) { d[i - 1] = nd; bfsQ[tl++] = i - 1; }
      if (x < W - 1 && road[i + 1] && d[i + 1] < 0) { d[i + 1] = nd; bfsQ[tl++] = i + 1; }
      if (i >= W && road[i - W] && d[i - W] < 0) { d[i - W] = nd; bfsQ[tl++] = i - W; }
      if (i + W < N && road[i + W] && d[i + W] < 0) { d[i + W] = nd; bfsQ[tl++] = i + W; }
    }
  }
  c.m.set(src, d); return d;
}
function roadPath(s: GameState, from: number, rep: number, f: (t: number) => void): boolean {
  if (from < 0 || rep < 0) return false;
  const d = field(s, rep); let t = from, k = d[t];
  if (k < 0) return false;
  f(t);
  while (k > 0) {
    const x = t % W, y = (t / W) | 0; let nx = -1;
    if (x > 0 && d[t - 1] === k - 1) nx = t - 1; else if (x < W - 1 && d[t + 1] === k - 1) nx = t + 1; else if (y > 0 && d[t - W] === k - 1) nx = t - W; else if (y < H - 1 && d[t + W] === k - 1) nx = t + W;
    if (nx < 0) break; t = nx; k--; f(t);
  }
  return true;
}
/** 車の行き先を 32 区画の格子でまとめた代表の道路区画（距離場の数を抑える） */
function repOf(reps: Map<number, number>, tile: number): number {
  if (tile < 0) return -1;
  const cell = ((((tile / W) | 0) / 32) | 0) * 1000 + (((tile % W) / 32) | 0);
  let r = reps.get(cell); if (r === undefined) { r = tile; reps.set(cell, r); } return r;
}

function accumulate(s: GameState, p: People, byId: Map<number, Building>, stations: Building[]): PeopleStats {
  const N = W * H, walk = new Float32Array(N), bike = new Float32Array(N), car = new Float32Array(N), carAm = new Float32Array(N);
  const st: PeopleStats = {
    n: p.n, byRole: [0, 0, 0, 0, 0, 0], modes: [0, 0, 0, 0, 0], localWork: 0, outWork: 0, teleWork: 0, boardings: new Map(), enroll: new Map(), workers: new Map(), visits: new Map(),
    farSchool: 0, careHome: 0, walk, bike, car, carAm, hourShare: [0, 1, 2, 3, 4].map(() => new Float32Array(24)), taxResident: 0,
    risk: { car: new Float32Array(N), ped: new Float32Array(N), bike: new Float32Array(N) }, expected: { car: 0, ped: 0, bike: 0, rail: 0, crossing: 0, fire: 0, crime: 0 }, newMeasureK: 1,
  };
  const gw = GATEWAYS.filter(g => s.road[g]);
  const gate = (t: number) => { let best = -1, bd = 1e9; for (const g of gw) { const d = Math.abs(g % W - t % W) + Math.abs(((g / W) | 0) - ((t / W) | 0)); if (d < bd) { bd = d; best = g; } } return best; };
  const acc = (b: Building | undefined) => (b && b.acc >= 0 ? b.acc : -1);
  // 同じ出発・行き先・手段をまとめる（重み＝1 日あたりの片道の人数）
  // 出発（家・市外の出入口）ごとに、行き先・手段の重みをまとめてから経路に載せる（住民は家ごとに並んでいる）
  const carL = new Map<number, number>(), slowL = new Map<number, number>(); let cur = -1;
  const reps = new Map<number, number>(); for (const g of gw) reps.set(-1 - g, g);
  const flush = () => {
    if (cur < 0) return;
    for (const [k, w] of carL) { const am = k & 1, rep = k >> 1; roadPath(s, cur, rep, am ? t => { car[t] += w; carAm[t] += w / wd; } : t => { car[t] += w; }); }
    for (const [k, w] of slowL) { const arr = k & 1 ? bike : walk; lPath(cur, k >> 1, t => { if (s.road[t]) arr[t] += w; }); }
    carL.clear(); slowL.clear();
  };
  /** home（家の側）と other のあいだの片道の移動（往復は 2 回呼ぶ） */
  const addTrip = (home: number, other: number, mode: number, w: number, hour: number, am: boolean) => {
    if (home < 0 || other < 0 || w <= 0) return;
    if (mode >= 0 && mode < 5) st.hourShare[mode][Math.max(0, Math.min(23, Math.floor(hour)))] += w;
    if (home !== cur) { flush(); cur = home; }
    if (mode === M_CAR) { const rep = gw.includes(other) ? other : repOf(reps, other); const k = rep * 2 + (am ? 1 : 0); carL.set(k, (carL.get(k) ?? 0) + w); }
    else if (mode === M_WALK || mode === M_BIKE) { const k = other * 2 + (mode === M_BIKE ? 1 : 0); slowL.set(k, (slowL.get(k) ?? 0) + w); }
  };
  const wd = WEEKDAYS / 30, hd = HOLIDAYS / 30, tax = s.tax ?? { res: 1, prop: 1, biz: 1, stay: 0 };
  for (let i = 0; i < p.n; i++) {
    const r = p.role[i], hb = byId.get(p.home[i])!; st.byRole[r]++;
    st.taxResident += p.income[i] * P.residentTaxRate * tax.res;
    const from = acc(hb), m = p.mode[i];
    if (r === R_WORK) { if (m === M_NONE) st.teleWork++; else if (p.dest[i] === -2) st.outWork++; else st.localWork++; }
    if (p.dest[i] >= 0 && r !== R_HOME && r !== R_SENIOR) { const map = r === R_WORK ? st.workers : st.enroll; map.set(p.dest[i], (map.get(p.dest[i]) ?? 0) + 1); }
    if ((r === R_ELEM || r === R_JHS) && p.dest[i] === -2) st.farSchool++;
    if (r === R_PRE && p.dest[i] === -1) st.careHome++;
    if (m !== M_NONE && r !== R_HOME && r !== R_SENIOR) st.modes[m]++;
    if (m !== M_NONE) {
      const tb = p.dest[i] >= 0 ? byId.get(p.dest[i]) : undefined;
      const days = r === R_HOME || r === R_SENIOR ? wd : wd; // 平日だけ
      if (m === M_RAIL) {
        const sb = byId.get(p.station[i]); st.boardings.set(p.station[i], (st.boardings.get(p.station[i]) ?? 0) + 1);
        addTrip(from, acc(sb), p.access[i], days, p.depart[i], true); addTrip(from, acc(sb), p.access[i], days, p.back[i], false);
      } else if (m !== M_BUS) {
        const to = tb ? acc(tb) : gate(from);
        addTrip(from, to, m, days, p.depart[i], p.depart[i] >= 6.5 && p.depart[i] < 9 && r !== R_SENIOR && r !== R_HOME);
        addTrip(from, to, m, days, p.back[i], false);
      } else st.hourShare[M_BUS][Math.floor(p.depart[i])] += days;
    }
    if (p.holDest[i] >= 0) {
      const tb = byId.get(p.holDest[i]); st.visits.set(p.holDest[i], (st.visits.get(p.holDest[i]) ?? 0) + HOLIDAYS);
      const hm = p.holMode[i], dep = 10 + 4 * h32(s.seed, i, 7, 31);
      addTrip(from, acc(tb), hm, hd * (hm === M_CAR ? 0.4 : 1), dep, false); addTrip(from, acc(tb), hm, hd * (hm === M_CAR ? 0.4 : 1), dep + 2.5, false); // 車は家族で 1 台（乗車 2.5 人の相場）
    }
  }
  // 市外から通う人（雇用の 35%）と来訪者（1 日あたり visitors/30、車 1 台 2.5 人）。市外の出入口から
  for (const b of s.buildings) {
    if (b.status !== 'operating' || !b.connected || isRes(b.kind) || b.acc < 0) continue;
    const d = DEFS[b.kind], jobs = (d.jobs ?? 0) * (isShop(b.kind) ? 1 : lvK(b));
    const vol = jobs * 0.35 * 0.8 * wd + (d.visitors ?? 0) / 30 / 2.5;
    if (vol > 0.5) { const g = gate(b.acc); addTrip(g, b.acc, M_CAR, vol, 8, true); addTrip(g, b.acc, M_CAR, vol, 18, false); }
  }
  // 経路を重ねる
  flush();
  for (let t = 0; t < N; t++) if (s.road[t] === 3) car[t] += P.throughTraffic * 10; // 国道の通過交通（ピーク 1 時間 ≒ 1 日の 1 割）
  for (const arr of st.hourShare) { let sum = 0; for (let h = 0; h < 24; h++) sum += arr[h]; if (sum > 0) for (let h = 0; h < 24; h++) arr[h] /= sum; else arr.fill(1 / 24); }

  // ---- 交通事故の起きやすさ（区画・1 日の期待件数）
  const M = measures(s);
  let pbWith = 0, pbWithout = 0;
  for (let t = 0; t < N; t++) {
    const rd = s.road[t]; if (!rd) continue;
    const cap = P.roadCap[rd] ?? 700, vc = s.vc[t] ?? 0;
    const roadK = rd === 1 ? 1.2 : rd === 2 ? 1.0 : 0.8, congK = vc > 1 ? 1.3 : 1;
    const carDen = Math.min(3, Math.max(0.1, Math.sqrt(car[t] / Math.max(200, cap * 2))));
    st.risk.car[t] = car[t] * KM * 1e-6 * RATE.car * CAL * roadK * congK * M.carK(t);
    st.risk.ped[t] = walk[t] * KM * 1e-6 * RATE.ped * CAL * 1.9 * carDen * (rd === 1 && vc > 0.8 ? 1.4 : 1) * M.pedK(t, 12);
    st.risk.bike[t] = bike[t] * KM * 1e-6 * RATE.bike * CAL * 9 * carDen * M.bikeK(t, 12);
    pbWith += st.risk.ped[t] + st.risk.bike[t]; pbWithout += st.risk.ped[t] / M.newPed(t) + st.risk.bike[t] / M.newBike(t);
    st.expected.car += st.risk.car[t] * 30; st.expected.ped += st.risk.ped[t] * 30; st.expected.bike += st.risk.bike[t] * 30;
  }
  st.newMeasureK = pbWithout > 0 ? pbWith / pbWithout : 1;
  // 街灯は夜だけ効く：夜の割合のぶんだけ補正
  const nightP = nightShare(st.hourShare[M_WALK]), nightB = nightShare(st.hourShare[M_BIKE]);
  if (M.anyLight) { st.expected.ped = 0; st.expected.bike = 0; for (let t = 0; t < N; t++) { if (!s.road[t]) continue; const lp = M.lightK(t); st.risk.ped[t] *= 1 - nightP * (1 - lp); st.risk.bike[t] *= 1 - nightB * (1 - lp); st.expected.ped += st.risk.ped[t] * 30; st.expected.bike += st.risk.bike[t] * 30; } }
  // ---- 電車の人身事故（乗車 1 億回あたり 1.2 件。混雑率 150% 超で 1.3 倍。ホームドアで −85%）、踏切事故（1 か所あたり年 0.006 件。複線 1.5 倍）
  const door = (s.pol as { rail?: { door?: boolean } } | undefined)?.rail?.door;
  let board = 0; for (const v of st.boardings.values()) board += v;
  const inbound = s.buildings.reduce((a, b) => a + (b.status === 'operating' && !isRes(b.kind) && stations.length ? ((DEFS[b.kind].jobs ?? 0) * 0.35 * 0.3) : 0), 0); // 市外から電車で来る人
  const crowdK = (s.stats?.railCrowd ?? 0) > 1.5 ? 1.3 : 1;
  st.expected.rail = (board + inbound) * 2 * 30 * RAIL_PER_BOARD * crowdK * (door ? 0.15 : 1) * 4; // ×4：乗車回数の少ない地方の駅でも起きる転落・接触（駅の数の効果）をまるめた
  let cross = 0; if (s.rail) for (let t = 0; t < N; t++) if (s.rail[t] && s.road[t] && !s.railGrade?.[t] && !(s.overpass ?? []).includes(t)) cross += s.rail[t] >= 2 ? 1.5 : 1;
  st.expected.crossing = cross * CROSSING_PER_YEAR / 12;
  // ---- 住宅火災（1 世帯あたり年 2×10⁻⁴。戸建て 1.3・マンション 0.6、築 30 年超 1.3）
  for (const b of s.buildings) { if (!isRes(b.kind) || b.status !== 'operating') continue; let hh = 0; for (let t = 0; t < NHH; t++) hh += b.hh?.[t] ?? 0; const un = b.units ?? 1; st.expected.fire += hh * FIRE_PER_HH_YEAR / 12 * (un <= 1 ? 1.3 : un <= 12 ? 1.0 : 0.6) * ((b.age ?? 0) > 360 ? 1.3 : 1); }
  // ---- 刑法犯（人口 10 万人あたり年 560 件 × 治安の値。属性では上げない＝v90）
  st.expected.crime = p.n * CRIME_PER_CAPITA_YEAR / 12 * Math.max(0.3, Math.min(3, (s.stats?.crime ?? 0.3) / 0.3));
  return st;
}
const nightShare = (h: Float32Array) => { let v = 0; for (let k = 0; k < 24; k++) if (k >= 18 || k < 6) v += h[k]; return v; };

// ---------------------------------------------------------------- 対策（区画ごとの係数。設計の文書 7 章の表）
type Measures = { newPed: (t: number) => number; newBike: (t: number) => number; carK: (t: number) => number; pedK: (t: number, hour: number) => number; bikeK: (t: number, hour: number) => number; lightK: (t: number) => number; anyLight: boolean };
const mCache = new WeakMap<GameState, { key: string; m: Measures }>();
function measures(s: GameState): Measures {
  const key = `${s.bVersion}:${s.roadVersion}:${JSON.stringify(s.streets ?? {})}:${(s.footbridge ?? []).join(',')}`, c = mCache.get(s);
  if (c && c.key === key) return c.m;
  const N = W * H, set = (k: string) => new Set<number>(((s.streets as Record<string, number[] | undefined> | undefined)?.[k]) ?? []);
  const safe = set('safe'), signal = set('signal'), z30 = set('zone30'), light = set('light'), bikeL = set('bike');
  const foot = new Uint8Array(N), patrol = new Float32Array(N).fill(1);
  for (const f of s.footbridge ?? []) { const x0 = f % W, y0 = (f / W) | 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const x = x0 + dx, y = y0 + dy; if (x >= 0 && y >= 0 && x < W && y < H) foot[y * W + x] = 1; } }
  const police = s.buildings.filter(b => (b.kind === 'koban' || b.kind === 'police') && b.status === 'operating');
  if (police.length) for (let t = 0; t < N; t++) { if (!s.road[t]) continue; const x = t % W, y = (t / W) | 0; let k = 1; for (const b of police) { const d = Math.abs(b.x - x) + Math.abs(b.y - y); if (b.kind === 'koban' && d <= 15) k = Math.min(k, 0.92); else if (b.kind === 'police' && d <= 40) k = Math.min(k, 0.95); } patrol[t] = k; }
  const smart = hasOp(s, 'smartSignal') ? 0.9 : 1;
  const z = (t: number) => (z30.has(t) ? 0.77 : 1);
  const m: Measures = {
    carK: t => (signal.has(t) ? 0.7 : 1) * z(t) * patrol[t] * smart,
    newPed: t => (safe.has(t) ? 0.6 : 1) * (signal.has(t) ? 0.7 : 1) * z(t),
    newBike: t => (bikeL.has(t) ? 0.75 : 1) * (signal.has(t) ? 0.8 : 1) * z(t),
    pedK: t => (safe.has(t) ? 0.6 : 1) * (signal.has(t) ? 0.7 : 1) * z(t) * (foot[t] ? 0.4 : 1) * patrol[t],
    bikeK: t => (bikeL.has(t) ? 0.75 : 1) * (signal.has(t) ? 0.8 : 1) * z(t) * patrol[t],
    lightK: t => (light.has(t) ? 0.7 : 1),
    anyLight: light.size > 0,
  };
  mCache.set(s, { key, m });
  return m;
}
/** 区画 t の死亡の割合の係数（歩道とガードレール −30%、ゾーン 30 −40%） */
function fatalK(s: GameState, t: number): number { const st = (s.streets ?? {}) as Record<string, number[] | undefined>; return (st.safe?.includes(t) ? 0.7 : 1) * (st.zone30?.includes(t) ? 0.6 : 1); }

/** 住民から積み上げた統計（1 か月に 1 回だけ計算） */
export function peopleStats(s: GameState): PeopleStats { return build(s).st; }

/** 区画 tile の、時刻 hour（0〜23）の 1 時間あたりの事故の期待件数（ふつうの 1 日）。kind は事故の種類。
 *  描画の担当が事故の演出の頻度や地図レイヤーに使う。交通事故以外（踏切・ホーム・火事）は該当する区画だけ値を持つ */
export function incidentRate(s: GameState, tile: number, hour: number, kind: IncidentKind): number {
  if (tile < 0 || tile >= W * H) return 0;
  const st = peopleStats(s), h = Math.max(0, Math.min(23, Math.floor(hour)));
  if (kind === 'car') return st.risk.car[tile] * st.hourShare[M_CAR][h];
  if (kind === 'ped') return st.risk.ped[tile] * st.hourShare[M_WALK][h];
  if (kind === 'bike') return st.risk.bike[tile] * st.hourShare[M_BIKE][h];
  if (kind === 'crossing') { if (!s.rail?.[tile] || !s.road[tile] || s.railGrade?.[tile] || (s.overpass ?? []).includes(tile)) return 0; return CROSSING_PER_YEAR / 365 * (s.rail[tile] >= 2 ? 1.5 : 1) * (h >= 5 && h < 24 ? 1 / 19 : 0); }
  if (kind === 'rail') { const b = s.buildings.find(o => o.kind === 'station' && o.status === 'operating' && tile >= 0 && o.x <= tile % W && tile % W < o.x + DEFS[o.kind].w && o.y <= ((tile / W) | 0) && ((tile / W) | 0) < o.y + DEFS[o.kind].h); if (!b) return 0; const nb = st.boardings.size || 1; return st.expected.rail / 30 / nb * st.hourShare[M_RAIL][h]; }
  if (kind === 'fire') { const id = s.occ[tile]; const b = id ? s.buildings.find(o => o.id === id) : undefined; if (!b || !isRes(b.kind)) return 0; let hh = 0; for (let t = 0; t < NHH; t++) hh += b.hh?.[t] ?? 0; return hh * FIRE_PER_HH_YEAR / 365 / 24 / (DEFS[b.kind].w * DEFS[b.kind].h); }
  return 0;
}

/** 地図レイヤー用：区画ごとの交通事故の起きやすさ（1 日の期待件数を 0〜1 にならしたもの） */
export function incidentLayer(s: GameState): Float32Array {
  const st = peopleStats(s), N = W * H, out = new Float32Array(N); let mx = 0;
  for (let t = 0; t < N; t++) { out[t] = st.risk.car[t] + st.risk.ped[t] + st.risk.bike[t]; if (out[t] > mx) mx = out[t]; }
  if (mx > 0) for (let t = 0; t < N; t++) out[t] = Math.sqrt(out[t] / mx);
  return out;
}

// ---------------------------------------------------------------- 月ごとの事故の統計
export interface IncidentMonth { m: number; car: number; ped: number; bike: number; rail: number; crossing: number; fire: number; crime: number; killed: number; hurt: number; seen: number; top: number }
const KINDS: IncidentKind[] = ['car', 'ped', 'bike', 'rail', 'crossing', 'fire', 'crime'];
function poisson(lam: number, u: (k: number) => number): number {
  if (lam <= 0) return 0;
  if (lam > 30) { const z = Math.sqrt(-2 * Math.log(Math.max(1e-12, u(0)))) * Math.cos(2 * Math.PI * u(1)); return Math.max(0, Math.round(lam + Math.sqrt(lam) * z)); }
  let k = 0, p = 1; const L = Math.exp(-lam); for (; k < 200; k++) { p *= u(k + 2); if (p <= L) break; } return k;
}
function entryOf(s: GameState): IncidentMonth {
  const list = s.incid ?? (s.incid = []);
  let e = list.find(x => x.m === s.month);
  if (!e) { e = { m: s.month, car: 0, ped: 0, bike: 0, rail: 0, crossing: 0, fire: 0, crime: 0, killed: 0, hurt: 0, seen: 0, top: -1 }; list.push(e); list.sort((a, b) => a.m - b.m); while (list.length > 24) list.shift(); }
  return e;
}

/** 月末に 1 回：住民の移動から期待件数を出し、件数・死者・負傷者を引いて s.incid に残す（乱数は s.seed・月・種類のハッシュ） */
const incCache = new WeakMap<GameState, { m: number; key: string; pop: number; st: PeopleStats }>();
/** 事故の月次の計算に使う統計：住民の作り直しは 3 か月に 1 回まで（対策・道路・駅が変わればすぐ作り直す）。その間は人口の比で期待件数を伸ばす */
function incidentStats(s: GameState): { st: PeopleStats; k: number } {
  const key = `${s.roadVersion}:${(s.busStops ?? []).length}:${JSON.stringify(s.streets ?? {}).length}:${(s.footbridge ?? []).length}:${(s.pol as { rail?: { door?: boolean } } | undefined)?.rail?.door ? 1 : 0}:${s.buildings.filter(b => b.kind === 'station' || b.kind === 'koban' || b.kind === 'police').length}`;
  const c = incCache.get(s), pop = Math.max(1, s.stats?.pop ?? 1);
  // v95：3 か月に 1 回の作り直しは、作り置き（保存しない）があるかどうかで結果が変わり、保存・読込の前後で事故の件数がずれた。
  // 毎月その時点の住民から出す（住民の作り直しそのものは build の作り置きが建物・道路の変化だけを見て使い回す）
  if (c && c.key === key && s.month === c.m) return { st: c.st, k: pop / c.pop };
  const st = peopleStats(s); incCache.set(s, { m: s.month, key, pop, st }); return { st, k: 1 };
}
export function monthlyIncidents(s: GameState): IncidentMonth {
  const { st, k: popK } = incidentStats(s), e = entryOf(s);
  // 死亡の割合：対策の区画の重み（交通事故は区画ごとの起きやすさで重みをつけた平均）と、高齢者の割合（高齢者は 2 倍。起きやすさは変えない）
  const senior = st.n > 0 ? st.byRole[R_SENIOR] / st.n : 0, ageK = 1 + senior;
  let wsum = 0, fk = 0, top = -1, tv = 0;
  for (let t = 0; t < W * H; t++) { const v = st.risk.car[t] + st.risk.ped[t] + st.risk.bike[t]; if (v <= 0) continue; wsum += v; fk += v * fatalK(s, t); if (v > tv) { tv = v; top = t; } }
  const roadFatal = wsum > 0 ? fk / wsum : 1;
  KINDS.forEach((k, ki) => {
    const u = (j: number) => h32(s.seed, s.month, ki * 7919 + 13, j);
    const n = poisson(st.expected[k] * popK, u); e[k] = n;
    const fp = FATAL[k] * (k === 'car' || k === 'ped' || k === 'bike' ? roadFatal * ageK : k === 'fire' ? ageK : 1);
    for (let j = 0; j < n; j++) { if (h32(s.seed, s.month, ki * 104729 + j, 99) < fp) e.killed++; e.hurt += Math.floor(HURT[k] + h32(s.seed, s.month, ki * 15485863 + j, 77)); }
  });
  e.top = top;
  return e;
}

/** できごと「通学路で交通事故」の起きやすさの倍率：v95 の交通安全の対策（歩道とガードレール・信号機・ゾーン 30・自転車レーン）で歩行者と自転車の事故が減った割合。
 *  対策がなければ 1（v94 のバランスのまま）。歩道橋・交番は前から治安の水準に入っているので、ここには入れない */
export function safetyEventK(s: GameState): number {
  const sk = (s.streets ?? {}) as Record<string, number[] | undefined>;
  if (!['safe', 'signal', 'zone30', 'bike'].some(k => sk[k]?.length)) return 1;
  return Math.max(0.3, Math.min(1, incidentStats(s).st.newMeasureK));
}

/** 描画の中で起きた事故（view.onIncident）を受け取る。件数の本体（sim の確率）には足さず、「見えた分」として数える */
export function recordIncident(s: GameState, e: { kind?: IncidentKind | string; tile?: number }): void {
  if (!s || typeof s !== 'object') return;
  const x = entryOf(s); x.seen++; void e;
}

/** 直近 12 か月の合計と、人口 10 万人あたりの年の件数 */
export function incidentYear(s: GameState): { months: number; total: Record<IncidentKind, number>; killed: number; hurt: number; traffic: number; per100k: number; seen: number } {
  const list = (s.incid ?? []).filter(x => x.m > s.month - 12);
  const total = { car: 0, ped: 0, bike: 0, rail: 0, crossing: 0, fire: 0, crime: 0 } as Record<IncidentKind, number>; let killed = 0, hurt = 0, seen = 0;
  for (const x of list) { for (const k of KINDS) total[k] += x[k]; killed += x.killed; hurt += x.hurt; seen += x.seen; }
  const traffic = total.car + total.ped + total.bike, pop = Math.max(1, s.stats?.pop ?? 1);
  return { months: list.length, total, killed, hurt, traffic, per100k: list.length ? traffic / list.length * 12 / pop * 1e5 : 0, seen };
}

// ---------------------------------------------------------------- 描画とのつなぎ：移動中の住民の経路
export interface Trip { person: number; role: number; mode: number; from: number; to: number; depart: number; path: number[] }
/** 時刻 hour（小数）に移動中の住民を n 件まで返す（平日の代表の 1 日）。道路の区画の並びつき。同じ状態・時刻なら同じ結果 */
export function sampleTrips(s: GameState, hour: number, n: number): Trip[] {
  const p = people(s), out: Trip[] = [], byId = new Map(s.buildings.map(b => [b.id, b] as [number, Building]));
  const gw = GATEWAYS.filter(g => s.road[g]);
  if (n <= 0 || !p.n) return out;
  const start = Math.floor(h32(s.seed, s.month, Math.floor(hour * 60), 5) * p.n);
  for (let k = 0; k < p.n && out.length < n; k++) {
    const i = (start + k) % p.n, m = p.mode[i]; if (m === M_NONE) continue;
    const tt = Math.max(0.1, p.dist[i] / [4.5, 12, 15, 35, 25][m]);
    const going = hour >= p.depart[i] && hour < p.depart[i] + tt, coming = hour >= p.back[i] && hour < p.back[i] + tt;
    if (!going && !coming) continue;
    const hb = byId.get(p.home[i]); if (!hb || hb.acc < 0) continue;
    let to = -1;
    if (m === M_RAIL) to = byId.get(p.station[i])?.acc ?? -1; else if (p.dest[i] >= 0) to = byId.get(p.dest[i])?.acc ?? -1; else if (p.dest[i] === -2 && gw.length) to = gw[0];
    if (to < 0) continue;
    const path: number[] = [], push = (t: number) => { if (s.road[t]) path.push(t); };
    const a = going ? hb.acc : to, b = going ? to : hb.acc;
    if (m === M_CAR || m === M_BUS) { if (!roadPath(s, a, b, push)) lPath(a, b, push); } else lPath(a, b, push);
    out.push({ person: i, role: p.role[i], mode: m === M_RAIL ? p.access[i] === M_NONE ? M_WALK : p.access[i] : m, from: a, to: b, depart: going ? p.depart[i] : p.back[i], path });
  }
  return out;
}

/** 開発用：住民から積み上げた値と既存の値の比べ */
export function compareWithAggregate(s: GameState): { label: string; people: number; agg: number }[] {
  const st = peopleStats(s), sumMap = (m: Map<number, number>) => { let v = 0; for (const x of m.values()) v += x; return v; };
  const school = s.buildings.filter(b => fam(b.kind) === 'school' && b.effCap > 0).reduce((a, b) => a + b.used, 0);
  return [
    { label: '人口', people: st.n, agg: Math.round(s.stats.pop) },
    { label: '就業者', people: st.byRole[R_WORK], agg: Math.round(s.stats.workers) },
    { label: '小学生', people: st.byRole[R_ELEM], agg: Math.round(s.stats.schoolKids) },
    { label: '中学生', people: st.byRole[R_JHS], agg: Math.round(s.stats.jhsKids) },
    { label: '小学校の在籍', people: [...st.enroll.entries()].filter(([id]) => s.buildings.find(b => b.id === id && fam(b.kind) === 'school')).reduce((a, [, v]) => a + v, 0), agg: Math.round(school) },
    { label: '市内で働く市民', people: st.localWork, agg: Math.round(s.stats.localJobs * 0.65) },
    { label: '駅の朝の乗車（既存は 1 日の乗降）', people: sumMap(st.boardings), agg: stationStats(s).reduce((a, x) => a + x.riders, 0) },
    { label: '住民税（万円/月。既存は景気の係数込み）', people: Math.round(st.taxResident), agg: Math.round(s.ledger.at(-1)?.taxResident ?? 0) },
  ];
}
