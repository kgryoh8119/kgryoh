// 今月の街の課題（v85・第 2 段階 D）
// 声（voices）・満足を下げている要因（satDrag）・施設の稼働（effCap / used / staff / connected）・履歴（history）・台帳（ledger）を
// 同じ元データとして使い、「いちばん先に手を付けるとよいこと」を最大 3 件にしぼる。
// ここは読むだけ：状態を変えない・乱数を使わない・建設や政策の変更を自動でしない。
import { DISTRICTS, type GameState, type Building, type Layer } from './types';
import { DEFS, GOALS, P, SAT_PARTS, W } from './config';
import { getMap, isCastaway } from './map';
import { isleNext, foodSelf } from './isle';
import { designCap, staffReq } from './core';
import { loopOfIssue, loopIssueSeeds, loopIndicators, LOOPS, type LoopId } from './loops';
import { goalProgress, tempDebt, fiscalCrisis, monthlyBudget, electionOutlook, voteText, WIN_VOTE } from './step';

/** 対策の候補。押すと道具・資料を開くだけ（実行はプレイヤーが決める） */
export interface IssueOption { label: string; act: string; arg: string; note?: string }
export interface Issue {
  /** 同じ問題を 2 回出さないための鍵（保育は地区が違っても 1 件にまとめる） */
  key: string;
  title: string;
  /** 何が起きたか */
  what: string;
  /** どこ */
  where: string;
  /** 主因 */
  cause: string;
  /** 主因の種類（保育：facility / staff / road / place / wait など。原因に合わない対策を勧めないために使う） */
  causeKind: string;
  options: IssueOption[];
  /** 地図で見る場所（-1 はなし）と、重ねる表示 */
  tile: number; layer: Layer;
  /** 重要度の内訳（各 0〜1）：影響する人の割合・悪化の傾向・期限の近さ・戻しにくさ */
  parts: { people: number; trend: number; deadline: number; hard: number };
  /** 影響を受ける人（世帯・人のおおよその数。表示用） */
  affected: string;
  score: number;
  /** v90：この課題が入口になるゲームループ（対策の候補は loopOptions(s, loop) で比べる） */
  loop?: LoopId;
}

/** 重要度の重み（合計 100）。影響人数を基本に、悪化・期限・戻しにくさを足す */
export const ISSUE_W = { people: 40, trend: 20, deadline: 20, hard: 20 };
const c01 = (v: number) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
const n0 = (v: number) => Math.round(v).toLocaleString();
const pc = (v: number) => `${Math.round(v * 100)}%`;
const tileOf = (b: Building) => b.y * W + b.x;

/** 直近 k か月で、値がどれだけ悪いほうへ動いたか（0〜1）。up=true は「増えると悪い」 */
function worsening(s: GameState, f: (h: GameState['history'][number]) => number, up: boolean, scale: number, k = 6): number {
  const H = s.history; if (H.length < 2) return 0;
  const a = f(H[Math.max(0, H.length - 1 - k)]), b = f(H[H.length - 1]);
  return c01((up ? b - a : a - b) / scale);
}

