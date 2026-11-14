// 第 1 段階（v84）：説明と判定の共通化／計画案は全件成功のときだけ確定／保存の失敗を黙って無視しない
import { describe, it, expect, beforeEach } from 'vitest';
import {
  newGame, P, DEFS, GOALS, dispatch, serialize, deserialize, stepMonth, electionOutlook, runElection, rerunElection, rerunCheck, rerunRules, RERUN, WIN_VOTE, voteText, winChance, fiscalWatch, goalProgress, forecast,
} from '../src/sim/index';
import type { GameState } from '../src/sim/types';
import { Game } from '../src/game';

const snap = (s: GameState) => JSON.stringify(s);
const led = (s: GameState, ops: number[]) => { const base = newGameLedger(); s.ledger = ops.map((operating, k) => ({ ...base, month: k, operating })); };
let LED: any = null;
function newGameLedger(): any { if (!LED) { const t = newGame(); stepMonth(t); LED = structuredClone(t.ledger[0]); } return LED; }
/** 落選して 12 か月たった街（返り咲きの条件を、ちょうど満たす所から動かす） */
function lost(): GameState {
  const s = newGame(); s.mode = 'sandbox'; s.goals = []; s.loans = s.loans.filter(l => l.kind !== 'temp');
  s.elections = [{ month: s.month - RERUN.wait, term: 1, vote: 45, win: false, support: 0.5, pledgesKept: [], parts: [], typeSupport: [] } as any];
  s.approval = RERUN.approval; s.stats.sat = P.voteCenter - RERUN.satBelowCenter;
  return s;
}

