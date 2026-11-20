// 市長の成長：勲章（実績）・全国市区町村ランキング（年 1 回）・市長ポイントと市長レベル・区域の編入
// ここは core.ts を読み込まない（core.ts がレベルの特典を読むため）
import type { GameState, Kind } from './types';
import { W, H, DEFS, countOp } from './config';
import type { Difficulty } from './config';
import { REAL } from './real';
import { isCastaway } from './map';

// ---------------------------------------------------------------- 市長レベル
/** v94：レベル 10 に届くのが早すぎたので曲線を見直した。後半ほど必要なポイントが増える。
 *  ふつうでうまく運営して 3 期（12 年）前後、平均的な運営（オート）では 4〜5 期で最大に届く目安。
 *  ポイントは「毎年 3 月の評価（在任の基本点＋順位）」が土台で、表彰・勲章・再選は上乗せ（v93 までは表彰と勲章の差が大きく、うまい人ほど一気に上がった） */
export const LEVELS: { pts: number; title: string; perk: string }[] = [
  { pts: 0, title: '新人市長', perk: '' },
  { pts: 200, title: '駆け出し市長', perk: '区域の編入 1' },
  { pts: 480, title: '頼れる市長', perk: '区域の編入 1・支持率 +1 ポイント' },
  { pts: 800, title: '敏腕市長', perk: '区域の編入 1・知名度 +3' },
  { pts: 1150, title: '実力派市長', perk: '区域の編入 1・転入 +3%' },
  { pts: 1550, title: '名物市長', perk: '区域の編入 1・来訪者 +5%' },
  { pts: 2000, title: '全国区の市長', perk: '区域の編入 1・支持率 +1 ポイント' },
  { pts: 2500, title: '名市長', perk: '区域の編入 1・暮らしの満足 +0.5 ポイント' },
  { pts: 3050, title: '改革の旗手', perk: '区域の編入 1・転入 +3%' },
  { pts: 3650, title: '伝説の市長', perk: '区域の編入 1・知名度 +5' },
];
/** v93 までの必要ポイント（古いセーブのレベルを保つための読み替えに使う） */
export const LEVELS_V93 = [0, 120, 320, 520, 750, 1000, 1300, 1650, 2050, 2500];
export const CURVE = 94;
/** 毎年 3 月の評価の在任の基本点と、順位で足す幅。再選 1 回の点 */
export const RANK_BASE = 90, RANK_SPAN = 80, WIN_PTS = 50;
/** 古いセーブの市長ポイントを新しい曲線に読み替える：いまのレベルは下げず、レベルの中の進み具合（割合）も保つ。
 *  勲章で受けた再選の記録（won）は、読み込んだ時点の勝ち数から数える（さかのぼって足さない） */
export function migrateMayor(s: GameState): void {
  const M = s.mayor; if (!M || M.curve === CURVE) return;
  const P = M.pts; let l = 1; for (let k = 0; k < LEVELS_V93.length; k++) if (P >= LEVELS_V93[k]) l = k + 1;
  const o0 = LEVELS_V93[l - 1], o1 = LEVELS_V93[l], n0 = LEVELS[l - 1].pts, n1 = LEVELS[l]?.pts;
  const np = o1 === undefined || n1 === undefined ? n0 : n0 + ((P - o0) / (o1 - o0)) * (n1 - n0);
  if (np > P) M.pts = Math.round(np);
  M.won ??= wins(s);
  M.curve = CURVE;
}
export function levelOf(pts: number): number { let l = 1; for (let k = 0; k < LEVELS.length; k++) if (pts >= LEVELS[k].pts) l = k + 1; return l; }
/** レベルの特典（core.ts の modAdd / modMul に足す） */
export function mayorAdd(s: GameState, key: string): number {
  if (!s.mayor) return 0; const l = levelOf(s.mayor.pts);
  if (key === 'approval') return (l >= 3 ? 0.01 : 0) + (l >= 7 ? 0.01 : 0);
  if (key === 'fame') return (l >= 4 ? 3 : 0) + (l >= 10 ? 5 : 0);
  if (key === 'sat:all') return l >= 8 ? 0.005 : 0;
  return 0;
}
export function mayorMul(s: GameState, key: string): number {
  if (!s.mayor) return 1; const l = levelOf(s.mayor.pts);
  if (key === 'inflow') return (l >= 5 ? 1.03 : 1) * (l >= 9 ? 1.03 : 1);
  if (key === 'visitors') return l >= 6 ? 1.05 : 1;
  return 1;
}

