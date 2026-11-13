// v88：無人島の地形を文字で確かめる（~ 海・水 : 砂浜 ^ 岩場 T 森 / 急斜面 . 平地）
import { getMap, seedForTerrain, buildable, W, H } from '../src/sim/index';
const m = getMap(seedForTerrain(process.env.TERRAIN ?? 'castaway'));
let out = '', land = 0, bu = 0;
for (let y = 0; y < H; y += 2) { let r = ''; for (let x = 0; x < W; x++) { const i = y * W + x; r += m.water[i] ? '~' : m.deco![i] === 1 ? ':' : m.deco![i] === 3 ? '^' : m.forest[i] ? 'T' : m.steep[i] ? '/' : '.'; } out += r + '\n'; }
for (let i = 0; i < W * H; i++) { if (!m.water[i]) land++; if (buildable(m, i)) bu++; }
console.log(out, 'land', land, 'buildable', bu);
