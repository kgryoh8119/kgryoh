// @ts-nocheck
import { test } from 'vitest';
import { newGame, dispatch, checkPlace, DEFS, serialize, W } from '../src/sim/index';
import { readFileSync, writeFileSync } from 'node:fs';
// 見本の街のセーブを作る（OUT=保存先 で実行したときだけ）
test.skipIf(!process.env.OUT)('showcase', () => {
  const cfg = readFileSync('src/sim/config.ts', 'utf8'); const seg = cfg.slice(cfg.indexOf('// ---- v49'), cfg.indexOf('// ---- v48'));
  const K = [...seg.matchAll(/\n  (\w+): \{/g)].map(m => m[1]).reverse();
  const s = newGame({ seed: Number(process.env.SEED ?? 1) }); s.cash += 1e10; s.fame = 100; s.month = 15 * 12; s.tutorial.done = true;
  const st = s.buildings.find(b => b.kind === 'station')!; const out: [string, number][] = []; const fail: string[] = [];
  for (const k of K) { let ok = false;
    for (let r = 2; r < 70 && !ok; r++) for (let dy = -r; dy <= r && !ok; dy++) for (let dx = -r; dx <= r && !ok; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = st.x + dx, y = st.y + dy; if (checkPlace(s, k as any, x, y).level === 'error') continue; ok = dispatch(s, { type: 'build', kind: k as any, x, y }).ok; if (ok) { const b = s.buildings.at(-1)!; b.status = 'operating'; b.remain = 0; out.push([k, (b.y + (b.h >> 1)) * W + b.x + (b.w >> 1)]); } }
    if (!ok) fail.push(k); }
  s.roadVersion++; s.bVersion++;
  writeFileSync(process.env.OUT!, serialize(s)); writeFileSync(process.env.OUT + '.json', JSON.stringify(out));
  console.log('placed', out.length, 'of', K.length, 'fail', fail.join(','));
}, 900000);
