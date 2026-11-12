// 改修指示書 v2・優先順位 1：操作の原子性、保存データの検証、財政の整合
import { describe, it, expect } from 'vitest';
import { newGame, stepMonth, dispatch, recompute, serialize, deserialize, idx, W, H, P, DEFS, GameState, Action, DISTRICTS } from '../src/sim/index';
import { planRoad, planZone } from '../src/sim/actions';
import { ledgerGap, fiscalCrisis, tempDebt } from '../src/sim/step';
import { addBuilding } from '../src/sim/events';
import { validateState } from '../src/sim/validate';
import { Game } from '../src/game';

const N = W * H;
const snap = (s: GameState) => JSON.stringify(s);
const freeTile = (s: GameState, x0 = 3, y0 = 9) => idx(x0, y0); // 西新町の空き地（道路なし）

describe('1. 同じ区画の重複指定', () => {
  it('道路：同じ区画を 2 回渡しても 1 区間分だけ請求し、表示と一致する', () => {
    const s = newGame();
    const i = idx(12, 9); // 既存道路 (13,9) の西隣
    const plan = planRoad(s, [i, i], 1);
    expect(plan.ok.length).toBe(1); expect(plan.cost).toBe(P.roadCost[1]);
    const c0 = s.cash;
    const r = dispatch(s, { type: 'road', tiles: [i, i, i], road: 1 });
    expect(r.ok).toBe(true); expect(r.cost).toBe(P.roadCost[1]);
    expect(s.cash).toBe(c0 - P.roadCost[1]);
    expect(r.msg).toContain('1 区間');
  });
  it('撤去・補修・用途指定も重複を数えない', () => {
    const s = newGame();
    const i = idx(15, 9);
    const c0 = s.cash;
    expect(dispatch(s, { type: 'repair', tiles: [i, i] }).cost).toBe(P.roadRepairCost);
    expect(dispatch(s, { type: 'unroad', tiles: [i, i, i] }).cost).toBe(P.roadRemoveCost);
    expect(s.cash).toBe(c0 - P.roadRepairCost - P.roadRemoveCost);
    const z = [idx(4, 9), idx(4, 9), idx(5, 9)];
    expect(planZone(s, z, 1).ok.length).toBe(2);
    expect(dispatch(s, { type: 'zone', tiles: z, zone: 1 }).msg).toContain('2 区画');
  });
});

