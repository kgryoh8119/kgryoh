// 進行管理：時間の積算、計画案（試算モード）、保存。描画・UI はここ経由で状態を読む。
import { newGame, stepMonth, dispatch, serialize, deserialize, forecast, MAP_ID } from './sim/index';
import { eventDef, initLocks, syncTerrain, recompute, ACTION_NAMES, seedForTerrain, terrainOf, upkeepOf } from './sim/index';
/** 取り消せる操作（つくる・変える操作。選挙やできごとの選択は取り消せない） */
const UNDOABLE = new Set(['road', 'unroad', 'tunnel', 'bridge', 'overpass', 'footbridge', 'canal', 'area', 'busStop', 'levee', 'terra', 'widen', 'flyover', 'rail', 'railgrade', 'unrail', 'repair', 'zone', 'build', 'demolish', 'renew', 'staff', 'suspend', 'policy', 'upgrade', 'buyout', 'tax', 'option', 'style', 'expand', 'move', 'annex', 'sandboxPlace']);
import type { GameState, Action, Result, ForecastSet } from './sim/index';
import { RECORD_KIND, recordDecision, fillForecast, updateDecisions, indicatorValues, actionLabel, type Decision, type DecisionResult } from './sim/report';
import { autoResolve, autoEvent, autoTurn, type AutoNote } from './autoplay';

/** 速度ごとの「1 秒あたりの月数」。経営の進行は経過時間の合計だけで決まり、フレームレートに依存しない */
export const SPEEDS = [0, 1 / 8, 1 / 3, 1];
export const SPEED_NAMES = ['一時停止', '通常（1 か月 8 秒）', '速い（1 か月 3 秒）', '最速（1 か月 1 秒）'];
/** ブラウザ保存の場所（地図ごと） */
export const saveKey = (id: string = MAP_ID) => (id === 'sumino' ? 'sumucity.save.v1' : `sumucity.${id}.save.v1`);

export interface Draft { state: GameState; actions: Action[]; /** 計画を始めたときの資金と維持費（費用の合計を出す基準） */ cash0?: number; up0?: number }

export class Game {
  state: GameState;
  draft: Draft | null = null;
  speed = 0;
  /** 次の月までの進み具合（0〜1） */
  acc = 0;
  onMonth: (() => void)[] = [];
  /** CPU のオートプレイ。判断の記録は autoLog に残す */
  auto = false;
  autoLog: AutoNote[] = [];
  private note(t: string[]): void { for (const text of t) this.autoLog.push({ month: this.state.month, text }); if (this.autoLog.length > 80) this.autoLog.splice(0, this.autoLog.length - 80); }
  /** オート：止まる原因（公約・できごと・選挙）に答える */
  autoUnblock(): void { if (!this.auto || this.draft) return; this.note(autoResolve(this.state)); this.note(autoEvent(this.state, eventDef)); }
  onChange: (() => void)[] = [];
  /** 状態が変わるたびに増える番号。予測結果が「いつの状態のものか」を見分けるのに使う */
  rev = 0;
  private changed(): void { this.rev++; for (const f of this.onChange) f(); }

  constructor(state?: GameState) { this.state = state ?? Game.fresh(); }
  /** 画面で始める新しい街：はじめの町の区域だけが市の区域（市長レベルで編入して広げる） */
  static fresh(opts: { short?: boolean; seed?: number } = {}): GameState { const s = newGame(opts); initLocks(s); return s; }

  /** 画面に出す状態（試算モード中は計画案） */
  get view(): GameState { return this.draft ? this.draft.state : this.state; }

  get blocked(): boolean {
    return !!this.draft || !!this.state.over || this.state.events.active.length > 0 || !!this.state.pendingElection || (this.state.mode === 'term' && !!this.state.goalPick);
  }

