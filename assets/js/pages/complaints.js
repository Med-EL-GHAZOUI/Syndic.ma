// Complaints (réclamations) with a comment thread and status workflow.
import { esc, on } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { date, dateTime } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, isResident, inScope, residenceOptions, activeResidenceIds, myResidentRecords } from '../core/permissions.js';
import { notify } from '../core/notify.js';
import { pageHeader, btn, statusBadge, dl, twoLine, unitLabel, residenceName, unitOptions } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { openWorkForm } from './maintenance.js';

export const COMPLAINT_CATEGORIES = ['plumbing', 'electricity', 'elevator', 'cleaning', 'noise', 'security', 'parking', 'other'];
export const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES = ['new', 'in_progress', 'resolved', 'closed'];

/** Complaints visible to the current user. */
export function myComplaints() {
  const user = currentUser();
  if (isResident(user)) return db.all('complaints').filter((c) => c.authorId === user.id);
  return inScope('complaints');
}

function addComplaint() {
  const user = currentUser();
  const resident = isResident(user);
  const records = myResidentRecords();
  const ids = activeResidenceIds();
  if (resident && !records.length) {
    toast(t('dash.noUnit'), 'error');
    return;
  }
  openForm({
    title: t('complaints.add'),
    submitLabel: t('common.send'),
    values: resident
      ? { unitId: records[0].unitId, priority: 'medium' }
      : { residenceId: ids.length === 1 ? ids[0] : '', priority: 'medium' },
    fields: [
      ...(resident
        ? [{ name: 'unitId', label: t('units.unit'), type: 'select', required: true, placeholder: false, full: true, options: records.map((r) => ({ value: r.unitId, label: `${residenceName(r.residenceId)} — ${unitLabel(r.unitId)}` })) }]
        : [
          { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, reactive: true, options: residenceOptions() },
          { name: 'unitId', label: t('units.unit'), type: 'select', placeholder: t('complaints.commonAreas'), options: (v) => unitOptions(v.residenceId) },
        ]),
      { name: 'title', label: t('complaints.subject'), required: true, full: true, maxLength: 100 },
      { name: 'category', label: t('common.category'), type: 'select', required: true, options: enumOptions('complaintCategory', COMPLAINT_CATEGORIES) },
      { name: 'priority', label: t('complaints.priority'), type: 'select', required: true, placeholder: false, options: enumOptions('priority', PRIORITIES) },
      { name: 'description', label: t('common.description'), type: 'textarea', required: true, full: true, maxLength: 1000 },
    ],
    onSubmit: (v) => {
      const residenceId = resident ? db.get('units', v.unitId).residenceId : v.residenceId;
      db.insert('complaints', {
        residenceId, unitId: v.unitId || null, authorId: user.id, authorName: user.name, title: v.title, category: v.category,
        priority: v.priority, description: v.description, status: 'new', assignedTo: null, comments: [],
      });
      notify({ toRoles: ['syndic_admin', 'manager'], residenceId, key: 'notif.complaintNew', params: { title: v.title }, link: '#/complaints' });
      toast(t('complaints.sent'));
      bus.emit('refresh');
    },
  });
}

