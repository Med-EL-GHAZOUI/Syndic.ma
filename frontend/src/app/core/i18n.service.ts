import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { AR } from './i18n/ar';
import { FR } from './i18n/fr';

export type Lang = 'fr' | 'ar';
const KEY = 'syndicma.lang';
const DICTS: Record<Lang, Record<string, string>> = { fr: FR, ar: AR };

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(this.initial());

  constructor() {
    this.apply(this.lang());
  }

  private initial(): Lang {
    try {
      const v = localStorage.getItem(KEY);
      if (v === 'fr' || v === 'ar') return v;
    } catch {
      /* ignore */
    }
    return 'fr';
  }

  set(lang: Lang): void {
    this.lang.set(lang);
    try {
      localStorage.setItem(KEY, lang);
    } catch {
      /* ignore */
    }
    this.apply(lang);
  }

  private apply(lang: Lang): void {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  }

  isRtl(): boolean {
    return this.lang() === 'ar';
  }

  /** `{name}` placeholders are replaced from params. Falls back to French, then to the key. */
  t(key: string, params?: Record<string, string | number>): string {
    let s = DICTS[this.lang()][key] ?? FR[key] ?? key;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k: string) => String(params[k] ?? m));
    return s;
  }

  /** Enum label, e.g. tl('paymentStatus', 'recorded'). */
  tl(group: string, value: string | null | undefined): string {
    return value ? this.t(`enum.${group}.${value}`) : '—';
  }
}

/** `{{ 'nav.finance' | t }}` — impure so templates update when the language changes. */
@Pipe({ name: 't', pure: false })
export class TPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(key: string, params?: Record<string, string | number>): string {
    return this.i18n.t(key, params);
  }
}

/** `{{ value | tl:'paymentStatus' }}` */
@Pipe({ name: 'tl', pure: false })
export class TlPipe implements PipeTransform {
  private readonly i18n = inject(I18nService);
  transform(value: string | null | undefined, group: string): string {
    return this.i18n.tl(group, value);
  }
}
