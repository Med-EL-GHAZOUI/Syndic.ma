import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../common/audit.service';
import { page } from '../common/pagination';
import { RESIDENT_ROLES } from '../common/permissions';
import { ScopeService } from '../common/scope.service';
import { Building, Charge, Residence, Resident, Unit } from '../entities';
import { BuildingDto, EndOccupancyDto, ResidenceDto, ResidentDto, ResidentQuery, UnitDto, UnitQuery } from './properties.dto';

@Injectable()
export class PropertiesService {
  constructor(
    @InjectRepository(Residence) private readonly residences: Repository<Residence>,
    @InjectRepository(Building) private readonly buildings: Repository<Building>,
    @InjectRepository(Unit) private readonly units: Repository<Unit>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    @InjectRepository(Charge) private readonly charges: Repository<Charge>,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ---- residences ----------------------------------------------------------
  async listResidences(user: AuthUser) {
    const ids = await this.scope.residenceIds(user);
    return ids.length ? this.residences.find({ where: { orgId: this.scope.requireOrg(user), id: In(ids) }, order: { name: 'ASC' } }) : [];
  }

  async getResidence(user: AuthUser, id: string) {
    await this.scope.assertResidence(user, id);
    const row = await this.residences.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Residence not found');
    return row;
  }

  async createResidence(user: AuthUser, dto: ResidenceDto) {
    const row = await this.residences.save(this.residences.create({ ...dto, orgId: this.scope.requireOrg(user), yearBuilt: dto.yearBuilt ?? null, monthlyFee: dto.monthlyFee ?? null }));
    await this.audit.log(user, 'create', 'residences', row.id, row.name);
    return row;
  }

  async updateResidence(user: AuthUser, id: string, dto: ResidenceDto) {
    const row = await this.getResidence(user, id);
    Object.assign(row, dto);
    await this.residences.save(row);
    await this.audit.log(user, 'update', 'residences', id, row.name);
    return row;
  }

  async removeResidence(user: AuthUser, id: string) {
    const row = await this.getResidence(user, id);
    if (await this.units.countBy({ residenceId: id })) throw new ConflictException('Residence still has units');
    await this.buildings.delete({ residenceId: id, orgId: row.orgId });
    await this.residences.delete({ id, orgId: row.orgId });
    await this.audit.log(user, 'delete', 'residences', id, row.name);
  }

  // ---- buildings -------------------------------------------------------------
  async listBuildings(user: AuthUser, residenceId: string) {
    await this.scope.assertResidence(user, residenceId);
    return this.buildings.find({ where: { orgId: this.scope.requireOrg(user), residenceId }, order: { name: 'ASC' } });
  }

  async createBuilding(user: AuthUser, dto: BuildingDto) {
    await this.scope.assertResidence(user, dto.residenceId);
    if (await this.buildings.findOneBy({ residenceId: dto.residenceId, name: dto.name })) throw new ConflictException('Building name already used in this residence');
    const row = await this.buildings.save(this.buildings.create({ ...dto, elevator: dto.elevator ?? false, orgId: this.scope.requireOrg(user) }));
    await this.audit.log(user, 'create', 'buildings', row.id, row.name);
    return row;
  }

  private async ownedBuilding(user: AuthUser, id: string) {
    const row = await this.buildings.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Building not found');
    await this.scope.assertResidence(user, row.residenceId);
    return row;
  }

  async updateBuilding(user: AuthUser, id: string, dto: BuildingDto) {
    const row = await this.ownedBuilding(user, id);
    if (dto.residenceId !== row.residenceId) throw new BadRequestException('A building cannot change residence');
    Object.assign(row, { name: dto.name, floors: dto.floors, elevator: dto.elevator ?? row.elevator });
    await this.buildings.save(row);
    await this.audit.log(user, 'update', 'buildings', id, row.name);
    return row;
  }

  async removeBuilding(user: AuthUser, id: string) {
    const row = await this.ownedBuilding(user, id);
    if (await this.units.countBy({ buildingId: id })) throw new ConflictException('Building still has units');
    await this.buildings.delete({ id });
    await this.audit.log(user, 'delete', 'buildings', id, row.name);
  }

  // ---- units --------------------------------------------------------------------
  async listUnits(user: AuthUser, q: UnitQuery) {
    const orgId = this.scope.requireOrg(user);
    const where: FindOptionsWhere<Unit> = { orgId };
    if (RESIDENT_ROLES.includes(user.role)) where.id = In(await this.scope.residentUnitIds(user));
    else {
      const ids = await this.scope.residenceIds(user);
      if (q.residenceId && !ids.includes(q.residenceId)) throw new NotFoundException('Residence not found');
      where.residenceId = q.residenceId ?? In(ids);
    }
    if (q.buildingId) where.buildingId = q.buildingId;
    return this.units.find({ where, order: { number: 'ASC' }, ...page(q) });
  }

  async getUnit(user: AuthUser, id: string) {
    return this.scope.unitFor(user, id);
  }

  async createUnit(user: AuthUser, dto: UnitDto) {
    const building = await this.ownedBuilding(user, dto.buildingId);
    if (await this.units.findOneBy({ buildingId: building.id, number: dto.number })) throw new ConflictException('Unit number already used in this building');
    const row = await this.units.save(this.units.create({ ...dto, rooms: dto.rooms ?? null, orgId: building.orgId, residenceId: building.residenceId }));
    await this.audit.log(user, 'create', 'units', row.id, `${building.name} ${row.number}`);
    return row;
  }

  async updateUnit(user: AuthUser, id: string, dto: UnitDto) {
    const unit = await this.scope.unitFor(user, id);
    if (dto.buildingId !== unit.buildingId) throw new BadRequestException('A unit cannot change building');
    const clash = await this.units.findOneBy({ buildingId: unit.buildingId, number: dto.number });
    if (clash && clash.id !== id) throw new ConflictException('Unit number already used in this building');
    Object.assign(unit, { number: dto.number, floor: dto.floor, type: dto.type, rooms: dto.rooms ?? null, area: dto.area, tantiemes: dto.tantiemes });
    await this.units.save(unit);
    await this.audit.log(user, 'update', 'units', id, unit.number);
    return unit;
  }

  async removeUnit(user: AuthUser, id: string) {
    const unit = await this.scope.unitFor(user, id);
    if (await this.charges.countBy({ unitId: id })) throw new ConflictException('Unit has charges and cannot be deleted');
    if (await this.residents.countBy({ unitId: id, active: true })) throw new ConflictException('Unit has active residents');
    await this.units.delete({ id });
    await this.audit.log(user, 'delete', 'units', id, unit.number);
  }

  // ---- residents ------------------------------------------------------------------
  async listResidents(user: AuthUser, q: ResidentQuery) {
    const orgId = this.scope.requireOrg(user);
    const ids = await this.scope.residenceIds(user);
    if (!ids.length) return [];
    const where: FindOptionsWhere<Resident> = { orgId, residenceId: In(ids) };
    if (q.unitId) where.unitId = q.unitId;
    if (q.active !== undefined) where.active = q.active;
    return this.residents.find({ where, order: { lastName: 'ASC' }, ...page(q) });
  }

  async createResident(user: AuthUser, dto: ResidentDto) {
    const unit = await this.scope.unitFor(user, dto.unitId);
    if (await this.residents.findOneBy({ unitId: unit.id, type: dto.type, active: true })) {
      throw new ConflictException(`This unit already has an active ${dto.type}`);
    }
    const row = await this.residents.save(this.residents.create({
      ...dto, phone: dto.phone?.replace(/[\s.-]/g, ''), livesIn: dto.type === 'tenant' ? true : dto.livesIn ?? true,
      orgId: unit.orgId, residenceId: unit.residenceId, userId: null, until: null, active: true,
    }));
    await this.audit.log(user, 'create', 'residents', row.id, `${row.firstName} ${row.lastName}`);
    return row;
  }

  async endOccupancy(user: AuthUser, id: string, dto: EndOccupancyDto) {
    const row = await this.residents.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Resident not found');
    await this.scope.assertResidence(user, row.residenceId);
    if (!row.active) throw new ConflictException('Occupancy already ended');
    if (dto.until < row.since) throw new BadRequestException('End date is before start date');
    Object.assign(row, { until: dto.until, active: false });
    await this.residents.save(row); // history is kept
    await this.audit.log(user, 'update', 'residents', id, `end ${row.firstName} ${row.lastName}`);
    return row;
  }
}
