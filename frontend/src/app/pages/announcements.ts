import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2 } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { Announcement, Residence } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const CATEGORIES = ['info', 'works', 'meeting', 'urgent'];
const AUDIENCES = ['all', 'owners', 'staff'];

@Component({
  selector: 'app-announcements',
  imports: [ReactiveFormsModule, TPipe, TlPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.announcements' | t }}</h1><p class="page-sub">{{ (staff() ? 'announcements.subtitle' : 'announcements.subtitleMine') | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="open.set(true)"><app-icon name="plus" /><span>{{ 'announcements.add' | t }}</span></button></div> }
      </header>
      @if (loading()) { <div class="card"><div class="empty"><div class="spinner" role="status"></div></div></div> }
      @else if (!rows().length) { <div class="card"><div class="empty"><app-icon name="inbox" /><h3>{{ 'announcements.empty' | t }}</h3><p>{{ 'announcements.emptyText' | t }}</p></div></div> }
      @else {
        <div class="stack">
          @for (a of rows(); track a.id) {
            <article class="card ann-card" [class.pinned]="a.pinned">
              <div class="row between"><h3>{{ a.title }}</h3>
                @if (canDelete()) { <button type="button" class="icon-btn danger" (click)="toDelete.set(a)" [attr.aria-label]="'common.delete' | t" [title]="'common.delete' | t"><app-icon name="x" /></button> }
              </div>
              <div class="meta"><span class="badge badge-info">{{ a.category | tl: 'announcementCategory' }}</span><span>{{ a.publishedAt | fdate }}</span><span>{{ a.authorName }}</span></div>
              <p>{{ a.body }}</p>
            </article>
          }
        </div>
      }
    </div>

    @if (open()) {
      <app-modal [title]="'announcements.add' | t" (closed)="closeForm()">
        <form id="ann-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="a-res">{{ 'common.residence' | t }} *</label><select class="select" id="a-res" formControlName="residenceId" [attr.aria-invalid]="bad('residenceId')"><option value="">{{ 'common.select' | t }}</option>@for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>@if (bad('residenceId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field full"><label for="a-title">{{ 'common.title' | t }} *</label><input class="input" id="a-title" formControlName="title" [attr.aria-invalid]="bad('title')" />@if (bad('title')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="a-cat">{{ 'common.category' | t }}</label><select class="select" id="a-cat" formControlName="category">@for (c of categories; track c) { <option [value]="c">{{ c | tl: 'announcementCategory' }}</option> }</select></div>
          <div class="field"><label for="a-aud">{{ 'announcements.audience' | t }}</label><select class="select" id="a-aud" formControlName="audience">@for (a of audiences; track a) { <option [value]="a">{{ a | tl: 'audience' }}</option> }</select></div>
          <div class="field full"><label for="a-body">{{ 'announcements.body' | t }} *</label><textarea class="textarea" id="a-body" rows="5" formControlName="body" [attr.aria-invalid]="bad('body')"></textarea>@if (bad('body')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="ann-form" class="btn btn-primary" [disabled]="busy()">{{ 'announcements.publish' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (toDelete(); as a) {
      <app-confirm [title]="'common.delete' | t" [message]="'common.confirmDelete' | t: { name: a.title }" [confirmLabel]="'common.delete' | t" [danger]="true" (confirmed)="remove(a)" (cancelled)="toDelete.set(null)" />
    }
  `,
})
export class AnnouncementsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly categories = CATEGORIES;
  protected readonly audiences = AUDIENCES;
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly staff = computed(() => can(this.role(), 'announcements', 'c'));
  protected readonly canCreate = computed(() => can(this.role(), 'announcements', 'c'));
  protected readonly canDelete = computed(() => can(this.role(), 'announcements', 'd'));
  protected readonly rows = signal<Announcement[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly toDelete = signal<Announcement | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    residenceId: ['', Validators.required], title: ['', [Validators.required, Validators.minLength(3)]], category: ['info'], audience: ['all'],
    body: ['', [Validators.required, Validators.minLength(3)]],
  });

  constructor() {
    this.load();
    if (this.canCreate()) this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r) });
  }

  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<Announcement[]>('/api/announcements?limit=100').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }
  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }
  protected closeForm(): void { this.open.set(false); this.form.reset({ category: 'info', audience: 'all' }); }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    this.http.post('/api/announcements', { ...v, title: v.title.trim(), body: v.body.trim() }).subscribe({
      next: () => { this.busy.set(false); this.closeForm(); this.toast.show(this.i18n.t('announcements.published')); this.load(); },
      error: this.fail,
    });
  }

  protected remove(a: Announcement): void {
    this.toDelete.set(null);
    this.http.delete(`/api/announcements/${a.id}`).subscribe({ next: () => { this.toast.show(this.i18n.t('common.deleted')); this.load(); }, error: this.fail });
  }
}
