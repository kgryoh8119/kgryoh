// v94：道路に面していない所には建てない／市長レベルの曲線の見直し（古いセーブのレベルは下げない）
import { describe, it, expect } from 'vitest';
import { newGame, dispatch, checkPlace, accessTile, siteAccess, ROADLESS, DEFS, W, H, idx, isLocked, levelOf, LEVELS, buildable, getMap } from '../src/sim/index';
import { migrateMayor, LEVELS_V93, CURVE, mayorMonthly, WIN_PTS, newMayor } from '../src/sim/mayor';
import { repairState } from '../src/sim/core';
import '../src/sim/wire';
import type { GameState, Kind } from '../src/sim/index';

/** 市の区域の中で、建てられる空き地のうち、道路に面した所（near=true）か、4 区画以内に道路がない所（near=false） */
function spot(s: GameState, kind: Kind, near: boolean): { x: number; y: number } | null {
  const d = DEFS[kind], m = getMap(s.seed);
  for (let y = 1; y + d.h < H - 1; y++) for (let x = 1; x + d.w < W - 1; x++) {
    if (isLocked(s, idx(x, y))) continue;
    let free = true; for (let dy = 0; dy < d.h && free; dy++) for (let dx = 0; dx < d.w; dx++) { const i = idx(x + dx, y + dy); if (s.occ[i] || s.road[i] || !buildable(m, i) || s.rail?.[i]) { free = false; break; } }
    if (!free) continue;
    const a = accessTile(s, x, y, d.w, d.h, 1, 1);
    if (near ? a >= 0 : a < 0 && siteAccess(s, 'farm', x, y, d.w, d.h, 1) < 0) return { x, y };
  }
  return null;
}

describe('v94 道路に面していない所には建てない', () => {
  it('市の施設は道路に面していないと建てられず、道路に面していれば建てられる', () => {
    const s = newGame(); s.cash = 1e7;
    const far = spot(s, 'nurseryS', false)!; expect(far).toBeTruthy();
    const c = checkPlace(s, 'nurseryS', far.x, far.y);
    expect(c.ok).toBe(false); expect(c.reasons.join('')).toMatch(/道路に面していません/);
    expect(dispatch(s, { type: 'build', kind: 'nurseryS', x: far.x, y: far.y }).ok).toBe(false);
    const nr = spot(s, 'nurseryS', true)!;
    expect(checkPlace(s, 'nurseryS', nr.x, nr.y).ok).toBe(true);
  });
  it('田畑・ため池・メガソーラーなどは例外（4 区画以内の道路から入る）', () => {
    for (const k of ['farm', 'tameike', 'solar', 'forestPark', 'pier']) expect(ROADLESS.has(k)).toBe(true);
    for (const k of ['nursery', 'school', 'park', 'house', 'shop', 'office']) expect(ROADLESS.has(k)).toBe(false);
    const s = newGame(); s.cash = 1e7;
    const far = spot(s, 'tameike', false)!;
    const c = checkPlace(s, 'tameike', far.x, far.y); expect(c.reasons.join('')).not.toMatch(/道路に面していません/); expect(c.level).not.toBe('error'); // 置けるが、道路が遠いので注意が出る
  });
  it('古いセーブで道路に面していない建物は壊さず、課題で知らせる', () => {
    const s = newGame(); s.cash = 1e7;
    const nr = spot(s, 'nurseryS', true)!;
    expect(dispatch(s, { type: 'build', kind: 'nurseryS', x: nr.x, y: nr.y }).ok).toBe(true);
    const b = s.buildings.at(-1)!; b.status = 'operating';
    // まわりの道路を消して、道路に面していない建物にする
    const d = DEFS[b.kind];
    for (let dy = -1; dy <= d.h; dy++) for (let dx = -1; dx <= d.w; dx++) { const i = idx(b.x + dx, b.y + dy); if (s.road[i] && s.road[i] < 3) s.road[i] = 0; }
    s.roadVersion++;
    repairState(s);
    expect(s.buildings.includes(b)).toBe(true);
  });
  it('民間の住宅は道路に面した区画にだけ建つ（数年回しても道路に面していない住宅・店がない）', async () => {
    const { stepMonth } = await import('../src/sim/index');
    const s = newGame(); for (let m = 0; m < 24; m++) stepMonth(s);
    const bad = s.buildings.filter(b => b.builtMonth > 0 && accessTile(s, b.x, b.y, b.w, b.h, 1, 1) < 0 && !ROADLESS.has(b.kind));
    expect(bad.map(b => b.kind)).toEqual([]);
  }, 60000);
});

describe('v94 市長レベルの曲線', () => {
  it('後半ほど必要なポイントの差が広がり、最大は v93 より多い', () => {
    const inc = LEVELS.slice(1).map((l, k) => l.pts - LEVELS[k].pts);
    for (let k = 2; k < inc.length; k++) expect(inc[k]).toBeGreaterThanOrEqual(inc[k - 1]);
    expect(LEVELS[9].pts).toBeGreaterThan(LEVELS_V93[9] * 1.3);
  });
  it('古いセーブを読むと、市長レベルは下がらず、次のレベルまでは新しい曲線になる', () => {
    for (const P of [0, 130, 400, 760, 1700, 2600]) {
      const s = newGame(); s.mayor = newMayor(); s.mayor.pts = P; delete s.mayor!.curve; delete s.mayor!.won;
      let old = 1; for (let k = 0; k < 10; k++) if (P >= LEVELS_V93[k]) old = k + 1;
      migrateMayor(s);
      expect(levelOf(s.mayor!.pts)).toBe(old);
      expect(s.mayor!.curve).toBe(CURVE);
      const p1 = s.mayor!.pts; migrateMayor(s); expect(s.mayor!.pts).toBe(p1); // 2 回目は何もしない
    }
  });
  it('再選のたびにポイントが入る（古いセーブの過去の再選はさかのぼらない）', () => {
    const s = newGame(); s.mayor = newMayor(); const M = s.mayor; const p0 = M.pts;
    s.elections.push({ month: s.month, vote: 55, win: true } as any);
    mayorMonthly(s);
    const t = newGame(); t.mayor = newMayor(); t.elections.push({ month: 0, vote: 55, win: true } as any); delete t.mayor!.curve; delete t.mayor!.won;
    const q0 = t.mayor!.pts; migrateMayor(t); mayorMonthly(t);
    expect((M.pts - p0) - (t.mayor!.pts - q0)).toBe(WIN_PTS); // 古いセーブは勲章「再選」の分だけ（再選の実績点はさかのぼらない）
  });
});

describe('v94 オート', () => {
  it('はじめの 2 年で、まとめて借りて建てて一時借入が続くことがなく、道路に面していない建物も建てない', async () => {
    const { stepMonth, seedForTerrain, tempDebt } = await import('../src/sim/index');
    const { autoTurn } = await import('../src/autoplay');
    const s = newGame({ seed: seedForTerrain('coast', 261011) }); s.tutorial.done = true;
    let temp = 0;
    for (let m = 0; m < 24; m++) { autoTurn(s); stepMonth(s); s.events.active = []; if (tempDebt(s) > 0) temp++; }
    expect(temp).toBeLessThanOrEqual(3); // v93 は 24 か月のうち 10 か月ほど一時借入があった
    expect(s.buildings.filter(b => b.builtMonth > 0 && accessTile(s, b.x, b.y, b.w, b.h, 1, 1) < 0 && !ROADLESS.has(b.kind)).map(b => b.kind)).toEqual([]);
  }, 180000);
});
