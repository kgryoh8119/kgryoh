// CPU のオートプレイ：市長の代わりに、毎月の状況を見て手を打つ。
// 判断は「足りないものを順に埋める」単純な規則。乱数は使わず、同じ状態なら同じ判断をする（シミュレーションの乱数を消費しない）。
import {
  W, H, P, DEFS, GOALS, voteText, POLICIES, AIR_ROUTES, VISION_PERKS, VISIONS, airportUpCheck, airRouteCheck, floodRisk, isCanal, isJunction, isRes, isCity, idx, getMap, buildable, roadInfo, checkPlace, dispatch, sumHH, monthlyBudget, staffReq, fam, DISTRICTS, rerunCheck, teamCheck, SPORTS, stationDist, buyoutCost, SV_NAMES, upgradeCost, bondCap, goalProgress, tempDebt, stationUpCheck, shinCheck, REAL, NIMBY,
} from './sim/index';
import type { GameState, Kind, Action, Zone } from './sim/index';
import { annexable, blockRect, blockName, SISTERS, SIS, MAX_SISTERS, GRANTS, PLANS, voteForecast, campaignOpen, calMonth, POSTS, candidates, execOf, roadPath } from './sim/index';
import { findCandidates, hasCandidates } from './ui/candidates';
import { planRedevelop } from './devplan';
import { cityPlan, roleAt, ROLE } from './cityplan';

export interface AutoNote { month: number; text: string }
/** オートへの作戦（命令）。0 どんどん攻めろ／1 バランスよく（何も指定しないとき）／2 財布だいじに。
 *  手元に残すお金・市債をどこまで使うか・月に打つ手の数・急がない施設を借金で建てるかが変わる */
export const AUTO_ORDERS = [
  { name: 'どんどん攻めろ', icon: '🔥', short: '借りてでも早く育てる', note: '手元資金は少なめ、市債は上限いっぱいまで。急がない施設も借りて建て、月に打つ手も増やします。街は早く育ちますが、赤字や不況に弱くなります' },
  { name: 'バランスよく', icon: '⚖️', short: '返せる範囲で順に', note: '足りないものから順に。借金は急ぐもの（水道・保育・学校など）を中心に、返せる範囲で' },
  { name: '財布だいじに', icon: '🛡️', short: '貯えを厚く、借金は控えめ', note: '手元資金を厚く残し、市債は上限の 6 割まで。黒字に余裕がないと急がない施設は建てず、標準より下への減税もしません。育ちはゆっくりですが、つぶれにくい運営です' },
] as const;

const N = () => W * H;
const nm = (k: Kind) => DEFS[k].name;
const where = (s: GameState, x: number, y: number) => DISTRICTS[getMap(s.seed).district[idx(x, y)]] ?? '';

/** 公約・できごと・選挙結果など、時間を止めているものに答える */
export function autoResolve(s: GameState): string[] {
  const out: string[] = [];
  if (s.pendingElection) { const e = s.pendingElection; out.push(e.win ? `選挙で再選されました（得票 ${voteText(e.vote)}%）` : `選挙で落選しました（得票 ${voteText(e.vote)}%）。サンドボックスで街づくりを続けます`); s.pendingElection = null; }
  if (s.mode === 'term' && s.goalPick) {
    // 公約：オートが確実に追い込めるものを選ぶ。落選した任期を調べると「待機児童をなくす」「水道をよみがえらせる」を取りこぼして
    // いたので、見込みで点をつける（財政・人口・職は街を育てる方針と同じ向き。待機と水道は、いまの状態で届きそうなときだけ）
    const ok = (id: string) => { const g = GOALS.find(o => o.id === id)!, v = g.value(s), tg = g.target(s); return g.lower ? v <= tg : v >= tg; };
    // 人口の伸び（直近 4 年）。伸びが止まった街で「人口を増やす」は取れない
    const hp = s.history, past = hp.length > 48 ? hp[hp.length - 49].pop : hp[0]?.pop ?? s.stats.pop, grow = s.month < 12 ? 0.2 : s.stats.pop / Math.max(1, past) - 1;
    const opNow = (() => { const l = s.ledger.slice(-6); return l.length ? l.reduce((a, x) => a + x.operating, 0) / l.length : 0; })();
    const waters = s.buildings.filter(b => b.kind && DEFS[b.kind].fam === 'water' && b.status !== 'construction');
    const waterCost = waters.filter(b => b.age + DEFS[b.kind].ageRate * s.termLength >= 38).reduce((a, b) => a + DEFS[b.kind].renewCost, 0);
    const score: Record<string, number> = {
      fiscal: 3, pop: grow >= 0.2 ? 2.6 : grow >= 0.13 ? 1.6 : 0.7, // v86：公約が 1.15 倍になったので、見込みの線も上げた jobs: s.stats.localJobs < s.stats.workers * 0.9 && grow >= 0.06 ? 2.3 : 1.0,
      taxcut: s.tax.res <= 0.95 && opNow > 300 ? 2.5 : 0.3, // すでに 5% 下げていれば「維持」で取れる
      wait: s.stats.waitlist <= P.pledgeWait * 3 ? 2.4 : 0.8,
      water: waterCost <= 12000 ? 2.2 : 0.6,
      edu: s.stats.lv[6] >= 0.9 ? 1.8 : 0.5,
    };
    const ids = Object.keys(score).sort((a, b) => score[b] - score[a] || (ok(a) ? 1 : 0) - (ok(b) ? 1 : 0)).slice(0, 3);
    const r = dispatch(s, { type: 'goals', ids, vision: s.vision ? undefined : 'industry' }); // ビジョンは「産業と雇用の街」（職・人口・財政。オートの街の育て方と同じ向き）
    out.push(r.ok ? `公約を選びました：${ids.map(id => GOALS.find(g => g.id === id)!.name).join('・')}` : r.msg);
  }
  return out;
}

/** できごとの選び方：資金の 4 分の 1 以内で払える最初の選択肢（たいてい手厚い対応）、なければいちばん安いもの */
export function autoEvent(s: GameState, eventDef: (id: string) => { title: string; options: { label: string; cost: number }[] }): string[] {
  const out: string[] = [];
  for (const ev of [...s.events.active]) {
    const d = eventDef(ev.id);
    // 大きな災害は、救助と復旧を手厚くするほうが満足と支持率を守れる（資金の 7 割まで使う）。ほかは資金の 4 分の 1 まで
    const big = ['megaQuake', 'megaRain', 'quake', 'linearRain', 'typhoon', 'teamRelocate', 'teamStar', 'teamParade'].includes(ev.id);
    let k = d.options.findIndex(o => o.cost <= Math.max(0, s.cash) * (big ? 0.7 : 0.25));
    if (k < 0) { k = 0; d.options.forEach((o, i) => { if (o.cost < d.options[k].cost) k = i; }); }
    const r = dispatch(s, { type: 'event', id: ev.id, option: k });
    out.push(r.ok ? `「${d.title}」→ ${d.options[k].label}` : `「${d.title}」に対応できませんでした：${r.msg}`);
  }
  return out;
}

/** 住民の多い所に近い、置ける場所 */
export function findSpot(s: GameState, kind: Kind, weight?: (b: any) => number, opt: { districts?: number[] } = {}): { x: number; y: number } | null {
  const nimby = NIMBY[kind], dm = getMap(s.seed).district;
  if (!weight && !nimby && !opt.districts && hasCandidates(kind)) { const cash = s.cash; s.cash = 1e12; try { const c = findCandidates(s, kind, 1)[0]; if (c) return { x: c.x, y: c.y }; } finally { s.cash = cash; } }
  const d = DEFS[kind], w = new Float64Array(N()), m = getMap(s.seed), conn = roadInfo(s).conn;
  const fw = weight ?? (nimby ? (b: any) => sumHH(b) + 1 : null) ?? (kind === 'nursery' || kind === 'nurseryS' || kind === 'nurseryL' ? (b: any) => b.unmet + sumHH(b) * 0.02 : (b: any) => sumHH(b));
  for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating') w[idx(b.x, b.y)] += fw(b);
  const r = Math.max(8, Math.round(Math.min(W, H) / 5)), S = new Float64Array((W + 1) * (H + 1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) S[(y + 1) * (W + 1) + x + 1] = w[y * W + x] + S[y * (W + 1) + x + 1] + S[(y + 1) * (W + 1) + x] - S[y * (W + 1) + x];
  const fw0 = (x0: number, y0: number, x1: number, y1: number) => box(x0, y0, x1, y1) * 1;
  const box = (x0: number, y0: number, x1: number, y1: number) => { x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1); return S[y1 * (W + 1) + x1] - S[y0 * (W + 1) + x1] - S[y1 * (W + 1) + x0] + S[y0 * (W + 1) + x0]; };
  // 先に安い確認：敷地が空いていて、まわりに市外までつながる道路がある所だけ
  const okLot = (x: number, y: number) => {
    for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) { const i = idx(x + dx, y + dy); if (s.occ[i] || s.road[i] || !buildable(m, i) || (s.rail?.[i] && s.railGrade?.[i] !== 2)) return false; }
    for (let k = -1; k <= Math.max(d.w, d.h); k++) for (const [xx, yy] of [[x + k, y - 1], [x + k, y + d.h], [x - 1, y + k], [x + d.w, y + k]]) if (xx >= 0 && yy >= 0 && xx < W && yy < H && s.road[idx(xx, yy)] && conn[idx(xx, yy)]) return true;
    return false;
  };
  const order: [number, number][] = [];
  for (let y = 0; y + d.h <= H; y++) for (let x = 0; x + d.w <= W; x++) {
    if (opt.districts && !opt.districts.includes(dm[idx(x, y)])) continue;
    if (!okLot(x, y)) continue;
    // 迷惑施設は、住宅が少なく、計画で産業の地区にした所ほど先に（近くの住民が嫌がるため）
    if (nimby && !weight) { const R = nimby[1] + 1; order.push([-fw0(x - R, y - R, x + d.w + R, y + d.h + R) + (roleAt(s, idx(x, y)) === ROLE.industry ? 1e6 : 0), idx(x, y)]); continue; }
    order.push([box(x - r, y - r, x + d.w + r, y + d.h + r), idx(x, y)]);
  }
  order.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  let checks = 0;
  const cash = s.cash; s.cash = 1e12; // 場所だけを確かめる（お金は建てる前に用意する）
  try {
    for (const [, i] of order) {
      if (checks++ > 60) break;
      const x = i % W, y = (i / W) | 0, c = checkPlace(s, kind, x, y);
      if (c.ok && !c.acq.length && !c.reasons.some(t => /道路に接していません|つながっていません/.test(t))) return { x, y };
    }
  } finally { s.cash = cash; }
  return null;
}

