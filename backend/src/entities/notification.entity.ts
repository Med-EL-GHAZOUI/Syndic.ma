import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * In-app notification. The server stores a TYPE and PARAMS, never a sentence: the client translates it
 * (FR/AR) so a user switching language sees old notifications in the new language.
 * `dedupeKey` makes producers idempotent (background jobs can run twice without notifying twice).
 */
@Entity('notifications')
@Index('IDX_notifications_org', ['orgId'])
@Index('IDX_notifications_user_created', ['userId', 'createdAt'])
@Index('UQ_notifications_user_dedupe', ['userId', 'dedupeKey'], { unique: true, where: '"dedupe_key" IS NOT NULL' })
export class Notification {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Column({ type: 'varchar' }) type: string;
  @Column({ type: 'jsonb', default: () => "'{}'" }) params: Record<string, string | number>;
  /** In-app route to open when the notification is clicked. */
  @Column({ type: 'varchar', nullable: true }) link: string | null;
  @Column({ name: 'dedupe_key', type: 'varchar', nullable: true }) dedupeKey: string | null;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
