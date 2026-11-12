// 予測を別スレッドで計算する。画面の操作や描画を止めないため。only で一部の見通しだけを受け持てる（並列計算用）。
import { forecastScenario, SCENARIOS } from './forecast';
import type { GameState } from './types';
import { setMap, MAP_ID } from './real';

self.onmessage = (ev: MessageEvent<{ text: string; months: number; only?: number[]; mapId: string; raw: any }>) => {
  try {
    if (ev.data.mapId !== MAP_ID) setMap(ev.data.mapId, ev.data.raw); // 画面側と同じ地図にする
    const s = JSON.parse(ev.data.text) as GameState;
    const months = ev.data.months, only = ev.data.only ?? SCENARIOS.map((_, i) => i), total = months * only.length;
    let done = 0;
    const sets = only.map(i => { const sc = SCENARIOS[i]; return { index: i, label: sc.label, factor: sc.factor, rows: forecastScenario(s, sc.factor, months, () => { done++; if (done % 3 === 0) (self as any).postMessage({ type: 'progress', p: done / total }); }) }; });
    (self as any).postMessage({ type: 'done', sets });
  } catch (e) { (self as any).postMessage({ type: 'error', message: (e as Error).message }); }
};
