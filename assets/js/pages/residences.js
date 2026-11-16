// Residences list + residence detail (buildings management).
import { esc, on } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { money, pct, int } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, myResidences, activeResidenceIds } from '../core/permissions.js';
import { summary } from '../core/finance.js';
import { pageHeader, btn, kpi, dl, twoLine, progress, occupancyOf, emptyState } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const unitsOf = (id) => db.all('units').filter((u) => u.residenceId === id);
const buildingsOf = (id) => db.all('buildings').filter((b) => b.residenceId === id);

function occupancyRate(id) {
  const units = unitsOf(id);
  if (!units.length) return 0;
  return units.filter((u) => occupancyOf(u.id) !== 'vacant').length / units.length;
}

function editResidence(residence) {
  openForm({
    title: residence ? t('residences.edit') : t('residences.add'),
    values: residence || { yearBuilt: new Date().getFullYear() },
    fields: [
      { name: 'name', label: t('common.name'), required: true, full: true, maxLength: 80 },
      { name: 'city', label: t('common.city'), required: true },
      { name: 'yearBuilt', label: t('residences.yearBuilt'), type: 'number', min: 1950, max: new Date().getFullYear() },
      { name: 'address', label: t('common.address'), required: true, full: true },
      { name: 'monthlyFee', label: t('residences.monthlyFee'), type: 'money', hint: t('residences.monthlyFeeHint') },
    ],
    onSubmit: (v) => {
      const data = { name: v.name, city: v.city, address: v.address, yearBuilt: v.yearBuilt, monthlyFee: v.monthlyFee };
      if (residence) db.update('residences', residence.id, data);
      else db.insert('residences', { ...data, orgId: currentUser().orgId });
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

async function deleteResidence(residence) {
  if (unitsOf(residence.id).length) {
    toast(t('residences.errHasUnits'), 'error');
    return;
  }
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: residence.name }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  buildingsOf(residence.id).forEach((b) => db.remove('buildings', b.id, { silent: true }));
  db.remove('residences', residence.id);
  toast(t('common.deleted'));
  if (location.hash !== '#/residences') location.hash = '#/residences';
  else bus.emit('refresh');
}

function editBuilding(residenceId, building) {
  openForm({
    title: building ? t('residences.editBuilding') : t('residences.addBuilding'),
    size: 'sm',
    values: building || { floors: 4, elevator: true },
    fields: [
      { name: 'name', label: t('common.name'), required: true, full: true },
      { name: 'floors', label: t('residences.floors'), type: 'number', required: true, min: 1, max: 40, full: true },
      { name: 'elevator', label: t('residences.elevator'), type: 'checkbox', full: true },
    ],
    onSubmit: (v) => {
      const clash = buildingsOf(residenceId).some((b) => b.name.toLowerCase() === v.name.toLowerCase() && (!building || b.id !== building.id));
      if (clash) return t('residences.errBuildingName');
      const data = { name: v.name, floors: v.floors, elevator: v.elevator };
      if (building) db.update('buildings', building.id, data);
      else db.insert('buildings', { ...data, residenceId });
      toast(t('common.saved'));
      bus.emit('refresh');
      return true;
    },
  });
}

function detail(root, id) {
  const residence = myResidences().find((r) => r.id === id);
  if (!residence) {
    root.innerHTML = `<div class="card">${emptyState({ title: t('error.notFoundTitle'), text: t('error.notFoundText'), icon: 'search', action: `<a class="btn btn-primary btn-sm" href="#/residences">${esc(t('common.back'))}</a>` })}</div>`;
    return;
  }
  const units = unitsOf(id);
  const buildings = buildingsOf(id);
  const f = summary([id]);
  const canEdit = can('residences', 'e');

  root.innerHTML = `
    ${pageHeader({
      back: '#/residences',
      title: residence.name,
      subtitle: `${residence.address}, ${residence.city}`,
      actions: `${canEdit ? btn({ act: 'edit', label: t('common.edit'), icon: 'edit', variant: 'secondary' }) : ''}${can('units') ? `<a class="btn btn-primary" href="#/units">${icon('door')}<span>${esc(t('residences.seeUnits'))}</span></a>` : ''}`,
    })}
    <div class="grid grid-kpi">
      ${kpi({ label: t('nav.units'), value: int(units.length), hint: t('residences.buildingsCount', { n: buildings.length }), icon: 'door' })}
      ${kpi({ label: t('residences.occupancy'), value: pct(occupancyRate(id)), icon: 'users', tone: 'info' })}
      ${kpi({ label: t('dash.rate'), value: pct(f.rate), hint: t('dash.ofCharged', { total: money(f.charged) }), icon: 'chart', tone: 'accent' })}
      ${kpi({ label: t('dash.overdue'), value: money(f.overdue), icon: 'alert', tone: 'danger' })}
    </div>
    <section class="card">
      <div class="card-head"><h2>${esc(t('residences.info'))}</h2></div>
      <div class="card-body">${dl([
        [t('common.address'), esc(residence.address)],
        [t('common.city'), esc(residence.city)],
        [t('residences.yearBuilt'), esc(residence.yearBuilt || '—')],
        [t('residences.monthlyFee'), residence.monthlyFee ? esc(money(residence.monthlyFee)) : '—'],
      ])}</div>
    </section>
    <section class="card">
      <div class="card-head"><h2>${esc(t('residences.buildings'))}</h2>${canEdit ? btn({ act: 'add-building', label: t('residences.addBuilding'), icon: 'plus', variant: 'secondary', small: true }) : ''}</div>
      ${buildings.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">${esc(t('common.name'))}</th><th scope="col" class="num">${esc(t('residences.floors'))}</th><th scope="col" class="num">${esc(t('nav.units'))}</th><th scope="col">${esc(t('residences.elevator'))}</th><th scope="col" class="actions"><span class="sr-only">${esc(t('common.actions'))}</span></th></tr></thead>
          <tbody>${buildings.map((b) => `
            <tr>
              <td class="cell-main">${esc(b.name)}</td>
              <td class="num">${int(b.floors)}</td>
              <td class="num">${int(units.filter((u) => u.buildingId === b.id).length)}</td>
              <td>${esc(b.elevator ? t('common.yes') : t('common.no'))}</td>
              <td class="actions">${canEdit ? `
                <button type="button" class="icon-btn" data-act="edit-building" data-id="${esc(b.id)}" aria-label="${esc(t('common.edit'))}" title="${esc(t('common.edit'))}">${icon('edit')}</button>
                <button type="button" class="icon-btn danger" data-act="delete-building" data-id="${esc(b.id)}" aria-label="${esc(t('common.delete'))}" title="${esc(t('common.delete'))}">${icon('trash')}</button>` : ''}</td>
            </tr>`).join('')}</tbody>
        </table></div>` : emptyState({ title: t('residences.noBuildings'), text: t('residences.noBuildingsText'), icon: 'building' })}
    </section>`;

  on(root, 'click', '[data-act]', async (e, el) => {
    const building = el.dataset.id ? db.get('buildings', el.dataset.id) : null;
    if (el.dataset.act === 'edit') editResidence(residence);
    if (el.dataset.act === 'add-building') editBuilding(id);
    if (el.dataset.act === 'edit-building') editBuilding(id, building);
    if (el.dataset.act === 'delete-building') {
      if (units.some((u) => u.buildingId === building.id)) {
        toast(t('residences.errBuildingHasUnits'), 'error');
        return;
      }
      const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: building.name }), confirmLabel: t('common.delete'), danger: true });
      if (!ok) return;
      db.remove('buildings', building.id);
      toast(t('common.deleted'));
      bus.emit('refresh');
    }
  });
}

export function mount(root, { params }) {
  if (params[0]) {
    detail(root, params[0]);
    return;
  }
  const ids = new Set(activeResidenceIds());
  root.innerHTML = `
    ${pageHeader({ title: t('nav.residences'), subtitle: t('residences.subtitle'), actions: can('residences', 'c') ? btn({ act: 'add', label: t('residences.add'), icon: 'plus' }) : '' })}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => editResidence());

  listView(root.querySelector('#list'), {
    key: 'residences',
    exportName: 'residences',
    rows: () => myResidences().filter((r) => ids.has(r.id)).map((r) => ({ ...r, units: unitsOf(r.id).length, buildings: buildingsOf(r.id).length, occupancy: occupancyRate(r.id), rate: summary([r.id]).rate })),
    defaultSort: { key: 'name', dir: 'asc' },
    columns: [
      { key: 'name', label: t('common.name'), render: (r) => twoLine(r.name, r.address) },
      { key: 'city', label: t('common.city'), cls: 'hide-sm' },
      { key: 'buildings', label: t('residences.buildings'), cls: 'num hide-md' },
      { key: 'units', label: t('nav.units'), cls: 'num' },
      { key: 'occupancy', label: t('residences.occupancy'), cls: 'num hide-md', render: (r) => esc(pct(r.occupancy)), csv: (r) => Math.round(r.occupancy * 100) },
      { key: 'rate', label: t('dash.rate'), cls: 'hide-sm', render: (r) => `<div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:60px">${progress(r.rate, r.rate < 0.7)}</div><span class="num">${esc(pct(r.rate))}</span></div>`, csv: (r) => Math.round(r.rate * 100) },
    ],
    rowActions: () => [
      { id: 'view', icon: 'eye', label: t('common.view') },
      ...(can('residences', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...(can('residences', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const residence = db.get('residences', row.id);
      if (act === 'view') location.hash = `#/residences/${row.id}`;
      if (act === 'edit') editResidence(residence);
      if (act === 'delete') deleteResidence(residence);
    },
    onRowClick: (row) => { location.hash = `#/residences/${row.id}`; },
    empty: { title: t('residences.emptyTitle'), text: t('residences.emptyText'), icon: 'building' },
  });
}
