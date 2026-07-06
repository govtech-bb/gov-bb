import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Database-driven service visibility state.
 *
 * - service_status: one row per form holding its current state.
 *   `enabled` = fully live; `form_disabled` = service page visible but the
 *   form unreachable; `disabled` = service hidden from the public (viewable
 *   with the preview token). No row for a form_id means the consuming app
 *   layer decides the default.
 * - service_status_audit_log: append-only history of state changes.
 *   old_state is NULL for a form's first-ever entry.
 */
export class CreateServiceStatusTables1783356461699 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "service_status_enum" AS ENUM('enabled', 'form_disabled', 'disabled')`,
    );

    await queryRunner.query(`
      CREATE TABLE "service_status" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "form_id" varchar(100) NOT NULL,
        "status" "service_status_enum" NOT NULL DEFAULT 'enabled'
      )`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "ix_service_status_form_id" ON "service_status" ("form_id")`,
    );

    await queryRunner.query(`
      CREATE TABLE "service_status_audit_log" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "form_id" varchar(100) NOT NULL,
        "old_state" "service_status_enum",
        "new_state" "service_status_enum" NOT NULL,
        "author" varchar(255) NOT NULL,
        "changed_at" TIMESTAMP NOT NULL DEFAULT NOW()
      )`);
    await queryRunner.query(
      `CREATE INDEX "ix_service_status_audit_log_form_id" ON "service_status_audit_log" ("form_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "service_status_audit_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "service_status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "service_status_enum"`);
  }
}
