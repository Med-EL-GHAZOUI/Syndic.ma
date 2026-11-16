// General assemblies: convocation, attendance & proxies, resolutions, minutes.
// Votes are weighted by tantièmes (millièmes). Quorum/majority rules shown here
// are illustrative; legal thresholds must be verified (Law 18-00) — see docs.
import { esc, on, todayIso, sum } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { date, int, pct } from '../core/format.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, isResident, inScope, residenceOptions, activeResidenceIds, myResidences } from '../core/permissions.js';
import { notify } from '../core/notify.js';
import { uid } from '../core/dom.js';
import { pageHeader, btn, statusBadge, tabs, twoLine, residenceName, unitLabel, fullName, unitOccupants, progress, emptyState, kpi } from '../ui/kit.js';
import { listView } from '../ui/table.js';
import { openForm } from '../ui/form.js';
import { confirmDialog, printModal, openModal } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const TYPES = ['ordinary', 'extraordinary'];
const STATUSES = ['planned', 'convened', 'held', 'cancelled'];
const ATTENDANCE = ['present', 'proxy', 'absent'];

function visible() {
  if (!isResident()) return inScope('assemblies');
  const ids = new Set(myResidences().map((r) => r.id));
  return db.all('assemblies').filter((a) => ids.has(a.residenceId) && a.status !== 'planned');
}

function editAssembly(assembly) {
  const ids = activeResidenceIds();
  openForm({
    title: assembly ? t('assemblies.edit') : t('assemblies.add'),
    values: assembly ? { ...assembly, agendaText: assembly.agenda.join('\n') } : { residenceId: ids.length === 1 ? ids[0] : '', type: 'ordinary', time: '18:30', date: todayIso() },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, full: true, options: residenceOptions(), disabled: !!assembly },
      { name: 'title', label: t('common.title'), required: true, full: true, maxLength: 120 },
      { name: 'type', label: t('common.type'), type: 'select', required: true, placeholder: false, options: enumOptions('assemblyType', TYPES) },
      { name: 'date', label: t('common.date'), type: 'date', required: true },
      { name: 'time', label: t('assemblies.time'), type: 'time', required: true },
      { name: 'location', label: t('assemblies.location'), required: true, maxLength: 120 },
      { name: 'agendaText', label: t('assemblies.agenda'), type: 'textarea', rows: 5, required: true, full: true, hint: t('assemblies.agendaHint') },
    ],
    onSubmit: (v) => {
      const agenda = v.agendaText.split('\n').map((l) => l.trim()).filter(Boolean);
      const data = { residenceId: v.residenceId, title: v.title, type: v.type, date: v.date, time: v.time, location: v.location, agenda };
      if (assembly) db.update('assemblies', assembly.id, data);
      else {
        const units = db.all('units').filter((u) => u.residenceId === v.residenceId);
        db.insert('assemblies', { ...data, status: 'planned', attendance: units.map((u) => ({ unitId: u.id, status: 'absent', proxyTo: '' })), resolutions: [], minutes: '' });
      }
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

async function convene(assembly) {
  const ok = await confirmDialog({ title: t('assemblies.convene'), message: t('assemblies.conveneText') });
  if (!ok) return;
  db.update('assemblies', assembly.id, { status: 'convened' }, { action: 'convene' });
  notify({ toRoles: ['owner'], residenceId: assembly.residenceId, key: 'notif.assemblyConvened', params: { title: assembly.title }, link: '#/assemblies' });
  toast(t('assemblies.convened'));
  bus.emit('refresh');
}

async function cancelAssembly(assembly) {
  const ok = await confirmDialog({ title: t('assemblies.cancel'), message: t('assemblies.cancelText'), danger: true });
  if (!ok) return;
  db.update('assemblies', assembly.id, { status: 'cancelled' }, { action: 'cancel' });
  toast(t('common.saved'), 'info');
  bus.emit('refresh');
}

async function removeAssembly(assembly) {
  const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: assembly.title }), confirmLabel: t('common.delete'), danger: true });
  if (!ok) return;
  db.remove('assemblies', assembly.id);
  toast(t('common.deleted'));
  bus.emit('refresh');
  location.hash = '#/assemblies';
}

