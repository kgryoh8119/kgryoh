// まちづくり版：実在の地図（取り込み済みの地図データ）をもとに、ゲームで遊びやすいようにデフォルメした街を作る。
// 実在の位置関係（駅・線路・川・幹線道路・地形・地区・施設の名前）は縮めて残し、細い道や建物の一つ一つは省いて、
// 碁盤の目の生活道路・ゲームの標準の建物・空き地（これから開発できる土地）に置き換える。ブラウザと Node の両方で動く。
import { decodeMap, LOT_KINDS, RF, type RealMap, type RealLine } from '../sim/real';
import { railNbrs, railLine, railDims } from '../sim/railnet';

const TILE = 30;
function b64enc(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
  return btoa(s);
}
const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
const hash = (x: number, y: number, s: number) => { const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return v - Math.floor(v); };
const SIZE: Record<string, [number, number]> = { station: [3, 1], school: [3, 2], water: [2, 2], waste: [2, 1], supermarket: [2, 2] };

export interface DeformOptions { id: string; name?: string; factor?: number; maxUnits?: number }
export interface DeformReport { lines: string[] }

/** 取り込み済みの地図データ（version 2）から、まちづくり版の地図データを作る */
export function deformMap(raw: any, opt: DeformOptions): { map: any; report: DeformReport } {
  try { return deformInner(raw, opt); } finally { railDims(0, 0); }
}
function deformInner(raw: any, opt: DeformOptions): { map: any; report: DeformReport } {
  const R: RealMap = decodeMap(raw);
  if (R.deformed) throw new Error('すでにまちづくり版の地図です');
  const f = opt.factor ?? Math.max(2, Math.round(Math.max(R.W, R.H) / 56));
  const W = Math.floor(R.W / f), H = Math.floor(R.H / f), N = W * H, MW = W * TILE, MH = H * TILE;
  railDims(W, H);
  const idx = (x: number, y: number) => y * W + x, inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const lines: string[] = [];
  const say = (m: string) => lines.push(m);
  say(`まちづくり版 ${W}×${H} 区画（実在の地図を 1/${f} に縮めて、ゲーム用に整理）`);

  // ---- 地形：実在の標高を縮めた距離で読み、高さも縮めてなめらかにする ----
  const srcH = (wx: number, wz: number) => { const d = R.dem, fx = Math.max(0, Math.min(d.cols - 1.001, wx / d.step)), fz = Math.max(0, Math.min(d.rows - 1.001, wz / d.step)), x0 = Math.floor(fx), z0 = Math.floor(fz), u = fx - x0, v = fz - z0, c = d.cols, h = d.h; return (h[z0 * c + x0] * (1 - u) + h[z0 * c + x0 + 1] * u) * (1 - v) + (h[(z0 + 1) * c + x0] * (1 - u) + h[(z0 + 1) * c + x0 + 1] * u) * v; };
  const STEP = 10, cols = W * 3 + 1, rows = H * 3 + 1, VS = 0.45;
  let dem = new Float32Array(cols * rows);
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const h = srcH(c * STEP * f, r * STEP * f); dem[r * cols + c] = h < -0.5 ? h : h * VS; }
  for (let pass = 0; pass < 2; pass++) { // なめらかに（海は動かさない）
    const o = new Float32Array(dem);
    for (let r = 1; r < rows - 1; r++) for (let c = 1; c < cols - 1; c++) { if (dem[r * cols + c] < -0.5) continue; let s = 0, n = 0; for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const v = dem[(r + dr) * cols + c + dc]; if (v >= -0.5) { s += v; n++; } } o[r * cols + c] = s / n; }
    dem = o;
  }
  for (let k = 0; k < dem.length; k++) dem[k] = Math.round(dem[k] * 10) / 10; // 保存と同じ精度にそろえる（斜面の判定がずれないように）
  const hAt = (wx: number, wz: number) => { const fx = Math.max(0, Math.min(cols - 1.001, wx / STEP)), fz = Math.max(0, Math.min(rows - 1.001, wz / STEP)), x0 = Math.floor(fx), z0 = Math.floor(fz), u = fx - x0, v = fz - z0; return (dem[z0 * cols + x0] * (1 - u) + dem[z0 * cols + x0 + 1] * u) * (1 - v) + (dem[(z0 + 1) * cols + x0] * (1 - u) + dem[(z0 + 1) * cols + x0 + 1] * u) * v; };
  const steep = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let lo = 1e9, hi = -1e9; for (const [u, v] of [[0.1, 0.1], [0.9, 0.1], [0.1, 0.9], [0.9, 0.9], [0.5, 0.5]]) { const h = hAt((x + u) * TILE, (y + v) * TILE); lo = Math.min(lo, h); hi = Math.max(hi, h); } if (hi - lo > 8) steep[idx(x, y)] = 1; }

  // ---- 土地の性質：元の区画のまとまりの多数決 ----
  const flags = new Uint8Array(N), district = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let water = 0, forest = 0, park = 0; const cnt: number[] = [];
    for (let dy = 0; dy < f; dy++) for (let dx = 0; dx < f; dx++) { const i = (y * f + dy) * R.W + x * f + dx, fl = R.flags[i]; if (fl & RF.water) water++; if (fl & RF.forest) forest++; if (fl & RF.park) park++; cnt[R.district[i]] = (cnt[R.district[i]] ?? 0) + 1; }
    const n = f * f, i = idx(x, y);
    if (water >= n * 0.5) flags[i] |= RF.water; else if (forest >= n * 0.6) flags[i] |= RF.forest; else if (park >= n * 0.6) flags[i] |= RF.park;
    let bd = 0, bc = -1; cnt.forEach((c, d) => { if (c > bc) { bc = c; bd = d; } }); district[i] = bd;
  }
  // 線を縮めた区画の並びにする（斜めの動きは角の区画を足して、上下左右でつながるように）
  const scaleLine = (l: RealLine): RealLine => { const p = new Float32Array(l.pts.length); for (let k = 0; k < p.length; k++) p[k] = l.pts[k] / f; return { cls: l.cls, bridge: l.bridge, pts: p }; };
  const raster = (l: RealLine, cb: (i: number, wx: number, wz: number) => void) => {
    const p = l.pts; let px = -1, py = -1;
    for (let k = 1; k < p.length / 2; k++) {
      const ax = p[k * 2 - 2] / f, az = p[k * 2 - 1] / f, bx = p[k * 2] / f, bz = p[k * 2 + 1] / f, L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / (TILE * 0.25)));
      for (let s = 0; s <= n; s++) {
        const wx = ax + (bx - ax) * s / n, wz = az + (bz - az) * s / n, tx = Math.floor(wx / TILE), ty = Math.floor(wz / TILE);
        if (!inMap(tx, ty) || (tx === px && ty === py)) continue;
        if (px >= 0 && tx !== px && ty !== py && inMap(tx, py)) cb(idx(tx, py), wx * f, wz * f); // 角
        cb(idx(tx, ty), wx * f, wz * f); px = tx; py = ty;
      }
    }
  };
  const rivers = R.rivers.map(scaleLine), streams = R.streams.map(scaleLine), waters = R.waters.map(scaleLine);
  for (const l of R.rivers) raster(l, i => { flags[i] |= RF.water; });

  // ---- 幹線道路：形を単純にして、縦横の線（L 字の折れ線）に描き直す（線路は下で、実在の曲線のまま描く） ----
  // 実在の線は斜めや並行（上下線が別々の線）なので、そのまま区画に塗ると太く階段状になる。
  // 折れ点を減らし（許容 1.5 区画）、近くに既にある線の区画へ寄せてまとめ、縦→横 または 横→縦 の 2 本でつなぐ。
  const toTiles = (l: RealLine): [number, number][] => { const out: [number, number][] = []; for (let k = 0; k < l.pts.length / 2; k++) out.push([l.pts[k * 2] / f / TILE, l.pts[k * 2 + 1] / f / TILE]); return out; };
  const simplify = (pts: [number, number][], tol: number): [number, number][] => {
    if (pts.length < 3) return pts;
    const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1], L = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1, wd = 0;
    for (let k = 1; k < pts.length - 1; k++) { const d = Math.abs((bx - ax) * (ay - pts[k][1]) - (ax - pts[k][0]) * (by - ay)) / L; if (d > wd) { wd = d; worst = k; } }
    if (wd <= tol) return [pts[0], pts[pts.length - 1]];
    return [...simplify(pts.slice(0, worst + 1), tol).slice(0, -1), ...simplify(pts.slice(worst), tol)];
  };
  const clampT = (v: number, n: number) => Math.max(0, Math.min(n - 1, Math.floor(v)));
  /** 区画 (ax,ay) から (bx,by) まで、縦横 2 本でつなぐ。曲がり角は元の線に近い側 */
  const lPath = (ax: number, ay: number, bx: number, by: number, mid: [number, number], cb: (i: number) => void) => {
    const c1 = [bx, ay], c2 = [ax, by];
    const corner = Math.hypot(c1[0] - mid[0], c1[1] - mid[1]) <= Math.hypot(c2[0] - mid[0], c2[1] - mid[1]) ? c1 : c2;
    const seg = (x0: number, y0: number, x1: number, y1: number) => { const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)); for (let k = 0; k <= n; k++) cb(idx(x0 + Math.sign(x1 - x0) * Math.min(k, Math.abs(x1 - x0)), y0 + Math.sign(y1 - y0) * Math.min(k, Math.abs(y1 - y0)))); };
    seg(ax, ay, corner[0], corner[1]); seg(corner[0], corner[1], bx, by);
  };
  /** 線を区画の並びに描く。has(i) が真の区画が近く（1 区画）にあれば、そこへ寄せて線をまとめる */
  const schematic = (l: RealLine, has: (i: number) => boolean, cb: (i: number) => void, minLen: number) => {
    const raw = toTiles(l); let len = 0; for (let k = 1; k < raw.length; k++) len += Math.hypot(raw[k][0] - raw[k - 1][0], raw[k][1] - raw[k - 1][1]);
    if (len < minLen) return;
    const pts = simplify(raw, 1.5).map(([x, y]) => {
      let tx = clampT(x, W), ty = clampT(y, H);
      if (!has(idx(tx, ty))) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const nx = tx + dx, ny = ty + dy; if (inMap(nx, ny) && has(idx(nx, ny))) { tx = nx; ty = ny; break; } }
      return [tx, ty] as [number, number];
    });
    for (let k = 1; k < pts.length; k++) lPath(pts[k - 1][0], pts[k - 1][1], pts[k][0], pts[k][1], [(raw[0][0] + raw[raw.length - 1][0]) / 2 * 0 + (pts[k - 1][0] + pts[k][0]) / 2, (pts[k - 1][1] + pts[k][1]) / 2], cb);
  };
  /** 2×2 がすべて埋まった所を間引いて、線を 1 区画の太さにする（外へのつながりがない角だけ外す） */
  const thin = (a: Uint8Array) => {
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      for (let y = 0; y < H - 1; y++) for (let x = 0; x < W - 1; x++) {
        const q = [idx(x, y), idx(x + 1, y), idx(x, y + 1), idx(x + 1, y + 1)];
        if (!q.every(i => a[i])) continue;
        for (const i of q) {
          const ix = i % W, iy = (i / W) | 0;
          const outside = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const nx = ix + dx, ny = iy + dy; if (!inMap(nx, ny)) return true; if (nx >= x && nx <= x + 1 && ny >= y && ny <= y + 1) return false; return !!a[idx(nx, ny)]; });
          if (!outside) { a[i] = 0; changed = true; break; }
        }
      }
      if (!changed) break;
    }
  };
  // 線路：実在の線の形（曲線）をそのまま縮めて、斜めも使った 1 区画の太さの線にする。
  // 上下線・並行する線は先に描いた線へまとめ、車庫・側線・貨物線・新幹線は省く（旅客の線だけ）。トンネルの区間は地下の線路
  const rail = new Uint8Array(N), grade = new Uint8Array(N);
  {
    let use = R.rails.filter(l => !l.service && !l.freight && !l.highspeed);
    if (!use.length) use = R.rails.filter(l => !l.service);
    // OSM の線路は駅や橋ごとに細かく切れているので、端どうしがつながる線を、まっすぐ続く向きを優先して 1 本につなぐ
    type PL = { pts: [number, number][]; fl: number[]; tunnel: number }; // fl: 区間ごとの 0 地上・1 橋・2 トンネル
    const segs: PL[] = use.map(l => { const pts = toTiles(l), g0 = l.tunnel ? 2 : l.bridge ? 1 : 0; return { pts, fl: pts.slice(1).map(() => g0), tunnel: l.tunnel ? 1 : 0 }; });
    const key = (p: [number, number]) => Math.round(p[0] * 30) + ',' + Math.round(p[1] * 30);
    const ends = new Map<string, number[]>();
    segs.forEach((sg, k) => { for (const p of [sg.pts[0], sg.pts[sg.pts.length - 1]]) { const kk = key(p); const a = ends.get(kk) ?? []; a.push(k); ends.set(kk, a); } });
    const usedSeg = new Uint8Array(segs.length), merged: PL[] = [];
    const dirAt = (pts: [number, number][], atEnd: boolean): [number, number] => { const a = atEnd ? pts[pts.length - 2] : pts[1], b = atEnd ? pts[pts.length - 1] : pts[0]; const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
    const grow = (m: PL) => {
      for (;;) {
        const end = m.pts[m.pts.length - 1], d = dirAt(m.pts, true);
        let best = -1, bestCos = 0.3, rev = false;
        for (const k of ends.get(key(end)) ?? []) {
          if (usedSeg[k]) continue;
          const sg = segs[k], r = key(sg.pts[0]) !== key(end), pts = r ? sg.pts.slice().reverse() : sg.pts, d2 = dirAt(pts, false), c = -(d[0] * d2[0] + d[1] * d2[1]);
          if (c > bestCos) { bestCos = c; best = k; rev = r; }
        }
        if (best < 0) return;
        usedSeg[best] = 1;
        const sg = segs[best], pts = rev ? sg.pts.slice().reverse() : sg.pts, fl = rev ? sg.fl.slice().reverse() : sg.fl;
        m.pts.push(...pts.slice(1)); m.fl.push(...fl); m.tunnel = Math.min(m.tunnel, sg.tunnel);
      }
    };
    const order = segs.map((_, k) => k).sort((a, b) => segs[a].tunnel - segs[b].tunnel || b - a);
    for (const k of order) {
      if (usedSeg[k]) continue;
      usedSeg[k] = 1;
      const m: PL = { pts: segs[k].pts.slice(), fl: segs[k].fl.slice(), tunnel: segs[k].tunnel };
      grow(m); m.pts.reverse(); m.fl.reverse(); grow(m);
      merged.push(m);
    }
    const lens = (pts: [number, number][]) => { let a = 0; for (let k = 1; k < pts.length; k++) a += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); return a; };
    const src = merged.map(m => ({ m, len: lens(m.pts) })).filter(o => o.len >= 2.5);
    src.sort((a, b) => a.m.tunnel - b.m.tunnel || b.len - a.len);
    const near = (snap: Uint8Array, x: number, y: number, r: number) => { let best = -1, bd = 1e9; for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny) || !snap[idx(nx, ny)]) continue; const d = dx * dx + dy * dy; if (d < bd) { bd = d; best = idx(nx, ny); } } return best; };
    for (const { m } of src) {
      const snap = rail.slice(), pts = m.pts;
      // 0.25 区画ごとに点を打つ（点ごとに 地上・橋・トンネル）
      const smp: [number, number, number][] = [];
      for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 0.25)); for (let s2 = k === 1 ? 0 : 1; s2 <= n; s2++) smp.push([ax + (bx - ax) * s2 / n, ay + (by - ay) * s2 / n, m.fl[k - 1]]); }
      const gOf = new Map<number, number[]>();
      // 既にある線の近く（1 区画以内）は、その線にまとめる。離れている部分だけを新しく描く
      const runs: number[][] = []; let cur: number[] = [], lastCov = -1;
      for (const [fx, fy, fg] of smp) {
        const x = Math.floor(fx), y = Math.floor(fy);
        if (!inMap(x, y)) { if (cur.length) { runs.push(cur); cur = []; } lastCov = -1; continue; }
        const nr = near(snap, x, y, 1);
        if (nr >= 0) { if (cur.length) { cur.push(nr); runs.push(cur); cur = []; } lastCov = nr; continue; }
        if (!cur.length && lastCov >= 0) cur.push(lastCov);
        lastCov = -1;
        const i = idx(x, y); if (cur[cur.length - 1] !== i) cur.push(i);
        const a = gOf.get(i) ?? [0, 0, 0]; a[fg]++; gOf.set(i, a);
      }
      if (cur.length) runs.push(cur);
      for (const run of runs) {
        if (run.length < 3) continue;
        // すき間を埋めて、L 字の角（斜めでつながる 2 区画の間の区画）を外す
        let seq: number[] = [run[0]];
        for (let k = 1; k < run.length; k++) { const a = seq[seq.length - 1], b = run[k]; if (Math.max(Math.abs(a % W - b % W), Math.abs(((a / W) | 0) - ((b / W) | 0))) > 1) seq.push(...railLine(a, b).slice(1)); else seq.push(b); }
        for (let k = 1; k < seq.length - 1; k++) { const a = seq[k - 1], c = seq[k + 1]; if (Math.abs(a % W - c % W) === 1 && Math.abs(((a / W) | 0) - ((c / W) | 0)) === 1 && !snap[seq[k]]) { seq.splice(k, 1); k--; } }
        // 区画の高さは、その区画の点で一番多いもの。すき間を埋めた区画は前の区画と同じ
        let lastG = 0;
        for (const i of seq) { const a = gOf.get(i); if (a) lastG = a.indexOf(Math.max(...a)); if (!rail[i]) { rail[i] = 2; grade[i] = lastG; } }
      }
    }
  }
  thin(rail);
  // 地図の端に沿って走る線路は外す（端から内側へ入る所だけ残す）
  for (let pass = 0; pass < 3; pass++) for (let i = 0; i < N; i++) {
    const x = i % W, y = (i / W) | 0;
    if (!rail[i] || !(x === 0 || y === 0 || x === W - 1 || y === H - 1)) continue;
    if (!railNbrs(j => rail[j] > 0, i).some(j => { const jx = j % W, jy = (j / W) | 0; return jx > 0 && jy > 0 && jx < W - 1 && jy < H - 1; })) rail[i] = 0;
  }
  for (let i = 0; i < N; i++) if (!rail[i]) grade[i] = 0;
  // 1 区画だけ地上に出る・地下にもぐる所はならす
  for (let pass = 0; pass < 2; pass++) for (let i = 0; i < N; i++) {
    if (!rail[i]) continue;
    const nb = railNbrs(j => rail[j] > 0, i);
    if (nb.length === 2 && grade[nb[0]] === grade[nb[1]] && grade[i] !== grade[nb[0]]) grade[i] = grade[nb[0]];
  }
  // 幹線道路：国道（trunk）と主要な道（primary・secondary）だけ。短い枝は省く
  const road = new Uint8Array(N);
  const srcRoad = (wx: number, wz: number) => { const tx = Math.floor(wx / TILE), tz = Math.floor(wz / TILE); return tx >= 0 && tz >= 0 && tx < R.W && tz < R.H ? R.road[tz * R.W + tx] : 0; };
  const majors = R.roads.filter(l => l.cls === 3 || l.cls === 4).sort((p, q) => q.cls - p.cls || q.pts.length - p.pts.length);
  for (const l of majors) {
    let nat = 0; for (let k = 0; k < l.pts.length / 2; k++) if (srcRoad(l.pts[k * 2], l.pts[k * 2 + 1]) === 3) nat++;
    const want = l.cls === 4 && nat * 2 >= l.pts.length / 2 ? 3 : 2;
    schematic(l, i => road[i] > 0, i => { if (want > road[i]) road[i] = want; }, want === 3 ? 2 : 6);
  }
  thin(road);
  // 国道が途切れ途切れにならないよう、国道に挟まれた 1 区画の切れ目は国道にする
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = idx(x, y); if (road[i] && road[i] < 3 && ((x > 0 && x < W - 1 && road[i - 1] === 3 && road[i + 1] === 3) || (y > 0 && y < H - 1 && road[i - W] === 3 && road[i + W] === 3))) road[i] = 3; }
  // 幹線・国道と地上の線路が交わる所は、線路を高架にする（前後 1 区画も高架）。生活道路との交差は踏切
  {
    const up: number[] = [];
    for (let i = 0; i < N; i++) if (road[i] >= 2 && rail[i] && grade[i] === 0) { grade[i] = 1; up.push(i); }
    for (const i of up) for (const j of railNbrs(k => rail[k] > 0, i)) if (grade[j] === 0 && !road[j]) grade[j] = 1;
  }
  // 地上・高架の線路が通る区画は川の印を外す（鉄橋）
  for (let i = 0; i < N; i++) if (rail[i] && grade[i] !== 2) flags[i] &= ~RF.water;

  // ---- もとの住宅の戸数（縮めた 1 区画あたり）と、施設の位置 ----
  const units = new Float32Array(N);
  const facs: { k: string; x: number; y: number; name: string }[] = [];
  R.lots.forEach(([k, x, y, u, rot], li) => {
    const kind = LOT_KINDS[k], nx = Math.min(W - 1, Math.floor(x / f)), ny = Math.min(H - 1, Math.floor(y / f));
    if (k <= 2) units[idx(nx, ny)] += u;
    else if (!rot) facs.push({ k: kind, x: nx, y: ny, name: R.names[String(li)] ?? '' });
  });

  // ---- 碁盤の目の生活道路：もとに住宅があった所に 4 区画ごと ----
  const dev = (i: number) => units[i] >= 10;
  const near = (x: number, y: number, r: number) => { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (inMap(x + dx, y + dy) && dev(idx(x + dx, y + dy))) return true; return false; };
  const land = (i: number) => !(flags[i] & (RF.water | RF.forest | RF.park)) && !steep[i] && !(rail[i] && grade[i] !== 2); // 地下の線路の上は使える
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (road[i]) continue;
    const hz = y % 6 === 3, vt = x % 6 === 3;
    if (!(hz || vt) || !near(x, y, 1)) continue;
    if (rail[i] && grade[i] !== 2) {
      // 線路を横切るときだけ（地上なら踏切、高架ならその下をくぐる）。線路に沿って重なる道や、交差点の上はつくらない
      const rx = (x > 0 && rail[i - 1]) || (x < W - 1 && rail[i + 1]), ry = (y > 0 && rail[i - W]) || (y < H - 1 && rail[i + W]);
      if (!(hz && vt) && !(hz ? rx : ry) && !steep[i]) road[i] = 1;
      continue;
    }
    if (land(i)) road[i] = 1;
  }
  // 道路が川を渡る区画は橋とする（水面の印を外す）。線路との交差は踏切（道路と線路が同じ区画にある）
  for (let i = 0; i < N; i++) if (road[i] && flags[i] & RF.water) flags[i] &= ~RF.water;
  for (let i = 0; i < N; i++) if (road[i] && road[i] < 3 && (steep[i] || flags[i] & (RF.forest | RF.park))) road[i] = 0; // 急な斜面や緑地には通さない（国道は残す）
  // 市外への出入口（地図の端の幹線・国道）から道路でたどれない道路は除く（建物が建っても「未接続」になるため）
  {
    const seen = new Uint8Array(N), q: number[] = [];
    for (let x = 0; x < W; x++) for (const y of [0, H - 1]) { const i = idx(x, y); if (road[i] >= 2) { seen[i] = 1; q.push(i); } }
    for (let y = 0; y < H; y++) for (const x of [0, W - 1]) { const i = idx(x, y); if (road[i] >= 2 && !seen[i]) { seen[i] = 1; q.push(i); } }
    while (q.length) { const i = q.pop()!, x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (road[j] && !seen[j]) { seen[j] = 1; q.push(j); } } }
    let cut = 0; for (let i = 0; i < N; i++) if (road[i] && !seen[i]) { road[i] = 0; cut++; }
    if (cut) say(`市外につながらない道路 ${cut} 区画を省いた`);
  }
  for (let i = 0; i < N; i++) if (road[i] === 3) flags[i] |= RF.national;
  // 高架やトンネルの出入口のすぐ横（2 区画以内）に踏切はつくれないので、そこは高架（またはトンネル）を延ばす
  {
    const has = (k: number) => rail[k] > 0;
    for (let i = 0; i < N; i++) {
      if (!rail[i] || !road[i] || grade[i]) continue;
      const near2 = new Set<number>(); for (const j of railNbrs(has, i)) { near2.add(j); for (const k of railNbrs(has, j)) near2.add(k); }
      const g = [...near2].some(j => grade[j] === 1) ? 1 : [...near2].some(j => grade[j] === 2) ? 2 : 0;
      if (g) { grade[i] = g; for (const j of railNbrs(has, i)) if (!grade[j] && road[j] === 0) grade[j] = g; }
    }
  }

  // ---- 施設を置く：もとの位置の近くで、道路に面した空き地 ----
  const occ = new Int8Array(N);
  const lots: { k: string; x: number; y: number; units: number; name: string }[] = [];
  const touchesRoad = (x: number, y: number, w: number, h: number) => { for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) { if ((dx === -1 || dx === w) === (dy === -1 || dy === h)) continue; if (inMap(x + dx, y + dy) && road[idx(x + dx, y + dy)]) return true; } return false; };
  const touchesRail = (x: number, y: number, w: number, h: number) => { for (let dy = -1; dy <= h; dy++) for (let dx = -1; dx <= w; dx++) { if ((dx === -1 || dx === w) && (dy === -1 || dy === h)) continue; if (inMap(x + dx, y + dy) && rail[idx(x + dx, y + dy)]) return true; } return false; };
  const free = (x: number, y: number, w: number, h: number) => { for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { if (!inMap(x + dx, y + dy)) return false; const i = idx(x + dx, y + dy); if (road[i] || occ[i] || !land(i)) return false; } return true; };
  const put = (k: string, x0: number, y0: number, name: string, u = 0, maxR = 4): boolean => {
    const [w, h] = SIZE[k] ?? [1, 1];
    for (let r = 0; r <= maxR; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = x0 + dx - ((w - 1) >> 1), y = y0 + dy - ((h - 1) >> 1);
      if (!free(x, y, w, h) || !touchesRoad(x, y, w, h)) continue;
      if (k === 'station' && !touchesRail(x, y, w, h)) continue; // 駅は線路に面する
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) occ[idx(x + xx, y + yy)] = 1;
      lots.push({ k, x, y, units: u, name }); return true;
    }
    return false;
  };
  const SPACING: Record<string, number> = { station: 3, water: 99, waste: 99, school: 13, fire: 15, nursery: 6, privNursery: 6, supermarket: 10, park: 9, clinic: 12, koban: 14, shop: 6, bakery: 8 };
  const ORDER = ['station', 'water', 'waste', 'school', 'fire', 'nursery', 'privNursery', 'supermarket', 'park', 'koban', 'clinic', 'shop', 'bakery'];
  const placed: Record<string, number> = {};
  // 数の上限（ゲームの街の大きさに合わせる）。住宅の多い所に近い施設から選ぶ
  const CAP: Record<string, number> = { station: 8, water: 1, waste: 1, school: 3, fire: 2, nursery: 2, privNursery: 3, supermarket: 4, park: 9, koban: 2, clinic: 3, shop: 10, bakery: 4 };
  const dens = (x: number, y: number) => { let s2 = 0; for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) if (inMap(x + dx, y + dy)) s2 += units[idx(x + dx, y + dy)]; return s2; };
  facs.sort((a, b) => dens(b.x, b.y) - dens(a.x, a.y));
  for (const k of ORDER) for (const fc of facs.filter(o => o.k === k)) {
    if ((placed[k] ?? 0) >= (CAP[k] ?? 4)) break;
    const sp = SPACING[k] ?? 4;
    if (lots.some(l => (l.k === k || (k.includes('ursery') && l.k.includes('ursery'))) && Math.max(Math.abs(l.x - fc.x), Math.abs(l.y - fc.y)) < sp)) continue;
    if (sp === 99 && placed[k]) continue;
    if (put(k, fc.x, fc.y, fc.name, 0, k === 'water' || k === 'waste' || k === 'school' || k === 'station' ? 8 : 4)) placed[k] = (placed[k] ?? 0) + 1;
  }
  for (const [k, name] of [['water', '浄水場'], ['waste', 'ごみ処理工場']] as const) if (!placed[k]) for (let t = 0; t < 400 && !placed[k]; t++) { const x = Math.floor(hash(t, 1, 9) * W), y = Math.floor(hash(t, 2, 9) * H); if (put(k, x, y, name, 0, 2)) placed[k] = 1; }

  // ---- 住宅：もとの戸数が多い所から、駅に近いほど高い建物で。全部は埋めずに、用途だけ指定した空き地を残す ----
  const stations = lots.filter(l => l.k === 'station');
  const stDist = (x: number, y: number) => stations.reduce((a, s) => Math.min(a, Math.hypot(s.x + 1 - x, s.y - y)), 1e9);
  const zone = new Uint8Array(N);
  const cand: { i: number; u: number }[] = [];
  for (let i = 0; i < N; i++) if (units[i] >= 1 && !road[i] && !occ[i] && land(i)) cand.push({ i, u: units[i] });
  cand.sort((a, b) => b.u - a.u);
  const maxUnits = opt.maxUnits ?? 5200, U = { house: 4, apartment: 14, mansion: 40 } as const;
  let total = 0, zoned = 0;
  for (const c of cand) {
    const x = c.i % W, y = (c.i / W) | 0, sd = stDist(x, y);
    const k: keyof typeof U = c.u >= 100 && sd <= 8 ? 'mansion' : c.u >= 40 ? 'apartment' : 'house';
    if (touchesRoad(x, y, 1, 1) && zoned < 220) { zone[c.i] = k === 'mansion' ? 3 : k === 'apartment' ? 2 : 1; zoned++; } // 道路に面した所だけ、用途を残す（数は控えめに）
    const keep = hash(x, y, 3) < (sd <= 8 ? 0.92 : 0.8);
    if (!keep || total + U[k] > maxUnits || !touchesRoad(x, y, 1, 1)) continue;
    occ[c.i] = 1; lots.push({ k, x, y, units: U[k], name: '' }); total += U[k];
  }
  // 駅前の空き地は商業の用途にしておく（店が開きやすく）
  for (const s of stations) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 4; dx++) { const x = s.x + dx, y = s.y + dy; if (!inMap(x, y)) continue; const i = idx(x, y); if (!road[i] && !occ[i] && land(i) && touchesRoad(x, y, 1, 1) && hash(x, y, 7) < 0.4) zone[i] = 4; }
  for (let i = 0; i < N; i++) if (occ[i]) zone[i] = 0; // 区画の用途は建物の種類から決まる

  // ---- 出入口（地図の端の幹線・国道）と通過交通 ----
  const gateways: number[] = [];
  for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (road[idx(x, y)] >= 2) gateways.push(idx(x, y));
  for (let y = 1; y < H - 1; y++) for (const x of [0, W - 1]) if (road[idx(x, y)] >= 2) gateways.push(idx(x, y));
  if (!gateways.length) for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (road[idx(x, y)]) gateways.push(idx(x, y));
  if (!gateways.length) throw new Error('地図の端につながる道路がありません');
  const nat = gateways.filter(g => road[g] === 3), pool = nat.length >= 2 ? nat : gateways;
  let through: [number, number] = [pool[0], pool[pool.length - 1]], bd = -1;
  for (const a of pool) for (const c of pool) { const d = Math.hypot(a % W - c % W, ((a / W) | 0) - ((c / W) | 0)); if (d > bd) { bd = d; through = [a, c]; } }

  const KIND_IDX = [...LOT_KINDS] as string[];
  const packLines = (ls: RealLine[], withCls: boolean) => { const a: number[] = []; for (const l of ls) { a.push(withCls ? l.cls * 2 + (l.bridge ? 1 : 0) : (l.bridge ? 1 : 0), l.pts.length / 2); for (let k = 0; k < l.pts.length; k++) a.push(Math.max(0, Math.min(65535, Math.round(l.pts[k] * 2)))); } return b64enc(bytes(new Uint16Array(a))); };
  const d16 = new Int16Array(dem.length); for (let k = 0; k < dem.length; k++) d16[k] = Math.round(dem[k] * 10);
  const resLots = lots.filter(l => l.units);
  say(`線路 ${rail.filter(r => r).length} 区画（高架 ${grade.filter(g => g === 1).length}・地下 ${grade.filter(g => g === 2).length}・踏切 ${Array.from(rail).filter((r, i) => r && road[i] && grade[i] === 0).length}）、幹線 ${road.filter(r => r >= 2).length} 区画（国道 ${road.filter(r => r === 3).length}）、生活道路 ${road.filter(r => r === 1).length} 区画`);
  say(`はじめの住宅 ${resLots.length} 棟（${total.toLocaleString()} 戸）、用途だけ指定した空き地 ${zone.filter(z => z).length} 区画`);
  say(`施設 ${Object.entries(placed).map(([k, v]) => `${k} ${v}`).join('、')}`);
  const map = {
    format: 'sumucity-realmap', version: 2, id: opt.id, name: opt.name ?? `${R.name}（まちづくり版）`, W, H, tile: TILE, bbox: R.bbox, deformed: true,
    credits: R.credits + '（ゲーム用にデフォルメ）', collectedAt: raw.collectedAt, assumed: R.assumed, seaTiles: Array.from(flags).filter(v => v & RF.water).length,
    dem: { cols, rows, step: STEP, b64: b64enc(bytes(d16)) },
    road: b64enc(road), flags: b64enc(flags), district: b64enc(district), zone: b64enc(zone),
    districts: R.districts.map(d => ({ name: d.name, x: d.x / f, y: d.y / f })),
    gateways, through,
    lots: lots.map(l => [KIND_IDX.indexOf(l.k), l.x, l.y, l.units, 0]),
    names: Object.fromEntries(lots.map((l, i) => [i, l.name]).filter(([, n]) => n)),
    bld: '', roads: '', rails: '', railTiles: b64enc(rail), railGrade: b64enc(grade), rivers: packLines(rivers, false), streams: packLines(streams, false), waters: packLines(waters, false),
  };
  void MW; void MH;
  return { map, report: { lines } };
}
