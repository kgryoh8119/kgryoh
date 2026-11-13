// @ts-nocheck
import { test } from 'vitest';
import { newGame, dispatch, serialize, deserialize, W, DEFS } from '../src/sim/index';
import { writeFileSync } from 'node:fs';
// v86：民間の建物（戸建て・アパート・マンション・店など）を見本として並べたセーブを作る（OUT=保存先 で実行したときだけ）。scripts/v86-bldg.mjs で撮る
test.skipIf(!process.env.OUT)('bldg lineup', () => {
  const s = newGame({ seed: Number(process.env.SEED ?? 1) }); s.cash += 1e10; s.fame = 100; s.month = 15 * 12; s.tutorial.done = true;
  const K: [string, number][] = [];
  for (let i = 0; i < 10; i++) K.push(['house', 0.03 + i * 0.097]);
  for (let i = 0; i < 4; i++) K.push(['apartment', 0.11 + i * 0.23]);
  for (let i = 0; i < 3; i++) K.push(['mansion', 0.17 + i * 0.29]);
  for (let i = 0; i < 3; i++) K.push(['shop', 0.07 + i * 0.31]);
  for (const k of ['bakery', 'konbini', 'cafe', 'drugstore']) K.push([k, 0.4]);
  for (let i = 0; i < 2; i++) K.push(['officeS', 0.2 + i * 0.4]);
  for (let i = 0; i < 2; i++) K.push(['smallFactory', 0.3 + i * 0.4]);
  // 空いた所に東西の道を 1 本引き、道の南北に 1 区画ずつ並べる（道の向こうから撮れるように）
  const st = s.buildings.find(b => b.kind === 'station')!, L = 14; let best = null;
  for (let r = 6; r < 40 && !best; r++) for (let dy = -r; dy <= r && !best; dy++) for (let dx = -r; dx <= r && !best; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x0 = st.x + dx, y0 = st.y + dy; if (x0 < 2 || y0 < 3 || x0 + L + 2 >= W || y0 + 3 >= W) continue;
    const t = structuredClone(s), tiles = []; for (let i = -1; i <= L; i++) tiles.push(y0 * W + x0 + i);
    if (!dispatch(t, { type: 'road', tiles, road: 1 }).ok || tiles.some(i => !t.road[i])) continue;
    const got = []; for (const yy of [y0 + 1, y0 - 1]) for (let i = 0; i < L; i++) if (dispatch(t, { type: 'build', kind: 'libraryS', x: x0 + i, y: yy }).ok) got.push(t.buildings.at(-1)); else break;
    if (got.length >= K.length) best = [t, got];
  }
  const [t, got] = best; Object.assign(s, t);
  const out: [string, number, number][] = [];
  K.forEach(([k, v], n) => { const b = got[n]; b.kind = k; b.v = v; b.status = 'operating'; b.remain = 0; b.builtMonth = s.month;
    const d = DEFS[k]; delete b.staff; delete b.staffTarget; if (d.units) { b.units = d.units; b.hh = [1, 1, 0, 0, 1]; } if (d.fixed) b.lossStreak = 0; if (d.staffReq) { b.staff = 0; b.staffTarget = 0; }
    out.push([k, v, b.y * W + b.x]); });
  s.roadVersion++; s.bVersion++;
  const txt = serialize(s), chk = deserialize(txt); if (!chk.ok) throw new Error(chk.msg);
  writeFileSync(process.env.OUT!, txt); writeFileSync(process.env.OUT + '.json', JSON.stringify(out));
  console.log('placed', out.length, JSON.stringify(out));
}, 900000);
