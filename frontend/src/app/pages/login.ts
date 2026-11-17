import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { I18nService, TPipe } from '../core/i18n.service';
import { IconComponent } from '../shared/icon';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, TPipe, IconComponent],
  template: `
    <div class="login">
      <aside class="login-aside">
        <a class="brand" href="/" style="padding:0;height:auto"><span class="brand-mark"><app-icon name="mark" /></span><span>Syndic<small>.ma</small></span></a>
        <div class="stack"><h1>{{ 'login.asideTitle' | t }}</h1><p>{{ 'login.asideText' | t }}</p></div>
        <ul class="login-points">
          <li><app-icon name="check" /><span>{{ 'login.point1' | t }}</span></li>
          <li><app-icon name="check" /><span>{{ 'login.point2' | t }}</span></li>
          <li><app-icon name="check" /><span>{{ 'login.point3' | t }}</span></li>
        </ul>
      </aside>
      <main class="login-main" id="view">
        <div class="login-box">
          <div class="login-top">
            <span></span>
            <div class="lang-switch" role="group" [attr.aria-label]="'shell.language' | t">
              <button type="button" lang="fr" [attr.aria-pressed]="i18n.lang() === 'fr'" (click)="i18n.set('fr')">FR</button>
              <button type="button" lang="ar" [attr.aria-pressed]="i18n.lang() === 'ar'" (click)="i18n.set('ar')">ع</button>
            </div>
          </div>
          @if (challenge()) {
            <div><h1 style="font-size:var(--fs-xl)">{{ 'mfa.loginTitle' | t }}</h1><p class="muted">{{ 'mfa.loginText' | t }}</p></div>
            <form class="stack" [formGroup]="codeForm" (ngSubmit)="verify()" novalidate>
              @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }
              <div class="field">
                <label for="mfa-code">{{ 'mfa.loginCode' | t }}</label>
                <input class="input" id="mfa-code" dir="ltr" autocomplete="one-time-code" autocapitalize="none" spellcheck="false" formControlName="code" />
              </div>
              <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="busy()">{{ 'mfa.verify' | t }}</button>
              <button type="button" class="btn btn-secondary btn-block" (click)="restart()">{{ 'mfa.back' | t }}</button>
            </form>
          } @else {
          <div><h1 style="font-size:var(--fs-xl)">{{ 'login.title' | t }}</h1><p class="muted">{{ 'login.subtitle' | t }}</p></div>
          <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            @if (error()) { <div class="form-alert" role="alert">{{ error() }}</div> }
            <div class="field">
              <label for="email">{{ 'login.email' | t }}</label>
              <input class="input" id="email" type="email" dir="ltr" autocomplete="username" formControlName="email" [attr.aria-invalid]="invalid('email')" />
            </div>
            <div class="field">
              <div class="row between"><label for="password">{{ 'login.password' | t }}</label><a class="small" routerLink="/forgot-password">{{ 'login.forgot' | t }}</a></div>
              <input class="input" id="password" type="password" dir="ltr" autocomplete="current-password" formControlName="password" [attr.aria-invalid]="invalid('password')" />
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-block" [disabled]="busy()">{{ 'login.submit' | t }}</button>
          </form>
          }
        </div>
      </main>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly i18n = inject(I18nService);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** Set after the password step when the account has a second factor. */
  protected readonly challenge = signal<string | null>(null);
  protected readonly codeForm = inject(FormBuilder).nonNullable.group({ code: ['', [Validators.required, Validators.minLength(6)]] });
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected invalid(name: 'email' | 'password'): 'true' | null {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty) ? 'true' : null;
  }

  protected restart(): void {
    this.challenge.set(null);
    this.error.set('');
  }

  protected verify(): void {
    this.codeForm.markAllAsTouched();
    const token = this.challenge();
    if (this.codeForm.invalid || !token) { this.error.set(this.i18n.t('login.required')); return; }
    this.busy.set(true);
    this.error.set('');
    this.auth.verifyMfa(token, this.codeForm.getRawValue().code.trim()).subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(e instanceof HttpErrorResponse && e.status === 429 ? this.i18n.t('mfa.locked') : this.i18n.t('mfa.loginInvalid'));
      },
    });
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.error.set(this.i18n.t('login.required'));
      return;
    }
    this.busy.set(true);
    this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email.trim(), password).subscribe({
      next: (res) => {
        if ('mfaRequired' in res) {
          this.busy.set(false);
          this.form.controls.password.reset(''); // the password is not kept around while the second step is open
          this.codeForm.reset();
          this.challenge.set(res.mfaToken);
          return;
        }
        void this.router.navigateByUrl('/dashboard');
      },
      error: (e: unknown) => {
        this.busy.set(false);
        // 429 = throttled; everything else on login is reported with the same generic message.
        this.error.set(e instanceof HttpErrorResponse && e.status === 429 ? this.i18n.t('common.error') : this.i18n.t('auth.invalid'));
      },
    });
  }
}
