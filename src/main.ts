import './ui/style.css';
import { Game } from './game';
import { View } from './render/scene';
import { UI } from './ui/ui';
import { stepMonth, setMap, MAP_ID, baseEntry, W as SW, seedForTerrain, newMayor, levelOf, polOf, DEFS } from './sim/index';
import { takeRun, clearRun, noteCareer } from './career';
import { chooseMap } from './ui/title';
import { loadMap } from './maps/store';
import { sound } from './audio/sound';
import { setOnlineHook } from './online';
import { recordTimeline } from './ui/timelapse';

declare global { interface Window { claude?: any; __sumu?: any } }

function start(data: { save?: string; terrain?: string; contest?: number } = {}): void {
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const game = new Game(data.terrain ? Game.fresh({ seed: seedForTerrain(data.terrain, data.contest !== undefined ? 400000 + (data.contest % 500000) : undefined) }) : undefined);
  if (data.contest !== undefined && !data.save) { const p = polOf(game.state); (p as any).contest = { week: data.contest, start: game.state.month }; game.state.difficulty = 'normal'; game.state.notes.push(`🏁 今週の大会が始まりました。10 年でどこまで育てられるか、ほかの市長と比べます（「市長」タブ）`); }
  // 別の街への立候補：前の街の経験（市長ポイントの 3 割）を持って始める
  { const run = takeRun(); if (run && !data.save) { const M = game.state.mayor ?? (game.state.mayor = newMayor()); M.pts = run.carry; M.seenLv = levelOf(run.carry); game.state.notes.push(`🗳 ${run.from}の市長の経験を活かして、${game.state.cityName}の市長になりました（市長ポイント ${run.carry} から）`); } clearRun(); }
  const loaded = data && data.save ? game.loadText(data.save) : null;
  let view: View;
  try { view = new View(canvas, () => game.view); }
  catch (e) {
    document.getElementById('app')!.insertAdjacentHTML('beforeend', `<div id="modal"><div class="dialog"><header><h2>3D 表示を開始できません</h2></header><div class="body"><p>このブラウザでは WebGL が使えないようです。ハードウェアアクセラレーションを有効にするか、別のブラウザでお試しください。</p><p class="note">${(e as Error).message}</p><pre class="note" style="white-space:pre-wrap;font-size:10px">${String((e as Error).stack ?? "").split("\n").slice(0, 4).join("\n")}</pre></div></div></div>`);
    return;
  }
  if (window.innerWidth <= 900 || matchMedia('(pointer: coarse)').matches) view.setQuality('mid');
  { let lite = matchMedia('(pointer: coarse)').matches; try { const v = localStorage.getItem('sumu-lite'); if (v === '1' || v === '0') lite = v === '1'; } catch { /* なし */ } if (lite) view.setLite(true); }
  const ui = new UI(game, view);
  setOnlineHook(() => { if (ui.tab === 'mayor') ui.renderSide(); });
  view.onSfx = (k, x, y, z) => sound.onView(k, x, y, z, view.audioInfo());
  { const sb = document.querySelector('.sndbtn'); if (sb) sb.textContent = sound.set.on ? '🔊' : '🔇'; }
  if (/perf|debug/.test(location.hash)) document.body.classList.add('debug');
  // 上の帯の高さは画面幅や文字の大きさで変わる（スマホでは 2〜3 行に折り返す）。下に出す案内や資料が帯に隠れないよう、実際の高さを使う
  { const top = document.getElementById('top'); const fit = () => { if (top) document.documentElement.style.setProperty('--top-h', `${Math.ceil(top.getBoundingClientRect().height)}px`); };
    fit(); try { new ResizeObserver(fit).observe(top!); } catch { window.addEventListener('resize', fit); } }
  ui.renderTools(); ui.applyFont(); ui.renderBell();
  try { if (localStorage.getItem('sumu-viewbar') === '1' && window.innerWidth > 900) { document.getElementById('viewbar')?.classList.add('open'); ui.renderViewbar(); } } catch { /* なし */ }
  // 需要のメーター（住・商・職）は道具の列の下に置く（道具の数や大きさが変わっても重ならないように）
  { const tools = document.getElementById('tools'); const fit = () => { if (!tools) return; const r = tools.getBoundingClientRect(), app = document.getElementById('app')?.getBoundingClientRect(); document.documentElement.style.setProperty('--tools-b', `${Math.ceil(r.bottom - (app?.top ?? 0) + 10)}px`); };
    fit(); try { const ro = new ResizeObserver(fit); ro.observe(tools!); ro.observe(document.getElementById('top')!); } catch { window.addEventListener('resize', fit); } window.addEventListener('resize', fit); }
  if (loaded) ui.toast(loaded.msg, !loaded.ok);
  // 毎年 4 月に自動保存（オートや検証のときも）
  game.onMonth.push(() => { if (game.state.month % 12 === 0 && !game.draft) game.saveSlot('auto'); if (!game.draft) { noteCareer(game.state); recordTimeline(game.state); } });
  recordTimeline(game.state);
  window.__sumu = { game, view, ui, sound, stepMonth, DEFS, get W() { return SW; } }; // 検証スクリプト用
  (document as any).fonts?.ready?.then(() => view.redrawSigns());
  // 公開ページが更新されても街を引き継ぐ
  try { window.claude?.hot?.snapshot?.(() => ({ save: game.exportText(), mapId: MAP_ID })); } catch (e) { console.warn('snapshot', e); }
  let last = performance.now(), slowT = 0; const seenErr = new Set<string>();
  const loopErr = (w: string, e: unknown) => { const m = `${w}: ${(e as Error)?.message ?? e}`; if (seenErr.has(m)) return; seenErr.add(m); console.error(m, e); };
  const loop = (now: number) => {
    // スマホの軽量表示は 1 秒 30 コマにして、電池と発熱を抑える（見た目の滑らかさはほぼ変わらない）
    if (view.lite && now - last < 30) { requestAnimationFrame(loop); return; }
    const dt = Math.min(0.5, (now - last) / 1000); last = now;
    // 1 つの処理で例外が出ても、繰り返し（画面の更新）は止めない
    try { game.tick(dt); } catch (e) { loopErr('game', e); }
    try { view.frame(dt); } catch (e) { loopErr('view', e); }
    try { ui.tick(); } catch (e) { loopErr('ui', e); }
    try { if (sound.ctx) sound.tick(dt, game.view, view.audioInfo()); } catch (e) { console.warn('sound', e); }
    // 動きが重い端末では、描画の品質を自動で下げる
    slowT += dt;
    if (slowT > 5) { slowT = 0; const f = view.stats.fps; if (f > 0 && f < 24 && view.quality !== 'low' && !document.hidden && !window.__sumu?.fixedQuality) { view.setQuality(view.quality === 'high' ? 'mid' : 'low'); ui.toast(`動きが重いため、描画の品質を「${view.quality === 'mid' ? '中' : '低'}」に下げました（保存・設定で変えられます）`); } }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  requestAnimationFrame(() => document.getElementById('loading')?.remove());
}

/** 地図を選んでから始める。公開ページが更新されたときは、遊んでいた地図と街をそのまま引き継ぐ */
async function boot(data: { save?: string; mapId?: string } = {}): Promise<void> {
  (window as any).__sumuBoot = true; // 起動できた（index.html の見張りに知らせる）
  const loading = document.getElementById('loading');
  let toTitle = false;
  try { toTitle = sessionStorage.getItem('sumu-title') === '1'; sessionStorage.removeItem('sumu-title'); } catch { /* 使えない環境 */ }
  if (data.mapId && data.save && !toTitle) {
    const raw = await loadMap(data.mapId);
    // 前の版で遊んでいた街を引き継ぐ。読み込みで失敗したら、タイトル（地図を選ぶ画面）から始め直す
    if (raw !== undefined) { try { setMap(data.mapId, raw); start({ save: data.save }); return; } catch (e) { console.error('引き継ぎに失敗', e); document.getElementById('app')?.querySelectorAll('#modal').forEach(m => m.remove()); } }
  }
  const c = await chooseMap();
  if (loading) { loading.removeAttribute('hidden'); const sp = loading.querySelector('span'); if (sp) sp.textContent = `${baseEntry(c.id)?.name ?? '地図'}${/-d$/.test(c.id) ? '（まちづくり版）' : ''}の街を準備しています…`; }
  await new Promise(r => setTimeout(r, 30)); // 準備中の表示を先に出す
  setMap(c.id, c.raw);
  start({ save: c.save, terrain: c.terrain, contest: c.contest });
}

// 公開ページの引き継ぎ（hot）は、表示の仕組みの版によってはなかったり、呼び返しが来なかったりする。1.5 秒待って来なければ、そのまま起動する
{ let done = false; const go = (d: any) => { if (done) return; done = true; boot(d ?? {}).catch(e => { console.error('起動に失敗', e); (window as any).__sumuBootShow?.(String(e)); }); };
  try { const hot = window.claude?.hot; if (hot && typeof hot.ready === 'function') { hot.ready((d: any) => go(d)); setTimeout(() => go(hot.data ?? {}), 1500); } else go(hot?.data ?? {}); }
  catch (e) { console.warn('hot', e); go({}); } }