function unitTantiemes(unitId) {
  return db.get('units', unitId)?.tantiemes || 0;
}

function quorum(assembly) {
  const total = sum(assembly.attendance, (a) => unitTantiemes(a.unitId));
  const represented = sum(assembly.attendance.filter((a) => a.status !== 'absent'), (a) => unitTantiemes(a.unitId));
  return { total, represented, ratio: total ? represented / total : 0 };
}

function resolutionResult(r) {
  const cast = r.votesFor + r.votesAgainst;
  if (!cast && !r.abstain) return 'pending';
  return r.votesFor > r.votesAgainst ? 'adopted' : 'rejected';
}

function editResolution(assembly, resolution) {
  const q = quorum(assembly);
  openForm({
    title: resolution ? t('assemblies.editResolution') : t('assemblies.addResolution'),
    intro: esc(t('assemblies.voteIntro', { n: int(q.represented) })),
    values: resolution || { votesFor: 0, votesAgainst: 0, abstain: 0 },
    fields: [
      { name: 'title', label: t('assemblies.resolution'), required: true, full: true, maxLength: 160 },
      { name: 'votesFor', label: t('assemblies.for'), type: 'number', required: true, min: 0 },
      { name: 'votesAgainst', label: t('assemblies.against'), type: 'number', required: true, min: 0 },
      { name: 'abstain', label: t('assemblies.abstain'), type: 'number', required: true, min: 0 },
    ],
    onSubmit: (v) => {
      if (v.votesFor + v.votesAgainst + v.abstain > q.represented) return t('assemblies.errVotes', { n: int(q.represented) });
      const list = assembly.resolutions;
      const next = resolution
        ? list.map((r) => (r.id === resolution.id ? { ...r, title: v.title, votesFor: v.votesFor, votesAgainst: v.votesAgainst, abstain: v.abstain } : r))
        : [...list, { id: uid('rsl'), title: v.title, votesFor: v.votesFor, votesAgainst: v.votesAgainst, abstain: v.abstain }];
      db.update('assemblies', assembly.id, { resolutions: next });
      toast(t('common.saved'));
      bus.emit('refresh');
      return true;
    },
  });
}

function editMinutes(assembly) {
  openForm({
    title: t('assemblies.minutes'),
    size: 'lg',
    values: { minutes: assembly.minutes },
    fields: [{ name: 'minutes', label: t('assemblies.minutes'), type: 'textarea', rows: 12, full: true, maxLength: 8000 }],
    onSubmit: (v) => {
      db.update('assemblies', assembly.id, { minutes: v.minutes });
      toast(t('common.saved'));
      bus.emit('refresh');
    },
  });
}

async function markHeld(assembly) {
  const q = quorum(assembly);
  const ok = await confirmDialog({ title: t('assemblies.markHeld'), message: t('assemblies.heldText', { rate: pct(q.ratio) }) });
  if (!ok) return;
  db.update('assemblies', assembly.id, { status: 'held' }, { action: 'held' });
  toast(t('common.saved'));
  bus.emit('refresh');
}

function editAttendance(assembly, row) {
  const owner = unitOccupants(row.unitId).owner;
  openForm({
    title: `${unitLabel(row.unitId)} — ${owner ? fullName(owner) : ''}`,
    size: 'sm',
    values: row,
    fields: [
      { name: 'status', label: t('common.status'), type: 'select', required: true, reactive: true, placeholder: false, full: true, options: enumOptions('attendance', ATTENDANCE) },
      { name: 'proxyTo', label: t('assemblies.proxyTo'), required: true, full: true, showIf: (v) => v.status === 'proxy', maxLength: 80 },
    ],
    onSubmit: (v) => {
      const list = assembly.attendance.map((a) => (a.unitId === row.unitId ? { ...a, status: v.status, proxyTo: v.status === 'proxy' ? v.proxyTo : '' } : a));
      db.update('assemblies', assembly.id, { attendance: list }, { silent: true });
      bus.emit('refresh');
    },
  });
}

