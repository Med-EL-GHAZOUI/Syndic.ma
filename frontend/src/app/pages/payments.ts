import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2, MoneyPipe } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { Charge, Payment, PaymentMethod, Unit } from '../core/models';
import { can, isResident } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';
import { StatusBadge } from '../shared/status-badge';

type Action = { kind: 'confirm' | 'reject' | 'reverse'; payment: Payment };
const today = () => new Date().toISOString().slice(0, 10);

@Component({
  selector: 'app-payments',
  imports: [ReactiveFormsModule, TPipe, TlPipe, MoneyPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog, StatusBadge],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ (resident() ? 'nav.payments.mine' : 'nav.payments') | t }}</h1><p class="page-sub">{{ (resident() ? 'payments.subtitleMine' : 'payments.subtitle') | t }}</p></div>
        @if (canCreate()) {
          <div class="page-actions"><button type="button" class="btn btn-primary" (click)="openForm.set(true)"><app-icon [name]="resident() ? 'send' : 'plus'" /><span>{{ (resident() ? 'payments.declare' : 'payments.add') | t }}</span></button></div>
        }
      </header>
      <p class="note plain"><app-icon name="info" /> {{ 'payments.manualNote' | t }}</p>

      <div class="card">
        <div class="lv-toolbar">
          <label class="sr-only" for="p-status">{{ 'common.status' | t }}</label>
          <select class="select" id="p-status" (change)="filter.set($any($event.target).value)">
            <option value="">{{ 'common.status' | t }}</option>
            @for (s of statuses; track s) { <option [value]="s">{{ s | tl: 'paymentStatus' }}</option> }
          </select>
          <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: shown().length } }}</span>
        </div>
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!shown().length) { <div class="empty"><app-icon name="card" /><h3>{{ 'payments.emptyTitle' | t }}</h3><p>{{ 'payments.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'payments.receiptNo' | t }}</th><th scope="col">{{ 'common.date' | t }}</th><th scope="col">{{ 'payments.payer' | t }}</th><th scope="col" class="hide-md">{{ 'payments.method' | t }}</th><th scope="col" class="num">{{ 'common.amount' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (p of shown(); track p.id) {
                <tr>
                  <td class="cell-main num">{{ p.receiptNo ?? '—' }}</td>
                  <td>{{ p.date | fdate }}</td>
                  <td>{{ p.payerName }}@if (p.reason) { <div class="cell-sub">{{ p.reason }}</div> }</td>
                  <td class="hide-md">{{ p.method | tl: 'paymentMethod' }}</td>
                  <td class="num"><strong>{{ p.amount | money }}</strong></td>
                  <td><app-badge group="paymentStatus" [value]="p.status" /></td>
                  <td class="actions">
                    @if (canValidate()) {
                      @if (p.status === 'pending') {
                        <button type="button" class="icon-btn" (click)="act.set({ kind: 'confirm', payment: p })" [attr.aria-label]="'payments.confirm' | t" [title]="'payments.confirm' | t"><app-icon name="check" /></button>
                        <button type="button" class="icon-btn danger" (click)="openReason({ kind: 'reject', payment: p })" [attr.aria-label]="'payments.reject' | t" [title]="'payments.reject' | t"><app-icon name="ban" /></button>
                      }
                      @if (p.status === 'recorded') {
                        <button type="button" class="icon-btn danger" (click)="openReason({ kind: 'reverse', payment: p })" [attr.aria-label]="'payments.reverse' | t" [title]="'payments.reverse' | t"><app-icon name="undo" /></button>
                      }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (openForm()) {
      <app-modal [title]="(resident() ? 'payments.declare' : 'payments.add') | t" (closed)="closeForm()">
        <p class="note plain" style="margin-bottom:16px">{{ (resident() ? 'payments.declareNote' : 'payments.manualNote') | t }}</p>
        <form id="pay-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="y-unit">{{ 'units.unit' | t }} *</label>
            <select class="select" id="y-unit" formControlName="unitId" [attr.aria-invalid]="bad('unitId')"><option value="">{{ 'common.select' | t }}</option>@for (u of unitChoices(); track u.id) { <option [value]="u.id">{{ u.label }}</option> }</select>
            @if (bad('unitId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="y-amount">{{ 'common.amount' | t }} *</label><input class="input" id="y-amount" type="number" step="0.01" dir="ltr" formControlName="amount" [attr.aria-invalid]="bad('amount')" />@if (bad('amount')) { <span class="field-error">{{ 'form.min' | t: { min: 0.01 } }}</span> }</div>
          <div class="field"><label for="y-date">{{ 'common.date' | t }} *</label><input class="input" id="y-date" type="date" dir="ltr" [max]="todayStr" formControlName="date" [attr.aria-invalid]="bad('date')" />@if (bad('date')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="y-method">{{ 'payments.method' | t }}</label><select class="select" id="y-method" formControlName="method"><option value="transfer">{{ 'transfer' | tl: 'paymentMethod' }}</option><option value="cheque">{{ 'cheque' | tl: 'paymentMethod' }}</option><option value="cash">{{ 'cash' | tl: 'paymentMethod' }}</option></select></div>
          <div class="field"><label for="y-ref">{{ 'payments.reference' | t }}@if (resident()) { * }</label><input class="input" id="y-ref" formControlName="reference" [attr.aria-invalid]="bad('reference')" />@if (bad('reference')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="pay-form" class="btn btn-primary" [disabled]="busy()">{{ (resident() ? 'payments.declareSubmit' : 'common.save') | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (reason(); as r) {
      <app-modal [title]="(r.kind === 'reject' ? 'payments.reject' : 'payments.reverse') | t" size="sm" (closed)="reason.set(null)">
        <form id="reason-form" class="stack" [formGroup]="reasonForm" (ngSubmit)="submitReason()" novalidate>
          <p class="note plain">{{ r.kind === 'reject' ? ('payments.rejectText' | t) : ('payments.reverseText' | t: { no: r.payment.receiptNo ?? '' }) }}</p>
          <div class="field"><label for="why">{{ 'payments.reason' | t }} *</label><textarea class="textarea" id="why" rows="3" formControlName="reason" [attr.aria-invalid]="reasonForm.controls.reason.invalid && reasonForm.controls.reason.touched ? 'true' : null"></textarea>
            @if (reasonForm.controls.reason.invalid && reasonForm.controls.reason.touched) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="reason.set(null)">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="reason-form" class="btn btn-danger" [disabled]="busy()">{{ 'common.confirm' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (act(); as a) {
      <app-confirm [title]="'payments.confirm' | t" [message]="'payments.confirmText' | t: { amount: (a.payment.amount | money), name: a.payment.payerName }" (confirmed)="confirm(a.payment)" (cancelled)="act.set(null)" />
    }
  `,
})
export class PaymentsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly statuses = ['pending', 'recorded', 'reversed', 'rejected'] as const;
  protected readonly todayStr = today();
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly resident = computed(() => isResident(this.role()));
  protected readonly canCreate = computed(() => can(this.role(), 'payments', 'c'));
  protected readonly canValidate = computed(() => can(this.role(), 'payments', 'x'));

  protected readonly rows = signal<Payment[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly charges = signal<Charge[]>([]);
  protected readonly filter = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly openForm = signal(false);
  protected readonly act = signal<Action | null>(null);
  protected readonly reason = signal<Action | null>(null);

  protected readonly shown = computed(() => this.rows().filter((p) => !this.filter() || p.status === this.filter()));
  protected readonly unitChoices = computed(() =>
    this.resident()
      ? [...new Set(this.charges().filter((c) => c.due > 0).map((c) => c.unitId))].map((id, i) => ({ id, label: `${this.i18n.t('units.unit')} ${i + 1}` }))
      : this.units().map((u) => ({ id: u.id, label: u.number })),
  );

  protected readonly form = inject(FormBuilder).nonNullable.group({
    unitId: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    date: [today(), Validators.required],
    method: ['transfer' as PaymentMethod],
    reference: [''],
  });
  protected readonly reasonForm = inject(FormBuilder).nonNullable.group({ reason: ['', [Validators.required, Validators.minLength(3)]] });

  constructor() {
    this.load();
    if (this.resident()) this.http.get<Charge[]>('/api/charges?limit=200').subscribe({ next: (c) => this.charges.set(c) });
    else if (can(this.role(), 'units')) this.http.get<Unit[]>('/api/units?limit=200').subscribe({ next: (u) => this.units.set(u) });
  }

  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };

  private load(): void {
    this.http.get<Payment[]>('/api/payments?limit=200').subscribe({ next: (p) => { this.rows.set(p); this.loading.set(false); }, error: this.fail });
  }

  protected bad(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return (c.invalid && (c.touched || c.dirty)) || (name === 'reference' && this.resident() && !c.value && c.touched);
  }

  protected closeForm(): void {
    this.openForm.set(false);
    this.form.reset({ date: today(), method: 'transfer' });
  }

  protected save(): void {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || (this.resident() && !v.reference.trim())) return;
    this.busy.set(true);
    const url = this.resident() ? '/api/payments/declare' : '/api/payments';
    const body = { unitId: v.unitId, amount: v.amount, date: v.date, method: v.method, ...(v.reference.trim() ? { reference: v.reference.trim() } : {}) };
    this.http.post<Payment>(url, body).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.closeForm();
        this.toast.show(this.resident() ? this.i18n.t('payments.declared') : this.i18n.t('payments.recorded', { no: p.receiptNo ?? '' }));
        this.load();
      },
      error: this.fail,
    });
  }

  protected confirm(p: Payment): void {
    this.act.set(null);
    this.http.post<{ receiptNo: string }>(`/api/payments/${p.id}/confirm`, {}).subscribe({
      next: (r) => { this.toast.show(this.i18n.t('payments.recorded', { no: r.receiptNo })); this.load(); },
      error: this.fail,
    });
  }

  protected openReason(a: Action): void {
    this.reasonForm.reset();
    this.reason.set(a);
  }

  protected submitReason(): void {
    this.reasonForm.markAllAsTouched();
    const a = this.reason();
    if (!a || this.reasonForm.invalid) return;
    this.busy.set(true);
    this.http.post(`/api/payments/${a.payment.id}/${a.kind}`, { reason: this.reasonForm.getRawValue().reason.trim() }).subscribe({
      next: () => {
        this.busy.set(false);
        this.reason.set(null);
        this.toast.show(this.i18n.t(a.kind === 'reject' ? 'payments.rejected' : 'payments.reversed'), 'info');
        this.load();
      },
      error: this.fail,
    });
  }
}
