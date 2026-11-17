import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppNotification } from './models';
import { I18nService } from './i18n.service';
import { NotificationsService } from './notifications.service';

const note = (over: Partial<AppNotification>): AppNotification => ({ id: 'n1', type: 'announcement', params: {}, link: null, readAt: null, createdAt: '2026-11-17T10:00:00Z', ...over });

describe('NotificationsService', () => {
  let svc: NotificationsService;
  let i18n: I18nService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    svc = TestBed.inject(NotificationsService);
    i18n = TestBed.inject(I18nService);
    http = TestBed.inject(HttpTestingController);
    i18n.set('fr');
  });

  it('builds the sentence from type and params, in the CURRENT language', () => {
    const n = note({ type: 'announcement', params: { title: 'Coupure d\'eau' } });
    expect(svc.message(n)).toBe('Nouvelle annonce : Coupure d\'eau');
    i18n.set('ar');
    expect(svc.message(n)).toContain('Coupure d\'eau');
    expect(svc.message(n)).not.toContain('Nouvelle annonce'); // the same stored notification, now in Arabic
  });

  it('formats amounts and dates like the rest of the UI (never a raw number or ISO string)', () => {
    const digest = svc.message(note({ type: 'overdueDigest', params: { count: 3, amount: 1234.5 } }));
    expect(digest).toContain('3 charge(s)');
    expect(digest).toMatch(/1\s?234,50/);
    expect(digest).toContain('MAD');
    const reminder = svc.message(note({ type: 'assemblyReminder', params: { title: 'AG', date: '2026-11-20' } }));
    expect(reminder).toContain('AG');
    expect(reminder).not.toContain('2026-11-20');
  });

  it('falls back to a neutral sentence for a type this client does not know', () => {
    expect(svc.message(note({ type: 'someFutureType' }))).toBe('Nouvelle notification');
  });

  it('marking read updates the list and never drives the counter below zero', () => {
    svc.items.set([note({ id: 'a' }), note({ id: 'b', readAt: '2026-11-17T11:00:00Z' })]);
    svc.unread.set(1);
    svc.markRead(svc.items()[0]);
    http.expectOne('/api/notifications/a/read').flush({ id: 'a' });
    expect(svc.items()[0].readAt).not.toBeNull();
    expect(svc.unread()).toBe(0);

    svc.unread.set(0);
    svc.markRead(note({ id: 'c' }));
    http.expectOne('/api/notifications/c/read').flush({ id: 'c' });
    expect(svc.unread()).toBe(0);

    svc.markRead(svc.items()[1]); // already read: no request at all
    http.expectNone('/api/notifications/b/read');
  });

  it('mark all read empties the counter', () => {
    svc.items.set([note({ id: 'a' }), note({ id: 'b' })]);
    svc.unread.set(2);
    svc.markAllRead();
    http.expectOne('/api/notifications/read-all').flush({ updated: 2 });
    expect(svc.unread()).toBe(0);
    expect(svc.items().every((x) => x.readAt)).toBeTrue();
  });
});
