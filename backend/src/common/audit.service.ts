import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuthUser } from './auth-user';
import { AuditLog } from '../entities';

@Injectable()
export class AuditService {
  constructor(@InjectRepository(AuditLog) private readonly repo: Repository<AuditLog>) {}

  /** Pass the transaction manager so the audit row commits (or rolls back) with the change itself. */
  async log(user: Pick<AuthUser, 'id' | 'orgId' | 'name' | 'role'> | null, action: string, entity: string, entityId: string | null, summary = '', manager?: EntityManager) {
    const repo = manager ? manager.getRepository(AuditLog) : this.repo;
    await repo.insert({
      orgId: user?.orgId ?? null,
      userId: user?.id ?? null,
      userName: user?.name,
      role: user?.role ?? null,
      action,
      entity,
      entityId,
      summary: summary.slice(0, 500),
    });
  }
}
