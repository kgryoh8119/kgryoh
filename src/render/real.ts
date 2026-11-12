// 実在都市版の描画部品：標高から作る地形、実際の道路・鉄道・川の線、取り込んだ建物の位置に建つ家並み。
import * as THREE from 'three';
import { Geo } from './geo';
import { tree, type Ctx } from './models';
import { REAL, RF, W, H, TILE, getMap, heightAt, hash, idx, onMapChange } from '../sim/index';
import type { GameState, MapDef } from '../sim/index';

let N = 0;
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- 地形
export function realTerrain(m: MapDef, mat: THREE.Material): THREE.Mesh[] {
  const R = REAL!, MAPW = W * TILE, MAPH = H * TILE, STEP = R.dem.step; // 標高の格子に合わせる（建物の足元と地面がずれないように）
  const nx = Math.round(MAPW / STEP), nz = Math.round(MAPH / STEP);
  const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
  const c = new THREE.Color(), c2 = new THREE.Color();
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
    const x = i * STEP, z = j * STEP, y = heightAt(m, x, z), k = (j * (nx + 1) + i) * 3;
    pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
    const t = idx(Math.min(W - 1, Math.floor(x / TILE)), Math.min(H - 1, Math.floor(z / TILE))), f = R.flags[t];
    const n = hash(i >> 1, j >> 1, 91) * 0.5 + hash(i, j, 17) * 0.5;
    c.setHex(0x8f9a7c).lerp(c2.setHex(0x9ca586), n);                       // 住宅地のすき間（庭・空き地）
    if (f & RF.forest) c.setHex(0x3f6a3a).lerp(c2.setHex(0x4f7d45), n);
    else if (f & RF.park) c.setHex(0x6c9a52).lerp(c2.setHex(0x80ad5e), n);
    else if (f & RF.open) c.setHex(0x86a95c).lerp(c2.setHex(0x9db86c), n);
    else if (f & RF.blocked) c.setHex(0xa7a59c).lerp(c2.setHex(0xb2afa4), n);
    else if (f & RF.water && y < 0) c.setHex(0x6f8a7a).lerp(c2.setHex(0x7d9584), n); // 海・水面の底（上に水面を張る）
    else if (m.steep[t]) c.lerp(c2.setHex(0x5f8550), 0.55);                  // 急な斜面は緑が残る
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const ix: number[] = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; ix.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(ix); g.computeVertexNormals();
  const terrain = new THREE.Mesh(g, mat); terrain.receiveShadow = true;
  // 地図の外：縁の標高をそのまま外へ延ばした低い解像度の地面
  const outer = new Geo(), FAR = 7000, OS = 250;
  const hClamp = (x: number, z: number) => heightAt(m, Math.max(0, Math.min(MAPW, x)), Math.max(0, Math.min(MAPH, z))) - 0.3;
  // 区切りは地図の縁（0 と幅・奥行き）を必ず含める（縁をまたぐ四角形が地図の内側に重なって、線路や道路を覆わないように）
  const cuts = (L: number) => { const a: number[] = []; for (let v = -FAR; v < 0; v += OS) a.push(v); for (let v = 0; v < L; v += OS) a.push(v); for (let v = L; v <= L + FAR; v += OS) a.push(v); return a; };
  const xs = cuts(MAPW), zs = cuts(MAPH);
  for (let jz = 0; jz < zs.length - 1; jz++) for (let jx = 0; jx < xs.length - 1; jx++) {
    const x = xs[jx], z = zs[jz], x1 = xs[jx + 1], z1 = zs[jz + 1];
    if (x >= 0 && x1 <= MAPW && z >= 0 && z1 <= MAPH) continue;
    const d = Math.max(0, -x1, x - MAPW, -z1, z - MAPH), shade = 0.92 + 0.08 * hash(x, z, 3);
    const col2 = d > 600 ? 0x7f8f72 : 0x8c977a;
    outer.quad([x, hClamp(x, z1), z1], [x1, hClamp(x1, z1), z1], [x1, hClamp(x1, z), z], [x, hClamp(x, z), z], col2, shade);
  }
  const om = new THREE.Mesh(outer.build(), mat); om.receiveShadow = true;
  return [terrain, om];
}

