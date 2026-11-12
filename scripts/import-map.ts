// 実在都市の取り込み（Node 版）。集めたデータ（data/<id>-data.json）を public/maps/<id>.json に変換する。
// 使い方: node scripts/import-map.ts <id> [入力ファイル]
import fs from 'fs';
import { importCollected } from '../src/mapgen/importer.ts';
import { mapEntry } from '../src/maps/registry.ts';

const [, , id = 'hodogaya', inPath = `data/${id}-data.json`] = process.argv;
const e = mapEntry(id);
const src = JSON.parse(fs.readFileSync(inPath, 'utf8'));
const t0 = performance.now();
const { map } = importCollected(src, { id, name: e ? `${e.area}（${e.name}）` : (src.area ?? id), districts: e?.districts, hints: e?.hints, log: m => console.log(m) });
const out = `public/maps/${id}.json`;
fs.writeFileSync(out, JSON.stringify(map));
console.log(`出力 ${out} ${(fs.statSync(out).size / 1e6).toFixed(2)} MB（${Math.round(performance.now() - t0)} ms）`);