/** 住宅を買い取れば建てられる場所：敷地が空き地と 1 区画の住宅だけで、市外までつながる道路に面している所。住民の多い所に近く、買収の安い順 */
function findBuyLot(s: GameState, kind: Kind, weight?: (b: any) => number): { x: number; y: number; ids: number[]; cost: number } | null {
  const d = DEFS[kind], m = getMap(s.seed), conn = roadInfo(s).conn, byId = new Map(s.buildings.map(b => [b.id, b] as const));
  const c = cityCenter(s); let best: { x: number; y: number; ids: number[]; cost: number; score: number } | null = null;
  for (let y = 0; y + d.h <= H; y++) for (let x = 0; x + d.w <= W; x++) {
    const ids = new Set<number>(); let ok = true;
    for (let dy = 0; dy < d.h && ok; dy++) for (let dx = 0; dx < d.w; dx++) {
      const i = idx(x + dx, y + dy);
      if (s.road[i] || !buildable(m, i) || (s.rail?.[i] && s.railGrade?.[i] !== 2)) { ok = false; break; }
      if (s.occ[i]) { const b = byId.get(s.occ[i]); if (!b || !isRes(b.kind) || b.w !== 1 || b.h !== 1 || b.sandbox) { ok = false; break; } ids.add(b.id); }
    }
    if (!ok || ids.size > 4) continue;
    let road = false; for (let k = -1; k <= Math.max(d.w, d.h) && !road; k++) for (const [xx, yy] of [[x + k, y - 1], [x + k, y + d.h], [x - 1, y + k], [x + d.w, y + k]]) if (xx >= 0 && yy >= 0 && xx < W && yy < H && s.road[idx(xx, yy)] && conn[idx(xx, yy)]) { road = true; break; }
    if (!road) continue;
    const cost = [...ids].reduce((a, id) => a + buyoutCost(s, byId.get(id)!), 0);
    const score = cost / 1000 + (Math.abs(x - c.x) + Math.abs(y - c.y)) * (weight ? 0.5 : 0.2);
    if (!best || score < best.score) best = { x, y, ids: [...ids], cost, score };
  }
  return best;
}
/** 街の中心（住宅の世帯で重みづけた重心） */
function cityCenter(s: GameState): { x: number; y: number } {
  let n = 0, x = 0, y = 0; for (const b of s.buildings) if (isRes(b.kind)) { const h = sumHH(b) + 0.1; n += h; x += b.x * h; y += b.y * h; }
  return n ? { x: Math.round(x / n), y: Math.round(y / n) } : { x: W >> 1, y: H >> 1 };
}
/** 新しい住宅地の道路：つながった道路の端から空き地へ 8 区画まっすぐ、4 区画ごとに左右へ 3 区画の枝道。沿道の空き地が多い向きを選ぶ */
function newBlock(s: GameState, free: (i: number) => boolean, conn: Uint8Array): number[] | null {
  const m = getMap(s.seed), pass = (i: number) => !s.occ[i] && !s.road[i] && buildable(m, i); // 用途指定だけの空き区画は道路にしてよい
  const c = cityCenter(s); let best: number[] | null = null, bestScore = -1;
  for (let i = 0; i < N(); i++) {
    if (!s.road[i] || !conn[i]) continue; // 国道からの枝道も可
    const x = i % W, y = (i / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const main: number[] = []; let buy = 0;
      for (let k = 1; k <= 8; k++) {
        const xx = x + dx * k, yy = y + dy * k; if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1) break;
        const j = idx(xx, yy);
        // 沿道が家で埋まっているときは、入口の 1 軒（1 区画の住宅）を買い取って道を通す
        if (k === 1 && s.occ[j]) { const hb = s.buildings.find(o => o.id === s.occ[j]); if (hb && isRes(hb.kind) && hb.w === 1 && hb.h === 1 && !hb.sandbox) { buy = hb.id; main.push(j); continue; } break; }
        if (!(free(j) || (k <= 2 && pass(j)))) break;
        main.push(j);
      }
      if (main.length < 5) continue;
      const tiles = [...main];
      for (let k = 3; k < main.length; k += 4) for (const sg of [1, -1]) {
        const bx = main[k] % W, by = (main[k] / W) | 0;
        for (let j = 1; j <= 3; j++) { const xx = bx + dy * sg * j, yy = by + dx * sg * j; if (xx < 1 || yy < 1 || xx >= W - 1 || yy >= H - 1 || !free(idx(xx, yy))) break; tiles.push(idx(xx, yy)); }
      }
      // 沿道に使える空き地の数（道路の両側）と、街の中心への近さ
      const set = new Set(tiles); let lots = 0;
      for (const t of tiles) { const tx = t % W, ty = (t / W) | 0; for (const [ex, ey] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = tx + ex, yy = ty + ey; if (xx >= 0 && yy >= 0 && xx < W && yy < H && !set.has(idx(xx, yy)) && free(idx(xx, yy))) lots++; } }
      const score = lots - 0.3 * (Math.abs(x - c.x) + Math.abs(y - c.y)) - (buy ? 6 : 0);
      if (score > bestScore) { bestScore = score; best = tiles; (best as any).buy = buy; }
    }
  }
  return best && bestScore > 6 ? best : null;
}

