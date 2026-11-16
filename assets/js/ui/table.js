// Generic list view: search, filters, sorting, pagination, CSV export.
import { esc, on, debounce, normalize, download, toCsv } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';

// View state survives re-renders (after a CRUD action) for the session.
const states = new Map();

const valueOf = (col, row) => (col.value ? col.value(row) : row[col.key]);

function compare(a, b) {
  if (a === b) return 0;
  if (a === null || a === undefined || a === '') return 1;
  if (b === null || b === undefined || b === '') return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * @param {HTMLElement} root
 * @param {object} cfg
 *  key          unique id for remembered state
 *  rows         () => array of rows (each with an id)
 *  columns      [{ key, label, value?, render?, sortable?, cls?, csv? }]
 *  filters      [{ key, label, options:[{value,label}], test:(row,value)=>bool }]
 *  rowActions   (row) => [{ id, icon, label, danger? }]
 *  onAction     (actionId, row) => void
 *  onRowClick   (row) => void
 *  empty        { title, text, icon }
 */
export function listView(root, cfg) {
  const st = states.get(cfg.key) || { q: '', filters: {}, sort: cfg.defaultSort || null, page: 1, size: cfg.pageSize || 10 };
  states.set(cfg.key, st);
  const cols = cfg.columns;
  const filters = cfg.filters || [];
  const hasActions = !!cfg.rowActions;

  root.innerHTML = `
    <div class="card lv">
      <div class="lv-toolbar">
        ${cfg.search === false ? '' : `
        <div class="search">
          ${icon('search')}
          <label class="sr-only" for="q-${cfg.key}">${esc(t('common.search'))}</label>
          <input class="input" type="search" id="q-${cfg.key}" placeholder="${esc(cfg.searchPlaceholder || t('common.search'))}" value="${esc(st.q)}" autocomplete="off">
        </div>`}
        ${filters.map((f) => `
          <label class="sr-only" for="flt-${cfg.key}-${f.key}">${esc(f.label)}</label>
          <select class="select" id="flt-${cfg.key}-${f.key}" data-filter="${f.key}">
            <option value="">${esc(f.label)}</option>
            ${f.options.map((o) => `<option value="${esc(o.value)}" ${st.filters[f.key] === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}
          </select>`).join('')}
        <span class="lv-count" aria-live="polite"></span>
        ${cfg.exportName ? `<button type="button" class="btn btn-secondary btn-sm" data-export>${icon('download')}<span>${esc(t('common.export'))}</span></button>` : ''}
      </div>
      <div class="lv-body"></div>
    </div>`;

  const body = root.querySelector('.lv-body');
  const count = root.querySelector('.lv-count');
  let current = [];

  function compute() {
    let rows = cfg.rows();
    const total = rows.length;
    const q = normalize(st.q.trim());
    if (q) {
      rows = rows.filter((row) => {
        const text = cfg.searchText ? cfg.searchText(row) : cols.map((c) => valueOf(c, row)).join(' ');
        return normalize(text).includes(q);
      });
    }
    for (const f of filters) {
      const v = st.filters[f.key];
      if (v) rows = rows.filter((row) => f.test(row, v));
    }
    if (st.sort) {
      const col = cols.find((c) => c.key === st.sort.key);
      if (col) {
        const dir = st.sort.dir === 'desc' ? -1 : 1;
        rows = [...rows].sort((a, b) => dir * compare(valueOf(col, a), valueOf(col, b)));
      }
    }
    return { rows, total };
  }

  function draw() {
    const { rows, total } = compute();
    current = rows;
    const pages = Math.max(1, Math.ceil(rows.length / st.size));
    if (st.page > pages) st.page = pages;
    const start = (st.page - 1) * st.size;
    const pageRows = rows.slice(start, start + st.size);
    count.textContent = t('common.results', { n: rows.length });

    if (!total) {
      const e = cfg.empty || {};
      body.innerHTML = `<div class="empty">${icon(e.icon || 'inbox')}<h3>${esc(e.title || t('common.emptyTitle'))}</h3><p>${esc(e.text || t('common.emptyText'))}</p></div>`;
      return;
    }
    if (!rows.length) {
      body.innerHTML = `<div class="empty">${icon('search')}<h3>${esc(t('common.noResults'))}</h3><p>${esc(t('common.noResultsText'))}</p>
        <button type="button" class="btn btn-secondary btn-sm" data-reset>${esc(t('common.resetFilters'))}</button></div>`;
      return;
    }

    const head = cols.map((c) => {
      const sorted = st.sort && st.sort.key === c.key ? st.sort.dir : '';
      const aria = sorted ? `aria-sort="${sorted === 'asc' ? 'ascending' : 'descending'}"` : '';
      const inner = c.sortable === false
        ? esc(c.label)
        : `<button type="button" class="sort-btn" data-sort="${c.key}" ${sorted ? `data-dir="${sorted}"` : ''}>${esc(c.label)}${icon(sorted === 'asc' ? 'sortUp' : sorted === 'desc' ? 'sortDown' : 'sort')}</button>`;
      return `<th scope="col" class="${c.cls || ''}" ${aria}>${inner}</th>`;
    }).join('');

    const trs = pageRows.map((row) => {
      const tds = cols.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(row) : esc(valueOf(c, row) ?? '—')}</td>`).join('');
      const actions = hasActions
        ? `<td class="actions">${cfg.rowActions(row).map((a) => `<button type="button" class="icon-btn ${a.danger ? 'danger' : ''}" data-act="${a.id}" data-id="${esc(row.id)}" title="${esc(a.label)}" aria-label="${esc(a.label)}">${icon(a.icon)}</button>`).join('')}</td>`
        : '';
      return `<tr data-row="${esc(row.id)}" class="${cfg.onRowClick ? 'clickable' : ''}">${tds}${actions}</tr>`;
    }).join('');

    body.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${head}${hasActions ? `<th scope="col" class="actions"><span class="sr-only">${esc(t('common.actions'))}</span></th>` : ''}</tr></thead>
          <tbody>${trs}</tbody>
        </table>
      </div>
      <div class="pagination">
        <span>${esc(t('common.range', { from: start + 1, to: start + pageRows.length, total: rows.length }))}</span>
        <div class="pages">
          <label class="sr-only" for="size-${cfg.key}">${esc(t('common.perPage'))}</label>
          <select class="select" id="size-${cfg.key}" data-size>
            ${[10, 25, 50].map((n) => `<option value="${n}" ${st.size === n ? 'selected' : ''}>${n} ${esc(t('common.perPageShort'))}</option>`).join('')}
          </select>
          <button type="button" class="icon-btn" data-page="prev" ${st.page <= 1 ? 'disabled' : ''} aria-label="${esc(t('common.prev'))}">${icon('chevronLeft', { cls: 'flip' })}</button>
          <span class="num">${st.page} / ${pages}</span>
          <button type="button" class="icon-btn" data-page="next" ${st.page >= pages ? 'disabled' : ''} aria-label="${esc(t('common.next'))}">${icon('chevronRight', { cls: 'flip' })}</button>
        </div>
      </div>`;
  }

  const search = root.querySelector('input[type=search]');
  if (search) {
    search.addEventListener('input', debounce(() => {
      st.q = search.value;
      st.page = 1;
      draw();
    }));
  }

  on(root, 'change', '[data-filter]', (e, el) => {
    st.filters[el.dataset.filter] = el.value;
    st.page = 1;
    draw();
  });
  on(root, 'change', '[data-size]', (e, el) => {
    st.size = Number(el.value);
    st.page = 1;
    draw();
  });
  on(root, 'click', '[data-sort]', (e, el) => {
    const key = el.dataset.sort;
    st.sort = st.sort && st.sort.key === key && st.sort.dir === 'asc' ? { key, dir: 'desc' } : { key, dir: 'asc' };
    draw();
    const again = root.querySelector(`[data-sort="${key}"]`);
    if (again) again.focus();
  });
  on(root, 'click', '[data-page]', (e, el) => {
    st.page += el.dataset.page === 'next' ? 1 : -1;
    draw();
  });
  on(root, 'click', '[data-reset]', () => {
    st.q = '';
    st.filters = {};
    st.page = 1;
    if (search) search.value = '';
    root.querySelectorAll('[data-filter]').forEach((s) => { s.value = ''; });
    draw();
  });
  on(root, 'click', '[data-export]', () => {
    const exportable = cols.filter((c) => c.csv !== false);
    const csv = toCsv(exportable.map((c) => c.label), current.map((row) => exportable.map((c) => (c.csv ? c.csv(row) : valueOf(c, row)))));
    download(`${cfg.exportName}.csv`, csv, 'text/csv;charset=utf-8');
  });
  on(body, 'click', '[data-act]', (e, el) => {
    e.stopPropagation();
    const row = current.find((r) => String(r.id) === el.dataset.id);
    if (row && cfg.onAction) cfg.onAction(el.dataset.act, row);
  });
  if (cfg.onRowClick) {
    on(body, 'click', 'tr[data-row]', (e, el) => {
      if (e.target.closest('button, a, input, select')) return;
      const row = current.find((r) => String(r.id) === el.dataset.row);
      if (row) cfg.onRowClick(row);
    });
  }

  draw();
  return { refresh: draw };
}
