import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPendingPaymentSubmissionStatus1777896617226 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "form_submissions_status_enum" ADD VALUE IF NOT EXISTS 'pending_payment'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres does not support DROP VALUE on enum; intentional no-op.
  }
}
