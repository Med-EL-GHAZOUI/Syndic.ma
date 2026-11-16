// Application bootstrap + hash router.
import { esc } from './core/dom.js';
import { t, applyLang } from './core/i18n.js';
import { currentUser } from './core/auth.js';
import { can } from './core/permissions.js';
import { db } from './core/store.js';
import { bus } from './core/bus.js';
import { mountShell, setActiveNav, applyTheme, navLabel } from './ui/shell.js';
import { icon } from './ui/icons.js';
import { toast } from './ui/toast.js';
import { mountLogin } from './pages/login.js';
import * as dashboard from './pages/dashboard.js';
import * as residences from './pages/residences.js';
import * as units from './pages/units.js';
import * as residents from './pages/residents.js';
import * as finance from './pages/finance.js';
import * as payments from './pages/payments.js';
import * as expenses from './pages/expenses.js';
import * as complaints from './pages/complaints.js';
import * as maintenance from './pages/maintenance.js';
import * as announcements from './pages/announcements.js';
import * as documents from './pages/documents.js';
import * as assemblies from './pages/assemblies.js';
import * as providers from './pages/providers.js';
import * as reports from './pages/reports.js';
import * as users from './pages/users.js';
import * as audit from './pages/audit.js';
import * as platform from './pages/platform.js';
import * as settings from './pages/settings.js';

// Route name === permission module name.
const ROUTES = {
  dashboard, residences, units, residents, finance, payments, expenses, complaints, maintenance,
  announcements, documents, assemblies, providers, reports, users, audit, platform, settings,
};

const app = document.getElementById('app');
let view = null;
let shellFor = null;
let lastRoute = '';

function parseHash() {
  const [name = '', ...params] = location.hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
  return { name, params: params.filter(Boolean) };
}

function statePanel({ ic, title, text, action = '' }) {
  return `<div class="card"><div class="empty">${icon(ic)}<h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div></div>`;
}

const dashboardLink = () => `<a class="btn btn-primary btn-sm" href="#/dashboard">${esc(t('common.backDashboard'))}</a>`;

function render() {
  const user = currentUser();
  const { name, params } = parseHash();

  if (!user) {
    view = null;
    shellFor = null;
    if (name !== 'login') {
      location.replace('#/login');
      return;
    }
    document.title = `${t('login.submit')} — Syndic.ma`;
    mountLogin(app);
    return;
  }

  if (!name || name === 'login') {
    location.replace('#/dashboard');
    return;
  }

  if (!view || shellFor !== user.id) {
    view = mountShell(app);
    shellFor = user.id;
  }

  const page = ROUTES[name];
  const root = document.createElement('div');
  root.className = 'page';
  view.replaceChildren(root);
  setActiveNav(name);

  if (!page) {
    document.title = 'Syndic.ma';
    root.innerHTML = statePanel({ ic: 'search', title: t('error.notFoundTitle'), text: t('error.notFoundText'), action: dashboardLink() });
  } else if (!can(name)) {
    document.title = 'Syndic.ma';
    root.innerHTML = statePanel({ ic: 'lock', title: t('error.forbiddenTitle'), text: t('error.forbiddenText'), action: dashboardLink() });
  } else {
    document.title = `${navLabel(name)} — Syndic.ma`;
    try {
      page.mount(root, { params });
    } catch (err) {
      console.error(err);
      root.innerHTML = statePanel({
        ic: 'alert', title: t('error.crashTitle'), text: t('error.crashText'),
        action: `<button type="button" class="btn btn-primary btn-sm" id="retry">${esc(t('common.retry'))}</button>`,
      });
      root.querySelector('#retry').addEventListener('click', render);
    }
  }

  if (lastRoute !== location.hash) {
    window.scrollTo(0, 0);
    if (lastRoute) view.focus({ preventScroll: true });
    lastRoute = location.hash;
  }
}

applyLang();
applyTheme();

window.addEventListener('hashchange', render);
bus.on('refresh', render);
bus.on('shell', () => {
  view = null;
  render();
});

render();

if (db.isMemoryOnly()) toast(t('shell.memoryOnly'), 'info', 8000);