describe('2. 不正な操作は拒否し、状態を変えない', () => {
  const bads: [string, any][] = [
    ['道路種別 9', { type: 'road', tiles: [idx(12, 9)], road: 9 }],
    ['道路種別 NaN', { type: 'road', tiles: [idx(12, 9)], road: NaN }],
    ['道路種別 3（国道）', { type: 'road', tiles: [idx(12, 9)], road: 3 }],
    ['区画 -1', { type: 'road', tiles: [-1], road: 1 }],
    ['区画 小数', { type: 'road', tiles: [12.5], road: 1 }],
    ['区画 地図外', { type: 'road', tiles: [N], road: 1 }],
    ['区画 文字列', { type: 'road', tiles: ['12'], road: 1 }],
    ['区画 NaN', { type: 'unroad', tiles: [NaN] }],
    ['区画 配列でない', { type: 'repair', tiles: 12 }],
    ['区画 空', { type: 'road', tiles: [], road: 1 }],
    ['区画 多すぎる', { type: 'zone', tiles: new Array(N + 1).fill(0), zone: 1 }],
    ['用途 7', { type: 'zone', tiles: [idx(4, 9)], zone: 7 }],
    ['用途 小数', { type: 'zone', tiles: [idx(4, 9)], zone: 1.5 }],
    ['未知の施設', { type: 'build', kind: 'castle', x: 4, y: 9 }],
    ['座標 NaN', { type: 'build', kind: 'park', x: NaN, y: 9 }],
    ['座標 Infinity', { type: 'build', kind: 'park', x: Infinity, y: 9 }],
    ['座標 小数', { type: 'build', kind: 'park', x: 4.5, y: 9 }],
    ['座標 地図外', { type: 'build', kind: 'school', x: 42, y: 9 }],
    ['市債 NaN', { type: 'borrow', amount: NaN }],
    ['市債 Infinity', { type: 'borrow', amount: Infinity }],
    ['市債 負', { type: 'borrow', amount: -5000 }],
    ['市債 小数', { type: 'borrow', amount: 1000.5 }],
    ['市債 上限超', { type: 'borrow', amount: P.bondLimit * 3 + 1 }],
    ['市債 文字列', { type: 'borrow', amount: '5000' }],
    ['未知の建物 ID', { type: 'demolish', id: 999999 }],
    ['建物 ID NaN', { type: 'renew', id: NaN }],
    ['職員 NaN', { type: 'staff', id: 0, n: NaN }],
    ['政策 未知', { type: 'policy', id: 'magic', on: true }],
    ['政策 on が文字列', { type: 'policy', id: 'careStaff', on: 'yes' }],
    ['イベント 未発生', { type: 'event', id: 'careStaff', option: 0 }],
    ['未知の操作', { type: 'teleport' }],
    ['操作が null', null],
  ];
  for (const [name, a] of bads) it(name, () => {
    const s = newGame();
    const nursery = s.buildings.find(b => b.kind === 'nursery')!;
    if (a && a.type === 'staff') a.id = nursery.id;
    const before = snap(s);
    const r = dispatch(s, a as Action);
    expect(r.ok).toBe(false);
    expect(r.msg.length).toBeGreaterThan(4);
    expect(snap(s)).toBe(before);
    expect(deserialize(serialize(s)).ok).toBe(true);
  });
  it('職員数の範囲外・小数・無効なイベント選択肢も拒否', () => {
    const s = newGame();
    const n = s.buildings.find(b => b.kind === 'nursery')!;
    for (const v of [-1, 1.5, 999, Infinity]) { const before = snap(s); expect(dispatch(s, { type: 'staff', id: n.id, n: v }).ok).toBe(false); expect(snap(s)).toBe(before); }
    s.events.active.push({ id: 'careStaff', start: 0, target: n.id, detail: '' });
    for (const o of [-1, 3, 1.2, NaN]) { const before = snap(s); expect(dispatch(s, { type: 'event', id: 'careStaff', option: o }).ok).toBe(false); expect(snap(s)).toBe(before); }
  });
  it('資金が足りない操作は何も変えない（理由つき）', () => {
    const s = newGame();
    s.cash = 100;
    const before = snap(s);
    const r = dispatch(s, { type: 'road', tiles: [idx(12, 9), idx(11, 9)], road: 1 });
    expect(r.ok).toBe(false); expect(r.msg).toContain('道路の建設'); expect(r.msg).toContain('資金が足りません');
    expect(snap(s)).toBe(before);
  });
  it('実行の途中で不正な値が出たら、全て元に戻す', () => {
    const s = newGame();
    const before = snap(s);
    const keep = DEFS.park.cost;
    (DEFS.park as any).cost = NaN; // 設定の誤りを模す
    try {
      const r = dispatch(s, { type: 'build', kind: 'park', x: 14, y: 16 });
      expect(r.ok).toBe(false); expect(r.msg).toContain('街は操作前のまま');
    } finally { (DEFS.park as any).cost = keep; }
    expect(snap(s)).toBe(before);
    expect(dispatch(s, { type: 'build', kind: 'park', x: 14, y: 16 }).ok).toBe(true); // その後も普通に動く
  });
  it('不正な操作を浴びせても、月次計算は有限のまま進み、保存・読込できる', () => {
    const s = newGame();
    const junk: any[] = [{ type: 'borrow', amount: NaN }, { type: 'road', tiles: [idx(12, 9)], road: 9 }, { type: 'build', kind: 'x', x: 1, y: 1 }, { type: 'zone', tiles: [1e9], zone: 1 }];
    for (let m = 0; m < 24; m++) { for (const a of junk) dispatch(s, a); stepMonth(s, { forecast: true }); }
    expect(Number.isFinite(s.cash)).toBe(true);
    expect(validateState(s)).toBeNull();
    expect(deserialize(serialize(s)).ok).toBe(true);
  });
});

