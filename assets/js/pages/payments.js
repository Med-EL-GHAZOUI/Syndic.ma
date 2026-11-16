// Payment records, receipts, validation of declared payments and reversals.
//
// IMPORTANT: every payment here is a MANUAL RECORD (cash, cheque, transfer)
// entered by staff or declared by a resident. Nothing is verified against a
// bank or a payment provider — `verified` stays false until Phase 8.
import { esc, on, todayIso } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { money, date, dateTime } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, isResident, inScope, residenceOptions, activeResidenceIds, myUnitIds } from '../core/permissions.js';
import { unitBalance, openCharges, allocate, round2 } from '../core/finance.js';
import { notify } from '../core/notify.js';
import { pageHeader, btn, statusBadge, kpi, dl, twoLine, unitLabel, residenceName, fullName, unitOccupants, unitOptions } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { openModal, confirmDialog, printModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const METHODS = ['transfer', 'cheque', 'cash'];
const STATUSES = ['pending', 'recorded', 'reversed', 'rejected'];

function dueInfo(unitId) {
  if (!unitId) return `<p class="note plain">${esc(t('payments.pickUnit'))}</p>`;
  const open = openCharges(unitId);
  if (!open.length) return `<p class="note">${esc(t('payments.errNothingDue'))}</p>`;
  return `
    <div class="note plain">
      <div class="row between"><strong>${esc(t('payments.outstanding'))}</strong><strong class="num">${esc(money(unitBalance(unitId)))}</strong></div>
      <ul style="margin:8px 0 0;padding-inline-start:18px">${open.map((c) => `<li>${esc(c.label)} — ${esc(date(c.dueDate))} · <span class="num">${esc(money(c.due))}</span></li>`).join('')}</ul>
      <div class="field-hint" style="margin-top:8px">${esc(t('payments.fifoHint'))}</div>
    </div>`;
}

const payerOf = (unitId) => {
  const { owner } = unitOccupants(unitId);
  return owner ? fullName(owner) : '—';
};

const dateField = () => ({
  name: 'date', label: t('common.date'), type: 'date', required: true,
  validate: (v) => (v > todayIso() ? t('payments.errFuture') : ''),
});

/** Staff: record a payment received for a lot. */
export function openPaymentForm(prefill = {}) {
  const ids = activeResidenceIds();
  const unit = prefill.unitId ? db.get('units', prefill.unitId) : null;
  openForm({
    title: t('payments.add'),
    intro: esc(t('payments.manualNote')),
    values: {
      residenceId: unit ? unit.residenceId : ids.length === 1 ? ids[0] : '',
      unitId: unit ? unit.id : '',
      amount: unit ? unitBalance(unit.id) || null : null,
      date: todayIso(),
      method: 'transfer',
    },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, reactive: true, options: residenceOptions() },
      { name: 'unitId', label: t('units.unit'), type: 'select', required: true, reactive: true, options: (v) => unitOptions(v.residenceId) },
      { name: 'info', type: 'static', html: (v) => dueInfo(v.unitId) },
      { name: 'amount', label: t('common.amount'), type: 'money', required: true, min: 0.01 },
      dateField(),
      { name: 'method', label: t('payments.method'), type: 'select', required: true, placeholder: false, options: enumOptions('paymentMethod', METHODS) },
      { name: 'reference', label: t('payments.reference'), hint: t('payments.referenceHint') },
      { name: 'note', label: t('common.note'), type: 'textarea', rows: 2, full: true },
    ],
    onSubmit: (v) => {
      const due = unitBalance(v.unitId);
      if (due <= 0) return t('payments.errNothingDue');
      if (v.amount > due + 0.004) return t('payments.errTooMuch', { max: money(due) });
      const { allocations } = allocate(v.unitId, v.amount);
      const payment = db.insert('payments', {
        residenceId: v.residenceId, unitId: v.unitId, payerName: payerOf(v.unitId), amount: round2(v.amount), date: v.date,
        method: v.method, reference: v.reference, note: v.note, status: 'recorded', verified: false, allocations,
        receiptNo: db.nextNumber('receipt', 'REC'), createdBy: currentUser().id, declaredBy: null,
      });
      toast(t('payments.recorded', { no: payment.receiptNo }));
      bus.emit('refresh');
      openReceipt(payment);
      return true;
    },
  });
}

