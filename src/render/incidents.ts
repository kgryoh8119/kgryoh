// v95：描画の中の交通事故・火災・取り締まり（見ている所の近くで起き、緊急車両が駆け付ける）。
// ここは「何が・どのくらいの頻度で・どの車が出動するか・どう知らせるか」の決まりだけを持つ（乱数は呼び出し側が渡す。sim の状態と乱数には触れない）。
// 車を止める・出動させる・描くのは scene.ts（既存の v87 の緊急出動 dispatch / emTick の上に足す）。

/** 外へ知らせるできごとの種類（住民のシミュレーションの統計とつなぐ口。統合は (b) の担当） */
export type IncKind = 'crash' | 'pedestrian' | 'fire' | 'violation' | 'train';
/** view.onIncident に渡すもの。severity：1 軽い・2 けが人・3 重い。fatal：病院で亡くなった（重い事故の一部）。sub：細かい種類 */
export interface IncidentEvent { kind: IncKind; tile: number; month: number; severity: number; fatal?: boolean; sub?: IncSub }
export type IncSub = 'rear' | 'cross' | 'ped' | 'carFire' | 'bldFire' | 'speed' | 'signal' | 'parking' | 'rail';

/** 起きやすさ 1（sim 側の口が無いときの定数）で、見ている所の近くで 1 件起きるまでの平均の秒数。見ていて数分に 1 回 */
export const INC_BASE_SEC = 150;
/** 次のできごとまでの秒数。rate：その場所・時間帯の起きやすさ（1 が標準。sim の口 view.incidentRate が返す倍率）、pop：人口（少ない町ではまれ） */
export function incInterval(rate: number, pop: number, r: number): number {
  const k = Math.max(0.05, Math.min(6, rate)) * Math.max(0.15, Math.min(1.6, pop / 20000));
  return (INC_BASE_SEC * (0.55 + 0.9 * r)) / k;
}
/** 時間帯の起きやすさ（sim の口が無いときの目安）：夕方の薄暮と朝の通勤時に多く、深夜は少ない */
export function hourRate(h: number): number {
  if (h >= 16.5 && h < 19.5) return 1.5; if (h >= 7 && h < 9.5) return 1.25; if (h >= 0 && h < 5) return 0.45; return 1;
}

/** できごとの種類を選ぶ（r は 0〜1 の乱数）。線路が無ければ人身事故は起きない */
export function pickInc(r: number, hasRail: boolean): { kind: IncKind; sub: IncSub } {
  const T: [number, IncKind, IncSub][] = [[0.22, 'crash', 'rear'], [0.34, 'crash', 'cross'], [0.46, 'pedestrian', 'ped'], [0.53, 'fire', 'carFire'], [0.6, 'fire', 'bldFire'], [0.74, 'violation', 'speed'], [0.84, 'violation', 'signal'], [0.95, 'violation', 'parking'], [1, 'train', 'rail']];
  for (const [p, kind, sub] of T) if (r < p) { if (kind === 'train' && !hasRail) return { kind: 'crash', sub: 'rear' }; return { kind, sub }; }
  return { kind: 'crash', sub: 'rear' };
}
/** 重さ：1 物損・2 けが人・3 重い（r は 0〜1）。歩行者・火災・人身事故は重くなりやすい */
export function incSeverity(sub: IncSub, r: number): 1 | 2 | 3 {
  const hi = sub === 'ped' || sub === 'rail' ? 0.45 : sub === 'cross' || sub === 'bldFire' ? 0.18 : sub === 'carFire' ? 0.12 : 0.06;
  const mid = sub === 'ped' || sub === 'rail' ? 1 : sub === 'rear' ? 0.45 : 0.6;
  if (sub === 'speed' || sub === 'signal' || sub === 'parking') return 1;
  return r < hi ? 3 : r < mid ? 2 : 1;
}
/** 重い事故で、病院に運ばれたあと亡くなる割合（控えめ） */
export const FATAL_P = 0.3;

