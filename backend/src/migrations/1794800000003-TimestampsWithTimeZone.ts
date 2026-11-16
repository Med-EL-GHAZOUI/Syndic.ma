import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bug fix: created_at / updated_at / published_at were `timestamp WITHOUT time zone`. The driver
 * read those wall-clock values as LOCAL time, so every timestamp (including the audit trail) was
 * shifted by the server's UTC offset. Convert to `timestamptz`.
 *
 * Existing values were written by `now()` on a server running in UTC, hence `AT TIME ZONE 'UTC'`.
 * Written by hand on purpose: `migration:generate` would emit DROP COLUMN + ADD COLUMN (data loss).
 * ALTER TYPE rewrites the table without firing row triggers, so the append-only audit trigger is unaffected.
 */
export class TimestampsWithTimeZone1794800000003 implements MigrationInterface {
  name = 'TimestampsWithTimeZone1794800000003';

  public async up(q: QueryRunner): Promise<void> {
    const cols: { table_name: string; column_name: string }[] = await q.query(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND data_type = 'timestamp without time zone'
          AND table_name <> 'migrations'`,
    );
    for (const c of cols) {
      await q.query(
        `ALTER TABLE "${c.table_name}" ALTER COLUMN "${c.column_name}" TYPE timestamptz USING "${c.column_name}" AT TIME ZONE 'UTC'`,
      );
    }
  }

  public async down(): Promise<void> {
    // Intentionally empty: converting back would re-introduce the ambiguity.
  }
}
