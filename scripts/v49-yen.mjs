// v49：上の欄の金額が億・兆で出るか（市の資金と毎月の収支）。地面の鳩も撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(400000); await page.waitForTimeout(1500);
const out = [];
for (const v of [6059, 153390, 123456789, 2.5e8 + 34560000]) { out.push(await page.evaluate(v => { const S = window.__sumu; S.game.state.cash = v; S.game.state.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; return [...document.querySelectorAll('#chips > *, .chip')].slice(0, 4).map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | '); }, v)); }
await page.evaluate(() => { const S = window.__sumu, s = S.game.state, st = s.buildings.find(b => b.kind === 'parkM' || b.kind === 'park'); S.view.clockRun = false; S.view.hour = 11; S.view.focus((st.y + (st.h >> 1)) * S.W + st.x + (st.w >> 1), 45); });
await page.waitForTimeout(5000); await page.screenshot({ path: 'shots/v49-yen.png' });
for (const o of out) console.log(o); console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
