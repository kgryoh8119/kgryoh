// 壊れたデータ（検査に通らない状態）ができないかを調べる。オート＋できごと＋でたらめな操作を長く回し、毎月と毎操作のあとに状態を検査する。
// SEEDS=1,2,3 YEARS=40 OPS=6（月あたりのでたらめな操作）
import { newGame, stepMonth, eventDef, dispatch, validateState, DEFS, W, H, POLICIES, AIR_ROUTES, initLocks, OPTIONS, SISTERS, seedForTerrain, TERRAINS } from '../src/sim/index';
import type { Action, Kind, GameState } from '../src/sim/index';
import { autoResolve, autoEvent, autoTurn } from '../src/autoplay';
const seeds = (process.env.SEEDS ?? '1,2,3').split(',').map(Number), Y = Number(process.env.YEARS ?? 40), OPS = Number(process.env.OPS ?? 6);
let r = 12345; const rnd = () => { r = (r * 1103515245 + 12345) >>> 0; return r / 4294967296; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const kinds = Object.keys(DEFS) as Kind[];
const line = (len: number) => { const x0 = Math.floor(rnd() * W), y0 = rnd() < 0.4 ? Math.floor(H * 0.72 + rnd() * H * 0.28) : Math.floor(rnd() * H), h = rnd() < 0.5, t: number[] = []; for (let k = 0; k < len; k++) { const x = h ? x0 + k : x0, y = h ? y0 : y0 + k; if (x < W && y < H) t.push(y * W + x); } return t; };
const rect = () => { const x0 = Math.floor(rnd() * (W - 4)), y0 = Math.floor(rnd() * (H - 4)), w = 1 + Math.floor(rnd() * 4), h = 1 + Math.floor(rnd() * 4), t: number[] = []; for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) t.push(y * W + x); return t; };
const randAct = (s: GameState): Action => {
  const b = s.buildings.length ? pick(s.buildings) : null, T = line(1 + Math.floor(rnd() * 6));
  const opts: (() => Action)[] = [
    () => ({ type: 'annex', block: Math.floor(rnd() * 16) }), () => ({ type: 'sister', id: pick(SISTERS).id, act: pick(['join', 'student', 'trade', 'culture', 'end'] as const) }),
    () => ({ type: 'pol', op: pick(['plan', 'lobby', 'speech', 'ads', 'debate', 'press', 'grant', 'petition', 'fest', 'appoint', 'route', 'unroute', 'freq'] as const), id: pick(['growth', 'welfare', 'austerity', 'balanced', 'apologize', 'rebut', 'ignore', 'sosei', 'kosodate', 'kanko', 'hanabi', 'snow', 'sakura', 'zzz', '0', '1', '2', '5', `${Math.floor(rnd() * 3000)}-${Math.floor(rnd() * 3000)}`]), n: Math.floor(rnd() * 7) }),
    () => ({ type: 'option', id: b ? b.id : 1, opt: pick(OPTIONS).id, on: rnd() < 0.8 }), () => ({ type: 'style', id: b ? b.id : 1, v: Math.floor(rnd() * 6) }),
    () => ({ type: 'expand', id: b ? b.id : 1 }), () => ({ type: 'upgrade', id: b ? b.id : 1 }), () => ({ type: 'move', id: b ? b.id : 1, x: Math.floor(rnd() * W), y: Math.floor(rnd() * H) }), () => ({ type: 'road', tiles: T, road: rnd() < 0.7 ? 1 : 2 }), () => ({ type: 'unroad', tiles: T }), () => ({ type: 'zone', tiles: T, zone: Math.floor(rnd() * 7) as any }),
    () => ({ type: 'canal', tiles: T }), () => ({ type: 'bridge', tiles: T, road: 1 }), () => ({ type: 'tunnel', tiles: T, road: 1 }), () => ({ type: 'levee', tiles: T }),
    () => ({ type: 'busStop', tiles: T, on: rnd() < 0.7 }), () => ({ type: 'area', tiles: T, v: Math.floor(rnd() * 3) as any }), () => ({ type: 'footbridge', tiles: T }), () => ({ type: 'overpass', tiles: T }),
    () => ({ type: 'rail', tiles: T, level: (1 + Math.floor(rnd() * 3)) as any, grade: Math.floor(rnd() * 4) as any }), () => ({ type: 'railgrade', tiles: T, grade: Math.floor(rnd() * 4) as any }),
    () => ({ type: 'terra', tiles: rect(), op: pick(['raise', 'lower', 'flatten', 'hill', 'mountain', 'valley', 'cliff', 'water', 'fill', 'forest', 'clear', 'wet', 'sand', 'desert', 'snow', 'reset'] as const) }),
    () => ({ type: 'terra', tiles: T, op: pick(['water', 'fill', 'wet', 'mountain', 'flatten'] as const) }),
    () => ({ type: 'widen', tiles: T, on: rnd() < 0.8 }), () => ({ type: 'flyover', tiles: T }), () => ({ type: 'civic', id: pick(['festival', 'townhall']) }), () => ({ type: 'unrail', tiles: T }), () => ({ type: 'repair', tiles: T }),
    () => ({ type: 'build', kind: pick(kinds), x: Math.floor(rnd() * W), y: Math.floor(rnd() * H) }), () => ({ type: 'build', kind: pick(kinds), x: Math.floor(rnd() * W), y: Math.floor(rnd() * H) }),
    () => ({ type: 'demolish', id: b?.id ?? 0 }), () => ({ type: 'buyout', id: b?.id ?? 0 }), () => ({ type: 'upgrade', id: b?.id ?? 0 }), () => ({ type: 'renew', id: b?.id ?? 0 }), () => ({ type: 'suspend', id: b?.id ?? 0 }),
    () => ({ type: 'policy', id: pick(POLICIES).id, on: rnd() < 0.6 }), () => ({ type: 'tax', key: pick(['res', 'prop', 'biz', 'stay'] as const), v: 0.9 + rnd() * 0.3 }), () => ({ type: 'borrow', amount: 1000 * Math.ceil(rnd() * 20) }),
    () => ({ type: 'airRoute', route: pick(AIR_ROUTES).id, on: rnd() < 0.7 }), () => ({ type: 'airportUp', id: s.buildings.find(o => o.kind === 'airport')?.id ?? 0 }), () => ({ type: 'stationUp', id: s.buildings.find(o => o.kind === 'station')?.id ?? 0, what: rnd() < 0.5 ? 'bldg' : 'shin' }),
  ];
  return pick(opts)();
};
const bad: Record<string, number> = {}; const first: Record<string, string> = {};
const note = (k: string, where: string) => { bad[k] = (bad[k] ?? 0) + 1; if (!first[k]) first[k] = where; };
for (const seed of seeds) {
  const s = newGame({ seed: seed > 2 ? seedForTerrain(TERRAINS[seed % TERRAINS.length].id, seed) : seed }); if (seed % 2) initLocks(s); s.cash = 3e5; autoResolve(s);
  for (let m = 0; m < Y * 12; m++) {
    stepMonth(s);
    { const v = validateState(s); if (v) note('月次処理のあと：' + v, `seed ${seed} m${m}`); }
    autoResolve(s); autoEvent(s, eventDef); autoTurn(s);
    { const v = validateState(s); if (v) note('オートのあと：' + v, `seed ${seed} m${m}`); }
    for (let k = 0; k < OPS; k++) { const a = randAct(s), res = dispatch(s, a); if (!res.ok && res.msg.includes('内部エラー')) note(res.msg, `seed ${seed} m${m} ${JSON.stringify(a).slice(0, 120)}`); }
    if (s.cash < 5e4) s.cash = 3e5; // お金が尽きて何もできなくならないように
  }
  console.log(`seed ${seed} 終了 人口 ${Math.round(s.stats.pop)} 建物 ${s.buildings.length}`);
}
console.log(Object.keys(bad).length ? Object.entries(bad).map(([k, v]) => `${v} 回：${k}\n   最初：${first[k]}`).join('\n') : '問題なし');
