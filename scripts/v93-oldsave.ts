// v93：v91 の形の保存テキスト（住野市・128×112・版 2）を作る。v92 以降で読み込んで続きから遊べるかを画面で確かめるため。
// 新しく始めてオートで MONTHS か月進め、区画ごとの配列を 128×112 に切り詰め、市の区域の番号を 4×4 に戻す（tests/sim.test.ts の v91 の読込と同じ作り方）。
// 実行：npx esbuild scripts/v93-oldsave.ts --bundle --platform=node --format=esm --outfile=/tmp/o.mjs && node /tmp/o.mjs > old-v91.txt
import { newGame, stepMonth, dispatch, eventDef, seedForTerrain } from '../src/sim/index';
import { autoTurn } from '../src/autoplay';
import { W, H, FIC_V87_W, FIC_V87_H } from '../src/sim/config';
const s = newGame({ seed: seedForTerrain('coast') }); s.tutorial.done = true;
for (let m = 0; m < Number(process.env.MONTHS ?? 18); m++) {
  autoTurn(s); stepMonth(s);
  for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 });
  if (s.goalPick) dispatch(s, { type: 'goals', ids: ['wait', 'pop', 'fiscal'] });
  s.pendingElection = null;
}
const OW = FIC_V87_W, OH = FIC_V87_H, old: any = structuredClone(s);
const crop = (a: ArrayLike<number>) => { const o = new Array(OW * OH).fill(0); for (let y = 0; y < OH; y++) for (let x = 0; x < OW; x++) o[y * OW + x] = a[y * W + x]; return o; };
const cropped: string[] = [];
for (const k of Object.keys(old)) if (Array.isArray(old[k]) && old[k].length === W * H) { old[k] = crop(old[k]); cropped.push(k); }
// 市の区域：6×6 の番号 → 4×4 の番号（v91 の 128×112 では 1 区域 32×28 区画）
const bw6 = W / 6, bh6 = H / 6, toOld = (b: number) => { const cx = (b % 6 + 0.5) * bw6, cy = (Math.floor(b / 6) + 0.5) * bh6; return Math.floor(cy / (OH / 4)) * 4 + Math.floor(cx / (OW / 4)); };
if (old.unlocked) old.unlocked = [...new Set((old.unlocked as number[]).filter(b => (b % 6 + 0.5) * bw6 < OW && (Math.floor(b / 6) + 0.5) * bh6 < OH).map(toOld))].sort((a, b) => a - b);
// 建物・バス停などが広げた土地にあれば古い地図に収まらないので、外のものは落とす
old.buildings = old.buildings.filter((b: any) => b.x + b.w <= OW && b.y + b.h <= OH);
// 区画の番号は 128 列の番号に戻す（src/sim/save.ts の widenFiction の逆）
const inOld = (t: number) => t % W < OW && Math.floor(t / W) < OH, inv = (t: number) => (Number.isInteger(t) && t >= 0 && t < W * H ? Math.floor(t / W) * OW + t % W : t);
const list = (a: unknown) => (Array.isArray(a) ? a.filter(inOld).map(inv) : a);
for (const k of ['tunnel', 'bridge', 'overpass', 'footbridge', 'canal', 'busStops', 'levee', 'wide', 'flyover', 'railCity']) if (Array.isArray(old[k])) old[k] = list(old[k]);
if (old.streets) for (const k of Object.keys(old.streets)) old.streets[k] = list(old.streets[k]);
if (old.pol?.routes) old.pol.routes = old.pol.routes.filter((r: any) => inOld(r.a) && inOld(r.b) && (r.path ?? []).every(inOld)).map((r: any) => ({ ...r, a: inv(r.a), b: inv(r.b), path: list(r.path), stops: list(r.stops) }));
for (const v of old.voices ?? []) if (v && typeof v.tile === 'number') v.tile = inOld(v.tile) ? inv(v.tile) : -1;
if (old.roadBoost) { const o: Record<string, number> = {}; for (const [k, v] of Object.entries(old.roadBoost)) if (inOld(Number(k))) o[String(inv(Number(k)))] = v as number; old.roadBoost = o; }
old.events.active = []; old.scheduled = [];
if (Array.isArray(old.terraH)) { const o = old.terraH, out = new Array((OW + 1) * (OH + 1)).fill(0); for (let y = 0; y <= OH; y++) for (let x = 0; x <= OW; x++) out[y * (OW + 1) + x] = o[y * (W + 1) + x] ?? 0; old.terraH = out; }
process.stderr.write(`month ${s.month} pop ${Math.round(s.stats.pop)} cropped ${cropped.join(',')} unlocked ${JSON.stringify(old.unlocked)} H ${H}\n`);
console.log(JSON.stringify({ format: 'sumucity-save', version: 2, savedAt: old.month, mapId: 'sumino', state: old }));
// 念のため、この場で読み込んで 3 か月進め、状態の検査を通るかを stderr に出す
{ const { deserialize } = await import('../src/sim/save'); const { validateState } = await import('../src/sim/validate');
  const r = deserialize(JSON.stringify({ format: 'sumucity-save', version: 2, savedAt: old.month, mapId: 'sumino', state: old }));
  if (!r.ok) process.stderr.write('LOAD NG ' + (r as any).error + '\n');
  else { const n = r.state; for (let m = 0; m < 3; m++) stepMonth(n); process.stderr.write(`LOAD OK road ${n.road.length} pop ${Math.round(n.stats.pop)} b ${n.buildings.length}/${s.buildings.length} validate ${validateState(n) ?? 'ok'} finite ${[n.cash, n.stats.pop, n.stats.sat].every(Number.isFinite)}\n`); } }
