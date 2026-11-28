// v98：画面の車・歩行者・自転車・バスを、実在の住民（src/sim/people.ts）の移動から出す。sim は読むだけ（計算も保存も変えない）。
// - 平日の通勤・通学（とその帰り）は sim の口 sampleTrips の経路を使い、足りない分を住民の一覧（people）から同じ決まりで補う。
// - 昼の買い物・通院（家の大人・高齢者）と、休日の行楽地・公園・買い物は、住民の休日の過ごし方（hol・holDest・holMode）と通院の有無から、
//   描画の側で時刻を決める（住民ごとのハッシュ。同じ日・同じ時刻なら同じ答え）。
// - 見えている範囲で移動中の住民を、手段ごとに数える（台数・人数はこの数に比例させ、性能の上限で切る）。
import type { GameState, Building } from '../sim/index';
import { W, H, DEFS, fam } from '../sim/index';
import { HH_NAMES } from '../sim/types';
import { hourRate } from './incidents';
import { people, peopleStats, sampleTrips, incidentRate, weekdayLegs, ROLE_NAMES, MODE_NAMES, ESC_NAMES } from '../sim/people';
import { outings, parkPresent, OUT_NAMES } from '../sim/leisure';
import type { PType } from './people';

/** 手段（sim と同じ番号）：0 徒歩・1 自転車・2 バス・3 電車・4 車。255 は移動なし */
export const RM_WALK = 0, RM_BIKE = 1, RM_BUS = 2, RM_RAIL = 3, RM_CAR = 4;
const SPD = [4.5, 12, 15, 35, 25], KM = 0.03 * 1.25;
export interface RTrip {
  person: number; role: number;
  /** 画面での手段（電車の人は駅までの手段） */
  mode: number;
  /** 本来の手段（電車 3 を含む） */
  via: number;
  /** 出発・到着の道路の区画 */
  from: number; to: number;
  /** 行き先の建物（-2 市外）・道のりの進み具合（0〜1） */
  dest: number; prog: number;
  /** 用事（通勤・通学・帰宅・買い物・通院・行楽地・公園） */
  why: string;
  /** sampleTrips の経路（あれば。途中から出すときの位置に使う） */
  path?: number[];
  /** v105b：いっしょに移動する住民（送り迎えの子・集団登校の班の子・親子で公園の子）と、そのうち歩いて見える人の数 */
  with?: number[]; nw?: number;
}
export interface Plan {
  trips: RTrip[];
  /** 見えている範囲で移動中の住民の数（画面の手段ごと 0〜4。電車の人は駅までの手段に入る） */
  visible: number[];
  /** 市全体で移動中の住民 */
  total: number;
  holiday: boolean;
}

