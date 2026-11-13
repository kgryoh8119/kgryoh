// タイトル画面：地図を選ぶ。同梱の地図、このブラウザに取り込んだ地図、保存ファイルからの再開を扱う。
import { MAPS, mapEntry, saveMapId, TERRAINS, type MapEntry } from '../sim/index';
import { loadCareer, terrainOpen, takeRun } from '../career';
import { saveKey } from '../game';
import { listStored, putStored, loadMap, embedded } from '../maps/store';
import { importCollected, isCollected } from '../mapgen/importer';

export interface Choice { id: string; raw: any | null; save?: string; terrain?: string; contest?: number }
/** 今週の大会：週の番号と、その週の地形（同じ週はみんな同じ地図・同じ条件） */
export const contestWeek = () => Math.floor((Date.now() / 86400000 + 3) / 7);
export const contestTerrain = (w: number) => TERRAINS[w % 8]; // v88：無人島（特別シナリオ）は大会に出さない

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const hasSave = (id: string) => { try { return !!localStorage.getItem(saveKey(id)); } catch { return false; } };
const km = (b?: MapEntry['bbox']) => b ? `東西 ${((b.e - b.w) * 111.32 * Math.cos(((b.s + b.n) / 2) * Math.PI / 180)).toFixed(1)}km × 南北 ${((b.n - b.s) * 111.32).toFixed(1)}km` : '76 × 68 区画（東西 2.3km × 南北 2.0km）';
const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(r.error); r.readAsText(f); });

