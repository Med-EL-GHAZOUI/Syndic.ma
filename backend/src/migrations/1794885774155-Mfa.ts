import { MigrationInterface, QueryRunner } from "typeorm";

export class Mfa1794885774155 implements MigrationInterface {
    name = 'Mfa1794885774155'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" ADD "mfa_secret" text`);
        await queryRunner.query(`ALTER TABLE "users" ADD "mfa_enabled" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "users" ADD "mfa_last_step" integer`);
        await queryRunner.query(`ALTER TABLE "users" ADD "mfa_backup_codes" jsonb NOT NULL DEFAULT '[]'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "mfa_failures" integer NOT NULL DEFAULT '0'`);
        await queryRunner.query(`ALTER TABLE "users" ADD "mfa_locked_until" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_locked_until"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_failures"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_backup_codes"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_last_step"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_enabled"`);
        await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mfa_secret"`);
    }

}
