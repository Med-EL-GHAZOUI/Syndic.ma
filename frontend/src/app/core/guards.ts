import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { can } from './permissions';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).parseUrl('/login');
};

/** Route data: { module: 'finance' } — requires view permission on that module. */
export const moduleGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const module = route.data['module'] as string | undefined;
  if (!auth.user()) return inject(Router).parseUrl('/login');
  return !module || can(auth.user()!.role, module) ? true : inject(Router).parseUrl('/forbidden');
};

export const guestGuard: CanActivateFn = () => (inject(AuthService).user() ? inject(Router).parseUrl('/dashboard') : true);
