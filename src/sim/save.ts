// 保存と読込。形式バージョン、乱数状態、進行中の工事・イベントを含む GameState 全体を保存する。
import { recompute } from './core';
import { validateState, derivedFinite } from './validate';
import { repairState } from './core';
import type { GameState } from './types';
import { NEIGHBOR_SEED, W, H, FIC_W, FIC_H, FIC_OLD, FIC_PREV_W, FIC_PREV_H, DEFS } from './config';
import { REAL } from './real';
import { newGame, initFictionRail } from './scenario';
import { EVENTS } from './events';
import { MAP_ID } from './real';
import { mapEntry } from '../maps/registry';

export const SAVE_FORMAT = 'sumucity-save';
/** 保存形式の版。v87 で 2（住野市の地図が 128×112 に）。1 の保存データも読み、住野市なら広げる */
export const SAVE_VERSION = 2;
/** v89 までの「隣町との合併」の効果の表示名（modifiers.src）と、v90 の読み替え */
const MERGE_OLD_SRC = '隣町との合併', MERGE_NEW_SRC = '広域連合（旧：隣町との合併の特例）';

/** 再計算で作り直せる値は保存しない（データを小さくするため） */
const DERIVED = new Set(['acc', 'connected', 'effCap', 'used', 'revenue', 'shopP', 'sv', 'sat', 'unmet']);
export function serialize(s: GameState): string {
  return JSON.stringify({ format: SAVE_FORMAT, version: SAVE_VERSION, savedAt: s.month, mapId: MAP_ID, state: s }, function (this: any, k, v) {
    if (DERIVED.has(k) && this && typeof this === 'object' && 'kind' in this && 'status' in this) return undefined;
    if (k === 'vc' && this && 'roadVersion' in this) return undefined;
    if (k === 'voices' && this && 'roadVersion' in this) return undefined;
    return v;
  });
}
/** 保存しなかった値を、新しく建てたときと同じ初期値・同じ項目順で補う（読込後の状態を保存前と完全に同じにするため） */
function insertAfter(o: any, after: string, add: Record<string, unknown>): any {
  const out: any = {};
  for (const k of Object.keys(o)) { out[k] = o[k]; if (k === after) for (const [ak, av] of Object.entries(add)) if (!(ak in o)) out[ak] = av; }
  for (const [ak, av] of Object.entries(add)) if (!(ak in out)) out[ak] = av;
  return out;
}
function fillDerived(data: any): void {
  const s = data?.state;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return;
  let t = s;
  if (Array.isArray(s.road)) t = insertAfter(t, 'occ', { vc: new Array(s.road.length).fill(0) });
  t = insertAfter(t, 'history', { voices: [] });
  if (Array.isArray(t.buildings)) t.buildings = t.buildings.map((b: any) => (b && typeof b === 'object' && !Array.isArray(b) ? insertAfter(b, 'v', { acc: -1, connected: false, effCap: 0, used: 0, revenue: 0, shopP: 0, sv: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], sat: [0, 0, 0, 0, 0], unmet: 0 }) : b));
  data.state = t;
}

