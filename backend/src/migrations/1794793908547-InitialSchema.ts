import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794793908547 implements MigrationInterface {
    name = 'InitialSchema1794793908547'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "audit_logs" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid, "user_id" uuid, "user_name" character varying, "role" character varying, "action" character varying NOT NULL, "entity" character varying NOT NULL, "entity_id" character varying, "summary" text NOT NULL DEFAULT '', "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_8f3655b4b607ce3e7a3fb90678" ON "audit_logs" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_2cd10fda8276bb995288acfbfb" ON "audit_logs" ("created_at") `);
        await queryRunner.query(`CREATE TABLE "calls_for_funds" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "title" character varying NOT NULL, "period" character varying NOT NULL, "due_date" date NOT NULL, "basis" character varying NOT NULL, "total_amount" numeric(14,2) NOT NULL, "amount_per_unit" numeric(14,2) NOT NULL, "status" character varying NOT NULL DEFAULT 'draft', "issued_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_07134a6e3432fe24745b8c74683" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_6c2086109f3b2a60c66e143ac1" ON "calls_for_funds" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f03377202cb4ac622ebedf9ecb" ON "calls_for_funds" ("residence_id") `);
        await queryRunner.query(`CREATE TABLE "charges" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "call_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "unit_id" uuid NOT NULL, "label" character varying NOT NULL, "amount" numeric(14,2) NOT NULL, "due_date" date NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_0c6feb10df0fa460714f8464dce" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_30a6f62dda139f92ca7ce44b93" ON "charges" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_503d87cdcbecd2779191eab443" ON "charges" ("call_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_f39fc0ef54ef52684491e83112" ON "charges" ("residence_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_d49a46344360da4ab7cfd4a8f3" ON "charges" ("unit_id") `);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "unit_id" uuid NOT NULL, "payer_name" character varying NOT NULL, "amount" numeric(14,2) NOT NULL, "date" date NOT NULL, "method" character varying NOT NULL, "reference" character varying, "note" character varying, "status" character varying NOT NULL DEFAULT 'pending', "verified" boolean NOT NULL DEFAULT false, "receipt_no" character varying, "declared_by" uuid, "created_by" uuid, "confirmed_by" uuid, "reason" character varying, "reversed_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_d35a4bcfefce48d01d271eeb65d" UNIQUE ("org_id", "receipt_no"), CONSTRAINT "PK_197ab7af18c93fbb0c9b28b4a59" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_dc24a985c9c67d76554830da74" ON "payments" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e7aced66beea66b43c9e5b36d1" ON "payments" ("residence_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_85c5a451fd95da85400e6a182f" ON "payments" ("unit_id") `);
        await queryRunner.query(`CREATE TABLE "allocations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "payment_id" uuid NOT NULL, "charge_id" uuid NOT NULL, "amount" numeric(14,2) NOT NULL, CONSTRAINT "PK_ca63099fc248466264af0fa6f1f" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3f9d094e09d8d51e577a434010" ON "allocations" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_467fd0cf5fb8baf11fe5b8daba" ON "allocations" ("payment_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_cb119fab2816cce7ca9195b412" ON "allocations" ("charge_id") `);
        await queryRunner.query(`CREATE TABLE "counters" ("org_id" uuid NOT NULL, "name" character varying NOT NULL, "year" integer NOT NULL, "value" integer NOT NULL DEFAULT '0', CONSTRAINT "PK_9bcbd7c227a2b61d4bb1b748cc7" PRIMARY KEY ("org_id", "name", "year"))`);
        await queryRunner.query(`CREATE TABLE "organizations" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "name" character varying NOT NULL, "city" character varying, "contact_name" character varying, "email" character varying, "phone" character varying, "plan" character varying NOT NULL DEFAULT 'starter', "status" character varying NOT NULL DEFAULT 'trial', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid, "name" character varying NOT NULL, "email" character varying NOT NULL, "password_hash" character varying NOT NULL, "role" character varying NOT NULL, "phone" character varying, "active" boolean NOT NULL DEFAULT true, "residence_ids" uuid array NOT NULL DEFAULT '{}', "provider_id" uuid, "last_login_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_0a13270cd3101fd16b8000e00d" ON "users" ("org_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_97672ac88f789774dd47f7c8be" ON "users" ("email") `);
        await queryRunner.query(`CREATE TABLE "refresh_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "family" uuid NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "revoked_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7d8bee0204106019488c4c50ffa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_3ddc983c5f7bcf132fd8732c3f" ON "refresh_tokens" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_a7838d2ba25be1342091b6695f" ON "refresh_tokens" ("token_hash") `);
        await queryRunner.query(`CREATE INDEX "IDX_968936751ab847471635be8dc0" ON "refresh_tokens" ("family") `);
        await queryRunner.query(`CREATE TABLE "providers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "name" character varying NOT NULL, "category" character varying NOT NULL, "city" character varying, "contact_name" character varying, "phone" character varying, "email" character varying, "ice" character varying, "rating" integer NOT NULL DEFAULT '3', "active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_af13fc2ebf382fe0dad2e4793aa" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_1fb3e0b7ad392bd573508811fb" ON "providers" ("org_id") `);
        await queryRunner.query(`CREATE TABLE "expenses" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "category" character varying NOT NULL, "label" character varying NOT NULL, "amount" numeric(14,2) NOT NULL, "date" date NOT NULL, "invoice_ref" character varying, "provider_id" uuid, "status" character varying NOT NULL DEFAULT 'pending', "paid_at" TIMESTAMP WITH TIME ZONE, "cancel_reason" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_c3280549a9c5a42c2979d6bc93" ON "expenses" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_0984d21ef24b51490f9fcaa3dc" ON "expenses" ("residence_id") `);
        await queryRunner.query(`CREATE TABLE "complaints" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "unit_id" uuid, "author_id" uuid NOT NULL, "title" character varying NOT NULL, "category" character varying NOT NULL, "priority" character varying NOT NULL DEFAULT 'medium', "description" text NOT NULL, "status" character varying NOT NULL DEFAULT 'new', "comments" jsonb NOT NULL DEFAULT '[]', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4b7566a2a489c2cc7c12ed076ad" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_73142297edb8935070ba39596d" ON "complaints" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_28cc085e3fd849dfe2bfe74b70" ON "complaints" ("residence_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_a162885a48bbd67d01d5364fc8" ON "complaints" ("author_id") `);
        await queryRunner.query(`CREATE TABLE "announcements" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "title" character varying NOT NULL, "body" text NOT NULL, "category" character varying NOT NULL DEFAULT 'info', "audience" character varying NOT NULL DEFAULT 'all', "pinned" boolean NOT NULL DEFAULT false, "author_name" character varying NOT NULL, "published_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_b3ad760876ff2e19d58e05dc8b0" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d79defce5bcabc69c4466da086" ON "announcements" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_ba8682a8e05453f19572ea6c16" ON "announcements" ("residence_id") `);
        await queryRunner.query(`CREATE TABLE "residences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "name" character varying NOT NULL, "city" character varying NOT NULL, "address" character varying NOT NULL, "year_built" integer, "monthly_fee" numeric(14,2), "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_505bad416f6552d9481a82385bb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_672b2dd000734ccfcab53c0b2e" ON "residences" ("org_id") `);
        await queryRunner.query(`CREATE TABLE "buildings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "name" character varying NOT NULL, "floors" integer NOT NULL, "elevator" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_a083e5c1cbfa4c4501d78ae949d" UNIQUE ("residence_id", "name"), CONSTRAINT "PK_bc65c1acce268c383e41a69003a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_5786b0ed119fdd5cb4abff752f" ON "buildings" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_6e905da1bd4fb54ef073d4a1f2" ON "buildings" ("residence_id") `);
        await queryRunner.query(`CREATE TABLE "units" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "building_id" uuid NOT NULL, "number" character varying NOT NULL, "floor" integer NOT NULL, "type" character varying NOT NULL DEFAULT 'apartment', "rooms" integer, "area" numeric(8,2) NOT NULL, "tantiemes" integer NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_20f037a6a4c77e90fab3767404c" UNIQUE ("building_id", "number"), CONSTRAINT "PK_5a8f2f064919b587d93936cb223" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_7a394a84ad3a206d0400af9e5f" ON "units" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_c02a67e370c889063c0fd14efe" ON "units" ("residence_id") `);
        await queryRunner.query(`CREATE TABLE "residents" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "residence_id" uuid NOT NULL, "unit_id" uuid NOT NULL, "user_id" uuid, "type" character varying NOT NULL, "first_name" character varying NOT NULL, "last_name" character varying NOT NULL, "phone" character varying, "email" character varying, "since" date NOT NULL, "until" date, "active" boolean NOT NULL DEFAULT true, "lives_in" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_4c8d0413ee0e9a4ebbf500f7365" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_e6374eb347e076c92d673c9e41" ON "residents" ("org_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_bfc0e75639b7a7592366aa84e6" ON "residents" ("residence_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_901dc4e652c738af6d17ddc631" ON "residents" ("unit_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_e7e6da6e7bccd71a8c7d65469c" ON "residents" ("user_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_e7e6da6e7bccd71a8c7d65469c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_901dc4e652c738af6d17ddc631"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_bfc0e75639b7a7592366aa84e6"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e6374eb347e076c92d673c9e41"`);
        await queryRunner.query(`DROP TABLE "residents"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c02a67e370c889063c0fd14efe"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7a394a84ad3a206d0400af9e5f"`);
        await queryRunner.query(`DROP TABLE "units"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6e905da1bd4fb54ef073d4a1f2"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_5786b0ed119fdd5cb4abff752f"`);
        await queryRunner.query(`DROP TABLE "buildings"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_672b2dd000734ccfcab53c0b2e"`);
        await queryRunner.query(`DROP TABLE "residences"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ba8682a8e05453f19572ea6c16"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d79defce5bcabc69c4466da086"`);
        await queryRunner.query(`DROP TABLE "announcements"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a162885a48bbd67d01d5364fc8"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_28cc085e3fd849dfe2bfe74b70"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_73142297edb8935070ba39596d"`);
        await queryRunner.query(`DROP TABLE "complaints"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0984d21ef24b51490f9fcaa3dc"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_c3280549a9c5a42c2979d6bc93"`);
        await queryRunner.query(`DROP TABLE "expenses"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_1fb3e0b7ad392bd573508811fb"`);
        await queryRunner.query(`DROP TABLE "providers"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_968936751ab847471635be8dc0"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_a7838d2ba25be1342091b6695f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3ddc983c5f7bcf132fd8732c3f"`);
        await queryRunner.query(`DROP TABLE "refresh_tokens"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97672ac88f789774dd47f7c8be"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_0a13270cd3101fd16b8000e00d"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "organizations"`);
        await queryRunner.query(`DROP TABLE "counters"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cb119fab2816cce7ca9195b412"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_467fd0cf5fb8baf11fe5b8daba"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3f9d094e09d8d51e577a434010"`);
        await queryRunner.query(`DROP TABLE "allocations"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_85c5a451fd95da85400e6a182f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_e7aced66beea66b43c9e5b36d1"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dc24a985c9c67d76554830da74"`);
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d49a46344360da4ab7cfd4a8f3"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f39fc0ef54ef52684491e83112"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_503d87cdcbecd2779191eab443"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_30a6f62dda139f92ca7ce44b93"`);
        await queryRunner.query(`DROP TABLE "charges"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f03377202cb4ac622ebedf9ecb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6c2086109f3b2a60c66e143ac1"`);
        await queryRunner.query(`DROP TABLE "calls_for_funds"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_2cd10fda8276bb995288acfbfb"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_8f3655b4b607ce3e7a3fb90678"`);
        await queryRunner.query(`DROP TABLE "audit_logs"`);
    }

}
