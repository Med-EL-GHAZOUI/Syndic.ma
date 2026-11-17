import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { AuditService } from '../common/audit.service';
import { page } from '../common/pagination';
import { can } from '../common/permissions';
import { ScopeService } from '../common/scope.service';
import { NotificationsService } from '../notifications/notifications.service';
import { Complaint, Expense, Provider, WorkOrder } from '../entities';
import { CompleteWorkDto, NoteDto, WorkOrderDto, WorkQuery } from './community.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(WorkOrder) private readonly orders: Repository<WorkOrder>,
    @InjectRepository(Provider) private readonly providers: Repository<Provider>,
    @InjectRepository(Complaint) private readonly complaints: Repository<Complaint>,
    private readonly ds: DataSource,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(user: AuthUser, q: WorkQuery) {
    const orgId = this.scope.requireOrg(user);
    const status = q.status ? { status: q.status as WorkOrder['status'] } : {};
    // A provider only ever sees the work orders assigned to THEIR company.
    if (user.role === 'provider') {
      if (!user.providerId) return [];
      return this.orders.find({ where: { orgId, providerId: user.providerId, ...status }, order: { scheduledDate: 'DESC' }, ...page(q) });
    }
    const ids = await this.scope.residenceIds(user);
    return ids.length ? this.orders.find({ where: { orgId, residenceId: In(ids), ...status }, order: { scheduledDate: 'DESC' }, ...page(q) }) : [];
  }

  private async accessible(user: AuthUser, id: string) {
    const row = await this.orders.findOneBy({ id, orgId: this.scope.requireOrg(user) });
    if (!row) throw new NotFoundException('Work order not found');
    if (user.role === 'provider') {
      if (row.providerId !== user.providerId) throw new NotFoundException('Work order not found');
    } else await this.scope.assertResidence(user, row.residenceId);
    return row;
  }

  async create(user: AuthUser, dto: WorkOrderDto) {
    const orgId = this.scope.requireOrg(user);
    await this.scope.assertResidence(user, dto.residenceId);
    if (!(await this.providers.findOneBy({ id: dto.providerId, orgId, active: true }))) throw new BadRequestException('Unknown or inactive provider');
    let complaint: Complaint | null = null;
    if (dto.complaintId) {
      complaint = await this.complaints.findOneBy({ id: dto.complaintId, orgId, residenceId: dto.residenceId });
      if (!complaint) throw new BadRequestException('Complaint not found in this residence');
    }
    const row = await this.orders.save(this.orders.create({
      orgId, residenceId: dto.residenceId, title: dto.title, type: dto.type, providerId: dto.providerId, complaintId: dto.complaintId ?? null,
      scheduledDate: dto.scheduledDate, estimatedCost: dto.estimatedCost ?? null, actualCost: null, status: 'planned', description: dto.description ?? null, notes: [],
    }));
    if (complaint && complaint.status === 'new') await this.complaints.update({ id: complaint.id }, { status: 'in_progress' });
    await this.audit.log(user, 'create', 'maintenance', row.id, row.title);
    await this.notifications.toProvider(orgId, row.providerId, { type: 'maintenanceAssigned', params: { title: row.title }, link: '/maintenance' });
    return row;
  }

  async start(user: AuthUser, id: string) {
    const row = await this.accessible(user, id);
    const res = await this.orders.update({ id, status: 'planned' }, { status: 'in_progress' });
    if (!res.affected) throw new ConflictException(`Work order is ${row.status}, expected planned`);
    await this.audit.log(user, 'start', 'maintenance', id, row.title);
    return { id, status: 'in_progress' };
  }

  async complete(user: AuthUser, id: string, dto: CompleteWorkDto) {
    await this.accessible(user, id);
    const result = await this.ds.transaction(async (m) => {
      const [row] = await m.query('SELECT * FROM work_orders WHERE id = $1 AND org_id = $2 FOR UPDATE', [id, user.orgId]);
      if (row.status !== 'in_progress') throw new ConflictException('Only in-progress work orders can be completed');
      const notes = dto.note ? [...row.notes, { byId: user.id, byName: user.name, at: new Date().toISOString(), text: dto.note }] : row.notes;
      await m.update(WorkOrder, { id }, { status: 'done', actualCost: dto.actualCost, notes });
      // Creating an expense is a finance act: only roles allowed to create expenses may trigger it.
      if (dto.createExpense && dto.actualCost > 0) {
        if (!can(user.role, 'expenses', 'c')) throw new BadRequestException('You are not allowed to create expenses');
        await m.insert(Expense, {
          orgId: user.orgId!, residenceId: row.residence_id, category: 'repairs', label: row.title, amount: dto.actualCost,
          date: new Date().toISOString().slice(0, 10), providerId: row.provider_id, status: 'pending', paidAt: null, cancelReason: null,
        });
      }
      if (row.complaint_id) await m.update(Complaint, { id: row.complaint_id, orgId: user.orgId! }, { status: 'resolved' });
      await this.audit.log(user, 'complete', 'maintenance', id, row.title, m);
      return { id, status: 'done', title: row.title as string, residenceId: row.residence_id as string };
    });
    // after the commit: telling people is best effort and must not be part of the transaction
    await this.notifications.toStaff(user.orgId!, result.residenceId, { type: 'maintenanceDone', params: { title: result.title }, link: '/maintenance' }, ['syndic_admin', 'manager'], user.id);
    return { id: result.id, status: result.status };
  }

  async cancel(user: AuthUser, id: string) {
    const row = await this.accessible(user, id);
    if (user.role === 'provider') throw new NotFoundException('Work order not found');
    if (!['planned', 'in_progress'].includes(row.status)) throw new ConflictException('Only open work orders can be cancelled');
    await this.orders.update({ id }, { status: 'cancelled' });
    await this.audit.log(user, 'cancel', 'maintenance', id, row.title);
    return { id, status: 'cancelled' };
  }

  async addNote(user: AuthUser, id: string, dto: NoteDto) {
    const row = await this.accessible(user, id);
    if (!['planned', 'in_progress'].includes(row.status)) throw new ConflictException('Work order is closed');
    row.notes = [...row.notes, { byId: user.id, byName: user.name, at: new Date().toISOString(), text: dto.text }];
    await this.orders.save(row);
    return row;
  }
}
