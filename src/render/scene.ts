// 3D 表示。GameState を読むだけで、書き換えない。経営の更新（月次）と描画の更新（毎フレーム）は別。
import * as THREE from 'three';
import { Geo, type V3 } from './geo';
import { People, makeLook, pickType, strideOf, seeded, calMonth, RAIN_EVENTS, ACC, type Look, type PType , PEOPLE_TIME } from './people';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
/** 色の仕上げ（彩度・コントラスト・色味・黒の持ち上げ・周辺の減光）。sRGB の後にかける */
/** 夜の窓の点いている割合（0〜1。時刻で変わる） */
const WIN_LIT = { value: 0.8 }, NIGHT_U = { value: 0 };
/** 遠くの簡略版の建物：箱の側面に、夜は窓の格子が光る（部屋ごとに点いたり消えたり） */
/** 夜の明かりの決まりごと：区画ごとの建物の種類（R）と地面の高さ（G）を地図の大きさの画像に入れ、シェーダーが読む。
 *  種類 1 住宅・2 会社・3 店・4 学校や役所（夜は暗い）・5 24 時間（病院・警察・消防・駅・コンビニ）・6 ホテル・7 工場と倉庫 */
const PROF_TEX = new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat);
const NIGHT_UNI = { uProf: { value: PROF_TEX }, uMapSz: { value: new THREE.Vector2(1, 1) }, uHour: { value: 20 }, uNight: NIGHT_U, uT: { value: 0 } };
const NIGHT_GLSL = `
uniform sampler2D uProf; uniform vec2 uMapSz; uniform float uHour, uNight, uT;
float S_(float a, float b, float x) { return smoothstep(a, b, x); }
float hsh3(vec3 c) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
// 種類と時刻から、その窓が点いている見込み（0〜1）と、明かりの色
float litP(float pr, float h, float lowFloor) {
  if (pr < 0.5) return 0.45;
  if (pr < 1.5) return 0.1 + 0.72 * S_(16.5, 19.5, h) * (1.0 - S_(22.0, 24.5, h)) + 0.3 * S_(4.8, 6.3, h) * (1.0 - S_(7.2, 8.5, h)); // 住宅：夕方から 22 時が多く、深夜は 1 割
  if (pr < 2.5) return 0.04 + 0.78 * S_(15.5, 17.0, h) * (1.0 - S_(19.0, 22.0, h)) + 0.12 * S_(19.0, 20.0, h) * (1.0 - S_(22.0, 24.0, h)); // 会社：残業は 22 時まで
  if (pr < 3.5) return lowFloor * 0.95 * S_(16.0, 17.0, h) * (1.0 - S_(21.0, 22.5, h)) + (1.0 - lowFloor) * 0.05; // 店：1 階だけ、閉店まで
  if (pr < 4.5) return 0.03 + 0.55 * S_(16.0, 17.0, h) * (1.0 - S_(18.0, 19.5, h)); // 学校・役所：夜は廊下と非常灯だけ
  if (pr < 5.5) return 0.5; // 24 時間
  if (pr < 6.5) return 0.2 + 0.5 * S_(17.0, 19.0, h) * (1.0 - S_(23.0, 25.0, h)); // ホテル
  if (pr < 7.5) return 0.32; // 工場・倉庫
  return 0.92 * max(S_(17.0, 18.5, h), 1.0 - S_(4.0, 5.0, h)); // 夜の街：夕方から明け方まで
}
vec3 litC(float pr, float r) {
  if (pr > 7.5) { float q = fract(r * 5.3); return (q < 0.3 ? vec3(1.3, 0.35, 0.8) : q < 0.55 ? vec3(0.4, 1.1, 1.4) : q < 0.75 ? vec3(0.9, 0.45, 1.4) : vec3(1.4, 1.0, 0.35)) * (0.38 + 0.1 * sin(uT * 3.0 + r * 30.0)); } // ネオン：桃・水色・紫・黄、ゆらぐ
  if (pr > 1.5 && pr < 2.5) return vec3(0.82, 0.92, 1.08);           // 会社：白い蛍光灯
  if (pr > 3.5 && pr < 5.5) return vec3(0.78, 0.9, 1.1) * 0.85;       // 学校・病院など：白く、少し暗い
  if (pr > 6.5) return vec3(0.9, 0.95, 1.0) * 0.8;
  vec3 warm = vec3(1.0, 0.76, 0.48), led = vec3(0.86, 0.92, 1.08), tv = vec3(0.55, 0.7, 1.15);
  return r < 0.72 ? warm * (0.75 + 0.5 * fract(r * 13.1)) : r < 0.95 ? led : tv * (0.7 + 0.3 * sin(uT * 7.0 + r * 40.0));  // 住宅：電球色・LED・テレビの青
}
vec4 profAt(vec3 wp) { return texture2D(uProf, clamp(wp.xz / uMapSz, 0.0, 1.0)); }
`;
/** 遠くの簡略版の建物：箱の側面に、夜は窓の格子（種類ごとに並び方と点き方が違う） */
const LOD_MAT = (() => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  m.onBeforeCompile = sh => { Object.assign(sh.uniforms, NIGHT_UNI);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vNW;').replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vNW = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec3 vNW;' + NIGHT_GLSL).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (abs(vNW.y) < 0.4) { vec4 P = profAt(vWP); float pr = floor(P.r * 255.0 + 0.5), gy = P.g * 255.0 / 3.0 - 20.0, yy = vWP.y - gy;
        float sx = pr > 1.5 && pr < 2.5 ? 2.4 : 3.4, sy = pr > 3.5 && pr < 4.5 ? 3.9 : 3.2; // 会社は横長の窓が続く。学校は天井が高い
        float hz = abs(vNW.x) > abs(vNW.z) ? vWP.z : vWP.x; vec2 g = vec2(fract(hz / sx), fract((yy - 0.6) / sy));
        float win = step(0.2, g.x) * step(g.x, pr > 1.5 && pr < 2.5 ? 0.96 : 0.78) * step(0.3, g.y) * step(g.y, 0.78) * step(0.8, yy);
        vec3 cl = pr > 1.5 && pr < 2.5 ? floor(vec3(vWP.x / 9.0, yy / sy, vWP.z / 9.0)) : floor(vec3(vWP.x / sx, yy / sy, vWP.z / sx)); float r = hsh3(cl), on = step(r, litP(pr, uHour, step(yy, 4.2)));
        float aa = 1.0 - smoothstep(0.25, 0.6, fwidth(hz / sx)); // 遠くで窓の格子がちらつかないように
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb * 0.62, vec3(0.42, 0.5, 0.56), 0.35), win * mix(0.85 * aa, 1.0, uNight)); // 昼も窓の並びが見える（ガラスは空を映して青みがかる）
        totalEmissiveRadiance += win * on * uNight * 1.5 * litC(pr, fract(r * 7.3)); }`); };
  m.customProgramCacheKey = () => 'lod-win3'; return m; })();
const GRADE_SHADER = {
  uniforms: { tDiffuse: { value: null }, uSplit: { value: 1 }, uSat: { value: 1.12 }, uCon: { value: 1.1 }, uTint: { value: new THREE.Vector3(1, 1, 1) }, uVig: { value: 0.2 }, uLift: { value: 0.012 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uCon, uVig, uLift, uSplit; uniform vec3 uTint; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); vec3 x = c.rgb * uTint; float l = dot(x, vec3(0.299, 0.587, 0.114)); x = mix(vec3(l), x, uSat); x = (x - 0.5) * uCon + 0.5; x += uSplit * ((1.0 - l) * vec3(-0.012, 0.0, 0.03) + l * vec3(0.028, 0.012, -0.022)); // 暗い所は青く、明るい所は暖かく x = x * (1.0 - uLift) + uLift;
      vec2 d = vUv - 0.5; x *= 1.0 - uVig * smoothstep(0.25, 0.85, dot(d, d) * 2.2); gl_FragColor = vec4(clamp(x, 0.0, 1.0), c.a); }`,
};
/** 窓の奥の部屋（v50）：ガラス面から奥へ視線を延ばし、天井・床・横の壁・奥の壁のどれに当たるかで色を決める（インテリアマッピング）。
 *  部屋は幅 3.6m・高さ 3.2m・奥行き 4.5m の箱。部屋ごとに壁紙・床・家具の影・カーテンが変わる。水平な面（屋根の天窓）では使わない */
const ROOM_GLSL = `
vec4 room(vec3 wp) {
  vec3 n = normalize(cross(dFdx(wp), dFdy(wp)));
  if (abs(n.y) > 0.5) return vec4(0.0);
  vec3 rd = normalize(wp - cameraPosition); if (dot(rd, n) > 0.0) n = -n;
  vec3 tg = normalize(vec3(-n.z, 0.0, n.x)); float u = dot(wp, tg), v = wp.y;
  vec3 r = vec3(dot(rd, tg), rd.y, -dot(rd, n)); const float RW = 3.6, RH = 3.2, RD = 4.5;
  float u0 = floor(u / RW) * RW, v0 = floor(v / RH) * RH;
  float tu = ((r.x > 0.0 ? u0 + RW : u0) - u) / (abs(r.x) < 1e-4 ? 1e-4 : r.x);
  float tv = ((r.y > 0.0 ? v0 + RH : v0) - v) / (abs(r.y) < 1e-4 ? 1e-4 : r.y);
  float tb = RD / max(r.z, 1e-3), t = min(tb, min(tu, tv));
  vec3 h = vec3(u + r.x * t, v + r.y * t, r.z * t); float id = hsh3(vec3(u0, v0, floor(dot(wp, n) * 0.5)));
  float fx = (h.x - u0) / RW, fy = (h.y - v0) / RH, dz = clamp(h.z / RD, 0.0, 1.0); vec3 col;
  vec3 wall = mix(mix(vec3(0.86, 0.82, 0.74), vec3(0.74, 0.79, 0.84), step(0.55, id)), vec3(0.88, 0.86, 0.8), step(0.85, id));
  if (t == tb) { col = wall; if (fy < 0.38 && abs(fx - 0.25 - 0.5 * fract(id * 7.1)) < 0.2) col *= 0.42; if (fy > 0.45 && fy < 0.75 && abs(fx - 0.7 + 0.4 * fract(id * 3.7)) < 0.12) col *= mix(vec3(0.5, 0.6, 0.8), vec3(0.8, 0.5, 0.4), fract(id * 11.0)); }
  else if (t == tv) col = r.y > 0.0 ? vec3(1.05, 1.02, 0.96) : mix(vec3(0.5, 0.36, 0.24), vec3(0.62, 0.6, 0.55), step(0.6, fract(id * 5.3))) * (0.85 + 0.3 * fract(h.x * 0.9));
  else col = wall * 0.86;
  float curtain = step(fract(id * 13.0), 0.35) * (step(fract((u - u0) / RW + 0.02), 0.22) + step(0.78, fract((u - u0) / RW))); // 窓ぎわのカーテン
  col = mix(col, mix(vec3(0.9, 0.86, 0.72), vec3(0.62, 0.7, 0.82), fract(id * 17.0)), clamp(curtain, 0.0, 1.0) * 0.85);
  return vec4(col * (1.0 - 0.5 * dz), 1.0);
}`;
/** 大気の仕上げ（v50）：深度から地面の位置を戻し、高さで薄くなる霧（谷や低い所の朝霧）と、太陽の方向の光のにじみ（逆光の霞）を足す */
const ATMO_SHADER = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
    uFogCol: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uDensity: { value: 0.00005 }, uFalloff: { value: 0.012 }, uGround: { value: 0 }, uSunK: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse, tDepth; uniform mat4 uInvProj, uCamWorld; uniform vec3 uCam, uFogCol, uSunCol, uSunDir; uniform float uDensity, uFalloff, uGround, uSunK; varying vec2 vUv;
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float d = texture2D(tDepth, vUv).x;
      vec4 vp = uInvProj * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); vp /= vp.w; vec3 wp = (uCamWorld * vec4(vp.xyz, 1.0)).xyz; vec3 ray = wp - uCam; float dist = length(ray); vec3 rd = ray / max(dist, 1e-3);
      float sunA = max(dot(rd, uSunDir), 0.0);
      if (d >= 0.99999) { c.rgb += uSunCol * (pow(sunA, 600.0) * 2.5 + pow(sunA, 40.0) * 0.25) * uSunK; gl_FragColor = c; return; } // 空：太陽の円と光の輪
      float by = rd.y * uFalloff, h0 = exp(-uFalloff * max(uCam.y - uGround, 0.0));
      float amt = uDensity * h0 * (abs(by) > 1e-4 ? (1.0 - exp(-dist * by)) / by : dist);
      float f = clamp(1.0 - exp(-amt), 0.0, 0.85);
      vec3 col = mix(uFogCol, uSunCol, pow(sunA, 6.0) * 0.65 * uSunK);
      c.rgb = mix(c.rgb, col, f) + uSunCol * pow(sunA, 12.0) * 0.06 * uSunK * smoothstep(300.0, 3000.0, dist);
      gl_FragColor = c; }`,
};
import { FX, glowTex } from './fx';
import { buildRailPaths, drawRailPaths, railAt, SHIN_LINES, shinDeckY, RAIL_LM, type RailPath, type Gate, type StationSpot } from './rails';
import { Landmarks, type LmItem } from './landmarks';
import { roadKitMat, roadTile, face, RK } from './roadkit';
import { roadBase, hasXw, walkW, sigPlan } from './roadbase';
import { crowdPlan, occupancyPhase, occDay, occupancyOf } from './occupancy';
import { drawPowerLines, drawUtilities, kyodokoTiles, infraKey, pipeReach, pipeOverlay } from './infra'; // v87
import { makeTrains, TRAIN_PART as TK_PART, FAMS, CAR_DIM, famColor, type TrainFam } from './trainkit'; // v88
/** 列車 1 編成の走り（v88：速さ v・止まる位置 stopAt・ドア・車種 fam） */
type Tr = { path: number; dir: 1 | -1; d: number; trail: number[]; wait: number; stopped: number; v: number; stopAt: number; stopSt: number; door: number; fam: TrainFam };
import { makeVeh, makeTrain, makeWork, VEH_MODELS, WORK_MODELS, WORK_HL, carColor, TRAIN_PART } from './vehgen';
import VEH from '../assets/vehicles.json';
import CLOUDS from '../assets/clouds.json';
import VEH2 from '../assets/vehicles2.json';
const VM2 = VEH2 as unknown as Record<'coach' | 'loco' | 'express', CarMesh>;
const VM = VEH as unknown as Record<'bus' | 'truck' | 'shin_mid' | 'shin_nose' | 'pole' | 'vending' | 'postbox', CarMesh>;
import { lmPad, carMesh, CAR_PART, carKindOf, type CarMesh, MODEL, MODEL_H, modelConstruction, modelScaffold, makeSignCanvas, rng, tree, sign, DETAIL, type Ctx } from './models';
import { W, H, TILE, DEFS, isRes, isShop, isCity, fam, floodRisk, getMap, heightAt, idx, inMap, hash, buildable, GATEWAYS, roadInfo, REAL, LOT_KINDS, railBlocks, onMapChange, MAP_ID, mapEntry, baseEntry, ropewayTop, blockOf, altitude, tsunamiDepth, designWave, seaDist, terrainOf, landPrices, routeCarK, isleOX, isleOY, extWater, EXT_PONDS, FIC_V87_W } from '../sim/index';
import { realTerrain, realStatic, realRoads, realPaths, drawRealTile, drawRealGround, drawRealStation, drawRealLot, drawRealStore, looksBuiltUp, REAL_CHUNK } from './real';
import type { GameState, Building, Kind, Layer, MapDef } from '../sim/index';
import { stationStats } from '../sim/index';
import { makeShore, buildShoreWater, seaColors } from './shore';
import { warpTile, field, clipPoly } from './soft';
import { FIC_PREV_W } from '../sim/config';
import { grade, flyPiers, flySupports, FLY_FILL_CLR, FLY_H, FLY_RAMP, OVP_H, OVP_RAMP } from '../sim/grade'; // v94：立体の道路の形（sim と同じ答え）
/** v93：架空の街の空き地は（v92 の広い地図では 76×68 の内も）、地形の見た目の印（田んぼ・畑・草地・林・空き地のまとまり）で描く。区画ごとの乱数で田畑・草地を選ぶと、上空から市松模様に見えた。印がなければ -1 */
const extLook = (m: MapDef, x: number, y: number): number => (!REAL && m.deco && W > FIC_PREV_W && terrainOf(m.seed).id !== 'castaway' ? m.deco[idx(x, y)] : -1);
import { DISTRICTS } from '../sim/types';
import { residentPlan, profileOf, shortWho, stationFlow, isHoliday, RM_WALK, RM_BIKE, RM_BUS, RM_CAR, type Plan, type RTrip } from './residents'; // v98
import { incInterval, hourRate, pickInc, incSeverity, incUnits, incText, incFollowText, IncidentFeed, FATAL_P, POLICE_BASE, KOBAN, FIRE_BASE, FUNERAL, type IncidentEvent, type IncKind, type IncSub, type Unit } from './incidents';
import { emPlan, roadRoute, roadNear, emSite, nearestBase, jamLook, stationLook, isRightTurn, EM_VM, EM_BASE, HOSPITALS, type EmKind } from './traffic';

let N = 0, MAPW = 0, MAPH = 0;
const HW = [0, 2.5, 5, 7.5];   // 車道の半幅（m）
export type Quality = 'high' | 'mid' | 'low';

const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** 2 つの色の間（v86：道路の老朽度でアスファルトの色を変える） */
const mixHex = (a: number, b: number, t: number) => { const f = (k: number) => Math.round(((a >> k) & 255) * (1 - t) + ((b >> k) & 255) * t); return (f(16) << 16) | (f(8) << 8) | f(0); };

let stateIds = new WeakMap<object, number>(), nextStateId = 1;
const sid = (s: object) => { let i = stateIds.get(s); if (!i) { i = nextStateId++; stateIds.set(s, i); } return i; };

/** 歩く人の状態：見た目・歩きの位相・連れ（lead は先を歩く人の番号）・信号待ち・建物への出入り */
interface Walk { L?: Look; ph?: number; mv?: number; lead?: number; side?: number; wait?: boolean; enter?: number; exit?: number }
interface Agent extends Walk { vm?: number; vc?: number; v?: number; cur: number; next: number; prev: number; t: number; speed: number; lane: number; yaw: number; bob: number; kind?: number; /** 次の次の区画（曲がる向きを前もって決めて、交差点をなめらかに曲がる） */ nn?: number }
/** v86：車体の色（インスタンスの色）を、頂点が真っ白（面の種類 0）のところだけに掛ける。前照灯・ホイール・白い部品に車体色が移らない */
/** v88：車のガラスの頂点色：横向きの窓は青灰、上を向く（傾いた）窓ほど空の明るい水色 */
const skyGlass = (g: THREE.BufferGeometry) => { const n = g.getAttribute('normal'), c = new Float32Array(n.count * 3); for (let i = 0; i < n.count; i++) { const u = Math.max(0, n.getY(i)), k = u * u; c[i * 3] = 0.3 + 0.36 * k; c[i * 3 + 1] = 0.39 + 0.37 * k; c[i * 3 + 2] = 0.47 + 0.35 * k; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g; };
const tint0 = (m: THREE.MeshStandardMaterial) => { m.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('vColor.rgb *= instanceColor.rgb;', 'vColor.rgb *= (min(color.r, min(color.g, color.b)) > 0.999 ? instanceColor.rgb : vec3(1.0));'); }; m.customProgramCacheKey = () => 'veh-tint0'; return m; };
/** 実在都市版の車・人：実際の道路の折れ線の上を行き来する */
/** v87：出動中の緊急車両。r は道路の区画の経路（i 番目にいる）、legs はこの後の行き先（現場→病院・拠点）。lit は赤色灯とサイレン */
/** v95：描画の中のできごと（事故・火災・違反） */
interface Inc { id: number; sub: IncSub; kind: IncKind; sev: number; tile: number; x: number; z: number; age: number; cars: Agent[]; victim: number[] | null; cones: boolean; officers: number[]; fire: number; fy: number; fatal: boolean; place: string; open: number; tag: boolean; end: number; /** v98：けが人（住民）の紹介。搬送の知らせと、倒れた人を押したときに出す */ hurt?: string; hurtShort?: string }
interface Em { k: EmKind; r: number[]; i: number; lit: boolean; stay: number; at: boolean; legs: number[]; wait: number; sx: number; sz: number; sir: number; h: boolean; /** v95：着いた・次へ向かう・帰り着いたときに呼ぶ（事故の連鎖） */ cb?: (ev: 'at' | 'leg' | 'done', a: Agent) => void; /** v95：true の間は現場にとどまる */ hold?: () => boolean }
/** v87：駅の人だかり（ホーム・改札前の行列・駅前広場にあふれる人・降りて改札へ向かう人）の上限 */
const CROWD_N = 1100;
interface PathAgent extends Walk { vm?: number; vc?: number; v?: number; p: number; d: number; dir: number; speed: number; lane: number; yaw: number; bob: number; kind?: number }
/** 車の種類ごとの大きさ（乗用車・バス・トラック）と色 */
/** 3 自動運転タクシー（白と青緑）・4 自動運転バス */
const VEH_S = [[1, 1, 1], [1.4, 1.9, 2.7], [1.3, 1.75, 1.9], [1, 1.12, 1.02], [1.4, 1.85, 2.4]];
/** 走る車の大きさ（v83）：0 乗用車 1 路線バス 2 トラック 3 タクシー 4 観光バス。バスは幅 2.5m・長さ 10.5m の大型のままだと、
 *  幅 5m の生活道路で車線いっぱいになり対向車と重なって見えたので、中型（幅 2.0m・長さ 8.4m）にする */
const VEH_K = [1, 0.8, 0.88, 1, 0.84];
/** 車の長さの半分（m）：前の車との間を空けるのに使う */
const VEH_HL = [2.2, 5.3 * 0.8, 3.6 * 0.88, 2.2, 5.3 * 0.84];
const VEH_C = [0, 0x2f8a5a, 0xf2f2ee, 0x2fc4b2, 0xdff4f1];
/** v86：車の形（vehM の番号。VEH_MODELS の並びのあとに 17 路線バス・18 大型トラック・19 観光バス）ごとの大きさと、長さの半分（m） */
const VT_K = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.8, 0.88, 0.84, ...WORK_HL.map(() => 1)];
const VT_HL = [2.2, 1.8, 2.35, 2.0, 2.3, 2.3, 2.2, 1.8, 2.45, 2.3, 2.3, 2.5, 3.8, 3.2, 3.5, 0.9, 0.85, 5.3 * 0.8, 3.6 * 0.88, 5.3 * 0.84, ...WORK_HL];
/** v88：働く車と二輪の形の番号（20 番から。vehgen.ts の WORK_MODELS の順） */
const WV = (n: typeof WORK_MODELS[number]) => 20 + WORK_MODELS.indexOf(n);
/** 古さの段階：0 新しい・1 古い（市の施設は老朽度 70 超、民間は築 40 年超）・2 とても古い（老朽度 90 超か停止中、築 60 年超） */
function oldLevel(s: GameState, b: Building): number {
  if (b.status === 'construction') return 0;
  if (isCity(b.kind)) return b.status === 'suspended' || b.age > 90 ? 2 : b.age > 70 ? 1 : 0;
  const y = (s.month - (b.builtMonth ?? s.month)) / 12;
  return y > 60 ? 2 : y > 40 ? 1 : 0;
}
/** 季節と天気：桜・紅葉・冬枯れ・積雪・ぬれた地面（建物・地面・道路の色にシェーダーで反映） */
export const SEASON_U = { uSakura: { value: 0 }, uAutumn: { value: 0 }, uWinter: { value: 0 }, uSnow: { value: 0 }, uWet: { value: 0 }, uWind: { value: 1 }, uTime: { value: 0 }, uLandSz: { value: new THREE.Vector2(1, 1) } };
/** 素材の細かなむら：ワールド座標の値ノイズで色を少しずつ変える（近くで見るほど効き、遠くでは消える）。壁・屋根・地面がのっぺりしないように */
/** 建物の外壁・屋上・瓦屋根の模様（面の種類 surf と、区画の建物の種類で描き分ける）。細かい凹凸は法線を少し曲げて出す */
const BODY_GLSL = `#include <normal_fragment_maps>
if (vSurf > 0.5) { float dd = length(vViewPosition), fd = 1.0 - smoothstep(60.0, 420.0, dd);
  if (fd > 0.0) {
  vec3 wn = normalize(vWNor); vec4 P = profAt(vWPos); float pr = floor(P.r * 255.0 + 0.5), yy = vWPos.y - (P.g * 255.0 / 3.0 - 20.0);
  float hz = vWPos.x * abs(wn.z) + vWPos.z * abs(wn.x), tint = 1.0, rough = roughnessFactor;
  if (vSurf < 1.5 || vSurf > 3.5) {
    if (vSurf > 3.5) { float mt = floor(vSurf + 0.5);                                                                          // 外壁の素材（v86。geo.ts の wallMat）
      if (mt < 4.5) { float rw = floor(yy / 0.455), of = mod(rw, 2.0) * 0.5; tint = 1.0 - 0.13 * max(lnAA(yy / 0.455, 0.035), lnAA(hz / 0.91 + of, 0.02)) + 0.08 * (dh3(vec3(floor(hz / 0.91 + of), rw, 4.0)) - 0.5); } // 窯業サイディング：ずらした目地と、板ごとの色むら
      else if (mt < 5.5) { tint = 1.0 - 0.13 * lnAA(hz / 0.36, 0.05) + 0.05 * lnAA(hz / 0.36 + 0.5, 0.03); rough = 0.36; }            // ガルバリウム鋼板：縦はぜの筋
      else if (mt < 6.5) { float rw = floor(yy / 0.12), of = mod(rw, 2.0) * 0.5; tint = 1.0 - 0.12 * max(lnAA(yy / 0.12, 0.1), lnAA(hz / 0.24 + of, 0.05)) + 0.12 * (dh3(vec3(floor(hz / 0.24 + of), rw, 6.0)) - 0.5); rough = 0.62; } // 磁器タイル：細かい目地と焼きむら
      else if (mt < 7.5) { vec2 q = vec2(hz / 1.82, yy / 0.91), sp = (fract(q * vec2(3.0, 2.0)) - 0.5) * vec2(0.607, 0.455); float cw = smoothstep(0.3, 0.08, fwidth(q.x * 3.0));
        tint = 1.0 - 0.08 * max(lnAA(q.x, 0.012), lnAA(q.y, 0.02)) - 0.22 * cw * (1.0 - smoothstep(0.035, 0.055, length(sp))) + 0.07 * (dh3(floor(vec3(q, 7.0))) - 0.5) + 0.05 * (dvn(vWPos * 1.7) - 0.5); rough = 0.8; } // 打放し：型枠の目地・セパ穴・板ごとの色
      else if (mt < 8.5) { tint = 0.95 + 0.09 * dvn(vWPos * 2.6) + 0.05 * dvn(vWPos * 9.0) - 0.05; rough = 0.95; }                // 塗り壁：こてむら
      else if (mt < 9.5) tint = 1.0 - 0.09 * lnAA(yy / 0.4, 0.09);                                                            // 横張りのサイディング
      else { float rw = floor(yy / 0.21); tint = 1.0 - 0.2 * lnAA(yy / 0.21, 0.08) + 0.14 * (dh3(vec3(rw, floor(hz / 3.6), 10.0)) - 0.5) + 0.06 * (dvn(vec3(hz * 0.9, yy * 14.0, 1.0)) - 0.5); rough = 0.85; } // 板張り：板ごとの色と木目
    } else if (pr > 0.5 && pr < 1.5) tint = 1.0 - 0.08 * lnAA(yy / 0.4, 0.09);                                                        // 住宅：横張りのサイディングの重ね目
    else if (pr > 1.5 && pr < 2.5) { float m = max(lnAA(hz / 1.8, 0.05), lnAA((yy - 0.9) / 3.4, 0.07)); tint = 1.0 - 0.14 * m; rough = 0.5; } // 会社：縦の方立てと各階の帯
    else { float jn = max(lnAA(hz / 1.8, 0.025), lnAA(yy / 0.9, 0.04)), cw = smoothstep(0.35, 0.1, fwidth(hz / 1.8));
      tint = 1.0 - 0.07 * jn + 0.05 * cw * (dh3(floor(vec3(hz / 1.8, yy / 0.9, pr))) - 0.5); }                               // コンクリート：型枠の目地と、板ごとの色むら
    tint *= 0.9 + 0.1 * smoothstep(0.0, 0.7, yy);                                                                              // 足もとの泥はね
    { float ag = P.b, st = smoothstep(0.55, 0.95, dvn(vec3(hz * 2.2, yy * 0.12, pr * 3.0))) * (0.5 + 0.5 * smoothstep(0.3, 1.0, dvn(vec3(hz * 0.35, 1.0, 7.0))));
      tint *= 1.0 - ag * (0.22 * st + 0.08);                                                                                   // 古い建物：雨だれの筋と、全体の黒ずみ
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.82, 0.92, 0.76), ag * fd * 0.6 * (1.0 - smoothstep(0.0, 1.8, yy)) * dvn(vWPos * 0.8)); } // 根もとの苔
  } else if (vSurf < 2.5) { tint = (0.92 + 0.14 * dvn(vWPos * 0.45)) * (1.0 - 0.05 * lnAA(vWPos.x / 1.1, 0.03));             // 屋上：防水シートの継ぎ目としみ
    tint *= 1.0 - P.b * 0.25 * smoothstep(0.4, 0.8, dvn(vWPos * 0.3));                                                         // 古い屋上：雨水のしみ
  } else { vec2 hd = normalize(vec2(-wn.z, wn.x) + 1e-4); float al = dot(vWPos.xz, hd), cw = smoothstep(0.4, 0.12, max(fwidth(al / 0.3), fwidth(vWPos.y / 0.15)));
    tint = (1.0 - 0.2 * lnAA(vWPos.y / 0.15, 0.18) - 0.08 * lnAA(al / 0.3, 0.12)) * (1.0 + 0.1 * cw * (dh3(floor(vec3(al / 0.3, vWPos.y / 0.15, 3.0))) - 0.5)); rough = 0.55; } // 瓦：段と山、1 枚ずつの色むら
  diffuseColor.rgb *= mix(1.0, tint, fd); roughnessFactor = mix(roughnessFactor, rough, fd); }
  { float eg = clamp(length(fwidth(normalize(vWNor))) * 1.5, 0.0, 1.0); diffuseColor.rgb *= 1.0 + 0.1 * eg * fd; } // 角の面取りの光（面と面の境目をわずかに明るく）
}`;
/** 芝・草地の模様（256 角、端がつながる）。葉の筋・株のむら・少し黄ばんだ所。明るさの倍率として使う */
let GRASS_TEX: THREE.DataTexture | null = null;
function grassTex(): THREE.DataTexture {
  if (GRASS_TEX) return GRASS_TEX;
  const S = 256, d = new Uint8Array(S * S * 4), hh = (x: number, y: number, k: number) => { const v = Math.sin(x * 12.9898 + y * 78.233 + k * 37.719) * 43758.5453; return v - Math.floor(v); };
  const vn = (x: number, y: number, f: number, k: number) => { const X = x * f / S, Y = y * f / S, xi = Math.floor(X), yi = Math.floor(Y), fx = X - xi, fy = Y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const g = (a: number, b: number) => hh(((a % f) + f) % f, ((b % f) + f) % f, k); return (g(xi, yi) * (1 - sx) + g(xi + 1, yi) * sx) * (1 - sy) + (g(xi, yi + 1) * (1 - sx) + g(xi + 1, yi + 1) * sx) * sy; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const clump = vn(x, y, 8, 1) * 0.6 + vn(x, y, 16, 2) * 0.4, blade = hh(x, Math.floor(y / 3), 3), dry = Math.max(0, vn(x, y, 4, 4) - 0.62) * 2.2;
    const l = 0.8 + 0.22 * clump + 0.12 * (blade - 0.5), o = (y * S + x) * 4;
    d[o] = Math.min(255, (l + dry * 0.25) * 180); d[o + 1] = Math.min(255, (l + dry * 0.08) * 180); d[o + 2] = Math.min(255, (l - dry * 0.15) * 180); d[o + 3] = 255;
  }
  const t = new THREE.DataTexture(d, S, S, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; t.needsUpdate = true;
  return (GRASS_TEX = t);
}
function addDetail(mat: THREE.MeshStandardMaterial, k = 1, road = false, body = false): void {
  mat.customProgramCacheKey = () => `detail-${k}-${road}-${body}-${mat.flatShading}`; // 材質ごとに係数が違うので、別のプログラムにする
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SEASON_U); if (body) Object.assign(sh.uniforms, NIGHT_UNI); if (!road) sh.uniforms.uGrassTex = { value: grassTex() };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNor;' + (body ? '\nattribute float surf; varying float vSurf; uniform float uWind; uniform float uTime;' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWNor = mat3(modelMatrix) * objectNormal;' + (body ? ' vSurf = surf;' : ''))
      .replace('#include <begin_vertex>', body ? `#include <begin_vertex>
#ifdef USE_COLOR
{ float gv = color.g - max(color.r, color.b); if (gv > 0.02 && color.g < 0.5) { vec3 wq = (modelMatrix * vec4(transformed, 1.0)).xyz; // 木の葉・草・作物は風でそよぐ（濃い緑の頂点だけ）
  float sw = sin(uTime * 1.7 + wq.x * 0.08 + wq.z * 0.06) * 0.6 + sin(uTime * 3.3 + wq.z * 0.17 + wq.y * 0.3) * 0.4; transformed.x += sw * 0.09 * uWind; transformed.z += sw * 0.06 * uWind; } }
#endif` : '#include <begin_vertex>');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>${road ? '' : '\nuniform sampler2D uGrassTex;'}
varying vec3 vWPos;
varying vec3 vWNor;
uniform float uSakura; uniform float uAutumn; uniform float uWinter; uniform float uSnow; uniform float uWet; uniform float uTime; uniform vec2 uLandSz;
float dh3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float dvn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dh3(i), dh3(i + vec3(1,0,0)), f.x), mix(dh3(i + vec3(0,1,0)), dh3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dh3(i + vec3(0,0,1)), dh3(i + vec3(1,0,1)), f.x), mix(dh3(i + vec3(0,1,1)), dh3(i + vec3(1,1,1)), f.x), f.y), f.z); }` + (body ? '\nvarying float vSurf;' + NIGHT_GLSL + '\nfloat lnAA(float x, float w) { float fw = fwidth(x), d = min(fract(x), 1.0 - fract(x)); return (1.0 - smoothstep(w - fw, w + fw, d)) * (1.0 - smoothstep(0.2, 0.45, fw)); }' : '')).replace('#include <lights_fragment_maps>', road ? '#include <lights_fragment_maps>\n  iblIrradiance *= 0.0; // 道路は空の映り込み（つや）だけ。拡散光は増やさない' : '#include <lights_fragment_maps>').replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
{ float upW = smoothstep(0.55, 0.85, normalize(vWNor).y), pud = smoothstep(0.42, 0.78, dvn(vWPos * 0.07) * 0.75 + dvn(vWPos * 0.6) * 0.25); roughnessFactor = mix(roughnessFactor, mix(0.32, 0.05, pud), uWet * upW * ${road ? '1.0' : '0.6'});
  if (uWet > 0.3 && upW > 0.5 && pud > 0.3) { vec2 q = vWPos.xz * 1.3, ci = floor(q); float ph = dh3(vec3(ci, 9.0)), tt = fract(uTime * 0.9 + ph); vec2 o = vec2(dh3(vec3(ci, 1.0)), dh3(vec3(ci, 2.0))) * 0.6 + 0.2;
    float rr = length(fract(q) - o), ring = (1.0 - smoothstep(0.0, 0.03, abs(rr - tt * 0.45))) * (1.0 - tt); diffuseColor.rgb += ring * 0.08 * uWet; roughnessFactor = max(0.02, roughnessFactor - ring * 0.2); } } // 水たまりに雨の波紋 // ぬれた面はつやが出る。くぼみには水たまり`).replace('#include <normal_fragment_maps>', body ? BODY_GLSL : '#include <normal_fragment_maps>').replace('#include <color_fragment>', `#include <color_fragment>
{ float dd = length(vViewPosition), fade = 1.0 - smoothstep(90.0, 650.0, dd);
  vec3 wn = vWNor; float ln = length(wn); wn = ln > 0.1 ? wn / ln : vec3(0.0, 1.0, 0.0);
  float m = dvn(vWPos * 0.9) * 0.5 + dvn(vWPos * 0.21) * 0.3 + dvn(vWPos * 3.1) * 0.2;   // 汚れ・色むら（3 つの大きさ）
  float sh = 1.0 + (m - 0.5) * (0.05 + 0.10 * fade) * ${k.toFixed(2)};
  sh *= 1.0 + (dvn(vWPos * 11.0) - 0.5) * 0.10 * smoothstep(45.0, 4.0, dd);                // 近くで見たときの素材の粒（コンクリート・アスファルト・芝）
  if (abs(wn.y) < 0.5 && ln > 0.1) {
    float along = vWPos.x * abs(wn.z) + vWPos.z * abs(wn.x);
    float fy = fract(vWPos.y / 3.6), joint = 1.0 - 0.07 * fade * (1.0 - smoothstep(0.0, 0.025, fy) * smoothstep(1.0, 0.975, fy)); // 階ごとの目地
    float streak = smoothstep(0.62, 0.95, dvn(vec3(along * 1.3, vWPos.y * 0.08, 0.0))) * 0.09 * fade;                                // 雨だれの筋
    sh *= joint * (1.0 - streak);
  }
  diffuseColor.rgb *= sh;
  ${road ? `if (wn.y > 0.8) { float near = smoothstep(140.0, 15.0, dd), lumR = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
    float asp = step(lumR, 0.11);                                                                                              // 暗い面＝アスファルト（白線・歩道には描かない）
    float cr = 1.0 - smoothstep(0.0, 0.012 + 0.01 * (1.0 - near), abs(dvn(vWPos * 0.32) - 0.5)) * smoothstep(0.45, 0.75, dvn(vWPos * 0.05));
    vec2 pc = floor(vWPos.xz / vec2(6.0, 9.0)); float patchK = step(0.86, dh3(vec3(pc, 3.0)));                                  // 補修の跡（色の違う四角）
    vec2 mc = floor(vWPos.xz / 17.0), mo = (mc + 0.5) * 17.0 + (vec2(dh3(vec3(mc, 1.0)), dh3(vec3(mc, 2.0))) - 0.5) * 6.0; float mh = length(vWPos.xz - mo), hasM = step(0.55, dh3(vec3(mc, 5.0)));
    float ageK = smoothstep(0.03, 0.085, lumR);                                                                                 // v86：古い（白っぽい）舗装ほどひびと補修跡が多い。新しい黒い舗装はほぼ無傷
    sh = 1.0 - asp * near * (0.32 * (0.2 + 0.8 * ageK) * (1.0 - cr) + (0.04 + 0.22 * ageK) * patchK);
    sh *= 1.0 - asp * near * hasM * (0.35 * (1.0 - smoothstep(0.32, 0.36, mh)) - 0.15 * (1.0 - smoothstep(0.24, 0.26, mh)) * step(0.5, fract(vWPos.x * 5.0 + vWPos.z * 5.0))); // マンホール（ふちと格子）
    diffuseColor.rgb *= sh; diffuseColor.rgb += asp * vec3(0.026, 0.027, 0.03); }` : ''}
  // 季節：濃い緑（木の葉・生け垣）は春に一部が桜色、秋は赤・橙・黄、冬は一部が葉を落とす。明るい緑（芝・草地）は冬に枯れ色
  vec3 cc = diffuseColor.rgb; float lum = dot(cc, vec3(0.2126, 0.7152, 0.0722));
  float green = smoothstep(0.012, 0.05, cc.g - max(cc.r, cc.b));
  float leaf = green * (1.0 - smoothstep(0.17, 0.26, lum))${body ? ' * (1.0 - step(vSurf, -1.5))' : ''}, grass = green * smoothstep(0.17, 0.26, lum); // 茶畑・稲・竹など（surf = -2）は季節で桜色や紅葉にしない
  float hv = dh3(floor(vWPos * vec3(0.13, 0.05, 0.13)) + 7.0), lk = clamp(lum / 0.09, 0.45, 1.35);
  cc = mix(cc, vec3(0.95, 0.6, 0.7) * (0.8 + 0.3 * lk), uSakura * leaf * step(0.3, hv));
  vec3 aut = hv < 0.45 ? vec3(0.62, 0.07, 0.025) : hv < 0.75 ? vec3(0.78, 0.25, 0.03) : vec3(0.78, 0.55, 0.05);
  cc = mix(cc, aut * lk, uAutumn * leaf * step(0.22, hv));
  cc = mix(cc, vec3(0.13, 0.085, 0.05) * lk, uWinter * leaf * step(0.55, hv));
  cc = mix(cc, vec3(lum * 1.15, lum * 0.98, lum * 0.62), uWinter * grass * 0.6);
  { // v78：芝・草地の色を自然に。一面の明るい黄緑をやめ、落ち着いた緑を基調に、広い範囲で濃い所・黄ばんだ所・土の見える所をつくる
    float upN = smoothstep(0.8, 0.95, wn.y) * (ln > 0.1 ? 1.0 : 0.0), big = dvn(vec3(vWPos.xz * 0.011, 2.0)) * 0.6 + dvn(vec3(vWPos.xz * 0.043, 5.0)) * 0.4, far2 = dvn(vec3(vWPos.xz * 0.0031, 9.0));
    vec3 natG = mix(mix(vec3(0.085, 0.150, 0.048), vec3(0.120, 0.185, 0.062), smoothstep(0.25, 0.6, big)), vec3(0.185, 0.195, 0.080), smoothstep(0.62, 0.9, big)); // 濃い緑 → ふつうの緑 → 黄ばんだ所
    natG = mix(natG, vec3(0.20, 0.165, 0.105), smoothstep(0.80, 0.92, dvn(vec3(vWPos.xz * 0.09, 7.0)) * 0.55 + big * 0.45) * 0.5);                                              // 土の見える所
    natG *= (0.62 + 1.25 * lum) * (0.85 + 0.3 * far2);                                                                                                                         // もとの明るさ（稲・芝・畑の差）を残す
    natG = mix(natG, vec3(0.215, 0.185, 0.105) * (0.62 + 1.25 * lum), uWinter * 0.65);                                                                                         // 冬は枯れ色
    cc = mix(cc, natG, 0.88 * grass * upN * (1.0 - uSnow)); }
${road ? '' : `${body ? '' : `  { // v78：地図の外は、田畑・草地・林のつぎはぎ（一面の緑の平面に見えないように）。遠くは平均の色へなじませる
    bool outM = vWPos.x < 0.0 || vWPos.z < 0.0 || vWPos.x > uLandSz.x || vWPos.z > uLandSz.y;
    if (outM && grass > 0.5 && wn.y > 0.9) { vec2 wq = vWPos.xz + 70.0 * vec2(dvn(vec3(vWPos.xz * 0.0045, 11.0)), dvn(vec3(vWPos.xz * 0.0045, 17.0))); float rg = dvn(vec3(vWPos.xz * 0.0011, 13.0)); // 区画の線をゆるく曲げ、地域ごとに区画の大きさと向きを変える（れんが模様に見えないように）
      if (rg > 0.52) wq = vec2(wq.x * 0.82 + wq.y * 0.57, wq.y * 0.82 - wq.x * 0.57); vec2 pq = wq / (vec2(104.0, 68.0) * (rg > 0.52 ? 1.35 : 1.0)); pq.x += floor(pq.y) * 0.37; vec2 ci = floor(pq), cf = fract(pq);
      float t = dh3(vec3(ci, 21.0)), wood = smoothstep(0.52, 0.66, dvn(vec3(vWPos.xz * 0.0017, 3.0)) * 0.75 + dvn(vec3(vWPos.xz * 0.009, 4.0)) * 0.25);
      vec3 pc = t < 0.38 ? vec3(0.36, 0.50, 0.25) : t < 0.58 ? vec3(0.46, 0.40, 0.28) : t < 0.8 ? vec3(0.30, 0.45, 0.21) : vec3(0.52, 0.52, 0.30);
      pc *= 0.88 + 0.24 * dh3(vec3(ci, 5.0));
      float fw = fwidth(pq.x) + fwidth(pq.y), edge = smoothstep(0.0, 0.03 + fw, min(min(cf.x, 1.0 - cf.x), min(cf.y, 1.0 - cf.y)));
      pc = mix(vec3(0.50, 0.48, 0.38), pc, edge);                                         // あぜ・農道
      pc = mix(pc, vec3(0.37, 0.46, 0.25), smoothstep(0.25, 1.2, fw));                      // 遠くは平均の色
      vec3 wc = vec3(0.16, 0.27, 0.15) * (0.75 + 0.5 * dvn(vec3(vWPos.xz * 0.03, 1.0)));    // 林
      cc = mix(mix(pc * 0.6, wc * 0.75, wood), vec3(lum * 0.6, lum * 0.52, lum * 0.34), uWinter * 0.45); } }
`}
  { float upG = smoothstep(0.8, 0.95, wn.y) * (ln > 0.1 ? 1.0 : 0.0), nearG = 1.0 - smoothstep(60.0, 420.0, dd); // 芝・草地の細かい模様（2 つの大きさを重ねて、くり返しを目立たせない）
    vec3 g1 = texture2D(uGrassTex, vWPos.xz / 6.5).rgb, g2 = texture2D(uGrassTex, vWPos.xz / 29.0 + 0.37).rgb;
    cc *= mix(vec3(1.0), g1 * (0.55 + 0.45 * g2) * 1.42, grass * upG * (0.35 + 0.65 * nearG) * (1.0 - smoothstep(900.0, 1600.0, dd)) * (1.0 - uSnow)); } // 遠く（900m〜）は模様を消す：遠くの山が砂利のように見え、動くとざらつくため
`}  // 積雪（上を向いた面）とぬれた地面
  float upF = smoothstep(0.55, 0.85, wn.y) * (ln > 0.1 ? 1.0 : 0.0);
  cc = mix(cc, vec3(0.86, 0.89, 0.93), uSnow * max(upF, leaf * 0.7) * ${road ? '0.55' : '0.95'});
  cc *= 1.0 - ${road ? '0.5' : '0.3'} * uWet * upF; // ぬれると色が濃くなる（道路は空を映すぶん、下地をより暗く）
  diffuseColor.rgb = cc; }`);
  };
}
/** v88：なめらかな値のむら（g 区画ごとの乱数を補間）。地面の色に使う */
/** 水面の材質（v93 のさざ波のシェーダー water-wave）。sea：頂点色で水深の色を付け、不透明に（v95） */
function waterMat(sea: boolean): THREE.MeshStandardMaterial { const m = new THREE.MeshStandardMaterial(sea ? { color: 0xffffff, vertexColors: true, roughness: 0.12, metalness: 0.25 } : { color: 0x3f7fa6, roughness: 0.12, metalness: 0.25, transparent: true, opacity: 0.9 });
    // さざ波：位置と時刻から波の傾きを作り、法線を揺らす（空や街明かりの映り込みがきらめく）
    m.onBeforeCompile = sh => { sh.uniforms.uT = NIGHT_UNI.uT;
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWq;').replace('#include <project_vertex>', '#include <project_vertex>\nvWq = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWq; uniform float uT;').replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec2 p = vWq.xz; float t = uT, dd = length(vViewPosition); vec2 g = vec2(0.0);
          float hf = 1.0 - smoothstep(40.0, 220.0, dd); // 遠くは細かい波を消す（ちらつき防止）
          for (int k = 0; k < 6; k++) { float fk = float(k), a = fk * 2.399 + 0.7, fr = 0.18 * pow(1.55, fk), am = 0.11 / (1.0 + fk * 0.9) * (k > 2 ? hf : 1.0);
            vec2 dir = vec2(cos(a), sin(a)); g += dir * cos(dot(p, dir) * fr + t * (0.8 + fk * 0.55) + sin(dot(p, dir.yx) * fr * 0.37) * 1.7) * am; }
          float fd = 1.0 - smoothstep(150.0, 900.0, dd); vec3 nw = normalize(vec3(-g.x * fd, 1.0, -g.y * fd));
          normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`); };
    m.customProgramCacheKey = () => sea ? 'water-wave-sea' : 'water-wave'; return m; }
const vnoise = (x: number, y: number, g: number, k: number) => { const gx = Math.floor(x / g), gy = Math.floor(y / g), fx = x / g - gx, fy = y / g - gy, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), q = (a: number, b: number) => hash(a, b, k);
  return (q(gx, gy) * (1 - sx) + q(gx + 1, gy) * sx) * (1 - sy) + (q(gx, gy + 1) * (1 - sx) + q(gx + 1, gy + 1) * sx) * sy; };
/** 最初にカメラを向ける場所（地図ごとの駅） */
let START = { x: 0, z: 0 };
/** はじめから区画（計算上の建物）があったタイル */
let ORIG_LOT = new Uint8Array(0);
onMapChange(() => {
  N = W * H; MAPW = W * TILE; MAPH = H * TILE; SEASON_U.uLandSz.value.set(MAPW, MAPH);
  START = REAL ? (() => {
    const R = REAL!, pre = baseEntry(MAP_ID)?.start ?? '';
    const st = (pre ? R.lots.find((l, i) => LOT_KINDS[l[0]] === 'station' && R.names[String(i)]?.startsWith(pre)) : undefined) ?? R.lots.find(l => LOT_KINDS[l[0]] === 'station');
    return st ? { x: (st[1] + 1.5) * TILE, z: (st[2] + 0.5) * TILE } : { x: W * TILE / 2, z: H * TILE / 2 };
  })() : { x: 21.5 * TILE, z: 11 * TILE };
  ORIG_LOT = new Uint8Array(W * H);
  if (REAL) for (const [k, x, y, , rot] of REAL.lots) { if (rot) continue; const d = DEFS[LOT_KINDS[k] as Kind]; for (let dy = 0; dy < d.h; dy++) for (let dx = 0; dx < d.w; dx++) if (inMap(x + dx, y + dy)) ORIG_LOT[idx(x + dx, y + dy)] = 1; }
});

/** 地図レイヤー：住宅の水準の番号（sv。-1 は満足度）と、関係する施設の種類 */
const LAYER_SV: Partial<Record<Layer, [number, string[]]>> = {
  life: [6, ['water', 'sewage', 'waste', 'power', 'gas']], edu: [1, ['school', 'jhs', 'high', 'library']], health: [7, ['health']], safety: [8, ['safety']],
  env: [9, []], culture: [10, ['culture', 'library']], welfare: [11, ['welfare']], disaster: [3, ['fire', 'shelter', 'basin']], sat: [-1, []],
};
export class View {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(42, 1, 2, 12000);
  getState: () => GameState;
  map: MapDef;
  quality: Quality = 'high';

  // カメラ
  mode: 'orbit' | 'ground' = 'orbit';
  target = new THREE.Vector3(START.x, 0, START.z);
  dist = REAL ? 900 : 620; yaw = 0.55; pitch = 0.72;
  want = { x: START.x, z: START.z, dist: REAL ? 900 : 620, yaw: 0.55, pitch: 0.72 };
  ground = { x: START.x, z: REAL ? START.z + 40 : 4.5 * TILE, yaw: Math.PI, pitch: 0 };
  fov = 42;
  keys = new Set<string>();

  // 時刻（見た目だけ。経営の月とは独立）
  hour = 14.6; clockRun = true; dayLength = 240; // 実時間 240 秒で 1 日（はじめから時計が進み、朝・昼・夕・夜がめぐる）

  layer: Layer = 'none';
  showZones = false;
  showArea = false; // 線引き（調整区域・居住誘導区域）を塗る
  stats = { fps: 0, calls: 0, tris: 0, buildings: 0, cars: 0, peds: 0, buildMs: 0 };

  private sun = new THREE.DirectionalLight(0xffffff, 3);
  private hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6b7a55, 1);
  private matBody = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0 });
  private matTerrain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
  private matRoad = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  private matWinA = (() => { const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.15, emissive: 0xffd08a, emissiveIntensity: 0 });
    // 夜の窓：部屋ごとに点いたり消えたりする（建物の中の位置から決まる）。色も電球色と白い LED が混ざる
    m.onBeforeCompile = sh => { Object.assign(sh.uniforms, NIGHT_UNI);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; attribute vec2 wid; varying vec2 vWid;').replace('#include <project_vertex>', '#include <project_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWid = wid;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; varying vec2 vWid;' + NIGHT_GLSL + ROOM_GLSL).replace('#include <color_fragment>', `#include <color_fragment>
        vec4 RM = room(vWP); if (RM.a > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, RM.rgb * 0.42, 0.38); // 昼：ガラスの奥にうっすら部屋が見える`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        vec4 P = profAt(vWP); float pr = floor(P.r * 255.0 + 0.5), gy = P.g * 255.0 / 3.0 - 20.0, yy = vWP.y - gy;
        float r;
        if (vWid.x >= 1.0) { yy = vWid.y - gy; r = pr > 1.5 && pr < 2.5 ? 0.6 * hsh3(vec3(floor(yy / 3.4), gy, 3.0)) + 0.4 * (vWid.x - 1.0) : vWid.x - 1.0; } // 窓 1 枚ごと（会社はフロアごと）
        else r = hsh3(pr > 1.5 && pr < 2.5 ? floor(vec3(vWP.x / 9.0, yy / 3.4, vWP.z / 9.0)) : floor(vec3(vWP.x / 3.6, yy / 3.4, vWP.z / 3.6)));
        totalEmissiveRadiance *= step(r, litP(pr, uHour, step(yy, 4.2)) * 1.6) * litC(pr, fract(r * 7.3)) * 1.25;
        if (RM.a > 0.5) totalEmissiveRadiance *= RM.rgb * RM.rgb * 1.1; // 夜：明かりのついた部屋の天井・壁・床・家具の影`); };
    m.customProgramCacheKey = () => 'win-rooms4'; return m; })();
  private matWinB = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.15 });
  private matSign!: THREE.MeshStandardMaterial;
  private matOverlay = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false });
  private matCursor = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false, depthTest: false });
  private matHelp = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, depthTest: false });
  private matGhost = new THREE.MeshLambertMaterial({ vertexColors: true, transparent: true, opacity: 0.6, depthWrite: false });
  private matWater = waterMat(false);
  /** v95：地図の中の岸を曲線で描く水面と、地図の外の海の板（頂点色で水深の色。不透明にして、水の下の地面の網の明暗が区画ごとのまだらに透けないように） */
  private matSea = waterMat(true);
  private matCloud = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false, transparent: true, opacity: 0.92 });
  /** 自販機の明かり（夜だけ。青白い光の粒） */
  private matVend = new THREE.PointsMaterial({ color: 0xdff0ff, size: 3.2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }); private vends: THREE.Points | null = null;
  private matLamp = new THREE.PointsMaterial({ color: 0xffe2a8, size: 7, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private matTail = new THREE.PointsMaterial({ color: 0xffffff, vertexColors: true, size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private matHead = new THREE.PointsMaterial({ color: 0xfff1d0, size: 5, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private matStars = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });

  private matPool = new THREE.MeshBasicMaterial({ color: 0xffd39a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, fog: false });
  private pools: THREE.Mesh | null = null;
  private terrain!: THREE.Mesh;
  private sky!: THREE.Mesh;
  private sunDisc!: THREE.Mesh;
  private clouds!: THREE.Mesh;
  private stars!: THREE.Points;
  private train!: THREE.Group;
  private groups: Record<string, THREE.Mesh[]> = { town: [], sites: [], roads: [], overlay: [], cursor: [], ghost: [], help: [] };
  private lamps: THREE.Points | null = null;
  private sigTown = ''; private sigRoad = ''; private sigSites = ''; private sigOverlay = '';
  private cars: Agent[] = []; private peds: Agent[] = [];
  /** v87：出動中の緊急車両（cars の後ろに並べる）・次の通報までの秒数・巡回のパトカーの割合・前のコマの緊急車両の位置（x, z） */
  private ems: Agent[] = []; private emT = 20; private patrolP = 0.008; private emPos: number[] = [];
  /** v86：車の形ごとの描画（車体と窓）。番号は VT（乗用車 9 種・タクシー・パトカー・救急車・消防車・2t 箱車・ごみ収集車・スクーター・自転車・バス・トラック・観光バス）。毎コマ、形ごとに詰めて置く */
  private vehM: { body: THREE.InstancedMesh; cab: THREE.InstancedMesh | null }[] = []; private vehN: number[] = []; private vehWn = 0; private pedP!: People; private pedAttract: Float32Array | null = null; private pedW: number[] = []; private pedList: number[] = [];
  private headPts!: THREE.Points; private tailPts!: THREE.Points;
  private crowdP!: People; private crowdKey = ''; private crowdLooks: Look[] = []; private gateArms!: THREE.InstancedMesh;
  /** 駅ごとのホームの人の多さ（列車が出た直後は少なく、だんだん増える） */
  private stFill = new Map<number, number>();
  /** 列車が近くにいて遮断機が下りている踏切の区画 */
  private crossClosed = new Set<number>();
  private agentSpawnAt = { x: -1e9, z: -1e9, h: -1 };
  private roadTiles: number[] = []; private roadW: number[] = []; private pedTiles: number[] = [];
  private ray = new THREE.Raycaster();
  private tmpM = new THREE.Matrix4(); private tmpQ = new THREE.Quaternion(); private tmpV = new THREE.Vector3(); private tmpS = new THREE.Vector3(1, 1, 1);
  private night = 0;
  /** Blender で作った名所の glb（render/landmarks.ts） */
  landmarks: Landmarks | null = null;
  /** 天気（0〜1）と、いまの天気の名前。weatherForce で固定できる（検証・写真用） */
  weather = { rain: 0, snow: 0, cloud: 0.12, kind: '晴れ' };
  weatherForce: '' | 'clear' | 'cloudy' | 'rain' | 'snow' | 'fog' | 'storm' = '';
  /** v31：朝霧の日・雷雨の日・虹の残り秒 */
  private fogDay = false; private storm = false; private rainbowT = 0; private wasRain = false; private flashT = 0; private rainbow: THREE.Group | null = null;
  private dayNo = 0; private prevHour = 14.6; private wT = { rain: 0, snow: 0, cloud: 0.12 }; private wKey = '';
  private rainLines!: THREE.LineSegments; private snowPts!: THREE.Points; private pOff = new Float32Array(0); private pT = 0;
  private fogBase = { near: 900, far: 5200 }; private calM = 7;
  private frames = 0; private fpsT = 0;
  private trainX = -900; private trainWait = 0;

  constructor(canvas: HTMLCanvasElement, getState: () => GameState) {
    this.getState = getState;
    this.map = getMap(getState().seed);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // シェーダーの細かな警告（環境によって出る、動きには関係ないもの）をコンソールに出さない。調べるときは #debug で
    this.renderer.debug.checkShaderErrors = /debug/.test(location.hash);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap; // three 0.18x で PCFSoftShadowMap は廃止（指定しても PCFShadowMap になり、警告が出る）
    addDetail(this.matBody, 1, false, true); addDetail(this.matTerrain, 0.7); addDetail(this.matRoad, 1.1, true);
    this.renderer.info.autoReset = false; // 画面の陰影（複数のパス）を使うときも 1 フレームの合計を数える
    this.scene.fog = new THREE.Fog(0xbfdcf0, 900, 5200);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target, this.hemi);
    this.fx = new FX(this.scene);
    if (!REAL) { this.landmarks = new Landmarks(this.scene, () => { RAIL_LM.station = !!this.landmarks?.has('station'); this.chunkSig.clear(); this.sigTown = ''; this.sigRoad = ''; }); this.landmarks.load(); }
    const tex = new THREE.CanvasTexture(makeSignCanvas());
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; this.signTex = tex;
    this.matSign = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7 });
    const gc = document.createElement('canvas'); gc.width = gc.height = 64;
    const gx = gc.getContext('2d')!, gr = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    gx.fillStyle = gr; gx.fillRect(0, 0, 64, 64);
    const glow = new THREE.CanvasTexture(gc);
    this.matLamp.map = glow; this.matVend.map = glow; this.matHead.map = glow; this.matTail.map = glow; this.matPool.map = glow;
    if (REAL) {
      // 頂点が多いので法線を持たせず、面の向きは描画時に計算する（GPU のメモリを約半分に）
      for (const mm of [this.matBody, this.matWinA, this.matWinB, this.matSign, this.matRoad]) mm.flatShading = true;
      this.matRoad.side = THREE.DoubleSide; this.matWater.side = THREE.DoubleSide;
    }
    this.buildTerrain(); this.buildStatic(); this.buildSky(); this.buildAgents(); this.buildPrecip();
    // スマホ・タブレットはメモリが少ないので「中」から始める。前回 GPU のメモリ不足で止まったときは「低」から
    let safe = false; try { safe = localStorage.getItem('sumu-safe') === '1'; } catch { /* 保存できない環境 */ }
    const mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.setQuality(safe ? 'low' : mobile ? 'mid' : 'high');
    canvas.addEventListener('webglcontextlost', e => {
      e.preventDefault();
      try { localStorage.setItem('sumu-safe', '1'); } catch { /* 保存できない環境 */ }
      const b = (window as unknown as { __sumuBootShow?: (m: string) => void }).__sumuBootShow;
      if (b) b('端末の描画メモリが足りなくなり、3D の表示が止まりました。ページを再読み込みすると、描画の品質「低」で起動します。');
    });
    this.applyTime();
  }

  private signTex!: THREE.CanvasTexture;
  /** 文字のフォントが読み込まれたあとに看板を描き直す */
  redrawSigns(): void { this.signTex.image = makeSignCanvas(); this.signTex.needsUpdate = true; }

  // ------------------------------------------------------------ 品質
  /** 軽量表示（スマホ向け）：空き地の田畑や木立を省き、人と車の数を減らし、人と車の影を描かない。画面の解像度も控えめに */
  lite = false;
  setLite(v: boolean): void {
    this.lite = v; this.sigTown = ''; this.sigSites = ''; if (this.fx) this.fx.lite = v;
    for (const m of [...this.vehM.flatMap(x => [x.body, x.cab]), this.pedP?.mesh, this.crowdP?.mesh, this.lifeP?.mesh]) if (m) m.castShadow = !v;
    this.setQuality(this.quality);
  }
  setQuality(q: Quality): void {
    const f0 = this.fine(), h0 = this.quality === 'high'; this.quality = q; if (this.vehM.length && this.wheelN() !== this.vehWn) this.buildVeh(this.wheelN()); if (this.fine() !== f0 || (q === 'high') !== h0) { this.sigTown = ''; this.sigSites = ''; this.chunkSig.clear(); this.sigRoad = ''; } // 細部の有無が変わったら建物を作り直す（v86：高品質だけの細部もある）。v88：線路（道路と一緒の作り直し）も
    const dpr = Math.min(window.devicePixelRatio || 1, q === 'high' ? 2 : q === 'mid' ? 1.5 : 1, this.lite ? 1.25 : 9);
    this.renderer.setPixelRatio(dpr);
    const big = q === 'high' && !this.lite && !matchMedia('(pointer: coarse)').matches && this.renderer.capabilities.maxTextureSize >= 8192;
    const size = big ? 4096 : q === 'high' ? 2048 : 1024; // パソコンの高画質は影を 4 倍の細かさに
    this.sun.castShadow = q !== 'low' && !this.lite; // 軽量表示では影を描かない（スマホでは影の描画が重さの半分ほどになる）
    if (this.sun.shadow.mapSize.x !== size) { this.sun.shadow.mapSize.set(size, size); this.sun.shadow.map?.dispose(); (this.sun.shadow as any).map = null; }
    this.resize();
    this.spawnAgents();
  }
  resize(): void {
    const c = this.renderer.domElement, w = c.clientWidth || 800, h = c.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    if (this.composer) { const pr = this.renderer.getPixelRatio(); this.composer.setPixelRatio(pr); this.composer.setSize(w, h); }
  }
  /** 地上視点（品質「高」）：画面の陰影（GTAO）で、建物の角や軒下・壁の根元に柔らかな影を付ける */
  private composer: EffectComposer | null = null;
  private pp: { ao: GTAOPass; bloom: UnrealBloomPass; bokeh: BokehPass; grade: ShaderPass; atmo: ShaderPass; aoR: number } | null = null;
  /** 仕上げの効果を使うか：高品質はすべて、中品質（スマホ以外）は色の仕上げと輪郭のなめらかさだけ */
  private usePost(): boolean { return !REAL || this.quality === 'high' ? (this.quality === 'high' || (this.quality === 'mid' && !this.lite)) : false; }
  // v82：実在マップでは陰影（AO）を掛けない。実在マップの建物は軽くするため法線を持たない形（geo.build(true)）で、
  // AO が向きを読めず、建物が広い範囲で真っ黒につぶれていた
  private useAO(): boolean { return this.quality === 'high' && !this.lite && !REAL; }
  /** 写真モードの背景ぼかし（ピントは注視点） */
  dof = false;
  private ensureComposer(): EffectComposer {
    if (!this.composer) {
      const c = this.renderer.domElement, w = c.clientWidth || 800, h = c.clientHeight || 600;
      // 輪郭のなめらかさは、描く先の重ね塗り（MSAA 4 回）で。FXAA は一部の環境でシェーダーの警告が出るため使わない
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 2 });
      const comp = new EffectComposer(this.renderer, rt); comp.setPixelRatio(this.renderer.getPixelRatio()); comp.setSize(w, h);
      comp.addPass(new RenderPass(this.scene, this.camera));
      const ao = new GTAOPass(this.scene, this.camera, w, h); ao.updateGtaoMaterial({ radius: 2.4, distanceExponent: 1.2, thickness: 2.0, scale: 1.0, samples: 12 }); ao.blendIntensity = 1.0;
      // v80：遠く（600m〜）は陰影を掛けない。奥行きの精度が足りず、遠くの山の斜面が一面に暗くなり、尾根だけが白い筋になって残っていた
      { const gm = (ao as unknown as { gtaoMaterial: THREE.ShaderMaterial }).gtaoMaterial; if (gm.fragmentShader.includes('ao = pow(ao, scale);')) { gm.fragmentShader = gm.fragmentShader.replace('ao = pow(ao, scale);', 'ao = pow(ao, scale); ao = mix(ao, 1.0, smoothstep(600.0, 1400.0, -viewPos.z));'); gm.needsUpdate = true; } }
      // 歩く人は形をシェーダーで動かすので、陰影（AO）用の描き分けからは外す（外さないと、動かす前の形の影が残る）
      { const o = ao as unknown as { _overrideVisibility: () => void; _visibilityCache: THREE.Object3D[] }, base = o._overrideVisibility.bind(ao);
        o._overrideVisibility = () => { base(); for (const P of [this.pedP, this.crowdP, this.lifeP]) if (P && P.mesh.visible) { P.mesh.visible = false; o._visibilityCache.push(P.mesh); } }; }
      const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.7, 0.55, 0.62);
      const bokeh = new BokehPass(this.scene, this.camera, { focus: 600, aperture: 0.00012, maxblur: 0.008 });
      const grade = new ShaderPass(GRADE_SHADER), atmo = new ShaderPass(ATMO_SHADER);
      comp.addPass(ao); comp.addPass(atmo); comp.addPass(bloom); comp.addPass(bokeh); comp.addPass(new OutputPass()); comp.addPass(grade);
      this.composer = comp; this.pp = { ao, bloom, bokeh, grade, atmo, aoR: 2.4 };
    }
    // その場の設定：陰影の届く範囲はカメラの遠さに合わせる。光のにじみは夜。背景ぼかしは写真モード
    const P = this.pp!, pr = this.renderer.getPixelRatio(), el = this.renderer.domElement;
    P.ao.enabled = this.useAO(); if (P.ao.enabled) { const r = this.mode === 'ground' ? 3.2 : Math.max(4, Math.min(22, this.dist * 0.022)); if (Math.abs(r - P.aoR) / P.aoR > 0.15) { P.ao.updateGtaoMaterial({ radius: r, thickness: r * 1.1, scale: 1.25 }); P.aoR = r; } P.ao.blendIntensity = this.mode === 'ground' ? 1.15 : 1.35; }
    // 光のにじみ：夜は窓やネオン、昼は強い照り返し（ガラス・水面）だけがにじむ
    P.bloom.enabled = this.quality === 'high' && !this.lite; P.bloom.strength = 0.16 + 0.6 * this.night; P.bloom.threshold = lerp(0.9, 0.6, this.night); P.bloom.radius = lerp(0.35, 0.55, this.night);
    // 大気：陰影（AO）の深度を使うので、AO があるときだけ。朝霧・雨・雪は低い所に濃く、晴れた昼は遠くが青く霞む程度
    P.atmo.enabled = P.ao.enabled && !REAL;
    if (P.atmo.enabled) { const u = P.atmo.material.uniforms as any, mist = this.fogDay ? 1 : 0, wet = Math.max(this.weather.rain, this.weather.snow);
      u.tDepth.value = (P.ao as any).depthTexture; u.uInvProj.value.copy(this.camera.projectionMatrixInverse); u.uCamWorld.value.copy(this.camera.matrixWorld); u.uCam.value.copy(this.camera.position);
      u.uFogCol.value.copy((this.scene.fog as THREE.Fog).color); u.uSunCol.value.copy(this.sun.color).multiplyScalar(Math.min(1, this.sun.intensity / 3.4)); u.uSunDir.value.copy(this.sun.position).sub(this.sun.target.position).normalize();
      u.uSunK.value = (1 - this.night) * (1 - 0.8 * wet) * (this.sun.position.y > this.sun.target.position.y ? 1 : 0);
      u.uDensity.value = 0.00028 + 0.0012 * mist + 0.0004 * wet - 0.00012 * this.night; u.uFalloff.value = mist ? 0.02 : 0.004; u.uGround.value = this.target.y; }
    P.bokeh.enabled = this.dof; if (this.dof) { (P.bokeh.uniforms as any).focus.value = this.camera.position.distanceTo(this.target); }
    void pr; void el;
    this.gradeUniforms(P.grade.material.uniforms as any);
    return this.composer;
  }
  /** 時間帯の色の仕上げ：朝は青み、昼は鮮やか、夕方はオレンジ、夜は青と黄の対比。雨と雪の日は少し色を抜く */
  private gradeUniforms(u: Record<string, { value: any }>): void {
    const h = this.hour, eve = Math.max(0, 1 - Math.abs(h - 17.6) / 1.6), morn = Math.max(0, 1 - Math.abs(h - 6.4) / 1.4), n = this.night, wet = Math.max(this.weather.rain, this.weather.snow);
    u.uSat.value = 1.2 - 0.12 * n - 0.25 * wet + 0.06 * eve;
    u.uCon.value = 1.1 + 0.03 * (1 - n) - 0.06 * wet; u.uSplit.value = (1 - wet * 0.6) * (0.6 + 0.4 * n);
    u.uTint.value.set(1 + 0.08 * eve - 0.04 * morn - 0.06 * n, 1 + 0.01 * eve - 0.01 * morn - 0.02 * n, 1 - 0.07 * eve + 0.05 * morn + 0.08 * n);
    u.uVig.value = this.mode === 'ground' ? 0.3 : 0.24;
    u.uLift.value = 0.012 + 0.02 * n;
    // 季節の色：夏は鮮やかで少し暖かく、秋は琥珀、冬は青白く色を抜く、春は柔らかく明るい
    const cm = this.calM, summer = cm >= 6 && cm <= 8 ? 1 : 0, autumn = cm === 9 || cm === 10 ? 1 : 0, winter = cm === 11 || cm <= 1 ? 1 : 0, spring = cm >= 2 && cm <= 4 ? 1 : 0;
    u.uSat.value += 0.06 * summer + 0.03 * autumn - 0.07 * winter - 0.02 * spring;
    u.uTint.value.x *= 1 + 0.015 * summer + 0.03 * autumn - 0.025 * winter + 0.01 * spring; u.uTint.value.z *= 1 - 0.01 * summer - 0.035 * autumn + 0.035 * winter;
    u.uLift.value += 0.01 * spring + 0.008 * winter;
  }

  // ------------------------------------------------------------ 地形・背景
  private buildTerrain(): void {
    if (REAL) {
      const [t, o] = realTerrain(this.map, this.matTerrain);
      this.terrain = t; this.scene.add(t, o);
      return;
    }
    this.buildLand();
    // 地図の外の地面（川は東西に続く）
    const outer = new Geo(); const G = 0x6f9a54, far = 9000;
    const flat = (x0: number, z0: number, x1: number, z1: number, y: number, color: number) => outer.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], color);
    const T = terrainOf(this.map.seed).id, noSea = T === 'inland' || T === 'rural' || T === 'mountain', RY = noSea ? H - 3.4 : H - 4.8;
    const isle = T === 'island';
    // v70：地形ごとの霞（山の地形は空気が澄んで遠くの峰まで見える。海辺は少し潮霞）
    this.fogBase = T === 'mountain' || T === 'inland' ? { near: 1500, far: 8200 } : T === 'lake' ? { near: 1300, far: 7200 } : T === 'urban' ? { near: 800, far: 4800 } : { near: 1100, far: 6200 };
    if (T === 'castaway') { // v88：無人島。地図の外はすべて海（遠い北に本土の山なみだけ）
      flat(-far, -far, MAPW + far, MAPH + far, -3.4, 0x4f6658);
      const og = new THREE.PlaneGeometry(MAPW + far * 2, MAPH + far * 2); og.rotateX(-Math.PI / 2);
      const ocean = new THREE.Mesh(seaColors(og), this.matSea); ocean.position.set(MAPW / 2, -1.55, MAPH / 2); this.scene.add(ocean);
      const om = new THREE.Mesh(outer.build(), this.matTerrain); om.receiveShadow = true; this.scene.add(om);
      { const cx = (70 + isleOX()) * TILE, cz = (80 + isleOY()) * TILE; this.target.set(cx, 0, cz); this.want.x = cx; this.want.z = cz; } this.want.dist = this.dist = 1400; return; // はじめは南の入り江（上陸する所）を見る
    }
    flat(-far, -far, MAPW + far, 0, -0.02, G);
    if (isle) { flat(-far, 0, 0, 24.5 * TILE, -0.02, G); flat(-far, 24.5 * TILE, 0, RY * TILE, -3.2, 0x566b5a); flat(MAPW, 0, MAPW + far, RY * TILE, -3.2, 0x566b5a); }
    const sea = !noSea, v3s = !!this.map.surf && sea && !isle;
    // v95：v94 の海辺の地形は、地図の東西の縁で海岸が RY の行にないので、地図の外の海岸線を縁の海岸の位置から 600m かけて RY へつなぐ（縁で陸と海が食い違う直線の継ぎ目を消す）
    const edgeY = (x: number) => { if (!v3s) return RY; let y = H - 1; while (y > 0 && this.map.sea?.[idx(x, y)]) y--; return y >= H - 1 ? RY : y + 1; };
    const yE = [edgeY(0), edgeY(W - 1)], D = 600;
    if (!isle) for (const sd of [0, 1]) { const xs = sd === 0 ? [-far, -D, -D * 0.75, -D * 0.5, -D * 0.25, 0] : [MAPW, MAPW + D * 0.25, MAPW + D * 0.5, MAPW + D * 0.75, MAPW + D, MAPW + far];
      const zc = (xw: number) => { const t = Math.min(1, (sd === 0 ? -xw : xw - MAPW) / D), k = t * t * (3 - 2 * t); return (yE[sd] + (RY - yE[sd]) * k) * TILE; };
      for (let k = 0; k + 1 < xs.length; k++) { const a = xs[k], b = xs[k + 1], za = zc(a), zb = zc(b), T1 = 1.6 * TILE;
        outer.quad([a, -0.02, za], [b, -0.02, zb], [b, -0.02, 0], [a, -0.02, 0], G);
        outer.quad([a, -1.4, za + T1], [b, -1.4, zb + T1], [b, -1.4, zb], [a, -1.4, za], 0xa9a07f);
        outer.quad([a, -3.2, MAPH + 60], [b, -3.2, MAPH + 60], [b, -3.2, zb + T1], [a, -3.2, za + T1], 0x566b5a); } } // v70：海のある地形は、南の水面を水平線まで広げる（前は 60m 先から陸地で、川のように見えていた）
    if (!sea) flat(-far, MAPH + 60, MAPW + far, MAPH + far, -0.02, 0x6f9652);
    else flat(-far, MAPH + 60, MAPW + far, MAPH + far, -3.4, 0x4f6658);
    if (isle) for (const [x0, x1] of [[-far, 0], [MAPW, MAPW + far]]) { flat(x0, RY * TILE, x1, (RY + 1.6) * TILE, -1.4, 0xa9a07f); flat(x0, (RY + 1.6) * TILE, x1, MAPH + 60, -3.2, 0x566b5a); }
    if (isle) { // 島：東と南西の外も海
      const sg = new THREE.PlaneGeometry(far, RY * TILE + 40); sg.rotateX(-Math.PI / 2);
      const e = new THREE.Mesh(seaColors(sg), this.matSea); e.position.set(MAPW + far / 2 - 20, -1.62, RY * TILE / 2 - 20); this.scene.add(e);
      const wg2 = new THREE.PlaneGeometry(far, (RY - 24.5) * TILE + 20); wg2.rotateX(-Math.PI / 2);
      const w2 = new THREE.Mesh(seaColors(wg2), this.matSea); w2.position.set(-far / 2 + 20, -1.62, (24.5 + RY) / 2 * TILE); this.scene.add(w2);
    }
    const om = new THREE.Mesh(outer.build(), this.matTerrain); om.receiveShadow = true; this.scene.add(om);
    // v94 の地形：地図の中の海・川は区画ごとに岸を曲線で描くので、大きな水面は地図の南の縁から外だけ（東西の外の川の帯はそのまま）
    const v3 = !!this.map.surf, z0w = v3 ? MAPH : (RY - 0.2) * TILE;
    if (v3) for (const [sd, x0, x1] of [[0, -far, 0], [1, MAPW, MAPW + far]]) { const zs = (Math.min(RY, yE[sd]) - 0.2) * TILE, sg2 = new THREE.PlaneGeometry(x1 - x0, MAPH - zs); sg2.rotateX(-Math.PI / 2); const s2 = new THREE.Mesh(seaColors(sg2), this.matSea); s2.position.set((x0 + x1) / 2, -1.55, (zs + MAPH) / 2); this.scene.add(s2); }
    if (v3 && !sea) { const lg = new Geo(); lg.quad([0, -0.02, MAPH + 60], [MAPW, -0.02, MAPH + 60], [MAPW, -0.02, MAPH], [0, -0.02, MAPH], G); const lm = new THREE.Mesh(lg.build(), this.matTerrain); lm.receiveShadow = true; this.scene.add(lm); } // 海のない地形：南の川は地図の中で曲がるので、南の縁の外は陸
    const wd = MAPH - z0w + (sea ? far : 60), wg = new THREE.PlaneGeometry(far * 2 + MAPW, wd); wg.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(seaColors(wg), this.matSea); water.position.set(MAPW / 2, v3 ? -1.56 : -1.55, z0w + wd / 2); this.scene.add(water);
    { const pg = new THREE.CircleGeometry(2.35 * TILE, 40); pg.rotateX(-Math.PI / 2); const pond = new THREE.Mesh(pg, this.matWater); pond.position.set(44.5 * TILE, -0.7, 50.5 * TILE); this.scene.add(pond);
      if (W > 76 && !this.map.surf) { const p2 = new THREE.Mesh(new THREE.CircleGeometry(2.75 * TILE, 40).rotateX(-Math.PI / 2), this.matWater); p2.position.set(112.5 * TILE, -0.7, 72.5 * TILE); this.scene.add(p2); }
      // v92：さらに広げた土地のため池。水面の高さは岸（半径の 0.95 倍）の低い所に合わせる（丘のふもとでも水面が地面に埋もれないよう）
      if (W > FIC_V87_W && T !== 'mountain' && T !== 'inland' && !this.map.surf) for (const [px, py, r] of EXT_PONDS) { const hs: number[] = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; hs.push(heightAt(this.map, (px + Math.cos(a) * r * 0.95) * TILE, (py + Math.sin(a) * r * 0.95) * TILE)); } hs.sort((a, b) => a - b); const lo = hs[3]; // 用水路の溝が岸を切るので、いちばん低い所でなく下から 4 番目に合わせる
        const p3 = new THREE.Mesh(new THREE.CircleGeometry(r * 0.95 * TILE, 40).rotateX(-Math.PI / 2), this.matWater); p3.position.set(px * TILE, lo - 0.3, py * TILE); this.scene.add(p3); } } // 南原のため池（v87：新田のため池も）
  }

  // ---- v70：田んぼ（田園・山あい・盆地の空き地）。季節で水→緑→金→刈り跡と色が変わる ----
  private paddy: THREE.Mesh | null = null; private paddyAze: THREE.Mesh | null = null; private paddyKey = ''; private paddyWait = 0;
  private matPaddy = new THREE.MeshStandardMaterial({ color: 0x6faa48, vertexColors: true, roughness: 0.85, metalness: 0 }); // v95：頂点色で田ごとの色の違い
  private updatePaddy(s: GameState, dt: number): void {
    if (REAL || !this.map.deco) return;
    const key = `${s.bVersion}:${s.roadVersion}:${this.map.seed}`;
    this.paddyWait -= dt;
    if (key !== this.paddyKey && this.paddyWait <= 0) { this.paddyKey = key; this.paddyWait = 1.5; this.buildPaddy(s); }
    const cm = calMonth(s.month), C: Record<number, [number, number]> = { 3: [0x8e8a6c, 0.5], 4: [0x7c8a62, 0.55], 5: [0x79b04c, 0.85], 6: [0x6aa83f, 0.85], 7: [0x78a83a, 0.85], 8: [0xc9a944, 0.9], 9: [0xd6b04a, 0.9] };
    const [col, rough] = C[cm] ?? [0x9c8a62, 0.95]; // 冬は刈り跡の土色。v94：3・4 月の水を張った田は、水色（上空から湖や浸水に見えた）をやめ、空を少し映した泥色〜くすんだ緑に
    this.matPaddy.color.setHex(col); this.matPaddy.roughness = rough;
  }
  private buildPaddy(s: GameState): void {
    for (const o of [this.paddy, this.paddyAze]) if (o) { this.scene.remove(o); o.geometry.dispose(); }
    this.paddy = this.paddyAze = null;
    const m = this.map, deco = m.deco!, occ = new Uint8Array(W * H);
    for (const b of s.buildings) for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) if (inMap(b.x + dx, b.y + dy)) occ[idx(b.x + dx, b.y + dy)] = 1;
    const sg = new Geo(), ag = new Geo(), h = (x: number, z: number) => heightAt(m, x, z);
    // v95：まとまりの境は、田を境の曲線（soft.ts の field）で欠く。田の大きさは区画ごとにずらし、田ごとに色を少し変える。
    // 斜面（区画の中で 1.2m 以上の高低差）は、等高線に沿う細長い 3 枚の田にし、田の面を水平に（下側に土手の面）＝棚田
    const ind = (i: number) => (deco[i] === 2 && !occ[i] && !s.road[i] && !s.rail?.[i] && !m.water[i] && !m.forest[i] ? 1 : 0);
    const AZ = 0x7d8a52, BANK = 0x7a7350, r = 0.7, ins = 0.7 / TILE;
    const aze = (P: [number, number][], ys: number[]) => { // 田の縁のあぜ（外へ r の帯。角は辺の向きに r 延ばして埋める）
      for (let k = 0; k < P.length; k++) { const a = P[k], b = P[(k + 1) % P.length], ya = ys[k], yb = ys[(k + 1) % P.length];
        const dx = (b[0] - a[0]) * TILE, dz = (b[1] - a[1]) * TILE, L = Math.hypot(dx, dz); if (L < 0.05) continue; const ux = dx / L, uz = dz / L, ox = -uz * r, oz = ux * r;
        const A: V3 = [a[0] * TILE, ya, a[1] * TILE], B: V3 = [b[0] * TILE, yb, b[1] * TILE];
        ag.quad([A[0] - ux * r + ox, ya + 0.18, A[2] - uz * r + oz], [B[0] + ux * r + ox, yb + 0.18, B[2] + uz * r + oz], [B[0], yb + 0.18, B[2]], [A[0], ya + 0.18, A[2]], AZ);
        const ga = h(A[0] + ox, A[2] + oz), gb = h(B[0] + ox, B[2] + oz); // 棚田の土手（田の面が地面より上の所だけ）
        if (ya - ga > 0.3 || yb - gb > 0.3) ag.quad([B[0] + ux * r + ox, yb + 0.18, B[2] + uz * r + oz], [A[0] - ux * r + ox, ya + 0.18, A[2] - uz * r + oz], [A[0] - ux * r + ox, ga - 0.3, A[2] - uz * r + oz], [B[0] + ux * r + ox, gb - 0.3, B[2] + uz * r + oz], BANK, 0.85);
      } };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y); if (!ind(i)) continue;
      const edge = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([a, b]) => inMap(x + a, y + b) && !ind(idx(x + a, y + b)));
      const X0 = x * TILE, Z0 = y * TILE, gx = (h(X0 + TILE, Z0) + h(X0 + TILE, Z0 + TILE) - h(X0, Z0) - h(X0, Z0 + TILE)) / 2, gz = (h(X0, Z0 + TILE) + h(X0 + TILE, Z0 + TILE) - h(X0, Z0) - h(X0 + TILE, Z0)) / 2;
      const terr = Math.max(Math.abs(gx), Math.abs(gz)) > 1.2, rects: [number, number, number, number][] = [];
      if (terr) { const c1 = 0.3 + 0.08 * (hash(x, y, 91) - 0.5), c2 = 0.66 + 0.08 * (hash(x, y, 92) - 0.5); // 等高線に沿う 3 枚（勾配の向きに並べる）
        for (const [a, b] of [[0, c1], [c1, c2], [c2, 1]]) rects.push(Math.abs(gx) > Math.abs(gz) ? [x + a, y, x + b, y + 1] : [x, y + a, x + 1, y + b]); }
      else { const sx = 0.5 + 0.22 * (hash(x, y, 93) - 0.5), sz = 0.5 + 0.22 * (hash(x, y, 94) - 0.5); // 2×2（しきりの位置を区画ごとにずらす）
        for (const [a0, a1] of [[0, sx], [sx, 1]]) for (const [b0, b1] of [[0, sz], [sz, 1]]) rects.push([x + a0, y + b0, x + a1, y + b1]); }
      for (const [u0, v0, u1, v1] of rects) {
        let P: [number, number][] = [[u0 + ins, v1 - ins], [u1 - ins, v1 - ins], [u1 - ins, v0 + ins], [u0 + ins, v0 + ins]];
        if (edge) { P = clipPoly(P, P.map(([u, v]) => field(ind, u, v))); if (P.length < 3) continue; }
        const g0 = P.map(([u, v]) => h(u * TILE, v * TILE)), flatY = Math.max(...g0) + 0.14, ys = terr ? P.map(() => flatY) : g0.map(v => v + 0.14);
        const t = hash(Math.floor(u0 * 7), Math.floor(v0 * 7), 95), gy = Math.round(255 * (0.84 + 0.13 * t)), col = ((gy + 6) << 16) | (gy << 8) | (gy - (t > 0.7 ? 10 : 0)); // 田ごとの明るさ（0〜255 に収める）
        for (let k = 1; k + 1 < P.length; k++) sg.tri([P[0][0] * TILE, ys[0], P[0][1] * TILE], [P[k][0] * TILE, ys[k], P[k][1] * TILE], [P[k + 1][0] * TILE, ys[k + 1], P[k + 1][1] * TILE], col);
        aze(P, ys);
      }
    }
    if (!sg.pos.length) return;
    this.paddy = new THREE.Mesh(sg.build(), this.matPaddy); this.paddy.receiveShadow = true; this.scene.add(this.paddy);
    this.paddyAze = new THREE.Mesh(ag.build(), this.matBody); this.paddyAze.receiveShadow = true; this.scene.add(this.paddyAze);
  }
  /** 地図の中の地面（地形の造作をしたら作り直す）：標高の網、林の木、人がつくった水面・湿地 */
  private landObjs: THREE.Object3D[] = []; private cutKey = '';
  private buildLand(): void {
    for (const o of this.landObjs) { this.scene.remove(o); if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose(); }
    this.landObjs = [];
    const m = this.map, SUB = 3, nx = W * SUB, nz = H * SUB, st0 = this.getState();
    const shore = makeShore(m); this.shore = shore; // v94：岸をなめらかな曲線に
    const SOFT = [0, 2, 6, 7, 8, 9], softOn = !!m.deco && !REAL, softT = (i: number) => !m.water[i] && !m.sand?.[i] && !m.wet?.[i] && !m.dug?.[i] && !m.desert?.[i] && !m.snow?.[i] && !(m.steep[i] && m.base) && SOFT.includes(m.deco?.[i] ?? 0);
    const pos = new Float32Array((nx + 1) * (nz + 1) * 3), col = new Float32Array((nx + 1) * (nz + 1) * 3);
    const c = new THREE.Color(), c2 = new THREE.Color();
    // 掘割の線路：区画の地面を掘り下げる（見た目だけ）
    const cutT = (tx: number, tz: number) => tx >= 0 && tz >= 0 && tx < W && tz < H && !!st0.rail?.[idx(tx, tz)] && st0.railGrade?.[idx(tx, tz)] === 3;
    this.cutKey = st0.rail ? (st0.railGrade ?? []).map((g, i) => (g === 3 && st0.rail![i] ? i : -1)).filter(i => i >= 0).join(',') : '';
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) {
      const x = (i / SUB) * TILE, z = (j / SUB) * TILE, k = (j * (nx + 1) + i) * 3;
      let y = heightAt(m, x, z);
      if (shore) y = shore.adjust(i / SUB, j / SUB, y);
      if (this.cutKey) { const ax = i % SUB === 0 ? [i / SUB - 1, i / SUB] : [Math.floor(i / SUB)], az = j % SUB === 0 ? [j / SUB - 1, j / SUB] : [Math.floor(j / SUB)]; let n = 0, cc = 0; for (const a of ax) for (const b of az) { n++; if (cutT(a, b)) cc++; } if (cc) y -= 6.5 * cc / n; }
      pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
      // v88：地面の色のむらを、20m 角の乱数（上空から市松模様に見えた）から、なめらかな大小 2 つのむらに
      // v93：頂点ごとの乱数（遠景で細かいざらつきに見える）を弱め、大きなむらを足す
      const n = vnoise(i / SUB, j / SUB, 14, 93) * 0.3 + vnoise(i / SUB, j / SUB, 5, 91) * 0.4 + vnoise(i / SUB, j / SUB, 1.4, 17) * 0.24 + hash(i, j, 17) * 0.06;
      c.setHex(0x6c9a52).lerp(c2.setHex(0x86b160), n);
      const tx = Math.min(W - 1, Math.floor(x / TILE)), tz = Math.min(H - 1, Math.floor(z / TILE)); let ti = idx(tx, tz);
      if (softOn) { const wi = warpTile(x / TILE, z / TILE); if (wi !== ti && softT(ti) && softT(wi)) ti = wi; } // v95：林・田畑・草地の境は、引く区画をノイズでずらして、格子の階段でなく、くねる境に
      if (m.forest[ti]) c.lerp(c2.setHex(0x4f7f45), 0.6);
      if (m.steep[ti] && !m.forest[ti] && m.base) c.lerp(c2.setHex(0x8a7a66), 0.55); // 造作した崖・急斜面は岩肌
      { const dc = m.deco?.[ti]; // v70：地形の見た目の印
        if (dc === 1) c.lerp(c2.setHex(0xe6d6a6).lerp(new THREE.Color(0xd8c48e), n), 0.9);        // 砂浜
        else if (dc === 4) c.lerp(c2.setHex(0xb9b3a0).lerp(new THREE.Color(0x9aa08a), n), 0.75);  // 河原（石と草）
        else if (dc === 3) c.lerp(c2.setHex(0x8b8a7e).lerp(new THREE.Color(0x6f7566), n), 0.7);   // 岩肌
        else if (dc === 5) c.setHex(0xf2f5f8).lerp(c2.setHex(0xd2dce6), n * 0.5);                // 雪をかぶった頂
        else if (dc === 6) { const rw = 0.35 + 0.4 * hash(Math.floor(tx / 3), tz >> 1, 31) + 0.25 * n; c.lerp(c2.setHex(0x8a6e4c).lerp(new THREE.Color(0x6f8a48), rw), 0.6); } // v88：畑（土と作物）。v93：うねの縞は頂点の間隔（10m）より細かく、区画ごとのまだらに見えたので、3×2 区画の畑ごとの作物の育ち具合に
        else if (dc === 7) c.lerp(c2.setHex(0x9aa868).lerp(new THREE.Color(0x7f9a58), n), 0.55);  // 草地（野原）
        else if (dc === 8) c.setHex(0x5e5a3c).lerp(c2.setHex(0x6a6248), n * 0.6); // 屋敷林・雑木林の跡（v93：林床の落ち葉の色。緑みのある地面は混ぜても、春に季節のシェーダーで桜色になり、上空から白い斑点に見えた）
        else if (dc === 9) c.lerp(c2.setHex(0xa89a7a).lerp(new THREE.Color(0x8f9a6a), n), 0.6); } // 空き地（土と雑草）
      if (m.sand?.[ti]) c.lerp(c2.setHex(0xdcc894).lerp(new THREE.Color(0xcdb67c), n), 0.85);
      if (m.wet?.[ti]) c.lerp(c2.setHex(0x6b7444), 0.7);
      if (m.dug?.[ti]) c.lerp(c2.setHex(0x8c7c5c), 0.7); // 掘った池の岸と底
      if (y > 6) c.lerp(c2.setHex(0x8aa860), Math.min(0.5, (y - 6) / 20));
      if (m.desert?.[ti]) { const rip = 0.5 + 0.5 * Math.sin(x * 0.55 + Math.sin(z * 0.08) * 3); c.setHex(0xe3c27a).lerp(c2.setHex(0xc79a52), rip * 0.6 + n * 0.25); }
      if (m.snow?.[ti]) c.setHex(0xf4f7fa).lerp(c2.setHex(0xd6e2ee), n * 0.6);
      if (y > 22) c.lerp(c2.setHex(0x6f7a62), Math.min(0.45, (y - 22) / 60)); // 高い山は暗い緑から岩肌へ（岩・雪は印で塗る）
      if (y < -0.5) c.lerp(c2.setHex(0xb5a987), smooth(-0.5, -1.5, y));
      if (y < -1.8) c.lerp(c2.setHex(0x566b5a), smooth(-1.8, -3, y));
      col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    }
    const ix: number[] = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const a = j * (nx + 1) + i, b = a + 1, d = a + nx + 1, e = d + 1; ix.push(a, d, b, b, d, e); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setIndex(ix); g.computeVertexNormals();
    this.terrain = new THREE.Mesh(g, this.matTerrain); this.terrain.receiveShadow = true;
    this.scene.add(this.terrain); this.landObjs.push(this.terrain);
    // 林の木（保全林と植林）
    const cx = this.ctx(0.5151), tg = cx.g;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (!m.forest[i]) continue;
      const n = y >= H - 6 ? 2 : 5, edge = !REAL && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([a, b]) => inMap(x + a, y + b) && !m.forest[idx(x + a, y + b)]);
      for (let k = 0; k < n; k++) {
        const wx = (x + hash(x * 7 + k, y, 3)) * TILE, wz = (y + hash(x, y * 5 + k, 4)) * TILE;
        if (edge && field(j => m.forest[j], wx / TILE, wz / TILE) < 0.3 + 0.45 * hash(x + k, y * 3, 7)) continue; // v95：林の縁は木をまばらに（境の曲線の外は描かない）
        tg.at(wx, heightAt(m, wx, wz) - 0.2, wz); tree(cx, 0, 0, 1.2 + hash(x + k, y, 5) * 0.9, hash(x, y + k, 6) < 0.45 ? 1 : 0);
      }
    }
    // 湿地の葦
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!m.wet?.[idx(x, y)]) continue;
      for (let k = 0; k < 14; k++) { const wx = (x + 0.08 + hash(x * 5 + k, y, 21) * 0.84) * TILE, wz = (y + 0.08 + hash(x, y * 3 + k, 22) * 0.84) * TILE; tg.at(wx, heightAt(m, wx, wz) + 0.2, wz); tg.box(0, 0, 0, 0.5, 1.4 + hash(k, x, 23) * 1.2, 0.5, hash(k, y, 24) < 0.5 ? 0x8a9a4a : 0x9aa25a); }
    }
    tg.at(0, 0, 0);
    if (tg.pos.length) { const mesh = new THREE.Mesh(tg.build(), this.matBody); mesh.castShadow = true; mesh.receiveShadow = true; mesh.frustumCulled = false; this.scene.add(mesh); this.landObjs.push(mesh); }
    // 人がつくった水面（池・川・海）と、湿地の水たまり
    const wg = new Geo(), mg = new Geo(), tId = terrainOf(m.seed).id;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y), dug = m.dug?.[i], wet = m.wet?.[i];
      if (shore && shore.wf[i] && !dug && !wet) continue; // v94：岸を曲線で描く水面（下の drawShoreWater）
      if (!dug && !wet && tId === 'castaway') { // v88：無人島の沢と湧水の池（海は地図の外の海面が覆う）
        if (!m.water[i]) continue; const S = W + 1, lo = Math.min(m.heights[y * S + x], m.heights[y * S + x + 1], m.heights[(y + 1) * S + x], m.heights[(y + 1) * S + x + 1]); if (lo < -1.2) continue;
        wg.quad([x * TILE, lo + 0.35, (y + 1) * TILE], [(x + 1) * TILE, lo + 0.35, (y + 1) * TILE], [(x + 1) * TILE, lo + 0.35, y * TILE], [x * TILE, lo + 0.35, y * TILE], 0x3f7fa6); continue;
      }
      if (!dug && !wet && !REAL && !m.surf && m.water[i] && extWater(tId, x, y)) { // v92：さらに広げた土地の用水路・谷川（地面の高さに合わせる。ため池は円の水面で別に描く）
        if (tId !== 'mountain' && tId !== 'inland' && EXT_PONDS.some(([px, py, r]) => Math.hypot(x + 0.5 - px, y + 0.5 - py) < r)) continue;
        const S = W + 1, lo = Math.min(m.heights[y * S + x], m.heights[y * S + x + 1], m.heights[(y + 1) * S + x], m.heights[(y + 1) * S + x + 1]);
        wg.quad([x * TILE, lo + 0.35, (y + 1) * TILE], [(x + 1) * TILE, lo + 0.35, (y + 1) * TILE], [(x + 1) * TILE, lo + 0.35, y * TILE], [x * TILE, lo + 0.35, y * TILE], 0x3f7fa6); continue;
      }
      if (!dug && !wet) { // 地形の水面（大河・湖・島の海）。南の川とため池は別に描く
        if (!m.water[i] || REAL || tId === 'coast' || y >= H - 4 || Math.hypot(x + 0.5 - 44.5, y + 0.5 - 50.5) < 2.1 || (W > 76 && Math.hypot(x + 0.5 - 112.5, y + 0.5 - 72.5) < 2.5) || (m.base && !m.base.water[i])) continue;
        { const Y = -1.44; wg.quad([x * TILE, Y, (y + 1) * TILE], [(x + 1) * TILE, Y, (y + 1) * TILE], [(x + 1) * TILE, Y, y * TILE], [x * TILE, Y, y * TILE], 0x3f7fa6); } continue; // 外の海（-1.55 / -1.62）と重なる所で面がちらつかないよう、高さを離す
      }
      const S = W + 1, hs = [m.heights[y * S + x], m.heights[y * S + x + 1], m.heights[(y + 1) * S + x], m.heights[(y + 1) * S + x + 1]];
      const lv = m.waterLv?.[i] || Math.min(...hs) + (dug ? 1.1 : 0.3), x0 = x * TILE, z0 = y * TILE;
      const inset = (dx: number, dy: number) => { const k = idx(Math.max(0, Math.min(W - 1, x + dx)), Math.max(0, Math.min(H - 1, y + dy))); return m.dug?.[k] || m.water[k] ? 0 : 2.5; };
      const a0 = x0 + (dug ? inset(-1, 0) : 3), a1 = x0 + TILE - (dug ? inset(1, 0) : 3), b0 = z0 + (dug ? inset(0, -1) : 3), b1 = z0 + TILE - (dug ? inset(0, 1) : 3);
      (wet ? mg : wg).quad([a0, lv, b1], [a1, lv, b1], [a1, lv, b0], [a0, lv, b0], wet ? 0x5f6e4c : 0x3f7fa6);
    }
    if (shore) { const sg = buildShoreWater(shore); if (sg) { const mesh = new THREE.Mesh(sg, this.matSea); mesh.receiveShadow = true; mesh.frustumCulled = false; this.scene.add(mesh); this.landObjs.push(mesh); } } // v95：水深の色の 1 枚の水面
    if (wg.pos.length) { const mesh = new THREE.Mesh(wg.build(), this.matWater); mesh.receiveShadow = true; mesh.frustumCulled = false; this.scene.add(mesh); this.landObjs.push(mesh); }
    if (mg.pos.length) { this.matMarsh ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.85 }); const mesh = new THREE.Mesh(mg.build(), this.matMarsh); mesh.receiveShadow = true; mesh.frustumCulled = false; this.scene.add(mesh); this.landObjs.push(mesh); }
  }
  private matMarsh: THREE.MeshStandardMaterial | null = null;
  private ctx(seed: number, old = false): Ctx { Geo.fineRoof = this.fine(); return { g: new Geo(), wa: new Geo(), wb: new Geo(), sign: new Geo(true), rnd: rng(seed), old, fine: this.fine(), lm: this.landmarks ?? undefined }; }
  /** 細かい部品を付けるか（スマホの軽量表示と低画質では付けない） */
  private fine(): boolean { return !this.lite && this.quality !== 'low'; }
  private addCtx(c: Ctx, group: string, shadow = true): void {
    const add = (geo: Geo, mat: THREE.Material, cast: boolean) => {
      if (!geo.pos.length) return;
      const mesh = new THREE.Mesh(geo.build(!!REAL), mat); mesh.castShadow = cast && shadow; mesh.receiveShadow = shadow; mesh.frustumCulled = false;
      this.scene.add(mesh); this.groups[group].push(mesh);
    };
    add(c.g, this.matBody, true); add(c.wa, this.matWinA, false); add(c.wb, this.matWinB, false); add(c.sign, this.matSign, false);
  }
  private clearGroup(group: string): void {
    for (const m of this.groups[group]) { this.scene.remove(m); m.geometry.dispose(); }
    this.groups[group] = [];
  }

  private buildStatic(): void {
    if (REAL) {
      const { geo, water } = realStatic(this.map);
      const mesh = new THREE.Mesh(geo.build(true), this.matRoad); mesh.receiveShadow = true; this.scene.add(mesh);
      const wm = new THREE.Mesh(water.build(), this.matWater); this.scene.add(wm);
      if (REAL.sea > 0) { // 海：地図と外側を覆う水面（陸は標高 0m 以上なので隠れない）
        const sg = new THREE.PlaneGeometry(MAPW + 16000, MAPH + 16000); sg.rotateX(-Math.PI / 2);
        const sea = new THREE.Mesh(sg, this.matWater); sea.position.set(MAPW / 2, -0.5, MAPH / 2); sea.receiveShadow = true; this.scene.add(sea);
      }
      this.train = new THREE.Group(); this.train.visible = false;
      return;
    }
    const m = this.map, c = this.ctx(0.4242), g = c.g;
    // 線路は GameState の rail として描く（drawRails）
    g.at(0, 0, 0);
    // 遠くの景色：地形ごとに変える（v70）。山あい・盆地は雪をかぶった高い山、田園は低い丘、海辺と島は沖の島、都会は高層ビル群
    const tId = terrainOf(m.seed).id;
    // v79：遠くの山を、角すい（折り紙のように見えた）から、起伏のある地形に作り直す。
    // 高さは「中心からの距離で下がる山体 × 尾根と谷の起伏（大きさの違う雑音の重ね）」。細かい格子（26 角 × 10 段）に、なめらかな法線。
    // 色は高さと傾きで決める：すそは森の緑、中腹は濃い緑、急な所と高い所は岩、高い山の上は雪
    const vnz = (x: number, z: number, sc: number, k: number) => { const X = x / sc, Z = z / sc, xi = Math.floor(X), zi = Math.floor(Z), fx = X - xi, fz = Z - zi, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
      const hq = (i: number, j: number) => { const v = Math.sin(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return v - Math.floor(v); }; // 0〜1（負の座標でも）
      return (hq(xi, zi) * (1 - sx) + hq(xi + 1, zi) * sx) * (1 - sz) + (hq(xi, zi + 1) * (1 - sx) + hq(xi + 1, zi + 1) * sx) * sz; };
    const peak = (px: number, pz: number, rad: number, hh: number, snow: boolean, sd: number) => {
      type V = [number, number, number]; const NA = 26, NR = 10, p1 = hash(sd, 1, 51) * 6.28, p2 = hash(sd, 2, 51) * 6.28, k0 = 60 + (sd % 7);
      const Rof = (a: number) => rad * (1 + 0.2 * Math.sin(3 * a + p1) + 0.11 * Math.sin(7 * a + p2));
      const Hof = (x: number, z: number): number => { const dx = x - px, dz = z - pz, d = Math.hypot(dx, dz), t = d / Rof(Math.atan2(dz, dx)); if (t >= 1) return -5;
        const n1 = vnz(x, z, rad * 0.5, k0), n2 = vnz(x, z, rad * 0.21, k0 + 1), n3 = vnz(x, z, rad * 0.09, k0 + 2), ridge = 1 - Math.abs(2 * n2 - 1); // 尾根（とがった稜線）
        const body = Math.pow(1 - t, 1.45) * (0.62 + 0.5 * n1 + 0.3 * ridge * (0.35 + 0.65 * (1 - t)) + 0.1 * n3), edge = Math.min(1, (1 - t) * 6);            // すそは地面へなだらかに
        return hh * body * edge - 5; };
      const P: V[][] = [], N: V[][] = [];
      for (let q = 0; q <= NR; q++) { P.push([]); N.push([]); for (let i = 0; i < NA; i++) { const a = (i / NA) * Math.PI * 2, d = Rof(a) * Math.pow(1 - q / NR, 0.85), x = px + Math.cos(a) * d, z = pz + Math.sin(a) * d, e = rad * 0.035;
        const y = Hof(x, z), nx = Hof(x - e, z) - Hof(x + e, z), nz = Hof(x, z - e) - Hof(x, z + e), l = Math.hypot(nx, 2 * e, nz) || 1; P[q].push([x, y, z]); N[q].push([nx / l, 2 * e / l, nz / l]); } }
      const cA = new THREE.Color(), cB = new THREE.Color(), tall = hh > 500;
      for (let q = 0; q < NR; q++) for (let i = 0; i < NA; i++) { const j = (i + 1) % NA, v = [P[q][i], P[q][j], P[q + 1][j], P[q + 1][i]] as [V, V, V, V], nn = [N[q][i], N[q][j], N[q + 1][j], N[q + 1][i]] as [V, V, V, V];
        const y = (v[0][1] + v[1][1] + v[2][1] + v[3][1]) / 4, ny = (nn[0][1] + nn[1][1] + nn[2][1] + nn[3][1]) / 4, mx = (v[0][0] + v[2][0]) / 2, mz = (v[0][2] + v[2][2]) / 2, nq = vnz(mx, mz, 150, 71), nb = vnz(mx, mz, 420, 72);
        cA.setHex(0x4a6c4b).lerp(cB.setHex(0x62855a), nb);                                                        // すその森（明るい所と暗い所）
        cA.lerp(cB.setHex(0x3f5b47), smooth(140, 420, y) * 0.7);                                                  // 中腹は濃い緑（針葉樹）
        if (tall) cA.lerp(cB.setHex(0x767b72), Math.max(smooth(0.5, 0.78, y / hh + (nq - 0.5) * 0.18), smooth(0.8, 0.62, ny) * smooth(250, 520, y))); // 高い所・急な所は岩
        else cA.lerp(cB.setHex(0x6e7466), smooth(0.74, 0.58, ny) * 0.5);
        if (snow) cA.lerp(cB.setHex(0xeef2f6), smooth(0.6, 0.72, y / hh + (nq - 0.5) * 0.2) * (0.55 + 0.45 * smooth(0.55, 0.8, ny)));                // 雪（急な岩場には付きにくい）
        const rim = q === 0 ? 0.8 : q === 1 ? 0.9 : 1; // すそのなだらかな所は上を向いて明るく光り、山の手前に白い筋のように見えるので、少し暗くする
        const shv = v.map(w => (0.9 + 0.2 * vnz(w[0], w[2], 55, 73)) * rim) as [number, number, number, number];
        g.surfv = -2; g.quadN(v, nn, cA.getHex(), shv); g.surfv = -1; } // -2：季節の色替え（春の桜色・秋の紅葉）をしない面。遠くの山に掛かると、点々の雑音に見える
    };
    g.surfv = -1; // 遠くの山には壁や地面の細かい模様をつけない（砂利の山のように見える）
    const NP = tId === 'castaway' ? 7 : tId === 'mountain' || tId === 'inland' ? 64 : tId === 'rural' ? 40 : tId === 'coast' || tId === 'island' ? 26 : 46;
    for (let k = 0; k < NP; k++) {
      let a = (k / NP) * Math.PI * 2 + hash(k, 1, 9) * 0.1;
      if ((tId === 'coast' || tId === 'island') && Math.sin(a) > -0.15) a = -Math.PI / 2 + (hash(k, 6, 9) - 0.5) * 2.6; // 海の側（南）には山を置かない
      if (tId === 'castaway') a = -Math.PI / 2 + (k / 6 - 0.5) * 1.6; // v88：無人島は、はるか北の本土の山なみだけ
      const big = tId === 'mountain' || tId === 'inland' || (tId === 'lake' && Math.cos(a) > 0.3); // 東西へ抜ける国道の先（真東・真西）には寄せない
      const r = tId === 'castaway' ? 7600 + hash(k, 2, 9) * 900 : (big ? 1650 : 3000) + hash(k, 2, 9) * (big ? 1500 : 2200) + (Math.abs(Math.sin(a)) < 0.22 ? 900 : 0), hh = tId === 'rural' ? 110 + hash(k, 3, 9) * 200 : big ? 620 + hash(k, 3, 9) * 820 : 260 + hash(k, 3, 9) * 520;
      const rad = (tId === 'rural' ? 900 : 700) + hash(k, 4, 9) * 700;
      let px = MAPW / 2 + Math.cos(a) * r, pz = MAPH / 2 + Math.sin(a) * r;
      // すそ（半径の約 1.25 倍）が地図の中や手前にかからないよう、外へ押し出す（前は地図の端に謎の壁のように立っていた）
      const rectD = (x: number, z: number) => Math.hypot(Math.max(0, -x, x - MAPW), Math.max(0, -z, z - MAPH));
      for (let it = 0; it < 60 && rectD(px, pz) < rad * 1.3 + 400; it++) { px += Math.cos(a) * 80; pz += Math.sin(a) * 80; }
      peak(px, pz, rad, hh, big && hh > 980, k);
    }
    if (tId === 'coast') { // 海辺：沖の消波ブロックの防波堤と、灯台のある突堤
      for (let k = 0; k < 7; k++) { const x0 = 120 + k * 330 + hash(k, 1, 17) * 60, z = (H - 1.6) * TILE; g.at(0, 0, 0); g.box(x0, -2.2, z, 150, 2.6, 7, 0xa9aaa4, 0x8f908a); for (let j = 0; j < 14; j++) g.box(x0 - 68 + j * 10.5, 0.2, z + (hash(k, j, 18) - 0.5) * 3, 4.5, 1.2, 4.5, 0xbdbdb6); }
      const px = MAPW * 0.62; g.box(px, -2.2, (H - 2.6) * TILE, 9, 3.0, 2.6 * TILE, 0xb5b2aa, 0x8f908a); g.cyl(px, 0.8, (H - 1.3) * TILE + 6, 2.2, 13, 0xf6f6f2, 12); g.cyl(px, 13.8, (H - 1.3) * TILE + 6, 2.5, 2.2, 0xd8322a, 12);
    }
    if (tId === 'coast' || tId === 'island') for (let k = 0; k < 6; k++) { // 沖の島（緑の丘と白い砂浜）
      const px = MAPW / 2 + (hash(k, 1, 13) - 0.5) * 6000, pz = MAPH + 900 + hash(k, 2, 13) * 2600, rr = 120 + hash(k, 3, 13) * 260;
      g.at(px, -1.6, pz); g.cyl(0, 0, 0, rr * 1.12, 1.4, 0xe2d4a8, 14); g.cyl(0, 1.2, 0, rr, rr * 0.35, 0x4f7a4a, 12, undefined, rr * 0.25); g.at(0, 0, 0);
    }
    g.surfv = 0;
    if (tId === 'urban') for (let k = 0; k < 90; k++) { // 地図の外の高層ビル群
      const side = k % 3, d = 300 + hash(k, 1, 41) * 1500, t = hash(k, 2, 41);
      const px = side === 0 ? -d : side === 1 ? MAPW + d : t * MAPW, pz = side === 2 ? -d : t * MAPH * 0.8;
      const w = 30 + hash(k, 3, 41) * 40, hh = 60 + hash(k, 4, 41) ** 2 * 260;
      g.at(px, 0, pz); g.box(0, 0, 0, w, hh, w * (0.7 + hash(k, 5, 41) * 0.6), [0x9aa4ad, 0xb7bec4, 0x7d8a96, 0xc9c4b8][k % 4], 0x6a7682); g.at(0, 0, 0);
    }
    // 地図の外の家並み（景観のみ。都会はビル群、山あいと田園は少なめ）
    // v94：地図の外の地面が陸の所だけに置く（前は島の東と南西の外の海、無人島のまわりの海、南の川の上にも家が立っていた）
    const outerLand = (px: number, pz: number, r: number) => { if (tId === 'castaway') return false;
      const noSea = tId === 'inland' || tId === 'rural' || tId === 'mountain', RY = noSea ? H - 3.4 : H - 4.8;
      if (pz > RY * TILE - r - 6 || pz < r) return false;
      if (tId === 'island' && (px > MAPW - r || (px < r && pz > 24.5 * TILE - r - 6))) return false;
      return true; };
    for (let k = 0; k < (tId === 'urban' ? 60 : tId === 'mountain' || tId === 'rural' ? 50 : 150); k++) {
      const side = k % 2, px = side ? MAPW + 60 + hash(k, 1, 31) * 900 : -60 - hash(k, 1, 31) * 900, pz = 80 + hash(k, 2, 31) * (H - 9) * TILE;
      if (Math.abs(pz - 15.5 * TILE) < 24 || !outerLand(px, pz, 8)) continue;
      g.at(px, 0, pz, Math.floor(hash(k, 3, 31) * 4) * Math.PI / 2);
      const w = 7 + hash(k, 4, 31) * 3, d = 6 + hash(k, 5, 31) * 2, wall = [0xf2efe6, 0xe9e2d0, 0xd9cfc0, 0xcfd6da][k % 4], roof = [0x3b3f46, 0x2f3a4a, 0x5a3a2e, 0x4a4a4a][(k >> 2) % 4];
      g.box(0, 0, 0, w, 5.4, d, wall); g.gable(0, 5.4, 0, w, d, 2, roof, 'x', wall);
    }
    g.at(0, 0, 0);
    g.box(-1200, 0.03, 15.5 * TILE, 2400, 0.08, 15, 0x3c3f44); g.box(MAPW + 1200, 0.03, 15.5 * TILE, 2400, 0.08, 15, 0x3c3f44);   // 国道は市外へ続く
    for (const sx of [-1, 1]) for (let k = 0; k < 60; k++) g.box(sx < 0 ? -20 - k * 40 : MAPW + 20 + k * 40, 0.12, 15.5 * TILE, 8, 0.02, 0.2, 0xf2c230);
    const mesh = new THREE.Mesh(g.build(), this.matBody); mesh.castShadow = true; mesh.receiveShadow = true; this.scene.add(mesh);
    // 列車
    const t = this.ctx(0.77), tg = t.g; tg.surfv = -1; // 電車には壁の模様をつけない
    for (let k = 0; k < 4; k++) {
      const cx = k * 20.6;
      tg.box(cx, 1.0, 0, 20, 2.7, 2.9, 0xd9dde0, 0xb9bcc0); tg.box(cx, 1.55, 0, 20.02, 0.42, 2.94, 0xe07a2a); tg.box(cx, 0.45, 0, 18, 0.6, 2.4, 0x2a2c2e);
      for (let i = 0; i < 6; i++) { t.wa.quad([cx - 8.4 + i * 3.1, 2.3, 1.5], [cx - 6.2 + i * 3.1, 2.3, 1.5], [cx - 6.2 + i * 3.1, 3.2, 1.5], [cx - 8.4 + i * 3.1, 3.2, 1.5], 0xcfe0e8); t.wa.quad([cx - 6.2 + i * 3.1, 2.3, -1.5], [cx - 8.4 + i * 3.1, 2.3, -1.5], [cx - 8.4 + i * 3.1, 3.2, -1.5], [cx - 6.2 + i * 3.1, 3.2, -1.5], 0xcfe0e8); }
    }
    this.train = new THREE.Group();
    const tb = new THREE.Mesh(tg.build(), this.matBody); tb.castShadow = true; this.train.add(tb, new THREE.Mesh(t.wa.build(), this.matWinA));
    this.train.position.set(-900, 0.5, 46.5); this.scene.add(this.train); this.train.visible = false; // v13：列車は線路の上を走る（moveTrains）
  }

  private buildSky(): void {
    const g = new THREE.SphereGeometry(REAL ? 16000 : 9000, 32, 16);
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
    this.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.sky.renderOrder = -10; this.scene.add(this.sky);
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(230, 24), new THREE.MeshBasicMaterial({ color: 0xfff3c8, fog: false, depthWrite: false, transparent: true }));
    this.sunDisc.renderOrder = -9; this.scene.add(this.sunDisc);
    const cg = new Geo();
    // v80：雲を増やす。頭上の積雲（18 個）に加えて、遠くの空に大きく平たい雲の帯（30 個）を置き、地上や低い視点からも空に雲が見えるようにする。
    // 雲は東へ流れる。同じ並びを 15km 西にもう一組置いて、流れが一周しても途切れない（前は 9km ごとに全体が飛んで戻っていた）
    const CLP = 15000;
    for (let k = 0; k < 48; k++) {
      const far = k >= 18, ang = hash(k, 6, 51) * Math.PI * 2, rr = 4300 + hash(k, 7, 51) * 3000;
      const cx = far ? Math.cos(ang) * rr : (hash(k, 1, 51) - 0.5) * 9000, cz = far ? Math.sin(ang) * rr : (hash(k, 2, 51) - 0.5) * 9000, cy = far ? 520 + hash(k, 3, 51) * 620 : 900 + hash(k, 3, 51) * 500, s = far ? 1.7 + hash(k, 4, 51) * 1.8 : 0.8 + hash(k, 4, 51);
      // 積雲は Blender の形（src/assets/clouds.json）：上は白く、平らな底は灰色
      const CL = CLOUDS as unknown as Record<string, { V: number[][]; F: number[][] }>, m = CL[['a', 'b', 'c'][k % 3]], sc = 120 * s, ro = hash(k, 5, 51) * Math.PI * 2, ca = Math.cos(ro) * sc, sa = Math.sin(ro) * sc, hk = far ? 0.5 : 0.75;
      for (const ox of [0, -CLP]) { const P = m.V.map(([x, y, z]) => [cx + ox + x * ca - y * sa, cy + z * sc * hk, cz - (x * sa + y * ca)] as [number, number, number]);
        for (const [a2, b2, c2, sh] of m.F) cg.tri(P[a2], P[b2], P[c2], 0xffffff, sh); }
    }
    this.clouds = new THREE.Mesh(cg.build(), this.matCloud); this.clouds.position.set(MAPW / 2, 0, MAPH / 2); this.scene.add(this.clouds);
    const sp = new Float32Array(700 * 3);
    for (let k = 0; k < 700; k++) { const a = hash(k, 1, 61) * Math.PI * 2, e = Math.asin(hash(k, 2, 61) * 0.95 + 0.04); const SR = REAL ? 15500 : 8500; sp[k * 3] = Math.cos(a) * Math.cos(e) * SR; sp[k * 3 + 1] = Math.sin(e) * SR; sp[k * 3 + 2] = Math.sin(a) * Math.cos(e) * SR; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
    this.stars = new THREE.Points(sg, this.matStars); this.stars.frustumCulled = false; this.scene.add(this.stars);
  }

  // ------------------------------------------------------------ 季節と天気
  private buildPrecip(): void {
    const NR = 3000, NS = 4000; this.pOff = new Float32Array((NR + NS) * 3);
    for (let i = 0; i < this.pOff.length; i++) this.pOff[i] = hash(i, 7, 91) * 2 - 1;
    const rg = new THREE.BufferGeometry(); rg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NR * 6), 3));
    this.rainLines = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xc9d4de, transparent: true, opacity: 0, depthWrite: false }));
    this.rainLines.frustumCulled = false; this.rainLines.visible = false; this.scene.add(this.rainLines);
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NS * 3), 3));
    this.snowPts = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.35, map: glowTex(), alphaTest: 0.02, transparent: true, opacity: 0, depthWrite: false }));
    this.snowPts.frustumCulled = false; this.snowPts.visible = false; this.scene.add(this.snowPts);
  }
  /** 季節（暦の月）と、日ごとに変わる天気。大雨・台風のできごとの間は雨、大雪のときは雪 */
  private updateWeather(s: GameState, dt: number): void {
    if (this.hour < this.prevHour - 12) this.dayNo++;
    this.prevHour = this.hour;
    const cm = calMonth(s.month), act = s.events.active.map(e => e.id);
    this.calM = cm;
    const key = `${this.dayNo}:${s.month}:${act.join(',')}:${this.weatherForce}`;
    let jump = false;
    if (key !== this.wKey) {
      jump = this.wKey === '' || !!this.weatherForce; this.wKey = key;
      const r = (() => { const v = Math.sin(this.dayNo * 12.9898 + s.month * 78.233 + 0.5) * 43758.5453; return v - Math.floor(v); })();
      const cr = s.climate?.ratio ?? 1; // その月の雨の多さ（シミュレーションの天気）に合わせる
      const rainP = Math.min(0.85, [0.12, 0.14, 0.2, 0.22, 0.24, 0.62, 0.3, 0.25, 0.35, 0.24, 0.16, 0.12][cm] * Math.max(0.15, Math.min(2.2, cr))), snowP = Math.min(0.7, [0.35, 0.3, 0.06, 0, 0, 0, 0, 0, 0, 0, 0.02, 0.15][cm] * (s.climate?.snow ? 2 : cr < 0.8 ? 0.5 : 1));
      let k: 'clear' | 'cloudy' | 'rain' | 'snow' = r < snowP ? 'snow' : r < snowP + rainP ? 'rain' : r < snowP + rainP + 0.22 ? 'cloudy' : 'clear';
      if (act.some(id => RAIN_EVENTS.has(id))) k = 'rain';
      if (act.includes('snow')) k = 'snow';
      const r2 = (() => { const v = Math.sin(this.dayNo * 4.1414 + s.month * 19.19 + 2.5) * 43758.5453; return v - Math.floor(v); })();
      this.fogDay = (cm >= 9 || cm <= 2) && k !== 'rain' && r2 < 0.22; this.storm = cm >= 6 && cm <= 8 && k === 'rain' && r2 < 0.45;
      if (this.weatherForce === 'fog') { this.fogDay = true; this.storm = false; k = 'cloudy'; } else if (this.weatherForce === 'storm') { this.storm = true; this.fogDay = false; k = 'rain'; } else if (this.weatherForce) { k = this.weatherForce; this.fogDay = false; this.storm = false; }
      if (this.wasRain && k === 'clear' && this.hour > 7 && this.hour < 17) this.rainbowT = 80; this.wasRain = k === 'rain';
      // レアな景色（4% ほどの日）：流星群・スーパームーン・オーロラ（夜）、飛行船・熱気球・遠くの富士山・二重の虹（昼）
      { const r3 = (() => { const v = Math.sin(this.dayNo * 7.77 + s.month * 3.31 + 9.1) * 43758.5453; return v - Math.floor(v); })(), r4 = (r3 * 97.3) % 1; this.rare = '';
        if (r3 < 0.045 || this.rareForce) { const pool = k === 'clear' ? ['meteor', 'supermoon', 'blimp', 'balloon', ...(cm === 11 || cm <= 2 ? ['fuji', 'fuji'] : []), 'aurora'] : k === 'cloudy' ? ['blimp', 'aurora'] : []; this.rare = this.rareForce || (pool.length ? pool[Math.floor(r4 * pool.length)] : ''); if (this.rare === 'double') this.rainbowT = 80; } }
      this.weather.kind = this.fogDay ? '霧' : this.storm ? '雷雨' : this.weather.kind;
      this.weather.kind = { clear: '晴れ', cloudy: 'くもり', rain: '雨', snow: '雪' }[k];
      this.wT = { rain: k === 'rain' ? 1 : 0, snow: k === 'snow' ? 1 : 0, cloud: k === 'clear' ? 0.12 : k === 'cloudy' ? 0.7 : 1 };
    }
    const w = this.weather, a = jump ? 1 : Math.min(1, dt * 0.35);
    w.rain += (this.wT.rain - w.rain) * a; w.snow += (this.wT.snow - w.snow) * a; w.cloud += (this.wT.cloud - w.cloud) * a;
    // 季節の色：4 月は桜、10〜11 月は紅葉、12〜2 月は冬枯れ
    const U = SEASON_U;
    U.uSakura.value = cm === 3 ? 1 : cm === 2 ? 0.35 : 0;
    U.uAutumn.value = cm === 10 ? 1 : cm === 9 ? 0.55 : cm === 11 ? 0.4 : 0;
    U.uWinter.value = cm === 11 || cm <= 1 ? 1 : cm === 2 ? 0.45 : 0;
    // 雪は降るほど積もり、冬はゆっくり、春はすぐ解ける。雨が降ると地面がぬれ、やむと乾く
    const winter = cm === 11 || cm <= 1;
    U.uSnow.value = jump && this.weatherForce ? (this.weatherForce === 'snow' ? 0.85 : 0) : Math.max(0, Math.min(1, U.uSnow.value + (w.snow > 0.5 ? dt * 0.04 : -dt * (winter ? 0.003 : 0.05))));
    U.uWet.value = jump && this.weatherForce ? (this.weatherForce === 'rain' ? 1 : 0) : Math.max(0, Math.min(1, U.uWet.value + (w.rain > 0.5 ? dt * 0.3 : -dt * 0.02)));
    this.matRoad.envMapIntensity = 0.05 + 0.7 * U.uWet.value; // 乾いた道はほとんど映らず、雨の道は空と明かりを映す
    // 雨と雪の粒（カメラのまわりの箱の中をくり返し落ちる）
    this.pT += dt;
    const R = this.mode === 'ground' ? 60 : Math.min(500, Math.max(110, this.dist * 0.55));
    const c = this.mode === 'ground' ? this.camera.position : this.target, NR = 3000, NS = 4000, o = this.pOff;
    this.rainLines.visible = w.rain > 0.03; this.snowPts.visible = w.snow > 0.03;
    if (this.rainLines.visible) {
      const pa = this.rainLines.geometry.attributes.position as THREE.BufferAttribute, L = R * 0.035, n = Math.round(NR * Math.min(1, w.rain));
      for (let i = 0; i < NR; i++) {
        if (i >= n) { pa.setXYZ(i * 2, 0, -1e4, 0); pa.setXYZ(i * 2 + 1, 0, -1e4, 0); continue; }
        let y = o[i * 3 + 1] - this.pT * 1.4; y = y - Math.floor((y + 1) / 2) * 2;
        const x = c.x + o[i * 3] * R, z = c.z + o[i * 3 + 2] * R, yy = c.y + y * R * 0.7;
        pa.setXYZ(i * 2, x, yy, z); pa.setXYZ(i * 2 + 1, x + L * 0.15, yy + L, z);
      }
      pa.needsUpdate = true; (this.rainLines.material as THREE.LineBasicMaterial).opacity = (this.mode === "ground" ? 0.6 : 0.42) * w.rain * (1 - this.night * 0.5);
    }
    if (this.snowPts.visible) {
      const pa = this.snowPts.geometry.attributes.position as THREE.BufferAttribute, n = Math.round(NS * Math.min(1, w.snow)), b = NR * 3;
      for (let i = 0; i < NS; i++) {
        if (i >= n) { pa.setXYZ(i, 0, -1e4, 0); continue; }
        let y = o[b + i * 3 + 1] - this.pT * 0.12; y = y - Math.floor((y + 1) / 2) * 2;
        const ph = this.pT * 0.8 + i;
        pa.setXYZ(i, c.x + o[b + i * 3] * R + Math.sin(ph) * R * 0.01, c.y + y * R * 0.7, c.z + o[b + i * 3 + 2] * R + Math.cos(ph * 0.7) * R * 0.01);
      }
      pa.needsUpdate = true; const m = this.snowPts.material as THREE.PointsMaterial; m.opacity = 0.9 * w.snow; m.size = R * 0.009;
    }
  }

  // ------------------------------------------------------------ 時刻と光
  private sunDir = new THREE.Vector3();
  applyTime(): void {
    // 日の出・日の入りは季節で変わる（夏至のころは 4:40〜18:50、冬至のころは 6:50〜16:40）
    const ph = Math.cos((this.calM + 0.5 - 6) / 12 * Math.PI * 2), half = 6 + 1.1 * ph, rise = 11.8 - half;
    const a = ((this.hour - rise) / (2 * half)) * Math.PI, e = Math.sin(a);
    this.sunDir.set(Math.cos(a), Math.max(e, -0.25) * 0.85, 0.6).normalize();
    const day = smooth(-0.08, 0.3, e), up = smooth(-0.25, 0.02, e), high = smooth(0.02, 0.4, e);
    const night = 1 - smooth(-0.06, 0.14, e);
    this.night = night;
    const C = (h: number) => new THREE.Color(h);
    const oc = this.weather.cloud, wet = Math.max(this.weather.rain, this.weather.snow);
    const grey = C(0x1a1d24).lerp(C(0x8d949c), day).lerp(C(0xc9ced4), this.weather.snow * day);
    const top = C(0x070b1c).lerp(C(0x35549a), up).lerp(C(0x2f79d6), high).lerp(grey, Math.min(0.92, oc * 0.85)); // v78：晴れの空を少し深い青に
    const hor = C(0x141b33).lerp(C(0xf0a070), up).lerp(C(0xbcdcf6), high).lerp(grey.clone().multiplyScalar(1.12), Math.min(0.9, oc * 0.8));
    // 太陽か月
    if (e > -0.1) { this.sun.color.copy(C(0xff9a58).lerp(C(0xfff3de), smooth(0.0, 0.5, e))); this.sun.intensity = 4.0 * smooth(-0.08, 0.22, e); }
    else { this.sunDir.set(-0.45, 0.8, 0.4).normalize(); this.sun.color.setHex(0x9db4e6); this.sun.intensity = 0.75; }
    this.hemi.color.copy(C(0x4a5f9a).lerp(C(0xcfe2ff), day)); this.hemi.groundColor.copy(C(0x1c2230).lerp(C(0x7b8660), day)); this.hemi.intensity = lerp(0.8, 0.95, day) * (1 + 0.25 * oc); // v78：晴れた日は空の光を抑えて、日なたと日かげの差をはっきり
    if (e > -0.1) this.sun.intensity *= 1 - 0.72 * Math.max(0, oc - 0.1) / 0.9; // 曇り・雨・雪の日は日差しが弱く、影が薄い
    (this.scene.fog as THREE.Fog).color.copy(hor);
    this.updateEnv(top, hor, this.hemi.groundColor, day, night);
    this.landmarks?.update(night, this.envRT?.texture ?? null, day);
    this.renderer.toneMappingExposure = lerp(0.92, 1.0, day);
    this.matWinA.emissiveIntensity = night * 1.9; NIGHT_U.value = night; NIGHT_UNI.uHour.value = this.hour; NIGHT_UNI.uT.value = performance.now() / 1000; SEASON_U.uTime.value = NIGHT_UNI.uT.value; SEASON_U.uWind.value = 0.7 + 1.6 * this.weather.rain + (this.storm ? 1.5 : 0);
    { const h = this.hour; WIN_LIT.value = h >= 16 && h < 19 ? 0.45 + 0.4 * ((h - 16) / 3) : h >= 19 && h < 22.5 ? 0.85 : h >= 22.5 ? 0.85 - 0.4 * ((h - 22.5) / 1.5) : h < 1.5 ? 0.45 - 0.2 * (h / 1.5) : h < 4.5 ? 0.22 : h < 7 ? 0.22 + 0.35 * ((h - 4.5) / 2.5) : 0.6; } this.matSign.emissiveIntensity = night * 0.75;
    this.matLamp.opacity = night * 0.95; this.matVend.opacity = night * 0.85; this.matPool.opacity = night * 0.5; if (this.pools) this.pools.visible = night > 0.02; this.matHead.opacity = night; this.matTail.opacity = Math.min(1, 0.5 + night); this.matTail.size = 2.6 * Math.max(1, Math.min(3.5, this.dist / 320)); /* v87：昼もブレーキランプの列が見え、遠くからでも詰まった道が分かる */ this.matStars.opacity = night * (1 - up) * 0.9 * (1 - oc);
    this.matCloud.color.copy(C(0x2a3350).lerp(C(0xffc9a8), up).lerp(C(0xffffff), high).lerp(C(0x6b7178).multiplyScalar(0.35 + 0.65 * day), Math.min(1, oc * 0.9)));
    if (this.clouds) this.clouds.scale.set(1, 1 + oc * 0.6, 1);
    this.renderer.toneMappingExposure *= 1 - 0.06 * wet;
    this.matWater.color.copy(C(0x16263c).lerp(C(0x3f7fa6), day)); { const d0 = C(0x3f7fa6); this.matSea.color.setRGB(this.matWater.color.r / d0.r, this.matWater.color.g / d0.g, this.matWater.color.b / d0.b); } // v95：頂点色の水面も同じ明るさで昼夜を変える
    // 空のグラデーションと太陽まわりの明るみ
    const pos = this.sky.geometry.attributes.position, col = this.sky.geometry.attributes.color as THREE.BufferAttribute, v = new THREE.Vector3(), c = new THREE.Color();
    const glow = C(0xffb060).lerp(C(0xfff0d0), high);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).normalize();
      c.copy(hor).lerp(top, Math.pow(Math.max(0, v.y), 0.55));
      const d = Math.max(0, v.dot(this.sunDir));
      if (e > -0.15) c.lerp(glow, Math.pow(d, 10) * 0.75 * (1 - night * 0.6));
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
    (this.sunDisc.material as THREE.MeshBasicMaterial).color.copy(e > -0.1 ? C(0xffd9a0).lerp(C(0xfffbe8), high) : C(0xdfe6f2));
    (this.sunDisc.material as THREE.MeshBasicMaterial).opacity = (e > -0.1 ? smooth(-0.1, 0.02, e) : 0.9) * (1 - Math.min(1, oc * 1.1));
    this.sunDisc.scale.setScalar(e > -0.1 ? 1 : 0.55);
  }

  // ------------------------------------------------------------ 道路
  private roadConn(s: GameState, x: number, y: number, dx: number, dy: number): number {
    const nx = x + dx, ny = y + dy;
    if (!inMap(nx, ny)) return GATEWAYS.includes(idx(x, y)) ? 3 : 0;
    return s.road[idx(nx, ny)];
  }
  private rebuildRoads(s: GameState): void {
    this.plaza.clear(); // v88：駅のまわりの歩道の立ち位置を作り直す
    const junction0 = (n: number) => n >= 3;
    this.clearGroup('roads');
    const m = this.map, g = new Geo();
    const lampPos: number[] = [], vendPos: number[] = [], sigPos: number[] = [];
    const pool = new Geo(true), kit = new Geo(true); // kit：路面の文字・矢印と標識の面（v86）
    const poles = new Map<number, [number, number, number]>();
    this.roadTiles = []; this.roadW = []; this.pedTiles = [];
    const hA = (wx: number, wz: number) => heightAt(m, wx, wz);
    if (REAL) {
      const r = realRoads(s, m, this.fine()), rm = new THREE.Mesh(r.geo.build(true), this.matRoad); rm.receiveShadow = true; rm.frustumCulled = false;
      this.scene.add(rm); this.groups.roads.push(rm); for (const v of r.lamps) lampPos.push(v);
    }
    this.tunnelSet = new Set(s.tunnel ?? []);
    this.computeDecks(s);
    if (s.rail) this.drawRails(s, g, lampPos, kit);
    this.drawWaterWorks(s, g, kit);
    const wideS = new Set((s.wide ?? []).filter(i => s.road[i] === 2)); for (const i of grade(s).spanOf.keys()) if (s.road[i] === 2) wideS.add(i); this.wideSet = wideS; // v94：立体交差の前後は、高架の両側に側道の車線が残る 6 車線の幅
    const hwAt = (xx: number, yy: number) => { const j = idx(xx, yy), r = s.road[j]; return r === 2 && wideS.has(j) ? HW[3] : HW[r]; };
    this.drawFlyovers(s, g);
    const stCharge = new Set(s.streets?.charge ?? []), stTree = new Set(s.streets?.tree ?? []), stStone = new Set(s.streets?.stone ?? []), stNo = new Set(s.streets?.nopole ?? []); kyodokoTiles(s, stNo); // v87：共同溝の周りも無電柱化
    // v86：路面の文字・矢印と標識の面（1 枚の絵、1 つのメッシュ）。細部は品質「中」以上、さらに細かい物は「高」だけ
    const fineR = this.fine(), hiR = fineR && this.quality === 'high', sig = this.signals(s);
    const connAt = (xx: number, yy: number) => { if (!inMap(xx, yy) || !s.road[idx(xx, yy)]) return 0; let n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) n += this.roadConn(s, xx, yy, dx, dy) ? 1 : 0; return n; };
    const schools = s.buildings.filter(b => (b.kind === 'school' || b.kind === 'nursery' || b.kind === 'nurseryS' || b.kind === 'nurseryL' || b.kind === 'jhs') && b.status !== 'construction');
    const schoolNear = (xx: number, yy: number) => schools.some(b => xx >= b.x - 3 && xx < b.x + b.w + 3 && yy >= b.y - 3 && yy < b.y + b.h + 3);
    // v89：シェアモビリティのポートを置ける所（駅のまわり 3 区画は 2、商業の建物の隣は 1）と、置いた数の上限（街の規模に応じて控えめに）
    const shareG = new Uint8Array(N); let shareCap = 0, shareN = 0; this.sharePos = [];
    if (fineR) { for (const b of s.buildings) { if (b.status !== 'operating') continue; const st = b.kind === 'station', r = st ? 3 : fam(b.kind) === 'shop' ? 1 : 0; if (!r) continue; shareCap += st ? 3 : 0.08;
      for (let yy = b.y - r; yy < b.y + b.h + r; yy++) for (let xx = b.x - r; xx < b.x + b.w + r; xx++) if (inMap(xx, yy)) shareG[idx(xx, yy)] = Math.max(shareG[idx(xx, yy)], st ? 2 : 1); }
      shareCap = Math.min(24, Math.round(shareCap)); }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = idx(x, y), t = s.road[i];
      if (!t) continue;
      this.roadTiles.push(i); this.roadW.push(0.3 + Math.min(2, s.vc[i]));
      if (t !== 3) this.pedTiles.push(i);
      if (REAL && m.fixedRoad![i]) continue; // 実在の道路は線で描いた。新しく引いた道路だけ区画の形で描く
      const cE = this.roadConn(s, x, y, 1, 0), cW = this.roadConn(s, x, y, -1, 0), cS = this.roadConn(s, x, y, 0, 1), cN = this.roadConn(s, x, y, 0, -1);
      // v95：交差点の区画は、つながる道のうち一番広い道の幅と等級で描く（狭い道の区画に広い道が入ると、交差点の中で広い道が細くなっていた）
      let hw = hwAt(x, y), tR: number = t, wideT = wideS.has(i);
      if ((cE ? 1 : 0) + (cW ? 1 : 0) + (cS ? 1 : 0) + (cN ? 1 : 0) >= 3) for (const [c, dx, dy] of [[cE, 1, 0], [cW, -1, 0], [cS, 0, 1], [cN, 0, -1]] as const) if (c) { const j = idx(x + dx, y + dy); hw = Math.max(hw, hwAt(x + dx, y + dy)); tR = Math.max(tR, s.road[j]); if (wideS.has(j)) wideT = true; }
      const cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE;
      const aE = cE ? Math.min(hw, hwAt(x + 1, y)) : 0, aW = cW ? Math.min(hw, hwAt(x - 1, y)) : 0, aS = cS ? Math.min(hw, hwAt(x, y + 1)) : 0, aN = cN ? Math.min(hw, hwAt(x, y - 1)) : 0;
      const nConn = (cE ? 1 : 0) + (cW ? 1 : 0) + (cS ? 1 : 0) + (cN ? 1 : 0);
      if (this.deckH.has(i) && this.drawDeck(s, g, i, x, y, hw, cE, cW, cS, cN)) continue;
      if (this.tunnelSet.has(i)) {
        // トンネル：路面は山の中。山の外の道路とつながる側に坑口（コンクリートの門と暗い穴、袖の擁壁）
        for (const [dx, dz, c] of [[1, 0, cE], [-1, 0, cW], [0, 1, cS], [0, -1, cN]] as const) {
          if (!c) continue; const j = idx(x + dx, y + dz); if (this.tunnelSet.has(j)) continue;
          const px = cx + dx * 15, pz = cz + dz * 15, py = hA(cx + dx * 17, cz + dz * 17), ww = hw * 2 + 3, top = Math.max(7.5, hA(cx, cz) - py + 2);
          g.at(px, py, pz, dx ? Math.PI / 2 * dx : (dz > 0 ? 0 : Math.PI));
          g.box(0, 0, -0.6, ww + 2.4, top, 1.2, 0xb9b6ae, 0x8f9a7a);            // 坑口の壁（上は草）
          g.box(0, -0.2, 0.62, ww - 1, 6.2, 0.06, 0x101113);                     // 暗い穴
          g.box(0, 6.4, 0.7, ww + 0.4, 0.5, 0.3, 0xcfccc4);                      // 門の梁
          for (const sx of [-1, 1]) { g.box(sx * (ww / 2 + 2.6), 0, 1.4, 3.2, top * 0.7, 0.8, 0xb0ada5, 0x8f9a7a); }
          g.box(0, 0.02, 3, hw * 2, 0.12, 6, 0x383b40);                          // 坑口の手前の路面
          g.at(0, 0, 0);
        }
        continue;
      }
      // v86：アスファルトの色は老朽度で連続的に変える（新しい道は黒く、古い道は白っぽく）。区画ごとに舗装し直した年が違うように、明るさを少しずらす
      const age = s.roadAge[i] ?? 0, ak = Math.min(1, age / 85), old = age > 70, asph = t === 3 ? mixHex(0x2b2e32, 0x54524d, ak) : mixHex(0x2f3236, 0x56544f, ak), tv = 1 + (hash(x, y, 11) - 0.5) * 0.07;
      const stone = stStone.has(i), kerbless = tR === 1 && !stone && !stTree.has(i), school = kerbless && schoolNear(x, y); // 生活道路：段差の歩道はなく、白線の外が路側帯（学校の近くは緑に塗る）
      // 曲がり角（2 方向だけ、直角につながる区画）は、円弧の道にする
      const bend = nConn === 2 && !!(cE || cW) && !!(cS || cN) && !this.deckH.has(i) ? [cE ? 1 : -1, cS ? 1 : -1] as const : null;
      const bendA = bend ? Math.min(cE ? aE : aW, cS ? aS : aN) : 0;
      const Wd = hw + walkW(hw); // v101：歩道の幅は等級ごと（walkW）
      // v95：路面・歩道（路側帯）・縁石・隅切り・切り下げ（render/roadbase.ts）。v101：歩道の幅は等級ごとに一定（walkW）、交差点の角は円弧
      roadBase({ g, cx, cz, hw, aE, aW, aS, aN, nConn, kerbless, stone, school, xw: hasXw(tR, stone, x, y, nConn), fine: fineR, hA, asph, shade: tv,
        pave: (k: number) => { const hc = hash(x * 12 + k, y * 12, 5); return tR === 3 || wideT ? [0xb7ab98, 0xa89c8a, 0xc2b6a2, 0x9d958a][((hc * 7) | 0) % 4] : [0xbab6ad, 0xb0aca3][((hc * 3) | 0) % 2]; },
        lowArm: (dx: number, dz: number) => { const xx = x + dx, yy = y + dz; if (!inMap(xx, yy)) return false; const j = idx(xx, yy); return s.road[j] === 1 && !stStone.has(j) && !stTree.has(j); },
        bend, bendA });
      // 走行中給電の道路：車線の真ん中に、給電コイルの青い線
      if (stCharge.has(i) && !bend) { const ew2 = !!(cE || cW); for (const o of [-Wd * 0.62, -Wd * 0.25, Wd * 0.25, Wd * 0.62]) { const wx = cx + (ew2 ? 0 : o), wz = cz + (ew2 ? o : 0); g.at(0, hA(wx, wz) + 0.06, 0); g.box(wx, 0, wz, ew2 ? TILE : 0.32, 0.02, ew2 ? 0.32 : TILE, 0x3ad0e8); } g.at(0, 0, 0); }
      // 並木道：両側の歩道に街路樹（交差点の中は植えない）
      if (stTree.has(i) && !junction0(nConn) && !bend) {
        const tc = this.treeCtx(g), ew2 = !!(cE || cW);
        for (const side of [-1, 1]) for (const along of [-7.5, 7.5]) { const wx = cx + (ew2 ? along : side * (Wd - 1.1)), wz = cz + (ew2 ? side * (Wd - 1.1) : along); g.at(0, hA(wx, wz) + 0.2, 0); g.box(wx, 0, wz, 1.6, 0.25, 1.6, 0x6b5a45); tree(tc, wx, wz, 0.72, (x + y + (side > 0 ? 1 : 0)) % 3 === 0 ? 1 : 0); }
        g.at(0, 0, 0);
      }
      // 路面標示
      const mark = (x0: number, z0: number, x1: number, z1: number, color: number) => {
        const X0 = cx + Math.min(x0, x1), X1 = cx + Math.max(x0, x1), Z0 = cz + Math.min(z0, z1), Z1 = cz + Math.max(z0, z1), o = 0.14;
        g.quad([X0, hA(X0, Z1) + o, Z1], [X1, hA(X1, Z1) + o, Z1], [X1, hA(X1, Z0) + o, Z0], [X0, hA(X0, Z0) + o, Z0], color);
      };
      const arms: [number, number, number][] = []; // [dx, dz, 半幅]
      if (aE) arms.push([1, 0, aE]); if (aW) arms.push([-1, 0, aW]); if (aS) arms.push([0, 1, aS]); if (aN) arms.push([0, -1, aN]);
      const junction = nConn >= 3;
      if (bend) {
        // 円弧の道の標示：中央線（幹線）と路側帯
        const dot = (a: number, rr: number, sz: number, color: number) => { const u = bend[0] * 15 - bend[0] * Math.cos(a) * rr, v = bend[1] * 15 - bend[1] * Math.sin(a) * rr; mark(u - sz, v - sz, u + sz, v + sz, color); };
        for (let k = 0; k <= 24; k++) { const a = (k / 24) * Math.PI / 2; for (const off of [-(bendA - 0.3), bendA - 0.3]) dot(a, 15 + off, 0.09, 0xdcdcd8); if (t >= 2 && k % 4 < 2) dot(a, 15, 0.12, t === 3 ? 0xf2c230 : 0xeeeeea); }
      }
      // v86：路面標示（等級・幅・交差点の形ごと）、縁石・側溝・植樹帯・ガードパイプ・信号機・標識（render/roadkit.ts）
      if (!bend) roadTile({ g, kit, s, i, x, y, t: tR, cx, cz, hw, Wd, aE, aW, aS, aN, nConn, kerbless, stone, wide: wideT, ak, hA, mark, sig: sig[i] === 1, fine: fineR, hi: hiR, conn: connAt, lamps: lampPos, sigs: sigPos, sigAt: (xx: number, yy: number) => inMap(xx, yy) && sig[idx(xx, yy)] === 1 });
      // 電柱・街灯
      const ew = !!(cE || cW), ns = !!(cS || cN);
      const px = cx + (ns ? -(Wd - 0.6) : 0), pz = cz + (ew ? -(Wd - 0.6) : (ns ? 0 : -(Wd - 0.6)));
      const py = hA(px, pz);
      poles.set(i, [px, py, pz]);
      if (t === 1 && stNo.has(i)) {
        // 無電柱化：電柱の代わりに細い街灯と、歩道の地上機器の箱
        const lx = ns && !ew ? 0.9 : 0, lz = ew ? 0.9 : 0;
        g.at(px, py, pz); g.cyl(0, 0, 0, 0.09, 5.2, 0x5a5e62, 6); g.box(lx / 2, 5.1, lz / 2, lx ? 0.9 : 0.06, 0.06, lz ? 0.9 : 0.06, 0x5a5e62); g.box(lx, 5.0, lz, 0.45, 0.1, 0.25, 0xf4f4f0);
        if ((x + y) % 3 === 0) g.box(ew ? 3 : 0, 0, ew ? 0 : 3, 0.8, 1.2, 0.5, 0x7a8a7a);
        lampPos.push(px + lx, py + 4.9, pz + lz);
        { const X = px + lx, Z = pz + lz, R = 8, Y = hA(X, Z) + 0.3; pool.quad([X - R, Y, Z + R], [X + R, Y, Z + R], [X + R, Y, Z - R], [X - R, Y, Z - R], 0xffffff); }
      } else if (t === 1) {
        g.at(px, py, pz); if (this.fine()) carMesh(g, VM.pole, 0, 0, ns && !ew ? 0 : Math.PI / 2, (t) => [0x8a8478, 0x6f6a60, 0xe8e8e0, 0x9aa0a4][t]); // 電柱（Blender：腕木・碍子・変圧器）
        else { g.cyl(0, 0, 0, 0.16, 9.2, 0x8a8478, 5); g.box(0, 8.2, 0, 1.9, 0.12, 0.12, 0x6f6a60); }
        const lx = ns && !ew ? 1.4 : 0, lz = ew ? 1.4 : 0;
        g.box(lx / 2, 5.6, lz / 2, lx ? 1.4 : 0.08, 0.08, lz ? 1.4 : 0.08, 0x8b9094); g.box(lx, 5.45, lz, 0.5, 0.14, 0.3, 0xe9e9e4);
        lampPos.push(px + lx, py + 5.35, pz + lz);
        { const X = px + lx, Z = pz + lz, R = 9, Y = hA(X, Z) + 0.3; pool.quad([X - R, Y, Z + R], [X + R, Y, Z + R], [X + R, Y, Z - R], [X - R, Y, Z - R], 0xffffff); }
      } else {
        // v86：街灯の型は通り（同じ行・列）ごとに変える。0 まっすぐな腕・1 先の曲がったベンド型（LED の薄い灯具）・2 車道と歩道の 2 灯。柱の色も銀と焦げ茶（景観に配慮した通り）
        const ax0 = ew ? y : x, lt = this.fine() ? (hash(ax0, ew ? 3 : 5, 61) * 3) | 0 : 0, pc = hash(ax0, ew ? 9 : 4, 62) < 0.3 ? 0x4b4640 : 0x8b9094, Hh = t === 3 || wideT ? 10 : 8.6, ln = t === 3 || wideT ? 2.6 : 2.0;
        const lx = ns && !ew ? 1 : 0, lz = ew ? 1 : 0;
        g.at(px, py, pz); g.cyl(0, 0, 0, lt === 1 ? 0.12 : 0.14, lt === 1 ? Hh - 0.7 : Hh, pc, 6);
        if (lt === 1) { for (let k = 1; k <= 3; k++) g.box(lx * k * 0.3, Hh - 0.75 + k * 0.22, lz * k * 0.3, 0.2, 0.2, 0.2, pc); g.box(lx * (0.9 + ln / 2), Hh, lz * (0.9 + ln / 2), lx ? ln : 0.1, 0.1, lz ? ln : 0.1, pc); g.box(lx * (ln + 0.8), Hh - 0.1, lz * (ln + 0.8), lx ? 0.9 : 0.36, 0.08, lz ? 0.9 : 0.36, 0xf4f4f0); }
        else { g.box(lx * ln / 2, Hh - 0.1, lz * ln / 2, lx ? ln : 0.1, 0.1, lz ? ln : 0.1, pc); g.box(lx * ln, Hh - 0.25, lz * ln, 0.7, 0.16, 0.4, 0xe9e9e4); }
        if (lt === 2) { g.box(-lx * 0.6, 4.8, -lz * 0.6, lx ? 1.2 : 0.08, 0.08, lz ? 1.2 : 0.08, pc); g.box(-lx * 1.15, 4.68, -lz * 1.15, 0.5, 0.14, 0.32, 0xe9e9e4); lampPos.push(px - lx * 1.15, py + 4.6, pz - lz * 1.15); } // 歩道を照らす低い灯
        const L2 = lt === 1 ? ln + 0.8 : ln; lampPos.push(px + lx * L2, py + Hh - 0.4, pz + lz * L2);
        { const X = px + lx * L2, Z = pz + lz * L2, R = 14, Y = hA(X, Z) + 0.3; pool.quad([X - R, Y, Z + R], [X + R, Y, Z + R], [X + R, Y, Z - R], [X - R, Y, Z - R], 0xffffff); }
      }
      g.at(0, 0, 0);
      // 街の細部（v49）：道ばたの自販機・ポスト・電話ボックス・ごみ集積所・猫。電柱と反対の歩道に、区画ごとに決まった物を置く
      if (t === 1 && (junction || bend) && this.fine() && ((x * 31 + y * 17) % 3 === 0 || (bend && (x + y) % 2 === 0))) { // 交差点の角・曲がり角の外側のカーブミラー（オレンジの柱と丸い鏡。2 面の鏡もある）
        const mo = bend ? 15 + bendA + walkW(bendA) - 0.5 : 0, qx = bend ? cx + bend[0] * 15 - bend[0] * mo * 0.7071 : cx + Wd - 0.4, qz = bend ? cz + bend[1] * 15 - bend[1] * mo * 0.7071 : cz + Wd - 0.4, qy = hA(qx, qz), two = hash(x, y, 71) < 0.4;
        g.at(qx, qy, qz, bend ? Math.atan2(bend[0], bend[1]) : 0); g.cyl(0, 0, 0, 0.06, 2.8, 0xf08a1a, 5);
        for (const sx of two ? [-0.5, 0.5] : [0]) { g.box(sx / 2, 2.72, -0.05, Math.abs(sx) + 0.06, 0.06, 0.06, 0xf08a1a); g.blob(sx, 2.75, -0.12, 0.44, 0.44, 0.07, 0xf08a1a, 10); g.blob(sx, 2.75, -0.2, 0.37, 0.37, 0.04, 0xd8e8f0, 10); }
        g.at(0, 0, 0); }
      if ((t === 1 || t === 2) && nConn === 2 && (ew !== ns) && this.fine()) { // 行き止まり（つながりが 1 つ）には置かない
        const hv = ((x * 73856093) ^ (y * 19349663)) >>> 0, kind = hv % 11, side = Wd - 0.7, along = ((hv >> 8) % 3 - 1) * 6;
        const qx = cx + (ew ? along : side), qz = cz + (ew ? side : along), qy = hA(qx, qz), ox = ew ? 0 : -1, oz = ew ? -1 : 0; // ox/oz：道路側を向く
        g.at(qx, qy, qz);
        if (kind <= 2) { // 自販機（2 台並び）。夜は前の道が白く照らされる
          { const fx = qx - ox * 0.6, fz2 = qz - oz * 0.6, R = 3.2, Y = hA(fx, fz2) + 0.28; pool.quad([fx - R, Y, fz2 + R], [fx + R, Y, fz2 + R], [fx + R, Y, fz2 - R], [fx - R, Y, fz2 - R], 0xcfe6ff); vendPos.push(qx - ox * 0.42, qy + 1.15, qz - oz * 0.42); }
          for (let k = 0; k < 2; k++) { const a2 = (k - 0.5) * 1.0, col = [0xd8342a, 0x2a5aa0, 0xf6f6f6, 0x3a8a4a][(hv >> 12 + k) & 3]; carMesh(g, VM.vending, ew ? a2 : 0, ew ? 0 : a2, ew ? 0 : Math.PI / 2, (t) => [col, 0xe8f4ff, 0x1a1a1a, 0x3a3a3a][t]); } // 自販機（Blender）
        } else if (kind === 3) { carMesh(g, VM.postbox, 0, 0, ew ? 0 : Math.PI / 2, (t) => [0xd8342a, 0x2a2a2a, 0xf4f4f0][t]); } // 郵便ポスト（Blender）
        else if (kind === 4 && t === 2) { g.box(0, 0, 0, 1.0, 2.2, 1.0, 0x9ac0a8); g.box(0, 2.2, 0, 1.1, 0.12, 1.1, 0x3a8a4a); } // 電話ボックス
        else if (kind === 5) { g.box(0, 0, 0, 1.6, 0.9, 1.0, 0x3a7a4a); for (let k = 0; k < 3; k++) g.blob(-0.4 + k * 0.4, 0.3, 0, 0.25, 0.28, 0.25, 0xe8ece8, 5); } // ごみ集積所（ネットと袋）
        else if (kind === 6) { g.blob(0, 0.22, 0, 0.22, 0.16, 0.12, [0xf2efe6, 0x2a2a2a, 0xc88a3a][(hv >> 5) % 3], 5); g.blob(ew ? 0.2 : 0, 0.36, ew ? 0 : 0.2, 0.1, 0.1, 0.1, [0xf2efe6, 0x2a2a2a, 0xc88a3a][(hv >> 5) % 3], 4); } // 猫
        else if (kind === 7) { g.box(0, 0, 0, 0.6, 1.0, 0.6, 0x9a9a92); g.box(0, 1.0, 0, 0.9, 0.3, 0.9, 0xb8b4ac); } // 消火栓の標識の代わりに防火水槽の箱
        else if (kind === 8 && t === 2) { g.cyl(0, 0, 0, 0.06, 2.4, 0x9aa0a6, 4); g.box(0, 2.3, 0, ew ? 0.6 : 0.05, 0.6, ew ? 0.05 : 0.6, 0x2a5aa0); } // 案内標識
        else if (kind >= 9 && shareN < shareCap && (shareG[i] || sig[i - 1] || sig[i + 1] || sig[i - W] || sig[i + W]) && hash(x, y, 97) < (shareG[i] === 2 ? 0.55 : shareG[i] ? 0.3 : 0.35)) { shareN++; this.sharePos.push(i); g.at(0, 0, 0); this.sharePort(g, qx, qy, qz, ew, ox, oz, hv); } // v89：シェアモビリティのポート
        g.at(0, 0, 0);
      }
    }
    // 電線（市道の電柱どうし）
    for (const [i, p] of poles) {
      if (s.road[i] !== 1 || (REAL && !REAL.deformed)) continue;
      for (const j of [i + 1, i + W]) {
        if (j % W === 0 && j === i + 1) continue;
        const q = poles.get(j); if (!q || s.road[j] !== 1 || stNo.has(i) || stNo.has(j)) continue;
        // v86：電線は柱の間でたるませる（高圧線 2 本と、低い所の太い通信ケーブル）
        const m3 = (a: number) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 + a, (p[2] + q[2]) / 2] as [number, number, number];
        for (const [dy, sg, th, col] of [[8.3, 0.45, 0.05, 0x2c2e30], [7.4, 0.4, 0.05, 0x2c2e30], [5.9, 0.3, this.fine() ? 0.1 : 0, 0x222325]] as const) { if (!th) continue; const M = m3(dy - sg);
          for (const [A, B] of [[[p[0], p[1] + dy, p[2]], M], [M, [q[0], q[1] + dy, q[2]]]] as [[number, number, number], [number, number, number]][]) { g.quad(A, B, [B[0], B[1] + th, B[2]], [A[0], A[1] + th, A[2]], col); g.quad(B, A, [A[0], A[1] + th, A[2]], [B[0], B[1] + th, B[2]], col); } }
      }
    }
    // v87：送電線（鉄塔・発電所・変電所）と、道ばたの水道の設備
    if (!REAL) { drawPowerLines(s, g, b => this.place(s, b), hA, fineR); if (fineR) drawUtilities(s, g, (i, x, z) => this.deckH.get(i) ?? hA(x, z), t => HW[t] + walkW(HW[t]) * 0.5); }
    const mesh = new THREE.Mesh(g.build(!!REAL), this.matRoad); mesh.receiveShadow = true; mesh.castShadow = false; mesh.frustumCulled = false;
    this.scene.add(mesh); this.groups.roads.push(mesh);
    if (kit.ix.length) { const km = new THREE.Mesh(kit.build(), roadKitMat()); km.receiveShadow = true; km.frustumCulled = false; this.scene.add(km); this.groups.roads.push(km); }
    if (this.lamps) { this.scene.remove(this.lamps); this.lamps.geometry.dispose(); }
    const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(lampPos), 3));
    this.lamps = new THREE.Points(lg, this.matLamp); this.lamps.frustumCulled = false; this.scene.add(this.lamps);
    if (this.vends) { this.scene.remove(this.vends); this.vends.geometry.dispose(); }
    { const vg = new THREE.BufferGeometry(); vg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vendPos), 3)); this.vends = new THREE.Points(vg, this.matVend); this.vends.frustumCulled = false; this.scene.add(this.vends); }
    this.buildSigLights(sigPos);
    if (this.pools) { this.scene.remove(this.pools); this.pools.geometry.dispose(); }
    this.pools = new THREE.Mesh(pool.build(), this.matPool); this.pools.frustumCulled = false; this.pools.renderOrder = 3; this.scene.add(this.pools);
    if (this.agentRoadVer !== s.roadVersion * 1000 + sid(s)) { this.agentRoadVer = s.roadVersion * 1000 + sid(s); this.spawnAgents(); }
  }
  /** v89：シェアモビリティの貸し出し場所（歩道の区画線と薄い色の床、短いラックにシェア自転車、電動キックボード、案内の小さな立て札）。ブランドの名前やロゴは描かない。
   *  u は道に沿う向き、v は道路の側（ox, oz）。y は足もとから */
  /** v89：ポートを置いた区画（撮影・確かめ用） */
  sharePos: number[] = [];
  private sharePort(g: Geo, qx: number, qy: number, qz: number, ew: boolean, ox: number, oz: number, hv: number): void {
    const B = (u: number, y: number, v: number, lu: number, h: number, lv: number, col: number) => g.box(qx + (ew ? u : 0) + ox * v, qy + y, qz + (ew ? 0 : u) + oz * v, ew ? lu : lv, h, ew ? lv : lu, col);
    const fc = [0xe8c030, 0x2aa060, 0xd8382c, 0x2a8ac8][(hv >> 14) & 3], kc = [0x2a2c30, 0x2aa060, 0xf2f2ee][(hv >> 16) % 3];
    B(0, 0.02, 0, 4.4, 0.02, 1.4, 0x8a9aa8); for (const v of [-0.7, 0.7]) B(0, 0.045, v, 4.4, 0.02, 0.07, 0xf2f2ee); for (const u of [-2.2, 0.35, 2.2]) B(u, 0.045, 0, 0.07, 0.02, 1.4, 0xf2f2ee); // 床と白い区画線
    for (const u of [-1.95, 0.15]) B(u, 0.05, -0.55, 0.06, 0.55, 0.06, 0x9aa0a6); B(-0.9, 0.55, -0.55, 2.16, 0.06, 0.06, 0x9aa0a6); // 短いラック
    for (const u of [-1.6, -0.9, -0.2]) { // 自転車（ラックに前輪を入れて、道路へ向けて並ぶ）。車輪は細い板、前にかご
      for (const v of [-0.42, 0.42]) B(u, 0.05, v, 0.04, 0.6, 0.6, 0x1a1a1c); B(u, 0.42, 0, 0.06, 0.06, 0.8, fc); B(u, 0.38, 0.12, 0.05, 0.42, 0.06, fc); B(u, 0.8, 0.12, 0.18, 0.05, 0.22, 0x2a2c30);
      B(u, 0.75, -0.38, 0.4, 0.04, 0.05, 0x2a2c30); B(u, 0.6, -0.5, 0.26, 0.2, 0.2, 0x9aa0a6); B(u, 0.4, -0.38, 0.05, 0.38, 0.05, fc); }
    for (const u of [0.85, 1.35, 1.85]) { // 電動キックボード（人は乗せない）：低い踏み板と立てたハンドル
      B(u, 0.06, 0, 0.16, 0.08, 0.8, kc); for (const v of [-0.42, 0.42]) B(u, 0.0, v, 0.06, 0.18, 0.18, 0x1a1a1c); B(u, 0.12, -0.38, 0.05, 0.95, 0.05, 0x3a3a3c); B(u, 1.05, -0.38, 0.44, 0.04, 0.05, 0x2a2c30); B(u, 0.82, -0.38, 0.1, 0.1, 0.06, fc); }
    B(2.45, 0, -0.55, 0.06, 1.25, 0.06, 0x9aa0a6); B(2.45, 1.1, -0.55, 0.42, 0.34, 0.05, fc); B(2.45, 1.16, -0.53, 0.32, 0.08, 0.055, 0xf2f2ee); // 案内の小さな立て札（色の板に白い帯。文字は描かない）
  }
  private agentRoadVer = -1;
  // v89：信号の灯（車両用の青・黄・赤、歩行者用の赤・青）。灯だけを 1 つの InstancedMesh と、遠くからも分かる光の点（Points）にまとめ、周期の変わり目に色だけ塗り替える
  private sigMesh: THREE.InstancedMesh | null = null; private sigPts: THREE.Points | null = null; private sigData: number[] = []; private sigKey = '';
  private matSig = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  private matSigPt = new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: true, vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  private buildSigLights(d: number[]): void {
    for (const o of [this.sigMesh, this.sigPts]) if (o) { this.scene.remove(o); o.geometry.dispose(); }
    this.sigMesh = this.sigPts = null; this.sigData = d; this.sigKey = ''; const n = d.length / 7; if (!n) return;
    const m = new THREE.InstancedMesh(new THREE.BoxGeometry(0.34, 0.34, 0.05), this.matSig, n), M = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1), pts = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) { const b = k * 7, nx = d[b + 3], nz = d[b + 4]; q.setFromAxisAngle(up, Math.atan2(nx, nz)); m.setMatrixAt(k, M.compose(p.set(d[b], d[b + 1], d[b + 2]), q, sc)); m.setColorAt(k, this.tmpC.setRGB(0, 0, 0));
      pts[k * 3] = d[b] + nx * 0.25; pts[k * 3 + 1] = d[b + 1]; pts[k * 3 + 2] = d[b + 2] + nz * 0.25; } // 光の点は灯器の少し前へ（後ろからは灯器の箱に隠れる）
    m.frustumCulled = false; this.sigMesh = m; this.scene.add(m);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pts, 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    if (!this.matSigPt.map && typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d'); if (x) { const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.35, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, 32, 32); this.matSigPt.map = new THREE.CanvasTexture(c); this.matSigPt.needsUpdate = true; } } // 丸くにじむ光
    this.sigPts = new THREE.Points(g, this.matSigPt); this.sigPts.frustumCulled = false; this.sigPts.renderOrder = 4; this.scene.add(this.sigPts);
  }
  /** 車・歩行者と同じ周期（36 秒、前半は東西・後半は南北が青、各半分の終わり 2 秒が黄）で点灯を決める。歩行者の青は黄の前の 4 秒に点滅し、黄からは赤 */
  private sigLights(cyc: number, axis: number, amber: boolean): void {
    if (!this.sigMesh || !this.sigPts) return;
    const ph = cyc % 18, blink = ph > 11.5 && ph <= 15, on = !blink || (ph * 4 | 0) % 2 === 0, key = `${axis}${amber ? 1 : 0}${on ? 1 : 0}`;
    const n = this.night; this.matSig.color.setScalar(1.3 + 2.2 * n); this.matSigPt.opacity = 0.75 + 0.25 * n; this.matSigPt.size = 1.5 * Math.min(6, Math.max(1, this.dist / 90)); // 近くでは灯の大きさ、遠くでは赤・青が見分けられる大きさ
    if (key === this.sigKey) return; this.sigKey = key;
    const d = this.sigData, nn = d.length / 7, ca = this.sigPts.geometry.attributes.color as THREE.BufferAttribute, c = this.tmpC;
    const LIT = [0x1ee0b4, 0xffb020, 0xff3020, 0xff3a2a, 0x2ee8c0], OFF = [0x0c2a24, 0x2e240c, 0x2e0e0c, 0x2e100c, 0x0c2a24];
    for (let k = 0; k < nn; k++) { const kind = d[k * 7 + 5], mine = d[k * 7 + 6] === axis;
      const lit = kind === 0 ? mine && !amber : kind === 1 ? mine && amber : kind === 2 ? !mine : kind === 3 ? !mine || amber : mine && !amber && on;
      c.setHex(lit ? LIT[kind] : OFF[kind]); this.sigMesh.setColorAt(k, c); if (lit) ca.setXYZ(k, c.r, c.g, c.b); else ca.setXYZ(k, 0, 0, 0); }
    this.sigMesh.instanceColor!.needsUpdate = true; ca.needsUpdate = true;
  }
  private infraV = -1; private infraK = '';
  /** トンネルの区画（路面を描かず、車と人は山の中を通る＝見えない） */
  tunnelSet = new Set<number>();
  /** 橋・陸橋の路面の高さ（区画ごと）。陸橋は両側の区画に坂（rampOf：坂の区画→陸橋の区画） */
  private shore: ReturnType<typeof makeShore> = null;
  deckH = new Map<number, number>(); private rampOf = new Map<number, number>();
  /** 橋と陸橋の高さを決める：橋はつながった橋の区画のまわりの岸の高さ、陸橋は線路の上 7.5m */
  private computeDecks(s: GameState): void {
    const m = this.map, hA = (x: number, z: number) => heightAt(m, x, z);
    this.deckH.clear(); this.rampOf.clear();
    const br = new Set(s.bridge ?? []), seen = new Set<number>(), tun = new Set(s.tunnel ?? []), S1 = W + 1;
    // 水面の上や、水面より低い岸を通る道路（はじめからある国道・幹線など）も橋として描く（水に沈んで見えないように）
    for (let i = 0; i < N; i++) {
      if (!s.road[i] || br.has(i) || tun.has(i) || s.rail?.[i]) continue;
      const x = i % W, y = (i / W) | 0;
      if (m.water[i] || m.dug?.[i]) { br.add(i); continue; }
      const lo = Math.min(m.heights[y * S1 + x], m.heights[y * S1 + x + 1], m.heights[(y + 1) * S1 + x], m.heights[(y + 1) * S1 + x + 1]);
      if (lo < -1.2) { let nearW = false; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (inMap(xx, yy) && (m.water[idx(xx, yy)] || m.dug?.[idx(xx, yy)])) nearW = true; } if (nearW) br.add(i); }
    }
    for (const b0 of br) {
      if (seen.has(b0)) continue;
      const grp = [b0]; seen.add(b0);
      for (let k = 0; k < grp.length; k++) { const i = grp[k], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = idx(x + dx, y + dy); if (inMap(x + dx, y + dy) && br.has(j) && !seen.has(j)) { seen.add(j); grp.push(j); } } }
      let top = -1e9;
      for (const i of grp) { const x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [0, 0]]) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; top = Math.max(top, hA((xx + 0.5) * TILE, (yy + 0.5) * TILE)); } }
      for (const i of grp) this.deckH.set(i, top + 1.2);
    }
    // v94：形の成り立つ陸橋だけを高くする。坂は道路の向きの前後 2 区画（60m）だけ（前は 4 方向の隣の区画すべてが 30m で 7.5m 上がる坂で、脇道からも坂に入っていた）
    for (const o of grade(s).ovp.values()) {
      const x = o.i % W, y = (o.i / W) | 0, h = hA((x + 0.5) * TILE, (y + 0.5) * TILE) + OVP_H; this.deckH.set(o.i, h);
      for (const j of o.ramps) this.rampOf.set(j, o.i);
    }
  }
  /** 足もとの高さ（橋・陸橋・その坂の上では路面の高さ） */
  surfY(px: number, pz: number): number {
    const m = this.map, x = Math.floor(px / TILE), y = Math.floor(pz / TILE), g = heightAt(m, px, pz);
    if (!inMap(x, y)) return g;
    const i = idx(x, y), d = this.deckH.get(i); if (d !== undefined) return Math.max(g, d);
    const o = this.rampOf.get(i); if (o === undefined) return g;
    const ox = (o % W + 0.5) * TILE, oz = (((o / W) | 0) + 0.5) * TILE, dist = Math.max(Math.abs(px - ox), Math.abs(pz - oz)); // 陸橋の中心からの距離（15〜75m）
    const k = View.rampK(dist);
    return Math.max(g, g + (this.deckH.get(o)! - g) * k);
  }
  /** 陸橋の坂：中心から 15m（踏切の区画の端）までは平ら、そこから 60m で地面へ（なめらかに） */
  private static rampK(dist: number): number { const t = Math.max(0, Math.min(1, (15 + OVP_RAMP * TILE - dist) / (OVP_RAMP * TILE))); return t * t * (3 - 2 * t); }
  /** 橋・陸橋の区画の路面（桁・欄干・橋脚）。描いたら true */
  private drawDeck(s: GameState, g: Geo, i: number, x: number, y: number, hw: number, cE: number, cW: number, cS: number, cN: number): boolean {
    const m = this.map, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, yD = this.deckH.get(i)!, ew = !!(cE || cW), ns = !!(cS || cN);
    const over = grade(s).ovp.has(i), wd = hw * 2 + (over ? 3 : 5), con = over ? 0xb8b6ae : 0xa9a69e, rail = over ? 0x8b9094 : 0xd8d6cf;
    const along = ew && !ns ? 'x' : !ew && ns ? 'z' : 'both';
    const sx = along === 'z' ? wd : TILE + 0.2, sz = along === 'x' ? wd : TILE + 0.2;
    g.box(cx, yD - 1.4, cz, sx, 1.4, sz, con, 0x383b40);                                   // 桁と路面
    if (along !== 'both') for (const sg of [-1, 1]) { const o = sg * (wd / 2 - 0.15); if (along === 'x') g.box(cx, yD, cz + o, TILE, 1.1, 0.3, rail); else g.box(cx + o, yD, cz, 0.3, 1.1, TILE, rail); } // 欄干
    if (along !== 'both') { const lw = 0.1; for (let d = -14; d < 15; d += 5) { if (along === 'x') g.box(cx + d + 1.3, yD + 0.01, cz, 2.6, 0.03, lw * 2, 0xeeeeea); else g.box(cx, yD + 0.01, cz + d + 1.3, lw * 2, 0.03, 2.6, 0xeeeeea); } }
    // 橋げた：路面の下に鋼の主桁 2 本と横桁（陸橋はコンクリートの箱桁のまま）
    // v100：桁の下が水面に近い低い橋は、鋼の主桁を下げず、路面の床版（1.4m）だけの床版橋にする（前は主桁が水に浸かっていた）
    const wl = this.shore ? this.shore.level(x + 0.5, y + 0.5) : NaN, lowDeck = Number.isFinite(wl) && yD - 3.4 < wl + 0.6;
    if (!over && along !== 'both' && !lowDeck) { const steel = 0x6f7880;
      for (const sg of [-1, 1]) { const o = sg * (wd / 2 - 2.2); if (along === 'x') g.box(cx, yD - 3.4, cz + o, TILE + 0.2, 2.0, 0.7, steel); else g.box(cx + o, yD - 3.4, cz, 0.7, 2.0, TILE + 0.2, steel); }
      for (const d of [-10, 0, 10]) { if (along === 'x') g.box(cx + d, yD - 3.0, cz, 0.4, 1.4, wd - 4.2, steel); else g.box(cx, yD - 3.0, cz + d, wd - 4.2, 1.4, 0.4, steel); } }
    // 橋脚：川底（水面）・谷底から桁まで。谷を渡る高い橋は太い角柱と、梁（はり）で支える
    const canalT = (s.canal ?? []).includes(i), ground0 = heightAt(m, cx, cz), gy = ground0 - (over ? 0 : m.water[i] || m.dug?.[i] ? 3 : 0.5), tall = !over && yD - gy > 14;
    if (tall && along !== 'both') { // v100：区画ごと（30m おき）。前は 1 区画おきで、高い橋は 60m の径間になっていた
      for (const sg of [-1, 1]) { const o = sg * (wd / 2 - 2.2); g.box(cx + (along === 'z' ? o : 0), gy, cz + (along === 'x' ? o : 0), 2.4, yD - 3.4 - gy, 2.4, 0xb3b0a8); }
      if (along === 'x') g.box(cx, yD - 4.6, cz, 2.6, 1.2, wd - 1, 0xa9a69e); else g.box(cx, yD - 4.6, cz, wd - 1, 1.2, 2.6, 0xa9a69e);
      for (let hy = gy + 12; hy < yD - 8; hy += 12) { if (along === 'x') g.box(cx, hy, cz, 1.2, 0.9, wd - 4.4, 0xb3b0a8); else g.box(cx, hy, cz, wd - 4.4, 0.9, 1.2, 0xb3b0a8); } // つなぎ梁
    }
    if (!tall) {
    // v95：陸橋の橋脚は線路（区画の中心を横切る）の上に立てず、区画の両端（線路から 12m 離れた所）の、桁の両縁の下に立てる
    if (over && along !== 'both') { for (const ea of [-12.5, 12.5]) for (const sg of [-1, 1]) { const o = sg * (wd / 2 - 1.6); g.cyl(cx + (along === 'x' ? ea : o), gy, cz + (along === 'x' ? o : ea), 0.8, yD - 1.4 - gy, con, 10); } }
    else if (!over && along !== 'both' && canalT) { for (const ea of [-13, 13]) for (const sg of [-1, 1]) { const o = sg * (wd / 2 - 2); g.cyl(cx + (along === 'x' ? ea : o), ground0 - 0.3, cz + (along === 'x' ? o : ea), 0.9, yD - 1.4 - ground0 + 0.3, con, 10); } } // v100：水路の上は、水路の外（両岸）に橋脚を立てる
    else for (const sg of [-1, 1]) { const ox = along === 'z' ? sg * (wd / 2 - 2) : 0, oz = along === 'z' ? 0 : sg * (wd / 2 - 2); if (along === 'both' && sg > 0) continue; g.cyl(cx + (over ? ox : ox * 0.2), gy, cz + (over ? oz : oz * 0.2), over ? 0.9 : 1.4, yD - 1.4 - gy, con, 10); }
    }
    // 陸橋の坂：道路の向きの前後 2 区画（60m）の上に、陸橋から地面へ下りる路面と壁（v94：前は 30m で 7.5m＝25% の坂を、隣の区画すべてに）
    if (over) { const ov = grade(s).ovp.get(i)!;
      for (const sg of [-1, 1]) {
        const ux = ov.ew ? sg : 0, uz = ov.ew ? 0 : sg, px = ov.ew ? 0 : wd / 2, pz = ov.ew ? wd / 2 : 0, L = OVP_RAMP * TILE, n = 8;
        const yAt = (u: number) => { const gx = cx + ux * u, gz = cz + uz * u, g0 = heightAt(m, gx, gz) + 0.15; return Math.max(g0, g0 + (yD - g0) * View.rampK(u)); };
        for (let k = 0; k < n; k++) {
          const u0 = 15 + (L * k) / n, u1 = 15 + (L * (k + 1)) / n, y0 = yAt(u0), y1 = yAt(u1);
          const a: [number, number, number] = [cx + ux * u0 - px, y0, cz + uz * u0 - pz], b: [number, number, number] = [cx + ux * u0 + px, y0, cz + uz * u0 + pz];
          const c2: [number, number, number] = [cx + ux * u1 + px, y1, cz + uz * u1 + pz], d: [number, number, number] = [cx + ux * u1 - px, y1, cz + uz * u1 - pz];
          g.quad(a, d, c2, b, 0x3c3f44); g.quad(a, b, c2, d, 0x3c3f44);
          for (const e of [-1, 1]) { const ex = px * e, ez = pz * e, g0 = heightAt(m, cx + ux * u0, cz + uz * u0), g1 = heightAt(m, cx + ux * u1, cz + uz * u1);
            const t0: [number, number, number] = [cx + ux * u0 + ex, y0 + 1, cz + uz * u0 + ez], t1: [number, number, number] = [cx + ux * u1 + ex, y1 + 1, cz + uz * u1 + ez], b1: [number, number, number] = [cx + ux * u1 + ex, g1 - 0.3, cz + uz * u1 + ez], b0: [number, number, number] = [cx + ux * u0 + ex, g0 - 0.3, cz + uz * u0 + ez];
            g.quad(b0, b1, t1, t0, con); g.quad(t0, t1, b1, b0, con); }
        }
      }
    }
    return true;
  }
  /** 水路（掘った運河：石の護岸と水面、岸の散歩道）と歩道橋（道路をまたぐ青い橋と両側の階段） */
  private drawWaterWorks(s: GameState, g: Geo, kit?: Geo): void {
    const m = this.map, hA = (x: number, z: number) => heightAt(m, x, z), canal = new Set(s.canal ?? []);
    const wet = (x: number, y: number) => inMap(x, y) && (canal.has(idx(x, y)) || !!m.water[idx(x, y)]);
    for (const i of canal) {
      const x = i % W, y = (i / W) | 0, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, h = Math.max(hA(cx, cz), hA(cx - 15, cz - 15), hA(cx + 15, cz - 15), hA(cx - 15, cz + 15), hA(cx + 15, cz + 15)) + 0.25, cw = 7; // 地面より少し高く（斜面でも地面に埋もれない）
      const E = wet(x + 1, y), Wt = wet(x - 1, y), S = wet(x, y + 1), N = wet(x, y - 1);
      const x0 = E || Wt ? (Wt ? -15 : -cw) : -cw, x1 = E || Wt ? (E ? 15 : cw) : cw, z0 = S || N ? (N ? -15 : -cw) : -cw, z1 = S || N ? (S ? 15 : cw) : cw;
      // 散歩道と植え込み（水路の両岸）
      g.box(cx, h - 0.6, cz, 30, 0.6, 30, 0xc9c2b0, 0xd6cfbd);
      if (!(E || Wt) || !(S || N)) for (const [a, b] of [[-11, -11], [11, 11], [-11, 11], [11, -11]]) tree(this.treeCtx(g), cx + a, cz + b, 0.7);
      // 水面（横の流れと縦の流れ）
      const water = 0x3f7fa6, stone = 0x9a958a;
      if (E || Wt || !(S || N)) { g.box(cx + (x0 + x1) / 2, h - 0.6, cz, x1 - x0, 0.75, cw * 2, stone, water); for (const sg of [-1, 1]) g.box(cx + (x0 + x1) / 2, h - 0.6, cz + sg * (cw + 0.4), x1 - x0, 1.1, 0.8, stone); }
      if (S || N) { g.box(cx, h - 0.6, cz + (z0 + z1) / 2, cw * 2, 0.74, z1 - z0, stone, water); for (const sg of [-1, 1]) g.box(cx + sg * (cw + 0.4), h - 0.6, cz + (z0 + z1) / 2, 0.8, 1.1, z1 - z0, stone); }
    }
    // 堤防：芝の土手と、上の管理用通路（川側は石張り）
    const lev = new Set(s.levee ?? []);
    for (const i of lev) {
      const x = i % W, y = (i / W) | 0, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, h = Math.min(hA(cx, cz), hA(cx - 14, cz - 14), hA(cx + 14, cz + 14)) - 0.3;
      const ew = lev.has(idx(x + 1, y)) || lev.has(idx(x - 1, y)) || wet(x, y - 1) || wet(x, y + 1); // 土手の向き（横に続くか、水が上下にあるなら東西に延びる）
      g.at(cx, h, cz, ew ? 0 : Math.PI / 2);
      g.box(0, 0, 0, 30.2, 2.2, 28, 0x6f9a4a, 0x7fae52); g.box(0, 2.2, 0, 30.2, 2.0, 18, 0x6f9a4a, 0x7fae52); g.box(0, 4.2, 0, 30.2, 1.4, 9, 0x6f9a4a, 0x86b25a);
      g.box(0, 5.6, 0, 30.2, 0.15, 4, 0xc9c2b0); // 天端の通路
      const wz = wet(x, y - 1) || wet(x - 1, y) ? -1 : 1; g.box(0, 0, wz * 12.5, 30.2, 3.6, 3, 0x9a958a); // 川側の護岸
      g.at(0, 0, 0);
    }
    // バス停：歩道に屋根つきの待合所と標識
    for (const i of s.busStops ?? []) {
      const x = i % W, y = (i / W) | 0, t = s.road[i]; if (!t) continue;
      const ew = (inMap(x + 1, y) && !!s.road[idx(x + 1, y)]) || (inMap(x - 1, y) && !!s.road[idx(x - 1, y)]);
      // v101：交差点の区画には待合所を置かない（歩道の角・横断歩道に重なっていた）。交差点の隣の区画では、交差点から遠い側の端へ寄せる（交差点・横断歩道から離す）
      if (this.roadDeg(s, i) >= 3) continue;
      const [ux, uz] = ew ? [1, 0] : [0, 1], jA = this.roadDeg2(s, x + ux, y + uz), jB = this.roadDeg2(s, x - ux, y - uz), shift = jA && !jB ? -5 : jB && !jA ? 5 : 0;
      const cx = (x + 0.5) * TILE + ux * shift, cz = (y + 0.5) * TILE + uz * shift, tw = t === 2 && this.wideSet?.has(i) ? 3 : t;
      const hw = HW[tw] + walkW(HW[tw]) * 0.5, h = this.deckH.get(i) ?? hA(cx, cz);
      g.at(cx, h, cz, ew ? 0 : Math.PI / 2); // 道路が東西なら、待合所は道路の南の歩道
      g.box(-3, 0, hw + 0.2, 0.15, 2.6, 0.15, 0x6a6f76); g.box(-6, 0, hw + 0.2, 0.15, 2.6, 0.15, 0x6a6f76);
      g.box(-4.5, 2.6, hw + 0.4, 4, 0.18, 1.6, 0x2a4a7a); g.box(-4.5, 0.5, hw + 0.9, 3.4, 0.12, 0.6, 0x8a6a4a); g.box(-4.5, 0.2, hw + 1.15, 3.6, 2.3, 0.08, 0xbfd8e8);
      g.box(1.5, 0, hw + 0.3, 0.12, 2.8, 0.12, 0x9aa0a6);
      if (kit && this.fine()) { // v86：停留所の標識は丸い板（緑の輪とバスの絵）を両面に、柱に時刻表、待合所の中にベンチ
        g.box(1.5, 2.45, hw + 0.3, 0.06, 1.0, 1.0, 0x9aa0a6); g.box(1.5, 1.0, hw + 0.3, 0.2, 0.7, 0.45, 0xf2f2ee); g.box(-4.5, 0.42, hw + 0.95, 3.2, 0.08, 0.4, 0x7a5a3a);
        const r2 = ew ? 0 : Math.PI / 2, c = Math.cos(r2), sn = Math.sin(r2), wx = cx + 1.5 * c + (hw + 0.3) * sn, wz = cz - 1.5 * sn + (hw + 0.3) * c;
        for (const f of [-1, 1]) face(kit, RK.sBus, wx + c * f * 0.04, h + 2.95, wz - sn * f * 0.04, c * f, -sn * f, 0.95, 0.95);
      } else g.cyl(1.5, 2.8, hw + 0.3, 0.6, 0.12, 0x2a4a7a, 10, 0xf2f2f2); // 停留所の標識
      g.at(0, 0, 0);
    }
    for (const i of s.footbridge ?? []) {
      const x = i % W, y = (i / W) | 0, cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, t = s.road[i]; if (!t || grade(s).footBad.has(i)) continue; // v94：高架・陸橋・踏切と重なる歩道橋は描かない（効きもしない）
      const ew = (inMap(x + 1, y) && s.road[idx(x + 1, y)]) || (inMap(x - 1, y) && s.road[idx(x - 1, y)]);
      const hw = HW[t] + walkW(HW[t]), H5 = 5.4, blue = 0x4f7fa8, h = this.deckH.get(i) ?? hA(cx, cz);
      g.at(cx, h, cz, ew ? Math.PI / 2 : 0); // 道路が東西なら、橋は南北にまたぐ
      g.box(0, H5, 0, 2.6, 0.5, hw * 2 + 2, blue);                                                             // 桁
      for (const sg of [-1, 1]) { g.box(sg * 1.25, H5 + 0.5, 0, 0.1, 1.1, hw * 2 + 2, 0x6a8fb0); g.box(0, 0, sg * (hw + 0.4), 0.5, H5, 0.5, blue); }
      for (const sg of [-1, 1]) { g.box(0, 0, sg * (hw + 1.4), 2.6, H5, 2.6, 0x9aa0a6); for (let k = 0; k < 9; k++) g.box(2.4 + k * 1.05, 0, sg * (hw + 1.4), 1.05, H5 * (1 - (k + 1) / 10), 2.2, 0x8a8f96); g.box(6.6, H5 * 0.55, sg * (hw + 2.55), 9.6, 0.9, 0.08, 0x6a8fb0); } // 階段（歩道に沿って下りる）
      g.at(0, 0, 0);
    }
  }
  private treeCtxCache: Ctx | null = null;
  private treeCtx(g: Geo): Ctx { if (!this.treeCtxCache || this.treeCtxCache.g !== g) this.treeCtxCache = { g, wa: g, wb: g, sign: g, rnd: rng(7), old: false, fine: this.fine() } as unknown as Ctx; return this.treeCtxCache; }
  /** 立体交差の高架（車・バスが高架の上を走るための高さに使う）。v94：形は sim/grade.ts の spans と同じ（spans の番号＝この配列の番号）。
   *  ew＝東西方向、line＝道の中心線の座標（東西なら z）、a0・a1＝高架の平らな所の中心の範囲（両端の交差点の中心） */
  private flySpans: { ew: boolean; line: number; a0: number; a1: number }[] = [];
  /** 区画→その上を通る高架の番号（坂・平らな所） */
  private flyOf = new Map<number, number>();
  /** 高架の高さ（地面からの高さ）：平らな所（a0−15〜a1+15）は FLY_H、その外 60m（2 区画）で地面へ下りる（縦断勾配 10%） */
  private static flyH(a: number, a0: number, a1: number, H = FLY_H): number {
    const L = FLY_RAMP * TILE, d = a < a0 - 15 ? a0 - 15 - a : a > a1 + 15 ? a - a1 - 15 : 0, t = Math.max(0, 1 - d / L); return t * t * (3 - 2 * t) * H;
  }
  /** 車・バスの高さ。deck は高架の上を走っている車の高架の番号（-1 は下の道）。v94：前は「中央の車線をまっすぐ走る車」を高架の上とみなしていて、
   *  曲がってきた車が急に高架の高さへ跳んだり、高架の上から交差点で曲がって下の道へ落ちたりしていた */
  vehY(px: number, pz: number, dx: number, dz: number, deck = -1): number {
    void dx; void dz;
    const y = this.surfY(px, pz), f = deck >= 0 ? this.flySpans[deck] : undefined;
    if (!f) return y;
    const a = f.ew ? px : pz, bx = f.ew ? a : f.line, bz = f.ew ? f.line : a;
    return Math.max(y, heightAt(this.map, bx, bz) + 0.18 + View.flyH(a, f.a0, f.a1) + 0.3);
  }
  private qPitch = new THREE.Quaternion(); private axX = new THREE.Vector3(1, 0, 0); private axY = new THREE.Vector3(0, 1, 0);
  /** v95：坂を走る車の姿勢。前後の車輪（中心から ±hl）の路面の高さから車体の傾き（ピッチ）を出し、q に向きと傾きを入れる。
   *  返り値は車体の中心の高さ（前後の車輪の高さの平均。前は中心 1 点の高さだけで、坂で車体が水平のままめり込む・浮いていた） */
  slopePose(q: THREE.Quaternion, px: number, pz: number, dx: number, dz: number, yaw: number, hl: number, deck = -1): number {
    const k = Math.max(0.6, hl * 0.8), yF = this.vehY(px + dx * k, pz + dz * k, dx, dz, deck), yB = this.vehY(px - dx * k, pz - dz * k, dx, dz, deck);
    const pitch = Math.atan2(yF - yB, 2 * k);
    q.setFromAxisAngle(this.axY, yaw); if (Math.abs(pitch) > 0.004) q.multiply(this.qPitch.setFromAxisAngle(this.axX, -pitch));
    return (yF + yB) / 2;
  }
  /** 区間 cur→next を走る車が高架の上か（高架の番号、-1 は下の道）。高架に乗れるのは、内側の車線（lane 1）で坂の手前から
   *  まっすぐ入ってきた車だけ。乗った車は高架の終わりまでまっすぐ進む（途中の交差点では曲がれない＝上と下は坂の先でだけつながる） */
  private deckOf(cur: number, next: number, lane: number, was: number): number {
    if (lane !== 1 || cur === next || cur < 0 || next < 0) return -1;
    const kc = this.flyOf.get(cur), kn = this.flyOf.get(next), k = kn ?? kc;
    if (k === undefined) return -1;
    const f = this.flySpans[k], along = f.ew ? Math.abs(next - cur) === 1 : Math.abs(next - cur) === W;
    const onLine = (i: number) => (f.ew ? (((i / W) | 0) + 0.5) * TILE : (i % W + 0.5) * TILE) === f.line;
    if (!along || !onLine(cur) || !onLine(next)) return -1;
    if (kc !== k) return k;              // 坂の手前から入る
    return was === k ? k : -1;           // 高架の上を走り続ける（下から途中で乗ることはできない）
  }
  /** 毎こま：車が高架の上か下かを決め、高架に乗れない車は側道（外側の車線）へ寄せ、高架の上の車は次の区画をまっすぐに決める */
  private deckStep(s: GameState, a: Agent): number {
    const A = a as any, dk = this.deckOf(a.cur, a.next, a.lane, A.dk ?? -1);
    if (dk < 0 && a.lane === 1 && (this.flyOf.has(a.cur) || this.flyOf.has(a.next))) a.lane = 0;
    else if (dk < 0 && a.lane === 1 && a.nn !== undefined && this.flyOf.has(a.nn) && this.deckOf(a.next, a.nn, 1, -1) < 0 && this.laneOff(s, a.cur, 0) === this.laneOff(s, a.cur, 1)) a.lane = 0; // 曲がって入ってくる車は、手前で外側の車線へ
    if (dk >= 0 && this.flyOf.get(a.next) === dk) { const st = a.next * 2 - a.cur; if (st >= 0 && st < W * H && s.road[st] && a.nn !== st) a.nn = st; }
    A.dk = dk; return dk;
  }
  /** 立体交差：交差点の上を、幹線の中央 2 車線が高架でまたぐ（前後 2 区画は坂）。
   *  v93：同じ幹線で近くに続く立体交差は 1 本の高架にする。v94：形は sim/grade.ts（坂は 60m・10%、脇道や向きの違う高架とぶつかる所には置けない）。
   *  高架の前後の幹線は、高架の両側に下の道（側道）の車線が残るよう 6 車線の幅で描く。桁の厚さは一定、橋脚は区画の境目ごと */
  private drawFlyovers(s: GameState, g: Geo): void {
    const m = this.map, hA = (x: number, z: number) => heightAt(m, x, z), L = grade(s);
    this.flySpans = L.spans.map(sp => ({ ew: sp.ew, line: (sp.line + 0.5) * TILE, a0: (sp.j0 + 0.5) * TILE, a1: (sp.j1 + 0.5) * TILE }));
    this.flyOf = new Map(L.spanOf);
    type V = [number, number, number]; const dq = (p: V, q: V, r: V, t: V, c: number) => { g.quad(p, q, r, t, c); g.quad(t, r, q, p, c); }; // 両面（向きを気にしない）
    const H0 = FLY_H, dw = 4.2, TH = 1.3, RL = FLY_RAMP * TILE;
    for (const f of this.flySpans) {
      const P = (a: number, o: number): [number, number] => (f.ew ? [a, f.line + o] : [f.line + o, a]);
      const yAt = (a: number) => View.flyH(a, f.a0, f.a1, H0), base = (a: number) => { const [px, pz] = P(a, 0); return hA(px, pz) + 0.18; };
      const A0 = f.a0 - 15 - RL, A1 = f.a1 + 15 + RL, n = Math.max(1, Math.round((A1 - A0) / 2.5)), st = (A1 - A0) / n;
      const spk = L.spans[this.flySpans.indexOf(f)], sup = flySupports(s, spk), ab = sup.filter(o => o.kind === 'abut').map(o => o.a), aLo = Math.min(...ab), aHi = Math.max(...ab);
      for (let k = 0; k < n; k++) {
        const a = A0 + k * st, b = a + st, ya = base(a) + yAt(a), yb = base(b) + yAt(b);
        const [x0, z0] = P(a, -dw), [x1, z1] = P(b, -dw), [x2, z2] = P(b, dw), [x3, z3] = P(a, dw);
        // 路面（上）と底
        dq([x0, ya, z0], [x1, yb, z1], [x2, yb, z2], [x3, ya, z3], 0x3a3d42);
        const tha = Math.min(TH, yAt(a)), thb = Math.min(TH, yAt(b));
        if (tha > 0.25 || thb > 0.25) dq([x0, ya - tha, z0], [x1, yb - thb, z1], [x2, yb - thb, z2], [x3, ya - tha, z3], 0x9a978f);
        // 桁の側面（高欄の上端まで。厚さは一定で、坂の下では地面に沿って薄くなる）
        // v100：坂の低い所（桁下 2m 未満）は擁壁の盛土：側面を地面まで下ろす（前は薄い桁が地面すれすれに浮いていた）
        const fill = b <= aLo + 0.01 || a >= aHi - 0.01;
        for (const sg of [-1, 1]) {
          const [ax, az] = P(a, sg * dw), [bx, bz] = P(b, sg * dw);
          dq([ax, ya + 0.9, az], [bx, yb + 0.9, bz], [bx, fill ? base(b) - 0.4 : yb - Math.max(0.2, thb), bz], [ax, fill ? base(a) - 0.4 : ya - Math.max(0.2, tha), az], fill ? 0xbdb9b0 : 0xc9c6bf);
        }
        if (fill && (Math.abs(b - aLo) < st * 0.5 || Math.abs(a - aHi) < st * 0.5)) { const e = Math.abs(b - aLo) < st * 0.5 ? b : a, ye = base(e) + yAt(e) - TH, [p0x, p0z] = P(e, -dw), [p1x, p1z] = P(e, dw); dq([p0x, base(e) - 0.4, p0z], [p1x, base(e) - 0.4, p1z], [p1x, ye, p1z], [p0x, ye, p0z], 0xb0ada5); } // 盛土の端の壁（橋台）
        // 中央線（破線）
        if (Math.floor((a - A0) / 5) % 2 === 0) { const [mx0, mz0] = P(a, -0.1), [mx1, mz1] = P(b, 0.1); dq([mx0, ya + 0.04, mz0], [mx1, yb + 0.04, mz0], [mx1, yb + 0.04, mz1], [mx0, ya + 0.04, mz1], 0xeeeeea); }
      }
      // v95：橋脚は高架の真下の中央分離帯（側道と側道の間の、車の通らない帯）にだけ、交差点・横断歩道・脇道の区画の外に立てる。
      // 分離帯は縁石と植栽で、桁下が足りる所だけ（交差点をまたぐ所は v100 の門形の橋脚で支える）
      const sp = L.spans[this.flySpans.indexOf(f)], mw = 3.2;
      for (const t of flyPiers(s, sp)) {
        const ac = (t + 0.5) * TILE;
        // 分離帯：区画の端から端まで（交差点側の端は 1m 控える）。坂の低い所（路面が 0.8m 未満）は描かない
        let u0 = ac - 15, u1 = ac + 15; while (u0 < u1 && yAt(u0) < 0.8) u0 += 1; while (u1 > u0 && yAt(u1) < 0.8) u1 -= 1;
        if (u1 - u0 > 2) {
          const [mx, mz] = P((u0 + u1) / 2, 0), my = hA(mx, mz) + 0.05, len = u1 - u0 - 1;
          g.box(mx, my, mz, f.ew ? len : mw * 2, 0.22, f.ew ? mw * 2 : len, 0xb4b1a8);                   // 縁石
          g.box(mx, my + 0.22, mz, f.ew ? len - 0.6 : mw * 2 - 0.5, 0.08, f.ew ? mw * 2 - 0.5 : len - 0.6, 0x4d6a34); // 植栽の土と下草
          if (this.fine()) for (let u = u0 + 3; u < u1 - 2; u += 4) { if (Math.abs(u - ac) < 2) continue; const [bx, bz] = P(u, 0); g.blob(bx, my + 0.3, bz, 0.9, 0.6, 0.9, 0x5f7f3a, 5); } // 低木（桁の下なので低く）
        }
      }
      // v100：支え（sim/grade.ts の flySupports）。中央分離帯の橋脚と、交差点の角に立てる門形の橋脚（1 径間 40m 以下）。
      // 前は交差点・脇道の区画に橋脚を立てないだけで、交差点が続く幹線では桁が 100m 以上も支えなしで渡っていた
      for (const o of sup) {
        if (o.kind === 'abut') continue;
        const [px, pz] = P(o.a, 0), by = hA(px, pz), top = by + 0.18 + yAt(o.a) - TH, h = top - by; if (h < 1.2) continue;
        if (o.kind === 'median') {
          g.at(px, by, pz); g.box(0, 0, 0, f.ew ? 1.4 : 5.2, h, f.ew ? 5.2 : 1.4, 0xb9b6ae); g.at(0, 0, 0);
          g.at(px, by + h - 0.9, pz); g.box(0, 0, 0, f.ew ? 2.0 : 7.6, 0.9, f.ew ? 7.6 : 2.0, 0xb0ada5); g.at(0, 0, 0); // 柱頭（はり）：桁の幅まで
        } else {
          const lat = o.lat!, bw = lat * 2 + 1.4;
          for (const sg of [-1, 1]) { const [cx2, cz2] = P(o.a, sg * lat), cy = hA(cx2, cz2); g.at(cx2, cy, cz2); g.box(0, 0, 0, 1.2, top + TH - 0.1 - cy, 1.2, 0xb9b6ae); g.at(0, 0, 0); }
          // 梁：桁と同じ高さに組み込む（梁の下も側道の桁下 4.5m を残す）
          g.at(px, top - 0.2, pz); g.box(0, 0, 0, f.ew ? 1.6 : bw, TH + 0.1, f.ew ? bw : 1.6, 0xb0ada5); g.at(0, 0, 0);
        }
      }
    }
  }
  /** まちづくり版の線路：区画の線路を曲線の線にして描く（render/rails.ts） */
  private railPaths: RailPath[] = [];
  private gates: Gate[] = []; private gateAng: number[] = [];
  private stSpots: StationSpot[] = [];
  /** 線路と一緒に描いた駅（町の塊では描かない） */
  private railStations = new Set<number>();
  private drawRails(s: GameState, g: Geo, lampPos?: number[], kit?: Geo): void {
    this.railPaths = buildRailPaths(s, this.map);
    const r = drawRailPaths(g, s, this.map, this.railPaths, !this.fine() ? 0 : this.quality === 'high' ? 2 : 1, kit); if (lampPos) for (const v of r.lamps) lampPos.push(v);
    this.gates = r.gates; this.gateAng = r.gates.map(() => Math.PI / 2); this.plaza.clear(); this.stSpots = r.spots;
    const ids = r.spots.map(o => o.id).sort((a, b) => a - b).join(',');
    if (ids !== [...this.railStations].sort((a, b) => a - b).join(',')) this.chunkSig.clear(); // 駅を線路側で描くかどうかが変わったら、町の塊を描き直す
    this.railStations = new Set(r.spots.map(o => o.id));
    this.syncLm(s);
  }

  // ------------------------------------------------------------ 建物
  /** v100：敷地の縁のいちばん低い地面の高さ（擁壁の下端） */
  lotLow(b: { x: number; y: number; w: number; h: number }): number {
    let y = 1e9; for (const u of [0.02, 0.5, 0.98]) for (const v of [0.02, 0.5, 0.98]) y = Math.min(y, heightAt(this.map, (b.x + b.w * u) * TILE, (b.y + b.h * v) * TILE)); return y;
  }
  /** 建物の原点（区画中心・土台の高さ）と向き */
  place(s: GameState, b: { x: number; y: number; w: number; h: number; acc: number }): { x: number; y: number; z: number; rot: number } {
    const m = this.map, x = (b.x + b.w / 2) * TILE, z = (b.y + b.h / 2) * TILE;
    let y = -1e9;
    for (const [u, v] of [[0.06, 0.06], [0.94, 0.06], [0.06, 0.94], [0.94, 0.94], [0.5, 0.5]]) y = Math.max(y, heightAt(m, (b.x + b.w * u) * TILE, (b.y + b.h * v) * TILE));
    let rot = 0;
    if (b.acc >= 0) {
      const ax = b.acc % W, ay = (b.acc / W) | 0;
      if (ay >= b.y + b.h) rot = 0; else if (ay < b.y) rot = Math.PI; else if (b.w === b.h) rot = ax >= b.x + b.w ? Math.PI / 2 : -Math.PI / 2;
    }
    void s;
    return { x, y, z, rot };
  }
  private drawBuilding(c: Ctx, s: GameState, b: Building): void {
    Geo.ao = true; DETAIL.frames = !REAL && this.quality !== 'low'; DETAIL.hi = !REAL && !this.lite && this.quality === 'high'; try { this.drawBuilding0(c, s, b); } finally { Geo.ao = false; DETAIL.frames = false; DETAIL.hi = false; c.g.wallMat = 1; }
  }
  private drawBuilding0(c: Ctx, s: GameState, b: Building): void {
    const p = this.place(s, b);
    // v100：斜面の敷地は、土台の高さ（敷地のいちばん高い所）から低い所まで、擁壁（造成した敷地の石積み）で地面までつなぐ（前は低い側で建物が浮いていた）
    const drop = p.y - this.lotLow(b);
    if (drop > 0.35) { c.g.at(p.x, p.y, p.z, 0); c.g.box(0, -drop - 0.3, 0, b.w * TILE - 1.0, drop + 0.27, b.h * TILE - 1.0, 0xa39e92, 0xb5b0a4); c.g.at(0, 0, 0); }
    c.g.at(p.x, p.y, p.z, p.rot);
    c.rnd = rng(b.v * 0.9 + 0.05);
    const ol = oldLevel(s, b), v0 = c.g.col.length;
    c.old = ol > 0;
    if (b.status === 'construction') modelConstruction(c, b.kind, b.w, b.h, 1 - b.remain / Math.max(1, b.total));
    else {
      const pv = [c.g.pos.length, c.wa.pos.length, c.wb.pos.length, c.sign.pos.length];
      if (this.landmarks?.full(b.kind)) lmPad(c, b.w, b.h); else MODEL[b.kind](c);
      this.dressUp(c, b, p, pv, v0);
      if (b.kind === 'ropeway') this.drawRopeway(c, b, p);
      if (ol > 0) {
        // 古い建物：色をくすませ（彩度を落として少し暗く）、敷地の縁に雑草、とても古ければ屋根や壁に錆のしみ
        const C = c.g.col, dk = ol === 2 ? 0.8 : 0.9, ds = ol === 2 ? 0.32 : 0.16;
        for (let k = v0; k < C.length; k += 3) { const r = C[k], g2 = C[k + 1], bl = C[k + 2], l = 0.3 * r + 0.59 * g2 + 0.11 * bl; C[k] = (r + (l * 1.04 - r) * ds) * dk; C[k + 1] = (g2 + (l * 0.98 - g2) * ds) * dk; C[k + 2] = (bl + (l * 0.9 - bl) * ds) * dk; }
        const hw = b.w * 15 - 2, hd = b.h * 15 - 2, n = ol === 2 ? 14 : 6;
        for (let k = 0; k < n; k++) { const e = c.rnd(), side = Math.floor(c.rnd() * 4), u = (e - 0.5) * 2; const x = side < 2 ? u * hw : (side === 2 ? hw : -hw), z = side >= 2 ? u * hd : (side === 0 ? hd : -hd); c.g.blob(x, 0.3, z, 0.7 + c.rnd() * 0.6, 0.45 + c.rnd() * 0.4, 0.7, [0x6a8a3a, 0x7a9a42, 0x8a8a4a][k % 3], 5); }
        if (ol === 2) for (let k = 0; k < 4; k++) { const x = (c.rnd() - 0.5) * hw, z = (c.rnd() - 0.5) * hd; c.g.box(x, 0.1, z, 1.2 + c.rnd(), 0.06, 1 + c.rnd(), 0x6b4a2a); }
      }
      if (b.status === 'renewing') modelScaffold(c, b.w, b.h, MODEL_H[b.kind] * 0.8, true);
      if (b.status === 'suspended') modelScaffold(c, b.w, b.h, 0, false);
    }
  }
  /** 施設の成長の見た目：レベルで建物が高くなり（公園・自然は除く）、敷地の角にレベルの旗。外観の様式で色を塗り替える */
  private dressUp(c: Ctx, b: Building, p: { x: number; y: number; z: number; rot: number }, pv: number[], v0: number): void {
    const lv = b.lv ?? 1, d = DEFS[b.kind];
    if (lv >= 2 && d.cat !== 'park' && d.cat !== 'nature' && fam(b.kind) !== 'park' && d.fam !== 'agri') {
      const k = 1 + 0.12 * (lv - 1), base = p.y + 0.6;
      ([[c.g, pv[0]], [c.wa, pv[1]], [c.wb, pv[2]], [c.sign, pv[3]]] as [Geo, number][]).forEach(([g, from]) => { const P = g.pos; for (let i = from + 1; i < P.length; i += 3) if (P[i] > base) P[i] = base + (P[i] - base) * k; });
    }
    if (b.style) {
      // 明るさを保ったまま、様式の色の帯へ寄せる（暗い所は柱・屋根の色、明るい所は壁の色）
      const PAL: [number, number, number][][] = [[], [[0.22, 0.17, 0.13], [0.55, 0.42, 0.3], [0.95, 0.94, 0.9]], [[0.2, 0.24, 0.3], [0.55, 0.65, 0.75], [0.97, 0.98, 0.99]], [[0.3, 0.14, 0.1], [0.62, 0.3, 0.2], [0.86, 0.72, 0.6]], [[0.32, 0.2, 0.12], [0.64, 0.46, 0.3], [0.9, 0.8, 0.64]], [[0.55, 0.5, 0.6], [0.95, 0.75, 0.78], [0.82, 0.93, 0.95]]];
      const pal = PAL[b.style]; const C = c.g.col;
      if (pal && pal.length) for (let i = v0; i < C.length; i += 3) {
        const r = C[i], g2 = C[i + 1], bl = C[i + 2], l = Math.min(1, 0.3 * r + 0.59 * g2 + 0.11 * bl), sat = Math.max(r, g2, bl) - Math.min(r, g2, bl);
        if (sat > 0.35 && g2 > r && g2 > bl) continue; // 木や芝の緑は残す
        const t = l * 2, a = pal[Math.min(1, Math.floor(t))], z = pal[Math.min(2, Math.floor(t) + 1)], f = t - Math.floor(t), m = 0.7;
        const nr = a[0] + (z[0] - a[0]) * f, ng = a[1] + (z[1] - a[1]) * f, nb = a[2] + (z[2] - a[2]) * f;
        C[i] = r + (nr - r) * m; C[i + 1] = g2 + (ng - g2) * m; C[i + 2] = bl + (nb - bl) * m;
      }
    }
    if (lv >= 2) {
      const hw = b.w * 15 - 2.5, hd = b.h * 15 - 2.5, g = c.g;
      for (let k = 0; k < lv - 1; k++) { const x = -hw + 1.5 + k * 2.2, z = hd - 1; g.box(x, 0, z, 0.18, 6.5, 0.18, 0xd8dade); g.box(x + 0.75, 5.1, z, 1.4, 1.1, 0.06, [0xe8b830, 0xd04040, 0x3a7fd0, 0x3aa655][k % 4]); }
    }
  }
  /** ロープウェイ：ふもとの駅から山頂駅まで、支柱・2 本のロープ・ゴンドラ */
  private drawRopeway(c: Ctx, b: Building, p: { x: number; y: number; z: number; rot: number }): void {
    const m = this.map, top = ropewayTop(m, b.x, b.y, b.w, b.h); if (!top) return;
    const g = c.g; g.at(0, 0, 0);
    const bx = p.x, bz = p.z, by = p.y + 8.6, tx = (top.x + 0.5) * TILE, tz = (top.y + 0.5) * TILE, tyG = heightAt(m, tx, tz), ty = tyG + 7.5;
    g.at(tx, tyG, tz); g.box(0, -1, 0, 16, 7.5, 12, 0xe9e6df, 0x5a6672); g.box(0, 6.5, 0, 17, 0.6, 13, 0xc3312b); g.box(0, -1, 9, 22, 1, 6, 0xc8c2b6); g.at(0, 0, 0); // 山頂駅と展望デッキ
    const dx = tx - bx, dz = tz - bz, L = Math.hypot(dx, dz) || 1, nx = -dz / L, nz = dx / L;
    const pt = (u: number, side: number): [number, number, number] => { const sag = Math.sin(u * Math.PI) * L * 0.025; return [bx + dx * u + nx * side, by + (ty - by) * u - sag, bz + dz * u + nz * side]; };
    for (const side of [-2.2, 2.2]) for (let k = 0; k < 16; k++) { const a = pt(k / 16, side), q = pt((k + 1) / 16, side); g.quad(a, q, [q[0], q[1] + 0.22, q[2]], [a[0], a[1] + 0.22, a[2]], 0x2a2c2e); g.quad([a[0], a[1] + 0.22, a[2]], [q[0], q[1] + 0.22, q[2]], q, a, 0x2a2c2e); }
    for (const u of [0.33, 0.66]) { const [x, y, z] = pt(u, 0), gy = heightAt(m, x, z); g.at(x, gy, z); g.box(0, 0, 0, 1.2, y - gy + 1, 1.2, 0x8b9094); g.box(0, y - gy + 0.6, 0, 1, 0.6, 6, 0x8b9094); g.at(0, 0, 0); }
    for (const [u, side] of [[0.22, 2.2], [0.58, -2.2], [0.81, 2.2]] as const) { const [x, y, z] = pt(u, side); g.at(x, y - 3.2, z, Math.atan2(dx, dz)); g.box(0, 0, 0, 2.4, 2.4, 2.8, side > 0 ? 0xc3312b : 0xf2f2ee); g.box(0, 2.4, 0, 0.12, 0.9, 0.12, 0x5a6066); g.at(0, 0, 0); }
  }
  private chunkSig = new Map<number, string>();
  private chunkMeshes = new Map<number, THREE.Mesh[]>(); private chunkLow = new Map<number, THREE.Mesh>(); private lodT = 0;
  /** 遠くの塊は簡略版に切りかえる（スマホで軽くするため）。品質が低いほど近くから簡略版にする */
  private updateLod(dt: number): void {
    if (REAL) return; this.lodT -= dt; if (this.lodT > 0) return; this.lodT = 0.25;
    const lim = (this.quality === 'high' ? 1800 : this.quality === 'mid' ? 1100 : 650) * (this.lite ? 0.6 : 1), CH = 6, NCX = Math.ceil(W / CH), cam = this.camera.position;
    // 歩く人は、遠くからだと点にしか見えないので描かない（1 人 900 三角形あるため）
    { const hide = this.mode === 'orbit' && this.dist > (this.lite ? 520 : this.quality === 'high' ? 1400 : 900); for (const P of [this.pedP, this.crowdP, this.lifeP]) if (P) P.mesh.visible = !hide && (P !== this.crowdP || P.mesh.count > 0); }
    const want: [number, number][] = [];
    for (const [k, meshes] of this.chunkMeshes) { const low = this.chunkLow.get(k); if (!low) { for (const m of meshes) m.visible = true; continue; } const cx = ((k % NCX) + 0.5) * CH * TILE, cz = (Math.floor(k / NCX) + 0.5) * CH * TILE, d = Math.hypot(cx - cam.x, cz - cam.z, cam.y * 0.6), far = d > lim && this.mode === 'orbit';
      // v92：何もない塊（空き地だけ）は、近づいたときに細かい版を作る（地図を広げて、細かい版をすべて持つとメモリが 1.5GB を超えたため）。作るまでは簡略版を見せる
      if (this.lazyChunks.has(k)) { low.visible = true; if (d < lim * 1.2) want.push([d, k]); continue; }
      for (const m of meshes) m.visible = !far; low.visible = far; }
    // 近い塊から、1 回に 6 つまで（一度に作ると画面が止まるため）
    if (want.length) { const st = this.getState(); want.sort((a, b) => a[0] - b[0]);
      for (const [d, k] of want.slice(0, 6)) { this.lazyChunks.delete(k); this.buildPlain(st, k); const far = d > lim && this.mode === 'orbit'; for (const m of this.chunkMeshes.get(k) ?? []) m.visible = !far; this.chunkLow.get(k)!.visible = far; } }
  }
  /** 細かい版を後で作る、空き地だけの塊 */
  private lazyChunks = new Set<number>();
  /** 空き地だけの塊の細かい版（草・木・田畑など） */
  private buildPlain(s: GameState, k: number): void {
    const CH = 6, NCX = Math.ceil(W / CH), cx0 = (k % NCX) * CH, cy0 = Math.floor(k / NCX) * CH, c = this.ctx(1);
    for (let y = Math.max(2, cy0); y < Math.min(H - 4, cy0 + CH); y++) for (let x = cx0; x < Math.min(W, cx0 + CH); x++) this.drawEmpty(c, s, x, y);
    const keep = this.groups.town; this.groups.town = [];
    this.addCtx(c, 'town');
    for (const mesh of this.groups.town) { mesh.geometry.computeBoundingSphere(); mesh.frustumCulled = true; }
    this.chunkMeshes.set(k, this.groups.town); this.groups.town = keep;
  }
  /** glb の名所を置く場所の一覧（線路と一緒に描く駅は、線路側で決めた駅舎の位置） */
  private lmList(s: GameState): LmItem[] {
    const L = this.landmarks, out: LmItem[] = []; if (!L) return out;
    for (const b of s.buildings) {
      if (!L.has(b.kind) || b.status === 'construction') continue;
      if (b.kind === 'station' && this.railStations.has(b.id)) { const sp = this.stSpots.find(o => o.id === b.id); if (sp?.bld) out.push({ id: b.id, kind: b.kind, ...sp.bld, off: [0, 0, 0] }); continue; }
      out.push({ id: b.id, kind: b.kind, ...this.place(s, b) });
    }
    return out;
  }
  private syncLm(s: GameState): void { this.landmarks?.sync(this.lmList(s)); }
  private townState = 0;
  /** 街を 6×6 タイルの塊に分け、中身が変わった塊だけ作り直す */
  private rebuildTown(s: GameState): void {
    if (REAL) { this.rebuildTownReal(s); return; }
    const t0 = performance.now();
    const m = this.map, CH = 6, NCX = Math.ceil(W / CH);
    const key = (x: number, y: number) => Math.floor(y / CH) * NCX + Math.floor(x / CH);
    const lmIds = new Set(this.lmList(s).map(o => o.id));
    const sigs = new Map<number, string[]>(), blds = new Map<number, Building[]>();
    const push = (k: number, v: string) => { let a = sigs.get(k); if (!a) sigs.set(k, (a = [])); a.push(v); };
    for (const b of s.buildings) {
      if (b.status === 'construction') continue;
      const k = key(b.x, b.y);
      push(k, `${b.id}.${b.status}.${b.acc}.${oldLevel(s, b)}`);
      let a = blds.get(k); if (!a) blds.set(k, (a = [])); a.push(b);
    }
    for (let y = 2; y < (REAL ? 40 : H - 4); y++) for (let x = 0; x < W; x++) { const i = idx(x, y); push(key(x, y), s.road[i] ? 'r' : s.occ[i] ? 'o' : 'z' + s.zone[i]); }
    if (this.townState !== sid(s)) { this.townState = sid(s); this.chunkSig.clear(); }
    let rebuilt = 0;
    for (const [k, arr] of sigs) {
      const sig = arr.join(',');
      if (this.chunkSig.get(k) === sig) continue;
      this.chunkSig.set(k, sig); rebuilt++;
      for (const mesh of this.chunkMeshes.get(k) ?? []) { this.scene.remove(mesh); mesh.geometry.dispose(); }
      { const old = this.chunkLow.get(k); if (old) { this.scene.remove(old); old.geometry.dispose(); this.chunkLow.delete(k); } }
      this.lazyChunks.delete(k);
      // 遠くから見るときの簡略版（建物は箱 1 つ、空き地は板 1 枚）。三角形が 1 割ほどになる
      { const lg = new Geo(), cx0 = (k % NCX) * CH, cy0 = Math.floor(k / NCX) * CH;
        for (const b of blds.get(k) ?? []) { if (lmIds.has(b.id)) continue; const p = this.place(s, b), hh = Math.max(1.5, (MODEL_H[b.kind] ?? 6) * (b.status === 'operating' ? 1 : 0.6)), d = DEFS[b.kind], cat = d.cat as string;
          const col = isRes(b.kind) ? [0xe2dccf, 0xd6cbb8, 0xc9d2d6, 0xe6d9c2][b.id % 4] : isShop(b.kind) ? 0xe6c27a : cat === 'biz' || cat === 'industry' || cat === 'commerce' ? 0xa9b8c8 : fam(b.kind) === 'park' || cat === 'nature' || cat === 'agri' ? 0x6f9a54 : 0xd2c8b4;
          lg.at(p.x, p.y, p.z, p.rot);
          if (b.kind === 'house' && b.status === 'operating') { // 戸建ては 4 軒の小さな家と三角屋根で（大きな箱 1 つにしない）
            const RF = [0x5a3a2e, 0x3b3f46, 0x2f3a4a, 0x7a3b2e];
            for (const [qx, qz] of [[-7.1, 5.9], [7.1, 5.9], [-7.1, -8.3], [7.1, -8.3]]) { const r = RF[(b.id + Math.round(qx + qz)) & 3]; lg.box(qx, 0, qz, 7.6, 5.5, 6.4, col, col); lg.gable(qx, 5.5, qz, 7.6, 6.4, 1.9, r, 'x', col, 0.4); }
          } else lg.box(0, 0, 0, Math.max(4, b.w * TILE - 6), fam(b.kind) === 'park' ? 0.4 : hh, Math.max(4, b.h * TILE - 6), col, isRes(b.kind) ? 0x8a6a5a : undefined); }
        for (let y = Math.max(2, cy0); y < Math.min(H - 4, cy0 + CH); y++) for (let x = cx0; x < Math.min(W, cx0 + CH); x++) { const i = idx(x, y); if (s.road[i] || s.occ[i] || !buildable(m, i)) continue; const r = hash(x, y, 77), cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, top = heightAt(m, cx, cz);
          const ek = extLook(m, x, y); if (s.zone[i]) { lg.at(cx, top, cz); lg.box(0, -2, 0, 27, 2.05, 27, 0xa8997c); } else if (ek >= 0) { /* v95：遠くの畑は箱を置かない（地面の色が 3×2 区画の畑ごとの土と作物の色で、境はノイズでくねる。箱の四角い輪郭が上空から格子に見えた） */ } else if (r < (y >= 40 ? 0.72 : 0.5) && y < H - 6 && !(m.sand?.[i] || m.desert?.[i] || m.snow?.[i])) { lg.at(cx, top, cz); lg.box(0, -2, 0, 28.6, 2.1, 28.6, r < 0.3 ? 0x8cbc5c : 0x5f9445); } }
        if (!lg.pos.length) { lg.at((cx0 + CH / 2) * TILE, -60, (cy0 + CH / 2) * TILE); lg.box(0, 0, 0, 0.01, 0.01, 0.01, 0x000000); } // v95：遠くの畑の箱をやめて空になった塊も、簡略版を持たせる（持たないと、遠くの空き地の塊を後で作る工夫が効かず、細かい版をすぐ作って面が増えた）
        { const lm = new THREE.Mesh(lg.build(false), LOD_MAT); lm.receiveShadow = true; lm.visible = false; this.scene.add(lm); this.chunkLow.set(k, lm); } }
      // v92：空き地だけの塊で、いまカメラから遠いものは、細かい版を後で（近づいたとき）作る
      if (!(blds.get(k)?.length) && arr.every(v => v === 'z0') && this.chunkLow.has(k)) {
        const cam = this.camera.position, ccx = ((k % NCX) + 0.5) * CH * TILE, ccz = (Math.floor(k / NCX) + 0.5) * CH * TILE, lim = (this.quality === 'high' ? 1800 : this.quality === 'mid' ? 1100 : 650) * (this.lite ? 0.6 : 1);
        if (Math.hypot(ccx - cam.x, ccz - cam.z, cam.y * 0.6) > lim * 1.2) { this.lazyChunks.add(k); this.chunkMeshes.set(k, []); this.chunkLow.get(k)!.visible = true; continue; }
      }
      const c = this.ctx(1);
      for (const b of blds.get(k) ?? []) this.drawBuilding(c, s, b);
      const cx0 = (k % NCX) * CH, cy0 = Math.floor(k / NCX) * CH;
      for (let y = Math.max(2, cy0); y < Math.min(REAL ? 40 : H - 4, cy0 + CH); y++) for (let x = cx0; x < Math.min(W, cx0 + CH); x++) this.drawEmpty(c, s, x, y);
      this.groups.town = [];
      this.addCtx(c, 'town');
      for (const mesh of this.groups.town) { mesh.geometry.computeBoundingSphere(); mesh.frustumCulled = true; }
      this.chunkMeshes.set(k, this.groups.town);
    }
    this.groups.town = [];
    void m;
    this.syncLm(s);
    this.stats.buildings = s.buildings.length;
    if (rebuilt) this.stats.buildMs = performance.now() - t0;
    this.decorate(s);
  }
  /** 実在都市版：16×16 タイルの塊ごとに、取り込んだ建物・計算上の建物・空き地を描く */
  private rebuildTownReal(s: GameState): void {
    const t0 = performance.now(), m = this.map, CH = REAL_CHUNK, NCX = Math.ceil(W / CH), NCY = Math.ceil(H / CH);
    const byId = new Map<number, Building>(); for (const b of s.buildings) byId.set(b.id, b);
    const blds = new Map<number, Building[]>();
    for (const b of s.buildings) { if (b.status === 'construction') continue; const k = Math.floor(b.y / CH) * NCX + Math.floor(b.x / CH); let a = blds.get(k); if (!a) blds.set(k, (a = [])); a.push(b); }
    if (this.townState !== sid(s)) { this.townState = sid(s); this.chunkSig.clear(); }
    let rebuilt = 0;
    const windows = this.quality !== 'low';
    // 地図の建物を描かない区画：市の施設・新しく建てた建物・新しく引いた道路
    const avoid = (t: number) => { const o = s.occ[t]; if (o) { const b = byId.get(o); return !!b && !(b.osm && isRes(b.kind)); } return s.road[t] > 0 && !REAL!.road[t]; };
    for (let cy = 0; cy < NCY; cy++) for (let cx = 0; cx < NCX; cx++) {
      const k = cy * NCX + cx, parts: string[] = [];
      for (const b of blds.get(k) ?? []) parts.push(`${b.id}.${b.status}.${b.acc}.${oldLevel(s, b)}`);
      // 隣の塊の縁 1 区画も含める（縁の建物が隣の施設にかからないかで描き方が変わるため）
      for (let y = Math.max(0, cy * CH - 1); y < Math.min(H, cy * CH + CH + 1); y++) for (let x = Math.max(0, cx * CH - 1); x < Math.min(W, cx * CH + CH + 1); x++) { const i = idx(x, y); parts.push((s.road[i] ? 'r' : s.occ[i] ? 'o' + s.occ[i] : 'z' + s.zone[i]) + (s.rail?.[i] ? 'l' + (s.railGrade?.[i] ?? 0) : '')); }
      const sig = parts.join(',') + windows;
      if (this.chunkSig.get(k) === sig) continue;
      this.chunkSig.set(k, sig); rebuilt++;
      for (const mesh of this.chunkMeshes.get(k) ?? []) { this.scene.remove(mesh); mesh.geometry.dispose(); }
      const c = this.ctx(1);
      for (const b of blds.get(k) ?? []) {
        if (b.osm) { if (b.status !== 'operating') { const p = this.place(s, b); c.g.at(p.x, p.y, p.z, p.rot); modelScaffold(c, b.w, b.h, b.status === 'renewing' ? 8 : 0, b.status === 'renewing'); } continue; }
        if (b.kind === 'station' && this.railStations.has(b.id)) continue; // まちづくり版：駅は線路と一緒に描いた
        if (b.kind === 'station' && drawRealStation(c, m, b)) continue; // 駅は線路に沿ったホームと駅舎で
        if (b.id < 1000000 && b.status === 'operating' && b.kind !== 'station' && b.kind !== 'park' && drawRealLot(c, m, b, windows) > 0) continue; // 取り込んだ施設は実際の建物の形で
        if (b.id < 1000000 && b.kind === 'supermarket' && !REAL!.deformed) { drawRealStore(c, m, b, b.name ?? '', windows); continue; }
        this.drawBuilding(c, s, b);
      }
      for (let y = cy * CH; y < Math.min(H, cy * CH + CH); y++) for (let x = cx * CH; x < Math.min(W, cx * CH + CH); x++) {
        const i = idx(x, y), o = s.occ[i];
        let showOsm: boolean;
        if (o) showOsm = !!byId.get(o)?.osm && isRes(byId.get(o)!.kind);   // 取り込んだ住宅の区画
        else showOsm = !ORIG_LOT[i] && !s.zone[i] && !(s.road[i] && !REAL!.road[i]); // 計算に入らない既存の建物（店・事務所・工場など）
        if (REAL!.deformed) { if (!o && !s.road[i] && !railBlocks(s, i)) { if (buildable(m, i)) this.drawEmpty(c, s, x, y); else drawRealGround(c, m, i); } continue; } // まちづくり版：空き地は畑・草地・用途の区画
        if (showOsm) { const b = o ? byId.get(o)! : null; drawRealTile(c, m, i, windows, b ? { kind: b.kind, units: b.units ?? 4 } : looksBuiltUp(m, i) ? { kind: 'house', units: 2 + Math.floor(hash(x, y, 44) * 3) } : undefined, avoid); } // 住宅区画は推計の戸数まで、データのない市街地も見た目だけ補う
        if (!o && !s.road[i]) {
          if (s.zone[i] && buildable(m, i)) this.drawEmpty(c, s, x, y);
          else drawRealGround(c, m, i);
        }
      }
      this.groups.town = [];
      this.addCtx(c, 'town');
      for (const mesh of this.groups.town) { mesh.geometry.computeBoundingSphere(); mesh.frustumCulled = true; }
      this.chunkMeshes.set(k, this.groups.town);
    }
    this.groups.town = [];
    this.stats.buildings = s.buildings.length;
    if (rebuilt) this.stats.buildMs = performance.now() - t0;
  }
  /** 空き地：用途指定済みの区画、田畑、草地 */
  private drawEmpty(c: Ctx, s: GameState, x: number, y: number): void {
    const m = this.map, i = idx(x, y);
    if (s.road[i] || s.occ[i] || !buildable(m, i) || (s.canal && s.canal.includes(i)) || (s.levee && s.levee.includes(i))) return;
    if (this.lite && !s.zone[i] && hash(x, y, 79) > 0.25) return; // 軽量表示：空き地の飾りは 4 分の 1 だけ
    const cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE;
    const hs = [heightAt(m, x * TILE, y * TILE), heightAt(m, cx + 15, y * TILE), heightAt(m, x * TILE, cz + 15), heightAt(m, cx + 15, cz + 15)];
    const top = Math.max(...hs), flat = top - Math.min(...hs) < 1.3;
    const r = hash(x, y, 77);
    c.rnd = rng(r * 0.9 + 0.05); c.old = false;
    if (REAL && !REAL.deformed && !s.zone[i]) return;
    // 砂地・砂漠・雪原は田畑や木立を描かない（雪原にはときどき雪だるま、砂漠には砂の盛り上がり）
    if (!s.zone[i] && (m.sand?.[i] || m.desert?.[i] || m.snow?.[i])) {
      if (m.snow?.[i] && r < 0.12) { c.g.at(cx, heightAt(m, cx, cz), cz); c.g.blob(0, 0.9, 0, 1.0, 0.9, 1.0, 0xf8fafc, 6); c.g.blob(0, 2.3, 0, 0.65, 0.6, 0.65, 0xf8fafc, 6); c.g.box(0, 2.3, 0.6, 0.15, 0.15, 0.4, 0xe0702a); }
      if (m.desert?.[i] && r < 0.4) { c.g.at(cx, heightAt(m, cx, cz), cz); c.g.blob((r - 0.2) * 30, 0, 4, 9, 1.6, 5, 0xd9b46a, 7); }
      return;
    }
    if (s.zone[i] && REAL && !flat) {
      // 斜面の地図では、造成した平らな台ではなく、地面に沿った区画の印にする（浮いた台に見えないように）
      const col = s.zone[i] === 4 ? 0xbcb6a8 : 0xb3a383, SUB = 3, st = TILE / SUB;
      c.g.at(0, 0, 0);
      for (let j = 0; j < SUB; j++) for (let k = 0; k < SUB; k++) {
        const X0 = x * TILE + 1.5 + k * (st - 1), X1 = X0 + st - 1, Z0 = y * TILE + 1.5 + j * (st - 1), Z1 = Z0 + st - 1;
        c.g.quad([X0, heightAt(m, X0, Z1) + 0.12, Z1], [X1, heightAt(m, X1, Z1) + 0.12, Z1], [X1, heightAt(m, X1, Z0) + 0.12, Z0], [X0, heightAt(m, X0, Z0) + 0.12, Z0], col);
      }
      for (const [u, v] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) { c.g.at(cx + u, heightAt(m, cx + u, cz + v), cz + v); c.g.cyl(0, 0, 0, 0.06, 0.8, 0xe8e2d0, 4); }
      if (r < 0.5) { const sx = cx - 9, sz = cz + 11.5; c.g.at(sx, heightAt(m, sx, sz), sz); c.g.cyl(0, 0, 0, 0.06, 1.9, 0x8b8f93, 4); c.g.box(0, 1.0, 0, 2.2, 1.2, 0.08, 0xf4f4f0); sign(c, '売地', 0, 0, 1.05, 0.06, 2.0); }
      return;
    }
    if (s.zone[i]) {
      c.g.at(cx, top, cz);
      c.g.box(0, -4, 0, 27, 4.05, 27, 0xa59d8c, s.zone[i] === 4 ? 0xb5b0a4 : 0xa8997c);
      for (const [u, v] of [[-13, -13], [13, -13], [-13, 13], [13, 13]]) c.g.cyl(u, 0, v, 0.06, 0.8, 0xe8e2d0, 4);
      if (r < 0.5) { c.g.cyl(-9, 0, 11.5, 0.06, 1.9, 0x8b8f93, 4); c.g.box(-9, 1.0, 11.5, 2.2, 1.2, 0.08, 0xf4f4f0); sign(c, '売地', 0, -9, 1.05, 11.56, 2.0); }
      if (r > 0.6) c.g.blob(6, 0.25, -5, 2.4, 0.5, 1.8, 0x86a85a, 5);
    } else if (extLook(m, x, y) >= 0) { // v93：広げた土地は見た目の印のまとまりで（田んぼは田んぼの面で別に描く。畑は 3×2 区画の畑ごとに同じ作物、草地は木をまばらに、林の印は木を多めに）
      const ek = extLook(m, x, y);
      if (ek === 6 && flat && y < H - 6) {
        c.g.at(cx, top, cz); const g2 = c.g, svF = g2.surfv; g2.surfv = -2;
        const crops = [0x4f8a3c, 0x6aa352, 0x8fb04a, 0x5c9a4a], pr = hash(Math.floor(x / 3), y >> 1, 31), crop = crops[Math.floor(pr * 4) % 4], bare = pr < 0.3;
        const dd = m.deco!, ind6 = (j: number) => (dd[j] === 6 ? 1 : 0), e6 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([a, b]) => inMap(x + a, y + b) && dd[idx(x + a, y + b)] !== 6);
        if (!e6) { g2.box(0, -3, 0, 30, 3.04, 30, 0x8d8468, 0x7a6348); for (let k = 0; k < 11; k++) { const z = -12.5 + k * 2.5; g2.box(0, 0.04, z, 29, 0.22, 1.5, 0x6f593f, 0x7d6649); if (!bare) g2.box(0, 0.26, z, 28, 0.3, 0.8, crop); } }
        else for (let k = 0; k < 11; k++) { // v95：畑のまとまりの縁は、土台の箱をやめ、うねを境の曲線までの長さに（区画の四角い輪郭を出さない）
          const z = -12.5 + k * 2.5; let a0 = 99, a1 = -99; for (let t = 0; t <= 8; t++) { const lx = -14.5 + t * 29 / 8; if (field(ind6, (cx + lx) / TILE, (cz + z) / TILE) >= 0.5) { a0 = Math.min(a0, lx); a1 = Math.max(a1, lx); } }
          if (a1 - a0 < 3) continue; g2.box((a0 + a1) / 2, 0.04, z, a1 - a0, 0.22, 1.5, 0x6f593f, 0x7d6649); if (!bare) g2.box((a0 + a1) / 2, 0.26, z, a1 - a0 - 1, 0.3, 0.8, crop); }
        g2.surfv = svF;
      } else if (ek === 8 || (ek === 7 && r < 0.18)) {
        const n = ek === 8 ? 4 : 1, dd = m.deco!, e8 = ek === 8 && [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].some(([a, b]) => inMap(x + a, y + b) && dd[idx(x + a, y + b)] !== 8);
        for (let k = 0; k < n; k++) { const wx = cx + (hash(x + k, y, 78) - 0.5) * (e8 ? 30 : 24), wz = cz + (hash(x, y + k, 79) - 0.5) * (e8 ? 30 : 24);
          if (e8 && field(j => (dd[j] === 8 ? 1 : 0), wx / TILE, wz / TILE) < 0.3 + 0.45 * hash(x + k, y, 77)) continue; // v95：林の縁は木をまばらに、境の曲線の外は描かない
          c.g.at(wx, heightAt(m, wx, wz) - 0.15, wz); tree(c, 0, 0, 0.9 + hash(x, y + k, 80) * 0.7, hash(x + k, y, 85) < 0.75 ? 1 : 0); } // 屋敷林は常緑樹が多い（落葉樹ばかりだと、春に林の塊がまとめて桜色になり、上空から白い斑点に見えた）
      }
    } else if (flat && r < (!REAL && y >= 40 ? 0.72 : 0.5) && y < H - 6) { // 田畑（南原は田んぼが多い）
      c.g.at(cx, top, cz);
      const paddy = r < 0.3, g2 = c.g, flatQ = (x0: number, z0: number, x1: number, z1: number, yy: number, col: number) => g2.quad([x0, yy, z1], [x1, yy, z1], [x1, yy, z0], [x0, yy, z0], col);
      // v76：太い棒を 9 本並べた畑をやめる。田んぼは水を張った面にあぜと細い稲の列、畑は土のうねに作物の列（うねごとに作物が違う）
      const svF = g2.surfv; g2.surfv = -2; // 作物の緑が、春の桜色・秋の紅葉の色替えに掛からないように（畑がピンクになっていた）
      g2.box(0, -3, 0, 28.6, 3.04, 28.6, 0x8d8468, paddy ? 0x6f8f7a : 0x7a6348);
      if (paddy) {
        for (const [bx, bz, bw, bd] of [[0, -13.7, 28.6, 1.2], [0, 13.7, 28.6, 1.2], [-13.7, 0, 1.2, 26.2], [13.7, 0, 1.2, 26.2]]) g2.box(bx, 0, bz, bw, 0.34, bd, 0x86905a, 0x93a064); // あぜ
        const tone = hash(x, y, 81) < 0.5 ? [0x7fb054, 0x8cbc5c] : [0x86b65a, 0x76a84e];
        for (let k = 0; k < 20; k++) { const z = -12.4 + k * 1.3; flatQ(-12.8, z, 12.8, z + 0.62, 0.1, tone[k % 2]); } // 稲の列（水面の上に細い緑の帯）
      } else {
        const crops = [0x4f8a3c, 0x6aa352, 0x3f7a44, 0x8fb04a, 0x5c9a4a], bare = hash(x, y, 82);
        for (let k = 0; k < 11; k++) { const z = -12.5 + k * 2.5, cr = hash(x + k, y, 83);
          g2.box(0, 0.04, z, 26.5, 0.22, 1.5, 0x6f593f, 0x7d6649);                                   // 土のうね
          if (cr > bare * 0.35) g2.box(0, 0.26, z, 25.5 * (0.7 + 0.3 * hash(x, y + k, 84)), 0.16 + 0.22 * cr, 0.8, crops[Math.floor(cr * 5) % 5]); } // 作物（収穫の済んだうねは土のまま）
      }
      g2.surfv = svF;
      if (r > 0.42) { c.g.box(11, 0, 11, 3, 2.2, 2.4, 0x9aa0a4); c.g.gable(11, 2.2, 11, 3, 2.4, 0.7, 0x5a6066, 'x', 0x9aa0a4, 0.2); }
    } else if (r < 0.82) { // 草地と木立
      const n = r < 0.58 ? 2 : 4; // v79：木立の木を増やす（前は 1 本か 3 本）
      for (let k = 0; k < n; k++) { const wx = cx + (hash(x + k, y, 78) - 0.5) * 22, wz = cz + (hash(x, y + k, 79) - 0.5) * 22; c.g.at(wx, heightAt(m, wx, wz) - 0.15, wz); tree(c, 0, 0, 0.8 + hash(x, y + k, 80) * 0.6); }
    }
  }
  private rebuildSites(s: GameState): void {
    this.clearGroup('sites');
    const c = this.ctx(2);
    for (const b of s.buildings) if (b.status === 'construction') this.drawBuilding(c, s, b);
    this.addCtx(c, 'sites');
  }

  // ------------------------------------------------------------ レイヤーとカーソル
  private tileQuad(g: Geo, s: GameState, i: number, color: number, lift = 0.32, byId?: Map<number, Building>): void {
    const m = this.map, x = i % W, y = (i / W) | 0;
    if (s.occ[i]) {
      const b = byId ? byId.get(s.occ[i]) : s.buildings.find(o => o.id === s.occ[i]);
      if (b && !(REAL && b.osm)) { const p = this.place(s, b), X0 = x * TILE + 0.8, X1 = X0 + TILE - 1.6, Z0 = y * TILE + 0.8, Z1 = Z0 + TILE - 1.6, yy = p.y + 0.45; g.quad([X0, yy, Z1], [X1, yy, Z1], [X1, yy, Z0], [X0, yy, Z0], color); return; }
    }
    const SUB = 3, st = TILE / SUB;
    for (let j = 0; j < SUB; j++) for (let k = 0; k < SUB; k++) {
      const X0 = x * TILE + k * st + (k === 0 ? 0.8 : 0), X1 = x * TILE + (k + 1) * st - (k === SUB - 1 ? 0.8 : 0), Z0 = y * TILE + j * st + (j === 0 ? 0.8 : 0), Z1 = y * TILE + (j + 1) * st - (j === SUB - 1 ? 0.8 : 0);
      g.quad([X0, heightAt(m, X0, Z1) + lift, Z1], [X1, heightAt(m, X1, Z1) + lift, Z1], [X1, heightAt(m, X1, Z0) + lift, Z0], [X0, heightAt(m, X0, Z0) + lift, Z0], color);
    }
  }
  /** 道具を選んでいる間、置ける土地（緑）と置けない土地（赤：斜面・樹林・水面など）を薄く示す */
  placeMode = false;
  private matPlace = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.28, depthWrite: false, depthTest: false });
  private rebuildPlace(s: GameState): void {
    const m = this.map, g = new Geo(), R = 42, tx = Math.floor(this.target.x / TILE), ty = Math.floor(this.target.z / TILE);
    for (let y = Math.max(0, ty - R); y < Math.min(H, ty + R); y++) for (let x = Math.max(0, tx - R); x < Math.min(W, tx + R); x++) {
      const i = idx(x, y);
      if (s.road[i] || s.occ[i] || railBlocks(s, i)) continue;
      this.tileQuad(g, s, i, buildable(m, i) ? 0x4fd17a : 0xd0503e, 0.25);
    }
    if (!g.pos.length) return;
    const mesh = new THREE.Mesh(g.build(), this.matPlace); mesh.frustumCulled = false; mesh.renderOrder = 4;
    this.scene.add(mesh); this.groups.overlay.push(mesh);
  }
  /** まだ編入していない区域を暗くし、市の区域との境に黄色い線を引く */
  private lockKey = ''; private lockMesh: THREE.Mesh | null = null;
  private matLock = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  private matLockLine = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide });
  private lockLine: THREE.Mesh | null = null;
  private rebuildLock(s: GameState): void {
    for (const k of ['lockMesh', 'lockLine'] as const) { const o = this[k]; if (o) { this.scene.remove(o); o.geometry.dispose(); this[k] = null; } }
    if (!s.unlocked) return;
    const g = new Geo(), gl = new Geo(), m = this.map, un = new Set(s.unlocked), lk = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !un.has(blockOf(idx(x, y)));
    // v70：編入前の区域は薄く暗くするだけ（区画のすき間の格子を描かない。地形の色が透けて見えるように）
    { const SUB = 3, st = TILE / SUB, hq = (X: number, Z: number) => heightAt(m, X, Z) + 1.2;
      for (let i = 0; i < N; i++) { const x = i % W, y = (i / W) | 0; if (!lk(x, y) || m.water[i]) continue;
        for (let j = 0; j < SUB; j++) for (let k = 0; k < SUB; k++) { const X0 = x * TILE + k * st, X1 = X0 + st, Z0 = y * TILE + j * st, Z1 = Z0 + st; g.quad([X0, hq(X0, Z1), Z1], [X1, hq(X1, Z1), Z1], [X1, hq(X1, Z0), Z0], [X0, hq(X0, Z0), Z0], 0x18202c); } } }
    // 境目：黄色い低い柵（立てた帯）と、地面の線
    const hy = (x: number, z: number) => heightAt(m, x, z), SEG = 3, Hh = 9;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (lk(x, y)) continue;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (!lk(x + dx, y + dy)) continue;
        for (let k = 0; k < SEG; k++) {
          const a = k / SEG, b = (k + 1) / SEG;
          const [X0, Z0, X1, Z1] = dx ? [(dx > 0 ? x + 1 : x) * TILE, (y + a) * TILE, (dx > 0 ? x + 1 : x) * TILE, (y + b) * TILE] : [(x + a) * TILE, (dy > 0 ? y + 1 : y) * TILE, (x + b) * TILE, (dy > 0 ? y + 1 : y) * TILE];
          const y0 = hy(X0, Z0), y1 = hy(X1, Z1);
          gl.quad([X0, y0 + 0.3, Z0], [X1, y1 + 0.3, Z1], [X1, y1 + Hh, Z1], [X0, y0 + Hh, Z0], 0xffc81e);
        }
      }
    }
    const mesh = new THREE.Mesh(g.build(), this.matLock); mesh.frustumCulled = false; mesh.renderOrder = 4; this.scene.add(mesh); this.lockMesh = mesh;
    const line = new THREE.Mesh(gl.build(), this.matLockLine); line.frustumCulled = false; line.renderOrder = 6; this.scene.add(line); this.lockLine = line;
  }
  private rebuildOverlay(s: GameState): void {
    this.clearGroup('overlay');
    if (this.placeMode) this.rebuildPlace(s);
    if (this.layer === 'none' && !this.showZones) return;
    const g = new Geo();
    const ZC = [0, 0x58b368, 0x3f9bd1, 0x7a5fd0, 0xe8a33a, 0x4a6fa5, 0x9a7a5a];
    const ramp = (v: number) => (v < 0.33 ? 0x3aa655 : v < 0.6 ? 0xd9c53a : v < 0.85 ? 0xe5892f : 0xd0392e);
    const info = (i: number) => s.buildings.find(o => o.id === s.occ[i]);
    const conn = roadInfo(s).conn;
    let tsd: Float32Array | null = null, lp: Float32Array | null = null, busSet: Map<number, number> | null = null;
    for (let i = 0; i < N; i++) {
      if (this.layer === 'conn') {
        if (s.road[i]) { this.tileQuad(g, s, i, conn[i] ? 0x2f7fd0 : 0xd0392e); continue; }
        if (!s.occ[i]) continue;
        const b = info(i)!; this.tileQuad(g, s, i, b.connected ? 0x3aa655 : 0xd0392e);
      } else if (this.layer === 'traffic') {
        if (this.routeSet.has(i)) { this.tileQuad(g, s, i, 0x1fc8e8); continue; }
        if (s.road[i]) this.tileQuad(g, s, i, s.vc[i] < 0.5 ? 0x3aa655 : s.vc[i] < 0.8 ? 0x9bc53d : s.vc[i] < 1.0 ? 0xd9c53a : s.vc[i] < 1.25 ? 0xe5892f : 0xd0392e);
      } else if (this.layer === 'care') {
        if (!s.occ[i]) continue;
        const b = info(i)!;
        if (fam(b.kind) === 'care' || fam(b.kind) === 'privCare') this.tileQuad(g, s, i, b.status === 'operating' ? 0x2f7fd0 : 0x6a1f8a); // 止まっている園は紫
        else if (isRes(b.kind) && b.status === 'operating') {
          if (b.unmet < 0.05) this.tileQuad(g, s, i, 0x9fc4a8);
          else this.tileQuad(g, s, i, ramp(Math.min(1, 0.34 + (1 - b.sv[0]) * 0.8)));
        }
      } else if (this.layer === 'elev') {
        // 海抜（標高）：低いほど青、高いほど茶
        if (this.map.water[i]) continue; const a = altitude(s, i);
        this.tileQuad(g, s, i, a < 2 ? 0x2b6cc4 : a < 5 ? 0x5fb0d8 : a < 10 ? 0x7cc47a : a < 20 ? 0xd9c53a : a < 40 ? 0xd08a3a : 0xa0522d);
      } else if (this.layer === 'land') {
        // 地価（万円/㎡）：高いほど赤
        if (!lp) lp = landPrices(s); const v = lp[i]; if (v <= 0) continue;
        this.tileQuad(g, s, i, v < 4 ? 0xcfe3c8 : v < 7 ? 0x9fd08a : v < 11 ? 0xe8d36a : v < 16 ? 0xf0a050 : v < 24 ? 0xe0643c : 0xb02a3a);
      } else if (this.layer === 'bus') {
        // バス路線：路線の道は色、沿線（停留所から 4 区画）は薄い色
        if (!busSet) { busSet = new Map(); (s.pol?.routes ?? []).forEach((r, k) => { for (const t of r.path) busSet!.set(t, k); }); }
        const k = busSet.get(i); if (k !== undefined) { this.tileQuad(g, s, i, [0xe0402a, 0x2a7fe0, 0x2aa060, 0xd09020, 0x9040c0, 0x20a0b0][k % 6]); continue; }
        if ((s.busStops ?? []).includes(i)) { this.tileQuad(g, s, i, 0x1f2f3f); continue; }
        if (s.occ[i] && routeCarK(s, i) < 1) this.tileQuad(g, s, i, 0xbfe0f4);
      } else if (this.layer === 'tsunami') {
        // 津波ハザードマップ：想定の最大クラスの津波で浸水する深さ
        if (!tsd) tsd = tsunamiDepth(s, designWave(s));
        const d = tsd[i]; if (d <= 0.05) continue;
        this.tileQuad(g, s, i, d < 0.5 ? 0xf2ea7a : d < 1 ? 0xf4c38a : d < 3 ? 0xf08a8a : d < 5 ? 0xe05060 : d < 10 ? 0xb03a8a : 0x7a2a8a);
      } else if (this.layer === 'pipes') {
        // v87：地下の管（上水・下水・ガス）。届いている道路の下に線、関係する施設は青
        if (i === 0) pipeOverlay(s, g, pipeReach(s), (j, x, z) => this.deckH.get(j) ?? heightAt(this.map, x, z));
        if (s.occ[i]) { const b = info(i)!; const f = fam(b.kind); if (f === 'water' || f === 'sewage' || f === 'gas' || b.kind === 'kyodoko') this.tileQuad(g, s, i, f === 'sewage' ? 0x9a5a2a : f === 'gas' ? 0xe8c020 : 0x2a8ae0); }
      } else if (LAYER_SV[this.layer] !== undefined) {
        // 暮らしの観点：住宅は水準（低いほど赤）、関係する施設は青、空気を汚す施設は紫
        const fl = this.layer === 'disaster' ? floodRisk(s) : null;
        if (fl && fl[i] && !s.occ[i] && !s.road[i]) { this.tileQuad(g, s, i, 0x7fb0e0); continue; }
        if (!s.occ[i]) continue;
        const b = info(i)!, [sv, fams] = LAYER_SV[this.layer]!;
        if (fams.includes(fam(b.kind)) || (this.layer === 'env' && fam(b.kind) === 'park')) { this.tileQuad(g, s, i, 0x2f7fd0); continue; }
        if (this.layer === 'env' && (DEFS[b.kind].pollution ?? 0) >= 1 && b.status === 'operating') { this.tileQuad(g, s, i, 0x7a3fa0); continue; }
        if (isRes(b.kind) && b.status === 'operating') {
          let v: number;
          if (sv < 0) { let n = 0, a = 0; for (let t = 0; t < b.sat.length; t++) { const h = b.hh?.[t] ?? 0; n += h; a += h * b.sat[t]; } v = n > 0.05 ? a / n : 1; v = (v - 0.45) / 0.4; }
          else v = b.sv[sv] ?? 1;
          if (fl && fl[i]) v = Math.min(v, 0.35);
          this.tileQuad(g, s, i, v >= 0.8 ? 0x9fc4a8 : v >= 0.7 ? 0xd9c53a : v >= 0.55 ? 0xe5892f : 0xd0392e);
        }
      } else if (this.layer === 'age') {
        if (s.road[i] === 1 || s.road[i] === 2) this.tileQuad(g, s, i, ramp(s.roadAge[i] / 100 * 1.15));
        else if (s.occ[i]) { const b = info(i)!; if (isCity(b.kind)) this.tileQuad(g, s, i, ramp(b.age / 100 * 1.05)); }
      } else if (this.showZones) {
        const ar = s.area?.[i] ?? 0;
        if (this.showArea && ar) this.tileQuad(g, s, i, ar === 1 ? 0xc9a24a : 0x3fb6a8);
        else if (s.zone[i]) this.tileQuad(g, s, i, ZC[s.zone[i]]);
        else if (ar === 1 && !s.occ[i] && !s.road[i]) this.tileQuad(g, s, i, 0xc9a24a);
      }
    }
    if (!g.pos.length) return;
    const mesh = new THREE.Mesh(g.build(), this.matOverlay); mesh.frustumCulled = false; mesh.renderOrder = 5;
    this.scene.add(mesh); this.groups.overlay.push(mesh);
  }
  /** 設置プレビューや選択の強調。tiles: [タイル, 色] */
  setCursor(tiles: [number, number][]): void {
    this.clearGroup('cursor');
    if (!tiles.length) return;
    const g = new Geo(), s = this.getState();
    for (const [i, color] of tiles) if (i >= 0 && i < N) this.tileQuad(g, s, i, color, 0.5);
    const mesh = new THREE.Mesh(g.build(), this.matCursor); mesh.frustumCulled = false; mesh.renderOrder = 8;
    this.scene.add(mesh); this.groups.cursor.push(mesh);
  }
  /** 道具を選んでいるときの手がかり（カーソルの周りの、建てられる所・買収できる所など）。薄く塗る */
  setHelp(tiles: [number, number][]): void {
    this.clearGroup('help');
    if (!tiles.length) return;
    const g = new Geo(), s = this.getState(), byId = new Map<number, Building>();
    for (const b of s.buildings) byId.set(b.id, b);
    for (const [i, color] of tiles) if (i >= 0 && i < N) this.tileQuad(g, s, i, color, 0.4, byId);
    const mesh = new THREE.Mesh(g.build(), this.matHelp); mesh.frustumCulled = false; mesh.renderOrder = 6;
    this.scene.add(mesh); this.groups.help.push(mesh);
  }
  private ghostKey = '';
  setGhost(kind: Kind | null, x = 0, y = 0): void {
    const key = kind ? `${kind}:${x}:${y}` : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    this.clearGroup('ghost');
    if (!kind) return;
    const s = this.getState(), d = DEFS[kind], c = this.ctx(0.31);
    const acc = (() => { for (let k = 0; k < d.w; k++) { if (inMap(x + k, y + d.h) && s.road[idx(x + k, y + d.h)]) return idx(x + k, y + d.h); } for (let k = 0; k < d.w; k++) { if (inMap(x + k, y - 1) && s.road[idx(x + k, y - 1)]) return idx(x + k, y - 1); } for (let k = 0; k < d.h; k++) { if (inMap(x - 1, y + k) && s.road[idx(x - 1, y + k)]) return idx(x - 1, y + k); } for (let k = 0; k < d.h; k++) { if (inMap(x + d.w, y + k) && s.road[idx(x + d.w, y + k)]) return idx(x + d.w, y + k); } return -1; })();
    const p = this.place(s, { x, y, w: d.w, h: d.h, acc });
    c.g.at(p.x, p.y + 0.3, p.z, p.rot);
    MODEL[kind](c);
    for (const geo of [c.g, c.wa, c.wb]) { if (!geo.pos.length) continue; const mesh = new THREE.Mesh(geo.build(), this.matGhost); mesh.frustumCulled = false; mesh.renderOrder = 7; this.scene.add(mesh); this.groups.ghost.push(mesh); }
  }
  refreshOverlay(): void { this.sigOverlay = ''; }

  // ------------------------------------------------------------ 車と歩行者（演出。人口とは別）
  // ------------------------------------------------------------ まちづくり版の列車（線路の上を走る演出。計算とは別）
  private trains: Tr[] = [];
  /** v88：列車の車種ごとの InstancedMesh（trainkit.ts の車種名と sl）。品質が変わると作り直す */
  private tIM: Record<string, THREE.InstancedMesh> | null = null; private tQ = ''; private tmpC = new THREE.Color();
  /** 乗る電車（0 番の編成の先頭車）の位置。走っていなければ count 0 */
  private rideTrain = { count: 0, m: new THREE.Matrix4(), getMatrixAt(_i: number, m: THREE.Matrix4) { m.copy(this.m); } };
  /** 線の端の区画で、次に進む線を選ぶ（まっすぐ続く向きを優先）。なければ -1 */
  private nextPath(at: number, from: number, hx: number, hz: number): [number, 1 | -1] | null {
    const opts: [number, 1 | -1, number][] = [];
    this.railPaths.forEach((P, k) => {
      if (k === from && this.railPaths.length > 1 && P.a !== P.b) return;
      for (const [end, dir] of [[P.a, 1], [P.b, -1]] as const) {
        if (end !== at || (dir === 1 && P.extA) || (dir === -1 && P.extB)) continue;
        const [, , , yaw] = railAt(P, dir === 1 ? 4 : P.len - 4), dx = Math.sin(yaw) * dir, dz = Math.cos(yaw) * dir;
        opts.push([k, dir, dx * hx + dz * hz]);
      }
    });
    const ok = opts.filter(o => o[2] > 0.5);
    if (!ok.length) return null;
    ok.sort((a, b) => b[2] - a[2]);
    const pick = ok.length > 1 && ok[1][2] > ok[0][2] - 0.25 && Math.random() < 0.5 ? ok[1] : ok[0];
    return [pick[0], pick[1]];
  }
  private spawnOne(): Omit<Tr, 'fam'> | null {
    const P = this.railPaths; if (!P.length) return null; const z = { trail: [] as number[], wait: 0, stopped: -1, v: 18, stopAt: NaN, stopSt: -1, door: 0 };
    // 市外から入ってくる線があれば、そこから
    const ins: [number, 1 | -1][] = []; P.forEach((p, k) => { if (p.extA) ins.push([k, 1]); if (p.extB) ins.push([k, -1]); });
    if (ins.length) { const [k, dir] = ins[(Math.random() * ins.length) | 0]; return { path: k, dir, d: dir === 1 ? 0 : P[k].len, ...z }; }
    const k = (Math.random() * P.length) | 0; return { path: k, dir: 1, d: Math.random() * P[k].len, ...z };
  }
  /** 列車：1 編成 2〜4 両。最大 12 編成（複線では上りと下りがすれ違う）。夜は窓とライトが光る。観光 SL の機関区があれば 1 編成は蒸気機関車。
   * v88：車種は編成の番号で決まる（3 本に 1 本は特急、6 本に 1 本は近郊形、5 本以上なら 1 本は貨物、単線の支線は気動車、モノレール・新交通の線はそれぞれの車両） */
  private trainPax!: THREE.InstancedMesh; private paxM = new THREE.Matrix4(); private paxL = new THREE.Matrix4();
  private trainWin: THREE.InstancedMesh | null = null; private trainLamp: THREE.InstancedMesh | null = null; private slTrain = -1; expEvery = 3; private slPuff = 0;
  private buildTrainMeshes(): void {
    if (this.tIM) { const mats = new Set<THREE.Material>(); for (const im of Object.values(this.tIM)) { this.scene.remove(im); im.geometry.dispose(); mats.add(im.material as THREE.Material); im.dispose(); } for (const m of mats) m.dispose(); }
    const MX = 12 * 4, q = this.quality === 'high' && !this.lite ? 2 : this.quality === 'mid' ? 1 : 0, T = makeTrains(q === 2 ? 10 : 8, q), IM: Record<string, THREE.InstancedMesh> = {};
    const tm = tint0(new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.4, metalness: 0.32 }));
    const add = (k: string, geo: THREE.BufferGeometry, mat: THREE.Material, n: number, shadow: boolean) => { const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = shadow; im.count = 0; im.visible = false; im.setColorAt(0, new THREE.Color(0xffffff)); this.scene.add(im); IM[k] = im; };
    for (const [k, m] of Object.entries(T)) { const g = new Geo(); carMesh(g, m, 0, 0, 0, (t) => TK_PART[t]); add(k, g.build(), tm, MX, k[0] !== 'o' && !this.lite); }
    // 蒸気機関車（Blender の形。1 編成に 1 両）
    { const g = new Geo(), PC = [0x1c1c1e, 0xb02a22, 0x3a4a52, 0xfff2c8, 0xc9a24a, 0x2a2622, 0x6a6a6a]; carMesh(g, VM2.loco, 0, 0, 0, (t) => PC[t]); add('sl', g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.35 }), 2, true); }
    this.tIM = IM; this.tQ = this.quality + (this.lite ? 'L' : '');
    if (this.trainWin) return;
    // 窓の帯（夜に灯る）。車種ごとに大きさを合わせる（行列で伸び縮み）
    const wg = new THREE.BoxGeometry(2.96, 0.95, 17.2); wg.translate(0, 2.65, 0);
    this.trainWin = new THREE.InstancedMesh(wg, new THREE.MeshBasicMaterial({ color: 0xfff1cc, transparent: true, opacity: 0, depthWrite: false }), MX);
    this.trainWin.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.trainWin.frustumCulled = false; this.scene.add(this.trainWin);
    // v87：窓ぎわの乗客（立ち客の上半身と頭）。混むほど多く、ぎっしり並ぶ。1 両の片側に最大 12 人
    { const g = new Geo(); g.box(0, 2.2, 0, 0.03, 0.52, 0.5, 0xffffff); g.box(0, 2.74, 0, 0.03, 0.3, 0.27, 0x3a302a);
      this.trainPax = new THREE.InstancedMesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), MX * 24); this.trainPax.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.trainPax.frustumCulled = false; this.trainPax.castShadow = false; this.trainPax.count = 0; this.trainPax.setColorAt(0, new THREE.Color()); this.scene.add(this.trainPax); }
    // 前照灯（白）と尾灯（赤）。v88：前面の灯具の大きさに合わせて小さく
    const lg = new THREE.BoxGeometry(0.36, 0.18, 0.08);
    this.trainLamp = new THREE.InstancedMesh(lg, new THREE.MeshBasicMaterial({ color: 0xffffff }), 12 * 4);
    this.trainLamp.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.trainLamp.frustumCulled = false; this.trainLamp.setColorAt(0, new THREE.Color(0xffffff)); this.scene.add(this.trainLamp);
  }
  private spawnTrains(s: GameState): void {
    if (!this.tIM || this.tQ !== this.quality + (this.lite ? 'L' : '')) this.buildTrainMeshes();
    const total = this.railPaths.reduce((a, p) => a + p.len, 0);
    const n = !this.railPaths.length ? 0 : Math.min(12, Math.max(2, Math.round(total / 1100)));
    this.trains = [];
    for (let k = 0; k < n; k++) { const t = this.spawnOne(); if (t) { const P = this.railPaths[t.path]; t.d = (k + Math.random() * 0.6) / n * P.len; t.dir = k % 2 ? -1 : 1; this.trains.push({ ...t, fam: 'commuter' }); } }
    // 他の線とつながっていない線（乗り換え駅で終わる支線・地下鉄）にも 1 編成ずつ走らせる。単線なら気動車
    const branch = new Set<number>();
    this.railPaths.forEach((P, k) => { if (this.trains.length >= 12 || P.extA || P.extB || this.trains.some(t => t.path === k)) return;
      const lonely = !this.railPaths.some((Q, j) => j !== k && (Q.a === P.a || Q.b === P.a || Q.a === P.b || Q.b === P.b)); if (!lonely) return;
      if (!P.lv.some(v => v >= 2)) branch.add(this.trains.length);
      this.trains.push({ path: k, dir: 1, d: P.len * 0.3, trail: [], wait: 0, stopped: -1, v: 0, stopAt: NaN, stopSt: -1, door: 0, fam: 'commuter' }); });
    this.slTrain = s.buildings.some(b => b.kind === 'slDepot' && b.status === 'operating') && this.trains.length > 1 ? this.trains.length - 1 : -1; // SL は最後の編成（乗る電車は 0 番のふつうの電車）
    const nT = this.trains.length;
    this.trains.forEach((t, k) => { t.fam = k === this.slTrain ? 'sl' : branch.has(k) ? 'diesel' : k % this.expEvery === this.expEvery - 1 ? 'express' : k === 4 && nT >= 5 ? 'freight' : k % 6 === 3 ? 'kinko' : 'commuter'; });
  }
  /** 運行時間：1〜5 時は終電後で走らない。5〜6 時と 23 時以降は半分。SL は 3〜11 月の 9〜16 時半だけ（冬は運休） */
  private trainLive(k: number): boolean {
    if (k < 0) return false;
    const hr = this.hour % 24, lvl = hr >= 1 && hr < 5 ? 0 : hr < 6 || hr >= 23 ? 0.5 : 1, nNorm = this.trains.length - (this.slTrain >= 0 ? 1 : 0);
    if (k === this.slTrain) return this.calM >= 2 && this.calM <= 10 && hr >= 9 && hr < 16.5;
    return k < Math.ceil(nNorm * lvl);
  }
  private moveTrains(s: GameState, dt: number): void {
    if (!this.tIM || this.trainKey !== this.sigRoad || this.tQ !== this.quality + (this.lite ? 'L' : '')) { this.trainKey = this.sigRoad; this.spawnTrains(s); }
    const up = new THREE.Vector3(0, 1, 0);
    const stations = s.buildings.filter(b => b.kind === 'station' && b.status === 'operating');
    const live = (k: number) => this.trainLive(k), slOn = this.trainLive(this.slTrain);
    // 踏切：列車（先頭と最後尾）が踏切の中心から 70m 以内なら遮断機を下ろす
    this.crossClosed.clear();
    if (this.gates.length) for (const [k, tr] of this.trains.entries()) {
      const P = this.railPaths[tr.path]; if (!P || !live(k)) continue;
      for (const back of [0, 30, 60]) { const [x, , z] = railAt(P, tr.d - tr.dir * back); for (const gt of this.gates) { const cx = (gt.tile % W + 0.5) * TILE, cz = (((gt.tile / W) | 0) + 0.5) * TILE; if (Math.hypot(cx - x, cz - z) < 70) this.crossClosed.add(gt.tile); } }
    }
    const nearStation = (i: number) => { const x = i % W, y = (i / W) | 0; return stations.findIndex(b => x >= b.x - 1 && x <= b.x + b.w && y >= b.y - 1 && y <= b.y + b.h); };
    // v87：車内の混み具合：駅の混雑率（sim の stationStats）のいちばん高い駅を基準に、朝夕に多く夜は少ない
    const ssx = this.stStats(s), worst = ssx.reduce((m, x) => Math.max(m, x.crowd), 0), hr0 = this.hour, rsh = Math.min(1, this.rush()), dayK = hr0 < 5 || hr0 >= 23 ? 0.12 : 0.25 + 0.75 * rsh;
    const paxLook = stationLook(worst ? worst : 60), PC = [0xa8a8a6, 0x1c232c, 0x323c50, 0x8e8a80, 0x525c68, 0x702828, 0x283c28, 0x9a948a]; // 窓ごしなので暗めの服
    let np = 0, nw = 0, nl = 0; const paxCap = this.quality === 'low' || this.lite ? 6 : 12, IM = this.tIM!, cnt: Record<string, number> = {}; for (const key in IM) cnt[key] = 0;
    const put = (key: string, m: THREE.Matrix4, col?: number) => { const im = IM[key], i = cnt[key]; if (!im || i >= im.instanceMatrix.count) return; im.setMatrixAt(i, m); if (col !== undefined) im.setColorAt(i, this.tmpC.setHex(col)); cnt[key] = i + 1; };
    const winM = new THREE.Matrix4(); this.rideTrain.count = 0;
    this.trains.forEach((tr, k) => {
      let P = this.railPaths[tr.path];
      if (!P) { const t = this.spawnOne(); if (!t) return; Object.assign(tr, t); P = this.railPaths[tr.path]; }
      const kd = P.kind ?? 0, fam: TrainFam = kd === 1 ? 'mono' : kd === 2 ? 'agt' : tr.fam, F = FAMS[fam], nC = F.cars.length, GAP = 0.55;
      const lenT = F.dim.reduce((a, d) => a + 2 * CAR_DIM[d].HL + GAP, 0), vmax = kd === 2 ? 14 : kd === 1 ? 17 : fam === 'express' ? 24 : fam === 'freight' ? 21 : 20, ACC = 1.0, DEC = 1.1;
      if (tr.wait > 0) { tr.wait -= dt; tr.v = 0; if (tr.wait <= 0) tr.door = 0; }
      else {
        // v88：駅の手前から減速して、編成がホームの中ほどに収まる所で止まる（加速・減速はなめらかに）。貨物は通過
        if (F.stop && Number.isNaN(tr.stopAt)) {
          const stAt = (o: number) => { const [x, , z] = railAt(P, tr.d + tr.dir * o), ti = Math.floor(z / TILE) * W + Math.floor(x / TILE); return ti >= 0 && ti < W * H ? nearStation(ti) : -1; };
          const look = tr.v * tr.v / (2 * DEC) + 6, st = stAt(look);
          if (st >= 0 && st !== tr.stopped) { const sp = this.stSpots.find(o => o.id === stations[st].id && o.path === tr.path), cen = sp ? (sp.d - tr.d) * tr.dir + lenT / 2 - 1.5 : -1; // ホームの中心に編成の中ほど
            if (cen >= look - 2) tr.stopAt = tr.d + tr.dir * cen; else { let e = look; while (e < look + 240 && stAt(e + 6) === st) e += 6; tr.stopAt = tr.d + tr.dir * Math.max(look, Math.min(e, (look + e) / 2 + lenT / 2 - 4)); } tr.stopSt = st; }
        }
        let vt = vmax;
        if (!Number.isNaN(tr.stopAt)) { const rem = (tr.stopAt - tr.d) * tr.dir; vt = Math.min(vmax, Math.sqrt(2 * DEC * Math.max(0, rem)) + 0.4);
          if (rem <= 0.3) { const st = tr.stopSt; tr.stopAt = NaN; tr.v = 0; vt = 0; if (st >= 0 && st < stations.length) { tr.stopped = st; tr.wait = 8; tr.door = 1; if (live(k)) { this.stFill.set(stations[st].id, this.stLeft.get(stations[st].id) ?? 0.15); this.stArr.set(stations[st].id, this.lifeT); const [hx0, , hz0] = railAt(P, tr.d); this.sfx('trainStop', hx0, 0, hz0); } } } } // 乗客が乗る
        tr.v = tr.v < vt ? Math.min(vt, tr.v + ACC * dt) : vt;
        tr.d += dt * tr.v * tr.dir;
        if (tr.d < 0 || tr.d > P.len) {
          const atEnd = tr.d > P.len, ext = atEnd ? P.extB : P.extA, node = atEnd ? P.b : P.a; tr.stopAt = NaN;
          const [, , , yaw] = railAt(P, atEnd ? P.len : 0), hx = Math.sin(yaw) * tr.dir, hz = Math.cos(yaw) * tr.dir;
          const nx = ext ? null : this.nextPath(node, tr.path, hx, hz);
          if (nx) { const over = atEnd ? tr.d - P.len : -tr.d; tr.path = nx[0]; tr.dir = nx[1]; P = this.railPaths[tr.path]; tr.d = tr.dir === 1 ? over : P.len - over; }
          else if (ext) { const t = this.spawnOne(); if (t) Object.assign(tr, t); P = this.railPaths[tr.path]; } // 市外へ出た列車は、別の入口から入ってくる
          else { tr.dir = tr.dir === 1 ? -1 : 1; tr.d = Math.max(0, Math.min(P.len, tr.d)); tr.trail = []; tr.wait = 8; tr.v = 0; } // 行き止まりで折り返す
        }
      }
      // 複線は進む向きの左側の線路を走る（日本は左側通行）。モノレール・新交通は 2 本の軌道
      const nP = P.d.length, at = (d: number) => P.lv[Math.max(0, Math.min(nP - 1, Math.round(d / (P.len || 1) * (nP - 1))))] ?? 1;
      const lane = (d: number) => (at(d) >= 2 ? (kd === 1 ? 2.4 : kd === 2 ? 2.1 : 2.2) : 0) * -tr.dir;
      const [rx, py0, rz, ryaw] = railAt(P, tr.d), ln = lane(tr.d), px = rx - Math.cos(ryaw) * ln, pz = rz + Math.sin(ryaw) * ln, py = py0 + 0.4;
      const tl = tr.trail, last = tl.length;
      if (!last || Math.hypot(tl[last - 3] - px, tl[last - 1] - pz) > 1) { tl.push(px, py, pz); if (tl.length > 3 * 110) tl.splice(0, 3); }
      if (!live(k)) return; // 走っていない時間は見せない（車両基地・駅に入っている）
      const sl = fam === 'sl', doors = F.door && tr.door && tr.wait > 1.2 && tr.wait < 7.0;
      let headX = 0, headY = 0, headZ = 0, headYaw = 0, tailX = 0, tailY = 0, tailZ = 0, tailYaw = 0, hd = CAR_DIM[F.dim[0]], td = CAR_DIM[F.dim[nC - 1]], acc0 = 0;
      for (let c = 0; c < nC; c++) {
        const D = CAR_DIM[F.dim[c]], cl = 2 * D.HL;
        let want = acc0 + cl / 2 - 0.75, j = tl.length - 3, acc = 0, qx = px, qy = py, qz = pz, yaw = 0; acc0 += cl + GAP;
        while (j >= 3) { const dx = tl[j] - tl[j - 3], dz = tl[j + 2] - tl[j - 1], L = Math.hypot(dx, dz); if (acc + L >= want) { const t = (want - acc) / (L || 1); qx = tl[j] - dx * t; qy = tl[j + 1] - (tl[j + 1] - tl[j - 2]) * t; qz = tl[j + 2] - dz * t; yaw = Math.atan2(dx, dz); break; } acc += L; j -= 3; }
        if (j < 3) { const dd = tr.d - tr.dir * want, [bx, by, bz, yw] = railAt(P, dd), l2 = lane(dd); qx = bx - Math.cos(yw) * l2; qy = by + 0.4; qz = bz + Math.sin(yw) * l2; yaw = yw + (tr.dir === 1 ? 0 : Math.PI); }
        qy += kd === 1 ? -1.3 : kd === 2 ? -0.1 : 0;
        this.tmpQ.setFromAxisAngle(up, yaw + (F.flip[c] ? Math.PI : 0)); this.tmpV.set(qx, qy, qz);
        if (sl && c === 0) this.tmpS.set(1.0, 1.12, 0.62); // Blender の蒸気機関車は長さを詰める
        this.tmpM.compose(this.tmpV, this.tmpQ, sl && c === 0 ? this.tmpS : this.tmpS1); this.tmpS.set(1, 1, 1);
        put(F.cars[c], this.tmpM, famColor(fam, k, c));
        if (k === 0 && c === 0) { this.rideTrain.m.copy(this.tmpM); this.rideTrain.count = 1; }
        if (doors) put(F.door!, this.tmpM); // 停車中はドアが開く
        if (D.win && nw < this.trainWin!.instanceMatrix.count) { winM.makeScale(D.HW / 1.45, D.winH / 0.95, (cl - 2.6) / 17.2).setPosition(0, D.win - 2.65 * D.winH / 0.95, 0); this.tmpM2.multiplyMatrices(this.tmpM, winM); this.trainWin!.setMatrixAt(nw++, this.tmpM2); }
        if (F.pax) { // 窓の乗客：両側に、混むほど多く（超満員では窓いっぱい）。窓の高さに合わせ、ガラスのすぐ外に暗めの色で
          const m = Math.min(paxCap, Math.round(paxLook.pax * dayK * (0.75 + 0.5 * ((k * 0.37) % 1)) * (cl / 19.5))), zr = cl / 2 - 1.6; this.tmpQ.setFromAxisAngle(up, yaw); this.paxM.compose(this.tmpV, this.tmpQ, this.tmpS1);
          for (const sd of [-1, 1]) for (let q = 0; q < m && np < this.trainPax.instanceMatrix.count; q++) { const hz = (q * 0.618 + k * 0.13 + c * 0.29 + (sd > 0 ? 0.5 : 0)) % 1, zz = -zr + 2 * zr * (m > 1 ? (q + 0.5 * hz) / m : hz);
            this.paxL.makeTranslation(sd * (D.HW + 0.04), D.win - 2.7 + (hz - 0.5) * 0.12, zz); this.tmpM2.multiplyMatrices(this.paxM, this.paxL); this.trainPax.setMatrixAt(np, this.tmpM2); this.trainPax.setColorAt(np, this.tmpC.setHex(PC[(q * 3 + k + c) % PC.length])); np++; } }
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        if (c === 0) { headX = qx + fx * (D.HL + 0.12); headY = qy + D.lamp; headZ = qz + fz * (D.HL + 0.12); headYaw = yaw; }
        if (c === nC - 1) { tailX = qx - fx * (D.HL + 0.12); tailY = qy + D.lamp; tailZ = qz - fz * (D.HL + 0.12); tailYaw = yaw; }
      }
      // 前照灯 2 つ（白）と尾灯 2 つ（赤）。貨物の最後尾は反射板の代わりに赤い標識灯
      for (let q = 0; q < 4; q++) { const head = q < 2, D = head ? hd : td, side = (q % 2 ? 1 : -1) * (head ? D.lx : D.lx + 0.34), yw = head ? headYaw : tailYaw, cx = (head ? headX : tailX) + Math.cos(yw) * side, cz = (head ? headZ : tailZ) - Math.sin(yw) * side;
        if (head && sl) { if (q === 1) continue; } // SL は前照灯が 1 つ（真ん中）
        this.tmpQ.setFromAxisAngle(up, yw); this.tmpV.set(cx, head ? headY : tailY, cz); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS1); this.trainLamp!.setMatrixAt(nl, this.tmpM);
        this.trainLamp!.setColorAt(nl++, this.tmpC.setHex(head ? (sl ? 0xffe9a8 : 0xffffff) : 0xff2a1a)); }
      // 蒸気機関車の煙
      if (sl && slOn && tr.wait <= 0) { this.slPuff -= dt; if (this.slPuff <= 0) { this.slPuff = 0.22; this.fx.burst(headX - Math.sin(headYaw) * 3, headY + 3.4, headZ - Math.cos(headYaw) * 3, 'smoke', 1, 1.5); } }
    });
    for (const key in IM) { const im = IM[key]; im.count = cnt[key]; im.visible = cnt[key] > 0; if (im.visible) { im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; } }
    this.trainPax.count = np; if (np) { this.trainPax.instanceMatrix.needsUpdate = true; if (this.trainPax.instanceColor) this.trainPax.instanceColor.needsUpdate = true; }
    this.trainWin!.count = nw; this.trainWin!.instanceMatrix.needsUpdate = true; (this.trainWin!.material as THREE.MeshBasicMaterial).opacity = Math.min(0.92, NIGHT_U.value * 1.3);
    this.trainLamp!.count = nl; this.trainLamp!.instanceMatrix.needsUpdate = true; if (this.trainLamp!.instanceColor) this.trainLamp!.instanceColor.needsUpdate = true;
  }
  /** 遮断機：列車が下りていれば下ろし（水平）、いなければ上げる（垂直） */
  private moveGates(dt: number): void {
    const up = new THREE.Vector3(0, 1, 0), ax = new THREE.Vector3(0, 0, 1), q2 = new THREE.Quaternion();
    this.gateArms.count = this.gates.length;
    this.gates.forEach((gt, k) => {
      const want = this.crossClosed.has(gt.tile) ? 0 : Math.PI / 2 - 0.08;
      const cur = this.gateAng[k] ?? want; this.gateAng[k] = cur + Math.max(-dt * 1.4, Math.min(dt * 1.4, want - cur));
      this.tmpQ.setFromAxisAngle(up, Math.atan2(-gt.dz, gt.dx)); q2.setFromAxisAngle(ax, this.gateAng[k]); this.tmpQ.multiply(q2);
      this.tmpV.set(gt.x, gt.y, gt.z); this.tmpM.compose(this.tmpV, this.tmpQ, new THREE.Vector3(gt.len, 1, 1));
      this.gateArms.setMatrixAt(k, this.tmpM);
    });
    this.gateArms.instanceMatrix.needsUpdate = true;
  }
  /** 駅のホームの乗客：朝夕に多く、駅の利用者が多いほど多い。列車が出ると減り、だんだん増える */
  private moveCrowd(s: GameState, dt: number): void {
    const up = new THREE.Vector3(0, 1, 0), r = Math.min(1, this.rush()), h = this.hour, night = h < 5 || h >= 23;
    // 乗客の見た目（時間帯と季節で入れかえる。ホームは屋根の下なので傘はたたむ）
    const ck = `${calMonth(s.month)}:${Math.floor(h / 3)}`;
    if (ck !== this.crowdKey) {
      this.crowdKey = ck; const rr = seeded(7 + Math.floor(h / 3));
      for (let i = 0; i < CROWD_N; i++) { let t = pickType(h, rr); if (t === 'dog' || t === 'jogger' || t === 'parent') t = 'worker'; const L = makeLook(t, rr, calMonth(s.month), false); this.crowdLooks[i] = L; this.crowdP.setLook(i, L); this.crowdP.setPose(i, 0, 0); }
      this.crowdP.commitLooks();
    }
    const byId = new Map(s.buildings.map(b => [b.id, b] as const)), rc = this.stCrowdRes(s), crowd = rc ?? new Map(this.stStats(s).map(x => [x.b.id, x.crowd] as const));
    const cap = Math.round(CROWD_N * (this.quality === 'low' || this.lite ? 0.4 : this.quality === 'mid' ? 0.7 : 1)), rk = night ? 0.08 : 0.3 + 0.7 * r;
    let n = 0;
    const put = (x: number, y: number, z: number, yaw: number, ph: number, amp: number) => {
      const L = this.crowdLooks[n]; this.tmpQ.setFromAxisAngle(up, yaw); this.tmpV.set(x, y, z); this.tmpS.set(L.scale * L.width, L.scale, L.scale); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.tmpS.set(1, 1, 1);
      this.crowdP.mesh.setMatrixAt(n, this.tmpM); this.crowdP.setPose(n, ph, amp * L.amp); n++; };
    for (const sp of this.stSpots) {
      const b = byId.get(sp.id); if (!b || b.status !== 'operating' || !sp.pts.length) continue;
      // v87：駅の混雑率（sim の stationStats）で、ホームの人数・乗り残し・駅前にあふれる人が変わる
      const lk = stationLook(crowd.get(sp.id) ?? 100); this.stLeft.set(sp.id, lk.left);
      const f = Math.min(1, (this.stFill.get(sp.id) ?? 1) + dt / 40); this.stFill.set(sp.id, f);
      // v88：ホームは混雑率で端まで埋まり、1.0 を超えるとすき間に人が詰まる（同じ立ち位置の隣に、ずらしてもう 1 人）。朝夕に多く、昼は半分ほど
      const P = this.plazaPts(s, sp, b), pz = P.pz, np = sp.pts.length / 3 | 0, rkc = rc ? (night ? 0.08 : 1) : night ? 0.08 : 0.45 + 0.55 * r; // v98：住民から出した混雑率は時刻込み
      // 人数を先に決め、品質の上限（cap）に収まらなければ全部を同じ割合で減らす（ホームだけ・広場だけにならないように）
      const W0 = [np * lk.plat * rkc * f, 0, pz.length / 4 * lk.spill * 0.6 * rkc * (0.5 + 0.5 * f), P.q.length / 4 * lk.queue * rkc, Math.min(P.st.length / 4, 320) * lk.street * rkc]; W0[1] = W0[0] * lk.dense * 1.4;
      const tot = W0.reduce((a, v) => a + v, 0), sc = tot > 0 ? Math.min(1, (cap - n) / tot) : 1, [want, dup, spill, nq, ns] = W0.map(v => Math.round(v * sc));
      for (let k = 0; k < want && n < cap; k++) put(sp.pts[k * 3], sp.pts[k * 3 + 1], sp.pts[k * 3 + 2], (k * 2.39) % (Math.PI * 2), 0, 0);
      for (let k = 0; k < dup && n < cap; k++) { const q = (k * 7) % Math.max(1, want), a = k * 2.39 + 0.7, d = 0.55 + (k % 3) * 0.12; put(sp.pts[q * 3] + Math.cos(a) * d, sp.pts[q * 3 + 1], sp.pts[q * 3 + 2] + Math.sin(a) * d, a, 0, 0); }
      if (!pz.length) continue;
      // 列車が着いた直後：降りた人がホームから改札・駅前へ歩いていく（混むほど多い）
      const ta = this.lifeT - (this.stArr.get(sp.id) ?? -99);
      if (ta < 10 && !night && np) { const m = Math.round(Math.min(90, 6 + lk.load * 18) * (0.4 + 0.6 * rk));
        for (let k = 0; k < m && n < cap; k++) { const u = ta / 10 * 1.7 - (k % 20) * 0.035; if (u <= 0 || u >= 1) continue; const a0 = ((k * 7) % np) * 3, g = (k % 12) * 4;
          const x0 = sp.pts[a0], y0 = sp.pts[a0 + 1], z0 = sp.pts[a0 + 2], x1 = pz[g], y1 = pz[g + 1], z1 = pz[g + 2];
          put(x0 + (x1 - x0) * u, y0 + (y1 - y0) * u, z0 + (z1 - z0) * u, Math.atan2(x1 - x0, z1 - z0), this.lifeT * 6 + k, 1); } }
      // 改札前の人だかりと駅前広場：混雑率 0.85 から改札の前に固まり、1.5 で広場いっぱいに広がる（改札に近い順）
      for (let k = 0; k < spill && n < cap; k++) put(pz[k * 4], pz[k * 4 + 1], pz[k * 4 + 2], pz[k * 4 + 3], 0, 0);
      // 入場規制：広場の外側に、折り返しの列（混雑率 1.2 から。列の先頭から順に詰まる）
      for (let k = 0; k < nq && n < cap; k++) put(P.q[k * 4], P.q[k * 4 + 1], P.q[k * 4 + 2], P.q[k * 4 + 3], (k % 9) * 0.3, 0.15);
      // まわりの歩道：駅へ向かう人で埋まる（混雑率 1.1 から。駅に近い歩道から）
      for (let k = 0; k < ns && n < cap; k++) put(P.st[k * 4], P.st[k * 4 + 1], P.st[k * 4 + 2], P.st[k * 4 + 3], this.lifeT * 5 + k, k % 3 === 0 ? 1 : 0.1);
    }
    if (n !== this.crowdP.mesh.count || n) { this.crowdP.mesh.count = n; this.crowdP.commitPose(); }
    this.stats.peds = this.peds.length + n;
  }
  /** v98：駅ごとの、いまの混雑率を住民の乗車から出す（1 時間あたりの乗車 ÷ 輸送力。輸送力は sim の stationStats の混雑率と 1 日の乗降から逆算した、
   *  増発・複線・車両基地を込みの値。朝のピーク 1 時間に 1 日の乗車の 3 割として、1 日 9000 人 = 100% の sim の目安に合わせる）。住民がいなければ null（今までの値） */
  private stCrowdRes(s: GameState): Map<number, number> | null {
    const key = `${s.month}:${s.bVersion}:${Math.floor(this.hour * 4)}:${this.isHol() ? 1 : 0}`;
    if (this.stRK === key) return this.stRC;
    this.stRK = key; this.stRC = null;
    const ss = this.stStats(s); if (!ss.length || !(s.stats.pop > 0)) return null;
    try {
      const f = stationFlow(s, this.hour, this.isHol()), out = new Map<number, number>(); let any = false;
      for (const x of ss) { const capK = x.crowd > 41 && x.crowd < 339 ? x.riders / (9000 * (x.crowd - 40) / 100) : 1, v = f.now.get(x.b.id) ?? 0; if (f.am.get(x.b.id)) any = true;
        out.set(x.b.id, Math.round(40 + 100 * v / (9000 * 0.5 * 0.3 * Math.max(0.3, capK)))); }
      this.stRC = any ? out : null; this.stRAm = f.am;
    } catch { this.stRC = null; }
    return this.stRC;
  }
  private stRK = ''; private stRC: Map<number, number> | null = null;
  /** 検査用：駅ごとの住民の朝の乗車（v95）と、いまの混雑率（住民から） */
  stRAm: Map<number, number> = new Map();
  stInfo(): { id: number; am: number; crowd: number; agg: number }[] { const s = this.getState(), rc = this.stCrowdRes(s); return this.stStats(s).map(x => ({ id: x.b.id, am: this.stRAm.get(x.b.id) ?? 0, crowd: rc?.get(x.b.id) ?? -1, agg: x.crowd })); }
  /** v87：駅ごとの混雑率（sim の stationStats を読むだけ。政策の記録がまだ無い街では空） */
  private stStats(s: GameState): { b: Building; crowd: number; riders: number }[] {
    if (s.pol) { try { return stationStats(s); } catch { return []; } }
    // 政策の記録がまだ無い街：同じ計算を、空の政策で（月と建物が変わったときだけ）
    const k = `${s.month}:${s.bVersion}`; if (this.stSK !== k) { this.stSK = k; try { this.stSC = stationStats({ ...s, pol: {} } as GameState); } catch { this.stSC = []; } } return this.stSC; }
  private stSK = ''; private stSC: { b: Building; crowd: number; riders: number }[] = [];
  /** v87：駅前広場の立ち位置（x, y, z, 向き）。改札（駅舎の正面）に近い順で、線路と直角の向きに伸びる行列から広場いっぱいへ */
  private plaza = new Map<number, { pz: number[]; q: number[]; st: number[] }>(); private stLeft = new Map<number, number>(); private stArr = new Map<number, number>();
  /** 駅前の立ち位置（それぞれ x, y, z, 向き の並び）。pz：改札（駅舎の正面）に近い順の広場（v88 で 1.6 倍の広さ）、q：入場規制の折り返しの列、st：駅のまわりの歩道 */
  private plazaPts(s: GameState, sp: StationSpot, b: Building): { pz: number[]; q: number[]; st: number[] } {
    const c = this.plaza.get(sp.id); if (c) return c;
    const P = this.railPaths[sp.path], out = { pz: [] as number[], q: [] as number[], st: [] as number[] }; if (!P) { this.plaza.set(sp.id, out); return out; }
    const [tx0, , tz0, yaw] = railAt(P, sp.d), tx = Math.sin(yaw), tz = Math.cos(yaw), nx = -tz, nz = tx, lx = (b.x + b.w / 2) * TILE, lz = (b.y + b.h / 2) * TILE;
    const dot = (lx - tx0) * nx + (lz - tz0) * nz, side = dot >= 0 ? 1 : -1, along = Math.max(-30, Math.min(30, (lx - tx0) * tx + (lz - tz0) * tz)), across = Math.max(14, Math.min(35, dot * side));
    const sx = tx0 + tx * along + nx * side * across, sz = tz0 + tz * along + nz * side * across, rr = seeded(sp.id * 31 + 7), pts: [number, number, number][] = [];
    const at = (u: number, v: number) => [sx + tx * u + nx * side * v, sz + tz * u + nz * side * v], face = Math.atan2(-nx * side, -nz * side);
    for (let u = -26; u <= 26; u += 0.95) for (let v = 6.5; v <= 21; v += 0.95) { const ju = u + (rr() - 0.5) * 0.5, jv = v + (rr() - 0.5) * 0.5; pts.push([ju, jv, Math.abs(ju) * 1.7 + (jv - 6.5) * 0.9 + rr() * 1.5]); }
    pts.sort((p, q) => p[2] - q[2]);
    for (const [u, v] of pts) { const [x, z] = at(u, v); out.pz.push(x, this.surfY(x, z) + 0.15, z, face + (rr() - 0.5) * 0.8); } // 駅舎の方を向く
    // 入場規制の列：広場の外で 4 回折り返す（0.7m おきに、進む向きを向いて並ぶ）
    for (let row = 0; row < 5; row++) { const v = 22.5 + row * 1.3, dir = row % 2 ? -1 : 1; for (let k = 0; k <= 50; k++) { const u = dir * (-17.5 + k * 0.7); const [x, z] = at(u + (rr() - 0.5) * 0.15, v); out.q.push(x, this.surfY(x, z) + 0.15, z, Math.atan2(tx * dir, tz * dir) + (rr() - 0.5) * 0.4); } }
    // 駅のまわり（3 区画以内）の歩道：道路の両側に 0.9m おき。駅に近い順
    const sw: [number, number, number, number][] = [];
    for (let y = b.y - 3; y < b.y + b.h + 3; y++) for (let x = b.x - 3; x < b.x + b.w + 3; x++) { if (!inMap(x, y)) continue; const i = idx(x, y), t = s.road[i]; if (!t || t === 3) continue;
      const hw0 = t === 2 && this.wideSet?.has(i) ? HW[3] : HW[t], hw = hw0 + (t === 1 ? -0.4 : walkW(hw0) * 0.5), cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, ew = (x > 0 && s.road[i - 1]) || (x < W - 1 && s.road[i + 1]), ns = (y > 0 && s.road[i - W]) || (y < H - 1 && s.road[i + W]);
      for (let k = -15; k < 15; k += 0.9) for (const sg of [-1, 1]) { if (ew && ns && Math.abs(k) < hw + 1) continue; const j = (rr() - 0.5) * 0.5, dd = Math.hypot(cx - lx, cz - lz) + rr() * 8;
        if (ew || !ns) sw.push([cx + k, cz + sg * (hw + j), dd + Math.abs(k) * 0.2, cx > lx ? -Math.PI / 2 : Math.PI / 2]);
        if (ns) sw.push([cx + sg * (hw + j), cz + k, dd + Math.abs(k) * 0.2, cz > lz ? Math.PI : 0]); } }
    sw.sort((p, q) => p[2] - q[2]);
    for (const [x, z, , yw] of sw.slice(0, 700)) out.st.push(x, this.surfY(x, z) + 0.15, z, yw + (rr() - 0.5) * 0.6);
    this.plaza.set(sp.id, out); return out;
  }
  // ------------------------------------------------------------ 交通の流れ（混雑レイヤーで、道路の上を流れる矢印。混むほど遅く赤く）
  private flowArrows!: THREE.InstancedMesh;
  private flowNext: Int32Array | null = null; private flowVer = -1;
  private flowList: { i: number; n: number; off: number; v: number }[] = []; private flowKey = ''; private flowT = 0;
  routeSet = new Set<number>(); routeKey = '';
  /** 通勤の行き先（市外への出口と駅）へ向かう次の道路区画（幅優先で、行き先に近づく向き） */
  private flowField(s: GameState): Int32Array {
    if (this.flowNext && this.flowVer === s.roadVersion) return this.flowNext;
    const nx = new Int32Array(N).fill(-1), d = new Int32Array(N).fill(-1), q: number[] = [];
    const sinks = [...GATEWAYS];
    for (const b of s.buildings) if (b.kind === 'station' && b.status === 'operating') for (let dy = -1; dy <= b.h; dy++) for (let dx = -1; dx <= b.w; dx++) { const x = b.x + dx, y = b.y + dy; if (inMap(x, y) && s.road[idx(x, y)]) sinks.push(idx(x, y)); }
    for (const g of sinks) if (s.road[g] && d[g] < 0) { d[g] = 0; q.push(g); }
    for (let h = 0; h < q.length; h++) { const i = q[h], x = i % W, y = (i / W) | 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const j = idx(xx, yy); if (s.road[j] && d[j] < 0) { d[j] = d[i] + 1; nx[j] = i; q.push(j); } } }
    this.flowNext = nx; this.flowVer = s.roadVersion;
    return nx;
  }
  /** 選んだ住宅からの通勤の道筋（混雑レイヤーで水色に）。-1 で消す */
  setRoute(tile: number): void {
    const s = this.getState(); this.routeSet.clear();
    if (tile >= 0) { const nx = this.flowField(s); let i = tile, k = 0; while (i >= 0 && k++ < 2000) { this.routeSet.add(i); i = nx[i]; } }
    this.routeKey = tile >= 0 ? `${tile}:${this.routeSet.size}` : '';
  }
  private moveFlow(s: GameState, dt: number): void {
    if (!this.flowArrows) return;
    if (this.layer !== 'traffic') { this.flowArrows.count = 0; return; }
    this.flowT += dt;
    const nx = this.flowField(s), R = (REAL ? 60 : 30) * Math.min(2, Math.max(0.6, this.dist / 500));
    const cx = this.target.x / TILE, cz = this.target.z / TILE;
    const key = `${s.roadVersion}:${s.month}:${Math.round(cx / 4)}:${Math.round(cz / 4)}:${Math.round(R / 4)}`;
    if (key !== this.flowKey) {
      this.flowKey = key; this.flowList = [];
      const col = new THREE.Color();
      for (let i = 0; i < N && this.flowList.length < 900; i++) {
        if (!s.road[i] || nx[i] < 0) continue;
        if (Math.abs(i % W + 0.5 - cx) > R || Math.abs(((i / W) | 0) + 0.5 - cz) > R) continue;
        const v = s.vc[i] || 0; if (v < 0.04) continue;
        this.flowList.push({ i, n: Math.max(1, Math.min(4, Math.round(v * 3.2))), off: ((i * 0.618) % 1), v });
      }
      let n = 0;
      for (const f of this.flowList) for (let k = 0; k < f.n; k++, n++) this.flowArrows.setColorAt(n, col.setHex(f.v < 0.5 ? 0x3aa655 : f.v < 0.8 ? 0x9bc53d : f.v < 1 ? 0xf2d23a : f.v < 1.25 ? 0xf08a2a : 0xe0352a));
      if (this.flowArrows.instanceColor) this.flowArrows.instanceColor.needsUpdate = true;
    }
    // 朝は市外・駅へ向かい、夕方は帰ってくる
    const home = this.hour >= 12, up = new THREE.Vector3(0, 1, 0), m = this.map;
    let n = 0;
    for (const f of this.flowList) {
      const a = f.i, b = nx[a]; if (b < 0) { n += f.n; continue; }
      const ax = (a % W + 0.5) * TILE, az = (((a / W) | 0) + 0.5) * TILE, bx = (b % W + 0.5) * TILE, bz = (((b / W) | 0) + 0.5) * TILE;
      const sp = 0.9 / (1 + 2.2 * f.v * f.v * f.v);
      for (let k = 0; k < f.n; k++, n++) {
        let u = (this.flowT * sp + f.off + k / f.n) % 1; if (home) u = 1 - u;
        const x = ax + (bx - ax) * u, z = az + (bz - az) * u, yaw = Math.atan2(bx - ax, bz - az) + (home ? Math.PI : 0);
        this.tmpQ.setFromAxisAngle(up, yaw); this.tmpV.set(x, heightAt(m, x, z) + 0.9, z); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
        this.flowArrows.setMatrixAt(n, this.tmpM);
      }
    }
    this.flowArrows.count = n; this.flowArrows.instanceMatrix.needsUpdate = true;
  }
  private trainKey = '';
  // ------------------------------------------------------------ 街の動き（演出）：施設に集まる人、煙突の煙、飛行機、バス・トラック
  private lifeP!: People; private smoke!: THREE.InstancedMesh; private plane: THREE.Group | null = null;
  private life: { x: number; z: number; y: number; r: number; ph: number; sp: number; L: Look; wp: number }[] = [];
  private smokeSrc: { x: number; y: number; z: number; k: number }[] = [];
  private planeAt: { x: number; y: number; z: number; c: number; s: number } | null = null;
  // ヘリコプター（ヘリポート・周産期の病院の屋上）と船（川・海を行き来する）
  private heli: THREE.Group | null = null; private heliRotor: THREE.Mesh | null = null; private heliAt: { x: number; y: number; z: number } | null = null;
  private shipBig!: THREE.InstancedMesh; private shipSmall!: THREE.InstancedMesh; private shipTanker!: THREE.InstancedMesh;
  private ships: { big: boolean; tanker?: boolean; z: number; y: number; x0: number; x1: number; sp: number; ph: number }[] = [];
  private lifeKey = ''; private lifeT = 0;
  // お祝い（まつり・優勝パレード・人口の節目）：花火・屋台とちょうちん・人出
  private fireworks!: THREE.InstancedMesh; private festAt: { x: number; y: number; z: number } | null = null; private celebT = 0; private fwNight = 0; private festObjs: THREE.Mesh[] = [];
  /** お祝いを始める（画面上の帯と、しばらくの花火） */
  celebrate(kind: string, label: string): void {
    this.celebT = 75; this.fwNight = 1; this.lifeKey = ''; // 花火はお祝いのあと最初の夜だけ
    const el = document.createElement('div'); el.id = 'celeb'; el.textContent = (kind === 'parade' ? '祝 優勝！ ' : kind === 'festival' ? '' : '祝 ') + label;
    document.getElementById('celeb')?.remove(); document.body.appendChild(el); setTimeout(() => el.remove(), 4600);
  }
  /** バス・トラックの割合：バスターミナル・駅があるとバスが、物流・工場・港があるとトラックが増える */
  private wheelN(): number { return this.quality === 'high' ? 14 : this.quality === 'mid' ? 10 : 8; }
  private ZERO = new THREE.Matrix4().makeScale(0, 0, 0); private tmpC2 = new THREE.Color(); private tmpM2 = new THREE.Matrix4(); private tmpS1 = new THREE.Vector3(1, 1, 1);
  /** 車の形ごとの描画を作る。wn：タイヤの角数（品質で 8 / 10 / 14） */
  private buildVeh(wn: number): void {
    for (const m of this.vehM) for (const im of [m.body, m.cab]) if (im) { this.scene.remove(im); im.geometry.dispose(); }
    this.vehWn = wn; this.vehM = []; this.vehN = [];
    // 車体の色（インスタンスの色）は、頂点が真っ白（面の種類 0）のところだけに掛ける。前照灯・ホイール・白い部品に車体色が移らない
    const carMat = tint0(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.25 })), cabMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, metalness: 0.15, transparent: true, opacity: 0.78, depthWrite: false }); // v88：ガラスは空を映す色（上を向く面ほど明るい水色。前は暗い紺で、上から見ると窓と屋根が真っ黒だった）。少し透けて運転者と座席が見える
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material) => { const im = new THREE.InstancedMesh(geo, mat, 320); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = !this.lite; im.count = 0; im.setColorAt(0, new THREE.Color(1, 1, 1)); this.scene.add(im); return im; };
    const part = (m: CarMesh, only: (t: number) => boolean, col: (t: number) => number) => { const g = new Geo(); carMesh(g, m, 0, 0, 0, col, only); return g.build(); };
    const V = makeVeh(wn);
    for (const nm of VEH_MODELS) { const m = V[nm], glass = m.F.some(f => f[3] === 5); this.vehM.push({ body: mk(part(m, t => t !== 5, t => t === 0 ? 0xffffff : CAR_PART[t]), carMat), cab: glass ? mk(skyGlass(part(m, t => t === 5, () => 0xffffff)), cabMat) : null }); }
    // 路線バス・箱型トラック（7m）・観光バス：Blender の形（src/assets/vehicles.json）。白い所に車ごとの色が掛かる
    const PB = [0xffffff, 0x1a1a1a, 0x1c2228, 0xfff6d8, 0xd02020, 0xffb030, 0x9aa0a6], PT = [0xffffff, 0x1a1a1a, 0x1c2228, 0xfff6d8, 0xd02020, 0xf4f4f0, 0x2a2a2c], PC = [0xffffff, 0x1a1a1a, 0x1c2228, 0xfff6d8, 0xd02020, 0x2a2a2c, 0xd8a030];
    for (const [m, P] of [[VM.bus, PB], [VM.truck, PT], [VM2.coach, PC]] as const) this.vehM.push({ body: mk(part(m, () => true, t => P[t]), carMat), cab: null });
    // v88：働く車と二輪（ダンプ・ミキサー・タンクローリー・クレーン・宅配・レッカー・キッチンカー・福祉・教習・はしご車・救助工作車・バイク・白バイ・ロードバイク・ママチャリ・キックボード・郵便バイク・キャリアカー）
    const WK = makeWork(wn); for (const nm of WORK_MODELS) { const m = WK[nm], glass = m.F.some(f => f[3] === 5); this.vehM.push({ body: mk(part(m, t => t !== 5, t => t === 0 ? 0xffffff : CAR_PART[t]), carMat), cab: glass ? mk(skyGlass(part(m, t => t === 5, () => 0xffffff)), cabMat) : null }); }
    this.vehN = this.vehM.map(() => 0);
  }
  /** 毎コマの始めと終わり：形ごとの置いた数を 0 に戻し、終わりに数と色を描画に渡す */
  private vehBegin(): void { this.vehN.fill(0); }
  private vehEnd(): void { this.vehM.forEach((m, t) => { const n = this.vehN[t]; m.body.count = n; m.body.instanceMatrix.needsUpdate = true; if (m.body.instanceColor) m.body.instanceColor.needsUpdate = true; if (m.cab) { m.cab.count = n; m.cab.instanceMatrix.needsUpdate = true; } }); }
  // ------------------------------------------------------------ v87：緊急出動（パトカー・救急車・消防車）
  /** v88：バス停の区画（道路の版が変わったら作り直す） */
  private busSet(s: GameState): Set<number> { const k = `${s.roadVersion}:${(s.busStops ?? []).length}`; if (this.bsK !== k) { this.bsK = k; this.bsS = new Set(s.busStops ?? []); } return this.bsS; }
  private bsK = ''; private bsS = new Set<number>();
  /** v88：区画の並び a → b → c で曲がるか（ウインカーを出す） */
  private turnAt(a: number, b: number, c: number): boolean { const ax = b % W - a % W, az = ((b / W) | 0) - ((a / W) | 0), bx = c % W - b % W, bz = ((c / W) | 0) - ((b / W) | 0); return Math.abs(-az * bx + ax * bz) > 0.5; }
  /** v101：区画 (x, y) が交差点（地図の外は違う） */
  private roadDeg2(s: GameState, x: number, y: number): boolean { return inMap(x, y) && !!s.road[idx(x, y)] && this.roadDeg(s, idx(x, y)) >= 3; }
  /** 道路の区画 i につながる道路の数（3 以上が交差点） */
  private roadDeg(s: GameState, i: number): number { const x = i % W, y = (i / W) | 0; return (x > 0 && s.road[i - 1] ? 1 : 0) + (x < W - 1 && s.road[i + 1] ? 1 : 0) + (y > 0 && s.road[i - W] ? 1 : 0) + (y < H - 1 && s.road[i + W] ? 1 : 0); }
  /** 経路の i 番目から、いま・次・次の次の区画を決める */
  private emRoute(a: Agent, em: Em): void { const r = em.r, n = r.length - 1; em.i = Math.min(em.i, Math.max(0, n - 1)); a.cur = r[em.i]; a.next = r[Math.min(n, em.i + 1)]; a.nn = r[Math.min(n, em.i + 2)]; }
  /** 出動：kinds の車を、それぞれ最寄りの拠点から現場（対象の区画・建物）へ。拠点が無い種類は隣の市から（地図の端の入口。遅れて来る） */
  dispatch(s: GameState, kinds: EmKind[], target: number): number {
    if (REAL && !REAL.deformed) return 0; const site = emSite(s, target, W, H, Math.random); if (!site) return 0;
    const b = site.b, bx = b ? b.x : site.x, by = b ? b.y : site.y, bw = b ? b.w : 1, bh = b ? b.h : 1, dest = roadNear(s.road, W, H, bx, by, bw, bh); if (dest < 0) return 0;
    const sx = (bx + bw / 2) * TILE, sz = (by + bh / 2) * TILE; let n = 0;
    kinds.forEach((k, q) => {
      if (this.ems.length >= (this.lite ? 5 : 9)) return;
      const base = nearestBase(s, EM_BASE[k], bx, by); let from = base ? roadNear(s.road, W, H, base.x, base.y, base.w, base.h) : -1, wait = 0.5 + q * 1.4;
      if (from < 0) { const g = GATEWAYS.filter(t => s.road[t]); if (!g.length) return; from = g[(Math.random() * g.length) | 0]; wait += 20; } // 市に拠点が無い：隣の市から応援（遅い）
      let r = roadRoute(s.road, W, H, from, dest); if (!r) return;
      if (r.length < 2) { const x = dest % W, y = (dest / W) | 0, nb = [dest - 1, dest + 1, dest - W, dest + W].find((t, j) => t >= 0 && t < W * H && s.road[t] && (j > 1 || ((t / W) | 0) === y) && (j < 2 || (t % W) === x)); if (nb === undefined) return; r = [nb, dest]; }
      const hosp = k === 1 ? nearestBase(s, HOSPITALS, bx, by) : null, ht = hosp ? roadNear(s.road, W, H, hosp.x, hosp.y, hosp.w, hosp.h) : -1;
      const em: Em = { k, r, i: 0, lit: true, stay: k === 2 ? 32 : k === 1 ? 9 : 16 + Math.random() * 8, at: false, legs: [ht >= 0 ? ht : from], wait, sx, sz, sir: Math.random() * 2, h: ht >= 0 };
      const a: Agent = { cur: r[0], next: r[1], prev: -1, t: 0.05, speed: 12, lane: 0, yaw: 0, bob: 0, kind: 0, vm: k === 2 && q > 0 ? [12, WV("ladder"), WV("rescue")][q % 3] : EM_VM[k], vc: [0x1c1e22, 0xf6f6f2, 0xc0261c][k] }; // v88：2 台目からの消防車ははしご車・救助工作車
      (a as any).em = em; this.emRoute(a, em); { const d = this.lanePath(s, -1, a.cur, a.next, a.nn!, 0.05, 0); a.yaw = Math.atan2(d.dx, d.dz); }
      this.ems.push(a); if (this.cars.length >= 320) this.cars.splice(0, 1); this.cars.push(a); n++;
    });
    return n;
  }
  /** 毎コマ：ふだんの通報（人口で救急、治安でパトカー）・現場での待機と放水・次の行き先・サイレン・まわりの車が道を空ける */
  private emTick(s: GameState, dt: number): void {
    if (REAL && !REAL.deformed) return;
    this.emT -= dt;
    if (this.emT <= 0) { // 見ている所の近くの家・店で、救急の呼び出しや事件の通報
      const pop = s.stats.pop || 0, cr = s.stats.crime || 0, rate = Math.max(0.3, Math.min(2.5, pop / 25000 + cr * 1.5)); this.emT = (30 + Math.random() * 50) / rate;
      if (this.ems.length < 4 && pop > 500) { const cx = this.target.x / TILE, cz = this.target.z / TILE, near = s.buildings.filter(b => b.status === 'operating' && Math.abs(b.x - cx) < 14 && Math.abs(b.y - cz) < 14 && (b.hh || isShop(b.kind)));
        if (near.length) { const b = near[(Math.random() * near.length) | 0]; this.dispatch(s, Math.random() < 0.3 + cr * 0.6 ? [0] : [1], idx(b.x, b.y)); } }
    }
    const pos = this.emPos; pos.length = 0;
    for (let j = this.ems.length - 1; j >= 0; j--) {
      const a = this.ems[j], em: Em = (a as any).em;
      if (em.r.some(t => !s.road[t])) { this.ems.splice(j, 1); const ci = this.cars.indexOf(a); if (ci >= 0) this.cars.splice(ci, 1); continue; } // 道路が壊された・付け替えられた
      if (em.wait > 0) { em.wait -= dt; continue; }
      const px: number = (a as any).px ?? 0, pz: number = (a as any).pz ?? 0;
      if (em.lit) { pos.push(px, pz, Math.sin(a.yaw), Math.cos(a.yaw)); em.sir -= dt; if (em.sir <= 0) { em.sir = 3; this.sfx('siren' + em.k, px, 0, pz); } }
      if (!em.at && (a.v ?? 0) < 0.4 && ((em.i >= em.r.length - 2 && a.t >= 0.45) || (em.legs.length && em.lit && Math.hypot(px - em.sx, pz - em.sz) < 75))) { em.at = true; em.cb?.('at', a); } // 着いた（先に着いた車の後ろに並んでも）
      if (!em.at) continue;
      if (em.k === 2 && em.legs.length && em.stay > 2 && Math.random() < dt * (this.lite ? 12 : 30)) { const dx = em.sx - px, dz = em.sz - pz, L = Math.hypot(dx, dz) || 1; this.fx.burst(px, this.surfY(px, pz) + 3.6, pz, 'water', this.lite ? 2 : 3, 0, [dx / L * 0.75, 0.62, dz / L * 0.75]); } // 放水
      em.stay -= dt; if (em.stay > 0 || em.hold?.()) continue;
      const to = em.legs.shift();
      const r2 = to !== undefined ? roadRoute(s.road, W, H, a.next, to) : null;
      if (r2 && to !== undefined) em.cb?.('leg', a); else em.cb?.('done', a);
      if (!r2 || to === undefined) { this.ems.splice(j, 1); const ci = this.cars.indexOf(a); if (ci >= 0) this.cars.splice(ci, 1); continue; } // 拠点・病院に戻った
      em.r = r2.length > 1 ? [a.cur, ...r2] : [a.cur, a.next]; em.i = 0; em.at = false; em.lit = em.k === 1 && em.h; em.stay = em.lit ? 4 : 0; em.h = false; // 救急車は病院へ赤色灯のまま（着いたら終わり）。ほかは消灯して拠点へ帰る
      this.emRoute(a, em);
    }
    this.incTick(s, dt);
    // まわりの車：赤色灯の緊急車両が後ろ・前から 34m 以内に来たら左に寄って止まる
    for (const a of this.cars) { if ((a as any).em) continue; let y = false; const px: number | undefined = (a as any).px;
      if (pos.length && px !== undefined) { const pz: number = (a as any).pz; for (let q = 0; q < pos.length; q += 4) { const dx = px - pos[q], dz = pz - pos[q + 1]; if (dx * dx + dz * dz < 34 * 34 && dx * pos[q + 2] + dz * pos[q + 3] > -6) { y = true; break; } } }
      (a as any).yl = y; }
  }
  // ------------------------------------------------------------ v95：事故と緊急対応の連鎖（render/incidents.ts の決まりで、見ている所の近くに起こす）
  /** 描画の中で起きた事故・火災・違反を外へ知らせる口（住民のシミュレーションの統計とつなぐ。e.fatal は病院で亡くなった 1 名の追加で、件数には数えない） */
  onIncident: ((e: IncidentEvent) => void) | null = null;
  /** その場所・時間帯の事故の起きやすさ（1 が標準）を返す口。sim 側が渡す。無ければ時間帯の目安（hourRate）だけ */
  incidentRate: ((tile: number, hour: number, kind: IncKind) => number) | null = null;
  /** 検査用：false で自動では起こさない */
  incAuto = true;
  private incT = 40; private incId = 0;
  private incs: Inc[] = [];
  private incFeed: IncidentFeed | null = null;
  private incCone: THREE.InstancedMesh | null = null; private incBox: THREE.InstancedMesh | null = null;
  private incAgents(): Agent[] { const o: Agent[] = []; for (const q of this.incs) o.push(...q.cars); return o; }
  private incPlace(t: number): string { const d = (this.map as any).district?.[t]; return DISTRICTS[d] ?? '市内'; }
  private incEmit(q: Inc, fatal = false): void {
    const s = this.getState(); try { this.onIncident?.({ kind: q.kind, tile: q.tile, month: s.month, severity: q.sev, sub: q.sub, ...(fatal ? { fatal: true } : {}) }); } catch { /* 外の失敗で描画を止めない */ }
  }
  private incNote(key: string, text: string, tile: number): void {
    this.incFeed ??= new IncidentFeed(t => this.focus(t, 160)); this.incFeed.push(key, text, tile);
  }
  /** 緊急車両などを 1 台出す（v87 の dispatch と同じ車の動き）。返り値は出した車（出せなければ null） */
  private incGo(s: GameState, u: Unit | 'hearse', from: number, dest: number, sx: number, sz: number, o: { stay: number; legs?: number[]; lit?: boolean; wait?: number; cb?: Em['cb']; hold?: Em['hold'] }): Agent | null {
    if (this.ems.length >= (this.lite ? 7 : 12) || from < 0 || dest < 0) return null;
    let r = roadRoute(s.road, W, H, from, dest); if (!r) return null;
    if (r.length < 2) { const nb = [dest - 1, dest + 1, dest - W, dest + W].find(t => t >= 0 && t < W * H && s.road[t] && Math.abs((t % W) - (dest % W)) <= 1); if (nb === undefined) return null; r = [nb, dest]; }
    const k: EmKind = u === 'amb' ? 1 : u === 'pump' || u === 'ladder' ? 2 : 0, vm = u === 'police' ? 10 : u === 'bike' ? WV('whitebike') : u === 'amb' ? 11 : u === 'pump' ? 12 : u === 'ladder' ? WV('ladder') : u === 'tow' ? WV('tow') : 0;
    const vc = u === 'police' ? 0x1c1e22 : u === 'bike' ? 0xf6f6f2 : u === 'amb' ? 0xf6f6f2 : u === 'pump' || u === 'ladder' ? 0xc0261c : u === 'tow' ? 0xf4f4f2 : 0x16161a; // 霊柩車は黒い車
    const lit = o.lit ?? (u !== 'tow' && u !== 'hearse');
    const em: Em = { k, r, i: 0, lit, stay: o.stay, at: false, legs: o.legs ?? [from], wait: o.wait ?? 0.5, sx, sz, sir: Math.random() * 2, h: false, cb: o.cb, hold: o.hold };
    const a: Agent = { cur: r[0], next: r[1], prev: -1, t: 0.05, speed: u === 'hearse' ? 8 : 12, lane: 0, yaw: 0, bob: 0, kind: 0, vm, vc };
    (a as any).em = em; this.emRoute(a, em); { const d = this.lanePath(s, -1, a.cur, a.next, a.nn!, 0.05, 0); a.yaw = Math.atan2(d.dx, d.dz); }
    this.ems.push(a);
    if (this.cars.length >= 320) { const j = this.cars.findIndex(c => !(c as any).em && !(c as any).wr && !(c as any).pk && !(c as any).vr); if (j >= 0) this.cars.splice(j, 1); }
    this.cars.push(a); return a;
  }
  /** 拠点（kinds の最寄り）の道路の区画。無ければ市外の入口（late：遅れて来る） */
  private incBase(s: GameState, kinds: readonly string[], x: number, y: number): { t: number; late: boolean } {
    const b = nearestBase(s, kinds, x, y), t = b ? roadNear(s.road, W, H, b.x, b.y, b.w, b.h) : -1;
    if (b && t >= 0) return { t, late: Math.abs(b.x - x) + Math.abs(b.y - y) > 45 };
    const g = GATEWAYS.filter(q => s.road[q]); return { t: g.length ? g[(Math.random() * g.length) | 0] : -1, late: true };
  }
  /** ふつうの車（緊急車両・事故車・違反の車・高架の上・交差点の中でない）で、見ている所の近くにいるもの */
  private incPickCar(s: GameState, R = 230): Agent | null {
    const c: Agent[] = [];
    for (const a of this.cars) { const A = a as any; if (A.em || A.wr || A.pk || A.vr || (A.dk ?? -1) >= 0 || (a.vm ?? 0) >= 10 || a.cur === a.next || A.px === undefined) continue;
      if (Math.hypot(A.px - this.target.x, A.pz - this.target.z) > R || this.roadDeg(s, a.cur) >= 3 || this.roadDeg(s, a.next) >= 3 || a.t < 0.32 || a.t > 0.85 || this.flyOf.has(a.cur) || this.flyOf.has(a.next)) continue; c.push(a); }
    return c.length ? c[(Math.random() * c.length) | 0] : null;
  }
  /** v98：歩行者の事故のけが人を住民から選ぶ。近く（40m 以内）を歩く住民がいればその人（画面から消えて倒れた人になる）、いなければこの辺りを歩いて移動中の住民 */
  private incVictim(s: GameState, q: Inc): void {
    let best: Agent | null = null, bd = 40;
    for (const a of this.peds) { const A = a as any; if (!A.rt || A.px === undefined || A.dead) continue; const d = Math.hypot(A.px - q.x, A.pz - q.z); if (d < bd) { bd = d; best = a; } }
    let t: RTrip | null = best ? (best as any).rt : this.resTake(RM_WALK) ?? this.resPool[0] ?? null;
    if (best) { (best as any).dead = 1; this.resDirty = true; }
    if (!t) { const pl = this.resPlan; t = pl?.trips.find(x => x.mode === RM_WALK) ?? null; }
    if (t) { q.hurt = '🚑 けが人｜' + profileOf(s, t, tl => this.incPlace(tl)); q.hurtShort = shortWho(s, t.person, tl => this.incPlace(tl)); }
  }
  /** 検査用：施設の混み具合（v98：住民から） */
  occOf(id: number): unknown { const s = this.getState(), b = s.buildings.find(o => o.id === id); if (!b) return null; occDay.holiday = this.isHol(); occDay.day = this.dayNo; return occupancyOf(s, b, this.hour); }
  /** 検査用：いまのできごとのけが人の紹介 */
  incHurt(): string[] { return this.incs.map(q => q.hurt ?? ''); }
  /** できごとを 1 つ起こす（見ている所の近く）。起こせたら true。want で種類を決められる（検査用） */
  startIncident(want?: IncSub): boolean {
    const s = this.getState(); if (REAL && !REAL.deformed) return false;
    const hasRail = !!s.rail && this.trains.length > 0;
    const pk = want ? { sub: want, kind: (want === 'rear' || want === 'cross' ? 'crash' : want === 'ped' ? 'pedestrian' : want === 'carFire' || want === 'bldFire' ? 'fire' : want === 'rail' ? 'train' : 'violation') as IncKind } : pickInc(Math.random(), hasRail);
    const sub = pk.sub, sev = incSeverity(sub, Math.random()), units = incUnits(sub, sev), id = ++this.incId;
    const q: Inc = { id, sub, kind: pk.kind, sev, tile: -1, x: 0, z: 0, age: 0, cars: [], victim: null, cones: false, officers: [], fire: 0, fy: 0, fatal: sev >= 3 && (sub === 'ped' || sub === 'rail' || sub === 'cross') && Math.random() < FATAL_P, place: '', open: 0, tag: false, end: 0 };
    const tileOf = (x: number, z: number) => idx(Math.max(0, Math.min(W - 1, Math.floor(x / TILE))), Math.max(0, Math.min(H - 1, Math.floor(z / TILE))));
    const wreck = (a: Agent, wy: number) => { const A = a as any; A.wr = id; A.wy = wy; a.v = 0; q.cars.push(a); };
    if (sub === 'rear' || sub === 'cross' || sub === 'ped' || sub === 'carFire') {
      const a = this.incPickCar(s); if (!a) return false; const A = a as any;
      q.x = A.px; q.z = A.pz; q.tile = tileOf(q.x, q.z); wreck(a, sub === 'carFire' ? 0 : -0.1);
      if (sub === 'rear' || sub === 'cross') { // 2 台目：追突（同じ車線の真後ろ）・接触（4 車線の道の隣の車線）。見ていない所の車を連れてくる
        const b = this.cars.find(c => c !== a && !(c as any).em && !(c as any).wr && !(c as any).pk && !(c as any).vr && (c.vm ?? 0) < 10 && Math.hypot(((c as any).px ?? 0) - this.target.x, ((c as any).pz ?? 0) - this.target.z) > 420);
        const wide = this.laneOff(s, a.cur, 1) !== this.laneOff(s, a.cur, 0), side = sub === 'cross' && wide;
        if (b) { b.cur = a.cur; b.next = a.next; b.nn = a.nn; b.prev = a.prev; b.lane = side ? 1 - a.lane : a.lane; b.t = side ? a.t + 0.04 : a.t - (VT_HL[a.vm ?? 0] + VT_HL[b.vm ?? 0] + 0.15) / TILE; (b as any).dk = -1; if (b.t > 0.02) wreck(b, side ? (b.lane ? 0.22 : -0.22) : 0.14); }
        if (sub === 'cross' && !side) q.sub = 'rear';
      }
      if (sub === 'ped') { const fx = Math.sin(a.yaw), fz = Math.cos(a.yaw), hl = VT_HL[a.vm ?? 0]; q.victim = [q.x + fx * (hl + 1.6) + fz * 1.2, q.z + fz * (hl + 1.6) - fx * 1.2, a.yaw + Math.PI / 2];
        this.incVictim(s, q); } // v98：はねられた人は、近くを歩いていた住民（いなければ、この辺りを歩いて移動中の住民）
      else if ((a as any).rt) { const t = (a as any).rt as RTrip; q.hurt = '🚑 ' + this.whoIs(a, false); q.hurtShort = shortWho(s, t.person, tl => this.incPlace(tl)); } // v98：事故車の運転手（住民）
      if (sub === 'carFire') { q.fire = 70; q.fy = this.surfY(q.x, q.z) + 1.4; }
    } else if (sub === 'bldFire') {
      const cx = this.target.x / TILE, cz = this.target.z / TILE, near = s.buildings.filter(b => b.status === 'operating' && Math.abs(b.x - cx) < 12 && Math.abs(b.y - cz) < 12 && (b.hh || isShop(b.kind) || b.kind === 'house'));
      if (!near.length) return false; const b = near[(Math.random() * near.length) | 0], p = this.place(s, b);
      q.x = p.x; q.z = p.z; q.tile = idx(b.x, b.y); q.fire = 90; q.fy = p.y + Math.min(26, 6 + 3 * Math.sqrt(b.w * b.h));
    } else if (sub === 'speed' || sub === 'signal') {
      const a = this.incPickCar(s, 260); if (!a) return false; const A = a as any, r = [a.cur, a.next]; let pv = a.cur, c = a.next;
      for (let k = 0; k < 7; k++) { const n = this.nextTile(s, c, pv, false); if (n < 0 || n === c) break; r.push(n); pv = c; c = n; }
      if (r.length < 4) return false;
      A.vr = r; A.vi = 0; A.sig = sub === 'signal' ? 1 : 0; A.po = 0; q.cars.push(a); q.x = A.px; q.z = A.pz; q.tile = r[r.length - 1];
      // 追う車（白バイかパトカー）：同じ道筋を後ろから。止めたら後ろに付いて切符を切り、終わったら交番へ帰る
      const u: Unit = sub === 'speed' && Math.random() < 0.6 ? 'bike' : 'police', ax = a.cur % W, ay = (a.cur / W) | 0, base = this.incBase(s, nearestBase(s, KOBAN, ax, ay) ? KOBAN : POLICE_BASE, ax, ay);
      const ch = this.incGo(s, u, a.cur, r[r.length - 1], (r[r.length - 1] % W + 0.5) * TILE, (((r[r.length - 1] / W) | 0) + 0.5) * TILE, { stay: 22, legs: [base.t >= 0 ? base.t : a.cur],
        hold: () => !A.po && A.vr !== undefined,
        cb: ev => { if (ev === 'leg') { A.vr = undefined; A.po = 0; A.sig = 0; this.incNote('tk' + id, incFollowText('ticket', q.place), q.tile); q.end = 1; } } });
      if (!ch) { A.vr = undefined; q.cars.length = 0; return false; }
      const E = (ch as any).em as Em; E.r = r.slice(); E.i = 0; this.emRoute(ch, E); ch.prev = a.prev; ch.lane = a.lane; ch.t = 0; E.wait = Math.max(0.3, (a.t * TILE + 8) / 14); // 違反の車が少し先へ行ってから追い始める
    } else if (sub === 'parking') {
      const cx = this.target.x, cz = this.target.z, cand = this.roadTiles.filter(t => this.roadDeg(s, t) === 2 && Math.hypot((t % W + 0.5) * TILE - cx, (((t / W) | 0) + 0.5) * TILE - cz) < 200 && !this.flyOf.has(t) && !s.rail?.[t]);
      if (!cand.length) return false; const t = cand[(Math.random() * cand.length) | 0], nx = [t - 1, t + 1, t - W, t + W].find(n => n >= 0 && n < W * H && s.road[n]); if (nx === undefined) return false;
      const a: Agent = { cur: t, next: nx, prev: -1, t: 0.3, speed: 8, lane: 0, yaw: 0, bob: 0, kind: 0 }; this.dressVeh(a); if ((a.vm ?? 0) >= 10) { a.vm = 0; a.vc = 0xf4f4f2; }
      (a as any).pk = id; (a as any).sh = 1.6; a.nn = this.nextTile(s, nx, t, false);
      this.cars.push(a); q.cars.push(a); q.tile = t; q.x = (t % W + 0.5) * TILE; q.z = (((t / W) | 0) + 0.5) * TILE;
    } else if (sub === 'rail') {
      let best = -1, bd = 1e9;
      this.trains.forEach((tr, k) => { if (!this.trainLive(k)) return; const P = this.railPaths[tr.path]; if (!P) return; const [x, , z] = railAt(P, tr.d), d = Math.hypot(x - this.target.x, z - this.target.z); if (d < bd) { bd = d; best = k; } });
      if (best < 0 || bd > 900) return false; const tr = this.trains[best], [x, , z] = railAt(this.railPaths[tr.path], tr.d); tr.wait = Math.max(tr.wait, 75); q.x = x; q.z = z; q.tile = tileOf(x, z);
    }
    if (q.tile < 0) return false;
    q.place = this.incPlace(q.tile); this.incs.push(q); this.incEmit(q);
    // 出動：パトカーは最寄りの交番・警察署（重い事故の応援・白バイは交番から）、救急車・消防車は消防署、レッカーは警察署（無ければ市外）から
    const tx = q.tile % W, ty = (q.tile / W) | 0, dest = s.road[q.tile] ? q.tile : roadNear(s.road, W, H, tx, ty, 1, 1);
    let late = false;
    if (sub !== 'speed' && sub !== 'signal') units.forEach((u, n) => {
      const kinds = u === 'amb' || u === 'pump' || u === 'ladder' ? FIRE_BASE : u === 'bike' || (u === 'police' && n > 0) ? KOBAN : POLICE_BASE;
      let b0 = this.incBase(s, kinds, tx, ty); if (b0.late && kinds === KOBAN) b0 = this.incBase(s, POLICE_BASE, tx, ty);
      late ||= b0.late;
      const wait = 1 + n * 1.6 + (b0.late ? 16 : 0) + (u === 'tow' ? 25 : 0);
      if (u === 'amb') {
        const hb = nearestBase(s, HOSPITALS, tx, ty), ht = hb ? roadNear(s.road, W, H, hb.x, hb.y, hb.w, hb.h) : GATEWAYS.find(g => s.road[g]) ?? -1;
        this.incGo(s, 'amb', b0.t, dest, q.x, q.z, { stay: 14, legs: [ht >= 0 ? ht : b0.t], wait, cb: (ev, a) => { const E = (a as any).em as Em;
          if (ev === 'leg') { q.victim = null; E.lit = true; E.stay = 4; if (q.sev >= 2) this.incNote('h' + id, incFollowText('hosp', q.place) + (q.hurtShort ? `（${q.hurtShort}）` : ''), q.tile); }
          if (ev === 'done' && q.fatal) { q.fatal = false; this.incEmit(q, true); // 病院で亡くなった：しばらくして霊柩車が病院から葬儀場・斎場へ（無ければ市外へ）
            const fb = nearestBase(s, FUNERAL, a.cur % W, (a.cur / W) | 0), ft = fb ? roadNear(s.road, W, H, fb.x, fb.y, fb.w, fb.h) : GATEWAYS.find(g => s.road[g]) ?? -1, from = a.cur;
            if (ft >= 0) { this.incGo(s, 'hearse', from, ft, 0, 0, { stay: 6, legs: [], lit: false, wait: 8 }); this.incNote('f' + id, incFollowText('funeral', q.place), ft); } } } });
        return;
      }
      if (u === 'tow') { this.incGo(s, 'tow', b0.t, dest, q.x, q.z, { stay: 12, wait, hold: () => q.open > 0 && q.age < 150, cb: ev => { if (ev === 'leg') { this.incClear(q); this.incNote('tw' + id, incFollowText('tow', q.place), q.tile); } } }); return; }
      const isP = u === 'police' || u === 'bike', fire = u === 'pump' || u === 'ladder';
      if (isP) q.open++;
      this.incGo(s, u, b0.t, dest, q.x, q.z, { stay: fire ? 30 : sub === 'parking' ? 14 : 26 + Math.random() * 8, lit: sub === 'parking' ? false : undefined, wait,
        hold: fire ? () => q.fire > 0 : undefined,
        cb: (ev, a) => {
          if (ev === 'at') { if (isP) { q.cones = q.kind === 'crash' || q.kind === 'pedestrian' || q.sub === 'carFire'; q.officers.push((a as any).px ?? q.x, (a as any).pz ?? q.z); if (sub === 'parking') { q.tag = true; this.incNote('pk' + id, incFollowText('ticket', q.place), q.tile); } } if (fire) q.fire = Math.min(q.fire, 22); }
          if (ev === 'leg' && isP) { q.open--; q.officers.splice(0, 2); if (sub === 'parking') q.end = 1; } } });
    });
    this.incNote('n' + q.sub + q.place, incText(q.sub, q.place, units, late), q.tile);
    if (sub === 'rail') this.incNote('r' + id, incFollowText('rail', q.place), q.tile);
    return true;
  }
  /** 事故車を片づける（レッカーが運んだ） */
  private incClear(q: Inc): void {
    for (const a of q.cars) { const A = a as any; if (A.wr) { const j = this.cars.indexOf(a); if (j >= 0) this.cars.splice(j, 1); } A.wr = undefined; }
    q.cars.length = 0; q.cones = false; q.end = 1;
  }
  /** 毎コマ：次のできごとの時計、燃える煙と炎、終わったできごとの片づけ、三角コーン・倒れた人・警察官・標章を描く */
  private incTick(s: GameState, dt: number): void {
    this.incFeed?.tick(dt);
    const pop = s.stats.pop || 0;
    if (this.incAuto && pop > 300 && this.dist < 1100) { this.incT -= dt;
      if (this.incT <= 0) { const t = idx(Math.max(0, Math.min(W - 1, Math.floor(this.target.x / TILE))), Math.max(0, Math.min(H - 1, Math.floor(this.target.z / TILE))));
        const pk = pickInc(Math.random(), !!s.rail && this.trains.length > 0), rate = this.incidentRate ? this.incidentRate(t, this.hour, pk.kind) : hourRate(this.hour); // v98：sim の起きやすさ（場所・時間帯込み）があればそれだけで決める
        if (this.incs.length < 2 && this.ems.length < 6) this.startIncident(pk.sub);
        this.incT = incInterval(rate, pop, Math.random()); } }
    for (let k = this.incs.length - 1; k >= 0; k--) {
      const q = this.incs[k]; q.age += dt;
      if (q.fire > 0) { q.fire -= dt * (q.fire > 22 ? 0.4 : 1); if (Math.random() < dt * (this.lite ? 3 : 6)) this.fx.burst(q.x, q.fy, q.z, 'smoke', 1, 2); if (q.fire > 8 && Math.random() < dt * 10) this.fx.burst(q.x, q.fy - 0.6, q.z, 'spark', 2, 1.5); }
      if (q.sub === 'carFire' && q.fire <= 0) for (const a of q.cars) a.vc = 0x2a2624; // 焼けた車
      const done = q.age > 260 || (q.end && q.sub !== 'parking' && q.age > 6) || (q.sub === 'bldFire' && q.fire <= 0 && q.age > 60) || (q.sub === 'rail' && q.age > 90) || (q.sub === 'parking' && q.end && q.age > 40);
      if (done) {
        if (q.sub === 'parking') for (const a of q.cars) (a as any).pk = undefined;
        else if (q.sub === 'speed' || q.sub === 'signal') for (const a of q.cars) { (a as any).vr = undefined; (a as any).po = 0; }
        else this.incClear(q);
        this.incs.splice(k, 1);
      }
    }
    this.incDraw();
  }
  private incDraw(): void {
    if (!this.incCone) {
      const cm = new THREE.InstancedMesh(new THREE.ConeGeometry(0.2, 0.7, 8).translate(0, 0.35, 0), new THREE.MeshStandardMaterial({ color: 0xff6a1a, roughness: 0.6 }), 48); cm.frustumCulled = false; cm.count = 0; this.scene.add(cm); this.incCone = cm;
      const bm = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7 }), 160); bm.frustumCulled = false; bm.count = 0; bm.setColorAt(0, new THREE.Color(1, 1, 1)); this.scene.add(bm); this.incBox = bm;
    }
    let nc = 0, nb = 0; const M = this.tmpM, Q = this.tmpQ, V = this.tmpV, S = this.tmpS, up = this.axY, IB = this.incBox!, IC = this.incCone;
    const box = (x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, col: number) => { if (nb >= 160) return; Q.setFromAxisAngle(up, yaw); M.compose(V.set(x, y, z), Q, S.set(sx, sy, sz)); IB.setMatrixAt(nb, M); IB.setColorAt(nb, this.tmpC.setHex(col)); nb++; };
    for (const q of this.incs) {
      const a0 = q.cars[0] as any;
      if (q.kind === 'crash' && a0?.px !== undefined && !q.end) // 破片：割れたガラスと部品
        for (let k = 0; k < 6; k++) { const h = hash(q.id, k, 7), g = hash(q.id, k, 9); box(a0.px + (h - 0.5) * 5, this.surfY(a0.px, a0.pz) + 0.02, a0.pz + (g - 0.5) * 5, h * 6, 0.25 + g * 0.3, 0.05, 0.2 + h * 0.2, k % 3 ? 0x3a3c40 : 0xcfe0ea); }
      if (q.cones && a0?.px !== undefined) { const fx = Math.sin(a0.yaw ?? 0), fz = Math.cos(a0.yaw ?? 0); // 三角コーン：事故車の後ろへ斜めに並べ、後ろの車を隣の車線へ誘導
        for (let k = 0; k < 4 && nc < 48; k++) { const d = 5 + k * 3.2, l = 0.4 + k * 0.5, x = a0.px - fx * d + fz * l, z = a0.pz - fz * d - fx * l; Q.identity(); M.compose(V.set(x, this.surfY(x, z) + 0.02, z), Q, S.set(1, 1, 1)); IC.setMatrixAt(nc++, M); } }
      if (q.victim) { const [x, z, yw] = q.victim, y = this.surfY(x, z) + 0.02; box(x, y, z, yw, 0.5, 0.26, 1.55, 0x3a4660); box(x + Math.sin(yw) * 0.95, y, z + Math.cos(yw) * 0.95, yw, 0.24, 0.24, 0.26, 0xd9b38c); } // 倒れた人（控えめに）
      for (let k = 0; k + 1 < q.officers.length; k += 2) { const x = q.officers[k] + 2.2, z = q.officers[k + 1] + 1.2, y = this.surfY(x, z); box(x, y, z, 0, 0.5, 1.25, 0.34, 0x1f2a4a); box(x, y + 1.25, z, 0, 0.26, 0.3, 0.26, 0xd9b38c); box(x, y + 1.55, z, 0, 0.3, 0.1, 0.3, 0x1f2a4a); } // 現場の警察官（検証・誘導）
      if (q.tag && a0?.px !== undefined) box(a0.px + Math.sin(a0.yaw) * 0.6, (a0.py ?? this.surfY(a0.px, a0.pz)) + 1.15, a0.pz + Math.cos(a0.yaw) * 0.6, a0.yaw, 0.35, 0.04, 0.28, 0xffd400); // 駐車違反の標章
    }
    IC.count = nc; IC.instanceMatrix.needsUpdate = true; IB.count = nb; IB.instanceMatrix.needsUpdate = true; if (IB.instanceColor) IB.instanceColor.needsUpdate = true;
    S.set(1, 1, 1);
  }
  /** 検査用：いまのできごと */
  incInfo(): { sub: string; tile: number; age: number; cars: number; fire: number; open: number }[] { return this.incs.map(q => ({ sub: q.sub, tile: q.tile, age: Math.round(q.age), cars: q.cars.length, fire: Math.round(q.fire), open: q.open })); }
  /** 車（形 vm・色 vc）を今の行列 tmpM で置く */
  private placeVeh(a: { vm?: number; vc?: number }): void { const t = a.vm ?? 0, m = this.vehM[t], n = this.vehN[t]++; if (n >= 320) { this.vehN[t] = 320; return; } m.body.setMatrixAt(n, this.tmpM); m.body.setColorAt(n, this.tmpC2.setHex(a.vc ?? 0xf4f4f2)); m.cab?.setMatrixAt(n, this.tmpM); }
  /** 車の形・色・速さを決める（v86）：日本の街の分布。乗用車は白・黒・銀・灰が多く、まれにパトカー・救急車・消防車、タクシー、バイク、自転車。トラックは大型・2t・ごみ収集車 */
  private dressVeh(a: { kind?: number; vm?: number; vc?: number; speed: number; v?: number }): void {
    const k = a.kind ?? 0, R = Math.random, pk = <T,>(l: T[]) => l[(R() * l.length) | 0]; let vm = 0, vc = 0xf4f4f2;
    if (k === 2 && R() < 0.4) { const r = R(), T: [number, number, number[]][] = [[0.2, WV('dump'), [0x2a64b8, 0x3a8a4a, 0xd8382c, 0xe8c030, 0x6a6e74]], [0.36, WV('mixer'), [0x2a64b8, 0x3a8a4a, 0xf4f4f2]], [0.5, WV('tanker'), [0xf4f4f2, 0x2a5fb0, 0xe8c030]], [0.78, WV('parcel'), [0x2a8a50, 0x2a64b8, 0xe8c030, 0xd8382c]], [0.86, WV('crane'), [0xf4f4f2, 0x2a64b8]], [0.93, WV('tow'), [0xf4f4f2, 0x2a5fb0]], [1, WV('carrier'), [0xf4f4f2, 0x2a64b8, 0x24262a]]];
      const e = T.find(x => r < x[0]) ?? T[0]; a.vm = e[1]; a.vc = pk(e[2]); a.v = undefined; return; } // v88：働く車
    if (k === 1) { vm = 17; vc = VEH_C[1]; } else if (k === 4) { vm = 19; vc = pk([0xf2f2ee, 0x2a5fb0, 0xd8382c, 0x2aa060]); } else if (k === 3) { vm = 0; vc = VEH_C[3]; }
    else if (k === 2) { const r = R(); if (r < 0.4) { vm = 18; vc = pk([0x2a7fe0, 0x2aa060, 0xd8382c, 0xf2f2ee]); } else if (r < 0.8) { vm = 13; vc = pk([0xf4f4f2, 0xf4f4f2, 0xf4f4f2, 0xe8c030, 0x2a64b8, 0xd8382c, 0x2aa060]); } else { vm = 14; vc = pk([0xf4f4f2, 0xf4f4f2, 0x2a8a50, 0x2a64b8]); } }
    else { const r = R(), q = R();
      const pp = this.patrolP; if (r < pp) { vm = 10; vc = 0x1c1e22; } else if (r < pp + 0.004) { vm = 11; vc = 0xf6f6f2; } else if (r < pp + 0.006) { vm = 12; vc = 0xc0261c; }
      else if (r < 0.05) { vm = 15; vc = pk([0x2a2c33, 0x3a5a8a, 0xc0392b, 0x6a8a4a, 0xd9a03a, 0xf2f2f2, 0x7a5a8a]); a.speed = 6 + R() * 3; }
      else if (r < 0.1) { vm = 16; vc = pk([0x2a2c33, 0x3a5a8a, 0xc0392b, 0x6a8a4a, 0xd9a03a, 0xf2f2f2, 0x7a5a8a, 0x8a6a4a]); a.speed = 5.5 + R() * 1.5; }
      else if (r < 0.14) { vm = 9; vc = pk([0x24262a, 0x24262a, 0xf4f4f2, 0xe8c840, 0x2f8a5a]); }
      else if (r < 0.2) { const u = (r - 0.14) / 0.06, T: [number, number, number[], number][] = [[0.24, WV('moto'), [0x24262a, 0xc0392b, 0x2a5fb0, 0xd8d8d8], 1.0], [0.4, WV('roadbike'), [0xd8382c, 0x24262a, 0xf2f2f2, 0x2a8ac8], 0.75], [0.58, WV('mamachari'), [0xf2f2f2, 0x6a8a4a, 0x8a6a4a, 0x2a2c33], 0.45], [0.68, WV('kick'), [0x2aa060, 0x24262a, 0xe8c030], 0.55], [0.76, WV('postbike'), [0xc8261c], 0.6], [0.8, WV('kitchen'), [0xe8c030, 0x6ab0d8, 0xf2c8d4], 1], [0.88, WV('welfare'), [0xf4f4f2, 0xc4c8cc], 1], [0.95, WV('kyoshu'), [0xf4f4f2], 0.75], [1, WV('whitebike'), [0xf6f6f2], 1.1]];
        const e = T.find(x => u < x[0]) ?? T[0]; vm = e[1]; vc = pk(e[2]); a.speed *= e[3]; }
      else if (r < 0.2 + this.deliP()) { const b = R() < 0.55; vm = WV(b ? 'delibike' : 'delimoto'); vc = pk([0x1c1e22, 0x2a8a4a, 0xc8302a, 0x58b8d8, 0xe8a020]); a.speed *= b ? 0.65 : 0.95; } // v89：フードデリバリー（保温バッグの色）
      else { const kd = carKindOf(q); vm = VEH_MODELS.indexOf(kd); vc = carColor(R(), kd === 'kei' || kd === 'keitruck'); } }
    if (vm >= 10 && vm <= 12) a.speed *= 1.12;
    a.vm = vm; a.vc = vc; a.v = undefined;
  }
  /** v89：フードデリバリーの配達員の割合（全体の車のうち）。昼（11〜14 時）と夜（18〜22 時）に増える */
  private deliP(): number { const h = this.hour; return h >= 11 && h < 14 ? 0.03 : h >= 18 && h < 22 ? 0.035 : h >= 7 && h < 23 ? 0.006 : 0.002; }
  private vehKind(s: GameState): number {
    let bus = 0.03 + Math.min(0.05, (s.busStops?.length ?? 0) * 0.002), truck = 0.05; // バス停が多いと路線バスが増える
    for (const b of s.buildings) { if (b.status !== 'operating') continue; if (b.kind === 'busTerminal' || b.kind === 'lrt') bus += 0.03; else if (b.kind === 'station') bus += 0.01; else if (b.kind === 'logistics' || b.kind === 'factory' || b.kind === 'port' || b.kind === 'industrialPark' || b.kind === 'ic') truck += 0.025; }
    const r = Math.random(), robo = s.buildings.some(b => b.kind === 'robotaxi' && b.status === 'operating'), autoBus = s.buildings.some(b => b.kind === 'autoBusDepot' && b.status === 'operating');
    if (r < Math.min(0.1, bus)) return autoBus && Math.random() < 0.7 ? 4 : 1;
    if (r < Math.min(0.1, bus) + Math.min(0.18, truck)) return 2;
    return robo && Math.random() < 0.2 ? 3 : 0; // 自動運転タクシー
  }
  /** 施設ごとに、昼間に集まる人の数（時刻・曜日の区別はせず、時刻だけ） */
  private lifeCount(s: GameState, b: Building): number {
    const h = this.hour, day = h >= 8 && h < 18 ? 1 : h >= 6 && h < 21 ? 0.4 : 0.05, f = fam(b.kind);
    if (f === 'park') return Math.round((b.w * b.h) * 3 * day);
    if (f === 'school' || f === 'jhs' || b.kind === 'highschool' || b.kind === 'university') return h >= 9 && h < 16 ? 14 + b.w * b.h * 2 : 0;
    if (f === 'care' || b.kind === 'privNursery') return h >= 9 && h < 17 ? 6 : 0;
    const team = (s.teams ?? []).some(t => (t.sport === 'soccer' && b.kind === 'stadium') || (t.sport === 'baseball' && b.kind === 'ballpark') || (t.sport === 'basket' && (b.kind === 'arena' || b.kind === 'gym')));
    if (b.kind === 'stadium' || b.kind === 'ballpark' || b.kind === 'arena') return Math.round((team && h >= 16 && h < 22 ? 90 : 10) * (h >= 9 && h < 22 ? 1 : 0.1));
    const vis = DEFS[b.kind].visitors ?? 0;
    if (vis >= 1500) return Math.round(Math.min(60, 6 + vis / 600) * day);
    if (f === 'shop') return Math.round((b.kind === 'supermarket' ? 10 : 3) * day);
    return 0;
  }
  private rebuildLife(s: GameState): void {
    const tx = this.target.x, tz = this.target.z, R = REAL ? 900 : 700, m = this.map;
    this.life = []; this.smokeSrc = []; this.planeAt = null; this.heliAt = null;
    const hash = (a: number) => { const v = Math.sin(a * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const cm = calMonth(s.month), rain = this.rainNow(s), hr = this.hour;
    // 施設ごとに集まる人の種類：学校は子ども・生徒、公園は散歩や親子、店は買い物客、競技場は応援の人、介護は高齢の人
    const lifeType = (b: Building): PType => {
      const f = fam(b.kind), r0 = hash(b.id * 13 + this.life.length);
      if (f === 'school') return 'student'; if (f === 'jhs' || b.kind === 'highschool' || b.kind === 'university') return 'teen';
      if (f === 'care' || b.kind === 'privNursery') return r0 < 0.6 ? 'elderly' : 'parent';
      if (b.kind === 'stadium' || b.kind === 'ballpark' || b.kind === 'arena') return r0 < 0.8 ? 'fan' : 'shopper';
      if (f === 'park') return r0 < 0.22 ? 'dog' : r0 < 0.38 ? 'parent' : r0 < 0.55 ? 'elderly' : r0 < 0.68 ? 'jogger' : pickType(hr, Math.random);
      if (f === 'shop') return r0 < 0.75 ? 'shopper' : 'elderly';
      return pickType(hr, Math.random);
    };
    // お祝いの会場：まつりは市役所・駅前・大きな公園、パレードは本拠地の前の道路
    const fest = this.festOn(s) ? (s.celeb ?? { kind: 'milestone' as const, month: s.month, label: '' }) : null;
    for (const o of this.festObjs) { this.scene.remove(o); o.geometry.dispose(); } this.festObjs = []; this.festAt = null;
    if (fest) {
      const pickB = (ks: Kind[]) => ks.map(k => s.buildings.find(b => b.kind === k && b.status === 'operating')).find(Boolean);
      const venue = fest.kind === 'parade' ? pickB(['stadium', 'ballpark', 'arena', 'gym']) : pickB(['parkL', 'parkM', 'park', 'cityHall', 'station', 'branchOffice']);
      if (venue) {
        const p = this.place(s, venue); this.festAt = { x: p.x, y: p.y, z: p.z };
        // 会場に集まる人
        const types: PType[] = fest.kind === 'parade' ? ['fan', 'fan', 'fan', 'parent', 'teen'] : ['parent', 'student', 'elderly', 'shopper', 'teen', 'fan'];
        const ring = fam(venue.kind) === 'park' ? Math.min(venue.w, venue.h) * TILE * 0.32 : Math.max(venue.w, venue.h) * TILE * 0.5 + 10;
        for (let k = 0; k < 140 && this.life.length < 900; k++) {
          const a = hash(k * 17.3 + 3) * Math.PI * 2, rr = ring + hash(k * 17.3 + 5) * 22, x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr;
          const L = makeLook(types[k % types.length], seeded(k * 131 + 7), cm, rain);
          this.life.push({ x, z, y: heightAt(m, x, z) + 0.2, r: 1 + hash(k * 17.3 + 9) * 3, ph: hash(k * 17.3 + 11) * 6.28, sp: 0.2 + hash(k * 17.3 + 13) * 0.3, L, wp: hash(k * 17.3 + 17) * 6.28 });
        }
        // 屋台とちょうちん（まつり・節目）／パレードの横断幕
        const g = new Geo(), cols = [0xc3312b, 0x2b5ea8, 0xf2c230, 0x2e7d32];
        for (let k = 0; k < 10; k++) {
          const a = (k / 10) * Math.PI * 2, x = p.x + Math.cos(a) * (ring + 6), z = p.z + Math.sin(a) * (ring + 6), y = heightAt(m, x, z);
          g.at(x, y, z, -a + Math.PI / 2);
          if (fest.kind !== 'parade') { g.box(0, 0, 0, 5, 1.3, 3, 0x8a6a4a); g.box(0, 1.3, -1.2, 5, 1.8, 0.1, 0xf4efe6); g.box(0, 3.1, 0.2, 5.6, 0.25, 3.8, cols[k % 4]); g.gable(0, 3.35, 0.2, 5.6, 3.8, 0.8, cols[k % 4], 'x', 0xf4efe6, 0.2); for (const sx of [-2.4, 2.4]) g.box(sx, 0, 1.4, 0.15, 3.1, 0.15, 0x6a5a4a); }
          else { g.box(0, 0, 0, 0.2, 4.5, 0.2, 0xd0d0d0); g.box(0, 3.4, 0, 0.1, 1.2, 2.2, cols[k % 4]); }
        }
        // ちょうちんの列（会場のまわりに 2 重の輪）
        for (let k = 0; k < 64; k++) { const a = (k / 64) * Math.PI * 2, rr = ring + (k % 2 ? 1 : 11), x = p.x + Math.cos(a) * rr, z = p.z + Math.sin(a) * rr; g.at(x, heightAt(m, x, z) + 4.2, z); g.box(0, 0, 0, 0.7, 0.9, 0.7, k % 3 ? 0xff5a3a : 0xfff1d0); }
        g.at(0, 0, 0);
        const mesh = new THREE.Mesh(g.build(), this.matFest ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x331000, emissiveIntensity: 0.6 }));
        mesh.castShadow = true; mesh.frustumCulled = false; this.scene.add(mesh); this.festObjs.push(mesh);
      }
    }
    const occG = new Geo();
    for (const b of s.buildings) {
      if (b.status !== 'operating') continue;
      const cx = (b.x + b.w / 2) * TILE, cz = (b.y + b.h / 2) * TILE;
      if (Math.abs(cx - tx) > R || Math.abs(cz - tz) > R) continue;
      // v95：施設の利用者の人だかり（混み具合と時間帯で。render/occupancy.ts）。扱わない施設は従来の数
      const plan = crowdPlan(s, b, hr, this.place(s, b), this.quality === 'low' || this.lite ? 0.35 : this.quality === 'mid' ? 0.7 : 1);
      if (plan) { plan.spots.forEach((sp, k) => { if (this.life.length >= 900) return; const L = makeLook(sp.t, seeded(b.id * 977 + k), cm, rain); if (sp.kid) L.scale *= 0.7;
        this.life.push({ x: sp.x, z: sp.z, y: heightAt(m, sp.x, sp.z) + 0.2, r: sp.r, ph: hash(k * 7 + b.id) * 6.28, sp: sp.sp, L, wp: hash(k * 11 + b.id) * 6.28 }); }); if (plan.props) plan.props(occG, (x, z) => heightAt(m, x, z)); }
      const n = plan ? 0 : Math.round(this.lifeCount(s, b) * (fest && (fam(b.kind) === 'park' || fam(b.kind) === 'shop' || b.kind === 'station') ? 2 : 1)), hw = b.w * TILE * 0.36, hd = b.h * TILE * 0.36;
      for (let k = 0; k < n && this.life.length < 900; k++) {
        const x = cx + (hash(b.id * 31 + k) * 2 - 1) * hw, z = cz + (hash(b.id * 57 + k * 3) * 2 - 1) * hd;
        const rr = seeded(b.id * 977 + k), L = makeLook(lifeType(b), rr, cm, rain);
        this.life.push({ x, z, y: heightAt(m, x, z) + 0.2, r: 1 + hash(k + b.id) * 4, ph: hash(k * 7 + b.id) * 6.28, sp: (0.15 + hash(k * 3 + b.id * 5) * 0.35) * (L.speed / 1.2), L, wp: hash(k * 11 + b.id) * 6.28 });
      }
      // 煙突の煙・温泉の湯けむり
      const smokeK = b.kind === 'factory' ? 3 : b.kind === 'wasteL' ? 2 : b.kind === 'industrialPark' ? 1 : b.kind === 'onsen' || b.kind === 'hotSpring' ? 4 : 0;
      if (smokeK && this.smokeSrc.length < 12) { const p = this.place(s, b); const hh = smokeK === 4 ? 12 : (MODEL_H[b.kind] ?? 20) * 0.95; this.smokeSrc.push({ x: p.x, y: p.y + hh, z: p.z, k: smokeK }); }
      if ((b.kind === 'heliport' || (b.kind === 'perinatal' && !s.buildings.some(o => o.kind === 'heliport' && o.status === 'operating'))) && !this.heliAt) { const p = this.place(s, b); this.heliAt = { x: p.x, y: p.y + (b.kind === 'perinatal' ? 9 * 3.6 + 1.2 : 0.5), z: p.z - (b.kind === 'perinatal' ? 0 : 2) }; }
      if (b.kind === 'airport' && !this.planeAt) { const p = this.place(s, b); this.planeAt = { x: p.x, y: p.y, z: p.z, c: Math.cos(p.rot), s: Math.sin(p.rot) }; }
    }
    if (occG.pos.length) { const om = new THREE.Mesh(occG.build(), this.matFest ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, emissive: 0x331000, emissiveIntensity: 0.6 })); om.castShadow = true; om.frustumCulled = false; this.scene.add(om); this.festObjs.push(om); } // v95：仮設教室・窓の人影・救急車の列
    this.life.forEach((p, i) => this.lifeP.setLook(i, p.L)); this.lifeP.commitLooks();
    this.lifeP.mesh.count = this.life.length;
    if (this.plane) this.plane.visible = !!this.planeAt;
    if (this.heli) this.heli.visible = !!this.heliAt;
    // 船：川（海）の航路。港・漁港・造船所があると増える
    this.ships = [];
    const nPort = s.buildings.filter(b => b.status === 'operating' && (b.kind === 'port' || b.kind === 'fishPort' || b.kind === 'shipyard')).length;
    const lanes: { z: number; y: number; x0: number; x1: number }[] = [];
    if (!REAL) for (const z of [1.2, 2.3, 3.4]) lanes.push({ z: (H - 5) * TILE + 30 + z * TILE, y: -1.55, x0: -150, x1: MAPW + 150 });
    else for (let y = 0; y < H && lanes.length < 3; y += 3) { let best = 0, bx = 0, run = 0; for (let x = 0; x < W; x++) { if (m.water[idx(x, y)]) { run++; if (run > best) { best = run; bx = x; } } else run = 0; } if (best >= 10) lanes.push({ z: (y + 0.5) * TILE, y: heightAt(m, (bx - best / 2) * TILE, (y + 0.5) * TILE) + 0.2, x0: (bx - best + 1.5) * TILE, x1: (bx - 0.5) * TILE }); }
    if (lanes.length) { const n = Math.min(8, 3 + nPort * 2); for (let k = 0; k < n; k++) { const L = lanes[k % lanes.length]; this.ships.push({ big: k % 3 === 1 || (nPort > 0 && k === 0), z: L.z + (hash(k * 5.1) - 0.5) * 12, y: L.y, x0: L.x0, x1: L.x1, sp: (k % 2 ? -1 : 1) * (6 + hash(k * 2.3) * 6), ph: hash(k * 9.7) }); } }
    // 石油タンカー：製油所があると 2 隻、油田と港があると 1 隻。ゆっくり進む
    { const ref = s.buildings.some(b => b.kind === 'oilRefinery' && b.status === 'operating'), oil = s.buildings.some(b => b.kind === 'oilField' && b.status === 'operating');
      const nT = lanes.length ? (ref ? 2 : oil && nPort > 0 ? 1 : 0) : 0;
      for (let k = 0; k < nT; k++) { const L = lanes[(k + 1) % lanes.length]; this.ships.push({ big: false, tanker: true, z: L.z + (k ? 8 : -8), y: L.y, x0: L.x0, x1: L.x1, sp: k % 2 ? -3.2 : 3.6, ph: 0.3 + k * 0.45 }); } }
  }
  private festOn(s: GameState): boolean { return this.celebT > 0 || this.fwNight > 0 || (!!s.celeb && s.month === s.celeb.month); }
  private matFest: THREE.MeshStandardMaterial | null = null;
  private moveLife(s: GameState, dt: number): void {
    if (!this.lifeP) return;
    this.lifeT += dt;
    if (this.celebT > 0) this.celebT -= dt;
    const key = `${this.festOn(s) ? 'F' : ''}${s.bVersion}:${Math.round(this.target.x / 200)}:${Math.round(this.target.z / 200)}:${Math.floor(this.hour)}:${(s.teams ?? []).length}:${s.month}:${this.rainNow(s)}:${occupancyPhase(this.hour)}`+ `:${this.isHol() ? 'H' : ''}${this.dayNo}`; occDay.holiday = this.isHol(); occDay.day = this.dayNo; // v98：施設の人だかりは住民の居場所から（休日・日で変わる）
    if (key !== this.lifeKey) { this.lifeKey = key; this.rebuildLife(s); }
    const up = new THREE.Vector3(0, 1, 0), t = this.lifeT;
    // 施設の人：その場で少しずつ歩き回る
    this.life.forEach((p, i) => {
      const a = t * p.sp + p.ph, x = p.x + Math.cos(a) * p.r, z = p.z + Math.sin(a * 0.7) * p.r;
      // 進む向きと速さ（円を描く道のりの微分）から、向きと歩きの位相を決める
      const vx = -Math.sin(a) * p.r * p.sp, vz = Math.cos(a * 0.7) * 0.7 * p.r * p.sp, v = Math.hypot(vx, vz), L = p.L;
      p.wp += dt * v / strideOf(L) * Math.PI * 2;
      this.tmpQ.setFromAxisAngle(up, Math.atan2(vx, vz)); this.tmpV.set(x, p.y + (1 - Math.abs(Math.sin(p.wp))) * 0.035 * L.amp * L.scale, z);
      this.tmpS.set(L.scale * L.width, L.scale, L.scale); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.tmpS.set(1, 1, 1);
      this.lifeP.mesh.setMatrixAt(i, this.tmpM); this.lifeP.setPose(i, p.wp, L.amp * Math.min(1, v / 0.6));
    });
    if (this.life.length) this.lifeP.commitPose();
    // 煙：上りながら広がって消える
    let n = 0;
    for (const src of this.smokeSrc) for (let k = 0; k < 10 && n < 160; k++, n++) {
      const age = (t * (src.k === 4 ? 0.35 : 0.18) + k / 10) % 1, sc = (src.k === 4 ? 1.2 : 2.2) + age * (src.k === 4 ? 3 : 7);
      this.tmpS.set(sc, sc * 0.8, sc); this.tmpQ.identity(); this.tmpV.set(src.x + age * 9 + Math.sin(k) * 1.5, src.y + age * (src.k === 4 ? 10 : 30), src.z + age * 4); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS);
      this.smoke.setMatrixAt(n, this.tmpM);
    }
    this.tmpS.set(1, 1, 1);
    this.smoke.count = n; if (n) this.smoke.instanceMatrix.needsUpdate = true;
    // 花火：会場の上で、色とりどりの玉が開いて落ちる（夜はよく見える。お祝いの間だけ）
    { let n = 0; const fa = this.festAt;
      const night = this.hour >= 18 || this.hour < 4.5;
      if (this.fwNight === 1 && night) this.fwNight = 2; else if (this.fwNight === 2 && !night) this.fwNight = 0; // 最初の夜が明けたら終わり
      if (fa && this.fwNight === 2) { // 花火は日が暮れてから、その夜だけ
        const col = new THREE.Color(), PAL = [0xff4f6a, 0xffd23a, 0x5ad0ff, 0x9aff6a, 0xff8a2a, 0xd08aff];
        for (let bst = 0; bst < 6; bst++) {
          const per = 3.2 + bst * 0.37, ph = ((t + bst * 1.1) % per) / per; if (ph > 0.85) continue;
          const seed = Math.floor((t + bst * 1.1) / per) * 7 + bst, cx = fa.x + (hash(seed, 1, 77) - 0.5) * 160, cz = fa.z + (hash(seed, 2, 77) - 0.5) * 160, cy = fa.y + 120 + hash(seed, 3, 77) * 70; // 本物の花火は 200〜300m の高さで、直径 100m 以上に開く
          col.setHex(PAL[seed % PAL.length]);
          const rise = Math.min(1, ph / 0.25);
          if (this.fwLast[bst] !== seed) { if (ph < 0.25 && this.fwLast[bst] !== -seed - 1) { this.fwLast[bst] = -seed - 1; this.sfx('fwLaunch', cx, fa.y, cz); } else if (ph >= 0.25) { this.fwLast[bst] = seed; this.sfx('fwBurst', cx, cy, cz); } }
          if (ph < 0.25) { this.tmpV.set(cx, fa.y + 10 + (cy - fa.y - 10) * rise, cz); this.tmpS.setScalar(3.2); this.tmpQ.copy(this.camera.quaternion); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.fireworks.setMatrixAt(n, this.tmpM); this.fireworks.setColorAt(n, col); n++; continue; }
          const e = (ph - 0.25) / 0.6, rad = 8 + (1 - Math.pow(1 - e, 2.2)) * (60 + 30 * hash(seed, 4, 77)), fall = e * e * 34, sc = 8 * (1 - e * 0.8) * (e > 0.75 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 40 + bst)) : 1), dim = 1 - e * 0.85; // 開いてから、ゆっくり落ちて消える（終わりはちらちら）
          const c2 = col.clone().multiplyScalar(dim), c3 = col.clone().multiplyScalar(dim * 0.45);
          for (let k = 0; k < 46 && n < 598; k++) {
            const a = hash(k, seed, 78) * Math.PI * 2, b = Math.acos(2 * hash(k + 50, seed, 79) - 1), ux = Math.sin(b) * Math.cos(a), uy = Math.cos(b), uz = Math.sin(b) * Math.sin(a);
            this.tmpQ.copy(this.camera.quaternion);
            this.tmpV.set(cx + ux * rad, cy + uy * rad - fall, cz + uz * rad); this.tmpS.setScalar(sc); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.fireworks.setMatrixAt(n, this.tmpM); this.fireworks.setColorAt(n, c2); n++;
            this.tmpV.set(cx + ux * rad * 0.86, cy + uy * rad * 0.86 - fall * 0.8, cz + uz * rad * 0.86); this.tmpS.setScalar(sc * 0.7); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.fireworks.setMatrixAt(n, this.tmpM); this.fireworks.setColorAt(n, c3); n++;
          }
        }
        this.tmpS.set(1, 1, 1);
      }
      this.fireworks.count = n; if (n) { this.fireworks.instanceMatrix.needsUpdate = true; if (this.fireworks.instanceColor) this.fireworks.instanceColor.needsUpdate = true; } }
    // 船：航路を行き来する（端まで行くと向こうの端から）
    { let nb = 0, ns = 0, nt = 0; const q = new THREE.Quaternion();
      this.shipPos.length = 0;
      for (const sh of this.ships) {
        const L = sh.x1 - sh.x0, d = ((sh.ph * L + t * sh.sp) % L + L) % L, x = sh.x0 + d;
        this.shipPos.push(x, sh.z, sh.tanker ? 2 : sh.big ? 1 : 0);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sh.sp > 0 ? Math.PI / 2 : -Math.PI / 2); this.tmpV.set(x, sh.y + Math.sin(t * 1.3 + sh.ph * 9) * 0.12, sh.z); this.tmpM.compose(this.tmpV, q, this.tmpS);
        if (sh.tanker) this.shipTanker.setMatrixAt(nt++, this.tmpM); else if (sh.big) this.shipBig.setMatrixAt(nb++, this.tmpM); else this.shipSmall.setMatrixAt(ns++, this.tmpM);
      }
      this.shipBig.count = nb; this.shipSmall.count = ns; this.shipTanker.count = nt; this.shipBig.instanceMatrix.needsUpdate = true; this.shipSmall.instanceMatrix.needsUpdate = true; this.shipTanker.instanceMatrix.needsUpdate = true; }
    // ドクターヘリ：飛び立って市の上を回り、また降りてくる（60 秒で一回り）
    if (this.heli && this.heliAt && this.heliRotor) {
      const A = this.heliAt, ph = (t / 60) % 1; let x = A.x, z = A.z, y = A.y, yaw = 0, rot = 0.6;
      if (ph < 0.12) rot = ph < 0.04 ? 0.15 : 0.6;
      else if (ph < 0.25) { y = A.y + (ph - 0.12) / 0.13 * 70; }
      else if (ph < 0.85) { const a = (ph - 0.25) / 0.6 * Math.PI * 2, r = 260; x = A.x + Math.sin(a) * r; z = A.z - r + Math.cos(a) * r; y = A.y + 70; yaw = a + Math.PI / 2; this.heli.rotation.z = 0; }
      else { y = A.y + (1 - (ph - 0.85) / 0.15) * 70; }
      this.heli.position.set(x, y, z); this.heli.rotation.set(0, yaw, ph >= 0.25 && ph < 0.85 ? -0.12 : 0); this.heliRotor.rotation.y += rot;
    }
    // 飛行機：滑走路を走って飛び立ち、また着陸してくる（50 秒で一回り）
    if (this.plane && this.planeAt) {
      const P = this.planeAt, ph = (t / 50) % 1;
      let lx: number, y: number;
      if (ph < 0.35) { const q = ph / 0.35; lx = -75 + q * q * 120; y = 2; }
      else if (ph < 0.7) { const q = (ph - 0.35) / 0.35; lx = 45 + q * 600; y = 2 + q * q * 160; }
      else { const q = (ph - 0.7) / 0.3; lx = -700 + q * 625; y = 2 + (1 - q) * (1 - q) * 120; }
      const lz = -38;
      this.plane.position.set(P.x + lx * P.c + lz * P.s, P.y + y, P.z - lx * P.s + lz * P.c);
      this.plane.rotation.set(0, Math.atan2(P.c, -P.s), 0);
      this.plane.rotateX(ph >= 0.35 && ph < 0.7 ? -0.18 : ph >= 0.7 ? 0.08 : 0);
    }
  }
  private buildAgents(): void {
    const mk = (geo: THREE.BufferGeometry, n: number, mat: THREE.Material) => { const im = new THREE.InstancedMesh(geo, mat, n); im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = true; this.scene.add(im); return im; };
    // 車・バス・トラック・バイク・自転車（形は cargen.ts / vehgen.ts）。タイヤの角数は品質で変える（setQuality で作り直す）
    this.buildVeh(this.wheelN());
    // 人：脚と腕を振って歩く（people.ts）。道を歩く人・駅のホームの乗客・施設に集まる人
    this.pedP = new People(420, this.scene);
    this.crowdP = new People(CROWD_N, this.scene);
    // 踏切の遮断機の竿（黄と黒のしま。長さ 1 を区間の長さに伸ばす）
    { const gg = new Geo(); for (let k = 0; k < 8; k++) gg.box((k + 0.5) / 8, -0.11, 0, 1 / 8, 0.22, 0.22, k % 2 ? 0x1d1d1d : 0xf2c230); this.gateArms = mk(gg.build(), 64, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 })); this.gateArms.count = 0; this.gateArms.castShadow = false; }
    // 交通の流れの矢印（平たい三角）
    { const ag = new THREE.BufferGeometry(); ag.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-2.4, 0, -2.2, 2.4, 0, -2.2, 0, 0, 3.2, -2.4, 0, -2.2, 0, 0, 3.2, 2.4, 0, -2.2]), 3)); ag.computeVertexNormals();
      this.flowArrows = new THREE.InstancedMesh(ag, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, depthTest: false, transparent: true, opacity: 0.95 }), 3600); this.flowArrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.flowArrows.frustumCulled = false; this.flowArrows.renderOrder = 9; this.flowArrows.count = 0; this.scene.add(this.flowArrows); }
    // 施設に集まる人・煙・飛行機
    this.lifeP = new People(900, this.scene);
    { const sg = new THREE.IcosahedronGeometry(1, 0); this.smoke = mk(sg, 160, new THREE.MeshStandardMaterial({ color: 0xd9dcde, roughness: 1, transparent: true, opacity: 0.42, depthWrite: false })); this.smoke.castShadow = false; this.smoke.count = 0; }
    { const pg = new Geo(); pg.box(0, 0, 0, 3.6, 3.4, 30, 0xf4f4f2); pg.box(0, 1.0, -2, 30, 0.5, 5.5, 0xf4f4f2); pg.box(0, 1.6, -13, 9, 0.4, 2.6, 0xf4f4f2); pg.box(0, 1.6, -13.5, 0.4, 5.5, 2.6, 0x2f6fb5); for (const x of [-7, 7]) pg.box(x, 0.2, -1, 1.4, 1.4, 3.6, 0x9aa0a6);
      this.plane = new THREE.Group(); const pm = new THREE.Mesh(pg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 })); pm.castShadow = true; this.plane.add(pm); this.plane.visible = false; this.scene.add(this.plane); }
    { // ドクターヘリ（赤と白）。回転翼は別の部品で回す
      const vm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.2 });
      const hg = new Geo(); hg.box(0, 1.0, 0, 2.4, 2.4, 5.2, 0xf4f4f2); hg.box(0, 1.0, 2.3, 2.2, 1.6, 1.2, 0x2a3a4a); hg.box(0, 1.6, -5, 0.6, 0.7, 6, 0xc3312b); hg.box(0, 1.6, -7.8, 0.2, 2.2, 1.2, 0xc3312b); hg.box(0, 1.0, 0, 2.45, 0.5, 5.25, 0xc3312b);
      for (const sx of [-1.2, 1.2]) hg.box(sx, 0, 0, 0.15, 0.15, 5, 0x3a3a3a), hg.box(sx, 0, 1.5, 0.12, 1, 0.12, 0x3a3a3a), hg.box(sx, 0, -1.5, 0.12, 1, 0.12, 0x3a3a3a);
      hg.box(0, 3.4, 0, 0.3, 0.4, 0.3, 0x3a3a3a);
      this.heli = new THREE.Group(); const hm = new THREE.Mesh(hg.build(), vm); hm.castShadow = true; this.heli.add(hm);
      const rg = new Geo(); rg.box(0, 0, 0, 0.5, 0.08, 11, 0x2a2a2a); rg.box(0, 0, 0, 11, 0.08, 0.5, 0x2a2a2a);
      this.heliRotor = new THREE.Mesh(rg.build(), vm); this.heliRotor.position.y = 3.8; this.heli.add(this.heliRotor);
      this.heli.visible = false; this.scene.add(this.heli);
      // 船：貨物船（船体・甲板のコンテナ・船橋）と小さな漁船
      const bg = new Geo(); bg.box(0, -1.2, 0, 7, 3.2, 34, 0x2b4a6a, 0x8a3a2a); bg.box(0, 2.0, 0, 6.4, 0.3, 32, 0x8a3a2a);
      for (let k = 0; k < 6; k++) bg.box(0, 2.3, -10 + k * 3.6, 5.6, 2.4, 3.2, [0xc3312b, 0x2b5ea8, 0xf2c230, 0x2e7d32][k % 4]);
      bg.box(0, 2.3, 13, 6, 5, 4, 0xf4f4f2); bg.box(0, 7.3, 13, 6.6, 0.4, 3, 0x2a3a4a); bg.box(0, 7.7, 12, 0.8, 2, 0.8, 0x1a1a1a);
      this.shipBig = mk(bg.build(), 8, vm);
      const sg2 = new Geo(); sg2.box(0, -0.6, 0, 3, 1.6, 10, 0xf4f4f2, 0x6a8fa8); sg2.box(0, 1.0, 1.5, 2.2, 1.8, 2.6, 0xf4f4f2); sg2.box(0, 2.8, 1.5, 0.15, 3, 0.15, 0x6a6a6a); sg2.box(0, -0.6, 0, 3.05, 0.4, 10.05, 0x1f4fa8);
      this.shipSmall = mk(sg2.build(), 8, vm); this.shipBig.count = 0; this.shipSmall.count = 0;
      // 石油タンカー：長い船体、甲板のパイプとマニホールド、船尾の船橋
      const tg = new Geo(); tg.box(0, -1.6, 0, 11, 4.4, 64, 0x1f2a3a, 0x8a2a22); tg.box(0, 2.8, 0, 10.4, 0.3, 62, 0x7a3a30); tg.box(0, -1.6, 0, 11.05, 1.0, 64.05, 0x8a2a22);
      tg.box(0, 3.1, -4, 1.2, 0.8, 46, 0x9aa0a6); for (let k = 0; k < 5; k++) tg.box(0, 3.1, -22 + k * 9, 8, 0.5, 0.8, 0xd8d4c8);
      tg.box(0, 3.1, 4, 0.8, 3, 0.8, 0xf2c230); tg.box(0, 3.1, -26, 3, 1.5, 3, 0xd8d4c8);
      tg.box(0, 3.1, 27, 10, 7, 7, 0xf4f4f2); tg.box(0, 10.1, 27, 11, 0.5, 4, 0x2a3a4a); tg.box(0, 10.6, 29, 1.8, 3.4, 1.8, 0x1a1a1a); tg.box(0, 13.5, 29, 1.9, 0.6, 1.9, 0xc3312b);
      this.shipTanker = mk(tg.build(), 4, vm); this.shipTanker.count = 0;
      // 花火：光る丸い粒（加算合成の板。カメラの方を向く）。尾を引くように 1 つの星に 2 粒
      this.fireworks = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }), 600);
      this.fireworks.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.fireworks.frustumCulled = false; this.fireworks.castShadow = false; this.fireworks.count = 0;
      this.fireworks.setColorAt(0, new THREE.Color(1, 1, 1)); this.scene.add(this.fireworks);
    }
    const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(320 * 3), 3));
    this.headPts = new THREE.Points(hg, this.matHead); this.headPts.frustumCulled = false; this.scene.add(this.headPts);
    // 尾灯（赤）：夜はうっすら、ブレーキのときは明るく（色の明るさで出す）
    const tg2 = new THREE.BufferGeometry(); tg2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(320 * 3), 3)); tg2.setAttribute('color', new THREE.BufferAttribute(new Float32Array(320 * 3), 3));
    this.tailPts = new THREE.Points(tg2, this.matTail); this.tailPts.frustumCulled = false; this.scene.add(this.tailPts);
  }
  private pickTile(list: number[], weights?: number[]): number {
    if (!list.length) return -1;
    if (!weights) return list[(Math.random() * list.length) | 0];
    let tot = 0; for (const w of weights) tot += w;
    let r = Math.random() * tot;
    for (let k = 0; k < list.length; k++) { r -= weights[k]; if (r <= 0) return list[k]; }
    return list[list.length - 1];
  }
  // ---- v73：車線に沿った走り方（左側通行）----
  // 車・バスは「区画の中心→次の区画の中心」を進む。そのまま線で結ぶと、曲がり角で車線が切り替わる瞬間に横へ飛び、
  // 行き止まりで折り返すときは反対車線を逆向きに走って見えた。区画ごとに「入る向き・出る向き」から車線の線を作り、
  // 左折は小さく、右折は大きく、折り返しは半円で回る。バスも同じ道筋を使う（前は右側を走っていて、車と正面からぶつかっていた）。
  /** 検査用：入れておくと、車・バスの位置と向き（x, z, dx, dz, 種類）を毎コマ書き足す（scripts/v73-lane.mjs） */
  dbgVeh: number[] | null = null;
  /** 路線バスのいる区間（車が後ろで間を空けるため。moveBuses が毎コマ書く） */
  private busSegs: { cur: number; next: number; t: number }[] = [];
  private wideSet = new Set<number>();
  private laneOff(s: GameState, i: number, lane: number): number { const t = s.road[i]; return t === 3 || (t === 2 && this.wideSet.has(i)) ? (lane ? 1.9 : 5.6) : t === 2 ? 2.5 : 1.25; }
  private lp = { x: 0, z: 0, dx: 0, dz: 1 };
  /** prev→cur→next→nn と進む車の、cur→next の t（0〜1）での位置と向き。結果は this.lp */
  private lanePath(s: GameState, prev: number, cur: number, next: number, nn: number, t: number, lane: number): { x: number; z: number; dx: number; dz: number } {
    const o = this.lp, cxOf = (i: number) => (i % W + 0.5) * TILE, czOf = (i: number) => (((i / W) | 0) + 0.5) * TILE;
    if (cur === next) { o.x = cxOf(cur); o.z = czOf(cur); return o; }
    const dir = (a: number, b: number): [number, number] => [Math.sign(b % W - a % W), Math.sign(((b / W) | 0) - ((a / W) | 0))];
    const dm = dir(cur, next); let c: number, d0: [number, number], d1: [number, number], sl: number, back: number, fwd: number;
    if (t < 0.5) { c = cur; d1 = dm; d0 = prev >= 0 && prev !== cur ? dir(prev, cur) : dm; sl = t * TILE; back = prev >= 0 ? prev : -1; fwd = next; }
    else { c = next; d0 = dm; d1 = nn !== undefined && nn >= 0 && nn !== next ? dir(next, nn) : dm; sl = (t - 1) * TILE; back = cur; fwd = nn >= 0 ? nn : -1; }
    const cx = cxOf(c), cz = czOf(c), off = this.laneOff(s, c, lane);
    // 区画の境い目では、となりの区画の車線の位置へなめらかに寄せる（道幅が変わる所で横に飛ばない）
    const nb = sl < 0 ? back : fwd, offN = nb >= 0 && s.road[nb] ? this.laneOff(s, nb, lane) : off, w = Math.max(0, Math.min(1, (Math.abs(sl) - (TILE / 2 - 6)) / 6)) * 0.5, offE = off + (offN - off) * w;
    const l0x = d0[1], l0z = -d0[0], l1x = d1[1], l1z = -d1[0]; // 進む向きの左
    const P0 = (q: number, f: number) => { o.x = cx + d0[0] * q + l0x * f; o.z = cz + d0[1] * q + l0z * f; o.dx = d0[0]; o.dz = d0[1]; };
    const P1 = (q: number, f: number) => { o.x = cx + d1[0] * q + l1x * f; o.z = cz + d1[1] * q + l1z * f; o.dx = d1[0]; o.dz = d1[1]; };
    const dot = d0[0] * d1[0] + d0[1] * d1[1];
    if (dot > 0.5) { P1(sl, offE); return o; }
    if (dot < -0.5) { // 行き止まりの折り返し：手前で右回りに半円を描いて、反対向きの車線へ
      const r = off + 1;
      if (sl <= -r) P0(sl, offE); else if (sl >= r) P1(sl, offE);
      else { const th = Math.PI * (sl + r) / (2 * r), cs = Math.cos(th), sn = Math.sin(th), ax = cx - d0[0] * r, az = cz - d0[1] * r;
        o.x = ax + l0x * off * cs + d0[0] * off * sn; o.z = az + l0z * off * cs + d0[1] * off * sn; o.dx = -l0x * sn + d0[0] * cs; o.dz = -l0z * sn + d0[1] * cs; }
      return o;
    }
    // 右左折：車線どうしの交わる点 K を角にして、手前 A から先 B へ丸く曲がる（左折は小回り、右折は大回り）
    const left = d1[0] * l0x + d1[1] * l0z > 0, Wd = left ? off + 3 : 7;
    if (sl <= -Wd) { P0(sl, offE); return o; } if (sl >= Wd) { P1(sl, offE); return o; }
    const kx = cx + l0x * off + l1x * off, kz = cz + l0z * off + l1z * off;
    const ax = cx + d0[0] * -Wd + l0x * off, az = cz + d0[1] * -Wd + l0z * off, bx = cx + d1[0] * Wd + l1x * off, bz = cz + d1[1] * Wd + l1z * off;
    const u = (sl + Wd) / (2 * Wd), v = 1 - u;
    o.x = v * v * ax + 2 * v * u * kx + u * u * bx; o.z = v * v * az + 2 * v * u * kz + u * u * bz;
    const tx = v * (kx - ax) + u * (bx - kx), tz = v * (kz - az) + u * (bz - kz), tl = Math.hypot(tx, tz) || 1; o.dx = tx / tl; o.dz = tz / tl;
    return o;
  }
  private nextTile(s: GameState, cur: number, prev: number, ped: boolean): number {
    const x = cur % W, y = (cur / W) | 0, opts: number[] = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue;
      const j = idx(nx, ny); if (!s.road[j] || j === prev) continue;
      if (ped && s.road[j] === 3 && s.road[cur] !== 3) continue;
      opts.push(j);
      if (!ped && s.road[j] >= 2) opts.push(j); // 車は幹線を選びやすい
      if (!ped && prev >= 0 && j - cur === cur - prev) opts.push(j, j); // 直進しやすい
    }
    return opts.length ? opts[(Math.random() * opts.length) | 0] : prev;
  }
  private paths: ReturnType<typeof realPaths> = [];
  private rCars: PathAgent[] = []; private rPeds: PathAgent[] = []; private spawnAt = { x: -1e9, z: -1e9 };
  /** 実在都市版：注視点の近く（半径 900m）の道路に車と人を置く */
  private spawnReal(): void {
    if (!this.paths.length) this.paths = realPaths();
    const k = (this.quality === 'high' ? 1 : this.quality === 'mid' ? 0.65 : 0.35) * (this.lite ? 0.55 : 1), tx = this.target.x, tz = this.target.z;
    this.spawnAt = { x: tx, z: tz };
    const near: number[] = [], wt: number[] = [];
    this.paths.forEach((p, i) => { const n = p.pts.length / 2, mx = p.pts[(n >> 1) * 2], mz = p.pts[(n >> 1) * 2 + 1]; if (Math.hypot(mx - tx, mz - tz) < 900) { near.push(i); wt.push(p.len * (p.cls >= 3 ? 3 : p.cls === 2 ? 2 : 1)); } });
    const mk = (n: number, ped: boolean): PathAgent[] => { const out: PathAgent[] = []; for (let i = 0; i < n && near.length; i++) { const p = this.pickTile(near, wt); out.push({ p, d: Math.random() * this.paths[p].len, dir: Math.random() < 0.5 ? 1 : -1, speed: ped ? 1.0 + Math.random() * 0.6 : 8 + Math.random() * 5, lane: Math.random() < 0.5 ? 0 : 1, yaw: 0, bob: Math.random() * 6, kind: ped ? 0 : this.vehKind(this.getState()) }); } return out; };
    this.rCars = mk(Math.round(150 * k), false); this.rPeds = this.dressPeds(mk(Math.round(170 * k), true), 420);
    this.rCars.forEach(a => this.dressVeh(a)); this.lookPeds(this.rPeds);
    this.stats.cars = this.rCars.length; this.stats.peds = this.rPeds.length;
  }
  private moveReal(dt: number): void {
    if (Math.hypot(this.target.x - this.spawnAt.x, this.target.z - this.spawnAt.z) > 450) this.spawnReal();
    const m = this.map, up = new THREE.Vector3(0, 1, 0), head = this.headPts.geometry.attributes.position as THREE.BufferAttribute;
    const W_ = [3.5, 5.5, 7.5, 9.5, 11.5, 13];
    // v86：同じ道で同じ向きの前の車との間（長さを見て空ける）。行き止まりの手前は減速して、止まってから向きを変える
    this.vehBegin(); const by = new Map<number, PathAgent[]>(); for (const a of this.rCars) { const l = by.get(a.p); if (l) l.push(a); else by.set(a.p, [a]); }
    const step = (a: PathAgent, ped: boolean, i: number) => {
      const P = this.paths[a.p];
      if (ped && a.lead !== undefined) { const ld = this.rPeds[a.lead]; a.p = ld.p; a.d = ld.d; a.dir = ld.dir; a.lane = ld.lane; a.speed = ld.speed; a.d -= a.dir * a.speed * dt * (ped ? 1 : 0); }
      if (ped) a.d += a.dir * a.speed * dt;
      else {
        const dEnd = a.dir > 0 ? P.len - a.d : a.d, me = VT_HL[a.vm ?? 0]; let vt = a.speed * (P.cls >= 3 ? 1.3 : 0.85) * Math.min(1, 0.25 + dEnd / 14);
        for (const o of by.get(a.p) ?? []) if (o !== a && o.dir === a.dir) { const g = (o.d - a.d) * a.dir - me - VT_HL[o.vm ?? 0] - 2; if (g > -3 && g < 60) vt = Math.min(vt, Math.sqrt(8 * Math.max(0, g))); }
        a.v ??= vt; a.v += Math.max(-7 * dt, Math.min(2.2 * dt, vt - a.v)); a.d += a.dir * a.v * dt;
      }
      if (a.d < 0 || a.d > P.len) { a.dir = -a.dir; a.d = Math.max(0, Math.min(P.len, a.d)); a.v = 0; }
      // 折れ線上の位置
      let r = a.d, px = P.pts[0], pz = P.pts[1], dx = 1, dz = 0;
      for (let j = 1; j < P.pts.length / 2; j++) {
        const ax = P.pts[j * 2 - 2], az = P.pts[j * 2 - 1], bx = P.pts[j * 2], bz = P.pts[j * 2 + 1], L = Math.hypot(bx - ax, bz - az);
        if (L < 1e-3) continue;
        dx = (bx - ax) / L; dz = (bz - az) / L;
        if (r <= L) { px = ax + dx * r; pz = az + dz * r; break; }
        r -= L; px = bx; pz = bz;
      }
      if (a.dir < 0) { dx = -dx; dz = -dz; }
      const hw = W_[P.cls] / 2, off = ped ? (hw + 0.8 + (a.side === 1 ? 0.62 : a.side === 2 ? -0.55 : 0)) * (a.lane ? 1 : -1) : P.cls >= 3 ? (a.lane ? 1.8 : 4.6) : 1.4;
      px += dz * off; pz -= dx * off;
      const yaw = Math.atan2(dx, dz);
      let d = yaw - a.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      a.yaw += d * Math.min(1, dt * (ped ? 6 : 4));
      const py = heightAt(m, px, pz) + (ped ? 0.25 : 0.3) - (this.tunnelSet.size && this.tunnelSet.has(idx(Math.floor(px / TILE), Math.floor(pz / TILE))) ? 80 : 0);
      if (ped) { this.poseWalker(a, i, px, py, pz, a.yaw, a.speed, dt); return; }
      if (i === this.followCar) this.followPos.set(px, py, pz);
      this.tmpS.setScalar(VT_K[a.vm ?? 0]); void VEH_S;
      this.tmpQ.setFromAxisAngle(up, a.yaw); this.tmpV.set(px, py, pz); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.tmpS.set(1, 1, 1);
      this.placeVeh(a); { const hl = VT_HL[a.vm ?? 0]; head.setXYZ(i, px + Math.sin(a.yaw) * hl, py + 0.7, pz + Math.cos(a.yaw) * hl); }
    };
    this.rCars.forEach((a, i) => step(a, false, i)); this.rPeds.forEach((a, i) => step(a, true, i));
    this.moveLife(this.getState(), dt); this.moveFlow(this.getState(), dt);
    this.vehEnd(); this.pedP.commitPose();
    head.needsUpdate = true; this.headPts.geometry.setDrawRange(0, this.rCars.length);
  }
  /** 雨の日（6 月の梅雨と、大雨・台風・洪水のとき）は傘をさす */
  private rainNow(s: GameState): boolean { return calMonth(s.month) === 5 || s.events.active.some(e => RAIN_EVENTS.has(e.id)); }
  /** 歩く人の見た目を決め、ときどき 2〜3 人づれにする（連れは先頭の人の横を同じ速さで歩く） */
  private dressPeds<T extends Walk & { speed: number }>(list: T[], max: number): T[] {
    const s = this.getState(), cm = calMonth(s.month), rain = this.rainNow(s), out: T[] = [];
    for (const a of list) {
      if (out.length >= max) break;
      const t = pickType(this.hour, Math.random); a.L = makeLook(t, Math.random, cm, rain); a.ph = Math.random() * 6.28; a.mv = 1; a.speed = a.L.speed; a.lead = undefined; a.side = 0;
      const li = out.length; out.push(a);
      const pg = t === 'student' ? 0.5 : t === 'teen' ? 0.45 : t === 'shopper' ? 0.3 : t === 'elderly' ? 0.28 : t === 'worker' ? 0.12 : 0;
      if (Math.random() < pg) {
        const nf = Math.random() < 0.35 ? 2 : 1;
        for (let k = 1; k <= nf && out.length < max; k++) {
          const f = { ...a }; let ft = Math.random() < 0.75 ? t : pickType(this.hour, Math.random); if (ft === 'dog' || ft === 'parent' || ft === 'jogger') ft = t;
          f.L = makeLook(ft, Math.random, cm, rain); f.ph = Math.random() * 6.28; f.lead = li; f.side = k; out.push(f);
        }
      }
    }
    return out;
  }
  /** 見た目を描画に送る */
  private lookPeds(list: Walk[]): void { list.forEach((a, i) => this.pedP.setLook(i, a.L!)); this.pedP.mesh.count = list.length; this.pedP.commitLooks(); }
  /** 歩きの位相・振り・行列を書く（足元の位置 px,py,pz と向き yaw） */
  private poseWalker(a: Walk, i: number, px: number, py: number, pz: number, yaw: number, v: number, dt: number): void {
    const L = a.L!, want = a.wait ? 0 : 1;
    a.mv = (a.mv ?? 1) + (want - (a.mv ?? 1)) * Math.min(1, dt * 5);
    a.ph = (a.ph ?? 0) + dt * v * a.mv / strideOf(L) * Math.PI * 2;
    // 両足がそろう瞬間に体が一番高くなる（上下の揺れは 1 歩ごと）
    const y = py + (1 - Math.abs(Math.sin(a.ph))) * 0.035 * L.amp * L.scale * a.mv;
    this.tmpQ.setFromAxisAngle(this.upV, yaw); this.tmpV.set(px, y, pz); this.tmpS.set(L.scale * L.width, L.scale, L.scale);
    this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.tmpS.set(1, 1, 1);
    this.pedP.mesh.setMatrixAt(i, this.tmpM); this.pedP.setPose(i, a.ph, L.amp * a.mv);
  }
  private upV = new THREE.Vector3(0, 1, 0);
  /** 信号のある交差点（3 方向以上に道路があり、幹線が交わる）：道路が変わるたびに作り直す */
  private sigGrid: Uint8Array | null = null; private sigVer = -1;
  private signals(s: GameState): Uint8Array {
    if (this.sigGrid && this.sigVer === s.roadVersion) return this.sigGrid;
    // v101：幹線どうしの交差点だけ、隣の信号と 150m 以上（render/roadbase.ts の sigPlan）。前は生活道路が幹線に当たる所も含め、30m おきに信号が並んでいた
    const g = sigPlan(s.road, W, H, new Set(s.wide ?? []));
    this.sigGrid = g; this.sigVer = s.roadVersion; return g;
  }
  /** 建物の入口：1 店・駅など、2 住宅、3 学校。道沿いの歩道から入れる */
  private doorGrid: Uint8Array | null = null; private doorTiles: number[] = [];
  private buildDoors(s: GameState, near: (i: number) => boolean): void {
    const g = new Uint8Array(N);
    for (const b of s.buildings) {
      if (b.status !== 'operating') continue;
      const f = fam(b.kind), v = b.kind === 'station' || f === 'shop' || (DEFS[b.kind].visitors ?? 0) >= 1500 || f === 'health' || f === 'library' || f === 'culture' ? 1 : isRes(b.kind) ? 2 : f === 'school' || f === 'jhs' || b.kind === 'highschool' ? 3 : 0;
      if (!v) continue;
      for (let dy = 0; dy < b.h; dy++) for (let dx = 0; dx < b.w; dx++) if (inMap(b.x + dx, b.y + dy)) g[idx(b.x + dx, b.y + dy)] = v;
    }
    this.doorGrid = g; this.doorTiles = [];
    for (const i of this.pedTiles) { if (!near(i)) continue; const x = i % W, y = (i / W) | 0; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inMap(x + dx, y + dy) && g[idx(x + dx, y + dy)])) this.doorTiles.push(i); }
  }
  /** cur→next と進むとき、左右（lane）どちら側の区画か */
  private sideTile(cur: number, next: number, lane: number): number {
    const x = cur % W, y = (cur / W) | 0, tx = Math.sign(next % W - x), ty = Math.sign(((next / W) | 0) - y), sg = lane ? 1 : -1;
    const sx = x + ty * sg, sy = y - tx * sg; return inMap(sx, sy) ? idx(sx, sy) : -1;
  }
  /** 着いた区画の横に入口があれば、時刻と人の種類に応じて中に入る */
  private wantsEnter(a: Agent): boolean {
    const g = this.doorGrid; if (!g || a.cur === a.next) return false;
    const st = this.sideTile(a.cur, a.next, a.lane); if (st < 0) return false;
    const d = g[st], h = this.hour, t = a.L?.t; if (!d) return false;
    if (d === 1) return Math.random() < (t === 'shopper' || t === 'elderly' || t === 'parent' ? 0.35 : t === 'worker' && h >= 7 && h < 9 ? 0.3 : 0.12);
    if (d === 2) return Math.random() < (h >= 17 ? 0.22 : t === 'elderly' || t === 'parent' || t === 'dog' ? 0.1 : 0.04);
    return (t === 'student' || t === 'teen') && h >= 7 && h < 9 ? Math.random() < 0.6 : false;
  }
  /** 時刻による人・車の多さ（朝夕のラッシュが多く、夜は少ない） */
  private rush(): number { const h = this.hour; return Math.exp(-(((h - 8) / 1.2) ** 2)) + 0.85 * Math.exp(-(((h - 18) / 1.6) ** 2)); }
  private flow(): { car: number; ped: number; jam: number } {
    const h = this.hour, night = h < 5 || h >= 23, r = Math.min(1, this.rush());
    return { car: night ? 0.15 : Math.min(1, 0.5 + 0.6 * r), ped: night ? 0.1 : Math.min(1, 0.55 + 0.5 * r), jam: night ? 0.15 : 0.35 + 0.65 * r };
  }
  // ---- v98：住民の移動（src/render/residents.ts）----
  /** 検査用：休日を固定する（null で暦どおり。描画の日を 7 日でめぐり、5・6 日目が休日） */
  holiday: boolean | null = null;
  /** 見えている範囲で移動中の住民（手段ごと）・描いている数・市全体の移動中・休日か・作り直しの時間（ms） */
  resInfo = { visible: [0, 0, 0, 0, 0], drawn: [0, 0, 0, 0, 0], total: 0, holiday: false, ms: 0, tickMs: 0 };
  private resPlan: Plan | null = null; private resPool: RTrip[] = []; private resT = 0; private resDirty = false;
  private resFld = new Map<number, Int16Array>(); private resFldV = -1; private resBudget = 4;
  private isHol(): boolean { return this.holiday ?? isHoliday(this.dayNo); }
  private qk(): number { return (this.quality === 'high' ? 1 : this.quality === 'mid' ? 0.65 : 0.35) * (this.lite ? 0.55 : 1); }
  private resPlanNow(s: GameState): Plan {
    const p = residentPlan(s, this.hour, this.isHol(), this.target.x / TILE, this.target.z / TILE, 24, 760, this.dayNo);
    this.resPlan = p; this.resT = 0; this.resInfo.visible = p.visible.map(v => v); this.resInfo.total = p.total; this.resInfo.holiday = p.holiday; return p;
  }
  /** 描く数：見えている住民の数どおり（上限を超えるときは上限で切る）。バスは乗客 25 人で 1 台 */
  private resTargets(p: Plan, k: number): { car: number; bike: number; bus: number; ped: number } {
    const v = p.visible;
    return { car: Math.min(Math.round(250 * k), v[RM_CAR]), bike: Math.min(Math.round(80 * k), v[RM_BIKE]), bus: Math.min(8, Math.ceil(v[RM_BUS] / 25)), ped: Math.min(Math.round(400 * Math.max(0.45, k)), v[RM_WALK]) };
  }
  /** 道路の区画 goal までの道のりの距離（区画数）。徒歩は高速道路を通らない。1 コマに数本まで作り、道路が変わるまで使い回す */
  private resField(s: GameState, goal: number, ped: boolean): Int16Array | null {
    if (this.resFldV !== s.roadVersion) { this.resFld.clear(); this.resFldV = s.roadVersion; }
    const key = goal * 2 + (ped ? 1 : 0), c = this.resFld.get(key); if (c) return c;
    if (this.resBudget <= 0 || !s.road[goal]) return null; this.resBudget--;
    const n = W * H, d = new Int16Array(n).fill(-1), q = new Int32Array(n), road = s.road; let h = 0, tl = 0; d[goal] = 0; q[tl++] = goal;
    while (h < tl) { const i = q[h++], x = i % W, nd = d[i] + 1;
      const go = (j: number) => { if (road[j] && d[j] < 0 && !(ped && road[j] === 3 && road[i] !== 3)) { d[j] = nd; q[tl++] = j; } };
      if (x > 0) go(i - 1); if (x < W - 1) go(i + 1); if (i >= W) go(i - W); if (i + W < n) go(i + W); }
    if (this.resFld.size > 160) this.resFld.delete(this.resFld.keys().next().value!);
    this.resFld.set(key, d); return d;
  }
  /** 行き先 goal へ向かう次の区画（距離の場があれば最短、なければ近づく向き。来た道へはなるべく戻らない） */
  private resNext(s: GameState, at: number, prev: number, goal: number, ped: boolean): number {
    if (at === goal) return prev >= 0 ? prev : at;
    const f = this.resField(s, goal, ped), x = at % W, y = (at / W) | 0, gx = goal % W, gy = (goal / W) | 0; let best = -1, bv = 1e9;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy; if (!inMap(nx, ny)) continue; const j = idx(nx, ny);
      if (!s.road[j] || (ped && s.road[j] === 3 && s.road[at] !== 3)) continue;
      let v = f ? (f[j] < 0 ? 1e5 : f[j] * 10) : (Math.abs(nx - gx) + Math.abs(ny - gy)) * 10;
      if (j === prev) v += f ? 0.5 : 25; if (prev >= 0 && j - at === at - prev) v -= 0.3; v += Math.random() * 0.2;
      if (v < bv) { bv = v; best = j; }
    }
    return best >= 0 ? best : prev >= 0 ? prev : at;
  }
  /** 住民の移動の、いまいる道路の区画（sampleTrips の経路があればそれ、なければ家と行き先の間の近くの道路） */
  private resPos(s: GameState, t: RTrip, ped: boolean): number {
    const ok = (j: number) => j >= 0 && s.road[j] && !(ped && s.road[j] === 3);
    if (t.path && t.path.length) { const j = t.path[Math.min(t.path.length - 1, Math.floor(t.prog * t.path.length))]; if (ok(j)) return j; }
    const x = Math.round(t.from % W + (t.to % W - t.from % W) * t.prog), y = Math.round(((t.from / W) | 0) + (((t.to / W) | 0) - ((t.from / W) | 0)) * t.prog);
    const j = roadNear(s.road, W, H, x, y, 1, 1, 4); return ok(j) ? j : t.from;
  }
  private resAgent(s: GameState, t: RTrip, atStart: boolean): Agent | null {
    const ped = t.mode === RM_WALK, cx = this.target.x / TILE, cz = this.target.z / TILE;
    const fromNear = Math.abs(t.from % W - cx) < 22 && Math.abs(((t.from / W) | 0) - cz) < 22;
    let cur = atStart && fromNear ? t.from : this.resPos(s, t, ped);
    if (!s.road[cur] || (ped && s.road[cur] === 3)) cur = t.from; if (!s.road[cur]) return null;
    const next = this.resNext(s, cur, -1, t.to, ped);
    const a: Agent = { cur, next, prev: -1, t: atStart ? 0.2 : Math.random(), speed: ped ? 1.2 : 7 + Math.random() * 4, lane: Math.random() < 0.5 ? 0 : 1, yaw: 0, bob: Math.random() * 6, kind: t.mode === RM_BUS ? 1 : 0 };
    (a as any).rt = t; (a as any).goal = t.to;
    if (ped && atStart && fromNear) a.exit = TILE / 2 - this.pedHW(s, cur) - 1.25 + 1.2; // 家（建物）から出てくる
    return a;
  }
  /** 住民の車の形：車は乗用車、自転車はママチャリ・スポーツ車、バスは路線バス。業務の車と列の車（住民なし）は今までの分布 */
  private dressCar(a: Agent): void {
    const t = (a as any).rt as RTrip | undefined, R = Math.random;
    if (!t || (a as any).work || a.kind === 1) { this.dressVeh(a); if ((a as any).work && a.vm !== undefined && a.vm < 10 && a.kind !== 1) { a.vm = 9; a.vc = [0x24262a, 0xf4f4f2, 0xe8c840, 0x2f8a5a][(R() * 4) | 0]; } return; }
    if (t.mode === RM_BIKE) { const road = t.role === 3 && R() < 0.3; a.vm = WV(road ? 'roadbike' : 'mamachari'); a.vc = road ? [0xd8382c, 0x24262a, 0xf2f2f2, 0x2a8ac8][(R() * 4) | 0] : [0xf2f2f2, 0x6a8a4a, 0x8a6a4a, 0x2a2c33][(R() * 4) | 0]; a.speed *= road ? 0.75 : 0.45; a.v = undefined; return; }
    const kd = carKindOf(R()); a.vm = VEH_MODELS.indexOf(kd); a.vc = carColor(R(), kd === 'kei' || kd === 'keitruck'); a.v = undefined;
  }
  /** 住民の見た目：役割と用事から（小学生・中学生・働く人・買い物の人・高齢者。休日は普段着） */
  private resLook(t: RTrip, cm: number, rain: boolean): Look {
    const hol = this.resInfo.holiday, R = Math.random;
    const ty: PType = t.role === 1 ? 'student' : t.role === 2 ? 'teen' : t.role === 3 ? (hol ? (t.why === '行楽地' ? 'tourist' : 'shopper') : 'worker') : t.role === 5 ? (R() < 0.04 ? 'wheel' : 'elderly') : t.role === 0 ? 'parent' : t.why === '行楽地' ? 'tourist' : 'shopper';
    return makeLook(ty, R, cm, rain);
  }
  private dressRes(list: Agent[]): Agent[] {
    const s = this.getState(), cm = calMonth(s.month), rain = this.rainNow(s);
    for (const a of list) { const t = (a as any).rt as RTrip; a.L = this.resLook(t, cm, rain); a.ph = Math.random() * 6.28; a.mv = 1; a.speed = a.L.speed; a.lead = undefined; a.side = 0; }
    return list.slice(0, 420);
  }
  /** 見えている住民の移動のうち、まだ画面にいない人を 1 件（手段 m） */
  private resTake(m: number): RTrip | null { const k = this.resPool.findIndex(t => t.mode === m); return k < 0 ? null : this.resPool.splice(k, 1)[0]; }
  /** 住民が行き先に着いた：次の住民の移動に入れ替える（画面に出す数が多すぎる・候補がないときは消える） */
  private resArrive(s: GameState, a: Agent, ped: boolean): void {
    const A = a as any, old = A.rt as RTrip | undefined; if (!old) return;
    const t = A.ret ? null : this.resTake(old.mode); this.resDirty = true;
    if (!t) { A.dead = 1; return; }
    const b = this.resAgent(s, t, true); if (!b) { A.dead = 1; return; }
    a.cur = b.cur; a.next = b.next; a.prev = -1; a.t = b.t; a.nn = undefined; a.enter = undefined; a.exit = b.exit; A.rt = t; A.goal = t.to; A.ret = 0;
    if (ped) { const cm = calMonth(s.month); a.L = this.resLook(t, cm, this.rainNow(s)); a.speed = a.L.speed; A.relook = 1; } else { a.v = 0; this.dressCar(a); }
  }
  /** 数秒に 1 回：住民の移動を作り直し、描く数を合わせる（足りなければ家から出てくる人・車を足し、多すぎれば建物に入って消える・車は遠い順に消す） */
  private resTick(s: GameState): void {
    const t0 = performance.now(), plan = this.resPlanNow(s), tg = this.resTargets(plan, this.qk());
    const on = new Set<number>(); for (const a of this.cars) { const t = (a as any).rt as RTrip | undefined; if (t) on.add(t.person); } for (const a of this.peds) { const t = (a as any).rt as RTrip | undefined; if (t) on.add(t.person); }
    this.resPool = plan.trips.filter(t => !on.has(t.person));
    const cx = this.target.x, cz = this.target.z, far = (a: Agent) => -Math.hypot(((a as any).px ?? cx) - cx, ((a as any).pz ?? cz) - cz);
    let pedCh = false;
    for (const [m, want] of [[RM_CAR, tg.car], [RM_BIKE, tg.bike], [RM_BUS, tg.bus], [RM_WALK, tg.ped]] as [number, number][]) {
      const ped = m === RM_WALK, arr = ped ? this.peds : this.cars;
      const mine = arr.filter(a => { const t = (a as any).rt as RTrip | undefined; return t && t.mode === m && !(a as any).dead && !(a as any).ret && !(a as any).em; });
      if (mine.length < want) {
        const add: Agent[] = [];
        for (let n = 0; n < Math.min(want - mine.length, 60) && arr.length + add.length < (ped ? 420 : 300); n++) { const t = this.resTake(m); if (!t) break; const a = this.resAgent(s, t, true); if (a) add.push(a); }
        if (ped) { this.peds.push(...this.dressRes(add)); pedCh = pedCh || add.length > 0; } else { add.forEach(a => this.dressCar(a)); this.cars.push(...add); }
      } else if (mine.length > want * 1.1 + 2) {
        mine.sort((a, b) => far(a) - far(b)); // 遠い順
        for (const a of mine.slice(0, mine.length - want)) { if (ped) { (a as any).ret = 1; if (a.enter === undefined && a.exit === undefined) a.enter = 0; } else (a as any).dead = 1; }
      }
    }
    this.resSweep(pedCh);
    this.resInfo.tickMs = +(performance.now() - t0).toFixed(1);
  }
  /** 消えた人・車を除き、見た目を描画に送り直す */
  private resSweep(pedCh = false): void {
    const nc = this.cars.length, np = this.peds.length;
    this.cars = this.cars.filter(a => !(a as any).dead); this.peds = this.peds.filter(a => !(a as any).dead);
    if (pedCh || np !== this.peds.length || this.peds.some(a => (a as any).relook)) { for (const a of this.peds) (a as any).relook = 0; this.lookPeds(this.peds); }
    if (nc !== this.cars.length || np !== this.peds.length) { this.stats.cars = this.cars.length; this.stats.peds = this.peds.length; }
    this.resDirty = false; this.resCount();
  }
  private resCount(): void {
    const d = [0, 0, 0, 0, 0]; for (const a of this.cars) { const t = (a as any).rt as RTrip | undefined; if (t) d[t.mode]++; } for (const a of this.peds) if ((a as any).rt) d[RM_WALK]++;
    this.resInfo.drawn = d;
  }
  /** 画面の人・車を押したときの紹介（住民なら名前・住まい・世帯・行き先・手段）。何もなければ null */
  pickPerson(clientX: number, clientY: number): string | null {
    const r = this.renderer.domElement.getBoundingClientRect(), mx = clientX - r.left, my = clientY - r.top; let best: Agent | null = null, bd = 16 * 16, isPed = false;
    const test = (a: Agent, ped: boolean) => { const A = a as any; if (A.px === undefined) return; const p = this.project(A.px, (A.py ?? this.surfY(A.px, A.pz)) + (ped ? 0.9 : 0.8), A.pz); if (!p.visible) return; const d = (p.x - mx) ** 2 + (p.y - my) ** 2; if (d < bd) { bd = d; best = a; isPed = ped; } };
    for (const a of this.peds) test(a, true); for (const a of this.cars) test(a, false);
    for (const q of this.incs) if (q.victim && q.hurt) { const p = this.project(q.victim[0], this.surfY(q.victim[0], q.victim[1]) + 0.3, q.victim[1]); if (p.visible && (p.x - mx) ** 2 + (p.y - my) ** 2 < bd) return q.hurt; }
    if (!best) return null; return this.whoIs(best, isPed);
  }
  /** 人・車の紹介の文（事故の知らせにも使う） */
  whoIs(a: Agent, ped: boolean): string {
    const A = a as any, s = this.getState(), t = A.rt as RTrip | undefined, place = (tile: number) => this.incPlace(tile);
    if (A.em) return '緊急車両（出動中）';
    if (!t) return A.work ? '業務の車（配送・タクシー・巡回など。住民の移動ではありません）' : A.out ? '市外から来た車（通過の交通）' : ped ? '通りがかりの人' : '車';
    const pre = !ped && t.mode === RM_BUS ? `路線バス（この辺りでバスに乗っている住民 約 ${this.resInfo.visible[RM_BUS]} 人）｜` : !ped && t.mode === RM_CAR ? '🚗 ' : !ped && t.mode === RM_BIKE ? '🚲 ' : '🚶 ';
    return pre + profileOf(s, t, place);
  }
  /** 車と人を、注視点の近く（半径 約 700m）の道路に置く。v98：車・人・自転車・バスは、見えている範囲で移動中の住民（src/render/residents.ts）から出す。
   *  数は住民の移動の数に比例（性能の上限で切る）。ほかに、業務の車（トラック・タクシー・配達）と、混んでいる道の列を置く */
  spawnAgents(): void {
    if (REAL && !REAL.deformed) { if (this.vehM.length) this.spawnReal(); return; }
    const s = this.getState(), k = (this.quality === 'high' ? 1 : this.quality === 'mid' ? 0.65 : 0.35) * (this.lite ? 0.55 : 1), f = this.flow();
    const cx = this.target.x / TILE, cz = this.target.z / TILE, R = 24;
    this.agentSpawnAt = { x: this.target.x, z: this.target.z, h: 0 };
    const near = (i: number) => Math.abs(i % W - cx) < R && Math.abs(((i / W) | 0) - cz) < R;
    const roads = this.roadTiles.filter(near), peds = this.pedTiles.filter(near);
    const attract = new Float32Array(N);
    for (const b of s.buildings) {
      if (b.status !== 'operating') continue;
      const f = fam(b.kind), wgt = b.kind === 'station' ? 7 : (DEFS[b.kind].visitors ?? 0) >= 2000 ? 5 : f === 'shop' ? 3 : f === 'school' || f === 'jhs' || f === 'park' || f === 'health' || f === 'culture' || f === 'library' ? 2 : 0;
      if (!wgt) continue;
      const r = b.kind === 'station' ? 4 : 2;
      for (let dy = -r; dy < b.h + r; dy++) for (let dx = -r; dx < b.w + r; dx++) { const x = b.x + dx, y = b.y + dy; if (inMap(x, y)) attract[idx(x, y)] = Math.max(attract[idx(x, y)], wgt); }
    }
    const cw = roads.map(i => (0.25 + Math.min(2.5, (s.vc[i] || 0) * f.jam) * 1.6) * (s.road[i] >= 2 ? 1.6 : 1));
    const pw = peds.map(i => 1 + attract[i]);
    this.pedAttract = attract; this.pedList = peds; this.pedW = pw; this.buildDoors(s, near);
    // 住民の移動（見えている範囲）
    const t0 = performance.now(), plan = this.resPlanNow(s), tg = this.resTargets(plan, k), byMode: RTrip[][] = [[], [], [], [], []];
    for (const t of plan.trips) byMode[t.mode]?.push(t);
    const take = (m: number, n: number) => byMode[m].splice(0, n);
    const resCars: Agent[] = [], resPeds: Agent[] = [];
    for (const t of take(RM_CAR, tg.car)) { const a = this.resAgent(s, t, false); if (a) resCars.push(a); }
    for (const t of take(RM_BIKE, tg.bike)) { const a = this.resAgent(s, t, false); if (a) resCars.push(a); }
    for (const t of take(RM_BUS, tg.bus)) { const a = this.resAgent(s, t, false); if (a) resCars.push(a); }
    for (const t of take(RM_WALK, tg.ped)) { const a = this.resAgent(s, t, false); if (a) resPeds.push(a); }
    const mk = (n: number, list: number[], w: number[] | undefined, kind: number): Agent[] => {
      const out: Agent[] = [];
      for (let i = 0; i < n && list.length; i++) {
        const cur = this.pickTile(list, w), next = this.nextTile(s, cur, -1, false);
        out.push({ cur, next: next < 0 ? cur : next, prev: -1, t: Math.random(), speed: 7 + Math.random() * 4, lane: Math.random() < 0.5 ? 0 : 1, yaw: 0, bob: Math.random() * 6, kind });
      }
      return out;
    };
    // 混んでいる道（朝夕に容量を超える区間）には、区間ごとに車の列を置く（渋滞）。v98：列の車にも、その時間に車で動いている住民を割り当てる（いなければ市外からの車）
    const jamCars: Agent[] = [], carPool = byMode[RM_CAR];
    if (plan.visible[RM_CAR] > 0) for (const i of roads) {
      const v = (s.vc[i] || 0) * f.jam; if (v < 0.9) continue;
      const per = jamLook(v).per, x = i % W, y = (i / W) | 0; // v87：混雑率 1 超で列が伸び、1.5 超では区画いっぱい（交差点をまたいで）に詰まる
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (!inMap(nx, ny) || !s.road[idx(nx, ny)]) continue;
        for (let q = 0; q < per && jamCars.length < Math.min(240 * k, Math.max(8, tg.car * 0.6)); q++) {
          const a: Agent = { cur: i, next: idx(nx, ny), prev: -1, t: (q + 0.3) / (per + 0.5), speed: 7 + Math.random() * 4, lane: q % 2, yaw: 0, bob: Math.random() * 6, kind: 0 };
          const t = carPool.shift(); if (t) { (a as any).rt = t; (a as any).goal = t.to; } else (a as any).out = 1;
          jamCars.push(a);
        }
      }
    }
    // 業務の車（トラック・タクシー・配達・巡回）：住民の車の 1 割ほど。夜は少ない
    const nWork = Math.min(60, Math.round((3 + tg.car * 0.12) * (f.car > 0.3 ? 1 : 0.4)));
    const work = mk(nWork, roads, cw, 2).map((a, j) => { if (j % 2) a.kind = this.vehKind(s) === 1 ? 1 : 0; (a as any).work = 1; return a; });
    { let np = 0; for (const b of s.buildings) if (b.status === 'operating' && (b.kind === 'police' || b.kind === 'koban')) np++; // v87：巡回のパトカーは治安が悪いほど、交番・警察署が多いほど多い
      this.patrolP = Math.min(0.03, (0.003 + 0.016 * (s.stats.crime || 0)) * (np ? 1 + 0.3 * Math.min(3, np) : 0.35)); }
    this.ems = this.ems.filter(a => s.road[a.cur]);
    this.cars = jamCars.concat(resCars, work).slice(0, 320 - this.ems.length); this.peds = this.dressRes(resPeds);
    this.cars.forEach(a => this.dressCar(a)); this.cars.push(...this.ems); for (const c of this.incAgents()) if (!this.cars.includes(c)) this.cars.push(c); this.lookPeds(this.peds);
    this.stats.cars = this.cars.length; this.stats.peds = this.peds.length; this.resInfo.ms = +(performance.now() - t0).toFixed(1); this.resCount();
  }
  /** v95：歩行者から見た車道の半幅。拡幅した幹線（立体交差の前後・6 車線の幅）は国道と同じ幅で描くので、歩く位置もそれに合わせる（前は幹線の幅のまま計算し、外側の車線の上を歩いていた） */
  private pedHW(s: GameState, i: number): number { const t = s.road[i]; return (t === 2 && this.wideSet.has(i) ? HW[3] : HW[t]) || 2.5; }
  private dtNow = 0; private pedGrid = new Map<number, Agent[]>();
  private moveAgents(s: GameState, dt: number): void {
    this.dtNow = dt;
    if (REAL && !REAL.deformed) { this.moveReal(dt); return; }
    const m = this.map, up = new THREE.Vector3(0, 1, 0);
    // v98：注視点が大きく動いたら置き直し、それ以外は 5 秒に 1 回、住民の移動に合わせて足し引きする（全部を置き直さない）
    this.resBudget = 4; this.resT += dt;
    if (Math.hypot(this.target.x - this.agentSpawnAt.x, this.target.z - this.agentSpawnAt.z) > 300) this.spawnAgents();
    else if (this.resT > 5) this.resTick(s);
    const head = this.headPts.geometry.attributes.position as THREE.BufferAttribute, tail = this.tailPts.geometry.attributes.position as THREE.BufferAttribute, tailC = this.tailPts.geometry.attributes.color as THREE.BufferAttribute;
    const jam = this.flow().jam, closed = this.crossClosed;
    // 前の車との間（同じ区間・同じ向き）：近づきすぎたら止まる（渋滞の列ができる）
    // v83：車の長さを見る（バス・トラックは長い）。次の区間の最後尾と、路線バス（moveBuses）も前の車として扱う。
    // 前は「同じ区間の中だけ・どの車も 7.5m」で、区間の境い目や長いバスの後ろで車が重なっていた
    if (this.dbgVeh) this.dbgVeh.push(-1e9, 0, 0, 0, -1); // 検査用：コマの区切り
    this.vehBegin();
    const HL = (a: { vm?: number }) => VT_HL[a.vm ?? 0], segs = new Map<number, { t: number; hl: number; id: number; lane: number }[]>(), keyOf = (c: number, n: number) => c * 100000 + n;
    const put = (c: number, n: number, t: number, hl: number, id: number, lane: number) => { const k = keyOf(c, n), l = segs.get(k); if (l) l.push({ t, hl, id, lane }); else segs.set(k, [{ t, hl, id, lane }]); };
    const pkSeg = new Map<number, number>(); // v95：路上に止めた車（駐車違反）は列に入れず、後ろの車は右へよけて抜ける
    this.cars.forEach((a, i) => { if ((a as any).pk) { pkSeg.set(keyOf(a.cur, a.next), a.t); return; } put(a.cur, a.next, a.t, HL(a), i, a.lane); });
    for (const b of this.busSegs) put(b.cur, b.next, b.t, VEH_HL[1], -1, 0);
    // v95：交差点（3 方向以上）の中にいる車（入ってきた区画・右折か）。区画の中心から R 以内と、停止線を越えて入りかけた車
    const jR = (J: number) => (HW[s.road[J]] || 2.5) + 4, jOcc = new Map<number, { id: number; from: number; rt: boolean }[]>();
    this.cars.forEach((a, i) => { if (a.cur === a.next || (((a as any).dk ?? -1) >= 0)) return;
      const J = a.t >= 0.5 ? a.next : a.cur, sl = a.t >= 0.5 ? (a.t - 1) * TILE : a.t * TILE, from = a.t >= 0.5 ? a.cur : a.prev, to = a.t >= 0.5 ? a.nn : a.next;
      if (from < 0 || to === undefined || to < 0 || this.roadDeg(s, J) < 3) return; const R = jR(J); if (sl <= -(R + 1.5) || sl >= R) return;
      const o = { id: i, from, rt: isRightTurn(W, from, J, to) }, l = jOcc.get(J); if (l) l.push(o); else jOcc.set(J, [o]); });
    this.cars.forEach((a, i) => { if ((a as any).wr || (a as any).pk) { (a as any).limit = a.t; return; } // v95：事故車・止めた車は動かない
      { const pt = pkSeg.get(keyOf(a.cur, a.next)); (a as any).ov = pt !== undefined && pt > a.t && (pt - a.t) * TILE < 22 ? 1 : 0; }
      let lim = 9; const me = HL(a), wide = this.laneOff(s, a.cur, 1) !== this.laneOff(s, a.cur, 0);
      // 同じ区間の前の車（同じ位置なら番号の若いほうを前とみなす。4 車線の道では同じ車線だけ）
      const jv = (s.vc[a.cur] || 0) * jam, gp = jv > 1.5 ? 0.9 : jv > 1 ? 1.3 : 2; // v87：渋滞では車間を詰める
      const own = segs.get(keyOf(a.cur, a.next)); if (own) for (const o of own) if (o.id !== i && (o.t > a.t || (o.t === a.t && o.id < i)) && (!wide || o.lane === a.lane || o.id < 0)) lim = Math.min(lim, o.t - (me + o.hl + gp) / TILE);
      const nx = a.nn !== undefined && a.nn !== a.next ? segs.get(keyOf(a.next, a.nn)) : undefined; if (nx) for (const o of nx) lim = Math.min(lim, 1 + o.t - (me + o.hl + gp) / TILE);
      if ((a as any).em?.lit) { lim = 9; const ce = this.cars; // 赤色灯の緊急車両は、道を空けた車の横を抜けていく（前の緊急車両には続く）
        if (own) for (const o of own) if (o.id >= 0 && o.id !== i && ((ce[o.id] as any)?.em || (ce[o.id] as any)?.vr) && (o.t > a.t || (o.t === a.t && o.id < i))) lim = Math.min(lim, o.t - (me + o.hl + 3) / TILE);
        if (nx) for (const o of nx) if (o.id >= 0 && ((ce[o.id] as any)?.em || (ce[o.id] as any)?.vr)) lim = Math.min(lim, 1 + o.t - (me + o.hl + 3) / TILE); }
      // v95：交差点で互いに突き抜けない。交差点の中（と停止線を越えた所）に、別の向きから入った車がいれば停止線の手前で待つ（先に入った車が優先）。
      // 向かい合う直進・左折どうしはぶつからないので待たない。赤色灯の緊急車両・高架の上の車は待たない。8 秒待っても空かなければ進む（行き詰まり防止）
      if (!(a as any).em?.lit && !(((a as any).dk ?? -1) >= 0) && a.cur !== a.next && a.nn !== undefined && jOcc.has(a.next)) {
        const J = a.next, R = jR(J), stopT = 1 - (R + 1.5) / TILE;
        if (a.t <= stopT + 1e-6 && ((a as any).jw ?? 0) < 8) {
          const rt = isRightTurn(W, a.cur, J, a.nn); let block = false;
          for (const o of jOcc.get(J)!) { if (o.id === i || o.from === a.cur) continue; const opp = o.from - J === J - a.cur; if (opp && !rt && !o.rt) continue; block = true; break; }
          if (block) { lim = Math.min(lim, stopT); if (a.t > stopT - 0.05) (a as any).jw = ((a as any).jw ?? 0) + this.dtNow; } else (a as any).jw = 0;
        }
      } else (a as any).jw = 0;
      (a as any).limit = lim; });
    const sigG = this.signals(s), cyc = this.lifeT % 36, sigAxis = cyc < 18 ? 0 : 1, amber = cyc % 18 > 15, h = this.hour;
    this.sigLights(cyc, sigAxis, amber);
    const pedGrid = this.pedGrid;
    const stepPed = (a: Agent, i: number) => {
      const ld = a.lead !== undefined ? this.peds[a.lead] : null, L = a.L!;
      if (ld) { a.cur = ld.cur; a.next = ld.next; a.prev = ld.prev; a.t = ld.t; a.lane = ld.lane; a.wait = ld.wait; a.enter = ld.enter; a.exit = ld.exit; a.speed = ld.speed; }
      else {
        if (!s.road[a.cur] || !s.road[a.next]) { a.cur = this.pickTile(this.pedTiles); if (a.cur < 0) return; a.next = this.nextTile(s, a.cur, -1, true); a.prev = -1; a.t = 0; a.enter = a.exit = undefined; }
        const inDist = TILE / 2 - (this.pedHW(s, a.cur)) - 1.25 + 1.2;
        if (a.enter !== undefined) {
          a.enter += a.speed * dt; a.wait = false;
          // 建物に入った：しばらくして、別の建物の入口から出てくる
          if (a.enter > inDist) {
            a.enter = undefined; if ((a as any).rt) { this.resArrive(s, a, true); } else { const j = this.doorTiles.length ? this.doorTiles[(Math.random() * this.doorTiles.length) | 0] : this.pickTile(this.pedList, this.pedW);
            if (j >= 0) { a.cur = j; a.next = this.nextTile(s, j, -1, true); a.prev = -1; a.t = 0.2 + Math.random() * 0.5; const g = this.doorGrid; a.lane = g && g[this.sideTile(a.cur, a.next, 1)] ? 1 : g && g[this.sideTile(a.cur, a.next, 0)] ? 0 : a.lane; a.exit = TILE / 2 - (this.pedHW(s, a.cur)) - 1.25 + 1.2; } }
          }
        } else if (a.exit !== undefined) { a.exit -= a.speed * dt; a.wait = false; if (a.exit <= 0) a.exit = undefined; }
        else {
          let nt = a.t + a.speed * dt / TILE; a.wait = false;
          // 信号：幹線の交差点の手前（横断歩道の前）で、赤なら止まって待つ
          if (a.cur !== a.next && sigG[a.next]) {
            const stopT = 1 - ((this.pedHW(s, a.next)) + 2.4) / TILE, axis = Math.abs(a.next - a.cur) === 1 ? 0 : 1;
            if ((axis !== sigAxis || amber) && a.t <= stopT + 1e-6 && nt > stopT) { nt = stopT; a.wait = true; }
          }
          if (closed.size && closed.has(a.next) && a.cur !== a.next && nt > 0.55) { nt = Math.max(a.t, 0.55); a.wait = true; }
          a.t = nt;
          if (a.t >= 1) {
            a.t -= 1; const G = (a as any).goal ?? -1; let n = G >= 0 ? this.resNext(s, a.next, a.cur, G, true) : this.nextTile(s, a.next, a.cur, true);
            // 朝の通勤・通学は駅（と市外への出口）の方へ（v98：住民は自分の行き先へ）
            if (G < 0 && (L.t === 'worker' || L.t === 'teen') && h >= 6 && h < 9.5 && Math.random() < 0.7) { const f = this.flowField(s)[a.next]; if (f >= 0 && f !== a.cur && s.road[f] !== 3) n = f; }
            a.prev = a.cur; a.cur = a.next; a.next = n;
            if (G >= 0 ? a.cur === G : this.wantsEnter(a)) a.enter = 0;
          }
        }
      }
      const x0 = (a.cur % W + 0.5) * TILE, z0 = (((a.cur / W) | 0) + 0.5) * TILE, x1 = (a.next % W + 0.5) * TILE, z1 = (((a.next / W) | 0) + 0.5) * TILE;
      let dx = x1 - x0, dz = z1 - z0; const Ln = Math.hypot(dx, dz) || 1; dx /= Ln; dz /= Ln;
      // v95：拡幅した道・幅の違う道でも、その区画の歩道の上を歩く（区画の境目でなめらかに寄せる）
      const hwC = this.pedHW(s, a.cur), hwN = a.next !== a.cur && s.road[a.next] && this.roadDeg(s, a.next) < 3 ? this.pedHW(s, a.next) : hwC, fk = Math.max(0, Math.min(1, (a.t - 0.4) / 0.2)), hw = hwC + (hwN - hwC) * fk, wk = walkW(hwC) + (walkW(hwN) - walkW(hwC)) * fk, sg = a.lane ? 1 : -1, ex = a.enter ?? a.exit ?? 0;
      let off = (hw + wk * 0.5 + (a.side === 1 ? 0.62 : a.side === 2 ? -0.55 : 0) + ex) * sg;
      // v95：前の人・すれ違う人と重ならない（近くの格子だけを見る）。前にいる人の横へずれて追い越す・すれ違う。歩道の幅の中にとどめる
      if (!ld && ex === 0) { const A = a as any; let dg = 0; const bx = A.px, bz = A.pz;
        if (bx !== undefined) { const gx = Math.floor(bx / 2), gz = Math.floor(bz / 2);
          for (let u = -1; u <= 1 && !dg; u++) for (let v = -1; v <= 1 && !dg; v++) { const l = pedGrid.get((gx + u) * 8192 + gz + v); if (l) for (const o of l) { if (o === a) continue; const O = o as any, rx = O.px - bx, rz = O.pz - bz, fw = rx * dx + rz * dz, lat = rx * dz - rz * dx; if (fw > -0.2 && fw < 1.6 && Math.abs(lat) < 0.6) { dg = lat > 0 ? -0.55 : 0.55; break; } } } }
        A.dg = (A.dg ?? 0) + (dg - (A.dg ?? 0)) * Math.min(1, dt * 3); const lo = hw + 0.35, hi = hw + wk - 0.3, m0 = Math.abs(off) + A.dg * sg; off = Math.max(lo, Math.min(hi, m0)) * sg; }
      const px = x0 + dx * TILE * a.t + dz * off, pz = z0 + dz * TILE * a.t - dx * off; (a as any).px = px; (a as any).pz = pz;
      const yaw = a.enter !== undefined ? Math.atan2(dz * sg, -dx * sg) : a.exit !== undefined ? Math.atan2(-dz * sg, dx * sg) : Math.atan2(dx, dz);
      let d = yaw - a.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      a.yaw += d * Math.min(1, dt * 6);
      const py = this.surfY(px, pz) + 0.2 - (this.tunnelSet.size && this.tunnelSet.has(a.cur) ? 80 : 0);
      this.poseWalker(a, i, px, py, pz, a.yaw, a.speed, dt);
    };
    const step = (a: Agent, ped: boolean, i: number) => {
      if (ped) { stepPed(a, i); return true; }
      if (!s.road[a.cur] || !s.road[a.next]) { const list = ped ? this.pedTiles : this.roadTiles; a.cur = this.pickTile(list); if (a.cur < 0) return false; a.next = this.nextTile(s, a.cur, -1, ped); a.prev = -1; a.t = 0; a.nn = undefined; }
      const em: Em | undefined = (a as any).em;
      const VA = a as any; if (VA.vr) { const r = VA.vr as number[]; a.cur = r[VA.vi]; a.next = r[Math.min(r.length - 1, VA.vi + 1)]; a.nn = r[Math.min(r.length - 1, VA.vi + 2)]; } // v95：違反の車は決めた道筋を走り、終わりで止められる
      else if (em) this.emRoute(a, em); else if (a.nn === undefined || !s.road[a.nn] || a.nn === a.next) a.nn = a.cur === a.next ? a.next : VA.goal >= 0 ? this.resNext(s, a.next, a.cur, VA.goal, false) : this.nextTile(s, a.next, a.cur, false);
      // v86：目標の速さ（道・渋滞・曲がり角で変わる）まで加減速する。前の車・赤信号・踏切の手前では、止まれる速さまで落とす（前は一定の速さで、止まるときは瞬間に止まっていた）
      const vc = (s.vc[a.cur] || 0) * jam; let vt = a.speed * (s.road[a.cur] >= 2 ? 1.25 : 0.8) / (1 + 1.6 * vc * vc * vc);
      if (em?.lit) vt = 13 / (1 + 0.5 * vc * vc); // 緊急走行（渋滞がひどいと、それでも遅れる）
      else { const cr = jamLook(vc).crawl; if (cr > 0) vt *= Math.max(0, 1 - cr * (0.55 + 0.6 * Math.sin(this.lifeT * 0.9 - (a.cur % W + ((a.cur / W) | 0) + a.t) * 0.8))); // v87：のろのろ（止まっては少し進む波が後ろへ伝わる）
        if ((a as any).yl && !VA.vr) vt = 0; if (VA.vr) vt *= VA.po ? 1 : 1.7; } // 緊急車両が近い：左に寄って止まる。v95：違反の車は速く走る
      if ((a.t > 0.62 && a.nn !== undefined && a.nn !== a.next && a.nn - a.next !== a.next - a.cur) || (a.t < 0.3 && a.prev >= 0 && a.next - a.cur !== a.cur - a.prev)) vt = Math.min(vt, 3.6 + a.speed * 0.18); // 曲がる前後は減速
      let lim = Math.min(9, (a as any).limit ?? 9);
      if (em) { if (em.wait > 0 || em.at) lim = Math.min(lim, a.t); else if (em.i >= em.r.length - 2) lim = Math.min(lim, 0.5); } // 出動の準備中・現場では止まる。経路の終わりの区間の中ほどで止まる
      else if (a.cur !== a.next && vc > 0.6 && a.nn !== a.next && this.roadDeg(s, a.next) >= 3 && isRightTurn(W, a.cur, a.next, a.nn!)) { // v87：右折待ち（混むほど対向車が切れず、交差点の中で長く待つ）
        const key = a.cur * 100000 + a.next; if ((a as any).rk !== key) { (a as any).rk = key; (a as any).rw = Math.random() < Math.min(0.9, vc * 0.7) ? 1 + Math.random() * 3 * vc : 0; }
        if ((a as any).rw > 0) { lim = Math.min(lim, 0.9); if (a.t > 0.85) (a as any).rw -= dt; }
      }
      if (!em && a.vm === 17 && this.busSet(s).has(a.cur)) { // v88：路線バスはバス停で左に寄せて止まり、客の乗り降りを待つ（区画ごとに 1 回）
        if ((a as any).bs !== a.cur && a.t < 0.5) { (a as any).bs = a.cur; (a as any).bw = 5 + Math.random() * 6; }
        if ((a as any).bw > 0) { lim = Math.min(lim, 0.5); if (a.t > 0.45) (a as any).bw -= dt; } }
      if (VA.vr && VA.vi >= VA.vr.length - 2) { lim = Math.min(lim, 0.5); if (a.t > 0.45 && (a.v ?? 0) < 0.3) VA.po = 1; } // v95：追われた車は道筋の終わりで左に寄せて止まる
      if (a.cur !== a.next && !em?.lit && !(((a as any).dk ?? -1) >= 0) && !(VA.vr && VA.sig)) { // 高架の上の車は信号・踏切で止まらない（v95：信号無視の車も）
        if (closed.size && closed.has(a.next) && a.t < 0.6) lim = Math.min(lim, 0.55); // 踏切：遮断機が下りていたら手前で待つ
        if (sigG[a.next]) { // 信号：幹線の交差点の手前（横断歩道の前）で、赤なら止まる。黄で止まれない位置なら通り抜ける
          const stopT = 1 - ((this.pedHW(s, a.next)) + 5.4) / TILE, axis = Math.abs(a.next - a.cur) === 1 ? 0 : 1;
          if ((axis !== sigAxis || amber) && a.t <= stopT + 0.01 && (stopT - a.t) * TILE > (a.v ?? vt) ** 2 / 12 - 0.4) lim = Math.min(lim, stopT);
        }
      }
      const gap = Math.max(0, (lim - a.t) * TILE), vs = Math.sqrt(2 * 3.8 * gap), tgt = Math.min(vt, vs);
      a.v ??= tgt;
      const pv = a.v, acc = a.vm !== undefined && ((a.vm >= 12 && a.vm <= 14) || a.vm >= 17) ? 1.3 : 2.4; // 大きな車はゆっくり加速する
      a.v += Math.max(-8 * dt, Math.min(acc * dt, tgt - a.v));
      let nt = a.t + a.v * dt / TILE; if (nt > Math.max(a.t, lim)) { nt = Math.max(a.t, lim); a.v = Math.min(a.v, (nt - a.t) * TILE / Math.max(dt, 1e-3)); }
      (a as any).brk = (pv - a.v) / Math.max(dt, 1e-3) > 0.9 || (a.v < 0.6 && tgt < 0.6) ? 1 : Math.max(0, ((a as any).brk ?? 0) - dt * 2); // ブレーキランプ：減速中と停止中
      a.t = nt;
      if (a.t >= 1) { a.t -= 1; a.prev = a.cur; if (VA.vr) { VA.vi = Math.min(VA.vr.length - 2, VA.vi + 1); const r = VA.vr as number[]; a.cur = r[VA.vi]; a.next = r[VA.vi + 1]; a.nn = r[Math.min(r.length - 1, VA.vi + 2)]; } else if (em) { em.i++; this.emRoute(a, em); } else { a.cur = a.next; a.next = a.nn!; a.nn = a.cur === a.next ? a.next : VA.goal >= 0 ? this.resNext(s, a.next, a.cur, VA.goal, false) : this.nextTile(s, a.next, a.cur, false); if (VA.goal >= 0 && a.cur === VA.goal && !VA.wr && !VA.pk) this.resArrive(s, a, false); } } // v98：住民の車は行き先に着いたら次の住民へ
      const dk = !ped && !em && this.flySpans.length ? this.deckStep(s, a) : -1; // v94：高架の上か下か（車線と入ってきた向きで決まる）
      // 左側通行：車線の線に沿って走る（曲がり角・折り返しも車線から車線へ）
      const lp = this.lanePath(s, a.prev, a.cur, a.next, a.nn!, a.t, a.lane), dx = lp.dx, dz = lp.dz;
      // v87：緊急車両が来たら左へ寄せる。緊急車両は少し右（中央寄り）を走る
      let sh = (a as any).sh ?? 0; const shT = VA.pk ? 1.6 : VA.po ? 1.4 : VA.ov ? -1.3 : em?.lit ? -1.1 : (a as any).yl && !VA.wr ? 1.5 : (a as any).bw > 0 && a.cur === (a as any).bs ? 1.3 : 0; if (sh !== shT) { sh += Math.max(-dt * 1.6, Math.min(dt * 1.6, shT - sh)); (a as any).sh = sh; }
      const px = lp.x + dz * sh, pz = lp.z - dx * sh; (a as any).px = px; (a as any).pz = pz;
      if (this.dbgVeh) this.dbgVeh.push(px, pz, dx, dz, (a.kind ?? 0) * 2);
      const yaw = Math.atan2(dx, dz);
      let d = yaw - a.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      a.yaw += d * Math.min(1, dt * 12); if (VA.wr) a.yaw = yaw + (VA.wy ?? 0); // v95：事故車は少し斜めを向いて止まる
      const py = this.slopePose(this.tmpQ, px, pz, Math.sin(a.yaw), Math.cos(a.yaw), a.yaw, VT_HL[a.vm ?? 0], dk) + 0.12; void ped; void up; // v95：坂では車体を路面に合わせて傾ける
      (a as any).py = py;
      this.tmpS.setScalar(VT_K[a.vm ?? 0]); void VEH_S;
      this.tmpV.set(px, py, pz); this.tmpM.compose(this.tmpV, this.tmpQ, this.tmpS); this.tmpS.set(1, 1, 1);
      this.placeVeh(a); { const hl = VT_HL[a.vm ?? 0]; head.setXYZ(i, px + Math.sin(a.yaw) * hl, py + 0.7, pz + Math.cos(a.yaw) * hl);
        const b = (a as any).brk ?? 0, nk = this.night; tail.setXYZ(i, px - Math.sin(a.yaw) * hl, py + 0.75, pz - Math.cos(a.yaw) * hl); tailC.setXYZ(i, (0.3 * nk + b) * 1.0, (0.3 * nk + b) * 0.06, (0.3 * nk + b) * 0.04);
        if (VA.wr || VA.po) { const f = ((this.lifeT * 2.4) | 0) & 1; tailC.setXYZ(i, f ? 1.5 : 0.1, f ? 0.6 : 0.04, f ? 0.02 : 0); } // v95：ハザード
        else if (em?.lit) { const f = ((this.lifeT * 5 + i) | 0) & 1; tailC.setXYZ(i, f ? 1.8 : 0.25, f ? 0.08 : 0.02, f ? 0.05 : 0.01); tail.setXYZ(i, px, py + 2.3, pz); } // v87：出動中の赤色灯（屋根の上で点滅。巡回中・帰りは消す）
        else if ((a as any).rw > 0 && a.t > 0.8) { const f = ((this.lifeT * 3) | 0) & 1; if (f) tailC.setXYZ(i, 1.4, 0.55, 0.02); } // 右折待ちのウインカー
        else if (!ped && ((a as any).yl || ((a as any).bw > 0 && a.cur === (a as any).bs) || (a.t > 0.6 && a.nn !== undefined && a.nn >= 0 && a.nn !== a.cur && this.turnAt(a.cur, a.next, a.nn)))) { const f = ((this.lifeT * 3 + (i & 1) * 0.5) | 0) & 1; if (f) tailC.setXYZ(i, 1.4, 0.55, 0.02); } } // v88：曲がる手前のウインカー、緊急車両に道を空けるときのハザード
      return true;
    };
    this.emTick(s, dt);
    this.cars.forEach((a, i) => step(a, false, i));
    pedGrid.clear(); for (const a of this.peds) { const A = a as any; if (A.px === undefined) continue; const k = Math.floor(A.px / 2) * 8192 + Math.floor(A.pz / 2), l = pedGrid.get(k); if (l) l.push(a); else pedGrid.set(k, [a]); } // v95：歩行者の近くを探す格子（2m 四方）
    this.peds.forEach((a, i) => step(a, true, i));
    if (this.resDirty) this.resSweep();
    this.moveLife(s, dt); this.moveFlow(s, dt);
    if (s.rail) { this.moveTrains(s, dt); this.moveGates(dt); this.moveCrowd(s, dt); }
    this.vehEnd(); this.pedP.commitPose();
    head.needsUpdate = true; this.headPts.geometry.setDrawRange(0, Math.min(320, this.cars.length)); tail.needsUpdate = true; tailC.needsUpdate = true; this.tailPts.geometry.setDrawRange(0, Math.min(320, this.cars.length));
    if (!s.rail) {
    // 列車：駅に停まってから発車
    if (this.trainWait > 0) this.trainWait -= dt;
    else {
      const stop = 20.5 * TILE - 31, before = this.trainX;
      this.trainX += dt * (Math.abs(this.trainX - stop) < 260 ? 14 + Math.abs(this.trainX - stop) * 0.12 : 46);
      if (before < stop && this.trainX >= stop) { this.trainX = stop; this.trainWait = 9; this.sfx('trainStop', stop, 0, this.train.position.z); }
      if (this.trainX > MAPW + 1500) { this.trainX = -1500; this.trainWait = 25; }
    }
    this.train.position.x = this.trainX;
    }
  }

  // ------------------------------------------------------------ カメラ
  /** 効果音の合図（花火の打ち上げ・破裂、列車の停車・発車など）。音を鳴らす側が受け取る */
  onSfx: ((k: string, x: number, y: number, z: number) => void) | null = null;
  private sfx(k: string, x: number, y: number, z: number): void { if (this.onSfx) try { this.onSfx(k, x, y, z); } catch { /* 音の失敗で描画を止めない */ } }
  private shipPos: number[] = []; // x, z, 種類（0 小・1 貨物・2 タンカー）
  private fwLast = [-1, -1, -1, -1, -1, -1];
  /** 音の計算に使う、いまの画面の様子 */
  audioInfo(): { tx: number; tz: number; dist: number; ground: boolean; cam: THREE.Vector3; right: THREE.Vector3; hour: number; night: number; calM: number; rain: number; snow: number; cloud: number; trains: number[]; cross: number[]; plane: number[] | null; heli: number[] | null; ships: number[]; fest: number[] | null; festOn: boolean } {
    const trains: number[] = [];
    if (this.getState().rail) for (const [k, tr] of this.trains.entries()) { const P = this.railPaths[tr.path]; if (!P || !this.trainLive(k)) continue; const [x, , z] = railAt(P, tr.d); trains.push(x, z, tr.wait > 0 ? 0 : 1); }
    else if (this.train.visible) trains.push(this.train.position.x, this.train.position.z, this.trainWait > 0 ? 0 : 1);
    const cross: number[] = []; for (const t of this.crossClosed) cross.push((t % W + 0.5) * TILE, (((t / W) | 0) + 0.5) * TILE);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const pl = this.plane && this.plane.visible ? this.plane.position : null, he = this.heli && this.heli.visible ? this.heli.position : null;
    return { tx: this.target.x, tz: this.target.z, dist: this.dist, ground: this.mode === 'ground', cam: this.camera.position, right, hour: this.hour, night: this.night, calM: this.calM,
      rain: this.weather.rain, snow: this.weather.snow, cloud: this.weather.cloud, trains, cross, plane: pl ? [pl.x, pl.y, pl.z] : null, heli: he ? [he.x, he.y, he.z] : null,
      ships: this.shipPos, fest: this.festAt ? [this.festAt.x, this.festAt.y, this.festAt.z] : null, festOn: this.festOn(this.getState()) };
  }
  focus(tile: number, dist?: number): void {
    this.want.x = (tile % W + 0.5) * TILE; this.want.z = (((tile / W) | 0) + 0.5) * TILE;
    if (dist) this.want.dist = dist; else this.want.dist = Math.min(this.want.dist, 420);
    if (this.mode === 'ground') { this.ground.x = this.want.x; this.ground.z = this.want.z + 20; }
  }
  setMode(mode: 'orbit' | 'ground'): void {
    if (mode === 'ground' && this.mode !== 'ground') {
      // いま見ている地点に最も近い道路へ降りる
      const s = this.getState(); let best = -1, bd = 1e9;
      for (const i of this.roadTiles) { if (s.road[i] === 3) continue; const d = Math.hypot((i % W + 0.5) * TILE - this.target.x, (((i / W) | 0) + 0.5) * TILE - this.target.z); if (d < bd) { bd = d; best = i; } }
      if (best >= 0) { this.ground.x = (best % W + 0.5) * TILE + 3.6; this.ground.z = (((best / W) | 0) + 0.5) * TILE + 3.6; }
      this.ground.yaw = this.yaw + Math.PI; this.ground.pitch = 0;
      if (REAL) {
        // 実際の道路の線の上（歩道側）に降りる
        if (!this.paths.length) this.paths = realPaths();
        let bd2 = 1e18;
        for (const p of this.paths) for (let k = 1; k < p.pts.length / 2; k++) {
          const x = p.pts[k * 2], z = p.pts[k * 2 + 1], d = (x - this.target.x) ** 2 + (z - this.target.z) ** 2;
          if (d < bd2) { bd2 = d; const dx = x - p.pts[k * 2 - 2], dz = z - p.pts[k * 2 - 1], L = Math.hypot(dx, dz) || 1, off = [3.5, 5.5, 7.5, 9.5, 11.5, 13][p.cls] / 2 + 0.8; this.ground.x = x + dz / L * off; this.ground.z = z - dx / L * off; this.ground.yaw = Math.atan2(dx, dz); }
        }
      }
    }
    if (mode === 'orbit' && this.mode === 'ground') { this.want.x = this.ground.x; this.want.z = this.ground.z; }
    this.mode = mode;
  }
  /** 津波の演出：海から陸へ、浸水する区画に濁った水が順に広がり、しばらくして引いていく */
  private tsSeen = -2; private tsT = -1; private tsBands: THREE.Mesh[] = [];
  private matTs = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.82, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  tsunamiFx(s: GameState, wave: number): void {
    for (const m of this.tsBands) { this.scene.remove(m); m.geometry.dispose(); } this.tsBands = [];
    const dep = tsunamiDepth(s, wave), NB = 14, geos = Array.from({ length: NB }, () => new Geo()), m = this.map;
    let maxD = 1; for (let i = 0; i < N; i++) if (dep[i] > 0) maxD = Math.max(maxD, seaDist(s, i));
    for (let i = 0; i < N; i++) {
      if (dep[i] <= 0.05) continue;
      const b = Math.min(NB - 1, Math.floor(seaDist(s, i) / maxD * NB)), x = i % W, y = (i / W) | 0, lift = Math.min(6, 0.6 + dep[i] * 0.6), g = geos[b];
      const X0 = x * TILE, X1 = X0 + TILE, Z0 = y * TILE, Z1 = Z0 + TILE, h = (xx: number, zz: number) => heightAt(m, xx, zz) + lift;
      g.quad([X0, h(X0, Z1), Z1], [X1, h(X1, Z1), Z1], [X1, h(X1, Z0), Z0], [X0, h(X0, Z0), Z0], 0x7f9c94);
    }
    for (const g of geos) { if (!g.pos.length) continue; const mesh = new THREE.Mesh(g.build(), this.matTs); mesh.visible = false; mesh.renderOrder = 3; this.scene.add(mesh); this.tsBands.push(mesh); }
    this.tsT = 0;
  }
  private moveTsunami(s: GameState, dt: number): void {
    const lt = s.lastTsunami;
    if (this.tsSeen === -2) this.tsSeen = lt ? lt.m : -1; // 読み込んだときの古い津波は流さない
    else if (lt && lt.m !== this.tsSeen) { this.tsSeen = lt.m; if (s.month - lt.m <= 1) { this.tsunamiFx(s, lt.h); this.want.dist = Math.max(this.want.dist, 1400); } }
    if (this.tsT < 0) return;
    this.tsT += dt; const t = this.tsT, n = this.tsBands.length;
    this.tsBands.forEach((m, k) => { m.visible = t > k * 1.1 && t < 26 + k * 0.6; });
    this.matTs.opacity = 0.82 * Math.min(1, Math.max(0, (34 - t) / 8));
    if (t > 36 || !n) { for (const m of this.tsBands) { this.scene.remove(m); m.geometry.dispose(); } this.tsBands = []; this.tsT = -1; this.matTs.opacity = 0.82; }
  }
  /** 住民の車を追いかける（-1 で追わない） */
  followCar = -1; followPos = new THREE.Vector3();
  follow(on: boolean): boolean {
    if (!on || !this.cars.length) { this.followCar = -1; return false; }
    this.followCar = Math.floor(Math.random() * this.cars.length); this.followPos.set(this.want.x, 0, this.want.z); this.want.dist = Math.min(this.want.dist, 170); this.want.pitch = Math.min(this.want.pitch, 0.6);
    return true;
  }
  private updateCamera(dt: number): void {
    if (this.followCar >= 0) { if (this.followCar >= this.cars.length || this.mode !== 'orbit') this.followCar = -1; else { const w = this.want, f = Math.min(1, dt * 3); w.x += (this.followPos.x - w.x) * f; w.z += (this.followPos.z - w.z) * f; } }
    const k = this.keys, m = this.map;
    const f = (a: string, b: string) => (k.has(a) || k.has(b) ? 1 : 0);
    const fwd = f('w', 'arrowup') - f('s', 'arrowdown'), right = f('d', 'arrowright') - f('a', 'arrowleft'), turn = (k.has('e') ? 1 : 0) - (k.has('q') ? 1 : 0), zoom = (k.has('f') ? 1 : 0) - (k.has('r') ? 1 : 0);
    if (this.mode === 'orbit') {
      const w = this.want, sp = w.dist * 0.9 * dt;
      w.x += (-Math.sin(w.yaw) * fwd + Math.cos(w.yaw) * right) * sp; w.z += (-Math.cos(w.yaw) * fwd - Math.sin(w.yaw) * right) * sp;
      w.yaw += turn * dt * 1.4; w.dist *= Math.exp(zoom * dt * 1.4);
      w.x = Math.max(-200, Math.min(MAPW + 200, w.x)); w.z = Math.max(-100, Math.min(MAPH + 100, w.z));
      w.dist = Math.max(45, Math.min(REAL ? 5200 : Math.round(2600 * Math.max(1, W / 76)), w.dist)); /* v87：広げた住野市（128 列）は全体が入るまで引ける */ w.pitch = Math.max(0.16, Math.min(1.5, w.pitch));
      const a = 1 - Math.exp(-dt * 10);
      this.target.x += (w.x - this.target.x) * a; this.target.z += (w.z - this.target.z) * a; this.dist += (w.dist - this.dist) * a; this.yaw += (w.yaw - this.yaw) * a; this.pitch += (w.pitch - this.pitch) * a;
      this.target.y = heightAt(m, Math.max(0, Math.min(MAPW, this.target.x)), Math.max(0, Math.min(MAPH, this.target.z)));
      const cp = Math.cos(this.pitch);
      this.camera.position.set(this.target.x + Math.sin(this.yaw) * cp * this.dist, this.target.y + Math.sin(this.pitch) * this.dist, this.target.z + Math.cos(this.yaw) * cp * this.dist);
      const gh = heightAt(m, Math.max(0, Math.min(MAPW, this.camera.position.x)), Math.max(0, Math.min(MAPH, this.camera.position.z)));
      if (this.camera.position.y < gh + 3) this.camera.position.y = gh + 3;
      this.camera.lookAt(this.target);
      this.camera.near = Math.max(1, this.dist / 160); this.camera.far = REAL ? 20000 : 14000;
      if (REAL) { const fog = this.scene.fog as THREE.Fog; fog.near = 900 + this.dist * 1.2; fog.far = 5200 + this.dist * 2.4; }
    } else {
      const g = this.ground, sp = (k.has('shift') ? 16 : 5) * dt;
      g.yaw -= turn * dt * 1.6;
      g.x += (Math.sin(g.yaw) * fwd - Math.cos(g.yaw) * right) * sp; g.z += (Math.cos(g.yaw) * fwd + Math.sin(g.yaw) * right) * sp;
      g.x = Math.max(2, Math.min(MAPW - 2, g.x)); g.z = REAL ? Math.max(2, Math.min(MAPH - 2, g.z)) : Math.max(62, Math.min((H - 5) * TILE, g.z));
      if (REAL) { const fog = this.scene.fog as THREE.Fog; fog.near = 600; fog.far = 3800; }
      g.pitch = Math.max(-0.6, Math.min(0.9, g.pitch));
      const y = heightAt(m, g.x, g.z) + 1.65;
      this.camera.position.set(g.x, y, g.z);
      this.camera.lookAt(g.x + Math.sin(g.yaw) * Math.cos(g.pitch), y + Math.sin(g.pitch), g.z + Math.cos(g.yaw) * Math.cos(g.pitch));
      this.camera.near = 0.3; this.camera.far = REAL ? 20000 : 14000;
      this.target.set(g.x, y, g.z);
    }
    if (Math.abs(this.camera.fov - this.fov) > 0.01) this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
  }
  /** ドラッグでの回転・移動・ズーム（入力側から呼ぶ） */
  orbitBy(dx: number, dy: number): void {
    if (this.mode === 'orbit') { this.want.yaw -= dx * 0.005; this.want.pitch += dy * 0.004; }
    else { this.ground.yaw -= dx * 0.004; this.ground.pitch -= dy * 0.003; }
  }
  panBy(dx: number, dy: number): void {
    this.followCar = -1;
    if (this.mode !== 'orbit') { this.orbitBy(dx, dy); return; }
    const w = this.want, k = w.dist * 0.0016;
    w.x += (-Math.cos(w.yaw) * dx - Math.sin(w.yaw) * dy / Math.max(0.35, Math.sin(w.pitch))) * k;
    w.z += (Math.sin(w.yaw) * dx - Math.cos(w.yaw) * dy / Math.max(0.35, Math.sin(w.pitch))) * k;
  }
  zoomBy(f: number): void { if (this.mode === 'orbit') this.want.dist *= f; else this.fov = Math.max(20, Math.min(80, this.fov * f)); }

  /** 画面座標 → タイル（地形との交点）。外れたら -1 */
  pick(clientX: number, clientY: number): number {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1), this.camera);
    let hx: number, hz: number;
    if (REAL) {
      // 地形の高さを辿って交点を探す（大きな地形メッシュとの交差判定は重いので）
      const o = this.ray.ray.origin, d = this.ray.ray.direction, m = this.map;
      const above = (t: number) => o.y + d.y * t - heightAt(m, Math.max(0, Math.min(MAPW, o.x + d.x * t)), Math.max(0, Math.min(MAPH, o.z + d.z * t)));
      let t0 = 0, t1 = -1;
      for (let t = 4; t < 20000; t += Math.max(4, t * 0.01)) { if (above(t) <= 0) { t1 = t; break; } t0 = t; }
      if (t1 < 0) return -1;
      for (let k = 0; k < 24; k++) { const tm = (t0 + t1) / 2; if (above(tm) > 0) t0 = tm; else t1 = tm; }
      hx = o.x + d.x * t1; hz = o.z + d.z * t1;
    } else {
      const hit = this.ray.intersectObject(this.terrain, false)[0];
      if (!hit) return -1;
      hx = hit.point.x; hz = hit.point.z;
    }
    const x = Math.floor(hx / TILE), y = Math.floor(hz / TILE);
    return inMap(x, y) ? idx(x, y) : -1;
  }

  // ------------------------------------------------------------ 毎フレーム
  /** 朝霧・雷・虹 */
  /** レアな景色（その日だけ）。rareForce は検証用 */
  rare = ''; rareForce = ''; private rareObj: Record<string, THREE.Object3D> = {};
  static RARE_NAMES: Record<string, string> = { meteor: '流星群', supermoon: 'スーパームーン', aurora: '低緯度オーロラ', blimp: '飛行船', balloon: '熱気球の大会', fuji: '遠くに見える富士山', double: '二重の虹' };
  /** いま画面で見られるレアな景色の名前（夜だけ・昼だけのものは時間で判定） */
  get rareNow(): string { const r = this.rare, night = this.night > 0.6; if (!r) return ''; if ((r === 'meteor' || r === 'supermoon' || r === 'aurora') !== night) return ''; return View.RARE_NAMES[r] ?? ''; }
  private updateRare(dt: number): void {
    const now = this.rareNow ? this.rare : '', T = this.target;
    for (const [k, o] of Object.entries(this.rareObj)) o.visible = k === now;
    if (!now) { (this.sunDisc.material as THREE.MeshBasicMaterial).color; return; }
    const mk = (k: string, f: () => THREE.Object3D) => (this.rareObj[k] ??= (() => { const o = f(); this.scene.add(o); return o; })());
    if (now === 'meteor' && Math.random() < dt * 1.8) this.fx.burst(T.x - 1500 + Math.random() * 3000, 1400 + Math.random() * 400, T.z - 1800, 'meteor', 1, 0);
    if (now === 'supermoon') this.sunDisc.scale.setScalar(1.35);
    if (now === 'blimp') { const o = mk('blimp', () => { const g = new THREE.Group(), b = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.6 })); b.scale.set(14, 9, 42); g.add(b); const gd = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 10), new THREE.MeshStandardMaterial({ color: 0x2a4ac8 })); gd.position.y = -10; g.add(gd); return g; }); const t = performance.now() / 1000; o.position.set(T.x + Math.sin(t * 0.03) * 900, 260, T.z + Math.cos(t * 0.03) * 900); o.rotation.y = t * 0.03 + Math.PI / 2; }
    if (now === 'balloon') { const o = mk('balloon', () => { const g = new THREE.Group(), C = [0xff4a4a, 0xffd23a, 0x4ab0ff, 0x6ee07a, 0xff7ad9, 0xff8a2a]; for (let k = 0; k < 9; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(9, 14, 10), new THREE.MeshStandardMaterial({ color: C[k % C.length], roughness: 0.7 })); b.scale.y = 1.2; b.position.set((k % 3) * 160 - 160, 0, Math.floor(k / 3) * 140 - 140); const bk = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), new THREE.MeshStandardMaterial({ color: 0x7a5a3a })); bk.position.set(b.position.x, -14, b.position.z); g.add(b, bk); } return g; }); const t = performance.now() / 1000; o.position.set(T.x, 120 + ((t * 6) % 300), T.z - 200); }
    if (now === 'fuji') { const o = mk('fuji', () => { const g = new THREE.Group(), m = new THREE.Mesh(new THREE.ConeGeometry(2600, 1500, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0x6f88a8, fog: false })); const top = new THREE.Mesh(new THREE.ConeGeometry(800, 470, 48), new THREE.MeshBasicMaterial({ color: 0xf4f8fc, fog: false })); top.position.y = 520; g.add(m, top); return g; }); o.position.set(T.x - 9000, 500, T.z - 9000); }
    if (now === 'aurora') { const o = mk('aurora', () => { const g = new THREE.Group(); for (let k = 0; k < 5; k++) { const geo = new THREE.PlaneGeometry(3000, 900, 24, 1), col: number[] = []; for (let i = 0; i < geo.attributes.position.count; i++) { const y = geo.attributes.position.getY(i); const c = new THREE.Color(y > 0 ? 0xff5a8a : 0x4aff9a); col.push(c.r, c.g, c.b); } geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })); m.position.set(-800 + k * 400, 1300 + k * 60, -4200 - k * 200); m.rotation.y = 0.2 * k; g.add(m); } return g; }); o.position.set(T.x, 0, T.z); o.children.forEach((m, k) => { m.position.x = -800 + k * 400 + Math.sin(performance.now() / 4000 + k) * 200; }); }
  }
  private updateSky2(dt: number): void {
    this.updateRare(dt);
    if (this.storm && this.weather.rain > 0.5) {
      this.flashT -= dt; if (this.flashT < -0.1 && Math.random() < dt * 0.15) { this.flashT = 0.18; const t = this.target; this.sfx('thunder', t.x, 400, t.z); }
      if (this.flashT > 0) { this.hemi.intensity += 3.5 * (this.flashT / 0.18); this.renderer.toneMappingExposure *= 1.25; }
    }
    if (this.rainbowT > 0 && this.mode === 'orbit') {
      this.rainbowT -= dt;
      if (!this.rainbow) { const g = new THREE.Group(), C = [0xff4040, 0xff9a30, 0xffe040, 0x50d060, 0x40a0ff, 0x6050e0, 0xa040d0]; C.forEach((c, k) => { const m = new THREE.Mesh(new THREE.TorusGeometry(2600 - k * 40, 22, 4, 64, Math.PI), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.22, fog: false, depthWrite: false })); g.add(m); }); this.rainbow = g; this.scene.add(g); }
      const a = Math.min(1, this.rainbowT / 10, (80 - this.rainbowT) / 5); this.rainbow.visible = a > 0.01; this.rainbow.children.forEach(m => (((m as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.22 * a));
      const away = new THREE.Vector3(-this.sunDir.x, 0, -this.sunDir.z).normalize(); this.rainbow.position.copy(this.target).addScaledVector(away, 4200).setY(-300); this.rainbow.lookAt(this.target.x, -300, this.target.z);
    } else if (this.rainbow) this.rainbow.visible = false;
  }
  /** 乗り物に乗る（電車の窓から・バスの窓から）。null で降りる */
  ride: 'train' | 'bus' | null = null; private rideFwd = new THREE.Vector3(0, 0, 1);
  private updateRide(): void {
    if (!this.ride) { if (this.headSpot) this.headSpot.intensity = 0; return; }
    const im = this.ride === 'train' ? this.rideTrain : this.buses;
    if (!im || im.count < 1 || this.mode !== 'orbit') { this.ride = null; return; }
    const m4 = new THREE.Matrix4(), pos = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    im.getMatrixAt(0, m4); m4.decompose(pos, q, sc);
    if (sc.x < 0.01) { this.ride = null; this.onRideEnd?.(); return; } // 終電が終わった（1〜5 時）
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize(); this.rideFwd.lerp(fwd, 0.15).normalize();
    // 運転席の窓の少し前（車体の中に目を置くと、屋根や壁の面がカメラのすぐ前で切れたり出たりして画面がちらつく）
    const eye = pos.clone().addScaledVector(this.rideFwd, this.ride === 'train' ? 10.2 : 6.4).add(new THREE.Vector3(0, this.ride === 'train' ? 3.0 : 2.6, 0));
    this.camera.position.copy(eye); this.camera.lookAt(eye.clone().addScaledVector(this.rideFwd, 60).add(new THREE.Vector3(0, -2, 0)));
    this.camera.near = 0.5; this.camera.updateProjectionMatrix(); // 見下ろしの距離に合わせた近い面（数 m）のままだと、ホームや電柱が手前で欠ける
    this.target.set(pos.x, 0, pos.z); this.want.x = pos.x; this.want.z = pos.z;
    // 夜は前照灯で前の線路・道路を照らす（一度だけ作って、乗っていないときは消す）
    if (!this.headSpot) { this.headSpot = new THREE.SpotLight(0xfff1d6, 0, 260, 0.42, 0.6, 1); this.scene.add(this.headSpot, this.headSpot.target); }
    const hs = this.headSpot; hs.position.copy(pos).addScaledVector(this.rideFwd, 10).add(new THREE.Vector3(0, 2.2, 0)); hs.target.position.copy(pos).addScaledVector(this.rideFwd, 70);
    hs.intensity = NIGHT_U.value * 80;
  }
  private headSpot: THREE.SpotLight | null = null;
  /** 乗り物が走らなくなって降りたとき（UI が知らせる） */
  onRideEnd: (() => void) | null = null;
  // ------------------------------------------------------------ v30 演出
  fx!: FX; private subMesh: THREE.Mesh | null = null; private tempMesh: THREE.Mesh | null = null; private streetMesh: THREE.Mesh | null = null; private prevSt = new Map<number, string>(); private seenEv = new Set<string>(); private blackT = 0; 
  /** 夜の看板の光・鳥の群れ・小舟・ヘリの場所を、街に合わせて置き直す */
  /** 窓ガラスや水に映す空：空の上・地平線・地面の色と街の明かりから小さな全天の画像を作り、ぼかし具合ごとに用意する（色が変わったときだけ、間隔をあけて） */
  private envGen: THREE.PMREMGenerator | null = null; private envRT: THREE.WebGLRenderTarget | null = null; private envKey = ''; private envAt = 0;
  private envData = new Uint8Array(64 * 32 * 4); private envTex = (() => { const t = new THREE.DataTexture(this.envData, 64, 32, THREE.RGBAFormat); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.magFilter = THREE.LinearFilter; return t; })();
  private updateEnv(top: THREE.Color, hor: THREE.Color, gnd: THREE.Color, day: number, night: number): void {
    if (this.quality === 'low') return;
    const key = [top, hor, gnd].map(c => [c.r, c.g, c.b].map(v => Math.round(Math.sqrt(Math.max(0, v)) * 14)).join(',')).join('/') + Math.round(night * 6), now = performance.now(); // 色の段階が変わったときだけ（作り直しは重い）
    if (key === this.envKey || now - this.envAt < 4000) return; this.envKey = key; this.envAt = now;
    const d = this.envData, a = new THREE.Color(), cl = new THREE.Color(0xffc070);
    for (let y = 0; y < 32; y++) { const v = 1 - (y + 0.5) / 32, el = (v - 0.5) * Math.PI; // 上が +
      for (let x = 0; x < 64; x++) { if (el > 0) a.copy(hor).lerp(top, Math.pow(Math.min(1, el / 1.2), 0.6)); else { a.copy(gnd).multiplyScalar(0.55 + 0.45 * day); const k = Math.max(0, 1 + el / 0.35); a.lerp(hor, k * 0.6); if (night > 0.3 && el > -0.25) a.lerp(cl, 0.25 * night * (1 - Math.abs(el) / 0.25) * (0.6 + 0.4 * hash(x, y, 77))); } // 夜は地平線の下に街明かり
        const o = (y * 64 + x) * 4; d[o] = Math.min(255, a.r * 255); d[o + 1] = Math.min(255, a.g * 255); d[o + 2] = Math.min(255, a.b * 255); d[o + 3] = 255; } }
    // 色は sRGB として入れる（Color は線形なので戻す）
    for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) { const l = d[i + j] / 255; d[i + j] = Math.round(255 * (l <= 0.0031308 ? 12.92 * l : 1.055 * Math.pow(l, 1 / 2.4) - 0.055)); }
    this.envTex.needsUpdate = true;
    try { if (!this.envGen) this.envGen = new THREE.PMREMGenerator(this.renderer); const rt = this.envGen.fromEquirectangular(this.envTex); this.envRT?.dispose(); this.envRT = rt;
      for (const m of [this.matWinA, this.matWinB, this.matWater, this.matSea, this.matRoad]) { m.envMap = rt.texture; if (!m.userData.env) { m.needsUpdate = true; m.userData.env = 1; } }
      this.matWinA.envMapIntensity = 0.3 + 0.6 * day; this.matWinB.envMapIntensity = 0.25 + 0.5 * day; this.matWater.envMapIntensity = this.matSea.envMapIntensity = 0.6 + 0.6 * day; } catch { /* 作れない環境では映り込みなし */ }
  }
  /** 夜の明かりの種類を区画ごとに決めて画像にする（シェーダーが読む）。建物の地面の高さも入れて、何階かを数えられるようにする */
  private buildLightProfile(s: GameState): void {
    const prof = (k: Kind): number => { const d = DEFS[k], c = d.cat as string;
      if (k === 'univHospital' || k === 'clinic' || k === 'maternity' || k === 'nightClinic' || k === 'police' || k === 'koban' || k === 'fire' || k === 'station' || k === 'konbini' || k === 'airport' || k === 'maglevStation' || k === 'waterBus') return 5;
      if (k === 'yokocho' || k === 'nightDistrict' || k === 'fuzokuDistrict' || k === 'pachinko' || k === 'casino' || k === 'liveHouse' || k === 'yakatabune' || k === 'cruisePier') return 8;
      if (k === 'hotel' || k === 'onsen' || k === 'bizHotel' || k === 'luxuryHotel' || k === 'ryokan') return 6;
      if (isRes(k)) return 1;
      if (isShop(k) || c === 'leisure' || c === 'commerce') return 3;
      if (c === 'biz' || k === 'officeS' || k === 'officeM' || k === 'skyscraper' || k === 'globalIT' || k === 'tvStation' || k === 'futureTower') return 2;
      if (c === 'edu' || c === 'gov' || c === 'kids' || c === 'park' || c === 'history' || c === 'funeral' || c === 'health' || k === 'consulate' || k === 'university') return 4;
      if (c === 'infra' || c === 'industry' || /factory|Factory|logist|Depot|warehouse|autoHub/.test(k)) return 7;
      return 0; };
    const d = new Uint8Array(W * H * 4);
    for (const b of s.buildings) { if (b.status === 'construction') continue; const pr = prof(b.kind), gy = Math.max(0, Math.min(255, Math.round((this.place(s, b).y + 20) * 3)));
      // 古さ（0〜255）：市の施設は老朽度、民間は築年数（60 年で最大）。雨だれ・黒ずみ・苔の濃さに使う
      const ag = Math.round(255 * Math.max(0, Math.min(1, isCity(b.kind) ? (b.age ?? 0) / 100 : (s.month - (b.builtMonth ?? s.month)) / 720)));
      for (let yy = b.y; yy < b.y + b.h; yy++) for (let xx = b.x; xx < b.x + b.w; xx++) if (xx >= 0 && yy >= 0 && xx < W && yy < H) { const o = (yy * W + xx) * 4; d[o] = pr; d[o + 1] = gy; d[o + 2] = ag; d[o + 3] = 255; } }
    const old = NIGHT_UNI.uProf.value; const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat); t.magFilter = t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
    NIGHT_UNI.uProf.value = t; NIGHT_UNI.uMapSz.value.set(W * TILE, H * TILE); if (old !== PROF_TEX) old.dispose();
  }
  private decorate(s: GameState): void {
    const glow: { x: number; y: number; z: number; c: number; s: number }[] = [], NEON = [0xff4f9a, 0x4fe0ff, 0xffd34f, 0xff8a3a, 0x9a7bff, 0x6cff9a];
    for (const b of s.buildings) {
      if (b.status !== 'operating') continue; const d = DEFS[b.kind], c = d.cat as string;
      const lit = isShop(b.kind) || c === 'biz' || c === 'leisure' || c === 'landmark' || b.kind === 'station' || b.kind === 'hotel' || b.kind === 'towerMansion' || b.kind === 'skyscraper' || b.kind === 'hqTower';
      if (!lit) continue; const p = this.place(s, b), hgt = MODEL_H[b.kind] ?? 8, k = (b.id * 7) % NEON.length;
      glow.push({ x: p.x, y: p.y + Math.min(hgt * 0.85, hgt - 1) + 1, z: p.z, c: b.kind === 'station' ? 0xfff0c0 : NEON[k], s: 9 + 5 * Math.sqrt(b.w * b.h) });
      if (hgt > 40) glow.push({ x: p.x, y: p.y + hgt + 2, z: p.z, c: 0xff3030, s: 14 }); // 高い建物の航空障害灯
      if (glow.length >= 390) break;
    }
    // 地下鉄の新線：駅前と会社の多い所に出入口（工事中は工事の囲いとクレーン）
    { if (this.subMesh) { this.scene.remove(this.subMesh); this.subMesh.geometry.dispose(); this.subMesh = null; }
      const sub = (s.pol as any)?.rail?.subway as { start: number; done?: boolean } | undefined;
      if (sub && !REAL) { const g = new Geo(), byId = new Map(s.buildings.map(b => [b.id, b]));
        const big = s.buildings.filter(b => b.status === 'operating' && (b.kind === 'station' || ['department', 'mall', 'hqTower', 'futureTower', 'officeM', 'office', 'skyscraper', 'cityHall'].includes(b.kind))).sort((a, b) => (b.kind === 'station' ? 1e6 : 0) + (DEFS[b.kind].jobs ?? 0) - ((a.kind === 'station' ? 1e6 : 0) + (DEFS[a.kind].jobs ?? 0)));
        const sites: { x: number; z: number; rot: number }[] = [];
        for (const b of big) { if (sites.length >= 6) break; let best = -1, bd = 1e9; for (let yy = b.y - 1; yy <= b.y + b.h; yy++) for (let xx = b.x - 1; xx <= b.x + b.w; xx++) { if (!inMap(xx, yy)) continue; const i = idx(xx, yy); if (!s.road[i] || s.road[i] === 3) continue; const d = Math.abs(xx - (b.x + b.w / 2)) + Math.abs(yy - (b.y + b.h / 2)); if (d < bd) { bd = d; best = i; } }
          if (best < 0) continue; const rx = best % W, ry = (best / W) | 0, dx = Math.sign(b.x + b.w / 2 - rx - 0.5), dz = Math.sign(b.y + b.h / 2 - ry - 0.5), x = (rx + 0.5) * TILE + dx * 11, z = (ry + 0.5) * TILE + dz * 11;
          if (sites.some(p => Math.hypot(p.x - x, p.z - z) < 120)) continue; sites.push({ x, z, rot: Math.abs(dx) >= Math.abs(dz) ? Math.PI / 2 : 0 }); }
        for (const p of sites) { const y = heightAt(this.map, p.x, p.z); g.at(p.x, y, p.z, p.rot);
          if (sub.done) { g.box(0, 0, 0, 3.4, 2.7, 6.8, 0xb8c4cc, 0x5a6672); g.box(0, 2.7, 0, 4.0, 0.25, 7.4, 0x5a6672); g.box(0, 0, 3.41, 2.4, 2.2, 0.05, 0x2a3440); g.cyl(2.6, 0, -3.2, 0.09, 3.4, 0x8b9094, 4); g.cyl(2.6, 3.4, -3.2, 0.75, 0.16, 0x1f6fd8, 12); glow.push({ x: p.x, y: y + 3.6, z: p.z, c: 0x3a8cff, s: 9 }); }
          else { const t = 0.08; for (const [a, b2, w2, d2] of [[0, -7, 14, t], [0, 7, 14, t], [-7, 0, t, 14], [7, 0, t, 14]] as [number, number, number, number][]) { g.box(a, 0, b2, w2, 2.2, d2, 0xe8e8e4); g.box(a, 1.6, b2, w2 + 0.02, 0.3, d2 + 0.02, 0xe8862a); }
            g.box(0, 0.05, 0, 12, 0.2, 12, 0x8a6f4f); g.box(-4, 0, -4, 0.8, 16, 0.8, 0xe2b12c); g.box(1, 16, -4, 12, 0.6, 0.6, 0xe2b12c); g.box(4, 0, 3, 2.4, 1.3, 3.4, 0xe2b12c); } }
        if (g.pos.length) { this.subMesh = new THREE.Mesh(g.build(false), this.matBody); this.subMesh.castShadow = !this.lite; this.subMesh.receiveShadow = true; this.scene.add(this.subMesh); } void byId; } }
    // 祭りの月は、駅前の通りにちょうちん
    if (s.celeb?.kind === 'festival' && s.month - s.celeb.month <= 1) { const st = s.buildings.find(b => b.kind === 'station'); if (st) for (let i = 0; i < s.road.length && glow.length < 398; i++) { if (!s.road[i]) continue; const x = i % W, y = (i / W) | 0; if (Math.abs(x - st.x) + Math.abs(y - st.y) > 7) continue; const px = (x + 0.5) * TILE, pz = (y + 0.5) * TILE; glow.push({ x: px - 9, y: heightAt(this.map, px, pz) + 5, z: pz, c: 0xff5030, s: 7 }, { x: px + 9, y: heightAt(this.map, px, pz) + 5, z: pz, c: 0xffa040, s: 7 }); } }
    this.fx.setGlow(glow);
    // 復興中は、市役所か駅の近くの空き地に仮設住宅が並ぶ
    { if (this.tempMesh) { this.scene.remove(this.tempMesh); this.tempMesh.geometry.dispose(); this.tempMesh = null; }
      const r = s.pol?.rec; if (r && (!r.until || s.month < r.until)) { const c0 = s.buildings.find(b => b.kind === 'cityHall') ?? s.buildings.find(b => b.kind === 'station'); if (c0) { const g = new Geo(); let n = 0, want = Math.min(8, 2 + Math.round(r.lost / 60));
        for (let d = 1; d < 14 && n < want; d++) for (let dy = -d; dy <= d && n < want; dy++) for (let dx = -d; dx <= d && n < want; dx++) { if (Math.max(Math.abs(dx), Math.abs(dy)) !== d) continue; const x = c0.x + dx, y = c0.y + dy; if (!inMap(x, y)) continue; const i = idx(x, y); if (s.road[i] || s.occ[i] || s.zone[i] || !buildable(this.map, i)) continue; const cx = (x + 0.5) * TILE, cz = (y + 0.5) * TILE, hy = heightAt(this.map, cx, cz); g.at(cx, hy, cz);
          for (let k = 0; k < 3; k++) { g.box(0, 0, -9 + k * 9, 24, 2.7, 5, 0xeef0ee, 0x5a86b8); } n++; }
        if (g.pos.length) { this.tempMesh = new THREE.Mesh(g.build(false), this.matBody); this.tempMesh.castShadow = true; this.tempMesh.receiveShadow = true; this.scene.add(this.tempMesh); } } } }
    // 街並み：商店街の道には季節の旗（のぼり）、住宅街の道には街路樹、会社の多い通りには街灯の列
    { if (this.streetMesh) { this.scene.remove(this.streetMesh); this.streetMesh.geometry.dispose(); this.streetMesh = null; }
      if (!REAL) { const g = new Geo(), byId = new Map(s.buildings.map(b => [b.id, b])), cap = this.lite ? 160 : 520, FL = [0xd8382c, 0x2a7fe0, 0xe8a020, 0x2aa060, 0xd040a0]; let n = 0;
        for (let i = 0; i < s.road.length && n < cap; i++) { if (s.road[i] !== 1 && s.road[i] !== 2) continue; const x = i % W, y = (i / W) | 0;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + dx, yy = y + dy; if (!inMap(xx, yy)) continue; const o = s.occ[idx(xx, yy)]; if (!o) continue; const b = byId.get(o); if (!b || b.status !== 'operating') continue;
            const px = (x + 0.5 + dx * 0.4) * TILE + (dy ? 9 : 0), pz = (y + 0.5 + dy * 0.4) * TILE + (dx ? 9 : 0), hy = heightAt(this.map, px, pz), r = hash(x * 3 + dx, y * 3 + dy, 91);
            if (isShop(b.kind) && (x + y) % 2 === 0) { g.at(px, hy, pz); g.cyl(0, 0, 0, 0.08, 4.2, 0xdddddd, 4); g.box(0.45, 2.2, 0, 0.9, 1.9, 0.05, FL[(x * 7 + y) % FL.length]); n++; }
            else if (isRes(b.kind) && r < 0.3) { g.at(px, hy, pz); tree(this.treeCtx(g), 0, 0, 0.62, (x * 7 + y * 3) % 5 === 0 ? 2 : 0); n++; } // v79：玉ひとつの木をやめ、ほかと同じ木の形に（色は季節で変わる）
            else if ((DEFS[b.kind].cat === 'biz' || DEFS[b.kind].cat === 'industry' || DEFS[b.kind].cat === 'commerce') && (x + y) % 2 === 1) { g.at(px, hy, pz); g.cyl(0, 0, 0, 0.1, 6, 0x8b8f93, 4); g.box(0, 6, 0.6, 0.5, 0.25, 1.4, 0xfff2c8); n++; }
            break; } }
        if (g.pos.length) { this.streetMesh = new THREE.Mesh(g.build(false), this.matBody); this.streetMesh.castShadow = !this.lite; this.streetMesh.receiveShadow = true; this.scene.add(this.streetMesh); } } }
    // 鳥：森の多い所と水辺。小舟：川・湖・海の水面を東西に行き来
    const m = this.map, fl: { x: number; z: number }[] = [], boats: { x: number; z: number; y: number }[][] = [];
    for (let y = 2; y < H; y += 9) for (let x = 2; x < W; x += 11) { const i = idx(x, y); if (m.forest[i] || m.water[i]) fl.push({ x: (x + 0.5) * TILE, z: (y + 0.5) * TILE }); }
    this.fx.setFlocks(fl.filter((_, k) => k % 3 === 0));
    // 鳩：公園と寺社の境内
    this.fx.setPigeons(s.buildings.filter(b => b.status === 'operating' && (b.kind === 'parkM' || b.kind === 'parkL' || b.kind === 'park' || b.kind === 'temple' || b.kind === 'shrine' || b.kind === 'grandShrine')).filter((_, k) => k % 2 === 0).map(b => { const x = (b.x + b.w / 2) * TILE + (b.kind === 'park' ? -3 : 0), z = (b.y + b.h / 2) * TILE + (b.kind === 'park' ? 3 : 6); return { x, y: heightAt(m, x, z) + 0.12, z }; }));
    for (let y = 0; y < H && boats.length < 10; y += 3) {
      let run: number[] = [];
      for (let x = 0; x <= W; x++) { const ok = x < W && m.water[idx(x, y)] && !(m.dug && m.dug[idx(x, y)]); if (ok) run.push(x); else { if (run.length >= 6) boats.push(run.filter((_, k) => k % 2 === 0).map(xx => ({ x: (xx + 0.5) * TILE, z: (y + 0.5) * TILE, y: y >= H - 4 ? -1.5 : -1.42 }))); run = []; } }
    }
    for (let x = 0; x < W && boats.length < 14; x += 4) { // 南北に流れる川
      let run: number[] = [];
      for (let y = 0; y <= H - 5; y++) { const ok = y < H - 5 && m.water[idx(x, y)]; if (ok) run.push(y); else { if (run.length >= 8) boats.push(run.filter((_, k) => k % 2 === 0).map(yy => ({ x: (x + 0.5) * TILE, z: (yy + 0.5) * TILE, y: -1.42 }))); run = []; } }
    }
    // 水上バス・遊覧船・屋形船：のりばのいちばん近い航路を、その船にする（遠ければ、のりばの前の水面に短い航路をつくる）
    const types = boats.map(() => 0);
    for (const b of s.buildings) {
      const ty = b.kind === 'waterBus' ? 1 : b.kind === 'cruisePier' ? 2 : b.kind === 'yakatabune' ? 3 : 0; if (!ty || b.status !== 'operating') continue;
      const cx = (b.x + b.w / 2) * TILE, cz = (b.y + b.h / 2) * TILE; let best = -1, bd = 330;
      boats.forEach((p, k) => { if (types[k]) return; for (const q of p) { const d = Math.hypot(q.x - cx, q.z - cz); if (d < bd) { bd = d; best = k; } } });
      if (best >= 0) { types[best] = ty; continue; }
      const wt: { x: number; z: number; y: number }[] = [];
      for (let dy = -4; dy <= b.h + 3; dy++) for (let dx = -4; dx <= b.w + 3; dx++) { const xx = b.x + dx, yy = b.y + dy; if (inMap(xx, yy) && m.water[idx(xx, yy)]) wt.push({ x: (xx + 0.5) * TILE, z: (yy + 0.5) * TILE, y: -1.42 }); }
      if (wt.length >= 3 && boats.length < 24) { const sx = Math.max(...wt.map(q => q.x)) - Math.min(...wt.map(q => q.x)), sz = Math.max(...wt.map(q => q.z)) - Math.min(...wt.map(q => q.z)); wt.sort((u, v) => sx >= sz ? u.x - v.x : u.z - v.z); boats.push(wt.filter((_, k) => k % 2 === 0)); types.push(ty); }
    }
    this.fx.setBoats(boats, types);
    this.fx.setHelis(s.buildings.filter(b => b.status === 'operating' && ['univHospital', 'tvStation', 'heliport', 'hospital'].includes(b.kind)).slice(0, 3).map(b => { const p = this.place(s, b); return { x: p.x, z: p.z, y: p.y }; }));
  }
  /** 建物の完成・災害の始まり・続いている火事や停電の演出（毎フレーム） */
  private dramatize(s: GameState, dt: number): void {
    // 完成：工事中から営業中になった建物に紙吹雪と、きらめき
    if (s.buildings.length !== this.prevSt.size || s.bVersion !== this.lastBV) {
      this.lastBV = s.bVersion; const first = this.prevSt.size === 0;
      for (const b of s.buildings) { const was = this.prevSt.get(b.id); if (!first && was === 'construction' && b.status === 'operating') { const p = this.place(s, b), hh = MODEL_H[b.kind] ?? 8; this.fx.burst(p.x, p.y + hh + 2, p.z, 'confetti', 120, 14); this.fx.burst(p.x, p.y + 1, p.z, 'sparkle', 40, 24); this.sfx('complete', p.x, p.y, p.z); } this.prevSt.set(b.id, b.status); }
    }
    // 災害の始まり（開いたときにもう起きていたものは演出しない）
    if (!this.evInit) { this.evInit = true; for (const e of s.events.active) this.seenEv.add(`${e.id}:${e.start}`); }
    for (const e of s.events.active) {
      const key = `${e.id}:${e.start}`; if (this.seenEv.has(key)) continue; this.seenEv.add(key);
      { const pl = emPlan(e.id); if (pl) this.dispatch(s, this.lite ? pl.slice(0, 3) : pl, e.target); } // v87：できごとの現場へ出動
      const big = e.id === 'nankai' ? 3 : e.id === 'megaQuake' ? 2.2 : e.id === 'quake' ? 1.4 : 0;
      if (big) {
        this.fx.shake(big, 2.5 + big);
        const res = s.buildings.filter(b => b.status === 'operating'); for (let k = 0; k < 10 + big * 8 && res.length; k++) { const b = res[Math.floor(Math.random() * res.length)], p = this.place(s, b); this.fx.burst(p.x, p.y + 1, p.z, 'dust', 14, 18); }
        this.blackT = 4 + big * 2;
      }
      if (e.id === 'typhoon' || e.id === 'megaRain' || e.id === 'linearRain') this.fx.shake(0.25, 3);
    }
    if (this.seenEv.size > 200) this.seenEv.clear();
    // 続いている災害：火事の煙と火の粉、台風の木の葉
    const act = s.events.active.map(e => e.id);
    for (const e of s.events.active) if (e.id === 'bigFire' || e.id === 'fireDelay') {
      const st = emSite(s, e.target, W, H, () => 0), b = st?.b ?? s.buildings.find(o => isRes(o.kind)); if (!b) continue; const p = this.place(s, b); // v87：対象は区画番号（前は建物 id として探していた）
      if (Math.random() < dt * 14) this.fx.burst(p.x, p.y + 6, p.z, 'smoke', 1, 6); if (Math.random() < dt * 10) this.fx.burst(p.x, p.y + 4, p.z, 'spark', 2, 4);
    }
    // 季節：4 月は桜の花びら、11 月は落ち葉が、カメラのまわりに舞う
    if ((this.calM === 3 || this.calM === 10) && this.mode === 'orbit' && Math.random() < dt * (this.lite ? 2 : 6)) { const t = this.target; this.fx.burst(t.x - 160 + Math.random() * 320, 20 + Math.random() * 40, t.z - 160 + Math.random() * 320, this.calM === 3 ? 'petal' : 'leaf', 2, 10); }
    if (act.includes('typhoon') && Math.random() < dt * 20) { const t = this.target; this.fx.burst(t.x - 200 + Math.random() * 120, 4, t.z - 150 + Math.random() * 300, 'leaf', 3, 30); }
    this.blackT = Math.max(0, this.blackT - dt);
  }
  private lastBV = -1; private evInit = false;
  /** 停電の強さ（0〜1）：停電の出来事の間と、大きな地震の直後 */
  private blackout(s: GameState): number { const a = s.events.active.some(e => e.id === 'bigBlackout') ? 0.85 : s.events.active.some(e => e.id === 'blackout') ? 0.5 : 0; return Math.max(a, Math.min(1, this.blackT / 2)); }
  // v34：新幹線（高架を通過する列車と、ときどき駅に停まる列車）
  private shinMid: THREE.InstancedMesh | null = null; private shinNose: THREE.InstancedMesh | null = null;
  private shin = { u: 0, v: 0, dir: 1, stop: false, wait: 0, gap: 3, run: false };
  private moveShin(dt: number): void {
    const L = SHIN_LINES.find(l => l.open), NC = 8, CL = 25.2;
    if (!L) { if (this.shinMid) { this.shinMid.count = 0; this.shinNose!.count = 0; } return; }
    if (!this.shinMid) {
      // 新幹線は Blender の形（中間車と、長い鼻の先頭車）。長さは x 方向、先頭は +x
      const SPC = [0xf6f7f8, 0x2a3440, 0x1f4fa8, 0xd0d4d8, 0x3a3a3c, 0xfff6d8];
      const gm = new Geo(); carMesh(gm, VM.shin_mid, 0, 0, Math.PI / 2, (t) => SPC[t]);
      const gn = new Geo(); carMesh(gn, VM.shin_nose, 0, 0, Math.PI / 2, (t) => SPC[t]);
      this.shinMid = new THREE.InstancedMesh(gm.build(false), this.matBody, NC); this.shinNose = new THREE.InstancedMesh(gn.build(false), this.matBody, 2);
      for (const im of [this.shinMid, this.shinNose]) { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; im.castShadow = !this.lite; this.scene.add(im); }
    }
    const S = this.shin, vmax = 78, acc = 2.4;
    if (!S.run) { S.gap -= dt; if (S.gap <= 0) { S.run = true; S.dir = -S.dir; S.u = -S.dir * L.half; S.stop = !S.stop; S.v = vmax; S.wait = 0; } }
    if (S.run) {
      const toSt = -S.u * S.dir; // 駅（u=0）までの残り（前にあれば正）
      if (S.stop && toSt > 0) S.v = Math.min(vmax, Math.sqrt(2 * acc * Math.max(0.5, toSt)));
      if (S.stop && toSt <= 0.6 && S.wait <= 0 && S.v < 3) { S.wait = 9; S.v = 0; S.u = 0; this.sfx('trainStop', L.cx, L.hy, L.cz); }
      if (S.wait > 0) { S.wait -= dt; if (S.wait <= 0) { S.v = 0.5; S.u = S.dir * 0.8; } }
      else { if (S.stop && toSt < 0) S.v = Math.min(vmax, S.v + acc * dt * 1.4); const before = S.u; S.u += S.dir * S.v * dt; if (!S.stop && Math.sign(before) !== Math.sign(S.u)) this.sfx('shinPass', L.cx, L.hy, L.cz); }
      if (Math.abs(S.u) > L.half + NC * CL) { S.run = false; S.gap = 18 + Math.random() * 20; }
    }
    if (!S.run) { this.shinMid.count = 0; this.shinNose!.count = 0; return; }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), base = Math.atan2(-L.tz, L.tx);
    let nm = 0;
    for (let i = 0; i < NC; i++) {
      const u = S.u - S.dir * (i * CL + CL / 2), x = L.cx + L.tx * u, z = L.cz + L.tz * u, y = shinDeckY(this.map, L, u) + 1.5;
      const front = i === 0, back = i === NC - 1, yaw = base + (S.dir < 0 ? Math.PI : 0) + (back ? Math.PI : 0);
      q.setFromAxisAngle(up, yaw); m4.compose(new THREE.Vector3(x, y, z), q, one);
      if (front) this.shinNose!.setMatrixAt(0, m4); else if (back) this.shinNose!.setMatrixAt(1, m4); else this.shinMid.setMatrixAt(nm++, m4);
    }
    this.shinMid.count = nm; this.shinNose!.count = 2; this.shinMid.instanceMatrix.needsUpdate = true; this.shinNose!.instanceMatrix.needsUpdate = true;
  }
  // v29：バス路線を走るバス（路線ごとに本数に応じた台数。行きと帰りで車線を分ける）
  private buses: THREE.InstancedMesh | null = null; private busClock = 0;
  private moveBuses(s: GameState, dt: number): void {
    const rs = s.pol?.routes ?? [];
    if (!rs.length) { if (this.buses) this.buses.count = 0; return; }
    if (!this.buses) {
      const geo = (() => { const g = new Geo(), PC = [0xffffff, 0x1a1a1a, 0x1c2228, 0xfff6d8, 0xd02020, 0xffb030, 0x9aa0a6]; carMesh(g, VM.bus, 0, 0, 0, (t) => PC[t]); return g.build(); })(); // 市のバス路線も Blender のバス
      this.buses = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5 }), 64); this.buses.castShadow = true; this.buses.frustumCulled = false;
      this.buses.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(this.buses);
    }
    this.busClock += dt * 0.25; // 1 区画を 4 秒ほどで（ゲームの時間とは別。見た目だけ）
    const COL = [0xe0402a, 0x2a7fe0, 0x2aa060, 0xd09020, 0x9040c0, 0x20a0b0], m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    let n = 0; this.busSegs.length = 0;
    rs.forEach((r, k) => {
      const L = r.path.length; if (L < 2) return; const nb = Math.min(8, 1 + r.freq * 2);
      // 行って帰る道順を 1 周の輪にする（端では折り返し）。車と同じ車線の線を走る（左側通行・外側の車線）
      const seq = L > 2 ? [...r.path, ...r.path.slice(1, -1).reverse()] : [r.path[0], r.path[1]], M = seq.length, at = (q: number) => seq[((q % M) + M) % M];
      for (let j = 0; j < nb && n < 64; j++) {
        const u = (this.busClock + (j / nb) * M) % M, q0 = Math.floor(u), t = u - q0;
        const lp = this.lanePath(s, at(q0 - 1), at(q0), at(q0 + 1), at(q0 + 2), t, 0), x = lp.x, z = lp.z;
        const by = this.slopePose(q, x, z, lp.dx, lp.dz, Math.atan2(lp.dx, lp.dz), VEH_HL[1]) + 0.13; void up; // v95：坂では車体を傾ける
        if (this.dbgVeh) this.dbgVeh.push(x, z, lp.dx, lp.dz, 1);
        this.busSegs.push({ cur: at(q0), next: at(q0 + 1), t });
        m4.compose(new THREE.Vector3(x, by, z), q, new THREE.Vector3(VEH_K[1], VEH_K[1], VEH_K[1])); // 橋・陸橋・立体交差の上も路面に沿って走る
        this.buses!.setMatrixAt(n, m4); this.buses!.setColorAt(n, c.setHex(COL[k % COL.length])); n++;
      }
    });
    this.buses.count = n; this.buses.instanceMatrix.needsUpdate = true; if (this.buses.instanceColor) this.buses.instanceColor.needsUpdate = true;
  }
  /** 振り返り（タイムラプス）で描く街。null ならいまの街 */
  override: GameState | null = null;
  get canvas(): HTMLCanvasElement { return this.renderer.domElement; }
  frame(dt: number): void {
    const s = this.override ?? this.getState();
    if (this.clockRun) { this.hour = (this.hour + (dt * 24) / this.dayLength) % 24; }
    this.updateWeather(s, dt);
    this.applyTime();
    const id = sid(s);
    let old = 0; for (let i = 0; i < N; i++) if (s.road[i] && s.roadAge[i] > 70) old++; else if (s.road[i] && s.roadAge[i] > 40) old += 1000;
    let fac = 0; if (REAL) for (const b of s.buildings) if (!b.osm) fac += b.id + (b.kind === 'station' && b.status !== 'construction' ? 0.5 : 0); // 施設の敷地を横切る細い道を消すため。駅は完成で線路側に描く
    const stK = s.buildings.filter(b => b.kind === 'station').map(b => `${b.id}.${b.status === 'construction' ? 0 : 1}.${b.lv ?? 1}.${b.shin === undefined ? '-' : s.month >= b.shin ? 'o' : 'p'}`).join(','); // 駅ビル・新幹線は線路と一緒に描く
    { const mm = getMap(s.seed), ck = s.rail ? (s.railGrade ?? []).map((g, i) => (g === 3 && s.rail![i] ? i : -1)).filter(i => i >= 0).join(',') : ''; if (mm !== this.map || (!REAL && ck !== this.cutKey)) { this.map = mm; if (!REAL) this.buildLand(); this.chunkSig.clear(); this.sigRoad = ''; this.sigTown = ''; this.sigOverlay = ''; this.sigSites = ''; } } // 地形の造作
    if (this.infraV !== s.bVersion) { this.infraV = s.bVersion; this.infraK = infraKey(s); } // v87：鉄塔・発電所・変電所・共同溝が変わったら道路（送電線・無電柱化）を描き直す
    const sr = `${id}:${s.roadVersion}:${old}:${fac}:${stK}:${this.infraK}:${this.quality}:${this.lite ? 1 : 0}`; // v88：品質を切り替えたら道路も作り直す（low では細部を省く）
    if (sr !== this.sigRoad) { this.sigRoad = sr; this.rebuildRoads(s); this.sigOverlay = ''; }
    const st = `${id}:${s.bVersion}:${s.roadVersion}:${s.buildings.filter(b => isCity(b.kind) && b.age > 70).length}`;
    if (st !== this.sigTown) { this.sigTown = st; this.rebuildTown(s); this.buildLightProfile(s); this.sigOverlay = ''; }
    const ss = `${st}:${s.month}`;
    if (ss !== this.sigSites) { this.sigSites = ss; this.rebuildSites(s); this.decorate(s); }
    const so = `${ss}:${this.layer}:${s.pol?.routes?.length ?? 0}:${this.routeKey}:${this.showZones}${this.showArea}:${this.placeMode ? `${Math.floor(this.target.x / 300)},${Math.floor(this.target.z / 300)}` : ''}:${s.stats.waitlist.toFixed(1)}:${s.stats.maxVc.toFixed(3)}`;
    if (so !== this.sigOverlay) { this.sigOverlay = so; this.rebuildOverlay(s); }
    this.moveBuses(s, dt);
    this.moveShin(dt);
    { const lk = `${s.unlocked ? s.unlocked.join(',') : '-'}:${this.sigTown}`; if (lk !== this.lockKey) { this.lockKey = lk; this.rebuildLock(s); }
      // v88：全景（遠く）では、編入前の区域の暗幕と黄色い柵を薄くする（街の全景で地面の明るさの境目と黄色い線に見えていた）
      const fl = 1 - Math.max(0, Math.min(1, (this.dist - 1600) / 1800)); this.matLock.opacity = 0.3 * (0.35 + 0.65 * fl); this.matLockLine.opacity = 0.75 * fl; if (this.lockLine) this.lockLine.visible = fl > 0.02; }
    this.updateCamera(dt);
    this.updateRide(); // 遠近の切り替え（LOD）などに乗り物の視点を使う。最後にもう一度合わせ直す
    this.updateSky2(dt);
    this.updateLod(dt);
    this.dramatize(s, dt);
    { const bo = this.blackout(s), popK = 0.95 + 0.35 * Math.min(1, (s.stats?.pop ?? 0) / 40000); this.matWinA.emissiveIntensity *= (1 - 0.9 * bo) * popK * (0.97 + 0.03 * Math.sin(performance.now() / 700)); this.matLamp.opacity *= 1 - bo; this.matVend.opacity *= 1 - bo; this.fx.clock(this.hour % 24, this.calM); this.fx.update(dt, this.camera, this.night, bo); }
    this.camera.position.add(this.fx.shakeOffset());
    this.moveTsunami(s, dt);
    { const fog = this.scene.fog as THREE.Fog, pr = Math.max(this.weather.rain, this.weather.snow * 1.1); if (!REAL) { const ex = this.mode === 'orbit' ? Math.max(0, this.dist - 1500) : 0; fog.near = this.fogBase.near + ex; fog.far = this.fogBase.far + ex * 2; } /* v87：広い地図を引いて見るときは、霞を遠ざける */ fog.near *= 1 - 0.6 * pr; fog.far *= 1 - 0.5 * pr; } // 雨や雪の日は遠くがかすむ
    if (this.fogDay) { const fog = this.scene.fog as THREE.Fog, k = this.hour >= 4 && this.hour < 10 ? 1 - Math.max(0, (this.hour - 8) / 2) : 0; if (k > 0) { fog.near *= 1 - 0.85 * k; fog.far *= 1 - 0.78 * k; } } // 朝霧
    PEOPLE_TIME.value = (PEOPLE_TIME.value + Math.min(dt, 0.1)) % 3600; // 立っている人の身ぶり
    this.updatePaddy(s, dt);
    this.moveAgents(s, Math.min(dt, 0.1));
    this.updateRide(); // 電車・バスを動かした後に視点を合わせる（先に合わせると 1 コマ遅れて車体とずれ、画面がちらつく）
    // 影はカメラの注視点まわりだけに掛ける
    const range = this.mode === 'ground' ? 95 : this.ride ? 140 : Math.max(200, Math.min(900, this.dist * 0.8)); // 地上視点は狭い範囲にくっきりした影
    // v101：影の深さの範囲を太陽までの距離（2000m）の前後に詰める（前は 10〜4200m で、bias −0.0004 が約 1.7m のずれになり、縁石・柱・低い物の影が足元から離れたり消えたりした）。
    // normalBias は影の画素の大きさに合わせる（品質・範囲ごと）
    const sc = this.sun.shadow.camera; sc.left = -range; sc.right = range; sc.top = range; sc.bottom = -range; sc.near = Math.max(10, 2000 - range * 1.5 - 900); sc.far = 2000 + range * 1.5 + 300; sc.updateProjectionMatrix();
    this.sun.shadow.normalBias = Math.max(0.2, Math.min(1.2, 2 * range / this.sun.shadow.mapSize.x * 0.9));
    { const tx = 2 * range / this.sun.shadow.mapSize.x; this.sun.target.position.set(Math.round(this.target.x / tx) * tx, this.target.y, Math.round(this.target.z / tx) * tx); } // 影の画素の格子にそろえる（動かしたときのちらつきを抑える）
    this.sun.position.copy(this.sun.target.position).addScaledVector(this.sunDir, 2000);
    this.sky.position.copy(this.camera.position); this.stars.position.copy(this.camera.position);
    this.sunDisc.position.copy(this.camera.position).addScaledVector(this.sunDir, REAL ? 15000 : 8200); this.sunDisc.lookAt(this.camera.position);
    if (REAL) {
      this.clouds.visible = this.camera.position.y < 800;
      // 霧で見えない遠くの塊は描かない
      const fog = this.scene.fog as THREE.Fog, NCX = Math.ceil(W / REAL_CHUNK), lim = fog.far + REAL_CHUNK * TILE;
      for (const [k, meshes] of this.chunkMeshes) { const cx = ((k % NCX) + 0.5) * REAL_CHUNK * TILE, cz = (Math.floor(k / NCX) + 0.5) * REAL_CHUNK * TILE, vis = Math.hypot(cx - this.camera.position.x, cz - this.camera.position.z) < lim; for (const mm of meshes) mm.visible = vis; }
    }
    this.clouds.position.x += dt * 5; if (this.clouds.position.x > MAPW / 2 + 15000) this.clouds.position.x -= 15000;
    this.renderer.info.reset();
    if (this.usePost() || this.dof) this.ensureComposer().render(dt); else this.renderer.render(this.scene, this.camera);
    this.frames++; this.fpsT += dt;
    if (this.fpsT >= 1) { this.stats.fps = Math.round(this.frames / this.fpsT); this.frames = 0; this.fpsT = 0; this.stats.calls = this.renderer.info.render.calls; this.stats.tris = this.renderer.info.render.triangles; }
  }

  /** フォトモードの撮影（PNG の data URL） */
  capture(): string { if (this.usePost() || this.dof) this.ensureComposer().render(); else this.renderer.render(this.scene, this.camera); return this.renderer.domElement.toDataURL('image/png'); }

  /** 区画の中心（地面の高さ）を画面座標へ（検証スクリプト用） */
  tileToScreen(i: number): { x: number; y: number } { const x = (i % W + 0.5) * TILE, z = (((i / W) | 0) + 0.5) * TILE, p = this.project(x, heightAt(this.map, x, z), z), r = this.renderer.domElement.getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top }; }
  /** 地区名などを画面座標へ */
  project(wx: number, wy: number, wz: number): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(wx, wy, wz).project(this.camera), r = this.renderer.domElement.getBoundingClientRect();
    return { x: (v.x * 0.5 + 0.5) * r.width, y: (-v.y * 0.5 + 0.5) * r.height, visible: v.z < 1 && v.z > -1 };
  }
}
