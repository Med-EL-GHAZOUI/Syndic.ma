import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TPipe } from '../core/i18n.service';
import { I18nService } from '../core/i18n.service';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'app-forgot-password',
  imports: [ReactiveFormsModule, RouterLink, TPipe],
  template: `
    <main class="login-main" id="view" style="min-height:100vh">
      <div class="login-box">
        <div class="login-top">
          <a class="back-link" routerLink="/login">{{ 'reset.back' | t }}</a>
          <div class="lang-switch" role="group" [attr.aria-label]="'shell.language' | t">
            <button type="button" lang="fr" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="i18n.set('fr')">FR</button>
            <button type="button" lang="ar" [attr.aria-pressed]="i18n.lang() === 'ar'" (click)="i18n.set('ar')">ع</button>
          </div>
        </div>
        <div><h1 style="font-size:var(--fs-xl)">{{ 'reset.title' | t }}</h1><p class="muted">{{ 'reset.intro' | t }}</p></div>

        @if (sent()) {
          <div class="note" role="status">{{ 'reset.sent' | t }}</div>
        } @else {
          <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="field">
              <label for="fp-email">{{ 'login.email' | t }}</label>
              <input class="input" id="fp-email" type="email" dir="ltr" autocomplete="username" formControlName="email" [attr.aria-invalid]="form.controls.email.invalid && form.controls.email.touched ? 'true' : null" />
              @if (form.controls.email.invalid && form.controls.email.touched) { <span class="field-error">{{ 'form.email' | t }}</span> }
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="busy()">{{ 'reset.send' | t }}</button>
          </form>
        }
      </div>
    </main>
  `,
})
export class ForgotPasswordPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  protected readonly i18n = inject(I18nService);
  protected readonly busy = signal(false);
  protected readonly sent = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    this.http.post('/api/auth/forgot-password', { email: this.form.getRawValue().email.trim() }).subscribe({
      // Same message whatever the account state: the API never reveals whether the address exists.
      next: () => { this.busy.set(false); this.sent.set(true); },
      error: (e: unknown) => { this.busy.set(false); this.toast.error(e, this.i18n.t('common.error')); },
    });
  }
}
