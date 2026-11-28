// v104b：駅舎をグレード（render/grades.ts）で描き分ける。線路（render/rails.ts）と一緒に、同じ Geo に描く。
//   0 無人駅：駅舎なし。ホームへ上がる短い階段と簡易 IC の柱・駐輪場。複線は構内踏切（rails.ts）
//   1 小さな駅舎：平屋（木造の切妻か、低い鉄筋）。複線はホームどうしを跨線橋で結ぶ
//   2 橋上駅舎：線路の上をまたぐコンコース（自由通路）。ホームへの階段とエレベーター、両側の出口
//   3 駅ビル：6〜9 階の商業ビル＋橋上のコンコース＋ペデストリアンデッキとバスターミナル
//   4 大型ターミナル：低層部＋高層の塔 2 本＋ガラスのアトリウム（現代）／赤れんがの駅舎（glb）と両脇の高層ビル（歴史）
// 座標：原点は線路の中心線上（駅舎の位置の真横）、地面の高さは駅舎の位置。+z が線路から離れる向き（駅前広場の側）、x は線路に沿う。
import type { Geo } from './geo';
import { stationFloors, seed01 } from './grades';

type V3 = [number, number, number];
export interface StationFrame {
  g: Geo; detail: number; lamps: number[];
  /** 原点（世界座標）と向き（at の回転） */
  ox: number; oy: number; oz: number; rot: number;
  /** 線路（レール面）の高さ（原点からの相対） */
  yr: number;
  /** 駅の側のホームの外の縁（線路の中心から）と、反対側の外の縁（負の値） */
  edgeN: number; edgeF: number;
  /** ホームの中心（駅の側・反対側。反対側にホームが無ければ NaN） */
  pfN: number; pfF: number;
  /** 駅舎を置きたい線路からの距離（敷地の位置から） */
  want: number;
  grade: number; seed: number; elevated: boolean; heritage: boolean;
  /** 新幹線の高架が反対側にある（反対側の出口の塔を置かず、コンコースを新幹線の高架まで延ばす） */
  shin: number;
  /** 原点からの位置の地面の高さ（原点からの相対） */
  ground: (x: number, z: number) => number;
  /** v105a：高架の桁の半幅（線路の中心から桁の縁まで。高架下のコンコースの奥行きに使う） */
  deck?: number;
  /** v105a：その位置（原点からの相対）の土地が空いているか（道路・水・ほかの建物・線路が無い）。赤れんがの駅の高層ビルを線路の反対側に置けるか調べる */
  free?: (x: number, z: number) => boolean;
  /** v105a：ガラス・窓の面を描く Geo（夜に灯る材質で描く）。無ければ g に描く */
  win?: Geo;
  /** v105a：地下の駅。原点は敷地の中心、x は敷地の長い向き（敷地は約 88m × 28m）。出入口・換気塔と、段 2 からは駅舎 */
  under?: boolean;
}
const WALL = 0xe9e5dc, ROOF = 0x5a6672, GLASS = 0x8fb2c4, GLASS2 = 0xa9c8d6, PAVE = 0xc8c3b8, STEP = 0xbdb8ad, RAIL = 0x8b9094, DECK = 0xcfc9bc;

