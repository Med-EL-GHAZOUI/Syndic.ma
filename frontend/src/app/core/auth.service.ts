import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { MfaChallenge, TokenPair, User } from './models';

// Non-secret hint ("a session probably exists") so we only call /auth/refresh when it can succeed.
// The refresh token itself is an HttpOnly cookie set by the API: JavaScript can never read it.
const HINT_KEY = 'syndicma.session';
// Custom header required by the API on cookie-authenticated endpoints (CSRF defence in depth).
const CSRF = { 'X-Requested-With': 'syndicma' };

/**
 * Session handling.
 *  - The short-lived ACCESS token lives only in memory (not readable after a page reload).
 *  - The REFRESH token lives only in an HttpOnly, SameSite=Strict cookie scoped to /api/auth, so a
 *    reload can silently restore the session while an XSS cannot read the token.
 *  - The API rotates the refresh token on every use, so refreshes must be single-flight:
 *    concurrent 401s share ONE refresh call (a second parallel call would look like token reuse
 *    and revoke the whole session).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  readonly user = signal<User | null>(null);
  private access: string | null = null;
  private inflight: Observable<string> | null = null;

  get accessToken(): string | null {
    return this.access;
  }

  /** Emits the user, or a challenge when the account has a second factor (no session exists yet in that case). */
  login(email: string, password: string): Observable<User | MfaChallenge> {
    return this.http.post<TokenPair | MfaChallenge>('/api/auth/login', { email, password }).pipe(
      switchMap((res) => {
        if ('mfaRequired' in res) return of(res);
        this.store(res);
        return this.loadMe();
      }),
    );
  }

  /** Second step: the challenge from login() plus an authenticator code (or a recovery code). */
  verifyMfa(mfaToken: string, code: string): Observable<User> {
    return this.http.post<TokenPair>('/api/auth/mfa/verify', { mfaToken, code }).pipe(
      tap((t) => this.store(t)),
      switchMap(() => this.loadMe()),
    );
  }

  private loadMe(): Observable<User> {
    return this.http.get<User>('/api/auth/me').pipe(tap((u) => this.user.set(u)));
  }

  /** Called once at startup: restores the session from the refresh token, if any. */
  restore(): Observable<unknown> {
    if (!this.hasHint()) return of(null);
    return this.refresh().pipe(
      switchMap(() => this.loadMe()),
      catchError(() => of(null)),
    );
  }

  /** Single-flight refresh. Emits the new access token. */
  refresh(): Observable<string> {
    if (this.inflight) return this.inflight;
    if (!this.hasHint()) return throwError(() => new Error('no session'));
    this.inflight = this.http.post<TokenPair>('/api/auth/refresh', {}, { headers: CSRF }).pipe(
      tap((t) => this.store(t)),
      map((t) => t.accessToken),
      catchError((err) => {
        this.clear();
        return throwError(() => err);
      }),
      finalize(() => (this.inflight = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inflight;
  }

  logout(): void {
    this.http.post('/api/auth/logout', {}, { headers: CSRF }).pipe(catchError(() => of(null))).subscribe();
    this.expire();
  }

  /** Local sign-out (session already invalid on the server, or user logged out). */
  expire(): void {
    this.clear();
    void this.router.navigateByUrl('/login');
  }

  private store(t: TokenPair): void {
    this.access = t.accessToken;
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  }

  private hasHint(): boolean {
    try {
      return localStorage.getItem(HINT_KEY) === '1';
    } catch {
      return false;
    }
  }

  private clear(): void {
    this.access = null;
    this.user.set(null);
    try {
      localStorage.removeItem(HINT_KEY);
    } catch {
      /* ignore */
    }
  }
}
