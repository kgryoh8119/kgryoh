// オンラインランキング：claude.ai の公開ページ（Artifact）の共有データ（db）に、遊んでいる人ごとの街の成績を 1 件ずつ置く。
// 公開ページの外（ダウンロードした HTML など）や、書き込みの権限がない人は使えない（ランキングは見えない・送れないだけで、遊ぶのには関係しない）
import type { GameState } from './sim/index';
import { levelOf, terrainOf, REAL } from './sim/index';

export type Score = { id: string; city: string; terrain: string; pop: number; lv: number; pts: number; years: number; rank: number; score: number; diff: string; at: number; name?: string; me?: boolean };
type St = { db: any; user: any; id: string | null; rows: Score[]; err: string; ready: boolean; last: number };
const S: St = { db: null, user: null, id: null, rows: [], err: '', ready: false, last: 0 };
let started = false, onChange: () => void = () => {};

/** 成績の点：人口（100 人で 1 点）＋市長ポイント＋勲章（1 つ 10 点） */
export const scoreOf = (s: GameState) => Math.round(s.stats.pop / 100 + (s.mayor?.pts ?? 0) + Object.keys(s.mayor?.medals ?? {}).length * 10);
export function onlineState(): { started: boolean; ready: boolean; err: string; rows: Score[]; can: boolean } { return { started, ready: S.ready, err: S.err, rows: S.rows, can: !!S.db && !!S.id }; }
export function setOnlineHook(cb: () => void): void { onChange = cb; }
/** 共有データに初めてつなぐ（ランキングの「読み込む」を押したときだけ。起動のときには呼ばない） */
export function startOnline(): void {
  if (started) return; started = true;
  const c = (window as any).claude;
  if (!c?.use) { S.err = 'このページは claude.ai の公開ページで開くと、ランキングに参加できます'; S.ready = true; return; }
  (async () => {
    try {
      const [db, user] = await Promise.all([c.use('db'), c.use('user')]);
      if (!db || !user) { S.err = 'ランキングは使えません（サインインしていないか、この表示では共有データが使えません）'; S.ready = true; onChange(); return; }
      S.db = db; S.user = user; S.id = await user.id();
      await refresh(); await listCities();
    } catch (e) { S.err = 'ランキングを読み込めませんでした'; S.ready = true; onChange(); }
  })();
}
export async function refresh(): Promise<void> {
  if (!S.db) return;
  const timer = setTimeout(() => { if (!S.ready) { S.err = 'ランキングの読み込みに時間がかかっています'; S.ready = true; onChange(); } }, 10000);
  try {
    const snap = await S.db.collection('scores').orderBy('score', 'desc').limit(30).get();
    const rows: Score[] = snap.docs.map((d: any) => ({ ...(d.data() as Score), id: d.id })).filter((r: Score) => typeof r.score === 'number' && typeof r.city === 'string');
    let names: Record<string, { name: string; isMe: boolean }> = {};
    try { names = await S.user.profiles(rows.map(r => r.id)); } catch { /* 名前なし */ }
    for (const r of rows) { r.name = names[r.id]?.name || '市長'; r.me = r.id === S.id; }
    S.rows = rows; S.err = '';
  } catch (e: any) { S.err = e?.code === 'not_granted' ? 'ランキングを見る権限がありません' : 'ランキングを読み込めませんでした'; }
  clearTimeout(timer); S.ready = true; onChange();
}
/** 自分の街の成績を送る（1 人 1 件。前のものは上書き）。同じ月には 1 回だけ */
export async function submit(s: GameState): Promise<string> {
  if (!S.db || !S.id) return S.err || 'ランキングに参加できません';
  if (REAL) return '実在の街の地図ではランキングに送れません（架空の街だけ）';
  if (S.last === s.month) return '今月の成績はもう送りました';
  const M = s.mayor, row = { city: String(s.cityName).slice(0, 30), terrain: terrainOf(s.seed).name, pop: Math.round(s.stats.pop), lv: M ? levelOf(M.pts) : 1, pts: Math.round(M?.pts ?? 0), years: Math.floor(s.month / 12), rank: M?.ranks.at(-1)?.total ?? 0, score: scoreOf(s), diff: s.difficulty ?? 'normal', at: Date.now() };
  try { await S.db.collection('scores').doc(S.id).set(row); S.last = s.month; await refresh(); return `ランキングに送りました（${row.score.toLocaleString()} 点）`; }
  catch (e: any) { return e?.code === 'not_granted' ? '書き込みの権限がありません（閲覧のみで共有されたページでは送れません）' : '送れませんでした。時間をおいてもう一度どうぞ'; }
}