function printMinutes(assembly) {
  const q = quorum(assembly);
  openModal({
    title: t('assemblies.minutesTitle'),
    size: 'lg',
    content: `
      <div class="receipt">
        <div class="receipt-head"><div><strong style="font-size:var(--fs-lg)">${esc(assembly.title)}</strong><div class="small muted">${esc(residenceName(assembly.residenceId))}</div></div><div style="text-align:end">${esc(date(assembly.date))} · ${esc(assembly.time)}</div></div>
        <p><strong>${esc(t('assemblies.location'))}:</strong> ${esc(assembly.location)}</p>
        <p><strong>${esc(t('assemblies.quorum'))}:</strong> ${esc(int(q.represented))} / ${esc(int(q.total))} (${esc(pct(q.ratio))})</p>
        <h3 style="margin:16px 0 8px">${esc(t('assemblies.agenda'))}</h3>
        <ol>${assembly.agenda.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
        <h3 style="margin:16px 0 8px">${esc(t('assemblies.resolutions'))}</h3>
        <ul>${assembly.resolutions.map((r) => `<li>${esc(r.title)} — ${esc(tl('resolutionResult', resolutionResult(r)))} (${esc(int(r.votesFor))} / ${esc(int(r.votesAgainst))} / ${esc(int(r.abstain))})</li>`).join('') || '<li>—</li>'}</ul>
        <h3 style="margin:16px 0 8px">${esc(t('assemblies.minutes'))}</h3>
        <p style="white-space:pre-line">${esc(assembly.minutes || '—')}</p>
        <p class="small muted" style="margin-top:16px">${esc(t('assemblies.legalNote'))}</p>
      </div>`,
    footer: [
      { label: t('common.print'), variant: 'secondary', icon: 'printer', onClick: () => printModal() },
      { label: t('common.close'), variant: 'primary', onClick: (close) => close() },
    ],
  });
}