// ---------------------------------------------------------------- 線（道路・鉄道・川）
/** 折れ線を地形に沿う帯にする。split は 1 区切りの最大長（m） */
function ribbon(g: Geo, m: MapDef, pts: Float32Array, width: number, lift: number, color: number, bridge: boolean, keep?: (x: number, z: number) => boolean, split = 10): void {
  const n = pts.length / 2;
  if (n < 2) return;
  const h0 = heightAt(m, pts[0], pts[1]), h1 = heightAt(m, pts[n * 2 - 2], pts[n * 2 - 1]);
  let total = 0; for (let i = 1; i < n; i++) total += Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1]);
  let run = 0;
  const yAt = (x: number, z: number, r: number) => (bridge ? Math.max(heightAt(m, x, z), h0 + (h1 - h0) * (total > 0 ? r / total : 0)) + 0.6 : heightAt(m, x, z)) + lift;
  for (let i = 1; i < n; i++) {
    const ax = pts[i * 2 - 2], az = pts[i * 2 - 1], bx = pts[i * 2], bz = pts[i * 2 + 1], L = Math.hypot(bx - ax, bz - az);
    if (L < 0.01) continue;
    const k = Math.max(1, Math.ceil(L / split)), nx = -(bz - az) / L * width / 2, nz = (bx - ax) / L * width / 2;
    for (let s = 0; s < k; s++) {
      const t0 = s / k, t1 = (s + 1) / k;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0, x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      if (keep && !keep((x0 + x1) / 2, (z0 + z1) / 2)) continue;
      const y0 = yAt(x0, z0, run + L * t0), y1 = yAt(x1, z1, run + L * t1);
      g.quad([x0 - nx, y0, z0 - nz], [x1 - nx, y1, z1 - nz], [x1 + nx, y1, z1 + nz], [x0 + nx, y0, z0 + nz], color);
    }
    run += L;
  }
}

/** 変わらない線：鉄道、川、自動車専用道路 */
export function realStatic(m: MapDef): { geo: Geo; water: Geo } {
  const R = REAL!, g = new Geo(), water = new Geo();
  for (const l of R.rails) { if (l.tunnel) continue; ribbon(g, m, l.pts, 6.5, 0.25, 0x8a857b, l.bridge, undefined, 12); ribbon(g, m, l.pts, 3.2, 0.45, 0x5d5953, l.bridge, undefined, 12); }
  for (const l of R.rivers) ribbon(water, m, l.pts, 10, -0.6, 0x3f7fa6, false, undefined, 12);
  for (const l of R.streams) ribbon(water, m, l.pts, 2.5, -0.3, 0x3f7fa6, false, undefined, 12);
  for (const l of R.roads) if (l.cls === 5) ribbon(g, m, l.pts, 13, 0.35, 0x45484d, l.bridge, undefined, 12);
  return { geo: g, water };
}

const ROAD_W = [3.5, 5.5, 7.5, 9.5, 11.5, 13];
const ROAD_C = [0x6a6a66, 0x45474b, 0x404246, 0x3c3e42, 0x393b3f, 0x45484d];
/** 道路：計算上の道路がなくなった区画の部分は描かない。新しく引いた道路は区画の形で別に描く */
export function realRoads(s: GameState, m: MapDef): { geo: Geo; lamps: number[] } {
  const R = REAL!, g = new Geo(), lamps: number[] = [];
  const tileAt = (x: number, z: number) => idx(Math.max(0, Math.min(W - 1, Math.floor(x / TILE))), Math.max(0, Math.min(H - 1, Math.floor(z / TILE))));
  // 計算上の道路を撤去した区画と、細い道（計算外）が市の施設の敷地を横切る所は描かない
  const facility = new Uint8Array(W * H);
  for (const b of s.buildings) if (!b.osm && b.kind !== 'station') for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) facility[idx(b.x + dx, b.y + dy)] = 1;
  const keep = (x: number, z: number) => { const t = tileAt(x, z); return m.fixedRoad![t] ? s.road[t] > 0 : !facility[t]; };
  for (const l of R.roads) {
    if (l.cls === 5) continue;
    ribbon(g, m, l.pts, ROAD_W[l.cls], 0.22 + l.cls * 0.01, ROAD_C[l.cls], l.bridge, keep);
    if (l.cls >= 3) ribbon(g, m, l.pts, 0.25, 0.3 + l.cls * 0.01, 0xd8d6cf, l.bridge, keep, 4); // 中央線
    // 街灯：生活道路以上に 40m おき
    if (l.cls >= 1) {
      let acc = hash(l.pts.length, l.cls, 9) * 40;
      for (let i = 1; i < l.pts.length / 2; i++) {
        const ax = l.pts[i * 2 - 2], az = l.pts[i * 2 - 1], bx = l.pts[i * 2], bz = l.pts[i * 2 + 1], L = Math.hypot(bx - ax, bz - az);
        while (acc < L) {
          const t = acc / L, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
          if (keep(x, z)) { const nx = -(bz - az) / L * (ROAD_W[l.cls] / 2 + 1), nz = (bx - ax) / L * (ROAD_W[l.cls] / 2 + 1); lamps.push(x + nx, heightAt(m, x, z) + 6, z + nz); }
          acc += 40;
        }
        acc -= L;
      }
    }
  }
  return { geo: g, lamps };
}

