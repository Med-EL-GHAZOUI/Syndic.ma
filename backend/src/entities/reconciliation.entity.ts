import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { moneyTransformer } from '../common/money';

export type BankLineStatus = 'unmatched' | 'matched' | 'ignored';

/** One line of an imported bank statement. Credits (amount > 0) can be matched to recorded payments. */
@Entity('bank_lines')
@Unique(['orgId', 'hash'])
export class BankLine {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column({ name: 'batch_id', type: 'uuid' }) batchId: string;
  @Column({ name: 'booking_date', type: 'date' }) bookingDate: string;
  @Column({ type: 'numeric', precision: 14, scale: 2, transformer: moneyTransformer }) amount: number;
  @Column() label: string;
  @Column({ type: 'varchar', default: '' }) reference: string;
  /** Fingerprint used to make imports idempotent (same line imported twice is stored once). */
  @Column() hash: string;
  @Column({ type: 'varchar', default: 'unmatched' }) status: BankLineStatus;
  @Column({ name: 'payment_id', type: 'uuid', nullable: true }) paymentId: string | null;
  @Column({ type: 'varchar', nullable: true }) note: string | null;
  @Column({ name: 'created_by', type: 'uuid' }) createdBy: string;
  @Column({ name: 'matched_by', type: 'uuid', nullable: true }) matchedBy: string | null;
  @Column({ name: 'matched_at', type: 'timestamptz', nullable: true }) matchedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

/**
 * Accounting period closure. Once a residence is closed through a date, nothing dated on or before
 * it can be recorded, confirmed, reversed, approved or paid. Closures only move FORWARD and are
 * never deleted (reopening a period is an exceptional, out-of-band procedure, not an API action).
 */
@Entity('period_closures')
@Unique(['residenceId', 'closedThrough'])
export class PeriodClosure {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column({ name: 'closed_through', type: 'date' }) closedThrough: string;
  @Column({ name: 'closed_by', type: 'uuid' }) closedBy: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
