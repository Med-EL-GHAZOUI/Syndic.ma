// Announcements published to residents (card layout).
import { esc, on, debounce, normalize } from '../core/dom.js';
import { t, tl, enumOptions } from '../core/i18n.js';
import { date } from '../core/format.js';
import { currentUser } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can, isResident, inScope, residenceOptions, activeResidenceIds, myResidences } from '../core/permissions.js';
import { notify } from '../core/notify.js';
import { pageHeader, btn, statusBadge, badge, residenceName, emptyState } from '../ui/kit.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

const CATEGORIES = ['info', 'works', 'meeting', 'urgent'];
const AUDIENCES = ['all', 'owners', 'staff'];
const TARGET_ROLES = { all: ['owner', 'tenant'], owners: ['owner'], staff: ['syndic_admin', 'manager', 'accountant'] };
const PAGE = 6;

const state = { q: '', category: '', page: 1 };

/** Announcements the current user may read, pinned first then newest. */
export function visibleAnnouncements() {
  const user = currentUser();
  let list;
  if (isResident(user)) {
    const ids = new Set(myResidences().map((r) => r.id));
    const allowed = user.role === 'owner' ? ['all', 'owners'] : ['all'];
    list = db.all('announcements').filter((a) => ids.has(a.residenceId) && allowed.includes(a.audience));
  } else {
    list = inScope('announcements');
  }
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.publishedAt.localeCompare(a.publishedAt));
}

function edit(announcement) {
  const ids = activeResidenceIds();
  const user = currentUser();
  openForm({
    title: announcement ? t('announcements.edit') : t('announcements.add'),
    submitLabel: announcement ? t('common.save') : t('announcements.publish'),
    values: announcement || { residenceId: ids.length === 1 ? ids[0] : '', category: 'info', audience: 'all', pinned: false },
    fields: [
      { name: 'residenceId', label: t('common.residence'), type: 'select', required: true, full: true, options: residenceOptions() },
      { name: 'title', label: t('common.title'), required: true, full: true, maxLength: 120 },
      { name: 'category', label: t('common.category'), type: 'select', required: true, placeholder: false, options: enumOptions('announcementCategory', CATEGORIES) },
      { name: 'audience', label: t('announcements.audience'), type: 'select', required: true, placeholder: false, options: enumOptions('audience', AUDIENCES) },
      { name: 'body', label: t('announcements.body'), type: 'textarea', rows: 6, required: true, full: true, maxLength: 2000 },
      { name: 'pinned', label: t('announcements.pin'), type: 'checkbox', full: true },
    ],
    onSubmit: (v) => {
      const data = { residenceId: v.residenceId, title: v.title, category: v.category, audience: v.audience, body: v.body, pinned: v.pinned };
      if (announcement) db.update('announcements', announcement.id, data);
      else {
        db.insert('announcements', { ...data, publishedAt: new Date().toISOString(), authorName: user.name });
        notify({ toRoles: TARGET_ROLES[v.audience], residenceId: v.residenceId, key: 'notif.announcement', params: { title: v.title }, link: '#/announcements' });
      }
      toast(t(announcement ? 'common.saved' : 'announcements.published'));
      bus.emit('refresh');
    },
  });
}

