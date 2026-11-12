// 水面を通る道路が橋として描かれるか（大河・湖の地形）
import { open } from './shot.mjs';
const [tx, ty, tag] = [Number(process.env.TX), Number(process.env.TY), process.env.TAG];
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(200000); await page.waitForTimeout(2000);
await page.evaluate(([tx, ty]) => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed'); S.fixedQuality = true; S.view.setQuality('high'); S.view.clockRun = false; S.view.hour = 11; S.view.focus(ty * 76 + tx, 240); }, [tx, ty]);
await page.waitForTimeout(3500); await page.screenshot({ path: `shots/v45-${tag}.png` });
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
