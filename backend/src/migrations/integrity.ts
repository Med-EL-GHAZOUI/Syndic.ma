// Single source of truth for DATABASE-LEVEL integrity rules that TypeORM does not model.
//
// WARNING: `typeorm migration:generate` diffs the schema against the entities and will emit
// DROP CONSTRAINT for any CHECK it does not know about (this really happened — see the
// RepairIntegrity migration). ALWAYS review generated migrations, and keep
// test/e2e/schema-guard.e2e-spec.ts green: it fails if any rule below is missing.
export const CHECKS: { table: string; name: string; expr: string }[] = [
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

export const TRIGGERS = ['audit_logs_append_only', 'audit_logs_no_truncate', 'payments_no_delete', 'assemblies_no_delete_held'];
