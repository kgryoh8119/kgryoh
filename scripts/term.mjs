// 体験版（24 か月）を最後まで進め、イベント画面・選挙結果・サンドボックス・スマホ幅・性能値を確認する
import { open } from './shot.mjs';
const { browser, page, errors } = await open();
const log = (...a) => console.log(...a);
const click = async (sel) => { await page.click(sel); await page.waitForTimeout(250); };
await click('[data-act="menu"]'); await click('[data-act="new"][data-arg="short"]'); await click('[data-act="new"][data-arg="short"]');
log('short term length', await page.evaluate(() => window.__sumu.game.state.termLength));
await click('[data-act="tutskip"]');
let shotEvent = false, n = 0;
for (let guard = 0; guard < 200; guard++) {
  const r = await page.evaluate(() => { const g = window.__sumu.game; g.speed = 3; const t0 = performance.now(); const k = g.tick(1.0); return { k, ms: performance.now() - t0, month: g.state.month, ev: g.state.events.active.map(e => e.id), el: !!g.state.pendingElection }; });
  n += r.k;
  if (r.ev.length) {
    await page.waitForTimeout(400);
    if (!shotEvent) { await page.screenshot({ path: 'shots/20-event.png' }); shotEvent = true; }
    const before = await page.evaluate(() => Math.round(window.__sumu.game.state.cash));
    const label = await page.textContent('#modal .opt:not([disabled]) b'); await page.click('#modal .opt:not([disabled])'); await page.waitForTimeout(200);
    log(` m${r.month} event ${r.ev[0]} → ${label} (cash ${before} → ${await page.evaluate(() => Math.round(window.__sumu.game.state.cash))})`);
  }
  if (r.el) break;
}
await page.waitForTimeout(600);
await page.screenshot({ path: 'shots/21-election.png' });
log('election', JSON.stringify(await page.evaluate(() => { const e = window.__sumu.game.state.elections[0]; return { vote: e.vote.toFixed(1), win: e.win, kept: e.pledgesKept, month: e.month, mode: window.__sumu.game.state.mode }; })));
await click('[data-act="election"]');
const mode = await page.evaluate(() => window.__sumu.game.state.mode);
log('mode after', mode, 'sandbox tool', await page.$$eval('.tool.sandbox', e => e.length));
if (mode === 'sandbox') {
  await page.evaluate(() => { const v = window.__sumu.view; Object.assign(v.want, { x: 9 * 30, z: 9 * 30, dist: 420, yaw: 0, pitch: 1.2 }); }); await page.waitForTimeout(2500);
  await click('[data-arg="sandbox"]'); await click('[data-arg="sandbox:house"]');
  const p = await page.evaluate(() => { const v = window.__sumu.view; const q = v.project(8.5 * 30, 0.3, 8.5 * 30); const r = v.renderer.domElement.getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; });
  await page.mouse.click(p[0], p[1]); await page.waitForTimeout(400);
  log('sandbox place →', await page.evaluate(() => [...document.querySelectorAll('#toast div')].map(d => d.textContent).join(' | ')));
  await page.keyboard.press('Escape');
}
// 月を進められること
log('continues:', await page.evaluate(() => { const g = window.__sumu.game; const m = g.state.month; g.speed = 3; g.tick(1.0); g.speed = 0; const r = [m, g.state.month]; for (const e of [...g.state.events.active]) window.__sumu.ui.act({ type: 'event', id: e.id, option: 0 }); return r; }));
// 性能値
const perf = await page.evaluate(() => { const { game, view } = window.__sumu; const s = structuredClone(game.state); const t = []; for (let i = 0; i < 12; i++) { const a = performance.now(); window.__sumu.game.tick; t.push(a); } return { stats: view.stats, dpr: window.devicePixelRatio, size: [innerWidth, innerHeight], gl: (() => { const gl = view.renderer.getContext(); const e = gl.getExtension('WEBGL_debug_renderer_info'); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })() }; });
log('perf', JSON.stringify(perf));
// 地上視点とフォトモードの切替、撮影
await click('[data-act="cam"][data-arg="ground"]'); await page.keyboard.down('w'); await page.waitForTimeout(1500); await page.keyboard.up('w');
log('ground mode', await page.evaluate(() => window.__sumu.view.mode));
await click('[data-act="cam"][data-arg="photo"]'); await click('[data-act="shoot"]');
log('photo captured bytes', await page.evaluate(() => window.__sumu.ui.shot.length));
await click('[data-act="shotclose"]'); await click('[data-act="photoend"]'); await page.keyboard.press('Escape');
// スマホ幅
await page.setViewportSize({ width: 400, height: 800 }); await page.waitForTimeout(1500);
log('phone overflow x:', await page.evaluate(() => document.documentElement.scrollWidth > innerWidth || document.body.scrollWidth > innerWidth));
await page.screenshot({ path: 'shots/22-phone.png' });
log('errors', JSON.stringify(errors.filter(e => !e.includes('TUNNEL'))));
await browser.close();
