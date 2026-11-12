// 音：BGM・環境音・効果音・人の声。音源ファイルは使わず、Web Audio で毎回その場で合成する（外部アセットなし）。
// 人の声（駅のアナウンス・選挙カー・焼き芋屋など）は、端末の読み上げ（speechSynthesis）を使う。
import type { GameState, Action, Kind } from '../sim/types';
import { DEFS, W, H, isShop, fam } from '../sim/config';
import { getMap, idx } from '../sim/map';
import { levelOf } from '../sim/mayor';

const TILE = 30;
type Info = {
  tx: number; tz: number; dist: number; ground: boolean; cam: { x: number; y: number; z: number }; right: { x: number; z: number };
  hour: number; night: number; calM: number; rain: number; snow: number; cloud: number;
  trains: number[]; cross: number[]; plane: number[] | null; heli: number[] | null; ships: number[]; fest: number[] | null; festOn: boolean;
};
export type SoundSettings = { on: boolean; vol: number; bgm: boolean; env: boolean; sfx: boolean; voice: boolean };
const KEY = 'sumu-sound';
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];

// 近くにあると音がする施設の分類
const CAT: Partial<Record<Kind, string>> = {};
for (const k of ['stadium', 'ballpark', 'dome', 'arena', 'rugby', 'athletics', 'racecourse', 'boatRace', 'keirin', 'musicArena', 'esportsArena', 'gym'] as Kind[]) CAT[k] = 'stadium';
for (const k of ['amusementPark', 'megaPark', 'ferrisWheel'] as Kind[]) CAT[k] = 'fun';
for (const k of ['pachinko', 'casino'] as Kind[]) CAT[k] = 'pachi';
for (const k of ['temple', 'shrine', 'grandShrine'] as Kind[]) CAT[k] = 'temple';
for (const k of ['park', 'parkL', 'forestPark', 'riverPark', 'japaneseGarden', 'botanical', 'flowerPark', 'biotope', 'ecoCenter', 'kidsPark', 'pool'] as Kind[]) CAT[k] = 'green';
for (const k of ['paddy', 'field', 'farm', 'tourFarm', 'allotment'] as Kind[]) CAT[k] = 'farm';
for (const k of ['station'] as Kind[]) CAT[k] = 'station';
for (const k of ['airport', 'usBase', 'sdfBase', 'vertiport'] as Kind[]) CAT[k] = 'air';
for (const k of ['port', 'fishPort', 'shipyard', 'oilRefinery'] as Kind[]) CAT[k] = 'port';
for (const k of ['mall', 'outletMall', 'market', 'michinoeki'] as Kind[]) CAT[k] = 'shop';
const catOf = (k: Kind): string => CAT[k] ?? (isShop(k) ? 'shop' : fam(k) === 'school' || fam(k) === 'jhs' || k === 'highschool' ? 'school' : fam(k) === 'care' || k === 'jidokan' || k === 'kindergarten' ? 'kids'
  : (DEFS[k].pollution ?? 0) >= 0.4 && DEFS[k].fam === 'biz' ? 'factory' : '');

export class Sound {
  ctx: AudioContext | null = null;
  set: SoundSettings = { on: true, vol: 0.8, bgm: true, env: true, sfx: true, voice: true };
  private master!: GainNode; private bgmBus!: GainNode; private envBus!: GainNode; private sfxBus!: GainNode; private verb!: ConvolverNode; private verbIn!: GainNode;
  private white!: AudioBuffer; private pink!: AudioBuffer; private brown!: AudioBuffer;
  private loops: Record<string, { g: GainNode; f?: BiquadFilterNode; p?: StereoPannerNode; extra?: AudioParam }> = {};
  private near: Record<string, number> = {}; private nearPos: Record<string, [number, number][]> = {};
  private water = 0; private forest = 0; private roads = 0;
  private anaT = 0; private lastHour = -1; private t = 0;
  private timers: Record<string, number> = {};
  private seenEvents = new Set<string>(); private seenElect = -1; private seenCeleb = -1; private seenThanks = 0; private lastMonth = -1;
  private bgm = { style: '', next: 0, step: 0, bar: 0, motif: [] as number[], fade: 1 };
  private voices: SpeechSynthesisVoice[] = [];
  private crossBell = 0;

