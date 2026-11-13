// 市役所の人事・地価と固定資産税の評価替え・バス路線網・ひとりひとりの住民（代表の住民を一人ずつ動かす）（v29）
// 状態は s.pol の exec / land / routes / cit に持つ。ここは core.ts を読み込まない（core.ts が効果を読むため）
import type { GameState, Building, Result } from './types';
import { NHH, DISTRICTS } from './types';
import { W, H, DEFS, isRes, isShop } from './config';
import { getMap, idx, inMap, NEIGH } from './map';
import { tsunamiDepth, designWave, hasSea } from './hazard';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const h32 = (a: number, b: number, c = 0) => { let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b + c * 0x27d4eb2d, 0xc2b2ae35); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; return (x >>> 0) / 4294967296; };
const SEI = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '小川', '岡田', '後藤'];
const MEI_M = ['健一', '大輔', '翔太', '拓也', '直樹', '誠', '浩二', '和也', '亮', '悠斗', '蓮', '湊', '陽翔', '颯太', '樹', '隆', '博', '勇'];
const MEI_F = ['美咲', '陽子', '恵', '由美', '彩', '真由美', '久美子', '愛', '結衣', '陽菜', '凛', '葵', '芽依', '紬', 'さくら', '和子', '幸子', '洋子'];
const pickH = <T,>(a: readonly T[], r: number) => a[Math.floor(r * a.length) % a.length];
/** 住民の乱数：街の乱数（s.rng）の並びを変えないよう、地図の種と月から別に作る */
let cr = 1; const citRng = (s: GameState) => { cr = (Math.imul(s.seed ^ 0x5bd1e995, 31) + s.month * 7919 + 12345) | 0; return () => { cr = (cr + 0x6d2b79f5) | 0; let t = Math.imul(cr ^ (cr >>> 15), cr | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ================================================================ 人事
export type PostDef = { id: string; name: string; desc: string; council?: boolean };
export const POSTS: PostDef[] = [
  { id: 'deputy', name: '副市長', desc: '市長を支え、議会と調整する。支持率と、会派との関係が少しずつよくなる。議会の同意が要る。', council: true },
  { id: 'plan', name: '政策企画部長', desc: '街の売り込みと移住の窓口。転入と知名度。' },
  { id: 'fin', name: '財政部長', desc: '経費の見直し。事務費と維持費が下がる。' },
  { id: 'urban', name: '都市整備部長', desc: '工事の発注と管理。建設費が下がる。' },
  { id: 'kids', name: '子ども福祉部長', desc: '保育と介護。子育て世帯と高齢世帯の満足。' },
  { id: 'risk', name: '危機管理監', desc: '防災と災害対応。災害の被害が小さくなる。' },
];
export type Officer = { name: string; age: number; from: string; skill: number; salary: number; since: number };
const FROM = [['市の職員（生え抜き）', 0, 0], ['県からの出向', 1, 40], ['国（省庁）からの出向', 2, 60], ['民間から登用', 2, 90]] as const;
/** その年の候補（毎年 4 月に入れかわる。地図の種と年で決まる） */
export function candidates(s: GameState, post: number): Officer[] {
  const y = Math.floor(s.month / 12), out: Officer[] = [];
  for (let k = 0; k < 3; k++) {
    const r = (q: number) => h32(s.seed + post * 977 + k * 31, y * 13 + q, 5), f = FROM[k === 0 ? 0 : 1 + Math.floor(r(1) * 3)];
    const skill = clamp(Math.round(1 + r(2) * 3 + f[1] * 0.6), 1, 5);
    out.push({ name: `${pickH(SEI, r(3))} ${pickH(r(4) < 0.5 ? MEI_M : MEI_F, r(5))}`, age: 45 + Math.floor(r(6) * 15), from: f[0], skill, salary: f[2] + skill * 10, since: s.month });
  }
  return out;
}
export function execOf(s: GameState): (Officer | null)[] {
  const p = s.pol as any; if (!p) return POSTS.map(() => null);
  if (!p.exec) p.exec = POSTS.map((_, k) => ({ ...candidates(s, k)[0], skill: 2, salary: 0, from: '市の職員（生え抜き）', since: -12 }));
  return p.exec;
}
const sk = (s: GameState, id: string) => { const k = POSTS.findIndex(p => p.id === id), o = (s.pol as any)?.exec?.[k] as Officer | null | undefined; return o ? o.skill - 2 : 0; }; // ★2（生え抜きのふつうの幹部）が基準。★1 は少しマイナス
export function execAdd(s: GameState, key: string): number {
  if (!s.pol) return 0;
  if (key === 'approval') return 0.003 * sk(s, 'deputy');
  if (key === 'fame') return 0.6 * sk(s, 'plan');
  if (key === 'sat:2') return 0.0015 * sk(s, 'kids');
  if (key === 'sat:4') return 0.0015 * sk(s, 'kids');
  return 0;
}
export function execMul(s: GameState, key: string): number {
  if (!s.pol) return 1;
  if (key === 'inflow') return 1 + 0.005 * sk(s, 'plan');
  if (key === 'prices') return 1 - 0.005 * sk(s, 'fin');
  if (key === 'costMul') return 1 - 0.01 * sk(s, 'urban');
  if (key === 'disasterDmg') return 1 - 0.015 * sk(s, 'risk');
  return 1;
}
/** 幹部の給与（万円/月。生え抜きは市の人件費に含まれるので 0） */
export const execCost = (s: GameState) => ((s.pol as any)?.exec ?? []).reduce((a: number, o: Officer | null) => a + (o?.salary ?? 0), 0);

// ================================================================ 地価と固定資産税
export type Land = { base: number; avg: number; dk: number[]; at: number; hist: { y: number; avg: number }[] };
const LAND_CACHE = new WeakMap<GameState, { k: string; v: Float32Array }>();
/** 区画ごとの地価（万円/㎡）。駅に近い・店が多い・満足が高い・人が多いほど高く、津波の浸水が深いほど安い */
export function landPrices(s: GameState): Float32Array {
  const key = `${s.month}:${s.bVersion}:${s.roadVersion}`, c = LAND_CACHE.get(s); if (c && c.k === key) return c.v;
  const N = W * H, v = new Float32Array(N), m = getMap(s.seed);
  const st = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating'), shops = s.buildings.filter(b => b.status === 'operating' && (isShop(b.kind) || ['biz', 'industry', 'commerce'].includes(DEFS[b.kind]?.cat as string)));
  // 満足（住宅の平均）を粗い格子で
  const G = 6, gw = Math.ceil(W / G), gh = Math.ceil(H / G), gs = new Float32Array(gw * gh), gn = new Float32Array(gw * gh);
  for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating' && b.hh) { let n = 0, a = 0; for (let t = 0; t < NHH; t++) { n += b.hh[t]; a += b.hh[t] * (b.sat[t] ?? 0.6); } const g = Math.floor(b.y / G) * gw + Math.floor(b.x / G); gs[g] += a; gn[g] += n; }
  const ts = hasSea(s) ? tsunamiDepth(s, designWave(s)) : null, pop = Math.max(1000, s.stats.pop);
  const scale = 4 + 10 * Math.sqrt(pop / 10000);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y); if (m.water[i]) continue;
    let ds = 99; for (const b of st) ds = Math.min(ds, Math.abs(b.x - x) + Math.abs(b.y - y));
    let sh = 0; for (const b of shops) if (Math.abs(b.x - x) + Math.abs(b.y - y) <= 6) sh++;
    const g = Math.floor(y / G) * gw + Math.floor(x / G), sat = gn[g] > 0 ? gs[g] / gn[g] : 0.6;
    let p = scale * (0.35 + 1.4 * Math.exp(-ds / 9)) * (1 + 0.06 * Math.min(10, sh)) * (0.7 + 0.6 * sat) * (s.road[i] || s.occ[i] ? 1 : 0.8);
    if (ts && ts[i] > 0.3) p *= 1 - Math.min(0.35, 0.05 * ts[i]); // 浸水が想定される土地は安い
    if (m.steep[i]) p *= 0.6;
    v[i] = Math.round(p * 10) / 10;
  }
  LAND_CACHE.set(s, { k: key, v }); return v;
}
/** 住宅のある区画の地価の平均と、地区ごとの平均 */
function landSummary(s: GameState): { avg: number; dist: number[] } {
  const v = landPrices(s), m = getMap(s.seed), nd = DISTRICTS.length, a = new Array(nd).fill(0), n = new Array(nd).fill(0); let A = 0, Nn = 0;
  for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating') { const i = idx(b.x, b.y), d = m.district[i] ?? 0; a[d] += v[i]; n[d]++; A += v[i]; Nn++; }
  const avg = Nn ? A / Nn : 0; return { avg, dist: a.map((x, k) => (n[k] ? x / n[k] : avg)) };
}
export function landOf(s: GameState): Land | undefined {
  const p = s.pol as any; if (!p) return undefined;
  if (!p.land) { const r = landSummary(s); p.land = { base: Math.max(1, r.avg), avg: r.avg, dk: r.dist.map(() => 1), at: Math.floor(s.month / 36) * 36, hist: [{ y: Math.floor(s.month / 12), avg: Math.round(r.avg * 10) / 10 }] }; }
  return p.land;
}
/** 3 年ごとの評価替え（4 月）：地価に合わせて固定資産税の課税標準を見直す。急に上がりすぎないよう、上げ幅は 1 回 15% まで */
function landMonthly(s: GameState): void {
  const L = landOf(s); if (!L) return;
  if (s.month % 12 !== 0) return;
  const r = landSummary(s); L.avg = Math.round(r.avg * 10) / 10; L.hist.push({ y: Math.floor(s.month / 12), avg: L.avg }); if (L.hist.length > 30) L.hist.shift();
  if (s.month - L.at >= 36) {
    const old = L.dk.reduce((a, b) => a + b, 0) / L.dk.length;
    L.dk = r.dist.map((v, k) => Math.round(clamp(v / L.base, Math.max(0.6, (L.dk[k] ?? 1) * 0.85), (L.dk[k] ?? 1) * 1.15) * 1000) / 1000);
    L.at = s.month; const now = L.dk.reduce((a, b) => a + b, 0) / L.dk.length;
    s.notes.push(`🏠 固定資産税の評価替え（3 年に 1 回）：地価に合わせて課税標準を見直しました（平均 ${now >= old ? '+' : ''}${Math.round((now / old - 1) * 100)}%）。住宅地の地価は平均 ${L.avg} 万円/㎡`);
  }
}
/** その住宅の固定資産税の倍率（地区の評価） */
export function landK(s: GameState, b: Building): number { const L = (s.pol as any)?.land as Land | undefined; if (!L) return 1; const d = getMap(s.seed).district[idx(b.x, b.y)] ?? 0; return L.dk[d] ?? 1; }

// ================================================================ バス路線網
export type Route = { a: number; b: number; freq: number; path: number[]; stops: number[]; name: string };
export const FREQ = ['1 時間に 1 本', '30 分に 1 本', '15 分に 1 本', '10 分に 1 本'];
export const MAX_ROUTES = 6, FARE = 0.022; // 運賃（万円/人。220 円）
/** 道路をたどる最短の道（区画の列）。つながっていなければ空 */
export function roadPath(s: GameState, a: number, b: number): number[] {
  if (!s.road[a] || !s.road[b]) return [];
  const N = W * H, prev = new Int32Array(N).fill(-1), q = [a]; prev[a] = a;
  for (let k = 0; k < q.length; k++) { const i = q[k]; if (i === b) break; const x = i % W, y = (i / W) | 0; for (const [dx, dy] of NEIGH) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const j = idx(xx, yy); if (prev[j] < 0 && s.road[j]) { prev[j] = i; q.push(j); } } }
  if (prev[b] < 0) return [];
  const out = [b]; for (let i = b; i !== a; i = prev[i]) out.push(prev[i]); return out.reverse();
}
export type RouteStat = { riders: number; fare: number; cost: number; cover: number; elder: number };
const RS = new WeakMap<GameState, { k: string; v: RouteStat[]; near: Float32Array }>();
/** 路線ごとの利用者（人/月）・運賃収入・運行費（万円/月）・沿線の世帯 */
export function routeStats(s: GameState): { v: RouteStat[]; near: Float32Array } {
  const rs: Route[] = (s.pol as any)?.routes ?? [], key = `${s.month}:${s.bVersion}:${s.roadVersion}:${rs.map(r => `${r.a}-${r.b}-${r.freq}`).join(',')}`, c = RS.get(s); if (c && c.k === key) return c;
  const near = new Float32Array(W * H), v: RouteStat[] = [];
  for (const r of rs) {
    let cover = 0, elder = 0; const fk = [0.5, 0.8, 1, 1.15][r.freq] ?? 0.8;
    for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating' && b.hh && r.stops.some(t => Math.abs((t % W) - b.x) + Math.abs(((t / W) | 0) - b.y) <= 4)) {
      const n = b.hh.reduce((a, x) => a + x, 0); cover += n; elder += b.hh[4]; const i = idx(b.x, b.y); near[i] = Math.max(near[i], fk);
    }
    const riders = Math.round((cover * 2.2 + elder * 3) * fk * (0.6 + 0.08 * Math.min(10, r.stops.length)));
    v.push({ riders, fare: Math.round(riders * FARE), cost: Math.round(r.path.length * (r.freq + 1) * 0.55 + 20), cover: Math.round(cover), elder: Math.round(elder) });
  }
  const out = { k: key, v, near }; RS.set(s, out); return out;
}
/** 自動車を使う割合の倍率（住宅の区画ごと）：本数の多い路線の沿線ほど車に乗らない */
export const routeCarK = (s: GameState, i: number) => { const n = (s.pol as any)?.routes?.length ? routeStats(s).near[i] : 0; return n ? 1 - 0.09 * n : 1; };
/** 路線の赤字（運行費 − 運賃。万円/月） */
export const routeDeficit = (s: GameState) => ((s.pol as any)?.routes?.length ? routeStats(s).v.reduce((a, r) => a + r.cost - r.fare, 0) : 0);
export function routeAdd(s: GameState, key: string): number {
  if (!(s.pol as any)?.routes?.length) return 0;
  const v = routeStats(s).v, el = v.reduce((a, r) => a + r.elder, 0), tot = s.stats.hhByType[4] || 1;
  if (key === 'sat:4') return Math.min(0.02, 0.02 * el / tot);
  if (key === 'sat:all') return Math.min(0.006, 0.0015 * v.length);
  return 0;
}

