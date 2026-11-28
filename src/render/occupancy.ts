// v95：施設の利用者の人だかり。施設の利用（b.used）と実効容量（b.effCap）から混み具合を出し、時間帯ごとに敷地の中と周りに人を置く。
// 人の「動き」は扱わない（立っている・その場で少し動く程度）。scene の施設の人（life）に混ぜて描く。
// v98：occupancyOf は、住民一人ひとり（src/sim/people.ts）の通学先・勤務先・用事の行き先から、いまその施設にいる人数を出す（src/render/residents.ts の presentAt）。
// 住民がいない街（読み込み直後など）だけ、今までの used・effCap と市全体の統計から決める。
import type { Geo } from './geo';
import type { PType } from './people';
import type { GameState, Building } from '../sim/index';
import { DEFS, fam, hash } from '../sim/index';
import { presentAt, enrollOf, nameOf } from './residents';
import { people, weekdayLegs } from '../sim/people';
import { outings, OUT_JOG, OUT_TODDLER, OUT_WALK, OUT_STROLL } from '../sim/leisure';
import { dowOf } from './residents';
/** v105b：いま公園にいる住民の姿（外出の種類と年代から）。kids はいっしょに来た子（true は小さい子）。ベビーカーの子は親の姿（parent）に入る */
export function parkPeople(s: GameState, b: Building, hour: number): { t: PType; kid: boolean; kids: boolean[] }[] {
  const p = people(s), out: { t: PType; kid: boolean; kids: boolean[] }[] = [];
  for (const o of outings(s, dowOf(occDay.holiday, occDay.day))) {
    if (o.park !== b.id) continue; const a = o.dep + o.tt; if (hour < a || hour >= a + o.stay) continue;
    const r = p.role[o.p], h = hash(o.p, 7, 31), baby = o.with.some(k => nameOf(s, k).age < 3);
    const t: PType = o.kind === OUT_JOG ? 'jogger' : o.kind === OUT_TODDLER ? (baby ? 'parent' : 'shopper') : r === 0 || r === 1 ? 'student' : r === 2 ? 'teen' : r === 5 ? (h < 0.25 ? 'dog' : 'elderly') : o.kind === OUT_WALK || o.kind === OUT_STROLL ? (h < 0.3 ? 'dog' : 'shopper') : h < 0.3 ? 'parent' : 'shopper';
    out.push({ t, kid: r === 0, kids: o.with.filter(k => nameOf(s, k).age >= 3).map(() => true) });
  }
  return out;
}
/** v105b：いま園の門のまわりにいる送り迎えの人（住民の番号）と、連れている子。朝は預けに着いてから 6 分、夕方は子を連れて出る前の 6 分 */
export function gateNow(s: GameState, b: Building, hour: number): [number, number[]][] {
  const out: [number, number[]][] = [];
  for (const l of weekdayLegs(s).legs) {
    if (l.why === '保育園・幼稚園へ送る' && l.dest === b.id) { const a = l.dep + l.dur; if (hour >= a && hour < a + 0.1) out.push([l.p, l.with]); }
    else if (l.why === '子どもと帰宅' && l.from === b.acc && hour >= l.dep - 0.1 && hour < l.dep) out.push([l.p, l.with]);
  }
  return out;
}
/** v98：描画の日（休日か・何日目か）。scene が人だかりを置き直す前に渡す */
export const occDay = { holiday: false, day: 0 };

