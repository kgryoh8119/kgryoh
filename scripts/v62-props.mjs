// v62：道ばたの小物（電柱・自販機・ポスト）と走るバス・トラックを近くで撮る
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(600000); await page.waitForTimeout(1500);
const r = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, W = S.W; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  s.notes = []; S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); S.view.weatherForce = 'clear'; S.view.hour = 10.5; S.view.clockRun = false;
  const out = { vend: [], post: [] };
  for (let i = 0; i < s.road.length; i++) { const t = s.road[i]; if (t !== 1 && t !== 2) continue; const x = i % W, y = (i / W) | 0; let n = 0, e = 0, ns = 0;
    for (const [dx, dy, k] of [[1, 0, 'e'], [-1, 0, 'e'], [0, 1, 'n'], [0, -1, 'n']]) { const j = (y + dy) * W + x + dx; if (s.road[j]) { n++; if (k === 'e') e++; else ns++; } }
    if (n >= 3 || !((e > 0) !== (ns > 0))) continue; const hv = ((x * 73856093) ^ (y * 19349663)) >>> 0, kind = hv % 11;
    if (kind <= 2 && out.vend.length < 3) out.vend.push(i); if (kind === 3 && out.post.length < 2) out.post.push(i); }
  return out; });
console.log(JSON.stringify(r));
let n = 0;
for (const t of [...r.vend.slice(0, 2), ...r.post.slice(0, 1)]) { await page.evaluate(([t, k]) => { const v = window.__sumu.view; v.focus(t, 16); v.pitch = 0.32; v.yaw = 0.7 + k; }, [t, n]); await page.waitForTimeout(4500); await page.screenshot({ path: `shots/v62-props${n++}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL'))); await browser.close();
