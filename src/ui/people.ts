// ひとりひとりの住民：住宅の世帯の数と構成から、名前・年齢・家族・勤め先・通う園や学校を決まった形で割り当てる。
// 同じ家・同じ世帯はいつ見ても同じ人で、年月がたつと年をとる（保存データには持たない）
import { DEFS, DISTRICTS, HH_NAMES, getMap, idx, isRes, fam, W } from '../sim/index';
import type { GameState, Building } from '../sim/index';

const SEI = ['佐藤', '鈴木', '高橋', '田中', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木', '山口', '松本', '井上', '木村', '林', '斎藤', '清水', '山崎', '森', '池田', '橋本', '阿部', '石川', '前田', '藤田', '小川', '岡田', '後藤', '長谷川', '村上', '近藤', '石井', '坂本', '遠藤', '青木', '藤井', '西村'];
const MEI_M = ['健一', '大輔', '翔太', '拓也', '直樹', '誠', '浩二', '和也', '亮', '悠斗', '蓮', '湊', '陽翔', '大翔', '颯太', '樹', '隆', '博', '清', '勇'];
const MEI_F = ['美咲', '陽子', '恵', '由美', '彩', '真由美', '久美子', '愛', '結衣', '陽菜', '凛', '葵', '芽依', '紬', 'さくら', '和子', '幸子', '節子', '洋子', '花子'];
const h32 = (a: number, b: number, c = 0) => { let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b + c * 0x27d4eb2d, 0xc2b2ae35); x ^= x >>> 15; x = Math.imul(x, 0x2c1b3c6d); x ^= x >>> 12; return (x >>> 0) / 4294967296; };
const pick = <T,>(a: readonly T[], r: number) => a[Math.floor(r * a.length) % a.length];

export type Person = { name: string; age: number; sex: 'm' | 'f'; role: string; place?: string; placeId?: number; mood?: string };
export type Family = { sei: string; type: number; people: Person[]; sat: number; home: Building; note: string };

/** 勤め先の候補（職のある建物）。重みは雇用の数 */
function workplaces(s: GameState): Building[] { return s.buildings.filter(b => b.status === 'operating' && b.connected && ((DEFS[b.kind].jobs ?? 0) > 0 || DEFS[b.kind].staffReq > 0)); }
const roadKm = (a: Building, b: Building) => (Math.abs(a.x - b.x) + Math.abs(a.y - b.y)) * 0.03;
function nearest(s: GameState, home: Building, f: (b: Building) => boolean): Building | undefined {
  let best: Building | undefined, bd = 1e9; for (const b of s.buildings) if (b.status === 'operating' && f(b)) { const d = roadKm(home, b); if (d < bd) { bd = d; best = b; } } return best;
}
const SV = ['保育', '学校', '公園', '消防', '買物', '通勤', 'ライフライン', '医療', '治安', '空気', '文化', '福祉', '教育', '防災'];
const COMPLAINT: Record<string, string> = { 保育: '保育園に入れなくて困っています', 学校: '学校が遠くて心配です', 公園: '近くに遊べる公園がほしい', 消防: '消防署が遠くて不安です', 買物: '買い物が不便です', 通勤: '朝の渋滞がつらい', ライフライン: '水道や下水が心配', 医療: '病院が遠い', 治安: '夜道が少し怖い', 空気: '空気が気になります', 文化: '図書館やホールがほしい', 福祉: '親の介護が心配です', 教育: '子どもの教育が気になります', 防災: '災害のときが不安です' };