describe('A. 説明と判定は同じ定義から', () => {
  it('当選の線は 50% 以上：直前は落選、ちょうどと直後は当選。丸めた表示も線をまたがない', () => {
    expect(WIN_VOTE).toBe(50);
    expect(winChance(49.999999, 0)).toBe(0); expect(winChance(50, 0)).toBe(1); expect(winChance(50.000001, 0)).toBe(1);
    for (const [v, t] of [[49.94, '49.9'], [49.95, '49.9'], [49.96, '49.9'], [49.999, '49.9'], [50, '50.0'], [50.001, '50.0'], [50.04, '50.0'], [50.06, '50.1'], [43.21, '43.2'], [61.25, '61.3']] as const) {
      expect(voteText(v), String(v)).toBe(t);
      expect(Number(voteText(v)) >= WIN_VOTE, String(v)).toBe(v >= WIN_VOTE); // 表示から読める当落と、判定が同じ
    }
  });
  it('本番の抽選も同じ線：風向きを足した得票がちょうど 50 なら当選、わずかに下なら落選', () => {
    const s = newGame(); const o = electionOutlook(s);
    // 乱数を 3 つとも 0.5 にする（風向き 0）代わりに、見込みを動かして確かめる：支持率 1 点 = 18 点
    const set = (target: number) => { s.approval += (target - electionOutlook(s).vote) / 18; };
    void o;
    for (const [target, exp] of [[50 - 1e-6, false], [50 + 1e-6, true]] as const) {
      set(target);
      const v = electionOutlook(s).vote; expect(Math.abs(v - target)).toBeLessThan(1e-9);
      // 風向きがちょうど 0 になる乱数の組は作れないので、風向きを引いた値で判定の式を確かめる
      const before = s.rng; const r = runElection(s); const luck = r.parts.at(-1)!.v; s.rng = before;
      expect(r.win).toBe(v + luck >= WIN_VOTE);
      expect(winChance(v, 0)).toBe(exp ? 1 : 0);
    }
  });
  it('返り咲き：支持率・満足・待ち月数・一時借入の直前／一致／直後で、条件の表・理由文・実行の可否がそろう', () => {
    const eps = 1e-6;
    const cases: [string, (s: GameState) => void, boolean][] = [
      ['すべて一致（ちょうど）', () => {}, true],
      ['支持率が直前', s => { s.approval = RERUN.approval - eps; }, false],
      ['支持率が直後', s => { s.approval = RERUN.approval + eps; }, true],
      ['満足が直前', s => { s.stats.sat = P.voteCenter - RERUN.satBelowCenter - eps; }, false],
      ['満足が直後', s => { s.stats.sat = P.voteCenter - RERUN.satBelowCenter + eps; }, true],
      ['11 か月', s => { s.elections[0].month = s.month - (RERUN.wait - 1); }, false],
      ['13 か月', s => { s.elections[0].month = s.month - (RERUN.wait + 1); }, true],
      ['一時借入あり', s => { s.loans.push({ ...(s.loans[0] ?? { rate: 0.05, monthly: 0, months: 12 }), kind: 'temp', remaining: 1 } as any); }, false],
    ];
    for (const [name, f, exp] of cases) {
      const s = lost(); f(s);
      const R = rerunRules(s), why = rerunCheck(s);
      expect(R.every(r => r.ok), name + '：条件の表').toBe(exp);       // 画面の表（条件文）
      expect(why === null, name + '：理由文／ボタン').toBe(exp);        // ボタンの有効・理由文
      const before = snap(s); const r = dispatch(s, { type: 'rerun' });
      if (!exp) { expect(r.ok, name + '：実行').toBe(false); expect(snap(s), name + '：失敗時は何も変わらない').toBe(before); }
      else expect(r.msg.includes('立候補でき') || r.msg.includes('届いていません') || r.msg.includes('返し終えて'), name + '：実行できる').toBe(false);
    }
    // 説明に出る数字は定義から作る（満足の線は voteCenter − 0.05）
    const R = rerunRules(lost());
    expect(R[2].need).toBe(`${((P.voteCenter - RERUN.satBelowCenter) * 100).toFixed(1)}% 以上`);
    expect(R[1].need).toBe('50.0% 以上'); expect(R[0].need).toBe('12 か月以上');
    // 表示は切り捨て：条件に届いていないのに「届いた値」に見える丸めをしない
    const s = lost(); s.approval = 0.49996; expect(rerunRules(s)[1].now).toBe('49.9%'); expect(rerunRules(s)[1].ok).toBe(false);
  });
  it('水道の公約：説明は「40 以下」。老朽度 40 は達成、40.01 は未達成', () => {
    const def = GOALS.find(g => g.id === 'water')!;
    expect(def.desc(40)).toContain('40 以下'); expect(def.target(newGame())).toBe(40);
    const s = newGame(); const w = s.buildings.filter(b => DEFS[b.kind].fam === 'water'); expect(w.length).toBeGreaterThan(0);
    const g = { id: 'water', base: 80, target: 40 };
    for (const [age, ok] of [[39.99, true], [40, true], [40.01, false]] as const) { for (const b of w) b.age = age; expect(goalProgress(s, g).ok, String(age)).toBe(ok); }
  });
  it('財政の公約：履歴 0 か月は評価待ち。1・11・12 か月、赤字月を含む黒字平均、一時借入あり', () => {
    const g = { id: 'fiscal', base: 0, target: 0 }, s = newGame();
    s.loans = s.loans.filter(l => l.kind !== 'temp');
    expect(GOALS.find(o => o.id === 'fiscal')!.desc(0)).toMatch(/平均が 0 以上.*一時借入/);
    led(s, []); expect(fiscalWatch(s)).toMatchObject({ months: 0, waiting: true }); expect(goalProgress(s, g).ok).toBe(false);
    led(s, [10]); expect(fiscalWatch(s)).toMatchObject({ months: 1, waiting: false, avg: 10 }); expect(goalProgress(s, g).ok).toBe(true);
    led(s, [-10]); expect(goalProgress(s, g).ok).toBe(false);
    led(s, Array(11).fill(5)); expect(fiscalWatch(s).months).toBe(11); expect(goalProgress(s, g).ok).toBe(true);
    led(s, Array(12).fill(0)); expect(fiscalWatch(s).months).toBe(12); expect(goalProgress(s, g).ok).toBe(true); // 平均ちょうど 0 は達成（0 以上）
    led(s, [...Array(11).fill(0), -0.12]); expect(goalProgress(s, g).ok).toBe(false);                            // わずかに下
    led(s, [-300, -200, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]); expect(fiscalWatch(s).avg).toBeCloseTo(500 / 12); expect(goalProgress(s, g).ok).toBe(true); // 赤字の月があっても平均が黒字
    led(s, [-1e6, ...Array(12).fill(1)]); expect(fiscalWatch(s).months).toBe(12); expect(goalProgress(s, g).ok).toBe(true); // 13 か月前の大赤字は数えない
    s.loans.push({ ...(s.loans[0] ?? { rate: 0.05, monthly: 0, months: 12 }), kind: 'temp', remaining: 1 } as any);
    expect(fiscalWatch(s).temp).toBe(1); expect(goalProgress(s, g).ok).toBe(false);                               // 平均が黒字でも、一時借入があれば未達成
  });
  it('当選確率は、本番の抽選を独立に繰り返した割合と一致する（通常選挙・返り咲き、複数の見込み）', () => {
    const N = 20000, rows: string[] = [];
    for (const rerun of [false, true]) for (const diff of ['easy', 'normal', 'hard'] as const) for (const target of [44, 47, 49.5, 50, 51, 53, 57]) {
      const s = rerun ? lost() : newGame(); s.difficulty = diff;
      s.approval += (target - electionOutlook(s, rerun).vote) / 18;
      const o = electionOutlook(s, rerun); expect(Math.abs(o.vote - target)).toBeLessThan(1e-6);
      let win = 0;
      for (let i = 0; i < N; i++) { s.rng = (i * 2654435761 + 12345) | 0; if (runElection(s, rerun).win) win++; }
      const p = o.win, f = win / N, tol = 4 * Math.sqrt(Math.max(p * (1 - p), 1e-4) / N) + 0.002;
      rows.push(`${rerun ? '返り咲き' : '通常'} ${diff} 見込み${target}: 表示 ${(p * 100).toFixed(2)}% / 実測 ${(f * 100).toFixed(2)}% (許容 ±${(tol * 100).toFixed(2)}%)`);
      expect(Math.abs(f - p), rows.at(-1)).toBeLessThan(tol);
    }
    console.log(rows.join('\n'));
  });
  it('返り咲きの本番（rerunElection）は、画面に出す見込み electionOutlook(s, true) と同じ得票の式を使う', () => {
    const s = lost(); const o = electionOutlook(s, true);
    expect(o.parts.some(p => p.v === RERUN.bonus)).toBe(true);
    const r = rerunElection(structuredClone(s));
    const luck = r.parts.at(-1)!.v, sum = WIN_VOTE + r.parts.reduce((a, p) => a + p.v, 0);
    expect(sum - luck).toBeCloseTo(o.vote, 9); expect(r.win).toBe(o.vote + luck >= WIN_VOTE);
  });
  it('風向きの幅が 0 でも壊れない（0 か 1 になり、NaN にならない）', () => {
    for (const v of [0, 49.9, 50, 50.1, 100]) { const p = winChance(v, 0); expect(p).toBe(v >= 50 ? 1 : 0); }
    expect(winChance(50, 1e-12)).toBe(1); expect(Number.isFinite(winChance(50, 3))).toBe(true);
    expect(winChance(50, 3)).toBeCloseTo(0.5, 9); expect(winChance(50 + 9.01, 3)).toBe(1); expect(winChance(50 - 9.01, 3)).toBe(0);
  });
  it('見込み・確率・予測・計画案の集計を何度開いても、本番の乱数と状態は変わらず、その後の抽選結果も同じ', () => {
    const a = newGame(), b = structuredClone(a);
    const ga = new Game(a); const before = snap(ga.state);
    for (let i = 0; i < 5; i++) { electionOutlook(ga.state); electionOutlook(ga.state, true); rerunRules(ga.state); rerunCheck(ga.state); fiscalWatch(ga.state); }
    forecast(ga.state, 24); ga.forecastBase(12);
    ga.startDraft(); ga.act({ type: 'build', kind: 'nursery', x: 14, y: 16 }); ga.forecastDraft(12); ga.draftSummary(); ga.discardDraft();
    expect(ga.state.rng).toBe(b.rng); expect(snap(ga.state)).toBe(before);
    for (let i = 0; i < 6; i++) { stepMonth(ga.state); stepMonth(b); }
    expect(snap(ga.state)).toBe(snap(b));
    expect(runElection(ga.state)).toEqual(runElection(b));
  });
});

