// v93：全地形（v94：市長レベルに届いた月 lvAt・道路に接していない建物 noRoad／noRoadNew を足した） × 難易度 × 打ち手の長い計測（scripts/balance.ts の回し方に、打ち手 3 通りと NaN・例外の検査を足したもの）
// 実行：npx esbuild scripts/balance-v93.ts --bundle --platform=node --format=esm --outfile=/tmp/b.mjs && TERR=coast DIFF=normal STRAT=issue N=1 YEARS=8 node /tmp/b.mjs
// STRAT：auto（autoTurn）／issue（3 か月ごとに今月の課題の上から、試算の候補の先頭で実行できるものを 1 つ）／idle（何もしない）
import { newGame, stepMonth, dispatch, eventDef, seedForTerrain, monthlyIssues } from '../src/sim/index';
import { electionOutlook } from '../src/sim/step';
import { trialOptions, recordDecision } from '../src/sim/report';
import { autoTurn } from '../src/autoplay';
import '../src/sim/wire';
import { accessTile } from '../src/sim/core';
import { levelOf } from '../src/sim/mayor';
import { W } from '../src/sim/config';
import type { GameState } from '../src/sim/types';

const env = process.env;
const terr = env.TERR ?? 'coast', diff = (env.DIFF ?? 'normal') as 'normal', strat = env.STRAT ?? 'issue', Y = Number(env.YEARS ?? 8), runs = Number(env.N ?? 1), seed0 = Number(env.SEED0 ?? 0);

function issueTurn(s: GameState): string | null {
  const op = s.history.at(-1)?.op ?? 0;
  for (const iss of monthlyIssues(s)) {
    let opts; try { opts = trialOptions(s, iss); } catch { continue; }
    for (const o of opts) {
      if (!o.actions || !o.actions.length || o.warn || o.fitNote || /やめる/.test(o.label)) continue;
      const isPol = o.actions.every(a => a.type === 'policy');
      if (isPol && (o.cost ?? 0) > op) continue;
      if (!isPol && (o.cost ?? 0) > s.cash) continue;
      let ok = false; for (const a of o.actions) { const r = dispatch(s, a); ok = ok || r.ok; }
      if (ok) { recordDecision(s, o.label, '課題', {}, { issue: iss.key, forecast: false, action: o.actions[0] }); return `${iss.key}:${o.label}`; } // 画面から実行したときと同じく施策の記録を残す
    }
  }
  return null;
}