/** 車と人が動く道（描画用。計算とは別） */
export function realPaths(): { pts: Float32Array; len: number; cls: number }[] {
  return REAL!.roads.filter(l => l.cls >= 1 && l.cls <= 4).map(l => { let len = 0; for (let i = 1; i < l.pts.length / 2; i++) len += Math.hypot(l.pts[i * 2] - l.pts[i * 2 - 2], l.pts[i * 2 + 1] - l.pts[i * 2 - 1]); return { pts: l.pts, len, cls: l.cls }; }).filter(p => p.len > 20);
}

// ---------------------------------------------------------------- 建物
let bldTile: Int32Array | null = null, bldStart: Int32Array | null = null, bldOrder: Int32Array | null = null, bldRot: Float32Array | null = null;
const segCell = new Map<number, number[]>(), segs: number[] = []; // x0,z0,x1,z1,半幅
/** いちばん近い道路（端からの距離と向き） */
function roadNear(x: number, z: number): { d: number; ang: number } {
  let best = 1e9, ang = 0;
  const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) for (const k of segCell.get((cz + dz) * 10000 + cx + dx) ?? []) {
    const ax = segs[k * 5], az = segs[k * 5 + 1], bx = segs[k * 5 + 2], bz = segs[k * 5 + 3], vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / L2)), d = Math.hypot(ax + vx * u - x, az + vz * u - z) - segs[k * 5 + 4];
    if (d < best) { best = d; ang = Math.atan2(vx, vz); }
  }
  return { d: best, ang };
}
/** 建物の既定の大きさ（形のデータがないとき）。乱数は建物ごとに固定 */
function defaultSize(i: number, ty: number, lv: number): [number, number] {
  const r1 = hash(i, 3, 11), r2 = hash(i, 5, 13);
  if (ty === 1 || ty === 2 || ty === 9 && lv <= 2) return [6.5 + r1 * 2.5, 5.5 + r2 * 2];
  if (ty === 3) return [10 + r1 * 4, 8];
  if (ty === 4) return [16 + r1 * 10, 9 + r2 * 3];
  if (ty === 5) return [22 + r1 * 10, 14 + r2 * 6];
  if (ty === 6) return [34, 12];
  if (ty === 7) return [14 + r1 * 8, 12 + r2 * 4];
  if (ty === 8) return [4, 4];
  return [10, 9];
}
let bldW: Float32Array | null = null, bldD: Float32Array | null = null;
/** 建物を区画ごとに引けるようにし、大きさと向きを決める（一度だけ）。
 *  形のデータがあればそのまま使う。なければ近い道路に向きを合わせ、隣の建物と重ならない大きさに縮める */