/** 施設の混み具合。present：いまその場にいる人の数（実人数の目安）、ratio：利用÷定員（1 を超えると定員超過）、wait：入れずに待つ人（待機児童・外来の待ち） */
export interface Occ { group: OccGroup; present: number; ratio: number; wait: number }
export type OccGroup = 'school' | 'care' | 'health' | 'park' | 'shop' | 'leisure' | 'gov' | 'waste' | 'none';
const groupOf = (b: Building): OccGroup => {
  const f = fam(b.kind), k = b.kind as string;
  if (k === 'station') return 'none'; // 駅は v87〜v88 の乗客（crowdP）が描く
  if (f === 'school' || f === 'jhs' || f === 'high') return 'school';
  if (f === 'care' || f === 'privCare') return 'care';
  if (f === 'health') return 'health';
  if (f === 'park') return 'park';
  if (f === 'waste') return 'waste';
  if (f === 'gov' || f === 'library' || f === 'culture' || f === 'welfare' || k === 'gym' || k === 'pool') return 'gov';
  if (f === 'leisure') return 'leisure';
  if (f === 'shop') return 'shop';
  return 'none';
};
/** 休日らしさ（曜日は持たないので、月ごとに決める。大型連休・夏休み・年末年始の月は行楽地が混む）。0〜1 */
export function holidayK(s: GameState): number { const m = ((s.month % 12) + 12) % 12; return m === 1 || m === 4 || m === 7 || m === 0 ? 1 : hash(s.month, 3, 97) < 0.3 ? 0.6 : 0.2; }
const sumCap = (s: GameState, g: OccGroup) => { let c = 0; for (const o of s.buildings) if (o.status === 'operating' && groupOf(o) === g) c += Math.max(0, o.effCap); return c; };
/** 施設の混み具合（いまの時刻 hour で）。差し替えの口：住民一人ひとりの sim がつながったら、この関数がその人数を返すようにする */
export function occupancyOf(s: GameState, b: Building, hour: number): Occ {
  const group = groupOf(b), cap = Math.max(1, b.effCap || (DEFS[b.kind].capacity ?? 0)), used = Math.max(0, b.used || 0), h = hour;
  const day = h >= 8 && h < 18 ? 1 : h >= 6.5 && h < 21 ? 0.35 : 0.03, hol = holidayK(s);
  if (b.status !== 'operating') return { group: 'none', present: 0, ratio: 0, wait: 0 };
  // v98：住民から（在籍・勤務・用事でいまここにいる人）。行楽地・公園は市外からの来訪を今までの目安の半分だけ足す
  let res: Map<number, number> | null = null; try { if (group !== 'none' && group !== 'waste' && people(s).n > 0) res = presentAt(s, h, occDay.holiday, occDay.day); } catch { res = null; }
  if (res) {
    const here = res.get(b.id) ?? 0;
    switch (group) {
      case 'school': { const en = enrollOf(s, b.id) || used; return { group, present: here, ratio: en / cap, wait: 0 }; }
      case 'care': { const all = sumCap(s, 'care'), wait = all > 0 ? (s.stats.waitlist || 0) * cap / all : 0, open = h >= 7 && h < 19 ? 1 : 0, en = enrollOf(s, b.id) || used;
        return { group, present: here, ratio: (en + wait) / cap, wait: wait * open }; }
      case 'health': { const all = sumCap(s, 'health'), ratio = all > 0 ? (s.stats.pop || 0) / all : 0; return { group, present: here, ratio, wait: here * Math.max(0, ratio - 1) * 0.5 }; }
      case 'park': case 'leisure': { const vis = DEFS[b.kind].visitors ?? 0, out = group === 'leisure' ? (10 + vis / 150) * 0.5 * day * (occDay.holiday ? 1.6 : 0.5) : 0; return { group, present: here + out, ratio: used > 0 ? used / cap : (here + out) / Math.max(20, cap), wait: 0 }; }
      default: return { group, present: here, ratio: used > 0 ? used / cap : 0.6, wait: 0 };
    }
  }
  switch (group) {
    case 'school': { const ratio = used / cap, inSchool = h >= 7.4 && h < 16.5 ? 1 : h >= 16.5 && h < 18 ? 0.25 : 0; return { group, present: used * inSchool, ratio, wait: 0 }; }
    case 'care': { // 待機児童は市全体の数を、保育の定員の割合で各園に振り分ける
      const all = sumCap(s, 'care'), wait = all > 0 ? (s.stats.waitlist || 0) * cap / all : 0, open = h >= 7 && h < 19 ? 1 : 0;
      return { group, present: used * open, ratio: (used + wait) / cap, wait: wait * open }; }
    case 'health': { // 病院・診療所の容量は「利用圏の人口」。市の人口と医療の容量の合計の比を混み具合にする
      const all = sumCap(s, 'health'), ratio = all > 0 ? (s.stats.pop || 0) / all : 0, open = h >= 8.5 && h < 18 ? 1 : 0.15;
      const base = cap / 600 * open; return { group, present: base * Math.min(1.6, ratio), ratio, wait: base * Math.max(0, ratio - 1) * 2 }; }
    case 'park': { const ratio = used / cap; return { group, present: (b.w * b.h * 8 + used * 0.01) * day * (0.7 + 0.6 * hol), ratio, wait: 0 }; }
    case 'leisure': case 'shop': { const vis = DEFS[b.kind].visitors ?? 0, base = group === 'shop' ? (b.kind === 'supermarket' ? 30 : 8) + vis / 400 : 10 + vis / 150;
      const k = group === 'leisure' ? 0.5 + 1.1 * hol : 1 + 0.3 * hol; return { group, present: base * day * k, ratio: used > 0 ? used / cap : k * day * 0.6, wait: 0 }; }
    case 'gov': { const open = h >= 8.5 && h < 17.5 ? 1 : (b.kind === 'gym' || b.kind === 'pool') && h >= 17.5 && h < 21 ? 0.6 : 0; return { group, present: (12 + b.w * b.h * 6) * open, ratio: used > 0 ? used / cap : 0.6, wait: 0 }; }
    case 'waste': { const ratio = (s.stats.wasteCap || 0) > 0 ? (s.stats.wasteDemand || 0) / s.stats.wasteCap : 0.5, open = h >= 8.5 && h < 15 ? 1 : 0; return { group, present: 0, ratio, wait: open * Math.max(1, ratio * 3) }; }
    default: return { group, present: 0, ratio: 0, wait: 0 };
  }
}
/** 人だかりの時間の区切り（scene はこれが変わると置き直す） */
export function occupancyPhase(h: number): string { return h < 7.4 ? 'n' : h < 8.5 ? 'a' : h < 10.25 ? 'c' : h < 10.6 ? 'b' : h < 12.7 ? 'c2' : h < 13.4 ? 'b2' : h < 15 ? 'c3' : h < 16.5 ? 'l' : h < 19 ? 'e' : 'n2'; }