for (let k = 0; k < runs; k++) {
  const n = 261011 + seed0 + k;
  const s = newGame({ seed: seedForTerrain(terr, n) }); s.difficulty = diff; s.tutorial.done = true;
  const t0 = Date.now(); let errs = 0, nan = 0, acts = 0, firstErr = '', pass = 0, fail = 0, minCash = 1e12;
  const pop0 = s.stats.pop; const log: string[] = [];
  // v94：市長レベルに届いた月・道路に接していない建物（どこで建ったか：auto＝オートの手番／step＝月の処理（民間の着工など））
  const lvAt: number[] = []; const noRoadNew: Record<string, number> = {};
  const seen = new Set(s.buildings.map(b => b.id));
  const scanNew = (tag: string) => { for (const b of s.buildings) if (!seen.has(b.id)) { seen.add(b.id); if (accessTile(s, b.x, b.y, b.w, b.h) < 0) { const k = `${tag}:${b.kind}`; noRoadNew[k] = (noRoadNew[k] ?? 0) + 1; } } };
  for (let m = 0; m < Y * 12 && !s.over; m++) {
    try {
      if (strat === 'auto') autoTurn(s);
      else if (strat === 'issue' && m % 3 === 0) { const r = issueTurn(s); if (r) { acts++; if (env.LOG) log.push(`${m}:${r}`); } }
    } catch (e) { errs++; firstErr ||= (e as Error).message; }
    scanNew(strat);
    if (env.LOG && s.mode === 'term' && s.month + 1 - s.termStart >= s.termLength) { const o = electionOutlook(s); log.push(`選挙前 ${s.month} 見込み ${o.vote.toFixed(1)}：` + o.parts.map(p => `${p.label} ${p.v.toFixed(1)}`).join('／') + ` 資金 ${Math.round(s.cash)}`); }
    try { stepMonth(s); } catch (e) { errs++; firstErr ||= 'step:' + (e as Error).message; }
    scanNew('step');
    { const l = s.mayor ? levelOf(s.mayor.pts) : 1; for (let q = 2; q <= l; q++) if (lvAt[q] === undefined) lvAt[q] = s.month; }
    for (const e of [...s.events.active]) dispatch(s, { type: 'event', id: e.id, option: eventDef(e.id).options.length - 1 });
    if (s.goalPick) dispatch(s, { type: 'goals', ids: ['wait', 'pop', 'fiscal'] });
    // 落選しても、2 回目の選挙まで測るため任期を続けたことにする（得票は落選の記録のまま）
    if (s.pendingElection) { if (!s.pendingElection.win) { s.mode = 'term'; s.termStart = s.month; s.goalPick = true; } s.pendingElection = null; }
    for (const nt of s.notes) { if (nt.includes('可決されました')) pass++; if (nt.includes('否決されました')) fail++; }
    s.notes = [];
    if (![s.cash, s.stats.pop, s.approval, s.stats.sat].every(Number.isFinite)) nan++;
    minCash = Math.min(minCash, s.cash);
  }
  const op = s.history.at(-1)?.op ?? 0;
  const noRoad: Record<string, number> = {}; for (const b of s.buildings) if (accessTile(s, b.x, b.y, b.w, b.h) < 0) noRoad[b.kind] = (noRoad[b.kind] ?? 0) + 1;
  // 見た目で道路に面していない建物：接する道路が橋・トンネル・陸橋（線路をまたぐ）だけ／市外につながっていない
  const S2 = new Set([...(s.tunnel ?? []), ...(s.bridge ?? []), ...(s.overpass ?? [])]); const viaStruct: Record<string, number> = {}; let disc = 0;
  for (const b of s.buildings) { if (b.status === 'operating' && !b.connected) disc++; const adj: number[] = [];
    for (let k = 0; k < b.w; k++) adj.push((b.y - 1) * W + b.x + k, (b.y + b.h) * W + b.x + k); for (let k = 0; k < b.h; k++) adj.push((b.y + k) * W + b.x - 1, (b.y + k) * W + b.x + b.w);
    const rd = adj.filter(i => i >= 0 && i < s.road.length && s.road[i]); if (rd.length && rd.every(i => S2.has(i))) viaStruct[b.kind] = (viaStruct[b.kind] ?? 0) + 1; }
  const rk = s.mayor?.ranks ?? [];
  console.log(JSON.stringify({ lv: s.mayor ? levelOf(s.mayor.pts) : 1, pts: Math.round(s.mayor?.pts ?? 0), rankPts: rk.reduce((a, r) => a + (r.pts ?? 0), 0), ranks: rk.map(r => `${r.total}${r.awards.length ? '+' + r.awards.length : ''}`).join(' '), medals: Object.keys(s.mayor?.medals ?? {}).join(','), lvAt: lvAt.map((v, q) => `${q}:${v}`).filter(Boolean).join(' '), noRoadN: Object.values(noRoad).reduce((a, b) => a + b, 0), noRoad, viaStruct, disc, noRoadNew, nb: s.buildings.length, terr, diff, strat, n, el: s.elections.map(e => ({ w: e.win, v: +e.vote.toFixed(1) })), pop0: Math.round(pop0), pop: Math.round(s.stats.pop), cash: Math.round(s.cash), minCash: Math.round(minCash), op: Math.round(op), appr: +s.approval.toFixed(2), sat: +s.stats.sat.toFixed(2), wait: Math.round(s.stats.waitlist ?? 0), budget: `${pass}/${pass + fail}`, fiscal: s.fiscal?.status ?? '', over: !!s.over, acts, errs, nan, firstErr, sec: Math.round((Date.now() - t0) / 1000), ...(env.LOG ? { log } : {}) }));
}
