import { MigrationInterface, QueryRunner } from "typeorm";

export class Notifications1794882532052 implements MigrationInterface {
    name = 'Notifications1794882532052'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notifications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "org_id" uuid NOT NULL, "user_id" uuid NOT NULL, "type" character varying NOT NULL, "params" jsonb NOT NULL DEFAULT '{}', "link" character varying, "dedupe_key" character varying, "read_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_6a72c3c0f683f6462415e653c3a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "UQ_notifications_user_dedupe" ON "notifications" ("user_id", "dedupe_key") WHERE "dedupe_key" IS NOT NULL`);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_user_created" ON "notifications" ("user_id", "created_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_notifications_org" ON "notifications" ("org_id") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_notifications_org"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_notifications_user_created"`);
        await queryRunner.query(`DROP INDEX "public"."UQ_notifications_user_dedupe"`);
        await queryRunner.query(`DROP TABLE "notifications"`);
    }

}
