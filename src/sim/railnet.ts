// まちづくり版の線路の形：区画の並びを、斜めも含めた 1 本の線としてたどる。
// 斜めの隣は、間の上下左右の区画に線路がないときだけつながる（L 字の角で三角形にならないように）。
// 判定（急なカーブ）・描画（曲線にする）・列車の走行・駅のつながりで共通に使う。
import { W as CW, H as CH } from './config';

// 地図の大きさ。まちづくり版を作る途中（deform）では、作っている地図の大きさに切り替える
let OW = 0, OH = 0;
export function railDims(w: number, h: number): void { OW = w; OH = h; }
let W = CW, H = CH;
const dims = () => { W = OW || CW; H = OH || CH; };

const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const;

/** 線路の区画 i のつながる隣（斜めを含む） */
export function railNbrs(has: (i: number) => boolean, i: number): number[] {
  dims();
  const x = i % W, y = (i / W) | 0, out: number[] = [];
  const at = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H && has(yy * W + xx);
  for (const [dx, dy] of D8) {
    if (!at(x + dx, y + dy)) continue;
    if (dx && dy && (at(x + dx, y) || at(x, y + dy))) continue;
    out.push((y + dy) * W + x + dx);
  }
  return out;
}

const vec = (a: number, b: number): [number, number] => { const dx = (b % W) - (a % W), dy = ((b / W) | 0) - ((a / W) | 0), l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
const cos = (u: [number, number], v: [number, number]) => u[0] * v[0] + u[1] * v[1];
const onEdge = (i: number) => { const x = i % W, y = (i / W) | 0; return x === 0 || y === 0 || x === W - 1 || y === H - 1; };

/**
 * 区画 i での曲がり方が急すぎないか。線路は 1 区画で 45 度まで、前後 2 区画をならして 60 度までしか曲げられない。
 * 分岐は、まっすぐ通る 2 本と、そこから 45 度以内で分かれる 1 本だけ。4 方向以上の交差（平面交差）はできない。
 * 急なら理由を返す
 */
export function sharpAt(has: (i: number) => boolean, i: number): string {
  dims();
  if (!has(i)) return '';
  const nb = railNbrs(has, i);
  if (nb.length <= 1) return '';
  if (nb.length >= 4) return '線路どうしを平面で交差させることはできません';
  const v = nb.map(j => vec(i, j));
  if (nb.length === 3) {
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      if (a === b || cos(v[a], v[b]) > -0.7) continue;
      const c = 3 - a - b;
      if (cos(v[c], v[a]) <= -0.7 || cos(v[c], v[b]) <= -0.7) return '';
    }
    return '分岐の角度が急すぎます（分かれる線路は 45 度以内に）';
  }
  if (cos(v[0], v[1]) > -0.7) return '急なカーブになります（線路は 1 区画で 45 度までしか曲げられません）';
  // 前後 2 区画をならした向き
  const far = (j: number) => { const n2 = railNbrs(has, j).filter(k => k !== i); return n2.length === 1 ? n2[0] : j; };
  const a2 = far(nb[0]), b2 = far(nb[1]);
  if (onEdge(i)) return '';
  if (cos(vec(a2, i), vec(i, b2)) < 0.49) return '急なカーブになります（線路はゆるやかに曲げてください）';
  return '';
}

/** 区画 a から b まで、斜めも使ったまっすぐな線（区画の並び） */
export function railLine(a: number, b: number): number[] {
  dims();
  const ax = a % W, ay = (a / W) | 0, bx = b % W, by = (b / W) | 0, n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)), out: number[] = [];
  for (let k = 0; k <= n; k++) { const t = n ? k / n : 0, x = Math.round(ax + (bx - ax) * t), y = Math.round(ay + (by - ay) * t), i = y * W + x; if (out[out.length - 1] !== i) out.push(i); }
  return out;
}

/** 線路を、分岐・端の区画で区切った線の並び（区画の列）にする。輪になった線も 1 本として返す */
export function railChains(has: (i: number) => boolean, tiles: number[]): number[][] {
  dims();
  const deg = new Map<number, number[]>();
  for (const i of tiles) if (has(i)) deg.set(i, railNbrs(has, i));
  const isNode = (i: number) => deg.get(i)!.length !== 2 || onEdge(i);
  const used = new Set<string>(), chains: number[][] = [];
  const key = (a: number, b: number) => a < b ? a + ':' + b : b + ':' + a;
  const walk = (start: number, next: number) => {
    const c = [start]; let prev = start, cur = next;
    used.add(key(start, next));
    for (;;) {
      c.push(cur);
      if (isNode(cur) || cur === start) break;
      const nx = deg.get(cur)!.find(j => j !== prev && !used.has(key(cur, j)));
      if (nx === undefined) break;
      used.add(key(cur, nx)); prev = cur; cur = nx;
    }
    chains.push(c);
  };
  for (const [i, nb] of deg) if (isNode(i)) for (const j of nb) if (!used.has(key(i, j))) walk(i, j);
  for (const [i, nb] of deg) for (const j of nb) if (!used.has(key(i, j))) walk(i, j); // 輪
  for (const [i, nb] of deg) if (!nb.length) chains.push([i]);
  return chains;
}
