// v103：横断歩道を引く交差点・腕の決まり（roadbase の crosswalkArms、純粋な関数）。
// 日本の住宅地の生活道路どうしの交差点（一時停止）には横断歩道が無いことが多い。信号のある交差点・学校や駅の近く・二車線以上の道が通る交差点
// （幹線を渡る横断歩道と、幹線の歩道を歩く人が脇の道の入口を渡る横断歩道）には引く。
import { describe, it, expect } from 'vitest';
import { crosswalkArms, crosswalkLayout } from '../src/render/roadbase';

const E = 1, Wb = 2, S = 4, N = 8;
const X = (e: number, w: number, s: number, n: number, o: Partial<{ sig: boolean; near: boolean; stone: boolean }> = {}) =>
  crosswalkArms({ e, w, s, n, sig: false, near: false, stone: false, ...o });

describe('v103 横断歩道を引く腕', () => {
  it('生活道路どうしの交差点（十字・T 字）には引かない', () => { expect(X(1, 1, 1, 1)).toBe(0); expect(X(1, 1, 1, 0)).toBe(0); expect(X(0, 1, 1, 1)).toBe(0); });
  it('学校・駅の近くは、生活道路どうしでもすべての腕に引く', () => { expect(X(1, 1, 1, 1, { near: true })).toBe(E | Wb | S | N); expect(X(1, 1, 0, 1, { near: true })).toBe(E | Wb | N); });
  it('信号のある交差点は、すべての腕に引く', () => { expect(X(3, 3, 2, 2, { sig: true })).toBe(E | Wb | S | N); expect(X(3, 3, 2, 0, { sig: true })).toBe(E | Wb | S); });
  it('幹線・二車線と生活道路：幹線を渡る腕と、脇の道の入口（幹線の歩道の延長）の腕に引く', () => {
    expect(X(3, 3, 1, 1)).toBe(E | Wb | S | N);
    expect(X(2, 2, 1, 0)).toBe(E | Wb | S); // 二車線に生活道路が南から突き当たる T 字
    expect(X(1, 0, 2, 2)).toBe(E | S | N);
  });
  it('二車線どうし（信号なし）も引く', () => { expect(X(2, 2, 2, 2)).toBe(E | Wb | S | N); });
  it('交差点でない区画・石畳の道には引かない', () => { expect(X(2, 2, 0, 0)).toBe(0); expect(X(2, 0, 2, 0)).toBe(0); expect(X(3, 3, 1, 1, { stone: true, sig: true })).toBe(0); });
  it('引くのはつながる腕だけ', () => {
    for (let k = 0; k < 256; k++) { const r = (j: number) => (k >> (j * 2)) & 3, e = r(0), w = r(1), s = r(2), n = r(3);
      for (const o of [{}, { sig: true }, { near: true }]) { const m = X(e, w, s, n, o); if (!e) expect(m & E).toBe(0); if (!w) expect(m & Wb).toBe(0); if (!s) expect(m & S).toBe(0); if (!n) expect(m & N).toBe(0); } }
  });
  it('格子の街：生活道路どうしの交差点は 0 に（前は 35%）、二車線の通る交差点には残る', () => {
    // 6×6 の格子（30m おき）。真ん中の東西 1 本が二車線、ほかは生活道路
    let mm = 0, mmXw = 0, mixed = 0, mixedXw = 0;
    for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
      const cl = (yy: number) => (yy === 3 ? 2 : 1), e = x < 5 ? cl(y) : 0, w = x > 0 ? cl(y) : 0, s = y < 5 ? 1 : 0, n = y > 0 ? 1 : 0;
      if ((e ? 1 : 0) + (w ? 1 : 0) + (s ? 1 : 0) + (n ? 1 : 0) < 3) continue;
      const m = X(e, w, s, n);
      if (Math.max(e, w) >= 2) { mixed++; if (m) mixedXw++; } else { mm++; if (m) mmXw++; }
    }
    expect(mm).toBeGreaterThan(10); expect(mmXw).toBe(0); expect(mixed).toBeGreaterThan(3); expect(mixedXw).toBe(mixed);
  });
  it('横断歩道の配置（crosswalkLayout）は v101 のまま', () => { const L = crosswalkLayout(7.5, 2.5); expect(L.xw).toEqual([3.5, 7.5]); expect(L.stop[0]).toBeCloseTo(9); });
});