// ---------------------------------------------------------------- 難易度ごとの条件
/** gain：もらえるポイントの倍率／rank：ほかの市町村との差（点への足し引き）／top・good・cat：大賞・優秀賞・部門賞の順位の線／start：はじめから持っている編入の回数 */
export const MAYOR_DIFF: Record<Difficulty, { gain: number; rank: number; top: number; good: number; cat: number; start: number; text: string }> = {
  easy: { gain: 1.3, rank: 0.05, top: 20, good: 150, cat: 20, start: 1, text: 'ポイント 1.3 倍・ランキングが上がりやすい・大賞 20 位／優秀賞 150 位／部門賞 20 位以内・はじめから編入 1 回' },
  normal: { gain: 1, rank: 0, top: 10, good: 100, cat: 10, start: 0, text: 'ポイント 1 倍・大賞 10 位／優秀賞 100 位／部門賞 10 位以内' },
  hard: { gain: 0.8, rank: -0.05, top: 5, good: 50, cat: 5, start: 0, text: 'ポイント 0.8 倍・ほかの市町村が強い・大賞 5 位／優秀賞 50 位／部門賞 5 位以内' },
};
export const mayorDiff = (s: GameState) => MAYOR_DIFF[s.difficulty ?? 'normal'] ?? MAYOR_DIFF.normal;

// ---------------------------------------------------------------- 区域（地図を 6×6 に分けた 36 区域）
/** v92：地図を 192×168 に広げたので 4×4 から 6×6 に。1 区域の大きさは v87〜v91 と同じ 32×28 区画（約 960m×840m）のまま */
export const BX = 6, BY = 6;
const bw = () => Math.ceil(W / BX), bh = () => Math.ceil(H / BY);
export function blockOf(i: number): number { const x = i % W, y = (i / W) | 0; return Math.min(BY - 1, Math.floor(y / bh())) * BX + Math.min(BX - 1, Math.floor(x / bw())); }
export function blockRect(b: number): { x0: number; y0: number; x1: number; y1: number } { const bx = b % BX, by = Math.floor(b / BX); return { x0: bx * bw(), y0: by * bh(), x1: Math.min(W, (bx + 1) * bw()), y1: Math.min(H, (by + 1) * bh()) }; }
export function blockName(b: number): string { const bx = b % BX, by = Math.floor(b / BX), ns = by === 0 ? '北' : by === BY - 1 ? '南' : '', ew = bx === 0 ? '西' : bx === BX - 1 ? '東' : '';
  return `${ns + ew || '中央'}の区域（${String.fromCharCode(65 + bx)}${by + 1}）`; }
/** v92：4×4 の区域（v91 まで）の番号を 6×6 の番号に。1 区域の大きさは同じなので、左上の 4×4 にそのまま対応する */
export const blockFrom4 = (b: number) => (b % 4) + Math.floor(b / 4) * BX;
/** まだ市の区域でない（編入していない）区画か */
export function isLocked(s: GameState, i: number): boolean { return !!s.unlocked && !s.unlocked.includes(blockOf(i)); }
export const LOCK_MSG = 'まだ市の区域ではありません（市長レベルが上がると、となりの区域を編入できます）';
/** 編入できる区域：いまの区域ととなり合っていて、まだ編入していない */
export function annexable(s: GameState): number[] {
  if (!s.unlocked) return [];
  const out: number[] = [];
  for (let b = 0; b < BX * BY; b++) {
    if (s.unlocked.includes(b)) continue;
    const bx = b % BX, by = Math.floor(b / BX);
    if (s.unlocked.some(u => Math.abs((u % BX) - bx) + Math.abs(Math.floor(u / BX) - by) === 1)) out.push(b);
  }
  return out;
}
/** 新しい街：はじめの町（建物の多い区域）だけを市の区域にする。実在都市版とサンドボックスは制限しない */
export function initLocks(s: GameState): void {
  if (REAL) return;
  const n = new Array(BX * BY).fill(0);
  for (let i = 0; i < W * H; i++) if (s.occ[i]) n[blockOf(i)]++;
  const un = n.map((v, b) => (v >= 15 ? b : -1)).filter(b => b >= 0);
  s.unlocked = isCastaway(s.seed) ? Array.from({ length: BX * BY }, (_, b) => b) : un.length ? un : [7, 8, 13, 14]; // v88：無人島は島全体が村の区域
  s.mayor = s.mayor ?? newMayor();
  s.mayor.annex = Math.max(s.mayor.annex, mayorDiff(s).start);
}
export function newMayor(): NonNullable<GameState['mayor']> { return { pts: 0, medals: {}, ranks: [], annex: 0, seenLv: 1, seenRank: -1, curve: CURVE, won: 0 }; }

