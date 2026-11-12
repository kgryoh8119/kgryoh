// 名所の 3D モデル（Blender で作った glb）。コードで組む建物とは別に、テクスチャつきの物として置く。
// 単一 HTML に埋め込むので、glb は data URL として読み込む。作り方の手順は tools/blender_*.py
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { lmTexture } from './lmtex';
import type { Kind } from '../sim/types';

/** src/assets/ の glb をすべて data URL で埋め込む（tools/lm-pack.mjs で縮めたもの） */
const GLB = import.meta.glob('../assets/*.glb', { query: '?inline', import: 'default', eager: true }) as Record<string, string>;
const glb = (n: string) => GLB[`../assets/${n}.glb`];

/** 種類ごとの glb と、区画の中心から見た置き場所（ローカル座標、+z が正面）・大きさ。
 *  full: 区画全体を glb で作っている（コードの模型は敷地の下地だけにする） */
/** 埋め込んだ glb（data: URL）を、通信を使わずにその場で読む。公開ページの中では fetch が使えない（中継で Request を渡せない）ため */
function dataUrlBuffer(u: string): ArrayBuffer {
  const i = u.indexOf(','), b64 = u.slice(0, i).includes(';base64'), body = u.slice(i + 1);
  if (!b64) return new TextEncoder().encode(decodeURIComponent(body)).buffer as ArrayBuffer;
  const bin = atob(body), a = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k); return a.buffer;
}
interface LmDef { url: string; off: [number, number, number]; scale?: number; full?: boolean }
const F = (n: string): LmDef => ({ url: glb(n), off: [0, 0, 0], full: true });
const DEFS: Partial<Record<Kind, LmDef>> = {
  castle: { url: glb('osaka_tenshu'), off: [0, 0, -6] },
  station: { url: glb('station'), off: [0, 0, -8] },
  tower: { url: glb('tower'), off: [0, 0, -8] },
  stadium: { url: glb('stadium'), off: [0, 0, -8], scale: 0.94 },
  temple: { url: glb('pagoda'), off: [28, 0, -16] },        // 寺院は五重塔だけを差し替え（本堂・山門はコードの模型）
  shrine: { url: glb('shrine'), off: [0, 0, -8] },          // 神社は社殿を差し替え（鳥居・参道・森はコードの模型）
  ferrisWheel: { url: glb('ferris'), off: [0, 0, -4] },
  lighthouse: { url: glb('lighthouse'), off: [0, 0, -2] },
  grandShrine: F('grand_shrine'), kabukiza: F('kabukiza'), castleRuins: F('castle_ruins'), japaneseGarden: F('japanese_garden'),
  clockTower: F('clock_tower'), ironTower: F('iron_tower'), church: F('church'), operaHouse: F('opera_house'),
  kencho: F('kencho'), cityHall: F('city_hall'), dome: F('dome'), ballpark: F('ballpark'),
  controlTower: F('control_tower'), aquarium: F('aquarium'), amusementPark: F('amusement_park'), airshipMast: F('airship_mast'),
  megaPark: F('mega_park'), windmill: F('windmill'), boatRace: F('boat_race'), keirin: F('keirin'), racecourse: F('racecourse'), skiResort: F('ski_resort'),
  skyscraper: F('skyscraper'), skyGarden: F('sky_garden'), futureTower: F('future_tower'), expoSite: F('expo_site'), triumphGate: F('triumph_gate'),
  pyramidHall: F('pyramid_hall'), giantRobot: F('giant_robot'), redBrick: F('red_brick'), westernHouse: F('western_house'), machiya: F('machiya'),
  observatory: F('observatory'), botanical: F('botanical'), zoo: F('zoo'), ancientRuins: F('ancient_ruins'), university: F('university'),
  orbitalHotel: F('orbital_hotel'), moonBase: F('moon_base'), megaFloat: F('mega_float'),
};
export const LANDMARK_KINDS = Object.keys(DEFS) as Kind[];

