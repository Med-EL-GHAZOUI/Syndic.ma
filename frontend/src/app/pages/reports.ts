import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { DatePipe2, MoneyPipe, pct } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { Charge, Complaint, Expense, FinanceSummary, Residence, Unit } from '../core/models';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon';

type Tab = 'finance' | 'arrears' | 'expenses' | 'complaints';
const TABS: Tab[] = ['finance', 'arrears', 'expenses', 'complaints'];
const LIMIT = 200; // API page cap: lists that reach it are flagged as partial, never silently truncated
const cents = (n: number) => Math.round((Number(n) || 0) * 100);

@Component({
  selector: 'app-reports',
  imports: [TPipe, TlPipe, MoneyPipe, DatePipe2, IconComponent],
  template: `
    <div class="page">
      <header class="page-header"><div><h1>{{ 'nav.reports' | t }}</h1><p class="page-sub">{{ 'reports.subtitle' | t }}</p></div></header>

      <div class="tabs" role="tablist">
        @for (x of tabs; track x) {
          <button type="button" role="tab" class="tab" [attr.aria-selected]="tab() === x" [attr.aria-current]="tab() === x ? 'page' : null" (click)="tab.set(x)">{{ 'reports.tab.' + x | t }}</button>
        }
      </div>

      @if (loading()) { <div class="card"><div class="empty"><div class="spinner" role="status"></div></div></div> }
      @else {
        @switch (tab()) {
          @case ('finance') {
            @if (summary(); as s) {
              <div class="grid grid-kpi">
                <div class="card kpi"><div><div class="kpi-label">{{ 'reports.cashBalance' | t }}</div><div class="kpi-value">{{ cash() | money }}</div><div class="kpi-hint">{{ 'reports.cashHint' | t }}</div></div></div>
                <div class="card kpi"><div><div class="kpi-label">{{ 'dash.collected' | t }}</div><div class="kpi-value">{{ s.collected | money }}</div></div></div>
                <div class="card kpi"><div><div class="kpi-label">{{ 'finance.outstanding' | t }}</div><div class="kpi-value">{{ s.outstanding | money }}</div></div></div>
                <div class="card kpi"><div><div class="kpi-label">{{ 'dash.overdue' | t }}</div><div class="kpi-value">{{ s.overdue | money }}</div><div class="kpi-hint">{{ rate(s.collectionRate) }}</div></div></div>
              </div>
            }
            <div class="card">
              <h2 class="card-title">{{ 'reports.byResidence' | t }}</h2>
              <div class="table-wrap"><table class="table">
                <thead><tr><th scope="col">{{ 'common.residence' | t }}</th><th scope="col" class="num">{{ 'finance.charged' | t }}</th><th scope="col" class="num">{{ 'dash.collected' | t }}</th><th scope="col" class="num">{{ 'finance.outstanding' | t }}</th><th scope="col" class="num">{{ 'dash.overdue' | t }}</th><th scope="col" class="num hide-sm">{{ 'dash.rate' | t }}</th></tr></thead>
                <tbody>
                  @for (r of perResidence(); track r.id) {
                    <tr><td>{{ r.name }}</td><td class="num">{{ r.s.charged | money }}</td><td class="num">{{ r.s.collected | money }}</td><td class="num">{{ r.s.outstanding | money }}</td><td class="num">{{ r.s.overdue | money }}</td><td class="num hide-sm">{{ rate(r.s.collectionRate) }}</td></tr>
                  }
                </tbody>
              </table></div>
            </div>
          }
          @case ('arrears') {
            @if (partial()) { <p class="note warn" role="note">{{ 'reports.partial' | t: { n: limit } }}</p> }
            <div class="grid grid-kpi">
              <div class="card kpi"><div><div class="kpi-label">{{ 'reports.totalArrears' | t }}</div><div class="kpi-value">{{ arrearsTotal() | money }}</div></div></div>
              <div class="card kpi"><div><div class="kpi-label">{{ 'reports.overdueCharges' | t }}</div><div class="kpi-value">{{ overdueCharges().length }}</div></div></div>
            </div>
            <div class="card">
              <h2 class="card-title">{{ 'reports.arrears' | t }}</h2>
              @if (!arrears().length) { <div class="empty"><app-icon name="check" /><h3>{{ 'common.noResults' | t }}</h3></div> }
              @else {
                <div class="table-wrap"><table class="table">
                  <thead><tr><th scope="col">{{ 'units.unit' | t }}</th><th scope="col" class="num">{{ 'reports.overdueCharges' | t }}</th><th scope="col" class="num">{{ 'common.amount' | t }}</th><th scope="col" class="hide-sm">{{ 'reports.oldest' | t }}</th></tr></thead>
                  <tbody>@for (a of arrears(); track a.unitId) { <tr><td>{{ unitLabel(a.unitId) }}</td><td class="num">{{ a.count }}</td><td class="num">{{ a.cents / 100 | money }}</td><td class="hide-sm">{{ a.oldest | fdate }}</td></tr> }</tbody>
                </table></div>
              }
            </div>
          }
          @case ('expenses') {
            @if (partial()) { <p class="note warn" role="note">{{ 'reports.partial' | t: { n: limit } }}</p> }
            <div class="card">
              <h2 class="card-title">{{ 'reports.byCategory' | t }}</h2>
              @if (!byCategory().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'common.noResults' | t }}</h3></div> }
              @else {
                <div class="table-wrap"><table class="table">
                  <thead><tr><th scope="col">{{ 'common.category' | t }}</th><th scope="col" class="num">{{ 'common.amount' | t }}</th><th scope="col" class="num">{{ 'reports.share' | t }}</th></tr></thead>
                  <tbody>@for (c of byCategory(); track c.category) { <tr><td>{{ c.category | tl: 'expenseCategory' }}</td><td class="num">{{ c.cents / 100 | money }}</td><td class="num">{{ share(c.cents) }}</td></tr> }</tbody>
                  <tfoot><tr><th scope="row">{{ 'common.total' | t }}</th><th class="num">{{ expensesTotal() / 100 | money }}</th><th></th></tr></tfoot>
                </table></div>
              }
            </div>
          }
          @case ('complaints') {
            @if (partial()) { <p class="note warn" role="note">{{ 'reports.partial' | t: { n: limit } }}</p> }
            <div class="grid grid-kpi">
              <div class="card kpi"><div><div class="kpi-label">{{ 'reports.totalComplaints' | t }}</div><div class="kpi-value">{{ complaints().length }}</div></div></div>
              <div class="card kpi"><div><div class="kpi-label">{{ 'reports.resolvedRate' | t }}</div><div class="kpi-value">{{ resolvedRate() }}</div></div></div>
            </div>
            <div class="card">
              <div class="table-wrap"><table class="table">
                <thead><tr><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="num">{{ 'common.total' | t }}</th></tr></thead>
                <tbody>@for (c of complaintsByStatus(); track c.status) { <tr><td>{{ c.status | tl: 'complaintStatus' }}</td><td class="num">{{ c.n }}</td></tr> }</tbody>
              </table></div>
            </div>
          }
        }
      }
    </div>
  `,
})
export class ReportsPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly tabs = TABS;
  protected readonly limit = LIMIT;
  protected readonly tab = signal<Tab>('finance');
  protected readonly loading = signal(true);
  protected readonly summary = signal<FinanceSummary | null>(null);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly byRes = signal<Record<string, FinanceSummary>>({});
  protected readonly units = signal<Unit[]>([]);
  protected readonly charges = signal<Charge[]>([]);
  protected readonly expenses = signal<Expense[]>([]);
  protected readonly complaints = signal<Complaint[]>([]);

  protected readonly cash = computed(() => Math.round(((this.summary()?.collected ?? 0) - (this.summary()?.expensesPaid ?? 0)) * 100) / 100);
  protected readonly perResidence = computed(() => this.residences().filter((r) => this.byRes()[r.id]).map((r) => ({ id: r.id, name: r.name, s: this.byRes()[r.id] })));
  protected readonly overdueCharges = computed(() => this.charges().filter((c) => c.overdue && c.due > 0));
  protected readonly arrearsTotal = computed(() => this.overdueCharges().reduce((a, c) => a + cents(c.due), 0) / 100);
  protected readonly arrears = computed(() => {
    const m = new Map<string, { unitId: string; count: number; cents: number; oldest: string }>();
    for (const c of this.overdueCharges()) {
      const cur = m.get(c.unitId) ?? { unitId: c.unitId, count: 0, cents: 0, oldest: c.dueDate };
      cur.count += 1; cur.cents += cents(c.due); if (c.dueDate < cur.oldest) cur.oldest = c.dueDate;
      m.set(c.unitId, cur);
    }
    return [...m.values()].sort((a, b) => b.cents - a.cents);
  });
  private readonly paidExpenses = computed(() => this.expenses().filter((e) => e.status === 'paid'));
  protected readonly expensesTotal = computed(() => this.paidExpenses().reduce((a, e) => a + cents(e.amount), 0));
  protected readonly byCategory = computed(() => {
    const m = new Map<string, number>();
    for (const e of this.paidExpenses()) m.set(e.category, (m.get(e.category) ?? 0) + cents(e.amount));
    return [...m.entries()].map(([category, c]) => ({ category, cents: c })).sort((a, b) => b.cents - a.cents);
  });
  protected readonly complaintsByStatus = computed(() => {
    const m = new Map<string, number>();
    for (const c of this.complaints()) m.set(c.status, (m.get(c.status) ?? 0) + 1);
    return [...m.entries()].map(([status, n]) => ({ status, n }));
  });
  protected readonly resolvedRate = computed(() => {
    const all = this.complaints().length;
    return all ? pct(this.complaints().filter((c) => c.status === 'resolved' || c.status === 'closed').length / all) : '—';
  });
  protected readonly partial = computed(() => {
    const n = { arrears: this.charges().length, expenses: this.expenses().length, complaints: this.complaints().length }[this.tab() as 'arrears' | 'expenses' | 'complaints'];
    return n !== undefined && n >= LIMIT;
  });

  constructor() {
    const fail = (e: unknown) => { this.toast.error(e, this.i18n.t('common.error')); this.loading.set(false); };
    this.http.get<FinanceSummary>('/api/finance/summary').subscribe({ next: (s) => this.summary.set(s), error: fail });
    this.http.get<Residence[]>('/api/residences').subscribe({
      next: (rs) => {
        this.residences.set(rs);
        rs.forEach((r) => this.http.get<FinanceSummary>(`/api/finance/summary?residenceId=${r.id}`).subscribe({ next: (s) => this.byRes.update((m) => ({ ...m, [r.id]: s })), error: fail }));
        this.loading.set(false);
      },
      error: fail,
    });
    this.http.get<Charge[]>(`/api/charges?status=overdue&limit=${LIMIT}`).subscribe({ next: (c) => this.charges.set(c), error: fail });
    this.http.get<Unit[]>(`/api/units?limit=${LIMIT}`).subscribe({ next: (u) => this.units.set(u), error: fail });
    this.http.get<Expense[]>(`/api/expenses?status=paid&limit=${LIMIT}`).subscribe({ next: (e) => this.expenses.set(e), error: fail });
    this.http.get<Complaint[]>(`/api/complaints?limit=${LIMIT}`).subscribe({ next: (c) => this.complaints.set(c), error: fail });
  }

  protected rate = (n: number) => pct(n);
  protected share = (c: number) => (this.expensesTotal() ? pct(c / this.expensesTotal()) : '—');
  protected unitLabel(id: string): string { return this.units().find((u) => u.id === id)?.number ?? id.slice(0, 8); }
}
