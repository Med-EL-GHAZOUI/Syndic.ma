import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { moneyTransformer } from '../common/money';

export type WorkStatus = 'planned' | 'in_progress' | 'done' | 'cancelled';

@Entity('work_orders')
export class WorkOrder {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column() title: string;
  @Column({ type: 'varchar', default: 'corrective' }) type: 'corrective' | 'preventive';
  @Index() @Column({ name: 'provider_id', type: 'uuid' }) providerId: string;
  @Column({ name: 'complaint_id', type: 'uuid', nullable: true }) complaintId: string | null;
  @Column({ name: 'scheduled_date', type: 'date' }) scheduledDate: string;
  @Column({ name: 'estimated_cost', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: moneyTransformer }) estimatedCost: number | null;
  @Column({ name: 'actual_cost', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: moneyTransformer }) actualCost: number | null;
  @Column({ type: 'varchar', default: 'planned' }) status: WorkStatus;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ type: 'jsonb', default: () => "'[]'" }) notes: { byId: string; byName: string; at: string; text: string }[];
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

export type AssemblyStatus = 'planned' | 'convened' | 'held' | 'cancelled';
export interface Attendance { unitId: string; status: 'present' | 'proxy' | 'absent'; proxyTo: string }
export interface Resolution { id: string; title: string; votesFor: number; votesAgainst: number; abstain: number }

@Entity('assemblies')
export class Assembly {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column() title: string;
  @Column({ type: 'varchar', default: 'ordinary' }) type: 'ordinary' | 'extraordinary';
  @Column({ type: 'date' }) date: string;
  @Column() time: string;
  @Column() location: string;
  @Column({ type: 'varchar', default: 'planned' }) status: AssemblyStatus;
  @Column({ type: 'jsonb', default: () => "'[]'" }) agenda: string[];
  @Column({ type: 'jsonb', default: () => "'[]'" }) attendance: Attendance[];
  @Column({ type: 'jsonb', default: () => "'[]'" }) resolutions: Resolution[];
  @Column({ type: 'text', default: '' }) minutes: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('documents')
export class DocumentFile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column() name: string;
  @Column() category: string;
  /** all | owners | staff */
  @Column({ default: 'staff' }) visibility: string;
  /** Sanitized original name, shown to users only — never used to build a path. */
  @Column({ name: 'file_name' }) fileName: string;
  /** Random server-generated key (never derived from user input). */
  @Column({ name: 'storage_key' }) storageKey: string;
  @Column({ type: 'int' }) size: number;
  /** MIME type determined by content sniffing, not by the client. */
  @Column() mime: string;
  @Column() sha256: string;
  @Column({ name: 'uploaded_by', type: 'uuid' }) uploadedBy: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
