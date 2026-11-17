import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { MfaChallenge, User } from './models';

describe('two-step login (password, then authenticator code)', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;
  let navigated: string[];

  const user = { id: 'u1', orgId: 'o1', name: 'Test', email: 't@example.com', role: 'accountant', residenceIds: [], providerId: null };

  beforeEach(() => {
    localStorage.clear();
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

  it('a password for an account with a second factor yields a challenge and NO session', () => {
    let result: User | MfaChallenge | undefined;
    auth.login('t@example.com', 'pw').subscribe((r) => (result = r));
    ctrl.expectOne('/api/auth/login').flush({ mfaRequired: true, mfaToken: 'challenge-1' });
    ctrl.expectNone('/api/auth/me'); // nothing is loaded: there is no session yet
    expect(result).toEqual({ mfaRequired: true, mfaToken: 'challenge-1' });
    expect(auth.accessToken).toBeNull();
    expect(auth.user()).toBeNull();
    expect(Object.keys(localStorage)).toEqual([]); // not even the "a session exists" hint
  });

  it('the code completes the login with the challenge, then loads the profile', () => {
    let done: User | undefined;
    auth.verifyMfa('challenge-1', '123456').subscribe((u) => (done = u));
    const req = ctrl.expectOne('/api/auth/mfa/verify');
    expect(req.request.body).toEqual({ mfaToken: 'challenge-1', code: '123456' });
    req.flush({ accessToken: 'access-1', expiresIn: 900 });
    ctrl.expectOne('/api/auth/me').flush(user);
    expect(done?.id).toBe('u1');
    expect(auth.accessToken).toBe('access-1');
  });

  it('a wrong code (401) is a normal error: no refresh attempt, no sign-out, no redirect', () => {
    let status = 0;
    auth.verifyMfa('challenge-1', '000000').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/auth/mfa/verify').flush({ message: 'Invalid code' }, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectNone('/api/auth/refresh');
    expect(status).toBe(401);
    expect(navigated).toEqual([]);
  });

  it('a 403 from the settings endpoints (wrong code while disabling) keeps the session', () => {
    auth.verifyMfa('c', '123456').subscribe();
    ctrl.expectOne('/api/auth/mfa/verify').flush({ accessToken: 'access-1', expiresIn: 900 });
    ctrl.expectOne('/api/auth/me').flush(user);
    let status = 0;
    http.post('/api/auth/mfa/disable', { password: 'x', code: '000000' }).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/auth/mfa/disable').flush({ message: 'Invalid code' }, { status: 403, statusText: 'Forbidden' });
    expect(status).toBe(403);
    expect(auth.accessToken).toBe('access-1');
    expect(navigated).toEqual([]);
  });
});
