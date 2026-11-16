import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../common/audit.service';
import { page, PageQuery } from '../common/pagination';
import { RESIDENT_ROLES } from '../common/permissions';
import { ScopeService } from '../common/scope.service';
import { Assembly, Unit } from '../entities';
import { AssemblyDto, AttendanceDto, MinutesDto, ResolutionDto } from './community.dto';

/**
 * Votes are weighted by tantièmes. The result computed here is INDICATIVE (simple majority of
 * expressed votes); legal quorum / majority / convocation-delay rules (Law 18-00 as amended by
 * Law 106-12) must be confirmed by a lawyer before being enforced.
 */
@Injectable()
export class AssembliesService {
  constructor(
    @InjectRepository(Assembly) private readonly repo: Repository<Assembly>,
    @InjectRepository(Unit) private readonly units: Repository<Unit>,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser, q: PageQuery) {
    const ids = await this.scope.residenceIds(user);
    if (!ids.length) return [];
    const where = { orgId: this.scope.requireOrg(user), residenceId: In(ids), ...(RESIDENT_ROLES.includes(user.role) ? { status: In(['convened', 'held']) } : {}) };
    return this.repo.find({ where, order: { date: 'DESC' }, ...page(q) });
  }

  async get(user: AuthUser, id: string) {
    const row = await this.repo.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Assembly not found');
    await this.scope.assertResidence(user, row.residenceId);
    // Residents cannot see assemblies that have not been convened yet (drafts / cancelled).
    if (RESIDENT_ROLES.includes(user.role) && !['convened', 'held'].includes(row.status)) throw new NotFoundException('Assembly not found');
    return row;
  }

  async create(user: AuthUser, dto: AssemblyDto) {
    await this.scope.assertResidence(user, dto.residenceId);
    const units = await this.units.find({ where: { orgId: this.scope.requireOrg(user), residenceId: dto.residenceId } });
    const row = await this.repo.save(this.repo.create({
      ...dto, orgId: this.scope.requireOrg(user), status: 'planned', resolutions: [], minutes: '',
      attendance: units.map((u) => ({ unitId: u.id, status: 'absent' as const, proxyTo: '' })),
    }));
    await this.audit.log(user, 'create', 'assemblies', row.id, row.title);
    return row;
  }

  async update(user: AuthUser, id: string, dto: AssemblyDto) {
    const row = await this.get(user, id);
    if (!['planned', 'convened'].includes(row.status)) throw new ConflictException('A held or cancelled assembly cannot be edited');
    if (dto.residenceId !== row.residenceId) throw new BadRequestException('An assembly cannot change residence');
    Object.assign(row, { title: dto.title, type: dto.type, date: dto.date, time: dto.time, location: dto.location, agenda: dto.agenda });
    await this.repo.save(row);
    await this.audit.log(user, 'update', 'assemblies', id, row.title);
    return row;
  }

  private async transition(user: AuthUser, id: string, from: Assembly['status'][], to: Assembly['status'], action: string) {
    const row = await this.get(user, id);
    const res = await this.repo.createQueryBuilder().update(Assembly).set({ status: to }).where('id = :id AND status IN (:...from)', { id, from }).execute();
    if (!res.affected) throw new ConflictException(`Assembly is ${row.status}; cannot ${action}`);
    await this.audit.log(user, action, 'assemblies', id, row.title);
    return { id, status: to };
  }

  convene(user: AuthUser, id: string) { return this.transition(user, id, ['planned'], 'convened', 'convene'); }
  hold(user: AuthUser, id: string) { return this.transition(user, id, ['convened'], 'held', 'held'); }
  cancel(user: AuthUser, id: string) { return this.transition(user, id, ['planned', 'convened'], 'cancelled', 'cancel'); }

  async remove(user: AuthUser, id: string) {
    const row = await this.get(user, id);
    if (row.status === 'held') throw new ConflictException('A held assembly is part of the record and cannot be deleted');
    await this.repo.delete({ id });
    await this.audit.log(user, 'delete', 'assemblies', id, row.title);
  }