/** 緊急車両の出動の段取り（だれが・どこから）。'police'＝パトカー、'bike'＝白バイ、'amb'＝救急車、'pump'・'ladder'＝消防車、'tow'＝レッカー車 */
export type Unit = 'police' | 'bike' | 'amb' | 'pump' | 'ladder' | 'tow';
export function incUnits(sub: IncSub, sev: number): Unit[] {
  switch (sub) {
    case 'rear': case 'cross': return [...(['police'] as Unit[]), ...(sev >= 2 ? ['amb'] as Unit[] : []), ...(sev >= 3 ? ['police', 'bike'] as Unit[] : []), 'tow'];
    case 'ped': return ['amb', 'police', ...(sev >= 3 ? ['police'] as Unit[] : [])];
    case 'carFire': return ['pump', 'amb', 'police'];
    case 'bldFire': return ['pump', 'ladder', 'pump', 'amb', 'police'];
    case 'speed': return ['bike'];
    case 'signal': return ['police'];
    case 'parking': return ['police'];
    case 'rail': return ['police', 'amb'];
  }
}
/** 拠点：交番・警察署・消防署・病院・葬儀場 */
export const POLICE_BASE = ['police', 'koban'], KOBAN = ['koban'], FIRE_BASE = ['fire'], FUNERAL = ['funeralHall', 'crematorium'];

const NAME: Record<IncSub, string> = { rear: '追突事故', cross: '出合い頭の事故', ped: '人身事故（歩行者）', carFire: '車両火災', bldFire: '火災', speed: 'スピード違反', signal: '信号無視', parking: '駐車違反', rail: '鉄道の人身事故' };
const UNIT_NAME: Record<Unit, string> = { police: 'パトカー', bike: '白バイ', amb: '救急車', pump: '消防車', ladder: 'はしご車', tow: 'レッカー車' };
/** 知らせの文（「本町で追突事故。パトカー・救急車が出動」）。表現は控えめに */
export function incText(sub: IncSub, place: string, units: Unit[], late: boolean): string {
  const u = [...new Set(units.filter(x => x !== 'tow'))].map(x => UNIT_NAME[x]).join('・');
  const tail = sub === 'speed' || sub === 'signal' ? `。${u}が追跡` : sub === 'parking' ? '。警察官が確認' : u ? `。${u}が出動` : '';
  return `${place}で${NAME[sub]}${tail}${late && u ? '（拠点が遠く、到着が遅れます）' : ''}`;
}
export function incFollowText(k: 'hosp' | 'tow' | 'ticket' | 'funeral' | 'rail', place: string): string {
  return k === 'hosp' ? `${place}：けが人を病院へ搬送` : k === 'tow' ? `${place}：レッカー車が事故車を移動` : k === 'ticket' ? `${place}：違反の切符を交付` : k === 'funeral' ? `${place}：搬送された方が亡くなりました。葬儀場へ` : `${place}：列車の運転を見合わせ`;
}

/** 画面の右下の小さな知らせ。同じ種類・同じ場所の知らせは 40 秒の間まとめ（「×2」）、表示は 3 件まで。押すとその場所へ */
export class IncidentFeed {
  private items: { key: string; text: string; n: number; t: number; el: HTMLElement }[] = [];
  private root: HTMLElement | null = null;
  constructor(private onPick: (tile: number) => void) {}
  private box(): HTMLElement | null {
    if (typeof document === 'undefined') return null;
    if (this.root && this.root.isConnected) return this.root;
    const d = document.createElement('div'); d.id = 'incfeed';
    d.style.cssText = 'position:fixed;right:12px;bottom:64px;z-index:30;display:flex;flex-direction:column;gap:4px;align-items:flex-end;pointer-events:none;max-width:min(360px,70vw);font-size:12px';
    document.body.appendChild(d); this.root = d; return d;
  }
  push(key: string, text: string, tile: number): void {
    const root = this.box(); if (!root) return;
    const old = this.items.find(o => o.key === key && o.t < 40);
    if (old) { old.n++; old.t = 0; old.el.textContent = `${old.text}（×${old.n}）`; return; }
    const el = document.createElement('button'); el.type = 'button'; el.textContent = text; el.title = '押すとその場所へ';
    el.style.cssText = 'pointer-events:auto;background:rgba(20,28,40,.86);color:#fff;border:1px solid rgba(255,255,255,.25);border-left:4px solid #e0503a;border-radius:6px;padding:5px 9px;text-align:left;cursor:pointer;line-height:1.35';
    el.onclick = () => this.onPick(tile);
    root.appendChild(el); this.items.push({ key, text, n: 1, t: 0, el });
    while (this.items.length > 3) this.items.shift()!.el.remove();
  }
  tick(dt: number): void { for (let k = this.items.length - 1; k >= 0; k--) { const o = this.items[k]; o.t += dt; if (o.t > 14) { o.el.remove(); this.items.splice(k, 1); } } }
}
