// French / Arabic translations with LTR / RTL switching.
import fr from '../i18n/fr.js';
import ar from '../i18n/ar.js';

const DICTS = { fr, ar };
const KEY = 'syndicma.lang';
const warned = new Set();

function readLang() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved && DICTS[saved]) return saved;
  } catch {
    /* storage unavailable */
  }
  return 'fr';
}

let lang = readLang();

export const getLang = () => lang;
export const isRtl = () => lang === 'ar';

export function applyLang() {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRtl() ? 'rtl' : 'ltr';
}

export function setLang(next) {
  if (!DICTS[next]) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* ignore */
  }
  applyLang();
}

/** Translate a key. `{name}` placeholders are replaced from params. */
export function t(key, params) {
  let s = DICTS[lang][key];
  if (s === undefined) s = DICTS.fr[key];
  if (s === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`[i18n] missing key: ${key}`);
    }
    return key;
  }
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] ?? m));
  return s;
}

/** Translate an enum value, e.g. tl('paymentStatus', 'recorded'). */
export const tl = (group, value) =>
  value === null || value === undefined || value === '' ? '—' : t(`enum.${group}.${value}`);

/** Options list for a select, from enum values. */
export const enumOptions = (group, values) => values.map((v) => ({ value: v, label: tl(group, v) }));
