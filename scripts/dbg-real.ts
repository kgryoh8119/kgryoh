import { newGame, serialize } from '../src/sim/index';
const s = newGame();
const t = serialize(s), d = JSON.parse(t);
console.log(t.length, Object.keys(d), Object.keys(d.state ?? d));
const st = d.state ?? d;
for (const k of Object.keys(st)) { const l = JSON.stringify(st[k]).length; if (l > 20000) console.log(k, l); }
console.log(JSON.stringify(st.buildings.find((b: any) => b.osm)));
