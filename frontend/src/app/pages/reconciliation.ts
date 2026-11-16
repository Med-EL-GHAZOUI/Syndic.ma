import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2, MoneyPipe } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { BankLine, BankSuggestion, Closure, ReconciliationSummary, Residence } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';
import { StatusBadge } from '../shared/status-badge';

const MAX_CSV = 500_000;
type Act = { kind: 'match'; line: BankLine; s: BankSuggestion } | { kind: 'auto' };
type ReasonAct = { kind: 'unmatch' | 'ignore'; line: BankLine };

@Component({
  selector: 'app-reconciliation',
  imports: [ReactiveFormsModule, TPipe, TlPipe, MoneyPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog, StatusBadge],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'recon.title' | t }}</h1><p class="page-sub">{{ 'recon.subtitle' | t }}</p></div>
        @if (residenceId()) {
          <div class="page-actions">
            @if (canImport()) {
              <label class="btn btn-secondary" for="csv-file" style="cursor:pointer"><app-icon name="receipt" /><span>{{ 'recon.import' | t }}</span></label>
              <input id="csv-file" type="file" accept=".csv,text/csv" class="sr-only" (change)="onFile($event)" />
            }
            @if (canMatch()) { <button type="button" class="btn btn-secondary" (click)="act.set({ kind: 'auto' })"><app-icon name="check" /><span>{{ 'recon.auto' | t }}</span></button> }
            @if (canClose()) { <button type="button" class="btn btn-primary" (click)="openClose.set(true)"><app-icon name="lock" /><span>{{ 'recon.close' | t }}</span></button> }
          </div>
        }
      </header>

      <div class="card"><div class="lv-toolbar">
        <label class="sr-only" for="r-res">{{ 'common.residence' | t }}</label>
        <select class="select" id="r-res" (change)="pick($any($event.target).value)">
          <option value="">{{ 'common.residence' | t }}</option>
          @for (r of residences(); track r.id) { <option [value]="r.id" [selected]="r.id === residenceId()">{{ r.name }}</option> }
        </select>
        @if (residenceId()) { <span class="muted small">{{ closedLabel() }}</span> }
      </div></div>

      @if (!residenceId()) {
        <div class="card"><div class="empty"><app-icon name="receipt" /><h3>{{ 'recon.pickResidence' | t }}</h3><p>{{ 'recon.pickResidenceText' | t }}</p></div></div>
      } @else {
        @if (importErrors().length) {
          <div class="form-alert" role="alert">
            <strong>{{ 'recon.importErrors' | t }}</strong>
            <ul style="margin:8px 0 0;padding-inline-start:18px">@for (e of importErrors(); track e) { <li>{{ e }}</li> }</ul>
          </div>
        }
        <p class="note plain">{{ 'recon.importHelp' | t }}</p>

        @if (summary(); as s) {
          <div class="grid grid-kpi">
            <div class="card kpi"><div><div class="kpi-label">{{ 'recon.unmatched' | t }}</div><div class="kpi-value">{{ s.unmatchedLines }}</div><div class="kpi-hint">{{ s.unmatchedAmount | money }}</div></div></div>
            <div class="card kpi"><div><div class="kpi-label">{{ 'recon.unverified' | t }}</div><div class="kpi-value">{{ s.unverifiedPayments }}</div><div class="kpi-hint">{{ s.unverifiedAmount | money }}</div></div></div>
            <div class="card kpi"><div><div class="kpi-label">{{ 'recon.verified' | t }}</div><div class="kpi-value">{{ s.verifiedPayments }}</div></div></div>
          </div>
        }

        <div class="card">
          <div class="lv-toolbar">
            <label class="sr-only" for="r-status">{{ 'common.status' | t }}</label>
            <select class="select" id="r-status" (change)="setStatus($any($event.target).value)">
              <option value="">{{ 'common.status' | t }}</option>
              @for (s of statuses; track s) { <option [value]="s" [selected]="s === status()">{{ s | tl: 'bankLineStatus' }}</option> }
            </select>
            <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: lines().length } }}</span>
          </div>
          @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
          @else if (!lines().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'common.emptyTitle' | t }}</h3></div> }
          @else {
            <div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">{{ 'common.date' | t }}</th><th scope="col">{{ 'recon.line' | t }}</th><th scope="col" class="num">{{ 'common.amount' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="hide-sm">{{ 'recon.suggestion' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
              <tbody>
                @for (l of lines(); track l.id) {
                  <tr>
                    <td class="nowrap">{{ l.bookingDate | fdate }}</td>
                    <td><div class="cell-main">{{ l.label }}</div>@if (l.reference) { <div class="cell-sub">{{ l.reference }}</div> }@if (l.note) { <div class="cell-sub">{{ l.note }}</div> }</td>
                    <td class="num" [style.color]="l.amount < 0 ? 'var(--danger)' : ''"><strong>{{ l.amount | money }}</strong></td>
                    <td><app-badge [group]="'bankLineStatus'" [value]="l.status" /></td>
                    <td class="hide-sm">
                      @if (l.status === 'unmatched' && l.amount > 0) {
                        @if (l.suggestions.length) { {{ l.suggestions[0].receiptNo }} · {{ l.suggestions[0].payerName }} }
                        @else { <span class="muted">{{ 'recon.noSuggestion' | t }}</span> }
                      }
                    </td>
                    <td class="actions">
                      @if (canMatch()) {
                        @if (l.status === 'unmatched') {
                          @if (l.suggestions.length) { <button type="button" class="icon-btn" (click)="act.set({ kind: 'match', line: l, s: l.suggestions[0] })" [attr.aria-label]="'recon.match' | t" [title]="'recon.match' | t"><app-icon name="check" /></button> }
                          <button type="button" class="icon-btn" (click)="openReason({ kind: 'ignore', line: l })" [attr.aria-label]="'recon.ignore' | t" [title]="'recon.ignore' | t"><app-icon name="ban" /></button>
                        }
                        @if (l.status === 'matched') { <button type="button" class="icon-btn danger" (click)="openReason({ kind: 'unmatch', line: l })" [attr.aria-label]="'recon.unmatch' | t" [title]="'recon.unmatch' | t"><app-icon name="undo" /></button> }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table></div>
          }
        </div>
      }
    </div>

    @if (reason(); as r) {
      <app-modal [title]="(r.kind === 'ignore' ? 'recon.ignore' : 'recon.unmatch') | t" size="sm" (closed)="reason.set(null)">
        <form id="rs-form" class="stack" [formGroup]="reasonForm" (ngSubmit)="submitReason(r)" novalidate>
          <p class="note plain">{{ (r.kind === 'ignore' ? 'recon.ignoreText' : 'recon.unmatchText') | t }}</p>
          <div class="field"><label for="rs-why">{{ 'payments.reason' | t }} *</label><textarea class="textarea" id="rs-why" rows="3" formControlName="reason" [attr.aria-invalid]="reasonForm.controls.reason.invalid && reasonForm.controls.reason.touched ? 'true' : null"></textarea>
            @if (reasonForm.controls.reason.invalid && reasonForm.controls.reason.touched) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="reason.set(null)">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="rs-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.confirm' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (openClose()) {
      <app-modal [title]="'recon.close' | t" size="sm" (closed)="openClose.set(false)">
        <form id="cl-form" class="stack" [formGroup]="closeForm" (ngSubmit)="submitClose()" novalidate>
          <p class="note warn">{{ 'recon.closeText' | t }}</p>
          <div class="field"><label for="cl-date">{{ 'recon.closeDate' | t }} *</label>
            <input class="input" id="cl-date" type="date" dir="ltr" [max]="todayStr" formControlName="closedThrough" [attr.aria-invalid]="closeForm.controls.closedThrough.invalid && closeForm.controls.closedThrough.touched ? 'true' : null" />
            @if (closeForm.controls.closedThrough.invalid && closeForm.controls.closedThrough.touched) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="openClose.set(false)">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="cl-form" class="btn btn-danger" [disabled]="busy()">{{ 'recon.close' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (act(); as a) {
      @if (a.kind === 'match') {
        <app-confirm [title]="'recon.match' | t" [message]="'recon.matchText' | t: { receipt: a.s.receiptNo ?? '—', payer: a.s.payerName }" (confirmed)="doMatch(a)" (cancelled)="act.set(null)" />
      } @else {
        <app-confirm [title]="'recon.auto' | t" [message]="'recon.autoText' | t" (confirmed)="doAuto()" (cancelled)="act.set(null)" />
      }
    }
  `,
})
export class ReconciliationPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly statuses = ['unmatched', 'matched', 'ignored'] as const;
  protected readonly todayStr = new Date().toISOString().slice(0, 10);
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly canImport = computed(() => can(this.role(), 'reconciliation', 'c'));
  protected readonly canMatch = computed(() => can(this.role(), 'reconciliation', 'x'));
  protected readonly canClose = computed(() => can(this.role(), 'finance', 'e'));

  protected readonly residences = signal<Residence[]>([]);
  protected readonly residenceId = signal('');
  protected readonly status = signal('unmatched');
  protected readonly lines = signal<BankLine[]>([]);
  protected readonly summary = signal<ReconciliationSummary | null>(null);
  protected readonly closure = signal<Closure | null>(null);
  protected readonly importErrors = signal<string[]>([]);
  protected readonly loading = signal(false);
  protected readonly busy = signal(false);
  protected readonly act = signal<Act | null>(null);
  protected readonly reason = signal<ReasonAct | null>(null);
  protected readonly openClose = signal(false);

  protected readonly reasonForm = inject(FormBuilder).nonNullable.group({ reason: ['', [Validators.required, Validators.minLength(3)]] });
  protected readonly closeForm = inject(FormBuilder).nonNullable.group({ closedThrough: ['', Validators.required] });
  protected readonly closedLabel = computed(() => (this.closure() ? this.i18n.t('recon.closedThrough', { date: this.closure()!.closedThrough }) : this.i18n.t('recon.neverClosed')));

  constructor() {
    this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r), error: this.fail });
  }

  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };

  protected pick(id: string): void {
    this.residenceId.set(id);
    this.importErrors.set([]);
    if (id) this.reload();
  }

  protected setStatus(s: string): void {
    this.status.set(s);
    this.reload();
  }

  private reload(): void {
    const r = this.residenceId();
    this.loading.set(true);
    const q = `residenceId=${r}${this.status() ? `&status=${this.status()}` : ''}&limit=200`;
    this.http.get<BankLine[]>(`/api/reconciliation/lines?${q}`).subscribe({ next: (l) => { this.lines.set(l); this.loading.set(false); }, error: this.fail });
    this.http.get<ReconciliationSummary>(`/api/reconciliation/summary?residenceId=${r}`).subscribe({ next: (s) => this.summary.set(s), error: this.fail });
    this.http.get<Closure[]>('/api/finance/closures').subscribe({ next: (c) => this.closure.set(c.find((x) => x.residenceId === r) ?? null) });
  }

  protected async onFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-selecting the same file
    if (!file) return;
    if (file.size > MAX_CSV) { this.toast.show(this.i18n.t('recon.tooBig'), 'error'); return; }
    const csv = await file.text();
    this.importErrors.set([]);
    this.http.post<{ imported: number; duplicates: number }>('/api/reconciliation/import', { residenceId: this.residenceId(), csv }).subscribe({
      next: (r) => { this.toast.show(this.i18n.t('recon.imported', { imported: r.imported, duplicates: r.duplicates })); this.reload(); },
      error: (e: unknown) => {
        const errs = e instanceof HttpErrorResponse ? ((e.error as { errors?: { line: number; error: string }[] } | null)?.errors ?? []) : [];
        if (errs.length) this.importErrors.set(errs.slice(0, 8).map((x) => `#${x.line}: ${x.error}`));
        else this.toast.error(e, this.i18n.t('common.error'));
      },
    });
  }

  protected doMatch(a: Extract<Act, { kind: 'match' }>): void {
    this.act.set(null);
    this.http.post(`/api/reconciliation/lines/${a.line.id}/match`, { paymentId: a.s.paymentId }).subscribe({
      next: () => { this.toast.show(this.i18n.t('recon.matched')); this.reload(); },
      error: this.fail,
    });
  }

  protected doAuto(): void {
    this.act.set(null);
    this.http.post<{ matched: number; skipped: number }>('/api/reconciliation/auto', { residenceId: this.residenceId() }).subscribe({
      next: (r) => { this.toast.show(this.i18n.t('recon.autoResult', { matched: r.matched, skipped: r.skipped }), 'info', 7000); this.reload(); },
      error: this.fail,
    });
  }

  protected openReason(a: ReasonAct): void { this.reasonForm.reset(); this.reason.set(a); }

  protected submitReason(a: ReasonAct): void {
    this.reasonForm.markAllAsTouched();
    if (this.reasonForm.invalid) return;
    this.busy.set(true);
    this.http.post(`/api/reconciliation/lines/${a.line.id}/${a.kind}`, { reason: this.reasonForm.getRawValue().reason.trim() }).subscribe({
      next: () => { this.busy.set(false); this.reason.set(null); this.toast.show(this.i18n.t(a.kind === 'unmatch' ? 'recon.unmatched.done' : 'common.saved'), 'info'); this.reload(); },
      error: this.fail,
    });
  }

  protected submitClose(): void {
    this.closeForm.markAllAsTouched();
    if (this.closeForm.invalid) return;
    this.busy.set(true);
    this.http.post('/api/finance/closures', { residenceId: this.residenceId(), closedThrough: this.closeForm.getRawValue().closedThrough }).subscribe({
      next: () => { this.busy.set(false); this.openClose.set(false); this.closeForm.reset(); this.toast.show(this.i18n.t('recon.closed')); this.reload(); },
      error: this.fail,
    });
  }
}
