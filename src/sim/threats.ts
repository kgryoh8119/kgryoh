// 治安の脅威（v42）：暴力団・過激派（極左・右翼）・国際テロ・カルト的な宗教団体・特殊詐欺の組織（闇の組織）と、地域の宗教団体。
// 公安と警察の情報として 0〜1 の強さで持ち、街のようすで毎月ゆっくり増減する。強いほど治安が悪くなり、できごとが起きやすい。
// 乱数の並び（rngNext）は使わない。
import type { GameState } from './types';

export type ThreatId = 'yakuza' | 'left' | 'right' | 'terror' | 'cult' | 'fraud' | 'religion';
export const THREATS: { id: ThreatId; name: string; why: string; bad: boolean }[] = [
  { id: 'yakuza', name: '暴力団', why: '歓楽街・繁華街・パチンコ・港・大きな工事の利権に入り込みます。暴力団排除の取り組みと警察で弱まります', bad: true },
  { id: 'fraud', name: '闇の組織（特殊詐欺・闇バイトの元締め）', why: '高齢者の多い街と、若者の貧しさにつけ込みます。見守りと消費生活センターで弱まります', bad: true },
  { id: 'cult', name: 'カルト的な団体（高額献金・霊感商法）', why: '孤立した人と、満足の低い街で信者を増やします。相談窓口と見守りで弱まります', bad: true },
  { id: 'left', name: '極左の過激派', why: '米軍基地・原発・自衛隊・大きな国の事業への反対運動に紛れ、妨害やゲリラ事件を起こすことがあります', bad: true },
  { id: 'right', name: '右翼団体（街宣活動）', why: '外国の領事館・外国人住民の多さ・平和運動に反発して、街宣車で大音量の演説をします', bad: true },
  { id: 'terror', name: '国際テロ組織', why: '空港・大きな駅・米軍基地・国際的な行事（万博・五輪）が狙われやすくなります。テロ対策の政策で備えます', bad: true },
  { id: 'religion', name: '地域の宗教団体（寺社・教会・新宗教）', why: '祭りや福祉で地域を支え、選挙で票をまとめる力も持ちます。政治との近すぎる関係は問題になります', bad: false },
];
export type Threats = Record<ThreatId, number>;
const h01 = (a: number) => { const v = Math.sin(a) * 43758.5453; return v - Math.floor(v); };
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const has = (s: GameState, k: string) => s.buildings.some(b => b.kind === k && b.status === 'operating');
const cnt = (s: GameState, k: string) => s.buildings.reduce((a, b) => a + (b.kind === k && b.status === 'operating' ? 1 : 0), 0);
const mAdd = (s: GameState, key: string) => s.modifiers.reduce((a, m) => a + (m.key === key && m.op === 'add' && m.until > s.month ? m.v : 0), 0) + Object.entries(s.policies ?? {}).reduce((a, [id, p]) => a + ((p as any)?.on ? (POL_EFF[id]?.[key] ?? 0) : 0), 0);
/** 政策の効き目（threat: で始まるキー）。政策の定義は config の POLICIES にあり、ここでは名前だけで引く */
const POL_EFF: Record<string, Record<string, number>> = {
  antiTerror: { 'threat:terror': 0.5, 'threat:left': 0.2 }, consumerCenter: { 'threat:cult': 0.45, 'threat:fraud': 0.35 }, kyakuhiki: { 'threat:yakuza': 0.3 }, nightPatrol: { 'threat:yakuza': 0.15 },
  koanRenkei: { 'threat:left': 0.3, 'threat:right': 0.3, 'threat:terror': 0.2, 'threat:yakuza': 0.1 }, mimamoriNet: { 'threat:fraud': 0.3, 'threat:cult': 0.15 },
};

