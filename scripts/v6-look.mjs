// v6 の新しい施設の見た目を確かめる（住野市に置いて、完成した状態にする）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1440, 900);
const kinds = (process.env.KINDS ?? 'airport,port,ic,busTerminal,cityHall,branchOffice,govOffice,court,univHospital,nightClinic,university,convention,arena,mall,cinema,onsen,aquarium,zoo,golf,camp,michinoeki,farm,allotment,forestPark,riverPark,biotope').split(',');
const placed = await page.evaluate(([kinds, month]) => {
  const g = window.__sumu.game, S = window.__sumu;
  g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); g.state.tutorial.done = true; g.state.cash = 1e8; g.state.fame = 60; if (month) g.state.month = month;
  const out = {};
  for (const k of kinds) {
    let best = null;
    for (let y = 0; y < 68 && !best; y++) for (let x = 0; x < 76; x++) { const r = g.act({ type: 'build', kind: k, x, y }); if (r.ok) { best = [x, y]; break; } }
    out[k] = best;
  }
  for (const b of g.state.buildings) if (b.status === 'construction') { b.status = 'operating'; b.remain = 0; b.staff = b.staffTarget ?? 0; }
  g.state.bVersion++; g.changed && g.changed(); S.ui.refresh();
  return out;
}, [kinds, Number(process.env.MONTH ?? 0)]);
console.log(JSON.stringify(placed));
await page.waitForTimeout(800);
const shots = (process.env.SHOTS ?? 'airport:700,zoo:500,mall:500,farm:400,university:500,cityHall:400').split(',').map(t => [t.split(':')[0], Number(t.split(':')[1])]);
for (const [k, d] of shots) {
  const p = placed[k]; if (!p) continue;
  await page.evaluate(([x, y, d]) => { window.__sumu.view.focus(y * 76 + x, d); }, [p[0] + 2, p[1] + 2, d]);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `shots/${process.env.PFX ?? 'v6'}-${k}.png` });
}
console.log('errors', errors.filter(e => !e.includes('ERR_TUNNEL')));
await browser.close();
