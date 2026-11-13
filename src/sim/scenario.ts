// 初期シナリオ「駅前開発で子育て世帯が増える郊外都市」
import { onMapChange } from './real';
import { W, H, P, DEFS, POLICIES, NEIGHBOR_SEED, isRes, FIC_PREV_W } from './config';
import { getMap, idx, buildable, hash, inMap, NEIGH, syncTerrain, terrainOf, terrainIx } from './map';
import { recompute, emptyStats } from './core';
import { addBuilding, removeBuilding } from './events';
import { emptyLedger } from './step';
import type { GameState, Kind, Zone, Building } from './types';
import { REAL, LOT_KINDS, MAP_ID } from './real';
import { mapEntry, baseEntry } from '../maps/registry';

let N = 0;
onMapChange(() => { N = W * H; });

export function newGame(opts: { seed?: number; short?: boolean } = {}): GameState {
  const seed = opts.seed ?? 20261011;
  syncTerrain(null); // 前の街の地形の造作を外す
  const m = getMap(seed);
  const s: GameState = {
    version: 2, seed, rng: seed | 0, month: 0, term: 1, termStart: 0,
    termLength: opts.short ? P.shortTermMonths : P.termMonths, mode: 'term', cityName: (REAL ? baseEntry(MAP_ID)?.cityName ?? REAL.name : terrainIx(seed) ? terrainOf(seed).city : baseEntry(MAP_ID)?.cityName ?? '住野市').slice(0, 40),
    cash: P.startCash, loans: [],
    road: new Array(N).fill(0), roadAge: new Array(N).fill(0), roadBoost: {}, zone: new Array(N).fill(0), occ: new Array(N).fill(0), vc: new Array(N).fill(0),
    buildings: [], nextId: 1, roadVersion: 1, bVersion: 1,
    policies: Object.fromEntries(POLICIES.map(p => [p.id, { on: false, since: 0 }])),
    modifiers: [], scheduled: [], events: { active: [], cooldown: {}, log: [] }, streak: {},
    inflowFactor: 1, pending: emptyLedger(0, P.startCash), ledger: [], stats: emptyStats(), history: [], voices: [],
    elections: [], pendingElection: null, tutorial: { step: 0, done: false },
    base: { power: -1, sewage: -1, gas: -1 }, tax: { res: 1, prop: 1, biz: 1, stay: 0 }, fame: 10, approval: 0.5, polls: [],
    goals: [], goalPick: true, difficulty: 'normal', vision: null, visionStart: 0,
    neighbors: NEIGHBOR_SEED.map(n => ({ name: n.name, trait: n.trait, pop: n.pop, appeal: n.appeal, tax: n.tax, rel: 0.5 })), acts: {}, notes: [], teams: [],
  };
  if (REAL) { buildReal(s, seed); return s; }
  const road = (x0: number, y0: number, x1: number, y1: number, t: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = idx(x, y);
      if (t !== 3 && !buildable(m, i)) continue;
      if (s.road[i] < t) s.road[i] = t;
      s.roadAge[i] = t === 3 ? 20 : Math.round(18 + hash(x, y, seed + 7) * 34 + (t === 2 ? 22 : 0));
    }
  };
  road(0, 15, W - 1, 15, 3);                       // 国道
  road(21, 3, 21, 24, 2);                          // 駅前通り（幹線）
  for (const y of [3, 6, 9, 12]) road(13, y, 29, y, 1);
  road(15, 3, 15, 15, 1); road(27, 3, 27, 15, 1);
  road(6, 18, 21, 18, 1); road(6, 21, 21, 21, 1); road(8, 24, 21, 24, 1);
  road(10, 15, 10, 24, 1); road(16, 15, 16, 24, 1);
  road(21, 18, 38, 18, 1); road(30, 15, 30, 30, 1); road(36, 18, 36, 30, 1);
  road(30, 21, 39, 21, 1); road(30, 24, 39, 24, 1); road(30, 27, 38, 27, 1); road(30, 30, 36, 30, 1);

  const put = (kind: Kind, x: number, y: number, zone: Zone, age = 0, built = -60) => {
    const d = DEFS[kind];
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) s.zone[idx(x + dx, y + dy)] = zone;
    const b = addBuilding(s, kind, x, y, 'operating', 0);
    b.age = age; b.builtMonth = built;
    if (d.staffReq) { b.staff = d.staffReq; b.staffTarget = d.staffReq; }
    return b;
  };
  put('station', 20, 2, 0);
  put('koban', 19, 4, 0); put('clinic', 23, 10, 0);
  put('supermarket', 22, 4, 4);
  put('shop', 20, 4, 4, 0, -50); put('bakery', 20, 5, 4, 0, -20); put('shop', 20, 7, 4, 0, -36); put('konbini', 22, 7, 4, 0, -12); put('cafe', 20, 10, 4, 0, -30);
  put('shop', 14, 19, 4, 0, -80); put('bakery', 15, 20, 4, 0, -44); put('bakery', 31, 19, 4, 0, -10);
  for (const [x, y] of [[20, 8], [22, 8], [22, 10], [32, 19]]) s.zone[idx(x, y)] = 4;
  put('privNursery', 17, 10, 0, 12).staff = 11;
  put('park', 24, 7, 0, 25); put('park', 33, 22, 0, 15); put('park', 8, 19, 0, 40);
  const nur = put('nursery', 12, 19, 0, 35); nur.staff = 14;
  put('school', 17, 22, 0, 48);
  put('fire', 23, 16, 0, 30);
  put('water', 3, 16, 0, 78);
  put('waste', 40, 16, 0, 40);
  put('jhs', 30, 9, 0, 40);

  initFictionRail(s); // v13：線路を GameState に持つ（駅の増設・敷設・地下化ができる）
  buildNewArea(s, seed, road, put); // v9 で広げた東台・南原（旧市街の住宅より先に道を通す）
  // 既成市街地：道路に面した区画に住宅を並べる
  const mix: Record<string, number[]> = {
    m0: [0.22, 0.38, 0.25, 0.1, 0.05], a0: [0.42, 0.28, 0.15, 0.05, 0.1], h0: [0, 0.18, 0.14, 0.3, 0.38],
    h1: [0.05, 0.15, 0.1, 0.2, 0.5], a1: [0.35, 0.2, 0.15, 0.1, 0.2], h2: [0, 0.17, 0.17, 0.38, 0.28], a2: [0.32, 0.28, 0.2, 0.1, 0.1],
  };
  for (let y = 2; y < 38; y++) for (let x = 1; x < Math.min(W, FIC_PREV_W) - 1; x++) {
    const i = idx(x, y);
    if (s.road[i] || s.occ[i] || s.zone[i] || !buildable(m, i)) continue;
    if (!NEIGH.some(([dx, dy]) => inMap(x + dx, y + dy) && s.road[idx(x + dx, y + dy)])) continue;
    const d = m.district[i], r = hash(x, y, seed + 1);
    let kind: Kind | null = null, zone: Zone = 0;
    if (d === 0) {
      if (y <= 5) { if (r < 0.45 && x >= 16 && x <= 26) { kind = 'mansion'; zone = 3; } else if (r < 0.9) { kind = 'apartment'; zone = 2; } else zone = 3; }
      else if (y <= 8) { if (r < 0.5) { kind = 'apartment'; zone = 2; } else if (r < 0.88) { kind = 'house'; zone = 1; } else zone = 2; }
      else { if (r < 0.3) { kind = 'apartment'; zone = 2; } else if (r < 0.9) { kind = 'house'; zone = 1; } else zone = 1; }
    } else if (d === 1) {
      if (x < 5 || y > 26) continue;
      if (r < 0.84) { kind = 'house'; zone = 1; } else if (r < 0.92) { kind = 'apartment'; zone = 2; } else if (r < 0.96) zone = 1;
    } else if (d === 2) {
      if (x > 40 || y > 32) continue;
      if (x < 30 && y < 18) { if (r < 0.45) { kind = 'apartment'; zone = 2; } else if (r < 0.9) { kind = 'house'; zone = 1; } }
      else if (r < 0.86) { kind = 'house'; zone = 1; } else if (r < 0.92) zone = 1;
    } else continue;
    s.zone[i] = zone;
    if (!kind) continue;
    const b = addBuilding(s, kind, x, y, 'operating', 0);
    b.builtMonth = -Math.round(24 + hash(x, y, seed + 2) * 300);
    const key = (kind === 'mansion' ? 'm' : kind === 'apartment' ? 'a' : 'h') + d;
    const mx = mix[key] ?? mix.h1;
    const occ = 0.975;
    b.hh = mx.map(f => Math.round(b.units! * occ * f * 100) / 100);
  }
  s.nextId = Math.max(s.nextId, 1000); // 初期の建物と、あとから建つ建物の id を分ける
  shapeTerrain(s, m);
  recompute(s);
  s.approval = initialApproval(s);
  s.history.push({ month: 0, pop: Math.round(s.stats.pop), cash: s.cash, sat: s.stats.sat, wait: Math.round(s.stats.waitlist), op: 0, maxVc: s.stats.maxVc });
  return s;
}

