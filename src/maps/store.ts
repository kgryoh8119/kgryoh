// 地図データの入手：同梱の地図（maps/<id>.json）を読む／取り込んだ地図をこのブラウザ（IndexedDB）に残す。
// ブラウザの保存領域が使えない環境（プライベートウィンドウなど）では、その場かぎりで遊べる。

const DB = 'sumucity-maps', STORE = 'maps';
export interface StoredMap { id: string; name: string; area: string; map: any; importedAt: string }

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore(STORE, { keyPath: 'id' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch (e) { rej(e); }
  });
}
async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const r = f(db.transaction(STORE, mode).objectStore(STORE)); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
export async function listStored(): Promise<{ id: string; name: string; area: string; importedAt: string }[]> {
  try { const all = await tx('readonly', s => s.getAll()) as StoredMap[]; return all.map(m => ({ id: m.id, name: m.name, area: m.area, importedAt: m.importedAt })); } catch { return []; }
}
export async function getStored(id: string): Promise<StoredMap | null> {
  try { return ((await tx('readonly', s => s.get(id))) as StoredMap) ?? null; } catch { return null; }
}
export async function putStored(m: StoredMap): Promise<boolean> {
  try { await tx('readwrite', s => s.put(m)); return true; } catch { return false; }
}
export async function deleteStored(id: string): Promise<void> {
  try { await tx('readwrite', s => s.delete(id)); } catch { /* 消せなくても遊ぶのには困らない */ }
}

/** その地図がページに埋め込まれているか（単体ファイル版・公開版）。v81：追加の実在マップも、埋め込んであれば取り込みなしで遊べる */
export const embedded = (id: string): boolean => typeof document !== 'undefined' && !!document.getElementById('sumu-map-' + id);
/** 同梱の地図を読む（ページと同じ場所の maps/<id>.json）。読めなければ null */
export async function fetchBundled(id: string): Promise<any | null> {
  // 単体ファイル版：ページに埋め込んだ地図を先に探す（ファイルを直接開くと fetch できないため）
  const emb = document.getElementById('sumu-map-' + id);
  if (emb?.textContent) { try { const m = JSON.parse(emb.textContent); if (m && m.format === 'sumucity-realmap') return m; } catch { /* 壊れていれば読みに行く */ } }
  try {
    const r = await fetch(`maps/${id}.json`);
    if (!r.ok) return null;
    const m = await r.json();
    return m && m.format === 'sumucity-realmap' ? m : null;
  } catch { return null; }
}

/** 地図のデータを用意する：同梱 → このブラウザに取り込み済み の順。ID の末尾が -d ならまちづくり版をその場で作る。
 *  架空の街は null、見つからなければ undefined */
export async function loadMap(id: string): Promise<any | null | undefined> {
  const { mapEntry } = await import('./registry');
  if (/-d$/.test(id)) {
    const base = await loadMap(id.replace(/-d$/, ''));
    if (!base) return undefined;
    const { deformMap } = await import('../mapgen/deform');
    try { return deformMap(base, { id }).map; } catch { return undefined; }
  }
  const e = mapEntry(id);
  if (e?.kind === 'builtin') return null;
  if (e?.kind === 'bundled' || embedded(id)) { const m = await fetchBundled(id); if (m) return m; }
  const s = await getStored(id); if (s) return s.map;
  if (e?.kind === 'collect') { const m = await fetchBundled(id); if (m) return m; } // 自前のサーバーに置いた版：maps/<id>.json を読みに行く
  return undefined;
}
