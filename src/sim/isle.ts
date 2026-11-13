// v88：無人島（特別シナリオ）。外とつながっていない島に、桟橋と定期船で開拓者を呼び、水・電気・食べ物・住まいをゼロから整える。
// 既存の仕組み（接続・水道・電力・世帯の転入・財政）にそのままつなぐ。島だけの値は「食料の自給率」と「船便の運賃」だけ。
import { W, H, P } from './config';
import { idx, inMap, isCastaway } from './map';
import type { GameState, Kind } from './types';

/** 定期船が着く施設（ここに面した道路が島の外への出入口になる） */
export const SHIP_KINDS = new Set<Kind>(['pier', 'port', 'fishPort', 'cruisePier']);
/** 島の食べ物をつくる施設（設計容量は「世帯分」） */
const FOOD_KINDS = new Set<Kind>(['kaitakuFarm', 'fishRaft']);
/** 船で運ぶ食べ物の運賃（万円/世帯/月）。島で採れない分だけかかる */
export const SHIP_FOOD = 0.6;

/** 桟橋・港に面した道路の区画（操業中のものだけ）。道路でここにつながれば島の外とつながる */
export function shipGates(s: GameState): number[] {
  if (!isCastaway(s.seed)) return [];
  const out: number[] = [];
  for (const b of s.buildings) {
    if (!SHIP_KINDS.has(b.kind) || b.status !== 'operating') continue;
    for (let dy = -1; dy <= b.h; dy++) for (let dx = -1; dx <= b.w; dx++) {
      if ((dx < 0 || dx >= b.w) === (dy < 0 || dy >= b.h)) continue; // 四辺に接する区画だけ（角は除く）
      const x = b.x + dx, y = b.y + dy; if (!inMap(x, y)) continue;
      const i = idx(x, y); if (s.road[i] && !out.includes(i)) out.push(i);
    }
  }
  return out;
}
/** 本土と道路（橋・海底トンネル）でつながったか：地図の端の国道の出入口まで道路がある */
export const mainlandLinked = (s: GameState, gates: number[]) => gates.some(g => !!s.road[g]);

/** 食料の自給率（0〜1）と、足りない分の世帯数 */
export function foodSelf(s: GameState): { self: number; short: number; made: number } {
  const hh = s.stats.households;
  let made = 0; for (const b of s.buildings) if (FOOD_KINDS.has(b.kind)) made += b.effCap * (s.climate?.crop ?? 1);
  if (hh <= 0) return { self: 1, short: 0, made };
  return { self: Math.min(1, made / hh), short: Math.max(0, hh - made), made };
}
/** 島の毎月の上乗せの支出（万円）：食べ物の船便の運賃。台風で船が止まった月は割高 */
export function isleCost(s: GameState): number {
  if (!isCastaway(s.seed)) return 0;
  const f = foodSelf(s), storm = (s.modifiers ?? []).some(m => m.key === 'shipStop' && (m.until < 0 || m.until > s.month));
  return f.short * SHIP_FOOD * (storm ? 1.8 : 1);
}