/** 架空の街の線路：北の端に沿って東西に通る複線（市外へ続く） */
export function initFictionRail(s: GameState): void {
  s.rail = new Array(W * H).fill(0); s.railGrade = new Array(W * H).fill(0); s.railCity = [];
  for (let x = 0; x < W; x++) s.rail[idx(x, 1)] = 2;
}
/** v9 で広げた東台・南原：駅と県道・農道、農家の集落。旧市街（44×44）の外だけを触る（古い保存データを広げるときにも使う） */
function buildNewArea(s: GameState, seed: number, road: (x0: number, y0: number, x1: number, y1: number, t: number) => void, put: (kind: Kind, x: number, y: number, zone: Zone, age?: number, built?: number) => Building): void {
  const m = getMap(seed);
  road(56, 3, 56, 60, 2);                                   // 県道（東台駅から南原へ）
  road(50, 3, 62, 3, 1); road(50, 3, 50, 14, 1); road(62, 3, 62, 14, 1); road(50, 8, 62, 8, 1); // 東台駅前の区画
  road(30, 31, 30, 46, 1); road(8, 46, 70, 46, 1);          // 丘陵台から南原への道と、南原の農道
  road(20, 40, 20, 46, 1); road(66, 46, 66, 56, 1);
  const stn = put('station', 55, 2, 0); stn.name = '東台駅';
  // 農家の集落と、国道沿いの古い家並み
  for (let y = 14; y <= 56; y++) for (let x = 45; x < Math.min(W, FIC_PREV_W) - 1; x++) addHouse(x, y); // v87：はじめの家並みは v86 までの範囲（76 列）だけ。広げた土地は空けておく
  for (let y = 40; y <= 56; y++) for (let x = 2; x < 45; x++) addHouse(x, y);
  function addHouse(x: number, y: number): void {
    const i = idx(x, y);
    if (s.road[i] || s.occ[i] || !buildable(m, i)) return;
    if (!NEIGH.some(([dx, dy]) => inMap(x + dx, y + dy) && s.road[idx(x + dx, y + dy)])) return;
    const r = hash(x, y, seed + 11), along = y === 14 || y === 16 ? 0.16 : 0.08;
    if (r >= along) return;
    s.zone[i] = 1;
    const b = addBuilding(s, 'house', x, y, 'operating', 0);
    b.builtMonth = -Math.round(120 + hash(x, y, seed + 2) * 400);
    b.hh = [0.02, 0.12, 0.08, 0.25, 0.53].map(f => Math.round(b.units! * 0.95 * f * 100) / 100);
  }
}

