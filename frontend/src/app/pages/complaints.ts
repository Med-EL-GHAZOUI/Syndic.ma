import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2 } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { Charge, Complaint, ComplaintStatus, Residence, Unit } from '../core/models';
import { can, isResident } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const CATEGORIES = ['plumbing', 'electricity', 'elevator', 'cleaning', 'noise', 'security', 'parking', 'other'];
const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const STATUSES: ComplaintStatus[] = ['new', 'in_progress', 'resolved', 'closed'];
const TONE: Record<string, string> = { new: 'info', in_progress: 'warning', resolved: 'success', closed: 'neutral', low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger' };

@Component({
  selector: 'app-complaints',
  imports: [ReactiveFormsModule, TPipe, TlPipe, DatePipe2, IconComponent, ModalComponent],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ (resident() ? 'nav.complaints.mine' : 'nav.complaints') | t }}</h1><p class="page-sub">{{ (resident() ? 'complaints.subtitleMine' : 'complaints.subtitle') | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="open.set(true)"><app-icon name="plus" /><span>{{ 'complaints.add' | t }}</span></button></div> }
      </header>
      <div class="card">
        <div class="lv-toolbar">
          <label class="sr-only" for="c-status">{{ 'common.status' | t }}</label>
          <select class="select" id="c-status" (change)="filter.set($any($event.target).value)"><option value="">{{ 'common.status' | t }}</option>@for (s of statuses; track s) { <option [value]="s">{{ s | tl: 'complaintStatus' }}</option> }</select>
          <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: shown().length } }}</span>
        </div>
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!shown().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'complaints.emptyTitle' | t }}</h3><p>{{ 'complaints.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'complaints.subject' | t }}</th><th scope="col" class="hide-md">{{ 'common.category' | t }}</th><th scope="col" class="hide-sm">{{ 'complaints.priority' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="hide-sm">{{ 'complaints.createdAt' | t }}</th></tr></thead>
            <tbody>
              @for (c of shown(); track c.id) {
                <tr class="clickable" tabindex="0" (click)="view(c)" (keydown.enter)="view(c)">
                  <td class="cell-main">{{ c.title }}</td><td class="hide-md">{{ c.category | tl: 'complaintCategory' }}</td>
                  <td class="hide-sm"><span class="badge" [class]="'badge-' + tone(c.priority)">{{ c.priority | tl: 'priority' }}</span></td>
                  <td><span class="badge" [class]="'badge-' + tone(c.status)">{{ c.status | tl: 'complaintStatus' }}</span></td>
                  <td class="hide-sm">{{ c.createdAt | fdate }}</td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (open()) {
      <app-modal [title]="'complaints.add' | t" (closed)="closeForm()">
        <form id="cmp-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          @if (resident()) {
            <div class="field full"><label for="m-unit">{{ 'units.unit' | t }} *</label><select class="select" id="m-unit" formControlName="unitId" [attr.aria-invalid]="bad('unitId')"><option value="">{{ 'common.select' | t }}</option>@for (u of unitChoices(); track u) { <option [value]="u">{{ 'units.unit' | t }} {{ $index + 1 }}</option> }</select>@if (bad('unitId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          } @else {
            <div class="field full"><label for="m-res">{{ 'common.residence' | t }} *</label><select class="select" id="m-res" formControlName="residenceId" [attr.aria-invalid]="bad('residenceId')"><option value="">{{ 'common.select' | t }}</option>@for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>@if (bad('residenceId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          }
          <div class="field full"><label for="m-title">{{ 'complaints.subject' | t }} *</label><input class="input" id="m-title" formControlName="title" [attr.aria-invalid]="bad('title')" />@if (bad('title')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="m-cat">{{ 'common.category' | t }}</label><select class="select" id="m-cat" formControlName="category">@for (c of categories; track c) { <option [value]="c">{{ c | tl: 'complaintCategory' }}</option> }</select></div>
          <div class="field"><label for="m-prio">{{ 'complaints.priority' | t }}</label><select class="select" id="m-prio" formControlName="priority">@for (p of priorities; track p) { <option [value]="p">{{ p | tl: 'priority' }}</option> }</select></div>
          <div class="field full"><label for="m-desc">{{ 'common.description' | t }} *</label><textarea class="textarea" id="m-desc" rows="4" formControlName="description" [attr.aria-invalid]="bad('description')"></textarea>@if (bad('description')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="cmp-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.send' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (selected(); as c) {
      <app-modal [title]="c.title" size="lg" (closed)="selected.set(null)">
        <div class="stack">
          <p style="white-space:pre-line">{{ c.description }}</p>
          @if (canEdit()) {
            <div class="field"><label for="m-st">{{ 'common.status' | t }}</label>
              <select class="select" id="m-st" (change)="setStatus(c, $any($event.target).value)">@for (s of statuses; track s) { <option [value]="s" [selected]="s === c.status">{{ s | tl: 'complaintStatus' }}</option> }</select></div>
          } @else { <span class="badge" [class]="'badge-' + tone(c.status)">{{ c.status | tl: 'complaintStatus' }}</span> }
          <div><h3 style="font-size:var(--fs-md);margin-bottom:8px">{{ 'complaints.thread' | t }}</h3>
            <div class="thread">
              @for (m of c.comments; track $index) { <div class="thread-item"><header><strong>{{ m.byName }}</strong><time>{{ m.at | fdate }}</time></header><p style="white-space:pre-line">{{ m.text }}</p></div> }
              @empty { <p class="muted small">{{ 'complaints.noComments' | t }}</p> }
            </div></div>
          @if (c.status !== 'closed') {
            <form class="stack" [formGroup]="replyForm" (ngSubmit)="reply(c)" novalidate>
              <div class="field"><label for="m-reply">{{ 'complaints.reply' | t }}</label><textarea class="textarea" id="m-reply" rows="2" formControlName="text" maxlength="1000"></textarea></div>
              <div><button type="submit" class="btn btn-primary btn-sm" [disabled]="busy()">{{ 'common.send' | t }}</button></div>
            </form>
          }
        </div>
        <ng-container footer><button type="button" class="btn btn-primary" (click)="selected.set(null)">{{ 'common.close' | t }}</button></ng-container>
      </app-modal>
    }
  `,
})
export class ComplaintsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly statuses = STATUSES;
  protected readonly categories = CATEGORIES;
  protected readonly priorities = PRIORITIES;
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly resident = computed(() => isResident(this.role()));
  protected readonly canCreate = computed(() => can(this.role(), 'complaints', 'c'));
  protected readonly canEdit = computed(() => can(this.role(), 'complaints', 'e'));

  protected readonly rows = signal<Complaint[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly unitChoices = signal<string[]>([]);
  protected readonly filter = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly selected = signal<Complaint | null>(null);
  protected readonly shown = computed(() => this.rows().filter((c) => !this.filter() || c.status === this.filter()));

  protected readonly form = inject(FormBuilder).nonNullable.group({
    unitId: [''], residenceId: [''], title: ['', [Validators.required, Validators.minLength(3)]], category: ['other'], priority: ['medium'],
    description: ['', [Validators.required, Validators.minLength(3)]],
  });
  protected readonly replyForm = inject(FormBuilder).nonNullable.group({ text: [''] });

  constructor() {
    this.load();
    if (this.resident()) {
      // Residents cannot list units; their lots are those appearing on their charges.
      this.http.get<Charge[]>('/api/charges?limit=200').subscribe({ next: (c) => this.unitChoices.set([...new Set(c.map((x) => x.unitId))]) });
    } else {
      this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r) });
    }
  }

  protected tone = (v: string) => TONE[v] ?? 'neutral';
  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<Complaint[]>('/api/complaints?limit=200').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }

  protected bad(n: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[n];
    const required = (n === 'unitId' && this.resident()) || (n === 'residenceId' && !this.resident());
    return (c.invalid && (c.touched || c.dirty)) || (required && !c.value && c.touched);
  }

  protected closeForm(): void { this.open.set(false); this.form.reset({ category: 'other', priority: 'medium' }); }

  protected save(): void {
    this.form.markAllAsTouched();
    const v = this.form.getRawValue();
    if (this.form.invalid || (this.resident() ? !v.unitId : !v.residenceId)) return;
    this.busy.set(true);
    const base = { title: v.title.trim(), category: v.category, priority: v.priority, description: v.description.trim() };
    const body = this.resident() ? { ...base, unitId: v.unitId } : { ...base, residenceId: v.residenceId };
    this.http.post('/api/complaints', body).subscribe({
      next: () => { this.busy.set(false); this.closeForm(); this.toast.show(this.i18n.t('complaints.sent')); this.load(); },
      error: this.fail,
    });
  }

  protected view(c: Complaint): void { this.replyForm.reset(); this.selected.set(c); }

  protected setStatus(c: Complaint, status: string): void {
    this.http.patch<Complaint>(`/api/complaints/${c.id}/status`, { status }).subscribe({
      next: (u) => { this.selected.set(u); this.toast.show(this.i18n.t('common.saved')); this.load(); },
      error: this.fail,
    });
  }

  protected reply(c: Complaint): void {
    const text = this.replyForm.getRawValue().text.trim();
    if (!text) return;
    this.busy.set(true);
    this.http.post<Complaint>(`/api/complaints/${c.id}/comments`, { text }).subscribe({
      next: (u) => { this.busy.set(false); this.replyForm.reset(); this.selected.set(u); this.load(); },
      error: this.fail,
    });
  }
}
