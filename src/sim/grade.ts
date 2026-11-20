// v94：立体の道路（立体交差・陸橋・歩道橋）の形を、区画の並びから決める。
// 操作の可否（actions.ts）・通行の計算（core.ts）・描画（render/scene.ts）が同じ答えを使い、
// 「見た目で通れない所を車が通る」「置いたのに形が成り立たない」をなくす。
//
// 立体交差（s.flyover）：幹線の交差点の上を、幹線の中央 2 車線が高架でまたぐ（オーバーパス）。
//   ・高架の路面は地面から FLY_H（6.0m：桁下 4.7m＋桁 1.3m）。坂は前後 FLY_RAMP 区画（60m）で、縦断勾配 10%
//     （道路構造令の設計速度 40km/h の特例値。前は 30m で 7.5m＝25%）。
//   ・坂の区画（交差点の前後 2 区画）はまっすぐな幹線で、脇道・交差点・線路・橋・トンネル・陸橋がないこと。
//   ・坂の先（3 区画目）に道路が続くこと（高架が行き止まりに下りない）。
//   ・同じ幹線で FLY_MERGE 区画（180m）以内に続く立体交差は 1 本の高架にまとめる。間の平らな高架の下は、脇道や交差点があってよい。
//   ・向きの違う立体交差どうしの高架（坂を含む）は重ねない（十字に重なる 2 層・3 層の高架は作らない）。
//   ・高架の上の車は、坂の手前の平面の区画でだけ下の道と行き来できる（core.ts では高架を 1 つの別の節点にする）。
// 陸橋（s.overpass）：地上の線路の踏切を、道路が線路の上で越える（跨線橋）。
//   ・路面は地面から OVP_H（6.5m）。坂は前後 OVP_RAMP 区画（60m）、約 11%。踏切の区画は道路がまっすぐ線路を横切ること。
//   ・坂の区画はまっすぐな道路で、脇道・交差点・線路・橋・トンネルがなく、別の陸橋の坂や立体交差と重ならないこと。坂の先に道路が続くこと。
// 形が成り立たないもの（古いセーブ・あとから道路を変えた所）は、データは残したまま「平面（踏切・平面交差）」として扱う。
import { W, H } from './config';
import type { GameState } from './types';

export const FLY_RAMP = 2, FLY_MERGE = 6, FLY_H = 6.0, OVP_RAMP = 2, OVP_H = 6.5;

const inM = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
const ix = (x: number, y: number) => y * W + x;
const D4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** 交差点か：道路の区画で、3 方向以上に道路がつながり、そのうち 2 本以上が幹線か国道 */
export function isJunction(s: GameState, i: number): boolean {
  if (!s.road[i]) return false;
  const x = i % W, y = (i / W) | 0; let n = 0, big = s.road[i] >= 2 ? 1 : 0;
  for (const [dx, dy] of D4) { const xx = x + dx, yy = y + dy; if (!inM(xx, yy)) continue; const r = s.road[ix(xx, yy)]; if (r) { n++; if (r >= 2) big++; } }
  return n >= 3 && big >= 2;
}

/** 1 本の高架（立体交差をまとめたもの）。ew＝東西、line＝道の行（東西なら y）、j0・j1＝両端の交差点の位置（東西なら x） */
export interface FlySpan { ew: boolean; line: number; j0: number; j1: number; at: number[]; tiles: number[]; land0: number; land1: number }
export interface Overpass { i: number; ew: boolean; ramps: number[]; land0: number; land1: number }
export interface GradeLayout {
  spans: FlySpan[];
  /** 区画→その上を通る高架（spans の番号） */
  spanOf: Map<number, number>;
  /** 高架の坂の区画（平らな所は含まない） */
  flyRamp: Set<number>;
  /** 形が成り立つ立体交差の区画 */
  flyOk: Set<number>;
  /** 形が成り立たない立体交差と理由 */
  flyBad: Map<number, string>;
  ovp: Map<number, Overpass>;
  /** 陸橋の坂の区画→陸橋の区画 */
  ovpRamp: Map<number, number>;
  ovpBad: Map<number, string>;
  /** 置けない所にある歩道橋と理由（描かない・効かない） */
  footBad: Map<number, string>;
}

