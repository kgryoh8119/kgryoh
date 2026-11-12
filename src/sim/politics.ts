// 市政：議会と予算・選挙戦・メディアと SNS・国や県との交渉・季節の行事・人口動態（v28）
// 効果は s.modifiers（期限つきの効果）に積む。ここは core.ts を読み込まない（core.ts が読む側にならないよう、効果は modifiers 経由）
import type { GameState, Result, Modifier } from './types';
import { NHH } from './types';
import { P, hasOp, countOp, DEFS } from './config';
import { rngNext } from './rng';
import { levelOf } from './mayor';
import { terrainOf } from './map';
import { REAL } from './real';
const REALMAP = () => !!REAL;
import { adminMonthly, adminAct, syncRoutes, validAdmin, ADMIN_OPS } from './admin';
import { bigMonthly, bigAct, validBig, BIG_OPS } from './big';
import type { Officer, Land, Route, Cit } from './admin';

// ---------------------------------------------------------------- 状態
export type Faction = { id: string; name: string; short: string; color: string; lean: Record<string, number>; desc: string };
export const FACTIONS: Faction[] = [
  { id: 'ruling', name: '市民クラブ（市長与党）', short: '与党', color: '#2f7d5b', lean: { balanced: 0.1, growth: 0.12, welfare: 0.08, austerity: 0 }, desc: '市長を支える会派。ふだんは賛成するが、支持率が下がると離れる議員も。' },
  { id: 'cons', name: '自由保守の会', short: '保守', color: '#3a63a8', lean: { balanced: 0.05, growth: 0.15, welfare: -0.1, austerity: 0.1 }, desc: '商工会・建設業とつながる最大の会派。開発と減税に前向き、福祉の上乗せには慎重。' },
  { id: 'center', name: '公明・中道', short: '中道', color: '#c9902a', lean: { balanced: 0.1, growth: -0.02, welfare: 0.15, austerity: -0.08 }, desc: '子育てと福祉を重視する会派。キャスティングボートを握ることが多い。' },
  { id: 'opp', name: '市民ネット（野党）', short: '野党', color: '#b04a4a', lean: { balanced: -0.05, growth: -0.15, welfare: 0.12, austerity: -0.15 }, desc: '市長と対立する会派。大型開発と緊縮に反対、福祉の拡充を求める。' },
];
export type BudgetPlan = { id: string; name: string; desc: string; mods: Omit<Modifier, 'until' | 'src'>[] };
export const PLANS: BudgetPlan[] = [
  { id: 'balanced', name: '均衡予算', desc: '前の年に近い、手堅い予算。効果は特にないが、賛成を得やすい。', mods: [] },
  { id: 'growth', name: '積極予算（投資を優先）', desc: '道路・企業誘致・まちの PR に上乗せ。1 年間、転入 +3%・景気 +1%・毎月 300 万円の上乗せ。', mods: [{ key: 'inflow', op: 'mul', v: 1.03, cost: 300 }, { key: 'econ', op: 'mul', v: 1.01, cost: 0 }] },
  { id: 'welfare', name: '福祉・子育て重視の予算', desc: '保育・介護・医療に上乗せ。1 年間、子育て世帯と高齢世帯の満足が上がる。毎月 250 万円の上乗せ。', mods: [{ key: 'sat:2', op: 'add', v: 0.01, cost: 250 }, { key: 'sat:3', op: 'add', v: 0.006, cost: 0 }, { key: 'sat:4', op: 'add', v: 0.01, cost: 0 }] },
  { id: 'austerity', name: '緊縮予算（経費を削る）', desc: '事務費と維持費を 3% 削る。1 年間、暮らしの満足が少し下がる。', mods: [{ key: 'prices', op: 'mul', v: 0.97, cost: 0 }, { key: 'sat:all', op: 'add', v: -0.006, cost: 0 }] },
];
export type GrantDef = { id: string; name: string; who: string; amount: number; desc: string; need: (s: GameState) => string | null; mods: Omit<Modifier, 'until' | 'src'>[]; months: number };
export const GRANTS: GrantDef[] = [
  { id: 'kosodate', name: '子ども・子育て支援交付金', who: 'こども家庭庁', amount: 6000, months: 24, desc: '保育の受け皿づくりと子育て支援に。子育て世帯の満足が 2 年上がる。', need: s => (countOp(s, 'nursery') + countOp(s, 'kindergarten') + countOp(s, 'privNursery') >= 2 ? null : '保育園・幼稚園が 2 か所以上要ります'), mods: [{ key: 'sat:2', op: 'add', v: 0.006, cost: 0 }] },
  { id: 'sosei', name: '地方創生推進交付金', who: '内閣府', amount: 8000, months: 24, desc: '街のビジョンに沿った事業に。転入が 2 年 2% 増える。', need: s => (s.vision ? null : '中長期のビジョンを決めると申請できます'), mods: [{ key: 'inflow', op: 'mul', v: 1.02, cost: 0 }] },
  { id: 'kyojin', name: '防災・安全交付金（国土強靱化）', who: '国土交通省', amount: 10000, months: 36, desc: '堤防・避難所・耐震化に。災害の被害が 3 年 5% 小さくなる。', need: s => ((s.levee?.length ?? 0) >= 3 || countOp(s, 'shelter') + countOp(s, 'tsunamiTower') >= 1 ? null : '堤防か避難所・津波避難タワーが要ります'), mods: [{ key: 'disasterDmg', op: 'mul', v: 0.95, cost: 0 }] },
  { id: 'digital', name: 'デジタル田園都市国家構想交付金', who: 'デジタル庁', amount: 7000, months: 36, desc: '行政のデジタル化に。事務費と維持費が 3 年 1.5% 下がる。', need: s => ((s.fame ?? 0) >= 20 || hasOp(s, 'cityOS') || hasOp(s, 'globalIT') ? null : '知名度 20 以上か、都市 OS・米 IT 企業が要ります'), mods: [{ key: 'prices', op: 'mul', v: 0.985, cost: 0 }] },
  { id: 'kanko', name: '観光地域づくり補助金', who: '観光庁', amount: 5000, months: 24, desc: '名所の整備と案内に。来訪者が 2 年 3% 増える。', need: s => (s.buildings.some(b => b.status === 'operating' && ['landmark', 'history', 'leisure'].includes(DEFS[b.kind]?.cat)) ? null : '名所・歴史・レジャーの施設が要ります'), mods: [{ key: 'visitors', op: 'mul', v: 1.03, cost: 0 }] },
  { id: 'kotsu', name: '地域公共交通確保維持事業', who: '国土交通省', amount: 4000, months: 24, desc: 'バス路線の維持に。暮らしの満足が 2 年少し上がる。', need: s => ((s.busStops?.length ?? 0) >= 4 ? null : 'バス停が 4 か所以上要ります'), mods: [{ key: 'sat:all', op: 'add', v: 0.003, cost: 0 }] },
];
export type FestDef = { id: string; name: string; cal: number; cost: number; desc: string; mods: Omit<Modifier, 'until' | 'src' | 'cost'>[]; months: number; fame: number; need?: (s: GameState) => string | null; bonus?: (s: GameState) => number };
const T = (s: GameState) => terrainOf(s.seed).id;
export const FESTS: FestDef[] = [
  { id: 'seijin', name: '成人式（二十歳のつどい）', cal: 1, cost: 300, months: 2, fame: 0, desc: '1 月。二十歳を祝う式典。単身世帯の満足が少し上がる。', mods: [{ key: 'sat:0', op: 'add', v: 0.006 }] },
  { id: 'snow', name: '雪まつり', cal: 2, cost: 1200, months: 2, fame: 2, desc: '2 月。雪像とかまくら。雪の多い地形（山あい・内陸・田園）だけ。来訪者が増える。', need: s => (['mountain', 'inland', 'rural'].includes(T(s)) ? null : '雪の多い地形（山あい・内陸・田園）でだけ開けます'), mods: [{ key: 'visitors', op: 'mul', v: 1.06 }] },
  { id: 'sakura', name: '桜まつり', cal: 4, cost: 600, months: 2, fame: 1, desc: '4 月。公園と川沿いの桜の下で。公園が多いほど人が来る。', mods: [{ key: 'visitors', op: 'mul', v: 1.03 }, { key: 'sat:all', op: 'add', v: 0.003 }], bonus: s => Math.min(2, countOp(s, 'park') * 0.2) },
  { id: 'natsu', name: '夏祭り・盆踊り', cal: 8, cost: 800, months: 2, fame: 1, desc: '8 月。地区ごとの夏祭り。全世帯の満足が上がり、町内会のつながりが戻る。', mods: [{ key: 'sat:all', op: 'add', v: 0.006 }] },
  { id: 'hanabi', name: '花火大会', cal: 8, cost: 2000, months: 1, fame: 3, desc: '8 月。1 万発の花火。水辺のある地形ほど映える。知名度と来訪者が大きく伸びる。', mods: [{ key: 'visitors', op: 'mul', v: 1.08 }], bonus: s => (['coast', 'river', 'lake', 'island'].includes(T(s)) ? 2 : 0) },
  { id: 'bousai', name: '総合防災訓練', cal: 9, cost: 400, months: 12, fame: 0, desc: '9 月（防災の日）。市民・消防・自衛隊の合同訓練。1 年、災害の被害が 3% 小さくなる。', mods: [{ key: 'disasterDmg', op: 'mul', v: 0.97 }] },
  { id: 'harvest', name: '秋の収穫祭', cal: 10, cost: 500, months: 2, fame: 1, desc: '10 月。農家の直売と新米。農地が多い街ほど盛り上がる。', mods: [{ key: 'visitors', op: 'mul', v: 1.02 }, { key: 'econ', op: 'mul', v: 1.003 }], bonus: s => Math.min(2, (countOp(s, 'farm') + countOp(s, 'paddy') + countOp(s, 'field')) * 0.15) },
  { id: 'illumi', name: '冬のイルミネーション', cal: 12, cost: 900, months: 2, fame: 1, desc: '12 月。駅前通りを光で飾る。来訪者と、店の売上が少し伸びる。', mods: [{ key: 'visitors', op: 'mul', v: 1.03 }, { key: 'econ', op: 'mul', v: 1.003 }] },
];
export const calMonth = (m: number) => ((m % 12) + 3) % 12 + 1;

