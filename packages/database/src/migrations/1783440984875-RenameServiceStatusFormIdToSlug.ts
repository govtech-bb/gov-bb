import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Rename `form_id` → `slug` on both service_status tables.
 *
 * The original schema (CreateServiceStatusTables, #1876) named the column
 * `form_id`, but not every service is a form, so the identifier is a generic
 * service slug. This renames the column and its index on both `service_status`
 * and `service_status_audit_log`. Column renames carry the data and the
 * underlying index automatically; the index is renamed only for naming
 * consistency. The `id` uuid primary key and the `service_status_enum` are
 * unchanged.
 */
export class RenameServiceStatusFormIdToSlug1783440984875 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "service_status" RENAME COLUMN "form_id" TO "slug"`,
    );
    await queryRunner.query(
      `ALTER INDEX "ix_service_status_form_id" RENAME TO "ix_service_status_slug"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_status_audit_log" RENAME COLUMN "form_id" TO "slug"`,
    );
    await queryRunner.query(
      `ALTER INDEX "ix_service_status_audit_log_form_id" RENAME TO "ix_service_status_audit_log_slug"`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER INDEX "ix_service_status_audit_log_slug" RENAME TO "ix_service_status_audit_log_form_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_status_audit_log" RENAME COLUMN "slug" TO "form_id"`,
    );
    await queryRunner.query(
      `ALTER INDEX "ix_service_status_slug" RENAME TO "ix_service_status_form_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "service_status" RENAME COLUMN "slug" TO "form_id"`,
    );
  }
}