describe('3. 保存データの検証', () => {
  const base = () => { const s = newGame(); dispatch(s, { type: 'borrow', amount: 10000 }); dispatch(s, { type: 'build', kind: 'nursery', x: 14, y: 16 }); for (let i = 0; i < 3; i++) stepMonth(s); return s; };
  const tamper = (f: (st: any) => void) => { const d = JSON.parse(serialize(base())); f(d.state); return deserialize(JSON.stringify(d)); };
  const cases: [string, (st: any) => void][] = [
    ['国道を道路種別 9 に', st => { st.road[idx(5, 15)] = 9; }],
    ['道路種別 9（空き地）', st => { st.road[idx(4, 9)] = 9; }],
    ['道路種別 小数', st => { st.road[idx(4, 9)] = 1.5; }],
    ['国道を消す', st => { st.road[idx(5, 15)] = 0; }],
    ['水面に道路', st => { st.road[idx(5, H - 2)] = 1; }],
    ['用途 9', st => { st.zone[idx(4, 9)] = 9; }],
    ['老朽度 200', st => { st.roadAge[idx(13, 9)] = 200; }],
    ['資金 null（NaN を保存した形）', st => { st.cash = null; }],
    ['資金が負', st => { st.cash = -1; }],
    ['区画が別の建物の外を指す', st => { const b = st.buildings[20]; st.occ[idx(4, 9)] = b.id; }],
    ['区画が存在しない建物を指す', st => { st.occ[idx(4, 9)] = 123456; }],
    ['建物の座標をずらす', st => { st.buildings[30].x += 1; }],
    ['建物の幅を変える', st => { st.buildings[30].w = 3; }],
    ['未知の建物種別', st => { st.buildings[30].kind = 'castle'; }],
    ['建物 ID の重複', st => { st.buildings[31].id = st.buildings[30].id; }],
    ['工事中なのに残り 0', st => { st.buildings.find((b: any) => b.status === 'construction').remain = 0; }],
    ['稼働中なのに残り工期', st => { st.buildings[30].remain = 3; }],
    ['世帯数が戸数を超える', st => { const b = st.buildings.find((x: any) => x.kind === 'house'); b.hh = [9, 0, 0, 0, 0]; }],
    ['世帯数が負', st => { const b = st.buildings.find((x: any) => x.kind === 'house'); b.hh = [1, -1, 0, 0, 0]; }],
    ['職員数が文字列', st => { st.buildings.find((x: any) => x.kind === 'nursery').staff = '18'; }],
    ['借入の残高が元本超', st => { st.loans[0].remaining = st.loans[0].principal * 2; }],
    ['市債が上限超', st => { st.loans.push({ principal: 999999, remaining: 999999, rate: 0.015, months: 120, kind: 'bond' }); }],
    ['借入の種類が不明', st => { st.loans[0].kind = 'gift'; }],
    ['政策の開始月が未来', st => { st.policies.careStaff.since = 9999; }],
    ['未知の政策', st => { st.policies.magic = { on: true, since: 0 }; }],
    ['予定効果の種類が不明', st => { st.scheduled.push({ due: 5, eff: { t: 'explode' }, target: -1, src: 'x' }); }],
    ['イベント ID が不明', st => { st.events.active.push({ id: 'meteor', start: 1, target: -1, detail: '' }); }],
    ['台帳に数値でない値', st => { st.ledger[0].upkeep = 'a'; }],
    ['乱数状態が小数', st => { st.rng = 0.5; }],
    ['月が負', st => { st.month = -1; }],
    ['任期の開始が未来', st => { st.termStart = 999; }],
    ['公約が候補にない', st => { st.goals = [{ id: 'nope', base: 0, target: 1, diff: 1 }]; }],
    ['税率が範囲外', st => { st.tax.res = 3; }],
    ['支持率が範囲外', st => { st.approval = 2; }],
    ['案内の進み具合が不正', st => { st.tutorial = null; }],
  ];
  for (const [name, f] of cases) it(`拒否：${name}`, () => { const r = tamper(f); expect(r.ok).toBe(false); });
  it('Infinity を含む JSON（1e309）も拒否', () => {
    const t = serialize(base()).replace('"inflowFactor":1', '"inflowFactor":1e309');
    expect(t).toContain('1e309');
    expect(deserialize(t).ok).toBe(false);
  });
  it('巨大な入力と深い入れ子は、すぐに拒否する', () => {
    const t0 = performance.now();
    expect(deserialize('x'.repeat(9_000_000)).ok).toBe(false);
    expect(deserialize('['.repeat(200000) + ']'.repeat(200000)).ok).toBe(false);
    expect(performance.now() - t0).toBeLessThan(1500);
  });
  it('読込に失敗しても、いまの街はそのまま', () => {
    const g = new Game(base());
    const before = snap(g.state);
    const d = JSON.parse(serialize(g.state)); d.state.road[idx(5, 15)] = 9;
    const r = g.loadText(JSON.stringify(d));
    expect(r.ok).toBe(false); expect(r.msg).toContain('道路の種類');
    expect(snap(g.state)).toBe(before);
  });
  it('既存の v1 セーブ（月初の現金がない形・全園共通の定員拡大）も読める', () => {
    const s = base();
    s.modifiers.push({ key: 'privCap', op: 'add', v: 30, until: -1, cost: 0, src: '旧形式' });
    const d = JSON.parse(serialize(s));
    delete d.state.pending.cashStart; for (const L of d.state.ledger) delete L.cashStart;
    const r = deserialize(JSON.stringify(d));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const p = r.state.buildings.find(b => b.kind === 'privNursery')!;
    expect(p.effCap).toBeGreaterThan(DEFS.privNursery.capacity * 0.7);
    for (let i = 0; i < 6; i++) stepMonth(r.state, { forecast: true });
    expect(validateState(r.state)).toBeNull();
    expect(Math.abs(ledgerGap(r.state.ledger.at(-1)!))).toBeLessThan(1e-6);
  });
});

