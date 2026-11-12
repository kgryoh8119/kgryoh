// 歩く人：1 つのインスタンス描画で、脚と腕を GPU で振って歩かせる。人ごとに背丈・体型・服の色・持ち物を変える。
// 部位（脚・腕）は頂点の属性 aPart で見分け、シェーダーで腰・肩を軸に回す。持ち物は人ごとのビットで出し入れする。
import * as THREE from 'three';
import ANIM from '../assets/anim.json';

/** 色の差し替え先（頂点色の r に入れる）：0 上着・1 下（ズボン・スカート）・2 肌・3 髪・4 靴・5 持ち物・6 金属・7 黄色の帽子・8 犬・9 白 */
const SLOT = { shirt: 0, pants: 1, skin: 2, hair: 3, shoe: 4, acc: 5, metal: 6, cap: 7, dog: 8, white: 9 };
/** 部位：0 胴（姿勢で前かがみ）・1 左脚・2 右脚・3 左腕・4 右腕・5 犬の脚・6 下半身の固定物（スカート・ベビーカー） */
/** 持ち物のビット */
export const ACC = { backpack: 1, handbag: 2, umbrella: 4, skirt: 8, coat: 16, stroller: 32, dog: 64, cap: 128, shopBag: 256, suitcase: 512, cane: 1024, wheelchair: 2048, delivery: 4096, phone: 8192 };

