// プレイヤーの操作。全て dispatch() を通し、直列化できる Action として記録・再生できる。
import { LV_CAP, lvK, maxLv, stageName, NIMBY, AIR_ROUTES, W, H, P, DEFS, POLICIES, GOALS, VISIONS, isRes, isShop, isCity, isBiz, lvOf, diffOf, DIFFS, SPORTS, bondCap, SCALE } from './config';
import { getMap, baseMap, syncTerrain, idx, inMap, buildable, landReason, NEIGH, ropewayTop } from './map';
import { recompute, roadInfo, accessTile, invalidateCaches, modMul, modAdd, repairState } from './core';
import { validateAction, validateState, derivedFinite, cleanTiles, ACTION_NAMES } from './validate';
import { fiscalCrisis, tempDebt, bizScore, rerunCheck, rerunElection, teamCheck, addTeam } from './step';
import { addBuilding, removeBuilding, startRenew, resolveEvent } from './events';
import type { GameState, Action, Result, Kind, Building, TerraOp } from './types';
import { sumHH } from './core';
import { REAL } from './real';
import { railNbrs, sharpAt } from './railnet';
import { rngNext } from './rng';
import { rateAdd } from './macro';
import { CH, startChallenge } from './challenge';
import { SIS, EXCHANGES, MAX_SISTERS } from './intl';
import { polAct } from './politics';
import { OPT, optionsFor, optSlots, optCost, STYLES, STYLE_COST, sponsorOf } from './options';
import { isLocked, LOCK_MSG, annexable, blockName, mayorDiff, levelOf } from './mayor';

const man = (v: number) => Math.round(v).toLocaleString() + ' 万円';

function spend(s: GameState, amount: number, what: string): Result | null {
  if (amount > s.cash + 1e-6) return { ok: false, msg: `資金が足りません（${what} ${man(amount)}、資金 ${man(s.cash)}）` };
  s.cash -= amount; s.pending.capital += amount;
  return null;
}

export interface PlaceCheck { ok: boolean; level: 'ok' | 'warn' | 'error'; reasons: string[]; cost: number; acq: number[] }

/** 実在都市版：用地買収できる建物（地図から作った住宅の街区で、入居中のもの）。架空の街では常に null */
export function acquirable(s: GameState, i: number, byId?: Map<number, Building>): Building | null {
  if (!REAL || !s.occ[i]) return null;
  const b = byId ? byId.get(s.occ[i]) : s.buildings.find(o => o.id === s.occ[i]);
  return b && b.osm && isRes(b.kind) && b.status === 'operating' ? b : null;
}
/** 架空の街：民間の住宅が建つ区画は、用途を引き上げられる（古くなると民間が集合住宅・マンションに建て替える） */
export function upzonable(s: GameState, i: number, zone: number): Building | null {
  if (REAL || !s.occ[i]) return null;
  const b = s.buildings.find(o => o.id === s.occ[i]);
  const lv = b ? ({ house: 1, apartment: 2, mansion: 3, towerMansion: 4 } as Partial<Record<Kind, number>>)[b.kind] : undefined;
  return b && lv && b.w === 1 && b.h === 1 && b.status === 'operating' && zone > lv ? b : null;
}
/** 用地買収の費用（土地＋住んでいる世帯への補償。ゲーム用の仮定） */
export const acqCost = (b: Building) => P.acqTile * b.w * b.h + P.acqUnit * (b.units ?? 0);
const idMap = (s: GameState) => { const m = new Map<number, Building>(); for (const b of s.buildings) m.set(b.id, b); return m; };

/** 施設の設置可否（プレビューと実行で共用） */
export function checkPlace(s: GameState, kind: Kind, x: number, y: number, free = false): PlaceCheck {
  const m = getMap(s.seed), d = DEFS[kind];
  const reasons: string[] = [];
  let level: PlaceCheck['level'] = 'ok';
  const acq: Building[] = [], byId = REAL ? idMap(s) : undefined;
  if (!free && d.unlock && Math.floor(s.month / 12) + 1 < d.unlock) { reasons.push(`まだ技術がありません（${d.unlock} 年目から使えます）`); level = 'error'; }
  for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) {
    const cx = x + dx, cy = y + dy;
    if (!inMap(cx, cy)) { if (!reasons.includes('地図の外です')) reasons.push('地図の外です'); level = 'error'; continue; }
    const i = idx(cx, cy);
    if (!free && isLocked(s, i)) { if (!reasons.includes(LOCK_MSG)) reasons.push(LOCK_MSG); level = 'error'; }
    const ab = free ? null : acquirable(s, i, byId);
    const lr = ab && m.steep[i] ? '' : landReason(m, i); // 既に家が建っている斜面は造成済みとみなす
    if (lr) { if (!reasons.includes(lr)) reasons.push(lr); level = 'error'; }
    if (s.road[i]) { if (!reasons.includes('道路と重なっています')) reasons.push('道路と重なっています'); level = 'error'; }
    if (railBlocks(s, i)) { if (!reasons.includes('線路と重なっています')) reasons.push('線路と重なっています'); level = 'error'; }
    if (ab) { if (!acq.includes(ab)) acq.push(ab); }
    else if (s.occ[i]) { if (!reasons.includes('建物と重なっています')) reasons.push('建物と重なっています'); level = 'error'; }
    if (isCanal(s, i)) { if (!reasons.includes('水路と重なっています')) reasons.push('水路と重なっています'); level = 'error'; }
  }
  // 置く場所の条件（市の施設・要望の施設。誘致の施設は見込みに反映する）
  if (level !== 'error' && !free) {
    if (d.unique && s.buildings.some(b => b.kind === kind)) { reasons.push(`${d.name}は市に 1 か所だけです`); level = 'error'; }
    { const need: Partial<Record<Kind, [number, number]>> = { megaPark: [45, 30000], casino: [40, 40000], giantRobot: [25, 0], skyscraper: [30, 20000], usBase: [0, 15000], megaBank: [0, 30000], globalIT: [35, 25000], maglevStation: [50, 60000], hyperloop: [40, 40000], consulate: [40, 0], department: [0, 20000], futureTower: [45, 40000], spaceElevator: [80, 100000], nightDistrict: [0, 20000], fuzokuDistrict: [0, 30000], carPlant: [0, 25000], heavyInd: [0, 20000], tradingCo: [20, 30000], stockExch: [50, 80000], spaceport: [30, 0], luxuryHotel: [40, 30000], humanoidLab: [30, 0] }, nd = need[kind];
      if (nd && ((s.fame ?? 0) < nd[0] || s.stats.pop < nd[1])) { reasons.push(`知名度 ${nd[0]} 以上${nd[1] ? `・人口 ${nd[1].toLocaleString()} 人以上` : ''}が要ります（いま 知名度 ${Math.round(s.fame ?? 0)}・人口 ${Math.round(s.stats.pop).toLocaleString()} 人）`); level = 'error'; } }
    if (kind === 'fuzokuDistrict' && !s.buildings.some(b => b.kind === 'nightDistrict')) { reasons.push('繁華街（ネオン街）が先に要ります'); level = 'error'; }
    if (kind === 'ryokan' && !s.buildings.some(b => b.kind === 'hotSpring' || b.kind === 'onsen')) { reasons.push('温泉の源泉か温浴施設が市内に要ります'); level = 'error'; }
    if (kind === 'consulate' && !(s.sisters?.length)) { reasons.push('姉妹都市が 1 つ以上要ります'); level = 'error'; }
    if (kind === 'expoSite' && !['won', 'held'].includes((s.pol as any)?.bids?.expo?.stage ?? '')) { reasons.push('万博の誘致に勝った街だけが建てられます（市政の画面の「国際大会・万博の誘致」）'); level = 'error'; }
    if ((kind === 'railDepot' || kind === 'slDepot') && !(s.rail?.some(v => v > 0) || s.buildings.some(b => b.kind === 'station'))) { reasons.push('線路と駅が要ります'); level = 'error'; }
    if (d.vision && s.vision !== d.vision) { reasons.push(`ビジョン「${VISIONS.find(v => v.id === d.vision)?.name ?? ''}」を選んだ街だけが建てられます`); level = 'error'; }
    if (d.req === 'water') { let near = false; for (let dy = -3; dy <= d.h + 2 && !near; dy++) for (let dx = -3; dx <= d.w + 2; dx++) { const cx = x + dx, cy = y + dy; if (inMap(cx, cy) && m.water[idx(cx, cy)]) { near = true; break; } } if (!near) { reasons.push('水辺（川・海・池）から 90m 以内ではありません'); level = 'error'; } }
    if (d.req === 'arterial' && !isBiz(kind) && accessTile(s, x, y, d.w, d.h, 2) < 0) { reasons.push('幹線道路か国道に面していません'); level = 'error'; }
    const near = (r: number, f: (i: number) => boolean) => { for (let dy = -r; dy < d.h + r; dy++) for (let dx = -r; dx < d.w + r; dx++) { const cx = x + dx, cy = y + dy; if (inMap(cx, cy) && f(idx(cx, cy))) return true; } return false; };
    if (d.req === 'mountain') { if (!near(3, i => !!(m.steep[i] || m.forest[i])) || !ropewayTop(m, x, y, d.w, d.h)) { reasons.push('山のふもとではありません（近くに急斜面か保全林があり、15m 以上高い山頂が 420m 以内に要ります）'); level = 'error'; } }
    if (d.req === 'nature' && !near(3, i => !!(m.forest[i] || m.water[i]))) { reasons.push('林か水辺の近く（90m 以内）に置いてください'); level = 'error'; }
    if (d.req === 'forest' && !near(6, i => !!m.forest[i])) { reasons.push('保全林から 180m 以内に置いてください（燃料の木を運ぶため）'); level = 'error'; }
    if (d.req === 'geo' && !near(4, i => !!m.steep[i] || s.buildings.some(b => b.kind === 'hotSpring' && b.x === i % W && b.y === ((i / W) | 0)))) { reasons.push('温泉の源泉か山（急斜面）の近く（120m 以内）に置いてください'); level = 'error'; }
    if (d.req === 'dam' && (!near(3, i => !!m.water[i]) || !near(5, i => !!(m.steep[i] || m.forest[i])))) { reasons.push('川と山が近い所に置いてください（水辺から 90m、急斜面か保全林から 150m 以内）'); level = 'error'; }
    if (kind === 'clubhouse' && !(s.teams ?? []).length) { reasons.push('市にプロチームがありません'); level = 'error'; }
    if (isCanal(s, x + y * W) || (s.levee ?? []).some(i => i % W >= x && i % W < x + d.w && ((i / W) | 0) >= y && ((i / W) | 0) < y + d.h)) { reasons.push('水路か堤防と重なっています'); level = 'error'; }
    if (d.req === 'fame' && (s.fame ?? 0) < 25) { reasons.push(`知名度が 25 に届いていません（いま ${Math.round(s.fame ?? 0)}）`); level = 'error'; }
    // 迷惑施設：近くに住宅があると、住民が嫌がる（満足が下がる）
    const nb = NIMBY[kind];
    if (nb && level !== 'error' && near(nb[1], i => { const o = s.occ[i]; if (!o) return false; const b = s.buildings.find(q => q.id === o); return !!b && isRes(b.kind); })) { reasons.push(`近くに住宅があり、住民が嫌がります（${nb[1] * 30}m 以内の住宅の満足が下がる）`); level = 'warn'; }
    if (d.req === 'open' && near(2, i => { const o = s.occ[i]; if (!o) return false; const b = s.buildings.find(q => q.id === o); return !!b && isRes(b.kind); })) { reasons.push('風車の音のため、まわり 60m に住宅がない場所に置いてください'); level = 'error'; }
  }
  const ac = acq.reduce((a, b) => a + acqCost(b), 0);
  const cost = free ? 0 : Math.round(buildCost(s, kind)) + ac;
  if (acq.length && level !== 'error') { reasons.push(`用地買収：住宅 ${acq.reduce((a, b) => a + (b.units ?? 0), 0)} 戸（${man(ac)}）。住んでいる ${Math.round(acq.reduce((a, b) => a + sumHH(b), 0))} 世帯は転居します`); level = 'warn'; }
  if (level !== 'error') {
    if (cost > s.cash) { reasons.unshift(`資金が足りません（${acq.length ? '建設費と用地費' : '建設費'} ${man(cost)}）`); level = 'error'; }
    if (kind === 'station' && s.rail && stationRailLevel(s, x, y, d.w, d.h) === 0) { reasons.push('線路に面していません。線路の横に置くか、先に線路を敷いてください'); if (level === 'ok') level = 'warn'; }
    if (isBiz(kind) && !free) { const bs = bizScore(s, kind, x, y); reasons.push(`来てもらえる見込み ${Math.round(bs.score * 100)}%${bs.why.length ? `（${bs.why.join('、')}）` : ''}`); if (level === 'ok' && bs.score < 0.5) level = 'warn'; }
    const acc = accessTile(s, x, y, d.w, d.h);
    if (acc < 0) { reasons.push('道路に接していません。このままでは稼働できません'); if (level === 'ok') level = 'warn'; }
    else if (!roadInfo(s).conn[acc]) { reasons.push('接する道路が市外（国道）までつながっていません'); if (level === 'ok') level = 'warn'; }
  }
  return { ok: level !== 'error', level, reasons, cost, acq: acq.map(b => b.id) };
}

