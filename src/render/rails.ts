// まちづくり版の線路の描画：区画の線路を、なめらかな曲線の線（高さつき）にして描く。
// 地上はバラスト・枕木・レール、高架はコンクリートの桁と橋脚、川は鉄橋、地下はトンネルの坑口だけを描く。
// 道路と地上の線路が交わる区画は踏切（遮断機・警報機）。列車もこの線の上を走る。
import { Geo } from './geo';
import { RK, decal, face } from './roadkit';
import { W, H, TILE, heightAt, idx, hash } from '../sim/index';
import { railChains } from '../sim/railnet';
import type { GameState, MapDef, Building } from '../sim/index';

export interface RailPath {
  /** 点の並び（x, y, z）。約 3m おき */
  p: Float32Array;
  /** 先頭からの距離 */
  d: Float32Array;
  /** 点ごとの区画・地面からの高さ（高架で＋、地下で−）・線路の水準（1 単線・2 複線） */
  tile: Int32Array; off: Float32Array; lv: Uint8Array;
  /** 掘割（半地下。上は空いていて、両側を擁壁で囲む） */
  cut: Uint8Array;
  /** 両端の区画（分岐・端）。端が地図の外へ出ていれば ext */
  a: number; b: number; extA: boolean; extB: boolean;
  len: number;
  /** 線の種類（0 鉄道・1 モノレール・2 新交通） */
  kind?: number;
}

const ELEV = 8.5, DEEP = -11, CUT = -6.5;
const onEdge = (i: number) => { const x = i % W, y = (i / W) | 0; return x === 0 || y === 0 || x === W - 1 || y === H - 1; };

/** 線路の区画から、曲線の線（高さつき）を作る */
export function buildRailPaths(s: GameState, m: MapDef): RailPath[] {
  const R = s.rail!, G = s.railGrade ?? [], KD = s.railKind;
  const out: RailPath[] = [];
  // 線の種類（鉄道・モノレール・新交通）ごとに、別の線として組み立てる（種類の境目で線を分ける）
  for (const K of KD ? [0, 1, 2] : [0]) {
  const has = (i: number) => R[i] > 0 && (KD?.[i] ?? 0) === K;
  const tiles: number[] = []; for (let i = 0; i < R.length; i++) if (has(i)) tiles.push(i);
  for (const ch of railChains(has, tiles)) {
    if (ch.length < 2) continue;
    let pts = ch.map(i => [(i % W + 0.5) * TILE, (((i / W) | 0) + 0.5) * TILE]);
    // 地図の端の区画で終わる線は、地図の外まで延ばす（市外へ続く）
    const ext = (end: number, nb: number): [number, number] | null => {
      if (!onEdge(ch[end])) return null;
      const [x, z] = pts[end], [px, pz] = pts[nb]; let dx = x - px, dz = z - pz; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const xx = ch[end] % W, yy = (ch[end] / W) | 0;
      // 端の外側へ向かっていないときは、外向きに曲げる
      const ox = xx === 0 ? -1 : xx === W - 1 ? 1 : 0, oz = yy === 0 ? -1 : yy === H - 1 ? 1 : 0;
      if (dx * ox + dz * oz < 0.3) { dx = ox || dx * 0.3; dz = oz || dz * 0.3; const l2 = Math.hypot(dx, dz) || 1; dx /= l2; dz /= l2; }
      return [x + dx * TILE * 0.9, z + dz * TILE * 0.9];
    };
    const ea = ext(0, 1), eb = ext(ch.length - 1, ch.length - 2);
    if (ea) pts.unshift(ea);
    if (eb) pts.push(eb);
    // なめらかに：階段状の並びをならし（端は動かさない）、角を丸める
    for (let it = 0; it < 6; it++) { const q = pts.map(p => p.slice()); for (let k = 1; k < pts.length - 1; k++) { q[k][0] = pts[k - 1][0] * 0.25 + pts[k][0] * 0.5 + pts[k + 1][0] * 0.25; q[k][1] = pts[k - 1][1] * 0.25 + pts[k][1] * 0.5 + pts[k + 1][1] * 0.25; } pts = q; }
    for (let it = 0; it < 3; it++) {
      const q: number[][] = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) { const [ax, az] = pts[k], [bx, bz] = pts[k + 1]; q.push([ax * 0.75 + bx * 0.25, az * 0.75 + bz * 0.25], [ax * 0.25 + bx * 0.75, az * 0.25 + bz * 0.75]); }
      q.push(pts[pts.length - 1]); pts = q;
    }
    // 約 3m おきに並べ直す
    const cum = [0]; for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const len = cum[cum.length - 1], n = Math.max(2, Math.ceil(len / 3) + 1);
    const P = new Float32Array(n * 3), D = new Float32Array(n), T = new Int32Array(n), O = new Float32Array(n), LV = new Uint8Array(n), CU = new Uint8Array(n);
    let k = 0;
    const base = new Float32Array(n), top = new Float32Array(n), water = new Uint8Array(n);
    for (let j = 0; j < n; j++) {
      const d = len * j / (n - 1); while (k < cum.length - 2 && cum[k + 1] < d) k++;
      const t = (d - cum[k]) / ((cum[k + 1] - cum[k]) || 1), x = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * t, z = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * t;
      P[j * 3] = x; P[j * 3 + 2] = z; D[j] = d;
      // いちばん近い線路の区画（この線の区画から）
      let bt = ch[0], bd = 1e18; for (const i of ch) { const dx = (i % W + 0.5) * TILE - x, dz = (((i / W) | 0) + 0.5) * TILE - z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; bt = i; } }
      T[j] = bt; LV[j] = R[bt]; O[j] = G[bt] === 1 ? ELEV : G[bt] === 2 ? DEEP : G[bt] === 3 ? CUT : 0; CU[j] = G[bt] === 3 ? 1 : 0;
      const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE), inside = tx >= 0 && tz >= 0 && tx < W && tz < H;
      water[j] = inside && m.water[idx(tx, tz)] ? 1 : 0;
      const cx2 = Math.max(0, Math.min(W * TILE - 0.01, x)), cz2 = Math.max(0, Math.min(H * TILE - 0.01, z));
      base[j] = heightAt(m, cx2, cz2);
      // 地面の三角形は標高の格子の点を結ぶので、格子の 4 隅のいちばん高い所より下には埋もれない
      const st = 10, gx = Math.floor(cx2 / st) * st, gz = Math.floor(cz2 / st) * st;
      top[j] = Math.max(heightAt(m, gx, gz), heightAt(m, Math.min(W * TILE - 0.01, gx + st), gz), heightAt(m, gx, Math.min(H * TILE - 0.01, gz + st)), heightAt(m, Math.min(W * TILE - 0.01, gx + st), Math.min(H * TILE - 0.01, gz + st)));
    }
    // 川の上は、両岸の高さを結ぶ（鉄橋）
    for (let j = 0; j < n; j++) if (water[j]) {
      let a = j; while (a > 0 && water[a]) a--; let b = j; while (b < n - 1 && water[b]) b++;
      const ha = water[a] ? 2 : base[a], hb = water[b] ? 2 : base[b];
      for (let q = a + 1; q < b; q++) base[q] = Math.max(2, ha + (hb - ha) * (q - a) / (b - a));
      j = b;
    }
    // 線路の勾配はゆるやかに：地面の高さを前後 ±12m でならす。高架・地下への上り下りは ±21m・±9m でならす
    const sm = (a: Float32Array, r: number) => { const o = new Float32Array(a.length); for (let j = 0; j < a.length; j++) { let s2 = 0, c = 0; for (let q = Math.max(0, j - r); q <= Math.min(a.length - 1, j + r); q++) { s2 += a[q]; c++; } o[j] = s2 / c; } return o; };
    if (K) for (let j = 0; j < Math.min(10, n); j++) { if (!ea) O[j] *= j / 10; if (!eb) O[n - 1 - j] *= j / 10; } // モノレール・新交通の端は、地上の線路から坂で上がる
    const bs = sm(base, 4);
    const up = sm(O.map(v => Math.max(0, v)), 7), dn = sm(O.map(v => Math.min(0, v)), 3);
    for (let j = 0; j < n; j++) { O[j] = up[j] + dn[j]; P[j * 3 + 1] = bs[j] + O[j]; }
    // 地上の線路が地面に埋もれないよう、地面より下がる所は地面に合わせる（地下を除く）
    {
      const lift = new Float32Array(n);
      for (let j = 0; j < n; j++) lift[j] = O[j] > -0.5 ? Math.max(P[j * 3 + 1], (water[j] ? base[j] : top[j]) + O[j]) : P[j * 3 + 1];
      const ls = sm(lift, 3);
      for (let j = 0; j < n; j++) P[j * 3 + 1] = O[j] > -0.5 ? Math.max(ls[j], base[j] + O[j] + 0.1) : lift[j];
    }
    // 踏切（道路と地上の線路が交わる区画）では、線路を道路の高さ（地面）にそろえ、前後 12m でなじませる
    for (let j = 0; j < n; j++) {
      const t = T[j]; if (!(s.road[t] && !G[t])) continue;
      for (let q = Math.max(0, j - 4); q <= Math.min(n - 1, j + 4); q++) { const w = q === j ? 1 : 1 - Math.abs(q - j) / 5, y = base[q] + O[q]; P[q * 3 + 1] = P[q * 3 + 1] * (1 - w) + y * w; }
      P[j * 3 + 1] = base[j];
    }
    out.push({ p: P, d: D, tile: T, off: O, lv: LV, cut: CU, a: ch[0], b: ch[ch.length - 1], extA: !!ea, extB: !!eb, len, kind: K });
  }
  }
  // 分岐・合流の高さをそろえる（v76）：線は分岐ごとに別々にならすので、同じ区画で出会う線の端の高さがずれて、桁に段差ができていた。
  // 出会う端のうち、いちばん高い端に合わせ、端から約 45m かけてなじませる（桁・橋脚・列車は同じ点列を使うので、すべてつながる）
  {
    const ends = new Map<string, { P: RailPath; end: 0 | 1 }[]>();
    for (const P of out) { if (!P.extA) { const k = P.a + ':' + (P.kind ?? 0); ends.set(k, [...(ends.get(k) ?? []), { P, end: 0 }]); } if (!P.extB) { const k = P.b + ':' + (P.kind ?? 0); ends.set(k, [...(ends.get(k) ?? []), { P, end: 1 }]); } }
    for (const list of ends.values()) {
      if (list.length < 2) continue;
      const yOf = (e: { P: RailPath; end: 0 | 1 }) => e.P.p[(e.end ? e.P.p.length / 3 - 1 : 0) * 3 + 1];
      const target = Math.max(...list.map(yOf));
      if (!Number.isFinite(target)) continue;
      for (const e of list) { const n = e.P.p.length / 3, dy = target - yOf(e); if (!(Math.abs(dy) >= 0.01) || n < 2) continue; const NB = Math.min(15, n - 1); // 点が 1 つだけの線は 0 で割ることになり、高さが NaN になっていた（v76 からの不具合）
        for (let q = 0; q <= NB; q++) { const j = e.end ? n - 1 - q : q, t = 1 - q / NB, w = t * t * (3 - 2 * t); e.P.p[j * 3 + 1] += dy * w; e.P.off[j] += dy * w; } }
    }
  }
  return out;
}

