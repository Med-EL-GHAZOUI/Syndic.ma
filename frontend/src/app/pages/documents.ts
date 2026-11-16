import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2 } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { DocumentItem, Residence } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const CATEGORIES = ['regulation', 'minutes', 'contract', 'invoice', 'insurance', 'plan', 'other'];
const AUDIENCES = ['all', 'owners', 'staff'];
// Mirrors the API allow-list for a fast message; the server re-validates the file CONTENT (magic bytes).
const EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx', 'doc', 'xls'];
const MAX_BYTES = 10 * 1024 * 1024;

const size = (b: number) => (b < 1024 ? `${b} o` : b < 1048576 ? `${Math.round(b / 1024)} Ko` : `${(b / 1048576).toFixed(1)} Mo`);

@Component({
  selector: 'app-documents',
  imports: [ReactiveFormsModule, TPipe, TlPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.documents' | t }}</h1><p class="page-sub">{{ 'documents.subtitle' | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="open.set(true)"><app-icon name="plus" /><span>{{ 'documents.add' | t }}</span></button></div> }
      </header>
      <div class="card">
        <div class="lv-toolbar">
          <label class="sr-only" for="d-cat">{{ 'common.category' | t }}</label>
          <select class="select" id="d-cat" (change)="filter.set($any($event.target).value)"><option value="">{{ 'common.category' | t }}</option>@for (c of categories; track c) { <option [value]="c">{{ c | tl: 'docCategory' }}</option> }</select>
          <span class="lv-count" aria-live="polite">{{ 'common.results' | t: { n: shown().length } }}</span>
        </div>
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!shown().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'documents.emptyTitle' | t }}</h3><p>{{ 'documents.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'documents.name' | t }}</th><th scope="col">{{ 'common.category' | t }}</th>@if (canCreate()) { <th scope="col" class="hide-md">{{ 'documents.visibility' | t }}</th> }<th scope="col" class="num hide-sm">{{ 'documents.size' | t }}</th><th scope="col" class="hide-sm">{{ 'documents.uploadedAt' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (d of shown(); track d.id) {
                <tr>
                  <td><div class="cell-main">{{ d.name }}</div><div class="cell-sub">{{ d.fileName }}</div></td>
                  <td>{{ d.category | tl: 'docCategory' }}</td>
                  @if (canCreate()) { <td class="hide-md">{{ d.visibility | tl: 'audience' }}</td> }
                  <td class="num hide-sm">{{ fmt(d.size) }}</td>
                  <td class="hide-sm">{{ d.createdAt.slice(0, 10) | fdate }}</td>
                  <td class="actions">
                    <button type="button" class="icon-btn" (click)="download(d)" [attr.aria-label]="'documents.download' | t" [title]="'documents.download' | t"><app-icon name="send" /></button>
                    @if (canDelete()) { <button type="button" class="icon-btn danger" (click)="toDelete.set(d)" [attr.aria-label]="'common.delete' | t" [title]="'common.delete' | t"><app-icon name="x" /></button> }
                  </td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (open()) {
      <app-modal [title]="'documents.add' | t" (closed)="closeForm()">
        <form id="doc-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="f-res">{{ 'common.residence' | t }} *</label><select class="select" id="f-res" formControlName="residenceId" [attr.aria-invalid]="bad('residenceId')"><option value="">{{ 'common.select' | t }}</option>@for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>@if (bad('residenceId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field full"><label for="f-name">{{ 'documents.name' | t }} *</label><input class="input" id="f-name" formControlName="name" [attr.aria-invalid]="bad('name')" />@if (bad('name')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="f-cat">{{ 'common.category' | t }}</label><select class="select" id="f-cat" formControlName="category">@for (c of categories; track c) { <option [value]="c">{{ c | tl: 'docCategory' }}</option> }</select></div>
          <div class="field"><label for="f-vis">{{ 'documents.visibility' | t }}</label><select class="select" id="f-vis" formControlName="visibility">@for (a of audiences; track a) { <option [value]="a">{{ a | tl: 'audience' }}</option> }</select></div>
          <div class="field full"><label for="f-file">{{ 'documents.file' | t }} *</label>
            <input class="input" id="f-file" type="file" accept=".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.doc,.xls" (change)="onFile($event)" [attr.aria-invalid]="fileError() ? 'true' : null" />
            <span class="field-hint">{{ 'documents.fileHint' | t }}</span>
            @if (fileError()) { <span class="field-error">{{ fileError() }}</span> }</div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="closeForm()">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="doc-form" class="btn btn-primary" [disabled]="busy()">{{ 'documents.upload' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (toDelete(); as d) {
      <app-confirm [title]="'common.delete' | t" [message]="'common.confirmDelete' | t: { name: d.name }" [confirmLabel]="'common.delete' | t" [danger]="true" (confirmed)="remove(d)" (cancelled)="toDelete.set(null)" />
    }
  `,
})
export class DocumentsPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly categories = CATEGORIES;
  protected readonly audiences = AUDIENCES;
  protected readonly fmt = size;
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly canCreate = computed(() => can(this.role(), 'documents', 'c'));
  protected readonly canDelete = computed(() => can(this.role(), 'documents', 'd'));
  protected readonly rows = signal<DocumentItem[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly filter = signal('');
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly open = signal(false);
  protected readonly toDelete = signal<DocumentItem | null>(null);
  protected readonly fileError = signal('');
  private file: File | null = null;
  protected readonly shown = computed(() => this.rows().filter((d) => !this.filter() || d.category === this.filter()));

  protected readonly form = inject(FormBuilder).nonNullable.group({
    residenceId: ['', Validators.required], name: ['', [Validators.required, Validators.minLength(2)]], category: ['other'], visibility: ['staff'],
  });

  constructor() {
    this.load();
    if (this.canCreate()) this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r) });
  }

  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<DocumentItem[]>('/api/documents?limit=200').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }
  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }

  protected closeForm(): void {
    this.open.set(false);
    this.file = null;
    this.fileError.set('');
    this.form.reset({ category: 'other', visibility: 'staff' });
  }

  protected onFile(ev: Event): void {
    this.file = (ev.target as HTMLInputElement).files?.[0] ?? null;
    this.fileError.set('');
    if (!this.file) return;
    const ext = this.file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!EXTENSIONS.includes(ext)) this.fileError.set(this.i18n.t('documents.fileHint'));
    else if (this.file.size > MAX_BYTES) this.fileError.set(this.i18n.t('documents.errSize'));
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (!this.file) this.fileError.set(this.i18n.t('form.required'));
    if (this.form.invalid || !this.file || this.fileError()) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    const fd = new FormData(); // the browser sets the multipart boundary; the interceptor adds the bearer token
    fd.append('residenceId', v.residenceId);
    fd.append('name', v.name.trim());
    fd.append('category', v.category);
    fd.append('visibility', v.visibility);
    fd.append('file', this.file, this.file.name);
    this.http.post('/api/documents', fd).subscribe({
      next: () => { this.busy.set(false); this.closeForm(); this.toast.show(this.i18n.t('documents.uploaded')); this.load(); },
      error: this.fail, // the API explains 415 (type/content mismatch), 413 (too large), 404 (residence)
    });
  }

  /** Authenticated download: fetch as a blob (bearer header), then hand it to the browser. */
  protected download(d: DocumentItem): void {
    this.http.get(`/api/documents/${d.id}/download`, { responseType: 'blob' }).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = d.fileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      error: this.fail,
    });
  }

  protected remove(d: DocumentItem): void {
    this.toDelete.set(null);
    this.http.delete(`/api/documents/${d.id}`).subscribe({ next: () => { this.toast.show(this.i18n.t('documents.deleted')); this.load(); }, error: this.fail });
  }
}
