// @ts-nocheck
import { test } from 'vitest';
import { appendFileSync } from 'node:fs';
const log = (...a: unknown[]) => appendFileSync(process.env.BOUT ?? '/dev/null', a.join(' ') + '\n');
import { newGame, stepMonth, dispatch, eventDef, seedForTerrain, TERRAINS, W, H } from '../src/sim/index';
import { autoTurn } from '../src/autoplay';
test('bench', () => {
  for (const t of TERRAINS) { const s = newGame({ seed: seedForTerrain(t.id) }); log('INIT', W, H, t.id, Math.round(s.stats.pop), s.buildings.length, s.road.filter(Boolean).length, s.cash); }
  for (const t of (process.env.TERRS ?? 'coast').split(',')) {
    const s = newGame({ seed: seedForTerrain(t) }); s.tutorial.done = true; const t0 = Date.now(); let st = 0;
    for (let m = 0; m < Number(process.env.YEARS ?? 20) * 12 && !s.over; m++) {
      try { autoTurn(s); } catch (e) { log('auto err', (e as Error).message); }
      const a = Date.now(); stepMonth(s); st += Date.now() - a; for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 });
      if (s.goalPick) dispatch(s, { type: 'goals', ids: ['wait', 'pop', 'fiscal'] });
      if (s.pendingElection) { s.pendingElection = null; if (s.mode === 'sandbox') dispatch(s, { type: 'rerun' }); }
      if (process.env.VERB && m % 24 === 23) log('  y', (m + 1) / 12, 'pop', Math.round(s.stats.pop), 'cash', Math.round(s.cash), 'roads', s.road.filter(Boolean).length, 'far', s.buildings.filter(b => b.x >= 76 || b.y >= 66).map(b => b.kind).join(','), 'farRoad', s.road.filter((r, i) => r && r !== 3 && (i % W >= 76 || i / W >= 66)).length, 'loans', s.loans.length);
      s.notes = [];
    }
    log('RUN', t, 'pop', Math.round(s.stats.pop), 'cash', Math.round(s.cash), 'total', Date.now() - t0, 'ms step', st, 'ms', 'over', !!s.over);
  }
}, 3600000);
