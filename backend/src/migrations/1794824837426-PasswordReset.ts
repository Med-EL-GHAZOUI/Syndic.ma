import { MigrationInterface, QueryRunner } from "typeorm";

export class PasswordReset1794824837426 implements MigrationInterface {
    name = 'PasswordReset1794824837426'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "password_resets" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" uuid NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_4816377aa98211c1de34469e742" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_f7a4c3bc48f24df007936d217b" ON "password_resets" ("user_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_323290a9239ad3d397ad78018e" ON "password_resets" ("token_hash") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_323290a9239ad3d397ad78018e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_f7a4c3bc48f24df007936d217b"`);
        await queryRunner.query(`DROP TABLE "password_resets"`);
    }

}
