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
  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  protected invalid(name: 'email' | 'password'): 'true' | null {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty) ? 'true' : null;
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
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (e: unknown) => {
        this.busy.set(false);
        // 429 = throttled; everything else on login is reported with the same generic message.
        this.error.set(e instanceof HttpErrorResponse && e.status === 429 ? this.i18n.t('common.error') : this.i18n.t('auth.invalid'));
      },
    });
  }
}
