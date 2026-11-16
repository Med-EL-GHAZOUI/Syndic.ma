import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2, MoneyPipe } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { Expense, Residence } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';
import { StatusBadge } from '../shared/status-badge';

const CATEGORIES = ['cleaning', 'security', 'elevator', 'electricity', 'water', 'gardening', 'repairs', 'insurance', 'admin', 'other'];
type Step = { kind: 'approve' | 'pay'; e: Expense };

@Component({
  selector: 'app-expenses',
  imports: [ReactiveFormsModule, TPipe, TlPipe, MoneyPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog, StatusBadge],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.expenses' | t }}</h1><p class="page-sub">{{ 'expenses.subtitle' | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="open.set(true)"><app-icon name="plus" /><span>{{ 'expenses.add' | t }}</span></button></div> }
      </header>
      <div class="card">
        <div class="lv-toolbar">
          <label class="sr-only" for="e-status">{{ 'common.status' | t }}</label>
          <select class="select" id="e-status" (change)="filter.set($any($event.target).value)"><option value="">{{ 'common.status' | t }}</option>@for (s of statuses; track s) { <option [value]="s">{{ s | tl: 'expenseStatus' }}</option> }</select>
          <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: shown().length } }}</span>
        </div>
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!shown().length) { <div class="empty"><app-icon name="receipt" /><h3>{{ 'expenses.emptyTitle' | t }}</h3><p>{{ 'expenses.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'common.date' | t }}</th><th scope="col">{{ 'expenses.label' | t }}</th><th scope="col" class="hide-md">{{ 'common.category' | t }}</th><th scope="col" class="num">{{ 'common.amount' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (e of shown(); track e.id) {
                <tr>
                  <td>{{ e.date | fdate }}</td>
                  <td><div class="cell-main">{{ e.label }}</div>@if (e.invoiceRef) { <div class="cell-sub">{{ e.invoiceRef }}</div> }@if (e.cancelReason) { <div class="cell-sub">{{ e.cancelReason }}</div> }</td>
                  <td class="hide-md">{{ e.category | tl: 'expenseCategory' }}</td>
                  <td class="num"><strong>{{ e.amount | money }}</strong></td>
                  <td><app-badge group="expenseStatus" [value]="e.status" /></td>
                  <td class="actions">
                    @if (canApprove()) {
                      @if (e.status === 'pending') { <button type="button" class="icon-btn" (click)="step.set({ kind: 'approve', e })" [attr.aria-label]="'expenses.approve' | t" [title]="'expenses.approve' | t"><app-icon name="check" /></button> }
                      @if (e.status === 'approved') { <button type="button" class="icon-btn" (click)="step.set({ kind: 'pay', e })" [attr.aria-label]="'expenses.pay' | t" [title]="'expenses.pay' | t"><app-icon name="wallet" /></button> }
                      @if (e.status === 'approved' || e.status === 'paid') { <button type="button" class="icon-btn danger" (click)="openCancel(e)" [attr.aria-label]="'expenses.cancel' | t" [title]="'expenses.cancel' | t"><app-icon name="ban" /></button> }
                    }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (open()) {
      <app-modal [title]="'expenses.add' | t" (closed)="closeForm()">
        <form id="exp-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="x-res">{{ 'common.residence' | t }} *</label><select class="select" id="x-res" formControlName="residenceId" [attr.aria-invalid]="bad('residenceId')"><option value="">{{ 'common.select' | t }}</option>@for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>@if (bad('residenceId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field full"><label for="x-label">{{ 'expenses.label' | t }} *</label><input class="input" id="x-label" formControlName="label" [attr.aria-invalid]="bad('label')" />@if (bad('label')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="x-cat">{{ 'common.category' | t }}</label><select class="select" id="x-cat" formControlName="category">@for (c of categories; track c) { <option [value]="c">{{ c | tl: 'expenseCategory' }}</option> }</select></div>
          <div class="field"><label for="x-amount">{{ 'common.amount' | t }} *</label><input class="input" id="x-amount" type="number" step="0.01" dir="ltr" formControlName="amount" [attr.aria-invalid]="bad('amount')" />@if (bad('amount')) { <span class="field-error">{{ 'form.min' | t: { min: 0.01 } }}</span> }</div>
          <div class="field"><label for="x-date">{{ 'expenses.invoiceDate' | t }} *</label><input class="input" id="x-date" type="date" dir="ltr" formControlName="date" [attr.aria-invalid]="bad('date')" />@if (bad('date')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="x-ref">{{ 'expenses.invoiceRef' | t }}</label><input class="input" id="x-ref" formControlName="invoiceRef" /></div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="exp-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (cancelling(); as c) {
      <app-modal [title]="'expenses.cancel' | t" size="sm" (closed)="cancelling.set(null)">
        <form id="cx-form" class="stack" [formGroup]="reasonForm" (ngSubmit)="submitCancel(c)" novalidate>
          <p class="note plain">{{ 'expenses.cancelText' | t }}</p>
          <div class="field"><label for="cx-why">{{ 'payments.reason' | t }} *</label><textarea class="textarea" id="cx-why" rows="3" formControlName="reason" [attr.aria-invalid]="reasonForm.controls.reason.invalid && reasonForm.controls.reason.touched ? 'true' : null"></textarea>@if (reasonForm.controls.reason.invalid && reasonForm.controls.reason.touched) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="cancelling.set(null)">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="cx-form" class="btn btn-danger" [disabled]="busy()">{{ 'common.confirm' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (step(); as s) {
      <app-confirm [title]="(s.kind === 'approve' ? 'expenses.approve' : 'expenses.pay') | t" [message]="(s.kind === 'approve' ? 'expenses.approveText' : 'expenses.payText') | t: { amount: (s.e.amount | money) }" (confirmed)="run(s)" (cancelled)="step.set(null)" />
    }
  `,
})
export class ExpensesPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly statuses = ['pending', 'approved', 'paid', 'cancelled'] as const;
  protected readonly categories = CATEGORIES;
  protected readonly canCreate = computed(() => can(this.auth.user()?.role, 'expenses', 'c'));
  protected readonly canApprove = computed(() => can(this.auth.user()?.role, 'expenses', 'a'));
  protected readonly rows = signal<Expense[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly filter = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly step = signal<Step | null>(null);
  protected readonly cancelling = signal<Expense | null>(null);
  protected readonly shown = computed(() => this.rows().filter((e) => !this.filter() || e.status === this.filter()));

  protected readonly form = inject(FormBuilder).nonNullable.group({
    residenceId: ['', Validators.required],
    label: ['', [Validators.required, Validators.minLength(2)]],
    category: ['repairs'],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    date: [new Date().toISOString().slice(0, 10), Validators.required],
    invoiceRef: [''],
  });
  protected readonly reasonForm = inject(FormBuilder).nonNullable.group({ reason: ['', [Validators.required, Validators.minLength(3)]] });

  constructor() {
    this.load();
    this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r) });
  }

  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<Expense[]>('/api/expenses?limit=200').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }

  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }
  protected closeForm(): void { this.open.set(false); this.form.reset({ category: 'repairs', date: new Date().toISOString().slice(0, 10) }); }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.busy.set(true);
    this.http.post('/api/expenses', { residenceId: v.residenceId, category: v.category, label: v.label.trim(), amount: v.amount, date: v.date, ...(v.invoiceRef.trim() ? { invoiceRef: v.invoiceRef.trim() } : {}) }).subscribe({
      next: () => { this.busy.set(false); this.closeForm(); this.toast.show(this.i18n.t('common.saved')); this.load(); },
      error: this.fail,
    });
  }

  protected run(s: Step): void {
    this.step.set(null);
    this.http.post(`/api/expenses/${s.e.id}/${s.kind}`, {}).subscribe({ next: () => { this.toast.show(this.i18n.t('common.saved')); this.load(); }, error: this.fail });
  }

  protected openCancel(e: Expense): void { this.reasonForm.reset(); this.cancelling.set(e); }

  protected submitCancel(e: Expense): void {
    this.reasonForm.markAllAsTouched();
    if (this.reasonForm.invalid) return;
    this.busy.set(true);
    this.http.post(`/api/expenses/${e.id}/cancel`, { reason: this.reasonForm.getRawValue().reason.trim() }).subscribe({
      next: () => { this.busy.set(false); this.cancelling.set(null); this.toast.show(this.i18n.t('common.saved'), 'info'); this.load(); },
      error: this.fail,
    });
  }
}