/** 踏切の遮断機の竿（動かすので、画面側で描く）。根元の位置・下りたときに伸びる向き・長さ・踏切の区画 */
export interface Gate { x: number; y: number; z: number; dx: number; dz: number; len: number; tile: number }
/** 駅のホームの上の、乗客が立つ場所（駅ごと） */
/** 新幹線の線（駅のホームの中心・向き・高さ）。走る列車の描画に使う */
export type ShinLine = { cx: number; cz: number; tx: number; tz: number; hy: number; open: boolean; half: number };
export const SHIN_LINES: ShinLine[] = [];
/** 新幹線の高架の高さ。実物と同じく、線は水平のまま（ホームの高さ）で、地面が低い所は高い橋脚、
 *  地面が高い所は山に入る（トンネル）。前は「地面から 8m 上」を 20m ごとに取っていて、坂では桁が階段になっていた。
 *  桁・橋脚・トンネルの口・走る列車がすべてこの値を使う */
export function shinDeckY(_m: MapDef, L: ShinLine, _u: number): number { return L.hy; }
/** 新幹線のその位置が、地面より下（トンネル・掘割の覆い）か */
export function shinTunnel(m: MapDef, L: ShinLine, u: number): boolean {
  for (const d of [-10, 0, 10]) { const x = L.cx + L.tx * (u + d), z = L.cz + L.tz * (u + d); if (x >= 0 && z >= 0 && x < W * TILE && z < H * TILE && heightAt(m, x, z) > L.hy - 2) return true; }
  return false;
}
export interface StationSpot { id: number; pts: number[]; d: number; path: number; bld?: { x: number; y: number; z: number; rot: number } }
/** 駅舎を glb（render/landmarks.ts）で置くか。置くときは地上の駅（レベル 1）の駅舎の箱を描かない */
export const RAIL_LM = { station: false };
/** 駅が線路のどこに付くか：駅の敷地に一番近い線の点（地上・高架を優先） */
interface Anchor { b: Building; k: number; j: number; side: number; under: boolean }
function stationAnchors(s: GameState, paths: RailPath[]): Anchor[] {
  const out: Anchor[] = [];
  for (const b of s.buildings) {
    if (b.kind !== 'station' || b.status === 'construction') continue;
    const x0 = b.x * TILE, x1 = (b.x + b.w) * TILE, z0 = b.y * TILE, z1 = (b.y + b.h) * TILE;
    let best: Anchor | null = null, bd = 1e9;
    paths.forEach((P, k) => {
      const n = P.d.length;
      for (let j = 0; j < n; j++) {
        const x = P.p[j * 3], z = P.p[j * 3 + 2], dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1), d = Math.hypot(dx, dz) + (P.off[j] < -1.2 ? 25 : 0);
        if (d < bd && P.d[j] > 45 && P.d[j] < P.len - 45) { bd = d; best = { b, k, j, side: 0, under: P.off[j] < -1.2 }; }
      }
    });
    if (!best || bd > 75) continue;
    const a = best as Anchor, P = paths[a.k], j = a.j, ja = Math.max(0, j - 1), jb = Math.min(P.d.length - 1, j + 1);
    const tx = P.p[jb * 3] - P.p[ja * 3], tz = P.p[jb * 3 + 2] - P.p[ja * 3 + 2], cx = (x0 + x1) / 2 - P.p[j * 3], cz = (z0 + z1) / 2 - P.p[j * 3 + 2];
    a.side = (-tz * cx + tx * cz) >= 0 ? 1 : -1;
    out.push(a);
  }
  return out;
}