/** 夜の光り方：材質名に含まれる語 → [強さ, 色]（色が null なら glb の発光色、テクスチャがあれば模様のまま光る） */
const LIT: [string, number, [number, number, number] | null][] = [
  ['glass_window', 0.2, [1, 0.82, 0.55]], ['lamp', 2.2, null], ['plaster', 0.55, [1, 0.93, 0.8]], ['gold', 0.6, [1, 0.9, 0.7]], ['copperRoof', 0.2, [1, 0.95, 0.85]],
  ['stone', 0.16, [1, 0.92, 0.8]], ['window', 0.85, [1, 0.8, 0.5]], ['lightup_orange', 0.7, [1, 0.4, 0.15]], ['lightup_iron', 0.7, [1, 0.68, 0.3]], ['lightup', 0.5, [1, 0.85, 0.65]], ['screen', 0.9, [0.55, 0.75, 1]],
  ['pitch', 0.7, [1, 1, 0.95]], ['field_grass', 0.5, [0.55, 0.9, 0.45]], ['dirt', 0.45, [0.85, 0.62, 0.45]], ['seat', 0.35, [1, 1, 0.95]], ['roof_membrane', 0.22, [0.95, 0.97, 1]],
  ['vermilion', 0.22, [1, 0.7, 0.5]], ['kawara', 0.15, [1, 0.95, 0.85]],
];

/** 置く物 1 件。off を渡すとその位置ずれを使う（線路と一緒に描く駅舎など） */
export interface LmItem { id: number; kind: Kind; x: number; y: number; z: number; rot: number; off?: [number, number, number] }

