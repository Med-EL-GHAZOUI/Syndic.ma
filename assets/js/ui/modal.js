// Accessible modal dialogs: focus trap, Escape to close, focus restore.
import { esc } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { icon } from './icons.js';

let openCount = 0;
let seq = 0;

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {object} o
 * @param {string} o.title
 * @param {string|Node} o.content  HTML string (already escaped) or a DOM node
 * @param {'sm'|'md'|'lg'} [o.size]
 * @param {Array<{label:string, variant?:string, onClick?:Function, submit?:string, icon?:string}>} [o.footer]
 */
export function openModal({ title, content, size = 'md', footer = [], onClose }) {
  const root = document.getElementById('modal-root');
  const previous = document.activeElement;
  const id = `modal-${++seq}`;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}-title">
      <div class="modal-head">
        <h2 id="${id}-title">${esc(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="${esc(t('common.close'))}">${icon('x')}</button>
      </div>
      <div class="modal-body"></div>
      ${footer.length ? '<div class="modal-foot"></div>' : ''}
    </div>`;
  const body = backdrop.querySelector('.modal-body');
  if (typeof content === 'string') body.innerHTML = content;
  else if (content) body.appendChild(content);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    backdrop.remove();
    openCount -= 1;
    if (openCount <= 0) {
      openCount = 0;
      document.body.classList.remove('modal-open');
    }
    if (previous && document.contains(previous)) previous.focus();
    if (onClose) onClose();
  }

  const foot = backdrop.querySelector('.modal-foot');
  footer.forEach((b) => {
    const el = document.createElement('button');
    el.type = b.submit ? 'submit' : 'button';
    if (b.submit) el.setAttribute('form', b.submit);
    el.className = `btn btn-${b.variant || 'secondary'}`;
    el.innerHTML = `${b.icon ? icon(b.icon) : ''}<span>${esc(b.label)}</span>`;
    if (b.onClick) el.addEventListener('click', () => b.onClick(close));
    foot.appendChild(el);
  });

  backdrop.addEventListener('mousedown', (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector('[data-close]').addEventListener('click', close);
  backdrop.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = [...backdrop.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  root.appendChild(backdrop);
  openCount += 1;
  document.body.classList.add('modal-open');
  const target = body.querySelector('input:not([type=hidden]):not([disabled]), select:not([disabled]), textarea:not([disabled])')
    || backdrop.querySelector('.modal-foot .btn-primary, .modal-foot .btn-danger')
    || backdrop.querySelector('[data-close]');
  target.focus();

  return { el: backdrop, body, close };
}

/** Promise-based confirmation dialog. */
export function confirmDialog({ title, message, confirmLabel, danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    openModal({
      title,
      size: 'sm',
      content: `<p>${esc(message)}</p>`,
      onClose: () => {
        if (!answered) resolve(false);
      },
      footer: [
        { label: t('common.cancel'), variant: 'secondary', onClick: (close) => close() },
        {
          label: confirmLabel || t('common.confirm'),
          variant: danger ? 'danger' : 'primary',
          onClick: (close) => {
            answered = true;
            resolve(true);
            close();
          },
        },
      ],
    });
  });
}

/** Print only the content of the currently open modal (receipts, statements). */
export function printModal() {
  document.body.classList.add('print-modal');
  const done = () => {
    document.body.classList.remove('print-modal');
    window.removeEventListener('afterprint', done);
  };
  window.addEventListener('afterprint', done);
  window.print();
}