interface Part { pos: number[]; nor: number[]; col: number[]; part: number[]; bit: number[] }
function box(P: Part, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, slot: number, part: number, bit = 0): void {
  const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy, y1 = cy + sy, z0 = cz - sz / 2, z1 = cz + sz / 2;
  const F: [number[][], number[]][] = [
    [[[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1]], [[[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1]],
    [[[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0]], [[[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0]],
    [[[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0]], [[[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0]],
  ];
  for (const [q, n] of F) for (const k of [0, 1, 2, 0, 2, 3]) { P.pos.push(...q[k]); P.nor.push(...n); P.col.push(slot / 10, 0, 0); P.part.push(part); P.bit.push(bit); }
}
/** 楕円体（頭・髪・犬の頭）。法線はなめらか */
function ell(P: Part, cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, slot: number, part: number, bit = 0, seg = 8, rings = 5, ymin = -1): void {
  const pt = (i: number, j: number) => { const p = -Math.PI / 2 + Math.PI * j / rings, a = Math.PI * 2 * i / seg; return [Math.cos(p) * Math.cos(a), Math.max(ymin, Math.sin(p)), Math.cos(p) * Math.sin(a)]; };
  for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
    const q = [pt(i, j), pt(i + 1, j), pt(i + 1, j + 1), pt(i, j + 1)];
    for (const k of [0, 2, 1, 0, 3, 2]) { const u = q[k]; P.pos.push(cx + u[0] * rx, cy + u[1] * ry, cz + u[2] * rz); const l = Math.hypot(u[0] / rx, u[1] / ry, u[2] / rz) || 1; P.nor.push(u[0] / rx / l, u[1] / ry / l, u[2] / rz / l); P.col.push(slot / 10, 0, 0); P.part.push(part); P.bit.push(bit); }
  }
}
/** 先細りの柱（脚・腕・胴をやや丸く） */
function limb(P: Part, cx: number, y0: number, cz: number, r0: number, r1: number, h: number, slot: number, part: number, bit = 0, seg = 6, sz = 1): void {
  for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * 2 * i / seg, a1 = Math.PI * 2 * (i + 1) / seg;
    const v = [[cx + Math.cos(a0) * r0, y0, cz + Math.sin(a0) * r0 * sz], [cx + Math.cos(a1) * r0, y0, cz + Math.sin(a1) * r0 * sz], [cx + Math.cos(a1) * r1, y0 + h, cz + Math.sin(a1) * r1 * sz], [cx + Math.cos(a0) * r1, y0 + h, cz + Math.sin(a0) * r1 * sz]];
    const n = [[Math.cos(a0), 0, Math.sin(a0)], [Math.cos(a1), 0, Math.sin(a1)], [Math.cos(a1), 0, Math.sin(a1)], [Math.cos(a0), 0, Math.sin(a0)]];
    for (const k of [0, 2, 1, 0, 3, 2]) { P.pos.push(...v[k]); P.nor.push(...n[k]); P.col.push(slot / 10, 0, 0); P.part.push(part); P.bit.push(bit); }
  }
  // ふた
  for (const [y, r, ny] of [[y0 + h, r1, 1], [y0, r0, -1]] as const) for (let i = 0; i < seg; i++) {
    const a0 = Math.PI * 2 * i / seg, a1 = Math.PI * 2 * (i + 1) / seg, tri = ny > 0 ? [[cx, y, cz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r * sz], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r * sz]] : [[cx, y, cz], [cx + Math.cos(a0) * r, y, cz + Math.sin(a0) * r * sz], [cx + Math.cos(a1) * r, y, cz + Math.sin(a1) * r * sz]];
    for (const p of tri) { P.pos.push(...p); P.nor.push(0, ny, 0); P.col.push(slot / 10, 0, 0); P.part.push(part); P.bit.push(bit); }
  }
}

/** 輪を積んだ丸い筒（脚・腕・胴）。rings は下から [高さ, 横の半径, 前後の半径]。法線はなめらか。両端にふた */
function lathe(P: Part, cx: number, cz: number, rings: number[][], slot: number, part: number, seg = 10, bit = 0): void {
  const put = (v: number[], n: number[]) => { P.pos.push(v[0], v[1], v[2]); const l = Math.hypot(n[0], n[1], n[2]) || 1; P.nor.push(n[0] / l, n[1] / l, n[2] / l); P.col.push(slot / 10, 0, 0); P.part.push(part); P.bit.push(bit); };
  const pt = (j: number, i: number) => { const a = Math.PI * 2 * i / seg, r = rings[j]; return [cx + Math.cos(a) * r[1], r[0], cz + Math.sin(a) * r[2]]; };
  const nr = (j: number, i: number) => { const a = Math.PI * 2 * i / seg, r = rings[j], q = rings[Math.min(rings.length - 1, j + 1)], o = rings[Math.max(0, j - 1)], sl = -((q[1] + q[2]) - (o[1] + o[2])) / 2 / Math.max(1e-4, q[0] - o[0]);
    const hx = Math.cos(a) * r[2], hz = Math.sin(a) * r[1], hl = Math.hypot(hx, hz) || 1; return [hx / hl, sl, hz / hl]; };
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < seg; i++) {
    const q = [[j, i], [j, i + 1], [j + 1, i + 1], [j + 1, i]];
    for (const k of [0, 2, 1, 0, 3, 2]) put(pt(q[k][0], q[k][1]), nr(q[k][0], q[k][1]));
  }
  for (const [j, ny] of [[rings.length - 1, 1], [0, -1]]) for (let i = 0; i < seg; i++) {
    const c = [cx, rings[j][0], cz], t = ny > 0 ? [c, pt(j, i + 1), pt(j, i)] : [c, pt(j, i), pt(j, i + 1)];
    for (const v of t) put(v, [0, ny, 0]);
  }
}

/** 人の形（前が +z、足元が y=0、背丈 約 1.7m）。脚 0〜0.9、腰 0.92、肩 1.42、頭 1.6。
 *  v73：箱と 6 角の柱をやめ、輪を積んだ丸い体にした。ひざ（y 0.5）とひじ（y 1.13）で筒を上下に分け、
 *  関節には球を入れる（前は 1 本の筒の下の輪だけを回していて、脚と腕が曲がらずに斜めに伸びていた） */
export function personGeometry(): THREE.BufferGeometry {
  const P: Part = { pos: [], nor: [], col: [], part: [], bit: [] };
  // 脚（ズボン）と靴：腰を軸に振り、ひざから下はひざを軸に曲げる
  for (const [sx, part] of [[-0.092, 1], [0.092, 2]] as const) {
    lathe(P, sx, 0, [[0.5, 0.06, 0.064], [0.62, 0.07, 0.076], [0.78, 0.082, 0.088], [0.88, 0.08, 0.086], [0.95, 0.062, 0.068]], SLOT.pants, part, 10);       // もも
    ell(P, sx, 0.5, 0.004, 0.06, 0.06, 0.064, SLOT.pants, part, 0, 10, 6);                                                                                  // ひざ
    lathe(P, sx, 0, [[0.075, 0.046, 0.05], [0.16, 0.05, 0.056], [0.33, 0.062, 0.068], [0.43, 0.058, 0.062], [0.499, 0.059, 0.063]], SLOT.pants, part, 10); // すね
    ell(P, sx, 0.062, 0.05, 0.056, 0.062, 0.135, SLOT.shoe, part, 0, 10, 5, -0.82);                                                                         // 靴（底は平ら）
  }
  // 胴（上着）：腰・くびれ・胸・肩の丸み・首
  lathe(P, 0, 0, [[0.865, 0.176, 0.114], [0.96, 0.176, 0.114], [1.08, 0.158, 0.1], [1.2, 0.178, 0.112], [1.32, 0.2, 0.116], [1.395, 0.205, 0.106], [1.432, 0.14, 0.085], [1.455, 0.06, 0.058]], SLOT.shirt, 0, 12);
  lathe(P, 0, 0, [[1.44, 0.05, 0.05], [1.53, 0.047, 0.05]], SLOT.skin, 0, 8);                       // 首
  ell(P, 0, 0.872, 0, 0.156, 0.1, 0.098, SLOT.pants, 0, 0, 12, 5);                                  // 腰回り（丸く）
  // 腕（袖）と手：肩を軸に振り、ひじから先はひじを軸に曲げる
  for (const [sx, part] of [[-0.235, 3], [0.235, 4]] as const) {
    ell(P, sx, 1.365, 0, 0.057, 0.06, 0.06, SLOT.shirt, part, 0, 10, 6);                                                          // 肩
    lathe(P, sx, 0, [[1.13, 0.045, 0.047], [1.25, 0.05, 0.053], [1.37, 0.055, 0.058]], SLOT.shirt, part, 8);                       // 上腕
    ell(P, sx, 1.13, 0, 0.045, 0.045, 0.047, SLOT.shirt, part, 0, 8, 5);                                                            // ひじ
    lathe(P, sx, 0, [[0.885, 0.034, 0.036], [1.0, 0.042, 0.044], [1.129, 0.044, 0.046]], SLOT.shirt, part, 8);                      // 前腕
    ell(P, sx, 0.835, 0.004, 0.036, 0.068, 0.045, SLOT.skin, part, 0, 8, 5);                                                        // 手
  }
  // 頭と髪（髪は上半分と後ろ）。耳と鼻は小さな丸
  ell(P, 0, 1.6, 0.005, 0.105, 0.125, 0.115, SLOT.skin, 0, 0, 14, 9);
  ell(P, 0, 1.632, -0.014, 0.119, 0.119, 0.127, SLOT.hair, 0, 0, 14, 8, -0.15);
  ell(P, 0, 1.585, 0.118, 0.014, 0.02, 0.016, SLOT.skin, 0, 0, 6, 4);
  for (const ex of [-0.104, 0.104]) ell(P, ex, 1.595, 0, 0.014, 0.03, 0.02, SLOT.skin, 0, 0, 6, 4);
  // ---- 持ち物（ビットで出し入れ）----
  ell(P, 0, 1.17, -0.185, 0.15, 0.2, 0.095, SLOT.acc, 0, ACC.backpack, 10, 6);                 // リュック・ランドセル（丸み）
  box(P, 0.27, 0.56, 0.02, 0.07, 0.24, 0.3, SLOT.acc, 4, ACC.handbag);                       // 手さげかばん（右手）
  box(P, 0.27, 0.5, 0.02, 0.06, 0.32, 0.26, SLOT.white, 4, ACC.shopBag);                     // 買い物袋（右手）
  limb(P, 0.21, 0.95, 0.38, 0.012, 0.012, 1.0, SLOT.metal, 0, ACC.umbrella, 4);             // 傘の柄
  ell(P, 0.15, 1.95, 0.25, 0.56, 0.22, 0.56, SLOT.acc, 0, ACC.umbrella, 10, 3, 0);           // 傘
  // スカートとコートの裾：歩幅より広い裾にして、脚が布を突き抜けないようにする（v73 まで脚が前後に出ていた）
  lathe(P, 0, 0, [[0.44, 0.27, 0.285], [0.6, 0.24, 0.235], [0.78, 0.2, 0.16], [0.93, 0.172, 0.113]], SLOT.pants, 6, 12, ACC.skirt);
  lathe(P, 0, 0, [[0.47, 0.245, 0.27], [0.62, 0.225, 0.225], [0.8, 0.195, 0.16], [0.97, 0.176, 0.116]], SLOT.shirt, 6, 12, ACC.coat);
  ell(P, 0, 1.675, -0.012, 0.126, 0.095, 0.134, SLOT.cap, 0, ACC.cap, 12, 5, 0); ell(P, 0, 1.68, 0.13, 0.11, 0.012, 0.075, SLOT.cap, 0, ACC.cap, 10, 3); // 黄色の帽子（丸い山とつば）
  // v44：キャリーケース（右うしろを引く）・杖（右手）・車いす・配達の箱（背中）・スマホ（左手）
  box(P, 0.36, 0.06, -0.42, 0.34, 0.52, 0.22, SLOT.acc, 6, ACC.suitcase); box(P, 0.36, 0, -0.32, 0.05, 0.07, 0.05, SLOT.shoe, 6, ACC.suitcase); box(P, 0.36, 0, -0.52, 0.05, 0.07, 0.05, SLOT.shoe, 6, ACC.suitcase);
  limb(P, 0.3, 0.58, -0.3, 0.012, 0.012, 0.42, SLOT.metal, 6, ACC.suitcase, 4);
  limb(P, 0.27, 0.0, 0.12, 0.013, 0.013, 0.86, SLOT.acc, 4, ACC.cane, 4);
  box(P, 0, 0.42, -0.02, 0.48, 0.06, 0.46, SLOT.acc, 6, ACC.wheelchair); box(P, 0, 0.45, -0.24, 0.46, 0.5, 0.05, SLOT.acc, 6, ACC.wheelchair); // 座面と背もたれ
  for (const sx of [-0.27, 0.27]) { ell(P, sx, 0.31, -0.08, 0.022, 0.31, 0.31, SLOT.metal, 6, ACC.wheelchair, 14, 6); ell(P, sx, 0.31, -0.08, 0.03, 0.06, 0.06, SLOT.shoe, 6, ACC.wheelchair, 8, 4); ell(P, sx * 0.7, 0.075, 0.26, 0.02, 0.075, 0.075, SLOT.shoe, 6, ACC.wheelchair, 10, 4); } // 丸い車輪
  box(P, 0, 0.12, 0.3, 0.36, 0.04, 0.16, SLOT.metal, 6, ACC.wheelchair); // 足のせ
  box(P, 0, 0.92, -0.3, 0.44, 0.44, 0.36, SLOT.acc, 0, ACC.delivery); box(P, 0, 1.36, -0.3, 0.44, 0.02, 0.36, SLOT.white, 0, ACC.delivery);
  box(P, -0.24, 0.82, 0.12, 0.08, 0.13, 0.015, SLOT.shoe, 3, ACC.phone);
  // ベビーカー（前）
  ell(P, 0, 0.56, 0.78, 0.22, 0.17, 0.33, SLOT.acc, 6, ACC.stroller, 12, 6);                    // かご（丸い舟形）
  ell(P, 0, 0.66, 0.62, 0.235, 0.26, 0.24, SLOT.acc, 6, ACC.stroller, 12, 5, 0);               // ほろ（半球）
  for (const [wx, wz] of [[-0.21, 1.0], [0.21, 1.0], [-0.21, 0.56], [0.21, 0.56]]) ell(P, wx, 0.085, wz, 0.022, 0.085, 0.085, SLOT.shoe, 6, ACC.stroller, 10, 4); // 車輪 4 つ
  box(P, -0.2, 0.09, 0.78, 0.02, 0.32, 0.02, SLOT.metal, 6, ACC.stroller); box(P, 0.2, 0.09, 0.78, 0.02, 0.32, 0.02, SLOT.metal, 6, ACC.stroller); // 脚
  box(P, 0, 0.95, 0.42, 0.5, 0.03, 0.03, SLOT.metal, 6, ACC.stroller); box(P, -0.22, 0.4, 0.45, 0.025, 0.56, 0.025, SLOT.metal, 6, ACC.stroller); box(P, 0.22, 0.4, 0.45, 0.025, 0.56, 0.025, SLOT.metal, 6, ACC.stroller);
  // 犬（右前）：胴・頭・しっぽ・4 本の脚（脚は速く振る）
  ell(P, 0.62, 0.36, 0.55, 0.095, 0.105, 0.27, SLOT.dog, 6, ACC.dog, 10, 5); ell(P, 0.62, 0.47, 0.93, 0.045, 0.04, 0.07, SLOT.dog, 6, ACC.dog, 6, 3); ell(P, 0.62, 0.5, 0.86, 0.1, 0.1, 0.12, SLOT.dog, 6, ACC.dog, 8, 4); box(P, 0.62, 0.42, 0.28, 0.04, 0.04, 0.16, SLOT.dog, 6, ACC.dog);
  for (const [dx, dz] of [[-0.06, 0.74], [0.06, 0.74], [-0.06, 0.36], [0.06, 0.36]]) box(P, 0.62 + dx, 0, dz, 0.05, 0.27, 0.05, SLOT.dog, 5, ACC.dog);
  box(P, 0.33, 0.8, 0.5, 0.3, 0.012, 0.012, SLOT.metal, 6, ACC.dog); // リード
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(P.col, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(P.part, 1));
  g.setAttribute('aBit', new THREE.Float32BufferAttribute(P.bit, 1));
  g.computeBoundingSphere();
  return g;
}


// ---- Mixamo の動き（tools/blender_mixamo_bake.py → src/assets/anim.json）----
// 1 フレーム 12 個：左もも・左ひざ・右もも・右ひざ・左腕の前後・左ひじ・左腕の開き・右腕・右ひじ・右腕の開き・背中の前傾・腰の高さ（角度はラジアン、前・曲げが正）
// 立ち姿（息づかい）の平均を 0 にそろえ、この体の形（脚と腕がまっすぐ下）に合う角度に直して、浮動小数のテクスチャ（3 列 × 全フレーム）に入れる
type AnimSrc = { n: number; dur: number; d: number[] };
const ANAMES = ['walk', 'run', 'idle', 'talk', 'call', 'text'] as const;
const AS = ANIM as unknown as Record<string, AnimSrc>;
const wrapA = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const ANIM_TABLE = (() => {
  const idle = AS.idle, mean = new Array(12).fill(0);
  for (let i = 0; i < idle.n; i++) for (let c = 0; c < 12; c++) mean[c] += wrapA(idle.d[i * 12 + c]) / idle.n;
  const zero = mean.slice(); zero[5] -= 0.15; zero[8] -= 0.15; zero[11] = 0; // ひじは少しだけ曲げたまま
  let rows = 0; const off: number[] = [], len: number[] = [], dur: number[] = [];
  for (const k of ANAMES) { off.push(rows); len.push(AS[k].n); dur.push(AS[k].dur); rows += AS[k].n; }
  const data = new Float32Array(rows * 12);
  ANAMES.forEach((k, j) => { const a = AS[k]; for (let i = 0; i < a.n; i++) for (let c = 0; c < 12; c++) {
    let v = wrapA(a.d[i * 12 + c]) - zero[c];
    if (c === 1 || c === 3) v = Math.max(0, v); if (c === 5 || c === 8) v = Math.max(-0.05, v);
    data[(off[j] + i) * 12 + c] = v; } });
  const tex = new THREE.DataTexture(data, 3, rows, THREE.RGBAFormat, THREE.FloatType); tex.needsUpdate = true;
  return { tex, off, len, dur };
})();
/** 立ち姿の動き（息づかい・身ぶり）の時刻。毎フレーム進める */
export const PEOPLE_TIME = { value: 0 };
const ANIM_UNI = { uAnim: { value: ANIM_TABLE.tex }, uPTime: PEOPLE_TIME };
const AGLSL = `uniform sampler2D uAnim; uniform float uPTime;
vec4 aRow(int r, int c) { return texelFetch(uAnim, ivec2(c, r), 0); }
void aSample(int off, int n, float t, inout vec4 A, inout vec4 B, inout vec4 C, float w) {
  float f = fract(t) * float(n); int i0 = int(floor(f)); int i1 = i0 + 1; if (i1 >= n) i1 = 0; float u = f - floor(f);
  A += w * mix(aRow(off + i0, 0), aRow(off + i1, 0), u); B += w * mix(aRow(off + i0, 1), aRow(off + i1, 1), u); C += w * mix(aRow(off + i0, 2), aRow(off + i1, 2), u);
}
float aHash(float x) { return fract(sin(x * 91.345 + 7.13) * 43758.5453); }
vec3 pRotZ(vec3 p, vec3 c, float a) { p -= c; float s = sin(a), k = cos(a); return vec3(p.x * k - p.y * s, p.x * s + p.y * k, p.z) + c; }
`;
const ADEF = ANAMES.map((k, j) => `#define A_${k.toUpperCase()} ${ANIM_TABLE.off[j]}, ${ANIM_TABLE.len[j]}\n#define D_${k.toUpperCase()} ${ANIM_TABLE.dur[j].toFixed(3)}`).join('\n') + '\n';
const DECL = `
${''}attribute float aPart; attribute float aBit;
attribute vec4 aPose;   // 歩きの位相・振りの大きさ・前かがみ・持ち物のビット
attribute vec3 aShirt; attribute vec3 aPants; attribute vec3 aHair; attribute vec3 aAcc; attribute vec3 aSkin;
vec3 pRot(vec3 p, vec3 c, float a) { p -= c; float s = sin(a), k = cos(a); return vec3(p.x, p.y * k - p.z * s, p.y * s + p.z * k) + c; }
bool pHidden() { int bit = int(aBit + 0.5); return bit != 0 && (int(aPose.w + 0.5) & bit) == 0; }
vec3 pPose(vec3 p, vec3 p0, bool isN) {
  int part = int(aPart + 0.5); int acc = int(aPose.w + 0.5);
  float ph = aPose.x, amp = aPose.y, stoop = aPose.z;
  bool strol = (acc & 32) != 0, wc = (acc & 2048) != 0, ph2 = (acc & 8192) != 0;
  vec3 hip = isN ? vec3(0.0) : vec3(0.0, 0.92, 0.0), sh = isN ? vec3(0.0) : vec3(0.0, 1.4, 0.0), dogHip = isN ? vec3(0.0) : vec3(0.0, 0.27, 0.0);
  vec3 knee = isN ? vec3(0.0) : vec3(0.0, 0.5, 0.0), elb = isN ? vec3(0.0) : vec3(0.0, 1.13, 0.0);
  // Mixamo の動き：歩き（走り）と、立っているときの身ぶりを、歩く速さで混ぜる
  vec4 A = vec4(0.0), B = vec4(0.0), C = vec4(0.0);
  float mw = clamp(amp / 0.3, 0.0, 1.0), rw = smoothstep(1.2, 1.4, amp), ks = min(amp, 1.0);
  if (mw > 0.0) { float t = ph / 6.2831853; aSample(A_WALK, t, A, B, C, mw * (1.0 - rw) * ks); if (rw > 0.0) aSample(A_RUN, t, A, B, C, mw * rw); }
  if (mw < 1.0) {
    // 人の見分け：gl_InstanceID は属性の数の上限（16）に掛かるため、立っている場所から決める
    float id = floor(instanceMatrix[3].x * 3.1) + floor(instanceMatrix[3].z * 3.1) * 57.0, h = aHash(id), o = aHash(id + 3.7) * 40.0, sw = 1.0 - mw;
    if (ph2) aSample(A_TEXT, (uPTime + o) / D_TEXT, A, B, C, sw);
    else if (h < 0.28) aSample(A_TALK, (uPTime + o) / D_TALK, A, B, C, sw);
    else if (h < 0.4) aSample(A_CALL, (uPTime + o) / D_CALL, A, B, C, sw);
    else aSample(A_IDLE, (uPTime + o) / D_IDLE, A, B, C, sw);
  }
  bool loK = p0.y < 0.5, loE = p0.y < 1.13;
  if (wc && (part == 1 || part == 2)) p = pRot(p, hip, -1.45); // 車いす：座って脚は前へ
  else if (part == 1) { if (loK) p = pRot(p, knee, A.y); p = pRot(p, hip, -A.x); }
  else if (part == 2) { if (loK) p = pRot(p, knee, A.w); p = pRot(p, hip, -A.z); }
  else if (part == 3) {
    if (strol || wc) p = pRot(p, sh, strol ? -0.9 : -0.35 - 0.35 * sin(ph));
    else if (ph2 && mw > 0.5) { if (loE) p = pRot(p, elb, -1.1); p = pRot(p, sh, -0.35); } // 歩きスマホ：ひじを曲げて画面を見る
    else { if (loE) p = pRot(p, elb, -B.y); p = pRot(p, sh, -B.x); p = pRotZ(p, isN ? vec3(0.0) : vec3(-0.235, 1.4, 0.0), -B.z); }
  }
  else if (part == 4) {
    if (strol || wc) p = pRot(p, sh, strol ? -0.9 : -0.35 - 0.35 * sin(ph));
    else if ((acc & 4) != 0) p = pRot(p, sh, -0.75);           // 傘
    else if ((acc & 1024) != 0) p = pRot(p, sh, -0.25);        // 杖
    else { if (loE) p = pRot(p, elb, -C.x); p = pRot(p, sh, -B.w); p = pRotZ(p, isN ? vec3(0.0) : vec3(0.235, 1.4, 0.0), C.y); }
  }
  else if (part == 5) p = pRot(p, dogHip + (isN ? vec3(0.0) : vec3(0.0, 0.0, p.z > 0.55 ? 0.74 : 0.36)), amp * 0.45 * sin(ph * 2.0 + (p.x > 0.62 ? 1.6 : 0.0)));
  if (part == 0 || part == 3 || part == 4) p = pRot(p, hip, stoop + C.z); // 上半身の前かがみ（動きの背中の傾きも足す）
  if (wc && !isN && int(aBit + 0.5) != 2048) p.y -= 0.42; // 車いすに座る高さ
  return p;
}`;
/** 立ち・歩き・前かがみ・持ち物をシェーダーで。色の材質と影の材質の両方に入れる */
function patch(sh: { vertexShader: string; uniforms?: Record<string, unknown> }, color: boolean): void {
  if (sh.uniforms) Object.assign(sh.uniforms, ANIM_UNI);
  let v = sh.vertexShader.replace('#include <common>', '#include <common>\n' + ADEF + AGLSL + DECL)
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = pHidden() ? vec3(0.0, -50.0, 0.0) : pPose(transformed, position, false);');
  if (color) {
    v = v.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = pPose(objectNormal, position, true);')
      .replace('#include <color_vertex>', `#ifdef USE_COLOR
  { int sl = int(color.r * 10.0 + 0.5); vec3 c = vec3(1.0);
    if (sl == 0) c = aShirt; else if (sl == 1) c = ((int(aPose.w + 0.5) & 8) != 0 && int(aPart + 0.5) > 0 && int(aPart + 0.5) < 3) ? vec3(0.15, 0.13, 0.13) : aPants;
    else if (sl == 2) c = aSkin; else if (sl == 3) c = aHair; else if (sl == 4) c = vec3(0.08, 0.08, 0.09);
    else if (sl == 5) c = aAcc; else if (sl == 6) c = vec3(0.55, 0.57, 0.6); else if (sl == 7) c = vec3(0.98, 0.82, 0.12); else if (sl == 8) c = vec3(0.62, 0.42, 0.22); else c = vec3(0.95);
    vColor = vec4(c, 1.0); }
#endif`);
  }
  sh.vertexShader = v;
}

export interface Look { t?: PType; skin?: number; shirt: number; pants: number; hair: number; acc: number; bits: number; scale: number; width: number; stoop: number; speed: number; amp: number }
const NUM = 9;
/** 人の群れ（インスタンス描画）。姿勢と見た目の属性を持ち、毎フレーム必要な分だけ書き換える */
export class People {
  mesh: THREE.InstancedMesh;
  private pose: THREE.InstancedBufferAttribute; private cols: THREE.InstancedBufferAttribute[];
  constructor(n: number, scene: THREE.Scene) {
    const g = personGeometry();
    this.pose = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.pose.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aPose', this.pose);
    this.cols = ['aShirt', 'aPants', 'aHair', 'aAcc', 'aSkin'].map(k => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(0.5), 3); g.setAttribute(k, a); return a; });
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
    mat.onBeforeCompile = sh => patch(sh, true); mat.customProgramCacheKey = () => 'people-color-mx1';
    const dm = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
    dm.onBeforeCompile = sh => patch(sh, false); dm.customProgramCacheKey = () => 'people-depth-mx1';
    this.mesh = new THREE.InstancedMesh(g, mat, n); this.mesh.customDepthMaterial = dm;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this.mesh.count = 0; scene.add(this.mesh);
    void NUM;
  }
  setLook(i: number, L: Look): void {
    const c = new THREE.Color();
    [L.shirt, L.pants, L.hair, L.acc, L.skin ?? 0xdbad8c].forEach((h, k) => { c.setHex(h); this.cols[k].setXYZ(i, c.r, c.g, c.b); });
    this.pose.setW(i, L.bits); this.pose.setZ(i, L.stoop);
  }
  setPose(i: number, phase: number, amp: number): void { this.pose.setX(i, phase); this.pose.setY(i, amp); }
  commitLooks(): void { for (const a of this.cols) a.needsUpdate = true; this.pose.needsUpdate = true; }
  commitPose(): void { this.pose.needsUpdate = true; this.mesh.instanceMatrix.needsUpdate = true; }
}

