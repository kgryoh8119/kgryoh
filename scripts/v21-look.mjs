// v21 の施設・地形の見た目（人口の条件を満たしたことにして置く）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
const kinds = 'usBase,oilRefinery,oilField,gasStation,parkingTower,ancientRuins'.split(',');
const placed = await page.evaluate((kinds) => {
  const g = window.__sumu.game, S = window.__sumu;
  g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; g.state.cash = 1e8; g.state.fame = 60;
  const out = {};
  for (const k of kinds) {
    let best = null;
    for (let y = 3; y < 64 && !best; y++) for (let x = 3; x < 72; x++) { g.state.stats.pop = 60000; const r = g.act({ type: 'build', kind: k, x, y }); if (r.ok) { best = [x, y]; break; } }
    out[k] = best;
  }
  // タワーマンション：駅のそばの空き区画に直接置く
  const st = g.state.buildings.find(b => b.kind === 'station'); const mode = g.state.mode; g.state.mode = 'sandbox'; let nt = 0;
  if (st) for (let r = 1; r < 8 && nt < 4; r++) for (let dy = -r; dy <= r && nt < 4; dy++) for (let dx = -r; dx <= r && nt < 4; dx++) { const x = st.x + dx, y = st.y + dy; if (g.act({ type: 'sandboxPlace', kind: 'towerMansion', x, y }).ok) { nt++; if (!out.towerMansion) out.towerMansion = [x - 1, y - 1]; } }
  g.state.mode = mode;
  // 砂漠と雪原（空き地を 5×5 ずつ）
  const terra = (op, x0) => { for (let y = 20; y < 60; y++) for (let x = x0; x < 70; x++) { const t = []; for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) t.push((y + dy) * 76 + x + dx); const r = g.act({ type: 'terra', tiles: t, op }); if (r.ok && !r.msg.includes('対象外')) return [x, y]; if (r.ok) return [x, y]; } return null; };
  out.desert = terra('desert', 40); out.snow = terra('snow', 56);
  for (const b of g.state.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; b.staff = b.staffTarget ?? 0; }
  g.state.bVersion++; g.changed && g.changed(); S.ui.refresh();
  return out;
}, kinds);
console.log(JSON.stringify(placed));
await page.waitForTimeout(800);
const shots = (process.env.SHOTS ?? 'usBase:620,oilRefinery:520,oilField:260,gasStation:180,parkingTower:260,ancientRuins:420,towerMansion:520,desert:420,snow:420').split(',').map(t => [t.split(':')[0], Number(t.split(':')[1])]);
for (const [k, d] of shots) {
  const p = placed[k === 'tanker' ? 'oilRefinery' : k]; if (!p) continue;
  await page.evaluate(([x, y, d]) => { window.__sumu.view.focus(y * 76 + x, d); }, [p[0] + 2, k === 'tanker' ? 66 : p[1] + 2, d]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/v21-${k}.png` });
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