export type Post = { m: number; who: string; text: string; tone: 'good' | 'bad' | 'mid' };
/** 人口動態の 1 年の数（世帯の移り変わりと、転入・転出） */
export type Demo = { marry: number; birth: number; school: number; leave: number; retire: number; death: number; inHH: number; outHH: number };
export type Pol = {
  seats: number[]; rel: number[]; lobby: number[];
  plan: string; vote?: { m: number; plan: string; yes: number[]; pass: boolean }; prov?: number; councilAt?: number;
  rival?: { name: string; age: number; job: string; focus: string; term: number };
  camp?: { term: number; speech: number; ads: number; debate?: number };
  buzz: number; posts: Post[]; flame?: { id: string; m: number; text: string };
  pref: number; petition?: number; grants: Record<string, number>; apps: { id: string; m: number }[];
  fests: string[];
  demo: Demo; demoHist: (Demo & { y: number; pop: number })[];
  /** 災害からの復興：起きた月・種類・避難した世帯・選んだ計画・終わる月 */
  mstyle?: string; pet?: { id: string; m: number; who: string; ask: string; cost: number }; petYes?: number;
  rec?: { m: number; what: string; lost: number; plan?: string; until?: number; gekijin?: boolean };
  chron?: { m: number; t: string }[];
  exec?: (Officer | null)[]; land?: Land; routes?: Route[]; cit?: Cit[]; citId?: number; hero?: number; rivalCity?: number; ahead?: boolean;
};
const zeroDemo = (): Demo => ({ marry: 0, birth: 0, school: 0, leave: 0, retire: 0, death: 0, inHH: 0, outHH: 0 });
export const councilSize = (s: GameState) => (s.stats.pop < 15000 ? 18 : s.stats.pop < 40000 ? 24 : 30);
function seatsFor(n: number, share: number[]): number[] { const raw = share.map(v => v * n), out = raw.map(Math.floor); let left = n - out.reduce((a, b) => a + b, 0); const ord = raw.map((v, i) => [v - Math.floor(v), i]).sort((a, b) => b[0] - a[0]); for (let k = 0; left > 0; k++, left--) out[ord[k % ord.length][1]]++; return out; }
export function polOf(s: GameState): Pol {
  if (!s.pol) s.pol = { seats: seatsFor(councilSize(s), [0.34, 0.28, 0.14, 0.24]), rel: [0.75, 0.5, 0.5, 0.3], lobby: [-99, -99, -99, -99], plan: 'balanced', buzz: 0, posts: [], pref: 0.5, grants: {}, apps: [], fests: ['seijin', 'natsu'], demo: zeroDemo(), demoHist: [] };
  return s.pol as Pol;
}
const mod = (s: GameState, m: Omit<Modifier, 'until' | 'src' | 'cost'> & { cost?: number }, months: number, src: string) => s.modifiers.push({ key: m.key, op: m.op, v: m.v, cost: m.cost ?? 0, until: s.month + months, src });
const note = (s: GameState, t: string) => s.notes.push(t);
const pick = <X,>(s: GameState, a: readonly X[]) => a[Math.floor(rngNext(s) * a.length) % a.length];
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

