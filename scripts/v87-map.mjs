// v87：広げた住野市の全景と、縮尺の分かる近景（OUT=出力先のフォルダ、VIEWS=撮る番号、NAME=出力名の頭）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, process.env.MAP ?? 'sumino');
page.setDefaultTimeout(900000); await page.waitForTimeout(1500);
const t = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state, v = S.view; s.tutorial.done = true; s.goalPick = false; S.fixedQuality = true; v.setQuality('high');
  const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('app').classList.add('photo'); v.clockRun = false; v.weatherForce = 'clear'; v.hour = 10.5; S.ui.refresh();
  const st = s.buildings.find(b => b.kind === 'station'); return { st: (st.y + 5) * S.W + st.x + 2, mid: Math.floor(s.road.length / S.W / 2) * S.W + Math.floor(S.W / 2), W: S.W, H: s.road.length / S.W }; });
await page.waitForTimeout(7000);
// [中心, 距離, 見下ろす角, 向き]
const V = [[t.mid, 4300, 1.05, 0], [t.st + 3 * t.W, 26, 0.2, 2.2], [t.st, 60, 0.45, 0.6]], out = process.env.OUT ?? 'shots';
for (const k of (process.env.VIEWS ?? '0,1').split(',').map(Number)) { const [c, d, p, yaw] = V[k];
  await page.evaluate(([c, d, p, yaw]) => { const v = window.__sumu.view; v.focus(c, d); v.pitch = v.want.pitch = p; v.yaw = v.want.yaw = yaw; v.dist = v.want.dist = d; }, [c, d, p, yaw]);
  await page.waitForTimeout(4000); await page.screenshot({ path: `${out}/${process.env.NAME ?? 'v87'}-${k}.png` }); }
console.log(JSON.stringify(t), errors.filter(e => !e.includes('TUNNEL')).slice(0, 5)); await browser.close();
