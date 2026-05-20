import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePaymentTables1777896888080 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "payments_provider_enum" AS ENUM ('ezpay')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payments_status_enum" AS ENUM ('pending', 'initiated', 'success', 'failed', 'cancelled', 'mismatched', 'refunded')`,
    );
    await queryRunner.query(
      `CREATE TYPE "payment_transactions_status_enum" AS ENUM ('initiated', 'success', 'failed')`,
    );

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "reference_number" uuid NOT NULL,
        "submission_id" uuid NOT NULL,
        "form_id" varchar(100) NOT NULL,
        "provider" "payments_provider_enum" NOT NULL,
        "department" varchar(100) NOT NULL,
        "payment_code" varchar(100) NOT NULL,
        "expected_amount" decimal(10,2) NOT NULL,
        "description" varchar(500) NOT NULL,
        "provider_token" varchar(255),
        "provider_url" text,
        "status" "payments_status_enum" NOT NULL DEFAULT 'pending'
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_payments_reference_number" ON "payments" ("reference_number")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_payments_submission_id" ON "payments" ("submission_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "payment_transactions" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "payment_id" uuid NOT NULL,
        "transaction_number" varchar(100) NOT NULL,
        "processor" varchar(50),
        "status" "payment_transactions_status_enum" NOT NULL,
        "amount" decimal(10,2) NOT NULL,
        "date_settled" TIMESTAMP,
        "raw_response" jsonb
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_pt_transaction_number" ON "payment_transactions" ("transaction_number")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_pt_payment_id" ON "payment_transactions" ("payment_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_pt_status" ON "payment_transactions" ("status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "payment_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "payments"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "payment_transactions_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "payments_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "payments_provider_enum"`);
  }
}