/** 実在都市版：取り込んだ地図から初期状態をつくる */
function buildReal(s: GameState, seed: number): void {
  const R = REAL!;
  for (let i = 0; i < N; i++) {
    const t = R.road[i];
    if (!t) continue;
    s.road[i] = t;
    const x = i % W, y = (i / W) | 0;
    s.roadAge[i] = t === 3 ? 20 : Math.round(15 + hash(x, y, seed + 7) * 40 + (t === 2 ? 15 : 0));
  }
  const MIX: Record<string, number[]> = { house: [0.08, 0.24, 0.07, 0.2, 0.41], apartment: [0.42, 0.26, 0.1, 0.08, 0.14], mansion: [0.22, 0.36, 0.15, 0.15, 0.12] };
  const ZONE: Partial<Record<Kind, Zone>> = { house: 1, apartment: 2, mansion: 3, bakery: 4, shop: 4, supermarket: 4 };
  R.lots.forEach(([k, x, y, units, rot], li) => {
    const nm = R.names[String(li)] ?? '';
    let kind = LOT_KINDS[k] as Kind;
    if (kind === 'school' && /中学校/.test(nm)) kind = 'jhs';
    else if (kind === 'school' && /高等学校|高校/.test(nm)) kind = 'highschool';
    const d = DEFS[kind];
    if (rot) return; // 向きを変えないと置けなかった学校は、計算外の既存建物として扱う
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) { const i = idx(x + dx, y + dy); s.road[i] = 0; s.zone[i] = ZONE[kind] ?? 0; }
    const b = addBuilding(s, kind, x, y, 'operating', 0);
    b.builtMonth = -Math.round(24 + hash(x, y, seed + 2) * 400);
    const name = R.names[String(li)];
    if (name) b.name = name.slice(0, 60);
    if (d.units && R.deformed) { // まちづくり版：ゲームの標準の建物。ほぼ満室で始める
      const mx = MIX[kind]; b.hh = mx.map(f => Math.floor((b.units ?? d.units!) * 0.93 * f * 100) / 100);
    } else if (d.units) {
      b.osm = true;
      b.units = Math.max(1, units);
      const occ = 0.96, mx = MIX[kind];
      b.hh = mx.map(f => Math.floor(b.units! * occ * f * 100) / 100);
    }
    if (DEFS[kind].staffReq) { b.staff = d.staffReq; b.staffTarget = d.staffReq; }
    if (kind === 'nursery') b.staff = Math.round(d.staffReq * (0.85 + hash(x, y, 5) * 0.15) * 10) / 10;
    if (['nursery', 'privNursery', 'school', 'jhs', 'park', 'fire', 'waste'].includes(kind)) b.age = Math.round(10 + hash(x, y, seed + 3) * 55);
    if (kind === 'water') b.age = 74;
    if (d.fixed) b.lossStreak = 0;
  });
  if (R.rail) { s.rail = Array.from(R.rail); s.railCity = []; s.railGrade = Array.from(R.railGrade ?? new Uint8Array(R.rail.length)); } // まちづくり版の線路（プレイヤーが操作できる）
  if (R.zone) for (let i = 0; i < N; i++) if (R.zone[i] && !s.occ[i] && !s.road[i]) s.zone[i] = R.zone[i]; // 用途だけ指定した空き地
  s.nextId = Math.max(s.nextId, 1000000);
  recompute(s);
  s.approval = initialApproval(s);
  s.history.push({ month: 0, pop: Math.round(s.stats.pop), cash: s.cash, sat: s.stats.sat, wait: Math.round(s.stats.waitlist), op: 0, maxVc: s.stats.maxVc });
}

