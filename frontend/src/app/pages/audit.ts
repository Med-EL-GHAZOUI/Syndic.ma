import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { AuditEntry } from '../core/models';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon';

@Component({
  selector: 'app-audit',
  imports: [TPipe, TlPipe, IconComponent],
  template: `
    <div class="page">
      <header class="page-header"><div><h1>{{ 'nav.audit' | t }}</h1><p class="page-sub">{{ 'audit.subtitle' | t }}</p></div></header>
      <p class="note plain">{{ 'audit.note' | t }}</p>
      <div class="card">
        <div class="lv-toolbar">
          <label class="sr-only" for="au-act">{{ 'audit.action' | t }}</label>
          <select class="select" id="au-act" (change)="action.set($any($event.target).value)"><option value="">{{ 'audit.action' | t }}</option>@for (a of actions(); track a) { <option [value]="a">{{ a | tl: 'auditAction' }}</option> }</select>
          <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: shown().length } }}</span>
        </div>
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!shown().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'common.emptyTitle' | t }}</h3></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'common.date' | t }}</th><th scope="col">{{ 'audit.user' | t }}</th><th scope="col">{{ 'audit.action' | t }}</th><th scope="col" class="hide-sm">{{ 'audit.entity' | t }}</th><th scope="col" class="hide-md">{{ 'audit.detail' | t }}</th></tr></thead>
            <tbody>
              @for (e of shown(); track e.id) {
                <tr><td class="nowrap">{{ stamp(e.createdAt) }}</td><td><div class="cell-main">{{ e.userName || '—' }}</div>@if (e.role) { <div class="cell-sub">{{ e.role | tl: 'role' }}</div> }</td><td><span class="badge">{{ e.action | tl: 'auditAction' }}</span></td><td class="hide-sm">{{ e.entity | tl: 'entity' }}</td><td class="hide-md">{{ e.summary }}</td></tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>
  `,
})
export class AuditPage {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);
  protected readonly rows = signal<AuditEntry[]>([]);
  protected readonly action = signal('');
  protected readonly loading = signal(true);
  protected readonly actions = computed(() => [...new Set(this.rows().map((r) => r.action))].sort());
  protected readonly shown = computed(() => this.rows().filter((r) => !this.action() || r.action === this.action()));

  constructor() {
    this.http.get<AuditEntry[]>('/api/audit?limit=200').subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: (e: unknown) => { this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); },
    });
  }

  protected stamp(iso: string): string {
    return new Intl.DateTimeFormat(this.i18n.lang() === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  }
}