/** 掘った水路の区画 */
export const isCanal = (s: GameState, i: number) => !!s.canal && s.canal.includes(i);
export function checkRoad(s: GameState, i: number, road: 1 | 2, byId?: Map<number, Building>): string {
  const m = getMap(s.seed), ab = acquirable(s, i, byId);
  if (isCanal(s, i) && !(s.bridge ?? []).includes(i)) return '水路です（橋の道具で渡れます）';
  if ((s.levee ?? []).includes(i)) return '堤防です';
  const lr = ab && m.steep[i] ? '' : landReason(m, i);
  if (lr) return lr;
  if (s.occ[i] && !ab) return '建物があります';
  if (s.road[i] === 3) return '国道は国の管理です';
  if (s.road[i] >= road) return '既に道路があります';
  return '';
}

/** 区画ごとの可否と費用。プレビューと実行で同じ関数を使い、表示と請求を一致させる */
export interface TilePlan { ok: number[]; bad: [number, string][]; cost: number; acq?: number[]; acqUnits?: number }
const uniq = (tiles: number[]) => [...new Set(tiles.filter(i => Number.isInteger(i) && i >= 0 && i < W * H))];
/** 踏切は「道路と線路が十字に交わる 1 区画」だけ。地上の線路と道路が重なる区画が隣り合う（＝道路の上を線路が縦に走る）と、
 *  電車が車道を走ってしまうので作らせない。add は新しく「地上の線路＋道路」になる区画 */
const RUN_MSG = '線路と道路を同じ区画に縦に並べることはできません（踏切は十字に交わる 1 区画だけ。並べたいときは高架か地下に）';
function levelRunError(s: GameState, add: number[]): string {
  if (!s.rail || !add.length) return '';
  const A = new Set(add), lx = (i: number) => A.has(i) || (!!s.road[i] && !!s.rail![i] && !(s.railGrade?.[i] ?? 0));
  for (const i of add) { const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < W && b < H && lx(idx(a, b))) return RUN_MSG; } }
  return '';
}
export function planRoad(s: GameState, tiles: number[], road: 1 | 2): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [], acq: number[] = []; let cost = 0, acqUnits = 0;
  const byId = REAL ? idMap(s) : undefined;
  for (const i of uniq(tiles)) {
    const r = checkRoad(s, i, road, byId);
    if (r) { bad.push([i, r]); continue; }
    ok.push(i); cost += P.roadCost[road] - (s.road[i] === 1 ? P.roadCost[1] * 0.5 : 0);
    const ab = acquirable(s, i, byId);
    if (ab && !acq.includes(ab.id)) { acq.push(ab.id); cost += acqCost(ab); acqUnits += ab.units ?? 0; }
  }
  { const nx = ok.filter(i => !s.road[i] && s.rail?.[i] && !(s.railGrade?.[i] ?? 0)), e = levelRunError(s, nx);
    if (e) { for (const i of nx) { ok.splice(ok.indexOf(i), 1); bad.push([i, e]); } cost = 0; for (const i of ok) cost += P.roadCost[road] - (s.road[i] === 1 ? P.roadCost[1] * 0.5 : 0); } }
  return { ok, bad, cost, acq, acqUnits };
}
/** 橋：川・水面・水路の区画は橋に（高い）。ほかの区画はふつうの道路として通す */
export function planBridge(s: GameState, tiles: number[], road: 1 | 2): TilePlan & { br: number[] } {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = [], br: number[] = []; let cost = 0;
  const byId = REAL ? idMap(s) : undefined;
  for (const i of uniq(tiles)) {
    if (m.water[i] || isCanal(s, i)) {
      if (s.occ[i]) { bad.push([i, '建物があります']); continue; }
      if (s.road[i] === 3) { bad.push([i, '国道は国の管理です']); continue; }
      if (s.road[i] >= road) { bad.push([i, '既に道路があります']); continue; }
      ok.push(i); br.push(i); cost += P.bridgeCost[road] - (s.road[i] === 1 ? P.bridgeCost[1] * 0.6 : 0); continue;
    }
    // 谷（急な斜面）・湿地・保全林の上は、高い橋脚の橋で渡る（下の地面には手をつけない）
    if ((m.steep[i] || (m.wet && m.wet[i]) || m.forest[i]) && !s.occ[i] && !m.rail[i] && !s.rail?.[i]) {
      if (s.road[i] === 3) { bad.push([i, '国道は国の管理です']); continue; }
      if (s.road[i] >= road) { bad.push([i, '既に道路があります']); continue; }
      ok.push(i); br.push(i); cost += P.bridgeCost[road] * 1.4; continue;
    }
    const r = checkRoad(s, i, road, byId); if (r) { bad.push([i, r]); continue; }
    ok.push(i); cost += P.roadCost[road] - (s.road[i] === 1 ? P.roadCost[1] * 0.5 : 0);
  }
  return { ok, bad, cost, br };
}
/** 陸橋（跨線橋）：道路と地上の線路が交わる区画（踏切）を、道路が線路の上を越える形にする */
export function planOverpass(s: GameState, tiles: number[]): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [];
  for (const i of uniq(tiles)) {
    if (!s.road[i] || !s.rail?.[i]) { bad.push([i, '踏切（道路と線路が交わる区画）ではありません']); continue; }
    if (s.railGrade?.[i]) { bad.push([i, '線路が高架か地下なので、踏切はありません']); continue; }
    if ((s.overpass ?? []).includes(i)) { bad.push([i, '既に陸橋です']); continue; }
    ok.push(i);
  }
  return { ok, bad, cost: ok.length * P.overpassCost };
}
/** 歩道橋：道路の区画の上に（幹線・国道で効きやすい） */
export function planFootbridge(s: GameState, tiles: number[]): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [];
  for (const i of uniq(tiles)) {
    if (!s.road[i]) { bad.push([i, '道路ではありません']); continue; }
    if ((s.footbridge ?? []).includes(i)) { bad.push([i, '既に歩道橋があります']); continue; }
    if ((s.tunnel ?? []).includes(i) || (s.bridge ?? []).includes(i)) { bad.push([i, 'トンネルや橋の上には置けません']); continue; }
    ok.push(i);
  }
  return { ok, bad, cost: ok.length * P.footbridgeCost };
}
/** バス停：道路の区画に置く（トンネルの中は不可）。on=false は撤去 */
export function planBusStop(s: GameState, tiles: number[], on: boolean): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [], set = new Set(s.busStops ?? []);
  for (const i of uniq(tiles)) {
    if (!s.road[i]) bad.push([i, '道路ではありません']);
    else if ((s.tunnel ?? []).includes(i)) bad.push([i, 'トンネルの中には置けません']);
    else if (on === set.has(i)) bad.push([i, on ? '既にバス停があります' : 'バス停がありません']);
    else ok.push(i);
  }
  return { ok, bad, cost: on ? ok.length * P.busStopCost : 0 };
}
/** 堤防：川・水辺に面した空き地に盛り土の堤防を築く */
/** 道路の種類を変える：並木道・石畳とカラー舗装・電線の地中化（無電柱化）。none で元に戻す（無料） */
export function planStreet(s: GameState, tiles: number[], style: 'tree' | 'stone' | 'nopole' | 'charge' | 'none'): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [], st = s.streets ?? {};
  for (const i of new Set(tiles)) {
    if (!s.road[i]) { bad.push([i, '道路がありません']); continue; }
    if (style === 'charge' && Math.floor(s.month / 12) + 1 < 20) { bad.push([i, '走行中給電の道路は 20 年目からです（次世代の技術）']); continue; }
    if (style === 'charge' && s.road[i] < 2) { bad.push([i, '走行中給電は幹線道路だけです']); continue; }
    if (style === 'nopole' && s.road[i] !== 1) { bad.push([i, '電線の地中化は生活道路だけです（幹線は電柱がありません）']); continue; }
    if (style !== 'none' && (st[style] ?? []).includes(i)) { bad.push([i, 'もうその種類です']); continue; }
    ok.push(i);
  }
  return { ok, bad, cost: style === 'none' ? 0 : ok.length * (P.streetCost[style] ?? 0) * modMul(s, 'costMul') };
}
/** 線の種類：モノレール・新交通システムに（高架の軌道に変わる）。0 でふつうの鉄道に戻す（高架のまま） */
export const RAILKIND_NAME = ['ふつうの鉄道', 'モノレール', '新交通システム'];
export function planRailKind(s: GameState, tiles: number[], kind: 0 | 1 | 2): TilePlan {
  const ok: number[] = [], bad: [number, string][] = []; let cost = 0;
  if (!s.rail) return { ok, bad: uniq(tiles).map(i => [i, 'この地図では線路は変えられません']), cost };
  for (const i of uniq(tiles)) {
    if (!s.rail[i]) { bad.push([i, '線路がありません']); continue; }
    if ((s.railKind?.[i] ?? 0) === kind) { bad.push([i, `既に${RAILKIND_NAME[kind]}です`]); continue; }
    if (kind && s.rail[i] === 3) { bad.push([i, '複々線はモノレール・新交通にできません']); continue; }
    if (kind && s.buildings.some(b => b.kind === 'station' && b.shin !== undefined && i % W >= b.x - 1 && i % W <= b.x + b.w && ((i / W) | 0) >= b.y - 1 && ((i / W) | 0) <= b.y + b.h)) { bad.push([i, '新幹線の駅の線路は変えられません']); continue; }
    ok.push(i); cost += P.railKindCost[kind] * (s.rail[i] === 2 ? 1.3 : 1) * (kind && (s.railGrade?.[i] ?? 0) === 1 ? 0.6 : 1); // もう高架なら軌道だけで安い
  }
  return { ok, bad, cost: cost * modMul(s, 'costMul') };
}
export function planLevee(s: GameState, tiles: number[]): TilePlan {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = [], set = new Set(s.levee ?? []);
  const wet = (x: number, y: number) => inMap(x, y) && (m.water[idx(x, y)] || isCanal(s, idx(x, y)));
  for (const i of uniq(tiles)) {
    const r = set.has(i) ? '既に堤防です' : m.water[i] ? '水面です' : s.road[i] ? '道路です' : s.occ[i] ? '建物があります' : isCanal(s, i) ? '水路です' : railBlocks(s, i) ? '線路です' : !NEIGH.some(([dx, dy]) => wet(i % W + dx, ((i / W) | 0) + dy)) ? '川・水辺に面していません' : '';
    if (r) bad.push([i, r]); else ok.push(i);
  }
  return { ok, bad, cost: ok.length * P.leveeCost };
}
/** 線引き（0 市街化区域・1 市街化調整区域・2 居住誘導区域）。無料 */
export function planArea(s: GameState, tiles: number[], v: 0 | 1 | 2): TilePlan {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = [];
  for (const i of uniq(tiles)) { if (m.water[i]) bad.push([i, '水面です']); else if ((s.area?.[i] ?? 0) === v) bad.push([i, '既にその区域です']); else ok.push(i); }
  return { ok, bad, cost: 0 };
}
/** 水路（運河）を掘る：空いた土地に。まわりの浸水を減らし、水辺の緑になる */
export function planCanal(s: GameState, tiles: number[]): TilePlan {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = [];
  for (const i of uniq(tiles)) {
    const lr = m.water[i] ? '既に水面です' : s.road[i] ? '道路です（先に撤去するか、ほかの区画に）' : s.occ[i] ? '建物があります' : railBlocks(s, i) ? '線路です' : isCanal(s, i) ? '既に水路です' : (s.levee ?? []).includes(i) ? '堤防です' : landReason(m, i);
    if (lr) bad.push([i, lr]); else ok.push(i);
  }
  return { ok, bad, cost: ok.length * P.canalCost };
}
/** トンネル：急斜面や保全林の区画は山を抜けるトンネルに（高い）。ほかの区画はふつうの道路として通す */
export function planTunnel(s: GameState, tiles: number[], road: 1 | 2): TilePlan & { tun: number[] } {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = [], tun: number[] = []; let cost = 0;
  const byId = REAL ? idMap(s) : undefined;
  for (const i of uniq(tiles)) {
    const mountain = (m.steep[i] || m.forest[i]) && !m.water[i] && !railBlocks(s, i) && !(m.blocked && m.blocked[i]) && !(m.park && m.park[i]);
    if (mountain) {
      if (s.occ[i]) { bad.push([i, '建物があります']); continue; }
      if (s.road[i] === 3) { bad.push([i, '国道は国の管理です']); continue; }
      if (s.road[i] >= road) { bad.push([i, '既に道路があります']); continue; }
      ok.push(i); tun.push(i); cost += P.tunnelCost[road] - (s.road[i] === 1 ? P.tunnelCost[1] * 0.6 : 0); continue;
    }
    const r = checkRoad(s, i, road, byId); if (r) { bad.push([i, r]); continue; }
    ok.push(i); cost += P.roadCost[road] - (s.road[i] === 1 ? P.roadCost[1] * 0.5 : 0);
  }
  return { ok, bad, cost, tun };
}
export function planUnroad(s: GameState, tiles: number[]): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [];
  for (const i of uniq(tiles)) { if (s.road[i] === 1 || s.road[i] === 2) ok.push(i); else bad.push([i, s.road[i] === 3 ? '国道は国の管理で、市は撤去できません' : '市道がありません']); }
  return { ok, bad, cost: ok.length * P.roadRemoveCost };
}
export function planRepair(s: GameState, tiles: number[]): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [];
  for (const i of uniq(tiles)) { if ((s.road[i] === 1 || s.road[i] === 2) && s.roadAge[i] > 10) ok.push(i); else bad.push([i, s.road[i] === 3 ? '国道は国の管理です' : s.road[i] ? 'まだ傷んでいません' : '道路がありません']); }
  return { ok, bad, cost: ok.length * P.roadRepairCost };
}
export function planZone(s: GameState, tiles: number[], zone: number): TilePlan {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = [];
  const byId = REAL ? idMap(s) : undefined;
  for (const i of uniq(tiles)) {
    // 実在都市版：地図の住宅の街区も、住宅の用途を引き上げられる（民間の建て替えを誘う）
    const re = s.occ[i] && zone >= 1 && zone <= 3 ? (acquirable(s, i, byId) ?? upzonable(s, i, zone)) : null;
    const why = zone >= 1 && s.area?.[i] === 1 ? '市街化調整区域です（開発を抑える区域。区域を外すと指定できます）' : isCanal(s, i) ? '水路です' : (s.levee ?? []).includes(i) ? '堤防です' : (s.levee ?? []).includes(i) ? '堤防です' : s.road[i] ? '道路です' : railBlocks(s, i) ? '線路です' : re ? (s.zone[i] === zone ? '既にその用途です' : '') : s.occ[i] ? '建物があります' : landReason(m, i) || (s.zone[i] === zone ? '既にその用途です' : '');
    if (why) bad.push([i, why]); else ok.push(i);
  }
  return { ok, bad, cost: 0 };
}
export function roadCost(s: GameState, tiles: number[], road: 1 | 2): number { return planRoad(s, tiles, road).cost; }

