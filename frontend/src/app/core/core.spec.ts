import { TestBed } from '@angular/core/testing';
import { MoneyPipe, DatePipe2, pct } from './format';
import { AR } from './i18n/ar';
import { FR } from './i18n/fr';
import { I18nService } from './i18n.service';
import { can, isResident } from './permissions';

describe('permissions (UI mirror of the API matrix)', () => {
  it('only staff validate payments', () => {
    expect(can('accountant', 'payments', 'x')).toBeTrue();
    expect(can('manager', 'payments', 'x')).toBeFalse();
    expect(can('owner', 'payments', 'x')).toBeFalse();
  });
  it('residents may create (declare) payments; tenants have no finance access', () => {
    expect(can('owner', 'payments', 'c')).toBeTrue();
    expect(can('tenant', 'finance')).toBeFalse();
    expect(isResident('tenant')).toBeTrue();
    expect(isResident('manager')).toBeFalse();
  });
  it('providers only see maintenance; unknown modules and undefined role are denied', () => {
    expect(can('provider', 'finance')).toBeFalse();
    expect(can('provider', 'maintenance')).toBeTrue();
    expect(can('owner', 'nope')).toBeFalse();
    expect(can(undefined, 'finance')).toBeFalse();
  });
});

describe('i18n', () => {
  let i18n: I18nService;
  beforeEach(() => {
    localStorage.removeItem('syndicma.lang');
    i18n = TestBed.inject(I18nService);
    i18n.set('fr');
  });

  it('French and Arabic dictionaries define exactly the same keys', () => {
    const fr = Object.keys(FR).sort();
    const ar = Object.keys(AR).sort();
    expect(ar.filter((k) => !(k in FR))).toEqual([]);
    expect(fr.filter((k) => !(k in AR))).toEqual([]);
  });

  it('every {placeholder} in French also exists in the Arabic string', () => {
    const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');
    const broken = Object.keys(FR).filter((k) => ph(FR[k]) !== ph(AR[k]));
    expect(broken).toEqual([]);
  });

  it('interpolates, falls back to the key, and switches direction', () => {
    expect(i18n.t('dash.hello', { name: 'Nadia' })).toBe('Bonjour Nadia');
    expect(i18n.t('does.not.exist')).toBe('does.not.exist');
    i18n.set('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(document.documentElement.lang).toBe('ar');
    expect(i18n.tl('paymentStatus', 'recorded')).toBe('مسجلة');
    i18n.set('fr');
    expect(document.documentElement.dir).toBe('ltr');
    expect(i18n.tl('paymentStatus', null)).toBe('—');
  });
});

describe('formatting', () => {
  it('formats MAD with French grouping and a non-breaking space, and the Arabic currency label', () => {
    const i18n = TestBed.inject(I18nService);
    TestBed.runInInjectionContext(() => {
      const money = new MoneyPipe();
      i18n.set('fr');
      expect(money.transform(1234.5)).toBe('1 234,50 MAD');
      expect(money.transform(null)).toBe('0,00 MAD');
      i18n.set('ar');
      expect(money.transform(10)).toContain('د.م.');
      i18n.set('fr');
    });
  });

  it('parses date-only strings as LOCAL dates (no UTC day shift)', () => {
    TestBed.runInInjectionContext(() => {
      const f = new DatePipe2();
      expect(f.transform('2026-01-01')).toContain('01');
      expect(f.transform('2026-01-01')).toContain('2026');
      expect(f.transform('garbage')).toBe('—');
      expect(f.transform(null)).toBe('—');
    });
  });

  it('formats percentages', () => expect(pct(0.856)).toBe('86 %'));
});