  constructor() {
    try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); if (v && typeof v === 'object') Object.assign(this.set, v); } catch { /* 使えない環境 */ }
    // 音はユーザーが触ってから鳴らせる（スマホの決まり）。最初のタップで起こす
    const wake = () => { this.unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend']) window.addEventListener(ev, wake, { capture: true, passive: true });
    try { const sy = window.speechSynthesis; if (sy) { const load = () => { this.voices = sy.getVoices().filter(v => /^ja/i.test(v.lang)); }; load(); sy.addEventListener?.('voiceschanged', load); } } catch { /* 読み上げなし */ }
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend(); else if (this.set.on) this.ctx.resume(); });
  }
  save(): void { try { localStorage.setItem(KEY, JSON.stringify(this.set)); } catch { /* 使えない環境 */ } this.applyVol(); }
  toggle(): boolean { this.set.on = !this.set.on; this.save(); if (this.set.on) { this.unlock(); this.ctx?.resume(); } else { this.ctx?.suspend(); try { speechSynthesis.cancel(); } catch { /* なし */ } } return this.set.on; }
  private applyVol(): void {
    if (!this.ctx) return; const n = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.set.on ? this.set.vol : 0, n, 0.05);
    this.bgmBus.gain.setTargetAtTime(this.set.bgm ? 0.32 : 0, n, 0.2);
    this.envBus.gain.setTargetAtTime(this.set.env ? 0.9 : 0, n, 0.2);
    this.sfxBus.gain.setTargetAtTime(this.set.sfx ? 0.8 : 0, n, 0.05);
  }

  unlock(): void {
    if (!this.set.on) return;
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext; if (!AC) return;
    const c: AudioContext = new AC(); this.ctx = c;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(c.destination);
    this.master = c.createGain(); this.master.connect(comp);
    this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.4); this.verbIn = c.createGain(); this.verbIn.gain.value = 0.5; this.verbIn.connect(this.verb); this.verb.connect(this.master);
    this.bgmBus = c.createGain(); this.envBus = c.createGain(); this.sfxBus = c.createGain();
    for (const b of [this.bgmBus, this.envBus, this.sfxBus]) b.connect(this.master);
    this.white = this.noise('white'); this.pink = this.noise('pink'); this.brown = this.noise('brown');
    this.makeLoops(); this.applyVol();
    this.bgm.next = c.currentTime + 0.3;
    // iPhone の読み上げは、最初の 1 回をタップの中で鳴らしておくと、あとから話せる
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis?.speak(u); } catch { /* 読み上げなし */ }
    // 起動の合図（短い）
    this.chime([72, 76, 79], 0.12, 0.25);
  }

  // ---------------------------------------------------------------- 素材
  private noise(kind: 'white' | 'pink' | 'brown'): AudioBuffer {
    const c = this.ctx!, n = c.sampleRate * 3, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w * 0.5;
      else if (kind === 'pink') { b0 = 0.997 * b0 + 0.029591 * w; b1 = 0.985 * b1 + 0.032534 * w; b2 = 0.95 * b2 + 0.048056 * w; d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6; }
      else { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
    }
    // つなぎ目のぷつっという音を消す
    for (let i = 0; i < 400; i++) { const k = i / 400; d[i] *= k; d[n - 1 - i] *= k; }
    return b;
  }
  private impulse(sec: number): AudioBuffer {
    const c = this.ctx!, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6); }
    return b;
  }
  private src(buf: AudioBuffer, loop = true): AudioBufferSourceNode { const s = this.ctx!.createBufferSource(); s.buffer = buf; s.loop = loop; s.playbackRate.value = rnd(0.94, 1.06); return s; }
  private filt(type: BiquadFilterType, f: number, q = 0.7): BiquadFilterNode { const x = this.ctx!.createBiquadFilter(); x.type = type; x.frequency.value = f; x.Q.value = q; return x; }
  private gain(v = 0): GainNode { const g = this.ctx!.createGain(); g.gain.value = v; return g; }
  private pan(v = 0): StereoPannerNode | GainNode { const c = this.ctx!; if (c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(v, -1, 1); return p; } return this.gain(1); }

  /** 鳴りっぱなしの環境音（音量を毎フレーム合わせる） */
  private makeLoops(): void {
    const c = this.ctx!;
    const mk = (name: string, buf: AudioBuffer, chain: AudioNode[], lfo?: { f: number; depth: number; to: 'gain' | 'freq' }) => {
      const s = this.src(buf), g = this.gain(0), p = this.pan(0) as StereoPannerNode;
      let prev: AudioNode = s; for (const n of chain) { prev.connect(n); prev = n; }
      prev.connect(g); g.connect(p); p.connect(this.envBus);
      const f = chain.find(n => n instanceof BiquadFilterNode) as BiquadFilterNode | undefined;
      if (lfo) { const o = c.createOscillator(), og = this.gain(lfo.depth); o.frequency.value = lfo.f; o.connect(og); og.connect(lfo.to === 'gain' ? (chain.at(-1) as GainNode).gain : f!.frequency); o.start(); }
      s.start(0, Math.random() * 2);
      this.loops[name] = { g, f, p: p instanceof StereoPannerNode ? p : undefined };
    };
    mk('traffic', this.brown, [this.filt('lowpass', 380), this.filt('highpass', 40)]);
    mk('city', this.pink, [this.filt('bandpass', 700, 0.5), this.gain(1)], { f: 0.17, depth: 0.25, to: 'gain' });
    mk('wind', this.pink, [this.filt('bandpass', 500, 0.8)], { f: 0.07, depth: 260, to: 'freq' });
    mk('rain', this.white, [this.filt('highpass', 900), this.filt('lowpass', 7000)]);
    mk('waves', this.pink, [this.filt('lowpass', 700), this.gain(1)], { f: 0.11, depth: 0.7, to: 'gain' });
    mk('stadium', this.pink, [this.filt('bandpass', 1100, 0.6), this.gain(1)], { f: 0.23, depth: 0.35, to: 'gain' });
    mk('factory', this.brown, [this.filt('bandpass', 140, 2), this.gain(1)], { f: 1.6, depth: 0.2, to: 'gain' });
    // せみ（夏の昼）：細い帯域の雑音を速く揺らす
    mk('cicada', this.white, [this.filt('bandpass', 4800, 9), this.gain(1)], { f: 38, depth: 0.9, to: 'gain' });
    // ざわめき：人の声の帯域（話し声の母音のあたり）を、ゆっくり揺らす
    mk('babble', this.pink, [this.filt('bandpass', 420, 1.2), this.filt('peaking', 1300, 1.5), this.gain(1)], { f: 0.9, depth: 0.35, to: 'gain' });
    (this.loops.babble.f as BiquadFilterNode).gain.value = 0;
    mk('heli', this.brown, [this.filt('lowpass', 260), this.gain(1)], { f: 17, depth: 0.95, to: 'gain' });
    mk('jet', this.pink, [this.filt('lowpass', 1400), this.filt('highpass', 120)]);
    mk('train', this.brown, [this.filt('lowpass', 300)]);
  }
  private setLoop(name: string, v: number, pan = 0, f?: number): void {
    const L = this.loops[name]; if (!L || !this.ctx) return; const n = this.ctx.currentTime;
    L.g.gain.setTargetAtTime(v, n, 0.25); if (L.p) L.p.pan.setTargetAtTime(clamp(pan, -0.9, 0.9), n, 0.2); if (f && L.f) L.f.frequency.setTargetAtTime(f, n, 0.3);
  }

  // ---------------------------------------------------------------- 音の部品
  private out(bus: 'bgm' | 'env' | 'sfx', pan = 0, wet = 0.2): AudioNode {
    const p = this.pan(pan), g = this.gain(1);
    p.connect(g); g.connect(bus === 'bgm' ? this.bgmBus : bus === 'env' ? this.envBus : this.sfxBus);
    if (wet > 0) { const w = this.gain(wet); p.connect(w); w.connect(this.verbIn); }
    return p;
  }
  /** 音色：tone（ピアノ・ベル・笛など）。t は開始時刻 */
  private tone(t: number, f: number, dur: number, vel: number, to: AudioNode, kind: 'epiano' | 'bell' | 'pad' | 'bass' | 'flute' | 'pluck' | 'brass' | 'glock' | 'organ'): void {
    const c = this.ctx!, g = this.gain(0);
    g.connect(to);
    const env = (a: number, d: number, s: number, r: number) => { g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + a); g.gain.setTargetAtTime(vel * s, t + a, d); g.gain.setTargetAtTime(0, t + dur, r); };
    const osc = (type: OscillatorType, ff: number, det = 0) => { const o = c.createOscillator(); o.type = type; o.frequency.value = ff; o.detune.value = det; o.start(t); o.stop(t + dur + 2.5); return o; };
    if (kind === 'epiano') {
      const car = osc('sine', f), mod = osc('sine', f * 2), mg = this.gain(f * 1.6);
      mg.gain.setValueAtTime(f * 2.2, t); mg.gain.setTargetAtTime(f * 0.15, t, 0.25); mod.connect(mg); mg.connect(car.frequency); car.connect(g); env(0.005, 0.6, 0.35, 0.25);
    } else if (kind === 'bell' || kind === 'glock') {
      for (const [m, a] of (kind === 'bell' ? [[1, 1], [2.76, 0.4], [5.4, 0.2]] : [[1, 1], [3.9, 0.25], [9.3, 0.08]])) { const o = osc('sine', f * m), og = this.gain(a); o.connect(og); og.connect(g); }
      env(0.002, kind === 'bell' ? 0.9 : 0.3, 0.0, 0.4);
    } else if (kind === 'pad') {
      const lp = this.filt('lowpass', 900, 0.5); lp.connect(g);
      for (const d of [-7, 7]) osc('sawtooth', f, d).connect(lp);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + Math.min(1.2, dur * 0.4)); g.gain.setTargetAtTime(0, t + dur, 0.6);
    } else if (kind === 'bass') {
      const o = osc('triangle', f), lp = this.filt('lowpass', 420); o.connect(lp); lp.connect(g); env(0.01, 0.35, 0.55, 0.08);
    } else if (kind === 'flute') {
      const o = osc('sine', f), v = osc('sine', 5.2), vg = this.gain(f * 0.012); v.connect(vg); vg.connect(o.frequency); o.connect(g);
      const h = osc('triangle', f * 2), hg = this.gain(0.12); h.connect(hg); hg.connect(g);
      const n = this.src(this.white), bp = this.filt('bandpass', f * 2, 2), ng = this.gain(0.05); n.connect(bp); bp.connect(ng); ng.connect(g); n.start(t); n.stop(t + dur + 0.5);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.06); g.gain.setTargetAtTime(0, t + dur, 0.09);
    } else if (kind === 'pluck') {
      const o = osc('triangle', f), lp = this.filt('lowpass', f * 6); lp.frequency.setTargetAtTime(f * 1.5, t, 0.15); o.connect(lp); lp.connect(g); env(0.003, 0.25, 0.0, 0.2);
    } else if (kind === 'brass') {
      const lp = this.filt('lowpass', f * 1.5, 1); lp.frequency.setValueAtTime(f, t); lp.frequency.linearRampToValueAtTime(f * 5, t + 0.08); lp.connect(g);
      for (const d of [-6, 6]) osc('sawtooth', f, d).connect(lp); env(0.04, 0.4, 0.7, 0.12);
    } else { // organ（チャイム）
      for (const [m, a] of [[1, 1], [2, 0.35], [3, 0.12]]) { const o = osc('sine', f * m), og = this.gain(a); o.connect(og); og.connect(g); }
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.08); g.gain.setTargetAtTime(vel * 0.7, t + 0.08, 0.5); g.gain.setTargetAtTime(0, t + dur, 0.5);
    }
  }
  /** 打楽器・物音：雑音の短い塊 */
  private hit(t: number, to: AudioNode, o: { f?: number; q?: number; type?: BiquadFilterType; dur: number; vel: number; buf?: AudioBuffer; pitch?: [number, number] }): void {
    const c = this.ctx!, g = this.gain(0); g.connect(to);
    if (o.pitch) { const osc = c.createOscillator(); osc.frequency.setValueAtTime(o.pitch[0], t); osc.frequency.exponentialRampToValueAtTime(o.pitch[1], t + o.dur); osc.connect(g); osc.start(t); osc.stop(t + o.dur + 0.1); }
    else { const s = this.src(o.buf ?? this.white, false), f = this.filt(o.type ?? 'bandpass', o.f ?? 1000, o.q ?? 1); s.connect(f); f.connect(g); s.start(t, Math.random() * 2); s.stop(t + o.dur + 0.1); }
    g.gain.setValueAtTime(o.vel, t); g.gain.exponentialRampToValueAtTime(0.0008, t + o.dur);
  }
  private chime(notes: number[], step: number, vel: number, kind: 'bell' | 'glock' | 'organ' | 'epiano' = 'glock', t0?: number): void {
    if (!this.ctx) return; const t = t0 ?? this.ctx.currentTime + 0.02, o = this.out('sfx', 0, 0.25);
    notes.forEach((m, i) => this.tone(t + i * step, mtof(m), step * 1.5, vel, o, kind));
  }

  // ---------------------------------------------------------------- 位置
  /** 音源（世界の位置）までの聞こえ方：音量と左右 */
  private at(i: Info, x: number, z: number, ref = 160, y = 0): { v: number; pan: number; d: number } {
    const lx = i.ground ? i.cam.x : i.tx, lz = i.ground ? i.cam.z : i.tz, dx = x - lx, dz = z - lz;
    const h = i.ground ? Math.abs(y - i.cam.y) : Math.max(Math.abs(y - i.cam.y) * 0.3, i.dist * 0.45);
    const d = Math.hypot(dx, dz, h), v = 1 / (1 + (d / ref) ** 2);
    const pan = (dx * i.right.x + dz * i.right.z) / Math.max(30, Math.hypot(dx, dz));
    return { v, pan: pan * clamp(Math.hypot(dx, dz) / 120), d };
  }

  // ---------------------------------------------------------------- 毎フレーム
  update(dt: number, s: GameState, i: Info): void {
    if (!this.ctx || !this.set.on || this.ctx.state !== 'running') return;
    this.t += dt;
    this.anaT -= dt; if (this.anaT <= 0) { this.anaT = 0.5; this.analyse(s, i); }
    this.ambience(s, i, dt);
    this.events(s, i);
    this.music(s, i);
  }

  /** 画面のまわりにある物を数える（0.5 秒ごと） */
  private analyse(s: GameState, i: Info): void {
    const R = i.ground ? 260 : clamp(i.dist * 0.8, 160, 900), near: Record<string, number> = {}, pos: Record<string, [number, number][]> = {};
    for (const b of s.buildings) {
      const cx = (b.x + b.w / 2) * TILE, cz = (b.y + b.h / 2) * TILE, d = Math.hypot(cx - i.tx, cz - i.tz); if (d > R * 1.6) continue;
      const w = 1 / (1 + (d / (R * 0.5)) ** 2);
      const k = b.status === 'construction' ? 'build' : b.status === 'operating' ? catOf(b.kind) : '';
      if (k) { near[k] = (near[k] ?? 0) + w * Math.sqrt(b.w * b.h); (pos[k] ??= []).push([cx, cz]); }
    }
    const m = getMap(s.seed); let wa = 0, fo = 0, ro = 0, n = 0;
    const x0 = Math.floor((i.tx - R) / TILE), x1 = Math.ceil((i.tx + R) / TILE), y0 = Math.floor((i.tz - R) / TILE), y1 = Math.ceil((i.tz + R) / TILE), st = Math.max(1, Math.floor((x1 - x0) / 24));
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y += st) for (let x = Math.max(0, x0); x < Math.min(W, x1); x += st) { const j = idx(x, y); n++; if (m.water[j]) wa++; if (m.forest[j]) fo++; if (s.road[j]) ro++; }
    this.water = n ? wa / n : 0; this.forest = n ? fo / n : 0; this.roads = n ? ro / n : 0;
    this.near = near; this.nearPos = pos;
  }
  private zoomK(i: Info): number { return i.ground ? 1 : clamp(1.25 - i.dist / 2400, 0.35, 1); }

  private ambience(s: GameState, i: Info, dt: number): void {
    const N = this.near, z = this.zoomK(i), h = i.hour, day = 1 - i.night, sum = i.calM >= 6 && i.calM <= 8, aut = i.calM >= 8 && i.calM <= 10, spr = i.calM >= 2 && i.calM <= 4, win = i.calM === 11 || i.calM <= 1;
    const rush = Math.max(Math.exp(-((h - 8) ** 2) / 1.6), Math.exp(-((h - 18) ** 2) / 2.5)), traf = clamp(0.25 + 0.75 * day + 0.6 * rush) * clamp(this.roads * 4) * clamp(s.stats.pop / 30000, 0.25, 1);
    this.setLoop('traffic', 0.5 * traf * z);
    this.setLoop('city', 0.05 * traf * z + 0.05 * clamp((N.shop ?? 0) / 6) * day);
    const crowd = clamp(((N.shop ?? 0) + (N.station ?? 0) * 2 + (N.kids ?? 0) * 0.5 + (N.school ?? 0) * 0.5) / 10) * (0.25 + 0.75 * day) + (i.festOn ? 0.5 : 0);
    this.setLoop('babble', 0.22 * crowd * z);
    this.setLoop('wind', (0.04 + 0.2 * i.cloud * 0.5 + (i.ground ? 0 : clamp(i.dist / 3000) * 0.12)) * (this.typhoon ? 4 : 1));
    this.setLoop('rain', 0.32 * Math.max(i.rain, i.snow * 0.15) * (this.typhoon ? 1.6 : 1));
    const wv = this.posNear(i, this.nearPos.port) ?? 0;
    this.setLoop('waves', 0.25 * clamp(this.water * 3) * z + 0.1 * wv);
    const stad = clamp((N.stadium ?? 0) / 3) * (h > 10 && h < 21.5 ? 1 : 0.1);
    this.setLoop('stadium', 0.16 * stad * z);
    this.setLoop('factory', 0.12 * clamp((N.factory ?? 0) / 4) * (0.5 + 0.5 * day) * z);
    this.setLoop('cicada', sum && h > 7 && h < 18.5 ? 0.06 * clamp(this.forest * 6 + (N.green ?? 0) / 3) * z * (1 - i.rain) : 0);
    // ヘリ・ジェット・列車
    if (i.heli) { const a = this.at(i, i.heli[0], i.heli[2], 260, i.heli[1]); this.setLoop('heli', 0.6 * a.v, a.pan); } else this.setLoop('heli', 0);
    if (i.plane) { const a = this.at(i, i.plane[0], i.plane[2], 380, i.plane[1]); this.setLoop('jet', 0.55 * a.v, a.pan, 600 + 1500 * a.v); } else this.setLoop('jet', 0);
    let tv = 0, tp = 0; for (let k = 0; k < i.trains.length; k += 3) { if (!i.trains[k + 2]) continue; const a = this.at(i, i.trains[k], i.trains[k + 1], 150); if (a.v > tv) { tv = a.v; tp = a.pan; } }
    this.setLoop('train', 0.5 * tv, tp);
    if (tv > 0.15) this.every('gatan', 0.9, () => { this.gatan(tv, tp); });
    // 踏切：遮断機が下りている間、カンカン
    let cv = 0, cp = 0; for (let k = 0; k < i.cross.length; k += 2) { const a = this.at(i, i.cross[k], i.cross[k + 1], 130); if (a.v > cv) { cv = a.v; cp = a.pan; } }
    if (cv > 0.03) { this.crossBell -= dt; if (this.crossBell <= 0) { this.crossBell = 0.42; this.kan(cv, cp); } }
    // ときどき鳴る音
    const nat = clamp(this.forest * 5 + (N.green ?? 0) / 3 + (N.farm ?? 0) / 4) * z;
    if (day > 0.6 && !i.rain && nat > 0.05) this.chance('bird', 0.35 * nat, () => this.bird(spr && Math.random() < 0.3 ? 'uguisu' : 'suzume', nat));
    if (h > 16.3 && h < 18.5 && nat > 0.05) this.chance('crow', 0.08 * (nat + 0.2), () => this.crow(0.5));
    if (i.night > 0.6 && aut && nat > 0.05) this.chance('insect', 0.9 * nat, () => this.suzumushi(nat));
    if (i.night > 0.5 && (i.calM === 5 || i.calM === 6) && (N.farm ?? 0) > 0.5) this.chance('frog', 1.2 * clamp((N.farm ?? 0) / 4) * z, () => this.frog(clamp((N.farm ?? 0) / 4)));
    if ((N.build ?? 0) > 0.3 && h > 8 && h < 17.5) this.chance('hammer', 0.6 * clamp((N.build ?? 0) / 2) * z, () => this.hammer(clamp((N.build ?? 0) / 2) * z));
    if ((N.school ?? 0) > 0.3 && day > 0.5) for (const ch of [8.5, 12.4, 15.2]) if (this.crossed(ch)) this.westminster(clamp((N.school ?? 0) / 2) * z);
    if ((N.kids ?? 0) + (N.school ?? 0) > 0.6 && h > 9 && h < 17) this.chance('kids', 0.12 * z, () => this.kidsVoice(clamp(((N.kids ?? 0) + (N.school ?? 0)) / 3) * z));
    if ((N.fun ?? 0) > 0.3 && h > 9.5 && h < 21) this.chance('scream', 0.12 * z, () => this.scream(clamp((N.fun ?? 0) / 4) * z));
    if ((N.pachi ?? 0) > 0.2 && h > 10 && h < 23) this.chance('pachi', 0.25 * z, () => this.pachinko(clamp((N.pachi ?? 0) / 2) * z));
    if ((N.temple ?? 0) > 0.2) for (const ch of [6, 18]) if (this.crossed(ch)) this.bonsho(clamp((N.temple ?? 0) / 1.5) * z);
    if (stad > 0.2) this.chance('cheer', 0.06 * stad, () => this.cheer(0.6 * stad * z, 2.5));
    if (i.ships.length) this.chance('horn', 0.03, () => { let bv = 0, bp = 0; for (let k = 0; k < i.ships.length; k += 3) if (i.ships[k + 2] > 0) { const a = this.at(i, i.ships[k], i.ships[k + 1], 300); if (a.v > bv) { bv = a.v; bp = a.pan; } } if (bv > 0.03) this.shipHorn(bv, bp); });
    if (this.nearPos.air?.length && day > 0.4) this.chance('fighter', s.buildings.some(b => b.kind === 'usBase' && b.status === 'operating') ? 0.02 : 0.004, () => this.flyover());
    // 救急車・消防車・パトカー：人口に応じて、ときどき近くを通る
    if (s.stats.pop > 3000) this.chance('siren', 0.006 + 0.012 * clamp(s.stats.pop / 50000) + (this.fireEvent ? 0.08 : 0), () => this.siren(this.fireEvent && Math.random() < 0.7 ? 'fire' : Math.random() < 0.7 ? 'ambulance' : 'police', i));
    // 夕方の防災無線のチャイム（夏は 17:30、冬は 16:30）と、夜の石焼き芋・昼の選挙カー
    if (this.crossed(win ? 16.5 : sum ? 17.5 : 17)) this.yuyake();
    if (win && h > 15.5 && h < 20) this.chance('yakiimo', 0.012, () => this.say('いしや〜きいも〜、おいも。ほっかほかの、おいもだよ〜', { rate: 0.7, pitch: 0.7, vol: 0.5 }));
    if (h > 16 && h < 18.5) this.chance('tofu', 0.006, () => this.tofu());
    if (this.electionSoon(s) && h > 8 && h < 20) this.chance('senkyo', 0.02, () => this.say(pick(['現職の市長でございます。皆さまの暮らしを、これからもしっかり守ります。どうぞよろしくお願いいたします。', 'ご声援ありがとうございます！最後まで、全力でがんばります！', '子育てと福祉の街へ。どうか、お力をお貸しください。']), { rate: 1.05, pitch: 1.1, vol: 0.55 }));
    this.lastHour = h;
  }
  private typhoon = false; private fireEvent = false;
  private electionSoon(s: GameState): boolean { const end = s.termStart + s.termLength; return s.mode === 'term' && end - s.month <= 1 && end - s.month >= 0; }
  private posNear(i: Info, ps?: [number, number][]): number | null { if (!ps || !ps.length) return null; let v = 0; for (const [x, z] of ps) v = Math.max(v, this.at(i, x, z, 220).v); return v; }
  /** 時計が h を過ぎた瞬間か */
  private crossed(h: number): boolean { const a = this.lastHour, b = this._cur; if (a < 0) return false; return a <= b ? a < h && b >= h : h > a || h <= b; }
  private _cur = 0;
  private chance(key: string, perSec: number, f: () => void): void { if (perSec <= 0) return; if (Math.random() < perSec * this._dt) { const last = this.timers[key] ?? -99; if (this.t - last > 0.6) { this.timers[key] = this.t; f(); } } }
  private every(key: string, sec: number, f: () => void): void { const last = this.timers[key] ?? -99; if (this.t - last >= sec) { this.timers[key] = this.t; f(); } }
  private _dt = 0;
  tick(dt: number, s: GameState, i: Info): void { this._dt = dt; this._cur = i.hour; this.update(dt, s, i); }

  // ---------------------------------------------------------------- 環境の一発音
  private gatan(v: number, pan: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', pan, 0.05);
    for (const dt of [0, 0.13, 0.42, 0.55]) this.hit(t + dt, o, { f: 160, q: 1.2, dur: 0.12, vel: 0.5 * v, buf: this.brown, type: 'lowpass' });
  }
  private kan(v: number, pan: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', pan, 0.15);
    this.tone(t, 750, 0.18, 0.18 * v, o, 'bell'); this.tone(t, 1130, 0.12, 0.07 * v, o, 'bell');
  }
  private bird(kind: 'suzume' | 'uguisu', v: number): void {
    const c = this.ctx!, t = c.currentTime, o = this.out('env', rnd(-0.7, 0.7), 0.25);
    const tw = (t0: number, f0: number, f1: number, d: number, a: number) => { const os = c.createOscillator(), g = this.gain(0); os.frequency.setValueAtTime(f0, t0); os.frequency.exponentialRampToValueAtTime(f1, t0 + d); os.connect(g); g.connect(o); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(a, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t0 + d); os.start(t0); os.stop(t0 + d + 0.05); };
    if (kind === 'uguisu') { // ホーー・ホケキョ
      tw(t, 1150, 1250, 1.0, 0.07 * v); tw(t + 1.15, 2300, 1900, 0.12, 0.08 * v); tw(t + 1.3, 1800, 2700, 0.1, 0.08 * v); tw(t + 1.42, 2900, 2500, 0.25, 0.08 * v);
    } else { const n = 2 + Math.floor(Math.random() * 3), f = rnd(3600, 4600); for (let k = 0; k < n; k++) tw(t + k * rnd(0.12, 0.2), f * rnd(0.95, 1.08), f * 1.25, 0.07, 0.06 * v); }
  }
  private crow(v: number): void {
    const c = this.ctx!, t = c.currentTime, o = this.out('env', rnd(-0.8, 0.8), 0.35);
    for (let k = 0; k < 2 + Math.floor(Math.random() * 2); k++) {
      const t0 = t + k * 0.55, os = c.createOscillator(), bp = this.filt('bandpass', 1150, 2.5), g = this.gain(0); os.type = 'sawtooth';
      os.frequency.setValueAtTime(620, t0); os.frequency.linearRampToValueAtTime(470, t0 + 0.38); os.connect(bp); bp.connect(g); g.connect(o);
      g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(0.12 * v, t0 + 0.04); g.gain.linearRampToValueAtTime(0, t0 + 0.4); os.start(t0); os.stop(t0 + 0.45);
    }
  }
  private suzumushi(v: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', rnd(-0.8, 0.8), 0.2), f = rnd(4200, 4600);
    for (let k = 0; k < 6; k++) this.tone(t + k * 0.045, f, 0.03, 0.025 * v, o, 'glock');
  }
  private frog(v: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', rnd(-0.8, 0.8), 0.15), f = rnd(380, 520);
    for (let k = 0; k < 2; k++) this.hit(t + k * 0.16, o, { f, q: 6, dur: 0.11, vel: 0.35 * v, type: 'bandpass', buf: this.white });
  }
  private hammer(v: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', rnd(-0.6, 0.6), 0.2), n = 2 + Math.floor(Math.random() * 4);
    for (let k = 0; k < n; k++) { this.tone(t + k * 0.32, 2400, 0.05, 0.05 * v, o, 'bell'); this.hit(t + k * 0.32, o, { f: 900, q: 1, dur: 0.06, vel: 0.25 * v }); }
  }
  /** 学校のチャイム（ウェストミンスターの鐘） */
  private westminster(v: number): void {
    const t = this.ctx!.currentTime + 0.05, o = this.out('env', 0, 0.5);
    [64, 60, 62, 55, 55, 62, 64, 60].forEach((m, k) => this.tone(t + k * 0.75 + (k >= 4 ? 0.6 : 0), mtof(m + 12), 1.2, 0.09 * v, o, 'organ'));
  }
  private kidsVoice(v: number): void {
    const c = this.ctx!, t = c.currentTime, o = this.out('env', rnd(-0.7, 0.7), 0.2);
    for (let k = 0; k < 3; k++) this.formant(t + k * rnd(0.15, 0.4), rnd(380, 520), rnd(0.15, 0.4), 0.05 * v, o, pick(['a', 'i', 'o']));
    void c;
  }
  /** 人の声らしい母音（のこぎり波を母音の帯域で絞る） */
  private formant(t: number, f0: number, dur: number, vel: number, to: AudioNode, vow: 'a' | 'i' | 'u' | 'e' | 'o', glide = 0): void {
    const c = this.ctx!, F: Record<string, [number, number]> = { a: [800, 1200], i: [300, 2300], u: [350, 1250], e: [500, 1900], o: [500, 850] };
    const os = c.createOscillator(); os.type = 'sawtooth'; os.frequency.setValueAtTime(f0, t); if (glide) os.frequency.linearRampToValueAtTime(f0 * (1 + glide), t + dur);
    const vib = c.createOscillator(), vg = this.gain(f0 * 0.02); vib.frequency.value = rnd(4.5, 6.5); vib.connect(vg); vg.connect(os.frequency);
    const g = this.gain(0); g.connect(to);
    for (const ff of F[vow]) { const bp = this.filt('bandpass', ff * (f0 > 300 ? 1.15 : 1), 6), bg = this.gain(1); os.connect(bp); bp.connect(bg); bg.connect(g); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vel, t + 0.05); g.gain.setTargetAtTime(0, t + dur, 0.08);
    os.start(t); vib.start(t); os.stop(t + dur + 0.6); vib.stop(t + dur + 0.6);
  }
  /** 歓声「わーっ」：たくさんの声と拍手 */
  cheer(v: number, dur = 3): void {
    if (!this.ctx) return; const t = this.ctx.currentTime, o = this.out('sfx', 0, 0.4);
    for (let k = 0; k < 14; k++) this.formant(t + rnd(0, 0.3), rnd(160, 420), dur * rnd(0.5, 1), 0.035 * v, o, pick(['a', 'o', 'a', 'e']), rnd(-0.1, 0.15));
    const n = this.src(this.pink, false), bp = this.filt('bandpass', 1500, 0.6), g = this.gain(0); n.connect(bp); bp.connect(g); g.connect(o);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.5 * v, t + 0.3); g.gain.setTargetAtTime(0, t + dur * 0.7, dur * 0.25); n.start(t); n.stop(t + dur + 2);
    this.applause(v * 0.8, dur + 1, t + 0.5);
  }
  private applause(v: number, dur: number, t0?: number): void {
    const t = t0 ?? this.ctx!.currentTime, o = this.out('sfx', 0, 0.3);
    for (let k = 0; k < dur * 26; k++) { const tt = t + Math.random() * dur, fade = 1 - (tt - t) / dur; this.hit(tt, o, { f: rnd(1200, 2600), q: 1.4, dur: 0.03, vel: 0.35 * v * fade }); }
  }
  private scream(v: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', rnd(-0.6, 0.6), 0.3);
    for (let k = 0; k < 5; k++) this.formant(t + rnd(0, 0.2), rnd(600, 900), rnd(0.8, 1.4), 0.03 * v, o, pick(['a', 'i']), rnd(-0.25, -0.05));
    for (let k = 0; k < 10; k++) this.hit(t + k * 0.09, o, { f: 300, q: 1, dur: 0.07, vel: 0.12 * v, buf: this.brown, type: 'lowpass' }); // コースターのガタガタ
  }
  private pachinko(v: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', rnd(-0.5, 0.5), 0.3);
    for (let k = 0; k < 14; k++) this.tone(t + k * 0.05, rnd(1800, 3800), 0.04, 0.02 * v, o, 'glock');
  }
  /** 梵鐘（ゴーン）：うなりのある低い音が長く残る */
  private bonsho(v: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', 0, 0.6), c = this.ctx!;
    this.hit(t, o, { f: 200, dur: 0.15, vel: 0.4 * v, buf: this.brown, type: 'lowpass' });
    for (const [f, a, d] of [[98, 0.35, 9], [98.6, 0.3, 9], [196.5, 0.18, 6], [263, 0.1, 4], [352, 0.06, 3]]) { const os = c.createOscillator(), g = this.gain(0); os.frequency.value = f; os.connect(g); g.connect(o); g.gain.setValueAtTime(a * v, t); g.gain.exponentialRampToValueAtTime(0.0005, t + d); os.start(t); os.stop(t + d); }
  }
  private shipHorn(v: number, pan: number): void {
    const t = this.ctx!.currentTime, o = this.out('env', pan, 0.6), g = this.gain(0), c = this.ctx!; g.connect(o);
    for (const f of [110, 138.6]) { const os = c.createOscillator(), lp = this.filt('lowpass', 700); os.type = 'sawtooth'; os.frequency.value = f; os.connect(lp); lp.connect(g); os.start(t); os.stop(t + 3.2); }
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18 * v, t + 0.2); g.gain.setValueAtTime(0.18 * v, t + 2.5); g.gain.linearRampToValueAtTime(0, t + 3);
  }
  private flyover(): void {
    const t = this.ctx!.currentTime, c = this.ctx!, n = this.src(this.pink, false), lp = this.filt('lowpass', 300), p = this.pan(-0.9) as StereoPannerNode, g = this.gain(0);
    n.connect(lp); lp.connect(g); g.connect(p); p.connect(this.envBus);
    lp.frequency.setValueAtTime(300, t); lp.frequency.linearRampToValueAtTime(3000, t + 2.5); lp.frequency.linearRampToValueAtTime(400, t + 6);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.6, t + 2.5); g.gain.linearRampToValueAtTime(0, t + 6.5);
    if (p.pan) { p.pan.setValueAtTime(-0.9, t); p.pan.linearRampToValueAtTime(0.9, t + 5); }
    n.start(t); n.stop(t + 7); void c;
  }
  /** 緊急車両：遠くから近づいて通り過ぎる（音の高さが下がる＝ドップラー） */
  private siren(kind: 'ambulance' | 'fire' | 'police', i: Info): void {
    const c = this.ctx!, t = c.currentTime + 0.05, dur = 11, ang = Math.random() * Math.PI * 2, ox = Math.cos(ang), oz = Math.sin(ang), side = rnd(80, 260);
    const lx = i.ground ? i.cam.x : i.tx, lz = i.ground ? i.cam.z : i.tz;
    const os = c.createOscillator(), g = this.gain(0), p = this.pan(0) as StereoPannerNode, lp = this.filt('lowpass', 2500);
    os.type = kind === 'ambulance' ? 'square' : 'sawtooth'; os.connect(lp); lp.connect(g); g.connect(p); p.connect(this.envBus); const w = this.gain(0.25); g.connect(w); w.connect(this.verbIn);
    const steps = 44;
    for (let k = 0; k <= steps; k++) {
      const q = k / steps, tt = t + q * dur, along = (q - 0.5) * 900, x = lx + ox * along - oz * side, z = lz + oz * along + ox * side;
      const a = this.at(i, x, z, 180), vr = (q < 0.5 ? 1 : -1) * Math.abs(along) / Math.hypot(along, side), dop = 1 + 0.045 * vr;
      g.gain.linearRampToValueAtTime(0.22 * a.v, tt); if (p.pan) p.pan.linearRampToValueAtTime(clamp(a.pan, -0.9, 0.9), tt);
      let f: number;
      if (kind === 'ambulance') f = (Math.floor(tt / 0.65) % 2 ? 770 : 960); // ピーポー
      else if (kind === 'police') f = 600 + 500 * Math.abs(Math.sin(tt * Math.PI / 2.4));
      else f = 450 + 520 * (0.5 - 0.5 * Math.cos(tt * Math.PI * 2 / 3.6)); // ウ〜〜
      os.frequency.setValueAtTime(f * dop, tt);
    }
    os.start(t); os.stop(t + dur + 0.2);
    if (kind === 'fire') for (let k = 0; k < 18; k++) { const q = k / 18, a = this.at(i, lx + ox * (q - 0.5) * 900 - oz * side, lz + oz * (q - 0.5) * 900 + ox * side, 180); this.tone(t + q * dur, 1400, 0.1, 0.06 * a.v, this.out('env', a.pan, 0.1), 'bell'); }
    if (kind === 'ambulance' && Math.random() < 0.5) setTimeout(() => this.say('救急車が通ります。道をあけてください。', { rate: 1.1, pitch: 0.9, vol: 0.35 }), 3500);
  }
  /** 夕方 5 時の防災無線のチャイム（オリジナルの旋律・やまびこつき） */
  private yuyake(): void {
    if (!this.ctx) return; const t = this.ctx.currentTime + 0.1, o = this.out('env', 0, 0.2), c = this.ctx;
    const d = c.createDelay(1.5); d.delayTime.value = 0.9; const fb = this.gain(0.38), lp = this.filt('lowpass', 1800); o.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(this.envBus);
    const mel = [67, 69, 72, 72, 74, 72, 69, 67, 64, 67, 69, 67, 64, 62, 60, 60];
    mel.forEach((m, k) => this.tone(t + k * 0.55, mtof(m), k % 4 === 3 ? 0.9 : 0.5, 0.07, o, 'organ'));
  }
  private tofu(): void { // 豆腐屋のラッパ「パ〜プ〜」
    const t = this.ctx!.currentTime, o = this.out('env', rnd(-0.7, 0.7), 0.4);
    this.tone(t, mtof(76), 0.55, 0.05, o, 'brass'); this.tone(t + 0.62, mtof(74), 0.9, 0.05, o, 'brass');
  }

  // ---------------------------------------------------------------- 人の声（端末の読み上げ）
  say(text: string, o: { rate?: number; pitch?: number; vol?: number } = {}): void {
    if (!this.set.on || !this.set.voice) return;
    try {
      const sy = window.speechSynthesis; if (!sy || sy.speaking) return;
      const u = new SpeechSynthesisUtterance(text); u.lang = 'ja-JP'; if (this.voices.length) u.voice = pick(this.voices);
      u.rate = o.rate ?? 1; u.pitch = o.pitch ?? 1; u.volume = clamp((o.vol ?? 0.6) * this.set.vol); sy.speak(u);
    } catch { /* 読み上げなし */ }
  }

  // ---------------------------------------------------------------- ゲームのできごと
  private events(s: GameState, i: Info): void {
    const act = new Set(s.events.active.map(e => e.id));
    this.typhoon = act.has('typhoon'); this.fireEvent = act.has('fireDelay');
    for (const e of s.events.active) {
      const key = `${e.id}:${e.start}`; if (this.seenEvents.has(key)) continue; this.seenEvents.add(key);
      if (e.id === 'quake') this.quake();
      else if (e.id === 'megaQuake' || e.id === 'nankai') { this.quake(); setTimeout(() => { this.say(e.id === 'nankai' ? '大津波警報。大津波警報。海岸付近や川沿いの方は、ただちに高台や避難ビルへ避難してください。' : '地震です。落ち着いて、身の安全を確保してください。', { rate: 0.95, pitch: 0.9, vol: 0.7 }); }, 2500); if (e.id === 'nankai') setTimeout(() => this.surge(), 9000); }
      else this.dingdong();
      if (e.id === 'fireDelay') this.siren('fire', i);
    }
    const er = s.pendingElection;
    if (er && er.month !== this.seenElect) { this.seenElect = er.month; this.say('ただいまより、開票速報をお伝えします。', { vol: 0.6 }); setTimeout(() => { if (er.win) { this.fanfare(); this.cheer(1, 4); setTimeout(() => this.say('当選確実です！おめでとうございます！', { pitch: 1.1, vol: 0.7 }), 1200); } else { this.sad(); this.say('現職は、落選が確実となりました。', { vol: 0.6 }); } }, 6800); } // 開票速報の演出（約 7 秒）に合わせる
    if (s.celeb && s.celeb.month !== this.seenCeleb && s.month - s.celeb.month <= 1) { this.seenCeleb = s.celeb.month; this.fanfare(); this.cheer(0.9, 3.5); }
    const th = s.thanks?.length ?? 0; if (th > this.seenThanks && this.lastMonth >= 0) this.chime([79, 84], 0.1, 0.12); this.seenThanks = th;
    const M = s.mayor;
    if (M) {
      const md = Object.keys(M.medals).length, rk = M.ranks.length, pts = M.pts;
      if (this.mk) {
        if (rk > this.mk.rk) { this.drumroll(); setTimeout(() => { this.fanfare(); if (M.ranks.at(-1)!.awards.length) this.cheer(0.9, 3.5); else this.applause(0.6, 2.5); }, 1600); }
        else if (levelOf(pts) > levelOf(this.mk.pts)) { this.fanfare(); this.applause(0.7, 3); }
        else if (md > this.mk.md) this.chime([76, 79, 84, 88], 0.11, 0.1, 'bell');
      }
      this.mk = { month: s.month, md, rk, pts };
    }
    this.lastMonth = s.month;
  }
  private mk: { month: number; md: number; rk: number; pts: number } | null = null;
  private drumroll(): void { const t = this.ctx!.currentTime, o = this.out('sfx', 0, 0.3); for (let k = 0; k < 28; k++) this.hit(t + k * 0.05, o, { f: 220, type: 'lowpass', dur: 0.08, vel: 0.15 + k * 0.012, buf: this.brown }); this.hit(t + 1.45, o, { pitch: [140, 50], dur: 0.5, vel: 0.6 }); }
  /** 見えている所の効果音（花火・列車） */
  onView(k: string, x: number, y: number, z: number, i: Info): void {
    if (!this.ctx || !this.set.on || this.ctx.state !== 'running') return;
    const a = this.at(i, x, z, 500, y), c = this.ctx;
    if (k === 'fwLaunch') { // ひゅ〜
      const t = c.currentTime, os = c.createOscillator(), g = this.gain(0), o = this.out('env', a.pan, 0.2); os.frequency.setValueAtTime(700, t); os.frequency.exponentialRampToValueAtTime(1900, t + 0.9); os.connect(g); g.connect(o);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.03 * a.v, t + 0.1); g.gain.linearRampToValueAtTime(0, t + 0.95); os.start(t); os.stop(t + 1);
    } else if (k === 'fwBurst') { // 光ってから、距離に応じて遅れて「ドーン」、パチパチ
      const t = c.currentTime + Math.min(1.5, a.d / 340), o = this.out('env', a.pan, 0.7);
      this.hit(t, o, { pitch: [90, 38], dur: 1.4, vel: 0.9 * a.v }); this.hit(t, o, { f: 220, type: 'lowpass', dur: 1.0, vel: 1.4 * a.v, buf: this.brown });
      for (let n = 0; n < 16; n++) this.hit(t + 0.4 + Math.random() * 1.2, o, { f: rnd(2500, 6000), q: 2, dur: 0.02, vel: 0.25 * a.v });
      if (Math.random() < 0.2) this.formant(t + 0.6, rnd(200, 300), 0.6, 0.04 * a.v, o, 'a', 0.05); // た〜まや〜
    } else if (k === 'complete' && a.v > 0.05) { // 完成：きらきらの上り音と小さな拍手
      const t = c.currentTime + 0.05, o = this.out('env', a.pan, 0.5);
      [76, 79, 84, 88].forEach((m, n) => this.tone(t + n * 0.09, mtof(m), 0.3, 0.07 * a.v, o, 'glock'));
      for (let n = 0; n < 24; n++) this.hit(t + 0.3 + Math.random() * 1.1, o, { f: rnd(1500, 3500), q: 1.5, dur: 0.03, vel: 0.2 * a.v });
    } else if (k === 'shinPass' && a.v > 0.08) { // 新幹線の通過：風を切る音
      const t = c.currentTime, o = this.out('env', a.pan, 0.3); this.hit(t, o, { f: 900, type: 'bandpass', dur: 2.2, vel: 1.4 * a.v, buf: this.brown }); this.hit(t + 0.3, o, { f: 260, type: 'lowpass', dur: 1.8, vel: 1.2 * a.v, buf: this.brown });
    } else if (k === 'thunder') { // 光ってから、遅れてゴロゴロ
      const t = c.currentTime + 0.6 + Math.random() * 1.5, o = this.out('env', (Math.random() - 0.5) * 0.8, 0.8);
      this.hit(t, o, { f: 140, type: 'lowpass', dur: 2.6, vel: 1.6, buf: this.brown }); this.hit(t + 0.05, o, { pitch: [70, 30], dur: 1.8, vel: 0.7 });
    } else if (k === 'firstStep') { // はじめての〇〇
      const t = c.currentTime + 0.02, o = this.out('sfx', 0, 0.5); [72, 76, 79, 84].forEach((m, n) => this.tone(t + n * 0.08, mtof(m), 0.35, 0.08, o, 'glock'));
    } else if (k === 'trainStop' && a.v > 0.2) {
      const t = c.currentTime + 0.4, o = this.out('env', a.pan, 0.4);
      // 発車メロディ（オリジナル）
      [72, 76, 79, 84, 81, 79, 76, 79, 72, 74, 76, 72].forEach((m, n) => this.tone(t + 2 + n * 0.2, mtof(m), 0.25, 0.06 * a.v, o, 'glock'));
      if (Math.random() < 0.6) this.say(pick(['まもなく、電車が発車します。ドアが閉まります。ご注意ください。', 'ご乗車ありがとうございます。この電車は、各駅停車です。', '黄色い線の内側まで、お下がりください。']), { rate: 1.05, pitch: 1.15, vol: 0.45 * Math.min(1, a.v * 1.5) });
    }
  }
  private quake(): void {
    const t = this.ctx!.currentTime, o = this.out('sfx', 0, 0.3);
    const n = this.src(this.brown, false), lp = this.filt('lowpass', 90), g = this.gain(0); n.connect(lp); lp.connect(g); g.connect(o);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.6, t + 1.5); g.gain.setValueAtTime(1.6, t + 4); g.gain.linearRampToValueAtTime(0, t + 7); n.start(t); n.stop(t + 7.5);
    for (let k = 0; k < 40; k++) this.hit(t + 1 + Math.random() * 4, o, { f: rnd(800, 3000), q: 3, dur: 0.05, vel: 0.15 }); // 物がカタカタ
    setTimeout(() => this.alarm(), 7000);
  }
  /** 津波：低いうなりと波の轟音がしだいに大きくなり、引いていく */
  private surge(): void {
    if (!this.ctx) return; const t = this.ctx.currentTime, o = this.out('sfx', 0, 0.4);
    const n = this.src(this.brown, false), lp = this.filt('lowpass', 400), g = this.gain(0); n.connect(lp); lp.connect(g); g.connect(o);
    lp.frequency.setValueAtTime(200, t); lp.frequency.linearRampToValueAtTime(900, t + 8); lp.frequency.linearRampToValueAtTime(250, t + 22);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(1.4, t + 8); g.gain.linearRampToValueAtTime(0.6, t + 16); g.gain.linearRampToValueAtTime(0, t + 24); n.start(t); n.stop(t + 25);
    const w = this.src(this.pink, false), hp = this.filt('bandpass', 1200, 0.5), g2 = this.gain(0); w.connect(hp); hp.connect(g2); g2.connect(o);
    g2.gain.setValueAtTime(0, t); g2.gain.linearRampToValueAtTime(0.5, t + 9); g2.gain.linearRampToValueAtTime(0, t + 22); w.start(t); w.stop(t + 23);
  }
  /** 防災のお知らせ（ピンポンパンポーン） */
  private dingdong(): void { this.chime([65, 69, 72, 77], 0.32, 0.12, 'organ'); }
  private alarm(): void { const t = this.ctx!.currentTime, o = this.out('sfx', 0, 0.3); for (let k = 0; k < 6; k++) { this.tone(t + k * 0.5, 880, 0.2, 0.06, o, 'organ'); this.tone(t + k * 0.5 + 0.25, 660, 0.2, 0.06, o, 'organ'); } }
  private fanfare(): void {
    if (!this.ctx) return; const t = this.ctx.currentTime + 0.05, o = this.out('sfx', 0, 0.35);
    const seq: [number, number, number][] = [[0, 0.15, 67], [0.15, 0.15, 67], [0.3, 0.15, 67], [0.45, 0.6, 72], [1.1, 0.3, 69], [1.4, 0.3, 72], [1.7, 1.2, 76]];
    for (const [d, l, m] of seq) { this.tone(t + d, mtof(m), l, 0.08, o, 'brass'); this.tone(t + d, mtof(m - 12), l, 0.05, o, 'brass'); }
    for (const m of [48, 55, 64]) this.tone(t + 1.7, mtof(m), 1.4, 0.05, o, 'brass');
    this.hit(t + 1.7, o, { pitch: [120, 50], dur: 0.6, vel: 0.5 });
  }
  private sad(): void { const t = this.ctx!.currentTime, o = this.out('sfx', 0, 0.4); [67, 65, 63, 60].forEach((m, k) => this.tone(t + k * 0.5, mtof(m), 0.8, 0.07, o, 'epiano')); }

  /** 操作の効果音 */
  uiAct(a: Action, ok: boolean): void {
    if (!this.ctx || !this.set.on || !this.set.sfx) return;
    const t = this.ctx.currentTime, o = this.out('sfx', 0, 0.1);
    if (!ok) { for (const k of [0, 0.12]) { const os = this.ctx.createOscillator(), g = this.gain(0); os.type = 'square'; os.frequency.value = 160; os.connect(g); g.connect(o); g.gain.setValueAtTime(0.05, t + k); g.gain.setTargetAtTime(0, t + k + 0.07, 0.02); os.start(t + k); os.stop(t + k + 0.2); } return; }
    const ty = a.type;
    if (ty === 'build' || ty === 'sandboxPlace') { this.hit(t, o, { pitch: [180, 70], dur: 0.18, vel: 0.5 }); this.hit(t + 0.12, o, { f: 1800, q: 4, dur: 0.06, vel: 0.3 }); this.tone(t + 0.18, mtof(84), 0.2, 0.05, o, 'glock'); this.tone(t + 0.26, mtof(91), 0.3, 0.04, o, 'glock'); }
    else if (ty === 'demolish' || ty === 'buyout') { this.hit(t, o, { f: 300, type: 'lowpass', dur: 0.6, vel: 0.9, buf: this.brown }); for (let k = 0; k < 8; k++) this.hit(t + 0.05 + Math.random() * 0.4, o, { f: rnd(600, 2400), q: 2, dur: 0.05, vel: 0.2 }); }
    else if (ty === 'road' || ty === 'rail' || ty === 'widen' || ty === 'tunnel' || ty === 'bridge') { this.hit(t, o, { f: 900, q: 0.8, dur: 0.18, vel: 0.35 }); this.hit(t + 0.1, o, { f: 600, q: 0.8, dur: 0.15, vel: 0.25 }); }
    else if (ty === 'terra') { this.hit(t, o, { f: 140, type: 'lowpass', dur: 0.9, vel: 1.1, buf: this.brown }); }
    else if (ty === 'zone' || ty === 'area') { this.tone(t, mtof(79), 0.12, 0.04, o, 'pluck'); this.tone(t + 0.06, mtof(84), 0.15, 0.04, o, 'pluck'); }
    else if (ty === 'borrow') { this.coins(); }
    else this.tone(t, mtof(81), 0.12, 0.035, o, 'pluck');
  }
  /** チャリン（お金） */
  coins(): void { if (!this.ctx) return; const t = this.ctx.currentTime, o = this.out('sfx', 0, 0.2); for (let k = 0; k < 3; k++) { this.tone(t + k * 0.07, 2600 + k * 400, 0.15, 0.04, o, 'bell'); } }
  click(): void { if (!this.ctx || !this.set.on || !this.set.sfx) return; const t = this.ctx.currentTime; this.hit(t, this.out('sfx', 0, 0), { f: 2400, q: 2, dur: 0.025, vel: 0.12 }); }

  // ---------------------------------------------------------------- BGM（その場で作曲する）
  private styleOf(s: GameState, i: Info): string {
    if (s.events.active.some(e => e.id === 'quake' || e.id === 'typhoon') || s.fiscal?.status === 'rebuild') return 'crisis';
    if (i.festOn) return 'matsuri';
    if (s.mode === 'term' && s.termStart + s.termLength - s.month <= 3 && s.termStart + s.termLength - s.month > 0) return 'senkyo';
    if (s.pol?.rec?.plan) return 'hope';
    const h = i.hour;
    if ((i.calM === 11 || i.calM <= 1) && h >= 9 && h < 19) return 'winter';
    if (s.stats.pop >= 30000 && (h >= 19 || h < 5 || (h >= 9 && h < 16))) return 'city';
    return h >= 5 && h < 9 ? 'morning' : h >= 9 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'evening' : 'night';
  }
  private music(s: GameState, i: Info): void {
    if (!this.set.bgm) return;
    const c = this.ctx!, want = this.styleOf(s, i), B = this.bgm;
    if (!B.style) B.style = want;
    while (B.next < c.currentTime + 0.25) {
      const st = STYLES[B.style], beat = 60 / st.bpm, stepDur = beat / 2; // 8 分音符で刻む
      if (B.step % 8 === 0) {
        if (B.bar % 4 === 0 && B.step === 0 && want !== B.style) { B.style = want; B.bar = 0; B.motif = []; continue; } // 4 小節の区切りで曲調を変える
        if (B.bar % 4 === 0 && B.step === 0) B.motif = this.motif(STYLES[B.style]);
      }
      this.playStep(STYLES[B.style], B.next, stepDur);
      B.next += stepDur; B.step++; if (B.step >= 8) { B.step = 0; B.bar++; }
      void st;
    }
  }
  private motif(st: Style): number[] {
    // 2 小節ぶんの旋律（-1 は休み）。同じ旋律を繰り返して少し変える＝覚えやすい
    const out: number[] = []; let deg = Math.floor(Math.random() * 3) + 2;
    for (let k = 0; k < 16; k++) { if (Math.random() < st.rest) { out.push(-1); continue; } deg = clamp(deg + pick([-2, -1, -1, 0, 1, 1, 2]), 0, st.scale.length + 2); out.push(deg); }
    return out;
  }
  private playStep(st: Style, t: number, sd: number): void {
    const B = this.bgm, o = this.bgmOut ??= this.out('bgm', 0, 0.45), bar = B.bar, step = B.step;
    const ch = st.prog[bar % st.prog.length], root = st.key + ch[0], tones = ch[1];
    if (st.name === 'matsuri') { this.matsuri(st, t, sd, o); return; }
    if (step === 0) {
      for (const n of tones) this.tone(t, mtof(root + 12 + n), sd * 8, 0.035, o, 'pad');
      this.tone(t, mtof(root - 12 + (st.name === 'crisis' ? 0 : 0)), sd * (st.name === 'night' ? 8 : 3), 0.16, o, 'bass');
    }
    if (st.name !== 'night' && step === 4) this.tone(t, mtof(root - 12 + (bar % 2 ? 7 : 12)), sd * 3, 0.13, o, 'bass');
    // 伴奏
    const comp = st.comp[step];
    if (comp) for (const n of tones.slice(0, 4)) this.tone(t, mtof(root + 12 + n), sd * 1.6, 0.045 * comp, o, st.compInst);
    if (st.name === 'evening' && step % 2 === 1) this.tone(t, mtof(root + 24 + tones[(step >> 1) % tones.length]), sd * 2, 0.03, o, 'pluck');
    // 旋律
    const m = B.motif[(bar % 2) * 8 + step];
    if (m !== undefined && m >= 0 && (bar % 4 !== 3 || step < 6)) {
      const sc = st.scale, oct = Math.floor(m / sc.length), note = st.key + 24 + sc[m % sc.length] + 12 * oct + (bar % 4 === 2 && Math.random() < 0.3 ? sc[1] - sc[0] : 0);
      this.tone(t, mtof(note), sd * (Math.random() < 0.3 ? 2 : 1.1), st.melVel, o, st.mel);
    }
    // 打楽器
    if (st.hat && step % 2 === 0) this.hit(t, o, { f: 8000, type: 'highpass', dur: 0.04, vel: 0.05 * (step % 4 === 2 ? 1.4 : 1) });
    if (st.kick && step % 4 === 0) this.hit(t, o, { pitch: [110, 45], dur: 0.25, vel: st.name === 'crisis' ? 0.5 : 0.3 });
    if (st.name === 'crisis' && step % 2 === 1) this.tone(t, mtof(root - 12), sd * 0.8, 0.08, o, 'bass');
    if (st.snap && (step === 2 || step === 6)) this.hit(t, o, { f: 1800, q: 1.5, dur: 0.06, vel: 0.12 });
  }
  private bgmOut: AudioNode | null = null;
  /** 祭囃子：太鼓（ドン・ドコ）・鉦（チキチン）・篠笛 */
  private matsuri(st: Style, t: number, sd: number, o: AudioNode): void {
    const B = this.bgm, step = B.step, pat = 'D.dD.D.d';
    const c = pat[step]; if (c === 'D') this.hit(t, o, { pitch: [130, 55], dur: 0.35, vel: 0.6 }); else if (c === 'd') this.hit(t, o, { pitch: [150, 70], dur: 0.2, vel: 0.35 });
    if (step % 2 === 1 || (step === 0 && B.bar % 2)) for (const f of [2150, 3300]) this.tone(t, f, 0.05, 0.025, o, 'glock');
    const m = B.motif[(B.bar % 2) * 8 + step];
    if (m !== undefined && m >= 0) { const sc = st.scale, note = st.key + 24 + sc[m % sc.length] + 12 * Math.floor(m / sc.length); this.tone(t, mtof(note), sd * 1.8, 0.06, o, 'flute'); }
  }
}