const T = (ew: boolean, line: number, a: number) => (ew ? (inM(a, line) ? ix(a, line) : -1) : (inM(line, a) ? ix(line, a) : -1));
/** 区画 t に、向き ew と直角の方向から道路がつながっているか（脇道） */
function sideRoad(s: GameState, t: number, ew: boolean): boolean {
  const x = t % W, y = (t / W) | 0;
  for (const [dx, dy] of ew ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]]) { const a = x + dx, b = y + dy; if (inM(a, b) && s.road[ix(a, b)]) return true; }
  return false;
}
const has = (v: number[] | undefined, i: number) => !!v && v.includes(i);

/** 陸橋 1 か所の形を調べる。成り立てば Overpass、成り立たなければ理由 */
function overpassShape(s: GameState, i: number, taken: Map<number, number>): Overpass | string {
  if (!s.road[i] || !s.rail?.[i]) return '踏切（道路と線路が交わる区画）ではありません';
  if (s.railGrade?.[i]) return '線路が高架か地下なので、踏切はありません';
  const x = i % W, y = (i / W) | 0, r = (dx: number, dy: number) => inM(x + dx, y + dy) && !!s.road[ix(x + dx, y + dy)];
  const ew = r(1, 0) && r(-1, 0), ns = r(0, 1) && r(0, -1);
  if (ew === ns) return ew ? '踏切が交差点になっています（陸橋は道路がまっすぐ線路を越える所だけ）' : '道路が線路をまっすぐ横切っていません（行き止まり・曲がり角の踏切には陸橋を架けられません）';
  const line = ew ? y : x, a0 = ew ? x : y, ramps: number[] = [];
  for (const sg of [-1, 1]) for (let k = 1; k <= OVP_RAMP + 1; k++) {
    const t = T(ew, line, a0 + sg * k);
    if (t < 0 || !s.road[t]) return k > OVP_RAMP ? '陸橋の坂の先に道路がありません（坂は前後 60m、その先に道路が要ります）' : '陸橋の坂（前後 60m）の道路が途切れています';
    if (k > OVP_RAMP) continue;
    if (s.rail?.[t] && (s.railGrade?.[t] ?? 0) !== 2) return '陸橋の坂（前後 60m）に別の線路があります';
    if (has(s.bridge, t) || has(s.tunnel, t)) return '陸橋の坂（前後 60m）が橋・トンネルと重なります';
    if (sideRoad(s, t, ew)) return '陸橋の坂の途中（前後 60m）に脇道・交差点があります';
    if (taken.has(t)) return '近くの陸橋の坂と重なります';
    ramps.push(t);
  }
  return { i, ew, ramps, land0: T(ew, line, a0 - OVP_RAMP - 1), land1: T(ew, line, a0 + OVP_RAMP + 1) };
}

/** 立体交差の幹線の向きの候補（まっすぐ通り抜ける向き。両方なら道路の等級の高い方・同じ道に立体交差が多い方・東西の順） */
function flyAxes(s: GameState, i: number, list: number[]): boolean[] {
  const x = i % W, y = (i / W) | 0, g = (dx: number, dy: number) => (inM(x + dx, y + dy) ? s.road[ix(x + dx, y + dy)] : 0);
  const eG = Math.min(g(1, 0), g(-1, 0)), nG = Math.min(g(0, 1), g(0, -1)), out: boolean[] = [];
  if (eG >= 2) out.push(true); if (nG >= 2) out.push(false);
  if (out.length === 2) {
    const near = (ew: boolean) => list.filter(j => j !== i && (ew ? ((j / W) | 0) === y && Math.abs(j % W - x) <= FLY_MERGE : j % W === x && Math.abs(((j / W) | 0) - y) <= FLY_MERGE)).length;
    if (nG > eG || (nG === eG && near(false) > near(true))) out.reverse();
  }
  return out;
}

/** 同じ道の上に並ぶ交差点（位置 at）を 1 本の高架として調べる */
function spanShape(s: GameState, ew: boolean, line: number, at: number[], ovpRamp: Map<number, number>, ovp: Map<number, Overpass>): FlySpan | string {
  const j0 = at[0], j1 = at[at.length - 1], tiles: number[] = [];
  for (let a = j0 - FLY_RAMP - 1; a <= j1 + FLY_RAMP + 1; a++) {
    const t = T(ew, line, a), land = a < j0 - FLY_RAMP || a > j1 + FLY_RAMP, ramp = !land && (a < j0 || a > j1);
    if (t < 0 || !s.road[t]) return land ? '高架の坂の先に道路がありません（坂は交差点の前後 60m、その先に道路が要ります）' : '高架と坂の区間（交差点の前後 60m）の道路が途切れています';
    if (land) continue;
    if (s.road[t] < 2) return '高架と坂の区間（交差点の前後 60m）が幹線になっていません';
    if (s.rail?.[t] && (s.railGrade?.[t] ?? 0) <= 1) return '高架と坂の区間に線路があります（線路と交わる所には置けません）';
    if (has(s.bridge, t) || has(s.tunnel, t)) return '高架と坂の区間が橋・トンネルと重なります';
    if (ovp.has(t) || ovpRamp.has(t)) return '高架と坂の区間が陸橋と重なります';
    if (ramp && sideRoad(s, t, ew)) return '高架の坂の途中（交差点の前後 60m）に脇道・交差点があります';
    tiles.push(t);
  }
  return { ew, line, j0, j1, at, tiles, land0: T(ew, line, j0 - FLY_RAMP - 1), land1: T(ew, line, j1 + FLY_RAMP + 1) };
}

