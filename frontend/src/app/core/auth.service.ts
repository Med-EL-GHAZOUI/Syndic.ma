import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, switchMap, tap, throwError } from 'rxjs';
import { TokenPair, User } from './models';

const RT_KEY = 'syndicma.rt';

/**
 * Session handling.
 *  - The short-lived ACCESS token lives only in memory (not readable after a page reload).
 *  - The REFRESH token is kept in sessionStorage so a reload can silently restore the session.
 *    Trade-off: any XSS could read it. Production hardening: deliver it as an httpOnly,
 *    SameSite cookie from the API instead (tracked in docs/SECURITY.md).
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

  login(email: string, password: string): Observable<User> {
    return this.http.post<TokenPair>('/api/auth/login', { email, password }).pipe(
      tap((t) => this.store(t)),
      switchMap(() => this.loadMe()),
    );
  }

  private loadMe(): Observable<User> {
    return this.http.get<User>('/api/auth/me').pipe(tap((u) => this.user.set(u)));
  }

  /** Called once at startup: restores the session from the refresh token, if any. */
  restore(): Observable<unknown> {
    if (!this.readRefresh()) return of(null);
    return this.refresh().pipe(
      switchMap(() => this.loadMe()),
      catchError(() => of(null)),
    );
  }

  /** Single-flight refresh. Emits the new access token. */
  refresh(): Observable<string> {
    if (this.inflight) return this.inflight;
    const rt = this.readRefresh();
    if (!rt) return throwError(() => new Error('no refresh token'));
    this.inflight = this.http.post<TokenPair>('/api/auth/refresh', { refreshToken: rt }).pipe(
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
    const rt = this.readRefresh();
    if (rt) this.http.post('/api/auth/logout', { refreshToken: rt }).pipe(catchError(() => of(null))).subscribe();
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
      sessionStorage.setItem(RT_KEY, t.refreshToken);
    } catch {
      /* storage unavailable: session lasts until reload */
    }
  }

  private readRefresh(): string | null {
    try {
      return sessionStorage.getItem(RT_KEY);
    } catch {
      return null;
    }
  }

  private clear(): void {
    this.access = null;
    this.user.set(null);
    try {
      sessionStorage.removeItem(RT_KEY);
    } catch {
      /* ignore */
    }
  }
}
