// 見た目の見本：歩く人を 1 つの歩道に並べて、横から撮る
import { open } from './shot.mjs';
import { readFileSync } from 'node:fs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate((t) => { const g = window.__sumu.game; g.loadText(t); g.state.tutorial.done = true; g.state.goalPick = false; window.__sumu.ui.refresh(); }, readFileSync(process.env.SAVE, 'utf8'));
await page.evaluate(() => window.__sumu.view.focus(9 * 76 + 21, 300));
await page.waitForTimeout(800);
await page.click('[data-act="cam"][data-arg="ground"]');
await page.waitForTimeout(1500);
const r = await page.evaluate(() => {
  const v = window.__sumu.view, s = window.__sumu.game.state, P = v.peds;
  // まっすぐな歩道（東西の道で、東も道路）を探す
  const W = 76; let a0 = P.find(a => a.next - a.cur === 1 && s.road[a.next + 1] && !a.lead) ?? P[0];
  const looks = [
    { shirt: 0x1f2633, pants: 0x1f2633, bits: 2, scale: 1.04, stoop: 0, amp: 1, acc: 0x1a1a1a },        // 会社員
    { shirt: 0xe86a7a, pants: 0x2a2c33, bits: 1 | 128, scale: 0.64, stoop: 0, amp: 1, acc: 0xb5372c },   // 小学生
    { shirt: 0xf2f2f2, pants: 0x23304a, bits: 8 | 1, scale: 0.95, stoop: 0, amp: 1, acc: 0x1a1a1a },     // 高校生
    { shirt: 0x3f6a4a, pants: 0x5a5048, bits: 32, scale: 1.0, stoop: 0, amp: 1, acc: 0x2c3e5c },        // ベビーカー
    { shirt: 0x8a7a6a, pants: 0x6a6a70, bits: 256, scale: 0.92, stoop: 0.28, amp: 0.6, acc: 0x2a2a2a, hair: 0xd9d6cf }, // 高齢
    { shirt: 0x4a7fa8, pants: 0xc9b8a0, bits: 64, scale: 1.0, stoop: 0, amp: 1, acc: 0x2a2a2a },        // 犬の散歩
    { shirt: 0xd9a03a, pants: 0x2a2c33, bits: 4 | 8, scale: 0.98, stoop: 0, amp: 1, acc: 0x2c3e8c },    // 傘
    { shirt: 0x5a4a3a, pants: 0x2a2c33, bits: 16, scale: 1.06, stoop: 0, amp: 1, acc: 0x1a1a1a },       // コート
    { shirt: 0xff7a2a, pants: 0x1a1a1a, bits: 0, scale: 1.0, stoop: 0, amp: 1.5, acc: 0x1a1a1a },       // ジョギング
  ];
  const n = looks.length, list = [];
  for (let i = 0; i < n; i++) { const L = { ...P[i].L, hair: 0x2a2522, width: 1, ...looks[i] }; list.push({ ...a0, L, t: 0.3 + i * 0.05, lead: undefined, side: 0, enter: undefined, exit: undefined, speed: 0, ph: 0.4 + i * 1.3, mv: 1, lane: 1, wait: false }); }
  v.peds = list; v.lookPeds(list);
  const x0 = (a0.cur % W + 0.5) * 30, z0 = (Math.floor(a0.cur / W) + 0.5) * 30, hw = [0, 2.5, 5, 7.5][s.road[a0.cur]] || 2.5;
  // 道の向こう（反対側）の歩道から見る
  v.ground.x = x0 + 30 * 0.5; v.ground.z = z0 - (hw + 1.25) - 12; v.ground.yaw = 0; v.ground.pitch = -0.05;
  return [a0.cur, x0, z0];
});
console.log(r);
await page.waitForTimeout(1500);
await page.screenshot({ path: `shots/${process.env.NAME ?? 'lineup'}.png`, clip: { x: 0, y: 200, width: 1050, height: 560 } });
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
