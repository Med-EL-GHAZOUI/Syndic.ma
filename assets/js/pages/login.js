// Login screen (SIMULATED authentication — see core/auth.js).
import { esc, on } from '../core/dom.js';
import { t, tl, getLang, setLang } from '../core/i18n.js';
import { login } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { DEMO_PASSWORD } from '../data/seed.js';
import { icon } from '../ui/icons.js';
import { openForm } from '../ui/form.js';
import { toast } from '../ui/toast.js';

const DEMO_ACCOUNTS = [
  'admin@demo.syndic.ma', 'gestion@demo.syndic.ma', 'compta@demo.syndic.ma', 'proprio@demo.syndic.ma',
  'locataire@demo.syndic.ma', 'prestataire@demo.syndic.ma', 'super@demo.syndic.ma', 'admin.rif@demo.syndic.ma',
];

export function mountLogin(app) {
  const lang = getLang();
  const accounts = DEMO_ACCOUNTS.map((email) => db.all('users').find((u) => u.email === email)).filter(Boolean);

  app.innerHTML = `
    <div class="login">
      <aside class="login-aside">
        <a class="brand" href="index.html" style="padding:0;height:auto">
          <span class="brand-mark">${icon('logoMark')}</span><span>Syndic<small>.ma</small></span>
        </a>
        <div class="stack">
          <h1>${esc(t('login.asideTitle'))}</h1>
          <p>${esc(t('login.asideText'))}</p>
        </div>
        <ul class="login-points">
          <li>${icon('check')}<span>${esc(t('login.point1'))}</span></li>
          <li>${icon('check')}<span>${esc(t('login.point2'))}</span></li>
          <li>${icon('check')}<span>${esc(t('login.point3'))}</span></li>
        </ul>
      </aside>
      <main class="login-main" id="view">
        <div class="login-box">
          <div class="login-top">
            <a class="back-link" href="index.html">${icon('chevronLeft', { cls: 'flip' })}${esc(t('login.backHome'))}</a>
            <div class="lang-switch" role="group" aria-label="${esc(t('shell.language'))}">
              <button type="button" data-lang="fr" lang="fr" aria-pressed="${lang === 'fr'}">FR</button>
              <button type="button" data-lang="ar" lang="ar" aria-pressed="${lang === 'ar'}">ع</button>
            </div>
          </div>
          <div>
            <h1 style="font-size:var(--fs-xl)">${esc(t('login.title'))}</h1>
            <p class="muted">${esc(t('login.subtitle'))}</p>
          </div>
          <form id="login-form" class="stack" novalidate>
            <div class="form-alert" id="login-error" role="alert" hidden></div>
            <div class="field">
              <label for="email">${esc(t('login.email'))}</label>
              <input class="input" id="email" name="email" type="email" dir="ltr" autocomplete="username" required>
            </div>
            <div class="field">
              <div class="row between">
                <label for="password">${esc(t('login.password'))}</label>
                <button type="button" class="btn btn-ghost btn-sm" data-act="forgot">${esc(t('login.forgot'))}</button>
              </div>
              <input class="input" id="password" name="password" type="password" dir="ltr" autocomplete="current-password" required>
            </div>
            <button type="submit" class="btn btn-primary btn-lg btn-block">${esc(t('login.submit'))}</button>
          </form>
          <div class="divider">${esc(t('login.demoTitle'))}</div>
          <div class="demo-accounts">
            ${accounts.map((u) => `
              <button type="button" class="demo-account" data-demo="${esc(u.email)}">
                <strong>${esc(u.orgId === 'org_rif' ? t('login.otherOrg') : tl('role', u.role))}</strong>
                <span dir="ltr">${esc(u.email)}</span>
              </button>`).join('')}
          </div>
          <p class="note warn">${icon('info', { cls: '' })} ${esc(t('login.simNote', { password: DEMO_PASSWORD }))}</p>
        </div>
      </main>
    </div>`;

  const form = app.querySelector('#login-form');
  const error = app.querySelector('#login-error');

  function attempt(email, password) {
    const result = login(email, password);
    if (!result.ok) {
      error.textContent = t(result.error);
      error.hidden = false;
      form.elements.email.focus();
      return;
    }
    location.hash = '#/dashboard';
    bus.emit('shell');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;
    if (!email || !password) {
      error.textContent = t('login.required');
      error.hidden = false;
      (email ? form.elements.password : form.elements.email).focus();
      return;
    }
    attempt(email, password);
  });

  on(app, 'click', '[data-demo]', (e, el) => attempt(el.dataset.demo, DEMO_PASSWORD));
  on(app, 'click', '[data-lang]', (e, el) => {
    if (el.dataset.lang === getLang()) return;
    setLang(el.dataset.lang);
    bus.emit('shell');
  });
  on(app, 'click', '[data-act="forgot"]', () => {
    openForm({
      title: t('login.forgotTitle'),
      size: 'sm',
      intro: esc(t('login.forgotText')),
      submitLabel: t('common.send'),
      fields: [{ name: 'email', label: t('login.email'), type: 'email', required: true, full: true }],
      onSubmit: () => {
        toast(t('login.forgotSent'), 'info');
      },
    });
  });
}