function h32(a: number, b: number, c: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (c + 0x165667b1), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

type Fac = { b: Building; x: number; y: number };
const facCache = new WeakMap<GameState, { key: string; shops: Fac[]; health: Fac[]; byId: Map<number, Building> }>();
function facs(s: GameState) {
  const key = `${s.month}:${s.bVersion}:${s.buildings.length}`, c = facCache.get(s); if (c && c.key === key) return c;
  const shops: Fac[] = [], health: Fac[] = [], byId = new Map<number, Building>();
  for (const b of s.buildings) {
    byId.set(b.id, b); if (b.status !== 'operating' || b.acc < 0) continue;
    const f = fam(b.kind), d = DEFS[b.kind], o = { b, x: b.x + d.w / 2, y: b.y + d.h / 2 };
    if (f === 'shop') shops.push(o); else if (f === 'health' || b.kind === 'hospital' || b.kind === 'univHospital') health.push(o);
  }
  const v = { key, shops, health, byId }; facCache.set(s, v); return v;
}
function nearest(l: Fac[], x: number, y: number): Building | null { let best: Building | null = null, bd = 1e9; for (const f of l) { const d = Math.abs(f.x - x) + Math.abs(f.y - y); if (d < bd) { bd = d; best = f.b; } } return best; }
const ctr = (b: Building) => { const d = DEFS[b.kind]; return [b.x + d.w / 2, b.y + d.h / 2]; };

/** 休日か：描画の日（4 分で 1 日）を 7 日でめぐり、5・6 日目を土日とする */
export const isHoliday = (dayNo: number) => ((dayNo % 7) + 7) % 7 >= 5;
/** v105b：描画の日と休日の別から曜日（0〜4 月〜金、5 土、6 日）。休日を固定したとき（view.holiday）も土日・平日の中に収める */
export function dowOf(holiday: boolean, day: number): number { const d = ((Math.floor(day) % 7) + 7) % 7; return holiday ? (d >= 5 ? d : 5 + (d % 2)) : d < 5 ? d : d - 5; }
/** v105b：未就学児がベビーカーに乗っているか（3 歳未満）。歩くのは 3 歳から */
export function inStroller(s: GameState, i: number): boolean { return people(s).role[i] === 0 && h32(i, s.seed, 4) * 6 < 3; } // nameOf の年齢（0〜5 歳）と同じ決まり
/** v105b：いっしょに歩いて見える人の数（ベビーカーの子・自転車や車に乗せた子は数えない） */
function walkWith(p: { role: Uint8Array }, s: GameState, m: number, w: number[] | undefined): number { if (m !== RM_WALK || !w || !w.length) return 0; let n = 0; for (const k of w) if (!(p.role[k] === 0 && h32(k, s.seed, 4) * 6 < 3)) n++; return n; }

/**
 * 時刻 hour に移動中の住民のうち、注視点（区画 cx, cy）から半径 R 区画に見える人を集める。
 * trips は最大 cap 件（sampleTrips の経路つきを先に、残りを住民の一覧から）。visible は見える人の総数（cap で切らない。いっしょに歩く子も 1 人に数える）
 * v105b：平日は sim の区間（weekdayLegs）から。未就学児は送り迎えの人と、小学生の朝は集団登校の班で、バスの人はバス停まで歩く区間とバスの区間に分かれる。
 * 公園への外出（散歩・親子・放課後・ジョギング・休日の家族）は sim の outings（曜日ごと）から
 */
export function residentPlan(s: GameState, hour: number, holiday: boolean, cx: number, cy: number, R: number, cap = 900, day = 0): Plan {
  const p = people(s), F = facs(s), byId = F.byId, vis = [0, 0, 0, 0, 0], trips: RTrip[] = [], cand: RTrip[] = [];
  const out: Plan = { trips, visible: vis, total: 0, holiday };
  if (!p.n) return out;
  const near = (x: number, y: number) => Math.abs(x - cx) < R && Math.abs(y - cy) < R;
  const seen = new Set<number>();
  // 1) 平日の通勤・通学・送り迎え：sampleTrips（経路つき）から、いまの位置が見える範囲にある人
  if (!holiday) {
    for (const k of [0, 0.013, 0.027]) {
      if (trips.length >= cap) break;
      for (const t of sampleTrips(s, hour + k, 500)) {
        if (seen.has(t.person) || trips.length >= cap) continue;
        const prog = Math.max(0, Math.min(0.999, (hour - t.depart) / t.dur));
        if (prog <= 0 && hour < t.depart) continue;
        const at = t.path.length ? t.path[Math.min(t.path.length - 1, Math.floor(prog * t.path.length))] : t.from;
        if (!near(at % W, (at / W) | 0)) continue;
        seen.add(t.person);
        trips.push({ person: t.person, role: t.role, mode: t.mode, via: t.via, from: t.from, to: t.to, dest: t.dest, prog, why: t.why, path: t.path, with: t.with, nw: walkWith(p, s, t.mode, t.with) });
      }
    }
    // 2) 区間の一覧を 1 回なめて、見える範囲の移動中の人を数える（位置は区間の始めと終わりの間をまっすぐ結んだ所で見る）
    for (const l of weekdayLegs(s).legs) if (hour >= l.dep && hour < l.dep + l.dur) push(l.p, l.from, l.to, (hour - l.dep) / l.dur, l.mode, l.via, l.dest, l.why, l.with);
    // 昼の買い物・通院（家の大人・高齢者で、通勤・通学のない人）
    for (let i = 0; i < p.n; i++) {
      if (p.mode[i] !== 255 || (p.role[i] !== 4 && p.role[i] !== 5) || hour < 9 || hour >= 17.5) continue;
      const hb = byId.get(p.home[i]); if (!hb || hb.acc < 0) continue;
      const u = h32(i, day, 11), cl = p.clinic[i] && h32(i, day, 12) < 0.25;
      if (!cl && u >= 0.3) continue;
      const [hx, hy] = ctr(hb), destB = cl ? nearest(F.health, hx, hy) : p.hol[i] === 1 && p.holDest[i] >= 0 ? byId.get(p.holDest[i]) : nearest(F.shops, hx, hy); // v105b：公園は外出（outings）の側で
      if (!destB || destB.acc < 0) continue;
      const mm = p.holMode[i] === 255 ? RM_WALK : p.holMode[i], d = Math.max(0.2, (Math.abs(ctr(destB)[0] - hx) + Math.abs(ctr(destB)[1] - hy)) * KM), tt = Math.max(0.1, d / SPD[mm]);
      const d0 = (cl ? 9 : 9.5) + h32(i, day, 13) * (cl ? 2.5 : 5), stay = cl ? 1.2 : 0.8, d1 = d0 + tt + stay;
      const going = hour >= d0 && hour < d0 + tt, coming = hour >= d1 && hour < d1 + tt, m = mm === RM_RAIL ? RM_WALK : mm;
      if (going) push(i, hb.acc, destB.acc, (hour - d0) / tt, m, mm, destB.id, cl ? '通院' : '買い物');
      else if (coming) push(i, destB.acc, hb.acc, (hour - d1) / tt, m, mm, -1, '帰宅');
    }
  } else {
    // 休日：行楽地・買い物・通院（家で過ごす人は出ない。公園は外出（outings）の側で）
    for (let i = 0; i < p.n; i++) {
      const hol = p.hol[i], dId = p.holDest[i]; if (hol === 0 || hol === 3 || dId < 0) continue;
      const hb = byId.get(p.home[i]), destB = byId.get(dId); if (!hb || hb.acc < 0 || !destB || destB.acc < 0) continue;
      const mm = p.holMode[i] === 255 ? RM_WALK : p.holMode[i], [hx, hy] = ctr(hb), d = Math.max(0.2, (Math.abs(ctr(destB)[0] - hx) + Math.abs(ctr(destB)[1] - hy)) * KM), tt = Math.max(0.1, d / SPD[mm]);
      const d0 = (hol === 2 ? 8.5 : 9.5) + h32(i, day, 21) * (hol === 2 ? 3 : 6), stay = hol === 2 ? 3 + h32(i, day, 22) * 4 : 1, d1 = d0 + tt + stay;
      const going = hour >= d0 && hour < d0 + tt, coming = hour >= d1 && hour < d1 + tt, m = mm === RM_RAIL ? RM_WALK : mm;
      if (going) push(i, hb.acc, destB.acc, (hour - d0) / tt, m, mm, dId, ['', '買い物', '行楽地', '公園', '通院'][hol]);
      else if (coming) push(i, destB.acc, hb.acc, (hour - d1) / tt, m, mm, -1, '帰宅');
    }
  }
  // 公園への外出（平日も休日も。曜日ごと）
  for (const o of outings(s, dowOf(holiday, day))) {
    const a = o.dep + o.tt, b = a + o.stay;
    if (hour >= o.dep && hour < a) push(o.p, o.from, o.to, (hour - o.dep) / o.tt, o.mode, o.mode, o.park, OUT_NAMES[o.kind], o.with);
    else if (hour >= b && hour < b + o.tt) push(o.p, o.to, o.from, (hour - b) / o.tt, o.mode, o.mode, -1, '帰宅', o.with);
  }
  /** a から b へ移動中の住民（prog は進み具合 0〜1）。with はいっしょに移動する住民 */
  function push(i: number, a: number, b: number, prog: number, m: number, via: number, destId: number, why: string, w?: number[]): void {
    const nw = walkWith(p, s, m, w); out.total += 1 + (w ? w.length : 0);
    const q = Math.max(0, Math.min(1, prog)), x = a % W + 0.5 + (b % W - a % W) * q, y = ((a / W) | 0) + 0.5 + (((b / W) | 0) - ((a / W) | 0)) * q;
    if (!near(x, y)) return;
    vis[m] = (vis[m] ?? 0) + 1 + nw;
    if (!seen.has(i) && cand.length < cap * 3) cand.push({ person: i, role: p.role[i], mode: m, via, from: a, to: b, dest: destId, prog: q, why, with: w && w.length ? w : undefined, nw });
  }
  // 3) 足りない分を一覧の候補から（決まった順に間引いて、手段の割合を保つ）
  if (trips.length < cap && cand.length) {
    const need = cap - trips.length, step = Math.max(1, cand.length / need);
    for (let k = 0; k < cand.length && trips.length < cap; k = Math.floor(k + step)) { const c = cand[Math.floor(k)]; if (!seen.has(c.person)) { seen.add(c.person); trips.push(c); } if (step === 1 && k + 1 >= cand.length) break; }
  }
  return out;
}
/** v105b：いっしょに歩く住民（送り迎えの子・集団登校の班の子）の移動。先を歩く人の移動 t から作る（画面では先の人について歩く）。ベビーカーの子は入れない */
export function companionTrips(s: GameState, t: RTrip): RTrip[] {
  if (t.mode !== RM_WALK || !t.with || !t.with.length) return [];
  const p = people(s), lead = nameOf(s, t.person).name, out: RTrip[] = [];
  for (const k of t.with) { if (inStroller(s, k)) continue; out.push({ person: k, role: p.role[k], mode: RM_WALK, via: t.via, from: t.from, to: t.to, dest: t.dest, prog: t.prog, why: p.role[k] === 0 ? `${t.why === '子どもと帰宅' ? '帰宅' : t.why === '親子で公園' ? '公園へ' : t.why === '帰宅' ? '帰宅' : '保育園・幼稚園へ'}（${lead}さんと）` : t.why === '集団登校' ? `集団登校（班長は${lead}さん）` : `${t.why}（${lead}さんと）` }); }
  return out;
}
/** v105b：住民の見た目の種類（役割と用事から）と、子どもの大きさにするか。ベビーカーの子を連れた親はベビーカー */
export function lookOf(s: GameState, t: RTrip, holiday: boolean, r: () => number): { ty: PType; kid: boolean } {
  const kidStroller = t.mode === RM_WALK && !!t.with?.some(k => inStroller(s, k));
  if (t.role === 0) return { ty: 'student', kid: true };
  if (kidStroller) return { ty: 'parent', kid: false };
  if (t.why === 'ジョギング') return { ty: 'jogger', kid: false };
  if (t.role === 1) return { ty: 'student', kid: false };
  if (t.role === 2) return { ty: 'teen', kid: false };
  if (t.role === 3) return { ty: holiday ? (t.why === '行楽地' ? 'tourist' : 'shopper') : t.with?.length ? (r() < 0.5 ? 'worker' : 'shopper') : 'worker', kid: false };
  if (t.role === 5) return { ty: r() < 0.04 && !t.with?.length ? 'wheel' : 'elderly', kid: false };
  return { ty: t.why === '行楽地' ? 'tourist' : 'shopper', kid: false };
}
// ---------------------------------------------------------------- 紹介（架空の名前）
const SEI = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '小川', '岡田', '後藤', '長谷川', '村上', '近藤', '石井', '坂本', '遠藤', '青木', '藤井', '西村', '福田'];
const MEI_M = ['健一', '大輔', '翔太', '拓也', '直樹', '誠', '浩二', '和也', '亮', '悠斗', '蓮', '湊', '陽翔', '颯太', '樹', '隆', '博', '勇', '大翔', '悠真'];
const MEI_F = ['美咲', '陽子', '恵', '由美', '彩', '真由美', '久美子', '愛', '結衣', '陽菜', '凛', '葵', '芽依', '紬', 'さくら', '和子', '幸子', '洋子', '結菜', '莉子'];
const AGE = [[0, 6], [6, 6], [12, 3], [22, 43], [30, 35], [65, 25]]; // v105b：未就学児は 0〜5 歳（前は 3〜5 歳）
/** 住民 i の名前と年齢（同じ世帯の建物の人は同じ名字になりやすい。住民ごとのハッシュで決まる） */
export function nameOf(s: GameState, i: number): { name: string; age: number; female: boolean } {
  const p = people(s), u = h32(i, s.seed, 1), female = u < 0.5, r = p.role[i] ?? 3, hb = p.home[i] ?? 0;
  const sei = SEI[Math.floor(h32(hb, Math.floor(i / 3), 2) * SEI.length) % SEI.length], mei = (female ? MEI_F : MEI_M)[Math.floor(h32(i, s.seed, 3) * 20) % 20];
  const [a0, da] = AGE[r] ?? [30, 30];
  return { name: `${sei} ${mei}`, age: Math.floor(a0 + h32(i, s.seed, 4) * da), female };
}
/** 住民の簡単な紹介（住まい・世帯の種類・行き先・手段）。place は区画から地区の名前 */
export function profileOf(s: GameState, t: Pick<RTrip, 'person' | 'mode' | 'via' | 'dest' | 'why'>, place: (tile: number) => string): string {
  const p = people(s), i = t.person; if (i < 0 || i >= p.n) return '';
  const F = facs(s), hb = F.byId.get(p.home[i]), n = nameOf(s, i), db = t.dest >= 0 ? F.byId.get(t.dest) : undefined;
  const home = hb ? `${place(hb.acc)}の${DEFS[hb.kind].name}` : '市内';
  const dest = t.dest === -2 ? '市外' : db ? `${DEFS[db.kind].name}（${place(db.acc)}）` : '—';
  const via = t.via === RM_RAIL ? `電車（駅まで${MODE_NAMES[t.mode]}）` : MODE_NAMES[t.via] ?? MODE_NAMES[t.mode] ?? '徒歩';
  // v105b：いっしょに移動する人（送り迎えの子・班の子）と、未就学児の送り迎えをする人
  const w = (t as RTrip).with, kids = w && w.length ? `｜いっしょに：${w.length > 3 ? `班の子 ${w.length} 人` : w.map(k => { const q = nameOf(s, k); return `${q.name.split(' ')[1]}（${q.age}歳${p.role[k] === 0 && q.age < 3 && t.mode === RM_WALK ? '・ベビーカー' : t.mode === RM_BIKE && p.role[k] === 0 ? '・子乗せ自転車' : ''}）`; }).join('・')}` : '';
  const esc = p.role[i] === 0 && p.dest[i] >= 0 ? `｜送り：${p.escAm[i] >= 0 ? `${nameOf(s, p.escAm[i]).name}さん（${ESC_NAMES[p.escKAm[i]]}）` : ESC_NAMES[p.escKAm[i]]}・迎え：${p.escPm[i] >= 0 ? `${nameOf(s, p.escPm[i]).name}さん（${ESC_NAMES[p.escKPm[i]]}）` : ESC_NAMES[p.escKPm[i]]}` : '';
  return `${n.name}さん（${n.age}歳・${ROLE_NAMES[p.role[i]]}）｜住まい：${home}・${HH_NAMES[p.hhType[i]] ?? ''}世帯｜いま：${t.why}${t.why === '帰宅' || t.dest < 0 && t.dest !== -2 ? '' : `→${dest}`}｜手段：${via}${kids}${esc}`;
}

