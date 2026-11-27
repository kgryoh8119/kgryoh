// v104a：建物の入口へ入る通路（アプローチ）と、歩く人の足元の面の判定（純粋な関数。描画・歩く人・テストで同じ答え）。
// 道路の区画（30m）の中で、車道と歩道（路側帯）の外は草地。v103 までは、建物に入る人・出てくる人がこの草地を真横へ横切り、
// 駅前では着いた人が反対側の草地へ列になって入っていた。直線の区画の真ん中に、歩道の外の端から区画の境（敷地の入口）まで舗装した通路を作り、
// 人はそこだけを通って出入りする。入口の無い側には入らない（反対側の入口へは、生活道路なら道を渡り、二車線以上なら入らずに着いたことにする）。
import { walkW, CORNER_R } from './roadbase';
import type { PathEnv } from './farpath';

/** 通路の中心の、区画の中心からの道に沿った位置（m）。歩く人は進む向きに FRONT_U だけ進んでから入る（区画の中心の電柱を避ける） */
export const FRONT_U = 1.2;
/** 通路の幅（m）。店・駅など人の多い入口（door 1）は広く */
export const frontW = (door: number) => (door === 1 ? 4 : 3);
/** 区画の向き (dx, dy) のビット（1 東・2 西・4 南・8 北） */
export const sideBit = (dx: number, dy: number) => (dx > 0 ? 1 : dx < 0 ? 2 : dy > 0 ? 4 : 8);
/** 直線の区画（東西か南北のどちらか 1 本だけがつながる区画）の両側で、建物のある敷地へ入る通路。返り値：区画 → 側のビット（と入口の種類 door を 4 ビットずつ） */
export function frontagePlan(road: ArrayLike<number>, W: number, H: number, door: (i: number) => number): Map<number, number> {
  const out = new Map<number, number>(), at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? road[y * W + x] : 0);
  for (let i = 0; i < W * H; i++) {
    if (!road[i] || road[i] === 3) continue;
    const x = i % W, y = (i / W) | 0, e = !!at(x + 1, y), w = !!at(x - 1, y), s = !!at(x, y + 1), n = !!at(x, y - 1);
    const ew = (e || w) && !s && !n, ns = (s || n) && !e && !w; if (!ew && !ns) continue;
    let v = 0;
    for (const [dx, dy] of ew ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (road[j]) continue;
      const d = door(j) & 15, b = sideBit(dx, dy); if (d) v |= b | (d << (4 + 4 * Math.log2(b))); }
    if (v & 15) out.set(i, v);
  }
  return out;
}
/** frontagePlan の値から、その側の入口の種類（0 は通路なし） */
export const frontDoor = (v: number | undefined, bit: number) => (v && v & bit ? (v >> (4 + 4 * Math.log2(bit))) & 15 : 0);

/** 足元の面：0 草地（道路の区画の歩道の外）、1 車道、2 歩道・路側帯、3 入口の通路、4 道路でない区画（敷地・公園など。描く物の側で決まる）。
 *  e：道の形（farpath の roadGeom）、road：等級、front：frontagePlan。歩道の帯は roadbase.ts の縁石の線と歩道の外の端と同じ決め方 */
export function surfaceAt(e: PathEnv, road: ArrayLike<number>, H: number, x: number, z: number, front?: Map<number, number>): number {
  const T = e.TILE, W = e.W, tx = Math.floor(x / T), ty = Math.floor(z / T);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 4;
  const i = ty * W + tx; if (!road[i]) return 4;
  const lx = x - (tx + 0.5) * T, lz = z - (ty + 0.5) * T, X = Math.abs(lx), Z = Math.abs(lz), R = CORNER_R;
  const aE = e.armHW(i, 1, 0), aW = e.armHW(i, -1, 0), aS = e.armHW(i, 0, 1), aN = e.armHW(i, 0, -1), hw = e.midHW(i);
  const n = (aE ? 1 : 0) + (aW ? 1 : 0) + (aS ? 1 : 0) + (aN ? 1 : 0), junc = n >= 3;
  if (e.bend(i)) { const kx = (aE ? 1 : -1) * 15, kz = (aS ? 1 : -1) * 15, A = Math.min(aE || aW, aS || aN), r = Math.abs(Math.hypot(lx - kx, lz - kz) - 15); return r < A ? 1 : r <= A + walkW(A) + 0.05 ? 2 : 0; }
  // 入口の通路
  const fv = front?.get(i);
  if (fv) { const ew = !!(aE || aW); for (const bit of [1, 2, 4, 8]) { const d = frontDoor(fv, bit); if (!d) continue; const sg = bit === 1 || bit === 4 ? 1 : -1, ok = ew ? (bit >= 4 && Math.sign(lz) === sg && X <= frontW(d) / 2 + 0.05) : (bit < 4 && Math.sign(lx) === sg && Z <= frontW(d) / 2 + 0.05);
    if (ok && (ew ? Z : X) >= hw + walkW(hw) - 0.05) return 3; } }
  const a = lx >= 0 ? aE : aW, b = lz >= 0 ? aS : aN, midV = junc ? Math.max(aE, aW) : hw, midU = junc ? Math.max(aS, aN) : hw;
  if (!a && !b) { const lim = hw + walkW(hw); return X < hw && Z < hw ? 1 : X <= lim + 0.05 && Z <= lim + 0.05 ? 2 : 0; }
  if (junc && X < midU && Z < midV) return 1;
  if (a && b) {
    const wa = walkW(a), wb = walkW(b);
    if (X < b + R && Z < a + R && X > b && Z > a) { const d = Math.hypot(X - b - R, Z - a - R); return d > R ? 1 : d >= R - Math.max(wa, wb) - 0.05 ? 2 : 0; }
    if (Z < a || X < b) return 1;
    return (X >= b + R && Z <= a + wa + 0.05) || (Z >= a + R && X <= b + wb + 0.05) ? 2 : 0;
  }
  if (a) { const c = a + (midV - a) * (1 - X / 15), w = walkW(a) + (walkW(midV) - walkW(a)) * (1 - X / 15); return Z < c ? 1 : Z <= c + w + 0.05 ? 2 : 0; }
  const c = b + (midU - b) * (1 - Z / 15), w = walkW(b) + (walkW(midU) - walkW(b)) * (1 - Z / 15); return X < c ? 1 : X <= c + w + 0.05 ? 2 : 0;
}