// ---------------------------------------------------------------- 勲章
type Medal = { id: string; name: string; desc: string; tier: 1 | 2 | 3; pts: number; done: (s: GameState) => boolean };
const op = (s: GameState, k: Kind) => s.buildings.some(b => b.kind === k && b.status === 'operating');
const wins = (s: GameState) => s.elections.filter(e => e.win).length;
export const MEDALS: Medal[] = [
  { id: 'pop1', name: '1 万人の街', desc: '人口 1 万人', tier: 1, pts: 20, done: s => s.stats.pop >= 10000 },
  { id: 'pop3', name: '3 万人の街', desc: '人口 3 万人', tier: 2, pts: 40, done: s => s.stats.pop >= 30000 },
  { id: 'pop5', name: '5 万人の市', desc: '人口 5 万人', tier: 3, pts: 80, done: s => s.stats.pop >= 50000 },
  { id: 'pop10', name: '10 万都市', desc: '人口 10 万人', tier: 3, pts: 150, done: s => s.stats.pop >= 100000 },
  { id: 'nowait', name: '待機児童ゼロ', desc: '人口 8,000 人以上で、保育の待機児童 0 人', tier: 2, pts: 40, done: s => s.stats.pop >= 8000 && s.stats.waitlist < 0.5 },
  { id: 'sat75', name: '住みよい街', desc: '暮らしの満足 75% 以上', tier: 2, pts: 40, done: s => s.stats.pop >= 5000 && s.stats.sat >= 0.75 },
  { id: 'sat85', name: '日本一住みよい街', desc: '暮らしの満足 85% 以上', tier: 3, pts: 90, done: s => s.stats.pop >= 5000 && s.stats.sat >= 0.85 },
  { id: 'black', name: '黒字の 1 年', desc: '12 か月続けて収支が黒字', tier: 1, pts: 25, done: s => s.history.length >= 12 && s.history.slice(-12).every(h => h.op > 0) },
  { id: 'nodebt', name: '借金ゼロ', desc: '人口 8,000 人以上・4 年目以降で、市債の残高 0', tier: 3, pts: 70, done: s => s.month >= 36 && s.stats.pop >= 8000 && s.loans.every(l => l.remaining <= 0) },
  { id: 'fame30', name: '知られた街', desc: '知名度 30', tier: 1, pts: 20, done: s => (s.fame ?? 0) >= 30 },
  { id: 'fame60', name: '全国区の街', desc: '知名度 60', tier: 2, pts: 50, done: s => (s.fame ?? 0) >= 60 },
  { id: 'fame90', name: '世界に知られた街', desc: '知名度 90', tier: 3, pts: 100, done: s => (s.fame ?? 0) >= 90 },
  { id: 'tour', name: '観光の街', desc: '来訪者 月 5 万人', tier: 2, pts: 40, done: s => s.stats.visitors >= 50000 },
  { id: 'win1', name: '再選', desc: '選挙で再選する', tier: 2, pts: 50, done: s => wins(s) >= 1 },
  { id: 'win3', name: '長期市政', desc: '選挙で 3 回勝つ', tier: 3, pts: 100, done: s => wins(s) >= 3 },
  { id: 'rail', name: '鉄道のまち', desc: '駅が 2 つ以上', tier: 1, pts: 20, done: s => countOp(s, 'station') >= 2 },
  { id: 'shin', name: '新幹線の停まる街', desc: '新幹線の駅が開業', tier: 3, pts: 80, done: s => s.buildings.some(b => b.kind === 'station' && b.shin !== undefined && s.month >= b.shin) },
  { id: 'air', name: '空の玄関', desc: '空港が開港', tier: 2, pts: 50, done: s => op(s, 'airport') },
  { id: 'port', name: '海の玄関', desc: '港湾が開港', tier: 1, pts: 25, done: s => op(s, 'port') },
  { id: 'champ', name: '優勝パレード', desc: '市のプロチームが優勝', tier: 3, pts: 70, done: s => (s.teams ?? []).some(t => t.titles > 0) },
  { id: 'green', name: '緑の街', desc: '公園・庭園を 15 か所', tier: 1, pts: 25, done: s => s.buildings.filter(b => b.status === 'operating' && DEFS[b.kind].cat === 'park').length >= 15 },
  { id: 'smooth', name: '渋滞のない街', desc: '人口 1.5 万人以上で、朝の最大混雑率 80% 未満', tier: 2, pts: 40, done: s => s.stats.pop >= 15000 && s.stats.maxVc < 0.8 },
  { id: 'bousai', name: '防災の街', desc: '人口 1 万人以上で、避難所が人口の 4 割分', tier: 1, pts: 30, done: s => s.stats.pop >= 10000 && s.stats.shelterCap >= s.stats.pop * 0.4 },
  { id: 'survive', name: '災害に負けない', desc: '地震か台風を乗り越える', tier: 1, pts: 30, done: s => s.events.log.some(e => e.id === 'quake' || e.id === 'typhoon') },
  { id: 'landmark', name: 'ランドマークの街', desc: '大きな名所（1 か所だけの施設）を 3 つ', tier: 2, pts: 40, done: s => s.buildings.filter(b => b.status === 'operating' && DEFS[b.kind].unique && (DEFS[b.kind].fame ?? 0) >= 5).length >= 3 },
  { id: 'tower', name: 'タワマンの街', desc: 'タワーマンションが 5 棟', tier: 1, pts: 20, done: s => countOp(s, 'towerMansion') >= 5 },
  { id: 'missions', name: '初仕事の達人', desc: '市長の初仕事をすべて達成', tier: 2, pts: 50, done: s => (s.missions?.length ?? 0) >= 13 },
  { id: 'annex3', name: '編入の立役者', desc: '区域を 3 つ編入', tier: 1, pts: 30, done: s => (s.mayor?.annexed ?? 0) >= 3 },
  { id: 'top100', name: '全国トップ 100', desc: '全国市区町村ランキング（総合）で 100 位以内', tier: 2, pts: 60, done: s => (s.mayor?.ranks ?? []).some(r => r.total <= 100) },
  { id: 'no1', name: '全国 1 位', desc: '全国市区町村ランキングのどれかの部門で 1 位', tier: 3, pts: 120, done: s => (s.mayor?.ranks ?? []).some(r => Object.values(r.cats).some(v => v === 1)) },
];

