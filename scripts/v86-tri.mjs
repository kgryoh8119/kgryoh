// v86：道路・線路の面数（roads のメッシュの三角形の数）と、画面全体の描画回数・面数を品質ごとに数える（小さな画面で）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(480, 300, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(2400000); await page.waitForTimeout(1500);
const out = {};
for (const q of ['high', 'mid', 'low']) {
  await page.evaluate((q) => { const S = window.__sumu, v = S.view, s = S.game.state; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; S.game.speed = 0; v.setQuality(q); s.roadVersion++; v.focus((s.buildings.find(b => b.kind === 'station')?.y ?? 20) * S.W + 20, 320); }, q);
  await page.waitForTimeout(8000);
  out[q] = await page.evaluate(() => { const v = window.__sumu.view; let tris = 0, meshes = 0; for (const m of v.groups.roads) { const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; meshes++; } return { roadTris: tris, roadMeshes: meshes, frameTris: v.stats.tris, calls: v.stats.calls, fps: v.stats.fps }; });
}
console.log(JSON.stringify(out), errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
