// v93：広げた土地の見た目の印（田んぼ = ・畑 + ・草地 , ・屋敷林 # ・空き地 _）を文字の地図で見る。T=地形
import { getMap, seedForTerrain } from '../src/sim/index';
import { W, H } from '../src/sim/config';
const t = process.env.T ?? 'coast'; const m = getMap(seedForTerrain(t));
const ch: Record<number, string> = { 0: '.', 2: '=', 6: '+', 7: ',', 8: '#', 9: '_' }; const cnt: Record<string, number> = {};
const rows: string[] = [];
for (let y = 0; y < H; y += 2) { let r = ''; for (let x = 0; x < W; x += 2) { const i = y * W + x; r += m.water[i] ? '~' : m.forest[i] ? 'T' : (ch[m.deco?.[i] ?? 0] ?? '?'); } rows.push(r); }
for (let i = 0; i < W * H; i++) { const k = String(m.deco?.[i] ?? 0); cnt[k] = (cnt[k] ?? 0) + 1; }
console.log(rows.join('\n')); console.log(JSON.stringify(cnt));
