// UI の見直し用：主な画面をまとめて撮る（MOBILE=1 でスマホ）
import { open } from './shot.mjs';
const M = !!process.env.MOBILE, [w, h] = M ? [390, 844] : [1440, 900], P = M ? 'm' : 'd';
const { browser, page, errors } = await open(w, h);
await page.screenshot({ path: `shots/ui-${P}-00-goals.png` });
await page.evaluate(() => { const g = window.__sumu.game; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; window.__sumu.ui.refresh(); });
await page.waitForTimeout(1000);
await page.screenshot({ path: `shots/ui-${P}-01-main.png` });
for (const grp of ['road', 'zone', 'terra', 'build']) {
  const ok = await page.evaluate(g => { const b = document.querySelector(`[data-act="group"][data-arg="${g}"]`); if (b) b.click(); return !!b; }, grp);
  if (!ok) continue; await page.waitForTimeout(500); await page.screenshot({ path: `shots/ui-${P}-02-${grp}.png` });
  await page.evaluate(g => document.querySelector(`[data-act="group"][data-arg="select"]`)?.click(), grp);
}
for (const tab of ['home', 'mayor', 'term', 'voice', 'money', 'policy', 'fc', 'fac']) {
  await page.evaluate(t => window.__sumu.ui.onAct ? null : null, tab);
  await page.evaluate(t => { const b = document.querySelector(`#tabs [data-arg="${t}"]`); b?.click(); }, tab);
  await page.waitForTimeout(400); await page.screenshot({ path: `shots/ui-${P}-03-${tab}.png` });
}
await page.evaluate(() => document.querySelector('[data-act="viewtoggle"]')?.click()); await page.waitForTimeout(300); await page.screenshot({ path: `shots/ui-${P}-04-view.png` });
await page.evaluate(() => document.querySelector('[data-act="viewtoggle"]')?.click());
await page.evaluate(() => document.querySelector('[data-act="menu"]')?.click()); await page.waitForTimeout(400); await page.screenshot({ path: `shots/ui-${P}-05-menu.png` });
console.log(errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
