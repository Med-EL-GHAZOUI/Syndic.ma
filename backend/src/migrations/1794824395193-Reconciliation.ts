import { MigrationInterface, QueryRunner } from "typeorm";

export class Reconciliation1794824395193 implements MigrationInterface {
    name = 'Reconciliation1794824395193'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "bank_lines" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "batch_id" uuid NOT NULL, "booking_date" date NOT NULL, "amount" numeric(14,2) NOT NULL, "label" character varying NOT NULL, "reference" character varying NOT NULL DEFAULT '', "hash" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'unmatched', "payment_id" uuid, "note" character varying, "created_by" uuid NOT NULL, "matched_by" uuid, "matched_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_4f685e60d590fdb45f97bd66ead" UNIQUE ("org_id", "hash"), CONSTRAINT "PK_15ffc692f66eb277c20b8d828d1" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6a9f95b5ceeace942da9cfb92a" ON "bank_lines" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_eea160c8fc572dab79e35a3836" ON "bank_lines" ("residence_id") `);
        await queryRunner.query(`CREATE TABLE "period_closures" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "closed_through" date NOT NULL, "closed_by" uuid NOT NULL, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "UQ_33873e14512e462d115628a3406" UNIQUE ("residence_id", "closed_through"), CONSTRAINT "PK_43b5957730f37373747034eebb4" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d41fcfa1d96e977ece73f77a6f" ON "period_closures" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_1ed06a77755f5530d6d32d3c44" ON "period_closures" ("residence_id") `);
        await queryRunner.query(`ALTER TABLE bank_lines ADD CONSTRAINT chk_bank_status CHECK (status IN ('unmatched','matched','ignored'))`);
        await queryRunner.query(`ALTER TABLE bank_lines ADD CONSTRAINT chk_bank_amount CHECK (amount <> 0)`);
        await queryRunner.query(`ALTER TABLE bank_lines ADD CONSTRAINT chk_bank_match CHECK ((status = 'matched') = (payment_id IS NOT NULL))`);
        // a bank-verified payment must be a recorded one
        await queryRunner.query(`ALTER TABLE payments ADD CONSTRAINT chk_payments_verified CHECK (NOT verified OR status = 'recorded')`);
        // closures never move backwards: closed_through is part of an append-only history
        await queryRunner.query(`CREATE TRIGGER period_closures_append_only BEFORE UPDATE OR DELETE ON period_closures FOR EACH ROW EXECUTE FUNCTION forbid_change()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_1ed06a77755f5530d6d32d3c44"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d41fcfa1d96e977ece73f77a6f"`);
        await queryRunner.query(`DROP TABLE "period_closures"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eea160c8fc572dab79e35a3836"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6a9f95b5ceeace942da9cfb92a"`);
        await queryRunner.query(`DROP TABLE "bank_lines"`);
        await queryRunner.query(`ALTER TABLE "units" ADD CONSTRAINT "chk_units_tantiemes" CHECK ((tantiemes >= 0))`);
        await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "chk_expenses_status" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "chk_users_org" CHECK ((((role)::text = 'super_admin'::text) = (org_id IS NULL)))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "chk_users_role" CHECK (((role)::text = ANY ((ARRAY['super_admin'::character varying, 'syndic_admin'::character varying, 'manager'::character varying, 'accountant'::character varying, 'owner'::character varying, 'tenant'::character varying, 'provider'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "allocations" ADD CONSTRAINT "chk_allocations_amount" CHECK ((amount > (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amount" CHECK ((amount > (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_receipt" CHECK ((((status)::text = ANY ((ARRAY['recorded'::character varying, 'reversed'::character varying])::text[])) = (receipt_no IS NOT NULL)))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_status" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'recorded'::character varying, 'reversed'::character varying, 'rejected'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "charges" ADD CONSTRAINT "chk_charges_amount" CHECK ((amount > (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "calls_for_funds" ADD CONSTRAINT "chk_calls_status" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'issued'::character varying, 'closed'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "chk_doc_size" CHECK (((size > 0) AND (size <= 10485760)))`);
        await queryRunner.query(`ALTER TABLE "documents" ADD CONSTRAINT "chk_doc_visibility" CHECK (((visibility)::text = ANY ((ARRAY['all'::character varying, 'owners'::character varying, 'staff'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "assemblies" ADD CONSTRAINT "chk_assembly_status" CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'convened'::character varying, 'held'::character varying, 'cancelled'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "work_orders" ADD CONSTRAINT "chk_work_status" CHECK (((status)::text = ANY ((ARRAY['planned'::character varying, 'in_progress'::character varying, 'done'::character varying, 'cancelled'::character varying])::text[])))`);
    }

}
