import { Pipe, PipeTransform, inject } from '@angular/core';
import { I18nService } from './i18n.service';

const num = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatMoney = (value: number | null | undefined, lang: string): string => `${num.format(Number(value) || 0)} ${lang === 'ar' ? 'د.م.' : 'MAD'}`;

export const formatDate = (value: string | null | undefined, lang: string): string => {
  if (!value) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};

/** 1234.5 -> "1 234,50 MAD" (or "د.م." in Arabic). Western digits in both languages. */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: number | null | undefined): string {
    return `${num.format(Number(value) || 0)} ${this.i18n.lang() === 'ar' ? 'د.م.' : 'MAD'}`;
  }
}

/** ISO date (YYYY-MM-DD) -> "16 nov. 2026" — parsed as a LOCAL date to avoid a UTC day shift. */
@Pipe({ name: 'fdate', pure: false })
export class DatePipe2 implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: string | null | undefined): string {
    return formatDate(value, this.i18n.lang());
  }
}

export const pct = (n: number): string => `${Math.round((Number(n) || 0) * 100)} %`;