function indexBuildings(): void {
  if (bldTile) return;
  const R = REAL!, n = R.bld.length / 3, S = R.bldShape;
  bldTile = new Int32Array(n); bldRot = new Float32Array(n); bldW = new Float32Array(n); bldD = new Float32Array(n);
  for (const l of R.roads) { if (l.cls === 5) continue; for (let i = 1; i < l.pts.length / 2; i++) { const k = segs.length / 5; segs.push(l.pts[i * 2 - 2], l.pts[i * 2 - 1], l.pts[i * 2], l.pts[i * 2 + 1], ROAD_W[l.cls] / 2); const cx = Math.floor((l.pts[i * 2 - 2] + l.pts[i * 2]) / 2 / TILE), cz = Math.floor((l.pts[i * 2 - 1] + l.pts[i * 2 + 1]) / 2 / TILE); const key = cz * 10000 + cx; let a = segCell.get(key); if (!a) segCell.set(key, (a = [])); a.push(k); } }
  // 近い建物を探すための 10m 格子
  const CELL = 10, grid = new Map<number, number[]>();
  for (let i = 0; i < n; i++) { const key = Math.floor(R.bld[i * 3 + 1] / 10 / CELL) * 100000 + Math.floor(R.bld[i * 3] / 10 / CELL); let a = grid.get(key); if (!a) grid.set(key, (a = [])); a.push(i); }
  for (let i = 0; i < n; i++) {
    const x = R.bld[i * 3] / 10, z = R.bld[i * 3 + 1] / 10, code = R.bld[i * 3 + 2], ty = code & 15, lv = code >> 4;
    const tx = Math.min(W - 1, Math.floor(x / TILE)), tz = Math.min(H - 1, Math.floor(z / TILE));
    let t = idx(tx, tz);
    if (R.road[t] || R.flags[t] & (RF.rail | RF.water)) {
      let bt = -1, bd = 1e9;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + dx, ny = tz + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const j = idx(nx, ny); if (R.road[j] || R.flags[j] & (RF.rail | RF.water)) continue; const d = Math.hypot((nx + 0.5) * TILE - x, (ny + 0.5) * TILE - z); if (d < bd) { bd = d; bt = j; } }
      t = bt;
    }
    bldTile[i] = t;
    if (S && S[i * 3] > 0) {
      bldW[i] = Math.max(2.5, S[i * 3] / 10); bldD[i] = Math.max(2.5, S[i * 3 + 1] / 10); bldRot[i] = -S[i * 3 + 2] * Math.PI / 180;
      continue;
    }
    const r = roadNear(x, z);
    bldRot[i] = r.d < 35 ? r.ang : hash(i, 1, 7) * Math.PI;
    let [w, d] = defaultSize(i, ty, lv);
    // いちばん近い建物までの距離を上限に縮める（密集した所で重ならないように）
    let nn = 1e9;
    const gx = Math.floor(x / CELL), gz = Math.floor(z / CELL);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) for (const j of grid.get((gz + dz) * 100000 + gx + dx) ?? []) { if (j === i) continue; const dd = Math.hypot(R.bld[j * 3] / 10 - x, R.bld[j * 3 + 1] / 10 - z); if (dd < nn) nn = dd; }
    // 道路にもはみ出さない
    if (r.d < 30) nn = Math.min(nn, (r.d + 1.5) * 2);
    const k = Math.min(1, (nn * 1.02) / Math.max(w, d));
    bldW[i] = Math.max(3.5, w * k); bldD[i] = Math.max(3.2, d * k);
  }
  const cnt = new Int32Array(N + 1);
  for (let i = 0; i < n; i++) if (bldTile[i] >= 0) cnt[bldTile[i] + 1]++;
  for (let i = 0; i < N; i++) cnt[i + 1] += cnt[i];
  bldStart = cnt; bldOrder = new Int32Array(n); const fill = cnt.slice();
  for (let i = 0; i < n; i++) if (bldTile[i] >= 0) bldOrder[fill[bldTile[i]]++] = i;
}