/** 保育の待機の原因を分ける：施設不足・職員不足・道路につながっていない・場所が合っていない・完成待ち */
export function careCause(s: GameState): { kind: 'none' | 'facility' | 'staff' | 'road' | 'place' | 'wait'; text: string; lostStaff: number; lostRoad: number; spare: number; pending: number; pendingMonths: number; cut: Building | null; short: Building | null } {
  const st = s.stats, B = s.buildings.filter(b => DEFS[b.kind].fam === 'care' || b.kind === 'privNursery');
  const op = B.filter(b => b.status === 'operating');
  let lostStaff = 0, lostRoad = 0, spare = 0, cut: Building | null = null, short: Building | null = null, shortBy = 0;
  for (const b of op) {
    const dc = designCap(s, b);
    if (!b.connected) { lostRoad += dc; cut ??= b; continue; }
    const req = staffReq(s, b), lack = req > 0 && (b.staff ?? 0) < req * 0.95 ? Math.max(0, dc - b.effCap) : 0;
    lostStaff += lack; if (lack > shortBy) { shortBy = lack; short = b; }
    spare += Math.max(0, b.effCap - b.used);
  }
  const con = B.filter(b => b.status === 'construction'), pending = con.reduce((a, b) => a + designCap(s, b), 0), pendingMonths = con.reduce((m, b) => Math.max(m, b.remain ?? 0), 0);
  const wait = st.waitlist, base = { lostStaff, lostRoad, spare, pending, pendingMonths, cut, short };
  if (wait < 1) return { kind: 'none', text: '待機はありません', ...base };
  // 主因：待機のうち、いちばん多くを説明できるもの
  const cand: ['road' | 'staff' | 'place', number][] = [['road', Math.min(wait, lostRoad)], ['staff', Math.min(wait, lostStaff)], ['place', Math.min(wait, spare)]];
  cand.sort((a, b) => b[1] - a[1]);
  const [k, v] = cand[0];
  if (v >= wait * 0.4 && v >= 3) {
    if (k === 'road') return { kind: 'road', text: `道路につながっていない園があり、定員 ${n0(lostRoad)} 人分が使えていません（建物も職員もあるのに、通えない）`, ...base };
    if (k === 'staff') return { kind: 'staff', text: `保育士が足りず、建物の定員のうち ${n0(lostStaff)} 人分を受け入れられていません（園を増やしても、職員がいなければ受け入れは増えません）`, ...base };
    return { kind: 'place', text: `市内の園には ${n0(spare)} 人分の空きがありますが、待機のある地区から道路で 900m 以内にありません（数は足りていて、場所が合っていない）`, ...base };
  }
  if (pending >= wait * 0.8) return { kind: 'wait', text: `建設中の園（定員 ${n0(pending)} 人）が、あと最長 ${pendingMonths} か月で完成します。完成して職員がそろうまで待機は残ります`, ...base };
  return { kind: 'facility', text: `保育を希望する子ども ${n0(st.careDemand)} 人に対し、受け入れは ${n0(st.careCap)} 人。建物の定員そのものが足りていません${pending > 0 ? `（建設中 ${n0(pending)} 人分を入れても不足）` : ''}`, ...base };
}

