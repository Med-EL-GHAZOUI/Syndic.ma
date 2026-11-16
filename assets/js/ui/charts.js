// Dependency-free SVG charts. Each chart carries a text alternative.
import { esc } from '../core/dom.js';

const compact = (v) => (v >= 1000 ? `${Math.round(v / 100) / 10} k` : String(Math.round(v)));

function niceMax(v) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

/** Grouped bar chart. series: [{ name, color, values[] }] */
export function barChart({ labels, series, height = 230, fmt = (v) => v, title = '' }) {
  const W = 640;
  const H = height;
  const pad = { l: 46, r: 8, t: 10, b: 26 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const group = iw / labels.length;
  const bw = Math.min(22, (group - 12) / series.length);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  const grid = ticks.map((k) => {
    const y = pad.t + ih - ih * k;
    return `<line class="grid-line" x1="${pad.l}" x2="${W - pad.r}" y1="${y}" y2="${y}"/><text x="${pad.l - 8}" y="${y + 4}" text-anchor="end">${compact(max * k)}</text>`;
  }).join('');

  const bars = labels.map((label, i) => {
    const x0 = pad.l + group * i + (group - bw * series.length - 4 * (series.length - 1)) / 2;
    const rects = series.map((s, j) => {
      const v = s.values[i] || 0;
      const h = Math.max(v > 0 ? 2 : 0, (v / max) * ih);
      const x = x0 + j * (bw + 4);
      return `<rect x="${x.toFixed(1)}" y="${(pad.t + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${s.color}"><title>${esc(`${label} — ${s.name}: ${fmt(v)}`)}</title></rect>`;
    }).join('');
    return `${rects}<text x="${(pad.l + group * i + group / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(label)}</text>`;
  }).join('');

  const summary = series.map((s) => `${s.name}: ${labels.map((l, i) => `${l} ${fmt(s.values[i] || 0)}`).join(', ')}`).join('. ');
  return `
    <div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${title}. ${summary}`)}">${grid}${bars}</svg>`;
}

/** Donut chart. segments: [{ label, value, color }] */
export function donut({ segments, centerValue = '', centerLabel = '', fmt = (v) => v }) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  const r = 54;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = total
    ? segments.filter((s) => s.value > 0).map((s) => {
      const len = (s.value / total) * c;
      const arc = `<circle cx="75" cy="75" r="${r}" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${len.toFixed(2)} ${(c - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 75 75)"><title>${esc(`${s.label}: ${fmt(s.value)}`)}</title></circle>`;
      offset += len;
      return arc;
    }).join('')
    : `<circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--neutral-bg)" stroke-width="18"/>`;
  const label = segments.map((s) => `${s.label}: ${fmt(s.value)}`).join(', ');
  return `
    <div class="donut-wrap">
      <svg class="chart" viewBox="0 0 150 150" role="img" aria-label="${esc(label)}">
        ${arcs}
        <text class="donut-center" x="75" y="76" text-anchor="middle">${esc(centerValue)}</text>
        <text x="75" y="93" text-anchor="middle">${esc(centerLabel)}</text>
      </svg>
      <div class="chart-legend" style="flex-direction:column;gap:8px">
        ${segments.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)} · <strong class="num">${esc(fmt(s.value))}</strong></span>`).join('')}
      </div>
    </div>`;
}

/** Horizontal bars. items: [{ label, value }] */
export function hbars({ items, fmt = (v) => v, color = 'var(--brand-600)' }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return `<div class="hbars">${items.map((i) => `
    <div class="hbar-row">
      <span>${esc(i.label)}</span>
      <div class="progress" role="presentation"><span style="width:${((i.value / max) * 100).toFixed(1)}%;background:${color}"></span></div>
      <strong class="num">${esc(fmt(i.value))}</strong>
    </div>`).join('')}</div>`;
}

export const COLORS = {
  brand: 'var(--brand-600)',
  accent: 'var(--accent-500)',
  success: 'var(--success)',
  warning: 'var(--gold-500)',
  danger: 'var(--danger)',
  neutral: 'var(--border-strong)',
  info: 'var(--info)',
};
