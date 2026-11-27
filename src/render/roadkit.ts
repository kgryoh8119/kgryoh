// v86：道路と線路の「絵」の部品。路面の文字・数字・矢印・ダイヤマーク、標識の面（止まれ・制限速度・案内標識・横断歩道・踏切あり）を
// 1 枚の画像（キャンバスで描く 1024×512、8×4 コマ）にまとめ、1 つのメッシュ・1 回の描画で描く。色は頂点色で掛ける（白い絵に黄を掛けて黄色の数字、古い道は薄く）
import * as THREE from 'three';
import type { Geo, V3 } from './geo';
import { W, H, idx, hash } from '../sim/index';
import type { GameState } from '../sim/index';
import { xwRange, cornerSpot, crosswalkLayout, walkW, CORNER_R } from './roadbase';

/** コマの番号。路面（白で描き、頂点色で色をつける）と、標識の面（色つき） */
export const RK = { stop: 0, n30: 1, n40: 2, n50: 3, n60: 4, arS: 5, arLS: 6, arRS: 7, arR: 8, arL: 9, dia: 10, school: 11,
  sStop: 12, s30: 13, s40: 14, s50: 15, guide: 16 /* 2 コマ幅 */, sWalk: 18, sRail: 19, bike: 20, sNoPark: 21, sSlow: 22, sDead: 23, guide2: 24 /* 2 コマ幅 */, sBus: 26, kilo: 27 } as const;
const COLS = 8, ROWS = 4, CS = 128;
const F = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Noto Sans JP","Yu Gothic",sans-serif';
let TEX: THREE.Texture | null = null, MAT: THREE.MeshStandardMaterial | null = null;

