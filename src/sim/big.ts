// v33：鉄道と街づくり（駅勢圏・乗降客数・混雑率・増発・TOD・ホームドア・地下鉄新線）、国際大会と万博の誘致、有名人の移住
// 状態は s.pol の rail / bids / stars に持つ。ここは core.ts を読み込まない（効果は modifiers 経由）
import type { GameState, Result, Building } from './types';
import { NHH } from './types';
import { W, DEFS, isRes, hasOp } from './config';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const hr = (s: GameState, k: number) => { const v = Math.sin(s.month * 12.9898 + s.seed * 0.00071 + k * 78.233) * 43758.5453; return v - Math.floor(v); }; // 街の乱数の並びを変えない
const note = (s: GameState, t: string) => s.notes.push(t);
const mod = (s: GameState, key: string, op: 'add' | 'mul', v: number, months: number, src: string, cost = 0) => s.modifiers.push({ key, op, v, cost, until: months < 0 ? -1 : s.month + months, src });
type Pp = { rail?: { freq: number; tod?: boolean; door?: boolean; subway?: { start: number; done?: boolean } }; bids?: Record<string, { stage: 'bid' | 'won' | 'lost' | 'held'; m: number; host?: number }>; stars?: { name: string; job: string; m: number }[] };
const P = (s: GameState) => s.pol as unknown as Pp;

// ================================================================ 鉄道と街づくり
export const CATCH = 27; // 駅勢圏（800m ≒ 27 区画）
export type StationStat = { b: Building; riders: number; hh: number; jobs: number; crowd: number; name: string };
const C = new WeakMap<GameState, { k: string; v: StationStat[] }>();
/** 駅ごとの 1 日の乗降客数と、朝の混雑率（%） */
export function stationStats(s: GameState): StationStat[] {
  const k = `${s.month}:${s.bVersion}:${P(s).rail?.freq ?? 0}`, c = C.get(s); if (c && c.k === k) return c.v;
  const st = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating');
  const freq = P(s).rail?.freq ?? 0, depot = hasOp(s, 'railDepot'), double = (s.rail ?? []).some(v => v === 2);
  const out: StationStat[] = st.map((b, n) => ({ b, riders: 0, hh: 0, jobs: 0, crowd: 0, name: n === 0 ? `${s.cityName.replace(/[市町村]$/, '')}駅` : `第 ${n + 1} 駅` }));
  for (const o of s.buildings) {
    if (o.status !== 'operating') continue; let best = -1, bd = 1e9;
    for (let i = 0; i < out.length; i++) { const d = Math.abs(out[i].b.x - o.x) + Math.abs(out[i].b.y - o.y); if (d < bd) { bd = d; best = i; } }
    if (best < 0 || bd > CATCH) continue; const w = 1 - 0.6 * (bd / CATCH); // 駅に近いほど電車を使う
    if (isRes(o.kind) && o.hh) { let n = 0; for (let t = 0; t < NHH; t++) n += o.hh[t]; out[best].hh += n; out[best].riders += n * 2.6 * w; }
    else { const j = (DEFS[o.kind].jobs ?? 0) + (DEFS[o.kind].staffReq ?? 0); out[best].jobs += j; out[best].riders += j * 1.4 * w + (DEFS[o.kind].visitors ?? 0) / 30 * 0.4; }
  }
  const cap = (double ? 2 : 1) * (1 + 0.25 * freq) * (depot ? 1.2 : 1) * (hasOp(s, 'maglevStation') ? 1.1 : 1);
  for (const x of out) { x.riders = Math.round(x.riders * (s.buildings.some(b => b.kind === 'station' && b.shin !== undefined && s.month >= b.shin) ? 1.15 : 1)); x.crowd = Math.round(clamp(x.riders / (9000 * cap), 0, 3) * 100 + 40); }
  C.set(s, { k, v: out }); return out;
}
export const FREQS = ['いまの本数', '少し増発（月 200 万円の補助）', '大幅に増発（月 500 万円）', 'ラッシュは 2 分おき（月 900 万円）'];
const FREQ_COST = [0, 200, 500, 900];
function railMonthly(s: GameState): void {
  const r = P(s).rail ?? (P(s).rail = { freq: 0 }), ss = stationStats(s); if (!ss.length) return;
  // 増発の補助（毎月の費用）と、電車が便利になると車が減る
  if (r.freq) mod(s, 'peakTrips', 'mul', 1 - 0.035 * r.freq, 1, '電車の増発', FREQ_COST[r.freq]);
  // TOD（駅前の高度利用）：駅の近くに住みたい人が増える
  if (r.tod) mod(s, 'inflow', 'mul', 1.02 + 0.004 * Math.min(5, ss.length), 1, '駅を中心にした街づくり（TOD）');
  // 満員電車：混雑率が 180% を超えると不満の声
  const worst = ss.reduce((a, x) => (x.crowd > a.crowd ? x : a), ss[0]);
  if (worst.crowd > 180 && hr(s, 41) < 0.08) note(s, `📱 「${worst.name}の朝の電車、混雑率 ${worst.crowd}%。乗れない」という投稿が広がっています。増発や車両基地で解消できます`);
  // 鉄道会社の沿線開発：乗る人が多い駅のまわりに、鉄道会社がマンションを建てる（転入が増える）
  if (ss.some(x => x.riders > 15000) && hr(s, 42) < 0.03) { mod(s, 'inflow', 'mul', 1.03, 24, '鉄道会社の沿線開発'); note(s, `🚃 鉄道会社が、${worst.name}の近くで沿線の住宅開発を始めました（2 年間、転入が増えます）`); }
  // 地下鉄の新線：着工から 5 年で開業
  if (r.subway && !r.subway.done && s.month - r.subway.start >= 60) { r.subway.done = true; mod(s, 'peakTrips', 'mul', 0.9, -1, '地下鉄の新線'); mod(s, 'inflow', 'mul', 1.04, -1, '地下鉄の新線'); s.fame = Math.min(100, (s.fame ?? 0) + 5); s.celeb = { kind: 'milestone', month: s.month, label: '地下鉄の新線が開業' }; note(s, '🚇 地下鉄の新線が開業しました！ 渋滞が減り、沿線に住みたい人が増えます'); }
}
export const SUBWAY_COST = 80000, DOOR_COST = 1500;