const WALLS = [0xf2efe6, 0xe9e2d0, 0xd9cfc0, 0xcfd6da, 0xe8ded2, 0xbfa98a, 0xf5f5f0, 0xc9b8a0, 0xdcd4c4, 0x9aa3a8];
const ROOFS = [0x3b3f46, 0x2f3a4a, 0x5a3a2e, 0x7a3b2e, 0x2f4a3f, 0x4a4a4a, 0x39424e, 0x6b4a3a];
/** 建物 1 棟（幅 w・奥行き d は地面での大きさ）。ty: 1-2 戸建て, 3-4 集合住宅, 5 工場, 6 学校, 7 店舗, 8 車庫, 9 その他 */
function drawOne(c: Ctx, m: MapDef, seed: number, x: number, z: number, ty: number, lv: number, rot: number, w: number, d: number, windows: boolean): void {
  const r1 = hash(seed, 3, 11), r2 = hash(seed, 5, 13), wall = WALLS[(r1 * WALLS.length) | 0], roof = ROOFS[(r2 * ROOFS.length) | 0];
  const cs = Math.cos(rot), sn = Math.sin(rot), hx = w / 2, hz = d / 2;
  const corner = (u: number, v: number) => heightAt(m, x + u * cs + v * sn, z - u * sn + v * cs);
  const hs = [corner(-hx, -hz), corner(hx, -hz), corner(-hx, hz), corner(hx, hz)];
  const base = Math.min(...hs), top = Math.max(...hs);
  const g = c.g; g.at(x, top, z, rot);
  if (top - base > 0.4) g.box(0, base - top, 0, w, top - base, d, 0xa8a49a); // 斜面の基礎
  const area = w * d;
  const house = (ty === 1 || ty === 2 || ty === 9 && lv <= 2) && area < 220;
  if (house) {                                               // 戸建て
    const h = (lv || 2) * 2.75;
    g.box(0, 0, 0, w, h, d, wall);
    if (r2 < 0.18) g.box(0, h, 0, w + 0.3, 0.3, d + 0.3, 0x8f9192); else g.gable(0, h, 0, w, d, Math.min(2.4, 1.3 + Math.min(w, d) * 0.12), roof, w >= d ? 'x' : 'z', wall, 0.4);
    if (windows) { const wa = c.rnd() < 0.45 ? c.wa : c.wb; wa.at(x, top, z, rot); wa.quad([-w / 4 - 0.8, 3.2, d / 2 + 0.05], [-w / 4 + 0.8, 3.2, d / 2 + 0.05], [-w / 4 + 0.8, 4.4, d / 2 + 0.05], [-w / 4 - 0.8, 4.4, d / 2 + 0.05], 0x8fa9b8); }
  } else if (ty === 3 || ty === 4 || ty === 2 || ty === 1) {     // 集合住宅（大きい「建物」も集合住宅として描く）
    const fl = lv || (ty === 4 ? (area > 900 ? 8 : 4) : area > 500 ? 4 : 3), h = fl * 2.9;
    const long = w >= d, L = long ? w : d, S2 = long ? d : w;
    g.box(0, 0, 0, w, h, d, [0xe6e1d6, 0xd8d2c4, 0xcdd3d6, 0xc4b6a2, 0xb7a999][(r1 * 5) | 0], 0x9a9c9c);
    if (S2 > 6) { if (long) g.box(0, 0, d / 2 + 0.5, w, h - 0.4, 1.0, 0xdedcd6); else g.box(w / 2 + 0.5, 0, 0, 1.0, h - 0.4, d, 0xdedcd6); } // バルコニー
    if (windows) for (let f = 0; f < Math.min(fl, 14); f++) {
      const wa = c.rnd() < 0.5 ? c.wa : c.wb, y0 = f * 2.9 + 0.9, y1 = y0 + 1.2; wa.at(x, top, z, rot);
      if (long) wa.quad([-w / 2 + 1, y0, d / 2 + 1.05], [w / 2 - 1, y0, d / 2 + 1.05], [w / 2 - 1, y1, d / 2 + 1.05], [-w / 2 + 1, y1, d / 2 + 1.05], 0x8fa9b8);
      else wa.quad([w / 2 + 1.05, y0, d / 2 - 1], [w / 2 + 1.05, y0, -d / 2 + 1], [w / 2 + 1.05, y1, -d / 2 + 1], [w / 2 + 1.05, y1, d / 2 - 1], 0x8fa9b8);
      void L;
    }
  } else if (ty === 5) g.box(0, 0, 0, w, Math.max(6, (lv || 2) * 4) + r2 * 3, d, 0xb9bcc0, 0x8f9496);      // 工場・倉庫
  else if (ty === 6) g.box(0, 0, 0, w, (lv || 4) * 3.4, d, 0xeeeae0, 0x9a9c9c);                               // 学校
  else if (ty === 7) g.box(0, 0, 0, w, (lv || 2) * 3.5, d, 0xd9d6cf, 0x8f9192);                               // 店舗・事務所
  else if (ty === 8) g.box(0, 0, 0, w, 2.4, d, 0xb8bcc0);                                                       // 車庫・物置
  else g.box(0, 0, 0, w, (lv || 2) * 3.2, d, wall, 0x8f9192);
}
/** 建物の地面の四隅が、避けるべき区画（市の施設・新しく引いた道路など）に入るか */
function hits(x: number, z: number, rot: number, w: number, d: number, avoid?: (t: number) => boolean): boolean {
  if (!avoid) return false;
  const cs = Math.cos(rot), sn = Math.sin(rot);
  for (const [u, v] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2], [0, 0]]) {
    const px = x + u * cs + v * sn, pz = z - u * sn + v * cs, tx = Math.floor(px / TILE), tz = Math.floor(pz / TILE);
    if (tx >= 0 && tz >= 0 && tx < W && tz < H && avoid(idx(tx, tz))) return true;
  }
  return false;
}
/** 区画にある実際の建物を描く。fill があれば、地図に建物の形が足りない住宅区画を推計の戸数ぶん補う。
 *  avoid の区画（市の施設など）にかかる建物は描かない。描いた棟数を返す */
