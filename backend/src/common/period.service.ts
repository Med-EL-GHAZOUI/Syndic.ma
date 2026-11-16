import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { PeriodClosure } from '../entities';

/** Single place that answers "is this date still open for accounting?". */
@Injectable()
export class PeriodService {
  constructor(@InjectRepository(PeriodClosure) private readonly repo: Repository<PeriodClosure>) {}

  async closedThrough(orgId: string, residenceId: string, manager?: EntityManager): Promise<string | null> {
    const repo = manager ? manager.getRepository(PeriodClosure) : this.repo;
    // to_char: a raw `date` would come back as a JS Date (pg parses it), which breaks string comparison.
    const row = await repo
      .createQueryBuilder('c')
      .select("to_char(MAX(c.closed_through), 'YYYY-MM-DD')", 'd')
      .where('c.org_id = :orgId AND c.residence_id = :residenceId', { orgId, residenceId })
      .getRawOne<{ d: string | null }>();
    return row?.d ?? null;
  }

  /** Throws 409 if `date` falls in a closed period. Call it with the transaction manager when inside one. */
  async assertOpen(orgId: string, residenceId: string, date: string, manager?: EntityManager): Promise<void> {
    const closed = await this.closedThrough(orgId, residenceId, manager);
    if (closed && date <= closed) throw new ConflictException(`The accounting period is closed through ${closed}`);
  }
}
