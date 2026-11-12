// Blender から書き出した glb（assets-src/）を小さくして src/assets/ に置く。
//  1) 画像を外す（瓦・石垣などの模様はゲーム側で作る：src/render/lmtex.ts）
//  2) 頂点をまとめ、座標を量子化し、meshopt で圧縮する
// 使い方: node tools/lm-pack.mjs
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import fs from 'node:fs';
await MeshoptEncoder.ready;
/** ゲーム側（lmtex.ts）で模様を作る材質 */
const TEXTURED = new Set(['copperRoof', 'stone', 'stn_brick', 'stn_slate', 'std_pitch', 'std_seat', 'std_facade', 'pgd_kawara', 'kawara', 'ishigaki']);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
let tin = 0, tout = 0;
for (const f of fs.readdirSync('assets-src').filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(`assets-src/${f}`);
  for (const t of doc.getRoot().listTextures()) t.dispose();
  // 模様を貼らない材質の UV は要らないので外す
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    const n = p.getMaterial()?.getName() ?? '';
    if (!TEXTURED.has(n) && !['kawara', 'ishigaki'].includes(n.slice(n.indexOf('_') + 1))) { const uv = p.getAttribute('TEXCOORD_0'); if (uv) p.setAttribute('TEXCOORD_0', null); }
  }
  // 灯台の光の帯は、シェーダーで元の座標（根元からの距離）を使うので量子化しない
  const q = f.startsWith('lighthouse') ? [] : [quantize()];
  await doc.transform(prune({ keepAttributes: true }), dedup(), weld(), ...q, meshopt({ encoder: MeshoptEncoder, level: 'high' }));
  await io.write(`src/assets/${f}`, doc);
  const a = fs.statSync(`assets-src/${f}`).size, b = fs.statSync(`src/assets/${f}`).size; tin += a; tout += b;
  console.log(f.padEnd(20), (a / 1024).toFixed(0).padStart(6), 'KB →', (b / 1024).toFixed(0).padStart(5), 'KB');
}
console.log('total'.padEnd(20), (tin / 1024).toFixed(0).padStart(6), 'KB →', (tout / 1024).toFixed(0).padStart(5), 'KB');
