// v94：立体の道路（立体交差・陸橋・歩道橋）のつなぎ目の規則。置けない組み合わせは plan で弾き、古いセーブの不整合は読込時に平面として扱い、
// 通行の計算では立体交差の上と下は坂の先でだけつながる。
import { describe, it, expect } from 'vitest';
import { newGame, W, H, dispatch, planFlyover, planRoad, planOverpass, planFootbridge, serialize, deserialize, roadInfo, recompute, validateState } from '../src/sim/index';
import { grade, gradeIssues, FLY_RAMP, rampSideError } from '../src/sim/grade';
import { ADJ } from '../src/sim/core';
import type { GameState } from '../src/sim/index';

const idx = (x: number, y: number) => y * W + x;
/** 空き地（w×h）を探して、その左上を返す */
function space(s: GameState, w: number, h: number): [number, number] {
  const free = (i: number) => !s.occ[i] && !s.road[i] && !s.rail?.[i];
  for (let y = 3; y < H - h - 3; y++) for (let x = 3; x < W - w - 3; x++) {
    let ok = true; for (let yy = y - 1; yy <= y + h && ok; yy++) for (let xx = x - 1; xx <= x + w && ok; xx++) if (!free(idx(xx, yy))) ok = false;
    if (ok) return [x, y];
  }
  throw new Error('空き地がありません');
}
const put = (s: GameState, i: number, r: number) => { s.road[i] = r; s.roadAge[i] = 0; s.zone[i] = 0; };
/** 横の幹線（行 Y+6、X〜X+18）と、縦の幹線（cols）。縦は Y〜Y+12 */
function grid(cols: number[], short: number[] = []) {
  const s = newGame({ seed: 3 }); s.cash = 1e8;
  const [X, Y] = space(s, 22, 14);
  for (let x = X; x <= X + 18; x++) put(s, idx(x, Y + 6), 2);
  for (const c of cols) for (let y = Y; y <= Y + 12; y++) put(s, idx(X + c, y), 2);
  for (const c of short) for (let y = Y + 5; y <= Y + 7; y++) put(s, idx(X + c, y), 2); // 交差点の前後 1 区画だけの短い縦の幹線
  s.roadVersion++; recompute(s);
  return { s, X, Y, J: (c: number) => idx(X + c, Y + 6) };
}

describe('v94：立体交差の形', () => {
  it('まっすぐな幹線の交差点には置け、高架は前後 2 区画（60m）の坂を持つ', () => {
    const { s, J } = grid([9]);
    const pl = planFlyover(s, [J(9)]); expect(pl.ok).toEqual([J(9)]);
    expect(dispatch(s, { type: 'flyover', tiles: [J(9)] }).ok).toBe(true);
    const L = grade(s); expect(L.spans.length).toBe(1);
    expect(L.spans[0].tiles.length).toBe(1 + 2 * FLY_RAMP);
    expect(L.flyRamp.size).toBe(2 * FLY_RAMP);
  });
  it('坂の途中に脇道があり、もう一方の向きでも坂が取れない交差点には置けない（理由が出る）', () => {
    const { s, J, X, Y } = grid([], [5]);
    put(s, idx(X + 7, Y + 7), 1); put(s, idx(X + 7, Y + 8), 1); s.roadVersion++; // X+7 は東西の坂の区画。そこへ脇道
    const pl = planFlyover(s, [J(5)]);
    expect(pl.ok).toEqual([]); expect(pl.bad[0][1]).toMatch(/脇道|途切れ/);
  });
  it('T 字の付け根（幹線が通り抜けない向き）・行き止まりに下りる高架は置けない', () => {
    const { s, X, Y } = grid([]);
    for (let y = Y + 7; y <= Y + 12; y++) put(s, idx(X + 18, y), 2); s.roadVersion++; // 横の幹線の東の端で南へ曲がる（L 字）
    expect(planFlyover(s, [idx(X + 18, Y + 6)]).ok).toEqual([]);
    const g2 = grid([17]); // 東の端の 1 区画手前の交差点：東の坂の先（X+20）に道路がない
    const pl = planFlyover(g2.s, [g2.J(17)]);
    expect(pl.ok).toEqual([g2.J(17)]); // 南北の向きなら置ける（向きを選び直す）
    const L = grade(Object.assign(g2.s, { flyover: [g2.J(17)] })); expect(L.spans[0].ew).toBe(false);
  });
  it('直角に隣り合う立体交差（作者の見た「立体でぶつかる」形）は、高架が重ならない向きに決まるか、置けない', () => {
    const { s, J } = grid([12, 14]);
    for (const c of [12, 14]) dispatch(s, { type: 'flyover', tiles: [J(c)] });
    const L = grade(s);
    const own = new Map<number, boolean>();
    for (const sp of L.spans) for (const t of sp.tiles) { if (own.has(t)) expect(own.get(t)).toBe(sp.ew); own.set(t, sp.ew); }
    // 2 か所とも置けたなら、同じ向きの 1 本の高架か、別々の平行な高架
    expect(L.flyBad.size).toBe(0);
  });
  it('高架の坂の横には道路をつなげられない。歩道橋も高架の所には架けられない', () => {
    const { s, J, X, Y } = grid([9]);
    dispatch(s, { type: 'flyover', tiles: [J(9)] });
    const sp = grade(s).spans[0], ramp = [...grade(s).flyRamp][0], rx = ramp % W, ry = (ramp / W) | 0;
    const side = sp.ew ? idx(rx, ry + 1) : idx(rx + 1, ry);
    const pr = planRoad(s, [side], 1); expect(pr.ok).toEqual([]); expect(pr.bad[0][1]).toMatch(/坂の横/);
    const pf = planFootbridge(s, [J(9)]); expect(pf.ok).toEqual([]); expect(pf.bad[0][1]).toMatch(/高架/);
    void X; void Y;
  });
});