/** 立体の道路の形をまとめて決める。fly・ovp を渡すと、その並びで調べる（置く前の判定に使う）。並びの前の物ほど優先 */
export function gradeLayout(s: GameState, fly: number[] = s.flyover ?? [], ovpL: number[] = s.overpass ?? [], foot: number[] = s.footbridge ?? []): GradeLayout {
  const ovp = new Map<number, Overpass>(), ovpRamp = new Map<number, number>(), ovpBad = new Map<number, string>();
  for (const i of ovpL) {
    if (ovp.has(i)) continue;
    const r = overpassShape(s, i, ovpRamp);
    if (typeof r === 'string') { ovpBad.set(i, r); continue; }
    ovp.set(i, r); for (const t of r.ramps) ovpRamp.set(t, i);
  }
  // 立体交差：前から順に、置いても全体の形が成り立つものだけ受け入れる
  const acc: { i: number; ew: boolean }[] = [], flyBad = new Map<number, string>();
  const group = (items: { i: number; ew: boolean }[]) => {
    const lines = new Map<string, { ew: boolean; line: number; at: number[] }>();
    for (const o of items) { const x = o.i % W, y = (o.i / W) | 0, line = o.ew ? y : x, k = (o.ew ? 'e' : 'n') + line; if (!lines.has(k)) lines.set(k, { ew: o.ew, line, at: [] }); lines.get(k)!.at.push(o.ew ? x : y); }
    const out: { ew: boolean; line: number; at: number[] }[] = [];
    for (const L of lines.values()) { const at = [...new Set(L.at)].sort((p, q) => p - q); let cur = [at[0]]; for (let k = 1; k < at.length; k++) { if (at[k] - cur[cur.length - 1] <= FLY_MERGE) cur.push(at[k]); else { out.push({ ew: L.ew, line: L.line, at: cur }); cur = [at[k]]; } } out.push({ ew: L.ew, line: L.line, at: cur }); }
    return out;
  };
  const build = (items: { i: number; ew: boolean }[]): FlySpan[] | string => {
    const spans: FlySpan[] = [], used = new Map<number, boolean>();
    for (const gq of group(items)) {
      const r = spanShape(s, gq.ew, gq.line, gq.at, ovpRamp, ovp); if (typeof r === 'string') return r;
      for (const t of r.tiles) { const u = used.get(t); if (u !== undefined && u !== r.ew) return '向きの違う立体交差の高架とぶつかります（十字に重なる高架は作れません）'; used.set(t, r.ew); }
      spans.push(r);
    }
    return spans;
  };
  for (const i of fly) {
    if (acc.some(o => o.i === i)) continue;
    if (!s.road[i] || !isJunction(s, i)) { flyBad.set(i, '幹線どうし（国道を含む）の交差点ではありません'); continue; }
    if (s.rail?.[i] && (s.railGrade?.[i] ?? 0) <= 1) { flyBad.set(i, '線路と交わる所には置けません'); continue; }
    if (has(s.bridge, i) || has(s.tunnel, i) || ovp.has(i)) { flyBad.set(i, '橋・トンネル・陸橋の所には置けません'); continue; }
    const axes = flyAxes(s, i, fly);
    if (!axes.length) { flyBad.set(i, '幹線がまっすぐ通り抜けていない交差点（T 字の付け根・曲がり角）には置けません'); continue; }
    let why = '';
    for (const ew of axes) { const r = build([...acc, { i, ew }]); if (typeof r === 'string') { why ||= r; continue; } acc.push({ i, ew }); why = ''; break; }
    if (why) flyBad.set(i, why);
  }
  const spans = (build(acc) as FlySpan[]) || [], spanOf = new Map<number, number>(), flyRamp = new Set<number>();
  spans.forEach((sp, k) => { for (const t of sp.tiles) spanOf.set(t, k); for (let a = sp.j0 - FLY_RAMP; a <= sp.j1 + FLY_RAMP; a++) if (a < sp.j0 || a > sp.j1) flyRamp.add(T(sp.ew, sp.line, a)); });
  const footBad = new Map<number, string>();
  for (const i of foot) {
    if (spanOf.has(i)) footBad.set(i, '立体交差の高架・坂の所には歩道橋を架けられません');
    else if (ovp.has(i) || ovpRamp.has(i)) footBad.set(i, '陸橋とその坂の所には歩道橋を架けられません');
    else if (s.rail?.[i] && !s.railGrade?.[i]) footBad.set(i, '踏切の上には歩道橋を架けられません');
  }
  return { spans, spanOf, flyRamp, flyOk: new Set(acc.map(o => o.i)), flyBad, ovp, ovpRamp, ovpBad, footBad };
}

