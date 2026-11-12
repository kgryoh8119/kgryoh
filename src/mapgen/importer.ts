// 実在都市の取り込み：収集ツール（tools/collect-map.html）で集めた OSM・標高データを、ゲーム用の地図に変換する。
// ブラウザ（タイトル画面の「地図データを取り込む」）と Node（scripts/import-map.ts）の両方で動く。依存なし。

export interface ImportOptions {
  id: string;
  name: string;
  /** 地区の代表点。なければ OSM の地名から自動で 4 つ作る */
  districts?: { name: string; lon: number; lat: number }[];
  /** OSM に名前がない浄水場の位置、ごみ処理施設の名前 */
  hints?: { water?: { name: string; lon: number; lat: number }; wasteName?: RegExp };
  log?: (msg: string) => void;
}
export interface ImportReport { lines: string[]; assumed: string[] }

const TILE = 30;
const F = { water: 1, rail: 2, forest: 4, blocked: 8, park: 16, open: 32, national: 64, fixed: 128 };
const KIND_IDX = ['house', 'apartment', 'mansion', 'bakery', 'shop', 'supermarket', 'nursery', 'privNursery', 'school', 'park', 'fire', 'water', 'waste', 'station', 'clinic', 'koban'];

function b64enc(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 0x8000)));
  return btoa(s);
}
const bytes = (a: ArrayBufferView) => new Uint8Array(a.buffer, a.byteOffset, a.byteLength);

/** 集めたデータか（形式の確認） */
export function isCollected(src: any): boolean {
  return !!src && src.format === 'sumucity-realmap' && !!src.bbox && !!src.dem && !!src.osm && Array.isArray(src.buildings);
}

