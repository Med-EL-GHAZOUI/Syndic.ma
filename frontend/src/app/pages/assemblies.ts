import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { DatePipe2, pct } from '../core/format';
import { I18nService, TPipe, TlPipe } from '../core/i18n.service';
import { AssemblyItem, AssemblyView, AttendanceState, Residence, ResolutionRow, Unit } from '../core/models';
import { can } from '../core/permissions';
import { ToastService } from '../core/toast.service';
import { ConfirmDialog } from '../shared/confirm';
import { IconComponent } from '../shared/icon';
import { ModalComponent } from '../shared/modal';

const TONE: Record<string, string> = { planned: 'info', convened: 'warning', held: 'success', cancelled: 'neutral' };
const RESULT_TONE: Record<string, string> = { pending: 'neutral', adopted: 'success', rejected: 'danger' };
type Step = { kind: 'convene' | 'hold' | 'cancel' | 'delete'; a: AssemblyView };

@Component({
  selector: 'app-assemblies',
  imports: [ReactiveFormsModule, TPipe, TlPipe, DatePipe2, IconComponent, ModalComponent, ConfirmDialog],
  template: `
    <div class="page">
      <header class="page-header">
        <div><h1>{{ 'nav.assemblies' | t }}</h1><p class="page-sub">{{ 'assemblies.subtitle' | t }}</p></div>
        @if (canCreate()) { <div class="page-actions"><button type="button" class="btn btn-primary" (click)="openForm()"><app-icon name="plus" /><span>{{ 'assemblies.add' | t }}</span></button></div> }
      </header>
      <div class="card">
        @if (loading()) { <div class="empty"><div class="spinner" role="status"></div></div> }
        @else if (!rows().length) { <div class="empty"><app-icon name="inbox" /><h3>{{ 'assemblies.emptyTitle' | t }}</h3><p>{{ 'assemblies.emptyText' | t }}</p></div> }
        @else {
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">{{ 'common.title' | t }}</th><th scope="col">{{ 'common.date' | t }}</th><th scope="col" class="hide-md">{{ 'assemblies.location' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col" class="actions"><span class="sr-only">{{ 'common.actions' | t }}</span></th></tr></thead>
            <tbody>
              @for (a of rows(); track a.id) {
                <tr>
                  <td><div class="cell-main">{{ a.title }}</div><div class="cell-sub">{{ a.type | tl: 'assemblyType' }}</div></td>
                  <td>{{ a.date | fdate }} <span dir="ltr">{{ a.time }}</span></td>
                  <td class="hide-md">{{ a.location }}</td>
                  <td><span class="badge" [class]="'badge-' + tone(a.status)">{{ a.status | tl: 'assemblyStatus' }}</span></td>
                  <td class="actions"><button type="button" class="icon-btn" (click)="view(a.id)" [attr.aria-label]="'common.view' | t" [title]="'common.view' | t"><app-icon name="eye" /></button></td>
                </tr>
              }
            </tbody>
          </table></div>
        }
      </div>
    </div>

    @if (detail(); as a) {
      <app-modal [title]="a.title" size="lg" (closed)="detail.set(null)">
        <div class="stack">
          <p>
            <span class="badge" [class]="'badge-' + tone(a.status)">{{ a.status | tl: 'assemblyStatus' }}</span>
            · {{ a.type | tl: 'assemblyType' }} · {{ a.date | fdate }} <span dir="ltr">{{ a.time }}</span> · {{ a.location }}
          </p>
          @if (a.agenda.length) { <ol class="agenda">@for (p of a.agenda; track $index) { <li>{{ p }}</li> }</ol> }

          <p><strong>{{ 'assemblies.quorum' | t }} :</strong> <span dir="ltr">{{ a.quorum.represented }} / {{ a.quorum.total }}</span> ({{ pctOf(a.quorum.ratio) }})</p>

          @if (staff()) {
            <h3>{{ 'assemblies.attendance' | t }}</h3>
            @if (a.status === 'planned' || a.status === 'cancelled') { <p class="muted">{{ 'assemblies.attendanceLockedText' | t }}</p> }
            @else {
              <div class="table-wrap"><table class="table">
                <thead><tr><th scope="col">{{ 'units.unit' | t }}</th><th scope="col">{{ 'common.status' | t }}</th><th scope="col">{{ 'assemblies.proxyTo' | t }}</th></tr></thead>
                <tbody>
                  @for (r of a.attendance; track r.unitId) {
                    <tr>
                      <td>{{ unitLabel(r.unitId) }}</td>
                      <td>
                        <label class="sr-only" [for]="'att-' + r.unitId">{{ 'assemblies.attendance' | t }}</label>
                        <select class="select" [id]="'att-' + r.unitId" [disabled]="a.status !== 'convened' || !canEdit()" [value]="r.status" (change)="setAttendance(a, r.unitId, $any($event.target).value, r.proxyTo)">
                          @for (s of attStates; track s) { <option [value]="s" [selected]="s === r.status">{{ s | tl: 'attendance' }}</option> }
                        </select>
                      </td>
                      <td>
                        @if (r.status === 'proxy') { <input class="input" [attr.aria-label]="'assemblies.proxyTo' | t" [value]="r.proxyTo" [disabled]="a.status !== 'convened' || !canEdit()" (change)="setAttendance(a, r.unitId, 'proxy', $any($event.target).value)" /> }
                      </td>
                    </tr>
                  }
                </tbody>
              </table></div>
            }
          }

          <h3>{{ 'assemblies.resolutions' | t }}</h3>
          @if (!a.resolutions.length) { <p class="muted">{{ 'assemblies.noResolutionsText' | t }}</p> }
          @else {
            <div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">{{ 'assemblies.resolution' | t }}</th><th scope="col" class="num">{{ 'assemblies.for' | t }}</th><th scope="col" class="num">{{ 'assemblies.against' | t }}</th><th scope="col" class="num">{{ 'assemblies.abstain' | t }}</th><th scope="col">{{ 'assemblies.result' | t }}</th><th scope="col" class="actions"></th></tr></thead>
              <tbody>
                @for (r of a.resolutions; track r.id) {
                  <tr>
                    <td>{{ r.title }}</td><td class="num">{{ r.votesFor }}</td><td class="num">{{ r.votesAgainst }}</td><td class="num">{{ r.abstain }}</td>
                    <td><span class="badge" [class]="'badge-' + resultTone(r.result)">{{ (r.result ?? 'pending') | tl: 'resolutionResult' }}</span></td>
                    <td class="actions">@if (a.status === 'convened' && canEdit()) { <button type="button" class="icon-btn" (click)="editRes(r)" [attr.aria-label]="'assemblies.editResolution' | t" [title]="'assemblies.editResolution' | t"><app-icon name="eye" /></button> }</td>
                  </tr>
                }
              </tbody>
            </table></div>
            <p class="muted">{{ 'assemblies.voteNote' | t }}</p>
          }
          @if (a.status === 'convened' && canEdit()) {
            <form class="form-grid" [formGroup]="resForm" (ngSubmit)="saveRes(a)" novalidate>
              <p class="full muted">{{ 'assemblies.voteIntro' | t: { n: a.quorum.represented } }}</p>
              <div class="field full"><label for="r-title">{{ 'assemblies.resolution' | t }} *</label><input class="input" id="r-title" formControlName="title" /></div>
              <div class="field"><label for="r-for">{{ 'assemblies.for' | t }}</label><input class="input" id="r-for" type="number" min="0" dir="ltr" formControlName="votesFor" /></div>
              <div class="field"><label for="r-against">{{ 'assemblies.against' | t }}</label><input class="input" id="r-against" type="number" min="0" dir="ltr" formControlName="votesAgainst" /></div>
              <div class="field"><label for="r-abs">{{ 'assemblies.abstain' | t }}</label><input class="input" id="r-abs" type="number" min="0" dir="ltr" formControlName="abstain" /></div>
              <div class="field"><button type="submit" class="btn btn-secondary" [disabled]="busy()">{{ (editingRes() ? 'assemblies.editResolution' : 'assemblies.addResolution') | t }}</button></div>
            </form>
          }

          <h3>{{ 'assemblies.minutes' | t }}</h3>
          @if ((a.status === 'convened' || a.status === 'held') && canEdit()) {
            <label class="sr-only" for="a-min">{{ 'assemblies.minutes' | t }}</label>
            <textarea class="textarea" id="a-min" rows="6" [value]="a.minutes" (input)="minutes.set($any($event.target).value)"></textarea>
            <div><button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="saveMinutes(a)">{{ 'assemblies.editMinutes' | t }}</button></div>
          } @else if (a.minutes) { <p style="white-space:pre-wrap">{{ a.minutes }}</p> }
          @else { <p class="muted">{{ 'assemblies.noMinutes' | t }}</p> }
        </div>
        <ng-container footer>
          @if (canEdit()) {
            @if (a.status === 'planned') {
              <button type="button" class="btn btn-secondary" (click)="openForm(a)">{{ 'common.edit' | t }}</button>
              <button type="button" class="btn btn-primary" (click)="step.set({ kind: 'convene', a })">{{ 'assemblies.convene' | t }}</button>
            }
            @if (a.status === 'convened') { <button type="button" class="btn btn-primary" (click)="step.set({ kind: 'hold', a })">{{ 'assemblies.markHeld' | t }}</button> }
            @if (a.status === 'planned' || a.status === 'convened') { <button type="button" class="btn btn-secondary" (click)="step.set({ kind: 'cancel', a })">{{ 'assemblies.cancel' | t }}</button> }
          }
          @if (canDelete() && a.status !== 'held') { <button type="button" class="btn btn-secondary danger" (click)="step.set({ kind: 'delete', a })">{{ 'common.delete' | t }}</button> }
        </ng-container>
      </app-modal>
    }

    @if (formOpen()) {
      <app-modal [title]="(editing() ? 'assemblies.edit' : 'assemblies.add') | t" (closed)="formOpen.set(false)">
        <form id="as-form" class="form-grid" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="field full"><label for="f-res">{{ 'common.residence' | t }} *</label><select class="select" id="f-res" formControlName="residenceId"><option value="">{{ 'common.select' | t }}</option>@for (r of residences(); track r.id) { <option [value]="r.id">{{ r.name }}</option> }</select>@if (bad('residenceId')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field full"><label for="f-title">{{ 'common.title' | t }} *</label><input class="input" id="f-title" formControlName="title" />@if (bad('title')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="f-type">{{ 'common.type' | t }}</label><select class="select" id="f-type" formControlName="type"><option value="ordinary">{{ 'ordinary' | tl: 'assemblyType' }}</option><option value="extraordinary">{{ 'extraordinary' | tl: 'assemblyType' }}</option></select></div>
          <div class="field"><label for="f-date">{{ 'common.date' | t }} *</label><input class="input" id="f-date" type="date" dir="ltr" formControlName="date" />@if (bad('date')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="f-time">{{ 'assemblies.time' | t }} *</label><input class="input" id="f-time" type="time" dir="ltr" formControlName="time" />@if (bad('time')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field"><label for="f-loc">{{ 'assemblies.location' | t }} *</label><input class="input" id="f-loc" formControlName="location" />@if (bad('location')) { <span class="field-error">{{ 'form.required' | t }}</span> }</div>
          <div class="field full"><label for="f-agenda">{{ 'assemblies.agenda' | t }}</label><textarea class="textarea" id="f-agenda" rows="4" formControlName="agenda"></textarea><span class="field-hint">{{ 'assemblies.agendaHint' | t }}</span></div>
        </form>
        <ng-container footer>
          <button type="button" class="btn btn-secondary" (click)="formOpen.set(false)">{{ 'common.cancel' | t }}</button>
          <button type="submit" form="as-form" class="btn btn-primary" [disabled]="busy()">{{ 'common.save' | t }}</button>
        </ng-container>
      </app-modal>
    }

    @if (step(); as s) {
      <app-confirm [title]="('assemblies.' + (s.kind === 'hold' ? 'markHeld' : s.kind === 'delete' ? 'cancel' : s.kind)) | t"
        [message]="s.kind === 'convene' ? ('assemblies.conveneText' | t) : s.kind === 'hold' ? ('assemblies.heldText' | t: { rate: pctOf(s.a.quorum.ratio) }) : s.kind === 'cancel' ? ('assemblies.cancelText' | t) : ('common.confirmDelete' | t)"
        [danger]="s.kind === 'cancel' || s.kind === 'delete'" (confirmed)="run(s)" (cancelled)="step.set(null)" />
    }
  `,
})
export class AssembliesPage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly i18n = inject(I18nService);

  protected readonly attStates: AttendanceState[] = ['present', 'proxy', 'absent'];
  private readonly role = computed(() => this.auth.user()?.role);
  protected readonly canCreate = computed(() => can(this.role(), 'assemblies', 'c'));
  protected readonly canEdit = computed(() => can(this.role(), 'assemblies', 'e'));
  protected readonly canDelete = computed(() => can(this.role(), 'assemblies', 'd'));
  protected readonly staff = computed(() => can(this.role(), 'units')); // residents never see who attended
  protected readonly rows = signal<AssemblyItem[]>([]);
  protected readonly residences = signal<Residence[]>([]);
  protected readonly units = signal<Unit[]>([]);
  protected readonly detail = signal<AssemblyView | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<AssemblyView | null>(null);
  protected readonly editingRes = signal<ResolutionRow | null>(null);
  protected readonly step = signal<Step | null>(null);
  protected readonly minutes = signal<string | null>(null);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    residenceId: ['', Validators.required], title: ['', [Validators.required, Validators.minLength(3)]], type: ['ordinary' as 'ordinary' | 'extraordinary'],
    date: ['', Validators.required], time: ['18:00', Validators.required], location: ['', [Validators.required, Validators.minLength(2)]], agenda: [''],
  });
  protected readonly resForm = inject(FormBuilder).nonNullable.group({ title: ['', [Validators.required, Validators.minLength(3)]], votesFor: [0], votesAgainst: [0], abstain: [0] });

  constructor() {
    this.load();
    if (this.canCreate()) this.http.get<Residence[]>('/api/residences').subscribe({ next: (r) => this.residences.set(r) });
  }

  protected tone = (s: string) => TONE[s] ?? 'neutral';
  protected resultTone = (r?: string) => RESULT_TONE[r ?? 'pending'] ?? 'neutral';
  protected pctOf = (n: number) => pct(n);
  protected unitLabel(id: string): string { return this.units().find((u) => u.id === id)?.number ?? id.slice(0, 8); }
  protected bad(n: keyof typeof this.form.controls): boolean { const c = this.form.controls[n]; return c.invalid && (c.touched || c.dirty); }
  private fail = (e: unknown) => { this.busy.set(false); this.loading.set(false); this.toast.error(e, this.i18n.t('common.error')); };
  private load(): void { this.http.get<AssemblyItem[]>('/api/assemblies?limit=200').subscribe({ next: (r) => { this.rows.set(r); this.loading.set(false); }, error: this.fail }); }

  protected view(id: string): void {
    this.http.get<AssemblyView>(`/api/assemblies/${id}`).subscribe({
      next: (a) => {
        this.detail.set(a);
        this.minutes.set(null);
        if (this.staff()) this.http.get<Unit[]>(`/api/units?residenceId=${a.residenceId}&limit=200`).subscribe({ next: (u) => this.units.set(u) });
      },
      error: this.fail,
    });
  }

  protected openForm(a?: AssemblyView): void {
    this.editing.set(a ?? null);
    this.form.reset({ residenceId: a?.residenceId ?? '', title: a?.title ?? '', type: a?.type ?? 'ordinary', date: a?.date ?? '', time: a?.time ?? '18:00', location: a?.location ?? '', agenda: a?.agenda.join('\n') ?? '' });
    if (a) this.form.controls.residenceId.disable(); else this.form.controls.residenceId.enable();
    this.formOpen.set(true);
  }

  protected save(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.busy.set(true);
    const v = this.form.getRawValue();
    const editing = this.editing();
    const body = { residenceId: editing?.residenceId ?? v.residenceId, title: v.title.trim(), type: v.type, date: v.date, time: v.time, location: v.location.trim(), agenda: v.agenda.split('\n').map((l) => l.trim()).filter(Boolean) };
    const req = editing ? this.http.put(`/api/assemblies/${editing.id}`, body) : this.http.post('/api/assemblies', body);
    req.subscribe({
      next: () => { this.busy.set(false); this.formOpen.set(false); this.toast.show(this.i18n.t('common.saved')); this.load(); if (editing) this.view(editing.id); },
      error: this.fail,
    });
  }

  protected run(s: Step): void {
    this.step.set(null);
    const req = s.kind === 'delete' ? this.http.delete(`/api/assemblies/${s.a.id}`) : this.http.post(`/api/assemblies/${s.a.id}/${s.kind}`, {});
    req.subscribe({
      next: () => {
        this.load();
        if (s.kind === 'delete') this.detail.set(null); else this.view(s.a.id);
        this.toast.show(this.i18n.t(s.kind === 'convene' ? 'assemblies.convened' : 'common.saved'));
      },
      error: this.fail,
    });
  }

  protected setAttendance(a: AssemblyView, unitId: string, status: AttendanceState, proxyTo: string): void {
    // A proxy needs the holder's name: the select alone does not save, the name field does.
    if (status === 'proxy' && !proxyTo.trim()) {
      this.detail.update((d) => (d ? { ...d, attendance: d.attendance.map((r) => (r.unitId === unitId ? { ...r, status: 'proxy' } : r)) } : d));
      return;
    }
    this.http.put(`/api/assemblies/${a.id}/attendance`, { unitId, status, ...(status === 'proxy' ? { proxyTo: proxyTo.trim() } : {}) }).subscribe({
      next: () => this.view(a.id),
      error: (e) => { this.fail(e); this.view(a.id); },
    });
  }

  protected editRes(r: ResolutionRow): void { this.editingRes.set(r); this.resForm.reset({ title: r.title, votesFor: r.votesFor, votesAgainst: r.votesAgainst, abstain: r.abstain }); }

  protected saveRes(a: AssemblyView): void {
    this.resForm.markAllAsTouched();
    if (this.resForm.invalid) return;
    const v = this.resForm.getRawValue();
    const body = { title: v.title.trim(), votesFor: Number(v.votesFor) || 0, votesAgainst: Number(v.votesAgainst) || 0, abstain: Number(v.abstain) || 0 };
    const cur = this.editingRes();
    this.busy.set(true);
    (cur ? this.http.put(`/api/assemblies/${a.id}/resolutions/${cur.id}`, body) : this.http.post(`/api/assemblies/${a.id}/resolutions`, body)).subscribe({
      next: () => { this.busy.set(false); this.editingRes.set(null); this.resForm.reset({ title: '', votesFor: 0, votesAgainst: 0, abstain: 0 }); this.view(a.id); },
      error: this.fail,
    });
  }

  protected saveMinutes(a: AssemblyView): void {
    this.busy.set(true);
    this.http.patch(`/api/assemblies/${a.id}/minutes`, { minutes: this.minutes() ?? a.minutes }).subscribe({
      next: () => { this.busy.set(false); this.toast.show(this.i18n.t('common.saved')); this.view(a.id); },
      error: this.fail,
    });
  }
}
