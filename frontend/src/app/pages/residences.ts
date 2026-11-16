import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { I18nService, TPipe } from '../core/i18n.service';
import { Residence } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

@Component({
  selector: 'app-residences',
  imports: [ReactiveFormsModule, TPipe, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.residences' | t }}</h1><p class="page-sub">{{ 'residences.subtitle' | t }}</p></div>
        @if (canCreate()) {
          <div class="page-actions"><button type="button" class="btn btn-primary" (click)="open.set(true)"><app-icon name="plus" /><span>{{ 'residences.add' | t }}</span></button></div>
        }
      </header>

      <div class="card">
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!rows().length) { <div class="empty"><app-icon name="building" /><h3>{{ 'residences.emptyTitle' | t }}</h3><p>{{ 'residences.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th scope="col">{{ 'common.name' | t }}</th><th scope="col">{{ 'common.city' | t }}</th><th scope="col" class="hide-sm">{{ 'common.address' | t }}</th><th scope="col" class="num hide-sm">{{ 'residences.monthlyFee' | t }}</th></tr></thead>
              <tbody>
                @for (r of rows(); track r.id) {
                  <tr><td class="cell-main">{{ r.name }}</td><td>{{ r.city }}</td><td class="hide-sm">{{ r.address }}</td><td class="num hide-sm">{{ r.monthlyFee ?? '—' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>

    @if (open()) {
      <app-modal [title]="'residences.add' | t" (closed)="close()">
        <form id="res-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full">
            <label for="r-name">{{ 'common.name' | t }} <span class="req" aria-hidden="true">*</span></label>
            <input class="input" id="r-name" formControlName="name" [attr.aria-invalid]="bad('name')" />
            @if (bad('name')) { <span class="field-error">{{ 'form.required' | t }}</span> }
          </div>
          <div class="field"><label for="r-city">{{ 'common.city' | t }} <span class="req" aria-hidden="true">*</span></label><input class="input" id="r-city" formControlName="city" [attr.aria-invalid]="bad('city')" />@if (bad('city')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="r-year">{{ 'residences.yearBuilt' | t }}</label><input class="input" id="r-year" type="number" dir="ltr" formControlName="yearBuilt" /></div>
          <div class="field full"><label for="r-addr">{{ 'common.address' | t }} <span class="req" aria-hidden="true">*</span></label><input class="input" id="r-addr" formControlName="address" [attr.aria-invalid]="bad('address')" />@if (bad('address')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="close()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="res-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }
  `,
})
export class ResidencesPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly canCreate = computed(() => can(inject(AuthService).user()?.role, 'residences', 'c'));

  protected readonly rows = signal<Residence[]>([]);
  protected readonly loading = signal(true);
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    city: ['', Validators.required],
    address: ['', Validators.required],
    yearBuilt: [null as number | null, [Validators.min(1900), Validators.max(2100)]],
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.http.get<Residence[]>('/api/residences').subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: (e: unknown) => { this.toast.error(e, this.i18n.t('common.error')); this.loading.set(false); },
    });
  }

  protected bad(name: 'name' | 'city' | 'address'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected close(): void {
    this.open.set(false);
    this.form.reset();
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.http.post<Residence>('/api/residences', { name: v.name.trim(), city: v.city.trim(), address: v.address.trim(), ...(v.yearBuilt ? { yearBuilt: v.yearBuilt } : {}) }).subscribe({
      next: () => { this.busy.set(false); this.close(); this.toast.show(this.i18n.t('common.saved')); this.load(); },
      error: (e: unknown) => { this.busy.set(false); this.toast.error(e, this.i18n.t('common.error')); },
    });
  }
}
