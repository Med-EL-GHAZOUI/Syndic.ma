import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { ProviderFull } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const CATEGORIES = ['plumbing', 'electricity', 'elevator', 'cleaning', 'security', 'gardening', 'painting', 'general'];
const PHONE = /^(\+212|0)[5-7]\d{8}$/;

@Component({
  selector: 'app-providers',
  imports: [ReactiveFormsModule, TPipe, TlPipe, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.providers' | t }}</h1><p class="page-sub">{{ 'providers.subtitle' | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="openNew()"><app-icon name="plus" /><span>{{ 'providers.add' | t }}</span></button></div> }
      </header>
      <div class="card">
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!rows().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'providers.emptyTitle' | t }}</h3><p>{{ 'providers.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'providers.company' | t }}</th><th scope="col">{{ 'common.category' | t }}</th><th scope="col" class="hide-md">{{ 'common.phone' | t }}</th><th scope="col" class="hide-sm">{{ 'providers.rating' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (p of rows(); track p.id) {
                <tr>
                  <td><div class="cell-main">{{ p.name }}</div><div class="cell-sub">{{ p.contactName }}{{ p.city ? ' · ' + p.city : '' }}</div></td>
                  <td>{{ p.category | tl: 'providerCategory' }}</td>
                  <td class="hide-md"><span dir="ltr">{{ p.phone || '—' }}</span></td>
                  <td class="hide-sm"><span role="img" [attr.aria-label]="'providers.ratingLabel' | t: { n: p.rating }" style="color:var(--gold-500);letter-spacing:2px">{{ '★'.repeat(p.rating) }}</span></td>
                  <td><span class="badge" [class]="p.active ? 'badge-success' : 'badge-neutral'">{{ (p.active ? 'active' : 'inactive') | tl: 'providerState' }}</span></td>
                  <td class="actions">@if (canEdit()) { <button type="button" class="icon-btn" (click)="openEdit(p)" [attr.aria-label]="'common.edit' | t" [title]="'common.edit' | t"><app-icon name="eye" /></button> }</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (open()) {
      <app-modal [title]="(editing() ? 'providers.edit' : 'providers.add') | t" (closed)="closeForm()">
        <form id="prv-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="v-name">{{ 'providers.company' | t }} *</label><input class="input" id="v-name" formControlName="name" [attr.aria-invalid]="bad('name')" />@if (bad('name')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="v-cat">{{ 'common.category' | t }}</label><select class="select" id="v-cat" formControlName="category">@for (c of categories; track c) { <option [value]="c">{{ c | tl: 'providerCategory' }}</option> }</select></div>
          <div class="field"><label for="v-city">{{ 'common.city' | t }}</label><input class="input" id="v-city" formControlName="city" /></div>
          <div class="field"><label for="v-contact">{{ 'providers.contact' | t }}</label><input class="input" id="v-contact" formControlName="contactName" /></div>
          <div class="field"><label for="v-phone">{{ 'common.phone' | t }}</label><input class="input" id="v-phone" type="tel" dir="ltr" placeholder="+212 5 00 00 00 00" formControlName="phone" [attr.aria-invalid]="bad('phone')" />@if (bad('phone')) { <span class="field-error">{{ 'form.phone' | t }}</span> }</div>
          <div class="field"><label for="v-email">{{ 'common.email' | t }}</label><input class="input" id="v-email" type="email" dir="ltr" formControlName="email" [attr.aria-invalid]="bad('email')" />@if (bad('email')) { <span class="field-error">{{ 'form.email' | t }}</span> }</div>
          <div class="field"><label for="v-ice">{{ 'providers.ice' | t }}</label><input class="input" id="v-ice" dir="ltr" maxlength="15" formControlName="ice" [attr.aria-invalid]="bad('ice')" /><span class="field-hint">{{ 'providers.iceHint' | t }}</span>@if (bad('ice')) { <span class="field-error">{{ 'providers.errIce' | t }}</span> }</div>
          <div class="field"><label for="v-rating">{{ 'providers.rating' | t }}</label><input class="input" id="v-rating" type="number" min="1" max="5" dir="ltr" formControlName="rating" /></div>
          <label class="check full"><input type="checkbox" formControlName="active" /> {{ 'providers.active' | t }}</label>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="prv-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }
  `,
})
export class ProvidersPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly categories = CATEGORIES;
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly canCreate = computed(() => can(this.role(), 'providers', 'c'));
  protected readonly canEdit = computed(() => can(this.role(), 'providers', 'e'));
  protected readonly rows = signal<ProviderFull[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly editing = signal<ProviderFull | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]], category: ['general'], city: [''], contactName: [''],
    phone: ['', [Validators.pattern(PHONE)]], email: ['', [Validators.email]], ice: ['', [Validators.pattern(/^\d{15}$/)]], rating: [3], active: [true],
  });

  constructor() { this.load(); }

  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<ProviderFull[]>('/api/providers?limit=200').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }
  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }

  protected openNew(): void { this.editing.set(null); this.form.reset({ category: 'general', rating: 3, active: true }); this.open.set(true); }
  protected openEdit(p: ProviderFull): void {
    this.editing.set(p);
    this.form.reset({ name: p.name, category: p.category, city: p.city ?? '', contactName: p.contactName ?? '', phone: p.phone ?? '', email: p.email ?? '', ice: p.ice ?? '', rating: p.rating, active: p.active });
    this.open.set(true);
  }
  protected closeForm(): void { this.open.set(false); this.editing.set(null); }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    const clean = (s: string) => (s.trim() ? s.trim() : undefined);
    // Optional empty fields are omitted: the API validates formats strictly and rejects empty strings.
    const body = { name: v.name.trim(), category: v.category, city: clean(v.city), contactName: clean(v.contactName), phone: clean(v.phone)?.replace(/[\s.-]/g, ''), email: clean(v.email), ice: clean(v.ice), rating: v.rating, active: v.active };
    const req = this.editing() ? this.http.put(`/api/providers/${this.editing()!.id}`, body) : this.http.post('/api/providers', body);
    req.subscribe({ next: () => { this.busy.set(false); this.closeForm(); this.toast.show(this.i18n.t('providers.saved')); this.load(); }, error: this.fail });
  }
}
