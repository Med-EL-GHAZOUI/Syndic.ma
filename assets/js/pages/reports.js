// Reports: collection, arrears, expenses by category, complaints.
import { esc, on, download, toCsv, sum } from '../core/dom.js';
import { t, tl } from '../core/i18n.js';
import { money, pct, date, int, monthLabel, amount } from '../core/format.js';
import { db } from '../core/store.js';
import { can, inScope, activeResidenceIds } from '../core/permissions.js';
import { summary, monthlySeries, round2 } from '../core/finance.js';
import { pageHeader, kpi, tabs, twoLine, residenceName, unitLabel, unitOccupants, fullName, progress, emptyState, statusBadge } from '../ui/kit.js';
import { barChart, hbars, donut, COLORS } from '../ui/charts.js';
import { icon } from '../ui/icons.js';

const PALETTE = [COLORS.brand, COLORS.accent, COLORS.warning, COLORS.info, COLORS.danger, COLORS.success, COLORS.neutral];

function financeTab() {
  const ids = activeResidenceIds();
  const f = summary(ids);
  const months = monthlySeries(ids, 12);
  const rows = ids.map((id) => ({ id, name: residenceName(id), ...summary([id]) }));
  return `
    <div class="grid grid-kpi">
      ${kpi({ label: t('finance.charged'), value: money(f.charged), icon: 'receipt', tone: 'info' })}
      ${kpi({ label: t('dash.collected'), value: money(f.collected), hint: pct(f.rate), icon: 'wallet' })}
      ${kpi({ label: t('dash.expenses'), value: money(f.expenses), icon: 'card', tone: 'accent' })}
      ${kpi({ label: t('reports.cashBalance'), value: money(f.balance), hint: t('reports.cashHint'), icon: 'landmark', tone: f.balance < 0 ? 'danger' : '' })}
    </div>
    <section class="card"><div class="card-head"><h2>${esc(t('reports.monthly'))}</h2></div><div class="card-body">${barChart({
      title: t('reports.monthly'), labels: months.map((m) => monthLabel(m.year, m.month)), fmt: money,
      series: [{ name: t('dash.seriesCollected'), color: COLORS.brand, values: months.map((m) => m.collected) }, { name: t('dash.seriesSpent'), color: COLORS.accent, values: months.map((m) => m.spent) }],
    })}</div></section>
    <section class="card"><div class="card-head"><h2>${esc(t('reports.byResidence'))}</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${esc(t('common.residence'))}</th><th scope="col" class="num">${esc(t('finance.charged'))}</th><th scope="col" class="num">${esc(t('dash.collected'))}</th><th scope="col" class="num hide-sm">${esc(t('dash.overdue'))}</th><th scope="col" class="hide-sm">${esc(t('dash.rate'))}</th></tr></thead>
        <tbody>${rows.map((r) => `<tr><td class="cell-main">${esc(r.name)}</td><td class="num">${esc(money(r.charged))}</td><td class="num">${esc(money(r.collected))}</td><td class="num hide-sm">${esc(money(r.overdue))}</td><td class="hide-sm"><div class="row" style="flex-wrap:nowrap"><div style="flex:1;min-width:60px">${progress(r.rate, r.rate < 0.7)}</div><span class="num">${esc(pct(r.rate))}</span></div></td></tr>`).join('')}</tbody>
      </table></div></section>`;
}

function arrearsRows() {
  const f = summary(activeResidenceIds());
  const byUnit = new Map();
  f.charges.filter((c) => c.overdue).forEach((c) => {
    const row = byUnit.get(c.unitId) || { unitId: c.unitId, due: 0, count: 0, oldest: c.dueDate };
    row.due = round2(row.due + c.due);
    row.count += 1;
    if (c.dueDate < row.oldest) row.oldest = c.dueDate;
    byUnit.set(c.unitId, row);
  });
  return [...byUnit.values()].sort((a, b) => b.due - a.due);
}

function arrearsTab() {
  const rows = arrearsRows();
  const total = round2(sum(rows, (r) => r.due));
  if (!rows.length) return `<section class="card">${emptyState({ title: t('dash.noArrears'), icon: 'check' })}</section>`;
  return `
    <div class="grid grid-kpi">${kpi({ label: t('reports.totalArrears'), value: money(total), hint: t('dash.overdueHint', { n: rows.length }), icon: 'alert', tone: 'danger' })}</div>
    <section class="card">
      <div class="card-head"><h2>${esc(t('reports.arrears'))}</h2><button type="button" class="btn btn-secondary btn-sm" data-act="csv-arrears">${icon('download')}<span>${esc(t('common.export'))}</span></button></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${esc(t('units.unit'))}</th><th scope="col" class="hide-sm">${esc(tl('residentType', 'owner'))}</th><th scope="col" class="num">${esc(t('reports.overdueCharges'))}</th><th scope="col" class="hide-sm">${esc(t('reports.oldest'))}</th><th scope="col" class="num">${esc(t('finance.due'))}</th></tr></thead>
        <tbody>${rows.map((r) => {
          const owner = unitOccupants(r.unitId).owner;
          const unit = db.get('units', r.unitId);
          return `<tr><td>${twoLine(unitLabel(unit), residenceName(unit.residenceId))}</td><td class="hide-sm">${esc(owner ? fullName(owner) : '—')}</td><td class="num">${int(r.count)}</td><td class="hide-sm">${esc(date(r.oldest))}</td><td class="num"><strong style="color:var(--danger)">${esc(money(r.due))}</strong></td></tr>`;
        }).join('')}</tbody>
      </table></div>
    </section>`;
}