/** 短い紹介（事故の知らせ用）：名前・年齢・住まいの地区 */
export function shortWho(s: GameState, i: number, place: (tile: number) => string): string {
  const p = people(s); if (i < 0 || i >= p.n) return '';
  const n = nameOf(s, i), hb = facs(s).byId.get(p.home[i]);
  return `${n.name}さん・${n.age}歳・${hb ? place(hb.acc) : '市内'}在住`;
}

// ---------------------------------------------------------------- 事故の起きやすさ（描画の事故の頻度）
const refCache = new WeakMap<GameState, { key: string; ref: Record<string, number> }>();
/**
 * 描画の事故の起きやすさの倍率（1 が街の道路の平均・1 日の平均の時間帯）。sim の incidentRate（区画・時間帯の 1 時間あたりの期待件数）を、
 * 注視点のまわり 7×7 区画の道路で平均し、街全体の道路の区画の 1 時間あたりの平均で割る。描画の kind → sim の種類：衝突・違反は車、歩行者は歩行者。
 * 火災・鉄道は区画の値が小さすぎて比べにくいので、時間帯の目安（hourRate）だけ
 */
export function incidentRateK(s: GameState, tile: number, hour: number, kind: string): number {
  const k: 'car' | 'ped' | null = kind === 'crash' || kind === 'violation' ? 'car' : kind === 'pedestrian' ? 'ped' : null;
  if (!k) return hourRate(hour);
  const key = `${s.month}:${s.roadVersion}:${s.bVersion}`; let c = refCache.get(s);
  if (!c || c.key !== key) { const st = peopleStats(s); let nr = 0, car = 0, ped = 0; for (let i = 0; i < W * H; i++) if (s.road[i]) { nr++; car += st.risk.car[i]; ped += st.risk.ped[i] + st.risk.bike[i]; } c = { key, ref: { car: car / Math.max(1, nr) / 24, ped: ped / Math.max(1, nr) / 24 } }; refCache.set(s, c); }
  const ref = c.ref[k]; if (!(ref > 0)) return 1;
  const x0 = tile % W, y0 = (tile / W) | 0; let sum = 0, n = 0;
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = y * W + x; if (!s.road[i]) continue; sum += incidentRate(s, i, hour, k) + (k === 'ped' ? incidentRate(s, i, hour, 'bike') : 0); n++; }
  return n ? Math.max(0.1, Math.min(5, sum / n / ref)) : 0.3;
}

