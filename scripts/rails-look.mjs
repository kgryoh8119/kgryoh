// まちづくり版の線路の見た目：踏切・高架・坑口・曲線、線路の敷設（急カーブの拒否）を画面で確かめる
process.env.MAPID = process.env.MAPID || 'hodogaya-d';
const { open } = await import('./shot.mjs');
const { browser, page, errors } = await open(1440, 900);
const log = (...a) => console.log(...a);
await page.evaluate(() => { window.__sumu.fixedQuality = true; document.querySelector('#tutorial')?.remove(); document.querySelector('#side')?.classList.add('closed'); });
const info = await page.evaluate(() => {
  const s = window.__sumu.game.state, W = window.__sumu.W ?? 52;
  const R = s.rail, G = s.railGrade, out = { W, cross: [], elev: [], portal: [], curve: [] };
  for (let i = 0; i < R.length; i++) {
    if (!R[i]) continue;
    if (s.road[i] && !G[i]) out.cross.push(i);
    if (G[i] === 1 && s.road[i]) out.elev.push(i);
    if (G[i] === 2) { const x = i % W, y = i / W | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) { const j = (y + dy) * W + x + dx; if (R[j] && G[j] === 0) out.portal.push(i); } }
  }
  return out;
});
log(JSON.stringify({ cross: info.cross.length, elev: info.elev.length, portal: info.portal.length }));
const W = info.W;
const look = async (i, name, dist = 170, pitch = 0.8, yaw) => {
  await page.evaluate(([i, W, dist, pitch, yaw]) => { Object.assign(window.__sumu.view.want, { x: (i % W + 0.5) * 30, z: ((i / W | 0) + 0.5) * 30, dist, pitch }, yaw === undefined ? {} : { yaw }); }, [i, W, dist, pitch, yaw]);
  await page.waitForTimeout(2500); await page.screenshot({ path: `shots/rail-${name}.png` });
};
if (info.cross[0] !== undefined) await look(info.cross[0], 'crossing', 110, 0.7);
if (info.elev[0] !== undefined) await look(info.elev[0], 'elevated', 200, 0.6);
if (info.portal[0] !== undefined) await look(info.portal[0], 'portal', 160, 0.7);
await look(info.cross[0] ?? info.elev[0], 'overview', 900, 1.0);
log('errors', JSON.stringify(errors.filter(e => !e.includes('404'))));
await browser.close();