  /** 実時間 dt 秒ぶん進める。月の境界を越えた回数だけ月次処理を呼ぶ */
  tick(dt: number): number {
    if (this.state.over) { this.auto = false; this.speed = 0; return 0; }
    if (this.auto && this.speed && this.blocked) { this.autoUnblock(); if (!this.blocked) this.changed(); }
    if (this.speed === 0 || this.blocked) return 0;
    this.acc += dt * SPEEDS[this.speed];
    let n = 0;
    while (this.acc >= 1) {
      this.acc -= 1;
      stepMonth(this.state);
      this.afterMonth();
      n++;
      if (this.auto && !this.draft) { this.autoUnblock(); this.note(autoTurn(this.state)); }
      if (this.blocked) { this.acc = 0; break; }
    }
    if (n) { for (const f of this.onMonth) f(); this.changed(); }
    return n;
  }

  /** v90：施策の結果（3・6・12 か月後）が新しく出たもの。画面が読んだら空にする */
  newResults: { d: Decision; r: DecisionResult }[] = [];
  /** v90：年次報告を出す区切り（年度末と任期末）。画面が出したら null にする */
  reportDue: { from: number; to: number; title: string } | null = null;
  private afterMonth(): void {
    const s = this.state;
    const res = updateDecisions(s);
    if (res.length) { this.newResults.push(...res); if (this.newResults.length > 20) this.newResults.splice(0, this.newResults.length - 20); for (const { d, r } of res) if (r.at === 12 || d.issue) s.notes.push(`📊 施策「${d.label}」の ${r.at} か月後の結果が出ました（概要タブの課題・年次報告で見られます）`); }
    if (s.mode !== 'term') return;
    if (s.pendingElection) this.reportDue = { from: s.termStart, to: s.month, title: `任期 ${s.term} 期目のまとめ（任期末の報告）` };
    else if (s.month > 0 && s.month % 12 === 0) this.reportDue = { from: s.month - 12, to: s.month, title: `${s.month / 12} 年目の年次報告（年度末）` };
  }
  /** v90：主要な操作を、実行前の指標と 12 か月の予測つきで記録する。予測は画面を止めないよう少しあとで計算する */
  private record(a: Action, before: Record<string, number>, issue?: string, label?: string): void {
    const s = this.state; if (s.mode !== 'term') return;
    const d = recordDecision(s, label ?? actionLabel(s, a), RECORD_KIND[a.type] ?? '計画案', before, { issue, forecast: false, action: a });
    const fill = () => { if (this.state === s && !d.expect && s.decisions?.includes(d)) fillForecast(s, d); };
    if (typeof setTimeout === 'function') setTimeout(fill, 60); else fill();
  }
  /** 取り消し用：操作の前の状態（同じ月のあいだだけ。3 手まで） */
  undoStack: { state: GameState; label: string }[] = [];
  get canUndo(): boolean { return !this.draft && this.undoStack.length > 0 && this.undoStack.at(-1)!.state.month === this.state.month; }
  undo(): Result {
    if (!this.canUndo) return { ok: false, msg: '取り消せる操作がありません（月が変わると取り消せません）' };
    const u = this.undoStack.pop()!;
    this.state = u.state; syncTerrain(this.state); recompute(this.state); this.state.roadVersion++; this.state.bVersion++;
    this.changed();
    return { ok: true, msg: `取り消しました：${u.label}` };
  }
  act(a: Action, opts: { issue?: string } = {}): Result {
    const snap = !this.draft && UNDOABLE.has(a.type) ? structuredClone(this.state) : null;
    const before = !this.draft && RECORD_KIND[a.type] ? indicatorValues(this.state) : null;
    const r = dispatch(this.view, a);
    if (r.ok && before) this.record(a, before, opts.issue);
    if (r.ok && snap) { this.undoStack = this.undoStack.filter(u => u.state.month === this.state.month); this.undoStack.push({ state: snap, label: ACTION_NAMES[a.type] ?? '操作' }); if (this.undoStack.length > 3) this.undoStack.shift(); }
    if (r.ok && this.draft) this.draft.actions.push(a);
    if (r.ok) this.changed();
    return r;
  }