/** 区画 i に地上・高架の線路があって、建物や用途を置けないか（地下の線路の上は使える） */
export function railBlocks(s: GameState, i: number): boolean { return !!s.rail?.[i] && (s.railGrade?.[i] ?? 0) !== 2; }
/** 駅の敷地に面した（地下の駅なら敷地の下を通る）線路の最大の水準（0 なし・1 単線・2 複線） */
export function stationRailLevel(s: GameState, x: number, y: number, w: number, h: number): number {
  if (!s.rail) return 2;
  let lv = 0;
  for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) {
    if (!inMap(x + dx, y + dy)) continue;
    const i = idx(x + dx, y + dy), inside = dx >= 0 && dx < w && dy >= 0 && dy < h;
    if (inside && (s.railGrade?.[i] ?? 0) !== 2) continue;
    lv = Math.max(lv, s.rail[i]);
  }
  return lv;
}
const GRADE_NAME = ['地上', '高架', '地下', '掘割（半地下）'];
const LEVEL_NAME = ['', '単線', '複線', '複々線'];
/** 線路の敷設費・高さを変える費用の倍率（地上・高架・地下） */
const gradeMul = (g: number) => P.railGradeMul[g] ?? 1;
/** 線路を足した後に、急なカーブや平面交差ができないか。できるならその理由 */
function railShapeError(s: GameState, add: number[]): string {
  const set = new Set(add), has = (i: number) => !!s.rail![i] || set.has(i);
  for (const i of add) for (const j of [i, ...railNbrs(has, i)]) { const e = sharpAt(has, j); if (e) return e; }
  return '';
}
/** 線路の敷設・複線化：区画ごとの可否と費用。地上は川で 2 倍・急な斜面で 1.5 倍。高架・地下は割高。国道とは平面で交われない */
export function planRail(s: GameState, tiles: number[], level: 1 | 2 | 3, grade: 0 | 1 | 2 | 3 = 0): TilePlan {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = []; let cost = 0;
  if (!s.rail) return { ok, bad: uniq(tiles).map(i => [i, 'この地図では線路は鉄道事業者の管理です']), cost: 0 };
  const fresh: number[] = [];
  for (const i of uniq(tiles)) {
    const cur = s.rail[i], g = cur ? (s.railGrade?.[i] ?? 0) : grade;
    if (cur >= level) { bad.push([i, level >= 2 ? `既に${LEVEL_NAME[cur]}です` : '既に線路があります']); continue; }
    if (!cur) {
      if (g !== 2 && s.occ[i]) { bad.push([i, '建物があります（地下なら敷けます）']); continue; }
      if (g !== 2 && (m.forest[i] || (m.park && m.park[i]) || (m.blocked && m.blocked[i]))) { bad.push([i, landReason(m, i) + '（地下なら敷けます）']); continue; }
      if (g === 0 && s.road[i] === 3) { bad.push([i, '国道とは平面で交差できません（高架か地下で）']); continue; }
      if (g === 3 && m.water[i]) { bad.push([i, '川の上は掘割にできません']); continue; }
      fresh.push(i);
    }
    const k = g === 0 ? (m.water[i] ? 2 : m.steep[i] ? 1.5 : 1) : g === 1 && m.water[i] ? 1.3 : 1;
    ok.push(i); cost += (cur ? P.railCost[level] - P.railCost[cur] : P.railCost[level]) * gradeMul(g) * k;
  }
  if (fresh.length) { const e = railShapeError(s, fresh); if (e) return { ok: [], bad: uniq(tiles).map(i => [i, e]), cost: 0 }; }
  { const e = levelRunError(s, fresh.filter(i => s.road[i] && grade === 0)); if (e) return { ok: [], bad: uniq(tiles).map(i => [i, e]), cost: 0 }; }
  return { ok, bad, cost: Math.round(cost) };
}
/** 線路の高さを変える（高架化・地下化・地上へ戻す）。区画ごとの可否と費用 */
export function planRailGrade(s: GameState, tiles: number[], grade: 0 | 1 | 2 | 3): TilePlan {
  const m = getMap(s.seed), ok: number[] = [], bad: [number, string][] = []; let cost = 0;
  if (!s.rail) return { ok, bad: uniq(tiles).map(i => [i, 'この地図では線路は鉄道事業者の管理です']), cost: 0 };
  for (const i of uniq(tiles)) {
    if (!s.rail[i]) { bad.push([i, '線路がありません']); continue; }
    if ((s.railGrade?.[i] ?? 0) === grade) { bad.push([i, `既に${GRADE_NAME[grade]}です`]); continue; }
    if (grade !== 2 && s.occ[i]) { bad.push([i, '上に建物があります']); continue; }
    if (grade === 0 && s.road[i] === 3) { bad.push([i, '国道とは平面で交差できません']); continue; }
    if ((grade === 0 || grade === 3) && m.water[i]) { bad.push([i, grade === 3 ? '川の上は掘割にできません' : '川の上は高架のままにします']); continue; }
    ok.push(i); cost += P.railGradeCost[grade] * (s.rail[i] === 3 ? 2 : s.rail[i] === 2 ? 1.4 : 1);
  }
  return { ok, bad, cost: Math.round(cost) };
}
export function planUnrail(s: GameState, tiles: number[]): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [];
  if (!s.rail) return { ok, bad: uniq(tiles).map(i => [i, 'この地図では線路は鉄道事業者の管理です']), cost: 0 };
  for (const i of uniq(tiles)) { if (s.rail[i]) ok.push(i); else bad.push([i, '線路がありません']); }
  return { ok, bad, cost: ok.length * P.railRemoveCost };
}

/** 操作を実行する。形式の検証 → 実行 → 状態の検証。途中で失敗したら状態を完全に元へ戻す */
const LOCKED_OPS = new Set(['railKind', 'street', 'road', 'tunnel', 'bridge', 'overpass', 'footbridge', 'canal', 'area', 'busStop', 'levee', 'terra', 'widen', 'flyover', 'rail', 'railgrade', 'zone']);
export function dispatch(s: GameState, a: Action): Result {
  syncTerrain(s);
  const name = ACTION_NAMES[(a as any)?.type] ?? '操作';
  const bad = validateAction(s, a);
  if (bad) return { ok: false, msg: `${name}：${bad}` };
  // 市の区域の外（まだ編入していない区域）では、つくる操作はできない（取り除く操作はできる）
  if (s.unlocked && 'tiles' in a && LOCKED_OPS.has(a.type) && !(a.type === 'zone' && a.zone === 0) && !(a.type === 'busStop' && !a.on)) {
    const t = a.tiles.filter(i => !isLocked(s, i));
    if (!t.length) return { ok: false, msg: `${name}：${LOCK_MSG}` };
    if (t.length !== a.tiles.length) a = { ...a, tiles: t } as Action;
  }
  repairState(s);
  const snap = structuredClone(s);
  let r: Result;
  try {
    r = apply(s, a);
    if (r.ok) {
      const inv = validateState(s);
      if (inv) throw new Error(inv);
      recompute(s);
      const fin = derivedFinite(s);
      if (fin) throw new Error(fin);
    }
  } catch (e) {
    r = { ok: false, msg: `内部エラー：${(e as Error).message}`, };
    rollback(s, snap); syncTerrain(s);
    return { ok: false, msg: `${name}：実行できませんでした（${r.msg}）。街は操作前のままです` };
  }
  if (!r.ok) { rollback(s, snap); syncTerrain(s); return { ok: false, msg: `${name}：${r.msg}` }; }
  return r;
}

/** 用地買収：住宅の街区を取り壊し、住んでいた世帯は転居する（市外へ出る扱い）。転居した世帯数を返す */
function acquire(s: GameState, ids: number[]): number {
  let moved = 0;
  for (const id of ids) { const b = s.buildings.find(o => o.id === id); if (!b) continue; moved += sumHH(b); removeBuilding(s, b); }
  return Math.round(moved);
}

function rollback(s: GameState, snap: GameState): void {
  const t = s as any;
  for (const k of Object.keys(t)) if (!(k in snap)) delete t[k];
  Object.assign(s, snap);
  invalidateCaches(s);
}


// ---- v18：地形の造作・6 車線・立体交差 ----
export const TERRA_NAMES: Record<TerraOp, string> = { raise: '盛り土', lower: '掘削', flatten: '平らにする', hill: '丘をつくる', mountain: '山をつくる', valley: '谷をつくる', cliff: '崖（切り立った台地）をつくる', water: '水を張る（池・川・海）', fill: '埋め立て', forest: '植林', clear: '伐採', wet: '湿地にする', sand: '砂地にする', desert: '砂漠（砂丘）にする', snow: '雪原にする', reset: '元の地形に戻す' };
const HEIGHT_OPS = new Set<TerraOp>(['raise', 'lower', 'flatten', 'hill', 'mountain', 'valley', 'cliff']);
/** 区画に、地形を変えられない物（建物・道路・線路・水路・堤防）があるか */
function terraBusy(s: GameState, i: number): string {
  if (s.occ[i]) return '建物があります';
  if (s.road[i]) return '道路があります';
  if (s.rail?.[i]) return '線路があります';
  if (isCanal(s, i)) return '水路があります';
  if ((s.levee ?? []).includes(i)) return '堤防があります';
  return '';
}
/** 頂点（区画の角）を動かせるか：まわりの 4 区画がどれも空いていて、水面でなく、地図の縁でない */
function vertexFree(s: GameState, vx: number, vy: number): boolean {
  if (vx <= 0 || vy <= 0 || vx >= W || vy >= H) return false;
  const m = getMap(s.seed);
  for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) { const x = vx + dx, y = vy + dy; if (!inMap(x, y)) continue; const i = idx(x, y); if (terraBusy(s, i) || m.water[i]) return false; }
  return true;
}
export function planTerra(s: GameState, tiles: number[], op: TerraOp): TilePlan & { verts: [number, number][] } {
  const ok: number[] = [], bad: [number, string][] = [], verts: [number, number][] = [];
  if (REAL) return { ok, bad: uniq(tiles).map(i => [i, 'この地図（実在の街）では地形を変えられません']), cost: 0, verts };
  const m = getMap(s.seed), b = baseMap(s.seed), t = s.terraT;
  const sel = uniq(tiles);
  if (HEIGHT_OPS.has(op)) {
    const S = W + 1, vs = new Map<number, [number, number]>();
    for (const i of sel) {
      const why = terraBusy(s, i) || (m.water[i] ? '水面です（先に埋め立てを）' : '');
      if (why) { bad.push([i, why]); continue; }
      const x = i % W, y = (i / W) | 0; let any = false;
      for (const [vx, vy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) if (vertexFree(s, vx, vy)) { vs.set(vy * S + vx, [vx, vy]); any = true; }
      if (any) ok.push(i); else bad.push([i, 'となりに建物・道路・水面があり、高さを変えられません']);
    }
    // 動かす量
    if (ok.length) {
      const cx = ok.reduce((a, i) => a + (i % W) + 0.5, 0) / ok.length, cy = ok.reduce((a, i) => a + ((i / W) | 0) + 0.5, 0) / ok.length;
      const rc = Math.max(...ok.map(i => Math.hypot((i % W) + 0.5 - cx, ((i / W) | 0) + 0.5 - cy))) + 1;
      const sm = (v: number) => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
      const cur = (k: number) => m.heights[k];
      const mean = [...vs.keys()].reduce((a, k) => a + cur(k), 0) / Math.max(1, vs.size);
      for (const [k, [vx, vy]] of vs) {
        let d = 0;
        if (op === 'raise') d = 2.5; else if (op === 'lower') d = -2.5; else if (op === 'flatten') d = mean - cur(k);
        else if (op === 'hill') d = 7 * sm(1.15 - Math.hypot(vx - cx, vy - cy) / rc);
        else if (op === 'cliff') d = 14;
        else if (op === 'mountain') d = 28 * sm(1.05 - Math.hypot(vx - cx, vy - cy) / rc);
        else if (op === 'valley') { const dm = Math.min(...ok.map(i => Math.hypot(vx - (i % W) - 0.5, vy - ((i / W) | 0) - 0.5))); d = -5 * sm(1.3 - dm / 1.1); }
        const nh = Math.max(-1.2, Math.min(80, cur(k) + d)); // 川より低くは掘らない（水が出る所は［水を張る］で）
        verts.push([k, Math.round((nh - b.heights[k]) * 10) / 10]);
      }
    }
    return { ok, bad, cost: ok.length * (P.terraCost[op] ?? 300), verts };
  }
  for (const i of sel) {
    const busy = terraBusy(s, i), code = t?.[i] ?? 0;
    let why = busy;
    if (!why) {
      if (op === 'water') why = m.water[i] ? '既に水面です' : '';
      else if (op === 'fill') why = m.water[i] || (m.wet && m.wet[i]) ? '' : '水面か湿地ではありません';
      else if (op === 'forest') why = m.water[i] ? '水面です' : m.forest[i] ? '既に林です' : '';
      else if (op === 'clear') why = m.forest[i] ? '' : '林ではありません';
      else if (op === 'wet') why = m.water[i] ? '水面です（先に埋め立てを）' : m.wet && m.wet[i] ? '既に湿地です' : '';
      else if (op === 'sand') why = m.water[i] ? '水面です（先に埋め立てを）' : m.sand && m.sand[i] ? '既に砂地です' : '';
      else if (op === 'desert') why = m.water[i] ? '水面です（先に埋め立てを）' : m.desert && m.desert[i] ? '既に砂漠です' : '';
      else if (op === 'snow') why = m.water[i] ? '水面です（先に埋め立てを）' : m.snow && m.snow[i] ? '既に雪原です' : '';
      else if (op === 'reset') why = code || cornersChanged(s, i) ? '' : '元の地形のままです';
    }
    if (why) bad.push([i, why]); else ok.push(i);
  }
  return { ok, bad, cost: ok.length * (P.terraCost[op] ?? 300), verts };
}
function cornersChanged(s: GameState, i: number): boolean { const h = s.terraH; if (!h) return false; const x = i % W, y = (i / W) | 0, S = W + 1; return !!(h[y * S + x] || h[y * S + x + 1] || h[(y + 1) * S + x] || h[(y + 1) * S + x + 1]); }
/** 幹線を 6 車線に（on=false で 4 車線に戻す） */
export function planWiden(s: GameState, tiles: number[], on: boolean): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [], set = new Set(s.wide ?? []);
  for (const i of uniq(tiles)) {
    if (s.road[i] !== 2) bad.push([i, s.road[i] === 3 ? '国道は国の管理です' : '幹線道路ではありません（先に幹線に拡幅を）']);
    else if (on === set.has(i)) bad.push([i, on ? '既に 6 車線です' : '4 車線です']);
    else ok.push(i);
  }
  return { ok, bad, cost: on ? ok.length * P.wideCost : 0 };
}
/** 交差点か：道路の区画で、3 方向以上に道路がつながり、そのうち 2 本以上が幹線か国道 */
export function isJunction(s: GameState, i: number): boolean {
  if (!s.road[i]) return false;
  const x = i % W, y = (i / W) | 0; let n = 0, big = s.road[i] >= 2 ? 1 : 0;
  for (const [dx, dy] of NEIGH) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const r = s.road[idx(xx, yy)]; if (r) { n++; if (r >= 2) big++; } }
  return n >= 3 && big >= 2;
}
export function planFlyover(s: GameState, tiles: number[]): TilePlan {
  const ok: number[] = [], bad: [number, string][] = [], set = new Set(s.flyover ?? []);
  for (const i of uniq(tiles)) {
    if (set.has(i)) bad.push([i, '既に立体交差です']);
    else if (!isJunction(s, i)) bad.push([i, '幹線どうし（国道を含む）の交差点ではありません']);
    else if (s.rail?.[i] || (s.bridge ?? []).includes(i) || (s.tunnel ?? []).includes(i) || (s.overpass ?? []).includes(i)) bad.push([i, '線路・橋・トンネルの所には置けません']);
    else ok.push(i);
  }
  return { ok, bad, cost: ok.length * P.flyoverCost };
}

