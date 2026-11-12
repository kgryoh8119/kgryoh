// まちづくり版（実在の地図をデフォルメした街）：生成・開始・1 年の計算・保存の往復・基本の操作
import { describe, it, expect } from 'vitest';
import mapText from '../public/maps/hodogaya.json?raw';
import { deformMap } from '../src/mapgen/deform';
import { setMap, newGame, stepMonth, validateState, dispatch, serialize, deserialize, W, H, idx, checkPlace, REAL, roadInfo, stationRailLevel, planRail } from '../src/sim/index';
import { sharpAt, railNbrs, railLine } from '../src/sim/railnet';

const raw = JSON.parse(mapText);
const { map } = deformMap(raw, { id: 'hodogaya-d' });
setMap('hodogaya-d', map);

describe('まちづくり版（保土ケ谷）', () => {
  it('小さな地図になり、駅・浄水場・ごみ処理・住宅がそろって始まる', () => {
    expect(REAL!.deformed).toBe(true);
    expect(W).toBeLessThan(70); expect(H).toBeLessThan(70);
    const s = newGame();
    expect(validateState(s)).toBeNull();
    for (const k of ['station', 'water', 'waste', 'school', 'nursery', 'house']) expect(s.buildings.some(b => b.kind === k)).toBe(true);
    expect(s.stats.pop).toBeGreaterThan(3000);
    expect(s.buildings.some(b => b.osm)).toBe(false); // 地図の街区（実寸版）ではなく、ゲームの標準の建物
  });
  it('1 年動かしても状態は正しく、保存して読み直すと一致する', () => {
    const s = newGame();
    for (let m = 0; m < 12; m++) stepMonth(s);
    expect(validateState(s)).toBeNull();
    const r = deserialize(serialize(s));
    expect(r.ok).toBe(true);
    if (r.ok) expect(serialize(r.state)).toBe(serialize(s));
  });
  it('空き地に道路を引き、用途を指定し、保育園を建てられる', () => {
    const s = newGame();
    // 道路に面した空き地を探す
    let spot = -1;
    for (let i = 0; i < W * H && spot < 0; i++) { const x = i % W, y = (i / W) | 0; if (!s.road[i] && !s.occ[i] && checkPlace(s, 'nursery', x, y).level === 'ok') spot = i; }
    expect(spot).toBeGreaterThanOrEqual(0);
    const r = dispatch(s, { type: 'build', kind: 'nursery', x: spot % W, y: (spot / W) | 0 });
    expect(r.ok).toBe(true);
    // 既存の道路の隣の空き地へ道路を 1 区画のばす
    let road = -1;
    for (let i = 0; i < W * H && road < 0; i++) { const x = i % W, y = (i / W) | 0; if (s.road[i] || s.occ[i]) continue; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && s.road[idx(x + dx, y + dy)] === 1) && dispatch(structuredClone(s), { type: 'road', tiles: [i], road: 1 }).ok) road = i; }
    expect(dispatch(s, { type: 'road', tiles: [road], road: 1 }).ok).toBe(true);
    expect(validateState(s)).toBeNull();
  });
});