export function chooseMap(): Promise<Choice> {
  return new Promise(resolve => {
    const app = document.getElementById('app')!;
    const el = document.createElement('div'); el.id = 'title'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'スムシティ 地図を選ぶ');
    app.appendChild(el);
    document.getElementById('loading')?.setAttribute('hidden', '');
    let stored: { id: string; name: string; area: string; importedAt: string }[] = [];
    let msg = '', busy = false, help = '', pick = '';
    const career = loadCareer(), run = takeRun();
    if (run) pick = 'sumino';

    const card = (e: MapEntry | null, s?: typeof stored[number]) => {
      const id = e?.id ?? s!.id, have = e?.kind !== 'collect' || stored.some(x => x.id === id) || embedded(id), save = hasSave(id), real = e?.kind !== 'builtin', saveD = real && hasSave(id + '-d');
      const name = e?.name ?? s!.name, area = e?.area ?? s!.area;
      const status = e?.kind === 'builtin' ? '架空の街' : e?.kind === 'bundled' ? '実在の地図・同梱' : have ? '実在の地図・このブラウザに取り込み済み' : '実在の地図・データを取り込むと遊べます';
      const badge = e?.kind === 'builtin' ? '' : e?.tier === 'plus' ? '<span class="mbadge plus">追加マップ</span>' : e ? '<span class="mbadge">無料</span>' : '';
      return `<article class="mcard ${have ? "" : "nodata"} ${have && real ? "mfeat" : ""}">
        <header><small>${esc(area)}</small><h3>${esc(name)}${badge}</h3></header>
        <p>${esc(e?.blurb ?? '取り込んだ地図')}</p>
        <p class="meta">${km(e?.bbox)}・${esc(status)}${e?.role ? `・あなたは${esc(e.role)}` : ''}</p>
        ${have && real ? `<div class="btnrow"><button class="btn primary" data-t="start" data-id="${id}-d" ${busy ? 'disabled' : ''} title="駅・線路・川・幹線道路の配置はそのままに、ゲーム用に縮めて整理した街。空き地が多く、道路や施設を置きやすい">まちづくり版ではじめる</button>${saveD ? `<button class="btn" data-t="cont" data-id="${id}-d" ${busy ? 'disabled' : ''}>続きから</button>` : ''}</div>
        <p class="note">まちづくり版：実在の配置を 1/3 ほどに縮めて、細い道や家並みを整理した街です。空き地が多く、道路や施設を置きやすく、動きも軽くなります。</p>` : ''}
        <div class="btnrow">${have ? `<button class="btn ${real ? '' : 'primary'}" data-t="start" data-id="${id}" ${busy ? 'disabled' : ''}>${real ? '実寸版ではじめる' : 'はじめる'}</button>${save ? `<button class="btn" data-t="cont" data-id="${id}" ${busy ? 'disabled' : ''}>続きから${real ? '（実寸版）' : ''}</button>` : ''}` : ''}
          ${e?.kind === 'collect' || s ? `<label class="btn ${have ? 'small' : 'primary'}" ${busy ? 'aria-disabled="true"' : ''}>${have ? '取り込み直す' : 'データを取り込む'}<input type="file" accept=".json,application/json" data-t="import" data-id="${id}" hidden ${busy ? 'disabled' : ''}></label>${have ? '' : `<button class="btn small" data-t="help" data-id="${id}">集め方</button>`}` : ''}</div>
        ${help === id ? `<p class="note">収集ツール <b>collect-map.html</b> をパソコンのブラウザで開き、地域「${esc(area)}」を選んで「集める」を押すと <b>${id}-data.json</b> ができます。それをここで取り込みます（数秒かかります）。データは OpenStreetMap と国土地理院から、あなたのブラウザが直接取得します。</p>` : ''}
      </article>`;
    };
    const render = () => {
      const customs = stored.filter(s => !mapEntry(s.id));
      el.innerHTML = `<div class="tin">
        <header class="tlogo"><h1>スムシティ</h1><p>日本の街の首長になって、保育・交通・水道・財政をやりくりする街づくり</p></header>
        ${msg ? `<p class="tmsg" role="status">${msg}</p>` : ''}
        ${pick ? `<section class="tpick"><h2>${run ? `🗳 ${esc(run.from)}の市長から、新しい街へ立候補` : '地形を選ぶ（架空の街）'}</h2>
          <p class="note">市長の経歴：最高 Lv${career.lv}・これまでの街 ${career.cities.length}${run ? `・経験を活かして、市長ポイント ${run.carry} から始まります` : ''}。経歴のレベルが上がると、選べる地形が増えます。</p>
          <div class="tgrid">${TERRAINS.map(t => { const open = terrainOpen(career, t.id); return `<button class="tcard ${open ? '' : 'lock'}" data-t="terrain" data-id="${pick}" data-tr="${t.id}" ${open && !busy ? '' : 'disabled'}><b>${open ? '' : '🔒 '}${t.name}</b><small>${t.desc}</small><em>${open ? `${t.city}の市長として始める` : `市長の経歴 Lv${t.lv} で選べます`}</em></button>`; }).join('')}</div>
          ${run ? '' : `<div class="contest"><b>🏁 今週の大会</b><small>${contestTerrain(contestWeek()).name}（${contestTerrain(contestWeek()).city}）・みんな同じ地図、同じ条件。10 年でどこまで育てられるか。成績はこのページを共有した人どうしで比べます。</small><button class="btn primary" data-t="contest" data-id="${pick}" ${busy ? 'disabled' : ''}>大会に出る</button></div><div class="btnrow"><button class="btn" data-t="pickclose">地図の一覧に戻る</button></div>`}</section>` : ''}
        ${career.cities.length ? `<details class="tcareer"><summary>市長の経歴（${career.cities.length} の街）</summary><table class="t">${career.cities.slice().reverse().map(c => `<tr><td>${esc(c.name)}</td><td>${esc(c.terrain)}</td><td>${c.years} 年目</td><td>人口 ${c.pop.toLocaleString()}</td><td>Lv${c.lv}</td><td>${c.rank ? `全国 ${c.rank} 位` : ''}</td></tr>`).join('')}</table></details>` : ''}
        ${(() => { // v75：実在の街を主役に。すぐ遊べる実在の街 → 架空の街 → データを取り込むと遊べる街 の順
          const got = (e: { id: string }) => stored.some(x => x.id === e.id) || embedded(e.id), haveReal = MAPS.filter(e => e.kind === 'bundled' || (e.kind === 'collect' && got(e))), need = MAPS.filter(e => e.kind === 'collect' && !got(e)), fict = MAPS.filter(e => e.kind === 'builtin');
          return `<section class="thero"><h2>実在の街で、市長になる</h2>
            <p class="hsub">駅・線路・川・道路は本物の配置です。知っている街の保育・渋滞・水道・財政を、あなたの手で立て直してください。</p>
            <div class="mgrid mreal">${haveReal.map(e => card(e)).join('')}${customs.map(s => card(null, s)).join('')}</div></section>
          <h2>架空の街ではじめる <small>はじめての方はこちら（チュートリアルつき・地形を選べます）</small></h2>
          <div class="mgrid">${fict.map(e => card(e)).join('')}</div>
          ${need.length ? `<details class="tmore" ${help ? 'open' : ''}><summary>追加の実在マップ（${need.length} 件：${need.map(e => esc(e.name)).join('・')}）<small>いまは地図データを取り込むと遊べます</small></summary><div class="mgrid">${need.map(e => card(e)).join('')}</div></details>` : ''}`; })()}
        <div class="btnrow tfoot">
          <label class="btn">保存ファイルから再開<input type="file" accept=".json,application/json,text/plain" data-t="savefile" hidden></label>
          <label class="btn">ほかの地域の地図を取り込む<input type="file" accept=".json,application/json" data-t="import" data-id="" hidden></label>
        </div>
        <p class="note tcredit">実在の地図：© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors（ODbL）・標高 国土地理院。世帯数・施設の定員・予算などはゲームの推計です。</p>
      </div>`;
    };
    const done = (c: Choice) => { el.remove(); resolve(c); };
    /** 地図のデータを用意する（同梱 → 取り込み済み の順） */
    const loadRaw = loadMap;
    const go = async (id: string, save?: string) => {
      busy = true; msg = '地図を読み込んでいます…'; render();
      const raw = await loadRaw(id);
      if (raw === undefined) {
        busy = false;
        msg = `「${esc(mapEntry(id.replace(/-d$/, ''))?.name ?? id)}」の地図データを読めませんでした。${mapEntry(id)?.kind === 'bundled' ? 'このページを単体のファイルとして開いている場合は、同じフォルダの maps/' + id + '.json を「データを取り込む」で選んでください。' : ''}`;
        if (mapEntry(id)?.kind === 'bundled') { const e = mapEntry(id)!; (e as any).kind = 'collect'; }
        render(); return;
      }
      done({ id, raw, save });
    };
    const doImport = async (file: File, cardId: string) => {
      busy = true; msg = '取り込んでいます…（大きな地図では 10 秒ほどかかります）'; render();
      await new Promise(r => setTimeout(r, 50));
      try {
        const src = JSON.parse(await readFile(file));
        let map: any, lines: string[] = [];
        if (src && src.format === 'sumucity-realmap' && src.version === 2 && src.W) map = src; // 変換済みの地図
        else if (isCollected(src) || (src && src.format === 'sumucity-realmap' && src.version !== 2)) {
          const id = cardId || (typeof src.id === 'string' && /^[a-z][a-z0-9_-]{1,23}$/.test(src.id) ? src.id : 'mymap');
          const e = mapEntry(id);
          const r = importCollected(src, { id, name: e ? `${e.area}（${e.name}）` : String(src.area ?? id).slice(0, 40), districts: e?.districts, hints: e?.hints });
          map = r.map; lines = r.report.lines;
        } else throw new Error('収集ツールで作った地図データ（〇〇-data.json）ではありません');
        const id = cardId || map.id, e = mapEntry(id);
        map.id = id;
        const ok = await putStored({ id, name: e?.name ?? String(map.name).slice(0, 30), area: e?.area ?? '取り込んだ地図', map, importedAt: new Date().toISOString() });
        stored = await listStored();
        if (!ok) { busy = false; done({ id, raw: map }); return; } // ブラウザに残せない環境では、そのまま遊ぶ
        const other = cardId && src.id && src.id !== cardId ? `（データの範囲は「${esc(String(src.area ?? src.id))}」でした）` : '';
        msg = `「${esc(e?.name ?? map.name)}」を取り込みました${other}。${lines.length ? '<small>' + lines.map(esc).join('<br>') + '</small>' : ''}`;
      } catch (err) { msg = `取り込めませんでした：${esc((err as Error).message)}`; }
      busy = false; render();
    };

    el.addEventListener('click', ev => {
      const b = (ev.target as HTMLElement).closest('button[data-t]') as HTMLElement | null;
      if (!b || busy) return;
      const id = b.dataset.id!;
      if (b.dataset.t === 'start' && mapEntry(id)?.kind === 'builtin') { pick = id; render(); return; }
      if (b.dataset.t === 'contest') { const w = contestWeek(); busy = true; msg = '大会の街を準備しています…'; render(); loadRaw(id).then(raw => done({ id, raw: raw ?? null, terrain: contestTerrain(w).id, contest: w })); return; }
      if (b.dataset.t === 'terrain') { const t = b.dataset.tr!; busy = true; msg = '街を準備しています…'; render(); loadRaw(id).then(raw => done({ id, raw: raw ?? null, terrain: t })); return; }
      if (b.dataset.t === 'pickclose') { pick = ''; render(); return; }
      if (b.dataset.t === 'start') go(id);
      else if (b.dataset.t === 'cont') { let t: string | null = null; try { t = localStorage.getItem(saveKey(id)); } catch { /* 読めない */ } go(id, t ?? undefined); }
      else if (b.dataset.t === 'help') { help = help === id ? '' : id; render(); }
    });
    el.addEventListener('change', async ev => {
      const inp = ev.target as HTMLInputElement, f = inp.files?.[0];
      if (!f || busy) return;
      if (inp.dataset.t === 'import') doImport(f, inp.dataset.id ?? '');
      else if (inp.dataset.t === 'savefile') {
        const text = await readFile(f), id = saveMapId(text);
        if (!id) { msg = 'スムシティの保存データとして読めませんでした'; render(); return; }
        go(id, text);
      }
    });
    listStored().then(s => { stored = s; render(); });
    render();
  });
}
