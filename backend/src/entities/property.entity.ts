import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique, UpdateDateColumn } from 'typeorm';
import { moneyTransformer } from '../common/money';

// Every tenant-owned table carries org_id (denormalised) so that all queries can be
// scoped with a single predicate and row-level security can be added as defence in depth.

@Entity('residences')
export class Residence {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Column() name: string;
  @Column() city: string;
  @Column() address: string;
  @Column({ name: 'year_built', type: 'int', nullable: true }) yearBuilt: number | null;
  @Column({ name: 'monthly_fee', type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: moneyTransformer }) monthlyFee: number | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('buildings')
@Unique(['residenceId', 'name'])
export class Building {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column() name: string;
  @Column({ type: 'int' }) floors: number;
  @Column({ default: false }) elevator: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

export type UnitType = 'apartment' | 'shop' | 'office' | 'parking';

@Entity('units')
@Unique(['buildingId', 'number'])
export class Unit {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Column({ name: 'building_id', type: 'uuid' }) buildingId: string;
  @Column() number: string;
  @Column({ type: 'int' }) floor: number;
  @Column({ type: 'varchar', default: 'apartment' }) type: UnitType;
  @Column({ type: 'int', nullable: true }) rooms: number | null;
  @Column({ type: 'numeric', precision: 8, scale: 2, transformer: { to: (v: number) => v, from: (v: string) => Number(v) } }) area: number;
  /** Share of common parts (millièmes). Sum per residence is expected to be 1000. */
  @Column({ type: 'int' }) tantiemes: number;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

export type ResidentType = 'owner' | 'tenant';

/** Ownership / occupancy history. Ending an occupancy keeps the row (active=false, until set). */
@Entity('residents')
export class Resident {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'org_id', type: 'uuid' }) orgId: string;
  @Index() @Column({ name: 'residence_id', type: 'uuid' }) residenceId: string;
  @Index() @Column({ name: 'unit_id', type: 'uuid' }) unitId: string;
  @Index() @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId: string | null;
  @Column({ type: 'varchar' }) type: ResidentType;
  @Column({ name: 'first_name' }) firstName: string;
  @Column({ name: 'last_name' }) lastName: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ nullable: true }) email?: string;
  @Column({ type: 'date' }) since: string;
  @Column({ type: 'date', nullable: true }) until: string | null;
  @Column({ default: true }) active: boolean;
  @Column({ name: 'lives_in', default: true }) livesIn: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}
