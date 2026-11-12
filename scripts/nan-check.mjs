// 形のデータに NaN が無いか調べる（位置・法線）。MAP=地図、PAGE=開くページ
import { open } from './shot.mjs';
const { browser, page, errors } = await open(800, 500, process.env.MAP ?? 'sumino');
page.setDefaultTimeout(600000);
await page.evaluate(() => { const S = window.__sumu, s = S.game.state; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; S.view.setQuality('high'); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; S.ui.refresh(); });
await page.waitForTimeout(12000);
const scan = () => page.evaluate(() => { const v = window.__sumu.view, out = [], names = new Map(); for (const k of Object.keys(v)) { const o = v[k]; if (o && o.isObject3D) names.set(o, k); if (o && o.isMaterial) names.set(o, k); }
  v.scene.traverse(o => { const g = o.geometry; if (!g) return; for (const an of ['position', 'normal']) { const a = g.attributes[an]; if (!a) continue; let n = 0, first = -1; for (let i = 0; i < a.array.length; i++) if (!Number.isFinite(a.array[i])) { n++; if (first < 0) first = i; }
    let zero = 0; if (an === 'normal') for (let i = 0; i < a.count; i++) if (a.getX(i) === 0 && a.getY(i) === 0 && a.getZ(i) === 0) zero++;
    if (n || zero > a.count * 0.02) out.push(`${names.get(o) ?? names.get(o.material) ?? o.type} ${an}: NaN ${n}/${a.array.length} first@${first} zero=${zero}/${a.count} mat=${names.get(o.material)}`); } });
  return out; });
let r = await scan();
if (process.env.TERR) for (let k = 1; k < 8; k++) { await page.evaluate((k) => { const S = window.__sumu; S.game.reset({ seed: 2e9 + k * 1e6 + 261011 }); const s = S.game.state; s.tutorial.done = true; s.goalPick = false; const st = s.buildings.find(b => b.kind === 'station'); if (st) st.shin = 0; S.ui.refresh(); }, k); await page.waitForTimeout(9000); const q = await scan(); console.log('地形', k, q.join(' / ') || 'なし', errors.filter(e => /NaN/.test(e)).length); r = r.concat(q); }
if (process.env.AUTO) { await page.evaluate(() => { const g = window.__sumu.game; g.auto = true; g.speed = 3; }); for (let t = 0; t < +process.env.AUTO; t++) { await page.waitForTimeout(20000); const q = await scan(); console.log('オート', t, await page.evaluate(() => window.__sumu.game.state.month), q.join(' / ') || 'なし', errors.filter(e => /NaN/.test(e)).slice(0, 1)); r = r.concat(q); } }
console.log(r.join('\n') || 'NaN なし'); console.log(errors.slice(0, 5)); await browser.close();
