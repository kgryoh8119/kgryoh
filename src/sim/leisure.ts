// v105b：住民の余暇の外出（公園）。曜日ごと・年代ごとの決まりで、だれが・いつ・どの公園へ行くかを住民一人ひとりに決める。
// 住民（src/sim/people.ts）と s.seed・曜日のハッシュだけで決まる（保存しない。街の乱数 s.rng は使わない）。sim の計算（人口・満足・お金・事故の統計）は変えない。
// 割合の目安（出典と考え方は docs/v105b-変更記録.md）：
// - 総務省「社会生活基本調査」（令和 3 年）：ウォーキング・軽い体操の行動者率は 65 歳以上で高く（年に 1 回以上で 4〜5 割）、週に 2 日以上の人が多い。
//   1 日あたりにならし、公園を通る・公園で体操する人を 3 分の 2 として、平日の朝に約 16%。土日は少し減る（家族の用事）。
// - 同調査の時間帯別の行動者率：高齢者の運動は朝 6〜9 時に山、夕方に小さな山。働く世代の運動は平日の夜と休日の朝。
// - 未就学児を家で育てる親子：子育て支援の調査で、晴れた日の午前に公園・広場へ行く親子が多い（週に 2〜3 日）→ 平日の 10〜12 時に約 35%。
// - 小学生の放課後：ベネッセ教育総合研究所「放課後の生活時間調査」で外遊びは週に 2〜3 日 → 公園で遊ぶ日を約 2 割、15〜17 時（夕方 5 時のチャイムで帰る）。
// - ジョギング：同調査のジョギング・マラソンの年間の行動者率は 1 割弱 → 平日の夜（19〜21 時）に働く人の 3%、休日の朝に 6%。
// - 休日の家族：v95 の休日の過ごし方（公園 15%）の人が、昼前後（10〜15 時）に 1〜3 時間。
import type { GameState, Building } from './types';
import { DEFS, fam } from './config';
import { people } from './people';

