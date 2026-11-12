// v26：標高・津波ハザードの色分けと、津波の演出
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
await page.evaluate(() => { const S = window.__sumu, g = S.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; S.ui.refresh(); S.view.focus(40 * 76 + 38, 2300); });
await page.waitForTimeout(1500);
for (const L of ['elev', 'tsunami']) { await page.evaluate(l => { const v = window.__sumu.view; v.layer = l; v.refreshOverlay(); window.__sumu.ui.renderViewbar(); }, L); await page.waitForTimeout(1200); await page.screenshot({ path: `shots/v26-${L}.png` }); }
await page.evaluate(() => { const S = window.__sumu, v = S.view; v.layer = 'none'; v.refreshOverlay(); S.ui.renderViewbar(); S.view.tsunamiFx(S.game.state, 12); S.view.focus(55 * 76 + 38, 1500); });
await page.waitForTimeout(9000); await page.screenshot({ path: 'shots/v26-wave.png' });
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
