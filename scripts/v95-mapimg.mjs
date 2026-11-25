// v95：v95-land.ts の SAVE（道路・建物・用途）から、上から見た全景の略図を PNG にする（3D を使わない軽い確認用）
// 使い方：node scripts/v95-mapimg.mjs 入力.json 出力.png [開発の区画の json]
import sharp from 'sharp';
import fs from 'fs';
const [, , inp, out] = process.argv;
const d = JSON.parse(fs.readFileSync(inp, 'utf8')), { W, H } = d, S = 4;
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let i = 0; i < W * H; i++) if (d.road[i] && d.road[i] !== 3 || d.occ[i]) { const x = i % W, y = (i / W) | 0; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
x0 = Math.max(0, x0 - 4); y0 = Math.max(0, y0 - 4); x1 = Math.min(W - 1, x1 + 4); y1 = Math.min(H - 1, y1 + 4);
const w = (x1 - x0 + 1) * S, h = (y1 - y0 + 1) * S, buf = Buffer.alloc(w * h * 3);
const ZC = [null, [200, 230, 190], [170, 215, 160], [140, 200, 130], [180, 205, 240], [230, 215, 170], [225, 200, 200]];
const NEW = new Set(d.grid ?? []);
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  const i = y * W + x; let c = [236, 232, 220];
  if (d.zone[i] && ZC[d.zone[i]]) c = ZC[d.zone[i]];
  if (d.occ[i]) c = d.zone[i] === 4 ? [60, 110, 190] : [120, 110, 95];
  if (d.road[i]) c = NEW.has(i) ? [220, 70, 40] : d.road[i] >= 2 ? [40, 40, 40] : [95, 95, 95];
  for (let dy = 0; dy < S; dy++) for (let dx = 0; dx < S; dx++) { const p = (((y - y0) * S + dy) * w + (x - x0) * S + dx) * 3; buf[p] = c[0]; buf[p + 1] = c[1]; buf[p + 2] = c[2]; }
}
await sharp(buf, { raw: { width: w, height: h, channels: 3 } }).png().toFile(out);
console.log('saved', out, w, h);
