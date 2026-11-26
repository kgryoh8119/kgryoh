// v100：空中の構造物の点検。8 地形と保土ケ谷（まちづくり版）の街で、桁の区間と支えの位置を描画と同じ規則で集め、支えの間隔の最大値を出す。
// 実行：npx esbuild scripts/v100-structure.ts --bundle --platform=node --format=esm --outfile=/tmp/s.mjs --loader:.json=text && node /tmp/s.mjs
//   BEFORE=1 で v99 までの規則（立体交差は分離帯の橋脚だけ・高い道路橋は 1 区画おき・鉄道の橋脚は道路の上でも立てる）で数える
//   立体交差は、どの街にも同じ場面（交差点が続く幹線に立体交差を 3 つ置き、1 本の高架にまとめる）を空き地に作って数える
import { newGame, seedForTerrain, getMap, heightAt, W, H, TILE, setMap, recompute, ropewayTop, stepMonth } from '../src/sim/index';
import { grade, flySupports, flyPiers, flyDeckH, FLY_TH, maxGap } from '../src/sim/grade';
import { buildRailPaths, railPiers } from '../src/render/rails';
import { makeShore } from '../src/render/shore';
import { deformMap } from '../src/mapgen/deform';
import mapText from '../public/maps/hodogaya.json';
import type { GameState } from '../src/sim/index';

const BEFORE = !!process.env.BEFORE, YEARS = Number(process.env.YEARS ?? 0);
const idx = (x: number, y: number) => y * W + x;
type Row = Record<string, string | number>;
const rows: Row[] = [];
const HWr = [0, 2.5, 5, 7.5], SWr = 2.5;

/** 交差点が続く幹線に立体交差を置き、1 本の高架にする（交差点 8・9・10・11 列が続く） */
function flyScene(s: GameState): void {
  const m = getMap(s.seed), free = (i: number) => !s.occ[i] && !s.road[i] && !s.rail?.[i] && !m.water[i];
  let at: [number, number] | null = null;
  for (let y = 3; y < H - 17 && !at; y++) for (let x = 3; x < W - 29 && !at; x++) { let ok = true; for (let yy = y - 1; yy <= y + 14 && ok; yy++) for (let xx = x - 1; xx <= x + 26 && ok; xx++) if (!free(idx(xx, yy))) ok = false; if (ok) at = [x, y]; }
  if (!at) return;
  const [X, Y] = at, put = (i: number, r: number) => { s.road[i] = r; s.roadAge[i] = 0; s.zone[i] = 0; };
  for (let x = X; x <= X + 22; x++) put(idx(x, Y + 6), 2);
  for (const [c, r] of [[5, 2], [8, 2], [9, 1], [10, 2], [11, 3], [17, 2]]) for (let y = Y; y <= Y + 12; y++) if (y !== Y + 6) put(idx(X + c, y), r);
  s.flyover = [...(s.flyover ?? []), idx(X + 5, Y + 6), idx(X + 11, Y + 6), idx(X + 17, Y + 6)];
  s.roadVersion++; recompute(s);
}

/** v99 までの鉄道の橋脚（道路の上でも 24m おきに立て、道路の区画では門形） */
function oldPiers(s: GameState, m: any, P: any): Map<number, { portal: boolean; lat: number }> {
  const out = new Map(), n = P.p.length / 3, vis = (j: number) => P.off[j] > -1.2 || (P.cut[j] === 1 && P.off[j] > -7.5);
  let acc = 12;
  for (let j = 0; j < n - 1; j++) { if (!vis(j) || !vis(j + 1)) continue; const x0 = P.p[j * 3], y0 = P.p[j * 3 + 1], z0 = P.p[j * 3 + 2], seg = Math.hypot(P.p[j * 3 + 3] - x0, P.p[j * 3 + 5] - z0), lift = y0 - heightAt(m, x0, z0);
    const gap = P.kind === 1 ? 22 : 24; if (!P.kind && lift <= 2.2) continue; acc += seg;
    if (acc >= gap) { acc = 0; const t = P.tile[j]; out.set(j, { portal: !P.kind && !!s.road[t] && !m.water[t], lat: 0 }); } }
  return out;
}