export class Landmarks {
  private src = new Map<Kind, THREE.Object3D>();
  private placed = new Map<number, { kind: Kind; obj: THREE.Object3D; key: string; spin: THREE.Object3D[]; gond: THREE.Object3D[] }>();
  /** 灯台の光の帯（夜だけ見せる） */
  private beamMat = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    // 圧縮で座標が正規化されるので、物の原点（＝灯の中心）からのワールド距離で薄める
    vertexShader: 'varying float vD; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vec3 o = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; vD = length(w.xyz - o) / 70.0; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: 'uniform float uK; varying float vD; void main(){ float f = pow(max(0.0, 1.0 - vD), 2.2); gl_FragColor = vec4(vec3(1.0, 0.95, 0.8) * uK * f, 1.0); }',
  });
  private t0 = performance.now(); private night = 0;
  readonly mats: THREE.MeshStandardMaterial[] = [];
  private lit: { m: THREE.MeshStandardMaterial; k: number; c: THREE.Color }[] = [];
  constructor(private scene: THREE.Scene, private onReady: () => void) {}

  load(): void {
    const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
    for (const k of LANDMARK_KINDS) {
      loader.parseAsync(dataUrlBuffer(DEFS[k]!.url), '').then(g => {
        const root = g.scene;
        root.traverse(o => {
          const m = o as THREE.Mesh; if (!m.isMesh) return;
          m.castShadow = true; m.receiveShadow = true;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
          for (const mt of mats) {
            if (!mt.isMeshStandardMaterial || this.mats.includes(mt)) continue;
            // 模様は glb に入れず、ここで作って貼る（lmtex.ts）
            const tx = lmTexture(mt.name);
            if (tx) { mt.map = tx.map; mt.normalMap = tx.normal ?? null; mt.color.set(1, 1, 1); mt.needsUpdate = true; }
            for (const t of [mt.map, mt.normalMap]) if (t) t.anisotropy = 8;
            if (mt.normalMap) mt.normalScale.set(0.8, 0.8);
            // 金具は映り込みが無いと黒く沈むので、金属らしさを少し控える
            if (mt.metalness > 0.5) { mt.metalness = 0.75; mt.roughness = 0.35; }
            // 白い膜屋根・展望台・灯台は昼に白飛びするので少し落とす（上で）
            this.mats.push(mt);
            if (mt.name.includes('beam')) {        // 灯台の光：根元が明るく先へ薄れる加算の帯（影なし）
              m.material = this.beamMat; m.castShadow = false; m.receiveShadow = false; continue;
            }
            if (/roof_membrane|deck|lgh_plaster/.test(mt.name)) mt.color.multiplyScalar(/roof_membrane/.test(mt.name) ? 0.68 : 0.8);
            if (/ski_snow|ski_slope/.test(mt.name)) { mt.color.multiplyScalar(0.62); mt.roughness = 0.9; }
            const rule = LIT.find(([w]) => mt.name.includes(w));
            if (rule) {
              const c = rule[2] ? new THREE.Color(...rule[2]) : (mt.emissive.getHex() ? mt.emissive.clone() : new THREE.Color(1, 0.95, 0.85));
              // 模様の無い座席は、白く光らないよう自分の色で弱く
              if (rule[0] === 'seat' && !mt.map && !lmTexture(mt.name)) { this.lit.push({ m: mt, k: 0.12, c: mt.color.clone() }); continue; }
              if (mt.map) mt.emissiveMap = mt.map;
              this.lit.push({ m: mt, k: rule[1], c });
            }
          }
        });
        this.src.set(k, root);
        this.onReady();
      }).catch(e => console.warn('landmark load failed', k, e));
    }
  }
  /** この種類の glb が使えるか（使えるときはコードの模型から本体を省く） */
  has(k: Kind | string): boolean { return this.src.has(k as Kind); }
  /** 区画まるごと glb で作った種類か（読み込み済みのときだけ） */
  full(k: Kind): boolean { return !!DEFS[k]?.full && this.src.has(k); }

  /** 建物の一覧に合わせて置き直す */
  sync(list: LmItem[]): void {
    const seen = new Set<number>();
    for (const b of list) {
      const src = this.src.get(b.kind); if (!src) continue;
      seen.add(b.id);
      const d = DEFS[b.kind]!, [ox, oy, oz] = b.off ?? d.off;
      const key = `${b.kind}|${b.x}|${b.y}|${b.z}|${b.rot}|${ox}|${oz}`;
      const p = this.placed.get(b.id);
      if (p && p.key === key) continue;
      if (p) this.scene.remove(p.obj);
      const obj = src.clone(true), c = Math.cos(b.rot), s = Math.sin(b.rot);
      obj.position.set(b.x + ox * c + oz * s, b.y + oy, b.z - ox * s + oz * c);
      obj.rotation.y = b.rot; if (d.scale) obj.scale.setScalar(d.scale);
      this.scene.add(obj);
      const spin: THREE.Object3D[] = [], gond: THREE.Object3D[] = [];
      // 回す節を集める。多材質の物や圧縮で子の節に分かれるので、祖先に同じ種類があるものは除く
      const under = (o: THREE.Object3D, w: string) => { for (let q = o.parent; q; q = q.parent) if (q.name.includes(w)) return true; return false; };
      obj.traverse(o => {
        if (o.name.includes('spin') && !under(o, 'spin')) spin.push(o);
        else if (o.name.includes('gond') && !under(o, 'gond')) gond.push(o);
      });
      this.placed.set(b.id, { kind: b.kind, obj, key, spin, gond });
    }
    for (const [id, p] of this.placed) if (!seen.has(id)) { this.scene.remove(p.obj); this.placed.delete(id); }
  }
  /** 夜のライトアップと映り込み */
  update(night: number, env: THREE.Texture | null, day: number): void {
    // 回る部品：観覧車は 1 周 8 分ほど（ゴンドラは常に下向き）、灯台の光は 1 周 10 秒
    const t = (performance.now() - this.t0) / 1000;
    for (const p of this.placed.values()) {
      // 名前で回し方を決める：beam/spinY は縦軸、それ以外は前後の軸。_s50 なら 0.50 rad/秒
      for (const o of p.spin) {
        const m = /_s(\d+)/.exec(o.name), beam = o.name.includes('beam'), sp = m ? +m[1] / 100 : beam ? 0.63 : 0.013;
        if (beam || o.name.includes('spinY')) o.rotation.y = t * sp; else o.rotation.z = t * sp;
        if (beam) o.visible = night > 0.25;
      }
      for (const o of p.gond) { let r = 0; for (let q = o.parent; q; q = q.parent) if (q.name.includes('spin')) r += q.rotation.z; o.rotation.z = -r; }
    }
    this.beamMat.uniforms.uK.value = 0.35 * Math.max(0, night - 0.2);
    for (const { m, k, c } of this.lit) { m.emissive.copy(c); m.emissiveIntensity = k * night * (m.emissiveMap ? 1.6 : 1); }
    if (env) for (const m of this.mats) { if (m.envMap !== env) { m.envMap = env; m.needsUpdate = true; } m.envMapIntensity = 0.4 + 0.6 * day; }
  }
}
