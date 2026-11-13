// 頂点色つきの結合ジオメトリを組み立てる小さなビルダー。建物を全部まとめて数メッシュで描くために使う。
import * as THREE from 'three';

const _c = new THREE.Color();
const colorCache = new Map<number, [number, number, number]>();
function rgb(hex: number): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) { _c.setHex(hex); c = [_c.r, _c.g, _c.b]; colorCache.set(hex, c); }
  return c;
}

export type V3 = [number, number, number];

export class Geo {
  /** 根元を暗くする（建物の町並みで使う。小物や車には使わない） */
  static ao = false;
  pos: number[] = [];
  col: number[] = [];
  nor: number[] = [];
  ix: number[] = [];
  uv: number[] | null = null;
  /** 窓ごとの印（x：1＋乱数、y：窓の中心の高さ）。夜の明かりを窓 1 枚単位で点けるため。0 は印なし */
  wid: number[] = []; widv: [number, number] = [0, 0];
  /** 面の種類（0 なし・1 外壁・2 平らな屋上・3 瓦などの傾いた屋根）。壁や屋根の模様をシェーダーで描くため */
  surf: number[] = []; surfv = 0;
  /** 外壁の素材（v86）：大きな箱の側面と妻壁に付ける面の種類。1 は区画の種類で決まる既定の模様、4〜10 は素材ごとの模様（窯業サイディング・ガルバ・タイル・打放し・塗り壁・横張り・板張り。scene.ts の BODY_GLSL） */
  wallMat = 1;
  // ローカル→ワールド変換（平行移動＋Y 軸回転）
  ox = 0; oy = 0; oz = 0; cos = 1; sin = 0;

  constructor(withUv = false) { if (withUv) this.uv = []; }

  at(ox: number, oy: number, oz: number, rot = 0): this {
    this.ox = ox; this.oy = oy; this.oz = oz; this.cos = Math.cos(rot); this.sin = Math.sin(rot);
    return this;
  }

  private push(x: number, y: number, z: number, n: V3, c: [number, number, number], shade: number) {
    this.pos.push(this.ox + x * this.cos + z * this.sin, this.oy + y, this.oz - x * this.sin + z * this.cos);
    this.nor.push(n[0], n[1], n[2]);
    this.col.push(c[0] * shade, c[1] * shade, c[2] * shade);
    this.wid.push(this.widv[0], this.widv[1]); this.surf.push(this.surfv);
  }

  private normal(a: V3, b: V3, c: V3): V3 {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    return [nx * this.cos + nz * this.sin, ny, -nx * this.sin + nz * this.cos];
  }

  private rotN(n: V3): V3 { return [n[0] * this.cos + n[2] * this.sin, n[1], -n[0] * this.sin + n[2] * this.cos]; }
  /** 頂点ごとの法線と明るさを持つ 4 点（円柱や球をなめらかに見せる） */
  quadN(p: [V3, V3, V3, V3], n: [V3, V3, V3, V3], color: number, sh: [number, number, number, number]): void {
    const k = rgb(color), v = this.pos.length / 3;
    for (let j = 0; j < 4; j++) this.push(p[j][0], p[j][1], p[j][2], this.rotN(n[j]), k, sh[j]);
    this.ix.push(v, v + 1, v + 2, v, v + 2, v + 3);
    if (this.uv) this.uv.push(0, 0, 1, 0, 1, 1, 0, 1);
  }
  /** 頂点ごとの法線つきの三角（丸く見せたい面：木の葉・車体） */
  triN(a: V3, b: V3, c: V3, na: V3, nb: V3, nc: V3, color: number, shade = 1): void {
    const k = rgb(color), v = this.pos.length / 3;
    this.push(a[0], a[1], a[2], this.rotN(na), k, shade); this.push(b[0], b[1], b[2], this.rotN(nb), k, shade); this.push(c[0], c[1], c[2], this.rotN(nc), k, shade);
    this.ix.push(v, v + 1, v + 2);
    if (this.uv) this.uv.push(0, 0, 0, 0, 0, 0);
  }
  tri(a: V3, b: V3, c: V3, color: number, shade = 1): void {
    const n = this.normal(a, b, c), k = rgb(color), v = this.pos.length / 3;
    this.push(a[0], a[1], a[2], n, k, shade); this.push(b[0], b[1], b[2], n, k, shade); this.push(c[0], c[1], c[2], n, k, shade);
    this.ix.push(v, v + 1, v + 2);
    if (this.uv) this.uv.push(0, 0, 0, 0, 0, 0);
  }