function draw(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const cv = document.createElement('canvas'); cv.width = COLS * CS; cv.height = ROWS * CS;
  const x = cv.getContext('2d'); if (!x) return cv;
  const cell = (k: number, f: (c: CanvasRenderingContext2D) => void, span = 1) => { x.save(); x.translate((k % COLS) * CS, ((k / COLS) | 0) * CS); x.beginPath(); x.rect(0, 0, CS * span, CS); x.clip(); f(x); x.restore(); };
  const W = '#ffffff';
  // 路面の文字：進む向きに長く引き伸ばす（運転席から読めるように、実物も縦長）
  const roadText = (k: number, t: string, sy: number) => cell(k, c => { c.fillStyle = W; c.textAlign = 'center'; c.textBaseline = 'middle'; let sz = 60; c.font = `900 ${sz}px ${F}`; while (sz > 12 && c.measureText(t).width > CS - 6) { sz -= 2; c.font = `900 ${sz}px ${F}`; } c.translate(CS / 2, CS / 2); c.scale(1, sy); c.fillText(t, 0, 2); });
  roadText(RK.stop, '止まれ', 2.0);
  [['30', RK.n30], ['40', RK.n40], ['50', RK.n50], ['60', RK.n60]].forEach(([t, k]) => cell(+k, c => { c.fillStyle = W; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 72px ${F}`; c.translate(CS / 2, CS / 2); c.scale(0.9, 1.7); c.fillText(String(t), 0, 3); }));
  roadText(RK.school, 'スクールゾーン', 3.2);
  // 矢印（上が進む向き）。まっすぐ・左とまっすぐ・右とまっすぐ・右だけ・左だけ
  const shaft = (c: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number) => { c.strokeStyle = W; c.lineWidth = 11; c.lineCap = 'butt'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); };
  const head = (c: CanvasRenderingContext2D, x0: number, y0: number, ang: number) => { c.fillStyle = W; c.save(); c.translate(x0, y0); c.rotate(ang); c.beginPath(); c.moveTo(0, -22); c.lineTo(17, 6); c.lineTo(-17, 6); c.closePath(); c.fill(); c.restore(); };
  cell(RK.arS, c => { shaft(c, 64, 124, 64, 30); head(c, 64, 26, 0); });
  cell(RK.arLS, c => { shaft(c, 74, 124, 74, 30); head(c, 74, 26, 0); shaft(c, 74, 82, 30, 60); head(c, 22, 56, -Math.PI / 2.6); });
  cell(RK.arRS, c => { shaft(c, 54, 124, 54, 30); head(c, 54, 26, 0); shaft(c, 54, 82, 98, 60); head(c, 106, 56, Math.PI / 2.6); });
  cell(RK.arR, c => { shaft(c, 50, 124, 50, 66); c.beginPath(); c.strokeStyle = W; c.lineWidth = 11; c.arc(72, 66, 22, Math.PI, Math.PI * 1.5); c.stroke(); shaft(c, 72, 44, 96, 44); head(c, 104, 44, Math.PI / 2); });
  cell(RK.arL, c => { shaft(c, 78, 124, 78, 66); c.beginPath(); c.strokeStyle = W; c.lineWidth = 11; c.arc(56, 66, 22, Math.PI * 1.5, Math.PI * 2); c.stroke(); shaft(c, 56, 44, 32, 44); head(c, 24, 44, -Math.PI / 2); });
  // ダイヤマーク（この先に横断歩道）：縦長のひし形の輪郭
  cell(RK.dia, c => { c.strokeStyle = W; c.lineWidth = 10; c.beginPath(); c.moveTo(64, 6); c.lineTo(108, 64); c.lineTo(64, 122); c.lineTo(20, 64); c.closePath(); c.stroke(); });
  // 標識：止まれ（赤い逆三角・白いふち・白い文字）
  cell(RK.sStop, c => { const tri = (m: number) => { c.beginPath(); c.moveTo(6 + m, 12 + m * 0.6); c.lineTo(122 - m, 12 + m * 0.6); c.lineTo(64, 120 - m * 1.1); c.closePath(); }; c.fillStyle = W; tri(0); c.fill(); c.fillStyle = '#d42a24'; tri(7); c.fill();
    c.fillStyle = W; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 26px ${F}`; c.fillText('止まれ', 64, 44); });
  // 制限速度（白い円・赤い輪・青い数字）
  [['30', RK.s30], ['40', RK.s40], ['50', RK.s50]].forEach(([t, k]) => cell(+k, c => { c.fillStyle = W; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#d42a24'; c.lineWidth = 13; c.beginPath(); c.arc(64, 64, 50, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#1f4fa8'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 54px ${F}`; c.save(); c.translate(64, 66); c.scale(0.85, 1.15); c.fillText(String(t), 0, 0); c.restore(); }));
  // 案内標識（青地・白いふちと文字・矢印）。2 コマ幅
  const guide = (k: number, rows: [string, number][]) => cell(k, c => { c.fillStyle = '#1d4f9c'; c.fillRect(0, 0, CS * 2, CS); c.strokeStyle = W; c.lineWidth = 5; c.strokeRect(6, 6, CS * 2 - 12, CS - 12);
    c.fillStyle = W; c.textBaseline = 'middle'; rows.forEach(([t, a], r) => { const y = 34 + r * 36; c.font = `800 26px ${F}`; c.textAlign = a < 0 ? 'left' : a > 0 ? 'right' : 'center'; c.fillText(t, a < 0 ? 52 : a > 0 ? CS * 2 - 52 : CS, y);
      c.save(); c.translate(a < 0 ? 30 : a > 0 ? CS * 2 - 30 : CS - 70, y); c.rotate(a * Math.PI / 2); c.beginPath(); c.moveTo(0, -13); c.lineTo(11, 3); c.lineTo(4, 3); c.lineTo(4, 13); c.lineTo(-4, 13); c.lineTo(-4, 3); c.lineTo(-11, 3); c.closePath(); c.fill(); c.restore(); });
    c.fillStyle = '#ffffff'; c.fillRect(CS * 2 - 58, CS - 30, 40, 16); c.fillStyle = '#1d4f9c'; c.font = `700 12px ${F}`; c.textAlign = 'center'; c.fillText('Sta.', CS * 2 - 38, CS - 22); }, 2);
  guide(RK.guide, [['駅前', 0], ['市役所', -1], ['国道', 1]]);
  guide(RK.guide2, [['中央', 0], ['港', -1], ['高速', 1]]);
  // 横断歩道（青い四角・白い三角・人と縞）
  cell(RK.sWalk, c => { c.fillStyle = '#1d5fb0'; c.fillRect(4, 4, 120, 120); c.fillStyle = W; c.beginPath(); c.moveTo(64, 14); c.lineTo(116, 112); c.lineTo(12, 112); c.closePath(); c.fill();
    c.fillStyle = '#1b1b1b'; c.beginPath(); c.arc(62, 48, 7, 0, Math.PI * 2); c.fill(); c.lineWidth = 6; c.strokeStyle = '#1b1b1b'; c.beginPath(); c.moveTo(62, 56); c.lineTo(60, 80); c.lineTo(50, 98); c.moveTo(60, 80); c.lineTo(72, 96); c.moveTo(48, 70); c.lineTo(62, 62); c.lineTo(74, 72); c.stroke();
    for (let k = 0; k < 5; k++) c.fillRect(30 + k * 15, 102, 8, 6); });
  // 踏切あり（黄色いひし形・黒いふち・汽車）
  const warn = (k: number, f: (c: CanvasRenderingContext2D) => void) => cell(k, c => { const dm = (m: number) => { c.beginPath(); c.moveTo(64, 2 + m); c.lineTo(126 - m, 64); c.lineTo(64, 126 - m); c.lineTo(2 + m, 64); c.closePath(); }; c.fillStyle = '#1b1b1b'; dm(0); c.fill(); c.fillStyle = '#f2c230'; dm(6); c.fill(); c.fillStyle = '#1b1b1b'; f(c); });
  warn(RK.sRail, c => { c.fillRect(34, 60, 52, 20); c.fillRect(70, 46, 16, 16); c.fillRect(42, 48, 8, 12); for (const u of [42, 58, 76]) { c.beginPath(); c.arc(u, 84, 6, 0, Math.PI * 2); c.fill(); } });
  warn(RK.sSlow, c => { c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `900 30px ${F}`; c.fillText('徐行', 64, 64); });
  // 自転車ナビマーク（青い矢羽根と白い自転車）
  cell(RK.bike, c => { c.fillStyle = '#2a63b8'; c.beginPath(); c.moveTo(64, 4); c.lineTo(116, 52); c.lineTo(116, 124); c.lineTo(64, 84); c.lineTo(12, 124); c.lineTo(12, 52); c.closePath(); c.fill();
    c.strokeStyle = W; c.lineWidth = 4; c.beginPath(); c.arc(44, 68, 12, 0, Math.PI * 2); c.moveTo(96, 68); c.arc(84, 68, 12, 0, Math.PI * 2); c.moveTo(44, 68); c.lineTo(58, 50); c.lineTo(78, 50); c.lineTo(84, 68); c.moveTo(58, 50); c.lineTo(64, 68); c.lineTo(78, 50); c.stroke(); });
  // 駐車禁止（青い円・赤い輪と斜線）
  cell(RK.sNoPark, c => { c.fillStyle = '#d42a24'; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill(); c.fillStyle = '#1f4fa8'; c.beginPath(); c.arc(64, 64, 49, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#d42a24'; c.lineWidth = 11; c.beginPath(); c.moveTo(30, 30); c.lineTo(98, 98); c.stroke(); });
  // 行き止まり（黄色のひし形の警戒標識の代わりに、白地に赤い T 字）
  cell(RK.sDead, c => { c.fillStyle = '#f2f2ee'; c.fillRect(8, 8, 112, 112); c.strokeStyle = '#1d4f9c'; c.lineWidth = 6; c.strokeRect(10, 10, 108, 108); c.fillStyle = '#1d4f9c'; c.fillRect(56, 50, 16, 60); c.fillStyle = '#d42a24'; c.fillRect(28, 30, 72, 16); });
  // バス停の標識の円板（白地に緑の輪と黒いバス）
  cell(RK.sBus, c => { c.fillStyle = W; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill(); c.strokeStyle = '#2f8a5a'; c.lineWidth = 10; c.beginPath(); c.arc(64, 64, 52, 0, Math.PI * 2); c.stroke(); c.fillStyle = '#2b2f33'; c.fillRect(34, 46, 60, 30); c.fillStyle = W; c.fillRect(40, 52, 48, 10); c.fillStyle = '#2b2f33'; c.beginPath(); c.arc(46, 80, 6, 0, Math.PI * 2); c.arc(82, 80, 6, 0, Math.PI * 2); c.fill(); });
  // キロポスト（白い板に黒い数字）
  cell(RK.kilo, c => { c.fillStyle = W; c.fillRect(20, 8, 88, 112); c.fillStyle = '#1b1b1b'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = `800 46px ${F}`; c.fillText('12', 64, 40); c.font = `800 34px ${F}`; c.fillText('5', 64, 92); c.fillRect(30, 64, 68, 4); });
  return cv;
}

export function roadKitTex(): THREE.Texture {
  if (TEX) return TEX;
  const cv = draw();
  const t = cv ? new THREE.CanvasTexture(cv) : new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  return (TEX = t);
}
/** 路面標示と標識の面の材質（1 つ）。路面に貼る面が道路に埋もれないよう、深度を手前へずらす */
export function roadKitMat(): THREE.MeshStandardMaterial {
  if (MAT) return MAT;
  MAT = new THREE.MeshStandardMaterial({ map: roadKitTex(), vertexColors: true, alphaTest: 0.42, roughness: 0.78, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  return MAT;
}
function uvOf(k: number, span = 1): number[] {
  const c = k % COLS, r = (k / COLS) | 0, e = 1.5 / (COLS * CS), u0 = c / COLS + e, u1 = (c + span) / COLS - e, v1 = 1 - r / ROWS - e, v0 = 1 - (r + 1) / ROWS + e;
  return [u0, v0, u1, v0, u1, v1, u0, v1];
}
/** 路面に貼る絵：中心 (x, z)、絵の上が向く向き (fx, fz)（＝進む向き）、進む向きの長さ L・幅 Wd。y は地面の高さの関数 */
export function decal(g: Geo, k: number, x: number, z: number, fx: number, fz: number, L: number, Wd: number, y: (x: number, z: number) => number, color = 0xffffff, shade = 1, span = 1): void {
  const rx = -fz, rz = fx, hl = L / 2, hw = Wd / 2, o = 0.155;
  const P = (a: number, b: number): V3 => { const px = x + fx * a + rx * b, pz = z + fz * a + rz * b; return [px, y(px, pz) + o, pz]; };
  g.quad(P(-hl, -hw), P(-hl, hw), P(hl, hw), P(hl, -hw), color, shade, uvOf(k, span));
}
/** 立てた板の表の絵：中心 (x, y, z)、表が向く向き (nx, nz)、幅 w・高さ h */
export function face(g: Geo, k: number, x: number, y: number, z: number, nx: number, nz: number, w: number, h: number, span = 1, shade = 1): void {
  const rx = nz, rz = -nx, hw = w / 2, hh = h / 2;
  g.quad([x - rx * hw, y - hh, z - rz * hw], [x + rx * hw, y - hh, z + rz * hw], [x + rx * hw, y + hh, z + rz * hw], [x - rx * hw, y + hh, z - rz * hw], 0xffffff, shade, uvOf(k, span));
}

// ------------------------------------------------------------ 道路の区画ごとの標示と小物（v86）
const mixHex = (a: number, b: number, t: number) => { const f = (k: number) => Math.round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };
export interface RoadTileArgs {
  g: Geo; kit: Geo; s: GameState; i: number; x: number; y: number; t: number; cx: number; cz: number; hw: number; Wd: number;
  /** 腕（つながる向き）ごとの車道の半幅（0 はつながらない） */
  aE: number; aW: number; aS: number; aN: number; nConn: number;
  kerbless: boolean; stone: boolean; wide: boolean; ak: number;
  hA: (x: number, z: number) => number; mark: (x0: number, z0: number, x1: number, z1: number, color: number) => void;
  sig: boolean; fine: boolean; hi: boolean; conn: (x: number, y: number) => number; lamps: number[];
  /** v89：信号の灯の一覧（x, y, z, 表の向き nx, nz, 種類 0 青・1 黄・2 赤・3 歩行者の赤・4 歩行者の青, 青になる軸 0 東西・1 南北）。点灯は scene が周期に合わせて描く */
  sigs?: number[];
  /** v101：区画 (x, y) が信号のある交差点か（導流帯は信号のある幹線の交差点の手前だけ） */
  sigAt?: (x: number, y: number) => boolean;
  /** v103：横断歩道を引く腕（roadbase の crosswalkArms のビット：1 東・2 西・4 南・8 北）と、区画 (x, y) の交差点の同じ値（手前の区画のダイヤマーク） */
  xwArms: number; xwAt?: (x: number, y: number) => number;
}
/** 腕 (dx, dz) の crosswalkArms のビット */
const xwBit = (dx: number, dz: number) => (dx > 0 ? 1 : dx < 0 ? 2 : dz > 0 ? 4 : 8);
/** 1 区画の路面標示（中央線・車線境界線・外側線・停止線・横断歩道・止まれ・矢印・ダイヤマーク・速度・導流帯）と、
 *  縁石・側溝とグレーチング・植樹帯・ガードパイプ・信号機（車両用・歩行者用）・標識（止まれ・制限速度・案内・横断歩道）・行き止まりの車止め。
 *  向きの決まり：腕 (dx, dz) は区画の中心から外向き。日本は左側通行なので、中心へ近づく車線は進む向きの左＝直交する座標の符号 ap の側 */
export function roadTile(o: RoadTileArgs): void {
  const { g, kit, s, x, y, t, cx, cz, hw, Wd, nConn, hA, mark } = o;
  const big4 = t === 3 || o.wide, junction = nConn >= 3, fine = o.fine && !o.stone;
  const arms: [number, number, number][] = []; if (o.aE) arms.push([1, 0, o.aE]); if (o.aW) arms.push([-1, 0, o.aW]); if (o.aS) arms.push([0, 1, o.aS]); if (o.aN) arms.push([0, -1, o.aN]);
  const fade = (c: number) => mixHex(c, 0x8a877f, o.ak * 0.4); // 古い道は白線がかすれて灰色がかる
  const W1 = fade(0xeeeeea), Y1 = fade(0xf0bc2c), E1 = fade(0xdcdcd8), pw = 1 - o.ak * 0.25;
  // 平らな面（高さ o2 で重なり順を決める）・腕の座標（d：中心から腕の向きの距離、q：直交する向き）
  const flat = (x0: number, z0: number, x1: number, z1: number, col: number, o2: number) => { const X0 = cx + Math.min(x0, x1), X1 = cx + Math.max(x0, x1), Z0 = cz + Math.min(z0, z1), Z1 = cz + Math.max(z0, z1);
    g.quad([X0, hA(X0, Z1) + o2, Z1], [X1, hA(X1, Z1) + o2, Z1], [X1, hA(X1, Z0) + o2, Z0], [X0, hA(X0, Z0) + o2, Z0], col); };
  const AL = (dx: number, dz: number, d0: number, d1: number, q0: number, q1: number, col: number, o2 = -1) => { if (o2 < 0) { if (dx) mark(dx * d0, q0, dx * d1, q1, col); else mark(q0, dz * d0, q1, dz * d1, col); } else { if (dx) flat(dx * d0, q0, dx * d1, q1, col, o2); else flat(q0, dz * d0, q1, dz * d1, col, o2); } };
  const WP = (dx: number, dz: number, d: number, q: number): [number, number] => (dx ? [cx + dx * d, cz + q] : [cx + q, cz + dz * d]);
  // 任意の 4 点の平らな面（上向きになる順に並べる）
  const mqTop = (pts: [number, number][], o2: number, col: number) => { const P = pts.map(([px, pz]) => [px, hA(px, pz) + o2, pz] as V3); const ux = P[1][0] - P[0][0], uz = P[1][2] - P[0][2], vx = P[2][0] - P[0][0], vz = P[2][2] - P[0][2]; if (uz * vx - ux * vz >= 0) g.quad(P[0], P[1], P[2], P[3], col); else g.quad(P[0], P[3], P[2], P[1], col); };
  const mq = (pts: [number, number][], col: number) => mqTop(pts, 0.142, col);
  // 縁石：線 A→B（世界座標）に、道路側（nx, nz）を向いた立ち上がりと天端。斜面に沿うよう 5m ごとに切る
  const curb = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
    const L = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.ceil(L / 5));
    for (let q = 0; q < k; q++) { let x0 = ax + (bx - ax) * q / k, z0 = az + (bz - az) * q / k, x1 = ax + (bx - ax) * (q + 1) / k, z1 = az + (bz - az) * (q + 1) / k;
      if (-(z1 - z0) * nx + (x1 - x0) * nz < 0) { [x0, x1] = [x1, x0]; [z0, z1] = [z1, z0]; }
      const y0 = hA(x0, z0), y1 = hA(x1, z1);
      g.quad([x0, y0 + 0.08, z0], [x1, y1 + 0.08, z1], [x1, y1 + 0.26, z1], [x0, y0 + 0.26, z0], 0xb6b2a8);
      const ox = -nx * 0.2, oz = -nz * 0.2; mqTop([[x0, z0], [x1, z1], [x1 + ox, z1 + oz], [x0 + ox, z0 + oz]], 0.26, 0xcac6bc); }
  };
  const inM = (xx: number, yy: number) => xx >= 0 && yy >= 0 && xx < W && yy < H;
  const bigNb = arms.some(([dx, dz]) => inM(x + dx, y + dz) && s.road[idx(x + dx, y + dz)] >= 2);
  const minorEW = hash(x, y, 41) < 0.5;
  // v101：信号の無い交差点で一時停止（止まれ）にする側：つながる道のうち狭い方。どれも同じ等級なら通りごとに決めた片方（東西か南北）
  const armCls = (dx: number, dz: number) => (inM(x + dx, y + dz) ? s.road[idx(x + dx, y + dz)] : 3);
  const clsEW = Math.max(o.aE ? armCls(1, 0) : 0, o.aW ? armCls(-1, 0) : 0), clsNS = Math.max(o.aS ? armCls(0, 1) : 0, o.aN ? armCls(0, -1) : 0);
  const isMinor = (ew: boolean) => junction && !o.sig && !o.stone && clsEW > 0 && clsNS > 0 && (clsEW === clsNS ? ew === minorEW : (ew ? clsEW < clsNS : clsNS < clsEW));
  const sh = (k: number) => hash(x, y, k);
  for (const [dx, dz, ah] of arms) {
    const ew = dx !== 0, ap = dx ? dx : -dz, apO = -ap, ax = hash(ew ? y : x, ew ? 7 : 13, t * 5 + (o.wide ? 1 : 0));
    const nx = x + dx, ny = y + dz, nIn = inM(nx, ny);
    const minor = isMinor(ew), xw = !!(o.xwArms & xwBit(dx, dz)); void bigNb;
    const perp = ew ? Math.max(o.aN, o.aS) : Math.max(o.aE, o.aW), XL = crosswalkLayout(ah, perp), [xw0, xw1] = XL.xw; // v95：横断歩道は隅切りの切り下げから。v101：配置は crosswalkLayout（区画の半分に収まる）
    const stopAt = xw ? XL.stop[0] : minor ? perp + CORNER_R + 0.5 : 0, from = junction ? (stopAt ? stopAt + 0.6 : perp + CORNER_R) : 0;
    const nJ = nIn && o.conn(nx, ny) >= 3; // この腕の先の区画も交差点（30m おきの交差点）
    const approach = !junction && nConn === 2 && nIn && o.conn(nx, ny) >= 3 && !o.stone; // この先（腕の向き）が交差点
    const d0 = junction ? hw : 0;
    // v95：縁石・側溝・歩道は roadbase.ts（隅切り・切り下げつき）
    // --- 外側線・路側帯の線
    const eo = o.kerbless ? ah - 0.15 : t >= 2 ? ah - 0.8 : ah - 0.3;
    if (!junction || from < 14) for (const sg of [-1, 1]) AL(dx, dz, junction ? from : d0, 15, sg * eo - 0.075, sg * eo + 0.075, E1); // 交差点の中・横断歩道の上には引かない（v101：停止線の先に 1m も残らない切れ端は引かない）
    // --- わだち（古い道：車輪の通る所が黒ずむ）
    if (fine && o.ak > 0.45) { const rc = mixHex(0x56524c, 0x34353a, Math.min(1, (o.ak - 0.45) / 0.4) * 0.7);
      for (const ln of ah >= 7 ? [1.9, 5.6] : ah >= 4.5 ? [2.5] : [1.25]) for (const sg of [-1, 1]) for (const wq of [-0.8, 0.8]) AL(dx, dz, d0, 15, sg * ln + wq - 0.28, sg * ln + wq + 0.28, rc, 0.108); }
    // --- 中央線（2 車線は通りごとに白の破線・白の実線・黄の実線、幹線は黄の実線か白の 2 本線）。交差点の手前は実線
    // v101：導流帯は、信号のある幹線の交差点の手前（右折車線を作る所）で、反対側の区画も交差点でない（右折車線の長さが取れる）所だけ
    const zebra = big4 && approach && ah >= 7 && (!o.sigAt || o.sigAt(nx, ny)) && !(inM(x - dx, y - dz) && o.conn(x - dx, y - dz) >= 3);
    if (t >= 2 && ah > 3) {
      const ylw = big4 ? ax < 0.8 : ax < 0.35, solid = big4 || ax < 0.65 || junction || approach, col = ylw ? Y1 : W1, lines = big4 && !ylw ? [-0.2, 0.2] : [0];
      const e1 = zebra ? 3 : 15;
      for (const q of lines) { if (junction && from >= 14) break; if (solid) AL(dx, dz, from, e1, q - 0.075, q + 0.075, col); else for (let d = from + 0.5; d < e1; d += 6) AL(dx, dz, d, Math.min(e1, d + 3), q - 0.075, q + 0.075, col); }
      if (zebra) { // 導流帯（ゼブラ）：中央が 3m から広がり、斜めの縞
        const wq = (d: number) => 0.65 * Math.min(1, Math.max(0, (d - 3) / 6));
        for (const sg of [-1, 1]) { const seg = (da: number, db: number) => { const [p0x, p0z] = WP(dx, dz, da, sg * wq(da) - 0.07), [p1x, p1z] = WP(dx, dz, db, sg * wq(db) - 0.07), [p2x, p2z] = WP(dx, dz, db, sg * wq(db) + 0.07), [p3x, p3z] = WP(dx, dz, da, sg * wq(da) + 0.07); mq([[p0x, p0z], [p1x, p1z], [p2x, p2z], [p3x, p3z]], W1); }; seg(3, 9); seg(9, 15); }
        for (let d = 6; d < 14.6; d += 1.4) { const w2 = wq(d) - 0.05, [p0x, p0z] = WP(dx, dz, d, -w2), [p1x, p1z] = WP(dx, dz, d + 0.25, -w2), [p2x, p2z] = WP(dx, dz, d + 0.25 + w2 * 1.2, w2), [p3x, p3z] = WP(dx, dz, d + w2 * 1.2, w2); if (d + 0.25 + w2 * 1.2 < 15) mq([[p0x, p0z], [p1x, p1z], [p2x, p2z], [p3x, p3z]], W1); }
      }
    }
    // --- 車線境界線（幹線）：破線、交差点の中と手前（交差点へ向かう側）は実線
    if (big4 && ah >= 7) for (const q of [-3.75, 3.75]) {
      const toward = approach && Math.sign(q) === apO;
      if ((junction && from < 14) || toward) AL(dx, dz, toward ? 3 : from, 15, q - 0.075, q + 0.075, W1);
      if (!junction) for (let d = 0.5; d < (toward ? 3 : 15); d += 6) AL(dx, dz, d, Math.min(toward ? 3 : 15, d + 3), q - 0.075, q + 0.075, W1);
    }
    // --- 横断歩道と停止線、止まれ
    if (junction) {
      if (xw) for (const [k0, k1] of XL.stripes) AL(dx, dz, xw0, xw1, k0, k1, W1); // 縞 45cm・間隔 45cm、横断歩道の幅 4m（生活道路 3m）
      if (stopAt) AL(dx, dz, stopAt, stopAt + 0.45, ap > 0 ? 0 : -(ah - 0.8), ap > 0 ? ah - 0.8 : 0, W1); // 停止線：横断歩道の 1.5m 手前、近づく車線の側だけ
      // 路面の「止まれ」：停止線の先。先が交差点（30m おき）で区画の境を越えるときは描かない（隣の交差点の標示と重ねない）
      if (minor && (!nJ || stopAt + 3.6 < 15)) { const [px, pz] = WP(dx, dz, stopAt + 2.3, ap * Math.min(1.25, ah * 0.5)); decal(kit, RK.stop, px, pz, -dx, -dz, 3.4, 2.3, hA, 0xffffff, pw); }
    }
    // --- 交差点の手前の区画：矢印（幹線の車線ごと）とダイヤマーク（横断歩道あり）。2 車線はダイヤだけ
    if (approach && t >= 2) {
      const dia = !o.xwAt || !!(o.xwAt(nx, ny) & xwBit(-dx, -dz)); // v103：ダイヤマークは、この先の交差点のこちら側の腕に横断歩道があるときだけ
      if (big4 && ah >= 7) { for (const [q, k] of [[1.9, RK.arRS], [5.6, sh(81) < 0.5 ? RK.arLS : RK.arS]] as const) { const [px, pz] = WP(dx, dz, 9.5, apO * q); decal(kit, k, px, pz, dx, dz, 5, 1.7, hA, 0xffffff, pw); const [qx, qz] = WP(dx, dz, -2, apO * q); if (dia) decal(kit, RK.dia, qx, qz, dx, dz, 4.5, 1.5, hA, 0xffffff, pw); } }
      else if (dia) { const [qx, qz] = WP(dx, dz, 3, apO * 2.5); decal(kit, RK.dia, qx, qz, dx, dz, 4.5, 1.5, hA, 0xffffff, pw); }
      // 案内標識（幹線の手前、青い板を道路の上へ張り出す）
      if (fine && big4 && sh(83) < 0.55) { const po = Wd - 0.5, [px, pz] = WP(dx, dz, 2, apO * po), arm = po - 3.2, hy = hA(px, pz);
        g.at(px, hy, pz); g.cyl(0, 0, 0, 0.18, 7.2, 0x8b9094, 6); g.at(0, 0, 0);
        const [mx, mz] = WP(dx, dz, 2, apO * (po - arm / 2)); g.box(mx, hy + 6.6, mz, ew ? 0.2 : arm, 0.2, ew ? arm : 0.2, 0x8b9094);
        const [sx, sz] = WP(dx, dz, 2.15, apO * 3.6); g.box(sx, hy + 5.4, sz, ew ? 0.12 : 5, 2.5, ew ? 5 : 0.12, 0x6f757c); // 板の裏
        const [fx, fz] = WP(dx, dz, 2.0, apO * 3.6); face(kit, sh(84) < 0.5 ? RK.guide : RK.guide2, fx - dx * 0.03, hy + 6.65, fz - dz * 0.03, -dx, -dz, 4.8, 2.4, 2); }
    }
  }
  // --- 生活道路どうしの交差点：優先の側の外側線を点線で交差点の中へ通す
  if (t === 1 && junction && !bigNb && !o.stone) { const ewMaj = !minorEW; for (const sg of [-1, 1]) for (let d = -hw + 0.3; d < hw - 0.2; d += 1.1) { if (ewMaj) mark(d, sg * (hw - 0.15) - 0.075, d + 0.5, sg * (hw - 0.15) + 0.075, E1); else mark(sg * (hw - 0.15) - 0.075, d, sg * (hw - 0.15) + 0.075, d + 0.5, E1); } }
  // --- 直線の区画：速度の数字・自転車ナビマーク・制限速度の標識・植樹帯・ガードパイプ
  const straight = nConn === 2 && (!!o.aE === !!o.aW) && !junction, ewS = !!o.aE;
  const anyApproach = arms.some(([dx, dz]) => inM(x + dx, y + dz) && o.conn(x + dx, y + dz) >= 3);
  if (straight && !o.stone) {
    const dir = sh(31) < 0.5 ? 1 : -1, [fx, fz] = ewS ? [dir, 0] : [0, dir], left = ewS ? -dir : dir; // 進む向き (fx, fz) と、その左（直交する座標の符号）
    if (!anyApproach && sh(32) < 0.22) {
      const num = t === 1 ? RK.n30 : big4 ? RK.n50 : RK.n40, col = t === 1 ? 0xffffff : 0xf0c23a;
      for (const q of t === 1 ? [1.25] : big4 ? [1.9, 5.6] : [2.5]) { const [px, pz] = WP(fx, fz, 0, left * q); decal(kit, num, px, pz, fx, fz, 4.2, 1.7, hA, col, pw); }
      if (fine) { const [px, pz] = WP(fx, fz, -9, left * (Wd - 0.5)), hy = hA(px, pz); g.at(px, hy, pz); g.cyl(0, 0, 0, 0.05, 2.9, 0x9aa0a6, 5); g.at(0, 0, 0); g.box(px + fx * 0.04, hy + 2.05, pz + fz * 0.04, fz ? 0.82 : 0.03, 0.8, fx ? 0.82 : 0.03, 0x9aa0a6);
        face(kit, t === 1 ? RK.s30 : big4 ? RK.s50 : RK.s40, px - fx * 0.02, hy + 2.45, pz - fz * 0.02, -fx, -fz, 0.8, 0.8);
        if (t === 2 && sh(33) < 0.5) face(kit, RK.sNoPark, px - fx * 0.02, hy + 1.65, pz - fz * 0.02, -fx, -fz, 0.6, 0.6); }
    }
    if (t === 2 && !o.wide && sh(37) < 0.45) for (const sg of [-1, 1]) { const [f2x, f2z] = ewS ? [sg, 0] : [0, sg], l2 = ewS ? -sg : sg; const [px, pz] = WP(f2x, f2z, sg * 4, l2 * 3.9); decal(kit, RK.bike, px, pz, f2x, f2z, 1.7, 1.0, hA, 0xffffff, pw); }
    // 植樹帯（幹線）とガードパイプ（2 車線）：通りごとに決める
    if (fine && t >= 2) { const sa = hash(ewS ? y : x, ewS ? 17 : 19, 91), ah = ewS ? o.aE : o.aS, ux = ewS ? 1 : 0, uz = ewS ? 0 : 1;
      if (big4 && sa < 0.65) { for (const sg of [-1, 1]) for (const seg of [-1, 1]) { const [px, pz] = WP(ux, uz, seg * 7.25, sg * (ah + 0.42)), hy = hA(px, pz);
        g.box(px, hy + 0.15, pz, ewS ? 13.5 : 0.75, 0.24, ewS ? 0.75 : 13.5, 0xb8b4aa); g.box(px, hy + 0.39, pz, ewS ? 13.1 : 0.55, 0.5, ewS ? 0.55 : 13.1, 0x3d6634, 0x4a7a3c); // 縁石で囲んだ低い生け垣
        if (o.hi) for (const u of [-4.5, 0, 4.5]) g.blob(px + ux * u, hy + 0.95, pz + uz * u, 0.7, 0.45, 0.7, 0x3a6a33, 6); } }
      else if (big4 || sa < 0.45) for (const sg of [-1, 1]) { const q = sg * (ah + 0.3); // 白いガードパイプ（支柱と 2 本の横の管）
        for (let d = -13.5; d <= 13.5; d += o.hi ? 3 : 6) { const [px, pz] = WP(ux, uz, d, q); g.box(px, hA(px, pz) + 0.2, pz, 0.08, 0.75, 0.08, 0xf2f2ee); }
        for (const hy2 of [0.55, 0.88]) for (const seg of [-1, 1]) { const [px, pz] = WP(ux, uz, seg * 6.9, q); g.box(px, hA(px, pz) + 0.2 + hy2 - 0.04, pz, ewS ? 13.6 : 0.07, 0.07, ewS ? 0.07 : 13.6, 0xf2f2ee); } }
    }
  }
  // --- 信号機：近づく車線から見て交差点の向こう側の左の角に柱、道路の上へ腕を出して横長の灯器。柱には歩行者用の灯器も
  if (o.sig && junction && o.fine) for (const [dx, dz, ah] of arms) {
    const ew = dx !== 0, Lx = -dz, Lz = dx; // 近づく車（-dx, -dz へ進む）の左
    const su = Math.sign(-dx + Lx), sv = Math.sign(-dz + Lz), [cu, cv] = cornerSpot(su > 0 ? o.aE : o.aW, sv > 0 ? o.aS : o.aN, hw); // v95：向こう側の角の歩道（隅切りの円弧の内）
    const px = cx + su * cu, pz = cz + sv * cv, hy = hA(px, pz), poleL = Lx ? cu : cv;
    g.at(px, hy, pz); g.cyl(0, 0, 0, 0.13, 6.0, 0x8b9094, 6); g.at(0, 0, 0);
    const reach = poleL - ah * 0.45, hx = px - Lx * reach, hz = pz - Lz * reach;
    g.box(px - Lx * reach / 2, hy + 5.6, pz - Lz * reach / 2, ew ? 0.12 : reach, 0.12, ew ? reach : 0.12, 0x8b9094);
    // 灯器（横長の薄い LED 型）：左（柱の側）から青・黄・赤。表は近づく車の向き（+dx, +dz）
    g.box(hx, hy + 5.15, hz, ew ? 0.28 : 1.25, 0.42, ew ? 1.25 : 0.28, 0x5d636a);
    for (let k = 0; k < 3; k++) { const u = (1 - k) * 0.4; g.box(hx + Lx * u + dx * 0.15, hy + 5.21, hz + Lz * u + dz * 0.15, ew ? 0.05 : 0.3, 0.3, ew ? 0.3 : 0.05, 0x23272b); o.sigs?.push(hx + Lx * u + dx * 0.19, hy + 5.21, hz + Lz * u + dz * 0.19, dx, dz, k, ew ? 0 : 1); } // v89：灯そのものは scene の信号灯（点灯が切り替わる）
    // 歩行者用（横断歩道の向こうへ向ける）
    if (o.xwArms & xwBit(dx, dz)) for (const [nx, nz] of [[-Lx, -Lz], [dx, dz]]) { const bx = px + nx * 0.3, bz = pz + nz * 0.3; g.box(bx, hy + 2.3, bz, nx ? 0.25 : 0.42, 0.85, nz ? 0.25 : 0.42, 0x5d636a); g.box(bx + nx * 0.13, hy + 2.75, bz + nz * 0.13, nx ? 0.03 : 0.3, 0.3, nz ? 0.03 : 0.3, 0x23272b); g.box(bx + nx * 0.13, hy + 2.38, bz + nz * 0.13, nx ? 0.03 : 0.3, 0.3, nz ? 0.03 : 0.3, 0x23272b);
      o.sigs?.push(bx + nx * 0.16, hy + 2.75, bz + nz * 0.16, nx, nz, 3, nx ? 0 : 1, bx + nx * 0.16, hy + 2.38, bz + nz * 0.16, nx, nz, 4, nx ? 0 : 1); } // 横断歩道を渡る人の進む向き＝表の向きの軸
  }
  // --- 標識：生活道路の止まれ（止まれの側の角）、信号のない横断歩道の標識
  if (fine && junction) for (const [dx, dz, ah] of arms) {
    const ew = dx !== 0, ap = dx ? dx : -dz, minor = isMinor(ew), xw = !!(o.xwArms & xwBit(dx, dz));
    if (!(minor || (xw && !o.sig))) continue;
    const perp = ew ? Math.max(o.aN, o.aS) : Math.max(o.aE, o.aW), d = minor && !xw ? perp + CORNER_R + 0.8 : Math.min(14.5, xwRange(ah, perp)[1] + 0.6);
    const [px, pz] = WP(dx, dz, d, ap * (ah + walkW(ah) - 0.5)), hy = hA(px, pz), k = minor ? RK.sStop : RK.sWalk;
    g.at(px, hy, pz); g.cyl(0, 0, 0, 0.05, 2.7, 0x9aa0a6, 5); g.at(0, 0, 0);
    g.box(px - dx * 0.04, hy + 1.9, pz - dz * 0.04, ew ? 0.03 : 0.85, 0.8, ew ? 0.85 : 0.03, 0x9aa0a6);
    face(kit, k, px + dx * 0.02, hy + 2.3, pz + dz * 0.02, dx, dz, 0.9, 0.9);
  }
  // --- 行き止まり：端に車止め（白と赤の柱）と標識
  if (nConn === 1 && fine && arms.length) { const [dx, dz] = arms[0];
    for (let q = -hw + 0.7; q <= hw - 0.6; q += 1.3) { const [px, pz] = WP(dx, dz, -(hw - 0.4), q), hy = hA(px, pz); g.at(px, hy, pz); g.cyl(0, 0, 0, 0.08, 0.85, 0xf2f2ee, 6, 0xd8342a); g.cyl(0, 0.55, 0, 0.085, 0.12, 0xd8342a, 6); g.at(0, 0, 0); }
    const [px, pz] = WP(dx, dz, -(hw - 0.2), Wd - 0.6), hy = hA(px, pz); g.at(px, hy, pz); g.cyl(0, 0, 0, 0.05, 2.4, 0x9aa0a6, 5); g.at(0, 0, 0);
    face(kit, RK.sDead, px + dx * 0.03, hy + 2.05, pz + dz * 0.03, dx, dz, 0.75, 0.75); }
  // --- v88：路面の色と質感（補修のパッチ・掘り返しの跡・交差点のカラー舗装・バスレーン・自転車レーン・ゾーン 30）と、古い道の補修工事
  if (!fine) return;
  /** 道に沿った座標 (u：進む向き, v：横) の四角を、区画の向きに合わせて塗る */
  const UV = (u0: number, v0: number, u1: number, v1: number, col: number, o2: number) => { if (ewS) flat(u0, v0, u1, v1, col, o2); else flat(v0, u0, v1, u1, col, o2); };
  const lineH = hash(ewS ? y : x, ewS ? 17 : 19, 73); // 同じ通り（行・列）で同じ値
  if (straight && !o.stone) {
    // 補修のパッチ（新しい濃いアスファルトの四角）と、管を埋めた細長い掘り返しの跡。古い道ほど多い
    if (o.ak > 0.25 && sh(74) < 0.2 + o.ak * 0.5) { const u = (sh(75) - 0.5) * 18, v = (sh(76) - 0.5) * (hw - 1), l = 1.4 + sh(77) * 3, w = 1 + sh(78) * 1.8; UV(u - l / 2, v - w / 2, u + l / 2, v + w / 2, 0x313438, 0.122); }
    if (sh(79) < 0.12 + o.ak * 0.15) { const v = (sh(80) - 0.5) * (hw * 1.4); UV(-15, v - 0.35, 15, v + 0.35, o.ak > 0.5 ? 0x3b3e42 : 0x5a5853, 0.121); }
    // バスレーン（幹線の外側の車線を茶色に。通りごとに決める）と自転車レーン（2 車線の道の左端を青く、矢羽根の白）
    if (big4 && lineH < 0.4) for (const sg of [-1, 1]) UV(-15, sg * (hw - 3.2), 15, sg * (hw - 0.35), fade(0x9a4a3c), 0.123);
    else if (t === 2 && !o.wide && lineH < 0.35) for (const sg of [-1, 1]) { UV(-15, sg * (hw - 1.25), 15, sg * (hw - 0.3), fade(0x3f6fb8), 0.123); for (let u = -12; u < 15; u += 7.5) UV(u, sg * (hw - 0.95), u + 1.6, sg * (hw - 0.6), W1, 0.13); }
    // ゾーン 30（住宅地の生活道路の入口：路面の赤い帯と「30」の円）
    else if (t === 1 && lineH < 0.18 && sh(81) < 0.5) { UV(-2.2, -hw + 0.3, 2.2, hw - 0.3, fade(0xa8463a), 0.123); decal(kit, RK.n30, ewS ? cx + 6 : cx, cz + (ewS ? 0 : 6), ewS ? 1 : 0, ewS ? 0 : 1, 2.6, 2.6, hA); }
  }
  // 交差点のカラー舗装（信号のある大きな交差点は、中を薄い赤茶に）
  if (junction && o.sig && !o.stone && hash(x, y, 82) < 0.6) flat(-hw + 0.4, -hw + 0.4, hw - 0.4, hw - 0.4, fade(0xa0645a), 0.121);
  // 補修工事中（とても古い道のひとつまみ）：片側の車線をカラーコーンと工事の柵で囲み、誘導員と矢印板
  if (straight && o.ak > 0.85 && sh(83) < 0.18 && !o.stone) { const sg = sh(84) < 0.5 ? -1 : 1, v0 = sg * 0.3, v1 = sg * (hw - 0.4), vm = (v0 + v1) / 2;
    UV(-6, Math.min(v0, v1), 6, Math.max(v0, v1), 0x2c2f33, 0.124);
    const P = (u: number, v: number): [number, number] => ewS ? [cx + u, cz + v] : [cx + v, cz + u];
    for (let u = -7; u <= 7; u += 1.75) for (const v of [v0, v1]) { const [px, pz] = P(u, v); g.at(px, hA(px, pz) + 0.1, pz); g.box(0, 0, 0, 0.34, 0.04, 0.34, 0x2a2a2c); g.cyl(0, 0.04, 0, 0.13, 0.62, 0xe8501e, 6, 0xf2f2ee); g.at(0, 0, 0); } // カラーコーン（赤と白）
    for (const u of [-7.4, 7.4]) { const [px, pz] = P(u, vm), hy = hA(px, pz) + 0.1; g.box(px, hy + 0.25, pz, ewS ? 0.08 : Math.abs(v1 - v0), 0.55, ewS ? Math.abs(v1 - v0) : 0.08, 0xf2d030); g.box(px, hy + 0.95, pz, ewS ? 0.1 : 1.0, 1.0, ewS ? 1.0 : 0.1, 0x2a2a2c); }      // 柵と矢印板
    { const [px, pz] = P(-9.5, vm * 0.4), hy = hA(px, pz) + 0.1; g.box(px, hy + 0.45, pz, 0.36, 0.9, 0.3, 0x2c3a5a); g.box(px, hy + 1.15, pz, 0.42, 0.55, 0.32, 0xe8e030); g.box(px, hy + 1.6, pz, 0.24, 0.3, 0.24, 0xd8b090); g.box(px, hy + 1.8, pz, 0.3, 0.1, 0.3, 0xf2f2ee); } // 誘導員（反射ベストとヘルメット）
  }
}
