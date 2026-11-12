// まちづくり版の駅（線路に付いたホーム・駅舎・乗客）と、朝の人・車（渋滞・踏切）を画面で確かめる
process.env.MAPID = process.env.MAPID || 'hodogaya-d';
const { open } = await import('./shot.mjs');
const { browser, page, errors } = await open(1280, 820);
const log = (...a) => console.log(...a);
await page.evaluate(() => { window.__sumu.fixedQuality = true; document.querySelector('#tutorial').style.display = 'none'; document.querySelector('#side')?.classList.add('closed'); window.__sumu.view.hour = 8.0; window.__sumu.ui.renderViewbar?.(); });
const sts = await page.evaluate(() => window.__sumu.game.state.buildings.filter(b => b.kind === 'station').map(b => [b.name, b.x, b.y, b.w, b.h, b.used]));
log(JSON.stringify(sts));
const look = async (x, z, name, dist, pitch) => { await page.evaluate(([x, z, dist, pitch]) => Object.assign(window.__sumu.view.want, { x, z, dist, pitch }), [x, z, dist, pitch]); await page.waitForTimeout(4000); await page.screenshot({ path: `shots/${name}.png` }); log(name, JSON.stringify(await page.evaluate(() => window.__sumu.view.stats))); };
for (const [k, st] of sts.slice(0, 3).entries()) await look((st[1] + st[3] / 2) * 30, (st[2] + st[4] / 2) * 30, `st-${k}`, 190, 0.7);
// 一番混んでいる道
const jam = await page.evaluate(() => { const s = window.__sumu.game.state; let bi = 0; for (let i = 0; i < s.vc.length; i++) if (s.road[i] && s.vc[i] > s.vc[bi]) bi = i; return [bi, s.vc[bi]]; });
const W = await page.evaluate(() => window.__sumu.W);
log('jam', jam);
await look((jam[0] % W + 0.5) * 30, ((jam[0] / W | 0) + 0.5) * 30, 'jam', 230, 0.8);
// 踏切
const cr = await page.evaluate(() => { const s = window.__sumu.game.state; return s.rail.findIndex((v, i) => v && s.road[i] && !s.railGrade[i]); });
if (cr >= 0) {
  await page.evaluate(([x, z]) => Object.assign(window.__sumu.view.want, { x, z, dist: 120, pitch: 0.7 }), [(cr % W + 0.5) * 30, ((cr / W | 0) + 0.5) * 30]);
  let shot = false;
  for (let t = 0; t < 120 && !shot; t++) { await page.waitForTimeout(500); if (await page.evaluate(c => window.__sumu.view.crossClosed.has(c), cr)) { await page.waitForTimeout(2500); await page.screenshot({ path: 'shots/crossing-closed.png' }); shot = true; log('crossing closed at', t / 2, 's'); } }
  if (!shot) log('crossing never closed');
}
log('errors', JSON.stringify(errors.filter(e => !e.includes('404') && !e.includes('TUNNEL'))));
await browser.close();