/** Resident: declare a payment made outside the platform; staff validates it. */
function openDeclareForm() {
  const user = currentUser();
  const units = myUnitIds();
  openForm({
    title: t('payments.declare'),
    intro: esc(t('payments.declareNote')),
    submitLabel: t('payments.declareSubmit'),
    values: { unitId: units[0] || '', date: todayIso(), method: 'transfer' },
    fields: [
      { name: 'unitId', label: t('units.unit'), type: 'select', required: true, reactive: true, placeholder: false, full: true, options: units.map((id) => ({ value: id, label: unitLabel(id) })) },
      { name: 'info', type: 'static', html: (v) => dueInfo(v.unitId) },
      { name: 'amount', label: t('common.amount'), type: 'money', required: true, min: 0.01 },
      dateField(),
      { name: 'method', label: t('payments.method'), type: 'select', required: true, placeholder: false, options: enumOptions('paymentMethod', METHODS) },
      { name: 'reference', label: t('payments.reference'), required: true, hint: t('payments.referenceHint') },
      { name: 'note', label: t('common.note'), type: 'textarea', rows: 2, full: true },
    ],
    onSubmit: (v) => {
      const due = unitBalance(v.unitId);
      if (due <= 0) return t('payments.errNothingDue');
      if (v.amount > due + 0.004) return t('payments.errTooMuch', { max: money(due) });
      const unit = db.get('units', v.unitId);
      db.insert('payments', {
        residenceId: unit.residenceId, unitId: unit.id, payerName: user.name, amount: round2(v.amount), date: v.date,
        method: v.method, reference: v.reference, note: v.note, status: 'pending', verified: false, allocations: [],
        receiptNo: null, createdBy: user.id, declaredBy: user.id,
      }, { summary: `${user.name} — ${money(v.amount)}` });
      notify({ toRoles: ['syndic_admin', 'accountant'], residenceId: unit.residenceId, key: 'notif.paymentDeclared', params: { name: user.name }, link: '#/payments' });
      toast(t('payments.declared'));
      bus.emit('refresh');
      return true;
    },
  });
}

export function openReceipt(payment) {
  const org = db.get('organizations', db.get('residences', payment.residenceId)?.orgId);
  const lines = (payment.allocations || []).map((a) => {
    const charge = db.get('charges', a.chargeId);
    return `<tr><td>${esc(charge ? charge.label : '—')}</td><td class="num">${esc(money(a.amount))}</td></tr>`;
  }).join('');
  const content = `
    <div class="receipt">
      <div class="receipt-head">
        <div><strong style="font-size:var(--fs-lg)">${esc(org ? org.name : 'Syndic.ma')}</strong><div class="small muted">${esc(residenceName(payment.residenceId))}</div></div>
        <div style="text-align:end"><div class="small muted">${esc(t('payments.receipt'))}</div><strong class="num">${esc(payment.receiptNo || '—')}</strong></div>
      </div>
      ${payment.status === 'reversed' ? `<p class="form-alert">${esc(t('payments.reversedNote', { reason: payment.reversalReason || '' }))}</p>` : ''}
      ${dl([
        [t('payments.payer'), esc(payment.payerName)],
        [t('units.unit'), esc(unitLabel(payment.unitId))],
        [t('common.date'), esc(date(payment.date))],
        [t('payments.method'), esc(tl('paymentMethod', payment.method))],
        [t('payments.reference'), esc(payment.reference || '—')],
        [t('common.status'), statusBadge('paymentStatus', payment.status)],
      ])}
      <div class="row between" style="margin:20px 0 12px"><span>${esc(t('payments.amountReceived'))}</span><span class="receipt-amount num">${esc(money(payment.amount))}</span></div>
      ${lines ? `<table class="table"><thead><tr><th scope="col">${esc(t('payments.allocatedTo'))}</th><th scope="col" class="num">${esc(t('common.amount'))}</th></tr></thead><tbody>${lines}</tbody></table>` : ''}
      ${payment.note ? `<p class="small" style="margin-top:12px">${esc(payment.note)}</p>` : ''}
      <p class="small muted" style="margin-top:16px">${esc(t('payments.receiptDisclaimer'))}</p>
    </div>`;
  openModal({
    title: `${t('payments.receipt')} ${payment.receiptNo || ''}`,
    content,
    footer: [
      { label: t('common.print'), variant: 'secondary', icon: 'printer', onClick: () => printModal() },
      { label: t('common.close'), variant: 'primary', onClick: (close) => close() },
    ],
  });
}

