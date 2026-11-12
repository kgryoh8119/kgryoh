// 演出（v30）：粒（紙吹雪・土煙・煙・火の粉・木の葉）、画面の揺れ、夜のネオンの光、鳥の群れ、小舟、ヘリコプター
import * as THREE from 'three';

type P = { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; size: number; grow: number; col: THREE.Color; g: number; spin: number; drag: number; lit?: boolean };
const MAXP = 900;
export class FX {
  private parts: P[] = [];
  private mesh: THREE.InstancedMesh; private soft: THREE.InstancedMesh;
  private glow: THREE.InstancedMesh; private glowN = 0; private litP: THREE.InstancedMesh; private night = 0;
  private birds: THREE.InstancedMesh; private pigeons!: THREE.InstancedMesh; private pigeonAt: { x: number; y: number; z: number }[] = []; private flocks: { cx: number; cz: number; r: number; h: number; sp: number; ph: number; n: number }[] = [];
  private boats: THREE.InstancedMesh[] = []; private boatLit: THREE.InstancedMesh[] = []; private boatPath: { x: number; z: number; y: number }[][] = []; private boatType: number[] = [];
  private helis: THREE.InstancedMesh; private heliAt: { x: number; z: number; y: number; r: number; ph: number }[] = [];
  private shakeT = 0; private shakeA = 0; private t = 0;
  private tc = new THREE.Color(); private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private sc = new THREE.Vector3();
  lite = false;
  constructor(private scene: THREE.Scene) {
    // 紙吹雪・木の葉・花びら：周りの明るさを受ける薄い紙（夜は暗く、光らない）
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 0.62), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), MAXP);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.setColorAt(0, new THREE.Color()); scene.add(this.mesh);
    // 土煙・煙は、ふちのぼけた板（カメラの方を向く）。固い玉に見えないように
    this.soft = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, map: glowTex(), transparent: true, opacity: 0.42, depthWrite: false }), MAXP);
    this.soft.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.soft.frustumCulled = false; this.soft.count = 0; this.soft.setColorAt(0, new THREE.Color()); scene.add(this.soft);
    // 火の粉・きらめき・花火・流れ星：光る丸い粒（加算合成。四角く見えない）
    this.litP = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), MAXP);
    this.litP.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.litP.frustumCulled = false; this.litP.count = 0; this.litP.setColorAt(0, new THREE.Color()); scene.add(this.litP);
    // 夜のネオン・看板の光（加算合成の板。カメラの方を向く）
    const gm = new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: false });
    this.glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), gm, 400); this.glow.frustumCulled = false; this.glow.count = 0; this.glow.setColorAt(0, new THREE.Color()); scene.add(this.glow);
    // 鳥（くの字の 2 枚）
    const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -1.4, 0.35, -0.5, 0, 0.08, -0.4, 0, 0, 0, 1.4, 0.35, -0.5, 0, 0.08, -0.4], 3)); bg.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(bg, new THREE.MeshBasicMaterial({ color: 0x2a2f36, side: THREE.DoubleSide }), 160); this.birds.frustumCulled = false; this.birds.count = 0; scene.add(this.birds);
    // 地面の鳩（駅前と公園）：胴と頭の小さな灰色のかたまり。昼だけ、ときどき跳ねて歩く
    { const pg = new THREE.SphereGeometry(0.22, 6, 4); pg.scale(1, 0.75, 1.4); pg.translate(0, 0.17, 0); const hd = new THREE.SphereGeometry(0.11, 6, 4); hd.translate(0, 0.33, 0.25); const m = new THREE.BufferGeometry(); const a1 = pg.toNonIndexed(), a2 = hd.toNonIndexed(); const P = new Float32Array(a1.attributes.position.array.length + a2.attributes.position.array.length); P.set(a1.attributes.position.array as Float32Array); P.set(a2.attributes.position.array as Float32Array, a1.attributes.position.array.length); m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.computeVertexNormals();
      this.pigeons = new THREE.InstancedMesh(m, new THREE.MeshStandardMaterial({ color: 0x8a8f9a, roughness: 0.8 }), 200); this.pigeons.frustumCulled = false; this.pigeons.count = 0; scene.add(this.pigeons); }
    // 船：0 小舟 / 1 水上バス / 2 遊覧船 / 3 屋形船。船体（色つき）と、夜に灯る窓・提灯（別の板）
    for (const [hull, lit, litCol] of boatGeos()) {
      const hm = new THREE.InstancedMesh(hull, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), 24); hm.frustumCulled = false; hm.count = 0; hm.castShadow = true; scene.add(hm); this.boats.push(hm);
      const lm = new THREE.InstancedMesh(lit, new THREE.MeshBasicMaterial({ color: litCol, transparent: true, opacity: 0.3 }), 24); lm.frustumCulled = false; lm.count = 0; scene.add(lm); this.boatLit.push(lm);
    }
    const hg = new THREE.BoxGeometry(2.4, 2.2, 7); hg.translate(0, 1.1, 0);
    this.helis = new THREE.InstancedMesh(hg, new THREE.MeshStandardMaterial({ color: 0xd8382c, roughness: 0.5 }), 6); this.helis.frustumCulled = false; this.helis.count = 0; scene.add(this.helis);
  }
  /** 粒をまく。kind で色・動き・寿命が変わる */
  burst(x: number, y: number, z: number, kind: 'confetti' | 'dust' | 'smoke' | 'spark' | 'leaf' | 'firework' | 'sparkle' | 'petal' | 'meteor', n: number, spread = 8): void {
    if (this.lite) n = Math.ceil(n * 0.4);
    if (this.night > 0.5 && kind === 'confetti') n = Math.ceil(n * 0.3); // 夜の紙吹雪は見えにくいので少なく（きらめきが主役）
    const C = { confetti: [0xff5a5a, 0xffd23a, 0x4ab0ff, 0x6ee07a, 0xff7ad9, 0xffffff], dust: [0xb9a88c, 0xa8977a, 0xcfc2aa], smoke: [0x55585e, 0x3e4147, 0x6b6e74], spark: [0xff9a2a, 0xffd23a, 0xff5a2a], leaf: [0x6aa04a, 0x8fbf5a, 0xc9a24a], firework: [0xff5a5a, 0xffd23a, 0x6ad0ff, 0xff7ad9, 0x9aff7a], sparkle: [0xfff2a8, 0xffffff, 0xffe066], petal: [0xffc7dc, 0xffe0ec, 0xffb0cc], meteor: [0xffffff, 0xe8f4ff] }[kind];
    for (let i = 0; i < n && this.parts.length < MAXP; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random(), col = new THREE.Color(C[Math.floor(Math.random() * C.length)]);
      const p: P = { x: x + Math.cos(a) * spread * r * 0.3, y, z: z + Math.sin(a) * spread * r * 0.3, vx: 0, vy: 0, vz: 0, life: 0, max: 2, size: 0.6, grow: 0, col, g: -9.8, spin: Math.random() * 6, drag: 0.98 };
      if (kind === 'confetti') { p.vx = Math.cos(a) * (3 + 6 * r); p.vz = Math.sin(a) * (3 + 6 * r); p.vy = 10 + 10 * Math.random(); p.max = 3.5 + Math.random() * 1.5; p.size = 1.8; p.g = -6; p.drag = 0.97; }
      else if (kind === 'dust') { p.vx = Math.cos(a) * (2 + 5 * r); p.vz = Math.sin(a) * (2 + 5 * r); p.vy = 1 + 3 * Math.random(); p.max = 2.5 + Math.random() * 2; p.size = 3; p.grow = 3; p.g = 0.4; p.drag = 0.95; }
      else if (kind === 'smoke') { p.vx = (Math.random() - 0.5) * 2 + 2.5; p.vz = (Math.random() - 0.5) * 2; p.vy = 5 + 4 * Math.random(); p.max = 6 + Math.random() * 3; p.size = 3.5; p.grow = 3; p.g = 0.6; p.drag = 0.985; }
      else if (kind === 'spark') { p.vx = Math.cos(a) * 3 * r; p.vz = Math.sin(a) * 3 * r; p.vy = 6 + 8 * Math.random(); p.max = 1.2 + Math.random(); p.size = 0.9; p.g = -3; }
      else if (kind === 'leaf') { p.vx = 14 + 8 * Math.random(); p.vz = (Math.random() - 0.5) * 6; p.vy = 2 + 4 * Math.random(); p.max = 4; p.size = 0.6; p.g = -1.2; p.drag = 0.995; p.y += Math.random() * 30; }
      else if (kind === 'firework') { const e = Math.acos(2 * Math.random() - 1); p.vx = Math.sin(e) * Math.cos(a) * 34; p.vz = Math.sin(e) * Math.sin(a) * 34; p.vy = Math.cos(e) * 34; p.max = 1.8 + Math.random() * 0.6; p.size = 1.2; p.g = -5; p.drag = 0.95; }
      else if (kind === 'meteor') { p.vx = 600 + Math.random() * 300; p.vz = 200; p.vy = -250; p.max = 1.1; p.size = 5; p.g = 0; p.drag = 1; }
      else if (kind === 'petal') { p.vx = 3 + 3 * Math.random(); p.vz = (Math.random() - 0.5) * 3; p.vy = -1.5; p.max = 7; p.size = 0.9; p.g = 0; p.drag = 1; }
      else if (kind === 'sparkle') { p.vx = Math.cos(a) * 2; p.vz = Math.sin(a) * 2; p.vy = 4 + 6 * Math.random(); p.max = 1.8; p.size = 1.1; p.g = -1; }
      p.lit = kind === 'spark' || kind === 'firework' || kind === 'sparkle' || kind === 'meteor';
      this.parts.push(p);
    }
  }
  /** 画面を揺らす（強さ m・秒） */
  shake(a: number, sec: number): void { this.shakeA = Math.max(this.shakeA, this.lite ? a * 0.6 : a); this.shakeT = Math.max(this.shakeT, sec); }
  shakeOffset(): THREE.Vector3 {
    if (this.shakeT <= 0) return this.v.set(0, 0, 0);
    const k = this.shakeA * Math.min(1, this.shakeT), t = this.t * 40;
    return this.v.set(Math.sin(t * 1.3) * k, Math.sin(t * 1.9 + 1) * k * 0.6, Math.sin(t * 1.1 + 2) * k);
  }
  /** 夜の光る点（看板・ネオン）：位置・色・大きさ */
  setGlow(pts: { x: number; y: number; z: number; c: number; s: number }[]): void {
    const n = Math.min(400, pts.length), c = new THREE.Color();
    for (let i = 0; i < n; i++) { const p = pts[i]; this.m4.makeScale(p.s, p.s, p.s).setPosition(p.x, p.y, p.z); this.glow.setMatrixAt(i, this.m4); this.glow.setColorAt(i, c.setHex(p.c)); }
    this.glowN = n; this.glow.count = n; this.glow.instanceMatrix.needsUpdate = true; if (this.glow.instanceColor) this.glow.instanceColor.needsUpdate = true;
  }
  /** 鳥の群れの場所（森・水辺の上）。小舟の航路（水面の区画をつないだ列）。ヘリの場所（病院・テレビ局） */
  /** 鳩のいる場所（駅前・公園の中心）。1 か所に 8 羽 */
  setPigeons(p: { x: number; y: number; z: number }[]): void { this.pigeonAt = p.slice(0, 24); }
  setFlocks(f: { x: number; z: number }[]): void { this.flocks = f.slice(0, 6).map((p, k) => ({ cx: p.x, cz: p.z, r: 80 + 60 * ((k * 37) % 5) / 5, h: 45 + 15 * (k % 3), sp: 0.12 + 0.05 * (k % 3), ph: k * 1.7, n: 14 + (k % 3) * 6 })); }
  /** 時刻と月（船の運航時間） */
  private hr = 12; private cm = 6;
  clock(hour: number, calM: number): void { this.hr = hour; this.cm = calM; }
  /** 船の種類ごとの運航時間：小舟 5〜19 時／水上バス 7〜21 時／遊覧船 10〜21 時（冬は 17 時まで）／屋形船 昼 11〜14 時と夜 17〜22 時（夏は 23 時まで） */
  private boatOn(ty: number): boolean { const h = this.hr, winter = this.cm === 11 || this.cm <= 1, summer = this.cm >= 6 && this.cm <= 8;
    return ty === 0 ? h >= 5 && h < 19 : ty === 1 ? h >= 7 && h < 21 : ty === 2 ? h >= 10 && h < (winter ? 17 : 21) : (h >= 11 && h < 14) || (h >= 17 && h < (summer ? 23 : 22)); }
  setBoats(paths: { x: number; z: number; y: number }[][], types: number[] = []): void { const keep = paths.map((p, k) => [p, types[k] ?? 0] as const).filter(([p]) => p.length >= 2).slice(0, 24); this.boatPath = keep.map(v => v[0]); this.boatType = keep.map(v => v[1]); }
  setHelis(h: { x: number; z: number; y: number }[]): void { this.heliAt = h.slice(0, 6).map((p, k) => ({ ...p, r: 120 + 40 * k, ph: k * 2.1 })); }
  update(dt: number, cam: THREE.Camera, night: number, blackout: number): void {
    if (!Number.isFinite(dt) || dt < 0) dt = 0; this.t += dt; if (!Number.isFinite(this.t)) this.t = 0; if (this.shakeT > 0) { this.shakeT -= dt; if (this.shakeT <= 0) this.shakeA = 0; }
    // 粒
    let n = 0; const q = cam.quaternion;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life += dt; if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= p.drag; p.vy *= p.g > 0 ? 0.99 : 1; p.vz *= p.drag; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; if (p.y < 0.2 && p.g < 0) { p.y = 0.2; p.vy = 0; p.vx *= 0.8; p.vz *= 0.8; }
    }
    let ns = 0, nl = 0; this.night = night;
    for (const p of this.parts) {
      const f = 1 - p.life / p.max;
      if (p.grow) { const s = (p.size + p.grow * p.life) * 1.3 * Math.min(1, f * 2.5, p.life * 3 + 0.3); this.m4.compose(this.v.set(p.x, p.y, p.z), q, this.sc.set(s, s, s)); this.soft.setMatrixAt(ns, this.m4); this.soft.setColorAt(ns, p.col); ns++; continue; }
      const s = p.size * Math.min(1, f * 3);
      if (p.lit) { const g = s * 2.6 * (0.75 + 0.25 * Math.sin(this.t * 30 + p.spin * 9)); this.m4.compose(this.v.set(p.x, p.y, p.z), q, this.sc.set(g, g, g)); this.litP.setMatrixAt(nl, this.m4); this.litP.setColorAt(nl, this.tc.copy(p.col).multiplyScalar(Math.min(1, f * 2))); nl++; continue; } // 消えぎわは暗く
      this.q.setFromEuler(new THREE.Euler(p.spin * this.t, p.spin * 0.7 * this.t, p.spin * 0.3 * this.t)); // ひらひら回る紙
      this.m4.compose(this.v.set(p.x, p.y, p.z), this.q, this.sc.set(s * 0.8, s * 0.8, s * 0.8)); this.mesh.setMatrixAt(n, this.m4); this.mesh.setColorAt(n, p.col); n++;
    }
    this.litP.count = nl; this.litP.instanceMatrix.needsUpdate = true; if (this.litP.instanceColor) this.litP.instanceColor.needsUpdate = true;
    (this.soft.material as THREE.MeshBasicMaterial).color.setScalar(1 - 0.78 * night); // 土煙・煙は夜は暗く（光って見えない）
    (this.soft.material as THREE.MeshBasicMaterial).opacity = 0.42 - 0.12 * night;
    this.soft.count = ns; this.soft.instanceMatrix.needsUpdate = true; if (this.soft.instanceColor) this.soft.instanceColor.needsUpdate = true;
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    // 夜の光：またたき。停電のときは消える
    const gm = this.glow.material as THREE.MeshBasicMaterial; gm.opacity = night * 0.55 * (1 - blackout) * (0.92 + 0.08 * Math.sin(this.t * 3));
    if (this.glowN && night > 0.02) { for (let i = 0; i < this.glowN; i++) { this.glow.getMatrixAt(i, this.m4); this.m4.decompose(this.v, this.q, this.sc); this.m4.compose(this.v, q, this.sc); this.glow.setMatrixAt(i, this.m4); } this.glow.instanceMatrix.needsUpdate = true; }
    this.glow.visible = night > 0.02 && this.glowN > 0;
    // 鳥：昼だけ。群れごとに円を描き、羽ばたく
    let b = 0; const day = 1 - night;
    if (day > 0.4) for (const f of this.flocks) for (let i = 0; i < f.n && b < 160; i++) {
      const a = this.t * f.sp + f.ph + i * 0.09, r = f.r + Math.sin(i * 2.3) * 14, x = f.cx + Math.cos(a) * r + Math.sin(i * 1.7) * 6, z = f.cz + Math.sin(a) * r + Math.cos(i * 2.9) * 6, y = f.h + Math.sin(this.t * 0.7 + i) * 4;
      const flap = 0.6 + 0.4 * Math.sin(this.t * 9 + i * 1.3);
      this.q.setFromEuler(new THREE.Euler(0, -a, 0)); this.m4.compose(this.v.set(x, y, z), this.q, this.sc.set(1.4, flap * 1.4, 1.4)); this.birds.setMatrixAt(b++, this.m4);
    }
    this.birds.count = b; this.birds.instanceMatrix.needsUpdate = true;
    // 夕方はカラスが群れで山（ねぐら）へ帰る：16 時半〜18 時半は群れが大きく広く回り、黒い
    (this.birds.material as THREE.MeshBasicMaterial).color.setHex(this.hr >= 16.5 && this.hr < 18.5 ? 0x111214 : 0x2a2f36);
    let pc = 0;
    if (day > 0.5) this.pigeonAt.forEach((p, k) => { for (let i = 0; i < 8; i++) { const ph = k * 3.1 + i * 1.7, hop = Math.max(0, Math.sin(this.t * 3 + ph * 5)) ** 8 * 0.4, wx = Math.sin(this.t * 0.11 + ph) * 3.2, wz = Math.cos(this.t * 0.09 + ph * 1.3) * 3.2;
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.t * 0.1 + ph + Math.sin(this.t + ph) * 0.6); this.m4.compose(this.v.set(p.x + wx + Math.cos(ph) * 2.4, p.y + hop, p.z + wz + Math.sin(ph) * 2.4), this.q, this.sc.set(1, 1, 1)); this.pigeons.setMatrixAt(pc++, this.m4); } });
    this.pigeons.count = pc; this.pigeons.instanceMatrix.needsUpdate = true;
    // 小舟：航路を行ったり来たり
    const bn = [0, 0, 0, 0];
    this.boatPath.forEach((path, k) => {
      const ty = this.boatType[k] ?? 0, spd = ty === 3 ? 0.05 : ty === 2 ? 0.07 : ty === 1 ? 0.14 : 0.12; // 屋形船はゆっくり
      const L = path.length, u = (this.t * spd + k * 0.37) % (2 * (L - 1)), f = u > L - 1 ? 2 * (L - 1) - u : u, i0 = Math.floor(f), i1 = Math.min(L - 1, i0 + 1), t = f - i0, a = path[i0], c = path[i1];
      if (!a || !c || !this.boatOn(ty)) return; // 運航していない時間は港にいる（見せない）
      const x = a.x + (c.x - a.x) * t, z = a.z + (c.z - a.z) * t, dir = (u > L - 1 ? -1 : 1);
      this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2((c.x - a.x) * dir, (c.z - a.z) * dir) + 0.0001);
      this.m4.compose(this.v.set(x, a.y + Math.sin(this.t * 2 + k) * (ty ? 0.08 : 0.15), z), this.q, this.sc.set(1, 1, 1)); this.boats[ty].setMatrixAt(bn[ty], this.m4); this.boatLit[ty].setMatrixAt(bn[ty]++, this.m4);
    });
    this.boats.forEach((b, ty) => { b.count = bn[ty]; b.instanceMatrix.needsUpdate = true; const l = this.boatLit[ty]; l.count = bn[ty]; l.instanceMatrix.needsUpdate = true; (l.material as THREE.MeshBasicMaterial).opacity = (ty === 3 ? 0.5 : 0.1) + 0.7 * Math.min(1, night * 1.3) * (1 - 0.9 * blackout); });
    // ヘリ：病院やテレビ局の上を、ゆっくり大きく回る
    let h = 0;
    for (const p of this.heliAt) { const a = this.t * 0.18 + p.ph, x = p.x + Math.cos(a) * p.r, z = p.z + Math.sin(a) * p.r; this.q.setFromEuler(new THREE.Euler(0.08, -a, 0)); this.m4.compose(this.v.set(x, p.y + 90 + Math.sin(this.t) * 3, z), this.q, this.sc.set(1, 1, 1)); this.helis.setMatrixAt(h++, this.m4); }
    this.helis.count = h; this.helis.instanceMatrix.needsUpdate = true;
  }
}
export function glowTex(): THREE.Texture {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t;
}

