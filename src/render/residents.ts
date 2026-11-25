// v98：画面の車・歩行者・自転車・バスを、実在の住民（src/sim/people.ts）の移動から出す。sim は読むだけ（計算も保存も変えない）。
// - 平日の通勤・通学（とその帰り）は sim の口 sampleTrips の経路を使い、足りない分を住民の一覧（people）から同じ決まりで補う。
// - 昼の買い物・通院（家の大人・高齢者）と、休日の行楽地・公園・買い物は、住民の休日の過ごし方（hol・holDest・holMode）と通院の有無から、
//   描画の側で時刻を決める（住民ごとのハッシュ。同じ日・同じ時刻なら同じ答え）。
// - 見えている範囲で移動中の住民を、手段ごとに数える（台数・人数はこの数に比例させ、性能の上限で切る）。
import type { GameState, Building } from '../sim/index';
import { W, H, DEFS, fam, GATEWAYS } from '../sim/index';
import { HH_NAMES } from '../sim/types';
import { hourRate } from './incidents';
import { people, peopleStats, sampleTrips, incidentRate, ROLE_NAMES, MODE_NAMES } from '../sim/people';

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

/**
 * 時刻 hour に移動中の住民のうち、注視点（区画 cx, cy）から半径 R 区画に見える人を集める。
 * trips は最大 cap 件（sampleTrips の経路つきを先に、残りを住民の一覧から）。visible は見える人の総数（cap で切らない）
 */
export function residentPlan(s: GameState, hour: number, holiday: boolean, cx: number, cy: number, R: number, cap = 900, day = 0): Plan {
  const p = people(s), F = facs(s), byId = F.byId, vis = [0, 0, 0, 0, 0], trips: RTrip[] = [], cand: RTrip[] = [];
  const out: Plan = { trips, visible: vis, total: 0, holiday };
  if (!p.n) return out;
  const gw = GATEWAYS.filter(g => s.road[g]), near = (x: number, y: number) => Math.abs(x - cx) < R && Math.abs(y - cy) < R;
  const seen = new Set<number>();
  // 1) 平日の通勤・通学：sampleTrips（経路つき）から、いまの位置が見える範囲にある人
  if (!holiday) {
    for (const k of [0, 0.013, 0.027]) {
      if (trips.length >= cap) break;
      for (const t of sampleTrips(s, hour + k, 500)) {
        if (seen.has(t.person) || trips.length >= cap) continue;
        const i = t.person, tt = Math.max(0.1, p.dist[i] / SPD[p.mode[i]]), prog = Math.max(0, Math.min(0.999, (hour - t.depart) / tt));
        const at = t.path.length ? t.path[Math.min(t.path.length - 1, Math.floor(prog * t.path.length))] : t.from;
        if (!near(at % W, (at / W) | 0)) continue;
        const hb = byId.get(p.home[i]), back = hb ? t.to === hb.acc : false, via = p.mode[i];
        seen.add(i);
        trips.push({ person: i, role: t.role, mode: t.mode, via, from: t.from, to: t.to, dest: via === RM_RAIL ? p.station[i] : p.dest[i], prog, why: back ? '帰宅' : whyOf(t.role, via, p.dest[i], byId.get(p.dest[i])), path: t.path });
      }
    }
  }
  // 2) 住民の一覧を 1 回なめて、見える範囲の移動中の人を数える（位置は家と行き先の間をまっすぐ結んだ所で見る）
  for (let i = 0; i < p.n; i++) {
    const hb = byId.get(p.home[i]); if (!hb || hb.acc < 0) continue;
    let destB: Building | null | undefined = null, m = 255, dep = 0, why = '', destId = -1, via = 255, toGw = -1;
    if (!holiday) {
      m = p.mode[i];
      if (m !== 255) {
        const tt = Math.max(0.1, p.dist[i] / SPD[m]);
        const going = hour >= p.depart[i] && hour < p.depart[i] + tt, coming = hour >= p.back[i] && hour < p.back[i] + tt;
        if (!going && !coming) m = 255;
        else {
          via = m; dep = going ? p.depart[i] : p.back[i];
          if (m === RM_RAIL) { destId = p.station[i]; destB = byId.get(destId); m = p.access[i] === 255 ? RM_WALK : p.access[i]; }
          else { destId = p.dest[i]; if (destId >= 0) destB = byId.get(destId); else if (destId === -2 && gw.length) toGw = gw[p.home[i] % gw.length]; }
          why = going ? whyOf(p.role[i], via, p.dest[i], byId.get(p.dest[i])) : '帰宅';
          if (!destB && toGw < 0) m = 255;
          else { const tt2 = tt; const prog = (hour - dep) / tt2; if (!push(i, hb, destB, toGw, going, prog, m, via, destId, why)) continue; }
        }
      }
      // 昼の買い物・通院（家の大人・高齢者で、通勤・通学のない人）
      if (m === 255 && p.mode[i] === 255 && (p.role[i] === 4 || p.role[i] === 5) && hour >= 9 && hour < 17.5) {
        const u = h32(i, day, 11), cl = p.clinic[i] && h32(i, day, 12) < 0.25;
        if (cl || u < 0.3) {
          const [hx, hy] = ctr(hb); destB = cl ? nearest(F.health, hx, hy) : p.hol[i] === 1 && p.holDest[i] >= 0 ? byId.get(p.holDest[i]) : nearest(F.shops, hx, hy);
          if (destB && destB.acc >= 0) {
            const mm = p.holMode[i] === 255 ? RM_WALK : p.holMode[i], d = Math.max(0.2, (Math.abs(ctr(destB)[0] - hx) + Math.abs(ctr(destB)[1] - hy)) * KM), tt = Math.max(0.1, d / SPD[mm]);
            const d0 = (cl ? 9 : 9.5) + h32(i, day, 13) * (cl ? 2.5 : 5), stay = cl ? 1.2 : 0.8, d1 = d0 + tt + stay;
            const going = hour >= d0 && hour < d0 + tt, coming = hour >= d1 && hour < d1 + tt;
            if (going || coming) push(i, hb, destB, -1, going, (hour - (going ? d0 : d1)) / tt, mm === RM_RAIL ? RM_WALK : mm, mm, destB.id, going ? (cl ? '通院' : '買い物') : '帰宅');
          }
        }
      }
    } else {
      // 休日：行楽地・公園・買い物・通院（家で過ごす人は出ない）
      const hol = p.hol[i], dId = p.holDest[i]; if (hol === 0 || dId < 0) continue;
      destB = byId.get(dId); if (!destB || destB.acc < 0) continue;
      const mm = p.holMode[i] === 255 ? RM_WALK : p.holMode[i], [hx, hy] = ctr(hb), d = Math.max(0.2, (Math.abs(ctr(destB)[0] - hx) + Math.abs(ctr(destB)[1] - hy)) * KM), tt = Math.max(0.1, d / SPD[mm]);
      const d0 = (hol === 2 ? 8.5 : 9.5) + h32(i, day, 21) * (hol === 2 ? 3 : 6), stay = hol === 2 ? 3 + h32(i, day, 22) * 4 : hol === 3 ? 1 + h32(i, day, 23) * 2 : 1, d1 = d0 + tt + stay;
      const going = hour >= d0 && hour < d0 + tt, coming = hour >= d1 && hour < d1 + tt;
      if (going || coming) push(i, hb, destB, -1, going, (hour - (going ? d0 : d1)) / tt, mm === RM_RAIL ? RM_WALK : mm, mm, dId, going ? ['', '買い物', '行楽地', '公園', '通院'][hol] : '帰宅');
    }
  }
  function push(i: number, hb: Building, destB: Building | null | undefined, toGw: number, going: boolean, prog: number, m: number, via: number, destId: number, why: string): boolean {
    out.total++;
    const [hx, hy] = ctr(hb), [dx, dy] = destB ? ctr(destB) : [toGw % W, (toGw / W) | 0], q = Math.max(0, Math.min(1, prog)), f = going ? q : 1 - q;
    const x = hx + (dx - hx) * f, y = hy + (dy - hy) * f;
    if (!near(x, y)) return true;
    vis[m] = (vis[m] ?? 0) + 1;
    if (!seen.has(i) && cand.length < cap * 3) {
      const a = hb.acc, b = destB ? destB.acc : toGw;
      cand.push({ person: i, role: p.role[i], mode: m, via, from: going ? a : b, to: going ? b : a, dest: destId, prog: q, why });
    }
    return true;
  }
  // 3) 足りない分を一覧の候補から（決まった順に間引いて、手段の割合を保つ）
  if (trips.length < cap && cand.length) {
    const need = cap - trips.length, step = Math.max(1, cand.length / need);
    for (let k = 0; k < cand.length && trips.length < cap; k = Math.floor(k + step)) { const c = cand[Math.floor(k)]; if (!seen.has(c.person)) { seen.add(c.person); trips.push(c); } if (step === 1 && k + 1 >= cand.length) break; }
  }
  return out;
}

