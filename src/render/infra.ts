// v87：線状のインフラの描画（送電線・共同溝による無電柱化の範囲・マンホールと消火栓・水管橋・地下の管の地図）
import { Geo } from './geo';
import { sagWire, PYLON_PH, PYLON_GW } from './models';
import { W, H, TILE, DEFS, inMap, idx, hash, roadInfo } from '../sim/index';
import type { GameState, Building } from '../sim/index';

type V = [number, number, number];
type Place = (b: Building) => { x: number; y: number; z: number; rot: number };
const live = (b: Building) => b.status !== 'construction';
/** 発電所（発電量のある電力の施設）と変電所。送電線の端になる */
const isPlant = (b: Building) => DEFS[b.kind].fam === 'power' && (DEFS[b.kind].gen ?? 0) > 0;
/** 道路の描き直しに要る建物の印（鉄塔・発電所・変電所・共同溝が増減したら描き直す） */
export function infraKey(s: GameState): string {
  let k = '';
  for (const b of s.buildings) if (live(b) && (b.kind === 'pylon' || b.kind === 'substation' || b.kind === 'kyodoko' || isPlant(b))) k += b.id + (b.status === 'operating' ? 'o' : 'x') + ',';
  return k;
}
/** 共同溝の周り（8 区画＝240m）の生活道路は電柱と電線を地下に入れる（描画では無電柱化の区画と同じに扱う） */
export function kyodokoTiles(s: GameState, out: Set<number>): void {
  for (const b of s.buildings) {
    if (b.kind !== 'kyodoko' || b.status !== 'operating') continue;
    for (let y = b.y - 8; y <= b.y + 8; y++) for (let x = b.x - 8; x <= b.x + 8; x++) if (inMap(x, y) && s.road[idx(x, y)] === 1) out.add(idx(x, y));
  }
}

/** 送電線：鉄塔どうし（いちばん近い鉄塔、480m まで）と、発電所・変電所からいちばん近い鉄塔へ、2 回線 3 相の電線と架空地線をたるませて張る。
 *  発電所・変電所の側は、敷地の縁に引き込みの鉄構（門形の鉄柱）を立てる。鉄塔のない街は、発電所から近くの変電所（300m まで）へ鉄構どうしで張る */
