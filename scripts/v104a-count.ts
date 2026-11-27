// v104a：v104a-diag.mjs の書き出した位置を、足元の面（src/render/frontage.ts の surfaceAt）で数える。npx vite-node scripts/v104a-count.ts <json>
import fs from 'fs';
import { roadGeom } from '../src/render/farpath';
import { surfaceAt } from '../src/render/frontage';
import { GATEWAYS } from '../src/sim/index';
const d = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')), e = d.env;
const env = roadGeom(e.road, e.W, e.H, 30, new Set<number>(e.wide), new Set<number>(e.deck), GATEWAYS);
const front = new Map<number, number>(e.front);
const NAME = ['草地', '車道', '歩道・路側帯', '入口の通路', '敷地など'];
for (const k of ['peds', 'low', 'crowd'] as const) {
  const c = [0, 0, 0, 0, 0], cIn = [0, 0, 0, 0, 0];
  for (const f of d.frames) for (const p of f[k]) { const v = surfaceAt(env, e.road, e.H, p[0], p[1], front); (p[2] ? cIn : c)[v]++; }
  console.log(k, NAME.map((n, i) => `${n} ${c[i]}`).join('・'), k === 'peds' ? '／出入り中 ' + NAME.map((n, i) => `${n} ${cIn[i]}`).join('・') : '');
}
if (process.env.SHOW) { const seen = new Map<number, number>(); for (const p of d.frames[0][process.env.SHOW]) { if (surfaceAt(env, e.road, e.H, p[0], p[1], front) !== 0) continue; const t = Math.floor(p[1] / 30) * e.W + Math.floor(p[0] / 30); seen.set(t, (seen.get(t) ?? 0) + 1); }
  for (const [t, n] of seen) console.log('tile', t % e.W, (t / e.W) | 0, 'road', e.road[t], 'n', n, 'arms', [env.armHW(t, 1, 0), env.armHW(t, -1, 0), env.armHW(t, 0, 1), env.armHW(t, 0, -1)]); }
