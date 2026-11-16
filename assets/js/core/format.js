// Locale-aware formatting. Amounts are Moroccan dirhams (MAD).
import { getLang } from './i18n.js';

// Western digits in both languages, as commonly used in Morocco.
const dateLocale = () => (getLang() === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR');

const numberFmt = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const intFmt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export const currency = () => (getLang() === 'ar' ? 'د.م.' : 'MAD');

export const amount = (n) => numberFmt.format(Number(n) || 0);
export const money = (n) => `${amount(n)} ${currency()}`;
export const int = (n) => intFmt.format(Number(n) || 0);
export const pct = (n) => `${intFmt.format(Math.round((Number(n) || 0) * 100))} %`;

function parse(value) {
  if (!value) return null;
  // Date-only strings are treated as local dates (avoid UTC shift).
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function date(value) {
  const d = parse(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(dateLocale(), { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

export function dateTime(value) {
  const d = parse(value);
  if (!d) return '—';
  return new Intl.DateTimeFormat(dateLocale(), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

export function monthLabel(year, monthIndex) {
  return new Intl.DateTimeFormat(dateLocale(), { month: 'short' }).format(new Date(year, monthIndex, 1));
}

export function fileSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return `${b} o`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} Ko`;
  return `${(b / 1024 / 1024).toFixed(1)} Mo`;
}