export const threatsOf = (s: GameState): Threats => {
  const p: any = s.econ ?? (s.econ = { cycle: 0.2, fx: 135, shock: 0 });
  if (!p.threat) p.threat = { yakuza: 0.1, left: 0.05, right: 0.05, terror: 0.02, cult: 0.08, fraud: 0.1, religion: 0.3 };
  return p.threat as Threats;
};
/** 1 か月進める */
export function updateThreats(s: GameState): void {
  const T = threatsOf(s), pop = s.stats.pop, mo = s.month, sd = s.seed;
  const old = s.stats.aging ?? 0.28, sat = s.stats.sat ?? 0.6, foreign = (s.stats.foreign?.total ?? 0) / Math.max(1, pop);
  const police = (has(s, 'police') ? 1 : 0) + 0.2 * Math.min(4, cnt(s, 'koban')) + (has(s, 'kidotai') ? 0.4 : 0) + (has(s, 'policeAcademy') ? 0.15 : 0);
  const big = ['expoSite', 'stadium', 'megaPark', 'arena'].some(k => has(s, k)) || !!(s as any).pol?.bid?.won;
  // 目指す強さ（街のようす）と、対策で下がる分
  const target: Threats = {
    yakuza: 0.06 + 0.18 * Math.min(2, cnt(s, 'fuzokuDistrict')) + 0.08 * Math.min(2, cnt(s, 'nightDistrict')) + 0.03 * Math.min(4, cnt(s, 'pachinko')) + (has(s, 'casino') ? 0.15 : 0) + (has(s, 'port') ? 0.05 : 0) + (has(s, 'zenecon') ? 0.04 : 0),
    fraud: 0.08 + 0.5 * Math.max(0, old - 0.2) + (pop > 50000 ? 0.06 : 0),
    cult: 0.05 + 0.4 * Math.max(0, 0.62 - sat) + 0.05 * Math.max(0, old - 0.25) * 4,
    left: 0.02 + (has(s, 'usBase') ? 0.18 : 0) + (has(s, 'nuclear') ? 0.15 : 0) + (has(s, 'sdfBase') ? 0.06 : 0) + (has(s, 'navyBase') ? 0.06 : 0) + (has(s, 'airBase') ? 0.08 : 0) + (has(s, 'ammoDepot') ? 0.04 : 0) + (big ? 0.06 : 0) + (has(s, 'university') ? 0.03 : 0),
    right: 0.02 + (has(s, 'consulate') ? 0.12 : 0) + 0.6 * Math.max(0, foreign - 0.03) + (has(s, 'usBase') ? 0.03 : 0) + (has(s, 'sdfBase') ? 0.02 : 0),
    terror: 0.01 + (has(s, 'airport') ? 0.08 : 0) + (has(s, 'usBase') ? 0.08 : 0) + (big ? 0.12 : 0) + (has(s, 'consulate') ? 0.04 : 0) + (pop > 100000 ? 0.04 : 0) + (has(s, 'nuclear') ? 0.05 : 0),
    religion: 0.25 + 0.04 * Math.min(4, cnt(s, 'temple') + cnt(s, 'shrine') + cnt(s, 'church')) + 0.15 * Math.max(0, old - 0.2),
  };
  for (const t of THREATS) {
    const cut = t.id === 'religion' ? 0 : Math.min(0.8, mAdd(s, 'threat:' + t.id) + (t.id === 'yakuza' || t.id === 'fraud' ? 0.15 * police : 0.05 * police));
    const want = clamp(target[t.id] * (1 - cut)), noise = (h01(sd * 0.11 + mo * 2.7 + t.id.length * 9.1) - 0.5) * 0.02;
    T[t.id] = Math.round(clamp(T[t.id] + (want - T[t.id]) * 0.06 + noise) * 1000) / 1000;
  }
}
/** 治安への影響（modAdd の 'safety' に足す。マイナス） */
export function threatSafety(s: GameState): number {
  const T = (s.econ as any)?.threat as Threats | undefined; if (!T) return 0;
  return -(0.08 * T.yakuza + 0.06 * T.fraud + 0.03 * T.cult + 0.03 * T.left + 0.02 * T.right + 0.05 * T.terror);
}
export const threatLv = (s: GameState, id: ThreatId) => ((s.econ as any)?.threat?.[id] ?? 0) as number;
