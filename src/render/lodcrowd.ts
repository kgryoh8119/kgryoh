// v102：遠くの簡略な人・車（2 段の描き分けの「遠く」の側）。
// 近くは今までの精細な人（people.ts、1 人 約 900 三角形）と車（vehgen.ts）、上限を超えた分と遠くの分はここで描く。
// 人は 6 角の柱と頭（22 三角形）、車は車体と屋根の 2 つの箱（20 三角形）。影は落とさない。押したときの紹介（v98）は近くの精細な人・車だけ。
import * as THREE from 'three';

/** 簡略な人：足元 y=0、背丈 1.65m。体は白（インスタンスの色＝服の色を掛ける）、頭は暗い（髪） */
export function lowPersonGeo(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [];
  const tri = (a: number[], b: number[], c: number[], k: number) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(k, k, k); };
  const S = 6, r0 = 0.17, r1 = 0.21, y0 = 0, y1 = 1.42;
  for (let i = 0; i < S; i++) {
    const a0 = (i / S) * Math.PI * 2, a1 = ((i + 1) / S) * Math.PI * 2;
    const p = (a: number, r: number, y: number) => [Math.cos(a) * r, y, Math.sin(a) * r * 0.75];
    // 側面（下が脚で少し暗い）
    tri(p(a0, r0, y0), p(a1, r1, y1), p(a1, r0, y0), 0.62); tri(p(a0, r0, y0), p(a0, r1, y1), p(a1, r1, y1), 0.62);
    tri(p(a0, r1, y1), [0, y1 + 0.02, 0], p(a1, r1, y1), 0.9); // 肩
  }
  // 頭（8 面）
  const hy = 1.53, hr = 0.12, top = [0, hy + hr, 0], bot = [0, hy - hr, 0];
  for (let i = 0; i < 4; i++) { const a0 = (i / 4) * Math.PI * 2, a1 = ((i + 1) / 4) * Math.PI * 2, q0 = [Math.cos(a0) * hr, hy, Math.sin(a0) * hr], q1 = [Math.cos(a1) * hr, hy, Math.sin(a1) * hr];
    tri(q0, top, q1, 0.3); tri(q0, q1, bot, 0.45); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}
/** 簡略な車：長さ 1・幅 1・高さ 1 の単位（インスタンスの拡大で車・バス・自転車にする）。前が +z。窓は暗い帯 */
export function lowCarGeo(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry(), pos: number[] = [], col: number[] = [];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, k: number, kTop: number) => {
    const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const f = (a: number, b: number, c: number, d: number, kk: number) => { for (const i of [a, b, c, a, c, d]) { pos.push(...v[i]); col.push(kk, kk, kk); } };
    f(0, 3, 2, 1, k); f(4, 5, 6, 7, k); f(0, 4, 7, 3, k); f(1, 2, 6, 5, k); f(3, 7, 6, 2, kTop);
  };
  box(-0.5, 0.12, -0.5, 0.5, 0.58, 0.5, 1, 1);          // 車体
  box(-0.44, 0.58, -0.32, 0.44, 0.95, 0.22, 0.28, 0.9); // 屋根と窓（側面は暗い）
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals(); return g;
}

/** 簡略な形のインスタンス描画。begin → put を繰り返す → end */
export class LowSet {
  mesh: THREE.InstancedMesh; n = 0; readonly max: number;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3(); private c = new THREE.Color();
  private static up = new THREE.Vector3(0, 1, 0);
  constructor(geo: THREE.BufferGeometry, max: number, scene: THREE.Scene, emissive = 0) {
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }); // 面の向きをそろえる手間を省く（両面。三角形が少ないので軽い）
    if (emissive) { mat.emissive = new THREE.Color(emissive); mat.emissiveIntensity = 0; }
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.max = max;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.setColorAt(0, new THREE.Color(1, 1, 1)); this.mesh.instanceColor!.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.castShadow = false; this.mesh.receiveShadow = true; this.mesh.count = 0; scene.add(this.mesh);
  }
  begin(): void { this.n = 0; }
  put(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number, color: number): boolean {
    if (this.n >= this.max) return false;
    this.q.setFromAxisAngle(LowSet.up, yaw); this.v.set(x, y, z); this.sc.set(sx, sy, sz); this.m.compose(this.v, this.q, this.sc);
    this.mesh.setMatrixAt(this.n, this.m); this.mesh.setColorAt(this.n, this.c.setHex(color)); this.n++; return true;
  }
  end(): void { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true; }
}

