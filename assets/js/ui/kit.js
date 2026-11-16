// Small HTML builders shared by pages.
import { esc } from '../core/dom.js';
import { t, tl } from '../core/i18n.js';
import { db } from '../core/store.js';
import { icon } from './icons.js';

const TONES = {
  paid: 'success', partial: 'warning', unpaid: 'neutral', overdue: 'danger',
  pending: 'warning', recorded: 'success', reversed: 'danger', rejected: 'danger',
  draft: 'neutral', issued: 'info', closed: 'neutral', approved: 'info', cancelled: 'neutral',
  new: 'info', in_progress: 'warning', resolved: 'success',
  planned: 'info', done: 'success', convened: 'warning', held: 'success',
  active: 'success', inactive: 'neutral', trial: 'warning', suspended: 'danger',
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger',
  adopted: 'success', owner_occupied: 'success', rented: 'info', vacant: 'neutral',
  present: 'success', proxy: 'info', absent: 'neutral', owner: 'primary', tenant: 'info',
  former: 'neutral', works: 'warning', meeting: 'primary', info: 'info',
};

export const badge = (text, tone = 'neutral') => `<span class="badge badge-${tone}">${esc(text)}</span>`;
export const statusBadge = (group, value) => badge(tl(group, value), TONES[value] || 'neutral');

export function pageHeader({ title, subtitle = '', actions = '', back = '' }) {
  return `
    ${back ? `<a class="back-link" href="${back}">${icon('chevronLeft', { cls: 'flip' })}${esc(t('common.back'))}</a>` : ''}
    <header class="page-header">
      <div><h1>${esc(title)}</h1>${subtitle ? `<p class="page-sub">${esc(subtitle)}</p>` : ''}</div>
      <div class="page-actions">${actions}</div>
    </header>`;
}

export const btn = ({ act, label, icon: ic = '', variant = 'primary', small = false }) =>
  `<button type="button" class="btn btn-${variant} ${small ? 'btn-sm' : ''}" data-act="${act}">${ic ? icon(ic) : ''}<span>${esc(label)}</span></button>`;

export function kpi({ label, value, hint = '', icon: ic = 'chart', tone = '' }) {
  return `
    <div class="card kpi">
      <span class="kpi-icon ${tone ? `tone-${tone}` : ''}">${icon(ic)}</span>
      <div>
        <div class="kpi-label">${esc(label)}</div>
        <div class="kpi-value">${esc(value)}</div>
        ${hint ? `<div class="kpi-hint">${esc(hint)}</div>` : ''}
      </div>
    </div>`;
}

export function emptyState({ title, text = '', icon: ic = 'inbox', action = '' }) {
  return `<div class="empty">${icon(ic)}<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${action}</div>`;
}

export const initials = (name) =>
  String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export const avatar = (name) => `<span class="avatar" aria-hidden="true">${esc(initials(name))}</span>`;

export const userCell = (name, sub = '') =>
  `<div class="cell-user">${avatar(name)}<div><div class="cell-main">${esc(name)}</div>${sub ? `<div class="cell-sub">${esc(sub)}</div>` : ''}</div></div>`;

export const twoLine = (main, sub = '') =>
  `<div class="cell-main">${esc(main)}</div>${sub ? `<div class="cell-sub">${esc(sub)}</div>` : ''}`;

export function tabs(items, active) {
  return `<nav class="tabs" aria-label="${esc(t('common.sections'))}">${items
    .map((i) => `<a class="tab" href="${i.href}" ${i.id === active ? 'aria-current="page"' : ''}>${esc(i.label)}</a>`)
    .join('')}</nav>`;
}

/** pairs: [[label, htmlValue]] — values must already be escaped. */
export const dl = (pairs) =>
  `<dl class="dl">${pairs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${v || '—'}</dd></div>`).join('')}</dl>`;

export const progress = (ratio, warn = false) =>
  `<div class="progress ${warn ? 'warn' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(ratio * 100)}"><span style="width:${Math.min(100, Math.round(ratio * 100))}%"></span></div>`;

// ---- Lookups used across pages -------------------------------------------

export const residenceName = (id) => db.get('residences', id)?.name || '—';

export function unitLabel(unitOrId) {
  const unit = typeof unitOrId === 'string' ? db.get('units', unitOrId) : unitOrId;
  if (!unit) return '—';
  const building = db.get('buildings', unit.buildingId);
  return building ? `${building.name} · ${unit.number}` : unit.number;
}

export const fullName = (p) => (p ? `${p.firstName} ${p.lastName}` : '—');

export function unitOccupants(unitId) {
  const list = db.all('residents').filter((r) => r.unitId === unitId && r.active);
  return { owner: list.find((r) => r.type === 'owner') || null, tenant: list.find((r) => r.type === 'tenant') || null };
}

export function occupancyOf(unitId) {
  const { owner, tenant } = unitOccupants(unitId);
  if (tenant) return 'rented';
  if (owner && owner.livesIn) return 'owner_occupied';
  return 'vacant';
}

/** Options for a unit select within one residence. */
export function unitOptions(residenceId) {
  return db
    .all('units')
    .filter((u) => u.residenceId === residenceId)
    .map((u) => ({ value: u.id, label: unitLabel(u) }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