  /** 反時計回り（表から見て）の 4 点 */
  quad(a: V3, b: V3, c: V3, d: V3, color: number, shade = 1, uv?: number[]): void {
    const n = this.normal(a, b, c), k = rgb(color), v = this.pos.length / 3;
    this.push(a[0], a[1], a[2], n, k, shade); this.push(b[0], b[1], b[2], n, k, shade); this.push(c[0], c[1], c[2], n, k, shade); this.push(d[0], d[1], d[2], n, k, shade);
    this.ix.push(v, v + 1, v + 2, v, v + 2, v + 3);
    if (this.uv) { const u = uv ?? [0, 0, 1, 0, 1, 1, 0, 1]; this.uv.push(u[0], u[1], u[2], u[3], u[4], u[5], u[6], u[7]); }
  }

  /** 箱。cy は底面の高さ。top / side で色を変えられる */
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: number, top?: number, noBottom = true): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy, y1 = cy + sy, z0 = cz - sz / 2, z1 = cz + sz / 2;
    const sv0 = this.surfv, big = sv0 === 0 && sy >= 2.4 && y1 > 1.5 && Math.min(sx, sz) >= 2.5 && sy < 400; if (big) this.surfv = this.wallMat; // 大きな箱の側面は外壁
    // 地面に接する壁は根元を少し暗く（環境光の遮蔽。建物が地面に沈んで見える）
    if (Geo.ao && cy <= 0.35 && cy > -0.5 && sy >= 1.2 && sy < 400) {
      const a = Math.max(0.68, 1 - 0.3 * Math.min(1, sy / 4)), t2 = Math.min(1, 2.2 / sy), ym = y0 + sy * t2;
      const side = (p: [V3, V3, V3, V3], sh: number) => { const n = this.normal(p[0], p[1], p[2]), k = rgb(color);
        // 下の帯（暗→明）と上の残り
        const lo = (q: V3, r: V3): V3 => [q[0] + (r[0] - q[0]) * t2, q[1] + (r[1] - q[1]) * t2, q[2] + (r[2] - q[2]) * t2];
        const m0 = lo(p[0], p[3]), m1 = lo(p[1], p[2]); let v = this.pos.length / 3;
        this.push(p[0][0], p[0][1], p[0][2], n, k, sh * a); this.push(p[1][0], p[1][1], p[1][2], n, k, sh * a); this.push(m1[0], m1[1], m1[2], n, k, sh); this.push(m0[0], m0[1], m0[2], n, k, sh);
        this.ix.push(v, v + 1, v + 2, v, v + 2, v + 3); v += 4;
        this.push(m0[0], m0[1], m0[2], n, k, sh); this.push(m1[0], m1[1], m1[2], n, k, sh); this.push(p[2][0], p[2][1], p[2][2], n, k, sh); this.push(p[3][0], p[3][1], p[3][2], n, k, sh);
        this.ix.push(v, v + 1, v + 2, v, v + 2, v + 3);
        if (this.uv) this.uv.push(0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1); void ym; };
      side([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], 1);
      side([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], 0.82);
      side([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], 0.9);
      side([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], 0.86);
    } else {
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color);            // +z 前
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, 0.82);      // -z 後
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, 0.9);       // +x
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, 0.86);      // -x
    }
    if (big) this.surfv = 2;
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top ?? color);     // 上
    this.surfv = sv0;
    if (!noBottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color, 0.6);
  }

  /** 切妻屋根。axis は棟の向き。妻壁は wall 色で塞ぐ */
  gable(cx: number, cy: number, cz: number, sx: number, sz: number, h: number, color: number, axis: 'x' | 'z', wall: number, over = 0.45): void {
    const sv0 = this.surfv; this.gable0(cx, cy, cz, sx, sz, h, color, axis, wall, over); this.surfv = sv0;
  }
  private gable0(cx: number, cy: number, cz: number, sx: number, sz: number, h: number, color: number, axis: 'x' | 'z', wall: number, over: number): void {
    this.surfv = 3;
    if (axis === 'x') {
      const x0 = cx - sx / 2 - over, x1 = cx + sx / 2 + over, z0 = cz - sz / 2 - over, z1 = cz + sz / 2 + over;
      this.quad([x0, cy, z1], [x1, cy, z1], [x1, cy + h, cz], [x0, cy + h, cz], color);
      this.quad([x1, cy, z0], [x0, cy, z0], [x0, cy + h, cz], [x1, cy + h, cz], color, 0.85);
      const ix0 = cx - sx / 2, ix1 = cx + sx / 2, iz0 = cz - sz / 2, iz1 = cz + sz / 2, hh = h * (sz / 2) / (sz / 2 + over); this.surfv = this.wallMat;
      this.tri([ix1, cy, iz1], [ix1, cy, iz0], [ix1, cy + hh, cz], wall, 0.9);
      this.tri([ix0, cy, iz0], [ix0, cy, iz1], [ix0, cy + hh, cz], wall, 0.86);
    } else {
      const x0 = cx - sx / 2 - over, x1 = cx + sx / 2 + over, z0 = cz - sz / 2 - over, z1 = cz + sz / 2 + over;
      this.quad([x1, cy, z1], [x1, cy, z0], [cx, cy + h, z0], [cx, cy + h, z1], color, 0.92);
      this.quad([x0, cy, z0], [x0, cy, z1], [cx, cy + h, z1], [cx, cy + h, z0], color, 0.8);
      const ix0 = cx - sx / 2, ix1 = cx + sx / 2, iz0 = cz - sz / 2, iz1 = cz + sz / 2, hh = h * (sx / 2) / (sx / 2 + over); this.surfv = this.wallMat;
      this.tri([ix0, cy, iz1], [ix1, cy, iz1], [cx, cy + hh, iz1], wall);
      this.tri([ix1, cy, iz0], [ix0, cy, iz0], [cx, cy + hh, iz0], wall, 0.82);
    }
    if (Geo.fineRoof && h > 0.3) this.roofEdges(cx, cy, cz, sx, sz, h, color, axis, over);
  }
  /** 屋根の厚み：軒先の鼻隠し・けらば（妻側のふち）・軒裏・棟の押さえ。紙のように薄い屋根に見えないように */
  static fineRoof = true;
  private roofEdges(cx: number, cy: number, cz: number, sx: number, sz: number, h: number, color: number, axis: 'x' | 'z', over: number): void {
    const sv = this.surfv; this.surfv = 0;
    const t = Math.min(0.24, 0.06 + h * 0.06), ax = axis === 'x';
    const U0 = (ax ? cx - sx / 2 : cz - sz / 2) - over, U1 = (ax ? cx + sx / 2 : cz + sz / 2) + over, C = ax ? cz : cx, V0 = (ax ? cz - sz / 2 : cx - sx / 2) - over, V1 = (ax ? cz + sz / 2 : cx + sx / 2) + over;
    const P = (u: number, y: number, v: number): V3 => (ax ? [u, y, v] : [v, y, u]);
    const Q = (a: V3, b: V3, c: V3, d: V3, col: number, sh: number) => (ax ? this.quad(a, b, c, d, col, sh) : this.quad(d, c, b, a, col, sh));
    const dark = 0.55;
    // 軒先（両側）
    Q(P(U0, cy - t, V1), P(U1, cy - t, V1), P(U1, cy, V1), P(U0, cy, V1), color, dark);
    Q(P(U1, cy - t, V0), P(U0, cy - t, V0), P(U0, cy, V0), P(U1, cy, V0), color, dark);
    // けらば（妻側の斜めのふち）
    Q(P(U1, cy - t, V1), P(U1, cy + h - t, C), P(U1, cy + h, C), P(U1, cy, V1), color, dark * 0.95);
    Q(P(U1, cy + h - t, C), P(U1, cy - t, V0), P(U1, cy, V0), P(U1, cy + h, C), color, dark * 0.95);
    Q(P(U0, cy + h - t, C), P(U0, cy - t, V1), P(U0, cy, V1), P(U0, cy + h, C), color, dark * 0.9);
    Q(P(U0, cy - t, V0), P(U0, cy + h - t, C), P(U0, cy + h, C), P(U0, cy, V0), color, dark * 0.9);
    // 軒裏（下から見える面）
    Q(P(U0, cy - t, V1), P(U0, cy + h - t, C), P(U1, cy + h - t, C), P(U1, cy - t, V1), 0xd8d4cc, 0.7);
    Q(P(U1, cy - t, V0), P(U1, cy + h - t, C), P(U0, cy + h - t, C), P(U0, cy - t, V0), 0xd8d4cc, 0.7);
    // 棟の押さえ
    const rw = 0.16, rh = 0.12;
    Q(P(U0, cy + h, C + rw), P(U1, cy + h, C + rw), P(U1, cy + h + rh, C), P(U0, cy + h + rh, C), color, 0.7);
    Q(P(U1, cy + h, C - rw), P(U0, cy + h, C - rw), P(U0, cy + h + rh, C), P(U1, cy + h + rh, C), color, 0.62);
    this.surfv = sv;
  }

  /** 寄棟（四角錐台ではなく単純な四角錐）屋根 */
  pyramid(cx: number, cy: number, cz: number, sx: number, sz: number, h: number, color: number): void {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, z0 = cz - sz / 2, z1 = cz + sz / 2, t: V3 = [cx, cy + h, cz], sv0 = this.surfv; this.surfv = 3;
    this.tri([x0, cy, z1], [x1, cy, z1], t, color); this.tri([x1, cy, z1], [x1, cy, z0], t, color, 0.9);
    this.tri([x1, cy, z0], [x0, cy, z0], t, color, 0.8); this.tri([x0, cy, z0], [x0, cy, z1], t, color, 0.86); this.surfv = sv0;
  }

  cyl(cx: number, cy: number, cz: number, r: number, h: number, color: number, seg = 8, top?: number, r2 = r): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
      // 側面は頂点ごとの法線でなめらかに（細い棒は面の陰影のまま）
      const ny = (r - r2) / Math.max(0.01, h), base = Geo.ao && cy <= 0.35 && cy > -0.5 && h > 1.5 ? 0.78 : 1;
      if (r > 0.3 && seg >= 6) this.quadN([[cx + c0 * r, cy, cz + s0 * r], [cx + c0 * r2, cy + h, cz + s0 * r2], [cx + c1 * r2, cy + h, cz + s1 * r2], [cx + c1 * r, cy, cz + s1 * r]], [[c0, ny, s0], [c0, ny, s0], [c1, ny, s1], [c1, ny, s1]], color, [base, 1, 1, base]);
      else { const sh = 0.8 + 0.2 * Math.max(0, Math.cos(a0 - 0.8)); this.quad([cx + c0 * r, cy, cz + s0 * r], [cx + c0 * r2, cy + h, cz + s0 * r2], [cx + c1 * r2, cy + h, cz + s1 * r2], [cx + c1 * r, cy, cz + s1 * r], color, sh); }
      if (r2 > 0.01) this.tri([cx, cy + h, cz], [cx + c1 * r2, cy + h, cz + s1 * r2], [cx + c0 * r2, cy + h, cz + s0 * r2], top ?? color);
    }
  }

  /** 低ポリの球（樹冠・雲など） */
  blob(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: number, seg = 6): void {
    const rings = seg >= 10 ? 5 : 3;
    for (let j = 0; j < rings; j++) {
      const p0 = (j / rings) * Math.PI - Math.PI / 2, p1 = ((j + 1) / rings) * Math.PI - Math.PI / 2;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const P = (p: number, a: number): V3 => [cx + Math.cos(p) * Math.cos(a) * rx, cy + Math.sin(p) * ry, cz + Math.cos(p) * Math.sin(a) * rz];
        const Nn = (p: number, a: number): V3 => { const x = Math.cos(p) * Math.cos(a) / rx, y = Math.sin(p) / ry, z = Math.cos(p) * Math.sin(a) / rz, l = Math.hypot(x, y, z) || 1; return [x / l, y / l, z / l]; };
        const S = (p: number) => 0.8 + 0.2 * (Math.sin(p) * 0.5 + 0.5); // 下側をやや暗く
        this.quadN([P(p0, a0), P(p1, a0), P(p1, a1), P(p0, a1)], [Nn(p0, a0), Nn(p1, a0), Nn(p1, a1), Nn(p0, a1)], color, [S(p0), S(p1), S(p1), S(p0)]);
      }
    }
  }

  get triangles(): number { return this.ix.length / 3; }

  /** compact：法線を持たず（材質の flatShading で面ごとに計算）、色を 1 バイトにする。頂点数が多い実在都市版で GPU のメモリを減らすため */
  build(compact = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), nv = this.pos.length / 3;
    // 保険（v82）：位置に数でない値（NaN）が混じると、three.js がエラーを出し、その形が丸ごと描かれなくなる。混じった点は 0 に置き換え、件数を window.__sumuNaN に残す（検査で見る）
    { let bad = 0; for (let i = 0; i < this.pos.length; i++) if (!Number.isFinite(this.pos[i])) { this.pos[i] = 0; bad++; } if (bad && typeof window !== 'undefined') { const w = window as unknown as { __sumuNaN?: number }; w.__sumuNaN = (w.__sumuNaN ?? 0) + bad; } }
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.pos), 3));
    if (compact) {
      const c8 = new Uint8Array(this.col.length);
      for (let i = 0; i < c8.length; i++) c8[i] = Math.max(0, Math.min(255, Math.round(this.col[i] * 255)));
      g.setAttribute('color', new THREE.BufferAttribute(c8, 3, true));
    } else {
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(this.nor), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(this.col), 3));
    }
    g.setIndex(new THREE.BufferAttribute(nv > 65535 ? new Uint32Array(this.ix) : new Uint16Array(this.ix), 1));
    if (this.surf.some(v => v !== 0)) g.setAttribute('surf', new THREE.BufferAttribute(new Float32Array(this.surf), 1));
    if (this.wid.some(v => v !== 0)) g.setAttribute('wid', new THREE.BufferAttribute(new Float32Array(this.wid), 2));
    if (this.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(this.uv), 2));
    g.computeBoundingSphere();
    return g;
  }
}
