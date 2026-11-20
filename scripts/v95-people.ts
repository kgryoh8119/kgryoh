// v95：住民一人ひとりの層の確認（既存の値との比べ・事故の件数の相場・計算の時間）
// 実行：npx esbuild scripts/v95-people.ts --bundle --platform=node --format=esm --outfile=/tmp/p.mjs && TERR=coast YEARS=5 node /tmp/p.mjs
import { newGame, stepMonth, seedForTerrain } from '../src/sim/index';
import { peopleStats, compareWithAggregate, monthlyIncidents, incidentYear, MODE_NAMES } from '../src/sim/people';
import { stationStats } from '../src/sim/big';
import { monthlyBudget } from '../src/sim/step';
import { recompute } from '../src/sim/core';
import '../src/sim/wire';

const env = process.env, terr = env.TERR ?? 'coast', Y = Number(env.YEARS ?? 5), K = Number(env.SCALEK ?? 1);
const s = newGame({ seed: seedForTerrain(terr, 261011) }); s.tutorial.done = true;
let tStep = 0, tPeople = 0;
for (let m = 0; m < Y * 12; m++) {
  const t0 = performance.now(); stepMonth(s); tStep += performance.now() - t0;
  s.events.active = []; s.notes = []; s.goalPick = false; s.pendingElection = null;
  const t1 = performance.now(); peopleStats(s); tPeople += performance.now() - t1;
}
if (K > 1) { for (const b of s.buildings) if (b.hh) b.hh = b.hh.map(v => v * K); recompute(s); }
const t2 = performance.now(); let st = peopleStats(s); const tOne = performance.now() - t2;
if (env.REP) { const t3 = performance.now(); for (let k = 0; k < Number(env.REP); k++) { s.bVersion++; st = peopleStats(s); } console.log('rep ms', ((performance.now() - t3) / Number(env.REP)).toFixed(1)); }
console.log(JSON.stringify({ terr, months: Y * 12, pop: Math.round(s.stats.pop), stepMs: +(tStep / (Y * 12)).toFixed(1), peopleMs: +(tPeople / (Y * 12)).toFixed(1), oneMs: +tOne.toFixed(1) }));
for (const r of compareWithAggregate(s)) console.log(`${r.label}\t住民 ${r.people}\t既存 ${r.agg}`);
const tot = st.modes.reduce((a, x) => a + x, 0);
console.log('手段', st.modes.map((v, i) => `${MODE_NAMES[i]} ${(100 * v / Math.max(1, tot)).toFixed(0)}%`).join(' '), `市内 ${st.localWork} 市外 ${st.outWork} 在宅 ${st.teleWork}`);
for (const x of stationStats(s)) console.log(`駅 ${x.name}\t住民の朝の乗車 ${st.boardings.get(x.b.id) ?? 0}\t既存の 1 日の乗降 ${x.riders}`);
const L = monthlyBudget(s);
console.log(`住民税\t住民 ${Math.round(st.taxResident)}\t既存 ${Math.round(L.taxResident)}`);
console.log('月の期待件数', Object.entries(st.expected).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' '));
const traffic = st.expected.car + st.expected.ped + st.expected.bike;
console.log(`交通事故 年 ${(traffic * 12).toFixed(1)} 件 → 10 万人あたり ${(traffic * 12 / Math.max(1, s.stats.pop) * 1e5).toFixed(0)} 件（全国の相場 約 250）`);
for (let m = 0; m < 12; m++) { monthlyIncidents(s); s.month++; }
console.log(JSON.stringify(incidentYear(s)));
if (env.DBG) for (const b of s.buildings.filter(b => b.kind === 'school' || b.kind === 'jhs')) console.log(b.kind, b.id, 'effCap', b.effCap, 'used', Math.round(b.used), '住民', st.enroll.get(b.id) ?? 0, b.status, b.connected);