/** 線路・高架・鉄橋・坑口・踏切・架線柱・駅（ホーム・屋根・駅舎・跨線橋）を描く。動かす遮断機と、ホームの乗客の立ち位置を返す */
/** detail：0 簡略（品質「低」）・1 中・2 高。kit：標識の面と路面の文字を描く Geo（render/roadkit.ts。無ければ描かない） */
export function drawRailPaths(g: Geo, s: GameState, m: MapDef, paths: RailPath[], detail = 2, kit?: Geo): { gates: Gate[]; spots: StationSpot[]; lamps: number[] } {
  const lamps: number[] = []; // 夜に灯る明かり（ホームの蛍光灯・線路沿いの灯）
  g.at(0, 0, 0);
  const gates: Gate[] = [], spots: StationSpot[] = [];
  SHIN_LINES.length = 0;
  const anchors = stationAnchors(s, paths);
  // 駅のホームがかかる範囲（線ごと、先頭からの距離）。ホームの所は防音壁と架線柱を省く
  const spanOf = (k: number, d: number) => anchors.some(a => a.k === k && !a.under && Math.abs(paths[k].d[a.j] - d) < 52);
  const G = s.railGrade ?? [];
  const ground = (x: number, z: number) => heightAt(m, Math.max(0, Math.min(W * TILE - 0.01, x)), Math.max(0, Math.min(H * TILE - 0.01, z)));
  const ovp = new Set(s.overpass ?? []), crossing = (i: number) => !!s.road[i] && !G[i] && !ovp.has(i); // 陸橋の区画は踏切ではない
  const both = (a: number[], b: number[], c: number[], d: number[], col: number) => { g.quad(a as any, b as any, c as any, d as any, col); g.quad(d as any, c as any, b as any, a as any, col); };
  // 上向きの面（線路の向きによって三角形の回りが逆になり、上から見えなくなっていたので、法線が上を向く順に並べる）
  type V3 = [number, number, number];
  const up = (a: V3, b: V3, c: V3, d: V3, col: number, sh = 1) => { const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2]; if (uz * vx - ux * vz >= 0) g.quad(a, b, c, d, col, sh); else g.quad(a, d, c, b, col, sh); };
  // 分岐・合流：同じ区画で出会う線の端（位置・線へ入っていく向き・桁の半幅）。防音壁が相手の線路を横切らないように使う
  type End = { P: RailPath; x: number; z: number; dx: number; dz: number; half: number };
  const junc = new Map<number, End[]>();
  for (const P of paths) { const n = P.p.length / 3; if (n < 3 || P.kind) continue;
    for (const [end, ext, tile] of [[0, P.extA, P.a], [1, P.extB, P.b]] as const) { if (ext) continue; const j0 = end ? n - 1 : 0, j1 = end ? n - 3 : 2, dx = P.p[j1 * 3] - P.p[j0 * 3], dz = P.p[j1 * 3 + 2] - P.p[j0 * 3 + 2], L = Math.hypot(dx, dz) || 1, lv = P.lv[j0];
      junc.set(tile, [...(junc.get(tile) ?? []), { P, x: P.p[j0 * 3], z: P.p[j0 * 3 + 2], dx: dx / L, dz: dz / L, half: lv === 3 ? 9.6 : lv >= 2 ? 5.2 : 3.0 }]); } }
  /** その点が、同じ分岐で出会うほかの線の桁の上か */
  const onOther = (P: RailPath, x: number, z: number): boolean => {
    for (const t of [P.a, P.b]) { const es = junc.get(t); if (!es || es.length < 2) continue;
      for (const e of es) { if (e.P === P) continue; const qx = x - e.x, qz = z - e.z, al = qx * e.dx + qz * e.dz; if (al > -1.5 && al < 60 && Math.abs(qx * e.dz - qz * e.dx) < e.half + 0.75) return true; } }
    return false; };
  for (const P of paths) {
    const n = P.p.length / 3, X = (j: number) => P.p[j * 3], Y = (j: number) => P.p[j * 3 + 1], Z = (j: number) => P.p[j * 3 + 2];
    const tan = (j: number): [number, number] => { const a = Math.max(0, j - 1), b = Math.min(n - 1, j + 1), dx = X(b) - X(a), dz = Z(b) - Z(a), L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; };
    const vis = (j: number) => P.off[j] > -1.2 || (P.cut[j] === 1 && P.off[j] > -7.5);
    let poleAcc = 0, pierAcc = 12, poleN = 0, sigAcc = 160, kmAcc = 0, kmN = 0;
    // v86：線ごとの決まり（作り直しても同じ）：まくらぎ（PC か木）・高架の型（ラーメンか壁の橋脚）・鉄橋のトラス・柵・架線柱の型
    const phs = hash(P.a, P.b, 5), pcS = P.lv[0] >= 2 || phs < 0.55, vType = phs < 0.5 ? 1 : 0, truss = hash(P.a, P.b, 9) < 0.5, fence = detail >= 2 && hash(P.a, P.b, 13) < 0.75, catT = (hash(P.a, P.b, 17) * 3) | 0;
    for (let j = 0; j < n - 1; j++) {
      const v0 = vis(j), v1 = vis(j + 1);
      // トンネルの坑口：見える区間から地下へ入る所
      if (v0 !== v1) {
        const k = v0 ? j : j + 1, [tx, tz] = tan(k), w = P.lv[k] === 3 ? 21 : P.lv[k] === 2 ? 12 : 7.5, gy = ground(X(k), Z(k)), nx = -tz, nz = tx, sgn = v0 ? 1 : -1;
        const fx = X(k) + tx * sgn * 1.2, fz = Z(k) + tz * sgn * 1.2;
        // 坑口の壁（正面）と、暗い開口
        const wall = (o: number, lo: number, hi: number, col: number) => both([fx - nx * w / 2 - tx * sgn * o, lo, fz - nz * w / 2 - tz * sgn * o], [fx + nx * w / 2 - tx * sgn * o, lo, fz + nz * w / 2 - tz * sgn * o], [fx + nx * w / 2 - tx * sgn * o, hi, fz + nz * w / 2 - tz * sgn * o], [fx - nx * w / 2 - tx * sgn * o, hi, fz - nz * w / 2 - tz * sgn * o], col);
        wall(0, gy - 1, gy + 8.2, 0xa8a49b);
        both([fx - nx * (w / 2 - 1.4) - tx * sgn * 0.08, gy - 0.5, fz - nz * (w / 2 - 1.4) - tz * sgn * 0.08], [fx + nx * (w / 2 - 1.4) - tx * sgn * 0.08, gy - 0.5, fz + nz * (w / 2 - 1.4) - tz * sgn * 0.08], [fx + nx * (w / 2 - 1.4) - tx * sgn * 0.08, gy + 6.2, fz + nz * (w / 2 - 1.4) - tz * sgn * 0.08], [fx - nx * (w / 2 - 1.4) - tx * sgn * 0.08, gy + 6.2, fz - nz * (w / 2 - 1.4) - tz * sgn * 0.08], 0x1b1c1e);
        g.at(fx - tx * sgn * 3, gy, fz - tz * sgn * 3, Math.atan2(-tz, tx)); g.box(0, -1, 0, 6, 9.4, w + 1.2, 0x9c988f); g.at(0, 0, 0);
        continue;
      }
      if (!v0) continue;
      const [ax, az] = tan(j), [bx, bz] = tan(j + 1);
      const x0 = X(j), y0 = Y(j), z0 = Z(j), x1 = X(j + 1), y1 = Y(j + 1), z1 = Z(j + 1), seg = Math.hypot(x1 - x0, z1 - z0);
      const lv = P.lv[j], dbl = lv >= 2, quad4 = lv === 3, cut = P.cut[j] === 1, cr = !cut && (crossing(P.tile[j]) || crossing(P.tile[j + 1]));
      const g0 = ground(x0, z0), lift = y0 - g0, struct = lift > 2.2;
      // 曲線の帯（中心から o だけ横にずらした幅 w の帯）
      const band = (o: number, w: number, dy: number, col: number, sh = 1) => {
        const n0x = -az, n0z = ax, n1x = -bz, n1z = bx;
        up([x0 + n0x * (o - w / 2), y0 + dy, z0 + n0z * (o - w / 2)], [x1 + n1x * (o - w / 2), y1 + dy, z1 + n1z * (o - w / 2)], [x1 + n1x * (o + w / 2), y1 + dy, z1 + n1z * (o + w / 2)], [x0 + n0x * (o + w / 2), y0 + dy, z0 + n0z * (o + w / 2)], col, sh);
      };
      const side = (o: number, lo: number, hi: number, col: number) => {
        const n0x = -az, n0z = ax, n1x = -bz, n1z = bx;
        both([x0 + n0x * o, y0 + lo, z0 + n0z * o], [x1 + n1x * o, y1 + lo, z1 + n1z * o], [x1 + n1x * o, y1 + hi, z1 + n1z * o], [x0 + n0x * o, y0 + hi, z0 + n0z * o], col);
      };
      const half = quad4 ? 9.6 : dbl ? 5.2 : 3.0, offs = quad4 ? [-6.6, -2.2, 2.2, 6.6] : dbl ? [-2.2, 2.2] : [0];
      if (P.kind === 1) { // モノレール：1 本の太いコンクリートの桁（複線は 2 本）と、T 字の柱
        for (const o of dbl ? [-2.4, 2.4] : [0]) { band(o, 0.9, 0.02, 0xc9c6bf); side(o - 0.45, -1.8, 0.02, 0xbdbab3); side(o + 0.45, -1.8, 0.02, 0xbdbab3); band(o, 0.9, -1.8, 0x8f8c86); }
        pierAcc += seg;
        if (pierAcc >= 22) { pierAcc = 0; const gy = ground(x0, z0); g.at(x0, gy, z0, Math.atan2(-az, ax)); g.cyl(0, 0, 0, 0.75, Math.max(0.5, y0 - 1.8 - 1.2 - gy), 0xb9b6af, 10); g.box(0, y0 - 1.8 - 1.2 - gy, 0, 1.4, 1.2, dbl ? 6.6 : 1.6, 0xb9b6af); g.at(0, 0, 0); }
        continue;
      }
      if (P.kind === 2) { // 新交通：コンクリートの床と低い壁の溝、中央の案内レール、細い柱
        const w2 = dbl ? 8.4 : 4.6;
        band(0, w2, 0.05, 0xbab7b0); band(0, w2, -1.4, 0x8f8c86); side(-w2 / 2, -1.4, 1.0, 0xcac7c0); side(w2 / 2, -1.4, 1.0, 0xcac7c0);
        for (const o of dbl ? [-2.1, 2.1] : [0]) { band(o, 0.22, 0.25, 0x6f767d); band(o - 0.85, 0.5, 0.1, 0x9b968c); band(o + 0.85, 0.5, 0.1, 0x9b968c); }
        pierAcc += seg;
        if (pierAcc >= 24) { pierAcc = 0; const gy = ground(x0, z0); g.at(x0, gy, z0, Math.atan2(-az, ax)); g.box(0, 0, 0, 1.3, Math.max(0.5, y0 - 1.4 - gy), 1.3, 0xb3b0a9); g.box(0, y0 - 2.4 - gy, 0, 1.6, 1.0, w2 - 0.6, 0xb3b0a9); g.at(0, 0, 0); }
        continue;
      }
      // 2 本の線の間の帯（内側 oA・外側 oB、それぞれ高さ dy。前後の点で違ってよい）。法面・バラストの肩に使う
      const strip = (oA0: number, yA0: number, oB0: number, yB0: number, oA1: number, yA1: number, oB1: number, yB1: number, col: number, sh = 1) => {
        const n0x = -az, n0z = ax, n1x = -bz, n1z = bx;
        up([x0 + n0x * oA0, y0 + yA0, z0 + n0z * oA0], [x1 + n1x * oA1, y1 + yA1, z1 + n1z * oA1], [x1 + n1x * oB1, y1 + yB1, z1 + n1z * oB1], [x0 + n0x * oB0, y0 + yB0, z0 + n0z * oB0], col, sh);
      };
      const curv = Math.abs(ax * bz - az * bx) / Math.max(0.5, seg); let wood = false; // v88：曲がり具合（1/半径）と、橋まくらぎ（鋼の橋）
      const rot = Math.atan2(-az, ax), jh = hash(j, P.a, 3), bal = 0x8c877e, span = spanOf(paths.indexOf(P), P.d[j]);
      if (struct) {
        // 高架橋・鉄橋：桁（床と側面）と防音壁
        const steel = P.off[j] < 3 && [-5, 0, 5].some(q => !!m.water[P.tile[Math.max(0, Math.min(n - 1, j + q))]]); wood = steel; // 鋼の桁は川を渡る低い橋だけ（v76：高架へ上がる坂まで鋼の色になり、分岐で色が食い違っていた）
        band(0, half * 2 + 1.6, -0.05, steel ? 0x7e858c : 0xb3b1aa);
        if (!span && !(steel && truss)) for (const o of [-(half + 0.8), half + 0.8]) { // 防音壁：分岐では、相手の線路の上にかかる所は立てない（桁の側面だけ残す）
          const mx = (x0 + x1) / 2 - (az + bz) / 2 * o, mz = (z0 + z1) / 2 + (ax + bx) / 2 * o, cov = onOther(P, mx, mz);
          side(o, -1.9, cov ? -0.05 : 1.3, steel ? 0x6f767d : 0xbab7b0); }
        band(0, half * 2 + 1.6, -1.9, 0x8f8c86);
        if (detail >= 1 && !steel) band(0, half * 2 - 0.4, 0.2, bal, 0.94 + jh * 0.1); // 高架の上もバラスト
        // v86：鋼の下路トラス（川を渡る線の半分）：両側に上弦材と、交互の斜材・垂直材
        if (steel && truss && detail >= 1) { const tw = half + 0.7, n0x = -az, n0z = ax, n1x = -bz, n1z = bx, TH = 6.2;
          for (const sg of [-1, 1]) { const o = sg * tw; side(o, -0.4, 0.5, 0x5f6c78); side(o, TH - 0.45, TH, 0x5f6c78);
            const up2 = j % 2 === 0, A: V3 = [x0 + n0x * o, y0 + (up2 ? 0.3 : TH - 0.3), z0 + n0z * o], B: V3 = [x1 + n1x * o, y1 + (up2 ? TH - 0.3 : 0.3), z1 + n1z * o];
            both([A[0], A[1] - 0.18, A[2]], [B[0], B[1] - 0.18, B[2]], [B[0], B[1] + 0.18, B[2]], [A[0], A[1] + 0.18, A[2]], 0x5f6c78);
            if (up2) { g.at(x0 + n0x * o, y0, z0 + n0z * o, rot); g.box(0, 0, 0, 0.3, TH, 0.3, 0x5f6c78); g.at(0, 0, 0); } }
          if (j % 2 === 0) { g.at(x0, y0 + TH - 0.3, z0, rot); g.box(0, 0, 0, 0.25, 0.25, tw * 2, 0x5f6c78); g.at(0, 0, 0); } } // 上の横つなぎ
        pierAcc += seg;
        const frame = vType === 1 && !steel && lift < 14, gap = frame ? 12 : 24;
        if (pierAcc >= gap) {
          pierAcc = 0;
          const gy = ground(x0, z0), tl = P.tile[j];
          if (s.road[tl] && !(m.water[tl])) {
            // 道路の上は門の形の橋脚（道路をまたぐ）
            for (const o of [-(half + 5), half + 5]) { g.at(x0 - az * o, gy, z0 + ax * o, rot); g.box(0, 0, 0, 1.6, y0 - 1.9 - gy, 1.6, 0xa9a69f); }
            g.at(x0, y0 - 3.2, z0, rot); g.box(0, 0, 0, 1.8, 1.4, half * 2 + 12, 0xa9a69f);
          } else if (frame) { // ラーメン高架橋：2 本の柱と、上の梁・下の地中梁（柱の間から向こうが見える）
            g.at(x0, Math.min(gy, y0 - 2), z0, rot); const hh = Math.max(0.5, y0 - 1.9 - Math.min(gy, y0 - 2));
            for (const sg of [-1, 1]) g.box(0, 0, sg * (half - 0.9), 1.0, hh, 1.0, 0xaeaba3);
            g.box(0, hh - 1.0, 0, 1.2, 1.0, half * 2 + 0.4, 0xa9a69f);
          } else { g.at(x0, Math.min(gy, y0 - 2), z0, rot); g.box(0, 0, 0, 2.2, Math.max(0.5, y0 - 1.9 - Math.min(gy, y0 - 2)), half * 2 - 1, steel ? 0x8a8f94 : 0xa9a69f); }
          g.at(0, 0, 0);
        }
      } else if (cut) {
        // 掘割：コンクリートの擁壁を地面まで立て、上に柵
        const gy = ground(x0, z0), wallTop = Math.max(0.6, gy - y0 + 1.1);
        side(-(half + 1.4), -0.4, wallTop, 0xb3b0a8); side(half + 1.4, -0.4, wallTop, 0xb3b0a8);
        side(-(half + 1.45), wallTop, wallTop + 1.2, 0x6f767d); side(half + 1.45, wallTop, wallTop + 1.2, 0x6f767d);
        band(0, half * 2 + 2.6, 0.08, 0x8f8a80); band(0, half * 2 - 0.6, 0.2, bal, 0.94 + jh * 0.1);
      } else if (!cr) {
        // v86：築堤は斜めの法面（高い所は草、低い所は砂利）。前は地面まで垂直の壁だった
        if (!s.road[P.tile[j]]) { const l0 = Math.max(0, y0 - g0), l1 = Math.max(0, y1 - ground(x1, z1)), col = l0 + l1 > 1.6 ? 0x6e8650 : 0x86806f;
          if (detail >= 1) for (const sg of [-1, 1]) strip(sg * (half + 1.1), 0.1, sg * (half + 1.5 + 1.5 * l0), -l0 - 0.5, sg * (half + 1.1), 0.1, sg * (half + 1.5 + 1.5 * l1), -l1 - 0.5, col, sg > 0 ? 0.9 : 1);
          else { side(-(half + 1.1), -3, 0.1, 0x86806f); side(half + 1.1, -3, 0.1, 0x86806f); } }
        band(0, half * 2 + 2.2, 0.1, 0x8f8a80);   // 路盤
        // バラスト：上面（区切りごとに色むら）と肩の斜面、レールの間は錆で茶色っぽい
        band(0, half * 2 - 0.6, 0.3, bal, 0.93 + jh * 0.12); if (detail >= 1 && !span) band(-(half + 0.5), 0.44, 0.26, 0xb6b2a8); // v88：ケーブルトラフ（片側）
        if (detail >= 1) { for (const sg of [-1, 1]) strip(sg * (half - 0.3), 0.3, sg * (half + 0.85), 0.1, sg * (half - 0.3), 0.3, sg * (half + 0.85), 0.1, bal, 0.88);
          for (const o of offs) band(o, 1.3, 0.305, 0x86786a, 0.95 + jh * 0.08); }
        // 線路沿いの柵（町の中の線の多く）：分岐で相手の線路にかかる所と駅は立てない
        if (fence && !s.road[P.tile[j]] && !span) for (const o of [-(half + 2.3), half + 2.3]) { const mx = (x0 + x1) / 2 - (az + bz) / 2 * o, mz = (z0 + z1) / 2 + (ax + bx) / 2 * o; if (!onOther(P, mx, mz)) { side(o, 0.1, 1.4, 0x7f8a84); if (j % 2 === 0) { g.at(x0 - az * o, y0, z0 + ax * o, rot); g.box(0, 0, 0, 0.1, 1.55, 0.1, 0x5d6660); g.at(0, 0, 0); } } }
      }
      if (cr) band(0, half * 2 + 2, 0.16, 0x45474b); // 踏切の中は道路の舗装
      // レールと枕木。踏切の中は道路の舗装の上に、レールの間を板（ゴムの踏板）で埋める
      for (const o of offs) {
        if (cr) band(o, 3.6, 0.28, 0x6a6862);
        for (const r of [-0.535, 0.535]) { /* v87：軌間 1,067mm（在来線の狭軌。前は 1.44m で標準軌の幅だった） */ band(o + r, 0.18, 0.45, cr ? 0x3c3a37 : 0x5b4c40); if (detail >= 1) band(o + r, 0.065, 0.457, 0xc2c6c9);
          if (detail >= 2 && !cr) { side(o + r + Math.sign(r) * 0.09, 0.34, 0.45, 0x4e4238); band(o + r, 0.3, 0.348, 0x3e3833); } // v88：レールの腹（外側）と底（締結装置の列を兼ねる暗い帯）
          if (detail >= 1 && !cr && ((struct && wood) || curv > 1 / 260)) band(o + r - Math.sign(r) * 0.24, 0.08, 0.43, 0x6a5a4c); } // v88：脱線防止ガード（鋼の橋・急曲線のレールの内側）
        // レールの側面は錆色、頭は車輪で磨かれて光る
        if (!cr) { const ns = detail >= 2 ? 4 : 2, hwS = detail >= 2 ? 0.11 : 0.2;
          for (let q = 0; q < ns; q++) { const t = (q + 0.5) / ns;
            const sx = x0 + (x1 - x0) * t, sz = z0 + (z1 - z0) * t, sy = y0 + (y1 - y0) * t, nx = -(az + bz) / 2, nz = (ax + bx) / 2, tx2 = (ax + bx) / 2 * hwS, tz2 = (az + bz) / 2 * hwS, sc = 0.9 + hash(j * 4 + q, P.b, 7) * 0.16;
            up([sx + nx * (o - 1.25) - tx2, sy + 0.34, sz + nz * (o - 1.25) - tz2], [sx + nx * (o - 1.25) + tx2, sy + 0.34, sz + nz * (o - 1.25) + tz2], [sx + nx * (o + 1.25) + tx2, sy + 0.34, sz + nz * (o + 1.25) + tz2], [sx + nx * (o + 1.25) - tx2, sy + 0.34, sz + nz * (o + 1.25) - tz2], wood ? 0x47392c : pcS ? 0xa29f98 : 0x5e4b3b, sc);
          } }
      }
      // 架線（v76）：線路ごとに、トロリ線（下）と、ちょう架線（上、柱の間でたるむ）。駅のホームの中にも通す
      if (detail >= 2 && (!cut || lift > -3) && !cr) { const fo = half + (struct ? 0.4 : 1.4) + 0.3, n0x = -az, n0z = ax, n1x = -bz, n1z = bx; both([x0 + n0x * fo, y0 + 6.5, z0 + n0z * fo], [x1 + n1x * fo, y1 + 6.5, z1 + n1z * fo], [x1 + n1x * fo, y1 + 6.56, z1 + n1z * fo], [x0 + n0x * fo, y0 + 6.56, z0 + n0z * fo], 0x2a2c2f); } // v88：き電線（架線柱の外側）
      if (!cut || lift > -3) for (const o of offs) { const sag = (q: number) => 6.75 - 0.75 * Math.sin(Math.PI * Math.min(1, q / 36)), s0 = sag(poleAcc), s1 = sag(poleAcc + seg);
        band(o, 0.07, 5.55, 0x2e3033);
        if (detail >= 2 && j % 2 === 0 && s0 > 5.75) { const n0x = -az, n0z = ax, hx = x0 + n0x * o, hz = z0 + n0z * o; both([hx - ax * 0.02, y0 + 5.56, hz - az * 0.02], [hx + ax * 0.02, y0 + 5.56, hz + az * 0.02], [hx + ax * 0.02, y0 + s0, hz + az * 0.02], [hx - ax * 0.02, y0 + s0, hz - az * 0.02], 0x45484c); } // v88：ハンガー（ちょう架線からトロリ線をつる）
        { const n0x = -az, n0z = ax, n1x = -bz, n1z = bx; both([x0 + n0x * o, y0 + s0, z0 + n0z * o], [x1 + n1x * o, y1 + s1, z1 + n1z * o], [x1 + n1x * o, y1 + s1 + 0.06, z1 + n1z * o], [x0 + n0x * o, y0 + s0 + 0.06, z0 + n0z * o], 0x3a3d40); } }
      // 架線柱（約 36m おき）。v86：線ごとに型を変える。0 鋼管の柱と腕・1 コンクリート柱と 2 段の腕（トラス風）・2 複線をまたぐ門型のトラスビーム（高品質）
      poleAcc += seg;
      if (poleAcc >= 36 && !cr && !span) {
        poleAcc = 0;
        const po = half + (struct ? 0.4 : 1.4), px = x0 - az * po, pz = z0 + ax * po, top = y0 + 6.8, py = y0 + (struct ? 0 : 0.1);
        if (catT === 2 && dbl && detail >= 2) { // 門型：両側の柱と、上下の弦材と縦の格子
          g.at(x0, py, z0, rot);
          for (const sg of [-1, 1]) g.box(0, 0, sg * po, 0.32, 7.7, 0.32, 0x8b9094);
          for (const hy of [6.85, 7.55]) g.box(0, hy, 0, 0.2, 0.16, po * 2, 0x8b9094);
          for (let zz = -po + 0.8; zz < po - 0.5; zz += 1.0) g.box(0, 6.95, zz, 0.07, 0.62, 0.07, 0x8b9094);
          for (const o of offs) g.box(0, 6.25, o, 0.1, 0.6, 0.1, 0x3a3d40); // つり下げ
          g.at(0, 0, 0);
        } else {
          g.at(px, py, pz); if (catT === 1) g.cyl(0, 0, 0, 0.22, 7.2, 0xbcb9b1, 6); else g.cyl(0, 0, 0, 0.16, 6.9, 0x8b9094, 5); g.at(0, 0, 0);
          const ex = x0 + az * (half - 0.6), ez = z0 - ax * (half - 0.6);
          both([px, top, pz], [ex, top, ez], [ex, top + 0.25, ez], [px, top + 0.25, pz], 0x7d8287);
          if (catT === 1 && detail >= 1) { both([px, top - 0.9, pz], [ex, top - 0.9, ez], [ex, top - 0.75, ez], [px, top - 0.75, pz], 0x7d8287); const mx = (px + ex) / 2, mz = (pz + ez) / 2; both([px, top - 0.8, pz], [mx, top + 0.1, mz], [mx, top + 0.2, mz], [px, top - 0.7, pz], 0x7d8287); }
          if (detail >= 1) for (const o of offs) { g.at(x0 - az * o, top - 0.75, z0 + ax * o); g.box(0, 0, 0, 0.1, 0.75, 0.1, 0x3a3d40); g.at(0, 0, 0); } // がいしと、つり下げ
        }
        if ((++poleN) % 2 === 0) { g.at(px, y0, pz); g.box(az * -0.5, 4.6, ax * 0.5, 0.35, 0.18, 0.35, 0xe9e9e4); g.at(0, 0, 0); lamps.push(px - az * 0.5, y0 + 4.5, pz + ax * 0.5); } // 線路沿いの灯（2 本に 1 本）
      }
      // v86：信号機（約 320m おき、線路の左側の柱に黒い灯器と 3 つの灯）・キロポスト（100m おきの白い杭、500m ごとに数字の板）・勾配標（勾配が変わる所）
      sigAcc += seg; kmAcc += seg;
      if (detail >= 1 && !cr && !span && !P.kind) {
        if (sigAcc >= 320) { sigAcc = 0; const so = -(half + (struct ? 0.5 : 1.6)), sx = x0 - az * so, sz = z0 + ax * so;
          g.at(sx, y0 + 0.1, sz, rot); g.cyl(0, 0, 0, 0.09, 4.6, 0x6f757b, 5); g.box(0, 3.6, 0, 0.06, 1.7, 0.95, 0x1d1e20); g.box(-0.12, 3.75, 0, 0.3, 1.35, 0.5, 0x262729);
          for (let k = 0; k < 3; k++) g.box(-0.29, 3.88 + k * 0.4, 0, 0.04, 0.26, 0.26, [0x1f9a78, 0xa88a2a, 0xa8302a][k]);
          g.at(0, 0, 0); for (const o of offs) { g.at(x0 - az * o, y0 + 0.34, z0 + ax * o, rot); g.box(0, 0, 0, 0.6, 0.1, 0.32, 0xe0b828); g.at(0, 0, 0); } } // v88：ATS 地上子（レールの間の黄色い箱）
        if (kmAcc >= 100) { kmAcc = 0; kmN++; const ko = half + (struct ? 0.5 : 1.9), kx = x0 - az * ko, kz = z0 + ax * ko;
          g.at(kx, y0 + 0.1, kz, rot); g.box(0, 0, 0, 0.14, kmN % 5 === 0 ? 1.1 : 0.6, 0.14, 0xf2f2ee); g.at(0, 0, 0);
          if (curv > 1 / 500 && kmN % 2 === 1) { g.at(x0 + az * ko, y0 + 0.1, z0 - ax * ko, rot); g.box(0, 0, 0, 0.1, 1.6, 0.1, 0xf2f2ee); g.box(0, 1.25, 0, 0.05, 0.5, 0.42, 0x2a2a2a); g.box(-0.03, 1.31, 0, 0.02, 0.38, 0.34, 0xf2f2ee); g.box(-0.04, 1.42, 0, 0.02, 0.1, 0.24, 0x2a2a2a); g.at(0, 0, 0); } // v88：曲線標・速度制限標（曲線の外側の白い板）
          if (kmN % 5 === 0 && kit) face(kit, RK.kilo, kx + az * 0.08, y0 + 0.95, kz - ax * 0.08, az, -ax, 0.34, 0.42);
          // 勾配標：前後 30m の勾配の向きが違えば、白い柱に 2 本の腕（上り・下り・水平）
          if (kmN % 2 === 0 && j > 10 && j < n - 11) { const sb = (Y(j) - Y(j - 10)) / 30, sf = (Y(j + 10) - Y(j)) / 30, gx = x0 - az * (ko + 0.5), gz = z0 + ax * (ko + 0.5);
            if (Math.abs(sb - sf) > 0.004 || Math.abs(sf) > 0.006) { g.at(gx, y0 + 0.1, gz); g.box(0, 0, 0, 0.12, 1.3, 0.12, 0xf2f2ee); g.at(0, 0, 0);
              for (const [sg, sl] of [[1, sf], [-1, sb]] as const) { const dy = Math.max(-0.25, Math.min(0.25, sl * 40)) * sg, ex2 = gx + ax * sg * 0.5, ez2 = gz + az * sg * 0.5; both([gx, y0 + 1.25, gz], [ex2, y0 + 1.25 + dy, ez2], [ex2, y0 + 1.36 + dy, ez2], [gx, y0 + 1.36, gz], 0xf2f2ee); } } }
        }
      }
    }
  }
  // v86：分岐器（転てつ機の箱と標識）と、行き止まりの線路の端の車止め（赤い鋼の枠と白い板、砂利の山）
  if (detail >= 1) for (const es of junc.values()) {
    if (es.length === 1) { const e = es[0], P = e.P, n2 = P.p.length / 3, j0 = Math.hypot(P.p[0] - e.x, P.p[2] - e.z) < 0.5 ? 0 : n2 - 1, yy = P.p[j0 * 3 + 1], lv = P.lv[j0];
      if (P.off[j0] < -1.2) continue;
      for (const o of lv === 3 ? [-6.6, -2.2, 2.2, 6.6] : lv >= 2 ? [-2.2, 2.2] : [0]) { const bx = e.x - e.dz * o + e.dx * 1.2, bz = e.z + e.dx * o + e.dz * 1.2;
        g.at(bx, yy + 0.3, bz, Math.atan2(-e.dz, e.dx)); g.box(0, 0, 0, 0.5, 1.0, 2.0, 0xc8342c); g.box(0.28, 0.45, 0, 0.08, 0.45, 1.7, 0xf2f2ee); g.box(-1.0, -0.2, 0, 1.6, 0.5, 2.4, 0x9b968c); g.at(0, 0, 0); } }
    else { const e = es[0], yy = e.P.p[(Math.hypot(e.P.p[0] - e.x, e.P.p[2] - e.z) < 0.5 ? 0 : e.P.p.length / 3 - 1) * 3 + 1], q = e.half + 0.9, px = e.x - e.dz * q + e.dx * 5, pz = e.z + e.dx * q + e.dz * 5;
      if (yy < ground(e.x, e.z) - 1.2) continue;
      g.at(px, yy + 0.3, pz, Math.atan2(-e.dz, e.dx)); g.box(0, 0, 0, 1.3, 0.45, 0.6, 0x6f7378, 0xd9b23a); g.cyl(1.2, 0, 0, 0.04, 1.1, 0x9aa0a6, 4); g.box(1.2, 1.1, 0, 0.05, 0.3, 0.3, 0xf2f2ee); g.at(0, 0, 0); }
  }
  // 踏切：道路と地上の線路が交わる区画ごとに、遮断機（上がった竿）と警報機（×印と赤い灯）を道路の両側に
  for (let i = 0; i < s.rail!.length; i++) {
    if (!s.rail![i] || !crossing(i)) continue;
    const x = i % W, y = (i / W) | 0, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE;
    const ew = (x > 0 && s.road[i - 1]) || (x < W - 1 && s.road[i + 1]), ns = (y > 0 && s.road[i - W]) || (y < H - 1 && s.road[i + W]);
    // 道路の向き（rx, rz）と、それに直交する向き（道路の幅の方向）
    const [rx, rz] = ew && !ns ? [1, 0] : !ew && ns ? [0, 1] : [1, 0];
    const wx = -rz, wz = rx, hw = s.road[i] >= 2 ? 7 : 4.6, dl = s.rail![i] === 3 ? 12.5 : s.rail![i] === 2 ? 8 : 5.5;
    for (const sg of [-1, 1]) {
      const px = cx + rx * sg * dl + wx * sg * (hw + 1.1), pz = cz + rz * sg * dl + wz * sg * (hw + 1.1), py = heightAt(m, px, pz);
      g.at(px, py, pz);
      for (let b = 0; b < 6; b++) g.cyl(0, b * 0.6, 0, 0.13, 0.6, b % 2 ? 0x1d1d1d : 0xf2c230, 6); // 黄と黒の柱
      g.box(0, 3.4, 0, 0.5, 0.45, 0.5, 0x2a2a2a); // 灯の箱
      g.at(0, 0, 0);
      // 赤い灯（v86：両面に 2 つずつ、ひさしつき）と、下に進行方向の指示器、上に警報のスピーカー
      for (const f of [-1, 1]) for (const o of [-0.45, 0.45]) { g.at(px + rx * f * 0.3 + wx * o, py + 3.15, pz + rz * f * 0.3 + wz * o); g.box(0, 0, 0, 0.36, 0.36, 0.36, 0xd6322a); if (detail >= 1) g.box(rx * f * 0.12, 0.36, rz * f * 0.12, rx ? 0.22 : 0.4, 0.06, rz ? 0.22 : 0.4, 0x1d1d1d); g.at(0, 0, 0); }
      if (detail >= 1) { g.at(px, py, pz); g.box(0, 2.55, 0, rx ? 0.5 : 0.7, 0.3, rz ? 0.5 : 0.7, 0x1d1d1d); g.box(0, 2.62, 0, rx ? 0.52 : 0.4, 0.14, rz ? 0.52 : 0.4, 0xf2f2ee); g.cyl(0, 5.0, 0, 0.16, 0.3, 0x2a2a2a, 6); g.at(0, 0, 0); }
      // ×印（踏切警標）：黒いふちの上に黄色
      const cy = py + 4.3;
      for (const k of [1, -1]) { both([px + wx * (-0.9), cy - 0.58 * k - 0.15, pz + wz * (-0.9)], [px + wx * 0.9, cy + 0.58 * k - 0.15, pz + wz * 0.9], [px + wx * 0.9, cy + 0.58 * k + 0.15, pz + wz * 0.9], [px + wx * (-0.9), cy - 0.58 * k + 0.15, pz + wz * (-0.9)], 0x1d1d1d);
        for (const f of [-1, 1]) both([px + wx * (-0.85) + rx * f * 0.02, cy - 0.55 * k - 0.1, pz + wz * (-0.85) + rz * f * 0.02], [px + wx * 0.85 + rx * f * 0.02, cy + 0.55 * k - 0.1, pz + wz * 0.85 + rz * f * 0.02], [px + wx * 0.85 + rx * f * 0.02, cy + 0.55 * k + 0.1, pz + wz * 0.85 + rz * f * 0.02], [px + wx * (-0.85) + rx * f * 0.02, cy - 0.55 * k + 0.1, pz + wz * (-0.85) + rz * f * 0.02], 0xf2c230); }
      // 路面：踏切の手前の停止線（近づく車線の側）と、踏切の中の黄色い外側線。手前の道ばたに「踏切あり」の標識。線路沿いの短い柵
      if (detail >= 1) { const rw = s.road[i] === 3 ? 7.5 : s.road[i] === 2 ? 5 : 2.5, hy = (q: number, r2: number) => heightAt(m, cx + rx * r2 + wx * q, cz + rz * r2 + wz * q) + 0.17;
        const flatQ = (r0: number, r1: number, q0: number, q1: number, col: number) => { const P = (r2: number, q: number): V3 => [cx + rx * r2 + wx * q, hy(q, r2), cz + rz * r2 + wz * q]; up(P(r0, q0), P(r1, q0), P(r1, q1), P(r0, q1), col); };
        flatQ(sg * (dl + 2.2), sg * (dl + 2.65), 0, sg * (rw - 0.6), 0xeeeeea);
        for (const q of [-(rw - 0.35), rw - 0.35]) flatQ(sg * (dl + 2.2), -sg * (dl + 2.2), q - 0.08, q + 0.08, 0xf0bc2c);
        if (kit) { const qx = cx + rx * sg * (dl + 13) + wx * sg * (rw + 2.0), qz = cz + rz * sg * (dl + 13) + wz * sg * (rw + 2.0), qy = heightAt(m, qx, qz); g.at(qx, qy, qz); g.cyl(0, 0, 0, 0.05, 2.6, 0x9aa0a6, 5); g.at(0, 0, 0); face(kit, RK.sRail, qx + rx * sg * 0.03, qy + 2.2, qz + rz * sg * 0.03, rx * sg, rz * sg, 0.95, 0.95); }
        for (const f of [-1, 1]) { const fq = sg * (rw + 2.8), r0 = f * (dl - 0.8); g.at(cx + rx * r0 + wx * (fq + sg * 3), py, cz + rz * r0 + wz * (fq + sg * 3)); g.box(0, 0, 0, rx ? 0.08 : 6, 1.2, rz ? 0.08 : 6, 0x7f8a84); g.at(0, 0, 0); } }
      // 遮断機の台。竿は画面側で、列車が近づくと下ろす
      const bx = px - wx * sg * 0.5, bz = pz - wz * sg * 0.5;
      g.at(bx, py, bz); g.box(0, 0, 0, 0.55, 1.15, 0.5, 0x3a3c3e, 0xf2c230); g.at(0, 0, 0); // 遮断機（黒い箱、上は黄色）
      gates.push({ x: bx, y: py + 1.0, z: bz, dx: -wx * sg, dz: -wz * sg, len: hw + 0.4, tile: i });
    }
  }
  // 駅：線路に沿ったホーム（複線は両側、単線は駅の側）・屋根・駅舎・跨線橋（地上の駅）・階段の塔（高架の駅）。地下の駅は地上の出入口だけ
  for (const a of anchors) {
    const P = paths[a.k], b = a.b, n = P.d.length, dC = P.d[a.j];
    const X = (j: number) => P.p[j * 3], Y = (j: number) => P.p[j * 3 + 1], Z = (j: number) => P.p[j * 3 + 2];
    const tan = (j: number): [number, number] => { const p = Math.max(0, j - 1), q = Math.min(n - 1, j + 1), dx = X(q) - X(p), dz = Z(q) - Z(p), L = Math.hypot(dx, dz) || 1; return [dx / L, dz / L]; };
    const lx = (b.x + b.w / 2) * TILE, lz = (b.y + b.h / 2) * TILE, ly = heightAt(m, lx, lz);
    const [tx, tz] = tan(a.j), rot = Math.atan2(-tz, tx), nx = -tz, nz = tx;
    if (a.under) {
      // 地下の駅：敷地に出入口の建物と広場
      g.at(lx, ly, lz, rot); g.box(0, -0.6, 0, 40, 0.75, 22, 0xc8c3b8, 0xd2cdc2); g.box(0, 0, 0, 12, 4.2, 7, 0xe9e5dc, 0x5a6672); g.box(0, 4.2, 0, 13, 0.35, 8, 0x2f6fb5); g.box(0, 0, 3.6, 5, 3, 0.2, 0x1b1c1e); g.at(0, 0, 0);
      spots.push({ id: b.id, pts: [], d: dC, path: a.k });
      continue;
    }
    const dbl = P.lv[a.j] >= 2, sides = dbl ? [-1, 1] : [a.side], po = P.lv[a.j] === 3 ? 6.6 + 0.72 + 0.45 + 2.0 : dbl ? 2.2 + 0.72 + 0.45 + 2.0 : 0.72 + 0.45 + 2.0, pw = 4.0, ph = 1.1;
    const pts: number[] = [];
    for (let j = 0; j < n - 1; j++) {
      if (Math.abs(P.d[j] - dC) > 50 || Math.abs(P.d[j + 1] - dC) > 50) continue;
      const [ax, az] = tan(j), [bx2, bz2] = tan(j + 1), x0 = X(j), y0 = Y(j), z0 = Z(j), x1 = X(j + 1), y1 = Y(j + 1), z1 = Z(j + 1);
      for (const sd of sides) {
        const o0 = sd * po, w2 = pw / 2;
        const A = (o: number, dy: number, which: 0 | 1): [number, number, number] => which ? [x1 - bz2 * o, y1 + dy, z1 + bx2 * o] : [x0 - az * o, y0 + dy, z0 + ax * o];
        // ホームの床（上面）と側面、白線（黄色の点字ブロック）
        up(A(o0 - w2, ph, 0), A(o0 - w2, ph, 1), A(o0 + w2, ph, 1), A(o0 + w2, ph, 0), 0xbdb8ad);
        up(A(o0 - w2 * sd + 0.5 * sd, ph + 0.02, 0), A(o0 - w2 * sd + 0.5 * sd, ph + 0.02, 1), A(o0 - w2 * sd + 0.8 * sd, ph + 0.02, 1), A(o0 - w2 * sd + 0.8 * sd, ph + 0.02, 0), 0xf2c230);
        for (const e of [-w2, w2]) both(A(o0 + e, -2.2, 0) as any, A(o0 + e, -2.2, 1) as any, A(o0 + e, ph, 1) as any, A(o0 + e, ph, 0) as any, 0xa9a49a);
        // v77：むき出しだったホームに、屋根（中央 88m、縁の厚みつき）・柱・背面の柵と壁・ベンチ・駅名標・自動販売機・端の柵を足す
        const dd = P.d[j] - dC, ad = Math.abs(dd), back = o0 + w2 * sd, lr = Math.atan2(-az, ax);
        if (ad < 44) { const ra = o0 - w2 - 0.5, rb = o0 + w2 + 0.5;
          up(A(ra, 4.95, 0), A(ra, 4.95, 1), A(rb, 4.95, 1), A(rb, 4.95, 0), 0x5f6b77);
          both(A(ra, 4.6, 0) as any, A(ra, 4.6, 1) as any, A(rb, 4.6, 1) as any, A(rb, 4.6, 0) as any, 0xd9dcde);                        // 屋根の裏（明るい天井）
          for (const e of [ra, rb]) both(A(e, 4.55, 0) as any, A(e, 4.55, 1) as any, A(e, 4.97, 1) as any, A(e, 4.97, 0) as any, 0x4c5762); // 屋根の縁
          if (j % 3 === 0) { const [px, py, pz] = A(o0 + w2 * sd * 0.45, ph, 0); g.at(px, py, pz, lr); g.cyl(0, 0, 0, 0.13, 3.5, 0x8b9094, 6); g.box(0, 3.3, 0, 0.18, 0.22, pw + 0.6, 0x8b9094); g.at(0, 0, 0); lamps.push(px, py + 3.3, pz); } // 柱と梁、蛍光灯
        }
        // 背面：柵（全長）。屋根の下の中央は腰から上も壁（広告や時刻表のある壁）
        both(A(back, ph, 0) as any, A(back, ph, 1) as any, A(back, ph + 1.2, 1) as any, A(back, ph + 1.2, 0) as any, 0xdedcd5);
        if (ad < 26) both(A(back, ph + 1.2, 0) as any, A(back, ph + 1.2, 1) as any, A(back, ph + 3.0, 1) as any, A(back, ph + 3.0, 0) as any, j % 6 < 2 ? 0x9fc3d6 : 0xe9e7e0);
        const put = (o: number, f: () => void) => { const [px, py, pz] = A(o, ph, 0); g.at(px, py, pz, lr); f(); g.at(0, 0, 0); };
        const jc = Math.round(dd / 3); // 中心から何コマ目か（約 3m おき）
        if (jc % 5 === 2 && ad < 38) put(back - sd * 0.75, () => { g.box(0, 0.38, 0, 1.9, 0.08, 0.5, 0x3a6ea5); g.box(0, 0.46, sd * 0.22, 1.9, 0.5, 0.06, 0x3a6ea5); for (const u of [-0.8, 0.8]) g.box(u, 0, 0, 0.08, 0.38, 0.45, 0x70767c); }); // ベンチ
        if (jc === 0 || jc === 9 || jc === -9) put(back - sd * 0.35, () => { for (const u of [-1.0, 1.0]) g.cyl(u, 0, 0, 0.05, 2.3, 0x70767c, 5); g.box(0, 1.35, 0, 2.5, 0.95, 0.08, 0xf6f6f2); g.box(0, 1.35, -sd * 0.05, 2.5, 0.16, 0.02, 0x2f8f57); g.box(0, 1.75, -sd * 0.05, 1.2, 0.3, 0.02, 0x2b2f33); }); // 駅名標（白い板・緑の帯・駅名の黒い文字の帯）
        if (jc === 4) put(back - sd * 0.5, () => { g.box(0, 0, 0, 1.05, 1.85, 0.7, 0xf0f0ee); g.box(0, 0.75, -sd * 0.36, 0.95, 1.0, 0.02, 0xc8362e); });   // 自動販売機
        if (jc === -5) put(back - sd * 0.45, () => { g.box(0, 0, 0, 0.55, 0.95, 0.5, 0x8d9499); g.box(0.6, 0, 0, 0.55, 0.95, 0.5, 0x4d7fb0); });         // ごみ箱・リサイクル箱
        if (ad > 46.5 && ad < 50) { const e = dd > 0 ? 1 : 0; both(A(o0 - w2, ph, e) as any, A(o0 + w2, ph, e) as any, A(o0 + w2, ph + 1.2, e) as any, A(o0 - w2, ph + 1.2, e) as any, 0xdedcd5); both(A(o0 - w2, -2.2, e) as any, A(o0 + w2, -2.2, e) as any, A(o0 + w2, ph, e) as any, A(o0 - w2, ph, e) as any, 0xa9a49a); } // ホームの端の柵と、端の壁
        if (detail >= 1) up(A(o0 - w2 * sd, ph + 0.015, 0), A(o0 - w2 * sd, ph + 0.015, 1), A(o0 - w2 * sd + 0.3 * sd, ph + 0.015, 1), A(o0 - w2 * sd + 0.3 * sd, ph + 0.015, 0), 0xe4e0d4); // v86：ホームの縁石（線路側の白いふち）
        // v88：発車標（屋根からつるす黒い箱に橙の表示）・時計・停止位置目標（4 両の先頭が止まる所）・大きな駅のホームドア（腰の高さの柵と、乗り口のすき間）
        if (detail >= 1 && ad < 44 && (jc === 2 || jc === -2)) put(o0 - w2 * sd * 0.1, () => { g.box(0, 3.55, 0, 0.18, 0.5, 2.2, 0x1e2022); g.box(sd * 0.1, 3.62, 0, 0.02, 0.34, 2.0, 0xe89a32); for (const u of [-0.8, 0.8]) g.box(0, 4.05, u, 0.04, 0.55, 0.04, 0x70767c); });
        if (detail >= 1 && ad < 44 && jc === 6) put(o0 + w2 * sd * 0.45, () => { g.box(0, 3.4, 0, 0.12, 0.5, 0.5, 0xf2f2ee); g.box(0, 3.45, 0, 0.14, 0.4, 0.4, 0x2a2a2a); g.box(0, 3.9, 0, 0.04, 0.6, 0.04, 0x70767c); });
        if (detail >= 1 && (jc === 13 || jc === -13)) put(o0 - w2 * sd + 0.25 * sd, () => { g.box(0, 0, 0, 0.06, 1.3, 0.06, 0x70767c); g.box(0, 1.15, 0, 0.04, 0.42, 0.42, 0xf2f2ee); g.box(0.03, 1.2, 0, 0.02, 0.3, 0.3, 0xe0662a); });
        if (detail >= 1 && b.w * b.h >= 9 && ad < 41) { const e = o0 - w2 * sd + 0.45 * sd, L = (t: number, dy: number) => { const p = A(e, dy, 0), q = A(e, dy, 1); return [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]; };
          both(L(0, ph), L(0.62, ph), L(0.62, ph + 1.25), L(0, ph + 1.25), 0xd4d9de); both(L(0, ph + 1.25), L(0.62, ph + 1.25), L(0.62, ph + 1.35), L(0, ph + 1.35), 0x2f6fb5); }
        // 乗客の立ち位置（ホームの中ほど）
        if (Math.abs(P.d[j] - dC) < 40) for (const u of [-0.9, 0.2, 1.1]) { const [px, py, pz] = A(o0 + u * sd * 0.9, ph, 0); pts.push(px + (Math.random() - 0.5) * 2, py, pz + (Math.random() - 0.5) * 2); }
      }
    }
    const spot: StationSpot = { id: b.id, pts, d: dC, path: a.k }; spots.push(spot);
    const ty = Y(a.j), elevated = ty - heightAt(m, X(a.j), Z(a.j)) > 3;
    // 駅舎：駅の側のホームの外、線路と同じ向き
    // 駅舎は駅の敷地に寄せる（ホームから 9〜30m 離し、線路に沿っては ±30m まで）
    const along = Math.max(-30, Math.min(30, (lx - X(a.j)) * tx + (lz - Z(a.j)) * tz)), across = Math.max(po + 9, Math.min(po + 30, ((lx - X(a.j)) * nx + (lz - Z(a.j)) * nz) * a.side));
    const sx = X(a.j) + tx * along + nx * a.side * across, sz = Z(a.j) + tz * along + nz * a.side * across, sy = heightAt(m, sx, sz);
    g.at(sx, sy, sz, rot);
    g.box(0, -0.6, a.side * 9, 48, 0.75, 16, 0xc8c3b8, 0xd2cdc2); // 駅前広場
    const lv0 = Math.max(1, Math.min(3, b.lv ?? 1));
    if (RAIL_LM.station && !elevated && lv0 === 1) spot.bld = { x: sx, y: sy, z: sz, rot: rot + (a.side < 0 ? Math.PI : 0) }; // 駅舎の正面は駅前広場の側
    else {
      g.box(0, 0, 0, 22, elevated ? ty - sy + 1 : 6.5, 10, 0xe9e5dc, 0x8f9496);
      g.box(0, elevated ? ty - sy + 1 : 6.5, 0, 23, 0.4, 11, 0x5a6672);
      g.box(0, 0, a.side * 5.6, 9, 3.2, 1.4, 0x5a6672); // 入口のひさし
    }
    g.box(-13, 2.5, a.side * 12, 7, 0.14, 2.4, 0x9fb3bd); for (const u of [-16, -10]) g.cyl(u, 0, a.side * 12.8, 0.07, 2.5, 0x8b9094, 4); // バス停
    // 駅ビル（レベル 2）・大型ターミナル（レベル 3）：駅舎の後ろに高い建物
    const lv = Math.max(1, Math.min(3, b.lv ?? 1)), bz0 = -a.side * 2;
    if (lv >= 2) {
      const fl = lv === 2 ? 7 : 12, hh = fl * 3.8;
      g.box(0, 0, bz0, 40, hh, 16, 0xdfe3e6, 0x8f9496); g.box(0, hh, bz0, 40.4, 0.6, 16.4, 0x2f6fb5);
      for (let f = 1; f < fl; f++) { g.box(0, f * 3.8 + 1.0, bz0 + 8.05, 38, 1.6, 0.1, 0x7fa3bd); g.box(0, f * 3.8 + 1.0, bz0 - 8.05, 38, 1.6, 0.1, 0x7fa3bd); }
      g.box(0, 2.6, bz0 + 8.2, 30, 0.5, 2.2, 0xc3312b); // 商業の帯
      if (lv === 3) { const th = 22 * 3.6; g.box(-12, hh, bz0, 14, th - hh, 12, 0xcfd6dc, 0x6f7a84); for (let f = 0; f < 22; f += 2) g.box(-12, f * 3.6 + 1, bz0 + 6.05, 13, 1.4, 0.1, 0x6f93ad); g.box(14, hh, bz0, 10, 14, 10, 0xe9e5dc, 0x5a6672); }
    }
    g.at(0, 0, 0);
    // 新幹線：駅の反対側に高架のホームと、停まっている白い車両（整備中は高架だけ）
    if (b.shin !== undefined) {
      const open = s.month >= b.shin, off = (po + 16) * -a.side, L = 160, hy = Math.max(ty, heightAt(m, X(a.j), Z(a.j))) + 12;
      const cx = X(a.j) + nx * off, cz = Z(a.j) + nz * off;
      // 駅の外へ続く高架（地図の外まで。開業前は工事中の橋脚だけ）
      { const half = W * TILE * 1.3, LN: ShinLine = { cx, cz, tx, tz, hy, open, half }; SHIN_LINES.push(LN);
        // 桁は両端の高さをつないだ斜めの板（隣の桁と必ず同じ高さで接する）
        const slab = (z0: number, z1: number, ya: number, yb: number, lo: number, hi: number, col: number, top: number) => { const x0 = -10.05, x1 = 10.05;
          g.quad([x0, ya + hi, z1], [x1, yb + hi, z1], [x1, yb + hi, z0], [x0, ya + hi, z0], top);
          g.quad([x0, ya + lo, z1], [x1, yb + lo, z1], [x1, yb + hi, z1], [x0, ya + hi, z1], col);
          g.quad([x1, yb + lo, z0], [x0, ya + lo, z0], [x0, ya + hi, z0], [x1, yb + hi, z0], col, 0.82);
          g.quad([x0, ya + lo, z0], [x1, yb + lo, z0], [x1, yb + lo, z1], [x0, ya + lo, z1], col, 0.6); };
        const sgn = Math.abs(Math.cos(rot) * tx - Math.sin(rot) * tz - 1) < 0.01 ? 1 : -1; // 桁の +x が線の +u の向きか
        for (let u = -half; u <= half; u += 20) { if (Math.abs(u) < L / 2 + 10) continue; const px = cx + tx * u, pz = cz + tz * u, inside = px >= 0 && pz >= 0 && px < W * TILE && pz < H * TILE, gy = inside ? heightAt(m, px, pz) : 0, y = shinDeckY(m, LN, u);
          const ya = shinDeckY(m, LN, u - 10 * sgn), yb = shinDeckY(m, LN, u + 10 * sgn);
          g.at(px, 0, pz, rot);
          const tn = shinTunnel(m, LN, u);
          if (tn) { // 山に入る所：箱形の覆い（地面に埋まる。口では山から少し突き出して見える）
            slab(-6, 6, ya, yb, -0.4, 1.4, 0xb9b6ae, 0x8f8c86); g.box(0, y + 1.4, 5.7, 20.1, 7.2, 0.6, 0xb9b6ae); g.box(0, y + 1.4, -5.7, 20.1, 7.2, 0.6, 0xb9b6ae); g.box(0, y + 8.6, 0, 20.1, 0.7, 12, 0xb9b6ae, 0xa9a69e);
            for (const e of [-1, 1]) if (!shinTunnel(m, LN, u + 20 * e * sgn) && Math.abs(u + 20 * e * sgn) <= half) { // トンネルの口：太い枠と暗い奥
              const ex = e * 10.05; g.box(ex, y - 0.4, 6.3, 1.2, 10.4, 1.2, 0xa5a29a); g.box(ex, y - 0.4, -6.3, 1.2, 10.4, 1.2, 0xa5a29a); g.box(ex, y + 8.4, 0, 1.2, 1.6, 13.8, 0xa5a29a);
              g.box(ex - e * 1.4, y + 1.45, 0, 0.1, 7.1, 10.8, 0x14161a); }
            continue; }
          if (Math.round(u / 20) % 2 === 0) { g.box(0, gy - 1, 0, 2.6, y - gy + 1.05, 5.5, 0xc9c6bf); g.box(0, y - 1.1, 0, 3.2, 1.15, 9.5, 0xc9c6bf); }
          if (open || Math.round(u / 20) % 6 !== 0) { slab(-5.5, 5.5, ya, yb, 0, 1.4, 0xd6d3cb, 0xbdb8ad); slab(5.12, 5.48, ya, yb, 1.4, 3.1, 0xe4e2dc, 0xe4e2dc); slab(-5.48, -5.12, ya, yb, 1.4, 3.1, 0xe4e2dc, 0xe4e2dc); if (open && Math.round(u / 20) % 3 === 0) g.box(0, y + 1.4, 4.2, 0.3, 6.5, 0.3, 0x9aa0a6); } }
      }
      g.at(cx, 0, cz, rot);
      for (let u = -L / 2; u <= L / 2; u += 20) g.box(u, heightAt(m, cx + tx * u, cz + tz * u) - 1, 0, 2.4, hy - heightAt(m, cx + tx * u, cz + tz * u) + 1, 6, 0xc9c6bf);
      g.box(0, hy, 0, L + 40, 1.6, 14, 0xd6d3cb, 0xbdb8ad); g.box(0, hy + 1.6, -5.2, L, 1.1, 3.6, 0xbdb8ad); g.box(0, hy + 1.6, 5.2, L, 1.1, 3.6, 0xbdb8ad);
      g.box(0, hy + 7, 0, L * 0.7, 0.5, 16, 0xe6e8ea, 0x9fb3bd); // 大屋根
      // 開業後の列車は、走る列車（scene.ts の moveShin）として描く
      g.at(0, 0, 0);
    }
    // 跨線橋（地上の駅で、ホームが 2 面のとき）
    // 高架の駅：駅舎からホームへの連絡通路
    if (elevated) {
      const L = across - po - 2 - 5, mx = X(a.j) + tx * along + nx * a.side * (po + 2 + L / 2), mz = Z(a.j) + tz * along + nz * a.side * (po + 2 + L / 2);
      if (L > 1) { g.at(mx, ty - 1.5, mz, Math.atan2(-nz, nx)); g.box(0, 0, 0, L, 4.2, 5, 0xe4e2dc, 0x596672); g.at(0, 0, 0); }
    }
    if (!elevated && dbl) {
      const fx = X(a.j) + tx * along + nx * a.side * (across - 5), fz = Z(a.j) + tz * along + nz * a.side * (across - 5), bx3 = X(a.j) + tx * along - nx * a.side * (po + 1), bz3 = Z(a.j) + tz * along - nz * a.side * (po + 1), y = ty + 7.2;
      const L = Math.hypot(fx - bx3, fz - bz3);
      g.at((fx + bx3) / 2, y, (fz + bz3) / 2, Math.atan2(-(fz - bz3), fx - bx3)); g.box(0, 0, 0, L, 3.0, 3.6, 0xe4e2dc, 0x596672); g.at(0, 0, 0);
      for (const [qx, qz] of [[X(a.j) + tx * along - nx * a.side * po, Z(a.j) + tz * along - nz * a.side * po], [X(a.j) + tx * along + nx * a.side * po, Z(a.j) + tz * along + nz * a.side * po]]) { g.at(qx, ty + ph, qz, rot); g.box(0, 0, 0, 3.2, 6.2, 3.2, 0xe4e2dc); g.at(0, 0, 0); }
    }
  }
  return { gates, spots, lamps };
}

/** 線の上の距離 d の位置（x, y, z）と向き */
export function railAt(P: RailPath, d: number): [number, number, number, number] {
  const n = P.d.length; d = Math.max(0, Math.min(P.len, d));
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (P.d[mid] <= d) lo = mid; else hi = mid; }
  const t = (d - P.d[lo]) / ((P.d[hi] - P.d[lo]) || 1), p = P.p;
  const x = p[lo * 3] + (p[hi * 3] - p[lo * 3]) * t, y = p[lo * 3 + 1] + (p[hi * 3 + 1] - p[lo * 3 + 1]) * t, z = p[lo * 3 + 2] + (p[hi * 3 + 2] - p[lo * 3 + 2]) * t;
  return [x, y, z, Math.atan2(p[hi * 3] - p[lo * 3], p[hi * 3 + 2] - p[lo * 3 + 2])];
}