async function confirmPayment(payment) {
  const due = unitBalance(payment.unitId);
  if (payment.amount > due + 0.004) {
    toast(t('payments.errConfirmTooMuch', { max: money(due) }), 'error');
    return;
  }
  const ok = await confirmDialog({ title: t('payments.confirm'), message: t('payments.confirmText', { amount: money(payment.amount), name: payment.payerName }) });
  if (!ok) return;
  const { allocations } = allocate(payment.unitId, payment.amount);
  const user = currentUser();
  const updated = db.update('payments', payment.id, {
    status: 'recorded', allocations, receiptNo: db.nextNumber('receipt', 'REC'), confirmedBy: user.id, confirmedAt: new Date().toISOString(),
  }, { action: 'confirm', summary: payment.payerName });
  if (payment.declaredBy) notify({ toUserId: payment.declaredBy, key: 'notif.paymentConfirmed', params: { amount: money(payment.amount) }, link: '#/payments' });
  toast(t('payments.recorded', { no: updated.receiptNo }));
  bus.emit('refresh');
}

function reasonForm({ title, intro, onReason }) {
  openForm({
    title,
    size: 'sm',
    intro: esc(intro),
    submitLabel: t('common.confirm'),
    fields: [{ name: 'reason', label: t('payments.reason'), type: 'textarea', rows: 3, required: true, full: true, maxLength: 240 }],
    onSubmit: (v) => {
      onReason(v.reason);
      bus.emit('refresh');
    },
  });
}

function rejectPayment(payment) {
  reasonForm({
    title: t('payments.reject'),
    intro: t('payments.rejectText'),
    onReason: (reason) => {
      db.update('payments', payment.id, { status: 'rejected', rejectionReason: reason }, { action: 'reject', summary: payment.payerName });
      if (payment.declaredBy) notify({ toUserId: payment.declaredBy, key: 'notif.paymentRejected', params: { amount: money(payment.amount) }, link: '#/payments' });
      toast(t('payments.rejected'), 'info');
    },
  });
}

function reversePayment(payment) {
  reasonForm({
    title: t('payments.reverse'),
    intro: t('payments.reverseText', { no: payment.receiptNo }),
    onReason: (reason) => {
      db.update('payments', payment.id, {
        status: 'reversed', reversalReason: reason, reversedAt: new Date().toISOString(), reversedBy: currentUser().id,
      }, { action: 'reverse', summary: payment.receiptNo });
      toast(t('payments.reversed'), 'info');
    },
  });
}

function viewPayment(payment) {
  if (payment.status === 'recorded' || payment.status === 'reversed') {
    openReceipt(payment);
    return;
  }
  openModal({
    title: t('payments.detail'),
    content: dl([
      [t('payments.payer'), esc(payment.payerName)],
      [t('units.unit'), esc(unitLabel(payment.unitId))],
      [t('common.amount'), `<strong class="num">${esc(money(payment.amount))}</strong>`],
      [t('common.date'), esc(date(payment.date))],
      [t('payments.method'), esc(tl('paymentMethod', payment.method))],
      [t('payments.reference'), esc(payment.reference || '—')],
      [t('common.status'), statusBadge('paymentStatus', payment.status)],
      [t('payments.declaredAt'), esc(dateTime(payment.createdAt))],
      ...(payment.rejectionReason ? [[t('payments.reason'), esc(payment.rejectionReason)]] : []),
      ...(payment.note ? [[t('common.note'), esc(payment.note)]] : []),
    ]),
    footer: [{ label: t('common.close'), variant: 'primary', onClick: (close) => close() }],
  });
}

