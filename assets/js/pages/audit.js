// Audit trail (read-only). Entries are appended by the store on every write.
import { esc } from '../core/dom.js';
import { t, tl } from '../core/i18n.js';
import { dateTime } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { pageHeader, badge, userCell } from '../ui/kit.js';
import { listView } from '../ui/table.js';

const TONES = { create: 'success', update: 'info', delete: 'danger', reverse: 'danger', cancel: 'warning', login: 'neutral', logout: 'neutral' };

export function mount(root) {
  const me = currentUser();
  const rows = () => db.all('audit').filter((a) => me.role === 'super_admin' || a.orgId === me.orgId).map((a) => ({ ...a }));
  const actions = [...new Set(rows().map((a) => a.action))].sort();
  const entities = [...new Set(rows().map((a) => a.entity))].sort();

  root.innerHTML = `
    ${pageHeader({ title: t('nav.audit'), subtitle: t('audit.subtitle') })}
    <p class="note plain">${esc(t('audit.note'))}</p>
    <div id="list"></div>`;

  listView(root.querySelector('#list'), {
    key: 'audit',
    exportName: 'journal-audit',
    pageSize: 25,
    rows,
    defaultSort: { key: 'at', dir: 'desc' },
    searchText: (a) => `${a.userName} ${a.summary} ${a.action} ${a.entity}`,
    filters: [
      { key: 'action', label: t('audit.action'), options: actions.map((a) => ({ value: a, label: tl('auditAction', a) })), test: (a, v) => a.action === v },
      { key: 'entity', label: t('audit.entity'), options: entities.map((e) => ({ value: e, label: tl('entity', e) })), test: (a, v) => a.entity === v },
    ],
    columns: [
      { key: 'at', label: t('common.date'), render: (a) => `<span class="nowrap">${esc(dateTime(a.at))}</span>` },
      { key: 'userName', label: t('audit.user'), render: (a) => userCell(a.userName, a.role ? tl('role', a.role) : '') },
      { key: 'action', label: t('audit.action'), render: (a) => badge(tl('auditAction', a.action), TONES[a.action] || 'neutral'), csv: (a) => tl('auditAction', a.action) },
      { key: 'entity', label: t('audit.entity'), cls: 'hide-sm', render: (a) => esc(tl('entity', a.entity)), csv: (a) => tl('entity', a.entity) },
      { key: 'summary', label: t('audit.detail'), cls: 'hide-md' },
    ],
    empty: { title: t('common.emptyTitle'), text: t('common.emptyText'), icon: 'shield' },
  });
}
