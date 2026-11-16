import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { Organization, User } from '../entities';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      algorithms: ['HS256'],
      ignoreExpiration: false,
    });
  }

  /** Authorization data is re-read from the DB on every request: role changes, disabling a user
   *  or suspending an organization take effect immediately, not when the access token expires. */
  async validate(payload: { sub: string }): Promise<AuthUser> {
    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user || !user.active) throw new UnauthorizedException();
    if (user.orgId) {
      const org = await this.orgs.findOneBy({ id: user.orgId });
      if (!org || org.status === 'suspended') throw new UnauthorizedException();
    }
    return { id: user.id, orgId: user.orgId, name: user.name, email: user.email, role: user.role, residenceIds: user.residenceIds ?? [], providerId: user.providerId };
  }
}
