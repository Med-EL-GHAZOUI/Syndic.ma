import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Database-level guarantees that must hold even if application code is buggy or bypassed:
 *  - audit_logs is append-only (UPDATE / DELETE / TRUNCATE rejected by trigger);
 *  - recorded/reversed payments cannot be deleted;
 *  - money amounts are positive; status values are constrained.
 */
export class IntegrityRules1794800000000 implements MigrationInterface {
  name = 'IntegrityRules1794800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE FUNCTION forbid_change() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION '% on % is not allowed (append-only)', TG_OP, TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_change()`);
    await q.query(`CREATE TRIGGER audit_logs_no_truncate BEFORE TRUNCATE ON audit_logs FOR EACH STATEMENT EXECUTE FUNCTION forbid_change()`);

    await q.query(`
      CREATE FUNCTION protect_confirmed_payments() RETURNS trigger AS $$
      BEGIN
        IF OLD.status IN ('recorded', 'reversed') THEN
          RAISE EXCEPTION 'Confirmed payments cannot be deleted; reverse them instead' USING ERRCODE = 'restrict_violation';
        END IF;
        RETURN OLD;
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER payments_no_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION protect_confirmed_payments()`);

    await q.query(`ALTER TABLE charges ADD CONSTRAINT chk_charges_amount CHECK (amount > 0)`);
    await q.query(`ALTER TABLE payments ADD CONSTRAINT chk_payments_amount CHECK (amount > 0)`);
    await q.query(`ALTER TABLE allocations ADD CONSTRAINT chk_allocations_amount CHECK (amount > 0)`);
    await q.query(`ALTER TABLE units ADD CONSTRAINT chk_units_tantiemes CHECK (tantiemes >= 0)`);
    await q.query(`ALTER TABLE payments ADD CONSTRAINT chk_payments_status CHECK (status IN ('pending','recorded','reversed','rejected'))`);
    await q.query(`ALTER TABLE payments ADD CONSTRAINT chk_payments_receipt CHECK ((status IN ('recorded','reversed')) = (receipt_no IS NOT NULL))`);
    await q.query(`ALTER TABLE calls_for_funds ADD CONSTRAINT chk_calls_status CHECK (status IN ('draft','issued','closed'))`);
    await q.query(`ALTER TABLE expenses ADD CONSTRAINT chk_expenses_status CHECK (status IN ('pending','approved','paid','cancelled'))`);
    await q.query(`ALTER TABLE users ADD CONSTRAINT chk_users_role CHECK (role IN ('super_admin','syndic_admin','manager','accountant','owner','tenant','provider'))`);
    await q.query(`ALTER TABLE users ADD CONSTRAINT chk_users_org CHECK ((role = 'super_admin') = (org_id IS NULL))`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE users DROP CONSTRAINT chk_users_org, DROP CONSTRAINT chk_users_role`);
    await q.query(`ALTER TABLE expenses DROP CONSTRAINT chk_expenses_status`);
    await q.query(`ALTER TABLE calls_for_funds DROP CONSTRAINT chk_calls_status`);
    await q.query(`ALTER TABLE payments DROP CONSTRAINT chk_payments_receipt, DROP CONSTRAINT chk_payments_status, DROP CONSTRAINT chk_payments_amount`);
    await q.query(`ALTER TABLE units DROP CONSTRAINT chk_units_tantiemes`);
    await q.query(`ALTER TABLE allocations DROP CONSTRAINT chk_allocations_amount`);
    await q.query(`ALTER TABLE charges DROP CONSTRAINT chk_charges_amount`);
    await q.query(`DROP TRIGGER payments_no_delete ON payments`);
    await q.query(`DROP FUNCTION protect_confirmed_payments()`);
    await q.query(`DROP TRIGGER audit_logs_no_truncate ON audit_logs`);
    await q.query(`DROP TRIGGER audit_logs_append_only ON audit_logs`);
    await q.query(`DROP FUNCTION forbid_change()`);
  }
}
