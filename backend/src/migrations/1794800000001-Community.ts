import { MigrationInterface, QueryRunner } from "typeorm";

export class Community1794800000001 implements MigrationInterface {
    name = 'Community1794800000001'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "work_orders" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "title" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'corrective', "provider_id" uuid NOT NULL, "complaint_id" uuid, "scheduled_date" date NOT NULL, "estimated_cost" numeric(14,2), "actual_cost" numeric(14,2), "status" character varying NOT NULL DEFAULT 'planned', "description" text, "notes" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_29f6c1884082ee6f535aed93660" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_70fd0da8f0e58f09a96c17d4e2" ON "work_orders" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_adb8ab8f28ed666347d483fcf6" ON "work_orders" ("residence_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e8ca935c17b08d5b9d0fd53a68" ON "work_orders" ("provider_id") `);
        await queryRunner.query(`CREATE TABLE "assemblies" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "title" character varying NOT NULL, "type" character varying NOT NULL DEFAULT 'ordinary', "date" date NOT NULL, "time" character varying NOT NULL, "location" character varying NOT NULL, "status" character varying NOT NULL DEFAULT 'planned', "agenda" jsonb NOT NULL DEFAULT '[]', "attendance" jsonb NOT NULL DEFAULT '[]', "resolutions" jsonb NOT NULL DEFAULT '[]', "minutes" text NOT NULL DEFAULT '', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_25f742ba403068985d28f3fe0c7" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_88abd6975b439c71bf9b2082f8" ON "assemblies" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f01307cfc45237dfa7b792e80f" ON "assemblies" ("residence_id") `);
        await queryRunner.query(`CREATE TABLE "documents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "name" character varying NOT NULL, "category" character varying NOT NULL, "visibility" character varying NOT NULL DEFAULT 'staff', "file_name" character varying NOT NULL, "storage_key" character varying NOT NULL, "size" integer NOT NULL, "mime" character varying NOT NULL, "sha256" character varying NOT NULL, "uploaded_by" uuid NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_ac51aa5181ee2036f5ca482857c" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5905843a9aa23f27a76a1230aa" ON "documents" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_ed8e0d31bb1a346a3f4d8ee644" ON "documents" ("residence_id") `);
        await queryRunner.query(`ALTER TABLE work_orders ADD CONSTRAINT chk_work_status CHECK (status IN ('planned','in_progress','done','cancelled'))`);
        await queryRunner.query(`ALTER TABLE assemblies ADD CONSTRAINT chk_assembly_status CHECK (status IN ('planned','convened','held','cancelled'))`);
        await queryRunner.query(`ALTER TABLE documents ADD CONSTRAINT chk_doc_visibility CHECK (visibility IN ('all','owners','staff'))`);
        await queryRunner.query(`ALTER TABLE documents ADD CONSTRAINT chk_doc_size CHECK (size > 0 AND size <= 10485760)`);
        // A held assembly is part of the legal record: forbid deleting it at the database level.
        await queryRunner.query(`CREATE FUNCTION protect_held_assemblies() RETURNS trigger AS $$ BEGIN IF OLD.status = 'held' THEN RAISE EXCEPTION 'A held assembly cannot be deleted' USING ERRCODE = 'restrict_violation'; END IF; RETURN OLD; END; $$ LANGUAGE plpgsql`);
        await queryRunner.query(`CREATE TRIGGER assemblies_no_delete_held BEFORE DELETE ON assemblies FOR EACH ROW EXECUTE FUNCTION protect_held_assemblies()`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TRIGGER assemblies_no_delete_held ON assemblies`);
        await queryRunner.query(`DROP FUNCTION protect_held_assemblies()`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ed8e0d31bb1a346a3f4d8ee644"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5905843a9aa23f27a76a1230aa"`);
        await queryRunner.query(`DROP TABLE "documents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f01307cfc45237dfa7b792e80f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_88abd6975b439c71bf9b2082f8"`);
        await queryRunner.query(`DROP TABLE "assemblies"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e8ca935c17b08d5b9d0fd53a68"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_adb8ab8f28ed666347d483fcf6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_70fd0da8f0e58f09a96c17d4e2"`);
        await queryRunner.query(`DROP TABLE "work_orders"`);
        await queryRunner.query(`ALTER TABLE "units" ADD CONSTRAINT "chk_units_tantiemes" CHECK ((tantiemes >= 0))`);
        await queryRunner.query(`ALTER TABLE "expenses" ADD CONSTRAINT "chk_expenses_status" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'paid'::character varying, 'cancelled'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "chk_users_org" CHECK ((((role)::text = 'super_admin'::text) = (org_id IS NULL)))`);
        await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "chk_users_role" CHECK (((role)::text = ANY ((ARRAY['super_admin'::character varying, 'syndic_admin'::character varying, 'manager'::character varying, 'accountant'::character varying, 'owner'::character varying, 'tenant'::character varying, 'provider'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "allocations" ADD CONSTRAINT "chk_allocations_amount" CHECK ((amount > (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_receipt" CHECK ((((status)::text = ANY ((ARRAY['recorded'::character varying, 'reversed'::character varying])::text[])) = (receipt_no IS NOT NULL)))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_status" CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'recorded'::character varying, 'reversed'::character varying, 'rejected'::character varying])::text[])))`);
        await queryRunner.query(`ALTER TABLE "payments" ADD CONSTRAINT "chk_payments_amount" CHECK ((amount > (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "charges" ADD CONSTRAINT "chk_charges_amount" CHECK ((amount > (0)::numeric))`);
        await queryRunner.query(`ALTER TABLE "calls_for_funds" ADD CONSTRAINT "chk_calls_status" CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'issued'::character varying, 'closed'::character varying])::text[])))`);
    }

}
