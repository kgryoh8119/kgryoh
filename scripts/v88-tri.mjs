// v88：線路（roads のメッシュ。道路を含む）と列車の面数・描画回数を品質ごとに数える。DIST で比べる版を選ぶ
import { open } from './shot.mjs';
const { browser, page, errors } = await open(480, 300, process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(2400000); await page.waitForTimeout(1500);
const out = {};
for (const q of (process.env.QS ?? 'high,mid,low').split(',')) {
  await page.evaluate((q) => { const S = window.__sumu, v = S.view, s = S.game.state; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; S.game.speed = 0; v.setQuality(q); s.roadVersion++; v.hour = 10; v.focus((s.buildings.find(b => b.kind === 'station')?.y ?? 20) * S.W + 20, 320); }, q);
  await page.waitForTimeout(8000);
  out[q] = await page.evaluate(() => { const v = window.__sumu.view; let tris = 0; for (const m of v.groups.roads) { const g = m.geometry; tris += (g.index ? g.index.count : g.attributes.position.count) / 3; }
    let trainTris = 0, trainDraws = 0; v.scene.traverse(o => { if (o.isInstancedMesh && o.visible && o.count > 0 && o.geometry.attributes.position.count > 200 && (o.parent === v.scene)) { const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3; if (v.tIM ? Object.values(v.tIM).includes(o) : [v.trainCars, v.trainMid, v.trainPan, v.trainEnd, v.trainExp, v.trainLoco].includes(o)) { trainTris += n * o.count; trainDraws++; } } });
    return { roadTris: tris, trainTris, trainDraws, trains: v.trains.length, frameTris: v.stats.tris, calls: v.stats.calls }; });
}
console.log(JSON.stringify(out), errors.filter(e => !e.includes('TUNNEL')).slice(0, 3));
await browser.close();
