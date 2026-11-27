// v101：道路の標示と歩道の配置（描画の純粋な関数）。横断歩道は交差点の外の決まった幅で、隣り合う交差点（30m おき）と重ならない。
// 停止線は横断歩道の 1〜2m 手前。歩道の幅は等級ごとに一定で、橋脚・歩行者と同じ関数から出す。信号は幹線どうしの交差点だけ、150m 以上あける。
import { describe, it, expect } from 'vitest';
import { crosswalkLayout, xwRange, xwWidth, walkW, cornerSpot, sigPlan, CORNER_R, XW_STRIPE, XW_GAP } from '../src/render/roadbase';
import { FLY_ROAD_HALF, FLY_WALK, walkOf } from '../src/sim/grade';

const HALF = [2.5, 5, 7.5]; // 生活道路・2 車線・幹線（6 車線の幅も 7.5）

describe('v101 横断歩道と停止線', () => {
  for (const ah of HALF) for (const perp of HALF) it(`腕の半幅 ${ah}・交わる道の半幅 ${perp}`, () => {
    const L = crosswalkLayout(ah, perp);
    expect(L.xw).toEqual(xwRange(ah, perp));
    // 交差点の外（交わる道の縁石より外）から始まり、幅は 4m（生活道路 3m）
    expect(L.xw[0]).toBeGreaterThan(perp);
    expect(L.xw[1] - L.xw[0]).toBeCloseTo(xwWidth(ah));
    expect(xwWidth(ah)).toBeGreaterThanOrEqual(ah >= 4.5 ? 4 : 3);
    // 横断歩道は隅切りの円弧の途中（切り下げ）から：円弧の終わり（縁石が直線になる所）より手前で始まる
    expect(L.xw[0]).toBeLessThan(perp + CORNER_R);
    // 停止線は横断歩道の外の端から 1〜2m 手前
    expect(L.stop[0] - L.xw[1]).toBeGreaterThanOrEqual(1);
    expect(L.stop[0] - L.xw[1]).toBeLessThanOrEqual(2);
    // 区画の半分（15m）に収まる → 隣の区画の交差点の標示と重ならない
    expect(L.stop[1]).toBeLessThan(15);
    // 縞：幅 45cm・間隔 45cm、車道の中だけ、互いに重ならない
    expect(XW_STRIPE).toBeCloseTo(0.45); expect(XW_GAP).toBeGreaterThanOrEqual(0.45); expect(XW_GAP).toBeLessThanOrEqual(0.5);
    for (const [a, b] of L.stripes) { expect(b - a).toBeCloseTo(0.45); expect(a).toBeGreaterThanOrEqual(-ah); expect(b).toBeLessThanOrEqual(ah); }
    for (let k = 1; k < L.stripes.length; k++) expect(L.stripes[k][0] - L.stripes[k - 1][1]).toBeCloseTo(XW_GAP);
  });
  it('30m おきの交差点の間：横断歩道 2 本と停止線 2 本が重ならず、間に車道が残る', () => {
    for (const ah of HALF) for (const pA of HALF) for (const pB of HALF) {
      const A = crosswalkLayout(ah, pA), B = crosswalkLayout(ah, pB);
      // 交差点 A の中心から見た B の標示の範囲（B は 30m 先で向きが逆）
      const bNear = 30 - B.stop[1], bFar = 30 - B.xw[0];
      expect(A.stop[1]).toBeLessThanOrEqual(bNear);
      expect(A.xw[1]).toBeLessThan(bFar);
      // 4 方向の横断歩道は交差点の中で交わらない：腕の横断歩道は交わる道の車道（|q| < ah の帯の外）で、別の腕の横断歩道の縞（|q| < perp）と重ならない
      expect(A.xw[0]).toBeGreaterThan(pA);
    }
  });
});

describe('v101 歩道の幅（等級ごとに一定）', () => {
  it('道路構造令の目安：幹線 3.5m 以上、2 車線 3.0m、生活道路は路側帯 2.5m。どれも 2m 以上', () => {
    expect(walkW(7.5)).toBeGreaterThanOrEqual(3.5);
    expect(walkW(5)).toBe(3.0);
    expect(walkW(2.5)).toBe(2.5);
    for (const h of HALF) expect(walkW(h)).toBeGreaterThanOrEqual(2);
  });
  it('同じ等級なら区画によらず同じ（半幅だけで決まる）・隅切りの半径より狭い（角の外の円弧が同じ中心で回る）', () => {
    for (const h of HALF) { expect(walkW(h)).toBe(walkW(h + 0)); expect(walkW(h)).toBeLessThan(CORNER_R); }
  });
  it('sim の写し（橋脚の位置）と描画の歩道の幅が一致し、門形の柱は歩道の外', () => {
    for (const h of [2.5, 5, 7.5]) expect(walkOf(h)).toBe(walkW(h));
    expect(FLY_WALK).toBe(walkW(FLY_ROAD_HALF));
  });
  it('信号機・標識の柱（角の歩道の中ほど）は、歩道の帯の中', () => {
    for (const a of HALF) for (const b of HALF) {
      const [u, v] = cornerSpot(a, b, Math.max(a, b)), cu = b + CORNER_R, cv = a + CORNER_R, d = Math.hypot(u - cu, v - cv);
      expect(d).toBeLessThan(CORNER_R); // 縁石（円弧）より歩道の側
      expect(d).toBeGreaterThan(CORNER_R - Math.max(walkW(a), walkW(b))); // 歩道の外の端より内
    }
  });
});

describe('v101 信号の置き方', () => {
  const W = 40, H = 20, mk = () => new Uint8Array(W * H), id = (x: number, y: number) => y * W + x;
  it('生活道路と幹線の交差点は信号なし、幹線どうしは信号あり', () => {
    const r = mk(); for (let x = 0; x < W; x++) r[id(x, 10)] = 2;
    for (let y = 0; y < H; y++) { if (y !== 10) { r[id(5, y)] = 1; r[id(20, y)] = 2; } }
    const g = sigPlan(r, W, H);
    expect(g[id(5, 10)]).toBe(0);
    expect(g[id(20, 10)]).toBe(1);
  });
  it('30m おきに幹線が交わっても、信号は同じ通りで 5 区画（150m）以上あける。広い道の交差点を残す', () => {
    const r = mk(); for (let x = 0; x < W; x++) r[id(x, 10)] = 2;
    const cols: [number, number][] = [[8, 2], [10, 2], [12, 3], [14, 2], [20, 2]];
    for (const [c, k] of cols) for (let y = 0; y < H; y++) if (y !== 10) r[id(c, y)] = k;
    const g = sigPlan(r, W, H), on = cols.map(([c]) => c).filter(c => g[id(c, 10)]);
    expect(on).toContain(12); // 幹線（4 車線）との交差点を残す
    for (let k = 1; k < on.length; k++) expect(on[k] - on[k - 1]).toBeGreaterThanOrEqual(5);
    // 信号を間引いた交差点にも道はある（一時停止になる）
    expect(on.length).toBeLessThan(cols.length);
  });
  it('道の無い所・行き止まりには置かない', () => {
    const r = mk(); for (let x = 0; x < 10; x++) r[id(x, 3)] = 3;
    expect([...sigPlan(r, W, H)].some(v => v)).toBe(false);
  });
});