// ================================================================ ひとりひとりの住民（代表の住民。街の人を一人ずつ追う）
export type Cit = { id: number; name: string; sex: 'm' | 'f'; age: number; home: number; job: number; mar: boolean; kids: number; born: number; mood: number; log: { m: number; t: string }[]; gone?: string };
export const CIT_N = 80;
const jobsOf = (s: GameState) => s.buildings.filter(b => b.status === 'operating' && b.connected && ((DEFS[b.kind].jobs ?? 0) > 0 || DEFS[b.kind].staffReq > 0) && !isRes(b.kind));
const resOf = (s: GameState) => s.buildings.filter(b => isRes(b.kind) && b.status === 'operating' && b.hh && b.hh.some(v => v >= 0.5));
const satOf = (b: Building) => { let n = 0, a = 0; for (let t = 0; t < NHH; t++) { n += b.hh?.[t] ?? 0; a += (b.hh?.[t] ?? 0) * (b.sat[t] ?? 0.6); } return n > 0 ? a / n : 0.6; };
const logc = (c: Cit, m: number, t: string) => { c.log.push({ m, t }); if (c.log.length > 8) c.log.shift(); };
function newCit(s: GameState, id: number, home: Building, moveIn: boolean, r: () => number): Cit {
  const sex = r() < 0.5 ? 'm' : 'f', t = (() => { const hh = home.hh!, sum = hh.reduce((a, b) => a + b, 0); let x = r() * sum; for (let k = 0; k < NHH; k++) { x -= hh[k]; if (x <= 0) return k; } return 0; })();
  const age = [22 + r() * 14, 27 + r() * 18, 28 + r() * 12, 35 + r() * 14, 66 + r() * 20][t];
  const c: Cit = { id, name: `${pickH(SEI, r())} ${pickH(sex === 'm' ? MEI_M : MEI_F, r())}`, sex, age: Math.round(age * 10) / 10, home: home.id, job: -1, mar: t >= 1, kids: t === 2 || t === 3 ? 1 + (r() < 0.4 ? 1 : 0) : 0, born: s.month, mood: satOf(home), log: [] };
  const js = jobsOf(s); if (c.age < 65 && js.length && r() < 0.85) c.job = js[Math.floor(r() * js.length)].id;
  logc(c, s.month, moveIn ? `${DEFS[home.kind].name}に引っ越してきた` : `${DEFS[home.kind].name}で暮らしている`);
  return c;
}
export function citsOf(s: GameState): Cit[] {
  const p = s.pol as any; if (!p) return [];
  if (!p.cit) { const res = resOf(s); p.cit = []; p.citId = 1; if (res.length) { const r = citRng(s); for (let k = 0; k < CIT_N; k++) p.cit.push(newCit(s, p.citId++, res[Math.floor(r() * res.length)], false, r)); } }
  return p.cit;
}
function citMonthly(s: GameState): void {
  const p = s.pol as any, cs = citsOf(s); if (!cs.length) return;
  const byId = new Map(s.buildings.map(b => [b.id, b])), res = resOf(s), js = jobsOf(s), r = citRng(s), m = s.month;
  for (const c of cs) {
    if (c.gone) continue;
    c.age = Math.round((c.age + 1 / 12) * 100) / 100;
    const home = byId.get(c.home);
    if (!home || home.status !== 'operating') { // 家がなくなった
      const to = res.length ? res[Math.floor(r() * res.length)] : undefined;
      if (to) { c.home = to.id; logc(c, m, `家がなくなり、${DEFS[to.kind].name}へ移った`); } else { c.gone = '家がなくなり市外へ'; logc(c, m, '家がなくなり、市外へ引っ越した'); }
      continue;
    }
    c.mood = Math.round((c.mood * 0.7 + satOf(home) * 0.3) * 1000) / 1000;
    const job = c.job >= 0 ? byId.get(c.job) : undefined;
    if (c.job >= 0 && (!job || job.status !== 'operating')) { c.job = -1; logc(c, m, `勤め先（${job ? DEFS[job.kind].name : '会社'}）がなくなり、仕事を探している`); }
    if (c.job < 0 && c.age >= 18 && c.age < 65 && js.length && r() < 0.25) { const j = js[Math.floor(r() * js.length)]; c.job = j.id; logc(c, m, `${DEFS[j.kind].name}で働きはじめた`); }
    if (c.job >= 0 && c.age >= 65 && r() < 0.08) { c.job = -1; logc(c, m, '定年で仕事を退いた'); }
    if (!c.mar && c.age >= 24 && c.age < 45 && r() < 0.006) { c.mar = true; logc(c, m, '結婚した'); }
    if (c.mar && c.age < 44 && c.kids < 3 && r() < 0.006 * (c.kids ? 0.6 : 1) * (home.unmet > 1 ? 0.6 : 1)) { c.kids++; logc(c, m, `${c.kids === 1 ? '第一子' : c.kids === 2 ? '第二子' : '第三子'}が生まれた`); }
    // 暮らしに不満が続くと、市内のよりよい家か、市外へ
    // 転出の確率は、街全体の転出（月 0.6%・満足が低いほど高い）に合わせる。不満な人は、まず市内でよりよい家を探す
    if (c.mood < 0.6 && r() < 0.009 * (1 + 4 * Math.max(0, 0.6 - c.mood))) {
      const better = res.filter(b => b.id !== home.id && satOf(b) > c.mood + 0.08 && (b.units ?? 0) > b.hh!.reduce((a, x) => a + x, 0));
      if (better.length && r() < 0.6) { const to = better[Math.floor(r() * better.length)]; c.home = to.id; logc(c, m, `暮らしにくさから、${DEFS[to.kind].name}へ住みかえた`); }
      else { c.gone = '暮らしにくさから市外へ'; logc(c, m, '暮らしにくさから、市外へ引っ越した'); }
      continue;
    }
    if (c.age >= 75 && r() < 0.003 * (c.age - 70)) { c.gone = `${Math.floor(c.age)} 歳で亡くなった`; logc(c, m, `${Math.floor(c.age)} 歳で亡くなった`); }
  }
  // 去った人の代わりに、新しく引っ越してきた人を追う（同じ人数を保つ）。去った人は 1 年だけ一覧に残す
  p.cit = cs.filter((c: Cit) => !c.gone || m - (c.log.at(-1)?.m ?? 0) < 12);
  const live = p.cit.filter((c: Cit) => !c.gone).length;
  for (let k = live; k < CIT_N && res.length; k++) p.cit.push(newCit(s, p.citId++, res[Math.floor(r() * res.length)], true, r));
  if (p.cit.length > CIT_N + 40) p.cit.splice(0, p.cit.length - CIT_N - 40);
}

