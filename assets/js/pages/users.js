// User management for an organization (staff accounts, resident & provider logins).
import { esc, on } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { date } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, inOrg, ORG_ROLES, permissionsOf, MODULES, myResidences } from '../core/permissions.js';
import { DEMO_PASSWORD } from '../data/seed.js';
import { pageHeader, btn, statusBadge, userCell } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

function edit(user) {
  const me = currentUser();
  const providers = inOrg('providers').map((p) => ({ value: p.id, label: p.name }));
  const residences = myResidences().map((r) => ({ value: r.id, label: r.name }));
  openForm({
    title: user ? t('users.edit') : t('users.add'),
    intro: user ? '' : esc(t('users.passwordNote', { password: DEMO_PASSWORD })),
    values: user || { role: 'manager', active: true, residenceIds: [] },
    fields: [
      { name: 'name', label: t('common.name'), required: true, full: true, maxLength: 80 },
      { name: 'email', label: t('common.email'), type: 'email', required: true },
      { name: 'phone', label: t('common.phone'), type: 'tel' },
      { name: 'role', label: t('users.role'), type: 'select', required: true, reactive: true, placeholder: false, options: enumOptions('role', ORG_ROLES), disabled: !!user && user.id === me.id },
      { name: 'providerId', label: t('expenses.provider'), type: 'select', required: true, showIf: (v) => v.role === 'provider', options: providers },
      { name: 'residenceId', label: t('users.assignedResidence'), type: 'select', placeholder: t('users.allResidences'), showIf: (v) => v.role === 'manager', options: residences, hint: t('users.assignHint') },
      { name: 'active', label: t('users.active'), type: 'checkbox', full: true, disabled: !!user && user.id === me.id },
    ],
    values2: null,
    onSubmit: (v) => {
      const email = v.email.toLowerCase();
      if (db.all('users').some((u) => u.email.toLowerCase() === email && (!user || u.id !== user.id))) return t('users.errEmail');
      const data = {
        name: v.name, email, phone: v.phone, role: v.role, active: v.active,
        providerId: v.role === 'provider' ? v.providerId : null,
        residenceIds: v.role === 'manager' && v.residenceId ? [v.residenceId] : [],
      };
      if (user) db.update('users', user.id, data);
      else db.insert('users', { ...data, orgId: me.orgId, password: DEMO_PASSWORD });
      toast(t('common.saved'));
      bus.emit('refresh');
      return true;
    },
  });
}

async function toggle(user) {
  const next = !user.active;
  const ok = await confirmDialog({ title: t(next ? 'users.activate' : 'users.deactivate'), message: t(next ? 'users.activateText' : 'users.deactivateText', { name: user.name }), danger: !next });
  if (!ok) return;
  db.update('users', user.id, { active: next }, { action: next ? 'activate' : 'deactivate' });
  toast(t('common.saved'));
  bus.emit('refresh');
}

function showMatrix() {
  const actions = [['v', 'view'], ['c', 'create'], ['e', 'edit'], ['d', 'delete'], ['x', 'validate'], ['a', 'approve']];
  const roles = ['super_admin', ...ORG_ROLES];
  openModal({
    title: t('users.matrix'),
    size: 'lg',
    content: `
      <p class="note plain" style="margin-bottom:16px">${esc(t('users.matrixNote'))}</p>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${esc(t('users.module'))}</th>${roles.map((r) => `<th scope="col">${esc(tl('role', r))}</th>`).join('')}</tr></thead>
        <tbody>${MODULES.map((m) => `<tr><th scope="row" class="cell-main">${esc(t(`nav.${m}`))}</th>${roles.map((r) => {
          const p = permissionsOf(r)[m] || '';
          return `<td>${p ? esc(actions.filter(([k]) => p.includes(k)).map(([, name]) => t(`users.perm.${name}`)).join(', ')) : '<span class="muted">—</span>'}</td>`;
        }).join('')}</tr>`).join('')}</tbody>
      </table></div>`,
    footer: [{ label: t('common.close'), variant: 'primary', onClick: (close) => close() }],
  });
}

export function mount(root) {
  const me = currentUser();
  root.innerHTML = `
    ${pageHeader({
      title: t('nav.users'), subtitle: t('users.subtitle'),
      actions: `${btn({ act: 'matrix', label: t('users.matrix'), icon: 'shield', variant: 'secondary' })}${can('users', 'c') ? btn({ act: 'add', label: t('users.add'), icon: 'plus' }) : ''}`,
    })}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => edit());
  on(root, 'click', '[data-act="matrix"]', showMatrix);

  listView(root.querySelector('#list'), {
    key: 'users',
    exportName: 'utilisateurs',
    rows: () => inOrg('users').map((u) => ({ ...u, state: u.active ? 'active' : 'inactive' })),
    defaultSort: { key: 'name', dir: 'asc' },
    searchText: (u) => `${u.name} ${u.email} ${tl('role', u.role)}`,
    filters: [
      { key: 'role', label: t('users.role'), options: enumOptions('role', ORG_ROLES), test: (u, v) => u.role === v },
      { key: 'state', label: t('common.status'), options: enumOptions('providerState', ['active', 'inactive']), test: (u, v) => u.state === v },
    ],
    columns: [
      { key: 'name', label: t('common.name'), render: (u) => userCell(u.name, u.email) },
      { key: 'role', label: t('users.role'), render: (u) => statusBadge('role', u.role), csv: (u) => tl('role', u.role) },
      { key: 'lastLoginAt', label: t('users.lastLogin'), cls: 'hide-md', render: (u) => esc(u.lastLoginAt ? date(u.lastLoginAt) : '—') },
      { key: 'state', label: t('common.status'), render: (u) => statusBadge('providerState', u.state), csv: (u) => tl('providerState', u.state) },
    ],
    rowActions: (u) => (u.id === me.id ? [] : [
      ...(can('users', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }, { id: 'toggle', icon: u.active ? 'ban' : 'check', label: t(u.active ? 'users.deactivate' : 'users.activate'), danger: u.active }] : []),
    ]),
    onAction: (act, row) => {
      const user = db.get('users', row.id);
      if (act === 'edit') edit(user);
      if (act === 'toggle') toggle(user);
    },
    empty: { title: t('common.emptyTitle'), text: t('common.emptyText'), icon: 'user' },
  });
}
