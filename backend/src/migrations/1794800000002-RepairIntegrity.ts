import { MigrationInterface, QueryRunner } from 'typeorm';
import { CHECKS } from './integrity';

/**
 * Re-asserts every CHECK constraint (idempotent). Needed because a generated migration had
 * dropped them. If existing rows violate a rule this migration FAILS LOUDLY instead of
 * weakening the rule — fix the data, never the constraint.
 */
export class RepairIntegrity1794800000002 implements MigrationInterface {
  name = 'RepairIntegrity1794800000002';

  public async up(q: QueryRunner): Promise<void> {
    for (const c of CHECKS) {
      await q.query(`ALTER TABLE "${c.table}" DROP CONSTRAINT IF EXISTS "${c.name}"`);
      await q.query(`ALTER TABLE "${c.table}" ADD CONSTRAINT "${c.name}" CHECK (${c.expr})`);
    }
  }

  public async down(): Promise<void> {
    // Intentionally empty: removing integrity rules is never a valid rollback.
  }
}
