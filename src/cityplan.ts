// オートの都市計画：地区ごとの役割（住宅・中心市街地・産業・観光・自然・郊外）を、地形と街の今から決める。
// 用途の指定・迷惑施設の置き場所・観光の施設は、この計画に沿って選ぶ。
import { W, H, DEFS, idx, getMap, buildable, isRes, fam, DISTRICTS, VISIONS } from './sim/index';
import type { GameState } from './sim/index';

export interface RoleDef { name: string; short: string; color: string; motto: (d: string) => string }
export const ROLES: RoleDef[] = [
  { name: '住宅（子育て）', short: '住宅', color: '#4f9a5a', motto: d => `${d}は、保育園・学校・公園の近くに子育て世帯が住み続けられる住宅地にする` },
  { name: '中心市街地（商業・業務）', short: '中心', color: '#c3312b', motto: d => `${d}は、駅を中心に店・オフィス・高層住宅を集め、街の顔にする` },
  { name: '産業・物流', short: '産業', color: '#5a6066', motto: d => `${d}は、工場・物流と、ごみ処理場・火葬場などの施設を住宅から離して置く` },
  { name: '観光・歴史・文化', short: '観光', color: '#b07a2a', motto: d => `${d}は、寺社や城、ランドマークで市外から人を呼ぶ` },
  { name: '自然・保全', short: '自然', color: '#2f6b3a', motto: d => `${d}は、林と水辺を守り、公園やキャンプ場で楽しむ` },
  { name: '郊外住宅（ゆとり）', short: '郊外', color: '#7a9a4a', motto: d => `${d}は、ゆとりのある戸建てと農地の、落ち着いた住宅地にする` },
];
export const ROLE = { home: 0, center: 1, industry: 2, tourism: 3, nature: 4, suburb: 5 } as const;

const INDUSTRY = new Set(['factory', 'logistics', 'smallFactory', 'industrialPark', 'foodFactory', 'battery', 'semicon', 'pharma', 'port', 'ic', 'coalPower', 'lngPower', 'nuclear', 'wasteL', 'waste', 'shipyard', 'market']);

/** 地区ごとの数え上げから役割を決める */
export function makePlan(s: GameState): NonNullable<GameState['plan']> {
  const m = getMap(s.seed), D = DISTRICTS.length;
  const f = Array.from({ length: D }, () => ({ tiles: 0, free: 0, nature: 0, station: 0, hh: 0, ind: 0, nat: 0, shop: 0 }));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y), d = m.district[i]; if (d >= D) continue;
    const o = f[d]; o.tiles++;
    if (m.forest[i] || m.steep[i] || m.water[i]) o.nature++;
    else if (!s.occ[i] && !s.road[i] && buildable(m, i)) o.free++;
    if (s.road[i] === 3) o.nat++;
  }
  for (const b of s.buildings) {
    const i = idx(b.x, b.y), d = m.district[i]; if (d >= D) continue;
    const o = f[d];
    if (b.kind === 'station') o.station++;
    else if (isRes(b.kind)) o.hh += (b.hh ?? []).reduce((a, v) => a + v, 0);
    else if (INDUSTRY.has(b.kind)) o.ind++;
    else if (fam(b.kind) === 'shop') o.shop++;
  }
  const roles = new Array(D).fill(-1);
  const pick = (score: (d: number) => number, role: number, min = -Infinity) => {
    let best = -1, bv = min;
    for (let d = 0; d < D; d++) if (roles[d] < 0 && f[d].tiles > 20) { const v = score(d); if (v > bv) { bv = v; best = d; } }
    if (best >= 0) roles[best] = role;
    return best;
  };
  pick(d => f[d].station * 100 + f[d].shop * 3 + f[d].hh * 0.01, ROLE.center);
  pick(d => f[d].ind * 6 + f[d].nat * 0.6 + f[d].free * 0.05 - f[d].hh * 0.004 - f[d].nature / f[d].tiles * 20, ROLE.industry);
  pick(d => f[d].nature / f[d].tiles - f[d].station * 0.3, ROLE.tourism); // 駅のある地区は観光より街の中心に
  pick(d => f[d].nature / f[d].tiles - 0.45, ROLE.nature, 0); // 林と水辺が半分近い地区がもう 1 つあれば、自然を守る地区に
  for (let d = 0; d < D; d++) if (roles[d] < 0) roles[d] = f[d].hh >= 150 || f[d].free < 60 ? ROLE.home : ROLE.suburb;
  if (!roles.includes(ROLE.home)) { const d = roles.indexOf(ROLE.suburb); if (d >= 0) roles[d] = ROLE.home; }
  return { vision: s.vision ?? 'industry', roles, made: s.month };
}
/** 計画（なければ・古ければ作り直す） */
export function cityPlan(s: GameState): NonNullable<GameState['plan']> {
  if (!s.plan || s.plan.roles.length !== DISTRICTS.length || s.month - s.plan.made >= 120) s.plan = makePlan(s);
  return s.plan;
}
/** 区画の地区の役割 */
export function roleAt(s: GameState, i: number): number {
  const p = s.plan; if (!p) return -1;
  return p.roles[getMap(s.seed).district[i]] ?? -1;
}
/** 計画の説明（画面に出す） */
export function planText(s: GameState): { vision: string; districts: { name: string; role: string; color: string; motto: string }[] } {
  const p = s.plan; if (!p) return { vision: '', districts: [] };
  const v = VISIONS.find(o => o.id === (s.vision ?? p.vision));
  return { vision: v ? `${v.name}：${v.desc}` : '', districts: DISTRICTS.map((n, d) => { const r = ROLES[p.roles[d]] ?? ROLES[0]; return { name: n, role: r.name, color: r.color, motto: r.motto(n) }; }) };
}
void DEFS;
