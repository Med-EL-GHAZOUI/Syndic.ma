// Owners and tenants, with ownership / occupancy history.
import { esc, on, todayIso } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { date } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, inScope, residenceOptions, activeResidenceIds } from '../core/permissions.js';
import { pageHeader, btn, statusBadge, userCell, twoLine, unitLabel, residenceName, fullName, unitOptions } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

const TYPES = ['owner', 'tenant'];

function editResident(resident) {
  const ids = activeResidenceIds();
  openForm({
    title: resident ? t('residents.edit') : t('residents.add'),
    values: resident || { residenceId: ids.length === 1 ? ids[0] : '', type: 'owner', since: todayIso(), livesIn: true },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, reactive: true, options: residenceOptions() },
      { name: 'unitId', label: t('units.unit'), type: 'select', required: true, options: (v) => unitOptions(v.residenceId) },
      { name: 'type', label: t('common.type'), type: 'select', required: true, reactive: true, placeholder: false, options: enumOptions('residentType', TYPES) },
      { name: 'since', label: t('residents.since'), type: 'date', required: true },
      { name: 'firstName', label: t('common.firstName'), required: true, maxLength: 40 },
      { name: 'lastName', label: t('common.lastName'), required: true, maxLength: 40 },
      { name: 'phone', label: t('common.phone'), type: 'tel', required: true, placeholder: '+212 6 00 00 00 00' },
      { name: 'email', label: t('common.email'), type: 'email' },
      { name: 'livesIn', label: t('residents.livesIn'), type: 'checkbox', full: true, showIf: (v) => v.type === 'owner' },
    ],
    onSubmit: (v) => {
      const active = resident ? resident.active : true;
      const clash = active && db.all('residents').some((r) => r.unitId === v.unitId && r.type === v.type && r.active && (!resident || r.id !== resident.id));
      if (clash) return t(v.type === 'owner' ? 'residents.errOwnerExists' : 'residents.errTenantExists');
      const data = {
        residenceId: v.residenceId, unitId: v.unitId, type: v.type, since: v.since, firstName: v.firstName, lastName: v.lastName,
        phone: v.phone.replace(/[\s.-]/g, ''), email: v.email, livesIn: v.type === 'tenant' ? true : !!v.livesIn,
      };
      if (resident) db.update('residents', resident.id, data);
      else db.insert('residents', { ...data, orgId: currentUser().orgId, until: null, active: true, userId: null });
      toast(t('common.saved'));
      bus.emit('refresh');
      return true;
    },
  });
}

function endOccupancy(resident) {
  openForm({
    title: t('residents.end'),
    size: 'sm',
    intro: esc(t('residents.endIntro', { name: fullName(resident) })),
    submitLabel: t('common.confirm'),
    values: { until: todayIso() },
    fields: [{
      name: 'until', label: t('residents.until'), type: 'date', required: true, full: true,
      validate: (v) => (v < resident.since ? t('residents.errUntil') : ''),
    }],
    onSubmit: (v) => {
      db.update('residents', resident.id, { until: v.until, active: false });
      toast(t('residents.ended'));
      bus.emit('refresh');
    },
  });
}

async function deleteResident(resident) {
  if (resident.userId) {
    toast(t('residents.errLinked'), 'error');
    return;
  }
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: fullName(resident) }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('residents', resident.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
}

export function mount(root) {
  const multi = activeResidenceIds().length > 1;
  root.innerHTML = `
    ${pageHeader({ title: t('nav.residents'), subtitle: t('residents.subtitle'), actions: can('residents', 'c') ? btn({ act: 'add', label: t('residents.add'), icon: 'plus' }) : '' })}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => editResident());

  listView(root.querySelector('#list'), {
    key: 'residents',
    exportName: 'residents',
    rows: () => inScope('residents').map((r) => ({ ...r, name: fullName(r), unit: unitLabel(r.unitId), residence: residenceName(r.residenceId), state: r.active ? 'active' : 'former' })),
    defaultSort: { key: 'name', dir: 'asc' },
    searchText: (r) => `${r.name} ${r.unit} ${r.residence} ${r.email} ${r.phone}`,
    filters: [
      { key: 'type', label: t('common.type'), options: enumOptions('residentType', TYPES), test: (r, v) => r.type === v },
      { key: 'state', label: t('common.status'), options: enumOptions('residentState', ['active', 'former']), test: (r, v) => r.state === v },
    ],
    columns: [
      { key: 'name', label: t('common.name'), render: (r) => userCell(r.name, r.email) },
      { key: 'type', label: t('common.type'), render: (r) => statusBadge('residentType', r.type), csv: (r) => tl('residentType', r.type) },
      { key: 'unit', label: t('units.unit'), render: (r) => twoLine(r.unit, multi ? r.residence : '') },
      { key: 'phone', label: t('common.phone'), cls: 'hide-md', render: (r) => `<span dir="ltr">${esc(r.phone)}</span>` },
      { key: 'since', label: t('residents.since'), cls: 'hide-sm', render: (r) => esc(date(r.since)) },
      { key: 'state', label: t('common.status'), cls: 'hide-sm', render: (r) => statusBadge('residentState', r.state), csv: (r) => tl('residentState', r.state) },
    ],
    rowActions: (r) => [
      ...(can('residents', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...(can('residents', 'e') && r.active ? [{ id: 'end', icon: 'logout', label: t('residents.end') }] : []),
      ...(can('residents', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const resident = db.get('residents', row.id);
      if (act === 'edit') editResident(resident);
      if (act === 'end') endOccupancy(resident);
      if (act === 'delete') deleteResident(resident);
    },
    empty: { title: t('residents.emptyTitle'), text: t('residents.emptyText'), icon: 'users' },
  });
}
