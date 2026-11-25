// 鉄道会社の新線・新駅の開発（v48）：人口が増えると、駅から遠い住宅地へ向けて、鉄道会社が支線（曲がった線路）と新駅をつくる。
// 建物の多い所や公園の下は地下（地下鉄）、川の上は高架。乗客の見込みが大きいほど早く決まる。
// 乱数の並び（rngNext）は使わない（月と種から決まるハッシュ）。予測（forecast）では呼ばない。
import { W, H, DEFS, isRes, isShop } from './config';
import { getMap, idx, inMap } from './map';
import { railNbrs, sharpAt } from './railnet';
import { addBuilding } from './events';
import { DISTRICTS, type GameState } from './types';

type Dev = { n: number; next: number; lines: { name: string; month: number; tiles: number; sub: boolean; st: number[] }[] };
const h01 = (a: number) => { const v = Math.sin(a) * 43758.5453; return v - Math.floor(v); };
const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]] as const;
export const railDevOf = (s: GameState): Dev => { const a = s as any; if (!a.railDev) a.railDev = { n: 0, next: 36, lines: [] }; return a.railDev as Dev; };

/** 毎月。条件がそろえば新線を 1 本つくる（最大 4 本、4 年おき） */
export function updateRailDev(s: GameState): void {
  if (!s.rail || !s.rail.some(v => v > 0)) return;
  const D = railDevOf(s);
  if (D.n >= 4 || s.month < D.next || s.stats.pop < 6000 + D.n * 5000) return;
  const r = planLine(s, D.n);
  D.next = s.month + (r ? 48 : 12); // つくれなかったら 1 年後にもう一度考える
  if (!r) return;
  const m = getMap(s.seed);
  if (!s.railGrade) s.railGrade = new Array(W * H).fill(0);
  if (!s.railKind) s.railKind = new Array(W * H).fill(0);
  r.tiles.forEach((i, k) => { s.rail![i] = 1; s.railGrade![i] = r.grade[k]; s.railKind![i] = 0; if (r.grade[k] !== 2) s.zone[i] = 0; });
  const st: number[] = [];
  for (const [x, y] of r.stations) { const b = addBuilding(s, 'station', x, y, 'construction', 24); st.push(b.id); }
  s.roadVersion++;
  const dn = DISTRICTS[m.district[r.tiles[r.tiles.length - 1]]] ?? '新町', sub = r.grade.filter(g => g === 2).length > r.grade.length * 0.5;
  const name = `${dn}${sub ? '地下鉄' : '支'}線`;
  D.n++; D.lines.push({ name, month: s.month, tiles: r.tiles.length, sub, st });
  s.notes.push(`🚃 鉄道会社が新線「${name}」（約 ${(r.tiles.length * 0.03).toFixed(1)} km${sub ? '・ほとんど地下' : ''}）を敷き、新駅 ${r.stations.length} 駅（${dn}${r.stations.length > 1 ? 'ほか' : ''}）の工事を始めました。駅は 2 年で開業します。費用は鉄道会社が出します`);
}