// ---------------------------------------------------------------- 議会と予算
/** 会派ごとに賛成しそうな割合（0〜1） */
export function factionYes(s: GameState, k: number, plan: string): number {
  const p = polOf(s), f = FACTIONS[k], appr = s.approval ?? 0.5;
  const fiscal = s.fiscal?.status === 'rebuild' ? -0.2 : s.fiscal?.status === 'early' ? -0.08 : 0;
  const base = k === 0 ? 0.85 + 0.5 * (appr - 0.5) : 0.5 + 0.7 * (appr - 0.5) + (k === 3 ? -0.2 : 0);
  return clamp(base + 0.5 * (p.rel[k] - 0.5) + (f.lean[plan] ?? 0) + fiscal + (plan === 'austerity' && s.fiscal?.status !== 'ok' ? 0.2 : 0));
}
export function voteForecast(s: GameState, plan: string): { yes: number[]; total: number; need: number } {
  const p = polOf(s), yes = p.seats.map((n, k) => Math.round(n * factionYes(s, k, plan))), total = p.seats.reduce((a, b) => a + b, 0);
  return { yes, total, need: Math.floor(total / 2) + 1 };
}
function runBudget(s: GameState): void {
  const p = polOf(s), fc = voteForecast(s, p.plan);
  // 当日の議場：会派ごとに 1 人前後ぶれる
  const yes = fc.yes.map((v, k) => clamp(Math.round(v + (rngNext(s) - 0.5) * 2.2), 0, p.seats[k]));
  const sum = yes.reduce((a, b) => a + b, 0), pass = sum >= fc.need, d = PLANS.find(x => x.id === p.plan) ?? PLANS[0];
  p.vote = { m: s.month, plan: d.id, yes, pass };
  if (pass) {
    for (const m of d.mods) mod(s, m, 12, `${d.name}（議会で可決）`);
    p.prov = undefined;
    note(s, `🏛 3 月議会：新年度の「${d.name}」が可決されました（賛成 ${sum}／${fc.total}）`);
  } else {
    p.prov = s.month + 3;
    mod(s, { key: 'approval', op: 'add', v: -0.02 }, 6, '予算案の否決');
    note(s, `🏛 3 月議会：新年度の「${d.name}」が否決されました（賛成 ${sum}／${fc.total}）。3 か月は暫定予算です。会派と話し合い、修正した予算を出し直しましょう`);
  }
}
function runCouncilElection(s: GameState): void {
  const p = polOf(s), appr = s.approval ?? 0.5, n = councilSize(s);
  const r0 = clamp(0.16 + 0.42 * appr + (rngNext(s) - 0.5) * 0.08, 0.12, 0.6), rest = 1 - r0;
  const others = [0.4 + (rngNext(s) - 0.5) * 0.1, 0.22, 0.38 - 0.3 * (appr - 0.5)], tot = others.reduce((a, b) => a + b, 0);
  p.seats = seatsFor(n, [r0, ...others.map(v => (rest * v) / tot)]);
  p.councilAt = s.month;
  note(s, `🗳 市議会議員選挙：与党 ${p.seats[0]}・保守 ${p.seats[1]}・中道 ${p.seats[2]}・野党 ${p.seats[3]}（定数 ${n}）。支持率が高いと与党が伸びます`);
}

// ---------------------------------------------------------------- 選挙戦
const SEI = ['山田', '高木', '中川', '松井', '大野', '藤原', '石田', '上田', '森本', '桜井'], MEI = ['和夫', '直子', '健太', '由紀', '誠一', '美穂', '剛', '恵子'];
const JOBS = ['前県議会議員', '元市職員', '会社経営者', '弁護士', '元新聞記者', '市議会議員', 'NPO 代表', '医師'];
export const monthsToElection = (s: GameState) => s.termStart + s.termLength - s.month;
export const campaignOpen = (s: GameState) => s.mode === 'term' && monthsToElection(s) <= 6 && monthsToElection(s) > 0;
function rivalFocus(s: GameState): string {
  const st = s.stats, last = s.ledger.slice(-12), op = last.length ? last.reduce((a, l) => a + l.operating, 0) / last.length : 0;
  if (st.waitlist > 30) return '保育園の待機児童ゼロ';
  if (op < 0 || s.fiscal?.status !== 'ok' && s.fiscal) return '財政の立て直し';
  if (st.maxVc > 1.2) return '渋滞の解消と公共交通';
  if ((st.aging ?? 0) > 0.3) return '高齢者が安心できる街';
  if ((s.tax?.res ?? 1) > 1.05) return '住民税の引き下げ';
  return '市政の刷新（多選の打破）';
}
/** 選挙戦の内訳（electionOutlook に足す） */
export function campaignParts(s: GameState): { label: string; v: number }[] {
  const p = s.pol as Pol | undefined; if (!p) return [];
  const out: { label: string; v: number }[] = [], c = p.camp && p.camp.term === s.term ? p.camp : undefined;
  if (c) {
    const sp = 2.2 * (1 - Math.pow(0.7, c.speech)), ad = 1.2 * c.ads;
    if (c.speech || c.ads) out.push({ label: `選挙戦（街頭演説 ${c.speech} 回・広報 ${c.ads} 回）`, v: sp + ad });
    if (c.debate !== undefined) out.push({ label: `公開討論会の評価`, v: c.debate });
  }
  if (p.rival && p.rival.term === s.term) out.push({ label: `対立候補 ${p.rival.name} 氏の争点「${p.rival.focus}」`, v: (p.rival.focus.startsWith('市政の刷新') ? -0.5 : -1.2) * (s.term === 1 ? 0.6 : 1) }); // 1 期目は現職の実績が少ないので、争点の効き目は小さめ
  const m = s.pol?.buzz ?? 0; if (Math.abs(m) > 0.1) out.push({ label: m > 0 ? 'メディアの好意的な報道' : 'SNS の炎上・批判的な報道', v: 3 * m });
  return out;
}