/** はじめの支持率：暮らしの満足から（就任直後なので少し高め） */
function initialApproval(s: GameState): number { return Math.round(Math.max(0.35, Math.min(0.75, 0.55 + 1.6 * (s.stats.sat - P.voteCenter))) * 1000) / 1000; }

/** 地形のパターンに合わせて、はじめの町を整える：水や山に掛かった建物と道路を外し、町の大きさと資金を変える */
function shapeTerrain(s: GameState, m: ReturnType<typeof getMap>): void {
  const T = terrainOf(s.seed).id;
  for (const b of [...s.buildings]) {
    let bad = false; for (let dy = 0; dy < b.h && !bad; dy++) for (let dx = 0; dx < b.w && !bad; dx++) { const i = idx(b.x + dx, b.y + dy); if (!inMap(b.x + dx, b.y + dy) || !buildable(m, i)) bad = true; }
    if (bad && b.kind !== 'station') removeBuilding(s, b);
  }
  for (let i = 0; i < N; i++) {
    if (s.road[i] && s.road[i] !== 3 && m.water[i]) { s.road[i] = 0; s.roadAge[i] = 0; } // 国道は橋で渡る（国の管理）
    if (s.zone[i] && !buildable(m, i)) s.zone[i] = 0;
  }
  // 町の大きさ：田園・山あいは家が少なく、都会は集合住宅が多い
  const thin = T === 'rural' ? 0.45 : T === 'mountain' ? 0.55 : T === 'island' ? 0.2 : 0;
  if (thin) for (const b of [...s.buildings]) if (isRes(b.kind) && hash(b.x, b.y, s.seed + 9) < thin) { const i = idx(b.x, b.y); removeBuilding(s, b); s.zone[i] = s.zone[i] || 1; }
  if (T === 'urban') for (const b of [...s.buildings]) if (b.kind === 'house' && hash(b.x, b.y, s.seed + 11) < 0.4) {
    const x = b.x, y = b.y, near = s.buildings.some(o => o.kind === 'station' && Math.abs(o.x - x) + Math.abs(o.y - y) < 14); removeBuilding(s, b);
    const k: Kind = near ? 'mansion' : 'apartment', nb = addBuilding(s, k, x, y, 'operating', 0); nb.builtMonth = -120; s.zone[idx(x, y)] = near ? 3 : 2;
    nb.hh = [0.3, 0.27, 0.2, 0.1, 0.13].map(f => Math.round(nb.units! * 0.97 * f * 100) / 100);
  }
  const cash: Record<string, number> = { rural: 1, mountain: 0.95, urban: 1.6, island: 1 }, inflow: Record<string, number> = { rural: 0.85, mountain: 0.7, urban: 1.3, island: 0.85, lake: 1.05 };
  s.cash = Math.round(s.cash * (cash[T] ?? 1)); s.pending = emptyLedger(0, s.cash); s.inflowFactor *= inflow[T] ?? 1;
  // 過疎の町や村は、国の地方交付税が手厚い
  if (T === 'rural' || T === 'mountain' || T === 'island') s.modifiers.push({ key: 'transfer', op: 'mul', v: T === 'mountain' ? 1.5 : T === 'rural' ? 1.35 : 1.2, until: -1, cost: 0, src: '過疎地域への交付税の加算' });
}