// ================================================================ 毎月と操作
export function adminMonthly(s: GameState): void { execOf(s); landMonthly(s); citMonthly(s); }
export function adminAct(s: GameState, a: { op: string; id?: string; n?: number }, spend: (amount: number, what: string) => Result | null, councilOK: () => boolean): Result | null {
  const p = s.pol as any;
  if (a.op === 'appoint') {
    const k = a.n ?? -1, ci = Number(a.id ?? -1); if (k < 0 || k >= POSTS.length || !(ci >= 0 && ci < 3)) return { ok: false, msg: '人事の指定が不正です' };
    const ex = execOf(s), cur = ex[k]; if (cur && s.month - cur.since < 12) return { ok: false, msg: `${POSTS[k].name}は任命から 1 年たつまで替えられません（あと ${12 - (s.month - cur.since)} か月）` };
    if (POSTS[k].council && !councilOK()) return { ok: false, msg: '副市長の選任には議会の同意が要ります。いまは賛成が過半数に届きません（会派と意見交換を）' };
    const o = candidates(s, k)[ci]; ex[k] = { ...o, since: s.month };
    if (o.from.includes('出向')) p.pref = Math.min(1, (p.pref ?? 0.5) + 0.05);
    return { ok: true, msg: `${POSTS[k].name}に${o.name}氏（${o.from}・手腕 ${'★'.repeat(o.skill)}）を任命しました${o.salary ? `（給与 月 ${o.salary} 万円）` : ''}` };
  }
  if (a.op === 'route') {
    const [x, y] = String(a.id ?? '').split('-').map(Number), stops = s.busStops ?? [];
    if (!stops.includes(x) || !stops.includes(y) || x === y) return { ok: false, msg: '起点と終点は、別々のバス停を選んでください' };
    const rs: Route[] = p.routes ?? (p.routes = []); if (rs.length >= MAX_ROUTES) return { ok: false, msg: `路線は ${MAX_ROUTES} 本までです` };
    const path = roadPath(s, x, y); if (path.length < 2) return { ok: false, msg: 'その 2 つのバス停は、道路でつながっていません' };
    const on = new Set(path), st = stops.filter(t => on.has(t)), freq = clamp(a.n ?? 1, 0, 3);
    const e = spend(300, '路線の開設'); if (e) return e;
    const d = getMap(s.seed).district, name = `${DISTRICTS[d[x]] ?? ''}〜${DISTRICTS[d[y]] ?? ''}線`;
    rs.push({ a: x, b: y, freq, path, stops: st, name });
    return { ok: true, msg: `バス路線「${name}」を開きました（${st.length} 停留所・${(path.length * 0.03 * 1000 / 1000).toFixed(1)}km・${FREQ[freq]}）` };
  }
  if (a.op === 'unroute' || a.op === 'freq') {
    const rs: Route[] = p.routes ?? [], k = Number(a.id ?? -1), r = rs[k]; if (!r) return { ok: false, msg: 'その路線はありません' };
    if (a.op === 'unroute') { rs.splice(k, 1); s.modifiers.push({ key: 'approval', op: 'add', v: -0.008, until: s.month + 6, cost: 0, src: `${r.name}の廃止` }); return { ok: true, msg: `「${r.name}」を廃止しました（沿線から反対の声も）` }; }
    r.freq = clamp(a.n ?? 1, 0, 3); return { ok: true, msg: `「${r.name}」を${FREQ[r.freq]}にしました` };
  }
  return null;
}
/** 路線の道は道路が変わると作り直す（道路が切れたら止める） */
export function syncRoutes(s: GameState): void {
  const rs: Route[] | undefined = (s.pol as any)?.routes; if (!rs) return;
  for (const r of rs) if (r.path.some(i => !s.road[i])) { const p = roadPath(s, r.a, r.b); r.path = p; const on = new Set(p); r.stops = (s.busStops ?? []).filter(t => on.has(t)); }
  (s.pol as any).routes = rs.filter(r => r.path.length >= 2 && (s.busStops ?? []).includes(r.a) && (s.busStops ?? []).includes(r.b));
}
export const ADMIN_OPS = ['appoint', 'route', 'unroute', 'freq'];
export function validAdmin(x: any): string | null {
  const fin = (v: unknown, a: number, b: number) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b, isO = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (x.exec !== undefined && !(Array.isArray(x.exec) && x.exec.length === POSTS.length && x.exec.every((o: any) => o === null || (isO(o) && typeof o.name === 'string' && o.name.length < 40 && fin(o.skill, 1, 5) && fin(o.salary, 0, 1000) && fin(o.since, -1e6, 1e6))))) return '人事のデータが不正です';
  if (x.land !== undefined && !(isO(x.land) && fin(x.land.base, 0, 1e5) && Array.isArray(x.land.dk) && x.land.dk.length <= 20 && x.land.dk.every((v: unknown) => fin(v, 0.1, 10)) && Array.isArray(x.land.hist) && x.land.hist.length <= 40)) return '地価のデータが不正です';
  if (x.routes !== undefined && !(Array.isArray(x.routes) && x.routes.length <= MAX_ROUTES && x.routes.every((r: any) => isO(r) && fin(r.freq, 0, 3) && Array.isArray(r.path) && r.path.length <= W * H && r.path.every((i: unknown) => fin(i, 0, W * H - 1)) && Array.isArray(r.stops) && typeof r.name === 'string'))) return 'バス路線のデータが不正です';
  if (x.cit !== undefined && !(Array.isArray(x.cit) && x.cit.length <= CIT_N + 40 && x.cit.every((c: any) => isO(c) && typeof c.name === 'string' && c.name.length < 40 && fin(c.age, 0, 130) && Array.isArray(c.log) && c.log.length <= 8))) return '住民のデータが不正です';
  return null;
}