/** 島の役場の基礎の費用と、交付税の基礎の分の倍率（小さな村から始まり、8,000 人でふつうの街と同じ） */
export const isleK = (s: GameState) => isCastaway(s.seed) ? 0.06 + 0.94 * Math.min(1, s.stats.pop / 8000) : 1;
/** 国の離島開拓の交付金（万円/月）。はじめの 10 年 */
export const ISLE_GRANT = 450;
export const isleGrant = (s: GameState) => isCastaway(s.seed) && s.month < 120 ? ISLE_GRANT : 0;
/** 開拓の段階：次にすることを 1 つ（課題の表示と初仕事に使う） */
export interface IsleStep { key: string; title: string; how: string; kind: Kind | null; reward: number; done: (s: GameState) => boolean }
const op = (s: GameState, ...k: Kind[]) => s.buildings.some(b => k.includes(b.kind) && b.status === 'operating');
const opConn = (s: GameState, ...k: Kind[]) => s.buildings.some(b => k.includes(b.kind) && b.status === 'operating' && b.connected);
export const ISLE_STEPS: IsleStep[] = [
  { key: 'pier', title: '上陸：桟橋をつくる', how: '［施設を建てる］→［交通・広域］→ 桟橋を、南の入り江など海に面した所に。定期船が着くようになります', kind: 'pier', reward: 800, done: s => op(s, ...SHIP_KINDS) },
  { key: 'road', title: '桟橋から道を通す', how: '［道路を引く］→［生活道路］を、桟橋の横からのばします。桟橋に道路でつながった区画だけが使えます', kind: null, reward: 300, done: s => shipGates(s).length > 0 },
  { key: 'water', title: '水を確保する：井戸か雨水タンク', how: '［施設を建てる］→［水道・電気・ガス・ごみ］で井戸か雨水タンクを、桟橋につながった道路に面した所に。沢の近くなら簡易浄水施設も', kind: 'well', reward: 400, done: s => s.stats.waterCap >= 10 },
  { key: 'power', title: '電気を起こす：発電機か太陽光', how: '同じメニューのディーゼル発電機（すぐ使えるが燃料が高い）か、太陽光パネルと蓄電池（維持費が安い）を', kind: 'solarKit', reward: 600, done: s => s.stats.powerCap >= 10 },
  { key: 'home', title: '住まい：開拓小屋を建てる', how: '［施設を建てる］→［住まい］で開拓小屋を、桟橋につながった道路沿いに。定期船で開拓者が移ってきます', kind: 'kaitaku', reward: 500, done: s => s.buildings.some(b => b.kind === 'kaitaku' && b.status === 'operating' && b.connected) },
  { key: 'food', title: '食べ物：畑か漁船だまり', how: '［施設を建てる］→［農林水産］で開拓の畑か、漁船だまりと養殖いかだを。島で採れない食べ物は船で運ぶので、その運賃が毎月かかります', kind: 'kaitakuFarm', reward: 600, done: s => opConn(s, 'kaitakuFarm', 'fishRaft') },
  { key: 'tel', title: '通信と急病：無線中継塔と診療所', how: '無線中継塔で本土と連絡でき、診療所かヘリポートで急病に備えます', kind: 'musenTower', reward: 800, done: s => op(s, 'musenTower', 'cellTower', 'telecomHub') && op(s, 'clinic', 'heliport', 'hospital', 'nightClinic') },
  { key: 'waste', title: 'ごみを島で処理する', how: '小型焼却炉を、住宅から少し離れた所に', kind: 'miniIncin', reward: 800, done: s => s.stats.wasteCap > 0 && s.stats.wasteCap >= s.stats.wasteDemand },
  { key: 'grow', title: '島を育てる：港・観光・本土への橋', how: '人口が増えたら住宅の用途を指定して民間の家を呼び、海水淡水化プラントや港、海水浴場で観光客を。いつか本土へ橋をかければ、ふつうの街になります', kind: null, reward: 5000, done: s => s.stats.pop >= 3000 },
];
export const isleSteps = (s: GameState) => ISLE_STEPS.map(x => ({ ...x, ok: x.done(s) }));
export const isleNext = (s: GameState) => ISLE_STEPS.find(x => !x.done(s)) ?? null;

/** 無人島の初期状態：道路も建物もない。資金は少なめで、国の離島開拓の交付金（毎月の交付税の上乗せ）がある */
export function startCastaway(s: GameState): void {
  s.cash = Math.round(P.startCash * 0.45);
  s.rail = new Array(W * H).fill(0); s.railGrade = new Array(W * H).fill(0); s.railCity = [];
  // 島の家は浄化槽（2,000 世帯分まで下水道は要らない）・プロパンガス（船で運ぶ）。電気・水・通信は島でつくる
  s.base = { power: 0, sewage: 2000, gas: 1e6, telecom: 0 };
  s.inflowFactor = 0.6; s.fame = 3;
  s.neighbors = s.neighbors.map(n => ({ ...n, rel: 0.3 }));
  s.modifiers.push({ key: 'transfer', op: 'mul', v: 1.3, until: -1, cost: 0, src: '離島振興の交付税の加算' });
  s.tutorial.done = true; // ふつうの街の案内（駅前の開発）は出さず、開拓の段階を課題で案内する
}