/** 船の形（船体は頂点の色つき、灯りは別の形）。長さの向きは z */
function boatGeos(): [THREE.BufferGeometry, THREE.BufferGeometry, number][] {
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, col: number) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y + h / 2, z); const c = new THREE.Color(col), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; };
  const merge = (gs: THREE.BufferGeometry[]) => { let n = 0; for (const g of gs) n += g.index ? g.index.count : g.attributes.position.count; const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
    for (const g0 of gs) { const g = g0.index ? g0.toNonIndexed() : g0, p = g.attributes.position.array, nn = g.attributes.normal.array, c = g.attributes.color?.array; P.set(p, o * 3); N.set(nn, o * 3); if (c) C.set(c, o * 3); else C.fill(1, o * 3, o * 3 + p.length); o += p.length / 3; }
    const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(P, 3)); out.setAttribute('normal', new THREE.BufferAttribute(N, 3)); out.setAttribute('color', new THREE.BufferAttribute(C, 3)); return out; };
  const small = merge([box(2.2, 1.0, 6, 0, 0, 0, 0xf2efe6), box(1.6, 0.9, 1.8, 0, 1.0, -0.6, 0x2a6aa0)]);
  const smallL = merge([box(0.3, 0.3, 0.3, 0, 1.9, -0.6, 0xffffff)]);
  // 水上バス：平たく低い銀の船体と、長いガラスの客室
  const bus = merge([box(4.2, 1.0, 20, 0, -0.3, 0, 0xd9dee2), box(3.4, 1.6, 15, 0, 0.7, -0.5, 0x4a6a84), box(3.6, 0.2, 15.4, 0, 2.3, -0.5, 0xe8ecef), box(4.3, 0.25, 20.1, 0, 0.55, 0, 0x2a6aa0)]);
  const busL = merge([box(3.46, 0.45, 14, 0, 1.3, -0.5, 0xffffff), box(0.3, 0.3, 0.1, 1.4, 0.2, 10.0, 0xffffff), box(0.3, 0.3, 0.1, -1.4, 0.2, 10.0, 0xffffff)]);
  // 遊覧船：白い 2 層の客室と上のデッキ
  const cruise = merge([box(6.4, 1.6, 26, 0, -0.5, 0, 0xf6f6f2), box(6.5, 0.4, 26.1, 0, 0.9, 0, 0x1f4f8a), box(5.6, 2.4, 20, 0, 1.3, -1, 0xf4f4f0), box(4.8, 2.0, 12, 0, 3.7, -2, 0xf4f4f0), box(5.0, 0.2, 12.4, 0, 5.7, -2, 0x2a6aa0)]);
  const cruiseL: THREE.BufferGeometry[] = [box(5.66, 0.6, 18.5, 0, 2.2, -1, 0xffffff), box(4.86, 0.5, 11, 0, 4.4, -2, 0xffffff)]; for (let k = 0; k < 9; k++) cruiseL.push(box(0.35, 0.35, 0.35, 0, 6.0, -7 + k * 1.5, 0xffffff)); // 窓の帯と、デッキの電飾
  // 屋形船：木の船体、障子の客室、黒い屋根
  const yak = merge([box(4.6, 1.0, 17, 0, -0.4, 0, 0x5a3a24), box(4.0, 2.0, 13.5, 0, 0.6, -0.3, 0xf2e6cc), box(4.6, 0.35, 14.6, 0, 2.6, -0.3, 0x2a2a2c)]);
  const yakL: THREE.BufferGeometry[] = [box(4.04, 0.7, 12.5, 0, 1.1, -0.3, 0xffffff)]; for (let k = 0; k < 6; k++) for (const sx of [-2.45, 2.45]) yakL.push(box(0.45, 0.55, 0.45, sx, 1.95, -5.5 + k * 2.1, 0xffffff));
  return [[small, smallL, 0xfff2c0], [bus, busL, 0xbfe6ff], [cruise, merge(cruiseL), 0xffe2a8], [yak, merge(yakL), 0xffa060]];
}