// ---------------------------------------------------------------- 遠くを動く住民（精細な人・車の上限を超えた分）
/** 住民 1 人の移動（residents.ts の RTrip の、描くのに要る分だけ） */
export interface FarTrip { person: number; mode: number; role: number; from: number; to: number; prog: number; path?: number[] }
export interface FarMover { person: number; mode: number; path?: number[]; pi: number; cur: number; next: number; prev: number; goal: number; u: number; sp: number; col: number; side: number; y0: number; y1: number }
/** 動かすのに要る街の情報（scene が渡す） */
export interface FarEnv {
  road: ArrayLike<number>; W: number; H: number; TILE: number;
  surfY(x: number, z: number): number;
  /** 車の、道の中心から左の車線までの距離・歩道の位置（道の中心から） */
  laneOff(i: number): number; walkOff(i: number): number;
  /** 区画の流れの速さの倍率（渋滞で 1 より小さい） */
  slow(i: number): number;
  /** 見えるか（視錐台の中か）。見えない物は動かすだけで描かない */
  seen(x: number, z: number): boolean;
}
const CAR_COL = [0xf4f4f2, 0xf4f4f2, 0xf4f4f2, 0xc8ccd0, 0xc8ccd0, 0x24262a, 0x24262a, 0x3a4a6a, 0x8a2a2a, 0x6a6e72, 0xe8e2d0, 0x2f5a3a];
const PED_COL = [[0x2b3140, 0x3a3f4a, 0xe8e8e8, 0x2a2c33], [0x1e2a4a, 0xf2f2f2, 0x24305a], [0x1e2a4a, 0x2a2c33, 0xf2f2f2], [0x2b3140, 0x3a3f4a, 0xd8dce2, 0x5a6470], [0x8a7a6a, 0xb8a890, 0x6a7a8a], [0x9a8a7a, 0x6a6a72, 0xc8b8a0]];
const RM_WALK = 0, RM_BIKE = 1, RM_BUS = 2;
function h1(a: number): number { let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
/** 住民の移動のいまの区画（経路があれば進み具合の所、なければ家と行き先の間） */
export function tripTile(t: FarTrip, W: number): number {
  if (t.path && t.path.length) return t.path[Math.min(t.path.length - 1, Math.floor(t.prog * t.path.length))];
  const x = Math.round(t.from % W + (t.to % W - t.from % W) * t.prog), y = Math.round(((t.from / W) | 0) + (((t.to / W) | 0) - ((t.from / W) | 0)) * t.prog);
  return y * W + x;
}
export class FarFlow {
  movers: FarMover[] = [];
  constructor(public cars: LowSet, public peds: LowSet) {}
  /** 遠くに描く住民の一覧を合わせる（同じ人は位置を保つ。いなくなった人は消し、新しい人を足す） */
  sync(list: FarTrip[], env: FarEnv): void {
    const keep = new Map(this.movers.map(m => [m.person, m] as const)), out: FarMover[] = [];
    for (const t of list) {
      if (t.mode !== RM_WALK && t.mode !== RM_BIKE && t.mode !== 4) continue;
      const o = keep.get(t.person); if (o && o.mode === t.mode) { out.push(o); continue; }
      const m = this.make(t, env); if (m) out.push(m);
    }
    this.movers = out;
  }
  private make(t: FarTrip, env: FarEnv): FarMover | null {
    const W = env.W, ped = t.mode === RM_WALK; let cur = tripTile(t, W), pi = -1;
    if (t.path && t.path.length) pi = Math.min(t.path.length - 1, Math.floor(t.prog * t.path.length));
    const ok = (j: number) => j >= 0 && j < env.road.length && env.road[j] && !(ped && env.road[j] === 3);
    if (!ok(cur)) { cur = -1; const x0 = tripTile(t, W) % W, y0 = (tripTile(t, W) / W) | 0; for (let r = 1; r <= 3 && cur < 0; r++) for (let dy = -r; dy <= r && cur < 0; dy++) for (let dx = -r; dx <= r; dx++) { const x = x0 + dx, y = y0 + dy; if (x < 0 || y < 0 || x >= W || y >= env.H) continue; if (ok(y * W + x)) { cur = y * W + x; break; } } }
    if (cur < 0) return null;
    const r = h1(t.person), pal = ped ? PED_COL[Math.min(5, t.role)] : CAR_COL, col = pal[Math.floor(h1(t.person * 7 + 3) * pal.length)];
    const m: FarMover = { person: t.person, mode: t.mode, path: t.path, pi, cur, next: cur, prev: -1, goal: t.to, u: r, sp: ped ? 1.15 + r * 0.35 : t.mode === RM_BIKE ? 3.5 + r : 8 + r * 3, col, side: r < 0.5 ? 1 : -1, y0: 0, y1: 0 };
    this.advance(m, env, true); return m;
  }
  /** 次の区画を決める（経路があれば経路どおり、なければ行き先へ近づく向き。来た道へは戻らない） */
  private advance(m: FarMover, env: FarEnv, first = false): void {
    const W = env.W, ped = m.mode === RM_WALK, road = env.road;
    if (!first) { m.prev = m.cur; m.cur = m.next; }
    let nx = -1;
    if (m.path && m.pi >= 0) { // 経路の次の区画（隣でなければ経路を外れて近づく向きへ）
      const k = m.path.indexOf(m.cur, Math.max(0, m.pi - 1)); if (k >= 0) { m.pi = k; const c = m.path[k + 1]; if (c !== undefined && road[c] && (Math.abs(c - m.cur) === 1 || Math.abs(c - m.cur) === W) && !(ped && road[c] === 3)) nx = c; }
    }
    if (nx < 0) {
      const x = m.cur % W, y = (m.cur / W) | 0, gx = m.goal % W, gy = (m.goal / W) | 0; let bv = 1e9;
      for (const j of [m.cur + 1, m.cur - 1, m.cur + W, m.cur - W]) {
        if (j < 0 || j >= road.length || !road[j] || (ped && road[j] === 3) || (Math.abs((j % W) - x) > 1)) continue;
        let v = Math.abs(j % W - gx) + Math.abs(((j / W) | 0) - gy) + h1(j + m.person) * 0.8; if (j === m.prev) v += 6; void y;
        if (v < bv) { bv = v; nx = j; }
      }
    }
    if (nx < 0 || m.cur === m.goal) { // 着いた・行き止まり：経路の初めから（見えている住民の数を保つ。5 秒ごとに一覧が合わせ直される）
      nx = m.prev >= 0 ? m.prev : m.cur;
      if (m.path && m.path.length > 1 && m.cur === m.goal) { m.pi = 0; m.prev = -1; m.cur = m.path[0]; nx = m.path[1]; if (!road[m.cur] || !road[nx]) nx = m.cur; }
    }
    m.next = nx;
    const T = env.TILE, c = (i: number): [number, number] => [(i % W + 0.5) * T, (((i / W) | 0) + 0.5) * T];
    const [ax, az] = c(m.cur), [bx, bz] = c(m.next); m.y0 = env.surfY(ax, az); m.y1 = env.surfY(bx, bz);
  }
  /** 動かして描く。cam から near より内側は精細な人・車がいるので描かない（重なり防止） */
  step(dt: number, env: FarEnv, camX: number, camZ: number, near: number, far: number): void {
    const W = env.W, T = env.TILE, n2 = near * near, f2 = far * far;
    for (const m of this.movers) {
      const ped = m.mode === RM_WALK;
      m.u += dt * m.sp * (ped ? 1 : env.slow(m.cur)) / T;
      let g = 0; while (m.u >= 1 && g++ < 3) { m.u -= 1; this.advance(m, env); }
      const ax = (m.cur % W + 0.5) * T, az = (((m.cur / W) | 0) + 0.5) * T, bx = (m.next % W + 0.5) * T, bz = (((m.next / W) | 0) + 0.5) * T;
      let dx = bx - ax, dz = bz - az; const L = Math.hypot(dx, dz);
      if (L > 0) { dx /= L; dz /= L; } else { dx = 0; dz = 1; }
      const off = ped ? env.walkOff(m.cur) * m.side : env.laneOff(m.cur);
      const x = ax + (bx - ax) * m.u + dz * off, z = az + (bz - az) * m.u - dx * off;
      const d2 = (x - camX) ** 2 + (z - camZ) ** 2; if (d2 < n2 || d2 > f2 || !env.seen(x, z)) continue;
      const y = m.y0 + (m.y1 - m.y0) * m.u, yaw = Math.atan2(dx, dz);
      if (ped) this.peds.put(x, y + 0.1, z, yaw, 1, 1, 1, m.col);
      else if (m.mode === RM_BIKE) this.cars.put(x, y, z, yaw, 0.55, 1.75, 1.75, m.col);
      else if (m.mode === RM_BUS) this.cars.put(x, y, z, yaw, 2.5, 3.1, 10.5, 0xf2f2ee);
      else this.cars.put(x, y + 0.05, z, yaw, 1.7, 1.55, 4.3, m.col);
    }
  }
}
