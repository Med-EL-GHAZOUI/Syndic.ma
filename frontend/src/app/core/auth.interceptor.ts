import { HttpContextToken, HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const RETRIED = new HttpContextToken<boolean>(() => false);
const PUBLIC = ['/api/auth/login', '/api/auth/mfa/verify', '/api/auth/refresh', '/api/auth/logout'];

/** Adds the bearer token; on a 401 refreshes once (shared) and replays the request. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api') || PUBLIC.some((p) => req.url.startsWith(p))) return next(req);
  const auth = inject(AuthService);
  const withToken = (token: string | null) => (token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req);

  return next(withToken(auth.accessToken)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || req.context.get(RETRIED)) return throwError(() => err);
      return auth.refresh().pipe(
        // ONLY a failed refresh means "session over". An error from the replayed request itself
        // (e.g. 401 "current password is incorrect") is a normal business error and must not sign the user out.
        catchError((refreshErr: unknown) => {
          auth.expire();
          return throwError(() => refreshErr);
        }),
        switchMap((token) => next(withToken(token).clone({ context: req.context.set(RETRIED, true) }))),
      );
    }),
  );
};