describe('まちづくり版の線路', () => {
  it('線路を撤去・敷設・複線化でき、費用と維持の負担金がかかる。線路を断つと駅が止まる', () => {
    const s = newGame();
    expect(Array.isArray(s.rail)).toBe(true);
    const st = s.buildings.find(b => b.kind === 'station' && b.connected)!;
    expect(st).toBeTruthy();
    // 駅に面した線路をすべて撤去すると、その駅は使えない
    const around: number[] = [];
    for (let dy = -1; dy <= st.h; dy++) for (let dx = -1; dx <= st.w; dx++) { const x = st.x + dx, y = st.y + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = idx(x, y); if (s.rail![i]) around.push(i); }
    expect(around.length).toBeGreaterThan(0);
    const c0 = s.cash;
    expect(dispatch(s, { type: 'unrail', tiles: around }).ok).toBe(true);
    expect(s.cash).toBeLessThan(c0);
    expect(st.effCap === 0 || !s.buildings.find(b => b.id === st.id)!.used).toBe(true);
    // 単線で戻し、複線にする
    const c1 = s.cash;
    expect(dispatch(s, { type: 'rail', tiles: around, level: 1 }).ok).toBe(true);
    expect(dispatch(s, { type: 'rail', tiles: around, level: 2 }).ok).toBe(true);
    expect(s.cash).toBeLessThan(c1);
    expect(s.railCity!.length).toBe(around.length);
    expect(validateState(s)).toBeNull();
    stepMonth(s);
    expect(s.ledger.at(-1)!.roads).toBeGreaterThan(0);
    // 保存と読み直しで線路も一致する
    const r = deserialize(serialize(s));
    expect(r.ok && JSON.stringify(r.state.rail)).toBe(JSON.stringify(s.rail));
  });
  it('建物の上には線路を敷けず、線路の上には建物を置けない', () => {
    const s = newGame();
    const b = s.buildings.find(o => o.kind === 'house')!;
    expect(dispatch(s, { type: 'rail', tiles: [idx(b.x, b.y)], level: 1 }).ok).toBe(false);
    const ri = s.rail!.findIndex(v => v > 0);
    expect(checkPlace(s, 'park', ri % W, (ri / W) | 0).ok).toBe(false);
  });
  it('はじめの線路は斜めも使った 1 本の線で、急なカーブがほとんどなく、駅はすべて線路に面している', () => {
    const s = newGame(), has = (i: number) => s.rail![i] > 0;
    const tiles = s.rail!.map((v, i) => v ? i : -1).filter(i => i >= 0);
    expect(tiles.length).toBeGreaterThan(60);
    expect(tiles.some(i => railNbrs(has, i).some(j => Math.abs(j - i) === W + 1 || Math.abs(j - i) === W - 1))).toBe(true); // 斜めのつながり
    expect(tiles.filter(i => sharpAt(has, i)).length).toBeLessThanOrEqual(4);
    expect(s.railGrade!.some(g => g === 1)).toBe(true); // 高架
    expect(s.railGrade!.some(g => g === 2)).toBe(true); // 地下（トンネル）
    for (const b of s.buildings.filter(o => o.kind === 'station')) expect(stationRailLevel(s, b.x, b.y, b.w, b.h)).toBeGreaterThan(0);
  });
  it('直角に曲がる線路は敷けず、ゆるやかな線は敷ける。国道とは平面で交われない', () => {
    const s = newGame(); s.cash = 1e7; // 地下の線路は高いので、資金を足しておく
    // 線路と国道のない 10×10 の範囲を探す（地下に敷くので建物や道路はあってよい）
    let ox = -1, oy = -1;
    for (let y = 1; y < H - 11 && ox < 0; y++) for (let x = 1; x < W - 11 && ox < 0; x++) {
      let ok = true; for (let dy = 0; dy < 10 && ok; dy++) for (let dx = 0; dx < 10 && ok; dx++) { const i = idx(x + dx, y + dy); if (s.rail![i] || s.road[i] === 3) ok = false; }
      if (ok && planRail(s, railLine(idx(x, y + 2), idx(x + 6, y + 2)), 1, 2).ok.length === 7) { ox = x; oy = y; }
    }
    expect(ox).toBeGreaterThanOrEqual(0);
    expect(dispatch(s, { type: 'rail', tiles: railLine(idx(ox, oy + 2), idx(ox + 6, oy + 2)), level: 1, grade: 2 }).ok).toBe(true);
    // 端から直角に曲げる → だめ
    const bad = dispatch(s, { type: 'rail', tiles: railLine(idx(ox + 6, oy + 3), idx(ox + 6, oy + 8)), level: 1, grade: 2 });
    expect(bad.ok).toBe(false); expect(bad.msg).toMatch(/カーブ|分岐/);
    // ゆるやかに（斜め 1:2）続ける → よい
    expect(dispatch(s, { type: 'rail', tiles: railLine(idx(ox + 7, oy + 2), idx(ox + 9, oy + 3)), level: 1, grade: 2 }).ok).toBe(true);
    // 国道の区画に地上の線路 → だめ。地下なら敷ける
    const nat = s.road.findIndex((r, i) => r === 3 && !s.rail![i]);
    expect(planRail(s, [nat], 1, 0).ok.length).toBe(0);
    expect(planRail(s, [nat], 1, 2).ok.length).toBe(1);
  });
  it('地下の線路の上には建物を置け、踏切は車を待たせ、高架にすると待ち時間がなくなる', () => {
    const s = newGame();
    const house = s.buildings.find(o => o.kind === 'house')!, hi = idx(house.x, house.y);
    expect(planRail(s, [hi], 1, 0).ok.length).toBe(0);
    expect(planRail(s, [hi], 1, 2).ok.length).toBe(1);
    const under = s.railGrade!.findIndex(g => g === 2);
    expect(checkPlace(s, 'park', under % W, (under / W) | 0).reasons.join()).not.toMatch(/線路/);
    // 踏切
    const cr = s.rail!.findIndex((v, i) => v && s.road[i] && !s.railGrade![i]);
    expect(cr).toBeGreaterThanOrEqual(0);
    const info = roadInfo(s), before = info.free[info.nodeOf[cr]];
    const r = dispatch(s, { type: 'railgrade', tiles: [cr], grade: 1 });
    expect(r.ok).toBe(true);
    const info2 = roadInfo(s);
    expect(info2.free[info2.nodeOf[cr]]).toBeLessThan(before);
    expect(validateState(s)).toBeNull();
    // 線路の高さも保存される
    const r2 = deserialize(serialize(s));
    expect(r2.ok && r2.state.railGrade![cr]).toBe(1);
  });
});