const crisisMsg = (s: GameState) => `財政危機のため実行できません。一時借入の残高 ${man(tempDebt(s))} が上限 ${man(P.tempLimit * diffOf(s).crisis)} を超えています。収支を黒字にして返済が進むまで、新しい建設・道路・政策の開始は止まります`;


function apply(s: GameState, a: Action): Result {
  switch (a.type) {
    case 'road': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planRoad(s, cleanTiles(a.tiles) as number[], a.road), ok = pl.ok;
      if (!ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '場所を選んでください' };
      const cost = pl.cost;
      const e = spend(s, cost, '道路建設'); if (e) return e;
      const moved = acquire(s, pl.acq ?? []);
      for (const i of ok) { s.road[i] = a.road; s.roadAge[i] = 0; s.zone[i] = 0; }
      s.roadVersion++;
      return { ok: true, msg: `道路を ${ok.length} 区間つくりました（${man(cost)}）` + (pl.acq?.length ? `。用地買収で ${moved} 世帯が転居` : '') + (pl.bad.length ? `。${pl.bad.length} 区画は対象外（${pl.bad[0][1]}）` : ''), cost };
    }
    case 'rail': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const g = a.grade ?? 0;
      const pl = planRail(s, cleanTiles(a.tiles) as number[], a.level, g);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '場所を選んでください' };
      const e = spend(s, pl.cost, a.level === 3 ? '複々線化' : a.level === 2 ? '複線化' : '線路の敷設'); if (e) return e;
      for (const i of pl.ok) {
        if (!s.rail![i]) { s.railGrade![i] = g; if (g !== 2) s.zone[i] = 0; }
        s.rail![i] = a.level; if (!s.railCity!.includes(i)) s.railCity!.push(i);
      }
      s.roadVersion++;
      return { ok: true, msg: `${a.level >= 2 ? LEVEL_NAME[a.level] : `${GRADE_NAME[g]}の単線`}の線路を ${pl.ok.length} 区間${a.level >= 2 ? 'にしました' : '敷きました'}（${man(pl.cost)}）` + (pl.bad.length ? `。${pl.bad.length} 区画は対象外（${pl.bad[0][1]}）` : ''), cost: pl.cost };
    }
    case 'railKind': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planRailKind(s, cleanTiles(a.tiles) as number[], a.kind);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '線路をなぞってください' };
      if (pl.cost > 0) { const e = spend(s, pl.cost, RAILKIND_NAME[a.kind] + 'の軌道'); if (e) return e; }
      if (!s.railKind) s.railKind = new Array(W * H).fill(0);
      for (const i of pl.ok) { s.railKind[i] = a.kind; if (a.kind) { s.railGrade![i] = 1; s.zone[i] = 0; } if (!s.railCity!.includes(i)) s.railCity!.push(i); }
      s.roadVersion++;
      return { ok: true, msg: `線路 ${pl.ok.length} 区間を${RAILKIND_NAME[a.kind]}にしました${pl.cost ? `（${man(pl.cost)}）` : ''}${a.kind ? '。高架を走るので踏切がなく、音も静かです' : ''}`, cost: pl.cost };
    }
    case 'railgrade': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planRailGrade(s, cleanTiles(a.tiles) as number[], a.grade);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '場所を選んでください' };
      const e = spend(s, pl.cost, a.grade === 1 ? '線路の高架化' : a.grade === 2 ? '線路の地下化' : a.grade === 3 ? '線路の掘割化' : '線路を地上へ'); if (e) return e;
      for (const i of pl.ok) { s.railGrade![i] = a.grade; if (a.grade !== 2) s.zone[i] = 0; if (!s.railCity!.includes(i)) s.railCity!.push(i); }
      s.roadVersion++;
      return { ok: true, msg: `線路 ${pl.ok.length} 区間を${GRADE_NAME[a.grade]}にしました（${man(pl.cost)}）` + (pl.bad.length ? `。${pl.bad.length} 区画は対象外（${pl.bad[0][1]}）` : ''), cost: pl.cost };
    }
    case 'unrail': {
      const pl = planUnrail(s, cleanTiles(a.tiles) as number[]);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '撤去できる線路がありません' };
      const e = spend(s, pl.cost, '線路の撤去'); if (e) return e;
      for (const i of pl.ok) { s.rail![i] = 0; s.railGrade![i] = 0; }
      s.railCity = s.railCity!.filter(i => s.rail![i]);
      if (s.overpass) s.overpass = s.overpass.filter(i => s.rail![i]);
      s.roadVersion++;
      return { ok: true, msg: `線路を ${pl.ok.length} 区間撤去しました（${man(pl.cost)}）。市外につながらなくなった駅は使えなくなります`, cost: pl.cost };
    }
    case 'tunnel': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planTunnel(s, cleanTiles(a.tiles) as number[], a.road);
      if (!pl.tun.length) return { ok: false, msg: '山（急斜面か保全林）の区画を含めてください。トンネルは山を抜ける道路です' };
      const e = spend(s, pl.cost, 'トンネルと道路'); if (e) return e;
      for (const i of pl.ok) { s.road[i] = a.road; s.roadAge[i] = 0; s.zone[i] = 0; }
      s.tunnel = [...new Set([...(s.tunnel ?? []), ...pl.tun])];
      s.roadVersion++;
      return { ok: true, msg: `トンネル ${pl.tun.length} 区間（約 ${pl.tun.length * 30}m）と道路 ${pl.ok.length - pl.tun.length} 区間をつくりました（${man(pl.cost)}）`, cost: pl.cost };
    }
    case 'bridge': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planBridge(s, cleanTiles(a.tiles) as number[], a.road);
      if (!pl.br.length) return { ok: false, msg: '川・水面・水路か、谷（急な斜面）・湿地・保全林の区画を含めてください。橋は水や谷の上を渡る道路です' };
      const e = spend(s, pl.cost, '橋と道路'); if (e) return e;
      for (const i of pl.ok) { s.road[i] = a.road; s.roadAge[i] = 0; s.zone[i] = 0; }
      s.bridge = [...new Set([...(s.bridge ?? []), ...pl.br])];
      s.roadVersion++;
      return { ok: true, msg: `橋 ${pl.br.length} 区間（約 ${pl.br.length * 30}m）と道路 ${pl.ok.length - pl.br.length} 区間をつくりました（${man(pl.cost)}）`, cost: pl.cost };
    }
    case 'overpass': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planOverpass(s, cleanTiles(a.tiles) as number[]);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '踏切を選んでください' };
      const e = spend(s, pl.cost, '陸橋'); if (e) return e;
      s.overpass = [...new Set([...(s.overpass ?? []), ...pl.ok])];
      s.roadVersion++;
      return { ok: true, msg: `踏切 ${pl.ok.length} か所を陸橋（跨線橋）にしました（${man(pl.cost)}）。車は列車を待たずに通れます`, cost: pl.cost };
    }
    case 'footbridge': {
      const pl = planFootbridge(s, cleanTiles(a.tiles) as number[]);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '道路を選んでください' };
      const e = spend(s, pl.cost, '歩道橋'); if (e) return e;
      s.footbridge = [...new Set([...(s.footbridge ?? []), ...pl.ok])];
      s.roadVersion++;
      return { ok: true, msg: `歩道橋を ${pl.ok.length} か所につくりました（${man(pl.cost)}）。まわりの子どもや高齢者が安全に道路を渡れます`, cost: pl.cost };
    }
    case 'canal': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planCanal(s, cleanTiles(a.tiles) as number[]);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '水路を掘れる空き地がありません' };
      const e = spend(s, pl.cost, '水路'); if (e) return e;
      for (const i of pl.ok) s.zone[i] = 0;
      s.canal = [...new Set([...(s.canal ?? []), ...pl.ok])];
      s.roadVersion++; s.bVersion++;
      return { ok: true, msg: `水路（運河）を ${pl.ok.length} 区画掘りました（${man(pl.cost)}）。まわりの浸水が減り、水辺の散歩道になります。道路で渡るには橋が要ります`, cost: pl.cost };
    }
    case 'area': {
      const t = (cleanTiles(a.tiles) as number[]).filter(i => !getMap(s.seed).water[i]);
      if (!t.length) return { ok: false, msg: '区画を選んでください' };
      if (!s.area || s.area.length !== W * H) s.area = new Array(W * H).fill(0);
      let n = 0;
      for (const i of t) { if (s.area[i] === a.v) continue; s.area[i] = a.v; n++; if (a.v === 1 && !s.occ[i] && s.zone[i] >= 1 && s.zone[i] <= 6) s.zone[i] = 0; }
      if (!n) return { ok: false, msg: '既にその区域です' };
      s.bVersion++;
      return { ok: true, msg: a.v === 1 ? `${n} 区画を市街化調整区域にしました。新しい開発（用途の指定・住宅の着工）を抑え、田畑と自然を守ります` : a.v === 2 ? `${n} 区画を居住誘導区域にしました（立地適正化計画）。住宅が集まりやすくなり、区域に人が集まると国の支援が増えます` : `${n} 区画を市街化区域に戻しました` };
    }
    case 'terra': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planTerra(s, cleanTiles(a.tiles) as number[], a.op);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '区画を選んでください' };
      const e = spend(s, pl.cost, TERRA_NAMES[a.op]); if (e) return e;
      const NV = (W + 1) * (H + 1), N = W * H, b = baseMap(s.seed);
      if (!s.terraH || s.terraH.length !== NV) s.terraH = new Array(NV).fill(0);
      if (!s.terraT || s.terraT.length !== N) s.terraT = new Array(N).fill(0);
      const T = s.terraT;
      for (const [k, d] of pl.verts) s.terraH[k] = d;
      for (const i of pl.ok) {
        const bw = !!b.water[i], bf = !!b.forest[i];
        if (a.op === 'water') T[i] = bw ? 0 : 1;
        else if (a.op === 'fill') T[i] = bw ? 2 : 0;
        else if (a.op === 'forest') T[i] = bf ? 0 : 3;
        else if (a.op === 'clear') T[i] = bf ? 4 : 0;
        else if (a.op === 'wet') T[i] = 5;
        else if (a.op === 'sand') T[i] = 6;
        else if (a.op === 'desert') T[i] = 7;
        else if (a.op === 'snow') T[i] = 8;
        else if (a.op === 'reset') { T[i] = 0; const x = i % W, y = (i / W) | 0, S = W + 1; for (const [vx, vy] of [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]]) if (vertexFree(s, vx, vy)) s.terraH[vy * S + vx] = 0; }
        if (a.op === 'water' || a.op === 'wet' || a.op === 'forest') s.zone[i] = 0;
      }
      s.terraVer = (s.terraVer ?? 0) + 1; syncTerrain(s);
      // 造作で使えなくなった区画の用途を外す
      const m = getMap(s.seed); for (const i of pl.ok) if (s.zone[i] && !buildable(m, i)) s.zone[i] = 0;
      if (s.levee) s.levee = s.levee.filter(i => { const x = i % W, y = (i / W) | 0; return NEIGH.some(([dx, dy]) => inMap(x + dx, y + dy) && m.water[idx(x + dx, y + dy)]); });
      s.roadVersion++; s.bVersion++;
      return { ok: true, msg: `${TERRA_NAMES[a.op]}：${pl.ok.length} 区画（${man(pl.cost)}）${pl.bad.length ? `。対象外 ${pl.bad.length} 区画（${pl.bad[0][1]}）` : ''}`, cost: pl.cost };
    }
    case 'widen': {
      if (fiscalCrisis(s) && a.on) return { ok: false, msg: crisisMsg(s) };
      const pl = planWiden(s, cleanTiles(a.tiles) as number[], a.on);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '幹線道路を選んでください' };
      if (a.on) { const e = spend(s, pl.cost, '6 車線化'); if (e) return e; }
      const set = new Set(s.wide ?? []); for (const i of pl.ok) a.on ? set.add(i) : set.delete(i);
      s.wide = [...set]; s.roadVersion++;
      return { ok: true, msg: a.on ? `幹線 ${pl.ok.length} 区間を 6 車線に広げました（${man(pl.cost)}）。容量が 1.5 倍になります` : `${pl.ok.length} 区間を 4 車線に戻しました`, cost: pl.cost };
    }
    case 'flyover': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planFlyover(s, cleanTiles(a.tiles) as number[]);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '交差点を選んでください' };
      const e = spend(s, pl.cost, '立体交差'); if (e) return e;
      s.flyover = [...new Set([...(s.flyover ?? []), ...pl.ok])]; s.roadVersion++;
      return { ok: true, msg: `交差点 ${pl.ok.length} か所を立体交差にしました（${man(pl.cost)}）。信号で止まらなくなり、容量が 1.8 倍になります`, cost: pl.cost };
    }
    case 'street': {
      const pl = planStreet(s, a.tiles, a.style); if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '変えられる道路がありません' };
      if (pl.cost > 0) { if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) }; const e = spend(s, pl.cost, '道路の種類'); if (e) return e; }
      const st = s.streets ?? (s.streets = {});
      if (a.style === 'none') { const rm = new Set(pl.ok); for (const k of ['tree', 'stone', 'nopole', 'charge'] as const) if (st[k]) st[k] = st[k]!.filter(i => !rm.has(i)); }
      else { const set = new Set(st[a.style] ?? []); for (const i of pl.ok) set.add(i); st[a.style] = [...set]; }
      s.roadVersion++;
      const nm = { tree: '並木道', stone: '石畳・カラー舗装の道', nopole: '電線を地中に埋めた道（無電柱化）', charge: '走りながら EV に充電できる道路', none: 'ふつうの道路' }[a.style];
      return { ok: true, msg: `${pl.ok.length} 区間を${nm}にしました${pl.cost ? `（${man(pl.cost)}）` : ''}`, cost: pl.cost };
    }
    case 'busStop': {
      const pl = planBusStop(s, cleanTiles(a.tiles) as number[], a.on);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '道路の区画を選んでください' };
      if (a.on) { const e = spend(s, pl.cost, 'バス停'); if (e) return e; }
      const set = new Set(s.busStops ?? []); for (const i of pl.ok) a.on ? set.add(i) : set.delete(i);
      s.busStops = [...set]; s.roadVersion++;
      return { ok: true, msg: a.on ? `バス停を ${pl.ok.length} か所つくりました。路線バスが停まり、近くの世帯の通勤が楽になります（運行の補助 月 ${P.busStopSubsidy} 万円/か所）` : `バス停を ${pl.ok.length} か所なくしました`, cost: pl.cost };
    }
    case 'levee': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const pl = planLevee(s, cleanTiles(a.tiles) as number[]);
      if (!pl.ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '川・水辺に面した空き地を選んでください' };
      const e = spend(s, pl.cost, '堤防'); if (e) return e;
      const set = new Set(s.levee ?? []); for (const i of pl.ok) { set.add(i); s.zone[i] = 0; }
      s.levee = [...set]; s.roadVersion++; s.bVersion++;
      return { ok: true, msg: `堤防を ${pl.ok.length} 区画つくりました（${man(pl.cost)}）。うしろの 120m の浸水が大きく減ります`, cost: pl.cost };
    }
    case 'airportUp': {
      const b = s.buildings.find(o => o.id === a.id);
      if (!b || b.kind !== 'airport') return { ok: false, msg: '空港ではありません' };
      const why = airportUpCheck(s, b); if (why) return { ok: false, msg: why };
      const lv = lvOf(b), cost = P.airportUpCost[lv + 1];
      const e = spend(s, cost, '空港の拡張'); if (e) return e;
      b.upAt = s.month + (lv === 1 ? 36 : 30);
      return { ok: true, msg: `${lv === 1 ? '滑走路の延長（2,500m・国際線が就航できる）' : '国際線ターミナルの新設（24 時間化）'}を国・県と始めました（市の負担 ${man(cost)}）`, cost };
    }
    case 'airRoute': {
      const r = AIR_ROUTES.find(o => o.id === a.route); if (!r) return { ok: false, msg: '路線がありません' };
      const list = s.airRoutes ?? [];
      if (!a.on) { if (!list.some(o => o.id === r.id)) return { ok: false, msg: '就航していません' }; s.airRoutes = list.filter(o => o.id !== r.id); return { ok: true, msg: `${r.dest}線の補助をやめ、${r.airline}は撤退しました` }; }
      const why = airRouteCheck(s, r.id); if (why) return { ok: false, msg: why };
      const cost = r.subsidy * 6; const e = spend(s, cost, '航空路線の誘致'); if (e) return e;
      s.airRoutes = [...list, { id: r.id, since: s.month }];
      return { ok: true, msg: `${r.airline}の${r.dest}線が就航しました（誘致の費用 ${man(cost)}、運航の補助 月 ${r.subsidy} 万円）。来訪者と知名度が上がります`, cost };
    }
    case 'unroad': {
      const pl = planUnroad(s, cleanTiles(a.tiles) as number[]), ok = pl.ok;
      if (!ok.length) return { ok: false, msg: pl.bad[0]?.[1] ?? '撤去できる市道がありません' };
      const cost = pl.cost;
      const e = spend(s, cost, '道路撤去'); if (e) return e;
      for (const i of ok) { s.road[i] = 0; s.roadAge[i] = 0; s.vc[i] = 0; delete s.roadBoost[i]; }
      { const rm = new Set(ok); for (const k of ['tunnel', 'bridge', 'overpass', 'footbridge', 'busStops'] as const) if (s[k]) s[k] = s[k]!.filter(i => !rm.has(i)); if (s.streets) for (const k of ['tree', 'stone', 'nopole', 'charge'] as const) if (s.streets[k]) s.streets[k] = s.streets[k]!.filter(i => !rm.has(i)); }
      s.roadVersion++;
      return { ok: true, msg: `道路を ${ok.length} 区間撤去しました（${man(cost)}）`, cost };
    }
    case 'repair': {
      const pl = planRepair(s, cleanTiles(a.tiles) as number[]), ok = pl.ok;
      if (!ok.length) return { ok: false, msg: '補修が必要な市道がありません' };
      const cost = pl.cost;
      const e = spend(s, cost, '道路補修'); if (e) return e;
      for (const i of ok) s.roadAge[i] = 0;
      return { ok: true, msg: `道路を ${ok.length} 区間補修しました（${man(cost)}）`, cost };
    }
    case 'zone': {
      const pl = planZone(s, cleanTiles(a.tiles) as number[], a.zone);
      for (const i of pl.ok) s.zone[i] = a.zone;
      const n = pl.ok.length;
      if (!n) return { ok: false, msg: '用途を変えられる空き区画がありません（建物・道路・保全区域は対象外）' };
      s.bVersion++;
      return { ok: true, msg: `${n} 区画の用途を指定しました` };
    }
    case 'build': {
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      if (s.fiscal?.status === 'rebuild' && !['water', 'sewage', 'care', 'fire', 'school', 'jhs', 'health', 'waste', 'funeral'].includes(DEFS[a.kind].fam)) return { ok: false, msg: '財政再生団体のため、暮らしに欠かせない施設（水道・下水・保育・消防・学校・医療・ごみ・斎場）のほかは建てられません' };
      if (DEFS[a.kind].build === 'none' && !(a.kind === 'station' && s.rail)) return { ok: false, msg: `${DEFS[a.kind].name}は市が建てられません（${DEFS[a.kind].owner}）` };
      const c = checkPlace(s, a.kind, a.x, a.y);
      if (!c.ok) return { ok: false, msg: c.reasons[0] };
      const d = DEFS[a.kind];
      const e = spend(s, c.cost, c.acq.length ? '建設費と用地費' : '建設費'); if (e) return e;
      const moved = acquire(s, c.acq);
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) s.zone[idx(a.x + dx, a.y + dy)] = 0;
      addBuilding(s, a.kind, a.x, a.y, 'construction', d.months);
      if (a.kind === 'usBase') s.modifiers.push({ key: 'approval', op: 'add', v: -0.05, until: s.month + 36, cost: 0, src: '米軍基地の受け入れへの反対' });
      if (a.kind === 'casino') s.modifiers.push({ key: 'approval', op: 'add', v: -0.04, until: s.month + 24, cost: 0, src: 'カジノ誘致への反対運動' });
      if (d.build === 'invite') return { ok: true, msg: `${d.name}の誘致を始めました（用地の整備と誘致活動 ${man(c.cost)}）。${d.months} か月後に、条件しだいで開業します`, cost: d.cost };
      if (d.build === 'request') return { ok: true, msg: `${d.name}の設置を${d.owner}に求めました（用地と負担金 ${man(c.cost)}）。${d.months} か月後に完成します。運営は${d.owner}です`, cost: d.cost };
      return { ok: true, msg: `${d.name}を着工しました（${man(c.cost)}${c.acq.length ? `。うち用地買収 ${man(c.cost - d.cost)}、${moved} 世帯が転居` : ''}）。完成は ${d.months} か月後` + (d.staffReq && d.wage ? `で、完成後に${d.staffKind}を採用しながら受け入れが増えます。工事中は定員に数えません` : '') + (c.level === 'warn' ? '。' + c.reasons[0] : ''), cost: d.cost };
    }
    case 'demolish': {
      const b = s.buildings.find(o => o.id === a.id);
      if (!b) return { ok: false, msg: '対象がありません' };
      const d = DEFS[b.kind];
      if (!isCity(b.kind)) {
        if (s.mode !== 'sandbox' || (!isRes(b.kind) && !isShop(b.kind))) return { ok: false, msg: `${d.name}は${d.owner}のもので、市は撤去できません` };
        removeBuilding(s, b);
        return { ok: true, msg: `${d.name}を撤去しました（サンドボックス）` };
      }
      if (b.status === 'construction') {
        const refund = d.cost * (b.remain / b.total) * P.cancelRefund;
        s.cash += refund; s.pending.capital -= refund;
        removeBuilding(s, b);
        return { ok: true, msg: `工事を中止しました（未施工分の半額 ${man(refund)} を返金）` };
      }
      const cost = d.cost * P.demolishRate;
      const e = spend(s, cost, '撤去費'); if (e) return e;
      removeBuilding(s, b);
      return { ok: true, msg: `${d.name}を撤去しました（${man(cost)}）。借入の返済は続きます`, cost };
    }
    case 'renew': {
      const b = s.buildings.find(o => o.id === a.id);
      if (!b || !isCity(b.kind)) return { ok: false, msg: '市の施設ではありません' };
      return startRenew(s, b);
    }
    case 'staff': {
      const b = s.buildings.find(o => o.id === a.id);
      if (!b || !isCity(b.kind) || !DEFS[b.kind].wage) return { ok: false, msg: 'この施設の職員数は市が決められません' };
      const max = Math.round(DEFS[b.kind].staffReq * LV_CAP[lvOf(b) - 1] * 1.2);
      b.staffTarget = Math.max(0, Math.min(max, Math.round(a.n)));
      return { ok: true, msg: `職員の目標を ${b.staffTarget} 人にしました。採用には時間がかかります` };
    }
    case 'suspend': {
      const b = s.buildings.find(o => o.id === a.id);
      if (!b || !isCity(b.kind)) return { ok: false, msg: '市の施設ではありません' };
      if (b.status === 'operating') { b.status = 'suspended'; b.staff = 0; s.bVersion++; return { ok: true, msg: `${DEFS[b.kind].name}を休止しました（維持費 30%）` }; }
      if (b.status === 'suspended') {
        if (b.age >= 100) return { ok: false, msg: '老朽化で使用停止中です。更新工事が必要です' };
        b.status = 'operating'; s.bVersion++; return { ok: true, msg: `${DEFS[b.kind].name}を再開しました。職員の採用には時間がかかります` };
      }
      return { ok: false, msg: '工事中は切り替えられません' };
    }
    case 'policy': {
      const p = POLICIES.find(o => o.id === a.id);
      if (!p) return { ok: false, msg: '政策がありません' };
      if (a.on && fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      if (!!s.policies[p.id]?.on === a.on) return { ok: false, msg: a.on ? 'その政策は既に実施中です' : 'その政策は実施していません' };
      s.policies[p.id] = { on: a.on, since: s.month };
      return { ok: true, msg: a.on ? `「${p.name}」を始めました（月 ${man(p.cost)}）。効果が出そろうまで ${p.ramp} か月` : `「${p.name}」をやめました` };
    }
    case 'repayTemp': {
      const td = tempDebt(s), amt = Math.floor(Math.min(td, a.amount ?? td, Math.max(0, s.cash)));
      if (td <= 0) return { ok: false, msg: '一時借入はありません' };
      if (amt <= 0) return { ok: false, msg: '返済に回せる資金がありません' };
      let rest = amt;
      for (const l of s.loans) if (l.kind === 'temp' && rest > 0) { const p = Math.min(l.remaining, rest); l.remaining -= p; rest -= p; }
      s.loans = s.loans.filter(l => l.remaining > 0.5);
      s.cash -= amt; s.pending.repay += amt;
      return { ok: true, msg: `一時借入を ${man(amt)} 返しました${tempDebt(s) > 0 ? `（残り ${man(tempDebt(s))}）` : '（完済）'}` };
    }
    case 'borrow': {
      const debt = s.loans.filter(l => l.kind === 'bond').reduce((x, l) => x + l.remaining, 0);
      if (s.fiscal?.status === 'rebuild') return { ok: false, msg: '財政再生団体のため、国の同意なしに市債を発行できません（財政再生計画で借金を減らしています）' };
      if (debt + a.amount > bondCap(s)) return { ok: false, msg: `市債の残高上限（${man(bondCap(s))}。人口に合わせて広がります${s.fiscal?.status === 'early' ? '。早期健全化団体のため 6 割に絞られています' : ''}）を超えます` };
      s.loans.push({ principal: a.amount, remaining: a.amount, rate: P.bondRate + rateAdd(s), months: P.bondMonths, kind: 'bond' }); // 市債の利率は日銀の金利につられる
      s.cash += a.amount; s.pending.borrowed += a.amount;
      if (tempDebt(s) > 0) return { ok: true, msg: `市債 ${man(a.amount)} を発行しました。一時借入（年利 ${P.tempRate * 100}%）は毎月の返済で減っていきます` };
      return { ok: true, msg: `市債 ${man(a.amount)} を発行しました（${P.bondMonths} か月返済、年利 ${P.bondRate * 100}%）` };
    }
    case 'event': return resolveEvent(s, a.id, a.option);
    case 'stationUp': {
      const b = s.buildings.find(o => o.id === a.id);
      if (!b || b.kind !== 'station') return { ok: false, msg: '駅ではありません' };
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      if (a.what === 'bldg') {
        const why = stationUpCheck(s, b); if (why) return { ok: false, msg: why };
        const lv = lvOf(b), cost = Math.round(P.stationUpCost[lv] * modMul(s, 'costMul') * diffOf(s).cost / 100) * 100;
        const e = spend(s, cost, '駅の拡張'); if (e) return e;
        b.upAt = s.month + P.stationUpMonths[lv];
        return { ok: true, msg: `${b.name ?? '駅'}の${lv === 1 ? '駅ビル化' : '大型ターミナル化'}を鉄道事業者と始めました（市の負担 ${man(cost)}・${P.stationUpMonths[lv]} か月）。工事中も駅は使えます`, cost };
      }
      const why = shinCheck(s, b); if (why) return { ok: false, msg: why };
      const cost = Math.round(P.shinCost * modMul(s, 'costMul') * diffOf(s).cost / 100) * 100;
      const e = spend(s, cost, '新幹線の新駅（地元負担）'); if (e) return e;
      b.shin = s.month + P.shinMonths;
      return { ok: true, msg: `${b.name ?? '駅'}に新幹線が停まるよう、国と鉄道事業者に新駅の整備を求め、地元の負担 ${man(cost)} を約束しました。${P.shinMonths / 12} 年後に開業します`, cost };
    }
    case 'upgrade': {
      const b = s.buildings.find(o => o.id === a.id);
      if (!b || DEFS[b.kind].build === 'invite') return { ok: false, msg: '市の施設（要望の施設を含む）だけ増築できます。企業や店は［増設の補助］から' };
      const d = DEFS[b.kind], lv = lvOf(b);
      { const why = upgradeBlock(s, b); if (why) return { ok: false, msg: why }; }
      if (b.status !== 'operating') return { ok: false, msg: '稼働中の施設だけ増築できます' };
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const cost = upgradeCost(b, s), months = Math.max(2, Math.ceil(d.months * 0.5));
      const e = spend(s, cost, '増築費'); if (e) return e;
      b.status = 'renewing'; b.upg = true; b.remain = months; b.total = months; s.bVersion++;
      return { ok: true, msg: `${d.name}の増築を始めました（${man(cost)}・${months} か月）。工事中は能力が ${Math.round(d.renewFactor * 100)}% になり、完成するとレベル ${lv + 1}「${stageName(b.kind, lv + 1)}」（${d.capacity > 1 ? `能力 ${Math.round(LV_CAP[lv] * 100)}%` : `効果 ${Math.round((1 + 0.2 * lv) * 100)}%`}）になります`, cost };
    }
    case 'buyout': {
      // 住宅の用地買収と撤去：土地代と補償を払い、住んでいる世帯は転居する。区画は用途の指定を外して空き地に戻す
      const b = s.buildings.find(o => o.id === a.id);
      if (!b || !isRes(b.kind)) return { ok: false, msg: '住宅ではありません' };
      if (b.sandbox || s.mode === 'sandbox') { removeBuilding(s, b); return { ok: true, msg: `${DEFS[b.kind].name}を撤去しました` }; }
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const cost = buyoutCost(s, b);
      const e = spend(s, cost, '用地買収'); if (e) return e;
      const hh = sumHH(b);
      for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) s.zone[idx(b.x + dx, b.y + dy)] = 0;
      acquire(s, [b.id]);
      if (hh >= 0.5) s.modifiers.push({ key: 'approval', op: 'add', v: -Math.min(0.03, 0.0015 * hh), until: s.month + 6, cost: 0, src: '住宅の用地買収' });
      return { ok: true, msg: `${DEFS[b.kind].name}の用地を買収して撤去しました（${man(cost)}）。${hh >= 0.5 ? `住んでいた ${Math.round(hh)} 世帯は転居しました。` : ''}跡地は空き地（用途の指定なし）です`, cost };
    }
    case 'tax': {
      const t = s.tax, old = t[a.key];
      if (a.key === 'stay') { t.stay = a.v ? 1 : 0; if (t.stay !== old) s.modifiers.push({ key: 'approval', op: 'add', v: t.stay ? -0.01 : 0.005, until: s.month + 6, cost: 0, src: '宿泊税の見直し' }); s.acts['tax:stay'] = s.month; return { ok: true, msg: t.stay ? '宿泊税を設けました（市内のホテルに泊まる人から 1 泊 200 円）' : '宿泊税をやめました' }; }
      const last = s.acts['tax:' + a.key];
      if (last !== undefined && s.month - last < 6) return { ok: false, msg: `税率は 6 か月に 1 回まで変えられます（議会で条例を改正するため。次は ${6 - (s.month - last)} か月後）` };
      const v = Math.round(a.v * 100) / 100;
      if (s.fiscal?.status === 'rebuild' && v < old) return { ok: false, msg: '財政再生団体のあいだは、税率を下げられません（財政再生計画で国の同意が必要です）' };
      if (Math.abs(v - old) < 0.005) return { ok: false, msg: '税率が変わっていません' };
      t[a.key] = v; s.acts['tax:' + a.key] = s.month;
      const k = a.key === 'res' ? 1.3 : a.key === 'prop' ? 0.8 : 0.3;
      s.modifiers.push({ key: 'approval', op: 'add', v: -k * (v - old) * (v > old ? 1 : 0.7), until: s.month + 12, cost: 0, src: `${a.key === 'res' ? '住民税' : a.key === 'prop' ? '固定資産税' : '法人の税'}の${v > old ? '引き上げ' : '引き下げ'}` });
      return { ok: true, msg: `${a.key === 'res' ? '住民税' : a.key === 'prop' ? '固定資産税' : '法人の税'}を標準の ${Math.round(v * 100)}% にしました（翌月の収支から反映）` };
    }
    case 'goals': {
      if (!s.goalPick) return { ok: false, msg: 'いまは公約を選ぶ時期ではありません（任期の初めに選びます）' };
      s.goals = a.ids.map(id => { const g = GOALS.find(o => o.id === id)!, v = g.value(s), t = g.target(s), met = id !== 'fiscal' && (g.lower ? v <= t : v >= t); return { id, base: Math.round(v * 1000) / 1000, target: t, diff: met ? 1 : g.diff }; }); // 既に達成している公約は「維持」なので軽く数える
      if (a.vision && !s.vision) { s.vision = a.vision; s.visionStart = s.month; }
      s.goalPick = false;
      return { ok: true, msg: `公約を掲げました：${a.ids.map(id => GOALS.find(o => o.id === id)!.name).join('・')}${a.vision ? `。ビジョン「${VISIONS.find(v => v.id === a.vision)!.name}」` : ''}` };
    }
    case 'team': {
      const d = SPORTS[a.sport];
      if (!a.on) {
        const t = (s.teams ?? []).find(o => o.sport === a.sport); if (!t) return { ok: false, msg: 'チームがありません' };
        s.teams = s.teams!.filter(o => o !== t);
        s.modifiers.push({ key: 'approval', op: 'add', v: -0.03, until: s.month + 12, cost: 0, src: `${t.name}の撤退` });
        return { ok: true, msg: `${t.name}への支援をやめ、チームは市外へ移りました。ファンの反発で支持率が下がります` };
      }
      const why = teamCheck(s, a.sport); if (why) return { ok: false, msg: why };
      if (fiscalCrisis(s)) return { ok: false, msg: crisisMsg(s) };
      const e = spend(s, d.cost, `${d.name}チームへの出資`); if (e) return e;
      s.pending.capital -= d.cost; s.pending.other += d.cost;
      const t = addTeam(s, a.sport);
      s.modifiers.push({ key: 'approval', op: 'add', v: 0.02, until: s.month + 12, cost: 0, src: `${t.name}の誕生` });
      return { ok: true, msg: `${d.league}に「${t.name}」が誕生しました（出資 ${man(d.cost)}・支援 月 ${d.support} 万円）。12 月にシーズンの順位が決まります`, cost: d.cost };
    }
    case 'rerun': {
      const why = rerunCheck(s); if (why) return { ok: false, msg: why };
      const r = rerunElection(s);
      return { ok: true, msg: r.win ? `立候補して当選しました（得票 ${r.vote.toFixed(1)}%）。${s.term} 期目の任期が始まります` : `立候補しましたが、届きませんでした（得票 ${r.vote.toFixed(1)}%）。12 か月後にまた挑戦できます` };
    }
    case 'pol': return polAct(s, a, (amt, what) => spend(s, amt, what));
    case 'sister': {
      const d = SIS[a.id]; if (!d) return { ok: false, msg: 'その都市はありません' };
      const list = s.sisters ?? [], cur = list.find(p => p.id === a.id);
      if (a.act === 'join') {
        if (cur) return { ok: false, msg: 'すでに姉妹都市です' };
        if (list.length >= MAX_SISTERS) return { ok: false, msg: `姉妹都市は ${MAX_SISTERS} つまでです` };
        if ((s.fame ?? 0) < d.fame) return { ok: false, msg: `相手に知ってもらうには、知名度 ${d.fame} 以上が要ります（いま ${Math.round(s.fame ?? 0)}）` };
        const e = spend(s, d.cost, '姉妹都市の提携'); if (e) return e;
        s.sisters = [...list, { id: d.id, since: s.month, rel: 0.4 }]; s.fame = Math.min(100, (s.fame ?? 0) + 1);
        return { ok: true, msg: `${d.name}（${d.country}）と姉妹都市になりました（${man(d.cost)}）。テーマは${d.theme}。交流を重ねると関係が深まり、効果が大きくなります`, cost: d.cost };
      }
      if (!cur) return { ok: false, msg: '姉妹都市ではありません' };
      if (a.act === 'end') { s.sisters = list.filter(p => p.id !== a.id); if (!s.sisters.length) s.sisters = undefined; return { ok: true, msg: `${d.name}との提携を解消しました` }; }
      const x = EXCHANGES.find(o => o.id === a.act)!;
      if (cur.last !== undefined && s.month - cur.last < 6) return { ok: false, msg: `同じ相手との交流は 6 か月に 1 回です（あと ${6 - (s.month - cur.last)} か月）` };
      const e = spend(s, x.cost, x.name); if (e) return e;
      cur.rel = Math.min(1, cur.rel + x.rel); cur.last = s.month;
      if (x.id === 'trade') s.modifiers.push({ key: 'econ', op: 'mul', v: 1.01, until: s.month + 12, cost: 0, src: `${d.name}との経済ミッション` });
      if (x.id === 'student') s.modifiers.push({ key: 'sat:3', op: 'add', v: 0.004, until: s.month + 12, cost: 0, src: `${d.name}との交換留学` });
      if (x.id === 'culture') s.fame = Math.min(100, (s.fame ?? 0) + 1);
      return { ok: true, msg: `${d.name}と「${x.name}」をしました（${man(x.cost)}）。関係 ${Math.round(cur.rel * 100)}%`, cost: x.cost };
    }
    case 'challenge': { const why = startChallenge(s, a.id); if (why) return { ok: false, msg: why }; const c = CH[a.id]; return { ok: true, msg: `挑戦「${c.name}」を始めます。目標：${c.goal}` }; }
    case 'move': {
      const b = s.buildings.find(o => o.id === a.id); if (!b) return { ok: false, msg: '施設が見つかりません' };
      const d = DEFS[b.kind];
      if (!isCity(b.kind) || REAL) return { ok: false, msg: '市の施設だけ移設できます' };
      if (b.status !== 'operating') return { ok: false, msg: '稼働中の施設だけ移設できます' };
      if (a.x === b.x && a.y === b.y) return { ok: false, msg: '同じ場所です' };
      const keep = { lv: b.lv, opts: b.opts, style: b.style, age: b.age, builtMonth: b.builtMonth, staff: b.staff, staffTarget: b.staffTarget };
      removeBuilding(s, b);
      const c = checkPlace(s, b.kind, a.x, a.y);
      if (c.level === 'error') return { ok: false, msg: c.reasons.join('・') || 'そこには置けません' };
      const cost = moveCost(s, b), e = spend(s, cost, '移設費'); if (e) return e;
      const months = Math.max(2, Math.ceil(d.months * 0.3)), nb = addBuilding(s, b.kind, a.x, a.y, 'construction', months);
      Object.assign(nb, keep); nb.moved = true; nb.status = 'construction'; nb.remain = months; nb.total = months;
      s.roadVersion++; s.bVersion++;
      return { ok: true, msg: `${d.name}を移設しています（${man(cost)}・${months} か月）。レベルと改修はそのまま引き継ぎます`, cost };
    }
    case 'expand': {
      const b = s.buildings.find(o => o.id === a.id); if (!b) return { ok: false, msg: '施設が見つかりません' };
      const d = DEFS[b.kind];
      if (d.build !== 'invite') return { ok: false, msg: '誘致した企業・施設だけです（市の施設は［増築］）' };
      if (b.status !== 'operating') return { ok: false, msg: '営業中の施設だけです' };
      if (lvOf(b) >= 3) return { ok: false, msg: 'これ以上は増設できません' };
      const cost = expandCost(s, b), e = spend(s, cost, '増設の補助'); if (e) return e;
      b.status = 'renewing'; b.upg = true; b.remain = 6; b.total = 6; s.bVersion++;
      return { ok: true, msg: `${d.name}の増設を補助しました（${man(cost)}）。6 か月後にレベル ${lvOf(b) + 1}「${stageName(b.kind, lvOf(b) + 1)}」になり、雇用と税が増えます`, cost };
    }
    case 'option': {
      const b = s.buildings.find(o => o.id === a.id); if (!b) return { ok: false, msg: '施設が見つかりません' };
      const o = OPT[a.opt]; if (!o || !optionsFor(b.kind).includes(o)) return { ok: false, msg: 'この施設には付けられない改修です' };
      const cur = b.opts ?? [];
      if (!a.on) { if (!cur.includes(o.id)) return { ok: false, msg: '付いていません' }; b.opts = cur.filter(x => x !== o.id); if (!b.opts.length) b.opts = undefined; s.bVersion++; return { ok: true, msg: `${DEFS[b.kind].name}の「${o.name}」をやめました` }; }
      if (cur.includes(o.id)) return { ok: false, msg: 'もう付いています' };
      if (cur.length >= optSlots(b)) return { ok: false, msg: `改修は ${optSlots(b)} つまでです（レベル 4 で 3 つに）。先にどれかをやめてください` };
      if (b.status !== 'operating') return { ok: false, msg: '稼働中の施設だけ改修できます' };
      const cost = Math.round(optCost(b, o) * modMul(s, 'costMul') * diffOf(s).cost / 100) * 100;
      if (cost) { const e = spend(s, cost, '改修費'); if (e) return e; }
      b.opts = [...cur, o.id]; s.bVersion++;
      return { ok: true, msg: `${DEFS[b.kind].name}に「${o.name}」を付けました${cost ? `（${man(cost)}）` : ''}${o.id === 'naming' ? `。愛称は「${sponsorOf(b)}${DEFS[b.kind].name}」` : ''}`, cost };
    }
    case 'style': {
      const b = s.buildings.find(o => o.id === a.id); if (!b) return { ok: false, msg: '施設が見つかりません' };
      if (isRes(b.kind) || isShop(b.kind) || DEFS[b.kind].build === 'none') return { ok: false, msg: '市の施設と誘致した施設の外観だけ変えられます' };
      if ((b.style ?? 0) === a.v) return { ok: false, msg: 'いまと同じ外観です' };
      const e = spend(s, STYLE_COST, '外観の改修'); if (e) return e;
      b.style = a.v || undefined; s.bVersion++;
      return { ok: true, msg: `${DEFS[b.kind].name}の外観を「${STYLES[a.v]}」にしました（${man(STYLE_COST)}）`, cost: STYLE_COST };
    }
    case 'annex': {
      const M = s.mayor;
      if (!s.unlocked || !M) return { ok: false, msg: 'この街では区域の制限がありません' };
      if (M.annex <= 0) return { ok: false, msg: '編入できる回数がありません（市長レベルが上がるか、全国ランキングで大賞を取ると増えます）' };
      if (!annexable(s).includes(a.block)) return { ok: false, msg: 'いまの市の区域ととなり合った区域だけ編入できます' };
      s.unlocked = [...s.unlocked, a.block].sort((x, y) => x - y); M.annex--; M.annexed = (M.annexed ?? 0) + 1;
      s.modifiers.push({ key: 'approval', op: 'add', v: 0.01, until: s.month + 6, cost: 0, src: '区域の編入' });
      s.roadVersion++; s.bVersion++;
      return { ok: true, msg: `${blockName(a.block)}を市に編入しました。道路・用途・施設をつくれます` };
    }
    case 'difficulty': {
      if (!DIFFS[a.v]) return { ok: false, msg: '難易度の指定が不正です' };
      s.difficulty = a.v;
      if (s.mayor && s.unlocked && s.month === 0 && !(s.mayor.annexed ?? 0)) s.mayor.annex = mayorDiff(s).start; // 始める前なら、はじめの編入の回数も合わせる
      return { ok: true, msg: `難易度を「${DIFFS[a.v].name}」にしました。${DIFFS[a.v].desc}` };
    }
    case 'civic': {
      const c = CIVIC.find(o => o.id === a.id);
      if (!c) return { ok: false, msg: 'その取り組みはありません' };
      const last = s.acts[c.id];
      if (c.once && last !== undefined) return { ok: false, msg: '既に行いました' };
      const nd = c.need?.(s); if (nd) return { ok: false, msg: nd };
      if (last !== undefined && s.month - last < c.cool) return { ok: false, msg: `次にできるのは ${c.cool - (s.month - last)} か月後です` };
      if (fiscalCrisis(s) && c.cost > 0) return { ok: false, msg: crisisMsg(s) };
      const e = spend(s, c.cost, c.name); if (e) return e;
      s.pending.capital -= c.cost; s.pending.other += c.cost; // 建設費ではなく、その他の支出として記録
      for (const m of c.mods) s.modifiers.push({ key: m.key, op: m.op, v: m.v, until: m.months < 0 ? -1 : s.month + m.months, cost: m.cost ?? 0, src: c.name });
      s.acts[c.id] = s.month;
      if (c.id === 'festival') s.celeb = { kind: 'festival', month: s.month, label: '市民まつり' };
      if (c.cat === '広域' && c.id !== 'merge') for (const n of s.neighbors) n.rel = Math.min(1, Math.round((n.rel + 0.06) * 1000) / 1000); // 協力すると隣町との関係が良くなる
      if (c.id === 'youtube') {
        // 乱数で結果が変わる（当たれば知名度・支持率・転入、外れると炎上）
        if (rngNext(s) < 0.8) { s.modifiers.push({ key: 'approval', op: 'add', v: 0.02, until: s.month + 6, cost: 0, src: c.name }, { key: 'fame', op: 'add', v: 3, until: s.month + 12, cost: 0, src: c.name }, { key: 'inflow', op: 'mul', v: 1.03, until: s.month + 6, cost: 0, src: c.name }); return { ok: true, msg: '市長の出演回は再生 50 万回を超え、「住んでみたい」というコメントが相次ぎました。6 か月、支持率と転入が上がり、知名度も上がります', cost: c.cost }; }
        s.modifiers.push({ key: 'approval', op: 'add', v: -0.025, until: s.month + 4, cost: 0, src: '市長の発言が炎上' }); return { ok: true, msg: '発言の一部が切り取られて広まり、炎上してしまいました。4 か月、支持率が下がります（謝罪と説明で収まりつつあります）', cost: c.cost };
      }
      if (c.id === 'merge') { const n = mergePartner(s); s.neighbors = s.neighbors.filter(o => o !== n); return { ok: true, msg: `${n.name}と合併しました（${man(c.cost)}）。交付金と補助が増え、知名度が上がりました。しばらく支持率が下がります`, cost: c.cost }; }
      return { ok: true, msg: `${c.name}を行いました（${man(c.cost)}）。${c.result}`, cost: c.cost };
    }
    case 'sandboxPlace': {
      if (s.mode !== 'sandbox') return { ok: false, msg: '直接配置はサンドボックス専用です。経営モードでは用途指定と誘致で民間に働きかけます' };
      const bizK = a.kind === 'officeS' || a.kind === 'officeM' || a.kind === 'smallFactory';
      if (!isRes(a.kind) && !isShop(a.kind) && !bizK) return { ok: false, msg: '直接配置できない種類です' };
      const c = checkPlace(s, a.kind, a.x, a.y, true);
      if (!c.ok) return { ok: false, msg: c.reasons[0] };
      const d = DEFS[a.kind];
      for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) s.zone[idx(a.x + dx, a.y + dy)] = bizK ? (a.kind === 'smallFactory' ? 6 : 5) : isShop(a.kind) ? 4 : a.kind === 'house' ? 1 : a.kind === 'apartment' ? 2 : 3;
      const b = addBuilding(s, a.kind, a.x, a.y, 'operating', 0);
      b.sandbox = true;
      return { ok: true, msg: `${d.name}を直接配置しました（サンドボックス）。入居や売上は通常の計算に従います` };
    }
  }
}

