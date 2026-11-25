// v99：歳入の比べ。8 地形のはじめの街と Y 年後（何もしない打ち手、または STRAT=auto）で、住民税・事業の税・交付税と、住民から積み上げた住民税の内訳を出す
// 実行：npx esbuild scripts/v99-tax.ts --bundle --platform=node --format=esm --outfile=/tmp/t.mjs && YEARS=10 node /tmp/t.mjs
import { newGame, stepMonth, dispatch, eventDef, seedForTerrain, monthlyBudget, transferParts } from '../src/sim/index';
import { autoTurn } from '../src/autoplay';
import { taxBase, WAGE_IDS } from '../src/sim/taxbase';
import { peopleStats } from '../src/sim/people';
import '../src/sim/wire';
import type { GameState } from '../src/sim/types';
const env = process.env, Y = Number(env.YEARS ?? 10), terrs = (env.TERRS ?? 'coast,inland,rural,river,lake,mountain,urban,island').split(',');
const row = (s: GameState, terr: string, y: number) => {
  const L = monthlyBudget(s), t = taxBase(s), tp = transferParts(s, L), st = peopleStats(s);
  const w = t.work as Record<string, { n: number; tax: number }>;
  return {
    terr, y, pop: Math.round(s.stats.pop), res: Math.round(L.taxResident), base: Math.round(t.tax), people: Math.round(st.taxResident), prop: Math.round(L.taxProperty), biz: Math.round(L.taxBusiness), kofu: Math.round(tp.kofu), grants: Math.round(tp.grants),
    rev: Math.round(L.taxResident + L.taxProperty + L.taxBusiness + L.transfer + (L.fees ?? 0) + (L.taxStay ?? 0)), op: Math.round(L.operating),
    senior: Math.round(t.senior.tax), nSenior: Math.round(t.senior.n), work: Object.fromEntries(WAGE_IDS.filter(g => w[g].n > 0.5).map(g => [g, [Math.round(w[g].n), Math.round(w[g].tax)]])),
  };
};
for (const terr of terrs) {
  const s = newGame({ seed: seedForTerrain(terr, 261011) }); s.difficulty = 'normal'; s.tutorial.done = true;
  console.log(JSON.stringify(row(s, terr, 0)));
  for (let m = 0; m < Y * 12 && !s.over; m++) {
    if (env.STRAT === 'auto') autoTurn(s);
    stepMonth(s);
    for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 });
    if (s.goalPick) dispatch(s, { type: 'goals', ids: ['wait', 'pop', 'fiscal'] });
    if (s.pendingElection) { if (!s.pendingElection.win) { s.mode = 'term'; s.termStart = s.month; s.goalPick = true; } s.pendingElection = null; }
    s.notes = [];
  }
  console.log(JSON.stringify(row(s, terr, Y)));
}
