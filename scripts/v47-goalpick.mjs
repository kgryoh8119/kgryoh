// 最初の公約の画面：挑戦モードとビジョンを選び直せるか（クリックで確かめる）
import { open } from './shot.mjs';
const { browser, page, errors } = await open(1280, 900, 'sumino');
page.setDefaultTimeout(120000); await page.waitForTimeout(2500);
const st = () => page.evaluate(() => {
  const q = (a) => [...document.querySelectorAll(`#modal [data-act="${a}"]`)];
  return { chal: q('challenge').map(b => (b.getAttribute('aria-pressed') === 'true' ? 'ON:' : '') + b.dataset.arg + (b.disabled ? '(x)' : '')).filter(x => x.includes('ON') || x.includes('(x)')),
    vis: q('gvision').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.arg),
    goals: q('gpick').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.arg), ok: !q('gok')[0]?.disabled };
});
const click = async (act, i) => { await page.evaluate(([act, i]) => { const b = [...document.querySelectorAll(`#modal [data-act="${act}"]`)][i]; b.click(); }, [act, i]); await page.waitForTimeout(300); };
const ids = await page.evaluate(() => ({ c: [...document.querySelectorAll('#modal [data-act="challenge"]')].map(b => b.dataset.arg), v: [...document.querySelectorAll('#modal [data-act="gvision"]')].map(b => b.dataset.arg), vg: Object.fromEntries((window.__sumu.VISIONS ?? []).map(v => [v.id, v.goals])) }));
console.log('challenges', ids.c.join(','), '| visions', ids.v.join(','));
const log = async (t) => console.log(t.padEnd(26), JSON.stringify(await st()));
await log('はじめ');
await click('challenge', 0); await log('挑戦 1 を選ぶ');
await click('challenge', 1); await log('挑戦 2 に選び直す');
await click('challenge', 1); await log('挑戦 2 をもう一度（取消）');
await click('challenge', 2); await log('挑戦 3 を選ぶ');
await click('gvision', 0); await log('ビジョン 1');
await click('gvision', 1); await log('ビジョン 2 に選び直す');
// 公約を 1 つ手で入れ替えてから、ビジョン 3 へ
const g = await st(); const allG = await page.evaluate(() => [...document.querySelectorAll('#modal [data-act="gpick"]')].map(b => b.dataset.arg));
await click('gpick', allG.indexOf(g.goals[0])); const other = allG.find(x => !g.goals.includes(x)); await click('gpick', allG.indexOf(other)); await log(`公約を手で入替（${other}）`);
await click('gvision', 2); await log('ビジョン 3 に選び直す');
await click('gvision', 2); await log('ビジョン 3 を取消');
await click('gvision', 1); await log('ビジョン 2');
await click('gok', 0); await page.waitForTimeout(500);
console.log('始めた後', JSON.stringify(await page.evaluate(() => { const s = window.__sumu.game.state; return { challenge: s.challenge?.id, vision: s.vision, goals: s.goals?.map(g => g.id) }; })));
console.log(errors.filter(e => !e.includes('TUNNEL')));
await browser.close();
