import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Water-outage alerts (Wuh Water Doing? service): two tables.
 *
 * water_subscribers  — who signed up (email + area), their double-opt-in state,
 *                      and their confirm/unsubscribe tokens.
 * water_sent_alerts  — the exactly-once logbook of which notice already went to
 *                      which subscriber (claim-then-send).
 */
export class CreateWaterAlertsTables1785917644000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "water_subscribers_status_enum" AS ENUM('pending', 'confirmed', 'unsubscribed')`,
    );

    await queryRunner.query(`
      CREATE TABLE "water_subscribers" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "email" varchar(320) NOT NULL,
        "area" varchar(100) NOT NULL,
        "status" "water_subscribers_status_enum" NOT NULL DEFAULT 'pending',
        "confirm_token" uuid NOT NULL,
        "unsubscribe_token" uuid NOT NULL,
        "confirmed_at" TIMESTAMP,
        CONSTRAINT "uq_water_subscribers_email_area" UNIQUE ("email", "area"),
        CONSTRAINT "uq_water_subscribers_confirm_token" UNIQUE ("confirm_token"),
        CONSTRAINT "uq_water_subscribers_unsubscribe_token" UNIQUE ("unsubscribe_token")
      )`);

    await queryRunner.query(`
      CREATE TABLE "water_sent_alerts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "notice_id" varchar(512) NOT NULL,
        "subscriber_id" uuid NOT NULL,
        "sent" boolean NOT NULL DEFAULT false,
        CONSTRAINT "uq_water_sent_alerts_notice_subscriber" UNIQUE ("notice_id", "subscriber_id"),
        CONSTRAINT "fk_water_sent_alerts_subscriber" FOREIGN KEY ("subscriber_id")
          REFERENCES "water_subscribers" ("id") ON DELETE CASCADE
      )`);

    // Checker fan-out: match confirmed subscribers for an affected area.
    await queryRunner.query(
      `CREATE INDEX "ix_water_subscribers_status_area" ON "water_subscribers" ("status", "area")`,
    );
    // Checker dedupe lookups by notice.
    await queryRunner.query(
      `CREATE INDEX "ix_water_sent_alerts_notice_id" ON "water_sent_alerts" ("notice_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "water_sent_alerts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "water_subscribers"`);
    await queryRunner.query(
      `DROP TYPE IF EXISTS "water_subscribers_status_enum"`,
    );
  }
}