// ---------------------------------------------------------------- 全国市区町村ランキング
export const N_CITIES = 1741; // 全国の市町村（1,718）と東京 23 区
export const RANK_CATS: { id: string; name: string; note: string }[] = [
  { id: 'live', name: '住みよさ', note: '暮らしの満足' },
  { id: 'kids', name: '子育て', note: '子育て世帯の満足と待機児童' },
  { id: 'fiscal', name: '財政の健全さ', note: '収支・公債費比率・将来負担' },
  { id: 'grow', name: '人口の伸び', note: '1 年の人口増加率' },
  { id: 'tour', name: '観光・魅力', note: '知名度と来訪者' },
  { id: 'safe', name: '安全・安心', note: '治安と避難所' },
  { id: 'move', name: '交通', note: '朝の混雑' },
];
const hash = (a: number, b: number) => { let x = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be59b, 0xc2b2ae35); x ^= x >>> 15; x = Math.imul(x, 0x27d4eb2d); x ^= x >>> 13; return ((x >>> 0) % 10000) / 10000; };
/** 部門ごとの点（0〜1、0.5 で全国の真ん中くらい） */
export function rankScores(s: GameState): Record<string, number> {
  const st = s.stats, h = s.history, ago = h.length >= 13 ? h[h.length - 13].pop : h[0]?.pop ?? st.pop;
  const grow = ago > 0 ? (st.pop - ago) / ago : 0;
  const kidsSat = ((st.satType[2] ?? st.sat) + (st.satType[3] ?? st.sat)) / 2;
  const kos = (s.fiscal?.kosai ?? 0.06) * 100, sho = (s.fiscal?.shorai ?? 0.2) * 100, op12 = h.slice(-12).reduce((a, x) => a + x.op, 0);
  const c = (v: number) => Math.max(0, Math.min(1, v));
  return {
    live: c((st.sat - 0.45) / 0.4),
    kids: c((kidsSat - 0.45) / 0.4 - Math.min(0.4, st.waitlist / Math.max(200, st.pop * 0.01))),
    fiscal: c(0.5 - (kos - 6) / 12 - (sho - 20) / 150 + (op12 > 0 ? 0 : -0.15)), // 全国平均は実質公債費比率 6%・将来負担比率 20% くらい
    grow: c(0.42 + grow * 6),
    tour: c(((s.fame ?? 0) / 100) * 0.7 + Math.min(0.3, st.visitors / 200000)),
    safe: c(0.9 - st.crime * 1.1 + (st.pop > 0 ? Math.min(0.15, st.shelterCap / (st.pop * 0.4) * 0.15) : 0) - 0.1),
    move: c(1.15 - st.maxVc * 0.5),
  };
}
/** 点から順位へ（ほかの市町村も毎年少しずつ変わる） */
function toRank(score: number, year: number, salt: number): number {
  const sc = Math.max(0, Math.min(1, score + (hash(year, salt) - 0.5) * 0.06));
  const z = (sc - 0.5) / 0.14, p = 1 / (1 + Math.exp(-1.7 * z)); // 上位ほど少ない
  return Math.max(1, Math.min(N_CITIES, Math.round(1 + (N_CITIES - 1) * (1 - p))));
}
export type RankResult = NonNullable<GameState['mayor']>['ranks'][number];
export function computeRank(s: GameState, year: number): RankResult {
  const sc = rankScores(s), cats: Record<string, number> = {};
  const off = mayorDiff(s).rank;
  RANK_CATS.forEach((c, k) => { cats[c.id] = toRank(sc[c.id] + off, year, k + 1); });
  const avg = RANK_CATS.reduce((a, c) => a + sc[c.id], 0) / RANK_CATS.length, size = Math.min(0.06, Math.log10(Math.max(1000, s.stats.pop)) / 100);
  return { year, month: s.month, total: toRank(avg + size + off, year, 99), cats, awards: [] };
}

