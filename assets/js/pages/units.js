// Lots (apartments, shops, offices, parking spaces).
import { esc, on } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { money, date, int } from '../core/format.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, inScope, residenceOptions, activeResidenceIds } from '../core/permissions.js';
import { unitBalance, paidMap } from '../core/finance.js';
import { pageHeader, btn, statusBadge, dl, twoLine, unitLabel, residenceName, fullName, unitOccupants, occupancyOf } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

export const UNIT_TYPES = ['apartment', 'shop', 'office', 'parking'];
const OCCUPANCY = ['owner_occupied', 'rented', 'vacant'];

const buildingOptions = (residenceId) =>
  db.all('buildings').filter((b) => b.residenceId === residenceId).map((b) => ({ value: b.id, label: b.name }));

function editUnit(unit) {
  const ids = activeResidenceIds();
  openForm({
    title: unit ? t('units.edit') : t('units.add'),
    values: unit || { residenceId: ids.length === 1 ? ids[0] : '', type: 'apartment', floor: 1 },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, reactive: true, options: residenceOptions(), disabled: !!unit },
      { name: 'buildingId', label: t('units.building'), type: 'select', required: true, options: (v) => buildingOptions(v.residenceId) },
      { name: 'number', label: t('units.number'), required: true, maxLength: 12 },
      { name: 'floor', label: t('units.floor'), type: 'number', required: true, min: -3, max: 40 },
      { name: 'type', label: t('common.type'), type: 'select', required: true, placeholder: false, options: enumOptions('unitType', UNIT_TYPES) },
      { name: 'rooms', label: t('units.rooms'), type: 'number', min: 0, max: 20 },
      { name: 'area', label: t('units.area'), type: 'number', required: true, min: 1, max: 2000, step: '0.1' },
      { name: 'tantiemes', label: t('units.tantiemes'), type: 'number', required: true, min: 0, max: 100000, hint: t('units.tantiemesHint') },
    ],
    onSubmit: (v) => {
      const clash = db.all('units').some((u) => u.buildingId === v.buildingId && u.number.toLowerCase() === v.number.toLowerCase() && (!unit || u.id !== unit.id));
      if (clash) return t('units.errNumber');
      const data = { residenceId: v.residenceId, buildingId: v.buildingId, number: v.number, floor: v.floor, type: v.type, rooms: v.rooms, area: v.area, tantiemes: v.tantiemes };
      if (unit) db.update('units', unit.id, data);
      else db.insert('units', data);
      toast(t('common.saved'));
      bus.emit('refresh');
      return true;
    },
  });
}

async function deleteUnit(unit) {
  if (db.all('charges').some((c) => c.unitId === unit.id)) {
    toast(t('units.errHasCharges'), 'error');
    return;
  }
  if (db.all('residents').some((r) => r.unitId === unit.id && r.active)) {
    toast(t('units.errHasResidents'), 'error');
    return;
  }
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: unitLabel(unit) }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('units', unit.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
}

export function viewUnit(unit) {
  const { owner, tenant } = unitOccupants(unit.id);
  const history = db.all('residents').filter((r) => r.unitId === unit.id).sort((a, b) => (b.since || '').localeCompare(a.since || ''));
  const contact = (p) => (p ? `${esc(fullName(p))}<div class="cell-sub" dir="ltr" style="text-align:start">${esc(p.phone || '')}</div>` : '—');
  const content = `
    <div class="stack">
      ${dl([
        [t('common.residence'), esc(residenceName(unit.residenceId))],
        [t('common.type'), esc(tl('unitType', unit.type))],
        [t('units.floor'), esc(unit.floor)],
        [t('units.area'), `${esc(unit.area)} m²`],
        [t('units.tantiemes'), esc(int(unit.tantiemes))],
        [t('units.occupancy'), statusBadge('occupancy', occupancyOf(unit.id))],
        [tl('residentType', 'owner'), contact(owner)],
        [tl('residentType', 'tenant'), contact(tenant)],
        ...(can('finance') ? [[t('units.balance'), `<strong class="num">${esc(money(unitBalance(unit.id)))}</strong>`]] : []),
      ])}
      <div>
        <h3 style="font-size:var(--fs-md);margin-bottom:8px">${esc(t('units.history'))}</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">${esc(t('common.name'))}</th><th scope="col">${esc(t('common.type'))}</th><th scope="col">${esc(t('residents.since'))}</th><th scope="col">${esc(t('residents.until'))}</th></tr></thead>
          <tbody>${history.map((r) => `<tr><td>${esc(fullName(r))}</td><td>${statusBadge('residentType', r.type)}</td><td>${esc(date(r.since))}</td><td>${r.until ? esc(date(r.until)) : esc(t('residents.current'))}</td></tr>`).join('') || `<tr><td colspan="4" class="muted">${esc(t('common.emptyTitle'))}</td></tr>`}</tbody>
        </table></div>
      </div>
    </div>`;
  openModal({
    title: unitLabel(unit),
    size: 'lg',
    content,
    footer: [
      ...(can('finance') ? [{ label: t('finance.statement'), variant: 'secondary', icon: 'receipt', onClick: (close) => { close(); location.hash = `#/finance/statement/${unit.id}`; } }] : []),
      { label: t('common.close'), variant: 'primary', onClick: (close) => close() },
    ],
  });
}

