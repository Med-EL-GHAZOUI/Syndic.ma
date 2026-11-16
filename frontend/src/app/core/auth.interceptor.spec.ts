import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor + AuthService (refresh rotation)', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;
  let navigated: string[];

  const pair = (n: number) => ({ accessToken: `access-${n}`, refreshToken: `refresh-${n}`, expiresIn: 900 });
  const user = { id: 'u1', orgId: 'o1', name: 'Test', email: 't@example.com', role: 'accountant', residenceIds: [], providerId: null };

  /** Logs in so the service holds access-1 / refresh-1. */
  function loginFirst(): void {
    auth.login('t@example.com', 'pw').subscribe();
    ctrl.expectOne('/api/auth/login').flush(pair(1));
    ctrl.expectOne('/api/auth/me').flush(user);
  }

  beforeEach(() => {
    sessionStorage.clear();
    navigated = [];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: { navigateByUrl: (u: string) => { navigated.push(u); return Promise.resolve(true); }, parseUrl: (u: string) => u } },
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => ctrl.verify());

  it('attaches the bearer token to API calls but not to login/refresh', () => {
    loginFirst();
    http.get('/api/residences').subscribe();
    expect(ctrl.expectOne('/api/residences').request.headers.get('Authorization')).toBe('Bearer access-1');
  });

  it('does not send the access token to non-API URLs', () => {
    loginFirst();
    http.get('https://example.org/x').subscribe();
    expect(ctrl.expectOne('https://example.org/x').request.headers.has('Authorization')).toBeFalse();
  });

  it('on 401: refreshes once, stores the rotated tokens and replays the request with the new token', () => {
    loginFirst();
    let result: unknown;
    http.get('/api/units').subscribe((r) => (result = r));

    ctrl.expectOne('/api/units').flush({}, { status: 401, statusText: 'Unauthorized' });
    const refresh = ctrl.expectOne('/api/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-1' });
    refresh.flush(pair(2));

    const replay = ctrl.expectOne('/api/units');
    expect(replay.request.headers.get('Authorization')).toBe('Bearer access-2');
    replay.flush([{ id: 'a' }]);
    expect(result).toEqual([{ id: 'a' }]);
    expect(sessionStorage.getItem('syndicma.rt')).toBe('refresh-2');
  });

  it('three parallel 401s share ONE refresh (a second call would look like token reuse and revoke the session)', () => {
    loginFirst();
    const results: unknown[] = [];
    for (const path of ['/api/a', '/api/b', '/api/c']) http.get(path).subscribe((r) => results.push(r));

    for (const path of ['/api/a', '/api/b', '/api/c']) ctrl.expectOne(path).flush({}, { status: 401, statusText: 'Unauthorized' });

    const refreshes = ctrl.match('/api/auth/refresh');
    expect(refreshes.length).toBe(1);
    refreshes[0].flush(pair(2));

    for (const path of ['/api/a', '/api/b', '/api/c']) {
      const retry = ctrl.expectOne(path);
      expect(retry.request.headers.get('Authorization')).toBe('Bearer access-2');
      retry.flush('ok');
    }
    expect(results).toEqual(['ok', 'ok', 'ok']);
  });

  it('if the refresh fails: clears the session, goes to /login and surfaces the error', () => {
    loginFirst();
    let failed = false;
    http.get('/api/units').subscribe({ error: () => (failed = true) });
    ctrl.expectOne('/api/units').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush({ message: 'Refresh token reuse detected' }, { status: 401, statusText: 'Unauthorized' });

    expect(failed).toBeTrue();
    expect(auth.user()).toBeNull();
    expect(auth.accessToken).toBeNull();
    expect(sessionStorage.getItem('syndicma.rt')).toBeNull();
    expect(navigated).toContain('/login');
  });

  it('never loops: a request that still gets 401 after refresh fails', () => {
    loginFirst();
    let failed = false;
    http.get('/api/units').subscribe({ error: () => (failed = true) });
    ctrl.expectOne('/api/units').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/auth/refresh').flush(pair(2));
    ctrl.expectOne('/api/units').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectNone('/api/auth/refresh');
    expect(failed).toBeTrue();
  });

  it('other errors (403, 404, 500) are passed through without refreshing', () => {
    loginFirst();
    const codes: number[] = [];
    for (const status of [403, 404, 500]) http.get(`/api/e${status}`).subscribe({ error: (e) => codes.push(e.status) });
    for (const status of [403, 404, 500]) ctrl.expectOne(`/api/e${status}`).flush({}, { status, statusText: 'x' });
    ctrl.expectNone('/api/auth/refresh');
    expect(codes).toEqual([403, 404, 500]);
  });

  it('restore(): silently refreshes from the stored refresh token and loads the user', () => {
    sessionStorage.setItem('syndicma.rt', 'refresh-9');
    auth.restore().subscribe();
    const refresh = ctrl.expectOne('/api/auth/refresh');
    expect(refresh.request.body).toEqual({ refreshToken: 'refresh-9' });
    refresh.flush(pair(10));
    ctrl.expectOne('/api/auth/me').flush(user);

    expect(auth.user()?.email).toBe('t@example.com');
    expect(auth.accessToken).toBe('access-10');
    expect(sessionStorage.getItem('syndicma.rt')).toBe('refresh-10'); // rotated
  });

  it('restore() with a revoked/expired refresh token ends signed out, without throwing', () => {
    sessionStorage.setItem('syndicma.rt', 'stale');
    let completed = false;
    auth.restore().subscribe({ complete: () => (completed = true) });
    ctrl.expectOne('/api/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(completed).toBeTrue();
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem('syndicma.rt')).toBeNull();
  });

  it('restore() without a stored token does nothing', () => {
    auth.restore().subscribe();
    ctrl.expectNone('/api/auth/refresh');
    expect(auth.user()).toBeNull();
  });

  it('logout() revokes the refresh token on the server and clears local state', () => {
    loginFirst();
    auth.logout();
    expect(ctrl.expectOne('/api/auth/logout').request.body).toEqual({ refreshToken: 'refresh-1' });
    expect(auth.user()).toBeNull();
    expect(sessionStorage.getItem('syndicma.rt')).toBeNull();
    expect(navigated).toContain('/login');
  });
});
