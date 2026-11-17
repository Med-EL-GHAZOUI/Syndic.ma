import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { AuthUser } from '../common/auth-user';
import { page } from '../common/pagination';
import { Role } from '../common/permissions';
import { Notification, Resident, User } from '../entities';
import { NotificationQuery } from './notifications.dto';

export interface NotificationInput {
  /** Translation key suffix on the client (notif.<type>). */
  type: string;
  params?: Record<string, string | number>;
  /** In-app route opened on click. */
  link?: string;
  /** Same key + same user = delivered once, even if the producer runs again. */
  dedupeKey?: string;
}

export const STAFF_ROLES: Role[] = ['syndic_admin', 'manager', 'accountant'];

@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectRepository(Resident) private readonly residents: Repository<Resident>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  // ---- producing -----------------------------------------------------------------------

  /**
   * Best effort by design: a notification that cannot be stored must never fail, or roll back, the business
   * action that triggered it (a payment is valid whether or not anyone was notified). Failures are logged.
   */
  async notify(orgId: string, userIds: string[], n: NotificationInput): Promise<void> {
    const ids = [...new Set(userIds)];
    if (!ids.length) return;
    try {
      await this.repo
        .createQueryBuilder()
        .insert()
        .into(Notification)
        .values(ids.map((userId) => ({ orgId, userId, type: n.type, params: n.params ?? {}, link: n.link ?? null, dedupeKey: n.dedupeKey ?? null })))
        .orIgnore() // ON CONFLICT DO NOTHING: the partial unique index (user, dedupeKey) makes producers idempotent
        .execute();
    } catch (e) {
      this.log.warn(`could not store "${n.type}" notification: ${(e as Error).message}`);
    }
  }

  /** Look up recipients AND store, all best effort (the lookup is part of the failure domain too). */
  private async send(orgId: string, find: () => Promise<string[]>, n: NotificationInput, exceptUserId?: string): Promise<void> {
    try {
      await this.notify(orgId, (await find()).filter((id) => id !== exceptUserId), n);
    } catch (e) {
      this.log.warn(`could not notify "${n.type}": ${(e as Error).message}`);
    }
  }

  toResidents(orgId: string, residenceId: string, n: NotificationInput, types?: Array<'owner' | 'tenant'>, exceptUserId?: string) {
    return this.send(orgId, () => this.residentUserIds(orgId, residenceId, types), n, exceptUserId);
  }

  toStaff(orgId: string, residenceId: string, n: NotificationInput, roles?: Role[], exceptUserId?: string) {
    return this.send(orgId, () => this.staffUserIds(orgId, residenceId, roles), n, exceptUserId);
  }

  toProvider(orgId: string, providerId: string, n: NotificationInput) {
    return this.send(orgId, () => this.providerUserIds(orgId, providerId), n);
  }

  toUser(orgId: string, userId: string, n: NotificationInput, exceptUserId?: string) {
    return this.send(orgId, async () => [userId], n, exceptUserId);
  }

  /** Active users linked to the residence through an active occupancy. */
  async residentUserIds(orgId: string, residenceId: string, types: Array<'owner' | 'tenant'> = ['owner', 'tenant']): Promise<string[]> {
    const rows = await this.residents
      .createQueryBuilder('r')
      .innerJoin(User, 'u', 'u.id = r.user_id AND u.active = true')
      .select('r.user_id', 'userId')
      .distinct(true)
      .where('r.org_id = :orgId AND r.residence_id = :residenceId AND r.active = true AND r.user_id IS NOT NULL AND r.type IN (:...types)', { orgId, residenceId, types })
      .getRawMany<{ userId: string }>();
    return rows.map((r) => r.userId);
  }

  /** Active staff of the organization who can see the residence (managers may be limited to some residences). */
  async staffUserIds(orgId: string, residenceId: string, roles: Role[] = STAFF_ROLES): Promise<string[]> {
    const rows = await this.users
      .createQueryBuilder('u')
      .select('u.id')
      .where('u.org_id = :orgId AND u.active = true AND u.role IN (:...roles)', { orgId, roles })
      .andWhere('(cardinality(u.residence_ids) = 0 OR :residenceId = ANY(u.residence_ids))', { residenceId })
      .getMany();
    return rows.map((u) => u.id);
  }

  async providerUserIds(orgId: string, providerId: string): Promise<string[]> {
    const rows = await this.users.find({ where: { orgId, providerId, active: true, role: 'provider' }, select: ['id'] });
    return rows.map((u) => u.id);
  }

  // ---- reading (always the caller's own notifications) -----------------------------------------

  list(user: AuthUser, q: NotificationQuery) {
    if (!user.orgId) return [];
    return this.repo.find({
      where: { orgId: user.orgId, userId: user.id, ...(q.unread ? { readAt: IsNull() } : {}) },
      order: { createdAt: 'DESC' },
      ...page(q),
    });
  }

  async unreadCount(user: AuthUser): Promise<{ count: number }> {
    if (!user.orgId) return { count: 0 };
    return { count: await this.repo.count({ where: { orgId: user.orgId, userId: user.id, readAt: IsNull() } }) };
  }

  async markRead(user: AuthUser, id: string): Promise<{ id: string }> {
    // Someone else's notification is reported exactly like a missing one.
    const row = user.orgId ? await this.repo.findOneBy({ id, userId: user.id, orgId: user.orgId }) : null;
    if (!row) throw new NotFoundException('Notification not found');
    if (!row.readAt) await this.repo.update({ id }, { readAt: new Date() });
    return { id };
  }

  async markAllRead(user: AuthUser): Promise<{ updated: number }> {
    if (!user.orgId) return { updated: 0 };
    const res = await this.repo.update({ orgId: user.orgId, userId: user.id, readAt: IsNull() }, { readAt: new Date() });
    return { updated: res.affected ?? 0 };
  }
}
