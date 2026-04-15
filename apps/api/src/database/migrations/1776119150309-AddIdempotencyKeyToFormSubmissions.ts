import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIdempotencyKeyToFormSubmissions1776119150309 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ADD "idempotency_key" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_submissions" ADD CONSTRAINT "UQ_form_submissions_idempotency_key" UNIQUE ("idempotency_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "form_submissions" DROP CONSTRAINT "UQ_form_submissions_idempotency_key"`,
    );
    await queryRunner.query(
      `ALTER TABLE "form_submissions" DROP COLUMN "idempotency_key"`,
    );
  }
}
