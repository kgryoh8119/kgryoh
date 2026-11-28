// v105b：バス停で待つ人。人数は sim の住民のバスの移動（src/sim/people.ts の busWaiting：いまバス停で待っている住民）から。
// 待合所（scene.ts のバス停の絵と同じ置き方）の前の歩道に、標識の柱から列で並ぶ。バスが止まると乗って列が空になり、だんだん戻る。
// 止まったバスからは、そのバス停で降りる人（busFlowHour の 1 時間の降りる人 × 運行間隔）が歩道へ歩き出す。
// 描画の時計（4 分で 1 日）では運行間隔（12〜20 分）が数秒になるので、列の空き・戻りは画面のバス（住民のバス・路線バス）が止まったときに合わせる。
import { walkW } from './roadbase';
import { busWaiting, busFlowHour, busHeadway } from '../sim/people';
import type { GameState } from '../sim/index';

const HW = [0, 2.5, 5, 7.5], TILE = 30;
/** バス停の待合所の置き方（scene.ts の「バス停：歩道に屋根つきの待合所と標識」と同じ決まり）。交差点の区画は置かない（null） */
export interface StopGeo { tile: number; x: number; z: number; rot: number; hw: number; cw: number }
export function stopGeo(road: ArrayLike<number>, W: number, H: number, tile: number, wide: (i: number) => boolean): StopGeo | null {
  const x = tile % W, y = (tile / W) | 0, t = road[tile]; if (!t) return null;
  const R = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && !!road[yy * W + xx];
  const deg = (xx: number, yy: number) => (R(xx + 1, yy) ? 1 : 0) + (R(xx - 1, yy) ? 1 : 0) + (R(xx, yy + 1) ? 1 : 0) + (R(xx, yy - 1) ? 1 : 0);
  if (deg(x, y) >= 3) return null;
  const ew = R(x + 1, y) || R(x - 1, y), [ux, uz] = ew ? [1, 0] : [0, 1];
  const jA = R(x + ux, y + uz) && deg(x + ux, y + uz) >= 3, jB = R(x - ux, y - uz) && deg(x - ux, y - uz) >= 3, shift = jA && !jB ? -5 : jB && !jA ? 5 : 0;
  const tw = t === 2 && wide(tile) ? 3 : t, hw = HW[tw] + walkW(HW[tw]) * 0.5;
  return { tile, x: (x + 0.5) * TILE + ux * shift, z: (y + 0.5) * TILE + uz * shift, rot: ew ? 0 : Math.PI / 2, hw, cw: HW[tw] };
}
/** 待合所のまわりの局所の座標（lx：道に沿う向き。標識の柱が +1.5、待合所が −3〜−6。lz：道の中心からの距離）を世界の座標へ */
const toW = (g: StopGeo, lx: number, lz: number): [number, number] => { const c = Math.cos(g.rot), s = Math.sin(g.rot); return [g.x + lx * c + lz * s, g.z - lx * s + lz * c]; };
/** k 番目に並ぶ人の位置と向き（標識の柱の手前から、待合所の前を通って列が伸びる。16 人目からは 2 列目） */
export function queueSpot(g: StopGeo, k: number): [number, number, number] {
  const row = Math.floor(k / 16), j = k % 16, lx = 0.9 - j * 0.68, lz = g.hw - 0.15 + row * 0.62 + ((k * 37) % 7 - 3) * 0.02;
  const [x, z] = toW(g, lx, lz), c = Math.cos(g.rot), s = Math.sin(g.rot);
  return [x, z, Math.atan2(c, -s) + ((k * 13) % 5 - 2) * 0.12]; // 柱の方（+lx）を向く
}
/** バスの乗り口の前（歩道の縁、柱の横） */
export function doorSpot(g: StopGeo): [number, number] { return toW(g, 1.2, g.cw + 0.5); }

/** バス停ごとの列の状態（いまの描く人数の割合・乗った時刻・降りる人） */
export class BusQueues {
  private fill = new Map<number, number>(); private last = new Map<number, number>(); private shown = new Map<number, number>();
  /** 画面のバスがバス停 tile に止まった（t は描画の時計の秒）。同じバス停で 4 秒以内の 2 回目は数えない */
  dwell(tile: number, t: number): void { const l = this.last.get(tile); if (l !== undefined && t - l < 4) return; this.last.set(tile, t); this.fill.set(tile, 0); }
  /**
   * 描く人の一覧：[x, z, 向き, 歩きの位相を進めるか(0/1)] の並び。wait：住民の待ち人数（バス停ごと）。
   * 列：待ち人数 × 戻りの割合（止まってから 6 秒でもとに戻る）。乗る人：止まってから 1.5 秒、列の人が乗り口へ歩いて消える。降りる人：止まってから 5 秒、乗り口から歩道を離れていく
   */
  spots(s: GameState, hour: number, holiday: boolean, t: number, dt: number, geo: (tile: number) => StopGeo | null): { pts: number[]; wait: number; drawn: number } {
    const pts: number[] = []; let wait = 0, drawn = 0;
    if (holiday || !(s.busStops ?? []).length) return { pts, wait, drawn };
    const W0 = busWaiting(s, hour), fl = busFlowHour(s, hour), hwy = busHeadway(hour);
    for (const tile of s.busStops ?? []) {
      const g = geo(tile); if (!g) continue;
      const n = W0.get(tile) ?? 0; wait += n;
      const f = Math.min(1, (this.fill.get(tile) ?? 1) + dt / 6); this.fill.set(tile, f);
      const q = Math.round(n * f), since = t - (this.last.get(tile) ?? -99);
      for (let k = 0; k < q; k++) { const [x, z, yw] = queueSpot(g, k); pts.push(x, z, yw, 0); }
      drawn += q;
      // 乗る：止まる前に並んでいた人（shown）が、乗り口へ歩いて消える
      if (since < 1.5) { const [dx, dz] = doorSpot(g), m = this.shown.get(tile) ?? 0, u = since / 1.5;
        for (let k = Math.floor(m * u); k < m; k++) { const [x, z] = queueSpot(g, k), v = Math.min(1, u * (1 + k * 0.08)); pts.push(x + (dx - x) * v, z + (dz - z) * v, Math.atan2(dx - x, dz - z), 1); drawn++; } }
      else this.shown.set(tile, q);
      // 降りる：そのバス停で降りる人（1 時間の降りる人 × 運行間隔 = バス 1 台の分。15 人まで）
      if (since < 5) { const a = Math.min(15, Math.round((fl.get(tile)?.alight ?? 0) * hwy)), [dx, dz] = doorSpot(g), c = Math.cos(g.rot), sn = Math.sin(g.rot);
        for (let k = 0; k < a; k++) { const d = since * 1.3 - k * 0.7; if (d <= 0) continue; const dir = k % 2 ? 1 : -1, x = dx + c * dir * d + sn * 0.6, z = dz - sn * dir * d + c * 0.6; pts.push(x, z, Math.atan2(c * dir, -sn * dir), 1); drawn++; } }
    }
    return { pts, wait, drawn };
  }
}
