// v49：新しい施設（農林水産・工場・店・住まい）が置けて、時間を進めても壊れないこと。住まいには世帯が入居すること
import { test, expect } from 'vitest';
import { newGame, stepMonth, dispatch, checkPlace, DEFS, HOUSING_EXTRA, W } from '../src/sim/index';
const act = dispatch;
const NEW = (Object.keys(DEFS) as (keyof typeof DEFS)[]).filter(k => ['agri', 'industry', 'commerce', 'housing'].includes(DEFS[k].cat as string));
test('v49 の施設をまとめて置いて 3 年進める', () => {
  const s = newGame({ seed: 5 }); s.cash += 1e9; s.fame = 100;
  const st = s.buildings.find(b => b.kind === 'station')!; let placed = 0; const fail: string[] = [];
  for (const k of NEW) {
    let ok = false;
    for (let r = 2; r < 40 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = st.x + dx, y = st.y + dy; if (checkPlace(s, k, x, y).level === 'error') continue; ok = act(s, { type: 'build', kind: k, x, y }).ok; }
    if (ok) placed++; else fail.push(k);
  }
  expect(NEW.length).toBeGreaterThan(100);
  expect(placed).toBeGreaterThan(NEW.length * 0.8); // 水辺や幹線道路が要るものは置けないことがある
  for (let m = 0; m < 36; m++) { stepMonth(s); s.events.active = []; }
  console.log('placed', placed, '/', NEW.length, 'fail', fail.join(','));
  const homes = s.buildings.filter(b => HOUSING_EXTRA.has(b.kind) && b.status === 'operating');
  console.log('homes', s.buildings.filter(b => HOUSING_EXTRA.has(b.kind)).map(b => b.kind + ':' + b.status + ':' + (b.hh ?? []).reduce((x, y) => x + y, 0).toFixed(1)).join(' '));
  expect(homes.length).toBeGreaterThanOrEqual(3); // 道路につながらないまま空の住宅は 1 年で解体される
  expect(homes.reduce((a, b) => a + (b.hh ?? []).reduce((x, y) => x + y, 0), 0)).toBeGreaterThan(10);
  expect(Number.isFinite(s.cash) && Number.isFinite(s.stats.pop) && Number.isFinite(s.stats.households)).toBe(true);
  void W; console.log('placed', placed, '/', NEW.length, 'fail', fail.join(','));
}, 900000);