  // ---- 計画案（試算モード）----
  startDraft(): void {
    if (this.draft) return;
    this.draft = { state: structuredClone(this.state), actions: [], cash0: this.state.cash, up0: Game.upkeepAll(this.state) };
    this.changed();
  }
  discardDraft(): void { this.draft = null; this.changed(); }
  /** 計画案を本番にする。全件が成功したときだけ確定する（v84）。
   *  前は本番へ 1 件ずつ適用していて、途中で失敗すると、それまでの分だけが残り（資金も減り）、計画案も消えていた。
   *  いまの本番の複製に全操作を適用してみて、すべて通ったら複製を本番にする。1 件でも失敗したら本番も計画案もそのまま残し、どの操作がなぜ失敗したかを返す。
   *  確定は取り消し 1 回ぶん（同じ月のあいだ） */
  commitDraft(): Result & { failed?: { index: number; name: string; msg: string } } {
    if (!this.draft) return { ok: false, msg: '計画案がありません' };
    const actions = this.draft.actions;
    if (!actions.length) return { ok: false, msg: '計画案に操作がありません' };
    const before = this.state, trial = structuredClone(this.state);
    let failed: { index: number; name: string; msg: string } | undefined;
    for (let i = 0; i < actions.length && !failed; i++) { const r = dispatch(trial, actions[i]); if (!r.ok) failed = { index: i, name: ACTION_NAMES[actions[i].type] ?? '操作', msg: r.msg }; }
    if (failed) { // 何も変えない。地形などの作業用の写しを、いま画面に出している状態（計画案）に合わせ直す
      syncTerrain(this.draft.state);
      return { ok: false, failed, msg: `実行していません（本番は変わっていません）。${failed.index + 1} 件目「${failed.name}」が通りません：${failed.msg}。計画案は残してあります。その操作をやり直すか、計画を破棄してください` };
    }
    const before0 = indicatorValues(before);
    this.draft = null; this.state = trial; this.record(actions[0], before0, undefined, `計画案（${actions.length} 件：${[...new Set(actions.map(a => ACTION_NAMES[a.type] ?? '操作'))].slice(0, 3).join('・')}）`); syncTerrain(this.state); recompute(this.state); this.state.roadVersion++; this.state.bVersion++;
    this.undoStack = this.undoStack.filter(u => u.state.month === before.month); this.undoStack.push({ state: before, label: `計画案（${actions.length} 件）` }); if (this.undoStack.length > 3) this.undoStack.shift();
    this.changed();
    return { ok: true, msg: `計画案の ${actions.length} 件を実行しました（まとめて 1 回で取り消せます）` };
  }
  /** 計画案から最後の 1 件を外す（失敗した操作を直すため）。本番の複製に残りを適用し直す */
  dropDraftAction(index: number): Result {
    if (!this.draft || index < 0 || index >= this.draft.actions.length) return { ok: false, msg: '外せる操作がありません' };
    const rest = this.draft.actions.filter((_, i) => i !== index), st = structuredClone(this.state), kept: Action[] = [];
    for (const a of rest) if (dispatch(st, a).ok) kept.push(a);
    this.draft = { state: st, actions: kept, cash0: this.state.cash, up0: Game.upkeepAll(this.state) }; syncTerrain(st); recompute(st); st.roadVersion++; st.bVersion++; this.changed();
    return { ok: true, msg: `計画案から 1 件を外しました（残り ${kept.length} 件）` };
  }
  /** 計画案の費用のまとめ：使うお金の合計、毎月の維持費の増え方、いちばん遅い完成までの月数 */
  private static upkeepAll(s: GameState): number { return s.buildings.reduce((t, x) => t + upkeepOf(x.status === 'construction' ? { ...x, status: 'operating' } as typeof x : x), 0); }
  draftSummary(): { n: number; cost: number; upkeep: number; months: number; cashAfter: number } | null {
    if (!this.draft) return null;
    const a = this.state, b = this.draft.state, cash0 = this.draft.cash0 ?? a.cash, cost = cash0 - b.cash;
    const old = new Set(a.buildings.map(x => x.id));
    // 費用は計画を始めた時点との差。実行後の資金は、いまの本番の資金から引く（計画のあとで本番が変わっていても、正しい残りを出す）
    return { n: this.draft.actions.length, cost, upkeep: Game.upkeepAll(b) - (this.draft.up0 ?? Game.upkeepAll(a)), months: b.buildings.filter(x => x.status === 'construction' && !old.has(x.id)).reduce((m, x) => Math.max(m, x.remain ?? 0), 0), cashAfter: a.cash - cost };
  }
  forecastBase(months = 60): ForecastSet[] { return forecast(this.state, months); }
  forecastDraft(months = 60): ForecastSet[] | null { return this.draft ? forecast(this.draft.state, months) : null; }