// ---------------------------------------------------------------- メディアと SNS
const FLAMES: { id: string; p: (s: GameState) => number; text: string }[] = [
  { id: 'wait', p: s => (s.stats.waitlist > 60 ? 0.05 : 0), text: '「保育園落ちた、市長なにしてる」の投稿が拡散しています' },
  { id: 'tax', p: s => ((s.tax?.res ?? 1) > 1.08 ? 0.04 : 0), text: '「この街は税金が高すぎる」という動画がバズっています' },
  { id: 'jam', p: s => (s.stats.maxVc > 1.5 ? 0.03 : 0), text: '朝の大渋滞の写真が「#市長なんとかして」で広がっています' },
  { id: 'disaster', p: s => (s.events.active.some(e => ['flood', 'typhoon', 'megaQuake', 'nankai', 'linearRain'].includes(e.id)) ? 0.08 : 0), text: '災害への対応が遅いという批判が SNS に相次いでいます' },
  { id: 'scandal', p: () => 0.006, text: '市の職員の不祥事が報じられ、市長の管理責任を問う声が出ています' },
  { id: 'gaffe', p: s => (s.approval > 0.7 ? 0.006 : 0.003), text: '市長の発言の一部が切り取られ、炎上しています' },
];
export const PRESS = [
  { id: 'apologize', name: '記者会見で謝罪し、対策を示す', desc: '確実に収まる。支持は少し下がる。' },
  { id: 'rebut', name: '事実を説明し、反論する', desc: '6 割は「説明に納得」で支持が戻る。外れると火に油。' },
  { id: 'ignore', name: '静観する', desc: '半分は自然に収まる。収まらないと批判が強まる。' },
] as const;
function mediaMonthly(s: GameState): void {
  const p = polOf(s), st = s.stats, tv = hasOp(s, 'tvStation') ? 1.4 : 1;
  p.buzz *= 0.8;
  // 炎上：放っておくと 2 か月で自然に「静観」したことになる
  if (p.flame && s.month - p.flame.m >= 2) respond(s, 'ignore', true);
  if (!p.flame) for (const f of FLAMES) if (rngNext(s) < f.p(s) / tv) {
    p.flame = { id: f.id, m: s.month, text: f.text }; p.buzz = Math.max(-1, p.buzz - 0.35);
    mod(s, { key: 'approval', op: 'add', v: -0.02 }, 3, 'SNS で炎上');
    note(s, `🔥 炎上：${f.text}。対応を決めてください（市政の画面）`); break;
  }
  // 好意的な話題（バズ）：お祝い・行事・新しい名所
  const good = (s.celeb && s.celeb.month === s.month) || s.buildings.some(b => s.month - b.builtMonth <= 1 && b.builtMonth > 0 && ['landmark', 'leisure'].includes(DEFS[b.kind]?.cat));
  if (good && rngNext(s) < 0.5 * tv) {
    p.buzz = Math.min(1, p.buzz + 0.3); s.fame = Math.min(100, (s.fame ?? 0) + Math.round(2 * tv));
    mod(s, { key: 'visitors', op: 'mul', v: 1.03 }, 3, 'SNS でバズった');
    note(s, `📱 バズった：${s.cityName}${s.celeb && s.celeb.month === s.month ? `の「${s.celeb.label}」` : 'の新しい名所'}の写真が SNS で話題です（知名度 +${Math.round(2 * tv)}）`);
  }
  // タイムライン（住民の投稿）
  const P0: [boolean, string, string, Post['tone']][] = [
    [st.waitlist > 20, 'ワーママ', `保育園の申し込み、また落ちた…待機 ${Math.round(st.waitlist)} 人ってほんと？`, 'bad'],
    [st.maxVc > 1.1, '通勤の会社員', '今朝も駅前で 20 分動かず。バス路線ふやして', 'bad'],
    [st.sat >= 0.75, '引っ越してきた人', `${s.cityName}、住みやすい。公園も店も近くてよかった`, 'good'],
    [(s.fame ?? 0) > 40, '旅行好き', `週末は${s.cityName}へ。思ったより見どころが多い`, 'good'],
    [(st.aging ?? 0) > 0.28, '自治会長', '町内会の担い手がいない。若い人に来てほしい', 'mid'],
    [(s.climate?.snow ?? false), '除雪ボランティア', '大雪で通学路が埋まってる。除雪ありがとう', 'mid'],
    [s.events.active.length > 0, '地元ニュース', `${s.cityName}で${s.events.active[0] ? 'トラブル' : ''}。市の対応に注目が集まる`, 'mid'],
    [hasOp(s, 'tvStation'), 'ローカル局', `【特集】${s.cityName}の市長に聞く、これからの街づくり`, 'good'],
  ];
  const can = P0.filter(x => x[0]);
  const fresh = can.filter(x => !p.posts.slice(-2).some(q => q.who === x[1])), pool = fresh.length ? fresh : can;
  if (pool.length) { const x = pick(s, pool); p.posts.push({ m: s.month, who: x[1], text: x[2], tone: x[3] }); if (p.posts.length > 10) p.posts.shift(); }
}
export function respond(s: GameState, how: string, auto = false): Result {
  const p = polOf(s), f = p.flame; if (!f) return { ok: false, msg: '炎上している話題はありません' };
  p.flame = undefined;
  if (how === 'apologize') { mod(s, { key: 'approval', op: 'add', v: -0.006 }, 3, '記者会見で謝罪'); p.buzz = Math.min(0, p.buzz + 0.2); return { ok: true, msg: '記者会見で謝罪し、再発防止策を示しました。批判は収まりつつあります' }; }
  if (how === 'rebut') {
    if (rngNext(s) < 0.6) { mod(s, { key: 'approval', op: 'add', v: 0.012 }, 4, '説明に納得の声'); p.buzz += 0.25; return { ok: true, msg: 'データを示して説明しました。「説明に納得」の声が広がっています' }; }
    mod(s, { key: 'approval', op: 'add', v: -0.025 }, 4, '反論が火に油'); p.buzz -= 0.3; return { ok: true, msg: '反論が「開き直り」と受け取られ、批判が強まりました' };
  }
  if (rngNext(s) < 0.5) return { ok: true, msg: `${auto ? '対応しないまま 2 か月がたち、' : ''}話題は自然に収まりました` };
  mod(s, { key: 'approval', op: 'add', v: -0.02 }, 4, '炎上の長期化'); p.buzz -= 0.25;
  if (auto) note(s, '🔥 炎上に対応しないまま 2 か月。批判が強まりました');
  return { ok: true, msg: '静観しましたが、批判が強まりました' };
}

// ---------------------------------------------------------------- 国・県との交渉
export const grantChance = (s: GameState) => clamp(0.2 + 0.35 * polOf(s).pref + 0.015 * (s.mayor ? levelOf(s.mayor.pts) : 1) + 0.0015 * (s.fame ?? 0), 0.1, 0.85); // v31：20 年で 20 件を超えるほど通っていたので絞った
export const GRANT_COOL = 36, APPLY_COST = 200, PETITION_COST = 150;

// ---------------------------------------------------------------- 市長のタイプ（得意と苦手）
export const STYLES_M = [
  { id: 'kids', name: '子育て派', good: '子育て世帯の満足が上がる', bad: '景気が少し伸び悩む', mods: [{ key: 'sat:2', op: 'add', v: 0.008 }, { key: 'sat:3', op: 'add', v: 0.005 }, { key: 'econ', op: 'mul', v: 0.99 }] },
  { id: 'dev', name: '開発派', good: '建設費が 5% 安く、転入が増える', bad: '暮らしの満足が少し下がる', mods: [{ key: 'costMul', op: 'mul', v: 0.95 }, { key: 'inflow', op: 'mul', v: 1.02 }, { key: 'sat:all', op: 'add', v: -0.003 }] },
  { id: 'fiscal', name: '財政規律派', good: '事務費と維持費が 3% 下がる', bad: '支持率が少し下がる', mods: [{ key: 'prices', op: 'mul', v: 0.97 }, { key: 'approval', op: 'add', v: -0.01 }] },
  { id: 'green', name: '環境派', good: '満足と来訪者が上がる', bad: '景気が少し伸び悩む', mods: [{ key: 'sat:all', op: 'add', v: 0.004 }, { key: 'visitors', op: 'mul', v: 1.02 }, { key: 'econ', op: 'mul', v: 0.99 }] },
  { id: 'social', name: '福祉派', good: '高齢世帯の満足が上がる', bad: '経費が少し増える', mods: [{ key: 'sat:4', op: 'add', v: 0.01 }, { key: 'prices', op: 'mul', v: 1.01 }] },
  { id: 'global', name: '国際派', good: '来訪者と知名度が上がる', bad: '高齢世帯の満足が少し下がる', mods: [{ key: 'visitors', op: 'mul', v: 1.04 }, { key: 'fame', op: 'add', v: 3 }, { key: 'sat:4', op: 'add', v: -0.004 }] },
] as const;
function styleAct(s: GameState, id: string): Result {
  const d = STYLES_M.find(x => x.id === id); if (!d) return { ok: false, msg: 'そのタイプはありません' };
  const p = polOf(s); if (p.mstyle && p.mstyle !== d.id && s.month - s.termStart >= 6) return { ok: false, msg: '市長のタイプは、任期のはじめ（6 か月まで）に変えられます' };
  s.modifiers = s.modifiers.filter(m => !m.src.startsWith('市長のタイプ'));
  for (const m of d.mods) s.modifiers.push({ key: m.key, op: m.op, v: m.v, cost: 0, until: -1, src: `市長のタイプ：${d.name}` });
  p.mstyle = d.id; return { ok: true, msg: `市長のタイプを「${d.name}」にしました（得意：${d.good}／苦手：${d.bad}）` };
}