/** 保存データがどの地図のものか（読めなければ null。ID のない古いデータは住野市か保土ケ谷） */
export function saveMapId(text: string): string | null {
  const m = /^\{"format":"sumucity-save","version":\d+,"savedAt":-?\d+,"mapId":"([a-z0-9_-]{1,24})"/.exec(text.slice(0, 200));
  if (m) return m[1];
  const r = /"road":\[/.exec(text); if (!r) return null;
  let n = 1; for (let i = r.index + 8, end = Math.min(text.length, r.index + 200000); i < end && text[i] !== ']'; i++) if (text[i] === ',') n++;
  return n === FIC_OLD * FIC_OLD || n === FIC_PREV_W * FIC_PREV_H || n === FIC_W * FIC_H ? 'sumino' : n === 157 * 170 ? 'hodogaya' : null;
}

export type LoadResult = { ok: true; state: GameState } | { ok: false; error: string };

/** 読み込める最大の大きさ（文字数）。通常の保存データは数百 KB */
export const MAX_SAVE_CHARS = 8_000_000;

/** 読込。全項目の型・値域・相互参照を確かめ、矛盾があれば理由を返す。失敗しても現在の街には触れない */
export function deserialize(text: string): LoadResult {
  if (typeof text !== 'string' || !text.trim()) return { ok: false, error: '読み込むデータが空です' };
  if (text.length > MAX_SAVE_CHARS) return { ok: false, error: `データが大きすぎます（${Math.round(text.length / 1e6)} MB。上限 ${MAX_SAVE_CHARS / 1e6} MB）` };
  let data: any;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'JSON として読めません（壊れているか、別の種類のファイルです）' }; }
  if (!data || typeof data !== 'object' || data.format !== SAVE_FORMAT) return { ok: false, error: 'スムシティの保存データではありません' };
  if (data.version !== SAVE_VERSION && data.version !== 1) return { ok: false, error: `保存形式の版が違います（データ: ${String(data.version).slice(0, 20)}、対応: ${SAVE_VERSION}）` };
  // 地図の違う保存データ（ID がない古いデータは、区画数の確認で見分ける）
  if (typeof data.mapId === 'string' && data.mapId !== MAP_ID) return { ok: false, error: `この保存データは「${mapEntry(data.mapId)?.name ?? data.mapId.slice(0, 24)}」の地図のものです。タイトル画面でその地図を選んでから読み込んでください` };
  fillDerived(data);
  const s = data.state as GameState;
  // v1 の状態（暮らしの観点・公約の選択・税・隣町を持たない）を v2 へ
  if (s && (s as any).version === 1) migrateV1(s as any);
  // 線路の高さを持たない古いまちづくり版の保存データは、すべて地上とみなす
  if (s && Array.isArray(s.rail) && s.railGrade === undefined) s.railGrade = s.rail.map(() => 0);
  // v8 までの住野市（44×44）の保存データは、東台・南原を足した広い地図に広げる
  // v86 までの住野市（76×68）は、v87 の 128×112 に広げる（東野・新田を足す）
  if (s && !REAL && W === FIC_W && H === FIC_H && Array.isArray(s.road) && (s.road.length === FIC_OLD * FIC_OLD || s.road.length === FIC_PREV_W * FIC_PREV_H)) { try { widenFiction(s, s.road.length === FIC_OLD * FIC_OLD ? FIC_OLD : FIC_PREV_W, s.road.length === FIC_OLD * FIC_OLD ? FIC_OLD : FIC_PREV_H); } catch (e) { return { ok: false, error: '古い住野市の保存データを広い地図に広げられませんでした: ' + (e as Error).message }; } }
  // v12 までの住野市は線路を持たない（地形の鉄道用地だった）。北の端の複線として GameState に移す
  if (s && !REAL && Array.isArray(s.road) && s.road.length === W * H && s.rail === undefined) initFictionRail(s);
  // v90：「隣町との合併」は広域連合に作り替えた。実行済みの街は効果をそのまま引き継ぎ、表示名だけ読み替える
  if (s && Array.isArray((s as any).modifiers)) for (const m of (s as any).modifiers) if (m && m.src === MERGE_OLD_SRC) m.src = MERGE_NEW_SRC;
  if (s && Array.isArray((s as any).buildings)) { try { repairState(s); } catch { /* 形が違えば下の検査で弾く */ } }
  const bad = validateState(s);
  if (bad) return { ok: false, error: bad };
  // v1 の古いセーブとの互換：今月の記録に月初の現金がなければ補う
  if (s.pending.cashStart === undefined) s.pending.cashStart = s.cash + s.pending.capital + s.pending.other - s.pending.borrowed + (s.pending.repay ?? 0);
  try { recompute(s); } catch (e) { return { ok: false, error: '読み込んだ状態を再計算できません: ' + (e as Error).message }; }
  const fin = derivedFinite(s);
  if (fin) return { ok: false, error: '読み込んだ状態から計算できない値が出ました（' + fin + '）' };
  return { ok: true, state: s };
}

/** v1 の保存データを v2 の形にする（足りない項目は、はじめの値で補う。公約は選び直し） */
function migrateV1(s: any): void {
  s.version = 2;
  delete s.pledges;
  s.base = { power: -1, sewage: -1, gas: -1 };
  s.tax = { res: 1, prop: 1, biz: 1, stay: 0 };
  s.fame = 10; s.approval = 0.5; s.polls = [];
  s.goals = []; s.goalPick = s.mode === 'term'; s.vision = null; s.visionStart = Number.isInteger(s.month) ? s.month : 0;
  s.neighbors = NEIGHBOR_SEED.map(n => ({ name: n.name, trait: n.trait, pop: n.pop, appeal: n.appeal, tax: n.tax, rel: 0.5 }));
  s.acts = {}; s.notes = [];
}

/** 狭い住野市（44×44 か 76×68）を今の大きさ（W×H）へ。旧市街はそのままの位置に置き、広げた土地は新しく始めたときの状態にする。
 *  44×44（v8 まで）は 38 行目より南が林と川だったので、そこも新しい土地にする。76×68（v86 まで）は全体を残す（南の海・川だった帯は、新しい地形では陸になる空き地） */
