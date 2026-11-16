// Service providers (prestataires) directory.
import { esc, on } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, inOrg } from '../core/permissions.js';
import { pageHeader, btn, statusBadge, twoLine } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

export const PROVIDER_CATEGORIES = ['plumbing', 'electricity', 'elevator', 'cleaning', 'security', 'gardening', 'painting', 'general'];

const stars = (n) => `<span role="img" aria-label="${esc(t('providers.ratingLabel', { n }))}" style="color:var(--gold-500);letter-spacing:2px">${'★'.repeat(n)}<span style="color:var(--border-strong)">${'★'.repeat(5 - n)}</span></span>`;

function edit(provider) {
  openForm({
    title: provider ? t('providers.edit') : t('providers.add'),
    values: provider || { category: 'general', rating: 3, active: true },
    fields: [
      { name: 'name', label: t('providers.company'), required: true, full: true, maxLength: 80 },
      { name: 'category', label: t('common.category'), type: 'select', required: true, placeholder: false, options: enumOptions('providerCategory', PROVIDER_CATEGORIES) },
      { name: 'city', label: t('common.city'), required: true },
      { name: 'contactName', label: t('providers.contact'), required: true },
      { name: 'phone', label: t('common.phone'), type: 'tel', required: true, placeholder: '+212 5 00 00 00 00' },
      { name: 'email', label: t('common.email'), type: 'email' },
      { name: 'ice', label: t('providers.ice'), hint: t('providers.iceHint'), maxLength: 15, validate: (v) => (v && !/^\d{15}$/.test(v) ? t('providers.errIce') : '') },
      { name: 'rating', label: t('providers.rating'), type: 'number', min: 1, max: 5 },
      { name: 'active', label: t('providers.active'), type: 'checkbox', full: true },
    ],
    onSubmit: (v) => {
      const data = { name: v.name, category: v.category, city: v.city, contactName: v.contactName, phone: v.phone.replace(/[\s.-]/g, ''), email: v.email, ice: v.ice, rating: v.rating || 3, active: v.active };
      if (provider) db.update('providers', provider.id, data);
      else db.insert('providers', { ...data, orgId: currentUser().orgId });
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

async function remove(provider) {
  const used = db.all('maintenance').some((m) => m.providerId === provider.id) || db.all('expenses').some((e) => e.providerId === provider.id);
  if (used) {
    toast(t('providers.errUsed'), 'error');
    return;
  }
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: provider.name }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('providers', provider.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
}

export function mount(root) {
  root.innerHTML = `
    ${pageHeader({ title: t('nav.providers'), subtitle: t('providers.subtitle'), actions: can('providers', 'c') ? btn({ act: 'add', label: t('providers.add'), icon: 'plus' }) : '' })}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => edit());

  listView(root.querySelector('#list'), {
    key: 'providers',
    exportName: 'prestataires',
    rows: () => inOrg('providers').map((p) => ({ ...p, state: p.active ? 'active' : 'inactive' })),
    defaultSort: { key: 'name', dir: 'asc' },
    searchText: (p) => `${p.name} ${p.contactName} ${p.city} ${tl('providerCategory', p.category)}`,
    filters: [
      { key: 'category', label: t('common.category'), options: enumOptions('providerCategory', PROVIDER_CATEGORIES), test: (p, v) => p.category === v },
      { key: 'state', label: t('common.status'), options: enumOptions('providerState', ['active', 'inactive']), test: (p, v) => p.state === v },
    ],
    columns: [
      { key: 'name', label: t('providers.company'), render: (p) => twoLine(p.name, `${p.contactName} · ${p.city}`) },
      { key: 'category', label: t('common.category'), render: (p) => esc(tl('providerCategory', p.category)), csv: (p) => tl('providerCategory', p.category) },
      { key: 'phone', label: t('common.phone'), cls: 'hide-md', render: (p) => `<span dir="ltr">${esc(p.phone)}</span>` },
      { key: 'rating', label: t('providers.rating'), cls: 'hide-sm', render: (p) => stars(p.rating) },
      { key: 'state', label: t('common.status'), render: (p) => statusBadge('providerState', p.state), csv: (p) => tl('providerState', p.state) },
    ],
    rowActions: () => [
      ...(can('providers', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...(can('providers', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const provider = db.get('providers', row.id);
      if (act === 'edit') edit(provider);
      if (act === 'delete') remove(provider);
    },
    empty: { title: t('providers.emptyTitle'), text: t('providers.emptyText'), icon: 'briefcase' },
  });
}
