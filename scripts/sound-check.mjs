// 音のエンジンが例外なく動き、実際に音が出ているか（RMS）を確かめる
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800);
await page.evaluate(() => { const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; window.__sumu.ui.refresh(); });
await page.mouse.click(640, 400); // 音を起こす
await page.waitForTimeout(500);
await page.evaluate(() => { const S = window.__sumu.sound, c = S.ctx; const an = c.createAnalyser(); an.fftSize = 2048; S.master.connect(an); window.__an = an; });
const rms = async () => page.evaluate(() => { const a = window.__an, d = new Float32Array(a.fftSize); a.getFloatTimeDomainData(d); let s = 0; for (const v of d) s += v * v; return Math.sqrt(s / d.length).toFixed(4); });
const out = {};
for (const h of [6, 10, 17, 22]) { await page.evaluate(h => { const v = window.__sumu.view; v.hour = h; v.focus(20 * 76 + 20, 300); }, h); await page.waitForTimeout(2500); out['h' + h] = [await rms(), await page.evaluate(() => window.__sumu.sound.bgm.style), await page.evaluate(() => window.__sumu.sound.ctx.state)]; }
// お祝い（花火）・地震・選挙・操作
await page.evaluate(() => { const v = window.__sumu.view; v.hour = 21; v.celebrate('festival', 'まつり'); });
await page.waitForTimeout(4000); out.fest = [await rms(), await page.evaluate(() => window.__sumu.sound.bgm.style)];
await page.evaluate(() => { const S = window.__sumu.sound; S.quake(); S.fanfare(); S.cheer(1, 3); S.siren('ambulance', window.__sumu.view.audioInfo()); S.siren('fire', window.__sumu.view.audioInfo()); S.westminster(1); S.yuyake(); S.bonsho(1); S.tofu(); S.bird('uguisu', 1); S.crow(1); S.frog(1); S.scream(1); S.pachinko(1); S.shipHorn(1, 0); S.flyover(); S.dingdong(); S.coins(); });
await page.waitForTimeout(3000); out.sfx = await rms();
await page.evaluate(() => { const g = window.__sumu.game; g.state.cash = 1e8; for (let y = 3; y < 30; y++) for (let x = 3; x < 30; x++) if (window.__sumu.ui.act({ type: 'build', kind: 'park', x, y })) return; });
await page.waitForTimeout(1000);
out.nodes = await page.evaluate(() => Object.keys(window.__sumu.sound.loops).length);
console.log(JSON.stringify(out));
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
