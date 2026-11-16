import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { I18nService, TPipe } from '../core/i18n.service';
import { ToastService } from '../core/toast.service';

const matches = (g: AbstractControl): ValidationErrors | null =>
  g.get('newPassword')?.value !== g.get('confirm')?.value ? { mismatch: true } : null;

/** Extracts the token from the URL fragment and removes it from the address bar right away. */
export function takeTokenFromFragment(): string {
  const token = new URLSearchParams(location.hash.replace(/^#/, '')).get('token') ?? '';
  if (location.hash) history.replaceState(null, '', location.pathname); // keep it out of history / screenshots / shoulder-surfing
  return token;
}

@Component({
  selector: 'app-reset-password',
  imports: [ReactiveFormsModule, RouterLink, TPipe],
  template: `
    <main class="login-main" id="view" style="min-height:100vh">
      <div class="login-box">
        <div class="login-top"><span></span>
          <div class="lang-switch" role="group" [attr.aria-label]="'shell.language' | t">
            <button type="button" lang="fr" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="i18n.set('fr')">FR</button>
            <button type="button" lang="ar" [attr.aria-pressed]="i18n.lang() === 'ar'" (click)="i18n.set('ar')">ع</button>
          </div>
        </div>
        <div><h1 style="font-size:var(--fs-xl)">{{ 'reset.newTitle' | t }}</h1></div>

        @if (!token || invalid()) {
          <div class="form-alert" role="alert">{{ 'reset.invalidLink' | t }}</div>
          <a class="btn btn-secondary btn-block" routerLink="/forgot-password">{{ 'reset.requestNew' | t }}</a>
        } @else {
          <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <p class="note plain">{{ 'settings.passwordNote' | t }}</p>
            <div class="field"><label for="rp-new">{{ 'settings.newPassword' | t }} *</label>
              <input class="input" id="rp-new" type="password" dir="ltr" autocomplete="new-password" formControlName="newPassword" [attr.aria-invalid]="form.controls.newPassword.invalid && form.controls.newPassword.touched ? 'true' : null" />
              @if (form.controls.newPassword.invalid && form.controls.newPassword.touched) { <span class="field-error">{{ 'settings.passwordMin' | t }}</span> }</div>
            <div class="field"><label for="rp-conf">{{ 'settings.confirmPassword' | t }} *</label>
              <input class="input" id="rp-conf" type="password" dir="ltr" autocomplete="new-password" formControlName="confirm" />
              @if (form.hasError('mismatch') && form.controls.confirm.touched) { <span class="field-error">{{ 'settings.passwordMismatch' | t }}</span> }</div>
            <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="busy()">{{ 'settings.changePassword' | t }}</button>
          </form>
        }
      </div>
    </main>
  `,
})
export class ResetPasswordPage {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly token = takeTokenFromFragment();
  protected readonly busy = signal(false);
  protected readonly invalid = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group(
    { newPassword: ['', [Validators.required, Validators.minLength(12)]], confirm: ['', Validators.required] },
    { validators: [matches] },
  );

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.http.post('/api/auth/reset-password', { token: this.token, newPassword: this.form.getRawValue().newPassword }).subscribe({
      next: () => {
        this.toast.show(this.i18n.t('reset.done'), 'success', 8000);
        void this.router.navigateByUrl('/login');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        // 400 = used / expired / unknown link (or a too-weak password rejected by the API)
        if (e instanceof HttpErrorResponse && e.status === 400 && /link/i.test(String((e.error as { message?: unknown })?.message))) this.invalid.set(true);
        else this.toast.error(e, this.i18n.t('common.error'));
      },
    });
  }
}