export function widenFiction(s: GameState, ow = FIC_OLD, oh = FIC_OLD): void {
  const fresh = newGame({ seed: s.seed }), N = W * H, ON = ow * oh, NV = (W + 1) * (H + 1);
  const inOld = (x: number, y: number) => x < ow && y < (ow === FIC_OLD ? 38 : oh);
  const map = (i: number) => (Number.isInteger(i) && i >= 0 && i < ON ? ((i / ow) | 0) * W + (i % ow) : i);
  const grow = (a: number[], fill: (i: number) => number) => { const out = new Array(N); for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; out[i] = inOld(x, y) && Array.isArray(a) ? a[y * ow + x] ?? fill(i) : fill(i); } return out; };
  const list = (a: number[] | undefined) => (Array.isArray(a) ? a.map(map) : a);
  const fr = fresh as any, S = s as any;
  s.road = grow(s.road, i => fresh.road[i]);
  s.roadAge = grow(s.roadAge, i => fresh.roadAge[i]);
  s.zone = grow(s.zone, i => fresh.zone[i]);
  s.occ = new Array(N).fill(0);
  s.vc = new Array(N).fill(0);
  // 区画ごとの配列（線路は新しい土地にも北の端の複線を通す）
  if (Array.isArray(S.rail)) { S.rail = grow(S.rail, i => fr.rail[i]); S.railGrade = grow(S.railGrade, i => fr.railGrade[i]); }
  for (const k of ['railKind', 'area', 'terraT']) if (Array.isArray(S[k])) S[k] = grow(S[k], () => 0);
  if (Array.isArray(S.terraH)) { const o = S.terraH, out = new Array(NV).fill(0); for (let y = 0; y <= Math.min(oh, H); y++) for (let x = 0; x <= Math.min(ow, W); x++) out[y * (W + 1) + x] = o[y * (ow + 1) + x] ?? 0; S.terraH = out; }
  // 区画の番号の一覧
  for (const k of ['tunnel', 'bridge', 'overpass', 'footbridge', 'canal', 'busStops', 'levee', 'wide', 'flyover', 'railCity']) if (Array.isArray(S[k])) S[k] = list(S[k]);
  if (S.streets) for (const k of Object.keys(S.streets)) S.streets[k] = list(S.streets[k]);
  for (const r of S.pol?.routes ?? []) { r.a = map(r.a); r.b = map(r.b); r.path = list(r.path); r.stops = list(r.stops); }
  // 旧市街の中を通る新しい道（v9：丘陵台から南原へ）は、空いている区画だけ
  if (ow === FIC_OLD) for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (inOld(x, y) && fresh.road[i] && !s.road[i] && !s.occ[i]) { s.road[i] = fresh.road[i]; s.roadAge[i] = fresh.roadAge[i]; s.zone[i] = 0; } }
  const boost: Record<string, number> = {}; for (const [k, v] of Object.entries(s.roadBoost ?? {})) boost[String(map(Number(k)))] = v; s.roadBoost = boost;
  // 広げた土地の建物（駅・農家）
  const ids = new Set(s.buildings.map(b => b.id));
  for (const b of s.buildings) { const d = DEFS[b.kind]; for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) s.occ[(b.y + dy) * W + b.x + dx] = b.id; }
  for (const b of fresh.buildings) {
    const d = DEFS[b.kind];
    let out = true; for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) { const i = (b.y + dy) * W + b.x + dx; if (inOld(b.x + dx, b.y + dy) || s.road[i] || s.occ[i] || S.rail?.[i]) out = false; }
    if (!out) continue;
    const nb = structuredClone(b); if (ids.has(nb.id)) nb.id = s.nextId++; ids.add(nb.id);
    nb.builtMonth = s.month + (b.builtMonth ?? 0);
    s.buildings.push(nb);
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) s.occ[(b.y + dy) * W + b.x + dx] = nb.id;
  }
  // できごとの対象が区画のもの（出店・建設の場所、火事・突風・道路）は区画の番号を付け替える
  const tileEff = (e: any) => e && (e.t === 'openStore' || e.t === 'place' || e.t === 'roadBoost' || (e.t === 'damage' && (e.what === 'wind' || e.what === 'fire')));
  for (const a of s.events?.active ?? []) { const def = EVENTS.find(d => d.id === a.id); if (def && def.options.some(o => o.effects.some(tileEff))) a.target = map(a.target); }
  for (const sc of s.scheduled ?? []) if (tileEff(sc.eff)) sc.target = map(sc.target);
  s.roadVersion++; s.bVersion++;
}