  // ---- 保存 ----
  /** 直近の保存の結果。失敗したら fail に理由が入り、画面に「未保存」を出す。成功した時刻は lastOk だけに残す（失敗を成功の時刻として扱わない） */
  saveFail: { month: number; where: string; msg: string } | null = null;
  lastOk: { at: number; month: number; where: string } | null = null;
  onSave: (() => void)[] = [];
  private noteSave(r: Result, where: string): Result {
    if (r.ok) { this.saveFail = null; this.lastOk = { at: Date.now(), month: this.state.month, where }; }
    else this.saveFail = { month: this.state.month, where, msg: r.msg };
    for (const f of this.onSave) f();
    return r;
  }
  /** ファイルへ書き出したとき（ブラウザに保存できなくても、手元に残せた）に呼ぶ */
  noteExported(): void { this.saveFail = null; this.lastOk = { at: Date.now(), month: this.state.month, where: 'ファイル' }; for (const f of this.onSave) f(); }
  private static failMsg(e: unknown): string {
    const m = (e as Error)?.message ?? String(e), full = /quota|exceeded|full/i.test(m) || (e as any)?.name === 'QuotaExceededError';
    return full ? 'ブラウザの保存領域がいっぱいで保存できませんでした。ファイルに保存するか、使っていない保存の枠を上書きしてから、もう一度お試しください' : `このブラウザには保存できませんでした（${m}）。ファイルに保存してください`;
  }
  /** 書いた中身を読み直して、同じものが入ったことを確かめる（書けたように見えて入っていない環境があるため） */
  private static put(key: string, text: string): void { localStorage.setItem(key, text); if (localStorage.getItem(key) !== text) throw new Error('保存した内容を読み直せません'); }
  saveLocal(): Result {
    try { Game.put(saveKey(), serialize(this.state)); return this.noteSave({ ok: true, msg: 'このブラウザに保存しました' }, 'ブラウザ'); }
    catch (e) { return this.noteSave({ ok: false, msg: Game.failMsg(e) }, 'ブラウザ'); }
  }
  /** セーブ枠（1〜3）と自動保存（'auto'）。中身と、一覧に出す要約 */
  static slotKey(n: number | 'auto' | 'prev'): string { return `${saveKey()}.${n === 'auto' ? 'auto' : n === 'prev' ? 'autoPrev' : 'slot' + n}`; }
  slotInfo(n: number | 'auto' | 'prev'): { at: number; text: string } | null { try { const v = JSON.parse(localStorage.getItem(Game.slotKey(n) + '.meta') ?? 'null'); return v && typeof v.at === 'number' && typeof v.text === 'string' ? v : null; } catch { return null; } }
  saveSlot(n: number | 'auto'): Result {
    const where = n === 'auto' ? '自動保存' : `枠 ${n}`, key = Game.slotKey(n), mkey = key + '.meta';
    const s = this.state, text = `${Math.floor(s.month / 12) + 1} 年目 ${((s.month + 3) % 12) + 1} 月・人口 ${Math.round(s.stats.pop).toLocaleString()} 人・${s.cityName ?? ''}`;
    let old: string | null = null, oldMeta: string | null = null;
    try { old = localStorage.getItem(key); oldMeta = localStorage.getItem(mkey); } catch (e) { return this.noteSave({ ok: false, msg: Game.failMsg(e) }, where); }
    const data = serialize(s), meta = JSON.stringify({ at: Date.now(), text });
    const write = () => { Game.put(key, data); Game.put(mkey, meta); };
    // 失敗したら、枠を書く前の中身へ戻す（中身と要約が食い違ったまま残さない。最後に正常だった保存を守る）
    const restore = () => { try { if (old != null) localStorage.setItem(key, old); else localStorage.removeItem(key); if (oldMeta != null) localStorage.setItem(mkey, oldMeta); else localStorage.removeItem(mkey); } catch { /* 戻せない：下で失敗として伝える */ } };
    try { write(); }
    catch (e) {
      restore();
      return this.noteSave({ ok: false, msg: Game.failMsg(e) }, where);
    }
    // 自動保存は、うまく書けたあとで、1 つ前のものを「ひとつ前の自動保存」へ回す（先に回すと、容量が足りないときに新旧どちらも失いかねない）。
    // 回す前に、前の中身が保存データとして読める形かを確かめる（壊れたもので、正常な「ひとつ前」を上書きしない）
    if (n === 'auto' && old && oldMeta && Game.looksValid(old)) {
      const pk = Game.slotKey('prev'); let p0: string | null = null, p1: string | null = null;
      try { p0 = localStorage.getItem(pk); p1 = localStorage.getItem(pk + '.meta'); localStorage.setItem(pk, old); localStorage.setItem(pk + '.meta', oldMeta); }
      catch { try { if (p0 != null) localStorage.setItem(pk, p0); else localStorage.removeItem(pk); if (p1 != null) localStorage.setItem(pk + '.meta', p1); else localStorage.removeItem(pk + '.meta'); } catch { /* そのまま */ } }
    }
    return this.noteSave({ ok: true, msg: n === 'auto' ? '自動保存しました' : `枠 ${n} に保存しました` }, where);
  }
  private static looksValid(t: string): boolean { try { const d = JSON.parse(t); return !!d && typeof d === 'object' && typeof d.format === 'string' && !!d.state && typeof d.state === 'object'; } catch { return false; } }
  loadSlot(n: number | 'auto' | 'prev'): Result { let t: string | null = null; try { t = localStorage.getItem(Game.slotKey(n)); } catch { return { ok: false, msg: 'ブラウザの保存領域を読めません' }; } if (!t) return { ok: false, msg: 'その枠は空です' }; return this.loadText(t); }
  hasLocal(): boolean { try { return !!localStorage.getItem(saveKey()); } catch { return false; } }
  loadLocal(): Result {
    let t: string | null = null;
    try { t = localStorage.getItem(saveKey()); } catch (e) { return { ok: false, msg: 'ブラウザの保存領域を読めません' }; }
    if (!t) return { ok: false, msg: '保存データがありません' };
    return this.loadText(t);
  }
  loadText(text: string): Result {
    const r = deserialize(text);
    if (!r.ok) return { ok: false, msg: '読み込めません：' + r.error };
    this.state = r.state; this.draft = null; this.acc = 0; this.speed = 0; this.undoStack = [];
    this.changed();
    return { ok: true, msg: `読み込みました（${Math.floor(r.state.month / 12) + 1} 年目 ${((r.state.month + 3) % 12) + 1} 月）` };
  }
  exportText(): string { return serialize(this.state); }
  reset(opts: { short?: boolean; seed?: number } = {}): void {
    this.state = Game.fresh({ ...opts, seed: opts.seed ?? seedForTerrain(terrainOf(this.state.seed).id) }); this.draft = null; this.acc = 0; this.speed = 0; this.undoStack = [];
    this.changed();
  }
}