/** 新線の計画：始点（今の線路のまっすぐな所）から、駅から遠い住宅地へ。null ならつくれる所がない */
export function planLine(s: GameState, salt = 0): { tiles: number[]; grade: number[]; stations: [number, number][] } | null {
  const m = getMap(s.seed), rail = s.rail!, has = (i: number) => rail[i] > 0;
  const stations = s.buildings.filter(b => b.kind === 'station');
  const stDist = (x: number, y: number) => stations.reduce((a, b) => Math.min(a, Math.hypot(b.x + 1 - x, b.y - y)), 1e9);
  // 目的地：住宅と店の多い所（駅から 14 区画以上離れた所）
  const pop = new Float32Array(W * H);
  for (const b of s.buildings) if (isRes(b.kind) || isShop(b.kind)) { const v = (b.units ?? 4) + (isShop(b.kind) ? 6 : 0); pop[idx(b.x, b.y)] += v; }
  let best = -1, bs = 0;
  for (let y = 3; y < H - 3; y += 3) for (let x = 3; x < W - 3; x += 3) {
    const i = idx(x, y); if (m.water[i] || stDist(x, y) < 14) continue;
    let v = 0; for (let dy = -7; dy <= 7; dy++) for (let dx = -7; dx <= 7; dx++) if (inMap(x + dx, y + dy)) v += pop[idx(x + dx, y + dy)];
    v *= 0.85 + 0.3 * h01(s.seed * 0.7 + x * 3.1 + y * 7.3 + salt * 11.7);
    if (v > bs) { bs = v; best = i; }
  }
  if (best < 0 || bs < 120) return null;
  const tx = best % W, ty = (best / W) | 0;
  // 新駅の場所：目的地の近くの空き地（3×1）
  const site = findSite(s, tx, ty, 6); if (!site) return null;
  // 始点：今の駅の、本線と反対側（乗り換え駅になる）。本線とは 1 区画あけて、駅に沿って 3 区画まっすぐ出てから曲がる。
  // 線路の区画は斜めの隣でつながるので、本線から直接分けると急な分岐になる。地下鉄と同じく、別の線として駅で乗り換える
  const near1 = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (inMap(x + dx, y + dy) && has(idx(x + dx, y + dy))) return true; return false; };
  const starts: { seq: number[]; v: [number, number]; d: number }[] = [];
  for (const b of stations) {
    if (b.status !== 'operating' && b.status !== 'construction') continue;
    const row = (y: number) => [0, 1, 2].some(dx => inMap(b.x + dx, y) && has(idx(b.x + dx, y)));
    const cands: [number[], [number, number]][] = [];
    const rowSeq = (y: number) => [0, 1, 2].map(dx => idx(b.x + dx, y));
    if (row(b.y - 1) && !row(b.y + 1) && b.y + 1 < H - 1) { const q = rowSeq(b.y + 1); cands.push([q, [1, 0]], [[...q].reverse(), [-1, 0]]); }
    if (row(b.y + 1) && !row(b.y - 1) && b.y - 1 > 0) { const q = rowSeq(b.y - 1); cands.push([q, [1, 0]], [[...q].reverse(), [-1, 0]]); }
    if (inMap(b.x - 1, b.y) && has(idx(b.x - 1, b.y)) && b.x + 3 < W - 1) cands.push([[idx(b.x + 3, b.y)], [1, 0]]);
    if (inMap(b.x + 3, b.y) && has(idx(b.x + 3, b.y)) && b.x - 1 > 0) cands.push([[idx(b.x - 1, b.y)], [-1, 0]]);
    for (const [seq, v] of cands) {
      if (seq.some(i => near1(i % W, (i / W) | 0) || m.water[i])) continue;
      const e = seq[seq.length - 1], d = Math.hypot(site[0] + 1 - e % W, site[1] - ((e / W) | 0)); if (d < 10 || d > 75) continue;
      if ((d < 18 ? 0 : 1) && Math.sign(site[0] + 1 - e % W) !== v[0] && Math.abs(site[0] + 1 - e % W) > Math.abs(site[1] - ((e / W) | 0))) continue; // 目的地と逆向きに出ない
      starts.push({ seq, v, d });
    }
  }
  starts.sort((a, b) => a.d - b.d);
  for (const st of starts.slice(0, 6)) {
    const p = route(s, st.seq[st.seq.length - 1], st.v, site, new Set(st.seq)); if (!p) continue;
    const tiles = [...st.seq, ...p.slice(1)], grade = tiles.map(i => tileGrade(s, i));
    // 短い地上の区間は前後に合わせる（地下と地上を細かく行き来しない）
    for (let k = 0; k < grade.length; k++) if (grade[k] !== 2) { let e = k; while (e < grade.length && grade[e] !== 2) e++; if (e - k < 4 && k > 0 && e < grade.length) for (let q = k; q < e; q++) grade[q] = m.water[tiles[q]] ? 1 : 2; k = e; }
    // 形の確認（急なカーブ・他の線路との交差がない）
    const set = new Set(tiles), h2 = (i: number) => has(i) || set.has(i);
    if (tiles.some(i => sharpAt(h2, i))) continue;
    const stations: [number, number][] = [site];
    if (tiles.length > 26) { const mid = tiles[tiles.length >> 1], ms = findSite(s, mid % W, (mid / W) | 0, 2, set); if (ms && Math.hypot(ms[0] - site[0], ms[1] - site[1]) > 10) stations.unshift(ms); }
    return { tiles, grade, stations };
  }
  return null;
}
/** 区画の高さ：建物・公園・林・急斜面・国道の下は地下、川の上は高架、それ以外は地上 */
export function tileGrade(s: GameState, i: number): number {
  const m = getMap(s.seed);
  if (m.water[i]) return 1;
  if (s.occ[i] || s.road[i] === 3 || m.forest[i] || (m.park && m.park[i]) || (m.blocked && m.blocked[i]) || m.steep[i]) return 2;
  return 0;
}
/** 駅の場所（3×1 の空き地。道路に面していると良い） */
export function findSite(s: GameState, cx: number, cy: number, r: number, avoid?: Set<number>): [number, number] | null {
  const m = getMap(s.seed); let best: [number, number] | null = null, bd = 1e9;
  for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 3 && ok; dx++) { // まわり 1 区画に他の線路がない（新線だけが通る）
      const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) { ok = false; break; } const i = idx(xx, yy), inside = dy === 0 && dx >= 0 && dx < 3;
      if (inside && (s.occ[i] || s.road[i] || s.rail![i] || m.water[i] || m.steep[i] || m.forest[i] || (m.park && m.park[i]) || (m.blocked && m.blocked[i]) || avoid?.has(i))) ok = false;
      if (!inside && s.rail![i]) ok = false;
    }
    if (!ok) continue;
    let road = 0; for (let dx = 0; dx < 3; dx++) for (const dy of [-1, 1]) if (inMap(x + dx, y + dy) && s.road[idx(x + dx, y + dy)]) road++;
    for (const dx of [-1, 3]) if (inMap(x + dx, y) && s.road[idx(x + dx, y)]) road++;
    const d = Math.hypot(x + 1 - cx, y - cy) - road * 0.8; if (road && d < bd) { bd = d; best = [x, y]; }
  }
  return best;
}
/** 線路の道筋（向きつきの A*）：1 歩で 45 度までしか曲がらない。駅の敷地の真下の行（駅の長辺に沿う）に着く */
export function route(s: GameState, start: number, v: [number, number], site: [number, number], own: Set<number>, costOf?: (i: number) => number): number[] | null { // v97：costOf は区画の重み（オートの延伸が使う。省けば鉄道会社の新線と同じ）
  const rail = s.rail!;
  const goal = new Set<number>(); for (let dx = 0; dx < 3; dx++) for (const dy of [-1, 1]) if (inMap(site[0] + dx, site[1] + dy)) goal.add(idx(site[0] + dx, site[1] + dy));
  const blocked = (i: number) => { const x = i % W, y = (i / W) | 0; if (y === site[1] && x >= site[0] && x < site[0] + 3) return true; return false; };
  const nearRail = (x: number, y: number) => { for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const xx = x + dx, yy = y + dy; if (inMap(xx, yy) && rail[idx(xx, yy)]) return true; } return false; };
  const cost = costOf ?? ((i: number) => { const g = tileGrade(s, i); return g === 2 ? 2.2 : g === 1 ? 2.0 : s.road[i] ? 1.3 : 1; });
  const N = W * H * 16, gS = new Float32Array(N).fill(1e9), from = new Int32Array(N).fill(-1), open: [number, number][] = [];
  const hz = (i: number) => { const x = i % W, y = (i / W) | 0; return Math.hypot(x - site[0] - 1, y - site[1]); };
  const push = (k: number, f: number) => { open.push([f, k]); let c = open.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (open[p][0] <= open[c][0]) break; [open[p], open[c]] = [open[c], open[p]]; c = p; } };
  const pop = () => { const top = open[0], last = open.pop()!; if (open.length) { open[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let mm = c; if (l < open.length && open[l][0] < open[mm][0]) mm = l; if (r < open.length && open[r][0] < open[mm][0]) mm = r; if (mm === c) break; [open[mm], open[c]] = [open[c], open[mm]]; c = mm; } } return top; };
  // 駅に沿った向きのまま出る
  { const d = D8.findIndex(([dx, dy]) => dx === v[0] && dy === v[1]), k = start * 16 + d * 2; gS[k] = 0; push(k, hz(start)); }
  let n = 0;
  while (open.length && n++ < 120000) {
    const [, k] = pop(), i = (k / 16) | 0, d = (k >> 1) & 7, tn = k & 1, g = gS[k];
    if (goal.has(i) && i !== start) { const out: number[] = []; let q = k; while (q >= 0) { out.push((q / 16) | 0); q = from[q]; } out.reverse(); return out.filter((t, j) => j === 0 || t !== out[j - 1]); }
    for (const dd of tn ? [d] : [d, (d + 1) % 8, (d + 7) % 8]) { // 曲がった次の 1 歩はまっすぐ（ゆるやかなカーブ）
      const [dx, dy] = D8[dd], x = i % W + dx, y = ((i / W) | 0) + dy; if (!inMap(x, y) || x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
      const j = idx(x, y); if (rail[j] || own.has(j) || blocked(j) || nearRail(x, y)) continue;
      const step = (dx && dy ? 1.414 : 1) * cost(j) + (dd !== d ? 0.5 : 0), kk = j * 16 + dd * 2 + (dd !== d ? 1 : 0), ng = g + step;
      if (ng < gS[kk]) { gS[kk] = ng; from[kk] = k; push(kk, ng + hz(j)); }
    }
  }
  return null;
}
void DEFS;