// ---------------------------------------------------------------- 住民からの陳情
const PETS = [
  { id: 'signal', who: '町内会長', ask: '交差点に信号機をつけてほしい', cost: 300, yes: [{ key: 'safety', op: 'add', v: 0.005 }], ap: 0.006 },
  { id: 'light', who: '女性の会', ask: '夜道が暗いので、街灯を増やしてほしい', cost: 200, yes: [{ key: 'safety', op: 'add', v: 0.004 }, { key: 'sat:0', op: 'add', v: 0.003 }], ap: 0.005 },
  { id: 'park', who: '子ども会', ask: '空き地を、子どもが遊べる広場にしてほしい', cost: 400, yes: [{ key: 'sat:2', op: 'add', v: 0.004 }], ap: 0.006 },
  { id: 'bus', who: '老人クラブ', ask: '病院へ行くバスを増やしてほしい', cost: 600, yes: [{ key: 'sat:4', op: 'add', v: 0.006 }], ap: 0.007 },
  { id: 'walk', who: 'PTA', ask: '通学路に歩道とガードレールをつけてほしい', cost: 500, yes: [{ key: 'sat:3', op: 'add', v: 0.005 }], ap: 0.006 },
  { id: 'shop', who: '商店会', ask: '空き店舗を埋めるための家賃補助がほしい', cost: 500, yes: [{ key: 'econ', op: 'mul', v: 1.004 }], ap: 0.004 },
  { id: 'noise', who: '住民有志', ask: '夜の騒音とごみのポイ捨てを、取り締まってほしい', cost: 150, yes: [{ key: 'sat:all', op: 'add', v: 0.002 }], ap: 0.004 },
  { id: 'event', who: '青年会', ask: '地区のお祭りに、市から協賛してほしい', cost: 250, yes: [{ key: 'sat:all', op: 'add', v: 0.002 }, { key: 'fame', op: 'add', v: 1 }], ap: 0.005 },
] as const;
function petMonthly(s: GameState): void {
  const p = polOf(s);
  if (p.pet && s.month - p.pet.m >= 3) { mod(s, { key: 'approval', op: 'add', v: -0.004 }, 6, '陳情への無回答'); note(s, `📮 「${p.pet.ask}」という陳情に答えないまま 3 か月がたち、不満の声が出ています`); p.pet = undefined; }
  const hr = (k: number) => { const v = Math.sin(s.month * 12.9898 + s.seed * 0.00137 + k * 78.233) * 43758.5453; return v - Math.floor(v); }; // 街の乱数の並びを変えない
  if (!p.pet && s.month > 3 && hr(1) < 0.06) {
    const d = PETS[Math.floor(hr(2) * PETS.length) % PETS.length], ds = ['駅前', '本町', '丘陵台', '西新町', '東台', '南原'], where = ds[Math.floor(hr(3) * ds.length) % ds.length];
    p.pet = { id: d.id, m: s.month, who: `${where}の${d.who}`, ask: d.ask, cost: d.cost };
    note(s, `📮 陳情：${where}の${d.who}から「${d.ask}」（${d.cost.toLocaleString()} 万円）。市政の画面で答えてください`);
  }
}
function petAct(s: GameState, yes: boolean, spend: (amount: number, what: string) => Result | null): Result {
  const p = polOf(s), q = p.pet; if (!q) return { ok: false, msg: 'いま届いている陳情はありません' }; const d = PETS.find(x => x.id === q.id)!;
  if (yes) { const e = spend(q.cost, '陳情への対応'); if (e) return e; for (const m of d.yes) mod(s, m, 36, `陳情「${d.ask}」`); mod(s, { key: 'approval', op: 'add', v: d.ap }, 12, '陳情に応えた'); p.pet = undefined; p.petYes = (p.petYes ?? 0) + 1; return { ok: true, msg: `陳情に応えました（${q.cost.toLocaleString()} 万円）。${q.who}から感謝の声が届いています` }; }
  mod(s, { key: 'approval', op: 'add', v: -d.ap * 0.6 }, 6, '陳情を断った'); p.pet = undefined; return { ok: true, msg: `陳情を断りました。${q.who}は残念がっています` };
}

// ---------------------------------------------------------------- 災害からの復興
export const REC_PLANS = [
  { id: 'fast', name: '早期の復旧', cost: 5000, months: 12, desc: '元の場所に、元の形で早く建て直す。避難した世帯の多くが 1 年で戻り、支持率も上がる。' },
  { id: 'resilient', name: '災害に強い街へ（強靱化）', cost: 12000, months: 24, desc: '高台への移転・堤防・耐震化と一緒に建て直す。戻るのに 2 年かかるが、10 年間、災害の被害が 15% 小さくなる。' },
  { id: 'compact', name: 'コンパクトな再建', cost: 3000, months: 18, desc: '居住誘導区域に集めて建て直す。戻る世帯は少なめだが、5 年間、事務費と維持費が下がる。' },
] as const;
/** events.ts の damage() から：大きな被害が出たら、復興の段階に入る */
export function noteDisaster(s: GameState, what: string, lost: number): void {
  if (lost < 20) return; const p = polOf(s);
  if (p.rec && !p.rec.until && s.month - p.rec.m < 6) { p.rec.lost += lost; return; }
  p.rec = { m: s.month, what, lost: Math.round(lost), gekijin: lost >= 150 };
  note(s, `🏗 災害で約 ${Math.round(lost)} 世帯が避難しました。復興の進め方を決めてください（市政の画面）${lost >= 150 ? '。激甚災害に指定され、国が復興費の半分を負担します' : ''}`);
}
function recAct(s: GameState, id: string, spend: (amount: number, what: string) => Result | null): Result {
  const p = polOf(s), r = p.rec, d = REC_PLANS.find(x => x.id === id); if (!r || r.plan) return { ok: false, msg: 'いま決める復興計画はありません' }; if (!d) return { ok: false, msg: 'その計画はありません' };
  const cost = Math.round(d.cost * (r.gekijin ? 0.5 : 1)); const e = spend(cost, d.name); if (e) return e;
  r.plan = d.id; r.until = s.month + d.months; const back = r.lost / d.months / 6; // 毎月の転入の上乗せ（世帯の割合でなく倍率で近似）
  const inK = 1 + Math.min(d.id === 'fast' ? 1 : d.id === 'resilient' ? 0.7 : 0.45, back / 10);
  mod(s, { key: 'inflow', op: 'mul', v: inK }, d.months, `${d.name}（避難した世帯が戻る）`);
  if (d.id === 'fast') mod(s, { key: 'approval', op: 'add', v: 0.02 }, 6, '早期の復旧');
  if (d.id === 'resilient') { mod(s, { key: 'disasterDmg', op: 'mul', v: 0.85 }, 120, '強靱化の復興'); s.fame = Math.min(100, (s.fame ?? 0) + 2); }
  if (d.id === 'compact') mod(s, { key: 'prices', op: 'mul', v: 0.98 }, 60, 'コンパクトな再建');
  return { ok: true, msg: `復興計画「${d.name}」を決めました（${cost.toLocaleString()} 万円${r.gekijin ? '・国が半分を負担' : ''}）。${d.months} か月で進めます` };
}
/** 年表に残す知らせ（絵文字で見分ける） */
const CHRON_RE = /^(🗳|🏛|🏆|📊|🔥|🏗|📣)/u;

