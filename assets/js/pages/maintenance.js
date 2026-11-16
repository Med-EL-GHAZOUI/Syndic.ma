// Maintenance work orders (interventions), optionally linked to a complaint.
import { esc, on, todayIso } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { money, date, dateTime } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, inScope, inOrg, residenceOptions, activeResidenceIds } from '../core/permissions.js';
import { notify } from '../core/notify.js';
import { pageHeader, btn, statusBadge, dl, twoLine, residenceName } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

const TYPES = ['corrective', 'preventive'];
const STATUSES = ['planned', 'in_progress', 'done', 'cancelled'];

const providerName = (id) => db.get('providers', id)?.name || '—';
const isProvider = () => currentUser().role === 'provider';

function notifyProvider(providerId, title) {
  db.all('users').filter((u) => u.providerId === providerId && u.active).forEach((u) => {
    notify({ toUserId: u.id, key: 'notif.maintenanceAssigned', params: { title }, link: '#/maintenance' });
  });
}

export function openWorkForm(work, prefill = {}) {
  const ids = activeResidenceIds();
  openForm({
    title: work ? t('maintenance.edit') : t('maintenance.add'),
    values: work || { residenceId: ids.length === 1 ? ids[0] : '', type: 'corrective', scheduledDate: todayIso(), ...prefill },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, options: residenceOptions() },
      { name: 'type', label: t('common.type'), type: 'select', required: true, placeholder: false, options: enumOptions('maintType', TYPES) },
      { name: 'title', label: t('common.title'), required: true, full: true, maxLength: 100 },
      { name: 'providerId', label: t('expenses.provider'), type: 'select', required: true, options: inOrg('providers').filter((p) => p.active || (work && p.id === work.providerId)).map((p) => ({ value: p.id, label: `${p.name} — ${tl('providerCategory', p.category)}` })) },
      { name: 'scheduledDate', label: t('maintenance.scheduled'), type: 'date', required: true },
      { name: 'estimatedCost', label: t('maintenance.estimate'), type: 'money' },
      { name: 'description', label: t('common.description'), type: 'textarea', full: true, maxLength: 1000 },
    ],
    onSubmit: (v) => {
      const data = { residenceId: v.residenceId, type: v.type, title: v.title, providerId: v.providerId, scheduledDate: v.scheduledDate, estimatedCost: v.estimatedCost, description: v.description };
      if (work) {
        db.update('maintenance', work.id, data);
        if (work.providerId !== v.providerId) notifyProvider(v.providerId, v.title);
      } else {
        db.insert('maintenance', { ...data, complaintId: prefill.complaintId || null, status: 'planned', actualCost: null, notes: [] });
        notifyProvider(v.providerId, v.title);
        if (prefill.complaintId) {
          const complaint = db.get('complaints', prefill.complaintId);
          if (complaint && complaint.status === 'new') db.update('complaints', complaint.id, { status: 'in_progress' }, { silent: true });
        }
      }
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

async function start(work) {
  const ok = await confirmDialog({ title: t('maintenance.start'), message: t('maintenance.startText', { title: work.title }) });
  if (!ok) return;
  db.update('maintenance', work.id, { status: 'in_progress', startedAt: new Date().toISOString() });
  toast(t('common.saved'));
  bus.emit('refresh');
}

function complete(work) {
  const staffExpense = can('expenses', 'c');
  openForm({
    title: t('maintenance.complete'),
    submitLabel: t('maintenance.complete'),
    values: { actualCost: work.estimatedCost, createExpense: staffExpense },
    fields: [
      { name: 'actualCost', label: t('maintenance.actualCost'), type: 'money', required: true, full: true },
      { name: 'note', label: t('maintenance.report'), type: 'textarea', rows: 3, full: true, maxLength: 600 },
      ...(staffExpense ? [{ name: 'createExpense', label: t('maintenance.createExpense'), type: 'checkbox', full: true }] : []),
    ],
    onSubmit: (v) => {
      const user = currentUser();
      const notes = v.note ? [...(work.notes || []), { byName: user.name, at: new Date().toISOString(), text: v.note }] : work.notes || [];
      db.update('maintenance', work.id, { status: 'done', actualCost: v.actualCost, completedAt: new Date().toISOString(), notes });
      if (v.createExpense && v.actualCost > 0) {
        db.insert('expenses', {
          residenceId: work.residenceId, category: 'repairs', label: work.title, amount: v.actualCost, date: todayIso(),
          providerId: work.providerId, invoiceRef: '', status: 'pending', paidAt: null,
        });
      }
      if (work.complaintId) {
        const complaint = db.get('complaints', work.complaintId);
        if (complaint && (complaint.status === 'new' || complaint.status === 'in_progress')) {
          db.update('complaints', complaint.id, { status: 'resolved' }, { silent: true });
          if (complaint.authorId) notify({ toUserId: complaint.authorId, key: 'notif.complaintUpdated', params: { title: complaint.title }, link: '#/complaints' });
        }
      }
      if (isProvider()) notify({ toRoles: ['syndic_admin', 'manager'], residenceId: work.residenceId, key: 'notif.maintenanceDone', params: { title: work.title }, link: '#/maintenance' });
      toast(t('maintenance.completed'));
      bus.emit('refresh');
    },
  });
}

async function cancel(work) {
  const ok = await confirmDialog({ title: t('maintenance.cancel'), message: t('maintenance.cancelText', { title: work.title }), danger: true });
  if (!ok) return;
  db.update('maintenance', work.id, { status: 'cancelled' }, { action: 'cancel' });
  toast(t('common.saved'), 'info');
  bus.emit('refresh');
}

async function remove(work) {
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: work.title }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('maintenance', work.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
}

function view(id) {
  const user = currentUser();
  const host = document.createElement('div');
  let changed = false;

  function draw() {
    const w = db.get('maintenance', id);
    const complaint = w.complaintId ? db.get('complaints', w.complaintId) : null;
    const open = w.status === 'planned' || w.status === 'in_progress';
    host.innerHTML = `
      <div class="stack">
        ${dl([
          [t('common.residence'), esc(residenceName(w.residenceId))],
          [t('common.status'), statusBadge('maintStatus', w.status)],
          [t('common.type'), esc(tl('maintType', w.type))],
          [t('expenses.provider'), esc(providerName(w.providerId))],
          [t('maintenance.scheduled'), esc(date(w.scheduledDate))],
          [t('maintenance.estimate'), w.estimatedCost ? esc(money(w.estimatedCost)) : '—'],
          [t('maintenance.actualCost'), w.actualCost !== null && w.actualCost !== undefined ? esc(money(w.actualCost)) : '—'],
          [t('maintenance.linkedComplaint'), complaint ? esc(complaint.title) : '—'],
        ])}
        ${w.description ? `<p style="white-space:pre-line">${esc(w.description)}</p>` : ''}
        <div>
          <h3 style="font-size:var(--fs-md);margin-bottom:8px">${esc(t('maintenance.notes'))}</h3>
          <div class="thread">${(w.notes || []).length ? w.notes.map((n) => `<div class="thread-item"><header><strong>${esc(n.byName)}</strong><time>${esc(dateTime(n.at))}</time></header><p style="white-space:pre-line">${esc(n.text)}</p></div>`).join('') : `<p class="muted small">${esc(t('maintenance.noNotes'))}</p>`}</div>
        </div>
        ${open && can('maintenance', 'e') ? `
          <form id="mnt-form" class="stack" novalidate>
            <div class="field"><label for="mnt-text">${esc(t('maintenance.addNote'))}</label><textarea class="textarea" id="mnt-text" rows="2" maxlength="600"></textarea></div>
            <div><button type="submit" class="btn btn-primary btn-sm">${esc(t('common.add'))}</button></div>
          </form>` : ''}
      </div>`;
  }

  draw();
  on(host, 'submit', '#mnt-form', (e) => {
    e.preventDefault();
    const input = host.querySelector('#mnt-text');
    const text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    const w = db.get('maintenance', id);
    db.update('maintenance', id, { notes: [...(w.notes || []), { byName: user.name, at: new Date().toISOString(), text }] }, { silent: true });
    changed = true;
    draw();
    host.querySelector('#mnt-text').focus();
  });

  openModal({
    title: db.get('maintenance', id).title,
    size: 'lg',
    content: host,
    onClose: () => {
      if (changed) bus.emit('refresh');
    },
    footer: [{ label: t('common.close'), variant: 'primary', onClick: (close) => close() }],
  });
}

export function mount(root) {
  const user = currentUser();
  const provider = isProvider();
  const staff = !provider;
  const multi = provider || activeResidenceIds().length > 1;
  const rows = () => (provider ? db.all('maintenance').filter((m) => m.providerId === user.providerId) : inScope('maintenance'));

  root.innerHTML = `
    ${pageHeader({ title: t(provider ? 'nav.maintenance.mine' : 'nav.maintenance'), subtitle: t(provider ? 'maintenance.subtitleMine' : 'maintenance.subtitle'), actions: can('maintenance', 'c') ? btn({ act: 'add', label: t('maintenance.add'), icon: 'plus' }) : '' })}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => openWorkForm());

  listView(root.querySelector('#list'), {
    key: 'maintenance',
    exportName: 'interventions',
    rows: () => rows().map((m) => ({ ...m, residence: residenceName(m.residenceId), provider: providerName(m.providerId) })),
    defaultSort: { key: 'scheduledDate', dir: 'desc' },
    searchText: (m) => `${m.title} ${m.residence} ${m.provider}`,
    filters: [
      { key: 'status', label: t('common.status'), options: enumOptions('maintStatus', STATUSES), test: (m, v) => m.status === v },
      { key: 'type', label: t('common.type'), options: enumOptions('maintType', TYPES), test: (m, v) => m.type === v },
    ],
    columns: [
      { key: 'title', label: t('common.title'), render: (m) => twoLine(m.title, multi ? m.residence : tl('maintType', m.type)) },
      ...(staff ? [{ key: 'provider', label: t('expenses.provider'), cls: 'hide-md' }] : []),
      { key: 'scheduledDate', label: t('maintenance.scheduled'), render: (m) => esc(date(m.scheduledDate)) },
      { key: 'estimatedCost', label: t('maintenance.estimate'), cls: 'num hide-sm', render: (m) => (m.estimatedCost ? esc(money(m.estimatedCost)) : '—') },
      { key: 'status', label: t('common.status'), render: (m) => statusBadge('maintStatus', m.status), csv: (m) => tl('maintStatus', m.status) },
    ],
    rowActions: (m) => [
      { id: 'view', icon: 'eye', label: t('common.view') },
      ...(m.status === 'planned' && can('maintenance', 'e') ? [{ id: 'start', icon: 'play', label: t('maintenance.start') }] : []),
      ...(m.status === 'in_progress' && can('maintenance', 'e') ? [{ id: 'complete', icon: 'check', label: t('maintenance.complete') }] : []),
      ...(staff && m.status === 'planned' && can('maintenance', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...(staff && (m.status === 'planned' || m.status === 'in_progress') && can('maintenance', 'e') ? [{ id: 'cancel', icon: 'ban', label: t('maintenance.cancel'), danger: true }] : []),
      ...(staff && m.status === 'cancelled' && can('maintenance', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const work = db.get('maintenance', row.id);
      if (act === 'view') view(row.id);
      if (act === 'start') start(work);
      if (act === 'complete') complete(work);
      if (act === 'edit') openWorkForm(work);
      if (act === 'cancel') cancel(work);
      if (act === 'delete') remove(work);
    },
    onRowClick: (row) => view(row.id),
    empty: { title: t('maintenance.emptyTitle'), text: t('maintenance.emptyText'), icon: 'wrench' },
  });
}