export function drawPowerLines(s: GameState, g: Geo, place: Place, hA: (x: number, z: number) => number, fine: boolean): void {
  const pyl = s.buildings.filter(b => b.kind === 'pylon' && live(b)).map(b => { const p = place(b); return { x: p.x, y: p.y, z: p.z }; });
  const fac = s.buildings.filter(b => live(b) && (b.kind === 'substation' || isPlant(b)));
  const wc = 0x3a3e44, R = 16 * TILE;
  const sagOf = (a: V, b: V) => Math.min(9, 0.03 * Math.hypot(a[0] - b[0], a[2] - b[2]) + 0.8);
  const tw = (p: { x: number; y: number; z: number }) => { const ph: V[] = []; for (const sg of [-1, 1]) for (const [L, yb] of PYLON_PH) ph.push([p.x + sg * L, p.y + yb, p.z]); return { ph, gw: [[p.x - PYLON_GW[0], p.y + PYLON_GW[1], p.z], [p.x + PYLON_GW[0], p.y + PYLON_GW[1], p.z]] as V[] }; };
  /** 線の向きに直交する方向へ並べた順に、両端の点を組にして張る（電線が交差しないように） */
  const span = (A: V[], B: V[], th: number) => {
    if (!A.length || !B.length) return;
    const dx = B[0][0] - A[0][0], dz = B[0][2] - A[0][2], L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L;
    const key = (p: V) => (p[0] * px + p[2] * pz) * 10 + p[1] * 0.01;
    const a = [...A].sort((u, v) => key(u) - key(v)), b = [...B].sort((u, v) => key(u) - key(v)), n = Math.min(a.length, b.length);
    for (let k = 0; k < n; k++) { const ia = Math.round(k * (a.length - 1) / Math.max(1, n - 1)), ib = Math.round(k * (b.length - 1) / Math.max(1, n - 1)); sagWire(g, a[ia], b[ib], sagOf(a[ia], b[ib]), th, wc, fine ? 8 : 4); }
  };
  /** 引き込みの鉄構：敷地の縁の、相手に近い所に立てる門形の鉄柱。電線の取り付け点（6 相と地線 2 本）を返す */
  const gantry = (b: Building, tx: number, tz: number) => {
    const x0 = b.x * TILE + 5, x1 = (b.x + b.w) * TILE - 5, z0 = b.y * TILE + 5, z1 = (b.y + b.h) * TILE - 5;
    const gx = Math.max(x0, Math.min(x1, tx)), gz = Math.max(z0, Math.min(z1, tz)), dx = tx - gx, dz = tz - gz, L = Math.hypot(dx, dz) || 1, px = -dz / L, pz = dx / L, y = hA(gx, gz), Hh = 18, col = 0x9aa0a6;
    for (const sg of [-1, 1]) { const X = gx + px * 8.5 * sg, Z = gz + pz * 8.5 * sg; g.box(X, y, Z, 0.7, Hh + 0.6, 0.7, col); g.box(X, y, Z, 1.6, 0.5, 1.6, 0xb8b4aa); }
    sagWire(g, [gx - px * 8.5, y + Hh, gz - pz * 8.5], [gx + px * 8.5, y + Hh, gz + pz * 8.5], 0, 0.6, col, 1); // 梁
    const ph: V[] = []; for (let k = 0; k < 6; k++) { const o = -7.5 + k * 3; ph.push([gx + px * o, y + Hh - 1.6, gz + pz * o]); if (fine) g.box(gx + px * o, y + Hh - 1.6, gz + pz * o, 0.3, 1.6, 0.3, 0x6f8fa8); }
    return { ph, gw: [[gx - px * 8.5, y + Hh + 0.6, gz - pz * 8.5], [gx + px * 8.5, y + Hh + 0.6, gz + pz * 8.5]] as V[] };
  };
  // 鉄塔どうし（各鉄塔からいちばん近い鉄塔へ）
  const done = new Set<string>();
  pyl.forEach((p, i) => {
    let best = -1, bd = R; pyl.forEach((q, j) => { if (j !== i) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < bd) { bd = d; best = j; } } });
    if (best < 0) return; const k = i < best ? `${i}-${best}` : `${best}-${i}`; if (done.has(k)) return; done.add(k);
    const A = tw(p), B = tw(pyl[best]); span(A.ph, B.ph, 0.14); span(A.gw, B.gw, 0.09);
    // 2 番目に近い鉄塔へもつなぐ（列が途切れないように。ただし 1 番目と反対側にあるときだけ）
    let b2 = -1, d2 = R; pyl.forEach((q, j) => { if (j !== i && j !== best) { const d = Math.hypot(p.x - q.x, p.z - q.z), dot = (q.x - p.x) * (pyl[best].x - p.x) + (q.z - p.z) * (pyl[best].z - p.z); if (d < d2 && dot < 0) { d2 = d; b2 = j; } } });
    if (b2 >= 0) { const k2 = i < b2 ? `${i}-${b2}` : `${b2}-${i}`; if (!done.has(k2)) { done.add(k2); const C = tw(pyl[b2]); span(A.ph, C.ph, 0.14); span(A.gw, C.gw, 0.09); } }
  });
  // 発電所・変電所 → いちばん近い鉄塔
  for (const b of fac) {
    const cx = (b.x + b.w / 2) * TILE, cz = (b.y + b.h / 2) * TILE;
    let best = -1, bd = R; pyl.forEach((q, j) => { const d = Math.hypot(cx - q.x, cz - q.z); if (d < bd) { bd = d; best = j; } });
    if (best >= 0) { const q = pyl[best], G = gantry(b, q.x, q.z), T = tw(q); span(G.ph, T.ph, 0.14); span(G.gw, T.gw, 0.09); continue; }
    if (b.kind === 'substation') continue;
    let sb: Building | null = null, sd = 10 * TILE; for (const o of fac) if (o.kind === 'substation') { const d = Math.hypot(cx - (o.x + o.w / 2) * TILE, cz - (o.y + o.h / 2) * TILE); if (d < sd) { sd = d; sb = o; } }
    if (sb) { const ox = (sb.x + sb.w / 2) * TILE, oz = (sb.y + sb.h / 2) * TILE, A = gantry(b, ox, oz), B = gantry(sb, cx, cz); span(A.ph, B.ph, 0.12); span(A.gw, B.gw, 0.08); }
  }
}

