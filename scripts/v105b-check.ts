// v105b：送り迎え・集団登校・バス停で待つ人・公園の利用・駅へ歩く人の数を、絵なしで確かめる。
// 実行：npx vite-node scripts/v105b-check.ts（TERR=coast MONTHS=96 K=1：地形・進める月数・世帯の倍率）
import { newGame, stepMonth, seedForTerrain, W } from '../src/sim/index';
import { people, weekdayLegs, busWaiting, ESC_NAMES } from '../src/sim/people';
import { parkByHour, OUT_NAMES } from '../src/sim/leisure';
import { residentPlan, stationFlow } from '../src/render/residents';
import { recompute } from '../src/sim/core';
import '../src/sim/wire';
const s = newGame({ seed: seedForTerrain(process.env.TERR ?? 'coast', 261011) }); s.tutorial.done = true;
for (let m = 0; m < Number(process.env.MONTHS ?? 96); m++) { stepMonth(s); s.events.active = []; s.notes = []; s.goalPick = false; s.pendingElection = null; }
if (process.env.K) { for (const b of s.buildings) if (b.hh) b.hh = b.hh.map(v => v * Number(process.env.K)); recompute(s); }
const p = people(s), L = weekdayLegs(s);
console.log('人口', p.n, '区間', L.legs.length, 'バス停', (s.busStops ?? []).length);
// 1) 未就学児
let pre = 0, att = 0; const kAm = [0, 0, 0, 0, 0], kPm = [0, 0, 0, 0, 0];
for (let i = 0; i < p.n; i++) if (p.role[i] === 0) { pre++; if (p.dest[i] >= 0) { att++; kAm[p.escKAm[i]]++; kPm[p.escKPm[i]]++; } }
console.log(`未就学児 ${pre} 人、園に通う ${att} 人。送り：${ESC_NAMES.map((n, k) => k ? `${n} ${kAm[k]}` : '').filter(Boolean).join('・')}／迎え：${ESC_NAMES.map((n, k) => k ? `${n} ${kPm[k]}` : '').filter(Boolean).join('・')}`);
const alone = L.legs.filter(l => l.role === 0 && l.mode !== 2).length; console.log('未就学児が先に立つ（一人の）区間', alone);
// 2) 集団登校
const grp = L.legs.filter(l => l.why === '集団登校'); let gk = 0; for (const g of grp) gk += 1 + g.with.length;
let ew = 0; for (let i = 0; i < p.n; i++) if (p.role[i] === 1 && p.mode[i] === 0 && p.dest[i] >= 0) ew++;
console.log(`集団登校 ${grp.length} 班・${gk} 人（歩いて通う小学生 ${ew} 人。1 班 平均 ${(gk / Math.max(1, grp.length)).toFixed(1)} 人）`);
// 3) バス停
for (const h of [7, 7.5, 8, 8.5, 12, 17.5]) { const w = busWaiting(s, h); let t = 0; for (const v of w.values()) t += v; console.log(`バス停で待つ ${h}時：合計 ${t} 人（${[...w.entries()].slice(0, 6).map(([k, v]) => `${k}:${v}`).join(' ')}）`); }
let busRiders = 0; for (let i = 0; i < p.n; i++) if (p.mode[i] === 2 || (p.mode[i] === 3 && p.access[i] === 2)) busRiders++; console.log('バスに乗る住民', busRiders, '待つ記録', L.waits.length);
// 4) 公園
for (const d of [0, 2, 5, 6]) { const a = parkByHour(s, d); console.log(`公園（${['月', '火', '水', '木', '金', '土', '日'][d]}）時刻ごと：` + a.map((v, h) => `${h}:${v}`).filter((_, h) => h >= 6 && h <= 21).join(' ')); }
for (let k = 0; k < OUT_NAMES.length; k++) { const a = parkByHour(s, 0, k), b = parkByHour(s, 5, k); console.log(`  ${OUT_NAMES[k]}：平日 10時 ${a[10]}・16時 ${a[16]}・7時 ${a[7]}・20時 ${a[20]}／土曜 10時 ${b[10]}・13時 ${b[13]}`); }
// 5) 駅
const fl = stationFlow(s, 8, false); console.log('駅 8 時の 1 時間あたりの乗車（住民）', [...fl.now.entries()].map(([k, v]) => `${k}:${v}`).join(' '), '朝の乗車', [...fl.am.entries()].map(([k, v]) => `${k}:${v}`).join(' '));
const st = s.buildings.find(b => b.kind === 'station' && b.status === 'operating');
if (st) for (const h of [7.5, 8]) { const pl = residentPlan(s, h, false, st.x, st.y, 24, 3600); const toSt = pl.trips.filter(t => t.dest === st.id); const rings = [0, 0, 0, 0];
  for (const t of toSt) { const q = t.prog, at = t.path?.length ? t.path[Math.min(t.path.length - 1, Math.floor(q * t.path.length))] : Math.round(t.from % W + (t.to % W - t.from % W) * q) + W * Math.round(((t.from / W) | 0) + (((t.to / W) | 0) - ((t.from / W) | 0)) * q); const d = Math.abs(at % W - st.x) + Math.abs(((at / W) | 0) - st.y); rings[d < 4 ? 0 : d < 9 ? 1 : d < 17 ? 2 : 3]++; }
  console.log(`${h}時 駅へ向かう見える住民`, toSt.length, '駅からの距離（区画）0-3/4-8/9-16/17+', rings.join('/'), '見える', pl.visible.join('/')); }