type Style = { name: string; bpm: number; key: number; prog: [number, number[]][]; scale: number[]; comp: number[]; compInst: 'epiano' | 'pluck' | 'bell' | 'glock'; mel: 'bell' | 'glock' | 'flute' | 'epiano' | 'pluck'; melVel: number; rest: number; hat?: boolean; kick?: boolean; snap?: boolean };
const MAJ7 = [0, 4, 7, 11, 14], M7 = [0, 3, 7, 10, 14], SUS = [0, 5, 7, 10, 14], ADD9 = [0, 4, 7, 14];
const STYLES: Record<string, Style> = {
  morning: { name: 'morning', bpm: 88, key: 50, prog: [[0, ADD9], [7, SUS], [9, M7], [5, MAJ7]], scale: [0, 2, 4, 7, 9], comp: [0, 0, 1, 0, 0, 1, 0, 0], compInst: 'pluck', mel: 'glock', melVel: 0.045, rest: 0.55 },
  day: { name: 'day', bpm: 98, key: 48, prog: [[0, MAJ7], [9, M7], [5, MAJ7], [7, SUS], [4, M7], [9, M7], [2, M7], [7, SUS]], scale: [0, 2, 4, 7, 9], comp: [1, 0, 0, 0.7, 0, 0, 0.8, 0], compInst: 'epiano', mel: 'bell', melVel: 0.05, rest: 0.45, hat: true, snap: true },
  evening: { name: 'evening', bpm: 76, key: 41, prog: [[5, MAJ7], [4, M7], [2, M7], [0, MAJ7], [5, MAJ7], [4, M7], [9, M7], [7, SUS]], scale: [0, 2, 4, 7, 9], comp: [1, 0, 0, 0, 0.6, 0, 0, 0], compInst: 'epiano', mel: 'flute', melVel: 0.05, rest: 0.55 },
  night: { name: 'night', bpm: 62, key: 51, prog: [[0, MAJ7], [2, ADD9], [0, MAJ7], [-2, MAJ7]], scale: [0, 2, 4, 6, 7, 11], comp: [0, 0, 0, 0, 0, 0, 0, 0], compInst: 'epiano', mel: 'epiano', melVel: 0.05, rest: 0.75 },
  crisis: { name: 'crisis', bpm: 104, key: 50, prog: [[0, M7], [-4, MAJ7], [-7, M7], [-5, SUS]], scale: [0, 2, 3, 7, 8], comp: [0.8, 0, 0, 0.8, 0, 0, 0.8, 0], compInst: 'pluck', mel: 'pluck', melVel: 0.04, rest: 0.6, kick: true },
  // v31：選挙戦・冬・大きな街・復興
  senkyo: { name: 'senkyo', bpm: 120, key: 48, prog: [[0, MAJ7], [5, MAJ7], [7, SUS], [0, ADD9]], scale: [0, 2, 4, 7, 9], comp: [1, 0, 0.8, 0, 1, 0, 0.8, 0], compInst: 'pluck', mel: 'glock', melVel: 0.05, rest: 0.35, kick: true },
  winter: { name: 'winter', bpm: 70, key: 53, prog: [[0, ADD9], [-3, M7], [5, MAJ7], [7, SUS]], scale: [0, 2, 4, 7, 9], comp: [0.6, 0, 0, 0, 0.5, 0, 0, 0], compInst: 'epiano', mel: 'bell', melVel: 0.045, rest: 0.6 },
  city: { name: 'city', bpm: 92, key: 46, prog: [[2, M7], [7, SUS], [0, MAJ7], [9, M7]], scale: [0, 2, 3, 5, 7, 9, 10], comp: [1, 0, 0.6, 0, 0.8, 0, 0.6, 0.4], compInst: 'epiano', mel: 'epiano', melVel: 0.045, rest: 0.5, hat: true },
  hope: { name: 'hope', bpm: 80, key: 50, prog: [[0, ADD9], [5, MAJ7], [9, M7], [7, SUS]], scale: [0, 2, 4, 7, 9], comp: [0.7, 0, 0, 0.6, 0, 0, 0.6, 0], compInst: 'pluck', mel: 'flute', melVel: 0.05, rest: 0.5 },
  matsuri: { name: 'matsuri', bpm: 112, key: 50, prog: [[0, ADD9]], scale: [0, 2, 5, 7, 9], comp: [0, 0, 0, 0, 0, 0, 0, 0], compInst: 'pluck', mel: 'flute', melVel: 0.06, rest: 0.25 },
};

export const sound = new Sound();