// ---- 見た目の決め方 ----
export type PType = 'worker' | 'student' | 'teen' | 'shopper' | 'elderly' | 'parent' | 'dog' | 'jogger' | 'fan' | 'tourist' | 'wheel' | 'delivery';
const pk = <T,>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length) % a.length];
const CASUAL = [0x2c3e5c, 0x8a3a32, 0xe8e2d0, 0x3f6a4a, 0x6a4a7a, 0xf2f2f2, 0x4a7fa8, 0xe86a7a, 0xd9a03a, 0x9ab0c0, 0xc9b8a0, 0x7a8a5a, 0x2a2c2e];
const HAIR = [0x1e1a18, 0x2a2522, 0x3b2a1e, 0x4a3426, 0x6a4a2a, 0x8a6a4a];
/** 時刻ごとに、どんな人が多いか */
export function pickType(hour: number, r: () => number): PType {
  const W: [PType, number][] = hour >= 6 && hour < 9 ? [['worker', 0.5], ['student', 0.22], ['teen', 0.12], ['jogger', 0.06], ['dog', 0.06], ['elderly', 0.04]]
    : hour >= 9 && hour < 15 ? [['shopper', 0.3], ['elderly', 0.22], ['parent', 0.13], ['dog', 0.07], ['worker', 0.12], ['jogger', 0.04], ['student', 0.04], ['tourist', 0.06], ['wheel', 0.025], ['delivery', 0.05]]
    : hour >= 15 && hour < 17.5 ? [['student', 0.26], ['teen', 0.2], ['shopper', 0.22], ['elderly', 0.1], ['parent', 0.1], ['dog', 0.06], ['worker', 0.04], ['tourist', 0.05], ['wheel', 0.02], ['delivery', 0.04]]
    : hour >= 17.5 && hour < 21 ? [['worker', 0.46], ['teen', 0.1], ['shopper', 0.22], ['dog', 0.1], ['jogger', 0.07], ['delivery', 0.05], ['tourist', 0.03]]
    : [['worker', 0.6], ['dog', 0.2], ['jogger', 0.2]];
  let x = r() * W.reduce((a, w) => a + w[1], 0); for (const [t, w] of W) { x -= w; if (x <= 0) return t; } return W[0][0];
}
/** 種類と季節（月 0〜11）・天気から、服と持ち物と背丈を決める */
export function makeLook(t: PType, r: () => number, month: number, rain: boolean): Look {
  const winter = month === 11 || month <= 2, summer = month >= 5 && month <= 8;
  const L: Look = { shirt: pk(r, CASUAL), pants: pk(r, [0x2a2c33, 0x3a4a6a, 0x5a5048, 0x1f2a3a, 0xc9b8a0, 0x6a6a70]), hair: pk(r, HAIR), acc: pk(r, [0x2a2a2a, 0x6b3f22, 0x9a3a32, 0x2c3e5c]), bits: 0, scale: 0.95 + r() * 0.12, width: 0.95 + r() * 0.15, stoop: 0, speed: 1.15 + r() * 0.25, amp: 1 };
  const female = r() < 0.5; L.t = t;
  // 肌の色：ほとんどは日本の人の幅で、1 割ほどは海外にルーツのある人（観光客はもっと多い）
  const SKIN_JP = [0xe8c4a8, 0xdbb291, 0xd2a582, 0xe4bc9c], SKIN_W = [0xf0d2c0, 0xc89270, 0xa86e4a, 0x8a5636, 0x6a3f28, 0xe0b490];
  L.skin = r() < (t === 'tourist' ? 0.6 : 0.1) ? pk(r, SKIN_W) : pk(r, SKIN_JP);
  if (L.skin === 0xf0d2c0 || L.skin === 0xe0b490) { if (r() < 0.5) L.hair = pk(r, [0xc8a060, 0xa8783a, 0x8a5a2a]); }
  if ((t === 'worker' || t === 'teen' || t === 'shopper') && r() < 0.25) L.bits |= ACC.phone; // 歩きスマホ
  switch (t) {
    case 'worker': L.shirt = pk(r, [0x1f2633, 0x2a2c33, 0x3a3e46, 0x23304a]); L.pants = L.shirt; if (summer) L.shirt = pk(r, [0xf2f2f2, 0xe6eef6]); L.bits |= r() < 0.7 ? ACC.handbag : 0; L.acc = 0x1a1a1a; L.speed = 1.35 + r() * 0.25; if (female && r() < 0.5) L.bits |= ACC.skirt; break;
    case 'student': L.scale = 0.6 + r() * 0.12; L.width = 0.85; L.bits |= ACC.backpack | ACC.cap; L.acc = pk(r, [0xb5372c, 0x1a1a1a, 0x7a2f4a, 0x2c3e8c]); L.speed = 1.0 + r() * 0.3; L.pants = pk(r, [0x2a2c33, 0x3a4a6a]); break;
    case 'teen': L.scale = 0.92 + r() * 0.08; L.shirt = summer ? 0xf2f2f2 : pk(r, [0x1f2633, 0x23304a]); L.pants = pk(r, [0x1f2633, 0x2a2c33]); if (female) { L.bits |= ACC.skirt; L.pants = pk(r, [0x23304a, 0x3a3a46, 0x6a3a3a]); } L.bits |= r() < 0.7 ? ACC.backpack : ACC.handbag; L.acc = pk(r, [0x1a1a1a, 0x23304a]); L.speed = 1.25 + r() * 0.2; break;
    case 'shopper': if (female && r() < 0.45) L.bits |= ACC.skirt; L.bits |= r() < 0.5 ? ACC.shopBag : r() < 0.6 ? ACC.handbag : 0; L.speed = 1.0 + r() * 0.25; break;
    case 'elderly': L.hair = pk(r, [0xb9b6ae, 0xd9d6cf, 0x8a8680]); L.shirt = pk(r, [0x8a7a6a, 0x6a6a70, 0xa89a80, 0x5a5048, 0x7a6a5a]); L.stoop = 0.12 + r() * 0.18; L.speed = 0.7 + r() * 0.2; L.amp = 0.6; L.scale = 0.9 + r() * 0.08; if (r() < 0.4) L.bits |= ACC.shopBag; break;
    case 'parent': L.bits |= ACC.stroller; L.acc = pk(r, [0x2c3e5c, 0x9a3a32, 0x3f6a4a, 0x2a2a2a]); L.speed = 0.95 + r() * 0.15; break;
    case 'dog': L.bits |= ACC.dog; L.speed = 0.95 + r() * 0.2; break;
    case 'jogger': L.shirt = pk(r, [0xf2c230, 0xe86a7a, 0x4fd2ff, 0x7cc36a, 0xff7a2a]); L.pants = 0x1a1a1a; L.speed = 2.4 + r() * 0.8; L.amp = 1.5; break;
    case 'fan': L.shirt = pk(r, [0x1f6fb2, 0x1f6fb2, 0xc3312b]); break;
    case 'tourist': L.bits |= ACC.suitcase | (r() < 0.4 ? ACC.backpack : 0); L.acc = pk(r, [0x2c3e8c, 0xb5372c, 0x6a6a70, 0xe8c87a, 0x3f6a4a]); L.shirt = pk(r, [0xf2f2f2, 0xe86a7a, 0x4a7fa8, 0xd9a03a, 0x7cc36a]); L.speed = 0.9 + r() * 0.2; break;
    case 'wheel': L.bits |= ACC.wheelchair; L.acc = pk(r, [0x2a2c33, 0x3a4a6a, 0x6a2a2a]); L.speed = 0.75 + r() * 0.15; L.amp = 0.8; break;
    case 'delivery': L.bits |= ACC.delivery | ACC.cap; L.shirt = pk(r, [0x2e7d32, 0x1d3557, 0xf2c230, 0x111111]); L.acc = L.shirt === 0x111111 ? 0x2bb673 : pk(r, [0xf2f2f2, 0x2bb673, 0xf2c230]); L.speed = 1.6 + r() * 0.3; break;
  }
  if (t === 'elderly' && !(L.bits & (ACC.shopBag | ACC.handbag)) && r() < 0.35) L.bits |= ACC.cane;
  if (winter && t !== 'jogger' && r() < 0.55) { L.bits |= ACC.coat; L.shirt = pk(r, [0x2a2c33, 0x5a4a3a, 0x3a3e46, 0x8a7a6a, 0x1f2a3a, 0xb9a88a]); }
  if (rain && t !== 'jogger' && !(L.bits & ACC.stroller) && r() < 0.85) { L.bits |= ACC.umbrella; L.acc = pk(r, [0x2a2c33, 0x2c3e8c, 0xe8e2d0, 0xb5372c, 0x3f6a4a, 0xf2f2f2]); }
  return L;
}
/** 歩幅（1 周期＝左右 2 歩で進む距離。背丈に比例） */
export const strideOf = (L: Look) => 1.45 * L.scale * (L.amp > 1.2 ? 1.6 : 1);
/** 決まった並びの乱数（同じ番号なら同じ見た目） */
export function seeded(seed: number): () => number { let a = (seed * 2654435761) >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
/** ゲームの月（0＝4 月）から暦の月（0＝1 月） */
export const calMonth = (m: number) => (m % 12 + 3) % 12;
export const RAIN_EVENTS = new Set(['flood', 'typhoon', 'linearRain', 'megaRain', 'landslide']);
