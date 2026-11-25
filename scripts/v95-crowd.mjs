// v95：施設の人だかりを撮る。学校を定員の OVER 倍（既定 1.5）に書き換え、休み時間・授業中・登校を撮る。保育園は待機児童、病院は混雑
// NAME=出力名の頭、VIEWS=撮る番号（0 学校の休み時間・1 学校の授業中・2 学校の登校・3 保育園の朝・4 病院）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(+(process.env.VW ?? 960), +(process.env.VH ?? 600), process.env.MAPID ?? 'sumino');
page.setDefaultTimeout(2400000); await page.waitForTimeout(1500);
const info = await page.evaluate((over) => { const S = window.__sumu, g = S.game, s = g.state, v = S.view, W = S.W; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality('high'); g.speed = 0;
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.4; S.ui.refresh();
  const op = (k) => s.buildings.filter(b => b.status === 'operating' && k.includes(b.kind));
  const sc = op(['school'])[0], nu = op(['nursery', 'nurseryS', 'nurseryL', 'privNursery'])[0], ho = op(['hospital', 'clinic'])[0];
  if (sc) sc.used = Math.round(sc.effCap * over);
  s.stats.waitlist = Math.max(s.stats.waitlist, 120); s.stats.pop = Math.max(s.stats.pop, 1) * 1.0;
  const T = (b) => b ? (b.y + Math.floor(b.h / 2)) * W + b.x + Math.floor(b.w / 2) : undefined;
  return { sc: T(sc), scUsed: sc && [sc.used, sc.effCap], nu: T(nu), ho: T(ho) };
}, +(process.env.OVER ?? 1.5));
console.log(JSON.stringify(info));
await page.waitForTimeout(5000);
const V = [[info.sc, 10.4, 120, 0.62, 0.3], [info.sc, 11.0, 120, 0.5, 0.3], [info.sc, 8.0, 120, 0.62, 0.3], [info.nu, 8.0, 60, 0.6, 0.3], [info.ho, 10.0, 110, 0.6, 0.3]];
for (const k of (process.env.VIEWS ?? '0,1,3,4').split(',').map(Number)) { const [t, h, d, p, yaw] = V[k]; if (t === undefined) { console.log('skip', k); continue; }
  await page.evaluate(([t, h, d, p, yaw]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; }, [t, h, d, p, yaw]);
  await page.waitForTimeout(3500); await page.screenshot({ path: `shots/${process.env.NAME ?? 'v95c'}-${k}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')).slice(0, 5));
await browser.close();