export function mount(root) {
  const staff = !isResident();
  const multi = activeResidenceIds().length > 1;

  root.innerHTML = `
    ${pageHeader({ title: t('nav.announcements'), subtitle: t(staff ? 'announcements.subtitle' : 'announcements.subtitleMine'), actions: can('announcements', 'c') ? btn({ act: 'add', label: t('announcements.add'), icon: 'plus' }) : '' })}
    <div class="card">
      <div class="lv-toolbar">
        <div class="search">${icon('search')}<label class="sr-only" for="ann-q">${esc(t('common.search'))}</label><input class="input" type="search" id="ann-q" placeholder="${esc(t('common.search'))}" value="${esc(state.q)}"></div>
        <label class="sr-only" for="ann-cat">${esc(t('common.category'))}</label>
        <select class="select" id="ann-cat"><option value="">${esc(t('common.category'))}</option>${CATEGORIES.map((c) => `<option value="${c}" ${state.category === c ? 'selected' : ''}>${esc(tl('announcementCategory', c))}</option>`).join('')}</select>
        <span class="lv-count" id="ann-count" aria-live="polite"></span>
      </div>
    </div>
    <div class="stack" id="ann-list"></div>`;

  const listEl = root.querySelector('#ann-list');

  function draw() {
    const q = normalize(state.q.trim());
    const all = visibleAnnouncements();
    const rows = all.filter((a) => (!state.category || a.category === state.category) && (!q || normalize(`${a.title} ${a.body}`).includes(q)));
    root.querySelector('#ann-count').textContent = t('common.results', { n: rows.length });
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (state.page > pages) state.page = pages;
    const slice = rows.slice((state.page - 1) * PAGE, state.page * PAGE);

    if (!rows.length) {
      listEl.innerHTML = `<div class="card">${emptyState(all.length ? { title: t('common.noResults'), text: t('common.noResultsText'), icon: 'search' } : { title: t('announcements.empty'), text: t('announcements.emptyText'), icon: 'megaphone' })}</div>`;
      return;
    }
    listEl.innerHTML = `
      ${slice.map((a) => `
        <article class="card ann-card ${a.pinned ? 'pinned' : ''}">
          <div class="row between">
            <h3>${a.pinned ? `${icon('pin', { label: t('announcements.pinned') })} ` : ''}${esc(a.title)}</h3>
            ${staff ? `<div class="row" style="gap:0">
              ${can('announcements', 'e') ? `<button type="button" class="icon-btn" data-act="pin" data-id="${esc(a.id)}" aria-label="${esc(t(a.pinned ? 'announcements.unpin' : 'announcements.pin'))}" title="${esc(t(a.pinned ? 'announcements.unpin' : 'announcements.pin'))}">${icon('pin')}</button>
              <button type="button" class="icon-btn" data-act="edit" data-id="${esc(a.id)}" aria-label="${esc(t('common.edit'))}" title="${esc(t('common.edit'))}">${icon('edit')}</button>` : ''}
              ${can('announcements', 'd') ? `<button type="button" class="icon-btn danger" data-act="delete" data-id="${esc(a.id)}" aria-label="${esc(t('common.delete'))}" title="${esc(t('common.delete'))}">${icon('trash')}</button>` : ''}
            </div>` : ''}
          </div>
          <div class="meta">
            ${statusBadge('announcementCategory', a.category)}
            ${staff ? badge(tl('audience', a.audience)) : ''}
            <span>${esc(date(a.publishedAt))}</span>
            <span>${esc(a.authorName)}</span>
            ${multi ? `<span>${esc(residenceName(a.residenceId))}</span>` : ''}
          </div>
          <p>${esc(a.body)}</p>
        </article>`).join('')}
      ${pages > 1 ? `
        <div class="card pagination" style="border-top:0">
          <span>${esc(t('common.range', { from: (state.page - 1) * PAGE + 1, to: (state.page - 1) * PAGE + slice.length, total: rows.length }))}</span>
          <div class="pages">
            <button type="button" class="icon-btn" data-act="prev" ${state.page <= 1 ? 'disabled' : ''} aria-label="${esc(t('common.prev'))}">${icon('chevronLeft', { cls: 'flip' })}</button>
            <span class="num">${state.page} / ${pages}</span>
            <button type="button" class="icon-btn" data-act="next" ${state.page >= pages ? 'disabled' : ''} aria-label="${esc(t('common.next'))}">${icon('chevronRight', { cls: 'flip' })}</button>
          </div>
        </div>` : ''}`;
  }

  const search = root.querySelector('#ann-q');
  search.addEventListener('input', debounce(() => {
    state.q = search.value;
    state.page = 1;
    draw();
  }));
  root.querySelector('#ann-cat').addEventListener('change', (e) => {
    state.category = e.target.value;
    state.page = 1;
    draw();
  });

  on(root, 'click', '[data-act]', async (e, el) => {
    const act = el.dataset.act;
    const item = el.dataset.id ? db.get('announcements', el.dataset.id) : null;
    if (act === 'add') edit();
    if (act === 'edit') edit(item);
    if (act === 'prev' || act === 'next') {
      state.page += act === 'next' ? 1 : -1;
      draw();
    }
    if (act === 'pin') {
      db.update('announcements', item.id, { pinned: !item.pinned });
      bus.emit('refresh');
    }
    if (act === 'delete') {
      const ok = await confirmDialog({ title: t('common.delete'), message: t('common.confirmDelete', { name: item.title }), confirmLabel: t('common.delete'), danger: true });
      if (!ok) return;
      db.remove('announcements', item.id);
      toast(t('common.deleted'));
      bus.emit('refresh');
    }
  });

  draw();
}