function detail(root, id, sub) {
  const assembly = visible().find((a) => a.id === id);
  if (!assembly) {
    root.innerHTML = `<div class="card">${emptyState({ title: t('error.notFoundTitle'), text: t('error.notFoundText'), icon: 'search', action: `<a class="btn btn-primary btn-sm" href="#/assemblies">${esc(t('common.back'))}</a>` })}</div>`;
    return;
  }
  const staff = can('assemblies', 'e');
  const q = quorum(assembly);
  const open = assembly.status === 'convened' || assembly.status === 'held';
  const editable = staff && assembly.status === 'convened';
  const tab = ['attendance', 'resolutions', 'minutes'].includes(sub) ? sub : 'agenda';
  const base = `#/assemblies/${id}`;

  let actions = '';
  if (staff && assembly.status === 'planned') actions = btn({ act: 'convene', label: t('assemblies.convene'), icon: 'send' }) + btn({ act: 'edit', label: t('common.edit'), icon: 'edit', variant: 'secondary' });
  if (staff && assembly.status === 'convened') actions = btn({ act: 'held', label: t('assemblies.markHeld'), icon: 'check' }) + btn({ act: 'edit', label: t('common.edit'), icon: 'edit', variant: 'secondary' });
  if (assembly.status === 'held') actions = btn({ act: 'print', label: t('assemblies.printMinutes'), icon: 'printer', variant: 'secondary' });
  if (staff && (assembly.status === 'planned' || assembly.status === 'convened')) actions += btn({ act: 'cancel', label: t('assemblies.cancel'), icon: 'ban', variant: 'ghost' });
  if (can('assemblies', 'd') && assembly.status !== 'held') actions += btn({ act: 'delete', label: t('common.delete'), icon: 'trash', variant: 'ghost' });

  let content = '';
  if (tab === 'agenda') {
    content = `<div class="card-body stack">
      <div class="row"><span>${icon('calendar')} ${esc(date(assembly.date))} · ${esc(assembly.time)}</span><span>${icon('pin')} ${esc(assembly.location)}</span></div>
      <ol style="margin:0;padding-inline-start:20px;display:grid;gap:8px">${assembly.agenda.map((a) => `<li>${esc(a)}</li>`).join('')}</ol>
    </div>`;
  } else if (tab === 'attendance') {
    content = !open ? emptyState({ title: t('assemblies.attendanceLocked'), text: t('assemblies.attendanceLockedText'), icon: 'users' }) : `
      <div class="card-body stack">
        <div class="row between"><span>${esc(t('assemblies.quorum'))}: <strong class="num">${esc(int(q.represented))} / ${esc(int(q.total))}</strong></span><strong>${esc(pct(q.ratio))}</strong></div>
        ${progress(q.ratio)}
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${esc(t('units.unit'))}</th><th scope="col">${esc(tl('residentType', 'owner'))}</th><th scope="col" class="num">${esc(t('units.tantiemes'))}</th><th scope="col">${esc(t('common.status'))}</th>${editable ? `<th scope="col" class="actions"><span class="sr-only">${esc(t('common.actions'))}</span></th>` : ''}</tr></thead>
        <tbody>${assembly.attendance.map((a) => {
          const owner = unitOccupants(a.unitId).owner;
          return `<tr><td class="cell-main">${esc(unitLabel(a.unitId))}</td><td>${esc(owner ? fullName(owner) : '—')}</td><td class="num">${esc(int(unitTantiemes(a.unitId)))}</td><td>${statusBadge('attendance', a.status)}${a.proxyTo ? `<div class="cell-sub">${esc(t('assemblies.proxyTo'))}: ${esc(a.proxyTo)}</div>` : ''}</td>${editable ? `<td class="actions"><button type="button" class="icon-btn" data-act="att" data-unit="${esc(a.unitId)}" aria-label="${esc(t('common.edit'))}" title="${esc(t('common.edit'))}">${icon('edit')}</button></td>` : ''}</tr>`;
        }).join('')}</tbody>
      </table></div>`;
  } else if (tab === 'resolutions') {
    content = `
      ${editable ? `<div class="card-body" style="padding-bottom:0">${btn({ act: 'add-res', label: t('assemblies.addResolution'), icon: 'plus', variant: 'secondary', small: true })}</div>` : ''}
      ${assembly.resolutions.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th scope="col">${esc(t('assemblies.resolution'))}</th><th scope="col" class="num">${esc(t('assemblies.for'))}</th><th scope="col" class="num">${esc(t('assemblies.against'))}</th><th scope="col" class="num">${esc(t('assemblies.abstain'))}</th><th scope="col">${esc(t('assemblies.result'))}</th>${editable ? `<th scope="col" class="actions"><span class="sr-only">${esc(t('common.actions'))}</span></th>` : ''}</tr></thead>
        <tbody>${assembly.resolutions.map((r) => `<tr><td class="cell-main">${esc(r.title)}</td><td class="num">${esc(int(r.votesFor))}</td><td class="num">${esc(int(r.votesAgainst))}</td><td class="num">${esc(int(r.abstain))}</td><td>${statusBadge('resolutionResult', resolutionResult(r))}</td>${editable ? `<td class="actions"><button type="button" class="icon-btn" data-act="edit-res" data-id="${esc(r.id)}" aria-label="${esc(t('common.edit'))}">${icon('edit')}</button><button type="button" class="icon-btn danger" data-act="del-res" data-id="${esc(r.id)}" aria-label="${esc(t('common.delete'))}">${icon('trash')}</button></td>` : ''}</tr>`).join('')}</tbody>
      </table></div>
      <p class="note plain" style="margin:16px">${esc(t('assemblies.voteNote'))}</p>` : emptyState({ title: t('assemblies.noResolutions'), text: t('assemblies.noResolutionsText'), icon: 'landmark' })}`;
  } else {
    content = `<div class="card-body stack">
      ${assembly.minutes ? `<p style="white-space:pre-line">${esc(assembly.minutes)}</p>` : `<p class="muted">${esc(t('assemblies.noMinutes'))}</p>`}
      ${staff && open ? btn({ act: 'minutes', label: t('assemblies.editMinutes'), icon: 'edit', variant: 'secondary', small: true }) : ''}
    </div>`;
  }

  root.innerHTML = `
    ${pageHeader({ back: '#/assemblies', title: assembly.title, subtitle: `${residenceName(assembly.residenceId)} · ${tl('assemblyType', assembly.type)}`, actions })}
    <div class="row">${statusBadge('assemblyStatus', assembly.status)}${open ? `<span class="muted small">${esc(t('assemblies.quorum'))}: ${esc(pct(q.ratio))}</span>` : ''}</div>
    ${tabs([
      { id: 'agenda', label: t('assemblies.agenda'), href: base },
      { id: 'attendance', label: t('assemblies.attendance'), href: `${base}/attendance` },
      { id: 'resolutions', label: t('assemblies.resolutions'), href: `${base}/resolutions` },
      { id: 'minutes', label: t('assemblies.minutes'), href: `${base}/minutes` },
    ], tab)}
    <section class="card">${content}</section>`;

  on(root, 'click', '[data-act]', async (e, el) => {
    const act = el.dataset.act;
    const fresh = db.get('assemblies', id);
    if (act === 'edit') editAssembly(fresh);
    if (act === 'convene') convene(fresh);
    if (act === 'held') markHeld(fresh);
    if (act === 'cancel') cancelAssembly(fresh);
    if (act === 'delete') removeAssembly(fresh);
    if (act === 'print') printMinutes(fresh);
    if (act === 'minutes') editMinutes(fresh);
    if (act === 'add-res') editResolution(fresh);
    if (act === 'edit-res') editResolution(fresh, fresh.resolutions.find((r) => r.id === el.dataset.id));
    if (act === 'att') editAttendance(fresh, fresh.attendance.find((a) => a.unitId === el.dataset.unit));
    if (act === 'del-res') {
      const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: fresh.resolutions.find((r) => r.id === el.dataset.id).title }), confirmLabel: t('common.delete'), danger: true });
      if (!ok) return;
      db.update('assemblies', id, { resolutions: fresh.resolutions.filter((r) => r.id !== el.dataset.id) });
      bus.emit('refresh');
    }
  });
}

export function mount(root, { params }) {
  if (params[0]) {
    detail(root, params[0], params[1]);
    return;
  }
  const multi = activeResidenceIds().length > 1;
  const upcoming = visible().filter((a) => a.date >= todayIso() && (a.status === 'planned' || a.status === 'convened')).sort((a, b) => a.date.localeCompare(b.date))[0];

  root.innerHTML = `
    ${pageHeader({ title: t('nav.assemblies'), subtitle: t('assemblies.subtitle'), actions: can('assemblies', 'c') ? btn({ act: 'add', label: t('assemblies.add'), icon: 'plus' }) : '' })}
    ${upcoming ? `<div class="grid grid-kpi">${kpi({ label: t('assemblies.next'), value: date(upcoming.date), hint: upcoming.title, icon: 'landmark', tone: 'info' })}</div>` : ''}
    <div id="list"></div>`;
  on(root, 'click', '[data-act="add"]', () => editAssembly());

  listView(root.querySelector('#list'), {
    key: 'assemblies',
    exportName: 'assemblees',
    rows: () => visible().map((a) => ({ ...a, residence: residenceName(a.residenceId) })),
    defaultSort: { key: 'date', dir: 'desc' },
    searchText: (a) => `${a.title} ${a.residence} ${a.location}`,
    filters: [
      { key: 'status', label: t('common.status'), options: enumOptions('assemblyStatus', STATUSES), test: (a, v) => a.status === v },
      { key: 'type', label: t('common.type'), options: enumOptions('assemblyType', TYPES), test: (a, v) => a.type === v },
    ],
    columns: [
      { key: 'title', label: t('common.title'), render: (a) => twoLine(a.title, multi ? a.residence : a.location) },
      { key: 'type', label: t('common.type'), cls: 'hide-md', render: (a) => esc(tl('assemblyType', a.type)), csv: (a) => tl('assemblyType', a.type) },
      { key: 'date', label: t('common.date'), render: (a) => esc(`${date(a.date)} · ${a.time}`) },
      { key: 'status', label: t('common.status'), render: (a) => statusBadge('assemblyStatus', a.status), csv: (a) => tl('assemblyStatus', a.status) },
    ],
    rowActions: () => [{ id: 'view', icon: 'eye', label: t('common.view') }],
    onAction: (act, row) => { location.hash = `#/assemblies/${row.id}`; },
    onRowClick: (row) => { location.hash = `#/assemblies/${row.id}`; },
    empty: { title: t('assemblies.emptyTitle'), text: t('assemblies.emptyText'), icon: 'landmark' },
  });
}