// ================================================================ 国際大会と万博の誘致
export type BidDef = { id: string; name: string; desc: string; cost: number; prep: number; need: (s: GameState) => string | null; venue: (s: GameState) => string | null; hold: (s: GameState) => void };
export const BIDS: BidDef[] = [
  { id: 'expo', name: '国際博覧会（万博）', desc: '世界中の国がパビリオンを出す半年間の博覧会。決まれば 5 年後に開催。会場（万博会場）を自分で建てます。', cost: 3000, prep: 60,
    need: s => (s.stats.pop >= 50000 && (s.fame ?? 0) >= 45 ? null : '人口 5 万人以上・知名度 45 以上が要ります'), venue: s => (hasOp(s, 'expoSite') ? null : '万博会場'),
    hold: s => { mod(s, 'visitors', 'mul', 1.8, 6, '万博の開催'); mod(s, 'econ', 'mul', 1.05, 18, '万博の開催'); s.fame = Math.min(100, (s.fame ?? 0) + 15); } },
  { id: 'olympic', name: 'オリンピック・パラリンピック', desc: '世界最大のスポーツの祭典。決まれば 7 年後。スタジアムと陸上競技場、体育館（アリーナ）が要ります。運営の費用もかかります。', cost: 6000, prep: 84,
    need: s => (s.stats.pop >= 80000 && (s.fame ?? 0) >= 55 ? null : '人口 8 万人以上・知名度 55 以上が要ります'), venue: s => (['stadium', 'athletics', 'arena'].every(k => hasOp(s, k as never)) ? null : 'スタジアム・陸上競技場・アリーナ'),
    hold: s => { mod(s, 'visitors', 'mul', 2.2, 2, 'オリンピックの開催'); mod(s, 'econ', 'mul', 1.06, 24, 'オリンピックの開催'); mod(s, 'approval', 'add', 0.04, 12, 'オリンピックの感動'); s.fame = Math.min(100, (s.fame ?? 0) + 20); s.cash -= 30000; s.pending.other += 30000; } },
  { id: 'worldcup', name: 'サッカー・ワールドカップの試合会場', desc: '世界大会の試合を市のスタジアムで開きます。決まれば 4 年後。スタジアムが要ります。', cost: 2000, prep: 48,
    need: s => (s.stats.pop >= 40000 && (s.fame ?? 0) >= 40 ? null : '人口 4 万人以上・知名度 40 以上が要ります'), venue: s => (hasOp(s, 'stadium') ? null : 'スタジアム'),
    hold: s => { mod(s, 'visitors', 'mul', 1.5, 1, 'ワールドカップの試合'); mod(s, 'approval', 'add', 0.02, 6, 'ワールドカップの熱狂'); s.fame = Math.min(100, (s.fame ?? 0) + 10); } },
];
export const bidChance = (s: GameState) => clamp(0.25 + 0.006 * (s.fame ?? 0) + 0.15 * ((s.pol as any)?.pref ?? 0.5), 0.1, 0.8);
function bidMonthly(s: GameState): void {
  const bs = P(s).bids; if (!bs) return;
  for (const d of BIDS) { const b = bs[d.id]; if (!b) continue;
    if (b.stage === 'bid' && s.month - b.m >= 12) { if (hr(s, 50 + d.name.length) < bidChance(s)) { b.stage = 'won'; b.host = s.month + d.prep; s.celeb = { kind: 'parade', month: s.month, label: `${d.name}の開催が決定` }; note(s, `🏆 ${d.name}の開催地に選ばれました！ ${Math.round(d.prep / 12)} 年後の開催に向けて、${d.venue(s) ? `${d.venue(s)}を用意してください` : '準備を進めましょう'}`); } else { b.stage = 'lost'; note(s, `📊 ${d.name}の誘致は、ほかの都市に敗れました。知名度と県・国との関係を高めて、また挑戦できます`); } }
    if (b.stage === 'won' && b.host !== undefined && s.month >= b.host) {
      const miss = d.venue(s);
      if (miss) { b.stage = 'lost'; mod(s, 'approval', 'add', -0.05, 12, `${d.name}の返上`); s.fame = Math.max(0, (s.fame ?? 0) - 6); note(s, `🔥 ${miss}が間に合わず、${d.name}の開催を返上しました。批判が集まっています`); }
      else { b.stage = 'held'; d.hold(s); s.celeb = { kind: 'festival', month: s.month, label: `${d.name}開幕！` }; note(s, `🎆 ${d.name}が開幕しました！ 国内外から大勢の人が訪れています`); }
    } }
}

