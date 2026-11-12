// 小さな折れ線グラフ（SVG）。1 軸、線 2px、端点に値、ホバーで十字線と値。文字は系列色を着ない。
export interface Series { name: string; color: string; values: number[]; lo?: number[]; hi?: number[] }
export interface ChartSpec { id: string; series: Series[]; fmt: (v: number) => string; xLabel: (i: number) => string; zero?: boolean; ref?: { v: number; label: string } }

const registry = new Map<string, ChartSpec & { geom: { ml: number; pw: number; mt: number; ph: number; lo: number; hi: number; n: number; w: number } }>();

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9)))), f = raw / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * p;
}

export function chartSvg(spec: ChartSpec, w = 336, h = 118): string {
  const ml = 44, mr = 50, mt = 8, mb = 17, pw = w - ml - mr, ph = h - mt - mb;
  const n = Math.max(2, ...spec.series.map(s => s.values.length));
  let lo = Infinity, hi = -Infinity;
  for (const s of spec.series) for (const arr of [s.values, s.lo, s.hi]) if (arr) for (const v of arr) { if (v < lo) lo = v; if (v > hi) hi = v; }
  if (spec.ref) { lo = Math.min(lo, spec.ref.v); hi = Math.max(hi, spec.ref.v); }
  if (spec.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
  if (!isFinite(lo)) { lo = 0; hi = 1; }
  if (hi - lo < 1e-9) { hi += 1; lo -= 1; }
  const step = niceStep((hi - lo) / 3);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  const X = (i: number) => ml + (pw * i) / (n - 1), Y = (v: number) => mt + ph * (1 - (v - lo) / (hi - lo));
  let out = `<svg class="chart" data-chart="${spec.id}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${spec.series.map(s => s.name).join('、')}の推移">`;
  for (let v = lo; v <= hi + step * 0.01; v += step) out += `<line x1="${ml}" x2="${ml + pw}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="var(--line)" stroke-width="1"/><text x="${ml - 5}" y="${(Y(v) + 3.5).toFixed(1)}" text-anchor="end">${spec.fmt(v)}</text>`;
  if (spec.ref) out += `<line x1="${ml}" x2="${ml + pw}" y1="${Y(spec.ref.v).toFixed(1)}" y2="${Y(spec.ref.v).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1"/><text x="${ml + 3}" y="${(Y(spec.ref.v) - 3).toFixed(1)}">${spec.ref.label}</text>`;
  const ticks = [0, Math.round((n - 1) / 2), n - 1];
  for (const i of ticks) out += `<text x="${X(i).toFixed(1)}" y="${h - 4}" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}">${spec.xLabel(i)}</text>`;
  for (const s of spec.series) if (s.lo && s.hi) {
    const up = s.hi.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' '), dn = s.lo.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).reverse().join(' ');
    out += `<polygon points="${up} ${dn}" fill="${s.color}" fill-opacity="0.13" stroke="none"/>`;
  }
  const ends: { y: number; s: Series }[] = [];
  for (const s of spec.series) {
    if (!s.values.length) continue;
    out += `<polyline points="${s.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ')}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = s.values.length - 1;
    out += `<circle cx="${X(li).toFixed(1)}" cy="${Y(s.values[li]).toFixed(1)}" r="4" fill="${s.color}" stroke="var(--paper)" stroke-width="2"/>`;
    ends.push({ y: Y(s.values[li]), s });
  }
  // 端点の値。重なるときは上下にずらす
  ends.sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 11) ends[i].y = ends[i - 1].y + 11;
  for (const e of ends) out += `<text x="${ml + pw + 7}" y="${(e.y + 3.5).toFixed(1)}" style="fill:var(--ink);font-weight:600">${spec.fmt(e.s.values[e.s.values.length - 1])}</text>`;
  out += `<g class="hover" visibility="hidden"><line class="xh" y1="${mt}" y2="${mt + ph}" stroke="var(--ink-2)" stroke-width="1"/>${spec.series.map((s, k) => `<circle class="hd" data-k="${k}" r="4" fill="${s.color}" stroke="var(--paper)" stroke-width="2"/>`).join('')}</g>`;
  out += `<rect x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent"/></svg>`;
  registry.set(spec.id, { ...spec, geom: { ml, pw, mt, ph, lo, hi, n, w } });
  return out;
}

export function legendHtml(series: Series[], band?: string): string {
  if (series.length < 2 && !band) return '';
  return `<div class="legend">${series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}${band ? `<span><i class="band" style="background:var(--ink-2)"></i>${band}</span>` : ''}</div>`;
}

/** パネル全体に 1 回だけ付けるホバー処理 */
export function attachChartHover(root: HTMLElement, tip: HTMLElement): void {
  const hide = () => { tip.hidden = true; root.querySelectorAll('.chart .hover').forEach(g => g.setAttribute('visibility', 'hidden')); };
  root.addEventListener('pointermove', e => {
    const svg = (e.target as Element).closest?.('svg.chart') as SVGSVGElement | null;
    if (!svg) { hide(); return; }
    const spec = registry.get(svg.dataset.chart!); if (!spec) return;
    const r = svg.getBoundingClientRect(), g = spec.geom, sx = ((e.clientX - r.left) / r.width) * g.w;
    const i = Math.max(0, Math.min(g.n - 1, Math.round(((sx - g.ml) / g.pw) * (g.n - 1))));
    const X = g.ml + (g.pw * i) / (g.n - 1), Y = (v: number) => g.mt + g.ph * (1 - (v - g.lo) / (g.hi - g.lo));
    const hv = svg.querySelector('.hover')!; hv.setAttribute('visibility', 'visible');
    const xh = hv.querySelector('.xh')!; xh.setAttribute('x1', String(X)); xh.setAttribute('x2', String(X));
    hv.querySelectorAll('.hd').forEach(c => { const s = spec.series[Number((c as SVGElement).dataset.k)]; const v = s.values[i]; if (v === undefined) { c.setAttribute('visibility', 'hidden'); return; } c.setAttribute('visibility', 'inherit'); c.setAttribute('cx', String(X)); c.setAttribute('cy', String(Y(v))); });
    tip.innerHTML = `${spec.xLabel(i)}<br>` + spec.series.filter(s => s.values[i] !== undefined).map(s => `<i style="background:${s.color}"></i>${s.name} <b>${spec.fmt(s.values[i])}</b>${s.lo && s.hi ? `（${spec.fmt(s.lo[i])}〜${spec.fmt(s.hi[i])}）` : ''}`).join('<br>');
    tip.hidden = false;
    const host = tip.offsetParent as HTMLElement, hr = host.getBoundingClientRect();
    let tx = e.clientX - hr.left + 14, ty = e.clientY - hr.top - 10;
    if (tx + tip.offsetWidth > hr.width - 8) tx = e.clientX - hr.left - tip.offsetWidth - 14;
    tip.style.left = Math.max(4, tx) + 'px'; tip.style.top = Math.max(4, ty) + 'px';
  });
  root.addEventListener('pointerleave', hide);
}
