// Application shell: sidebar navigation, topbar, notifications, user menu.
import { esc, on } from '../core/dom.js';
import { t, tl, getLang, setLang } from '../core/i18n.js';
import { dateTime } from '../core/format.js';
import { currentUser, logout } from '../core/auth.js';
import { can, isResident, isStaff, myResidences, getResidenceFilter, setResidenceFilter } from '../core/permissions.js';
import { myNotifications, unreadCount, markAllRead } from '../core/notify.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { icon } from './icons.js';
import { avatar } from './kit.js';

const NAV = [
  { title: 'nav.group.general', items: [['dashboard', 'grid']] },
  { title: 'nav.group.property', items: [['residences', 'building'], ['units', 'door'], ['residents', 'users']] },
  { title: 'nav.group.finance', items: [['finance', 'wallet'], ['payments', 'card'], ['expenses', 'receipt']] },
  { title: 'nav.group.community', items: [['complaints', 'message'], ['maintenance', 'wrench'], ['announcements', 'megaphone'], ['documents', 'folder'], ['assemblies', 'landmark']] },
  { title: 'nav.group.partners', items: [['providers', 'briefcase']] },
  { title: 'nav.group.insight', items: [['reports', 'chart']] },
  { title: 'nav.group.admin', items: [['platform', 'globe'], ['users', 'user'], ['audit', 'shield'], ['settings', 'settings']] },
];

/** Navigation label, adapted to the reader ("Mes charges" for residents). */
export function navLabel(module) {
  const user = currentUser();
  if (isResident(user) && ['finance', 'payments', 'complaints'].includes(module)) return t(`nav.${module}.mine`);
  if (user && user.role === 'provider' && module === 'maintenance') return t('nav.maintenance.mine');
  return t(`nav.${module}`);
}

// ---- Theme ----------------------------------------------------------------
const THEME_KEY = 'syndicma.theme';

export function getTheme() {
  try {
    return localStorage.getItem(THEME_KEY) || 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme = getTheme()) {
  document.documentElement.dataset.theme = theme;
}

export function setTheme(theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* ignore */
  }
  applyTheme(theme);
}

// ---- Rendering ------------------------------------------------------------
function navHtml() {
  return NAV.map((group) => {
    const items = group.items.filter(([m]) => can(m));
    if (!items.length) return '';
    return `
      <div class="nav-group">
        <div class="nav-title">${esc(t(group.title))}</div>
        ${items.map(([m, ic]) => `<a class="nav-link" href="#/${m}" data-nav="${m}">${icon(ic)}<span>${esc(navLabel(m))}</span></a>`).join('')}
      </div>`;
  }).join('');
}

function notifHtml() {
  const user = currentUser();
  const list = myNotifications().slice(0, 12);
  if (!list.length) return `<div class="empty" style="padding:32px 16px">${icon('bell')}<p>${esc(t('notif.empty'))}</p></div>`;
  return `<div class="notif-list">${list.map((n) => `
    <a class="notif-item ${n.readBy.includes(user.id) ? '' : 'unread'}" href="${esc(n.link || '#/dashboard')}">
      ${esc(t(n.key, n.params))}
      <time datetime="${esc(n.at)}">${esc(dateTime(n.at))}</time>
    </a>`).join('')}</div>`;
}

function closeDropdowns(root, except) {
  root.querySelectorAll('.dropdown-panel').forEach((p) => {
    if (p !== except) {
      p.hidden = true;
      const trigger = root.querySelector(`[aria-controls="${p.id}"]`);
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    }
  });
}

let docBound = false;

