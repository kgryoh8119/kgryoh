// 建物の形（収集ツール v4）を持つデータの取り込みと描画の経路を試す：保土ケ谷のデータに仮の形を付ける
import fs from 'fs';
import { importCollected } from '../src/mapgen/importer.ts';
const src = JSON.parse(fs.readFileSync('data/hodogaya-data.json', 'utf8'));
let k = 0;
for (const b of src.buildings) { k++; const big = b.t === 'apartments' || b.t === 'school' || b.t === 'commercial'; b.w = big ? 30 + (k % 7) * 3 : 7 + (k % 4); b.d = big ? 14 : 6 + (k % 3); b.a = (k * 37) % 180; }
src.footprints = true; src.version2 = 4;
const { map, report } = importCollected(src, { id: 'shapes', name: '形つきテスト' });
console.log(report.lines.slice(-4).join('\n'), 'bldShape' in map);
fs.writeFileSync(process.env.OUT!, JSON.stringify(map));