describe('4. 財政の整合', () => {
  it('240 か月、あらゆる支出を混ぜても、毎月の台帳が検算でき、月をまたいで残高がつながる', () => {
    const s = newGame();
    let builtCost = 0, otherPaid = 0;
    for (let m = 0; m < 240; m++) {
      if (m === 0) { dispatch(s, { type: 'borrow', amount: 30000 }); builtCost += DEFS.nursery.cost; dispatch(s, { type: 'build', kind: 'nursery', x: 14, y: 16 }); dispatch(s, { type: 'policy', id: 'careStaff', on: true }); }
      if (m === 2) { builtCost += DEFS.park.cost; dispatch(s, { type: 'build', kind: 'park', x: 3, y: 20 }); }
      if (m === 3) { const b = s.buildings.find(o => o.kind === 'park' && o.status === 'construction')!; dispatch(s, { type: 'demolish', id: b.id }); }
      if (m === 5) dispatch(s, { type: 'renew', id: s.buildings.find(b => b.kind === 'water')!.id });
      if (m === 30) for (const p of ['shopStart', 'homeReform', 'roadCare', 'familyMove']) dispatch(s, { type: 'policy', id: p, on: true });
      if (m === 40) dispatch(s, { type: 'demolish', id: s.buildings.find(b => b.kind === 'park')!.id });
      if (m === 120) for (const p of ['shopStart', 'homeReform', 'roadCare', 'familyMove', 'careStaff']) dispatch(s, { type: 'policy', id: p, on: false });
      const prevEnd = s.ledger.length ? s.ledger.at(-1)!.cashEnd : P.startCash;
      stepMonth(s);
      for (const e of [...s.events.active]) { const c0 = s.cash; dispatch(s, { type: 'event', id: e.id, option: 1 }); otherPaid += c0 - s.cash; }
      s.pendingElection = null;
      const L = s.ledger.at(-1)!;
      expect(Math.abs(ledgerGap(L))).toBeLessThan(1e-6);
      expect(L.cashStart).toBeCloseTo(prevEnd, 6);
      expect(s.cash).toBeGreaterThanOrEqual(0);
      expect(s.loans.filter(l => l.kind === 'bond').reduce((a, l) => a + l.remaining, 0)).toBeLessThanOrEqual(P.bondLimit + 1e-6);
      expect(validateState(s)).toBeNull();
    }
    void builtCost; void otherPaid;
    // 市債は 120 か月で完済、一時借入も黒字の間に減る
    expect(s.loans.filter(l => l.kind === 'bond' && l.principal === 30000).length).toBe(0);
  }, 60000);
  it('建設費・更新費・イベント支出・市債は台帳にそれぞれ 1 回だけ載る', () => {
    const s = newGame();
    dispatch(s, { type: 'borrow', amount: 20000 });
    dispatch(s, { type: 'build', kind: 'nursery', x: 14, y: 16 });
    dispatch(s, { type: 'renew', id: s.buildings.find(b => b.kind === 'water')!.id });
    s.events.active.push({ id: 'careStaff', start: 0, target: s.buildings.find(b => b.kind === 'nursery')!.id, detail: '' });
    dispatch(s, { type: 'event', id: 'careStaff', option: 1 }); // 600 万円
    for (let i = 0; i < 14; i++) stepMonth(s, { forecast: true });
    const sum = (k: 'capital' | 'other' | 'borrowed') => s.ledger.reduce((a, L) => a + L[k], 0);
    expect(sum('capital')).toBe(DEFS.nursery.cost + DEFS.water.renewCost);
    expect(sum('other')).toBe(600);
    expect(sum('borrowed')).toBe(20000);
  });
  it('一時借入が上限を超えると財政危機になり、新しい建設・道路・政策は止まる。危機は画面と選挙に出る', () => {
    const s = newGame();
    s.modifiers.push({ key: 'test', op: 'add', v: 0, until: -1, cost: 6000, src: 'テスト用の恒常的な支出' });
    let m = 0; while (!fiscalCrisis(s) && m++ < 60) stepMonth(s, { forecast: true });
    expect(fiscalCrisis(s)).toBe(true);
    s.cash = 50000;
    for (const a of [{ type: 'build', kind: 'park', x: 14, y: 16 }, { type: 'road', tiles: [idx(12, 9)], road: 1 }, { type: 'policy', id: 'careStaff', on: true }] as Action[]) {
      const before = snap(s);
      const r = dispatch(s, a);
      expect(r.ok).toBe(false); expect(r.msg).toContain('財政危機');
      expect(snap(s)).toBe(before);
    }
    expect(dispatch(s, { type: 'renew', id: s.buildings.find(b => b.kind === 'water')!.id }).ok).toBe(true); // 既存施設の更新は止めない
    expect(tempDebt(s)).toBeGreaterThan(P.tempLimit);
  });
});