export function importCollected(src: any, opt: ImportOptions): { map: any; report: ImportReport } {
  if (src && src.format === 'sumucity-realmap' && src.version !== 2 && !Array.isArray(src.buildings)) {
    const why = Array.isArray(src.errors) && src.errors.length ? `（収集時のエラー：${String(src.errors.join(' / ')).slice(0, 120)}）` : '';
    throw new Error(`このファイルには建物のデータが入っていません${why}。OpenStreetMap のサーバーが混んでいて、建物の取得だけ失敗したようです。新しい収集ツールで、この地域だけ集め直してください`);
  }
  if (!isCollected(src)) throw new Error('収集ツールで作った地図データ（〇〇-data.json）ではありません');
  if (!src.dem?.values?.length) throw new Error('標高データがありません（収集をやり直してください）');
  const report: ImportReport = { lines: [], assumed: [] };
  const say = (m: string) => { report.lines.push(m); opt.log?.(m); };
  const b = src.bbox;
  const latMid = (b.s + b.n) / 2, mLat = 111320, mLon = 111320 * Math.cos(latMid * Math.PI / 180);
  const toX = (lon: number) => (lon - b.w) * mLon, toZ = (lat: number) => (b.n - lat) * mLat;
  const dem = src.dem;
  const W = Math.floor(((dem.cols - 1) * dem.step_m) / TILE), H = Math.floor(((dem.rows - 1) * dem.step_m) / TILE);
  if (W < 40 || H < 40 || W > 260 || H > 260) throw new Error(`地図の大きさが範囲外です（${W}×${H} 区画。40〜260）`);
  const N = W * H;
  const idx = (x: number, y: number) => y * W + x, inMap = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  const tileOf = (x: number, z: number) => [Math.floor(x / TILE), Math.floor(z / TILE)];
  say(`地図 ${W}×${H} 区画（${(W * TILE / 1000).toFixed(2)}km × ${(H * TILE / 1000).toFixed(2)}km）`);

  // ---- 標高（10m 格子、デシメートルの Int16）。値のない点は海・水面（-2m）----
  const demVals = new Int16Array(dem.cols * dem.rows), seaPt = new Uint8Array(dem.cols * dem.rows);
  let seaCount = 0;
  for (let i = 0; i < demVals.length; i++) { const v = dem.values[i]; if (v == null) { seaPt[i] = 1; seaCount++; demVals[i] = -20; } else demVals[i] = Math.round(v * 10); }
  // 海と陸の境目は、陸側の値を少し下げてなだらかにする
  const seaAt = (x: number, z: number) => { const c = Math.min(dem.cols - 1, Math.max(0, Math.round(x / dem.step_m))), r = Math.min(dem.rows - 1, Math.max(0, Math.round(z / dem.step_m))); return seaPt[r * dem.cols + c]; };

  // ---- OSM 要素 ----
  const els: any[] = src.osm.elements;
  const geomXZ = (e: any): number[][] => (e.geometry || []).filter(Boolean).map((p: any) => [toX(p.lon), toZ(p.lat)]);
  const centroid = (pts: number[][]) => { let x = 0, z = 0; for (const p of pts) { x += p[0]; z += p[1]; } return [x / pts.length, z / pts.length]; };
  const closed = (pts: number[][]) => pts.length > 3 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1;

  function lineTiles(pts: number[][]): number[] {
    const out: number[] = []; let last: number[] | null = null;
    const push = (tx: number, ty: number) => {
      if (last && last[0] === tx && last[1] === ty) return;
      if (last && Math.abs(last[0] - tx) + Math.abs(last[1] - ty) === 2) { const mx = last[0], my = ty; if (inMap(mx, my)) out.push(idx(mx, my)); }
      if (inMap(tx, ty)) out.push(idx(tx, ty));
      last = [tx, ty];
    };
    for (let i = 0; i + 1 < pts.length; i++) {
      const [x0, z0] = pts[i], [x1, z1] = pts[i + 1], L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / 5));
      for (let k = 0; k <= n; k++) { const [tx, ty] = tileOf(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n); push(tx, ty); }
    }
    return out;
  }
  function polyTiles(pts: number[][]): number[] {
    const out: number[] = [];
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
    for (let ty = Math.max(0, Math.floor(z0 / TILE)); ty <= Math.min(H - 1, Math.floor(z1 / TILE)); ty++)
      for (let tx = Math.max(0, Math.floor(x0 / TILE)); tx <= Math.min(W - 1, Math.floor(x1 / TILE)); tx++) {
        const px = (tx + 0.5) * TILE, pz = (ty + 0.5) * TILE; let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > pz) !== (zj > pz) && px < (xj - xi) * (pz - zi) / (zj - zi) + xi) inside = !inside; }
        if (inside) out.push(idx(tx, ty));
      }
    return out;
  }

  // ---- 区画の属性 ----
  const road = new Uint8Array(N), flags = new Uint8Array(N);
  const ROADCLS: Record<string, number> = { trunk: 3, trunk_link: 3, primary: 2, primary_link: 2, secondary: 2, secondary_link: 2, tertiary: 1, tertiary_link: 1, unclassified: 1 };
  const RENDER_CLS: Record<string, number> = { motorway: 5, motorway_link: 5, trunk: 4, trunk_link: 4, primary: 3, primary_link: 3, secondary: 3, secondary_link: 3, tertiary: 2, tertiary_link: 2, unclassified: 1, residential: 1, living_street: 1, service: 0, pedestrian: 0 };
  const lane = new Uint8Array(N);
  const roadLines: any[] = [], railLines: any[] = [], riverLines: number[][][] = [], streamLines: number[][][] = [], waterPolys: number[][][] = [];
  let expressway = 0;
  // 海：区画の 9 点のうち 5 点以上が海
  let seaTiles = 0;
  if (seaCount) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let c = 0; for (const u of [0.17, 0.5, 0.83]) for (const v of [0.17, 0.5, 0.83]) c += seaAt((x + u) * TILE, (y + v) * TILE);
    if (c >= 5) { flags[idx(x, y)] |= F.water; seaTiles++; }
  }
  for (const e of els) {
    if (e.type !== 'way') continue;
    const t = e.tags || {}, pts = geomXZ(e);
    if (pts.length < 2) continue;
    const tunnel = t.tunnel === 'yes' || t.tunnel === 'building_passage' || (t.layer && +t.layer < 0 && t.tunnel);
    if (t.highway && t.highway in RENDER_CLS) {
      const isExp = t.highway.startsWith('motorway') || ((t.highway === 'trunk' || t.highway === 'trunk_link') && /E\d/.test(t.ref || ''));
      if (!tunnel) roadLines.push({ c: isExp ? 5 : RENDER_CLS[t.highway], b: t.bridge ? 1 : 0, pts });
      if (isExp) { expressway++; continue; }
      const cls = ROADCLS[t.highway];
      if (!cls && !tunnel && (t.highway === 'residential' || t.highway === 'living_street')) for (const i of lineTiles(pts)) lane[i] = 1;
      if (!cls || tunnel) continue;
      for (const i of lineTiles(pts)) { if (cls > road[i]) road[i] = cls; flags[i] |= F.fixed; if (cls === 3) flags[i] |= F.national; }
    } else if (t.railway === 'rail' || t.railway === 'light_rail' || t.railway === 'narrow_gauge' || t.railway === 'subway') {
      // トンネル・地下鉄の線も残す（実寸版では描かず、まちづくり版で地下の線路にする）
      const svc = /^(yard|siding|spur|crossover)$/.test(t.service || ''), name = (t.name || '') + (t.usage || '');
      railLines.push({ b: (t.bridge && t.bridge !== 'no' ? 1 : 0) | (tunnel || t.railway === 'subway' ? 2 : 0) | (svc ? 4 : 0) | (/貨物|freight/.test(name) ? 8 : 0) | (/新幹線/.test(name) || t.highspeed === 'yes' ? 16 : 0), pts });
      if (!tunnel && t.railway !== 'subway') for (const i of lineTiles(pts)) flags[i] |= F.rail;
    } else if (t.waterway === 'river' && !tunnel) {
      riverLines.push(pts); for (const i of lineTiles(pts)) flags[i] |= F.water;
    } else if ((t.waterway === 'stream' || t.waterway === 'drain' || t.waterway === 'canal') && !tunnel) {
      streamLines.push(pts);
    } else if (closed(pts)) {
      const tiles = polyTiles(pts);
      if (t.natural === 'water' || t.waterway === 'riverbank') { waterPolys.push(pts); for (const i of tiles) flags[i] |= F.water; }
      else if (t.natural === 'wood' || t.landuse === 'forest' || t.natural === 'scrub' || t.natural === 'wetland') for (const i of tiles) flags[i] |= F.forest;
      else if (t.leisure === 'park' || t.leisure === 'playground' || t.leisure === 'pitch' || t.landuse === 'recreation_ground') for (const i of tiles) flags[i] |= F.park;
      else if (['farmland', 'brownfield', 'greenfield', 'construction', 'grass', 'farmyard', 'meadow', 'orchard'].includes(t.landuse)) for (const i of tiles) flags[i] |= F.open;
      else if (['cemetery', 'religious', 'military', 'railway', 'education', 'port'].includes(t.landuse) || t.natural === 'beach') for (const i of tiles) flags[i] |= F.blocked;
    }
  }
  // 出入口：地図の縁の幹線道路（なければ生活道路）
  const edgeRoads = (minCls: number) => { const g: number[] = []; for (let x = 0; x < W; x++) for (const y of [0, H - 1]) if (road[idx(x, y)] >= minCls) g.push(idx(x, y)); for (let y = 1; y < H - 1; y++) for (const x of [0, W - 1]) if (road[idx(x, y)] >= minCls) g.push(idx(x, y)); return g; };
  // 道路網の切れ目：出入口につながらない道路のかたまりを、細い道をたどる最短の区画でつなぐ
  {
    let gw = edgeRoads(2); if (gw.length < 2) gw = edgeRoads(1);
    const NB = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let added = 0;
    for (let pass = 0; pass < 400; pass++) {
      const conn = new Uint8Array(N), q = [...gw]; for (const g of gw) conn[g] = 1;
      for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of NB) { const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (road[j] && !conn[j]) { conn[j] = 1; q.push(j); } } }
      const prev = new Int32Array(N).fill(-2), dist = new Int32Array(N).fill(1e9), start: number[] = [];
      for (let i = 0; i < N; i++) if (road[i] && !conn[i]) { prev[i] = -1; dist[i] = 0; start.push(i); }
      if (!start.length) break;
      let hit = -1;
      const deque = [...start]; let head = 0;
      while (head < deque.length) {
        const i = deque[head++];
        if (conn[i]) { hit = i; break; }
        const x = i % W, y = (i / W) | 0;
        for (const [dx, dy] of NB) {
          const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny);
          if (flags[j] & (F.water | F.rail) && !lane[j]) continue;
          const c = road[j] || lane[j] ? 0 : 3;
          if (dist[i] + c < dist[j] && dist[i] + c <= 12) { dist[j] = dist[i] + c; prev[j] = i; if (c === 0) deque.splice(head, 0, j); else deque.push(j); }
        }
      }
      if (hit < 0) break;
      for (let k = prev[hit]; k >= 0 && !road[k]; k = prev[k]) { road[k] = 1; flags[k] |= F.fixed; added++; }
    }
    say(`道路網の切れ目を ${added} 区画の細い道でつないだ`);
  }
  for (let i = 0; i < N; i++) if (road[i]) flags[i] &= ~(F.rail | F.water | F.forest);

  // ---- 施設 ----
  type Fac = { k: string; name: string; p: number[] };
  const facs: Fac[] = [];
  const cityRun = (n: string) => /(市|町|区|村)立|^(横浜|川崎|福岡|長崎|宇部|大田区|時津町)市?/.test(n) && !/法人|学園|会$/.test(n);
  const wasteRe = opt.hints?.wasteName ?? /清掃工場|クリーンセンター|環境センター|環境工場|ごみ処理|焼却|リサイクルセンター/;
  for (const e of els) {
    const t = e.tags || {}; const n: string = t.name || '';
    let p: number[] | null = null;
    if (e.type === 'node') p = [toX(e.lon), toZ(e.lat)];
    else if (e.geometry) { const g = geomXZ(e); if (g.length) p = centroid(g); }
    if (!p) continue;
    const a = t.amenity;
    if ((a === 'kindergarten' || a === 'childcare' || a === 'school') && /保育|こども園|子ども園/.test(n) && !/病児|一時/.test(n)) facs.push({ k: cityRun(n) ? 'nursery' : 'privNursery', name: n, p });
    else if (a === 'school' && /小学校/.test(n)) facs.push({ k: 'school', name: n, p });
    else if (a === 'fire_station' && /消防|出張所/.test(n)) facs.push({ k: 'fire', name: n.replace(/^(横浜市|川崎市|福岡市|長崎市)?(安全管理局|消防局)/, ''), p });
    else if (t.railway === 'station' && e.type === 'node' && n) facs.push({ k: 'station', name: /駅$/.test(n) ? n : n + '駅', p });
    else if (n && wasteRe.test(n)) facs.push({ k: 'waste', name: n, p });
    else if ((n && /浄水場|浄水センター|配水場|配水池/.test(n)) || t.man_made === 'water_works') facs.push({ k: 'water', name: n || '浄水場', p });
    else if (t.leisure === 'park' && n && e.geometry) { const g = geomXZ(e); if (closed(g)) facs.push({ k: 'park', name: n, p: centroid(g) }); }
    else if (t.shop === 'supermarket' && n) facs.push({ k: 'supermarket', name: n, p });
    else if (t.shop === 'convenience') facs.push({ k: 'shop', name: n || 'コンビニ', p });
    else if (t.shop === 'bakery') facs.push({ k: 'bakery', name: n || 'パン屋', p });
    else if (a === 'police' && /交番|警察署|駐在所/.test(n)) facs.push({ k: 'koban', name: n, p });
    else if ((a === 'clinic' || a === 'hospital') && n) facs.push({ k: 'clinic', name: n, p });
  }
  // 名前のない浄水場（ヒントの位置に近い工業用地）
  const hw = opt.hints?.water;
  if (hw && !facs.some(f => f.k === 'water')) {
    let best: { d: number; c: number[] } | null = null;
    for (const e of els) { const t = e.tags || {}; if (t.landuse !== 'industrial' || !e.geometry) continue; const c = centroid(geomXZ(e)); const d = Math.hypot(c[0] - toX(hw.lon), c[1] - toZ(hw.lat)); if (!best || d < best.d) best = { d, c }; }
    facs.push({ k: 'water', name: hw.name, p: best && best.d < 200 ? best.c : [toX(hw.lon), toZ(hw.lat)] });
  }
  const dedup: Fac[] = [];
  const norm = (n: string) => n.replace(/[ヶヵケｹ]/g, 'ケ').replace(/\s|　/g, '');
  for (const f of facs) if (!dedup.some(g => g.k === f.k && ((norm(g.name) === norm(f.name) && Math.hypot(g.p[0] - f.p[0], g.p[1] - f.p[1]) < 400) || Math.hypot(g.p[0] - f.p[0], g.p[1] - f.p[1]) < (f.k === 'fire' || f.k === 'station' ? 80 : 25)))) dedup.push(f);

  // ---- 建物 ----
  const BT: Record<string, number> = { house: 1, detached: 1, yes: 2, residential: 3, apartments: 4, terrace: 3, semidetached_house: 1, dormitory: 4 };
  const bld: number[][] = [];
  const TYPECODE = (t: string) => (t in BT ? BT[t] : t === 'industrial' || t === 'warehouse' || t === 'manufacture' ? 5 : t === 'school' || t === 'university' || t === 'college' ? 6 : t === 'retail' || t === 'commercial' || t === 'office' ? 7 : t === 'roof' || t === 'garage' || t === 'greenhouse' || t === 'shed' ? 8 : 9);
  for (const o of src.buildings) {
    if (o.lat == null) continue;
    const x = toX(o.lon), z = toZ(o.lat);
    if (x < 0 || z < 0 || x >= W * TILE || z >= H * TILE) continue;
    // 建物の形（収集ツール v4 以降）：幅・奥行き（m）と向き（度）。なければ 0
    const w = Number.isFinite(o.w) ? Math.min(400, Math.max(0, o.w)) : 0, d = Number.isFinite(o.d) ? Math.min(400, Math.max(0, o.d)) : 0, a = Number.isFinite(o.a) ? ((Math.round(o.a) % 180) + 180) % 180 : 0;
    bld.push([x, z, TYPECODE(o.t), Math.min(40, parseInt(o.lv) || 0), w, d, a]);
  }

  // ---- 区画ごとの街区（ゲーム上の建物）----
  const occ = new Int32Array(N).fill(-1);
  const lots: { k: string; x: number; y: number; units?: number; rot?: number; name?: string }[] = [];
  const free = (i: number) => !road[i] && !(flags[i] & (F.water | F.rail)) && occ[i] < 0;
  function placeLot(k: string, w: number, h: number, p: number[], name: string, maxR?: number): boolean {
    const [cx, cy] = tileOf(p[0], p[1]);
    const R = maxR ?? (k === 'waste' || k === 'water' || k === 'school' ? 10 : 4);
    for (let r = 0; r <= R; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const x = cx + dx - Math.floor((w - 1) / 2), y = cy + dy - Math.floor((h - 1) / 2);
      let ok = x >= 0 && y >= 0 && x + w <= W && y + h <= H;
      for (let yy = 0; ok && yy < h; yy++) for (let xx = 0; xx < w; xx++) if (!free(idx(x + xx, y + yy))) { ok = false; break; }
      if (!ok) continue;
      lots.push({ k, x, y, name });
      for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) { occ[idx(x + xx, y + yy)] = lots.length - 1; flags[idx(x + xx, y + yy)] &= ~(F.forest | F.park | F.blocked); }
      return true;
    }
    return false;
  }
  const SIZE: Record<string, number[]> = { station: [3, 1], school: [3, 2], water: [2, 2], waste: [2, 1], supermarket: [2, 2] };
  const order = ['station', 'water', 'waste', 'school', 'fire', 'nursery', 'privNursery', 'park', 'supermarket', 'koban', 'clinic', 'shop', 'bakery'];
  const placed: Record<string, number> = {}, skipped: Record<string, number> = {};
  for (const k of order) for (const f of dedup.filter(f => f.k === k)) {
    const [w, h] = SIZE[k] || [1, 1];
    let ok = placeLot(k, w, h, f.p, f.name);
    if (!ok && k === 'supermarket') ok = placeLot('shop', 1, 1, f.p, f.name);
    if (!ok && k === 'school') { ok = placeLot('school', 2, 3, f.p, f.name); if (ok) lots[lots.length - 1].rot = 1; }
    (ok ? placed : skipped)[k] = ((ok ? placed : skipped)[k] || 0) + 1;
  }
  // 範囲の中に浄水場・ごみ処理施設がなければ、市外の施設から受ける拠点を幹線道路の出入口近くに置く（ゲーム上の仮定）
  for (const [k, name] of [['water', '配水池（市外の浄水場から受水）'], ['waste', 'ごみ処理施設（近隣の施設を利用）']] as const) {
    if (placed[k]) continue;
    const gws = edgeRoads(2).concat(edgeRoads(1));
    let ok = false;
    for (const g of gws) { const gx = g % W, gy = (g / W) | 0; const ix = Math.min(W - 4, Math.max(3, gx)), iy = Math.min(H - 4, Math.max(3, gy)); if (placeLot(k, SIZE[k][0], SIZE[k][1], [(ix + 0.5) * TILE, (iy + 0.5) * TILE], name, 14)) { ok = true; break; } }
    if (ok) { placed[k] = 1; report.assumed.push(name); say(`範囲内に${k === 'water' ? '浄水場' : 'ごみ処理施設'}が見つからないため「${name}」を置いた`); }
  }
  // 住宅の街区：区画内の建物から戸数を推計（戸建て 1、集合住宅は階数 × 2〜5 戸、不明な建物 0.8）
  const byTile = new Map<number, number[]>();
  bld.forEach((o, i) => {
    const [tx, ty] = tileOf(o[0], o[1]); let t = idx(tx, ty);
    if (road[t] || (flags[t] & (F.rail | F.water))) {
      let bestT = -1, bd = 1e9; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = tx + dx, ny = ty + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny); if (road[j] || (flags[j] & (F.rail | F.water))) continue; const d = Math.hypot((nx + 0.5) * TILE - o[0], (ny + 0.5) * TILE - o[1]); if (d < bd) { bd = d; bestT = j; } }
      if (bestT < 0) return; t = bestT;
    }
    let a = byTile.get(t); if (!a) byTile.set(t, (a = [])); a.push(i);
  });
  let resUnits = 0, blockedTiles = 0;
  for (const [t, list] of byTile) {
    if (occ[t] >= 0) continue;
    let units = 0, apt = 0, maxLv = 0, res = 0, other = 0;
    for (const i of list) {
      const ty = bld[i][2], lv = bld[i][3], area = bld[i][4] * bld[i][5];
      // 建物の形があれば、床面積から戸数を見積もる（1 戸 あたり 共用部込み約 70m²）
      const byArea = (fl: number) => area > 0 ? Math.round(area * 0.85 * fl / 70) : 0;
      if (ty === 1) { units += 1; res++; }
      else if (ty === 2) { units += area > 300 ? Math.max(1, byArea(lv || 3)) : 0.8; res++; if (area > 300) apt++; }
      else if (ty === 3) { units += Math.max(2, byArea(lv || 2) || (lv || 2) * 2); res++; }
      else if (ty === 4) { units += Math.max(6, byArea(lv || 3) || (lv || 3) * 5); apt++; res++; maxLv = Math.max(maxLv, lv || 3); }
      else if (ty !== 8) other++;
    }
    if (res === 0 || other > res) { if (other) { flags[t] |= F.blocked; blockedTiles++; } continue; }
    units = Math.max(1, Math.round(units));
    const k = maxLv >= 6 || units >= 40 ? 'mansion' : apt || units >= 9 ? 'apartment' : 'house';
    lots.push({ k, x: t % W, y: (t / W) | 0, units: Math.min(400, units) }); occ[t] = lots.length - 1; resUnits += Math.min(400, units);
    flags[t] &= ~(F.forest | F.park | F.blocked | F.open);
  }
  if (resUnits < 500) throw new Error(`住宅が少なすぎます（推計 ${Math.round(resUnits)} 戸）。建物データが取れていない可能性があります`);

  // ---- 地区（4 つ）----
  let DIST: { name: string; x: number; z: number }[];
  if (opt.districts?.length === 4) DIST = opt.districts.map(d => ({ name: d.name, x: toX(d.lon), z: toZ(d.lat) }));
  else DIST = autoDistricts();
  function autoDistricts(): { name: string; x: number; z: number }[] {
    // 住宅の戸数で重みをつけた k-means（k = 4）。初期値は互いに遠い点
    const pts = lots.filter(l => l.units).map(l => ({ x: (l.x + 0.5) * TILE, z: (l.y + 0.5) * TILE, w: l.units! }));
    let cx = 0, cz = 0, tw = 0; for (const p of pts) { cx += p.x * p.w; cz += p.z * p.w; tw += p.w; } cx /= tw; cz /= tw;
    const cs: number[][] = [];
    let far = pts[0]; for (const p of pts) if (Math.hypot(p.x - cx, p.z - cz) > Math.hypot(far.x - cx, far.z - cz)) far = p;
    cs.push([far.x, far.z]);
    while (cs.length < 4) { let best = pts[0], bd = -1; for (const p of pts) { const d = Math.min(...cs.map(c => Math.hypot(p.x - c[0], p.z - c[1]))); if (d > bd) { bd = d; best = p; } } cs.push([best.x, best.z]); }
    for (let it = 0; it < 15; it++) {
      const acc = cs.map(() => [0, 0, 0]);
      for (const p of pts) { let k = 0, bd = 1e18; cs.forEach((c, j) => { const d = (p.x - c[0]) ** 2 + (p.z - c[1]) ** 2; if (d < bd) { bd = d; k = j; } }); acc[k][0] += p.x * p.w; acc[k][1] += p.z * p.w; acc[k][2] += p.w; }
      acc.forEach((a, j) => { if (a[2] > 0) cs[j] = [a[0] / a[2], a[1] / a[2]]; });
    }
    // 名前：その地区に入る地名（大きな単位を優先）の近い順に 2 つ
    const RANK: Record<string, number> = { town: 0, village: 0, suburb: 1, quarter: 2, neighbourhood: 3, city_block: 4 };
    const places = els.filter(e => e.type === 'node' && e.tags?.place in RANK && e.tags?.name).map(e => ({ name: String(e.tags.name).replace(/[0-9０-９一二三四五六七八九十]+丁目$/, ''), r: RANK[e.tags.place], x: toX(e.lon), z: toZ(e.lat) }))
      .filter(p => p.x >= 0 && p.z >= 0 && p.x <= W * TILE && p.z <= H * TILE);
    const stations = dedup.filter(f => f.k === 'station');
    const used = new Set<string>();
    const dirName = (c: number[]) => (Math.abs(c[0] / (W * TILE) - 0.5) > Math.abs(c[1] / (H * TILE) - 0.5) ? (c[0] < W * TILE / 2 ? '西部' : '東部') : (c[1] < H * TILE / 2 ? '北部' : '南部'));
    return cs.map((c, j) => {
      const mine = places.filter(p => { let k = 0, bd = 1e18; cs.forEach((q, i) => { const d = (p.x - q[0]) ** 2 + (p.z - q[1]) ** 2; if (d < bd) { bd = d; k = i; } }); return k === j; })
        .sort((a, b) => a.r - b.r || Math.hypot(a.x - c[0], a.z - c[1]) - Math.hypot(b.x - c[0], b.z - c[1]));
      const names: string[] = [];
      for (const p of mine) if (!names.includes(p.name) && !used.has(p.name)) { names.push(p.name); if (names.length === 2) break; }
      let name = names.join('・');
      if (!name) { const st = stations.slice().sort((a, b) => Math.hypot(a.p[0] - c[0], a.p[1] - c[1]) - Math.hypot(b.p[0] - c[0], b.p[1] - c[1]))[0]; name = st ? st.name.replace(/駅$/, '') + '周辺' : dirName(c); }
      if (used.has(name)) name += dirName(c);
      names.forEach(n => used.add(n)); used.add(name);
      return { name: name.slice(0, 16), x: c[0], z: c[1] };
    });
  }
  const district = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = 0, bd = 1e18; DIST.forEach((d, k) => { const dd = ((x + 0.5) * TILE - d.x) ** 2 + ((y + 0.5) * TILE - d.z) ** 2; if (dd < bd) { bd = dd; best = k; } });
    district[idx(x, y)] = best;
  }
  let gateways = edgeRoads(2); if (gateways.length < 2) gateways = edgeRoads(1);
  if (gateways.length < 2) throw new Error('地図の縁に道路がありません（市外へつながる道路が必要です）');
  const nat = gateways.filter(g => road[g] === 3), cand = nat.length >= 2 ? nat : gateways;
  let through: [number, number] = [cand[0], cand[1]], bestD = -1;
  for (const a of cand) for (const c of cand) { const d = Math.hypot(a % W - c % W, ((a / W) | 0) - ((c / W) | 0)); if (d > bestD) { bestD = d; through = [a, c]; } }

  // ---- 描画用の線：0.5m 単位の Uint16 に詰める ----
  const pack = (lines: any[], withCls: boolean) => { const a: number[] = []; for (const l of lines) { const pts = l.pts || l; a.push(withCls ? l.c * 2 + (l.b || 0) : (l.b || 0), pts.length); for (const [x, z] of pts) a.push(Math.max(0, Math.min(65535, Math.round(x * 2))), Math.max(0, Math.min(65535, Math.round(z * 2)))); } return b64enc(bytes(new Uint16Array(a))); };
  const bldArr = new Uint16Array(bld.length * 3);
  bld.forEach(([x, z, t, lv], i) => { bldArr[i * 3] = Math.round(x * 10); bldArr[i * 3 + 1] = Math.round(z * 10); bldArr[i * 3 + 2] = t | (lv << 4); });
  const hasShape = bld.some(o => o[4] > 0);
  const shapeArr = new Uint16Array(hasShape ? bld.length * 3 : 0);
  if (hasShape) bld.forEach(([, , , , w, d, a], i) => { shapeArr[i * 3] = Math.round(w * 10); shapeArr[i * 3 + 1] = Math.round(d * 10); shapeArr[i * 3 + 2] = a; });

  const map = {
    format: 'sumucity-realmap', version: 2, id: opt.id, name: opt.name, W, H, tile: TILE, bbox: b,
    credits: '地図データ © OpenStreetMap contributors（ODbL）／標高 国土地理院 標高タイル',
    collectedAt: src.collectedAt, assumed: report.assumed, seaTiles,
    dem: { cols: dem.cols, rows: dem.rows, step: dem.step_m, b64: b64enc(bytes(demVals)) },
    road: b64enc(road), flags: b64enc(flags), district: b64enc(district),
    districts: DIST.map(d => ({ name: d.name, x: d.x / TILE, y: d.z / TILE })),
    gateways, through,
    lots: lots.map(l => [KIND_IDX.indexOf(l.k), l.x, l.y, l.units ?? 0, l.rot ?? 0]),
    names: Object.fromEntries(lots.map((l, i) => [i, l.name]).filter(([, n]) => n)),
    bld: b64enc(bytes(bldArr)), ...(hasShape ? { bldShape: b64enc(bytes(shapeArr)) } : {}),
    roads: pack(roadLines, true), rails: pack(railLines, false), rivers: pack(riverLines, false), streams: pack(streamLines, false), waters: pack(waterPolys, false),
  };
  const cnt = (a: Record<string, number>) => Object.entries(a).map(([k, v]) => `${k} ${v}`).join('、');
  say(`道路 ${road.filter(r => r).length} 区画（国道 ${road.filter(r => r === 3).length}、幹線 ${road.filter(r => r === 2).length}）、自動車専用道路 ${expressway} 本は描画のみ、海・水面 ${seaTiles} 区画`);
  say(`施設 配置：${cnt(placed)}／置けず：${cnt(skipped)}`);
  say(`住宅の街区 ${lots.filter(l => l.units).length}（推計 ${Math.round(resUnits).toLocaleString()} 戸）、計算外の建物の区画 ${blockedTiles}`);
  say(`地区 ${DIST.map(d => d.name).join('／')}`);
  say(`建物 ${bld.length}、出入口 ${gateways.length}`);
  return { map, report };
}
