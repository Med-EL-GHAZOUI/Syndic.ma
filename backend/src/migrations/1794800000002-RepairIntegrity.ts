import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-asserts every CHECK constraint (idempotent). Needed because a generated migration had
 * dropped them. If existing rows violate a rule this migration FAILS LOUDLY instead of
 * weakening the rule — fix the data, never the constraint.
 */
// FROZEN snapshot. A migration must never depend on code that changes later (the shared list in
// integrity.ts grows with every feature; on a fresh database it would reference tables that do not
// exist yet at this point in history).
const CHECKS: { table: string; name: string; expr: string }[] = [
  { table: 'charges', name: 'chk_charges_amount', expr: 'amount > 0' },
  { table: 'payments', name: 'chk_payments_amount', expr: 'amount > 0' },
  { table: 'allocations', name: 'chk_allocations_amount', expr: 'amount > 0' },
  { table: 'units', name: 'chk_units_tantiemes', expr: 'tantiemes >= 0' },
  { table: 'payments', name: 'chk_payments_status', expr: "status IN ('pending','recorded','reversed','rejected')" },
  { table: 'payments', name: 'chk_payments_receipt', expr: "(status IN ('recorded','reversed')) = (receipt_no IS NOT NULL)" },
  { table: 'calls_for_funds', name: 'chk_calls_status', expr: "status IN ('draft','issued','closed')" },
  { table: 'expenses', name: 'chk_expenses_status', expr: "status IN ('pending','approved','paid','cancelled')" },
  { table: 'users', name: 'chk_users_role', expr: "role IN ('super_admin','syndic_admin','manager','accountant','owner','tenant','provider')" },
  { table: 'users', name: 'chk_users_org', expr: "(role = 'super_admin') = (org_id IS NULL)" },
  { table: 'work_orders', name: 'chk_work_status', expr: "status IN ('planned','in_progress','done','cancelled')" },
  { table: 'assemblies', name: 'chk_assembly_status', expr: "status IN ('planned','convened','held','cancelled')" },
  { table: 'documents', name: 'chk_doc_visibility', expr: "visibility IN ('all','owners','staff')" },
  { table: 'documents', name: 'chk_doc_size', expr: 'size > 0 AND size <= 10485760' },
];

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
