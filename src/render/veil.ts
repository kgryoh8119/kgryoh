// v103：まだ編入していない区域の暗幕（区域の暗幕）の形（純粋な関数。tests/v103_veil.test.ts で確かめる）。
// v102 までは、暗幕のある区画ごとに 3×3 の四角（18 三角形）で地形に沿わせ、地図全体を 1 つの形（視錐台カリングなし）で毎コマ描いていた。
// 住野市では 24,796 区画 × 18 = 44.6 万三角形を、画面の外の分も含めていつも描いていた。
// ここでは、地形に沿う高さの差（3×3 の格子点で）が tol 以内なら区画を 1 枚（2 三角形）か 2×2 で描き、平らで同じ高さの区画は横に続けて 1 枚にまとめる。
// 区画の辺の上では地形（双一次の補間）は直線なので、細かさの違う区画が隣り合ってもすき間はできない。塊（chunk×chunk 区画）ごとに分けて、画面の外の塊は描かない。

/** 暗幕の四角：[x0, z0, x1, z1, (x0,z1) の高さ, (x1,z1), (x1,z0), (x0,z0)] を続けて並べた配列を、塊の番号ごとに返す */
export function veilQuads(W: number, H: number, TILE: number, locked: (i: number) => boolean, hq: (x: number, z: number) => number, tol = 0.15, chunk = 32): Map<number, number[]> {
  const out = new Map<number, number[]>(), CW = Math.ceil(W / chunk);
  const put = (x: number, y: number, a: number[]) => { const k = ((y / chunk) | 0) * CW + ((x / chunk) | 0); let l = out.get(k); if (!l) out.set(k, l = []); for (const v of a) l.push(v); };
  /** 四角 (x0..x1, z0..z1) を 2 つの三角形（(x0,z1)-(x1,z0) の対角線、Geo.quad と同じ）で描いたときの、点 (X, Z) の高さ */
  const tri = (x0: number, z0: number, x1: number, z1: number, hA: number, hB: number, hC: number, hD: number, X: number, Z: number) => {
    const u = (X - x0) / (x1 - x0), w = (z1 - Z) / (z1 - z0);
    return u >= w ? hA + (hB - hA) * u + (hC - hB) * w : hA + (hC - hD) * u + (hD - hA) * w;
  };
  const S = 3, smp: number[] = new Array((S + 1) * (S + 1));
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const i = y * W + x; if (!locked(i)) { x++; continue; }
      const X0 = x * TILE, Z0 = y * TILE, st = TILE / S;
      for (let j = 0; j <= S; j++) for (let k = 0; k <= S; k++) smp[j * (S + 1) + k] = hq(X0 + k * st, Z0 + j * st);
      let lo = Infinity, hi = -Infinity; for (const v of smp) { if (v < lo) lo = v; if (v > hi) hi = v; }
      if (hi - lo < 1e-3) { // 平ら：同じ高さの平らな区画が横に続く所は 1 枚に（塊の境では切る）
        let x1 = x + 1;
        while (x1 < W && ((x1 / chunk) | 0) === ((x / chunk) | 0) && locked(y * W + x1)) {
          let ok = true; for (let j = 0; j <= S && ok; j++) for (let k = 0; k <= S; k++) if (Math.abs(hq(x1 * TILE + k * st, Z0 + j * st) - lo) >= 1e-3) { ok = false; break; }
          if (!ok) break; x1++;
        }
        put(x, y, [X0, Z0, x1 * TILE, Z0 + TILE, lo, lo, lo, lo]); x = x1; continue;
      }
      // 地形に沿う細かさ：1 枚・2×2・3×3 のうち、3×3 の格子点での高さの差が tol 以内になる一番粗いもの（3×3 は前と同じ）
      let n = S;
      for (const m of [1, 2]) {
        const sm = TILE / m; let worst = 0;
        for (let j = 0; j <= S && worst <= tol; j++) for (let k = 0; k <= S; k++) {
          const X = X0 + k * st, Z = Z0 + j * st, cx = Math.min(m - 1, Math.floor((X - X0) / sm + 1e-9)), cz = Math.min(m - 1, Math.floor((Z - Z0) / sm + 1e-9));
          const a = X0 + cx * sm, b = Z0 + cz * sm, c = a + sm, d = b + sm;
          const e = Math.abs(tri(a, b, c, d, hq(a, d), hq(c, d), hq(c, b), hq(a, b), X, Z) - smp[j * (S + 1) + k]); if (e > worst) worst = e;
        }
        if (worst <= tol) { n = m; break; }
      }
      const sm = TILE / n;
      for (let j = 0; j < n; j++) for (let k = 0; k < n; k++) { const a = X0 + k * sm, b = Z0 + j * sm, c = a + sm, d = b + sm; put(x, y, [a, b, c, d, hq(a, d), hq(c, d), hq(c, b), hq(a, b)]); }
      x++;
    }
  }
  return out;
}