function inspect(name: string, s: GameState): void {
  const m = getMap(s.seed), hA = (x: number, z: number) => heightAt(m, x, z), r: Row = { 街: name };
  // 立体交差の高架
  flyScene(s);
  const L = grade(s); let fly = 0, flyN = 0, port = 0;
  for (const sp of L.spans) {
    flyN++;
    let pos: number[];
    if (BEFORE) { const a0 = (sp.j0 + 0.5) * 30, a1 = (sp.j1 + 0.5) * 30; pos = flyPiers(s, sp).map(t => (t + 0.5) * 30).filter(a => flyDeckH(a, a0, a1) - FLY_TH >= 1.2);
      let lo = a0 - 75; while (flyDeckH(lo, a0, a1) - FLY_TH < 0.05) lo += 0.5; let hi = a1 + 75; while (flyDeckH(hi, a0, a1) - FLY_TH < 0.05) hi -= 0.5; pos.push(lo, hi); } // v99 は坂の低い所も桁が浮いていた（桁が地面に着く所を端とする）
    else { const sup = flySupports(s, sp); pos = sup.map(o => o.a); port += sup.filter(o => o.kind === 'portal').length; }
    fly = Math.max(fly, maxGap(pos));
  }
  r['立体交差(本)'] = flyN; r['立体交差 最大径間m'] = Math.round(fly); r['門形'] = port;
  // 道路橋（scene.ts computeDecks と drawDeck の規則）
  const br = new Set(s.bridge ?? []), tun = new Set(s.tunnel ?? []), S1 = W + 1;
  for (let i = 0; i < W * H; i++) { if (!s.road[i] || br.has(i) || tun.has(i) || s.rail?.[i]) continue; const x = i % W, y = (i / W) | 0; if (m.water[i] || m.dug?.[i]) { br.add(i); continue; }
    const lo = Math.min(m.heights[y * S1 + x], m.heights[y * S1 + x + 1], m.heights[(y + 1) * S1 + x], m.heights[(y + 1) * S1 + x + 1]);
    if (lo < -1.2) { for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && (m.water[idx(xx, yy)] || m.dug?.[idx(xx, yy)])) { br.add(i); break; } } } }
  const deck = new Map<number, number>(), seen = new Set<number>();
  for (const b0 of br) { if (seen.has(b0)) continue; const grp = [b0]; seen.add(b0);
    for (let k = 0; k < grp.length; k++) { const i = grp[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy, j = idx(xx, yy); if (xx >= 0 && yy >= 0 && xx < W && yy < H && br.has(j) && !seen.has(j)) { seen.add(j); grp.push(j); } } }
    let top = -1e9; for (const i of grp) { const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) { const xx = x + dx, yy = y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; top = Math.max(top, hA((xx + 0.5) * TILE, (yy + 0.5) * TILE)); } }
    for (const i of grp) deck.set(i, top + 1.2); }
  const ovp = L.ovp, canal = new Set(s.canal ?? []), sh = makeShore(m);
  let brMax = 0, brN = 0, wet = 0, tallN = 0;
  for (const ew of [true, false]) {
    for (let line = 0; line < (ew ? H : W); line++) {
      let run: number[] = [];
      const flush = () => { if (run.length) { const pos: number[] = [run[0] * 30, (run[run.length - 1] + 1) * 30];
        for (const a of run) { const i = ew ? idx(a, line) : idx(line, a), x = i % W, y = (i / W) | 0, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, yD = deck.get(i)!, c = (a + 0.5) * 30;
          const gy = hA(cx, cz) - (m.water[i] || m.dug?.[i] ? 3 : 0.5), tall = yD - gy > 14; if (tall) tallN++;
          if (tall) { if (!BEFORE || (x + y) % 2 === 0) pos.push(c); } else if (!BEFORE && canal.has(i)) pos.push(c - 13, c + 13); else pos.push(c);
          const wl = sh ? sh.level(x + 0.5, y + 0.5) : NaN; if (Number.isFinite(wl) && yD - 3.4 < wl && (BEFORE || !(yD - 3.4 < wl + 0.6))) wet++; }
        brMax = Math.max(brMax, maxGap(pos)); brN++; } run = []; };
      for (let a = 0; a < (ew ? W : H); a++) { const i = ew ? idx(a, line) : idx(line, a), x = i % W, y = (i / W) | 0;
        const al = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && !!s.road[idx(xx, yy)];
        const along = ew ? (al(x - 1, y) || al(x + 1, y)) && !(al(x, y - 1) || al(x, y + 1)) : (al(x, y - 1) || al(x, y + 1)) && !(al(x - 1, y) || al(x + 1, y));
        if (deck.has(i) && !ovp.has(i) && along) run.push(a); else flush(); }
      flush();
    }
  }
  r['道路橋(本)'] = brN; r['道路橋 最大径間m'] = Math.round(brMax); r['高い橋の区画'] = tallN; r['主桁が水に浸かる区画'] = wet;
  // 陸橋：区画の両端（±12.5m）の橋脚どうし 25m、坂は地面までの壁
  r['陸橋'] = ovp.size; r['陸橋 最大径間m'] = ovp.size ? 25 : '-';
  // 鉄道の高架・鉄橋・モノレール・新交通（rails.ts railPiers）
  const paths = buildRailPaths(s, m); let rMax = 0, onRoad = 0, rRuns = 0;
  const vis = (P: any, j: number) => P.off[j] > -1.2 || (P.cut[j] === 1 && P.off[j] > -7.5);
  for (const P of paths) {
    const n = P.p.length / 3, pl = BEFORE ? oldPiers(s, m, P) : railPiers(s, m, P);
    let last = -1, inRun = false;
    for (let j = 0; j < n - 1; j++) {
      const x0 = P.p[j * 3], y0 = P.p[j * 3 + 1], z0 = P.p[j * 3 + 2], lift = y0 - hA(x0, z0), d = P.d[j];
      const st = vis(P, j) && vis(P, j + 1) && (P.kind ? true : lift > 2.2);
      if (st && !inRun) { inRun = true; last = d; rRuns++; }
      if (!st && inRun) { inRun = false; rMax = Math.max(rMax, d - last); }
      if (st && pl.has(j)) { rMax = Math.max(rMax, d - last); last = d;
        const q = pl.get(j)!, tx = Math.floor(x0 / TILE), ty = Math.floor(z0 / TILE), t = idx(tx, ty);
        if (s.road[t] && !m.water[t]) { const rh = HWr[s.road[t]] + SWr, cx = (tx + 0.5) * TILE, cz = (ty + 0.5) * TILE, rd = (a: number, b: number) => a >= 0 && b >= 0 && a < W && b < H && !!s.road[idx(a, b)];
          const ew = rd(tx - 1, ty) || rd(tx + 1, ty), ns = rd(tx, ty - 1) || rd(tx, ty + 1), inB = (ew && Math.abs(z0 - cz) < rh) || (ns && Math.abs(x0 - cx) < rh) || (!ew && !ns);
          if (inB && (!q.portal || BEFORE)) onRoad++; } // v99 の門形は、道路を横切る所でも柱が道路の上に立っていた
      }
    }
    if (inRun) rMax = Math.max(rMax, P.d[n - 1] - last);
  }
  r['鉄道の高架(区間)'] = rRuns; r['鉄道 最大径間m'] = Math.round(rMax); r['鉄道 道路の上の橋脚'] = onRoad;
  // 歩道橋：階段の外の柱どうし＝道路の幅＋0.8m
  let fb = 0; for (const i of s.footbridge ?? []) if (s.road[i] && !L.footBad.has(i)) fb = Math.max(fb, 2 * (HWr[s.road[i]] + SWr + 0.4));
  r['歩道橋 最大径間m'] = fb ? Math.round(fb) : '-';
  // ロープウェイ：塔は 1/3・2/3。索が地面すれすれ（2m 未満）を通るか
  let rw = 0, rwUnder = 0;
  for (const b of s.buildings) { if (b.kind !== 'ropeway') continue; const top = ropewayTop(m, b.x, b.y, b.w, b.h); if (!top) continue;
    const bx = (b.x + b.w / 2) * TILE, bz = (b.y + b.h / 2) * TILE, tx = (top.x + 0.5) * TILE, tz = (top.y + 0.5) * TILE, Lr = Math.hypot(tx - bx, tz - bz); rw = Math.max(rw, Lr / 3);
    let by = -1e9; for (const [u, v] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94], [0.5, 0.5]]) by = Math.max(by, heightAt(m, (b.x + b.w * u) * TILE, (b.y + b.h * v) * TILE)); by += 8.6; const ty = hA(tx, tz) + 7.5;
    for (let k = 1; k < 40; k++) { const u = k / 40, y = by + (ty - by) * u - Math.sin(u * Math.PI) * Lr * 0.025; if (y < hA(bx + (tx - bx) * u, bz + (tz - bz) * u) + 2) { rwUnder++; break; } } }
  r['ロープウェイ 最大径間m'] = rw ? Math.round(rw) : '-'; r['索が地面すれすれ'] = rw ? rwUnder : '-';
  rows.push(r);
}

const T8 = ['coast', 'inland', 'rural', 'river', 'lake', 'mountain', 'urban', 'island'];
for (const id of T8) { const s = newGame({ seed: seedForTerrain(id) }); for (let k = 0; k < YEARS * 12; k++) stepMonth(s); inspect(id, s); }
{ const { map } = deformMap(JSON.parse(mapText as unknown as string), { id: 'hodogaya-d' }); setMap('hodogaya-d', map); const s = newGame({}); inspect('保土ケ谷', s); setMap('', null); }
const keys = Object.keys(rows[0]);
console.log('| ' + keys.join(' | ') + ' |'); console.log('|' + keys.map(() => '---').join('|') + '|');
for (const r of rows) console.log('| ' + keys.map(k => r[k] ?? '').join(' | ') + ' |');