// ================================================================ 有名人の移住（架空の人物）
const STARS = [
  { job: '人気俳優', eff: (s: GameState) => { s.fame = Math.min(100, (s.fame ?? 0) + 4); mod(s, 'visitors', 'mul', 1.04, 24, '人気俳優の移住'); } },
  { job: '登録者 300 万人の動画配信者', eff: (s: GameState) => { s.fame = Math.min(100, (s.fame ?? 0) + 5); mod(s, 'inflow:0', 'mul', 1.08, 24, '動画配信者の移住'); } },
  { job: 'ノーベル賞の研究者', eff: (s: GameState) => { s.fame = Math.min(100, (s.fame ?? 0) + 3); mod(s, 'sat:3', 'add', 0.006, 36, '研究者の移住'); } },
  { job: '元プロ野球のスター選手', eff: (s: GameState) => { s.fame = Math.min(100, (s.fame ?? 0) + 3); mod(s, 'approval', 'add', 0.01, 12, 'スター選手の移住'); } },
  { job: 'ベストセラー作家', eff: (s: GameState) => { s.fame = Math.min(100, (s.fame ?? 0) + 2); mod(s, 'visitors', 'mul', 1.03, 36, '作家の移住（聖地巡礼）'); } },
  { job: 'IT 企業の創業者', eff: (s: GameState) => { s.fame = Math.min(100, (s.fame ?? 0) + 3); mod(s, 'econ', 'mul', 1.01, 36, '起業家の移住'); } },
  { job: '世界的な料理人', eff: (s: GameState) => { s.fame = Math.min(100, (s.fame ?? 0) + 2); mod(s, 'visitors', 'mul', 1.03, 36, '料理人の店'); } },
];
const SEI = ['桐生', '朝霧', '真壁', '綾瀬', '神崎', '水無月', '白鳥', '御園', '鳳', '久遠'], MEI = ['蓮', '凛', '湊', '紬', '颯', '澪', '玲央', '詩', '晴', '結'];
function starMonthly(s: GameState): void {
  const p = P(s), want = 0.004 * (0.5 + (s.fame ?? 0) / 40) * (0.6 + s.stats.sat);
  if (s.month < 12 || hr(s, 60) >= want || (p.stars?.length ?? 0) >= 8) return;
  const d = STARS[Math.floor(hr(s, 61) * STARS.length) % STARS.length], name = `${SEI[Math.floor(hr(s, 62) * SEI.length) % SEI.length]} ${MEI[Math.floor(hr(s, 63) * MEI.length) % MEI.length]}`;
  if (p.stars?.some(x => x.name === name)) return;
  (p.stars ?? (p.stars = [])).push({ name, job: d.job, m: s.month }); d.eff(s);
  s.celeb = { kind: 'milestone', month: s.month, label: `${d.job}の${name}さんが移住` };
  note(s, `🌟 ${d.job}の${name}さん（架空の人物）が、${s.cityName}に移り住みました！ SNS で話題になり、知名度が上がっています`);
}

