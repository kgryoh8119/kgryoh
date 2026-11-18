import { it } from 'vitest';
import { newGame, stepMonth, dispatch, monthlyIssues } from '../src/sim/index';
import { housingBlocked } from '../src/sim/wire';
import { compareTrial, trialOptions } from '../src/sim/report';
// @ts-ignore
import { appendFileSync } from 'fs';
const L = (...a: any[]) => appendFileSync('/tmp/claude-0/-home-user-kgryoh/db117c36-08bd-58a4-8d39-8de15d2a23a8/scratchpad/out.txt', a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ') + '\n');
const run = (s: any, n: number) => { for (let i = 0; i < n; i++) { stepMonth(s); for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: 0 } as any); s.pendingElection = null; } };
it('scratch', () => {
  const s = newGame(); run(s, 12);
  const cap = (t: string) => { const st = s.stats; L(t, 'water', Math.round(st.waterCap), Math.round(st.waterDemand), 'sewage', Math.round(st.sewageCap), Math.round(st.sewageDemand), 'power', Math.round(st.powerCap), Math.round(st.powerDemand), 'pentUp', st.pentUp, 'blocked:', housingBlocked(s)); };
  cap('m12');
  const w = s.buildings.filter(b => b.kind.startsWith('water')).sort((a, b) => b.age - a.age)[0];
  L('renew', dispatch(s, { type: 'renew', id: w.id } as any));
  run(s, 4); cap('m16');
  const iss = monthlyIssues(s); L(iss.map(i => i.key));
  const st = iss.find(i => ['traffic', 'sat:0', 'care', 'housing'].includes(i.key))!;
  const up = trialOptions(s, st).find(o => /容積を上げる/.test(o.label))!;
  L('warn', up.warn);
  run(s, 8); cap('m24');
}, 200000);