export function mountShell(app) {
  const user = currentUser();
  const org = user.orgId ? db.get('organizations', user.orgId) : null;
  const residences = myResidences();
  const showFilter = isStaff(user) && residences.length > 1;
  const filter = getResidenceFilter();
  const lang = getLang();
  const dark = getTheme() === 'dark';

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar" id="sidebar" aria-label="${esc(t('nav.main'))}">
        <a class="brand" href="#/dashboard">
          <span class="brand-mark">${icon('logoMark')}</span>
          <span>Syndic<small>.ma</small></span>
        </a>
        <nav class="nav">${navHtml()}</nav>
        <div class="sidebar-foot">
          <span class="demo-pill">${icon('info', { cls: '' })}${esc(t('shell.demo'))}</span>
          <div style="margin-top:8px">${esc(org ? org.name : t('shell.platform'))}</div>
        </div>
      </aside>
      <button type="button" class="scrim" data-act="nav-close" aria-label="${esc(t('common.close'))}"></button>
      <div class="main">
        <div class="sim-banner" role="note">${icon('info')}<span>${esc(t('shell.simBanner'))}</span></div>
        <header class="topbar">
          <button type="button" class="icon-btn menu-toggle" data-act="nav-toggle" aria-label="${esc(t('nav.open'))}" aria-controls="sidebar" aria-expanded="false">${icon('menu')}</button>
          ${showFilter ? `
            <label class="sr-only" for="residence-filter">${esc(t('shell.residenceFilter'))}</label>
            <select class="select" id="residence-filter">
              <option value="">${esc(t('shell.allResidences'))}</option>
              ${residences.map((r) => `<option value="${esc(r.id)}" ${filter === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}
            </select>` : ''}
          <span class="spacer"></span>
          <div class="lang-switch" role="group" aria-label="${esc(t('shell.language'))}">
            <button type="button" data-lang="fr" lang="fr" aria-pressed="${lang === 'fr'}">FR</button>
            <button type="button" data-lang="ar" lang="ar" aria-pressed="${lang === 'ar'}">ع</button>
          </div>
          <button type="button" class="icon-btn theme-btn" data-act="theme" aria-label="${esc(t(dark ? 'shell.lightMode' : 'shell.darkMode'))}" title="${esc(t(dark ? 'shell.lightMode' : 'shell.darkMode'))}">${icon(dark ? 'sun' : 'moon')}</button>
          <div class="dropdown">
            <button type="button" class="icon-btn notif-btn" data-drop="notif-panel" aria-controls="notif-panel" aria-expanded="false" aria-label="${esc(t('notif.title'))}">
              ${icon('bell')}<span class="notif-dot" hidden></span>
            </button>
            <div class="dropdown-panel" id="notif-panel" hidden>
              <div class="card-head"><h3>${esc(t('notif.title'))}</h3><button type="button" class="btn btn-ghost btn-sm" data-act="notif-read">${esc(t('notif.markRead'))}</button></div>
              <div id="notif-body"></div>
            </div>
          </div>
          <div class="dropdown">
            <button type="button" class="user-btn" data-drop="user-panel" aria-controls="user-panel" aria-expanded="false" aria-label="${esc(t('shell.userMenu'))}">
              ${avatar(user.name)}
              <span class="user-meta"><strong>${esc(user.name)}</strong><span>${esc(tl('role', user.role))}</span></span>
              ${icon('chevronDown')}
            </button>
            <div class="dropdown-panel" id="user-panel" hidden style="width:240px">
              <div style="padding:12px 16px;border-bottom:1px solid var(--border)">
                <strong>${esc(user.name)}</strong>
                <div class="small muted" dir="ltr" style="text-align:start">${esc(user.email)}</div>
              </div>
              <a class="menu-item" href="#/settings">${icon('settings')}${esc(t('nav.settings'))}</a>
              <button type="button" class="menu-item" data-act="logout">${icon('logout', { cls: 'flip' })}${esc(t('shell.logout'))}</button>
            </div>
          </div>
        </header>
        <main class="view" id="view" tabindex="-1"></main>
      </div>
    </div>`;

  const shell = app.querySelector('.shell');
  const toggle = shell.querySelector('.menu-toggle');
  const setNav = (open) => {
    shell.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
  };

  on(shell, 'click', '[data-act="nav-toggle"]', () => setNav(!shell.classList.contains('nav-open')));
  on(shell, 'click', '[data-act="nav-close"]', () => setNav(false));
  on(shell, 'click', '.nav-link', () => setNav(false));

  on(shell, 'click', '[data-lang]', (e, el) => {
    if (el.dataset.lang === getLang()) return;
    setLang(el.dataset.lang);
    bus.emit('shell');
  });
  on(shell, 'click', '[data-act="theme"]', () => {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
    bus.emit('shell');
  });
  on(shell, 'click', '[data-act="logout"]', () => {
    logout();
    location.hash = '#/login';
    bus.emit('shell');
  });

  on(shell, 'click', '[data-drop]', (e, el) => {
    e.stopPropagation();
    const panel = shell.querySelector(`#${el.dataset.drop}`);
    const open = panel.hidden;
    closeDropdowns(shell, panel);
    panel.hidden = !open;
    el.setAttribute('aria-expanded', String(open));
    if (open && panel.id === 'notif-panel') shell.querySelector('#notif-body').innerHTML = notifHtml();
  });
  on(shell, 'click', '.dropdown-panel a', () => closeDropdowns(shell));
  on(shell, 'click', '[data-act="notif-read"]', () => {
    markAllRead();
    shell.querySelector('#notif-body').innerHTML = notifHtml();
    refreshBadge();
  });

  const select = shell.querySelector('#residence-filter');
  if (select) {
    select.addEventListener('change', () => {
      setResidenceFilter(select.value);
      bus.emit('refresh');
    });
  }

  if (!docBound) {
    docBound = true;
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.dropdown')) closeDropdowns(document);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      closeDropdowns(document);
      const open = document.querySelector('.shell.nav-open');
      if (open) {
        open.classList.remove('nav-open');
        const btn = open.querySelector('.menu-toggle');
        if (btn) {
          btn.setAttribute('aria-expanded', 'false');
          btn.focus();
        }
      }
    });
  }

  refreshBadge();
  return shell.querySelector('#view');
}

export function refreshBadge() {
  const dot = document.querySelector('.notif-dot');
  if (!dot) return;
  const n = unreadCount();
  dot.hidden = n === 0;
  dot.textContent = n > 9 ? '9+' : String(n);
}

export function setActiveNav(module) {
  document.querySelectorAll('.nav-link').forEach((a) => {
    if (a.dataset.nav === module) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  refreshBadge();
}