describe('B. 計画案は全件が通ったときだけ確定', () => {
  const draft3 = () => { const g = new Game(newGame()); g.startDraft();
    expect(g.act({ type: 'build', kind: 'nursery', x: 14, y: 16 }).ok).toBe(true);
    expect(g.act({ type: 'policy', id: 'careStaff', on: true }).ok).toBe(true);
    return g; };
  it('成功：費用は 1 回だけ引かれ、取り消し 1 回で全部戻る。保存して開き直しても同じ', () => {
    const g = draft3(); const before = snap(g.state), cash0 = g.state.cash;
    const sum = g.draftSummary()!;
    expect(sum.n).toBe(2); expect(sum.cost).toBeCloseTo(cash0 - g.draft!.state.cash, 9); expect(sum.cost).toBeGreaterThanOrEqual(DEFS.nursery.cost); expect(sum.upkeep).toBeGreaterThan(0); expect(sum.months).toBeGreaterThan(0);
    const planned = snap(g.draft!.state);
    const r = g.commitDraft(); expect(r.ok).toBe(true); expect(g.draft).toBeNull();
    expect(g.state.cash).toBeCloseTo(cash0 - sum.cost, 9);                 // 二重に引かれない
    expect(g.state.buildings.filter(b => b.kind === 'nursery' && b.x === 14 && b.y === 16).length).toBe(1);
    const strip = (t: string) => { const o = JSON.parse(t); const st = o.state ?? o; delete st.decisions; delete st.roadVersion; delete st.bVersion; return JSON.stringify(o); }; // v90：確定した計画案は施策の記録（decisions）に 1 件残る。街の計算には使わない
    expect(strip(snap(g.state))).toBe(strip(planned));                     // 試算で見ていた状態と同じものが本番になる
    const text = serialize(g.state), back = deserialize(text); expect(back.ok).toBe(true);
    if (back.ok) { expect(back.state.cash).toBe(g.state.cash); expect(serialize(back.state)).toBe(text); const x = structuredClone(g.state), y = back.state; for (let i = 0; i < 3; i++) { stepMonth(x); stepMonth(y); } expect(serialize(y)).toBe(serialize(x)); }
    expect(g.canUndo).toBe(true); expect(g.undo().ok).toBe(true); expect(strip(snap(g.state))).toBe(strip(before)); // 描き直し用の通し番号だけは進む expect(g.canUndo).toBe(false); // 取り消しは 1 回ぶん
  });
  it('資金不足：計画のあとで本番の資金が減っていたら、何も変えずに計画案を残し、失敗した操作と理由を返す', () => {
    const g = draft3(); g.state.cash = DEFS.nursery.cost - 1;              // 最新の本番に対して検証する
    const before = snap(g.state), plan = JSON.stringify(g.draft!.actions);
    const r = g.commitDraft();
    expect(r.ok).toBe(false); expect(r.failed?.index).toBe(0); expect(r.failed?.msg).toContain('資金が足りません'); expect(r.msg).toContain('本番は変わっていません');
    expect(snap(g.state)).toBe(before); expect(g.draft).not.toBeNull(); expect(JSON.stringify(g.draft!.actions)).toBe(plan); expect(g.canUndo).toBe(false);
    g.state.cash = P.startCash; expect(g.commitDraft().ok).toBe(true);     // 直せば、同じ計画案をそのまま実行できる
  });
  it('配置不可：計画のあとで同じ場所がふさがっていたら、何も変えない', () => {
    const g = draft3(); expect(dispatch(g.state, { type: 'build', kind: 'nurseryS', x: 14, y: 16 }).ok).toBe(true);
    const before = snap(g.state);
    const r = g.commitDraft(); expect(r.ok).toBe(false); expect(r.failed?.index).toBe(0);
    expect(snap(g.state)).toBe(before); expect(g.draft!.actions.length).toBe(2);
  });
  it('途中で失敗：1 件目が通り 2 件目が通らないとき、1 件目の分も残らない（資金も建物も）。失敗した操作を外せば実行できる', () => {
    const g = draft3(); g.draft!.actions.push({ type: 'build', kind: 'nursery', x: 14, y: 16 }); // 3 件目：同じ場所にもう 1 つ（通らない）
    const before = snap(g.state), nb = g.state.buildings.length, cash = g.state.cash;
    const r = g.commitDraft();
    expect(r.ok).toBe(false); expect(r.failed?.index).toBe(2);
    expect(snap(g.state)).toBe(before); expect(g.state.buildings.length).toBe(nb); expect(g.state.cash).toBe(cash); expect(g.state.policies.careStaff?.on).toBeFalsy();
    expect(g.draft!.actions.length).toBe(3);
    expect(g.dropDraftAction(r.failed!.index).ok).toBe(true); expect(g.draft!.actions.length).toBe(2);
    expect(snap(g.state)).toBe(before);
    const cost = g.draftSummary()!.cost; expect(g.commitDraft().ok).toBe(true); expect(g.state.cash).toBeCloseTo(cash - cost, 9); expect(cost).toBeGreaterThanOrEqual(DEFS.nursery.cost);
    expect(g.state.buildings.length).toBe(nb + 1);
  });
  it('仮の検証のあいだ、通知（onChange・onMonth）は出ない。失敗では 1 回も出ない', () => {
    const g = draft3(); let ch = 0, mo = 0; g.onChange.push(() => ch++); g.onMonth.push(() => mo++);
    g.state.cash = 0; expect(g.commitDraft().ok).toBe(false); expect(ch).toBe(0); expect(mo).toBe(0);
    g.state.cash = P.startCash; expect(g.commitDraft().ok).toBe(true); expect(ch).toBe(1); expect(mo).toBe(0);
  });
});

