// Platform Super Admin: SaaS organizations and subscriptions.
import { esc, on } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { money, date, int } from '../core/format.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can } from '../core/permissions.js';
import { PLANS, planById } from '../data/plans.js';
import { pageHeader, btn, statusBadge, kpi, twoLine } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

const STATUSES = ['trial', 'active', 'suspended'];

const unitCount = (orgId) => {
  const ids = new Set(db.all('residences').filter((r) => r.orgId === orgId).map((r) => r.id));
  return db.all('units').filter((u) => ids.has(u.residenceId)).length;
};

function edit(org) {
  openForm({
    title: org ? t('platform.edit') : t('platform.add'),
    values: org || { plan: 'starter', status: 'trial' },
    fields: [
      { name: 'name', label: t('platform.company'), required: true, full: true, maxLength: 80 },
      { name: 'city', label: t('common.city'), required: true },
      { name: 'contactName', label: t('providers.contact'), required: true },
      { name: 'email', label: t('common.email'), type: 'email', required: true },
      { name: 'phone', label: t('common.phone'), type: 'tel' },
      { name: 'plan', label: t('platform.plan'), type: 'select', required: true, placeholder: false, options: PLANS.map((p) => ({ value: p.id, label: `${tl('plan', p.id)} — ${money(p.price)}/${t('platform.perMonth')}` })) },
      { name: 'status', label: t('common.status'), type: 'select', required: true, placeholder: false, options: enumOptions('orgStatus', STATUSES) },
    ],
    onSubmit: (v) => {
      const data = { name: v.name, city: v.city, contactName: v.contactName, email: v.email, phone: v.phone, plan: v.plan, status: v.status };
      const limit = planById(v.plan).maxUnits;
      if (org && limit && unitCount(org.id) > limit) return t('platform.errPlanLimit', { n: limit });
      if (org) db.update('organizations', org.id, data);
      else db.insert('organizations', data);
      toast(t('common.saved'));
      bus.emit('refresh');
      return true;
    },
  });
}

async function toggleSuspend(org) {
  const suspend = org.status !== 'suspended';
  const ok = await confirmDialog({ title: t(suspend ? 'platform.suspend' : 'platform.reactivate'), message: t(suspend ? 'platform.suspendText' : 'platform.reactivateText', { name: org.name }), danger: suspend });
  if (!ok) return;
  db.update('organizations', org.id, { status: suspend ? 'suspended' : 'active' }, { action: suspend ? 'suspend' : 'reactivate' });
  toast(t('common.saved'));
  bus.emit('refresh');
}

export function mount(root) {
  const orgs = db.all('organizations');
  const active = orgs.filter((o) => o.status === 'active');
  root.innerHTML = `
    ${pageHeader({ title: t('nav.platform'), subtitle: t('platform.subtitle'), actions: can('platform', 'c') ? btn({ act: 'add', label: t('platform.add'), icon: 'plus' }) : '' })}
    <div class="grid grid-kpi">
      ${kpi({ label: t('dash.orgsActive'), value: int(active.length), hint: t('dash.orgsTrial', { n: orgs.filter((o) => o.status === 'trial').length }), icon: 'globe' })}
      ${kpi({ label: t('dash.mrr'), value: money(active.reduce((a, o) => a + planById(o.plan).price, 0)), hint: t('dash.mrrHint'), icon: 'wallet', tone: 'accent' })}
      ${kpi({ label: t('dash.units'), value: int(db.all('units').length), icon: 'door', tone: 'info' })}
    </div>
    <section class="card">
      <div class="card-head"><h2>${esc(t('platform.plans'))}</h2></div>
      <div class="card-body grid grid-3">${PLANS.map((p) => `
        <div class="card plan-card"><h3>${esc(tl('plan', p.id))}</h3><div class="plan-price">${esc(money(p.price))}<small class="muted"> / ${esc(t('platform.perMonth'))}</small></div><p class="muted small">${esc(p.maxUnits ? t('platform.upTo', { n: p.maxUnits }) : t('platform.unlimited'))}</p></div>`).join('')}</div>
    </section>
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => edit());

  listView(root.querySelector('#list'), {
    key: 'orgs',
    exportName: 'organisations',
    rows: () => db.all('organizations').map((o) => ({ ...o, units: unitCount(o.id), residences: db.all('residences').filter((r) => r.orgId === o.id).length })),
    defaultSort: { key: 'name', dir: 'asc' },
    searchText: (o) => `${o.name} ${o.city} ${o.contactName}`,
    filters: [
      { key: 'status', label: t('common.status'), options: enumOptions('orgStatus', STATUSES), test: (o, v) => o.status === v },
      { key: 'plan', label: t('platform.plan'), options: PLANS.map((p) => ({ value: p.id, label: tl('plan', p.id) })), test: (o, v) => o.plan === v },
    ],
    columns: [
      { key: 'name', label: t('platform.company'), render: (o) => twoLine(o.name, `${o.contactName} · ${o.city}`) },
      { key: 'plan', label: t('platform.plan'), render: (o) => esc(tl('plan', o.plan)), csv: (o) => tl('plan', o.plan) },
      { key: 'residences', label: t('nav.residences'), cls: 'num hide-md' },
      { key: 'units', label: t('nav.units'), cls: 'num hide-sm' },
      { key: 'createdAt', label: t('platform.since'), cls: 'hide-md', render: (o) => esc(date(o.createdAt)) },
      { key: 'status', label: t('common.status'), render: (o) => statusBadge('orgStatus', o.status), csv: (o) => tl('orgStatus', o.status) },
    ],
    rowActions: (o) => [
      { id: 'edit', icon: 'edit', label: t('common.edit') },
      { id: 'toggle', icon: o.status === 'suspended' ? 'check' : 'ban', label: t(o.status === 'suspended' ? 'platform.reactivate' : 'platform.suspend'), danger: o.status !== 'suspended' },
    ],
    onAction: (act, row) => {
      const org = db.get('organizations', row.id);
      if (act === 'edit') edit(org);
      if (act === 'toggle') toggleSuspend(org);
    },
    empty: { title: t('common.emptyTitle'), text: t('common.emptyText'), icon: 'globe' },
  });
}