// ---------------------------------------------------------------- 毎月
export function mayorMonthly(s: GameState): void {
  const M = s.mayor ?? (s.mayor = newMayor());
  migrateMayor(s);
  const before = levelOf(M.pts);
  // v94：再選のたびに市長ポイント（4 年の任期をまっとうした実績）
  { const w = wins(s); if (w > (M.won ?? w)) { const gp = Math.round(WIN_PTS * (w - (M.won ?? w)) * mayorDiff(s).gain); M.pts += gp; s.notes.push(`🗳 再選の実績で、市長ポイント +${gp}`); } M.won = w; }
  for (const md of MEDALS) {
    if (M.medals[md.id] !== undefined) continue;
    let ok = false; try { ok = md.done(s); } catch { ok = false; }
    if (!ok) continue;
    const gp = Math.round(md.pts * mayorDiff(s).gain); M.medals[md.id] = s.month; M.pts += gp;
    s.notes.push(`🏅 勲章「${md.name}」を受けました（${md.desc}）。市長ポイント +${gp}`);
  }
  // 年度末（3 月）に、全国市区町村ランキングの発表
  if (s.month % 12 === 11 && s.month >= 11 && !M.ranks.some(r => r.month === s.month)) {
    const year = Math.floor(s.month / 12) + 1, r = computeRank(s, year), prev = M.ranks.at(-1);
    // v94：在任の基本点 90 ＋ 順位で 0〜80（v93 までは順位で 0〜30 だけ。表彰の差が大きく、うまい人ほど一気に上がった）
    let pts = RANK_BASE + Math.round(Math.max(0, (N_CITIES - r.total) / N_CITIES) * RANK_SPAN);
    const award = (name: string, p: number, fx: () => void) => { r.awards.push(name); pts += p; fx(); };
    const mod = (key: string, opx: 'add' | 'mul', v: number, months: number, src: string) => s.modifiers.push({ key, op: opx, v, until: s.month + months, cost: 0, src });
    const cash = (v: number, why: string) => { s.cash += v; s.pending.other -= v; void why; };
    const D = mayorDiff(s);
    if (r.total <= D.top) award('全国住みよさ大賞（総理大臣表彰）', 60, () => { M.annex++; s.fame = Math.min(100, (s.fame ?? 0) + 5); cash(10000, '副賞'); mod('approval', 'add', 0.03, 12, '全国住みよさ大賞'); });
    else if (r.total <= D.good) award('優秀自治体賞（大臣表彰）', 30, () => { s.fame = Math.min(100, (s.fame ?? 0) + 2); cash(3000, '副賞'); mod('approval', 'add', 0.015, 12, '優秀自治体賞'); });
    else if (prev && prev.total - r.total >= 200) award('躍進賞', 15, () => { cash(1000, '副賞'); });
    const CAT_FX: Record<string, () => void> = {
      live: () => mod('approval', 'add', 0.01, 12, '住みよさ部門賞'), kids: () => mod('inflow', 'mul', 1.04, 12, '子育て部門賞'),
      fiscal: () => cash(2000, '財政部門賞'), grow: () => mod('inflow', 'mul', 1.03, 12, '人口の伸び部門賞'), tour: () => mod('visitors', 'mul', 1.06, 12, '観光部門賞'),
      safe: () => mod('sat:all', 'add', 0.005, 12, '安全・安心部門賞'), move: () => cash(1500, '交通部門賞'),
    };
    for (const c of RANK_CATS) if (r.cats[c.id] <= D.cat) award(`${c.name}部門賞${r.cats[c.id] === 1 ? '（全国 1 位）' : ''}`, r.cats[c.id] === 1 ? 20 : 10, CAT_FX[c.id]); // v43：50/30 → 35/20。v94：20/10（大賞 100→60・優秀賞 50→30・躍進賞 25→15）
    pts = Math.round(pts * D.gain); r.pts = pts; M.pts += pts; M.ranks.push(r); if (M.ranks.length > 40) M.ranks.splice(0, M.ranks.length - 40);
    s.notes.push(`📊 全国市区町村ランキング ${year} 年度：総合 ${r.total.toLocaleString()} 位／${N_CITIES.toLocaleString()}${r.awards.length ? `。${r.awards.join('・')}` : ''}。市長ポイント +${pts}`);
    // ランキングで取れる勲章をすぐ確かめる
    for (const md of MEDALS) if (M.medals[md.id] === undefined && (md.id === 'top100' || md.id === 'no1') && md.done(s)) { M.medals[md.id] = s.month; M.pts += Math.round(md.pts * D.gain); s.notes.push(`🏅 勲章「${md.name}」を受けました。市長ポイント +${Math.round(md.pts * D.gain)}`); }
  }
  const after = levelOf(M.pts);
  if (after > before) {
    M.annex += after - before; // レベルが上がるたびに、区域を 1 つ編入できる
    s.notes.push(`⭐ 市長レベル ${after}「${LEVELS[after - 1].title}」になりました！ 特典：${LEVELS[after - 1].perk}`);
  }
  if (!s.unlocked) M.annex = 0; // 区域の制限がない街では編入権は使わない
}