describe('C. 保存の失敗を黙って無視しない', () => {
  class Mem { m = new Map<string, string>(); limit = Infinity; deny = false; lie = false;
    get length() { return this.m.size; }
    used() { let n = 0; for (const [k, v] of this.m) n += k.length + v.length; return n; }
    getItem(k: string) { if (this.deny) throw new DOMException('The operation is insecure.', 'SecurityError'); return this.m.has(k) ? this.m.get(k)! : null; }
    setItem(k: string, v: string) { if (this.deny) throw new DOMException('The operation is insecure.', 'SecurityError'); if (this.lie) return; const add = k.length + v.length - (this.m.has(k) ? k.length + this.m.get(k)!.length : 0); if (this.used() + add > this.limit) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); this.m.set(k, v); }
    removeItem(k: string) { if (this.deny) throw new DOMException('The operation is insecure.', 'SecurityError'); this.m.delete(k); }
  }
  let mem: Mem;
  beforeEach(() => { mem = new Mem(); (globalThis as any).localStorage = mem; });
  const K = (n: number | 'auto' | 'prev') => Game.slotKey(n);

  it('成功：結果と最後に保存できた時点が残り、「未保存」は出ない。自動保存は 1 つ前を残す', () => {
    const g = new Game(newGame());
    expect(g.saveSlot('auto').ok).toBe(true); expect(g.saveFail).toBeNull(); expect(g.lastOk?.month).toBe(g.state.month); expect(g.lastOk?.where).toBe('自動保存');
    const first = mem.getItem(K('auto'))!;
    for (let i = 0; i < 12; i++) stepMonth(g.state);
    expect(g.saveSlot('auto').ok).toBe(true);
    expect(mem.getItem(K('prev'))).toBe(first); expect(mem.getItem(K('auto'))).not.toBe(first);
    expect(g.slotInfo('prev')?.text).toContain('1 年目'); expect(g.slotInfo('auto')?.text).toContain('2 年目');
  });
  it('容量超過：失敗を返し「未保存」になる。前の自動保存（中身も要約も時刻も）はそのまま残り、読み込める。街は壊れない', () => {
    const g = new Game(newGame()); let told = 0; g.onSave.push(() => told++);
    expect(g.saveSlot('auto').ok).toBe(true);
    const good = mem.getItem(K('auto'))!, goodMeta = mem.getItem(K('auto') + '.meta')!, ok0 = { ...g.lastOk! };
    for (let i = 0; i < 12; i++) stepMonth(g.state);
    const live = snap(g.state);
    mem.limit = mem.used() + 10;                                           // もう入らない
    const r = g.saveSlot('auto');
    expect(r.ok).toBe(false); expect(r.msg).toContain('いっぱい'); expect(r.msg).toContain('ファイル');
    expect(g.saveFail).toMatchObject({ where: '自動保存', month: g.state.month }); expect(told).toBe(2);
    expect(g.lastOk).toEqual(ok0);                                         // 失敗を成功の時刻として扱わない
    expect(mem.getItem(K('auto'))).toBe(good); expect(mem.getItem(K('auto') + '.meta')).toBe(goodMeta); expect(mem.getItem(K('prev'))).toBeNull();
    expect(snap(g.state)).toBe(live);                                      // 街はそのまま
    expect(deserialize(g.exportText()).ok).toBe(true);                     // ファイルへの書き出しはできる
    g.noteExported(); expect(g.saveFail).toBeNull(); expect(g.lastOk?.where).toBe('ファイル');
    mem.limit = Infinity; expect(g.saveSlot('auto').ok).toBe(true); expect(g.saveFail).toBeNull(); // 再試行できる
    expect(mem.getItem(K('prev'))).toBe(good);
    expect(g.loadSlot('prev').ok).toBe(true);                              // 復帰点から戻れる
  });
  it('中身は書けたが要約が書けなかったとき：中身も前のものへ戻す（食い違ったまま残さない）', () => {
    const g = new Game(newGame()); expect(g.saveSlot(1).ok).toBe(true);
    const good = mem.getItem(K(1))!, goodMeta = mem.getItem(K(1) + '.meta')!;
    for (let i = 0; i < 12; i++) stepMonth(g.state);
    const need = serialize(g.state).length - good.length;
    mem.limit = mem.used() + Math.max(0, need) + 1;                        // 中身は入るが、要約の差分は入らない
    const orig = mem.setItem.bind(mem); let n = 0;
    mem.setItem = (k: string, v: string) => { if (k.endsWith('.meta') && n++ === 0) throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); orig(k, v); };
    expect(g.saveSlot(1).ok).toBe(false);
    expect(mem.getItem(K(1))).toBe(good); expect(mem.getItem(K(1) + '.meta')).toBe(goodMeta); expect(g.saveFail?.where).toBe('枠 1');
  });
  it('保存禁止（保存領域に触れない）：例外で止まらず、失敗として伝える。ブラウザ保存・枠・自動保存のどれも', () => {
    const g = new Game(newGame()); mem.deny = true; const live = snap(g.state);
    for (const f of [() => g.saveLocal(), () => g.saveSlot(2), () => g.saveSlot('auto')]) { const r = f(); expect(r.ok).toBe(false); expect(r.msg).toContain('ファイルに保存'); expect(g.saveFail).not.toBeNull(); }
    expect(g.lastOk).toBeNull(); expect(g.slotInfo('auto')).toBeNull(); expect(g.hasLocal()).toBe(false); expect(g.loadSlot('auto').ok).toBe(false); expect(g.loadLocal().ok).toBe(false);
    expect(snap(g.state)).toBe(live);
    (globalThis as any).localStorage = undefined;                          // 保存領域そのものがない
    expect(g.saveLocal().ok).toBe(false); expect(g.saveSlot('auto').ok).toBe(false); expect(snap(g.state)).toBe(live);
  });
  it('書けたように見えて入っていない保存領域：読み直して確かめ、失敗として伝える', () => {
    const g = new Game(newGame()); mem.lie = true;
    expect(g.saveLocal().ok).toBe(false); expect(g.saveSlot(1).ok).toBe(false); expect(g.saveFail).not.toBeNull(); expect(g.lastOk).toBeNull();
  });
  it('不正な保存データ：読み込みは断り、いまの街は変わらない。壊れた自動保存で「ひとつ前」を上書きしない', () => {
    const g = new Game(newGame()); for (let i = 0; i < 3; i++) stepMonth(g.state);
    const live = snap(g.state);
    for (const bad of ['', '   ', '{', 'null', '[]', '{"format":"x"}', JSON.stringify({ format: 'sumucity-save', version: 999, state: {} }), serialize(g.state).slice(0, 5000), 'x'.repeat(1000)]) {
      const r = g.loadText(bad); expect(r.ok, bad.slice(0, 20)).toBe(false); expect(snap(g.state), bad.slice(0, 20)).toBe(live);
    }
    mem.setItem(K(3), '{こわれた'); mem.setItem(K(3) + '.meta', JSON.stringify({ at: 1, text: 'x' }));
    expect(g.loadSlot(3).ok).toBe(false); expect(snap(g.state)).toBe(live);
    mem.setItem(K(3) + '.meta', '{こわれた'); expect(g.slotInfo(3)).toBeNull();
    // 正常な「ひとつ前」がある所へ、壊れた自動保存が回ってこない
    expect(g.saveSlot('auto').ok).toBe(true); for (let i = 0; i < 12; i++) stepMonth(g.state); expect(g.saveSlot('auto').ok).toBe(true);
    const prevGood = mem.getItem(K('prev'))!;
    mem.setItem(K('auto'), '{こわれた');
    expect(g.saveSlot('auto').ok).toBe(true);
    expect(mem.getItem(K('prev'))).toBe(prevGood); expect(deserialize(mem.getItem(K('auto'))!).ok).toBe(true);
  });
  it('v83 までの保存データは、そのまま読める（保存形式は変えていない）', () => {
    const s = newGame(); for (let i = 0; i < 5; i++) stepMonth(s);
    const text = serialize(s), d = JSON.parse(text);
    const g = new Game(newGame()); expect(g.loadText(text).ok).toBe(true); expect(serialize(g.state)).toBe(text);
    expect(typeof d.version).toBe('number');
  });
});
