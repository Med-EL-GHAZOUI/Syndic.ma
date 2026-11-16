import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../common/auth-user';
import { PeriodService } from '../common/period.service';
import { ScopeService } from '../common/scope.service';
import { Payment, PeriodClosure } from '../entities';
import { CloseDto } from './reconciliation.dto';

@Injectable()
export class ClosuresService {
  constructor(
    @InjectRepository(PeriodClosure) private readonly closures: Repository<PeriodClosure>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    private readonly scope: ScopeService,
    private readonly period: PeriodService,
    private readonly audit: AuditService,
  ) {}

  async list(user: AuthUser) {
    const ids = await this.scope.residenceIds(user);
    if (!ids.length) return [];
    return this.closures.find({ where: { orgId: this.scope.requireOrg(user), residenceId: In(ids) }, order: { closedThrough: 'DESC' } });
  }

  /**
   * Closing only moves forward, never into the future, and only when nothing is left undecided:
   * pending (declared) payments dated inside the period must be confirmed or rejected first.
   */
  async close(user: AuthUser, dto: CloseDto) {
    await this.scope.assertResidence(user, dto.residenceId);
    const orgId = this.scope.requireOrg(user);
    if (dto.closedThrough > new Date().toISOString().slice(0, 10)) throw new BadRequestException('Cannot close a period in the future');
    const current = await this.period.closedThrough(orgId, dto.residenceId);
    if (current && dto.closedThrough <= current) throw new ConflictException(`The period is already closed through ${current}`);

    const pending = await this.payments
      .createQueryBuilder('p')
      .where("p.org_id = :orgId AND p.residence_id = :r AND p.status = 'pending' AND p.date <= :d", { orgId, r: dto.residenceId, d: dto.closedThrough })
      .getCount();
    if (pending) throw new ConflictException(`${pending} pending payment(s) dated in this period must be confirmed or rejected first`);

    const row = await this.closures.save(this.closures.create({ orgId, residenceId: dto.residenceId, closedThrough: dto.closedThrough, closedBy: user.id }));
    await this.audit.log(user, 'close_period', 'period_closures', row.id, `through ${dto.closedThrough}`);
    return row;
  }
}
