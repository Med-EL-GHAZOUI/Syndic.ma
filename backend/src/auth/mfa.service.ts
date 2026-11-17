import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { Repository } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { MetricsService } from '../metrics/metrics.service';
import { User } from '../entities';
import { decryptSecret, encryptSecret } from './mfa-crypto';
import { base32Decode, base32Encode, otpauthUrl, verifyTotp } from './totp';

const ISSUER = 'Syndic.ma';
const BACKUP_CODES = 10;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
const CHALLENGE_TTL_SECONDS = 300;
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
/** Recovery codes are typed by humans: ignore case, spaces and dashes. */
const normalizeBackup = (v: string) => v.replace(/[\s-]/g, '').toLowerCase();

/**
 * Time-based one-time passwords (authenticator app) as a second factor.
 *  - The secret is encrypted at rest and never returned after enrolment.
 *  - A code works once (replay protection); 5 wrong codes lock the second step for 15 minutes.
 *  - 10 single-use recovery codes are shown once, stored only as hashes.
 *  - Login becomes two steps: password -> short-lived challenge token (which is NOT an access token) -> code.
 */
@Injectable()
export class MfaService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly metrics: MetricsService,
  ) {}

  private material(): string {
    return this.config.get<string>('MFA_ENCRYPTION_KEY') ?? this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  /** Separate signing key: a challenge token can never be accepted as an access token, nor the reverse. */
  private challengeSecret(): string {
    return sha256(`syndicma-mfa-challenge:${this.config.getOrThrow<string>('JWT_ACCESS_SECRET')}`);
  }

  /** TypeORM's postgres driver answers UPDATE ... RETURNING with [rows, affectedCount]: always hand back the rows. */
  private async rows<T>(sql: string, params: unknown[]): Promise<T[]> {
    const r = await this.users.query(sql, params);
    return Array.isArray(r[0]) ? r[0] : r;
  }

  private secretOf(user: User): Buffer {
    if (!user.mfaSecret) throw new ConflictException('Two-factor setup has not been started');
    return base32Decode(decryptSecret(user.mfaSecret, this.material(), user.id));
  }

  async status(userId: string) {
    const u = await this.users.findOneByOrFail({ id: userId });
    return { enabled: u.mfaEnabled, backupCodesLeft: u.mfaEnabled ? u.mfaBackupCodes.length : 0 };
  }

  async setup(userId: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (user.mfaEnabled) throw new ConflictException('Two-factor authentication is already enabled');
    const secret = base32Encode(randomBytes(20));
    await this.users.update(userId, { mfaSecret: encryptSecret(secret, this.material(), userId), mfaLastStep: null });
    return { secret, otpauthUrl: otpauthUrl(ISSUER, user.email, secret) };
  }

  async enable(userId: string, code: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (user.mfaEnabled) throw new ConflictException('Two-factor authentication is already enabled');
    const step = verifyTotp(this.secretOf(user), code.trim());
    if (step === null) throw new BadRequestException('Invalid code');
    const codes = Array.from({ length: BACKUP_CODES }, () => `${randomBytes(3).toString('hex')}-${randomBytes(3).toString('hex')}`);
    await this.users.update(userId, { mfaEnabled: true, mfaLastStep: step, mfaBackupCodes: codes.map((c) => sha256(normalizeBackup(c))), mfaFailures: 0, mfaLockedUntil: null });
    await this.audit.log(user, 'mfa_enable', 'users', userId, user.email);
    return { backupCodes: codes }; // the only time they are visible
  }

  async disable(userId: string, password: string, code: string) {
    const user = await this.users.findOneByOrFail({ id: userId });
    if (!user.mfaEnabled) throw new ConflictException('Two-factor authentication is not enabled');
    if (!(await bcrypt.compare(password, user.passwordHash))) throw new ForbiddenException('Current password is incorrect');
    if (!(await this.checkCode(user, code))) throw new ForbiddenException('Invalid code');
    await this.clear(userId);
    await this.audit.log(user, 'mfa_disable', 'users', userId, user.email);
  }

  /** Also used by an administrator when somebody lost their device (and their recovery codes). */
  clear(userId: string) {
    return this.users.update(userId, { mfaEnabled: false, mfaSecret: null, mfaLastStep: null, mfaBackupCodes: [], mfaFailures: 0, mfaLockedUntil: null });
  }

  challengeFor(user: User): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, purpose: 'mfa' }, { secret: this.challengeSecret(), expiresIn: CHALLENGE_TTL_SECONDS, algorithm: 'HS256' });
  }

  /** Returns the user a valid challenge was issued for. */
  async userFromChallenge(token: string): Promise<User> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; purpose: string }>(token, { secret: this.challengeSecret(), algorithms: ['HS256'] });
      if (p.purpose !== 'mfa') throw new Error('wrong purpose');
      const user = await this.users.findOneBy({ id: p.sub });
      if (user?.mfaEnabled) return user;
    } catch {
      /* fall through */
    }
    throw new UnauthorizedException('Invalid or expired challenge');
  }

  /** TOTP code or recovery code. Counts failures and locks; never reveals which part was wrong. */
  async checkCode(user: User, code: string): Promise<boolean> {
    if (user.mfaLockedUntil && user.mfaLockedUntil.getTime() > Date.now()) throw new HttpException('Too many attempts, try again later', HttpStatus.TOO_MANY_REQUESTS);
    const ok = (await this.checkTotp(user, code)) || (await this.checkBackup(user, code));
    if (ok) {
      if (user.mfaFailures) await this.users.update(user.id, { mfaFailures: 0, mfaLockedUntil: null });
      return true;
    }
    this.metrics.inc('syndicma_login_total', { result: 'mfa_failure' });
    // atomic increment, then lock when the threshold is reached
    const [row] = await this.rows<{ n: number }>('UPDATE users SET mfa_failures = mfa_failures + 1 WHERE id = $1 RETURNING mfa_failures AS n', [user.id]);
    if (row?.n >= MAX_FAILURES) await this.users.update(user.id, { mfaFailures: 0, mfaLockedUntil: new Date(Date.now() + LOCK_MS) });
    return false;
  }

  private async checkTotp(user: User, code: string): Promise<boolean> {
    const step = verifyTotp(this.secretOf(user), code.trim(), Date.now(), user.mfaLastStep);
    if (step === null) return false;
    // atomic "use once": two simultaneous requests with the same code cannot both pass
    const res = await this.rows('UPDATE users SET mfa_last_step = $2 WHERE id = $1 AND (mfa_last_step IS NULL OR mfa_last_step < $2) RETURNING id', [user.id, step]);
    return res.length === 1;
  }

  private async checkBackup(user: User, code: string): Promise<boolean> {
    if (!/^[0-9a-f]{6}[\s-]?[0-9a-f]{6}$/i.test(code.trim())) return false;
    const hash = sha256(normalizeBackup(code));
    const res = await this.rows('UPDATE users SET mfa_backup_codes = mfa_backup_codes - $2::text WHERE id = $1 AND jsonb_exists(mfa_backup_codes, $2) RETURNING id', [user.id, hash]);
    if (res.length === 1) await this.audit.log(user, 'mfa_backup_used', 'users', user.id, user.email);
    return res.length === 1;
  }
}
