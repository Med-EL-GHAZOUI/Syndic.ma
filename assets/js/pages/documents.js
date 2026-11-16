// Documents & archives. Phase 1 stores METADATA ONLY: file contents are not
// uploaded anywhere. Secure storage arrives with the backend (Phase 4/6).
import { esc, on, download } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { date, fileSize } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, isResident, inScope, residenceOptions, activeResidenceIds, myResidences } from '../core/permissions.js';
import { pageHeader, btn, statusBadge, badge, twoLine, residenceName } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const CATEGORIES = ['regulation', 'minutes', 'contract', 'invoice', 'insurance', 'plan', 'other'];
const VISIBILITY = ['all', 'owners', 'staff'];
const MAX_SIZE = 10 * 1024 * 1024;

function visibleDocuments() {
  const user = currentUser();
  if (!isResident(user)) return inScope('documents');
  const ids = new Set(myResidences().map((r) => r.id));
  const allowed = user.role === 'owner' ? ['all', 'owners'] : ['all'];
  return db.all('documents').filter((d) => ids.has(d.residenceId) && allowed.includes(d.visibility));
}

function edit(doc) {
  const ids = activeResidenceIds();
  openForm({
    title: doc ? t('documents.edit') : t('documents.add'),
    intro: esc(t('documents.simNote')),
    submitLabel: doc ? t('common.save') : t('documents.upload'),
    values: doc || { residenceId: ids.length === 1 ? ids[0] : '', category: 'other', visibility: 'staff' },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, full: true, options: residenceOptions() },
      { name: 'name', label: t('documents.name'), required: true, full: true, maxLength: 120 },
      { name: 'category', label: t('common.category'), type: 'select', required: true, placeholder: false, options: enumOptions('docCategory', CATEGORIES) },
      { name: 'visibility', label: t('documents.visibility'), type: 'select', required: true, placeholder: false, options: enumOptions('audience', VISIBILITY) },
      ...(doc ? [] : [{
        name: 'file', label: t('documents.file'), type: 'file', required: true, full: true, accept: '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg',
        hint: t('documents.fileHint'), validate: (f) => (f && f.size > MAX_SIZE ? t('documents.errSize') : ''),
      }]),
    ],
    onSubmit: (v) => {
      const data = { residenceId: v.residenceId, name: v.name, category: v.category, visibility: v.visibility };
      if (doc) db.update('documents', doc.id, data);
      else {
        db.insert('documents', {
          ...data, fileName: v.file.name, size: v.file.size, mime: v.file.type || 'application/octet-stream',
          uploadedAt: new Date().toISOString(), uploadedBy: currentUser().name,
        });
      }
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

function downloadDoc(doc) {
  const text = [
    'Syndic.ma — ' + t('documents.placeholderTitle'),
    '',
    `${t('documents.name')}: ${doc.name}`,
    `${t('documents.file')}: ${doc.fileName}`,
    `${t('common.residence')}: ${residenceName(doc.residenceId)}`,
    `${t('common.category')}: ${tl('docCategory', doc.category)}`,
    '',
    t('documents.placeholderText'),
  ].join('\r\n');
  download(`${doc.fileName.replace(/\.[^.]+$/, '')}-demo.txt`, text);
  toast(t('documents.downloaded'), 'info');
}

async function remove(doc) {
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: doc.name }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('documents', doc.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
}

export function mount(root) {
  const staff = !isResident();
  const multi = activeResidenceIds().length > 1;
  root.innerHTML = `
    ${pageHeader({ title: t('nav.documents'), subtitle: t('documents.subtitle'), actions: can('documents', 'c') ? btn({ act: 'add', label: t('documents.add'), icon: 'upload' }) : '' })}
    ${staff ? `<p class="note plain">${icon('info', { cls: '' })} ${esc(t('documents.simNote'))}</p>` : ''}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => edit());

  listView(root.querySelector('#list'), {
    key: 'documents',
    exportName: 'documents',
    rows: () => visibleDocuments().map((d) => ({ ...d, residence: residenceName(d.residenceId) })),
    defaultSort: { key: 'uploadedAt', dir: 'desc' },
    searchText: (d) => `${d.name} ${d.fileName} ${d.residence}`,
    filters: [
      { key: 'category', label: t('common.category'), options: enumOptions('docCategory', CATEGORIES), test: (d, v) => d.category === v },
      ...(staff ? [{ key: 'visibility', label: t('documents.visibility'), options: enumOptions('audience', VISIBILITY), test: (d, v) => d.visibility === v }] : []),
    ],
    columns: [
      { key: 'name', label: t('documents.name'), render: (d) => `<div class="cell-user">${icon('file')}<div>${twoLine(d.name, multi ? `${d.fileName} · ${d.residence}` : d.fileName)}</div></div>` },
      { key: 'category', label: t('common.category'), render: (d) => statusBadge('docCategory', d.category), csv: (d) => tl('docCategory', d.category) },
      ...(staff ? [{ key: 'visibility', label: t('documents.visibility'), cls: 'hide-md', render: (d) => badge(tl('audience', d.visibility), d.visibility === 'staff' ? 'warning' : 'neutral'), csv: (d) => tl('audience', d.visibility) }] : []),
      { key: 'size', label: t('documents.size'), cls: 'num hide-sm', render: (d) => esc(fileSize(d.size)) },
      { key: 'uploadedAt', label: t('documents.uploadedAt'), cls: 'hide-sm', render: (d) => esc(date(d.uploadedAt)) },
    ],
    rowActions: () => [
      { id: 'download', icon: 'download', label: t('documents.download') },
      ...(can('documents', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...(can('documents', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const doc = db.get('documents', row.id);
      if (act === 'download') downloadDoc(doc);
      if (act === 'edit') edit(doc);
      if (act === 'delete') remove(doc);
    },
    empty: { title: t('documents.emptyTitle'), text: t('documents.emptyText'), icon: 'folder' },
  });
}