// ================================================================ 毎月・操作・検査
export function bigMonthly(s: GameState): void { if (!s.pol) return; railMonthly(s); bidMonthly(s); starMonthly(s); }
export const BIG_OPS = ['railfreq', 'tod', 'homedoor', 'subway', 'bid'];
export function bigAct(s: GameState, a: { op: string; id?: string; n?: number }, spend: (amount: number, what: string) => Result | null): Result | null {
  const p = P(s), r = p.rail ?? (p.rail = { freq: 0 }), hasSt = s.buildings.some(b => b.kind === 'station' && b.status === 'operating');
  if (a.op === 'railfreq') { if (!hasSt) return { ok: false, msg: '駅がありません' }; r.freq = clamp(a.n ?? 0, 0, 3); return { ok: true, msg: `鉄道会社に「${FREQS[r.freq]}」を要請しました` }; }
  if (a.op === 'tod') { if (!hasSt) return { ok: false, msg: '駅がありません' }; r.tod = !r.tod; return { ok: true, msg: r.tod ? '駅を中心にした街づくり（TOD：駅前の容積率の緩和と、駅から歩ける住まい）を始めました' : 'TOD をやめました' }; }
  if (a.op === 'homedoor') { if (!hasSt) return { ok: false, msg: '駅がありません' }; if (r.door) return { ok: false, msg: 'もう設置しました' }; const e = spend(DOOR_COST, 'ホームドア'); if (e) return e; r.door = true; mod(s, 'safety', 'add', 0.006, -1, 'ホームドア'); mod(s, 'approval', 'add', 0.008, 12, 'ホームドアの設置'); return { ok: true, msg: 'すべての駅にホームドアを付けました。転落事故が減り、安心して乗れます' }; }
  if (a.op === 'subway') {
    if (r.subway) return { ok: false, msg: r.subway.done ? '地下鉄はもう開業しています' : '地下鉄は工事中です' };
    if (s.stats.pop < 70000) return { ok: false, msg: '地下鉄の新線には、人口 7 万人以上が要ります' };
    const cost = Math.round(SUBWAY_COST * 0.5); const e = spend(cost, '地下鉄の新線（国と県が半分を負担）'); if (e) return e;
    r.subway = { start: s.month }; return { ok: true, msg: `地下鉄の新線に着工しました（${cost.toLocaleString()} 万円・国と県が半分を負担）。5 年で開業します` };
  }
  if (a.op === 'bid') {
    const d = BIDS.find(x => x.id === a.id); if (!d) return { ok: false, msg: 'その大会はありません' };
    const bs = p.bids ?? (p.bids = {}), cur = bs[d.id]; if (cur && (cur.stage === 'bid' || cur.stage === 'won')) return { ok: false, msg: cur.stage === 'bid' ? 'いま選考中です' : 'もう開催が決まっています' };
    if (cur && cur.stage === 'held') return { ok: false, msg: 'もう開催しました' };
    if (cur && s.month - cur.m < 48) return { ok: false, msg: `次の立候補は 4 年後です（あと ${48 - (s.month - cur.m)} か月）` };
    const why = d.need(s); if (why) return { ok: false, msg: why };
    const e = spend(d.cost, `${d.name}の招致活動`); if (e) return e;
    bs[d.id] = { stage: 'bid', m: s.month }; return { ok: true, msg: `${d.name}に立候補しました（${d.cost.toLocaleString()} 万円）。1 年後に開催地が決まります（見込み ${Math.round(bidChance(s) * 100)}%）` };
  }
  return null;
}
export function validBig(x: any): string | null {
  const isO = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (x.rail !== undefined && !(isO(x.rail) && typeof x.rail.freq === 'number' && x.rail.freq >= 0 && x.rail.freq <= 3)) return '鉄道のデータが不正です';
  if (x.bids !== undefined && !(isO(x.bids) && Object.keys(x.bids).length <= 5 && Object.values(x.bids).every((b: any) => isO(b) && ['bid', 'won', 'lost', 'held'].includes(b.stage)))) return '誘致のデータが不正です';
  if (x.stars !== undefined && !(Array.isArray(x.stars) && x.stars.length <= 8 && x.stars.every((v: any) => isO(v) && typeof v.name === 'string' && v.name.length < 30))) return '移住した人のデータが不正です';
  return null;
}
void W;