/** 直線（L 字）で結ぶタイル列：道路ツールのドラッグ用 */
export function lineTiles(x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  const horiz = Math.abs(x1 - x0) >= Math.abs(y1 - y0);
  const n = horiz ? Math.abs(x1 - x0) : Math.abs(y1 - y0);
  const sx = Math.sign(x1 - x0), sy = Math.sign(y1 - y0);
  for (let k = 0; k <= n && k < 200; k++) { const x = horiz ? x0 + k * sx : x0, y = horiz ? y0 : y0 + k * sy; if (inMap(x, y)) out.push(idx(x, y)); }
  return out;
}

export function rectTiles(x0: number, y0: number, x1: number, y1: number): number[] {
  const out: number[] = [];
  for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) if (inMap(x, y)) out.push(idx(x, y));
  return out;
}

export { NEIGH, W, H };

/** 住宅の用地買収の費用（土地代と、住んでいる世帯への補償。空き家なら土地代と解体費だけ） */
export function buyoutCost(s: GameState, b: Building): number {
  const occ = b.units ? Math.min(1, sumHH(b) / b.units) : 0;
  return Math.round((P.acqTile * b.w * b.h + P.acqUnit * (b.units ?? 0) * (0.4 + 0.6 * occ)) * modMul(s, 'costMul'));
}
/** 増築の費用（建設費の半分ほど） */
/** 駅ビル化・大型ターミナル化ができるか（できないときは理由） */
/** 空港を拡張できるか（滑走路の延長→国際線ターミナル） */
export function airportUpCheck(s: GameState, b: Building): string | null {
  if (b.status !== 'operating') return '使われている空港だけ拡張できます';
  if (b.upAt !== undefined) return `拡張工事中です（あと ${b.upAt - s.month} か月）`;
  if (lvOf(b) >= 3) return 'これ以上は拡張できません';
  if (lvOf(b) === 1 && s.stats.pop < 25000 * SCALE) return `滑走路の延長には、人口 ${(25000 * SCALE).toLocaleString()} 人以上が必要です`;
  if (lvOf(b) === 2 && (s.fame ?? 0) < 40) return `国際線ターミナルには、知名度 40 以上が必要です（いま ${Math.round(s.fame ?? 0)}）`;
  return null;
}
/** 航空路線を誘致できるか */
export function airRouteCheck(s: GameState, id: string): string | null {
  const r = AIR_ROUTES.find(o => o.id === id); if (!r) return '路線がありません';
  const ap = s.buildings.find(b => b.kind === 'airport' && b.status === 'operating');
  if (!ap) return '空港が要ります';
  if ((s.airRoutes ?? []).some(o => o.id === id)) return '既に就航しています';
  if (r.intl && lvOf(ap) < 2) return '国際線には、滑走路の延長（空港の拡張）が要ります';
  if (s.stats.pop < r.popReq * SCALE) return `人口 ${(r.popReq * SCALE).toLocaleString()} 人以上が必要です`;
  if ((s.fame ?? 0) < r.fameReq) return `知名度 ${r.fameReq} 以上が必要です（いま ${Math.round(s.fame ?? 0)}）`;
  return null;
}
export function stationUpCheck(s: GameState, b: Building): string | null {
  if (b.status !== 'operating' || !b.connected) return '使われている駅だけ拡張できます';
  if (b.upAt !== undefined) return `拡張工事中です（あと ${b.upAt - s.month} か月）`;
  if (lvOf(b) >= 3) return 'これ以上は拡張できません';
  if (lvOf(b) === 2 && s.stats.pop < 12000 * SCALE) return `大型ターミナルにするには、人口 ${(12000 * SCALE).toLocaleString()} 人以上が必要です`;
  return null;
}
/** 新幹線の新駅を誘致できるか */
export function shinCheck(s: GameState, b: Building): string | null {
  if (s.buildings.some(o => o.shin !== undefined)) return '新幹線の駅は市に 1 か所です';
  if (b.status !== 'operating' || !b.connected) return '使われている駅だけです';
  if (lvOf(b) < 2) return '先に駅ビル化（レベル 2）が必要です';
  if (s.stats.pop < 15000 * SCALE) return `人口 ${(15000 * SCALE).toLocaleString()} 人以上が必要です（いま ${Math.round(s.stats.pop).toLocaleString()} 人）`;
  if ((s.fame ?? 0) < 25) return `知名度 25 以上が必要です（いま ${Math.round(s.fame ?? 0)}）`;
  return null;
}
export function upgradeCost(b: Building, s?: GameState): number { return Math.round(DEFS[b.kind].cost * 0.5 * (1 + 0.25 * (lvOf(b) - 1)) * (s ? modMul(s, 'costMul') * diffOf(s).cost : 1) / 100) * 100; }
/** 市の施設の移設費（建設費の 3 割） */
export function moveCost(s: GameState, b: Building): number { return Math.round(DEFS[b.kind].cost * 0.3 * modMul(s, 'costMul') * diffOf(s).cost / 100) * 100; }
/** 誘致した施設の増設の補助（市が出す分） */
export function expandCost(s: GameState, b: Building): number { return Math.round(DEFS[b.kind].cost * 0.25 * lvOf(b) * modMul(s, 'costMul') * diffOf(s).cost / 100) * 100; }
/** 増築できないときの理由（できるなら null）。レベル 4 は市長レベル 3、レベル 5 は市長レベル 5 から */
export function upgradeBlock(s: GameState, b: Building): string | null {
  const mx = maxLv(b.kind), lv = lvOf(b);
  if (!mx) return 'この施設は増築できません';
  if (lv >= mx) return 'これ以上は増築できません';
  if (b.status !== 'operating') return '稼働中の施設だけ増築できます';
  const ml = s.mayor ? levelOf(s.mayor.pts) : 1;
  if (lv + 1 === 4 && ml < 3) return `レベル 4 にするには、市長レベル 3 以上が要ります（いま ${ml}）`;
  if (lv + 1 === 5 && ml < 5) return `レベル 5 にするには、市長レベル 5 以上が要ります（いま ${ml}）`;
  return null;
}

