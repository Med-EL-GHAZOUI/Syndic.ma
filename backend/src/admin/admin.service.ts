import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../common/audit.service';
import { page } from '../common/pagination';
import { ScopeService } from '../common/scope.service';
import { IsNull } from 'typeorm';
import { AuditLog, Organization, RefreshToken, Residence, User } from '../entities';
import { AuditQuery, CreateUserDto, OrganizationDto, UpdateUserDto } from './admin.dto';

// Credentials never leave the API: password hash and every MFA field are removed from user payloads.
const strip = ({ passwordHash, mfaSecret, mfaBackupCodes, mfaLastStep, mfaFailures, mfaLockedUntil, ...rest }: User) => rest;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Organization) private readonly orgs: Repository<Organization>,
    @InjectRepository(Residence) private readonly residences: Repository<Residence>,
    @InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---- users (organization level) -------------------------------------------------
  async listUsers(user: AuthUser) {
    const rows = await this.users.find({ where: { orgId: this.scope.requireOrg(user) }, order: { name: 'ASC' } });
    return rows.map(strip);
  }

  private async checkResidences(orgId: string, ids?: string[]) {
    if (!ids?.length) return;
    const found = await this.residences.countBy(ids.map((id) => ({ id, orgId })));
    if (found !== new Set(ids).size) throw new NotFoundException('Unknown residence');
  }

  async createUser(user: AuthUser, dto: CreateUserDto) {
    const orgId = this.scope.requireOrg(user);
    await this.checkResidences(orgId, dto.residenceIds);
    const email = dto.email.trim().toLowerCase();
    if (await this.users.findOneBy({ email })) throw new ConflictException('E-mail already in use');
    const row = await this.users.save(this.users.create({
      orgId, name: dto.name, email, passwordHash: AuthService.hashPassword(dto.password), role: dto.role, active: true,
      residenceIds: dto.role === 'manager' ? dto.residenceIds ?? [] : [], providerId: dto.role === 'provider' ? dto.providerId ?? null : null, lastLoginAt: null,
    }));
    await this.audit.log(user, 'create', 'users', row.id, row.email);
    return strip(row);
  }

  async updateUser(user: AuthUser, id: string, dto: UpdateUserDto) {
    const orgId = this.scope.requireOrg(user);
    const row = await this.users.findOneBy({ id, orgId });
    if (!row) throw new NotFoundException('User not found');
    if (row.id === user.id && (dto.active === false || (dto.role && dto.role !== row.role))) throw new ForbiddenException('You cannot disable or demote yourself');
    await this.checkResidences(orgId, dto.residenceIds);
    Object.assign(row, { ...dto });
    await this.users.save(row);
    await this.audit.log(user, 'update', 'users', id, row.email);
    return strip(row);
  }

  /** A user lost their authenticator and recovery codes: an organization admin removes the second factor and all sessions. */
  async resetMfa(user: AuthUser, id: string) {
    const row = await this.users.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('User not found');
    if (row.id === user.id) throw new ForbiddenException('Use the two-factor settings page to change your own second factor');
    await this.users.update(id, { mfaEnabled: false, mfaSecret: null, mfaLastStep: null, mfaBackupCodes: [], mfaFailures: 0, mfaLockedUntil: null });
    await this.users.manager.update(RefreshToken, { userId: id, revokedAt: IsNull() }, { revokedAt: new Date() });
    await this.audit.log(user, 'mfa_reset', 'users', id, row.email);
  }

  // ---- organizations (platform level, super_admin) ------------------------------------
  listOrgs() {
    return this.orgs.find({ order: { name: 'ASC' } });
  }

  async createOrg(user: AuthUser, dto: OrganizationDto) {
    const row = await this.orgs.save(this.orgs.create(dto));
    await this.audit.log({ ...user, orgId: null }, 'create', 'organizations', row.id, row.name);
    return row;
  }

  async updateOrg(user: AuthUser, id: string, dto: OrganizationDto) {
    const row = await this.orgs.findOneBy({ id });
    if (!row) throw new NotFoundException('Organization not found');
    Object.assign(row, dto);
    await this.orgs.save(row);
    await this.audit.log({ ...user, orgId: null }, dto.status === 'suspended' ? 'suspend' : 'update', 'organizations', id, row.name);
    return row;
  }

  // ---- audit (read-only) ----------------------------------------------------------------
  listAudit(user: AuthUser, q: AuditQuery) {
    const where: Record<string, unknown> = user.role === 'super_admin' ? {} : { orgId: this.scope.requireOrg(user) };
    if (q.action) where.action = q.action;
    if (q.entity) where.entity = q.entity;
    return this.logs.find({ where, order: { createdAt: 'DESC' }, ...page(q) });
  }
}