describe('5. 私立保育園の定員拡大は選んだ園だけ', () => {
  it('2 園あるとき、イベントの対象の園だけが拡張される', () => {
    const s = newGame();
    const p1 = s.buildings.find(b => b.kind === 'privNursery')!;
    const p2 = addBuilding(s, 'privNursery', 14, 16, 'operating', 0); p2.staff = DEFS.privNursery.staffReq; recompute(s);
    s.events.active.push({ id: 'mansionBoom', start: 0, target: p1.id, detail: '' });
    expect(dispatch(s, { type: 'event', id: 'mansionBoom', option: 0 }).ok).toBe(true);
    for (let i = 0; i < 12; i++) stepMonth(s, { forecast: true });
    expect(validateState(s)).toBeNull();
    const cap = (b: typeof p1) => DEFS.privNursery.capacity + s.modifiers.filter(m => m.key === 'privCap:' + b.id).reduce((a, m) => a + m.v, 0);
    expect(cap(p1)).toBe(DEFS.privNursery.capacity + 30);
    expect(cap(p2)).toBe(DEFS.privNursery.capacity);
  });
});

describe('6. イベントの選択時の値と、工事中の保育園', () => {
  it('選んだ時の待機・混雑・資金・地区別満足が記録され、保存・読込できる', () => {
    const s = newGame();
    const n = s.buildings.find(b => b.kind === 'nursery')!;
    s.events.active.push({ id: 'careStaff', start: 0, target: n.id, detail: '' });
    const w = s.stats.waitlist;
    expect(dispatch(s, { type: 'event', id: 'careStaff', option: 1 }).ok).toBe(true);
    const e = s.events.log.at(-1)!;
    expect(e.before!.wait).toBeCloseTo(w, 0); expect(e.before!.sat.length).toBe(DISTRICTS.length);
    expect(deserialize(serialize(s)).ok).toBe(true);
  });
  it('工事中の保育園は定員に数えない', () => {
    const s = newGame();
    const cap0 = s.stats.careCap;
    expect(dispatch(s, { type: 'build', kind: 'nursery', x: 14, y: 16 }).ok).toBe(true);
    expect(s.stats.careCap).toBeCloseTo(cap0, 6);
    for (let i = 0; i < DEFS.nursery.months - 1; i++) { stepMonth(s, { forecast: true }); }
    const b = s.buildings.find(o => o.kind === 'nursery' && o.x === 14)!;
    expect(b.status).toBe('construction'); expect(b.effCap).toBe(0);
    stepMonth(s, { forecast: true });
    expect(b.status).toBe('operating'); expect(b.effCap).toBeGreaterThan(0); expect(b.effCap).toBeLessThan(DEFS.nursery.capacity * 0.5); // 職員はまだ 3 割
  });
});