// ---------------------------------------------------------------- 駅の人だかり（住民の乗車）
/**
 * 駅ごとの、いまの時刻の 1 時間あたりの乗車（住民。電車で通う人が駅に着く時刻 = 出発 + 駅までの時間 が前後 15 分に入る人を 2 倍）と、
 * 朝の乗車の合計（v95 の peopleStats.boardings と同じ数え方）。休日は電車で出かける人（休日の手段が電車で、通勤の駅がある人）を 9〜11 時・16〜18 時に
 */
export function stationFlow(s: GameState, hour: number, holiday: boolean): { now: Map<number, number>; am: Map<number, number> } {
  const p = people(s), now = new Map<number, number>(), am = peopleStats(s).boardings;
  // v105b：平日は駅に着く時刻＝駅までの区間（weekdayLegs）の終わり。前は出発 + 10 分（自転車 6 分）の決め打ちで、画面の駅へ歩く人と時刻がずれていた
  if (!holiday) { for (const l of weekdayLegs(s).legs) if (l.toSt) { const a = l.dep + l.dur, st = p.station[l.p]; if (st >= 0 && Math.abs(hour - a) < 0.25) now.set(st, (now.get(st) ?? 0) + 2); } return { now, am }; }
  for (let i = 0; i < p.n; i++) {
    const st = p.station[i]; if (st < 0) continue;
    if (p.holMode[i] === RM_RAIL && p.hol[i] !== 0) {
      const a = 9 + h32(i, 7, 31) * 2 + (h32(i, 7, 32) < 0.5 ? 0 : 7);
      if (Math.abs(hour - a) < 0.25) now.set(st, (now.get(st) ?? 0) + 2);
    }
  }
  return { now, am };
}

