import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { MoneyPipe, DatePipe2, pct } from '../core/format';
import { I18nService, TPipe } from '../core/i18n.service';
import { Charge, FinanceSummary, Payment } from '../core/models';
import { can, isResident } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { StatusBadge } from '../shared/status-badge';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, TPipe, MoneyPipe, DatePipe2, StatusBadge],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'dash.hello' | t: { name: firstName() } }}</h1></div>
      </header>

      @if (loading()) {
        <div class="card"><div class="empty"><div class="spinner" role="status"></div></div></div>
      } @else {
        @if (staff()) {
          @if (pending().length && canValidate()) {
            <a class="note warn" routerLink="/payments" style="display:block">{{ 'dash.pendingPayments' | t: { n: pending().length } }}</a>
          }
          @if (summary(); as s) {
            <div class="grid grid-kpi">
              <div class="card kpi"><div><div class="kpi-label">{{ 'dash.rate' | t }}</div><div class="kpi-value">{{ rate() }}</div><div class="kpi-hint">{{ 'dash.ofCharged' | t: { total: (s.charged | money) } }}</div></div></div>
              <div class="card kpi"><div><div class="kpi-label">{{ 'dash.collected' | t }}</div><div class="kpi-value">{{ s.collected | money }}</div></div></div>
              <div class="card kpi"><div><div class="kpi-label">{{ 'finance.outstanding' | t }}</div><div class="kpi-value">{{ s.outstanding | money }}</div></div></div>
              <div class="card kpi"><div><div class="kpi-label">{{ 'dash.overdue' | t }}</div><div class="kpi-value" style="color:var(--danger)">{{ s.overdue | money }}</div></div></div>
              <div class="card kpi"><div><div class="kpi-label">{{ 'dash.expenses' | t }}</div><div class="kpi-value">{{ s.expensesPaid | money }}</div></div></div>
            </div>
          }
        } @else if (owner()) {
          <div class="grid grid-kpi">
            <div class="card kpi"><div><div class="kpi-label">{{ 'dash.myBalance' | t }}</div><div class="kpi-value" [style.color]="balance() > 0 ? 'var(--danger)' : ''">{{ balance() | money }}</div><div class="kpi-hint">{{ (balance() > 0 ? 'dash.myBalanceDue' : 'dash.myBalanceOk') | t }}</div></div></div>
            @if (nextDue(); as n) {
              <div class="card kpi"><div><div class="kpi-label">{{ 'dash.nextDue' | t }}</div><div class="kpi-value">{{ n.dueDate | fdate }}</div><div class="kpi-hint">{{ n.label }}</div></div></div>
            }
          </div>
          <section class="card">
            <div class="card-head"><h2>{{ 'dash.myCharges' | t }}</h2><a class="small" routerLink="/finance">{{ 'common.viewAll' | t }}</a></div>
            @if (openCharges().length) {
              <ul class="list">
                @for (c of openCharges(); track c.id) {
                  <li><div class="grow"><div class="cell-main">{{ c.label }}</div><div class="cell-sub">{{ 'finance.dueDate' | t }} {{ c.dueDate | fdate }}</div></div><app-badge group="chargeStatus" [value]="c.status" /><strong class="num">{{ c.due | money }}</strong></li>
                }
              </ul>
            } @else { <div class="empty"><p>{{ 'dash.myBalanceOk' | t }}</p></div> }
          </section>
        } @else {
          <div class="card"><div class="empty"><p>{{ 'dash.noTickets' | t }}</p></div></div>
        }
      }
    </div>
  `,
})
export class DashboardPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly loading = signal(true);
  protected readonly summary = signal<FinanceSummary | null>(null);
  protected readonly pending = signal<Payment[]>([]);
  protected readonly charges = signal<Charge[]>([]);

  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly firstName = computed(() => (this.auth.user()?.name ?? '').split(' ')[0]);
  protected readonly staff = computed(() => can(this.role(), 'reports'));
  protected readonly owner = computed(() => this.role() === 'owner');
  protected readonly canValidate = computed(() => can(this.role(), 'payments', 'x'));
  protected readonly rate = computed(() => pct(this.summary()?.collectionRate ?? 0));
  protected readonly openCharges = computed(() => this.charges().filter((c) => c.due > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 6));
  protected readonly balance = computed(() => Math.round(this.charges().reduce((a, c) => a + Math.round(c.due * 100), 0)) / 100);
  protected readonly nextDue = computed(() => this.openCharges()[0] ?? null);

  constructor() {
    const fail = (e: unknown) => {
      this.toast.error(e, this.i18n.t('common.error'));
      this.loading.set(false);
    };
    if (this.staff()) {
      this.http.get<FinanceSummary>('/api/finance/summary').subscribe({
        next: (s) => {
          this.summary.set(s);
          if (this.canValidate()) {
            this.http.get<Payment[]>('/api/payments?status=pending').subscribe({ next: (p) => { this.pending.set(p); this.loading.set(false); }, error: fail });
          } else this.loading.set(false);
        },
        error: fail,
      });
    } else if (isResident(this.role()) && can(this.role(), 'finance')) {
      this.http.get<Charge[]>('/api/charges?limit=200').subscribe({ next: (c) => { this.charges.set(c); this.loading.set(false); }, error: fail });
    } else this.loading.set(false);
  }
}