export function drawStationBuilding(F: StationFrame): { bld?: { x: number; y: number; z: number; rot: number } } {
  const g = F.g, det = F.detail, G = F.grade;
  const gw = F.win ?? g; // v105a：ガラス・窓の面（夜に明かりが灯る。無ければ同じ Geo）
  const at = () => { g.at(F.ox, F.oy, F.oz, F.rot); gw.at(F.ox, F.oy, F.oz, F.rot); };
  const q2 = (a: V3, b: V3, c: V3, d: V3, col: number) => { g.quad(a, b, c, d, col); g.quad(d, c, b, a, col); };
  /** 階段の覆い：x0（上・高さ y0）から x1（下・高さ y1）へ。z は中心、w は幅。段の面・腰の壁・屋根 */
  const stair = (x0: number, x1: number, z: number, w: number, y0: number, y1: number, roof = true) => {
    const a = z - w / 2, b = z + w / 2;
    q2([x0, y0, a], [x1, y1, a], [x1, y1, b], [x0, y0, b], STEP);
    for (const e of [a, b]) q2([x0, y0, e], [x1, y1, e], [x1, y1 + 1.1, e], [x0, y0 + 1.1, e], GLASS2);
    if (roof) { q2([x0, y0 + 2.6, a - 0.2], [x1, y1 + 2.6, a - 0.2], [x1, y1 + 2.6, b + 0.2], [x0, y0 + 2.6, b + 0.2], ROOF); if (det >= 1) for (const e of [a, b]) g.box(x1 + (x0 - x1) * 0.15, y1, e, 0.14, 2.6 + (y0 - y1) * 0.15, 0.14, RAIL); }
  };
  /** 段々の階段（地面から台へ）。z0 が下、z1 が上（z の向き）、n 段 */
  const steps = (x: number, z0: number, z1: number, y0: number, y1: number, w: number) => { const n = Math.max(2, Math.round((y1 - y0) / 0.2)); for (let k = 0; k < n; k++) { const t0 = k / n; g.box(x, y0, z0 + (z1 - z0) * (t0 + 0.5 / n), w, (y1 - y0) * (k + 1) / n, Math.abs(z1 - z0) / n, STEP); } };
  /** 窓の帯のある箱の建物。fh 階の高さ、nf 階 */
  const bldg = (x: number, z: number, w: number, d: number, y0: number, nf: number, fh: number, wall: number, band: number, roof = ROOF) => {
    const h = nf * fh; g.box(x, y0, z, w, h, d, wall, roof);
    const step = det >= 1 ? 1 : 3;
    gw.surfv = 1; // v105a：事務所・店の窓（夜は窓ごとに点いたり消えたり）
    for (let f = 0; f < nf; f += step) { const y = y0 + f * fh + fh * 0.32; gw.box(x, y, z + d / 2 + 0.03, w - 1.2, fh * 0.48, 0.08, band); gw.box(x, y, z - d / 2 - 0.03, w - 1.2, fh * 0.48, 0.08, band); gw.box(x + w / 2 + 0.03, y, z, 0.08, fh * 0.48, d - 1.2, band); gw.box(x - w / 2 - 0.03, y, z, 0.08, fh * 0.48, d - 1.2, band); }
    gw.surfv = 0;
    g.box(x, y0 + h, z, w + 0.3, 0.5, d + 0.3, 0xd0cdc5, roof);
    return y0 + h + 0.5;
  };
  const bus = (x: number, z: number, col = 0x4f9a6a) => { g.box(x, 0.3, z, 10.4, 2.7, 2.5, col); g.box(x, 1.3, z, 10.5, 1.0, 2.56, 0xf2f2ee); g.box(x, 0.05, z, 9.8, 0.4, 2.4, 0x1c1d1f); };
  const taxi = (x: number, z: number) => { g.box(x, 0.25, z, 4.4, 0.75, 1.7, 0xe0c040); g.box(x - 0.2, 1.0, z, 2.4, 0.55, 1.5, 0x2a3138); };
  const tree = (x: number, z: number) => { g.box(x, 0, z, 0.3, 2.2, 0.3, 0x6b4a32); g.blob(x, 3.4, z, 1.8, 1.6, 1.8, 0x4f8a45, 5); };
  const yr = F.yr, ypf = yr + 1.1, ycb = yr + 7.2, ych = 5.0, far = Math.min(-3.6, F.edgeF);
  at();
  let out: { bld?: { x: number; y: number; z: number; rot: number } } = {};

  // ---- 地下の駅（v105a）：地上には地下鉄の出入口と換気塔だけ。段 2 から出入口の駅舎、段 3 は駅ビル、段 4 は高層の駅ビル
  //   前は段にかかわらず、敷地の中ほどに青い屋根の箱が 1 つだった
  if (F.under) {
    /** 地下鉄の出入口：屋根つきの階段の口（幅 3.4m・長さ 8m・高さ 2.8m）。開口は x の向き dir。駅名の標識（丸い板の柱） */
    const entrance = (x: number, z: number, dir: number) => {
      const L = 8, hw = 1.7, x0 = x - dir * L / 2, x1 = x + dir * L / 2;
      g.box(x, 0.08, z, L + 2, 0.06, 6, PAVE);                                                           // 出入口の前の舗装
      g.box(x + dir * 0.4, 0.1, z, L - 1.6, 0.03, hw * 2 - 0.5, 0x2a2c2e);                             // 下りる階段（暗い開口）
      for (const e of [-hw, hw]) { g.box(x, 0.1, z + e, L, 1.1, 0.12, 0xd4d9de); g.box(x, 1.1, z + e, L, 1.6, 0.06, GLASS2); } // 腰壁とガラスの横壁
      g.box(x0, 0.1, z, 0.3, 2.7, hw * 2 + 0.12, 0xd4d9de);                                               // 奥の壁
      g.box(x, 2.7, z, L + 0.6, 0.3, hw * 2 + 0.7, 0x5f6b77, 0x8f9aa4);                                  // 屋根
      g.box(x1 - dir * 0.2, 2.25, z, 0.1, 0.42, hw * 2 - 0.3, 0xf6f6f2); g.box(x1 - dir * 0.26, 2.3, z, 0.02, 0.32, 0.5, 0x2f6fb5); // 開口の上の駅名板
      g.box(x1 + dir * 0.8, 0, z + hw + 0.9, 0.12, 3.4, 0.12, 0x70767c); g.cyl(x1 + dir * 0.8, 3.0, z + hw + 0.9, 0.5, 0.12, 0x2f6fb5, 10); // 標識の柱
      F.lamps.push(F.ox + Math.cos(F.rot) * x + Math.sin(F.rot) * z, F.oy + 2.6, F.oz - Math.sin(F.rot) * x + Math.cos(F.rot) * z);
    };
    /** 換気塔（地下の駅の空気を入れ替える塔。コンクリートにがらりの帯） */
    const vent = (x: number, z: number, h = 3.6) => { g.box(x, 0, z, 3.4, h, 3.4, 0xb9b6ae, 0x8f8c86); for (let y = 0.8; y < h - 0.4; y += 0.7) for (const e of [-1.72, 1.72]) { g.box(x, y, z + e, 2.8, 0.32, 0.04, 0x55595c); g.box(x + e, y, z, 0.04, 0.32, 2.8, 0x55595c); } };
    if (G === 0) { entrance(-30, 2, -1); g.box(30, 0.08, -6, 4, 0.12, 2.2, 0x4a4d50); for (let k = 0; k < 6; k++) g.box(28.4 + k * 0.6, 0.2, -6, 0.08, 0.02, 2.1, 0x8b9094); return out; } // 床の換気口（格子）
    const ex = [0, 32, 34, 36, 38][G];
    entrance(-ex, 4, -1); entrance(ex, -4, 1);
    if (G === 1) { vent(0, -9); return out; }
    if (G === 2) { // 出入口の駅舎（2 階建て。改札は地下）
      g.box(0, 0, 0, 22, 8, 12, WALL, ROOF); g.box(0, 8, 0, 22.4, 0.4, 12.4, ROOF);
      for (const e of [-1, 1]) { gw.box(0, 0.2, e * 6.05, 10, 3.2, 0.1, GLASS); gw.box(0, 4.6, e * 6.05, 20, 2.2, 0.1, GLASS); g.box(0, 3.5, e * 7.2, 12, 0.25, 2.4, ROOF); g.box(0, 6.9, e * 6.08, 6, 0.8, 0.06, 0xf6f6f2); }
      vent(16, -9); F.lamps.push(F.ox, F.oy + 3.4, F.oz); return out;
    }
    const f = stationFloors(G, F.seed);
    if (G === 3) { // 駅ビル（地下の改札と直結）
      const w = 40, d = 22, top = bldg(0, 0, w, d, 0, f.bldg, 4.2, 0xe2dfd8, 0x7fa3bd);
      for (const e of [-1, 1]) { gw.box(0, 0.3, e * (d / 2 + 0.05), w - 2, 7.6, 0.12, GLASS); g.box(0, 8.6, e * (d / 2 + 0.12), w, 0.9, 0.12, 0xc3312b); }
      g.box(0, top, 0, 16, 2.4, 0.4, 0xf6f6f2); g.box(-12, top, -4, 6, 2.2, 5, 0xb9bcc0); vent(27, -9); // 屋上の看板・機械室、地上の換気塔
      F.lamps.push(F.ox, F.oy + 4, F.oz); return out;
    }
    // 段 4：低層部（3 階）と高層の塔、前のガラスのアトリウム
    const base = bldg(0, 0, 52, 24, 0, 3, 4.6, 0xdcdfe2, 0x7fa3bd), th = f.towerA * 3.9;
    for (const e of [-1, 1]) gw.box(0, 0.3, e * 12.05, 50, 8.6, 0.12, GLASS);
    g.box(-6, base, -1, 26, th - base, 18, 0xb9c6d0, 0x6f7a84);
    gw.surfv = 1;
    for (let y = base + 1.2; y < th - 1; y += det >= 1 ? 3.9 : 11.7) { for (const e of [-1, 1]) gw.box(-6, y, -1 + e * 9.04, 25.4, 1.9, 0.08, 0x6f93ad); for (const e of [-1, 1]) gw.box(-6 + e * 13.04, y, -1, 0.08, 1.9, 17.4, 0x6f93ad); }
    gw.surfv = 0;
    g.box(-6, th, -1, 20, 3, 12, 0x8f9aa4, 0x6f7a84);
    gw.box(16, base, 0, 12, 7, 16, GLASS2, GLASS2); vent(30, -10, 4.2); // 屋上のガラスの休憩所・換気塔
    F.lamps.push(F.ox, F.oy + 4, F.oz); return out;
  }

  // ---- 高架の駅（v105a）：改札とコンコースは高架の下（高架下の駅舎）。ホームへは床の階段口から下りる。段 3・4 は横に駅ビル・塔
  //   前は高架の横にレールの高さまでの箱を建て、ホームの縁へ通路の箱をつないでいた
  if (F.elevated) {
    const dk = F.deck ?? Math.max(F.edgeN, -F.edgeF), zA = Math.min(F.edgeF, -dk) + 0.3, zB = F.edgeN - 0.2, ch = yr - 2.4; // 桁の下面はレールの 1.9m 下
    const wd = [16, 22, 34, 40, 48][G];
    g.box(0, -0.6, zB + 8, Math.max(24, wd + 12), 0.75, 15, PAVE, 0xd2cdc2);                   // 駅前の広場
    if (ch >= 3.2) {
      const gy = Math.min(F.ground(-wd / 2, zA), F.ground(wd / 2, zA), F.ground(-wd / 2, zB), F.ground(wd / 2, zB), 0);
      g.box(0, gy - 0.3, (zA + zB) / 2, wd, ch - gy + 0.3, zB - zA, WALL, ROOF);                // 高架下の駅舎（改札・コンコース）
      const gh = Math.min(3.4, ch - 0.8);
      gw.box(0, 0.2, zB + 0.05, wd - 4, gh, 0.1, GLASS); if (G >= 2) gw.box(0, 0.2, zA - 0.05, wd * 0.5, gh, 0.1, GLASS);   // 入口のガラス（反対側の出口は段 2 から）
      g.box(0, Math.min(3.6, ch - 0.4), zB + 1.2, Math.min(14, wd - 2), 0.25, 2.4, ROOF);      // ひさし
      g.box(0, ch - 1.2, zB + 0.08, Math.min(8, wd - 4), 0.8, 0.06, 0xf6f6f2); g.box(0, ch - 1.0, zB + 0.12, Math.min(7, wd - 5), 0.18, 0.02, 0x2f8f57); // 駅名板
      F.lamps.push(F.ox, F.oy + 3, F.oz);
    } else { // 低い高架（上り坂の途中）：横に平屋の駅舎
      g.box(0, 0, zB + 6, wd, 4, 9, WALL, ROOF); g.box(0, 4, zB + 6, wd + 0.6, 0.4, 9.6, ROOF);
    }
    // ホームの階段口：床に下りる口（暗い開口）と、まわりのガラスの柵。段 2 からエスカレーター、エレベーター
    for (const zp of [F.pfN, F.pfF]) {
      if (isNaN(zp)) continue;
      const zo = zp + Math.sign(zp) * 0.45, Ls = 7, wS = 1.9;
      g.box(-1, ypf, zo, Ls, 0.02, wS, 0x2f3134);
      for (const e of [-wS / 2, wS / 2]) g.box(-1, ypf, zo + e, Ls, 1.1, 0.06, GLASS2);
      g.box(-1 - Ls / 2, ypf, zo, 0.06, 1.1, wS, GLASS2);
      if (G >= 2) { g.box(-10, ypf, zo, 6, 0.02, 1.2, 0x2f3134); for (const e of [-0.6, 0.6]) g.box(-10, ypf, zo + e, 6, 1.0, 0.1, 0x8b9094); }
      if (G >= 1) gw.box(6, ypf, zo, 1.8, 2.9, 1.6, GLASS2, ROOF);
    }
    if (G >= 3) { const d = G >= 4 ? 18 : 14; towers(zB + 1.7 + d / 2, d); }
    else if (G >= 1 && det >= 1) { taxi(9, zB + 10); g.box(-12, 2.5, zB + 11, 7, 0.14, 2.4, 0x9fb3bd); if (G >= 2) bus(-12, zB + 13.4); }
    return out;
  }

  // ---- 0 無人駅
  if (G === 0) {
    const z0 = F.edgeN;
    g.box(0, -0.6, z0 + 8, 16, 0.75, 9, PAVE, 0xd2cdc2);                                 // 小さな広場
    g.box(0, 0, z0 + 3.5, 2.6, 0.06, 4, 0xa9a49a);                                       // 通路
    steps(0, z0 + 3.2, z0 + 0.15, 0, ypf, 2.4);                                          // ホームへ上がる階段
    for (const e of [-1.35, 1.35]) g.box(e, 0, z0 + 1.7, 0.06, ypf + 0.9, 3.0, RAIL);     // 手すり
    g.box(1.9, 0, z0 + 3.8, 0.28, 1.15, 0.28, 0x70767c); g.box(1.9, 1.15, z0 + 3.8, 0.4, 0.32, 0.36, 0xf2f2ee); g.box(1.9, 1.2, z0 + 3.61, 0.3, 0.2, 0.02, 0x2f6fb5); // 簡易 IC の読み取り機
    g.box(-3.2, 0, z0 + 4.5, 0.1, 2.4, 0.1, 0x70767c); g.box(-3.2, 2.0, z0 + 4.5, 2.0, 0.6, 0.08, 0xf6f6f2); g.box(-3.2, 2.0, z0 + 4.46, 2.0, 0.12, 0.02, 0x2f8f57); // 駅名の看板
    g.box(6.5, 0, z0 + 6, 6, 2.2, 0.1, 0xd9dcde); g.box(6.5, 2.2, z0 + 6.6, 6.4, 0.12, 1.6, ROOF); for (const x of [3.6, 9.4]) g.box(x, 0, z0 + 7.2, 0.1, 2.2, 0.1, RAIL); // 駐輪場
    if (det >= 1) for (let k = 0; k < 7; k++) g.box(4.0 + k * 0.85, 0, z0 + 6.6, 0.08, 0.9, 1.5, [0x2b2f33, 0x9a3a32, 0x356b8c, 0xdadad6][k % 4]);
    return out;
  }

  // ---- 1 小さな駅舎（平屋）。複線は跨線橋（ホームとホームを結ぶ）
  if (G === 1) {
    const wood = seed01(F.seed, 5) < 0.55, wd = 16, d = 8, zc = Math.max(F.want, F.edgeN + 1.0 + d / 2), h = 4.2;
    g.box(0, -0.6, zc + d / 2 + 5, 30, 0.75, 11, PAVE, 0xd2cdc2);
    if (wood) { g.box(0, 0, zc, wd, h, d, 0xe6dcc4, 0x6b4a32); g.gable(0, h, zc, wd, d, 2.2, 0x4a4f58, 'x', 0xe6dcc4, 0.7); for (const x of [-wd / 2, -2.8, 2.8, wd / 2]) g.box(x, 0, zc + d / 2 + 0.05, 0.3, h, 0.12, 0x6b4a32); g.box(0, h - 0.5, zc + d / 2 + 0.06, wd, 0.3, 0.1, 0x6b4a32); }
    else { g.box(0, 0, zc, wd, h, d, 0xeeeae2, 0x9b9d9e); g.box(0, h, zc, wd + 0.4, 0.5, d + 0.4, 0x2f6fb5); }
    gw.box(0, 0.2, zc + d / 2 + 0.05, 5.4, 2.6, 0.1, GLASS); for (const x of [-5.6, 5.6]) gw.box(x, 1.0, zc + d / 2 + 0.05, 2.6, 1.6, 0.1, GLASS); // 入口と窓
    g.box(0, 3.0, zc + d / 2 + 1.0, 8, 0.2, 2.2, wood ? 0x4a4f58 : ROOF); g.box(0, 3.25, zc + d / 2 + 0.07, 4.2, 0.7, 0.08, 0xf6f6f2); // ひさしと駅名板
    // 駅舎の裏からホームへ（駅舎が離れていれば屋根つきの通路）
    const gap = zc - d / 2 - F.edgeN; if (gap > 0.6) { g.box(0, 0, F.edgeN + gap / 2, 3, 0.1, gap, 0xa9a49a); g.box(0, 2.8, F.edgeN + gap / 2, 3.4, 0.15, gap, ROOF); }
    steps(0, F.edgeN + Math.min(gap, 2.4) + 0.1, F.edgeN + 0.15, 0, ypf, 2.6);
    g.box(-12, 2.5, zc + d / 2 + 7, 7, 0.14, 2.4, 0x9fb3bd); for (const u of [-15, -9]) g.box(u, 0, zc + d / 2 + 7.8, 0.12, 2.5, 0.12, RAIL); // バス停
    taxi(9, zc + d / 2 + 6); if (det >= 1) taxi(14, zc + d / 2 + 6);
    if (!isNaN(F.pfF)) { // 跨線橋：ホームの上の階段の塔から、線路をまたぐ橋
      const x0 = -14, yb = ycb, L = F.pfN - F.pfF;
      g.box(x0, yb, (F.pfN + F.pfF) / 2, 3.4, 2.9, L + 2.6, 0xe4e2dc, ROOF); g.box(x0, yb + 1.0, (F.pfN + F.pfF) / 2, 3.5, 1.0, L, GLASS2);
      for (const zp of [F.pfN, F.pfF]) { stair(x0 + 1.4, x0 + 12, zp, 2.2, yb, ypf); g.box(x0, ypf, zp, 3.2, yb - ypf, 0.3, 0xe4e2dc); }
    }
    return out;
  }

  // ---- 2〜4：線路をまたぐコンコース（自由通路）と、ホームへの階段・エレベーター
  const cw = G >= 4 ? 20 : 16;
  /** 駅の側でコンコースが入る建物の裏の位置 zN と、その建物を描く */
  let zN: number;
  if (G === 2) {
    const d = 10, zc = Math.max(F.want, F.edgeN + 1.5 + d / 2);
    g.box(0, -0.6, zc + d / 2 + 7, 46, 0.75, 15, PAVE, 0xd2cdc2);
    g.box(0, 0, zc, 20, ycb + ych, d, WALL, ROOF); g.box(0, ycb + ych, zc, 20.4, 0.4, d + 0.4, ROOF);   // 駅の側の出入口（階段・エスカレーター・エレベーター）
    gw.box(0, 0.2, zc + d / 2 + 0.05, 10, 3.4, 0.1, GLASS); gw.box(0, ycb + 1.2, zc + d / 2 + 0.05, 18, 2.6, 0.1, GLASS);
    g.box(0, 3.8, zc + d / 2 + 1.3, 12, 0.25, 2.6, ROOF); g.box(0, ycb - 1.0, zc + d / 2 + 0.07, 6, 0.8, 0.08, 0xf6f6f2);
    gw.box(11.5, 0, zc + 1, 3, ycb + ych + 1.2, 3, GLASS2, ROOF);                                       // エレベーターの塔
    if (det >= 1) stair(-10, -22, zc + 2, 3.2, ycb, 0);                                                 // 外の階段（地面からコンコースへ）
    g.box(-14, 2.5, zc + d / 2 + 10, 7, 0.14, 2.4, 0x9fb3bd); bus(-14, zc + d / 2 + 12.6); taxi(10, zc + d / 2 + 8); taxi(15.5, zc + d / 2 + 8);
    zN = zc - d / 2;
  } else if (F.heritage) {
    // 赤れんがの駅舎（glb、奥行き約 15m・幅約 56m）と、両脇の高層ビル。前は広い駅前広場と並木
    const zc = Math.max(F.want, F.edgeN + 1.5 + 8);
    const c = Math.cos(F.rot), s = Math.sin(F.rot);
    out = { bld: { x: F.ox + zc * s, y: F.oy, z: F.oz + zc * c, rot: F.rot } };
    g.box(0, -0.6, zc + 17, 110, 0.75, 20, 0xd6cfbf, 0xdcd5c4);
    for (let k = 0; k < 6; k++) for (const e of [-1, 1]) tree(e * (14 + k * 5.5), zc + 20);
    // v105a：高層ビルは、東京駅の八重洲側のように線路の反対側に下げて置く（駅舎の両脇にそびえていて、駅舎より目立っていた）。
    //   反対側の土地が空いていなければ、駅前の側で駅舎の両端から離し、低く（12〜15 階）する
    const f = stationFloors(4, F.seed), zr = far - 8, tz = zr - 14 - 9, tx = 38;
    const back = !F.shin && (!F.free || [-1, 1].every(e => [[-9, -9], [9, -9], [-9, 9], [9, 9]].every(([u, v]) => F.free!(e * tx + u, tz + v))));
    if (back) {
      const gy = Math.min(F.ground(-tx, tz), F.ground(tx, tz), F.ground(0, zr - 4));
      for (const e of [-1, 1]) { const x = e * tx, nf = Math.round(f.towerB * 0.75) - (e < 0 ? 0 : 2); bldg(x, tz, 18, 18, gy, nf, 4.0, 0xd8dade, 0x7c9cb4, 0x6f7a84); gw.box(x, gy, tz + 9.1, 18, 7, 0.2, GLASS); } // 12〜19 階（約 50〜75m）
      // 2 本のあいだの大屋根（白い膜の屋根）と、その下の歩行者の広場
      g.box(0, gy - 0.6, zr - 8, 2 * tx - 18, 0.75, 17, PAVE, 0xd2cdc2);
      g.box(0, gy + 10, zr - 7.5, 2 * tx - 16, 0.5, 13, 0xeef0f0, 0xf4f5f4); for (let x = -tx + 12; x <= tx - 12; x += 12) g.cyl(x, gy, zr - 12.5, 0.3, 10, 0xb9b6ae, 6);
    } else {
      for (const e of [-1, 1]) { const x = e * 46, nf = 12 + Math.floor(seed01(F.seed, 13) * 4); bldg(x, zc - 1, 16, 14, 0, nf, 4.0, 0xd8dade, 0x7c9cb4, 0x6f7a84); gw.box(x, 0, zc + 6.1, 16, 7, 0.2, GLASS); }
    }
    zN = zc - 7.6;
  } else {
    // 駅ビル（3）・ターミナル（4、現代）：線路の側に裏、前にデッキとバスターミナル
    const f = stationFloors(G, F.seed), d = G >= 4 ? 22 : 18, zc = Math.max(F.want, F.edgeN + 1.5 + d / 2);
    towers(zc, d, f);
    zN = zc - d / 2;
    // ペデストリアンデッキ（2 階の高さ）と、下のバスターミナル
    const yd = 6.0, z0 = zc + d / 2, dl = 14, dw = G >= 4 ? 44 : 30;
    g.box(0, -0.6, z0 + dl / 2, dw + 28, 0.75, dl + 1, PAVE, 0xd2cdc2);
    g.box(0, yd, z0 + dl / 2, 12, 0.6, dl, DECK, 0xd9d3c6); g.box(0, yd, z0 + dl - 3, dw, 0.6, 6, DECK, 0xd9d3c6);    // デッキ（T の形）
    for (const e of [-6, 6]) g.box(e, yd + 0.6, z0 + dl / 2 - 1.5, 0.1, 1.1, dl - 3, GLASS2); g.box(0, yd + 0.6, z0 + dl, dw, 1.1, 0.1, GLASS2);
    for (let z = z0 + 4; z < z0 + dl; z += 7) for (const e of [-5, 5]) g.cyl(e, 0, z, 0.35, yd, 0xb9b6ae, 6);
    for (const e of [-1, 1]) g.cyl(e * (dw / 2 - 2), 0, z0 + dl - 3, 0.4, yd, 0xb9b6ae, 6);
    for (const e of [-1, 1]) stair(e * (dw / 2 - 1), e * (dw / 2 + 4), z0 + dl - 3, 3, yd + 0.6, 0); // デッキから地面へ（バスのりば）
    if (G >= 4) { gw.box(-dw / 2 + 4, yd + 0.6, z0 + dl - 3, 6, 4.2, 5, GLASS2, ROOF); }    // エレベーター
    for (const e of [-1, 1]) { const bx = e * (dw / 2 + 7); g.box(bx, 3.0, z0 + 5, 3, 0.15, 12, 0x9fb3bd); for (const u of [0, 10]) g.box(bx - e * 1.2, 0, z0 + u, 0.12, 3.0, 0.12, RAIL); g.at(F.ox, F.oy, F.oz, F.rot + Math.PI / 2); bus(-(z0 + 5), bx + e * 2.6, e < 0 ? 0x4f9a6a : 0x2f6fb5); at(); } // バスのりば（デッキの両わき）
    taxi(-6, z0 + 4); taxi(6, z0 + 4); if (det >= 1) taxi(0.5, z0 + 7.5);
  }
  // コンコース：駅の側の建物の裏から、反対側の出口（または新幹線の高架）まで。ホームの上には柱
  const zF = F.shin ? -F.shin : far - (G >= 4 ? 8 : 6);
  const zm = (zN + zF) / 2, L = zN - zF + 0.4;
  g.box(0, ycb, zm, cw, ych, L, WALL, ROOF);
  gw.box(0, ycb + 1.2, zm, cw + 0.08, 2.4, L - 1.2, GLASS);                                     // 横の窓の帯
  g.box(0, ycb + ych, zm, cw + 0.6, 0.45, L + 0.4, G >= 4 ? GLASS2 : ROOF);
  if (G >= 4) g.gable(0, ycb + ych + 0.45, zm, cw, L, 2.2, GLASS2, 'z', GLASS2, 0.2);          // ガラスの屋根
  for (const zp of [F.pfN, F.pfF]) if (!isNaN(zp)) for (const e of [-cw / 2 + 1.2, cw / 2 - 1.2]) g.box(e, ypf, zp + 1.1, 0.6, ycb - ypf, 0.6, 0xb9b6ae); // ホームの上の柱
  // ホームへの階段（コンコースの横から）とエレベーター
  for (const zp of [F.pfN, F.pfF]) {
    if (isNaN(zp)) continue;
    stair(cw / 2, cw / 2 + 12, zp - 0.4, 2.4, ycb + 0.1, ypf);
    if (G >= 3 && det >= 1) stair(-cw / 2, -cw / 2 - 12, zp - 0.4, 1.6, ycb + 0.1, ypf);       // エスカレーター（反対の側）
    gw.box(-cw / 2 - 1.6, ypf, zp + 0.9, 2.0, ycb + ych - ypf, 1.6, GLASS2, ROOF);              // エレベーター
    F.lamps.push(F.ox, F.oy + ycb, F.oz);
  }
  // 反対側の出口：階段の塔とエレベーター（新幹線のときは置かない）
  if (!F.shin) {
    const zt = zF + 3, gy = F.ground(0, zt);
    g.box(0, gy, zt, cw * 0.6, ycb + ych - gy, 6, WALL, ROOF); gw.box(0, gy + 0.2, zt - 3.05, 5, 3.0, 0.1, GLASS);
    if (det >= 1) stair(-cw * 0.3, -cw * 0.3 - 13, zt - 1.2, 2.6, ycb, gy);
  }
  return out;

  /** 駅ビル（段 3）・ターミナルの低層部と塔（段 4）。zc は中心、d は奥行き */
  function towers(zc: number, d: number, f = stationFloors(G, F.seed)): void {
    if (G === 3 || (F.elevated && G <= 3)) {
      const w = 44, top = bldg(0, zc, w, d, 0, f.bldg, 4.2, 0xe2dfd8, 0x7fa3bd);
      gw.box(0, 0.3, zc + d / 2 + 0.05, w - 2, 7.6, 0.12, GLASS);                                 // 1・2 階のガラス
      g.box(0, 8.6, zc + d / 2 + 0.12, w, 0.9, 0.12, 0xc3312b);                                   // 商業の帯
      for (const e of [-1, 1]) { g.box(e * (w / 2 - 1.5), 10, zc + d / 2 + 0.6, 1.6, f.bldg * 4.2 - 12, 0.5, e < 0 ? 0xe8b830 : 0x2f6fb5); } // 縦の看板
      g.box(0, top, zc + d / 2 - 1, 16, 2.4, 0.4, 0xf6f6f2); g.box(0, top + 0.6, zc + d / 2 - 0.78, 14, 1.2, 0.05, 0x2f6fb5); // 屋上の看板
      if (det >= 1) { g.box(-12, top, zc - 2, 6, 2.2, 5, 0xb9bcc0); g.box(12, top, zc, 4, 3.0, 4, 0xd0cdc5); }
      return;
    }
    // 段 4（現代）：低層部（4 階）・塔 2 本・前面のガラスのアトリウム
    const w = 64, base = bldg(0, zc, w, d, 0, 4, 4.4, 0xdcdfe2, 0x7fa3bd);
    gw.box(0, 0.3, zc + d / 2 + 0.05, w - 2, 8, 0.12, GLASS);
    const ta = f.towerA * 3.9, tb = f.towerB * 3.9;
    g.box(-16, base, zc - 1, 24, ta - base, 17, 0xb9c6d0, 0x6f7a84);
    gw.surfv = 1;
    for (let y = base + 1.2; y < ta - 1; y += det >= 1 ? 3.9 : 11.7) { gw.box(-16, y, zc + 7.56, 23.4, 1.9, 0.08, 0x6f93ad); gw.box(-16, y, zc - 9.56, 23.4, 1.9, 0.08, 0x6f93ad); gw.box(-4.0 + 0.04, y, zc - 1, 0.08, 1.9, 16.4, 0x6f93ad); gw.box(-28 - 0.04, y, zc - 1, 0.08, 1.9, 16.4, 0x6f93ad); }
    gw.surfv = 0;
    g.box(-16, ta, zc - 1, 20, 3, 13, 0x8f9aa4, 0x6f7a84); g.box(-16, ta + 3, zc - 1, 12, 0.3, 12, 0x5a5e62); // 屋上の機械室とヘリポート
    g.box(19, base, zc - 2, 18, tb - base, 14, 0xe4e0d6, 0x6f7a84);
    gw.surfv = 1;
    for (let y = base + 1.2; y < tb - 1; y += det >= 1 ? 3.9 : 11.7) { gw.box(19, y, zc + 5.04, 17.4, 1.7, 0.08, 0x7f9fb6); gw.box(19, y, zc - 9.04, 17.4, 1.7, 0.08, 0x7f9fb6); gw.box(28.04, y, zc - 2, 0.08, 1.7, 13.4, 0x7f9fb6); }
    gw.surfv = 0;
    g.box(19, tb, zc - 2, 18.4, 0.8, 14.4, 0x2f6fb5);
    // アトリウム：前に張り出したガラスの大空間（高さ 18m、切妻のガラス屋根）
    gw.box(2, 0, zc + d / 2 + 4, 26, 18, 8, GLASS2, GLASS2); gw.gable(2, 18, zc + d / 2 + 4, 26, 8, 3, GLASS2, 'x', GLASS2, 0.1);
    for (let k = -2; k <= 2; k++) g.box(2 + k * 6.2, 0, zc + d / 2 + 8.05, 0.3, 18, 0.2, 0x8b9094);
  }
}