// ---------------------------------------------------------------- 施設にいまいる住民（施設の人だかり）
const presCache = new WeakMap<GameState, { key: string; m: Map<number, number> }>();
/**
 * 時刻 hour に、建物ごとにその中（敷地）にいる住民の数。平日：通学・通勤の人は着いてから帰りの出発まで行き先に、
 * 昼の買い物・通院の人は用事の間（residentPlan と同じ決まり）。休日：休日の行き先に滞在の間と、店・行楽地・病院で働く人
 */
export function presentAt(s: GameState, hour: number, holiday: boolean, day = 0): Map<number, number> {
  const p = people(s), key = `${p.key}:${Math.floor(hour * 4)}:${holiday ? 1 : 0}:${day}`, c = presCache.get(s); if (c && c.key === key) return c.m;
  // v105b：公園は住民の外出（sim の outings。曜日・年代ごと）から。平日も休日も
  const m0 = parkPresent(s, hour, dowOf(holiday, day));
  const m = new Map<number, number>(m0), F = facs(s), add = (id: number) => m.set(id, (m.get(id) ?? 0) + 1);
  const svc = (id: number) => { const b = F.byId.get(id); if (!b) return false; const f = fam(b.kind); return f === 'shop' || f === 'leisure' || f === 'health' || b.kind === 'hospital'; };
  for (let i = 0; i < p.n; i++) {
    const md = p.mode[i], d = p.dest[i];
    if (md !== 255 && d >= 0 && (!holiday || (p.role[i] === 3 && svc(d) && h32(i, day, 41) < 0.6))) {
      const tt = Math.max(0.1, p.dist[i] / SPD[md]); if (hour >= p.depart[i] + tt && hour < p.back[i]) { add(d); continue; }
    }
    if (!holiday) {
      if (md === 255 && (p.role[i] === 4 || p.role[i] === 5) && hour >= 9 && hour < 18) {
        const u = h32(i, day, 11), cl = p.clinic[i] && h32(i, day, 12) < 0.25; if (!cl && u >= 0.3) continue;
        const hb = F.byId.get(p.home[i]); if (!hb) continue; const [hx, hy] = ctr(hb);
        const db = cl ? nearest(F.health, hx, hy) : p.hol[i] === 1 && p.holDest[i] >= 0 ? F.byId.get(p.holDest[i]) : nearest(F.shops, hx, hy); if (!db) continue;
        const mm = p.holMode[i] === 255 ? RM_WALK : p.holMode[i], dd = Math.max(0.2, (Math.abs(ctr(db)[0] - hx) + Math.abs(ctr(db)[1] - hy)) * KM), tt = Math.max(0.1, dd / SPD[mm]);
        const d0 = (cl ? 9 : 9.5) + h32(i, day, 13) * (cl ? 2.5 : 5), a = d0 + tt; if (hour >= a && hour < a + (cl ? 1.2 : 0.8)) add(db.id);
      }
    } else {
      const hol = p.hol[i], dId = p.holDest[i]; if (hol === 0 || hol === 3 || dId < 0) continue;
      const hb = F.byId.get(p.home[i]), db = F.byId.get(dId); if (!hb || !db) continue;
      const mm = p.holMode[i] === 255 ? RM_WALK : p.holMode[i], [hx, hy] = ctr(hb), dd = Math.max(0.2, (Math.abs(ctr(db)[0] - hx) + Math.abs(ctr(db)[1] - hy)) * KM), tt = Math.max(0.1, dd / SPD[mm]);
      const d0 = (hol === 2 ? 8.5 : 9.5) + h32(i, day, 21) * (hol === 2 ? 3 : 6), stay = hol === 2 ? 3 + h32(i, day, 22) * 4 : hol === 3 ? 1 + h32(i, day, 23) * 2 : 1;
      if (hour >= d0 + tt && hour < d0 + tt + stay) add(dId);
    }
  }
  presCache.set(s, { key, m }); return m;
}
/** 学校・保育の在籍（v95 の peopleStats.enroll） */
export function enrollOf(s: GameState, id: number): number { return peopleStats(s).enroll.get(id) ?? 0; }
