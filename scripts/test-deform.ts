// まちづくり版の生成と、1〜2 年動かしたときの様子（node 用）。OUT を指定すると地図を書き出す
import fs from 'fs';
import { deformMap } from '../src/mapgen/deform.ts';
import { setMap, newGame, stepMonth, validateState, dispatch, W, H, getMap, buildable, landReason } from '../src/sim/index.ts';
const id = process.argv[2] ?? 'hodogaya';
const raw = JSON.parse(fs.readFileSync(process.env.IN ?? `public/maps/${id}.json`, 'utf8'));
const t0 = performance.now();
const { map, report } = deformMap(raw, { id: id + '-d' });
console.log(report.lines.join('\n'), `(${Math.round(performance.now() - t0)}ms, ${(JSON.stringify(map).length / 1e6).toFixed(2)}MB)`);
if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(map));
setMap(id + '-d', JSON.parse(JSON.stringify(map)));
const s = newGame();
const st = () => `pop ${Math.round(s.stats.pop)} 世帯 ${Math.round(s.buildings.reduce((a, b) => a + (b.hh ? b.hh.reduce((x, y) => x + y, 0) : 0), 0))} wait ${Math.round(s.stats.waitlist)} vc ${s.stats.maxVc.toFixed(2)} sat ${s.stats.sat.toFixed(2)} cash ${Math.round(s.cash)} 建物 ${s.buildings.length} 未接続 ${s.buildings.filter(b => !b.connected).length} 空き用途 ${s.zone.filter((z, i) => z && !s.occ[i]).length}`;
console.log(`W${W} H${H}`, 'start', st(), validateState(s) ?? 'valid');
let ms = 0;
for (let m = 1; m <= 24; m++) { const a = performance.now(); stepMonth(s); ms += performance.now() - a; if (m % 12 === 0) console.log('m' + m, st(), validateState(s) ?? 'valid'); }
console.log('month avg ms', (ms / 24).toFixed(1), 'ledger last', JSON.stringify(s.ledger.at(-1)));
const kinds: Record<string, number> = {}; for (const b of s.buildings) kinds[b.kind] = (kinds[b.kind] ?? 0) + 1; console.log(kinds);
{ const m = getMap(s.seed); const i = 2882; console.log('tile', i, i % W, (i / W) | 0, 'road', s.road[i], 'buildable', buildable(m, i), landReason(m, i), 'W', W, 'N', s.road.length); }
{ const res = s.buildings.filter(b => b.hh && b.status === 'operating'); const avg = [0, 1, 2, 3, 4, 5].map(k => (res.reduce((a, b) => a + b.sv[k], 0) / res.length).toFixed(2)); console.log('sv 保育,学校,公園,消防,買物,通勤', avg.join(' '), 'water', s.stats.waterDemand, s.stats.waterCap, 'waste', s.stats.wasteDemand, s.stats.wasteCap); }
console.log('railCrowd', s.stats.railCrowd, 'stations', s.buildings.filter(b => b.kind === 'station').map(b => `${b.name}:${b.used}/${b.effCap}${b.connected ? '' : '(未接続)'}`).join(' '));
{ const t = s.rail!.map((v, i) => v ? i : -1).filter(i => i >= 0); const r = dispatch(s, { type: 'unrail', tiles: t.slice(0, 3) }); console.log('unrail', r.msg); const r2 = dispatch(s, { type: 'rail', tiles: t.slice(0, 3), level: 1 }); console.log('rail', r2.msg, validateState(s) ?? 'valid'); }
