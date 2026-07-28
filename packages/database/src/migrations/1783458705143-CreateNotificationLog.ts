import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * notification_log — one row per submission-notification email send attempt,
 * written by the API at send time (see EmailProcessor). Makes undelivered MDA
 * notifications visible and recoverable, and is the substrate a future
 * SES-event consumer reconciles delivery truth onto (provider_message_id join
 * key, delivery_status column — both nullable until that consumer exists).
 */
export class CreateNotificationLog1783458705143 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "notification_outcome_enum" AS ENUM('sent', 'failed', 'defaulted', 'no_recipient')`,
    );
    await queryRunner.query(
      `CREATE TYPE "notification_delivery_status_enum" AS ENUM('delivered', 'bounced', 'complained', 'rejected')`,
    );

    await queryRunner.query(`
      CREATE TABLE "notification_log" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "submission_id" varchar(64) NOT NULL,
        "form_id" varchar(100) NOT NULL,
        "reference_code" varchar(64),
        "recipient_kind" varchar(20) NOT NULL,
        "recipient" varchar(320),
        "outcome" "notification_outcome_enum" NOT NULL,
        "error" text,
        "provider_message_id" varchar(255),
        "delivery_status" "notification_delivery_status_enum"
      )`);

    await queryRunner.query(
      `CREATE INDEX "ix_notification_log_submission_id" ON "notification_log" ("submission_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notification_log_form_id" ON "notification_log" ("form_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "ix_notification_log_outcome" ON "notification_log" ("outcome")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_log"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "notification_delivery_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "notification_outcome_enum"`);
  }
}
