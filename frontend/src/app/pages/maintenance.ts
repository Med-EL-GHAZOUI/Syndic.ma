import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2, MoneyPipe } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { ProviderFull, Residence, WorkOrder } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const STATUSES = ['planned', 'in_progress', 'done', 'cancelled'] as const;
const TONE: Record<string, string> = { planned: 'info', in_progress: 'warning', done: 'success', cancelled: 'neutral' };
type Step = { kind: 'start' | 'cancel'; w: WorkOrder };

@Component({
  selector: 'app-maintenance',
  imports: [ReactiveFormsModule, TPipe, TlPipe, MoneyPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ (provider() ? 'nav.maintenance.mine' : 'nav.maintenance') | t }}</h1><p class="page-sub">{{ (provider() ? 'maintenance.subtitleMine' : 'maintenance.subtitle') | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="open.set(true)"><app-icon name="plus" /><span>{{ 'maintenance.add' | t }}</span></button></div> }
      </header>
      <div class="card">
        <div class="lv-toolbar">
          <label class="sr-only" for="w-status">{{ 'common.status' | t }}</label>
          <select class="select" id="w-status" (change)="filter.set($any($event.target).value)"><option value="">{{ 'common.status' | t }}</option>@for (s of statuses; track s) { <option [value]="s">{{ s | tl: 'maintStatus' }}</option> }</select>
          <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: shown().length } }}</span>
        </div>
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!shown().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'maintenance.emptyTitle' | t }}</h3><p>{{ 'maintenance.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'common.title' | t }}</th>@if (!provider()) { <th scope="col" class="hide-md">{{ 'expenses.provider' | t }}</th> }<th scope="col">{{ 'maintenance.scheduled' | t }}</th><th scope="col" class="num hide-sm">{{ 'maintenance.estimate' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (w of shown(); track w.id) {
                <tr>
                  <td><div class="cell-main">{{ w.title }}</div><div class="cell-sub">{{ w.type | tl: 'maintType' }}</div></td>
                  @if (!provider()) { <td class="hide-md">{{ providerName(w.providerId) }}</td> }
                  <td>{{ w.scheduledDate | fdate }}</td>
                  <td class="num hide-sm">{{ w.estimatedCost === null ? '—' : (w.estimatedCost | money) }}</td>
                  <td><span class="badge" [class]="'badge-' + tone(w.status)">{{ w.status | tl: 'maintStatus' }}</span></td>
                  <td class="actions">
                    @if (canEdit()) {
                      @if (w.status === 'planned') { <button type="button" class="icon-btn" (click)="step.set({ kind: 'start', w })" [attr.aria-label]="'maintenance.start' | t" [title]="'maintenance.start' | t"><app-icon name="send" /></button> }
                      @if (w.status === 'in_progress') { <button type="button" class="icon-btn" (click)="openComplete(w)" [attr.aria-label]="'maintenance.complete' | t" [title]="'maintenance.complete' | t"><app-icon name="check" /></button> }
                      @if (!provider() && (w.status === 'planned' || w.status === 'in_progress')) { <button type="button" class="icon-btn danger" (click)="step.set({ kind: 'cancel', w })" [attr.aria-label]="'maintenance.cancel' | t" [title]="'maintenance.cancel' | t"><app-icon name="ban" /></button> }
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
      <app-modal [title]="'maintenance.add' | t" (closed)="closeForm()">
        <form id="wo-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="o-res">{{ 'common.residence' | t }} *</label><select class="select" id="o-res" formControlName="residenceId" [attr.aria-invalid]="bad('residenceId')"><option value="">{{ 'common.select' | t }}</option>@for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>@if (bad('residenceId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field full"><label for="o-title">{{ 'common.title' | t }} *</label><input class="input" id="o-title" formControlName="title" [attr.aria-invalid]="bad('title')" />@if (bad('title')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="o-type">{{ 'common.type' | t }}</label><select class="select" id="o-type" formControlName="type"><option value="corrective">{{ 'corrective' | tl: 'maintType' }}</option><option value="preventive">{{ 'preventive' | tl: 'maintType' }}</option></select></div>
          <div class="field"><label for="o-prov">{{ 'expenses.provider' | t }} *</label><select class="select" id="o-prov" formControlName="providerId" [attr.aria-invalid]="bad('providerId')"><option value="">{{ 'maintenance.pickProvider' | t }}</option>@for (p of activeProviders(); track p.id) { <option [value]="p.id">{{ p.name }}</option> }</select>@if (bad('providerId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="o-date">{{ 'maintenance.scheduled' | t }} *</label><input class="input" id="o-date" type="date" dir="ltr" formControlName="scheduledDate" [attr.aria-invalid]="bad('scheduledDate')" />@if (bad('scheduledDate')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="o-est">{{ 'maintenance.estimate' | t }}</label><input class="input" id="o-est" type="number" step="0.01" dir="ltr" formControlName="estimatedCost" /></div>
          <div class="field full"><label for="o-desc">{{ 'common.description' | t }}</label><textarea class="textarea" id="o-desc" rows="3" formControlName="description"></textarea></div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="wo-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (completing(); as w) {
      <app-modal [title]="'maintenance.complete' | t" size="sm" (closed)="completing.set(null)">
        <form id="cp-form" class="stack" [formGroup]="completeForm" (ngSubmit)="submitComplete(w)" novalidate>
          <div class="field"><label for="c-cost">{{ 'maintenance.actualCost' | t }} *</label><input class="input" id="c-cost" type="number" step="0.01" dir="ltr" formControlName="actualCost" [attr.aria-invalid]="completeForm.controls.actualCost.invalid && completeForm.controls.actualCost.touched ? 'true' : null" />@if (completeForm.controls.actualCost.invalid && completeForm.controls.actualCost.touched) { <span class="field-error">{{ 'form.min' | t: { min: 0 } }}</span> }</div>
          <div class="field"><label for="c-note">{{ 'maintenance.report' | t }}</label><textarea class="textarea" id="c-note" rows="3" formControlName="note"></textarea></div>
          @if (canExpense()) { <label class="check"><input type="checkbox" formControlName="createExpense" /> {{ 'maintenance.createExpense' | t }}</label> }
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="completing.set(null)">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="cp-form" class="btn btn-primary" [disabled]="busy()">{{ 'maintenance.complete' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (step(); as s) {
      <app-confirm [title]="(s.kind === 'start' ? 'maintenance.start' : 'maintenance.cancel') | t" [message]="(s.kind === 'start' ? 'maintenance.startText' : 'maintenance.cancelText') | t: { title: s.w.title }" [danger]="s.kind === 'cancel'" (confirmed)="run(s)" (cancelled)="step.set(null)" />
    }
  `,
})
export class MaintenancePage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly statuses = STATUSES;
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly provider = computed(() => this.role() === 'provider');
  protected readonly canCreate = computed(() => can(this.role(), 'maintenance', 'c'));
  protected readonly canEdit = computed(() => can(this.role(), 'maintenance', 'e'));
  protected readonly canExpense = computed(() => can(this.role(), 'expenses', 'c'));
  protected readonly rows = signal<WorkOrder[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly providers = signal<ProviderFull[]>([]);
  protected readonly activeProviders = computed(() => this.providers().filter((p) => p.active));
  protected readonly filter = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly step = signal<Step | null>(null);
  protected readonly completing = signal<WorkOrder | null>(null);
  protected readonly shown = computed(() => this.rows().filter((w) => !this.filter() || w.status === this.filter()));

  protected readonly form = inject(FormBuilder).nonNullable.group({
    residenceId: ['', Validators.required], title: ['', [Validators.required, Validators.minLength(3)]], type: ['corrective' as 'corrective' | 'preventive'],
    providerId: ['', Validators.required], scheduledDate: [new Date().toISOString().slice(0, 10), Validators.required], estimatedCost: [null as number | null], description: [''],
  });
  protected readonly completeForm = inject(FormBuilder).nonNullable.group({ actualCost: [null as number | null, [Validators.required, Validators.min(0)]], note: [''], createExpense: [false] });

  constructor() {
    this.load();
    if (!this.provider()) {
      this.http.get<ProviderFull[]>('/api/providers?limit=200').subscribe({ next: (p) => this.providers.set(p) });
      if (this.canCreate()) this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r) });
    }
  }

  protected tone = (s: string) => TONE[s] ?? 'neutral';
  protected providerName(id: string): string { return this.providers().find((p) => p.id === id)?.name ?? '—'; }
  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<WorkOrder[]>('/api/maintenance?limit=200').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }
  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }
  protected closeForm(): void { this.open.set(false); this.form.reset({ type: 'corrective', scheduledDate: new Date().toISOString().slice(0, 10) }); }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.http.post('/api/maintenance', { residenceId: v.residenceId, title: v.title.trim(), type: v.type, providerId: v.providerId, scheduledDate: v.scheduledDate, ...(v.estimatedCost !== null ? { estimatedCost: v.estimatedCost } : {}), ...(v.description.trim() ? { description: v.description.trim() } : {}) }).subscribe({
      next: () => { this.busy.set(false); this.closeForm(); this.toast.show(this.i18n.t('common.saved')); this.load(); },
      error: this.fail,
    });
  }

  protected run(s: Step): void {
    this.step.set(null);
    this.http.post(`/api/maintenance/${s.w.id}/${s.kind}`, {}).subscribe({
      next: () => { this.toast.show(this.i18n.t(s.kind === 'start' ? 'maintenance.started' : 'maintenance.cancelled')); this.load(); },
      error: this.fail,
    });
  }

  protected openComplete(w: WorkOrder): void { this.completeForm.reset({ actualCost: w.estimatedCost, createExpense: false }); this.completing.set(w); }

  protected submitComplete(w: WorkOrder): void {
    this.completeForm.markAllAsTouched();
    if (this.completeForm.invalid) return;
    this.busy.set(true);
    const v = this.completeForm.getRawValue();
    this.http.post(`/api/maintenance/${w.id}/complete`, { actualCost: v.actualCost, ...(v.note.trim() ? { note: v.note.trim() } : {}), ...(this.canExpense() ? { createExpense: v.createExpense } : {}) }).subscribe({
      next: () => { this.busy.set(false); this.completing.set(null); this.toast.show(this.i18n.t('maintenance.completed')); this.load(); },
      error: this.fail,
    });
  }
}