  private async representedTantiemes(a: Assembly): Promise<number> {
    const ids = a.attendance.filter((x) => x.status !== 'absent').map((x) => x.unitId);
    if (!ids.length) return 0;
    const units = await this.units.find({ where: { id: In(ids), orgId: a.orgId }, select: ['tantiemes'] });
    return units.reduce((s, u) => s + u.tantiemes, 0);
  }

  async setAttendance(user: AuthUser, id: string, dto: AttendanceDto) {
    const row = await this.get(user, id);
    if (row.status !== 'convened') throw new ConflictException('Attendance can only be recorded while the assembly is convened');
    if (!row.attendance.some((a) => a.unitId === dto.unitId)) throw new NotFoundException('Unit is not part of this assembly');
    if (dto.status === 'proxy' && !dto.proxyTo?.trim()) throw new BadRequestException('proxyTo is required for a proxy');
    row.attendance = row.attendance.map((a) => (a.unitId === dto.unitId ? { unitId: a.unitId, status: dto.status, proxyTo: dto.status === 'proxy' ? dto.proxyTo!.trim() : '' } : a));
    // Lowering the represented tantièmes must not leave already-cast votes impossible.
    const represented = await this.representedTantiemes(row);
    if (row.resolutions.some((r) => r.votesFor + r.votesAgainst + r.abstain > represented)) throw new ConflictException('Existing votes exceed the represented tantièmes; adjust the resolutions first');
    await this.repo.save(row);
    return { quorumTantiemes: represented, attendance: row.attendance };
  }

  private async checkVotes(row: Assembly, dto: ResolutionDto) {
    const represented = await this.representedTantiemes(row);
    if (dto.votesFor + dto.votesAgainst + dto.abstain > represented) throw new BadRequestException(`Votes exceed the represented tantièmes (${represented})`);
  }

  async addResolution(user: AuthUser, id: string, dto: ResolutionDto) {
    const row = await this.get(user, id);
    if (row.status !== 'convened') throw new ConflictException('Resolutions can only be edited while the assembly is convened');
    await this.checkVotes(row, dto);
    row.resolutions = [...row.resolutions, { id: randomUUID(), ...dto }];
    await this.repo.save(row);
    await this.audit.log(user, 'update', 'assemblies', id, `resolution: ${dto.title}`);
    return row;
  }

  async updateResolution(user: AuthUser, id: string, rid: string, dto: ResolutionDto) {
    const row = await this.get(user, id);
    if (row.status !== 'convened') throw new ConflictException('Resolutions can only be edited while the assembly is convened');
    if (!row.resolutions.some((r) => r.id === rid)) throw new NotFoundException('Resolution not found');
    await this.checkVotes(row, dto);
    row.resolutions = row.resolutions.map((r) => (r.id === rid ? { id: rid, ...dto } : r));
    await this.repo.save(row);
    await this.audit.log(user, 'update', 'assemblies', id, `resolution: ${dto.title}`);
    return row;
  }

  async setMinutes(user: AuthUser, id: string, dto: MinutesDto) {
    const row = await this.get(user, id);
    if (!['convened', 'held'].includes(row.status)) throw new ConflictException('Minutes need a convened or held assembly');
    await this.repo.update({ id }, { minutes: dto.minutes });
    await this.audit.log(user, 'update', 'assemblies', id, 'minutes');
    return { id };
  }

  /** Read model with tantième-weighted quorum and per-resolution (indicative) result. */
  async view(user: AuthUser, id: string) {
    const row = await this.get(user, id);
    const total = (await this.units.find({ where: { orgId: row.orgId, residenceId: row.residenceId }, select: ['tantiemes'] })).reduce((s, u) => s + u.tantiemes, 0);
    const represented = await this.representedTantiemes(row);
    return {
      ...row,
      quorum: { represented, total, ratio: total ? represented / total : 0 },
      resolutions: row.resolutions.map((r) => ({ ...r, result: r.votesFor + r.votesAgainst + r.abstain === 0 ? 'pending' : r.votesFor > r.votesAgainst ? 'adopted' : 'rejected' })),
      legalNote: 'Indicative result — legal quorum/majority rules must be verified.',
    };
  }
}