/** 市長の取り組み（視察・交流・まつり・誘致・防災）。効果は期限つきの係数 */
export interface CivicDef { id: string; name: string; cat: string; cost: number; cool: number; once?: boolean; desc: string; result: string; mods: { key: string; op: 'mul' | 'add'; v: number; months: number; cost?: number }[]; need?: (s: GameState) => string | null }
/** 合併の相手（関係がいちばん良い、いちばん小さな隣町） */
export const mergePartner = (s: GameState) => [...(s.neighbors ?? [])].sort((a, b) => a.pop - b.pop)[0];
export const CIVIC: CivicDef[] = [
  { id: 'marathon', cat: '交流', name: '市民マラソンの開催', cost: 1500, cool: 12, desc: '駅前から川沿いを走るフルマラソンとファンランを開きます。市外から 1 万人のランナーと応援が来て、3 か月、来訪者が 1.15 倍、知名度が上がり、6 か月、満足と支持率が少し上がります。当日は道路を止めるので、ひと月だけ渋滞の苦情も出ます。', result: '来訪者・知名度・満足・支持率が上がります', mods: [{ key: 'visitors', op: 'mul', v: 1.15, months: 3 }, { key: 'fame', op: 'add', v: 3, months: 24 }, { key: 'sat:all', op: 'add', v: 0.008, months: 6 }, { key: 'approval', op: 'add', v: 0.015, months: 6 }, { key: 'peakTrips', op: 'mul', v: 1.05, months: 1 }], need: s => s.stats.pop < 6000 * SCALE ? `人口 ${(6000 * SCALE).toLocaleString()} 人以上で開けます` : null },
  { id: 'youtube', cat: '交流', name: '市長が YouTube に出演する', cost: 30, cool: 6, desc: '人気の動画チャンネルに出て、街の魅力や施策を話します。うまくいけば知名度と支持率が上がりますが、発言が切り取られて炎上することもあります（2 割）。', result: '', mods: [] },
  { id: 'visit:kids', cat: '視察', name: '子育て先進都市への視察', cost: 300, cool: 12, desc: '保育士の確保で成果を上げた市を視察し、やり方を取り入れます。12 か月、保育士の採用が 1.3 倍になります。', result: '保育士の採用が 12 か月、速くなります', mods: [{ key: 'hire:保育士', op: 'mul', v: 1.3, months: 12 }, { key: 'approval', op: 'add', v: 0.01, months: 6 }] },
  { id: 'visit:env', cat: '視察', name: '環境先進都市への視察', cost: 300, cool: 12, desc: '工場の排出を減らした市を視察し、事業者と協定を結びます。24 か月、工場などの排出が 15% 減ります。', result: '工場などの排出が 24 か月、減ります', mods: [{ key: 'factoryClean', op: 'mul', v: 0.85, months: 24 }] },
  { id: 'visit:tour', cat: '視察', name: '観光で成功した街への視察', cost: 400, cool: 12, desc: '観光の売り込み方を学び、PR に取り入れます。24 か月、来訪者が 1.1 倍、知名度が少し上がります。', result: '来訪者と知名度が上がります', mods: [{ key: 'visitors', op: 'mul', v: 1.1, months: 24 }, { key: 'fame', op: 'add', v: 2, months: 24 }] },
  { id: 'expo', cat: '交流', name: '企業誘致フェアへの出展', cost: 500, cool: 12, desc: '首都圏の企業向けに街を売り込みます。18 か月、企業誘致の見込みが上がります。', result: '18 か月、企業が来てくれやすくなります', mods: [{ key: 'bizIncentive', op: 'add', v: 0.1, months: 18 }] },
  { id: 'itPartner', cat: '交流', name: 'IT 企業とスマートシティ提携', cost: 2000, cool: 0, once: true, desc: '進出した米大手 IT 企業と、行政の手続き・交通・防災のデジタル化で提携します。満足と景気がずっと少し上がり、若い世代の転入が増えます。', result: '満足・景気・転入がずっと少し上がります', mods: [{ key: 'sat:all', op: 'add', v: 0.005, months: -1 }, { key: 'econ', op: 'mul', v: 1.015, months: -1 }, { key: 'inflow:0', op: 'mul', v: 1.08, months: -1 }], need: s => (s.buildings.some(b => b.kind === 'globalIT' && b.status === 'operating') ? null : '米大手 IT 企業の日本拠点が市内に要ります') },
  { id: 'sister', cat: '交流', name: '姉妹都市の提携', cost: 800, cool: 0, once: true, desc: '海外の都市と姉妹都市になり、学生や文化の交流を続けます。知名度が上がり、来訪者が増えます（交流費 月 20 万円）。', result: '知名度と来訪者がずっと少し上がります', mods: [{ key: 'fame', op: 'add', v: 4, months: -1, cost: 20 }, { key: 'visitors', op: 'mul', v: 1.05, months: -1 }] },
  { id: 'festival', cat: '交流', name: '市民まつりの開催', cost: 600, cool: 12, desc: '地区の団体と市民まつりを開きます。6 か月、全世帯の満足と支持率が少し上がり、知名度も上がります。', result: '6 か月、満足と支持率が上がります', mods: [{ key: 'sat:all', op: 'add', v: 0.012, months: 6 }, { key: 'approval', op: 'add', v: 0.03, months: 6 }, { key: 'fame', op: 'add', v: 1.5, months: 12 }] },
  { id: 'townhall', cat: '交流', name: '地区ごとの対話集会', cost: 50, cool: 6, desc: '各地区で住民と直接話します。3 か月、支持率が少し上がります。', result: '支持率が少し上がります', mods: [{ key: 'approval', op: 'add', v: 0.02, months: 3 }] },
  { id: 'drill', cat: '防災', name: '総合防災訓練', cost: 150, cool: 12, desc: '学校や自治会と避難訓練を行います。24 か月、災害への備えが 15% 上がります。', result: '災害への備えが上がります', mods: [{ key: 'prep', op: 'mul', v: 1.15, months: 24 }, { key: 'approval', op: 'add', v: 0.01, months: 6 }] },
  { id: 'patrol', cat: '防災', name: '防犯パトロールと防犯カメラ', cost: 400, cool: 12, desc: '自治会のパトロールを支援し、通学路に防犯カメラを付けます。24 か月、治安が良くなります（月 30 万円）。', result: '24 か月、犯罪が減ります', mods: [{ key: 'safety', op: 'add', v: 0.3, months: 24, cost: 30 }] },
  { id: 'kumiai', cat: '広域', name: '一部事務組合に加わる（ごみ処理・消防の共同運営）', cost: 1500, cool: 0, once: true, desc: '隣の市町と組合をつくり、清掃工場と消防を共同で運営します。ごみ処理の能力が 1,500 世帯分増え、消防の到達範囲が 15% 広がり、災害への備えも上がります（ずっと。負担金 月 120 万円）。', result: 'ごみ処理と消防が強まりました', mods: [{ key: 'wasteCap', op: 'add', v: 1500, months: -1, cost: 120 }, { key: 'fireRange', op: 'mul', v: 1.15, months: -1 }, { key: 'prep', op: 'mul', v: 1.05, months: -1 }], need: s => (s.month < 12 ? '任期が始まって 12 か月たってから話し合えます' : null) },
  { id: 'merge', cat: '広域', name: '隣町との合併', cost: 3000, cool: 0, once: true, desc: 'いちばん小さな隣町と合併します。国の特例で交付金が 10 年、8% 増え、合併特例債で施設の建設に 15% の補助がつきます（5 年）。街の名前が知られ、転入も 5% 増えますが、住民の反発で 12 か月、支持率が下がります。隣町は一覧から消えます（旧町の地域は地図に描きません）。', result: '合併しました', mods: [{ key: 'transfer', op: 'mul', v: 1.08, months: 120 }, { key: 'grant:kids', op: 'add', v: 0.15, months: 60 }, { key: 'grant:edu', op: 'add', v: 0.15, months: 60 }, { key: 'grant:infra', op: 'add', v: 0.15, months: 60 }, { key: 'grant:safety', op: 'add', v: 0.15, months: 60 }, { key: 'fame', op: 'add', v: 4, months: -1 }, { key: 'inflow', op: 'mul', v: 1.05, months: -1 }, { key: 'approval', op: 'add', v: -0.05, months: 12 }], need: s => { const n = mergePartner(s); if (!n) return '合併できる隣町がありません'; if (s.month < 24) return '合併の協議には時間がかかります（24 か月目から）'; if ((n.rel ?? 0.5) < 0.55) return `${n.name}との関係がまだ十分ではありません（いま ${Math.round((n.rel ?? 0.5) * 100)}%、55% 以上が必要。広域連携や災害の応援で良くなります）`; return null; } },
  { id: 'pact', cat: '広域', name: '隣町と広域連携（ごみ・消防の相互応援）', cost: 0, cool: 36, desc: '隣の市町と協定を結び、ごみ処理と消防を応援し合います。36 か月、ごみ処理の能力が増え、災害への備えが上がります（負担金 月 60 万円）。', result: 'ごみ処理と災害への備えが 36 か月、強まります', mods: [{ key: 'wasteCap', op: 'add', v: 800, months: 36, cost: 60 }, { key: 'prep', op: 'mul', v: 1.1, months: 36 }] },
];

/** 建設費（資材高や国の補助を反映）。補助は子育て・教育・防災・インフラの施設に効く */
export function buildCost(s: GameState, kind: Kind): number {
  const d = DEFS[kind], grant = d.build === 'city' ? Math.min(0.5, modAdd(s, 'grant:' + d.cat)) : 0;
  return d.cost * modMul(s, 'costMul') * diffOf(s).cost * (1 - grant) * (d.build === 'city' && s.buildings.some(b => b.kind === 'zenecon' && b.status === 'operating') ? 0.96 : 1); // 大手ゼネコンの支店があると市の工事が少し安い
}