export function mount(root) {
  const resident = isResident();
  const mine = new Set(myUnitIds());
  const rows = () => (resident ? db.all('payments').filter((p) => mine.has(p.unitId)) : inScope('payments'));
  const all = rows();
  const recorded = all.filter((p) => p.status === 'recorded');
  const pending = all.filter((p) => p.status === 'pending');
  const year = String(new Date().getFullYear());
  const multi = activeResidenceIds().length > 1;

  let actions = '';
  if (resident && can('payments', 'c') && mine.size) actions = btn({ act: 'declare', label: t('payments.declare'), icon: 'send' });
  else if (!resident && can('payments', 'c')) actions = btn({ act: 'add', label: t('payments.add'), icon: 'plus' });

  root.innerHTML = `
    ${pageHeader({ title: t(resident ? 'nav.payments.mine' : 'nav.payments'), subtitle: t(resident ? 'payments.subtitleMine' : 'payments.subtitle'), actions })}
    <div class="grid grid-kpi">
      ${kpi({ label: t('payments.kpiYear', { year }), value: money(recorded.filter((p) => p.date.startsWith(year)).reduce((a, p) => a + p.amount, 0)), icon: 'wallet' })}
      ${kpi({ label: t('payments.kpiPending'), value: String(pending.length), hint: money(pending.reduce((a, p) => a + p.amount, 0)), icon: 'clock', tone: 'warning' })}
      ${kpi({ label: t('payments.kpiReversed'), value: String(all.filter((p) => p.status === 'reversed').length), hint: t('payments.kpiReversedHint'), icon: 'undo', tone: 'danger' })}
    </div>
    <p class="note plain">${icon('info', { cls: '' })} ${esc(t('payments.manualNote'))}</p>
    <div id="list"></div>`;

  on(root, 'click', '[data-act="add"]', () => openPaymentForm());
  on(root, 'click', '[data-act="declare"]', () => openDeclareForm());

  listView(root.querySelector('#list'), {
    key: 'payments',
    exportName: 'paiements',
    rows: () => rows().map((p) => ({ ...p, unit: unitLabel(p.unitId), residence: residenceName(p.residenceId) })),
    defaultSort: { key: 'date', dir: 'desc' },
    searchText: (p) => `${p.receiptNo || ''} ${p.payerName} ${p.unit} ${p.residence} ${p.reference || ''}`,
    filters: [
      { key: 'status', label: t('common.status'), options: enumOptions('paymentStatus', STATUSES), test: (p, v) => p.status === v },
      { key: 'method', label: t('payments.method'), options: enumOptions('paymentMethod', METHODS), test: (p, v) => p.method === v },
    ],
    columns: [
      { key: 'receiptNo', label: t('payments.receiptNo'), render: (p) => `<span class="cell-main num">${esc(p.receiptNo || '—')}</span>` },
      { key: 'date', label: t('common.date'), render: (p) => esc(date(p.date)) },
      { key: 'payerName', label: t('payments.payer'), render: (p) => twoLine(p.payerName, multi ? `${p.unit} · ${p.residence}` : p.unit), csv: (p) => p.payerName },
      { key: 'method', label: t('payments.method'), cls: 'hide-md', render: (p) => esc(tl('paymentMethod', p.method)), csv: (p) => tl('paymentMethod', p.method) },
      { key: 'amount', label: t('common.amount'), cls: 'num', render: (p) => `<strong>${esc(money(p.amount))}</strong>` },
      { key: 'status', label: t('common.status'), render: (p) => statusBadge('paymentStatus', p.status), csv: (p) => tl('paymentStatus', p.status) },
    ],
    rowActions: (p) => [
      { id: 'view', icon: p.status === 'recorded' || p.status === 'reversed' ? 'receipt' : 'eye', label: p.receiptNo ? t('payments.receipt') : t('common.view') },
      ...(p.status === 'pending' && can('payments', 'x') ? [{ id: 'confirm', icon: 'check', label: t('payments.confirm') }, { id: 'reject', icon: 'ban', label: t('payments.reject'), danger: true }] : []),
      ...(p.status === 'recorded' && can('payments', 'x') ? [{ id: 'reverse', icon: 'undo', label: t('payments.reverse'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const payment = db.get('payments', row.id);
      if (act === 'view') viewPayment(payment);
      if (act === 'confirm') confirmPayment(payment);
      if (act === 'reject') rejectPayment(payment);
      if (act === 'reverse') reversePayment(payment);
    },
    onRowClick: (row) => viewPayment(db.get('payments', row.id)),
    empty: { title: t('payments.emptyTitle'), text: t('payments.emptyText'), icon: 'card' },
  });
}
