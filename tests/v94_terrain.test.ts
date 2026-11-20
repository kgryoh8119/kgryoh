// v94：地形と海岸線（曲がりくねった海岸・湾・入江、低い所を流れる川と湖）。新しく始めた街だけ新しい地形
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, seedForTerrain, TERRAINS, getMap, buildable, W, H, setTerrainVer, validateState, tsunamiDepth, hasSea, serialize, deserialize, type MapDef } from '../src/sim/index';

const V86: Record<string, [number, number]> = { coast: [5661, 353], inland: [5079, 340], rural: [3101, 203], river: [5265, 347], lake: [5218, 348], mountain: [2651, 172], urban: [8047, 355], island: [4277, 286] };
const SEA = ['coast', 'river', 'lake', 'urban', 'island'];
const maps = (id: string): [MapDef, MapDef] => { const seed = seedForTerrain(id); setTerrainVer(seed, 0); const a = getMap(seed); setTerrainVer(seed, 94); const b = getMap(seed); return [a, b]; };
const count = (m: MapDef) => { let n = 0; for (let i = 0; i < W * H; i++) if (buildable(m, i)) n++; return n; };

describe('v94：地形と海岸線', () => {
  it('8 地形とも、はじめの町（76×68）の陸・水・標高・規模は変わらず、建てられる区画は 2 割以上は減らない', () => {
    for (const t of TERRAINS) { if (t.id === 'castaway') continue;
      const [a, b] = maps(t.id);
      expect(b.surf, t.id).toBeTruthy(); expect(a.surf, t.id).toBeFalsy();
      for (let y = 0; y < 68; y++) for (let x = 0; x < 76; x++) { const i = y * W + x; if (a.water[i] !== b.water[i] || a.steep[i] !== b.steep[i] || a.forest[i] !== b.forest[i]) throw new Error(`${t.id} ${x},${y}`); }
      for (let y = 0; y <= 68; y++) for (let x = 0; x <= 76; x++) expect(b.heights[y * (W + 1) + x], t.id).toBe(a.heights[y * (W + 1) + x]);
      const s = newGame({ seed: seedForTerrain(t.id) });
      expect(s.terrV, t.id).toBe(94);
      expect(validateState(s), t.id).toBeFalsy();
      expect([Math.round(s.stats.pop), s.buildings.length], t.id).toEqual(V86[t.id]);
      expect(count(b) / count(a), t.id).toBeGreaterThan(0.8);
    }
  });
  it('海岸線は直線ではない（湾・入江・岬）。はじめの町の南に入江が入り込み、海が近い', () => {
    for (const id of SEA) { const [a, b] = maps(id);
      const first = (m: MapDef, x: number) => { for (let y = m.sea ? 70 : H - 10; y < H; y++) if (m.water[y * W + x] && (!m.sea || m.sea[y * W + x])) { let k = 0; for (let yy = y; yy < Math.min(H, y + 3); yy++) if (m.water[yy * W + x]) k++; if (k === 3 || y >= H - 3) return y; } return H; };
      const turns = (m: MapDef) => { let n = 0, prev = 0; for (let x = 8; x < W - 9; x++) { const d = Math.sign(first(m, x + 1) - first(m, x)); if (d && prev && d !== prev) n++; if (d) prev = d; } return n; };
      expect(turns(a), id).toBeLessThan(4);      // v93 までは南の端の直線
      expect(turns(b), id).toBeGreaterThan(12);  // 曲がりくねる
      let near = H; for (let x = 20; x < 56; x++) near = Math.min(near, first(b, x));
      expect(near, id).toBeLessThan(118);        // はじめの町の南の入江（v93 は 164 行目）
      // 砂浜と磯がある
      let beach = 0, rock = 0; for (let i = 0; i < W * H; i++) { const x = i % W, y = (i / W) | 0; if (x < 76 && y < 68) continue; if (b.deco?.[i] === 1) beach++; if (b.deco?.[i] === 3 && b.heights[y * (W + 1) + x] < 10) rock++; }
      expect(beach, id).toBeGreaterThan(60); expect(rock, id).toBeGreaterThan(10);
    }
  });
  it('川は海・大きな川・湖につながる（水のまとまりは地図の縁に届くか、湖の大きさがある）', () => {
    for (const t of TERRAINS) { if (t.id === 'castaway') continue;
      const [, b] = maps(t.id), seen = new Uint8Array(W * H); let comps = 0, rivers = 0;
      for (let i0 = 0; i0 < W * H; i0++) { const x0 = i0 % W, y0 = (i0 / W) | 0; if (!b.water[i0] || seen[i0] || (x0 < 76 && y0 < 68)) continue;
        const q = [i0]; seen[i0] = 1; let edge = false;
        for (let k = 0; k < q.length; k++) { const i = q[k], x = i % W, y = (i / W) | 0; if (x === 0 || y === 0 || x === W - 1 || y === H - 1) edge = true;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const j = yy * W + xx; if (b.water[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
        comps++; if (edge) rivers += q.length;
        expect(edge || q.length >= 12, `${t.id} ${x0},${y0} ${q.length}`).toBe(true);
      }
      expect(comps, t.id).toBeGreaterThan(0);
      // 川の水面は上流から下流へ下がる（となりの川の区画との差が、高い方から低い方へ流れる向きに矛盾しない＝ 水面がどこも有限）
      for (let i = 0; i < W * H; i++) if (b.water[i] && !(i % W < 76 && i / W < 68)) expect(Number.isFinite(b.surf![i]), t.id).toBe(true);
    }
  });
  it('津波：海のある地形だけ海があり、川・湖は海と数えない。海のない地形では津波が来ない', () => {
    for (const t of TERRAINS) { if (t.id === 'castaway') continue;
      const s = newGame({ seed: seedForTerrain(t.id) }), m = getMap(s.seed), d = tsunamiDepth(s, 10);
      let fl = 0, bad = 0; for (let i = 0; i < W * H; i++) { if (d[i] > 0) fl++; if (m.sea?.[i] && !m.water[i]) bad++; }
      expect(hasSea(s), t.id).toBe(SEA.includes(t.id)); expect(bad).toBe(0);
      if (SEA.includes(t.id)) { expect(fl, t.id).toBeGreaterThan(500); expect(fl, t.id).toBeLessThan(W * H * 0.5); } else expect(fl, t.id).toBe(0);
      for (let k = 0; k < 2; k++) stepMonth(s);
      expect(validateState(s), t.id).toBeFalsy();
    }
  });
  it('古いセーブ（地形の版がない）は v93 までの地形のまま。新しい街は保存し直しても新しい地形', () => {
    const seed = seedForTerrain('coast'), s = newGame({ seed }); const old: any = structuredClone(s); delete old.terrV;
    const [a, b] = maps('coast');
    const r = deserialize(JSON.stringify({ format: 'sumucity-save', version: JSON.parse(serialize(s)).version, savedAt: 0, mapId: 'sumino', state: old }));
    expect(r.ok).toBe(true); if (!r.ok) return;
    let diffOld = 0; const mo = getMap(seed); for (let i = 0; i < W * H; i++) if (mo.water[i] !== a.water[i]) diffOld++;
    expect(diffOld).toBe(0); expect(mo.surf).toBeFalsy();
    const r2 = deserialize(serialize(s)); expect(r2.ok).toBe(true); if (!r2.ok) return;
    expect(r2.state.terrV).toBe(94);
    const mn = getMap(seed); let diffNew = 0; for (let i = 0; i < W * H; i++) if (mn.water[i] !== b.water[i]) diffNew++;
    expect(diffNew).toBe(0); expect(mn.surf).toBeTruthy();
    // v93 までの地形（古いセーブ）の水の区画の数は変わらない
    const exp: Record<string, number> = { coast: 1026, inland: 937, rural: 834, river: 1787, lake: 1486, mountain: 937, urban: 1026, island: 2248 };
    for (const t of TERRAINS) { if (t.id === 'castaway') continue; const [o] = maps(t.id); let w = 0; for (let i = 0; i < W * H; i++) if (o.water[i]) w++; expect(w, t.id).toBe(exp[t.id]); }
  });
});