describe('7. 48 か月の通しプレイ', () => {
  it('選挙が出て、その後も矛盾なく進む（状態の検証・台帳の検算が毎月通る）', () => {
    const s = newGame();
    dispatch(s, { type: 'borrow', amount: 20000 }); dispatch(s, { type: 'build', kind: 'nursery', x: 14, y: 16 }); dispatch(s, { type: 'policy', id: 'careStaff', on: true });
    let elections = 0;
    for (let m = 0; m < 72; m++) {
      if (m === 4) dispatch(s, { type: 'renew', id: s.buildings.find(b => b.kind === 'water')!.id });
      stepMonth(s);
      for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: 0 }).ok || dispatch(s, { type: 'event', id: e.id, option: 2 });
      if (s.pendingElection) { elections++; expect(s.month).toBe(48); s.pendingElection = null; }
      expect(validateState(s)).toBeNull();
      expect(Math.abs(ledgerGap(s.ledger.at(-1)!))).toBeLessThan(1e-6);
    }
    expect(elections).toBe(1);
    expect(s.month).toBe(72);
    expect(deserialize(serialize(s)).ok).toBe(true);
  });
});

describe('長く遊んだセーブ', () => {
  it('私立園の定員拡大が積み重なっても、職員数は上限内に収まり、操作できる', () => {
    const s = newGame();
    const b = s.buildings.find(o => o.kind === 'privNursery')!;
    for (let k = 0; k < 40; k++) s.modifiers.push({ key: 'privCap:' + b.id, op: 'add', v: 30, until: -1, cost: 0, src: 'テスト' });
    b.staff = 500; // 以前の版で上限を超えてしまったセーブ
    const r = dispatch(s, { type: 'borrow', amount: 1000 });
    expect(r.ok).toBe(true);
    for (let m = 0; m < 6; m++) stepMonth(s);
    expect(validateState(s)).toBeNull();
    expect(b.staff!).toBeLessThanOrEqual(DEFS.privNursery.staffReq * 9);
  });
});
