// v95：オートの土地の使い方の計測。市の区域の中の建てられる区画のうち、使われている割合と、道路に面していない空き地の数
// 実行：npx esbuild scripts/v95-land.ts --bundle --platform=node --format=esm --outfile=/tmp/l.mjs && TERR=coast YEARS=10 node /tmp/l.mjs
import { newGame, stepMonth, dispatch, eventDef, seedForTerrain, W, H, idx, getMap, buildable, roadInfo, tempDebt, serialize } from '../src/sim/index';
import { isLocked } from '../src/sim/mayor';
import { autoTurn } from '../src/autoplay';
import { landSpare, planGrid, gridLog } from '../src/autodev';
import '../src/sim/wire';
import type { GameState } from '../src/sim/types';
import { writeFileSync } from 'fs';
const env = process.env;
const terr = env.TERR ?? 'coast', Y = Number(env.YEARS ?? 10), seed = Number(env.SEED ?? 261011), ord = Number(env.ORD ?? 1);
export function landStats(s: GameState) {
  const m = getMap(s.seed), conn = roadInfo(s).conn; let city = 0, used = 0, locked = 0, zonedStuck = 0, roadT = 0, inner = 0, inCity = 0, inUsed = 0;
  // v96：街の中（建物から 4 区画以内）の取り残された空き地。市の区域の大半は田畑・山林なので、全体の数より街の中の数を見る
  const nearB = new Uint8Array(W * H);
  for (const b of s.buildings) for (let y = b.y - 4; y < b.y + b.h + 4; y++) for (let x = b.x - 4; x < b.x + b.w + 4; x++) if (x >= 0 && y >= 0 && x < W && y < H) nearB[idx(x, y)] = 1;
  for (let i = 0; i < W * H; i++) {
    if (isLocked(s, i) || !buildable(m, i) || (s.rail?.[i] && s.railGrade?.[i] !== 2)) continue;
    city++; if (nearB[i]) { inCity++; if (s.road[i] || s.occ[i]) inUsed++; } if (s.road[i]) { roadT++; used++; continue; } if (s.occ[i]) { used++; continue; }
    const x = i % W, y = (i / W) | 0; let f = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && s.road[idx(xx, yy)] && conn[idx(xx, yy)]) f = true; }
    if (!f) { locked++; if (s.zone[i]) zonedStuck++; if (nearB[i]) inner++; }
  }
  return { city, inner, innerUsedPct: +(inUsed / Math.max(1, inCity) * 100).toFixed(1), usedPct: +(used / city * 100).toFixed(1), roadPct: +(roadT / city * 100).toFixed(1), noRoad: locked, zonedStuck };
}
const cc = (s: GameState) => { let n = 0, x = 0, y = 0; for (const b of s.buildings) if (b.units) { const h = b.units; n += h; x += b.x * h; y += b.y * h; } return n ? { x: Math.round(x / n), y: Math.round(y / n) } : { x: W >> 1, y: H >> 1 }; };
(globalThis as any).DBG = !!env.DBG;
const s = newGame({ seed: seedForTerrain(terr, seed) }); s.difficulty = 'normal'; s.tutorial.done = true; s.autoOrder = ord as 0;
const grid: number[] = []; let tempMo = 0; const short = { water: 0, sewage: 0, power: 0 }; let kosaiMax = 0;
// v97：駅（はじめの駅・鉄道会社の新駅・市の新駅）と、市が敷いた線路
const st0 = new Set(s.buildings.filter(b => b.kind === 'station').map(b => b.id)), cityStn: number[] = [];
const t0 = Date.now(); const rows: any[] = []; const words: Record<string, number> = {};
rows.push({ y: 0, pop: Math.round(s.stats.pop), blocks: s.unlocked?.length, ...landStats(s) });
for (let mo = 0; mo < Y * 12 && !s.over; mo++) {
  const r0 = s.road.slice(); const ts = autoTurn(s); if (ts.some(t => t.startsWith("計画的"))) for (let i = 0; i < W * H; i++) if (s.road[i] && !r0[i]) grid.push(i);
  for (const t of ts) { const k = t.replace(/[0-9,，．.]+/g, '#').slice(0, 14); words[k] = (words[k] ?? 0) + 1; }
  stepMonth(s);
  if (tempDebt(s) > 0) tempMo++;
  { const q = s.stats; if (q.waterCap < q.waterDemand) short.water++; if (q.sewageCap < q.sewageDemand) short.sewage++; if (q.powerCap < q.powerDemand) short.power++; kosaiMax = Math.max(kosaiMax, s.fiscal?.kosai ?? 0); }
  for (const t of ts) if (t.startsWith('新駅')) cityStn.push(mo);
  if (env.LOG) { const re = new RegExp(env.LOG); for (const t of ts) if (re.test(t)) console.log(mo, t.slice(0, 120)); const q = s.stats; if (env.TRACE) console.log(mo, 'cash', Math.round(s.cash), 'temp', Math.round(tempDebt(s)), 'sew', Math.round(q.sewageCap), Math.round(q.sewageDemand), 'wat', Math.round(q.waterCap), Math.round(q.waterDemand), 'pow', Math.round(q.powerCap), Math.round(q.powerDemand), 'op', Math.round(s.ledger.at(-1)?.operating ?? 0), 'appr', s.approval.toFixed(2)); }
  for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 });
  if (s.goalPick) dispatch(s, { type: 'goals', ids: ['wait', 'pop', 'fiscal'] });
  if (s.pendingElection) { if (!s.pendingElection.win) { s.mode = 'term'; s.termStart = s.month; s.goalPick = true; } s.pendingElection = null; }
  s.notes = [];
  if (mo % (env.EVERY ? +env.EVERY : 24) === (env.EVERY ? +env.EVERY - 1 : 23)) rows.push({ y: (mo + 1) / 12, pop: Math.round(s.stats.pop), cash: Math.round(s.cash), op: Math.round(s.history.at(-1)?.op ?? 0), appr: +s.approval.toFixed(2), blocks: s.unlocked?.length, ...landStats(s), ...landSpare(s), vac: +s.stats.vacancy.toFixed(3), water: [Math.round(s.stats.waterCap), Math.round(s.stats.waterDemand), Math.round(s.stats.sewageCap)], pent: +s.stats.pentUp.toFixed(1), hh: Math.round(s.stats.households), grid: env.DBG ? planGrid(s, { x: 96, y: 84 })?.gain ?? null : undefined, near: landSpare(s, cc(s)).near });
}
const stNow = s.buildings.filter(b => b.kind === 'station');
console.log(JSON.stringify({ terr, seed, ord, short, kosaiMax, railCity: s.railCity?.length ?? 0, railAll: (s.rail ?? []).filter(v => v > 0).length, stNew: stNow.filter(b => !st0.has(b.id)).length, cityStn: cityStn.length, railDev: ((s as any).railDev?.lines ?? []).length, el: s.elections.map(e => +e.vote.toFixed(1)), tempMo, gridN: grid.length, gridTimes: words['計画的な宅地開発（'] ?? Object.entries(words).filter(([k]) => k.startsWith('計画的')).reduce((a, [, v]) => a + v, 0), pop: Math.round(s.stats.pop), ...landStats(s), gridLog, debt: Math.round(s.loans.reduce((a, l) => a + l.remaining, 0)), sec: Math.round((Date.now() - t0) / 1000) }));
for (const r of rows) console.log(JSON.stringify(r));
if (env.WORDS) console.log(Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v} ${k}`).join('\n'));
if (env.SAVE) writeFileSync(env.SAVE, JSON.stringify({ road: Array.from(s.road), occ: Array.from(s.occ, v => v ? 1 : 0), zone: Array.from(s.zone), grid, W, H }));
if (env.SAVEFULL) writeFileSync(env.SAVEFULL, serialize(s));