/** 外出の種類 */
export const OUT_NAMES = ['朝の散歩・体操', '親子で公園', '放課後の公園遊び', 'ジョギング', '散歩', '休日の公園'] as const;
export const OUT_WALK = 0, OUT_TODDLER = 1, OUT_KIDS = 2, OUT_JOG = 3, OUT_STROLL = 4, OUT_FAMILY = 5;
/** 1 回の外出。p は先を歩く人、with はいっしょに行く住民（家で育てる未就学児）。dep に家を出て、tt 時間で公園に着き、stay 時間いて、tt 時間で帰る */
export interface Outing { p: number; with: number[]; park: number; kind: number; dep: number; tt: number; stay: number; mode: number; from: number; to: number }
/** 公園として使う施設（体育・競技・トイレ・農園は除く） */
const NOT_PARK = new Set(['pool', 'athletics', 'rugby', 'koshuToilet', 'clubTeam', 'allotment', 'ecoCenter']);
export const isWalkPark = (b: Building) => fam(b.kind) === 'park' && !NOT_PARK.has(b.kind) && (DEFS[b.kind].cat === 'park' || DEFS[b.kind].cat === 'nature');
/** 曜日ごとの倍率（0〜4 月〜金、5 土、6 日） */
const DOW_K = [1, 0.95, 1, 0.95, 1.05, 1, 1.1];
const KMT = 0.03 * 1.25, WALK_MAX = 1.2;
function h32(a: number, b: number, c: number, d = 0): number {
  let h = (a ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b); h ^= h >>> 13;
  h = Math.imul(h ^ (c + 0x165667b1), 0xc2b2ae35); h ^= h >>> 16;
  h = Math.imul(h ^ (d + 0x27d4eb2f), 0x85ebca6b); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
const cache = new WeakMap<GameState, Map<string, Outing[]>>();
/** 曜日 dow（0〜6。5・6 が土日）の、住民の公園への外出の一覧（同じ状態・曜日なら同じ答え） */
export function outings(s: GameState, dow: number): Outing[] {
  const p = people(s), d = ((Math.floor(dow) % 7) + 7) % 7, key = `${p.key}:${d}`;
  let cm = cache.get(s); if (!cm) { cm = new Map(); cache.set(s, cm); } const c = cm.get(key); if (c) return c;
  if (cm.size > 8) cm.clear();
  const out: Outing[] = []; cm.set(key, out);
  const parks = s.buildings.filter(b => b.status === 'operating' && b.connected && b.acc >= 0 && isWalkPark(b)); if (!parks.length || !p.n) return out;
  const byId = new Map(s.buildings.map(b => [b.id, b] as [number, Building]));
  const ctr = (b: Building) => [b.x + DEFS[b.kind].w / 2, b.y + DEFS[b.kind].h / 2];
  const pc = parks.map(ctr), near = new Map<number, [Building, number]>();
  const nearPark = (hb: Building): [Building, number] => { let v = near.get(hb.id); if (v) return v; const [x, y] = ctr(hb); let best = 0, bd = 1e9; for (let k = 0; k < parks.length; k++) { const dd = Math.abs(pc[k][0] - x) + Math.abs(pc[k][1] - y); if (dd < bd) { bd = dd; best = k; } } v = [parks[best], bd * KMT]; near.set(hb.id, v); return v; };
  const we = d >= 5, K = DOW_K[d], u = (i: number, salt: number) => h32(s.seed, i * 8 + d, salt * 7919 + 1050); // 種類ごとの値が互いに偏らないよう、salt は先に混ぜる
  const SPD = [4.5, 12, 15, 35, 25];
  const used = new Uint8Array(p.n);
  const push = (i: number, kind: number, dep: number, stay: number, withK: number[] = [], allowBike = false) => {
    const hb = byId.get(p.home[i]); if (!hb || hb.acc < 0) return false;
    if (!we && (p.role[i] === 4 || p.role[i] === 5) && p.mode[i] !== 255 && dep + stay + 1 > p.depart[i] && dep < p.back[i] + 0.5) return false; // 平日の買い物・通院の時間とは重ねない
    const [pk, km] = nearPark(hb); const mode = km <= WALK_MAX ? 0 : allowBike && km <= 3 ? 1 : -1; if (mode < 0) return false;
    out.push({ p: i, with: withK, park: pk.id, kind, dep, tt: Math.max(0.03, km / SPD[mode]), stay, mode, from: hb.acc, to: pk.acc }); used[i] = 1; for (const k of withK) used[k] = 1; return true;
  };
  // 家で育てる未就学児と、同じ世帯（同じ建物・同じ類型）の家の大人を組にする（親子で公園）
  const homeAdult = new Map<number, number[]>();
  for (let i = 0; i < p.n; i++) if (p.role[i] === 4 || (p.role[i] === 3 && p.mode[i] === 255)) { const k = p.home[i] * 8 + p.hhType[i]; const l = homeAdult.get(k); if (l) l.push(i); else homeAdult.set(k, [i]); }
  const taken = new Map<number, number>();
  for (let i = 0; i < p.n; i++) {
    if (p.role[i] !== 0 || p.dest[i] >= 0) continue;
    const k = p.home[i] * 8 + p.hhType[i], l = homeAdult.get(k); if (!l || !l.length) continue;
    const j = taken.get(k) ?? 0, a = l[j % l.length]; taken.set(k, j + 1);
    if (used[a]) { const o = out.find(x => x.p === a && x.kind === OUT_TODDLER); if (o && o.with.length < 2) { o.with.push(i); used[i] = 1; } continue; } // きょうだいはいっしょに
    if (u(a, 1) < (we ? 0.25 : 0.35) * K) push(a, OUT_TODDLER, (we ? 9.5 : 9.8) + 1.6 * u(a, 2), 0.7 + 0.8 * u(a, 3), [i]);
  }
  const tt0 = (i: number) => { const m = p.mode[i]; return m === 255 ? 0 : p.dist[i] / SPD[m]; };
  for (let i = 0; i < p.n; i++) {
    if (used[i]) continue;
    const r = p.role[i], x = u(i, 4);
    if (r === 5) { // 高齢者：朝の散歩・体操（6〜9 時）、夕方の散歩
      if (x < (we ? 0.14 : 0.16) * K) push(i, OUT_WALK, 6 + 2.6 * Math.pow(u(i, 5), 1.4), 0.3 + 0.5 * u(i, 6));
      else if (x < (we ? 0.19 : 0.21) * K) push(i, OUT_STROLL, 15 + 1.5 * u(i, 5), 0.3 + 0.4 * u(i, 6));
    } else if (r === 4) { // 家の大人：昼前の散歩
      if (x < 0.05 * K) push(i, OUT_STROLL, 9.5 + 2 * u(i, 5), 0.4 + 0.5 * u(i, 6));
    } else if (r === 1) { // 小学生：放課後（平日 15〜17 時）、土日は午前と午後
      if (!we) { if (x < 0.2 * K) { const dep = Math.max(15, p.back[i] + tt0(i) + 0.25) + 0.5 * u(i, 5); if (dep < 16.6) push(i, OUT_KIDS, dep, Math.min(17.2 - dep, 0.75 + 0.75 * u(i, 6))); } }
      else if (x < 0.22 * K) push(i, OUT_KIDS, u(i, 7) < 0.4 ? 10 + u(i, 5) : 14 + 1.5 * u(i, 5), 1 + u(i, 6));
    } else if (r === 2) { if (we && x < 0.05 * K) push(i, OUT_KIDS, 14 + 2 * u(i, 5), 1 + u(i, 6)); }
    else if (r === 3) { // 働く人：平日の夜（帰ってから 19〜21 時半）、土日の朝のジョギング
      if (!we) { if (x < 0.03 * K) { const dep = Math.max(19, p.back[i] + tt0(i) + 0.5) + u(i, 5); if (dep < 21.5) push(i, OUT_JOG, dep, 0.3 + 0.3 * u(i, 6)); } }
      else if (x < 0.06 * K) push(i, OUT_JOG, 7 + 2.5 * u(i, 5), 0.3 + 0.4 * u(i, 6));
    }
    // 休日の家族（v95 の休日の過ごし方が公園の人。上の外出がない人）
    if (we && !used[i] && p.hol[i] === 3 && p.holDest[i] >= 0) push(i, OUT_FAMILY, 9.5 + 5.5 * u(i, 8), 1 + 2 * u(i, 9), [], true);
  }
  out.sort((a, b) => a.p - b.p);
  return out;
}
/** 時刻 hour に公園にいる住民の数（公園の番号ごと。いっしょに来た子どもを含む） */
export function parkPresent(s: GameState, hour: number, dow: number): Map<number, number> {
  const m = new Map<number, number>();
  for (const o of outings(s, dow)) { const a = o.dep + o.tt; if (hour >= a && hour < a + o.stay) m.set(o.park, (m.get(o.park) ?? 0) + 1 + o.with.length); }
  return m;
}
/** 1 時間ごと（その時の 30 分の時点）の、公園にいる住民の合計（市全体）。kind を渡すとその種類だけ */
export function parkByHour(s: GameState, dow: number, kind = -1): number[] {
  const out = new Array(24).fill(0), L = outings(s, dow);
  for (let h = 0; h < 24; h++) { const t = h + 0.5; for (const o of L) { if (kind >= 0 && o.kind !== kind) continue; const a = o.dep + o.tt; if (t >= a && t < a + o.stay) out[h] += 1 + o.with.length; } }
  return out;
}
