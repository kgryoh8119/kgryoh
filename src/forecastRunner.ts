// 予測の実行。可能ならワーカー（別スレッド）、使えなければ画面側で少しずつ計算する。中止できる。
import { forecastAsync, SCENARIOS, MAP_ID, MAP_RAW } from './sim/index';
import type { GameState, ForecastSet } from './sim/index';
import FcWorker from './sim/forecast.worker?worker&inline';

export interface FcJob { promise: Promise<ForecastSet[]>; cancel(): void; mode: 'worker' | 'main' }
let workerBroken = false;

export function startForecast(state: GameState, months: number, onProgress: (p: number) => void): FcJob {
  if (!workerBroken && typeof Worker !== 'undefined') {
    // 見通し（楽観・基準・慎重）を、使える CPU の数に応じて最大 3 つのワーカーに分ける
    const n = Math.max(1, Math.min(SCENARIOS.length, (navigator.hardwareConcurrency || 2) - 1));
    const workers: Worker[] = [];
    try { for (let k = 0; k < n; k++) workers.push(new FcWorker()); } catch { workerBroken = true; for (const w of workers) w.terminate(); workers.length = 0; }
    if (workers.length) {
      const text = JSON.stringify(state), prog = workers.map(() => 0), parts: any[][] = workers.map(() => []);
      let reject!: (e: Error) => void, left = workers.length, cancelled = false;
      const stopAll = () => { for (const w of workers) w.terminate(); };
      const promise = new Promise<ForecastSet[]>((res, rej) => {
        reject = rej;
        workers.forEach((worker, k) => {
          const only = SCENARIOS.map((_, i) => i).filter(i => i % workers.length === k);
          worker.onmessage = (ev: MessageEvent<any>) => {
            if (ev.data.type === 'progress') { prog[k] = ev.data.p * only.length; onProgress(prog.reduce((a, b) => a + b, 0) / SCENARIOS.length); }
            else if (ev.data.type === 'done') { worker.terminate(); parts[k] = ev.data.sets; if (--left === 0) res(parts.flat().sort((a, b) => a.index - b.index).map(({ index: _i, ...r }) => r)); }
            else { stopAll(); rej(new Error(ev.data.message)); }
          };
          worker.onerror = () => {
            // 別スレッドが使えない環境（ファイルを直接開いた一部のブラウザなど）では、画面側で少しずつ計算する
            if (workerBroken) return;
            stopAll(); workerBroken = true;
            forecastAsync(structuredClone(state), months, onProgress, () => cancelled).then(res, rej);
          };
          worker.postMessage({ text, months, only, mapId: MAP_ID, raw: MAP_RAW });
        });
      });
      return { promise, cancel: () => { cancelled = true; stopAll(); reject(new Error('cancelled')); }, mode: 'worker' };
    }
  }
  let stop = false;
  const snapshot = structuredClone(state);
  return { promise: forecastAsync(snapshot, months, onProgress, () => stop), cancel: () => { stop = true; }, mode: 'main' };
}
