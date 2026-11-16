import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { moneyTransformer } from '../common/money';

const money = (name: string, nullable = false) =>
  ({ name, type: 'numeric', precision: 14, scale: 2, nullable, transformer: moneyTransformer }) as const;

export type CallStatus = 'draft' | 'issued' | 'closed';
export type CallBasis = 'tantiemes' | 'fixed';

@Entity('calls_for_funds')
export class CallForFunds {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column() title: string;
  @Column() period: string;
  @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @Column({ type: 'varchar' }) basis: CallBasis;
  @Column(money('total_amount')) totalAmount: number;
  @Column(money('amount_per_unit')) amountPerUnit: number;
  @Column({ type: 'varchar', default: 'draft' }) status: CallStatus;
  @Column({ name: 'issued_at', type: 'timestamptz', nullable: true }) issuedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

/** A charge is immutable once created. What has been paid is DERIVED from allocations. */
@Entity('charges')
export class Charge {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'call_id', type: 'uuid' }) callId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Index() @Column({ name: 'unit_id', type: 'uuid' }) unitId: string;
  @Column() label: string;
  @Column(money('amount')) amount: number;
  @Column({ name: 'due_date', type: 'date' }) dueDate: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}

export type PaymentStatus = 'pending' | 'recorded' | 'reversed' | 'rejected';
export type PaymentMethod = 'transfer' | 'cheque' | 'cash';

/**
 * A payment is a RECORD of money received (manual). `verified` stays false until a payment
 * provider / bank reconciliation confirms it (Phase 5/8). Recorded payments are never deleted:
 * they are reversed with a reason.
 */
@Entity('payments')
@Unique(['orgId', 'receiptNo'])
export class Payment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Index() @Column({ name: 'unit_id', type: 'uuid' }) unitId: string;
  @Column({ name: 'payer_name' }) payerName: string;
  @Column(money('amount')) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ type: 'varchar' }) method: PaymentMethod;
  @Column({ nullable: true }) reference?: string;
  @Column({ nullable: true }) note?: string;
  @Column({ type: 'varchar', default: 'pending' }) status: PaymentStatus;
  @Column({ default: false }) verified: boolean;
  @Column({ name: 'receipt_no', type: 'varchar', nullable: true }) receiptNo: string | null;
  @Column({ name: 'declared_by', type: 'uuid', nullable: true }) declaredBy: string | null;
  @Column({ name: 'created_by', type: 'uuid', nullable: true }) createdBy: string | null;
  @Column({ name: 'confirmed_by', type: 'uuid', nullable: true }) confirmedBy: string | null;
  @Column({ name: 'reason', type: 'varchar', nullable: true }) reason: string | null;
  @Column({ name: 'reversed_at', type: 'timestamptz', nullable: true }) reversedAt: Date | null;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at' }) updatedAt: Date;
}

@Entity('allocations')
export class Allocation {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'payment_id', type: 'uuid' }) paymentId: string;
  @Index() @Column({ name: 'charge_id', type: 'uuid' }) chargeId: string;
  @Column(money('amount')) amount: number;
}

/** Gap-free-per-year document numbering, incremented atomically (INSERT .. ON CONFLICT). */
@Entity('counters')
export class Counter {
  @PrimaryColumn({ name: 'org_id', type: 'uuid' }) orgId: string;
  @PrimaryColumn() name: string;
  @PrimaryColumn({ type: 'int' }) year: number;
  @Column({ type: 'int', default: 0 }) value: number;
}
