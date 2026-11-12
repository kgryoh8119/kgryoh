// v46：モノレール・新交通・人のバリエーション・次世代の施設
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 800, 'sumino');
page.setDefaultTimeout(300000); await page.waitForTimeout(1500);
const info = await page.evaluate(() => { const S = window.__sumu, g = S.game, s = g.state; g.act({ type: 'goals', ids: ['wait', 'pop', 'fiscal'] }); s.tutorial.done = true; S.fixedQuality = true; S.view.setQuality('high');
  for (let i = 0; i < 24; i++) { S.stepMonth(s); s.events.active = []; } s.month += 70 * 12; s.fame = 100; s.cash += 1e8; s.stats.pop = 2e5;
  const rt = []; for (let i = 0; i < s.rail.length; i++) if (s.rail[i]) rt.push(i);
  const xs = rt.map(i => i % 76), mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const left = rt.filter(i => i % 76 < mid - 6), right = rt.filter(i => i % 76 > mid + 6);
  const a = g.act({ type: 'railKind', tiles: left, kind: 1 }), b = g.act({ type: 'railKind', tiles: right, kind: 2 });
  const kinds = ['hydrogenStation', 'droneHub', 'mobilityHub', 'perovskite', 'gridBattery', 'smr', 'logiTunnel', 'spaceSolar'];
  const st = s.buildings.find(b => b.kind === 'station'), placed = {};
  for (const k of kinds) { let done = false; const d = S.DEFS[k];
    for (let r = 2; r < 40 && !done; r++) for (let dy = -r; dy <= r && !done; dy++) for (let dx = -r; dx <= r && !done; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; const x = st.x + dx, y = st.y + dy; if (x < 1 || y < 2 || x + d.w > 75 || y + d.h > 66) continue; const res = g.act({ type: 'build', kind: k, x, y }); if (res.ok) { done = true; for (const b of s.buildings) if (b.kind === k && b.status === 'construction') { b.status = 'operating'; b.remain = 0; } s.bVersion++; s.stats.pop = 2e5; placed[k] = (y + Math.floor(d.h / 2)) * 76 + x + Math.floor(d.w / 2); } } }
  S.stepMonth(s); s.events.active = []; s.notes = []; if (s.mayor) { s.mayor.seenLv = 99; s.mayor.seenRank = s.mayor.ranks.at(-1)?.month ?? -1; } S.ui.refresh(); const md = document.getElementById('modal'); if (md) md.style.display = 'none'; document.getElementById('side')?.classList.add('closed');
  S.view.clockRun = false; S.view.weatherForce = 'clear';
  return { a: a.msg, b: b.msg, placed, L: left[Math.floor(left.length / 2)], R: (s.railKind ?? []).findIndex(v => v === 2), nR: (s.railKind ?? []).filter(v => v === 2).length, st: st.y * 76 + st.x + 1, miss: kinds.filter(k => !placed[k]) }; });
console.log(JSON.stringify(info));
const shots = [[11, info.R, 120, 'agt']];
for (const [h, t, d, n] of shots) { await page.evaluate(([h, t, d]) => { const v = window.__sumu.view; v.hour = h; v.focus(t, d); }, [h, t, d]); await page.waitForTimeout(5000); await page.screenshot({ path: `shots/v46-${n}.png` }); }
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
