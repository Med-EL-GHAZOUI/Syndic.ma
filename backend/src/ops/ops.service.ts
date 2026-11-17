import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../common/audit.service';
import { page, PageQuery } from '../common/pagination';
import { PeriodService } from '../common/period.service';
import { RESIDENT_ROLES } from '../common/permissions';
import { ScopeService } from '../common/scope.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Announcement, Complaint, Expense, Provider } from '../entities';
import { AnnouncementDto, CommentDto, ComplaintDto, ComplaintStatusDto, ExpenseDto, ExpenseQuery, ProviderDto } from './ops.dto';

@Injectable()
export class OpsService {
  constructor(
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @InjectRepository(Expense) private readonly expenses: Repository<Expense>,
    @InjectRepository(Complaint) private readonly complaints: Repository<Complaint>,
    @InjectRepository(Announcement) private readonly announcements: Repository<Announcement>,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly period: PeriodService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---- providers --------------------------------------------------------------------
  listProviders(user: AuthUser, q: PageQuery) {
    return this.providers.find({ where: { orgId: this.scope.requireOrg(user) }, order: { name: 'ASC' }, ...page(q) });
  }

  async createProvider(user: AuthUser, dto: ProviderDto) {
    const row = await this.providers.save(this.providers.create({ ...dto, rating: dto.rating ?? 3, active: dto.active ?? true, orgId: this.scope.requireOrg(user) }));
    await this.audit.log(user, 'create', 'providers', row.id, row.name);
    return row;
  }

  async updateProvider(user: AuthUser, id: string, dto: ProviderDto) {
    const row = await this.providers.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Provider not found');
    Object.assign(row, dto);
    await this.providers.save(row);
    await this.audit.log(user, 'update', 'providers', id, row.name);
    return row;
  }

  // ---- expenses -----------------------------------------------------------------------
  async listExpenses(user: AuthUser, q: ExpenseQuery) {
    const ids = await this.scope.residenceIds(user);
    if (!ids.length) return [];
    return this.expenses.find({ where: { orgId: this.scope.requireOrg(user), residenceId: In(ids), ...(q.status ? { status: q.status as Expense['status'] } : {}) }, order: { date: 'DESC' }, ...page(q) });
  }

  private async providerOk(user: AuthUser, providerId?: string) {
    if (providerId && !(await this.providers.findOneBy({ id: providerId, orgId: this.scope.requireOrg(user) }))) throw new BadRequestException('Unknown provider');
  }

  async createExpense(user: AuthUser, dto: ExpenseDto) {
    await this.scope.assertResidence(user, dto.residenceId);
    await this.providerOk(user, dto.providerId);
    await this.period.assertOpen(this.scope.requireOrg(user), dto.residenceId, dto.date);
    const row = await this.expenses.save(this.expenses.create({ ...dto, providerId: dto.providerId ?? null, orgId: this.scope.requireOrg(user), status: 'pending', paidAt: null, cancelReason: null }));
    await this.audit.log(user, 'create', 'expenses', row.id, `${row.label} — ${row.amount}`);
    return row;
  }

  private async ownedExpense(user: AuthUser, id: string) {
    const row = await this.expenses.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Expense not found');
    await this.scope.assertResidence(user, row.residenceId);
    return row;
  }

  async updateExpense(user: AuthUser, id: string, dto: ExpenseDto) {
    const row = await this.ownedExpense(user, id);
    if (row.status !== 'pending') throw new ConflictException('Only pending expenses can be edited');
    if (dto.residenceId !== row.residenceId) throw new BadRequestException('An expense cannot change residence');
    await this.providerOk(user, dto.providerId);
    await this.period.assertOpen(row.orgId, row.residenceId, row.date);
    await this.period.assertOpen(row.orgId, row.residenceId, dto.date);
    Object.assign(row, { ...dto, providerId: dto.providerId ?? null });
    await this.expenses.save(row);
    await this.audit.log(user, 'update', 'expenses', id, row.label);
    return row;
  }

  /** pending -> approved -> paid. Each step is a guarded transition; paid expenses are never deleted. */
  async transitionExpense(user: AuthUser, id: string, from: Expense['status'], to: Expense['status'], action: string) {
    const row = await this.ownedExpense(user, id);
    if (row.status !== from) throw new ConflictException(`Expense must be ${from} to ${action}`);
    await this.period.assertOpen(row.orgId, row.residenceId, row.date);
    const res = await this.expenses.update({ id, status: from }, { status: to, paidAt: to === 'paid' ? new Date() : row.paidAt });
    if (!res.affected) throw new ConflictException('Expense was modified concurrently');
    await this.audit.log(user, action, 'expenses', id, row.label);
    return { id, status: to };
  }

  async cancelExpense(user: AuthUser, id: string, reason: string) {
    const row = await this.ownedExpense(user, id);
    if (!['approved', 'paid'].includes(row.status)) throw new ConflictException('Only approved or paid expenses are cancelled (pending ones can be deleted by editing)');
    await this.period.assertOpen(row.orgId, row.residenceId, row.date);
    await this.expenses.update({ id }, { status: 'cancelled', cancelReason: reason });
    await this.audit.log(user, 'cancel', 'expenses', id, reason);
    return { id, status: 'cancelled' };
  }

  // ---- complaints -------------------------------------------------------------------------
  async listComplaints(user: AuthUser, q: PageQuery) {
    const orgId = this.scope.requireOrg(user);
    if (RESIDENT_ROLES.includes(user.role)) return this.complaints.find({ where: { orgId, authorId: user.id }, order: { createdAt: 'DESC' }, ...page(q) });
    const ids = await this.scope.residenceIds(user);
    return ids.length ? this.complaints.find({ where: { orgId, residenceId: In(ids) }, order: { createdAt: 'DESC' }, ...page(q) }) : [];
  }

  async createComplaint(user: AuthUser, dto: ComplaintDto) {
    let residenceId = dto.residenceId;
    let unitId = dto.unitId ?? null;
    if (RESIDENT_ROLES.includes(user.role)) {
      if (!dto.unitId) throw new BadRequestException('unitId is required');
      const unit = await this.scope.unitFor(user, dto.unitId);
      residenceId = unit.residenceId;
    } else {
      if (!residenceId) throw new BadRequestException('residenceId is required');
      await this.scope.assertResidence(user, residenceId);
      if (unitId) {
        const unit = await this.scope.unitFor(user, unitId);
        if (unit.residenceId !== residenceId) throw new BadRequestException('Unit does not belong to this residence');
      }
    }
    const row = await this.complaints.save(this.complaints.create({
      orgId: this.scope.requireOrg(user), residenceId: residenceId!, unitId, authorId: user.id, title: dto.title, category: dto.category,
      priority: dto.priority, description: dto.description, status: 'new', comments: [],
    }));
    await this.audit.log(user, 'create', 'complaints', row.id, row.title);
    await this.notifications.toStaff(row.orgId, row.residenceId, { type: 'complaintNew', params: { title: row.title }, link: '/complaints' }, ['syndic_admin', 'manager'], user.id);
    return row;
  }

  private async visibleComplaint(user: AuthUser, id: string) {
    const row = await this.complaints.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Complaint not found');
    if (RESIDENT_ROLES.includes(user.role)) {
      if (row.authorId !== user.id) throw new NotFoundException('Complaint not found');
    } else await this.scope.assertResidence(user, row.residenceId);
    return row;
  }

  async setComplaintStatus(user: AuthUser, id: string, dto: ComplaintStatusDto) {
    const row = await this.visibleComplaint(user, id);
    row.status = dto.status;
    await this.complaints.save(row);
    await this.audit.log(user, 'update', 'complaints', id, `status ${dto.status}`);
    await this.notifications.toUser(row.orgId, row.authorId, { type: 'complaintUpdated', params: { title: row.title }, link: '/complaints' }, user.id);
    return row;
  }

  async comment(user: AuthUser, id: string, dto: CommentDto) {
    const row = await this.visibleComplaint(user, id);
    if (row.status === 'closed') throw new ConflictException('Complaint is closed');
    row.comments = [...row.comments, { byId: user.id, byName: user.name, at: new Date().toISOString(), text: dto.text }];
    await this.complaints.save(row);
    // the author is told about a staff reply; staff are told about the author's follow-up
    if (user.id === row.authorId) await this.notifications.toStaff(row.orgId, row.residenceId, { type: 'complaintReply', params: { title: row.title }, link: '/complaints' }, ['syndic_admin', 'manager'], user.id);
    else await this.notifications.toUser(row.orgId, row.authorId, { type: 'complaintReply', params: { title: row.title }, link: '/complaints' }, user.id);
    return row;
  }

  // ---- announcements -----------------------------------------------------------------------
  async listAnnouncements(user: AuthUser, q: PageQuery) {
    const ids = await this.scope.residenceIds(user);
    if (!ids.length) return [];
    const audiences = user.role === 'owner' ? ['all', 'owners'] : user.role === 'tenant' ? ['all'] : ['all', 'owners', 'staff'];
    return this.announcements.find({ where: { orgId: this.scope.requireOrg(user), residenceId: In(ids), audience: In(audiences) }, order: { pinned: 'DESC', publishedAt: 'DESC' }, ...page(q) });
  }

  async createAnnouncement(user: AuthUser, dto: AnnouncementDto) {
    await this.scope.assertResidence(user, dto.residenceId);
    const row = await this.announcements.save(this.announcements.create({ ...dto, pinned: dto.pinned ?? false, orgId: this.scope.requireOrg(user), authorName: user.name }));
    await this.audit.log(user, 'create', 'announcements', row.id, row.title);
    const n = { type: 'announcement', params: { title: row.title }, link: '/announcements' };
    if (row.audience === 'staff') await this.notifications.toStaff(row.orgId, row.residenceId, n, undefined, user.id);
    else await this.notifications.toResidents(row.orgId, row.residenceId, n, row.audience === 'owners' ? ['owner'] : undefined, user.id);
    return row;
  }

  async deleteAnnouncement(user: AuthUser, id: string) {
    const row = await this.announcements.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Announcement not found');
    await this.scope.assertResidence(user, row.residenceId);
    await this.announcements.delete({ id });
    await this.audit.log(user, 'delete', 'announcements', id, row.title);
  }

  forbidResidents(user: AuthUser) {
    if (RESIDENT_ROLES.includes(user.role)) throw new ForbiddenException();
  }
}