export function mount(root) {
  const buildings = db.all('buildings').filter((b) => activeResidenceIds().includes(b.residenceId));
  const multi = activeResidenceIds().length > 1;

  root.innerHTML = `
    ${pageHeader({ title: t('nav.units'), subtitle: t('units.subtitle'), actions: can('units', 'c') ? btn({ act: 'add', label: t('units.add'), icon: 'plus' }) : '' })}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => editUnit());

  listView(root.querySelector('#list'), {
    key: 'units',
    exportName: 'lots',
    rows: () => {
      const map = can('finance') ? paidMap() : null;
      return inScope('units').map((u) => {
        const { owner, tenant } = unitOccupants(u.id);
        return { ...u, label: unitLabel(u), residence: residenceName(u.residenceId), occupant: fullName(tenant || owner), occupancy: occupancyOf(u.id), balance: map ? unitBalance(u.id, map) : 0 };
      });
    },
    defaultSort: { key: 'label', dir: 'asc' },
    searchText: (r) => `${r.label} ${r.residence} ${r.occupant}`,
    filters: [
      { key: 'building', label: t('units.building'), options: buildings.map((b) => ({ value: b.id, label: multi ? `${residenceName(b.residenceId)} — ${b.name}` : b.name })), test: (r, v) => r.buildingId === v },
      { key: 'type', label: t('common.type'), options: enumOptions('unitType', UNIT_TYPES), test: (r, v) => r.type === v },
      { key: 'occupancy', label: t('units.occupancy'), options: enumOptions('occupancy', OCCUPANCY), test: (r, v) => r.occupancy === v },
    ],
    columns: [
      { key: 'label', label: t('units.unit'), render: (r) => twoLine(r.label, multi ? r.residence : tl('unitType', r.type)) },
      { key: 'floor', label: t('units.floor'), cls: 'num hide-md' },
      { key: 'area', label: t('units.area'), cls: 'num hide-md', render: (r) => `${esc(r.area)} m²` },
      { key: 'tantiemes', label: t('units.tantiemes'), cls: 'num hide-sm' },
      { key: 'occupant', label: t('units.occupant'), cls: 'hide-sm' },
      { key: 'occupancy', label: t('units.occupancy'), render: (r) => statusBadge('occupancy', r.occupancy), csv: (r) => tl('occupancy', r.occupancy) },
      ...(can('finance') ? [{ key: 'balance', label: t('units.balance'), cls: 'num', render: (r) => `<span style="${r.balance > 0 ? 'color:var(--danger);font-weight:600' : ''}">${esc(money(r.balance))}</span>` }] : []),
    ],
    rowActions: () => [
      { id: 'view', icon: 'eye', label: t('common.view') },
      ...(can('units', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...(can('units', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const unit = db.get('units', row.id);
      if (act === 'view') viewUnit(unit);
      if (act === 'edit') editUnit(unit);
      if (act === 'delete') deleteUnit(unit);
    },
    onRowClick: (row) => viewUnit(db.get('units', row.id)),
    empty: { title: t('units.emptyTitle'), text: t('units.emptyText'), icon: 'door' },
  });
}