type Key = [number, unknown, unknown, unknown, unknown, unknown, number, number, number];
const cache = new WeakMap<GameState, { k: Key; v: GradeLayout }>();
/** いまの状態の形。道路・線路・橋などが変わると roadVersion が上がり、立体の並びは変えるたびに新しい配列になるので、
 *  その版と配列（と長さ）が同じ間は使い回す（道路を引く区画ごとに呼ばれるので、文字列を作らずに比べる） */
export function grade(s: GameState): GradeLayout {
  const k: Key = [s.roadVersion, s.flyover, s.overpass, s.footbridge, s.bridge, s.tunnel, s.flyover?.length ?? 0, s.overpass?.length ?? 0, s.footbridge?.length ?? 0];
  const c = cache.get(s); if (c && c.k.every((v, q) => v === k[q])) return c.v;
  const v = gradeLayout(s); cache.set(s, { k, v }); return v;
}

/** 道路を新しく置く区画 i が、立体交差・陸橋の坂の横につながってしまうなら理由（坂の途中に脇道はつくれない） */
export function rampSideError(s: GameState, i: number): string {
  const L = grade(s), x = i % W, y = (i / W) | 0;
  for (const [dx, dy] of D4) {
    const a = x + dx, b = y + dy; if (!inM(a, b)) continue; const t = ix(a, b);
    if (L.flyRamp.has(t)) { const sp = L.spans[L.spanOf.get(t)!]; if (sp.ew === (dy !== 0)) return '立体交差の坂の横には道路をつなげられません（坂の途中は脇道を出せません）'; }
    const o = L.ovpRamp.get(t); if (o !== undefined && L.ovp.get(o)!.ew === (dy !== 0)) return '陸橋の坂の横には道路をつなげられません（坂の途中は脇道を出せません）';
    if (L.ovp.has(t) && L.ovp.get(t)!.ew === (dy !== 0)) return '陸橋の上には道路をつなげられません';
    // トンネルの途中へ横から入る道は作れない（車が山の横腹に消える）。トンネルの向き＝すでにつながっている道の向き
    if (has(s.tunnel, t)) { const r = (ex: number, ey: number) => inM(a + ex, b + ey) && ix(a + ex, b + ey) !== i && !!s.road[ix(a + ex, b + ey)];
      const ew = r(1, 0) || r(-1, 0), ns = r(0, 1) || r(0, -1);
      if ((dy !== 0 && ew && !ns) || (dx !== 0 && ns && !ew)) return 'トンネルの途中に横から道路をつなげられません（つなぐのはトンネルの出入口の先で）'; }
  }
  return '';
}

/** 形が成り立たず平面として扱っている立体の数（読込時・毎月の注意に使う） */
export function gradeIssues(s: GameState): string[] {
  const L = grade(s), out: string[] = [];
  if (L.flyBad.size) out.push(`立体交差 ${L.flyBad.size} か所は、まわりの道路の形では高架が成り立たないため、信号のある平面交差として扱っています（例：${[...L.flyBad.values()][0]}）`);
  if (L.ovpBad.size) out.push(`陸橋 ${L.ovpBad.size} か所は、まわりの道路の形では坂が成り立たないため、踏切として扱っています（例：${[...L.ovpBad.values()][0]}）`);
  if (L.footBad.size) out.push(`歩道橋 ${L.footBad.size} か所は、高架・陸橋・踏切と重なるため使えません（例：${[...L.footBad.values()][0]}）`);
  return out;
}
