// 取り込みの頑健性：海が多い・駅がない・浄水場がない・地区の指定がない地図を、保土ケ谷のデータから作って確かめる
import fs from 'fs';
import { importCollected } from '../src/mapgen/importer.ts';
import { setMap, newGame, stepMonth, validateState, dispatch } from '../src/sim/index.ts';
const src = JSON.parse(fs.readFileSync('data/hodogaya-data.json', 'utf8'));
const d = src.dem;
// 南東の 4 割を海にする（標高 null、建物・道路・施設を消す）
const seaLat = src.bbox.s + (src.bbox.n - src.bbox.s) * 0.45, seaLon = src.bbox.w + (src.bbox.e - src.bbox.w) * 0.45;
for (let r = 0; r < d.rows; r++) for (let c = 0; c < d.cols; c++) { const lat = src.bbox.n - r * (10 / 111320), lon = src.bbox.w + c * (10 / (111320 * Math.cos(35.46 * Math.PI / 180))); if (lat < seaLat && lon > seaLon) d.values[r * d.cols + c] = null; }
const inSea = (lat: number, lon: number) => lat < seaLat && lon > seaLon;
src.buildings = src.buildings.filter((b: any) => !(b.lat != null && inSea(b.lat, b.lon)));
src.osm.elements = src.osm.elements.filter((e: any) => {
  if (e.tags?.railway === 'station' || e.tags?.man_made || /浄水|工場/.test(e.tags?.name ?? '')) return false;
  const g = e.geometry ?? (e.lat != null ? [{ lat: e.lat, lon: e.lon }] : e.center ? [e.center] : []);
  return !g.some((p: any) => p && inSea(p.lat, p.lon));
});
const { map, report } = importCollected(src, { id: 'test', name: 'テスト', log: m => console.log(' ', m) });
console.log('assumed:', report.assumed); if (process.env.OUT) fs.writeFileSync(process.env.OUT, JSON.stringify(map));
setMap('test', JSON.parse(JSON.stringify(map)));
const s = newGame();
console.log('pop', Math.round(s.stats.pop), 'wait', Math.round(s.stats.waitlist), 'vc', s.stats.maxVc.toFixed(2), 'cash', s.cash);
for (let m = 0; m < 12; m++) stepMonth(s);
console.log('after 12', Math.round(s.stats.pop), 'valid:', validateState(s) ?? 'ok');
// 海の上には建てられない
const W = map.W, sea = (W - 5) + (map.H - 5) * W;
console.log('build on sea →', dispatch(s, { type: 'build', kind: 'park', x: W - 5, y: map.H - 5 }).msg, sea);
