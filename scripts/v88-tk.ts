// v88：列車の車種ごとの面数と寸法（npx tsx scripts/v88-tk.ts）
import { makeTrains } from '../src/render/trainkit';
for (const q of [0, 1, 2]) { const T = makeTrains(q === 2 ? 10 : 8, q); console.log(q, Object.entries(T).map(([k, m]) => `${k}:${m.F.length}`).join(' ')); }
const T = makeTrains(10, 2); for (const k of ['ce', 'xe', 'de', 'me', 'ae', 'el', 'fc', 'sc'] as const) { const m = T[k]; console.log(k, JSON.stringify([0, 1, 2].map(i => { const v = m.V.map(p => p[i]); return [+Math.min(...v).toFixed(2), +Math.max(...v).toFixed(2)]; }))); }
