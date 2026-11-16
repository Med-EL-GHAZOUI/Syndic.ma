// Toast notifications announced through an aria-live region.
import { esc } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';

const ICONS = { success: 'check', error: 'alert', info: 'info' };

export function toast(message, type = 'success', ms = 4200) {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.setAttribute('role', type === 'error' ? 'alert' : 'status');
  el.innerHTML = `${icon(ICONS[type] || 'info')}<p>${esc(message)}</p>
    <button type="button" aria-label="${esc(t('common.close'))}">${icon('x')}</button>`;
  const remove = () => el.remove();
  el.querySelector('button').addEventListener('click', remove);
  host.appendChild(el);
  setTimeout(remove, ms);
}
