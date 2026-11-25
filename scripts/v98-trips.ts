// v98：住民の移動の描画の下調べ（sampleTrips の時間・移動中の人数・休日の過ごし方の内訳）
// 実行：npx esbuild scripts/v98-trips.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && node /tmp/t.mjs
import { newGame, stepMonth, seedForTerrain } from '../src/sim/index';
import { people, sampleTrips } from '../src/sim/people';
import { residentPlan } from '../src/render/residents';
import { recompute } from '../src/sim/core';
import '../src/sim/wire';
const s = newGame({ seed: seedForTerrain(process.env.TERR ?? 'coast', 261011) }); s.tutorial.done = true;
for (let m = 0; m < Number(process.env.MONTHS ?? 96); m++) { stepMonth(s); s.events.active = []; s.notes = []; s.goalPick = false; s.pendingElection = null; }
if (process.env.K) { for (const b of s.buildings) if (b.hh) b.hh = b.hh.map(v => v * Number(process.env.K)); recompute(s); }
const p = people(s); console.log('人口', p.n);
let cx = 0, cy = 0, cn = 0; for (const b of s.buildings) if (b.hh) { cx += b.x; cy += b.y; cn++; } cx /= Math.max(1, cn); cy /= Math.max(1, cn);
for (const h of [7.5, 8, 12, 17.5, 22]) {
  const t0 = performance.now(); const tr = sampleTrips(s, h, 1200); const t1 = performance.now();
  let mv = 0; for (let i = 0; i < p.n; i++) { if (p.mode[i] === 255) continue; const tt = Math.max(0.1, p.dist[i] / [4.5, 12, 15, 35, 25][p.mode[i]]); if ((h >= p.depart[i] && h < p.depart[i] + tt) || (h >= p.back[i] && h < p.back[i] + tt)) mv++; }
  const t2 = performance.now(); const pl = residentPlan(s, h, false, cx, cy, 24); const t3 = performance.now(); const ph = residentPlan(s, h, true, cx, cy, 24);
  console.log(`${h}時 sample ${tr.length}件 ${(t1 - t0).toFixed(1)}ms 移動中 ${mv}人 | 計画 平日 ${pl.trips.length}件 見える ${pl.visible.map(v => Math.round(v)).join('/')} ${(t3 - t2).toFixed(1)}ms 休日 ${ph.trips.length}件 見える ${ph.visible.map(v => Math.round(v)).join('/')}`);
}
const hol = [0, 0, 0, 0, 0]; for (let i = 0; i < p.n; i++) hol[p.hol[i]]++; console.log('休日', hol.join('/'), '通院', p.clinic.reduce((a, b) => a + b, 0));
