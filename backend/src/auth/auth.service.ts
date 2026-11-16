import { BadRequestException, ForbiddenException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { MailService } from '../mail/mail.service';
import { MetricsService } from '../metrics/metrics.service';
import { Organization, PasswordReset, RefreshToken, User } from '../entities';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
// Work factor: 12 by default; tests may lower it, production can never go below 10.
const COST = process.env.NODE_ENV === 'production' ? Math.max(10, Number(process.env.BCRYPT_COST ?? 12)) : Number(process.env.BCRYPT_COST ?? 12);
// Compared against when the e-mail is unknown, so timing does not reveal which e-mails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', COST);
const INVALID = 'Invalid credentials';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
    @InjectRepository(PasswordReset) private readonly resets: Repository<PasswordReset>,
    private readonly mail: MailService,
    private readonly metrics: MetricsService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  static hashPassword(plain: string): string {
    return bcrypt.hashSync(plain, COST);
  }

  async login(email: string, password: string): Promise<TokenPair> {
    const user = await this.users.findOneBy({ email: email.trim().toLowerCase() });
    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    // Same message for unknown user / wrong password / disabled account / suspended org.
    if (!user || !ok || !user.active) {
      this.metrics.inc('syndicma_login_total', { result: 'failure' });
      throw new UnauthorizedException(INVALID);
    }
    if (user.orgId) {
      const org = await this.orgs.findOneBy({ id: user.orgId });
      if (!org || org.status === 'suspended') {
        this.metrics.inc('syndicma_login_total', { result: 'failure' });
        throw new UnauthorizedException(INVALID);
      }
    }
    this.metrics.inc('syndicma_login_total', { result: 'success' });
    await this.users.update(user.id, { lastLoginAt: new Date() });
    await this.audit.log(user, 'login', 'users', user.id, user.email);
    return this.issue(user, randomUUID());
  }

  /** Rotate: a refresh token works exactly once. Re-presenting a used token revokes the whole family. */
  async refresh(presented: string): Promise<TokenPair> {
    const row = await this.tokens.findOneBy({ tokenHash: sha256(presented) });
    if (!row || row.revokedAt) throw new UnauthorizedException('Invalid refresh token');

    if (row.usedAt) {
      this.metrics.inc('syndicma_refresh_reuse_total'); // possible token theft: alert on any increase
      await this.revokeFamily(row.family);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Refresh token expired');

    // Atomic "use once": only one concurrent request can flip used_at from NULL.
    const res = await this.tokens.update({ id: row.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!res.affected) {
      this.metrics.inc('syndicma_refresh_reuse_total');
      await this.revokeFamily(row.family);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.users.findOneBy({ id: row.userId });
    if (!user || !user.active) throw new UnauthorizedException('Invalid refresh token');
    return this.issue(user, row.family);
  }

  /** Changing the password revokes EVERY refresh token of the user (all devices are signed out). */
  async changePassword(userId: string, current: string, next: string): Promise<void> {
    const user = await this.users.findOneBy({ id: userId });
    if (!user) throw new UnauthorizedException();
    // 403, not 401: the caller IS authenticated; only the re-confirmation failed. A 401 would make
    // clients believe the session expired.
    if (!(await bcrypt.compare(current, user.passwordHash))) throw new ForbiddenException('Current password is incorrect');
    if (current === next) throw new BadRequestException('The new password must differ from the current one');
    await this.users.update(user.id, { passwordHash: await bcrypt.hash(next, COST) });
    await this.tokens.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    await this.audit.log(user, 'update', 'users', user.id, 'password changed');
  }

  /**
   * Starts a reset. NEVER reveals whether the e-mail exists: the caller always gets the same answer.
   * Abuse limits: at most 3 reset e-mails per account per hour, older unused links are invalidated,
   * links live 30 minutes and are single-use. The mail is sent in the background so response time
   * does not depend on the SMTP server (and so does not leak account existence).
   */
  async forgotPassword(email: string): Promise<void> {
    const user = await this.users.findOneBy({ email: email.trim().toLowerCase() });
    if (!user || !user.active) return;
    if (user.orgId) {
      const org = await this.orgs.findOneBy({ id: user.orgId });
      if (!org || org.status === 'suspended') return;
    }
    this.metrics.inc('syndicma_password_reset_requests_total');
    const recent = await this.resets.count({ where: { userId: user.id, createdAt: MoreThan(new Date(Date.now() - 3_600_000)) } });
    if (recent >= 3) return;

    await this.resets.update({ userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });
    const token = randomBytes(32).toString('base64url');
    await this.resets.insert({ userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) });
    await this.audit.log(user, 'request_reset', 'users', user.id, user.email);

    // Fragment (#), not query string: it is never sent to servers, proxies' logs or via Referer.
    const base = (this.config.get<string>('APP_URL') ?? 'http://localhost:4200').replace(/\/+$/, '');
    void this.mail
      .send({
        to: user.email,
        subject: 'Syndic.ma — Réinitialisation de votre mot de passe / إعادة تعيين كلمة المرور',
        text:
          `Bonjour ${user.name},

Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 30 minutes, usage unique) :
${base}/reset-password#token=${token}

` +
          `Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe reste inchangé.

` +
          `مرحباً،
لاختيار كلمة مرور جديدة افتح الرابط أعلاه (صالح 30 دقيقة ولمرة واحدة). إذا لم تطلب ذلك فتجاهل هذه الرسالة.`,
      })
      .catch((err) => this.logger.error(`reset mail failed for user ${user.id}: ${err instanceof Error ? err.message : err}`));
  }

  /** Single-use: the token is consumed atomically, then every session of the user is revoked. */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const invalid = () => new BadRequestException('Invalid or expired reset link');
    const row = await this.resets.findOneBy({ tokenHash: sha256(token) });
    if (!row || row.usedAt || row.expiresAt.getTime() < Date.now()) throw invalid();
    const consumed = await this.resets.update({ id: row.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!consumed.affected) throw invalid(); // lost a race with another use of the same link
    const user = await this.users.findOneBy({ id: row.userId });
    if (!user || !user.active) throw invalid();

    await this.users.update(user.id, { passwordHash: await bcrypt.hash(newPassword, COST) });
    await this.tokens.update({ userId: user.id, revokedAt: IsNull() }, { revokedAt: new Date() });
    await this.resets.update({ userId: user.id, usedAt: IsNull() }, { usedAt: new Date() });
    await this.audit.log(user, 'reset_password', 'users', user.id, user.email);
  }

  async logout(presented: string): Promise<void> {
    const row = await this.tokens.findOneBy({ tokenHash: sha256(presented) });
    if (row) await this.revokeFamily(row.family);
  }

  private revokeFamily(family: string) {
    return this.tokens.update({ family, revokedAt: IsNull() }, { revokedAt: new Date() });
  }

  private async issue(user: User, family: string): Promise<TokenPair> {
    const expiresIn = Number(this.config.get('ACCESS_TTL_SECONDS') ?? 900);
    const accessToken = await this.jwt.signAsync({ sub: user.id, orgId: user.orgId, role: user.role }, { expiresIn });
    const refreshToken = randomBytes(48).toString('base64url');
    const ttlDays = Number(this.config.get('REFRESH_TTL_DAYS') ?? 14);
    await this.tokens.insert({
      userId: user.id,
      tokenHash: sha256(refreshToken),
      family,
      expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
    });
    return { accessToken, refreshToken, expiresIn };
  }
}