function whyOf(role: number, via: number, dest: number, db?: Building): string {
  if (role === 1 || role === 2) return '通学';
  if (role === 0) return '保育園・幼稚園へ';
  const f = db ? fam(db.kind) : '';
  if (role >= 4 && db) { if (f === 'health' || db.kind === 'hospital' || db.kind === 'univHospital') return '通院'; if (f === 'shop') return role === 4 ? '買い物・パート' : '買い物'; if (f === 'park') return '散歩'; return role === 5 ? 'お出かけ' : 'パート'; }
  if (via === RM_RAIL) return dest === -2 ? '市外へ通勤（電車）' : '通勤（電車）';
  return dest === -2 ? '市外へ通勤' : '通勤';
}

// ---------------------------------------------------------------- 紹介（架空の名前）
const SEI = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '小川', '岡田', '後藤', '長谷川', '村上', '近藤', '石井', '坂本', '遠藤', '青木', '藤井', '西村', '福田'];
const MEI_M = ['健一', '大輔', '翔太', '拓也', '直樹', '誠', '浩二', '和也', '亮', '悠斗', '蓮', '湊', '陽翔', '颯太', '樹', '隆', '博', '勇', '大翔', '悠真'];
const MEI_F = ['美咲', '陽子', '恵', '由美', '彩', '真由美', '久美子', '愛', '結衣', '陽菜', '凛', '葵', '芽依', '紬', 'さくら', '和子', '幸子', '洋子', '結菜', '莉子'];
const AGE = [[3, 3], [6, 6], [12, 3], [22, 43], [30, 35], [65, 25]];
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
  return `${n.name}さん（${n.age}歳・${ROLE_NAMES[p.role[i]]}）｜住まい：${home}・${HH_NAMES[p.hhType[i]] ?? ''}世帯｜いま：${t.why}${t.why === '帰宅' ? '' : `→${dest}`}｜手段：${via}`;
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
