// v97：オートの鉄道の延伸と新駅（既存の駅から支線を延ばす計画が、市の操作 rail と駅の建設だけで実現できるか）
import { describe, it, expect } from 'vitest';
import { newGame, dispatch, seedForTerrain, W, H, idx, getMap, buildable, stationRailLevel } from '../src/sim/index';
import { addBuilding } from '../src/sim/events';
import { isLocked } from '../src/sim/mayor';
import { planBranch, farClusters, runs, FAR } from '../src/autorail';
import { railNbrs, sharpAt } from '../src/sim/railnet';
import '../src/sim/wire';

describe('v97 オートの鉄道の延伸', () => {
  it('駅から遠い住宅地へ、既存の駅から支線を延ばし、駅を建てられる（急なカーブ・平面交差・隣り合う踏切なし）', () => {
    const s = newGame({ seed: seedForTerrain('coast', 261011) }); s.tutorial.done = true; s.cash = 1e7;
    const m = getMap(s.seed), sts = s.buildings.filter(b => b.kind === 'station');
    const far = (x: number, y: number) => sts.every(b => Math.abs(b.x + 1 - x) + Math.abs(b.y - y) > FAR + 4);
    // 駅から遠い、道路に面した空き地に住宅を建てる（人口が増えた街の代わり）
    let n = 0;
    for (let y = 4; y < H - 4 && n < 120; y++) for (let x = 4; x < W - 4 && n < 120; x++) {
      const i = idx(x, y);
      if (!far(x, y) || s.occ[i] || s.road[i] || s.rail![i] || !buildable(m, i) || isLocked(s, i)) continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => s.road[idx(x + dx, y + dy)])) continue;
      if (Math.abs(x - 34) + Math.abs(y - 30) > 14) continue;
      addBuilding(s, 'apartment', x, y, 'operating', 0); n++;
    }
    expect(n).toBeGreaterThan(15);
    expect(farClusters(s)[0].units).toBeGreaterThan(60);
    const bp = planBranch(s, 60);
    expect(bp).not.toBeNull();
    const p = bp!;
    expect(p.tiles.length).toBe(p.grade.length);
    expect(p.cost).toBeGreaterThan(30000);
    // 高さごとの区間に分けて、市の操作で敷く
    for (const r of runs(p.grade)) expect(dispatch(s, { type: "rail", tiles: p.tiles.slice(r.a, r.b), level: 1, grade: r.g as 0 | 1 | 2 }).msg).toMatch(/敷きました/);
    expect(p.tiles.every(i => s.rail![i] === 1)).toBe(true);
    const has = (i: number) => s.rail![i] > 0;
    expect(p.tiles.every(i => !sharpAt(has, i))).toBe(true);
    // 支線は 1 本の線（端は 2 つ）
    expect(p.tiles.filter(i => railNbrs(has, i).length === 1).length).toBe(2);
    // 地上で道路と交わる所（踏切）は隣り合わない
    const cross = new Set(p.tiles.filter((i, k) => s.road[i] && p.grade[k] === 0));
    expect([...cross].every(i => ![1, -1, W, -W].some(d => cross.has(i + d)))).toBe(true);
    // 新駅は線路に面して建てられる
    expect(stationRailLevel(s, p.site[0], p.site[1], 3, 1)).toBeGreaterThan(0);
    const r = dispatch(s, { type: 'build', kind: 'station', x: p.site[0], y: p.site[1] });
    expect(r.ok).toBe(true);
    // 起点は既存の駅のそば（乗り換え）
    const from = s.buildings.find(b => b.id === p.from)!;
    expect(Math.abs(p.tiles[0] % W - from.x - 1) + Math.abs(((p.tiles[0] / W) | 0) - from.y)).toBeLessThanOrEqual(3);
  });
});
