import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { ToastService } from '../core/toast.service';
import { MfaCard } from './mfa-card';

const differs = (g: AbstractControl): ValidationErrors | null =>
  g.get('currentPassword')?.value && g.get('currentPassword')?.value === g.get('newPassword')?.value ? { same: true } : null;
const matches = (g: AbstractControl): ValidationErrors | null =>
  g.get('newPassword')?.value !== g.get('confirm')?.value ? { mismatch: true } : null;

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, TPipe, TlPipe, MfaCard],
  template: `
    <div class="page">
      <header class="page-header"><div><h1>{{ 'nav.settings' | t }}</h1><p class="page-sub">{{ 'settings.subtitle' | t }}</p></div></header>
      <div class="grid grid-2">
        <section class="card">
          <div class="card-head"><h2>{{ 'settings.profile' | t }}</h2></div>
          <div class="card-body">
            <dl class="dl">
              <div><dt>{{ 'common.name' | t }}</dt><dd>{{ auth.user()?.name }}</dd></div>
              <div><dt>{{ 'common.email' | t }}</dt><dd dir="ltr" style="text-align:start">{{ auth.user()?.email }}</dd></div>
              <div><dt>{{ 'users.role' | t }}</dt><dd>{{ auth.user()?.role | tl: 'role' }}</dd></div>
            </dl>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>{{ 'settings.preferences' | t }}</h2></div>
          <div class="card-body stack">
            <div class="field"><label for="s-lang">{{ 'shell.language' | t }}</label>
              <select class="select" id="s-lang" (change)="i18n.set($any($event.target).value)">
                <option value="fr" [selected]="i18n.lang() === 'fr'">Français</option>
                <option value="ar" [selected]="i18n.lang() === 'ar'">العربية</option>
              </select></div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><h2>{{ 'settings.password' | t }}</h2></div>
          <form class="card-body stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <p class="note plain">{{ 'settings.passwordNote' | t }}</p>
            <div class="field"><label for="p-cur">{{ 'settings.currentPassword' | t }} *</label><input class="input" id="p-cur" type="password" dir="ltr" autocomplete="current-password" formControlName="currentPassword" [attr.aria-invalid]="bad('currentPassword')" />@if (bad('currentPassword')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
            <div class="field"><label for="p-new">{{ 'settings.newPassword' | t }} *</label><input class="input" id="p-new" type="password" dir="ltr" autocomplete="new-password" formControlName="newPassword" [attr.aria-invalid]="bad('newPassword')" />@if (bad('newPassword')) { <span class="field-error">{{ 'settings.passwordMin' | t }}</span> }</div>
            <div class="field"><label for="p-conf">{{ 'settings.confirmPassword' | t }} *</label><input class="input" id="p-conf" type="password" dir="ltr" autocomplete="new-password" formControlName="confirm" [attr.aria-invalid]="form.hasError('mismatch') && form.controls.confirm.touched ? 'true' : null" />
              @if (form.hasError('mismatch') && form.controls.confirm.touched) { <span class="field-error">{{ 'settings.passwordMismatch' | t }}</span> }
              @if (form.hasError('same')) { <span class="field-error">{{ 'settings.passwordSame' | t }}</span> }</div>
            <div><button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'settings.changePassword' | t }}</button></div>
          </form>
        </section>

        <app-mfa-card />
      </div>
    </div>
  `,
})
export class SettingsPage {
  protected readonly auth = inject(AuthService);
  protected readonly i18n = inject(I18nService);
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly busy = signal(false);

  protected readonly form = inject(FormBuilder).nonNullable.group(
    {
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(12)]],
      confirm: ['', Validators.required],
    },
    { validators: [differs, matches] },
  );

  protected bad(n: 'currentPassword' | 'newPassword'): boolean {
    const c = this.form.controls[n];
    return c.invalid && (c.touched || c.dirty);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const { currentPassword, newPassword } = this.form.getRawValue();
    this.http.post('/api/auth/change-password', { currentPassword, newPassword }).subscribe({
      next: () => {
        // The API revoked every session of this user (all devices): sign in again with the new password.
        this.busy.set(false);
        this.toast.show(this.i18n.t('settings.passwordChanged'), 'info', 8000);
        this.auth.expire();
      },
      error: (e: unknown) => { this.busy.set(false); this.toast.error(e, this.i18n.t('common.error')); },
    });
  }
}