// ---------------------------------------------------------------- 毎月
export function politicsMonthly(s: GameState): void {
  const p = polOf(s), cm = calMonth(s.month);
  // 3 月議会（新年度の予算）。否決のあとは、暫定予算が切れる月に出し直した予算で採決
  if (cm === 3 || (p.prov !== undefined && s.month >= p.prov)) runBudget(s);
  // 市議会議員選挙：市長の任期の中間（2 年目の 4 月）
  if (s.mode === 'term' && s.month - s.termStart === 24) runCouncilElection(s);
  // 会派との関係は、ゆっくり中ほどへ戻る
  p.rel = p.rel.map((r, k) => r + ((k === 0 ? 0.7 : k === 3 ? 0.3 : 0.5) - r) * 0.03);
  if (p.seats.reduce((a, b) => a + b, 0) !== councilSize(s) && s.month % 12 === 0) p.seats = seatsFor(councilSize(s), p.seats.map(v => v / Math.max(1, p.seats.reduce((a, b) => a + b, 0)))); // 人口で定数が変わる
  // 選挙戦：6 か月前に対立候補が名乗りを上げる
  if (s.mode === 'term' && monthsToElection(s) === 6 && !(p.rival && p.rival.term === s.term)) {
    p.rival = { name: `${pick(s, SEI)} ${pick(s, MEI)}`, age: 40 + Math.floor(rngNext(s) * 25), job: pick(s, JOBS), focus: rivalFocus(s), term: s.term };
    note(s, `📣 次の市長選挙に、${p.rival.job}の${p.rival.name}氏（${p.rival.age}）が立候補を表明しました。争点は「${p.rival.focus}」。演説や討論会で戦いましょう（市政の画面）`);
  }
  mediaMonthly(s);
  petMonthly(s);
  // 復興の完了
  if (p.rec?.until && s.month >= p.rec.until) { note(s, `🏗 ${REC_PLANS.find(x => x.id === p.rec!.plan)?.name ?? '復興'}が終わりました。街は立ち直りました`); p.rec = undefined; }
  else if (p.rec && !p.rec.plan && s.month - p.rec.m >= 12) p.rec = undefined; // 1 年決めなければ、自然に戻るのを待つ
  // 年表：大事な知らせと、選挙・人口の節目
  { const ch = p.chron ?? (p.chron = []);
    for (const n of s.notes) if (CHRON_RE.test(n) && !ch.slice(-30).some(c => c.t === n.replace(/\u0001.*$/, '').slice(0, 120))) ch.push({ m: s.month, t: n.replace(/\u0001.*$/, '').slice(0, 120) });
    const e = s.elections.at(-1); if (e && e.month === s.month) ch.push({ m: s.month, t: e.win ? `🗳 市長選挙で当選（${e.term} 期目・得票 ${e.vote.toFixed(1)}%）` : `🗳 市長選挙で落選（得票 ${e.vote.toFixed(1)}%）` });
    if (s.celeb && s.celeb.month === s.month && s.celeb.kind === 'milestone') ch.push({ m: s.month, t: `🎉 ${s.celeb.label}` });
    for (const ev of s.events.active) if (ev.start === s.month && ['quake', 'megaQuake', 'nankai', 'typhoon', 'megaRain', 'bigFire', 'flood', 'linearRain', 'ashfall'].includes(ev.id)) ch.push({ m: s.month, t: `⚠ ${({ quake: '地震', megaQuake: '大地震', nankai: '巨大地震と大津波', typhoon: '大型台風', megaRain: '大規模な水害', bigFire: '大火災', flood: '浸水', linearRain: '記録的な大雨', ashfall: '火山灰' } as Record<string, string>)[ev.id]}` });
    if (ch.length > 200) ch.splice(0, ch.length - 200); }
  // ライバルの街：人口が近い隣の市が、こちらの伸びに負けじと育つ。抜いた・抜かれたを知らせる
  if (s.neighbors?.length && !REALMAP()) {
    if (p.rivalCity === undefined) { let bi = 0; s.neighbors.forEach((n, k) => { if (Math.abs(n.pop - s.stats.pop) < Math.abs(s.neighbors[bi].pop - s.stats.pop)) bi = k; }); p.rivalCity = bi; p.ahead = s.stats.pop >= s.neighbors[bi].pop; }
    const n = s.neighbors[p.rivalCity]; if (n) {
      const gap = s.stats.pop / Math.max(1, n.pop), k = 0.0015 + 0.003 * clamp(gap - 1, -0.5, 0.6) + (Math.abs(Math.sin(s.month * 12.9898 + s.seed * 0.001)) - 0.45) * 0.002; // 乱数の並びを変えないよう、月で決まる揺らぎ
      n.pop = Math.max(1000, Math.round(n.pop * (1 + k)));
      const ahead = s.stats.pop >= n.pop;
      if (ahead !== p.ahead && s.month > 2) note(s, ahead ? `🏆 ライバルの${n.name}を人口で抜きました！（${Math.round(s.stats.pop).toLocaleString()} 人 対 ${n.pop.toLocaleString()} 人）` : `📊 ライバルの${n.name}に人口で抜かれました（${Math.round(s.stats.pop).toLocaleString()} 人 対 ${n.pop.toLocaleString()} 人）`);
      p.ahead = ahead;
    }
  }
  syncRoutes(s); adminMonthly(s); bigMonthly(s);
  // 補助金の審査（3 か月後に結果）
  for (const a of [...p.apps]) if (s.month - a.m >= 3) {
    p.apps = p.apps.filter(x => x !== a); const g = GRANTS.find(x => x.id === a.id); if (!g) continue;
    if (rngNext(s) < grantChance(s)) {
      s.cash += g.amount; s.pending.other -= g.amount; // 交付金は「その他」の収入として記録
      for (const m of g.mods) mod(s, m, g.months, g.name);
      p.pref = Math.min(1, p.pref + 0.03); s.acts.grantOk = s.month;
      note(s, `🏢 ${g.who}の「${g.name}」が採択されました。${g.amount.toLocaleString()} 万円が交付されます`);
    } else note(s, `🏢 ${g.who}の「${g.name}」は不採択でした。県との関係を深め、知名度を上げると通りやすくなります`);
  }
  p.pref = Math.max(0.2, p.pref - 0.004);
  // 季節の行事
  for (const id of p.fests) {
    const f = FESTS.find(x => x.id === id); if (!f || f.cal !== cm || f.need?.(s)) continue;
    const b = 1 + (f.bonus?.(s) ?? 0) * 0.25;
    for (const m of f.mods) mod(s, { ...m, v: m.op === 'mul' ? 1 + (m.v - 1) * b : m.v * b, cost: 0 }, f.months, f.name);
    s.modifiers.push({ key: 'fest', op: 'add', v: 0, cost: f.cost, until: s.month + 1, src: `${f.name}の開催費` });
    if (f.fame) s.fame = Math.min(100, (s.fame ?? 0) + Math.round(f.fame * b));
    if (f.id !== 'seijin' && f.id !== 'bousai') s.celeb = { kind: 'festival', month: s.month, label: f.name };
    note(s, `🎆 ${f.name}を開きました${b > 1.01 ? '（大盛況）' : ''}`);
  }
  // 人口動態：4 月に 1 年分を記録
  if (s.month % 12 === 0 && s.month > 0) { p.demoHist.push({ ...p.demo, y: Math.floor(s.month / 12), pop: Math.round(s.stats.pop) }); if (p.demoHist.length > 30) p.demoHist.shift(); p.demo = zeroDemo(); }
}
/** step.ts から：今月の世帯の移り変わり */
export function demoAdd(s: GameState, d: Partial<Demo>): void { if (!s.pol) return; const x = (s.pol as Pol).demo; for (const k of Object.keys(d) as (keyof Demo)[]) x[k] += d[k] ?? 0; }

