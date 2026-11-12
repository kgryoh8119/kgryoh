// 強さの調整：オートで長く回し、地形・難易度ごとに破綻・当選・予算の否決・人口を数える
// TERRS=coast,... DIFF=normal YEARS=20
import { newGame, stepMonth, dispatch, eventDef, seedForTerrain, TERRAINS } from '../src/sim/index';
import { autoTurn } from '../src/autoplay';
const terrs = (process.env.TERRS ?? TERRAINS.map(t => t.id).join(',')).split(','), Y = Number(process.env.YEARS ?? 20), diff = (process.env.DIFF ?? 'normal') as 'normal';
for (const t of terrs) {
  const s = newGame({ seed: seedForTerrain(t) }); s.difficulty = diff; s.tutorial.done = true;
  const c = { pass: 0, fail: 0, flame: 0, grant: 0, rebuild: 0, early: 0, minCash: 1e12, lose: 0 };
  const t0 = Date.now();
  for (let m = 0; m < Y * 12 && !s.over; m++) {
    try { autoTurn(s); } catch (e) { console.log('auto err', (e as Error).message); }
    stepMonth(s); for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 });
    if (s.goalPick) dispatch(s, { type: 'goals', ids: ['wait', 'pop', 'fiscal'] });
    if (s.pendingElection) { if (!s.pendingElection.win) c.lose++; s.pendingElection = null; if (s.mode === 'sandbox') dispatch(s, { type: 'rerun' }); }
    for (const n of s.notes) { if (n.includes('可決されました')) c.pass++; if (n.includes('否決されました')) c.fail++; if (n.startsWith('🔥 炎上：')) c.flame++; if (n.includes('採択されました')) c.grant++; }
    s.notes = []; if (s.fiscal?.status === 'rebuild') c.rebuild++; if (s.fiscal?.status === 'early') c.early++; c.minCash = Math.min(c.minCash, s.cash);
  }
  const el = s.elections.map(e => (e.win ? 'W' : 'L') + e.vote.toFixed(0)).join(' ');
  console.log(`${t.padEnd(9)} pop ${Math.round(s.stats.pop).toString().padStart(6)} cash ${Math.round(s.cash).toString().padStart(8)} min ${Math.round(c.minCash)} appr ${s.approval.toFixed(2)} sat ${s.stats.sat.toFixed(2)} 予算 ${c.pass}/${c.pass + c.fail} 炎上 ${c.flame} 補助 ${c.grant} 早期健全化月 ${c.early} 再生月 ${c.rebuild} 選挙 ${el} over ${s.over ? 'Y' : '-'} ${Math.round((Date.now() - t0) / 1000)}s`);
}