function expensesTab() {
  const list = inScope('expenses').filter((e) => e.status === 'paid' || e.status === 'approved');
  const byCat = new Map();
  list.forEach((e) => byCat.set(e.category, round2((byCat.get(e.category) || 0) + e.amount)));
  const items = [...byCat.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: tl('expenseCategory', k), value: v }));
  if (!items.length) return `<section class="card">${emptyState({ title: t('expenses.emptyTitle'), icon: 'receipt' })}</section>`;
  return `
    <div class="grid grid-2">
      <section class="card"><div class="card-head"><h2>${esc(t('reports.byCategory'))}</h2></div><div class="card-body">${hbars({ items, fmt: money, color: COLORS.accent })}</div></section>
      <section class="card"><div class="card-head"><h2>${esc(t('reports.share'))}</h2></div><div class="card-body">${donut({
        centerValue: money(sum(items, (i) => i.value)).replace(/\s?MAD|\s?د\.م\./, ''), centerLabel: t('common.total'), fmt: money,
        segments: items.slice(0, 6).map((i, k) => ({ label: i.label, value: i.value, color: PALETTE[k % PALETTE.length] })),
      })}</div></section>
    </div>`;
}

function complaintsTab() {
  if (!can('complaints')) return '';
  const list = inScope('complaints');
  const count = (key, values, fn) => values.map((v) => ({ label: tl(key, v), value: list.filter((c) => fn(c) === v).length }));
  const resolved = list.filter((c) => c.status === 'resolved' || c.status === 'closed').length;
  return `
    <div class="grid grid-kpi">
      ${kpi({ label: t('reports.totalComplaints'), value: int(list.length), icon: 'message', tone: 'info' })}
      ${kpi({ label: t('reports.resolvedRate'), value: pct(list.length ? resolved / list.length : 0), icon: 'check' })}
    </div>
    <div class="grid grid-2">
      <section class="card"><div class="card-head"><h2>${esc(t('common.status'))}</h2></div><div class="card-body">${hbars({ items: count('complaintStatus', ['new', 'in_progress', 'resolved', 'closed'], (c) => c.status), fmt: int })}</div></section>
      <section class="card"><div class="card-head"><h2>${esc(t('common.category'))}</h2></div><div class="card-body">${hbars({ items: count('complaintCategory', ['plumbing', 'electricity', 'elevator', 'cleaning', 'noise', 'security', 'parking', 'other'], (c) => c.category).filter((i) => i.value), fmt: int, color: COLORS.accent })}</div></section>
    </div>`;
}

export function mount(root, { params }) {
  const tabIds = ['finance', 'arrears', 'expenses', ...(can('complaints') ? ['complaints'] : [])];
  const tab = tabIds.includes(params[0]) ? params[0] : 'finance';
  const body = { finance: financeTab, arrears: arrearsTab, expenses: expensesTab, complaints: complaintsTab }[tab]();

  root.innerHTML = `
    ${pageHeader({ title: t('nav.reports'), subtitle: t('reports.subtitle'), actions: `<button type="button" class="btn btn-secondary" data-act="print">${icon('printer')}<span>${esc(t('common.print'))}</span></button>` })}
    ${tabs(tabIds.map((id) => ({ id, label: t(`reports.tab.${id}`), href: id === 'finance' ? '#/reports' : `#/reports/${id}` })), tab)}
    ${body}`;

  on(root, 'click', '[data-act="print"]', () => window.print());
  on(root, 'click', '[data-act="csv-arrears"]', () => {
    const rows = arrearsRows().map((r) => {
      const unit = db.get('units', r.unitId);
      const owner = unitOccupants(r.unitId).owner;
      return [residenceName(unit.residenceId), unitLabel(unit), owner ? fullName(owner) : '', r.count, r.oldest, amount(r.due)];
    });
    download('impayes.csv', toCsv([t('common.residence'), t('units.unit'), tl('residentType', 'owner'), t('reports.overdueCharges'), t('reports.oldest'), t('finance.due')], rows), 'text/csv;charset=utf-8');
  });
}
