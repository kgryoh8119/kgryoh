// オートで長く回して、発展が止まる原因を探る。YEARS=年数 SEED=種
import { getMap, buildable, idx, W, H, newGame, stepMonth, eventDef, monthlyBudget, DEFS, serialize, isCity, initLocks, levelOf } from '../src/sim/index';
import { autoResolve, autoEvent, autoTurn } from '../src/autoplay';
import { writeFileSync } from 'node:fs';
const Y = Number(process.env.YEARS ?? 60), s = newGame(process.env.SEED ? { seed: Number(process.env.SEED) } : {});
if (process.env.LOCK) initLocks(s);
autoResolve(s);
const t0 = Date.now(); const notes: Record<string, number> = {};
for (let m = 0; m < Y * 12; m++) {
  stepMonth(s); autoResolve(s); autoEvent(s, eventDef); for (const n of autoTurn(s)) { const k = String((n as any).text ?? n).split(/[（：]/)[0].replace(/[0-9,]+/g, 'N').slice(0, 24); notes[k] = (notes[k] ?? 0) + 1; }
  const DF = Number(process.env.DF ?? 1e9) * 12;
  if (m >= DF && m % 3 === 2) { const st = s.stats as any; console.log(`m${m} pop ${st.pop.toFixed(0)} cash ${s.cash.toFixed(0)} op ${monthlyBudget(s).operating.toFixed(0)} sat ${st.sat.toFixed(2)} vac ${st.vacancy.toFixed(3)} water ${st.waterDemand?.toFixed(0)}/${st.waterCap?.toFixed(0)} satType ${st.satType.map((v: number) => v.toFixed(2)).join(',')} lv ${st.lv.map((v: number) => v.toFixed(2)).join(',')} susp ${s.buildings.filter(b => b.status === 'suspended').map(b => b.kind).join(',')}`); }
  if (m % 60 === 59) {
    const st = s.stats, b = monthlyBudget(s), stop = s.buildings.filter(x => x.status === 'stopped' || (x as any).stopped).length;
    const susp = s.buildings.filter(x => x.status !== 'operating').reduce((a, x) => { a[x.status] = (a[x.status] ?? 0) + 1; return a; }, {} as Record<string, number>);
    { const B: any = b; console.log('   budget', ['taxResident','taxProperty','taxBusiness','transfer','fees','admin','upkeep','wages','subsidy','roads','policy','interest'].map(k => `${k}:${Math.round(B[k] ?? 0)}`).join(' '), 'cityB', s.buildings.filter(x => isCity(x.kind)).length, 'roads', s.road.filter(Boolean).length); }
    console.log(`y${((m + 1) / 12).toFixed(0)} jobs ${st.localJobs.toFixed(0)}/${st.workers.toFixed(0)} ${s.mode} t${s.term} pop ${st.pop.toFixed(0)} cash ${s.cash.toFixed(0)} debt ${st.debt.toFixed(0)} net ${b.net?.toFixed?.(0) ?? ''} op ${b.operating.toFixed(0)} sat ${st.sat.toFixed(2)} wait ${st.waitlist.toFixed(0)} vac ${st.vacancy.toFixed(3)} tax ${JSON.stringify(s.tax)} nurs ${s.buildings.filter(b => b.kind.startsWith("nursery")).length} st ${JSON.stringify(susp)} ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
}
writeFileSync(process.env.OUT ?? '/tmp/claude-0/-home-claude/e7073fb5-52fe-56f8-ba95-77529d928879/scratchpad/long.json', serialize(s));
console.log(Object.entries(notes).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${v} ${k}`).join('\n'));
{ const M = s.mayor; if (M) console.log('mayor', 'pts', M.pts, 'Lv', levelOf(M.pts), 'medals', Object.keys(M.medals).length, 'annex left', M.annex, 'annexed', M.annexed ?? 0, 'unlocked', JSON.stringify(s.unlocked ?? 'all'), 'ranks', M.ranks.map(r => `${r.year}:${r.total}${r.awards.length ? '★' : ''}`).join(' ')); }
