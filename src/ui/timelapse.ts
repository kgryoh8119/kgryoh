// 街の成長の振り返り（タイムラプス）：毎年 4 月に街の形（建物と道路）を端末に記録し、上空から早送りで見せる。動画にも保存できる
import type { GameState, Building, Kind } from '../sim/index';
import { DEFS, W, H, TILE, REAL } from '../sim/index';

type Snap = { m: number; pop: number; b: string; r: string };
const KINDS = Object.keys(DEFS) as Kind[], KI = new Map(KINDS.map((k, i) => [k, i]));
const keyOf = (s: GameState) => `sumu-tl:${s.seed}:${s.cityName}`;
function load(s: GameState): Snap[] { try { const v = JSON.parse(localStorage.getItem(keyOf(s)) ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; } }
function encode(s: GameState): Snap {
  const b = s.buildings.filter(o => o.status !== 'construction').map(o => [KI.get(o.kind) ?? 0, o.x, o.y, o.w, o.h, o.lv ?? 1].map(v => v.toString(36)).join('.')).join(';');
  let r = '', last = -1, run = 0; for (let i = 0; i <= s.road.length; i++) { const v = i < s.road.length ? s.road[i] : -2; if (v === last) run++; else { if (last >= 0) r += `${last}${run.toString(36)},`; last = v; run = 1; } }
  return { m: s.month, pop: Math.round(s.stats.pop), b, r };
}
/** 毎月：4 月（と、記録がまだないとき）に街の形を残す。端末の保存が使えないときは何もしない */
export function recordTimeline(s: GameState): void {
  if (REAL) return;
  const a = load(s); if (a.length && (s.month % 12 !== 0 || a[a.length - 1].m === s.month)) return;
  if (a.length && a[a.length - 1].m > s.month) a.length = 0; // 前の街の記録（同じ名前で始め直した）は捨てる
  a.push(encode(s)); while (a.length > 40) a.splice(1, 1); // 最初の年は残す
  try { localStorage.setItem(keyOf(s), JSON.stringify(a)); } catch { /* 容量いっぱい */ }
}
export const timelineCount = (s: GameState) => load(s).length;
/** 記録から、描くためだけの街の状態をつくる（いまの状態を土台に、建物と道路だけ入れかえる） */
function stateAt(cur: GameState, sn: Snap, k: number): GameState {
  const road = new Array(W * H).fill(0); let i = 0; for (const t of sn.r.split(',')) { if (!t) continue; const v = Number(t[0]), n = parseInt(t.slice(1), 36); for (let j = 0; j < n && i < road.length; j++) road[i++] = v; }
  const bs: Building[] = sn.b ? sn.b.split(';').map((t, n) => { const [ki, x, y, w, h, lv] = t.split('.').map(v => parseInt(v, 36)); const kind = KINDS[ki] ?? 'house', d = DEFS[kind];
    return { id: 900000 + n, kind, x, y, w, h, status: 'operating', remain: 0, total: 1, builtMonth: -12, age: 5, v: (n * 37) % 100 / 100, lv, units: d.units ?? 0, hh: d.units ? [d.units * 0.2, d.units * 0.2, d.units * 0.2, d.units * 0.2, d.units * 0.1] : undefined, acc: -1, connected: true, effCap: 0, used: 0, revenue: 0, shopP: 0, sv: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], sat: [0.7, 0.7, 0.7, 0.7, 0.7], unmet: 0 } as unknown as Building; }) : [];
  const occ = new Array(W * H).fill(0); for (const b of bs) for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) occ[yy * W + xx] = b.id;
  return { ...cur, buildings: bs, road, roadAge: road.map(() => 10), occ, zone: new Array(W * H).fill(0), month: sn.m, bVersion: -1000 - k, roadVersion: -1000 - k, events: { ...cur.events, active: [] }, stats: { ...cur.stats, pop: sn.pop } } as GameState;
}
type ViewLike = { override: GameState | null; focus(tile: number, dist?: number): void; orbitBy(dx: number, dy: number): void; canvas: HTMLCanvasElement };
/** 振り返りを流す。record なら動画（webm）をつくって返す */
export async function playTimeline(cur: GameState, view: ViewLike, caption: (t: string) => void, record: boolean): Promise<Blob | null> {
  const snaps = [...load(cur), encode(cur)]; if (snaps.length < 2) return null;
  let rec: MediaRecorder | null = null; const chunks: Blob[] = [];
  if (record && typeof MediaRecorder !== 'undefined' && (view.canvas as any).captureStream) {
    try { const st = (view.canvas as any).captureStream(30); const mt = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)); rec = new MediaRecorder(st, mt ? { mimeType: mt, videoBitsPerSecond: 6e6 } : undefined); rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; rec.start(250); } catch { rec = null; }
  }
  view.focus(Math.floor(H * 0.45) * W + Math.floor(W / 2), Math.max(W, H) * TILE * 1.05);
  const per = Math.max(700, Math.min(1600, 26000 / snaps.length));
  for (let k = 0; k < snaps.length; k++) {
    view.override = k === snaps.length - 1 ? null : stateAt(cur, snaps[k], k);
    const sn = snaps[k], ev = (cur.pol?.chron ?? []).filter(c => c.m > (snaps[k - 1]?.m ?? -1) && c.m <= sn.m).slice(-1)[0]; caption(`${Math.floor(sn.m / 12) + 1} 年目　人口 ${sn.pop.toLocaleString()} 人${ev ? `\n${ev.t.replace(/（[^）]*）/g, '').slice(0, 34)}` : ''}`);
    const t0 = performance.now(); while (performance.now() - t0 < per) { view.orbitBy(0.6, 0); await new Promise(r => requestAnimationFrame(r)); }
  }
  view.override = null; caption('');
  if (!rec) return null;
  await new Promise<void>(r => { rec!.onstop = () => r(); rec!.stop(); });
  return new Blob(chunks, { type: rec.mimeType || 'video/webm' });
}