describe('v94：トンネル', () => {
  it('トンネルの途中に横から道路をつなげられない（出入口の先ならつなげる）', () => {
    const s = newGame({ seed: 3 }); s.cash = 1e8; const [X, Y] = space(s, 10, 5);
    for (let x = X; x <= X + 8; x++) put(s, idx(x, Y + 2), 1);
    s.tunnel = [idx(X + 3, Y + 2), idx(X + 4, Y + 2), idx(X + 5, Y + 2)]; s.roadVersion++;
    expect(rampSideError(s, idx(X + 4, Y + 3))).toMatch(/トンネルの途中/);
    expect(rampSideError(s, idx(X + 1, Y + 3))).toBe('');
  });
});

describe('v94：通行の計算（上と下の道）', () => {
  it('高架は別の節点で、坂の先の区画とだけつながる。交差点の区画と高架は直接つながらない', () => {
    const { s, J } = grid([9]);
    dispatch(s, { type: 'flyover', tiles: [J(9)] });
    const G = roadInfo(s), roads = s.road.filter(r => r).length;
    expect(G.n).toBe(roads + 1);
    const deck = G.n - 1, sp = grade(s).spans[0];
    expect(G.nodes[deck]).toBe(-1);
    const nb = [...G.adj.slice(deck * ADJ, deck * ADJ + ADJ)].filter(k => k >= 0).map(k => G.nodes[k]).sort((a, b) => a - b);
    expect(nb).toEqual([sp.land0, sp.land1].sort((a, b) => a - b));
    for (const t of sp.tiles) { const k = G.nodeOf[t]; expect([...G.adj.slice(k * ADJ, k * ADJ + ADJ)]).not.toContain(deck); }
    recompute(s); expect(Number.isFinite(s.stats.avgDelay)).toBe(true);
  });
});

describe('v94：古いセーブの不整合', () => {
  it('形の成り立たない立体交差・陸橋・歩道橋は、データを残したまま平面として扱い、注意を出す', () => {
    const { s, X, Y } = grid([], [5]);
    put(s, idx(X + 7, Y + 7), 1); s.roadVersion++;
    s.flyover = [idx(X + 5, Y + 6)];          // 坂の途中に脇道（v93 までは置けた）
    s.footbridge = [idx(X + 6, Y + 6)];
    const r = deserialize(serialize(s)); if (!r.ok) throw new Error(r.error);
    const t = r.state;
    expect(t.flyover).toEqual([idx(X + 5, Y + 6)]);
    const L = grade(t); expect(L.flyOk.size).toBe(0); expect(L.flyBad.size).toBe(1);
    expect(gradeIssues(t).join('')).toMatch(/平面交差/);
    expect(roadInfo(t).n).toBe(t.road.filter((v: number) => v).length); // 高架の節点はない
    expect(validateState(t)).toBeNull();
  });
  it('踏切の陸橋：坂の途中に脇道があれば置けない。形の成り立たない古い陸橋は踏切として扱う', () => {
    const s = newGame({ seed: 10 }); s.cash = 1e8;
    const xs = s.road.map((r, i) => (r && s.rail?.[i] && !s.railGrade?.[i] ? i : -1)).filter(i => i >= 0);
    for (const x of xs) {
      const pl = planOverpass(s, [x]);
      if (pl.ok.length) {
        const o = gradeLayout0(s, x)!; const r = o.ramps[0], rx = r % W, ry = (r / W) | 0, side = o.ew ? idx(rx, ry + 1) : idx(rx + 1, ry);
        if (s.road[side] || s.occ[side] || s.rail?.[side]) continue;
        put(s, side, 1); s.roadVersion++;
        const p2 = planOverpass(s, [x]); expect(p2.ok).toEqual([]); expect(p2.bad[0][1]).toMatch(/脇道/);
        s.overpass = [x]; expect(grade(s).ovpBad.has(x)).toBe(true); expect(gradeIssues(s).join('')).toMatch(/踏切/);
        return;
      } else expect(pl.bad[0][1].length).toBeGreaterThan(0);
    }
  });
});
function gradeLayout0(s: GameState, x: number) { const t = { ...s, overpass: [x] } as GameState; return grade(t).ovp.get(x); }
