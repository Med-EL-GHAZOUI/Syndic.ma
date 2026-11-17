import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DatePipe2 } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { OrgStatus, Organization } from '../core/models';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const TONE: Record<string, string> = { trial: 'info', active: 'success', suspended: 'danger' };
const PLANS = ['starter', 'pro', 'business'];

@Component({
  selector: 'app-platform',
  imports: [ReactiveFormsModule, TPipe, TlPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.platform' | t }}</h1><p class="page-sub">{{ 'platform.subtitle' | t }}</p></div>
        <div class="page-actions"><button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" /><span>{{ 'platform.add' | t }}</span></button></div>
      </header>
      <div class="card">
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!rows().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'common.noResults' | t }}</h3></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'platform.company' | t }}</th><th scope="col" class="hide-md">{{ 'common.city' | t }}</th><th scope="col">{{ 'platform.plan' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="hide-md">{{ 'platform.since' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (o of rows(); track o.id) {
                <tr>
                  <td><div class="cell-main">{{ o.name }}</div><div class="cell-sub">{{ o.email ?? '' }}</div></td>
                  <td class="hide-md">{{ o.city ?? '—' }}</td>
                  <td>{{ o.plan | tl: 'plan' }}</td>
                  <td><span class="badge" [class]="'badge-' + tone(o.status)">{{ o.status | tl: 'orgStatus' }}</span></td>
                  <td class="hide-md">{{ o.createdAt | fdate }}</td>
                  <td class="actions">
                    <button type="button" class="icon-btn" (click)="openForm(o)" [attr.aria-label]="'common.edit' | t" [title]="'common.edit' | t"><app-icon name="eye" /></button>
                    @if (o.status === 'suspended') { <button type="button" class="icon-btn" (click)="toggle.set(o)" [attr.aria-label]="'platform.reactivate' | t" [title]="'platform.reactivate' | t"><app-icon name="check" /></button> }
                    @else { <button type="button" class="icon-btn danger" (click)="toggle.set(o)" [attr.aria-label]="'platform.suspend' | t" [title]="'platform.suspend' | t"><app-icon name="ban" /></button> }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (formOpen()) {
      <app-modal [title]="(editing() ? 'platform.edit' : 'platform.add') | t" (closed)="formOpen.set(false)">
        <form id="org-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="o-name">{{ 'platform.company' | t }} *</label><input class="input" id="o-name" formControlName="name" [attr.aria-invalid]="bad('name')" />@if (bad('name')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="o-city">{{ 'common.city' | t }}</label><input class="input" id="o-city" formControlName="city" /></div>
          <div class="field"><label for="o-email">{{ 'common.email' | t }}</label><input class="input" id="o-email" type="email" dir="ltr" formControlName="email" [attr.aria-invalid]="bad('email')" />@if (bad('email')) { <span class="field-error">{{ 'form.email' | t }}</span> }</div>
          <div class="field"><label for="o-plan">{{ 'platform.plan' | t }}</label><select class="select" id="o-plan" formControlName="plan">@for (p of plans; track p) { <option [value]="p">{{ p | tl: 'plan' }}</option> }</select></div>
          <div class="field"><label for="o-status">{{ 'common.status' | t }}</label><select class="select" id="o-status" formControlName="status">@for (s of statuses; track s) { <option [value]="s">{{ s | tl: 'orgStatus' }}</option> }</select></div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="org-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (toggle(); as o) {
      <app-confirm [title]="(o.status === 'suspended' ? 'platform.reactivate' : 'platform.suspend') | t"
        [message]="(o.status === 'suspended' ? 'platform.reactivateText' : 'platform.suspendText') | t: { name: o.name }"
        [danger]="o.status !== 'suspended'" (confirmed)="applyToggle(o)" (cancelled)="toggle.set(null)" />
    }
  `,
})
export class PlatformPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly plans = PLANS;
  protected readonly statuses: OrgStatus[] = ['trial', 'active', 'suspended'];
  protected readonly rows = signal<Organization[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Organization | null>(null);
  protected readonly toggle = signal<Organization | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]], city: [''], email: ['', Validators.email], plan: ['starter'], status: ['trial' as OrgStatus],
  });

  constructor() { this.load(); }

  protected tone = (s: string) => TONE[s] ?? 'neutral';
  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }
  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<Organization[]>('/api/platform/organizations').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }

  protected openForm(o?: Organization): void {
    this.editing.set(o ?? null);
    this.form.reset({ name: o?.name ?? '', city: o?.city ?? '', email: o?.email ?? '', plan: o?.plan ?? 'starter', status: o?.status ?? 'trial' });
    this.formOpen.set(true);
  }

  private body(o: { name: string; city?: string; email?: string; plan: string; status: OrgStatus }) {
    return { name: o.name.trim(), plan: o.plan, status: o.status, ...(o.city?.trim() ? { city: o.city.trim() } : {}), ...(o.email?.trim() ? { email: o.email.trim() } : {}) };
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const editing = this.editing();
    const body = this.body(this.form.getRawValue());
    (editing ? this.http.put(`/api/platform/organizations/${editing.id}`, body) : this.http.post('/api/platform/organizations', body)).subscribe({
      next: () => { this.busy.set(false); this.formOpen.set(false); this.toast.show(this.i18n.t('common.saved')); this.load(); },
      error: this.fail,
    });
  }

  protected applyToggle(o: Organization): void {
    this.toggle.set(null);
    const status: OrgStatus = o.status === 'suspended' ? 'active' : 'suspended';
    this.http.put(`/api/platform/organizations/${o.id}`, this.body({ ...o, status })).subscribe({
      next: () => { this.toast.show(this.i18n.t('common.saved')); this.load(); },
      error: this.fail,
    });
  }
}
