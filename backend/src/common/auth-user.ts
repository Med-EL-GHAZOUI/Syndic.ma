import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { Action, Role } from './permissions';

/** Identity attached to every authenticated request (re-loaded from the DB on each call). */
export interface AuthUser {
  id: string;
  orgId: string | null;
  name: string;
  email: string;
  role: Role;
  residenceIds: string[];
  providerId: string | null;
}

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user);

export const IS_PUBLIC = 'isPublic';
/** Opt a route out of the global JWT guard (login, refresh, health). */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const PERMISSION = 'permission';
/** Require a module/action from the RBAC matrix, e.g. @Perm('payments', 'x'). */
export const Perm = (module: string, action: Action = 'v') => SetMetadata(PERMISSION, { module, action });
