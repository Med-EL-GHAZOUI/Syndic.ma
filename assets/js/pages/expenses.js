// Expenses, supplier invoices and their approval workflow.
// pending -> approved -> paid ; a paid expense is never deleted, only cancelled with a reason.
import { esc, on, todayIso, sum } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { money, date } from '../core/format.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, inScope, inOrg, residenceOptions, activeResidenceIds } from '../core/permissions.js';
import { pageHeader, btn, statusBadge, kpi, twoLine, residenceName } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';

export const EXPENSE_CATEGORIES = ['cleaning', 'security', 'elevator', 'electricity', 'water', 'gardening', 'repairs', 'insurance', 'admin', 'other'];
const STATUSES = ['pending', 'approved', 'paid', 'cancelled'];

const providerName = (id) => db.get('providers', id)?.name || '—';

export function openExpenseForm(expense, prefill = {}) {
  const ids = activeResidenceIds();
  openForm({
    title: expense ? t('expenses.edit') : t('expenses.add'),
    values: expense || { residenceId: ids.length === 1 ? ids[0] : '', date: todayIso(), category: 'repairs', ...prefill },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, options: residenceOptions() },
      { name: 'category', label: t('common.category'), type: 'select', required: true, placeholder: false, options: enumOptions('expenseCategory', EXPENSE_CATEGORIES) },
      { name: 'label', label: t('expenses.label'), required: true, full: true, maxLength: 120 },
      { name: 'amount', label: t('common.amount'), type: 'money', required: true, min: 0.01 },
      { name: 'date', label: t('expenses.invoiceDate'), type: 'date', required: true },
      { name: 'providerId', label: t('expenses.provider'), type: 'select', placeholder: t('expenses.noProvider'), options: inOrg('providers').filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })) },
      { name: 'invoiceRef', label: t('expenses.invoiceRef'), maxLength: 40 },
    ],
    onSubmit: (v) => {
      const data = { residenceId: v.residenceId, category: v.category, label: v.label, amount: v.amount, date: v.date, providerId: v.providerId || null, invoiceRef: v.invoiceRef };
      if (expense) db.update('expenses', expense.id, data);
      else db.insert('expenses', { ...data, status: 'pending', paidAt: null });
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

async function transition(expense, status, action, message) {
  const ok = await confirmDialog({ title: t(`expenses.${action}`), message });
  if (!ok) return;
  db.update('expenses', expense.id, { status, paidAt: status === 'paid' ? new Date().toISOString() : expense.paidAt }, { action });
  toast(t('common.saved'));
  bus.emit('refresh');
}

function cancelExpense(expense) {
  openForm({
    title: t('expenses.cancel'),
    size: 'sm',
    intro: esc(t('expenses.cancelText')),
    submitLabel: t('common.confirm'),
    fields: [{ name: 'reason', label: t('payments.reason'), type: 'textarea', rows: 3, required: true, full: true }],
    onSubmit: (v) => {
      db.update('expenses', expense.id, { status: 'cancelled', cancelReason: v.reason }, { action: 'cancel' });
      toast(t('common.saved'), 'info');
      bus.emit('refresh');
    },
  });
}

async function removeExpense(expense) {
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: expense.label }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('expenses', expense.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
}

export function mount(root) {
  const all = inScope('expenses');
  const year = String(new Date().getFullYear());
  const multi = activeResidenceIds().length > 1;
  const of = (status) => all.filter((e) => e.status === status);

  root.innerHTML = `
    ${pageHeader({ title: t('nav.expenses'), subtitle: t('expenses.subtitle'), actions: can('expenses', 'c') ? btn({ act: 'add', label: t('expenses.add'), icon: 'plus' }) : '' })}
    <div class="grid grid-kpi">
      ${kpi({ label: t('expenses.kpiPaid', { year }), value: money(sum(of('paid').filter((e) => e.date.startsWith(year)), (e) => e.amount)), icon: 'receipt', tone: 'accent' })}
      ${kpi({ label: t('expenses.kpiPending'), value: money(sum(of('pending'), (e) => e.amount)), hint: t('expenses.count', { n: of('pending').length }), icon: 'clock', tone: 'warning' })}
      ${kpi({ label: t('expenses.kpiApproved'), value: money(sum(of('approved'), (e) => e.amount)), hint: t('expenses.count', { n: of('approved').length }), icon: 'check', tone: 'info' })}
    </div>
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => openExpenseForm());

  listView(root.querySelector('#list'), {
    key: 'expenses',
    exportName: 'depenses',
    rows: () => inScope('expenses').map((e) => ({ ...e, residence: residenceName(e.residenceId), provider: providerName(e.providerId) })),
    defaultSort: { key: 'date', dir: 'desc' },
    searchText: (e) => `${e.label} ${e.invoiceRef} ${e.provider} ${e.residence}`,
    filters: [
      { key: 'status', label: t('common.status'), options: enumOptions('expenseStatus', STATUSES), test: (e, v) => e.status === v },
      { key: 'category', label: t('common.category'), options: enumOptions('expenseCategory', EXPENSE_CATEGORIES), test: (e, v) => e.category === v },
    ],
    columns: [
      { key: 'date', label: t('common.date'), render: (e) => esc(date(e.date)) },
      { key: 'label', label: t('expenses.label'), render: (e) => twoLine(e.label, [e.invoiceRef, multi ? e.residence : ''].filter(Boolean).join(' · ')) },
      { key: 'category', label: t('common.category'), cls: 'hide-md', render: (e) => esc(tl('expenseCategory', e.category)), csv: (e) => tl('expenseCategory', e.category) },
      { key: 'provider', label: t('expenses.provider'), cls: 'hide-md' },
      { key: 'amount', label: t('common.amount'), cls: 'num', render: (e) => `<strong>${esc(money(e.amount))}</strong>` },
      { key: 'status', label: t('common.status'), render: (e) => statusBadge('expenseStatus', e.status), csv: (e) => tl('expenseStatus', e.status) },
    ],
    rowActions: (e) => [
      ...(e.status === 'pending' && can('expenses', 'a') ? [{ id: 'approve', icon: 'check', label: t('expenses.approve') }] : []),
      ...(e.status === 'approved' && can('expenses', 'a') ? [{ id: 'pay', icon: 'wallet', label: t('expenses.pay') }] : []),
      ...(e.status === 'pending' && can('expenses', 'e') ? [{ id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...((e.status === 'approved' || e.status === 'paid') && can('expenses', 'a') ? [{ id: 'cancel', icon: 'ban', label: t('expenses.cancel'), danger: true }] : []),
      ...(e.status === 'pending' && can('expenses', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const expense = db.get('expenses', row.id);
      if (act === 'approve') transition(expense, 'approved', 'approve', t('expenses.approveText', { amount: money(expense.amount) }));
      if (act === 'pay') transition(expense, 'paid', 'pay', t('expenses.payText', { amount: money(expense.amount) }));
      if (act === 'edit') openExpenseForm(expense);
      if (act === 'cancel') cancelExpense(expense);
      if (act === 'delete') removeExpense(expense);
    },
    empty: { title: t('expenses.emptyTitle'), text: t('expenses.emptyText'), icon: 'receipt' },
  });
}
