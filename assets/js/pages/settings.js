// Settings: profile, preferences, organization (staff) and demo data tools.
import { esc, on, download } from '../core/dom.js';
import { t, tl, getLang, setLang } from '../core/i18n.js';
import { currentUser, logout } from '../core/auth.js';
import { db } from '../core/store.js';
import { bus } from '../core/bus.js';
import { can } from '../core/permissions.js';
import { getTheme, setTheme } from '../ui/shell.js';
import { pageHeader, dl } from '../ui/kit.js';
import { openForm } from '../ui/form.js';
import { confirmDialog } from '../ui/modal.js';
import { toast } from '../ui/toast.js';
import { icon } from '../ui/icons.js';

function editProfile() {
  const me = currentUser();
  openForm({
    title: t('settings.editProfile'),
    values: me,
    fields: [
      { name: 'name', label: t('common.name'), required: true, full: true, maxLength: 80 },
      { name: 'phone', label: t('common.phone'), type: 'tel', full: true },
    ],
    onSubmit: (v) => {
      db.update('users', me.id, { name: v.name, phone: v.phone });
      toast(t('common.saved'));
      bus.emit('shell');
    },
  });
}

function editOrg(org) {
  openForm({
    title: t('settings.editOrg'),
    values: org,
    fields: [
      { name: 'name', label: t('platform.company'), required: true, full: true, maxLength: 80 },
      { name: 'city', label: t('common.city'), required: true },
      { name: 'contactName', label: t('providers.contact'), required: true },
      { name: 'email', label: t('common.email'), type: 'email', required: true },
      { name: 'phone', label: t('common.phone'), type: 'tel' },
    ],
    onSubmit: (v) => {
      db.update('organizations', org.id, { name: v.name, city: v.city, contactName: v.contactName, email: v.email, phone: v.phone });
      toast(t('common.saved'));
      bus.emit('shell');
    },
  });
}

export function mount(root) {
  const me = currentUser();
  const org = me.orgId ? db.get('organizations', me.orgId) : null;
  const lang = getLang();
  const dark = getTheme() === 'dark';

  root.innerHTML = `
    ${pageHeader({ title: t('nav.settings'), subtitle: t('settings.subtitle') })}
    <div class="grid grid-2">
      <section class="card">
        <div class="card-head"><h2>${esc(t('settings.profile'))}</h2><button type="button" class="btn btn-secondary btn-sm" data-act="profile">${icon('edit')}<span>${esc(t('common.edit'))}</span></button></div>
        <div class="card-body">${dl([
          [t('common.name'), esc(me.name)],
          [t('common.email'), `<span dir="ltr">${esc(me.email)}</span>`],
          [t('common.phone'), `<span dir="ltr">${esc(me.phone || '—')}</span>`],
          [t('users.role'), esc(tl('role', me.role))],
        ])}</div>
      </section>
      <section class="card">
        <div class="card-head"><h2>${esc(t('settings.preferences'))}</h2></div>
        <div class="card-body stack">
          <div class="field"><label for="set-lang">${esc(t('shell.language'))}</label>
            <select class="select" id="set-lang"><option value="fr" ${lang === 'fr' ? 'selected' : ''}>Français</option><option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option></select></div>
          <label class="check"><input type="checkbox" id="set-dark" ${dark ? 'checked' : ''}> ${esc(t('shell.darkMode'))}</label>
        </div>
      </section>
      ${org && can('settings', 'e') ? `
      <section class="card">
        <div class="card-head"><h2>${esc(t('settings.organization'))}</h2><button type="button" class="btn btn-secondary btn-sm" data-act="org">${icon('edit')}<span>${esc(t('common.edit'))}</span></button></div>
        <div class="card-body">${dl([[t('platform.company'), esc(org.name)], [t('common.city'), esc(org.city)], [t('platform.plan'), esc(tl('plan', org.plan))], [t('common.status'), esc(tl('orgStatus', org.status))]])}</div>
      </section>` : ''}
      <section class="card">
        <div class="card-head"><h2>${esc(t('settings.demoData'))}</h2></div>
        <div class="card-body stack">
          <p class="note warn">${esc(t('settings.demoNote'))}</p>
          <div class="row">
            <button type="button" class="btn btn-secondary" data-act="export">${icon('download')}<span>${esc(t('settings.export'))}</span></button>
            <button type="button" class="btn btn-danger" data-act="reset">${icon('refresh')}<span>${esc(t('settings.reset'))}</span></button>
          </div>
        </div>
      </section>
    </div>`;

  on(root, 'click', '[data-act="profile"]', editProfile);
  on(root, 'click', '[data-act="org"]', () => editOrg(org));
  on(root, 'click', '[data-act="export"]', () => download('syndicma-demo-data.json', db.exportJson(), 'application/json'));
  on(root, 'click', '[data-act="reset"]', async () => {
    const ok = await confirmDialog({ title: t('settings.reset'), message: t('settings.resetText'), confirmLabel: t('settings.reset'), danger: true });
    if (!ok) return;
    logout();
    db.reset();
    location.hash = '#/login';
    bus.emit('shell');
  });
  root.querySelector('#set-lang').addEventListener('change', (e) => {
    setLang(e.target.value);
    bus.emit('shell');
  });
  root.querySelector('#set-dark').addEventListener('change', (e) => {
    setTheme(e.target.checked ? 'dark' : 'light');
    bus.emit('shell');
  });
}
