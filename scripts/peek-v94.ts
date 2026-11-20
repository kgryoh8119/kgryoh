// v94：財政の課題の候補の並びを見る（赤字・一時借入の街）。npx esbuild scripts/peek-v94.ts --bundle --platform=node --format=esm --outfile=/tmp/p.mjs && node /tmp/p.mjs
import { newGame, stepMonth, monthlyIssues } from '../src/sim/index';
import { trialOptions } from '../src/sim/report';
import '../src/sim/wire';
const s = newGame(); s.tutorial.done = true; for (let m = 0; m < 3; m++) stepMonth(s);
for (const l of s.ledger) l.operating = -400; s.cash = 500;
s.loans.push({ principal: 8000, remaining: 8000, rate: 0.04, months: 24, kind: 'temp' });
const iss = monthlyIssues(s).find(i => i.key === 'fiscal')!;
for (const o of trialOptions(s, iss)) console.log(o.label, '|', o.fit?.toFixed(2), o.fitNote ?? '', '|', o.side ?? '', '|', o.note.slice(0, 40), o.cost ?? '');
