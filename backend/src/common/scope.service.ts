import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from './auth-user';
import { RESIDENT_ROLES } from './permissions';
import { Residence, Resident, Unit } from '../entities';

/**
 * Tenant & residence isolation. EVERY data access goes through these helpers:
 *  - org: a user only ever sees rows of their own organization (super_admin has no org data access);
 *  - managers: restricted to their assigned residences;
 *  - residents: restricted to the residences/units they are linked to.
 * Rows outside the scope are reported as 404 (not 403) so existence is not leaked.
 */
@Injectable()
export class ScopeService {
  constructor(
    @InjectRepository(Residence) private readonly residences: Repository<Residence>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    @InjectRepository(Unit) private readonly units: Repository<Unit>,
  ) {}

  requireOrg(user: AuthUser): string {
    if (!user.orgId) throw new ForbiddenException('Organization context required');
    return user.orgId;
  }

  /** Units a resident is linked to (active occupancies). */
  async residentUnitIds(user: AuthUser): Promise<string[]> {
    const rows = await this.residents.find({ where: { orgId: this.requireOrg(user), userId: user.id, active: true } });
    return rows.map((r) => r.unitId);
  }

  /** Residence ids visible to the user inside their organization. */
  async residenceIds(user: AuthUser): Promise<string[]> {
    const orgId = this.requireOrg(user);
    if (RESIDENT_ROLES.includes(user.role)) {
      const rows = await this.residents.find({ where: { orgId, userId: user.id, active: true } });
      return [...new Set(rows.map((r) => r.residenceId))];
    }
    const all = await this.residences.find({ where: { orgId }, select: ['id'] });
    const ids = all.map((r) => r.id);
    if (user.role === 'manager' && user.residenceIds.length) return ids.filter((id) => user.residenceIds.includes(id));
    return ids;
  }

  async assertResidence(user: AuthUser, residenceId: string): Promise<void> {
    const ids = await this.residenceIds(user);
    if (!ids.includes(residenceId)) throw new NotFoundException('Residence not found');
  }

  /** Load a unit the user may access (residents: only their own lots). */
  async unitFor(user: AuthUser, unitId: string): Promise<Unit> {
    const orgId = this.requireOrg(user);
    const unit = await this.units.findOneBy({ id: unitId, orgId });
    if (!unit) throw new NotFoundException('Unit not found');
    if (RESIDENT_ROLES.includes(user.role)) {
      if (!(await this.residentUnitIds(user)).includes(unit.id)) throw new NotFoundException('Unit not found');
    } else {
      await this.assertResidence(user, unit.residenceId);
    }
    return unit;
  }

  async unitIdsInResidences(orgId: string, residenceIds: string[]): Promise<string[]> {
    if (!residenceIds.length) return [];
    const rows = await this.units.find({ where: { orgId, residenceId: In(residenceIds) }, select: ['id'] });
    return rows.map((u) => u.id);
  }
}