/** 置く人。x, z は世界座標、r はその場で動く半径、sp は動く速さ（0 は立ち止まる）、kid は子ども（小さく） */
export interface CrowdSpot { x: number; z: number; r: number; sp: number; t: PType; kid?: boolean }
export interface CrowdPlan { spots: CrowdSpot[]; props: ((g: Geo, hA: (x: number, z: number) => number) => void) | null; occ: Occ }
/** 施設の人だかり：混み具合と時刻から、人の位置と小物（仮設教室・人影・救急車・ごみ収集車の列）を決める。扱わない施設は null。
 *  P は scene.place の答え（敷地の中心と向き。模型の手前 +z が道路の側）。qk：品質の倍率（low 0.35・mid 0.7・high 1） */
export function crowdPlan(s: GameState, b: Building, hour: number, P: { x: number; y: number; z: number; rot: number }, qk: number): CrowdPlan | null {
  const occ = occupancyOf(s, b, hour); if (occ.group === 'none') return null;
  const c = Math.cos(P.rot), sn = Math.sin(P.rot), W2 = (lx: number, lz: number): [number, number] => [P.x + lx * c + lz * sn, P.z - lx * sn + lz * c];
  const hx = b.w * 15, hz = b.h * 15, spots: CrowdSpot[] = [], ph = occupancyPhase(hour);
  let seed = b.id * 7919 + 13; const rnd = () => { seed = (seed * 16807 + 11) % 2147483647; return (seed % 100000) / 100000; };
  const put = (lx: number, lz: number, t: PType, r = 0.3, sp = 0.15, kid = false) => { const [x, z] = W2(lx, lz); spots.push({ x, z, r, sp, t, kid }); };
  const scatter = (n: number, x0: number, x1: number, z0: number, z1: number, t: () => PType, r: number, sp: number, kid = false) => { for (let k = 0; k < n; k++) put(x0 + (x1 - x0) * rnd(), z0 + (z1 - z0) * rnd(), t(), r, sp, kid); };
  /** 道沿いの列：敷地の手前（+z の外の歩道）に、門の位置 gx から横へ並ぶ */
  const queue = (n: number, gx: number, t: () => PType, step = 0.75, kid = false) => { for (let k = 0; k < n; k++) { const row = Math.floor(k / 40); put(gx + (k % 40) * step * (k % 2 ? 1 : -1) * 0.5 + (k % 2 ? 0.4 : 0), hz + 2.2 + row * 0.8, t(), 0.05, 0.05, kid); } };
  const N = (x: number) => Math.max(0, Math.round(x * qk));
  const props: ((g: Geo, hA: (x: number, z: number) => number) => void)[] = [];
  const kidT = (): PType => (rnd() < 0.5 ? 'student' : 'teen');
  /** 車（救急車・ごみ収集車）を、敷地の手前の道の脇に列で置く */
  const vehicles = (n: number, kind: 'amb' | 'pack', gx: number) => props.push((g, hA) => { for (let k = 0; k < n; k++) { const lx = gx - k * 7.2, [x, z] = W2(lx, hz - 3.2), y = hA(x, z);
    g.at(x, y, z, P.rot + Math.PI / 2);
    if (kind === 'amb') { g.box(0, 0.35, 0, 5.6, 1.9, 2.0, 0xf6f6f2); g.box(1.9, 2.25, 0, 0.5, 0.25, 1.2, 0xd8342a); g.box(0, 1.2, 0, 5.62, 0.25, 2.02, 0xd8342a); g.box(2.4, 1.1, 0, 0.9, 0.8, 2.04, 0x2a3440); }
    else { g.box(-0.8, 0.35, 0, 4.2, 2.1, 2.1, 0x3d8a5a); g.box(2.0, 0.35, 0, 1.6, 1.9, 2.0, 0xf2f2ee); g.box(2.5, 1.3, 0, 0.7, 0.7, 2.04, 0x2a3440); }
    for (const wx of [-1.8, 1.8]) for (const wz of [-1, 1]) g.cyl(wx, 0, wz, 0.42, 0.4, 0x222222, 8);
    g.at(0, 0, 0); } });
  if (occ.group === 'school') {
    // 校庭（小学校の模型：x -38〜14, z 0〜22。中学・高校は狭い）・門（手前の中央）・教室の窓（z -15.75、3 階）
    const jhs = fam(b.kind) === 'jhs', fx0 = jhs ? -18 : -38, fx1 = 14, big = b.w >= 3, over = Math.max(0, occ.ratio - 1);
    const per = 1, stu = occ.present / per, excess = occ.ratio > 1 ? occ.present * (1 - 1 / occ.ratio) : 0; // v102：1 人を 1 人で（精細か簡略かは scene が距離で決める）。excess：定員を超えた人数
    if (!big) { // 小さな敷地の学校（模型の形がわからない）：手前の広場と門
      if (ph === 'b' || ph === 'b2' || ph === 'l') scatter(N(stu * 0.6), -hx * 0.6, hx * 0.6, 0, hz * 0.6, kidT, 1.5, 0.35);
      if (over > 0 && ph !== 'n' && ph !== 'n2') queue(N(10 * over + 3), 0, kidT);
    } else {
      if (ph === 'a') { scatter(N(stu * 0.35), fx0 + 10, fx1, 2, 24, kidT, 1.2, 0.5); queue(N(stu * 0.25 + 8 * over), -10, kidT, 0.7); }                                  // 登校：校門に集まり、校庭を昇降口へ
      else if (ph === 'b' || ph === 'b2') scatter(N(stu * (0.7 + 0.3 * Math.min(1, over * 2))), fx0 + 1, fx1 - 1, 1, 21 + Math.min(5, over * 10), kidT, 2.2, 0.6); // 休み時間：校庭いっぱい
      else if (ph === 'c' || ph === 'c2' || ph === 'c3') scatter(N(Math.min(35, stu * 0.06 + 6)), fx0 + 8, fx0 + 30, 6, 18, kidT, 3, 0.5);                       // 授業中：体育の 1 クラスだけ
      else if (ph === 'l') { scatter(N(stu * 0.25), fx0 + 4, fx1, 2, 22, kidT, 1.5, 0.4); queue(N(stu * 0.15), -10, kidT, 0.8); }                                         // 下校
      // 定員超過：門の外まで子どもと見守りの大人があふれる
      if (over > 0 && ph !== 'n' && ph !== 'n2' && ph !== 'e') { queue(N(Math.min(400, excess * 0.35) + 4), 14, kidT, 0.6); queue(N(3 + excess * 0.03), -30, () => 'parent', 1.6); } // v102：あふれは超えた人数に比例
      // 教室の窓の人影（授業中・休み時間）：定員に対する人数で、窓 1 枚に 1〜3 人
      if (occ.present > 0 && ph !== 'l' && ph !== 'e') { const fill = Math.min(1.6, occ.ratio), bx = -10, w = 58, fz = -21 + 10.5 / 2;
        props.push((g) => { for (let f = 0; f < 3; f++) for (let k = 0; k < 18; k++) {
          const lx = k < 9 ? bx - w / 2 + 1 + (k + 0.5) * (w / 2 - 5) / 9 : bx + 4 + (k - 8.5) * (w / 2 - 5) / 9, nIn = Math.floor(Math.min(4, (occ.present * 0.9) / (54 * 3.5)) + hash(b.id + f * 31, k, 7)); void fill; // 窓 1 枚の人数（v102：在籍＝いま教室にいる人数に比例。1 枚に 0〜4 人）
          for (let p = 0; p < Math.min(4, nIn); p++) { const ox = (p - (Math.min(4, nIn) - 1) / 2) * 0.5;
            g.at(P.x, P.y, P.z, P.rot); g.box(lx + ox, f * 3.6 + 1.25, fz + 0.12, 0.42, 0.55, 0.04, 0x39414c); g.box(lx + ox, f * 3.6 + 1.82, fz + 0.12, 0.24, 0.26, 0.04, 0x39414c); } }
          g.at(0, 0, 0); });
      }
      // 仮設教室（プレハブ）：定員超過の分だけ、校庭の端に（2 階建ても）
      if (over > 0.04) { const nP = Math.min(3, Math.ceil(over * 6)), two = over > 0.35;
        props.push((g) => { g.at(P.x, P.y, P.z, P.rot);
          for (let k = 0; k < nP; k++) { const px = fx0 + 6 + k * 11, pz = 25;
            for (let fl = 0; fl < (two ? 2 : 1); fl++) { g.box(px, fl * 3, pz, 9.6, 2.9, 4.6, 0xdfe3e6, 0xb8c0c6); for (let wv = 0; wv < 4; wv++) g.box(px - 3.3 + wv * 2.2, fl * 3 + 1.1, pz - 2.32, 1.4, 1.0, 0.06, 0x5f7a92); }
            if (two) { g.box(px + 5.4, 0, pz, 1.1, 0.12, 4.2, 0x8a9096); for (let st = 0; st < 8; st++) g.box(px + 5.4, st * 0.37, pz + 1.6 - st * 0.45, 1.0, 0.1, 0.4, 0x8a9096); } }
          g.at(0, 0, 0); }); }
    }
  } else if (occ.group === 'care') {
    // 保育園（1 区画の模型：園庭 x -12〜4, z 3〜11、門 x 8.5）
    const kids = occ.present; // v102：1 人を 1 人で
    if ((hour >= 9.5 && hour < 11.5) || (hour >= 15 && hour < 16.5)) scatter(N(kids * 0.7), -12, 3, 3.5, 11.5, () => 'student', 1.2, 0.5, true);
    else if (hour >= 7 && hour < 19) scatter(N(kids * 0.15), -10, 2, 4, 10, () => 'student', 0.6, 0.3, true);
    // v105b：送り迎えの親子（住民の区間から。朝は園に着いてから 6 分、夕方は子と園を出る前の 6 分、門のまわりにいる）。前は人数を在籍の 3 割の決め打ちで置いていた
    if (!occDay.holiday) for (const [, ks] of gateNow(s, b, hour)) { const gx = 6 + rnd() * 6, gz = 10 + rnd() * 5, baby = ks.some(k => nameOf(s, k).age < 3);
      put(gx, gz, baby ? 'parent' : rnd() < 0.5 ? 'shopper' : 'worker', 0.5, 0.2); ks.forEach((k, j) => { if (nameOf(s, k).age >= 3) put(gx + 0.5 + j * 0.4, gz + 0.2, 'student', 0.3, 0.2, true); }); }
    // 待機児童：門の前に親子の列
    const wl = N(Math.min(40, occ.wait / 2)); for (let k = 0; k < wl; k++) { put(8.5 - k * 0.9, hz + 2.4, 'parent', 0.05, 0.04); if (k % 2 === 0) put(8.5 - k * 0.9 + 0.3, hz + 2.9, 'student', 0.05, 0.04, true); }
  } else if (occ.group === 'health') {
    // 病院・診療所：入口のまわりと待合の窓。超過なら入口の外に列、病院は救急車が並ぶ
    const n = N(Math.min(300, occ.present * 0.3)); scatter(n, -hx * 0.3, hx * 0.3, hz - 6, hz - 2, () => (rnd() < 0.5 ? 'elderly' : rnd() < 0.5 ? 'parent' : 'worker'), 0.4, 0.12);
    const wq = N(Math.min(48, occ.wait / 1.5)); queue(wq, -2, () => (rnd() < 0.55 ? 'elderly' : rnd() < 0.2 ? 'wheel' : 'worker'), 0.8);
    const hosp = b.w >= 2 || b.kind === 'hospital'; if (hosp) vehicles(Math.min(4, 1 + Math.floor(Math.max(0, occ.ratio - 0.9) * 6)), 'amb', hx - 6);
  } else if (occ.group === 'park') {
    // v105b：公園にいる住民の外出（sim の outings）の種類どおりの姿で：朝は散歩・体操の高齢者（犬の散歩も）、昼前は親子、放課後は小学生、夜はジョギング、休日は家族
    const who = parkPeople(s, b, hour);
    if (who.length) { const n = Math.min(2000, who.length), step = who.length / Math.max(1, N(n)); for (let k = 0; k < who.length; k += step) { const w = who[Math.floor(k)], x = -hx * 0.8 + hx * 1.6 * rnd(), z = -hz * 0.8 + hz * 1.6 * rnd();
      put(x, z, w.t, w.t === 'jogger' ? 6 : 2.5, w.t === 'jogger' ? 0.25 : 0.35, w.kid); for (const kk of w.kids) put(x + 0.6, z + 0.3, 'student', 2.5, 0.35, kk); } }
    else scatter(N(Math.min(2000, occ.present)), -hx * 0.8, hx * 0.8, -hz * 0.8, hz * 0.8, () => { const r = rnd(); return r < 0.25 ? 'parent' : r < 0.45 ? 'elderly' : r < 0.6 ? 'dog' : r < 0.75 ? 'jogger' : r < 0.9 ? 'student' : 'teen'; }, 2.5, 0.35);
  } else if (occ.group === 'shop' || occ.group === 'leisure') {
    const n = N(occ.group === 'leisure' ? Math.min(1500, occ.present * 0.7) : Math.min(300, occ.present * 0.3)); // v102：外に見える人（行楽地は 7 割、店は 3 割）
    scatter(Math.round(n * 0.6), -hx * 0.7, hx * 0.7, hz - 8, hz - 1, () => (occ.group === 'leisure' ? (rnd() < 0.4 ? 'tourist' : rnd() < 0.5 ? 'parent' : 'teen') : rnd() < 0.6 ? 'shopper' : 'elderly'), 1.2, 0.3);
    scatter(n - Math.round(n * 0.6), -hx * 0.9, hx * 0.9, hz + 1.5, hz + 3.5, () => (occ.group === 'leisure' ? 'tourist' : 'shopper'), 1.5, 0.35); // 前の歩道
    if (occ.group === 'leisure' && occ.present > 60 && (occDay.holiday || holidayK(s) >= 0.6)) queue(N(Math.min(30, occ.present / 8)), -hx * 0.3, () => (rnd() < 0.5 ? 'tourist' : 'parent'), 0.8); // 休日の入場待ち
  } else if (occ.group === 'gov') {
    scatter(N(Math.min(200, occ.present * 0.3)), -hx * 0.4, hx * 0.4, hz - 6, hz - 1, () => (rnd() < 0.4 ? 'elderly' : rnd() < 0.5 ? 'parent' : 'worker'), 0.8, 0.2);
  } else if (occ.group === 'waste') {
    if (occ.wait > 0) vehicles(Math.min(6, Math.round(occ.wait)), 'pack', hx - 4); // 搬入を待つごみ収集車の列
  }
  return { spots, props: props.length ? (g, hA) => { for (const f of props) f(g, hA); } : null, occ };
}
