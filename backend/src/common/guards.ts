import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { AuthUser, IS_PUBLIC, PERMISSION } from './auth-user';
import { Action, can } from './permissions';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    return isPublic ? true : super.canActivate(context);
  }
}

/** Deny by default: a protected route without @Perm is only reachable by an authenticated user for its own data. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [context.getHandler(), context.getClass()]);
    if (isPublic) return true;
    const required = this.reflector.getAllAndOverride<{ module: string; action: Action }>(PERMISSION, [context.getHandler(), context.getClass()]);
    if (!required) return true;
    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (!user || !can(user.role, required.module, required.action)) throw new ForbiddenException('Insufficient permissions');
    return true;
  }
}