/** 今月の課題の候補をすべて出す（重要度の高い順・同じ問題はまとめる）。画面は先頭の 3 件を使う */
export function allIssues(s: GameState): Issue[] {
  const st = s.stats, m = getMap(s.seed), out: Issue[] = [];
  const pop = Math.max(1, st.pop), hh = Math.max(1, st.households), per = pop / hh;
  const add = (i: Omit<Issue, 'score'>) => {
    const p = i.parts, score = ISSUE_W.people * c01(p.people) + ISSUE_W.trend * c01(p.trend) + ISSUE_W.deadline * c01(p.deadline) + ISSUE_W.hard * c01(p.hard);
    out.push({ ...i, score: Math.round(score * 10) / 10 });
  };
  const voice = (pred: (k: string) => boolean) => s.voices.filter(v => v.tone !== 'good' && pred(v.key)).sort((a, b) => (a.tone === 'bad' ? 0 : 1) - (b.tone === 'bad' ? 0 : 1))[0];
  const dname = (d: number) => (d >= 0 && d < DISTRICTS.length ? DISTRICTS[d] : '市全体');
  const left = s.mode === 'term' ? s.termLength - (s.month - s.termStart) : 99;
  /** 公約に入っていて、まだ達成していないなら、任期の残りに応じて期限の重みを付ける */
  const pledge = (id: string) => { const g = (s.goals ?? []).find(x => x.id === id); if (!g || goalProgress(s, g).ok) return 0; return c01(1 - left / 36) * 0.7 + 0.3; };
  const drag = (k: number) => st.satDrag?.[k] ?? 0, part = (k: number) => st.satParts?.[k] ?? 1;

  // ---- v88：無人島の開拓の次の一手
  if (isCastaway(s.seed)) {
    const nx = isleNext(s), f = foodSelf(s);
    if (nx) add({ key: 'isle', title: `開拓：${nx.title}`, what: nx.how, where: '島全体', cause: s.stats.pop < 1 ? 'まだ誰も住んでいません。桟橋・道・水・電気・住まいがそろうと、定期船で開拓者が来ます' : `いま ${n0(s.stats.pop)} 人。食べ物の自給率 ${pc(f.self)}（足りない分は船で運び、運賃がかかります）`, causeKind: 'isle',
      options: [nx.kind ? { label: `${DEFS[nx.kind].name}を建てる`, act: 'tool', arg: 'build:' + nx.kind } : { label: '道路を引く', act: 'tool', arg: 'road:1' }], tile: -1, layer: 'none', parts: { people: 1, trend: 0, deadline: 0.3, hard: 0.5 }, affected: '島の開拓者' });
  }
  // ---- 保育
  if (st.waitlist >= 3) {
    const cc = careCause(s), wd = st.waitDistrict.map((v, d) => ({ v, d })).sort((a, b) => b.v - a.v)[0], v = voice(k => k.startsWith('care'));
    const o: IssueOption[] = [];
    if (cc.kind === 'road') { o.push({ label: 'つながっていない園を見る', act: 'focus', arg: `${cc.cut ? tileOf(cc.cut) : -1}:conn` }, { label: '道路を引く', act: 'tool', arg: 'road:1', note: '園の前まで道路をつなぐ' }); }
    else if (cc.kind === 'staff') { o.push({ label: '政策「保育人材支援」を見る', act: 'tab', arg: 'policy', note: '効果が出るまで数か月' }, { label: '職員の足りない園を見る', act: 'focus', arg: `${cc.short ? tileOf(cc.short) : -1}:care` }); }
    else if (cc.kind === 'place') { o.push({ label: '待機のある住宅を地図で見る', act: 'issue', arg: 'seeCare', note: '赤い住宅ほど入れない子がいる' }, { label: '待機のある地区に小さな園を建てる', act: 'tool', arg: 'build:nurseryS', note: `${dname(wd.d)}の近くへ` }); }
    else if (cc.kind === 'wait') { o.push({ label: '建設中の園を見る', act: 'tab', arg: 'fac', note: `あと最長 ${cc.pendingMonths} か月` }, { label: '完成後の職員に備える（政策）', act: 'tab', arg: 'policy' }); }
    else { o.push({ label: st.waitlist > 40 ? '保育園を建てる' : '小さな保育園を建てる', act: st.waitlist > 40 ? 'issue' : 'tool', arg: st.waitlist > 40 ? 'buildNursery' : 'build:nurseryS', note: `${dname(wd.d)}の近くへ。開園まで ${DEFS[st.waitlist > 40 ? 'nursery' : 'nurseryS'].months} か月` }, { label: '政策「保育人材支援」を見る', act: 'tab', arg: 'policy', note: '建てたあとの職員の確保に' }); }
    add({ key: 'care', title: `保育園に入れない子ども ${n0(st.waitlist)} 人`, what: `保育を希望しても入れない子どもが ${n0(st.waitlist)} 人います。子育て世帯の満足が下がり、転出や出生の減少につながります`, where: `${dname(wd.d)}（待機 ${n0(wd.v)} 人）がいちばん多い`, cause: cc.text, causeKind: cc.kind, options: o, tile: v?.tile ?? -1, layer: 'care',
      parts: { people: (st.waitlist * 3) / pop * 12, trend: worsening(s, h => h.wait, true, Math.max(10, st.waitlist * 0.5)), deadline: pledge('wait'), hard: cc.kind === 'wait' ? 0 : 0.3 }, affected: `子ども ${n0(st.waitlist)} 人とその世帯` });
  }

  // ---- 財政（一時借入・赤字）
  { const td = tempDebt(s), L = monthlyBudget(s), last = s.ledger.slice(-6), op = last.length ? last.reduce((a, l) => a + l.operating, 0) / last.length : L.operating;
    if (td > 0 || op < 0 || s.cash < 3000) {
      const crisis = fiscalCrisis(s), runway = op < 0 ? s.cash / -op : 99;
      add({ key: 'fiscal', title: td > 0 ? (crisis ? `財政危機：一時借入 ${n0(td)} 万円` : `一時借入 ${n0(td)} 万円が残っています`) : op < 0 ? `毎月の収支が赤字（平均 ${n0(op)} 万円/月）` : `市の資金が残り ${n0(s.cash)} 万円です`,
        what: td > 0 ? `資金が足りない月に、年利 ${Math.round(P.tempRate * 100)}% の一時借入をしています。選挙でも大きく不利になります${crisis ? '。上限を超えたため、新しい道路をつくれません' : ''}` : op < 0 ? `直近 ${last.length || 1} か月の平均で、毎月 ${n0(-op)} 万円ずつ資金が減っています` : '資金が少なく、建設や施設の更新ができなくなります',
        where: '市全体（財政）', cause: op < 0 ? `毎月の支出が収入を上回っています。${runway < 99 ? `いまの資金では、あと約 ${Math.max(0, Math.floor(runway))} か月で底をつきます` : ''}` : td > 0 ? '収支は黒字ですが、過去の一時借入がまだ残っています。黒字の分で返していけます' : `収支は黒字（平均 +${n0(op)} 万円/月）ですが、手元の資金を使い切っています。待てば貯まります。急ぐなら市債を発行できます`, causeKind: op < 0 ? 'deficit' : td > 0 ? 'debt' : 'cash',
        options: [{ label: '財政の内訳を見る', act: 'tab', arg: 'money', note: '何に使っているかを確かめる' }, { label: '政策を見直す', act: 'tab', arg: 'policy', note: '費用のかかる政策・税率' }], tile: -1, layer: 'none',
        parts: { people: td > 0 ? 1 : op < 0 ? c01(-op / 400) : 0.3, trend: worsening(s, h => h.op, false, 300), deadline: Math.max(pledge('fiscal'), runway < 24 ? c01(1 - runway / 24) : 0), hard: td > 0 ? (crisis ? 1 : 0.7) : 0.3 }, affected: '市民全員（市の財政）' });
    } }

  // ---- 老朽化で使用停止・停止が近い施設
  { const stop = s.buildings.filter(b => b.status === 'suspended' && b.age >= 99), old = s.buildings.filter(b => b.status === 'operating' && b.age >= 80 && DEFS[b.kind].renewCost > 0);
    if (stop.length || old.length) {
      const worst = (stop.length ? stop : old).slice().sort((a, b) => b.age - a.age)[0], famName = DEFS[worst.kind].name;
      add({ key: 'aging', title: stop.length ? `老朽化で使用停止の施設 ${stop.length} か所` : `使用停止が近い施設 ${old.length} か所（老朽度 80 以上）`,
        what: stop.length ? `老朽度が 100 に達した施設が止まり、その分のサービスが届いていません（${famName} など）` : `老朽度が 100 になると使用停止になります。いちばん古いのは ${famName}（老朽度 ${Math.round(worst.age)}）`,
        where: `${dname(m.district[tileOf(worst)])}の${famName}`, cause: '建ててから年数がたち、更新の時期を過ぎています。更新すると老朽度が 0 に戻ります（更新中は数か月休みます）', causeKind: stop.length ? 'stopped' : 'old',
        options: [stop.length ? { label: `止まっている ${stop.length} か所をまとめて更新`, act: 'renewall', arg: 'all', note: '資金の続く限り' } : { label: 'いちばん古い施設を見る', act: 'focus', arg: `${tileOf(worst)}:age` }, { label: '老朽度を地図で見る', act: 'layer', arg: 'age' }], tile: tileOf(worst), layer: 'age',
        parts: { people: stop.length ? 0.6 : 0.25, trend: old.length ? 0.5 : 0, deadline: Math.max(pledge('water'), stop.length ? 1 : c01((Math.max(...old.map(b => b.age)) - 80) / 20)), hard: stop.length ? 0.8 : 0.5 }, affected: stop.length ? `${stop.length} か所の利用者` : `${old.length} か所の利用者（止まった場合）` });
    } }

  // ---- ライフライン・学校の容量不足（足りない世帯・人の数で見る）
  { const caps: [string, string, number, number, string, string, Layer][] = [
      ['water', '水道', st.waterCap, st.waterDemand, '世帯', 'build:waterS', 'life'], ['sewage', '下水', st.sewageCap, st.sewageDemand, '世帯', 'build:sewageS', 'life'], ['power', '電力', st.powerCap, st.powerDemand, '世帯分', 'build:substation', 'life'],
      ['waste', 'ごみ処理', st.wasteCap, st.wasteDemand, '世帯', 'build:waste', 'life'], ['school', '小学校', st.schoolCap, st.schoolKids, '人', 'build:school', 'edu'], ['jhs', '中学校', st.jhsCap, st.jhsKids, '人', 'build:jhs', 'edu']];
    const lack = caps.map(c => ({ c, short: c[3] - c[2] })).filter(x => x.short > Math.max(5, x.c[3] * 0.03)).sort((a, b) => b.short / Math.max(1, b.c[3]) - a.short / Math.max(1, a.c[3]));
    if (lack.length) {
      const { c, short } = lack[0], isKid = c[4] === '人', stopped = s.buildings.filter(b => DEFS[b.kind].fam === c[0] && b.status === 'suspended').length, building = s.buildings.filter(b => DEFS[b.kind].fam === c[0] && b.status === 'construction');
      const cause = stopped ? `${c[1]}の施設が ${stopped} か所止まっていて、容量が減っています（新設より、まず更新・再開）` : building.length ? `需要 ${n0(c[3])} に対し容量 ${n0(c[2])}。建設中 ${building.length} か所が、あと最長 ${building.reduce((mm, b) => Math.max(mm, b.remain ?? 0), 0)} か月で完成します` : `人口が増えて、需要 ${n0(c[3])} ${c[4]}が容量 ${n0(c[2])} ${c[4]}を超えました`;
      add({ key: 'cap:' + c[0], title: `${c[1]}が ${n0(short)} ${c[4]}足りません${lack.length > 1 ? `（ほか ${lack.slice(1).map(x => x.c[1]).join('・')}）` : ''}`, what: isKid ? `${c[1]}が定員を超えて過密になり、子育て世帯の満足が下がっています` : `${c[1]}が届かない世帯があり、暮らしの満足が大きく下がります。新しい住宅も建ちにくくなります`,
        where: '市全体', cause, causeKind: stopped ? 'stopped' : building.length ? 'wait' : 'facility',
        options: [stopped ? { label: '止まっている施設を更新', act: 'renewall', arg: c[0] } : building.length ? { label: '建設中の施設を見る', act: 'tab', arg: 'fac' } : { label: `${c[1]}の施設を建てる`, act: 'tool', arg: c[5] }, { label: '届いている範囲を見る', act: 'layer', arg: c[6] }], tile: -1, layer: c[6],
        parts: { people: (short * (isKid ? 3 : per)) / pop * 4, trend: 0.4, deadline: 0, hard: stopped ? 0.6 : 0.3 }, affected: `${n0(short)} ${c[4]}` });
    } }

  // ---- 道路の混雑
  if (st.maxVc > 1.05) {
    const v = voice(k => k === 'traffic');
    add({ key: 'traffic', title: `朝の道路が混んでいます（最大 ${pc(st.maxVc)}）`, what: `通勤の所要時間が、空いているときの ${st.avgDelay.toFixed(2)} 倍になっています。働く世帯の満足が下がります`, where: v && v.district >= 0 ? `${dname(v.district)}の、駅・国道へ向かう道` : 'いちばん混む市道',
      cause: st.localJobs < st.workers * 0.5 ? `市内の職が働き手の ${pc(st.localJobs / Math.max(1, st.workers))} しかなく、多くの人が同じ道で駅・国道へ向かっています` : '住宅が増えた地区から駅・国道へ向かう経路が、少ない道に集中しています', causeKind: st.localJobs < st.workers * 0.5 ? 'jobs' : 'road',
      options: [{ label: '混んでいる道を見る', act: 'issue', arg: 'seeTraffic' }, { label: '幹線道路に広げる', act: 'issue', arg: 'widen', note: '混む道の上を幹線に引き直すか、並行する道を' }, ...(st.localJobs < st.workers * 0.5 ? [{ label: '業務地を指定する', act: 'tool', arg: 'zone:5', note: '市内に職を増やして遠くへの通勤を減らす' }] : [])], tile: v?.tile ?? -1, layer: 'traffic',
      parts: { people: c01(drag(1) * 12 + (st.maxVc - 1) * 0.6), trend: worsening(s, h => h.maxVc, true, 0.25), deadline: pledge('traffic'), hard: 0.2 }, affected: `働く世帯（通勤の満足 ${pc(part(1))}）` });
  }

  // ---- 暮らしの満足を下げている要因（上で扱ったものは除く：保育 2・通勤 1・ライフライン 7・学校 3）
  { const skip = new Set([1, 2, 3, 7]);
    const HINT: Record<number, { cause: string; opts: IssueOption[]; layer: Layer; voice?: string }> = {
      0: { cause: '税と住宅費の負担が重い、または住める住宅が足りず家賃が上がっています', opts: [{ label: '税率を見る', act: 'tab', arg: 'money' }, { label: '住宅地を広げる', act: 'tool', arg: 'devarea:1', note: '空き住戸を 3〜5% に' }], layer: 'land' },
      4: { cause: '公園の遠い住宅地があります（歩いて行ける範囲に公園がない）', opts: [{ label: '公園を建てる', act: 'tool', arg: 'build:parkM' }, { label: '緑・環境を地図で見る', act: 'layer', arg: 'env' }], layer: 'env' },
      5: { cause: '住宅地の近くに店がありません（歩いて行ける範囲の買物先が足りない）', opts: [{ label: '商業地を指定する', act: 'tool', arg: 'zone:4', note: '住宅地の近く・道路沿いに' }], layer: 'none' },
      6: { cause: '消防・防災の届いていない世帯があります', opts: [{ label: '消防の出張所を建てる', act: 'tool', arg: 'build:fireS' }, { label: '防災を地図で見る', act: 'layer', arg: 'disaster' }], layer: 'disaster' },
      8: { cause: `市内の職が働き手の ${pc(st.localJobs / Math.max(1, st.workers))} です。職が少ないと失業や遠距離通勤が増えます`, opts: [{ label: '業務地を指定する', act: 'tool', arg: 'zone:5' }, { label: '市政（産業）を見る', act: 'tab', arg: 'city' }], layer: 'none' },
      9: { cause: '診療所・病院が遠い、または足りない地区があります', opts: [{ label: s.buildings.some(b => b.kind === 'hospital') ? '夜間診療所を建てる' : '病院を建てる', act: 'tool', arg: s.buildings.some(b => b.kind === 'hospital') ? 'build:nightClinic' : 'build:hospital' }, { label: '医療を地図で見る', act: 'layer', arg: 'health' }], layer: 'health' },
      10: { cause: `空き家（空き住戸 ${pc(st.vacancy)}）・買物先の少なさ・見守りの届かない場所が、不安のもとになっています`, opts: [{ label: '交番を建てる', act: 'tool', arg: 'build:koban' }, { label: '治安を地図で見る', act: 'layer', arg: 'safety' }], layer: 'safety' },
      11: { cause: '工場・幹線道路・迷惑施設が住宅に近い、または緑が少ない地区があります', opts: [{ label: '公園・緑を建てる', act: 'tool', arg: 'build:parkM' }, { label: '環境を地図で見る', act: 'layer', arg: 'env' }], layer: 'env' },
      12: { cause: '図書館・体育館などの文化・スポーツ施設が足りない、または遠い地区があります', opts: [{ label: '図書館の分館を建てる', act: 'tool', arg: 'build:libraryS' }, { label: '文化を地図で見る', act: 'layer', arg: 'culture' }], layer: 'culture' },
      13: { cause: `介護が必要な高齢者 ${n0(st.elderNeed)} 人に対し、施設の定員は ${n0(st.elderCap)} 人です`, opts: [{ label: '高齢者施設を建てる', act: 'tool', arg: 'build:elderly' }, { label: '福祉を地図で見る', act: 'layer', arg: 'welfare' }], layer: 'welfare' },
    };
    const top = SAT_PARTS.map((n, k) => ({ n, k, d: drag(k) })).filter(x => !skip.has(x.k) && HINT[x.k] && x.d >= 0.008).sort((a, b) => b.d - a.d);
    for (const t of top.slice(0, 2)) { // 似た重さの要因が並んでも、候補に入れるのは 2 つまで
      const h = HINT[t.k], wd = st.satDistrict.map((v, d) => ({ v, d })).filter(x => x.v > 0).sort((a, b) => a.v - b.v)[0]; // 住んでいる人のいない地区（満足 0）は除く
      add({ key: 'sat:' + t.k, title: `「${t.n}」が暮らしの満足を下げています（−${(t.d * 100).toFixed(1)} 点）`, what: `${t.n}の満足は ${pc(part(t.k))}。市全体の満足を ${(t.d * 100).toFixed(1)} 点下げている、いまいちばん大きい要因${top[0] === t ? '' : 'のひとつ'}です`, where: wd ? `満足のいちばん低い地区は${dname(wd.d)}（${pc(wd.v)}）` : '市全体', cause: h.cause, causeKind: 'sat',
        options: h.opts, tile: -1, layer: h.layer, // 満足の要因は「どの街にもある程度ある不足」を含むので、具体的な不足（保育・混雑・容量）より控えめに数える
        parts: { people: c01(t.d * 14) * 0.5, trend: worsening(s, x => x.sat, false, 0.04) * 0.6, deadline: pledge('sat'), hard: 0.1 }, affected: `市民の満足（${t.n} ${pc(part(t.k))}）` });
    } }

  // ---- 住宅が足りない（住みたい世帯が入れない）
  if (st.vacancy < 0.03 && st.pentUp > 0.5 && st.waterCap >= st.waterDemand * 1.02)
    add({ key: 'housing', title: `空いている住宅がほとんどありません（空き ${(st.vacancy * 100).toFixed(1)}%）`, what: `住みたいのに入れない世帯が月 ${st.pentUp.toFixed(1)} 世帯あります。人口が伸びず、家賃の負担も上がります`, where: '市全体（住宅地）', cause: '住宅の用途に指定した土地が埋まっています。道路を引いてその両側を住宅地にすると、民間が家を建てます', causeKind: 'zone',
      options: [{ label: '住宅地を広げる（区画整理）', act: 'tool', arg: 'devarea:1' }, { label: '道路を引く', act: 'issue', arg: 'road' }, { label: '住宅の用途を指定する', act: 'issue', arg: 'zone' }], tile: -1, layer: 'none',
      parts: { people: c01(st.pentUp * 12 * per / pop * 6), trend: 0.3, deadline: Math.max(pledge('pop'), pledge('popBig')), hard: 0.1 }, affected: `転入を希望する月 ${st.pentUp.toFixed(1)} 世帯` });

  // ---- 再選が危うい（任期の残りが少なく、当選の見込みが 5 割を切っている）
  if (s.mode === 'term' && (s.goals ?? []).length && left <= 18) { const o = electionOutlook(s);
    if (o.win < 0.5) { const worst = o.parts.filter(p => p.v < 0).sort((a, b) => a.v - b.v)[0];
      add({ key: 'election', title: `このままでは再選が危うい（当選の見込み ${Math.round(o.win * 100)}%）`, what: `任期は残り ${left} か月。得票の見込みは ${voteText(o.vote)}% で、当選には ${WIN_VOTE}% 以上が必要です`, where: '市全体（選挙）', cause: worst ? `いちばん得票を下げているのは「${worst.label}」（${worst.v.toFixed(1)} 点）です` : '得票の見込みが当選の線に届いていません', causeKind: 'election',
        options: [{ label: '得票の内訳と公約を見る', act: 'tab', arg: 'term', note: '何が足を引っぱっているか' }], tile: -1, layer: 'none', parts: { people: 0.5, trend: 0, deadline: c01(1 - left / 18) * 0.5 + 0.5, hard: 0.9 }, affected: '市政の継続' }); } }

  // ---- 公約の期限（上の課題に入っていない公約で、任期の残りが少なく、まだ届いていないもの）
  if (s.mode === 'term' && left <= 18) for (const g of s.goals ?? []) {
    const pr = goalProgress(s, g), def = GOALS.find(d => d.id === g.id); if (!def || pr.ok || out.some(i => i.key === 'election')) continue; // 再選の課題があれば、公約の内訳はそちらで見る
    if ((g.id === 'wait' && out.some(i => i.key === 'care')) || (g.id === 'fiscal' && out.some(i => i.key === 'fiscal')) || (g.id === 'traffic' && out.some(i => i.key === 'traffic')) || (g.id === 'water' && out.some(i => i.key === 'aging'))) continue;
    add({ key: 'pledge:' + g.id, title: `公約「${def.name}」がまだ届いていません（任期の残り ${left} か月）`, what: `${def.desc(g.target)}。進み具合は ${pc(pr.p)} です。選挙では、守れなかった公約が得票を下げます`, where: '市全体（公約）', cause: '任期の残りが少なくなっています。公約は任期末の時点で判定されます', causeKind: 'pledge',
      options: [{ label: '公約の進み具合を見る', act: 'tab', arg: 'term' }], tile: -1, layer: 'none', parts: { people: 0.3, trend: 0, deadline: c01(1 - left / 18) * 0.6 + 0.4, hard: 0.6 }, affected: '再選の見込み' });
  }

  // ---- v90：ゲームループの入口（学校の過密・駅の混雑・閉店の続出）と、各課題からループの対策の比較へ
  for (const x of loopIssueSeeds(s)) add({ key: x.key, title: x.title, what: x.what, where: x.tile >= 0 ? dname(m.district[x.tile]) : '市全体', cause: x.cause, causeKind: x.key, options: [], tile: x.tile, layer: x.key === 'shops' ? 'none' : x.key === 'school' ? 'edu' : 'traffic', parts: { people: x.people, trend: x.trend, deadline: 0, hard: 0.4 }, affected: '' });
  for (const i of out) { const lp = loopOfIssue(i.key); if (!lp) continue; i.loop = lp; i.options = [...i.options, { label: lp === 'aging' ? '維持・更新・先送りを比べる' : '対策の候補を比べる（費用・時間差・副作用）', act: 'loop', arg: lp }]; }
  out.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
  const seen = new Set<string>();
  return out.filter(i => (seen.has(i.key) ? false : (seen.add(i.key), true)));
}