export function drawRealTile(c: Ctx, m: MapDef, t: number, windows: boolean, fill?: { kind: string; units: number }, avoid?: (t: number) => boolean): number {
  indexBuildings();
  const R = REAL!, a = bldStart![t], b = bldStart![t + 1];
  let drawn = 0;
  for (let k = a; k < b; k++) {
    const i = bldOrder![k], code = R.bld[i * 3 + 2], x = R.bld[i * 3] / 10, z = R.bld[i * 3 + 1] / 10;
    if (hits(x, z, bldRot![i], bldW![i], bldD![i], avoid)) continue;
    drawOne(c, m, i, x, z, code & 15, code >> 4, bldRot![i], bldW![i], bldD![i], windows); drawn++;
  }
  if (fill && !R.bldShape) { // 形のデータがある地図は建物がそろっているので補わない
    const want = fill.kind === 'house' ? Math.min(4, Math.ceil(fill.units)) : fill.kind === 'apartment' ? Math.min(3, Math.ceil(fill.units / 14)) : Math.min(2, Math.ceil(fill.units / 40));
    const tx = t % W, tz = (t / W) | 0, sp = fill.kind === 'house' ? 10 : 15, nn = Math.round(TILE / sp);
    for (let j = 0; j < nn * nn && drawn < want; j++) {
      const q = (j * 5 + t) % (nn * nn), x = (tx + ((q % nn) + 0.5) / nn) * TILE + (hash(t, j, 41) - 0.5) * 1.5, z = (tz + (Math.floor(q / nn) + 0.5) / nn) * TILE + (hash(t, j, 42) - 0.5) * 1.5;
      const r = roadNear(x, z);
      if (r.d < (fill.kind === 'house' ? 4.5 : 8)) continue;
      const ty = fill.kind === 'house' ? 1 : fill.kind === 'apartment' ? 3 : 4, lv = fill.kind === 'house' ? 2 : fill.kind === 'apartment' ? 3 : 6 + ((hash(t, j, 43) * 6) | 0);
      const [w0, d0] = defaultSize(t * 16 + j, ty, lv), sz = Math.min(1, (sp * 0.85) / Math.max(w0, d0)), w = w0 * sz, d = d0 * sz;
      let clash = false;
      // 近くの区画の建物とも重ならないように（隣の区画まで見る）
      for (let dz = -1; dz <= 1 && !clash; dz++) for (let dx = -1; dx <= 1 && !clash; dx++) {
        const ux = tx + dx, uz = tz + dz; if (ux < 0 || uz < 0 || ux >= W || uz >= H) continue;
        const u = idx(ux, uz);
        for (let k = bldStart![u]; k < bldStart![u + 1] && !clash; k++) { const i = bldOrder![k]; if (Math.hypot(R.bld[i * 3] / 10 - x, R.bld[i * 3 + 1] / 10 - z) < (Math.max(w, d) + Math.max(bldW![i], bldD![i])) / 2 + 1) clash = true; }
      }
      if (clash || hits(x, z, r.ang, w, d, avoid)) continue;
      drawOne(c, m, t * 16 + j, x, z, ty, lv, r.d < 35 ? r.ang : 0, w, d, windows); drawn++;
    }
  }
  return drawn;
}

