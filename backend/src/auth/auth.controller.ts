import { Body, Controller, ForbiddenException, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthUser, CurrentUser, Public } from '../common/auth-user';
import { ChangePasswordDto, LoginDto } from './auth.dto';
import { AuthService } from './auth.service';

// Brute-force protection: per-IP limit on credential endpoints.
const LIMIT = Number(process.env.THROTTLE_AUTH_LIMIT ?? 10);

/**
 * The refresh token never reaches JavaScript: it travels only in an HttpOnly cookie, so an XSS
 * cannot read it. Scoped to /api/auth (sent to no other endpoint), SameSite=Strict (not sent on
 * cross-site requests) and Secure in production. As defence in depth against CSRF, the endpoints
 * that use the cookie additionally require a custom header that a cross-site form cannot set.
 */
export const REFRESH_COOKIE = 'syndicma_rt';
const CSRF_HEADER = 'x-requested-with';
const CSRF_VALUE = 'syndicma';

const secure = () => (process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : process.env.NODE_ENV === 'production');
const maxAgeMs = () => Number(process.env.REFRESH_TTL_DAYS ?? 14) * 86_400_000;

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: secure(), path: '/api/auth', maxAge: maxAgeMs() });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: 'strict', secure: secure(), path: '/api/auth' });
}

/** Minimal cookie parser (avoids a dependency for a single cookie). */
function readCookie(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null; // malformed percent-encoding: treat as "no cookie", never a 500
      }
    }
  }
  return null;
}

function requireCsrfHeader(req: Request) {
  if (req.headers[CSRF_HEADER] !== CSRF_VALUE) throw new ForbiddenException('Missing CSRF header');
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: LIMIT, ttl: 60_000 } })
  @HttpCode(200)
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const t = await this.auth.login(dto.email, dto.password);
    setRefreshCookie(res, t.refreshToken);
    return { accessToken: t.accessToken, expiresIn: t.expiresIn };
  }

  @Public()
  @Throttle({ default: { limit: LIMIT * 3, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrfHeader(req);
    const presented = readCookie(req, REFRESH_COOKIE);
    if (!presented) throw new UnauthorizedException('No session');
    try {
      const t = await this.auth.refresh(presented);
      setRefreshCookie(res, t.refreshToken);
      return { accessToken: t.accessToken, expiresIn: t.expiresIn };
    } catch (err) {
      clearRefreshCookie(res); // a dead/stolen token is removed from the browser
      throw err;
    }
  }

  @Public()
  @HttpCode(204)
  @Post('logout')
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    requireCsrfHeader(req);
    const presented = readCookie(req, REFRESH_COOKIE);
    if (presented) await this.auth.logout(presented);
    clearRefreshCookie(res);
  }

  @ApiBearerAuth()
  @Throttle({ default: { limit: LIMIT, ttl: 60_000 } })
  @HttpCode(204)
  @Post('change-password')
  async changePassword(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) res: Response) {
    await this.auth.changePassword(user.id, dto.currentPassword, dto.newPassword);
    clearRefreshCookie(res); // every session, including this browser's, was revoked
  }

  @ApiBearerAuth()
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return user;
  }
}
