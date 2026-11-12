// 建設メニューの見本の絵：建物モデルを小さな画面外の描画で 1 枚ずつ撮り、画像の URL として覚えておく
import * as THREE from 'three';
import { Geo } from './geo';
import { MODEL, MODEL_H, makeSignCanvas, rng, type Ctx } from './models';
import { DEFS } from '../sim/index';
import type { Kind } from '../sim/index';

const cache = new Map<Kind, string>();
let R: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; mats: THREE.Material[] } | null = null;
let failed = false;

function setup(): typeof R {
  if (R || failed) return R;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(192, 128, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    scene.add(new THREE.HemisphereLight(0xdfeeff, 0x6b6250, 1.6));
    const sun = new THREE.DirectionalLight(0xfff2dc, 2.2); sun.position.set(0.6, 1, 0.8); scene.add(sun);
    const camera = new THREE.PerspectiveCamera(30, 192 / 128, 1, 5000);
    const tex = new THREE.CanvasTexture(makeSignCanvas()); tex.colorSpace = THREE.SRGBColorSpace;
    const body = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, flatShading: true });
    const win = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.15 });
    const sign = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 });
    R = { renderer, scene, camera, mats: [body, win, win, sign] };
  } catch { failed = true; }
  return R;
}

/** 施設の見本の絵（data URL）。描けない環境では空文字 */
export function thumb(kind: Kind): string {
  const hit = cache.get(kind); if (hit !== undefined) return hit;
  const r = setup(); if (!r) { cache.set(kind, ''); return ''; }
  const c: Ctx = { g: new Geo(), wa: new Geo(), wb: new Geo(), sign: new Geo(true), rnd: rng(0.37), old: false };
  let url = '';
  const meshes: THREE.Mesh[] = [];
  try {
    MODEL[kind](c);
    [c.g, c.wa, c.wb, c.sign].forEach((g, k) => { if (!g.pos.length) return; const m = new THREE.Mesh(g.build(), r.mats[k]); r.scene.add(m); meshes.push(m); });
    const d = DEFS[kind], w = d.w * 30, h = d.h * 30, ht = MODEL_H[kind] ?? 10;
    const size = Math.max(w, h, ht * 1.3), dist = size * 1.45 + 12, yaw = 0.62, pitch = 0.5;
    r.camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist + ht * 0.3, Math.cos(yaw) * Math.cos(pitch) * dist);
    r.camera.lookAt(0, ht * 0.3, 0); r.camera.updateProjectionMatrix();
    r.renderer.setClearColor(0x000000, 0);
    r.renderer.render(r.scene, r.camera);
    url = r.renderer.domElement.toDataURL('image/png');
  } catch { url = ''; }
  for (const m of meshes) { r.scene.remove(m); m.geometry.dispose(); }
  cache.set(kind, url);
  return url;
}
