import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Append-only. A database trigger (see migration) rejects UPDATE and DELETE. */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid', nullable: true }) orgId: string | null;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Column({ name: 'user_name', nullable: true }) userName?: string;
  @Column({ type: 'varchar', nullable: true }) role: string | null;
  @Column() action: string;
  @Column() entity: string;
  @Column({ name: 'entity_id', type: 'varchar', nullable: true }) entityId: string | null;
  @Column({ type: 'text', default: '' }) summary: string;
  @Index() @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
