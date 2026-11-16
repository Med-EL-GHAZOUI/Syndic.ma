import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { Residence, Unit } from '../core/models';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon';

@Component({
  selector: 'app-units',
  imports: [TPipe, TlPipe, IconComponent],
  template: `
    <div class="page">
      <header class="page-header"><div><h1>{{ 'nav.units' | t }}</h1><p class="page-sub">{{ 'units.subtitle' | t }}</p></div></header>
      <div class="card">
        <div class="lv-toolbar">
          <label class="sr-only" for="u-res">{{ 'common.residence' | t }}</label>
          <select class="select" id="u-res" (change)="residenceId.set($any($event.target).value)">
            <option value="">{{ 'shell.allResidences' | t }}</option>
            @for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }
          </select>
          <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: filtered().length } }}</span>
        </div>
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!filtered().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'units.emptyTitle' | t }}</h3><p>{{ 'units.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th scope="col">{{ 'units.number' | t }}</th><th scope="col">{{ 'units.floor' | t }}</th><th scope="col">{{ 'common.type' | t }}</th><th scope="col" class="num">{{ 'units.area' | t }}</th><th scope="col" class="num">{{ 'units.tantiemes' | t }}</th></tr></thead>
              <tbody>
                @for (u of filtered(); track u.id) {
                  <tr><td class="cell-main">{{ u.number }}</td><td>{{ u.floor }}</td><td>{{ u.type | tl: 'unitType' }}</td><td class="num">{{ u.area }} m²</td><td class="num">{{ u.tantiemes }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class UnitsPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly units = signal<Unit[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly residenceId = signal('');
  protected readonly loading = signal(true);
  protected readonly filtered = computed(() => this.units().filter((u) => !this.residenceId() || u.residenceId === this.residenceId()));

  constructor() {
    const fail = (e: unknown) => { this.toast.error(e, this.i18n.t('common.error')); this.loading.set(false); };
    this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r), error: fail });
    this.http.get<Unit[]>('/api/units?limit=200').subscribe({ next: (u) => { this.units.set(u); this.loading.set(false); }, error: fail });
  }
}