/** 住宅の中の世帯（最大 n 世帯）をひとりひとりにする */
export function familiesOf(s: GameState, b: Building, n = 6): Family[] {
  if (!isRes(b.kind) || !b.hh) return [];
  const out: Family[] = [], yr = Math.floor(s.month / 12), works = workplaces(s);
  const nursery = (r: number) => (b.unmet > 0.5 && r < Math.min(0.8, b.unmet / 4) ? undefined : nearest(s, b, o => fam(o.kind) === 'care' || o.kind === 'privNursery'));
  const school = nearest(s, b, o => o.kind === 'school'), jhs = nearest(s, b, o => o.kind === 'jhs');
  let k = 0;
  for (let t = 0; t < 5 && out.length < n; t++) {
    const cnt = Math.round(b.hh[t]);
    for (let j = 0; j < cnt && out.length < n; j++, k++) {
      const r = (q: number) => h32(b.id * 131 + k, q, t), sei = pick(SEI, r(1)), people: Person[] = [];
      const job = (q: number): Pick<Person, 'role' | 'place' | 'placeId'> => { if (!works.length || r(q) < 0.12) return { role: pick(['在宅で働く', '市外の会社へ通勤', 'パート', '自営業'], r(q + 1)) }; const w = works[Math.floor(r(q + 2) * works.length)]; return { role: `${DEFS[w.kind].name}で働く（${roadKm(b, w).toFixed(1)}km）`, place: DEFS[w.kind].name, placeId: w.id }; };
      const adult = (sex: 'm' | 'f', a0: number, a1: number, q: number, retired = false): Person => ({ name: `${sei} ${pick(sex === 'm' ? MEI_M : MEI_F, r(q))}`, sex, age: Math.round(a0 + r(q + 1) * (a1 - a0)) + yr % 5, ...(retired ? { role: pick(['年金で暮らす', '地域の見守りボランティア', '畑仕事', '週 2 日シルバー人材センター'], r(q + 3)) } : job(q + 4)) });
      const kid = (q: number, a0: number, a1: number): Person => { const age = Math.round(a0 + r(q + 1) * (a1 - a0)), sex = r(q + 2) < 0.5 ? 'm' : 'f'; const nu = age <= 5 ? nursery(r(q + 3)) : undefined, sc = age <= 12 ? school : jhs;
        return { name: `${sei} ${pick(sex === 'm' ? MEI_M.slice(9) : MEI_F.slice(8), r(q))}`, sex, age, role: age <= 5 ? (nu ? `${DEFS[nu.kind].name}に通う` : '保育園に入れず、家で過ごす（待機）') : sc ? `${DEFS[sc.kind].name}に通う` : '市外の学校に通う', placeId: age <= 5 ? nu?.id : sc?.id }; };
      if (t === 0) people.push(adult(r(5) < 0.5 ? 'm' : 'f', 22, 38, 10));
      else if (t === 1) { const old = r(6) < 0.35; people.push(adult('m', old ? 60 : 27, old ? 74 : 45, 10, old), adult('f', old ? 58 : 26, old ? 72 : 43, 20, old)); }
      else if (t === 2) { people.push(adult('m', 28, 40, 10), adult('f', 27, 39, 20)); people.push(kid(30, 0, 5)); if (r(7) < 0.4) people.push(kid(40, 0, 5)); }
      else if (t === 3) { people.push(adult('m', 35, 50, 10), adult('f', 34, 48, 20)); people.push(kid(30, 6, 15)); if (r(7) < 0.5) people.push(kid(40, 6, 15)); }
      else { people.push(adult('f', 66, 90, 20, true)); if (r(8) < 0.5) people.push(adult('m', 68, 90, 10, true)); }
      const sat = b.sat[t] ?? 0.6;
      let worst = -1, wv = 2; b.sv.forEach((v, q) => { if (v < wv && v < 0.6) { wv = v; worst = q; } });
      const note = sat >= 0.75 ? pick(['この街に住んでよかった', '暮らしやすい街です', '休日の公園が楽しみ', 'ずっと住みたい'], r(9)) : worst >= 0 ? COMPLAINT[SV[worst]] ?? 'もう少し便利になってほしい' : 'ふつうに暮らしています';
      out.push({ sei, type: t, people, sat, home: b, note });
    }
  }
  return out;
}
/** 街の住民から、何人かを選んで紹介する（月ごとに入れかわる） */
export function featured(s: GameState, n = 10): Family[] {
  const res = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating' && b.hh && b.hh.some(v => v >= 1));
  const out: Family[] = []; if (!res.length) return out;
  for (let k = 0; k < n * 3 && out.length < n; k++) {
    const b = res[Math.floor(h32(s.month, k, 7) * res.length)], f = familiesOf(s, b, 3);
    if (f.length) { const one = f[Math.floor(h32(s.month, k, 8) * f.length)]; if (!out.some(o => o.home.id === one.home.id && o.sei === one.sei)) out.push(one); }
  }
  return out;
}
export const famTitle = (f: Family) => `${f.sei}さん${f.people.length > 1 ? '一家' : ''}（${HH_NAMES[f.type]}）`;
export const famWhere = (s: GameState, f: Family) => DISTRICTS[getMap(s.seed).district[idx(f.home.x, f.home.y)]] ?? '';
export const moodIcon = (v: number) => (v >= 0.78 ? '😊' : v >= 0.65 ? '🙂' : v >= 0.55 ? '😐' : '😟');
/** 追いかけている車の人（車の番号から決まった住民） */
export function driverOf(s: GameState, i: number): string {
  const res = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating'); if (!res.length) return '住民';
  const b = res[Math.floor(h32(i, 3, 1) * res.length)], f = familiesOf(s, b, 2)[0], p = f?.people.find(q => q.age >= 18);
  return p ? `${p.name}さん（${p.age}）${p.place ? `・${p.place}へ` : ''}` : '住民';
}
void W;