/** いちばん近い線路の点（線路の帯と同じ高さの計算）。150m 以内になければ null */
function railNear(m: MapDef, x: number, z: number): { x: number; z: number; ang: number; y: number } | null {
  let best: { x: number; z: number; ang: number; y: number } | null = null, bd = 150;
  for (const l of REAL!.rails) { if (l.tunnel) continue;
    const p = l.pts, n = p.length / 2;
    let total = 0; for (let i = 1; i < n; i++) total += Math.hypot(p[i * 2] - p[i * 2 - 2], p[i * 2 + 1] - p[i * 2 - 1]);
    const h0 = heightAt(m, p[0], p[1]), h1 = heightAt(m, p[n * 2 - 2], p[n * 2 - 1]);
    let run = 0;
    for (let i = 1; i < n; i++) {
      const ax = p[i * 2 - 2], az = p[i * 2 - 1], vx = p[i * 2] - ax, vz = p[i * 2 + 1] - az, L = Math.hypot(vx, vz);
      if (L < 0.01) continue;
      const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / (L * L))), px = ax + vx * u, pz = az + vz * u, d = Math.hypot(px - x, pz - z);
      if (d < bd) {
        bd = d;
        const y = l.bridge ? Math.max(heightAt(m, px, pz), h0 + (h1 - h0) * (total > 0 ? (run + L * u) / total : 0)) + 0.6 : heightAt(m, px, pz);
        best = { x: px, z: pz, ang: Math.atan2(vx, vz), y };
      }
      run += L;
    }
  }
  return best;
}
/** 実在都市版の駅：線路に沿ったホームと屋根、駅舎、駅前の広場。線路が近くになければ false（標準の形で描く） */
export function drawRealStation(c: Ctx, m: MapDef, b: { x: number; y: number; w: number; h: number }): boolean {
  const cx = (b.x + b.w / 2) * TILE, cz = (b.y + b.h / 2) * TILE, r = railNear(m, cx, cz);
  if (!r) return false;
  const g = c.g, rot = r.ang + Math.PI / 2; // 線路の向きを幅（x）方向に
  // ホーム 2 面（線路の両側）と屋根
  g.at(r.x, r.y + 0.3, r.z, rot);
  for (const side of [-1, 1]) {
    g.box(0, 0, side * 5.2, 110, 1.0, 3.6, 0xb9b4a9, 0xc9c4b8);
    for (let k = -25; k <= 25; k += 10) g.cyl(k, 1.0, side * 5.6, 0.12, 3.0, 0x8b9094, 5);
    g.box(0, 4.0, side * 5.0, 60, 0.25, 4.4, 0x6f7a86);
  }
  g.box(0, 6.5, 0, 14, 0.4, 14, 0x6f7a86); // 跨線橋の屋根
  // 駅舎（敷地の中心、線路と同じ向き）と広場
  const gy = heightAt(m, cx, cz);
  g.at(cx, gy, cz, rot);
  g.box(0, -0.6, 4, 40, 0.75, 22, 0xc8c3b8, 0xd2cdc2); // 駅前広場
  g.box(0, 0, 0, 18, 6.5, 11, 0xe9e5dc, 0x8f9496);
  g.box(0, 6.5, 0, 19, 0.4, 12, 0x5a6672);
  g.box(0, 0, 6.2, 8, 3.2, 1.6, 0x5a6672); // 入口のひさし
  for (const [u, v] of [[-14, 10], [14, 10]]) { g.box(u, 0.15, v, 0.3, 2.6, 0.3, 0x8b9094); }
  return true;
}

/** 取り込んだ施設の敷地を、地図にある実際の建物の形で描く（形のデータがある地図だけ）。描いた棟数を返す（0 なら標準の形で描く） */
export function drawRealLot(c: Ctx, m: MapDef, b: { x: number; y: number; w: number; h: number; kind: string }, windows: boolean): number {
  indexBuildings();
  const R = REAL!;
  if (!R.bldShape) return 0;
  let n = 0;
  const ground = b.kind === 'school' ? 0xc9b48e : b.kind === 'supermarket' || b.kind === 'shop' || b.kind === 'bakery' ? 0x55585d : 0xbdb6a6;
  for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) {
    const t = idx(b.x + dx, b.y + dy), x0 = (b.x + dx) * TILE, z0 = (b.y + dy) * TILE;
    const hs = [heightAt(m, x0, z0), heightAt(m, x0 + TILE, z0), heightAt(m, x0, z0 + TILE), heightAt(m, x0 + TILE, z0 + TILE)];
    c.g.at(x0 + TILE / 2, Math.max(...hs), z0 + TILE / 2); c.g.box(0, -1.5, 0, TILE - 0.4, 1.58, TILE - 0.4, 0x9a9488, ground); // 敷地（校庭・駐車場など）
    for (let k = bldStart![t]; k < bldStart![t + 1]; k++) {
      const i = bldOrder![k], code = R.bld[i * 3 + 2];
      drawOne(c, m, i, R.bld[i * 3] / 10, R.bld[i * 3 + 1] / 10, b.kind === 'school' ? 6 : (code & 15) === 1 || (code & 15) === 2 ? 7 : code & 15, code >> 4, bldRot![i], bldW![i], bldD![i], windows); n++;
    }
  }
  return n;
}
/** 実在都市版の店（形のデータがない地図）：店の規模に合った大きさの建物と駐車場。小型店（まいばすけっと など）は小さく */
export function drawRealStore(c: Ctx, m: MapDef, b: { x: number; y: number; w: number; h: number }, name: string, windows = true): void {
  const small = /まいばす|ミニ|mini|100|ローソンストア|ファミリーマート|セブン|ナチュラルローソン/i.test(name);
  const cx = (b.x + b.w / 2) * TILE, cz = (b.y + b.h / 2) * TILE, g = c.g;
  const hs = [heightAt(m, b.x * TILE, b.y * TILE), heightAt(m, (b.x + b.w) * TILE, b.y * TILE), heightAt(m, b.x * TILE, (b.y + b.h) * TILE), heightAt(m, (b.x + b.w) * TILE, (b.y + b.h) * TILE)];
  const top = Math.max(...hs);
  g.at(cx, top, cz);
  if (!small) g.box(0, -2, 0, b.w * TILE - 1, 2.05, b.h * TILE - 1, 0x9a9488, 0x55585d); // 敷地（駐車場）
  else {
    // 小型店：店の区画以外は、地図にある周りの建物をそのまま描く
    indexBuildings();
    const R = REAL!, sx0 = b.x * TILE, sz0 = b.y * TILE, sx1 = sx0 + TILE, sz1 = sz0 + TILE;
    g.box(-b.w * TILE / 4, -2, -b.h * TILE / 4, TILE - 1, 2.05, TILE - 1, 0x9a9488, 0xb9b4a9);
    for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) {
      const t = idx(b.x + dx, b.y + dy);
      for (let k = bldStart![t]; k < bldStart![t + 1]; k++) {
        const i = bldOrder![k], x = R.bld[i * 3] / 10, z = R.bld[i * 3 + 1] / 10, code = R.bld[i * 3 + 2];
        if (x + bldW![i] / 2 > sx0 && x - bldW![i] / 2 < sx1 && z + bldD![i] / 2 > sz0 && z - bldD![i] / 2 < sz1) continue;
        drawOne(c, m, i, x, z, code & 15, code >> 4, bldRot![i], bldW![i], bldD![i], windows);
      }
    }
    g.at(cx, top, cz);
  }
  const W2 = small ? 18 : 40, D2 = small ? 13 : 28, bx = small ? -b.w * TILE / 4 : 0, bz = small ? -b.h * TILE / 4 : -b.h * TILE / 2 + D2 / 2 + 2;
  g.box(bx, 0, bz, W2, small ? 4.2 : 6.5, D2, 0xeeeae2, 0xa7aaad);
  g.box(bx, (small ? 4.2 : 6.5) - 1.1, bz + D2 / 2 + 0.05, W2, 0.9, 0.12, small ? 0x2f8f4e : 0xd0392e); // 看板の帯
  g.box(bx, 0, bz + D2 / 2 + 1.2, small ? 6 : 12, 3, 2.4, 0xd8d4cb); // 入口
  if (!small) for (let k = 0; k < 14; k++) { const u = -b.w * TILE / 2 + 6 + (k % 7) * 7.5, v = 8 + Math.floor(k / 7) * 9; if (hash(b.x + k, b.y, 61) < 0.6) g.box(u, 0.05, v, 1.8, 1.4, 4.2, [0xf2f2f2, 0x25282c, 0xb8bcc0, 0xa8322d, 0x2c3e5c][k % 5]); }
}

