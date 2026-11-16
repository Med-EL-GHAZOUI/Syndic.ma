// Calls for funds, charges and account statements.
import { esc, on, sum, download, toCsv } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { money, pct, date, amount as fmtAmount } from '../core/format.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, isResident, inScope, residenceOptions, activeResidenceIds, myUnitIds, myResidences } from '../core/permissions.js';
import { paidMap, chargeViews, callStats, distribute, issueCall, statement, summary, unitBalance, round2 } from '../core/finance.js';
import { notify } from '../core/notify.js';
import { pageHeader, btn, statusBadge, kpi, tabs, twoLine, progress, unitLabel, residenceName, fullName, unitOccupants, unitOptions, emptyState } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { openModal, confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';
import { openPaymentForm } from './payments.js';

const CALL_STATUS = ['draft', 'issued', 'closed'];
const CHARGE_STATUS = ['paid', 'partial', 'overdue', 'unpaid'];
const BASIS = ['tantiemes', 'fixed'];

// ---- Calls for funds -------------------------------------------------------

function editCall(call) {
  const ids = activeResidenceIds();
  openForm({
    title: call ? t('finance.editCall') : t('finance.addCall'),
    intro: esc(t('finance.callIntro')),
    values: call || { residenceId: ids.length === 1 ? ids[0] : '', basis: 'tantiemes' },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, options: residenceOptions() },
      { name: 'period', label: t('finance.period'), required: true, placeholder: '2026-T4', maxLength: 20 },
      { name: 'title', label: t('common.title'), required: true, full: true, maxLength: 100 },
      { name: 'dueDate', label: t('finance.dueDate'), type: 'date', required: true },
      { name: 'basis', label: t('finance.basis'), type: 'select', required: true, reactive: true, placeholder: false, options: enumOptions('callBasis', BASIS) },
      { name: 'totalAmount', label: t('finance.totalAmount'), type: 'money', required: true, min: 1, showIf: (v) => v.basis === 'tantiemes', hint: t('finance.totalHint') },
      { name: 'amountPerUnit', label: t('finance.amountPerUnit'), type: 'money', required: true, min: 1, showIf: (v) => v.basis === 'fixed' },
    ],
    onSubmit: (v) => {
      const data = {
        residenceId: v.residenceId, period: v.period, title: v.title, dueDate: v.dueDate, basis: v.basis,
        totalAmount: v.basis === 'tantiemes' ? round2(v.totalAmount) : 0, amountPerUnit: v.basis === 'fixed' ? round2(v.amountPerUnit) : 0,
      };
      if (call) db.update('calls', call.id, data);
      else db.insert('calls', { ...data, status: 'draft', issuedAt: null });
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

async function issue(call) {
  const lines = distribute(call);
  if (!lines.length) {
    toast(t('finance.errNoUnits'), 'error');
    return;
  }
  const total = round2(sum(lines, (l) => l.amount));
  const ok = await confirmDialog({ title: t('finance.issue'), message: t('finance.issueText', { n: lines.length, total: money(total) }), confirmLabel: t('finance.issue') });
  if (!ok) return;
  issueCall(call);
  notify({ toRoles: ['owner'], residenceId: call.residenceId, key: 'notif.callIssued', params: { title: call.title }, link: '#/finance' });
  toast(t('finance.issued', { n: lines.length }));
  bus.emit('refresh');
}

async function removeCall(call) {
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: call.title }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('calls', call.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
}

async function closeCall(call) {
  const ok = await confirmDialog({ title: t('finance.close'), message: t('finance.closeText') });
  if (!ok) return;
  db.update('calls', call.id, { status: 'closed' }, { action: 'close' });
  toast(t('common.saved'));
  bus.emit('refresh');
}

function viewCall(call) {
  const draft = call.status === 'draft';
  const map = paidMap();
  const rows = draft
    ? distribute(call).map((l) => ({ unitId: l.unit.id, amount: l.amount, paid: 0, due: l.amount, status: 'unpaid' }))
    : chargeViews(db.all('charges').filter((c) => c.callId === call.id), map);
  const stats = callStats(call, map);
  const body = rows.map((c) => {
    const { owner } = unitOccupants(c.unitId);
    return `<tr><td class="cell-main">${esc(unitLabel(c.unitId))}</td><td class="hide-sm">${esc(owner ? fullName(owner) : '—')}</td><td class="num">${esc(money(c.amount))}</td><td class="num">${esc(money(c.paid))}</td><td class="num">${esc(money(c.due))}</td><td>${draft ? '—' : statusBadge('chargeStatus', c.status)}</td></tr>`;
  }).join('');
  openModal({
    title: call.title,
    size: 'lg',
    content: `
      <div class="stack">
        ${draft ? `<p class="note warn">${esc(t('finance.draftPreview'))}</p>` : ''}
        <div class="row between"><span>${esc(residenceName(call.residenceId))} · ${esc(t('finance.dueDate'))} ${esc(date(call.dueDate))}</span><strong class="num">${esc(money(stats.paid))} / ${esc(money(stats.total))}</strong></div>
        ${progress(stats.rate)}
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">${esc(t('units.unit'))}</th><th scope="col" class="hide-sm">${esc(tl('residentType', 'owner'))}</th><th scope="col" class="num">${esc(t('common.amount'))}</th><th scope="col" class="num">${esc(t('finance.paid'))}</th><th scope="col" class="num">${esc(t('finance.due'))}</th><th scope="col">${esc(t('common.status'))}</th></tr></thead>
          <tbody>${body || `<tr><td colspan="6" class="muted">${esc(t('finance.errNoUnits'))}</td></tr>`}</tbody>
        </table></div>
      </div>`,
    footer: [{ label: t('common.close'), variant: 'primary', onClick: (close) => close() }],
  });
}

function callsTab(host) {
  const multi = activeResidenceIds().length > 1;
  listView(host, {
    key: 'calls',
    exportName: 'appels-de-fonds',
    rows: () => {
      const map = paidMap();
      return inScope('calls').map((c) => ({ ...c, residence: residenceName(c.residenceId), ...callStats(c, map) }));
    },
    defaultSort: { key: 'dueDate', dir: 'desc' },
    searchText: (c) => `${c.title} ${c.period} ${c.residence}`,
    filters: [{ key: 'status', label: t('common.status'), options: enumOptions('callStatus', CALL_STATUS), test: (c, v) => c.status === v }],
    columns: [
      { key: 'title', label: t('common.title'), render: (c) => twoLine(c.title, multi ? c.residence : c.period) },
      { key: 'dueDate', label: t('finance.dueDate'), render: (c) => esc(date(c.dueDate)) },
      { key: 'basis', label: t('finance.basis'), cls: 'hide-md', render: (c) => esc(tl('callBasis', c.basis)), csv: (c) => tl('callBasis', c.basis) },
      { key: 'total', label: t('common.total'), cls: 'num', render: (c) => esc(money(c.total)) },
      { key: 'rate', label: t('finance.collected'), cls: 'hide-sm', render: (c) => (c.status === 'draft' ? '—' : `<div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:60px">${progress(c.rate, c.rate < 0.7)}</div><span class="num">${esc(pct(c.rate))}</span></div>`), csv: (c) => Math.round(c.rate * 100) },
      { key: 'status', label: t('common.status'), render: (c) => statusBadge('callStatus', c.status), csv: (c) => tl('callStatus', c.status) },
    ],
    rowActions: (c) => [
      { id: 'view', icon: 'eye', label: t('common.view') },
      ...(c.status === 'draft' && can('finance', 'e') ? [{ id: 'issue', icon: 'send', label: t('finance.issue') }, { id: 'edit', icon: 'edit', label: t('common.edit') }] : []),
      ...(c.status === 'issued' && can('finance', 'e') ? [{ id: 'close', icon: 'lock', label: t('finance.close') }] : []),
      ...(c.status === 'draft' && can('finance', 'd') ? [{ id: 'delete', icon: 'trash', label: t('common.delete'), danger: true }] : []),
    ],
    onAction: (act, row) => {
      const call = db.get('calls', row.id);
      if (act === 'view') viewCall(call);
      if (act === 'issue') issue(call);
      if (act === 'edit') editCall(call);
      if (act === 'close') closeCall(call);
      if (act === 'delete') removeCall(call);
    },
    onRowClick: (row) => viewCall(db.get('calls', row.id)),
    empty: { title: t('finance.emptyCalls'), text: t('finance.emptyCallsText'), icon: 'wallet' },
  });
}

// ---- Charges ----------------------------------------------------------------

function chargesTab(host, { mine = false } = {}) {
  const multi = activeResidenceIds().length > 1;
  const myUnits = new Set(myUnitIds());
  const calls = mine ? [] : inScope('calls').filter((c) => c.status !== 'draft');
  listView(host, {
    key: mine ? 'my-charges' : 'charges',
    exportName: 'charges',
    rows: () => {
      const base = mine ? db.all('charges').filter((c) => myUnits.has(c.unitId)) : inScope('charges');
      return chargeViews(base).map((c) => ({ ...c, unit: unitLabel(c.unitId), residence: residenceName(c.residenceId) }));
    },
    defaultSort: { key: 'dueDate', dir: 'desc' },
    searchText: (c) => `${c.unit} ${c.label} ${c.residence}`,
    filters: [
      { key: 'status', label: t('common.status'), options: enumOptions('chargeStatus', CHARGE_STATUS), test: (c, v) => c.status === v },
      ...(mine ? [] : [{ key: 'call', label: t('finance.call'), options: calls.map((c) => ({ value: c.id, label: multi ? `${c.title} — ${residenceName(c.residenceId)}` : c.title })), test: (c, v) => c.callId === v }]),
    ],
    columns: [
      { key: 'unit', label: t('units.unit'), render: (c) => twoLine(c.unit, multi ? c.residence : '') },
      { key: 'label', label: t('finance.call'), cls: 'hide-sm' },
      { key: 'dueDate', label: t('finance.dueDate'), render: (c) => `<span style="${c.overdue ? 'color:var(--danger)' : ''}">${esc(date(c.dueDate))}</span>` },
      { key: 'amount', label: t('common.amount'), cls: 'num hide-md', render: (c) => esc(money(c.amount)) },
      { key: 'paid', label: t('finance.paid'), cls: 'num hide-md', render: (c) => esc(money(c.paid)) },
      { key: 'due', label: t('finance.due'), cls: 'num', render: (c) => `<strong>${esc(money(c.due))}</strong>` },
      { key: 'status', label: t('common.status'), render: (c) => statusBadge('chargeStatus', c.status), csv: (c) => tl('chargeStatus', c.status) },
    ],
    rowActions: (c) => [
      ...(!mine && c.due > 0 && can('payments', 'c') ? [{ id: 'pay', icon: 'card', label: t('payments.add') }] : []),
      { id: 'statement', icon: 'receipt', label: t('finance.statement') },
    ],
    onAction: (act, row) => {
      if (act === 'pay') openPaymentForm({ unitId: row.unitId });
      if (act === 'statement') location.hash = `#/finance/statement/${row.unitId}`;
    },
    empty: { title: t('finance.emptyCharges'), text: t('finance.emptyChargesText'), icon: 'receipt' },
  });
}

// ---- Statement ----------------------------------------------------------------

function statementTab(host, unitId, { mine = false } = {}) {
  const allowed = mine ? myUnitIds() : inScope('units').map((u) => u.id);
  const unit = unitId && allowed.includes(unitId) ? db.get('units', unitId) : mine && allowed.length ? db.get('units', allowed[0]) : null;
  const residenceId = unit ? unit.residenceId : (activeResidenceIds().length === 1 ? activeResidenceIds()[0] : '');
  const residences = mine ? myResidences() : residenceOptions().map((o) => ({ id: o.value, name: o.label }));
  const unitChoices = mine ? allowed.map((id) => ({ value: id, label: unitLabel(id) })) : residenceId ? unitOptions(residenceId) : [];
  const lines = unit ? statement(unit.id) : [];
  const { owner } = unit ? unitOccupants(unit.id) : { owner: null };

  host.innerHTML = `
    <section class="card">
      <div class="lv-toolbar">
        ${mine ? '' : `
          <label class="sr-only" for="st-res">${esc(t('common.residence'))}</label>
          <select class="select" id="st-res"><option value="">${esc(t('common.residence'))}</option>${residences.map((r) => `<option value="${esc(r.id)}" ${r.id === residenceId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>`}
        <label class="sr-only" for="st-unit">${esc(t('units.unit'))}</label>
        <select class="select" id="st-unit"><option value="">${esc(t('units.unit'))}</option>${unitChoices.map((o) => `<option value="${esc(o.value)}" ${unit && o.value === unit.id ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>
        <span class="lv-count"></span>
        ${unit ? `<button type="button" class="btn btn-secondary btn-sm" data-act="st-csv">${icon('download')}<span>${esc(t('common.export'))}</span></button>
        <button type="button" class="btn btn-secondary btn-sm" data-act="st-print">${icon('printer')}<span>${esc(t('common.print'))}</span></button>` : ''}
      </div>
      ${!unit ? emptyState({ title: t('finance.pickUnit'), text: t('finance.pickUnitText'), icon: 'receipt' }) : `
        <div class="card-body">
          <div class="row between">
            <div>${twoLine(`${residenceName(unit.residenceId)} — ${unitLabel(unit)}`, owner ? fullName(owner) : '')}</div>
            <div style="text-align:end"><div class="small muted">${esc(t('units.balance'))}</div><strong class="num" style="font-size:var(--fs-lg);${unitBalance(unit.id) > 0 ? 'color:var(--danger)' : 'color:var(--success)'}">${esc(money(unitBalance(unit.id)))}</strong></div>
          </div>
        </div>
        ${lines.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th scope="col">${esc(t('common.date'))}</th><th scope="col">${esc(t('finance.operation'))}</th><th scope="col" class="hide-sm">${esc(t('payments.receiptNo'))}</th><th scope="col" class="num">${esc(t('finance.debit'))}</th><th scope="col" class="num">${esc(t('finance.credit'))}</th><th scope="col" class="num">${esc(t('finance.runningBalance'))}</th></tr></thead>
          <tbody>${lines.map((l) => `
            <tr>
              <td class="nowrap">${esc(date(l.date))}</td>
              <td>${esc(l.kind === 'charge' ? l.label : `${t('finance.paymentLine')} — ${tl('paymentMethod', l.label)}`)}</td>
              <td class="hide-sm num" style="text-align:start">${esc(l.ref || '—')}</td>
              <td class="num">${l.debit ? esc(fmtAmount(l.debit)) : ''}</td>
              <td class="num" style="color:var(--success)">${l.credit ? esc(fmtAmount(l.credit)) : ''}</td>
              <td class="num"><strong>${esc(fmtAmount(l.balance))}</strong></td>
            </tr>`).join('')}</tbody>
        </table></div>` : emptyState({ title: t('finance.emptyCharges'), icon: 'receipt' })}`}
    </section>`;

  const base = '#/finance/statement';
  const resSelect = host.querySelector('#st-res');
  if (resSelect) {
    resSelect.addEventListener('change', () => {
      const first = resSelect.value ? unitOptions(resSelect.value)[0] : null;
      location.hash = first ? `${base}/${first.value}` : base;
    });
  }
  host.querySelector('#st-unit').addEventListener('change', (e) => {
    location.hash = e.target.value ? `${base}/${e.target.value}` : base;
  });
  on(host, 'click', '[data-act="st-print"]', () => window.print());
  on(host, 'click', '[data-act="st-csv"]', () => {
    const csv = toCsv(
      [t('common.date'), t('finance.operation'), t('payments.receiptNo'), t('finance.debit'), t('finance.credit'), t('finance.runningBalance')],
      lines.map((l) => [l.date, l.kind === 'charge' ? l.label : `${t('finance.paymentLine')} — ${tl('paymentMethod', l.label)}`, l.ref, l.debit || '', l.credit || '', l.balance]),
    );
    download(`releve-${unit.number}.csv`, csv, 'text/csv;charset=utf-8');
  });
}

// ---- Page ---------------------------------------------------------------------

export function mount(root, { params }) {
  const mine = isResident();
  const tab = ['charges', 'statement'].includes(params[0]) ? params[0] : mine ? 'charges' : 'calls';

  if (mine) {
    const ids = myUnitIds();
    const charges = chargeViews(db.all('charges').filter((c) => ids.includes(c.unitId)));
    const due = round2(sum(charges, (c) => c.due));
    root.innerHTML = `
      ${pageHeader({
        title: t('nav.finance.mine'), subtitle: t('finance.subtitleMine'),
        actions: due > 0 ? `<a class="btn btn-primary" href="#/payments">${icon('send')}<span>${esc(t('payments.declare'))}</span></a>` : '',
      })}
      <div class="grid grid-kpi">
        ${kpi({ label: t('dash.myBalance'), value: money(due), icon: 'wallet', tone: due > 0 ? 'danger' : '' })}
        ${kpi({ label: t('finance.paid'), value: money(sum(charges, (c) => c.paid)), icon: 'check' })}
        ${kpi({ label: t('finance.overdueCharges'), value: String(charges.filter((c) => c.overdue).length), icon: 'alert', tone: 'warning' })}
      </div>
      ${tabs([{ id: 'charges', label: t('finance.tabCharges'), href: '#/finance' }, { id: 'statement', label: t('finance.statement'), href: '#/finance/statement' }], tab)}
      <div id="tab"></div>`;
    const host = root.querySelector('#tab');
    if (tab === 'statement') statementTab(host, params[1], { mine: true });
    else chargesTab(host, { mine: true });
    return;
  }

  const f = summary(activeResidenceIds());
  root.innerHTML = `
    ${pageHeader({ title: t('nav.finance'), subtitle: t('finance.subtitle'), actions: can('finance', 'c') ? btn({ act: 'add', label: t('finance.addCall'), icon: 'plus' }) : '' })}
    <div class="grid grid-kpi">
      ${kpi({ label: t('finance.charged'), value: money(f.charged), icon: 'receipt', tone: 'info' })}
      ${kpi({ label: t('dash.collected'), value: money(f.collected), hint: pct(f.rate), icon: 'wallet' })}
      ${kpi({ label: t('finance.outstanding'), value: money(f.outstanding), icon: 'clock', tone: 'warning' })}
      ${kpi({ label: t('dash.overdue'), value: money(f.overdue), icon: 'alert', tone: 'danger' })}
    </div>
    ${tabs([
      { id: 'calls', label: t('finance.tabCalls'), href: '#/finance' },
      { id: 'charges', label: t('finance.tabCharges'), href: '#/finance/charges' },
      { id: 'statement', label: t('finance.statement'), href: '#/finance/statement' },
    ], tab)}
    <div id="tab"></div>`;
  on(root, 'click', '[data-act="add"]', () => editCall());
  const host = root.querySelector('#tab');
  if (tab === 'calls') callsTab(host);
  else if (tab === 'charges') chargesTab(host);
  else statementTab(host, params[1]);
}
