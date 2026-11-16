import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2, MoneyPipe, pct } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { CallForFunds, Charge, Residence, Statement, Unit } from '../core/models';
import { can, isResident } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';
import { StatusBadge } from '../shared/status-badge';

type Tab = 'calls' | 'charges' | 'statement';

@Component({
  selector: 'app-finance',
  imports: [ReactiveFormsModule, TPipe, TlPipe, MoneyPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog, StatusBadge],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ (resident() ? 'nav.finance.mine' : 'nav.finance') | t }}</h1><p class="page-sub">{{ (resident() ? 'finance.subtitleMine' : 'finance.subtitle') | t }}</p></div>
        @if (tab() === 'calls' && canCreate()) {
          <div class="page-actions"><button type="button" class="btn btn-primary" (click)="openCall.set(true)"><app-icon name="plus" /><span>{{ 'finance.addCall' | t }}</span></button></div>
        }
      </header>

      <nav class="tabs" [attr.aria-label]="'common.sections' | t">
        @if (!resident()) { <a class="tab" href="javascript:void(0)" [attr.aria-current]="tab() === 'calls' ? 'page' : null" (click)="go('calls')">{{ 'finance.tabCalls' | t }}</a> }
        <a class="tab" href="javascript:void(0)" [attr.aria-current]="tab() === 'charges' ? 'page' : null" (click)="go('charges')">{{ 'finance.tabCharges' | t }}</a>
        <a class="tab" href="javascript:void(0)" [attr.aria-current]="tab() === 'statement' ? 'page' : null" (click)="go('statement')">{{ 'finance.statement' | t }}</a>
      </nav>

      @if (loading()) { <div class="card"><div class="empty"><div class="spinner" role="status"></div></div></div> }

      @else if (tab() === 'calls') {
        <div class="card">
          @if (!calls().length) { <div class="empty"><app-icon name="wallet" /><h3>{{ 'finance.emptyCalls' | t }}</h3><p>{{ 'finance.emptyCallsText' | t }}</p></div> }
          @else {
            <div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">{{ 'common.title' | t }}</th><th scope="col">{{ 'finance.dueDate' | t }}</th><th scope="col" class="num">{{ 'common.total' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
              <tbody>
                @for (c of calls(); track c.id) {
                  <tr>
                    <td><div class="cell-main">{{ c.title }}</div><div class="cell-sub">{{ residenceName(c.residenceId) }} · {{ c.period }}</div></td>
                    <td>{{ c.dueDate | fdate }}</td>
                    <td class="num">{{ (c.basis === 'tantiemes' ? c.totalAmount : c.amountPerUnit) | money }}</td>
                    <td><app-badge group="callStatus" [value]="c.status" /></td>
                    <td class="actions">
                      @if (c.status === 'draft' && canEdit()) {
                        <button type="button" class="icon-btn" (click)="toIssue.set(c)" [attr.aria-label]="'finance.issue' | t" [title]="'finance.issue' | t"><app-icon name="send" /></button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table></div>
          }
        </div>
      }

      @else if (tab() === 'charges') {
        <div class="card">
          <div class="lv-toolbar">
            <label class="sr-only" for="c-status">{{ 'common.status' | t }}</label>
            <select class="select" id="c-status" (change)="status.set($any($event.target).value)">
              <option value="">{{ 'common.status' | t }}</option>
              @for (s of statuses; track s) { <option [value]="s">{{ s | tl: 'chargeStatus' }}</option> }
            </select>
            <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: shownCharges().length } }}</span>
          </div>
          @if (!shownCharges().length) { <div class="empty"><app-icon name="receipt" /><h3>{{ 'finance.emptyCharges' | t }}</h3><p>{{ 'finance.emptyChargesText' | t }}</p></div> }
          @else {
            <div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">{{ 'finance.call' | t }}</th><th scope="col">{{ 'finance.dueDate' | t }}</th><th scope="col" class="num">{{ 'common.amount' | t }}</th><th scope="col" class="num hide-sm">{{ 'finance.paid' | t }}</th><th scope="col" class="num">{{ 'finance.due' | t }}</th><th scope="col">{{ 'common.status' | t }}</th></tr></thead>
              <tbody>
                @for (c of shownCharges(); track c.id) {
                  <tr><td class="cell-main">{{ c.label }}</td><td [style.color]="c.overdue ? 'var(--danger)' : ''">{{ c.dueDate | fdate }}</td><td class="num">{{ c.amount | money }}</td><td class="num hide-sm">{{ c.paid | money }}</td><td class="num"><strong>{{ c.due | money }}</strong></td><td><app-badge group="chargeStatus" [value]="c.status" /></td></tr>
                }
              </tbody>
            </table></div>
          }
        </div>
      }

      @else {
        <div class="card">
          <div class="lv-toolbar">
            <label class="sr-only" for="s-unit">{{ 'units.unit' | t }}</label>
            <select class="select" id="s-unit" (change)="loadStatement($any($event.target).value)">
              <option value="">{{ 'units.unit' | t }}</option>
              @for (u of unitChoices(); track u.id) { <option [value]="u.id" [selected]="u.id === statementUnit()">{{ u.label }}</option> }
            </select>
          </div>
          @if (!statement()) { <div class="empty"><app-icon name="receipt" /><h3>{{ 'finance.pickUnit' | t }}</h3><p>{{ 'finance.pickUnitText' | t }}</p></div> }
          @else {
            <div class="card-body"><div class="row between"><span class="muted">{{ 'units.balance' | t }}</span><strong class="num" style="font-size:var(--fs-lg)" [style.color]="statement()!.balance > 0 ? 'var(--danger)' : 'var(--success)'">{{ statement()!.balance | money }}</strong></div></div>
            <div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">{{ 'common.date' | t }}</th><th scope="col">{{ 'finance.operation' | t }}</th><th scope="col" class="num">{{ 'finance.debit' | t }}</th><th scope="col" class="num">{{ 'finance.credit' | t }}</th><th scope="col" class="num">{{ 'finance.runningBalance' | t }}</th></tr></thead>
              <tbody>
                @for (l of statement()!.lines; track $index) {
                  <tr><td class="nowrap">{{ l.date | fdate }}</td><td>{{ l.kind === 'charge' ? l.label : (('finance.paymentLine' | t) + ' — ' + (l.label | tl: 'paymentMethod')) }}@if (l.ref) { <div class="cell-sub">{{ l.ref }}</div> }</td><td class="num">{{ l.debit ? (l.debit | money) : '' }}</td><td class="num" style="color:var(--success)">{{ l.credit ? (l.credit | money) : '' }}</td><td class="num"><strong>{{ l.balance | money }}</strong></td></tr>
                }
              </tbody>
            </table></div>
          }
        </div>
      }
    </div>

    @if (openCall()) {
      <app-modal [title]="'finance.addCall' | t" (closed)="closeCall()">
        <form id="call-form" class="form-grid" [formGroup]="callForm" (ngSubmit)="saveCall()" novalidate>
          <div class="field full"><label for="k-res">{{ 'common.residence' | t }} *</label>
            <select class="select" id="k-res" formControlName="residenceId" [attr.aria-invalid]="bad('residenceId')"><option value="">{{ 'common.select' | t }}</option>@for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>
            @if (bad('residenceId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field full"><label for="k-title">{{ 'common.title' | t }} *</label><input class="input" id="k-title" formControlName="title" [attr.aria-invalid]="bad('title')" />@if (bad('title')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="k-period">{{ 'finance.period' | t }} *</label><input class="input" id="k-period" formControlName="period" placeholder="2026-T4" [attr.aria-invalid]="bad('period')" />@if (bad('period')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="k-due">{{ 'finance.dueDate' | t }} *</label><input class="input" id="k-due" type="date" dir="ltr" formControlName="dueDate" [attr.aria-invalid]="bad('dueDate')" />@if (bad('dueDate')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="k-basis">{{ 'finance.basis' | t }}</label>
            <select class="select" id="k-basis" formControlName="basis"><option value="tantiemes">{{ 'tantiemes' | tl: 'callBasis' }}</option><option value="fixed">{{ 'fixed' | tl: 'callBasis' }}</option></select></div>
          <div class="field"><label for="k-amount">{{ (callForm.controls.basis.value === 'fixed' ? 'finance.amountPerUnit' : 'finance.totalAmount') | t }} *</label>
            <input class="input" id="k-amount" type="number" step="0.01" dir="ltr" formControlName="amount" [attr.aria-invalid]="bad('amount')" />
            @if (bad('amount')) { <span class="field-error">{{ 'form.min' | t: { min: 0.01 } }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeCall()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="call-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (toIssue(); as c) {
      <app-confirm [title]="'finance.issue' | t" [message]="'finance.issueText' | t: { n: '…', total: ((c.basis === 'tantiemes' ? c.totalAmount : c.amountPerUnit) | money) }" [confirmLabel]="'finance.issue' | t" (confirmed)="issue(c)" (cancelled)="toIssue.set(null)" />
    }
  `,
})
export class FinancePage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly statuses = ['paid', 'partial', 'overdue', 'unpaid'] as const;
  protected readonly role = computed(() => this.auth.user()?.role);
  protected readonly resident = computed(() => isResident(this.role()));
  protected readonly canCreate = computed(() => can(this.role(), 'finance', 'c'));
  protected readonly canEdit = computed(() => can(this.role(), 'finance', 'e'));

  protected readonly tab = signal<Tab>(isResident(this.auth.user()?.role) ? 'charges' : 'calls');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly calls = signal<CallForFunds[]>([]);
  protected readonly charges = signal<Charge[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly status = signal('');
  protected readonly statement = signal<Statement | null>(null);
  protected readonly statementUnit = signal('');
  protected readonly openCall = signal(false);
  protected readonly toIssue = signal<CallForFunds | null>(null);

  protected readonly shownCharges = computed(() => this.charges().filter((c) => !this.status() || c.status === this.status()));
  /** Staff pick from the units API; residents (who cannot list units) from the lots found in their charges. */
  protected readonly unitChoices = computed(() =>
    this.resident()
      ? [...new Set(this.charges().map((c) => c.unitId))].map((id, i) => ({ id, label: `${this.i18n.t('units.unit')} ${i + 1}` }))
      : this.units().map((u) => ({ id: u.id, label: `${this.residenceName(u.residenceId)} — ${u.number}` })),
  );

  protected readonly callForm = inject(FormBuilder).nonNullable.group({
    residenceId: ['', Validators.required],
    title: ['', [Validators.required, Validators.minLength(2)]],
    period: ['', [Validators.required, Validators.minLength(2)]],
    dueDate: ['', Validators.required],
    basis: ['tantiemes' as 'tantiemes' | 'fixed'],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });

  constructor() {
    this.loadAll();
  }

  private fail = (e: unknown) => { this.toast.error(e, this.i18n.t('common.error')); this.loading.set(false); };

  private loadAll(): void {
    this.loading.set(true);
    this.http.get<Charge[]>('/api/charges?limit=200').subscribe({ next: (c) => { this.charges.set(c); this.loading.set(false); }, error: this.fail });
    if (!this.resident()) {
      this.http.get<CallForFunds[]>('/api/calls?limit=200').subscribe({ next: (c) => this.calls.set(c), error: this.fail });
      this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r), error: this.fail });
      this.http.get<Unit[]>('/api/units?limit=200').subscribe({ next: (u) => this.units.set(u), error: this.fail });
    }
  }

  protected residenceName(id: string): string {
    return this.residences().find((r) => r.id === id)?.name ?? '—';
  }

  protected go(tab: Tab): void {
    this.tab.set(tab);
  }

  protected loadStatement(unitId: string): void {
    this.statementUnit.set(unitId);
    if (!unitId) { this.statement.set(null); return; }
    this.http.get<Statement>(`/api/units/${unitId}/statement`).subscribe({ next: (s) => this.statement.set(s), error: this.fail });
  }

  protected bad(name: keyof typeof this.callForm.controls): boolean {
    const c = this.callForm.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected closeCall(): void {
    this.openCall.set(false);
    this.callForm.reset({ basis: 'tantiemes' });
  }

  protected saveCall(): void {
    this.callForm.markAllAsTouched();
    if (this.callForm.invalid) return;
    const v = this.callForm.getRawValue();
    this.busy.set(true);
    const body = { residenceId: v.residenceId, title: v.title.trim(), period: v.period.trim(), dueDate: v.dueDate, basis: v.basis, ...(v.basis === 'fixed' ? { amountPerUnit: v.amount } : { totalAmount: v.amount }) };
    this.http.post('/api/calls', body).subscribe({
      next: () => { this.busy.set(false); this.closeCall(); this.toast.show(this.i18n.t('common.saved')); this.loadAll(); },
      error: (e: unknown) => { this.busy.set(false); this.toast.error(e, this.i18n.t('common.error')); },
    });
  }

  protected issue(call: CallForFunds): void {
    this.toIssue.set(null);
    this.http.post<{ charges: number }>(`/api/calls/${call.id}/issue`, {}).subscribe({
      next: (r) => { this.toast.show(this.i18n.t('finance.issued', { n: r.charges })); this.loadAll(); },
      error: (e: unknown) => this.toast.error(e, this.i18n.t('common.error')),
    });
  }

  protected readonly pct = pct;
}
