// v87：渋滞・満員・緊急出動の見え方の計算（描画側の純粋な関数）
import { describe, it, expect } from 'vitest';
import { roadRoute, roadNear, jamLook, stationLook, isRightTurn, emPlan } from '../src/render/traffic';

describe('v87 traffic', () => {
  it('道路の最短経路と、建物に近い道路', () => {
    const W = 5, H = 4, road = new Array(W * H).fill(0);
    for (let x = 0; x < W; x++) road[x] = 1; for (let y = 0; y < H; y++) road[y * W + 4] = 1; // 上の行と右の列
    const r = roadRoute(road, W, H, 0, 3 * W + 4)!; expect(r[0]).toBe(0); expect(r.at(-1)).toBe(19); expect(r.length).toBe(8);
    expect(roadRoute(road, W, H, 0, 2 * W + 1)).toBeNull();
    expect(roadNear(road, W, H, 1, 2, 2, 1)).toBeGreaterThanOrEqual(0);
  });
  it('混むほど列が長く、車間が詰まり、のろのろになる', () => {
    expect(jamLook(0.5).per).toBe(0); const a = jamLook(1.1), b = jamLook(1.8);
    expect(b.per).toBeGreaterThan(a.per); expect(b.gap).toBeLessThan(a.gap); expect(b.crawl).toBeGreaterThan(a.crawl);
  });
  it('駅の混雑率が高いと、あふれ・乗り残し・窓の人が増える', () => {
    const lo = stationLook(80), hi = stationLook(300);
    expect(lo.spill).toBe(0); expect(hi.spill).toBeGreaterThan(0.5); expect(hi.left).toBeGreaterThan(lo.left); expect(hi.pax).toBeGreaterThan(lo.pax);
  });
  it('右折の判定（左側通行）と、出動の組み合わせ', () => {
    const W = 10; // 北（上）へ進んで東へ曲がる＝右折
    expect(isRightTurn(W, 25, 15, 16)).toBe(true); expect(isRightTurn(W, 25, 15, 14)).toBe(false);
    expect(emPlan('bigFire')).toContain(2); expect(emPlan('grant')).toBeNull();
  });
});
