// Declarative modal forms with inline validation.
import { openModal } from './modal.js';
import { esc } from '../core/dom.js';
import { t } from '../core/i18n.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Moroccan numbers: +212 or 0, then 5/6/7 and 8 digits.
const PHONE_RE = /^(\+212|0)[5-7]\d{8}$/;

const resolve = (v, values) => (typeof v === 'function' ? v(values) : v);
const isEmpty = (v) => v === null || v === undefined || v === '';

export function validateField(f, value, values) {
  if (f.required && (isEmpty(value) || (f.type === 'checkbox' && !value))) return t('form.required');
  if (!isEmpty(value)) {
    if (f.type === 'email' && !EMAIL_RE.test(value)) return t('form.email');
    if (f.type === 'tel' && !PHONE_RE.test(String(value).replace(/[\s.-]/g, ''))) return t('form.phone');
    if (f.type === 'number' || f.type === 'money') {
      if (Number.isNaN(value)) return t('form.number');
      const min = f.type === 'money' && f.min === undefined ? 0 : f.min;
      if (min !== undefined && value < min) return t('form.min', { min });
      if (f.max !== undefined && value > f.max) return t('form.max', { max: f.max });
    }
    if (f.maxLength && String(value).length > f.maxLength) return t('form.maxLength', { max: f.maxLength });
  }
  return f.validate ? f.validate(value, values) || '' : '';
}

function fieldHtml(f, values, errors, prefix) {
  if (f.type === 'static') return `<div class="field full">${resolve(f.html, values) || ''}</div>`;
  const id = `${prefix}-${f.name}`;
  const value = values[f.name];
  const err = errors[f.name];
  const described = [err ? `${id}-err` : '', f.hint ? `${id}-hint` : ''].filter(Boolean).join(' ');
  const attrs = [
    `id="${id}"`,
    `name="${f.name}"`,
    f.required ? 'aria-required="true"' : '',
    err ? 'aria-invalid="true"' : '',
    described ? `aria-describedby="${described}"` : '',
    resolve(f.disabled, values) ? 'disabled' : '',
    f.reactive ? 'data-reactive' : '',
  ].join(' ');
  const errHtml = err ? `<span class="field-error" id="${id}-err">${esc(err)}</span>` : '';
  const hintHtml = f.hint ? `<span class="field-hint" id="${id}-hint">${esc(f.hint)}</span>` : '';
  const cls = `field ${f.full ? 'full' : ''}`;

  if (f.type === 'checkbox') {
    return `<div class="${cls}"><label class="check"><input type="checkbox" ${attrs} ${value ? 'checked' : ''}> ${esc(f.label)}</label>${hintHtml}${errHtml}</div>`;
  }

  let control;
  if (f.type === 'select') {
    const options = resolve(f.options, values) || [];
    const blank = f.placeholder === false ? '' : `<option value="">${esc(f.placeholder || t('common.select'))}</option>`;
    control = `<select class="select" ${attrs}>${blank}${options
      .map((o) => `<option value="${esc(o.value)}" ${String(value ?? '') === String(o.value) ? 'selected' : ''}>${esc(o.label)}</option>`)
      .join('')}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea class="textarea" rows="${f.rows || 4}" ${attrs} placeholder="${esc(f.placeholder || '')}">${esc(value ?? '')}</textarea>`;
  } else if (f.type === 'file') {
    control = `<input class="input" type="file" ${attrs} ${f.accept ? `accept="${esc(f.accept)}"` : ''}>${value && value.name ? `<span class="field-hint">${esc(value.name)}</span>` : ''}`;
  } else {
    const numeric = f.type === 'number' || f.type === 'money';
    const type = numeric ? 'number' : f.type || 'text';
    const extra = numeric ? `step="${f.step || (f.type === 'money' ? '0.01' : '1')}" inputmode="decimal"` : '';
    const dir = ['email', 'tel', 'number', 'money', 'date'].includes(f.type) ? 'dir="ltr"' : '';
    control = `<input class="input" type="${type}" ${extra} ${dir} ${attrs} value="${esc(value ?? '')}" placeholder="${esc(f.placeholder || '')}" ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}>`;
  }
  const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label>${control}${hintHtml}${errHtml}</div>`;
}

/**
 * Open a modal form.
 * onSubmit(values) may return a string (form-level error, modal stays open),
 * false (stay open) or anything else (close).
 */
export function openForm({ title, fields, values = {}, submitLabel, onSubmit, size = 'md', intro = '' }) {
  const prefix = `f${Math.random().toString(36).slice(2, 8)}`;
  let vals = { ...values };
  let errors = {};
  let formError = '';

  const form = document.createElement('form');
  form.noValidate = true;
  form.id = prefix;

  const visible = () => fields.filter((f) => !f.showIf || f.showIf(vals));

  function read() {
    const out = { ...vals };
    for (const f of visible()) {
      if (f.type === 'static') continue;
      const el = form.elements[f.name];
      if (!el) continue;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'file') {
        const file = el.files && el.files[0];
        if (file) out[f.name] = { name: file.name, size: file.size, type: file.type };
      } else if (f.type === 'number' || f.type === 'money') out[f.name] = el.value === '' ? null : Number(el.value);
      else out[f.name] = el.value.trim();
    }
    return out;
  }

  function draw(focusName) {
    form.innerHTML = `
      ${intro ? `<div class="note plain" style="margin-bottom:16px">${intro}</div>` : ''}
      ${formError ? `<div class="form-alert" role="alert">${esc(formError)}</div>` : ''}
      <div class="form-grid">${visible().map((f) => fieldHtml(f, vals, errors, prefix)).join('')}</div>`;
    if (focusName && form.elements[focusName]) form.elements[focusName].focus();
  }

  draw();

  const modal = openModal({
    title,
    size,
    content: form,
    footer: [
      { label: t('common.cancel'), variant: 'secondary', onClick: (close) => close() },
      { label: submitLabel || t('common.save'), variant: 'primary', submit: prefix },
    ],
  });

  form.addEventListener('change', (e) => {
    if (e.target.dataset.reactive !== undefined) {
      vals = read();
      draw(e.target.name);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    vals = read();
    errors = {};
    formError = '';
    for (const f of visible()) {
      if (f.type === 'static') continue;
      const message = validateField(f, vals[f.name], vals);
      if (message) errors[f.name] = message;
    }
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      draw(firstInvalid);
      return;
    }
    try {
      const result = onSubmit(vals);
      if (typeof result === 'string') {
        formError = result;
        draw();
        return;
      }
      if (result === false) return;
      modal.close();
    } catch (err) {
      console.error(err);
      formError = t('common.error');
      draw();
    }
  });

  return modal;
}