/** 地図に建物が 1 棟も登録されていない空き区画のうち、細い道が通る市街地らしい所か（見た目だけ家並みを補う） */
export function looksBuiltUp(m: MapDef, t: number): boolean {
  indexBuildings();
  const R = REAL!, f = R.flags[t];
  if (bldStart![t + 1] > bldStart![t] || f & (RF.forest | RF.park | RF.open | RF.blocked | RF.water | RF.rail) || m.steep[t]) return false;
  const x = t % W, z = (t / W) | 0;
  return roadNear((x + 0.5) * TILE, (z + 0.5) * TILE).d < 14;
}
/** 計算に入らない区画の飾り（林・公園・畑） */
export function drawRealGround(c: Ctx, m: MapDef, t: number): void {
  const R = REAL!, f = R.flags[t], x = t % W, y = (t / W) | 0;
  if (f & RF.forest) {
    for (let k = 0; k < 2; k++) { const wx = (x + 0.2 + 0.6 * hash(x + k, y, 78)) * TILE, wz = (y + 0.2 + 0.6 * hash(x, y + k, 79)) * TILE; c.g.at(wx, heightAt(m, wx, wz) - 0.3, wz); tree(c, 0, 0, 1.5 + hash(x, y + k, 80) * 0.8, hash(x, y, k) < 0.35 ? 1 : 0); }
  } else if (f & RF.park) {
    if (hash(x, y, 81) < 0.6) { const wx = (x + 0.5) * TILE, wz = (y + 0.5) * TILE; c.g.at(wx, heightAt(m, wx, wz) - 0.2, wz); tree(c, 0, 0, 1 + hash(x, y, 82) * 0.4, hash(x, y, 83) < 0.2 ? 2 : 0); }
  }
  void smooth;
}

export const REAL_CHUNK = 16;

// 地図が変わったら、建物の索引を作り直す
onMapChange(() => { N = W * H; bldTile = bldStart = bldOrder = null; bldRot = bldW = bldD = null; segCell.clear(); segs.length = 0; });