/** 毎月の手番。打った手の説明を返す */
export function autoTurn(s: GameState): string[] {
  const out: string[] = [], st = s.stats, L = monthlyBudget(s);
  const hadPlan = !!s.plan, plan = cityPlan(s); // 地区ごとの役割（10 年ごとに見直す）
  if (!hadPlan || plan.made === s.month) out.push(`都市計画を${hadPlan ? '見直す' : 'つくる'}：${plan.roles.map((r, d) => `${DISTRICTS[d]}＝${['住宅', '中心市街地', '産業', '観光', '自然', '郊外住宅'][r]}`).join('・')}`);
  const inRole = (...r: number[]) => plan.roles.map((v, d) => (r.includes(v) ? d : -1)).filter(d => d >= 0);
  const ord = s.autoOrder ?? 1; // 作戦（AUTO_ORDERS）
  const reserve = Math.max(3000, P.bondUnit * 0.6) * [0.5, 1, 2.5][ord], BL = bondCap(s) * [1.25, 1, 0.6][ord]; // BL：オートが使う市債の上限（作戦で広げたり絞ったりする。本当の上限を超える分は発行のときに断られる）
  let builds = 0, acts = 0, needLand = false, saving = false, saveFor = 0, saveKind = ''; // saveFor：ためている金額（これを残せるなら、ほかの安い施設は建ててよい）
  const big = W * H > 6000, maxActs = Math.max(1, (big ? 2 : 6) + [big ? 1 : 2, 0, big ? 0 : -2][ord]), maxBuilds = Math.max(1, (big ? 1 : 3) + [1, 0, big ? 0 : -1][ord]); // 大きな地図は 1 手ごとの再計算が重いので、月の手数を絞る
  const can = (cost: number) => s.cash - cost >= reserve;
  const act = (a: Action, text: string): boolean => { if (acts >= maxActs) return false; const r = dispatch(s, a); if (r.ok) { out.push(text); acts++; } return r.ok; };
  // 国際交流：知名度が届いた都市と姉妹都市になり、半年ごとに交流する
  if (s.month % 6 === 3 && s.cash > 20000) {
    const mine = s.sisters ?? [];
    if (mine.length < MAX_SISTERS) { const d = SISTERS.find(x => !mine.some(p => p.id === x.id) && (s.fame ?? 0) >= x.fame && s.cash > x.cost * 6); if (d && dispatch(s, { type: 'sister', id: d.id, act: 'join' }).ok) out.push(`${d.name}と姉妹都市になる`); }
    for (const p of s.sisters ?? []) if (p.last === undefined || s.month - p.last >= 6) { if (dispatch(s, { type: 'sister', id: p.id, act: (['student', 'culture', 'trade'] as const)[s.month % 3] }).ok) out.push(`${SIS[p.id]?.name ?? ''}と交流する`); break; }
  }
  // 市政：2 月に予算案を決め（赤字なら緊縮、通りそうな案）、補助金を申請し、選挙戦では演説と討論会、炎上には謝罪で対応する
  {
    const p = s.pol;
    if (p) {
      if (calMonth(s.month) === 2 || p.prov !== undefined) {
        const last = s.ledger.slice(-12), op = last.length ? last.reduce((a, l) => a + l.operating, 0) / last.length : 0;
        const want = op < 0 ? ['austerity', 'balanced'] : s.stats.waitlist > 20 || (s.stats.aging ?? 0) > 0.3 ? ['welfare', 'balanced'] : ['growth', 'balanced'];
        const id = want.find(x => { const f = voteForecast(s, x); return f.yes.reduce((a, b) => a + b, 0) >= f.need + 1; }) ?? 'balanced';
        if (p.plan !== id && dispatch(s, { type: 'pol', op: 'plan', id }).ok) out.push(`来年度の予算案を「${PLANS.find(x => x.id === id)?.name}」にする`);
        const f = voteForecast(s, id); if (f.yes.reduce((a, b) => a + b, 0) < f.need + 2) for (const k of [2, 1]) if (s.month - p.lobby[k] >= 3 && dispatch(s, { type: 'pol', op: 'lobby', n: k }).ok) { out.push('会派と意見交換する'); break; }
      }
      if (p.flame && dispatch(s, { type: 'pol', op: 'press', id: 'apologize' }).ok) out.push('炎上に記者会見で対応する');
      if (p.pet && dispatch(s, { type: 'pol', op: 'pet', id: s.cash > 6000 ? 'yes' : 'no' }).ok) out.push('陳情に答える');
      if (p.rec && !p.rec.plan && dispatch(s, { type: 'pol', op: 'recover', id: s.cash > 20000 ? 'resilient' : 'fast' }).ok) out.push('復興計画を決める');
      if (s.cash > 2000) for (const g of GRANTS) if (!g.need(s) && !p.apps.some(a => a.id === g.id) && (p.grants[g.id] === undefined || s.month - p.grants[g.id] >= 36)) { if (dispatch(s, { type: 'pol', op: 'grant', id: g.id }).ok) out.push(`「${g.name}」を申請する`); break; }
      if (s.month % 6 === 1 && s.cash > 3000 && dispatch(s, { type: 'pol', op: 'petition' }).ok) out.push('県と国に要望を伝える');
      if (campaignOpen(s) && s.cash > 5000) { dispatch(s, { type: 'pol', op: 'speech' }); if (p.camp?.debate === undefined && dispatch(s, { type: 'pol', op: 'debate' }).ok) out.push('公開討論会に出る'); }
      // 人事：4 月に、いまより手腕の高い候補がいれば入れかえる（給与が払えるときだけ）
      if (s.month % 12 === 0) { const ex = execOf(s); POSTS.forEach((_, k) => { const cs = candidates(s, k), cur = ex[k]; let bi = -1; cs.forEach((c, i) => { if (c.skill > (cur?.skill ?? 0) && (c.salary === 0 || s.cash > 30000) && (bi < 0 || c.skill > cs[bi].skill)) bi = i; }); if (bi >= 0 && dispatch(s, { type: 'pol', op: 'appoint', n: k, id: String(bi) }).ok) out.push(`${POSTS[k].name}に${cs[bi].name}氏を任命する`); }); }
      // バス路線：バス停が 3 つ以上あって路線がなければ、いちばん長くつながる 2 つを結ぶ
      if (s.month % 6 === 2 && (s.busStops?.length ?? 0) >= 3 && (p.routes?.length ?? 0) < 2 && s.cash > 8000) {
        const st = s.busStops!.slice(0, 12); let best: [number, number, number] | null = null;
        for (const a of st) for (const b of st) if (a < b && !(p.routes ?? []).some(r => (r.a === a && r.b === b))) { const L = roadPath(s, a, b).length; if (L > 8 && (!best || L > best[2])) best = [a, b, L]; }
        if (best && dispatch(s, { type: 'pol', op: 'route', id: `${best[0]}-${best[1]}`, n: 1 }).ok) out.push('バス路線を開く');
      }
      if (s.month % 12 === 1 && s.cash > 40000) for (const id of ['sakura', 'hanabi', 'bousai', 'harvest', 'illumi', 'snow']) if (!p.fests.includes(id) && dispatch(s, { type: 'pol', op: 'fest', id, n: 1 }).ok) { out.push('季節の行事をふやす'); break; }
    }
  }
  // 区域の編入：編入できる回数があれば、空き地の多いとなりの区域を編入する
  if (s.unlocked && (s.mayor?.annex ?? 0) > 0) {
    const m = getMap(s.seed), cand = annexable(s).map(b => { const r = blockRect(b); let n = 0; for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) { const i = idx(x, y); if (buildable(m, i) && !s.occ[i]) n++; } return { b, n }; }).sort((a, b) => b.n - a.n);
    if (cand.length && dispatch(s, { type: 'annex', block: cand[0].b }).ok) out.push(`${blockName(cand[0].b)}を市に編入する（空き地 ${cand[0].n} 区画）`);
  }
  const build = (kind: Kind, why: string, weight?: (b: any) => number, urgent: boolean | 1 | 2 = false, spotOpt: { districts?: number[] } = {}): boolean => {
    if (builds >= maxBuilds || acts >= maxActs) return false;
    if (ord === 2 && !urgent && L.operating < 200) return false; // 財布だいじに：黒字に余裕がなければ、急がない施設は見送る
    const d = DEFS[kind];
    let spot = findSpot(s, kind, weight, spotOpt);
    if (!spot && urgent && (!campaign || urgent === 2)) {
      // 空き地がなければ、道路沿いの住宅を数軒買い取って用地をつくる（住宅 4 軒まで）
      const lot = findBuyLot(s, kind, weight);
      if (lot && can(d.cost * 1.1 + lot.cost)) { for (const id of lot.ids) act({ type: 'buyout', id }, `住宅の用地を買収（${nm(kind)}の用地のため）`); acts -= lot.ids.length; spot = findSpot(s, kind, weight) ?? (checkPlace(s, kind, lot.x, lot.y).ok ? { x: lot.x, y: lot.y } : null); }
    }
    if (!spot) { if (urgent) needLand = true; return false; } // 置ける場所がなければ借りもせず、道路を延ばして用地をつくる
    // 急ぐもの（水道・保育・学校・下水・電力）は、資金が足りなければ市債で用意する
    if ((!urgent || (urgent === 1 && saveKind && saveKind !== kind)) && saving && s.cash - d.cost * 1.1 < saveFor + reserve) return false; // 急ぐものの資金をためている間は、それを崩してまでほかを建てない
    const cap = urgent === 2 ? 0.95 : urgent ? 0.7 : 0.6; // 水道・下水・電力は上限近くまで、保育・学校は 7 割まで借りる。どんどん攻めろ：急がない施設も 6 割まで借りる
    if (!can(d.cost * 1.1) && (urgent || (ord === 0 && !saving))) {
      // 足りない分だけ一度に借りる。上限を超えるなら借りない（中途半端に借りて別の物に使ってしまわないように）
      const need = Math.ceil((d.cost * 1.1 + reserve - s.cash) / 1000) * 1000, room = BL * cap - s.loans.filter(l => l.kind === 'bond').reduce((a, l) => a + l.remaining, 0);
      if (need <= room && affordable(need)) { acts--; act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：${nm(kind)}の建設のため`); }
    }
    if (!can(d.cost * 1.1)) { if (urgent) { saving = true; if (d.cost * 1.1 > saveFor) { saveFor = d.cost * 1.1; saveKind = kind; } } return false; }
    const p = spot;
    const ok = act({ type: 'build', kind, x: p.x, y: p.y }, `${nm(kind)}を${d.build === 'invite' ? '誘致' : d.build === 'request' ? '要望' : '建設'}（${where(s, p.x, p.y)}）：${why}`);
    if (ok) builds++;
    return ok;
  };
  if (big && s.month % 2 === 1 && st.waterCap >= st.waterDemand) return out; // 大きな地図は 2 か月に 1 回（1 手ごとの再計算が重いため）
  if (s.mode === 'sandbox' && !rerunCheck(s)) act({ type: 'rerun' }, '再び立候補：街を立て直したため');
  // 落選したあとは、支持を取り戻して返り咲きをめざす（対話集会）
  if (s.mode === 'sandbox' && s.approval < 0.55 && (s.acts.townhall === undefined || s.month - s.acts.townhall >= 6) && s.cash > 200) act({ type: 'civic', id: 'townhall' }, `地区ごとの対話集会：返り咲きをめざして（支持率 ${Math.round(s.approval * 100)}%）`);
  const bondF = () => s.loans.filter(l => l.kind === 'bond').reduce((a, l) => a + l.remaining, 0);
  /** 借りても返せるか：毎月の収支から、増えた元金の返済を引いて黒字が残るか */
  const affordable = (amt: number) => L.operating - (s.loans.filter(l => l.kind === 'bond').reduce((a, l) => a + l.principal / l.months, 0) + amt / P.bondMonths) > [20, 80, 300][ord];
  const pending = (f: string) => s.buildings.some(b => fam(b.kind) === f && b.status === 'construction');
  /** 区画整理：住宅の裏に取り残された空き地へ道路を通す。入口をふさぐ住宅は買い取る（3 軒まで）。足りなければ市債で */
  let redeveloped = false;
  const redevelop = (why: string, zoneNow = true): boolean => {
    if (acts >= maxActs) return false;
    const rp = planRedevelop(s, { maxBuy: campaign ? 0 : 3 }); // 選挙前は住宅の買収をしない（支持率が下がる）
    if (!rp) return false;
    if (saving && s.cash - rp.cost < saveFor + reserve) return false; // 急ぐものの資金は崩さない
    if (!can(rp.cost)) { const need = Math.ceil((rp.cost + reserve - s.cash) / 1000) * 1000; if (bondF() + need <= BL * 0.7 && affordable(need)) act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：区画整理のため`); }
    if (!can(rp.cost)) return false;
    let moved = 0;
    for (const id of rp.buy) { const b = s.buildings.find(o => o.id === id); const hh = b ? sumHH(b) : 0; if (!dispatch(s, { type: 'buyout', id }).ok) return false; moved += hh; }
    const r = dispatch(s, { type: 'road', tiles: rp.road, road: 1 });
    if (!r.ok) return false;
    acts++;
    const ax = rp.at % W, ay = (rp.at / W) | 0;
    out.push(`区画整理（${where(s, ax, ay)}）：${rp.buy.length ? `入口をふさぐ住宅 ${rp.buy.length} 軒を買い取り（${Math.round(moved)} 世帯が転居）、` : ''}生活道路を ${rp.road.length} 区間通す。道路に面していなかった空き地 ${rp.gain} 区画が使えるように（${Math.round(rp.cost).toLocaleString()} 万円）：${why}`);
    // 使えるようになった区画を住宅地に（幹線沿いは中層）
    const lots = rp.lots.filter(i => !s.occ[i] && !s.road[i]);
    if (lots.length && zoneNow) { const z: Zone = 1; const r2 = dispatch(s, { type: 'zone', tiles: lots, zone: z }); if (r2.ok) out.push(`区画整理した ${lots.length} 区画を低層住宅に指定`); }
    return true;
  };

  // 1. お金：資金が少なければ市債（上限の 8 割まで）
  if (s.cash < reserve && bondF() + P.bondUnit <= BL * 0.5 && affordable(P.bondUnit)) act({ type: 'borrow', amount: P.bondUnit }, `市債を ${P.bondUnit.toLocaleString()} 万円発行：資金が少ないため`);

  // 1b. 選挙の戦略（任期の残りが 15 か月を切ったら「選挙モード」）
  //   落選の主な原因は、①赤字のときに上げた税を下げないまま（支持率と住宅負担が下がる）、②手の届かない公約、③支持率の放置。
  const left = s.mode === 'term' ? s.termLength - (s.month - s.termStart) : 99, campaign = left <= 15;
  const pledged = (id: string) => { const g = (s.goals ?? []).find(o => o.id === id); return !!g && !goalProgress(s, g).ok; };
  const op6 = (() => { const l = s.ledger.slice(-6); return l.length ? l.reduce((a, x) => a + x.operating, 0) / l.length : L.operating; })();
  const taxOk = (k: string) => s.acts['tax:' + k] === undefined || s.month - s.acts['tax:' + k] >= 6;
  // 赤字になったら、標準より下げた住民税をまず戻す。一時借入（得票に大きく響く）は市債に借り換える
  if (op6 < 0 && s.tax.res < 1 && taxOk('res')) act({ type: 'tax', key: 'res', v: 1 }, '住民税を標準に戻す：収支が赤字になったため');
  { const td = tempDebt(s); if (td > 0) { const need = Math.ceil(td / 1000) * 1000; if (bondF() + need <= BL) act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：一時借入（${Math.round(td).toLocaleString()} 万円、年利が高い）を借り換えるため`); if (s.cash > reserve * 0.3) act({ type: 'repayTemp', amount: Math.floor(Math.min(td, s.cash - reserve * 0.3)) }, '一時借入を繰り上げ返済'); } }
  // 更新の山：古くなった大事な施設（老朽度 65 以上）の更新費が、手元の資金と 1 年分の黒字を超えそうなら、減税をやめ、固定資産税で備える
  const backlog = s.buildings.filter(b => isCity(b.kind) && b.status !== 'construction' && b.status !== 'renewing' && b.age >= 65 && ['water', 'sewage', 'care', 'fire', 'school', 'jhs', 'health'].includes(fam(b.kind))).reduce((a, b) => a + DEFS[b.kind].renewCost, 0);
  const crunch = backlog > s.cash + Math.max(0, op6) * 12 + (BL - bondF()) * 0.5;
  if (crunch && !campaign) {
    if (s.tax.res < 1 && taxOk('res')) act({ type: 'tax', key: 'res', v: 1 }, `住民税を標準に戻す：古い施設の更新費（${Math.round(backlog).toLocaleString()} 万円）に備えるため`);
    else if (s.tax.prop < 1.1 && taxOk('prop') && op6 < 2500) act({ type: 'tax', key: 'prop', v: Math.round((s.tax.prop + 0.05) * 100) / 100 }, `固定資産税を 5% 上げる：古い施設の更新費（${Math.round(backlog).toLocaleString()} 万円）に備えるため`);
  }
  // 税：黒字に余裕があれば、上げた税を標準に戻す（住民税から。支持率と住宅負担に効く）。選挙前で余裕が大きければ標準より下げる
  if (op6 > 450 && can(reserve) && (!crunch || campaign)) {
    if (s.tax.res > 1 && taxOk('res')) act({ type: 'tax', key: 'res', v: Math.max(1, Math.round((s.tax.res - 0.04) * 100) / 100) }, `住民税を下げる（${Math.round(s.tax.res * 100)}% → ${Math.round(Math.max(1, s.tax.res - 0.04) * 100)}%）：黒字に余裕があるため`);
    else if (s.tax.prop > 1 && taxOk('prop')) act({ type: 'tax', key: 'prop', v: Math.max(1, Math.round((s.tax.prop - 0.05) * 100) / 100) }, `固定資産税を下げる（${Math.round(s.tax.prop * 100)}% → ${Math.round(Math.max(1, s.tax.prop - 0.05) * 100)}%）：黒字に余裕があるため`);
    else if (ord !== 2 && op6 > 1400 && s.tax.res > 0.95 && s.tax.res <= 1 && taxOk('res') && (campaign || op6 > 2500)) act({ type: 'tax', key: 'res', v: 0.95 }, '住民税を標準より 5% 下げる：黒字が大きく、暮らしの負担を軽くするため');
  }
  // 安くて支持の上がる政策（子ども食堂）、住宅の負担を軽くする政策（住宅改修支援）、通勤を楽にする政策（自転車道）
  if (op6 > 120 && !s.policies.kodomo?.on) act({ type: 'policy', id: 'kodomo', on: true }, '子ども食堂への支援を始める：費用が小さく、子育て世帯の満足と支持が上がるため');
  if (op6 > 400 && !s.policies.homeReform?.on) act({ type: 'policy', id: 'homeReform', on: true }, '住宅改修支援を始める：住宅の負担感（満足の最大の不足）を軽くするため');
  if (op6 > 500 && !s.policies.bikeLanes?.on && (st.satDrag?.[1] ?? 0) > 0.05) act({ type: 'policy', id: 'bikeLanes', on: true }, '自転車道とシェアサイクルを始める：通勤の不満が大きいため');
  if (campaign) {
    // 支持率：対話集会はいつでも、市民まつりは選挙の 6 か月前から（効果が 6 か月）
    if (s.approval < 0.56 && (s.acts.townhall === undefined || s.month - s.acts.townhall >= 6) && can(50)) act({ type: 'civic', id: 'townhall' }, `地区ごとの対話集会：選挙まで ${left} か月、支持率 ${Math.round(s.approval * 100)}%`);
    if (left <= 6 && (s.acts.festival === undefined || s.month - s.acts.festival >= 12) && can(600)) act({ type: 'civic', id: 'festival' }, `市民まつりを開く：選挙まで ${left} か月`);
    // 公約の追い込み
    if (pledged('wait') && !pending('care')) { if (!s.policies.careStaff?.on) act({ type: 'policy', id: 'careStaff', on: true }, '保育人材支援を始める：公約「待機児童をなくす」のため'); build(st.waitlist > 30 ? 'nursery' : 'nurseryS', `公約「待機児童をなくす」：待機 ${Math.round(st.waitlist)} 人`, undefined, 2); }
    if (pledged('water')) for (const b of s.buildings.filter(o => fam(o.kind) === 'water' && o.status === 'operating' && o.age >= 40 - DEFS[o.kind].ageRate * left - 1)) {
      const cost = DEFS[b.kind].renewCost;
      if (!can(cost)) { const need = Math.ceil((cost + reserve - s.cash) / 1000) * 1000; if (bondF() + need <= BL && affordable(need)) act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：公約「水道をよみがえらせる」のため`); }
      if (can(cost)) act({ type: 'renew', id: b.id }, `${nm(b.kind)}を更新：公約「水道をよみがえらせる」（老朽度 ${Math.round(b.age)}）`);
    }
    if (pledged('jobs') && !s.buildings.some(b => DEFS[b.kind].build === 'invite' && b.status === 'construction')) build(st.pop > 9000 ? 'hqTower' : 'office', '公約「働く場所をつくる」のため', undefined, 1);
  }

  // 2. 水道：古い浄水場は更新、足りなければ増設
  const waters = s.buildings.filter(b => fam(b.kind) === 'water' && b.status !== 'construction');
  const renewing = waters.some(b => b.status === 'renewing');
  // 同じころに建てた浄水場は同じころに古くなるので、数が多ければ同時に 2〜3 か所まで更新する（1 か所ずつだと、待つ間に次々と止まる）
  const maxRenew = Math.max(1, Math.floor(waters.length / 4));
  let nRenew = waters.filter(b => b.status === 'renewing').length;
  for (const old of [...waters].sort((a, b) => (b.status === 'suspended' ? 1 : 0) - (a.status === 'suspended' ? 1 : 0) || b.age - a.age)) {
    if (nRenew >= maxRenew || old.age < 62 || (old.status !== 'operating' && old.status !== 'suspended')) break;
    const cost = DEFS[old.kind].renewCost;
    if (!can(cost)) { const need = Math.ceil((cost + reserve - s.cash) / 1000) * 1000; if (bondF() + need <= BL && affordable(need)) act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：${nm(old.kind)}の更新のため`); }
    if (can(cost) && act({ type: 'renew', id: old.id }, `${nm(old.kind)}を更新：老朽度 ${Math.round(old.age)}`)) nRenew++;
    else { saving = true; saveFor = Math.max(saveFor, cost); break; } // 浄水場の更新費をためる
  }
  if (st.waterCap < st.waterDemand * 1.15 && !pending('water') && !renewing) build('waterS', `水道の余力が少ない（${Math.round(st.waterDemand)} / ${Math.round(st.waterCap)} 世帯）`, undefined, 2);
  // 2b. 古くなった市の施設の更新：使用停止（老朽度 100）や老朽度 80 を超えたものを、暮らしに大事な順に（月 2 か所まで）
  {
    const PRI: Record<string, number> = { water: 0, sewage: 1, care: 2, fire: 3, school: 4, jhs: 4, health: 5, waste: 6, funeral: 6, welfare: 7, power: 8, library: 9, park: 10, culture: 11 };
    const olds = s.buildings.filter(b => isCity(b.kind) && DEFS[b.kind].renewCost > 0 && ((b.status === 'suspended' && b.age >= 99) || (b.status === 'operating' && b.age >= 80)))
      .sort((a, b) => (PRI[fam(a.kind)] ?? 20) - (PRI[fam(b.kind)] ?? 20) || (b.status === 'suspended' ? 1 : 0) - (a.status === 'suspended' ? 1 : 0) || b.age - a.age);
    let n = 0;
    const careSpare0 = st.careDemand > 0 ? st.careCap / st.careDemand : 9;
    for (const b of olds) {
      if (n >= 2) break;
      if (fam(b.kind) === 'care' && careSpare0 > 1.4 && b.status === 'suspended') continue; // 保育の定員が余っていれば、止まった園は更新しない（あとで閉じる）
      const cost = DEFS[b.kind].renewCost, essential = (PRI[fam(b.kind)] ?? 20) <= 6; // ごみ処理まで（止まると街じゅうに響く）
      if (!can(cost) && essential) { const need = Math.ceil((cost + reserve - s.cash) / 1000) * 1000; if (bondF() + need <= BL * 0.9 && affordable(need)) act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：${nm(b.kind)}の更新のため`); }
      if (can(cost) && act({ type: 'renew', id: b.id }, `${nm(b.kind)}（${where(s, b.x, b.y)}）を更新：${b.status === 'suspended' ? '老朽化で使用停止していたため' : `老朽度 ${Math.round(b.age)}`}`)) n++;
      else if (essential) break; // 大事な施設の更新費をためる
    }
  }
  // 2c. 近く更新が必要になる大事な施設（老朽度 70 以上）があれば、その分の資金をためる
  {
    const soon = s.buildings.filter(b => isCity(b.kind) && b.status === 'operating' && b.age >= 74 && ['water', 'sewage', 'care', 'fire', 'school', 'jhs', 'health'].includes(fam(b.kind)));
    const needCash = soon.reduce((a, b) => a + DEFS[b.kind].renewCost, 0) * 0.5;
    if (soon.length && s.cash < needCash + reserve) { saving = true; saveFor = Math.max(saveFor, needCash); }
  }
  // 3. 下水・電力・ガス・ごみ
  if (st.sewageCap < st.sewageDemand * 1.12 && !pending('sewage')) build('sewageS', '下水処理が追いつかない', undefined, 2);
  if (st.powerCap < st.powerDemand * 1.12 && !pending('power')) build('substation', '電力の余裕が少ない', undefined, 2);
  if (st.gasCap < st.gasDemand * 0.97 && !pending('gas')) build('gas', '都市ガスが届かない世帯がある');
  if ((st.telDemand ?? 0) > (st.telCap ?? 1e9) * 0.95 && !pending('telecom')) build('cellTower', '通信が混み合っている');
  if (st.wasteCap < st.wasteDemand * 1.02 && !pending('waste')) { if (!s.policies.sorting?.on && L.operating > 150) act({ type: 'policy', id: 'sorting', on: true }, 'ごみの分別を始める：ごみ処理の余力が少ない'); else build('waste', 'ごみ処理の余力が少ない'); }

  // 4. 保育：待機があれば園を建て、保育士が足りなければ人材支援
  // 保育士が足りない園があるうちは、園を増やしても受け入れは増えない（採用できる人数に上限がある）。人材支援を先に
  const short = s.buildings.some(b => fam(b.kind) === 'care' && b.status === 'operating' && (b.staff ?? 0) < staffReq(s, b) * 0.9);
  const unstaffed = s.buildings.filter(b => fam(b.kind) === 'care' && b.status === 'operating').reduce((a, b) => a + Math.max(0, staffReq(s, b) - (b.staff ?? 0)), 0);
  // 定員が需要を大きく上回っているのに待機が残るのは、場所の偏り。園を増やし続けると人件費と更新費で財政が傾くので、
  // 余りが 3 割を超えていれば建てず、5 割を超えたら使われていない園から閉じる（半年に 1 か所）
  const careSpare = st.careDemand > 0 ? st.careCap / st.careDemand : 9;
  if (careSpare > 1.5 && st.careDemand > 100 && (s.acts.careCut === undefined || s.month - s.acts.careCut >= 6)) {
    const idle = s.buildings.filter(b => fam(b.kind) === 'care' && (b.status === 'operating' || b.status === 'suspended') && b.used < Math.max(4, DEFS[b.kind].capacity * 0.2))
      .sort((a, b) => a.used - b.used || b.age - a.age)[0];
    if (idle && act({ type: 'demolish', id: idle.id }, `${nm(idle.kind)}（${where(s, idle.x, idle.y)}）を閉じる：利用が ${Math.round(idle.used)} 人と少なく、市全体の定員が需要の ${Math.round(careSpare * 100)}% あるため`)) s.acts.careCut = s.month;
  }
  if (((st.waitlist > 5 && !pending('care')) || st.waitlist > 50) && unstaffed < 6 && careSpare < 1.3) build(st.waitlist > 40 ? 'nursery' : 'nurseryS', `保育の待機 ${Math.round(st.waitlist)} 人`, undefined, 1);
  if (short && !s.policies.careStaff?.on && L.operating > 0) act({ type: 'policy', id: 'careStaff', on: true }, '保育人材支援を始める：保育士が足りない園がある');
  // 5. 学校
  // 定員が足りなければ、まず今ある学校を増築（新築の半額）。増築しきったら新しく建てる
  const enlarge = (f: string, why: string) => {
    const b = s.buildings.filter(o => fam(o.kind) === f && isCity(o.kind) && o.status === 'operating' && (DEFS[o.kind].lvMax ?? 0) > (o.lv ?? 1)).sort((a, b) => (a.lv ?? 1) - (b.lv ?? 1) || b.used - a.used)[0];
    if (!b) return false;
    const cost = upgradeCost(b, s);
    if (!can(cost)) { const need = Math.ceil((cost + reserve - s.cash) / 1000) * 1000; if (bondF() + need <= BL * 0.8 && affordable(need)) act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：${nm(b.kind)}の増築のため`); }
    if (!can(cost)) { saving = true; saveFor = Math.max(saveFor, cost); return true; }
    return act({ type: 'upgrade', id: b.id }, `${nm(b.kind)}（${where(s, b.x, b.y)}）を増築：${why}`) || true;
  };
  if (st.schoolKids > st.schoolCap * 1.05 && !pending('school') && !s.buildings.some(b => fam(b.kind) === 'school' && b.status === 'renewing') && !enlarge('school', '小学校が定員を超えている')) build('school', '小学校が定員を超えている', undefined, st.schoolKids > st.schoolCap * 1.12 ? 2 : 1);
  if (st.jhsKids > st.jhsCap * 1.05 && !pending('jhs') && !s.buildings.some(b => fam(b.kind) === 'jhs' && b.status === 'renewing') && !enlarge('jhs', '中学校が定員を超えている')) build('jhs', '中学校が足りない', undefined, st.jhsKids > st.jhsCap * 1.12 ? 2 : 1);

  // 6. 渋滞：混雑の激しい生活道路を幹線道路に広げる（月 8 区画まで）
  if (st.maxVc > 1.05) {
    const hot: number[] = [];
    for (let i = 0; i < N(); i++) if (s.road[i] === 1 && s.vc[i] > 1.0) hot.push(i);
    hot.sort((a, b) => s.vc[b] - s.vc[a] || a - b);
    const tiles = hot.slice(0, 8);
    if (tiles.length && can(P.roadCost[2] * tiles.length)) act({ type: 'road', tiles, road: 2 }, `生活道路 ${tiles.length} 区間を幹線道路に拡幅：最大混雑率 ${Math.round(st.maxVc * 100)}%`);
  }

  // 7. 住宅：住宅地の在庫（用途指定済みで未着工の区画）を、人口が伸びるだけ用意しておく。足りなければ道路を延ばして新しい住宅地をつくる
  if (st.waterCap > st.waterDemand * 1.03 && st.sewageCap > st.sewageDemand * 1.0) {
    const m = getMap(s.seed), conn = roadInfo(s).conn, sd = stationDist(s);
    const free = (i: number) => !s.occ[i] && !s.road[i] && !s.zone[i] && buildable(m, i) && !(s.rail?.[i] && s.railGrade?.[i] !== 2);
    const nearRoad = (i: number) => { const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && s.road[idx(xx, yy)] && conn[idx(xx, yy)]) return idx(xx, yy); } return -1; };
    let stock = 0; for (let i = 0; i < N(); i++) if (s.zone[i] >= 1 && s.zone[i] <= 3 && !s.occ[i] && !s.road[i]) stock++;
    const want = Math.max(10, Math.round(st.households / 80)); // 世帯の 1% 弱ほどの区画を常に用意する
    // 暮らしが追いついていないとき（止まった施設・学校や消防の不足・満足の低下）は、住宅地を広げずに整えるほうを先に
    const strained = s.buildings.some(b => isCity(b.kind) && b.status === 'suspended' && b.age >= 99) || st.schoolKids > st.schoolCap * 1.2 || st.fireCover < 0.85 || st.sat < P.voteCenter - 0.09;
    if (stock < want && (st.vacancy < 0.08 || st.pentUp > 0.5) && !strained) {
      // 道路沿いの空き区画を、駅・街の中心に近い順に。駅の近くは高層、幹線沿いは中層、ほかは低層
      const c = cityCenter(s), cand: [number, number, number][] = [];
      for (let i = 0; i < N(); i++) { if (!free(i)) continue; const r = nearRoad(i); if (r < 0) continue; const st0 = sd && sd[r] >= 0 ? sd[r] : 999; const z = st0 <= P.mansionStationRange ? 3 : s.road[r] >= 2 ? 2 : 1; const rl = roleAt(s, i); cand.push([(st0 < 999 ? st0 : Math.abs(i % W - c.x) + Math.abs(((i / W) | 0) - c.y) + 20) + (rl === ROLE.industry ? 40 : rl === ROLE.tourism || rl === ROLE.nature ? 15 : 0), i, z]); } // 産業の地区の住宅は、ほかの地区の土地がなくなってから（計画）
      cand.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
      const pick = cand.slice(0, Math.min(16, want - stock + 6));
      for (const z of [3, 2, 1]) { const tiles = pick.filter(p => p[2] === z).map(p => p[1]); if (tiles.length) act({ type: 'zone', tiles, zone: z as Zone }, `道路沿いの ${tiles.length} 区画を${['', '低層', '中層', '高層'][z]}住宅に指定：住宅地の在庫を増やす（未着工 ${stock} 区画・空き住戸 ${(st.vacancy * 100).toFixed(1)}%）`); }
      // 沿道の空き地が少なくなったら、駅の近くと幹線沿いの古い戸建て・集合住宅の用途を引き上げて、民間の建て替え（高密度化）を誘う
      if (cand.length < 10 && !REAL && s.month % 3 === 0) {
        const up: [number, number, number][] = [];
        for (const b of s.buildings) {
          if (b.status !== 'operating' || b.w !== 1 || b.h !== 1 || (b.kind !== 'house' && b.kind !== 'apartment') || s.month - b.builtMonth < P.redevAge) continue;
          const i = idx(b.x, b.y), r = b.acc ?? -1; if (r < 0) continue;
          const d0 = sd && sd[r] >= 0 ? sd[r] : 999, z = d0 <= P.mansionStationRange * 0.7 ? 3 : s.road[r] >= 2 || d0 <= P.mansionStationRange ? 2 : 0;
          if (z > (b.kind === 'house' ? 1 : 2) && s.zone[i] < z) up.push([d0, i, z]);
        }
        up.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
        const pk = up.slice(0, 10);
        for (const z of [3, 2]) { const tiles = pk.filter(p => p[2] === z).map(p => p[1]); if (tiles.length) act({ type: 'zone', tiles, zone: z as Zone }, `駅の近く・幹線沿いの古い住宅 ${tiles.length} 区画を${z === 3 ? '高層' : '中層'}住宅に引き上げ：建て替えで住める世帯を増やす（沿道の空き地が少ないため）`); }
      }
      const late = s.mode === 'term' && s.termLength - (s.month - s.termStart) < 12 && st.sat < P.voteCenter; // 選挙が近く満足が低いときは、広げるより暮らしを整える
      if ((cand.length < 10 && !late) || needLand) redeveloped = redevelop('沿道の空き地が少なくなったため');
      if (!redeveloped && ((cand.length < 6 && !late) || needLand)) {
        // 新しい住宅地：道路の端から 8 区画まっすぐ延ばし、4 区画ごとに左右へ 3 区画の枝道。資金が足りなければ市債で（住宅が増えれば税で返せる）
        const plan = newBlock(s, free, conn);
        if (plan && !saving && !can(P.roadCost[1] * plan.length) && bondF() + P.bondUnit <= BL * 0.7 && affordable(P.bondUnit)) act({ type: 'borrow', amount: P.bondUnit }, `市債を ${P.bondUnit.toLocaleString()} 万円発行：新しい住宅地の道路のため`);
        if (plan && !saving && (plan as any).buy && can(P.roadCost[1] * plan.length + 6000)) act({ type: 'buyout', id: (plan as any).buy }, '入口の住宅 1 軒の用地を買収：新しい住宅地へ道を通すため');
        if (plan && !saving && !s.occ[plan[0]] && can(P.roadCost[1] * plan.length)) act({ type: 'road', tiles: plan, road: 1 }, `新しい住宅地の道路を ${plan.length} 区間つくる（${where(s, plan[3] % W, (plan[3] / W) | 0)}）：沿道の空き地が少なくなったため`);
      }
    }
  }
  // 住宅の裏に取り残された土地は、住宅地の在庫があっても先に道路を通しておく（街の中の土地から使う）
  let stock0 = 0; for (let i = 0; i < N(); i++) if (s.zone[i] >= 1 && s.zone[i] <= 3 && !s.occ[i] && !s.road[i]) stock0++;
  const want0 = Math.max(10, Math.round(st.households / 80));
  // 住宅の裏に取り残された土地は、街の中の土地から使う（郊外へ道路を延ばすより安く、施設も近い）。暮らしが大きく崩れていなければ毎月
  if (!redeveloped && st.sat >= P.voteCenter - 0.09 && st.schoolKids <= st.schoolCap * 1.3) redeveloped = redevelop('住宅の裏に使われていない土地があるため', stock0 < want0);
  if (needLand && !redeveloped) redeveloped = redevelop('施設を建てる用地がないため');
  if (needLand && !redeveloped && !(st.waterCap > st.waterDemand * 1.03 && st.sewageCap > st.sewageDemand * 1.0)) {
    const m = getMap(s.seed), conn = roadInfo(s).conn, free = (i: number) => !s.occ[i] && !s.road[i] && !s.zone[i] && buildable(m, i) && !(s.rail?.[i] && s.railGrade?.[i] !== 2);
    const plan = newBlock(s, free, conn);
    if (plan && (plan as any).buy && can(P.roadCost[1] * plan.length + 6000)) act({ type: 'buyout', id: (plan as any).buy }, '入口の住宅 1 軒の用地を買収：道を通すため');
    if (plan && !s.occ[plan[0]] && can(P.roadCost[1] * plan.length)) act({ type: 'road', tiles: plan, road: 1 }, `道路を ${plan.length} 区間延ばす（${where(s, plan[3] % W, (plan[3] / W) | 0)}）：施設を建てる用地がないため`);
  }
  // 7b. 人口を伸ばす政策：余裕があれば子育て世帯の転入支援と空き家対策
  if (!saving && L.operating > 400 && can(reserve * 2) && !s.policies.familyMove?.on) act({ type: 'policy', id: 'familyMove', on: true }, '子育て世帯転入支援を始める：収支に余裕があり、人口を伸ばすため');
  else if (L.operating > 600 && can(reserve * 2) && !s.policies.akiya?.on) act({ type: 'policy', id: 'akiya', on: true }, '空き家対策を始める：転出を減らし、転入を増やすため');
  // 8. 店：市内での買物が少なければ、住宅の近くの道路沿いを商業に
  if (st.shopLevel < 0.45 && s.month % 6 === 3) {
    const conn = roadInfo(s).conn, m = getMap(s.seed), pick: number[] = [];
    for (const b of s.buildings) { if (pick.length >= 2 || !isRes(b.kind) || b.status !== 'operating' || b.sv[4] > 0.4) continue; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [2, 0], [0, 2]]) { const x = b.x + dx, y = b.y + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = idx(x, y); if (!s.occ[i] && !s.road[i] && !s.zone[i] && buildable(m, i) && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([ex, ey]) => { const j = idx(Math.min(W - 1, Math.max(0, x + ex)), Math.min(H - 1, Math.max(0, y + ey))); return s.road[j] && conn[j]; })) { pick.push(i); break; } } }
    if (pick.length) act({ type: 'zone', tiles: pick, zone: 4 }, `店の少ない住宅地の ${pick.length} 区画を商業に指定：市内の買物 ${Math.round(st.shopLevel * 100)}%`);
  }

  // 9. 暮らしの観点：近くに施設がない世帯の多いものから、その地区に施設を足す（街が広がっても取り残される地区がないように）
  const lv = st.lv;
  const low = st.sat < P.voteCenter;
  if ((L.operating > 0 || low) && s.month % (low ? 1 : 2) === 0) {
    if (st.fireCover < 0.9 && !pending('fire')) build('fireS', `消防の届く世帯 ${Math.round(st.fireCover * 100)}%`, b => sumHH(b) * (1 - b.sv[3]));
    if (lv[1] < 0.6 && st.pop > 9000 && !s.buildings.some(b => b.kind === 'hospital') && s.cash > DEFS.hospital.cost * 1.5 + reserve) build('hospital', `医療の水準 ${Math.round(lv[1] * 100)}%、市内に病院がない`, b => sumHH(b) * (1 - b.sv[7]));
    if (lv[2] < 0.6 && st.pop > 12000 && !s.buildings.some(b => b.kind === 'police')) build('police', `治安の水準 ${Math.round(lv[2] * 100)}%、市内に警察署がない`, b => sumHH(b) * (1 - b.sv[8]));
    if (st.elderNeed > 5 && st.elderCap < st.elderNeed * 0.8 && !pending('welfare')) build('elderly', `介護施設の定員が足りない（${Math.round(st.elderCap)} / ${Math.round(st.elderNeed)} 人）`);
    // 観点ごとに「その水準が 0.6 に届かない世帯 × 足りない分」を数え、多いものから 2 つ
    const res = s.buildings.filter(b => isRes(b.kind) && b.status === 'operating');
    const SV: [number, Kind, string, string][] = [[0, 'nurseryS', 'care', '保育園が遠い'], [1, 'school', 'school', '小学校が遠い'], [2, 'park', 'park', '公園が遠い'], [3, 'fireS', 'fire', '消防が遠い'],
      [7, 'nightClinic', 'health', '医療機関が遠い'], [8, 'koban', 'safety', '交番が遠い'], [9, 'parkM', 'park', '空気が悪い'], [10, 'libraryS', 'library', '文化施設が遠い'], [11, 'carePlaza', 'welfare', '福祉の拠点が遠い']];
    const gaps = SV.map(([k, kind, f, why]) => { let d = 0, n = 0; for (const b of res) if (b.sv[k] < 0.6) { const h = sumHH(b); d += h * (0.6 - b.sv[k]); n += h; } return { k, kind, f, why, d, n }; })
      .filter(g => g.d > 25 && !pending(g.f)).sort((a, b) => b.d - a.d);
    let done = 0;
    for (const g of gaps) {
      if (done >= 2) break;
      // 同じ種類で老朽化して止まった施設があれば、新しく建てるより先に更新する（建て直すより安く、場所も住宅地の中）
      const dead = s.buildings.filter(b => fam(b.kind) === g.f && b.status === 'suspended' && DEFS[b.kind].renewCost > 0).sort((a, b) => DEFS[a.kind].renewCost - DEFS[b.kind].renewCost || a.id - b.id)[0];
      if (dead) { if (can(DEFS[dead.kind].renewCost) && act({ type: 'renew', id: dead.id }, `${nm(dead.kind)}（${where(s, dead.x, dead.y)}）を更新：${g.why}世帯が約 ${Math.round(g.n)}、止まっていた施設を使えるようにする`)) done++; continue; }
      if (build(g.kind, `${g.why}世帯が約 ${Math.round(g.n)}（${SV_NAMES[g.k]}）`, b => sumHH(b) * Math.max(0, 0.6 - b.sv[g.k]), low && g.d > 150 ? 1 : false)) done++; } // 満足が低いときは、取り残された地区の施設を急ぐ
  }
  // 10. 雇用：市内の職が足りなければ企業を誘致（年 2 回）
  // 職が働き手より多い街は、近くに住みたい働く世帯を呼ぶ（職の引力）。働き手の 1.3 倍までは企業を呼び続ける
  if (s.month % 6 === 1 && st.localJobs < st.workers * 1.3 && L.operating > 0 && !s.buildings.some(b => DEFS[b.kind].build === 'invite' && b.status === 'construction')) build(pickCompany(), `市内の職が少ない（就業者 ${Math.round(st.workers)} / 職 ${Math.round(st.localJobs)} 人）`);

  /** 誘致する企業：使える種類の中から順にいろいろな業種を呼ぶ（電力の余裕・知名度・1 か所だけのものを考える） */
  function pickCompany(): Kind {
    const yr = Math.floor(s.month / 12) + 1, margin = st.powerCap - st.powerDemand;
    const list = (['office', 'itPark', 'foodFactory', 'callCenter', 'gameStudio', 'logistics', 'pharma', 'bankHq', 'battery', 'semicon', 'factory'] as Kind[])
      .filter(k => (DEFS[k].unlock ?? 0) <= yr && !(DEFS[k].unique && s.buildings.some(b => b.kind === k)) && (DEFS[k].req !== 'power' || margin > (DEFS[k].use ?? 0)) && s.cash > DEFS[k].cost * 0.5);
    return list.length ? list[Math.floor(s.month / 6) % list.length] : 'office';
  }
  // 10a. 業務・工業：職が足りなければ、駅の近くを業務、幹線沿いを工業に指定（3 か月ごと）
  if (s.month % 3 === 2 && st.localJobs < st.workers * 1.15) {
    const m = getMap(s.seed), conn = roadInfo(s).conn, sd = stationDist(s), offices: number[] = [], works: number[] = [], worksB: number[] = [];
    for (let i = 0; i < N() && (offices.length < 4 || works.length < 3); i++) {
      if (s.occ[i] || s.road[i] || s.zone[i] || !buildable(m, i)) continue;
      const x = i % W, y = (i / W) | 0; let r = -1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && s.road[idx(xx, yy)] && conn[idx(xx, yy)]) { r = idx(xx, yy); break; } }
      if (r < 0) continue;
      const rl = roleAt(s, i);
      if (sd && sd[r] >= 0 && sd[r] <= 20 && rl !== ROLE.nature) { if (offices.length < 4) offices.push(i); } // オフィスは駅の近く（自然を守る地区は除く）
      else if (s.road[r] >= 2 && works.length < 3) { if (rl === ROLE.industry || !inRole(ROLE.industry).length) works.push(i); else if (rl !== ROLE.home && rl !== ROLE.tourism && worksB.length < 3) worksB.push(i); } // 工場は産業の地区へ（なければ住宅・観光の地区以外）
    }
    if (offices.length) act({ type: 'zone', tiles: offices, zone: 5 }, `駅の近くの ${offices.length} 区画を業務（オフィス）に指定：市内の職が少ない（働き手 ${Math.round(st.workers)} / 職 ${Math.round(st.localJobs)} 人）`);
    else if (works.length || worksB.length) act({ type: 'zone', tiles: works.length ? works : worksB, zone: 6 }, `幹線沿いの ${(works.length ? works : worksB).length} 区画を工業に指定：市内の職が少ないため`);
  }
  // 10c. 新しい技術：使えるようになったら、効くものから
  const yr = Math.floor(s.month / 12) + 1, ok = (k: Kind) => (DEFS[k].unlock ?? 0) <= yr && !s.buildings.some(b => b.kind === k);
  if (L.operating > 150 && (!saving || s.cash > reserve * 4)) {
    const sv0 = saving; saving = false; // 安い新技術は、ためている資金を崩さない範囲で入れる
    const techs: [Kind, boolean, string][] = [
      ['radioTower', true, '新しい技術：高速の移動通信'], ['fiberHub', true, '新しい技術：光回線でテレワークを広げる'],
      ['smartSignal', st.maxVc > 1.0, `新しい技術：AI 信号で渋滞を減らす（最大混雑率 ${Math.round(st.maxVc * 100)}%）`], ['autoBusDepot', L.operating > 600, '新しい技術：自動運転バス'],
      ['fusion', st.powerCap < st.powerDemand * 1.3, '新しい技術：核融合発電'], ['cityOS', L.operating > 1000, '新しい技術：スマートシティ管制センター'], ['vertiport', L.operating > 1200, '新しい技術：空飛ぶクルマ']];
    for (const [k, cond, why] of techs) if (ok(k) && cond && (!sv0 || s.cash - DEFS[k].cost > reserve * 3) && build(k, why, undefined, 1)) break; // 空き地がなければ住宅を数軒買い取る。置けなければ次の技術へ
    saving = sv0;
  }
  // 10e. 駅：余裕があれば駅ビル化・大型ターミナル化、条件がそろえば新幹線の駅を誘致
  if (L.operating > 400 && s.month % 6 === 3) { // 駅の拡張は市債で（ためている資金は崩さない）
    const sts = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating').sort((a, b) => (b.used ?? 0) - (a.used ?? 0));
    for (const b of sts) {
      const lv = b.lv ?? 1;
      if (!stationUpCheck(s, b) && st.pop > 11000 * (lv) && !can(P.stationUpCost[lv] * 1.1)) { const need = Math.ceil((P.stationUpCost[lv] * 1.1 + reserve - s.cash) / 1000) * 1000; if (bondF() + need <= BL * 0.9 && affordable(need)) act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：${b.name ?? '駅'}の拡張のため`); }
      if (!stationUpCheck(s, b) && can(P.stationUpCost[lv] * 1.1)) { act({ type: 'stationUp', id: b.id, what: 'bldg' }, `${b.name ?? '駅'}を${lv === 1 ? '駅ビル' : '大型ターミナル'}にする：利用者が多く、資金に余裕があるため`); break; }
      if (!shinCheck(s, b) && can(P.shinCost + reserve * 3) && L.operating > 900) { act({ type: 'stationUp', id: b.id, what: 'shin' }, `${b.name ?? '駅'}に新幹線の駅を誘致する：条件がそろい、資金に余裕があるため`); break; }
    }
  }
  // 10d. 資金に余裕が大きいときは、暮らしの水準を上げる施設と、大企業の誘致に使う
  if (!saving && s.cash > reserve * 12 && L.operating > 300 && s.month % 4 === 0) {
    if (st.workers > st.localJobs * 1.4 && !s.buildings.some(b => b.kind === 'hqTower' && b.status === 'construction')) build('hqTower', '資金に余裕があり、市内の職を増やすため');
    else if ((lv[4] ?? 1) < 0.8) build(s.buildings.some(b => b.kind === 'library') ? 'gym' : 'library', `資金に余裕があり、文化の水準 ${Math.round((lv[4] ?? 1) * 100)}% を上げるため`, b => sumHH(b) * (1 - b.sv[10]));
    else if ((lv[1] ?? 1) < 0.8) build(s.buildings.some(b => b.kind === 'hospital') ? 'nightClinic' : 'hospital', '資金に余裕があり、医療を良くするため', b => sumHH(b) * (1 - b.sv[7]));
    else if ((lv[5] ?? 1) < 0.8) build('carePlaza', '資金に余裕があり、福祉を良くするため', b => sumHH(b) * (1 - b.sv[11]));
    else if ((lv[3] ?? 1) < 0.85) build('forestPark', '資金に余裕があり、緑を増やすため', b => sumHH(b) * (1 - b.sv[9]));
  }
  /** 街の魅力を上げる施設（観光・スポーツ）は、返せる範囲で市債を使ってでも建てる（来訪者と知名度が税収と転入に効く） */
  const fund = (k: Kind, why: string, lim = 0.75): boolean => {
    const cost = DEFS[k].cost * 1.1 + reserve; if (can(cost)) return true;
    const need = Math.ceil((cost - s.cash) / 1000) * 1000;
    if (bondF() + need > BL * lim || !affordable(need)) return false;
    return act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：${why}`);
  };
  // 10j. 水と道路の土木：少雨で水がめが減ったらダム。混む踏切は陸橋に。学校の近くの幹線に歩道橋
  if (s.month % 6 === 2 && op6 > 400 && !campaign && st.pop > 12000 && (s.climate?.store ?? 1) < 0.5 && !s.buildings.some(b => b.kind === 'dam') && findSpot(s, 'dam') && fund('dam', 'ダムの負担金（少雨で水がめが減っているため）', 0.9))
    build('dam', `水がめの貯水率が ${Math.round((s.climate?.store ?? 1) * 100)}% に下がった（給水制限を防ぎ、洪水も減らす）`, undefined, 2);
  if (s.rail && s.month % 12 === 4 && op6 > 1200 && !saving) {
    const xs: number[] = []; for (let i = 0; i < N(); i++) if (s.road[i] && s.rail[i] && !s.railGrade?.[i] && !(s.overpass ?? []).includes(i)) xs.push(i);
    xs.sort((a, b) => s.vc[b] - s.vc[a] || a - b);
    if (xs.length && s.vc[xs[0]] > 0.7 && can(P.overpassCost + reserve)) act({ type: 'overpass', tiles: [xs[0]] }, `踏切を陸橋にする（${where(s, xs[0] % W, (xs[0] / W) | 0)}、混雑率 ${Math.round(s.vc[xs[0]] * 100)}%）：列車待ちの渋滞をなくすため`);
  }
  if (s.month % 12 === 9 && op6 > 600 && (s.footbridge ?? []).length < st.pop / 8000) {
    const schools = s.buildings.filter(b => (fam(b.kind) === 'school' || fam(b.kind) === 'jhs') && b.status === 'operating'), fb = new Set(s.footbridge ?? []);
    let best = -1, bv = 0;
    for (const sc of schools) for (let dy = -2; dy <= sc.h + 1; dy++) for (let dx = -2; dx <= sc.w + 1; dx++) { const x = sc.x + dx, y = sc.y + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue; const i = idx(x, y); if (s.road[i] >= 2 && !fb.has(i) && !(s.tunnel ?? []).includes(i) && !(s.bridge ?? []).includes(i) && s.vc[i] + 0.1 > bv) { bv = s.vc[i] + 0.1; best = i; } }
    if (best >= 0 && can(P.footbridgeCost + reserve)) act({ type: 'footbridge', tiles: [best] }, `学校の前の幹線に歩道橋をつくる（${where(s, best % W, (best / W) | 0)}）：通学路の交通安全のため`);
  }
  // 10k. 線引きと立地適正化：計画をつくったとき、駅（なければ市役所・街の中心）のまわりの住宅・中心の地区を居住誘導区域に、
  //      自然・観光の地区の、まだ用途を決めていない空き地を市街化調整区域にする
  if ((plan.made === s.month || (s.month % 24 === 3 && !s.area))) {
    const mp = getMap(s.seed), hubs = s.buildings.filter(b => b.kind === 'station' || b.kind === 'cityHall' || b.kind === 'busTerminal');
    const yd: number[] = [], ch: number[] = [], homeD = new Set(inRole(ROLE.home, ROLE.center)), natD = new Set(inRole(ROLE.nature));
    for (let i = 0; i < N(); i++) {
      if (mp.water[i]) continue;
      const x = i % W, y = (i / W) | 0, d = mp.district[i];
      if (homeD.has(d) && hubs.some(b => Math.abs(b.x - x) + Math.abs(b.y - y) <= 18) && (s.area?.[i] ?? 0) !== 2) yd.push(i);
      else if (natD.has(d) && !s.occ[i] && !s.road[i] && !s.zone[i] && (s.area?.[i] ?? 0) === 0) ch.push(i);
    }
    if (yd.length) { acts--; act({ type: 'area', tiles: yd, v: 2 }, `立地適正化計画：駅・市役所のまわり ${yd.length} 区画を居住誘導区域にする（住宅を集め、公共交通で暮らせる街に）`); }
    if (ch.length && st.vacancy >= 0.03) { acts--; act({ type: 'area', tiles: ch, v: 1 }, `線引き：自然を守る地区の空き地 ${ch.length} 区画を市街化調整区域にする（林と田畑を守り、道路や水道を広げずに済む）`); }
  }
  // 線引きの見直し：住宅が足りない（空き家が少なく、入れない世帯がいる）のに調整区域が残っていれば、市街化区域に編入する
  if (s.month % 12 === 8 && s.area && st.vacancy < 0.03 && st.pentUp > 2) {
    const t: number[] = []; s.area.forEach((v, i) => { if (v === 1) t.push(i); });
    if (t.length) { acts--; act({ type: 'area', tiles: t, v: 0 }, `線引きの見直し：住宅が足りないので、市街化調整区域 ${t.length} 区画を市街化区域に編入する`); }
  }
  // 10l. バス停：住宅が多いのに駅とバス停から遠い道路に、年 2 か所ずつ
  if (s.month % 12 === 2 && op6 > 150 && (s.busStops?.length ?? 0) < st.pop / 2000) {
    const stops = s.busStops ?? [], sts = s.buildings.filter(b => b.kind === 'station');
    const hh = new Float64Array(N()); for (const b of s.buildings) if (isRes(b.kind) && b.status === 'operating') hh[idx(b.x, b.y)] += sumHH(b);
    const cand: [number, number][] = [];
    for (let i = 0; i < N(); i++) {
      if (!(s.road[i] === 1 || s.road[i] === 2) || (s.tunnel ?? []).includes(i)) continue;
      const x = i % W, y = (i / W) | 0;
      if (stops.some(j => Math.abs(j % W - x) + Math.abs(((j / W) | 0) - y) < 8) || sts.some(b => Math.abs(b.x - x) + Math.abs(b.y - y) < 6)) continue;
      let v = 0; for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H) v += hh[idx(xx, yy)]; }
      if (v > 60) cand.push([v, i]);
    }
    cand.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    const pick: number[] = []; for (const [, i] of cand) { if (pick.length >= 2) break; if (pick.every(j => Math.abs(j % W - i % W) + Math.abs(((j / W) | 0) - ((i / W) | 0)) >= 8)) pick.push(i); }
    for (const i of pick) act({ type: 'busStop', tiles: [i], on: true }, `バス停をつくる（${where(s, i % W, (i / W) | 0)}）：駅から遠い住宅地の通勤を路線バスで`);
  }
  // 10m. ふるさと納税・外国人住民の支援
  if (op6 > 300 && !s.policies.furusatoPR?.on && st.pop > 7000) act({ type: 'policy', id: 'furusatoPR', on: true }, 'ふるさと納税の PR を始める：返礼品（米・野菜・地元の産品）で寄付を集めるため');
  { const fr = st.foreign; if (fr && fr.total > st.pop * 0.025 && fr.support < 0.5) {
    if (!s.buildings.some(b => b.kind === 'multicultural') && op6 > 200) build('multicultural', `外国人住民が ${Math.round(fr.total)} 人（${(fr.total / Math.max(1, st.pop) * 100).toFixed(1)}%）で、支援が足りない（孤立と失踪を減らす）`);
    else if (!s.policies.nihongo?.on && op6 > 250) act({ type: 'policy', id: 'nihongo', on: true }, '日本語教室を始める：外国人住民が地域で孤立しないように');
  } }
  // 10n. 堤防：浸水のおそれがある世帯が多ければ、水辺の空き地に（年 1 回、6 区画まで）
  if (s.month % 12 === 3 && (st.floodHH ?? 0) > 30 && op6 > 300 && !campaign) {
    const mp = getMap(s.seed), fl = floodRisk(s), lev = new Set(s.levee ?? []), cand: [number, number][] = [];
    for (let i = 0; i < N(); i++) {
      if (lev.has(i) || mp.water[i] || s.road[i] || s.occ[i] || isCanal(s, i)) continue;
      const x = i % W, y = (i / W) | 0;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const xx = x + dx, yy = y + dy; return xx >= 0 && yy >= 0 && xx < W && yy < H && mp.water[idx(xx, yy)]; })) continue;
      let v = 0; for (const b of s.buildings) if (isRes(b.kind) && fl[idx(b.x, b.y)] && Math.abs(b.x - x) + Math.abs(b.y - y) <= 4) v += sumHH(b);
      if (v > 4) cand.push([v, i]);
    }
    cand.sort((p, q) => q[0] - p[0] || p[1] - q[1]);
    const t = cand.slice(0, 6).map(c => c[1]);
    if (t.length && can(t.length * P.leveeCost + reserve)) act({ type: 'levee', tiles: t }, `堤防を ${t.length} 区画築く：浸水のおそれがある世帯が ${Math.round(st.floodHH)}`);
  }
  // 10o. お産と救急・暮らしの施設：産院・周産期の総合病院・ドクターヘリ・郵便局・幼稚園
  if (s.month % 6 === 4 && !campaign) {
    const has = (k: Kind) => s.buildings.some(b => b.kind === k);
    const steps: [boolean, () => boolean][] = [
      [!has('maternity') && !has('perinatal') && st.pop > 5000, () => build('maternity', '市内にお産のできる産院がない（市外へ通うので子どもを持つのをためらう世帯がいる）', undefined, 2)],
      [!has('perinatal') && st.pop > 30000 && op6 > 1500, () => fund('perinatal', '周産期母子医療センターの整備のため', 0.85) && build('perinatal', 'ハイリスクの出産と新生児の集中治療ができる病院がない', undefined, 1)],
      [!has('heliport') && st.pop > 25000 && op6 > 900, () => build('heliport', '山あいや郊外へも 15 分で救急が届くように（ドクターヘリ）')],
      [s.buildings.filter(b => b.kind === 'postOffice').length < Math.floor(st.pop / 12000), () => build('postOffice', '郵便局が少ない地区がある（お年寄りの見守り・年金の窓口）', undefined, 2)],
      [st.waitlist > 40 && !pending('care') && op6 > 300 && !has('kindergarten'), () => build('kindergarten', `待機児童 ${Math.round(st.waitlist)} 人：3〜5 歳を預かる認定こども園で受け皿を増やす`)],
    ];
    let n = 0; for (const [ok, f] of steps) { if (n >= 2) break; if (ok && f()) n++; }
  }
  // 10p. 地場の産業：田畑 → ビール工場、製鉄所 → 部品工場 → 防衛装備品工場（材料が市内でつながると売上が伸びる）。音楽専用アリーナ、クラブハウス
  if (s.month % 12 === 10 && op6 > 300 && !campaign) {
    const cnt = (k: Kind) => s.buildings.filter(b => b.kind === k).length, agriD = inRole(ROLE.suburb, ROLE.nature, ROLE.tourism), indD = inRole(ROLE.industry);
    const anyB = (k: Kind, why: string, ds?: number[]) => (ds && ds.length ? build(k, why, undefined, 1, { districts: ds }) : false) || build(k, why, undefined, 1);
    const steps: [boolean, () => boolean][] = [
      [cnt('paddy') + cnt('field') < Math.min(6, Math.floor(st.pop / 6000)), () => { const k: Kind = cnt('paddy') <= cnt('field') ? 'paddy' : 'field'; return build(k, '郊外の田畑を守り、返礼品と地元の原料にする', undefined, 1, { districts: agriD }) || build(k, '田畑を守り、返礼品と地元の原料にする', undefined, 1); }],
      [!cnt('brewery') && cnt('paddy') + cnt('field') + cnt('farm') >= 2 && st.pop > 12000, () => anyB('brewery', '地元の麦を使うビール工場を誘致する（見学・ふるさと納税の返礼品）', indD)],
      [!cnt('steelMill') && st.pop > 20000, () => anyB('steelMill', '製鉄所（電炉）を誘致する（部品・造船の材料）', indD)],
      [cnt('steelMill') > 0 && !cnt('partsPlant'), () => anyB('partsPlant', '製鉄所の鋼材を使う部品工場を誘致する（サプライチェーン）', indD)],
      [cnt('steelMill') > 0 && cnt('partsPlant') > 0 && !cnt('defensePlant') && st.pop > 30000, () => anyB('defensePlant', '鋼材と部品がそろったので、防衛装備品の工場を誘致する', indD)],
      [cnt('partsPlant') > 0 && !cnt('robotFactory') && st.pop > 18000, () => anyB('robotFactory', '部品工場があるので、ロボット工場を誘致する', indD)],
      [cnt('gasStation') < Math.min(4, Math.floor(st.pop / 8000)), () => build('gasStation', '幹線沿いにガソリンスタンドを誘致する', undefined, 1)],
      [!cnt('oilField') && st.pop > 14000, () => anyB('oilField', '郊外の小さなガス田・油田の開発を誘致する', indD)],
      [!cnt('oilRefinery') && st.pop > 28000 && cnt('port') > 0, () => anyB('oilRefinery', '港があるので、製油所と石油タンク基地を誘致する', indD)],
      [!cnt('musicArena') && (s.fame ?? 0) >= 30 && st.pop > 30000, () => anyB('musicArena', `音楽専用アリーナを誘致する（知名度 ${Math.round(s.fame ?? 0)}、コンサートで市外から人を呼ぶ）`, inRole(ROLE.center, ROLE.tourism))],
      [!cnt('clubhouse') && (s.teams ?? []).length > 0, () => anyB('clubhouse', 'プロチームの練習場とクラブハウスを誘致する（ファンを増やす）', agriD)],
      [!cnt('airport') && st.pop > 30000 && op6 > 2000 && s.cash > 60000, () => fund('airport', '空港の負担金のため', 0.8) && build('airport', '空港を国・県に要望する（市外・海外から人を呼ぶ）', undefined, 1)],
    ];
    let n = 0; for (const [ok, f] of steps) { if (n >= 2) break; if (ok && f()) n++; }
  }
  // 10q. 空港：路線の誘致（年 1 回、補助を払える範囲で）と、滑走路の延長・国際線ターミナル
  { const ap = s.buildings.find(b => b.kind === 'airport' && b.status === 'operating');
    if (ap && s.month % 12 === 11 && !campaign) {
      const lv = ap.lv ?? 1, upC = P.airportUpCost[lv + 1] ?? 0;
      if (lv < 3 && ap.upAt === undefined && !airportUpCheck(s, ap) && op6 > 3000 && can(upC + reserve * 2)) act({ type: 'airportUp', id: ap.id }, `空港を拡張する（${lv === 1 ? '滑走路を延ばして国際線' : '国際線ターミナル'}）：黒字に余裕があり、海外から人を呼ぶため`);
      else { const r = AIR_ROUTES.filter(o => !(s.airRoutes ?? []).some(x => x.id === o.id) && !airRouteCheck(s, o.id) && op6 > o.subsidy * 3 && can(o.subsidy * 6 + reserve)).sort((p, q) => q.visitors / q.subsidy - p.visitors / p.subsidy)[0];
        if (r) act({ type: 'airRoute', route: r.id, on: true }, `${r.dest}線（${r.airline}）を誘致する：来訪者と知名度を増やすため`); }
    }
    // 赤字が続くときは、効きの悪い路線から撤退
    if (op6 < -100 && (s.airRoutes ?? []).length) { const r = [...s.airRoutes!].map(x => AIR_ROUTES.find(o => o.id === x.id)!).filter(Boolean).sort((p, q) => p.visitors / p.subsidy - q.visitors / q.subsidy)[0]; if (r) act({ type: 'airRoute', route: r.id, on: false }, `${r.dest}線の補助をやめる：赤字が続いているため`); }
  }
  // 10r. 道路の改良：混む幹線を 6 車線に、混む交差点を立体交差に（年 1 回）
  if (s.month % 12 === 6 && op6 > 600) {
    acts = Math.min(acts, maxActs - 2); // 道路の改良は、ほかの手で月の手数が尽きていても打てるように
    const wide = new Set(s.wide ?? []), hot: number[] = [];
    for (let i = 0; i < N(); i++) if (s.road[i] === 2 && !wide.has(i) && s.vc[i] > 1.15) hot.push(i);
    hot.sort((a, b) => s.vc[b] - s.vc[a] || a - b);
    const money = (cost: number, why: string) => { if (can(cost)) return true; const need = Math.ceil((cost + reserve - s.cash) / 1000) * 1000; return bondF() + need <= BL * 0.8 && affordable(need) && act({ type: 'borrow', amount: need }, `市債を ${need.toLocaleString()} 万円発行：${why}`); };
    const t = hot.slice(0, 6);
    if (t.length >= 3 && money(t.length * P.wideCost, '幹線の 6 車線化のため')) act({ type: 'widen', tiles: t, on: true }, `混む幹線 ${t.length} 区間を 6 車線に広げる（混雑率 ${Math.round(s.vc[t[0]] * 100)}%）`);
    const fly = new Set(s.flyover ?? []); let best = -1;
    for (let i = 0; i < N(); i++) if (!fly.has(i) && s.vc[i] > 1.0 && isJunction(s, i) && !s.rail?.[i] && (best < 0 || s.vc[i] > s.vc[best])) best = i;
    if (best >= 0 && op6 > 1200 && money(P.flyoverCost, '立体交差のため')) act({ type: 'flyover', tiles: [best] }, `交差点を立体交差にする（${where(s, best % W, (best / W) | 0)}、混雑率 ${Math.round(s.vc[best] * 100)}%）`);
  }
  // 10s. 地形の造作：用地が足りないとき、道路沿いの急な斜面を平らにして使えるようにする
  if (needLand && s.month % 6 === 1 && op6 > 400 && !REAL) {
    const m = getMap(s.seed), cand: number[] = [];
    for (let i = 0; i < N() && cand.length < 6; i++) {
      if (!m.steep[i] || m.water[i] || m.forest[i] || s.occ[i] || s.road[i] || s.rail?.[i]) continue;
      const x = i % W, y = (i / W) | 0;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < H && s.road[idx(x + dx, y + dy)])) cand.push(i);
    }
    if (cand.length && can(cand.length * (P.terraCost.flatten ?? 300) + reserve)) act({ type: 'terra', tiles: cand, op: 'flatten' }, `道路沿いの急な斜面 ${cand.length} 区画を造成して平らにする（用地が足りないため）`);
  }
  // 10t. ビジョン専用の施設：選んだビジョンの専用施設を、余裕ができたら建てる
  if (s.vision && s.month % 6 === 3 && op6 > 500 && !campaign) {
    const pk = VISION_PERKS[s.vision];
    if (pk && !s.buildings.some(b => b.kind === pk.kind) && fund(pk.kind, `${DEFS[pk.kind].name}の整備のため（ビジョン）`, 0.85)) build(pk.kind, `ビジョン「${VISIONS.find(v => v.id === s.vision)?.name ?? ''}」の専用施設`, undefined, 1);
  }
  // 10f. 葬祭：亡くなる人が斎場（火葬場）の受け入れを超えたら斎場を。霊園と葬儀場も。斎場は迷惑施設なので、住宅から離れた産業の地区へ
  if (s.month % 3 === 0 && st.pop > 6000 * (REAL ? 0 : 1)) {
    const has = (k: Kind) => s.buildings.some(b => b.kind === k);
    if ((st.deaths ?? 0) > 6 && (st.deaths ?? 0) > s.buildings.filter(b => b.kind === 'crematorium' && b.status !== 'suspended').reduce((a, b) => a + DEFS[b.kind].capacity * (b.lv ?? 1), 0) * 0.9) build('crematorium', `市内の斎場で見送れない人が月 ${Math.round(Math.max(0, (st.deaths ?? 0) - (st.cremCap ?? 0)))} 人（隣の市に頼むと 1 件 ${P.cremOut} 万円かかる）`, undefined, 2);
    else if (!has('cemetery') && st.pop > 9000 && op6 > 200) { if (!build('cemetery', '市営の霊園がない（お墓を遠くに求める世帯がいる）', undefined, 2, { districts: inRole(ROLE.suburb, ROLE.nature, ROLE.industry, ROLE.tourism) })) build('cemetery', '市営の霊園がない（お墓を遠くに求める世帯がいる）', undefined, 2); }
    else if (!has('funeralHall') && st.pop > 7000) build('funeralHall', '市内に葬儀場がない');
  }
  // 10g. 医療：病人が多ければ、病院・急病センター
  if ((st.sick ?? 0) > st.pop * 0.028 && !pending('health') && s.month % 4 === 1 && op6 > 0) build(s.buildings.some(b => b.kind === 'hospital') ? 'nightClinic' : 'hospital', `治療が必要な人が約 ${Math.round(st.sick ?? 0)} 人（医療が届いていない地区がある）`, b => sumHH(b) * (1 - b.sv[7]), 1);
  // 10h. 観光・歴史・文化：計画で観光・自然・中心の地区に、寺社・城跡・ランドマークを順に（年 1 回、余裕があれば）
  if (s.month % 6 === 1 && op6 > 500 && !campaign) { // 半年に 1 つ
    const cnt = (k: Kind) => s.buildings.filter(b => b.kind === k).length;
    const T: [Kind, boolean, number][] = [
      ['shrine', true, 2], ['castleRuins', st.pop > 8000, 1], ['temple', st.pop > 10000, 1], ['lighthouse', true, 1], ['observatory', st.pop > 12000, 1], ['church', st.pop > 12000, 1],
      ['botanical', st.pop > 15000 && op6 > 1200, 1], ['ferrisWheel', (s.fame ?? 0) >= 20, 1], ['grandShrine', (s.fame ?? 0) >= 25, 1], ['tower', st.pop > 20000 && s.cash > 90000, 1],
      ['castle', st.pop > 25000 && s.cash > 180000, 1], ['operaHouse', st.pop > 35000 && s.cash > 150000, 1],
      ['jidokan', st.pop > 8000, Math.floor(st.pop / 15000) + 1], ['pool', st.pop > 12000, 1], ['japaneseGarden', st.pop > 14000, 1], ['athletics', st.pop > 20000 && op6 > 1500, 1], ['weddingHall', st.pop > 15000, 1], ['kidsPark', st.pop > 15000, 1],
      ['amusementPark', st.pop > 22000 && (s.fame ?? 0) >= 20, 1], ['giantRobot', (s.fame ?? 0) >= 25, 1], ['outletMall', st.pop > 25000, 1], ['esportsArena', st.pop > 20000, 1], ['skyscraper', st.pop > 20000 && (s.fame ?? 0) >= 30, 1], ['ancientRuins', st.pop > 16000, 1], ['tvStation', st.pop > 15000, 1], ['megaBank', st.pop > 30000, 1], ['globalIT', st.pop > 25000 && (s.fame ?? 0) >= 35, 1], ['parkingTower', st.pop > 18000, Math.floor(st.pop / 20000)], ['megaPark', st.pop > 30000 && (s.fame ?? 0) >= 45, 1]];
    const ds = inRole(ROLE.tourism, ROLE.nature, ROLE.center);
    for (const [k, ok, max] of T) { if (!ok || cnt(k) >= max || !findSpot(s, k, undefined, { districts: ds.length ? ds : undefined }) || !fund(k, `${DEFS[k].name}の整備のため（観光・歴史・文化の計画）`)) continue; if (build(k, `都市計画（観光・歴史・文化）：${DEFS[k].name}で市外から人を呼ぶ（知名度 ${Math.round(s.fame ?? 0)}）`, undefined, 2, { districts: ds.length ? ds : undefined })) break; }
  }
  // 10i. プロスポーツの本拠地：知名度が届きそうなら、アリーナ（体育館）・スタジアム・野球場を用意する
  if (s.month % 6 === 5 && op6 > 600 && !campaign) {
    const venue = (ks: Kind[]) => s.buildings.some(b => ks.includes(b.kind));
    const fame = s.fame ?? 0, ds = inRole(ROLE.center, ROLE.tourism, ROLE.suburb);
    if (fame >= SPORTS.basket.fameReq - 3 && !venue(SPORTS.basket.venue) && st.pop > 8000 && fund(st.pop > 20000 ? 'arena' : 'gym', 'プロスポーツの本拠地のため', 0.92)) build(st.pop > 20000 ? 'arena' : 'gym', `プロバスケットボールの本拠地を用意する（知名度 ${Math.round(fame)}）`, undefined, 2, { districts: ds });
    else if (fame >= SPORTS.soccer.fameReq - 3 && !venue(SPORTS.soccer.venue) && st.pop > 15000 && op6 > 1500 && fund('stadium', 'プロサッカーの本拠地のため', 0.92)) build('stadium', `プロサッカーの本拠地を用意する（知名度 ${Math.round(fame)}）`, undefined, 2, { districts: ds });
    else if (fame >= SPORTS.baseball.fameReq - 3 && !venue(SPORTS.baseball.venue) && st.pop > 25000 && op6 > 2000 && fund('ballpark', 'プロ野球の本拠地のため', 0.92)) build('ballpark', `プロ野球の本拠地を用意する（知名度 ${Math.round(fame)}）`, undefined, 2, { districts: ds });
  }
  // 10b. プロスポーツ：本拠地があり、余裕があればチームをつくる
  if (L.operating > 200) for (const sp of ['basket', 'soccer', 'baseball'] as const) if (!teamCheck(s, sp) && can(SPORTS[sp].cost + reserve)) { act({ type: 'team', sport: sp, on: true }, `${SPORTS[sp].name}のチームをつくる：本拠地と知名度がそろったため`); break; }
  // 11. 道路の老朽化と財政
  let old70 = 0, tot = 0; for (let i = 0; i < N(); i++) if (s.road[i] === 1 || s.road[i] === 2) { tot++; if (s.roadAge[i] > 60) old70++; }
  // 傷んだ市道（老朽度 65 超）を、交通量の多い順に補修する（月 12 区間まで）
  if (!saving || old70 / Math.max(1, tot) > 0.2) {
    const bad: number[] = []; for (let i = 0; i < N(); i++) if ((s.road[i] === 1 || s.road[i] === 2) && s.roadAge[i] > 65) bad.push(i);
    bad.sort((a, b) => s.vc[b] - s.vc[a] || s.roadAge[b] - s.roadAge[a]);
    const k = Math.min(bad.length, 12, Math.floor((s.cash - reserve) / P.roadRepairCost));
    if (k > 0) act({ type: 'repair', tiles: bad.slice(0, k) }, `傷んだ市道を ${k} 区間補修：老朽度が 65 を超えたため`);
  }
  if (tot && old70 / tot > 0.12 && !s.policies.roadCare?.on && L.operating > 250) act({ type: 'policy', id: 'roadCare', on: true }, '道路維持強化を始める：古い市道が多い');
  // 一時借入が出たら、保育以外の政策を 1 つずつやめる
  if (s.loans.some(l => l.kind === 'temp' && l.remaining > 0)) { const on = POLICIES.filter(p => s.policies[p.id]?.on && p.id !== 'careStaff').sort((a, b) => b.cost - a.cost)[0]; if (on) act({ type: 'policy', id: on.id, on: false }, `「${on.name}」をやめる：一時借入をなくすため`); }
  const recent = s.ledger.slice(-3);
  if (recent.length === 3 && recent.every(l => l.operating < -150)) {
    const on = POLICIES.filter(p => s.policies[p.id]?.on).sort((a, b) => b.cost - a.cost)[0];
    if (on && on.id !== 'careStaff') act({ type: 'policy', id: on.id, on: false }, `「${on.name}」をやめる：赤字が続いているため`);
    else if (!campaign && s.tax.prop < 1.1 && (s.acts['tax:prop'] === undefined || s.month - s.acts['tax:prop'] >= 6)) act({ type: 'tax', key: 'prop', v: Math.round((s.tax.prop + 0.05) * 100) / 100 }, '固定資産税を 5% 上げる：赤字が続いているため（住民税より支持率への影響が小さい）');
    else if (!campaign && s.tax.res < 1.04 && st.vacancy < 0.08 && s.cash < reserve * 2 && (s.acts['tax:res'] === undefined || s.month - s.acts['tax:res'] >= 6)) act({ type: 'tax', key: 'res', v: Math.round((s.tax.res + 0.04) * 100) / 100 }, '住民税を 4% 上げる：赤字が続き、資金も少ないため');
  }
  // 12. 支持率が下がったら対話集会、年 1 回は市民まつり
  if (s.approval < (s.mode === 'term' ? 0.45 : 0.52) && (s.acts.townhall === undefined || s.month - s.acts.townhall >= 6) && can(50)) act({ type: 'civic', id: 'townhall' }, `地区ごとの対話集会：支持率 ${Math.round(s.approval * 100)}%`);
  if (!saving && s.month % 12 === 6 && can(600 + reserve) && (s.acts.festival === undefined || s.month - s.acts.festival >= 12)) act({ type: 'civic', id: 'festival' }, '市民まつりを開く');
  return out;
}
