import { MigrationInterface, QueryRunner } from "typeorm";

export class AddAbandonedPaymentIndex1778195854282 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "ix_payments_abandonment_scan" ON "payments" ("created_at") WHERE "status" IN ('pending', 'initiated')`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "ix_payments_abandonment_scan"`,
    );
  }
}