// ---------------------------------------------------------------- 操作
export type PolAct = { type: 'pol'; op: 'railfreq' | 'tod' | 'homedoor' | 'subway' | 'bid' | 'mstyle' | 'pet' | 'recover' | 'plan' | 'lobby' | 'speech' | 'ads' | 'debate' | 'press' | 'grant' | 'petition' | 'fest' | 'appoint' | 'route' | 'unroute' | 'freq'; id?: string; n?: number };
export const POL_OPS = [...BIG_OPS, 'mstyle', 'pet', 'recover', 'plan', 'lobby', 'speech', 'ads', 'debate', 'press', 'grant', 'petition', 'fest', ...ADMIN_OPS];
export const LOBBY_COST = 200, SPEECH_COST = 100, ADS_COST = 800;
export function polAct(s: GameState, a: PolAct, spend: (amount: number, what: string) => Result | null): Result {
  const p = polOf(s);
  switch (a.op) {
    case 'plan': { const d = PLANS.find(x => x.id === a.id); if (!d) return { ok: false, msg: 'その予算案はありません' }; p.plan = d.id; return { ok: true, msg: `次の議会に出す予算案を「${d.name}」にしました` }; }
    case 'lobby': {
      const k = a.n ?? -1; if (k < 0 || k > 3) return { ok: false, msg: '会派の指定が不正です' };
      if (s.month - p.lobby[k] < 3) return { ok: false, msg: `同じ会派との意見交換は 3 か月に 1 回です（あと ${3 - (s.month - p.lobby[k])} か月）` };
      const e = spend(LOBBY_COST, '会派との意見交換'); if (e) return e;
      p.lobby[k] = s.month; p.rel[k] = Math.min(1, p.rel[k] + 0.12);
      return { ok: true, msg: `${FACTIONS[k].name}と意見交換し、地元の要望を聞きました（関係 ${Math.round(p.rel[k] * 100)}）` };
    }
    case 'speech': case 'ads': {
      if (!campaignOpen(s)) return { ok: false, msg: '選挙戦は、任期の残り 6 か月から始められます' };
      const c = p.camp && p.camp.term === s.term ? p.camp : (p.camp = { term: s.term, speech: 0, ads: 0 });
      if (a.op === 'speech') { if (c.speech >= 6) return { ok: false, msg: '街頭演説は 6 回までです' }; const e = spend(SPEECH_COST, '街頭演説'); if (e) return e; c.speech++; return { ok: true, msg: `駅前で街頭演説をしました（${c.speech} 回目）。${pick(s, ['足を止めて聞く人が増えています', '握手を求める人の列ができました', '若い人がスマホで撮影していました'])}` }; }
      if (c.ads >= 2) return { ok: false, msg: '広報・SNS 広告は 2 回までです' };
      const e = spend(ADS_COST, '広報・SNS 広告'); if (e) return e; c.ads++; return { ok: true, msg: `実績をまとめた動画とチラシで広報しました（${c.ads} 回目）` };
    }
    case 'debate': {
      if (!campaignOpen(s)) return { ok: false, msg: '公開討論会は、任期の残り 6 か月から開けます' };
      const c = p.camp && p.camp.term === s.term ? p.camp : (p.camp = { term: s.term, speech: 0, ads: 0 });
      if (c.debate !== undefined) return { ok: false, msg: '公開討論会は 1 回だけです' };
      const goals = s.goals ?? [], kept = goals.length ? goals.filter(g => goalKept(s, g.id)).length / goals.length : 0.5;
      const v = Math.round((3.5 * (kept - 0.5) + 6 * (s.stats.sat - P.voteCenter) + (rngNext(s) - 0.5) * 3) * 10) / 10;
      c.debate = Math.max(-3, Math.min(3, v));
      return { ok: true, msg: c.debate >= 1 ? `討論会では実績を数字で示し、「市長の勝ち」という声が多数でした（${c.debate > 0 ? '+' : ''}${c.debate}）` : c.debate <= -1 ? `討論会では${p.rival?.name ?? '対立候補'}氏に「${p.rival?.focus ?? '公約'}」を突かれ、苦しい答えが続きました（${c.debate}）` : `討論会は互角でした（${c.debate > 0 ? '+' : ''}${c.debate}）` };
    }
    case 'press': { if (!PRESS.some(x => x.id === a.id)) return { ok: false, msg: '対応の指定が不正です' }; return respond(s, a.id!); }
    case 'grant': {
      const g = GRANTS.find(x => x.id === a.id); if (!g) return { ok: false, msg: 'その補助金はありません' };
      const why = g.need(s); if (why) return { ok: false, msg: why };
      if (p.apps.some(x => x.id === g.id)) return { ok: false, msg: 'いま審査中です' };
      const last = p.grants[g.id]; if (last !== undefined && s.month - last < GRANT_COOL) return { ok: false, msg: `同じ補助金は ${GRANT_COOL / 12} 年に 1 回です（あと ${GRANT_COOL - (s.month - last)} か月）` };
      const e = spend(APPLY_COST, '申請の準備'); if (e) return e;
      p.grants[g.id] = s.month; p.apps.push({ id: g.id, m: s.month });
      return { ok: true, msg: `${g.who}へ「${g.name}」を申請しました。3 か月後に結果が出ます（通る見込み ${Math.round(grantChance(s) * 100)}%）` };
    }
    case 'petition': {
      if (p.petition !== undefined && s.month - p.petition < 6) return { ok: false, msg: `県への要望活動は 6 か月に 1 回です（あと ${6 - (s.month - p.petition)} か月）` };
      const e = spend(PETITION_COST, '県・国への要望活動'); if (e) return e;
      p.petition = s.month; p.pref = Math.min(1, p.pref + 0.12);
      return { ok: true, msg: `県庁と省庁を回って要望を伝えました（県・国との関係 ${Math.round(p.pref * 100)}）` };
    }
    case 'recover': return recAct(s, a.id ?? '', spend);
    case 'mstyle': return styleAct(s, a.id ?? '');
    case 'pet': return petAct(s, a.id === 'yes', spend);
    case 'fest': {
      const f = FESTS.find(x => x.id === a.id); if (!f) return { ok: false, msg: 'その行事はありません' };
      const on = !!a.n;
      if (on) { const why = f.need?.(s); if (why) return { ok: false, msg: why }; if (!p.fests.includes(f.id)) p.fests.push(f.id); }
      else p.fests = p.fests.filter(x => x !== f.id);
      return { ok: true, msg: on ? `${f.name}を毎年 ${f.cal} 月に開くことにしました（1 回 ${f.cost.toLocaleString()} 万円）` : `${f.name}をやめました` };
    }
  }
  const rb = bigAct(s, a, spend); if (rb) return rb;
  const r = adminAct(s, a, spend, () => { const f = voteForecast(s, 'balanced'); return f.yes.reduce((x, y) => x + y, 0) >= f.need; }); if (r) return r;
  return { ok: false, msg: '市政の操作が不正です' };
}
let goalKept: (s: GameState, id: string) => boolean = () => false;
/** step.ts の公約の達成判定をつなぐ（循環を避けるため） */
export function setGoalKept(f: (s: GameState, id: string) => boolean): void { goalKept = f; }

