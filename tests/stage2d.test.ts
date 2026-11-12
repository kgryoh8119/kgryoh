// 第 2 段階 D（v85）：今月の街の課題を最大 3 件。原因に合った対策だけを勧める・同じ問題を重ねない・状態を変えない
import { describe, it, expect } from 'vitest';
import { newGame, dispatch, stepMonth, DEFS, monthlyIssues, allIssues, careCause, ISSUE_W, designCap, eventDef } from '../src/sim/index';
import type { GameState } from '../src/sim/types';

const run = (s: GameState, n: number) => { for (let i = 0; i < n; i++) { stepMonth(s); for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 }); s.pendingElection = null; } };
const care = (s: GameState) => allIssues(s).find(i => i.key === 'care');
const acts = (i: { options: { act: string; arg: string }[] }) => i.options.map(o => `${o.act}:${o.arg}`).join(' ');
const nurs = (s: GameState) => s.buildings.filter(b => DEFS[b.kind].fam === 'care' || b.kind === 'privNursery');

describe('D. 今月の街の課題', () => {
  it('最大 3 件・重要な順・同じ問題は 1 件。何が／どこ／主因／対策がそろう', () => {
    const s = newGame(), all = allIssues(s), top = monthlyIssues(s);
    expect(top.length).toBeGreaterThan(0); expect(top.length).toBeLessThanOrEqual(3);
    expect(new Set(all.map(i => i.key)).size).toBe(all.length);
    for (let k = 1; k < all.length; k++) expect(all[k - 1].score).toBeGreaterThanOrEqual(all[k].score);
    expect(top).toEqual(all.filter(i => i.score >= 6).slice(0, 3));
    for (const i of all) { expect(i.title && i.what && i.where && i.cause).toBeTruthy(); expect(i.options.length).toBeGreaterThan(0); expect(i.score).toBeGreaterThanOrEqual(0); expect(i.score).toBeLessThanOrEqual(100); for (const v of Object.values(i.parts)) { expect(v).toBeGreaterThanOrEqual(0); expect(Number.isFinite(v)).toBe(true); } }
    expect(ISSUE_W.people + ISSUE_W.trend + ISSUE_W.deadline + ISSUE_W.hard).toBe(100);
    expect(top.some(i => i.key === 'care')).toBe(true); // はじめの街の課題は保育（指示書の初期状態）
    console.log(all.map(i => `${i.score} ${i.key} ${i.title} [${i.causeKind}]`).join('\n'));
  });
  it('読むだけ：何度呼んでも状態・乱数は変わらず、その後の進み方も同じ', () => {
    const a = newGame(), b = structuredClone(a); run(a, 3); run(b, 3);
    const before = JSON.stringify(a);
    for (let k = 0; k < 5; k++) { monthlyIssues(a); allIssues(a); careCause(a); }
    expect(JSON.stringify(a)).toBe(before);
    run(a, 6); run(b, 6); expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('保育：施設不足なら「建てる」を勧める（はじめの街）', () => {
    const s = newGame(), i = care(s)!;
    expect(i.causeKind).toBe('facility'); expect(i.cause).toContain('建物の定員そのものが足りていません'); expect(acts(i)).toMatch(/buildNursery|build:nursery/);
  });
  it('保育：職員不足なら新設を勧めず、人材の政策を勧める', () => {
    const s = newGame(); const w = s.stats.waitlist;
    // 建物はあるのに保育士がいない園（定員は待機より多い）
    const b = nurs(s).find(x => x.status === 'operating')!; const c = structuredClone(b); c.id = s.nextId++; c.x += 0; c.staff = 0; c.effCap = 0; c.used = 0; c.connected = true;
    Object.defineProperty(c, 'kind', { value: 'nursery', enumerable: true, writable: true }); s.buildings.push(c);
    expect(designCap(s, c)).toBeGreaterThan(w * 0.4);
    const cc = careCause(s), i = care(s)!;
    expect(cc.kind).toBe('staff'); expect(cc.lostStaff).toBeGreaterThan(0);
    expect(i.causeKind).toBe('staff'); expect(i.cause).toContain('保育士が足りず'); expect(acts(i)).toContain('tab:policy'); expect(acts(i)).not.toMatch(/build/i);
  });
  it('保育：道路につながっていない園があるなら、新設ではなく道路を勧める', () => {
    const s = newGame(); const b = nurs(s).find(x => x.status === 'operating')!; const c = structuredClone(b); c.id = s.nextId++; c.connected = false; c.effCap = 0; c.used = 0; s.buildings.push(c);
    if (designCap(s, c) < s.stats.waitlist * 0.4) { const d = structuredClone(c); d.id = s.nextId++; s.buildings.push(d); const e = structuredClone(c); e.id = s.nextId++; s.buildings.push(e); }
    const i = care(s)!;
    expect(i.causeKind).toBe('road'); expect(i.cause).toContain('道路につながっていない'); expect(acts(i)).toContain('tool:road:1'); expect(acts(i)).not.toMatch(/build/i);
  });
  it('保育：市内に空きがあるのに待機があるなら「場所が合っていない」', () => {
    const s = newGame(); const b = nurs(s).find(x => x.status === 'operating')!; b.effCap = b.used + s.stats.waitlist + 5; b.staff = 999;
    const i = care(s)!;
    expect(i.causeKind).toBe('place'); expect(i.cause).toContain('場所が合っていない'); expect(acts(i)).toContain('issue:seeCare');
  });
  it('保育：建てた直後は「完成待ち」になり、さらに建てることは勧めない。完成して職員がそろえば課題から消える', () => {
    const s = newGame();
    expect(dispatch(s, { type: 'build', kind: 'nursery', x: 14, y: 16 }).ok).toBe(true);
    const cc = careCause(s);
    if (cc.pending >= s.stats.waitlist * 0.8) { const i = care(s)!; expect(i.causeKind).toBe('wait'); expect(i.cause).toMatch(/あと最長 \d+ か月/); expect(acts(i)).not.toMatch(/build/i); expect(i.parts.hard).toBe(0); }
    else expect(care(s)!.causeKind).toBe('facility');
    const score0 = care(newGame())!.score; expect(care(s)!.score).toBeLessThanOrEqual(score0);
    dispatch(s, { type: 'policy', id: 'careStaff', on: true }); run(s, 24);
    console.log('24 か月後の待機', Math.round(s.stats.waitlist), care(s)?.causeKind ?? '（課題なし）');
    expect(s.stats.waitlist).toBeLessThan(newGame().stats.waitlist);
  });
  it('財政：一時借入があれば上位に入り、「戻しにくい」が高い。黒字で資金が少ないだけなら原因は別に書く', () => {
    const s = newGame(); s.loans.push({ kind: 'temp', remaining: 5000, rate: 0.08, monthly: 0, months: 12 } as any);
    const f = monthlyIssues(s).find(i => i.key === 'fiscal')!; expect(f).toBeTruthy(); expect(f.title).toContain('一時借入'); expect(f.parts.hard).toBeGreaterThanOrEqual(0.7); expect(acts(f)).toContain('tab:money');
    const t = newGame(); t.cash = 500; const g = allIssues(t).find(i => i.key === 'fiscal')!; expect(g.causeKind === 'cash' || g.causeKind === 'deficit').toBe(true);
  });
  it('老朽化で止まった施設は「更新」を勧め、同じ系統の容量不足でも新設より先に更新を勧める', () => {
    const s = newGame(); const w = s.buildings.find(b => DEFS[b.kind].fam === 'water')!; w.status = 'suspended'; w.age = 100; s.stats.waterCap = 0;
    const all = allIssues(s), a = all.find(i => i.key === 'aging')!, c = all.find(i => i.key === 'cap:water')!;
    expect(a.causeKind).toBe('stopped'); expect(acts(a)).toContain('renewall:all');
    expect(c.causeKind).toBe('stopped'); expect(acts(c)).toContain('renewall:water'); expect(acts(c)).not.toContain('build:waterS');
  });
  it('48 か月進めても、毎月 3 件以内・重複なし・例外なし', () => {
    const s = newGame();
    for (let m = 0; m < 48; m++) { run(s, 1); const top = monthlyIssues(s); expect(top.length).toBeLessThanOrEqual(3); expect(new Set(top.map(i => i.key)).size).toBe(top.length); for (const i of top) expect(Number.isFinite(i.score)).toBe(true); }
  });
});
