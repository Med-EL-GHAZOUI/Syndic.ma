import { HttpClient } from '@angular/common/http';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { I18nService, TPipe } from '../core/i18n.service';
import { ToastService } from '../core/toast.service';

interface Status { enabled: boolean; backupCodesLeft: number }
interface Setup { secret: string; otpauthUrl: string }

/** Two-factor authentication (authenticator app) enrolment and removal, in the account settings. */
@Component({
  selector: 'app-mfa-card',
  imports: [ReactiveFormsModule, TPipe],
  template: `
    <section class="card">
      <div class="card-head"><h2>{{ 'mfa.title' | t }}</h2></div>
      <div class="card-body stack">
        @if (backupCodes(); as codes) {
          <h3>{{ 'mfa.backupTitle' | t }}</h3>
          <p class="note warn">{{ 'mfa.backupText' | t }}</p>
          <ul class="backup-codes" dir="ltr">@for (c of codes; track c) { <li><code>{{ c }}</code></li> }</ul>
          <div class="row">
            <button type="button" class="btn btn-secondary" (click)="copy(codes)">{{ 'mfa.copy' | t }}</button>
            <button type="button" class="btn btn-primary" (click)="backupCodes.set(null)">{{ 'mfa.backupDone' | t }}</button>
          </div>
        } @else if (setup(); as s) {
          <p>{{ 'mfa.setupSteps' | t }}</p>
          <div class="field"><label for="m-secret">{{ 'mfa.secret' | t }}</label><input class="input" id="m-secret" dir="ltr" readonly [value]="grouped(s.secret)" (focus)="$any($event.target).select()" /></div>
          <div class="field"><label for="m-url">{{ 'mfa.url' | t }}</label><input class="input" id="m-url" dir="ltr" readonly [value]="s.otpauthUrl" (focus)="$any($event.target).select()" /></div>
          <form class="stack" [formGroup]="enableForm" (ngSubmit)="enable()" novalidate>
            <div class="field"><label for="m-code">{{ 'mfa.code' | t }} *</label><input class="input" id="m-code" dir="ltr" inputmode="numeric" autocomplete="one-time-code" maxlength="6" formControlName="code" />
              @if (error()) { <span class="field-error">{{ error() }}</span> }</div>
            <div class="row"><button type="submit" class="btn btn-primary" [disabled]="busy()">{{ 'mfa.confirm' | t }}</button><button type="button" class="btn btn-secondary" (click)="setup.set(null)">{{ 'common.cancel' | t }}</button></div>
          </form>
        } @else if (status(); as st) {
          @if (!st.enabled) {
            <p>{{ 'mfa.intro' | t }}</p>
            <p class="muted">{{ 'mfa.disabled' | t }}</p>
            <div><button type="button" class="btn btn-primary" [disabled]="busy()" (click)="start()">{{ 'mfa.enable' | t }}</button></div>
          } @else {
            <p><span class="badge badge-success">{{ 'mfa.badge' | t }}</span> {{ 'mfa.enabled' | t: { n: st.backupCodesLeft } }}</p>
            <form class="stack" [formGroup]="disableForm" (ngSubmit)="disable()" novalidate>
              <p class="muted">{{ 'mfa.disableText' | t }}</p>
              <div class="field"><label for="d-pass">{{ 'login.password' | t }} *</label><input class="input" id="d-pass" type="password" dir="ltr" autocomplete="current-password" formControlName="password" /></div>
              <div class="field"><label for="d-code">{{ 'mfa.loginCode' | t }} *</label><input class="input" id="d-code" dir="ltr" autocomplete="one-time-code" formControlName="code" />
                @if (error()) { <span class="field-error">{{ error() }}</span> }</div>
              <div><button type="submit" class="btn btn-secondary danger" [disabled]="busy()">{{ 'mfa.disable' | t }}</button></div>
            </form>
          }
        } @else { <div class="spinner" role="status"></div> }
      </div>
    </section>
  `,
})
export class MfaCard {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly status = signal<Status | null>(null);
  protected readonly setup = signal<Setup | null>(null);
  protected readonly backupCodes = signal<string[] | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected readonly enableForm = inject(FormBuilder).nonNullable.group({ code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]] });
  protected readonly disableForm = inject(FormBuilder).nonNullable.group({ password: ['', Validators.required], code: ['', [Validators.required, Validators.minLength(6)]] });

  constructor() { this.refresh(); }

  private refresh(): void {
    this.http.get<Status>('/api/auth/mfa/status').subscribe({ next: (s) => this.status.set(s), error: (e) => this.toast.error(e, this.i18n.t('common.error')) });
  }

  /** `JBSW Y3DP ...` is easier to type on a phone than 32 letters in a row. */
  protected grouped(secret: string): string { return secret.replace(/(.{4})/g, '$1 ').trim(); }

  protected start(): void {
    this.busy.set(true);
    this.error.set('');
    this.http.post<Setup>('/api/auth/mfa/setup', {}).subscribe({
      next: (s) => { this.busy.set(false); this.enableForm.reset(); this.setup.set(s); },
      error: (e) => { this.busy.set(false); this.toast.error(e, this.i18n.t('common.error')); },
    });
  }

  protected enable(): void {
    this.enableForm.markAllAsTouched();
    if (this.enableForm.invalid) { this.error.set(this.i18n.t('mfa.invalidCode')); return; }
    this.busy.set(true);
    this.error.set('');
    this.http.post<{ backupCodes: string[] }>('/api/auth/mfa/enable', { code: this.enableForm.getRawValue().code }).subscribe({
      next: (r) => { this.busy.set(false); this.setup.set(null); this.backupCodes.set(r.backupCodes); this.toast.show(this.i18n.t('mfa.enabledToast')); this.refresh(); },
      error: (e) => { this.busy.set(false); if (e?.status === 400) this.error.set(this.i18n.t('mfa.invalidCode')); else this.toast.error(e, this.i18n.t('common.error')); },
    });
  }

  protected disable(): void {
    this.disableForm.markAllAsTouched();
    if (this.disableForm.invalid) return;
    this.busy.set(true);
    this.error.set('');
    const { password, code } = this.disableForm.getRawValue();
    this.http.post('/api/auth/mfa/disable', { password, code: code.trim() }).subscribe({
      next: () => { this.busy.set(false); this.disableForm.reset(); this.toast.show(this.i18n.t('mfa.disabledToast')); this.refresh(); },
      // 403 = wrong password or code (the API does not say which); the session itself stays valid
      error: (e) => { this.busy.set(false); if (e?.status === 403) this.error.set(this.i18n.t('mfa.invalidCode')); else this.toast.error(e, this.i18n.t('common.error')); },
    });
  }

  protected copy(codes: string[]): void {
    void navigator.clipboard?.writeText(codes.join('\n')).then(() => this.toast.show(this.i18n.t('mfa.copied')), () => undefined);
  }
}