// ---------------------------------------------------------------- 人口ピラミッドと将来の推計
const AGE: [number, number][][] = [[[22, 38]], [[27, 45], [27, 45], [60, 74], [60, 74]], [[28, 40], [27, 39], [0, 5], [0, 5]], [[35, 50], [34, 48], [6, 15], [6, 15]], [[66, 90], [68, 90]]];
/** 10 歳きざみの人数（0〜9 歳 … 90 歳〜）。世帯の類型ごとの年齢の幅から */
export function pyramid(s: GameState): number[] {
  const out = new Array(10).fill(0), hh = s.stats.hhByType;
  for (let t = 0; t < NHH; t++) {
    const per = P.persons[t], spans = AGE[t], w = per / spans.length;
    for (const [a0, a1] of spans) for (let a = a0; a <= a1; a++) out[Math.min(9, Math.floor(a / 10))] += (hh[t] * w) / (a1 - a0 + 1);
  }
  return out.map(Math.round);
}
/** 転入・転出がなかったとしたら、と、いまの流れが続いたら（10・20 年後の人口と高齢化率） */
export function projection(s: GameState): { y: number; pop: number; aging: number; popFlow: number }[] {
  let hh = [...s.stats.hhByType], hf = [...hh];
  const net = (() => { const h = (s.pol as Pol | undefined)?.demoHist.at(-1); return h ? (h.inHH - h.outHH) / 12 : 0; })();
  const share = hh.map(v => v / Math.max(1, hh.reduce((a, b) => a + b, 0)));
  const out: { y: number; pop: number; aging: number; popFlow: number }[] = [];
  const step = (x: number[], flow: number) => { for (const [f, t, r] of P.transitions) { const n = x[f] * r; x[f] -= n; if (t >= 0) x[t] += n; } for (let t = 0; t < NHH; t++) x[t] = Math.max(0, x[t] + flow * share[t]); };
  for (let m = 1; m <= 240; m++) { step(hh, 0); step(hf, net); if (m % 120 === 0) { const pop = hh.reduce((a, v, t) => a + v * P.persons[t], 0), pf = hf.reduce((a, v, t) => a + v * P.persons[t], 0); out.push({ y: m / 12, pop: Math.round(pop), aging: pop > 0 ? (hh[4] * P.persons[4]) / pop : 0, popFlow: Math.round(pf) }); } }
  return out;
}

// ---------------------------------------------------------------- 保存データの検査
export function validPol(x: any): string | null {
  const isO = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v), fin = (v: unknown, a: number, b: number) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
  const arr = (v: unknown, n: number, f: (e: any) => boolean) => Array.isArray(v) && v.length <= n && v.every(f);
  if (!isO(x)) return '市政のデータが不正です';
  if (!arr(x.seats, 4, e => fin(e, 0, 60)) || x.seats.length !== 4 || !arr(x.rel, 4, e => fin(e, 0, 1)) || !arr(x.lobby, 4, e => fin(e, -99, 1e6))) return '議会のデータが不正です';
  if (typeof x.plan !== 'string' || !PLANS.some(p => p.id === x.plan)) return '予算案のデータが不正です';
  if (!fin(x.buzz, -2, 2) || !arr(x.posts, 20, e => isO(e) && typeof e.text === 'string' && e.text.length < 200 && typeof e.who === 'string' && e.who.length < 40)) return 'SNS のデータが不正です';
  if (x.flame !== undefined && !(isO(x.flame) && typeof x.flame.text === 'string' && x.flame.text.length < 200 && fin(x.flame.m, 0, 1e6))) return '炎上のデータが不正です';
  if (!fin(x.pref, 0, 1) || !isO(x.grants) || Object.keys(x.grants).length > 20 || !arr(x.apps, 10, e => isO(e) && typeof e.id === 'string' && fin(e.m, 0, 1e6))) return '補助金のデータが不正です';
  if (!arr(x.fests, 20, e => typeof e === 'string' && FESTS.some(f => f.id === e))) return '行事のデータが不正です';
  if (!isO(x.demo) || !arr(x.demoHist, 40, isO)) return '人口動態のデータが不正です';
  { const e = validAdmin(x) ?? validBig(x); if (e) return e; }
  if (x.chron !== undefined && !arr(x.chron, 200, e => isO(e) && fin(e.m, 0, 1e6) && typeof e.t === 'string' && e.t.length <= 200)) return '年表のデータが不正です';
  if (x.rec !== undefined && !(isO(x.rec) && fin(x.rec.m, 0, 1e6) && fin(x.rec.lost, 0, 1e7) && (x.rec.plan === undefined || REC_PLANS.some(p => p.id === x.rec.plan)))) return '復興のデータが不正です';
  if (x.rival !== undefined && !(isO(x.rival) && typeof x.rival.name === 'string' && x.rival.name.length < 40 && typeof x.rival.focus === 'string')) return '対立候補のデータが不正です';
  return null;
}
