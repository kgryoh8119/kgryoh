// v95：オートの土地の使い方の計測。市の区域の中の建てられる区画のうち、使われている割合と、道路に面していない空き地の数
// 実行：npx esbuild scripts/v95-land.ts --bundle --platform=node --format=esm --outfile=/tmp/l.mjs && TERR=coast YEARS=10 node /tmp/l.mjs
import { newGame, stepMonth, dispatch, eventDef, seedForTerrain, W, H, idx, getMap, buildable, roadInfo } from '../src/sim/index';
import { isLocked } from '../src/sim/mayor';
import { autoTurn } from '../src/autoplay';
import '../src/sim/wire';
import type { GameState } from '../src/sim/types';
import { writeFileSync } from 'fs';
const env = process.env;
const terr = env.TERR ?? 'coast', Y = Number(env.YEARS ?? 10), seed = Number(env.SEED ?? 261011), ord = Number(env.ORD ?? 1);
export function landStats(s: GameState) {
  const m = getMap(s.seed), conn = roadInfo(s).conn; let city = 0, used = 0, locked = 0, zonedStuck = 0, roadT = 0;
  for (let i = 0; i < W * H; i++) {
    if (isLocked(s, i) || !buildable(m, i) || (s.rail?.[i] && s.railGrade?.[i] !== 2)) continue;
    city++; if (s.road[i]) { roadT++; used++; continue; } if (s.occ[i]) { used++; continue; }
    const x = i % W, y = (i / W) | 0; let f = false;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && s.road[idx(xx, yy)] && conn[idx(xx, yy)]) f = true; }
    if (!f) { locked++; if (s.zone[i]) zonedStuck++; }
  }
  return { city, usedPct: +(used / city * 100).toFixed(1), roadPct: +(roadT / city * 100).toFixed(1), noRoad: locked, zonedStuck };
}
const s = newGame({ seed: seedForTerrain(terr, seed) }); s.difficulty = 'normal'; s.tutorial.done = true; s.autoOrder = ord as 0;
const t0 = Date.now(); const rows: any[] = []; const words: Record<string, number> = {};
rows.push({ y: 0, pop: Math.round(s.stats.pop), blocks: s.unlocked?.length, ...landStats(s) });
for (let mo = 0; mo < Y * 12 && !s.over; mo++) {
  for (const t of autoTurn(s)) { const k = t.replace(/[0-9,，．.]+/g, '#').slice(0, 14); words[k] = (words[k] ?? 0) + 1; }
  stepMonth(s);
  for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 });
  if (s.goalPick) dispatch(s, { type: 'goals', ids: ['wait', 'pop', 'fiscal'] });
  if (s.pendingElection) { if (!s.pendingElection.win) { s.mode = 'term'; s.termStart = s.month; s.goalPick = true; } s.pendingElection = null; }
  s.notes = [];
  if (mo % 24 === 23) rows.push({ y: (mo + 1) / 12, pop: Math.round(s.stats.pop), cash: Math.round(s.cash), op: Math.round(s.history.at(-1)?.op ?? 0), appr: +s.approval.toFixed(2), blocks: s.unlocked?.length, ...landStats(s) });
}
console.log(JSON.stringify({ terr, seed, ord, el: s.elections.map(e => +e.vote.toFixed(1)), debt: Math.round(s.loans.reduce((a, l) => a + l.remaining, 0)), sec: Math.round((Date.now() - t0) / 1000) }));
for (const r of rows) console.log(JSON.stringify(r));
if (env.WORDS) console.log(Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v} ${k}`).join('\n'));
if (env.SAVE) writeFileSync(env.SAVE, JSON.stringify({ road: Array.from(s.road), occ: Array.from(s.occ, v => v ? 1 : 0), zone: Array.from(s.zone), W, H }));
