// ゲームオーバーの画面を確かめる：住宅をすべて空にして 1 か月進める
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate((t) => { const g = window.__sumu.game; g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); }, readFileSync(process.env.SAVE, 'utf8'));
const r = await page.evaluate(() => { const g = window.__sumu.game, s = g.state; for (const b of s.buildings) if (b.hh) b.hh = b.hh.map(() => 0); s.inflowFactor = 0; s.pendingElection = null; s.events.active = []; g.speed = 3; for (let i = 0; i < 40 && !s.over; i++) g.tick(1.1); window.__sumu.ui.refresh(); return { over: s.over, pop: s.stats.pop, month: s.month, speed: g.speed }; });
console.log(JSON.stringify(r));
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/gameover.png' });
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
