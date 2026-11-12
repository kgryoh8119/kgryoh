// スマホの見た目と操作の点検（390×844、タッチ）
import { open } from './shot.mjs';
const tag = process.env.TAG ?? 'a';
const { browser, page, errors } = await open(390, 844, 'sumino');
page.setDefaultTimeout(240000);
await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v44-${tag}-1start.png` });
const q = async (sel) => { const e = await page.$(sel); if (e) { try { await e.tap(); } catch { await e.click({ force: true }); } await page.waitForTimeout(700); return true; } return false; };
// 目標選び
await page.evaluate(() => { const S = window.__sumu; const s = S.game.state; if (s.goalPick !== undefined && !s.goals?.length) {} });
await page.screenshot({ path: `shots/v44-${tag}-2goal.png` });
await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; for (let i = 0; i < 18; i++) { S.stepMonth(s); s.events.active = []; } s.notes = []; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); S.ui.renderModal(); const md = document.getElementById('modal'); if (md && !md.children.length) {} });
await page.evaluate(() => { const m = document.getElementById('modal'); if (m) m.replaceChildren(); document.getElementById('modal')?.classList.add('hidden'); });
await page.waitForTimeout(1500); await page.screenshot({ path: `shots/v44-${tag}-3hud.png` });
await page.evaluate(() => { const v = window.__sumu.view, s = window.__sumu.game.state, b = s.buildings.find(b => b.kind === 'house'); if (b) v.focus(b.y * 76 + b.x, 160); }); await page.waitForTimeout(2500); await page.screenshot({ path: `shots/v44-${tag}-3map.png` });
await q('.tool[data-arg="build"]') || await q('.tool'); await page.screenshot({ path: `shots/v44-${tag}-4build.png` });
await page.evaluate(() => document.body.click()); await page.keyboard.press('Escape'); await page.waitForTimeout(400);
await q('.tool.panelbtn'); await page.screenshot({ path: `shots/v44-${tag}-5panel.png` });
await page.evaluate(() => { const b = [...document.querySelectorAll('[data-act="tab"]')].find(x => x.textContent.includes('政策')); b?.click(); }); await page.waitForTimeout(800); await page.screenshot({ path: `shots/v44-${tag}-6policy.png` });
const info = await page.evaluate(() => {
  const over = [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && (r.right > innerWidth + 2) && !e.closest('canvas'); }).slice(0, 12).map(e => (e.id || e.className || e.tagName).toString().slice(0, 40) + ' ' + Math.round(e.getBoundingClientRect().right));
  const small = [...document.querySelectorAll('button, [data-act], .tool')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 30 || r.width < 30); }).slice(0, 15).map(e => (e.getAttribute('data-act') || e.className || e.tagName).toString().slice(0, 30) + ' ' + Math.round(e.getBoundingClientRect().width) + 'x' + Math.round(e.getBoundingClientRect().height));
  return { scrollW: document.documentElement.scrollWidth, over, small, quality: window.__sumu.view.quality, lite: window.__sumu.view.lite };
});
console.log(JSON.stringify(info));
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