/** 今月の課題（最大 3 件）。重要度が低すぎるものは出さない（何も問題がなければ 0 件） */
export function monthlyIssues(s: GameState, max = 3): Issue[] { return allIssues(s).filter(i => i.score >= 6).slice(0, max); }

// ---- v91：街の 3 つの論点（駅前・老朽インフラ・産業と暮らし）。上位 3 件の課題に入口が出ていなくても、いつでも対策を比べられるように
const LOOP_TOPIC: Record<LoopId, { title: string; what: string }> = {
  station: { title: '駅前（住宅・保育・学校・混雑）', what: '駅の近くに住宅を増やすと、転入と税収が伸びる一方で、家賃・保育・学校・混雑に響きます' },
  aging: { title: '老朽インフラ（維持・更新・先送り）', what: '水道・下水・ごみ処理などは年数とともに傷みます。更新は大きな出費、先送りは割増しと故障の危険を招きます' },
  industry: { title: '産業と暮らし（雇用・店・環境）', what: '大型店や工場は雇用と税収を生む一方で、近くの小さな店・道路・空気に響きます' },
};
/** 論点の要約（いまの指標を 3 つ） */
export function loopTopics(s: GameState): { id: LoopId; key: string; title: string; summary: string }[] {
  const v = loopIndicators(s), n0 = (x: number) => Math.round(x).toLocaleString();
  const old = s.buildings.filter(b => DEFS[b.kind].renewCost > 0 && b.age >= 70 && (b.status === 'operating' || b.status === 'suspended')).length;
  const sum: Record<LoopId, string> = {
    station: `転入 ${v.inflowHH} 世帯/月・保育の待機 ${n0(v.careWait)} 人・駅の朝の混雑 ${v.stationCrowd}%`,
    aging: `水道などの余力 ${v.lifeline}%・老朽度 70 以上の施設 ${old} か所・5 年の更新費 ${n0(v.renewal60)} 万円`,
    industry: `市内の雇用 ${n0(v.jobs)} 人・店の売上 ${n0(v.shopSales)} 万円/月・この 1 年の閉店 ${v.shopClosed} 軒`,
  };
  return LOOPS.map(l => ({ id: l.id, key: 'loop:' + l.id, title: LOOP_TOPIC[l.id].title, summary: sum[l.id] }));
}
/** 論点を課題の形にしたもの（課題の導線①〜④をそのまま使う。重要度は付けない） */
export function loopEntryIssue(s: GameState, key: string): Issue | undefined {
  const id = /^loop:(\w+)$/.exec(key)?.[1] as LoopId | undefined; if (!id || !LOOP_TOPIC[id]) return undefined;
  const t = loopTopics(s).find(x => x.id === id)!;
  return { key, title: t.title, what: LOOP_TOPIC[id].what, where: '市全体', cause: `いまの指標：${t.summary}`, causeKind: 'loop', options: [], tile: -1, layer: 'none', parts: { people: 0, trend: 0, deadline: 0, hard: 0 }, affected: '', score: 0, loop: id };
}