function viewComplaint(id) {
  const user = currentUser();
  const staff = can('complaints', 'e');
  const host = document.createElement('div');
  let changed = false;

  function draw() {
    const c = db.get('complaints', id);
    const closed = c.status === 'closed';
    host.innerHTML = `
      <div class="stack">
        ${dl([
          [t('common.residence'), esc(residenceName(c.residenceId))],
          [t('units.unit'), esc(c.unitId ? unitLabel(c.unitId) : t('complaints.commonAreas'))],
          [t('complaints.author'), esc(c.authorName)],
          [t('complaints.createdAt'), esc(dateTime(c.createdAt))],
          [t('common.category'), esc(tl('complaintCategory', c.category))],
          [t('complaints.priority'), statusBadge('priority', c.priority)],
        ])}
        <p style="white-space:pre-line">${esc(c.description)}</p>
        ${staff ? `
          <div class="row">
            <div class="field" style="flex:1;min-width:180px">
              <label for="cmp-status">${esc(t('common.status'))}</label>
              <select class="select" id="cmp-status">${STATUSES.map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${esc(tl('complaintStatus', s))}</option>`).join('')}</select>
            </div>
            ${can('maintenance', 'c') ? `<button type="button" class="btn btn-secondary" data-act="work" style="align-self:end">${esc(t('complaints.createWork'))}</button>` : ''}
          </div>` : `<div>${statusBadge('complaintStatus', c.status)}</div>`}
        <div>
          <h3 style="font-size:var(--fs-md);margin-bottom:8px">${esc(t('complaints.thread'))}</h3>
          <div class="thread">
            ${c.comments.length ? c.comments.map((m) => `<div class="thread-item"><header><strong>${esc(m.byName)}</strong><time>${esc(dateTime(m.at))}</time></header><p style="white-space:pre-line">${esc(m.text)}</p></div>`).join('') : `<p class="muted small">${esc(t('complaints.noComments'))}</p>`}
          </div>
        </div>
        ${closed ? '' : `
          <form id="cmp-form" class="stack" novalidate>
            <div class="field">
              <label for="cmp-text">${esc(t('complaints.reply'))}</label>
              <textarea class="textarea" id="cmp-text" rows="2" maxlength="600"></textarea>
              <span class="field-error" id="cmp-err" hidden>${esc(t('form.required'))}</span>
            </div>
            <div><button type="submit" class="btn btn-primary btn-sm">${esc(t('common.send'))}</button></div>
          </form>`}
      </div>`;
  }

  draw();

  on(host, 'change', '#cmp-status', (e, el) => {
    const c = db.get('complaints', id);
    db.update('complaints', id, { status: el.value });
    if (c.authorId && c.authorId !== user.id) notify({ toUserId: c.authorId, key: 'notif.complaintUpdated', params: { title: c.title }, link: '#/complaints' });
    changed = true;
    toast(t('common.saved'));
    draw();
  });
  on(host, 'submit', '#cmp-form', (e) => {
    e.preventDefault();
    const input = host.querySelector('#cmp-text');
    const text = input.value.trim();
    if (!text) {
      host.querySelector('#cmp-err').hidden = false;
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    const c = db.get('complaints', id);
    db.update('complaints', id, { comments: [...c.comments, { by: user.id, byName: user.name, at: new Date().toISOString(), text }] }, { silent: true });
    if (c.authorId && c.authorId !== user.id) notify({ toUserId: c.authorId, key: 'notif.complaintUpdated', params: { title: c.title }, link: '#/complaints' });
    else if (c.authorId === user.id) notify({ toRoles: ['syndic_admin', 'manager'], residenceId: c.residenceId, key: 'notif.complaintReply', params: { title: c.title }, link: '#/complaints' });
    changed = true;
    draw();
    host.querySelector('#cmp-text').focus();
  });

  const complaint = db.get('complaints', id);
  const modal = openModal({
    title: complaint.title,
    size: 'lg',
    content: host,
    onClose: () => {
      if (changed) bus.emit('refresh');
    },
    footer: [
      ...(can('complaints', 'd') ? [{
        label: t('common.delete'), variant: 'ghost', icon: 'trash',
        onClick: async (close) => {
          const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: complaint.title }), confirmLabel: t('common.delete'), danger: true });
          if (!ok) return;
          db.remove('complaints', id);
          changed = true;
          toast(t('common.deleted'));
          close();
        },
      }] : []),
      { label: t('common.close'), variant: 'primary', onClick: (close) => close() },
    ],
  });

  on(host, 'click', '[data-act="work"]', () => {
    const c = db.get('complaints', id);
    modal.close();
    openWorkForm(null, { residenceId: c.residenceId, complaintId: c.id, title: c.title, description: c.description, type: 'corrective' });
  });
}

export function mount(root) {
  const resident = isResident();
  const multi = activeResidenceIds().length > 1;
  root.innerHTML = `
    ${pageHeader({ title: t(resident ? 'nav.complaints.mine' : 'nav.complaints'), subtitle: t(resident ? 'complaints.subtitleMine' : 'complaints.subtitle'), actions: can('complaints', 'c') ? btn({ act: 'add', label: t('complaints.add'), icon: 'plus' }) : '' })}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', addComplaint);

  listView(root.querySelector('#list'), {
    key: 'complaints',
    exportName: 'reclamations',
    rows: () => myComplaints().map((c) => ({ ...c, unit: c.unitId ? unitLabel(c.unitId) : t('complaints.commonAreas'), residence: residenceName(c.residenceId), rank: PRIORITIES.indexOf(c.priority) })),
    defaultSort: { key: 'createdAt', dir: 'desc' },
    searchText: (c) => `${c.title} ${c.authorName} ${c.unit} ${c.residence}`,
    filters: [
      { key: 'status', label: t('common.status'), options: enumOptions('complaintStatus', STATUSES), test: (c, v) => c.status === v },
      { key: 'priority', label: t('complaints.priority'), options: enumOptions('priority', PRIORITIES), test: (c, v) => c.priority === v },
      { key: 'category', label: t('common.category'), options: enumOptions('complaintCategory', COMPLAINT_CATEGORIES), test: (c, v) => c.category === v },
    ],
    columns: [
      { key: 'title', label: t('complaints.subject'), render: (c) => twoLine(c.title, resident ? c.unit : `${c.authorName} · ${multi ? `${c.residence} · ` : ''}${c.unit}`) },
      { key: 'category', label: t('common.category'), cls: 'hide-md', render: (c) => esc(tl('complaintCategory', c.category)), csv: (c) => tl('complaintCategory', c.category) },
      { key: 'rank', label: t('complaints.priority'), cls: 'hide-sm', render: (c) => statusBadge('priority', c.priority), csv: (c) => tl('priority', c.priority) },
      { key: 'status', label: t('common.status'), render: (c) => statusBadge('complaintStatus', c.status), csv: (c) => tl('complaintStatus', c.status) },
      { key: 'createdAt', label: t('complaints.createdAt'), cls: 'hide-sm', render: (c) => esc(date(c.createdAt)) },
    ],
    rowActions: () => [{ id: 'view', icon: 'eye', label: t('common.view') }],
    onAction: (act, row) => viewComplaint(row.id),
    onRowClick: (row) => viewComplaint(row.id),
    empty: { title: t('complaints.emptyTitle'), text: t('complaints.emptyText'), icon: 'message' },
  });
}
