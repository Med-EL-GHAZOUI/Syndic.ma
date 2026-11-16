import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { OrgUser } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const ROLES = ['syndic_admin', 'manager', 'accountant', 'owner', 'tenant', 'provider'];

@Component({
  selector: 'app-users',
  imports: [ReactiveFormsModule, TPipe, TlPipe, IconComponent, ModalComponent, ConfirmDialog],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.users' | t }}</h1><p class="page-sub">{{ 'users.subtitle' | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="open.set(true)"><app-icon name="plus" /><span>{{ 'users.add' | t }}</span></button></div> }
      </header>
      <div class="card">
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'common.name' | t }}</th><th scope="col">{{ 'users.role' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (u of rows(); track u.id) {
                <tr><td><div class="cell-main">{{ u.name }}</div><div class="cell-sub" dir="ltr" style="text-align:start">{{ u.email }}</div></td>
                  <td>{{ u.role | tl: 'role' }}</td>
                  <td><span class="badge" [class]="u.active ? 'badge-success' : 'badge-neutral'">{{ (u.active ? 'active' : 'inactive') | tl: 'providerState' }}</span></td>
                  <td class="actions">@if (canEdit() && u.id !== me()?.id) { <button type="button" class="icon-btn" [class.danger]="u.active" (click)="toToggle.set(u)" [attr.aria-label]="(u.active ? 'users.deactivate' : 'users.activate') | t" [title]="(u.active ? 'users.deactivate' : 'users.activate') | t"><app-icon [name]="u.active ? 'ban' : 'check'" /></button> }</td></tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (open()) {
      <app-modal [title]="'users.add' | t" (closed)="closeForm()">
        <p class="note plain" style="margin-bottom:16px">{{ 'users.passwordNote' | t: { password: '••••••••••••' } }}</p>
        <form id="usr-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="n-name">{{ 'common.name' | t }} *</label><input class="input" id="n-name" formControlName="name" [attr.aria-invalid]="bad('name')" />@if (bad('name')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="n-email">{{ 'common.email' | t }} *</label><input class="input" id="n-email" type="email" dir="ltr" autocomplete="off" formControlName="email" [attr.aria-invalid]="bad('email')" />@if (bad('email')) { <span class="field-error">{{ 'form.email' | t }}</span> }</div>
          <div class="field"><label for="n-role">{{ 'users.role' | t }}</label><select class="select" id="n-role" formControlName="role">@for (r of roles; track r) { <option [value]="r">{{ r | tl: 'role' }}</option> }</select></div>
          <div class="field full"><label for="n-pass">{{ 'login.password' | t }} *</label><input class="input" id="n-pass" type="password" dir="ltr" autocomplete="new-password" formControlName="password" [attr.aria-invalid]="bad('password')" />@if (bad('password')) { <span class="field-error">{{ 'form.min' | t: { min: 12 } }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="usr-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (toToggle(); as u) {
      <app-confirm [title]="(u.active ? 'users.deactivate' : 'users.activate') | t" [message]="(u.active ? 'users.deactivateText' : 'users.activateText') | t: { name: u.name }" [danger]="u.active" (confirmed)="toggle(u)" (cancelled)="toToggle.set(null)" />
    }
  `,
})
export class UsersPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly roles = ROLES;
  protected readonly me = this.auth.user;
  protected readonly canCreate = computed(() => can(this.auth.user()?.role, 'users', 'c'));
  protected readonly canEdit = computed(() => can(this.auth.user()?.role, 'users', 'e'));
  protected readonly rows = signal<OrgUser[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly toToggle = signal<OrgUser | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['manager'],
    password: ['', [Validators.required, Validators.minLength(12)]],
  });

  constructor() { this.load(); }

  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<OrgUser[]>('/api/users').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }
  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }
  protected closeForm(): void { this.open.set(false); this.form.reset({ role: 'manager' }); }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.http.post('/api/users', { name: v.name.trim(), email: v.email.trim(), role: v.role, password: v.password }).subscribe({
      next: () => { this.busy.set(false); this.closeForm(); this.toast.show(this.i18n.t('common.saved')); this.load(); },
      error: this.fail,
    });
  }

  protected toggle(u: OrgUser): void {
    this.toToggle.set(null);
    this.http.patch(`/api/users/${u.id}`, { active: !u.active }).subscribe({ next: () => { this.toast.show(this.i18n.t('common.saved')); this.load(); }, error: this.fail });
  }
}