// ---------------------------------------------------------------- 街の共有（このページを共有した人どうしで、街を見せ合う・引き継いで遊ぶ）
export type SharedCity = { id: string; city: string; terrain: string; pop: number; lv: number; years: number; at: number; kb: number; name?: string; me?: boolean };
let shared: SharedCity[] = [];
export const sharedCities = () => shared;
async function gz(text: string): Promise<string> {
  const cs = new (window as any).CompressionStream('gzip'), buf = await new Response(new Blob([text]).stream().pipeThrough(cs)).arrayBuffer(), b = new Uint8Array(buf);
  let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s);
}
async function gunz(b64: string): Promise<string> {
  const bin = atob(b64), a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  const ds = new (window as any).DecompressionStream('gzip'); return await new Response(new Blob([a]).stream().pipeThrough(ds)).text();
}
export async function shareCity(s: GameState, saveText: string): Promise<string> {
  if (!S.db || !S.id) return 'まず［ランキングを読み込む］を押して、共有データにつないでください';
  if (REAL) return '実在の街の地図は共有できません（架空の街だけ）';
  if (typeof (window as any).CompressionStream === 'undefined') return 'このブラウザでは共有できません';
  try {
    const d = await gz(saveText); if (d.length > 900000) return `街のデータが大きすぎて共有できません（${Math.round(d.length / 1024)} KB）`;
    await S.db.collection('cityData').doc(S.id).set({ d, at: Date.now() });
    await S.db.collection('cities').doc(S.id).set({ city: String(s.cityName).slice(0, 30), terrain: terrainOf(s.seed).name, pop: Math.round(s.stats.pop), lv: s.mayor ? levelOf(s.mayor.pts) : 1, years: Math.floor(s.month / 12), at: Date.now(), kb: Math.round(d.length / 1024) });
    await listCities(); return `「${s.cityName}」を共有しました。このページを共有した人が、見たり引き継いで遊んだりできます`;
  } catch (e: any) { return e?.code === 'not_granted' ? '書き込みの権限がありません（閲覧のみで共有されたページでは送れません）' : '共有できませんでした'; }
}
export async function listCities(): Promise<void> {
  if (!S.db) return;
  try {
    const snap = await S.db.collection('cities').orderBy('at', 'desc').limit(20).get();
    const rows: SharedCity[] = snap.docs.map((d: any) => ({ ...(d.data() as SharedCity), id: d.id })).filter((r: SharedCity) => typeof r.city === 'string');
    let names: Record<string, { name: string }> = {}; try { names = await S.user.profiles(rows.map(r => r.id)); } catch { /* 名前なし */ }
    for (const r of rows) { r.name = names[r.id]?.name || '市長'; r.me = r.id === S.id; } shared = rows; onChange();
  } catch { /* 読めない */ }
}
export async function loadShared(id: string): Promise<string | null> {
  if (!S.db) return null;
  try { const d = await S.db.collection('cityData').doc(id).get(); const v = d.exists ? (d.data() as any)?.d : null; return typeof v === 'string' ? await gunz(v) : null; } catch { return null; }
}

// ---------------------------------------------------------------- クラウドへの保存（あなただけが読める場所。別の端末で続きを遊べる）
async function ensure(): Promise<boolean> { if (!started) startOnline(); for (let k = 0; k < 50 && !S.ready; k++) await new Promise(r => setTimeout(r, 200)); return !!S.db && !!S.id; }
export async function cloudSave(s: GameState, text: string): Promise<string> {
  if (!(window as any).claude?.use) return 'クラウドの保存は、claude.ai の公開ページで開いたときだけ使えます';
  if (!(await ensure())) return S.err || 'クラウドにつなげませんでした';
  try { const d = await gz(text); if (d.length > 900000) return '街のデータが大きすぎて保存できません'; await S.db.collection('data/users/' + S.id).doc('save').set({ d, at: Date.now(), city: String(s.cityName).slice(0, 30), month: s.month }); return `クラウドに保存しました（${Math.round(d.length / 1024)} KB）`; }
  catch { return 'クラウドに保存できませんでした'; }
}
export async function cloudLoad(): Promise<string | null> {
  if (!(window as any).claude?.use || !(await ensure())) return null;
  try { const d = await S.db.collection('data/users/' + S.id).doc('save').get(); const v = d.exists ? (d.data() as any)?.d : null; return typeof v === 'string' ? await gunz(v) : null; } catch { return null; }
}

// ---------------------------------------------------------------- 今週の大会（同じ地図・同じ条件で 10 年。1 人 1 件）
export type ContestRow = { id: string; week: number; city: string; score: number; pop: number; years: number; at: number; name?: string; me?: boolean };
let contestRows: ContestRow[] = [];
export const contestList = () => contestRows;
export async function contestSubmit(s: GameState, week: number): Promise<string> {
  if (!(await ensure())) return S.err || '共有データにつなげませんでした';
  try { await S.db.collection('contest').doc(S.id).set({ week, city: String(s.cityName).slice(0, 30), score: scoreOf(s), pop: Math.round(s.stats.pop), years: Math.floor(s.month / 12), at: Date.now() }); await contestLoad(week); return `大会の成績を送りました（${scoreOf(s).toLocaleString()} 点）`; }
  catch (e: any) { return e?.code === 'not_granted' ? '書き込みの権限がありません' : '送れませんでした'; }
}
export async function contestLoad(week: number): Promise<void> {
  if (!(await ensure())) return;
  try { const snap = await S.db.collection('contest').orderBy('score', 'desc').limit(60).get(); const rows: ContestRow[] = snap.docs.map((d: any) => ({ ...(d.data() as ContestRow), id: d.id })).filter((r: ContestRow) => r.week === week);
    let names: Record<string, { name: string }> = {}; try { names = await S.user.profiles(rows.map(r => r.id)); } catch { /* なし */ } for (const r of rows) { r.name = names[r.id]?.name || '市長'; r.me = r.id === S.id; } contestRows = rows; onChange(); } catch { /* 読めない */ }
}