/** 道ばたの水道・下水の設備（品質「中」以上）：車道のマンホール（下水は丸、上水は小さな角の鉄蓋）、歩道の消火栓と赤い標識、橋に沿う水管橋 */
export function drawUtilities(s: GameState, g: Geo, roadY: (i: number, x: number, z: number) => number, hw: (t: number) => number): void {
  const br = new Set(s.bridge ?? []), tun = new Set(s.tunnel ?? []);
  const isR = (x: number, y: number) => inMap(x, y) && !!s.road[idx(x, y)];
  for (let i = 0; i < W * H; i++) {
    const t = s.road[i]; if (!t || tun.has(i)) continue;
    const x = i % W, y = (i / W) | 0, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, ew = isR(x + 1, y) || isR(x - 1, y), ns = isR(x, y + 1) || isR(x, y - 1);
    if (ew && ns) continue; // 交差点は路面の標示が多いので置かない
    const along = ew ? 1 : 0, r = hash(x, y, 91), w = hw(t);
    if (!br.has(i)) {
      if (r < 0.6) { const o = (r * 20 % 1 - 0.5) * 16, mx = cx + (along ? o : 0.8), mz = cz + (along ? 0.8 : o); g.cyl(mx, roadY(i, mx, mz) + 0.12, mz, 0.42, 0.05, 0x4a4844, 8); g.cyl(mx, roadY(i, mx, mz) + 0.17, mz, 0.3, 0.01, 0x3a3834, 8); } // 下水のマンホール
      if (r > 0.75) { const mx = cx + (along ? -6 : -1.6), mz = cz + (along ? -1.6 : -6); g.box(mx, roadY(i, mx, mz) + 0.12, mz, 0.5, 0.05, 0.5, 0x5a5650); } // 仕切弁の小さな蓋（上水）
      if (t <= 2 && (x * 7 + y * 13) % 5 === 0) { // 消火栓（地上式の黄色い柱と、赤い丸の標識）
        const hx = cx + (along ? 4 : w), hz = cz + (along ? w : 4), hy = roadY(i, hx, hz);
        g.cyl(hx, hy, hz, 0.22, 0.75, 0xe8c030, 8); g.cyl(hx, hy + 0.75, hz, 0.26, 0.14, 0xd8342a, 8); g.box(hx, hy + 0.4, hz, along ? 0.12 : 0.62, 0.14, along ? 0.62 : 0.12, 0xe8c030);
        g.cyl(hx + (along ? 1.2 : 0), hy, hz + (along ? 0 : 1.2), 0.04, 2.3, 0xd8342a, 4); g.blob(hx + (along ? 1.2 : 0), hy + 2.4, hz + (along ? 0 : 1.2), along ? 0.42 : 0.04, 0.42, along ? 0.04 : 0.42, 0xd8342a, 8);
      }
    } else if (t <= 2) { // 水管橋：橋の横を通る水道管（青い管と、受け台）
      const off = w + 2.2, px = cx + (along ? 0 : off), pz = cz + (along ? off : 0), py = roadY(i, px, pz) - 0.8;
      g.box(px, py, pz, along ? TILE : 1.1, 1.1, along ? 1.1 : TILE, 0x5f86a8);
      for (const k of [-10, 0, 10]) g.box(px + (along ? k : 0), py - 0.5, pz + (along ? 0 : k), along ? 0.4 : 1.4, 0.5, along ? 1.4 : 0.4, 0x8a8f96);
    }
  }
}

/** 地下の管が届く道路：上水（1）・下水（2）・都市ガス（4）。施設の前の道路から道路網をたどり、施設の容量と需要の比の割合の道路まで届く（容量が足りていれば、つながった道路すべて） */
export function pipeReach(s: GameState): Uint8Array {
  const out = new Uint8Array(W * H), conn = roadInfo(s).conn, st = s.stats;
  const nConn = (() => { let n = 0; for (let i = 0; i < W * H; i++) if (s.road[i] && conn[i]) n++; return n; })();
  const run = (fams: string[], cap: number, dem: number, bit: number) => {
    const src = s.buildings.filter(b => b.status === 'operating' && fams.includes(DEFS[b.kind].fam as string) && b.acc >= 0);
    if (!src.length) return;
    const lim = dem > 0 ? Math.round(nConn * Math.min(1, cap / dem)) + src.length * 6 : nConn;
    const q: number[] = [], seen = new Uint8Array(W * H);
    for (const b of src) if (!seen[b.acc]) { seen[b.acc] = 1; q.push(b.acc); }
    let n = 0;
    for (let h = 0; h < q.length && n < lim; h++) { const i = q[h]; out[i] |= bit; n++; const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (!seen[j] && s.road[j]) { seen[j] = 1; q.push(j); } } }
  };
  run(['water'], st.waterCap, st.waterDemand, 1); run(['sewage'], st.sewageCap, st.sewageDemand, 2); run(['gas'], st.gasCap, st.gasDemand, 4);
  return out;
}
/** 地下の管の地図：道路の下に青＝上水・茶＝下水・黄＝ガスの線（区画の中を 3 本並べ、つながる向きへ延ばす） */
export function pipeOverlay(s: GameState, g: Geo, pr: Uint8Array, roadY: (i: number, x: number, z: number) => number): void {
  const COL: [number, number, number][] = [[1, 0x2a8ae0, -4], [2, 0x9a5a2a, 0], [4, 0xe8c020, 4]];
  for (let i = 0; i < W * H; i++) {
    const v = pr[i]; if (!v) continue;
    const x = i % W, y = (i / W) | 0, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, yy = roadY(i, cx, cz) + 0.5;
    for (const [bit, col, o] of COL) { if (!(v & bit)) continue;
      const has = (dx: number, dy: number) => inMap(x + dx, y + dy) && !!(pr[idx(x + dx, y + dy)] & bit);
      const seg = (x0: number, z0: number, x1: number, z1: number) => g.quad([x0, yy, z1], [x1, yy, z1], [x1, yy, z0], [x0, yy, z0], col);
      const t = 1.1, any = has(1, 0) || has(-1, 0) || has(0, 1) || has(0, -1);
      if (has(1, 0) || !any) seg(cx + o - t, cz + o - t, x * TILE + TILE, cz + o + t);
      if (has(-1, 0)) seg(x * TILE, cz + o - t, cx + o + t, cz + o + t);
      if (has(0, 1)) seg(cx + o - t, cz + o - t, cx + o + t, y * TILE + TILE);
      if (has(0, -1)) seg(cx + o - t, y * TILE, cx + o + t, cz + o + t);
      if (bit === 2 && (x + y) % 2 === 0) seg(cx - 1.8, cz - 1.8, cx + 1.8, cz + 1.8); // マンホールの位置
    }
  }
}
