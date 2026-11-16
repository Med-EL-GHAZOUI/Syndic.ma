import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { Organization, RefreshToken, User } from '../entities';

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
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(RefreshToken) private readonly tokens: Repository<RefreshToken>,
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
    if (!user || !ok || !user.active) throw new UnauthorizedException(INVALID);
    if (user.orgId) {
      const org = await this.orgs.findOneBy({ id: user.orgId });
      if (!org || org.status === 'suspended') throw new UnauthorizedException(INVALID);
    }
    await this.users.update(user.id, { lastLoginAt: new Date() });
    await this.audit.log(user, 'login', 'users', user.id, user.email);
    return this.issue(user, randomUUID());
  }

  /** Rotate: a refresh token works exactly once. Re-presenting a used token revokes the whole family. */
  async refresh(presented: string): Promise<TokenPair> {
    const row = await this.tokens.findOneBy({ tokenHash: sha256(presented) });
    if (!row || row.revokedAt) throw new UnauthorizedException('Invalid refresh token');

    if (row.usedAt) {
      await this.revokeFamily(row.family);
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (row.expiresAt.getTime() < Date.now()) throw new UnauthorizedException('Refresh token expired');

    // Atomic "use once": only one concurrent request can flip used_at from NULL.
    const res = await this.tokens.update({ id: row.id, usedAt: IsNull() }, { usedAt: new Date() });
    if (!res.affected) {
      await this.revokeFamily(row.family);
      throw new UnauthorizedException('Refresh token reuse detected');
    }

    const user = await this.users.findOneBy({ id: row.userId });
    if (!user || !user.active) throw new UnauthorizedException('Invalid refresh token');
    return this.issue(user, row.family);
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
