import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Water-outage alerts: water_ops_alerts — what the alert checker has already
 * told the ops team (#2970). One row per signal key ("checker-crash",
 * "send-failures", "skipped-notice:<guid|link>"), shared by every API task and
 * kept across restarts, so a lasting failure is emailed once, reminded, and
 * marked recovered once — not every 30 minutes.
 */
export class CreateWaterOpsAlerts1791536637000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "water_ops_alerts" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP NOT NULL DEFAULT NOW(),
        "key" varchar(300) NOT NULL,
        "failing_since" TIMESTAMP,
        "last_alerted_at" TIMESTAMP,
        CONSTRAINT "uq_water_ops_alerts_key" UNIQUE ("key")
      )`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "water_ops_alerts"`);
  }
}
