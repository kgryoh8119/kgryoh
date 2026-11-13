// @ts-nocheck
import { test } from 'vitest';
import { appendFileSync } from 'node:fs';
import { newGame, stepMonth, monthlyBudget, seedForTerrain, W } from '../src/sim/index';
import { autoTurn } from '../src/autoplay';
test('b2', () => {
  const s = newGame({ seed: seedForTerrain('coast') }); s.tutorial.done = true;
  for (let m = 0; m < 6; m++) { const notes = autoTurn(s); stepMonth(s); appendFileSync(process.env.BOUT, `W${W} m${m} cash ${Math.round(s.cash)} ${JSON.stringify(monthlyBudget(s))}\n  auto: ${notes.map(n => String(n.text ?? n)).join(' | ').slice(0, 1500)}\n`); }
}, 600000);
