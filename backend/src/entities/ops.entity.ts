import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { moneyTransformer } from '../common/money';

@Entity('providers')
export class Provider {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Column() name: string;
  @Column() category: string;
  @Column({ nullable: true }) city?: string;
  @Column({ name: 'contact_name', nullable: true }) contactName?: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ nullable: true }) email?: string;
  @Column({ nullable: true }) ice?: string;
  @Column({ type: 'int', default: 3 }) rating: number;
  @Column({ default: true }) active: boolean;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

export type ExpenseStatus = 'pending' | 'approved' | 'paid' | 'cancelled';

@Entity('expenses')
export class Expense {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column() category: string;
  @Column() label: string;
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: moneyTransformer }) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ name: 'invoice_ref', nullable: true }) invoiceRef?: string;
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId: string | null;
  @Column({ type: 'varchar', default: 'pending' }) status: ExpenseStatus;
  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true }) paidAt: Date | null;
  @Column({ name: 'cancel_reason', type: 'varchar', nullable: true }) cancelReason: string | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

export type ComplaintStatus = 'new' | 'in_progress' | 'resolved' | 'closed';

@Entity('complaints')
export class Complaint {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column({ name: 'unit_id', type: 'uuid', nullable: true }) unitId: string | null;
  @Index() @Column({ name: 'author_id', type: 'uuid' }) authorId: string;
  @Column() title: string;
  @Column() category: string;
  @Column({ default: 'medium' }) priority: string;
  @Column({ type: 'text' }) description: string;
  @Column({ type: 'varchar', default: 'new' }) status: ComplaintStatus;
  @Column({ type: 'jsonb', default: () => "'[]'" }) comments: { byId: string; byName: string; at: string; text: string }[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('announcements')
export class Announcement {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column() title: string;
  @Column({ type: 'text' }) body: string;
  @Column({ default: 'info' }) category: string;
  /** all | owners | staff */
  @Column({ default: 'all' }) audience: string;
  @Column({ default: false }) pinned: boolean;
  @Column({ name: 'author_name' }) authorName: string;
  @CreateDateColumn({ name: 'published_at' }) publishedAt: Date;
}
