// まちづくり版の線路の操作：新しい線を敷く（まっすぐ）、端から直角に曲げようとすると断られる、ゆるやかに続ける、高架にする
process.env.MAPID = process.env.MAPID || 'hodogaya-d';
const { open } = await import('./shot.mjs');
const { browser, page, errors } = await open(1440, 900);
const log = (...a) => console.log(...a);
await page.evaluate(() => { window.__sumu.fixedQuality = true; document.querySelector('#tutorial').style.display = 'none'; window.__sumu.game.state.cash = 5e6; window.__sumu.game.changed(); });
const W = await page.evaluate(() => window.__sumu.W);
// 線路・建物・道路のない 12×8 の空き地
const spot = await page.evaluate(W => {
  const s = window.__sumu.game.state, H = s.road.length / W;
  for (let y = 2; y < H - 10; y++) for (let x = 2; x < W - 14; x++) { let ok = true; for (let dy = 0; dy < 8 && ok; dy++) for (let dx = 0; dx < 12 && ok; dx++) { const i = (y + dy) * W + x + dx; if (s.rail[i] || s.road[i] === 3 || s.occ[i]) ok = false; } if (ok) return [x, y]; }
  return null;
}, W);
log('spot', spot);
const T = (x, y) => y * W + x;
const scr = i => page.evaluate(i => { const p = window.__sumu.view.tileToScreen(i); return [p.x, p.y]; }, i);
await page.evaluate(([x, y, W]) => Object.assign(window.__sumu.view.want, { x: (x + 6) * 30, z: (y + 4) * 30, dist: 420, pitch: 1.15 }), [...spot, W]); await page.waitForTimeout(2500);
const drag = async (a, b, keep = true) => { const p = await scr(a), q = await scr(b); await page.mouse.move(p[0], p[1]); await page.mouse.down(); await page.mouse.move(q[0], q[1], { steps: 8 }); await page.waitForTimeout(300); const h = await page.textContent('#hint'); if (keep) await page.mouse.up(); else { await page.mouse.up({ button: 'left' }); } await page.waitForTimeout(400); return h; };
await page.click('.tool[data-arg="road"]'); await page.click('[data-arg="rail:1:0"]');
const [x, y] = spot;
log('lay', await drag(T(x, y + 2), T(x + 5, y + 2)));
log('toast', (await page.textContent('#toast')).slice(-70));
await page.click('.tool[data-arg="road"]'); await page.click('[data-arg="rail:1:0"]');
log('right angle', await drag(T(x + 6, y + 3), T(x + 6, y + 7)));
log('toast', (await page.textContent('#toast')).slice(-70));
await page.click('.tool[data-arg="road"]'); await page.click('[data-arg="rail:1:0"]');
log('gentle', await drag(T(x + 5, y + 2), T(x + 11, y + 5)));
log('toast', (await page.textContent('#toast')).slice(-70));
await page.click('.tool[data-arg="road"]'); await page.click('[data-arg="railgrade:1"]');
log('elevate', await drag(T(x + 1, y + 2), T(x + 4, y + 2)));
log('toast', (await page.textContent('#toast')).slice(-70));
await page.keyboard.press('Escape'); await page.waitForTimeout(1500);
await page.evaluate(([x, y, W]) => Object.assign(window.__sumu.view.want, { x: (x + 6) * 30, z: (y + 4) * 30, dist: 260, pitch: 0.75 }), [...spot, W]); await page.waitForTimeout(2500);
await page.screenshot({ path: 'shots/rail-laid.png' });
const st = await page.evaluate(([x, y, W]) => { const s = window.__sumu.game.state; const r = []; for (let dy = 0; dy < 8; dy++) { let t = ''; for (let dx = 0; dx < 12; dx++) { const i = (y + dy) * W + x + dx; t += s.rail[i] ? String(s.railGrade[i]) : '.'; } r.push(t); } return r; }, [...spot, W]);
log(st.join('\n'));
log('errors', JSON.stringify(errors.filter(e => !e.includes('404') && !e.includes('TUNNEL'))));
await browser.close();
