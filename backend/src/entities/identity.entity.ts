import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../common/permissions';

export type OrgStatus = 'trial' | 'active' | 'suspended';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column() name: string;
  @Column({ nullable: true }) city?: string;
  @Column({ name: 'contact_name', nullable: true }) contactName?: string;
  @Column({ nullable: true }) email?: string;
  @Column({ nullable: true }) phone?: string;
  @Column({ default: 'starter' }) plan: string;
  @Column({ type: 'varchar', default: 'trial' }) status: OrgStatus;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id: string;
  /** null only for super_admin (platform level). */
  @Index() @Column({ name: 'org_id', type: 'uuid', nullable: true }) orgId: string | null;
  @Column() name: string;
  @Index({ unique: true }) @Column() email: string;
  @Column({ name: 'password_hash' }) passwordHash: string;
  @Column({ type: 'varchar' }) role: Role;
  @Column({ nullable: true }) phone?: string;
  @Column({ default: true }) active: boolean;
  /** Managers only see these residences. Empty = all residences of the org. */
  @Column({ name: 'residence_ids', type: 'uuid', array: true, default: () => "'{}'" }) residenceIds: string[];
  @Column({ name: 'provider_id', type: 'uuid', nullable: true }) providerId: string | null;
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true }) lastLoginAt: Date | null;
  /** AES-GCM encrypted TOTP secret (set during enrolment, active only when mfaEnabled). Never sent to clients. */
  @Column({ name: 'mfa_secret', type: 'text', nullable: true }) mfaSecret: string | null;
  @Column({ name: 'mfa_enabled', default: false }) mfaEnabled: boolean;
  /** Last accepted TOTP time step: a code cannot be replayed. */
  @Column({ name: 'mfa_last_step', type: 'int', nullable: true }) mfaLastStep: number | null;
  /** SHA-256 of each unused one-time recovery code. */
  @Column({ name: 'mfa_backup_codes', type: 'jsonb', default: () => "'[]'" }) mfaBackupCodes: string[];
  @Column({ name: 'mfa_failures', type: 'int', default: 0 }) mfaFailures: number;
  @Column({ name: 'mfa_locked_until', type: 'timestamptz', nullable: true }) mfaLockedUntil: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) updatedAt: Date;
}

/**
 * Refresh tokens are opaque random strings; only their SHA-256 hash is stored.
 * Rotation: each use marks the token `usedAt` and issues a new one in the same `family`.
 * Presenting an already-used token revokes the whole family (theft detection).
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Index({ unique: true }) @Column({ name: 'token_hash' }) tokenHash: string;
  @Index() @Column({ type: 'uuid' }) family: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt: Date | null;
  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true }) revokedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}

/** Single-use password-reset token. Only the SHA-256 of the token is stored; it expires quickly. */
@Entity('password_resets')
export class PasswordReset {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Index() @Column({ name: 'user_id', type: 'uuid' }) userId: string;
  @Index({ unique: true }) @Column({ name: 'token_hash' }) tokenHash: string;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt: Date;
  @Column({ name: 'used_at', type: 'timestamptz', nullable: true }) usedAt: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt: Date;
}
