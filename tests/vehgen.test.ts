// v86：車・電車の形（render/vehgen.ts）の検査。頂点の番号、面の種類、面数、寸法、車体色の分布
import { describe, it, expect } from 'vitest';
import { makeVeh, makeTrain, makeWork, VEH_MODELS, WORK_MODELS, WORK_HL, carColor, CAR_PART, TRAIN_PART } from '../src/render/vehgen';
import { makeTrains, FAMS, PANTO_Z } from '../src/render/trainkit';

const bounds = (m: { V: number[][] }) => [0, 1, 2].map(k => { const v = m.V.map(p => p[k]); return [Math.min(...v), Math.max(...v)]; });

describe('車の形', () => {
  const V = makeVeh(14);
  it('17 種類の形があり、どれも面の番号と種類が正しい', () => {
    expect(VEH_MODELS.length).toBe(17);
    for (const n of VEH_MODELS) { const m = V[n]; expect(m.F.length).toBeGreaterThan(300); expect(m.F.length).toBeLessThan(800); // v88：細部（ドアの線・ワイパー・車内など）で 700 → 800
      for (const f of m.F) { expect(f.slice(0, 3).every(i => i >= 0 && i < m.V.length)).toBe(true); expect(f[3]).toBeGreaterThanOrEqual(0); expect(f[3]).toBeLessThan(CAR_PART.length); }
      const [x, y, z] = bounds(m); expect(x[1] - x[0]).toBeLessThan(2.8); expect(y[1] - y[0]).toBeGreaterThan(1.5); expect(y[1] - y[0]).toBeLessThan(7.6); expect(z[0]).toBeGreaterThanOrEqual(-0.01); expect(z[1]).toBeLessThan(3.2); }
  });
  it('乗用車・トラックには窓があり、二輪車には窓がない', () => {
    for (const n of VEH_MODELS) { const glass = V[n].F.some(f => f[3] === 5); expect(glass).toBe(n !== 'scooter' && n !== 'bicycle'); }
  });
  it('タイヤの角数を減らすと面が減る（品質 low）', () => { const lo = makeVeh(8); for (const n of VEH_MODELS) expect(lo[n].F.length).toBeLessThan(V[n].F.length + 1); expect(lo.sedan.F.length).toBeLessThan(V.sedan.F.length); });
  it('パトカーは白と黒、救急車は赤い帯、タクシーは行灯（面の種類 7・8・10）', () => {
    const has = (n: typeof VEH_MODELS[number], t: number) => V[n].F.some(f => f[3] === t);
    expect(has('police', 7)).toBe(true); expect(has('police', 0)).toBe(true); expect(has('police', 8)).toBe(true); expect(has('police', 9)).toBe(true);
    expect(has('ambulance', 8)).toBe(true); expect(has('taxi', 10)).toBe(true); expect(has('kei', 14)).toBe(true); expect(has('sedan', 13)).toBe(true);
  });
});

describe('v88：働く車と二輪', () => {
  it('18 種類あり、面の番号・種類・寸法が正しく、前照灯の位置が車の長さの中にある', () => {
    const V = makeWork(14), lo = makeWork(8); expect(WORK_MODELS.length).toBe(18); expect(WORK_HL.length).toBe(WORK_MODELS.length);
    WORK_MODELS.forEach((n, k) => { const m = V[n]; expect(m.F.length).toBeGreaterThan(40); expect(m.F.length).toBeLessThan(1600); expect(lo[n].F.length).toBeLessThanOrEqual(m.F.length);
      for (const f of m.F) { expect(f.slice(0, 3).every(i => i >= 0 && i < m.V.length)).toBe(true); expect(f[3]).toBeGreaterThanOrEqual(0); expect(f[3]).toBeLessThan(CAR_PART.length); }
      const [x, y, z] = bounds(m); expect(x[1] - x[0]).toBeLessThan(3.3); expect(y[1] - y[0]).toBeLessThan(11); expect(z[0]).toBeGreaterThanOrEqual(-0.01); expect(z[1]).toBeLessThan(4); expect(WORK_HL[k]).toBeLessThan(y[1] + 0.6); });
  });
});

describe('車体色', () => {
  it('白・黒・銀・灰が 7 割以上（普通車）で、軽は明るい色が増える', () => {
    const n = 4000, base = new Set([0xf4f4f2, 0x24262a, 0xc4c8cc, 0x777c82]); let a = 0, b = 0, kc = 0;
    const seen = new Set<number>(); for (let i = 0; i < n; i++) { const c = carColor(i / n); seen.add(c); if (base.has(c)) a++; const k = carColor(i / n, true); if (base.has(k) || k === 0x2a2c30 || k === 0xc4c8cc || k === 0x8a9096) b++; if (k === 0xf2c8d4 || k === 0xa8d4e6 || k === 0xd8e8b8) kc++; }
    expect(a / n).toBeGreaterThan(0.7); expect(a / n).toBeLessThan(0.8); expect(seen.size).toBeGreaterThanOrEqual(10); expect(b / n).toBeLessThan(0.55); expect(kc / n).toBeGreaterThan(0.15);
  });
});

describe('電車の形', () => {
  const T = makeTrain(10);
  it('中間車・パンタグラフ車・先頭車があり、寸法が車体（幅 2.9・長さ 19.5、幌と連結器で 20.3 まで）と合う', () => {
    for (const k of ['mid', 'pan', 'end'] as const) { const m = T[k]; expect(m.F.length).toBeGreaterThan(800); expect(m.F.length).toBeLessThan(1800);
      for (const f of m.F) { expect(f.slice(0, 3).every(i => i >= 0 && i < m.V.length)).toBe(true); expect(f[3]).toBeLessThan(TRAIN_PART.length); }
      const [x, y, z] = bounds(m); expect(x[1]).toBeLessThan(1.55); expect(x[0]).toBeGreaterThan(-1.55); expect(y[1] - y[0]).toBeGreaterThan(19.4); expect(y[1] - y[0]).toBeLessThan(20.6); expect(z[0]).toBeGreaterThanOrEqual(0); }
    const top = (k: 'mid' | 'pan' | 'end') => Math.max(...T[k].V.map(p => p[2]));
    expect(top('pan')).toBeGreaterThan(top('mid') + 0.5); // パンタグラフの分だけ高い
    expect(T.end.F.some(f => f[3] === 1 && T.end.V[f[0]][1] > 9)).toBe(true); // 先頭車の前面に窓がある
    expect(T.mid.F.some(f => f[3] === 0)).toBe(true); // 帯
    expect(Math.max(...T.pan.V.map(p => p[2]))).toBeLessThanOrEqual(PANTO_Z + 0.001); // パンタグラフは架線（レール面から 5.15m）に届いて、突き抜けない
  });
  it('v88：車種がそろい、品質を下げると面が減る。編成の車種はすべて作られる', () => {
    const H = makeTrains(10, 2), L = makeTrains(8, 0);
    for (const [k, m] of Object.entries(H)) { expect(m.F.length).toBeGreaterThan(0); for (const f of m.F) expect(f[3]).toBeLessThan(TRAIN_PART.length); if (k[0] !== 'o') expect(L[k as keyof typeof L].F.length).toBeLessThan(m.F.length); }
    for (const F of Object.values(FAMS)) for (const c of F.cars) if (c !== 'sl') expect(H[c]).toBeTruthy();
    expect(Math.max(...H.de.V.map(p => p[2]))).toBeLessThan(4.7); // 気動車にパンタグラフは無い
  });
});
